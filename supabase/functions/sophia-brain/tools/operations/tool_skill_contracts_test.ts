import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { executedToolsForStatus } from "../../router/effect_ledger_adapter.ts";
import { renderRecurringReminderExecuted } from "./create_recurring_reminder/renderer.ts";

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

});

Deno.test("tool skill invariant: prepare_defense_card has no deterministic renderer", async () => {
  await Deno.stat(
    new URL("./prepare_defense_card/renderer.ts", import.meta.url),
  )
    .then(
      () => {
        throw new Error("prepare_defense_card_renderer_should_not_exist");
      },
      () => undefined,
    );
});

Deno.test("tool skill invariant: prepare_attack_card has no deterministic renderer", async () => {
  const moduleNames: string[] = [];
  for await (
    const entry of Deno.readDir(
      new URL("./prepare_attack_card", import.meta.url),
    )
  ) {
    if (entry.isFile && entry.name.endsWith(".ts")) {
      moduleNames.push(entry.name);
    }
  }
  assertEquals(moduleNames.sort(), [
    "contract.ts",
    "local_flow.ts",
    "local_flow_test.ts",
    "platform_fields.ts",
    "router.ts",
    "run_support.ts",
    "state.ts",
    "visible_agent.ts",
  ]);
});

Deno.test("tool skill invariant: update_coach_preferences has no deterministic renderer", async () => {
  await Deno.stat(
    new URL("./update_coach_preferences/renderer.ts", import.meta.url),
  )
    .then(
      () => {
        throw new Error("update_coach_preferences_renderer_should_not_exist");
      },
      () => undefined,
    );
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
  for (const operation of operations) {
    const files = operation === "prepare_attack_card"
      ? ["contract.ts", "router.ts", "local_flow.ts", "visible_agent.ts"]
      : operation === "adjust_plan_item"
      ? ["contract.ts", "router.ts", "local_flow.ts", "visible_agent.ts"]
      : operation === "select_state_potion"
      ? ["contract.ts", "router.ts", "handoff.ts", "visible_agents/agent.ts"]
      : operation === "prepare_defense_card" ||
          operation === "update_coach_preferences"
      ? ["contract.ts", "router.ts", "local_flow.ts", "visible_agent.ts"]
      : ["contract.ts", "router.ts", "executor.ts", "renderer.ts"];
    for (const file of files) {
      const stat = await Deno.stat(
        new URL(`./${operation}/${file}`, import.meta.url),
      );
      assert(stat.isFile, `${operation}/${file}`);
    }
    if (
      operation !== "prepare_attack_card" &&
      operation !== "adjust_plan_item" &&
      operation !== "select_state_potion" &&
      operation !== "prepare_defense_card" &&
      operation !== "update_coach_preferences"
    ) {
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
