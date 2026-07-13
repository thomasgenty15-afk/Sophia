import type { RetrievalMode, TopicDecision } from "../types.v1.ts";
import type { DetectedSignals } from "./signal_detection.ts";

export interface TopicRouterTopic {
  id: string;
  slug?: string | null;
  title: string;
  search_doc?: string | null;
  lifecycle_stage?: "candidate" | "durable" | "dormant" | "archived" | null;
  embedding?: number[] | null;
  similarity?: number | null;
}

export interface TopicRouterInput {
  message: string;
  retrieval_mode: RetrievalMode;
  signals: Pick<
    DetectedSignals,
    "trivial" | "correction" | "explicit_topic_switch" | "safety"
  >;
  active_topic?: TopicRouterTopic | null;
  candidate_topics?: TopicRouterTopic[];
  message_embedding?: number[] | null;
  recent_messages?: string[];
  llm_router?: (input: TopicRouterLlmInput) => Promise<TopicRouterLlmDecision>;
}

export interface TopicRouterLlmInput {
  message: string;
  active_topic: TopicRouterTopic | null;
  candidates: TopicRouterCandidate[];
  recent_messages: string[];
  active_similarity: number;
}

export interface TopicRouterLlmDecision {
  decision: TopicDecision;
  topic_id?: string | null;
  confidence?: number;
  reason?: string;
}

export interface TopicRouterCandidate extends TopicRouterTopic {
  similarity: number;
}

export interface TopicRouterResult {
  decision: TopicDecision;
  active_topic_id: string | null;
  active_topic_slug: string | null;
  confidence: number;
  reason: string;
  shortlist: TopicRouterCandidate[];
  active_similarity: number;
  llm_used: boolean;
  router_version: "memory_v2_router_mvp_1";
}

const GREY_MIN = 0.4;
const GREY_MAX = 0.55;

function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set([
  "a",
  "au",
  "avec",
  "ce",
  "c",
  "de",
  "des",
  "du",
  "en",
  "et",
  "je",
  "j",
  "la",
  "le",
  "les",
  "ma",
  "me",
  "mes",
  "mon",
  "pour",
  "que",
  "qui",
  "un",
  "une",
]);

const GENERIC_TOPIC_WORDS = new Set([
  "allergie",
  "allergies",
  "client",
  "famille",
  "sante",
  "soutien",
  "travail",
  "voyage",
]);

function tokens(text: string): Set<string> {
  return new Set(
    normalize(text).split(" ").filter((t) => t.length > 2 && !STOP.has(t)),
  );
}

export function cosineSimilarity(
  a?: number[] | null,
  b?: number[] | null,
): number {
  if (!a?.length || !b?.length || a.length !== b.length) return Number.NaN;
  let dot = 0;
  let an = 0;
  let bn = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    an += a[i] * a[i];
    bn += b[i] * b[i];
  }
  if (an <= 0 || bn <= 0) return Number.NaN;
  return dot / (Math.sqrt(an) * Math.sqrt(bn));
}

function lexicalSimilarity(
  message: string,
  topic: TopicRouterTopic | null,
): number {
  if (!topic) return 0;
  const left = tokens(message);
  const right = tokens(
    `${topic.title} ${topic.slug ?? ""} ${topic.search_doc ?? ""}`,
  );
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const t of left) if (right.has(t)) overlap++;
  const jaccard = overlap / (left.size + right.size - overlap);
  let bonus = 0;
  const messageTokens = tokens(message);
  // Purge charte anti-patching (commandement 0, 10/07/2026): les bonus regex
  // par sujet (rupture/lina, travail/manager, cannabis, sommeil...) faisaient
  // du routing metier par regex. Le routage semantique passe desormais par
  // les embeddings (voie principale); le lexical ne sert que de repli, avec
  // le seul bonus GENERIQUE des tokens d'identite du topic.
  const identityTokens = [...tokens(`${topic.slug ?? ""} ${topic.title}`)]
    .filter((token) => token.length >= 4 && !GENERIC_TOPIC_WORDS.has(token));
  if (identityTokens.some((token) => messageTokens.has(token))) {
    bonus += 0.62;
  }
  return Math.min(0.95, jaccard + bonus);
}

// Les cosinus Gemini (gemini-embedding-001) vivent sur une echelle compressee:
// le plancher entre deux textes FR quelconques est ~0.55-0.64 et un vrai match
// thematique commence vers 0.68 (calibration reelle du 10/07/2026, 8 inputs
// contre 6 topics persona). Ce remapping par morceaux projette ces cosinus sur
// l'echelle historique du routeur (calibree lexical), pour que les seuils de
// decision et les shortlists mixtes cosine/lexical restent coherents.
const COSINE_TO_ROUTER_SCALE: Array<[number, number]> = [
  [0.55, 0.28],
  [0.64, 0.42],
  [0.68, 0.55],
  [0.75, 0.70],
  [0.85, 0.90],
  [1.0, 0.98],
];

export function normalizeCosineToRouterScale(cosine: number): number {
  if (!Number.isFinite(cosine)) return Number.NaN;
  const first = COSINE_TO_ROUTER_SCALE[0];
  if (cosine <= first[0]) {
    return Math.max(0, (cosine / first[0]) * first[1]);
  }
  for (let i = 1; i < COSINE_TO_ROUTER_SCALE.length; i++) {
    const [x1, y1] = COSINE_TO_ROUTER_SCALE[i - 1];
    const [x2, y2] = COSINE_TO_ROUTER_SCALE[i];
    if (cosine <= x2) {
      return y1 + ((cosine - x1) / (x2 - x1)) * (y2 - y1);
    }
  }
  return COSINE_TO_ROUTER_SCALE[COSINE_TO_ROUTER_SCALE.length - 1][1];
}

function topicSimilarity(
  input: TopicRouterInput,
  topic: TopicRouterTopic | null,
): number {
  if (!topic) return 0;
  if (
    typeof topic.similarity === "number" && Number.isFinite(topic.similarity)
  ) {
    return Math.max(0, Math.min(1, topic.similarity));
  }
  const cosine = cosineSimilarity(input.message_embedding, topic.embedding);
  if (Number.isFinite(cosine)) {
    return Math.max(0, Math.min(1, normalizeCosineToRouterScale(cosine)));
  }
  return lexicalSimilarity(input.message, topic);
}

function rankedCandidates(input: TopicRouterInput): TopicRouterCandidate[] {
  return [...(input.candidate_topics ?? [])]
    .map((topic) => ({ ...topic, similarity: topicSimilarity(input, topic) }))
    .filter((topic) => topic.lifecycle_stage !== "archived")
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);
}

function result(
  decision: TopicDecision,
  topic: TopicRouterTopic | null | undefined,
  confidence: number,
  reason: string,
  shortlist: TopicRouterCandidate[],
  activeSimilarity: number,
  llmUsed = false,
): TopicRouterResult {
  return {
    decision,
    active_topic_id: topic?.id ?? null,
    active_topic_slug: topic?.slug ?? null,
    confidence,
    reason,
    shortlist,
    active_similarity: activeSimilarity,
    llm_used: llmUsed,
    router_version: "memory_v2_router_mvp_1",
  };
}

export async function routeTopic(
  input: TopicRouterInput,
): Promise<TopicRouterResult> {
  const active = input.active_topic ?? null;
  const shortlist = rankedCandidates(input);
  const best = shortlist[0] ?? null;
  const activeSimilarity = topicSimilarity(input, active);

  if (input.signals.trivial.detected) {
    return result(
      "side_note",
      active,
      0.78,
      "trivial_message",
      shortlist,
      activeSimilarity,
    );
  }
  if (
    input.retrieval_mode === "safety_first" &&
    !input.signals.explicit_topic_switch.detected
  ) {
    return result(
      "stay",
      active,
      0.82,
      "safety_sticky_active_topic",
      shortlist,
      activeSimilarity,
    );
  }
  if (
    input.signals.correction.detected &&
    !input.signals.explicit_topic_switch.detected
  ) {
    return result(
      "stay",
      active,
      0.84,
      "correction_keeps_active_topic",
      shortlist,
      activeSimilarity,
    );
  }
  if (input.retrieval_mode === "cross_topic_lookup") {
    return result(
      "stay",
      active,
      0.76,
      "cross_topic_lookup_does_not_switch",
      shortlist,
      activeSimilarity,
    );
  }
  if (
    input.signals.explicit_topic_switch.detected && best &&
    best.similarity >= 0.3
  ) {
    return result(
      "switch",
      best,
      Math.max(0.72, best.similarity),
      "explicit_switch_best_candidate",
      shortlist,
      activeSimilarity,
    );
  }
  if (
    active && best && best.id !== active.id &&
    ((best.similarity >= 0.58 &&
      best.similarity >= activeSimilarity + 0.08) ||
      (best.similarity >= 0.7 && best.similarity > activeSimilarity))
  ) {
    return result(
      "switch",
      best,
      best.similarity,
      "candidate_clearly_beats_active_topic",
      shortlist,
      activeSimilarity,
    );
  }
  if (active && activeSimilarity > 0.55) {
    return result(
      "stay",
      active,
      activeSimilarity,
      "high_similarity_active_topic",
      shortlist,
      activeSimilarity,
    );
  }
  if (active && activeSimilarity < 0.4) {
    if (best && best.similarity > 0.6) {
      return result(
        "switch",
        best,
        best.similarity,
        "low_active_high_candidate",
        shortlist,
        activeSimilarity,
      );
    }
    if (!best || best.similarity < 0.35) {
      return result(
        "create_candidate",
        null,
        0.62,
        "low_similarity_new_subject",
        shortlist,
        activeSimilarity,
      );
    }
  }
  if (!active) {
    if (best && best.similarity > 0.45) {
      return result(
        "switch",
        best,
        best.similarity,
        "no_active_best_candidate",
        shortlist,
        activeSimilarity,
      );
    }
    return result(
      "create_candidate",
      null,
      0.6,
      "no_active_topic",
      shortlist,
      activeSimilarity,
    );
  }
  if (
    activeSimilarity >= GREY_MIN && activeSimilarity <= GREY_MAX &&
    input.llm_router
  ) {
    const llm = await input.llm_router({
      message: input.message,
      active_topic: active,
      candidates: shortlist,
      recent_messages: input.recent_messages ?? [],
      active_similarity: activeSimilarity,
    });
    const target = llm.topic_id
      ? [active, ...shortlist].find((t) => t?.id === llm.topic_id)
      : active;
    return result(
      llm.decision,
      target,
      Math.max(0, Math.min(1, Number(llm.confidence ?? 0.62))),
      llm.reason ?? "llm_grey_zone",
      shortlist,
      activeSimilarity,
      true,
    );
  }
  return result(
    "stay",
    active,
    Math.max(0.56, activeSimilarity),
    "sticky_default",
    shortlist,
    activeSimilarity,
  );
}
