// Single place for build-time configuration. Values come from Vite env (VITE_*) set by
// GitHub Actions repository variables or a local .env.local file. None of them are secrets.

const env = import.meta.env ?? {};

export const CONFIG = {
  appName: { bn: 'আইন জমি', en: 'Ain Jomi' },
  appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
  supabaseUrl: (env.VITE_SUPABASE_URL || '').trim(),
  supabaseAnonKey: (env.VITE_SUPABASE_ANON_KEY || '').trim(),
  webBaseUrl: (env.VITE_WEB_BASE_URL || '').trim().replace(/\/+$/, ''),
  supportEmail: (env.VITE_SUPPORT_EMAIL || '').trim(),

  // Bump when the on-screen disclaimer text changes materially: users are asked to accept again.
  disclaimerVersion: 1,

  // Do not hit the server for a content sync more often than this unless forced.
  syncMinIntervalMs: 60 * 1000,

  // Rows per request when pulling content.
  syncPageSize: 500,

  // Cards on the Tools tab. A module with a route and bundled: true works offline from the app itself and is
  // always on. Other modules need a route AND the server flag (app_settings.feature_flags) to light up.
  modules: [
    { id: 'land_calculator', icon: 'calc', route: '/tools/land', bundled: true },
    { id: 'inheritance', icon: 'family', route: '/tools/inheritance', bundled: true },
    { id: 'gov_services', icon: 'land', route: null },
    { id: 'ai_assistant', icon: 'bot', route: null },
    { id: 'lawyers', icon: 'scale', route: null },
  ],
};

export const SUPABASE_CONFIGURED = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
