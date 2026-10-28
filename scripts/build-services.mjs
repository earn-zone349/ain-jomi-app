// Validates content/services/services.json and copies it to public/data/services/ for the app.
// Rule of this file: every fee, step, document, phone number and link must point at a source that is listed in
// "sources", and an official link must be an https address on a .gov.bd host. Nothing unsourced ships.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ID = /^[a-z0-9_]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = ['official', 'news', 'international', 'reference'];
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const pairOk = (p) => isObj(p) && typeof p.bn === 'string' && p.bn.trim() && typeof p.en === 'string' && p.en.trim();
const dateOk = (s) => typeof s === 'string' && DATE.test(s) && !Number.isNaN(Date.parse(s));

function httpsHost(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}
const isGovBd = (host) => host === 'gov.bd' || host?.endsWith('.gov.bd');

export function validateServices(d) {
  const e = [];
  if (!isObj(d)) return ['services.json: must be an object'];
  if (!dateOk(d.as_of)) e.push('services.json: as_of must be a date like 2026-10-28');

  const cats = new Set();
  (Array.isArray(d.categories) ? d.categories : []).forEach((c, i) => {
    const w = `categories[${i}]`;
    if (!ID.test(c?.id || '')) e.push(`${w}: id must be lowercase letters/digits`);
    else if (cats.has(c.id)) e.push(`${w}: duplicate id "${c.id}"`);
    else cats.add(c.id);
    if (!pairOk(c?.name)) e.push(`${w}: name.bn and name.en are required`);
  });
  if (!cats.size) e.push('services.json: categories must be a non-empty list');

  const srcs = new Map();
  (Array.isArray(d.sources) ? d.sources : []).forEach((s, i) => {
    const w = `sources[${i}]`;
    if (!ID.test(s?.id || '')) e.push(`${w}: id must be lowercase letters/digits`);
    else if (srcs.has(s.id)) e.push(`${w}: duplicate id "${s.id}"`);
    else srcs.set(s.id, s);
    if (!KINDS.includes(s?.kind)) e.push(`${w}: kind must be one of ${KINDS.join(', ')}`);
    if (!pairOk(s?.title)) e.push(`${w}: title.bn and title.en are required`);
    if (!httpsHost(s?.url)) e.push(`${w}: url must be a valid https address`);
    if (!dateOk(s?.accessed)) e.push(`${w}: accessed must be the date you read it, like 2026-10-28`);
    if (s?.published && !(dateOk(s.published) || /^\d{4}$/.test(s.published))) e.push(`${w}: published must be a date or a year (or empty)`);
  });
  if (!srcs.size) e.push('services.json: sources must be a non-empty list');

  const ids = new Set();
  if (!Array.isArray(d.services) || !d.services.length) e.push('services.json: services must be a non-empty list');
  (Array.isArray(d.services) ? d.services : []).forEach((s, i) => {
    const w = `services[${i}]${s?.id ? ` (${s.id})` : ''}`;
    if (!ID.test(s?.id || '')) e.push(`${w}: id must be lowercase letters/digits`);
    else if (ids.has(s.id)) e.push(`${w}: duplicate id`);
    else ids.add(s.id);
    if (!cats.has(s?.category)) e.push(`${w}: category "${s?.category}" is not in categories`);
    if (!['published', 'draft'].includes(s?.status)) e.push(`${w}: status must be "published" or "draft"`);
    if (!pairOk(s?.name)) e.push(`${w}: name.bn and name.en are required`);
    if (!pairOk(s?.summary)) e.push(`${w}: summary.bn and summary.en are required`);
    if (!dateOk(s?.last_verified)) e.push(`${w}: last_verified must be a date like 2026-10-28`);
    const own = Array.isArray(s?.sources) ? s.sources : [];
    if (!own.length) e.push(`${w}: sources must list at least one source id`);
    for (const id of own) if (!srcs.has(id)) e.push(`${w}: unknown source "${id}"`);
    const cite = (what, id) => {
      if (!srcs.has(id)) e.push(`${w}: ${what} has no valid source`);
      else if (!own.includes(id)) e.push(`${w}: ${what} uses source "${id}" that the service does not list in sources`);
    };

    (s?.links || []).forEach((l, j) => {
      const x = `${w} links[${j}]`;
      if (!pairOk(l?.label)) e.push(`${x}: label.bn and label.en are required`);
      const host = httpsHost(l?.url);
      if (!host) e.push(`${x}: url must be a valid https address`);
      else if (!isGovBd(host)) e.push(`${x}: only .gov.bd addresses are allowed as official links (got ${host})`);
      cite(`${x}`, l?.source);
    });
    for (const [key, label] of [['steps', 'steps'], ['needs', 'needs']]) {
      if (s?.[key] === undefined) continue;
      const blk = s[key];
      if (!isObj(blk) || !Array.isArray(blk.items) || !blk.items.length) e.push(`${w}: ${label}.items must be a non-empty list`);
      else blk.items.forEach((p, j) => { if (!pairOk(p)) e.push(`${w} ${label}.items[${j}]: bn and en are required`); });
      cite(label, blk?.source);
    }
    (s?.fees || []).forEach((f, j) => {
      const x = `${w} fees[${j}]`;
      if (!pairOk(f?.label)) e.push(`${x}: label.bn and label.en are required`);
      if (typeof f?.amount !== 'number' || !Number.isFinite(f.amount) || f.amount < 0) e.push(`${x}: amount must be a number >= 0`);
      cite(x, f?.source);
    });
    (s?.contacts || []).forEach((c, j) => {
      const x = `${w} contacts[${j}]`;
      if (!pairOk(c?.label)) e.push(`${x}: label.bn and label.en are required`);
      if (!/^\+?[0-9]{3,15}$/.test(c?.phone || '')) e.push(`${x}: phone must be digits only (a short code like 16430 is fine)`);
      cite(x, c?.source);
    });
    (s?.notes || []).forEach((n, j) => { if (!pairOk(n)) e.push(`${w} notes[${j}]: bn and en are required`); });
  });
  return e;
}

export function buildServices(inDir = 'content/services', outDir = 'public/data/services') {
  let doc;
  try {
    doc = JSON.parse(readFileSync(join(inDir, 'services.json'), 'utf8'));
  } catch (err) {
    return { errors: [`services.json: ${err.message}`] };
  }
  const errors = validateServices(doc);
  if (errors.length) return { errors };
  const { _help, ...rest } = doc;
  const out = { ...rest, services: doc.services.filter((s) => s.status === 'published') };
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'services.json'), JSON.stringify(out));
  return { errors, count: out.services.length, drafts: doc.services.length - out.services.length };
}

function main() {
  const r = buildServices(process.env.SERVICES_DIR || 'content/services', process.env.SERVICES_OUT || 'public/data/services');
  if (r.errors.length) {
    for (const e of r.errors) console.error(`ERROR    ${e}`);
    console.error(`\nbuild-services: ${r.errors.length} error(s).`);
    process.exit(1);
  }
  console.log(`build-services: ok (${r.count} services${r.drafts ? `, ${r.drafts} draft skipped` : ''})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
