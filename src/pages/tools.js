// Tools tab: the modules (land calculator, inheritance, ...). A module that ships inside the app (bundled) is
// always available; the others show "coming soon" until their server flag is on AND their route exists.

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { badge, banner } from '../ui/components.js';
import { t } from '../i18n/index.js';
import { CONFIG } from '../config.js';
import { getSetting } from '../core/content.js';

export default function render({ navigate }) {
  const flags = getSetting('feature_flags', {}) || {};
  const root = h('div', { class: 'page' });
  root.appendChild(banner(t('tools.intro'), { tone: 'info', iconName: 'info' }));

  const list = h('div', { class: 'stack' });
  for (const m of CONFIG.modules) {
    const available = Boolean(m.route) && (Boolean(m.bundled) || Boolean(flags[m.id]));
    const card = h(
      available ? 'button' : 'div',
      {
        class: `module${available ? ' module-live' : ''}`,
        type: available ? 'button' : undefined,
        onclick: available ? () => navigate(m.route) : undefined,
      },
      h('span', { class: 'module-icon' }, icon(m.icon)),
      h('span', { class: 'module-text' }, h('strong', null, t(`mod.${m.id}.title`)), h('span', { class: 'muted small' }, t(`mod.${m.id}.desc`))),
      available ? icon('next', 'row-chevron') : badge(t('tools.soon'), 'neutral'),
    );
    list.appendChild(card);
  }
  root.appendChild(list);
  return { el: root, title: t('nav.tools') };
}
