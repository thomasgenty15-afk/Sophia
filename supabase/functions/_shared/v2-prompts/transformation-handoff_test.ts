import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";

import {
  buildHandoffPlanItemSnapshot,
  buildHandoffTransformationSnapshot,
  buildPulseSummaryForHandoff,
  buildTransformationHandoffUserPrompt,
  parseTransformationHandoffLLMResponse,
  type TransformationHandoffInput,
  validateTransformationHandoffOutput,
} from "./transformation-handoff.ts";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeTransformation(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: "t-1",
    title: "Retrouver une routine sportive",
    internal_summary: "L'utilisateur veut réintégrer le sport...",
    user_summary: "Retrouver le plaisir du mouvement",
    success_definition: "3 séances par semaine",
    activated_at: "2026-02-01T00:00:00Z",
    completed_at: "2026-03-15T00:00:00Z",
    ...overrides,
  };
}

function makePlanItem(
  id: string,
  kind: string,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id,
    title: `Item ${id}`,
    dimension: "habits",
    kind,
    status: "active",
    current_habit_state: kind === "habit" ? "active_building" : null,
    ...overrides,
  };
}

function makeEntry(
  entryKind: string,
  effectiveAt: string,
): Record<string, unknown> {
  return { entry_kind: entryKind, effective_at: effectiveAt };
}

function makeInput(
  overrides: Partial<TransformationHandoffInput> = {},
): TransformationHandoffInput {
  return {
    transformation: buildHandoffTransformationSnapshot(makeTransformation()),
    plan_items: [
      buildHandoffPlanItemSnapshot(
        makePlanItem("item-1", "habit", {
          current_habit_state: "anchored",
        }),
        [
          makeEntry("checkin", "2026-03-10T10:00:00Z"),
          makeEntry("progress", "2026-03-12T10:00:00Z"),
          makeEntry("checkin", "2026-03-14T10:00:00Z"),
        ],
      ),
      buildHandoffPlanItemSnapshot(
        makePlanItem("item-2", "framework", {
          dimension: "clarifications",
          title: "Clarifier quand la respiration guidée aide vraiment",
        }),
        [
          makeEntry("support_feedback", "2026-03-11T10:00:00Z"),
          makeEntry("progress", "2026-03-13T10:00:00Z"),
        ],
      ),
      buildHandoffPlanItemSnapshot(
        makePlanItem("item-3", "habit", {
          title: "Méditation 5 min",
          current_habit_state: "active_building",
        }),
        [
          makeEntry("skip", "2026-03-10T10:00:00Z"),
          makeEntry("blocker", "2026-03-12T10:00:00Z"),
          makeEntry("blocker", "2026-03-14T10:00:00Z"),
        ],
      ),
      buildHandoffPlanItemSnapshot(
        makePlanItem("item-4", "mission", {
          dimension: "missions",
          title: "S'inscrire à la salle",
          status: "completed",
        }),
        [
          makeEntry("progress", "2026-03-05T10:00:00Z"),
        ],
      ),
    ],
    victories: [
      { title: "Première séance de sport en 3 mois", created_at: "2026-03-10T10:00:00Z" },
      { title: "Tenu 5 jours de suite", created_at: "2026-03-14T10:00:00Z" },
    ],
    coaching_snapshots: [
      { technique_key: "progressive_overload", created_at: "2026-03-08T10:00:00Z", outcome: "positive" },
      { technique_key: "micro_commitment", created_at: "2026-03-12T10:00:00Z", outcome: "negative" },
    ],
    metrics: [
      { metric_kind: "north_star", label: "Séances hebdomadaires", current_value: 2.5, target_value: 3 },
    ],
    pulse_summary: null,
    ...overrides,
  };
}

function makeValidRawOutput(): Record<string, unknown> {
  return {
    wins: [
      "Première séance de sport après 3 mois d'arrêt",
      "5 jours consécutifs de routine matinale",
    ],
    supports_to_keep: ["item-2"],
    habits_in_maintenance: ["item-1"],
    techniques_that_failed: ["item-3", "micro_commitment"],
    relational_signals: [
      "Répond mieux aux nudges matinaux",
      "Préfère les bilans courts et concrets",
    ],
    coaching_memory_summary:
      "L'utilisateur fonctionne mieux avec des objectifs concrets et atteignables. " +
      "La progression graduelle (progressive_overload) a bien fonctionné, contrairement " +
      "aux micro-engagements quotidiens qui le mettent sous pression. Il est plus réceptif " +
      "le matin et préfère des interactions directes et courtes.",
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Snapshot builder tests
// ═════════════════════════════════════════════════════════════════════════════

Deno.test("buildHandoffTransformationSnapshot: computes duration_days", () => {
  const snap = buildHandoffTransformationSnapshot(makeTransformation());
  assertEquals(snap.duration_days, 42);
  assertEquals(snap.title, "Retrouver une routine sportive");
});

Deno.test("buildHandoffTransformationSnapshot: null dates → null duration", () => {
  const snap = buildHandoffTransformationSnapshot(
    makeTransformation({ activated_at: null, completed_at: null }),
  );
  assertEquals(snap.duration_days, null);
  assertEquals(snap.activated_at, null);
});

Deno.test("buildHandoffPlanItemSnapshot: counts entry kinds correctly", () => {
  const snap = buildHandoffPlanItemSnapshot(
    makePlanItem("x", "habit"),
    [
      makeEntry("checkin", "2026-03-10T10:00:00Z"),
      makeEntry("blocker", "2026-03-11T10:00:00Z"),
      makeEntry("skip", "2026-03-12T10:00:00Z"),
      makeEntry("progress", "2026-03-13T10:00:00Z"),
    ],
  );
  assertEquals(snap.total_entries, 4);
  assertEquals(snap.positive_entries, 2);
  assertEquals(snap.blocker_entries, 1);
  assertEquals(snap.skip_entries, 1);
  assertEquals(snap.last_entry_at, "2026-03-13T10:00:00Z");
});

Deno.test("buildHandoffPlanItemSnapshot: zero entries → null last_entry_at", () => {
  const snap = buildHandoffPlanItemSnapshot(makePlanItem("x", "habit"), []);
  assertEquals(snap.total_entries, 0);
  assertEquals(snap.last_entry_at, null);
});

Deno.test("buildPulseSummaryForHandoff: null pulse → null", () => {
  assertEquals(buildPulseSummaryForHandoff(null), null);
});

Deno.test("buildPulseSummaryForHandoff: extracts relevant fields", () => {
  const pulse = {
    version: 1 as const,
    generated_at: "2026-03-24T12:00:00Z",
    window_days: 7 as const,
    last_72h_weight: 0.75,
    tone: {
      dominant: "hopeful" as const,
      emotional_load: "low" as const,
      relational_openness: "open" as const,
    },
    trajectory: {
      direction: "up" as const,
      confidence: "high" as const,
      summary: "Good trajectory",
    },
    highlights: {
      wins: ["Win1"],
      friction_points: ["Friction1"],
      support_that_helped: ["Support1"],
      unresolved_tensions: [],
    },
    signals: {
      top_blocker: null,
      likely_need: "push" as const,
      upcoming_event: null,
      proactive_risk: "low" as const,
    },
    evidence_refs: {
      message_ids: ["m1"],
      event_ids: [],
    },
  };

  const result = buildPulseSummaryForHandoff(pulse);
  assertEquals(result?.tone_dominant, "hopeful");
  assertEquals(result?.trajectory_direction, "up");
  assertEquals(result?.likely_need, "push");
  assertEquals(result?.wins, ["Win1"]);
  assertEquals(result?.friction_points, ["Friction1"]);
});

// ═════════════════════════════════════════════════════════════════════════════
// Validator tests
// ═════════════════════════════════════════════════════════════════════════════

Deno.test("validator: valid output passes", () => {
  const input = makeInput();
  const raw = makeValidRawOutput();
  const result = validateTransformationHandoffOutput(raw, input);
  assert(result.valid, `unexpected violations: ${(result as { violations?: string[] }).violations?.join(", ")}`);
  assertEquals(result.payload.wins.length, 2);
  assertEquals(result.payload.supports_to_keep, ["item-2"]);
  assertEquals(result.payload.habits_in_maintenance, ["item-1"]);
  assertEquals(result.payload.techniques_that_failed.length, 2);
  assertEquals(result.payload.relational_signals.length, 2);
  assert(result.payload.coaching_memory_summary.length > 0);
});

Deno.test("validator: null input → fallback payload", () => {
  const input = makeInput();
  const result = validateTransformationHandoffOutput(null, input);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("not an object")));
  assertEquals(result.payload.wins.length, 0);
});

Deno.test("validator: empty wins on long transformation → violation", () => {
  const input = makeInput();
  const raw = { ...makeValidRawOutput(), wins: [] };
  const result = validateTransformationHandoffOutput(raw, input);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("wins is empty")));
});

Deno.test("validator: empty wins on short transformation → no violation", () => {
  const input = makeInput({
    transformation: buildHandoffTransformationSnapshot(
      makeTransformation({
        activated_at: "2026-03-10T00:00:00Z",
        completed_at: "2026-03-15T00:00:00Z",
      }),
    ),
  });
  const raw = { ...makeValidRawOutput(), wins: [] };
  const result = validateTransformationHandoffOutput(raw, input);
  const winsViolation = result.valid
    ? false
    : result.violations.some((v) => v.includes("wins is empty"));
  assert(!winsViolation, "short transformation should not require wins");
});

Deno.test("validator: empty wins on long but low-activity transformation → no violation", () => {
  const input = makeInput({
    plan_items: [
      buildHandoffPlanItemSnapshot(
        makePlanItem("item-low-1", "habit", {
          current_habit_state: "active_building",
        }),
        [makeEntry("checkin", "2026-03-10T10:00:00Z")],
      ),
      buildHandoffPlanItemSnapshot(
        makePlanItem("item-low-2", "framework", {
          dimension: "clarifications",
        }),
        [makeEntry("support_feedback", "2026-03-11T10:00:00Z")],
      ),
    ],
  });
  const raw = { ...makeValidRawOutput(), wins: [] };
  const result = validateTransformationHandoffOutput(raw, input);
  const winsViolation = result.valid
    ? false
    : result.violations.some((v) => v.includes("wins is empty"));
  assert(!winsViolation, "low-activity transformation should not require wins");
});

Deno.test("validator: win over 100 chars → clamped + violation", () => {
  const input = makeInput();
  const longWin = "A".repeat(120);
  const raw = { ...makeValidRawOutput(), wins: [longWin] };
  const result = validateTransformationHandoffOutput(raw, input);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("exceeds 100 chars")));
  assertEquals(result.payload.wins[0].length, 100);
});

Deno.test("validator: wins capped at 5", () => {
  const input = makeInput();
  const raw = {
    ...makeValidRawOutput(),
    wins: ["w1", "w2", "w3", "w4", "w5", "w6", "w7"],
  };
  const result = validateTransformationHandoffOutput(raw, input);
  assertEquals(result.payload.wins.length, 5);
});

Deno.test("validator: invalid supports_to_keep IDs → filtered + violation", () => {
  const input = makeInput();
  const raw = {
    ...makeValidRawOutput(),
    supports_to_keep: ["item-2", "bogus-id"],
  };
  const result = validateTransformationHandoffOutput(raw, input);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("supports_to_keep contains invalid IDs")));
  assertEquals(result.payload.supports_to_keep, ["item-2"]);
});

Deno.test("validator: non-clarification ID in supports_to_keep → violation", () => {
  const input = makeInput();
  const raw = {
    ...makeValidRawOutput(),
    supports_to_keep: ["item-2", "item-4"],
  };
  const result = validateTransformationHandoffOutput(raw, input);
  assert(!result.valid);
  assert(
    result.violations.some((v) =>
      v.includes("supports_to_keep contains non-clarification items")
    ),
  );
  assertEquals(result.payload.supports_to_keep, ["item-2"]);
});

Deno.test("validator: non-habit ID in habits_in_maintenance → violation", () => {
  const input = makeInput();
  const raw = {
    ...makeValidRawOutput(),
    habits_in_maintenance: ["item-1", "item-2"],
  };
  const result = validateTransformationHandoffOutput(raw, input);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("non-habit items")));
  assertEquals(result.payload.habits_in_maintenance, ["item-1"]);
});

Deno.test("validator: techniques_that_failed allows coaching keys", () => {
  const input = makeInput();
  const raw = {
    ...makeValidRawOutput(),
    techniques_that_failed: ["item-3", "progressive_overload"],
  };
  const result = validateTransformationHandoffOutput(raw, input);
  assert(result.valid, `unexpected violations: ${(result as { violations?: string[] }).violations?.join(", ")}`);
  assertEquals(result.payload.techniques_that_failed.length, 2);
});

Deno.test("validator: unknown techniques_that_failed → filtered + violation", () => {
  const input = makeInput();
  const raw = {
    ...makeValidRawOutput(),
    techniques_that_failed: ["item-3", "unknown-technique"],
  };
  const result = validateTransformationHandoffOutput(raw, input);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("unknown IDs/keys")));
  assertEquals(result.payload.techniques_that_failed, ["item-3"]);
});

Deno.test("validator: relational_signals over 150 chars → clamped + violation", () => {
  const input = makeInput();
  const longSignal = "S".repeat(200);
  const raw = {
    ...makeValidRawOutput(),
    relational_signals: [longSignal],
  };
  const result = validateTransformationHandoffOutput(raw, input);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("exceeds 150 chars")));
  assertEquals(result.payload.relational_signals[0].length, 150);
});

Deno.test("validator: relational_signals capped at 3", () => {
  const input = makeInput();
  const raw = {
    ...makeValidRawOutput(),
    relational_signals: ["s1", "s2", "s3", "s4"],
  };
  const result = validateTransformationHandoffOutput(raw, input);
  assertEquals(result.payload.relational_signals.length, 3);
});

Deno.test("validator: empty coaching_memory_summary → violation", () => {
  const input = makeInput();
  const raw = { ...makeValidRawOutput(), coaching_memory_summary: "" };
  const result = validateTransformationHandoffOutput(raw, input);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("coaching_memory_summary is empty")));
});

Deno.test("validator: very long coaching_memory_summary → clamped + violation", () => {
  const input = makeInput();
  const raw = {
    ...makeValidRawOutput(),
    coaching_memory_summary: "X".repeat(1000),
  };
  const result = validateTransformationHandoffOutput(raw, input);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("exceeds 200 tokens")));
  assertEquals(result.payload.coaching_memory_summary.length, 800);
});

// ═════════════════════════════════════════════════════════════════════════════
// LLM response parser tests
// ═════════════════════════════════════════════════════════════════════════════

Deno.test("parseLLMResponse: valid JSON embedded in text", () => {
  const input = makeInput();
  const json = JSON.stringify(makeValidRawOutput());
  const text = `Voici le handoff:\n\n${json}\n\nTerminé.`;
  const result = parseTransformationHandoffLLMResponse(text, input);
  assert(result.valid);
  assertEquals(result.payload.wins.length, 2);
});

Deno.test("parseLLMResponse: garbage → fallback", () => {
  const input = makeInput();
  const result = parseTransformationHandoffLLMResponse("no json here", input);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("no JSON object")));
});

Deno.test("parseLLMResponse: invalid JSON → parse error", () => {
  const input = makeInput();
  const result = parseTransformationHandoffLLMResponse("{ broken: json }", input);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("failed to parse")));
});

// ═════════════════════════════════════════════════════════════════════════════
// User prompt builder tests
// ═════════════════════════════════════════════════════════════════════════════

Deno.test("buildUserPrompt: includes transformation and items data", () => {
  const input = makeInput();
  const prompt = buildTransformationHandoffUserPrompt(input);
  assert(prompt.includes("Retrouver une routine sportive"));
  assert(prompt.includes("item-1"));
  assert(prompt.includes("item-2"));
  assert(prompt.includes("Première séance de sport"));
  assert(prompt.includes("north_star"));
});

Deno.test("buildUserPrompt: includes coaching snapshots", () => {
  const input = makeInput();
  const prompt = buildTransformationHandoffUserPrompt(input);
  assert(prompt.includes("progressive_overload"));
  assert(prompt.includes("micro_commitment"));
});
