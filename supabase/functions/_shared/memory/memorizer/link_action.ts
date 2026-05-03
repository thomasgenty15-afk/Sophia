import type {
  ActionLinkDecision,
  PlanSignal,
  ValidatedMemoryItem,
} from "./types.ts";
import type { AggregationKind } from "../types.v1.ts";

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
  if (args.item.kind !== "action_observation") return null;
  const signals = args.plan_signals ?? [];
  const text = args.item.content_text.toLowerCase();
  const signal =
    signals.find((s) =>
      s.title && text.includes(String(s.title).toLowerCase())
    ) ?? signals[0] ?? null;
  if (!signal?.plan_item_id) return null;
  return {
    item: args.item,
    plan_item_id: signal.plan_item_id,
    occurrence_ids: signal.occurrence_ids ?? [],
    aggregation_kind: aggregationFromRole(args.item.metadata?.observation_role),
    observation_window_start: signal.observation_window_start ??
      args.item.event_start_at ?? null,
    observation_window_end: signal.observation_window_end ??
      args.item.event_end_at ?? null,
    confidence: 0.78,
  };
}
