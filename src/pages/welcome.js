// First-run screen: choose language, then read and accept the disclaimer.

import { h } from '../ui/dom.js';
import { button } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { renderDoc } from '../ui/richtext.js';
import { t, setLang, getLang, hasChosenLang, pick, appName } from '../i18n/index.js';
import { getLegalPage } from '../core/content.js';
import { acceptDisclaimer } from '../core/appstate.js';

// Survives the page re-render that happens when the language changes.
let step = 1;

export default function render({ router }) {
  if (!hasChosenLang()) step = 1;

  const el = h('div', { class: 'welcome' });
  const brand = h('div', { class: 'welcome-brand' }, h('div', { class: 'logo-mark' }, icon('scale')), h('h1', null, appName()), h('p', null, t('welcome.tagline')));
  el.appendChild(brand);

  if (step === 1) {
    el.appendChild(h('h2', { class: 'welcome-q' }, 'ভাষা বাছাই করুন / Choose your language'));
    const langs = [
      { code: 'bn', label: 'বাংলা', sub: 'Bangla' },
      { code: 'en', label: 'English', sub: 'ইংরেজি' },
    ];
    el.appendChild(
      h(
        'div',
        { class: 'lang-grid' },
        langs.map((l) =>
          h(
            'button',
            {
              type: 'button',
              class: `lang-card${hasChosenLang() && getLang() === l.code ? ' selected' : ''}`,
              onclick: () => {
                step = 2; // set first: changing the language re-renders this page
                setLang(l.code); // always persists, which also marks the language as chosen
                router.refresh();
              },
            },
            h('span', { class: 'lang-name' }, l.label),
            h('span', { class: 'lang-sub' }, l.sub),
          ),
        ),
      ),
    );
    return { el, title: appName() };
  }

  const page = getLegalPage('disclaimer');
  const check = h('input', { type: 'checkbox', id: 'accept', class: 'check' });
  const go = button(t('welcome.start'), {
    variant: 'primary',
    block: true,
    disabled: true,
    onClick: () => {
      acceptDisclaimer();
      step = 1;
      router.navigate('/', { replace: true });
    },
  });
  check.addEventListener('change', () => {
    go.disabled = !check.checked;
  });

  el.appendChild(h('div', { class: 'welcome-card' }, page ? renderDoc(pick(page, 'body')) : null));
  el.appendChild(h('label', { class: 'check-row', for: 'accept' }, check, h('span', null, t('welcome.accept'))));
  el.appendChild(go);
  el.appendChild(
    h(
      'p',
      { class: 'welcome-links' },
      h('a', { href: '#/legal/terms', class: 'link' }, t('legal.terms')),
      ' · ',
      h('a', { href: '#/legal/privacy', class: 'link' }, t('legal.privacy')),
    ),
  );
  return { el, title: appName() };
}
