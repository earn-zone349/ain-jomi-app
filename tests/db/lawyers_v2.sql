-- Phase 5 v2 tests: certificates, paid contact unlock, paid ratings, storage. Every line starts with PASS or FAIL.
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
 ('00000000-0000-0000-0000-0000000000f0','admin2@x.com'),
 ('00000000-0000-0000-0000-0000000000f1','lawyer@x.com'),
 ('00000000-0000-0000-0000-0000000000f2','user1@x.com'),
 ('00000000-0000-0000-0000-0000000000f3','user2@x.com');
update profiles set role='admin' where id='00000000-0000-0000-0000-0000000000f0';
\set AD '''00000000-0000-0000-0000-0000000000f0'''
\set LW '''00000000-0000-0000-0000-0000000000f1'''
\set U1 '''00000000-0000-0000-0000-0000000000f2'''
\set U2 '''00000000-0000-0000-0000-0000000000f3'''

-- lawyer applies with full details but no certificate yet
set role authenticated; set request.jwt.claim.sub=:LW;
insert into lawyer_profiles (full_name,enrollment_no,enrollment_year,bar_association,courts,practice_areas,district,office_address,phone,email,
  education,practising_since,cases_handled,cases_won,achievements,consent_public)
 values ('Nadia Karim','NK-1',2012,'Dhaka Bar',array['lower_courts'],array['land-law'],'dhaka','7 Court Road, Dhaka','01711111111','nk@x.com',
  'LL.B (Dhaka University), LL.M',2012,120,80,'Best junior advocate award 2018',true);
select ok('application with all new fields saved as pending', (select status='pending' and education like 'LL.B%' and cases_won=80 from lawyer_profiles));
select must_fail('won more cases than handled is refused', $$update lawyer_profiles set cases_won=500$$);
select must_fail('certificate in someone else''s folder is refused', $$update lawyer_profiles set certificate_paths=array['00000000-0000-0000-0000-0000000000f2/x.jpg']$$);
select must_fail('certificate path with ../ is refused', $$update lawyer_profiles set certificate_paths=array[(select user_id::text from lawyer_profiles) || '/../x.jpg']$$);
select must_fail('more than 5 certificates is refused', $$update lawyer_profiles set certificate_paths=array[(select user_id::text from lawyer_profiles)||'/1.jpg',(select user_id::text from lawyer_profiles)||'/2.jpg',(select user_id::text from lawyer_profiles)||'/3.jpg',(select user_id::text from lawyer_profiles)||'/4.jpg',(select user_id::text from lawyer_profiles)||'/5.jpg',(select user_id::text from lawyer_profiles)||'/6.jpg']$$);
reset role;

-- admin can not verify without a certificate
set role authenticated; set request.jwt.claim.sub=:AD;
select must_fail('verification without any certificate is refused', $$update lawyer_profiles set status='verified' where user_id='00000000-0000-0000-0000-0000000000f1'$$);
reset role;
set role authenticated; set request.jwt.claim.sub=:LW;
update lawyer_profiles set certificate_paths=array[(:LW)::text || '/llb.pdf'];
reset role;
set role authenticated; set request.jwt.claim.sub=:AD;
update lawyer_profiles set status='verified' where user_id=:LW::uuid;
select ok('admin verifies once a certificate exists', (select status='verified' from lawyer_profiles where user_id=:LW::uuid));
reset role;

-- storage: owner folder, admin, public only for verified certificates
insert into storage.buckets (id,name) values ('lawyer-certs','lawyer-certs') on conflict do nothing;
set role authenticated; set request.jwt.claim.sub=:LW;
insert into storage.objects (bucket_id,name) values ('lawyer-certs', (:LW)::text || '/llb.pdf');
select ok('owner can upload into their own folder', (select count(*)=1 from storage.objects));
select must_fail('owner can not upload into another folder', $$insert into storage.objects (bucket_id,name) values ('lawyer-certs','00000000-0000-0000-0000-0000000000f2/evil.pdf')$$);
reset role;
insert into storage.objects (bucket_id,name,owner) values ('lawyer-certs', (:LW)::text || '/other.pdf', null);
set role anon; set request.jwt.claim.sub='';
select ok('anon can open a verified lawyer''s listed certificate only', (select count(*)=1 and min(name) like '%/llb.pdf' from storage.objects));
reset role;
set role authenticated; set request.jwt.claim.sub=:U1;
select ok('another user can not see unlisted files', (select count(*)=1 from storage.objects));
reset role;

-- listing and public view: no contact columns, with rating summary
set role anon; set request.jwt.claim.sub='';
select ok('public view shows the new profile fields', (select education like 'LL.B%' and practising_since=2012 and cases_handled=120 and cardinality(certificate_paths)=1 and rating_count=0 from lawyers_public));
select must_fail('anon can not call get_lawyer_contact', $$select * from get_lawyer_contact((select id from lawyers_public))$$);
select must_fail('anon can not read payments', 'select count(*) from lawyer_payments');
select must_fail('anon can not call submit_lawyer_rating', $$select submit_lawyer_rating((select id from lawyers_public), 5, 'x')$$);
reset role;

-- pricing is read from settings by the database
select ok('default fees are 50 and 2500', (select public.lawyer_fee('contact')=50 and public.lawyer_fee('rating')=2500));

-- U1 tries to pay: price chosen by the client is ignored, status is forced to pending
set role authenticated; set request.jwt.claim.sub=:U1;
select must_fail('contact is locked before payment', $$select * from get_lawyer_contact((select id from lawyers_public))$$);
insert into lawyer_payments (lawyer_id, kind, amount_bdt, sender_number, trx_id, status, reviewed_at)
  values ((select id from lawyers_public), 'contact', 1, '01922222222', ' 9ab12cd34e ', 'approved', now());
select ok('payment: amount comes from the database, status forced to pending, trx id tidied', (select amount_bdt=50 and status='pending' and reviewed_at is null and trx_id='9AB12CD34E' and user_id=:U1::uuid and lawyer_name='Nadia Karim' from lawyer_payments));
select must_fail('contact still locked while the payment is pending', $$select * from get_lawyer_contact((select id from lawyers_public))$$);
update lawyer_payments set status='approved';
update lawyer_payments set amount_bdt=0;
delete from lawyer_payments;
select ok('user can not approve, re-price or delete their own payment (row-level security blocks it)', (select count(*)=1 and min(status)='pending' and min(amount_bdt)=50 from lawyer_payments));
select must_fail('second open payment for the same lawyer and kind is refused', $$insert into lawyer_payments (lawyer_id,kind,sender_number,trx_id) values ((select id from lawyers_public),'contact','01922222222','ZZZ111ZZZ1')$$);
reset role;

-- another user can not reuse the same transaction id; can not see U1's payment
set role authenticated; set request.jwt.claim.sub=:U2;
select must_fail('same bKash transaction id can not be used twice', $$insert into lawyer_payments (lawyer_id,kind,sender_number,trx_id) values ((select id from lawyers_public),'contact','01933333333','9AB12CD34E')$$);
select ok('U2 can not see U1''s payments', (select count(*)=0 from lawyer_payments));
select must_fail('bad transaction id is refused', $$insert into lawyer_payments (lawyer_id,kind,sender_number,trx_id) values ((select id from lawyers_public),'contact','01933333333','12')$$);
reset role;

-- the lawyer can not pay for or rate themselves
set role authenticated; set request.jwt.claim.sub=:LW;
select must_fail('lawyer can not pay for their own listing', $$insert into lawyer_payments (lawyer_id,kind,sender_number,trx_id) values ((select id from lawyer_profiles),'rating','01944444444','SELF111111')$$);
select ok('lawyer sees own contact without paying', (select phone='01711111111' from get_lawyer_contact((select id from lawyer_profiles))));
select must_fail('lawyer can not rate themselves', $$select submit_lawyer_rating((select id from lawyer_profiles), 5, 'great')$$);
reset role;

-- admin approves; reject needs a reason
set role authenticated; set request.jwt.claim.sub=:AD;
select ok('admin sees the pending payment', (select count(*)=1 from lawyer_payments where status='pending'));
select must_fail('admin can not change the amount', $$update lawyer_payments set amount_bdt=1$$);
update lawyer_payments set status='approved';
select ok('approval stamps reviewer and time', (select status='approved' and reviewed_by=:AD::uuid and reviewed_at is not null from lawyer_payments));
select must_fail('a decided payment can not be changed again', $$update lawyer_payments set status='rejected', review_note='oops'$$);
reset role;

-- now U1 can see the contact, U2 still cannot
set role authenticated; set request.jwt.claim.sub=:U1;
select ok('after approval U1 sees phone and email', (select phone='01711111111' and email='nk@x.com' from get_lawyer_contact((select id from lawyers_public))));
reset role;
set role authenticated; set request.jwt.claim.sub=:U2;
select must_fail('U2 did not pay, still locked', $$select * from get_lawyer_contact((select id from lawyers_public))$$);
reset role;

-- ratings: need an approved rating payment
set role authenticated; set request.jwt.claim.sub=:U1;
select must_fail('rating without a rating payment is refused', $$select submit_lawyer_rating((select id from lawyers_public), 5, 'good')$$);
select must_fail('direct insert into ratings is refused', $$insert into lawyer_ratings (lawyer_id,stars) values ((select id from lawyers_public),5)$$);
insert into lawyer_payments (lawyer_id,kind,sender_number,trx_id) values ((select id from lawyers_public),'rating','01922222222','RATE000001');
select ok('rating payment amount is 2500', (select amount_bdt=2500 from lawyer_payments where kind='rating'));
select must_fail('rating is refused while its payment is pending', $$select submit_lawyer_rating((select id from lawyers_public), 5, 'good')$$);
reset role;
set role authenticated; set request.jwt.claim.sub=:AD;
update lawyer_payments set status='approved' where kind='rating';
reset role;
set role authenticated; set request.jwt.claim.sub=:U1;
select must_fail('0 stars is refused', $$select submit_lawyer_rating((select id from lawyers_public), 0, 'x')$$);
select must_fail('6 stars is refused', $$select submit_lawyer_rating((select id from lawyers_public), 6, 'x')$$);
select ok('rating accepted after approval', (select submit_lawyer_rating((select id from lawyers_public), 4, '  Helpful and clear  ') is not null));
select must_fail('second rating by the same user is refused', $$select submit_lawyer_rating((select id from lawyers_public), 1, 'again')$$);
update lawyer_ratings set stars=5;
delete from lawyer_ratings;
select ok('user can not edit or delete a rating', (select count(*)=1 and min(stars)=4 from lawyer_ratings));
reset role;

set role anon; set request.jwt.claim.sub='';
select ok('public view shows average and count', (select rating_avg=4.0 and rating_count=1 from lawyers_public));
select ok('public ratings list has stars and comment but no user', (select stars=4 and comment='Helpful and clear' from lawyer_ratings_public));
select must_fail('public ratings list has no user_id column', 'select user_id from lawyer_ratings_public');
select must_fail('anon can not read the ratings table', 'select * from lawyer_ratings');
reset role;

-- admin hides a rating
set role authenticated; set request.jwt.claim.sub=:AD;
update lawyer_ratings set status='hidden';
select must_fail('admin can not change the stars', $$update lawyer_ratings set stars=1$$);
reset role;
set role anon; set request.jwt.claim.sub='';
select ok('hidden rating leaves the public list and the average', (select count(*)=0 from lawyer_ratings_public) and (select rating_count=0 and rating_avg is null from lawyers_public));
reset role;

-- a suspended lawyer disappears everywhere, payments cannot be made for them
set role authenticated; set request.jwt.claim.sub=:AD;
update lawyer_profiles set status='suspended', review_note='Under investigation';
reset role;
set role authenticated; set request.jwt.claim.sub=:U2;
select must_fail('no payment for a suspended lawyer', $$insert into lawyer_payments (lawyer_id,kind,sender_number,trx_id) values ((select id from lawyer_profiles where user_id=:LW::uuid),'contact','01933333333','SUSP000001')$$);
reset role;
set role anon; set request.jwt.claim.sub='';
select ok('suspended lawyer certificates are no longer public', (select count(*)=0 from storage.objects));
reset role;

-- the payer deletes their account through the real path (delete_my_account): payments and rating stay, identity removed
set role authenticated; set request.jwt.claim.sub=:U1;
select public.delete_my_account();
reset role;
select ok('account deletion works for someone with payments and a rating', (select count(*)=0 from auth.users where id=:U1::uuid));
select ok('payments are kept after the payer deletes the account, without identity', (select count(*)=2 and bool_and(user_id is null) from lawyer_payments));
select ok('the rating stays too, without identity', (select count(*)=1 and bool_and(user_id is null) from lawyer_ratings));

-- the lawyer deletes their account: listing and certificates go, payments stay with the name kept
set role authenticated; set request.jwt.claim.sub=:LW;
select public.delete_my_account();
reset role;
select ok('lawyer account deleted with their listing', (select count(*)=0 from lawyer_profiles where user_id=:LW::uuid));
select ok('payments for that lawyer stay as a record (name kept, link removed)', (select count(*)=2 and bool_and(lawyer_id is null) and bool_and(lawyer_name='Nadia Karim') from lawyer_payments));
select ok('their ratings are removed with the listing', (select count(*)=0 from lawyer_ratings));

-- an admin account deleted: listings they verified are untouched
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000f9','lawyer2@x.com');
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000f9';
insert into lawyer_profiles (full_name,enrollment_no,bar_association,courts,practice_areas,district,office_address,phone,consent_public,certificate_paths)
 values ('Second Lawyer','SL-1','Dhaka Bar',array['lower_courts'],array['land-law'],'dhaka','8 Court Road, Dhaka','01755555555',true,array['00000000-0000-0000-0000-0000000000f9/a.pdf']);
reset role;
set role authenticated; set request.jwt.claim.sub=:AD;
update lawyer_profiles set status='verified' where user_id='00000000-0000-0000-0000-0000000000f9';
reset role;
delete from auth.users where id=:AD::uuid;
select ok('deleting the admin who verified a listing keeps the listing verified', (select status='verified' and verified_by is null from lawyer_profiles where user_id='00000000-0000-0000-0000-0000000000f9'));

-- unfilled fee is refused instead of charging 0
set request.jwt.claim.sub='';
update app_settings set value = '{"contact_fee":null,"rating_fee":2500}'::jsonb where key='lawyer_pricing';
select must_fail('missing fee setting stops payments', $$select public.lawyer_fee('contact')$$);
