import {
  type CoachingBlockerType,
  type CoachingTechniqueId,
  getCoachingBlockerDefinition,
  getCoachingTechniqueDefinition,
  getTechniqueCandidatesForBlocker,
  listCoachingBlockers,
  listCoachingTechniques,
} from "./coaching_interventions.ts";
import { generateWithGemini, getGlobalAiModel } from "../_shared/gemini.ts";
import {
  type MomentumBlockerStage,
  type MomentumStateLabel,
  readMomentumStateV2,
  type StoredMomentumV2,
} from "./momentum_state.ts";
import type {
  MomentumPosture,
  PlanDimension,
  PlanItemKind,
  PlanItemStatus,
} from "../_shared/v2-types.ts";

export type CoachingScope = "micro" | "structural";

export type CoachingV2PlanItemContext = {
  id: string;
  dimension: PlanDimension;
  kind: PlanItemKind;
  title: string;
  status: PlanItemStatus;
};

export type CoachingV2MomentumContext = {
  plan_fit: "good" | "uncertain" | "poor";
  load_balance: "balanced" | "slightly_heavy" | "overloaded";
  active_load_score: number;
  needs_reduce: boolean;
  blocker_kind: "mission" | "habit" | "support" | "global" | null;
  top_risk: string | null;
  posture: MomentumPosture;
};

export type CoachingInterventionTriggerKind =
  | "explicit_blocker"
  | "explicit_craving"
  | "repeated_delay"
  | "repeated_failure"
  | "post_relapse"
  | "weekly_review"
  | "coach_request";

export type CoachingInterventionOutcome =
  | "unknown"
  | "not_tried"
  | "tried_not_helpful"
  | "tried_helpful"
  | "behavior_changed";

export type CoachingInterventionGate =
  | "allow"
  | "allow_light_only"
  | "explicit_request_only"
  | "blocked";

export type CoachingInterventionDecision = "skip" | "clarify" | "propose";
export type CoachingInterventionConfidence = "low" | "medium" | "high";
export type CoachingInterventionIntensity = "tiny" | "light" | "standard";
export type CoachingMessageAngle =
  | "direct_action_now"
  | "gentle_experiment"
  | "urge_management"
  | "environment_reset"
  | "self_compassion_reset";

export interface CoachingInterventionTechniqueHistory {
  technique_id: CoachingTechniqueId;
  blocker_type?: CoachingBlockerType | null;
  outcome: CoachingInterventionOutcome;
  helpful?: boolean | null;
  last_used_at?: string | null;
}

export interface CoachingInterventionSelectorInput {
  momentum_state?: MomentumStateLabel | null;
  explicit_help_request?: boolean;
  trigger_kind: CoachingInterventionTriggerKind;
  last_user_message: string;
  recent_context_summary?: string | null;
  target_action_title?: string | null;
  target_plan_item?: CoachingV2PlanItemContext | null;
  v2_momentum?: CoachingV2MomentumContext | null;
  known_blockers?: Array<{
    blocker_type: CoachingBlockerType;
    confidence?: CoachingInterventionConfidence;
  }>;
  technique_history?: CoachingInterventionTechniqueHistory[];
  coach_preferences?: {
    tone?: string | null;
    challenge_level?: string | null;
    message_length?: string | null;
  };
  safety?: {
    distress_detected?: boolean;
    pause_requested?: boolean;
  };
}

export interface CoachingInterventionSelectorOutput {
  eligible: boolean;
  gate: CoachingInterventionGate;
  decision: CoachingInterventionDecision;
  reason: string;
  blocker_type: CoachingBlockerType | "unknown";
  confidence: CoachingInterventionConfidence;
  need_clarification: boolean;
  recommended_technique: CoachingTechniqueId | null;
  technique_candidates: CoachingTechniqueId[];
  message_angle: CoachingMessageAngle | null;
  intensity: CoachingInterventionIntensity | null;
  follow_up_needed: boolean;
  follow_up_window_hours: number | null;
  coaching_scope: CoachingScope | null;
  simplify_instead: boolean;
  dimension_strategy: string | null;
}

export interface CoachingInterventionGateDecision {
  gate: CoachingInterventionGate;
  eligible: boolean;
  state: MomentumStateLabel | null;
  reason: string;
  intensity_cap: CoachingInterventionIntensity | null;
}

export interface CoachingInterventionRuntimeAddon
  extends CoachingInterventionSelectorOutput {
  trigger_kind: CoachingInterventionTriggerKind;
  explicit_help_request: boolean;
  target_action_title?: string | null;
  target_plan_item?: CoachingV2PlanItemContext | null;
  selector_source: "llm" | "fallback";
  decided_at: string;
}

export interface CoachingInterventionTriggerDetection {
  trigger_kind: CoachingInterventionTriggerKind;
  explicit_help_request: boolean;
  blocker_hint?: CoachingBlockerType;
}

const GATE_BY_STATE: Record<
  MomentumStateLabel,
  {
    gate: CoachingInterventionGate;
    intensity_cap: CoachingInterventionIntensity | null;
    reason: string;
  }
> = {
  momentum: {
    gate: "allow",
    intensity_cap: "standard",
    reason: "momentum_state_allows_concrete_coaching",
  },
  friction_legere: {
    gate: "allow",
    intensity_cap: "standard",
    reason: "friction_state_prioritizes_concrete_coaching",
  },
  evitement: {
    gate: "allow_light_only",
    intensity_cap: "light",
    reason: "avoidance_state_allows_only_light_interventions",
  },
  pause_consentie: {
    gate: "blocked",
    intensity_cap: null,
    reason: "pause_state_blocks_coaching_interventions",
  },
  soutien_emotionnel: {
    gate: "explicit_request_only",
    intensity_cap: "light",
    reason: "emotional_support_requires_explicit_request",
  },
  reactivation: {
    gate: "explicit_request_only",
    intensity_cap: "light",
    reason: "reactivation_requires_explicit_request",
  },
};

const FOLLOW_UP_HOURS_BY_INTENSITY: Record<
  Exclude<CoachingInterventionIntensity, "tiny">,
  number
> = {
  light: 24,
  standard: 18,
};

const VALID_BLOCKER_TYPES = new Set(
  listCoachingBlockers().map((item) => item.id),
);
const VALID_TECHNIQUE_IDS = new Set(
  listCoachingTechniques().map((item) => item.id),
);
const HELP_REQUEST_PATTERNS = [
  /\baide[- ]?moi\b/i,
  /\baide moi\b/i,
  /\bquoi faire\b/i,
  /\bcomment faire\b/i,
  /\bquelle technique\b/i,
  /\bun conseil\b/i,
  /\bune astuce\b/i,
];
const BLOCKER_PATTERNS = [
  /\bje bloque\b/i,
  /\bca bloque\b/i,
  /\bça bloque\b/i,
  /\bca coince\b/i,
  /\bça coince\b/i,
  /\bj[' ]?y arrive pas\b/i,
  /\bje n[' ]?y arrive pas\b/i,
  /\bje procrastine\b/i,
  /\bje repousse\b/i,
];
const CRAVING_PATTERNS = [
  /\benvie de\b/i,
  /\bje vais craquer\b/i,
  /\bje craque\b/i,
  /\bj[' ]?ai craqu[eé]\b/i,
  /\bcigarette\b/i,
  /\bfumer\b/i,
  /\bscroll\b/i,
  /\bsucre\b/i,
  /\balcool\b/i,
];
const RELAPSE_PATTERNS = [
  /\bj[' ]?ai encore rat[eé]\b/i,
  /\bc[' ]?est foutu\b/i,
  /\bc[' ]?est mort\b/i,
  /\bje replonge\b/i,
  /\bj[' ]?ai rechut[eé]\b/i,
  /\bj[' ]?ai encore craqu[eé]\b/i,
];

const DIMENSION_COACHING_STRATEGIES: Record<
  "missions" | "habits" | "support",
  { micro: string[]; structural: string[] }
> = {
  missions: {
    micro: [
      "clarifier le prochain geste concret",
      "reduire a une version minimale",
      "pre-engager avec un plan si-alors",
      "decouper en sous-etapes",
    ],
    structural: [
      "la mission est trop grosse pour le niveau actuel",
      "la mission n'est pas assez claire",
      "il faut revoir le decoupage du plan",
    ],
  },
  habits: {
    micro: [
      "reduire la friction de demarrage",
      "soutenir la repetition",
      "proteger l'opportunite apres un rate",
    ],
    structural: [
      "la cadence est trop ambitieuse",
      "l'habitude n'est pas adaptee au quotidien actuel",
      "il faut passer en maintenance ou desactiver",
    ],
  },
  support: {
    micro: [
      "verifier que le support est utile maintenant",
      "adapter le timing d'acces",
      "simplifier le mode d'engagement",
    ],
    structural: [
      "ce support n'est pas pertinent pour le blocage actuel",
      "le support arrive trop tot ou trop tard",
      "il faut revoir le mode de support",
    ],
  },
};

function deriveKindSpecificFocus(
  planItem: CoachingV2PlanItemContext,
): string | null {
  if (planItem.dimension === "missions") {
    switch (planItem.kind) {
      case "task":
        return "viser un prochain pas executable tout de suite";
      case "milestone":
        return "ramener le jalon a un premier passage concret";
      case "exercise":
        return "preciser l'exercice et son declencheur";
      default:
        return "clarifier le bon niveau d'action";
    }
  }

  if (planItem.dimension === "habits") {
    return "proteger la repetition dans le quotidien reel";
  }

  if (planItem.dimension === "support") {
    switch (planItem.kind) {
      case "framework":
        return "verifier l'utilite concrete et l'acces au support";
      case "exercise":
        return "verifier si l'exercice aide maintenant ou ajoute de la charge";
      default:
        return "repositionner le support au bon moment";
    }
  }

  return null;
}

function deriveDimensionStrategy(
  planItem: CoachingV2PlanItemContext | null | undefined,
): string | null {
  if (!planItem) return null;
  const dim = planItem.dimension;
  if (dim !== "missions" && dim !== "habits" && dim !== "support") return null;
  const strategies = DIMENSION_COACHING_STRATEGIES[dim];
  const kindFocus = deriveKindSpecificFocus(planItem);
  return `Dimension ${dim} (kind=${planItem.kind}${
    kindFocus ? `, focus=${kindFocus}` : ""
  }): micro=[${
    strategies.micro.join("; ")
  }], structural=[${strategies.structural.join("; ")}]`;
}

function deriveCoachingScope(args: {
  v2Momentum?: CoachingV2MomentumContext | null;
  planItem?: CoachingV2PlanItemContext | null;
}): CoachingScope {
  if (args.v2Momentum) {
    if (args.v2Momentum.plan_fit === "poor") return "structural";
    if (args.v2Momentum.load_balance === "overloaded") return "structural";
    if (args.v2Momentum.needs_reduce) return "structural";
  }
  if (args.planItem?.status === "stalled") return "structural";
  return "micro";
}

function shouldSimplifyInstead(
  v2Momentum?: CoachingV2MomentumContext | null,
): boolean {
  if (!v2Momentum) return false;
  return v2Momentum.load_balance === "overloaded" || v2Momentum.needs_reduce;
}

function parseIsoMs(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function normalizeBlockerType(value: unknown): CoachingBlockerType | "unknown" {
  const normalized = String(value ?? "").trim();
  return VALID_BLOCKER_TYPES.has(normalized as CoachingBlockerType)
    ? normalized as CoachingBlockerType
    : "unknown";
}

function normalizeTechniqueId(value: unknown): CoachingTechniqueId | null {
  const normalized = String(value ?? "").trim();
  return VALID_TECHNIQUE_IDS.has(normalized as CoachingTechniqueId)
    ? normalized as CoachingTechniqueId
    : null;
}

function normalizeConfidence(value: unknown): CoachingInterventionConfidence {
  const normalized = String(value ?? "").trim();
  if (normalized === "high" || normalized === "medium") return normalized;
  return "low";
}

function normalizeDecision(
  value: unknown,
): CoachingInterventionDecision {
  const normalized = String(value ?? "").trim();
  if (normalized === "propose" || normalized === "clarify") return normalized;
  return "skip";
}

function normalizeGate(value: unknown): CoachingInterventionGate {
  const normalized = String(value ?? "").trim();
  if (
    normalized === "allow" || normalized === "allow_light_only" ||
    normalized === "explicit_request_only"
  ) {
    return normalized;
  }
  return "blocked";
}

function normalizeIntensity(
  value: unknown,
): CoachingInterventionIntensity | null {
  const normalized = String(value ?? "").trim();
  if (
    normalized === "tiny" || normalized === "light" || normalized === "standard"
  ) {
    return normalized;
  }
  return null;
}

function normalizeMessageAngle(value: unknown): CoachingMessageAngle | null {
  const normalized = String(value ?? "").trim();
  switch (normalized) {
    case "direct_action_now":
    case "gentle_experiment":
    case "urge_management":
    case "environment_reset":
    case "self_compassion_reset":
      return normalized;
    default:
      return null;
  }
}

function clampTechniqueCandidates(
  ids: unknown,
): CoachingTechniqueId[] {
  if (!Array.isArray(ids)) return [];
  const out: CoachingTechniqueId[] = [];
  for (const item of ids) {
    const techniqueId = normalizeTechniqueId(item);
    if (!techniqueId || out.includes(techniqueId)) continue;
    out.push(techniqueId);
    if (out.length >= 4) break;
  }
  return out;
}

function chooseFallbackTechnique(
  blockerType: CoachingBlockerType | "unknown",
  history: CoachingInterventionTechniqueHistory[],
): CoachingTechniqueId | null {
  if (blockerType === "unknown") return null;
  const candidates = getTechniqueCandidatesForBlocker(blockerType);
  const ordered = [...candidates.primary, ...candidates.secondary];
  let bestTechnique: CoachingTechniqueId | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const techniqueId of ordered) {
    const items = history.filter((item) => item.technique_id === techniqueId);
    let score = 0;
    if (items.length === 0) score += 2;
    for (const item of items) {
      switch (item.outcome) {
        case "behavior_changed":
          score += 6;
          break;
        case "tried_helpful":
          score += 4;
          break;
        case "tried_not_helpful":
          score -= 5;
          break;
        case "not_tried":
          score -= 2;
          break;
        default:
          score += 0;
      }
      const lastUsedMs = parseIsoMs(item.last_used_at ?? null);
      if (lastUsedMs > 0 && Date.now() - lastUsedMs < 24 * 60 * 60 * 1000) {
        score -= 2;
      }
    }
    if (candidates.primary.includes(techniqueId)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestTechnique = techniqueId;
    }
  }

  return bestTechnique ?? ordered[0] ?? null;
}

function guessBlockerFromMessage(message: string): CoachingBlockerType | null {
  const text = String(message ?? "");
  if (CRAVING_PATTERNS.some((pattern) => pattern.test(text))) {
    return "craving_or_urge";
  }
  if (RELAPSE_PATTERNS.some((pattern) => pattern.test(text))) {
    return "relapse_discouragement";
  }
  if (
    /trop flou|trop vague|trop gros|je sais pas par quoi commencer/i.test(text)
  ) {
    return "overwhelm_or_blur";
  }
  if (/stress|angoisse|j'evite|j'évite|peur de|honte/i.test(text)) {
    return "emotional_avoidance";
  }
  if (
    /le soir|chez moi|au bureau|quand je rentre|avec eux|dans cette piece|dans cette pièce/i
      .test(text)
  ) {
    return "environment_mismatch";
  }
  if (BLOCKER_PATTERNS.some((pattern) => pattern.test(text))) {
    return "startup_inertia";
  }
  return null;
}

function buildMessageAngle(
  blockerType: CoachingBlockerType | "unknown",
): CoachingMessageAngle | null {
  switch (blockerType) {
    case "craving_or_urge":
      return "urge_management";
    case "environment_mismatch":
      return "environment_reset";
    case "relapse_discouragement":
      return "self_compassion_reset";
    case "startup_inertia":
    case "overwhelm_or_blur":
    case "emotional_avoidance":
      return "gentle_experiment";
    default:
      return null;
  }
}

export function detectCoachingInterventionTrigger(args: {
  userMessage: string;
  actionHint?: string | null;
  progressStatusHint?: string | null;
  topBlockerStage?: MomentumBlockerStage | null;
}): CoachingInterventionTriggerDetection | null {
  const text = String(args.userMessage ?? "").trim();
  if (!text) return null;

  const explicitHelpRequest = HELP_REQUEST_PATTERNS.some((pattern) =>
    pattern.test(text)
  );
  const craving = CRAVING_PATTERNS.some((pattern) => pattern.test(text));
  const relapse = RELAPSE_PATTERNS.some((pattern) => pattern.test(text));
  const blocker = BLOCKER_PATTERNS.some((pattern) => pattern.test(text));
  const repeatedFailure =
    String(args.progressStatusHint ?? "").trim() === "missed" &&
    (String(args.topBlockerStage ?? "") === "recurrent" ||
      String(args.topBlockerStage ?? "") === "chronic");

  if (craving) {
    return {
      trigger_kind: "explicit_craving",
      explicit_help_request: explicitHelpRequest,
      blocker_hint: "craving_or_urge",
    };
  }
  if (relapse) {
    return {
      trigger_kind: "post_relapse",
      explicit_help_request: explicitHelpRequest,
      blocker_hint: "relapse_discouragement",
    };
  }
  if (repeatedFailure && args.actionHint) {
    return {
      trigger_kind: "repeated_failure",
      explicit_help_request: explicitHelpRequest,
    };
  }
  if (blocker) {
    return {
      trigger_kind: "explicit_blocker",
      explicit_help_request: explicitHelpRequest,
      blocker_hint: guessBlockerFromMessage(text) ?? "startup_inertia",
    };
  }
  if (explicitHelpRequest) {
    return {
      trigger_kind: "coach_request",
      explicit_help_request: true,
      blocker_hint: guessBlockerFromMessage(text) ?? undefined,
    };
  }
  return null;
}

export function buildKnownCoachingBlockersFromTempMemory(
  tempMemory: any,
): Array<{
  blocker_type: CoachingBlockerType;
  confidence: CoachingInterventionConfidence;
}> {
  const momentumV2 = readMomentumStateV2(tempMemory);
  return buildKnownCoachingBlockersFromMomentumV2(momentumV2);
}

export function buildKnownCoachingBlockersFromMomentumV2(
  momentum: StoredMomentumV2,
): Array<{
  blocker_type: CoachingBlockerType;
  confidence: CoachingInterventionConfidence;
}> {
  const out: Array<{
    blocker_type: CoachingBlockerType;
    confidence: CoachingInterventionConfidence;
  }> = [];

  const blockerKind = momentum.blockers?.blocker_kind;
  const repeatScore = momentum.blockers?.blocker_repeat_score ?? 0;

  if (blockerKind) {
    const mapped = mapV2BlockerKindToCoachingBlocker(blockerKind, momentum);
    if (mapped) {
      out.push({
        blocker_type: mapped,
        confidence: repeatScore >= 6
          ? "high"
          : repeatScore >= 3
          ? "medium"
          : "low",
      });
    }
  }

  const topRisk = momentum.assessment?.top_risk;
  if (
    topRisk === "avoidance" &&
    !out.some((b) => b.blocker_type === "emotional_avoidance")
  ) {
    out.push({ blocker_type: "emotional_avoidance", confidence: "medium" });
  }
  if (
    topRisk === "load" &&
    !out.some((b) => b.blocker_type === "overwhelm_or_blur")
  ) {
    out.push({ blocker_type: "overwhelm_or_blur", confidence: "medium" });
  }

  return out.slice(0, 3);
}

function mapV2BlockerKindToCoachingBlocker(
  kind: "mission" | "habit" | "support" | "global",
  momentum: StoredMomentumV2,
): CoachingBlockerType | null {
  const loadOverloaded =
    momentum.dimensions?.load_balance?.level === "overloaded";
  const planFitPoor = momentum.dimensions?.plan_fit?.level === "poor";

  if (loadOverloaded || planFitPoor) return "overwhelm_or_blur";

  switch (kind) {
    case "mission":
      return "startup_inertia";
    case "habit":
      return "startup_inertia";
    case "support":
      return "overwhelm_or_blur";
    case "global":
      return "overwhelm_or_blur";
    default:
      return null;
  }
}

export function buildFallbackCoachingInterventionDecision(args: {
  input: CoachingInterventionSelectorInput;
  gateDecision: CoachingInterventionGateDecision;
}): CoachingInterventionSelectorOutput {
  const history = Array.isArray(args.input.technique_history)
    ? args.input.technique_history
    : [];
  const blockerType = args.input.known_blockers?.[0]?.blocker_type ??
    guessBlockerFromMessage(args.input.last_user_message) ??
    "unknown";
  const v2m = args.input.v2_momentum;
  const planItem = args.input.target_plan_item;
  const simplify = shouldSimplifyInstead(v2m);
  const scope = deriveCoachingScope({ v2Momentum: v2m, planItem });
  const dimStrategy = deriveDimensionStrategy(planItem);

  if (!args.gateDecision.eligible) {
    return {
      eligible: false,
      gate: args.gateDecision.gate,
      decision: "skip",
      reason: args.gateDecision.reason,
      blocker_type: blockerType,
      confidence: "low",
      need_clarification: false,
      recommended_technique: null,
      technique_candidates: [],
      message_angle: null,
      intensity: null,
      follow_up_needed: false,
      follow_up_window_hours: null,
      coaching_scope: null,
      simplify_instead: false,
      dimension_strategy: null,
    };
  }

  if (simplify) {
    return {
      eligible: true,
      gate: args.gateDecision.gate,
      decision: "propose",
      reason: "selector_fallback_simplify_due_to_overload",
      blocker_type: blockerType === "unknown"
        ? "overwhelm_or_blur"
        : blockerType,
      confidence: "medium",
      need_clarification: false,
      recommended_technique: null,
      technique_candidates: [],
      message_angle: "gentle_experiment",
      intensity: "light",
      follow_up_needed: false,
      follow_up_window_hours: null,
      coaching_scope: "structural",
      simplify_instead: true,
      dimension_strategy: dimStrategy,
    };
  }

  if (blockerType === "unknown") {
    return {
      eligible: true,
      gate: args.gateDecision.gate,
      decision: "clarify",
      reason: "selector_fallback_needs_clarification",
      blocker_type: "unknown",
      confidence: "low",
      need_clarification: true,
      recommended_technique: null,
      technique_candidates: [],
      message_angle: "gentle_experiment",
      intensity: args.gateDecision.intensity_cap ?? "light",
      follow_up_needed: false,
      follow_up_window_hours: null,
      coaching_scope: scope,
      simplify_instead: false,
      dimension_strategy: dimStrategy,
    };
  }

  const recommendedTechnique = chooseFallbackTechnique(blockerType, history);
  const bundle = getTechniqueCandidatesForBlocker(blockerType);
  const intensity = args.gateDecision.gate === "allow"
    ? args.input.trigger_kind === "post_relapse" ? "light" : "standard"
    : args.gateDecision.intensity_cap ?? "light";

  return {
    eligible: true,
    gate: args.gateDecision.gate,
    decision: recommendedTechnique ? "propose" : "clarify",
    reason: "selector_fallback_from_catalog",
    blocker_type: blockerType,
    confidence: args.input.known_blockers?.[0]?.confidence ?? "medium",
    need_clarification: !recommendedTechnique,
    recommended_technique: recommendedTechnique,
    technique_candidates: bundle.primary,
    message_angle: buildMessageAngle(blockerType),
    intensity,
    follow_up_needed: Boolean(recommendedTechnique),
    follow_up_window_hours: recommendedTechnique
      ? intensity === "standard"
        ? FOLLOW_UP_HOURS_BY_INTENSITY.standard
        : FOLLOW_UP_HOURS_BY_INTENSITY.light
      : null,
    coaching_scope: scope,
    simplify_instead: false,
    dimension_strategy: dimStrategy,
  };
}

export function decideCoachingInterventionGate(args: {
  tempMemory?: any;
  momentum_state?: MomentumStateLabel | null;
  explicit_help_request?: boolean;
  distress_detected?: boolean;
  pause_requested?: boolean;
  v2_momentum?: CoachingV2MomentumContext | null;
}): CoachingInterventionGateDecision {
  if (args.pause_requested) {
    return {
      gate: "blocked",
      eligible: false,
      state: "pause_consentie",
      reason: "pause_requested_blocks_coaching_interventions",
      intensity_cap: null,
    };
  }

  if (args.distress_detected) {
    const v2State = args.tempMemory
      ? readMomentumStateV2(args.tempMemory).current_state
      : null;
    return {
      gate: "blocked",
      eligible: false,
      state: args.momentum_state ?? v2State ?? null,
      reason: "distress_detected_blocks_performance_interventions",
      intensity_cap: null,
    };
  }

  const v2 = args.tempMemory ? readMomentumStateV2(args.tempMemory) : null;
  const state = args.momentum_state ?? v2?.current_state ?? null;
  if (!state) {
    return {
      gate: "allow",
      eligible: true,
      state: null,
      reason: "momentum_state_missing_allow_phase1_fallback",
      intensity_cap: "standard",
    };
  }

  const config = GATE_BY_STATE[state];
  if (config.gate === "blocked") {
    return {
      gate: config.gate,
      eligible: false,
      state,
      reason: config.reason,
      intensity_cap: null,
    };
  }

  if (config.gate === "explicit_request_only" && !args.explicit_help_request) {
    return {
      gate: config.gate,
      eligible: false,
      state,
      reason: `${config.reason}:missing_explicit_request`,
      intensity_cap: config.intensity_cap,
    };
  }

  const v2m = args.v2_momentum;
  if (v2m && (v2m.load_balance === "overloaded" || v2m.needs_reduce)) {
    const cappedIntensity = config.intensity_cap === "standard"
      ? "light"
      : config.intensity_cap;
    return {
      gate: config.gate === "allow" ? "allow_light_only" : config.gate,
      eligible: true,
      state,
      reason: `${config.reason}:load_overloaded_cap_to_light`,
      intensity_cap: cappedIntensity,
    };
  }

  return {
    gate: config.gate,
    eligible: true,
    state,
    reason: config.reason,
    intensity_cap: config.intensity_cap,
  };
}

export function buildCoachingInterventionSelectorPrompt(): string {
  const blockerSection = listCoachingBlockers()
    .map((blocker) =>
      `- ${blocker.id}: ${blocker.label}. ${blocker.summary} Signaux: ${
        blocker.detection_hints.join("; ")
      }`
    )
    .join("\n");
  const techniqueSection = listCoachingTechniques()
    .map((technique) =>
      `- ${technique.id}: ${technique.label}. ${technique.summary} Usage prioritaire: ${
        technique.use_when.join(", ")
      }.`
    )
    .join("\n");

  return `
Tu es le micro-selecteur d'intervention coach de Sophia.

Ton role:
- decider si une intervention concrete est pertinente maintenant;
- identifier le blocage le plus probable parmi la liste autorisee;
- choisir au maximum UNE technique parmi le catalogue autorise;
- demander au maximum UNE clarification si la confiance est insuffisante;
- respecter strictement les garde-fous du momentum gate;
- differencier micro-coaching (technique ponctuelle en chat) de structural coaching (ajustement du plan necessaire).

Blocages autorises:
${blockerSection}

Techniques autorisees:
${techniqueSection}

Strategies par dimension du plan:
- missions (task, milestone, exercise): clarifier le prochain geste concret, reduire a une version minimale, pre-engager avec un plan si-alors, decouper en sous-etapes.
- habits (habit): reduire la friction de demarrage, soutenir la repetition, proteger l'opportunite apres un rate.
- support (framework, understanding, rescue): verifier que le support est utile maintenant, adapter le timing, simplifier le mode d'engagement.

Distinction coaching_scope:
- micro: technique ponctuelle applicable dans le chat, sans toucher au plan.
- structural: le blocage revele un probleme de plan (trop d'items, item mal dimensionne, cadence inadaptee). Il faut signaler le besoin d'ajustement.

Regle de surcharge (simplify_instead):
- Si load_balance=overloaded OU needs_reduce=true, la bonne reponse est souvent de simplifier (reduire la charge) plutot que de proposer une technique supplementaire.
- Dans ce cas, mets simplify_instead=true, coaching_scope=structural, recommended_technique=null et technique_candidates=[].

Regles fortes:
- N'invente jamais un blocage hors liste.
- N'invente jamais une technique hors liste.
- Si le gate vaut blocked, tu renvoies decision=skip.
- Si le gate vaut allow_light_only, intensite maximale = light.
- Si le gate vaut explicit_request_only et que eligible=false, tu renvoies decision=skip.
- Une seule technique maximum.
- Si la confiance est faible, privilegie decision=clarify plutot qu'un conseil hasardeux.
- Si l'utilisateur est en rechute ou auto-jugement, favorise une approche de reset plutot qu'une pression supplementaire.
- Le chat ne modifie pas le dashboard: il propose, clarifie, suit, apprend.

Reponds en JSON STRICT:
{
  "eligible": boolean,
  "gate": "allow" | "allow_light_only" | "explicit_request_only" | "blocked",
  "decision": "skip" | "clarify" | "propose",
  "reason": string,
  "blocker_type": "startup_inertia" | "overwhelm_or_blur" | "craving_or_urge" | "emotional_avoidance" | "environment_mismatch" | "relapse_discouragement" | "unknown",
  "confidence": "low" | "medium" | "high",
  "need_clarification": boolean,
  "recommended_technique": "three_second_rule" | "minimum_version" | "ten_minute_sprint" | "if_then_plan" | "environment_shift" | "urge_delay" | "immediate_replacement" | "contrast_visualization" | "precommitment" | "relapse_protocol" | null,
  "technique_candidates": string[],
  "message_angle": "direct_action_now" | "gentle_experiment" | "urge_management" | "environment_reset" | "self_compassion_reset" | null,
  "intensity": "tiny" | "light" | "standard" | null,
  "follow_up_needed": boolean,
  "follow_up_window_hours": number | null,
  "coaching_scope": "micro" | "structural" | null,
  "simplify_instead": boolean,
  "dimension_strategy": string | null
}
  `.trim();
}

export function summarizeSelectorInputForPrompt(
  input: CoachingInterventionSelectorInput,
  gateDecision: CoachingInterventionGateDecision,
): string {
  const planItem = input.target_plan_item;
  const v2m = input.v2_momentum;
  return JSON.stringify({
    momentum_state: input.momentum_state ?? gateDecision.state ?? "unknown",
    gate: gateDecision.gate,
    gate_reason: gateDecision.reason,
    gate_eligible: gateDecision.eligible,
    intensity_cap: gateDecision.intensity_cap,
    explicit_help_request: Boolean(input.explicit_help_request),
    trigger_kind: input.trigger_kind,
    last_user_message: String(input.last_user_message ?? "").slice(0, 1000),
    recent_context_summary:
      String(input.recent_context_summary ?? "").slice(0, 600) || null,
    target_action_title:
      String(input.target_action_title ?? "").slice(0, 120) || null,
    target_plan_item: planItem
      ? {
        dimension: planItem.dimension,
        kind: planItem.kind,
        title: String(planItem.title ?? "").slice(0, 120),
        status: planItem.status,
      }
      : null,
    v2_momentum: v2m
      ? {
        plan_fit: v2m.plan_fit,
        load_balance: v2m.load_balance,
        active_load_score: v2m.active_load_score,
        needs_reduce: v2m.needs_reduce,
        blocker_kind: v2m.blocker_kind,
        posture: v2m.posture,
      }
      : null,
    dimension_strategy: deriveDimensionStrategy(planItem),
    known_blockers: Array.isArray(input.known_blockers)
      ? input.known_blockers.slice(0, 4)
      : [],
    technique_history: Array.isArray(input.technique_history)
      ? input.technique_history.slice(0, 6)
      : [],
    coach_preferences: input.coach_preferences ?? null,
    safety: input.safety ?? null,
  });
}

export function buildCoachingInterventionSelectorPromptPayload(
  input: CoachingInterventionSelectorInput,
): {
  stable_prompt: string;
  user_payload: string;
  gate_decision: CoachingInterventionGateDecision;
} {
  const gateDecision = decideCoachingInterventionGate({
    momentum_state: input.momentum_state,
    explicit_help_request: input.explicit_help_request,
    distress_detected: Boolean(input.safety?.distress_detected),
    pause_requested: Boolean(input.safety?.pause_requested),
    v2_momentum: input.v2_momentum,
  });
  return {
    stable_prompt: buildCoachingInterventionSelectorPrompt(),
    user_payload: summarizeSelectorInputForPrompt(input, gateDecision),
    gate_decision: gateDecision,
  };
}

export async function runCoachingInterventionSelector(args: {
  input: CoachingInterventionSelectorInput;
  meta?: {
    requestId?: string;
    forceRealAi?: boolean;
    model?: string;
    userId?: string;
  };
}): Promise<{
  output: CoachingInterventionSelectorOutput;
  source: "llm" | "fallback";
  gateDecision: CoachingInterventionGateDecision;
}> {
  const payload = buildCoachingInterventionSelectorPromptPayload(args.input);
  const fallback = buildFallbackCoachingInterventionDecision({
    input: args.input,
    gateDecision: payload.gate_decision,
  });

  if (!payload.gate_decision.eligible) {
    return {
      output: fallback,
      source: "fallback",
      gateDecision: payload.gate_decision,
    };
  }

  try {
    const raw = await generateWithGemini(
      payload.stable_prompt,
      payload.user_payload,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: args.meta?.requestId,
        model: args.meta?.model ?? getGlobalAiModel("gemini-2.5-flash"),
        source: "sophia-brain:coaching-intervention-selector",
        forceRealAi: args.meta?.forceRealAi,
        userId: args.meta?.userId,
      },
    );
    return {
      output: normalizeCoachingInterventionSelectorOutput(raw, {
        fallback_gate: payload.gate_decision,
        technique_history: args.input.technique_history,
        v2_momentum: args.input.v2_momentum,
        target_plan_item: args.input.target_plan_item,
      }),
      source: "llm",
      gateDecision: payload.gate_decision,
    };
  } catch (error) {
    console.warn(
      "[CoachingInterventionSelector] selector failed, using fallback:",
      error,
    );
    return {
      output: fallback,
      source: "fallback",
      gateDecision: payload.gate_decision,
    };
  }
}

export function buildCoachingInterventionRuntimeAddon(args: {
  input: CoachingInterventionSelectorInput;
  output: CoachingInterventionSelectorOutput;
  source: "llm" | "fallback";
}): CoachingInterventionRuntimeAddon | null {
  if (!args.output.eligible || args.output.decision === "skip") return null;
  return {
    ...args.output,
    trigger_kind: args.input.trigger_kind,
    explicit_help_request: Boolean(args.input.explicit_help_request),
    target_action_title: String(
      args.input.target_plan_item?.title ?? args.input.target_action_title ??
        "",
    ).trim() || null,
    target_plan_item: args.input.target_plan_item ?? null,
    selector_source: args.source,
    decided_at: new Date().toISOString(),
  };
}

export function normalizeCoachingInterventionSelectorOutput(
  raw: unknown,
  opts?: {
    fallback_gate?: CoachingInterventionGateDecision;
    technique_history?: CoachingInterventionTechniqueHistory[];
    v2_momentum?: CoachingV2MomentumContext | null;
    target_plan_item?: CoachingV2PlanItemContext | null;
  },
): CoachingInterventionSelectorOutput {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : (raw ?? {});
  const gate = normalizeGate(
    (parsed as any)?.gate ?? opts?.fallback_gate?.gate,
  );
  const simplify = Boolean((parsed as any)?.simplify_instead) ||
    shouldSimplifyInstead(opts?.v2_momentum);
  const blockerType = normalizeBlockerType((parsed as any)?.blocker_type);
  const confidence = normalizeConfidence((parsed as any)?.confidence);
  const decision = normalizeDecision((parsed as any)?.decision);
  const history = Array.isArray(opts?.technique_history)
    ? opts?.technique_history
    : [];
  const recommended = simplify || gate === "blocked"
    ? null
    : normalizeTechniqueId((parsed as any)?.recommended_technique) ??
      chooseFallbackTechnique(blockerType, history);
  const techniqueCandidatesRaw = clampTechniqueCandidates(
    (parsed as any)?.technique_candidates,
  );
  const techniqueCandidates = simplify || gate === "blocked"
    ? []
    : techniqueCandidatesRaw.length > 0
    ? techniqueCandidatesRaw
    : blockerType === "unknown"
    ? []
    : getTechniqueCandidatesForBlocker(blockerType).primary;
  const intensityCap = opts?.fallback_gate?.intensity_cap ?? null;
  let intensity = normalizeIntensity((parsed as any)?.intensity);
  if (gate === "allow_light_only" || gate === "explicit_request_only") {
    if (intensity === "standard") intensity = intensityCap ?? "light";
    if (!intensity) intensity = intensityCap ?? "light";
  }
  if (gate === "blocked") {
    intensity = null;
  }

  const eligible = Boolean((parsed as any)?.eligible) && gate !== "blocked" ||
    Boolean(opts?.fallback_gate?.eligible && gate !== "blocked");
  const reason =
    String((parsed as any)?.reason ?? opts?.fallback_gate?.reason ?? "")
      .trim() ||
    "selector_output_missing_reason";
  const needClarification = Boolean((parsed as any)?.need_clarification);
  const messageAngle = normalizeMessageAngle((parsed as any)?.message_angle);
  const followUpNeeded = !simplify &&
    Boolean((parsed as any)?.follow_up_needed) &&
    decision === "propose";
  const followUpWindowHoursRaw = Number(
    (parsed as any)?.follow_up_window_hours,
  );
  const followUpWindowHours = followUpNeeded
    ? Number.isFinite(followUpWindowHoursRaw) && followUpWindowHoursRaw > 0
      ? Math.max(1, Math.floor(followUpWindowHoursRaw))
      : intensity === "standard"
      ? FOLLOW_UP_HOURS_BY_INTENSITY.standard
      : intensity === "light"
      ? FOLLOW_UP_HOURS_BY_INTENSITY.light
      : 24
    : null;

  const rawScope = String((parsed as any)?.coaching_scope ?? "").trim();
  const coachingScope: CoachingScope | null =
    rawScope === "micro" || rawScope === "structural"
      ? rawScope
      : deriveCoachingScope({
        v2Momentum: opts?.v2_momentum,
        planItem: opts?.target_plan_item,
      });
  const dimStrategy =
    String((parsed as any)?.dimension_strategy ?? "").trim() ||
    deriveDimensionStrategy(opts?.target_plan_item);

  return {
    eligible,
    gate,
    decision: gate === "blocked" ? "skip" : simplify ? "propose" : decision,
    reason,
    blocker_type: blockerType,
    confidence,
    need_clarification: needClarification,
    recommended_technique: gate === "blocked" ? null : recommended,
    technique_candidates: gate === "blocked" ? [] : techniqueCandidates,
    message_angle: gate === "blocked" ? null : messageAngle,
    intensity,
    follow_up_needed: gate === "blocked" ? false : followUpNeeded,
    follow_up_window_hours: gate === "blocked" ? null : followUpWindowHours,
    coaching_scope: gate === "blocked" ? null : coachingScope,
    simplify_instead: gate === "blocked" ? false : simplify,
    dimension_strategy: gate === "blocked" ? null : dimStrategy,
  };
}

export function formatCoachingInterventionAddon(
  addon: CoachingInterventionRuntimeAddon | null | undefined,
): string {
  if (!addon || !addon.eligible || addon.decision === "skip") return "";
  const blocker = addon.blocker_type !== "unknown"
    ? getCoachingBlockerDefinition(addon.blocker_type)
    : null;
  const technique = addon.recommended_technique
    ? getCoachingTechniqueDefinition(addon.recommended_technique)
    : null;
  const lines: string[] = [
    "",
    "",
    "=== ADDON COACH INTERVENTION ===",
    `- Cet add-on vient d'un micro-selecteur dedie. Respecte sa direction sauf si le besoin emotionnel immediat du user impose d'etre plus doux.`,
    `- Gate momentum: ${addon.gate}. Decision: ${addon.decision}. Intensite: ${
      addon.intensity ?? "none"
    }.`,
    `- Trigger: ${addon.trigger_kind}. Source selecteur: ${addon.selector_source}.`,
    `- Scope coaching: ${addon.coaching_scope ?? "micro"}. Simplifier plutot: ${
      addon.simplify_instead ? "oui" : "non"
    }.`,
  ];
  if (addon.target_plan_item) {
    const pi = addon.target_plan_item;
    lines.push(
      `- Item du plan concerne: "${pi.title}" (dimension=${pi.dimension}, kind=${pi.kind}, status=${pi.status}).`,
    );
  }
  if (addon.dimension_strategy) {
    lines.push(`- Strategie dimension: ${addon.dimension_strategy}`);
  }
  if (addon.simplify_instead) {
    lines.push(
      "- SURCHARGE DETECTEE: la bonne reponse est de simplifier la charge (reduire, reporter, desactiver un item) plutot que d'ajouter une technique. Propose une simplification concrete.",
    );
  }
  if (blocker) {
    lines.push(`- Blocage cible: ${blocker.label} (${blocker.id}).`);
    lines.push(`- Lecture utile: ${blocker.summary}`);
  }
  if (addon.target_action_title && !addon.target_plan_item) {
    lines.push(`- Action ou contexte vise: ${addon.target_action_title}.`);
  }
  if (technique && !addon.simplify_instead) {
    lines.push(
      `- Technique a prioriser: ${technique.label} (${technique.id}).`,
    );
    lines.push(`- But de la technique: ${technique.primary_goal}.`);
    lines.push(`- Exemple de formulation: ${technique.example_prompt}`);
  }
  if (addon.coaching_scope === "structural") {
    lines.push(
      "- Coaching structural: le blocage revele un probleme de plan (charge, dimensionnement, cadence). Signale-le au user avec bienveillance et propose un ajustement concret.",
    );
  }
  if (addon.decision === "clarify") {
    lines.push(
      "- Consigne: pose UNE seule question de clarification courte pour confirmer le vrai blocage. Ne donne pas plusieurs techniques dans le meme tour.",
    );
  } else if (!addon.simplify_instead) {
    lines.push(
      "- Consigne: propose UNE seule technique concrete, adaptee au contexte du user, comme une experience simple a tester maintenant ou au prochain moment critique.",
    );
    lines.push(
      "- Ne transforme pas ce tour en tutoriel long. Pas de liste de 3 conseils, pas de moralisation.",
    );
  }
  lines.push(
    "- Rappel produit: dans le chat, Sophia peut proposer, clarifier et suivre. Elle ne modifie pas le dashboard ni l'action elle-meme.",
  );
  if (addon.follow_up_needed && addon.follow_up_window_hours) {
    lines.push(
      `- Follow-up suggere: invite le user a te dire si ca a aide dans environ ${addon.follow_up_window_hours}h, sans promettre d'automatisation ici.`,
    );
  }
  if (addon.reason) {
    lines.push(`- Justification interne: ${addon.reason}`);
  }
  return `${lines.join("\n")}\n`;
}
