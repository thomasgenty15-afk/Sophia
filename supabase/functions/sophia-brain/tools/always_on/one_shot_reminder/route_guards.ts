export function normalizeOneShotReminderText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’'`-]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isExistingOneShotReminderReferenceOnly(
  message: string,
): boolean {
  void message;
  return false;
}

// Legacy compatibility export only.
//
// Commandement 0: no business routing by regex/includes. One-shot reminder
// admission must come from structured dispatcher direct_effects, not from this
// local text classifier.
export function isLikelyOneShotReminderRequest(message: string): boolean {
  void message;
  return false;
}

export function isProductHelpQuestion(normalizedText: string): boolean {
  void normalizedText;
  return false;
}

export function isStatusQuestion(normalizedText: string): boolean {
  void normalizedText;
  return false;
}

export function detectsExplicitOneShotReminderCancel(
  message: string,
): boolean {
  void message;
  return false;
}

export function looksLikeReminderSlotConfirmation(
  message: string,
): boolean {
  const text = String(message ?? "").toLowerCase().normalize("NFD").replace(
    /\p{Diacritic}/gu,
    "",
  );
  return /\b(oui|ouais|ok|d accord|c est ca|c est bien ca|exact|exactement|valide|confirme|unique|une seule fois|une fois|ponctuel|ponctuelle|recurrent|recurrente|chaque jour|tous les jours|repete)\b/
    .test(text);
}

export function looksLikeReminderExecutionConfirmation(
  message: string,
): boolean {
  const text = String(message ?? "").toLowerCase().normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['’`]/g, " ");
  if (
    /\b(comment|ou est|ou je|ou puis|pourquoi|peux tu|tu peux|pourrais|est ce que|dans l app|dans l application|dans l interface)\b/
      .test(text)
  ) return false;
  const hasExecutionVerb =
    /\b(programme|programmes|programmer|planifie|planifier|lance|lances|lancer|cale|cales|caler|active|activer|mets|met|mettre)\b/
      .test(text);
  if (!hasExecutionVerb) return false;
  const hasObjectOrNow =
    /\b(le|la|ca|ce|ce rappel|le rappel|celui la|maintenant|tout de suite|des maintenant|la maintenant|vas y|go)\b/
      .test(text);
  return hasObjectOrNow;
}

export function isExplicitOneShotReminderModificationRequest(
  message: string,
): boolean {
  void message;
  return false;
}

export function isOneShotReminderExactStatusRequest(
  message: string,
): boolean {
  void message;
  return false;
}

export function isOneShotReminderReprogrammingFollowup(
  message: string,
): boolean {
  void message;
  return false;
}

export function looksLikeReminderCreationCommand(
  message: string,
): boolean {
  void message;
  return false;
}

export function oneShotReminderModificationRouteGuard(
  message: string,
): { blocked: boolean; reason_code: string } {
  const blocked = isExplicitOneShotReminderModificationRequest(message) ||
    isOneShotReminderReprogrammingFollowup(message);
  return {
    blocked,
    reason_code: blocked
      ? "one_shot_reminder_modification_not_adjust_plan"
      : "not_one_shot_reminder_modification",
  };
}

export function oneShotReminderStatusBlocksToolFlow(args: {
  message: string;
  routeIsProductHelp: boolean;
  explicitProductHelp: boolean;
  activeCardDrafting: boolean;
  explicitOperationCommand: boolean;
  statusOnlyNoMutation: boolean;
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
  if (
    args.statusOnlyNoMutation ||
    isOneShotReminderExactStatusRequest(args.message)
  ) {
    return {
      blocked: true,
      reason_code: isOneShotReminderExactStatusRequest(args.message)
        ? "one_shot_reminder_exact_status_request"
        : "status_only_request_blocks_tool_start",
    };
  }
  return { blocked: false, reason_code: "not_status_only" };
}

export function oneShotReminderDirectEffectBlockForNonMutationContext(
  args: {
    message: string;
    routeIsProductHelp: boolean;
    statusOnlyNoMutation: boolean;
    recapOnly: boolean;
  },
): { blocked: boolean; reason_code: string } {
  if (args.routeIsProductHelp) {
    return {
      blocked: true,
      reason_code: "product_help_blocks_one_shot_direct_effect",
    };
  }
  if (
    args.statusOnlyNoMutation ||
    isOneShotReminderExactStatusRequest(args.message) ||
    args.recapOnly ||
    isExistingOneShotReminderReferenceOnly(args.message)
  ) {
    return {
      blocked: true,
      reason_code: "non_mutation_context_blocks_one_shot_direct_effect",
    };
  }
  return { blocked: false, reason_code: "mutation_allowed" };
}

export function shouldPreferOneShotReminderOverRecurring(
  message: string,
): boolean {
  void message;
  return false;
}

export function shouldOneShotReminderSupersedeToolFlow(args: {
  message: string;
  hasActiveOrPendingToolFlow: boolean;
  safetyBlocksTools?: boolean;
}): boolean {
  void args;
  return false;
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

export function isOneShotReminderOperationCommand(
  message: string,
): boolean {
  void message;
  return false;
}

export function isExplicitAllPendingCancel(message: string): boolean {
  void message;
  return false;
}
