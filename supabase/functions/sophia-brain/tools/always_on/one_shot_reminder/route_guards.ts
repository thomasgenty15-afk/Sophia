export function normalizeOneShotReminderText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’'`-]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function oneShotReminderStatusBlocksToolFlow(args: {
  routeIsProductHelp: boolean;
  explicitProductHelp: boolean;
  activeCardDrafting: boolean;
  explicitOperationCommand: boolean;
  statusRecapReadOnly: boolean;
}): { blocked: boolean; reason_code: string } {
  if (args.routeIsProductHelp) {
    return { blocked: false, reason_code: "product_help_route" };
  }
  if (args.explicitProductHelp) {
    return { blocked: false, reason_code: "product_help_request" };
  }
  if (args.activeCardDrafting) {
    return { blocked: false, reason_code: "active_card_drafting" };
  }
  if (args.explicitOperationCommand) {
    return { blocked: false, reason_code: "explicit_operation_command" };
  }
  if (args.statusRecapReadOnly) {
    return {
      blocked: true,
      reason_code: "status_recap_request_blocks_tool_start",
    };
  }
  return { blocked: false, reason_code: "not_status_recap" };
}

export function oneShotReminderDirectEffectBlockForNonMutationContext(
  args: {
    routeIsProductHelp: boolean;
    statusRecapReadOnly: boolean;
    recapOnly: boolean;
  },
): { blocked: boolean; reason_code: string } {
  if (args.routeIsProductHelp) {
    return {
      blocked: true,
      reason_code: "product_help_blocks_one_shot_direct_effect",
    };
  }
  if (args.statusRecapReadOnly || args.recapOnly) {
    return {
      blocked: true,
      reason_code: "non_mutation_context_blocks_one_shot_direct_effect",
    };
  }
  return { blocked: false, reason_code: "mutation_allowed" };
}

export function hasExplicitOneShotReminderDirectEffectOverride(args: {
  directEffectsToRun: string[];
  directEffects:
    | Array<{
      effect_type?: string;
      explicitness?: string;
      target_status?: string;
      confidence_band?: string;
    }>
    | null
    | undefined;
  pendingToolSkillConfirmation: unknown;
}): boolean {
  if (!args.pendingToolSkillConfirmation) return false;
  if (!args.directEffectsToRun.includes("create_one_shot_reminder")) {
    return false;
  }
  return (args.directEffects ?? []).some((effect) =>
    effect.effect_type === "create_one_shot_reminder" &&
    effect.explicitness === "explicit" &&
    effect.target_status === "identified" &&
    effect.confidence_band === "high"
  );
}
