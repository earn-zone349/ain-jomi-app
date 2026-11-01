-- Phase 6: AI assistant. Safe to run more than once.
-- Run this in the Supabase SQL Editor, then deploy the Edge Function (see README, Phase 6).
--
--  ai_usage   : how many questions each person (a hash of IP + device, never the question) asked today. Server only.
--  ai_take()  : counts one question and says how many are left today. Only the Edge Function (service role) can call it.
--  ai_limits  : the daily limits, editable in the admin panel under Settings.
-- The question text is never stored.

create table if not exists public.ai_usage (
  day date not null default ((now() at time zone 'utc')::date),
  key text not null check (char_length(key) between 1 and 128),
  n   integer not null default 0 check (n >= 0),
  primary key (day, key)
);
alter table public.ai_usage enable row level security;
-- no policies on purpose: nobody can read or write this table except the service role
revoke all on public.ai_usage from anon, authenticated;

create or replace function public.ai_take(p_key text, p_per_key integer, p_global integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_n integer;
  v_g integer;
begin
  if p_key is null or char_length(p_key) = 0 or p_per_key < 1 or p_global < 1 then
    raise exception 'bad arguments';
  end if;
  -- global cap first, so a flood cannot run up the bill
  insert into public.ai_usage (day, key, n) values (v_day, '*', 1)
    on conflict (day, key) do update set n = public.ai_usage.n + 1
    returning n into v_g;
  if v_g > p_global then
    update public.ai_usage set n = n - 1 where day = v_day and key = '*';
    return -2;
  end if;
  insert into public.ai_usage (day, key, n) values (v_day, p_key, 1)
    on conflict (day, key) do update set n = public.ai_usage.n + 1
    returning n into v_n;
  if v_n > p_per_key then
    update public.ai_usage set n = n - 1 where day = v_day and key in ('*', p_key);
    return -1;
  end if;
  delete from public.ai_usage where day < v_day - 7;
  return p_per_key - v_n;
end $$;

revoke all on function public.ai_take(text, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_take(text, integer, integer) to service_role;

insert into public.app_settings (key, value, is_public, description)
values ('ai_limits', '{"per_day": 10, "global_per_day": 500}', false, 'AI assistant: questions per person per day, and for everyone together per day')
on conflict (key) do nothing;
