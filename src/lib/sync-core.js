// Pure helpers for incremental content sync. Unit-tested in tests/sync-core.test.js.

/** Re-read this much history on every sync, so rows committed late by a slow transaction are not missed. */
export const OVERLAP_MS = 2 * 60 * 1000;

/** Content tables, in dependency order (parents first). */
export const CONTENT_TABLES = ['categories', 'laws', 'law_sections', 'faqs', 'notices', 'legal_pages'];

/**
 * Starting point for an incremental pull: the stored high-water mark minus the overlap.
 * Returns null for "pull everything".
 */
export function sinceFromCursor(cursorIso, overlapMs = OVERLAP_MS) {
  if (!cursorIso) return null;
  const t = Date.parse(cursorIso);
  if (Number.isNaN(t)) return null;
  return new Date(t - overlapMs).toISOString();
}

/**
 * PostgREST filter for keyset pagination ordered by (updated_at, id).
 * `since` applies to the first page; `last` ({updated_at, id}) to the following pages.
 * Values are double-quoted so ":" and "+" in timestamps are safe inside or().
 */
export function keysetFilter(since, last) {
  if (last) {
    const ts = `"${last.updated_at}"`;
    return `updated_at.gt.${ts},and(updated_at.eq.${ts},id.gt.${last.id})`;
  }
  if (since) return `updated_at.gte."${since}"`;
  return null;
}

/** Highest updated_at in a batch (ISO strings compare correctly as dates, not as text, so parse). */
export function maxUpdatedAt(rows, current = null) {
  let best = current;
  let bestT = current ? Date.parse(current) : -Infinity;
  for (const r of rows) {
    const t = Date.parse(r.updated_at);
    if (!Number.isNaN(t) && t > bestT) {
      bestT = t;
      best = r.updated_at;
    }
  }
  return best;
}

/**
 * Split fetched rows into rows to keep and ids to drop from the offline cache.
 * Server exposes 'published' and 'archived'; archived rows are tombstones.
 */
export function partitionByStatus(rows) {
  const keep = [];
  const drop = [];
  for (const r of rows) {
    if (r.status === 'published') keep.push(r);
    else drop.push(r.id);
  }
  return { keep, drop };
}

/** Notices are shown only inside their optional [starts_at, ends_at] window. */
export function isNoticeActive(notice, now = Date.now()) {
  if (!notice || notice.status !== 'published') return false;
  if (notice.starts_at && Date.parse(notice.starts_at) > now) return false;
  if (notice.ends_at && Date.parse(notice.ends_at) < now) return false;
  return true;
}
