import type {
  CoachingBlockerType,
  CoachingTechniqueId,
} from "./coaching_interventions.ts";

export type CoachingInterventionOutcome =
  | "unknown"
  | "not_tried"
  | "tried_not_helpful"
  | "tried_helpful"
  | "behavior_changed";

export type CoachingInterventionTechniqueHistory = {
  technique_id: CoachingTechniqueId;
  blocker_type?: CoachingBlockerType | null;
  outcome: CoachingInterventionOutcome;
  helpful?: boolean | null;
  last_used_at?: string | null;
};

export type CoachingV2MomentumContext = {
  blocker_kind?: string | null;
  plan_fit?: string | null;
  load_balance?: string | null;
  [key: string]: unknown;
};

export type CoachingV2PlanItemContext = {
  id: string;
  title: string;
  dimension?: string | null;
  kind?: string | null;
  [key: string]: unknown;
};

export type CoachingInterventionTriggerDetection = {
  trigger_kind: "help_request" | "blocker_repeat";
  explicit_help_request: boolean;
  blocker_hint?: CoachingBlockerType | null;
};

export type CoachingInterventionSelectorInput = {
  momentum_state?: string | null;
  explicit_help_request: boolean;
  trigger_kind: string;
  last_user_message: string;
  recent_context_summary?: string | null;
  target_action_title?: string | null;
  target_plan_item?: CoachingV2PlanItemContext | null;
  v2_momentum?: CoachingV2MomentumContext | null;
  known_blockers?: Array<{ blocker_type: CoachingBlockerType; confidence: "low" | "medium" | "high" }>;
  technique_history?: CoachingInterventionTechniqueHistory[];
  safety?: { distress_detected?: boolean; pause_requested?: boolean };
  coach_preferences?: Record<string, unknown> | null;
};

export type CoachingInterventionSelectorOutput = {
  decision: "skip" | "clarify" | "propose";
  eligible: boolean;
  reason?: string | null;
  confidence: number;
  blocker_type: CoachingBlockerType | "unknown";
  recommended_technique: CoachingTechniqueId | null;
  technique_candidates: CoachingTechniqueId[];
  follow_up_needed: boolean;
  need_clarification: boolean;
  coaching_scope?: string | null;
  simplify_instead?: boolean;
  dimension_strategy?: string | null;
};

export type CoachingInterventionRuntimeAddon = CoachingInterventionSelectorOutput & {
  intervention_id: string;
  trigger_kind: string;
  target_action_title?: string | null;
  target_plan_item?: CoachingV2PlanItemContext | null;
  message_angle?: string | null;
  intensity?: string | null;
  selector_source: "fallback" | "llm";
  follow_up_window_hours?: number | null;
};

export function detectCoachingInterventionTrigger(args: {
  userMessage: string;
  actionHint?: string | null;
  progressStatusHint?: string | null;
  topBlockerStage?: string | null;
}): CoachingInterventionTriggerDetection | null {
  void args.userMessage;
  if (args.progressStatusHint === "blocked") {
    return {
      trigger_kind: "help_request",
      explicit_help_request: true,
      blocker_hint: "overwhelm",
    };
  }
  return null;
}

export function buildKnownCoachingBlockersFromTempMemory(
  _tempMemory: any,
): Array<{ blocker_type: CoachingBlockerType; confidence: "low" | "medium" | "high" }> {
  return [];
}

export async function runCoachingInterventionSelector(args: {
  input: CoachingInterventionSelectorInput;
  meta?: Record<string, unknown>;
}): Promise<{
  output: CoachingInterventionSelectorOutput;
  source: "fallback" | "llm";
  gateDecision: {
    eligible: boolean;
    reason: string | null;
    gate: string;
  };
}> {
  const output: CoachingInterventionSelectorOutput = {
    decision: "skip",
    eligible: false,
    reason: "coaching_selector_removed",
    confidence: 0,
    blocker_type: args.input.known_blockers?.[0]?.blocker_type ?? "unknown",
    recommended_technique: null,
    technique_candidates: [],
    follow_up_needed: false,
    need_clarification: false,
    coaching_scope: null,
    simplify_instead: false,
    dimension_strategy: null,
  };
  return {
    output,
    source: "fallback",
    gateDecision: {
      eligible: false,
      reason: output.reason ?? null,
      gate: "disabled",
    },
  };
}

export function buildCoachingInterventionRuntimeAddon(args: {
  input: CoachingInterventionSelectorInput;
  output: CoachingInterventionSelectorOutput;
  source: "fallback" | "llm";
}): CoachingInterventionRuntimeAddon | null {
  if (args.output.decision !== "propose" || !args.output.recommended_technique) {
    return null;
  }
  return {
    ...args.output,
    intervention_id: crypto.randomUUID(),
    trigger_kind: args.input.trigger_kind,
    target_action_title: args.input.target_action_title ?? null,
    target_plan_item: args.input.target_plan_item ?? null,
    message_angle: null,
    intensity: null,
    selector_source: args.source,
    follow_up_window_hours: null,
  };
}

export function formatCoachingInterventionAddon(
  addon: CoachingInterventionRuntimeAddon,
): string {
  return [
    "\n\n=== ADDON COACHING ===",
    `- Décision: ${addon.decision}`,
    addon.recommended_technique
      ? `- Technique proposée: ${addon.recommended_technique}`
      : "",
    addon.target_action_title ? `- Cible: ${addon.target_action_title}` : "",
  ].filter(Boolean).join("\n");
}
