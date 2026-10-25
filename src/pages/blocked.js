// Full-screen block: maintenance mode or "please update the app" (controlled from app_settings).

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { button } from '../ui/components.js';
import { t, getLang, appName } from '../i18n/index.js';
import { getBlock } from '../core/appstate.js';
import { syncContent } from '../core/content.js';

export default function render({ router }) {
  const block = getBlock();
  const isUpdate = block?.type === 'update';
  const custom = block && (getLang() === 'bn' ? block.message_bn : block.message_en);

  const retry = button(t('common.retry'), {
    variant: 'primary',
    icon: 'refresh',
    onClick: async () => {
      await syncContent({ force: true });
      router.refresh();
    },
  });

  const el = h(
    'div',
    { class: 'welcome blocked' },
    h('div', { class: 'welcome-brand' }, h('div', { class: 'logo-mark' }, icon(isUpdate ? 'refresh' : 'alert')), h('h1', null, appName())),
    h('h2', { class: 'welcome-q' }, isUpdate ? t('blocked.updateTitle') : t('blocked.maintTitle')),
    h('p', { class: 'state-body' }, custom || (isUpdate ? t('blocked.updateBody', { v: block.minVersion }) : t('blocked.maintBody'))),
    retry,
  );
  return { el, title: appName() };
}
