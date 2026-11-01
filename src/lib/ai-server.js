// The request handler of the assistant, written against small injected dependencies so it can be tested with no
// network. scripts/build-ai.mjs inlines this file and ai-core.js into supabase/functions/ask/index.ts.
// Needs from ai-core.js: search, cleanQuestion, SYSTEM_PROMPT, buildUserMessage, validateAnswer, publicPassage.

/**
 * deps = {
 *   index,                                   // buildIndex(corpus)
 *   getConfig(): Promise<{ flags, limits }>, // app_settings: feature_flags, ai_limits
 *   take(key, perKey, global): Promise<number>, // remaining questions today; -1 = this person is over the limit; -2 = global cap reached
 *   callModel({ system, user }): Promise<string>,
 *   hash(text): Promise<string>,
 * }
 * Returns { status, json }. The question text is never stored or logged.
 */
export async function handleAsk(body, ip, deps) {
  const q = cleanQuestion(body?.q);
  if (!q) return { status: 400, json: { ok: false, error: 'bad_request' } };
  const lang = body?.lang === 'en' ? 'en' : 'bn';
  const device = String(body?.device ?? '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);

  let cfg;
  try {
    cfg = await deps.getConfig();
  } catch {
    return { status: 503, json: { ok: false, error: 'unavailable' } };
  }
  if (!cfg?.flags?.ai_assistant) return { status: 403, json: { ok: false, error: 'disabled' } };

  const hits = search(deps.index, q, 5);
  if (!hits.length) return { status: 200, json: { ok: true, mode: 'passages', reason: 'no_match', passages: [] } };

  const perDay = Number.isInteger(cfg.limits?.per_day) ? cfg.limits.per_day : 10;
  const globalPerDay = Number.isInteger(cfg.limits?.global_per_day) ? cfg.limits.global_per_day : 500;
  let remaining;
  try {
    remaining = await deps.take(await deps.hash(`${ip}|${device}`), perDay, globalPerDay);
  } catch {
    return { status: 503, json: { ok: false, error: 'unavailable' } };
  }
  if (remaining === -1) return { status: 429, json: { ok: false, error: 'rate_limit', per_day: perDay } };
  if (remaining === -2) return { status: 429, json: { ok: false, error: 'busy' } };

  const list = hits.map((h) => publicPassage(h.p, lang));
  let raw = '';
  try {
    raw = await deps.callModel({ system: SYSTEM_PROMPT, user: buildUserMessage(q, hits, lang) });
  } catch {
    return { status: 200, json: { ok: true, mode: 'passages', reason: 'upstream', passages: list, remaining } };
  }
  const v = validateAnswer(raw, hits, q, lang);
  if (!v.ok) return { status: 200, json: { ok: true, mode: 'passages', reason: v.reason, passages: list, remaining } };
  const cited = new Set(v.cites.map((p) => p.id));
  return {
    status: 200,
    json: {
      ok: true,
      mode: 'answer',
      answer: v.answer,
      cites: v.cites.map((p) => publicPassage(p, lang)),
      related: list.filter((p) => !cited.has(p.id)),
      remaining,
    },
  };
}
