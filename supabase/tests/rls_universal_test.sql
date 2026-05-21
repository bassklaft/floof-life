-- Universal RLS check — fails CI if ANY public.* table lacks RLS.
--
-- Per docs/security-non-negotiables.md Rule 2, every Postgres table
-- FloofLife creates must ship with row-level security enabled before
-- any data lands. This test scans pg_class for every base table in the
-- public schema and asserts relrowsecurity = true for each one.
--
-- A new table added in a future migration that forgets RLS will fail
-- this test on the first `supabase test db` run. That's by design.

begin;

-- One assertion per table, plus a meta-assertion that we found tables
-- at all (so a misconfigured run that returns zero tables doesn't
-- silently pass).
do $$
declare
  rec record;
  n_tables int := 0;
  n_missing int := 0;
  missing_names text := '';
begin
  for rec in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'            -- ordinary table
     order by c.relname
  loop
    n_tables := n_tables + 1;
    if not (
      select relrowsecurity
        from pg_class
       where oid = format('public.%I', rec.relname)::regclass
    ) then
      n_missing := n_missing + 1;
      missing_names := missing_names || rec.relname || ', ';
    end if;
  end loop;

  if n_tables = 0 then
    raise exception 'rls_universal_test: no public tables found — test harness misconfigured';
  end if;

  if n_missing > 0 then
    raise exception 'rls_universal_test: % of % public tables lack RLS: %',
      n_missing, n_tables, rtrim(missing_names, ', ');
  end if;

  raise notice 'rls_universal_test: ok — all % public tables have RLS enabled', n_tables;
end $$;

-- Same shape for the auto-REST exposure check: every public table that
-- has RLS enabled must have at least one policy OR be revoke-all'd
-- from anon + authenticated. "RLS on with zero policies" is the
-- default-deny posture for service-role-only tables (churn_feedback);
-- "RLS on with policies" is the per-user-data posture (pets, etc.).
-- Either is fine. RLS off OR (RLS on with policies that don't gate
-- the access) is not. This loop catches the "RLS on with zero policies
-- but ALSO not REVOKE'd from anon/authenticated" case.
do $$
declare
  rec record;
  n_at_risk int := 0;
  at_risk_names text := '';
  has_anon_select boolean;
  has_auth_select boolean;
  policy_count int;
begin
  for rec in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
     order by c.relname
  loop
    select count(*)::int into policy_count
      from pg_policies
     where schemaname = 'public' and tablename = rec.relname;

    if policy_count = 0 then
      -- Default-deny path: must have no anon/authenticated grants.
      select has_table_privilege('anon',          format('public.%I', rec.relname), 'SELECT') into has_anon_select;
      select has_table_privilege('authenticated', format('public.%I', rec.relname), 'SELECT') into has_auth_select;
      if has_anon_select or has_auth_select then
        n_at_risk := n_at_risk + 1;
        at_risk_names := at_risk_names || rec.relname || ', ';
      end if;
    end if;
  end loop;

  if n_at_risk > 0 then
    raise exception 'rls_universal_test: % tables have RLS-on, no policies, but still grant SELECT to anon/authenticated: %',
      n_at_risk, rtrim(at_risk_names, ', ');
  end if;
end $$;

rollback;
