import { assertEquals } from "jsr:@std/assert@1";
import {
  evaluateRendezVousEligibility,
  type RendezVousDecisionContext,
} from "./rendez_vous_decision.ts";
import type { ProactiveWindowOutput } from "./proactive_windows_engine.ts";

const NOW_ISO = "2026-03-25T10:00:00.000Z";
const NOW_MS = new Date(NOW_ISO).getTime();

function baseProactiveOutput(
  overrides: Partial<ProactiveWindowOutput> = {},
): ProactiveWindowOutput {
  return {
    decision: "create_window",
    window_kind: "morning_presence",
    posture: "focus_today",
    budget_class: "light",
    confidence: "high",
    reason: "proactive_window:morning_presence:focus_today:general_presence",
    dominant_need: "general_presence",
    target_plan_item_ids: ["item-1"],
    target_plan_item_titles: ["Méditer"],
    scheduled_for: null,
    cooldown_checks: [],
    ...overrides,
  };
}

function baseContext(
  overrides: Partial<RendezVousDecisionContext> = {},
): RendezVousDecisionContext {
  return {
    userId: "user-1",
    cycleId: "cycle-1",
    transformationId: "transfo-1",
    repairMode: null,
    repairModeExitedAt: null,
    lastWeeklyDecision: null,
    lastWeeklyDecidedAt: null,
    upcomingEvents: [],
    planItems: [],
    nowIso: NOW_ISO,
    ...overrides,
  };
}

// ── Non-create decisions → nudge ─────────────────────────────────────────────

Deno.test("skip decision → nudge", () => {
  const result = evaluateRendezVousEligibility(
    baseProactiveOutput({ decision: "skip", window_kind: null }),
    baseContext(),
  );
  assertEquals(result.type, "nudge");
});

Deno.test("downgrade decision → nudge", () => {
  const result = evaluateRendezVousEligibility(
    baseProactiveOutput({
      decision: "downgrade_to_soft_presence",
      window_kind: null,
    }),
    baseContext(),
  );
  assertEquals(result.type, "nudge");
});

// ── pre_event_grounding + confirmed event → rendez-vous ──────────────────────

Deno.test("pre_event_grounding with confirmed event → rendez-vous", () => {
  const result = evaluateRendezVousEligibility(
    baseProactiveOutput({
      window_kind: "pre_event_grounding",
      dominant_need: "pre_event",
    }),
    baseContext({
      upcomingEvents: [
        {
          title: "Entretien d'embauche",
          scheduled_at: new Date(NOW_MS + 12 * 60 * 60 * 1000).toISOString(),
          event_type: "interview",
          source: "conversation",
        },
      ],
    }),
  );
  assertEquals(result.type, "rendez_vous");
  if (result.type === "rendez_vous") {
    assertEquals(result.kind, "pre_event_grounding");
  }
});

Deno.test("pre_event_grounding without confirmed event → nudge", () => {
  const result = evaluateRendezVousEligibility(
    baseProactiveOutput({
      window_kind: "pre_event_grounding",
      dominant_need: "pre_event",
    }),
    baseContext({ upcomingEvents: [] }),
  );
  assertEquals(result.type, "nudge");
});

// ── Friction + repair mode recently exited → post_friction_repair ────────────

Deno.test("emotional_protection + recent repair exit → post_friction_repair", () => {
  const result = evaluateRendezVousEligibility(
    baseProactiveOutput({
      window_kind: "midday_rescue",
      dominant_need: "emotional_protection",
    }),
    baseContext({
      repairModeExitedAt: new Date(NOW_MS - 24 * 60 * 60 * 1000).toISOString(),
    }),
  );
  assertEquals(result.type, "rendez_vous");
  if (result.type === "rendez_vous") {
    assertEquals(result.kind, "post_friction_repair");
  }
});

Deno.test("traction_rescue + recent repair exit → post_friction_repair", () => {
  const result = evaluateRendezVousEligibility(
    baseProactiveOutput({
      window_kind: "morning_presence",
      dominant_need: "traction_rescue",
    }),
    baseContext({
      repairModeExitedAt: new Date(NOW_MS - 48 * 60 * 60 * 1000).toISOString(),
    }),
  );
  assertEquals(result.type, "rendez_vous");
  if (result.type === "rendez_vous") {
    assertEquals(result.kind, "post_friction_repair");
  }
});

Deno.test("emotional_protection but repair exit > 72h ago → nudge", () => {
  const result = evaluateRendezVousEligibility(
    baseProactiveOutput({
      window_kind: "midday_rescue",
      dominant_need: "emotional_protection",
    }),
    baseContext({
      repairModeExitedAt: new Date(NOW_MS - 80 * 60 * 60 * 1000).toISOString(),
    }),
  );
  assertEquals(result.type, "nudge");
});

Deno.test("general_presence + recent repair exit → nudge (wrong dominant need)", () => {
  const result = evaluateRendezVousEligibility(
    baseProactiveOutput({
      window_kind: "morning_presence",
      dominant_need: "general_presence",
    }),
    baseContext({
      repairModeExitedAt: new Date(NOW_MS - 24 * 60 * 60 * 1000).toISOString(),
    }),
  );
  assertEquals(result.type, "nudge");
});

// ── Weekly bilan reduce/consolidate → weekly_reset ───────────────────────────

Deno.test("weekly reduce decision + recent → weekly_reset", () => {
  const result = evaluateRendezVousEligibility(
    baseProactiveOutput(),
    baseContext({
      lastWeeklyDecision: "reduce",
      lastWeeklyDecidedAt: new Date(NOW_MS - 12 * 60 * 60 * 1000)
        .toISOString(),
    }),
  );
  assertEquals(result.type, "rendez_vous");
  if (result.type === "rendez_vous") {
    assertEquals(result.kind, "weekly_reset");
  }
});

Deno.test("weekly consolidate decision + recent → weekly_reset", () => {
  const result = evaluateRendezVousEligibility(
    baseProactiveOutput(),
    baseContext({
      lastWeeklyDecision: "consolidate",
      lastWeeklyDecidedAt: new Date(NOW_MS - 6 * 60 * 60 * 1000).toISOString(),
    }),
  );
  assertEquals(result.type, "rendez_vous");
  if (result.type === "rendez_vous") {
    assertEquals(result.kind, "weekly_reset");
  }
});

Deno.test("weekly hold decision → nudge (no rendez-vous needed)", () => {
  const result = evaluateRendezVousEligibility(
    baseProactiveOutput(),
    baseContext({
      lastWeeklyDecision: "hold",
      lastWeeklyDecidedAt: new Date(NOW_MS - 6 * 60 * 60 * 1000).toISOString(),
    }),
  );
  assertEquals(result.type, "nudge");
});

Deno.test("weekly reduce decision but > 48h ago → nudge (stale)", () => {
  const result = evaluateRendezVousEligibility(
    baseProactiveOutput(),
    baseContext({
      lastWeeklyDecision: "reduce",
      lastWeeklyDecidedAt: new Date(NOW_MS - 60 * 60 * 60 * 1000)
        .toISOString(),
    }),
  );
  assertEquals(result.type, "nudge");
});

// ── Priority order ───────────────────────────────────────────────────────────

Deno.test("pre_event_grounding takes priority over weekly_reset", () => {
  const result = evaluateRendezVousEligibility(
    baseProactiveOutput({
      window_kind: "pre_event_grounding",
      dominant_need: "pre_event",
    }),
    baseContext({
      upcomingEvents: [
        {
          title: "Entretien",
          scheduled_at: new Date(NOW_MS + 6 * 60 * 60 * 1000).toISOString(),
          event_type: "interview",
          source: "conversation",
        },
      ],
      lastWeeklyDecision: "reduce",
      lastWeeklyDecidedAt: new Date(NOW_MS - 6 * 60 * 60 * 1000).toISOString(),
    }),
  );
  assertEquals(result.type, "rendez_vous");
  if (result.type === "rendez_vous") {
    assertEquals(result.kind, "pre_event_grounding");
  }
});

Deno.test("post_friction_repair takes priority over weekly_reset", () => {
  const result = evaluateRendezVousEligibility(
    baseProactiveOutput({
      window_kind: "midday_rescue",
      dominant_need: "emotional_protection",
    }),
    baseContext({
      repairModeExitedAt: new Date(NOW_MS - 24 * 60 * 60 * 1000).toISOString(),
      lastWeeklyDecision: "consolidate",
      lastWeeklyDecidedAt: new Date(NOW_MS - 6 * 60 * 60 * 1000).toISOString(),
    }),
  );
  assertEquals(result.type, "rendez_vous");
  if (result.type === "rendez_vous") {
    assertEquals(result.kind, "post_friction_repair");
  }
});

// ── No criteria met → nudge ──────────────────────────────────────────────────

Deno.test("no rendez-vous criteria met → nudge", () => {
  const result = evaluateRendezVousEligibility(
    baseProactiveOutput(),
    baseContext(),
  );
  assertEquals(result.type, "nudge");
  if (result.type === "nudge") {
    assertEquals(
      result.reason,
      "no_rendez_vous_criteria_met:morning_presence",
    );
  }
});
