import type { RunSkillInput } from "../_shared/skill_helpers.ts";
import { baseOutput } from "../_shared/skill_helpers.ts";
import { emptyConversationEffects } from "../_shared/conversation_skill_contract.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import type { LocalOneShotDirectEffectRequest } from "../../router/one_shot_local_direct_effect.ts";
import { selectDirectEffectConfirmationContext } from "../../router/direct_effect_local_context.ts";
import { visibleRecentMessages } from "../_shared/visible_history.ts";
import {
  type CoachingRecommendationLocalDispatcher,
  initialCoachingRecommendationStateFromParentBridge,
  normalizeCoachingRecommendationLocalDispatcherOutput,
  readCoachingRecommendationState,
  reduceCoachingRecommendationLocalDispatcherOutput,
  runCoachingRecommendationLocalDispatcher,
} from "./local_flow.ts";
import type { CoachingRecommendationLocalState } from "./contract.ts";
import type {
  CoachingFeatureSuggestion,
  CoachingRecommendationDecision,
  CoachingVisibleDecision,
  CoachingVisibleStepContext,
} from "./contract.ts";
import {
  type CoachingRecommendationVisibleAgent,
  type CoachingVisibleAgentOutput,
  runCoachingRecommendationVisibleAgent,
} from "./visible_agents/router.ts";

export type CoachingRecommendationRunSkillInput = RunSkillInput & {
  local_dispatcher?: CoachingRecommendationLocalDispatcher;
  visible_agent?: CoachingRecommendationVisibleAgent;
  direct_effect_executor?: (
    request: LocalOneShotDirectEffectRequest,
  ) => Promise<{ turn_frame: TurnFrame | null } | null>;
};

function dispatcherSignalContext(input: CoachingRecommendationRunSkillInput) {
  return input.context.turn_frame.skill_signals.coaching_recommendation
    ?.context ?? null;
}

function directEffectLane(turnFrame: TurnFrame | null) {
  const lane = (turnFrame as any)?.direct_effect_lane;
  return lane && typeof lane === "object" && !Array.isArray(lane)
    ? lane as Record<string, unknown>
    : null;
}

function recentMessagesForVisible(
  input: CoachingRecommendationRunSkillInput,
) {
  return visibleRecentMessages({
    recent_messages: input.context.recent_messages,
    user_message: input.user_message,
  });
}

function initialStateFromDispatcherSignal(
  input: CoachingRecommendationRunSkillInput,
): CoachingRecommendationLocalState | null {
  const context = dispatcherSignalContext(input);
  if (!context) return null;
  return {
    stage: "understand_need",
    user_need_summary: context.reason || null,
    candidate_features: [],
    current_recommendation: null,
    secondary_recommendation: null,
    unresolved_question: null,
    last_answer_summary: null,
    parent_flow_id: null,
    parent_return_focus: null,
    parent_action_context: null,
    parent_state_summary: null,
    coaching_type: context.coaching_type === "plan_action"
      ? "plan_action"
      : context.coaching_type === "no_plan_action"
      ? "no_plan_action"
      : context.coaching_type === "emotional"
      ? "emotional"
      : "unclear",
    coaching_type_confidence:
      input.context.turn_frame.skill_signals.coaching_recommendation
          ?.confidence_band === "high"
        ? "high"
        : input.context.turn_frame.skill_signals.coaching_recommendation
            ?.confidence_band === "medium"
        ? "medium"
        : "low",
    coaching_type_evidence: [context.reason].filter(Boolean),
    pending_type_change: null,
    dispatcher_signal_context: context,
    difficulty: null,
    cause_analysis: null,
    recommendation_decision: null,
    last_visible_task_kind: null,
    turn_count: 0,
    max_turns: 4,
  };
}

function fallbackDecision(userMessage: string) {
  return normalizeCoachingRecommendationLocalDispatcherOutput({
    flow_action: "continue_clarifying_need" as const,
    confidence: "low" as const,
    risk_score: 0,
    coaching_intent: {
      kind: "unclear" as const,
      summary: userMessage,
    },
    target_switch: {
      status: "none" as const,
      to_coaching_type: null,
      target: null,
    },
    feature_candidates: [],
    recommendation: {
      primary_feature: null,
      secondary_feature: null,
      why_primary: null,
      user_facing_next_step: null,
    },
    state_updates: {
      stage: "understand_need" as const,
      status: "active" as const,
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: "change_confirm_coaching_type" as const,
      instruction: "Clarifier le type de coaching attendu.",
      conversation_context: {
        state_summary: "Need clarification for Sophia feature recommendation.",
        coaching_category: null,
        failure_mode: null,
        action_context: null,
        priority_features: [],
        known_values: {},
        missing_or_weak_values: ["primary_blocker"],
        candidate_features: [],
        recommendation: {
          primary_feature: null,
          secondary_feature: null,
          why_primary: null,
          user_facing_next_step: null,
        },
        tone_constraints: ["short"],
        do_not_say: [],
        evidence_used: [userMessage].filter(Boolean),
      },
    },
    note_information: null,
    exit_memo: {
      needed: false,
      reason: "none" as const,
      user_intent_summary: null,
      local_flow_context: {
        skill_id: "coaching_recommendation" as const,
        stage: null,
        user_need_summary: null,
        candidate_features: [],
        current_recommendation: null,
        last_answer_summary: null,
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "unknown" as const,
        why: null,
      },
    },
    evidence: [userMessage].filter(Boolean),
  });
}

function normalizeVisibleOutput(
  raw: CoachingVisibleAgentOutput | string | null,
): CoachingVisibleAgentOutput {
  if (typeof raw === "string") {
    return { message: raw.trim(), visible_decision: null };
  }
  return {
    message: String(raw?.message ?? "").trim(),
    visible_decision: raw?.visible_decision ?? null,
  };
}

function visibleDecisionForStep(
  decision: CoachingVisibleDecision | null,
  step: CoachingVisibleStepContext,
): CoachingVisibleDecision | null {
  if (!decision) return null;
  if (step.task_kind === "action_plan_coaching") {
    return decision.lever === "attack_card" ||
        decision.lever === "defense_card" ||
        decision.lever === "adjust_plan" ||
        decision.lever === "coaching_only"
      ? decision
      : null;
  }
  if (step.task_kind === "no_plan_coaching") {
    if (decision.lever === "attack_card") {
      return { ...decision, lever: "free_attack_card" };
    }
    if (decision.lever === "defense_card") {
      return { ...decision, lever: "free_defense_card" };
    }
    return decision.lever === "free_attack_card" ||
        decision.lever === "free_defense_card" ||
        decision.lever === "coaching_only"
      ? decision
      : null;
  }
  if (step.task_kind === "emotion_coaching") {
    return decision.lever === "state_potion" ||
        decision.lever === "coaching_only"
      ? decision
      : null;
  }
  return null;
}

function featureFromVisibleDecision(
  decision: CoachingVisibleDecision | null,
): CoachingFeatureSuggestion | null {
  if (!decision) return null;
  if (
    decision.lever === "attack_card" || decision.lever === "free_attack_card"
  ) {
    return "attack_card";
  }
  if (
    decision.lever === "defense_card" ||
    decision.lever === "free_defense_card"
  ) {
    return "defense_card";
  }
  if (decision.lever === "adjust_plan") return "adjust_plan";
  if (decision.lever === "state_potion") return "state_potion";
  return null;
}

function destinationForVisibleDecision(
  decision: CoachingVisibleDecision,
): CoachingRecommendationDecision["platform_destination"] {
  if (decision.lever === "free_attack_card") {
    return {
      label: "carte d'attaque libre",
      surface_hint: "Dashboard > Ressources",
      user_facing_destination:
        "surface=Dashboard > Ressources; object_type=carte d'attaque libre; relation_to_plan=hors_plan; user_action=ouvrir Ressources puis choisir ou creer ce type de carte",
    };
  }
  if (decision.lever === "free_defense_card") {
    return {
      label: "carte de defense libre",
      surface_hint: "Dashboard > Ressources",
      user_facing_destination:
        "surface=Dashboard > Ressources; object_type=carte de defense libre; relation_to_plan=hors_plan; user_action=ouvrir Ressources puis choisir ou creer ce type de carte",
    };
  }
  if (decision.lever === "attack_card") {
    return {
      label: "carte d'attaque",
      surface_hint: "Dashboard > Plan",
      user_facing_destination:
        "surface=Dashboard > Plan; anchor=action_concernee; object_type=carte d'attaque liee au Plan; user_action=ouvrir l'action concernee puis preparer la carte",
    };
  }
  if (decision.lever === "defense_card") {
    return {
      label: "carte de defense",
      surface_hint: "Dashboard > Plan",
      user_facing_destination:
        "surface=Dashboard > Plan; anchor=action_concernee; object_type=carte de defense liee au Plan; user_action=ouvrir l'action concernee puis preparer la carte",
    };
  }
  if (decision.lever === "adjust_plan") {
    return {
      label: "ajustement du plan",
      surface_hint: "Dashboard > Plan",
      user_facing_destination:
        "surface=Dashboard > Plan; anchor=action_concernee ou page Plan; object_type=ajustement du plan; user_action=ouvrir l'action ou la page Plan selon ce qui doit etre ajuste",
    };
  }
  if (decision.lever === "state_potion") {
    return {
      label: "potion",
      surface_hint: "Dashboard > Ressources",
      user_facing_destination:
        "surface=Dashboard > Ressources; section=Potions; object_type=potion; relation_to_plan=hors_plan; user_action=ouvrir Ressources puis aller dans la section Potions",
    };
  }
  return {
    label: null,
    surface_hint: null,
    user_facing_destination: null,
  };
}

function applyVisibleDecisionToState(args: {
  state: CoachingRecommendationLocalState | null;
  decision: CoachingVisibleDecision | null;
  step: CoachingVisibleStepContext;
}): CoachingRecommendationLocalState | null {
  const decision = visibleDecisionForStep(args.decision, args.step);
  if (!args.state || !decision) return args.state;
  if (decision.lever === "coaching_only") {
    return {
      ...args.state,
      last_answer_summary: decision.reason,
      last_visible_decision: decision,
    };
  }
  const feature = featureFromVisibleDecision(decision);
  const candidate = feature
    ? {
      feature,
      fit: decision.confidence,
      why: decision.reason,
      destination_hint: destinationForVisibleDecision(decision).surface_hint,
    }
    : null;
  const previousDecision = args.state.recommendation_decision;
  return {
    ...args.state,
    candidate_features: candidate ? [candidate] : [],
    current_recommendation: candidate,
    secondary_recommendation: null,
    last_answer_summary: decision.reason,
    recommendation_decision: previousDecision
      ? {
        ...previousDecision,
        primary_feature: feature,
        secondary_feature: null,
        why_primary: decision.reason,
        platform_destination: destinationForVisibleDecision(decision),
        user_facing_next_step: previousDecision.user_facing_next_step,
      }
      : feature
      ? {
        primary_feature: feature,
        secondary_feature: null,
        why_primary: decision.reason,
        why_not_others: {},
        platform_destination: destinationForVisibleDecision(decision),
        user_facing_next_step: null,
      }
      : null,
    last_visible_decision: decision,
  };
}

function shouldKeepActiveAfterVisibleDecision(args: {
  reducedStatus: "continue" | "complete" | "exit";
  previous: CoachingRecommendationLocalState | null;
  decision: CoachingVisibleDecision | null;
  step: CoachingVisibleStepContext;
}): boolean {
  if (args.reducedStatus !== "complete" || !args.previous) return false;
  if (args.previous.parent_flow_id) return false;
  const decision = visibleDecisionForStep(args.decision, args.step);
  return Boolean(featureFromVisibleDecision(decision));
}

function stateBaseForVisibleDecision(args: {
  reducedStatus: "continue" | "complete" | "exit";
  reducedState: CoachingRecommendationLocalState | null;
  previous: CoachingRecommendationLocalState | null;
  decision: CoachingVisibleDecision | null;
  step: CoachingVisibleStepContext;
}): CoachingRecommendationLocalState | null {
  const decision = visibleDecisionForStep(args.decision, args.step);
  if (args.reducedState) {
    if (decision?.lever === "coaching_only" && args.previous) {
      return {
        ...args.reducedState,
        candidate_features: args.previous.candidate_features,
        current_recommendation: args.previous.current_recommendation,
        secondary_recommendation: args.previous.secondary_recommendation,
        recommendation_decision: args.previous.recommendation_decision,
      };
    }
    return args.reducedState;
  }
  if (
    !shouldKeepActiveAfterVisibleDecision({
      reducedStatus: args.reducedStatus,
      previous: args.previous,
      decision,
      step: args.step,
    })
  ) {
    return null;
  }
  return {
    ...args.previous!,
    stage: "followup",
    last_visible_task_kind: args.step.task_kind,
    turn_count: Math.min(
      args.previous!.max_turns,
      (args.previous!.turn_count ?? 0) + 1,
    ),
  };
}

export async function runCoachingRecommendationSkill(
  input: CoachingRecommendationRunSkillInput,
) {
  const inboundNote = (input.context as any).note_information ?? null;
  const previous = readCoachingRecommendationState(
    input.context.active_skill_working_state,
  ) ?? initialCoachingRecommendationStateFromParentBridge(inboundNote) ??
    initialStateFromDispatcherSignal(input);
  const dispatcher = input.local_dispatcher ??
    runCoachingRecommendationLocalDispatcher;
  const decision = await dispatcher({
    user_id: input.context.user_id,
    request_id: (input.context.turn_frame as any)?.source_message_id ?? null,
    user_message: input.user_message,
    recent_messages: input.context.recent_messages,
    previous_state: previous,
    active_plan_items: input.context.plan_items,
    inbound_note_information: inboundNote,
    turn_frame: input.context.turn_frame,
    dispatcher_signal_context: dispatcherSignalContext(input),
  }) ?? fallbackDecision(input.user_message);
  const reduced = reduceCoachingRecommendationLocalDispatcherOutput({
    previous,
    output: decision,
    userMessage: input.user_message,
    dispatcherSignalContext: dispatcherSignalContext(input),
  });
  if (reduced.status === "exit") {
    // P0-1 (ALEX-CPR-B01): un direct effect explicite demandé AU TOUR de
    // sortie ne se perd jamais — la lane s'exécute AVANT de rendre la main au
    // dispatcher global. Le return court-circuitait le writer (rappel jamais
    // écrit) pendant que le contexte de confirmation re-présentait un
    // committed du ledger → « c'est noté » fantôme.
    if (
      input.direct_effect_executor && decision.direct_effect_request?.requested
    ) {
      await input.direct_effect_executor(decision.direct_effect_request);
    }
    return baseOutput("coaching_recommendation", {
      status: reduced.status,
      response_intent: reduced.reason_code,
      reply: "",
      diagnosis: {
        local_flow: true,
        reason_code: reduced.reason_code,
        reducer: reduced.diagnosis,
        note_information: reduced.note_information,
      },
      operation_suggestions: [],
      memory_write_candidates: [],
      effects: reduced.effects,
      state_patch: {
        coaching_recommendation_local_state: null,
        coaching_recommendation_note_information: reduced.note_information,
      },
    });
  }
  let turnFrameForVisible = input.context.turn_frame;
  if (
    input.direct_effect_executor && decision.direct_effect_request.requested
  ) {
    const directEffectResult = await input.direct_effect_executor(
      decision.direct_effect_request,
    );
    turnFrameForVisible = directEffectResult?.turn_frame ?? turnFrameForVisible;
  }
  const visibleAgent = input.visible_agent ??
    runCoachingRecommendationVisibleAgent;
  const recentDirectEffectConfirmationContext =
    input.context.runtime_context?.recent_direct_effect_confirmation_context ??
      null;
  const visibleOutput = normalizeVisibleOutput(
    await visibleAgent({
      user_id: input.context.user_id,
      request_id: (input.context.turn_frame as any)?.source_message_id ??
        null,
      visible_runtime_context: {
        recent_messages: recentMessagesForVisible(input),
        recent_effects_summary:
          input.context.runtime_context?.recent_effects_summary ?? null,
        user_identity: input.context.runtime_context?.user_identity ?? null,
        // F3: le visible agent recoit la liste reelle des actions actives —
        // fin du « je n'ai pas la liste, colle ton plan » (rose-r5 T3).
        active_plan_items: (input.context.plan_items ?? [])
          .slice(0, 16)
          .map((item: Record<string, unknown>) => ({
            title: String(item?.title ?? ""),
            status: String(item?.status ?? "active"),
            dimension: String(item?.dimension ?? "") || null,
            recent_checks: Array.isArray(item?.recent_checks)
              ? (item.recent_checks as Array<Record<string, unknown>>)
                .map((check) => ({
                  effective_at: String(check?.effective_at ?? "") || null,
                  outcome: String(check?.outcome ?? "") || null,
                }))
              : [],
          }))
          .filter((item: { title: string }) => item.title),
      },
      flow_context: {
        ...reduced.flow_context,
        direct_effect_lane: directEffectLane(turnFrameForVisible),
        direct_effect_confirmation_context:
          selectDirectEffectConfirmationContext({
            turnFrame: turnFrameForVisible,
            reducedContext: reduced.flow_context
              .direct_effect_confirmation_context,
            recentContext: recentDirectEffectConfirmationContext,
          }),
      },
      step_context: reduced.step_context,
    }),
  );
  const stateBase = stateBaseForVisibleDecision({
    reducedStatus: reduced.status,
    reducedState: reduced.local_state,
    previous,
    decision: visibleOutput.visible_decision,
    step: reduced.step_context,
  });
  const stateWithVisibleDecision = applyVisibleDecisionToState({
    state: stateBase,
    decision: visibleOutput.visible_decision,
    step: reduced.step_context,
  });
  const outputStatus = shouldKeepActiveAfterVisibleDecision({
      reducedStatus: reduced.status,
      previous,
      decision: visibleOutput.visible_decision,
      step: reduced.step_context,
    })
    ? "continue"
    : reduced.status;
  return baseOutput("coaching_recommendation", {
    status: outputStatus,
    response_intent: reduced.reason_code,
    reply: visibleOutput.message,
    diagnosis: {
      local_flow: true,
      reason_code: reduced.reason_code,
      reducer: reduced.diagnosis,
      visible_task: reduced.visible_task,
      visible_decision: stateWithVisibleDecision?.last_visible_decision ??
        null,
      note_information: reduced.note_information,
    },
    operation_suggestions: [],
    memory_write_candidates: [],
    effects: emptyConversationEffects(),
    state_patch: {
      coaching_recommendation_local_state: stateWithVisibleDecision,
      coaching_recommendation_note_information: reduced.note_information,
    },
  });
}
