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

function pendingSnapshot(momentum: MomentumStateSnapshot): Record<string, unknown> | null {
  const pending = momentum.stability.pending_transition;
  if (!pending) return null;
  return {
    target_state: pending.target_state,
    reason: pending.reason ?? null,
    confirmations: pending.confirmations,
    first_seen_at: pending.first_seen_at,
    last_seen_at: pending.last_seen_at,
    source: pending.source,
  };
}

function metricsSnapshot(momentum: MomentumStateSnapshot): Record<string, unknown> {
  return {
    days_since_last_user_message: momentum.metrics.days_since_last_user_message ?? null,
    completed_actions_7d: momentum.metrics.completed_actions_7d ?? null,
    missed_actions_7d: momentum.metrics.missed_actions_7d ?? null,
    partial_actions_7d: momentum.metrics.partial_actions_7d ?? null,
    improved_vitals_14d: momentum.metrics.improved_vitals_14d ?? null,
    worsened_vitals_14d: momentum.metrics.worsened_vitals_14d ?? null,
    emotional_high_72h: momentum.metrics.emotional_high_72h ?? null,
    emotional_medium_72h: momentum.metrics.emotional_medium_72h ?? null,
    consent_soft_declines_7d: momentum.metrics.consent_soft_declines_7d ?? null,
    consent_explicit_stops_7d: momentum.metrics.consent_explicit_stops_7d ?? null,
    last_gap_hours: momentum.metrics.last_gap_hours ?? null,
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
      engagement: args.next.dimensions.engagement.level,
      progression: args.next.dimensions.progression.level,
      emotional_load: args.next.dimensions.emotional_load.level,
      consent: args.next.dimensions.consent.level,
    },
    blocker_summary: {
      active_count: args.next.metrics.active_blockers_count ?? 0,
      chronic_count: args.next.metrics.chronic_blockers_count ?? 0,
      top_action: nextSummary.top_blocker_action ?? null,
      top_category: nextSummary.top_blocker_category ?? null,
      top_stage: nextSummary.top_blocker_stage ?? null,
    },
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

  const prevPending = args.previous.stability.pending_transition;
  const nextPending = args.next.stability.pending_transition;
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
