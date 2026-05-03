import type {
  DedupeDecision,
  KnownMemoryItem,
  ValidatedMemoryItem,
} from "./types.ts";
import { cosineSimilarity, lexicalSimilarity, normalizeText } from "./utils.ts";

function sameEventWindow(
  item: ValidatedMemoryItem,
  existing: KnownMemoryItem,
): boolean {
  if (item.kind !== "event") return true;
  const left = String(item.event_start_at ?? "");
  const right = String(existing.event_start_at ?? "");
  return Boolean(left && right && left === right);
}

function sameSource(
  item: ValidatedMemoryItem,
  existing: KnownMemoryItem,
): boolean {
  return Boolean(
    existing.source_message_id &&
      item.source_message_ids.includes(existing.source_message_id),
  );
}

export function decideMemoryItemDedupe(
  item: ValidatedMemoryItem,
  existingItems: KnownMemoryItem[],
): DedupeDecision {
  const sameCanonical = existingItems.find((existing) =>
    existing.canonical_key && existing.canonical_key === item.canonical_key
  );
  if (sameCanonical && sameSource(item, sameCanonical)) {
    return {
      decision: "reject_duplicate",
      item,
      existing_item_id: sameCanonical.id,
      similarity: 1,
      reason: "same_canonical_and_source",
    };
  }
  if (sameCanonical && sameEventWindow(item, sameCanonical)) {
    return {
      decision: "add_source_to_existing",
      item,
      existing_item_id: sameCanonical.id,
      similarity: 1,
      reason: "same_canonical_key",
    };
  }

  let best: { existing: KnownMemoryItem; similarity: number } | null = null;
  for (const existing of existingItems) {
    if (existing.kind !== item.kind) continue;
    if (item.kind === "event" && !sameEventWindow(item, existing)) continue;
    const embeddingSim = cosineSimilarity(
      (item.metadata as any)?.embedding,
      existing.embedding,
    );
    const lexical = lexicalSimilarity(
      item.normalized_summary || item.content_text,
      existing.normalized_summary || existing.content_text,
    );
    const similarity = Number.isFinite(embeddingSim)
      ? Math.max(embeddingSim, lexical)
      : lexical;
    if (!best || similarity > best.similarity) {
      best = { existing, similarity };
    }
  }

  if (best && best.similarity >= 0.96 && sameSource(item, best.existing)) {
    return {
      decision: "reject_duplicate",
      item,
      existing_item_id: best.existing.id,
      similarity: best.similarity,
      reason: "exact_or_near_duplicate_same_source",
    };
  }
  if (best && best.similarity >= 0.92) {
    return {
      decision: "merge_into_existing",
      item,
      existing_item_id: best.existing.id,
      similarity: best.similarity,
      reason: "high_similarity_same_kind",
    };
  }
  if (
    item.kind !== "event" &&
    existingItems.some((existing) =>
      existing.kind === item.kind &&
      normalizeText(existing.content_text) === normalizeText(item.content_text)
    )
  ) {
    return {
      decision: "reject_duplicate",
      item,
      existing_item_id: existingItems.find((existing) =>
        normalizeText(existing.content_text) ===
          normalizeText(item.content_text)
      )?.id ?? null,
      similarity: 1,
      reason: "exact_content_duplicate",
    };
  }
  return { decision: "create_new", item, reason: "no_duplicate_found" };
}

export function dedupeMemoryItems(
  items: ValidatedMemoryItem[],
  existingItems: KnownMemoryItem[],
): DedupeDecision[] {
  return items.map((item) => decideMemoryItemDedupe(item, existingItems));
}
