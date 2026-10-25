import { h } from '../ui/dom.js';
import { emptyState, button } from '../ui/components.js';
import { t } from '../i18n/index.js';

export default function render({ navigate }) {
  const el = h('div', { class: 'page' }, emptyState({ iconName: 'search', title: t('notfound.title'), body: t('notfound.body'), action: button(t('nav.home'), { variant: 'primary', onClick: () => navigate('/', { replace: true }) }) }));
  return { el, title: t('notfound.title') };
}
