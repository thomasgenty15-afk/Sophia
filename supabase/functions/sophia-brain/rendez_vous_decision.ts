/**
 * Rendez-vous decision layer — sits above the proactive windows engine and
 * determines whether a proactive window should produce a rendez-vous
 * (in `user_rendez_vous`) rather than a simple nudge (in `scheduled_checkins`).
 *
 * The proactive windows engine remains a pure function; this module consumes
 * its output, enriches it with additional context (repair mode history, weekly
 * bilan decisions, event memory, relation preferences), and decides the
 * delivery channel.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { DEFAULT_TIMEZONE } from "../_shared/v2-constants.ts";
import type {
  ConfidenceLevel,
  ConversationPulse,
  ProactiveBudgetClass,
  RendezVousKind,
  RepairModeState,
  UserRelationPreferencesRow,
  WeeklyConversationDigest,
  WeeklyDecision,
} from "../_shared/v2-types.ts";
import type {
  ActiveTransformationRuntime,
  PlanItemRuntimeRow,
} from "../_shared/v2-runtime.ts";
import type {
  ProactiveWindowOutput,
  UpcomingEvent,
} from "./proactive_windows_engine.ts";
import { evaluateProactiveWindow } from "./proactive_windows_engine.ts";
import {
  createRendezVous,
  type CreateRendezVousInput,
  getActiveRendezVous,
} from "../_shared/v2-rendez-vous.ts";
import {
  loadProactiveHistory,
  registerCooldown,
} from "./cooldown_engine.ts";
import { readMomentumStateV2 } from "./momentum_state.ts";
import { getUserRelationPreferences } from "./relation_preferences_engine.ts";
import { readRepairMode } from "./repair_mode_engine.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RendezVousDecisionContext {
  userId: string;
  cycleId: string;
  transformationId: string | null;
  repairMode: RepairModeState | null;
  repairModeExitedAt: string | null;
  lastWeeklyDecision: WeeklyDecision | null;
  lastWeeklyDecidedAt: string | null;
  upcomingEvents: UpcomingEvent[];
  planItems: PlanItemRuntimeRow[];
  nowIso: string;
}

export type RendezVousDecisionResult =
  | { type: "rendez_vous"; kind: RendezVousKind; triggerReason: string }
  | { type: "nudge"; reason: string };

type RendezVousPosture = "gentle" | "supportive" | "preparatory" | "repair";

const REPAIR_MODE_RECENTLY_EXITED_MS = 72 * 60 * 60 * 1000;
const WEEKLY_DECISION_FRESHNESS_MS = 48 * 60 * 60 * 1000;
const WEEKLY_DIGEST_LOOKBACK_MS = 10 * 24 * 60 * 60 * 1000;
const CONVERSATION_PULSE_LOOKBACK_MS = 30 * 60 * 60 * 1000;
const RECENT_VICTORIES_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const UPCOMING_EVENTS_LOOKAHEAD_MS = 21 * 24 * 60 * 60 * 1000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseIsoMs(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function hasConfirmedUpcomingEvent(events: UpcomingEvent[]): boolean {
  return events.length > 0 && events.some((e) => e.scheduled_at?.trim());
}

function repairModeRecentlyExited(
  repairModeExitedAt: string | null,
  nowMs: number,
): boolean {
  if (!repairModeExitedAt) return false;
  const exitedMs = parseIsoMs(repairModeExitedAt);
  return exitedMs > 0 && nowMs - exitedMs < REPAIR_MODE_RECENTLY_EXITED_MS;
}

function weeklyDecisionRecent(
  decidedAt: string | null,
  nowMs: number,
): boolean {
  if (!decidedAt) return false;
  const ms = parseIsoMs(decidedAt);
  return ms > 0 && nowMs - ms < WEEKLY_DECISION_FRESHNESS_MS;
}

function localDayCodeForIso(
  timezoneRaw: unknown,
  iso: string,
): string | null {
  const timezone = cleanText(timezoneRaw) || DEFAULT_TIMEZONE;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const short = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: timezone,
  }).format(date).toLowerCase().slice(0, 3);
  const map: Record<string, string> = {
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
    sun: "sun",
  };
  return map[short] ?? null;
}

function postureForKind(kind: RendezVousKind): RendezVousPosture {
  switch (kind) {
    case "pre_event_grounding":
      return "preparatory";
    case "post_friction_repair":
      return "repair";
    case "weekly_reset":
      return "supportive";
    case "mission_preparation":
      return "preparatory";
    case "transition_handoff":
      return "supportive";
  }
}

function budgetForKind(kind: RendezVousKind): ProactiveBudgetClass {
  switch (kind) {
    case "pre_event_grounding":
    case "post_friction_repair":
    case "mission_preparation":
    case "transition_handoff":
      return "notable";
    case "weekly_reset":
      return "light";
  }
}

// ── Core decision ────────────────────────────────────────────────────────────

export function evaluateRendezVousEligibility(
  proactiveOutput: ProactiveWindowOutput,
  context: RendezVousDecisionContext,
): RendezVousDecisionResult {
  if (
    proactiveOutput.decision !== "create_window" ||
    !proactiveOutput.window_kind
  ) {
    return { type: "nudge", reason: "proactive_not_create_window" };
  }

  const nowMs = parseIsoMs(context.nowIso);

  // 1. pre_event_grounding with confirmed event → rendez-vous
  if (
    proactiveOutput.window_kind === "pre_event_grounding" &&
    hasConfirmedUpcomingEvent(context.upcomingEvents)
  ) {
    const event = context.upcomingEvents[0];
    return {
      type: "rendez_vous",
      kind: "pre_event_grounding",
      triggerReason:
        `Confirmed upcoming event: ${event.title} at ${event.scheduled_at}`,
    };
  }

  // 2. friction detected + repair mode recently exited → post_friction_repair
  if (
    (proactiveOutput.dominant_need === "emotional_protection" ||
      proactiveOutput.dominant_need === "traction_rescue") &&
    repairModeRecentlyExited(context.repairModeExitedAt, nowMs)
  ) {
    return {
      type: "rendez_vous",
      kind: "post_friction_repair",
      triggerReason:
        `Friction detected (${proactiveOutput.dominant_need}) after recent repair mode exit`,
    };
  }

  // 3. Weekly bilan with reduce or consolidate → weekly_reset
  if (
    context.lastWeeklyDecision &&
    (context.lastWeeklyDecision === "reduce" ||
      context.lastWeeklyDecision === "consolidate") &&
    weeklyDecisionRecent(context.lastWeeklyDecidedAt, nowMs)
  ) {
    return {
      type: "rendez_vous",
      kind: "weekly_reset",
      triggerReason:
        `Recent weekly bilan decision: ${context.lastWeeklyDecision}`,
    };
  }

  // Default: regular nudge
  return {
    type: "nudge",
    reason: `no_rendez_vous_criteria_met:${proactiveOutput.window_kind}`,
  };
}

// ── Persistence ──────────────────────────────────────────────────────────────

export async function createRendezVousFromProactiveDecision(
  supabase: SupabaseClient,
  decision: Extract<RendezVousDecisionResult, { type: "rendez_vous" }>,
  proactiveOutput: ProactiveWindowOutput,
  context: RendezVousDecisionContext,
): Promise<string> {
  const activeRdvs = await getActiveRendezVous(
    supabase,
    context.userId,
    context.cycleId,
  );
  const alreadyHasSameKind = activeRdvs.some(
    (rdv) => rdv.kind === decision.kind,
  );
  if (alreadyHasSameKind) {
    throw new Error(
      `Active rendez-vous of kind "${decision.kind}" already exists for cycle "${context.cycleId}".`,
    );
  }

  const input: CreateRendezVousInput = {
    user_id: context.userId,
    cycle_id: context.cycleId,
    transformation_id: context.transformationId,
    kind: decision.kind,
    budget_class: budgetForKind(decision.kind),
    trigger_reason: decision.triggerReason,
    confidence: proactiveOutput.confidence,
    scheduled_for: proactiveOutput.scheduled_for ?? null,
    posture: postureForKind(decision.kind),
    source_refs: {
      proactive_window_kind: proactiveOutput.window_kind,
      proactive_posture: proactiveOutput.posture,
      proactive_dominant_need: proactiveOutput.dominant_need,
      target_plan_item_ids: proactiveOutput.target_plan_item_ids,
    },
  };

  const row = await createRendezVous(supabase, input, {
    nowIso: context.nowIso,
    enforceRefusedCooldown: true,
  });

  return row.id;
}

// ── Refusal handling ─────────────────────────────────────────────────────────

export async function registerRendezVousRefusal(
  supabase: SupabaseClient,
  rendezVousId: string,
  kind: RendezVousKind,
  cycleId: string,
  transformationId: string | null,
  userId: string,
  nowIso: string,
): Promise<void> {
  const cooldownKey =
    `${kind}:${transformationId ?? cycleId}`;
  await registerCooldown(
    supabase,
    userId,
    "refused_rendez_vous",
    cooldownKey,
    {
      rendez_vous_id: rendezVousId,
      window_kind: kind === "pre_event_grounding"
        ? "pre_event_grounding"
        : undefined,
    },
    nowIso,
  );
}

// ── Context loaders ──────────────────────────────────────────────────────────

export async function loadRecentConversationPulse(
  supabase: SupabaseClient,
  userId: string,
  cycleId: string,
  transformationId: string | null,
  nowIso: string,
): Promise<ConversationPulse | null> {
  const lookbackIso = new Date(
    parseIsoMs(nowIso) - CONVERSATION_PULSE_LOOKBACK_MS,
  ).toISOString();

  let query = supabase
    .from("system_runtime_snapshots")
    .select("payload,created_at")
    .eq("user_id", userId)
    .eq("snapshot_type", "conversation_pulse")
    .eq("cycle_id", cycleId)
    .gte("created_at", lookbackIso)
    .order("created_at", { ascending: false })
    .limit(1);

  if (transformationId) {
    query = query.eq("transformation_id", transformationId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data || !data.payload || typeof data.payload !== "object") return null;
  return data.payload as ConversationPulse;
}

export async function loadRecentWeeklyDigest(
  supabase: SupabaseClient,
  userId: string,
  cycleId: string,
  transformationId: string | null,
  nowIso: string,
): Promise<WeeklyConversationDigest | null> {
  const lookbackIso = new Date(
    parseIsoMs(nowIso) - WEEKLY_DIGEST_LOOKBACK_MS,
  ).toISOString();

  let query = supabase
    .from("system_runtime_snapshots")
    .select("payload,created_at")
    .eq("user_id", userId)
    .eq("snapshot_type", "weekly_digest")
    .eq("cycle_id", cycleId)
    .gte("created_at", lookbackIso)
    .order("created_at", { ascending: false })
    .limit(1);

  if (transformationId) {
    query = query.eq("transformation_id", transformationId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data || !data.payload || typeof data.payload !== "object") return null;
  return data.payload as WeeklyConversationDigest;
}

export async function loadUpcomingEvents(
  supabase: SupabaseClient,
  userId: string,
  nowIso: string,
): Promise<UpcomingEvent[]> {
  const upcomingWindowIso = new Date(
    parseIsoMs(nowIso) + UPCOMING_EVENTS_LOOKAHEAD_MS,
  ).toISOString();

  const { data, error } = await supabase
    .from("user_event_memories")
    .select("title,event_type,starts_at,status")
    .eq("user_id", userId)
    .in("status", ["upcoming", "active"] as any)
    .not("starts_at", "is", null)
    .lte("starts_at", upcomingWindowIso)
    .order("starts_at", { ascending: true })
    .limit(3);

  if (error) throw error;

  return Array.isArray(data)
    ? data.map((row) => ({
      title: cleanText((row as Record<string, unknown>).title) ||
        "Evenement proche",
      scheduled_at: cleanText((row as Record<string, unknown>).starts_at),
      event_type:
        cleanText((row as Record<string, unknown>).event_type) || "generic",
      source: "user_event_memories",
    })).filter((row) => row.scheduled_at)
    : [];
}

async function loadRecentVictoryTitles(
  supabase: SupabaseClient,
  userId: string,
  cycleId: string,
  transformationId: string | null,
  nowIso: string,
): Promise<string[]> {
  const lookbackIso = new Date(
    parseIsoMs(nowIso) - RECENT_VICTORIES_LOOKBACK_MS,
  ).toISOString();

  let query = supabase
    .from("user_victory_ledger")
    .select("title")
    .eq("user_id", userId)
    .eq("cycle_id", cycleId)
    .gte("created_at", lookbackIso)
    .order("created_at", { ascending: false })
    .limit(5);

  if (transformationId) {
    query = query.eq("transformation_id", transformationId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return Array.isArray(data)
    ? data.map((row) => cleanText((row as Record<string, unknown>).title))
      .filter(Boolean)
    : [];
}

export async function resolveRendezVousDecisionForRuntime(args: {
  supabase: SupabaseClient;
  userId: string;
  runtime: ActiveTransformationRuntime;
  planItems: PlanItemRuntimeRow[];
  tempMemory: unknown;
  timezone: string;
  nowIso: string;
  relationPreferences?: UserRelationPreferencesRow | null;
}): Promise<{
  proactiveOutput: ProactiveWindowOutput;
  decision: RendezVousDecisionResult;
  context: RendezVousDecisionContext;
}> {
  const cycleId = cleanText(args.runtime.cycle?.id);
  if (!cycleId) {
    throw new Error("Rendez-vous decision requires an active cycle.");
  }

  const transformationId = cleanText(args.runtime.transformation?.id) || null;
  const relationPreferences = args.relationPreferences ??
    await getUserRelationPreferences(args.supabase as any, args.userId).catch(
      () => null,
    );
  const momentumV2 = readMomentumStateV2(args.tempMemory);
  const repairMode = readRepairMode(args.tempMemory);

  const [
    proactiveHistory,
    conversationPulse,
    weeklyDigest,
    upcomingEvents,
    recentVictoryTitles,
    repairModeExitedAt,
    weeklyDecisionResult,
  ] = await Promise.all([
    loadProactiveHistory(args.supabase, args.userId, args.nowIso),
    loadRecentConversationPulse(
      args.supabase,
      args.userId,
      cycleId,
      transformationId,
      args.nowIso,
    ),
    loadRecentWeeklyDigest(
      args.supabase,
      args.userId,
      cycleId,
      transformationId,
      args.nowIso,
    ).catch(() => null),
    loadUpcomingEvents(args.supabase, args.userId, args.nowIso),
    loadRecentVictoryTitles(
      args.supabase,
      args.userId,
      cycleId,
      transformationId,
      args.nowIso,
    ),
    loadRepairModeExitedAt(args.supabase, args.userId, args.nowIso),
    loadLastWeeklyBilanDecision(args.supabase, args.userId, args.nowIso),
  ]);

  const proactiveOutput = evaluateProactiveWindow({
    userId: args.userId,
    momentumV2,
    conversationPulse,
    weeklyDigest,
    repairMode,
    relationPreferences,
    proactiveHistory,
    upcomingEvents,
    planItems: args.planItems,
    recentVictoryTitles,
    planDeepWhy: cleanText(
      args.runtime.transformation?.success_definition ??
        args.runtime.transformation?.user_summary,
    ) || null,
    nowIso: args.nowIso,
    timezone: args.timezone,
    localDayCode: localDayCodeForIso(args.timezone, args.nowIso),
  });

  const context: RendezVousDecisionContext = {
    userId: args.userId,
    cycleId,
    transformationId,
    repairMode,
    repairModeExitedAt,
    lastWeeklyDecision: weeklyDecisionResult.decision,
    lastWeeklyDecidedAt: weeklyDecisionResult.decidedAt,
    upcomingEvents,
    planItems: args.planItems,
    nowIso: args.nowIso,
  };

  return {
    proactiveOutput,
    decision: evaluateRendezVousEligibility(proactiveOutput, context),
    context,
  };
}

export async function loadRepairModeExitedAt(
  supabase: SupabaseClient,
  userId: string,
  nowIso: string,
): Promise<string | null> {
  const lookbackIso = new Date(
    parseIsoMs(nowIso) - REPAIR_MODE_RECENTLY_EXITED_MS,
  ).toISOString();

  const { data, error } = await supabase
    .from("system_runtime_snapshots")
    .select("created_at")
    .eq("user_id", userId)
    .eq("snapshot_type", "repair_mode_exited_v2")
    .gte("created_at", lookbackIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return (data as Record<string, unknown>).created_at as string ?? null;
}

export async function loadLastWeeklyBilanDecision(
  supabase: SupabaseClient,
  userId: string,
  nowIso: string,
): Promise<{ decision: WeeklyDecision | null; decidedAt: string | null }> {
  const lookbackIso = new Date(
    parseIsoMs(nowIso) - WEEKLY_DECISION_FRESHNESS_MS,
  ).toISOString();

  const { data, error } = await supabase
    .from("system_runtime_snapshots")
    .select("payload,created_at")
    .eq("user_id", userId)
    .eq("snapshot_type", "weekly_bilan_decided_v2")
    .gte("created_at", lookbackIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { decision: null, decidedAt: null };

  const payload = (data as Record<string, unknown>).payload as Record<
    string,
    unknown
  > | null;
  const decision = payload?.decision as WeeklyDecision | undefined;
  const validDecisions: WeeklyDecision[] = [
    "hold",
    "expand",
    "consolidate",
    "reduce",
  ];
  if (!decision || !validDecisions.includes(decision)) {
    return { decision: null, decidedAt: null };
  }

  return {
    decision,
    decidedAt: (data as Record<string, unknown>).created_at as string ?? null,
  };
}
