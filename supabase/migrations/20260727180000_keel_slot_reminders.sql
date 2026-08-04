-- KEEL W4.6 — slot reminders + Sunday digest on the scheduled_checkins bus.
--
-- No new table: KEEL reminders are scheduled_checkins rows carrying
-- event_context = 'keel_slot_reminder:<slot>' or 'keel_sunday_digest'. The
-- existing unique index (user_id, event_context, scheduled_for) is the
-- idempotency key, and the delete-audit trigger already covers them.
--
-- The ONLY thing the table refuses today is the origin token: `origin` carries a
-- closed CHECK list, so an insert with a KEEL origin fails the write. Widening
-- the list is therefore a prerequisite, not a nicety.
--
-- Deliberately NOT fixed here: `action_late_afternoon` and `action_night_prep`
-- are written by schedule-whatsapp-v2-checkins and are ALSO absent from this
-- list, so those two legacy nudges have never been insertable. That is a real
-- production defect, but repairing it would silently switch two proactive
-- message streams back ON for the whole fleet — a product decision, not a side
-- effect of a nutrition migration. It is reported, not smuggled in.

alter table public.scheduled_checkins
  drop constraint if exists scheduled_checkins_origin_check;

alter table public.scheduled_checkins
  add constraint scheduled_checkins_origin_check check (
    origin = any (array[
      'watcher',
      'rendez_vous',
      'action_morning',
      'action_review',
      'action_followup',
      'weekly_planning',
      'weekly_review',
      'level_review',
      'keel_slot_reminder',
      'keel_sunday_digest',
      'unknown'
    ])
  );

comment on constraint scheduled_checkins_origin_check on public.scheduled_checkins is
  'Closed vocabulary of checkin producers. KEEL W4.6 added keel_slot_reminder and keel_sunday_digest.';

-- No extra index here: the W4.2 migration (20260727175000) already ships
-- `scheduled_checkins_keel_inflight_idx` on (user_id, scheduled_for) partial on
-- `event_context like 'keel\_%'`, which covers the read-back this feature does.
