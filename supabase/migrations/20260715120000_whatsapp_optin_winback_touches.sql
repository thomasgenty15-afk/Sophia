-- Opt-in winback: extend whatsapp_optin_recovery to track a 3-touch sequence.
--
-- Context: process-whatsapp-optin-recovery moved from a single recovery email
-- (delivery-failure framing) to a 3-touch winback sequence targeting
-- "opt-in sent but never confirmed" users:
--   - Touch 1 — email          (>= 1 day after the anchor)
--   - Touch 2 — WhatsApp tpl    (>= 3 days, after touch 1)
--   - Touch 3 — email (final)   (>= 5 days, after touch 2)
--
-- This change is purely ADDITIVE and nullable: no data migration, no backfill.
-- The existing email_sent_at column is KEPT for backward compatibility; the
-- function writes both email_sent_at and touch1_email_sent_at on touch 1, and
-- reads email_sent_at as a touch-1 fallback so users who already received the
-- legacy single email are never re-emailed.
--
-- Unchanged on purpose:
--   - the status CHECK (pending / resolved / cancelled),
--   - RLS (table is service-role only; a SELECT-own policy already exists),
--   - the existing indexes and the daily cron (migration 20260702120000).

ALTER TABLE "public"."whatsapp_optin_recovery"
  ADD COLUMN IF NOT EXISTS "touch1_email_sent_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "touch2_whatsapp_sent_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "touch3_email_sent_at" timestamp with time zone;

COMMENT ON COLUMN "public"."whatsapp_optin_recovery"."touch1_email_sent_at"
  IS 'Winback touch 1 (email) sent-at. Alias of the legacy email_sent_at column, kept in sync.';
COMMENT ON COLUMN "public"."whatsapp_optin_recovery"."touch2_whatsapp_sent_at"
  IS 'Winback touch 2 (WhatsApp template sophia_optin_winback_v2) sent-at.';
COMMENT ON COLUMN "public"."whatsapp_optin_recovery"."touch3_email_sent_at"
  IS 'Winback touch 3 (final email, takes its leave) sent-at.';
