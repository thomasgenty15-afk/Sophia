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

  // From squashed schema
  const squashed = repoPathFromFrontend("supabase", "migrations", "20241210120000_squashed_schema.sql");
  if (fs.existsSync(squashed)) {
    const text = fs.readFileSync(squashed, "utf8");
    for (const m of text.matchAll(/CREATE\s+OR\s+REPLACE\s+TRIGGER\s+"([^"]+)"/gi)) {
      triggers.add(m[1]);
    }
  }

  // From migrations (exclude *_OLD.sql)
  const migDir = repoPathFromFrontend("supabase", "migrations");
  const files = fs
    .readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => !f.includes("_OLD"))
    .sort();

  for (const f of files) {
    const text = fs.readFileSync(path.join(migDir, f), "utf8");
    for (const m of text.matchAll(/drop\s+trigger\s+if\s+exists[ \t]+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi)) {
      triggers.delete(m[1]);
    }
    // Important: avoid matching comment blocks like "Create Trigger" followed by a newline.
    // Only match trigger declarations on a single line.
    for (const m of text.matchAll(/create\s+(?:or\s+replace\s+)?trigger[ \t]+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi)) {
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
      "classify-recurring-reminder",
      "complete-module",
      "create-module-memory",
      "detect-future-events",
      "ethical-text-validator",
      "eval-judge",
      "notify-profile-change",
      "process-checkins",
      "process-eval-judge-jobs",
      "process-llm-retry-jobs",
      "process-whatsapp-optin-recovery",
      "process-whatsapp-outbound-retries",
      "schedule-morning-active-action-checkins",
      "send-welcome-email",
      "sophia-brain",
      "sophia-brain-internal",
      "stripe-change-plan",
      "stripe-create-checkout-session",
      "stripe-create-portal-session",
      "stripe-sync-subscription",
      "stripe-webhook",
      "test-env",
      "trigger-daily-bilan",
      "trigger-global-memory-compaction",
      "trigger-memorizer-daily",
      "trigger-memory-echo",
      "trigger-proactive-scheduler",
      "trigger-retention-emails",
      "trigger-synthesizer-batch",
      "trigger-watcher-batch",
      "trigger-weekly-bilan",
      "update-core-identity",
      "whatsapp-optin",
      "whatsapp-send",
      "whatsapp-webhook",
    ].sort();

    expect(discovered).toEqual(expected);
  });

  it("all DB triggers are in the known list (migrations + squashed_schema, excluding *_OLD.sql)", () => {
    const discovered = discoverTriggers();

    const expected = [
      // From squashed schema
      "on_forge_level_progression",
      "on_module_activity_unlock",
      "on_module_entry_update",
      "on_profile_created_init_modules",
      "update_user_chat_states_modtime",

      // From migrations (recent)
      "enforce_single_master_admin_trg",
      "on_auth_user_created",
      "on_auth_user_email_confirmed_send_onboarding",
      "on_auth_user_updated_email",
      "on_week12_manual_unlock",
      "on_module_created_memory",
      "on_module_updated_memory",
      "on_week_completed_identity",
      "on_module_updated_identity",
      "on_plan_completed_archive",
      "on_profile_created_master_admin",
      "on_profile_created_seed_default_coach_preferences_trigger",
      "on_profile_created_send_welcome",
      "on_profiles_trial_change_recompute_access",
      "on_subscriptions_change_recompute_access",
      "on_subscriptions_change_recompute_access_delete",
      "sync_phone_verified_on_whatsapp_optin_trigger",
      "trg_refresh_whatsapp_scheduling_on_access_tier_change",
      "trg_scheduled_checkins_enforce_min_gap_1h",
      "trg_user_chat_states_trigger_synthesizer_threshold",
      "trg_validate_app_config_edge_base_url",
      "trigger_upgrade_interest_updated_at",
    ].sort();

    expect(discovered).toEqual(expected);
  });
});
