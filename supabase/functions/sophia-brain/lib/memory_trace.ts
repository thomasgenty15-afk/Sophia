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

type MemoryObservabilityEventRow = {
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

type TurnSummaryRow = {
  created_at: string;
  request_id?: string | null;
  channel?: string | null;
  scope?: string | null;
  latency_total_ms?: number | null;
  latency_dispatcher_ms?: number | null;
  latency_context_ms?: number | null;
  latency_agent_ms?: number | null;
  context_profile?: string | null;
  context_elements?: string[] | null;
  context_tokens?: number | null;
  target_dispatcher?: string | null;
  target_initial?: string | null;
  target_final?: string | null;
  risk_score?: number | null;
  agent_model?: string | null;
  agent_outcome?: string | null;
  agent_tool?: string | null;
};

type TraceTurnEvent = {
  id: number;
  at: string;
  event_name: string;
  source_component: string;
  payload: Record<string, unknown>;
};

export type MemoryTraceTurn = {
  turn_id: string | null;
  request_id: string | null;
  started_at: string;
  scope: string | null;
  channel: "web" | "whatsapp" | null;
  user_message: ChatMessageRow | null;
  assistant_messages: ChatMessageRow[];
  dispatcher: {
    memory_plan?: Record<string, unknown> | null;
    surface_plan?: Record<string, unknown> | null;
  };
  surface: {
    state_transition?: Record<string, unknown> | null;
    addon?: Record<string, unknown> | null;
  };
  retrieval: {
    events?: Record<string, unknown> | null;
    globals?: Record<string, unknown> | null;
    topics?: Record<string, unknown> | null;
  };
  injection?: Record<string, unknown> | null;
  model_selection?: Record<string, unknown> | null;
  turn_summary?: Record<string, unknown> | null;
  events: TraceTurnEvent[];
};

export type MemoryTraceMemorizerRun = {
  run_id: string;
  started_at: string;
  request_id: string | null;
  source_component: string;
  source_type: string | null;
  stages: {
    extraction?: Record<string, unknown> | null;
    validation?: Record<string, unknown> | null;
    persistence?: Record<string, unknown> | null;
  };
  events: TraceTurnEvent[];
};

export type MemoryTraceWindow = {
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
    memorizer_runs_total: number;
    observability_events_total: number;
  };
  messages: ChatMessageRow[];
  turns: MemoryTraceTurn[];
  memorizer_runs: MemoryTraceMemorizerRun[];
  unassigned_events: TraceTurnEvent[];
};

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
  const nested = String((metadata as any)?.router_decision_v2?.request_id ?? "")
    .trim();
  return nested || null;
}

function normalizePayload(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return payload && typeof payload === "object" ? payload : {};
}

function toTraceEvent(row: MemoryObservabilityEventRow): TraceTurnEvent {
  return {
    id: row.id,
    at: row.created_at,
    event_name: row.event_name,
    source_component: row.source_component,
    payload: normalizePayload(row.payload),
  };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function sortByCreatedAt<T extends { created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

function sortTurns(turns: MemoryTraceTurn[]): MemoryTraceTurn[] {
  return [...turns].sort((a, b) =>
    new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  );
}

function shouldKeepScopedEvent(
  row: MemoryObservabilityEventRow,
  scope: string | null,
): boolean {
  if (!scope) return true;
  const rowScope = String(row.scope ?? "").trim();
  if (!rowScope) return true;
  return rowScope === scope;
}

type BuildWindowArgs = {
  userId: string;
  from: string;
  to: string;
  scope?: string | null;
  messages: ChatMessageRow[];
  observabilityEvents: MemoryObservabilityEventRow[];
  turnSummaries: TurnSummaryRow[];
};

export function buildMemoryTraceWindow(args: BuildWindowArgs): MemoryTraceWindow {
  const scope = String(args.scope ?? "").trim() || null;
  const messages = sortByCreatedAt(
    (args.messages ?? []).filter((row) => !scope || row.scope === scope),
  );
  const observabilityEvents = sortByCreatedAt(
    (args.observabilityEvents ?? []).filter((row) => shouldKeepScopedEvent(row, scope)),
  );
  const turnSummaries = sortByCreatedAt(
    (args.turnSummaries ?? []).filter((row) => !scope || !row.scope || row.scope === scope),
  );

  const turnMap = new Map<string, MemoryTraceTurn>();
  const requestToTurnKey = new Map<string, string>();
  const unassignedEvents: TraceTurnEvent[] = [];

  const ensureTurn = (key: string, seed?: Partial<MemoryTraceTurn>): MemoryTraceTurn => {
    const existing = turnMap.get(key);
    if (existing) return existing;
    const turn: MemoryTraceTurn = {
      turn_id: seed?.turn_id ?? null,
      request_id: seed?.request_id ?? null,
      started_at: seed?.started_at ?? args.from,
      scope: seed?.scope ?? scope,
      channel: seed?.channel ?? null,
      user_message: seed?.user_message ?? null,
      assistant_messages: [],
      dispatcher: {},
      surface: {},
      retrieval: {},
      injection: null,
      model_selection: null,
      turn_summary: null,
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

  for (const row of observabilityEvents) {
    const traceEvent = toTraceEvent(row);
    const turnId = String(row.turn_id ?? "").trim();
    const requestId = String(row.request_id ?? "").trim();
    let turn: MemoryTraceTurn | null = null;

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
      } else {
        turn = ensureTurn(`request:${requestId}`, {
          turn_id: null,
          request_id: requestId,
          started_at: row.created_at,
          scope: row.scope ?? scope,
          channel: row.channel ?? null,
        });
      }
    }

    if (!turn) {
      if (
        row.event_name.startsWith("memorizer.") ||
        row.event_name.startsWith("architect_memory.") ||
        row.event_name.startsWith("global_memory.")
      ) {
        unassignedEvents.push(traceEvent);
      }
      continue;
    }

    if (!turn.request_id && requestId) {
      turn.request_id = requestId;
      requestToTurnKey.set(requestId, turnId ? `turn:${turnId}` : `request:${requestId}`);
    }
    if (!turn.channel && row.channel) turn.channel = row.channel;
    if (!turn.scope && row.scope) turn.scope = row.scope;
    turn.events.push(traceEvent);

    const payload = traceEvent.payload;
    switch (row.event_name) {
      case "dispatcher.memory_plan_generated":
        turn.dispatcher.memory_plan = payload.memory_plan as Record<string, unknown> ?? null;
        break;
      case "dispatcher.surface_plan_generated":
        turn.dispatcher.surface_plan = payload.surface_plan as Record<string, unknown> ?? null;
        break;
      case "surface.state_transition":
        turn.surface.state_transition = payload;
        turn.surface.addon = (payload.addon as Record<string, unknown>) ?? null;
        break;
      case "retrieval.event_completed":
        turn.retrieval.events = payload;
        break;
      case "retrieval.global_completed":
        turn.retrieval.globals = payload;
        break;
      case "retrieval.topic_completed":
        turn.retrieval.topics = payload;
        break;
      case "context.memory_injected":
        turn.injection = payload;
        break;
      case "router.model_selected":
        turn.model_selection = payload;
        break;
      default:
        break;
    }
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
    if (nearestUserTurn) {
      nearestUserTurn.assistant_messages.push(message);
    }
  }

  for (const row of turnSummaries) {
    const requestId = String(row.request_id ?? "").trim();
    if (!requestId) continue;
    const turnKey = requestToTurnKey.get(requestId);
    if (!turnKey) continue;
    const turn = ensureTurn(turnKey);
    turn.turn_summary = {
      created_at: row.created_at,
      channel: row.channel ?? null,
      scope: row.scope ?? null,
      latency_total_ms: row.latency_total_ms ?? null,
      latency_dispatcher_ms: row.latency_dispatcher_ms ?? null,
      latency_context_ms: row.latency_context_ms ?? null,
      latency_agent_ms: row.latency_agent_ms ?? null,
      context_profile: row.context_profile ?? null,
      context_elements: row.context_elements ?? null,
      context_tokens: row.context_tokens ?? null,
      target_dispatcher: row.target_dispatcher ?? null,
      target_initial: row.target_initial ?? null,
      target_final: row.target_final ?? null,
      risk_score: row.risk_score ?? null,
      agent_model: row.agent_model ?? null,
      agent_outcome: row.agent_outcome ?? null,
      agent_tool: row.agent_tool ?? null,
    };
  }

  const memorizerSourceEvents = observabilityEvents.filter((row) =>
    row.event_name.startsWith("memorizer.") ||
    row.event_name.startsWith("architect_memory.") ||
    row.event_name.startsWith("global_memory.")
  );
  const memorizerRuns: MemoryTraceMemorizerRun[] = [];
  let currentRun: MemoryTraceMemorizerRun | null = null;

  for (const row of memorizerSourceEvents) {
    const traceEvent = toTraceEvent(row);
    const payload = traceEvent.payload;
    const sourceType = String((payload.source_type ?? payload.kind ?? "")).trim() || null;
    const requestId = String(row.request_id ?? "").trim() || null;
    const isMemorizerExtraction = row.event_name === "memorizer.extraction_completed";
    const canAttachToCurrent = Boolean(
      currentRun &&
        row.event_name.startsWith("memorizer.") &&
        currentRun.source_component === row.source_component &&
        (
          !requestId ||
          !currentRun.request_id ||
          currentRun.request_id === requestId
        ),
    );

    if (isMemorizerExtraction || !canAttachToCurrent) {
      currentRun = {
        run_id: `run:${row.id}`,
        started_at: row.created_at,
        request_id: requestId,
        source_component: row.source_component,
        source_type: sourceType,
        stages: {},
        events: [],
      };
      memorizerRuns.push(currentRun);
    }

    const run = currentRun;
    if (!run) continue;
    run.events.push(traceEvent);
    if (!run.request_id && requestId) run.request_id = requestId;
    if (!run.source_type && sourceType) run.source_type = sourceType;
    if (row.event_name === "memorizer.extraction_completed") {
      run.stages.extraction = payload;
    } else if (row.event_name === "memorizer.validation_completed") {
      run.stages.validation = payload;
    } else if (row.event_name === "memorizer.persistence_completed") {
      run.stages.persistence = payload;
    } else if (row.event_name === "architect_memory.ingestion_completed") {
      run.stages.persistence = payload;
    } else if (row.event_name === "global_memory.maintenance_completed") {
      run.stages.persistence = payload;
    }
  }

  const turns = sortTurns(
    [...turnMap.values()].map((turn) => ({
      ...turn,
      assistant_messages: sortByCreatedAt(turn.assistant_messages),
      events: [...turn.events].sort((a, b) =>
        new Date(a.at).getTime() - new Date(b.at).getTime()
      ),
    })),
  );

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
      memorizer_runs_total: memorizerRuns.length,
      observability_events_total: observabilityEvents.length,
    },
    messages,
    turns,
    memorizer_runs: memorizerRuns,
    unassigned_events: uniqueStrings(unassignedEvents.map((evt) => String(evt.id))).length > 0
      ? unassignedEvents.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      : [],
  };
}

export async function loadMemoryTraceWindow(params: {
  supabase: SupabaseClient;
  userId: string;
  from: string;
  to: string;
  scope?: string | null;
}): Promise<MemoryTraceWindow> {
  const from = asIso(params.from);
  const to = asIso(params.to);
  const scope = String(params.scope ?? "").trim() || null;

  const [messagesRes, eventsRes, turnSummaryRes] = await Promise.all([
    params.supabase
      .from("chat_messages")
      .select("id,role,content,scope,created_at,agent_used,metadata")
      .eq("user_id", params.userId)
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: true })
      .limit(1000),
    params.supabase
      .from("memory_observability_events")
      .select(
        "id,created_at,request_id,turn_id,user_id,channel,scope,source_component,event_name,payload",
      )
      .eq("user_id", params.userId)
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: true })
      .limit(4000),
    params.supabase
      .from("turn_summary_logs")
      .select(
        "created_at,request_id,channel,scope,latency_total_ms,latency_dispatcher_ms,latency_context_ms,latency_agent_ms,context_profile,context_elements,context_tokens,target_dispatcher,target_initial,target_final,risk_score,agent_model,agent_outcome,agent_tool",
      )
      .eq("user_id", params.userId)
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: true })
      .limit(1000),
  ]);

  if (messagesRes.error) throw messagesRes.error;
  if (eventsRes.error) throw eventsRes.error;
  if (turnSummaryRes.error) throw turnSummaryRes.error;

  return buildMemoryTraceWindow({
    userId: params.userId,
    from,
    to,
    scope,
    messages: (messagesRes.data ?? []) as ChatMessageRow[],
    observabilityEvents: (eventsRes.data ?? []) as MemoryObservabilityEventRow[],
    turnSummaries: (turnSummaryRes.data ?? []) as TurnSummaryRow[],
  });
}
