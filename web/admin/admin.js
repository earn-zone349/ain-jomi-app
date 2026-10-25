// Admin panel: content editors (laws, sections, categories, FAQs, notices, terms), user reports,
// users and roles, app settings, audit history and error logs.
//
// Security model: this page is only a convenience. Every action goes through Supabase with the signed-in
// user's token, and Row Level Security in schema.sql decides what is allowed. Hiding a tab here never
// grants or removes any permission.

import './admin.css';
import { createClient } from '@supabase/supabase-js';
import { h, clear } from '../../src/ui/dom.js';
import { TABLES } from './schema-config.js';
import { coerceRow, friendlyError, restorableFields, parseJsonInput, slugify, isVersion } from './admin-lib.js';

const URL_ = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
const root = document.getElementById('admin');

if (!URL_ || !KEY) {
  root.replaceChildren(h('p', { class: 'fatal' }, 'This build has no Supabase settings (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'));
  throw new Error('Supabase not configured');
}

const supabase = createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });

const state = { user: null, role: 'user' };
const isAdmin = () => state.role === 'admin';

// ---------------------------------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------------------------------
const fmtDate = (v) => (v ? new Date(v).toLocaleString() : '');
const short = (id) => (id ? String(id).slice(0, 8) : '');

function btn(label, { variant = 'secondary', onClick, type = 'button', disabled = false } = {}) {
  return h('button', { type, class: `btn btn-${variant}`, onclick: onClick, disabled }, label);
}

async function busy(button, fn) {
  button.disabled = true;
  button.classList.add('is-busy');
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.classList.remove('is-busy');
  }
}

function notice(text, tone = 'info') {
  return h('div', { class: `banner banner-${tone}`, role: tone === 'error' ? 'alert' : 'status' }, h('p', null, text));
}

function badge(text) {
  const tone = { published: 'success', draft: 'neutral', archived: 'warning', open: 'warning', resolved: 'success', rejected: 'neutral', repealed: 'danger', amended: 'warning', in_force: 'success' }[text] || 'neutral';
  return h('span', { class: `badge badge-${tone}` }, text);
}

function go(path) {
  location.hash = `#${path}`;
}

function formField(f, value, ctx) {
  const id = `f-${f.key}`;
  let input;
  if (f.kind === 'textarea') input = h('textarea', { id, class: 'input textarea', rows: f.rows || 5, maxlength: f.max }, value ?? '');
  else if (f.kind === 'select' || f.kind === 'ref') {
    input = h('select', { id, class: 'input' });
    if (f.kind === 'ref') input.appendChild(h('option', { value: '' }, '— none —'));
    const opts = f.kind === 'ref' ? ctx.refs[f.key] || [] : f.options;
    for (const o of opts) {
      const op = h('option', { value: o.value }, o.label);
      if (f.key === 'status' && o.value === 'draft' && ctx.existingStatus === 'published') op.disabled = true; // published can't go back to draft
      input.appendChild(op);
    }
    input.value = value ?? f.default ?? '';
  } else {
    input = h('input', { id, class: 'input', type: f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : f.kind === 'url' ? 'url' : 'text', value: value ?? '', maxlength: f.kind === 'text' ? f.max : undefined, inputmode: f.kind === 'number' ? 'numeric' : undefined, autocomplete: 'off' });
  }
  const err = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const el = h('div', { class: `field${f.full || f.kind === 'textarea' ? ' full' : ''}` }, h('label', { class: 'label', for: id }, f.label + (f.required ? ' *' : '')), input, err);
  return {
    el,
    input,
    setError(m) {
      err.textContent = m || '';
      err.hidden = !m;
      input.setAttribute('aria-invalid', m ? 'true' : 'false');
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------------------------
async function fetchRefs(fields) {
  const refs = {};
  await Promise.all(
    fields
      .filter((f) => f.kind === 'ref')
      .map(async (f) => {
        const { data } = await supabase.from(f.ref).select(`id, ${f.refLabel}`).order(f.refLabel, { ascending: true }).limit(500);
        refs[f.key] = (data || []).map((r) => ({ value: r.id, label: r[f.refLabel] || short(r.id) }));
      }),
  );
  return refs;
}

// ---------------------------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------------------------
async function viewDashboard() {
  const wrap = h('div', { class: 'stack' }, h('div', { class: 'adm-head' }, h('h2', null, 'Dashboard')));
  const grid = h('div', { class: 'adm-grid' });
  wrap.appendChild(grid);
  const count = async (table, build) => {
    let q = supabase.from(table).select('id', { count: 'exact', head: true });
    if (build) q = build(q);
    const { count: n, error } = await q;
    return error ? '?' : n;
  };
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const items = [
    ['Laws published', count('laws', (q) => q.eq('status', 'published')), '#/t/laws'],
    ['Laws in draft', count('laws', (q) => q.eq('status', 'draft')), '#/t/laws'],
    ['Sections', count('law_sections'), '#/t/laws'],
    ['Open reports', count('reports', (q) => q.eq('status', 'open')), '#/reports'],
  ];
  if (isAdmin()) items.push(['Errors (7 days)', count('error_logs', (q) => q.gte('created_at', since)), '#/errors']);
  for (const [label, p, href] of items) {
    const num = h('strong', null, '…');
    grid.appendChild(h('a', { class: 'stat', href, style: 'text-decoration:none;color:inherit' }, num, h('span', { class: 'muted small' }, label)));
    p.then((n) => (num.textContent = String(n)));
  }
  wrap.appendChild(notice('Tip: new laws start as Draft. Check the text against the official source, then set Status to Published. Archive (never delete) anything that must disappear from phones.', 'info'));
  return wrap;
}

async function viewList(tableName) {
  const cfg = TABLES[tableName];
  const wrap = h('div', { class: 'stack' });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Filter… / খুঁজুন', 'aria-label': 'Filter' });
  wrap.appendChild(h('div', { class: 'adm-head' }, h('h2', null, cfg.title), cfg.noCreate ? null : btn('+ New / নতুন', { variant: 'primary', onClick: () => go(`/t/${tableName}/new`) })));
  wrap.appendChild(search);
  const body = h('div', null, h('p', { class: 'muted' }, 'Loading…'));
  wrap.appendChild(body);

  const { data, error } = await supabase.from(tableName).select('*').order(cfg.orderBy, { ascending: cfg.orderBy === 'sort_order' || cfg.orderBy === 'slug' }).limit(500);
  if (error) {
    body.replaceChildren(notice(friendlyError(error), 'error'));
    return wrap;
  }
  const rows = data || [];
  function paint() {
    const q = search.value.trim().toLowerCase();
    const shown = q ? rows.filter((r) => cfg.columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(q))) : rows;
    if (!shown.length) {
      body.replaceChildren(h('p', { class: 'muted' }, rows.length ? 'No match.' : 'Nothing here yet.'));
      return;
    }
    const table = h(
      'table',
      { class: 'adm-table' },
      h('thead', null, h('tr', null, cfg.columns.map((c) => h('th', null, c.label)), h('th', null, ''))),
      h(
        'tbody',
        null,
        shown.map((r) =>
          h(
            'tr',
            null,
            cfg.columns.map((c) => h('td', null, c.key === 'status' || c.key === 'law_status' ? badge(r[c.key]) : String(r[c.key] ?? ''))),
            h('td', null, btn('Edit', { onClick: () => go(`/t/${tableName}/${r.id}`) })),
          ),
        ),
      ),
    );
    body.replaceChildren(h('div', { class: 'adm-table-wrap' }, table), h('p', { class: 'muted small' }, `${shown.length} item(s)`));
  }
  search.addEventListener('input', paint);
  paint();
  return wrap;
}

/** Create / edit form for any configured table. opts: {parentId, backPath} for child tables. */
async function viewForm(tableName, id, opts = {}) {
  const cfg = TABLES[tableName];
  const isNew = id === 'new';
  const wrap = h('div', { class: 'stack' });
  const back = opts.backPath || `/t/${tableName}`;

  let existing = null;
  if (!isNew) {
    const { data, error } = await supabase.from(tableName).select('*').eq('id', id).maybeSingle();
    if (error) return notice(friendlyError(error), 'error');
    if (!data) return notice('Item not found. It may have been deleted.', 'error');
    existing = data;
  }

  const refs = await fetchRefs(cfg.fields);
  const ctx = { refs, existingStatus: existing?.status };
  const controls = new Map();
  const form = h('form', { class: 'adm-form', novalidate: true });
  for (const f of cfg.fields) {
    const c = formField(f, existing ? existing[f.key] : f.default, ctx);
    controls.set(f.key, c);
    form.appendChild(c.el);
  }

  // Auto slug while the slug field is untouched
  for (const f of cfg.fields.filter((x) => x.slugFrom)) {
    const target = controls.get(f.key).input;
    const source = controls.get(f.slugFrom).input;
    let touched = Boolean(existing?.[f.key]);
    target.addEventListener('input', () => (touched = true));
    source.addEventListener('input', () => {
      if (!touched) target.value = slugify(source.value);
    });
  }

  const errorBox = h('div', { class: 'full' });
  const save = btn(isNew ? 'Create / তৈরি করুন' : 'Save / সংরক্ষণ', { variant: 'primary', type: 'submit' });
  const actions = h('div', { class: 'adm-actions full' }, save, btn('Cancel', { variant: 'ghost', onClick: () => go(back) }));
  if (!isNew && isAdmin()) {
    actions.appendChild(btn('History / ইতিহাস', { onClick: () => go(`/audit?table=${tableName}&row=${id}`) }));
    if (!cfg.noDelete) {
      actions.appendChild(
        btn('Delete', {
          variant: 'danger',
          onClick: async (e) => {
            if (!confirm('Permanently delete this item?\n\nPhones that already downloaded it will be told to wipe their saved copy and re-download everything. Archiving is usually better.')) return;
            await busy(e.currentTarget, async () => {
              const { error } = await supabase.from(tableName).delete().eq('id', id);
              if (error) errorBox.replaceChildren(notice(friendlyError(error), 'error'));
              else go(back);
            });
          },
        }),
      );
    }
  }
  form.appendChild(errorBox);
  form.appendChild(actions);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.replaceChildren();
    const values = {};
    for (const [k, c] of controls) values[k] = c.input.value;
    const { row, errors } = coerceRow(cfg.fields, values);
    controls.forEach((c, k) => c.setError(errors[k]));
    if (Object.keys(errors).length) {
      errorBox.replaceChildren(notice('Please fix the highlighted fields.', 'error'));
      return;
    }
    if (opts.parentId) row[cfg.parentKey] = opts.parentId;
    await busy(save, async () => {
      const res = isNew ? await supabase.from(tableName).insert(row) : await supabase.from(tableName).update(row).eq('id', id);
      if (res.error) errorBox.replaceChildren(notice(friendlyError(res.error), 'error'));
      else go(back);
    });
  });

  wrap.appendChild(h('div', { class: 'adm-head' }, h('h2', null, `${isNew ? 'New' : 'Edit'} · ${cfg.title}`)));
  if (existing?.status === 'published') wrap.appendChild(notice('This item is live in the app. Changes appear on phones the next time they sync. A published item cannot go back to Draft; use Archived to hide it.', 'info'));
  wrap.appendChild(h('div', { class: 'card' }, form));

  // Law page: show its sections
  if (tableName === 'laws' && existing) wrap.appendChild(await sectionsPanel(existing.id));
  return wrap;
}

async function sectionsPanel(lawId) {
  const box = h('div', { class: 'card' });
  const { data, error } = await supabase.from('law_sections').select('id,section_no,heading_en,heading_bn,status,sort_order').eq('law_id', lawId).order('sort_order', { ascending: true }).limit(1000);
  box.appendChild(h('div', { class: 'adm-head' }, h('h2', null, 'Sections · ধারা'), btn('+ Add section / ধারা যোগ', { variant: 'primary', onClick: () => go(`/s/${lawId}/new`) })));
  if (error) {
    box.appendChild(notice(friendlyError(error), 'error'));
    return box;
  }
  const rows = (data || []).sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || String(a.section_no).localeCompare(String(b.section_no), undefined, { numeric: true }));
  if (!rows.length) {
    box.appendChild(h('p', { class: 'muted' }, 'No sections yet.'));
    return box;
  }
  box.appendChild(
    h(
      'div',
      { class: 'adm-table-wrap' },
      h(
        'table',
        { class: 'adm-table' },
        h('thead', null, h('tr', null, h('th', null, 'No.'), h('th', null, 'Heading'), h('th', null, 'Status'), h('th', null, ''))),
        h('tbody', null, rows.map((r) => h('tr', null, h('td', null, r.section_no), h('td', null, r.heading_en || r.heading_bn || ''), h('td', null, badge(r.status)), h('td', null, btn('Edit', { onClick: () => go(`/s/${lawId}/${r.id}`) }))))),
      ),
    ),
  );
  return box;
}

async function viewReports(query) {
  const wrap = h('div', { class: 'stack' });
  const status = query.get('status') || 'open';
  const sel = h('select', { class: 'input', 'aria-label': 'Status filter', onchange: () => go(`/reports?status=${sel.value}`) }, ['open', 'resolved', 'rejected'].map((s) => h('option', { value: s }, s)));
  sel.value = status;
  wrap.appendChild(h('div', { class: 'adm-head' }, h('h2', null, 'Reports · রিপোর্ট'), sel));
  const { data, error } = await supabase.from('reports').select('*').eq('status', status).order('created_at', { ascending: false }).limit(200);
  if (error) return notice(friendlyError(error), 'error');
  if (!data.length) {
    wrap.appendChild(h('p', { class: 'muted' }, `No ${status} reports.`));
    return wrap;
  }
  for (const r of data) {
    const card = h('div', { class: 'card' });
    card.appendChild(h('p', { class: 'small muted' }, `${fmtDate(r.created_at)} · ${r.target_type} · user ${short(r.user_id) || 'deleted'}`));
    card.appendChild(h('p', null, r.message));
    const actions = h('div', { class: 'adm-actions' });
    if (r.target_id && (r.target_type === 'law' || r.target_type === 'law_section')) {
      actions.appendChild(
        btn('Open item', {
          onClick: async () => {
            if (r.target_type === 'law') return go(`/t/laws/${r.target_id}`);
            const { data: sec } = await supabase.from('law_sections').select('law_id').eq('id', r.target_id).maybeSingle();
            if (sec) go(`/s/${sec.law_id}/${r.target_id}`);
            else alert('That section no longer exists.');
          },
        }),
      );
    }
    const setStatus = (next) => async (e) => {
      await busy(e.currentTarget, async () => {
        const { error: err } = await supabase.from('reports').update({ status: next, resolved_by: state.user.id, resolved_at: new Date().toISOString() }).eq('id', r.id);
        if (err) alert(friendlyError(err));
        else card.remove();
      });
    };
    if (status === 'open') {
      actions.appendChild(btn('Resolved / সমাধান', { variant: 'primary', onClick: setStatus('resolved') }));
      actions.appendChild(btn('Reject', { onClick: setStatus('rejected') }));
    }
    card.appendChild(actions);
    wrap.appendChild(card);
  }
  return wrap;
}

async function viewUsers() {
  if (!isAdmin()) return notice('Admins only.', 'error');
  const wrap = h('div', { class: 'stack' }, h('div', { class: 'adm-head' }, h('h2', null, 'Users & roles · ব্যবহারকারী')));
  wrap.appendChild(notice('Roles: user (normal), editor (can add/edit content), admin (everything, including roles and deletes). You cannot change your own role.', 'info'));
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error) return notice(friendlyError(error), 'error');
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Filter by email or name', 'aria-label': 'Filter users' });
  const holder = h('div');
  wrap.appendChild(search);
  wrap.appendChild(holder);
  function paint() {
    const q = search.value.trim().toLowerCase();
    const rows = (data || []).filter((u) => !q || `${u.email} ${u.full_name || ''}`.toLowerCase().includes(q));
    holder.replaceChildren(
      h(
        'div',
        { class: 'adm-table-wrap' },
        h(
          'table',
          { class: 'adm-table' },
          h('thead', null, h('tr', null, h('th', null, 'Email'), h('th', null, 'Name'), h('th', null, 'Joined'), h('th', null, 'Role'), h('th', null, ''))),
          h(
            'tbody',
            null,
            rows.map((u) => {
              const select = h('select', { class: 'input', 'aria-label': `Role for ${u.email}`, disabled: u.id === state.user.id }, ['user', 'editor', 'admin'].map((r) => h('option', { value: r }, r)));
              select.value = u.role;
              const save = btn('Save', {
                disabled: u.id === state.user.id,
                onClick: (e) =>
                  busy(e.currentTarget, async () => {
                    if (select.value === 'admin' && !confirm(`Make ${u.email} an ADMIN? Admins can change anything, including deleting content and other roles.`)) return;
                    const { error: err } = await supabase.from('profiles').update({ role: select.value }).eq('id', u.id);
                    if (err) alert(friendlyError(err));
                    else u.role = select.value;
                  }),
              });
              return h('tr', null, h('td', null, u.email), h('td', null, u.full_name || ''), h('td', null, fmtDate(u.created_at)), h('td', null, select), h('td', null, save));
            }),
          ),
        ),
      ),
    );
  }
  search.addEventListener('input', paint);
  paint();
  return wrap;
}

async function viewSettings() {
  if (!isAdmin()) return notice('Admins only.', 'error');
  const { data, error } = await supabase.from('app_settings').select('key,value');
  if (error) return notice(friendlyError(error), 'error');
  const cur = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  const maint = cur.maintenance_mode || { enabled: false, message_bn: '', message_en: '' };
  const flags = cur.feature_flags || {};
  const contact = cur.contact || { email: '' };

  const wrap = h('div', { class: 'stack' }, h('div', { class: 'adm-head' }, h('h2', null, 'App settings · সেটিংস')));
  const form = h('form', { class: 'card form', novalidate: true });
  const check = (id, label, on) => h('label', { class: 'check-row', for: id }, h('input', { id, type: 'checkbox', class: 'check', checked: on }), h('span', null, label));
  const text = (id, label, value, hint) => h('div', { class: 'field' }, h('label', { class: 'label', for: id }, label), h('input', { id, class: 'input', value: value || '' }), hint ? h('p', { class: 'hint' }, hint) : null);

  const maintOn = check('maint-on', 'Maintenance mode ON (blocks the whole app) / অ্যাপ বন্ধ রাখুন', maint.enabled === true);
  const maintBn = text('maint-bn', 'Maintenance message (বাংলা)', maint.message_bn);
  const maintEn = text('maint-en', 'Maintenance message (English)', maint.message_en);
  const minVer = text('min-ver', 'Minimum app version', cur.min_app_version, 'Phones on an older version are asked to update. Example: 0.1.0');
  const flagKeys = ['land_calculator', 'inheritance', 'gov_services', 'ai_assistant', 'lawyers'];
  const flagChecks = flagKeys.map((k) => check(`flag-${k}`, `Feature on: ${k}`, flags[k] === true));
  const email = text('contact-email', 'Support email', contact.email);
  const msg = h('div');
  const save = btn('Save settings / সংরক্ষণ', { variant: 'primary', type: 'submit' });
  form.append(
    h('h3', null, 'Maintenance'),
    maintOn,
    maintBn,
    maintEn,
    h('h3', null, 'Version'),
    minVer,
    h('h3', null, 'Feature switches'),
    notice('A switch only shows a module if that module is already built into the installed app.', 'info'),
    ...flagChecks,
    h('h3', null, 'Contact'),
    email,
    msg,
    save,
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.replaceChildren();
    const ver = minVer.querySelector('input').value.trim();
    if (!isVersion(ver)) {
      msg.replaceChildren(notice('Minimum version must look like 0.1.0', 'error'));
      return;
    }
    const nextFlags = { ...flags };
    flagKeys.forEach((k) => (nextFlags[k] = form.querySelector(`#flag-${k}`).checked));
    const rows = [
      { key: 'maintenance_mode', value: { enabled: form.querySelector('#maint-on').checked, message_bn: maintBn.querySelector('input').value.trim(), message_en: maintEn.querySelector('input').value.trim() }, is_public: true },
      { key: 'min_app_version', value: ver, is_public: true },
      { key: 'feature_flags', value: nextFlags, is_public: true },
      { key: 'contact', value: { email: email.querySelector('input').value.trim() }, is_public: true },
    ];
    if (rows[0].value.enabled && !confirm('Maintenance mode will block EVERY user from the app. Continue?')) return;
    await busy(save, async () => {
      const { error: err } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' });
      msg.replaceChildren(err ? notice(friendlyError(err), 'error') : notice('Saved. Phones pick this up on their next sync.', 'success'));
    });
  });
  wrap.appendChild(form);
  return wrap;
}

const RESTORABLE = new Set(['laws', 'law_sections', 'categories', 'faqs', 'notices', 'legal_pages']);

async function viewAudit(query) {
  if (!isAdmin()) return notice('Admins only.', 'error');
  const tableFilter = query.get('table') || '';
  const rowFilter = query.get('row') || '';
  const wrap = h('div', { class: 'stack' });
  const sel = h('select', { class: 'input', 'aria-label': 'Table filter', onchange: () => go(`/audit${sel.value ? `?table=${sel.value}` : ''}`) }, h('option', { value: '' }, 'All tables'), ...[...RESTORABLE, 'app_settings', 'profiles'].map((t) => h('option', { value: t }, t)));
  sel.value = tableFilter;
  wrap.appendChild(h('div', { class: 'adm-head' }, h('h2', null, 'History · ইতিহাস'), sel));
  let q = supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(100);
  if (tableFilter) q = q.eq('table_name', tableFilter);
  if (rowFilter) q = q.eq('row_id', rowFilter);
  const { data, error } = await q;
  if (error) return notice(friendlyError(error), 'error');
  if (!data.length) {
    wrap.appendChild(h('p', { class: 'muted' }, 'No history yet.'));
    return wrap;
  }
  for (const a of data) {
    const card = h('div', { class: 'card' });
    card.appendChild(h('p', null, h('strong', null, `${a.action} · ${a.table_name}`), h('span', { class: 'muted small' }, ` · ${fmtDate(a.at)} · by ${short(a.actor) || 'system'} · row ${short(a.row_id)}`)));
    card.appendChild(h('details', null, h('summary', null, 'Show data'), a.old_data ? h('pre', { class: 'mono' }, `BEFORE\n${JSON.stringify(a.old_data, null, 2)}`) : null, a.new_data ? h('pre', { class: 'mono' }, `AFTER\n${JSON.stringify(a.new_data, null, 2)}`) : null));
    if (RESTORABLE.has(a.table_name) && a.old_data && (a.action === 'UPDATE' || a.action === 'DELETE')) {
      card.appendChild(
        btn(a.action === 'UPDATE' ? 'Restore the BEFORE text' : 'Bring back deleted item (as draft)', {
          onClick: (e) =>
            busy(e.currentTarget, async () => {
              if (!confirm('Restore this version?')) return;
              const fields = restorableFields(a.old_data);
              const res =
                a.action === 'UPDATE'
                  ? await supabase.from(a.table_name).update(fields).eq('id', a.row_id)
                  : await supabase.from(a.table_name).insert({ ...fields, id: a.row_id, status: 'draft' });
              if (res.error) alert(friendlyError(res.error));
              else alert('Restored.');
            }),
        }),
      );
    }
    wrap.appendChild(card);
  }
  return wrap;
}

async function viewErrors() {
  if (!isAdmin()) return notice('Admins only.', 'error');
  const wrap = h('div', { class: 'stack' });
  const purge = btn('Delete logs older than 30 days', {
    onClick: (e) =>
      busy(e.currentTarget, async () => {
        if (!confirm('Delete error logs older than 30 days?')) return;
        const { data, error } = await supabase.rpc('purge_old_error_logs', { keep_days: 30 });
        alert(error ? friendlyError(error) : `Deleted ${data} log(s).`);
        route();
      }),
  });
  wrap.appendChild(h('div', { class: 'adm-head' }, h('h2', null, 'App errors · ত্রুটি'), purge));
  const { data, error } = await supabase.from('error_logs').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return notice(friendlyError(error), 'error');
  if (!data.length) {
    wrap.appendChild(h('p', { class: 'muted' }, 'No errors recorded. 🎉'));
    return wrap;
  }
  for (const r of data) {
    wrap.appendChild(h('div', { class: 'card' }, h('p', null, h('strong', null, r.message)), h('p', { class: 'small muted' }, `${fmtDate(r.created_at)} · v${r.app_version || '?'} · ${r.platform || '?'}`), r.stack ? h('details', null, h('summary', null, 'Stack'), h('pre', { class: 'mono' }, r.stack)) : null));
  }
  return wrap;
}

// ---------------------------------------------------------------------------------------------
// Shell, login and routing
// ---------------------------------------------------------------------------------------------
const NAV = [
  { path: '/', label: 'Dashboard' },
  { path: '/t/laws', label: 'Laws' },
  { path: '/t/categories', label: 'Categories' },
  { path: '/t/faqs', label: 'FAQs' },
  { path: '/t/notices', label: 'Notices' },
  { path: '/reports', label: 'Reports' },
  { path: '/t/legal_pages', label: 'Terms/Privacy', admin: true },
  { path: '/users', label: 'Users', admin: true },
  { path: '/settings', label: 'Settings', admin: true },
  { path: '/audit', label: 'History', admin: true },
  { path: '/errors', label: 'Errors', admin: true },
];

let main;
let navEl;
let seq = 0;

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs), path };
}

async function route() {
  if (!main) return;
  const mine = ++seq;
  const { parts, query, path } = parseHash();
  navEl.querySelectorAll('a').forEach((a) => a.classList.toggle('active', path === a.dataset.path || (a.dataset.path !== '/' && path.startsWith(a.dataset.path))));
  main.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
  let view;
  try {
    const [a, b, c] = parts;
    if (!a) view = await viewDashboard();
    else if (a === 't' && TABLES[b] && b !== 'law_sections') {
      const needsAdmin = b === 'legal_pages';
      if (needsAdmin && !isAdmin()) view = notice('Admins only.', 'error');
      else view = c ? await viewForm(b, c) : await viewList(b);
    } else if (a === 's' && b) view = await viewForm('law_sections', c || 'new', { parentId: b, backPath: `/t/laws/${b}` });
    else if (a === 'reports') view = await viewReports(query);
    else if (a === 'users') view = await viewUsers();
    else if (a === 'settings') view = await viewSettings();
    else if (a === 'audit') view = await viewAudit(query);
    else if (a === 'errors') view = await viewErrors();
    else view = notice('Page not found.', 'error');
  } catch (err) {
    console.error(err);
    view = notice(friendlyError(err), 'error');
  }
  if (mine === seq) main.replaceChildren(view);
}

function renderApp() {
  navEl = h('nav', { class: 'adm-nav', 'aria-label': 'Sections' }, NAV.filter((n) => !n.admin || isAdmin()).map((n) => h('a', { href: `#${n.path}`, dataset: { path: n.path } }, n.label)));
  main = h('main', { class: 'adm-main' });
  root.replaceChildren(
    h(
      'div',
      { class: 'adm' },
      h('header', { class: 'adm-top' }, h('h1', null, 'Ain Jomi · Admin'), h('span', { class: 'small' }, `${state.user.email} (${state.role})`), btn('Sign out', { onClick: async () => { await supabase.auth.signOut(); location.hash = '#/'; start(); } })),
      navEl,
      main,
    ),
  );
  route();
}

function renderLogin(message) {
  const email = h('input', { id: 'email', class: 'input', type: 'email', autocomplete: 'email', required: true });
  const password = h('input', { id: 'password', class: 'input', type: 'password', autocomplete: 'current-password', required: true });
  const err = h('div');
  const submit = btn('Log in', { variant: 'primary', type: 'submit' });
  const form = h('form', { class: 'adm-login', novalidate: true }, h('h1', null, 'Admin login'), message ? notice(message, 'error') : null, h('div', { class: 'field' }, h('label', { class: 'label', for: 'email' }, 'Email'), email), h('div', { class: 'field' }, h('label', { class: 'label', for: 'password' }, 'Password'), password), err, submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.replaceChildren();
    await busy(submit, async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
      if (error) err.replaceChildren(notice(friendlyError(error), 'error'));
      else start();
    });
  });
  root.replaceChildren(form);
}

async function start() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return renderLogin();
  state.user = data.session.user;
  const { data: profile, error } = await supabase.from('profiles').select('role').eq('id', state.user.id).maybeSingle();
  if (error) return renderLogin(friendlyError(error));
  state.role = profile?.role || 'user';
  if (state.role !== 'editor' && state.role !== 'admin') {
    await supabase.auth.signOut();
    return renderLogin('This account does not have access to the admin panel.');
  }
  renderApp();
}

window.addEventListener('hashchange', route);
start().catch((err) => {
  console.error(err);
  clear(root);
  root.appendChild(h('p', { class: 'fatal' }, friendlyError(err)));
});
