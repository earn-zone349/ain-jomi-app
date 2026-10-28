// Government service guides: what a service is, the steps, the official fee, and the official link, each with its source.
// Nothing here is shown without a source and a "last checked" date (see scripts/build-services.mjs).

import { h, clear } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { banner, emptyState, loadingBlock, badge, externalLink } from '../ui/components.js';
import { t, num, getLang, formatDate } from '../i18n/index.js';
import { loadServices } from '../core/services.js';
import { logError } from '../core/logger.js';

const L = (pair) => (pair && (getLang() === 'bn' ? pair.bn || pair.en : pair.en || pair.bn)) || '';
const KIND_TONE = { official: 'success', international: 'info', news: 'warning', reference: 'neutral' };

export default function render({ query }) {
  const root = h('div', { class: 'page' });
  root.appendChild(loadingBlock(t('svc.loading')));
  let cat = 'all';

  loadServices()
    .then((data) => paint(data))
    .catch((err) => {
      logError(err, { where: 'services.load' });
      clear(root);
      root.appendChild(emptyState({ iconName: 'alert', title: t('svc.loadFailed') }));
    });

  function paint(data) {
    clear(root);
    const srcById = new Map(data.sources.map((s) => [s.id, s]));
    const chips = h('div', { class: 'chips', role: 'tablist' });
    const list = h('div', { class: 'stack' });
    root.append(banner(t('svc.intro'), { tone: 'info', iconName: 'info' }), chips, list);

    const paintChips = () => {
      clear(chips);
      for (const c of [{ id: 'all', name: { bn: t('svc.all'), en: t('svc.all') } }, ...data.categories]) {
        chips.appendChild(h('button', { type: 'button', role: 'tab', class: `chip${cat === c.id ? ' chip-active' : ''}`, 'aria-selected': cat === c.id ? 'true' : 'false', dataset: { cat: c.id }, onclick: () => { cat = c.id; paintChips(); paintList(); } }, L(c.name)));
      }
    };

    const section = (title, ...body) => h('div', { class: 'stack' }, h('h3', { class: 'section-title' }, title), ...body);
    const cite = (id) => {
      const s = srcById.get(id);
      return s ? h('span', { class: 'muted small' }, ` (${L(s.title)})`) : null;
    };

    function card(s) {
      const body = h('div', { class: 'acc-body stack' });
      body.appendChild(h('p', null, L(s.summary)));
      if (s.needs) body.appendChild(section(t('svc.needs'), h('ul', { class: 'plain-list' }, s.needs.items.map((i) => h('li', null, L(i)))), h('p', { class: 'muted small' }, t('svc.sourceIs'), cite(s.needs.source))));
      if (s.steps) body.appendChild(section(t('svc.steps'), h('ol', { class: 'plain-list' }, s.steps.items.map((i) => h('li', null, L(i)))), h('p', { class: 'muted small' }, t('svc.sourceIs'), cite(s.steps.source))));
      if (s.fees?.length) {
        body.appendChild(
          section(
            t('svc.fees'),
            h('dl', { class: 'facts' }, s.fees.map((f) => h('div', { class: 'fact', dataset: { fee: String(f.amount) } }, h('dt', null, L(f.label), cite(f.source)), h('dd', null, `৳ ${num(f.amount)}`)))),
          ),
        );
      }
      if (s.contacts?.length) {
        body.appendChild(section(t('svc.contacts'), h('ul', { class: 'plain-list' }, s.contacts.map((c) => h('li', null, L(c.label), ': ', h('a', { class: 'link', href: `tel:${c.phone}` }, num(c.phone)), cite(c.source))))));
      }
      if (s.links?.length) body.appendChild(section(t('svc.links'), h('ul', { class: 'plain-list' }, s.links.map((l) => h('li', null, externalLink(l.url, L(l.label)), cite(l.source))))));
      for (const n of s.notes || []) body.appendChild(banner(L(n), { tone: 'warning', iconName: 'info' }));
      body.appendChild(
        section(
          t('svc.sources'),
          h(
            'ul',
            { class: 'plain-list' },
            s.sources.map((id) => {
              const src = srcById.get(id);
              return h('li', null, badge(t(`svc.kind.${src.kind}`), KIND_TONE[src.kind] || 'neutral'), ' ', externalLink(src.url, L(src.title)), h('span', { class: 'muted small' }, ` · ${src.published ? `${t('svc.published')}: ${num(src.published)} · ` : ''}${t('svc.read')}: ${formatDate(src.accessed)}`));
            }),
          ),
        ),
      );
      body.appendChild(h('p', { class: 'fineprint' }, icon('info', 'icon-inline'), t('svc.verified', { date: formatDate(s.last_verified) })));
      return h('details', { class: 'acc-item card', dataset: { service: s.id }, open: query?.open === s.id }, h('summary', { class: 'acc-summary' }, h('span', { class: 'sec-heading' }, L(s.name)), icon('down', 'acc-chevron')), body);
    }

    function paintList() {
      clear(list);
      const shown = data.services.filter((s) => cat === 'all' || s.category === cat);
      if (!shown.length) return list.appendChild(emptyState({ iconName: 'info', title: t('svc.empty') }));
      shown.forEach((s) => list.appendChild(card(s)));
      list.appendChild(h('p', { class: 'fineprint' }, icon('info', 'icon-inline'), t('svc.disclaimer')));
    }

    paintChips();
    paintList();
  }

  return { el: root, title: t('mod.gov_services.title') };
}
