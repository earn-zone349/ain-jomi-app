-- =====================================================================
--  Ain Jomi: Phase 0 database schema (Supabase / PostgreSQL)
--  Run ONCE in Supabase Dashboard > SQL Editor. Safe to re-run: every
--  statement is idempotent (create ... if not exists / or replace / drop ... if exists).
--  Order: helpers > profiles > content tables > support tables > triggers > RLS > seed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Generic trigger helpers
-- ---------------------------------------------------------------------

-- Sets updated_at (monotonic wall clock, not tx start) and updated_by.
create or replace function public.touch_row() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  else
    new.created_by := auth.uid();
  end if;
  new.updated_by := auth.uid();
  return new;
end $$;

-- Content may go draft -> published -> archived, but never published -> draft.
-- Reason: apps sync only published/archived rows; archived rows act as "tombstones"
-- so offline caches learn about withdrawn content.
create or replace function public.guard_status() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.status = 'published' and new.status = 'draft' then
    raise exception 'A published item cannot go back to draft. Archive it instead.'
      using errcode = '23514';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. Profiles and roles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  full_name      text check (full_name is null or char_length(full_name) <= 120),
  phone          text check (phone is null or char_length(phone) <= 20),
  role           text not null default 'user' check (role in ('user','editor','admin')),
  preferred_lang text not null default 'bn' check (preferred_lang in ('bn','en')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('editor','admin') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- Auto-create a profile for every new auth user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')), ''), 120))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only admins may change a role. auth.uid() is NULL when running from the SQL editor,
-- which is how you promote the very first admin (see README).
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id then
    raise exception 'profile id is immutable';
  end if;
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'only admins can change roles' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------
-- 3. Content tables (all bilingual: *_bn / *_en)
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name_bn     text not null check (char_length(name_bn) between 1 and 120),
  name_en     text not null check (char_length(name_en) between 1 and 120),
  icon        text not null default 'book',
  sort_order  integer not null default 100,
  status      text not null default 'published' check (status in ('draft','published','archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default clock_timestamp(),
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null
);

create table if not exists public.laws (
  id               uuid primary key default gen_random_uuid(),
  category_id      uuid references public.categories(id) on delete set null,
  slug             text not null unique check (slug ~ '^[a-z0-9-]{2,120}$'),
  title_bn         text not null check (char_length(title_bn) between 1 and 300),
  title_en         text not null check (char_length(title_en) between 1 and 300),
  act_number       text check (act_number is null or char_length(act_number) <= 60),
  year             integer check (year is null or year between 1700 and 2200),
  summary_bn       text check (summary_bn is null or char_length(summary_bn) <= 4000),
  summary_en       text check (summary_en is null or char_length(summary_en) <= 4000),
  source_name      text check (source_name is null or char_length(source_name) <= 200),
  source_url       text check (source_url is null or source_url ~ '^https?://'),
  law_status       text not null default 'in_force' check (law_status in ('in_force','amended','repealed')),
  last_verified_at date,
  status           text not null default 'draft' check (status in ('draft','published','archived')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default clock_timestamp(),
  created_by       uuid references auth.users(id) on delete set null,
  updated_by       uuid references auth.users(id) on delete set null
);

create table if not exists public.law_sections (
  id             uuid primary key default gen_random_uuid(),
  law_id         uuid not null references public.laws(id) on delete cascade,
  section_no     text not null check (char_length(section_no) between 1 and 30),
  heading_bn     text check (heading_bn is null or char_length(heading_bn) <= 300),
  heading_en     text check (heading_en is null or char_length(heading_en) <= 300),
  text_bn        text check (text_bn is null or char_length(text_bn) <= 20000),
  text_en        text check (text_en is null or char_length(text_en) <= 20000),
  explain_bn     text check (explain_bn is null or char_length(explain_bn) <= 8000),
  explain_en     text check (explain_en is null or char_length(explain_en) <= 8000),
  punishment_bn  text check (punishment_bn is null or char_length(punishment_bn) <= 2000),
  punishment_en  text check (punishment_en is null or char_length(punishment_en) <= 2000),
  sort_order     integer not null default 100,
  status         text not null default 'draft' check (status in ('draft','published','archived')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default clock_timestamp(),
  created_by     uuid references auth.users(id) on delete set null,
  updated_by     uuid references auth.users(id) on delete set null,
  unique (law_id, section_no)
);

create table if not exists public.faqs (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid references public.categories(id) on delete set null,
  question_bn  text not null check (char_length(question_bn) between 1 and 500),
  question_en  text not null check (char_length(question_en) between 1 and 500),
  answer_bn    text not null check (char_length(answer_bn) <= 8000),
  answer_en    text not null check (char_length(answer_en) <= 8000),
  sort_order   integer not null default 100,
  status       text not null default 'draft' check (status in ('draft','published','archived')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default clock_timestamp(),
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null
);

create table if not exists public.notices (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'info' check (kind in ('info','update','warning')),
  title_bn   text not null check (char_length(title_bn) between 1 and 200),
  title_en   text not null check (char_length(title_en) between 1 and 200),
  body_bn    text check (body_bn is null or char_length(body_bn) <= 2000),
  body_en    text check (body_en is null or char_length(body_en) <= 2000),
  law_id     uuid references public.laws(id) on delete set null,
  starts_at  timestamptz,
  ends_at    timestamptz,
  status     text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

-- Terms / privacy / disclaimer. One row per slug; bump "version" when the meaning changes.
create table if not exists public.legal_pages (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug in ('terms','privacy','disclaimer')),
  title_bn   text not null,
  title_en   text not null,
  body_bn    text not null check (char_length(body_bn) <= 60000),
  body_en    text not null check (char_length(body_en) <= 60000),
  version    integer not null default 1 check (version >= 1),
  status     text not null default 'published' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

-- Sync indexes (keyset pagination by updated_at, id) and lookup indexes
create index if not exists categories_sync_idx    on public.categories    (updated_at, id);
create index if not exists laws_sync_idx          on public.laws          (updated_at, id);
create index if not exists laws_category_idx      on public.laws          (category_id);
create index if not exists law_sections_sync_idx  on public.law_sections  (updated_at, id);
create index if not exists law_sections_law_idx   on public.law_sections  (law_id, sort_order);
create index if not exists faqs_sync_idx          on public.faqs          (updated_at, id);
create index if not exists notices_sync_idx       on public.notices       (updated_at, id);
create index if not exists legal_pages_sync_idx   on public.legal_pages   (updated_at, id);

-- Attach triggers to every content table
do $$
declare t text;
begin
  foreach t in array array['categories','laws','law_sections','faqs','notices','legal_pages'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.touch_row()', t || '_touch', t);
    execute format('drop trigger if exists %I on public.%I', t || '_status', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.guard_status()', t || '_status', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Content version counter (apps compare this to decide whether to sync)
-- ---------------------------------------------------------------------
create table if not exists public.content_meta (
  id              integer primary key default 1 check (id = 1),
  content_version bigint  not null default 1,
  epoch           integer not null default 1,   -- bumped on hard deletes: clients must wipe cache and resync
  updated_at      timestamptz not null default now()
);
insert into public.content_meta (id) values (1) on conflict (id) do nothing;

create or replace function public.bump_content_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.content_meta set content_version = content_version + 1, updated_at = now() where id = 1;
  return null;
end $$;

create or replace function public.bump_content_epoch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.content_meta set epoch = epoch + 1, content_version = content_version + 1, updated_at = now() where id = 1;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['categories','laws','law_sections','faqs','notices','legal_pages'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_bump', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each statement execute function public.bump_content_version()', t || '_bump', t);
    execute format('drop trigger if exists %I on public.%I', t || '_epoch', t);
    execute format('create trigger %I after delete on public.%I for each statement execute function public.bump_content_epoch()', t || '_epoch', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. App settings, reports, error logs, audit log
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key         text primary key check (key ~ '^[a-z0-9_]{2,60}$'),
  value       jsonb not null,
  is_public   boolean not null default false,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

create or replace function public.touch_setting() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch before insert or update on public.app_settings
  for each row execute function public.touch_setting();

-- Users report wrong / outdated content. Reviewed in the admin panel.
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid default auth.uid() references auth.users(id) on delete set null,
  target_type  text not null check (target_type in ('law','law_section','faq','notice','other')),
  target_id    uuid,
  message      text not null check (char_length(message) between 5 and 1000),
  status       text not null default 'open' check (status in ('open','resolved','rejected')),
  resolved_by  uuid references auth.users(id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);

-- Client-side crash / error reports (anonymous allowed, size-limited, retention-limited)
create table if not exists public.error_logs (
  id          bigint generated always as identity primary key,
  user_id     uuid default auth.uid() references auth.users(id) on delete set null,
  app_version text check (app_version is null or char_length(app_version) <= 30),
  platform    text check (platform is null or char_length(platform) <= 30),
  message     text not null check (char_length(message) <= 1000),
  stack       text check (stack is null or char_length(stack) <= 4000),
  context     jsonb check (context is null or octet_length(context::text) <= 4000),
  created_at  timestamptz not null default now()
);
create index if not exists error_logs_created_idx on public.error_logs (created_at desc);

create or replace function public.purge_old_error_logs(keep_days integer default 90) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  delete from public.error_logs where created_at < now() - make_interval(days => keep_days);
  get diagnostics n = row_count;
  return n;
end $$;

-- Append-only history of every change to content (also powers "restore previous version")
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  actor      uuid,
  action     text not null,                 -- INSERT / UPDATE / DELETE
  table_name text not null,
  row_id     text,
  old_data   jsonb,
  new_data   jsonb,
  at         timestamptz not null default now()
);
create index if not exists audit_row_idx on public.audit_log (table_name, row_id, at desc);
create index if not exists audit_at_idx  on public.audit_log (at desc);

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor, action, table_name, row_id, old_data, new_data)
  values (
    auth.uid(), tg_op, tg_table_name,
    coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id'),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['categories','laws','law_sections','faqs','notices','legal_pages','app_settings'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- Role changes are security relevant: audit them too.
drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit after update on public.profiles
  for each row when (old.role is distinct from new.role) execute function public.audit_row();

-- ---------------------------------------------------------------------
-- 6. Account deletion (required by Google Play): user deletes own account in-app
-- ---------------------------------------------------------------------
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from auth.users where id = auth.uid();   -- cascades to profiles; reports/logs keep NULL user
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------
-- 6b. Admin helpers (admin panel): list users with email, so roles can be assigned.
-- ---------------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (id uuid, email text, full_name text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, p.full_name, coalesce(p.role, 'user'), u.created_at
    from auth.users u left join public.profiles p on p.id = u.id
    order by u.created_at desc
    limit 500;
end $$;
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

revoke all on function public.purge_old_error_logs(integer) from public, anon;
grant execute on function public.purge_old_error_logs(integer) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.categories   enable row level security;
alter table public.laws         enable row level security;
alter table public.law_sections enable row level security;
alter table public.faqs         enable row level security;
alter table public.notices      enable row level security;
alter table public.legal_pages  enable row level security;
alter table public.content_meta enable row level security;
alter table public.app_settings enable row level security;
alter table public.reports      enable row level security;
alter table public.error_logs   enable row level security;
alter table public.audit_log    enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- content tables: public reads published + archived (archived = tombstone), staff read all
do $$
declare t text;
begin
  foreach t in array array['categories','laws','faqs','notices','legal_pages'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format($p$create policy %I on public.%I for select using (status in ('published','archived') or public.is_staff())$p$, t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert with check (public.is_staff())', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update using (public.is_staff()) with check (public.is_staff())', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete using (public.is_admin())', t || '_delete', t);
  end loop;
end $$;

-- law_sections: readable only while the parent law is public
drop policy if exists law_sections_read on public.law_sections;
create policy law_sections_read on public.law_sections for select using (
  public.is_staff()
  or (status in ('published','archived')
      and exists (select 1 from public.laws l where l.id = law_id and l.status in ('published','archived')))
);
drop policy if exists law_sections_insert on public.law_sections;
create policy law_sections_insert on public.law_sections for insert with check (public.is_staff());
drop policy if exists law_sections_update on public.law_sections;
create policy law_sections_update on public.law_sections for update using (public.is_staff()) with check (public.is_staff());
drop policy if exists law_sections_delete on public.law_sections;
create policy law_sections_delete on public.law_sections for delete using (public.is_admin());

-- content_meta: everyone reads, nobody writes directly (triggers do, as definer)
drop policy if exists content_meta_read on public.content_meta;
create policy content_meta_read on public.content_meta for select using (true);

-- app_settings
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select using (is_public or public.is_staff());
drop policy if exists app_settings_insert on public.app_settings;
create policy app_settings_insert on public.app_settings for insert with check (public.is_admin());
drop policy if exists app_settings_update on public.app_settings;
create policy app_settings_update on public.app_settings for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists app_settings_delete on public.app_settings;
create policy app_settings_delete on public.app_settings for delete using (public.is_admin());

-- reports: signed-in users file reports and see their own; staff review
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (user_id = auth.uid() and status = 'open' and resolved_by is null and resolved_at is null);
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select using (user_id = auth.uid() or public.is_staff());
drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports for update using (public.is_staff()) with check (public.is_staff());

-- error_logs: anyone may write (size-limited), only admins read/delete
drop policy if exists error_logs_insert on public.error_logs;
create policy error_logs_insert on public.error_logs for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
drop policy if exists error_logs_select on public.error_logs;
create policy error_logs_select on public.error_logs for select using (public.is_admin());
drop policy if exists error_logs_delete on public.error_logs;
create policy error_logs_delete on public.error_logs for delete using (public.is_admin());

-- audit_log: admins read; written only by the definer trigger
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select using (public.is_admin());

-- Least privilege on top of RLS
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
revoke insert, update, delete on public.content_meta from anon, authenticated;
revoke update on public.error_logs from anon, authenticated;
revoke all on public.profiles from anon;

-- ---------------------------------------------------------------------
-- 8. Seed: categories + public settings (laws themselves are added from the admin panel)
-- ---------------------------------------------------------------------
insert into public.categories (slug, name_bn, name_en, icon, sort_order) values
  ('criminal',        'ফৌজদারি আইন',                 'Criminal Law',               'scale',     10),
  ('civil-land',      'দেওয়ানি ও ভূমি আইন',          'Civil & Land Law',           'land',      20),
  ('family',          'পারিবারিক আইন',               'Family Law',                 'family',    30),
  ('women-children',  'নারী ও শিশু সুরক্ষা',          'Women & Child Protection',   'shield',    40),
  ('labour-business', 'শ্রম, চাকরি ও ব্যবসা',         'Labour, Jobs & Business',    'briefcase', 50),
  ('cyber',           'সাইবার ও ডিজিটাল নিরাপত্তা',   'Cyber & Digital Security',   'lock',      60)
on conflict (slug) do nothing;

insert into public.app_settings (key, value, is_public, description) values
  ('maintenance_mode', '{"enabled": false, "message_bn": "", "message_en": ""}', true,  'Set enabled=true to show a maintenance screen in the app'),
  ('min_app_version',  '"0.1.0"',                                               true,  'Apps older than this must update'),
  ('feature_flags',    '{"land_calculator": false, "inheritance": false, "gov_services": false, "ai_assistant": false, "lawyers": false}', true, 'Turn Phase 1+ modules on without a new release'),
  ('contact',          '{"email": ""}',                                         true,  'Support contact shown in Settings')
on conflict (key) do nothing;

-- After this file, also run supabase/seed_legal.sql (generated by: npm run legal).
