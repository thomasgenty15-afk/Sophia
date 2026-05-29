import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import {
  isPendingAdjustPlanItemRecommendationOperation,
  loadAdjustPlanFrameFromTempMemory,
} from "../../tools/operations/adjust_plan_item/state.ts";
import {
  isCopyForwardWeeklyRequest,
  isWeeklyLightRepeatRequest,
  isWeeklyMissionCarryOverRequest,
  weeklyMissionCarryOverContext,
} from "../../tools/operations/adjust_plan_item/weekly_bridge.ts";
import {
  isEarlyWeeklyPlanningValidationRequest,
  isExplicitPendingApplyConfirmation,
} from "./confirmation.ts";
import { weeklyAdaptiveReviewStateForTurn } from "./state.ts";

function normalizeRouteText(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizePlanTargetText(text: unknown): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function operationInputFromPlanAdjustmentScope(
  message: string,
  turnFrame: TurnFrame | null,
): Record<string, unknown> | null {
  const text = normalizeRouteText(message);
  const intent = (turnFrame?.tool_skill_intents ?? []).find((candidate) =>
    candidate.operation_type === "adjust_plan_item" &&
    candidate.confidence_band !== "low"
  ) as any;
  if (isCopyForwardWeeklyRequest(message)) {
    return {
      target_granularity: {
        status: "identified",
        value: "current_level",
        confidence: "high",
        evidence: ["message.copy_forward_current_level"],
        negative_evidence: [],
      },
      scope: {
        status: "identified",
        kind: "current_level",
        label: "niveau actuel",
        evidence: ["message.copy_forward_current_level"],
      },
      constraints: [
        "extend_current_level_same_plan",
        "copy_forward_level_one_week",
        "preserve_action_content",
        "preserve_cadence",
      ],
      adjustment_type: "rebalance",
      reason: "context_changed",
      reason_change: "time_or_capacity_changed",
      change_target: "timing",
      payload: {
        scope_kind: "current_level",
        adjustment_type: {
          status: "identified",
          value: "rebalance",
          evidence: ["message.copy_forward_current_level"],
        },
        reason: {
          status: "identified",
          value: "context_changed",
          evidence: ["message.copy_forward_current_level"],
        },
        reason_change: {
          status: "identified",
          value: "time_or_capacity_changed",
          evidence: ["message.copy_forward_current_level"],
        },
        change_target: {
          status: "identified",
          value: "timing",
          evidence: ["message.copy_forward_current_level"],
        },
        constraints: {
          status: "identified",
          values: [
            "extend_current_level_same_plan",
            "copy_forward_level_one_week",
            "preserve_action_content",
            "preserve_cadence",
          ],
          evidence: ["message.copy_forward_current_level"],
        },
        affected_items: {
          status: "identified",
          values: ["niveau actuel"],
          evidence: ["message.copy_forward_current_level"],
        },
      },
    };
  }
  const structuredInput = intent?.operation_input ?? intent?.payload_hint ??
    intent?.slots;
  if (
    structuredInput && typeof structuredInput === "object" &&
    !Array.isArray(structuredInput)
  ) return structuredInput as Record<string, unknown>;
  if (intent?.adjust_plan_scope === "current_level") {
    return {
      target_granularity: {
        status: "identified",
        value: "current_level",
        confidence: intent.confidence_band === "high" ? "high" : "medium",
        evidence: [intent.target_hint ?? "turn_frame.adjust_plan_scope"],
        negative_evidence: intent.rejected_operations ?? [],
      },
      scope: {
        status: "identified",
        kind: "current_level",
        label: intent.target_hint ?? "niveau actuel",
        evidence: [intent.target_hint ?? "turn_frame.adjust_plan_scope"],
      },
      rejected_operations: intent.rejected_operations ?? [],
    };
  }
  if (intent?.adjust_plan_scope === "whole_plan") {
    return {
      target_granularity: {
        status: "identified",
        value: "whole_plan",
        confidence: intent.confidence_band === "high" ? "high" : "medium",
        evidence: [intent.target_hint ?? "turn_frame.adjust_plan_scope"],
        negative_evidence: intent.rejected_operations ?? [],
      },
      scope: {
        status: "identified",
        kind: "whole_plan",
        label: intent.target_hint ?? "plan global",
        evidence: [intent.target_hint ?? "turn_frame.adjust_plan_scope"],
      },
      rejected_operations: intent.rejected_operations ?? [],
    };
  }
  if (
    /\b(plan global|plan complet|tout le plan|whole plan|trajectoire|objectif global|direction globale|revoir le plan|refaire le plan|reorganiser le plan|réorganiser le plan)\b/
      .test(text) &&
    /\b(brouillon|proposition|prepare|prépare|ajuste|ajuster|change|changer|modifie|modifier|revoir|refaire|reorganise|réorganise|applique|appliquer)\b/
      .test(text)
  ) {
    const wholePlanConstraints = [
      "whole_plan_directional_draft_ready",
      "preserve_plan_intent",
      ...(/\b(2|deux)\s+actions?\s+(maximum|max|au plus)|\bmaximum\s+(2|deux)\s+actions?\b/
          .test(text)
        ? ["max_two_actions_next_step"]
        : []),
    ];
    return {
      target_granularity: {
        status: "identified",
        value: "whole_plan",
        confidence: "high",
        evidence: ["message.explicit_whole_plan_adjustment"],
        negative_evidence: [],
      },
      scope: {
        status: "identified",
        kind: "whole_plan",
        label: "plan global",
        evidence: ["message.explicit_whole_plan_adjustment"],
      },
      constraints: wholePlanConstraints,
      adjustment_type: "resequence",
      reason: "bad_fit",
      reason_change: "structure_bad_fit",
      change_target: "sequence",
      payload: {
        scope_kind: "whole_plan",
        adjustment_type: {
          status: "identified",
          value: "resequence",
          evidence: ["message.explicit_whole_plan_adjustment"],
        },
        reason: {
          status: "identified",
          value: "bad_fit",
          evidence: ["message.explicit_whole_plan_adjustment"],
        },
        reason_change: {
          status: "identified",
          value: "structure_bad_fit",
          evidence: ["message.explicit_whole_plan_adjustment"],
        },
        change_target: {
          status: "identified",
          value: "sequence",
          evidence: ["message.explicit_whole_plan_adjustment"],
        },
        constraints: {
          status: "identified",
          values: wholePlanConstraints,
          evidence: ["message.explicit_whole_plan_adjustment"],
        },
        affected_items: {
          status: "identified",
          values: ["plan global"],
          evidence: ["message.explicit_whole_plan_adjustment"],
        },
      },
    };
  }
  if (
    /\b(niveau actuel|ce niveau|niveau en cours|semaine prochaine|organisation de la semaine)\b/
      .test(text) &&
    /\b(brouillon|proposition|prepare|prépare|ajuste|ajuster|change|changer|modifie|modifier|revoir|reorganise|réorganise|applique|appliquer|prolonge|prolonger)\b/
      .test(text)
  ) {
    return {
      target_granularity: {
        status: "identified",
        value: "current_level",
        confidence: "medium",
        evidence: ["message.explicit_current_level_adjustment"],
        negative_evidence: [],
      },
      scope: {
        status: "identified",
        kind: "current_level",
        label: "niveau actuel",
        evidence: ["message.explicit_current_level_adjustment"],
      },
    };
  }
  return null;
}

function isExplicitWeeklyReviewExit(message: string): boolean {
  const text = normalizeRouteText(message);
  return /\b(stop|arrete|arrête|pause|plus tard|sors du bilan|sortir du bilan|autre sujet|je veux parler d autre chose)\b/
    .test(text) ||
    /\boublie\s+(ca|ça|le bilan|ce bilan|la revue|ce point)\b/.test(text);
}

export function shouldKeepWeeklyAdaptiveReviewInConversation(args: {
  activeSkillState: unknown;
  tempMemory?: unknown;
  routeDecision: RouteDecision | null;
  turnFrame?: TurnFrame | null;
  userMessage: string;
}): boolean {
  if (
    !weeklyAdaptiveReviewStateForTurn({
      activeSkillState: args.activeSkillState,
      tempMemory: args.tempMemory,
    })
  ) return false;
  if (isExplicitWeeklyReviewExit(args.userMessage)) return false;
  if (hasPendingOrActiveAdjustPlanOperation(args.tempMemory)) return false;
  if (
    weeklyReviewAllowsAdjustPlanBridge({
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
      userMessage: args.userMessage,
      history: null,
    })
  ) return false;
  const owner = args.routeDecision?.response_owner;
  return owner === "tool_skill" || owner === "product_help";
}

export function hasPendingOrActiveAdjustPlanOperation(
  tempMemory: unknown,
): boolean {
  const frame = loadAdjustPlanFrameFromTempMemory(tempMemory);
  if (frame.pending_draft_review || frame.pending_confirmation) return true;
  if (
    String(frame.active_intake?.operation_type ?? "").trim() ===
      "adjust_plan_item"
  ) return true;
  return isPendingAdjustPlanItemRecommendationOperation(
    frame.pending_recommendation,
  );
}

export function weeklyReviewAllowsAdjustPlanBridge(args: {
  routeDecision: RouteDecision | null;
  turnFrame?: TurnFrame | null;
  userMessage: string;
  history?: any[] | null;
}): boolean {
  if (isEarlyWeeklyPlanningValidationRequest(args.userMessage)) return false;
  if (
    isExplicitPendingApplyConfirmation(args.userMessage) &&
    (isWeeklyMissionCarryOverRequest(args.userMessage) ||
      weeklyMissionCarryOverContext({
        userMessage: args.userMessage,
        history: args.history,
      }) ||
      isCopyForwardWeeklyRequest(args.userMessage) ||
      isWeeklyLightRepeatRequest(args.userMessage))
  ) return true;
  if (
    !isExplicitWeeklyAdjustPlanRequest(args.userMessage) &&
    !operationInputFromPlanAdjustmentScope(
      args.userMessage,
      args.turnFrame ?? null,
    )
  ) return false;
  if (
    operationInputFromPlanAdjustmentScope(
      args.userMessage,
      args.turnFrame ?? null,
    )
  ) return true;
  if (args.routeDecision?.response_owner !== "tool_skill") return false;
  if (
    String(args.routeDecision?.selected_handler ?? "").trim() !==
      "adjust_plan_item"
  ) return false;
  if (isExplicitWeeklyAdjustPlanRequest(args.userMessage)) return true;
  return Boolean(
    args.turnFrame?.tool_skill_intents?.some((intent) =>
      String(intent?.operation_type ?? "").trim() === "adjust_plan_item" &&
      intent.explicitness === "explicit" &&
      (intent.user_intent === "adjust" || intent.user_intent === "update") &&
      intent.ambiguity !== "intent_ambiguous" &&
      intent.ambiguity !== "both"
    ),
  );
}

export function isExplicitWeeklyAdjustPlanRequest(message: string): boolean {
  const text = normalizeRouteText(message);
  const copyForwardRequest = isCopyForwardWeeklyRequest(message);
  const draftRequest = isExplicitWeeklyAdjustPlanDraftRequest(message);
  if (
    /\b(si je demande|si on demande|tu peux|est ce que tu peux|peux tu|possible de|capacite|capable)\b/
      .test(text)
  ) return false;
  if (
    /\b(ne l['’ ]applique pas|n['’ ]applique pas|ne change rien|rien appliquer|pas maintenant|pas tout de suite|juste comprendre|explique moi|resume moi|tu proposes quoi|proposes quoi)\b/
      .test(text) && !copyForwardRequest && !draftRequest
  ) return false;
  if (
    /\b(pas besoin de changer (les )?actions?|pas changer (les )?actions?|ne change pas (les )?actions?|sans changer (les )?actions?|pas besoin de changer (le )?niveau|pas changer (le )?niveau|ne change pas (le )?niveau|sans changer (le )?niveau)\b/
      .test(text) && !copyForwardRequest
  ) return false;
  return copyForwardRequest || draftRequest ||
    /\b(applique|appliquer|confirme|valide|valider|change|changer|modifie|modifier|ajuste|ajuster|alleger|allege|all[eé]ge|simplifie|simplifier|reduis|reduit|retire|supprime|remplace|reorganise|réorganise)\b/
        .test(text) &&
      /\b(organisation|semaine|plan|niveau|bloc|action|mission|habitude|charge|rythme|modification|ajustement|respiration|pause)\b/
        .test(text);
}

function isExplicitWeeklyAdjustPlanDraftRequest(message: string): boolean {
  const text = normalizeRouteText(message);
  return /\b(brouillon|proposition|prepare|prépare|propose une version|version propre)\b/
    .test(text) &&
    /\b(plan global|plan complet|tout le plan|niveau actuel|semaine prochaine|organisation|action|mission|habitude|rythme|charge)\b/
      .test(text);
}

export function isVagueWholePlanWeeklyAdjustmentRequest(
  message: string,
  operationInput?: Record<string, unknown> | null,
): boolean {
  const scopeKind = String((operationInput as any)?.scope?.kind ?? "").trim();
  const target = String(
    (operationInput as any)?.target_granularity?.value ?? "",
  ).trim();
  if (scopeKind !== "whole_plan" && target !== "whole_plan") return false;
  const text = normalizeRouteText(message);
  const asksWholePlan =
    /\b(plan global|plan complet|tout le plan|trajectoire|objectif global|direction globale)\b/
      .test(text);
  const vagueFit =
    /\b(ne colle plus|colle plus|ne va plus|plus adapte|plus coherent|pas coherent|ne fait plus sens|fait plus sens)\b/
      .test(text);
  const hasConcreteDirection =
    /\b(avant|apres|après|ordre|reordonner|réordonner|reorganiser|réorganiser|deux actions|2 actions|maximum|ajoute|retire|supprime|remplace|plus lent|plus rapide|moins lourd|plus leger|plus léger|phase|etape|étape)\b/
      .test(text);
  return asksWholePlan && vagueFit && !hasConcreteDirection;
}

export function weeklyBridgeDoesNotApplyDirectly(): true {
  return true;
}
