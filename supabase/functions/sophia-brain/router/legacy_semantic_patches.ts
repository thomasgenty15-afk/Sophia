/**
 * Legacy semantic patches retired from L3/global routing.
 *
 * Kept temporarily as compatibility exports while callers are migrated to
 * structured TurnFrame/UserTurnSnapshot/TurnAgenda signals. These functions must
 * not parse raw user text or classify business intent.
 */

export type LegacySemanticPatch = {
  id: string;
  owner: "dispatcher" | "skill" | "tool_skill" | "status_recap";
  reason: string;
  qa_reference?: string;
  removal_condition: string;
};

export function detectExplicitNoToolRequest(_message: string): boolean {
  return false;
}

export function isLocalTextRevisionRequest(_message: string): boolean {
  return false;
}

export function isRecapOnlyRequest(_message: string): boolean {
  return false;
}

export function isStatusOnlyNoMutationRequest(_message: string): boolean {
  return false;
}

export function isExplicitConversationalFormatRequest(
  _message: string,
): boolean {
  return false;
}

export function shouldRenderStatusOnlyNoMutation(_message: string): boolean {
  return false;
}

export function isActiveCardDraftingOperation(activeIntake: unknown): boolean {
  const operationType = String((activeIntake as any)?.operation_type ?? "")
    .trim();
  return operationType === "prepare_attack_card" ||
    operationType === "prepare_defense_card";
}

export function isExplicitOperationCommand(_message: string): boolean {
  return false;
}

export function detectsMinuteByMinuteSequenceRequest(_message: string): boolean {
  return false;
}
