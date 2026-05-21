-- Policy-boundary tests for public.churn_feedback.
-- Run with:  supabase test db
--
-- Verifies the default-deny posture from Rule 2 of
-- docs/security-non-negotiables.md — the client-facing roles (anon,
-- authenticated) can neither read nor write the table. Only the
-- service_role (used by the churn-feedback Edge Function) can, and it
-- bypasses RLS entirely.

begin;
select plan(4);

-- 1. RLS must be enabled on the table.
select ok(
  (select relrowsecurity from pg_class where oid = 'public.churn_feedback'::regclass),
  'RLS is enabled on churn_feedback'
);

-- 2. There must be zero policies — default-deny is intentional, not
--    an oversight. Any future policy is a deliberate, reviewed change.
select is(
  (select count(*)::int from pg_policies
     where schemaname = 'public' and tablename = 'churn_feedback'),
  0,
  'churn_feedback has no RLS policies (default-deny)'
);

-- 3. anon cannot SELECT (REVOKE strips the table privilege → 42501).
set local role anon;
select throws_ok(
  'select * from public.churn_feedback',
  '42501',
  null,
  'anon is denied SELECT on churn_feedback'
);

-- 4. anon cannot INSERT.
select throws_ok(
  $$insert into public.churn_feedback (variant) values ('nosub')$$,
  '42501',
  null,
  'anon is denied INSERT on churn_feedback'
);

reset role;
select * from finish();
rollback;
