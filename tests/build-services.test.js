import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateServices, buildServices } from '../scripts/build-services.mjs';

const real = () => JSON.parse(readFileSync('content/services/services.json', 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));

test('shipped services data is valid', () => {
  assert.deepEqual(validateServices(real()), []);
});

test('every fee, step, contact and link in the shipped data cites a listed source', () => {
  const d = real();
  for (const s of d.services) {
    assert.ok(s.sources.length >= 1, s.id);
    for (const l of s.links || []) assert.ok(s.sources.includes(l.source), `${s.id} link ${l.url}`);
    for (const f of s.fees || []) assert.ok(s.sources.includes(f.source), `${s.id} fee`);
  }
});

test('fees copied from the official fee page keep their exact amounts', () => {
  const d = real();
  const fee = (id, i) => d.services.find((s) => s.id === id).fees[i].amount;
  assert.deepEqual(d.services.find((s) => s.id === 'mutation').fees.map((f) => f.amount), [20, 50, 1100, 70, 1100]);
  assert.deepEqual(d.services.find((s) => s.id === 'land_record_online').fees.map((f) => f.amount), [100, 140, 20, 630]);
  assert.equal(fee('land_record_online', 0), 100);
});

test('rejects: unsourced fee, non-gov.bd link, http link, bad phone, unknown category, missing date', () => {
  const d = real();
  const mut = (fn) => { const c = clone(d); fn(c); return validateServices(c); };
  assert.ok(mut((c) => delete c.services[0].fees[0].source).some((m) => /no valid source/.test(m)));
  assert.ok(mut((c) => (c.services[0].fees[0].source = 'wiki_nlaso')).some((m) => /does not list/.test(m)));
  assert.ok(mut((c) => (c.services[0].links[0].url = 'https://example.com/')).some((m) => /\.gov\.bd/.test(m)));
  assert.ok(mut((c) => (c.services[0].links[0].url = 'http://land.gov.bd/')).some((m) => /https/.test(m)));
  assert.ok(mut((c) => (c.services[0].links[0].url = 'https://evilgov.bd/')).some((m) => /\.gov\.bd/.test(m)));
  assert.ok(mut((c) => (c.services[2].contacts[0].phone = '16 430')).some((m) => /phone/.test(m)));
  assert.ok(mut((c) => (c.services[0].category = 'nope')).some((m) => /category/.test(m)));
  assert.ok(mut((c) => delete c.services[0].last_verified).some((m) => /last_verified/.test(m)));
  assert.ok(mut((c) => (c.services[0].sources = [])).some((m) => /at least one source/.test(m)));
  assert.ok(mut((c) => (c.services[0].fees[0].amount = -1)).some((m) => /amount/.test(m)));
  assert.ok(mut((c) => c.services.push(clone(c.services[0]))).some((m) => /duplicate/.test(m)));
  assert.ok(mut((c) => (c.sources[0].kind = 'blog')).some((m) => /kind/.test(m)));
  assert.ok(validateServices(null).length);
});

test('build: drafts are left out, output has no _help, bad data writes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svc-'));
  const d = real();
  d.services[1].status = 'draft';
  writeFileSync(join(dir, 'services.json'), JSON.stringify(d));
  const out = join(dir, 'out');
  const r = buildServices(dir, out);
  assert.deepEqual(r.errors, []);
  assert.equal(r.drafts, 1);
  const built = JSON.parse(readFileSync(join(out, 'services.json'), 'utf8'));
  assert.equal(built.services.length, d.services.length - 1);
  assert.equal('_help' in built, false);
  d.services[0].fees[0].amount = 'x';
  writeFileSync(join(dir, 'services.json'), JSON.stringify(d));
  const out2 = join(dir, 'out2');
  assert.ok(buildServices(dir, out2).errors.length);
  assert.equal(existsSync(out2), false);
});
