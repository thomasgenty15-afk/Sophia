import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";

import {
  buildConversationPulseUserPrompt,
  type ConversationPulseInput,
  parseConversationPulseLLMResponse,
  validateConversationPulseOutput,
} from "./conversation-pulse.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = "2026-03-24T12:00:00Z";

function makeInput(
  overrides: Partial<ConversationPulseInput> = {},
): ConversationPulseInput {
  return {
    messages: [
      {
        id: "msg-1",
        role: "user",
        text: "J'ai bien médité ce matin",
        created_at: "2026-03-23T08:00:00Z",
      },
      {
        id: "msg-2",
        role: "assistant",
        text: "Super ! Comment tu te sens ?",
        created_at: "2026-03-23T08:01:00Z",
      },
      {
        id: "msg-3",
        role: "user",
        text: "Bien mais fatigué",
        created_at: "2026-03-23T20:00:00Z",
      },
      {
        id: "msg-4",
        role: "user",
        text: "J'ai pas pu courir aujourd'hui",
        created_at: "2026-03-24T07:00:00Z",
      },
    ],
    messages_last_72h_count: 4,
    recent_bilans: [
      {
        kind: "daily",
        date: "2026-03-23",
        summary: "Méditation OK, course manquée",
      },
    ],
    event_memories: [
      {
        id: "evt-1",
        title: "Entretien professionnel",
        date: "2026-03-25",
        relevance: "Source de stress mentionnée",
      },
    ],
    local_date: "2026-03-24",
    ...overrides,
  };
}

function makeValidRawOutput(): Record<string, unknown> {
  return {
    tone: {
      dominant: "mixed",
      emotional_load: "medium",
      relational_openness: "open",
    },
    trajectory: {
      direction: "flat",
      confidence: "medium",
      summary: "Stable avec fatigue en fin de journée",
    },
    highlights: {
      wins: ["Méditation matinale régulière"],
      friction_points: ["Course manquée par fatigue"],
      support_that_helped: ["Respiration guidée"],
      unresolved_tensions: ["Stress entretien pro"],
    },
    signals: {
      top_blocker: "Fatigue en fin de journée",
      likely_need: "simplify",
      upcoming_event: "Entretien professionnel le 25/03",
      proactive_risk: "low",
    },
    evidence_refs: {
      message_ids: ["msg-1", "msg-3", "msg-4"],
      event_ids: ["evt-1"],
    },
  };
}

// =========================================================================
// Validator tests
// =========================================================================

Deno.test("validator: valid output passes", () => {
  const input = makeInput();
  const raw = makeValidRawOutput();

  const result = validateConversationPulseOutput(raw, input, NOW);
  assert(result.valid);
  assertEquals(result.pulse.tone.dominant, "mixed");
  assertEquals(result.pulse.signals.likely_need, "simplify");
  assertEquals(result.pulse.evidence_refs.message_ids.length, 3);
  assertEquals(result.pulse.evidence_refs.event_ids.length, 1);
  assertEquals(result.pulse.version, 1);
  assertEquals(result.pulse.window_days, 7);
  assertEquals(result.pulse.generated_at, NOW);
});

Deno.test("validator: null input → fallback pulse", () => {
  const input = makeInput();
  const result = validateConversationPulseOutput(null, input, NOW);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("not an object")));
  assertEquals(result.pulse.tone.dominant, "mixed");
  assertEquals(result.pulse.signals.likely_need, "silence");
});

Deno.test("validator: invalid enum values → corrected with violations", () => {
  const input = makeInput();
  const raw = {
    ...makeValidRawOutput(),
    tone: {
      dominant: "neutral",
      emotional_load: "extreme",
      relational_openness: "open",
    },
    signals: {
      top_blocker: null,
      likely_need: "encourage",
      upcoming_event: null,
      proactive_risk: "low",
    },
  };

  const result = validateConversationPulseOutput(raw, input, NOW);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("tone.dominant")));
  assert(result.violations.some((v) => v.includes("tone.emotional_load")));
  assert(result.violations.some((v) => v.includes("signals.likely_need")));
  assertEquals(result.pulse.tone.dominant, "mixed");
  assertEquals(result.pulse.tone.emotional_load, "medium");
  assertEquals(result.pulse.signals.likely_need, "silence");
});

Deno.test("validator: highlights over cap → clamped with violation", () => {
  const input = makeInput();
  const raw = makeValidRawOutput();
  (raw.highlights as Record<string, unknown>).wins = [
    "win1",
    "win2",
    "win3",
    "win4",
    "win5",
  ];

  const result = validateConversationPulseOutput(raw, input, NOW);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("wins exceeds cap")));
  assertEquals(result.pulse.highlights.wins.length, 3);
});

Deno.test("validator: evidence_refs filtered to input IDs only", () => {
  const input = makeInput();
  const raw = makeValidRawOutput();
  (raw.evidence_refs as Record<string, unknown>).message_ids = [
    "msg-1",
    "msg-999",
    "msg-3",
  ];
  (raw.evidence_refs as Record<string, unknown>).event_ids = [
    "evt-1",
    "evt-unknown",
  ];

  const result = validateConversationPulseOutput(raw, input, NOW);
  assert(!result.valid);
  assertEquals(result.pulse.evidence_refs.message_ids, [
    "msg-1",
    "msg-2",
    "msg-3",
  ]);
  assertEquals(result.pulse.evidence_refs.event_ids, ["evt-1"]);
});

Deno.test("validator: missing trajectory.summary → violation", () => {
  const input = makeInput();
  const raw = makeValidRawOutput();
  (raw.trajectory as Record<string, unknown>).summary = "";

  const result = validateConversationPulseOutput(raw, input, NOW);
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("trajectory.summary")));
});

Deno.test("validator: last_72h_weight computed from input", () => {
  const input = makeInput({ messages_last_72h_count: 3 });
  const raw = makeValidRawOutput();

  const result = validateConversationPulseOutput(raw, input, NOW);
  assert(result.valid);
  assertEquals(result.pulse.last_72h_weight, 0.75);
});

Deno.test("validator: zero messages → weight 0", () => {
  const input = makeInput({ messages: [], messages_last_72h_count: 0 });
  const raw = makeValidRawOutput();
  (raw.evidence_refs as Record<string, unknown>).message_ids = [];

  const result = validateConversationPulseOutput(raw, input, NOW);
  assert(!result.valid);
  assertEquals(result.pulse.last_72h_weight, 0);
  assertEquals(result.pulse.trajectory.direction, "flat");
  assertEquals(result.pulse.signals.likely_need, "silence");
});

Deno.test("validator: <3 messages forces low flat silence", () => {
  const input = makeInput({
    messages: makeInput().messages.slice(0, 2),
    messages_last_72h_count: 2,
  });
  const raw = makeValidRawOutput();
  (raw.trajectory as Record<string, unknown>).direction = "up";
  (raw.trajectory as Record<string, unknown>).confidence = "high";
  (raw.signals as Record<string, unknown>).likely_need = "push";
  (raw.evidence_refs as Record<string, unknown>).message_ids = [
    "msg-1",
    "msg-2",
  ];

  const result = validateConversationPulseOutput(raw, input, NOW);
  assert(!result.valid);
  assertEquals(result.pulse.trajectory.direction, "flat");
  assertEquals(result.pulse.trajectory.confidence, "low");
  assertEquals(result.pulse.signals.likely_need, "silence");
});

Deno.test("validator: evidence_refs under minimum backfills recent message ids", () => {
  const input = makeInput();
  const raw = makeValidRawOutput();
  (raw.evidence_refs as Record<string, unknown>).message_ids = ["msg-1"];

  const result = validateConversationPulseOutput(raw, input, NOW);
  assert(!result.valid);
  assert(
    result.violations.some((v) => v.includes("under minimum")),
  );
  assertEquals(result.pulse.evidence_refs.message_ids, [
    "msg-1",
    "msg-2",
    "msg-3",
  ]);
});

Deno.test("validator: missing caps on support and tensions are enforced", () => {
  const input = makeInput();
  const raw = makeValidRawOutput();
  (raw.highlights as Record<string, unknown>).support_that_helped = [
    "s1",
    "s2",
    "s3",
    "s4",
  ];
  (raw.highlights as Record<string, unknown>).unresolved_tensions = [
    "t1",
    "t2",
    "t3",
    "t4",
  ];
  (raw.evidence_refs as Record<string, unknown>).event_ids = [
    "evt-1",
    "evt-2",
    "evt-3",
    "evt-4",
  ];

  const result = validateConversationPulseOutput(raw, input, NOW);
  assert(!result.valid);
  assert(
    result.violations.some((v) =>
      v.includes("support_that_helped exceeds cap")
    ),
  );
  assert(
    result.violations.some((v) =>
      v.includes("unresolved_tensions exceeds cap")
    ),
  );
  assert(result.violations.some((v) => v.includes("event_ids exceeds cap")));
  assertEquals(result.pulse.highlights.support_that_helped.length, 3);
  assertEquals(result.pulse.highlights.unresolved_tensions.length, 3);
  assertEquals(result.pulse.evidence_refs.event_ids.length, 1);
});

Deno.test("validator: last_72h_weight is clamped to 1", () => {
  const input = makeInput({ messages_last_72h_count: 999 });
  const raw = makeValidRawOutput();

  const result = validateConversationPulseOutput(raw, input, NOW);
  assert(result.valid);
  assertEquals(result.pulse.last_72h_weight, 1);
});

Deno.test("validator: all five tone.dominant values accepted", () => {
  const input = makeInput();
  for (const dom of ["steady", "hopeful", "mixed", "strained", "closed"]) {
    const raw = makeValidRawOutput();
    (raw.tone as Record<string, unknown>).dominant = dom;
    const result = validateConversationPulseOutput(raw, input, NOW);
    assert(result.valid, `expected ${dom} to be valid`);
    assertEquals(result.pulse.tone.dominant, dom);
  }
});

Deno.test("validator: all five likely_need values accepted", () => {
  const input = makeInput();
  for (const need of ["push", "simplify", "support", "silence", "repair"]) {
    const raw = makeValidRawOutput();
    (raw.signals as Record<string, unknown>).likely_need = need;
    const result = validateConversationPulseOutput(raw, input, NOW);
    assert(result.valid, `expected ${need} to be valid`);
    assertEquals(result.pulse.signals.likely_need, need);
  }
});

// =========================================================================
// LLM response parser tests
// =========================================================================

Deno.test("parseLLMResponse: valid JSON embedded in text", () => {
  const input = makeInput();
  const json = JSON.stringify(makeValidRawOutput());
  const text = `Here is the analysis:\n\n${json}\n\nDone.`;

  const result = parseConversationPulseLLMResponse(text, input, NOW);
  assert(result.valid);
  assertEquals(result.pulse.tone.dominant, "mixed");
});

Deno.test("parseLLMResponse: garbage → fallback", () => {
  const input = makeInput();
  const result = parseConversationPulseLLMResponse(
    "not json at all",
    input,
    NOW,
  );
  assert(!result.valid);
  assertEquals(result.pulse.tone.dominant, "mixed");
  assertEquals(result.pulse.signals.likely_need, "silence");
});

Deno.test("parseLLMResponse: no JSON braces → fallback", () => {
  const input = makeInput();
  const result = parseConversationPulseLLMResponse(
    "Just some text without any json",
    input,
    NOW,
  );
  assert(!result.valid);
  assert(result.violations.some((v) => v.includes("no JSON object")));
});

// =========================================================================
// User prompt builder tests
// =========================================================================

Deno.test("buildUserPrompt: includes messages and metadata", () => {
  const input = makeInput();
  const prompt = buildConversationPulseUserPrompt(input);

  assert(prompt.includes("2026-03-24"));
  assert(prompt.includes("4 messages"));
  assert(prompt.includes("4 dans les dernières 72h"));
  assert(prompt.includes("id=msg-1"));
  assert(prompt.includes("J'ai bien médité ce matin"));
  assert(prompt.includes("Méditation OK, course manquée"));
  assert(prompt.includes("id=evt-1"));
  assert(prompt.includes("Entretien professionnel"));
});

Deno.test("buildUserPrompt: no bilans/events → no sections", () => {
  const input = makeInput({
    recent_bilans: [],
    event_memories: [],
  });
  const prompt = buildConversationPulseUserPrompt(input);

  assert(!prompt.includes("Bilans récents"));
  assert(!prompt.includes("Événements proches"));
});
