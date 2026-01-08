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
    .filter((f) => !f.includes("_OLD"));

  for (const f of files) {
    const text = fs.readFileSync(path.join(migDir, f), "utf8");
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
      "archive-plan",
      "break-down-action",
      "complete-module",
      "create-module-memory",
      "create-round-table-summary",
      "detect-future-events",
      "eval-judge",
      "generate-feedback",
      "generate-plan",
      "process-checkins",
      "recommend-transformations",
      "run-evals",
      "simulate-user",
      "sophia-brain",
      "sophia-brain-internal",
      "sort-priorities",
      "summarize-context",
      "trigger-daily-bilan",
      "trigger-memory-echo",
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
      "on_auth_user_updated_email",
      "on_week12_manual_unlock",
      "on_module_created_memory",
      "on_module_updated_memory",
      "on_round_table_saved",
      "on_week_completed_identity",
      "on_module_updated_identity",
      "on_plan_completed_archive",
      "on_profile_created_master_admin",
    ].sort();

    expect(discovered).toEqual(expected);
  });
});


