import { assertEquals } from "jsr:@std/assert";

import type { MorningNudgePosture } from "../_shared/v2-types.ts";
import {
  checkItemCooldown,
  checkPostureCooldown,
  checkReactivationCooldown,
  COOLDOWN_DURATIONS_MS,
  type ProactiveHistoryEntry,
  validatePostureWithCooldown,
} from "./cooldown_engine.ts";

const NOW_ISO = "2026-03-25T10:00:00.000Z";
const NOW_MS = new Date(NOW_ISO).getTime();

function makeHistoryEntry(
  overrides: Partial<ProactiveHistoryEntry> = {},
): ProactiveHistoryEntry {
  return {
    event_context: "morning_nudge_v2",
    scheduled_for: "2026-03-25T07:00:00.000Z",
    status: "sent",
    posture: "focus_today",
    item_titles: ["Mediter 10 min"],
    user_reacted: false,
    window_kind: "morning_presence",
    ...overrides,
  };
}

// ── checkPostureCooldown ────────────────────────────────────────────────────

Deno.test("posture cooldown: no history → not cooled down", () => {
  const result = checkPostureCooldown("focus_today", [], NOW_MS);
  assertEquals(result.is_cooled_down, false);
  assertEquals(result.last_occurrence_at, null);
});

Deno.test("posture cooldown: same posture < 48h ago, no reaction → cooled down", () => {
  const twoHoursAgo = new Date(NOW_MS - 2 * 60 * 60 * 1000).toISOString();
  const history = [
    makeHistoryEntry({ posture: "focus_today", scheduled_for: twoHoursAgo }),
  ];
  const result = checkPostureCooldown("focus_today", history, NOW_MS);
  assertEquals(result.is_cooled_down, true);
  assertEquals(result.type, "same_posture");
});

Deno.test("posture cooldown: same posture > 48h ago → not cooled down", () => {
  const threeDaysAgo = new Date(NOW_MS - 72 * 60 * 60 * 1000).toISOString();
  const history = [
    makeHistoryEntry({ posture: "focus_today", scheduled_for: threeDaysAgo }),
  ];
  const result = checkPostureCooldown("focus_today", history, NOW_MS);
  assertEquals(result.is_cooled_down, false);
});

Deno.test("posture cooldown: same posture < 48h ago but user reacted → not cooled down", () => {
  const twoHoursAgo = new Date(NOW_MS - 2 * 60 * 60 * 1000).toISOString();
  const history = [
    makeHistoryEntry({
      posture: "focus_today",
      scheduled_for: twoHoursAgo,
      user_reacted: true,
    }),
  ];
  const result = checkPostureCooldown("focus_today", history, NOW_MS);
  assertEquals(result.is_cooled_down, false);
  assertEquals(result.reset_by_reaction, true);
});

Deno.test("posture cooldown: different posture → not cooled down", () => {
  const twoHoursAgo = new Date(NOW_MS - 2 * 60 * 60 * 1000).toISOString();
  const history = [
    makeHistoryEntry({
      posture: "support_softly",
      scheduled_for: twoHoursAgo,
    }),
  ];
  const result = checkPostureCooldown("focus_today", history, NOW_MS);
  assertEquals(result.is_cooled_down, false);
});

// ── checkItemCooldown ───────────────────────────────────────────────────────

Deno.test("item cooldown: no history → not cooled down", () => {
  const result = checkItemCooldown(["Mediter 10 min"], [], NOW_MS);
  assertEquals(result.is_cooled_down, false);
});

Deno.test("item cooldown: same item < 72h ago, no reaction → cooled down", () => {
  const twoHoursAgo = new Date(NOW_MS - 2 * 60 * 60 * 1000).toISOString();
  const history = [
    makeHistoryEntry({
      item_titles: ["Mediter 10 min"],
      scheduled_for: twoHoursAgo,
    }),
  ];
  const result = checkItemCooldown(["Mediter 10 min"], history, NOW_MS);
  assertEquals(result.is_cooled_down, true);
  assertEquals(result.type, "same_item_reminded");
});

Deno.test("item cooldown: same item > 72h ago → not cooled down", () => {
  const fourDaysAgo = new Date(NOW_MS - 96 * 60 * 60 * 1000).toISOString();
  const history = [
    makeHistoryEntry({
      item_titles: ["Mediter 10 min"],
      scheduled_for: fourDaysAgo,
    }),
  ];
  const result = checkItemCooldown(["Mediter 10 min"], history, NOW_MS);
  assertEquals(result.is_cooled_down, false);
});

Deno.test("item cooldown: user reacted → not cooled down even if recent", () => {
  const twoHoursAgo = new Date(NOW_MS - 2 * 60 * 60 * 1000).toISOString();
  const history = [
    makeHistoryEntry({
      item_titles: ["Mediter 10 min"],
      scheduled_for: twoHoursAgo,
      user_reacted: true,
    }),
  ];
  const result = checkItemCooldown(["Mediter 10 min"], history, NOW_MS);
  assertEquals(result.is_cooled_down, false);
});

Deno.test("item cooldown: case-insensitive matching", () => {
  const twoHoursAgo = new Date(NOW_MS - 2 * 60 * 60 * 1000).toISOString();
  const history = [
    makeHistoryEntry({
      item_titles: ["mediter 10 min"],
      scheduled_for: twoHoursAgo,
    }),
  ];
  const result = checkItemCooldown(["Mediter 10 Min"], history, NOW_MS);
  assertEquals(result.is_cooled_down, true);
});

// ── checkReactivationCooldown ───────────────────────────────────────────────

Deno.test("reactivation cooldown: no reactivation history → not cooled down", () => {
  const result = checkReactivationCooldown([], NOW_MS);
  assertEquals(result.is_cooled_down, false);
});

Deno.test("reactivation cooldown: reactivation < 72h ago → cooled down", () => {
  const oneDayAgo = new Date(NOW_MS - 24 * 60 * 60 * 1000).toISOString();
  const history = [
    makeHistoryEntry({
      window_kind: "reactivation_window",
      scheduled_for: oneDayAgo,
    }),
  ];
  const result = checkReactivationCooldown(history, NOW_MS);
  assertEquals(result.is_cooled_down, true);
});

Deno.test("reactivation cooldown: reactivation > 72h ago → not cooled down", () => {
  const fourDaysAgo = new Date(NOW_MS - 96 * 60 * 60 * 1000).toISOString();
  const history = [
    makeHistoryEntry({
      window_kind: "reactivation_window",
      scheduled_for: fourDaysAgo,
    }),
  ];
  const result = checkReactivationCooldown(history, NOW_MS);
  assertEquals(result.is_cooled_down, false);
});

// ── validatePostureWithCooldown ─────────────────────────────────────────────

Deno.test("validate posture: no cooldown → returns original posture", () => {
  const result = validatePostureWithCooldown(
    "focus_today",
    ["Mediter 10 min"],
    [],
    NOW_MS,
  );
  assertEquals(result.posture, "focus_today");
});

Deno.test("validate posture: cooled down → falls back to adjacent", () => {
  const twoHoursAgo = new Date(NOW_MS - 2 * 60 * 60 * 1000).toISOString();
  const history = [
    makeHistoryEntry({
      posture: "focus_today",
      scheduled_for: twoHoursAgo,
    }),
  ];
  const result = validatePostureWithCooldown(
    "focus_today",
    [],
    history,
    NOW_MS,
  );
  assertEquals(
    result.posture === "simplify_today" || result.posture === "celebration_ping",
    true,
    `Expected adjacent posture, got ${result.posture}`,
  );
});

Deno.test("validate posture: all adjacents cooled → returns null", () => {
  const twoHoursAgo = new Date(NOW_MS - 2 * 60 * 60 * 1000).toISOString();
  const history = [
    makeHistoryEntry({
      posture: "focus_today",
      scheduled_for: twoHoursAgo,
    }),
    makeHistoryEntry({
      posture: "simplify_today",
      scheduled_for: twoHoursAgo,
    }),
    makeHistoryEntry({
      posture: "celebration_ping",
      scheduled_for: twoHoursAgo,
    }),
  ];
  const result = validatePostureWithCooldown(
    "focus_today",
    [],
    history,
    NOW_MS,
  );
  assertEquals(result.posture, null);
});

// ── Duration constants ──────────────────────────────────────────────────────

Deno.test("cooldown durations match orchestration rules §7.2", () => {
  assertEquals(COOLDOWN_DURATIONS_MS.same_posture, 48 * 60 * 60 * 1000);
  assertEquals(COOLDOWN_DURATIONS_MS.same_item_reminded, 72 * 60 * 60 * 1000);
  assertEquals(
    COOLDOWN_DURATIONS_MS.failed_technique,
    14 * 24 * 60 * 60 * 1000,
  );
  assertEquals(
    COOLDOWN_DURATIONS_MS.refused_rendez_vous,
    7 * 24 * 60 * 60 * 1000,
  );
  assertEquals(
    COOLDOWN_DURATIONS_MS.reactivation_after_silence,
    72 * 60 * 60 * 1000,
  );
});
