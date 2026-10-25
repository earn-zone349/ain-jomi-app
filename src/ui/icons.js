// Small stroke icon set (24x24). Each icon is a list of SVG path "d" strings.

import { svgEl } from './dom.js';

const ICONS = {
  home: ['M3 11l9-8 9 8', 'M5 10v10h14V10', 'M10 20v-6h4v6'],
  book: ['M5 4h9a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z', 'M9 8h5'],
  scale: ['M12 3v18', 'M6 21h12', 'M5 7h14', 'M5 7l-3 7h6z', 'M19 7l-3 7h6z', 'M2 14a3 3 0 0 0 6 0', 'M16 14a3 3 0 0 0 6 0'],
  land: ['M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z', 'M9 4v14', 'M15 6v14'],
  family: ['M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1', 'M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7', 'M21 20v-1a4 4 0 0 0-3-3.9', 'M16 4.2a3.5 3.5 0 0 1 0 6.6'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'],
  briefcase: ['M3 8h18v12H3z', 'M8 8V5h8v3', 'M3 13h18'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  calc: ['M6 3h12v18H6z', 'M9 7h6', 'M9 12h.01', 'M12 12h.01', 'M15 12h.01', 'M9 16h.01', 'M12 16h.01', 'M15 16h.01'],
  settings: ['M4 6h10', 'M18 6h2', 'M4 12h4', 'M12 12h8', 'M4 18h12', 'M20 18h0', 'M16 4v4', 'M10 10v4', 'M18 16v4'],
  user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16', 'M21 21l-4.3-4.3'],
  back: ['M15 18l-6-6 6-6'],
  next: ['M9 18l6-6-6-6'],
  down: ['M6 9l6 6 6-6'],
  up: ['M6 15l6-6 6 6'],
  alert: ['M12 3l10 18H2z', 'M12 10v4', 'M12 17h.01'],
  check: ['M5 12l5 5 9-10'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  offline: ['M2 8.5a15 15 0 0 1 20 0', 'M5 12a10 10 0 0 1 14 0', 'M8.5 15.5a5 5 0 0 1 7 0', 'M12 19h.01', 'M3 3l18 18'],
  refresh: ['M20 11a8 8 0 0 0-14-4L4 9', 'M4 4v5h5', 'M4 13a8 8 0 0 0 14 4l2-2', 'M20 20v-5h-5'],
  globe: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18', 'M3 12h18', 'M12 3a14 14 0 0 1 0 18', 'M12 3a14 14 0 0 0 0 18'],
  moon: ['M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v6H4V6h6'],
  share: ['M4 12v8h16v-8', 'M12 3v13', 'M7 8l5-5 5 5'],
  flag: ['M5 21V4', 'M5 4h12l-2 4 2 4H5'],
  bot: ['M5 8h14v11H5z', 'M12 8V4', 'M9 13h.01', 'M15 13h.01', 'M3 13v2', 'M21 13v2', 'M9 17h6'],
  file: ['M6 3h8l4 4v14H6z', 'M14 3v4h4', 'M9 12h6', 'M9 16h6'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18', 'M12 11v5', 'M12 8h.01'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  logout: ['M9 21H4V3h5', 'M16 17l5-5-5-5', 'M21 12H9'],
  mail: ['M3 5h18v14H3z', 'M3 6l9 7 9-7'],
  gavel: ['M14 4l6 6', 'M11 7l6 6-4 4-6-6z', 'M3 21l7-7', 'M8 21h8'],
  building: ['M4 21V5l8-2v18', 'M12 9h8v12', 'M3 21h18', 'M8 8h.01', 'M8 12h.01', 'M8 16h.01', 'M16 13h.01', 'M16 17h.01'],
  bank: ['M3 10l9-6 9 6', 'M5 10v8', 'M9 10v8', 'M15 10v8', 'M19 10v8', 'M3 21h18'],
  coins: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18', 'M15 9.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2.2s1.2 1.8 3 2.1 3 .8 3 2.2-1.3 2.2-3 2.2c-1.3 0-2.4-.5-3-1.5', 'M12 6v2', 'M12 16v2'],
  laptop: ['M5 5h14v10H5z', 'M2 19h20'],
  leaf: ['M5 19c0-8 5-14 15-14 0 10-6 15-14 15', 'M5 19c3-5 6-8 10-10'],
  car: ['M3 14l2-6h14l2 6', 'M3 14h18v4H3z', 'M7 18v2', 'M17 18v2', 'M7 16h.01', 'M17 16h.01'],
  vote: ['M4 12h16v8H4z', 'M8 12V5h8v7', 'M10 8h4'],
  graduation: ['M2 9l10-5 10 5-10 5z', 'M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5'],
  copyright: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18', 'M14.5 9.5a3.5 3.5 0 1 0 0 5'],
  heart: ['M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z'],
};

/** icon('home') -> <svg> element. Size and colour come from CSS (.icon). */
export function icon(name, extraClass = '') {
  const svg = svgEl('svg', {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    class: `icon ${extraClass}`.trim(),
  });
  for (const d of ICONS[name] || ICONS.book) svg.appendChild(svgEl('path', { d }));
  return svg;
}

export const ICON_NAMES = Object.keys(ICONS);
