import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { allPlatformDestinations, getPlatformDestination } from "./contract.ts";

Deno.test("plan adjustment maps to plan and is not executable from chat", () => {
  const destination = getPlatformDestination("plan_adjustment");
  assertEquals(destination?.surface_id, "plan");
  assertEquals(destination?.can_execute_from_chat, false);
});

Deno.test("attack card maps to attack_cards", () => {
  assertEquals(
    getPlatformDestination("attack_card")?.surface_id,
    "attack_cards",
  );
});

Deno.test("defense card maps to defense_cards", () => {
  assertEquals(
    getPlatformDestination("defense_card")?.surface_id,
    "defense_cards",
  );
});

Deno.test("state potion maps to state_potions", () => {
  assertEquals(
    getPlatformDestination("state_potion")?.surface_id,
    "state_potions",
  );
});

Deno.test("recurring reminder maps to recurring_reminders", () => {
  assertEquals(
    getPlatformDestination("recurring_reminder")?.surface_id,
    "recurring_reminders",
  );
});

Deno.test("coach preferences maps to coach_preferences", () => {
  assertEquals(
    getPlatformDestination("coach_preferences")?.surface_id,
    "coach_preferences",
  );
});

Deno.test("direct chat effects are not platform destinations", () => {
  assertEquals(getPlatformDestination("create_one_shot_reminder"), null);
  assertEquals(getPlatformDestination("track_progress_plan_item"), null);
});

Deno.test("unknown destination returns null", () => {
  assertEquals(getPlatformDestination("unknown_destination"), null);
});

Deno.test("all platform destinations have destination and steps", () => {
  for (const destination of allPlatformDestinations()) {
    assertNotEquals(destination.user_facing_destination.trim(), "");
    assertEquals(destination.platform_steps.length > 0, true);
    assertEquals(destination.chat_behavior, "platform_destination");
    assertEquals(destination.can_execute_from_chat, false);
  }
});
