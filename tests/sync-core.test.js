import test from 'node:test';
import assert from 'node:assert/strict';
import { sinceFromCursor, keysetFilter, maxUpdatedAt, partitionByStatus, isNoticeActive, OVERLAP_MS, CONTENT_TABLES } from '../src/lib/sync-core.js';

test('sinceFromCursor subtracts the safety overlap', () => {
  assert.equal(sinceFromCursor(null), null);
  assert.equal(sinceFromCursor('garbage'), null);
  const since = sinceFromCursor('2026-10-22T10:00:00.000Z');
  assert.equal(Date.parse('2026-10-22T10:00:00.000Z') - Date.parse(since), OVERLAP_MS);
});

test('keysetFilter: first page, later page, full sync', () => {
  assert.equal(keysetFilter(null, null), null);
  assert.equal(keysetFilter('2026-10-22T10:00:00.000Z', null), 'updated_at.gte."2026-10-22T10:00:00.000Z"');
  const f = keysetFilter('x', { updated_at: '2026-10-22T10:00:00+00:00', id: 'abc' });
  assert.equal(f, 'updated_at.gt."2026-10-22T10:00:00+00:00",and(updated_at.eq."2026-10-22T10:00:00+00:00",id.gt.abc)');
});

test('maxUpdatedAt compares as dates, not text', () => {
  // "+00:00" and "Z" spellings and different precision must not confuse ordering
  const rows = [{ updated_at: '2026-10-22T10:00:00.5+00:00' }, { updated_at: '2026-10-22T10:00:00.123456+00:00' }, { updated_at: '2026-10-21T23:59:59Z' }];
  assert.equal(maxUpdatedAt(rows), '2026-10-22T10:00:00.5+00:00');
  assert.equal(maxUpdatedAt([], 'keep'), 'keep');
  assert.equal(maxUpdatedAt([{ updated_at: '2020-01-01T00:00:00Z' }], '2026-01-01T00:00:00Z'), '2026-01-01T00:00:00Z');
  assert.equal(maxUpdatedAt([{ updated_at: 'not a date' }]), null);
});

test('partitionByStatus: archived rows are tombstones', () => {
  const { keep, drop } = partitionByStatus([
    { id: 1, status: 'published' },
    { id: 2, status: 'archived' },
    { id: 3, status: 'draft' }, // should never arrive, but must never be kept
  ]);
  assert.deepEqual(keep.map((r) => r.id), [1]);
  assert.deepEqual(drop, [2, 3]);
});

test('isNoticeActive honours status and time window', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  assert.ok(isNoticeActive({ status: 'published' }, now));
  assert.ok(!isNoticeActive({ status: 'draft' }, now));
  assert.ok(!isNoticeActive({ status: 'published', starts_at: '2026-10-23T00:00:00Z' }, now));
  assert.ok(!isNoticeActive({ status: 'published', ends_at: '2026-10-21T00:00:00Z' }, now));
  assert.ok(isNoticeActive({ status: 'published', starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-11-01T00:00:00Z' }, now));
  assert.ok(!isNoticeActive(null, now));
});

test('content tables list parents before children', () => {
  assert.ok(CONTENT_TABLES.indexOf('laws') < CONTENT_TABLES.indexOf('law_sections'));
  assert.ok(CONTENT_TABLES.indexOf('categories') < CONTENT_TABLES.indexOf('laws'));
});
