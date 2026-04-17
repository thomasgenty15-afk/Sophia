import {
  buildGlobalMemorySemanticSnapshot,
  formatGlobalMemoriesForPrompt,
  sanitizeGlobalMemoryCandidate,
  shouldCompactGlobalMemory,
} from "./global_memory.ts";

function assert(cond: unknown, msg?: string) {
  if (!cond) throw new Error(msg ?? "Assertion failed");
}

Deno.test("sanitizeGlobalMemoryCandidate: accepts allowed taxonomy key and normalizes payload", () => {
  const candidate = sanitizeGlobalMemoryCandidate({
    theme: "Psychologie",
    subtheme_key: "Discipline",
    full_key: "psychologie.discipline",
    summary_delta: "  La discipline revient comme un chantier central.  ",
    facts: [
      "Il parle souvent de discipline.",
      "Il parle souvent de discipline.",
    ],
    inferences: ["La discipline semble structurante."],
    active_issues: ["Il décrit un décalage entre potentiel et exécution."],
    goals: ["Construire plus de rigueur."],
    open_questions: ["La stabilité réelle reste à confirmer."],
    supporting_topic_slugs: [
      "discipline_personnelle",
      "discipline_personnelle",
    ],
    confidence: 0.83,
  });

  assert(candidate, "candidate should be kept");
  assert(
    candidate?.full_key === "psychologie.discipline",
    "full_key should remain normalized",
  );
  assert(candidate?.facts.length === 1, "facts should be deduplicated");
  assert(
    candidate?.supporting_topic_slugs.length === 1,
    "supporting topics should be deduplicated",
  );
});

Deno.test("formatGlobalMemoriesForPrompt: renders structured block", () => {
  const block = formatGlobalMemoriesForPrompt([
    {
      id: "gm_1",
      user_id: "user_1",
      theme: "psychologie",
      subtheme_key: "discipline",
      full_key: "psychologie.discipline",
      status: "active",
      canonical_summary: "La discipline est un axe de transformation central.",
      facts: ["Il parle régulièrement de contrôle des impulsions."],
      inferences: ["La discipline semble liée à son identité visée."],
      active_issues: ["L'exécution reste irrégulière par moments."],
      goals: ["Renforcer la rigueur dans la durée."],
      open_questions: ["Le niveau réel de stabilité reste à confirmer."],
      supporting_topic_slugs: ["discipline_personnelle"],
      pending_updates: [],
      mention_count: 2,
      enrichment_count: 1,
      pending_count: 0,
      pending_chars: 0,
      confidence: 0.82,
      semantic_snapshot:
        "Sous-thème global: Psychologie > Discipline\nRésumé consolidé: La discipline est un axe de transformation central.",
      needs_compaction: false,
      needs_embedding_refresh: false,
      summary_compacted_at: "2026-03-17T10:00:00.000Z",
      first_observed_at: "2026-03-16T10:00:00.000Z",
      last_observed_at: "2026-03-17T10:00:00.000Z",
      metadata: {},
      match_score: 0.72,
    },
  ]);

  assert(
    block.includes("=== MÉMOIRE GLOBALE THÉMATIQUE ==="),
    "missing global memory header",
  );
  assert(
    block.includes("Psychologie > Discipline"),
    "missing human-readable labels",
  );
  assert(block.includes("Faits saillants"), "missing facts section");
});

Deno.test("buildGlobalMemorySemanticSnapshot: includes stable semantic sections", () => {
  const snapshot = buildGlobalMemorySemanticSnapshot({
    full_key: "psychologie.discipline",
    canonical_summary:
      "La discipline reste un axe de transformation durable et récurrent.",
    facts: ["Il revient souvent sur le contrôle des impulsions."],
    inferences: ["La rigueur semble liée à l'identité qu'il vise."],
    active_issues: ["L'exécution reste irrégulière par moments."],
    goals: ["Construire une discipline stable."],
    open_questions: ["La stabilité récente est-elle durable ?"],
    supporting_topic_slugs: ["discipline_personnelle", "controle_impulsions"],
    pending_updates: [
      {
        at: "2026-03-18T10:00:00.000Z",
        source_type: "chat",
        summary_delta: "Il reparle d'une reprise stricte de ses routines.",
        facts: [],
        inferences: [],
        active_issues: [],
        goals: [],
        open_questions: [],
        supporting_topic_slugs: [],
        confidence: 0.8,
      },
    ],
  });

  assert(snapshot.includes("Psychologie > Discipline"), "missing taxonomy labels");
  assert(snapshot.includes("Résumé consolidé"), "missing summary section");
  assert(snapshot.includes("Éléments récents"), "missing recent updates section");
});

Deno.test("shouldCompactGlobalMemory: triggers on pending thresholds", () => {
  assert(
    shouldCompactGlobalMemory({
      pending_count: 5,
      pending_chars: 300,
      canonical_summary: "Résumé court",
      needs_compaction: false,
    }),
    "pending_count threshold should trigger compaction",
  );
  assert(
    shouldCompactGlobalMemory({
      pending_count: 0,
      pending_chars: 0,
      canonical_summary: "Résumé court",
      needs_compaction: true,
    }),
    "explicit flag should trigger compaction",
  );
});
