import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildExtractionPrompt,
  extractMemoryCandidates,
  parseExtractionJson,
} from "./extract.ts";

Deno.test("extract parser accepts strict JSON payload", () => {
  const parsed = parseExtractionJson(JSON.stringify({
    memory_items: [{
      kind: "statement",
      content_text: "Le user dit avoir peur.",
      domain_keys: ["psychologie.emotions"],
      confidence: 0.8,
      sensitivity_level: "sensitive",
      source_message_ids: ["m1"],
    }],
    entities: [],
    corrections: [],
    rejected_observations: [],
  }));
  assertEquals(parsed.memory_items[0].kind, "statement");
});

Deno.test("extract parser normalizes recoverable preference-shaped payload", () => {
  const parsed = parseExtractionJson(JSON.stringify({
    memory_items: [{
      kind: "preference",
      preference:
        "Le user prefere demarrer par une version brouillon de 4 minutes quand il bloque sur une presentation.",
      summary: "Preference de demarrage par brouillon 4 minutes.",
      domain_keys: ["habitudes.execution"],
      confidence: "high",
      sensitivity_level: "normal",
      source_message_ids: ["m1"],
    }],
    entities: [],
    corrections: [],
    rejected_observations: [],
  }));
  assertEquals(parsed.memory_items[0].kind, "statement");
  assertEquals(
    parsed.memory_items[0].content_text,
    "Le user prefere demarrer par une version brouillon de 4 minutes quand il bloque sur une presentation.",
  );
  assertEquals(parsed.memory_items[0].confidence, 0.82);
});

Deno.test("extract parser rejects invalid JSON", () => {
  assertThrows(
    () => parseExtractionJson("not-json"),
    Error,
    "memory_v2_extraction_invalid_json",
  );
});

Deno.test("extract builds prompt and uses injectable provider", async () => {
  const prompt = buildExtractionPrompt({
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user",
      content: "Hier j'ai marche.",
    }],
  });
  assertEquals(prompt.user_payload.includes("domain_keys_taxonomy"), true);
  const out = await extractMemoryCandidates({
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user",
      content: "Hier j'ai marche.",
    }],
  }, {
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [],
        entities: [],
        corrections: [],
        rejected_observations: [{ reason: "small_talk", text: "x" }],
      }),
  });
  assertEquals(out.rejected_observations.length, 1);
});

Deno.test("extract fills missing event dates from source temporal hints", async () => {
  const out = await extractMemoryCandidates({
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user",
      content: "Hier soir j'ai marche 27 minutes apres le diner.",
    }],
    timezone: "Europe/Paris",
  }, {
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [{
          kind: "event",
          content_text: "A marche 27 minutes apres le diner hier soir.",
          domain_keys: ["sante.activite_physique"],
          confidence: 0.8,
          sensitivity_level: "normal",
          source_message_ids: ["m1"],
        }],
        entities: [],
        corrections: [],
        rejected_observations: [],
      }),
  });

  assertEquals(Boolean(out.memory_items[0].event_start_at), true);
  assertEquals(out.memory_items[0].time_precision, "part_of_day");
});

Deno.test("extract promotes dated completed action observations to events", async () => {
  const out = await extractMemoryCandidates({
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user",
      content: "Hier soir j'ai marche 27 minutes apres le diner.",
    }],
    timezone: "Europe/Paris",
  }, {
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [{
          kind: "action_observation",
          content_text: "L'utilisateur a marche 27 minutes apres le diner.",
          domain_keys: ["sante.activite_physique"],
          confidence: 0.8,
          sensitivity_level: "normal",
          source_message_ids: ["m1"],
        }],
        entities: [],
        corrections: [],
        rejected_observations: [],
      }),
  });

  assertEquals(out.memory_items[0].kind, "event");
  assertEquals(Boolean(out.memory_items[0].event_start_at), true);
  assertEquals(out.memory_items[0].time_precision, "part_of_day");
  assertEquals(
    out.memory_items[0].metadata?.promoted_from_kind,
    "action_observation",
  );
});

Deno.test("extract normalizes sensitivity category aliases", () => {
  const parsed = parseExtractionJson(JSON.stringify({
    memory_items: [{
      kind: "statement",
      content_text: "Le user mentionne du cannabis.",
      domain_keys: ["addictions.cannabis"],
      confidence: 0.8,
      sensitivity_level: "sensitive",
      sensitivity_categories: ["addictions.cannabis"],
      source_message_ids: ["m1"],
    }],
    entities: [],
    corrections: [],
    rejected_observations: [],
  }));

  assertEquals(parsed.memory_items[0].sensitivity_categories, ["addiction"]);
});

Deno.test("extraction prompt anchors future dated confided facts and contested claims (alex-r4 B04/B06)", () => {
  const prompt = buildExtractionPrompt({
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user",
      content: "Garde en tete: le 20 juillet je pars 4 jours chez ma mere.",
    }],
  });
  assertEquals(
    prompt.system_prompt.includes("FAIT FUTUR DATE CONFIE"),
    true,
  );
  assertEquals(
    prompt.system_prompt.includes("persistance OBLIGATOIRE"),
    true,
  );
  assertEquals(
    prompt.system_prompt.includes("CROYANCE CONTESTEE DANS L'ECHANGE"),
    true,
  );
  assertEquals(
    prompt.system_prompt.includes("jamais comme fait actif non qualifie") ||
      prompt.system_prompt.includes("ne la persiste JAMAIS comme fait actif"),
    true,
  );
});
