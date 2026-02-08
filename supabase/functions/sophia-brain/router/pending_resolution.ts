export type PendingResolutionStatus = "resolved" | "unresolved" | "unrelated";

export type PendingResolutionType =
  | "dual_tool"
  | "relaunch_consent"
  | "checkup_entry"
  | "resume_prompt";

export type PendingResolutionDecisionCode =
  | "common.unclear"
  | "common.defer"
  | "common.unrelated"
  | "dual.confirm_both"
  | "dual.confirm_reversed"
  | "dual.only_first"
  | "dual.only_second"
  | "dual.decline_all"
  | "relaunch.accept"
  | "relaunch.decline"
  | "relaunch.defer"
  | "checkup.accept"
  | "checkup.decline"
  | "checkup.defer"
  | "resume.accept"
  | "resume.decline"
  | "resume.defer";

export interface PendingResolutionSignal {
  status: PendingResolutionStatus;
  pending_type: PendingResolutionType;
  decision_code: PendingResolutionDecisionCode;
  confidence: number;
  reason_short?: string;
}

const DECISIONS_BY_TYPE: Record<
  PendingResolutionType,
  Set<PendingResolutionDecisionCode>
> = {
  dual_tool: new Set<PendingResolutionDecisionCode>([
    "common.unclear",
    "common.defer",
    "common.unrelated",
    "dual.confirm_both",
    "dual.confirm_reversed",
    "dual.only_first",
    "dual.only_second",
    "dual.decline_all",
  ]),
  relaunch_consent: new Set<PendingResolutionDecisionCode>([
    "common.unclear",
    "common.defer",
    "common.unrelated",
    "relaunch.accept",
    "relaunch.decline",
    "relaunch.defer",
  ]),
  checkup_entry: new Set<PendingResolutionDecisionCode>([
    "common.unclear",
    "common.defer",
    "common.unrelated",
    "checkup.accept",
    "checkup.decline",
    "checkup.defer",
  ]),
  resume_prompt: new Set<PendingResolutionDecisionCode>([
    "common.unclear",
    "common.defer",
    "common.unrelated",
    "resume.accept",
    "resume.decline",
    "resume.defer",
  ]),
};

export function isDecisionAllowedForPendingType(
  pendingType: PendingResolutionType,
  decisionCode: PendingResolutionDecisionCode,
): boolean {
  return DECISIONS_BY_TYPE[pendingType].has(decisionCode);
}

export function normalizePendingResolutionSignal(
  raw: any,
): PendingResolutionSignal | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const status = String(raw.status ?? "").trim().toLowerCase();
  const pendingType = String(raw.pending_type ?? "").trim().toLowerCase();
  const decisionCode = String(raw.decision_code ?? "").trim().toLowerCase();
  const reason = typeof raw.reason_short === "string"
    ? raw.reason_short.trim().slice(0, 180)
    : undefined;
  const confidence = Math.max(
    0,
    Math.min(1, Number(raw.confidence ?? 0.5) || 0.5),
  );

  if (
    status !== "resolved" && status !== "unresolved" && status !== "unrelated"
  ) {
    return undefined;
  }
  if (
    pendingType !== "dual_tool" &&
    pendingType !== "relaunch_consent" &&
    pendingType !== "checkup_entry" &&
    pendingType !== "resume_prompt"
  ) {
    return undefined;
  }
  if (!decisionCode) return undefined;

  const typedDecision = decisionCode as PendingResolutionDecisionCode;
  const typedPending = pendingType as PendingResolutionType;
  if (!isDecisionAllowedForPendingType(typedPending, typedDecision)) {
    return undefined;
  }

  return {
    status: status as PendingResolutionStatus,
    pending_type: typedPending,
    decision_code: typedDecision,
    confidence,
    reason_short: reason || undefined,
  };
}
