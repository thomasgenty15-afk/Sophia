-- ============================================================================
-- KEEL — private storage buckets (BUILD_PLAN W1.2)
--
-- Two buckets, both private:
--   * plan-documents — the coach's source dump (PDF/image of the written
--     protocol). SCHEMA.md `plan_documents.storage_path` points here.
--     "source kept forever": this is the citable origin of every
--     `plan_commitments.source_span`.
--   * meal-photos — the student's evidence photos. SCHEMA.md
--     `protocol_events.media_path` points here. CONTRACT non-input #4: a photo
--     evidences presence/composition/portion/serving, it never produces a
--     quantity — so these objects are read by render and by the vision pass,
--     never by the evaluator.
--
-- PATH CONVENTION (load-bearing, R1 — ASCII, no locale in the key):
--   <owner_user_id>/<rest>
-- The first path segment is ALWAYS the auth.users id of the owner: the coach
-- for plan-documents, the student for meal-photos. Every RGPD routine keys off
-- that prefix — account-export-v1 bundles `<user_id>/` and
-- purge-deleted-accounts deletes `<user_id>/`. A path that does not start with
-- the owner id is invisible to the export and survives the purge, which is an
-- RGPD defect, not a cosmetic one.
-- TRAP, stated once: for a coach this is `coaches.user_id`, NOT `coaches.id`.
-- `plan_documents.coach_id` holds `coaches.id` (see the RLS policies in
-- 20260727120000_keel_tenancy.sql), so the row key and the object key are two
-- different uuids on purpose. The purge only ever knows an auth user id.
--
-- DECISION — no storage.objects policies, on purpose.
-- Same posture as the gdpr-exports bucket (20260708150000, section 4): uploads
-- happen with the service role from an edge function, downloads only through
-- short-lived signed URLs minted by an edge function that has already checked
-- ownership (student = owner, coach = `coached_student_ids()` once W1.1 lands).
-- Rationale for not writing owner/coach policies here:
--   1. `storage.objects` policies would have to re-derive the coach->student
--      link by parsing the object name — string surgery on a security boundary,
--      duplicating the RLS predicate that already exists on the tables;
--   2. PostgREST/storage grants are per-role and both coach and student are
--      `authenticated` (SCHEMA.md TENANCY) — the same reason Tier B views exist;
--   3. one enforcement point (the edge function) is auditable; two that can
--      disagree is the failure mode this repo keeps paying for.
-- Consequence, stated so it is not rediscovered: the anon/authenticated clients
-- CANNOT upload or download these objects directly. Any new surface must go
-- through an edge function in service_role. If that ever becomes untenable,
-- adding policies is a deliberate product decision, not a refactor.
--
-- Idempotent: `on conflict (id) do nothing`, so a re-run (or a stack where the
-- buckets already exist) is a no-op.
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('plan-documents', 'plan-documents', false),
  ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;
