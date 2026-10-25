// Safe wrapper over localStorage: never throws (private mode, quota, disabled storage).

const PREFIX = 'aj:';

let memoryFallback = new Map();

function ls() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getString(key, fallback = null) {
  const store = ls();
  try {
    const v = store ? store.getItem(PREFIX + key) : memoryFallback.get(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function setString(key, value) {
  const store = ls();
  try {
    if (store) store.setItem(PREFIX + key, String(value));
    else memoryFallback.set(key, String(value));
    return true;
  } catch {
    memoryFallback.set(key, String(value));
    return false;
  }
}

export function getJSON(key, fallback = null) {
  const raw = getString(key, null);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setJSON(key, value) {
  return setString(key, JSON.stringify(value));
}

export function remove(key) {
  const store = ls();
  try {
    if (store) store.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
  memoryFallback.delete(key);
}

/** Remove every key this app owns (used by "clear offline data" and sign-out hygiene). */
export function removeByPrefix(subPrefix) {
  const store = ls();
  try {
    if (store) {
      const doomed = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith(PREFIX + subPrefix)) doomed.push(k);
      }
      doomed.forEach((k) => store.removeItem(k));
    }
  } catch {
    /* ignore */
  }
  for (const k of [...memoryFallback.keys()]) if (k.startsWith(subPrefix)) memoryFallback.delete(k);
}
