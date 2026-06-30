import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import {
  createNoteInformation,
  type NoteInformation,
} from "../../contracts/note_information.v1.ts";
import type {
  CoachingRecommendationDecision,
} from "../coaching_recommendation/contract.ts";
import {
  DAILY_ACTION_COACHING_SKILL_ID,
  type DailyActionCoachingActionContext,
  type DailyActionCoachingDispatcherOutput,
  type DailyActionCoachingFeature,
  type DailyActionCoachingHandoffContext,
  type DailyActionCoachingLocalState,
} from "./contract.ts";

const ALLOWED_FEATURES = new Set<DailyActionCoachingFeature>([
  "attack_card",
  "defense_card",
  "adjust_plan",
]);

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function feature(value: unknown): DailyActionCoachingFeature | null {
  const raw = cleanText(value);
  return ALLOWED_FEATURES.has(raw as DailyActionCoachingFeature)
    ? raw as DailyActionCoachingFeature
    : null;
}

function confidence(value: unknown): "low" | "medium" | "high" {
  const raw = cleanText(value);
  return raw === "high" || raw === "medium" || raw === "low" ? raw : "medium";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item)).filter(Boolean).slice(0, 6)
    : [];
}

function normalizeActionContext(
  value: unknown,
): DailyActionCoachingActionContext | null {
  const root = isRecord(value) ? value : {};
  const occurrenceId = cleanText(root.occurrence_id);
  const planItemId = cleanText(root.plan_item_id);
  const title = cleanText(root.title);
  if (!occurrenceId || !planItemId || !title) return null;
  const actionType = cleanText(root.action_type);
  const outcome = cleanText(root.outcome);
  return {
    occurrence_id: occurrenceId,
    plan_item_id: planItemId,
    plan_id: cleanText(root.plan_id) || null,
    title,
    description: cleanText(root.description) || null,
    action_type: actionType === "habit" || actionType === "mission" ||
        actionType === "clarification" || actionType === "other"
      ? actionType
      : null,
    outcome: outcome === "completed" || outcome === "missed" ? outcome : null,
    reason_category: cleanText(root.reason_category) || null,
    reason_text: cleanText(root.reason_text) || null,
  };
}

export function normalizeDailyActionCoachingHandoffContext(
  value: unknown,
): DailyActionCoachingHandoffContext | null {
  const root = isRecord(value) ? value : {};
  const action = normalizeActionContext(root.action_context);
  if (!action) return null;
  return {
    source_flow_id: "daily_action_review_v1",
    parent_flow_id: "daily_action_review_v1",
    return_focus: "resume_daily_after_action_coaching",
    action_context: action,
    help_request_summary: cleanText(root.help_request_summary) ||
      cleanText(root.reason) ||
      "User asks for help succeeding with this daily action.",
    affect_context: isRecord(root.affect_context)
      ? root.affect_context
      : null,
    confidence: Number.isFinite(Number(root.confidence))
      ? Math.max(0, Math.min(1, Number(root.confidence)))
      : undefined,
  };
}

export function initialDailyActionCoachingState(
  context: DailyActionCoachingHandoffContext,
): DailyActionCoachingLocalState {
  return {
    ...context,
    turn_count: 0,
    last_recommendation: null,
  };
}

export function readDailyActionCoachingState(
  activeSkillState: unknown,
): DailyActionCoachingLocalState | null {
  const active = isRecord(activeSkillState) ? activeSkillState : {};
  if (active.skill_id !== DAILY_ACTION_COACHING_SKILL_ID) return null;
  const working = isRecord(active.working_state) ? active.working_state : {};
  const raw = working.daily_action_coaching_recommendation_state;
  const context = normalizeDailyActionCoachingHandoffContext(raw);
  if (!context) return null;
  const stateRoot = isRecord(raw) ? raw : {};
  return {
    ...context,
    turn_count: Math.max(0, Number(stateRoot.turn_count ?? 0)) || 0,
    last_recommendation: isRecord(stateRoot.last_recommendation)
      ? stateRoot.last_recommendation as CoachingRecommendationDecision
      : null,
  };
}

function dispatcherSystemPrompt() {
  return [
    "Tu es le dispatcher local du child flow daily_action_coaching_recommendation_v1.",
    "Scope ferme: tu aides uniquement sur une action daily du plan deja identifiee par le parent daily.",
    "Tu ne changes jamais de target, ne traites jamais une action hors plan, ne lances jamais emotion_coaching, no_plan_action, potion ou conversation ouverte.",
    "Ta sortie normale est recommend_and_return: choisir un levier parmi attack_card, defense_card ou adjust_plan, puis retourner au parent daily via note structuree runtime.",
    "Choisis attack_card si le probleme principal est le demarrage, l'oubli, le manque de declencheur, la friction mentale ou le premier geste.",
    "Choisis defense_card si le probleme principal est un moment de risque, une envie, un risque de craquage, un decrochage pendant l'action ou une reaction automatique.",
    "Choisis adjust_plan si l'action est trop lourde, mal calibree, desalignee, impossible au rythme actuel ou a redimensionner.",
    "Si l'action_context est absent ou contradictoire, utilise clarify_help_need. Si safety est present, safety_preempt. Si sujet hors daily/coaching clair, exit_to_global_dispatcher.",
    "Ne confirme aucune mutation daily. Ne dis jamais que l'action est note, loggee ou enregistree.",
    "Retourne uniquement un JSON strict.",
    'Schema: {"flow_action":"recommend_and_return|clarify_help_need|exit_to_global_dispatcher|safety_preempt","confidence":"low|medium|high","risk_score":0,"recommendation":{"primary_feature":"attack_card|defense_card|adjust_plan|null","secondary_feature":"attack_card|defense_card|adjust_plan|null","why_primary":"string|null","user_facing_next_step":"string|null"},"visible_task":{"kind":"action_plan_coaching|clarify_help_need|safety","instruction":"string"},"evidence":["string"]}',
  ].join("\n");
}

function dispatcherUserPrompt(args: {
  userMessage: string;
  state: DailyActionCoachingLocalState;
}) {
  return JSON.stringify({
    current_user_message: args.userMessage,
    active_flow_state: args.state,
    allowed_features: ["attack_card", "defense_card", "adjust_plan"],
    constraints: {
      no_target_switch: true,
      no_no_plan_action: true,
      no_emotion_coaching: true,
      no_state_potion: true,
      return_to_parent_required: true,
    },
  });
}

export type DailyActionCoachingLocalDispatcher = (args: {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  previous_state: DailyActionCoachingLocalState;
}) => Promise<DailyActionCoachingDispatcherOutput | null>;

export function normalizeDailyActionCoachingDispatcherOutput(
  raw: unknown,
): DailyActionCoachingDispatcherOutput {
  const root = isRecord(raw) ? raw : {};
  const action = cleanText(root.flow_action);
  const recommendation = isRecord(root.recommendation)
    ? root.recommendation
    : {};
  const primary = feature(recommendation.primary_feature);
  const secondary = feature(recommendation.secondary_feature);
  const flowAction = action === "recommend_and_return" && primary
    ? "recommend_and_return"
    : action === "safety_preempt"
    ? "safety_preempt"
    : action === "exit_to_global_dispatcher"
    ? "exit_to_global_dispatcher"
    : "clarify_help_need";
  return {
    flow_action: flowAction,
    confidence: confidence(root.confidence),
    risk_score: Number.isFinite(Number(root.risk_score))
      ? Number(root.risk_score)
      : 0,
    recommendation: {
      primary_feature: flowAction === "recommend_and_return" ? primary : null,
      secondary_feature: flowAction === "recommend_and_return"
        ? secondary
        : null,
      why_primary: cleanText(recommendation.why_primary) || null,
      user_facing_next_step: cleanText(recommendation.user_facing_next_step) ||
        null,
    },
    visible_task: {
      kind: flowAction === "recommend_and_return"
        ? "action_plan_coaching"
        : flowAction === "safety_preempt"
        ? "safety"
        : "clarify_help_need",
      instruction: cleanText(isRecord(root.visible_task)
        ? root.visible_task.instruction
        : null) || null,
    },
    note_information: isRecord(root.note_information)
      ? root.note_information as NoteInformation
      : null,
    evidence: stringArray(root.evidence),
  };
}

export async function runDailyActionCoachingLocalDispatcher(args: {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  previous_state: DailyActionCoachingLocalState;
  llmRunner?: (input: {
    systemPrompt: string;
    userPrompt: string;
  }) => Promise<unknown>;
}): Promise<DailyActionCoachingDispatcherOutput | null> {
  const systemPrompt = dispatcherSystemPrompt();
  const userPrompt = dispatcherUserPrompt({
    userMessage: args.user_message,
    state: args.previous_state,
  });
  const raw = args.llmRunner
    ? await args.llmRunner({ systemPrompt, userPrompt })
    : await generateWithGemini(systemPrompt, userPrompt, 0.1, true, [], "auto", {
      requestId: args.request_id ?? undefined,
      source: "daily_action_coaching_recommendation.local_dispatcher",
      model: getGlobalAiModel(),
      userId: args.user_id,
    });
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return normalizeDailyActionCoachingDispatcherOutput(parsed);
  } catch {
    return null;
  }
}

function recommendationDecision(
  output: DailyActionCoachingDispatcherOutput,
): CoachingRecommendationDecision {
  const primary = output.recommendation.primary_feature;
  return {
    primary_feature: primary,
    secondary_feature: output.recommendation.secondary_feature ?? null,
    why_primary: output.recommendation.why_primary ||
      "Ce levier correspond au blocage de cette action.",
    why_not_others: {},
    platform_destination: {
      label: primary === "adjust_plan"
        ? "Plan"
        : primary === "defense_card"
        ? "Carte de defense"
        : "Carte d'attaque",
      surface_hint: "Dashboard > Plan",
      user_facing_destination: "Depuis l'action concernee dans le Plan.",
    },
    user_facing_next_step: output.recommendation.user_facing_next_step ?? null,
  };
}

export function noteForDailyParentReturn(args: {
  state: DailyActionCoachingLocalState;
  recommendation: CoachingRecommendationDecision;
  confidence: "low" | "medium" | "high";
  evidence: string[];
}): NoteInformation {
  return createNoteInformation({
    source_flow_id: DAILY_ACTION_COACHING_SKILL_ID,
    handoff_reason: "child_flow_completed",
    target_dispatcher: "daily_action_review_v1",
    handoff_context_for_next_dispatcher:
      "Daily action coaching completed; return to the daily action review parent.",
    structured_context: {
      bridge_kind: "daily_action_coaching_to_parent",
      parent_flow_id: "daily_action_review_v1",
      occurrence_id: args.state.action_context.occurrence_id,
      plan_item_id: args.state.action_context.plan_item_id,
      recommended_feature: {
        primary: args.recommendation.primary_feature,
        secondary: args.recommendation.secondary_feature,
        why: args.recommendation.why_primary,
      },
      no_daily_mutation: true,
      recommended_next_focus: "resume_daily_review",
      evidence: args.evidence,
    },
    confidence: args.confidence,
  });
}

export function reduceDailyActionCoachingOutput(args: {
  previous: DailyActionCoachingLocalState;
  output: DailyActionCoachingDispatcherOutput;
}) {
  const recommendation = recommendationDecision(args.output);
  if (args.output.flow_action === "recommend_and_return") {
    return {
      status: "complete" as const,
      reason_code: "daily_action_coaching_recommend_and_return",
      local_state: {
        ...args.previous,
        turn_count: args.previous.turn_count + 1,
        last_recommendation: recommendation,
      },
      recommendation,
      note_information: noteForDailyParentReturn({
        state: args.previous,
        recommendation,
        confidence: args.output.confidence,
        evidence: args.output.evidence ?? [],
      }),
    };
  }
  return {
    status: args.output.flow_action === "safety_preempt" ||
        args.output.flow_action === "exit_to_global_dispatcher"
      ? "exit" as const
      : "continue" as const,
    reason_code: `daily_action_coaching_${args.output.flow_action}`,
    local_state: {
      ...args.previous,
      turn_count: args.previous.turn_count + 1,
      last_recommendation: null,
    },
    recommendation,
    note_information: null,
  };
}
