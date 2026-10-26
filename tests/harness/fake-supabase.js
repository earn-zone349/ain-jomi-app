// In-memory stand-in for @supabase/supabase-js, used ONLY by the browser harness (tests/e2e).
// It implements just the calls the app makes, and exposes window.__fake so tests can change "server" data.

const iso = (n) => new Date(Date.UTC(2026, 9, 1, 0, 0, n)).toISOString();

const db = {
  version: 5,
  epoch: 1,
  calls: [],
  users: {
    'rakib@example.com': { password: 'secret123', confirmed: true, id: 'u-1', full_name: 'Rakib' },
    'admin@example.com': { password: 'adminpass1', confirmed: true, id: 'u-admin', full_name: 'Admin' },
    'editor@example.com': { password: 'editorpass1', confirmed: true, id: 'u-ed', full_name: 'Editor' },
  },
  audit: [],
  session: null,
  tables: {
    faqs: [{ id: 'f1', question_bn: 'আইনজীবী কি লাগবে?', question_en: 'Do I need a lawyer?', answer_bn: 'মামলার ধরনের ওপর নির্ভর করে।', answer_en: 'It depends on the case.', sort_order: 10, status: 'published', updated_at: iso(9) }],
    notices: [{ id: 'n1', kind: 'update', title_bn: 'আইন হালনাগাদ', title_en: 'Law update', body_bn: 'দণ্ডবিধির তথ্য যাচাই হয়েছে।', body_en: 'Penal Code details verified.', status: 'published', updated_at: iso(8) }],
    legal_pages: [],
  },
  settings: {
    maintenance_mode: { enabled: false, message_bn: '', message_en: '' },
    min_app_version: '0.0.1',
    feature_flags: { land_calculator: false },
    contact: { email: '' },
  },
  reports: [{ id: 'r0', user_id: 'u-1', target_type: 'law', target_id: 'l1', message: 'Penalty text looks outdated', status: 'open', created_at: '2026-10-05T00:00:00Z' }],
  error_logs: [],
  profiles: {
    'u-1': { id: 'u-1', full_name: 'Rakib', role: 'user', preferred_lang: 'bn' },
    'u-admin': { id: 'u-admin', full_name: 'Admin', role: 'admin', preferred_lang: 'bn' },
    'u-ed': { id: 'u-ed', full_name: 'Editor', role: 'editor', preferred_lang: 'bn' },
  },
};

let authListener = null;
const sameDate = (a, b) => Date.parse(a) === Date.parse(b);

function parseKeyset(filter) {
  let m = /^updated_at\.gte\."([^"]+)"$/.exec(filter);
  if (m) return (r) => Date.parse(r.updated_at) >= Date.parse(m[1]);
  m = /^updated_at\.gt\."([^"]+)",and\(updated_at\.eq\."([^"]+)",id\.gt\.(.+)\)$/.exec(filter);
  if (m) return (r) => Date.parse(r.updated_at) > Date.parse(m[1]) || (sameDate(r.updated_at, m[2]) && r.id > m[3]);
  throw new Error(`fake-supabase: unsupported or() filter: ${filter}`);
}

const CONTENT = new Set(['categories', 'laws', 'law_sections', 'faqs', 'notices', 'legal_pages']);
let idSeq = 0;
const nowIso = () => new Date(Date.UTC(2026, 9, 3, 0, 0, ++idSeq)).toISOString();

function role() {
  return db.session ? db.profiles[db.session.user.id]?.role || 'user' : 'anon';
}
const isStaff = () => role() === 'editor' || role() === 'admin';
const isAdmin = () => role() === 'admin';
const denied = (msg = 'new row violates row-level security policy') => ({ data: null, error: { code: '42501', message: msg } });

function audit(action, table, oldRow, newRow) {
  db.audit.unshift({ id: db.audit.length + 1, actor: db.session?.user.id || null, action, table_name: table, row_id: (newRow || oldRow).id, old_data: oldRow || null, new_data: newRow || null, at: nowIso() });
}

class Query {
  constructor(table) {
    this.table = table;
    this.op = 'select';
    this.preds = [];
    this.orders = [];
    this.lim = Infinity;
    this.single = false;
    this.payload = null;
    this.head = false;
    this.count = false;
  }
  select(_cols, opts = {}) { this.head = Boolean(opts.head); this.count = Boolean(opts.count); return this; }
  eq(col, val) { this.preds.push((r) => r[col] === val); return this; }
  gte(col, val) { this.preds.push((r) => Date.parse(r[col]) >= Date.parse(val)); return this; }
  order(col, { ascending = true } = {}) { this.orders.push([col, ascending]); return this; }
  limit(n) { this.lim = n; return this; }
  or(filter) { this.preds.push(parseKeyset(filter)); return this; }
  maybeSingle() { this.single = true; return this; }
  insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
  update(values) { this.op = 'update'; this.payload = values; return this; }
  delete() { this.op = 'delete'; return this; }
  upsert(rows) { this.op = 'upsert'; this.payload = rows; return this; }
  then(resolve, reject) { return Promise.resolve(this.exec()).then(resolve, reject); }

  exec() {
    db.calls.push(`${this.op}:${this.table}`);
    if (!db.online) return { data: null, error: new Error('Failed to fetch') };
    const t = this.table;

    if (t === 'content_meta') return { data: { content_version: db.version, epoch: db.epoch }, error: null };

    if (t === 'app_settings') {
      if (this.op === 'upsert') {
        if (!isAdmin()) return denied();
        for (const r of this.payload) db.settings[r.key] = r.value;
        db.version += 1;
        return { data: null, error: null };
      }
      return { data: Object.entries(db.settings).map(([key, value]) => ({ key, value })), error: null };
    }

    if (t === 'profiles') {
      const list = Object.values(db.profiles);
      if (this.op === 'update') {
        const target = list.find((r) => this.preds.every((f) => f(r)));
        if (!target) return { data: null, error: null };
        const self = db.session && target.id === db.session.user.id;
        if (!self && !isAdmin()) return denied();
        if ('role' in this.payload && !isAdmin()) return denied('only admins can change roles');
        Object.assign(target, this.payload);
        return { data: null, error: null };
      }
      const p = list.find((r) => this.preds.every((f) => f(r)));
      return { data: p ? { ...p } : null, error: null };
    }

    if (t === 'error_logs') {
      if (this.op === 'insert') { db.error_logs.push(...[].concat(this.payload)); return { data: null, error: null }; }
      if (!isAdmin()) return { data: [], error: null };
      return this.finish(db.error_logs.map((r, i) => ({ id: i + 1, created_at: nowIso(), ...r })));
    }

    if (t === 'reports') {
      if (this.op === 'insert') {
        if (!db.session) return denied();
        db.reports.push(...[].concat(this.payload).map((r, i) => ({ id: `r${db.reports.length + i + 1}`, user_id: db.session.user.id, status: 'open', created_at: nowIso(), ...r })));
        return { data: null, error: null };
      }
      if (this.op === 'update') {
        if (!isStaff()) return denied();
        db.reports.filter((r) => this.preds.every((f) => f(r))).forEach((r) => Object.assign(r, this.payload));
        return { data: null, error: null };
      }
      return this.finish(db.reports.filter((r) => (isStaff() || r.user_id === db.session?.user.id) && this.preds.every((f) => f(r))).map((r) => ({ ...r })));
    }

    if (t === 'audit_log') {
      if (!isAdmin()) return denied('permission denied for table audit_log');
      return this.finish(db.audit.filter((r) => this.preds.every((f) => f(r))).map((r) => ({ ...r })));
    }

    // content tables
    const list = db.tables[t] || (db.tables[t] = []);
    if (this.op === 'insert') {
      if (!isStaff()) return denied();
      for (const row of [].concat(this.payload)) {
        if (row.slug && list.some((r) => r.slug === row.slug)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        const next = { id: row.id || `g${++idSeq}`, status: 'draft', ...row, updated_at: nowIso() };
        list.push(next);
        audit('INSERT', t, null, next);
      }
      db.version += 1;
      return { data: null, error: null };
    }
    if (this.op === 'update') {
      if (!isStaff()) return { data: null, error: null }; // RLS: silently matches nothing
      const hits = list.filter((r) => this.preds.every((f) => f(r)));
      for (const r of hits) {
        if (r.status === 'published' && this.payload.status === 'draft') return { data: null, error: { code: '23514', message: 'A published item cannot go back to draft. Archive it instead.' } };
        const before = { ...r };
        Object.assign(r, this.payload, { updated_at: nowIso() });
        audit('UPDATE', t, before, { ...r });
      }
      db.version += 1;
      return { data: null, error: null };
    }
    if (this.op === 'delete') {
      if (!isAdmin()) return { data: null, error: null };
      const gone = list.filter((r) => this.preds.every((f) => f(r)));
      gone.forEach((r) => audit('DELETE', t, { ...r }, null));
      db.tables[t] = list.filter((r) => !gone.includes(r));
      db.epoch += 1;
      db.version += 1;
      return { data: null, error: null };
    }
    const visible = list.filter((r) => (isStaff() || r.status === 'published' || r.status === 'archived') && this.preds.every((f) => f(r)));
    return this.finish(visible.map((r) => ({ ...r })));
  }

  finish(rows) {
    for (const [col, asc] of [...this.orders].reverse()) {
      rows.sort((a, b) => {
        const x = col === 'updated_at' || col === 'created_at' || col === 'at' ? Date.parse(a[col]) : a[col];
        const y = col === 'updated_at' || col === 'created_at' || col === 'at' ? Date.parse(b[col]) : b[col];
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
      });
    }
    if (this.count && this.head) return { count: rows.length, data: null, error: null };
    const out = rows.slice(0, this.lim);
    return { data: this.single ? out[0] || null : out, error: null };
  }
}

const sessionFor = (email) => {
  const u = db.users[email];
  return { user: { id: u.id, email, identities: [{}] }, access_token: 'tok' };
};

export function createClient() {
  return {
    from: (table) => new Query(table),
    rpc: async (name) => {
      db.calls.push(`rpc:${name}`);
      if (!db.online) return { error: new Error('Failed to fetch') };
      if (name === 'delete_my_account') {
        if (!db.session) return { error: { message: 'not signed in' } };
        const email = db.session.user.email;
        delete db.users[email];
        return { error: null };
      }
      if (name === 'admin_list_users') {
        if (role() !== 'admin') return { data: null, error: { code: '42501', message: 'admins only' } };
        return { data: Object.entries(db.users).map(([email, u]) => ({ id: u.id, email, full_name: u.full_name, role: db.profiles[u.id]?.role || 'user', created_at: '2026-10-01T00:00:00Z' })), error: null };
      }
      if (name === 'purge_old_error_logs') return { data: 0, error: null };
      return { error: { message: `unknown rpc ${name}` } };
    },
    auth: {
      async getSession() { return { data: { session: db.session } }; },
      onAuthStateChange(cb) { authListener = cb; return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithPassword({ email, password }) {
        if (!db.online) return { error: new Error('Failed to fetch') };
        const u = db.users[email];
        if (!u || u.password !== password) return { error: { message: 'Invalid login credentials', status: 400 } };
        db.session = sessionFor(email);
        authListener?.('SIGNED_IN', db.session);
        return { data: { session: db.session }, error: null };
      },
      async signUp({ email, password, options }) {
        if (!db.online) return { error: new Error('Failed to fetch') };
        if (db.users[email]) return { data: { user: { identities: [] }, session: null }, error: null };
        db.users[email] = { password, confirmed: !db.requireConfirm, id: `u-${Object.keys(db.users).length + 1}`, full_name: options?.data?.full_name };
        if (db.requireConfirm) return { data: { user: { id: db.users[email].id, identities: [{}] }, session: null }, error: null };
        db.session = sessionFor(email);
        authListener?.('SIGNED_IN', db.session);
        return { data: { user: db.session.user, session: db.session }, error: null };
      },
      async signOut() { db.session = null; authListener?.('SIGNED_OUT', null); return { error: null }; },
      async resetPasswordForEmail(email) { db.calls.push(`reset:${email}`); return { error: null }; },
      async updateUser() { return { error: null }; },
    },
  };
}

db.online = true;
globalThis.__fake = {
  db,
  bump() { db.version += 1; },
  setSetting(key, value) { db.settings[key] = value; db.version += 1; },
  upsert(table, row) {
    const list = db.tables[table];
    const i = list.findIndex((r) => r.id === row.id);
    const next = { ...(i >= 0 ? list[i] : {}), ...row, updated_at: new Date(Date.UTC(2026, 9, 2, 0, 0, db.version * 10)).toISOString() };
    if (i >= 0) list[i] = next; else list.push(next);
    db.version += 1;
  },
  hardDelete(table, id) { db.tables[table] = db.tables[table].filter((r) => r.id !== id); db.epoch += 1; db.version += 1; },
  reset() { db.calls.length = 0; },
};
