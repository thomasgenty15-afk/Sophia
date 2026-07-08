import { assertEquals } from "jsr:@std/assert@1";
import {
  isEveningActionTimeOfDay,
  isLateActionTimeOfDay,
  isMorningSlotTimeOfDay,
  isNightActionTimeOfDay,
  isWakeUpTimeOfDay,
  normalizeTimeOfDay,
  TIME_OF_DAY_VALUES,
} from "./time_of_day.ts";

Deno.test("normalizeTimeOfDay maps canonical values and legacy aliases", () => {
  for (const value of TIME_OF_DAY_VALUES) {
    assertEquals(normalizeTimeOfDay(value), value);
    assertEquals(normalizeTimeOfDay(` ${value.toUpperCase()} `), value);
  }
  // Alias legacy: jamais renvoyés tels quels.
  assertEquals(normalizeTimeOfDay("any_time"), "anytime");
  assertEquals(normalizeTimeOfDay("wakeup"), "wake_up");
  assertEquals(normalizeTimeOfDay("wake-up"), "wake_up");
  // "all_day" est interdit par les prompts: rejeté, pas aliasé.
  assertEquals(normalizeTimeOfDay("all_day"), null);
});

Deno.test("normalizeTimeOfDay returns null for empty or unknown values", () => {
  assertEquals(normalizeTimeOfDay(null), null);
  assertEquals(normalizeTimeOfDay(undefined), null);
  assertEquals(normalizeTimeOfDay(""), null);
  assertEquals(normalizeTimeOfDay("   "), null);
  assertEquals(normalizeTimeOfDay("noon"), null);
  assertEquals(normalizeTimeOfDay(42), null);
});

Deno.test("isLateActionTimeOfDay matches evening/night incl. free text", () => {
  assertEquals(isLateActionTimeOfDay("evening"), true);
  assertEquals(isLateActionTimeOfDay("night"), true);
  assertEquals(isLateActionTimeOfDay("le soir"), true);
  assertEquals(isLateActionTimeOfDay("soirée"), true); // diacritiques strippés
  assertEquals(isLateActionTimeOfDay("avant le coucher"), true);
  assertEquals(isLateActionTimeOfDay("morning"), false);
  assertEquals(isLateActionTimeOfDay("afternoon"), false);
  assertEquals(isLateActionTimeOfDay("anytime"), false);
  assertEquals(isLateActionTimeOfDay(null), false);
  // wake_up n'est PAS tardif: l'action se fait le matin.
  assertEquals(isLateActionTimeOfDay("wake_up"), false);
});

Deno.test("isWakeUpTimeOfDay matches wake_up variants and réveil", () => {
  assertEquals(isWakeUpTimeOfDay("wake_up"), true);
  assertEquals(isWakeUpTimeOfDay("wake-up"), true);
  assertEquals(isWakeUpTimeOfDay("wakeup"), true);
  assertEquals(isWakeUpTimeOfDay("au réveil"), true);
  assertEquals(isWakeUpTimeOfDay("reveil"), true);
  assertEquals(isWakeUpTimeOfDay("morning"), false);
  assertEquals(isWakeUpTimeOfDay(null), false);
});

Deno.test("evening vs night split is exclusive", () => {
  assertEquals(isEveningActionTimeOfDay("evening"), true);
  assertEquals(isEveningActionTimeOfDay("soir"), true);
  assertEquals(isEveningActionTimeOfDay("night"), false);
  assertEquals(isNightActionTimeOfDay("night"), true);
  assertEquals(isNightActionTimeOfDay("nuit"), true);
  assertEquals(isNightActionTimeOfDay("coucher"), true);
  assertEquals(isNightActionTimeOfDay("evening"), false);
});

Deno.test("isMorningSlotTimeOfDay covers morning/afternoon/anytime/null only", () => {
  assertEquals(isMorningSlotTimeOfDay("morning"), true);
  assertEquals(isMorningSlotTimeOfDay("afternoon"), true);
  assertEquals(isMorningSlotTimeOfDay("anytime"), true);
  assertEquals(isMorningSlotTimeOfDay(null), true);
  assertEquals(isMorningSlotTimeOfDay(""), true);
  // Exclusions: chaque autre créneau a son propre nudge.
  assertEquals(isMorningSlotTimeOfDay("evening"), false);
  assertEquals(isMorningSlotTimeOfDay("night"), false);
  assertEquals(isMorningSlotTimeOfDay("wake_up"), false);
});
