// Home: search, notices, law categories, sync status, and a peek at upcoming modules.

import { h, clear } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { banner, button, emptyState, sectionTitle } from '../ui/components.js';
import { t, pick, formatDate, appName } from '../i18n/index.js';
import {
  getCategories,
  getNotices,
  getDismissedNotices,
  dismissNotice,
  getStatus,
  subscribe,
  syncContent,
  getLawCount,
} from '../core/content.js';
import { getAuth } from '../core/auth.js';
import { toast } from '../ui/toast.js';
import { CONFIG } from '../config.js';

const NOTICE_TONE = { info: 'info', update: 'success', warning: 'warning' };
const NOTICE_ICON = { info: 'info', update: 'refresh', warning: 'alert' };

export default function render({ navigate }) {
  const root = h('div', { class: 'page' });

  const auth = getAuth();
  const name = auth.profile?.full_name;
  root.appendChild(h('div', { class: 'hero' }, h('p', { class: 'hero-hello' }, name ? t('home.helloName', { name }) : t('home.hello')), h('h2', { class: 'hero-title' }, t('home.heroTitle'))));

  // Search box: submit goes to the laws page with ?q=
  const input = h('input', { class: 'input search-input', type: 'search', placeholder: t('home.searchPlaceholder'), 'aria-label': t('laws.search'), enterkeyhint: 'search' });
  const form = h(
    'form',
    {
      class: 'searchbar',
      role: 'search',
      onsubmit: (e) => {
        e.preventDefault();
        const q = input.value.trim();
        navigate(q ? `/laws?q=${encodeURIComponent(q)}` : '/laws');
      },
    },
    icon('search'),
    input,
  );
  root.appendChild(form);

  const dynamic = h('div', { class: 'stack' });
  root.appendChild(dynamic);

  function paint() {
    clear(dynamic);

    // Notices
    const dismissed = getDismissedNotices();
    for (const n of getNotices()) {
      const key = `${n.id}:${n.updated_at}`;
      if (dismissed.has(key)) continue;
      const kind = NOTICE_TONE[n.kind] ? n.kind : 'info';
      const closeBtn = h('button', { type: 'button', class: 'icon-btn icon-btn-sm', 'aria-label': t('common.close'), onclick: () => { dismissNotice(key); paint(); } }, icon('close'));
      const body = pick(n, 'body');
      dynamic.appendChild(
        h(
          'div',
          { class: `notice notice-${NOTICE_TONE[kind]}` },
          icon(NOTICE_ICON[kind]),
          h('div', { class: 'notice-text' }, h('strong', null, pick(n, 'title')), body ? h('p', null, body) : null),
          closeBtn,
        ),
      );
    }

    // Sync status line
    const st = getStatus();
    dynamic.appendChild(statusLine(st));

    // Categories
    const cats = getCategories();
    dynamic.appendChild(sectionTitle(t('home.categories')));
    if (!cats.length) {
      dynamic.appendChild(
        emptyState({
          iconName: st.syncing ? 'refresh' : 'book',
          title: st.syncing ? t('home.loadingContent') : t('home.noContent'),
          body: st.syncing ? null : st.lastError === 'offline' ? t('home.noContentOffline') : t('home.noContentHint'),
          action: st.syncing ? null : button(t('settings.syncNow'), { variant: 'primary', icon: 'refresh', onClick: () => manualSync() }),
        }),
      );
    } else {
      dynamic.appendChild(
        h(
          'div',
          { class: 'grid grid-2' },
          cats.map((c) =>
            h(
              'a',
              { class: 'tile', href: `#/laws?cat=${encodeURIComponent(c.id)}` },
              h('span', { class: 'tile-icon' }, icon(c.icon || 'book')),
              h('span', { class: 'tile-title' }, pick(c, 'name')),
            ),
          ),
        ),
      );
      if (getLawCount() === 0) dynamic.appendChild(banner(t('home.noLawsYet'), { tone: 'info', iconName: 'info' }));
    }

    // Coming soon strip
    dynamic.appendChild(sectionTitle(t('home.comingSoon'), h('a', { class: 'link', href: '#/tools' }, t('home.seeAll'))));
    dynamic.appendChild(
      h(
        'div',
        { class: 'chips chips-wrap' },
        CONFIG.modules.map((m) => h('span', { class: 'chip chip-static' }, icon(m.icon, 'icon-inline'), t(`mod.${m.id}.title`))),
      ),
    );
  }

  async function manualSync() {
    const res = await syncContent({ force: true });
    if (!res.ok) toast(res.reason === 'offline' ? t('error.offline') : t('error.syncFailed'), { tone: 'error' });
  }

  paint();
  const unsubscribe = subscribe(paint);
  return { el: root, title: appName(), destroy: unsubscribe };
}

function statusLine(st) {
  let text;
  let tone = 'muted';
  if (st.syncing) text = t('sync.updating');
  else if (st.lastError === 'offline') {
    text = st.lastSyncAt ? t('sync.offlineSaved', { date: formatDate(st.lastSyncAt) }) : t('sync.offlineNone');
    tone = 'warning';
  } else if (st.lastError === 'failed') {
    text = t('sync.failedSaved');
    tone = 'warning';
  } else if (st.lastError === 'not_configured') text = t('sync.notConfigured');
  else if (st.lastSyncAt) text = t('sync.updatedOn', { date: formatDate(st.lastSyncAt) });
  else text = t('sync.never');
  return h('p', { class: `sync-line sync-${tone}` }, icon(st.syncing ? 'refresh' : tone === 'warning' ? 'offline' : 'check'), text);
}
