// Tiny IndexedDB key-value layer used for the offline content cache.
// One object store per content table (keyPath "id") plus a "meta" store (keyPath "key").
// If IndexedDB is unavailable, falls back to memory so the app still works (just not offline).

import { CONTENT_TABLES } from '../lib/sync-core.js';

const DB_NAME = 'ain-jomi';
const DB_VERSION = 1;
const META = 'meta';
export const STORES = [...CONTENT_TABLES, META];

let dbPromise = null;
const memory = new Map(STORES.map((s) => [s, new Map()]));
let usingMemory = false;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      usingMemory = true;
      resolve(null);
      return;
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      usingMemory = true;
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of CONTENT_TABLES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      usingMemory = true;
      resolve(null);
    };
    req.onblocked = () => {
      usingMemory = true;
      resolve(null);
    };
  });
  return dbPromise;
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
  });
}

export function isPersistent() {
  return !usingMemory;
}

export async function getAll(store) {
  const db = await open();
  if (!db) return [...memory.get(store).values()];
  return wrap(db.transaction(store, 'readonly').objectStore(store).getAll());
}

export async function putMany(store, rows) {
  if (!rows.length) return;
  const db = await open();
  if (!db) {
    const m = memory.get(store);
    rows.forEach((r) => m.set(r[store === META ? 'key' : 'id'], r));
    return;
  }
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  rows.forEach((r) => os.put(r));
  await txDone(tx);
}

export async function deleteMany(store, ids) {
  if (!ids.length) return;
  const db = await open();
  if (!db) {
    const m = memory.get(store);
    ids.forEach((id) => m.delete(id));
    return;
  }
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  ids.forEach((id) => os.delete(id));
  await txDone(tx);
}

export async function getMeta(key, fallback = null) {
  const db = await open();
  if (!db) return memory.get(META).get(key)?.value ?? fallback;
  const row = await wrap(db.transaction(META, 'readonly').objectStore(META).get(key));
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  await putMany(META, [{ key, value }]);
}

/** Wipe all cached content (keeps nothing). */
export async function clearAll() {
  const db = await open();
  if (!db) {
    memory.forEach((m) => m.clear());
    return;
  }
  const tx = db.transaction(STORES, 'readwrite');
  STORES.forEach((s) => tx.objectStore(s).clear());
  await txDone(tx);
}

/** Wipe only content tables, keep meta. */
export async function clearContent() {
  const db = await open();
  if (!db) {
    CONTENT_TABLES.forEach((s) => memory.get(s).clear());
    return;
  }
  const tx = db.transaction(CONTENT_TABLES, 'readwrite');
  CONTENT_TABLES.forEach((s) => tx.objectStore(s).clear());
  await txDone(tx);
}
