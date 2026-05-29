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
