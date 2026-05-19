import type {
  ActionLinkDecision,
  PlanSignal,
  ValidatedMemoryItem,
} from "./types.ts";
import type { AggregationKind } from "../types.v1.ts";
import { actionTitleStem, normalizeActionText } from "../action_family.ts";

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeActionText(value).split(/\s+/).filter((token) => token.length >= 3),
  );
}

function tokenOverlapScore(textTokens: Set<string>, candidate: string): number {
  const candidateTokens = tokenSet(candidate);
  if (candidateTokens.size < 2) return 0;
  let overlap = 0;
  for (const token of candidateTokens) {
    if (textTokens.has(token)) overlap += 1;
  }
  return overlap >= 2 ? Math.min(0.6, overlap * 0.28) : 0;
}

function aggregationFromRole(role: unknown): AggregationKind {
  const raw = String(role ?? "").trim();
  if (raw === "week" || raw === "week_summary") return "week_summary";
  if (raw === "streak" || raw === "streak_summary") return "streak_summary";
  if (raw === "possible_pattern") return "possible_pattern";
  return "single_occurrence";
}

export function linkMemoryItemToAction(args: {
  item: ValidatedMemoryItem;
  plan_signals?: PlanSignal[];
}): ActionLinkDecision | null {
  const canLinkKind = args.item.kind === "action_observation" ||
    args.item.kind === "statement" || args.item.kind === "fact";
  if (!canLinkKind) return null;
  const signals = (args.plan_signals ?? []).filter((signal) =>
    String(signal.plan_item_id ?? "").trim()
  );
  if (signals.length === 0) return null;
  const text = normalizeActionText(
    `${args.item.content_text} ${args.item.normalized_summary ?? ""} ${
      args.item.topic_hint ?? ""
    }`,
  );
  const textTokens = tokenSet(text);
  const metadataPlanItemId = String(args.item.metadata?.plan_item_id ?? "")
    .trim();
  const metadataFamilyKey = String(args.item.metadata?.action_family_key ?? "")
    .trim();
  const scored = signals.map((signal) => {
    let score = 0;
    const title = normalizeActionText(signal.title);
    const stem = actionTitleStem(signal.title).replace(/_/g, " ");
    const aliases = [
      ...(signal.aliases ?? []),
      signal.action_family_key ?? "",
      stem,
    ].map(normalizeActionText).filter(Boolean);
    const reasons: string[] = [];
    if (metadataPlanItemId && metadataPlanItemId === signal.plan_item_id) {
      score += 1.2;
      reasons.push("metadata_plan_item_id");
    }
    if (
      metadataFamilyKey && signal.action_family_key &&
      metadataFamilyKey === signal.action_family_key
    ) {
      score += 0.9;
      reasons.push("metadata_action_family_key");
    }
    if (title && text.includes(title)) {
      score += 0.85;
      reasons.push("title_exact");
    }
    if (stem && text.includes(stem)) {
      score += 0.65;
      reasons.push("title_stem");
    }
    const titleOverlap = tokenOverlapScore(textTokens, `${signal.title} ${stem}`);
    if (titleOverlap > 0) {
      score += titleOverlap;
      reasons.push("title_token_overlap");
    }
    for (const alias of aliases) {
      if (alias && text.includes(alias)) {
        score += 0.35;
        reasons.push("alias");
        break;
      }
      const aliasTokens = alias.split(/\s+/).filter((token) => token.length >= 3);
      if (
        aliasTokens.length >= 2 &&
        aliasTokens.every((token) => text.includes(token))
      ) {
        score += 0.55;
        reasons.push("alias_token_presence");
        break;
      }
      const overlap = tokenOverlapScore(textTokens, alias);
      if (overlap > 0) {
        score += overlap;
        reasons.push("alias_token_overlap");
        break;
      }
    }
    if ((signal.occurrence_ids ?? []).length > 0) {
      score += 0.1;
      reasons.push("has_occurrence");
    }
    return { signal, score, reasons };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0] ?? null;
  const second = scored[1] ?? null;
  if (!best) return null;
  const ambiguous = second && best.score - second.score < 0.2;
  const weakSingle = signals.length === 1 && best.score >= 0.1 &&
    /\b(action|habitude|fait|faite|rate|ratee|bloque|difficile|reussi|termine)\b/
      .test(text);
  const minScore = args.item.kind === "action_observation" ? 0.45 : 0.4;
  if ((best.score < minScore && !weakSingle) || ambiguous) return null;
  const signal = best.signal;
  if (!signal?.plan_item_id) return null;
  const confidence = Math.max(0.55, Math.min(0.94, 0.55 + best.score * 0.18));
  return {
    item: args.item,
    plan_item_id: signal.plan_item_id,
    action_family_key: signal.action_family_key ?? null,
    occurrence_ids: signal.occurrence_ids ?? [],
    aggregation_kind: aggregationFromRole(args.item.metadata?.observation_role),
    observation_window_start: signal.observation_window_start ??
      args.item.event_start_at ?? null,
    observation_window_end: signal.observation_window_end ??
      args.item.event_end_at ?? null,
    confidence,
    metadata: {
      action_family_key: signal.action_family_key ?? null,
      action_variant: signal.action_variant ?? {
        target_reps: signal.target_reps ?? null,
        current_reps: signal.current_reps ?? null,
        cadence_label: signal.cadence_label ?? null,
        scheduled_days: signal.scheduled_days ?? null,
        time_of_day: signal.time_of_day ?? null,
      },
      matched_by: best.reasons,
      match_score: Number(best.score.toFixed(3)),
      start_after_item_id: signal.start_after_item_id ?? null,
    },
  };
}
