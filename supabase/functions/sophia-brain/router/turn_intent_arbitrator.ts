import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { ConfidenceBand, TurnFrame } from "../contracts/turn_frame.v1.ts";

// =============================================================================
// COUCHE L3 — Arbitre de routage
// =============================================================================
//
// L3 ne relit pas le texte utilisateur pour comprendre l'intention. Cette couche
// arbitre uniquement des signaux structurés déjà produits par le dispatcher, les
// confirmations, l'état actif et l'EffectLedger/agenda.
// =============================================================================

type ClearFlowTarget = "active_tool" | "pending_tool" | "recommendation";

export type TurnIntentArbitrationResult = {
  routeDecision: RouteDecision;
  turnFrame: TurnFrame;
  tempMemory: any;
  changed: boolean;
  reasonCode?: string;
  clearTargets: ClearFlowTarget[];
};

export type TurnIntentArbitrationInput = {
  userMessage: string;
  routeDecision: RouteDecision;
  turnFrame: TurnFrame;
  tempMemory: any;
  activeOperationIntake?: unknown;
  pendingOperationConfirmation?: unknown;
  safetyBlocksTools?: boolean;
};

function confidenceRank(confidence: ConfidenceBand | undefined): number {
  return confidence === "critical"
    ? 4
    : confidence === "high"
    ? 3
    : confidence === "medium"
    ? 2
    : confidence === "low"
    ? 1
    : 0;
}

function activeOperationType(input: TurnIntentArbitrationInput): string {
  const active = input.activeOperationIntake ??
    input.tempMemory?.__adjust_plan_handoff_state ??
    input.tempMemory?.__recurring_reminder_handoff_state ??
    input.tempMemory?.__active_attack_card_handoff ??
    input.tempMemory?.__active_tool_skill_intake ??
    input.tempMemory?.active_tool_skill_intake ??
    null;
  if (
    (active as any)?.skill_id === "adjust_plan_item" &&
    (active as any)?.mode === "platform_handoff"
  ) return "adjust_plan_item";
  return String(
    (active as any)?.operation_type ??
      ((active as any)?.mode === "platform_handoff"
        ? (active as any)?.skill_id
        : "") ??
      "",
  ).trim();
}

function activeDefenseCardHandoff(input: TurnIntentArbitrationInput): unknown {
  const active = input.activeOperationIntake ??
    input.tempMemory?.__active_tool_skill_intake ??
    input.tempMemory?.active_tool_skill_intake ??
    null;
  if (
    (active as any)?.operation_type === "prepare_defense_card" &&
    (active as any)?.mode === "platform_handoff"
  ) return active;
  return null;
}

function pendingOperationType(value: unknown): string {
  return String((value as any)?.operation_type ?? "").trim();
}

function routeAlreadyOwnsProductHelp(routeDecision: RouteDecision): boolean {
  return routeDecision.response_owner === "product_help" ||
    routeDecision.selected_handler === "product_help";
}

function routeAlreadyOwnsStatusRead(routeDecision: RouteDecision): boolean {
  return routeDecision.selected_handler === "status_recap" ||
    routeDecision.reason_code.includes("status_recap");
}

function blockedPath(path: string, reasonCode: string) {
  return { path, reason_code: reasonCode };
}

function clearToolFlowMemory(tempMemory: any, targets: ClearFlowTarget[]): any {
  const next = { ...(tempMemory ?? {}) };
  if (targets.includes("active_tool")) {
    delete next.__active_tool_skill_intake;
    delete next.active_tool_skill_intake;
    delete next.__adjust_plan_handoff_state;
  }
  if (targets.includes("pending_tool")) {
    delete next.__pending_tool_skill_confirmation;
    delete next.pending_tool_skill_confirmation;
  }
  if (targets.includes("recommendation")) {
    delete next.__pending_recommendation_operation;
  }
  return next;
}

function clearToolSkillFlowEntries(
  tempMemory: unknown,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(tempMemory as any ?? {}) };
  delete next.__pending_tool_skill_confirmation;
  delete next.pending_tool_skill_confirmation;
  delete next.__active_tool_skill_intake;
  delete next.active_tool_skill_intake;
  delete next.__pending_recommendation_operation;
  delete next.__adjust_plan_handoff_state;
  delete next.__recurring_reminder_handoff_state;
  delete next.__active_attack_card_handoff;
  return next;
}

function productHelpSignalIsHigh(turnFrame: TurnFrame): boolean {
  const signal = turnFrame.skill_signals.entry?.product_help;
  return signal?.detected === true && confidenceRank(signal.confidence_band) >=
      confidenceRank("high");
}

function hasRunnableDirectEffect(
  input: TurnIntentArbitrationInput,
  effectType?: string,
): boolean {
  const fromRoute = input.routeDecision.direct_effects_to_run.some((effect) =>
    !effectType || effect === effectType
  );
  if (fromRoute) return true;
  return input.turnFrame.direct_effects.some((effect) =>
    (!effectType || effect.effect_type === effectType) &&
    effect.explicitness === "explicit" &&
    effect.target_status === "identified" &&
    confidenceRank(effect.confidence_band) >= confidenceRank("high")
  );
}

function routeableToolIntent(
  input: TurnIntentArbitrationInput,
  operationType?: string,
): TurnFrame["tool_skill_intents"][number] | undefined {
  return input.turnFrame.tool_skill_intents.find((intent) =>
    (!operationType || intent.operation_type === operationType) &&
    intent.user_intent !== "explain_only" &&
    intent.ambiguity === "none" &&
    confidenceRank(intent.confidence_band) >= confidenceRank("medium")
  );
}

function hasCompetingAttackAndDefenseCardIntents(
  input: TurnIntentArbitrationInput,
): boolean {
  return Boolean(
    routeableToolIntent(input, "prepare_attack_card") &&
      routeableToolIntent(input, "prepare_defense_card"),
  );
}

function hasStructuredMutationSignal(
  input: TurnIntentArbitrationInput,
): boolean {
  return hasRunnableDirectEffect(input) ||
    input.turnFrame.tool_skill_intents.some((intent) =>
      intent.user_intent !== "explain_only" &&
      intent.ambiguity === "none" &&
      confidenceRank(intent.confidence_band) >= confidenceRank("medium")
    );
}

function hasRejectedOperation(
  input: TurnIntentArbitrationInput,
  operationType: string,
): boolean {
  return input.turnFrame.tool_skill_intents.some((intent) =>
    (intent.rejected_operations ?? []).includes(operationType)
  );
}

function rewriteForProductHelp(
  input: TurnIntentArbitrationInput,
): TurnIntentArbitrationResult {
  const reasonCode = "central_arbitrator_product_help_structured_priority";
  return {
    changed: true,
    reasonCode,
    clearTargets: ["active_tool", "pending_tool"],
    tempMemory: clearToolSkillFlowEntries(input.tempMemory),
    turnFrame: {
      ...input.turnFrame,
      direct_effects: [],
      tool_skill_intents: [],
      flow_opportunity: null,
    },
    routeDecision: {
      ...input.routeDecision,
      response_owner: "product_help",
      selected_handler: "product_help",
      direct_effects_to_run: [],
      reason_code: reasonCode,
      blocked_paths: [
        ...input.routeDecision.blocked_paths,
        blockedPath("direct_effects", reasonCode),
        blockedPath("tool_skill_flow", reasonCode),
      ],
    },
  };
}

function rewriteForClarification(
  input: TurnIntentArbitrationInput,
  reasonCode: string,
): TurnIntentArbitrationResult {
  return {
    changed: true,
    reasonCode,
    clearTargets: [],
    tempMemory: input.tempMemory,
    turnFrame: {
      ...input.turnFrame,
      direct_effects: [],
      flow_opportunity: null,
    },
    routeDecision: {
      ...input.routeDecision,
      response_owner: "orientation_clarification",
      selected_handler: "orientation_clarification",
      direct_effects_to_run: [],
      reason_code: reasonCode,
      blocked_paths: [
        ...input.routeDecision.blocked_paths,
        blockedPath("direct_effects", reasonCode),
        blockedPath("tool_skill_flow", reasonCode),
      ],
    },
  };
}

function rewriteForToolIntent(
  input: TurnIntentArbitrationInput,
  operationType: string,
  reasonCode: string,
): TurnIntentArbitrationResult {
  return {
    changed: true,
    reasonCode,
    clearTargets: [],
    tempMemory: input.tempMemory,
    turnFrame: {
      ...input.turnFrame,
      direct_effects: [],
      flow_opportunity: null,
    },
    routeDecision: {
      ...input.routeDecision,
      response_owner: "tool_skill",
      selected_handler: operationType,
      direct_effects_to_run: [],
      reason_code: reasonCode,
      blocked_paths: [
        ...input.routeDecision.blocked_paths,
        blockedPath("product_help", reasonCode),
        blockedPath("status_recap", reasonCode),
      ],
    },
  };
}

function rewriteForNormalReply(args: {
  input: TurnIntentArbitrationInput;
  reasonCode: string;
  blockedPaths: string[];
  clearTargets?: ClearFlowTarget[];
  removeToolIntents?: string[];
  removeDirectEffects?: string[];
}): TurnIntentArbitrationResult {
  const clearTargets = args.clearTargets ?? [];
  const removeToolIntents = new Set(args.removeToolIntents ?? []);
  const removeDirectEffects = new Set(args.removeDirectEffects ?? []);
  return {
    changed: true,
    reasonCode: args.reasonCode,
    clearTargets,
    tempMemory: clearToolFlowMemory(args.input.tempMemory, clearTargets),
    turnFrame: {
      ...args.input.turnFrame,
      direct_effects: args.input.turnFrame.direct_effects.filter((effect) =>
        !removeDirectEffects.has(effect.effect_type)
      ),
      tool_skill_intents: args.input.turnFrame.tool_skill_intents.filter((
        intent,
      ) => !removeToolIntents.has(intent.operation_type)),
      flow_opportunity: removeToolIntents.size > 0
        ? null
        : args.input.turnFrame.flow_opportunity ?? null,
    },
    routeDecision: {
      ...args.input.routeDecision,
      response_owner: "normal_reply",
      selected_handler: undefined,
      direct_effects_to_run: args.input.routeDecision.direct_effects_to_run
        .filter((effect) => !removeDirectEffects.has(effect)),
      reason_code: args.reasonCode,
      blocked_paths: [
        ...args.input.routeDecision.blocked_paths,
        ...args.blockedPaths.map((path) => blockedPath(path, args.reasonCode)),
      ],
    },
  };
}

function rewriteForOneShotReminder(
  input: TurnIntentArbitrationInput,
  reasonCode: string,
): TurnIntentArbitrationResult {
  return {
    changed: true,
    reasonCode,
    clearTargets: ["active_tool", "recommendation"],
    tempMemory: clearToolFlowMemory(input.tempMemory, [
      "active_tool",
      "recommendation",
    ]),
    turnFrame: {
      ...input.turnFrame,
      tool_skill_intents: input.turnFrame.tool_skill_intents.filter((intent) =>
        intent.operation_type !== "prepare_attack_card" &&
        intent.operation_type !== "prepare_defense_card" &&
        intent.operation_type !== "adjust_plan_item"
      ),
      flow_opportunity: null,
    },
    routeDecision: {
      ...input.routeDecision,
      response_owner: "normal_reply",
      selected_handler: undefined,
      direct_effects_to_run: ["create_one_shot_reminder"],
      reason_code: reasonCode,
      blocked_paths: [
        ...input.routeDecision.blocked_paths,
        blockedPath("tool_skill_flow", reasonCode),
      ],
    },
  };
}

export function arbitrateTurnIntent(
  input: TurnIntentArbitrationInput,
): TurnIntentArbitrationResult {
  if (input.routeDecision.response_owner === "safety") {
    return {
      routeDecision: input.routeDecision,
      turnFrame: input.turnFrame,
      tempMemory: input.tempMemory,
      changed: false,
      clearTargets: [],
    };
  }

  const productHelpStructured = routeAlreadyOwnsProductHelp(
    input.routeDecision,
  ) || productHelpSignalIsHigh(input.turnFrame);
  const mutationSignal = hasStructuredMutationSignal(input);

  if (productHelpStructured && !mutationSignal) {
    if (
      routeAlreadyOwnsProductHelp(input.routeDecision) &&
      input.routeDecision.direct_effects_to_run.length === 0 &&
      input.turnFrame.direct_effects.length === 0 &&
      input.turnFrame.tool_skill_intents.length === 0
    ) {
      return {
        routeDecision: input.routeDecision,
        turnFrame: input.turnFrame,
        tempMemory: input.tempMemory,
        changed: false,
        clearTargets: [],
      };
    }
    return rewriteForProductHelp(input);
  }

  if (productHelpStructured && mutationSignal) {
    return rewriteForClarification(
      input,
      "central_arbitrator_structured_product_help_operation_conflict",
    );
  }

  if (
    !input.safetyBlocksTools &&
    hasRunnableDirectEffect(input, "create_one_shot_reminder")
  ) {
    return rewriteForOneShotReminder(
      input,
      "central_arbitrator_one_shot_reminder_structured_effect",
    );
  }

  const activeType = activeOperationType(input);
  const pendingType = pendingOperationType(input.pendingOperationConfirmation);
  const activeExit = activeType &&
    input.turnFrame.skill_signals.exit?.[activeType]?.detected === true;
  if (activeExit && activeType !== pendingType) {
    return rewriteForNormalReply({
      input,
      reasonCode: "central_arbitrator_structured_active_tool_exit",
      blockedPaths: [`tool_skill.${activeType}`, "tool_skill_flow"],
      clearTargets: ["active_tool", "recommendation"],
      removeToolIntents: [activeType],
      removeDirectEffects: [],
    });
  }

  if (
    pendingType &&
    input.turnFrame.confirmation_response?.kind === "correction_to_pending"
  ) {
    return rewriteForToolIntent(
      input,
      pendingType,
      "central_arbitrator_pending_tool_structured_correction",
    );
  }

  const defenseHandoffActive = Boolean(activeDefenseCardHandoff(input));
  if (
    defenseHandoffActive &&
    !input.safetyBlocksTools &&
    input.routeDecision.selected_handler !== "prepare_defense_card"
  ) {
    return rewriteForToolIntent(
      input,
      "prepare_defense_card",
      "central_arbitrator_active_defense_card_handoff",
    );
  }

  const explicitRecurring = routeableToolIntent(
    input,
    "create_recurring_reminder",
  );
  if (!input.safetyBlocksTools && explicitRecurring) {
    return rewriteForToolIntent(
      input,
      "create_recurring_reminder",
      "central_arbitrator_recurring_reminder_structured_intent",
    );
  }

  if (
    !input.safetyBlocksTools &&
    hasCompetingAttackAndDefenseCardIntents(input)
  ) {
    return rewriteForClarification(
      input,
      "central_arbitrator_attack_defense_card_ambiguity",
    );
  }

  const explicitAttack = routeableToolIntent(input, "prepare_attack_card");
  if (
    !input.safetyBlocksTools &&
    explicitAttack &&
    input.routeDecision.selected_handler !== "prepare_attack_card" &&
    !hasRejectedOperation(input, "prepare_attack_card")
  ) {
    return rewriteForToolIntent(
      input,
      "prepare_attack_card",
      "central_arbitrator_attack_card_structured_intent",
    );
  }

  const explicitDefense = routeableToolIntent(input, "prepare_defense_card");
  if (
    !input.safetyBlocksTools &&
    explicitDefense &&
    input.routeDecision.selected_handler !== "prepare_defense_card" &&
    !hasRejectedOperation(input, "prepare_defense_card")
  ) {
    return rewriteForToolIntent(
      input,
      "prepare_defense_card",
      "central_arbitrator_defense_card_structured_intent",
    );
  }

  if (routeAlreadyOwnsStatusRead(input.routeDecision)) {
    return {
      routeDecision: input.routeDecision,
      turnFrame: input.turnFrame,
      tempMemory: input.tempMemory,
      changed: false,
      clearTargets: [],
    };
  }

  return {
    routeDecision: input.routeDecision,
    turnFrame: input.turnFrame,
    tempMemory: input.tempMemory,
    changed: false,
    clearTargets: [],
  };
}
