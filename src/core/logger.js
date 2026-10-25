// Error reporting: rate-limited, de-duplicated, size-limited, never throws.
// Reports contain only the error message, a short stack, app version, platform and a small
// context object. No names, emails or what the user was reading.

import { supabase } from './supabase.js';
import { CONFIG } from '../config.js';
import { platformName } from './platform.js';
import { getJSON, setJSON } from './storage.js';

const MAX_PER_SESSION = 10;
const MAX_QUEUE = 20;
const seen = new Set();
let sent = 0;

function clip(value, max) {
  const s = String(value ?? '');
  return s.length > max ? s.slice(0, max) : s;
}

function buildRecord(error, context) {
  const message = clip(error?.message || error || 'unknown error', 1000);
  const stack = error?.stack ? clip(error.stack, 4000) : null;
  let ctx = null;
  try {
    const json = JSON.stringify(context ?? {});
    ctx = json.length <= 3500 ? context : { note: 'context too large' };
  } catch {
    ctx = null;
  }
  return {
    message,
    stack,
    context: ctx,
    app_version: clip(CONFIG.appVersion, 30),
    platform: clip(platformName(), 30),
  };
}

async function send(records) {
  if (!supabase || !records.length) return false;
  const { error } = await supabase.from('error_logs').insert(records);
  return !error;
}

/** Report an error. Safe to call from anywhere, including inside catch blocks. */
export async function logError(error, context = {}) {
  try {
    const rec = buildRecord(error, context);
    if (seen.has(rec.message) || sent >= MAX_PER_SESSION) return;
    seen.add(rec.message);
    sent += 1;
    if (typeof console !== 'undefined') console.error('[ain-jomi]', rec.message, context);
    const ok = navigator.onLine ? await send([rec]) : false;
    if (!ok) {
      const queue = getJSON('errq', []);
      queue.push(rec);
      setJSON('errq', queue.slice(-MAX_QUEUE));
    }
  } catch {
    /* logging must never break the app */
  }
}

/** Try to deliver errors queued while offline. Call when connectivity returns. */
export async function flushErrorQueue() {
  try {
    const queue = getJSON('errq', []);
    if (!queue.length || !navigator.onLine) return;
    if (await send(queue)) setJSON('errq', []);
  } catch {
    /* ignore */
  }
}

export function installGlobalHandlers() {
  window.addEventListener('error', (e) => {
    logError(e.error || new Error(e.message), { where: 'window.onerror' });
  });
  window.addEventListener('unhandledrejection', (e) => {
    logError(e.reason instanceof Error ? e.reason : new Error(String(e.reason)), { where: 'unhandledrejection' });
  });
  window.addEventListener('online', flushErrorQueue);
}
