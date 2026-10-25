// Static source checks that need no bundler and no network:
//   1. every relative import resolves to a real file, and every named import is actually exported there
//   2. every translation key used in code exists in BOTH Bangla and English, and both dictionaries match
//
// Run:  npm run check      (also executed by the test suite and by CI)

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['src', 'web', 'scripts'];
const SKIP = new Set(['node_modules', 'dist', 'dist-web', 'generated']);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(m?js)$/.test(name)) out.push(p);
  }
  return out;
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

function exportsOf(file) {
  const src = stripComments(readFileSync(file, 'utf8'));
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const piece = part.trim();
      if (!piece) continue;
      const as = piece.split(/\s+as\s+/);
      names.add((as[1] || as[0]).trim());
    }
  }
  if (/export\s+default\b/.test(src)) names.add('default');
  return names;
}

export function checkImports(root = ROOT) {
  const problems = [];
  const files = SCAN_DIRS.flatMap((d) => walk(join(root, d)));
  const exportCache = new Map();
  const getExports = (f) => {
    if (!exportCache.has(f)) exportCache.set(f, exportsOf(f));
    return exportCache.get(f);
  };

  for (const file of files) {
    const rel = relative(root, file);
    const src = stripComments(readFileSync(file, 'utf8'));
    const re = /import\s+(?:([^'";]*?)\s+from\s+)?['"]([^'"]+)['"]/g;
    for (const m of src.matchAll(re)) {
      const [, clause, spec] = m;
      if (!spec.startsWith('.')) continue; // packages are checked by the bundler
      const target = resolve(dirname(file), spec);
      if (/\.(css|json)$/.test(spec)) {
        if (!existsSync(target)) problems.push(`${rel}: missing file ${spec}`);
        continue;
      }
      if (!existsSync(target)) {
        problems.push(`${rel}: cannot resolve ${spec}`);
        continue;
      }
      if (!clause) continue;
      const exp = getExports(target);
      const named = clause.match(/\{([^}]*)\}/);
      if (named) {
        for (const part of named[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/)[0].trim();
          if (name && !exp.has(name)) problems.push(`${rel}: '${name}' is not exported by ${spec}`);
        }
      }
      const def = clause.replace(/\{[^}]*\}/, '').replace(/\*\s+as\s+\w+/, '').replace(/,/g, '').trim();
      if (def && !/^\*/.test(def) && !exp.has('default')) problems.push(`${rel}: ${spec} has no default export`);
    }
    // dynamic imports used by the router / platform layer
    for (const m of src.matchAll(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      if (!existsSync(resolve(dirname(file), m[1]))) problems.push(`${rel}: dynamic import ${m[1]} not found`);
    }
  }
  return problems;
}

export async function checkI18n(root = ROOT) {
  const problems = [];
  const { bn } = await import(pathToFileURL(join(root, 'src/i18n/bn.js')).href);
  const { en } = await import(pathToFileURL(join(root, 'src/i18n/en.js')).href);

  for (const k of Object.keys(en)) if (!(k in bn)) problems.push(`i18n: key "${k}" missing in bn`);
  for (const k of Object.keys(bn)) if (!(k in en)) problems.push(`i18n: key "${k}" missing in en`);

  // placeholders must match between languages
  const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const k of Object.keys(en)) if (k in bn && ph(en[k]) !== ph(bn[k])) problems.push(`i18n: placeholders differ for "${k}"`);
  for (const [k, v] of Object.entries({ ...en, ...bn })) if (!String(v).trim()) problems.push(`i18n: empty text for "${k}"`);

  const used = new Set();
  const files = ['src'].flatMap((d) => walk(join(root, d)));
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?<![A-Za-z0-9_$.])t\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
  }
  // keys built dynamically in code
  for (const status of ['in_force', 'amended', 'repealed']) used.add(`law.status.${status}`);
  const { CONFIG } = await import(pathToFileURL(join(root, 'src/config.js')).href).catch(() => ({ CONFIG: null }));
  const moduleIds = CONFIG?.modules?.map((m) => m.id) ?? ['land_calculator', 'inheritance', 'gov_services', 'ai_assistant', 'lawyers'];
  for (const id of moduleIds) {
    used.add(`mod.${id}.title`);
    used.add(`mod.${id}.desc`);
  }
  for (const key of ['legal.terms', 'legal.privacy', 'legal.disclaimer', 'nav.home', 'nav.laws', 'nav.tools', 'nav.settings']) used.add(key);
  for (const key of ['auth.err.pwShort', 'auth.err.pwDigits', 'auth.err.badCredentials', 'auth.err.emailNotConfirmed', 'auth.err.emailTaken', 'auth.err.rateLimited', 'auth.err.weakPassword']) used.add(key);

  for (const k of used) {
    if (!(k in en)) problems.push(`i18n: code uses "${k}" but en.js has no such key`);
    if (!(k in bn)) problems.push(`i18n: code uses "${k}" but bn.js has no such key`);
  }
  return problems;
}

async function main() {
  const problems = [...checkImports(), ...(await checkI18n())];
  if (problems.length) {
    console.error(problems.map((p) => `  - ${p}`).join('\n'));
    console.error(`\n${problems.length} problem(s) found.`);
    process.exit(1);
  }
  console.log('check: imports and translations OK');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
