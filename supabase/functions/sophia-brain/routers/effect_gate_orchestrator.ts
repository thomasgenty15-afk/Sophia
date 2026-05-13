// Centralised orchestration for direct-effect gating.
//
// PURPOSE
// -------
// `runDirectEffectGate` is the single source of truth for whether a direct
// effect (write-y side effect like creating a one-shot reminder) is allowed
// to run on a given turn. Historically each tool called the gate itself,
// which meant a new tool author could ship a tool that bypasses the gate.
//
// This orchestrator forces the gate to run BEFORE any tool dispatch:
// callers iterate `routeDecision.direct_effects_to_run`, get the gated
// outcomes here, and only invoke the underlying tool with `decision === "allow"`.
//
// CONTRACT
// --------
// Inputs:
//   - turn_frame: The TurnFrame produced by the dispatcher.
//   - direct_effects_to_run: The list selected by `runConversationRouters`
//     (typically `RouteDecision.direct_effects_to_run`). Effects not present
//     in `turn_frame.direct_effects` will surface as gate `blocked` outcomes.
//   - pending_tool_skill_confirmation, recent_writes_idempotency,
//     db_idempotency_check: same inputs as `runDirectEffectGate`.
//
// Outputs:
//   - outcomes: Map<effect_type, DirectEffectGateOutcome>
//   - allowed: Effect types whose decision is "allow", in routing order.
//   - clarifications: Effect types that need clarification, with their
//     suggested user-facing question (for the response builder).
//   - additional_blocked_paths: Suitable for merging into
//     `RouteDecision.blocked_paths` so observability stays consistent.
//
// USAGE
// -----
// ```ts
// const gateResult = await runEffectGateOrchestrator({
//   turn_frame,
//   direct_effects_to_run: routeDecision.direct_effects_to_run,
//   pending_tool_skill_confirmation,
//   recent_writes_idempotency,
//   db_idempotency_check,
// });
// for (const effectType of gateResult.allowed) {
//   const outcome = gateResult.outcomes[effectType];
//   await dispatchTool(effectType, outcome);
// }
// ```
import type {
  DirectEffectGateOutcome,
} from "../contracts/direct_effect_gate.v1.ts";
import type {
  DirectEffectType,
  TurnFrame,
} from "../contracts/turn_frame.v1.ts";
import { runDirectEffectGate } from "./direct_effect_gate.ts";

export type EffectGateOrchestratorInput = {
  turn_frame: TurnFrame;
  direct_effects_to_run: ReadonlyArray<string>;
  pending_tool_skill_confirmation?: unknown;
  recent_writes_idempotency?: { source_message_ids: string[] };
  db_idempotency_check?: (key: string) => Promise<boolean>;
};

export type EffectGateOrchestratorResult = {
  outcomes: Record<string, DirectEffectGateOutcome>;
  allowed: DirectEffectType[];
  clarifications: Array<{
    effect_type: DirectEffectType;
    reason_code: string;
    suggested_clarification: string;
  }>;
  additional_blocked_paths: Array<{ path: string; reason_code: string }>;
};

const DEFAULT_RECENT_WRITES = { source_message_ids: [] as string[] };
const DEFAULT_DB_CHECK = async (_key: string): Promise<boolean> => false;

function isKnownEffectType(value: string): value is DirectEffectType {
  return value === "create_one_shot_reminder" ||
    value === "track_progress_plan_item";
}

export async function runEffectGateOrchestrator(
  input: EffectGateOrchestratorInput,
): Promise<EffectGateOrchestratorResult> {
  const outcomes: Record<string, DirectEffectGateOutcome> = {};
  const allowed: DirectEffectType[] = [];
  const clarifications: EffectGateOrchestratorResult["clarifications"] = [];
  const additionalBlockedPaths: Array<{ path: string; reason_code: string }> =
    [];

  const seen = new Set<string>();
  for (const rawEffect of input.direct_effects_to_run) {
    const effectType = String(rawEffect);
    if (seen.has(effectType)) continue;
    seen.add(effectType);

    if (!isKnownEffectType(effectType)) {
      const outcome: DirectEffectGateOutcome = {
        decision: "blocked",
        tool_id: effectType,
        reason_code: "duplicate_db",
        message: "Unknown direct effect type rejected by orchestrator.",
      };
      outcomes[effectType] = outcome;
      additionalBlockedPaths.push({
        path: effectType,
        reason_code: "unknown_effect_type",
      });
      continue;
    }

    const outcome = await runDirectEffectGate({
      effect_type: effectType,
      turn_frame: input.turn_frame,
      pending_tool_skill_confirmation: input.pending_tool_skill_confirmation,
      recent_writes_idempotency: input.recent_writes_idempotency ??
        DEFAULT_RECENT_WRITES,
      db_idempotency_check: input.db_idempotency_check ?? DEFAULT_DB_CHECK,
    });
    outcomes[effectType] = outcome;

    if (outcome.decision === "allow") {
      allowed.push(effectType);
      continue;
    }

    if (outcome.decision === "needs_clarify") {
      clarifications.push({
        effect_type: effectType,
        reason_code: outcome.reason_code,
        suggested_clarification: outcome.suggested_clarification,
      });
      additionalBlockedPaths.push({
        path: effectType,
        reason_code: outcome.reason_code,
      });
      continue;
    }

    additionalBlockedPaths.push({
      path: effectType,
      reason_code: outcome.reason_code,
    });
  }

  return {
    outcomes,
    allowed,
    clarifications,
    additional_blocked_paths: additionalBlockedPaths,
  };
}
