// Offline-first content repository.
//
//  * Everything the UI reads comes from an in-memory index that is loaded from IndexedDB at start-up,
//    so screens work with no connection at all.
//  * syncContent() asks the server for content_meta (a version number + epoch). If nothing changed it stops
//    after one tiny request. Otherwise it pulls only rows changed since the last sync (keyset pagination by
//    updated_at, id) and applies them. Archived rows are tombstones: they are removed from the cache.
//  * A new epoch (hard delete on the server) wipes the cache and resyncs from scratch.

import { supabase } from './supabase.js';
import { CONFIG } from '../config.js';
import * as idb from './idb.js';
import { getJSON, setJSON } from './storage.js';
import { CONTENT_TABLES, keysetFilter, maxUpdatedAt, partitionByStatus, sinceFromCursor, isNoticeActive } from '../lib/sync-core.js';
import { normalizeText } from '../lib/text.js';
import { LEGAL } from '../generated/legal.js';

const mem = Object.fromEntries(CONTENT_TABLES.map((t) => [t, new Map()]));
const listeners = new Set();
let settings = {};
let haystacks = null; // lazily built search index, reset on every change
let inflight = null;

const status = {
  ready: false,
  syncing: false,
  lastSyncAt: null, // ISO string of last *successful* check with the server
  lastError: null, // 'offline' | 'not_configured' | 'failed' | null
  hasContent: false,
};

function emit() {
  haystacks = null;
  status.hasContent = mem.laws.size > 0 || mem.categories.size > 0;
  listeners.forEach((fn) => {
    try {
      fn(getStatus());
    } catch {
      /* a bad listener must not break sync */
    }
  });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getStatus() {
  return { ...status };
}

// ---------------------------------------------------------------------------------------------
// Loading from disk
// ---------------------------------------------------------------------------------------------
export async function initContent() {
  for (const table of CONTENT_TABLES) {
    const rows = await idb.getAll(table);
    mem[table].clear();
    for (const r of rows) mem[table].set(r.id, r);
  }
  settings = (await idb.getMeta('settings', {})) || {};
  status.lastSyncAt = await idb.getMeta('lastSyncAt', null);
  status.ready = true;
  emit();
}

// ---------------------------------------------------------------------------------------------
// Syncing
// ---------------------------------------------------------------------------------------------
async function fetchSettings() {
  const { data, error } = await supabase.from('app_settings').select('key,value');
  if (error) throw error;
  const next = {};
  for (const row of data || []) next[row.key] = row.value;
  settings = next;
  await idb.setMeta('settings', next);
}

async function pullTable(table) {
  const pageSize = CONFIG.syncPageSize;
  let cursor = await idb.getMeta(`cursor:${table}`, null);
  const since = sinceFromCursor(cursor);
  let last = null;

  for (;;) {
    let query = supabase.from(table).select('*').order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(pageSize);
    const filter = keysetFilter(since, last);
    if (filter) query = query.or(filter);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    if (rows.length) {
      const { keep, drop } = partitionByStatus(rows);
      await idb.putMany(table, keep);
      await idb.deleteMany(table, drop);
      for (const r of keep) mem[table].set(r.id, r);
      for (const id of drop) mem[table].delete(id);
      cursor = maxUpdatedAt(rows, cursor);
      await idb.setMeta(`cursor:${table}`, cursor);
      last = { updated_at: rows[rows.length - 1].updated_at, id: rows[rows.length - 1].id };
    }
    if (rows.length < pageSize) break;
  }
}

async function runSync(force) {
  if (!supabase) {
    status.lastError = 'not_configured';
    return { ok: false, reason: 'not_configured' };
  }
  if (!navigator.onLine) {
    status.lastError = 'offline';
    return { ok: false, reason: 'offline' };
  }

  const { data: meta, error: metaErr } = await supabase.from('content_meta').select('content_version,epoch').eq('id', 1).maybeSingle();
  if (metaErr) throw metaErr;
  if (!meta) throw new Error('content_meta row missing: has supabase/schema.sql been run?');

  await fetchSettings();

  const cachedEpoch = await idb.getMeta('epoch', null);
  let cachedVersion = await idb.getMeta('version', null);
  if (cachedEpoch !== null && cachedEpoch !== meta.epoch) {
    await idb.clearContent();
    for (const table of CONTENT_TABLES) {
      mem[table].clear();
      await idb.setMeta(`cursor:${table}`, null);
    }
    cachedVersion = null;
  }

  const nowIso = new Date().toISOString();
  if (!force && cachedVersion === meta.content_version) {
    status.lastSyncAt = nowIso;
    await idb.setMeta('lastSyncAt', nowIso);
    return { ok: true, changed: false };
  }

  for (const table of CONTENT_TABLES) await pullTable(table);

  await idb.setMeta('epoch', meta.epoch);
  await idb.setMeta('version', meta.content_version);
  status.lastSyncAt = nowIso;
  await idb.setMeta('lastSyncAt', nowIso);
  return { ok: true, changed: true };
}

/**
 * Sync with the server. Concurrent calls share one run. Never throws; inspect the result.
 * Unless force is set, skips if a successful check happened within syncMinIntervalMs.
 */
export function syncContent({ force = false } = {}) {
  if (inflight) return inflight;
  if (supabase && !navigator.onLine) {
    // Report "offline" even when the throttle below would skip the check, so the UI never claims freshness.
    if (status.lastError !== 'offline') {
      status.lastError = 'offline';
      emit();
    }
    return Promise.resolve({ ok: false, reason: 'offline' });
  }
  if (!force && status.lastSyncAt && Date.now() - Date.parse(status.lastSyncAt) < CONFIG.syncMinIntervalMs) {
    return Promise.resolve({ ok: true, changed: false, skipped: true });
  }
  status.syncing = true;
  status.lastError = null;
  emit();
  inflight = runSync(force)
    .catch((err) => {
      status.lastError = navigator.onLine ? 'failed' : 'offline';
      return { ok: false, reason: status.lastError, error: err };
    })
    .then((result) => {
      status.syncing = false;
      inflight = null;
      emit();
      return result;
    });
  return inflight;
}

export async function clearOfflineData() {
  await idb.clearAll();
  for (const table of CONTENT_TABLES) mem[table].clear();
  settings = {};
  status.lastSyncAt = null;
  emit();
}

// ---------------------------------------------------------------------------------------------
// Queries (all synchronous, from memory)
// ---------------------------------------------------------------------------------------------
const byOrder = (a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100);
const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });

export function getSettings() {
  return settings;
}

export function getSetting(key, fallback = null) {
  return key in settings ? settings[key] : fallback;
}

export function getCategories() {
  return [...mem.categories.values()].sort((a, b) => byOrder(a, b) || natural(a.slug, b.slug));
}

export function getCategory(id) {
  return mem.categories.get(id) || null;
}

export function getLaws({ categoryId = null } = {}) {
  let laws = [...mem.laws.values()];
  if (categoryId) laws = laws.filter((l) => l.category_id === categoryId);
  return laws.sort((a, b) => natural(a.title_en || a.title_bn, b.title_en || b.title_bn));
}

export function getLaw(id) {
  return mem.laws.get(id) || null;
}

export function getLawCount() {
  return mem.laws.size;
}

export function getSections(lawId) {
  return [...mem.law_sections.values()].filter((s) => s.law_id === lawId).sort((a, b) => byOrder(a, b) || natural(a.section_no, b.section_no));
}

export function getFaqs(categoryId = null) {
  let rows = [...mem.faqs.values()];
  if (categoryId) rows = rows.filter((f) => f.category_id === categoryId);
  return rows.sort(byOrder);
}

export function getNotices(now = Date.now()) {
  return [...mem.notices.values()]
    .filter((n) => isNoticeActive(n, now))
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

/** Server copy if synced, otherwise the text bundled into the app (so legal pages always work offline). */
export function getLegalPage(slug) {
  const cached = [...mem.legal_pages.values()].find((p) => p.slug === slug);
  if (cached) return cached;
  const b = LEGAL[slug];
  if (!b) return null;
  return { slug, version: b.version, title_bn: b.title.bn, title_en: b.title.en, body_bn: b.body.bn, body_en: b.body.en };
}

function buildHaystacks() {
  const bySection = new Map();
  for (const s of mem.law_sections.values()) {
    const parts = [s.section_no, s.heading_bn, s.heading_en, s.text_bn, s.text_en, s.explain_bn, s.explain_en];
    const arr = bySection.get(s.law_id) || [];
    arr.push(parts.filter(Boolean).join(' '));
    bySection.set(s.law_id, arr);
  }
  const out = new Map();
  for (const l of mem.laws.values()) {
    const title = normalizeText([l.title_bn, l.title_en, l.act_number, l.year].filter(Boolean).join(' '));
    const body = normalizeText([l.summary_bn, l.summary_en, ...(bySection.get(l.id) || [])].filter(Boolean).join(' '));
    out.set(l.id, { title, body });
  }
  return out;
}

/** Simple offline search over law titles, summaries and section text. Title matches rank first. */
export function searchLaws(query, { categoryId = null } = {}) {
  const q = normalizeText(query);
  if (!q) return getLaws({ categoryId });
  if (!haystacks) haystacks = buildHaystacks();
  const words = q.split(' ');
  const results = [];
  for (const law of getLaws({ categoryId })) {
    const h = haystacks.get(law.id);
    if (!h) continue;
    const inTitle = words.every((w) => h.title.includes(w));
    const inAll = words.every((w) => h.title.includes(w) || h.body.includes(w));
    if (inTitle) results.push({ law, rank: 0 });
    else if (inAll) results.push({ law, rank: 1 });
  }
  results.sort((a, b) => a.rank - b.rank);
  return results.map((r) => r.law);
}

// ---------------------------------------------------------------------------------------------
// Small persisted UI state related to content
// ---------------------------------------------------------------------------------------------
export function getDismissedNotices() {
  return new Set(getJSON('dismissedNotices', []));
}

export function dismissNotice(id) {
  const s = getDismissedNotices();
  s.add(id);
  setJSON('dismissedNotices', [...s].slice(-100));
}
