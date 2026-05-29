import type { ExecutionDecision } from "./contract.ts";

export function renderExecutionBreakdownReply(args: {
  decision: ExecutionDecision;
  intake_ok: boolean;
}): string | undefined {
  if (!args.intake_ok) return undefined;
  return args.decision.reply;
}

export const EXECUTION_BREAKDOWN_RENDERER_INVARIANTS = [
  "intake_failure_has_no_skill_authored_business_reply",
  "renderer_does_not_classify_user_message",
] as const;
