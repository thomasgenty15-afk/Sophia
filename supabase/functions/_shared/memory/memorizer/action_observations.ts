import type { AggregationKind } from "../types.v1.ts";
import type {
  ActionLinkDecision,
  ExtractedMemoryItem,
  PlanSignal,
} from "./types.ts";

export type ActionOccurrenceStatus =
  | "planned"
  | "done"
  | "partial"
  | "missed"
  | "rescheduled"
  | string;

export interface ActionOccurrenceSignal {
  id: string;
  plan_item_id: string;
  title?: string | null;
  status: ActionOccurrenceStatus;
  week_start_date?: string | null;
  planned_day?: string | null;
  validated_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface ExistingActionObservation {
  memory_item_id: string;
  plan_item_id: string;
  action_family_key?: string | null;
  content_text?: string | null;
  observation_window_start?: string | null;
  observation_window_end?: string | null;
  aggregation_kind?: AggregationKind | string | null;
  created_at?: string | null;
  domain_keys?: string[] | null;
}

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
}

function parseMs(value: unknown): number {
  const ms = Date.parse(String(value ?? ""));
  return Number.isFinite(ms) ? ms : 0;
}

function occurrenceTime(occurrence: ActionOccurrenceSignal): string | null {
  return occurrence.validated_at ?? occurrence.updated_at ??
    occurrence.created_at ?? null;
}

function sortedOccurrences(
  occurrences: ActionOccurrenceSignal[],
): ActionOccurrenceSignal[] {
  return occurrences
    .filter((occurrence) =>
      cleanText(occurrence.id) && cleanText(occurrence.plan_item_id)
    )
    .slice()
    .sort((left, right) =>
      parseMs(occurrenceTime(left)) - parseMs(occurrenceTime(right))
    );
}

function statusCounts(occurrences: ActionOccurrenceSignal[]) {
  return occurrences.reduce((acc, occurrence) => {
    const status = cleanText(occurrence.status, "planned");
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

export function detectActionObservationPattern(
  occurrencesRaw: ActionOccurrenceSignal[],
): AggregationKind | null {
  const occurrences = sortedOccurrences(occurrencesRaw);
  if (occurrences.length === 0) return null;
  const counts = statusCounts(occurrences);
  const repeatedOutcome = Math.max(
    counts.done ?? 0,
    counts.partial ?? 0,
    counts.missed ?? 0,
    counts.rescheduled ?? 0,
  );
  if (occurrences.length >= 3 && repeatedOutcome >= 3) {
    return "streak_summary";
  }
  const weekCount = new Set(
    occurrences.map((occurrence) => cleanText(occurrence.week_start_date))
      .filter(Boolean),
  ).size;
  if (occurrences.length >= 2 && weekCount <= 1) return "week_summary";
  return "single_occurrence";
}

function domainKeyFor(occurrences: ActionOccurrenceSignal[]): string {
  const counts = statusCounts(occurrences);
  if ((counts.rescheduled ?? 0) > 0) return "habitudes.reprise_apres_echec";
  return "habitudes.execution";
}

function statusLabel(status: string): string {
  if (status === "done") return "faite";
  if (status === "partial") return "partielle";
  if (status === "missed") return "non faite";
  if (status === "rescheduled") return "decalee";
  return status;
}

function observationText(args: {
  title: string;
  occurrences: ActionOccurrenceSignal[];
  aggregation_kind: AggregationKind;
}): string {
  const counts = statusCounts(args.occurrences);
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "planned";
  if (args.aggregation_kind === "streak_summary") {
    return `${args.title} ressort ${
      statusLabel(dominant)
    } sur ${args.occurrences.length} occurrences recentes.`;
  }
  if (args.aggregation_kind === "week_summary") {
    return `${args.title} a eu ${args.occurrences.length} signal(s) cette semaine, surtout ${
      statusLabel(dominant)
    }.`;
  }
  return `${args.title} est ${
    statusLabel(cleanText(args.occurrences[0]?.status, "planned"))
  }.`;
}

function statusFromEntryOutcome(value: unknown): ActionOccurrenceStatus | null {
  const raw = cleanText(value);
  if (raw === "completed") return "done";
  if (raw === "partial") return "partial";
  if (raw === "missed") return "missed";
  if (raw === "rescheduled") return "rescheduled";
  if (raw === "done") return "done";
  return null;
}

function entriesFromPlanSignal(signal: PlanSignal): ActionOccurrenceSignal[] {
  const variant = signal.action_variant &&
      typeof signal.action_variant === "object"
    ? signal.action_variant as Record<string, unknown>
    : {};
  const entries = Array.isArray(variant.recent_entry_outcomes)
    ? variant.recent_entry_outcomes
    : [];
  return entries.flatMap((entry, index): ActionOccurrenceSignal[] => {
    const row = entry && typeof entry === "object"
      ? entry as Record<string, unknown>
      : {};
    const status = statusFromEntryOutcome(row.outcome);
    if (!status) return [];
    const occurrenceId = cleanText(signal.occurrence_ids?.[index]) ||
      cleanText(row.occurrence_id) ||
      cleanText(row.entry_id) ||
      `${signal.plan_item_id}:${cleanText(row.effective_at) || index}`;
    return [{
      id: occurrenceId,
      plan_item_id: signal.plan_item_id,
      title: signal.title ?? null,
      status,
      week_start_date: cleanText(row.week_start_date) || null,
      planned_day: cleanText(row.planned_day) || null,
      validated_at: cleanText(row.effective_at) || null,
      updated_at: cleanText(row.effective_at) || null,
      created_at: cleanText(row.created_at) || null,
    }];
  });
}

export function buildStructuredActionObservationItems(args: {
  source_message_ids: string[];
  plan_signals: PlanSignal[];
  source?: string | null;
  max_items?: number;
}): ExtractedMemoryItem[] {
  const sourceMessageIds = uniqueStrings(args.source_message_ids);
  if (sourceMessageIds.length === 0) return [];
  const maxItems = Math.max(1, Math.min(20, Number(args.max_items ?? 20)));
  const items: ExtractedMemoryItem[] = [];
  const seen = new Set<string>();
  for (const signal of args.plan_signals) {
    const planItemId = cleanText(signal.plan_item_id);
    if (!planItemId) continue;
    const occurrences = entriesFromPlanSignal(signal);
    if (occurrences.length === 0) continue;
    const item = buildActionObservationItem({
      source_message_ids: sourceMessageIds,
      plan_item_id: planItemId,
      title: cleanText(signal.title, "Action"),
      occurrences,
      observation_window_start: signal.observation_window_start ?? null,
      observation_window_end: signal.observation_window_end ?? null,
    });
    if (!item) continue;
    const key = cleanText(item.canonical_key_hint);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    items.push({
      ...item,
      metadata: {
        ...(item.metadata ?? {}),
        memory_type: "action_execution_observation",
        source_event_log: true,
        structured_extraction_source: cleanText(args.source) ||
          "user_plan_item_entries",
        plan_item_id: planItemId,
        action_family_key: signal.action_family_key ?? null,
        action_variant: signal.action_variant ?? null,
      },
    });
    if (items.length >= maxItems) break;
  }
  return items;
}

export function buildActionObservationItem(args: {
  source_message_ids: string[];
  plan_item_id: string;
  title: string;
  occurrences: ActionOccurrenceSignal[];
  observation_window_start?: string | null;
  observation_window_end?: string | null;
}): ExtractedMemoryItem | null {
  const occurrences = sortedOccurrences(args.occurrences)
    .filter((occurrence) => occurrence.plan_item_id === args.plan_item_id);
  const aggregationKind = detectActionObservationPattern(occurrences);
  if (!aggregationKind) return null;
  const title = cleanText(args.title, occurrences[0]?.title ?? "Action");
  const start = args.observation_window_start ??
    occurrenceTime(occurrences[0]) ?? null;
  const end = args.observation_window_end ??
    occurrenceTime(occurrences[occurrences.length - 1]) ?? start;
  const occurrenceIds = occurrences.map((occurrence) => occurrence.id);
  return {
    kind: "action_observation",
    content_text: observationText({
      title,
      occurrences,
      aggregation_kind: aggregationKind,
    }),
    normalized_summary: observationText({
      title,
      occurrences,
      aggregation_kind: aggregationKind,
    }),
    domain_keys: [domainKeyFor(occurrences)],
    confidence: aggregationKind === "single_occurrence" ? 0.76 : 0.82,
    importance_score: aggregationKind === "single_occurrence" ? 0.55 : 0.7,
    sensitivity_level: "normal",
    sensitivity_categories: [],
    source_message_ids: args.source_message_ids,
    evidence_quote: null,
    event_start_at: start,
    event_end_at: end,
    time_precision: aggregationKind === "single_occurrence" ? "day" : "week",
    topic_hint: title,
    canonical_key_hint:
      `action_observation:${args.plan_item_id}:${aggregationKind}:${
        occurrenceIds.join(",")
      }`,
    metadata: {
      observation_role: aggregationKind,
      plan_item_id: args.plan_item_id,
      occurrence_ids: occurrenceIds,
    },
  };
}

export function buildActionLinkFromOccurrences(args: {
  item: ExtractedMemoryItem;
  plan_item_id: string;
  occurrences: ActionOccurrenceSignal[];
}): ActionLinkDecision | null {
  if (args.item.kind !== "action_observation") return null;
  const aggregationKind = detectActionObservationPattern(args.occurrences);
  if (!aggregationKind) return null;
  const occurrences = sortedOccurrences(args.occurrences)
    .filter((occurrence) => occurrence.plan_item_id === args.plan_item_id);
  const start = args.item.event_start_at ?? occurrenceTime(occurrences[0]) ??
    null;
  const end = args.item.event_end_at ??
    occurrenceTime(occurrences[occurrences.length - 1]) ?? start;
  return {
    item: {
      ...args.item,
      canonical_key: args.item.canonical_key_hint ??
        `action_observation:${args.plan_item_id}:${aggregationKind}`,
    },
    plan_item_id: args.plan_item_id,
    occurrence_ids: occurrences.map((occurrence) => occurrence.id),
    aggregation_kind: aggregationKind,
    observation_window_start: start,
    observation_window_end: end,
    confidence: aggregationKind === "single_occurrence" ? 0.78 : 0.84,
  };
}

export function shouldMaterializePossiblePattern(
  observationsRaw: ExistingActionObservation[],
): boolean {
  const observations = observationsRaw
    .filter((obs) =>
      cleanText(obs.memory_item_id) &&
      cleanText(obs.plan_item_id) &&
      obs.aggregation_kind !== "possible_pattern"
    )
    .slice()
    .sort((left, right) =>
      parseMs(left.observation_window_start ?? left.created_at) -
      parseMs(right.observation_window_start ?? right.created_at)
    );
  if (observations.length < 3) return false;
  const first = parseMs(
    observations[0].observation_window_start ?? observations[0].created_at,
  );
  const last = parseMs(
    observations[observations.length - 1].observation_window_end ??
      observations[observations.length - 1].observation_window_start ??
      observations[observations.length - 1].created_at,
  );
  if (!first || !last) return false;
  return last - first >= 13 * 86_400_000;
}

export function buildPossiblePatternObservation(args: {
  plan_item_id: string;
  action_family_key?: string | null;
  title?: string | null;
  observations: ExistingActionObservation[];
  iso_week_key: string;
}): {
  content_text: string;
  domain_keys: string[];
  observation_window_start: string | null;
  observation_window_end: string | null;
  canonical_key: string;
  metadata: Record<string, unknown>;
} | null {
  if (!shouldMaterializePossiblePattern(args.observations)) return null;
  const observations = args.observations.slice().sort((left, right) =>
    parseMs(left.observation_window_start ?? left.created_at) -
    parseMs(right.observation_window_start ?? right.created_at)
  );
  const title = cleanText(args.title, "Une action");
  return {
    content_text:
      `${title} montre un pattern possible sur ${observations.length} observations en au moins deux semaines.`,
    domain_keys: [
      ...new Set(observations.flatMap((obs) => obs.domain_keys ?? [])),
    ].slice(0, 4),
    observation_window_start: observations[0].observation_window_start ??
      observations[0].created_at ?? null,
    observation_window_end:
      observations[observations.length - 1].observation_window_end ??
        observations[observations.length - 1].created_at ?? null,
    canonical_key: `action_possible_pattern:${
      cleanText(args.action_family_key) || args.plan_item_id
    }:${args.iso_week_key}`,
    metadata: {
      memory_type: "action_execution_profile",
      observation_role: "possible_pattern",
      structured_extraction_source: "weekly_adaptive_review_v1",
      source_observation_ids: observations.map((obs) => obs.memory_item_id),
      plan_item_id: args.plan_item_id,
      action_family_key: cleanText(args.action_family_key) || null,
      iso_week_key: args.iso_week_key,
    },
  };
}
