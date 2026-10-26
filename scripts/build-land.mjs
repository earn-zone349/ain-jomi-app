// Validates the land calculator data in content/land/*.json and copies it to public/data/land/ for the app.
//   units.json     area/length units and regional katha/bigha sizes
//   costs.json     registration/transfer cost rates (status "draft" keeps the cost calculator switched off)
//   glossary.json  land terms (khatian, dag, mouza, ...)

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ID = /^[a-z0-9_]+$/;
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const pairOk = (p) => isObj(p) && typeof p.bn === 'string' && p.bn.trim() && typeof p.en === 'string' && p.en.trim();
const pos = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

export function validateUnits(d) {
  const e = [];
  if (!isObj(d)) return ['units.json: must be an object'];
  const ids = new Set();
  for (const [key, field] of [['area_units', 'sqft'], ['length_units', 'feet']]) {
    if (!Array.isArray(d[key]) || !d[key].length) {
      e.push(`units.json: ${key} must be a non-empty list`);
      continue;
    }
    d[key].forEach((u, i) => {
      const w = `units.json ${key}[${i}]`;
      if (!ID.test(u?.id || '')) e.push(`${w}: id must be lowercase letters/digits`);
      else if (ids.has(`${key}:${u.id}`)) e.push(`${w}: duplicate id "${u.id}"`);
      else ids.add(`${key}:${u.id}`);
      if (!pairOk(u?.name)) e.push(`${w}: name.bn and name.en are required`);
      if (!pos(u?.[field])) e.push(`${w}: ${field} must be a positive number`);
    });
  }
  for (const need of ['sqft', 'sqm', 'shotok', 'acre', 'hectare']) if (!ids.has(`area_units:${need}`)) e.push(`units.json: area_units must contain "${need}"`);
  if (!Array.isArray(d.regions) || !d.regions.length) e.push('units.json: regions must be a non-empty list');
  else {
    const rid = new Set();
    d.regions.forEach((r, i) => {
      const w = `units.json regions[${i}]`;
      if (!ID.test(r?.id || '') || r.id === 'custom') e.push(`${w}: id must be lowercase letters/digits and not "custom"`);
      else if (rid.has(r.id)) e.push(`${w}: duplicate id "${r.id}"`);
      else rid.add(r.id);
      if (!pairOk(r?.name)) e.push(`${w}: name.bn and name.en are required`);
      if (!pos(r?.katha_sqft)) e.push(`${w}: katha_sqft must be a positive number`);
      if (!pos(r?.katha_per_bigha)) e.push(`${w}: katha_per_bigha must be a positive number`);
    });
  }
  if (d.chhatak_per_katha !== undefined && !pos(d.chhatak_per_katha)) e.push('units.json: chhatak_per_katha must be a positive number');
  return e;
}

export function validateCosts(d) {
  const e = [];
  if (!isObj(d)) return ['costs.json: must be an object'];
  if (!['draft', 'published'].includes(d.status)) e.push('costs.json: status must be "draft" or "published"');
  if (!Array.isArray(d.items)) e.push('costs.json: items must be a list');
  const ids = new Set();
  (Array.isArray(d.items) ? d.items : []).forEach((it, i) => {
    const w = `costs.json items[${i}]`;
    if (!ID.test(it?.id || '')) e.push(`${w}: id must be lowercase letters/digits`);
    else if (ids.has(it.id)) e.push(`${w}: duplicate id "${it.id}"`);
    else ids.add(it.id);
    if (!pairOk(it?.label)) e.push(`${w}: label.bn and label.en are required`);
    if (!['percent', 'fixed'].includes(it?.kind)) e.push(`${w}: kind must be "percent" or "fixed"`);
    if (typeof it?.value !== 'number' || !Number.isFinite(it.value) || it.value < 0) e.push(`${w}: value must be a number >= 0`);
    else if (it.kind === 'percent' && it.value > 100) e.push(`${w}: a percent cannot be more than 100`);
  });
  if (d.status === 'published') {
    if (!d.items?.length) e.push('costs.json: published needs at least one item');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.as_of || '') || Number.isNaN(Date.parse(d.as_of))) e.push('costs.json: published needs as_of like 2026-07-01 (the date the rates were checked)');
    if (!isObj(d.source) || !String(d.source.name || '').trim()) e.push('costs.json: published needs source.name (where the rates come from)');
    if (d.source?.url && !/^https:\/\/\S+$/.test(d.source.url)) e.push('costs.json: source.url must start with https://');
  }
  return e;
}

export function validateGlossary(d) {
  const e = [];
  if (!isObj(d) || !Array.isArray(d.terms)) return ['glossary.json: must be { "terms": [...] }'];
  const ids = new Set();
  d.terms.forEach((t, i) => {
    const w = `glossary.json terms[${i}]`;
    if (!ID.test(t?.id || '')) e.push(`${w}: id must be lowercase letters/digits`);
    else if (ids.has(t.id)) e.push(`${w}: duplicate id "${t.id}"`);
    else ids.add(t.id);
    if (!pairOk(t?.term)) e.push(`${w}: term.bn and term.en are required`);
    if (!pairOk(t?.meaning)) e.push(`${w}: meaning.bn and meaning.en are required`);
  });
  return e;
}

export function buildLand(inDir = 'content/land', outDir = 'public/data/land') {
  const files = { 'units.json': validateUnits, 'costs.json': validateCosts, 'glossary.json': validateGlossary };
  const errors = [];
  const docs = {};
  for (const [name, check] of Object.entries(files)) {
    try {
      docs[name] = JSON.parse(readFileSync(join(inDir, name), 'utf8'));
      errors.push(...check(docs[name]));
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  if (errors.length) return { errors };
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const [name, doc] of Object.entries(docs)) {
    const clean = Object.fromEntries(Object.entries(doc).filter(([k]) => k !== '_help'));
    writeFileSync(join(outDir, name), JSON.stringify(clean));
  }
  return { errors, costStatus: docs['costs.json'].status };
}

function main() {
  const r = buildLand(process.env.LAND_DIR || 'content/land', process.env.LAND_OUT || 'public/data/land');
  if (r.errors.length) {
    for (const e of r.errors) console.error(`ERROR    ${e}`);
    console.error(`\nbuild-land: ${r.errors.length} error(s).`);
    process.exit(1);
  }
  console.log(`build-land: ok (cost calculator: ${r.costStatus === 'published' ? 'ON' : 'off, no published rates'})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
