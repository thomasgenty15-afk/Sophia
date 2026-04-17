import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { DEFAULT_TIMEZONE } from "../_shared/v2-constants.ts";
import { getMomentumPolicyDefinition } from "./momentum_policy.ts";
import {
  type MomentumMetrics,
  type MomentumStateLabel,
  readMomentumStateV2,
  type StoredMomentumV2,
  summarizeMomentumBlockersForPrompt,
} from "./momentum_state.ts";
import {
  type CurrentPhaseRuntimeContext,
  getActiveTransformationRuntime,
  getScopedPlanItemRuntime,
  type PlanItemRuntimeRow,
} from "../_shared/v2-runtime.ts";
import type {
  ConfidenceLevel,
  ConversationPulse,
  MomentumStateV2,
  MorningNudgePosture,
} from "../_shared/v2-types.ts";
import type { RepairModeEnteredPayload } from "../_shared/v2-events.ts";
import {
  COOLDOWN_DURATIONS_MS,
  loadProactiveHistory,
  type ProactiveHistoryEntry,
  validatePostureWithCooldown,
} from "./cooldown_engine.ts";
import {
  activateRepairMode,
  buildRepairModeEnteredPayload,
  countConsecutiveNoEcho,
  countConsentDeclines,
  evaluateRepairModeEntry,
  readRepairMode,
  writeRepairMode,
} from "./repair_mode_engine.ts";

export const MORNING_ACTIVE_ACTIONS_EVENT_CONTEXT =
  "morning_active_actions_nudge";
export const MORNING_NUDGE_V2_EVENT_CONTEXT = "morning_nudge_v2";

const MORNING_NUDGE_EVENT_CONTEXTS = [
  MORNING_ACTIVE_ACTIONS_EVENT_CONTEXT,
  MORNING_NUDGE_V2_EVENT_CONTEXT,
] as const;

export type MomentumMorningStrategy =
  | "generic_focus"
  | "focus_today"
  | "simplify_today"
  | "light_touch_today"
  | "support_softly"
  | "open_door_morning";

export interface MorningNudgePayloadSnapshot {
  slot_day_offset: number | null;
  slot_weekday: string | null;
  today_action_titles: string[];
  today_framework_titles: string[];
  today_vital_sign_titles: string[];
  today_item_titles: string[];
  active_action_titles: string[];
  active_framework_titles: string[];
  active_vital_sign_titles: string[];
  active_item_titles: string[];
  plan_deep_why?: string | null;
  plan_blockers?: string | null;
  plan_low_motivation_message?: string | null;
}

export interface MomentumMorningPlan {
  decision: "send" | "skip";
  reason: string;
  state: MomentumStateLabel | null;
  strategy: MomentumMorningStrategy | null;
  relevance: "high" | "medium" | "low" | "blocked";
  instruction?: string;
  event_grounding?: string;
  fallback_text?: string;
}

function cleanText(v: unknown, fallback = ""): string {
  const text = String(v ?? "").trim();
  return text || fallback;
}

function uniq(items: string[]): string[] {
  return [...new Set(items.map((item) => cleanText(item)).filter(Boolean))];
}

function normalizeTitle(title: string): string {
  return cleanText(title).toLowerCase();
}

function formatMetricLine(label: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const text = cleanText(value);
  return text ? `${label}: ${text}` : null;
}

function listToText(items: string[], fallback: string): string {
  const clean = uniq(items);
  if (clean.length === 0) return fallback;
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} et ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} et ${clean[clean.length - 1]}`;
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? uniq(value.map((item) => cleanText(item))) : [];
}

export function parseMorningNudgePayload(
  payload: unknown,
): MorningNudgePayloadSnapshot {
  const row = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {};
  return {
    slot_day_offset: Number.isFinite(Number(row.slot_day_offset))
      ? Math.max(0, Math.floor(Number(row.slot_day_offset)))
      : null,
    slot_weekday: cleanText(row.slot_weekday) || null,
    today_action_titles: parseStringArray(row.today_action_titles),
    today_framework_titles: parseStringArray(row.today_framework_titles),
    today_vital_sign_titles: parseStringArray(row.today_vital_sign_titles),
    today_item_titles: parseStringArray(row.today_item_titles),
    active_action_titles: parseStringArray(row.active_action_titles),
    active_framework_titles: parseStringArray(row.active_framework_titles),
    active_vital_sign_titles: parseStringArray(row.active_vital_sign_titles),
    active_item_titles: parseStringArray(row.active_item_titles),
    plan_deep_why: cleanText(row.plan_deep_why) || null,
    plan_blockers: cleanText(row.plan_blockers) || null,
    plan_low_motivation_message: cleanText(row.plan_low_motivation_message) ||
      null,
  };
}

function buildGrounding(args: {
  state: MomentumStateLabel | null;
  strategy: MomentumMorningStrategy;
  metrics: MomentumMetrics;
  payload: MorningNudgePayloadSnapshot;
  topBlockerSummary: string | null;
}): string {
  const primaryItems = args.payload.today_item_titles.length > 0
    ? args.payload.today_item_titles
    : args.payload.active_item_titles;
  const lines = [
    `event=morning_momentum_nudge`,
    `state=${args.state ?? "missing"}`,
    `strategy=${args.strategy}`,
    formatMetricLine(
      "days_since_last_user_message",
      args.metrics.days_since_last_user_message,
    ),
    formatMetricLine("completed_actions_7d", args.metrics.completed_actions_7d),
    formatMetricLine("missed_actions_7d", args.metrics.missed_actions_7d),
    formatMetricLine("partial_actions_7d", args.metrics.partial_actions_7d),
    formatMetricLine("emotional_high_72h", args.metrics.emotional_high_72h),
    formatMetricLine(
      "consent_explicit_stops_7d",
      args.metrics.consent_explicit_stops_7d,
    ),
    primaryItems.length > 0 ? `today_items=${primaryItems.join(" | ")}` : null,
    args.payload.active_item_titles.length > 0
      ? `active_items=${args.payload.active_item_titles.join(" | ")}`
      : null,
    args.topBlockerSummary ? `top_blocker=${args.topBlockerSummary}` : null,
    args.payload.plan_deep_why
      ? `deep_why=${args.payload.plan_deep_why}`
      : null,
    args.payload.plan_low_motivation_message
      ? `low_motivation_message=${args.payload.plan_low_motivation_message}`
      : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function sameTitle(a: string, b: string): boolean {
  return normalizeTitle(a) === normalizeTitle(b);
}

export function buildMomentumMorningPlan(args: {
  tempMemory: any;
  payload: unknown;
}): MomentumMorningPlan {
  const momentum = readMomentumStateV2(args.tempMemory);
  const state = momentum.current_state ?? null;
  const payload = parseMorningNudgePayload(args.payload);
  const metrics = {
    days_since_last_user_message:
      momentum._internal.metrics_cache.days_since_last_user_message ?? null,
  } as MomentumMetrics;
  const primaryItems = payload.today_item_titles.length > 0
    ? payload.today_item_titles
    : payload.active_item_titles;
  const topBlockerTitle = String(momentum.assessment.top_blocker ?? "").trim();
  const blockerPrompt = summarizeMomentumBlockersForPrompt(momentum, 1)[0] ??
    null;
  const blockerHitsToday = Boolean(
    topBlockerTitle &&
      primaryItems.some((item) => sameTitle(item, topBlockerTitle)),
  );

  if (primaryItems.length === 0) {
    return {
      decision: "skip",
      reason: "momentum_morning_nudge_no_items",
      state,
      strategy: null,
      relevance: "blocked",
    };
  }

  if (state === "pause_consentie") {
    return {
      decision: "skip",
      reason: "momentum_morning_nudge_pause_consentie",
      state,
      strategy: null,
      relevance: "blocked",
    };
  }

  if (state) {
    const policy = getMomentumPolicyDefinition(state);
    if (
      policy.proactive_policy === "none" || policy.max_proactive_per_7d <= 0
    ) {
      return {
        decision: "skip",
        reason: `momentum_morning_nudge_blocked:${state}:no_proactive`,
        state,
        strategy: null,
        relevance: "blocked",
      };
    }
  }

  if (
    state === "soutien_emotionnel" ||
    Number(metrics.emotional_high_72h ?? 0) > 0
  ) {
    const strategy: MomentumMorningStrategy = "support_softly";
    return {
      decision: "send",
      reason: state === "soutien_emotionnel"
        ? "momentum_morning_nudge_support:soutien_emotionnel"
        : "momentum_morning_nudge_support:recent_high_emotion",
      state,
      strategy,
      relevance: "medium",
      fallback_text:
        "Je te laisse juste un message doux ce matin. Pas besoin de performer quoi que ce soit la tout de suite, tu peux deja prendre soin de toi aujourd'hui.",
      instruction:
        "Message WhatsApp du matin, tres court, tres doux. Tu n'es PAS dans un nudge d'actions. Tu n'insistes sur aucune action du jour. Tu reconnais sobrement que le contexte recent peut demander de la douceur, puis tu laisses une ouverture simple et non pressante. Aucune accountability, aucune culpabilisation, aucune logique de performance.",
      event_grounding: buildGrounding({
        state,
        strategy,
        metrics,
        payload,
        topBlockerSummary: blockerPrompt,
      }),
    };
  }

  if (state === "reactivation") {
    const strategy: MomentumMorningStrategy = "open_door_morning";
    return {
      decision: "send",
      reason: "momentum_morning_nudge_open_door",
      state,
      strategy,
      relevance: "low",
      fallback_text:
        "Je passe juste te laisser un point d'appui tres simple pour aujourd'hui. Si tu veux reprendre un petit cap a ton rythme, je suis la.",
      instruction:
        "Message WhatsApp du matin, tres leger, porte ouverte. Tu n'evoques ni absence, ni retard, ni echec. Tu peux mentionner un cap simple pour aujourd'hui, mais sans pression et sans ton de pilotage. Une seule question max, optionnelle.",
      event_grounding: buildGrounding({
        state,
        strategy,
        metrics,
        payload,
        topBlockerSummary: blockerPrompt,
      }),
    };
  }

  if (state === "evitement") {
    const strategy: MomentumMorningStrategy = "light_touch_today";
    return {
      decision: "send",
      reason: "momentum_morning_nudge_light_touch",
      state,
      strategy,
      relevance: "low",
      fallback_text: `Ce matin, garde juste un cap tres simple si tu peux: ${
        listToText(primaryItems, "un pas leger")
      }. L'idee, c'est juste de te laisser une version tres faisable aujourd'hui.`,
      instruction:
        "Message WhatsApp du matin, tres basse pression. Tu peux mentionner les items du jour, mais comme un cap leger et non comme une exigence. Pas de culpabilisation, pas de 'n'oublie pas', pas de ton de suivi. Une seule question max, tres douce, ou aucune question si le message fonctionne sans.",
      event_grounding: buildGrounding({
        state,
        strategy,
        metrics,
        payload,
        topBlockerSummary: blockerPrompt,
      }),
    };
  }

  if (state === "friction_legere") {
    const strategy: MomentumMorningStrategy = "simplify_today";
    const blockerHint = blockerHitsToday && topBlockerTitle
      ? `Sur "${topBlockerTitle}", il y a un frein recent a prendre en compte.`
      : blockerPrompt;
    return {
      decision: "send",
      reason: blockerHitsToday
        ? "momentum_morning_nudge_simplify:blocker_today"
        : "momentum_morning_nudge_simplify:generic",
      state,
      strategy,
      relevance: "high",
      fallback_text: blockerHitsToday && topBlockerTitle
        ? `Ce matin, pas besoin de tout porter d'un coup. Si "${topBlockerTitle}" coince encore, vise juste sa version la plus simple aujourd'hui.`
        : `Ce matin, le plus utile c'est peut-etre de garder ${
          listToText(primaryItems, "un cap simple")
        } en version tres faisable plutot que parfaite.`,
      instruction:
        "Message WhatsApp du matin, court et utile. Tu tiens compte de la friction recente. Si un blocker connu touche un item du jour, tu peux le nommer sobrement et encourager une version plus simple ou plus legere aujourd'hui. Tu ne demandes jamais 'tu l'as fait ?' et tu ne parles pas de modifier l'action. Tu aides juste a viser faisable aujourd'hui.",
      event_grounding: buildGrounding({
        state,
        strategy,
        metrics,
        payload,
        topBlockerSummary: blockerHint ?? blockerPrompt,
      }),
    };
  }

  if (state === "momentum") {
    const strategy: MomentumMorningStrategy = "focus_today";
    return {
      decision: "send",
      reason: "momentum_morning_nudge_focus_today",
      state,
      strategy,
      relevance: "high",
      fallback_text: `Ce matin, ton cap du jour peut rester tres simple: ${
        listToText(primaryItems, "un pas concret")
      }. C'est deja une vraie facon d'avancer dans le bon sens.`,
      instruction:
        "Message WhatsApp du matin, energisant mais sobre. Tu aides la personne a entrer dans sa journee avec un cap clair sur les items du jour. Tu peux rappeler pourquoi c'est important pour elle, a partir du deep why si present, puis finir sur une phrase d'elan. Pas de pression inutile, pas de bilan, pas de culpabilisation.",
      event_grounding: buildGrounding({
        state,
        strategy,
        metrics,
        payload,
        topBlockerSummary: blockerPrompt,
      }),
    };
  }

  const strategy: MomentumMorningStrategy = "generic_focus";
  return {
    decision: "send",
    reason: "momentum_morning_nudge_generic_fallback",
    state,
    strategy,
    relevance: "medium",
    fallback_text: `Ce matin, tu peux juste garder en tete ${
      listToText(primaryItems, "un petit pas concret")
    } pour donner une bonne direction a ta journee.`,
    instruction:
      "Message WhatsApp du matin, simple, chaleureux, oriente cap du jour. Tu cites les items du jour sans ton mecanique. Tu aides a demarrer la journee sans pression. Une seule question max.",
    event_grounding: buildGrounding({
      state,
      strategy,
      metrics,
      payload,
      topBlockerSummary: blockerPrompt,
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// V2 MORNING NUDGE — Cascade logic + posture selection
// Uses MomentumStateV2, plan_items, ConversationPulse, victory ledger
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_CONSECUTIVE_SAME_POSTURE = 2;
const VICTORY_FRESHNESS_MS = 48 * 60 * 60 * 1000;

export interface LastNudgeInfo {
  posture: MorningNudgePosture;
  sent_at: string;
  user_reacted: boolean;
  consecutive_same_posture: number;
  primary_item_titles?: string[] | null;
}

export interface RecentVictoryInfo {
  title: string;
  created_at: string;
}

export interface MorningNudgeV2Input {
  momentumV2: StoredMomentumV2;
  todayPlanItems: PlanItemRuntimeRow[];
  activePlanItems: PlanItemRuntimeRow[];
  phaseContext?: CurrentPhaseRuntimeContext | null;
  conversationPulse: ConversationPulse | null;
  lastNudge: LastNudgeInfo | null;
  proactiveHistory?: ProactiveHistoryEntry[];
  recentVictories: RecentVictoryInfo[];
  planDeepWhy: string | null;
  nudgesSent7d?: number;
  nowIso?: string;
}

export interface MorningNudgePlanV2 {
  decision: "send" | "skip";
  reason: string;
  state: MomentumStateLabel | null;
  posture: MorningNudgePosture | null;
  relevance: "high" | "medium" | "low" | "blocked";
  confidence: ConfidenceLevel;
  target_plan_item_ids: string[];
  target_plan_item_titles: string[];
  instruction?: string;
  event_grounding?: string;
  fallback_text?: string;
}

export interface RepairModeTransition {
  activated: boolean;
  reason: string | null;
  updatedTempMemory: unknown | null;
  enteredEventPayload: RepairModeEnteredPayload | null;
}

export interface ResolvedMorningNudgeV2Plan {
  plan: MorningNudgePlanV2;
  conversationPulseId: string | null;
  repairModeTransition: RepairModeTransition | null;
}

function getPrimaryPlanItemsV2(
  input: MorningNudgeV2Input,
): PlanItemRuntimeRow[] {
  return input.todayPlanItems.length > 0
    ? input.todayPlanItems
    : input.activePlanItems;
}

function getPrimaryItemTitlesV2(input: MorningNudgeV2Input): string[] {
  return uniq(getPrimaryPlanItemsV2(input).map((item) => item.title));
}

function heartbeatCelebrationTitle(
  phaseContext: CurrentPhaseRuntimeContext | null | undefined,
): string | null {
  if (!phaseContext?.heartbeat_almost_reached) return null;
  const phaseTitle = cleanText(phaseContext.current_phase_title);
  const heartbeatTitle = cleanText(phaseContext.heartbeat_title);
  if (phaseTitle && heartbeatTitle) {
    return `${phaseTitle} (${heartbeatTitle})`;
  }
  return phaseTitle || heartbeatTitle || null;
}

function parseIsoMsLocal(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function localDayCodeForIso(timezoneRaw: unknown, iso: string): string | null {
  const timezone = cleanText(timezoneRaw, DEFAULT_TIMEZONE);
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

function isActivePlanItemForMorning(item: PlanItemRuntimeRow): boolean {
  return item.status === "active" || item.status === "in_maintenance" ||
    item.status === "stalled";
}

function isPlanItemRelevantToday(
  item: PlanItemRuntimeRow,
  localDayCode: string | null,
): boolean {
  if (!isActivePlanItemForMorning(item)) return false;
  if (!Array.isArray(item.scheduled_days) || item.scheduled_days.length === 0) {
    return true;
  }
  return localDayCode ? item.scheduled_days.includes(localDayCode) : false;
}

function normalizeTitlesForCooldown(value: unknown): string[] {
  return parseStringArray(value).map((title) => title.toLowerCase());
}

async function loadFreshConversationPulseForMorning(args: {
  supabase: SupabaseClient;
  userId: string;
  cycleId: string | null;
  transformationId: string | null;
  nowIso: string;
}): Promise<{ snapshotId: string | null; pulse: ConversationPulse | null }> {
  const freshnessMs = 12 * 60 * 60 * 1000;
  let query = args.supabase
    .from("system_runtime_snapshots")
    .select("id,payload,created_at")
    .eq("user_id", args.userId)
    .eq("snapshot_type", "conversation_pulse")
    .order("created_at", { ascending: false })
    .limit(1);

  if (args.cycleId) query = query.eq("cycle_id", args.cycleId);
  if (args.transformationId) {
    query = query.eq("transformation_id", args.transformationId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return { snapshotId: null, pulse: null };

  const createdAtMs = parseIsoMsLocal((data as any)?.created_at);
  const nowMs = parseIsoMsLocal(args.nowIso);
  if (!createdAtMs || (nowMs > 0 && nowMs - createdAtMs > freshnessMs)) {
    return { snapshotId: null, pulse: null };
  }

  const payload = (data as any)?.payload;
  if (!payload || typeof payload !== "object") {
    return { snapshotId: null, pulse: null };
  }

  return {
    snapshotId: cleanText((data as any)?.id) || null,
    pulse: payload as ConversationPulse,
  };
}

async function loadRecentVictoriesForMorning(args: {
  supabase: SupabaseClient;
  userId: string;
  cycleId: string | null;
  transformationId: string | null;
  nowIso: string;
}): Promise<RecentVictoryInfo[]> {
  const lookbackIso = new Date(
    parseIsoMsLocal(args.nowIso) - (7 * 24 * 60 * 60 * 1000),
  ).toISOString();

  let query = args.supabase
    .from("user_victory_ledger")
    .select("title,created_at")
    .eq("user_id", args.userId)
    .gte("created_at", lookbackIso)
    .order("created_at", { ascending: false })
    .limit(5);

  if (args.cycleId) query = query.eq("cycle_id", args.cycleId);
  if (args.transformationId) {
    query = query.eq("transformation_id", args.transformationId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return Array.isArray(data)
    ? data.map((row: any) => ({
      title: cleanText(row?.title),
      created_at: cleanText(row?.created_at),
    })).filter((row) => row.title && row.created_at)
    : [];
}

async function loadLastMorningNudgeInfo(args: {
  supabase: SupabaseClient;
  userId: string;
  nowIso: string;
}): Promise<{ lastNudge: LastNudgeInfo | null; nudgesSent7d: number }> {
  const lookbackIso = new Date(
    parseIsoMsLocal(args.nowIso) - (7 * 24 * 60 * 60 * 1000),
  ).toISOString();
  const sentStatuses = ["sent", "awaiting_user"];

  const { data: nudgeRows, error: nudgeErr } = await args.supabase
    .from("scheduled_checkins")
    .select("scheduled_for,status,message_payload,event_context")
    .eq("user_id", args.userId)
    .in("event_context", [...MORNING_NUDGE_EVENT_CONTEXTS])
    .in("status", sentStatuses)
    .gte("scheduled_for", lookbackIso)
    .lt("scheduled_for", args.nowIso)
    .order("scheduled_for", { ascending: false })
    .limit(8);
  if (nudgeErr) throw nudgeErr;

  const rows = Array.isArray(nudgeRows)
    ? nudgeRows as Array<Record<string, unknown>>
    : [];
  if (rows.length === 0) {
    return { lastNudge: null, nudgesSent7d: 0 };
  }

  const { data: messages, error: msgErr } = await args.supabase
    .from("chat_messages")
    .select("created_at")
    .eq("user_id", args.userId)
    .eq("scope", "whatsapp")
    .eq("role", "user")
    .gte("created_at", lookbackIso)
    .lt("created_at", args.nowIso)
    .order("created_at", { ascending: true });
  if (msgErr) throw msgErr;

  const userMessageTimes = Array.isArray(messages)
    ? messages.map((row: any) => parseIsoMsLocal(row?.created_at))
      .filter((ms) => ms > 0)
    : [];

  const ascendingRows = [...rows].reverse();
  const reactions = ascendingRows.map((row, index) => {
    const startMs = parseIsoMsLocal(row?.scheduled_for);
    const nextMs = index < ascendingRows.length - 1
      ? parseIsoMsLocal(ascendingRows[index + 1]?.scheduled_for)
      : Number.POSITIVE_INFINITY;
    return userMessageTimes.some((msgMs) => msgMs > startMs && msgMs < nextMs);
  });

  const latestIndex = ascendingRows.length - 1;
  const latestRow = ascendingRows[latestIndex];
  const latestPayload = latestRow?.message_payload &&
      typeof latestRow.message_payload === "object"
    ? latestRow.message_payload as Record<string, unknown>
    : {};
  const latestPostureRaw = cleanText(
    latestPayload.morning_nudge_posture ?? latestPayload.momentum_strategy,
  );
  const latestPosture = latestPostureRaw === "protective_pause" ||
      latestPostureRaw === "support_softly" ||
      latestPostureRaw === "pre_event_grounding" ||
      latestPostureRaw === "open_door" ||
      latestPostureRaw === "simplify_today" ||
      latestPostureRaw === "focus_today" ||
      latestPostureRaw === "celebration_ping"
    ? latestPostureRaw as MorningNudgePosture
    : null;
  if (!latestPosture) {
    return {
      lastNudge: null,
      nudgesSent7d: rows.length,
    };
  }

  let consecutiveSamePosture = 0;
  for (let i = latestIndex; i >= 0; i--) {
    const payload = ascendingRows[i]?.message_payload &&
        typeof ascendingRows[i]?.message_payload === "object"
      ? ascendingRows[i].message_payload as Record<string, unknown>
      : {};
    const postureRaw = cleanText(
      payload.morning_nudge_posture ?? payload.momentum_strategy,
    );
    if (postureRaw !== latestPosture) break;
    if (reactions[i]) break;
    consecutiveSamePosture += 1;
  }

  return {
    nudgesSent7d: rows.length,
    lastNudge: {
      posture: latestPosture,
      sent_at: cleanText(latestRow?.scheduled_for),
      user_reacted: reactions[latestIndex] ?? false,
      consecutive_same_posture: consecutiveSamePosture,
      primary_item_titles: parseStringArray(
        latestPayload.plan_item_titles_targeted ??
          latestPayload.today_item_titles ??
          latestPayload.active_item_titles,
      ),
    },
  };
}

export function listMorningNudgeEventContexts(): string[] {
  return [...MORNING_NUDGE_EVENT_CONTEXTS];
}

export function isMorningNudgeEventContext(eventContext: unknown): boolean {
  return listMorningNudgeEventContexts().includes(cleanText(eventContext));
}

export async function resolveMorningNudgePlanV2(args: {
  supabase: SupabaseClient;
  userId: string;
  tempMemory: any;
  scheduledForIso?: string | null;
  timezone?: string | null;
}): Promise<ResolvedMorningNudgeV2Plan> {
  const nowIso = cleanText(args.scheduledForIso) || new Date().toISOString();
  const momentumV2 = readMomentumStateV2(args.tempMemory);
  const runtime = await getActiveTransformationRuntime(
    args.supabase as any,
    args.userId,
  );

  const timezone = cleanText(args.timezone, DEFAULT_TIMEZONE);
  const localDayCode = localDayCodeForIso(timezone, nowIso);
  let planItems: PlanItemRuntimeRow[] = [];
  let phaseContext: CurrentPhaseRuntimeContext | null = null;
  if (runtime.plan) {
    const scopedRuntime = await getScopedPlanItemRuntime(
      args.supabase as any,
      runtime.plan.id,
      { scope: "current_phase" },
    );
    planItems = scopedRuntime.planItems;
    phaseContext = scopedRuntime.phaseContext;
  }
  const activePlanItems = planItems.filter(isActivePlanItemForMorning);
  const todayPlanItems = activePlanItems.filter((item) =>
    isPlanItemRelevantToday(item, localDayCode)
  );

  const [pulseResult, victoryResult, nudgeHistory, proactiveHistory] =
    await Promise
      .all([
        loadFreshConversationPulseForMorning({
          supabase: args.supabase,
          userId: args.userId,
          cycleId: runtime.cycle?.id ?? null,
          transformationId: runtime.transformation?.id ?? null,
          nowIso,
        }),
        loadRecentVictoriesForMorning({
          supabase: args.supabase,
          userId: args.userId,
          cycleId: runtime.cycle?.id ?? null,
          transformationId: runtime.transformation?.id ?? null,
          nowIso,
        }),
        loadLastMorningNudgeInfo({
          supabase: args.supabase,
          userId: args.userId,
          nowIso,
        }),
        loadProactiveHistory(
          args.supabase,
          args.userId,
          nowIso,
        ),
      ]);

  const planDeepWhy = cleanText(
    runtime.transformation?.success_definition ??
      runtime.transformation?.user_summary ?? "",
  ) || null;
  const primaryPlanItems = todayPlanItems.length > 0
    ? todayPlanItems
    : activePlanItems;

  const plan = buildMorningNudgePlanV2({
    momentumV2,
    todayPlanItems,
    activePlanItems,
    phaseContext,
    conversationPulse: pulseResult.pulse,
    lastNudge: nudgeHistory.lastNudge,
    proactiveHistory,
    recentVictories: victoryResult,
    planDeepWhy,
    nudgesSent7d: nudgeHistory.nudgesSent7d,
    nowIso,
  });

  let repairModeTransition: RepairModeTransition | null = null;
  const currentRepairMode = readRepairMode(args.tempMemory);
  const entryResult = evaluateRepairModeEntry(currentRepairMode, {
    proactiveHistory,
    momentumV2,
    conversationPulse: pulseResult.pulse,
    nowIso,
  });
  if (entryResult.shouldEnter && entryResult.reason) {
    const proactiveNoEchoCount = countConsecutiveNoEcho(proactiveHistory);
    const consentDeclineCount = countConsentDeclines(momentumV2);
    const activated = activateRepairMode({
      reason: entryResult.reason,
      source: "watcher",
      nowIso,
    });
    const updatedTm = writeRepairMode(args.tempMemory, activated);
    repairModeTransition = {
      activated: true,
      reason: entryResult.reason,
      updatedTempMemory: updatedTm,
      enteredEventPayload: buildRepairModeEnteredPayload({
        userId: args.userId,
        cycleId: runtime.cycle?.id ?? null,
        transformationId: runtime.transformation?.id ?? null,
        reason: entryResult.reason,
        source: "watcher",
        proactiveNoEchoCount,
        consentDeclineCount,
      }),
    };
  }

  return {
    conversationPulseId: pulseResult.snapshotId,
    plan: {
      ...plan,
      confidence: momentumV2.assessment.confidence,
      target_plan_item_ids: primaryPlanItems.map((item) => item.id),
      target_plan_item_titles: primaryPlanItems.map((item) => item.title),
    },
    repairModeTransition,
  };
}

// ── Skip-or-Speak Gate ─────────────────────────────────────────────────────

export function skipOrSpeakV2(
  input: MorningNudgeV2Input,
  nowMs: number,
): { skip: true; reason: string } | null {
  if (input.momentumV2.current_state === "pause_consentie") {
    return { skip: true, reason: "morning_nudge_v2_pause_consentie" };
  }

  if (
    input.todayPlanItems.length === 0 && input.activePlanItems.length === 0
  ) {
    return { skip: true, reason: "morning_nudge_v2_no_items" };
  }

  const state = input.momentumV2.current_state;
  const policy = getMomentumPolicyDefinition(state);
  const nudgesSent7d = Math.max(
    0,
    Math.floor(Number(input.nudgesSent7d ?? 0) || 0),
  );
  if (policy.proactive_policy === "none" || policy.max_proactive_per_7d <= 0) {
    return {
      skip: true,
      reason: `morning_nudge_v2_policy_blocked:${state}`,
    };
  }
  if (nudgesSent7d >= policy.max_proactive_per_7d) {
    return {
      skip: true,
      reason:
        `morning_nudge_v2_weekly_cap_reached:${state}:${nudgesSent7d}/${policy.max_proactive_per_7d}`,
    };
  }

  if (
    input.lastNudge &&
    input.lastNudge.consecutive_same_posture >= MAX_CONSECUTIVE_SAME_POSTURE &&
    !input.lastNudge.user_reacted
  ) {
    return {
      skip: true,
      reason: `morning_nudge_v2_posture_fatigue:${input.lastNudge.posture}`,
    };
  }

  return null;
}

// ── Posture Selection Cascade ───────────────────────────────────────────────

export function selectPostureV2(
  input: MorningNudgeV2Input,
  nowMs: number,
): MorningNudgePosture {
  const m = input.momentumV2;
  const state = m.current_state;

  if (
    state === "soutien_emotionnel" &&
    m.dimensions.emotional_load.level === "high"
  ) {
    return "protective_pause";
  }

  if (
    m.dimensions.emotional_load.level === "high" ||
    m.dimensions.emotional_load.level === "medium"
  ) {
    return "support_softly";
  }

  if (input.conversationPulse?.signals?.upcoming_event) {
    return "pre_event_grounding";
  }

  if (state === "reactivation") {
    return "open_door";
  }

  if (
    state === "friction_legere" ||
    state === "evitement" ||
    m.dimensions.load_balance.level === "overloaded" ||
    m.dimensions.load_balance.level === "slightly_heavy"
  ) {
    return "simplify_today";
  }

  const freshVictories = input.recentVictories.filter((v) =>
    nowMs - parseIsoMsLocal(v.created_at) < VICTORY_FRESHNESS_MS
  );
  if (
    input.phaseContext?.heartbeat_almost_reached ||
    input.phaseContext?.heartbeat_reached ||
    freshVictories.length > 0
  ) {
    return "celebration_ping";
  }

  return "focus_today";
}

// ── Cooldown Validation (delegates to cooldown_engine.ts) ───────────────────

function lastNudgeToHistory(
  lastNudge: LastNudgeInfo | null,
): ProactiveHistoryEntry[] {
  if (!lastNudge) return [];
  return [{
    event_context: "morning_nudge_v2",
    scheduled_for: lastNudge.sent_at,
    status: "sent",
    posture: lastNudge.posture,
    item_titles: parseStringArray(lastNudge.primary_item_titles),
    user_reacted: lastNudge.user_reacted,
    window_kind: "morning_presence",
  }];
}

function resolveCooldownHistory(
  input: MorningNudgeV2Input,
): ProactiveHistoryEntry[] {
  if (
    Array.isArray(input.proactiveHistory) && input.proactiveHistory.length > 0
  ) {
    return input.proactiveHistory;
  }
  return lastNudgeToHistory(input.lastNudge);
}

export function validateCooldownV2(
  posture: MorningNudgePosture,
  input: MorningNudgeV2Input,
  nowMs: number,
): MorningNudgePosture | null {
  const history = resolveCooldownHistory(input);
  const targetTitles = getPrimaryItemTitlesV2(input);
  const { posture: validated } = validatePostureWithCooldown(
    posture,
    targetTitles,
    history,
    nowMs,
  );
  return validated;
}

export const NUDGE_SAME_ITEM_COOLDOWN_MS =
  COOLDOWN_DURATIONS_MS.same_item_reminded;

// ── Nudge Content Builder ───────────────────────────────────────────────────

function buildGroundingV2(args: {
  state: MomentumStateLabel;
  posture: MorningNudgePosture;
  momentumV2: MomentumStateV2;
  todayItems: string[];
  activeItems: string[];
  topBlocker: string | null;
  upcomingEvent: string | null;
  recentVictory: string | null;
  planDeepWhy: string | null;
  phaseContext?: CurrentPhaseRuntimeContext | null;
}): string {
  const lines = [
    `event=morning_nudge_v2`,
    `state=${args.state}`,
    `posture=${args.posture}`,
    `emotional_load=${args.momentumV2.dimensions.emotional_load.level}`,
    `load_balance=${args.momentumV2.dimensions.load_balance.level}`,
    `plan_fit=${args.momentumV2.dimensions.plan_fit.level}`,
    `execution_traction=${args.momentumV2.dimensions.execution_traction.level}`,
    `recommended_posture=${args.momentumV2.posture.recommended_posture}`,
    args.todayItems.length > 0
      ? `today_items=${args.todayItems.join(" | ")}`
      : null,
    args.activeItems.length > 0
      ? `active_items=${args.activeItems.join(" | ")}`
      : null,
    args.topBlocker ? `top_blocker=${args.topBlocker}` : null,
    args.upcomingEvent ? `upcoming_event=${args.upcomingEvent}` : null,
    args.recentVictory ? `recent_victory=${args.recentVictory}` : null,
    args.planDeepWhy ? `deep_why=${args.planDeepWhy}` : null,
    args.phaseContext?.current_phase_title
      ? `current_phase=${args.phaseContext.current_phase_title}`
      : null,
    args.phaseContext?.heartbeat_title
      ? `heartbeat=${args.phaseContext.heartbeat_title}`
      : null,
    args.phaseContext?.heartbeat_progress_ratio != null
      ? `heartbeat_progress_ratio=${args.phaseContext.heartbeat_progress_ratio.toFixed(2)}`
      : null,
    args.phaseContext?.heartbeat_almost_reached
      ? "heartbeat_almost_reached=true"
      : null,
    args.phaseContext?.transition_ready ? "phase_transition_ready=true" : null,
  ].filter(Boolean);
  return lines.join("\n");
}

type PostureContent = {
  instruction: string;
  fallback_text: string;
  relevance: "high" | "medium" | "low";
};

function buildPostureContent(
  posture: MorningNudgePosture,
  todayItems: string[],
  upcomingEvent: string | null,
  recentVictory: string | null,
  phaseCelebrationTitle: string | null,
): PostureContent {
  switch (posture) {
    case "protective_pause":
      return {
        instruction:
          "Message WhatsApp du matin ultra-court. Tu ne mentionnes aucune action, aucun objectif, aucune progression. Tu es juste la pour dire 'je ne t'oublie pas'. Pas de question, pas de suivi, pas de ton de coach.",
        fallback_text:
          "Je pense a toi ce matin. Pas besoin de rien faire, tu peux prendre le temps dont tu as besoin.",
        relevance: "medium",
      };
    case "support_softly":
      return {
        instruction:
          "Message WhatsApp du matin, tres court, tres doux. Tu n'es PAS dans un nudge d'actions. Tu reconnais sobrement que le contexte recent peut demander de la douceur, puis tu laisses une ouverture simple et non pressante. Aucune accountability, aucune culpabilisation, aucune logique de performance.",
        fallback_text:
          "Je te laisse juste un message doux ce matin. Pas besoin de performer quoi que ce soit, tu peux deja prendre soin de toi aujourd'hui.",
        relevance: "medium",
      };
    case "pre_event_grounding":
      return {
        instruction: `Message WhatsApp du matin lie a un evenement proche${
          upcomingEvent ? ` (${upcomingEvent})` : ""
        }. Tu mentionnes l'evenement calmement, tu proposes un angle de preparation simple (pas un plan detaille), et tu laisses la personne choisir son niveau d'investissement. Ton rassurant, pas de pression.`,
        fallback_text: upcomingEvent
          ? `Tu as quelque chose qui arrive bientot: ${upcomingEvent}. Si ca t'aide, tu peux juste te preparer mentalement avec un angle simple ce matin.`
          : "Tu as quelque chose qui arrive bientot. Si ca t'aide, tu peux juste te preparer mentalement avec un angle simple ce matin.",
        relevance: "high",
      };
    case "open_door":
      return {
        instruction:
          "Message WhatsApp du matin, tres leger, porte ouverte. Tu n'evoques ni absence, ni retard, ni echec. Tu peux mentionner un cap simple pour aujourd'hui, mais sans pression et sans ton de pilotage. Une seule question max, optionnelle.",
        fallback_text:
          "Je passe juste te laisser un point d'appui tres simple pour aujourd'hui. Si tu veux reprendre un petit cap a ton rythme, je suis la.",
        relevance: "low",
      };
    case "simplify_today":
      return {
        instruction:
          "Message WhatsApp du matin, court et utile. Tu tiens compte de la friction ou de la charge recente. Tu encourages une version plus simple ou plus legere des items du jour. Tu ne demandes jamais 'tu l'as fait ?' et tu ne parles pas de modifier le plan. Tu aides juste a viser faisable aujourd'hui.",
        fallback_text: todayItems.length > 0
          ? `Ce matin, le plus utile c'est peut-etre de garder ${
            listToText(todayItems, "un cap simple")
          } en version tres faisable plutot que parfaite.`
          : "Ce matin, vise juste une version tres faisable de ce que tu as en cours. Pas besoin de perfection.",
        relevance: "high",
      };
    case "celebration_ping":
      return {
        instruction: `Message WhatsApp du matin, positif et ancrant.${
          phaseCelebrationTitle
            ? ` La phase active est presque validee (${phaseCelebrationTitle}) : tu peux feliciter ce seuil qui approche sans annoncer la transition comme acquise.`
            : ""
        }${
          recentVictory
            ? ` Tu peux rappeler brievement: "${recentVictory}".`
            : ""
        } Tu utilises une victoire recente comme tremplin pour aborder la journee avec confiance. Pas de pression sur la suite, juste du renforcement.`,
        fallback_text: phaseCelebrationTitle
          ? `Tu es tout pres de valider ${phaseCelebrationTitle}. Ce matin, tu peux juste reconnaitre ce seuil qui approche et t'appuyer sur cet elan.`
          : recentVictory
          ? `Bravo pour "${recentVictory}"! Ce matin, tu peux juste savourer ca et garder cet elan pour la suite de ta journee.`
          : "Tu as avance recemment, et c'est important de le voir. Ce matin, garde juste cet elan.",
        relevance: "medium",
      };
    case "focus_today":
      return {
        instruction:
          "Message WhatsApp du matin, energisant mais sobre. Tu aides la personne a entrer dans sa journee avec un cap clair sur les items du jour. Tu peux rappeler pourquoi c'est important pour elle, a partir du deep why si present, puis finir sur une phrase d'elan. Pas de pression inutile, pas de bilan, pas de culpabilisation.",
        fallback_text: todayItems.length > 0
          ? `Ce matin, ton cap du jour peut rester tres simple: ${
            listToText(todayItems, "un pas concret")
          }. C'est deja une vraie facon d'avancer dans le bon sens.`
          : "Ce matin, garde juste un cap simple pour avancer dans le bon sens.",
        relevance: "high",
      };
    default: {
      const _exhaustive: never = posture;
      return _exhaustive;
    }
  }
}

// ── Main V2 Entry Point ─────────────────────────────────────────────────────

export function buildMorningNudgePlanV2(
  input: MorningNudgeV2Input,
): MorningNudgePlanV2 {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const nowMs = parseIsoMsLocal(nowIso);
  const state = input.momentumV2.current_state;

  const skipResult = skipOrSpeakV2(input, nowMs);
  if (skipResult) {
    return {
      decision: "skip",
      reason: skipResult.reason,
      state,
      posture: null,
      relevance: "blocked",
      confidence: input.momentumV2.assessment.confidence,
      target_plan_item_ids: [],
      target_plan_item_titles: [],
    };
  }

  let posture = selectPostureV2(input, nowMs);

  const validated = validateCooldownV2(posture, input, nowMs);
  if (!validated) {
    return {
      decision: "skip",
      reason: `morning_nudge_v2_cooldown_blocked:${posture}`,
      state,
      posture: null,
      relevance: "blocked",
      confidence: input.momentumV2.assessment.confidence,
      target_plan_item_ids: [],
      target_plan_item_titles: [],
    };
  }
  posture = validated;

  const primaryPlanItems = getPrimaryPlanItemsV2(input);
  const todayTitles = uniq(input.todayPlanItems.map((i) => i.title));
  const activeTitles = uniq(input.activePlanItems.map((i) => i.title));
  const upcomingEvent = input.conversationPulse?.signals?.upcoming_event ??
    null;
  const freshVictories = input.recentVictories.filter((v) =>
    nowMs - parseIsoMsLocal(v.created_at) < VICTORY_FRESHNESS_MS
  );
  const phaseCelebration = heartbeatCelebrationTitle(input.phaseContext);
  const topVictory = phaseCelebration ?? freshVictories[0]?.title ?? null;

  const content = buildPostureContent(
    posture,
    todayTitles,
    upcomingEvent,
    topVictory,
    phaseCelebration,
  );

  const { _internal: _, ...publicMomentum } = input.momentumV2;
  const grounding = buildGroundingV2({
    state,
    posture,
    momentumV2: publicMomentum,
    todayItems: todayTitles,
    activeItems: activeTitles,
    topBlocker: input.momentumV2.assessment.top_blocker,
    upcomingEvent,
    recentVictory: topVictory,
    planDeepWhy: input.planDeepWhy,
    phaseContext: input.phaseContext,
  });

  return {
    decision: "send",
    reason: `morning_nudge_v2:${posture}`,
    state,
    posture,
    relevance: content.relevance,
    confidence: input.momentumV2.assessment.confidence,
    target_plan_item_ids: primaryPlanItems.map((item) => item.id),
    target_plan_item_titles: primaryPlanItems.map((item) => item.title),
    instruction: content.instruction,
    fallback_text: content.fallback_text,
    event_grounding: grounding,
  };
}
