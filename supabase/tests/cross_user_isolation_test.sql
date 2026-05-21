-- Cross-user isolation pen test — pretend to be user A with user B's
-- JWT identity and verify every per-user table denies access.
--
-- Per Max's request: "write a test that attempts to read another
-- user's data with a different JWT and asserts it fails."
--
-- Strategy: set up two fake auth.users rows + seed each with one row
-- in every per-user table, then `set local role authenticated` +
-- `set local request.jwt.claims = '{"sub":"<user_a>","role":"authenticated"}'`
-- and assert that selects from each table return ONLY user_a's row,
-- never user_b's. Same for UPDATE / DELETE attempts targeting user_b's
-- row — must fail or affect zero rows.
--
-- This test is the closest thing to a "did RLS actually work" check
-- short of a full integration test through PostgREST.

begin;
select plan(20);

-- ── Setup: two synthetic users + one row each in every per-user table ──
-- We bypass auth.signUp and insert directly into auth.users (test-only
-- harness; tests run inside a transaction that's rolled back).
insert into auth.users (id, email, instance_id, aud, role)
  values
    ('11111111-1111-1111-1111-111111111111', 'usera@test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    ('22222222-2222-2222-2222-222222222222', 'userb@test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.pets (user_id, client_id, data) values
  ('11111111-1111-1111-1111-111111111111', 'pet_a', '{"name":"Floof A"}'),
  ('22222222-2222-2222-2222-222222222222', 'pet_b', '{"name":"Floof B"}');

insert into public.health_records (user_id, client_id, pet_client_id, data) values
  ('11111111-1111-1111-1111-111111111111', 'hr_a', 'pet_a', '{"type":"vax"}'),
  ('22222222-2222-2222-2222-222222222222', 'hr_b', 'pet_b', '{"type":"vax"}');

insert into public.mood_logs (user_id, client_id, pet_client_id, data) values
  ('11111111-1111-1111-1111-111111111111', 'm_a', 'pet_a', '{"mood":"happy"}'),
  ('22222222-2222-2222-2222-222222222222', 'm_b', 'pet_b', '{"mood":"happy"}');

insert into public.stool_logs (user_id, client_id, pet_client_id, data) values
  ('11111111-1111-1111-1111-111111111111', 's_a', 'pet_a', '{"bristol":4}'),
  ('22222222-2222-2222-2222-222222222222', 's_b', 'pet_b', '{"bristol":4}');

insert into public.diet_logs (user_id, client_id, pet_client_id, data) values
  ('11111111-1111-1111-1111-111111111111', 'd_a', 'pet_a', '{"mealType":"kibble"}'),
  ('22222222-2222-2222-2222-222222222222', 'd_b', 'pet_b', '{"mealType":"kibble"}');

insert into public.checklist_state (user_id, pet_client_id, data) values
  ('11111111-1111-1111-1111-111111111111', 'pet_a', '{"item1":{"status":"done"}}'),
  ('22222222-2222-2222-2222-222222222222', 'pet_b', '{"item1":{"status":"done"}}');

insert into public.app_prefs (user_id, data) values
  ('11111111-1111-1111-1111-111111111111', '{"theme":"light"}'),
  ('22222222-2222-2222-2222-222222222222', '{"theme":"light"}');

insert into public.observations (user_id, client_id, data) values
  ('11111111-1111-1111-1111-111111111111', 'o_a', '{"note":"a"}'),
  ('22222222-2222-2222-2222-222222222222', 'o_b', '{"note":"b"}');

-- ── Act as user A — must see only user A's rows ──
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- SELECT: every table returns exactly user_a's one row
select is((select count(*)::int from public.pets),            1, 'pets: user A sees only their own row');
select is((select count(*)::int from public.health_records),  1, 'health_records: user A sees only their own row');
select is((select count(*)::int from public.mood_logs),       1, 'mood_logs: user A sees only their own row');
select is((select count(*)::int from public.stool_logs),      1, 'stool_logs: user A sees only their own row');
select is((select count(*)::int from public.diet_logs),       1, 'diet_logs: user A sees only their own row');
select is((select count(*)::int from public.checklist_state), 1, 'checklist_state: user A sees only their own row');
select is((select count(*)::int from public.app_prefs),       1, 'app_prefs: user A sees only their own row');
select is((select count(*)::int from public.observations),    1, 'observations: user A sees only their own row');

-- Confirm the row is THEIRS specifically (not just any-1)
select is(
  (select (data->>'name') from public.pets limit 1),
  'Floof A',
  'pets: user A sees their own pet name, not user B'\''s'
);

-- UPDATE targeting user B's row — must affect zero rows
with up as (
  update public.pets set data = '{"name":"HACKED"}'
   where user_id = '22222222-2222-2222-2222-222222222222'
   returning 1
)
select is((select count(*)::int from up), 0, 'pets: user A cannot UPDATE user B'\''s row');

-- DELETE targeting user B's row — must affect zero rows
with del as (
  delete from public.pets where user_id = '22222222-2222-2222-2222-222222222222' returning 1
)
select is((select count(*)::int from del), 0, 'pets: user A cannot DELETE user B'\''s row');

-- INSERT with user_id = user B — must fail the WITH CHECK clause
select throws_ok(
  $$insert into public.pets (user_id, client_id, data) values ('22222222-2222-2222-2222-222222222222', 'inj', '{}')$$,
  '42501',
  null,
  'pets: user A cannot INSERT a row claiming user B'\''s user_id'
);

select throws_ok(
  $$insert into public.health_records (user_id, client_id, pet_client_id, data) values ('22222222-2222-2222-2222-222222222222', 'inj', 'pet_b', '{}')$$,
  '42501',
  null,
  'health_records: user A cannot INSERT claiming user B'\''s user_id'
);

select throws_ok(
  $$insert into public.observations (user_id, client_id, data) values ('22222222-2222-2222-2222-222222222222', 'inj', '{}')$$,
  '42501',
  null,
  'observations: user A cannot INSERT claiming user B'\''s user_id'
);

-- ── Switch to user B — sanity check the mirror ──
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is((select count(*)::int from public.pets),           1, 'pets: user B sees only their own row');
select is(
  (select (data->>'name') from public.pets limit 1),
  'Floof B',
  'pets: user B sees their own pet name, not user A'\''s'
);

-- ── Anonymous / no JWT — must see NOTHING ──
reset role;
set local role anon;
select is((select count(*)::int from public.pets),            0, 'pets: anon sees zero rows');
select is((select count(*)::int from public.observations),    0, 'observations: anon sees zero rows');

-- Anonymous INSERT also denied
select throws_ok(
  $$insert into public.pets (user_id, client_id, data) values ('11111111-1111-1111-1111-111111111111', 'anon_inj', '{}')$$,
  '42501',
  null,
  'pets: anon cannot INSERT'
);

reset role;
select * from finish();
rollback;
