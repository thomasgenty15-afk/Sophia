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

export type CoachingTraceEvent = {
  id: number;
  at: string;
  event_name: string;
  source_component: string;
  request_id: string | null;
  turn_id: string | null;
  payload: Record<string, unknown>;
};

export type CoachingSelectorRunEntry = {
  id: number;
  at: string;
  request_id: string | null;
  turn_id: string | null;
  source_component: string;
  trigger_type: string | null;
  momentum_state: string | null;
  blocker_type: string | null;
  confidence: string | null;
  eligible: boolean | null;
  skip_reason: string | null;
  recommended_technique: string | null;
  candidate_techniques: string[];
  follow_up_needed: boolean | null;
  customization_context: Record<string, unknown> | null;
  payload: Record<string, unknown>;
};

export type CoachingInterventionEntry = {
  intervention_id: string;
  proposed_at: string;
  request_id: string | null;
  turn_id: string | null;
  source_component: string;
  trigger_type: string | null;
  momentum_state: string | null;
  blocker_type: string | null;
  confidence: string | null;
  recommended_technique: string | null;
  candidate_techniques: string[];
  follow_up_needed: boolean | null;
  follow_up_due_at: string | null;
  customization_context: Record<string, unknown> | null;
  proposal: CoachingTraceEvent;
  render: CoachingTraceEvent | null;
  follow_up: CoachingTraceEvent | null;
  events: CoachingTraceEvent[];
};

export type CoachingFollowUpEntry = {
  id: number;
  at: string;
  request_id: string | null;
  turn_id: string | null;
  source_component: string;
  intervention_id: string | null;
  blocker_type: string | null;
  recommended_technique: string | null;
  follow_up_outcome: string | null;
  helpful: boolean | null;
  payload: Record<string, unknown>;
};

export type CoachingWeeklySurfaceEntry = {
  id: number;
  at: string;
  request_id: string | null;
  source_component: string;
  weekly_recommendation: string | null;
  summary: string | null;
  payload: Record<string, unknown>;
};

export type CoachingTraceTurn = {
  turn_id: string | null;
  request_id: string | null;
  started_at: string;
  scope: string | null;
  channel: "web" | "whatsapp" | null;
  user_message: ChatMessageRow | null;
  assistant_messages: ChatMessageRow[];
  selector_runs: CoachingTraceEvent[];
  intervention_events: CoachingTraceEvent[];
  follow_up_events: CoachingTraceEvent[];
  events: CoachingTraceEvent[];
};

export type CoachingTraceWindow = {
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
    selector_runs_total: number;
    interventions_total: number;
    follow_ups_total: number;
    weekly_surfaces_total: number;
    observability_events_total: number;
  };
  messages: ChatMessageRow[];
  turns: CoachingTraceTurn[];
  selector_runs: CoachingSelectorRunEntry[];
  interventions: CoachingInterventionEntry[];
  follow_ups: CoachingFollowUpEntry[];
  weekly_surfaces: CoachingWeeklySurfaceEntry[];
  unassigned_events: CoachingTraceEvent[];
};

const COACHING_EVENT_NAMES = new Set([
  "coaching_trigger_detected",
  "coaching_gate_evaluated",
  "coaching_selector_run",
  "coaching_intervention_proposed",
  "coaching_intervention_rendered",
  "coaching_followup_classified",
  "coaching_technique_deprioritized",
  "coaching_weekly_summary_generated",
]);

const TURN_SELECTOR_EVENT_NAMES = new Set([
  "coaching_trigger_detected",
  "coaching_gate_evaluated",
  "coaching_selector_run",
  "coaching_technique_deprioritized",
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

function sortByCreatedAt<T extends { created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

function sortEvents<T extends { at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function shouldKeepScopedEvent(row: ObservabilityEventRow, scope: string | null): boolean {
  if (!scope) return true;
  const rowScope = String(row.scope ?? "").trim();
  if (!rowScope) return true;
  return rowScope === scope;
}

function toTraceEvent(row: ObservabilityEventRow): CoachingTraceEvent {
  return {
    id: row.id,
    at: row.created_at,
    event_name: row.event_name,
    source_component: row.source_component,
    request_id: String(row.request_id ?? "").trim() || null,
    turn_id: String(row.turn_id ?? "").trim() || null,
    payload: normalizePayload(row.payload),
  };
}

function str(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function createSelectorRunEntry(row: ObservabilityEventRow): CoachingSelectorRunEntry {
  const payload = normalizePayload(row.payload);
  return {
    id: row.id,
    at: row.created_at,
    request_id: str(row.request_id),
    turn_id: str(row.turn_id),
    source_component: row.source_component,
    trigger_type: str(payload.trigger_type),
    momentum_state: str(payload.momentum_state),
    blocker_type: str(payload.blocker_type),
    confidence: str(payload.confidence),
    eligible: boolOrNull(payload.eligible),
    skip_reason: str(payload.skip_reason),
    recommended_technique: str(payload.recommended_technique),
    candidate_techniques: stringArray(payload.candidate_techniques),
    follow_up_needed: boolOrNull(payload.follow_up_needed),
    customization_context: payload.customization_context &&
        typeof payload.customization_context === "object"
      ? payload.customization_context as Record<string, unknown>
      : null,
    payload,
  };
}

function createFollowUpEntry(row: ObservabilityEventRow): CoachingFollowUpEntry {
  const payload = normalizePayload(row.payload);
  return {
    id: row.id,
    at: row.created_at,
    request_id: str(row.request_id),
    turn_id: str(row.turn_id),
    source_component: row.source_component,
    intervention_id: str(payload.intervention_id),
    blocker_type: str(payload.blocker_type),
    recommended_technique: str(payload.recommended_technique),
    follow_up_outcome: str(payload.follow_up_outcome),
    helpful: boolOrNull(payload.helpful),
    payload,
  };
}

function createWeeklySurfaceEntry(row: ObservabilityEventRow): CoachingWeeklySurfaceEntry {
  const payload = normalizePayload(row.payload);
  return {
    id: row.id,
    at: row.created_at,
    request_id: str(row.request_id),
    source_component: row.source_component,
    weekly_recommendation: str(payload.weekly_recommendation),
    summary: str(payload.summary),
    payload,
  };
}

type BuildWindowArgs = {
  userId: string;
  from: string;
  to: string;
  scope?: string | null;
  messages: ChatMessageRow[];
  observabilityEvents: ObservabilityEventRow[];
};

export function buildCoachingInterventionTraceWindow(
  args: BuildWindowArgs,
): CoachingTraceWindow {
  const scope = String(args.scope ?? "").trim() || null;
  const messages = sortByCreatedAt(
    (args.messages ?? []).filter((row) => !scope || row.scope === scope),
  );
  const observabilityEvents = sortByCreatedAt(
    (args.observabilityEvents ?? [])
      .filter((row) => shouldKeepScopedEvent(row, scope))
      .filter((row) => COACHING_EVENT_NAMES.has(row.event_name)),
  );

  const turnMap = new Map<string, CoachingTraceTurn>();
  const requestToTurnKey = new Map<string, string>();
  const unassignedEvents: CoachingTraceEvent[] = [];

  const ensureTurn = (key: string, seed?: Partial<CoachingTraceTurn>): CoachingTraceTurn => {
    const existing = turnMap.get(key);
    if (existing) return existing;
    const turn: CoachingTraceTurn = {
      turn_id: seed?.turn_id ?? null,
      request_id: seed?.request_id ?? null,
      started_at: seed?.started_at ?? args.from,
      scope: seed?.scope ?? scope,
      channel: seed?.channel ?? null,
      user_message: seed?.user_message ?? null,
      assistant_messages: [],
      selector_runs: [],
      intervention_events: [],
      follow_up_events: [],
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
      channel: null,
      user_message: message,
      request_id: parseRequestIdFromMetadata(message.metadata),
    });
  }

  const selectorRuns = observabilityEvents
    .filter((row) => row.event_name === "coaching_selector_run")
    .map(createSelectorRunEntry);
  const followUps = observabilityEvents
    .filter((row) => row.event_name === "coaching_followup_classified")
    .map(createFollowUpEntry);
  const weeklySurfaces = observabilityEvents
    .filter((row) => row.event_name === "coaching_weekly_summary_generated")
    .map(createWeeklySurfaceEntry);

  const renderEvents = observabilityEvents
    .filter((row) => row.event_name === "coaching_intervention_rendered")
    .map(toTraceEvent);
  const followUpByInterventionId = new Map<string, CoachingTraceEvent>();
  for (const row of observabilityEvents.filter((item) =>
    item.event_name === "coaching_followup_classified"
  )) {
    const event = toTraceEvent(row);
    const interventionId = str(event.payload.intervention_id);
    if (interventionId) followUpByInterventionId.set(interventionId, event);
  }

  for (const row of observabilityEvents) {
    const traceEvent = toTraceEvent(row);
    const turnId = traceEvent.turn_id;
    const requestId = traceEvent.request_id;
    let turn: CoachingTraceTurn | null = null;

    if (turnId) {
      turn = ensureTurn(`turn:${turnId}`, {
        turn_id: turnId,
        request_id: requestId,
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
    if (TURN_SELECTOR_EVENT_NAMES.has(row.event_name)) turn.selector_runs.push(traceEvent);
    if (
      row.event_name === "coaching_intervention_rendered" ||
      row.event_name === "coaching_intervention_proposed"
    ) {
      turn.intervention_events.push(traceEvent);
    }
    if (row.event_name === "coaching_followup_classified") turn.follow_up_events.push(traceEvent);
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

  const interventions = observabilityEvents
    .filter((row) => row.event_name === "coaching_intervention_proposed")
    .map((row) => {
      const proposal = toTraceEvent(row);
      const payload = proposal.payload;
      const interventionId = str(payload.intervention_id) ?? `proposal:${proposal.id}`;
      const render = renderEvents.find((item) =>
        (item.turn_id && item.turn_id === proposal.turn_id) ||
        (item.request_id && item.request_id === proposal.request_id)
      ) ?? null;
      const followUp = followUpByInterventionId.get(interventionId) ?? null;

      return {
        intervention_id: interventionId,
        proposed_at: proposal.at,
        request_id: proposal.request_id,
        turn_id: proposal.turn_id,
        source_component: proposal.source_component,
        trigger_type: str(payload.trigger_type),
        momentum_state: str(payload.momentum_state),
        blocker_type: str(payload.blocker_type),
        confidence: str(payload.confidence),
        recommended_technique: str(payload.recommended_technique),
        candidate_techniques: stringArray(payload.candidate_techniques),
        follow_up_needed: boolOrNull(payload.follow_up_needed),
        follow_up_due_at: str(payload.follow_up_due_at),
        customization_context: payload.customization_context &&
            typeof payload.customization_context === "object"
          ? payload.customization_context as Record<string, unknown>
          : null,
        proposal,
        render,
        follow_up: followUp,
        events: sortEvents([proposal, ...(render ? [render] : []), ...(followUp ? [followUp] : [])]),
      };
    })
    .sort((a, b) => new Date(a.proposed_at).getTime() - new Date(b.proposed_at).getTime());

  const turns = [...turnMap.values()]
    .map((turn) => ({
      ...turn,
      assistant_messages: sortByCreatedAt(turn.assistant_messages),
      selector_runs: sortEvents(turn.selector_runs),
      intervention_events: sortEvents(turn.intervention_events),
      follow_up_events: sortEvents(turn.follow_up_events),
      events: sortEvents(turn.events),
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
      selector_runs_total: selectorRuns.length,
      interventions_total: interventions.length,
      follow_ups_total: followUps.length,
      weekly_surfaces_total: weeklySurfaces.length,
      observability_events_total: observabilityEvents.length,
    },
    messages,
    turns,
    selector_runs: selectorRuns,
    interventions,
    follow_ups: followUps,
    weekly_surfaces: weeklySurfaces,
    unassigned_events: sortEvents(unassignedEvents),
  };
}

export async function loadCoachingInterventionTraceWindow(params: {
  supabase: SupabaseClient;
  userId: string;
  from: string;
  to: string;
  scope?: string | null;
}): Promise<CoachingTraceWindow> {
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

  return buildCoachingInterventionTraceWindow({
    userId: params.userId,
    from,
    to,
    scope,
    messages: (messagesRes.data ?? []) as ChatMessageRow[],
    observabilityEvents: (eventsRes.data ?? []) as ObservabilityEventRow[],
  });
}
