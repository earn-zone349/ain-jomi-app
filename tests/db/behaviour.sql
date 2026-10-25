\set ON_ERROR_STOP off
-- users
insert into auth.users (id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1','admin@x.com','{"full_name":"Admin"}'),
 ('00000000-0000-0000-0000-0000000000b2','ed@x.com','{}'),
 ('00000000-0000-0000-0000-0000000000c3','user@x.com','{}');
select 'profiles auto-created: ' || count(*) from profiles;
-- bootstrap admin from SQL editor (auth.uid() is null)
update profiles set role='admin' where id='00000000-0000-0000-0000-0000000000a1';
update profiles set role='editor' where id='00000000-0000-0000-0000-0000000000b2';

\echo '--- user tries to self-promote (must FAIL)'
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000c3';
update profiles set role='admin' where id='00000000-0000-0000-0000-0000000000c3';
select 'user role still: ' || role from profiles where id='00000000-0000-0000-0000-0000000000c3';
select 'user sees profiles: ' || count(*) from profiles;
reset role;

\echo '--- editor creates law (draft) and sections'
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b2';
insert into laws (slug,title_bn,title_en,status,category_id) select 'penal-code-1860','দণ্ডবিধি','Penal Code',  'draft', id from categories where slug='criminal';
insert into law_sections (law_id,section_no,text_en,status) select id,'378','Theft text','published' from laws where slug='penal-code-1860';
select 'editor created_by set: ' || (created_by is not null) from laws where slug='penal-code-1860';
reset role;

\echo '--- anon sees NO draft law, and no section of a draft law'
set role anon; set request.jwt.claim.sub='';
select 'anon laws: ' || count(*) from laws;
select 'anon sections: ' || count(*) from law_sections;
select 'anon categories: ' || count(*) from categories;
reset role;

\echo '--- editor publishes; anon now sees it'
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b2';
update laws set status='published' where slug='penal-code-1860';
\echo '--- published -> draft must FAIL'
update laws set status='draft' where slug='penal-code-1860';
reset role;
set role anon; set request.jwt.claim.sub='';
select 'anon laws after publish: ' || count(*) from laws;
select 'anon sections after publish: ' || count(*) from law_sections;
\echo '--- anon cannot write'
insert into laws (slug,title_bn,title_en) values ('hack','x','x');
update categories set name_en='pwned';
reset role;

\echo '--- editor archives (tombstone still visible to anon) ; editor cannot hard delete'
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b2';
update laws set status='archived' where slug='penal-code-1860';
delete from laws where slug='penal-code-1860';
reset role;
set role anon; select 'anon sees archived tombstone: ' || count(*) from laws; reset role;

\echo '--- version counter + epoch'
select 'content_version=' || content_version || ' epoch=' || epoch from content_meta;
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a1';
delete from law_sections;
reset role;
select 'after admin hard delete: content_version=' || content_version || ' epoch=' || epoch from content_meta;
set role anon; update content_meta set epoch=99; reset role;

\echo '--- audit log'
select 'audit rows: ' || count(*) from audit_log;
set role anon; select count(*) from audit_log; reset role;
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000c3';
select 'normal user audit rows visible: ' || count(*) from audit_log; reset role;

\echo '--- reports'
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000c3';
insert into reports (target_type,message) values ('law','Wrong penalty amount in section');
insert into reports (target_type,message,user_id) values ('law','Spoof as someone else','00000000-0000-0000-0000-0000000000a1');
insert into reports (target_type,message) values ('law','x');
select 'user sees own reports: ' || count(*) from reports; reset role;
set role anon; set request.jwt.claim.sub=''; insert into reports (target_type,message) values ('law','anon report attempt'); reset role;

\echo '--- error_logs'
set role anon; set request.jwt.claim.sub='';
insert into error_logs (message,app_version,platform) values ('boom','0.1.0','android');
select count(*) from error_logs;
reset role;
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a1';
select 'admin reads error_logs: ' || count(*) from error_logs; reset role;

\echo '--- app_settings public vs private'
set role anon; select 'anon settings: ' || count(*) from app_settings; reset role;

\echo '--- delete_my_account'
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000c3';
select delete_my_account(); reset role;
select 'users left: ' || count(*) from auth.users;
set role anon; set request.jwt.claim.sub=''; select delete_my_account(); reset role;
