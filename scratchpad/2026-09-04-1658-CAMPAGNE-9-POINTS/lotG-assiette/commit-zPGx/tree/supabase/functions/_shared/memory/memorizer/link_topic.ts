import type {
  KnownTopic,
  TopicLinkDecision,
  ValidatedMemoryItem,
} from "./types.ts";
import { lexicalSimilarity, normalizeText } from "./utils.ts";

const LINK_TOPIC_THRESHOLD = 0.35;
const GENERIC_DOMAIN_TOPIC_THRESHOLD = 0.12;
const LEXICAL_ONLY_TOPIC_THRESHOLD = 0.15;
const ACTIVE_TOPIC_THRESHOLD = 0.55;
const GENERIC_DOMAIN_KEYS = new Set([
  "habitudes.execution",
  "habitudes.planification",
  "objectifs.court_terme",
  "objectifs.long_terme",
  "objectifs.identite",
  "sante.energie",
  "psychologie.motivation",
  "psychologie.emotions",
  "relations.limites",
]);

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function topicDomainKeys(topic: KnownTopic): string[] {
  const direct = asArray(topic.domain_keys).map(String).filter(Boolean);
  if (direct.length > 0) return direct;
  return asArray(topic.metadata?.domain_keys).map(String).filter(Boolean);
}

function overlapScore(left: string[], right: string[]): number {
  const l = new Set(left.map(normalizeText).filter(Boolean));
  const r = new Set(right.map(normalizeText).filter(Boolean));
  if (!l.size || !r.size) return 0;
  let intersection = 0;
  for (const key of l) if (r.has(key)) intersection++;
  return intersection / Math.min(l.size, r.size);
}

function specificDomainKeys(keys: string[]): string[] {
  return keys.filter((key) => !GENERIC_DOMAIN_KEYS.has(normalizeText(key)));
}

function entityScore(item: ValidatedMemoryItem, topic: KnownTopic): number {
  const mentions = item.entity_mentions ?? [];
  if (mentions.length === 0) return 0;
  const topicText = normalizeText(
    `${topic.title} ${topic.slug ?? ""} ${topic.search_doc ?? ""}`,
  );
  const hits = mentions.filter((mention) =>
    topicText.includes(normalizeText(mention))
  ).length;
  return hits / mentions.length;
}

function scoreTopic(item: ValidatedMemoryItem, topic: KnownTopic) {
  const lexical = lexicalSimilarity(
    [
      item.content_text,
      item.normalized_summary ?? "",
      item.entity_mentions?.join(" ") ?? "",
    ].join(" "),
    [
      topic.title,
      topic.slug ?? "",
      topic.search_doc ?? "",
    ].join(" "),
  );
  const domain = overlapScore(item.domain_keys, topicDomainKeys(topic));
  const specificDomain = overlapScore(
    specificDomainKeys(item.domain_keys),
    specificDomainKeys(topicDomainKeys(topic)),
  );
  const entity = entityScore(item, topic);
  const score = specificDomain > 0
    ? specificDomain * 0.55 + lexical * 0.30 + entity * 0.15
    : domain > 0
    ? domain * 0.10 + lexical * 0.75 + entity * 0.15
    : lexical * 0.85 + entity * 0.15;
  return { topic, score, domain, specificDomain, lexical, entity };
}

export function linkMemoryItemToTopic(args: {
  item: ValidatedMemoryItem;
  active_topic?: KnownTopic | null;
  known_topics?: KnownTopic[];
  topic_decision?: "stay" | "switch" | "create_candidate" | "side_note";
  switched_topic_id?: string | null;
}): TopicLinkDecision {
  const topics = args.known_topics ?? [];
  const hint = normalizeText(args.item.topic_hint ?? "");
  const explicit = hint
    ? topics.find((topic) =>
      normalizeText(`${topic.slug ?? ""} ${topic.title}`).includes(hint) ||
      hint.includes(normalizeText(topic.slug ?? topic.title)) ||
      lexicalSimilarity(hint, `${topic.slug ?? ""} ${topic.title}`) >= 0.45
    )
    : null;
  const active = args.active_topic ?? null;
  const switched = args.switched_topic_id
    ? topics.find((topic) => topic.id === args.switched_topic_id) ?? null
    : null;
  const scored = topics
    .map((topic) => scoreTopic(args.item, topic))
    .sort((a, b) => b.score - a.score)[0] ?? null;
  const activeSemantic = active
    ? scoreTopic(args.item, active)
    : null;
  const best = explicit ?? switched ??
    (scored &&
        scored.score >= (scored.domain > 0
          ? scored.specificDomain > 0
            ? LINK_TOPIC_THRESHOLD
            : GENERIC_DOMAIN_TOPIC_THRESHOLD
          : LEXICAL_ONLY_TOPIC_THRESHOLD)
      ? scored.topic
      : null) ??
    (args.topic_decision === "side_note"
      ? null
      : activeSemantic && activeSemantic.score >= ACTIVE_TOPIC_THRESHOLD
      ? active
      : null) ??
    null;
  const bestScore = scored && best?.id === scored.topic.id ? scored : null;
  const isMixedBest = Boolean(bestScore);
  const topicConfidence = bestScore
    ? Math.max(
      bestScore.specificDomain > 0 ||
          (bestScore.domain > 0 && bestScore.lexical > 0)
        ? 0.70
        : 0.55,
      Math.min(0.92, 0.35 + bestScore.score),
    )
    : activeSemantic && best?.id === active?.id
    ? Math.max(0.55, Math.min(0.72, 0.35 + activeSemantic.score))
    : 0;
  const mixedReason = bestScore
    ? bestScore.domain > 0 && bestScore.lexical > 0
      ? "mixed_topic_match"
      : bestScore.specificDomain > 0
      ? "domain_topic_match"
      : bestScore.entity > 0
      ? "entity_topic_match"
      : "semantic_topic_match"
    : null;

  return {
    item: args.item,
    topic_id: best?.id ?? null,
    topic_slug: best?.slug ?? null,
    relation_type: "about",
    confidence: best
      ? explicit
        ? 0.88
        : switched
        ? 0.82
        : isMixedBest
        ? topicConfidence
        : active === best
        ? 0.70
        : 0.68
      : 0,
    reason: explicit
      ? "explicit_topic_hint"
      : switched
      ? "switched_topic"
      : mixedReason
      ? mixedReason
      : active && best?.id === active.id
      ? "active_topic_context"
      : "no_topic_link",
  };
}

export function linkMemoryItemsToTopics(args: {
  items: ValidatedMemoryItem[];
  active_topic?: KnownTopic | null;
  known_topics?: KnownTopic[];
  topic_decision?: "stay" | "switch" | "create_candidate" | "side_note";
  switched_topic_id?: string | null;
}): TopicLinkDecision[] {
  return args.items.map((item) => linkMemoryItemToTopic({ ...args, item }));
}
