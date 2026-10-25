// Terms / Privacy / Disclaimer viewer. Uses the server copy when synced, otherwise the
// copy bundled in the app, so it always works offline.

import { h } from '../ui/dom.js';
import { emptyState } from '../ui/components.js';
import { renderDoc } from '../ui/richtext.js';
import { t, pick } from '../i18n/index.js';
import { getLegalPage } from '../core/content.js';

const KEYS = { terms: 'legal.terms', privacy: 'legal.privacy', disclaimer: 'legal.disclaimer' };

export default function render({ params }) {
  const slug = params.slug;
  const page = KEYS[slug] ? getLegalPage(slug) : null;
  const root = h('div', { class: 'page' });
  if (!page) {
    root.appendChild(emptyState({ iconName: 'file', title: t('law.notFound') }));
    return { el: root, title: t('common.error') };
  }
  root.appendChild(h('article', { class: 'card' }, renderDoc(pick(page, 'body'))));
  return { el: root, title: t(KEYS[slug]) };
}
