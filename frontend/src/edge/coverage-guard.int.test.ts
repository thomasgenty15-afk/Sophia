import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function repoPathFromFrontend(...parts: string[]) {
  // tests run with cwd=frontend, so ../ is repo root
  return path.join(process.cwd(), "..", ...parts);
}

function listEdgeFunctionsWithIndexTs() {
  const dir = repoPathFromFrontend("supabase", "functions");
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const names = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => name !== "_shared")
    .filter((name) => fs.existsSync(path.join(dir, name, "index.ts")));
  names.sort();
  return names;
}

function discoverTriggers(): string[] {
  const triggers = new Set<string>();

  const migDir = repoPathFromFrontend("supabase", "migrations");

  // From squashed schema
  const squashedFiles = fs
    .readdirSync(migDir)
    .filter((f) => f.endsWith("_squashed_schema.sql"))
    .sort();
  for (const f of squashedFiles) {
    const text = fs.readFileSync(path.join(migDir, f), "utf8");
    for (
      const m of text.matchAll(/CREATE\s+OR\s+REPLACE\s+TRIGGER\s+"([^"]+)"/gi)
    ) {
      triggers.add(m[1]);
    }
  }

  // From migrations (exclude *_OLD.sql)
  const files = fs
    .readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => !f.includes("_OLD"))
    .sort();

  for (const f of files) {
    const text = fs.readFileSync(path.join(migDir, f), "utf8");
    for (
      const m of text.matchAll(
        /drop\s+trigger\s+if\s+exists[ \t]+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi,
      )
    ) {
      triggers.delete(m[1]);
    }
    // Important: avoid matching comment blocks like "Create Trigger" followed by a newline.
    // Only match trigger declarations on a single line.
    for (
      const m of text.matchAll(
        /create\s+(?:or\s+replace\s+)?trigger[ \t]+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi,
      )
    ) {
      triggers.add(m[1]);
    }
  }

  return [...triggers].sort();
}

describe("coverage guard: new triggers/functions must be acknowledged", () => {
  it("all Edge Functions (supabase/functions/*/index.ts) are in the known list", () => {
    const discovered = listEdgeFunctionsWithIndexTs();

    // Keep this list intentional: if a new function is added, update this list AND add at least one integration test.
    const expected = [
      "account-deletion-v1",
      "account-export-v1",
      "account-restore-v1",
      "activate-plan-item-v2",
      "advance-phase-v2",
      "analyze-attack-technique-adjustment-v1",
      // KEEL W5.3 — meal photo -> protocol_events.recognized. Its two filters
      // (anti-hallucination on commitment_id, measurement stripping) are pure
      // and covered by _shared/keel/meal_analysis_test.ts.
      "analyze-meal-photo-v1",
      "classify-plan-type-v1",
      "classify-recurring-reminder",
      // KEEL W6.1 — creates the `coaches` row (the table has no INSERT policy)
      // and sets keel_role/locale/country on the profile.
      "coach-signup-v1",
      // KEEL W6.5 — mints the invitation token, stores only its sha256, mails
      // the /join link through the send-welcome-email Resend pipeline. Token
      // primitives covered by coach-invite-student-v1/invite_token_test.ts;
      // the RPCs and the tenancy invariants by
      // coach-invite-student-v1/invitation_rls_test.sql.
      "coach-invite-student-v1",
      "cycle-draft",
      "draft-defense-card-v1",
      "draft-transformation-from-text-v1",
      "ethical-text-validator",
      // KEEL W4.1 — pure evaluator + adherence formula; covered by
      // supabase/functions/evaluate-adherence-v1/snapshot_test.ts and by
      // _shared/keel/{evaluator,adherence}_test.ts.
      "evaluate-adherence-v1",
      "generate-attack-card-v1",
      "generate-attack-technique-v1",
      "generate-defense-card-v3",
      "generate-plan-v2",
      "generate-questionnaire-v2",
      "get-coaching-intervention-scorecard",
      "get-coaching-intervention-trace",
      "get-memory-scorecard",
      "get-memory-trace",
      "get-momentum-scorecard",
      "get-momentum-trace",
      "intake-to-transformations-v2",
      // KEEL W8 — the card runtime. Four student actions behind a JWT and two
      // internal ones (the hourly arming sweep and its due list) behind
      // X-Internal-Secret. Zero model calls: the render is deterministic.
      "keel-cards-v1",
      // KEEL Q6 — the coach composes the student's week of meals. Every action
      // is coach-gated from the JWT; there is no internal path and no model
      // call. It writes to the two meal tables and to nothing else, which is
      // what keeps the scaffolding off the adherence counter.
      "keel-meal-plan-v1",
      "keel-week-rollover-v1",
      // KEEL W5.4 — the web path for a meal photo (the WhatsApp equivalent is
      // whatsapp-webhook/handlers_meal_photo.ts). Uploads to `meal-photos`,
      // writes the fact, then delegates the reading to analyze-meal-photo-v1.
      "meal-photo-upload-v1",
      "notify-profile-change",
      "plan-import-v1",
      // KEEL W6.2 — template -> clone+diff -> published plan_version. Sole
      // caller of reseedOnPublish; covered by plan-publish-v1/publish_test.ts.
      "plan-publish-v1",
      // KEEL W6.4 — plan_templates CRUD + the two read-only derivations the
      // review screen needs (vocabulary, provenance safety gate).
      "plan-template-v1",
      "process-checkins",
      "process-llm-retry-jobs",
      "process-whatsapp-optin-recovery",
      "process-whatsapp-outbound-retries",
      "promote-candidate-memory-items",
      // KEEL W4.2: opens the student's day (local 00:0x), closes it (local
      // 23:5x), and re-seeds it on republication.
      "provision-day-v1",
      "purge-deleted-accounts",
      "review-plan-v1",
      "schedule-whatsapp-v2-checkins",
      "send-welcome-email",
      "sophia-brain",
      "stripe-create-checkout-session",
      "stripe-create-portal-session",
      // W10 — monthly per-active-student seat reconciliation (cron).
      "stripe-reconcile-seats",
      "stripe-sync-subscription",
      "stripe-webhook",
      "test-send-message",
      "trigger-memorizer-daily",
      "trigger-memory-v2-alerts",
      "trigger-retention-emails",
      "trigger-synthesizer-batch",
      "trigger-topic-compaction",
      "trigger-watcher-batch",
      "update-defense-card-v3",
      "whatsapp-optin",
      "whatsapp-send",
      "whatsapp-sim-inbound",
      "whatsapp-sim-trigger",
      "whatsapp-webhook",
    ].sort();

    expect(discovered).toEqual(expected);
  });

  it("all DB triggers are in the known list (migrations + squashed_schema, excluding *_OLD.sql)", () => {
    const discovered = discoverTriggers();

    const expected = [
      // Régénéré au lot W2.B-1 (démolition legacy) : cette liste est le filet
      // des vagues suivantes — toute migration qui ajoute/supprime un trigger
      // doit la mettre à jour dans la même PR.
      "enforce_single_master_admin_trg",
      "guard_profiles_privileged_columns_biu",
      "guard_unlocked_principles_update",
      "guard_v2_plan_item_activation",
      "normalize_user_architect_quotes",
      "normalize_user_architect_reflections",
      "normalize_user_architect_stories",
      "on_auth_user_created",
      "on_auth_user_email_confirmed_send_onboarding",
      "on_profile_created_master_admin",
      "on_profile_created_seed_default_coach_preferences_trigger",
      // W10 — the inherited entitlement (MEGA_REVIEW B6). The link and the
      // coach's solvency both write `profiles.access_tier`, so both carry a
      // recompute trigger; the trial cap is enforced at the write.
      "on_coach_clients_change_recompute_access",
      "on_coach_clients_enforce_trial_cap",
      "on_coaches_change_recompute_roster",
      "on_coaches_default_trial_end",
      "on_profiles_trial_change_recompute_access",
      "on_subscriptions_change_recompute_access",
      "on_subscriptions_change_recompute_access_delete",
      "on_subscriptions_change_recompute_roster",
      // KEEL W8 — the card renderer. It is the ONLY writer of
      // `student_cards.rendered`: whatever a client sends in that column is
      // discarded, which is what makes "no LLM on the write path" structural.
      // KEEL Q6 — meal scaffolding. `meal_ideas_food_groups_valid` is the only
      // thing standing between the coverage read and a slug that does not
      // exist: an FK cannot reach inside an array, so the check is a trigger
      // and it FAILS THE WRITE rather than storing a group nothing can match.
      // `meal_plan_entries_touch` only stamps updated_at. NEITHER writes a
      // protocol_event — a suggested dish that logged itself would lift the
      // coach's 4-of-7 display gate on its own.
      "meal_ideas_food_groups_valid",
      "meal_plan_entries_touch",
      "student_cards_render",
      "sync_phone_verified_on_whatsapp_optin_trigger",
      "trg_archive_pending_week_plans_on_plan_archive",
      "trg_chat_messages_scope_memory_insert",
      "trg_memory_item_actions_updated_at",
      "trg_memory_item_entities_updated_at",
      "trg_memory_item_topics_updated_at",
      "trg_memory_items_set_updated_at",
      "trg_memory_weekly_review_runs_updated_at",
      "trg_refresh_whatsapp_scheduling_on_access_tier_change",
      "trg_scheduled_checkins_delete_audit",
      "trg_scheduled_checkins_enforce_min_gap_1h",
      "trg_user_chat_states_trigger_synthesizer_threshold",
      "trg_user_entities_updated_at",
      "trg_user_topic_memories_updated_at",
      "trg_validate_app_config_edge_base_url",
      "unlock_v2_principles_from_entry",
      "unlock_v2_principles_from_item_transition",
      "update_user_architect_quotes_modtime",
      "update_user_architect_reflections_modtime",
      "update_user_architect_stories_modtime",
      "update_user_chat_states_modtime",
      "update_user_cycle_drafts_modtime",
      "update_user_cycles_modtime",
      "update_user_metrics_modtime",
      "update_user_plan_items_modtime",
      "update_user_plans_v2_modtime",
      "update_user_rendez_vous_modtime",
      "update_user_transformation_aspects_modtime",
      "update_user_transformations_modtime",
    ].sort();

    expect(discovered).toEqual(expected);
  });
});
