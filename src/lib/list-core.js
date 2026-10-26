// Pure helpers for the "saved" and "recently viewed" lists. No DOM, no storage.

/** Adds id if missing, removes it if present. Returns a new array. */
export function toggleInList(list, id) {
  const arr = Array.isArray(list) ? list : [];
  return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
}

/** Puts id first, removes duplicates, keeps at most max items. Returns a new array. */
export function pushRecent(list, id, max = 10) {
  const arr = Array.isArray(list) ? list : [];
  return [id, ...arr.filter((x) => x !== id)].slice(0, max);
}

/** Keeps only ids that still exist (a law can disappear in a new app version). */
export function pruneList(list, exists) {
  return (Array.isArray(list) ? list : []).filter((id) => exists(id));
}
