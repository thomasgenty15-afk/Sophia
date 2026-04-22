import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import {
  detectReplyQuality,
  type MomentumStateSnapshot,
  summarizeMomentumStateForLog,
} from "./v2-momentum-helpers.ts";
import {
  getMomentumOutreachStateFromEventContext,
  isMomentumOutreachEventContext,
} from "./v2-outreach-helpers.ts";

declare const Deno: any;

function parseBoolEnv(v: string | undefined): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}

function truncateDeep(
  input: unknown,
  opts?: { maxLen?: number; maxDepth?: number; maxKeys?: number; maxArray?: number },
): unknown {
  const maxLen = Math.max(64, Math.floor(opts?.maxLen ?? 1200));
  const maxDepth = Math.max(1, Math.floor(opts?.maxDepth ?? 7));
  const maxKeys = Math.max(10, Math.floor(opts?.maxKeys ?? 80));
  const maxArray = Math.max(5, Math.floor(opts?.maxArray ?? 25));
  const seen = new WeakSet<object>();

  const clamp = (s: string) => (s.length > maxLen ? s.slice(0, maxLen) + "…" : s);
  const rec = (v: any, depth: number): any => {
    if (v == null) return v;
    const t = typeof v;
    if (t === "string") return clamp(v);
    if (t === "number" || t === "boolean") return v;
    if (t !== "object") return clamp(String(v));
    if (depth >= maxDepth) return "[truncated_depth]";
    if (seen.has(v)) return "[circular]";
    seen.add(v);
    if (Array.isArray(v)) return v.slice(0, maxArray).map((x) => rec(x, depth + 1));
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).slice(0, maxKeys)) {
      out[k] = rec(v[k], depth + 1);
    }
    return out;
  };
  return rec(input, 0);
}

export function isMomentumObservabilityEnabled(): boolean {
  const denoEnv = (globalThis as any)?.Deno?.env;
  const momentumRaw = denoEnv?.get?.("MOMENTUM_OBSERVABILITY_ON");
  const memoryRaw = denoEnv?.get?.("MEMORY_OBSERVABILITY_ON");
  return parseBoolEnv(momentumRaw) || parseBoolEnv(memoryRaw);
}

export async function logMomentumObservabilityEvent(opts: {
  supabase: SupabaseClient;
  userId: string;
  requestId?: string | null;
  turnId?: string | null;
  channel?: "web" | "whatsapp" | null;
  scope?: string | null;
  sourceComponent: string;
  eventName: string;
  payload?: unknown;
}): Promise<void> {
  try {
    if (!isMomentumObservabilityEnabled()) return;
    const userId = String(opts.userId ?? "").trim();
    const sourceComponent = String(opts.sourceComponent ?? "").trim();
    const eventName = String(opts.eventName ?? "").trim();
    if (!userId || !sourceComponent || !eventName) return;

    const payload = truncateDeep(opts.payload ?? {});
    const { error } = await (opts.supabase as any)
      .from("memory_observability_events")
      .insert({
        request_id: opts.requestId ? String(opts.requestId).trim() : null,
        turn_id: opts.turnId ? String(opts.turnId).trim() : null,
        user_id: userId,
        channel: opts.channel ?? null,
        scope: opts.scope ? String(opts.scope).trim() : null,
        source_component: sourceComponent,
        event_name: eventName,
        payload,
      });
    if (error) {
      console.warn("[MomentumObservability] insert failed", {
        event_name: eventName,
        source_component: sourceComponent,
        error: String((error as any)?.message ?? error ?? "").slice(0, 280),
      });
    }
  } catch (error) {
    console.warn("[MomentumObservability] unexpected error", {
      event_name: String(opts.eventName ?? "").trim(),
      source_component: String(opts.sourceComponent ?? "").trim(),
      error: String((error as any)?.message ?? error ?? "").slice(0, 280),
    });
  }
}

// V1 stores pending_transition under `stability`; V2 stores it under `_internal.stability`.
function readPendingTransition(
  momentum: MomentumStateSnapshot,
): Record<string, any> | null {
  const pending = momentum?.stability?.pending_transition
    ?? momentum?._internal?.stability?.pending_transition
    ?? null;
  return pending && typeof pending === "object" ? pending : null;
}

function pendingSnapshot(momentum: MomentumStateSnapshot): Record<string, unknown> | null {
  const pending = readPendingTransition(momentum);
  if (!pending) return null;
  return {
    target_state: pending.target_state ?? null,
    reason: pending.reason ?? null,
    confirmations: pending.confirmations ?? null,
    first_seen_at: pending.first_seen_at ?? null,
    last_seen_at: pending.last_seen_at ?? null,
    source: pending.source ?? null,
  };
}

// V1 has a top-level `metrics` block. V2 has no such block and relies on
// `blockers` + `_internal.metrics_cache` instead. Be defensive for both.
function metricsSnapshot(momentum: MomentumStateSnapshot): Record<string, unknown> {
  const m = momentum?.metrics ?? momentum?._internal?.metrics_cache ?? {};
  return {
    days_since_last_user_message: m?.days_since_last_user_message ?? null,
    completed_actions_7d: m?.completed_actions_7d ?? null,
    missed_actions_7d: m?.missed_actions_7d ?? null,
    partial_actions_7d: m?.partial_actions_7d ?? null,
    improved_vitals_14d: m?.improved_vitals_14d ?? null,
    worsened_vitals_14d: m?.worsened_vitals_14d ?? null,
    emotional_high_72h: m?.emotional_high_72h ?? null,
    emotional_medium_72h: m?.emotional_medium_72h ?? null,
    consent_soft_declines_7d: m?.consent_soft_declines_7d ?? null,
    consent_explicit_stops_7d: m?.consent_explicit_stops_7d ?? null,
    last_gap_hours: m?.last_gap_hours ?? null,
  };
}

// Unified blocker counts that work for both shapes:
// - V1 exposes them directly under `metrics.{active,chronic}_blockers_count`.
// - V2 only has `blockers.blocker_kind` + `blockers.blocker_repeat_score`.
function blockerCounts(
  momentum: MomentumStateSnapshot,
): { active: number; chronic: number } {
  const v1Active = momentum?.metrics?.active_blockers_count;
  const v1Chronic = momentum?.metrics?.chronic_blockers_count;
  if (typeof v1Active === "number" || typeof v1Chronic === "number") {
    return {
      active: Number(v1Active ?? 0) || 0,
      chronic: Number(v1Chronic ?? 0) || 0,
    };
  }
  const kind = momentum?.blockers?.blocker_kind;
  const repeat = Number(momentum?.blockers?.blocker_repeat_score ?? 0) || 0;
  return {
    active: kind ? 1 : 0,
    chronic: repeat >= 6 ? 1 : 0,
  };
}

export function buildMomentumStateObservabilityEvents(args: {
  source: "router" | "watcher";
  previous: MomentumStateSnapshot;
  next: MomentumStateSnapshot;
}): Array<{ eventName: string; payload: Record<string, unknown> }> {
  const previousSummary = summarizeMomentumStateForLog(args.previous);
  const nextSummary = summarizeMomentumStateForLog(args.next);
  const basePayload = {
    state_before: args.previous.current_state ?? null,
    state_after: args.next.current_state ?? null,
    state_reason: args.next.state_reason ?? null,
    classifier_source: args.source,
    dimensions: {
      engagement: args.next.dimensions?.engagement?.level ?? null,
      // V2 stores this as `execution_traction`; V1 used `progression`.
      // Fall back across both to stay resilient to either snapshot shape.
      progression: args.next.dimensions?.execution_traction?.level
        ?? args.next.dimensions?.progression?.level
        ?? null,
      emotional_load: args.next.dimensions?.emotional_load?.level ?? null,
      consent: args.next.dimensions?.consent?.level ?? null,
    },
    blocker_summary: (() => {
      const counts = blockerCounts(args.next);
      return {
        active_count: counts.active,
        chronic_count: counts.chronic,
        top_action: nextSummary.top_blocker_action ?? null,
        top_category: nextSummary.top_blocker_category ?? null,
        top_stage: nextSummary.top_blocker_stage ?? null,
      };
    })(),
    pending_transition: pendingSnapshot(args.next),
    metrics_snapshot: metricsSnapshot(args.next),
    previous_summary: previousSummary,
    next_summary: nextSummary,
  };

  const events: Array<{ eventName: string; payload: Record<string, unknown> }> = [{
    eventName: args.source === "router"
      ? "router_momentum_state_applied"
      : "watcher_momentum_state_consolidated",
    payload: basePayload,
  }];

  const prevPending = readPendingTransition(args.previous);
  const nextPending = readPendingTransition(args.next);
  if (
    nextPending &&
    (
      !prevPending ||
      prevPending.target_state !== nextPending.target_state ||
      prevPending.confirmations !== nextPending.confirmations
    )
  ) {
    events.push({
      eventName: "momentum_transition_pending",
      payload: {
        ...basePayload,
        pending_target: nextPending.target_state,
        pending_reason: nextPending.reason ?? null,
        pending_confirmations: nextPending.confirmations,
      },
    });
  }

  if ((args.previous.current_state ?? null) !== (args.next.current_state ?? null)) {
    events.push({
      eventName: "momentum_transition_confirmed",
      payload: {
        ...basePayload,
        from_state: args.previous.current_state ?? null,
        to_state: args.next.current_state ?? null,
      },
    });
  } else if (prevPending && !nextPending) {
    events.push({
      eventName: "momentum_transition_rejected",
      payload: {
        ...basePayload,
        rejected_target: prevPending.target_state,
        rejected_reason: prevPending.reason ?? null,
        rejected_confirmations: prevPending.confirmations,
      },
    });
  }

  return events;
}

export async function logMomentumStateObservability(args: {
  supabase: SupabaseClient;
  userId: string;
  requestId?: string | null;
  turnId?: string | null;
  channel?: "web" | "whatsapp" | null;
  scope?: string | null;
  source: "router" | "watcher";
  previous: MomentumStateSnapshot;
  next: MomentumStateSnapshot;
}): Promise<void> {
  const events = buildMomentumStateObservabilityEvents({
    source: args.source,
    previous: args.previous,
    next: args.next,
  });
  for (const event of events) {
    await logMomentumObservabilityEvent({
      supabase: args.supabase,
      userId: args.userId,
      requestId: args.requestId,
      turnId: args.turnId,
      channel: args.channel ?? null,
      scope: args.scope ?? null,
      sourceComponent: args.source,
      eventName: event.eventName,
      payload: event.payload,
    });
  }
}

export async function logMomentumUserReplyAfterOutreachIfRelevant(args: {
  supabase: SupabaseClient;
  userId: string;
  requestId?: string | null;
  channel: "web" | "whatsapp";
  scope: string;
  userMessage: string;
  stateBeforeReply?: string | null;
  stateAfterReply?: string | null;
}): Promise<void> {
  if (!isMomentumObservabilityEnabled()) return;
  const nowMs = Date.now();
  const sinceIso = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await (args.supabase as any)
    .from("chat_messages")
    .select("created_at, metadata")
    .eq("user_id", args.userId)
    .eq("scope", args.scope)
    .eq("role", "assistant")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) return;

  const latestMomentumOutreach = (Array.isArray(data) ? data : []).find((row: any) => {
    const metadata = row?.metadata ?? {};
    return String(metadata?.source ?? "") === "scheduled_checkin" &&
      isMomentumOutreachEventContext(String(metadata?.event_context ?? ""));
  });
  if (!latestMomentumOutreach) return;

  const sentAt = String((latestMomentumOutreach as any)?.created_at ?? "").trim();
  const sentMs = sentAt ? new Date(sentAt).getTime() : NaN;
  if (!Number.isFinite(sentMs) || sentMs > nowMs) return;

  const eventContext = String((latestMomentumOutreach as any)?.metadata?.event_context ?? "");
  await logMomentumObservabilityEvent({
    supabase: args.supabase,
    userId: args.userId,
    requestId: args.requestId,
    channel: args.channel,
    scope: args.scope,
    sourceComponent: "router",
    eventName: "momentum_user_reply_after_outreach",
    payload: {
      related_outreach_event_context: eventContext,
      related_outreach_state: getMomentumOutreachStateFromEventContext(eventContext) ?? null,
      related_outreach_sent_at: sentAt || null,
      delay_hours: Number.isFinite(sentMs)
        ? Math.round(((nowMs - sentMs) / (60 * 60 * 1000)) * 100) / 100
        : null,
      reply_quality: detectReplyQuality(args.userMessage),
      reply_detected: true,
      state_before_reply: args.stateBeforeReply ?? null,
      state_after_reply: args.stateAfterReply ?? null,
    },
  });
}
