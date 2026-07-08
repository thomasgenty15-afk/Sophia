import {
  assertEquals,
  assertObjectMatch,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { InMemoryMemorizerRepository } from "./memory_repo_test_utils.ts";
import { runMemorizerAsync } from "./memorizer_async.ts";

Deno.test("async memorizer persists active/candidate decisions and remains idempotent", async () => {
  const repo = new InMemoryMemorizerRepository();
  const input = {
    user_id: "u",
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user" as const,
      content: "J'ai pas fait ma marche hier soir.",
    }],
    known_topics: [{ id: "t1", slug: "marche_soir", title: "Marche du soir" }],
    active_topic: { id: "t1", slug: "marche_soir", title: "Marche du soir" },
    plan_signals: [{
      plan_item_id: "plan-walk",
      title: "marche",
      occurrence_ids: ["occ-1"],
    }],
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [{
          kind: "action_observation",
          content_text: "J'ai pas fait ma marche hier soir.",
          normalized_summary: "Le user n'a pas fait sa marche hier soir.",
          domain_keys: ["habitudes.execution"],
          confidence: 0.82,
          importance_score: 0.68,
          sensitivity_level: "normal",
          sensitivity_categories: [],
          source_message_ids: ["m1"],
          evidence_quote: "J'ai pas fait ma marche hier soir.",
          event_start_at: "2026-05-06T18:00:00.000+02:00",
          time_precision: "day",
          metadata: { observation_role: "single" },
        }],
        entities: [],
        corrections: [],
        rejected_observations: [],
      }),
  };
  const first = await runMemorizerAsync(repo, input);
  const second = await runMemorizerAsync(repo, input);
  assertEquals(first.status, "completed");
  assertEquals(first.persisted.length, 1);
  assertEquals(first.persisted[0].status, "active");
  assertEquals(second.status, "skipped");
  assertEquals(repo.memoryWrites.length, 1);
  assertEquals(repo.processing.length, 1);
});

Deno.test("async memorizer materializes canonical daily action entries without relying on LLM text extraction", async () => {
  const repo = new InMemoryMemorizerRepository();
  const result = await runMemorizerAsync(repo, {
    user_id: "u-daily",
    messages: [{
      id: "m-daily",
      user_id: "u-daily",
      role: "user" as const,
      content: "non creve",
      metadata: {
        structured_extraction_source: "daily_action_review_v1",
      },
    }],
    trigger_type: "daily_action_review_v1",
    plan_signals: [{
      plan_item_id: "plan-focus",
      title: "Session focus",
      kind: "habit",
      dimension: "habits",
      action_family_key: "habit:session_focus",
      occurrence_ids: ["entry-focus-1"],
      observation_window_start: "2026-05-11T12:00:00Z",
      observation_window_end: "2026-05-11T12:00:00Z",
      action_variant: {
        recent_entry_outcomes: [{
          outcome: "missed",
          entry_kind: "habit_checkin",
          effective_at: "2026-05-11T12:00:00Z",
        }],
      },
    }],
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [],
        entities: [],
        corrections: [],
        rejected_observations: [],
      }),
  });

  assertEquals(result.status, "completed");
  assertEquals(result.persisted.length, 1);
  assertEquals(result.persisted[0].candidate.item.kind, "action_observation");
  assertEquals(
    result.persisted[0].candidate.item.metadata?.structured_extraction_source,
    "daily_action_review_v1",
  );
  assertEquals(
    result.persisted[0].candidate.action_link?.plan_item_id,
    "plan-focus",
  );
  assertEquals(result.persisted[0].candidate.action_link?.occurrence_ids, [
    "entry-focus-1",
  ]);
});

Deno.test("async memorizer skips extraction when daily user cost cap is reached", async () => {
  const previous = Deno.env.get("memory_v2_memorizer_cost_cap_user_day_eur");
  Deno.env.set("memory_v2_memorizer_cost_cap_user_day_eur", "0.50");
  try {
    const repo = new InMemoryMemorizerRepository();
    repo.estimatedCostForUserDay = 0.75;
    const result = await runMemorizerAsync(repo, {
      user_id: "u-cost",
      messages: [{
        id: "m-cost",
        user_id: "u-cost",
        role: "user" as const,
        content:
          "Je veux retenir que mes dépenses émotionnelles explosent quand je travaille tard.",
      }],
      llm_provider: async () => {
        throw new Error("llm_should_not_be_called");
      },
    });

    assertEquals(result.status, "skipped");
    assertEquals(result.skip_reason, "cost_cap_exceeded");
    assertEquals(repo.memoryWrites.length, 0);
    assertEquals(repo.processing.length, 0);
    assertEquals(repo.runs[0].status, "skipped");
    assertObjectMatch(repo.runs[0].metadata ?? {}, {
      skip_reason: "cost_cap_exceeded",
      cost_cap_eur: 0.5,
      observed_cost_eur: 0.75,
    });
  } finally {
    if (previous === undefined) {
      Deno.env.delete("memory_v2_memorizer_cost_cap_user_day_eur");
    } else {
      Deno.env.set("memory_v2_memorizer_cost_cap_user_day_eur", previous);
    }
  }
});

Deno.test("async memorizer keeps messages re-eligible when extraction dies mid-flight, then recovers (BF-EFFECT-04)", async () => {
  // Scenario nina-r2/paul-r4: le worker meurt pendant l'extraction (timeout
  // gateway). AVANT le fix, les messages etaient deja marques `completed` →
  // le retry repondait no_unprocessed et la memoire du jour etait perdue.
  const repo = new InMemoryMemorizerRepository();
  const message = {
    id: "m1",
    user_id: "u",
    role: "user" as const,
    content: "J'ai pas fait ma marche hier soir.",
  };
  const failingInput = {
    user_id: "u",
    messages: [message],
    known_topics: [{ id: "t1", slug: "marche_soir", title: "Marche du soir" }],
    active_topic: { id: "t1", slug: "marche_soir", title: "Marche du soir" },
    plan_signals: [{
      plan_item_id: "plan-walk",
      title: "marche",
      occurrence_ids: ["occ-1"],
    }],
    llm_provider: async (): Promise<string> => {
      throw new Error("gateway timeout mid-extraction");
    },
  };
  let thrown: unknown = null;
  try {
    await runMemorizerAsync(repo, failingInput);
  } catch (error) {
    thrown = error;
  }
  assertEquals(thrown instanceof Error, true);
  // Invariant: AUCUN message marque traite tant que rien n'est persiste.
  assertEquals(repo.processing.length, 0);
  assertEquals(repo.memoryWrites.length, 0);

  // Reprise avec un provider sain: le meme batch redevient traitable.
  const retryInput = {
    ...failingInput,
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [{
          kind: "action_observation",
          content_text: "J'ai pas fait ma marche hier soir.",
          normalized_summary: "Le user n'a pas fait sa marche hier soir.",
          domain_keys: ["habitudes.execution"],
          confidence: 0.82,
          importance_score: 0.68,
          sensitivity_level: "normal",
          sensitivity_categories: [],
          source_message_ids: ["m1"],
          evidence_quote: "J'ai pas fait ma marche hier soir.",
          event_start_at: "2026-05-06T18:00:00.000+02:00",
          time_precision: "day",
          metadata: { observation_role: "single" },
        }],
        entities: [],
        corrections: [],
        rejected_observations: [],
      }),
  };
  const retry = await runMemorizerAsync(repo, retryInput);
  assertEquals(retry.status, "completed");
  assertEquals(repo.memoryWrites.length, 1);
  // Les messages ne sont marques qu'une fois le persist reussi.
  assertEquals(repo.processing.length, 1);
  assertEquals(repo.processing[0].processing_status, "completed");
});

Deno.test("intra-batch correction sees just-persisted items as supersede targets (alex-r2 B01)", async () => {
  // Fait (3x8) persiste dans CE lot + correction dans le meme lot: la
  // resolution de cible doit voir l'item tout juste persiste (avant le fix,
  // known_memory_items ne contenait que la DB → correction skipped, les deux
  // verites contradictoires restaient actives ensemble).
  const repo = new InMemoryMemorizerRepository();
  let capturedKnownItems: Array<{ id: string; content_text: string }> = [];
  (repo as any).applyCorrections = (args: {
    known_memory_items: Array<{ id: string; content_text: string }>;
  }) => {
    capturedKnownItems = args.known_memory_items;
    return Promise.resolve([]);
  };
  const result = await runMemorizerAsync(repo, {
    user_id: "u",
    messages: [
      {
        id: "m-old",
        user_id: "u",
        role: "user" as const,
        content:
          "Retiens que je bosse en horaires decales 3x8 a l'usine, mes horaires changent toutes les semaines.",
      },
      {
        id: "m-new",
        user_id: "u",
        role: "user" as const,
        content: "En fait je suis plus en horaires de nuit, poste de jour fixe.",
      },
    ],
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [{
          kind: "statement",
          content_text:
            "Je bosse en horaires decales 3x8, mes horaires changent toutes les semaines.",
          normalized_summary: "Travail en horaires decales 3x8.",
          domain_keys: ["travail.charge"],
          confidence: 0.85,
          importance_score: 0.6,
          sensitivity_level: "normal",
          sensitivity_categories: [],
          source_message_ids: ["m-old"],
          evidence_quote: "horaires decales 3x8",
          metadata: { statement_role: "life_context" },
        }],
        entities: [],
        corrections: [{
          operation_type: "supersede",
          target_hint: "horaires decales 3x8",
          reason: "correction du rythme de travail dans le meme lot",
          source_message_ids: ["m-new"],
        }],
        rejected_observations: [],
      }),
  } as never);
  assertEquals(result.status, "completed");
  assertEquals(result.persisted.length, 1);
  const oldPersisted = result.persisted[0];
  // La cible intra-lot est exposee a la resolution de correction avec l'id
  // REEL de l'item persiste.
  assertEquals(
    capturedKnownItems.some((known) =>
      known.id === oldPersisted.memory_item_id &&
      known.content_text.includes("3x8")
    ),
    true,
  );
});

Deno.test("correction never targets its own new-truth item from the same batch (alex-r3 B04 regression)", async () => {
  // Regression observee apres l'ouverture intra-lot: la resolution de cible
  // pouvait choisir l'item de NOUVELLE verite (meme message que la
  // correction) et, faute de remplacement, l'invalider orphelin
  // (`superseded_by=none`). L'item du lot partageant un source_message_id
  // avec une correction ne doit jamais etre expose comme cible.
  const repo = new InMemoryMemorizerRepository();
  let capturedKnownItems: Array<{ id: string; content_text: string }> = [];
  (repo as any).applyCorrections = (args: {
    known_memory_items: Array<{ id: string; content_text: string }>;
  }) => {
    capturedKnownItems = args.known_memory_items;
    return Promise.resolve([]);
  };
  const statement = (id: string, text: string) => ({
    kind: "statement",
    content_text: text,
    normalized_summary: text,
    domain_keys: ["travail.charge"],
    confidence: 0.85,
    importance_score: 0.6,
    sensitivity_level: "normal",
    sensitivity_categories: [],
    source_message_ids: [id],
    evidence_quote: text,
    metadata: { statement_role: "life_context" },
  });
  const result = await runMemorizerAsync(repo, {
    user_id: "u",
    messages: [
      {
        id: "m-old",
        user_id: "u",
        role: "user" as const,
        content:
          "Retiens que je bosse en horaires decales 3x8 a l'usine toutes les semaines.",
      },
      {
        id: "m-new",
        user_id: "u",
        role: "user" as const,
        content:
          "En fait retiens plutot que je passe en poste de jour fixe des maintenant.",
      },
    ],
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [
          statement(
            "m-old",
            "Je bosse en horaires decales 3x8 a l'usine toutes les semaines.",
          ),
          statement(
            "m-new",
            "Je passe en poste de jour fixe des maintenant.",
          ),
        ],
        entities: [],
        corrections: [{
          operation_type: "supersede",
          target_hint: "horaires decales 3x8",
          reason: "correction du rythme de travail",
          source_message_ids: ["m-new"],
        }],
        rejected_observations: [],
      }),
  } as never);
  assertEquals(result.status, "completed");
  assertEquals(result.persisted.length, 2);
  const oldItem = result.persisted.find((write) =>
    write.candidate.item.content_text.includes("3x8")
  );
  const newTruthItem = result.persisted.find((write) =>
    write.candidate.item.content_text.includes("jour fixe")
  );
  // L'ancien fait reste une cible legitime...
  assertEquals(
    capturedKnownItems.some((known) => known.id === oldItem?.memory_item_id),
    true,
  );
  // ...mais la nouvelle verite (meme source que la correction) n'est JAMAIS
  // exposee comme cible.
  assertEquals(
    capturedKnownItems.some((known) =>
      known.id === newTruthItem?.memory_item_id
    ),
    false,
  );
});

Deno.test("concurrent trigger on a fresh running run skips instead of double-writing (rose-r4 B02)", async () => {
  // Simule cron + trigger QA simultanes: pendant que l'extraction du premier
  // run est en vol (llm_provider), un second declenchement arrive avec le
  // MEME batch. Avant le verrou, il reutilisait le run `running` et
  // persistait une deuxieme vague (7 annonces / 14 ecrits). Attendu: le
  // second s'ecarte (skipped/run_in_progress), une seule vague ecrite.
  const repo = new InMemoryMemorizerRepository();
  const payload = JSON.stringify({
    memory_items: [{
      kind: "statement",
      content_text: "Retiens que je cours tous les matins avant le boulot.",
      normalized_summary: "Court tous les matins avant le travail.",
      domain_keys: ["sante.activite_physique"],
      confidence: 0.85,
      importance_score: 0.6,
      sensitivity_level: "normal",
      sensitivity_categories: [],
      source_message_ids: ["m1"],
      evidence_quote: "je cours tous les matins",
      metadata: { statement_role: "life_context" },
    }],
    entities: [],
    corrections: [],
    rejected_observations: [],
  });
  const baseInput = {
    user_id: "u",
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user" as const,
      content: "Retiens que je cours tous les matins avant le boulot.",
    }],
  };
  let innerResult: Awaited<ReturnType<typeof runMemorizerAsync>> | null = null;
  const outer = await runMemorizerAsync(repo, {
    ...baseInput,
    llm_provider: async () => {
      // Second declenchement pendant l'extraction du premier.
      innerResult = await runMemorizerAsync(repo, {
        ...baseInput,
        llm_provider: async () => payload,
      });
      return payload;
    },
  } as never);
  assertEquals(outer.status, "completed");
  assertEquals(innerResult?.status, "skipped");
  assertEquals(innerResult?.skip_reason, "run_in_progress");
  // Une seule vague ecrite: N faits acceptes = N memory_items, pas 2N.
  assertEquals(repo.memoryWrites.length, 1);
});

Deno.test("future dated confided event survives the pipeline with its dates (alex-r4 B04)", async () => {
  const repo = new InMemoryMemorizerRepository();
  const result = await runMemorizerAsync(repo, {
    user_id: "u",
    messages: [{
      id: "m1",
      user_id: "u",
      role: "user" as const,
      content: "Garde en tete: le 20 juillet je pars 4 jours chez ma mere.",
    }],
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [{
          kind: "event",
          content_text: "Part 4 jours chez sa mere a partir du 20 juillet.",
          normalized_summary: "Sejour de 4 jours chez sa mere du 20 au 24 juillet 2026.",
          domain_keys: ["relations.famille"],
          confidence: 0.85,
          importance_score: 0.7,
          sensitivity_level: "normal",
          sensitivity_categories: [],
          source_message_ids: ["m1"],
          evidence_quote: "le 20 juillet je pars 4 jours chez ma mere",
          event_start_at: "2026-07-20T00:00:00.000+02:00",
          event_end_at: "2026-07-24T00:00:00.000+02:00",
          time_precision: "day",
        }],
        entities: [],
        corrections: [],
        rejected_observations: [],
      }),
  });
  assertEquals(result.status, "completed");
  assertEquals(result.persisted.length, 1);
  assertEquals(result.persisted[0].status, "active");
  const written = repo.memoryWrites[0].candidate.item;
  assertEquals(written.kind, "event");
  assertEquals(String(written.event_start_at).startsWith("2026-07-20"), true);
  assertEquals(String(written.event_end_at).startsWith("2026-07-24"), true);
});

Deno.test("inverted event window is repaired in-pipeline: item persisted, end dropped, batch intact (eva-r8 B05)", async () => {
  const repo = new InMemoryMemorizerRepository();
  const result = await runMemorizerAsync(repo, {
    user_id: "u",
    messages: [
      {
        id: "m1",
        user_id: "u",
        role: "user" as const,
        content: "hier soir j'ai fait ma soiree sans ecran de 22h30 a 22h",
      },
      {
        id: "m2",
        user_id: "u",
        role: "user" as const,
        content: "et retiens que je bosse en horaires decales le vendredi",
      },
    ],
    llm_provider: async () =>
      JSON.stringify({
        memory_items: [
          {
            kind: "event",
            content_text: "Soiree sans ecran hier soir.",
            normalized_summary: "A fait une soiree sans ecran hier soir.",
            domain_keys: ["habitudes.execution"],
            confidence: 0.8,
            importance_score: 0.5,
            sensitivity_level: "normal",
            sensitivity_categories: [],
            source_message_ids: ["m1"],
            evidence_quote: "soiree sans ecran de 22h30 a 22h",
            event_start_at: "2026-07-06T22:30:00.000+02:00",
            event_end_at: "2026-07-06T22:00:00.000+02:00",
            time_precision: "part_of_day",
          },
          {
            kind: "statement",
            content_text: "Travaille en horaires decales le vendredi.",
            normalized_summary: "Travaille en horaires decales le vendredi.",
            domain_keys: ["travail.charge"],
            confidence: 0.85,
            importance_score: 0.6,
            sensitivity_level: "normal",
            sensitivity_categories: [],
            source_message_ids: ["m2"],
            evidence_quote: "je bosse en horaires decales le vendredi",
          },
        ],
        entities: [],
        corrections: [],
        rejected_observations: [],
      }),
  });
  assertEquals(result.status, "completed");
  // Les DEUX items survivent: la fenetre inversee est reparee (end
  // abandonne), jamais un batch entier perdu pour un item fautif.
  assertEquals(result.persisted.length, 2);
  const event = repo.memoryWrites.map((w) => w.candidate.item).find((i) =>
    i.kind === "event"
  );
  assertEquals(event?.event_end_at ?? null, null);
  assertEquals(
    (event?.metadata as Record<string, unknown>)
      ?.event_end_dropped_inverted_window,
    true,
  );
});
