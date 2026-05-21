-- ─────────────────────────────────────────────────────────────────────
-- churn_feedback — feedback submitted when a user cancels a free trial
-- or subscription, or has opened the app without subscribing.
--
-- Per docs/security-non-negotiables.md:
--   Rule 2 — RLS is enabled before any data lands. This is a
--            no-account table: rows are written only by the
--            churn-feedback Edge Function using the service_role key
--            (which bypasses RLS). The client-facing roles (anon,
--            authenticated) get NO policies, so every operation is
--            denied for them by default. The REVOKE below makes that
--            explicit — even if a policy is later added by mistake,
--            the table starts from zero client privilege.
--   Rule 8 — this table holds user-supplied personal data (name,
--            email, phone, free-text message). The Privacy Policy is
--            updated in the same change set (legal/privacy-policy.*).
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.churn_feedback (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  -- Which moment triggered the prompt.
  --   'cancel' — user cancelled a free trial or a paid subscription
  --   'nosub'  — user opened the app twice without ever subscribing
  variant         text not null check (variant in ('cancel', 'nosub')),

  -- For 'cancel': whether a free trial or a paid subscription was
  -- cancelled. Null for the 'nosub' variant.
  kind            text check (kind in ('trial', 'subscription')),

  -- The feedback itself: the reasons the user ticked, plus free text.
  reasons         text[] not null default '{}',
  message         text   check (message is null or char_length(message) <= 4000),

  -- Optional, user-provided contact + demographic info. Every field
  -- is optional in the UI; null means the user left it blank.
  contact_name    text check (contact_name  is null or char_length(contact_name)  <= 120),
  contact_email   text check (contact_email is null or char_length(contact_email) <= 200),
  contact_phone   text check (contact_phone is null or char_length(contact_phone) <= 40),
  age_range       text check (age_range     is null or char_length(age_range)     <= 40),
  found_via       text check (found_via     is null or char_length(found_via)     <= 120),

  -- Correlation + diagnostics. rc_app_user_id is RevenueCat's
  -- anonymous app-user id — it lets a feedback row be joined to the
  -- matching customer in the RevenueCat dashboard. Not PII on its own.
  rc_app_user_id  text check (rc_app_user_id is null or char_length(rc_app_user_id) <= 200),
  app_version     text check (app_version    is null or char_length(app_version)    <= 40),
  os              text check (os             is null or char_length(os)             <= 80)
);

comment on table public.churn_feedback is
  'Cancellation / non-conversion feedback. Written only by the churn-feedback Edge Function (service_role). RLS on, default-deny for anon/authenticated.';

-- Newest-first reads from the dashboard.
create index if not exists churn_feedback_created_at_idx
  on public.churn_feedback (created_at desc);

-- Rule 2: RLS on before any data lands.
alter table public.churn_feedback enable row level security;

-- Default-deny made explicit: strip every table-level privilege from
-- the client-facing roles. The service_role (used by the Edge
-- Function) is unaffected — it bypasses RLS and keeps its grants.
-- With no CREATE POLICY for anon/authenticated anywhere, all of
-- SELECT / INSERT / UPDATE / DELETE are denied for the client.
revoke all on public.churn_feedback from anon, authenticated;
