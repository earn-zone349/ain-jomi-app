// Government service guides (content/services/services.json). The data ships inside the app (public/data/services),
// so the guides work offline; only the official links need internet.

let cache = null;
let loading = null;

/** Loads the guides once. Resolves to { as_of, categories, sources, services }; rejects if the bundle is broken. */
export function loadServices() {
  if (cache) return Promise.resolve(cache);
  if (!loading) {
    loading = fetch('./data/services/services.json', { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`services: HTTP ${res.status}`);
        return res.json();
      })
      .then((doc) => {
        cache = doc;
        return doc;
      })
      .catch((err) => {
        loading = null;
        throw err;
      });
  }
  return loading;
}
