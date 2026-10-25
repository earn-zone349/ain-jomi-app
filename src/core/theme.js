// Theme (system / light / dark) and text size. Applied as data attributes on <html>,
// styled by CSS variables in styles/tokens.css.

import { getString, setString } from './storage.js';
import { setStatusBar } from './platform.js';

export const THEME_MODES = ['system', 'light', 'dark'];
export const TEXT_SIZES = ['small', 'normal', 'large'];

const STATUS_COLORS = { light: '#0f5c4d', dark: '#0e1513' };

let mode = 'system';
let size = 'normal';
let media = null;

function resolved() {
  if (mode === 'light' || mode === 'dark') return mode;
  return media && media.matches ? 'dark' : 'light';
}

function apply() {
  const r = resolved();
  const root = document.documentElement;
  root.dataset.theme = r;
  root.dataset.textSize = size;
  // Both status-bar colours are dark, so the icons are always light ("Style.Dark" in Capacitor terms).
  setStatusBar({ dark: true, color: STATUS_COLORS[r] });
}

export function initTheme() {
  const m = getString('theme', 'system');
  const s = getString('textSize', 'normal');
  mode = THEME_MODES.includes(m) ? m : 'system';
  size = TEXT_SIZES.includes(s) ? s : 'normal';
  try {
    media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', () => {
      if (mode === 'system') apply();
    });
  } catch {
    media = null;
  }
  apply();
}

export function getThemeMode() {
  return mode;
}

export function setThemeMode(next) {
  if (!THEME_MODES.includes(next)) return;
  mode = next;
  setString('theme', next);
  apply();
}

export function getTextSize() {
  return size;
}

export function setTextSize(next) {
  if (!TEXT_SIZES.includes(next)) return;
  size = next;
  setString('textSize', next);
  apply();
}
