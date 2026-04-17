import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import type { DispatcherSignals } from "./router/dispatcher.ts";
import type {
  ConfidenceLevel,
  MomentumPosture,
  MomentumStateLabel,
  MomentumStateV2,
} from "../_shared/v2-types.ts";
import {
  getActiveLoad,
  getActiveTransformationRuntime,
  getPlanItemRuntime,
  type PlanItemRuntimeRow,
} from "../_shared/v2-runtime.ts";

export type { MomentumStateLabel };

const LEGACY_DISABLED_MOMENTUM_KEY = "__legacy_disabled_momentum_state";

export type EngagementLevel = "high" | "medium" | "low";
export type ProgressionLevel = "up" | "flat" | "down" | "unknown";
export type EmotionalLoadLevel = "high" | "medium" | "low";
export type ConsentLevel = "open" | "fragile" | "closed";
export type ReplyQuality = "substantive" | "brief" | "minimal";
export type ConsentEventKind = "accept" | "soft_decline" | "explicit_stop";
export type EmotionalEventLevel = Exclude<EmotionalLoadLevel, "low">;

type MomentumDimension<TLevel extends string> = {
  level: TLevel;
  reason?: string;
  updated_at?: string;
  source?: "router" | "watcher";
};

type EmotionalEvent = {
  at: string;
  level: EmotionalEventLevel;
};

type ConsentEvent = {
  at: string;
  kind: ConsentEventKind;
};

type ResponseQualityEvent = {
  at: string;
  quality: ReplyQuality;
};

type PendingTransition = {
  target_state: MomentumStateLabel;
  reason?: string;
  confirmations: number;
  first_seen_at: string;
  last_seen_at: string;
  source: "router" | "watcher";
};

export type MomentumBlockerCategory =
  | "time"
  | "energy"
  | "forgetfulness"
  | "clarity"
  | "size"
  | "motivation"
  | "emotion"
  | "context"
  | "other";

export type MomentumBlockerStage = "new" | "recurrent" | "chronic";
export type MomentumBlockerStatus = "active" | "cooling" | "resolved";

export interface MomentumBlockerObservation {
  at: string;
  category: MomentumBlockerCategory;
  source: "router" | "watcher";
  reason_excerpt?: string;
  evidence_kind?: "missed" | "partial" | "breakdown" | "note";
}

export interface MomentumActionBlockerMemory {
  action_key: string;
  action_title: string;
  current_category: MomentumBlockerCategory;
  first_seen_at: string;
  last_seen_at: string;
  status: MomentumBlockerStatus;
  stage: MomentumBlockerStage;
  mention_count_total: number;
  mention_count_21d: number;
  last_reason_excerpt?: string;
  history: MomentumBlockerObservation[];
}

export interface MomentumMetrics {
  last_user_turn_at?: string;
  last_user_turn_quality?: ReplyQuality;
  recent_user_messages_7d?: number;
  recent_substantive_user_messages_7d?: number;
  recent_assistant_messages_7d?: number;
  days_since_last_user_message?: number | null;
  active_actions_count?: number;
  completed_actions_7d?: number;
  missed_actions_7d?: number;
  partial_actions_7d?: number;
  active_vitals_count?: number;
  improved_vitals_14d?: number;
  worsened_vitals_14d?: number;
  emotional_high_72h?: number;
  emotional_medium_72h?: number;
  consent_soft_declines_7d?: number;
  consent_explicit_stops_7d?: number;
  last_gap_hours?: number | null;
  active_blockers_count?: number;
  chronic_blockers_count?: number;
}

export interface MomentumStateMemory {
  version: 1;
  updated_at?: string;
  current_state?: MomentumStateLabel;
  state_reason?: string;
  dimensions: {
    engagement: MomentumDimension<EngagementLevel>;
    progression: MomentumDimension<ProgressionLevel>;
    emotional_load: MomentumDimension<EmotionalLoadLevel>;
    consent: MomentumDimension<ConsentLevel>;
  };
  metrics: MomentumMetrics;
  blocker_memory: {
    updated_at?: string;
    actions: MomentumActionBlockerMemory[];
  };
  signal_log: {
    emotional_turns: EmotionalEvent[];
    consent_events: ConsentEvent[];
    response_quality_events: ResponseQualityEvent[];
  };
  stability: {
    stable_since_at?: string;
    pending_transition?: PendingTransition;
  };
  sources: {
    router_updated_at?: string;
    watcher_updated_at?: string;
    last_state_change_at?: string;
    last_classified_by?: "router" | "watcher";
  };
}

type ChatMessageRow = {
  role: string;
  content: string;
  created_at: string;
};

type ActionEntryRow = {
  action_id?: string;
  action_title?: string;
  note?: string | null;
  status: string;
  performed_at: string;
};

type BlockerEntryRow = {
  action_id?: string;
  action_title?: string;
  note?: string | null;
  status: string;
  performed_at: string;
};

type VitalRow = {
  id: string;
  target_value?: string | null;
  current_value?: string | null;
};

type VitalEntryRow = {
  vital_sign_id: string;
  value: string;
  recorded_at: string;
};

export interface MomentumConsolidationSnapshot {
  profilePauseUntilIso?: string | null;
  recentMessages: ChatMessageRow[];
  activeActionsCount: number;
  actionEntries: ActionEntryRow[];
  blockerEntries?: BlockerEntryRow[];
  activeVitals: VitalRow[];
  vitalEntries: VitalEntryRow[];
}

const MAX_EMOTIONAL_EVENTS = 12;
const MAX_CONSENT_EVENTS = 16;
const MAX_RESPONSE_EVENTS = 20;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
const FOURTEEN_DAYS_MS = 14 * ONE_DAY_MS;
const TWENTY_ONE_DAYS_MS = 21 * ONE_DAY_MS;
const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
const MAX_BLOCKER_ACTIONS = 8;
const MAX_BLOCKER_HISTORY = 10;

const MINIMAL_REPLY_PATTERNS = [
  /^(ok|okay|oui|non|merci|top|super|parfait|d'accord|dac|ça marche|ca marche|c'est bon|cool)$/i,
  /^(👍|🙏|❤️|ok merci|merci beaucoup)$/i,
];

const ACCEPT_PATTERNS = [
  /\boui\b/i,
  /\bvas[- ]?y\b/i,
  /\bgo\b/i,
  /\bc[' ]est bon\b/i,
  /\bon peut reprendre\b/i,
  /\bon reprend\b/i,
];

const CLOSED_CONSENT_PATTERNS = [
  /\bstop\b/i,
  /\barr[eê]te\b/i,
  /\bpas maintenant\b/i,
  /\blaisse[- ]?moi\b/i,
  /\bon verra plus tard\b/i,
  /\bpas ce soir\b/i,
  /\bpas aujourd[' ]hui\b/i,
  /\bon reprend plus tard\b/i,
  /\bj'ai besoin d'une pause\b/i,
];

const FRAGILE_CONSENT_PATTERNS = [
  /\bplus tard\b/i,
  /\bbof\b/i,
  /\bpas trop envie\b/i,
  /\bon change de sujet\b/i,
  /\bpas le moment\b/i,
  /\bon verra\b/i,
];

const HIGH_EMOTIONAL_PATTERNS = [
  /\bj[' ]?en peux plus\b/i,
  /\bje craque\b/i,
  /\bje vais craquer\b/i,
  /\bau bout\b/i,
  /\bsubmerg[eé]\b/i,
  /\bangoisse\b/i,
  /\bpanique\b/i,
  /\bburn ?out\b/i,
  /\btr[eè]s dur\b/i,
  /\btrop dur\b/i,
  /\bje n[' ]arrive plus\b/i,
  /\bje suis [kq]o\b/i,
];

const MEDIUM_EMOTIONAL_PATTERNS = [
  /\bfatigu[eé]\b/i,
  /\bfatigue\b/i,
  /\bstress\b/i,
  /\bsurcharge\b/i,
  /\bd[eé]bord[eé]\b/i,
  /\bcompliqu[eé]\b/i,
  /\bpas l[' ]?[eé]nergie\b/i,
  /\bcharg[eé]\b/i,
  /\bcrev[eé]\b/i,
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseIsoMs(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function nowIsoFrom(input?: string | Date): string {
  if (typeof input === "string" && input.trim()) return input;
  if (input instanceof Date) return input.toISOString();
  return new Date().toISOString();
}

function pruneTimedArray<T extends { at: string }>(
  arr: T[],
  opts: { nowMs: number; maxAgeMs: number; maxItems: number },
): T[] {
  return (arr ?? [])
    .filter((item) => {
      const ts = parseIsoMs(item?.at);
      return ts > 0 && opts.nowMs - ts <= opts.maxAgeMs;
    })
    .slice(-opts.maxItems);
}

function firstNumber(raw: unknown): number | null {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (!text) return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function normalizeText(input: unknown): string {
  return String(input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function actionKeyFromTitle(input: unknown): string {
  return normalizeText(input)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function shortExcerpt(input: unknown, max = 180): string | undefined {
  const text = String(input ?? "").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.slice(0, max);
}

function classifyBlockerCategory(
  input: unknown,
): MomentumBlockerCategory | null {
  const text = normalizeText(input);
  if (!text) return null;
  if (
    /pas le temps|manque de temps|trop de choses|emploi du temps|trop charge|pas eu le temps/
      .test(
        text,
      )
  ) return "time";
  if (
    /fatigu|epuis|creve|pas l energie|trop ko|plus d energie/.test(text)
  ) return "energy";
  if (/oubli|j oublie|oublie/.test(text)) return "forgetfulness";
  if (
    /pas clair|flou|je sais pas quoi|je ne sais pas quoi|pas compris|confus/
      .test(text)
  ) {
    return "clarity";
  }
  if (
    /trop gros|trop long|trop ambitieux|trop dur|trop lourd|trop grand/.test(
      text,
    )
  ) {
    return "size";
  }
  if (/motivation|pas envie|flemme|envie zero|pas motive/.test(text)) {
    return "motivation";
  }
  if (/stress|angoiss|peur|anxiet|pression|submerge|panique/.test(text)) {
    return "emotion";
  }
  if (
    /boulot|travail|enfants|famille|imprevu|deplacement|contexte/.test(text)
  ) {
    return "context";
  }
  if (
    /parce que|car |bloqu|galer|coince|difficile|dur|compliqu/.test(text)
  ) return "other";
  return null;
}

function blockerStageFromRecentHistory(
  history: MomentumBlockerObservation[],
): MomentumBlockerStage {
  const recent = history.slice(-MAX_BLOCKER_HISTORY);
  if (recent.length >= 3) return "chronic";
  if (recent.length >= 2) return "recurrent";
  return "new";
}

function blockerStatusFromLastSeen(
  lastSeenMs: number,
  nowMs: number,
): MomentumBlockerStatus {
  const gap = nowMs - lastSeenMs;
  if (!Number.isFinite(gap) || gap <= SEVEN_DAYS_MS) return "active";
  if (gap <= TWENTY_ONE_DAYS_MS) return "cooling";
  return "resolved";
}

function refreshBlockerMemory(
  actions: MomentumActionBlockerMemory[],
  nowIso: string,
): MomentumActionBlockerMemory[] {
  const nowMs = parseIsoMs(nowIso);
  const refreshed: MomentumActionBlockerMemory[] = [];
  for (const item of (actions ?? [])) {
    const history = (item.history ?? [])
      .filter((obs) => nowMs - parseIsoMs(obs.at) <= TWENTY_ONE_DAYS_MS)
      .slice(-MAX_BLOCKER_HISTORY);
    const last = history[history.length - 1];
    const first = history[0];
    if (!last || !first) continue;
    const lastSeenMs = parseIsoMs(last.at);
    refreshed.push({
      ...item,
      current_category: last.category,
      first_seen_at: first.at,
      last_seen_at: last.at,
      mention_count_21d: history.length,
      status: blockerStatusFromLastSeen(lastSeenMs, nowMs),
      stage: blockerStageFromRecentHistory(history),
      last_reason_excerpt: last.reason_excerpt ?? item.last_reason_excerpt,
      history,
    });
  }
  return refreshed
    .sort((a, b) => parseIsoMs(b.last_seen_at) - parseIsoMs(a.last_seen_at))
    .slice(0, MAX_BLOCKER_ACTIONS);
}

function mergeBlockerObservation(args: {
  actions: MomentumActionBlockerMemory[];
  actionTitle: string;
  observation: MomentumBlockerObservation;
  nowIso: string;
}): MomentumActionBlockerMemory[] {
  const actionKey = actionKeyFromTitle(args.actionTitle);
  if (!actionKey) return refreshBlockerMemory(args.actions, args.nowIso);
  const next = [...(args.actions ?? [])];
  const index = next.findIndex((item) => item.action_key === actionKey);
  if (index >= 0) {
    const current = next[index];
    next[index] = {
      ...current,
      action_title: current.action_title || args.actionTitle,
      current_category: args.observation.category,
      last_seen_at: args.observation.at,
      mention_count_total: current.mention_count_total + 1,
      last_reason_excerpt: args.observation.reason_excerpt ??
        current.last_reason_excerpt,
      history: [...current.history, args.observation].slice(
        -MAX_BLOCKER_HISTORY,
      ),
    };
  } else {
    next.push({
      action_key: actionKey,
      action_title: args.actionTitle.slice(0, 120),
      current_category: args.observation.category,
      first_seen_at: args.observation.at,
      last_seen_at: args.observation.at,
      status: "active",
      stage: "new",
      mention_count_total: 1,
      mention_count_21d: 1,
      last_reason_excerpt: args.observation.reason_excerpt,
      history: [args.observation],
    });
  }
  return refreshBlockerMemory(next, args.nowIso);
}

function buildBlockerMetrics(
  actions: MomentumActionBlockerMemory[],
): Partial<MomentumMetrics> {
  const active = actions.filter((item) => item.status === "active");
  return {
    active_blockers_count: active.length,
    chronic_blockers_count:
      active.filter((item) => item.stage === "chronic").length,
  };
}

function extractRouterBlockerObservation(args: {
  userMessage: string;
  dispatcherSignals: DispatcherSignals;
  nowIso: string;
}): { actionTitle: string; observation: MomentumBlockerObservation } | null {
  const message = String(args.userMessage ?? "").trim();
  if (!message) return null;
  const actionTitle = String(
    args.dispatcherSignals.track_progress_plan_item?.target_title ??
      args.dispatcherSignals.plan_item_discussion?.item_hint ??
      "",
  ).trim().slice(0, 120);
  if (!actionTitle) return null;

  const isBreakdown = false;
  const statusHint = String(
    args.dispatcherSignals.track_progress_plan_item?.status_hint ??
      "",
  ).trim();
  const category = classifyBlockerCategory(message);
  const looksLikeReason = Boolean(
    category ||
      /parce que|car |bloqu|galer|coince|pas reussi|pas réussi|j arrive pas|j'arrive pas/
        .test(
          normalizeText(message),
        ),
  );
  if (!isBreakdown && statusHint !== "missed" && statusHint !== "partial") {
    return null;
  }
  if (!looksLikeReason && !isBreakdown) return null;

  return {
    actionTitle,
    observation: {
      at: args.nowIso,
      category: category ?? "other",
      source: "router",
      reason_excerpt: shortExcerpt(message),
      evidence_kind: isBreakdown
        ? "breakdown"
        : statusHint === "partial"
        ? "partial"
        : "missed",
    },
  };
}

function mergeWatcherBlockers(args: {
  current: MomentumStateMemory["blocker_memory"];
  entries: BlockerEntryRow[];
  nowIso: string;
}): MomentumStateMemory["blocker_memory"] {
  let actions = refreshBlockerMemory(args.current.actions ?? [], args.nowIso);
  for (const entry of args.entries ?? []) {
    const actionTitle = String(entry?.action_title ?? "").trim().slice(0, 120);
    const note = String(entry?.note ?? "").trim();
    const status = String(entry?.status ?? "").trim();
    if (
      !actionTitle || !note || (status !== "missed" && status !== "partial")
    ) continue;
    const category = classifyBlockerCategory(note) ?? "other";
    actions = mergeBlockerObservation({
      actions,
      actionTitle,
      nowIso: args.nowIso,
      observation: {
        at: String(entry?.performed_at ?? args.nowIso),
        category,
        source: "watcher",
        reason_excerpt: shortExcerpt(note),
        evidence_kind: status === "partial" ? "partial" : "note",
      },
    });
  }
  return {
    updated_at: args.nowIso,
    actions,
  };
}

function legacyDisabledGetTopMomentumBlocker(
  momentum: MomentumStateMemory,
): MomentumActionBlockerMemory | null {
  const actions = refreshBlockerMemory(
    momentum.blocker_memory.actions ?? [],
    momentum.updated_at ?? nowIsoFrom(),
  );
  return actions.find((item) => item.status === "active") ?? actions[0] ?? null;
}

export function summarizeMomentumBlockersForPrompt(
  momentum: MomentumStateMemory | StoredMomentumV2 | MomentumStateV2,
  maxItems = 2,
): string[] {
  if ("blockers" in momentum) {
    const blockerKind = momentum.blockers.blocker_kind;
    const repeatScore = momentum.blockers.blocker_repeat_score ?? 0;
    const topBlocker = momentum.assessment.top_blocker ?? null;
    if (!blockerKind && !topBlocker) return [];
    return [
      `blocage=${blockerKind ?? "global"} | intensite=${repeatScore} | repere=${
        topBlocker ?? "aucun"
      }`,
    ].slice(0, Math.max(1, maxItems));
  }
  return refreshBlockerMemory(
    momentum.blocker_memory.actions ?? [],
    momentum.updated_at ?? nowIsoFrom(),
  )
    .filter((item) => item.status !== "resolved")
    .slice(0, Math.max(1, maxItems))
    .map((item) => {
      const excerpt = item.last_reason_excerpt
        ? ` | raison: ${item.last_reason_excerpt}`
        : "";
      return `${item.action_title} | categorie=${item.current_category} | stage=${item.stage} | statut=${item.status} | mentions_21d=${item.mention_count_21d}${excerpt}`;
    });
}

function defaultMomentumState(): MomentumStateMemory {
  return {
    version: 1,
    dimensions: {
      engagement: { level: "medium" },
      progression: { level: "unknown" },
      emotional_load: { level: "low" },
      consent: { level: "open" },
    },
    metrics: {},
    blocker_memory: {
      actions: [],
    },
    signal_log: {
      emotional_turns: [],
      consent_events: [],
      response_quality_events: [],
    },
    stability: {},
    sources: {},
  };
}

function legacyDisabledReadMomentumState(tempMemory: any): MomentumStateMemory {
  const raw = tempMemory?.[LEGACY_DISABLED_MOMENTUM_KEY];
  const base = defaultMomentumState();
  if (!raw || typeof raw !== "object") return base;

  const engagementRaw = String(raw?.dimensions?.engagement?.level ?? "");
  const progressionRaw = String(raw?.dimensions?.progression?.level ?? "");
  const emotionalRaw = String(raw?.dimensions?.emotional_load?.level ?? "");
  const consentRaw = String(raw?.dimensions?.consent?.level ?? "");

  const engagement = engagementRaw === "high" || engagementRaw === "medium" ||
      engagementRaw === "low"
    ? engagementRaw as EngagementLevel
    : base.dimensions.engagement.level;
  const progression = progressionRaw === "up" || progressionRaw === "flat" ||
      progressionRaw === "down" ||
      progressionRaw === "unknown"
    ? progressionRaw as ProgressionLevel
    : base.dimensions.progression.level;
  const emotionalLoad = emotionalRaw === "high" || emotionalRaw === "medium" ||
      emotionalRaw === "low"
    ? emotionalRaw as EmotionalLoadLevel
    : base.dimensions.emotional_load.level;
  const consent =
    consentRaw === "open" || consentRaw === "fragile" || consentRaw === "closed"
      ? consentRaw as ConsentLevel
      : base.dimensions.consent.level;

  return {
    version: 1,
    updated_at: typeof raw?.updated_at === "string"
      ? raw.updated_at
      : undefined,
    current_state: String(raw?.current_state ?? "").trim() as
      | MomentumStateLabel
      | undefined,
    state_reason: typeof raw?.state_reason === "string"
      ? raw.state_reason.slice(0, 200)
      : undefined,
    dimensions: {
      engagement: {
        level: engagement,
        reason: typeof raw?.dimensions?.engagement?.reason === "string"
          ? raw.dimensions.engagement.reason.slice(0, 200)
          : undefined,
        updated_at: typeof raw?.dimensions?.engagement?.updated_at === "string"
          ? raw.dimensions.engagement.updated_at
          : undefined,
        source: raw?.dimensions?.engagement?.source === "watcher"
          ? "watcher"
          : "router",
      },
      progression: {
        level: progression,
        reason: typeof raw?.dimensions?.progression?.reason === "string"
          ? raw.dimensions.progression.reason.slice(0, 200)
          : undefined,
        updated_at: typeof raw?.dimensions?.progression?.updated_at === "string"
          ? raw.dimensions.progression.updated_at
          : undefined,
        source: raw?.dimensions?.progression?.source === "watcher"
          ? "watcher"
          : "router",
      },
      emotional_load: {
        level: emotionalLoad,
        reason: typeof raw?.dimensions?.emotional_load?.reason === "string"
          ? raw.dimensions.emotional_load.reason.slice(0, 200)
          : undefined,
        updated_at:
          typeof raw?.dimensions?.emotional_load?.updated_at === "string"
            ? raw.dimensions.emotional_load.updated_at
            : undefined,
        source: raw?.dimensions?.emotional_load?.source === "watcher"
          ? "watcher"
          : "router",
      },
      consent: {
        level: consent,
        reason: typeof raw?.dimensions?.consent?.reason === "string"
          ? raw.dimensions.consent.reason.slice(0, 200)
          : undefined,
        updated_at: typeof raw?.dimensions?.consent?.updated_at === "string"
          ? raw.dimensions.consent.updated_at
          : undefined,
        source: raw?.dimensions?.consent?.source === "watcher"
          ? "watcher"
          : "router",
      },
    },
    metrics: {
      last_user_turn_at: typeof raw?.metrics?.last_user_turn_at === "string"
        ? raw.metrics.last_user_turn_at
        : undefined,
      last_user_turn_quality:
        raw?.metrics?.last_user_turn_quality === "substantive" ||
          raw?.metrics?.last_user_turn_quality === "brief" ||
          raw?.metrics?.last_user_turn_quality === "minimal"
          ? raw.metrics.last_user_turn_quality
          : undefined,
      recent_user_messages_7d:
        Number.isFinite(Number(raw?.metrics?.recent_user_messages_7d))
          ? clamp(
            Math.floor(Number(raw.metrics.recent_user_messages_7d)),
            0,
            999,
          )
          : undefined,
      recent_substantive_user_messages_7d: Number.isFinite(
          Number(raw?.metrics?.recent_substantive_user_messages_7d),
        )
        ? clamp(
          Math.floor(Number(raw.metrics.recent_substantive_user_messages_7d)),
          0,
          999,
        )
        : undefined,
      recent_assistant_messages_7d:
        Number.isFinite(Number(raw?.metrics?.recent_assistant_messages_7d))
          ? clamp(
            Math.floor(Number(raw.metrics.recent_assistant_messages_7d)),
            0,
            999,
          )
          : undefined,
      days_since_last_user_message:
        raw?.metrics?.days_since_last_user_message === null
          ? null
          : Number.isFinite(Number(raw?.metrics?.days_since_last_user_message))
          ? round2(Number(raw.metrics.days_since_last_user_message))
          : undefined,
      active_actions_count:
        Number.isFinite(Number(raw?.metrics?.active_actions_count))
          ? clamp(Math.floor(Number(raw.metrics.active_actions_count)), 0, 999)
          : undefined,
      completed_actions_7d:
        Number.isFinite(Number(raw?.metrics?.completed_actions_7d))
          ? clamp(Math.floor(Number(raw.metrics.completed_actions_7d)), 0, 999)
          : undefined,
      missed_actions_7d:
        Number.isFinite(Number(raw?.metrics?.missed_actions_7d))
          ? clamp(Math.floor(Number(raw.metrics.missed_actions_7d)), 0, 999)
          : undefined,
      partial_actions_7d:
        Number.isFinite(Number(raw?.metrics?.partial_actions_7d))
          ? clamp(Math.floor(Number(raw.metrics.partial_actions_7d)), 0, 999)
          : undefined,
      active_vitals_count:
        Number.isFinite(Number(raw?.metrics?.active_vitals_count))
          ? clamp(Math.floor(Number(raw.metrics.active_vitals_count)), 0, 999)
          : undefined,
      improved_vitals_14d:
        Number.isFinite(Number(raw?.metrics?.improved_vitals_14d))
          ? clamp(Math.floor(Number(raw.metrics.improved_vitals_14d)), 0, 999)
          : undefined,
      worsened_vitals_14d:
        Number.isFinite(Number(raw?.metrics?.worsened_vitals_14d))
          ? clamp(Math.floor(Number(raw.metrics.worsened_vitals_14d)), 0, 999)
          : undefined,
      emotional_high_72h:
        Number.isFinite(Number(raw?.metrics?.emotional_high_72h))
          ? clamp(Math.floor(Number(raw.metrics.emotional_high_72h)), 0, 999)
          : undefined,
      emotional_medium_72h:
        Number.isFinite(Number(raw?.metrics?.emotional_medium_72h))
          ? clamp(Math.floor(Number(raw.metrics.emotional_medium_72h)), 0, 999)
          : undefined,
      consent_soft_declines_7d:
        Number.isFinite(Number(raw?.metrics?.consent_soft_declines_7d))
          ? clamp(
            Math.floor(Number(raw.metrics.consent_soft_declines_7d)),
            0,
            999,
          )
          : undefined,
      consent_explicit_stops_7d:
        Number.isFinite(Number(raw?.metrics?.consent_explicit_stops_7d))
          ? clamp(
            Math.floor(Number(raw.metrics.consent_explicit_stops_7d)),
            0,
            999,
          )
          : undefined,
      active_blockers_count:
        Number.isFinite(Number(raw?.metrics?.active_blockers_count))
          ? clamp(Math.floor(Number(raw.metrics.active_blockers_count)), 0, 999)
          : undefined,
      chronic_blockers_count:
        Number.isFinite(Number(raw?.metrics?.chronic_blockers_count))
          ? clamp(
            Math.floor(Number(raw.metrics.chronic_blockers_count)),
            0,
            999,
          )
          : undefined,
      last_gap_hours: raw?.metrics?.last_gap_hours === null
        ? null
        : Number.isFinite(Number(raw?.metrics?.last_gap_hours))
        ? round2(Number(raw.metrics.last_gap_hours))
        : undefined,
    },
    blocker_memory: {
      updated_at: typeof raw?.blocker_memory?.updated_at === "string"
        ? raw.blocker_memory.updated_at
        : undefined,
      actions: refreshBlockerMemory(
        Array.isArray(raw?.blocker_memory?.actions)
          ? raw.blocker_memory.actions.map((item: any) => ({
            action_key: String(item?.action_key ?? "").trim().slice(0, 80),
            action_title: String(item?.action_title ?? "").trim().slice(0, 120),
            current_category: String(
              item?.current_category ?? "other",
            ) as MomentumBlockerCategory,
            first_seen_at: String(item?.first_seen_at ?? ""),
            last_seen_at: String(item?.last_seen_at ?? ""),
            status: String(item?.status ?? "active") as MomentumBlockerStatus,
            stage: String(item?.stage ?? "new") as MomentumBlockerStage,
            mention_count_total: clamp(
              Math.floor(Number(item?.mention_count_total ?? 0)),
              0,
              999,
            ),
            mention_count_21d: clamp(
              Math.floor(Number(item?.mention_count_21d ?? 0)),
              0,
              999,
            ),
            last_reason_excerpt: shortExcerpt(item?.last_reason_excerpt),
            history: Array.isArray(item?.history)
              ? item.history.map((obs: any) => ({
                at: String(obs?.at ?? ""),
                category: String(
                  obs?.category ?? "other",
                ) as MomentumBlockerCategory,
                source: obs?.source === "watcher" ? "watcher" : "router",
                reason_excerpt: shortExcerpt(obs?.reason_excerpt),
                evidence_kind: typeof obs?.evidence_kind === "string"
                  ? obs.evidence_kind.slice(0, 24)
                  : undefined,
              }))
              : [],
          }))
          : [],
        typeof raw?.updated_at === "string" ? raw.updated_at : nowIsoFrom(),
      ),
    },
    signal_log: {
      emotional_turns: Array.isArray(raw?.signal_log?.emotional_turns)
        ? pruneTimedArray(
          raw.signal_log.emotional_turns
            .map((item: any) => ({
              at: String(item?.at ?? ""),
              level: String(item?.level ?? "") as EmotionalEventLevel,
            }))
            .filter((item: EmotionalEvent) =>
              item.level === "high" || item.level === "medium"
            ),
          {
            nowMs: Date.now(),
            maxAgeMs: SEVEN_DAYS_MS,
            maxItems: MAX_EMOTIONAL_EVENTS,
          },
        )
        : [],
      consent_events: Array.isArray(raw?.signal_log?.consent_events)
        ? pruneTimedArray(
          raw.signal_log.consent_events
            .map((item: any) => ({
              at: String(item?.at ?? ""),
              kind: String(item?.kind ?? "") as ConsentEventKind,
            }))
            .filter((item: ConsentEvent) =>
              item.kind === "accept" || item.kind === "soft_decline" ||
              item.kind === "explicit_stop"
            ),
          {
            nowMs: Date.now(),
            maxAgeMs: SEVEN_DAYS_MS,
            maxItems: MAX_CONSENT_EVENTS,
          },
        )
        : [],
      response_quality_events:
        Array.isArray(raw?.signal_log?.response_quality_events)
          ? pruneTimedArray(
            raw.signal_log.response_quality_events
              .map((item: any) => ({
                at: String(item?.at ?? ""),
                quality: String(item?.quality ?? "") as ReplyQuality,
              }))
              .filter((item: ResponseQualityEvent) =>
                item.quality === "substantive" || item.quality === "brief" ||
                item.quality === "minimal"
              ),
            {
              nowMs: Date.now(),
              maxAgeMs: SEVEN_DAYS_MS,
              maxItems: MAX_RESPONSE_EVENTS,
            },
          )
          : [],
    },
    stability: {
      stable_since_at: typeof raw?.stability?.stable_since_at === "string"
        ? raw.stability.stable_since_at
        : undefined,
      pending_transition: raw?.stability?.pending_transition &&
          typeof raw.stability.pending_transition === "object" &&
          typeof raw.stability.pending_transition.target_state === "string"
        ? {
          target_state: String(
            raw.stability.pending_transition.target_state,
          ) as MomentumStateLabel,
          reason: typeof raw.stability.pending_transition.reason === "string"
            ? raw.stability.pending_transition.reason.slice(0, 200)
            : undefined,
          confirmations: clamp(
            Math.floor(
              Number(raw.stability.pending_transition.confirmations ?? 1),
            ),
            1,
            9,
          ),
          first_seen_at: String(
            raw.stability.pending_transition.first_seen_at ?? "",
          ),
          last_seen_at: String(
            raw.stability.pending_transition.last_seen_at ?? "",
          ),
          source: raw.stability.pending_transition.source === "watcher"
            ? "watcher"
            : "router",
        }
        : undefined,
    },
    sources: {
      router_updated_at: typeof raw?.sources?.router_updated_at === "string"
        ? raw.sources.router_updated_at
        : undefined,
      watcher_updated_at: typeof raw?.sources?.watcher_updated_at === "string"
        ? raw.sources.watcher_updated_at
        : undefined,
      last_state_change_at:
        typeof raw?.sources?.last_state_change_at === "string"
          ? raw.sources.last_state_change_at
          : undefined,
      last_classified_by: raw?.sources?.last_classified_by === "watcher"
        ? "watcher"
        : "router",
    },
  };
}

function legacyDisabledWriteMomentumState(
  tempMemory: any,
  momentum: MomentumStateMemory,
): any {
  const next = tempMemory && typeof tempMemory === "object"
    ? { ...tempMemory }
    : {};
  next[LEGACY_DISABLED_MOMENTUM_KEY] = momentum;
  return next;
}

export function detectReplyQuality(userMessage: string): ReplyQuality {
  const text = String(userMessage ?? "").trim();
  if (!text) return "minimal";
  if (MINIMAL_REPLY_PATTERNS.some((pattern) => pattern.test(text))) {
    return "minimal";
  }
  if (text.length <= 12) return "minimal";
  if (text.length <= 40) return "brief";
  return "substantive";
}

function detectQuickEmotionalLoad(
  userMessage: string,
  dispatcherSignals: DispatcherSignals,
): { level: EmotionalLoadLevel; reason: string } {
  if (String(dispatcherSignals?.safety?.level ?? "NONE") === "SENTRY") {
    return { level: "high", reason: "dispatcher_safety_override" };
  }

  const normalized = normalizeText(userMessage);
  if (!normalized) return { level: "low", reason: "no_signal" };

  const highHits =
    HIGH_EMOTIONAL_PATTERNS.filter((pattern) => pattern.test(normalized))
      .length;
  const mediumHits =
    MEDIUM_EMOTIONAL_PATTERNS.filter((pattern) => pattern.test(normalized))
      .length;
  if (highHits >= 1 || mediumHits >= 2) {
    return {
      level: highHits >= 1 ? "high" : "medium",
      reason: highHits >= 1
        ? "strong_emotional_turn"
        : "multiple_medium_emotional_markers",
    };
  }
  if (mediumHits >= 1) {
    return { level: "medium", reason: "medium_emotional_marker" };
  }
  return { level: "low", reason: "no_emotional_marker" };
}

function detectConsentSignal(
  userMessage: string,
  dispatcherSignals: DispatcherSignals,
): {
  level: ConsentLevel;
  reason: string;
  eventKind?: ConsentEventKind;
} {
  const text = String(userMessage ?? "").trim();
  if (
    String(dispatcherSignals?.interrupt?.kind ?? "NONE") === "EXPLICIT_STOP"
  ) {
    return {
      level: "closed",
      reason: "dispatcher_explicit_stop",
      eventKind: "explicit_stop",
    };
  }
  if (CLOSED_CONSENT_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      level: "closed",
      reason: "explicit_pause_phrase",
      eventKind: "explicit_stop",
    };
  }
  if (ACCEPT_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      level: "open",
      reason: "explicit_accept_phrase",
      eventKind: "accept",
    };
  }
  if (
    String(dispatcherSignals?.interrupt?.kind ?? "NONE") === "BORED" ||
    String(dispatcherSignals?.interrupt?.kind ?? "NONE") === "SWITCH_TOPIC" ||
    String(dispatcherSignals?.interrupt?.kind ?? "NONE") === "DIGRESSION" ||
    FRAGILE_CONSENT_PATTERNS.some((pattern) => pattern.test(text))
  ) {
    return {
      level: "fragile",
      reason: "soft_decline_or_topic_shift",
      eventKind: "soft_decline",
    };
  }
  return {
    level: "open",
    reason: "no_decline_detected",
  };
}

function classifyMomentumState(args: {
  engagement: EngagementLevel;
  progression: ProgressionLevel;
  emotionalLoad: EmotionalLoadLevel;
  consent: ConsentLevel;
  metrics?: MomentumMetrics;
}): { state: MomentumStateLabel; reason: string } {
  if (args.emotionalLoad === "high") {
    return { state: "soutien_emotionnel", reason: "emotional_load_high" };
  }
  if (args.consent === "closed") {
    return { state: "pause_consentie", reason: "consent_closed" };
  }

  const daysSince = Number(args.metrics?.days_since_last_user_message ?? 0);
  if (
    args.engagement === "low" &&
    Number.isFinite(daysSince) &&
    daysSince >= 3
  ) {
    return { state: "reactivation", reason: "low_engagement_after_silence" };
  }

  if (
    args.progression === "up" &&
    args.consent === "open" &&
    args.engagement !== "low"
  ) {
    return { state: "momentum", reason: "progression_up_and_open_consent" };
  }
  if (args.consent === "open" && args.engagement !== "low") {
    return {
      state: "friction_legere",
      reason: "engaged_but_not_clearly_progressing",
    };
  }
  return { state: "evitement", reason: "default_gray_zone_state" };
}

function updateStateMetadata(
  current: MomentumStateMemory,
  nextState: MomentumStateLabel,
  classifiedBy: "router" | "watcher",
  nowIso: string,
): MomentumStateMemory["sources"] {
  return {
    ...current.sources,
    ...(classifiedBy === "router"
      ? { router_updated_at: nowIso }
      : { watcher_updated_at: nowIso }),
    last_classified_by: classifiedBy,
    last_state_change_at: current.current_state !== nextState
      ? nowIso
      : current.sources.last_state_change_at,
  };
}

function isUrgentState(state: MomentumStateLabel): boolean {
  return state === "soutien_emotionnel" || state === "pause_consentie";
}

function nonUrgentStateRank(state: MomentumStateLabel): number | null {
  if (state === "momentum") return 0;
  if (state === "friction_legere") return 1;
  if (state === "evitement") return 2;
  if (state === "reactivation") return 3;
  return null;
}

function isDegradingTransition(
  fromState: MomentumStateLabel | undefined,
  toState: MomentumStateLabel,
): boolean {
  const fromRank = fromState ? nonUrgentStateRank(fromState) : null;
  const toRank = nonUrgentStateRank(toState);
  return fromRank !== null && toRank !== null && toRank > fromRank;
}

function collapseRouterDegradationTarget(
  currentState: MomentumStateLabel | undefined,
  proposedState: MomentumStateLabel,
): MomentumStateLabel {
  if (!currentState) return proposedState;
  if (
    currentState === "momentum" &&
    (proposedState === "evitement" || proposedState === "reactivation")
  ) {
    return "friction_legere";
  }
  if (currentState === "friction_legere" && proposedState === "reactivation") {
    return "evitement";
  }
  return proposedState;
}

function buildPendingTransition(args: {
  current: MomentumStateMemory;
  targetState: MomentumStateLabel;
  reason: string;
  classifiedBy: "router" | "watcher";
  nowIso: string;
}): PendingTransition {
  const existing = args.current.stability.pending_transition;
  if (existing && existing.target_state === args.targetState) {
    return {
      ...existing,
      confirmations: clamp(existing.confirmations + 1, 1, 9),
      last_seen_at: args.nowIso,
      reason: args.reason,
      source: args.classifiedBy,
    };
  }
  return {
    target_state: args.targetState,
    reason: args.reason,
    confirmations: 1,
    first_seen_at: args.nowIso,
    last_seen_at: args.nowIso,
    source: args.classifiedBy,
  };
}

function canRouterExitPauseState(args: {
  proposedState: MomentumStateLabel;
  progression: ProgressionLevel;
  consent: ConsentLevel;
  metrics: MomentumMetrics;
}): boolean {
  return args.proposedState !== "pause_consentie" &&
    args.consent === "open" &&
    args.metrics.last_user_turn_quality === "substantive" &&
    (args.progression === "up" || args.proposedState === "friction_legere" ||
      args.proposedState === "momentum");
}

function stabilizeClassifiedState(args: {
  current: MomentumStateMemory;
  proposedState: MomentumStateLabel;
  proposedReason: string;
  classifiedBy: "router" | "watcher";
  nowIso: string;
  engagement: EngagementLevel;
  progression: ProgressionLevel;
  emotionalLoad: EmotionalLoadLevel;
  consent: ConsentLevel;
  metrics: MomentumMetrics;
}): {
  state: MomentumStateLabel;
  reason: string;
  stability: MomentumStateMemory["stability"];
} {
  const currentState = args.current.current_state;

  if (!currentState) {
    return {
      state: args.proposedState,
      reason: args.proposedReason,
      stability: {
        stable_since_at: args.nowIso,
      },
    };
  }

  if (currentState === args.proposedState) {
    return {
      state: currentState,
      reason: args.proposedReason,
      stability: {
        stable_since_at: args.current.stability.stable_since_at ?? args.nowIso,
      },
    };
  }

  if (isUrgentState(args.proposedState)) {
    return {
      state: args.proposedState,
      reason: args.proposedReason,
      stability: {
        stable_since_at: args.nowIso,
      },
    };
  }

  if (args.classifiedBy === "watcher") {
    return {
      state: args.proposedState,
      reason: args.proposedReason,
      stability: {
        stable_since_at: args.nowIso,
      },
    };
  }

  if (currentState === "pause_consentie") {
    if (
      canRouterExitPauseState({
        proposedState: args.proposedState,
        progression: args.progression,
        consent: args.consent,
        metrics: args.metrics,
      })
    ) {
      return {
        state: args.proposedState,
        reason: args.proposedReason,
        stability: {
          stable_since_at: args.nowIso,
        },
      };
    }

    return {
      state: currentState,
      reason: args.current.state_reason ??
        "hold_pause_until_strong_resume_signal",
      stability: {
        stable_since_at: args.current.stability.stable_since_at ?? args.nowIso,
        pending_transition: buildPendingTransition({
          current: args.current,
          targetState: args.proposedState,
          reason: args.proposedReason,
          classifiedBy: args.classifiedBy,
          nowIso: args.nowIso,
        }),
      },
    };
  }

  if (currentState === "soutien_emotionnel") {
    return {
      state: currentState,
      reason: args.current.state_reason ??
        "hold_support_until_watcher_confirms_exit",
      stability: {
        stable_since_at: args.current.stability.stable_since_at ?? args.nowIso,
        pending_transition: buildPendingTransition({
          current: args.current,
          targetState: args.proposedState,
          reason: args.proposedReason,
          classifiedBy: args.classifiedBy,
          nowIso: args.nowIso,
        }),
      },
    };
  }

  const normalizedProposed =
    isDegradingTransition(currentState, args.proposedState)
      ? collapseRouterDegradationTarget(currentState, args.proposedState)
      : args.proposedState;

  if (
    normalizedProposed === "momentum" &&
    args.progression === "up" &&
    args.consent === "open" &&
    args.engagement === "high"
  ) {
    return {
      state: normalizedProposed,
      reason: args.proposedReason,
      stability: {
        stable_since_at: args.nowIso,
      },
    };
  }

  if (isDegradingTransition(currentState, normalizedProposed)) {
    const pending = buildPendingTransition({
      current: args.current,
      targetState: normalizedProposed,
      reason: args.proposedReason,
      classifiedBy: args.classifiedBy,
      nowIso: args.nowIso,
    });
    if (pending.confirmations >= 2) {
      return {
        state: normalizedProposed,
        reason: args.proposedReason,
        stability: {
          stable_since_at: args.nowIso,
        },
      };
    }
    return {
      state: currentState,
      reason: args.current.state_reason ??
        "holding_state_pending_degradation_confirmation",
      stability: {
        stable_since_at: args.current.stability.stable_since_at ?? args.nowIso,
        pending_transition: pending,
      },
    };
  }

  return {
    state: normalizedProposed,
    reason: args.proposedReason,
    stability: {
      stable_since_at: args.nowIso,
    },
  };
}

function legacyDisabledApplyRouterMomentumSignals(args: {
  tempMemory: any;
  userMessage: string;
  dispatcherSignals: DispatcherSignals;
  nowIso?: string;
}): MomentumStateMemory {
  const nowIso = nowIsoFrom(args.nowIso);
  const nowMs = parseIsoMs(nowIso);
  const current = legacyDisabledReadMomentumState(args.tempMemory);

  const responseQuality = detectReplyQuality(args.userMessage);
  const emotional = detectQuickEmotionalLoad(
    args.userMessage,
    args.dispatcherSignals,
  );
  const consentSignal = detectConsentSignal(
    args.userMessage,
    args.dispatcherSignals,
  );

  const responseEvents = pruneTimedArray(
    [...current.signal_log.response_quality_events, {
      at: nowIso,
      quality: responseQuality,
    }],
    { nowMs, maxAgeMs: SEVEN_DAYS_MS, maxItems: MAX_RESPONSE_EVENTS },
  );

  const emotionalEvents =
    emotional.level === "high" || emotional.level === "medium"
      ? pruneTimedArray(
        [...current.signal_log.emotional_turns, {
          at: nowIso,
          level: emotional.level,
        }],
        { nowMs, maxAgeMs: SEVEN_DAYS_MS, maxItems: MAX_EMOTIONAL_EVENTS },
      )
      : pruneTimedArray(current.signal_log.emotional_turns, {
        nowMs,
        maxAgeMs: SEVEN_DAYS_MS,
        maxItems: MAX_EMOTIONAL_EVENTS,
      });

  const consentEvents = consentSignal.eventKind
    ? pruneTimedArray(
      [...current.signal_log.consent_events, {
        at: nowIso,
        kind: consentSignal.eventKind,
      }],
      { nowMs, maxAgeMs: SEVEN_DAYS_MS, maxItems: MAX_CONSENT_EVENTS },
    )
    : pruneTimedArray(current.signal_log.consent_events, {
      nowMs,
      maxAgeMs: SEVEN_DAYS_MS,
      maxItems: MAX_CONSENT_EVENTS,
    });

  const substantiveCount7d =
    responseEvents.filter((item) => item.quality === "substantive").length;
  const minimalCount7d =
    responseEvents.filter((item) => item.quality === "minimal").length;
  const previousLastTurnMs = parseIsoMs(current.metrics.last_user_turn_at);
  const lastGapHours = previousLastTurnMs > 0
    ? round2((nowMs - previousLastTurnMs) / (60 * 60 * 1000))
    : null;

  let engagementLevel: EngagementLevel = current.dimensions.engagement.level;
  let engagementReason = current.dimensions.engagement.reason ?? "carry_over";
  if (responseQuality === "substantive" && substantiveCount7d >= 1) {
    engagementLevel = "high";
    engagementReason = "substantive_recent_reply";
  } else if (minimalCount7d >= 3 && substantiveCount7d === 0) {
    engagementLevel = "low";
    engagementReason = "repeated_minimal_replies";
  } else if (
    responseQuality === "minimal" &&
    current.dimensions.engagement.level === "low"
  ) {
    engagementLevel = "low";
    engagementReason = "low_engagement_persists";
  } else {
    engagementLevel = responseQuality === "substantive" ? "high" : "medium";
    engagementReason = responseQuality === "substantive"
      ? "substantive_current_turn"
      : "brief_or_minimal_current_turn";
  }

  let consentLevel: ConsentLevel = consentSignal.level;
  let consentReason = consentSignal.reason;
  if (
    current.dimensions.consent.level === "closed" &&
    consentSignal.level === "open" &&
    responseQuality !== "substantive"
  ) {
    consentLevel = "fragile";
    consentReason = "recovering_from_closed_consent";
  }

  const emotional72h = pruneTimedArray(emotionalEvents, {
    nowMs,
    maxAgeMs: SEVENTY_TWO_HOURS_MS,
    maxItems: MAX_EMOTIONAL_EVENTS,
  });
  const emotionalHigh72h =
    emotional72h.filter((item) => item.level === "high").length;
  const emotionalMedium72h =
    emotional72h.filter((item) => item.level === "medium").length;
  const emotionalLevel: EmotionalLoadLevel = emotional.level === "high"
    ? "high"
    : emotionalHigh72h >= 2
    ? "high"
    : emotional.level === "medium" || emotionalMedium72h + emotionalHigh72h >= 1
    ? "medium"
    : "low";
  const emotionalReason = emotionalLevel === emotional.level
    ? emotional.reason
    : emotionalLevel === "high"
    ? "rolling_high_emotional_load"
    : emotionalLevel === "medium"
    ? "rolling_medium_emotional_load"
    : "no_recent_emotional_load";

  let progressionLevel = current.dimensions.progression.level;
  let progressionReason = current.dimensions.progression.reason ?? "carry_over";
  const actionSignal = args.dispatcherSignals.track_progress_plan_item;
  if (actionSignal?.detected && actionSignal.status_hint === "completed") {
    progressionLevel = "up";
    progressionReason = "current_turn_completed_action";
  } else if (actionSignal?.detected && actionSignal.status_hint === "partial") {
    progressionLevel = progressionLevel === "unknown"
      ? "flat"
      : progressionLevel;
    progressionReason = "current_turn_partial_action";
  } else if (actionSignal?.detected && actionSignal.status_hint === "missed") {
    progressionLevel = progressionLevel === "up"
      ? "flat"
      : progressionLevel === "unknown"
      ? "flat"
      : progressionLevel;
    progressionReason = "current_turn_missed_action";
  } else if (args.dispatcherSignals.track_progress_north_star?.detected) {
    progressionLevel = progressionLevel === "unknown"
      ? "flat"
      : progressionLevel;
    progressionReason = "current_turn_metric_logged";
  }

  let blockerMemory = refreshBlockerMemory(
    current.blocker_memory.actions ?? [],
    nowIso,
  );
  const blockerObservation = extractRouterBlockerObservation({
    userMessage: args.userMessage,
    dispatcherSignals: args.dispatcherSignals,
    nowIso,
  });
  if (blockerObservation) {
    blockerMemory = mergeBlockerObservation({
      actions: blockerMemory,
      actionTitle: blockerObservation.actionTitle,
      observation: blockerObservation.observation,
      nowIso,
    });
  }

  const metrics: MomentumMetrics = {
    ...current.metrics,
    last_user_turn_at: nowIso,
    last_user_turn_quality: responseQuality,
    recent_substantive_user_messages_7d: substantiveCount7d,
    emotional_high_72h: emotionalHigh72h,
    emotional_medium_72h: emotionalMedium72h,
    consent_soft_declines_7d:
      consentEvents.filter((item) => item.kind === "soft_decline").length,
    consent_explicit_stops_7d:
      consentEvents.filter((item) => item.kind === "explicit_stop").length,
    days_since_last_user_message: 0,
    last_gap_hours: lastGapHours,
    ...buildBlockerMetrics(blockerMemory),
  };

  const classified = classifyMomentumState({
    engagement: engagementLevel,
    progression: progressionLevel,
    emotionalLoad: emotionalLevel,
    consent: consentLevel,
    metrics,
  });
  const stabilized = stabilizeClassifiedState({
    current,
    proposedState: classified.state,
    proposedReason: classified.reason,
    classifiedBy: "router",
    nowIso,
    engagement: engagementLevel,
    progression: progressionLevel,
    emotionalLoad: emotionalLevel,
    consent: consentLevel,
    metrics,
  });

  return {
    version: 1,
    updated_at: nowIso,
    current_state: stabilized.state,
    state_reason: stabilized.reason,
    dimensions: {
      engagement: {
        level: engagementLevel,
        reason: engagementReason,
        updated_at: nowIso,
        source: "router",
      },
      progression: {
        level: progressionLevel,
        reason: progressionReason,
        updated_at: nowIso,
        source: current.dimensions.progression.source === "watcher" &&
            progressionReason === "carry_over"
          ? "watcher"
          : "router",
      },
      emotional_load: {
        level: emotionalLevel,
        reason: emotionalReason,
        updated_at: nowIso,
        source: "router",
      },
      consent: {
        level: consentLevel,
        reason: consentReason,
        updated_at: nowIso,
        source: "router",
      },
    },
    metrics,
    blocker_memory: {
      updated_at: nowIso,
      actions: blockerMemory,
    },
    signal_log: {
      emotional_turns: emotionalEvents,
      consent_events: consentEvents,
      response_quality_events: responseEvents,
    },
    stability: stabilized.stability,
    sources: updateStateMetadata(current, stabilized.state, "router", nowIso),
  };
}

function computeEngagementFromSnapshot(args: {
  recentMessages: ChatMessageRow[];
  responseEvents: ResponseQualityEvent[];
  nowMs: number;
}): {
  level: EngagementLevel;
  reason: string;
  metrics: Partial<MomentumMetrics>;
} {
  const messages = (args.recentMessages ?? []).filter((msg) =>
    parseIsoMs(msg.created_at) > 0
  );
  const userMessages = messages.filter((msg) => msg.role === "user");
  const assistantMessages = messages.filter((msg) => msg.role === "assistant");
  const lastUserMessage = userMessages[userMessages.length - 1];
  const lastUserMessageMs = parseIsoMs(lastUserMessage?.created_at);
  const daysSinceLastUserMessage = lastUserMessageMs > 0
    ? round2((args.nowMs - lastUserMessageMs) / ONE_DAY_MS)
    : null;
  const userMessages72h = userMessages.filter((msg) =>
    args.nowMs - parseIsoMs(msg.created_at) <= SEVENTY_TWO_HOURS_MS
  );
  const userMessages7d = userMessages;
  const substantiveUserMessages7d = userMessages7d.filter((msg) =>
    detectReplyQuality(String(msg.content ?? "")) === "substantive"
  );
  const lowQualityEvents7d =
    args.responseEvents.filter((item) => item.quality === "minimal").length;

  let level: EngagementLevel = "medium";
  let reason = "moderate_recent_interaction";
  if (
    daysSinceLastUserMessage === null ||
    daysSinceLastUserMessage >= 3 ||
    (assistantMessages.length >= 3 && userMessages7d.length === 0) ||
    (userMessages7d.length <= 1 && substantiveUserMessages7d.length === 0 &&
      lowQualityEvents7d >= 2)
  ) {
    level = "low";
    reason = "recent_silence_or_weak_responses";
  } else if (
    substantiveUserMessages7d.length >= 2 ||
    (userMessages72h.length >= 2 && substantiveUserMessages7d.length >= 1)
  ) {
    level = "high";
    reason = "multiple_substantive_recent_messages";
  }

  return {
    level,
    reason,
    metrics: {
      recent_user_messages_7d: userMessages7d.length,
      recent_substantive_user_messages_7d: substantiveUserMessages7d.length,
      recent_assistant_messages_7d: assistantMessages.length,
      days_since_last_user_message: daysSinceLastUserMessage,
    },
  };
}

function computeProgressionFromSnapshot(
  snapshot: MomentumConsolidationSnapshot,
): {
  level: ProgressionLevel;
  reason: string;
  metrics: Partial<MomentumMetrics>;
} {
  const completed =
    snapshot.actionEntries.filter((entry) => entry.status === "completed")
      .length;
  const missed =
    snapshot.actionEntries.filter((entry) => entry.status === "missed").length;
  const partial =
    snapshot.actionEntries.filter((entry) => entry.status === "partial").length;

  const vitalEntriesById = new Map<string, number[]>();
  for (const entry of snapshot.vitalEntries) {
    const value = firstNumber(entry.value);
    if (value === null) continue;
    const list = vitalEntriesById.get(entry.vital_sign_id) ?? [];
    list.push(value);
    vitalEntriesById.set(entry.vital_sign_id, list);
  }

  let improvedVitals = 0;
  let worsenedVitals = 0;
  for (const vital of snapshot.activeVitals) {
    const target = firstNumber(vital.target_value);
    if (target === null) continue;
    const values = vitalEntriesById.get(vital.id) ?? [];
    if (values.length < 2) continue;
    const firstDistance = Math.abs(values[0] - target);
    const lastDistance = Math.abs(values[values.length - 1] - target);
    if (lastDistance <= firstDistance - 0.2) improvedVitals++;
    else if (lastDistance >= firstDistance + 0.2) worsenedVitals++;
  }

  const hasSignals = snapshot.activeActionsCount > 0 ||
    snapshot.actionEntries.length > 0 ||
    snapshot.activeVitals.length > 0 ||
    snapshot.vitalEntries.length > 0;

  let level: ProgressionLevel = "unknown";
  let reason = "no_progression_data";
  if (!hasSignals) {
    level = "unknown";
    reason = "no_actions_or_vitals";
  } else if (
    completed >= 2 ||
    (completed >= 1 && missed === 0) ||
    improvedVitals >= 1
  ) {
    level = "up";
    reason = improvedVitals >= 1
      ? "vital_distance_to_target_improved"
      : "recent_action_completion";
  } else if (
    (missed >= 3 && completed === 0 && partial === 0) ||
    (worsenedVitals >= 1 && completed === 0)
  ) {
    level = "down";
    reason = worsenedVitals >= 1
      ? "vital_distance_to_target_worsened"
      : "repeated_missed_actions";
  } else {
    level = "flat";
    reason = "mixed_or_stable_progression";
  }

  return {
    level,
    reason,
    metrics: {
      active_actions_count: snapshot.activeActionsCount,
      completed_actions_7d: completed,
      missed_actions_7d: missed,
      partial_actions_7d: partial,
      active_vitals_count: snapshot.activeVitals.length,
      improved_vitals_14d: improvedVitals,
      worsened_vitals_14d: worsenedVitals,
    },
  };
}

function computeEmotionalLoadFromSignals(args: {
  emotionalEvents: EmotionalEvent[];
  nowMs: number;
}): {
  level: EmotionalLoadLevel;
  reason: string;
  metrics: Partial<MomentumMetrics>;
} {
  const emotional72h = pruneTimedArray(args.emotionalEvents, {
    nowMs: args.nowMs,
    maxAgeMs: SEVENTY_TWO_HOURS_MS,
    maxItems: MAX_EMOTIONAL_EVENTS,
  });
  const emotional24h = pruneTimedArray(args.emotionalEvents, {
    nowMs: args.nowMs,
    maxAgeMs: ONE_DAY_MS,
    maxItems: MAX_EMOTIONAL_EVENTS,
  });
  const high72h = emotional72h.filter((item) => item.level === "high").length;
  const medium72h =
    emotional72h.filter((item) => item.level === "medium").length;
  const high24h = emotional24h.filter((item) => item.level === "high").length;

  let level: EmotionalLoadLevel = "low";
  let reason = "no_recent_emotional_signal";
  if (high24h >= 1 || high72h >= 2) {
    level = "high";
    reason = "recent_high_emotional_signal";
  } else if (high72h + medium72h >= 1) {
    level = "medium";
    reason = "rolling_emotional_signal_present";
  }

  return {
    level,
    reason,
    metrics: {
      emotional_high_72h: high72h,
      emotional_medium_72h: medium72h,
    },
  };
}

function computeConsentFromSignals(args: {
  consentEvents: ConsentEvent[];
  profilePauseUntilIso?: string | null;
  nowMs: number;
}): {
  level: ConsentLevel;
  reason: string;
  metrics: Partial<MomentumMetrics>;
} {
  const pauseUntilMs = parseIsoMs(args.profilePauseUntilIso);
  if (pauseUntilMs > args.nowMs) {
    return {
      level: "closed",
      reason: "profile_pause_active",
      metrics: {
        consent_soft_declines_7d: 0,
        consent_explicit_stops_7d: 1,
      },
    };
  }

  const events7d = pruneTimedArray(args.consentEvents, {
    nowMs: args.nowMs,
    maxAgeMs: SEVEN_DAYS_MS,
    maxItems: MAX_CONSENT_EVENTS,
  });
  const softDeclines =
    events7d.filter((item) => item.kind === "soft_decline").length;
  const explicitStops =
    events7d.filter((item) => item.kind === "explicit_stop").length;
  const lastExplicitStopAt = Math.max(
    0,
    ...events7d
      .filter((item) => item.kind === "explicit_stop")
      .map((item) => parseIsoMs(item.at)),
  );
  const lastAcceptAt = Math.max(
    0,
    ...events7d
      .filter((item) => item.kind === "accept")
      .map((item) => parseIsoMs(item.at)),
  );

  let level: ConsentLevel = "open";
  let reason = "no_recent_decline";
  if (
    lastExplicitStopAt > 0 && lastAcceptAt < lastExplicitStopAt &&
    args.nowMs - lastExplicitStopAt <= SEVENTY_TWO_HOURS_MS
  ) {
    level = "closed";
    reason = "recent_explicit_stop_without_reaccept";
  } else if (softDeclines >= 1 || explicitStops >= 1) {
    level = "fragile";
    reason = "recent_soft_decline_or_old_stop";
  }

  return {
    level,
    reason,
    metrics: {
      consent_soft_declines_7d: softDeclines,
      consent_explicit_stops_7d: explicitStops,
    },
  };
}

export function deriveMomentumFromSnapshot(args: {
  current: MomentumStateMemory;
  snapshot: MomentumConsolidationSnapshot;
  nowIso?: string;
}): MomentumStateMemory {
  const nowIso = nowIsoFrom(args.nowIso);
  const nowMs = parseIsoMs(nowIso);
  const responseEvents = pruneTimedArray(
    args.current.signal_log.response_quality_events,
    {
      nowMs,
      maxAgeMs: SEVEN_DAYS_MS,
      maxItems: MAX_RESPONSE_EVENTS,
    },
  );
  const emotionalEvents = pruneTimedArray(
    args.current.signal_log.emotional_turns,
    {
      nowMs,
      maxAgeMs: SEVEN_DAYS_MS,
      maxItems: MAX_EMOTIONAL_EVENTS,
    },
  );
  const consentEvents = pruneTimedArray(
    args.current.signal_log.consent_events,
    {
      nowMs,
      maxAgeMs: SEVEN_DAYS_MS,
      maxItems: MAX_CONSENT_EVENTS,
    },
  );

  const engagement = computeEngagementFromSnapshot({
    recentMessages: args.snapshot.recentMessages,
    responseEvents,
    nowMs,
  });
  const progression = computeProgressionFromSnapshot(args.snapshot);
  const emotional = computeEmotionalLoadFromSignals({
    emotionalEvents,
    nowMs,
  });
  const consent = computeConsentFromSignals({
    consentEvents,
    profilePauseUntilIso: args.snapshot.profilePauseUntilIso,
    nowMs,
  });
  const blockerMemory = mergeWatcherBlockers({
    current: args.current.blocker_memory,
    entries: args.snapshot.blockerEntries ?? [],
    nowIso,
  });

  const metrics: MomentumMetrics = {
    ...args.current.metrics,
    ...engagement.metrics,
    ...progression.metrics,
    ...emotional.metrics,
    ...consent.metrics,
    ...buildBlockerMetrics(blockerMemory.actions),
    last_user_turn_at: args.current.metrics.last_user_turn_at,
    last_user_turn_quality: args.current.metrics.last_user_turn_quality,
  };

  const classified = classifyMomentumState({
    engagement: engagement.level,
    progression: progression.level,
    emotionalLoad: emotional.level,
    consent: consent.level,
    metrics,
  });
  const stabilized = stabilizeClassifiedState({
    current: args.current,
    proposedState: classified.state,
    proposedReason: classified.reason,
    classifiedBy: "watcher",
    nowIso,
    engagement: engagement.level,
    progression: progression.level,
    emotionalLoad: emotional.level,
    consent: consent.level,
    metrics,
  });

  return {
    version: 1,
    updated_at: nowIso,
    current_state: stabilized.state,
    state_reason: stabilized.reason,
    dimensions: {
      engagement: {
        level: engagement.level,
        reason: engagement.reason,
        updated_at: nowIso,
        source: "watcher",
      },
      progression: {
        level: progression.level,
        reason: progression.reason,
        updated_at: nowIso,
        source: "watcher",
      },
      emotional_load: {
        level: emotional.level,
        reason: emotional.reason,
        updated_at: nowIso,
        source: "watcher",
      },
      consent: {
        level: consent.level,
        reason: consent.reason,
        updated_at: nowIso,
        source: "watcher",
      },
    },
    metrics,
    blocker_memory: blockerMemory,
    signal_log: {
      emotional_turns: emotionalEvents,
      consent_events: consentEvents,
      response_quality_events: responseEvents,
    },
    stability: stabilized.stability,
    sources: updateStateMetadata(
      args.current,
      stabilized.state,
      "watcher",
      nowIso,
    ),
  };
}

async function fetchMomentumSnapshot(args: {
  supabase: SupabaseClient;
  userId: string;
  scope: string;
  nowIso?: string;
}): Promise<MomentumConsolidationSnapshot> {
  const nowIso = nowIsoFrom(args.nowIso);
  const messagesSinceIso = new Date(parseIsoMs(nowIso) - SEVEN_DAYS_MS)
    .toISOString();
  const actionsSinceIso = new Date(parseIsoMs(nowIso) - SEVEN_DAYS_MS)
    .toISOString();
  const blockersSinceIso = new Date(parseIsoMs(nowIso) - TWENTY_ONE_DAYS_MS)
    .toISOString();
  const vitalsSinceIso = new Date(parseIsoMs(nowIso) - FOURTEEN_DAYS_MS)
    .toISOString();

  const [
    { data: profile },
    { data: recentMessages },
    { data: activeActions },
    { data: actionEntries },
    { data: blockerEntries },
    { data: activeVitals },
  ] = await Promise.all([
    args.supabase
      .from("profiles")
      .select("whatsapp_coaching_paused_until, whatsapp_bilan_paused_until")
      .eq("id", args.userId)
      .maybeSingle(),
    args.supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("user_id", args.userId)
      .eq("scope", args.scope)
      .gte("created_at", messagesSinceIso)
      .order("created_at", { ascending: true })
      .limit(120),
    args.supabase
      .from("user_plan_items")
      .select("id")
      .eq("user_id", args.userId)
      .eq("status", "active"),
    args.supabase
      .from("user_plan_item_entries")
      .select("plan_item_id, outcome, value_text, entry_kind, effective_at")
      .eq("user_id", args.userId)
      .gte("effective_at", actionsSinceIso)
      .order("effective_at", { ascending: true })
      .limit(120),
    args.supabase
      .from("user_plan_item_entries")
      .select("plan_item_id, outcome, value_text, entry_kind, effective_at")
      .eq("user_id", args.userId)
      .gte("effective_at", blockersSinceIso)
      .order("effective_at", { ascending: true })
      .limit(180),
    args.supabase
      .from("user_metrics")
      .select("id, target_value, current_value")
      .eq("user_id", args.userId)
      .in("kind", ["north_star", "progress_marker"]),
  ]);

  const activeVitalIds = Array.isArray(activeVitals)
    ? activeVitals.map((row: any) => String(row?.id ?? "")).filter(Boolean)
    : [];
  const { data: vitalEntries } = activeVitalIds.length > 0
    ? await args.supabase
      .from("user_metric_entries")
      .select("metric_id, value_numeric, created_at")
      .eq("user_id", args.userId)
      .in("vital_sign_id", activeVitalIds)
      .gte("recorded_at", vitalsSinceIso)
      .order("recorded_at", { ascending: true })
      .limit(120)
    : { data: [] as any[] };

  const profilePauseUntilIso = (() => {
    const coaching = String(
      (profile as any)?.whatsapp_coaching_paused_until ?? "",
    ).trim();
    const bilan = String((profile as any)?.whatsapp_bilan_paused_until ?? "")
      .trim();
    const coachingMs = parseIsoMs(coaching);
    const bilanMs = parseIsoMs(bilan);
    if (coachingMs >= bilanMs) return coaching || null;
    return bilan || null;
  })();

  return {
    profilePauseUntilIso,
    recentMessages: Array.isArray(recentMessages)
      ? recentMessages.map((row: any) => ({
        role: String(row?.role ?? ""),
        content: String(row?.content ?? ""),
        created_at: String(row?.created_at ?? ""),
      }))
      : [],
    activeActionsCount: Array.isArray(activeActions) ? activeActions.length : 0,
    actionEntries: Array.isArray(actionEntries)
      ? actionEntries.map((row: any) => ({
        action_id: row?.action_id == null ? undefined : String(row.action_id),
        action_title: row?.action_title == null
          ? undefined
          : String(row.action_title),
        note: row?.note == null ? null : String(row.note),
        status: String(row?.status ?? ""),
        performed_at: String(row?.performed_at ?? ""),
      }))
      : [],
    blockerEntries: Array.isArray(blockerEntries)
      ? blockerEntries.map((row: any) => ({
        action_id: row?.action_id == null ? undefined : String(row.action_id),
        action_title: row?.action_title == null
          ? undefined
          : String(row.action_title),
        note: row?.note == null ? null : String(row.note),
        status: String(row?.status ?? ""),
        performed_at: String(row?.performed_at ?? ""),
      }))
      : [],
    activeVitals: Array.isArray(activeVitals)
      ? activeVitals.map((row: any) => ({
        id: String(row?.id ?? ""),
        target_value: row?.target_value == null
          ? null
          : String(row.target_value),
        current_value: row?.current_value == null
          ? null
          : String(row.current_value),
      }))
      : [],
    vitalEntries: Array.isArray(vitalEntries)
      ? vitalEntries.map((row: any) => ({
        vital_sign_id: String(row?.vital_sign_id ?? ""),
        value: String(row?.value ?? ""),
        recorded_at: String(row?.recorded_at ?? ""),
      }))
      : [],
  };
}

async function legacyDisabledConsolidateMomentumState(args: {
  supabase: SupabaseClient;
  userId: string;
  scope: string;
  tempMemory: any;
  nowIso?: string;
}): Promise<MomentumStateMemory> {
  const current = legacyDisabledReadMomentumState(args.tempMemory);
  const snapshot = await fetchMomentumSnapshot({
    supabase: args.supabase,
    userId: args.userId,
    scope: args.scope,
    nowIso: args.nowIso,
  });
  return deriveMomentumFromSnapshot({
    current,
    snapshot,
    nowIso: args.nowIso,
  });
}

export function summarizeMomentumStateForLog(
  momentum: MomentumStateMemory | StoredMomentumV2 | MomentumStateV2,
): Record<string, unknown> {
  if ("blockers" in momentum) {
    const internal = "_internal" in momentum ? momentum._internal : undefined;
    return {
      state: momentum.current_state ?? null,
      state_reason: momentum.state_reason ?? null,
      engagement: momentum.dimensions.engagement.level,
      progression: momentum.dimensions.execution_traction.level,
      emotional_load: momentum.dimensions.emotional_load.level,
      consent: momentum.dimensions.consent.level,
      pending_transition_target:
        internal?.stability.pending_transition?.target_state ?? null,
      pending_transition_confirmations:
        internal?.stability.pending_transition?.confirmations ?? null,
      stable_since_at: internal?.stability.stable_since_at ?? null,
      active_blockers_count: momentum.blockers.blocker_kind ? 1 : 0,
      chronic_blockers_count: momentum.blockers.blocker_repeat_score >= 6 ? 1 : 0,
      top_blocker_action: momentum.assessment.top_blocker ?? null,
      top_blocker_category: momentum.blockers.blocker_kind ?? null,
      top_blocker_stage:
        momentum.blockers.blocker_repeat_score >= 6 ? "chronic" : null,
      updated_at: momentum.updated_at ?? null,
    };
  }
  const topBlocker = legacyDisabledGetTopMomentumBlocker(momentum);
  return {
    state: momentum.current_state ?? null,
    state_reason: momentum.state_reason ?? null,
    engagement: momentum.dimensions.engagement.level,
    progression: momentum.dimensions.progression.level,
    emotional_load: momentum.dimensions.emotional_load.level,
    consent: momentum.dimensions.consent.level,
    pending_transition_target:
      momentum.stability.pending_transition?.target_state ?? null,
    pending_transition_confirmations:
      momentum.stability.pending_transition?.confirmations ?? null,
    stable_since_at: momentum.stability.stable_since_at ?? null,
    active_blockers_count: momentum.metrics.active_blockers_count ?? 0,
    chronic_blockers_count: momentum.metrics.chronic_blockers_count ?? 0,
    top_blocker_action: topBlocker?.action_title ?? null,
    top_blocker_category: topBlocker?.current_category ?? null,
    top_blocker_stage: topBlocker?.stage ?? null,
    updated_at: momentum.updated_at ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// V2 MOMENTUM STATE
// Shape: MomentumStateV2 (v2-types.ts section 5.3)
// Key:   __momentum_state_v2
// ═══════════════════════════════════════════════════════════════════════════════

export const MOMENTUM_STATE_V2_KEY = "__momentum_state_v2";

type V2InternalState = {
  signal_log: {
    emotional_turns: EmotionalEvent[];
    consent_events: ConsentEvent[];
    response_quality_events: ResponseQualityEvent[];
  };
  stability: {
    stable_since_at?: string;
    pending_transition?: PendingTransition;
  };
  sources: {
    router_updated_at?: string;
    watcher_updated_at?: string;
    last_state_change_at?: string;
    last_classified_by?: "router" | "watcher";
  };
  metrics_cache: {
    last_user_turn_at?: string;
    last_user_turn_quality?: ReplyQuality;
    days_since_last_user_message?: number | null;
  };
};

export type StoredMomentumV2 = MomentumStateV2 & { _internal: V2InternalState };

export type MomentumConsolidationSnapshotV2 = {
  profilePauseUntilIso?: string | null;
  recentMessages: ChatMessageRow[];
  planItemsRuntime: PlanItemRuntimeRow[];
  activeLoad: MomentumStateV2["active_load"];
};

function defaultV2Internal(): V2InternalState {
  return {
    signal_log: {
      emotional_turns: [],
      consent_events: [],
      response_quality_events: [],
    },
    stability: {},
    sources: {},
    metrics_cache: {},
  };
}

function defaultMomentumStateV2(): StoredMomentumV2 {
  return {
    version: 2,
    updated_at: nowIsoFrom(),
    current_state: "friction_legere",
    state_reason: "initial_state",
    dimensions: {
      engagement: { level: "medium" },
      execution_traction: { level: "unknown" },
      emotional_load: { level: "low" },
      consent: { level: "open" },
      plan_fit: { level: "uncertain" },
      load_balance: { level: "balanced" },
    },
    assessment: { top_blocker: null, top_risk: null, confidence: "low" },
    active_load: {
      current_load_score: 0,
      mission_slots_used: 0,
      support_slots_used: 0,
      habit_building_slots_used: 0,
      needs_reduce: false,
      needs_consolidate: false,
    },
    posture: { recommended_posture: "simplify", confidence: "low" },
    blockers: { blocker_kind: null, blocker_repeat_score: 0 },
    memory_links: {
      last_useful_support_ids: [],
      last_failed_technique_ids: [],
    },
    _internal: defaultV2Internal(),
  };
}

// --- V2 dimension computation ---

function deriveExecutionTractionV2(
  planItems: PlanItemRuntimeRow[],
): { level: "up" | "flat" | "down" | "unknown"; reason: string } {
  const activeItems = planItems.filter((i) => i.status === "active");
  if (activeItems.length === 0) {
    return { level: "unknown", reason: "no_active_plan_items" };
  }

  let pos = 0;
  let neg = 0;
  for (const item of activeItems) {
    for (const e of item.recent_entries) {
      if (
        e.entry_kind === "checkin" || e.entry_kind === "progress" ||
        e.entry_kind === "partial"
      ) pos++;
      else if (e.entry_kind === "skip" || e.entry_kind === "blocker") neg++;
    }
  }
  const total = pos + neg;
  if (total === 0) return { level: "unknown", reason: "no_recent_entries" };

  const ratio = pos / total;
  if (ratio >= 0.6) return { level: "up", reason: "majority_positive_entries" };
  if (ratio <= 0.3) {
    return { level: "down", reason: "majority_negative_entries" };
  }
  return { level: "flat", reason: "mixed_entries" };
}

function derivePlanFitV2(
  planItems: PlanItemRuntimeRow[],
  nowMs: number,
): { level: "good" | "uncertain" | "poor"; reason: string } {
  if (planItems.length === 0) {
    return { level: "uncertain", reason: "no_plan_items" };
  }

  const active = planItems.filter((i) => i.status === "active");
  const stalled = planItems.filter((i) => i.status === "stalled");
  const completed = planItems.filter((i) => i.status === "completed");

  if (stalled.length / planItems.length >= 0.3) {
    return { level: "poor", reason: "many_stalled_items" };
  }

  const zombies = active.filter((i) => {
    if (i.last_entry_at) {
      return nowMs - parseIsoMs(i.last_entry_at) > SEVEN_DAYS_MS;
    }

    const activationRefMs = parseIsoMs(i.activated_at) ||
      parseIsoMs(i.created_at);
    if (activationRefMs <= 0) return false;

    return nowMs - activationRefMs > SEVEN_DAYS_MS;
  });
  if (
    zombies.length >= 2 ||
    (active.length > 0 && zombies.length === active.length)
  ) {
    return { level: "poor", reason: "multiple_zombie_items" };
  }
  if (
    (completed.length > 0 && stalled.length === 0) ||
    (active.length > 0 && zombies.length === 0)
  ) {
    return { level: "good", reason: "items_progressing" };
  }
  return { level: "uncertain", reason: "mixed_signals" };
}

function deriveLoadBalanceV2(
  activeLoad: MomentumStateV2["active_load"],
): { level: "balanced" | "slightly_heavy" | "overloaded"; reason: string } {
  if (activeLoad.needs_reduce) {
    return { level: "overloaded", reason: "needs_reduce_flagged" };
  }
  if (activeLoad.current_load_score > 5) {
    return { level: "slightly_heavy", reason: "load_score_above_5" };
  }
  return { level: "balanced", reason: "load_within_limits" };
}

// --- V2 classification (same 6 public states as V1) ---

function classifyMomentumStateV2(args: {
  engagement: EngagementLevel;
  executionTraction: ProgressionLevel;
  emotionalLoad: EmotionalLoadLevel;
  consent: ConsentLevel;
  daysSinceLastMessage?: number | null;
}): { state: MomentumStateLabel; reason: string } {
  if (args.emotionalLoad === "high") {
    return { state: "soutien_emotionnel", reason: "emotional_load_high" };
  }
  if (args.consent === "closed") {
    return { state: "pause_consentie", reason: "consent_closed" };
  }
  const daysSince = Number(args.daysSinceLastMessage ?? 0);
  if (
    args.engagement === "low" && Number.isFinite(daysSince) && daysSince >= 3
  ) {
    return { state: "reactivation", reason: "low_engagement_after_silence" };
  }
  if (
    args.executionTraction === "up" && args.consent === "open" &&
    args.engagement !== "low"
  ) {
    return { state: "momentum", reason: "traction_up_and_open_consent" };
  }
  if (args.consent === "open" && args.engagement !== "low") {
    return {
      state: "friction_legere",
      reason: "engaged_but_not_clearly_progressing",
    };
  }
  return { state: "evitement", reason: "default_gray_zone_state" };
}

// --- V2 posture derivation ---

function derivePostureV2(
  state: MomentumStateLabel,
  activeLoad?: MomentumStateV2["active_load"],
): MomentumPosture {
  if (
    activeLoad?.needs_reduce &&
    state !== "soutien_emotionnel" && state !== "pause_consentie"
  ) {
    return "reduce_load";
  }
  switch (state) {
    case "momentum":
      return "push_lightly";
    case "friction_legere":
      return "simplify";
    case "evitement":
      return "hold";
    case "pause_consentie":
      return "hold";
    case "soutien_emotionnel":
      return "support";
    case "reactivation":
      return "reopen_door";
    default:
      return "simplify";
  }
}

// --- V2 assessment derivation ---

function deriveTopRiskV2(args: {
  engagement: EngagementLevel;
  executionTraction: ProgressionLevel;
  emotionalLoad: EmotionalLoadLevel;
  consent: ConsentLevel;
  needsReduce: boolean;
  planFit: "good" | "uncertain" | "poor";
}): MomentumStateV2["assessment"]["top_risk"] {
  if (args.emotionalLoad === "high") return "emotional";
  if (args.consent === "closed") return "consent";
  if (args.needsReduce) return "load";
  if (args.engagement === "low" && args.executionTraction === "down") {
    return "avoidance";
  }
  if (args.planFit === "poor") return "drift";
  if (args.consent === "fragile") return "consent";
  return null;
}

function deriveAssessmentConfidenceV2(args: {
  executionTraction: ProgressionLevel;
  planFit: "good" | "uncertain" | "poor";
  hasRecentEntries: boolean;
}): ConfidenceLevel {
  if (args.executionTraction === "unknown" || !args.hasRecentEntries) {
    return "low";
  }
  if (args.planFit === "uncertain") return "medium";
  return "high";
}

// --- V2 blockers from plan items ---

function deriveBlockersV2(
  planItems: PlanItemRuntimeRow[],
): MomentumStateV2["blockers"] {
  const stalled = planItems.filter((i) => i.status === "stalled");
  if (stalled.length === 0) {
    return { blocker_kind: null, blocker_repeat_score: 0 };
  }

  const counts = new Map<string, number>();
  for (const item of stalled) {
    counts.set(item.dimension, (counts.get(item.dimension) ?? 0) + 1);
  }

  let topDim = "global";
  let topCount = 0;
  for (const [dim, c] of counts) {
    if (c > topCount) {
      topDim = dim;
      topCount = c;
    }
  }

  const kind: MomentumStateV2["blockers"]["blocker_kind"] =
    topDim === "missions"
      ? "mission"
      : topDim === "habits"
      ? "habit"
      : topDim === "support"
      ? "support"
      : "global";

  return {
    blocker_kind: kind,
    blocker_repeat_score: Math.min(stalled.length * 2, 10),
  };
}

// --- V2 read / write ---

export function readMomentumStateV2(tempMemory: any): StoredMomentumV2 {
  const rawV2 = tempMemory?.[MOMENTUM_STATE_V2_KEY];
  if (rawV2 && typeof rawV2 === "object" && rawV2.version === 2) {
    return validateStoredV2(rawV2);
  }
  return defaultMomentumStateV2();
}

function validateStoredV2(raw: any): StoredMomentumV2 {
  const base = defaultMomentumStateV2();
  return {
    ...base,
    ...raw,
    dimensions: { ...base.dimensions, ...(raw.dimensions ?? {}) },
    assessment: { ...base.assessment, ...(raw.assessment ?? {}) },
    active_load: { ...base.active_load, ...(raw.active_load ?? {}) },
    posture: { ...base.posture, ...(raw.posture ?? {}) },
    blockers: { ...base.blockers, ...(raw.blockers ?? {}) },
    memory_links: { ...base.memory_links, ...(raw.memory_links ?? {}) },
    _internal: raw._internal && typeof raw._internal === "object"
      ? {
        signal_log: {
          emotional_turns: Array.isArray(
              raw._internal.signal_log?.emotional_turns,
            )
            ? raw._internal.signal_log.emotional_turns
            : [],
          consent_events: Array.isArray(
              raw._internal.signal_log?.consent_events,
            )
            ? raw._internal.signal_log.consent_events
            : [],
          response_quality_events: Array.isArray(
              raw._internal.signal_log?.response_quality_events,
            )
            ? raw._internal.signal_log.response_quality_events
            : [],
        },
        stability: raw._internal.stability ?? {},
        sources: raw._internal.sources ?? {},
        metrics_cache: raw._internal.metrics_cache ?? {},
      }
      : defaultV2Internal(),
  };
}

export function writeMomentumStateV2(
  tempMemory: any,
  state: StoredMomentumV2,
): any {
  const next = tempMemory && typeof tempMemory === "object"
    ? { ...tempMemory }
    : {};
  next[MOMENTUM_STATE_V2_KEY] = state;
  return next;
}

export function toPublicMomentumV2(
  stored: StoredMomentumV2,
): MomentumStateV2 {
  const { _internal: _, ...publicState } = stored;
  return publicState;
}

// --- Adapter: V2 internal → V1 shape for stabilization reuse ---

function v2ToStabilizationInput(
  stored: StoredMomentumV2,
): MomentumStateMemory {
  return {
    version: 1,
    current_state: stored.current_state,
    state_reason: stored.state_reason,
    dimensions: {
      engagement: {
        level: stored.dimensions.engagement.level as EngagementLevel,
      },
      progression: {
        level: stored.dimensions.execution_traction
          .level as ProgressionLevel,
      },
      emotional_load: {
        level: stored.dimensions.emotional_load.level as EmotionalLoadLevel,
      },
      consent: { level: stored.dimensions.consent.level as ConsentLevel },
    },
    metrics: {
      last_user_turn_at: stored._internal.metrics_cache.last_user_turn_at,
      last_user_turn_quality:
        stored._internal.metrics_cache.last_user_turn_quality,
      days_since_last_user_message:
        stored._internal.metrics_cache.days_since_last_user_message,
    },
    blocker_memory: { actions: [] },
    signal_log: stored._internal.signal_log,
    stability: stored._internal.stability,
    sources: stored._internal.sources,
  };
}

// --- V2 router path ---

export function applyRouterMomentumSignalsV2(args: {
  tempMemory: any;
  userMessage: string;
  dispatcherSignals: DispatcherSignals;
  nowIso?: string;
}): StoredMomentumV2 {
  const nowIso = nowIsoFrom(args.nowIso);
  const nowMs = parseIsoMs(nowIso);
  const current = readMomentumStateV2(args.tempMemory);
  const internal = current._internal;

  const responseQuality = detectReplyQuality(args.userMessage);
  const emotional = detectQuickEmotionalLoad(
    args.userMessage,
    args.dispatcherSignals,
  );
  const consentSignal = detectConsentSignal(
    args.userMessage,
    args.dispatcherSignals,
  );

  const responseEvents = pruneTimedArray(
    [...internal.signal_log.response_quality_events, {
      at: nowIso,
      quality: responseQuality,
    }],
    { nowMs, maxAgeMs: SEVEN_DAYS_MS, maxItems: MAX_RESPONSE_EVENTS },
  );
  const emotionalEvents = emotional.level === "high" ||
      emotional.level === "medium"
    ? pruneTimedArray(
      [...internal.signal_log.emotional_turns, {
        at: nowIso,
        level: emotional.level,
      }],
      { nowMs, maxAgeMs: SEVEN_DAYS_MS, maxItems: MAX_EMOTIONAL_EVENTS },
    )
    : pruneTimedArray(internal.signal_log.emotional_turns, {
      nowMs,
      maxAgeMs: SEVEN_DAYS_MS,
      maxItems: MAX_EMOTIONAL_EVENTS,
    });
  const consentEvents = consentSignal.eventKind
    ? pruneTimedArray(
      [...internal.signal_log.consent_events, {
        at: nowIso,
        kind: consentSignal.eventKind,
      }],
      { nowMs, maxAgeMs: SEVEN_DAYS_MS, maxItems: MAX_CONSENT_EVENTS },
    )
    : pruneTimedArray(internal.signal_log.consent_events, {
      nowMs,
      maxAgeMs: SEVEN_DAYS_MS,
      maxItems: MAX_CONSENT_EVENTS,
    });

  const substantiveCount =
    responseEvents.filter((i) => i.quality === "substantive").length;
  const minimalCount = responseEvents.filter((i) => i.quality === "minimal")
    .length;

  let engagementLevel = current.dimensions.engagement
    .level as EngagementLevel;
  let engagementReason = current.dimensions.engagement.reason ?? "carry_over";
  if (responseQuality === "substantive" && substantiveCount >= 1) {
    engagementLevel = "high";
    engagementReason = "substantive_recent_reply";
  } else if (minimalCount >= 3 && substantiveCount === 0) {
    engagementLevel = "low";
    engagementReason = "repeated_minimal_replies";
  } else if (
    responseQuality === "minimal" && engagementLevel === "low"
  ) {
    engagementReason = "low_engagement_persists";
  } else {
    engagementLevel = responseQuality === "substantive" ? "high" : "medium";
    engagementReason = responseQuality === "substantive"
      ? "substantive_current_turn"
      : "brief_or_minimal_current_turn";
  }

  const emotional72h = pruneTimedArray(emotionalEvents, {
    nowMs,
    maxAgeMs: SEVENTY_TWO_HOURS_MS,
    maxItems: MAX_EMOTIONAL_EVENTS,
  });
  const highCount = emotional72h.filter((i) => i.level === "high").length;
  const mediumCount = emotional72h.filter((i) => i.level === "medium").length;
  const emotionalLevel: EmotionalLoadLevel = emotional.level === "high"
    ? "high"
    : highCount >= 2
    ? "high"
    : emotional.level === "medium" || mediumCount + highCount >= 1
    ? "medium"
    : "low";
  const emotionalReason = emotionalLevel === emotional.level
    ? emotional.reason
    : emotionalLevel === "high"
    ? "rolling_high_emotional_load"
    : emotionalLevel === "medium"
    ? "rolling_medium_emotional_load"
    : "no_recent_emotional_load";

  let consentLevel = consentSignal.level;
  let consentReason = consentSignal.reason;
  if (
    current.dimensions.consent.level === "closed" &&
    consentSignal.level === "open" &&
    responseQuality !== "substantive"
  ) {
    consentLevel = "fragile";
    consentReason = "recovering_from_closed_consent";
  }

  const executionTraction = current.dimensions.execution_traction;
  const planFit = current.dimensions.plan_fit;
  const loadBalance = current.dimensions.load_balance;

  const classified = classifyMomentumStateV2({
    engagement: engagementLevel,
    executionTraction: executionTraction.level as ProgressionLevel,
    emotionalLoad: emotionalLevel,
    consent: consentLevel,
    daysSinceLastMessage: 0,
  });

  const stabilized = stabilizeClassifiedState({
    current: v2ToStabilizationInput(current),
    proposedState: classified.state,
    proposedReason: classified.reason,
    classifiedBy: "router",
    nowIso,
    engagement: engagementLevel,
    progression: executionTraction.level as ProgressionLevel,
    emotionalLoad: emotionalLevel,
    consent: consentLevel,
    metrics: {
      last_user_turn_at: nowIso,
      last_user_turn_quality: responseQuality,
      days_since_last_user_message: 0,
    },
  });

  const posture = derivePostureV2(stabilized.state, current.active_load);
  const topRisk = deriveTopRiskV2({
    engagement: engagementLevel,
    executionTraction: executionTraction.level as ProgressionLevel,
    emotionalLoad: emotionalLevel,
    consent: consentLevel,
    needsReduce: current.active_load.needs_reduce,
    planFit: planFit.level as "good" | "uncertain" | "poor",
  });

  return {
    version: 2,
    updated_at: nowIso,
    current_state: stabilized.state,
    state_reason: stabilized.reason,
    dimensions: {
      engagement: { level: engagementLevel, reason: engagementReason },
      execution_traction: executionTraction,
      emotional_load: { level: emotionalLevel, reason: emotionalReason },
      consent: { level: consentLevel, reason: consentReason },
      plan_fit: planFit,
      load_balance: loadBalance,
    },
    assessment: {
      top_blocker: current.assessment.top_blocker,
      top_risk: topRisk,
      confidence: current.assessment.confidence,
    },
    active_load: current.active_load,
    posture: {
      recommended_posture: posture,
      confidence: topRisk === null ? "high" : "medium",
    },
    blockers: current.blockers,
    memory_links: current.memory_links,
    _internal: {
      signal_log: {
        emotional_turns: emotionalEvents,
        consent_events: consentEvents,
        response_quality_events: responseEvents,
      },
      stability: stabilized.stability,
      sources: updateStateMetadata(
        v2ToStabilizationInput(current),
        stabilized.state,
        "router",
        nowIso,
      ),
      metrics_cache: {
        last_user_turn_at: nowIso,
        last_user_turn_quality: responseQuality,
        days_since_last_user_message: 0,
      },
    },
  };
}

// --- V2 watcher consolidation (pure function) ---

export function deriveMomentumFromSnapshotV2(args: {
  current: StoredMomentumV2;
  snapshot: MomentumConsolidationSnapshotV2;
  nowIso?: string;
}): StoredMomentumV2 {
  const nowIso = nowIsoFrom(args.nowIso);
  const nowMs = parseIsoMs(nowIso);
  const internal = args.current._internal;

  const responseEvents = pruneTimedArray(
    internal.signal_log.response_quality_events,
    { nowMs, maxAgeMs: SEVEN_DAYS_MS, maxItems: MAX_RESPONSE_EVENTS },
  );
  const emotionalEvents = pruneTimedArray(
    internal.signal_log.emotional_turns,
    { nowMs, maxAgeMs: SEVEN_DAYS_MS, maxItems: MAX_EMOTIONAL_EVENTS },
  );
  const consentEvents = pruneTimedArray(
    internal.signal_log.consent_events,
    { nowMs, maxAgeMs: SEVEN_DAYS_MS, maxItems: MAX_CONSENT_EVENTS },
  );

  const engagement = computeEngagementFromSnapshot({
    recentMessages: args.snapshot.recentMessages,
    responseEvents,
    nowMs,
  });
  const executionTraction = deriveExecutionTractionV2(
    args.snapshot.planItemsRuntime,
  );
  const emotional = computeEmotionalLoadFromSignals({
    emotionalEvents,
    nowMs,
  });
  const consent = computeConsentFromSignals({
    consentEvents,
    profilePauseUntilIso: args.snapshot.profilePauseUntilIso,
    nowMs,
  });
  const planFit = derivePlanFitV2(args.snapshot.planItemsRuntime, nowMs);
  const loadBalance = deriveLoadBalanceV2(args.snapshot.activeLoad);
  const blockers = deriveBlockersV2(args.snapshot.planItemsRuntime);

  let daysSinceLastMessage = engagement.metrics.days_since_last_user_message;
  if (daysSinceLastMessage === null || daysSinceLastMessage === undefined) {
    const lastTurnMs = parseIsoMs(internal.metrics_cache.last_user_turn_at);
    if (lastTurnMs > 0) {
      daysSinceLastMessage = round2((nowMs - lastTurnMs) / ONE_DAY_MS);
    }
  }

  const classified = classifyMomentumStateV2({
    engagement: engagement.level,
    executionTraction: executionTraction.level,
    emotionalLoad: emotional.level,
    consent: consent.level,
    daysSinceLastMessage,
  });

  const stabilized = stabilizeClassifiedState({
    current: v2ToStabilizationInput(args.current),
    proposedState: classified.state,
    proposedReason: classified.reason,
    classifiedBy: "watcher",
    nowIso,
    engagement: engagement.level,
    progression: executionTraction.level as ProgressionLevel,
    emotionalLoad: emotional.level,
    consent: consent.level,
    metrics: {
      ...(internal.metrics_cache as MomentumMetrics),
      ...engagement.metrics,
      ...emotional.metrics,
      ...consent.metrics,
    },
  });

  const posture = derivePostureV2(
    stabilized.state,
    args.snapshot.activeLoad,
  );
  const topRisk = deriveTopRiskV2({
    engagement: engagement.level,
    executionTraction: executionTraction.level,
    emotionalLoad: emotional.level,
    consent: consent.level,
    needsReduce: args.snapshot.activeLoad.needs_reduce,
    planFit: planFit.level,
  });
  const hasRecentEntries = args.snapshot.planItemsRuntime.some((i) =>
    i.recent_entries.length > 0
  );
  const topBlockerTitle = blockers.blocker_kind
    ? args.snapshot.planItemsRuntime.find((i) => i.status === "stalled")
      ?.title ?? null
    : null;

  return {
    version: 2,
    updated_at: nowIso,
    current_state: stabilized.state,
    state_reason: stabilized.reason,
    dimensions: {
      engagement: { level: engagement.level, reason: engagement.reason },
      execution_traction: executionTraction,
      emotional_load: { level: emotional.level, reason: emotional.reason },
      consent: { level: consent.level, reason: consent.reason },
      plan_fit: planFit,
      load_balance: loadBalance,
    },
    assessment: {
      top_blocker: topBlockerTitle,
      top_risk: topRisk,
      confidence: deriveAssessmentConfidenceV2({
        executionTraction: executionTraction.level,
        planFit: planFit.level,
        hasRecentEntries,
      }),
    },
    active_load: args.snapshot.activeLoad,
    posture: {
      recommended_posture: posture,
      confidence: topRisk === null ? "high" : "medium",
    },
    blockers,
    memory_links: args.current.memory_links,
    _internal: {
      signal_log: {
        emotional_turns: emotionalEvents,
        consent_events: consentEvents,
        response_quality_events: responseEvents,
      },
      stability: stabilized.stability,
      sources: updateStateMetadata(
        v2ToStabilizationInput(args.current),
        stabilized.state,
        "watcher",
        nowIso,
      ),
      metrics_cache: {
        last_user_turn_at: internal.metrics_cache.last_user_turn_at,
        last_user_turn_quality: internal.metrics_cache.last_user_turn_quality,
        days_since_last_user_message: daysSinceLastMessage,
      },
    },
  };
}

// --- V2 watcher DB consolidation ---

export async function consolidateMomentumStateV2(args: {
  supabase: SupabaseClient;
  userId: string;
  scope: string;
  tempMemory: any;
  nowIso?: string;
}): Promise<StoredMomentumV2> {
  const nowIso = nowIsoFrom(args.nowIso);
  const current = readMomentumStateV2(args.tempMemory);

  const runtime = await getActiveTransformationRuntime(
    args.supabase,
    args.userId,
  );

  let planItemsRuntime: PlanItemRuntimeRow[] = [];
  let activeLoad: MomentumStateV2["active_load"] = current.active_load;

  if (runtime.plan) {
    const [items, load] = await Promise.all([
      getPlanItemRuntime(args.supabase, runtime.plan.id, {
        scope: "current_phase",
      }),
      getActiveLoad(args.supabase, runtime.plan.id),
    ]);
    planItemsRuntime = items;
    activeLoad = load;
  }

  const messagesSinceIso = new Date(
    parseIsoMs(nowIso) - SEVEN_DAYS_MS,
  ).toISOString();

  const [{ data: profile }, { data: recentMessages }] = await Promise.all([
    args.supabase
      .from("profiles")
      .select("whatsapp_coaching_paused_until, whatsapp_bilan_paused_until")
      .eq("id", args.userId)
      .maybeSingle(),
    args.supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("user_id", args.userId)
      .eq("scope", args.scope)
      .gte("created_at", messagesSinceIso)
      .order("created_at", { ascending: true })
      .limit(120),
  ]);

  const profilePauseUntilIso = (() => {
    const coaching = String(
      (profile as any)?.whatsapp_coaching_paused_until ?? "",
    ).trim();
    const bilan = String(
      (profile as any)?.whatsapp_bilan_paused_until ?? "",
    ).trim();
    const coachingMs = parseIsoMs(coaching);
    const bilanMs = parseIsoMs(bilan);
    return coachingMs >= bilanMs ? (coaching || null) : (bilan || null);
  })();

  const messagesTyped: ChatMessageRow[] = Array.isArray(recentMessages)
    ? recentMessages.map((row: any) => ({
      role: String(row?.role ?? ""),
      content: String(row?.content ?? ""),
      created_at: String(row?.created_at ?? ""),
    }))
    : [];

  return deriveMomentumFromSnapshotV2({
    current,
    snapshot: {
      profilePauseUntilIso,
      recentMessages: messagesTyped,
      planItemsRuntime,
      activeLoad,
    },
    nowIso,
  });
}

// --- V2 log summary ---

export function summarizeMomentumStateV2ForLog(
  state: MomentumStateV2,
): Record<string, unknown> {
  return {
    state: state.current_state,
    state_reason: state.state_reason,
    engagement: state.dimensions.engagement.level,
    execution_traction: state.dimensions.execution_traction.level,
    emotional_load: state.dimensions.emotional_load.level,
    consent: state.dimensions.consent.level,
    plan_fit: state.dimensions.plan_fit.level,
    load_balance: state.dimensions.load_balance.level,
    top_risk: state.assessment.top_risk,
    top_blocker: state.assessment.top_blocker,
    confidence: state.assessment.confidence,
    posture: state.posture.recommended_posture,
    load_score: state.active_load.current_load_score,
    needs_reduce: state.active_load.needs_reduce,
    needs_consolidate: state.active_load.needs_consolidate,
    blocker_kind: state.blockers.blocker_kind,
    updated_at: state.updated_at,
  };
}
