import { assertEquals, assert } from "jsr:@std/assert@1";

import {
  buildWeeklyConversationDigestUserPrompt,
  parseWeeklyConversationDigestLLMResponse,
  validateWeeklyConversationDigestOutput,
  type WeeklyConversationDigestInput,
} from "./weekly-conversation-digest.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = "2026-03-24T18:00:00Z";
const WEEK_START = "2026-03-17";

function makeInput(
  overrides: Partial<WeeklyConversationDigestInput> = {},
): WeeklyConversationDigestInput {
  return {
    messages: [
      {
        id: "msg-1",
        role: "user",
        text: "J'ai repris la méditation ce matin, ça m'a fait du bien",
        created_at: "2026-03-17T08:00:00Z",
      },
      {
        id: "msg-2",
        role: "assistant",
        text: "C'est super que tu aies repris !",
        created_at: "2026-03-17T08:01:00Z",
      },
      {
        id: "msg-3",
        role: "user",
        text: "Journée difficile, pas réussi à faire l'exercice",
        created_at: "2026-03-18T19:00:00Z",
      },
      {
        id: "msg-4",
        role: "assistant",
        text: "C'est normal, une journée à la fois",
        created_at: "2026-03-18T19:01:00Z",
      },
      {
        id: "msg-5",
        role: "user",
        text: "Méditation + course ce matin ! Je me sens fort",
        created_at: "2026-03-19T07:30:00Z",
      },
      {
        id: "msg-6",
        role: "user",
        text: "Le déménagement me stresse, j'ai tout lâché aujourd'hui",
        created_at: "2026-03-20T20:00:00Z",
      },
      {
        id: "msg-7",
        role: "user",
        text: "Bon j'ai quand même fait 10 min de méditation",
        created_at: "2026-03-21T22:00:00Z",
      },
      {
        id: "msg-8",
        role: "user",
        text: "Week-end tranquille, j'ai rattrapé",
        created_at: "2026-03-23T10:00:00Z",
      },
    ],
    daily_bilans: [
      {
        date: "2026-03-18",
        mode: "check_light",
        target_items: ["Méditation"],
        outcome: "Méditation OK, course manquée",
      },
      {
        date: "2026-03-20",
        mode: "check_blocker",
        target_items: ["Exercice physique"],
        outcome: "Blocage déménagement",
      },
    ],
    event_memories: [
      {
        id: "evt-1",
        title: "Déménagement",
        date: "2026-03-22",
        relevance: "Source de stress mentionnée plusieurs fois",
      },
    ],
    latest_pulse: {
      tone_dominant: "mixed",
      trajectory_direction: "flat",
      trajectory_summary: "Semaine en dents de scie",
      likely_need: "simplify",
      wins: ["Reprise méditation"],
      friction_points: ["Déménagement perturbe le rythme"],
    },
    week_start: WEEK_START,
    local_date: "2026-03-24",
    message_count: 6,
    active_days: 5,
    ...overrides,
  };
}

function makeValidRawOutput(): Record<string, unknown> {
  return {
    dominant_tone: "fatigue mêlée de détermination",
    tone_evolution: "bon début lundi, creux jeudi, léger rebond week-end",
    best_traction_moments: [
      "Méditation + course mercredi matin avec fierté",
      "10 min de méditation vendredi malgré le stress",
    ],
    closure_fatigue_moments: [
      "Tout lâché jeudi à cause du déménagement",
    ],
    most_real_blockage:
      "Le déménagement imminent absorbe toute l'énergie disponible",
    support_that_helped:
      "La méditation courte (10 min) comme filet de sécurité les jours difficiles",
    main_risk_next_week:
      "Le déménagement n'est pas fini — risque de rechute complète",
    relational_opportunity:
      "L'utilisateur s'ouvre davantage le matin, réponses plus courtes le soir",
    confidence: "high",
  };
}

// ---------------------------------------------------------------------------
// User prompt builder
// ---------------------------------------------------------------------------

Deno.test("buildWeeklyConversationDigestUserPrompt includes all sections", () => {
  const input = makeInput();
  const prompt = buildWeeklyConversationDigestUserPrompt(input);

  assert(prompt.includes(`Semaine du ${WEEK_START}`));
  assert(prompt.includes("6 messages user"));
  assert(prompt.includes("5 jours actifs"));
  assert(prompt.includes("repris la méditation"));
  assert(prompt.includes("Bilans quotidiens de la semaine"));
  assert(prompt.includes("check_blocker"));
  assert(prompt.includes("Déménagement"));
  assert(prompt.includes("Dernier conversation pulse"));
  assert(prompt.includes("trajectory=flat"));
});

Deno.test("buildWeeklyConversationDigestUserPrompt omits empty sections", () => {
  const input = makeInput({
    daily_bilans: [],
    event_memories: [],
    latest_pulse: null,
  });
  const prompt = buildWeeklyConversationDigestUserPrompt(input);

  assert(!prompt.includes("Bilans quotidiens"));
  assert(!prompt.includes("Événements proches"));
  assert(!prompt.includes("Dernier conversation pulse"));
});

// ---------------------------------------------------------------------------
// Validator — valid output
// ---------------------------------------------------------------------------

Deno.test("validateWeeklyConversationDigestOutput accepts valid output", () => {
  const input = makeInput();
  const result = validateWeeklyConversationDigestOutput(
    makeValidRawOutput(),
    input,
    NOW,
  );

  assert(result.valid);
  assertEquals(result.digest.version, 1);
  assertEquals(result.digest.week_start, WEEK_START);
  assertEquals(result.digest.generated_at, NOW);
  assertEquals(result.digest.dominant_tone, "fatigue mêlée de détermination");
  assertEquals(result.digest.confidence, "high");
  assertEquals(result.digest.message_count, 6);
  assertEquals(result.digest.active_days, 5);
  assertEquals(result.digest.best_traction_moments.length, 2);
  assertEquals(result.digest.closure_fatigue_moments.length, 1);
  assert(result.digest.most_real_blockage !== null);
  assert(result.digest.relational_opportunity !== null);
});

// ---------------------------------------------------------------------------
// Validator — clamping
// ---------------------------------------------------------------------------

Deno.test("validator clamps strings and arrays beyond caps", () => {
  const input = makeInput();
  const raw = {
    ...makeValidRawOutput(),
    dominant_tone: "a".repeat(80),
    best_traction_moments: ["a", "b", "c", "d", "e"],
    closure_fatigue_moments: ["x", "y", "z", "w"],
  };

  const result = validateWeeklyConversationDigestOutput(raw, input, NOW);

  assert(!result.valid);
  assert(result.digest.dominant_tone.length <= 50);
  assertEquals(result.digest.best_traction_moments.length, 3);
  assertEquals(result.digest.closure_fatigue_moments.length, 3);
});

// ---------------------------------------------------------------------------
// Validator — confidence coherence
// ---------------------------------------------------------------------------

Deno.test("validator forces low confidence when message_count < 5", () => {
  const input = makeInput({ message_count: 4, active_days: 2 });
  const raw = {
    ...makeValidRawOutput(),
    confidence: "high",
    most_real_blockage: "Blocage qui devrait etre neutralise en low data",
    support_that_helped: "Support qui devrait etre neutralise en low data",
    main_risk_next_week: "Risque qui devrait etre neutralise en low data",
    relational_opportunity:
      "Observation relationnelle qui devrait etre neutralisee en low data",
  };

  const result = validateWeeklyConversationDigestOutput(raw, input, NOW);

  assert(!result.valid);
  assertEquals(result.digest.confidence, "low");
  assertEquals(result.digest.most_real_blockage, null);
  assertEquals(result.digest.support_that_helped, null);
  assertEquals(result.digest.main_risk_next_week, null);
  assertEquals(result.digest.relational_opportunity, null);
  const violations = (result as { violations: string[] }).violations;
  assert(violations.some((v) => v.includes("forces confidence=low")));
  assert(violations.some((v) => v.includes("nullable insight fields to null")));
});

// ---------------------------------------------------------------------------
// Validator — silent week
// ---------------------------------------------------------------------------

Deno.test("validator enforces silent week digest when message_count < 3", () => {
  const input = makeInput({ message_count: 2, active_days: 1 });
  const raw = {
    ...makeValidRawOutput(),
    dominant_tone: "forte agitation",
    tone_evolution: "montée de tension puis redescente",
    best_traction_moments: ["something"],
  };

  const result = validateWeeklyConversationDigestOutput(raw, input, NOW);

  assert(!result.valid);
  assertEquals(result.digest.dominant_tone, "silence");
  assertEquals(result.digest.tone_evolution, "peu d'échanges cette semaine");
  assertEquals(result.digest.best_traction_moments.length, 0);
  assertEquals(result.digest.closure_fatigue_moments.length, 0);
  assertEquals(result.digest.most_real_blockage, null);
  assertEquals(result.digest.support_that_helped, null);
  assertEquals(result.digest.confidence, "low");
});

// ---------------------------------------------------------------------------
// Validator — null object fallback
// ---------------------------------------------------------------------------

Deno.test("validator returns fallback digest on null input", () => {
  const input = makeInput();
  const result = validateWeeklyConversationDigestOutput(null, input, NOW);

  assert(!result.valid);
  assertEquals(result.digest.version, 1);
  assertEquals(result.digest.week_start, WEEK_START);
  assertEquals(result.digest.confidence, "low");
});

// ---------------------------------------------------------------------------
// Validator — missing fields
// ---------------------------------------------------------------------------

Deno.test("validator handles missing optional fields gracefully", () => {
  const input = makeInput();
  const raw = {
    dominant_tone: "tension",
    tone_evolution: "montée progressive",
    confidence: "medium",
  };

  const result = validateWeeklyConversationDigestOutput(raw, input, NOW);

  assert(result.valid);
  assertEquals(result.digest.best_traction_moments, []);
  assertEquals(result.digest.most_real_blockage, null);
  assertEquals(result.digest.support_that_helped, null);
});

// ---------------------------------------------------------------------------
// JSON parse helper
// ---------------------------------------------------------------------------

Deno.test("parseWeeklyConversationDigestLLMResponse extracts JSON from text", () => {
  const input = makeInput();
  const json = JSON.stringify(makeValidRawOutput());
  const text = `Here is the result:\n${json}\nDone.`;

  const result = parseWeeklyConversationDigestLLMResponse(text, input, NOW);

  assert(result.valid);
  assertEquals(result.digest.dominant_tone, "fatigue mêlée de détermination");
});

Deno.test("parseWeeklyConversationDigestLLMResponse returns fallback on garbage", () => {
  const input = makeInput();
  const result = parseWeeklyConversationDigestLLMResponse(
    "this is not json at all",
    input,
    NOW,
  );

  assert(!result.valid);
  assertEquals(result.digest.confidence, "low");
  const violations = (result as { violations: string[] }).violations;
  assert(violations.some((v) => v.includes("no JSON object")));
});

Deno.test("parseWeeklyConversationDigestLLMResponse returns fallback on invalid JSON", () => {
  const input = makeInput();
  const result = parseWeeklyConversationDigestLLMResponse(
    "{ broken json",
    input,
    NOW,
  );

  assert(!result.valid);
  assertEquals(result.digest.confidence, "low");
});

// ---------------------------------------------------------------------------
// Regression: nullable string fields with empty strings
// ---------------------------------------------------------------------------

Deno.test("validator normalizes empty strings to null for nullable fields", () => {
  const input = makeInput();
  const raw = {
    ...makeValidRawOutput(),
    most_real_blockage: "",
    support_that_helped: "   ",
    main_risk_next_week: "",
    relational_opportunity: "  \n  ",
  };

  const result = validateWeeklyConversationDigestOutput(raw, input, NOW);

  assertEquals(result.digest.most_real_blockage, null);
  assertEquals(result.digest.support_that_helped, null);
  assertEquals(result.digest.main_risk_next_week, null);
  assertEquals(result.digest.relational_opportunity, null);
});
