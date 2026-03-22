import {
  getMomentumPolicyDefinition,
  summarizeMomentumPolicy,
} from "./momentum_policy.ts";
import { readMomentumState, type MomentumStateLabel } from "./momentum_state.ts";

export type MomentumProactiveKind =
  | "daily_bilan"
  | "weekly_bilan";

export interface MomentumProactiveDecision {
  kind: MomentumProactiveKind;
  decision: "allow" | "skip";
  reason: string;
  state?: MomentumStateLabel;
  policy_action?: ReturnType<typeof getMomentumPolicyDefinition>["primary_action"];
  proactive_policy?: ReturnType<typeof getMomentumPolicyDefinition>["proactive_policy"];
}

const ALLOWED_STATES_BY_KIND: Record<
  MomentumProactiveKind,
  MomentumStateLabel[]
> = {
  daily_bilan: ["momentum"],
  weekly_bilan: ["momentum", "friction_legere"],
};

export function decideMomentumProactive(args: {
  kind: MomentumProactiveKind;
  tempMemory: any;
}): MomentumProactiveDecision {
  const momentum = readMomentumState(args.tempMemory);
  const state = momentum.current_state;

  if (!state) {
    return {
      kind: args.kind,
      decision: "allow",
      reason: "momentum_policy_state_missing",
    };
  }

  const policy = getMomentumPolicyDefinition(state);
  if (policy.max_proactive_per_7d <= 0 || policy.proactive_policy === "none") {
    return {
      kind: args.kind,
      decision: "skip",
      reason: `momentum_policy_block:${args.kind}:${state}:no_proactive`,
      state,
      policy_action: policy.primary_action,
      proactive_policy: policy.proactive_policy,
    };
  }

  if (!ALLOWED_STATES_BY_KIND[args.kind].includes(state)) {
    return {
      kind: args.kind,
      decision: "skip",
      reason: `momentum_policy_block:${args.kind}:${state}:${policy.proactive_policy}`,
      state,
      policy_action: policy.primary_action,
      proactive_policy: policy.proactive_policy,
    };
  }

  return {
    kind: args.kind,
    decision: "allow",
    reason: `momentum_policy_allow:${args.kind}:${state}`,
    state,
    policy_action: policy.primary_action,
    proactive_policy: policy.proactive_policy,
  };
}

export function summarizeMomentumProactiveDecision(
  decision: MomentumProactiveDecision,
): Record<string, unknown> {
  return {
    kind: decision.kind,
    decision: decision.decision,
    reason: decision.reason,
    state: decision.state ?? null,
    ...(decision.state
      ? { policy: summarizeMomentumPolicy(decision.state) }
      : {}),
  };
}
