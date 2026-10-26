// Common questions: an accordion over the FAQs edited in the admin panel, with a simple offline search.

import { h, clear, debounce } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { emptyState } from '../ui/components.js';
import { renderParagraphs } from '../ui/richtext.js';
import { t, pick } from '../i18n/index.js';
import { getFaqs, subscribe } from '../core/content.js';
import { normalizeText } from '../lib/text.js';

export default function render() {
  let q = '';
  const root = h('div', { class: 'page' });
  const input = h('input', { class: 'input search-input', type: 'search', placeholder: t('faq.search'), 'aria-label': t('faq.search'), enterkeyhint: 'search' });
  const list = h('div', { class: 'stack', 'aria-live': 'polite' });
  root.appendChild(h('form', { class: 'searchbar', role: 'search', onsubmit: (e) => e.preventDefault() }, icon('search'), input));
  root.appendChild(list);

  function paint() {
    clear(list);
    const all = getFaqs();
    if (!all.length) {
      list.appendChild(emptyState({ iconName: 'question', title: t('faq.empty'), body: t('faq.emptyHint') }));
      return;
    }
    const words = normalizeText(q).split(' ').filter(Boolean);
    const shown = words.length ? all.filter((f) => words.every((w) => normalizeText(`${pick(f, 'question')} ${pick(f, 'answer')}`).includes(w))) : all;
    if (!shown.length) {
      list.appendChild(emptyState({ iconName: 'search', title: t('laws.noMatch'), body: t('laws.noMatchHint') }));
      return;
    }
    list.appendChild(
      h(
        'div',
        { class: 'accordion' },
        shown.map((f) =>
          h(
            'details',
            { class: 'acc-item' },
            h('summary', { class: 'acc-summary' }, h('span', { class: 'sec-heading' }, pick(f, 'question')), icon('down', 'acc-chevron')),
            h('div', { class: 'acc-body' }, renderParagraphs(pick(f, 'answer'))),
          ),
        ),
      ),
    );
  }

  input.addEventListener(
    'input',
    debounce(() => {
      q = input.value.trim().slice(0, 100);
      paint();
    }, 200),
  );
  paint();
  return { el: root, title: t('faq.title'), destroy: subscribe(paint) };
}
