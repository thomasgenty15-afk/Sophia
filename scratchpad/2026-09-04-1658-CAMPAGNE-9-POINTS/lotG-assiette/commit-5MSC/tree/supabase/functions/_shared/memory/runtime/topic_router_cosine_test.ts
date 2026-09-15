import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  normalizeCosineToRouterScale,
  routeTopic,
  type TopicRouterTopic,
} from "./topic_router.ts";

// Ancres de la calibration réelle du 10/07/2026 (8 inputs vs 6 topics):
// bruit de fond FR-FR raw 0.55-0.64, on-thème raw 0.68+.
Deno.test("cosine remap keeps the vague band below routing thresholds", () => {
  // Vague max observé (raw 0.639) → doit rester sous le switch no-active (0.45).
  assert(normalizeCosineToRouterScale(0.639) < 0.45);
  // Hors-sujet (raw 0.563) → très bas.
  assert(normalizeCosineToRouterScale(0.563) < 0.32);
  // On-thème min observé (raw 0.679) → au-dessus du switch no-active.
  assert(normalizeCosineToRouterScale(0.679) > 0.45);
  // On-thème fort (raw 0.81) → zone haute.
  assert(normalizeCosineToRouterScale(0.81) > 0.8);
  // Monotone et borné.
  assert(
    normalizeCosineToRouterScale(0.7) < normalizeCosineToRouterScale(0.8),
  );
  assertEquals(normalizeCosineToRouterScale(1.2), 0.98);
  assert(Number.isNaN(normalizeCosineToRouterScale(Number.NaN)));
});

const NO_SIGNAL = { detected: false, confidence: 0, terms: [] };
const SIGNALS = {
  trivial: NO_SIGNAL,
  correction: NO_SIGNAL,
  explicit_topic_switch: NO_SIGNAL,
  safety: NO_SIGNAL,
};

function unit(dims: number[]): number[] {
  const norm = Math.sqrt(dims.reduce((s, x) => s + x * x, 0));
  return dims.map((x) => x / norm);
}

// Vecteurs jouets dont les cosinus reproduisent les bandes calibrées.
// e0·e1 = cos(angle) contrôlé par construction 2D plongée en 4D.
function vecAtCosine(target: number): { a: number[]; b: number[] } {
  const a = unit([1, 0, 0, 0]);
  const b = unit([target, Math.sqrt(1 - target * target), 0, 0]);
  return { a, b };
}

Deno.test("router switches on a strong cosine match without active topic", () => {
  const { a, b } = vecAtCosine(0.75);
  const topic: TopicRouterTopic = {
    id: "t1",
    slug: "theme-fort",
    title: "Theme fort",
    embedding: b,
  };
  const routed = routeTopic({
    message: "message sans recouvrement lexical",
    retrieval_mode: "topic_continuation",
    signals: SIGNALS,
    candidate_topics: [topic],
    message_embedding: a,
  });
  return routed.then((r) => {
    assertEquals(r.decision, "switch");
    assertEquals(r.active_topic_id, "t1");
    assert(r.confidence > 0.45);
  });
});

Deno.test("router does not switch on background-noise cosine", () => {
  const { a, b } = vecAtCosine(0.6);
  const topic: TopicRouterTopic = {
    id: "t1",
    slug: "theme-bruit",
    title: "Theme bruit",
    embedding: b,
  };
  const routed = routeTopic({
    message: "message vague sans rapport",
    retrieval_mode: "topic_continuation",
    signals: SIGNALS,
    candidate_topics: [topic],
    message_embedding: a,
  });
  return routed.then((r) => {
    assertEquals(r.decision, "create_candidate");
    assertEquals(r.active_topic_id, null);
  });
});

Deno.test("lexical fallback still routes via generic identity tokens", () => {
  // Anti-régression purge regex: sans embedding, le repli lexical générique
  // (tokens d'identité du topic) doit suffire pour un match explicite.
  const topic: TopicRouterTopic = {
    id: "t1",
    slug: "anxiete-performance",
    title: "Anxiete de performance",
    search_doc: "peur que ca ne monte pas au moment meme",
  };
  const routed = routeTopic({
    message: "mon anxiete de performance revient fort ce soir",
    retrieval_mode: "topic_continuation",
    signals: SIGNALS,
    candidate_topics: [topic],
  });
  return routed.then((r) => {
    assertEquals(r.decision, "switch");
    assertEquals(r.active_topic_id, "t1");
  });
});
