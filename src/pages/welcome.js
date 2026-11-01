// First-run screen: choose the language, then straight to Home. The disclaimer is in Settings.

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { t, setLang, getLang, hasChosenLang, appName } from '../i18n/index.js';
import { acceptDisclaimer } from '../core/appstate.js';

export default function render({ router }) {
  const el = h('div', { class: 'welcome' });
  const brand = h('div', { class: 'welcome-brand' }, h('div', { class: 'logo-mark' }, icon('scale')), h('h1', null, appName()), h('p', null, t('welcome.tagline')));
  el.appendChild(brand);

  {
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
                setLang(l.code); // always persists, which also marks the language as chosen
                acceptDisclaimer(); // the disclaimer stays readable in Settings > Disclaimer; no extra screen
                router.navigate('/', { replace: true });
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

  return { el, title: appName() };
}
