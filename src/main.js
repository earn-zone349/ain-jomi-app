// App entry point: boot order matters.
//   1. theme + language (so the first paint is already correct)
//   2. offline cache -> memory (screens can render with no network)
//   3. router + shell
//   4. auth, then a background content sync (never blocks the UI)

import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import { initTheme } from './core/theme.js';
import { initLang, onLangChange } from './i18n/index.js';
import { initContent, syncContent, subscribe, getStatus } from './core/content.js';
import { initAuth, onAuthChange } from './core/auth.js';
import { installGlobalHandlers, flushErrorQueue, logError } from './core/logger.js';
import { registerBackButton, hideSplash } from './core/platform.js';
import { createRouter } from './router.js';
import { createShell } from './ui/shell.js';
import { isOnboarded, getBlock, blockKey } from './core/appstate.js';

async function boot() {
  installGlobalHandlers();
  initTheme();
  initLang();

  const root = document.getElementById('app');
  if (!root) throw new Error('#app missing');

  try {
    await initContent();
  } catch (err) {
    logError(err, { where: 'initContent' });
  }

  const router = createRouter({
    guard(route, path) {
      if (route.gate === false) return null;
      if (!isOnboarded()) return '/welcome';
      if (getBlock()) return '/blocked';
      return null;
    },
  });

  const shell = createShell(root, {
    onNavigate: (path) => router.navigate(path),
    onBack: () => router.back(),
  });

  router.start(shell);
  registerBackButton(() => router.handleBackButton());
  hideSplash();

  // Language change: rebuild labels and re-render the page.
  onLangChange(() => {
    shell.refreshLabels();
    router.refresh();
  });

  // Offline strip.
  const updateOnline = () => shell.setOffline(!navigator.onLine);
  window.addEventListener('online', () => {
    updateOnline();
    syncContent({ force: true }).then(() => flushErrorQueue());
  });
  window.addEventListener('offline', updateOnline);
  updateOnline();

  // Re-evaluate the gate only when something that affects it changed.
  let lastBlock = blockKey();
  subscribe(() => {
    const k = blockKey();
    if (k !== lastBlock) {
      lastBlock = k;
      router.refresh();
    }
  });

  // Sync again when the app returns to the foreground.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncContent();
  });

  initAuth().then(() => {
    onAuthChange(() => {
      // Pages that show account state subscribe themselves; nothing global to do.
    });
    syncContent({ force: !getStatus().lastSyncAt });
    flushErrorQueue();
  });
}

boot().catch((err) => {
  // Last-resort screen if boot itself failed.
  const root = document.getElementById('app');
  if (root) {
    root.textContent = '';
    const p = document.createElement('p');
    p.className = 'fatal';
    p.textContent = 'Something went wrong while starting the app. Please restart it. / অ্যাপ চালু করতে সমস্যা হয়েছে, আবার চালু করুন।';
    root.appendChild(p);
  }
  console.error(err);
});
