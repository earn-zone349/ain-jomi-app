// Assistant client. Two parts:
//  1. searchLocal(): searches the verified passages that ship inside the app (public/data/ai-corpus.json). Works offline.
//  2. ask(): sends the question to the Supabase Edge Function "ask", which returns an answer written ONLY from verified
//     passages (each with its source), or just the matching passages. No account is needed; a random device id and the
//     phone's IP only count the daily questions. The question is not stored.

import { CONFIG, SUPABASE_CONFIGURED } from '../config.js';
import { getString, setString } from './storage.js';
import { buildIndex, search, publicPassage, cleanQuestion } from '../lib/ai-core.js';

let index = null;
let loading = null;

export function loadIndex() {
  if (index) return Promise.resolve(index);
  if (!loading) {
    loading = fetch('./data/ai-corpus.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`ai-corpus: HTTP ${r.status}`);
        return r.json();
      })
      .then((list) => {
        index = buildIndex(list);
        return index;
      })
      .catch((e) => {
        loading = null;
        throw e;
      });
  }
  return loading;
}

/** Best matching verified passages, in `lang`. */
export async function searchLocal(question, lang, k = 5) {
  const q = cleanQuestion(question);
  if (!q) return [];
  const idx = await loadIndex();
  return search(idx, q, k).map((h) => publicPassage(h.p, lang));
}

export function deviceId() {
  let id = getString('aiDevice', '');
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(id || '')) {
    id = (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`).slice(0, 64);
    setString('aiDevice', id);
  }
  return id;
}

export const canAsk = () => SUPABASE_CONFIGURED && typeof navigator !== 'undefined' && navigator.onLine !== false;

/**
 * Resolves to the function's JSON ({ ok:true, mode:'answer'|'passages', ... } or { ok:false, error }).
 * Never rejects: a network problem is { ok:false, error:'offline' }.
 */
export async function ask(question, lang) {
  const q = cleanQuestion(question);
  if (!q) return { ok: false, error: 'bad_request' };
  if (!canAsk()) return { ok: false, error: 'offline' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(`${CONFIG.supabaseUrl}/functions/v1/ask`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', apikey: CONFIG.supabaseAnonKey, authorization: `Bearer ${CONFIG.supabaseAnonKey}` },
      body: JSON.stringify({ q, lang, device: deviceId() }),
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (json && typeof json === 'object' && 'ok' in json) return json;
    return { ok: false, error: res.status === 404 ? 'disabled' : 'unavailable' };
  } catch {
    return { ok: false, error: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}
