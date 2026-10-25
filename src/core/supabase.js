// Supabase client (created once). `supabase` is null when the build has no credentials;
// callers must handle that (the app then runs from the offline cache only).

import { createClient } from '@supabase/supabase-js';
import { CONFIG, SUPABASE_CONFIGURED } from '../config.js';

export const supabase = SUPABASE_CONFIGURED
  ? createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // We use hash routing (#/path). Letting supabase parse the URL hash would clash with it.
        detectSessionInUrl: false,
      },
      global: { headers: { 'x-client-info': `ain-jomi/${CONFIG.appVersion}` } },
    })
  : null;

/** Turn a Supabase/PostgREST/network error into a short stable code the UI can translate. */
export function errorCode(err) {
  if (!err) return 'unknown';
  const msg = String(err.message || err).toLowerCase();
  const code = String(err.code || '');
  if (!navigator.onLine || msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed')) {
    return 'offline';
  }
  if (msg.includes('invalid login credentials')) return 'badCredentials';
  if (msg.includes('email not confirmed')) return 'emailNotConfirmed';
  if (msg.includes('already registered') || msg.includes('already been registered')) return 'emailTaken';
  if (msg.includes('rate limit') || err.status === 429) return 'rateLimited';
  if (msg.includes('password') && (msg.includes('weak') || msg.includes('at least'))) return 'weakPassword';
  if (code === '42501' || msg.includes('row-level security') || msg.includes('permission denied')) return 'forbidden';
  return 'unknown';
}
