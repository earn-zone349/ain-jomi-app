-- Phase 5 behaviour tests for the lawyer directory. Every line starts with PASS or FAIL.
\set ON_ERROR_STOP off
\pset tuples_only on
create or replace function ok(name text, cond boolean) returns text language sql as $$ select case when coalesce(cond,false) then 'PASS  ' else 'FAIL  ' end || name $$;
create or replace function must_fail(name text, stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return 'FAIL  ' || name || ' (it was allowed)';
exception when others then
  return 'PASS  ' || name;
end $$;
grant execute on function ok(text, boolean), must_fail(text, text) to anon, authenticated;

insert into auth.users (id,email) values
 ('00000000-0000-0000-0000-0000000000d1','ad@x.com'),
 ('00000000-0000-0000-0000-0000000000e1','a@x.com'),
 ('00000000-0000-0000-0000-0000000000e2','b@x.com'),
 ('00000000-0000-0000-0000-0000000000e3','ed@x.com');
update profiles set role='admin'  where id='00000000-0000-0000-0000-0000000000d1';
update profiles set role='editor' where id='00000000-0000-0000-0000-0000000000e3';

\set A '''00000000-0000-0000-0000-0000000000e1'''
\set B '''00000000-0000-0000-0000-0000000000e2'''
\set AD '''00000000-0000-0000-0000-0000000000d1'''
\set ED '''00000000-0000-0000-0000-0000000000e3'''

-- anon: no access to the table
set role anon; set request.jwt.claim.sub='';
select must_fail('anon can not read lawyer_profiles', 'select count(*) from lawyer_profiles');
select must_fail('anon can not insert', $$insert into lawyer_profiles (full_name,enrollment_no,bar_association,courts,practice_areas,district,office_address,phone,consent_public) values ('Anon Person','1','Dhaka',array['lower_courts'],array['land-law'],'dhaka','Some address','01700000000',true)$$);
reset role;

-- A applies, trying to pick status=verified and fake review fields
set role authenticated; set request.jwt.claim.sub=:A;
insert into lawyer_profiles (full_name,enrollment_no,enrollment_year,bar_association,courts,practice_areas,district,office_address,phone,email,qualifications,consent_public,status,verified_at,review_note)
 values ('  Ayesha Rahman ','DBA-1234',2015,'Dhaka Bar',array['lower_courts','high_court_division'],array['land-law','family-law'],'dhaka','12 Court Road, Dhaka',' 0170-000 0001 ','A@X.com','LL.B, LL.M',true,'verified',now(),'trust me');
select ok('applicant row is forced to pending', (select status='pending' and verified_at is null and review_note is null and user_id=:A::uuid from lawyer_profiles));
select ok('input is tidied (name, phone, email)', (select full_name='Ayesha Rahman' and phone='01700000001' and email='a@x.com' from lawyer_profiles));
select must_fail('one application per user', $$insert into lawyer_profiles (full_name,enrollment_no,bar_association,courts,practice_areas,district,office_address,phone,consent_public) values ('Ayesha Two','2','Dhaka',array['lower_courts'],array['land-law'],'dhaka','Some address','01700000002',true)$$);
update lawyer_profiles set status='verified', verified_at=now(), review_note='x';
select ok('applicant cannot verify themselves', (select status='pending' and verified_at is null and review_note is null from lawyer_profiles));
reset role;

-- B: sees nothing of A, can not hijack user_id
set role authenticated; set request.jwt.claim.sub=:B;
select ok('B can not read A''s application', (select count(*)=0 from lawyer_profiles));
insert into lawyer_profiles (user_id,full_name,enrollment_no,bar_association,courts,practice_areas,district,office_address,phone,consent_public)
 values (:A::uuid,'Bashir Ahmed','DBA-1234','Dhaka Bar',array['lower_courts'],array['criminal-law'],'dhaka','5 Bar Lane, Dhaka','01800000001',true);
select ok('B inserting with A''s user_id still gets B''s own row', (select count(*)=1 and min(user_id::text)=:B from lawyer_profiles));
update lawyer_profiles set full_name='Hijack' where user_id=:A::uuid;
reset role;
select ok('B can not edit A''s row', (select full_name='Ayesha Rahman' from lawyer_profiles where user_id=:A::uuid));

-- editor is not an admin
set role authenticated; set request.jwt.claim.sub=:ED;
select ok('editor can not see applications', (select count(*)=0 from lawyer_profiles));
reset role;

-- public view shows nobody while everything is pending
set role anon; set request.jwt.claim.sub='';
select ok('pending listings are not public', (select count(*)=0 from lawyers_public));
reset role;

-- admin verifies A
set role authenticated; set request.jwt.claim.sub=:AD;
select ok('admin sees all applications', (select count(*)=2 from lawyer_profiles));
update lawyer_profiles set status='verified' where user_id=:A::uuid;
select ok('admin verification stamps who and when', (select status='verified' and verified_at is not null and verified_by=:AD::uuid from lawyer_profiles where user_id=:A::uuid));
-- B with the same enrolment at the same bar can not also be verified
select must_fail('same bar + enrolment number can not be verified twice', $$update lawyer_profiles set status='verified' where user_id='00000000-0000-0000-0000-0000000000e2'$$);
reset role;

-- public view: anon sees A but not contact details
set role anon; set request.jwt.claim.sub='';
select ok('anon sees the verified lawyer', (select count(*)=1 from lawyers_public));
select must_fail('anon can not read phone', 'select phone from lawyers_public');
select must_fail('anon can not read email', 'select email from lawyers_public');
select must_fail('anon can not read office address', 'select office_address from lawyers_public');
select ok('anon can read name and areas', (select full_name='Ayesha Rahman' and practice_areas=array['land-law','family-law'] from lawyers_public));
select must_fail('anon can not read status or review note', 'select status from lawyers_public');
reset role;
set role authenticated; set request.jwt.claim.sub=:B;
select ok('signed-in user sees contact details', (select phone='01700000001' and office_address like '12 Court%' from lawyers_public));
select must_fail('view has no status column', 'select status from lawyers_public');
reset role;

-- A edits a verified listing: back to pending, no longer public
set role authenticated; set request.jwt.claim.sub=:A;
update lawyer_profiles set office_address='99 New Road, Dhaka';
select ok('editing a verified listing sends it back to pending', (select status='pending' and verified_at is null and verified_by is null from lawyer_profiles));
reset role;
select ok('and it disappears from the public list', (select count(*)=0 from lawyers_public));

-- reject needs a reason
set role authenticated; set request.jwt.claim.sub=:AD;
select must_fail('reject without a reason is refused', $$update lawyer_profiles set status='rejected', review_note='  ' where user_id='00000000-0000-0000-0000-0000000000e1'$$);
update lawyer_profiles set status='rejected', review_note='Enrolment number not found on the roll' where user_id=:A::uuid;
reset role;
set role authenticated; set request.jwt.claim.sub=:A;
select ok('applicant sees the rejection reason', (select status='rejected' and review_note like 'Enrolment%' from lawyer_profiles));
update lawyer_profiles set enrollment_no='DBA-5678';
select ok('fixing a rejected application resubmits it as pending and clears the note', (select status='pending' and review_note is null from lawyer_profiles));
reset role;

-- suspend: the lawyer can not undo it
set role authenticated; set request.jwt.claim.sub=:AD;
update lawyer_profiles set status='verified' where user_id=:A::uuid;
update lawyer_profiles set status='suspended', review_note='Complaint under review' where user_id=:A::uuid;
reset role;
set role authenticated; set request.jwt.claim.sub=:A;
update lawyer_profiles set status='pending', phone='01700000009';
select ok('a suspended lawyer can not reinstate themselves', (select status='suspended' from lawyer_profiles));
reset role;
select ok('suspended is not public', (select count(*)=0 from lawyers_public));

-- constraints
set role authenticated; set request.jwt.claim.sub=:B;
select must_fail('bad phone is refused', $$update lawyer_profiles set phone='abc'$$);
select must_fail('unknown court is refused', $$update lawyer_profiles set courts=array['supreme_leader']$$);
select must_fail('empty courts is refused', $$update lawyer_profiles set courts=array[]::text[]$$);
select must_fail('bad practice area slug is refused', $$update lawyer_profiles set practice_areas=array['Bad Slug!']$$);
select must_fail('missing consent is refused', $$update lawyer_profiles set consent_public=false$$);
select must_fail('too many areas are refused', $$update lawyer_profiles set practice_areas=array['a','b','c','d','e','f','g']$$);
select must_fail('bad email is refused', $$update lawyer_profiles set email='not-an-email'$$);
-- report a listing
insert into reports (target_type, target_id, message) values ('lawyer', (select id from lawyer_profiles where user_id=:B::uuid), 'This person is not an advocate');
select ok('a user can report a lawyer listing', (select count(*)=1 from reports where target_type='lawyer'));
reset role;

-- withdraw / delete
set role authenticated; set request.jwt.claim.sub=:A;
delete from lawyer_profiles;
select ok('owner can withdraw their own application', (select count(*)=0 from lawyer_profiles));
reset role;
select ok('B''s application is untouched', (select count(*)=1 from lawyer_profiles where user_id=:B::uuid));

-- account deletion removes the listing
delete from auth.users where id=:B::uuid;
select ok('deleting the account removes the application', (select count(*)=0 from lawyer_profiles));

-- audit trail
set role authenticated; set request.jwt.claim.sub=:AD;
select ok('every change is in the audit log', (select count(*)>=8 from audit_log where table_name='lawyer_profiles'));
reset role;
