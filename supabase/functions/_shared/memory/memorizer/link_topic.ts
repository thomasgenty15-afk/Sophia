import type {
  KnownTopic,
  TopicLinkDecision,
  ValidatedMemoryItem,
} from "./types.ts";
import { lexicalSimilarity, normalizeText } from "./utils.ts";

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
      hint.includes(normalizeText(topic.slug ?? topic.title))
    )
    : null;
  const active = args.active_topic ?? null;
  const switched = args.switched_topic_id
    ? topics.find((topic) => topic.id === args.switched_topic_id) ?? null
    : null;
  const best = explicit ?? switched ??
    (args.topic_decision === "side_note" ? null : active) ??
    topics
      .map((topic) => ({
        topic,
        score: lexicalSimilarity(
          args.item.content_text,
          `${topic.title} ${topic.slug ?? ""} ${topic.search_doc ?? ""}`,
        ),
      }))
      .sort((a, b) => b.score - a.score)[0]?.topic ??
    null;

  return {
    item: args.item,
    topic_id: best?.id ?? null,
    topic_slug: best?.slug ?? null,
    relation_type: "about",
    confidence: best ? (explicit ? 0.88 : active === best ? 0.76 : 0.68) : 0,
    reason: explicit
      ? "explicit_topic_hint"
      : switched
      ? "switched_topic"
      : active
      ? "active_topic_context"
      : best
      ? "semantic_topic_match"
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
