import type { TopicCompactionTopic } from "./compaction/types.ts";
import { selectTopicsForCompaction } from "./compaction/trigger.ts";
import {
  buildPossiblePatternObservation,
  type ExistingActionObservation,
} from "./memorizer/action_observations.ts";

export interface IsoWeekKey {
  iso_year: number;
  iso_week: number;
  key: string;
}

export interface WeeklyReviewUser {
  id: string;
  timezone?: string | null;
}

export function localDatePartsInTimezone(
  timezoneRaw: unknown,
  now = new Date(),
): { year: number; month: number; day: number; weekday: string; hour: number } {
  const timezone = String(timezoneRaw ?? "").trim() || "Europe/Paris";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) =>
    String(parts.find((part) => part.type === type)?.value ?? "");
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: value("weekday").toLowerCase(),
    hour: Number(value("hour")),
  };
}

function isoWeekForDate(year: number, month: number, day: number): IsoWeekKey {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return {
    iso_year: isoYear,
    iso_week: isoWeek,
    key: `${isoYear}-W${String(isoWeek).padStart(2, "0")}`,
  };
}

export function isoWeekKeyForTimezone(
  timezone: string,
  now = new Date(),
): IsoWeekKey {
  const local = localDatePartsInTimezone(timezone, now);
  return isoWeekForDate(local.year, local.month, local.day);
}

export function isSundayEveningInTimezone(
  timezone: string,
  now = new Date(),
): boolean {
  const local = localDatePartsInTimezone(timezone, now);
  return local.weekday.startsWith("sun") && local.hour >= 18;
}

export function selectUsersDueForWeeklyReview(args: {
  users: WeeklyReviewUser[];
  now?: Date;
  force?: boolean;
}): WeeklyReviewUser[] {
  if (args.force) return args.users;
  return args.users.filter((user) =>
    isSundayEveningInTimezone(user.timezone ?? "Europe/Paris", args.now)
  );
}

export function selectWeeklyReviewTopics(
  topics: TopicCompactionTopic[],
): Array<TopicCompactionTopic & { compaction_reason: string }> {
  return selectTopicsForCompaction(topics, {
    trigger_type: "weekly_review",
    threshold: 1,
  });
}

export interface PossiblePatternCandidate {
  plan_item_id: string;
  title?: string | null;
  observations: ExistingActionObservation[];
}

export function groupPossiblePatternCandidates(
  observations: ExistingActionObservation[],
): PossiblePatternCandidate[] {
  const groups = new Map<string, ExistingActionObservation[]>();
  for (const observation of observations) {
    if (!observation.plan_item_id) continue;
    if (observation.aggregation_kind === "possible_pattern") continue;
    const list = groups.get(observation.plan_item_id) ?? [];
    list.push(observation);
    groups.set(observation.plan_item_id, list);
  }
  return [...groups.entries()].map(([planItemId, rows]) => ({
    plan_item_id: planItemId,
    title: rows[0]?.content_text ?? null,
    observations: rows,
  }));
}

export function buildWeeklyPossiblePatternRows(args: {
  candidates: PossiblePatternCandidate[];
  iso_week_key: string;
}): Array<{
  plan_item_id: string;
  content_text: string;
  domain_keys: string[];
  observation_window_start: string | null;
  observation_window_end: string | null;
  canonical_key: string;
  metadata: Record<string, unknown>;
}> {
  return args.candidates.flatMap((candidate) => {
    const row = buildPossiblePatternObservation({
      plan_item_id: candidate.plan_item_id,
      title: candidate.title,
      observations: candidate.observations,
      iso_week_key: args.iso_week_key,
    });
    return row ? [{ plan_item_id: candidate.plan_item_id, ...row }] : [];
  });
}
