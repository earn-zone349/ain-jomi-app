// Settings: account, language, appearance, offline content, legal, about.

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { button, listRow, segmented, sectionTitle, externalLink, setBusy } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { t, getLang, setLang, formatDateTime, num } from '../i18n/index.js';
import { getThemeMode, setThemeMode, getTextSize, setTextSize } from '../core/theme.js';
import { getAuth, onAuthChange, signOut, deleteMyAccount, isStaff } from '../core/auth.js';
import { getStatus, subscribe, syncContent, clearOfflineData, getLawCount } from '../core/content.js';
import { removeByPrefix } from '../core/storage.js';
import { CONFIG, SUPABASE_CONFIGURED } from '../config.js';
import { isPersistent } from '../core/idb.js';
import { errorCode } from '../core/supabase.js';
import { logError } from '../core/logger.js';

export default function render({ navigate, router }) {
  const root = h('div', { class: 'page' });

  function card(title, ...children) {
    return h('section', { class: 'card' }, sectionTitle(title), ...children);
  }

  function paint() {
    root.replaceChildren();
    const auth = getAuth();
    const st = getStatus();

    // --- Account ---
    const accountBody = [];
    if (auth.signedIn) {
      accountBody.push(
        h('div', { class: 'account' }, h('span', { class: 'avatar' }, icon('user')), h('div', null, h('strong', null, auth.profile?.full_name || auth.email), h('p', { class: 'muted small' }, auth.email))),
        h(
          'div',
          { class: 'btn-row' },
          button(t('settings.signOut'), { icon: 'logout', onClick: onSignOut }),
          button(t('settings.deleteAccount'), { variant: 'danger', icon: 'trash', onClick: onDeleteAccount }),
        ),
      );
      if (isStaff() && CONFIG.webBaseUrl) accountBody.push(h('p', { class: 'small' }, externalLink(`${CONFIG.webBaseUrl}/admin/`, t('settings.openAdmin'))));
    } else {
      accountBody.push(
        h('p', { class: 'muted' }, t('settings.guestNote')),
        h('div', { class: 'btn-row' }, button(t('auth.login'), { variant: 'primary', onClick: () => navigate('/login?next=/settings') }), button(t('auth.register'), { onClick: () => navigate('/register?next=/settings') })),
      );
    }
    root.appendChild(card(t('settings.account'), ...accountBody));

    // --- Language ---
    root.appendChild(
      card(
        t('settings.language'),
        segmented({
          name: 'lang',
          ariaLabel: t('settings.language'),
          value: getLang(),
          options: [
            { value: 'bn', label: 'বাংলা' },
            { value: 'en', label: 'English' },
          ],
          onChange: (v) => setLang(v),
        }),
      ),
    );

    // --- Appearance ---
    root.appendChild(
      card(
        t('settings.appearance'),
        h('p', { class: 'label' }, t('settings.theme')),
        segmented({
          name: 'theme',
          ariaLabel: t('settings.theme'),
          value: getThemeMode(),
          options: [
            { value: 'system', label: t('settings.theme.system') },
            { value: 'light', label: t('settings.theme.light') },
            { value: 'dark', label: t('settings.theme.dark') },
          ],
          onChange: setThemeMode,
        }),
        h('p', { class: 'label label-spaced' }, t('settings.textSize')),
        segmented({
          name: 'size',
          ariaLabel: t('settings.textSize'),
          value: getTextSize(),
          options: [
            { value: 'small', label: t('settings.size.small') },
            { value: 'normal', label: t('settings.size.normal') },
            { value: 'large', label: t('settings.size.large') },
          ],
          onChange: setTextSize,
        }),
      ),
    );

    // --- Content & offline ---
    const syncBtn = button(st.syncing ? t('sync.updating') : t('settings.syncNow'), { variant: 'primary', icon: 'refresh', disabled: st.syncing, onClick: () => onSync(syncBtn) });
    root.appendChild(
      card(
        t('settings.content'),
        h(
          'dl',
          { class: 'facts' },
          fact(t('settings.lastSync'), st.lastSyncAt ? formatDateTime(st.lastSyncAt) : t('settings.never')),
          fact(t('settings.lawsSaved'), num(getLawCount())),
          fact(t('settings.offlineStorage'), isPersistent() ? t('settings.storage.ok') : t('settings.storage.memory')),
        ),
        h('div', { class: 'btn-row' }, syncBtn, button(t('settings.clearOffline'), { icon: 'trash', onClick: onClearOffline })),
      ),
    );

    // --- Legal ---
    root.appendChild(
      card(
        t('settings.legal'),
        h(
          'div',
          { class: 'list list-flush' },
          listRow({ iconName: 'file', title: t('legal.disclaimer'), onClick: () => navigate('/legal/disclaimer') }),
          listRow({ iconName: 'file', title: t('legal.terms'), onClick: () => navigate('/legal/terms') }),
          listRow({ iconName: 'lock', title: t('legal.privacy'), onClick: () => navigate('/legal/privacy') }),
        ),
      ),
    );

    // --- About ---
    root.appendChild(
      card(
        t('settings.about'),
        h(
          'dl',
          { class: 'facts' },
          fact(t('settings.version'), CONFIG.appVersion),
          fact(t('settings.server'), SUPABASE_CONFIGURED ? t('settings.server.connected') : t('settings.server.none')),
          CONFIG.supportEmail ? fact(t('settings.contact'), h('a', { class: 'link', href: `mailto:${CONFIG.supportEmail}` }, CONFIG.supportEmail)) : null,
        ),
      ),
    );
  }

  async function onSync(btn) {
    setBusy(btn, true);
    const res = await syncContent({ force: true });
    setBusy(btn, false);
    if (res.ok) toast(t('settings.syncDone'), { tone: 'success' });
    else toast(res.reason === 'offline' ? t('error.offline') : res.reason === 'not_configured' ? t('sync.notConfigured') : t('error.syncFailed'), { tone: 'error' });
  }

  async function onClearOffline() {
    const ok = await confirmDialog({ title: t('settings.clearOffline'), message: t('settings.clearConfirm'), confirmLabel: t('settings.clearOffline'), danger: true });
    if (!ok) return;
    await clearOfflineData();
    removeByPrefix('dismissedNotices');
    toast(t('settings.cleared'));
    paint();
  }

  async function onSignOut() {
    await signOut();
    toast(t('settings.signedOut'));
  }

  async function onDeleteAccount() {
    const ok = await confirmDialog({ title: t('settings.deleteAccount'), message: t('settings.deleteConfirm'), confirmLabel: t('settings.deleteAccount'), danger: true });
    if (!ok) return;
    const res = await deleteMyAccount();
    if (res.ok) {
      toast(t('settings.deleted'), { tone: 'success' });
      router.refresh();
    } else {
      logError(res.error, { where: 'deleteAccount' });
      toast(errorCode(res.error) === 'offline' ? t('error.offline') : t('error.generic'), { tone: 'error' });
    }
  }

  paint();
  const offAuth = onAuthChange(paint);
  const offContent = subscribe(paint);
  return {
    el: root,
    title: t('nav.settings'),
    destroy() {
      offAuth();
      offContent();
    },
  };
}

function fact(label, value) {
  return h('div', { class: 'fact' }, h('dt', null, label), h('dd', null, value));
}
