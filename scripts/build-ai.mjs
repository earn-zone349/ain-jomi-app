// Builds the assistant's corpus and the Edge Function.
//
//   public/data/ai-corpus.json            passages the app searches offline (also served on GitHub Pages for the function)
//   web/public/data/ai-corpus.json        same file, copied so the web build publishes it
//   supabase/functions/ask/index.ts       the function: ai-core.js + ai-server.js inlined + the Deno wiring
//
// The corpus contains only content that is already verified and shipped in the app: published laws (every section),
// government service guides, the land glossary and units, and the inheritance rule texts. Nothing else.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { en } from '../src/i18n/en.js';
import { bn } from '../src/i18n/bn.js';
import { RULE_STATUS } from '../src/lib/inheritance-status.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const s = (v) => (typeof v === 'string' ? v.trim() : '');
const pair = (v) => ({ bn: s(v?.bn), en: s(v?.en) });
const join2 = (items, k) => items.map((x, i) => `${i + 1}. ${s(x?.[k]) || ''}`).join(' ');

export function lawPassages(laws) {
  const out = [];
  for (const law of laws) {
    if (law.status !== 'published') continue;
    for (const sec of law.sections || []) {
      const text = { bn: [s(sec.text?.bn), s(sec.explain?.bn) && `ব্যাখ্যা: ${s(sec.explain.bn)}`, s(sec.punishment?.bn) && `শাস্তি: ${s(sec.punishment.bn)}`].filter(Boolean).join(' '), en: [s(sec.text?.en), s(sec.explain?.en) && `Explanation: ${s(sec.explain.en)}`, s(sec.punishment?.en) && `Punishment: ${s(sec.punishment.en)}`].filter(Boolean).join(' ') };
      if (!text.bn && !text.en) continue;
      out.push({
        id: `law:${law.slug}:${sec.no}`,
        kind: 'law',
        title: { bn: s(sec.heading?.bn) || s(law.title?.bn), en: s(sec.heading?.en) || s(law.title?.en) },
        ref: { bn: `${s(law.title?.bn)}, ধারা ${sec.no}`, en: `${s(law.title?.en)}, section ${sec.no}` },
        text,
        route: `/law/${law.slug}`,
      });
    }
  }
  return out;
}

export function servicePassages(d) {
  const out = [];
  for (const sv of d.services || []) {
    if (sv.status !== 'published') continue;
    const bnParts = [s(sv.summary?.bn)];
    const enParts = [s(sv.summary?.en)];
    if (sv.needs?.items?.length) {
      bnParts.push(`লাগবে: ${sv.needs.items.map((x) => s(x.bn)).join(', ')}।`);
      enParts.push(`You need: ${sv.needs.items.map((x) => s(x.en)).join(', ')}.`);
    }
    if (sv.steps?.items?.length) {
      bnParts.push(`ধাপ: ${join2(sv.steps.items, 'bn')}`);
      enParts.push(`Steps: ${join2(sv.steps.items, 'en')}`);
    }
    if (sv.fees?.length) {
      bnParts.push(`ফি: ${sv.fees.map((f) => `${s(f.label?.bn)} ${f.amount} টাকা`).join('; ')}।`);
      enParts.push(`Fees: ${sv.fees.map((f) => `${s(f.label?.en)} ${f.amount} taka`).join('; ')}.`);
    }
    if (sv.contacts?.length) {
      bnParts.push(`যোগাযোগ: ${sv.contacts.map((c) => `${s(c.label?.bn)} ${s(c.value ?? c.number ?? c.phone ?? '')}`).join('; ')}।`);
      enParts.push(`Contact: ${sv.contacts.map((c) => `${s(c.label?.en)} ${s(c.value ?? c.number ?? c.phone ?? '')}`).join('; ')}.`);
    }
    for (const n of sv.notes || []) {
      bnParts.push(s(n.bn));
      enParts.push(s(n.en));
    }
    out.push({
      id: `service:${sv.id}`,
      kind: 'service',
      title: pair(sv.name),
      ref: { bn: `সরকারি সেবা গাইড (যাচাই: ${sv.last_verified})`, en: `Government service guide (checked ${sv.last_verified})` },
      text: { bn: bnParts.filter(Boolean).join(' '), en: enParts.filter(Boolean).join(' ') },
      route: '/tools/services',
    });
  }
  return out;
}

export function landPassages(glossary, units) {
  const out = [];
  for (const t of glossary.terms || []) {
    out.push({ id: `land:term:${t.id}`, kind: 'land', title: pair(t.term), ref: { bn: 'জমির শব্দকোষ', en: 'Land glossary' }, text: pair(t.meaning), route: '/tools/land' });
  }
  const area = (units.area_units || []).map((u) => ({ id: u.id, name: pair(u.name), sqft: u.sqft }));
  for (const u of area) {
    out.push({
      id: `land:unit:${u.id}`,
      kind: 'land',
      title: u.name,
      ref: { bn: 'জমির মাপের একক', en: 'Land measurement unit' },
      text: { bn: `১ ${u.name.bn} = ${u.sqft} বর্গফুট।`, en: `1 ${u.name.en} = ${u.sqft} square feet.` },
      route: '/tools/land',
    });
  }
  for (const r of units.regions || []) {
    out.push({
      id: `land:region:${r.id}`,
      kind: 'land',
      title: pair(r.name),
      ref: { bn: 'কাঠা ও বিঘার মাপ (এলাকাভেদে আলাদা)', en: 'Katha and bigha sizes (they differ by area)' },
      text: { bn: `${s(r.name?.bn)}: ১ কাঠা = ${r.katha_sqft} বর্গফুট; ১ বিঘা = ${r.katha_per_bigha} কাঠা।`, en: `${s(r.name?.en)}: 1 katha = ${r.katha_sqft} square feet; 1 bigha = ${r.katha_per_bigha} katha.` },
      route: '/tools/land',
    });
  }
  return out;
}

const RELIGION_OF = [
  [/^SA_/, 'christian', 'খ্রিস্টান', 'Christian'],
  [/^MFLO_/, 'muslim', 'মুসলিম', 'Muslim'],
  [/^MU_/, 'muslim', 'মুসলিম (সুন্নি)', 'Muslim (Sunni)'],
  [/^SH_/, 'muslim_shia', 'মুসলিম (শিয়া)', 'Muslim (Shia)'],
  [/^HI_/, 'hindu', 'হিন্দু', 'Hindu'],
];

export function inheritancePassages(enMap, bnMap) {
  const out = [];
  for (const key of Object.keys(enMap)) {
    const m = /^inh\.basis\.(.+)$/.exec(key);
    if (!m) continue;
    const hit = RELIGION_OF.find(([re]) => re.test(m[1]));
    if (!hit) continue;
    const law = RULE_STATUS[hit[1]]?.law || '';
    out.push({
      id: `inh:${m[1]}`,
      kind: 'inheritance',
      title: { bn: `উত্তরাধিকার, ${hit[2]}`, en: `Inheritance, ${hit[3]}` },
      ref: { bn: `${hit[2]} উত্তরাধিকার নিয়ম (${law})`, en: `${hit[3]} inheritance rule (${law})` },
      text: { bn: s(bnMap[key]) || s(enMap[key]), en: s(enMap[key]) },
      route: '/tools/inheritance',
    });
  }
  return out;
}

export function buildCorpus() {
  const laws = existsSync(join(ROOT, 'content/laws')) ? readdirSync(join(ROOT, 'content/laws')).filter((f) => f.endsWith('.json') && !f.startsWith('_')).map((f) => read(`content/laws/${f}`)) : [];
  const passages = [...lawPassages(laws), ...servicePassages(read('content/services/services.json')), ...landPassages(read('content/land/glossary.json'), read('content/land/units.json')), ...inheritancePassages(en, bn)];
  const seen = new Set();
  for (const p of passages) {
    if (seen.has(p.id)) throw new Error(`duplicate passage id ${p.id}`);
    seen.add(p.id);
    if (!p.text.bn && !p.text.en) throw new Error(`empty passage ${p.id}`);
  }
  return passages;
}

const strip = (code) => code.replace(/^import .*$/gm, '').replace(/^export (async function|function|const|let)/gm, '$1');

export function edgeFunctionSource() {
  const core = strip(readFileSync(join(ROOT, 'src/lib/ai-core.js'), 'utf8'));
  const server = strip(readFileSync(join(ROOT, 'src/lib/ai-server.js'), 'utf8'));
  return `// @ts-nocheck
// GENERATED by scripts/build-ai.mjs from src/lib/ai-core.js and src/lib/ai-server.js. Do not edit by hand.
//
// Supabase Edge Function "ask": answers a question only from the verified passages of the app.
// Secrets to set in Supabase (Edge Functions > Secrets):
//   ANTHROPIC_API_KEY   your Anthropic API key
//   CORPUS_URL          https://<your-github-user>.github.io/<repo>/data/ai-corpus.json
//   AI_MODEL            optional, default claude-haiku-5-5
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase itself.

${core}
${server}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const reply = (status, json) => new Response(JSON.stringify(json), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' } });

let cache = { at: 0, index: null };
async function getIndex() {
  if (cache.index && Date.now() - cache.at < 10 * 60 * 1000) return cache.index;
  const res = await fetch(Deno.env.get('CORPUS_URL'), { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error('corpus ' + res.status);
  cache = { at: Date.now(), index: buildIndex(await res.json()) };
  return cache.index;
}

const SB = Deno.env.get('SUPABASE_URL');
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const sbHeaders = { apikey: KEY, authorization: 'Bearer ' + KEY, 'content-type': 'application/json' };

async function getConfig() {
  const res = await fetch(SB + '/rest/v1/app_settings?select=key,value&key=in.(feature_flags,ai_limits)', { headers: sbHeaders });
  if (!res.ok) throw new Error('settings ' + res.status);
  const rows = await res.json();
  const get = (k) => rows.find((r) => r.key === k)?.value || {};
  return { flags: get('feature_flags'), limits: get('ai_limits') };
}

async function take(key, perKey, global) {
  const res = await fetch(SB + '/rest/v1/rpc/ai_take', { method: 'POST', headers: sbHeaders, body: JSON.stringify({ p_key: key, p_per_key: perKey, p_global: global }) });
  if (!res.ok) throw new Error('quota ' + res.status);
  return Number(await res.json());
}

async function callModel({ system, user }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: Deno.env.get('AI_MODEL') || 'claude-haiku-5-5', max_tokens: 700, temperature: 0, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!res.ok) throw new Error('model ' + res.status);
    const j = await res.json();
    return (j.content || []).map((c) => c.text || '').join('');
  } finally {
    clearTimeout(timer);
  }
}

async function hash(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'bad_request' });
  let body = null;
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, error: 'bad_request' });
  }
  let index;
  try {
    index = await getIndex();
  } catch {
    return reply(503, { ok: false, error: 'unavailable' });
  }
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const { status, json } = await handleAsk(body, ip, { index, getConfig, take, callModel, hash });
  return reply(status, json);
});
`;
}

export function writeAll() {
  const corpus = buildCorpus();
  const json = JSON.stringify(corpus);
  for (const dir of ['public/data', 'web/public/data']) {
    mkdirSync(join(ROOT, dir), { recursive: true });
    writeFileSync(join(ROOT, dir, 'ai-corpus.json'), json);
  }
  mkdirSync(join(ROOT, 'supabase/functions/ask'), { recursive: true });
  writeFileSync(join(ROOT, 'supabase/functions/ask/index.ts'), edgeFunctionSource());
  return corpus.length;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  console.log(`ai: ${writeAll()} passages, function written`);
}
