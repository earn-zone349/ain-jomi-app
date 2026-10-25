// Hash router with lazy-loaded pages.
//
// A page module default-exports  render(ctx) -> { el, title?, actions?, destroy? }  (sync or async).
//   ctx = { params, query, navigate, shell, route }
// Route flags: tab (which tab is highlighted), back (show back arrow), chrome (false = full-bleed page).

import { h } from './ui/dom.js';
import { emptyState, button } from './ui/components.js';
import { closeTopDialog } from './ui/dialog.js';
import { t } from './i18n/index.js';
import { logError } from './core/logger.js';
import { icon } from './ui/icons.js';

const ROUTES = [
  { path: '/welcome', load: () => import('./pages/welcome.js'), chrome: false, gate: false },
  { path: '/blocked', load: () => import('./pages/blocked.js'), chrome: false, gate: false },
  { path: '/', load: () => import('./pages/home.js'), tab: 'home' },
  { path: '/laws', load: () => import('./pages/laws.js'), tab: 'laws' },
  { path: '/law/:id', load: () => import('./pages/law.js'), tab: 'laws', back: true },
  { path: '/tools', load: () => import('./pages/tools.js'), tab: 'tools' },
  { path: '/settings', load: () => import('./pages/settings.js'), tab: 'settings' },
  { path: '/login', load: () => import('./pages/login.js'), chrome: false },
  { path: '/register', load: () => import('./pages/register.js'), chrome: false },
  { path: '/forgot', load: () => import('./pages/forgot.js'), chrome: false },
  { path: '/legal/:slug', load: () => import('./pages/legal.js'), tab: 'settings', back: true, gate: false },
];

const NOT_FOUND = { path: '*', load: () => import('./pages/notfound.js'), tab: null, back: true };

function compile(path) {
  const keys = [];
  const re = new RegExp(
    '^' +
      path.replace(/\/:(\w+)/g, (_, k) => {
        keys.push(k);
        return '/([^/]+)';
      }) +
      '/?$',
  );
  return { re, keys };
}
const COMPILED = ROUTES.map((r) => ({ route: r, ...compile(r.path) }));

export function parseHash(hash) {
  const raw = (hash || '').replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  const query = Object.fromEntries(new URLSearchParams(queryPart));
  return { path, query };
}

export function matchRoute(path) {
  for (const { route, re, keys } of COMPILED) {
    const m = re.exec(path);
    if (m) {
      const params = {};
      keys.forEach((k, i) => {
        try {
          params[k] = decodeURIComponent(m[i + 1]);
        } catch {
          params[k] = m[i + 1];
        }
      });
      return { route, params };
    }
  }
  return { route: NOT_FOUND, params: {} };
}

export function createRouter({ guard } = {}) {
  let shell = null;
  let current = null; // { destroy }
  let token = 0;
  let idx = 0;

  const router = {
    start(shellInstance) {
      shell = shellInstance;
      history.replaceState({ idx: 0 }, '', location.hash || '#/');
      window.addEventListener('popstate', (e) => {
        idx = e.state && typeof e.state.idx === 'number' ? e.state.idx : 0;
        render();
      });
      render();
    },

    navigate(path, { replace = false } = {}) {
      const url = `#${path}`;
      if (replace) history.replaceState({ idx }, '', url);
      else {
        idx += 1;
        history.pushState({ idx }, '', url);
      }
      render();
    },

    /** Re-render the current page (language/theme changes, sync completed). */
    refresh() {
      render();
    },

    back() {
      if (idx > 0) history.back();
      else router.navigate('/', { replace: true });
    },

    /** Android back button. Returns true if the press was handled inside the app. */
    handleBackButton() {
      if (closeTopDialog()) return true;
      const { path } = parseHash(location.hash);
      if (path === '/welcome') return false;
      if (idx > 0) {
        history.back();
        return true;
      }
      if (path !== '/') {
        router.navigate('/', { replace: true });
        return true;
      }
      return false;
    },

    currentPath() {
      return parseHash(location.hash).path;
    },
  };

  async function render() {
    const myToken = ++token;
    const { path, query } = parseHash(location.hash);
    const { route, params } = matchRoute(path);

    // Guard (onboarding, maintenance...) may redirect.
    const redirect = guard ? guard(route, path) : null;
    if (redirect && redirect !== path) {
      router.navigate(redirect, { replace: true });
      return;
    }

    if (current?.destroy) {
      try {
        current.destroy();
      } catch {
        /* ignore */
      }
    }
    current = null;

    const sh = shell;
    sh.setChrome(route.chrome !== false);
    sh.setActiveTab(route.tab ?? null);
    sh.view.replaceChildren();
    sh.view.classList.toggle('view-full', route.chrome === false);

    try {
      const mod = await route.load();
      if (myToken !== token) return; // user navigated again while loading
      const ctx = { params, query, route, shell: sh, navigate: router.navigate, router };
      const page = await mod.default(ctx);
      if (myToken !== token) {
        page?.destroy?.();
        return;
      }
      current = page;
      sh.setHeader({ title: page.title, back: Boolean(route.back), actions: page.actions || [] });
      sh.view.replaceChildren(page.el);
      sh.focusView();
    } catch (err) {
      if (myToken !== token) return;
      logError(err, { where: 'router', path });
      sh.setHeader({ title: t('common.error'), back: true });
      sh.view.replaceChildren(
        emptyState({
          iconName: 'alert',
          title: t('error.pageFailed'),
          body: t('error.pageFailedHint'),
          action: button(t('common.retry'), { variant: 'primary', icon: 'refresh', onClick: () => render() }),
        }),
      );
    }
  }

  return router;
}

// Re-exported for pages that need a tiny inline link to another route.
export function linkTo(path, label, className = 'link') {
  return h('a', { class: className, href: `#${path}` }, label, icon('next', 'icon-inline'));
}
