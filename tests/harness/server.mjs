// Tiny static server for the browser harness. It serves the repo as-is and removes Vite-only CSS imports
// from JS (the harness links the CSS files in index.html instead). Dev/test only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };

const ENV = { VITE_SUPABASE_URL: 'https://fake.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon-key', VITE_WEB_BASE_URL: 'https://example.github.io/app', VITE_SUPPORT_EMAIL: 'help@example.com' };

export function startServer(port = 0) {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path === '/') path = '/tests/harness/index.html';
      const file = normalize(join(ROOT, path));
      if (!file.startsWith(ROOT)) throw new Error('outside root');
      let body = await readFile(file);
      const ext = extname(file);
      if (ext === '.js') {
        // Mimic what Vite does at build time: drop CSS imports, inline import.meta.env and __APP_VERSION__.
        body = Buffer.from(
          body
            .toString('utf8')
            .replace(/^import\s+'[^']+\.css';\s*$/gm, '')
            .replace(/import\.meta\.env/g, `(${JSON.stringify(ENV)})`)
            .replace(/__APP_VERSION__/g, JSON.stringify('0.1.0')),
        );
      }
      res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await startServer(5199);
  console.log(`harness at ${url}`);
}
