// Offline-first content repository.
//
//  Two kinds of content:
//   1. Laws and categories are plain JSON files that ship inside the app (public/data, built by
//      scripts/build-laws.mjs). They need no network and no database. To change a law you edit its JSON file
//      and build a new APK.
//   2. FAQs, notices and legal pages (Terms/Privacy) are edited in the admin panel and live in Supabase. They are
//      synced below and cached in IndexedDB.
//
//  Details of the Supabase sync:
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
// Bundled catalogue (JSON files shipped inside the app).
const catalog = { categories: new Map(), laws: new Map(), version: null };
const sectionsCache = new Map(); // slug -> sections[]
const sectionsLoading = new Map(); // slug -> Promise
let searchIndex = null; // { slug: { b: bodyText, k: keywordText } }
let searchLoading = null;
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
  status.hasContent = catalog.laws.size > 0 || catalog.categories.size > 0;
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
async function fetchJson(path) {
  const res = await fetch(`./data/${path}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function loadCatalog() {
  try {
    const index = await fetchJson('index.json');
    catalog.categories = new Map(index.categories.map((c) => [c.id, c]));
    catalog.laws = new Map(index.laws.map((l) => [l.id, l]));
    catalog.version = index.version;
  } catch (err) {
    // The catalogue ships inside the app, so this means a broken build, not a network problem.
    status.lastError = status.lastError || 'failed';
    console.error('law catalogue could not be loaded', err);
  }
}

/** Loads the sections of one law (from the app bundle) and caches them. Resolves to the list. */
export function loadSections(slug) {
  if (sectionsCache.has(slug)) return Promise.resolve(sectionsCache.get(slug));
  if (sectionsLoading.has(slug)) return sectionsLoading.get(slug);
  const p = fetchJson(`laws/${encodeURIComponent(slug)}.json`)
    .then((doc) => {
      sectionsCache.set(slug, doc.sections || []);
      return sectionsCache.get(slug);
    })
    .finally(() => sectionsLoading.delete(slug));
  sectionsLoading.set(slug, p);
  return p;
}

/** Loads the full-text search index once. Until then, search matches titles and summaries only. */
export function loadSearchIndex() {
  if (searchIndex) return Promise.resolve(searchIndex);
  if (!searchLoading) {
    searchLoading = fetchJson('search.json')
      .then((doc) => {
        searchIndex = doc;
        haystacks = null;
        emit();
        return doc;
      })
      .catch(() => {
        searchLoading = null;
        return null;
      });
  }
  return searchLoading;
}

export async function initContent() {
  await loadCatalog();
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
  return [...catalog.categories.values()].sort((a, b) => byOrder(a, b) || natural(a.slug, b.slug));
}

export function getCategory(id) {
  return catalog.categories.get(id) || null;
}

export function getLaws({ categoryId = null } = {}) {
  let laws = [...catalog.laws.values()];
  if (categoryId) laws = laws.filter((l) => l.category_id === categoryId);
  return laws.sort((a, b) => natural(a.title_en || a.title_bn, b.title_en || b.title_bn));
}

export function getLaw(id) {
  return catalog.laws.get(id) || null;
}

export function getLawCount(categoryId = null) {
  if (!categoryId) return catalog.laws.size;
  let n = 0;
  for (const l of catalog.laws.values()) if (l.category_id === categoryId) n += 1;
  return n;
}

/** Sections already loaded for a law (empty until loadSections() has resolved). */
export function getSections(lawId) {
  return sectionsCache.get(lawId) || [];
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
  const out = new Map();
  for (const l of catalog.laws.values()) {
    const title = normalizeText([l.title_bn, l.title_en, l.act_number, l.year, searchIndex?.[l.id]?.k].filter(Boolean).join(' '));
    const body = normalizeText([l.summary_bn, l.summary_en, searchIndex?.[l.id]?.b].filter(Boolean).join(' '));
    out.set(l.id, { title, body });
  }
  return out;
}

/** Offline search over law titles, keywords, summaries and (once the index is loaded) section text. Title matches rank first. */
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
