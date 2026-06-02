import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  allHandoffTargets,
  getHandoffTargetForOperation,
} from "./contract.ts";

Deno.test("adjust_plan_item maps to plan and is not executable from chat", () => {
  const target = getHandoffTargetForOperation("adjust_plan_item");
  assertEquals(target?.surface_id, "plan");
  assertEquals(target?.can_execute_from_chat, false);
});

Deno.test("prepare_attack_card maps to attack_cards", () => {
  assertEquals(
    getHandoffTargetForOperation("prepare_attack_card")?.surface_id,
    "attack_cards",
  );
});

Deno.test("prepare_defense_card maps to defense_cards", () => {
  assertEquals(
    getHandoffTargetForOperation("prepare_defense_card")?.surface_id,
    "defense_cards",
  );
});

Deno.test("select_state_potion maps to state_potions", () => {
  assertEquals(
    getHandoffTargetForOperation("select_state_potion")?.surface_id,
    "state_potions",
  );
});

Deno.test("create_recurring_reminder maps to recurring_reminders", () => {
  assertEquals(
    getHandoffTargetForOperation("create_recurring_reminder")?.surface_id,
    "recurring_reminders",
  );
});

Deno.test("update_coach_preferences maps to coach_preferences", () => {
  assertEquals(
    getHandoffTargetForOperation("update_coach_preferences")?.surface_id,
    "coach_preferences",
  );
});

Deno.test("direct chat operations are not platform handoff targets", () => {
  assertEquals(getHandoffTargetForOperation("create_one_shot_reminder"), null);
  assertEquals(getHandoffTargetForOperation("track_progress_plan_item"), null);
});

Deno.test("unknown operation returns null", () => {
  assertEquals(getHandoffTargetForOperation("unknown_operation"), null);
});

Deno.test("all platform handoff targets have destination and steps", () => {
  for (const target of allHandoffTargets()) {
    assertNotEquals(target.user_facing_destination.trim(), "");
    assertEquals(target.platform_steps.length > 0, true);
    assertEquals(target.chat_behavior, "platform_handoff");
    assertEquals(target.can_execute_from_chat, false);
  }
});
