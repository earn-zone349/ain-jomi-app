// The user's personal shelf: saved laws and recently viewed laws. Stored on the phone only.

import { getJSON, setJSON } from './storage.js';
import { toggleInList, pushRecent, pruneList } from '../lib/list-core.js';
import { getLaw } from './content.js';

const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export function subscribeLibrary(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getSavedIds = () => pruneList(getJSON('savedLaws', []), (id) => Boolean(getLaw(id)));
export const getRecentIds = () => pruneList(getJSON('recentLaws', []), (id) => Boolean(getLaw(id)));
export const isSaved = (id) => getSavedIds().includes(id);

/** Returns the new saved state (true = now saved). */
export function toggleSaved(id) {
  const next = toggleInList(getJSON('savedLaws', []), id);
  setJSON('savedLaws', next);
  emit();
  return next.includes(id);
}

export function addRecent(id) {
  setJSON('recentLaws', pushRecent(getJSON('recentLaws', []), id, 10));
  emit();
}
