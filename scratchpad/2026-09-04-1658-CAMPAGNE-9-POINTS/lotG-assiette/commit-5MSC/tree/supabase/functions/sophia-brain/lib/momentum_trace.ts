import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

type ChatMessageRow = {
  id: string;
  role: string;
  content: string;
  scope: string | null;
  created_at: string;
  agent_used?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ObservabilityEventRow = {
  id: number;
  created_at: string;
  request_id?: string | null;
  turn_id?: string | null;
  channel?: "web" | "whatsapp" | null;
  scope?: string | null;
  source_component: string;
  event_name: string;
  payload?: Record<string, unknown> | null;
};

export type MomentumTraceEvent = {
  id: number;
  at: string;
  event_name: string;
  source_component: string;
  payload: Record<string, unknown>;
};

export type MomentumStateTimelineEntry = {
  id: number;
  at: string;
  event_name: string;
  source_component: string;
  state_before: string | null;
  state_after: string | null;
  state_reason: string | null;
  dimensions: Record<string, unknown>;
  pending_transition: Record<string, unknown> | null;
  payload: Record<string, unknown>;
};

export type MomentumProactiveDecisionEntry = {
  id: number;
  at: string;
  event_name: string;
  source_component: string;
  target_kind: string | null;
  state_at_decision: string | null;
  decision: string | null;
  decision_reason: string | null;
  payload: Record<string, unknown>;
};

export type MomentumTraceTurn = {
  turn_id: string | null;
  request_id: string | null;
  started_at: string;
  scope: string | null;
  channel: "web" | "whatsapp" | null;
  user_message: ChatMessageRow | null;
  assistant_messages: ChatMessageRow[];
  state_events: MomentumTraceEvent[];
  reaction_events: MomentumTraceEvent[];
  events: MomentumTraceEvent[];
};

export type MomentumTraceOutreach = {
  run_id: string;
  started_at: string;
  event_context: string | null;
  outreach_state: string | null;
  scheduled_checkin_id: string | null;
  decision: MomentumTraceEvent | null;
  schedule: MomentumTraceEvent | null;
  deliveries: MomentumTraceEvent[];
  reaction: MomentumTraceEvent | null;
  events: MomentumTraceEvent[];
};

export type MomentumTraceWindow = {
  user_id: string;
  window: {
    from: string;
    to: string;
    scope: string | null;
  };
  summary: {
    messages_total: number;
    user_messages: number;
    assistant_messages: number;
    turns_total: number;
    state_events_total: number;
    proactive_decisions_total: number;
    outreachs_total: number;
    observability_events_total: number;
  };
  messages: ChatMessageRow[];
  turns: MomentumTraceTurn[];
  state_timeline: MomentumStateTimelineEntry[];
  proactive_decisions: MomentumProactiveDecisionEntry[];
  outreachs: MomentumTraceOutreach[];
  unassigned_events: MomentumTraceEvent[];
};

const MOMENTUM_EVENT_PREFIXES = [
  "router_momentum_",
  "watcher_momentum_",
  "momentum_transition_",
  "daily_bilan_momentum_decision",
  "weekly_bilan_momentum_decision",
  "momentum_morning_nudge_",
  "momentum_outreach_",
  "momentum_user_reply_after_outreach",
  "momentum_user_silence_after_outreach",
  "momentum_state_changed_after_outreach",
];

const STATE_EVENT_NAMES = new Set([
  "router_momentum_state_applied",
  "watcher_momentum_state_consolidated",
  "momentum_transition_pending",
  "momentum_transition_confirmed",
  "momentum_transition_rejected",
]);

const DECISION_EVENT_NAMES = new Set([
  "daily_bilan_momentum_decision",
  "weekly_bilan_momentum_decision",
  "momentum_morning_nudge_decision",
  "momentum_outreach_decision",
]);

const OUTREACH_EVENT_NAMES = new Set([
  "momentum_outreach_decision",
  "momentum_outreach_scheduled",
  "momentum_outreach_schedule_skipped",
  "momentum_outreach_sent",
  "momentum_outreach_deferred",
  "momentum_outreach_cancelled",
  "momentum_outreach_failed",
  "momentum_outreach_throttled",
]);

const REACTION_EVENT_NAMES = new Set([
  "momentum_user_reply_after_outreach",
  "momentum_user_silence_after_outreach",
  "momentum_state_changed_after_outreach",
]);

function asIso(input: string | Date): string {
  const dt = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(dt.getTime())) throw new Error("invalid_iso_datetime");
  return dt.toISOString();
}

function parseRequestIdFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const direct = String((metadata as any)?.request_id ?? "").trim();
  if (direct) return direct;
  const nestedV2 = String((metadata as any)?.router_decision_v2?.request_id ?? "").trim();
  if (nestedV2) return nestedV2;
  const nestedV1 = String((metadata as any)?.router_decision_v1?.request_id ?? "").trim();
  return nestedV1 || null;
}

function normalizePayload(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return payload && typeof payload === "object" ? payload : {};
}

function toTraceEvent(row: ObservabilityEventRow): MomentumTraceEvent {
  return {
    id: row.id,
    at: row.created_at,
    event_name: row.event_name,
    source_component: row.source_component,
    payload: normalizePayload(row.payload),
  };
}

function sortByCreatedAt<T extends { created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

function sortEvents<T extends { at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function shouldKeepScopedEvent(
  row: ObservabilityEventRow,
  scope: string | null,
): boolean {
  if (!scope) return true;
  const rowScope = String(row.scope ?? "").trim();
  if (!rowScope) return true;
  return rowScope === scope;
}

function isMomentumEvent(row: ObservabilityEventRow): boolean {
  return MOMENTUM_EVENT_PREFIXES.some((prefix) => row.event_name.startsWith(prefix));
}

function createStateTimelineEntry(row: ObservabilityEventRow): MomentumStateTimelineEntry {
  const payload = normalizePayload(row.payload);
  return {
    id: row.id,
    at: row.created_at,
    event_name: row.event_name,
    source_component: row.source_component,
    state_before: String(payload.state_before ?? "").trim() || null,
    state_after: String(payload.state_after ?? "").trim() || null,
    state_reason: String(payload.state_reason ?? "").trim() || null,
    dimensions: (payload.dimensions && typeof payload.dimensions === "object")
      ? payload.dimensions as Record<string, unknown>
      : {},
    pending_transition:
      payload.pending_transition && typeof payload.pending_transition === "object"
        ? payload.pending_transition as Record<string, unknown>
        : null,
    payload,
  };
}

function createDecisionEntry(row: ObservabilityEventRow): MomentumProactiveDecisionEntry {
  const payload = normalizePayload(row.payload);
  return {
    id: row.id,
    at: row.created_at,
    event_name: row.event_name,
    source_component: row.source_component,
    target_kind: String(payload.target_kind ?? "").trim() || null,
    state_at_decision: String(payload.state_at_decision ?? "").trim() || null,
    decision: String(payload.decision ?? "").trim() || null,
    decision_reason: String(payload.decision_reason ?? "").trim() || null,
    payload,
  };
}

function buildOutreachRunKey(event: MomentumTraceEvent): string {
  const payload = event.payload;
  const checkinId = String(payload.scheduled_checkin_id ?? "").trim();
  if (checkinId) return `checkin:${checkinId}`;
  const eventContext = String(
    payload.event_context ?? payload.related_outreach_event_context ?? "",
  ).trim();
  const scheduledFor = String(
    payload.scheduled_for ?? payload.related_outreach_sent_at ?? "",
  ).trim();
  if (eventContext && scheduledFor) return `ctx:${eventContext}:${scheduledFor}`;
  if (eventContext) return `ctx:${eventContext}:${event.id}`;
  return `event:${event.id}`;
}

function ensureOutreachRun(
  runs: Map<string, MomentumTraceOutreach>,
  event: MomentumTraceEvent,
): MomentumTraceOutreach {
  const key = buildOutreachRunKey(event);
  const existing = runs.get(key);
  if (existing) return existing;
  const payload = event.payload;
  const run: MomentumTraceOutreach = {
    run_id: key,
    started_at: event.at,
    event_context: String(payload.event_context ?? payload.related_outreach_event_context ?? "").trim() || null,
    outreach_state: String(payload.outreach_state ?? payload.related_outreach_state ?? payload.state_at_decision ?? "").trim() || null,
    scheduled_checkin_id: String(payload.scheduled_checkin_id ?? "").trim() || null,
    decision: null,
    schedule: null,
    deliveries: [],
    reaction: null,
    events: [],
  };
  runs.set(key, run);
  return run;
}

function attachReactionToClosestRun(
  runs: Map<string, MomentumTraceOutreach>,
  event: MomentumTraceEvent,
): void {
  const payload = event.payload;
  const relatedContext = String(payload.related_outreach_event_context ?? "").trim();
  const relatedSentAt = String(payload.related_outreach_sent_at ?? "").trim();
  const relatedSentMs = relatedSentAt ? new Date(relatedSentAt).getTime() : NaN;
  const reactionAt = new Date(event.at).getTime();

  let bestRun: MomentumTraceOutreach | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const run of runs.values()) {
    if (relatedContext && run.event_context !== relatedContext) continue;
    const candidateAtRaw =
      run.deliveries.find((delivery) => delivery.event_name === "momentum_outreach_sent")?.at ??
      run.schedule?.at ??
      run.started_at;
    const candidateAt = new Date(candidateAtRaw).getTime();
    if (!Number.isFinite(candidateAt)) continue;
    if (Number.isFinite(relatedSentMs)) {
      const distance = Math.abs(candidateAt - relatedSentMs);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestRun = run;
      }
    } else if (candidateAt <= reactionAt) {
      const distance = reactionAt - candidateAt;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestRun = run;
      }
    }
  }

  if (!bestRun) {
    bestRun = ensureOutreachRun(runs, event);
  }
  bestRun.reaction = event;
  bestRun.events.push(event);
}

type BuildWindowArgs = {
  userId: string;
  from: string;
  to: string;
  scope?: string | null;
  messages: ChatMessageRow[];
  observabilityEvents: ObservabilityEventRow[];
};

export function buildMomentumTraceWindow(args: BuildWindowArgs): MomentumTraceWindow {
  const scope = String(args.scope ?? "").trim() || null;
  const messages = sortByCreatedAt(
    (args.messages ?? []).filter((row) => !scope || row.scope === scope),
  );
  const observabilityEvents = sortByCreatedAt(
    (args.observabilityEvents ?? [])
      .filter((row) => shouldKeepScopedEvent(row, scope))
      .filter(isMomentumEvent),
  );

  const turnMap = new Map<string, MomentumTraceTurn>();
  const requestToTurnKey = new Map<string, string>();
  const unassignedEvents: MomentumTraceEvent[] = [];

  const ensureTurn = (key: string, seed?: Partial<MomentumTraceTurn>): MomentumTraceTurn => {
    const existing = turnMap.get(key);
    if (existing) return existing;
    const turn: MomentumTraceTurn = {
      turn_id: seed?.turn_id ?? null,
      request_id: seed?.request_id ?? null,
      started_at: seed?.started_at ?? args.from,
      scope: seed?.scope ?? scope,
      channel: seed?.channel ?? null,
      user_message: seed?.user_message ?? null,
      assistant_messages: [],
      state_events: [],
      reaction_events: [],
      events: [],
    };
    turnMap.set(key, turn);
    if (turn.request_id) requestToTurnKey.set(turn.request_id, key);
    return turn;
  };

  for (const message of messages) {
    if (message.role !== "user") continue;
    const key = `turn:${message.id}`;
    ensureTurn(key, {
      turn_id: message.id,
      started_at: message.created_at,
      scope: message.scope ?? scope,
      user_message: message,
      request_id: parseRequestIdFromMetadata(message.metadata),
    });
  }

  const stateTimeline = observabilityEvents
    .filter((row) => STATE_EVENT_NAMES.has(row.event_name))
    .map(createStateTimelineEntry);

  const proactiveDecisions = observabilityEvents
    .filter((row) => DECISION_EVENT_NAMES.has(row.event_name))
    .map(createDecisionEntry);

  const outreachRuns = new Map<string, MomentumTraceOutreach>();

  for (const row of observabilityEvents) {
    const traceEvent = toTraceEvent(row);
    if (OUTREACH_EVENT_NAMES.has(row.event_name)) {
      const run = ensureOutreachRun(outreachRuns, traceEvent);
      run.events.push(traceEvent);
      if (row.event_name === "momentum_outreach_decision") run.decision = traceEvent;
      else if (
        row.event_name === "momentum_outreach_scheduled" ||
        row.event_name === "momentum_outreach_schedule_skipped"
      ) run.schedule = traceEvent;
      else run.deliveries.push(traceEvent);
    } else if (REACTION_EVENT_NAMES.has(row.event_name)) {
      attachReactionToClosestRun(outreachRuns, traceEvent);
    }

    const turnId = String(row.turn_id ?? "").trim();
    const requestId = String(row.request_id ?? "").trim();
    let turn: MomentumTraceTurn | null = null;

    if (turnId) {
      turn = ensureTurn(`turn:${turnId}`, {
        turn_id: turnId,
        request_id: requestId || null,
        started_at: row.created_at,
        scope: row.scope ?? scope,
        channel: row.channel ?? null,
      });
    } else if (requestId) {
      const existingKey = requestToTurnKey.get(requestId);
      if (existingKey) {
        turn = ensureTurn(existingKey);
      }
    }

    if (!turn) {
      unassignedEvents.push(traceEvent);
      continue;
    }

    if (!turn.request_id && requestId) {
      turn.request_id = requestId;
      requestToTurnKey.set(requestId, turnId ? `turn:${turnId}` : `request:${requestId}`);
    }
    if (!turn.channel && row.channel) turn.channel = row.channel;
    if (!turn.scope && row.scope) turn.scope = row.scope;
    turn.events.push(traceEvent);
    if (STATE_EVENT_NAMES.has(row.event_name)) turn.state_events.push(traceEvent);
    if (REACTION_EVENT_NAMES.has(row.event_name)) turn.reaction_events.push(traceEvent);
  }

  for (const message of messages) {
    if (message.role === "user") continue;
    const requestId = parseRequestIdFromMetadata(message.metadata);
    if (requestId && requestToTurnKey.has(requestId)) {
      ensureTurn(requestToTurnKey.get(requestId)!).assistant_messages.push(message);
      continue;
    }
    const nearestUserTurn = [...turnMap.values()]
      .filter((turn) => turn.user_message && turn.scope === (message.scope ?? scope))
      .sort((a, b) =>
        Math.abs(new Date(a.started_at).getTime() - new Date(message.created_at).getTime()) -
        Math.abs(new Date(b.started_at).getTime() - new Date(message.created_at).getTime())
      )[0];
    if (nearestUserTurn) nearestUserTurn.assistant_messages.push(message);
  }

  const turns = [...turnMap.values()]
    .map((turn) => ({
      ...turn,
      assistant_messages: sortByCreatedAt(turn.assistant_messages),
      state_events: sortEvents(turn.state_events),
      reaction_events: sortEvents(turn.reaction_events),
      events: sortEvents(turn.events),
    }))
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

  const outreachs = [...outreachRuns.values()]
    .map((run) => ({
      ...run,
      deliveries: sortEvents(run.deliveries),
      events: sortEvents(run.events),
    }))
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

  return {
    user_id: args.userId,
    window: {
      from: args.from,
      to: args.to,
      scope,
    },
    summary: {
      messages_total: messages.length,
      user_messages: messages.filter((row) => row.role === "user").length,
      assistant_messages: messages.filter((row) => row.role !== "user").length,
      turns_total: turns.length,
      state_events_total: stateTimeline.length,
      proactive_decisions_total: proactiveDecisions.length,
      outreachs_total: outreachs.length,
      observability_events_total: observabilityEvents.length,
    },
    messages,
    turns,
    state_timeline: stateTimeline,
    proactive_decisions: proactiveDecisions,
    outreachs,
    unassigned_events: sortEvents(unassignedEvents),
  };
}

export async function loadMomentumTraceWindow(params: {
  supabase: SupabaseClient;
  userId: string;
  from: string;
  to: string;
  scope?: string | null;
}): Promise<MomentumTraceWindow> {
  const from = asIso(params.from);
  const to = asIso(params.to);
  const scope = String(params.scope ?? "").trim() || null;

  const [messagesRes, eventsRes] = await Promise.all([
    params.supabase
      .from("chat_messages")
      .select("id,role,content,scope,created_at,agent_used,metadata")
      .eq("user_id", params.userId)
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: true })
      .limit(1500),
    params.supabase
      .from("memory_observability_events")
      .select(
        "id,created_at,request_id,turn_id,user_id,channel,scope,source_component,event_name,payload",
      )
      .eq("user_id", params.userId)
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: true })
      .limit(5000),
  ]);

  if (messagesRes.error) throw messagesRes.error;
  if (eventsRes.error) throw eventsRes.error;

  return buildMomentumTraceWindow({
    userId: params.userId,
    from,
    to,
    scope,
    messages: (messagesRes.data ?? []) as ChatMessageRow[],
    observabilityEvents: (eventsRes.data ?? []) as ObservabilityEventRow[],
  });
}
