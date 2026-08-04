import type { DryRunCandidate, KnownTopic } from "./types.ts";
import { lexicalSimilarity, normalizeText, uniqueStrings } from "./utils.ts";

// Missing link of the memory-v2 pipeline: the extraction emits a topic_hint
// per item and the linker matches hints against KNOWN topics, but nothing ever
// created the first topic — so user_topic_memories stayed empty forever.
// This stage plans candidate-topic creation from the hints that matched no
// known topic; persistence then links the batch items to the new topics and
// the existing compaction cron fills search_doc embeddings.

const MAX_NEW_TOPICS_PER_RUN = 4;
const MIN_HINT_LENGTH = 4;
const KNOWN_TOPIC_MATCH_THRESHOLD = 0.45;
const GROUP_MERGE_THRESHOLD = 0.7;
const SEARCH_DOC_MAX_CHARS = 600;
const MAX_DOMAIN_KEYS = 6;

export interface CandidateTopicPlan {
  slug: string;
  title: string;
  search_doc: string;
  domain_keys: string[];
  candidate_indexes: number[];
}

export interface CreatedTopicRef {
  slug: string;
  topic_id: string;
}

export function slugifyTopicHint(hint: string): string {
  return normalizeText(hint)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

function titleFromHint(hint: string): string {
  const clean = hint.replace(/\s+/g, " ").trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function matchesKnownTopic(hint: string, topics: KnownTopic[]): boolean {
  const normalized = normalizeText(hint);
  return topics.some((topic) => {
    const identity = `${topic.slug ?? ""} ${topic.title}`;
    return normalizeText(identity).includes(normalized) ||
      normalized.includes(normalizeText(topic.slug ?? topic.title)) ||
      lexicalSimilarity(hint, identity) >= KNOWN_TOPIC_MATCH_THRESHOLD;
  });
}

export function planCandidateTopics(args: {
  candidates: DryRunCandidate[];
  known_topics?: KnownTopic[];
}): CandidateTopicPlan[] {
  const knownTopics = args.known_topics ?? [];
  const groups = new Map<string, { hint: string; indexes: number[] }>();

  args.candidates.forEach((candidate, index) => {
    if (candidate.status !== "accepted_dry_run") return;
    if (candidate.topic_link?.topic_id) return;
    const hint = String(candidate.item.topic_hint ?? "").trim();
    if (hint.length < MIN_HINT_LENGTH) return;
    const slug = slugifyTopicHint(hint);
    if (!slug) return;
    if (matchesKnownTopic(hint, knownTopics)) return;
    const group = groups.get(slug);
    if (group) group.indexes.push(index);
    else groups.set(slug, { hint, indexes: [index] });
  });

  // Merge near-identical hints of the same batch ("anxiete de performance" /
  // "anxiete performance") so one activation does not spawn twin topics.
  const merged: Array<{ slug: string; hint: string; indexes: number[] }> = [];
  for (const [slug, group] of groups) {
    const target = merged.find((existing) =>
      lexicalSimilarity(existing.hint, group.hint) >= GROUP_MERGE_THRESHOLD
    );
    if (target) target.indexes.push(...group.indexes);
    else merged.push({ slug, hint: group.hint, indexes: group.indexes });
  }

  return merged
    .sort((a, b) => b.indexes.length - a.indexes.length)
    .slice(0, MAX_NEW_TOPICS_PER_RUN)
    .map((group) => {
      const items = group.indexes.map((i) => args.candidates[i].item);
      const searchDoc = items
        .map((item) => item.normalized_summary?.trim() || item.content_text)
        .filter(Boolean)
        .join(" | ")
        .slice(0, SEARCH_DOC_MAX_CHARS);
      return {
        slug: group.slug,
        title: titleFromHint(group.hint),
        search_doc: searchDoc,
        domain_keys: uniqueStrings(items.flatMap((item) => item.domain_keys))
          .slice(0, MAX_DOMAIN_KEYS),
        candidate_indexes: group.indexes,
      };
    });
}

export function applyCreatedTopicsToCandidates(args: {
  candidates: DryRunCandidate[];
  plans: CandidateTopicPlan[];
  created: CreatedTopicRef[];
}): DryRunCandidate[] {
  const topicIdBySlug = new Map(
    args.created.map((ref) => [ref.slug, ref.topic_id]),
  );
  const next = [...args.candidates];
  for (const plan of args.plans) {
    const topicId = topicIdBySlug.get(plan.slug);
    if (!topicId) continue;
    for (const index of plan.candidate_indexes) {
      const candidate = next[index];
      if (!candidate) continue;
      next[index] = {
        ...candidate,
        topic_link: {
          item: candidate.item,
          topic_id: topicId,
          topic_slug: plan.slug,
          relation_type: "about",
          confidence: 0.62,
          reason: "created_candidate_topic",
        },
      };
    }
  }
  return next;
}
