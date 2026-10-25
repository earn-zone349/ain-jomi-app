// Separate build for the public website (GitHub Pages): admin panel, password-reset page,
// and the public Terms / Privacy pages. Kept apart from the Android app build on purpose:
// the admin panel must never be packaged inside the APK.
//
//   npm run build:web   ->   dist-web/{index,admin,reset-password,privacy,terms}

import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(root, 'web'),
  envDir: root,
  base: './',
  build: {
    outDir: resolve(root, 'dist-web'),
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      input: {
        index: resolve(root, 'web/index.html'),
        admin: resolve(root, 'web/admin/index.html'),
        reset: resolve(root, 'web/reset-password/index.html'),
        privacy: resolve(root, 'web/privacy/index.html'),
        terms: resolve(root, 'web/terms/index.html'),
      },
    },
  },
  server: { fs: { allow: [root] } },
});
