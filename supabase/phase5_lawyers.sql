-- =====================================================================
--  Ain Jomi: Phase 5 database changes, the verified lawyer directory.
--  Run ONCE in Supabase Dashboard > SQL Editor, AFTER schema.sql. Safe to re-run.
--
--  How it works
--   * A signed-in lawyer files ONE application (lawyer_profiles row). It starts as 'pending'.
--   * Only an admin can set status to 'verified' (after checking the Bar Council enrolment by hand).
--   * Editing a verified listing sends it back to 'pending' for a new check.
--   * The public sees only verified lawyers, through the lawyers_public view.
--     Phone/email/address are visible to signed-in users only (keeps bots from scraping the list).
--   * No ratings, no reviews, no paid placement, no commission: the Bangladesh Bar Council conduct rules
--     do not allow advocates to advertise or to pay for client referrals.
-- =====================================================================

create table if not exists public.lawyer_profiles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  full_name        text not null check (char_length(btrim(full_name)) between 3 and 100),
  enrollment_no    text not null check (enrollment_no ~ '^[A-Za-z0-9/. -]{2,40}$'),
  enrollment_year  integer check (enrollment_year between 1948 and 2100),
  bar_association  text not null check (char_length(btrim(bar_association)) between 2 and 100),
  courts           text[] not null check (
                     cardinality(courts) between 1 and 4
                     and courts <@ array['lower_courts','high_court_division','appellate_division','tribunals']::text[]),
  practice_areas   text[] not null check (
                     cardinality(practice_areas) between 1 and 6
                     and array_to_string(practice_areas, ',') ~ '^[a-z0-9-]+(,[a-z0-9-]+)*$'),
  district         text not null check (district ~ '^[a-z_]{3,30}$'),
  office_address   text not null check (char_length(btrim(office_address)) between 5 and 300),
  phone            text not null check (phone ~ '^\+?[0-9]{6,15}$'),
  email            text check (email is null or (char_length(email) <= 120 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  qualifications   text check (qualifications is null or char_length(qualifications) <= 200),
  consent_public   boolean not null check (consent_public),
  status           text not null default 'pending' check (status in ('pending','verified','rejected','suspended')),
  verified_at      timestamptz,
  verified_by      uuid references auth.users(id) on delete set null,
  review_note      text check (review_note is null or char_length(review_note) <= 500),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists lawyer_profiles_status_idx on public.lawyer_profiles (status, created_at desc);
create index if not exists lawyer_profiles_district_idx on public.lawyer_profiles (district) where status = 'verified';
-- Two verified listings can not claim the same enrolment number at the same bar.
create unique index if not exists lawyer_profiles_verified_enrol_uq
  on public.lawyer_profiles (lower(btrim(bar_association)), lower(btrim(enrollment_no))) where status = 'verified';

-- ---------------------------------------------------------------------
-- Guard: tidy input, force 'pending' for applicants, protect status fields, re-check after edits.
-- auth.uid() is NULL in the SQL editor, which is how you can fix data by hand.
-- ---------------------------------------------------------------------
create or replace function public.lawyer_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  admin boolean := public.is_admin();
  changed boolean;
begin
  new.full_name       := btrim(new.full_name);
  new.enrollment_no   := btrim(new.enrollment_no);
  new.bar_association := btrim(new.bar_association);
  new.office_address  := btrim(new.office_address);
  new.phone           := regexp_replace(btrim(new.phone), '[[:space:]-]', '', 'g');
  new.email           := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.qualifications  := nullif(btrim(coalesce(new.qualifications, '')), '');
  new.updated_at      := clock_timestamp();

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
    -- the applicant never controls the review fields
    new.status := old.status;
    new.verified_at := old.verified_at;
    new.verified_by := old.verified_by;
    new.review_note := old.review_note;
    changed := (new.full_name, new.enrollment_no, new.enrollment_year, new.bar_association, new.courts, new.practice_areas,
                new.district, new.office_address, new.phone, new.email, new.qualifications)
               is distinct from
               (old.full_name, old.enrollment_no, old.enrollment_year, old.bar_association, old.courts, old.practice_areas,
                old.district, old.office_address, old.phone, old.email, old.qualifications);
    if changed and old.status in ('verified','rejected') then
      new.status := 'pending';
      new.verified_at := null;
      new.verified_by := null;
      new.review_note := null;
    end if;
  elsif new.status is distinct from old.status then
    if new.status = 'verified' then
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

drop trigger if exists lawyer_profiles_guard on public.lawyer_profiles;
create trigger lawyer_profiles_guard before insert or update on public.lawyer_profiles
  for each row execute function public.lawyer_guard();

drop trigger if exists lawyer_profiles_audit on public.lawyer_profiles;
create trigger lawyer_profiles_audit after insert or update or delete on public.lawyer_profiles
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------
-- Row Level Security: the table itself is private. Owners see/edit their own row, admins see everything.
-- ---------------------------------------------------------------------
alter table public.lawyer_profiles enable row level security;

drop policy if exists lawyer_profiles_select on public.lawyer_profiles;
create policy lawyer_profiles_select on public.lawyer_profiles for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists lawyer_profiles_insert on public.lawyer_profiles;
create policy lawyer_profiles_insert on public.lawyer_profiles for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists lawyer_profiles_update on public.lawyer_profiles;
create policy lawyer_profiles_update on public.lawyer_profiles for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists lawyer_profiles_delete on public.lawyer_profiles;
create policy lawyer_profiles_delete on public.lawyer_profiles for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

revoke all on public.lawyer_profiles from anon;
grant select, insert, update, delete on public.lawyer_profiles to authenticated;

-- ---------------------------------------------------------------------
-- Public view: verified lawyers only, no internal fields. Contact details need a signed-in user.
-- ---------------------------------------------------------------------
create or replace view public.lawyers_public as
  select id, full_name, enrollment_no, enrollment_year, bar_association, courts, practice_areas, district,
         office_address, phone, email, qualifications, verified_at
  from public.lawyer_profiles
  where status = 'verified';

revoke all on public.lawyers_public from anon, authenticated;
grant select (id, full_name, enrollment_no, enrollment_year, bar_association, courts, practice_areas, district, qualifications, verified_at)
  on public.lawyers_public to anon;
grant select on public.lawyers_public to authenticated;

-- ---------------------------------------------------------------------
-- Reports: allow reporting a lawyer listing.
-- ---------------------------------------------------------------------
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('law','law_section','faq','notice','lawyer','other'));
