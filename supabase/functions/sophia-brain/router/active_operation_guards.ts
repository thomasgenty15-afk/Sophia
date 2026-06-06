export function isActiveCardDraftingOperation(activeIntake: unknown): boolean {
  const operationType = String((activeIntake as any)?.operation_type ?? "")
    .trim();
  return operationType === "prepare_attack_card" ||
    operationType === "prepare_defense_card";
}
