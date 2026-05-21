-- Forward fix for 20260519120000_accounts_and_sync.sql.
--
-- That migration's first 53 statements (8 tables + their policies +
-- indexes + the pet-media bucket insert) committed on the remote DB,
-- but statement 54 — the first storage.objects policy — failed because
-- it used the invalid `create policy if not exists` syntax. The
-- migration was nonetheless marked applied, so the four storage RLS
-- policies never landed and a plain re-push skipped them.
--
-- This forward migration creates those four policies idempotently
-- (drop-if-exists + create). It's a no-op on a fresh DB where the
-- corrected 20260519 migration already created them.
--
-- Per docs/security-non-negotiables.md Rule 5: pet-media is a private
-- bucket; object name's first path segment must equal auth.uid()::text
-- so a user can only read/write objects under their own `<user_id>/`
-- prefix.

-- Belt-and-suspenders: ensure the bucket exists (it does on the remote,
-- but a fresh DB running migrations in order already has it from
-- 20260519 — on conflict makes this safe either way).
insert into storage.buckets (id, name, public)
  values ('pet-media', 'pet-media', false)
  on conflict (id) do nothing;

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
