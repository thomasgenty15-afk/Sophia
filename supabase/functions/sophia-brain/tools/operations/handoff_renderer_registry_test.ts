import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { getHandoffTargetForOperation } from "../../product_surface_registry/contract.ts";
import { renderSelectStatePotionHandoffDraft } from "./select_state_potion/renderer.ts";
import { renderRecurringReminderPlatformHandoff } from "./create_recurring_reminder/renderer.ts";

Deno.test("attack card uses local visible agent instead of deterministic renderer", async () => {
  const target = getHandoffTargetForOperation("prepare_attack_card")!;
  assertStringIncludes(target.user_facing_destination, "Cartes");
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

Deno.test("defense card uses local visible agent instead of deterministic renderer", async () => {
  const target = getHandoffTargetForOperation("prepare_defense_card")!;
  assertStringIncludes(target.user_facing_destination, "Défense");
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

Deno.test("potion renderer is disabled in favor of local visible agents", () => {
  const target = getHandoffTargetForOperation("select_state_potion")!;
  assertStringIncludes(target.user_facing_destination, "Potions");
  try {
    renderSelectStatePotionHandoffDraft({
      operation_type: "select_state_potion",
      mode: "platform_handoff",
      executable_from_chat: false,
      executable_from_chat: false,
      user_state_summary: "tension",
      desired_shift_summary: "vers plus calme",
      recommendation: {
        potion_label: "Pause",
        why_this_potion: "reguler",
        immediate_step: null,
        preserve: ["calme"],
        avoid: ["forcer"],
        platform_destination: "legacy",
        platform_steps: ["legacy"],
      },
      missing_decisions: [],
    });
    throw new Error("select_state_potion_renderer_should_be_disabled");
  } catch (error) {
    assertStringIncludes(String((error as Error).message), "legacy_disabled");
  }
});

Deno.test("recurring renderer includes registry Reminders destination", () => {
  const target = getHandoffTargetForOperation("create_recurring_reminder")!;
  const content = renderRecurringReminderPlatformHandoff({
    handoffDraft: {
      operation_type: "create_recurring_reminder",
      mode: "platform_handoff",
      executable_from_chat: false,
      executable_from_chat: false,
      reminder_summary: "rappel hebdo",
      cadence_summary: "chaque lundi",
      time_summary: "09:00",
      content_summary: "faire le point",
      recommendation: {
        platform_destination: "legacy",
        platform_steps: ["legacy"],
        preserve: ["cadence"],
        avoid: ["ponctuel"],
      },
      missing_decisions: [],
    },
  });
  assertStringIncludes(content, target.user_facing_destination);
});

Deno.test("preferences use local visible agent instead of deterministic renderer", async () => {
  const target = getHandoffTargetForOperation("update_coach_preferences")!;
  assertStringIncludes(target.user_facing_destination, "Préférences");
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
