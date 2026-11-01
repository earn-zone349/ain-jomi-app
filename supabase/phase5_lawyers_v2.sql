-- =====================================================================
--  Ain Jomi: Phase 5 (version 2) - lawyer profile details, certificates, paid contact unlock, paid ratings.
--  Run ONCE in Supabase Dashboard > SQL Editor, AFTER schema.sql and phase5_lawyers.sql. Safe to re-run.
--
--  What changes compared with phase5_lawyers.sql
--   * The advocate gives everything in ONE application: details, experience, cases, achievements, and the
--     scanned certificates (stored in a private Storage bucket). An admin checks them before anything is public.
--   * Phone and email are NOT in the public list any more. A user pays a small fee (default 50 BDT) per advocate
--     and then sees that advocate's phone and email. Office address stays public.
--   * A user may rate an advocate (1 to 5 stars) only after paying the rating fee (default 2500 BDT). One rating
--     per user per advocate. The advocate can not rate themselves. An admin can hide a rating.
--   * Money: for now the user pays by bKash "Send Money" to the number set by the admin, then enters the
--     transaction ID in the app. An admin checks the transaction in the bKash app and approves it. No payment
--     gateway is needed. Fees are read from app_settings.lawyer_pricing by the DATABASE, so a modified app can
--     not choose its own price.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Extra profile fields
-- ---------------------------------------------------------------------
alter table public.lawyer_profiles add column if not exists education text
  check (education is null or char_length(education) <= 600);
alter table public.lawyer_profiles add column if not exists practising_since integer
  check (practising_since is null or practising_since between 1948 and 2100);
alter table public.lawyer_profiles add column if not exists cases_handled integer
  check (cases_handled is null or cases_handled between 0 and 1000000);
alter table public.lawyer_profiles add column if not exists cases_won integer
  check (cases_won is null or cases_won between 0 and 1000000);
alter table public.lawyer_profiles add column if not exists achievements text
  check (achievements is null or char_length(achievements) <= 600);
alter table public.lawyer_profiles add column if not exists certificate_paths text[] not null default '{}'::text[]
  check (cardinality(certificate_paths) <= 5);

alter table public.lawyer_profiles drop constraint if exists lawyer_cases_order;
alter table public.lawyer_profiles add constraint lawyer_cases_order
  check (cases_won is null or cases_handled is null or cases_won <= cases_handled);

-- ---------------------------------------------------------------------
-- 2. Settings: prices and the bKash number (public, edited by an admin in the admin panel)
-- ---------------------------------------------------------------------
insert into public.app_settings (key, value, is_public, description)
values ('lawyer_pricing',
        '{"contact_fee":50,"rating_fee":2500,"bkash_number":"","note_bn":"","note_en":""}'::jsonb,
        true, 'Lawyer directory: contact unlock fee, rating fee, bKash number, payment note')
on conflict (key) do nothing;

create or replace function public.lawyer_fee(p_kind text) returns integer
language plpgsql stable security definer set search_path = public as $$
declare v jsonb; n integer;
begin
  select value into v from public.app_settings where key = 'lawyer_pricing';
  n := case p_kind when 'contact' then (v->>'contact_fee')::integer when 'rating' then (v->>'rating_fee')::integer end;
  if n is null or n < 0 or n > 100000 then
    raise exception 'The fee is not set. An admin must set lawyer_pricing in Settings.' using errcode = '22023';
  end if;
  return n;
end $$;
revoke all on function public.lawyer_fee(text) from public, anon;
grant execute on function public.lawyer_fee(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Guard on lawyer_profiles (replaces the phase 5 version)
-- ---------------------------------------------------------------------
create or replace function public.lawyer_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  admin boolean := public.is_admin();
  changed boolean;
  p text;
begin
  -- A foreign-key action (for example "set null" when an admin account is deleted) fires this trigger at depth 2.
  -- Those updates are not user edits, so let them through unchanged.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then return new; end if;
  new.full_name       := btrim(new.full_name);
  new.enrollment_no   := btrim(new.enrollment_no);
  new.bar_association := btrim(new.bar_association);
  new.office_address  := btrim(new.office_address);
  new.phone           := regexp_replace(btrim(new.phone), '[[:space:]-]', '', 'g');
  new.email           := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.qualifications  := nullif(btrim(coalesce(new.qualifications, '')), '');
  new.education       := nullif(btrim(coalesce(new.education, '')), '');
  new.achievements    := nullif(btrim(coalesce(new.achievements, '')), '');
  new.updated_at      := clock_timestamp();

  -- certificate files must live in the owner's own folder
  foreach p in array new.certificate_paths loop
    if p is null or p !~ ('^' || new.user_id::text || '/[A-Za-z0-9._-]{1,80}$') then
      raise exception 'invalid certificate path' using errcode = '23514';
    end if;
  end loop;

  if tg_op = 'INSERT' then
    new.created_at := now();
    if uid is not null then
      new.user_id := uid;
      new.status := 'pending';
      new.verified_at := null;
      new.verified_by := null;
      new.review_note := null;
    end if;
    return new;
  end if;

  new.created_at := old.created_at;
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id can not be changed' using errcode = '42501';
  end if;

  if uid is not null and not admin then
    new.status := old.status;
    new.verified_at := old.verified_at;
    new.verified_by := old.verified_by;
    new.review_note := old.review_note;
    changed := (new.full_name, new.enrollment_no, new.enrollment_year, new.bar_association, new.courts, new.practice_areas,
                new.district, new.office_address, new.phone, new.email, new.qualifications,
                new.education, new.practising_since, new.cases_handled, new.cases_won, new.achievements, new.certificate_paths)
               is distinct from
               (old.full_name, old.enrollment_no, old.enrollment_year, old.bar_association, old.courts, old.practice_areas,
                old.district, old.office_address, old.phone, old.email, old.qualifications,
                old.education, old.practising_since, old.cases_handled, old.cases_won, old.achievements, old.certificate_paths);
    if changed and old.status in ('verified','rejected') then
      new.status := 'pending';
      new.verified_at := null;
      new.verified_by := null;
      new.review_note := null;
    end if;
  elsif new.status is distinct from old.status then
    if new.status = 'verified' then
      if cardinality(new.certificate_paths) = 0 then
        raise exception 'Can not verify: no certificate has been uploaded' using errcode = '23514';
      end if;
      new.verified_at := now();
      new.verified_by := uid;
      new.review_note := nullif(btrim(coalesce(new.review_note, '')), '');
    elsif new.status = 'pending' then
      new.verified_at := null;
      new.verified_by := null;
    elsif coalesce(btrim(new.review_note), '') = '' then
      raise exception 'A reason is required when rejecting or suspending' using errcode = '23514';
    end if;
    if new.status <> 'verified' then
      new.verified_at := null;
      new.verified_by := null;
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 4. Payments (bKash, checked by an admin)
-- ---------------------------------------------------------------------
create table if not exists public.lawyer_payments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid default auth.uid() references auth.users(id) on delete set null,
  lawyer_id     uuid references public.lawyer_profiles(id) on delete set null,
  lawyer_name   text,
  kind          text not null check (kind in ('contact','rating')),
  amount_bdt    integer not null default 0 check (amount_bdt >= 0),
  method        text not null default 'bkash' check (method = 'bkash'),
  sender_number text not null check (sender_number ~ '^\+?[0-9]{6,15}$'),
  trx_id        text not null check (trx_id ~ '^[A-Z0-9]{6,20}$'),
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note   text check (review_note is null or char_length(review_note) <= 300),
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists lawyer_payments_status_idx on public.lawyer_payments (status, created_at);
create index if not exists lawyer_payments_user_idx on public.lawyer_payments (user_id, lawyer_id, kind);
-- the same bKash transaction can not be used twice (a rejected one may be re-entered correctly)
create unique index if not exists lawyer_payments_trx_uq on public.lawyer_payments (trx_id) where status <> 'rejected';
-- one open or approved payment of each kind per user per advocate
create unique index if not exists lawyer_payments_once_uq on public.lawyer_payments (user_id, lawyer_id, kind) where status <> 'rejected';

create or replace function public.lawyer_payment_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  l record;
begin
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then return new; end if;   -- foreign-key "set null" (account or listing deleted)
  if tg_op = 'INSERT' then
    new.trx_id := upper(regexp_replace(btrim(new.trx_id), '[[:space:]]', '', 'g'));
    new.sender_number := regexp_replace(btrim(new.sender_number), '[[:space:]-]', '', 'g');
    select id, user_id, full_name, status into l from public.lawyer_profiles where id = new.lawyer_id;
    if not found or l.status <> 'verified' then
      raise exception 'This advocate is not listed' using errcode = '23514';
    end if;
    if uid is not null then
      new.user_id := uid;
      if l.user_id = uid then
        raise exception 'You can not pay for your own listing' using errcode = '23514';
      end if;
      new.status := 'pending';
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.review_note := null;
    end if;
    new.lawyer_name := l.full_name;
    new.amount_bdt := public.lawyer_fee(new.kind);   -- price always comes from the database
    new.method := 'bkash';
    new.created_at := now();
    return new;
  end if;

  -- UPDATE: only an admin decision may change a payment, and only status and note
  if uid is not null and not public.is_admin() then
    raise exception 'Only an admin can change a payment' using errcode = '42501';
  end if;
  if (new.user_id, new.lawyer_id, new.kind, new.amount_bdt, new.sender_number, new.trx_id, new.created_at)
     is distinct from (old.user_id, old.lawyer_id, old.kind, old.amount_bdt, old.sender_number, old.trx_id, old.created_at) then
    raise exception 'Only status and note can be changed' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'A decided payment can not be changed' using errcode = '23514';
    end if;
    if new.status = 'rejected' and coalesce(btrim(new.review_note), '') = '' then
      raise exception 'A reason is required when rejecting a payment' using errcode = '23514';
    end if;
    new.reviewed_by := uid;
    new.reviewed_at := now();
  end if;
  return new;
end $$;

drop trigger if exists lawyer_payments_guard on public.lawyer_payments;
create trigger lawyer_payments_guard before insert or update on public.lawyer_payments
  for each row execute function public.lawyer_payment_guard();
drop trigger if exists lawyer_payments_audit on public.lawyer_payments;
create trigger lawyer_payments_audit after insert or update or delete on public.lawyer_payments
  for each row execute function public.audit_row();

alter table public.lawyer_payments enable row level security;
drop policy if exists lawyer_payments_select on public.lawyer_payments;
create policy lawyer_payments_select on public.lawyer_payments for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists lawyer_payments_insert on public.lawyer_payments;
create policy lawyer_payments_insert on public.lawyer_payments for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists lawyer_payments_update on public.lawyer_payments;
create policy lawyer_payments_update on public.lawyer_payments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.lawyer_payments from anon;
grant select, insert, update on public.lawyer_payments to authenticated;

-- ---------------------------------------------------------------------
-- 5. Ratings: only through the function below, only after an approved rating payment
-- ---------------------------------------------------------------------
create table if not exists public.lawyer_ratings (
  id         uuid primary key default gen_random_uuid(),
  lawyer_id  uuid not null references public.lawyer_profiles(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  payment_id uuid references public.lawyer_payments(id) on delete set null,
  stars      integer not null check (stars between 1 and 5),
  comment    text check (comment is null or char_length(comment) <= 500),
  status     text not null default 'visible' check (status in ('visible','hidden')),
  created_at timestamptz not null default now()
);
create unique index if not exists lawyer_ratings_once_uq on public.lawyer_ratings (lawyer_id, user_id);
create index if not exists lawyer_ratings_lawyer_idx on public.lawyer_ratings (lawyer_id) where status = 'visible';

create or replace function public.lawyer_rating_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then return new; end if;   -- foreign-key "set null" (account or payment deleted)
  if tg_op = 'UPDATE' then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Only an admin can change a rating' using errcode = '42501';
    end if;
    if (new.lawyer_id, new.user_id, new.payment_id, new.stars, new.comment, new.created_at)
       is distinct from (old.lawyer_id, old.user_id, old.payment_id, old.stars, old.comment, old.created_at) then
      raise exception 'Only the visibility of a rating can be changed' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists lawyer_ratings_guard on public.lawyer_ratings;
create trigger lawyer_ratings_guard before update on public.lawyer_ratings
  for each row execute function public.lawyer_rating_guard();
drop trigger if exists lawyer_ratings_audit on public.lawyer_ratings;
create trigger lawyer_ratings_audit after insert or update or delete on public.lawyer_ratings
  for each row execute function public.audit_row();

alter table public.lawyer_ratings enable row level security;
drop policy if exists lawyer_ratings_select on public.lawyer_ratings;
create policy lawyer_ratings_select on public.lawyer_ratings for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists lawyer_ratings_update on public.lawyer_ratings;
create policy lawyer_ratings_update on public.lawyer_ratings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.lawyer_ratings from anon, authenticated;
grant select, update on public.lawyer_ratings to authenticated;

create or replace function public.submit_lawyer_rating(p_lawyer uuid, p_stars integer, p_comment text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pay uuid;
  l record;
  rid uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select id, user_id, status into l from public.lawyer_profiles where id = p_lawyer;
  if not found or l.status <> 'verified' then raise exception 'This advocate is not listed' using errcode = '23514'; end if;
  if l.user_id = uid then raise exception 'You can not rate yourself' using errcode = '23514'; end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then raise exception 'Stars must be 1 to 5' using errcode = '22023'; end if;
  if p_comment is not null and char_length(btrim(p_comment)) > 500 then raise exception 'Comment is too long' using errcode = '22001'; end if;
  select id into pay from public.lawyer_payments
    where user_id = uid and lawyer_id = p_lawyer and kind = 'rating' and status = 'approved' limit 1;
  if pay is null then raise exception 'An approved rating payment is required' using errcode = '42501'; end if;
  insert into public.lawyer_ratings (lawyer_id, user_id, payment_id, stars, comment)
  values (p_lawyer, uid, pay, p_stars, nullif(btrim(coalesce(p_comment, '')), ''))
  returning id into rid;     -- the unique index stops a second rating
  return rid;
end $$;
revoke all on function public.submit_lawyer_rating(uuid, integer, text) from public, anon;
grant execute on function public.submit_lawyer_rating(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Contact details: only after an approved contact payment (or for the owner and admins)
-- ---------------------------------------------------------------------
create or replace function public.get_lawyer_contact(p_lawyer uuid)
returns table (phone text, email text) language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if not (
    public.is_admin()
    or exists (select 1 from public.lawyer_profiles p where p.id = p_lawyer and p.user_id = uid)
    or exists (select 1 from public.lawyer_payments y
               where y.user_id = uid and y.lawyer_id = p_lawyer and y.kind = 'contact' and y.status = 'approved')
  ) then
    raise exception 'The contact fee has not been paid' using errcode = '42501';
  end if;
  return query select p.phone, p.email from public.lawyer_profiles p where p.id = p_lawyer and p.status = 'verified';
end $$;
revoke all on function public.get_lawyer_contact(uuid) from public, anon;
grant execute on function public.get_lawyer_contact(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Public views. Phone and email are gone from the list. Ratings are summarised here.
-- ---------------------------------------------------------------------
drop view if exists public.lawyers_public;
create view public.lawyers_public as
  select p.id, p.full_name, p.enrollment_no, p.enrollment_year, p.bar_association, p.courts, p.practice_areas, p.district,
         p.office_address, p.qualifications, p.education, p.practising_since, p.cases_handled, p.cases_won, p.achievements,
         p.certificate_paths, p.verified_at,
         (select round(avg(r.stars)::numeric, 1) from public.lawyer_ratings r where r.lawyer_id = p.id and r.status = 'visible') as rating_avg,
         (select count(*)::integer from public.lawyer_ratings r where r.lawyer_id = p.id and r.status = 'visible') as rating_count
  from public.lawyer_profiles p
  where p.status = 'verified';
revoke all on public.lawyers_public from anon, authenticated;
grant select on public.lawyers_public to anon, authenticated;

drop view if exists public.lawyer_ratings_public;
create view public.lawyer_ratings_public as
  select r.id, r.lawyer_id, r.stars, r.comment, r.created_at
  from public.lawyer_ratings r
  join public.lawyer_profiles p on p.id = r.lawyer_id and p.status = 'verified'
  where r.status = 'visible';
revoke all on public.lawyer_ratings_public from anon, authenticated;
grant select on public.lawyer_ratings_public to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. Certificate files: private Storage bucket.
--    The owner uploads into a folder named after their user id. Admins can open everything.
--    Everybody can open the certificates of a VERIFIED advocate (they are shown in the list).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lawyer-certs', 'lawyer-certs', false, 3145728, array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg','image/png','application/pdf'];

create or replace function public.is_verified_certificate(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lawyer_profiles p where p.status = 'verified' and p_name = any(p.certificate_paths));
$$;
revoke all on function public.is_verified_certificate(text) from public;
grant execute on function public.is_verified_certificate(text) to anon, authenticated;

drop policy if exists lawyer_certs_insert on storage.objects;
create policy lawyer_certs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'lawyer-certs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists lawyer_certs_select on storage.objects;
create policy lawyer_certs_select on storage.objects for select
  using (bucket_id = 'lawyer-certs' and (
    (storage.foldername(name))[1] = auth.uid()::text or public.is_admin() or public.is_verified_certificate(name)));
drop policy if exists lawyer_certs_delete on storage.objects;
create policy lawyer_certs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'lawyer-certs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------------
-- 9. Reports may now also name a rating or a payment problem
-- ---------------------------------------------------------------------
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('law','law_section','faq','notice','lawyer','other'));
