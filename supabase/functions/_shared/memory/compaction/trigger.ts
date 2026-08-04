import type { TopicCompactionTopic } from "./types.ts";

export interface TopicCompactionTriggerOptions {
  threshold?: number;
  force_topic_ids?: string[];
  trigger_type?: string | null;
}

export function shouldCompactTopic(
  topic: Pick<
    TopicCompactionTopic,
    "id" | "pending_changes_count" | "metadata" | "lifecycle_stage" | "status"
  >,
  opts: TopicCompactionTriggerOptions = {},
): { compact: boolean; reason: string } {
  if (topic.status && topic.status !== "active") {
    return { compact: false, reason: "topic_not_active" };
  }
  const forced = new Set((opts.force_topic_ids ?? []).map(String));
  if (forced.has(topic.id)) return { compact: true, reason: "forced_topic" };

  const trigger = String(opts.trigger_type ?? "").trim();
  const pending = Number(topic.pending_changes_count ?? 0);
  if (trigger === "weekly_review" && pending > 0) {
    return { compact: true, reason: "weekly_review_pending" };
  }
  if (trigger === "correction" && pending > 0) {
    return { compact: true, reason: "correction_pending" };
  }
  if (topic.lifecycle_stage === "durable" && pending > 0) {
    return { compact: true, reason: "durable_pending" };
  }
  if ((topic.metadata as any)?.memory_v2_redaction_pending === true) {
    return { compact: true, reason: "redaction_pending" };
  }
  const threshold = Math.max(1, Math.floor(Number(opts.threshold ?? 5)));
  if (pending >= threshold) {
    return { compact: true, reason: "pending_threshold" };
  }
  return { compact: false, reason: "below_threshold" };
}

export function selectTopicsForCompaction(
  topics: TopicCompactionTopic[],
  opts: TopicCompactionTriggerOptions = {},
): Array<TopicCompactionTopic & { compaction_reason: string }> {
  return topics.flatMap((topic) => {
    const decision = shouldCompactTopic(topic, opts);
    return decision.compact
      ? [{ ...topic, compaction_reason: decision.reason }]
      : [];
  });
}
