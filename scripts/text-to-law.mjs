// Turns a plain-text law (easy to write on a phone) into the JSON file the app reads.
//
//   node scripts/text-to-law.mjs content/import/penal-code-1860.txt
//   (or:  npm run laws:import -- content/import/penal-code-1860.txt)
//
// The text is copied as-is. Nothing is rewritten, translated or invented. The result is validated with the same
// rules as the app build, and written to content/laws/<slug>.json (status stays what the header says).
//
// Format (see content/README.md for a full example):
//
//   slug: penal-code-1860                   <- header: "key: value" lines, until the first @@ or §
//   category: criminal-law
//   title.bn: দণ্ডবিধি, ১৮৬০
//   title.en: The Penal Code, 1860
//   source.name / source.url / source.last_verified, act_number, year, law_status, status,
//   summary.bn / summary.en, keywords: word, word
//
//   @@ অধ্যায় ১৭ | Chapter XVII             <- optional chapter heading for the sections that follow
//   § 378 | চুরি | Theft                    <- a section: number | heading (bn) | heading (en)
//   বাংলা পাঠ, যত লাইন লাগে                 <- goes into text.bn until a "--" line
//   --en                                    <- switch to text.en
//   English text
//   --explain / --explain.en                <- simple explanation (bn / en)
//   --punishment / --punishment.en          <- punishment (bn / en)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateLaw, validateCategories } from './build-laws.mjs';

const FIELD = { '': ['text', 'bn'], en: ['text', 'en'], explain: ['explain', 'bn'], 'explain.en': ['explain', 'en'], punishment: ['punishment', 'bn'], 'punishment.en': ['punishment', 'en'] };

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

const clean = (lines) => lines.join('\n').replace(/^\s+|\s+$/g, '');

/** Parses the text format. Returns { json, errors }. Pure: no file access. */
export function parseLawText(input) {
  const errors = [];
  const json = { sections: [] };
  const lines = String(input).replace(/\r\n?/g, '\n').split('\n');
  let i = 0;

  // header
  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^(@@|§)/.test(line.trim())) break;
    if (!line.trim() || line.trim().startsWith('//')) continue;
    const m = /^([a-z_.]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!m) {
      errors.push(`line ${i + 1}: expected "key: value" in the header, got "${line.trim().slice(0, 40)}"`);
      continue;
    }
    const [, key, value] = m;
    if (key === 'keywords') json.keywords = value.split(/[,،]/).map((w) => w.trim()).filter(Boolean);
    else if (key === 'year') json.year = value === '' ? null : Number(value);
    else setPath(json, key, value);
  }

  // body
  let chapter = null;
  let section = null;
  let field = ['text', 'bn'];
  let buf = [];
  const flush = () => {
    if (!section) return;
    const [group, lang] = field;
    const text = clean(buf);
    if (text) {
      section[group] = section[group] || {};
      section[group][lang] = text;
    }
    buf = [];
  };

  for (; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (line.startsWith('@@')) {
      flush();
      const [bn = '', en = ''] = line.slice(2).split('|').map((x) => x.trim());
      chapter = bn || en ? { bn, en } : null;
      continue;
    }
    if (line.startsWith('§')) {
      flush();
      const [no = '', bn = '', en = ''] = line.slice(1).split('|').map((x) => x.trim());
      if (!no) errors.push(`line ${i + 1}: section needs a number, e.g. "§ 378 | চুরি | Theft"`);
      section = { no };
      if (chapter) section.chapter = chapter;
      if (bn || en) section.heading = { bn, en };
      json.sections.push(section);
      field = FIELD[''];
      continue;
    }
    const sw = /^--\s*([a-z.]*)\s*$/.exec(line);
    if (sw && section) {
      if (!FIELD[sw[1]]) {
        errors.push(`line ${i + 1}: unknown marker "${line}" (use --en, --explain, --explain.en, --punishment, --punishment.en)`);
        continue;
      }
      flush();
      field = FIELD[sw[1]];
      continue;
    }
    if (!section) {
      if (line) errors.push(`line ${i + 1}: text before the first "§" section: "${line.slice(0, 40)}"`);
      continue;
    }
    buf.push(raw);
  }
  flush();
  return { json, errors };
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/text-to-law.mjs <file.txt>');
    process.exit(1);
  }
  const { json, errors } = parseLawText(readFileSync(file, 'utf8'));
  const cats = validateCategories(JSON.parse(readFileSync('content/categories.json', 'utf8')));
  const checked = validateLaw(json, `${json.slug}.json`, new Set(cats.categories.map((c) => c.id)));
  const all = [...errors, ...checked.errors];
  for (const w of checked.warnings) console.warn(`warning  ${w}`);
  if (all.length) {
    for (const e of all) console.error(`ERROR    ${e}`);
    console.error(`\ntext-to-law: ${all.length} problem(s); nothing was written.`);
    process.exit(1);
  }
  mkdirSync('content/laws', { recursive: true });
  const out = join('content/laws', `${json.slug}.json`);
  writeFileSync(out, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`text-to-law: wrote ${out} (${json.sections.length} sections, status ${json.status ?? 'published'})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
