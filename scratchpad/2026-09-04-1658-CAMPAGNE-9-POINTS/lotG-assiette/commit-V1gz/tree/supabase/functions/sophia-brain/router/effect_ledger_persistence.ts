/// <reference path="../../tsserver-shims.d.ts" />

import type { EffectLedger } from "./effect_ledger.ts";
import { serializeEffectLedgerForPersistence } from "./effect_ledger.ts";

export type EffectLedgerPersistenceDestination =
  | "conversation_turn"
  | "brain_trace"
  | "turn_summary"
  | "none";

export type PersistEffectLedgerResult = {
  persisted: boolean;
  destination: EffectLedgerPersistenceDestination;
  entries_count: number;
  error?: string;
};

// The current-state truth remains the business DB. This writer only records
// what Sophia observed/requested/blocked/failed/committed during a turn.
export async function persistEffectLedgerForTurn(args: {
  supabase: any;
  ledger: EffectLedger;
  userId: string;
  sourceMessageId?: string | null;
  requestId?: string | null;
  channel: "web" | "whatsapp" | string;
  scope: string;
  nowIso?: string | null;
}): Promise<PersistEffectLedgerResult> {
  const entries = serializeEffectLedgerForPersistence({
    ledger: args.ledger,
    userId: args.userId,
    sourceMessageId: args.sourceMessageId ?? null,
    requestId: args.requestId ?? null,
    nowIso: args.nowIso ?? null,
  });
  if (entries.length === 0) {
    return { persisted: false, destination: "none", entries_count: 0 };
  }
  if (!args.supabase?.rpc) {
    return {
      persisted: false,
      destination: "none",
      entries_count: entries.length,
      error: "missing_supabase_rpc",
    };
  }

  const requestId = String(args.requestId ?? "").trim() ||
    `effect-ledger:${args.ledger.turn_id}`;
  const nowIso = String(args.nowIso ?? "").trim() || new Date().toISOString();
  const payload = {
    tag: "effect_ledger",
    request_id: requestId,
    user_id: args.userId,
    channel: args.channel,
    scope: args.scope,
    ts: nowIso,
    turn_id: args.ledger.turn_id,
    source_message_id: args.sourceMessageId ?? null,
    entries_count: entries.length,
    entries,
  };

  try {
    const res = await args.supabase.rpc("log_turn_summary_log", {
      p_request_id: requestId,
      p_user_id: args.userId,
      p_channel: args.channel,
      p_scope: args.scope,
      p_payload: payload,
      p_latency_total_ms: null,
      p_latency_dispatcher_ms: null,
      p_latency_context_ms: null,
      p_latency_agent_ms: null,
      p_dispatcher_model: null,
      p_dispatcher_safety: null,
      p_dispatcher_intent: null,
      p_dispatcher_intent_conf: null,
      p_dispatcher_interrupt: null,
      p_dispatcher_topic_depth: null,
      p_dispatcher_flow_resolution: null,
      p_context_profile: null,
      p_context_elements: null,
      p_context_tokens: null,
      p_target_dispatcher: null,
      p_target_initial: null,
      p_target_final: null,
      p_risk_score: null,
      p_agent_model: null,
      p_agent_outcome: "tool_call",
      p_agent_tool: entries.find((entry) => entry.tool_id)?.tool_id ?? null,
      p_checkup_active: null,
      p_toolflow_active: null,
      p_supervisor_stack_top: null,
      p_aborted: false,
      p_abort_reason: null,
    });
    if (res?.error) throw res.error;
    return {
      persisted: true,
      destination: "turn_summary",
      entries_count: entries.length,
    };
  } catch (error) {
    return {
      persisted: false,
      destination: "turn_summary",
      entries_count: entries.length,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
