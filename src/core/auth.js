// Authentication state. Three modes: guest (no account), signed in, and "not configured"
// (build without Supabase credentials). Most of the app works for guests.

import { supabase } from './supabase.js';
import { CONFIG } from '../config.js';
import { getString, setString, remove } from './storage.js';

const state = {
  ready: false,
  session: null,
  user: null,
  profile: null, // { id, full_name, role, preferred_lang }
};

const listeners = new Set();

function emit() {
  listeners.forEach((fn) => {
    try {
      fn(getAuth());
    } catch {
      /* ignore bad listener */
    }
  });
}

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getAuth() {
  return {
    ready: state.ready,
    signedIn: Boolean(state.user),
    user: state.user,
    profile: state.profile,
    role: state.profile?.role || 'user',
    email: state.user?.email || '',
  };
}

async function loadProfile() {
  if (!supabase || !state.user) {
    state.profile = null;
    return;
  }
  const { data } = await supabase.from('profiles').select('id,full_name,role,preferred_lang').eq('id', state.user.id).maybeSingle();
  state.profile = data || null;
}

export async function initAuth() {
  if (!supabase) {
    state.ready = true;
    emit();
    return;
  }
  try {
    const { data } = await supabase.auth.getSession();
    state.session = data.session;
    state.user = data.session?.user || null;
    await loadProfile();
  } catch {
    /* offline at start-up: stay signed out until the next event */
  }
  state.ready = true;
  emit();

  supabase.auth.onAuthStateChange((event, session) => {
    // Do not await supabase calls inside this callback (deadlock risk): defer.
    setTimeout(async () => {
      state.session = session;
      state.user = session?.user || null;
      if (event === 'SIGNED_OUT') state.profile = null;
      else await loadProfile();
      emit();
    }, 0);
  });
}

/** Result shape: { ok: true } or { ok: false, error } (error is a Supabase error object). */
export async function signIn(email, password) {
  if (!supabase) return { ok: false, error: new Error('not configured') };
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  return error ? { ok: false, error } : { ok: true };
}

/** needsConfirmation is true when Supabase requires the email to be confirmed before sign-in. */
export async function signUp(email, password, fullName) {
  if (!supabase) return { ok: false, error: new Error('not configured') };
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { full_name: (fullName || '').trim().slice(0, 120) } },
  });
  if (error) return { ok: false, error };
  // An existing confirmed address returns a user with no identities (Supabase hides enumeration).
  const identities = data.user?.identities;
  if (Array.isArray(identities) && identities.length === 0) {
    return { ok: false, error: new Error('User already registered') };
  }
  return { ok: true, needsConfirmation: !data.session };
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function requestPasswordReset(email) {
  if (!supabase) return { ok: false, error: new Error('not configured') };
  const redirectTo = CONFIG.webBaseUrl ? `${CONFIG.webBaseUrl}/reset-password/` : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), redirectTo ? { redirectTo } : undefined);
  return error ? { ok: false, error } : { ok: true };
}

/** Permanently delete the signed-in user's account (server-side function, see schema.sql). */
export async function deleteMyAccount() {
  if (!supabase) return { ok: false, error: new Error('not configured') };
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return { ok: false, error };
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    /* the account is already gone server-side */
  }
  return { ok: true };
}

export async function updateProfileName(fullName) {
  if (!supabase || !state.user) return { ok: false, error: new Error('not signed in') };
  const clean = fullName.trim().slice(0, 120) || null;
  const { error } = await supabase.from('profiles').update({ full_name: clean }).eq('id', state.user.id);
  if (error) return { ok: false, error };
  await loadProfile();
  emit();
  return { ok: true };
}

export function isStaff() {
  return state.profile?.role === 'editor' || state.profile?.role === 'admin';
}

// Guest flag: remembers the user chose "continue without an account" so we do not nag.
export function isGuestChosen() {
  return getString('guest', '0') === '1';
}
export function setGuestChosen(value) {
  if (value) setString('guest', '1');
  else remove('guest');
}
