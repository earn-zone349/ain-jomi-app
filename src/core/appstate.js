// App-level gates: onboarding (language + disclaimer) and server-controlled blocking
// (maintenance mode, minimum app version).

import { CONFIG } from '../config.js';
import { getJSON, setJSON } from './storage.js';
import { hasChosenLang } from '../i18n/index.js';
import { getSetting } from './content.js';
import { compareVersions } from '../lib/text.js';

export function isOnboarded() {
  const accepted = getJSON('disclaimer', null);
  return hasChosenLang() && Boolean(accepted) && accepted.version === CONFIG.disclaimerVersion;
}

export function acceptDisclaimer() {
  setJSON('disclaimer', { version: CONFIG.disclaimerVersion, at: new Date().toISOString() });
}

/**
 * Returns null when the app may be used, otherwise
 *   { type: 'maintenance', message_bn, message_en }  or  { type: 'update', minVersion }
 */
export function getBlock() {
  const maintenance = getSetting('maintenance_mode', null);
  if (maintenance && maintenance.enabled === true) {
    return { type: 'maintenance', message_bn: maintenance.message_bn || '', message_en: maintenance.message_en || '' };
  }
  const min = getSetting('min_app_version', null);
  if (typeof min === 'string' && compareVersions(CONFIG.appVersion, min) < 0) {
    return { type: 'update', minVersion: min };
  }
  return null;
}

export function blockKey() {
  const b = getBlock();
  return b ? `${b.type}:${b.minVersion || ''}:${b.message_en || ''}` : '';
}
