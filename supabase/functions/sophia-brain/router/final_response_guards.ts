import type { RouteDecision } from "../contracts/route_decision.v1.ts";

/**
 * Production guard.
 * Runtime wiring placeholder only. No text-semantic rewrite is allowed here:
 * route/effect ownership must come from structured dispatcher contracts.
 */
export function applyNonDurableMemoryPromiseGuard(args: {
  userMessage: string;
  responseContent: string;
  routeDecision?:
    | Pick<RouteDecision, "response_owner" | "direct_effects_to_run">
    | null;
}): string {
  void args.userMessage;
  void args.routeDecision;
  return args.responseContent;
}

/**
 * Production guard.
 * Runtime wiring placeholder only. Recap ownership belongs to structured flow
 * state, not to regex over the user or assistant text.
 */
export function applyIncompleteRecapGuard(args: {
  userMessage: string;
  responseContent: string;
}): string {
  void args.userMessage;
  return args.responseContent;
}

/**
 * Runtime policy.
 * Runtime wiring placeholder only. Compact rendering must be selected by
 * structured policy/flow output, not inferred from text.
 */
export function applyCompactStartGuard(args: {
  userMessage: string;
  responseContent: string;
}): string {
  void args.userMessage;
  return args.responseContent;
}

/**
 * Production guard.
 * Runtime wiring placeholder only. Unexecuted-effect checks must use the
 * structured effect ledger, not text-semantic routing/render regex.
 */
export function applyUnexecutedEffectClaimGuard(args: {
  responseContent: string;
  intendedTools: string[];
  executedTools: string[];
}): string {
  void args.intendedTools;
  void args.executedTools;
  return args.responseContent;
}
