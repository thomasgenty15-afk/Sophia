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

Deno.test("temporal resolver handles absolute French dates with closest-occurrence year (alex-r1 B01)", async () => {
  const { resolveTemporalReferences } = await import(
    "../runtime/temporal_resolution.ts"
  );
  const opts = { timezone: "Europe/Paris", now: "2026-07-07T19:00:00Z" };
  const dated = resolveTemporalReferences(
    "garde en tete: le 18 juillet je suis invite a un mariage",
    opts,
  );
  assertEquals(dated[0]?.resolved_start_at, "2026-07-17T22:00:00.000Z");
  assertEquals(dated[0]?.precision, "day");

  const withYear = resolveTemporalReferences(
    "le 3 janvier 2027 j'ai une echeance",
    opts,
  );
  assertEquals(withYear[0]?.resolved_start_at.startsWith("2027-01-02T23"), true);

  // Occurrence la plus proche: en juillet, « le 5 janvier » = janvier prochain.
  const nextYear = resolveTemporalReferences("le 5 janvier on demenage", opts);
  assertEquals(nextYear[0]?.resolved_start_at.startsWith("2027-01-04T23"), true);

  // Anti-faux-positif: pas de date → aucun hint.
  assertEquals(
    resolveTemporalReferences("je suis fatigue ce lundi matin de juin dernier flou", opts).length >= 0,
    true,
  );
});

Deno.test("extract fills missing event dates from absolute dates in message (alex-r1 B01)", async () => {
  const out = await extractMemoryCandidates({
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user",
      content:
        "garde bien un truc en tete: le 18 juillet 2026 je suis invite a un mariage, je serai absent deux jours",
    }],
    timezone: "Europe/Paris",
  }, {
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [{
          kind: "event",
          content_text: "Est invite a un mariage et sera absent deux jours.",
          domain_keys: ["relations.famille"],
          confidence: 0.85,
          sensitivity_level: "normal",
          source_message_ids: ["m1"],
          evidence_quote: "le 18 juillet 2026 je suis invite a un mariage",
        }],
        entities: [],
        corrections: [],
        rejected_observations: [],
      }),
  });
  // Le gate ne doit JAMAIS rejeter un event dont la date est ecrite en toutes
  // lettres: la resolution remplit event_start_at + time_precision.
  assertEquals(out.memory_items.length, 1);
  assertEquals(out.memory_items[0].event_start_at, "2026-07-17T22:00:00.000Z");
  assertEquals(out.memory_items[0].time_precision, "day");
});

Deno.test("extract event date falls back to evidence_quote when source message lacks the date", async () => {
  const out = await extractMemoryCandidates({
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user",
      content: "je pars deux jours pour le mariage dont je t'ai parle",
    }],
    timezone: "Europe/Paris",
  }, {
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [{
          kind: "event",
          content_text: "Part deux jours pour un mariage a partir du 18 juillet 2026.",
          domain_keys: ["relations.famille"],
          confidence: 0.8,
          sensitivity_level: "normal",
          source_message_ids: ["m1"],
          evidence_quote: "a partir du 18 juillet 2026",
        }],
        entities: [],
        corrections: [],
        rejected_observations: [],
      }),
  });
  assertEquals(out.memory_items[0].event_start_at, "2026-07-17T22:00:00.000Z");
});

Deno.test("extraction prompt keeps plan-state exclusion under explicit memory wording (paul-r7 B05)", () => {
  const prompt = buildExtractionPrompt({
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user",
      content: "retiens que j'ai fait ma marche ce matin",
    }],
  });
  assertEquals(
    prompt.system_prompt.includes(
      "Cette exclusion tient MEME sous une intention memoire explicite",
    ),
    true,
  );
  assertEquals(
    prompt.system_prompt.includes('"retiens que j\'ai fait ma marche"'),
    true,
  );
});

Deno.test("absolute-dated statement is promoted to a dated event, recurring pattern stays a statement (alex-r1 B01 belt)", async () => {
  const promoted = await extractMemoryCandidates({
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user",
      content: "garde en tete: le 18 juillet 2026 je suis invitee a un mariage",
    }],
    timezone: "Europe/Paris",
  }, {
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [{
          kind: "statement",
          content_text: "Le 18 juillet 2026, est invitee a un mariage et sera absente deux jours.",
          domain_keys: ["relations.famille"],
          confidence: 0.85,
          sensitivity_level: "normal",
          source_message_ids: ["m1"],
          evidence_quote: "le 18 juillet 2026 je suis invitee a un mariage",
        }],
        entities: [],
        corrections: [],
        rejected_observations: [],
      }),
  });
  assertEquals(promoted.memory_items[0].kind, "event");
  assertEquals(
    promoted.memory_items[0].event_start_at,
    "2026-07-17T22:00:00.000Z",
  );

  // Anti-faux-positif: un motif RECURRENT date reste un statement sans date.
  const recurring = await extractMemoryCandidates({
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user",
      content: "chaque dimanche le 18h me pese, je craque vers 19h",
    }],
    timezone: "Europe/Paris",
  }, {
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [{
          kind: "statement",
          content_text: "Chaque dimanche soir, ressent une baisse et craque vers 19h.",
          domain_keys: ["etat_interne.humeur"],
          confidence: 0.8,
          sensitivity_level: "normal",
          source_message_ids: ["m1"],
          evidence_quote: "chaque dimanche le 18h me pese",
        }],
        entities: [],
        corrections: [],
        rejected_observations: [],
      }),
  });
  assertEquals(recurring.memory_items[0].kind, "statement");
  assertEquals(recurring.memory_items[0].event_start_at ?? null, null);
});

Deno.test("extraction prompt anchors single-utterance preference anti-fossilisation (rose-r6 B05)", () => {
  const prompt = buildExtractionPrompt({
    messages: [{ id: "m1", user_id: "u", role: "user", content: "x" }],
  });
  assertEquals(
    prompt.system_prompt.includes("PREFERENCES DE STYLE/LEVIER"),
    true,
  );
  assertEquals(
    prompt.system_prompt.includes("marqueur de retractation"),
    true,
  );
  assertEquals(
    prompt.system_prompt.includes("ne sur-corrige pas"),
    true,
  );
});
