import {
  createNoteInformation,
  normalizeNoteInformation,
  type NoteInformation,
} from "../../contracts/note_information.v1.ts";
import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import {
  isCoachingRecommendationBridgeNote,
} from "../../../_shared/coaching_parent_bridge.ts";
import {
  directEffectLocalDispatcherPromptLines,
  directEffectTimeContextFromTurnFrame,
  withDirectEffectLocalContext,
} from "../../router/direct_effect_local_context.ts";
import {
  LOCAL_ONE_SHOT_DIRECT_EFFECT_EXPECTED_JSON_SHAPE,
  localOneShotDirectEffectPromptLines,
  normalizeLocalOneShotDirectEffectRequest,
} from "../../router/one_shot_local_direct_effect.ts";
import { getProductHelpFeature } from "../product_help/retrieval.ts";
import type { CoachingRecommendationCategory } from "../../contracts/turn_frame.v1.ts";
import type {
  CoachingCauseAnalysis,
  CoachingDifficulty,
  CoachingFeatureCandidate,
  CoachingFeatureProductGuidance,
  CoachingFeatureSuggestion,
  CoachingIntentKind,
  CoachingRecommendationConversationContext,
  CoachingRecommendationDecision,
  CoachingRecommendationFlowAction,
  CoachingRecommendationFlowContext,
  CoachingRecommendationLocalDispatcherOutput,
  CoachingRecommendationLocalState,
  CoachingRecommendationReducerResult,
  CoachingRecommendationVisibleTaskKind,
  CoachingTargetSwitch,
  CoachingType,
  CoachingVisibleStepContext,
} from "./contract.ts";

const FEATURES = new Set<CoachingFeatureSuggestion>([
  "adjust_plan",
  "attack_card",
  "defense_card",
  "state_potion",
]);

const COACHING_FEATURE_CATALOG_IDS: Record<CoachingFeatureSuggestion, string> =
  {
    adjust_plan: "plan.adjustment",
    attack_card: "resources.attack_card",
    defense_card: "resources.defense_card",
    state_potion: "resources.potions",
  };

const FLOW_ACTIONS = new Set<CoachingRecommendationFlowAction>([
  "continue_clarifying_need",
  "compare_features",
  "recommend_feature",
  "answer_followup",
  "close_flow",
  "exit_to_global_dispatcher",
]);

const INTENTS = new Set<CoachingIntentKind>([
  "stuck_action",
  "forgetting",
  "avoidance",
  "risk_moment",
  "plan_misaligned",
  "feature_choice",
  "preference_request",
  "general_support",
  "off_topic",
  "safety",
  "unclear",
]);

const VISIBLE_TASKS = new Set<CoachingRecommendationVisibleTaskKind>([
  "change_confirm_coaching_type",
  "emotion_coaching",
  "no_plan_coaching",
  "action_plan_coaching",
  "ask_difficulty_clarification",
  "explain_cause",
  "ask_need_clarification",
  "compare_features",
  "recommend_feature",
  "free_action_coaching",
  "explain_platform_destination",
  "answer_followup",
  "close_recommendation",
  "exit_ack",
]);

const TARGET_SWITCH_STATUSES = new Set<CoachingTargetSwitch["status"]>([
  "none",
  "explicit",
  "ambiguous",
]);

const TARGET_SWITCH_KINDS = new Set<
  NonNullable<CoachingTargetSwitch["target"]>["kind"]
>([
  "plan_action",
  "free_action",
  "emotional_state",
]);

const TARGET_SWITCH_SOURCES = new Set<
  NonNullable<CoachingTargetSwitch["target"]>["source"]
>([
  "plan",
  "free",
  "none",
  "ambiguous",
]);

export type CoachingRecommendationLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  previous_state: CoachingRecommendationLocalState | null;
  active_plan_items: Array<Record<string, unknown>>;
  inbound_note_information?: NoteInformation | null;
  turn_frame?: unknown;
  dispatcher_signal_context?: CoachingRecommendationLocalState[
    "dispatcher_signal_context"
  ];
};

export type CoachingRecommendationLocalDispatcher = (
  input: CoachingRecommendationLocalDispatcherInput,
) => Promise<CoachingRecommendationLocalDispatcherOutput | null>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function withoutLegacyPayloadFields(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const { constraints: _constraints, user_words: _userWords, ...rest } = value;
  return rest;
}

function text(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max);
}

function stringArray(value: unknown, max = 8): string[] {
  return Array.isArray(value)
    ? value.map((item) => text(item, 160)).filter(Boolean).slice(0, max)
    : [];
}

function confidence(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
}

function fit(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "medium";
}

function riskScore(value: unknown): number {
  const score = Number(value ?? 0);
  return Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
}

function parseObject(raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) return raw;
  const source = text(raw, 50_000);
  const unfenced = source.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "")
    .trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("coaching_recommendation_not_json");
  }
  const parsed = JSON.parse(unfenced.slice(start, end + 1));
  if (!isRecord(parsed)) throw new Error("coaching_recommendation_not_object");
  return parsed;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: Set<T>,
  fallback: T,
): T {
  const candidate = text(value);
  return allowed.has(candidate as T) ? candidate as T : fallback;
}

function feature(value: unknown): CoachingFeatureSuggestion | null {
  const candidate = text(value);
  return FEATURES.has(candidate as CoachingFeatureSuggestion)
    ? candidate as CoachingFeatureSuggestion
    : null;
}

function normalizeCandidate(value: unknown): CoachingFeatureCandidate | null {
  if (!isRecord(value)) return null;
  const normalized = feature(value.feature);
  if (!normalized) return null;
  return {
    feature: normalized,
    fit: fit(value.fit),
    why: text(value.why, 240),
    destination_hint: text(value.destination_hint, 180) || null,
  };
}

function uniqueCandidates(
  values: unknown,
): CoachingFeatureCandidate[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const candidates: CoachingFeatureCandidate[] = [];
  for (const value of values) {
    const candidate = normalizeCandidate(value);
    if (!candidate || seen.has(candidate.feature)) continue;
    seen.add(candidate.feature);
    candidates.push(candidate);
  }
  return candidates.slice(0, 4);
}

function targetKindFromContext(
  context: CoachingRecommendationLocalState["dispatcher_signal_context"],
): CoachingDifficulty["target_kind"] {
  if (context?.coaching_type === "emotional") {
    return "emotional_state";
  }
  if (context?.coaching_type === "plan_action") return "plan_action";
  if (context?.coaching_type === "no_plan_action") return "free_action";
  return "unclear";
}

function coachingTypeFromContext(
  context: CoachingRecommendationLocalState["dispatcher_signal_context"],
): CoachingType {
  if (context?.coaching_type === "plan_action") return "plan_action";
  if (context?.coaching_type === "no_plan_action") return "no_plan_action";
  if (context?.coaching_type === "emotional") return "emotional";
  if (context?.coaching_type === "ambiguous") return "unclear";
  return "unclear";
}

function normalizeCoachingType(
  value: unknown,
  fallback: CoachingType,
): CoachingType {
  const raw = text(value);
  return raw === "plan_action" || raw === "no_plan_action" ||
      raw === "emotional" || raw === "unclear"
    ? raw
    : fallback;
}

function nullableCoachingType(value: unknown): CoachingType | null {
  const raw = normalizeCoachingType(value, "unclear");
  return raw === "unclear" && text(value) !== "unclear" ? null : raw;
}

function targetKind(value: unknown): NonNullable<
  CoachingTargetSwitch["target"]
>["kind"] {
  const raw = text(value);
  return TARGET_SWITCH_KINDS.has(
      raw as NonNullable<
        CoachingTargetSwitch["target"]
      >["kind"],
    )
    ? raw as NonNullable<CoachingTargetSwitch["target"]>["kind"]
    : null;
}

function targetSource(value: unknown): NonNullable<
  CoachingTargetSwitch["target"]
>["source"] {
  return enumValue(
    value,
    TARGET_SWITCH_SOURCES,
    "none",
  );
}

function defaultTargetSwitch(): CoachingTargetSwitch {
  return {
    status: "none",
    to_coaching_type: null,
    target: null,
  };
}

function normalizeTargetSwitch(raw: unknown): CoachingTargetSwitch {
  const root = isRecord(raw) ? raw : {};
  const status = enumValue(
    root.status,
    TARGET_SWITCH_STATUSES,
    "none",
  );
  if (status === "none") return defaultTargetSwitch();
  const targetRoot = isRecord(root.target) ? root.target : {};
  const target = {
    kind: targetKind(targetRoot.kind),
    title: text(targetRoot.title, 180) || null,
    source: targetSource(targetRoot.source),
    plan_item_id: text(targetRoot.plan_item_id, 120) || null,
  };
  return {
    status,
    to_coaching_type: nullableCoachingType(root.to_coaching_type),
    target,
  };
}

function targetSwitchTypeMatchesTarget(
  targetSwitch: CoachingTargetSwitch,
): boolean {
  if (targetSwitch.status === "none") return true;
  if (!targetSwitch.to_coaching_type || !targetSwitch.target?.kind) {
    return false;
  }
  return (
    targetSwitch.to_coaching_type === "plan_action" &&
      targetSwitch.target.kind === "plan_action" ||
    targetSwitch.to_coaching_type === "no_plan_action" &&
      targetSwitch.target.kind === "free_action" ||
    targetSwitch.to_coaching_type === "emotional" &&
      targetSwitch.target.kind === "emotional_state"
  );
}

function targetSwitchHasSufficientTarget(
  targetSwitch: CoachingTargetSwitch,
): boolean {
  if (targetSwitch.status === "none") return false;
  if (!targetSwitchTypeMatchesTarget(targetSwitch)) return false;
  if (
    targetSwitch.to_coaching_type === "plan_action" &&
    targetSwitch.target?.source !== "plan"
  ) return false;
  if (
    targetSwitch.to_coaching_type === "no_plan_action" &&
    targetSwitch.target?.source !== "free"
  ) return false;
  if (targetSwitch.to_coaching_type === "emotional") {
    return Boolean(targetSwitch.target?.title);
  }
  return Boolean(targetSwitch.target?.title);
}

function confidenceScore(value: "low" | "medium" | "high"): number {
  if (value === "high") return 0.9;
  if (value === "medium") return 0.7;
  return 0.45;
}

function categoryForCoachingType(
  coachingType: Exclude<CoachingType, "unclear">,
): CoachingRecommendationCategory {
  if (coachingType === "plan_action") return "plan_action_coaching";
  if (coachingType === "no_plan_action") return "free_action_coaching";
  return "emotional_state_coaching";
}

function targetSwitchSignalContext(args: {
  targetSwitch: CoachingTargetSwitch;
  base: CoachingRecommendationLocalState["dispatcher_signal_context"];
  confidence: "low" | "medium" | "high";
}): CoachingRecommendationLocalState["dispatcher_signal_context"] {
  const { targetSwitch } = args;
  if (
    targetSwitch.status === "none" ||
    !targetSwitch.to_coaching_type ||
    targetSwitch.to_coaching_type === "unclear" ||
    !targetSwitch.target
  ) return null;
  const coachingType = targetSwitch.to_coaching_type;
  const title = targetSwitch.target.title;
  const actionContext = coachingType === "emotional" ? null : {
    source: targetSwitch.target.source,
    plan_item_id: targetSwitch.target.plan_item_id,
    action_title: title,
  };
  return {
    coaching_type: coachingType === "emotional"
      ? "emotional"
      : coachingType === "plan_action"
      ? "plan_action"
      : "no_plan_action",
    confidence: Math.max(
      signalConfidenceValue(args.base) ?? 0,
      confidenceScore(args.confidence),
    ),
    action_context: actionContext,
    reason: `explicit target switch to ${coachingType}${
      title ? `: ${title}` : ""
    }`,
  };
}

function targetSwitchConflictsWithContext(args: {
  targetSwitch: CoachingTargetSwitch;
  context: CoachingRecommendationLocalState["dispatcher_signal_context"];
}): boolean {
  if (args.targetSwitch.status === "none" || !args.context) return false;
  const contextType = coachingTypeFromContext(args.context);
  if (contextType === "unclear" || !args.targetSwitch.to_coaching_type) {
    return false;
  }
  if (contextType !== args.targetSwitch.to_coaching_type) {
    const confidence = signalConfidenceValue(args.context);
    return confidence !== null && confidence >= 0.75;
  }
  return false;
}

function sameCoachingSignalTarget(
  left: CoachingRecommendationLocalState["dispatcher_signal_context"],
  right: CoachingRecommendationLocalState["dispatcher_signal_context"],
): boolean {
  if (!left || !right) return false;
  const leftAction = left.action_context ?? null;
  const rightAction = right.action_context ?? null;
  return coachingTypeFromContext(left) === coachingTypeFromContext(right) &&
    (leftAction?.source ?? null) === (rightAction?.source ?? null) &&
    (leftAction?.plan_item_id ?? null) ===
      (rightAction?.plan_item_id ?? null) &&
    (leftAction?.action_title ?? null) ===
      (rightAction?.action_title ?? null);
}

function effectiveCoachingType(args: {
  previous: CoachingRecommendationLocalState | null;
  context: CoachingRecommendationLocalState["dispatcher_signal_context"];
}): CoachingType {
  return args.previous?.coaching_type ??
    coachingTypeFromContext(args.context);
}

function actionSourceFromContext(
  context: CoachingRecommendationLocalState["dispatcher_signal_context"],
): CoachingDifficulty["action_source"] {
  const source = context?.action_context?.source;
  return source === "plan" || source === "free" || source === "none" ||
      source === "ambiguous"
    ? source
    : "ambiguous";
}

function causeFromFailureMode(
  context: CoachingRecommendationLocalState["dispatcher_signal_context"],
): CoachingCauseAnalysis["primary_cause"] {
  if (
    context?.coaching_type === "emotional"
  ) {
    return "emotional_overload";
  }
  return "unclear";
}

function isPlanAdjustmentFailure(
  failure: unknown,
): boolean {
  return failure === "too_hard" || failure === "rhythm_mismatch" ||
    failure === "misaligned_action";
}

function categoryFromCoachingType(
  coachingType: CoachingType,
):
  | "plan_action_coaching"
  | "free_action_coaching"
  | "emotional_state_coaching"
  | "ambiguous_coaching_need" {
  return coachingType === "plan_action"
    ? "plan_action_coaching"
    : coachingType === "no_plan_action"
    ? "free_action_coaching"
    : coachingType === "emotional"
    ? "emotional_state_coaching"
    : "ambiguous_coaching_need";
}

function hasConcretePlanActionContext(args: {
  context: CoachingRecommendationLocalState["dispatcher_signal_context"];
  state: CoachingRecommendationLocalState | null;
}): boolean {
  const action = args.context?.action_context ?? null;
  if (action?.source !== "plan") return false;
  return Boolean(
    text(action.plan_item_id) ||
      text(action.action_title) ||
      text(args.state?.parent_action_context?.plan_item_id) ||
      text(args.state?.parent_action_context?.plan_id),
  );
}

function canUseAdjustPlan(args: {
  context: CoachingRecommendationLocalState["dispatcher_signal_context"];
  state: CoachingRecommendationLocalState | null;
}): boolean {
  return hasConcretePlanActionContext(args);
}

const PLAN_BOUND_FEATURES = new Set<CoachingFeatureSuggestion>([
  "adjust_plan",
  "attack_card",
  "defense_card",
]);

const NO_PLAN_ALLOWED_FEATURES = new Set<CoachingFeatureSuggestion>([
  "attack_card",
  "defense_card",
]);

function isNoPlanAllowedFeature(
  featureName: CoachingFeatureSuggestion | null | undefined,
): featureName is "attack_card" | "defense_card" {
  return Boolean(featureName && NO_PLAN_ALLOWED_FEATURES.has(featureName));
}

function isPlanBoundFeature(
  featureName: CoachingFeatureSuggestion | null | undefined,
): boolean {
  return Boolean(featureName && PLAN_BOUND_FEATURES.has(featureName));
}

function signalConfidenceValue(
  context: CoachingRecommendationLocalState["dispatcher_signal_context"],
): number | null {
  const value = context?.confidence;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function needsCoachingTypeConfirmation(args: {
  context: CoachingRecommendationLocalState["dispatcher_signal_context"];
  hasPlanBoundAction: boolean;
}): boolean {
  const { context } = args;
  if (!context) return true;
  if (context.coaching_type === "ambiguous") return true;
  if (context.coaching_type === "plan_action") {
    return !args.hasPlanBoundAction;
  }
  if (context.coaching_type === "no_plan_action") {
    return !(
      context.action_context?.source === "free" &&
      Boolean(text(context.action_context.action_title))
    );
  }
  if (context.coaching_type === "emotional") return false;
  return true;
}

function isClearIncomingCoachingSignal(args: {
  context: CoachingRecommendationLocalState["dispatcher_signal_context"];
  incomingType: CoachingType;
  hasPlanBoundAction: boolean;
}): boolean {
  if (!args.context || args.incomingType === "unclear") return false;
  const confidence = signalConfidenceValue(args.context);
  if (confidence !== null && confidence < 0.75) return false;
  const needsConfirmation = needsCoachingTypeConfirmation({
    context: args.context,
    hasPlanBoundAction: args.hasPlanBoundAction,
  });
  if (needsConfirmation) return false;
  if (args.incomingType === "plan_action") {
    return args.hasPlanBoundAction;
  }
  if (args.incomingType === "no_plan_action") {
    return args.context.action_context?.source === "free";
  }
  if (args.incomingType === "emotional") {
    return args.context.coaching_type === "emotional";
  }
  return false;
}

/**
 * A dispatcher exit is "coherent" when the dispatcher committed to leaving per
 * its own exit invariant: visible_task.kind=exit_ack and no active coaching
 * recommendation/candidates left behind. Such an exit is a real, autonomous
 * decision (durable preference/memory, autonomous product, status, new tool,
 * frame refusal) and must be trusted. Incoherent "exits" that still carry a
 * coaching recommendation/candidates are LLM noise / disguised target
 * variations and stay subject to the active-flow anti-flapping guard.
 */
function isCoherentDispatcherExit(
  output: CoachingRecommendationLocalDispatcherOutput,
): boolean {
  if (output.flow_action !== "exit_to_global_dispatcher") return false;
  if (output.visible_task.kind !== "exit_ack") return false;
  const rec = output.recommendation;
  const hasActiveRecommendation = Boolean(
    rec?.primary_feature || rec?.secondary_feature,
  );
  const hasCandidates = (output.feature_candidates?.length ?? 0) > 0;
  return !hasActiveRecommendation && !hasCandidates;
}

function shouldPreserveDispatcherExit(args: {
  output: CoachingRecommendationLocalDispatcherOutput;
  selectedType?: CoachingType | null;
  incomingSignalIsClear?: boolean;
  hasPlanBoundAction?: boolean;
  previousExists?: boolean;
}): boolean {
  if (args.output.flow_action !== "exit_to_global_dispatcher") return false;
  if (
    args.output.coaching_intent.kind === "safety" || args.output.risk_score >= 7
  ) {
    return true;
  }
  if (isCoherentDispatcherExit(args.output)) {
    return true;
  }
  if (args.output.coaching_intent.kind !== "off_topic") return false;
  const initialTurnInScope = args.previousExists !== true &&
    (args.hasPlanBoundAction === true ||
      args.selectedType === "no_plan_action" ||
      args.selectedType === "emotional");
  const clearInScope = initialTurnInScope ||
    args.incomingSignalIsClear === true &&
      (args.selectedType === "no_plan_action" ||
        args.selectedType === "emotional" ||
        args.selectedType === "plan_action" &&
          args.hasPlanBoundAction === true);
  return !clearInScope;
}

function keepCoachingFlowActive(
  output: CoachingRecommendationLocalDispatcherOutput,
  flowAction: Exclude<
    CoachingRecommendationFlowAction,
    "exit_to_global_dispatcher" | "close_flow"
  > = "answer_followup",
): CoachingRecommendationLocalDispatcherOutput {
  return {
    ...output,
    flow_action: output.flow_action === "exit_to_global_dispatcher"
      ? flowAction
      : output.flow_action,
    coaching_intent: {
      ...output.coaching_intent,
      kind: output.coaching_intent.kind === "off_topic"
        ? "feature_choice"
        : output.coaching_intent.kind,
    },
    state_updates: {
      ...output.state_updates,
      status: "active",
      close_after_visible: false,
    },
    note_information: null,
  };
}

function reducerDiagnosis(args: {
  originalOutput: CoachingRecommendationLocalDispatcherOutput;
  output: CoachingRecommendationLocalDispatcherOutput;
  previous: CoachingRecommendationLocalState | null;
  flowContext: CoachingRecommendationFlowContext;
  visibleTask: CoachingRecommendationVisibleTaskKind;
}): CoachingRecommendationReducerResult["diagnosis"] {
  return {
    flow_action: args.output.flow_action,
    visible_task: args.visibleTask,
    target_switch: args.output.target_switch,
    previous_coaching_type: args.previous?.coaching_type ?? null,
    candidate_coaching_type: args.flowContext.candidate_coaching_type ?? null,
    target_switch_applied: args.output.target_switch.status === "explicit" &&
      args.output.target_switch.to_coaching_type !== null &&
      args.output.target_switch.to_coaching_type !== "unclear" &&
      args.flowContext.coaching_type ===
        args.output.target_switch.to_coaching_type,
    exit_rejected_reason:
      args.originalOutput.flow_action === "exit_to_global_dispatcher" &&
        args.output.flow_action !== "exit_to_global_dispatcher"
        ? "active_flow_non_critical_exit_blocked"
        : null,
  };
}

function noPlanUserFacingNextStep(
  featureName: "attack_card" | "defense_card" | null,
): string {
  if (featureName === "attack_card") {
    return "Prepare la carte comme aide libre, sans la rattacher a une action du Plan.";
  }
  if (featureName === "defense_card") {
    return "Prepare la protection du moment difficile comme aide libre, sans la rattacher a une action du Plan.";
  }
  return "Choisis le premier geste concret et fais seulement celui-la.";
}

function defaultDifficulty(args: {
  dispatcherSignalContext: CoachingRecommendationLocalState[
    "dispatcher_signal_context"
  ];
  summary?: string | null;
}): CoachingDifficulty {
  const action = args.dispatcherSignalContext?.action_context ?? null;
  return {
    target_kind: targetKindFromContext(args.dispatcherSignalContext),
    summary: args.summary || args.dispatcherSignalContext?.reason || null,
    action_title: action?.action_title ?? null,
    action_source: actionSourceFromContext(args.dispatcherSignalContext),
  };
}

function defaultCauseAnalysis(args: {
  dispatcherSignalContext: CoachingRecommendationLocalState[
    "dispatcher_signal_context"
  ];
  why?: string | null;
  missingInfo?: string[];
}): CoachingCauseAnalysis {
  return {
    primary_cause: causeFromFailureMode(args.dispatcherSignalContext),
    why_it_exists: args.why || args.dispatcherSignalContext?.reason || null,
    confidence: args.dispatcherSignalContext ? "medium" : "low",
    missing_info: args.missingInfo ?? [],
  };
}

function platformDestinationFor(
  featureName: CoachingFeatureSuggestion | null,
  candidates: CoachingFeatureCandidate[],
): CoachingRecommendationDecision["platform_destination"] {
  const candidate = candidates.find((item) => item.feature === featureName);
  if (featureName === "attack_card") {
    return {
      label: "carte d'attaque",
      surface_hint: candidate?.destination_hint ?? "Cartes d'attaque",
      user_facing_destination:
        "object_type=carte d'attaque; user_action=utiliser la surface indiquee par surface_hint; relation_to_plan=selon coaching_type",
    };
  }
  if (featureName === "defense_card") {
    return {
      label: "carte de defense",
      surface_hint: candidate?.destination_hint ?? "Cartes de defense",
      user_facing_destination:
        "object_type=carte de defense; user_action=utiliser la surface indiquee par surface_hint; relation_to_plan=selon coaching_type",
    };
  }
  if (featureName === "adjust_plan") {
    return {
      label: "ajustement du plan",
      surface_hint: candidate?.destination_hint ?? "Plan",
      user_facing_destination:
        "object_type=ajustement du plan; user_action=ouvrir la surface Plan indiquee par surface_hint; relation_to_plan=plan",
    };
  }
  if (featureName === "state_potion") {
    return {
      label: "potion d'etat",
      surface_hint: candidate?.destination_hint ?? "Potions",
      user_facing_destination:
        "object_type=potion; user_action=utiliser la surface Ressources/Potions indiquee par surface_hint; relation_to_plan=hors_plan",
    };
  }
  return {
    label: null,
    surface_hint: null,
    user_facing_destination: null,
  };
}

function productGuidanceForFeature(
  featureName: CoachingFeatureSuggestion | null,
): CoachingFeatureProductGuidance | null {
  if (!featureName) return null;
  const catalogFeatureId = COACHING_FEATURE_CATALOG_IDS[featureName];
  const featureInfo = getProductHelpFeature(catalogFeatureId);
  if (!featureInfo) return null;
  return {
    feature: featureName,
    catalog_feature_id: featureInfo.id,
    label: featureInfo.label,
    explain: featureInfo.explain,
    how_to: featureInfo.how_to,
    locations: featureInfo.locations.map((location) => ({
      surface: location.surface,
      when_visible: location.when_visible,
      user_can_do: location.user_can_do,
    })),
    limits: featureInfo.limits,
    sophia_must_not_claim: featureInfo.sophia_must_not_claim,
  };
}

function coachingFeatureProductGuidanceCatalog(): Partial<
  Record<CoachingFeatureSuggestion, CoachingFeatureProductGuidance>
> {
  return Object.fromEntries(
    [...FEATURES].map((featureName) => [
      featureName,
      productGuidanceForFeature(featureName),
    ]).filter((entry): entry is [
      CoachingFeatureSuggestion,
      CoachingFeatureProductGuidance,
    ] => Boolean(entry[1])),
  );
}

function normalizeProductGuidance(
  raw: unknown,
  fallback: Partial<
    Record<CoachingFeatureSuggestion, CoachingFeatureProductGuidance>
  >,
): Partial<Record<CoachingFeatureSuggestion, CoachingFeatureProductGuidance>> {
  const root = isRecord(raw) ? raw : {};
  const canonical = coachingFeatureProductGuidanceCatalog();
  const next = { ...canonical, ...fallback };
  for (const featureName of FEATURES) {
    const value = root[featureName];
    if (!isRecord(value)) continue;
    const canonicalForFeature = canonical[featureName];
    const locations = Array.isArray(value.locations)
      ? value.locations.slice(0, 3).filter(isRecord).map((location) => ({
        surface: text(location.surface),
        when_visible: text(location.when_visible),
        user_can_do: stringArray(location.user_can_do, 6),
      })).filter((location) => location.surface)
      : canonicalForFeature?.locations ?? [];
    next[featureName] = {
      feature: featureName,
      catalog_feature_id: text(value.catalog_feature_id) ||
        canonicalForFeature?.catalog_feature_id ||
        COACHING_FEATURE_CATALOG_IDS[featureName],
      label: text(value.label) || canonicalForFeature?.label || featureName,
      explain: text(value.explain, 900) || canonicalForFeature?.explain || "",
      how_to: text(value.how_to, 900) || canonicalForFeature?.how_to || "",
      locations,
      limits: stringArray(value.limits, 8).length > 0
        ? stringArray(value.limits, 8)
        : canonicalForFeature?.limits ?? [],
      sophia_must_not_claim: stringArray(value.sophia_must_not_claim, 8)
          .length > 0
        ? stringArray(value.sophia_must_not_claim, 8)
        : canonicalForFeature?.sophia_must_not_claim ?? [],
    };
  }
  return next;
}

function defaultRecommendationDecision(args: {
  recommendation: CoachingRecommendationLocalDispatcherOutput[
    "recommendation"
  ];
  candidates: CoachingFeatureCandidate[];
}): CoachingRecommendationDecision {
  const primary = args.recommendation.primary_feature;
  return {
    primary_feature: primary,
    secondary_feature: args.recommendation.secondary_feature,
    why_primary: args.recommendation.why_primary,
    why_not_others: {},
    platform_destination: platformDestinationFor(primary, args.candidates),
    user_facing_next_step: args.recommendation.user_facing_next_step,
  };
}

function normalizeDifficulty(
  raw: unknown,
  fallback: CoachingDifficulty,
): CoachingDifficulty {
  const root = isRecord(raw) ? raw : {};
  const targetKind = enumValue<CoachingDifficulty["target_kind"]>(
    root.target_kind,
    new Set(["plan_action", "free_action", "emotional_state", "unclear"]),
    fallback.target_kind,
  );
  const actionSource = enumValue<CoachingDifficulty["action_source"]>(
    root.action_source,
    new Set(["plan", "free", "none", "ambiguous"]),
    fallback.action_source,
  );
  return {
    target_kind: targetKind,
    summary: text(root.summary) || fallback.summary,
    action_title: text(root.action_title) || fallback.action_title,
    action_source: actionSource,
  };
}

function normalizeCauseAnalysis(
  raw: unknown,
  fallback: CoachingCauseAnalysis,
): CoachingCauseAnalysis {
  const root = isRecord(raw) ? raw : {};
  return {
    primary_cause: enumValue(
      root.primary_cause,
      new Set([
        "forgetting",
        "launch_blocker",
        "avoidance",
        "risk_moment",
        "too_hard",
        "rhythm_mismatch",
        "misaligned_action",
        "emotional_overload",
        "unclear",
      ]),
      fallback.primary_cause,
    ),
    why_it_exists: text(root.why_it_exists) || fallback.why_it_exists,
    confidence: confidence(root.confidence || fallback.confidence),
    missing_info: stringArray(root.missing_info, 8).length > 0
      ? stringArray(root.missing_info, 8)
      : fallback.missing_info,
  };
}

function normalizeRecommendationDecision(
  raw: unknown,
  fallback: CoachingRecommendationDecision,
): CoachingRecommendationDecision {
  const root = isRecord(raw) ? raw : {};
  const destination = isRecord(root.platform_destination)
    ? root.platform_destination
    : {};
  const whyNotOthers = isRecord(root.why_not_others)
    ? Object.fromEntries(
      Object.entries(root.why_not_others)
        .map(([key, value]) => [key, text(value, 240)])
        .filter(([key, value]) =>
          FEATURES.has(key as CoachingFeatureSuggestion) && value
        ),
    ) as Partial<Record<CoachingFeatureSuggestion, string>>
    : fallback.why_not_others;
  const primary = feature(root.primary_feature) ?? fallback.primary_feature;
  const secondaryRaw = feature(root.secondary_feature);
  const secondary = secondaryRaw && secondaryRaw !== primary
    ? secondaryRaw
    : fallback.secondary_feature;
  return {
    primary_feature: primary,
    secondary_feature: secondary,
    why_primary: text(root.why_primary) || fallback.why_primary,
    why_not_others: whyNotOthers,
    platform_destination: {
      label: text(destination.label) || fallback.platform_destination.label,
      surface_hint: text(destination.surface_hint) ||
        fallback.platform_destination.surface_hint,
      user_facing_destination: text(destination.user_facing_destination) ||
        fallback.platform_destination.user_facing_destination,
    },
    user_facing_next_step: text(root.user_facing_next_step) ||
      fallback.user_facing_next_step,
  };
}

function defaultConversationContext(
  patch: Partial<CoachingRecommendationConversationContext> = {},
): CoachingRecommendationConversationContext {
  return {
    state_summary: patch.state_summary ?? "",
    coaching_category: patch.coaching_category ?? null,
    failure_mode: patch.failure_mode ?? null,
    action_context: patch.action_context ?? null,
    priority_features: patch.priority_features ?? [],
    known_values: patch.known_values ?? {},
    missing_or_weak_values: patch.missing_or_weak_values ?? [],
    candidate_features: patch.candidate_features ?? [],
    recommendation: patch.recommendation ?? {
      primary_feature: null,
      secondary_feature: null,
      why_primary: null,
      user_facing_next_step: null,
    },
    tone_constraints: [
      ...new Set(["concise", "natural", ...(patch.tone_constraints ?? [])]),
    ],
    do_not_say: [
      ...new Set([
        "Ne dis jamais que Sophia a cree, modifie, programme ou enregistre quelque chose.",
        "Ne recommande jamais track_progress, track_progress_plan_item ou platform.",
        "Ne mentionne pas JSON, dispatcher, reducer, DB, note_information ou outil interne.",
        ...(patch.do_not_say ?? []),
      ]),
    ],
    evidence_used: patch.evidence_used ?? [],
  };
}

function normalizeConversationContext(
  raw: unknown,
  fallback: CoachingRecommendationConversationContext,
): CoachingRecommendationConversationContext {
  const root = isRecord(raw) ? raw : {};
  return defaultConversationContext({
    state_summary: text(root.state_summary) || fallback.state_summary,
    coaching_category: fallback.coaching_category,
    failure_mode: fallback.failure_mode,
    action_context: fallback.action_context,
    priority_features: fallback.priority_features,
    known_values: isRecord(root.known_values) ? root.known_values : {},
    missing_or_weak_values: stringArray(root.missing_or_weak_values, 8),
    candidate_features: uniqueCandidates(root.candidate_features),
    recommendation: fallback.recommendation,
    tone_constraints: stringArray(root.tone_constraints, 8),
    do_not_say: stringArray(root.do_not_say, 8),
    evidence_used: stringArray(root.evidence_used, 8),
  });
}

function defaultFlowContext(args: {
  dispatcherSignalContext: CoachingRecommendationLocalState[
    "dispatcher_signal_context"
  ];
  conversationContext: CoachingRecommendationConversationContext;
  recommendation: CoachingRecommendationLocalDispatcherOutput[
    "recommendation"
  ];
  candidates: CoachingFeatureCandidate[];
  evidence: string[];
}): CoachingRecommendationFlowContext {
  const difficulty = defaultDifficulty({
    dispatcherSignalContext: args.dispatcherSignalContext,
    summary: args.conversationContext.state_summary,
  });
  const cause = defaultCauseAnalysis({
    dispatcherSignalContext: args.dispatcherSignalContext,
    why: args.recommendation.why_primary,
    missingInfo: args.conversationContext.missing_or_weak_values,
  });
  return {
    coaching_type: coachingTypeFromContext(args.dispatcherSignalContext),
    candidate_coaching_type: null,
    coaching_type_reason: args.dispatcherSignalContext?.reason ?? null,
    dispatcher_signal_context: args.dispatcherSignalContext,
    direct_effect_lane: null,
    direct_effect_confirmation_context: null,
    product_guidance: coachingFeatureProductGuidanceCatalog(),
    difficulty,
    cause_analysis: cause,
    recommendation: defaultRecommendationDecision({
      recommendation: args.recommendation,
      candidates: args.candidates,
    }),
    evidence_used: args.evidence.length > 0
      ? args.evidence
      : args.conversationContext.evidence_used,
    missing_or_weak_values: args.conversationContext.missing_or_weak_values,
    tone_constraints: args.conversationContext.tone_constraints,
    do_not_say: args.conversationContext.do_not_say,
  };
}

function flowContextForAppliedTargetSwitch(args: {
  context: CoachingRecommendationLocalState["dispatcher_signal_context"];
  output: CoachingRecommendationLocalDispatcherOutput;
}): CoachingRecommendationFlowContext | undefined {
  if (!args.context) return undefined;
  const base = defaultFlowContext({
    dispatcherSignalContext: args.context,
    conversationContext: args.output.visible_task.conversation_context,
    recommendation: args.output.recommendation,
    candidates: args.output.feature_candidates,
    evidence: args.output.evidence,
  });
  return {
    ...base,
    coaching_type: coachingTypeFromContext(args.context),
    candidate_coaching_type: null,
    dispatcher_signal_context: args.context,
    difficulty: defaultDifficulty({
      dispatcherSignalContext: args.context,
      summary: args.output.coaching_intent.summary ||
        args.output.visible_task.conversation_context.state_summary,
    }),
    cause_analysis: defaultCauseAnalysis({
      dispatcherSignalContext: args.context,
      why: args.output.recommendation.why_primary ||
        args.output.coaching_intent.summary,
      missingInfo: args.output.visible_task.conversation_context
        .missing_or_weak_values,
    }),
    recommendation: defaultRecommendationDecision({
      recommendation: args.output.recommendation,
      candidates: args.output.feature_candidates,
    }),
    evidence_used: args.output.evidence.length
      ? args.output.evidence
      : [args.context.reason].filter(Boolean),
  };
}

function normalizeFlowContext(
  raw: unknown,
  fallback: CoachingRecommendationFlowContext,
): CoachingRecommendationFlowContext {
  const root = isRecord(raw) ? raw : {};
  const parentFlowId = text(root.parent_flow_id || fallback.parent_flow_id);
  return {
    coaching_type: normalizeCoachingType(
      root.coaching_type,
      fallback.coaching_type,
    ),
    candidate_coaching_type: "candidate_coaching_type" in root &&
        root.candidate_coaching_type !== null
      ? normalizeCoachingType(
        root.candidate_coaching_type,
        fallback.candidate_coaching_type ?? fallback.coaching_type,
      )
      : fallback.candidate_coaching_type,
    coaching_type_reason: text(root.coaching_type_reason) ||
      fallback.coaching_type_reason,
    parent_flow_id: parentFlowId === "daily_action_review_v1" ||
        parentFlowId === "weekly_adaptive_review_v1"
      ? parentFlowId
      : null,
    parent_return_focus: text(root.parent_return_focus) ||
      fallback.parent_return_focus || null,
    parent_action_context: isRecord(root.parent_action_context)
      ? root.parent_action_context
      : fallback.parent_action_context ?? null,
    parent_state_summary: text(root.parent_state_summary) ||
      fallback.parent_state_summary || null,
    dispatcher_signal_context: isRecord(root.dispatcher_signal_context)
      ? root.dispatcher_signal_context as CoachingRecommendationLocalState[
        "dispatcher_signal_context"
      ]
      : fallback.dispatcher_signal_context,
    direct_effect_lane: isRecord(root.direct_effect_lane)
      ? root.direct_effect_lane
      : fallback.direct_effect_lane ?? null,
    direct_effect_confirmation_context: isRecord(
        root.direct_effect_confirmation_context,
      )
      ? root.direct_effect_confirmation_context
      : fallback.direct_effect_confirmation_context ?? null,
    product_guidance: normalizeProductGuidance(
      root.product_guidance,
      fallback.product_guidance,
    ),
    difficulty: normalizeDifficulty(root.difficulty, fallback.difficulty),
    cause_analysis: normalizeCauseAnalysis(
      root.cause_analysis,
      fallback.cause_analysis,
    ),
    recommendation: normalizeRecommendationDecision(
      root.recommendation,
      fallback.recommendation,
    ),
    evidence_used: stringArray(root.evidence_used, 8).length > 0
      ? stringArray(root.evidence_used, 8)
      : fallback.evidence_used,
    missing_or_weak_values: stringArray(root.missing_or_weak_values, 8).length >
        0
      ? stringArray(root.missing_or_weak_values, 8)
      : fallback.missing_or_weak_values,
    tone_constraints: stringArray(root.tone_constraints, 8).length > 0
      ? stringArray(root.tone_constraints, 8)
      : fallback.tone_constraints,
    do_not_say: stringArray(root.do_not_say, 8).length > 0
      ? stringArray(root.do_not_say, 8)
      : fallback.do_not_say,
  };
}

function canonicalVisibleTaskKind(
  kind: CoachingRecommendationVisibleTaskKind,
): CoachingVisibleStepContext["task_kind"] {
  if (kind === "ask_need_clarification") return "ask_difficulty_clarification";
  if (kind === "compare_features") return "recommend_feature";
  if (kind === "free_action_coaching") return "no_plan_coaching";
  if (kind === "exit_ack") return kind;
  return kind;
}

function planItemIdFromFlowContext(
  flowContext: CoachingRecommendationFlowContext,
): string | null {
  return text(
    flowContext.dispatcher_signal_context?.action_context?.plan_item_id,
  ) ||
    null;
}

function noPlanCoachingMove(
  cause: CoachingCauseAnalysis["primary_cause"],
):
  | "clarify_outcome"
  | "first_step"
  | "avoidance_plan"
  | "risk_preparation"
  | "emotional_grounding" {
  return cause === "misaligned_action" || cause === "too_hard" ||
      cause === "rhythm_mismatch" || cause === "unclear"
    ? "clarify_outcome"
    : cause === "risk_moment"
    ? "risk_preparation"
    : cause === "avoidance"
    ? "avoidance_plan"
    : cause === "emotional_overload"
    ? "emotional_grounding"
    : "first_step";
}

function defaultStepContext(
  kind: CoachingRecommendationVisibleTaskKind,
  flowContext: CoachingRecommendationFlowContext,
  instruction = "",
): CoachingVisibleStepContext {
  const taskKind = canonicalVisibleTaskKind(kind);
  if (taskKind === "change_confirm_coaching_type") {
    const candidate = flowContext.candidate_coaching_type;
    return {
      task_kind: "change_confirm_coaching_type",
      objective: instruction ||
        "Confirmer le type de coaching avant de continuer.",
      current_coaching_type: flowContext.coaching_type,
      candidate_coaching_type: candidate,
      missing_or_weak_values: flowContext.missing_or_weak_values,
      confirmation_question: candidate
        ? "Je veux vérifier le cadre: tu veux qu'on traite ça comme ça maintenant ?"
        : "Tu veux qu'on traite ça comme une action de ton plan, une action hors plan, ou plutôt comme un état émotionnel ?",
    };
  }
  if (taskKind === "emotion_coaching") {
    return {
      task_kind: "emotion_coaching",
      objective: instruction || "Aider a choisir ou comprendre une potion.",
      state_hint: null,
      intensity: null,
      selected_feature: flowContext.recommendation.primary_feature ===
          "state_potion"
        ? "state_potion"
        : "state_potion",
      why_selected: flowContext.recommendation.why_primary ??
        flowContext.cause_analysis.why_it_exists,
      product_guidance: flowContext.product_guidance.state_potion ?? null,
    };
  }
  if (taskKind === "no_plan_coaching") {
    const actionSource = flowContext.difficulty.action_source === "free" ||
        flowContext.difficulty.action_source === "ambiguous" ||
        flowContext.difficulty.action_source === "none"
      ? flowContext.difficulty.action_source
      : "ambiguous";
    const move = noPlanCoachingMove(flowContext.cause_analysis.primary_cause);
    const selected = isNoPlanAllowedFeature(
        flowContext.recommendation.primary_feature,
      )
      ? flowContext.recommendation.primary_feature
      : null;
    const secondary = isNoPlanAllowedFeature(
        flowContext.recommendation.secondary_feature,
      ) && flowContext.recommendation.secondary_feature !== selected
      ? flowContext.recommendation.secondary_feature
      : null;
    return {
      task_kind: "no_plan_coaching",
      objective: instruction ||
        "Aider sur l'action hors plan avec coaching libre ou carte libre autorisee.",
      action_title: flowContext.difficulty.action_title,
      action_source: actionSource,
      cause: flowContext.cause_analysis.primary_cause,
      selected_feature: selected,
      secondary_feature: secondary,
      product_guidance: {
        attack_card: flowContext.product_guidance.attack_card,
        defense_card: flowContext.product_guidance.defense_card,
      },
      coaching_move: move,
      why_not_platform_feature:
        "Cette action n'est pas reliee a une action concrete du plan; adjust_plan et les cartes liees au Plan ne sont pas disponibles.",
      suggested_next_step: flowContext.recommendation.user_facing_next_step ??
        (move === "clarify_outcome"
          ? "clarifie le resultat attendu avant de continuer"
          : "choisis le premier geste concret et fais seulement celui-la"),
    };
  }
  if (taskKind === "action_plan_coaching") {
    const selected = flowContext.recommendation.primary_feature ===
        "state_potion"
      ? null
      : flowContext.recommendation.primary_feature;
    const secondary = flowContext.recommendation.secondary_feature ===
        "state_potion"
      ? null
      : flowContext.recommendation.secondary_feature;
    return {
      task_kind: "action_plan_coaching",
      objective: instruction || "Coacher une action concrete du plan.",
      plan_item_id: planItemIdFromFlowContext(flowContext) ?? "",
      action_title: flowContext.difficulty.action_title,
      selected_feature: selected,
      secondary_feature: secondary,
      why_selected: flowContext.recommendation.why_primary ??
        flowContext.cause_analysis.why_it_exists,
      platform_destination: flowContext.recommendation.platform_destination,
      product_guidance: {
        adjust_plan: flowContext.product_guidance.adjust_plan,
        attack_card: flowContext.product_guidance.attack_card,
        defense_card: flowContext.product_guidance.defense_card,
      },
    };
  }
  if (taskKind === "ask_difficulty_clarification") {
    const missing = flowContext.missing_or_weak_values.length > 0
      ? flowContext.missing_or_weak_values
      : flowContext.cause_analysis.missing_info;
    return {
      task_kind: "ask_difficulty_clarification",
      objective: instruction || "Clarifier la difficulte principale.",
      missing_fields: missing,
      known_values: {
        action_title: flowContext.difficulty.action_title,
        action_source: flowContext.difficulty.action_source,
        failure_mode: null,
      },
      question_goal: missing.length > 0
        ? `Clarifier ${missing[0]}.`
        : "Comprendre si le probleme vient de l'oubli, du demarrage, d'un moment de bascule ou d'une action trop lourde.",
      output_constraints: { max_questions: 1, no_recommendation: true },
    };
  }
  if (taskKind === "explain_cause") {
    return {
      task_kind: "explain_cause",
      objective: instruction || "Expliquer l'hypothese de cause.",
      difficulty_summary: flowContext.difficulty.summary ?? "",
      cause_hypothesis: flowContext.cause_analysis.why_it_exists ?? "",
      contrast_with_wrong_causes: Object.values(
        flowContext.recommendation.why_not_others,
      ).filter(Boolean),
    };
  }
  if (taskKind === "recommend_feature") {
    const primary = flowContext.recommendation.primary_feature ??
      "attack_card";
    return {
      task_kind: "recommend_feature",
      objective: instruction || "Recommander le levier choisi.",
      selected_feature: primary,
      secondary_feature: flowContext.recommendation.secondary_feature,
      why_selected: flowContext.recommendation.why_primary ??
        flowContext.cause_analysis.why_it_exists ?? "",
      why_not_others: flowContext.recommendation.why_not_others,
      priority_features: [],
    };
  }
  if (taskKind === "explain_platform_destination") {
    const featureName = flowContext.recommendation.primary_feature ??
      "attack_card";
    return {
      task_kind: "explain_platform_destination",
      objective: instruction || "Dire ou trouver le levier dans Sophia.",
      feature: featureName,
      destination_label:
        flowContext.recommendation.platform_destination.label ??
          featureName,
      user_facing_destination: flowContext.recommendation.platform_destination
        .user_facing_destination ??
        "dans Sophia",
      next_step: flowContext.recommendation.user_facing_next_step ??
        "ouvre l'espace correspondant et prepare ce levier toi-meme.",
      product_guidance: flowContext.product_guidance[featureName] ?? null,
    };
  }
  if (taskKind === "answer_followup" || taskKind === "close_recommendation") {
    return {
      task_kind: taskKind,
      objective: instruction ||
        (taskKind === "close_recommendation"
          ? "Clore la recommandation."
          : "Repondre au suivi sans changer la recommandation."),
      last_answer_summary: flowContext.recommendation.why_primary,
      current_recommendation: flowContext.recommendation,
    };
  }
  return {
    task_kind: taskKind,
    objective: instruction || "Faire une transition minimale.",
  };
}

function normalizeStepContext(
  raw: unknown,
  fallback: CoachingVisibleStepContext,
): CoachingVisibleStepContext {
  const root = isRecord(raw) ? raw : {};
  const rawKind = text(root.task_kind);
  const taskKind = rawKind
    ? canonicalVisibleTaskKind(rawKind as CoachingRecommendationVisibleTaskKind)
    : fallback.task_kind;
  if (taskKind !== fallback.task_kind) return fallback;
  // The local dispatcher owns the decision, but the reducer still normalizes
  // primitive text fields from the LLM when it provided a specialized context.
  return {
    ...fallback,
    objective: text(root.objective) || fallback.objective,
  } as CoachingVisibleStepContext;
}

export function readCoachingRecommendationState(
  activeSkillState: unknown,
): CoachingRecommendationLocalState | null {
  if (!isRecord(activeSkillState)) return null;
  if (activeSkillState.skill_id !== "coaching_recommendation") return null;
  const working = isRecord(activeSkillState.working_state)
    ? activeSkillState.working_state
    : activeSkillState;
  const local = isRecord(working.coaching_recommendation_local_state)
    ? working.coaching_recommendation_local_state
    : working;
  return normalizeStoredState(local);
}

function normalizeStoredState(
  value: unknown,
): CoachingRecommendationLocalState | null {
  if (!isRecord(value)) return null;
  const parentFlowId = text(value.parent_flow_id);
  return {
    stage: enumValue(
      value.stage,
      new Set([
        "understand_need",
        "compare_options",
        "recommend",
        "followup",
        "closing",
      ]),
      "understand_need",
    ),
    user_need_summary: text(value.user_need_summary) || null,
    candidate_features: uniqueCandidates(value.candidate_features),
    current_recommendation: normalizeCandidate(value.current_recommendation),
    secondary_recommendation: normalizeCandidate(
      value.secondary_recommendation,
    ),
    unresolved_question: text(value.unresolved_question) || null,
    last_answer_summary: text(value.last_answer_summary) || null,
    parent_flow_id: parentFlowId === "daily_action_review_v1" ||
        parentFlowId === "weekly_adaptive_review_v1"
      ? parentFlowId
      : null,
    parent_return_focus: text(value.parent_return_focus) || null,
    parent_action_context: isRecord(value.parent_action_context)
      ? value.parent_action_context
      : null,
    parent_state_summary: text(value.parent_state_summary) || null,
    coaching_type: normalizeCoachingType(
      value.coaching_type,
      coachingTypeFromContext(
        isRecord(value.dispatcher_signal_context)
          ? value.dispatcher_signal_context as CoachingRecommendationLocalState[
            "dispatcher_signal_context"
          ]
          : null,
      ),
    ),
    coaching_type_confidence: confidence(value.coaching_type_confidence),
    coaching_type_evidence: stringArray(value.coaching_type_evidence, 8),
    pending_type_change: isRecord(value.pending_type_change)
      ? {
        candidate_coaching_type: normalizeCoachingType(
          value.pending_type_change.candidate_coaching_type,
          "unclear",
        ),
        reason: text(value.pending_type_change.reason) || null,
      }
      : null,
    dispatcher_signal_context: isRecord(value.dispatcher_signal_context)
      ? value.dispatcher_signal_context as CoachingRecommendationLocalState[
        "dispatcher_signal_context"
      ]
      : null,
    difficulty: isRecord(value.difficulty)
      ? normalizeDifficulty(
        value.difficulty,
        defaultDifficulty({
          dispatcherSignalContext: null,
        }),
      )
      : null,
    cause_analysis: isRecord(value.cause_analysis)
      ? normalizeCauseAnalysis(
        value.cause_analysis,
        defaultCauseAnalysis({
          dispatcherSignalContext: null,
        }),
      )
      : null,
    recommendation_decision: isRecord(value.recommendation_decision)
      ? normalizeRecommendationDecision(value.recommendation_decision, {
        primary_feature: null,
        secondary_feature: null,
        why_primary: null,
        why_not_others: {},
        platform_destination: {
          label: null,
          surface_hint: null,
          user_facing_destination: null,
        },
        user_facing_next_step: null,
      })
      : null,
    last_visible_task_kind: text(
      value.last_visible_task_kind,
    ) as CoachingVisibleStepContext["task_kind"] || null,
    turn_count: Math.max(0, Number(value.turn_count ?? 0) || 0),
    max_turns: 4,
  };
}

function dispatcherSignalContextFromParentBridge(
  context: Record<string, unknown>,
): CoachingRecommendationLocalState["dispatcher_signal_context"] {
  const signal = context.dispatcher_signal_context;
  return isRecord(signal)
    ? signal as CoachingRecommendationLocalState["dispatcher_signal_context"]
    : null;
}

function confidenceBandFromSignal(
  context: CoachingRecommendationLocalState["dispatcher_signal_context"],
  fallback: unknown,
): "low" | "medium" | "high" {
  const score = signalConfidenceValue(context);
  if (score !== null) {
    if (score >= 0.8) return "high";
    if (score >= 0.55) return "medium";
    return "low";
  }
  const fallbackText = text(fallback);
  return fallbackText === "low" || fallbackText === "medium" ||
      fallbackText === "high"
    ? fallbackText
    : "medium";
}

export function initialCoachingRecommendationStateFromParentBridge(
  note: unknown,
): CoachingRecommendationLocalState | null {
  if (!isCoachingRecommendationBridgeNote(note)) return null;
  const context = isRecord(note.structured_context)
    ? note.structured_context
    : {};
  const parentFlowId = text(context.return_target || context.parent_flow_id);
  if (
    parentFlowId !== "daily_action_review_v1" &&
    parentFlowId !== "weekly_adaptive_review_v1"
  ) return null;
  const dispatcherSignalContext = dispatcherSignalContextFromParentBridge(
    context,
  );
  const incomingCoachingType = dispatcherSignalContext
    ? coachingTypeFromContext(dispatcherSignalContext)
    : "plan_action";
  const coachingType = incomingCoachingType === "unclear"
    ? "plan_action"
    : incomingCoachingType;
  const coachingTypeEvidence = [
    "parent_bridge",
    text(dispatcherSignalContext?.reason),
  ].filter(Boolean);
  return {
    stage: "understand_need",
    user_need_summary: text(context.user_message_summary) ||
      text(note.handoff_context_for_next_dispatcher) ||
      null,
    candidate_features: [],
    current_recommendation: null,
    secondary_recommendation: null,
    unresolved_question: null,
    last_answer_summary: null,
    parent_flow_id: parentFlowId,
    parent_return_focus: text(context.return_focus) || null,
    parent_action_context: isRecord(context.action_context)
      ? context.action_context
      : null,
    parent_state_summary: text(context.parent_state_summary) || null,
    coaching_type: coachingType,
    coaching_type_confidence: confidenceBandFromSignal(
      dispatcherSignalContext,
      (note as any)?.confidence,
    ),
    coaching_type_evidence: coachingTypeEvidence.length
      ? coachingTypeEvidence
      : ["parent_bridge"],
    pending_type_change: null,
    dispatcher_signal_context: dispatcherSignalContext,
    difficulty: dispatcherSignalContext
      ? defaultDifficulty({ dispatcherSignalContext })
      : null,
    cause_analysis: dispatcherSignalContext
      ? defaultCauseAnalysis({ dispatcherSignalContext })
      : null,
    recommendation_decision: null,
    last_visible_task_kind: null,
    turn_count: 0,
    max_turns: 4,
  };
}

function parentReturnContext(
  state: CoachingRecommendationLocalState | null,
): Record<string, unknown> | null {
  if (!state?.parent_flow_id) return null;
  return {
    parent_flow_id: state.parent_flow_id,
    return_focus: state.parent_return_focus,
    parent_action_context: state.parent_action_context,
    parent_state_summary: state.parent_state_summary,
  };
}

function noteForExit(args: {
  action: CoachingRecommendationFlowAction;
  outputNote: unknown;
  userMessage: string;
  summary: string;
  state: CoachingRecommendationLocalState | null;
  candidates: CoachingFeatureCandidate[];
  recommendation: CoachingRecommendationLocalDispatcherOutput["recommendation"];
  confidence: "low" | "medium" | "high";
  evidence: string[];
}): NoteInformation | null {
  const target = args.action === "exit_to_global_dispatcher" ? "global" : null;
  if (!target) return null;
  const structured_context = {
    user_message_summary: args.summary || args.userMessage,
    active_flow_summary:
      "coaching_recommendation helps choose a Sophia feature and never executes tools.",
    collected_state: {
      user_need_summary: args.state?.user_need_summary ?? args.summary,
      candidate_features: args.candidates,
      current_recommendation: args.recommendation.primary_feature,
      parent_context: parentReturnContext(args.state),
      dispatcher_signal_context: args.state?.dispatcher_signal_context ?? null,
    },
    unresolved_questions: args.state?.unresolved_question
      ? [args.state.unresolved_question]
      : [],
    recommended_next_focus: target,
    evidence: args.evidence,
  };
  const fallback = createNoteInformation({
    source_flow_id: "coaching_recommendation",
    handoff_reason: "topic_change",
    target_dispatcher: target,
    handoff_context_for_next_dispatcher: JSON.stringify(structured_context),
    user_words: [args.userMessage, ...args.evidence].filter(Boolean).slice(
      0,
      3,
    ),
    structured_context,
    confidence: args.confidence,
  });
  return isRecord(args.outputNote)
    ? normalizeNoteInformation(
      {
        ...args.outputNote,
        user_words: fallback.user_words,
        structured_context: withoutLegacyPayloadFields(
          isRecord(args.outputNote.structured_context)
            ? args.outputNote.structured_context
            : structured_context,
        ),
      },
      fallback,
    )
    : fallback;
}

function noteForParentReturn(args: {
  state: CoachingRecommendationLocalState | null;
  recommendation: CoachingRecommendationLocalDispatcherOutput[
    "recommendation"
  ];
  candidates: CoachingFeatureCandidate[];
  summary: string;
  userMessage: string;
  confidence: "low" | "medium" | "high";
  evidence: string[];
}): NoteInformation | null {
  if (!args.state?.parent_flow_id) return null;
  const primary = args.recommendation.primary_feature ??
    args.state.current_recommendation?.feature ??
    null;
  const secondary = args.recommendation.secondary_feature ??
    args.state.secondary_recommendation?.feature ??
    null;
  const structured_context = {
    bridge_kind: "coaching_recommendation_to_parent",
    recommended_feature: {
      primary,
      secondary,
    },
    why: args.recommendation.why_primary ||
      args.state.current_recommendation?.why ||
      args.summary,
    user_facing_next_step: args.recommendation.user_facing_next_step,
    no_mutation: true,
    return_focus: args.state.parent_return_focus,
    parent_action_context: args.state.parent_action_context,
    parent_state_summary: args.state.parent_state_summary,
    candidate_features: args.candidates,
    dispatcher_signal_context: args.state.dispatcher_signal_context,
    evidence: args.evidence,
  };
  return createNoteInformation({
    source_flow_id: "coaching_recommendation",
    handoff_reason: "clarification_resolved",
    target_dispatcher: args.state.parent_flow_id,
    handoff_context_for_next_dispatcher:
      `Coaching recommendation completed; return to ${args.state.parent_flow_id}.`,
    user_words: [args.userMessage, ...args.evidence].filter(Boolean).slice(
      0,
      3,
    ),
    structured_context,
    confidence: args.confidence,
  });
}

function visibleTaskWithoutPresetContexts(
  visibleTask: CoachingRecommendationLocalDispatcherOutput["visible_task"],
  patch:
    & Omit<
      Partial<CoachingRecommendationLocalDispatcherOutput["visible_task"]>,
      "conversation_context"
    >
    & {
      conversation_context?: Partial<CoachingRecommendationConversationContext>;
    } = {},
): CoachingRecommendationLocalDispatcherOutput["visible_task"] {
  return {
    ...visibleTask,
    ...patch,
    conversation_context: {
      ...visibleTask.conversation_context,
      ...(patch.conversation_context ?? {}),
    },
    flow_context: patch.flow_context,
    step_context: patch.step_context,
  };
}

function dispatcherContextForCategory(args: {
  category: CoachingRecommendationConversationContext["coaching_category"];
  base: CoachingRecommendationLocalState["dispatcher_signal_context"];
}): CoachingRecommendationLocalState["dispatcher_signal_context"] {
  if (!args.category) return args.base;
  const coachingType = args.category === "plan_action_coaching"
    ? "plan_action"
    : args.category === "free_action_coaching"
    ? "no_plan_action"
    : args.category === "emotional_state_coaching"
    ? "emotional"
    : "ambiguous";
  return {
    coaching_type: coachingType,
    confidence: args.base?.confidence ?? 0.8,
    action_context: args.category === "free_action_coaching"
      ? {
        source: "free",
        plan_item_id: null,
        action_title: args.base?.action_context?.action_title ?? null,
      }
      : args.category === "emotional_state_coaching"
      ? null
      : args.base?.action_context ?? null,
    reason: args.base?.reason ?? "",
  };
}

function stableRecommendationFeature(
  state: CoachingRecommendationLocalState | null,
): CoachingFeatureSuggestion | null {
  return state?.recommendation_decision?.primary_feature ??
    state?.current_recommendation?.feature ??
    null;
}

function candidateFromStableRecommendation(
  state: CoachingRecommendationLocalState,
): CoachingFeatureCandidate | null {
  const feature = stableRecommendationFeature(state);
  if (!feature) return null;
  return state.current_recommendation ?? {
    feature,
    fit: "high",
    why: state.recommendation_decision?.why_primary ??
      state.last_answer_summary ??
      "Recommandation stable du flow coaching.",
    destination_hint:
      state.recommendation_decision?.platform_destination.surface_hint ?? null,
  };
}

function previousCoachingCategory(
  type: CoachingType | undefined,
): CoachingRecommendationCategory | null {
  if (type === "plan_action") return "plan_action_coaching";
  if (type === "no_plan_action") return "free_action_coaching";
  if (type === "emotional") return "emotional_state_coaching";
  return null;
}

function visibleKindForStableRecommendation(
  type: CoachingType | undefined,
): CoachingRecommendationVisibleTaskKind | null {
  if (type === "plan_action") return "action_plan_coaching";
  if (type === "no_plan_action") return "no_plan_coaching";
  if (type === "emotional") return "emotion_coaching";
  return null;
}

function comparableTargetText(value: unknown): string | null {
  const normalized = text(value, 180).trim().toLocaleLowerCase("fr-FR");
  return normalized || null;
}

function sameCoachingSignalTargetIdentity(
  left: CoachingRecommendationLocalState["dispatcher_signal_context"],
  right: CoachingRecommendationLocalState["dispatcher_signal_context"],
): boolean {
  if (!left || !right) return false;
  if (coachingTypeFromContext(left) !== coachingTypeFromContext(right)) {
    return false;
  }
  const leftAction = left.action_context ?? null;
  const rightAction = right.action_context ?? null;
  if (leftAction || rightAction) {
    if ((leftAction?.source ?? null) !== (rightAction?.source ?? null)) {
      return false;
    }
    const leftPlanItemId = leftAction?.plan_item_id ?? null;
    const rightPlanItemId = rightAction?.plan_item_id ?? null;
    if (leftPlanItemId || rightPlanItemId) {
      return leftPlanItemId === rightPlanItemId;
    }
    return comparableTargetText(leftAction?.action_title) ===
      comparableTargetText(rightAction?.action_title);
  }
  return true;
}

function stableProductFollowupTargetSwitchAllowsGuard(args: {
  previous: CoachingRecommendationLocalState;
  output: CoachingRecommendationLocalDispatcherOutput;
}): boolean {
  const targetSwitch = args.output.target_switch;
  if (targetSwitch.status === "none") return true;
  if (targetSwitch.status !== "explicit") return false;
  if (!targetSwitchHasSufficientTarget(targetSwitch)) return false;
  if (
    !targetSwitch.to_coaching_type ||
    targetSwitch.to_coaching_type !== args.previous.coaching_type
  ) {
    return false;
  }
  const previousContext = args.previous.dispatcher_signal_context;
  if (!previousContext) return false;
  const switchContext = targetSwitchSignalContext({
    targetSwitch,
    base: previousContext,
    confidence: args.output.confidence,
  });
  return sameCoachingSignalTargetIdentity(switchContext, previousContext);
}

function stableProductFollowupContractError(args: {
  previous: CoachingRecommendationLocalState | null;
  output: CoachingRecommendationLocalDispatcherOutput;
}): string | null {
  const stableFeature = stableRecommendationFeature(args.previous);
  if (!args.previous || !stableFeature) return null;
  const previousType = args.previous.coaching_type;
  if (!previousType || previousType === "unclear") return null;
  if (
    !stableProductFollowupTargetSwitchAllowsGuard({
      previous: args.previous,
      output: args.output,
    })
  ) return null;
  if (args.output.visible_task.kind !== "change_confirm_coaching_type") {
    return null;
  }
  return "stable_recommendation_product_followup_cannot_use_change_confirm_coaching_type";
}

function enforceStableProductFollowupContract(args: {
  output: CoachingRecommendationLocalDispatcherOutput;
  previous: CoachingRecommendationLocalState;
}): CoachingRecommendationLocalDispatcherOutput {
  const stableDecision = args.previous.recommendation_decision;
  const stableFeature = stableRecommendationFeature(args.previous);
  const visibleKind = visibleKindForStableRecommendation(
    args.previous.coaching_type,
  );
  if (!stableDecision || !stableFeature || !visibleKind) return args.output;
  const stableCandidate = candidateFromStableRecommendation(args.previous);
  const candidates = stableCandidate ? [stableCandidate] : [];
  const recommendation = {
    primary_feature: stableFeature,
    secondary_feature: stableDecision.secondary_feature &&
        stableDecision.secondary_feature !== stableFeature
      ? stableDecision.secondary_feature
      : null,
    why_primary: stableDecision.why_primary ??
      args.previous.last_answer_summary ??
      null,
    user_facing_next_step: stableDecision.user_facing_next_step ??
      stableDecision.platform_destination.user_facing_destination ??
      null,
  };
  return {
    ...keepCoachingFlowActive(args.output, "answer_followup"),
    target_switch: {
      status: "none",
      to_coaching_type: null,
      target: null,
    },
    feature_candidates: candidates,
    recommendation,
    state_updates: {
      ...args.output.state_updates,
      stage: "followup",
      status: "active",
      close_after_visible: false,
    },
    visible_task: visibleTaskWithoutPresetContexts(args.output.visible_task, {
      kind: visibleKind,
      instruction:
        "Repondre a la question produit sur la feature deja recommandee sans reclarifier le type de coaching.",
      conversation_context: {
        coaching_category: previousCoachingCategory(
          args.previous.coaching_type,
        ),
        candidate_features: candidates,
        recommendation,
        missing_or_weak_values: [],
      },
    }),
  };
}

function enforceCoachingRecommendationContract(args: {
  output: CoachingRecommendationLocalDispatcherOutput;
  previous: CoachingRecommendationLocalState | null;
  dispatcherSignalContext?: CoachingRecommendationLocalState[
    "dispatcher_signal_context"
  ];
}): CoachingRecommendationLocalDispatcherOutput {
  if (
    args.output.flow_action === "close_flow" ||
    args.output.state_updates.close_after_visible ||
    args.output.state_updates.status === "closed"
  ) {
    return args.output;
  }
  const outputContext =
    args.output.visible_task.flow_context?.dispatcher_signal_context ?? null;
  const freshContext = args.dispatcherSignalContext ?? outputContext ?? null;
  const baseContext = freshContext ??
    args.previous?.dispatcher_signal_context ?? null;
  const targetSwitch = args.output.target_switch;
  const targetSwitchContext = targetSwitch.status === "explicit" &&
      targetSwitchHasSufficientTarget(targetSwitch) &&
      !targetSwitchConflictsWithContext({
        targetSwitch,
        context: freshContext,
      })
    ? targetSwitchSignalContext({
      targetSwitch,
      base: baseContext,
      confidence: args.output.confidence,
    })
    : null;
  const context = targetSwitchContext ?? baseContext;
  const appliedTargetSwitchFlowContext = targetSwitchContext
    ? flowContextForAppliedTargetSwitch({
      context: targetSwitchContext,
      output: args.output,
    })
    : undefined;
  const incomingType = coachingTypeFromContext(context);
  const previousType = args.previous?.coaching_type;
  const outputType = normalizeCoachingType(
    args.output.visible_task.flow_context?.coaching_type,
    coachingTypeFromContext(outputContext),
  );
  const hasPlanBoundAction = hasConcretePlanActionContext({
    context,
    state: args.previous,
  });
  const incomingSignalIsClear = isClearIncomingCoachingSignal({
    context,
    incomingType,
    hasPlanBoundAction,
  });
  if (
    args.previous &&
    stableProductFollowupContractError({
        previous: args.previous,
        output: args.output,
      }) !== null
  ) {
    return enforceStableProductFollowupContract({
      output: args.output,
      previous: args.previous,
    });
  }
  const resolvingTypeChange =
    args.previous?.last_visible_task_kind === "change_confirm_coaching_type" ||
    Boolean(args.previous?.pending_type_change);
  const shouldConfirmTargetSwitch = targetSwitch.status === "ambiguous" ||
    targetSwitch.status === "explicit" && !targetSwitchContext;
  if (shouldConfirmTargetSwitch) {
    const candidateType = targetSwitch.to_coaching_type &&
        targetSwitch.to_coaching_type !== "unclear"
      ? targetSwitch.to_coaching_type
      : incomingType !== "unclear"
      ? incomingType
      : null;
    return {
      ...keepCoachingFlowActive(args.output, "continue_clarifying_need"),
      feature_candidates: [],
      recommendation: {
        primary_feature: null,
        secondary_feature: null,
        why_primary: null,
        user_facing_next_step: null,
      },
      visible_task: visibleTaskWithoutPresetContexts(args.output.visible_task, {
        kind: "change_confirm_coaching_type",
        instruction: "Confirmer le changement de cible avant de continuer.",
        conversation_context: {
          coaching_category: context
            ? categoryFromCoachingType(coachingTypeFromContext(context))
            : null,
          candidate_features: [],
          recommendation: {
            primary_feature: null,
            secondary_feature: null,
            why_primary: null,
            user_facing_next_step: null,
          },
        },
        flow_context: {
          ...(args.output.visible_task.flow_context ?? {}),
          coaching_type: args.previous?.coaching_type ?? "unclear",
          candidate_coaching_type: candidateType,
          dispatcher_signal_context: context,
        } as CoachingRecommendationFlowContext,
      }),
    };
  }
  const shouldRejectNonCriticalActiveExit = Boolean(
    args.previous &&
      args.output.flow_action === "exit_to_global_dispatcher" &&
      !shouldPreserveDispatcherExit({
        output: args.output,
        selectedType: previousType ?? incomingType,
        incomingSignalIsClear,
        hasPlanBoundAction,
        previousExists: Boolean(args.previous),
      }) &&
      !targetSwitchContext &&
      (!freshContext ||
        sameCoachingSignalTarget(
          freshContext,
          args.previous.dispatcher_signal_context,
        )),
  );
  if (shouldRejectNonCriticalActiveExit) {
    const freshDispatcherSignalConfirmsSameTarget = Boolean(
      args.dispatcherSignalContext &&
        sameCoachingSignalTarget(
          args.dispatcherSignalContext,
          args.previous?.dispatcher_signal_context ?? null,
        ),
    );
    if (!freshDispatcherSignalConfirmsSameTarget) {
      return {
        ...keepCoachingFlowActive(args.output, "continue_clarifying_need"),
        feature_candidates: [],
        recommendation: {
          primary_feature: null,
          secondary_feature: null,
          why_primary: null,
          user_facing_next_step: null,
        },
        visible_task: visibleTaskWithoutPresetContexts(args.output.visible_task, {
          kind: "change_confirm_coaching_type",
          instruction:
            "Clarifier la nouvelle cible de coaching avant toute sortie.",
          conversation_context: {
            coaching_category: context
              ? categoryFromCoachingType(coachingTypeFromContext(context))
              : null,
            candidate_features: [],
            recommendation: {
              primary_feature: null,
              secondary_feature: null,
              why_primary: null,
              user_facing_next_step: null,
            },
          },
          flow_context: {
            ...(args.output.visible_task.flow_context ?? {}),
            coaching_type: args.previous?.coaching_type ?? "unclear",
            candidate_coaching_type: incomingType !== "unclear"
              ? incomingType
              : null,
            dispatcher_signal_context: context,
          } as CoachingRecommendationFlowContext,
        }),
      };
    }
    const previousRecommendation = args.previous?.recommendation_decision ?? {
      primary_feature: args.previous?.current_recommendation?.feature ?? null,
      secondary_feature: args.previous?.secondary_recommendation?.feature ??
        null,
      why_primary: args.previous?.current_recommendation?.why ?? null,
      why_not_others: {},
      platform_destination: {
        label: args.previous?.current_recommendation?.destination_hint ?? null,
        surface_hint: args.previous?.current_recommendation?.destination_hint ??
          null,
        user_facing_destination:
          args.previous?.current_recommendation?.destination_hint ?? null,
      },
      user_facing_next_step: null,
    };
    const previousVisibleKind = previousType === "plan_action"
      ? "action_plan_coaching"
      : previousType === "no_plan_action"
      ? "no_plan_coaching"
      : previousType === "emotional"
      ? "emotion_coaching"
      : "change_confirm_coaching_type";
    return {
      ...keepCoachingFlowActive(args.output, "answer_followup"),
      feature_candidates: args.previous?.candidate_features ?? [],
      recommendation: previousRecommendation,
      visible_task: visibleTaskWithoutPresetContexts(args.output.visible_task, {
        kind: previousVisibleKind,
        instruction:
          "Continuer le coaching actif; le dernier message reste dans le meme scope.",
        conversation_context: {
          coaching_category: context
            ? categoryFromCoachingType(coachingTypeFromContext(context))
            : null,
          candidate_features: args.previous?.candidate_features ?? [],
          recommendation: previousRecommendation,
        },
        flow_context: {
          ...(args.output.visible_task.flow_context ?? {}),
          coaching_type: args.previous?.coaching_type ?? "unclear",
          candidate_coaching_type: null,
          dispatcher_signal_context: context,
          recommendation: previousRecommendation,
        } as CoachingRecommendationFlowContext,
      }),
    };
  }
  if (
    !resolvingTypeChange &&
    previousType && incomingType !== "unclear" &&
    incomingType !== previousType &&
    !incomingSignalIsClear
  ) {
    return {
      ...keepCoachingFlowActive(args.output, "continue_clarifying_need"),
      feature_candidates: [],
      recommendation: {
        primary_feature: null,
        secondary_feature: null,
        why_primary: null,
        user_facing_next_step: null,
      },
      visible_task: visibleTaskWithoutPresetContexts(args.output.visible_task, {
        kind: "change_confirm_coaching_type",
        instruction:
          "Confirmer le changement de type de coaching avant de continuer.",
        conversation_context: {
          coaching_category: context
            ? categoryFromCoachingType(coachingTypeFromContext(context))
            : null,
          candidate_features: [],
          recommendation: {
            primary_feature: null,
            secondary_feature: null,
            why_primary: null,
            user_facing_next_step: null,
          },
        },
      }),
    };
  }
  const resolvedType = incomingType !== "unclear"
    ? incomingType
    : outputType !== "unclear"
    ? outputType
    : null;
  const selectedType = incomingSignalIsClear
    ? incomingType
    : resolvingTypeChange
    ? resolvedType ?? previousType ?? incomingType
    : previousType ?? resolvedType ?? incomingType;
  if (
    shouldPreserveDispatcherExit({
      output: args.output,
      selectedType,
      incomingSignalIsClear,
      hasPlanBoundAction,
      previousExists: Boolean(args.previous),
    })
  ) return args.output;
  if (
    selectedType === "unclear" ||
    selectedType === "plan_action" && !hasPlanBoundAction
  ) {
    return {
      ...keepCoachingFlowActive(args.output, "continue_clarifying_need"),
      feature_candidates: [],
      recommendation: {
        primary_feature: null,
        secondary_feature: null,
        why_primary: null,
        user_facing_next_step: null,
      },
      visible_task: visibleTaskWithoutPresetContexts(args.output.visible_task, {
        kind: "change_confirm_coaching_type",
        instruction:
          "Clarifier si le besoin concerne une action du plan, une action hors plan ou un etat emotionnel.",
        conversation_context: {
          coaching_category: context
            ? categoryFromCoachingType(coachingTypeFromContext(context))
            : null,
          candidate_features: [],
          recommendation: {
            primary_feature: null,
            secondary_feature: null,
            why_primary: null,
            user_facing_next_step: null,
          },
        },
      }),
    };
  }
  if (selectedType === "emotional") {
    return {
      ...keepCoachingFlowActive(args.output),
      feature_candidates: args.output.feature_candidates.filter((candidate) =>
        candidate.feature === "state_potion"
      ),
      recommendation: {
        primary_feature: "state_potion",
        secondary_feature: null,
        why_primary: args.output.recommendation.why_primary ||
          "Le besoin principal est emotionnel.",
        user_facing_next_step:
          args.output.recommendation.user_facing_next_step ||
          "choisir une potion adaptee a cet etat",
      },
      visible_task: visibleTaskWithoutPresetContexts(args.output.visible_task, {
        kind: "emotion_coaching",
        instruction: "Coacher l'etat emotionnel et proposer une potion.",
        conversation_context: {
          coaching_category: "emotional_state_coaching",
        },
        flow_context: appliedTargetSwitchFlowContext,
      }),
    };
  }
  if (selectedType === "plan_action" && hasPlanBoundAction) {
    const candidates = args.output.feature_candidates.filter((candidate) =>
      isPlanBoundFeature(candidate.feature)
    );
    const primary =
      isPlanBoundFeature(args.output.recommendation.primary_feature)
        ? args.output.recommendation.primary_feature
        : null;
    const secondary =
      isPlanBoundFeature(args.output.recommendation.secondary_feature) &&
        args.output.recommendation.secondary_feature !== primary
        ? args.output.recommendation.secondary_feature
        : null;
    return {
      ...keepCoachingFlowActive(args.output),
      feature_candidates: candidates,
      recommendation: {
        ...args.output.recommendation,
        primary_feature: primary,
        secondary_feature: secondary,
      },
      visible_task: visibleTaskWithoutPresetContexts(args.output.visible_task, {
        kind: "action_plan_coaching",
        instruction:
          "Coacher une action concrete du plan avec les leviers produit autorises.",
        conversation_context: {
          coaching_category: "plan_action_coaching",
        },
        flow_context: appliedTargetSwitchFlowContext,
      }),
    };
  }
  const noPlanUnsupportedFeature =
    args.output.recommendation.primary_feature === "adjust_plan" ||
    args.output.recommendation.primary_feature === "state_potion" ||
    args.output.recommendation.secondary_feature === "adjust_plan" ||
    args.output.recommendation.secondary_feature === "state_potion" ||
    args.output.feature_candidates.some((candidate) =>
      candidate.feature === "adjust_plan" ||
      candidate.feature === "state_potion"
    );
  const planBoundFeatureInLegacyStep =
    args.output.visible_task.step_context?.task_kind ===
          "recommend_feature" &&
      isPlanBoundFeature(
        args.output.visible_task.step_context.selected_feature,
      ) ||
    args.output.visible_task.step_context?.task_kind ===
          "explain_platform_destination" &&
      isPlanBoundFeature(args.output.visible_task.step_context.feature);
  const planUnsupportedFeature =
    isPlanBoundFeature(args.output.recommendation.primary_feature) ||
    isPlanBoundFeature(args.output.recommendation.secondary_feature) ||
    args.output.feature_candidates.some((candidate) =>
      isPlanBoundFeature(candidate.feature)
    ) ||
    planBoundFeatureInLegacyStep;
  const hasUnsupportedPlanFeature = selectedType === "no_plan_action"
    ? noPlanUnsupportedFeature
    : planUnsupportedFeature;
  if (!hasUnsupportedPlanFeature) {
    return selectedType === "no_plan_action"
      ? {
        ...keepCoachingFlowActive(args.output),
        feature_candidates: args.output.feature_candidates.filter(
          (candidate) => isNoPlanAllowedFeature(candidate.feature),
        ),
        recommendation: {
          primary_feature: isNoPlanAllowedFeature(
              args.output.recommendation.primary_feature,
            )
            ? args.output.recommendation.primary_feature
            : null,
          secondary_feature: isNoPlanAllowedFeature(
              args.output.recommendation.secondary_feature,
            )
            ? args.output.recommendation.secondary_feature
            : null,
          why_primary: args.output.recommendation.why_primary ||
            args.output.coaching_intent.summary ||
            "L'action n'est pas reliee au plan; il faut aider par coaching direct.",
          user_facing_next_step: noPlanUserFacingNextStep(
            isNoPlanAllowedFeature(args.output.recommendation.primary_feature)
              ? args.output.recommendation.primary_feature
              : null,
          ),
        },
        visible_task: visibleTaskWithoutPresetContexts(
          args.output.visible_task,
          {
            kind: "no_plan_coaching",
            instruction:
              "Faire du coaching sur l'action non reliee au plan; carte d'attaque ou carte de defense libres autorisees si recommandees.",
            conversation_context: {
              coaching_category: "free_action_coaching",
              candidate_features: args.output.feature_candidates.filter(
                (candidate) => isNoPlanAllowedFeature(candidate.feature),
              ),
              recommendation: {
                primary_feature: isNoPlanAllowedFeature(
                    args.output.recommendation.primary_feature,
                  )
                  ? args.output.recommendation.primary_feature
                  : null,
                secondary_feature: isNoPlanAllowedFeature(
                    args.output.recommendation.secondary_feature,
                  )
                  ? args.output.recommendation.secondary_feature
                  : null,
                why_primary: args.output.recommendation.why_primary ||
                  args.output.coaching_intent.summary ||
                  "L'action n'est pas reliee au plan; il faut aider par coaching direct.",
                user_facing_next_step: noPlanUserFacingNextStep(
                  isNoPlanAllowedFeature(
                      args.output.recommendation.primary_feature,
                    )
                    ? args.output.recommendation.primary_feature
                    : null,
                ),
              },
              do_not_say: [
                ...args.output.visible_task.conversation_context.do_not_say,
                "Ne propose jamais adjust_plan, potion, mission ou habitude pour une action hors plan.",
                "Ne presente jamais une carte libre comme liee a une action du Plan.",
              ],
            },
            flow_context: appliedTargetSwitchFlowContext,
          },
        ),
      }
      : args.output;
  }

  const candidates = selectedType === "no_plan_action"
    ? args.output.feature_candidates.filter((candidate) =>
      isNoPlanAllowedFeature(candidate.feature)
    )
    : args.output.feature_candidates.filter((candidate) =>
      !isPlanBoundFeature(candidate.feature)
    );
  if (
    selectedType === "no_plan_action" &&
    isNoPlanAllowedFeature(args.output.recommendation.primary_feature)
  ) {
    const primary = args.output.recommendation.primary_feature;
    const secondary = isNoPlanAllowedFeature(
        args.output.recommendation.secondary_feature,
      ) && args.output.recommendation.secondary_feature !== primary
      ? args.output.recommendation.secondary_feature
      : null;
    const recommendation = {
      primary_feature: primary,
      secondary_feature: secondary,
      why_primary: args.output.recommendation.why_primary ||
        args.output.coaching_intent.summary ||
        "L'action n'est pas reliee au plan; une carte libre peut aider sans modifier le Plan.",
      user_facing_next_step: noPlanUserFacingNextStep(primary),
    };
    return {
      ...keepCoachingFlowActive(args.output),
      feature_candidates: candidates,
      recommendation,
      visible_task: visibleTaskWithoutPresetContexts(args.output.visible_task, {
        kind: "no_plan_coaching",
        instruction:
          "Faire du coaching sur l'action non reliee au plan; carte d'attaque ou carte de defense libres autorisees si recommandees.",
        conversation_context: {
          coaching_category: "free_action_coaching",
          candidate_features: candidates,
          recommendation,
          do_not_say: [
            ...args.output.visible_task.conversation_context.do_not_say,
            "Ne propose jamais adjust_plan, potion, mission ou habitude pour une action hors plan.",
            "Ne presente jamais une carte libre comme liee a une action du Plan.",
          ],
        },
        flow_context: appliedTargetSwitchFlowContext,
      }),
    };
  }
  const cause = causeFromFailureMode(context);
  const shouldClarify = args.output.coaching_intent.kind === "plan_misaligned" ||
    args.output.recommendation.primary_feature === "adjust_plan";

  if (shouldClarify) {
    return {
      ...args.output,
      flow_action: "continue_clarifying_need",
      feature_candidates: candidates,
      recommendation: {
        primary_feature: null,
        secondary_feature: null,
        why_primary: null,
        user_facing_next_step: null,
      },
      state_updates: {
        ...args.output.state_updates,
        stage: "understand_need",
        status: "active",
        close_after_visible: false,
      },
      visible_task: visibleTaskWithoutPresetContexts(args.output.visible_task, {
        kind: "no_plan_coaching",
        instruction:
          "Faire du coaching sur l'action non reliee au plan; carte d'attaque ou carte de defense libres autorisees si recommandees.",
        conversation_context: {
          coaching_category: "free_action_coaching",
          missing_or_weak_values: [],
          candidate_features: candidates,
          recommendation: {
            primary_feature: null,
            secondary_feature: null,
            why_primary: null,
            user_facing_next_step: null,
          },
          do_not_say: [
            ...args.output.visible_task.conversation_context.do_not_say,
            "Ne propose jamais adjust_plan, potion, mission ou habitude pour une action hors plan.",
            "Ne presente jamais une carte libre comme liee a une action du Plan.",
          ],
        },
      }),
    };
  }

  const recommendation = {
    primary_feature: null,
    secondary_feature: null,
    why_primary: cause === "misaligned_action" || cause === "unclear"
      ? "L'action n'est pas assez reliee ou cadrée pour proposer une feature produit."
      : "L'action n'est pas reliee au plan; il faut aider par coaching direct.",
    user_facing_next_step: cause === "misaligned_action" || cause === "unclear"
      ? "Clarifie le resultat attendu avant de choisir un levier produit."
      : "Choisis le premier geste concret et fais seulement celui-la.",
  };
  return {
    ...keepCoachingFlowActive(args.output),
    feature_candidates: candidates,
    recommendation,
    visible_task: visibleTaskWithoutPresetContexts(args.output.visible_task, {
      kind: "no_plan_coaching",
      instruction:
        "Faire du coaching sur l'action non reliee au plan; carte d'attaque ou carte de defense libres autorisees si recommandees.",
      conversation_context: {
        coaching_category: "free_action_coaching",
        candidate_features: candidates,
        recommendation,
        do_not_say: [
          ...args.output.visible_task.conversation_context.do_not_say,
          "Ne propose jamais adjust_plan, potion, mission ou habitude pour une action hors plan.",
          "Ne presente jamais une carte libre comme liee a une action du Plan.",
        ],
      },
    }),
  };
}

export function normalizeCoachingRecommendationLocalDispatcherOutput(
  raw: unknown,
): CoachingRecommendationLocalDispatcherOutput {
  const root = parseObject(raw);
  const rawFlowAction = text(root.flow_action);
  const legacyProductHandoff = rawFlowAction === "handoff_to_product_help" ||
    text(isRecord(root.visible_task) ? root.visible_task.kind : null) ===
      "product_help_transition";
  const legacySafetyHandoff = rawFlowAction === "safety_preempt" ||
    text(isRecord(root.visible_task) ? root.visible_task.kind : null) ===
      "safety_transition";
  const action = enumValue<CoachingRecommendationFlowAction>(
    legacyProductHandoff
      ? "answer_followup"
      : legacySafetyHandoff
      ? "exit_to_global_dispatcher"
      : root.flow_action,
    FLOW_ACTIONS,
    "continue_clarifying_need",
  );
  const intentRoot = isRecord(root.coaching_intent) ? root.coaching_intent : {};
  const stateRoot = isRecord(root.state_updates) ? root.state_updates : {};
  const visibleRoot = isRecord(root.visible_task) ? root.visible_task : {};
  const recommendationRoot = isRecord(root.recommendation)
    ? root.recommendation
    : {};
  const candidates = uniqueCandidates(root.feature_candidates);
  const primary = feature(recommendationRoot.primary_feature) ??
    candidates.find((candidate) => candidate.fit === "high")?.feature ??
    candidates[0]?.feature ??
    null;
  const secondaryRaw = feature(recommendationRoot.secondary_feature);
  const secondary = secondaryRaw && secondaryRaw !== primary
    ? secondaryRaw
    : null;
  const recommendation = {
    primary_feature: primary,
    secondary_feature: secondary,
    why_primary: text(recommendationRoot.why_primary, 300) || null,
    user_facing_next_step:
      text(recommendationRoot.user_facing_next_step, 240) || null,
  };
  const fallbackContext = defaultConversationContext({
    state_summary: text(intentRoot.summary),
    candidate_features: candidates,
    recommendation,
    evidence_used: stringArray(root.evidence, 8),
  });
  const visibleKindFallback: CoachingRecommendationVisibleTaskKind =
    action === "continue_clarifying_need"
      ? "ask_difficulty_clarification"
      : action === "compare_features"
      ? "recommend_feature"
      : action === "recommend_feature"
      ? "recommend_feature"
      : action === "answer_followup"
      ? "answer_followup"
      : action === "close_flow"
      ? "close_recommendation"
      : "exit_ack";
  const normalizedConversationContext = normalizeConversationContext(
    isRecord(visibleRoot) ? visibleRoot.conversation_context : null,
    fallbackContext,
  );
  const normalizedFlowContext = normalizeFlowContext(
    isRecord(visibleRoot) ? visibleRoot.flow_context : null,
    defaultFlowContext({
      dispatcherSignalContext: null,
      conversationContext: normalizedConversationContext,
      recommendation,
      candidates,
      evidence: stringArray(root.evidence, 8),
    }),
  );
  const visibleKind = enumValue<CoachingRecommendationVisibleTaskKind>(
    legacyProductHandoff ? "explain_platform_destination" : visibleRoot.kind,
    VISIBLE_TASKS,
    visibleKindFallback,
  );
  const instruction = text(visibleRoot.instruction);
  const normalizedStepContext = normalizeStepContext(
    isRecord(visibleRoot) ? visibleRoot.step_context : null,
    defaultStepContext(visibleKind, normalizedFlowContext, instruction),
  );
  return {
    flow_action: action,
    confidence: confidence(root.confidence),
    risk_score: riskScore(root.risk_score),
    coaching_intent: {
      kind: enumValue<CoachingIntentKind>(
        intentRoot.kind,
        INTENTS,
        "unclear",
      ),
      summary: text(intentRoot.summary),
    },
    target_switch: normalizeTargetSwitch(root.target_switch),
    feature_candidates: candidates,
    recommendation,
    direct_effect_request: normalizeLocalOneShotDirectEffectRequest(
      root.direct_effect_request,
    ),
    state_updates: {
      stage: enumValue(
        stateRoot.stage,
        new Set([
          "understand_need",
          "compare_options",
          "recommend",
          "followup",
          "closing",
        ]),
        action === "recommend_feature" ? "recommend" : "understand_need",
      ),
      status: enumValue(
        stateRoot.status,
        new Set(["active", "closing", "closed", "exit_to_global"]),
        action === "close_flow" ? "closed" : "active",
      ),
      turn_count_increment: Math.max(
        0,
        Math.min(1, Number(stateRoot.turn_count_increment ?? 1) || 1),
      ),
      close_after_visible: stateRoot.close_after_visible === true,
    },
    visible_task: {
      kind: visibleKind,
      instruction,
      conversation_context: normalizedConversationContext,
      flow_context: normalizedFlowContext,
      step_context: normalizedStepContext,
    },
    note_information: null,
    exit_memo: isRecord(root.exit_memo)
      ? root.exit_memo as CoachingRecommendationLocalDispatcherOutput[
        "exit_memo"
      ]
      : {
        needed: false,
        reason: "none",
        user_intent_summary: null,
        local_flow_context: {
          skill_id: "coaching_recommendation",
          stage: null,
          user_need_summary: null,
          candidate_features: [],
          current_recommendation: null,
          last_answer_summary: null,
        },
        handoff_hint_for_global_dispatcher: {
          likely_intent: "unknown",
          why: null,
        },
      },
    evidence: stringArray(root.evidence, 8),
  };
}

function mergeState(args: {
  previous: CoachingRecommendationLocalState | null;
  output: CoachingRecommendationLocalDispatcherOutput;
  status: CoachingRecommendationReducerResult["status"];
}): CoachingRecommendationLocalState | null {
  if (args.status !== "continue") return null;
  const previousTurns = args.previous?.turn_count ?? 0;
  const turnCount = Math.min(
    4,
    previousTurns + args.output.state_updates.turn_count_increment,
  );
  const primaryCandidate =
    args.output.feature_candidates.find((candidate) =>
      candidate.feature === args.output.recommendation.primary_feature
    ) ?? null;
  const secondaryCandidate =
    args.output.feature_candidates.find((candidate) =>
      candidate.feature === args.output.recommendation.secondary_feature
    ) ?? null;
  const flowContext = args.output.visible_task.flow_context ?? null;
  const stepContext = args.output.visible_task.step_context ?? null;
  const targetSwitchApplied = args.output.target_switch.status === "explicit" &&
    flowContext?.dispatcher_signal_context !== null &&
    flowContext?.dispatcher_signal_context !== undefined &&
    coachingTypeFromContext(flowContext.dispatcher_signal_context) ===
      flowContext.coaching_type;
  const targetSwitchEvidence = [
    ...args.output.evidence,
    text(flowContext?.dispatcher_signal_context?.reason),
  ].filter(Boolean);
  const noPlanWithoutFeature =
    args.output.visible_task.kind === "no_plan_coaching" &&
    args.output.recommendation.primary_feature === null;
  const clearRecommendations = noPlanWithoutFeature ||
    args.output.visible_task.kind === "change_confirm_coaching_type" ||
    args.output.recommendation.primary_feature === null;
  return {
    stage: args.output.state_updates.stage,
    user_need_summary: args.output.coaching_intent.summary ||
      args.previous?.user_need_summary ||
      null,
    candidate_features: args.output.feature_candidates.length > 0
      ? args.output.feature_candidates
      : clearRecommendations
      ? []
      : args.previous?.candidate_features ?? [],
    current_recommendation: clearRecommendations ? null : primaryCandidate ??
      args.previous?.current_recommendation ??
      null,
    secondary_recommendation: clearRecommendations
      ? null
      : secondaryCandidate ??
        args.previous?.secondary_recommendation ??
        null,
    unresolved_question:
      args.output.visible_task.kind === "ask_need_clarification"
        ? args.output.visible_task.instruction || null
        : null,
    last_answer_summary: args.output.recommendation.why_primary ||
      args.output.coaching_intent.summary ||
      args.previous?.last_answer_summary ||
      null,
    parent_flow_id: flowContext?.parent_flow_id ??
      args.previous?.parent_flow_id ?? null,
    parent_return_focus: flowContext?.parent_return_focus ??
      args.previous?.parent_return_focus ?? null,
    parent_action_context: flowContext?.parent_action_context ??
      args.previous?.parent_action_context ?? null,
    parent_state_summary: flowContext?.parent_state_summary ??
      args.previous?.parent_state_summary ?? null,
    coaching_type: flowContext?.coaching_type ??
      args.previous?.coaching_type ??
      coachingTypeFromContext(flowContext?.dispatcher_signal_context ?? null),
    coaching_type_confidence: targetSwitchApplied
      ? confidenceBandFromSignal(
        flowContext?.dispatcher_signal_context ?? null,
        args.output.confidence,
      )
      : args.previous?.coaching_type_confidence ?? args.output.confidence,
    coaching_type_evidence: targetSwitchApplied
      ? targetSwitchEvidence
      : args.previous?.coaching_type_evidence ?? args.output.evidence,
    pending_type_change:
      stepContext?.task_kind === "change_confirm_coaching_type"
        ? {
          candidate_coaching_type: stepContext.candidate_coaching_type ??
            "unclear",
          reason: flowContext?.coaching_type_reason ?? null,
        }
        : null,
    dispatcher_signal_context: flowContext?.dispatcher_signal_context ??
      args.previous?.dispatcher_signal_context ?? null,
    difficulty: flowContext?.difficulty ?? args.previous?.difficulty ?? null,
    cause_analysis: flowContext?.cause_analysis ??
      args.previous?.cause_analysis ?? null,
    recommendation_decision: flowContext?.recommendation ??
      args.previous?.recommendation_decision ?? null,
    last_visible_task_kind: stepContext?.task_kind ??
      args.previous?.last_visible_task_kind ?? null,
    turn_count: turnCount,
    max_turns: 4,
  };
}

function reducerVisibleContexts(args: {
  previous: CoachingRecommendationLocalState | null;
  output: CoachingRecommendationLocalDispatcherOutput;
  dispatcherSignalContext?: CoachingRecommendationLocalState[
    "dispatcher_signal_context"
  ];
}): {
  conversationContext: CoachingRecommendationConversationContext;
  flowContext: CoachingRecommendationFlowContext;
  stepContext: CoachingVisibleStepContext;
} {
  const baseDispatcherSignalContext = args.dispatcherSignalContext ??
    args.output.visible_task.flow_context?.dispatcher_signal_context ??
    args.previous?.dispatcher_signal_context ??
    null;
  const dispatcherSignalContext = dispatcherContextForCategory({
    category: args.output.visible_task.conversation_context.coaching_category,
    base: baseDispatcherSignalContext,
  });
  const conversationContext = defaultConversationContext({
    ...args.output.visible_task.conversation_context,
    coaching_category:
      args.output.visible_task.conversation_context.coaching_category ??
        (dispatcherSignalContext?.coaching_type
          ? categoryFromCoachingType(
            coachingTypeFromContext(dispatcherSignalContext),
          )
          : null),
    failure_mode: args.output.visible_task.conversation_context.failure_mode ??
      null,
    action_context:
      args.output.visible_task.conversation_context.action_context ??
        dispatcherSignalContext?.action_context ?? null,
    priority_features:
      args.output.visible_task.conversation_context.priority_features?.length >
          0
        ? args.output.visible_task.conversation_context.priority_features
        : [],
    candidate_features: args.output.feature_candidates,
    recommendation: args.output.recommendation,
    evidence_used: args.output.evidence,
  });
  const fallbackFlowContext = defaultFlowContext({
    dispatcherSignalContext,
    conversationContext,
    recommendation: args.output.recommendation,
    candidates: args.output.feature_candidates,
    evidence: args.output.evidence,
  });
  fallbackFlowContext.parent_flow_id = args.previous?.parent_flow_id ?? null;
  fallbackFlowContext.parent_return_focus =
    args.previous?.parent_return_focus ??
      null;
  fallbackFlowContext.parent_action_context =
    args.previous?.parent_action_context ?? null;
  fallbackFlowContext.parent_state_summary =
    args.previous?.parent_state_summary ?? null;
  const incomingType = coachingTypeFromContext(dispatcherSignalContext);
  const previousType = args.previous?.coaching_type ?? "unclear";
  const candidateForConfirmation =
    args.output.visible_task.kind === "change_confirm_coaching_type" &&
      incomingType !== "unclear" && incomingType !== previousType
      ? incomingType
      : fallbackFlowContext.candidate_coaching_type;
  const previousContextStillMatches =
    args.previous?.coaching_type === fallbackFlowContext.coaching_type;
  const flowContext = normalizeFlowContext(
    args.output.visible_task.flow_context,
    {
      ...fallbackFlowContext,
      coaching_type: args.output.visible_task.kind ===
          "change_confirm_coaching_type"
        ? previousType
        : fallbackFlowContext.coaching_type,
      candidate_coaching_type: candidateForConfirmation,
      difficulty: previousContextStillMatches
        ? args.previous?.difficulty ?? fallbackFlowContext.difficulty
        : fallbackFlowContext.difficulty,
      cause_analysis: previousContextStillMatches
        ? args.previous?.cause_analysis ?? fallbackFlowContext.cause_analysis
        : fallbackFlowContext.cause_analysis,
      recommendation: previousContextStillMatches
        ? args.previous?.recommendation_decision ??
          fallbackFlowContext.recommendation
        : fallbackFlowContext.recommendation,
    },
  );
  const stepContext = normalizeStepContext(
    args.output.visible_task.step_context,
    defaultStepContext(
      args.output.visible_task.kind,
      flowContext,
      args.output.visible_task.instruction,
    ),
  );
  return { conversationContext, flowContext, stepContext };
}

export function reduceCoachingRecommendationLocalDispatcherOutput(args: {
  previous: CoachingRecommendationLocalState | null;
  output: CoachingRecommendationLocalDispatcherOutput;
  userMessage: string;
  dispatcherSignalContext?: CoachingRecommendationLocalState[
    "dispatcher_signal_context"
  ];
}): CoachingRecommendationReducerResult {
  const originalOutput = args.output;
  let output = enforceCoachingRecommendationContract({
    output: args.output,
    previous: args.previous,
    dispatcherSignalContext: args.dispatcherSignalContext,
  });
  const nextTurnCount = (args.previous?.turn_count ?? 0) +
    output.state_updates.turn_count_increment;
  if (
    nextTurnCount >= 4 &&
    (output.flow_action === "continue_clarifying_need" ||
      output.flow_action === "compare_features")
  ) {
    output = {
      ...output,
      flow_action: output.recommendation.primary_feature
        ? "recommend_feature"
        : "close_flow",
      state_updates: {
        ...output.state_updates,
        stage: output.recommendation.primary_feature ? "recommend" : "closing",
        status: output.recommendation.primary_feature ? "active" : "closed",
        close_after_visible: !output.recommendation.primary_feature,
      },
      visible_task: {
        ...output.visible_task,
        kind: output.recommendation.primary_feature
          ? output.visible_task.kind
          : "close_recommendation",
      },
    };
  }
  if (
    output.flow_action === "exit_to_global_dispatcher" ||
    output.coaching_intent.kind === "off_topic" ||
    output.coaching_intent.kind === "safety" ||
    output.risk_score >= 7
  ) {
    const visible = reducerVisibleContexts({
      previous: args.previous,
      output,
      dispatcherSignalContext: args.dispatcherSignalContext,
    });
    const note = noteForExit({
      action: "exit_to_global_dispatcher",
      outputNote: output.note_information,
      userMessage: args.userMessage,
      summary: output.coaching_intent.summary,
      state: args.previous,
      candidates: output.feature_candidates,
      recommendation: output.recommendation,
      confidence: output.confidence,
      evidence: output.evidence,
    });
    return {
      status: "exit",
      reason_code: "coaching_recommendation_exit_to_global",
      diagnosis: reducerDiagnosis({
        originalOutput,
        output,
        previous: args.previous,
        flowContext: visible.flowContext,
        visibleTask: "exit_ack",
      }),
      local_state: null,
      visible_task: "exit_ack",
      conversation_context: visible.conversationContext,
      flow_context: visible.flowContext,
      step_context: defaultStepContext(
        "exit_ack",
        visible.flowContext,
        output.visible_task.instruction,
      ),
      note_information: note,
      effects: { requested: [], allowed: [], blocked: [], committed: [] },
    };
  }
  const visible = reducerVisibleContexts({
    previous: args.previous,
    output,
    dispatcherSignalContext: args.dispatcherSignalContext,
  });
  const parentFlowId = visible.flowContext.parent_flow_id ??
    args.previous?.parent_flow_id ?? null;
  const parentRecommendationDelivered = Boolean(
    parentFlowId && output.flow_action === "recommend_feature" &&
      output.recommendation.primary_feature,
  );
  const complete = output.flow_action === "close_flow" ||
    parentRecommendationDelivered ||
    output.state_updates.close_after_visible ||
    output.state_updates.status === "closed";
  const status = complete ? "complete" : "continue";
  const primaryCandidate =
    output.feature_candidates.find((candidate) =>
      candidate.feature === output.recommendation.primary_feature
    ) ?? null;
  const secondaryCandidate =
    output.feature_candidates.find((candidate) =>
      candidate.feature === output.recommendation.secondary_feature
    ) ?? null;
  const parentStateForReturn: CoachingRecommendationLocalState | null =
    parentFlowId
      ? {
        stage: args.previous?.stage ?? "closing",
        user_need_summary: (args.previous?.user_need_summary ??
          output.coaching_intent.summary) || null,
        candidate_features: args.previous?.candidate_features?.length
          ? args.previous.candidate_features
          : output.feature_candidates,
        current_recommendation: args.previous?.current_recommendation ??
          primaryCandidate,
        secondary_recommendation: args.previous?.secondary_recommendation ??
          secondaryCandidate,
        unresolved_question: args.previous?.unresolved_question ?? null,
        last_answer_summary: (args.previous?.last_answer_summary ??
          output.recommendation.why_primary ??
          output.coaching_intent.summary) ||
          null,
        parent_flow_id: parentFlowId,
        parent_return_focus: visible.flowContext.parent_return_focus ??
          args.previous?.parent_return_focus ?? null,
        parent_action_context: visible.flowContext.parent_action_context ??
          args.previous?.parent_action_context ?? null,
        parent_state_summary: visible.flowContext.parent_state_summary ??
          args.previous?.parent_state_summary ?? null,
        coaching_type: visible.flowContext.coaching_type,
        coaching_type_confidence: args.previous?.coaching_type_confidence ??
          output.confidence,
        coaching_type_evidence: args.previous?.coaching_type_evidence ??
          output.evidence,
        pending_type_change: args.previous?.pending_type_change ?? null,
        dispatcher_signal_context:
          visible.flowContext.dispatcher_signal_context,
        difficulty: visible.flowContext.difficulty,
        cause_analysis: visible.flowContext.cause_analysis,
        recommendation_decision: visible.flowContext.recommendation,
        last_visible_decision: args.previous?.last_visible_decision ?? null,
        last_visible_task_kind: visible.stepContext.task_kind,
        turn_count: args.previous?.turn_count ?? 0,
        max_turns: 4,
      }
      : args.previous;
  const parentNote = complete
    ? noteForParentReturn({
      state: parentStateForReturn,
      recommendation: output.recommendation,
      candidates: output.feature_candidates,
      summary: output.coaching_intent.summary,
      userMessage: args.userMessage,
      confidence: output.confidence,
      evidence: output.evidence,
    })
    : null;
  const outputForState = {
    ...output,
    visible_task: {
      ...output.visible_task,
      flow_context: visible.flowContext,
      step_context: visible.stepContext,
    },
  };
  return {
    status,
    reason_code: complete
      ? "coaching_recommendation_complete"
      : "coaching_recommendation_continue",
    diagnosis: reducerDiagnosis({
      originalOutput,
      output,
      previous: args.previous,
      flowContext: visible.flowContext,
      visibleTask: output.visible_task.kind,
    }),
    local_state: mergeState({
      previous: args.previous,
      output: outputForState,
      status,
    }),
    visible_task: output.visible_task.kind,
    conversation_context: visible.conversationContext,
    flow_context: visible.flowContext,
    step_context: visible.stepContext,
    note_information: parentNote,
    effects: { requested: [], allowed: [], blocked: [], committed: [] },
  };
}

function dispatcherPrompt(input: CoachingRecommendationLocalDispatcherInput) {
  return [
    "Tu es le dispatcher local du skill coaching_recommendation.",
    "Retourne uniquement le JSON demande. Ne reponds pas au user.",
    "Ce flow aide le user a recevoir le bon type de coaching ou, quand c'est autorise par le type de coaching, le bon levier Sophia.",
    "Ce flow est une recommandation conversationnelle: il ne cree rien, ne modifie rien, ne programme rien et ne remplit aucun slot d'anciens tools.",
    "Si inbound_note_information.structured_context.bridge_kind vaut parent_to_coaching_recommendation, conserve parent_flow_id, return_focus, action_context et parent_state_summary; a la fin, retourne une note vers ce parent.",
    "Features recommandables uniquement: adjust_plan, attack_card, defense_card, state_potion.",
    "Features interdites: opportunites produit, preferences, rappels, progression, platform. Ne les produis jamais.",
    "Le dispatcher global transmet seulement le type cible via dispatcher_signal_context.coaching_type: plan_action, no_plan_action, emotional ou ambiguous, avec confidence, reason et action_context minimal. Il ne choisit jamais la feature.",
    "Ce coaching_type est canonique pendant le flow local. Tu peux le contredire seulement si le dernier message user indique clairement un changement de cible; dans ce cas utilise target_switch explicite si la nouvelle cible est claire, sinon visible_task.kind=change_confirm_coaching_type.",
    "Visible agents autorises pour ce flow: change_confirm_coaching_type, emotion_coaching, no_plan_coaching, action_plan_coaching, answer_followup, close_recommendation, exit_ack.",
    "Les anciens step kinds ask_difficulty_clarification, explain_cause, recommend_feature, free_action_coaching et explain_platform_destination sont des alias legacy: ne les choisis pas en sortie active.",
    "Les agents visibles ne sortent que la reponse user-facing. Ils ne produisent pas de JSON, pas de signal d'exit, pas de decision de routing: c'est toi qui maintiens l'etat et decides loop/exit au tour suivant.",
    "Si coaching_type=unclear ou si plan_action n'a pas d'action concrete du plan, utilise change_confirm_coaching_type pour confirmer action du plan, action hors plan ou etat emotionnel.",
    "Ne re-clarifie jamais un slot deja fourni: si dispatcher_signal_context (reason, action_context) ou le dernier message contient deja la situation et le declencheur (ex: envie de fumer, seul, le soir par ennui), ne pose pas de question de cadrage generique du type 'par rapport a quelle situation ?' — utilise ces elements et entre directement dans le coaching du type correspondant. La clarification est reservee aux cas ou la situation est reellement absente.",
    "Progression apres acceptation: si ta derniere reponse visible (recent_messages, role assistant) contenait une offre ('je peux t'aider a formuler', 'on la prepare ensemble ?', 'tu veux qu'on avance dessus ?') et que le dernier message user l'accepte ('oui', 'vas-y', 'prepare-la', 'oui prepare-la' + detail), ne rejoue jamais le meme cadrage ni la meme recommandation: flow_action=answer_followup, state_updates.stage=followup, et visible_task.instruction doit ordonner d'EXECUTER l'offre acceptee (produire le livrable conversationnel autorise, appliquer le cadrage au cas concret) — ou, si l'offre touche la frontiere produit (remplissage de carte), d'accuser l'acceptation et de donner le prochain pas concret sur la plateforme sans re-servir le scaffold.",
    "Interdit de progression: re-servir dans visible_task un cadrage/scaffold deja rendu dans recent_messages, ou re-proposer une offre deja acceptee, sans nouvel element apporte par le user. Chaque tour du flow doit faire avancer d'une etape.",
    "Le go-ahead compte pour TOUTE offre, y compris une offre de fin de message (trailing offer, 'si tu veux je peux t'aider a formuler'): si le user repond 'oui vas-y', 'cadre-moi', 'fais-le', 'donne', 'ok on fait ca', tu LIVRES au tour suivant (la formulation courte personnalisee, le contenu concret applique a son cas) — jamais une 3e re-proposition de la meme offre. Le garde-fou produit porte sur l'ECRITURE de la carte, jamais sur l'aide a formuler en conversation. Anti-faux-positif: 'remplis-la dans le plan' / une demande d'ecriture reelle reste renvoyee vers la plateforme.",
    "Si coaching_type=emotional, utilise emotion_coaching seulement pour un etat emotionnel global, non rattache a une action concrete a faire, demarrer, tenir ou terminer. state_potion est la seule feature produit autorisee. N'utilise jamais action_plan_coaching ou no_plan_coaching dans ce cas.",
    "Si la peur, tension, pression, boule au ventre, honte ou evitement est liee a l'action en cours, ce n'est pas emotional_state_coaching: reste dans action_plan_coaching si l'action est dans le plan, ou no_plan_coaching si elle est hors plan.",
    "Si coaching_type=no_plan_action, utilise no_plan_coaching. Les cartes d'attaque et de defense libres sont autorisees si utiles; adjust_plan, state_potion, mission, habitude et chemins lies a une action du Plan sont interdits.",
    "Si coaching_type=plan_action, utilise action_plan_coaching uniquement avec une action concrete du plan: dispatcher_signal_context.action_context.source='plan' avec plan_item_id ou contexte parent de plan.",
    "Pour action_plan_coaching, attack_card/defense_card/adjust_plan sont autorises selon le probleme. Les cartes se preparent depuis l'action du plan, pas depuis Ressources; Ressources sert seulement a consulter des cartes existantes.",
    "Pour une emotion liee a une action: attack_card peut aider a preparer l'entree dans l'action quand l'anxiete bloque le demarrage; defense_card peut proteger le moment de risque si l'emotion fait decrocher, eviter, craquer ou abandonner pendant l'action.",
    "Ne propose adjust_plan en priorite que si cette action concrete du plan est explicitement trop lourde, mal calibree, desalignee, infaisable ou a un rythme impossible d'apres le message user et le contexte local.",
    "Un mail, message ou brouillon 'mal cadre' n'est jamais automatiquement un adjust_plan: sans action de plan concrete, c'est no_plan_coaching ou change_confirm_coaching_type.",
    "Pour forgetting, launch_blocker ou avoidance autour d'une action faisable: attack_card en priorite.",
    "Pour risk_moment, craquage, abandon, bascule: defense_card en priorite.",
    "Pour emotional_state_coaching global seulement: state_potion en priorite. Les 6 potions sont anti-decrochage, courage, guerison, clarte, amour, apaisement; ne les utilise pas pour une resistance emotionnelle attachee a une action concrete.",
    "Tu dois produire une structure de diagnostic explicite dans flow_context: coaching_type, difficulty, cause_analysis, recommendation, product_guidance utile et evidence_used.",
    "Aucun agent visible ne choisit la feature, la cause ou l'etape: tu dois lui fournir flow_context et step_context.",
    "Si une donnee manque sur le type de coaching ou la relation au plan, choisis visible_task.kind=change_confirm_coaching_type.",
    "Si le coaching continue dans le meme type, reviens vers l'agent visible du type courant: emotion_coaching, no_plan_coaching ou action_plan_coaching.",
    "target_switch sert uniquement a signaler une mutation de cible active dans le dernier message user. Ce n'est pas un routeur produit et il ne decide pas la feature.",
    "target_switch.status=explicit si le user change clairement la cible active; status=ambiguous si le changement semble possible mais le type ou la cible manque; status=none sinon.",
    "Pour target_switch explicite, renseigne to_coaching_type et target. Pour plan_action et no_plan_action, target.title doit nommer l'action; pour emotional, target.title doit nommer l'etat emotionnel user-facing.",
    "Ne copie pas l'ancienne cible dans target_switch. Il doit refleter le dernier message user, pas le state precedent.",
    "Si previous_state existe et que le user dit un nouveau cas, un deuxieme cas, une autre action, ou corrige 'je parle de X', cela reste dans coaching_recommendation si le besoin reste de choisir un soutien, levier ou type de coaching.",
    "Exemple de regle: apres une recommandation pour un mail perso hors plan, 'deuxieme cas: dans mon plan j'ai preparer le dossier mutuelle, je bloque pareil' est un target_switch explicite vers plan_action, pas une sortie global.",
    "Exemple miroir obligatoire: apres une recommandation pour une action du plan, 'autre cas: j'ai un mail a Camille qui n'est pas dans mon plan, je bloque pareil' est un target_switch explicite vers no_plan_action, pas une sortie global.",
    "Dans un flow actif, ne produis jamais exit_to_global_dispatcher seulement parce que la cible passe de hors plan a plan, de plan a hors plan, ou d'action a emotion liee au coaching. C'est un changement de cible local.",
    "Si la nouvelle cible est mentionnee mais que sa relation au plan ou son type n'est pas clair, garde l'ownership et utilise change_confirm_coaching_type.",
    "Frontiere du flow: tu possedes ce tour seulement si le message courant continue le travail de recommandation de coaching en cours: clarifier le blocage, adapter le levier propose, demander une aide plus concrete sur la meme action, ou poursuivre l'execution immediate de cette action.",
    "Hors perimetre: si le message courant introduit une intention autonome qui doit etre arbitree globalement - question produit autonome, statut ou recap d'une operation, preference ou memoire durable, nouvelle action tool distincte, changement de sujet, ou refus du cadre de recommandation actuel - utilise exit_to_global_dispatcher.",
    "Hors perimetre aussi: un report d'action accomplie ou ratee ('c'est fait', 'j'ai organise X ce week-end', 'marque-le comme fait', 'coche-la') est du tracking de progression, pas du coaching: utilise exit_to_global_dispatcher (le runtime global commit le progres). Ne l'absorbe jamais dans le flow et n'accuse jamais verbalement un progres sans commit.",
    "Hors perimetre aussi: une demande d'INFORMATION ou de LECTURE ('montre-moi mon plan', 'c'est quoi mes actions actives ?', 'rappelle-moi mes actions', 'mes rappels', 'où j'en suis ?', un recap) n'est pas du coaching: utilise exit_to_global_dispatcher — la reponse normale possede la projection reelle du plan et des rappels. Ne tente JAMAIS d'y repondre depuis ce flow, ne demande JAMAIS au user de coller, copier ou redonner sa propre liste, et ne re-cadre pas cette demande en question de coaching.",
    "Le message courant est prioritaire sur l'etat actif: si le tour sort du perimetre coaching, ne le reformule pas en carte, potion ou technique; rends feature_candidates=[], recommendation null, visible_task.kind=exit_ack et note_information vers global.",
    "Invariant de coherence de sortie: exit_to_global_dispatcher est mutuellement exclusif avec une recommandation coaching active.",
    "Si flow_action=exit_to_global_dispatcher: feature_candidates doit etre [], recommendation.primary_feature=null, recommendation.secondary_feature=null, visible_task.kind=exit_ack, state_updates.status=exit_to_global, et note_information doit expliquer le vrai sujet hors coaching.",
    "Si recommendation.primary_feature est attack_card, defense_card, adjust_plan ou state_potion, ou si visible_task.kind est action_plan_coaching, no_plan_coaching ou emotion_coaching, alors flow_action ne peut jamais etre exit_to_global_dispatcher: utilise recommend_feature, answer_followup ou compare_features avec state_updates.status=active.",
    "Si flow_context.recommendation.primary_feature est non-null, flow_action ne peut pas etre exit_to_global_dispatcher. Inversement, en sortie global, flow_context.recommendation.primary_feature doit etre null.",
    "Sortie autorisee uniquement: exit_to_global_dispatcher vers le dispatcher global. Aucun handoff local vers product_help, safety_crisis ou un autre dispatcher n'existe dans ce flow.",
    "Si le user demande ou trouver, comment preparer, consulter ou utiliser la feature que ce flow vient de recommander, garde l'ownership coaching et utilise l'agent visible du type courant avec les infos de product_guidance injectees.",
    "Invariant stable recommendation product follow-up: si previous_state.current_recommendation ou previous_state.recommendation_decision.primary_feature existe et que le dernier message demande ou/comment trouver, ou exactement preparer, acceder, consulter ou utiliser ce meme levier, ce n'est pas un changement de coaching_type.",
    "Dans ce cas stable product follow-up: flow_action=answer_followup, state_updates.status=active, target_switch.status=none, recommendation.primary_feature doit rester le levier stable, visible_task.kind doit rester l'agent specialise du coaching_type courant: action_plan_coaching, no_plan_coaching ou emotion_coaching.",
    "Dans ce cas stable product follow-up, visible_task.kind=change_confirm_coaching_type est interdit, current_recommendation ne doit pas etre effacee, et aucune pending_type_change ne doit etre creee.",
    "Distinction contenu vs destination dans un follow-up: une demande de DESTINATION ('ou je la prepare', 'ou ca se trouve') attend le lieu (Plan). Une demande de CONTENU ou d'AVANCEE ('aide-moi a la preparer', 'vas-y', 'ok aide-moi', 'quoi mettre', 'un exemple concret') apres qu'une carte a deja ete recommandee attend un pas concret, pas la reformulation de la reco. Dans les deux cas: flow_action=answer_followup, levier stable, agent visible specialise courant.",
    "visible_task.instruction pour une demande de CONTENU/AVANCEE apres carte recommandee: ordonne d'AVANCER concretement sans re-nommer la technique ni re-donner la destination deja fournies au tour precedent. Pour une carte d'attaque, l'instruction demande de proposer le contenu concret adapte au cas (l'ancre visuelle exacte, la phrase, le mantra). Pour une carte de defense, l'instruction demande d'appliquer les composants au cas precis (moment critique, piege, geste de retour <30s, plan B) sans jamais rediger les champs exacts ni pretendre remplir la carte.",
    "Pour une carte d'attaque ou de defense liee a une action du plan, la destination stable est Dashboard > Plan, action concernee, preparer la carte depuis cette action; pour une carte libre hors plan, la destination stable est Dashboard > Ressources.",
    "Si last_visible_decision.lever=coaching_only, cela signifie seulement que le dernier tour etait explicatif: conserve current_recommendation/recommendation_decision comme dernier levier produit stable pour repondre aux questions 'ou trouver/preparer'.",
    "Si une question produit est autonome et sans lien avec la recommandation active ou les 4 leviers coaching, utilise exit_to_global_dispatcher avec note_information vers global; ne vise jamais product_help directement.",
    "Les infos produit canoniques des 4 leviers coaching sont dans coaching_feature_product_guidance; copie la fiche utile dans flow_context.product_guidance et step_context.product_guidance.",
    "Utilise exit_to_global_dispatcher seulement pour un vrai nouveau sujet hors recommandation coaching: demande autonome de rappel/statut/preference/produit pur, small talk sans besoin coaching, ou safety via coaching_intent=safety. Une variation de cas coaching n'est pas un exit.",
    "Regle prioritaire detresse (prime sur la continuation du flow): si le message courant porte de la devalorisation de soi ('je sers a rien', 'je suis un poids', 'au fond du trou'), du desespoir generalise ('a quoi bon', 'j'y arriverai jamais' etendu a la vie entiere) ou une idee de disparaitre / que ce serait pareil sans soi, tu ne recommandes AUCUN dispositif ce tour (ni carte, ni potion, ni feature) — meme si le flow etait en train d'en proposer un. Emets flow_action=exit_to_global_dispatcher avec coaching_intent.kind=safety: le tour devient un tour de soutien. Un simple decouragement lie a une action ratee ('degoute d'avoir rate mon sas') n'est PAS ce cas: le coaching continue, accueil emotionnel d'abord.",
    "Sortie obligatoire sur demande de MODIFICATION DURABLE du plan: 'modifier mon plan pour de bon', 'supprime/ajoute cette action', 'allege ma semaine', 'reorganise mon plan' → exit_to_global_dispatcher (coaching_intent=plan_misaligned), avec une note_information qui porte la demande exacte du user (ses mots) et le contexte coaching collecte. L'ajustement durable du plan n'appartient jamais au coaching, meme si la demande arrive au milieu d'une recommandation. Anti-faux-positif: adapter la MANIERE de faire une action ('comment je m'y prends ce soir', une variante du meme cas) reste du coaching, pas un ajustement de plan.",
    "Sortie sur REJET de la recommandation: si le user decline explicitement la reco posee ('non', 'pas ca', 'ca m'aide pas', 'je veux pas de carte') ET exprime une autre demande nettement typee (rappel, preference, produit, ajustement, information), exit_to_global_dispatcher avec note_information qui dit ce qui a ete propose, le refus, et la nouvelle demande (avec ses mots). S'il decline sans autre demande, ne re-propose pas la meme reco: clarifie le besoin ou soutiens.",
    "Anti-repetition de reco: previous_state porte la recommandation deja posee (current_recommendation/recommendation_decision). Une reco deja emise sur le meme topic dans ce flow ne se RE-PITCHE JAMAIS (ni re-nommer la technique, ni re-vendre le dispositif): si le user revient dessus, avance concretement (contenu, application au cas); s'il exprime un doute ou un echec, accueille d'abord puis propose au plus une VERSION MINIMALE ou une alternative differente — jamais la meme proposition reformulee une 3e fois.",
    "Au plus 4 tours: si le besoin est assez clair, recommande 1 feature principale et au plus 1 secondaire.",
    ...directEffectLocalDispatcherPromptLines(),
    ...localOneShotDirectEffectPromptLines("coaching_recommendation actif"),
    "Regle prioritaire create_one_shot_reminder pendant coaching_recommendation: si current_user_message contient une demande explicite de rappel ponctuel avec un delai ou moment exploitable, tu dois remplir direct_effect_request.requested=true, meme si le reste du message demande une clarification coaching, une recommandation, une explication ou un changement de cible. Ne mets jamais cette demande seulement dans coaching_intent.summary, user_need_summary, visible_task.instruction, evidence ou state_updates. Ces champs narratifs ne declenchent pas la lane directe. Le rappel ponctuel doit etre expose uniquement par direct_effect_request, puis le coaching continue sur le besoin restant.",
    "Regle de non-concurrence coaching: une demande de rappel ponctuel n'est pas une feature coaching, pas une target_switch, pas un exit_to_global_dispatcher et pas une raison de redemander le meme rappel. Elle coexiste avec recommend_feature, answer_followup ou continue_clarifying_need. Si le timing et l'instruction sont presents, remplis direct_effect_request; si tu as besoin de clarifier le coaching, clarifie le coaching seulement, pas le rappel.",
    "Invariant coaching direct-effect: les choix flow_action=continue_clarifying_need, recommend_feature ou answer_followup ne peuvent jamais effacer un direct_effect_request explicite. Si le user dit 'rappelle-moi dans X minutes de Y' et ajoute 'donne-moi le levier', 'aide-moi', 'explique' ou une question coaching, tu dois rendre les deux: direct_effect_request pour le rappel, et visible_task pour la partie coaching.",
    "Exemple direct_effect_request 1 - coaching + rappel ponctuel dans le meme message: user='Ca m'aide. Rappelle-moi dans 30 minutes de lancer le premier dossier, et dis-moi en une phrase pourquoi ce levier colle.' => reste dans coaching_recommendation pour expliquer le levier, et remplis direct_effect_request avec requested=true, effect_type=create_one_shot_reminder, explicitness=explicit, target_status=identified, payload_hint.raw_text='Rappelle-moi dans 30 minutes de lancer le premier dossier', payload_hint.when_hint='dans 30 minutes', payload_hint.UTC_time=instant ISO UTC calcule depuis platform_context.direct_effect_time_context, payload_hint.local_label='dans 30 minutes', payload_hint.instruction_hint='lancer le premier dossier'.",
    "Exemple direct_effect_request 2 - interruption explicite reminder-only pendant coaching: user='Avant de repondre au blocage, cree juste le rappel: rappelle-moi dans 32 minutes de lancer le premier dossier.' => ne sors pas vers global, ne redemande pas le rappel, continue coaching_recommendation sur le besoin restant et remplis direct_effect_request avec requested=true, effect_type=create_one_shot_reminder, explicitness=explicit, target_status=identified, payload_hint.raw_text='rappelle-moi dans 32 minutes de lancer le premier dossier', payload_hint.when_hint='dans 32 minutes', payload_hint.UTC_time=instant ISO UTC calcule depuis platform_context.direct_effect_time_context, payload_hint.local_label='dans 32 minutes', payload_hint.instruction_hint='lancer le premier dossier'.",
    'Example JSON direct_effect_request coaching - rappel + levier dans le meme tour: user="Je bloque surtout sur le premier email. Rappelle-moi dans 28 minutes d ouvrir ce premier email, et donne-moi juste le levier a utiliser." => inclure obligatoirement {"flow_action":"recommend_feature","direct_effect_request":{"requested":true,"effect_type":"create_one_shot_reminder","explicitness":"explicit","target_status":"identified","confidence_band":"high","payload_hint":{"raw_text":"Rappelle-moi dans 28 minutes d ouvrir ce premier email","when_hint":"dans 28 minutes","UTC_time":"instant ISO UTC calcule depuis platform_context.direct_effect_time_context","local_label":"dans 28 minutes","instruction_hint":"ouvrir ce premier email"},"reason":"rappel ponctuel explicite avec delai exploitable"},"visible_task":{"kind":"action_plan_coaching","instruction":"repondre seulement au besoin coaching restant, sans confirmer le rappel avant commit"}}.',
    JSON.stringify({
      current_user_message: input.user_message,
      recent_messages: input.recent_messages.slice(-8),
      previous_state: input.previous_state,
      dispatcher_signal_context: input.dispatcher_signal_context ?? null,
      active_plan_items: input.active_plan_items.slice(0, 8),
      inbound_note_information: input.inbound_note_information ?? null,
      coaching_feature_product_guidance:
        coachingFeatureProductGuidanceCatalog(),
      platform_context: withDirectEffectLocalContext(
        {},
        (input.turn_frame as any)?.plan_snapshot ?? null,
        undefined,
        directEffectTimeContextFromTurnFrame(input.turn_frame),
      ),
      direct_effect_lane: (input.turn_frame as any)?.direct_effect_lane ?? null,
      direct_effect_confirmation_context:
        (input.turn_frame as any)?.direct_effect_confirmation_context ?? null,
      expected_json_shape: {
        coherence_contract: {
          exit_to_global_dispatcher:
            "autorise seulement pour un vrai sujet hors coaching; exige feature_candidates=[], recommendation.primary_feature=null, recommendation.secondary_feature=null, visible_task.kind=exit_ack, state_updates.status=exit_to_global, note_information non-null",
          active_recommendation:
            "si une feature coaching est recommandee ou si visible_task.kind est action_plan_coaching/no_plan_coaching/emotion_coaching, flow_action doit etre recommend_feature|answer_followup|compare_features et state_updates.status=active",
          forbidden_contradiction:
            "ne rends jamais flow_action=exit_to_global_dispatcher avec current_recommendation, recommendation.primary_feature, feature_candidates non vides ou visible_task de coaching actif",
          stable_recommendation_product_followup:
            "si le user demande ou/comment preparer ou trouver la feature deja recommandee, utiliser answer_followup + agent specialise courant; ne jamais choisir change_confirm_coaching_type, target_switch ou exit",
        },
        flow_action:
          "continue_clarifying_need|compare_features|recommend_feature|answer_followup|close_flow|exit_to_global_dispatcher",
        confidence: "low|medium|high",
        risk_score: 0,
        coaching_intent: {
          kind:
            "stuck_action|forgetting|avoidance|risk_moment|plan_misaligned|feature_choice|preference_request|general_support|off_topic|safety|unclear",
          summary: "string",
        },
        target_switch: {
          status: "none|explicit|ambiguous",
          to_coaching_type: "plan_action|no_plan_action|emotional|unclear|null",
          target: {
            kind: "plan_action|free_action|emotional_state|null",
            title:
              "nom user-facing de la nouvelle action/cible/etat emotionnel ou null",
            source: "plan|free|none|ambiguous",
            plan_item_id: "string|null",
          },
        },
        feature_candidates: [],
        recommendation: {
          primary_feature:
            "adjust_plan|attack_card|defense_card|state_potion|null",
          secondary_feature:
            "adjust_plan|attack_card|defense_card|state_potion|null",
          why_primary: "string|null",
          user_facing_next_step: "string|null",
        },
        direct_effect_request: LOCAL_ONE_SHOT_DIRECT_EFFECT_EXPECTED_JSON_SHAPE,
        state_updates: {
          stage: "understand_need|compare_options|recommend|followup|closing",
          status: "active|closing|closed|exit_to_global",
          turn_count_increment: 1,
          close_after_visible: false,
        },
        visible_task: {
          kind:
            "change_confirm_coaching_type|emotion_coaching|no_plan_coaching|action_plan_coaching|answer_followup|close_recommendation|exit_ack",
          instruction: "string",
          conversation_context: {},
          flow_context: {
            dispatcher_signal_context:
              "copie filtree du dispatcher_signal_context ou null",
            direct_effect_confirmation_context:
              "copie filtree du direct_effect_confirmation_context ou null",
            coaching_type: "plan_action|no_plan_action|emotional|unclear",
            candidate_coaching_type:
              "plan_action|no_plan_action|emotional|unclear|null",
            coaching_type_reason: "string|null",
            product_guidance:
              "fiches produit canoniques utiles pour adjust_plan, attack_card, defense_card, state_potion",
            difficulty: {
              target_kind: "plan_action|free_action|emotional_state|unclear",
              summary: "string|null",
              action_title: "string|null",
              action_source: "plan|free|none|ambiguous",
            },
            cause_analysis: {
              primary_cause:
                "forgetting|launch_blocker|avoidance|risk_moment|too_hard|rhythm_mismatch|misaligned_action|emotional_overload|unclear",
              why_it_exists: "string|null",
              confidence: "low|medium|high",
              missing_info: [],
            },
            recommendation: {
              primary_feature:
                "adjust_plan|attack_card|defense_card|state_potion|null",
              secondary_feature:
                "adjust_plan|attack_card|defense_card|state_potion|null",
              why_primary: "string|null",
              why_not_others: {},
              platform_destination: {
                label: "string|null",
                surface_hint: "string|null",
                user_facing_destination:
                  "elements UI sous forme key=value; ce n'est pas une phrase visible a recopier",
              },
              user_facing_next_step: "string|null",
            },
            evidence_used: [],
            missing_or_weak_values: [],
            tone_constraints: [],
            do_not_say: [],
          },
          step_context: {
            task_kind:
              "change_confirm_coaching_type|emotion_coaching|no_plan_coaching|action_plan_coaching|answer_followup|close_recommendation|exit_ack",
            objective: "string",
            product_guidance:
              "fiches produit utiles au type courant; attack_card/defense_card possibles pour no_plan_coaching libre",
          },
        },
        note_information: null,
        exit_memo: {},
        evidence: [],
      },
    }),
  ].join("\n");
}

export async function runCoachingRecommendationLocalDispatcher(
  input: CoachingRecommendationLocalDispatcherInput,
): Promise<CoachingRecommendationLocalDispatcherOutput | null> {
  try {
    const prompt = dispatcherPrompt(input);
    const generationOptions = {
      requestId: input.request_id ?? undefined,
      userId: input.user_id,
      model: getGlobalAiModel("gemini-2.5-flash"),
      source: "coaching_recommendation.local_dispatcher",
      forceRealAi: true,
      reasoningEffort: "low" as const,
      httpTimeoutMs: 45_000,
      maxRetries: 1,
    };
    const raw = await generateWithGemini(
      prompt,
      input.user_message,
      0.1,
      true,
      [],
      "auto",
      generationOptions,
    );
    const normalized = normalizeCoachingRecommendationLocalDispatcherOutput(
      raw,
    );
    const contractError = stableProductFollowupContractError({
      previous: input.previous_state,
      output: normalized,
    });
    if (!contractError) return normalized;

    const retryRaw = await generateWithGemini(
      [
        prompt,
        "Correction contractuelle obligatoire:",
        `Erreur detectee: ${contractError}.`,
        "- Tu as une recommandation stable precedente et tu as choisi change_confirm_coaching_type.",
        "- Repare uniquement le JSON dispatcher.",
        "- Utilise flow_action=answer_followup, state_updates.status=active, target_switch.status=none.",
        "- Garde recommendation.primary_feature sur le levier stable et utilise l'agent specialise du coaching_type courant.",
        "- Ne cree pas de pending_type_change et ne produis pas exit_to_global_dispatcher.",
      ].join("\n"),
      JSON.stringify({
        current_user_message: input.user_message,
        previous_state: input.previous_state,
        invalid_output: normalized,
        contract_error: contractError,
      }),
      0.05,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "coaching_recommendation.local_dispatcher.contract_retry",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 0,
      },
    );
    const retryNormalized =
      normalizeCoachingRecommendationLocalDispatcherOutput(
        retryRaw,
      );
    return stableProductFollowupContractError({
        previous: input.previous_state,
        output: retryNormalized,
      })
      ? normalized
      : retryNormalized;
  } catch (error) {
    console.warn("[CoachingRecommendation] local dispatcher failed", error);
    return null;
  }
}
