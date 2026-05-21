-- Policy tests for the accounts + cloud-sync schema. Asserts that
-- every per-user table is RLS-on, has policies, and that anon is
-- denied SELECT on each. Run with `supabase test db`.

begin;
select plan(28);

-- ─── RLS enabled on every per-user table ────────────────────────────
select ok(
  (select relrowsecurity from pg_class where relname = 'pets' and relnamespace = 'public'::regnamespace),
  'pets has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'health_records' and relnamespace = 'public'::regnamespace),
  'health_records has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'mood_logs' and relnamespace = 'public'::regnamespace),
  'mood_logs has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'stool_logs' and relnamespace = 'public'::regnamespace),
  'stool_logs has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'diet_logs' and relnamespace = 'public'::regnamespace),
  'diet_logs has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'checklist_state' and relnamespace = 'public'::regnamespace),
  'checklist_state has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'app_prefs' and relnamespace = 'public'::regnamespace),
  'app_prefs has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'observations' and relnamespace = 'public'::regnamespace),
  'observations has RLS enabled'
);

-- ─── Policies exist for SELECT / INSERT / UPDATE / DELETE ───────────
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'pets'),
  4::bigint,
  'pets has 4 policies'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'health_records'),
  4::bigint,
  'health_records has 4 policies'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'mood_logs'),
  4::bigint,
  'mood_logs has 4 policies'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'stool_logs'),
  4::bigint,
  'stool_logs has 4 policies'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'diet_logs'),
  4::bigint,
  'diet_logs has 4 policies'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'checklist_state'),
  4::bigint,
  'checklist_state has 4 policies'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'app_prefs'),
  4::bigint,
  'app_prefs has 4 policies'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'observations'),
  4::bigint,
  'observations has 4 policies'
);

-- ─── anon role is denied SELECT on every per-user table ─────────────
set local role anon;

select throws_ok(
  $$ select * from public.pets $$,
  '42501',
  null,
  'anon SELECT on pets is denied'
);
select throws_ok(
  $$ select * from public.health_records $$,
  '42501',
  null,
  'anon SELECT on health_records is denied'
);
select throws_ok(
  $$ select * from public.mood_logs $$,
  '42501',
  null,
  'anon SELECT on mood_logs is denied'
);
select throws_ok(
  $$ select * from public.stool_logs $$,
  '42501',
  null,
  'anon SELECT on stool_logs is denied'
);
select throws_ok(
  $$ select * from public.diet_logs $$,
  '42501',
  null,
  'anon SELECT on diet_logs is denied'
);
select throws_ok(
  $$ select * from public.checklist_state $$,
  '42501',
  null,
  'anon SELECT on checklist_state is denied'
);
select throws_ok(
  $$ select * from public.app_prefs $$,
  '42501',
  null,
  'anon SELECT on app_prefs is denied'
);
select throws_ok(
  $$ select * from public.observations $$,
  '42501',
  null,
  'anon SELECT on observations is denied'
);

-- ─── authenticated with no JWT can't read other users' data ─────────
-- (Validated by the auth.uid() = user_id policies — without a JWT
-- auth.uid() is null so the policy can never match.)
set local role authenticated;

select is(
  (select count(*) from public.pets),
  0::bigint,
  'authenticated with no JWT sees zero pets rows'
);
select is(
  (select count(*) from public.health_records),
  0::bigint,
  'authenticated with no JWT sees zero health_records rows'
);
select is(
  (select count(*) from public.observations),
  0::bigint,
  'authenticated with no JWT sees zero observations rows'
);

-- ─── pet-media bucket exists and is private ─────────────────────────
reset role;
select is(
  (select public from storage.buckets where id = 'pet-media'),
  false,
  'pet-media bucket is private'
);

select * from finish();
rollback;
