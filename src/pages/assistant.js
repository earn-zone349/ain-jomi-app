// AI legal assistant. It answers only from the verified passages of this app (laws, government services, land units,
// inheritance rules), shows which passages the answer came from, and says plainly when the content has no answer.
// With no connection, or when the server side is off, it still searches the same passages on the phone.

import { h, clear } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { banner, button, badge, loadingBlock, setBusy } from '../ui/components.js';
import { t, getLang } from '../i18n/index.js';
import { ask, searchLocal, canAsk } from '../core/ai.js';
import { logError } from '../core/logger.js';

const KIND_TONE = { law: 'success', service: 'success', land: 'neutral', inheritance: 'neutral' };
const MAX_Q = 400;

export default function render({ navigate }) {
  const root = h('div', { class: 'page' });
  const out = h('div', { class: 'stack', 'aria-live': 'polite', dataset: { id: 'ai-out' } });
  const input = h('textarea', { class: 'input', rows: 3, maxlength: MAX_Q, 'aria-label': t('ai.ask'), placeholder: t('ai.placeholder'), dataset: { id: 'ai-q' } });
  const go = button(t('ai.send'), { variant: 'primary', block: true, onClick: () => run() });
  const chips = h('div', { class: 'chips' }, ['ai.ex1', 'ai.ex2', 'ai.ex3'].map((k) => h('button', { type: 'button', class: 'chip', onclick: () => { input.value = t(k); run(); } }, t(k))));

  root.append(banner(t('ai.intro'), { tone: 'info', iconName: 'info' }), h('label', { class: 'lc-label' }, t('ai.ask'), input), go, chips, out, h('p', { class: 'fineprint' }, icon('info', 'icon-inline'), t('ai.fine')));

  function passageCard(p) {
    const long = p.text.length > 360;
    return h(
      'div',
      { class: 'card', dataset: { passage: p.id } },
      h('div', { class: 'row-between' }, h('strong', null, p.title), badge(t(`ai.kind.${p.kind}`), KIND_TONE[p.kind] || 'neutral')),
      h('p', { class: 'muted small' }, p.ref),
      long
        ? h('details', null, h('summary', null, `${p.text.slice(0, 360)}…`), h('p', null, p.text))
        : h('p', null, p.text),
      p.route ? button(t('ai.open'), { variant: 'ghost', onClick: () => navigate(p.route) }) : null,
    );
  }

  function showPassages(title, list) {
    if (!list.length) return;
    out.appendChild(h('h3', { class: 'section-title' }, title));
    for (const p of list) out.appendChild(passageCard(p));
  }

  async function run() {
    const q = input.value.trim();
    if (!q) return;
    const lang = getLang();
    clear(out);
    out.appendChild(loadingBlock(t('ai.thinking')));
    setBusy(go, true);
    let server = null;
    try {
      if (canAsk()) server = await ask(q, lang);
      let local = [];
      const needLocal = !server || !server.ok || server.mode !== 'answer';
      if (needLocal && !(server && server.ok && server.mode === 'passages' && server.passages.length)) local = await searchLocal(q, lang);
      clear(out);
      if (server && server.ok && server.mode === 'answer') {
        out.appendChild(h('div', { class: 'card result', dataset: { id: 'ai-answer' } }, h('p', { class: 'eyebrow' }, t('ai.answer')), h('p', null, server.answer)));
        out.appendChild(h('h3', { class: 'section-title' }, t('ai.from')));
        for (const p of server.cites) out.appendChild(passageCard(p));
        if (server.related?.length) showPassages(t('ai.related'), server.related);
        if (Number.isInteger(server.remaining)) out.appendChild(h('p', { class: 'muted small', dataset: { id: 'ai-left' } }, t('ai.left', { n: server.remaining })));
        return;
      }
      if (server && server.ok && server.mode === 'passages') {
        out.appendChild(banner(t(`ai.reason.${server.reason}`) || t('ai.reason.unknown'), { tone: 'info', iconName: 'info' }));
        showPassages(t('ai.matching'), server.passages.length ? server.passages : local);
        if (Number.isInteger(server.remaining)) out.appendChild(h('p', { class: 'muted small', dataset: { id: 'ai-left' } }, t('ai.left', { n: server.remaining })));
        return;
      }
      const why = server && !server.ok ? server.error : null;
      if (why === 'rate_limit' || why === 'busy') out.appendChild(banner(t(`ai.err.${why}`), { tone: 'warning', iconName: 'alert' }));
      else if (why === 'bad_request') out.appendChild(banner(t('ai.err.bad_request'), { tone: 'warning', iconName: 'alert' }));
      else out.appendChild(banner(t('ai.offlineSearch'), { tone: 'info', iconName: 'info' }));
      if (local.length) showPassages(t('ai.matching'), local);
      else out.appendChild(banner(t('ai.reason.no_match'), { tone: 'info', iconName: 'info' }));
    } catch (e) {
      logError(e, { where: 'assistant.run' });
      clear(out);
      out.appendChild(banner(t('error.generic'), { tone: 'warning', iconName: 'alert' }));
    } finally {
      setBusy(go, false);
    }
  }

  return { el: root, title: t('mod.ai_assistant.title') };
}
