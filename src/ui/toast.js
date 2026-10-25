import { h } from './dom.js';

let host = null;

function ensureHost() {
  if (host && host.isConnected) return host;
  host = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
  document.body.appendChild(host);
  return host;
}

/** toast('Saved'), toast('Failed', {tone:'error'}) */
export function toast(message, { tone = 'info', ms = 3200 } = {}) {
  const el = h('div', { class: `toast toast-${tone}` }, message);
  ensureHost().appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 250);
  }, ms);
}
