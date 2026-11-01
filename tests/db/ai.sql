-- Phase 6 tests: daily quota function and who may call it. Every line starts with PASS or FAIL.
\set ON_ERROR_STOP off
\pset tuples_only on
create or replace function ok(name text, cond boolean) returns text language sql as $$ select case when coalesce(cond,false) then 'PASS  ' else 'FAIL  ' end || name $$;
grant execute on function ok(text, boolean) to anon, authenticated;

reset role;
select ok('limits setting exists and is private', (select value->>'per_day' = '10' and not is_public from app_settings where key='ai_limits'));
select ok('first question: 2 of 3 left', public.ai_take('k1', 3, 100) = 2);
select ok('second: 1 left', public.ai_take('k1', 3, 100) = 1);
select ok('third: 0 left', public.ai_take('k1', 3, 100) = 0);
select ok('fourth is refused (-1)', public.ai_take('k1', 3, 100) = -1);
select ok('refused call does not use up quota (count stays 3)', (select n from ai_usage where key='k1' and day=(now() at time zone 'utc')::date) = 3);
select ok('another person is not affected', public.ai_take('k2', 3, 100) = 2);
select ok('global cap (-2) when everyone together is at the limit', public.ai_take('k3', 3, 4) = -2);
select ok('global counter not inflated by the refused call', (select n from ai_usage where key='*' and day=(now() at time zone 'utc')::date) = 4);
do $$ begin
  begin perform public.ai_take('', 3, 100); raise notice 'FAIL  empty key was accepted';
  exception when others then raise notice 'PASS  empty key is refused'; end;
  begin perform public.ai_take('k9', 0, 100); raise notice 'FAIL  limit 0 was accepted';
  exception when others then raise notice 'PASS  limit 0 is refused'; end;
end $$;

set role anon;
select case when has_function_privilege('anon', 'public.ai_take(text,integer,integer)', 'execute') then 'FAIL  anon can call ai_take' else 'PASS  anon cannot call ai_take' end;
set role authenticated;
select case when has_function_privilege('authenticated', 'public.ai_take(text,integer,integer)', 'execute') then 'FAIL  signed-in user can call ai_take' else 'PASS  signed-in user cannot call ai_take' end;
select case when has_table_privilege('authenticated', 'public.ai_usage', 'select') then 'FAIL  signed-in user can read ai_usage' else 'PASS  signed-in user cannot read ai_usage' end;
select case when has_table_privilege('anon', 'public.ai_usage', 'insert') then 'FAIL  anon can write ai_usage' else 'PASS  anon cannot write ai_usage' end;
reset role;
