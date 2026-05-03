import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import {
  localDateYmdInTimezone,
  mondayWeekStartForLocalDate,
} from "./action_occurrences.ts";

export const MOMENTUM_SNAPSHOT_V2_TYPE = "momentum_state_v2";

export type MomentumSnapshotStateV2 =
  | "healthy"
  | "warming_up"
  | "slipping"
  | "stuck"
  | "silent"
  | "at_risk";

export type MomentumRiskLevelV2 = "low" | "medium" | "high";

export type MomentumInterventionKindV2 =
  | "none"
  | "encourage"
  | "repair"
  | "adjust_next_week_planning"
  | "dashboard_prompt"
  | "winback";

export type MomentumInterventionUrgencyV2 = "low" | "medium" | "high";

export type MomentumPostureV2 =
  | "warm_pragmatic"
  | "light_encouragement"
  | "reduce_pressure"
  | "repair_first"
  | "reopen_door"
  | "hold";

export type MomentumSnapshotV2 = {
  version: 1;
  user_id: string;
  generated_at: string;
  window: {
    from: string;
    to: string;
    days: number;
  };
  state: MomentumSnapshotStateV2;
  risk_level: MomentumRiskLevelV2;
  signals: {
    active_transformations: number;
    planned_actions: number;
    done: number;
    partial: number;
    missed: number;
    unanswered: number;
    rescheduled: number;
    adherence_rate: number;
    current_done_streak: number;
    missed_streak: number;
    last_user_reply_at: string | null;
    days_since_last_user_reply: number | null;
    planning_confirmed: boolean;
    planning_modified_this_week: boolean;
    upcoming_planned_actions_7d: number;
    conversation_risk: MomentumRiskLevelV2 | null;
  };
  interpretation: {
    main_pattern: string;
    confidence: "low" | "medium" | "high";
  };
  recommended_intervention: {
    kind: MomentumInterventionKindV2;
    urgency: MomentumInterventionUrgencyV2;
    posture: MomentumPostureV2;
    reason: string;
  };
};

type DayCode = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const DAY_CODES: DayCode[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export type MomentumOccurrenceRowV2 = {
  id: string;
  transformation_id?: string | null;
  plan_id?: string | null;
  plan_item_id: string;
  week_start_date: string;
  ordinal?: number | null;
  planned_day: DayCode;
  actual_day?: DayCode | null;
  status: "planned" | "done" | "partial" | "missed" | "rescheduled" | string;
};

export type MomentumEntryRowV2 = {
  plan_item_id: string;
  outcome: "completed" | "partial" | "missed" | string;
  effective_at: string;
  created_at?: string | null;
};

export type MomentumWeekPlanRowV2 = {
  status: "pending_confirmation" | "confirmed" | "auto_applied" | string;
  week_start_date: string;
  updated_at?: string | null;
  confirmed_at?: string | null;
};

export type MomentumCheckinRowV2 = {
  event_context?: string | null;
  status?: string | null;
  scheduled_for?: string | null;
  message_payload?: Record<string, unknown> | null;
};

export type MomentumChatMessageRowV2 = {
  role: string;
  created_at: string;
};

export type MomentumConversationPulseRowV2 = {
  payload?: Record<string, unknown> | null;
  created_at?: string | null;
};

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function numberOrZero(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parseDateYmd(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysYmd(ymd: string, days: number): string {
  const date = parseDateYmd(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return formatYmd(date);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function dayOffset(day: DayCode): number {
  return Math.max(0, DAY_CODES.indexOf(day));
}

function occurrenceLocalDate(occurrence: MomentumOccurrenceRowV2): string {
  return addDaysYmd(
    occurrence.week_start_date,
    dayOffset((occurrence.actual_day ?? occurrence.planned_day) as DayCode),
  );
}

function daysBetweenYmd(left: string, right: string): number {
  const diff = parseDateYmd(right).getTime() - parseDateYmd(left).getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

function isoToYmd(iso: string): string {
  return cleanText(iso).slice(0, 10);
}

function entryOutcomeForOccurrence(
  occurrence: MomentumOccurrenceRowV2,
  entries: MomentumEntryRowV2[],
) {
  const targetDate = occurrenceLocalDate(occurrence);
  const entry = entries.find((candidate) =>
    candidate.plan_item_id === occurrence.plan_item_id &&
    isoToYmd(candidate.effective_at) === targetDate &&
    ["completed", "partial", "missed"].includes(candidate.outcome)
  );
  if (!entry) return null;
  return entry.outcome === "completed" || entry.outcome === "partial" ||
      entry.outcome === "missed"
    ? entry.outcome
    : null;
}

function effectiveOccurrenceStatus(
  occurrence: MomentumOccurrenceRowV2,
  entries: MomentumEntryRowV2[],
): "done" | "partial" | "missed" | "rescheduled" | "unanswered" {
  const entryOutcome = entryOutcomeForOccurrence(occurrence, entries);
  if (entryOutcome === "completed") return "done";
  if (entryOutcome === "partial") return "partial";
  if (entryOutcome === "missed") return "missed";
  if (occurrence.status === "done") return "done";
  if (occurrence.status === "partial") return "partial";
  if (occurrence.status === "missed") return "missed";
  if (occurrence.status === "rescheduled") return "rescheduled";
  return "unanswered";
}

function clampRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function currentDoneStreak(
  datedStatuses: Array<{ date: string; status: string }>,
): number {
  let streak = 0;
  for (const item of datedStatuses.slice().reverse()) {
    if (item.status === "done" || item.status === "partial") {
      streak++;
      continue;
    }
    break;
  }
  return streak;
}

function currentMissedStreak(
  datedStatuses: Array<{ date: string; status: string }>,
): number {
  let streak = 0;
  for (const item of datedStatuses.slice().reverse()) {
    if (item.status === "missed" || item.status === "unanswered") {
      streak++;
      continue;
    }
    break;
  }
  return streak;
}

function latestUserReplyAt(
  messages: MomentumChatMessageRowV2[],
): string | null {
  const latest = messages
    .filter((message) => cleanText(message.role).toLowerCase() === "user")
    .map((message) => cleanText(message.created_at))
    .filter(Boolean)
    .sort()
    .at(-1);
  return latest ?? null;
}

function conversationRisk(
  pulse: MomentumConversationPulseRowV2 | null | undefined,
): MomentumRiskLevelV2 | null {
  const payload = isRecord(pulse?.payload) ? pulse?.payload : null;
  const signals = payload && isRecord(payload.signals) ? payload.signals : null;
  const raw = cleanText(signals?.proactive_risk);
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  return null;
}

function interventionFor(args: {
  state: MomentumSnapshotStateV2;
  riskLevel: MomentumRiskLevelV2;
  missedStreak: number;
  planningConfirmed: boolean;
  planned: number;
}): MomentumSnapshotV2["recommended_intervention"] {
  if (args.state === "silent") {
    return {
      kind: "winback",
      urgency: "high",
      posture: "reopen_door",
      reason: "absence de reponse recente malgre un planning actif",
    };
  }
  if (args.state === "at_risk" || args.state === "stuck") {
    return {
      kind: "repair",
      urgency: args.riskLevel === "high" ? "high" : "medium",
      posture: "repair_first",
      reason: "plusieurs echecs ou absences de reponse s'accumulent",
    };
  }
  if (args.state === "slipping") {
    return {
      kind: "adjust_next_week_planning",
      urgency: "medium",
      posture: "reduce_pressure",
      reason: "la semaine semble plus lourde que ce qui est vraiment tenable",
    };
  }
  if (!args.planningConfirmed && args.planned > 0) {
    return {
      kind: "dashboard_prompt",
      urgency: "low",
      posture: "warm_pragmatic",
      reason: "le planning doit rester confirme pour fiabiliser les checks",
    };
  }
  if (args.state === "healthy") {
    return {
      kind: "encourage",
      urgency: "low",
      posture: "light_encouragement",
      reason: "la traction est bonne, il faut surtout renforcer ce qui marche",
    };
  }
  return {
    kind: "none",
    urgency: "low",
    posture: "hold",
    reason: "pas assez de signal fiable pour intervenir utilement",
  };
}

function classifySnapshot(args: {
  planned: number;
  done: number;
  partial: number;
  missed: number;
  unanswered: number;
  adherenceRate: number;
  missedStreak: number;
  daysSinceLastUserReply: number | null;
  conversationRisk: MomentumRiskLevelV2 | null;
}): {
  state: MomentumSnapshotStateV2;
  riskLevel: MomentumRiskLevelV2;
  mainPattern: string;
  confidence: "low" | "medium" | "high";
} {
  const silentWithPlan = args.planned > 0 &&
    args.daysSinceLastUserReply !== null &&
    args.daysSinceLastUserReply >= 7;
  if (silentWithPlan) {
    return {
      state: "silent",
      riskLevel: "high",
      mainPattern: "le user ne repond plus alors que le planning reste actif",
      confidence: "high",
    };
  }

  if (args.conversationRisk === "high") {
    return {
      state: "at_risk",
      riskLevel: "high",
      mainPattern: "les signaux conversationnels indiquent un risque eleve",
      confidence: "medium",
    };
  }

  if (
    args.planned >= 4 &&
    (args.missedStreak >= 3 || args.adherenceRate < 0.25)
  ) {
    return {
      state: "stuck",
      riskLevel: "high",
      mainPattern: "les echecs ou non-reponses dominent sur plusieurs actions",
      confidence: "high",
    };
  }

  if (
    args.planned >= 3 &&
    args.missed + args.unanswered + args.partial > args.done
  ) {
    return {
      state: "slipping",
      riskLevel: "medium",
      mainPattern: "il y a de la traction, mais le planning derape",
      confidence: "medium",
    };
  }

  if (args.planned === 0) {
    return {
      state: "warming_up",
      riskLevel: "low",
      mainPattern: "pas encore assez d'actions datees pour lire le momentum",
      confidence: "low",
    };
  }

  return {
    state: "healthy",
    riskLevel: "low",
    mainPattern: "la trajectoire est assez stable sur la fenetre recente",
    confidence: args.planned >= 3 ? "medium" : "low",
  };
}

export function buildMomentumSnapshotV2FromRows(params: {
  userId: string;
  generatedAt: string;
  windowFrom: string;
  windowTo: string;
  activeTransformationIds?: string[];
  occurrences: MomentumOccurrenceRowV2[];
  entries?: MomentumEntryRowV2[];
  weekPlans?: MomentumWeekPlanRowV2[];
  checkins?: MomentumCheckinRowV2[];
  chatMessages?: MomentumChatMessageRowV2[];
  conversationPulse?: MomentumConversationPulseRowV2 | null;
}): MomentumSnapshotV2 {
  const entries = params.entries ?? [];
  const occurrencesInWindow = params.occurrences.filter((occurrence) => {
    const date = occurrenceLocalDate(occurrence);
    return date >= params.windowFrom && date <= params.windowTo;
  });
  const upcomingTo = addDaysYmd(params.windowTo, 7);
  const upcomingPlanned = params.occurrences.filter((occurrence) => {
    const date = occurrenceLocalDate(occurrence);
    return date > params.windowTo && date <= upcomingTo;
  }).length;

  const datedStatuses = occurrencesInWindow
    .map((occurrence) => ({
      date: occurrenceLocalDate(occurrence),
      status: effectiveOccurrenceStatus(occurrence, entries),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const done = datedStatuses.filter((item) => item.status === "done").length;
  const partial =
    datedStatuses.filter((item) => item.status === "partial").length;
  const missed =
    datedStatuses.filter((item) => item.status === "missed").length;
  const unanswered =
    datedStatuses.filter((item) => item.status === "unanswered").length;
  const rescheduled =
    datedStatuses.filter((item) => item.status === "rescheduled").length;
  const planned = datedStatuses.length;
  const adherenceRate = planned > 0
    ? clampRate((done + partial * 0.5) / planned)
    : 0;

  const lastReplyAt = latestUserReplyAt(params.chatMessages ?? []);
  const generatedLocalDate = isoToYmd(params.generatedAt);
  const daysSinceLastUserReply = lastReplyAt
    ? daysBetweenYmd(isoToYmd(lastReplyAt), generatedLocalDate)
    : null;
  const planningConfirmed = (params.weekPlans ?? []).some((plan) =>
    plan.status === "confirmed" || plan.status === "auto_applied"
  );
  const planningModifiedThisWeek = (params.checkins ?? []).some((checkin) =>
    cleanText(checkin.event_context) === "weekly_planning_confirmation_v2" &&
    cleanText(checkin.message_payload?.confirmation_kind) === "modification"
  );
  const pulseRisk = conversationRisk(params.conversationPulse);
  const missedStreak = currentMissedStreak(datedStatuses);
  const classification = classifySnapshot({
    planned,
    done,
    partial,
    missed,
    unanswered,
    adherenceRate,
    missedStreak,
    daysSinceLastUserReply,
    conversationRisk: pulseRisk,
  });

  return {
    version: 1,
    user_id: params.userId,
    generated_at: params.generatedAt,
    window: {
      from: params.windowFrom,
      to: params.windowTo,
      days: daysBetweenYmd(params.windowFrom, params.windowTo) + 1,
    },
    state: classification.state,
    risk_level: classification.riskLevel,
    signals: {
      active_transformations: (params.activeTransformationIds ?? []).length,
      planned_actions: planned,
      done,
      partial,
      missed,
      unanswered,
      rescheduled,
      adherence_rate: adherenceRate,
      current_done_streak: currentDoneStreak(datedStatuses),
      missed_streak: missedStreak,
      last_user_reply_at: lastReplyAt,
      days_since_last_user_reply: daysSinceLastUserReply,
      planning_confirmed: planningConfirmed,
      planning_modified_this_week: planningModifiedThisWeek,
      upcoming_planned_actions_7d: upcomingPlanned,
      conversation_risk: pulseRisk,
    },
    interpretation: {
      main_pattern: classification.mainPattern,
      confidence: classification.confidence,
    },
    recommended_intervention: interventionFor({
      state: classification.state,
      riskLevel: classification.riskLevel,
      missedStreak,
      planningConfirmed,
      planned,
    }),
  };
}

export function selectMomentumIntervention(
  snapshot: MomentumSnapshotV2,
): MomentumSnapshotV2["recommended_intervention"] | null {
  return snapshot.recommended_intervention.kind === "none"
    ? null
    : snapshot.recommended_intervention;
}

async function loadActiveRuntimeRefs(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  cycleId: string | null;
  transformationIds: string[];
  planIds: string[];
}> {
  const cycleResult = await supabase
    .from("user_cycles")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cycleResult.error) throw cycleResult.error;
  const cycleId = cleanText((cycleResult.data as { id?: string } | null)?.id) ||
    null;
  if (!cycleId) return { cycleId: null, transformationIds: [], planIds: [] };

  const [transformationsResult, plansResult] = await Promise.all([
    supabase
      .from("user_transformations")
      .select("id")
      .eq("cycle_id", cycleId)
      .eq("status", "active"),
    supabase
      .from("user_plans_v2")
      .select("id")
      .eq("user_id", userId)
      .eq("cycle_id", cycleId)
      .eq("status", "active"),
  ]);
  if (transformationsResult.error) throw transformationsResult.error;
  if (plansResult.error) throw plansResult.error;

  return {
    cycleId,
    transformationIds: ((transformationsResult.data ?? []) as Array<
      { id?: string }
    >).map((row) => cleanText(row.id)).filter(Boolean),
    planIds: ((plansResult.data ?? []) as Array<{ id?: string }>).map((row) =>
      cleanText(row.id)
    ).filter(Boolean),
  };
}

export async function loadMomentumSnapshotV2(
  supabase: SupabaseClient,
  params: {
    userId: string;
    timezone?: string | null;
    now?: Date;
    windowDays?: number;
  },
): Promise<{ snapshot: MomentumSnapshotV2; cycleId: string | null }> {
  const now = params.now ?? new Date();
  const generatedAt = now.toISOString();
  const timezone = cleanText(params.timezone, "Europe/Paris");
  const windowDays = Math.max(
    1,
    Math.min(21, numberOrZero(params.windowDays) || 7),
  );
  const windowTo = localDateYmdInTimezone(timezone, now);
  const windowFrom = addDaysYmd(windowTo, 1 - windowDays);
  const occurrenceWeekFrom = mondayWeekStartForLocalDate(windowFrom);
  const occurrenceWeekTo = mondayWeekStartForLocalDate(addDaysYmd(windowTo, 7));
  const runtimeRefs = await loadActiveRuntimeRefs(supabase, params.userId);

  const [
    occurrencesResult,
    entriesResult,
    weekPlansResult,
    checkinsResult,
    messagesResult,
    pulseResult,
  ] = await Promise.all([
    supabase
      .from("user_habit_week_occurrences")
      .select(
        "id,transformation_id,plan_id,plan_item_id,week_start_date,ordinal,planned_day,actual_day,status",
      )
      .eq("user_id", params.userId)
      .gte("week_start_date", occurrenceWeekFrom)
      .lte("week_start_date", occurrenceWeekTo),
    supabase
      .from("user_plan_item_entries")
      .select("plan_item_id,outcome,effective_at,created_at")
      .eq("user_id", params.userId)
      .gte("effective_at", `${windowFrom}T00:00:00.000Z`)
      .lte("effective_at", `${addDaysYmd(windowTo, 1)}T00:00:00.000Z`),
    supabase
      .from("user_habit_week_plans")
      .select("status,week_start_date,updated_at,confirmed_at")
      .eq("user_id", params.userId)
      .gte("week_start_date", occurrenceWeekFrom)
      .lte("week_start_date", occurrenceWeekTo),
    supabase
      .from("scheduled_checkins")
      .select("event_context,status,scheduled_for,message_payload")
      .eq("user_id", params.userId)
      .gte("scheduled_for", `${windowFrom}T00:00:00.000Z`)
      .lte("scheduled_for", `${addDaysYmd(windowTo, 1)}T00:00:00.000Z`),
    supabase
      .from("chat_messages")
      .select("role,created_at")
      .eq("user_id", params.userId)
      .eq("scope", "whatsapp")
      .gte("created_at", `${addDaysYmd(windowFrom, -14)}T00:00:00.000Z`)
      .lte("created_at", `${addDaysYmd(windowTo, 1)}T00:00:00.000Z`)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("system_runtime_snapshots")
      .select("payload,created_at")
      .eq("user_id", params.userId)
      .eq("snapshot_type", "conversation_pulse")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (occurrencesResult.error) throw occurrencesResult.error;
  if (entriesResult.error) throw entriesResult.error;
  if (weekPlansResult.error) throw weekPlansResult.error;
  if (checkinsResult.error) throw checkinsResult.error;
  if (messagesResult.error) throw messagesResult.error;
  if (pulseResult.error) throw pulseResult.error;

  const snapshot = buildMomentumSnapshotV2FromRows({
    userId: params.userId,
    generatedAt,
    windowFrom,
    windowTo,
    activeTransformationIds: runtimeRefs.transformationIds,
    occurrences: (occurrencesResult.data ?? []) as MomentumOccurrenceRowV2[],
    entries: (entriesResult.data ?? []) as MomentumEntryRowV2[],
    weekPlans: (weekPlansResult.data ?? []) as MomentumWeekPlanRowV2[],
    checkins: (checkinsResult.data ?? []) as MomentumCheckinRowV2[],
    chatMessages: (messagesResult.data ?? []) as MomentumChatMessageRowV2[],
    conversationPulse:
      (pulseResult.data as MomentumConversationPulseRowV2 | null) ?? null,
  });

  return { snapshot, cycleId: runtimeRefs.cycleId };
}

export async function persistMomentumSnapshotV2(
  supabase: SupabaseClient,
  params: {
    userId: string;
    snapshot: MomentumSnapshotV2;
    cycleId?: string | null;
    transformationId?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("system_runtime_snapshots")
    .insert({
      user_id: params.userId,
      cycle_id: params.cycleId ?? null,
      transformation_id: params.transformationId ?? null,
      snapshot_type: MOMENTUM_SNAPSHOT_V2_TYPE,
      payload: params.snapshot,
    } as never);
  if (error) throw error;
}
