/**
 * KEEL W4.3 — public surface of `log_protocol_event`.
 *
 * Mirrors `track_progress_plan_item_tool.ts`: the runtime consumes a narrow
 * discriminated outcome, not the full ledger. The ledger stays available on
 * `runLogProtocolEventDirectEffect` for audit and for the effect accounting of
 * the turn.
 *
 * Wiring into `run.ts` / the dispatcher is W4.4 (perimeter of another lot).
 */

import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type { DirectEffectGateInput } from "../../../routers/direct_effect_gate.ts";
import type {
  LogProtocolEventDirectEffectResult,
  ProtocolEventSource,
  ProtocolEventWrite,
} from "./contract.ts";
import { runLogProtocolEventDirectEffect } from "./router.ts";

export type { ProtocolEventSource, ProtocolEventWrite };

export type LogProtocolEventOutcome =
  | { detected: false }
  | {
    detected: true;
    status: "needs_clarify" | "blocked" | "failed";
    reason: string;
    message: string;
  }
  | {
    detected: true;
    status: "logged";
    message: string;
    /**
     * D2: every row this turn wrote, in payload order. The scalar fields below
     * describe the FIRST one and exist so the single-fact caller reads the same
     * as before; a caller that counts facts must read this array, never assume
     * one. `protocol_event_ids.length` is the only honest cardinality.
     */
    protocol_event_ids: string[];
    protocol_event_id: string;
    local_date: string;
    slot_key: string | null;
    already_logged: boolean;
  };

function toOutcome(
  result: LogProtocolEventDirectEffectResult,
): LogProtocolEventOutcome {
  if (!result.detected) return { detected: false };

  if (result.status === "logged") {
    const ids = result.committed_effects
      .map((effect) => effect.protocol_event_id)
      .filter((id) => Boolean(id));
    const committed = result.committed_effects[0];
    // Defence in depth: the renderer's invariant already downgrades a phantom
    // commit. If it ever failed to, the runtime still refuses to report a
    // success without a row id.
    if (!committed?.protocol_event_id || ids.length === 0) {
      return {
        detected: true,
        status: "failed",
        reason: "phantom_commit_blocked",
        message: "Nothing was recorded.",
      };
    }
    return {
      detected: true,
      status: "logged",
      message: result.reply ?? "",
      protocol_event_ids: ids,
      protocol_event_id: committed.protocol_event_id,
      local_date: committed.local_date,
      slot_key: committed.slot_key,
      already_logged: committed.already_logged,
    };
  }

  // `ignored` cannot reach here (it implies detected=false) but the union does
  // not know that; map it to `blocked` rather than widen the outcome type.
  const status: "needs_clarify" | "blocked" | "failed" =
    result.status === "needs_clarify"
      ? "needs_clarify"
      : result.status === "failed"
      ? "failed"
      : "blocked";
  return {
    detected: true,
    status,
    reason: result.debug.reason_code,
    message: result.reply ?? result.debug.reason_code,
  };
}

export async function runLogProtocolEvent(params: {
  turn_frame: TurnFrame;
  content_locale: string | null | undefined;
  default_source?: ProtocolEventSource;
  /** Allow-list for an explicit binding. See `router.ts`. */
  allowed_commitment_ids?: readonly string[] | null;
  recent_writes_idempotency?:
    DirectEffectGateInput["recent_writes_idempotency"];
  db_idempotency_check?: DirectEffectGateInput["db_idempotency_check"];
  write_protocol_event: ProtocolEventWrite;
}): Promise<LogProtocolEventOutcome> {
  const result = await runLogProtocolEventDirectEffect({
    turn_frame: params.turn_frame,
    content_locale: params.content_locale,
    default_source: params.default_source,
    allowed_commitment_ids: params.allowed_commitment_ids,
    recent_writes_idempotency: params.recent_writes_idempotency,
    db_idempotency_check: params.db_idempotency_check,
    write_protocol_event: params.write_protocol_event,
  });
  return toOutcome(result);
}
