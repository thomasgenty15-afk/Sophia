/**
 * KEEL W4.3 — the chain for `declare_deviation`:
 *
 *   intake -> gate -> advance rule -> executor -> ledger -> renderer
 *
 * The advance rule sits AFTER the safety gate and BEFORE the executor, and it
 * is evaluated exactly once. Placing it after the gate matters: during a
 * safety-blocked turn nothing durable is written at all, so the student never
 * receives a lecture about declaring flex in advance while in crisis — they
 * receive the safety lane's reply.
 */

import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import { runDirectEffectGate } from "../../../routers/direct_effect_gate.ts";
import { evaluateAdvanceRule } from "./advance_rule.ts";
import type {
  CoachBackdateGrant,
  DayResolution,
  DeclareDeviationDirectEffectResult,
  DeclareDeviationRequestedEffect,
  DeviationDeclaredVia,
  PlannedDeviationWrite,
} from "./contract.ts";
import { executeDeclareDeviationWrite } from "./executor.ts";
import { runDeclareDeviationIntake } from "./intake.ts";
import {
  enforceDeclareDeviationReplyInvariant,
  renderDeclareDeviationRefusal,
  renderDeclareDeviationReply,
} from "./renderer.ts";

export type DeclareDeviationRouterInput = {
  turn_frame: TurnFrame;
  plan_version_id: string | null | undefined;
  content_locale: string | null | undefined;
  declared_via?: DeviationDeclaredVia;
  /**
   * Resolution state of the DECLARED day, read from persisted facts by the
   * caller. Passed as a reader so the router can ask about the day the intake
   * actually resolved (which may be neither today nor a payload guess).
   */
  read_day_resolution?: (
    localDate: string,
  ) => Promise<DayResolution | null> | DayResolution | null;
  /** Coach-authored. Never read from the turn payload — see contract.ts. */
  coach_backdate_grant?: CoachBackdateGrant | null;
  recent_writes_idempotency?: { source_message_ids: string[] };
  db_idempotency_check?: (key: string) => Promise<boolean>;
  write_planned_deviation: PlannedDeviationWrite;
};

function emptyResult(reasonCode: string): DeclareDeviationDirectEffectResult {
  return {
    detected: false,
    status: "ignored",
    reply: null,
    executed_tools: [],
    requested_effects: [],
    allowed_effects: [],
    committed_effects: [],
    blocked_effects: [],
    debug: { reason_code: reasonCode },
  };
}

function refusal(args: {
  status: "needs_clarify" | "blocked" | "failed";
  reason_code: string;
  requested: DeclareDeviationRequestedEffect[];
  allowed?: DeclareDeviationRequestedEffect[];
  gate_reason?: string | null;
  token_issue?: string | null;
  local_date?: string | null;
  retroactive?: boolean;
  day_resolved?: boolean;
}): DeclareDeviationDirectEffectResult {
  return {
    detected: true,
    status: args.status,
    reply: renderDeclareDeviationRefusal(args.reason_code, {
      local_date: args.local_date ?? null,
      token_issue: args.token_issue ?? null,
    }),
    executed_tools: [],
    requested_effects: args.requested,
    allowed_effects: args.allowed ?? [],
    committed_effects: [],
    blocked_effects: [{
      type: "declare_deviation",
      reason_code: args.reason_code,
    }],
    debug: {
      reason_code: args.reason_code,
      gate_reason: args.gate_reason ?? null,
      token_issue: args.token_issue ?? null,
      retroactive: args.retroactive,
      day_resolved: args.day_resolved,
    },
  };
}

export async function runDeclareDeviationDirectEffect(
  input: DeclareDeviationRouterInput,
): Promise<DeclareDeviationDirectEffectResult> {
  // --- intake -------------------------------------------------------------
  const intake = runDeclareDeviationIntake({
    turn_frame: input.turn_frame,
    plan_version_id: input.plan_version_id,
    content_locale: input.content_locale,
    declared_via: input.declared_via,
  });
  if (!intake.detected) return emptyResult(intake.reason_code);
  if (!intake.ok) {
    return refusal({
      status: intake.reason_code === "unknown_token" ||
          intake.reason_code === "missing_local_date"
        ? "needs_clarify"
        : "blocked",
      reason_code: intake.reason_code,
      requested: [],
      token_issue: intake.token_issue,
    });
  }
  const requested = intake.requested_effect;

  // --- gate ---------------------------------------------------------------
  const gate = await runDirectEffectGate({
    effect_type: "declare_deviation",
    turn_frame: input.turn_frame,
    recent_writes_idempotency: input.recent_writes_idempotency ??
      { source_message_ids: [] },
    db_idempotency_check: input.db_idempotency_check ??
      ((_key: string) => Promise.resolve(false)),
  });
  if (gate.decision !== "allow") {
    return refusal({
      status: gate.decision === "needs_clarify" ? "needs_clarify" : "blocked",
      reason_code: gate.reason_code,
      requested: [requested],
      gate_reason: gate.reason_code,
      local_date: requested.local_date,
    });
  }

  // --- advance rule -------------------------------------------------------
  const dayResolution = input.read_day_resolution
    ? await input.read_day_resolution(requested.local_date)
    : null;
  const verdict = evaluateAdvanceRule({
    local_date: requested.local_date,
    today_local_date: requested.today_local_date,
    day_resolution: dayResolution,
    coach_backdate_grant: input.coach_backdate_grant ?? null,
  });
  if (verdict.decision === "refuse") {
    return refusal({
      status: "blocked",
      reason_code: verdict.reason_code,
      requested: [requested],
      allowed: [requested],
      local_date: requested.local_date,
      retroactive: true,
      day_resolved: true,
    });
  }

  // --- executor -----------------------------------------------------------
  const execution = await executeDeclareDeviationWrite({
    requested_effect: requested,
    user_id: input.turn_frame.user_id,
    coach_authorized_backdate: verdict.coach_authorized,
    write_planned_deviation: input.write_planned_deviation,
  });
  if (execution.status !== "committed") {
    return refusal({
      status: "failed",
      reason_code: execution.reason_code,
      requested: [requested],
      allowed: [requested],
      local_date: requested.local_date,
      retroactive: verdict.retroactive,
    });
  }

  // --- ledger + renderer --------------------------------------------------
  const committed = execution.committed_effect;
  return enforceDeclareDeviationReplyInvariant({
    detected: true,
    status: "declared",
    reply: renderDeclareDeviationReply(committed),
    executed_tools: ["declare_deviation"],
    requested_effects: [requested],
    allowed_effects: [requested],
    committed_effects: [committed],
    blocked_effects: [],
    debug: {
      reason_code: "declared",
      gate_reason: null,
      token_issue: null,
      retroactive: verdict.retroactive,
      day_resolved: dayResolution?.resolved === true,
      coach_authorized_backdate: verdict.coach_authorized,
    },
  });
}
