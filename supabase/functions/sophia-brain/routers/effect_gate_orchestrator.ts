// Gate all direct effects before tool dispatch. This keeps the router as the
// only transverse owner of direct-effect safety/idempotency checks.
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

type BlockedPath = EffectGateOrchestratorResult["additional_blocked_paths"][
  number
];
type Clarification = EffectGateOrchestratorResult["clarifications"][number];

const DEFAULT_RECENT_WRITES = { source_message_ids: [] as string[] };
const DEFAULT_DB_CHECK = async (_key: string): Promise<boolean> => false;

function isKnownEffectType(value: string): value is DirectEffectType {
  return value === "create_one_shot_reminder" ||
    value === "track_progress_plan_item";
}

function unknownEffectOutcome(effectType: string): DirectEffectGateOutcome {
  return {
    decision: "blocked",
    tool_id: effectType,
    reason_code: "duplicate_db",
    message: "Unknown direct effect type rejected by orchestrator.",
  };
}

function blockedPath(
  path: string,
  reasonCode: string,
): BlockedPath {
  return { path, reason_code: reasonCode };
}

function clarificationFromOutcome(
  effectType: DirectEffectType,
  outcome: Extract<DirectEffectGateOutcome, { decision: "needs_clarify" }>,
): Clarification {
  return {
    effect_type: effectType,
    reason_code: outcome.reason_code,
    suggested_clarification: outcome.suggested_clarification,
  };
}

export async function runEffectGateOrchestrator(
  input: EffectGateOrchestratorInput,
): Promise<EffectGateOrchestratorResult> {
  const outcomes: Record<string, DirectEffectGateOutcome> = {};
  const allowed: DirectEffectType[] = [];
  const clarifications: EffectGateOrchestratorResult["clarifications"] = [];
  const additionalBlockedPaths: BlockedPath[] = [];

  const seen = new Set<string>();
  for (const rawEffect of input.direct_effects_to_run) {
    const effectType = String(rawEffect);
    if (seen.has(effectType)) continue;
    seen.add(effectType);

    if (!isKnownEffectType(effectType)) {
      const outcome = unknownEffectOutcome(effectType);
      outcomes[effectType] = outcome;
      additionalBlockedPaths.push(
        blockedPath(effectType, "unknown_effect_type"),
      );
      continue;
    }

    const outcome = await runDirectEffectGate({
      effect_type: effectType,
      turn_frame: input.turn_frame,
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
      clarifications.push(clarificationFromOutcome(effectType, outcome));
      additionalBlockedPaths.push(blockedPath(effectType, outcome.reason_code));
      continue;
    }

    additionalBlockedPaths.push(blockedPath(effectType, outcome.reason_code));
  }

  return {
    outcomes,
    allowed,
    clarifications,
    additional_blocked_paths: additionalBlockedPaths,
  };
}
