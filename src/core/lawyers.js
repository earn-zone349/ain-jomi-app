// Lawyer directory data access (Supabase). Online only: the list is not cached offline, because a stale list could
// show someone who has since been suspended.

import { supabase } from './supabase.js';
import { PUBLIC_COLUMNS, SIGNED_IN_COLUMNS } from '../lib/lawyers-core.js';

const MAX_ROWS = 1000;

/** Verified lawyers from the public view. Signed-in users also get contact details (the database hides them from guests). */
export async function listVerified(signedIn) {
  if (!supabase) return { data: null, error: new Error('Failed to fetch') };
  return supabase.from('lawyers_public').select(signedIn ? SIGNED_IN_COLUMNS : PUBLIC_COLUMNS).limit(MAX_ROWS);
}

/** The signed-in user's own application (any status), or null. */
export async function getMine(userId) {
  if (!supabase) return { data: null, error: new Error('Failed to fetch') };
  return supabase.from('lawyer_profiles').select('*').eq('user_id', userId).maybeSingle();
}

/** Creates or updates the user's one application. The database decides the status; the app never sends one. */
export async function saveMine(existing, clean) {
  if (!supabase) return { error: new Error('Failed to fetch') };
  if (existing) return supabase.from('lawyer_profiles').update(clean).eq('id', existing.id);
  return supabase.from('lawyer_profiles').insert(clean);
}

export async function withdrawMine(id) {
  if (!supabase) return { error: new Error('Failed to fetch') };
  return supabase.from('lawyer_profiles').delete().eq('id', id);
}

export async function reportLawyer(lawyerId, message) {
  if (!supabase) return { error: new Error('Failed to fetch') };
  return supabase.from('reports').insert({ target_type: 'lawyer', target_id: lawyerId, message: String(message).slice(0, 1000) });
}
