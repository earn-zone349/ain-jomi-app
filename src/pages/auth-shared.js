// Shared bits of the auth screens.

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { t, appName } from '../i18n/index.js';
import { SUPABASE_CONFIGURED } from '../config.js';
import { banner } from '../ui/components.js';

/** Only allow in-app paths as "next" targets (blocks open-redirect style values). */
export function safeNext(value) {
  const v = String(value || '');
  return v.startsWith('/') && !v.startsWith('//') ? v : '/';
}

export function authFrame(title, ...children) {
  return h(
    'div',
    { class: 'auth' },
    h('a', { class: 'auth-close icon-btn', href: '#/', 'aria-label': t('common.close') }, icon('close')),
    h('div', { class: 'welcome-brand' }, h('div', { class: 'logo-mark' }, icon('scale')), h('h1', null, appName())),
    h('h2', { class: 'auth-title' }, title),
    SUPABASE_CONFIGURED ? null : banner(t('auth.notConfigured'), { tone: 'warning', iconName: 'alert' }),
    ...children,
  );
}

/** Map an errorCode() result to translated text. */
export function authErrorText(code) {
  const map = {
    badCredentials: 'auth.err.badCredentials',
    emailNotConfirmed: 'auth.err.emailNotConfirmed',
    emailTaken: 'auth.err.emailTaken',
    rateLimited: 'auth.err.rateLimited',
    weakPassword: 'auth.err.weakPassword',
    offline: 'error.offline',
  };
  return t(map[code] || 'error.generic');
}
