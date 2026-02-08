type TurnSummaryDbConfig = {
  awaitEnabled: boolean;
  timeoutMs: number;
  retries: number;
};

type TurnMetricsLike = {
  request_id: string | null;
  user_id: string;
  channel: "web" | "whatsapp";
  scope: string;
  latency_ms: {
    total?: number;
    dispatcher?: number;
    context?: number;
    agent?: number;
  };
  dispatcher: {
    model?: string;
    signals?: {
      safety: string;
      intent: string;
      intent_conf: number;
      interrupt: string;
      topic_depth: string;
      flow_resolution?: string;
    };
  };
  context: {
    profile?: string;
    elements?: string[];
    tokens?: number;
  };
  routing: {
    target_dispatcher?: string;
    target_initial?: string;
    target_final?: string;
    risk_score?: number;
  };
  agent: {
    model?: string;
    outcome?: "text" | "tool_call";
    tool?: string;
  };
  state_flags: {
    checkup_active?: boolean;
    toolflow_active?: boolean;
    supervisor_stack_top?: string;
  };
  details?: Record<string, unknown>;
  research?: Record<string, unknown>;
  aborted?: boolean;
  abort_reason?: string;
  ts_start?: number;
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  const timeoutMs = Math.max(1, Math.floor(ms));
  let t: number | undefined = undefined;
  const timeoutP = new Promise<T>((_, reject) => {
    t = setTimeout(
      () => reject(new Error(`turn_summary_db_timeout_${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([p, timeoutP]).finally(() => {
    if (t !== undefined) clearTimeout(t);
  });
}

export async function persistTurnSummaryLog(opts: {
  metrics: TurnMetricsLike;
  supabase: any;
  config: TurnSummaryDbConfig;
}): Promise<void> {
  const { metrics, supabase, config } = opts;
  if (!metrics?.request_id) return;

  const payload = {
    tag: "turn_summary",
    request_id: metrics.request_id,
    user_id: metrics.user_id,
    channel: metrics.channel,
    scope: metrics.scope,
    ts: new Date().toISOString(),
    latency_ms: metrics.latency_ms,
    dispatcher: metrics.dispatcher,
    context: metrics.context,
    routing: metrics.routing,
    agent: metrics.agent,
    ...(metrics.research ? { research: metrics.research } : {}),
    state_flags: metrics.state_flags,
    ...(metrics.details ? { details: metrics.details } : {}),
    ...(metrics.aborted ? { aborted: true, abort_reason: metrics.abort_reason } : {}),
  } as Record<string, unknown>;

  const writeOnce = async () => {
    const res = await supabase.rpc("log_turn_summary_log", {
      p_request_id: metrics.request_id,
      p_user_id: metrics.user_id,
      p_channel: metrics.channel,
      p_scope: metrics.scope,
      p_payload: payload,
      p_latency_total_ms: metrics.latency_ms.total ?? null,
      p_latency_dispatcher_ms: metrics.latency_ms.dispatcher ?? null,
      p_latency_context_ms: metrics.latency_ms.context ?? null,
      p_latency_agent_ms: metrics.latency_ms.agent ?? null,
      p_dispatcher_model: metrics.dispatcher.model ?? null,
      p_dispatcher_safety: metrics.dispatcher.signals?.safety ?? null,
      p_dispatcher_intent: metrics.dispatcher.signals?.intent ?? null,
      p_dispatcher_intent_conf: metrics.dispatcher.signals?.intent_conf ?? null,
      p_dispatcher_interrupt: metrics.dispatcher.signals?.interrupt ?? null,
      p_dispatcher_topic_depth: metrics.dispatcher.signals?.topic_depth ?? null,
      p_dispatcher_flow_resolution: metrics.dispatcher.signals?.flow_resolution ?? null,
      p_context_profile: metrics.context.profile ?? null,
      p_context_elements: metrics.context.elements ?? null,
      p_context_tokens: metrics.context.tokens ?? null,
      p_target_dispatcher: metrics.routing.target_dispatcher ?? null,
      p_target_initial: metrics.routing.target_initial ?? null,
      p_target_final: metrics.routing.target_final ?? null,
      p_risk_score: metrics.routing.risk_score ?? null,
      p_agent_model: metrics.agent.model ?? null,
      p_agent_outcome: metrics.agent.outcome ?? null,
      p_agent_tool: metrics.agent.tool ?? null,
      p_checkup_active: metrics.state_flags.checkup_active ?? null,
      p_toolflow_active: metrics.state_flags.toolflow_active ?? null,
      p_supervisor_stack_top: metrics.state_flags.supervisor_stack_top ?? null,
      p_aborted: Boolean(metrics.aborted),
      p_abort_reason: metrics.abort_reason ?? null,
    });
    if (res?.error) throw res.error;
  };

  const doWrite = async () => {
    let lastErr: any = null;
    for (let attempt = 0; attempt <= Math.max(0, config.retries); attempt++) {
      try {
        if (config.awaitEnabled) {
          await withTimeout(writeOnce(), config.timeoutMs);
        } else {
          writeOnce().then(() => {}).catch(() => {});
        }
        return;
      } catch (e) {
        lastErr = e;
        if (config.awaitEnabled && attempt < config.retries) {
          await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
        }
      }
    }
    if (config.awaitEnabled && lastErr) throw lastErr;
  };

  if (config.awaitEnabled) {
    await doWrite();
  } else {
    doWrite().then(() => {}).catch(() => {});
  }
}


