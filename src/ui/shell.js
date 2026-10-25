// App frame: top bar, scrolling main view, bottom tab bar, offline strip.
// Pages never create these themselves; the router tells the shell what to show.

import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { t, appName } from '../i18n/index.js';

const TABS = [
  { id: 'home', path: '/', icon: 'home', key: 'nav.home' },
  { id: 'laws', path: '/laws', icon: 'book', key: 'nav.laws' },
  { id: 'tools', path: '/tools', icon: 'calc', key: 'nav.tools' },
  { id: 'settings', path: '/settings', icon: 'settings', key: 'nav.settings' },
];

export function createShell(root, { onNavigate, onBack }) {
  const backBtn = h('button', { type: 'button', class: 'icon-btn topbar-back', onclick: onBack, 'aria-label': t('common.back'), hidden: true }, icon('back'));
  const titleEl = h('h1', { class: 'topbar-title', id: 'page-title' });
  const actionsEl = h('div', { class: 'topbar-actions' });
  const header = h('header', { class: 'topbar' }, backBtn, titleEl, actionsEl);

  const offlineBar = h('div', { class: 'offline-bar', role: 'status', hidden: true }, icon('offline'), h('span', null, t('common.offlineBanner')));

  const view = h('main', { class: 'view', id: 'view', tabindex: '-1' });

  const tabButtons = new Map();
  const tabbar = h(
    'nav',
    { class: 'tabbar', 'aria-label': 'Main' },
    TABS.map((tab) => {
      const label = h('span', { class: 'tab-label' }, t(tab.key));
      const btn = h('button', { type: 'button', class: 'tab', dataset: { tab: tab.id }, onclick: () => onNavigate(tab.path) }, icon(tab.icon), label);
      tabButtons.set(tab.id, { btn, label, tab });
      return btn;
    }),
  );

  const frame = h('div', { class: 'app' }, header, offlineBar, view, tabbar);
  root.appendChild(frame);

  return {
    view,
    frame,

    /** title: string; back: show the back arrow; actions: array of nodes */
    setHeader({ title, back = false, actions = [] }) {
      titleEl.textContent = title || appName();
      backBtn.hidden = !back;
      backBtn.setAttribute('aria-label', t('common.back'));
      clear(actionsEl);
      actions.forEach((a) => actionsEl.appendChild(a));
      document.title = title ? `${title} · ${appName()}` : appName();
    },

    /** Show/hide header and tab bar (welcome and auth screens are full-bleed). */
    setChrome(visible) {
      header.hidden = !visible;
      tabbar.hidden = !visible;
      frame.classList.toggle('no-chrome', !visible);
    },

    setActiveTab(id) {
      tabButtons.forEach(({ btn }, key) => {
        const active = key === id;
        btn.classList.toggle('active', active);
        if (active) btn.setAttribute('aria-current', 'page');
        else btn.removeAttribute('aria-current');
      });
    },

    setOffline(offline) {
      offlineBar.hidden = !offline;
    },

    /** Re-translate static labels after a language change. */
    refreshLabels() {
      tabButtons.forEach(({ label, tab }) => {
        label.textContent = t(tab.key);
      });
      offlineBar.querySelector('span').textContent = t('common.offlineBanner');
    },

    focusView() {
      view.scrollTop = 0;
      try {
        view.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    },
  };
}
