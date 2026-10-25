// Laws: category filter + offline search + list.

import { h, clear, debounce } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { badge, emptyState, button } from '../ui/components.js';
import { t, pick, num } from '../i18n/index.js';
import { getCategories, searchLaws, getLawCount, subscribe, getStatus, syncContent } from '../core/content.js';

export default function render({ query }) {
  let q = (query.q || '').slice(0, 100);
  let categoryId = query.cat || null;

  const root = h('div', { class: 'page' });

  const input = h('input', { class: 'input search-input', type: 'search', value: q, placeholder: t('laws.searchPlaceholder'), 'aria-label': t('laws.search'), enterkeyhint: 'search' });
  const chipsEl = h('div', { class: 'chips', role: 'group', 'aria-label': t('laws.categories') });
  const resultsEl = h('div', { class: 'stack', 'aria-live': 'polite' });

  root.appendChild(h('form', { class: 'searchbar', role: 'search', onsubmit: (e) => e.preventDefault() }, icon('search'), input));
  root.appendChild(chipsEl);
  root.appendChild(resultsEl);

  function syncUrl() {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (categoryId) params.set('cat', categoryId);
    const qs = params.toString();
    history.replaceState(history.state, '', `#/laws${qs ? `?${qs}` : ''}`);
  }

  function paintChips() {
    clear(chipsEl);
    const mk = (id, label) =>
      h(
        'button',
        {
          type: 'button',
          class: `chip${(categoryId || null) === id ? ' chip-active' : ''}`,
          'aria-pressed': (categoryId || null) === id ? 'true' : 'false',
          onclick: () => {
            categoryId = id;
            syncUrl();
            paintChips();
            paintResults();
          },
        },
        label,
      );
    chipsEl.appendChild(mk(null, t('laws.all')));
    getCategories().forEach((c) => chipsEl.appendChild(mk(c.id, pick(c, 'name'))));
  }

  function paintResults() {
    clear(resultsEl);
    const laws = searchLaws(q, { categoryId });
    const st = getStatus();

    if (!getLawCount()) {
      resultsEl.appendChild(
        emptyState({
          iconName: st.syncing ? 'refresh' : 'book',
          title: st.syncing ? t('home.loadingContent') : t('laws.noneYet'),
          body: st.syncing ? null : t('laws.noneYetHint'),
          action: st.syncing ? null : button(t('settings.syncNow'), { variant: 'primary', icon: 'refresh', onClick: () => syncContent({ force: true }) }),
        }),
      );
      return;
    }

    if (!laws.length) {
      resultsEl.appendChild(emptyState({ iconName: 'search', title: t('laws.noMatch'), body: t('laws.noMatchHint') }));
      return;
    }

    resultsEl.appendChild(h('p', { class: 'muted small' }, t('laws.count', { n: num(laws.length) })));
    const catById = new Map(getCategories().map((c) => [c.id, c]));
    resultsEl.appendChild(
      h(
        'ul',
        { class: 'list' },
        laws.map((law) => {
          const meta = [law.act_number ? `${t('law.act')} ${law.act_number}` : null, law.year ? num(law.year) : null, catById.has(law.category_id) ? pick(catById.get(law.category_id), 'name') : null].filter(Boolean).join(' · ');
          return h(
            'li',
            null,
            h(
              'a',
              { class: 'row', href: `#/law/${encodeURIComponent(law.id)}` },
              h('span', { class: 'row-icon' }, icon('file')),
              h(
                'span',
                { class: 'row-text' },
                h('span', { class: 'row-title' }, pick(law, 'title')),
                meta ? h('span', { class: 'row-sub' }, meta) : null,
                law.law_status !== 'in_force' ? badge(t(`law.status.${law.law_status}`), law.law_status === 'repealed' ? 'danger' : 'warning') : null,
              ),
              icon('next', 'row-chevron'),
            ),
          );
        }),
      ),
    );
  }

  input.addEventListener(
    'input',
    debounce(() => {
      q = input.value.trim().slice(0, 100);
      syncUrl();
      paintResults();
    }, 200),
  );

  paintChips();
  paintResults();
  const unsubscribe = subscribe(() => {
    paintChips();
    paintResults();
  });
  return { el: root, title: t('nav.laws'), destroy: unsubscribe };
}
