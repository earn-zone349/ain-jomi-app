// Builds the offline law catalogue from plain JSON files:
//
//   content/categories.json        the category list
//   content/laws/<slug>.json       one file per law (see content/laws/_template.json and content/README.md)
//
// Output (written to public/data, copied into the APK by Vite):
//   data/index.json                categories + one entry per law (no section text)   -> small, loaded at start-up
//   data/laws/<slug>.json          the sections of one law                            -> loaded when the law is opened
//   data/search.json               normalised full text per law                       -> loaded on first search
//
// Errors are collected and printed with file name and field, then the build fails. Nothing is silently skipped
// except files whose name starts with "_" and laws whose status is "draft".

import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { normalizeText } from '../src/lib/text.js';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LAW_STATUS = ['in_force', 'amended', 'repealed'];
const STATUS = ['draft', 'published'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** Reads a {bn, en} pair; either may be empty. Returns [bn, en]. */
function pair(v) {
  return [str(v?.bn), str(v?.en)];
}

export function validateCategories(json) {
  const errors = [];
  const cats = [];
  if (!isObj(json) || !Array.isArray(json.categories)) return { errors: ['categories.json: must be { "categories": [...] }'], categories: [] };
  const seen = new Set();
  json.categories.forEach((c, i) => {
    const where = `categories.json[${i}]`;
    const [bn, en] = pair(c?.name);
    const [dbn, den] = pair(c?.desc);
    if (!SLUG.test(c?.slug || '')) errors.push(`${where}: slug must be lowercase letters, digits and hyphens`);
    else if (seen.has(c.slug)) errors.push(`${where}: duplicate slug "${c.slug}"`);
    else seen.add(c.slug);
    if (!bn || !en) errors.push(`${where}: name.bn and name.en are both required`);
    cats.push({ id: c.slug, slug: c.slug, name_bn: bn, name_en: en, desc_bn: dbn, desc_en: den, icon: str(c.icon) || 'book', sort_order: Number.isInteger(c.sort_order) ? c.sort_order : (i + 1) * 10 });
  });
  return { errors, categories: cats };
}

/**
 * Validates one law file. Returns { errors, warnings, law } where law is null for drafts.
 * file is only used in messages.
 */
export function validateLaw(json, file, categoryIds) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(`${file}: ${m}`);
  const warn = (m) => warnings.push(`${file}: ${m}`);

  if (!isObj(json)) return { errors: [`${file}: must be a JSON object`], warnings, law: null };

  const status = json.status ?? 'published';
  if (!STATUS.includes(status)) err(`status must be one of ${STATUS.join(', ')}`);
  if (status === 'draft') return { errors, warnings, law: null };

  const slug = json.slug;
  if (!SLUG.test(slug || '')) err('slug must be lowercase letters, digits and hyphens (e.g. penal-code-1860)');
  else if (slug !== basename(file, '.json')) err(`slug "${slug}" must equal the file name "${basename(file)}"`);

  if (!categoryIds.has(json.category)) err(`category "${json.category}" does not exist in categories.json`);

  const [tbn, ten] = pair(json.title);
  if (!tbn && !ten) err('title.bn or title.en is required');
  else if (!tbn || !ten) warn('title has only one language; the other will fall back');

  const lawStatus = json.law_status ?? 'in_force';
  if (!LAW_STATUS.includes(lawStatus)) err(`law_status must be one of ${LAW_STATUS.join(', ')}`);

  let year = null;
  if (json.year !== undefined && json.year !== null && json.year !== '') {
    year = Number(json.year);
    if (!Number.isInteger(year) || year < 1700 || year > 2200) err('year must be a whole number like 1860');
  }

  const [sbn, sen] = pair(json.summary);
  const src = json.source;
  let sourceName = '';
  let sourceUrl = '';
  let verified = null;
  if (src !== undefined) {
    if (!isObj(src)) err('source must be an object { name, url, last_verified }');
    else {
      sourceName = str(src.name);
      sourceUrl = str(src.url);
      if (sourceUrl && !/^https:\/\/[^\s]+$/.test(sourceUrl)) err('source.url must start with https://');
      if (src.last_verified) {
        if (!DATE.test(src.last_verified) || Number.isNaN(Date.parse(src.last_verified))) err('source.last_verified must look like 2026-01-31');
        else verified = src.last_verified;
      }
    }
  }
  if (!sourceName && !sourceUrl) warn('no source given; every law should name its official source');
  if (!verified) warn('source.last_verified missing');

  const keywords = Array.isArray(json.keywords) ? json.keywords.map(str).filter(Boolean) : [];
  if (json.keywords !== undefined && !Array.isArray(json.keywords)) err('keywords must be a list of words');

  const sections = [];
  if (json.sections !== undefined && !Array.isArray(json.sections)) err('sections must be a list');
  const seenNo = new Set();
  (Array.isArray(json.sections) ? json.sections : []).forEach((s, i) => {
    const w = `sections[${i}]`;
    if (!isObj(s)) return err(`${w}: must be an object`);
    const no = str(s.no === undefined ? '' : String(s.no));
    if (!no) return err(`${w}: "no" (section number) is required`);
    if (seenNo.has(no)) return err(`${w}: duplicate section number "${no}"`);
    seenNo.add(no);
    const [hbn, hen] = pair(s.heading);
    const [xbn, xen] = pair(s.text);
    const [ebn, een] = pair(s.explain);
    const [pbn, pen] = pair(s.punishment);
    const [cbn, cen] = pair(s.chapter);
    if (!xbn && !xen) err(`${w} (no ${no}): text.bn or text.en is required`);
    sections.push({
      id: `${slug}~${no}`,
      law_id: slug,
      section_no: no,
      chapter_bn: cbn,
      chapter_en: cen,
      heading_bn: hbn,
      heading_en: hen,
      text_bn: xbn,
      text_en: xen,
      explain_bn: ebn,
      explain_en: een,
      punishment_bn: pbn,
      punishment_en: pen,
      sort_order: (i + 1) * 10,
    });
  });
  if (!sections.length && !sbn && !sen) warn('published law has neither sections nor a summary');

  if (errors.length) return { errors, warnings, law: null };

  const entry = {
    id: slug,
    slug,
    category_id: json.category,
    title_bn: tbn,
    title_en: ten,
    act_number: str(json.act_number) || null,
    year,
    summary_bn: sbn,
    summary_en: sen,
    source_name: sourceName || null,
    source_url: sourceUrl || null,
    law_status: lawStatus,
    last_verified_at: verified,
    section_count: sections.length,
  };
  const searchText = normalizeText(
    [
      sbn,
      sen,
      ...keywords,
      ...sections.flatMap((s) => [s.section_no, s.heading_bn, s.heading_en, s.text_bn, s.text_en, s.explain_bn, s.explain_en]),
    ]
      .filter(Boolean)
      .join(' '),
  );
  const titleExtra = normalizeText(keywords.join(' '));
  return { errors, warnings, law: { entry, sections, searchText, titleExtra } };
}

/** Pure: turn validated laws + categories into the three output documents. */
export function buildOutputs(categories, laws, generatedAt = new Date().toISOString()) {
  const sorted = [...laws].sort((a, b) => a.entry.slug.localeCompare(b.entry.slug));
  const search = Object.fromEntries(sorted.map((l) => [l.entry.slug, { b: l.searchText, k: l.titleExtra }]));
  const hash = createHash('sha256');
  hash.update(JSON.stringify(categories));
  for (const l of sorted) hash.update(JSON.stringify([l.entry, l.sections]));
  const version = hash.digest('hex').slice(0, 12);
  return {
    index: { version, generated_at: generatedAt, categories, laws: sorted.map((l) => l.entry) },
    lawFiles: Object.fromEntries(sorted.map((l) => [l.entry.slug, { sections: l.sections }])),
    search,
  };
}

export function loadAll(rootDir, lawsDir) {
  const errors = [];
  const warnings = [];
  const catPath = join(rootDir, 'categories.json');
  let catJson;
  try {
    catJson = JSON.parse(readFileSync(catPath, 'utf8'));
  } catch (e) {
    return { errors: [`categories.json: ${e.message}`], warnings, categories: [], laws: [] };
  }
  const cats = validateCategories(catJson);
  errors.push(...cats.errors);
  const ids = new Set(cats.categories.map((c) => c.id));

  const laws = [];
  const seen = new Map();
  const files = existsSync(lawsDir) ? readdirSync(lawsDir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort() : [];
  for (const f of files) {
    let json;
    try {
      json = JSON.parse(readFileSync(join(lawsDir, f), 'utf8'));
    } catch (e) {
      errors.push(`${f}: not valid JSON (${e.message})`);
      continue;
    }
    const r = validateLaw(json, f, ids);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    if (r.law) {
      if (seen.has(r.law.entry.slug)) errors.push(`${f}: slug already used by ${seen.get(r.law.entry.slug)}`);
      seen.set(r.law.entry.slug, f);
      laws.push(r.law);
    }
  }
  return { errors, warnings, categories: cats.categories, laws };
}

export function writeOutputs(outDir, outputs) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'laws'), { recursive: true });
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(outputs.index));
  writeFileSync(join(outDir, 'search.json'), JSON.stringify(outputs.search));
  for (const [slug, doc] of Object.entries(outputs.lawFiles)) writeFileSync(join(outDir, 'laws', `${slug}.json`), JSON.stringify(doc));
}

function main() {
  const rootDir = process.env.CONTENT_DIR || 'content';
  const outDir = process.env.DATA_OUT || 'public/data';
  const result = loadAll(rootDir, join(rootDir, 'laws'));
  for (const w of result.warnings) console.warn(`warning  ${w}`);
  if (result.errors.length) {
    for (const e of result.errors) console.error(`ERROR    ${e}`);
    console.error(`\nbuild-laws: ${result.errors.length} error(s). Fix the file(s) above and run again.`);
    process.exit(1);
  }
  const outputs = buildOutputs(result.categories, result.laws);
  writeOutputs(outDir, outputs);
  const sections = result.laws.reduce((n, l) => n + l.sections.length, 0);
  console.log(`build-laws: ${result.categories.length} categories, ${result.laws.length} laws, ${sections} sections -> ${outDir} (version ${outputs.index.version})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
