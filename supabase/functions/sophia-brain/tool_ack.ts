export type ToolExecutionStatus =
  | "none"
  | "blocked"
  | "success"
  | "failed"
  | "uncertain";

export interface ToolAckContract {
  version: 1;
  status: ToolExecutionStatus;
  attempted: boolean;
  success_confirmed: boolean;
  allow_success_claim: boolean;
  tool_name: string | null;
  executed_tools: string[];
  user_safe_message: string | null;
}

export function defaultToolSafeMessage(
  status: ToolExecutionStatus,
): string | null {
  if (status === "blocked") {
    return "Je n'ai pas encore pu valider techniquement ce changement.";
  }
  if (status === "failed") {
    return "Il y a eu un souci technique pendant l'execution du changement.";
  }
  if (status === "uncertain") {
    return "Je prefere verifier l'etat reel avant de confirmer le changement.";
  }
  return null;
}

export function buildToolAckContract(args: {
  status: ToolExecutionStatus;
  executedTools?: string[] | null;
  userSafeMessage?: string | null;
}): ToolAckContract {
  const executedTools = Array.isArray(args.executedTools)
    ? args.executedTools.filter((t) => String(t ?? "").trim().length > 0).map((t) =>
      String(t).trim()
    )
    : [];
  const status = args.status;
  const attempted = executedTools.length > 0;
  const successConfirmed = status === "success" && attempted;
  return {
    version: 1,
    status,
    attempted,
    success_confirmed: successConfirmed,
    allow_success_claim: successConfirmed,
    tool_name: executedTools[0] ?? null,
    executed_tools: executedTools.slice(0, 10),
    user_safe_message: args.userSafeMessage ?? defaultToolSafeMessage(status),
  };
}

