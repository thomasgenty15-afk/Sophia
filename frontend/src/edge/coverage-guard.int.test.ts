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
      // KEEL W5.3 — meal photo -> protocol_events.recognized. Its two filters
      // (anti-hallucination on commitment_id, measurement stripping) are pure
      // and covered by _shared/keel/meal_analysis_test.ts.
      "analyze-meal-photo-v1",
      "classify-recurring-reminder",
      // PIVOT NUTRITION — les huit fonctions ci-dessous étaient absentes de
      // cette liste alors qu'elles existaient déjà: le garde était ROUGE avant
      // le chantier de-whatsapp, ce qui veut dire qu'il ne gardait plus rien.
      // Un garde en permanence rouge n'est plus lu.
      "coach-doctrine-v1",
      "coach-synthesis-v1",
      // KEEL W6.1 — creates the `coaches` row (the table has no INSERT policy)
      // and sets keel_role/locale/country on the profile.
      "coach-signup-v1",
      // KEEL W6.5 — mints the invitation token, stores only its sha256, mails
      // the /join link through the send-welcome-email Resend pipeline. Token
      // primitives covered by coach-invite-student-v1/invite_token_test.ts;
      // the RPCs and the tenancy invariants by
      // coach-invite-student-v1/invitation_rls_test.sql.
      "coach-invite-student-v1",
      // La photo d'une recette passe par la fonction edge, jamais par le bucket
      // directement: elle vérifie les OCTETS du fichier (pas l'en-tête déclaré)
      // et refuse un désaccord entre les deux.
      "coach-recipe-image-v1",
      // KEEL W4.1 — pure evaluator + adherence formula; covered by
      // supabase/functions/evaluate-adherence-v1/snapshot_test.ts and by
      // _shared/keel/{evaluator,adherence}_test.ts.
      "evaluate-adherence-v1",
      "generate-meal-v1",
      "generate-week-plan-v1",
      "get-coaching-intervention-scorecard",
      "get-coaching-intervention-trace",
      "get-memory-scorecard",
      "get-memory-trace",
      "get-momentum-scorecard",
      "get-momentum-trace",
      // KEEL W8 — the card runtime. Four student actions behind a JWT and two
      // internal ones (the hourly arming sweep and its due list) behind
      // X-Internal-Secret. Zero model calls: the render is deterministic.
      "keel-cards-v1",
      // PIVOT N2/C4/§1.3 — les trois boucles proactives KEEL. Depuis le
      // chantier de-whatsapp elles livrent dans la bulle; couvertes par
      // _shared/chat/proactive_int_test.ts (9 cas contre le vrai cron).
      "keel-daily-pulse-v1",
      // `keel-meal-plan-v1` a disparu avec la composition 1:1 de la semaine de
      // repas (20260804210000): le coach n'épingle plus une recette sur le jour
      // et le créneau d'un élève nommé — il écrit une bibliothèque, et l'élève
      // la lit sans placement. La fonction n'avait plus de table à écrire.
      "keel-reengage-v1",
      "keel-week-rollover-v1",
      "keel-weekly-flow-v1",
      // Q6 — le PDF d'un repas. Depuis de-whatsapp il s'annonce dans la bulle
      // au lieu d'être envoyé par Graph.
      "meal-document-v1",
      // KEEL W5.4 — LE chemin d'une photo de repas, désormais le seul (le
      // pendant WhatsApp est supprimé avec le webhook). Dépose dans
      // `meal-photos`, écrit le fait, délègue la lecture à
      // analyze-meal-photo-v1, puis — quand la photo vient de la bulle —
      // écrit le message et son accusé dans la conversation.
      "meal-photo-upload-v1",
      // DE-WHATSAPP — l'entrée de la conversation in-app, successeur de
      // whatsapp-webhook. Couvert par chat-inbound-v1/chat_inbound_int_test.ts
      // (9 cas HTTP) et par src/edge/chat.int.test.ts côté frontend.
      "chat-inbound-v1",
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
      "promote-candidate-memory-items",
      // KEEL W4.2: opens the student's day (local 00:0x), closes it (local
      // 23:5x), and re-seeds it on republication.
      "provision-day-v1",
      "purge-deleted-accounts",
      "review-plan-v1",
      "schedule-checkins-v2",
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
    ].sort();

    expect(discovered).toEqual(expected);
  });

  it("all DB triggers are in the known list (migrations + squashed_schema, excluding *_OLD.sql)", () => {
    const discovered = discoverTriggers();

    const expected = [
      // Régénéré au lot W2.B-1 (démolition legacy) : cette liste est le filet
      // des vagues suivantes — toute migration qui ajoute/supprime un trigger
      // doit la mettre à jour dans la même PR.
      // `coach_id` est dénormalisé sur les deux tables de règles pour que la
      // RLS reste une comparaison locale. Ces deux triggers sont ce qui
      // empêche une règle de porter le coach A tout en pointant le protocole
      // du coach B — la RLS de A laisserait passer, et la règle atterrirait
      // chez B. (20260805100000_coach_protocol_mapping.sql)
      "coach_food_rules_owner_check",
      "coach_timing_rules_owner_check",
      "enforce_single_master_admin_trg",
      "guard_profiles_privileged_columns_biu",
      "guard_unlocked_principles_update",
      "guard_v2_plan_item_activation",
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
      // `/app/health` (20260804190000): l'élève peut RETIRER une contrainte
      // qu'il a déclarée, et rien d'autre. Une policy RLS porte sur des lignes,
      // pas sur des colonnes — sans ce trigger, un `update` autorisé laissait
      // réécrire `declared_by` et fabriquer une contrainte attribuée au coach,
      // sur la table qui décide de ce que Sophia refuse de dire.
      "student_safety_constraints_retraction_only",
      // DE-WHATSAPP: `sync_phone_verified_on_whatsapp_optin_trigger` est
      // supprime (20260804150000) — il posait phone_verified_at quand
      // whatsapp_opted_in passait a true, ce que plus personne ne fait.
      "trg_archive_pending_week_plans_on_plan_archive",
      "trg_chat_messages_scope_memory_insert",
      "trg_memory_item_actions_updated_at",
      "trg_memory_item_entities_updated_at",
      "trg_memory_item_topics_updated_at",
      "trg_memory_items_set_updated_at",
      "trg_memory_weekly_review_runs_updated_at",
      // DE-WHATSAPP: RENOMME en base en `trg_refresh_scheduling_on_access_tier_change`
      // (20260804150000). Le nom reste ici parce que ce garde decouvre les
      // triggers en lisant les MIGRATIONS, ou le CREATE historique porte
      // toujours l'ancien nom — et une migration historique ne se reecrit pas.
      "trg_refresh_whatsapp_scheduling_on_access_tier_change",
      "trg_scheduled_checkins_delete_audit",
      "trg_scheduled_checkins_enforce_min_gap_1h",
      "trg_user_chat_states_trigger_synthesizer_threshold",
      "trg_user_entities_updated_at",
      "trg_user_topic_memories_updated_at",
      "trg_validate_app_config_edge_base_url",
      "unlock_v2_principles_from_entry",
      "unlock_v2_principles_from_item_transition",
      // Les six triggers `user_architect_*` ont disparu avec les 13 tables
      // legacy droppées par 20260803140000. Ils étaient encore listés ici —
      // seconde raison pour laquelle ce garde était rouge.
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
