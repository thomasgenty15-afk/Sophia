import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { executedToolsForStatus } from "../../router/effect_ledger_adapter.ts";
import { renderAttackCardFailedReply } from "./prepare_attack_card/renderer.ts";
import { renderDefenseCardExecuted } from "./prepare_defense_card/renderer.ts";
import { renderRecurringReminderExecuted } from "./create_recurring_reminder/renderer.ts";
import { renderSelectStatePotionSkillResult } from "./select_state_potion/renderer.ts";
import { renderCoachPreferencesExecuted } from "./update_coach_preferences/renderer.ts";

Deno.test("tool skill invariant: executedTools is empty unless execution succeeded", () => {
  assertEquals(executedToolsForStatus("failed", ["prepare_attack_card"]), []);
  assertEquals(executedToolsForStatus("blocked", ["select_state_potion"]), []);
  assertEquals(
    executedToolsForStatus("none", ["update_coach_preferences"]),
    [],
  );
  assertEquals(
    executedToolsForStatus("success", ["create_recurring_reminder"]),
    [],
  );
  assertEquals(
    executedToolsForStatus("success", ["create_recurring_reminder"], [{
      type: "create_recurring_reminder",
      recurring_reminder_id: "rr_1",
    }]),
    ["create_recurring_reminder"],
  );
});

Deno.test("tool skill invariant: renderers do not claim durable success without committed effects", () => {
  const attackFailed = renderAttackCardFailedReply();
  assertEquals(attackFailed.includes("C'est fait"), false);

  const defenseWithoutCommit = renderDefenseCardExecuted({
    draft: {
      operation_type: "prepare_defense_card",
      output_schema: "defense_card_draft_v1",
      draft: {
        title: "Carte defense",
        risk_situation: "le soir",
        defense_response: "poser le telephone",
        interruption_phrase: "pause",
        replacement_action: "respirer",
        support_message: "reste simple",
      },
      confirmation_message: "Créer ?",
      confirmation_actions: ["yes", "no"],
    } as any,
    committedEffects: [],
  });
  assertStringIncludes(defenseWithoutCommit, "pas de confirmation DB");
  assertEquals(defenseWithoutCommit.includes("C'est fait"), false);

  const recurringWithoutCommit = renderRecurringReminderExecuted({
    draft: {
      operation_type: "create_recurring_reminder",
      output_schema: "recurring_reminder_draft_v1",
      draft: {
        title: "Rappel",
        message: "Respire",
        frequency: "daily",
        days: [],
        time: "09:00",
        timezone: "Europe/Paris",
        destination: "chat",
      },
      confirmation_message: "Créer ?",
      confirmation_actions: ["yes", "no"],
    } as any,
    committedEffects: [],
  });
  assertStringIncludes(recurringWithoutCommit, "DB ne l'a pas confirmé");
  assertEquals(recurringWithoutCommit.includes("C'est fait"), false);

  const potionWithoutCommit = renderSelectStatePotionSkillResult({
    handled: true,
    status: "executed",
    user_intent: "activate",
    constraints: [],
    reply: "Potion activée.",
    requested_effects: [],
    allowed_effects: [],
    blocked_effects: [],
    committed_effects: [],
    effect_ledger: {
      requested_effects: [],
      allowed_effects: [],
      blocked_effects: [],
      committed_effects: [],
    },
    debug: { reason_code: "test", evidence: [] },
  });
  assertStringIncludes(potionWithoutCommit, "pas de confirmation DB");
  assertEquals(potionWithoutCommit.includes("Potion activée."), false);
  assertEquals(potionWithoutCommit.includes("C'est fait"), false);

  const coachWithoutCommit = renderCoachPreferencesExecuted({
    draft: {
      operation_type: "update_coach_preferences",
      output_schema: "coach_preferences_patch_draft_v1",
      draft: {
        patch: { "coach.tone": "direct" },
        summary: "ton direct",
      },
      confirmation_message: "Appliquer ?",
      confirmation_actions: ["yes", "no"],
    },
    committedEffects: [],
  });
  assertStringIncludes(coachWithoutCommit, "DB ne l'a pas confirmé");
  assertEquals(coachWithoutCommit.includes("C'est fait"), false);
});

Deno.test("tool skill invariant: migrated operation contracts are importable", async () => {
  const modules = await Promise.all([
    import("./adjust_plan_item/contract.ts"),
    import("./create_recurring_reminder/contract.ts"),
    import("./select_state_potion/contract.ts"),
    import("./update_coach_preferences/contract.ts"),
    import("./prepare_defense_card/contract.ts"),
    import("./prepare_attack_card/contract.ts"),
  ]);
  assert(modules.every((module) => module && typeof module === "object"));
});

Deno.test("tool skill architecture: migrated operations expose expected modules", async () => {
  const operations = [
    "adjust_plan_item",
    "prepare_attack_card",
    "prepare_defense_card",
    "create_recurring_reminder",
    "select_state_potion",
    "update_coach_preferences",
  ];
  const knownHybridTools = [{
    name: "prepare_attack_card",
    reason:
      "Legacy migration predates the standard intake.ts/effects.ts split but exposes contract/router/executor/renderer.",
    removal_criteria:
      "Add standard intake.ts and effects.ts or document the replacement contract in the operation module.",
  }, {
    name: "prepare_defense_card",
    reason:
      "Legacy migration predates the standard intake.ts/effects.ts split but exposes contract/router/executor/renderer.",
    removal_criteria:
      "Add standard intake.ts and effects.ts or document the replacement contract in the operation module.",
  }];
  const hybrid = new Set(knownHybridTools.map((tool) => tool.name));
  assert(
    knownHybridTools.every((tool) => tool.reason && tool.removal_criteria),
  );

  for (const operation of operations) {
    for (
      const file of ["contract.ts", "router.ts", "executor.ts", "renderer.ts"]
    ) {
      const stat = await Deno.stat(
        new URL(`./${operation}/${file}`, import.meta.url),
      );
      assert(stat.isFile, `${operation}/${file}`);
    }
    if (!hybrid.has(operation)) {
      const intake = await Deno.stat(
        new URL(`./${operation}/intake.ts`, import.meta.url),
      );
      assert(intake.isFile, `${operation}/intake.ts`);
    }
  }
});

Deno.test("tool skill architecture: adjust_plan_item intake stays a thin facade", async () => {
  const knownLegacy = [{
    name: "adjust_plan_item/intake.ts massive legacy intake",
    reason:
      "Existing adjust_plan_item intake still carries reducer/runtime-like logic; Priority 9 only adds guardrails, not the migration.",
    removal_criteria:
      "Split adjust_plan_item into standard contract/intake/reducer/effects/executor modules and reduce intake.ts below 160 non-comment lines.",
    max_lines_until_migration: 5700,
  }];
  assert(
    knownLegacy.every((item) => item.reason && item.removal_criteria),
  );
  const text = await Deno.readTextFile(
    new URL("./adjust_plan_item/intake.ts", import.meta.url),
  );
  assert(
    text.split(/\r?\n/).length <= knownLegacy[0].max_lines_until_migration,
    "adjust_plan_item/intake.ts is legacy-large; do not grow it before migration",
  );
});
