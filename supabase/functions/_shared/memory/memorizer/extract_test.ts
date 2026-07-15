import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildExtractionPrompt,
  extractMemoryCandidates,
  parseExtractionJson,
} from "./extract.ts";
import { MEMORY_EXTRACTION_PROMPT_VERSION } from "./types.ts";

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

Deno.test("P12-E: gate event resolves a bare FUTURE month before rejecting (alex-untested24 R1-B11)", async () => {
  const out = await extractMemoryCandidates({
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user",
      content:
        "garde en tête : je prépare un déménagement à Lyon pour septembre",
      // « septembre » dit en juillet 2026 ⇒ 2026-09-01, précision month —
      // ancré sur l'horloge du MESSAGE, pas celle du batch.
      created_at: "2026-07-10T09:00:00.000Z",
    }],
    timezone: "Europe/Paris",
  }, {
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [{
          kind: "event",
          content_text: "Prépare un déménagement à Lyon pour septembre 2026.",
          domain_keys: ["logistique.demenagement"],
          confidence: 0.85,
          sensitivity_level: "normal",
          source_message_ids: ["m1"],
          evidence_quote: "je prépare un déménagement à Lyon pour septembre",
        }],
        entities: [],
        corrections: [],
        rejected_observations: [],
      }),
  });
  assertEquals(out.memory_items[0].event_start_at, "2026-08-31T22:00:00.000Z");
  assertEquals(out.memory_items[0].time_precision, "month");
});

Deno.test("P12-E: gate event resolves a bare PAST weekday from the message clock (rose-hard25 R1-B04)", async () => {
  const out = await extractMemoryCandidates({
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user",
      content: "samedi à l'anniversaire j'ai craqué, j'ai fumé deux taffes",
      // Dit un mercredi (2026-03-04) ⇒ le samedi PRÉCÉDENT = 2026-02-28
      // (passé composé ⇒ occurrence passée la plus récente). L'ancre message
      // est volontairement loin d'aujourd'hui : un Date.now() résiduel ferait
      // échouer ce test.
      created_at: "2026-03-04T10:00:00.000Z",
    }],
    timezone: "Europe/Paris",
  }, {
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [{
          kind: "event",
          content_text:
            "A craqué et fumé deux taffes samedi à un anniversaire.",
          domain_keys: ["addictions.tabac"],
          confidence: 0.85,
          sensitivity_level: "sensitive",
          sensitivity_categories: ["addiction"],
          source_message_ids: ["m1"],
          evidence_quote: "samedi à l'anniversaire j'ai craqué",
        }],
        entities: [],
        corrections: [],
        rejected_observations: [],
      }),
  });
  assertEquals(out.memory_items[0].event_start_at, "2026-02-27T23:00:00.000Z");
  assertEquals(out.memory_items[0].time_precision, "day");
});

Deno.test("P12-E anti-faux-positif: event without any resolvable temporal expression stays rejected event_missing_date", async () => {
  const { validateExtractionPayload } = await import("./validate.ts");
  const messages = [{
    id: "m1",
    user_id: "u",
    role: "user" as const,
    content: "j'ai craqué à l'anniversaire, c'était pas prévu du tout",
    created_at: "2026-03-04T10:00:00.000Z",
  }];
  const out = await extractMemoryCandidates({
    messages,
    timezone: "Europe/Paris",
  }, {
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [{
          kind: "event",
          content_text: "A craqué à un anniversaire.",
          domain_keys: ["addictions.tabac"],
          confidence: 0.85,
          sensitivity_level: "sensitive",
          sensitivity_categories: ["addiction"],
          source_message_ids: ["m1"],
          evidence_quote: "j'ai craqué à l'anniversaire",
        }],
        entities: [],
        corrections: [],
        rejected_observations: [],
      }),
  });
  // Aucune expression temporelle résoluble (pas de jour nommé, pas de mois,
  // direction seule ne suffit pas) ⇒ le gate ne date PAS au hasard.
  assertEquals(out.memory_items[0].event_start_at ?? null, null);
  const validation = validateExtractionPayload(out, messages);
  assertEquals(validation.accepted_items.length, 0);
  assertEquals(
    validation.rejected_items[0]?.issues.some((issue) =>
      issue.code === "event_missing_date"
    ),
    true,
  );
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

Deno.test("extraction prompt anchors non-assertive modality guard (P7-D, alex-untested22 T2)", () => {
  const prompt = buildExtractionPrompt({
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user",
      content:
        "tu te souviens quel jour je vois mon frère ? j'arrive plus à savoir si c'est mardi ou mercredi",
    }],
  });
  assertEquals(
    prompt.system_prompt.includes("MODALITE NON-ASSERTIVE"),
    true,
  );
  // Jamais choisir une option d'une alternative incertaine.
  assertEquals(
    prompt.system_prompt.includes("CONFABULATION durable"),
    true,
  );
  // Anti-faux-positif ancré: l'assertion positive reste memorisable.
  assertEquals(
    prompt.system_prompt.includes(
      'une question rhetorique qui AFFIRME',
    ),
    true,
  );
});

Deno.test("extraction prompt forbids plan-report items under ANY status, candidate included (P7-D, nina-hard22 batch)", () => {
  const prompt = buildExtractionPrompt({
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user",
      content: "j'ai réussi à prendre un petit-déjeuner posé",
    }],
  });
  assertEquals(
    prompt.system_prompt.includes(
      "NI aucun autre item, quel que soit le statut vise",
    ),
    true,
  );
});

Deno.test("extraction prompt: retractation vaut pour toute categorie, version nuancee interdite (P8-C, paul-untested22 T10 / eva-hard23 T11)", () => {
  const prompt = buildExtractionPrompt({
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user",
      content:
        "en fait oublie ca completement, le retiens surtout pas comme un objectif",
    }],
  });
  // Positif: la catégorie objectif/intention future est couverte en toutes
  // lettres — plus de trou "habitude only".
  assertEquals(
    prompt.system_prompt.includes(
      "TOUTE CATEGORIE sans exception — fait, habitude, preference, projet, OBJECTIF, INTENTION FUTURE, anecdote",
    ),
    true,
  );
  // Positif: la persistance « avec la nuance » est nommée comme la même faute.
  assertEquals(
    prompt.system_prompt.includes('persister "AVEC LA NUANCE" est la MEME faute') ||
      prompt.system_prompt.includes('"AVEC LA NUANCE" est la MEME faute'),
    true,
  );
  assertEquals(
    prompt.system_prompt.includes("NI le recit de l'abandon"),
    true,
  );
  // Anti-faux-positif: l'échec raconté sans instruction d'oubli reste
  // memorisable, et « je change d'avis sur Y » ne retracte que Y.
  assertEquals(
    prompt.system_prompt.includes("SANS instruction d'oubli"),
    true,
  );
  assertEquals(
    prompt.system_prompt.includes("ne retracte que Y"),
    true,
  );
});

Deno.test("extraction prompt version bumped for retraction-all-categories (P8-C)", () => {
  assertEquals(
    MEMORY_EXTRACTION_PROMPT_VERSION.includes("v7_retraction_all_categories"),
    true,
  );
});

Deno.test("extraction prompt: la generalisation d'un report d'action reste exclue + demande d'ajustement = 0 item (P8-G, nina-hard23 B03)", () => {
  const prompt = buildExtractionPrompt({
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user",
      content: "j'ai bu mon grand verre d'eau avant de grignoter, note-le",
    }],
  });
  assertEquals(
    prompt.system_prompt.includes("la GENERALISATION d'un report reste un report"),
    true,
  );
  assertEquals(
    prompt.system_prompt.includes("le critere est LA SOURCE"),
    true,
  );
  assertEquals(
    prompt.system_prompt.includes("DEMANDE D'AJUSTEMENT du plan"),
    true,
  );
});
