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
  const m = normalize(message);
  const slug = normalize(topic.slug ?? topic.title);
  let bonus = 0;
  if (
    slug.includes("rupture") &&
    /(rupture|lina|couple|reecrire|messages?|dedans)/.test(m)
  ) {
    bonus += 0.5;
  }
  if (slug.includes("travail") || slug.includes("manager")) {
    if (/(travail|manager|reunion|collegue|humilie)/.test(m)) bonus += 0.58;
  }
  if (slug.includes("discipline") || slug.includes("matin")) {
    if (/(routine|matin|repousse|procrastin|rate|habitude)/.test(m)) {
      bonus += 0.55;
    }
  }
  if (
    slug.includes("cannabis") && /(cannabis|fumer|fumai|joint|arret)/.test(m)
  ) {
    bonus += 0.58;
  }
  if (
    (slug.includes("sommeil") || slug.includes("energie")) &&
    /(dormi|dors|sommeil|fatigue|vide|energie)/.test(m)
  ) {
    bonus += 0.55;
  }
  return Math.min(0.95, jaccard + bonus);
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
  if (Number.isFinite(cosine)) return Math.max(0, Math.min(1, cosine));
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
