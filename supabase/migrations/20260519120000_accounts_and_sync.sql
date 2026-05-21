-- v2.0 accounts + cloud sync — per-user data tables + RLS.
--
-- Schema philosophy: mirror the local AsyncStorage shape (jsonb blobs
-- of pets/health-records/etc., keyed by client-generated stable ids)
-- so the migration engine in src/lib/cloudSync.js can upsert without
-- a schema-translation pass. Columns can be normalized later when a
-- product question requires SQL access (e.g., reporting across users).
--
-- Every per-user table:
--   - user_id uuid not null references auth.users on delete cascade
--   - client_id text not null  -- the stable id from the local store
--                              -- (pet.id, healthRecord.id, etc.).
--                              -- Combined with user_id this is the
--                              -- upsert key.
--   - data jsonb not null      -- the full record as JSON
--   - updated_at timestamptz   -- server-side recency (last write wins)
--   - RLS enabled, policies scoped to auth.uid()
--
-- Per docs/security-non-negotiables.md:
--   - Rule 2: RLS on every table BEFORE data lands
--   - Rule 5: Storage bucket uses per-user prefix RLS
--   - Rule 8: anything not explicitly synced stays local-only

set check_function_bodies = off;

-- ─── pets ───────────────────────────────────────────────────────────
create table if not exists public.pets (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  client_id   text        not null,
  data        jsonb       not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, client_id)
);
alter table public.pets enable row level security;
drop policy if exists pets_own_select on public.pets;
create policy pets_own_select on public.pets for select using (auth.uid() = user_id);
drop policy if exists pets_own_insert on public.pets;
create policy pets_own_insert on public.pets for insert with check (auth.uid() = user_id);
drop policy if exists pets_own_update on public.pets;
create policy pets_own_update on public.pets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists pets_own_delete on public.pets;
create policy pets_own_delete on public.pets for delete using (auth.uid() = user_id);

-- ─── health records ─────────────────────────────────────────────────
-- pet_client_id is the parent pet's client_id (FK by convention — no
-- enforced FK because the rows arrive in any order during a migration).
create table if not exists public.health_records (
  user_id        uuid        not null references auth.users(id) on delete cascade,
  client_id      text        not null,
  pet_client_id  text        not null,
  data           jsonb       not null,
  updated_at     timestamptz not null default now(),
  primary key (user_id, client_id)
);
alter table public.health_records enable row level security;
drop policy if exists health_records_own_select on public.health_records;
create policy health_records_own_select on public.health_records for select using (auth.uid() = user_id);
drop policy if exists health_records_own_insert on public.health_records;
create policy health_records_own_insert on public.health_records for insert with check (auth.uid() = user_id);
drop policy if exists health_records_own_update on public.health_records;
create policy health_records_own_update on public.health_records for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists health_records_own_delete on public.health_records;
create policy health_records_own_delete on public.health_records for delete using (auth.uid() = user_id);
create index if not exists health_records_pet_idx on public.health_records(user_id, pet_client_id);

-- ─── mood logs ──────────────────────────────────────────────────────
create table if not exists public.mood_logs (
  user_id        uuid        not null references auth.users(id) on delete cascade,
  client_id      text        not null,
  pet_client_id  text        not null,
  data           jsonb       not null,
  updated_at     timestamptz not null default now(),
  primary key (user_id, client_id)
);
alter table public.mood_logs enable row level security;
drop policy if exists mood_logs_own_select on public.mood_logs;
create policy mood_logs_own_select on public.mood_logs for select using (auth.uid() = user_id);
drop policy if exists mood_logs_own_insert on public.mood_logs;
create policy mood_logs_own_insert on public.mood_logs for insert with check (auth.uid() = user_id);
drop policy if exists mood_logs_own_update on public.mood_logs;
create policy mood_logs_own_update on public.mood_logs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists mood_logs_own_delete on public.mood_logs;
create policy mood_logs_own_delete on public.mood_logs for delete using (auth.uid() = user_id);
create index if not exists mood_logs_pet_idx on public.mood_logs(user_id, pet_client_id);

-- ─── stool logs (tummy tracker) ─────────────────────────────────────
create table if not exists public.stool_logs (
  user_id        uuid        not null references auth.users(id) on delete cascade,
  client_id      text        not null,
  pet_client_id  text        not null,
  data           jsonb       not null,
  updated_at     timestamptz not null default now(),
  primary key (user_id, client_id)
);
alter table public.stool_logs enable row level security;
drop policy if exists stool_logs_own_select on public.stool_logs;
create policy stool_logs_own_select on public.stool_logs for select using (auth.uid() = user_id);
drop policy if exists stool_logs_own_insert on public.stool_logs;
create policy stool_logs_own_insert on public.stool_logs for insert with check (auth.uid() = user_id);
drop policy if exists stool_logs_own_update on public.stool_logs;
create policy stool_logs_own_update on public.stool_logs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists stool_logs_own_delete on public.stool_logs;
create policy stool_logs_own_delete on public.stool_logs for delete using (auth.uid() = user_id);
create index if not exists stool_logs_pet_idx on public.stool_logs(user_id, pet_client_id);

-- ─── diet logs (tummy tracker) ──────────────────────────────────────
create table if not exists public.diet_logs (
  user_id        uuid        not null references auth.users(id) on delete cascade,
  client_id      text        not null,
  pet_client_id  text        not null,
  data           jsonb       not null,
  updated_at     timestamptz not null default now(),
  primary key (user_id, client_id)
);
alter table public.diet_logs enable row level security;
drop policy if exists diet_logs_own_select on public.diet_logs;
create policy diet_logs_own_select on public.diet_logs for select using (auth.uid() = user_id);
drop policy if exists diet_logs_own_insert on public.diet_logs;
create policy diet_logs_own_insert on public.diet_logs for insert with check (auth.uid() = user_id);
drop policy if exists diet_logs_own_update on public.diet_logs;
create policy diet_logs_own_update on public.diet_logs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists diet_logs_own_delete on public.diet_logs;
create policy diet_logs_own_delete on public.diet_logs for delete using (auth.uid() = user_id);
create index if not exists diet_logs_pet_idx on public.diet_logs(user_id, pet_client_id);

-- ─── checklist state ────────────────────────────────────────────────
-- One row per pet (the entire per-pet item-status map is one jsonb blob).
create table if not exists public.checklist_state (
  user_id        uuid        not null references auth.users(id) on delete cascade,
  pet_client_id  text        not null,
  data           jsonb       not null,
  updated_at     timestamptz not null default now(),
  primary key (user_id, pet_client_id)
);
alter table public.checklist_state enable row level security;
drop policy if exists checklist_state_own_select on public.checklist_state;
create policy checklist_state_own_select on public.checklist_state for select using (auth.uid() = user_id);
drop policy if exists checklist_state_own_insert on public.checklist_state;
create policy checklist_state_own_insert on public.checklist_state for insert with check (auth.uid() = user_id);
drop policy if exists checklist_state_own_update on public.checklist_state;
create policy checklist_state_own_update on public.checklist_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists checklist_state_own_delete on public.checklist_state;
create policy checklist_state_own_delete on public.checklist_state for delete using (auth.uid() = user_id);

-- ─── app prefs (per-user) ───────────────────────────────────────────
-- Singleton-per-user — the entire prefs blob in one row.
create table if not exists public.app_prefs (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.app_prefs enable row level security;
drop policy if exists app_prefs_own_select on public.app_prefs;
create policy app_prefs_own_select on public.app_prefs for select using (auth.uid() = user_id);
drop policy if exists app_prefs_own_insert on public.app_prefs;
create policy app_prefs_own_insert on public.app_prefs for insert with check (auth.uid() = user_id);
drop policy if exists app_prefs_own_update on public.app_prefs;
create policy app_prefs_own_update on public.app_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists app_prefs_own_delete on public.app_prefs;
create policy app_prefs_own_delete on public.app_prefs for delete using (auth.uid() = user_id);

-- ─── observations ───────────────────────────────────────────────────
create table if not exists public.observations (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  client_id   text        not null,
  data        jsonb       not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, client_id)
);
alter table public.observations enable row level security;
drop policy if exists observations_own_select on public.observations;
create policy observations_own_select on public.observations for select using (auth.uid() = user_id);
drop policy if exists observations_own_insert on public.observations;
create policy observations_own_insert on public.observations for insert with check (auth.uid() = user_id);
drop policy if exists observations_own_update on public.observations;
create policy observations_own_update on public.observations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists observations_own_delete on public.observations;
create policy observations_own_delete on public.observations for delete using (auth.uid() = user_id);

-- ─── Storage bucket for pet photos + health-record attachments ──────
-- Per-user prefix RLS: object name must start with `<user_id>/`.
-- Bucket is private (no public read) — clients fetch via short-lived
-- signed URLs minted by the auth'd Storage API (the user's own JWT is
-- sufficient because of the RLS policies below).
insert into storage.buckets (id, name, public)
  values ('pet-media', 'pet-media', false)
  on conflict (id) do nothing;

-- Object path layout: `<user_id>/pets/<pet_client_id>/<filename>` or
-- `<user_id>/healthRecords/<pet_client_id>/<record_id>.<ext>`. The
-- first segment must equal auth.uid()::text — enforced by RLS.
drop policy if exists "pet-media users read own" on storage.objects;
create policy "pet-media users read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'pet-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pet-media users insert own" on storage.objects;
create policy "pet-media users insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pet-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pet-media users update own" on storage.objects;
create policy "pet-media users update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'pet-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'pet-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pet-media users delete own" on storage.objects;
create policy "pet-media users delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'pet-media' and (storage.foldername(name))[1] = auth.uid()::text);
