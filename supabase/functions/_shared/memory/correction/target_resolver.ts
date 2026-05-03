import type {
  CorrectionMemoryItem,
  CorrectionTargetResolution,
  CorrectionTargetResolutionInput,
} from "./types.ts";

function normalize(input: string): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s._:-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(input: string): Set<string> {
  return new Set(normalize(input).split(/\s+/).filter((t) => t.length > 2));
}

function lexicalScore(message: string, item: CorrectionMemoryItem): number {
  const left = tokens(message);
  const right = tokens(
    [
      item.content_text,
      item.normalized_summary,
      ...(item.entity_aliases ?? []),
      ...(item.domain_keys ?? []),
    ].filter(Boolean).join(" "),
  );
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap++;
  return overlap / Math.max(left.size, right.size);
}

function confirmationPrompt(item: CorrectionMemoryItem): string {
  const excerpt = String(item.normalized_summary || item.content_text || "")
    .trim()
    .slice(0, 140);
  return `Tu veux que je corrige ce souvenir : "${excerpt}" ?`;
}

export function resolveCorrectionTarget(
  input: CorrectionTargetResolutionInput,
): CorrectionTargetResolution {
  const active = input.candidates.filter((item) =>
    !["deleted_by_user", "hidden_by_user", "archived"].includes(item.status)
  );
  const scored: CorrectionTargetResolution["candidates"] = [];
  const push = (item: CorrectionMemoryItem, score: number, reason: string) => {
    scored.push({ item_id: item.id, score, reason });
  };

  if (input.explicit_item_id) {
    const item = active.find((candidate) =>
      candidate.id === input.explicit_item_id
    );
    if (item) {
      push(item, 0.98, "explicit_item_id");
      return {
        target_item_id: item.id,
        confidence: 0.98,
        reason: "explicit_item_id",
        needs_confirmation: false,
        candidates: scored,
      };
    }
  }

  const message = normalize(input.user_message);
  for (const item of active) {
    const content = normalize(item.content_text);
    if (content && message.includes(content.slice(0, 60))) {
      push(item, 0.94, "explicit_content_quote");
    }
  }
  for (const item of active) {
    if (input.previous_payload_item_ids?.includes(item.id)) {
      push(item, 0.84, "previous_payload_item");
    }
    if (input.last_assistant_cited_item_ids?.includes(item.id)) {
      push(item, 0.8, "last_assistant_cited_item");
    }
    if (
      input.active_topic_id && item.topic_ids?.includes(input.active_topic_id)
    ) {
      push(
        item,
        0.55 + lexicalScore(input.user_message, item),
        "active_topic_similarity",
      );
    } else {
      const score = lexicalScore(input.user_message, item);
      if (score > 0) push(item, score, "semantic_similarity");
    }
    for (const entity of input.mentioned_entities ?? []) {
      if (
        (item.entity_aliases ?? []).map(normalize).includes(normalize(entity))
      ) {
        push(item, 0.76, "explicit_entity_match");
      }
    }
  }

  const byItem = new Map<string, { score: number; reason: string }>();
  for (const row of scored) {
    const existing = byItem.get(row.item_id);
    if (!existing || row.score > existing.score) {
      byItem.set(row.item_id, {
        score: Math.min(0.99, row.score),
        reason: row.reason,
      });
    }
  }
  const ranked = [...byItem.entries()]
    .map(([item_id, row]) => ({ item_id, ...row }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0] ?? null;
  if (!best) {
    return {
      target_item_id: null,
      confidence: 0,
      reason: "no_candidate",
      needs_confirmation: true,
      confirmation_prompt: "Tu veux que je corrige quel souvenir exactement ?",
      candidates: [],
    };
  }
  const target = active.find((item) => item.id === best.item_id) ?? null;
  const ambiguous = best.score < 0.7 ||
    Boolean(ranked[1] && best.score - ranked[1].score < 0.12);
  return {
    target_item_id: ambiguous ? null : best.item_id,
    confidence: best.score,
    reason: best.reason,
    needs_confirmation: ambiguous,
    confirmation_prompt: ambiguous && target
      ? confirmationPrompt(target)
      : null,
    candidates: ranked,
  };
}
