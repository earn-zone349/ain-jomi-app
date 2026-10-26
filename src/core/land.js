// Land calculator data (units, cost rates, glossary). It ships inside the app (public/data/land), so it works
// offline. The chosen region is remembered on this phone.

import { getString, setString, getJSON, setJSON } from './storage.js';

let cache = null;
let loading = null;

async function fetchJson(name) {
  const res = await fetch(`./data/land/${name}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`land/${name}: HTTP ${res.status}`);
  return res.json();
}

/** Loads all land data once. Resolves to { units, costs, glossary }; rejects if the app bundle is broken. */
export function loadLandData() {
  if (cache) return Promise.resolve(cache);
  if (!loading) {
    loading = Promise.all([fetchJson('units'), fetchJson('costs'), fetchJson('glossary')])
      .then(([units, costs, glossary]) => {
        cache = { units, costs, glossary };
        return cache;
      })
      .catch((err) => {
        loading = null;
        throw err;
      });
  }
  return loading;
}

export const getRegion = () => getString('landRegion', 'standard');
export const setRegion = (id) => setString('landRegion', id);
export const getCustomRegion = () => getJSON('landCustom', { katha_sqft: 720, katha_per_bigha: 20 });
export const setCustomRegion = (v) => setJSON('landCustom', v);
