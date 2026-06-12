import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import {
  createNoteInformation,
  type NoteInformation,
  type NoteInformationTargetDispatcher,
} from "../../../contracts/note_information.v1.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";
import {
  directEffectLocalDispatcherPromptLines,
  withDirectEffectLocalContext,
} from "../../../router/direct_effect_local_context.ts";
import type {
  AttackCardHandoffDraft,
  AttackCardPlatformFieldId,
  AttackCardPlatformFlowKind,
  AttackCardTechniqueKey,
} from "./contract.ts";
import type { AttackCardHandoffState } from "./state.ts";

export type PrepareAttackCardLocalStage =
  | "target_intake"
  | "blocker_intake"
  | "technique_selection"
  | "platform_field_intake"
  | "handoff_ready"
  | "handoff_delivered"
  | "exit";

export type PrepareAttackCardLocalFlowAction =
  | "continue_local"
  | "missing_info"
  | "confirm_candidate"
  | "answer_current_field"
  | "confirm_proposed_field"
  | "choose_technique"
  | "confirm_technique_proposal"
  | "revise_current_field"
  | "revise_technique"
  | "revise_target"
  | "revise"
  | "get_info_product"
  | "get_info_db"
  | "inline_product"
  | "inline_status"
  | "handoff_ready"
  | "repeat_handoff"
  | "platform_destination_followup"
  | "destination_followup"
  | "apply_attempt"
  | "exit_to_global_dispatcher"
  | "cancel_flow"
  | "defer_flow"
  | "handoff_to_local_flow"
  | "exit_to_global_dispatcher"
  | "safety_preempt";

export type PrepareAttackCardVisibleTaskKind =
  | "ask_target"
  | "confirm_target_candidate"
  | "ask_blocker"
  | "ask_or_confirm_technique"
  | "ask_platform_field"
  | "confirm_platform_field_proposal"
  | "handoff_ready"
  | "revision_done"
  | "destination_short"
  | "apply_attempt"
  | "repeat_handoff"
  | "inline_tool_return"
  | "stop_or_cancel"
  | "exit_ack"
  | "exit_or_cancel"
  | "safety"
  | "safety_transition"
  | "none";

export type PrepareAttackCardConversationContext = {
  state_summary: string;
  user_words: string[];
  field_or_stage: string | null;
  known_values: {
    target: PrepareAttackCardTargetState;
    blocker: PrepareAttackCardBlockerState;
    technique: PrepareAttackCardTechniqueState;
    current_field: PrepareAttackCardPlatformFieldState | null;
    activation_keyword: PrepareAttackCardActivationKeywordState;
  };
  missing_or_weak_values: string[];
  selected_candidate: Record<string, unknown>;
  handoff_data: {
    operation_name: "prepare_attack_card";
    surface_label: "Cartes d'attaque";
    platform_destination: string;
    platform_steps: string[];
    flow_kind: AttackCardPlatformFlowKind | null;
    technique_label: string | null;
    target_value: string | null;
    blocker_value: string | null;
    locked_fields: Array<{
      field_id: string;
      field_label: string;
      field_value: string;
    }>;
    missing_fields: string[];
    activation_keyword: string | null;
    no_chat_mutation: true;
  };
  tone_constraints: string[];
  do_not_say: string[];
  context_summary: string | null;
  evidence_used: string[];
};

export type PrepareAttackCardRiskAssessment = {
  risk_score: number;
  risk_band: "none" | "low" | "medium" | "high" | "critical";
  safety_preempt: boolean;
  reason_codes: string[];
};

export type PrepareAttackCardTargetState = {
  status: "missing" | "ambiguous" | "proposed" | "locked";
  kind: "plan_item" | "personal_action" | "unknown" | null;
  plan_item_id: string | null;
  candidate_value: string | null;
  locked_value: string | null;
  needs_user_confirmation: boolean;
  why_status: string | null;
};

export type PrepareAttackCardBlockerState = {
  status: "missing" | "proposed" | "locked";
  blocker_type:
    | "avoidance"
    | "procrastination"
    | "action_too_heavy"
    | "unclear_first_step"
    | "low_energy"
    | "friction"
    | "mixed"
    | null;
  candidate_value: string | null;
  locked_value: string | null;
  needs_user_confirmation: boolean;
  why_status: string | null;
};

export type PrepareAttackCardTechniqueOption = {
  technique_key: AttackCardTechniqueKey;
  technique_label: string;
  reason: string | null;
  recommended: boolean;
};

export type PrepareAttackCardTechniqueState = {
  status: "missing" | "ambiguous" | "proposed" | "locked";
  technique_key: AttackCardTechniqueKey | null;
  technique_label: string | null;
  explicitly_requested: boolean;
  candidate_options: PrepareAttackCardTechniqueOption[];
  fit_warning: string | null;
  needs_user_confirmation: boolean;
  why_status: string | null;
};

export type PrepareAttackCardPlatformFieldState = {
  field_id: AttackCardPlatformFieldId;
  technique_key: AttackCardTechniqueKey;
  field_label: string;
  status: "missing" | "proposed" | "locked";
  candidate_value: string | null;
  locked_value: string | null;
  previous_value: string | null;
  needs_user_confirmation: boolean;
  why_status: string | null;
};

export type PrepareAttackCardActivationKeywordState = {
  status: "not_applicable" | "missing" | "proposed" | "locked";
  candidate_value: string | null;
  locked_value: string | null;
  needs_user_confirmation: boolean;
  why_status: string | null;
};

export type PrepareAttackCardLocalState = {
  flow_id: "prepare_attack_card";
  flow_kind: AttackCardPlatformFlowKind | null;
  platform_destination: string;
  target_state: PrepareAttackCardTargetState;
  blocker_state: PrepareAttackCardBlockerState;
  technique_state: PrepareAttackCardTechniqueState;
  platform_field_order: AttackCardPlatformFieldId[];
  platform_field_states: Record<string, PrepareAttackCardPlatformFieldState>;
  activation_keyword_state: PrepareAttackCardActivationKeywordState;
  current_field_id: AttackCardPlatformFieldId | null;
  last_visible_task: PrepareAttackCardVisibleTaskKind | null;
  last_handoff_delivered: boolean;
  subskill_history: Array<Record<string, unknown>>;
};

export type PrepareAttackCardLocalDispatcherOutput = {
  flow_action: PrepareAttackCardLocalFlowAction;
  confidence: "low" | "medium" | "high";
  stage: PrepareAttackCardLocalStage;
  flow_kind: AttackCardPlatformFlowKind | null;
  target_state: PrepareAttackCardTargetState;
  blocker_state: PrepareAttackCardBlockerState;
  technique_state: PrepareAttackCardTechniqueState;
  platform_field_states: PrepareAttackCardPlatformFieldState[];
  activation_keyword_state: PrepareAttackCardActivationKeywordState;
  revision: {
    is_revision: boolean;
    revision_target:
      | "target"
      | "blocker"
      | "technique"
      | "platform_field"
      | "activation_keyword"
      | "unknown"
      | null;
    field_id: string | null;
    replacement_value: string | null;
    replaces_previous_value: boolean;
  };
  visible_task: {
    kind: PrepareAttackCardVisibleTaskKind;
    conversation_context?: Partial<PrepareAttackCardConversationContext> | null;
  };
  subskill_call: {
    needed: boolean;
    skill_id: "product_help" | "status_recap" | null;
    reason: string | null;
    context_for_subskill: Record<string, unknown>;
  };
  exit_memo: {
    needed: boolean;
    reason: "none" | "topic_change" | "cancelled" | "safety";
    flow_summary: string | null;
    handoff_hint_for_global_dispatcher: string | null;
  };
  note_information: NoteInformation | null;
  no_chat_mutation: {
    attack_card_created: false;
    chat_side_effect_committed: false;
    platform_write_committed: false;
    db_write_committed: false;
  };
  risk_assessment: PrepareAttackCardRiskAssessment;
  evidence: string[];
};

export type PrepareAttackCardLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: AttackCardHandoffState | null;
  local_state: PrepareAttackCardLocalState | null;
  route_decision: RouteDecision | null;
  turn_frame: TurnFrame | null;
  note_information_inbound?: Record<string, unknown> | null;
  db_context_pack?: Record<string, unknown> | null;
  micro_memory_context?: Record<string, unknown> | null;
  platform_context?: Record<string, unknown> | null;
  parent_flow_context?: Record<string, unknown> | null;
  risk_context?: Record<string, unknown> | null;
  available_inline_tools?: string[];
  plan_snapshot?: unknown;
  last_handoff?: AttackCardHandoffDraft | null;
};

export type PrepareAttackCardLocalDispatcher = (
  input: PrepareAttackCardLocalDispatcherInput,
) => Promise<PrepareAttackCardLocalDispatcherOutput | null>;

export type PrepareAttackCardReducerResult = {
  status:
    | "collecting"
    | "clarifying"
    | "handoff_delivered"
    | "repeat_handoff"
    | "apply_attempt"
    | "cancelled"
    | "topic_change"
    | "blocked";
  reason_code: string;
  local_state: PrepareAttackCardLocalState | null;
  draft: AttackCardHandoffDraft | null;
  visible_task: PrepareAttackCardVisibleTaskKind;
  visible_task_context: PrepareAttackCardConversationContext;
  note_information: NoteInformation | null;
  exit_to_global_dispatcher: boolean;
  handoff_to_local_flow: boolean;
  target_dispatcher: NoteInformationTargetDispatcher | null;
  get_info_product: boolean;
  get_info_db: boolean;
  subskill_context: Record<string, unknown> | null;
  risk_assessment: PrepareAttackCardRiskAssessment;
  blocked_effects: Array<{ type: string; reason_code: string }>;
};

export const ATTACK_CARD_TECHNIQUE_LABELS: Record<
  AttackCardTechniqueKey,
  string
> = {
  texte_recadrage: "Le texte magique",
  mantra_force: "Mantra de force",
  ancre_visuelle: "Ancre visuelle",
  visualisation_matinale: "Meditation de 5 minutes",
  preparer_terrain: "Preparer le terrain",
  pre_engagement: "Mot de bascule",
};

export const ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS: Record<
  AttackCardTechniqueKey,
  Array<{ field_id: AttackCardPlatformFieldId; field_label: string }>
> = {
  texte_recadrage: [
    {
      field_id: "negotiated_action",
      field_label:
        "Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ?",
    },
    {
      field_id: "recurring_excuse",
      field_label:
        "Quelles excuses ou pensees reviennent quand tu sens que tu glisses ?",
    },
    {
      field_id: "desired_reframe_state",
      field_label: "Dans quel etat tu veux te remettre en ecrivant ce texte ?",
    },
  ],
  mantra_force: [
    {
      field_id: "effort_target",
      field_label:
        "Par rapport a quelle action ou quel effort tu veux devenir plus solide ?",
    },
    {
      field_id: "importance_reason",
      field_label:
        "Pourquoi c'est important pour toi d'arreter de reculer la-dessus ?",
    },
    {
      field_id: "mantra_tone",
      field_label: "Tu veux un mantra plutot calme, noble ou percutant ?",
    },
  ],
  ancre_visuelle: [
    {
      field_id: "commitment_to_keep_alive",
      field_label: "Quel engagement envers toi-meme tu veux garder vivant ?",
    },
    {
      field_id: "anchor_location",
      field_label:
        "Dans quel lieu ou sur quel objet tu pourrais l'accrocher a ton quotidien ?",
    },
    {
      field_id: "visual_phrase",
      field_label: "Quelle phrase courte devrait revenir quand tu le vois ?",
    },
  ],
  visualisation_matinale: [
    {
      field_id: "visualized_action",
      field_label:
        "Quelle action ou habitude tu veux te voir faire naturellement ?",
    },
    {
      field_id: "morning_window",
      field_label:
        "A quel moment du matin pourrais-tu prendre 5 minutes pour te projeter calmement ?",
    },
    {
      field_id: "helpful_sensations",
      field_label:
        "Quelles sensations ou images t'aideraient a te voir deja en train de faire l'action ?",
    },
  ],
  preparer_terrain: [
    {
      field_id: "action_to_simplify",
      field_label:
        "Par rapport a quelle action tu veux te rendre la vie plus simple ?",
    },
    {
      field_id: "prep_in_advance",
      field_label:
        "Qu'est-ce que tu pourrais preparer en avance pour enlever de la friction ?",
    },
    {
      field_id: "ready_environment",
      field_label:
        "Quand le moment arrive, qu'est-ce qui devrait deja etre pret autour de toi ?",
    },
  ],
  pre_engagement: [
    {
      field_id: "risk_situation",
      field_label:
        "Dans quelle situation precise tu sens que tu vas craquer ou perdre le controle ?",
    },
    {
      field_id: "protected_value",
      field_label:
        "Quand tu tiens bon dans ce moment-la, qu'est-ce que tu proteges de vraiment important chez toi ?",
    },
  ],
};

const TECHNIQUE_KEYS = Object.keys(
  ATTACK_CARD_TECHNIQUE_LABELS,
) as AttackCardTechniqueKey[];
const PLATFORM_DESTINATION = getHandoffTargetForOperation("prepare_attack_card")
  ?.user_facing_destination ?? "dans la section Cartes d'attaque";
const PLATFORM_STEPS =
  getHandoffTargetForOperation("prepare_attack_card")?.platform_steps ?? [
    "Ouvre la section Cartes d'attaque.",
    "Choisis la technique préparée.",
    "Renseigne les champs préparés dans le chat.",
  ];

function stringValue(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function stringArray(value: unknown, max = 8): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(
      0,
      max,
    )
    : [];
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  const text = String(raw ?? "").trim();
  let cleaned = text;
  if (cleaned.startsWith("```")) {
    const firstLineEnd = cleaned.indexOf("\n");
    cleaned = firstLineEnd >= 0 ? cleaned.slice(firstLineEnd + 1) : "";
  }
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("prepare_attack_card_local_dispatcher_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("prepare_attack_card_local_dispatcher_not_object");
  }
  return parsed as Record<string, unknown>;
}

function techniqueKey(value: unknown): AttackCardTechniqueKey | null {
  const raw = String(value ?? "").trim();
  return TECHNIQUE_KEYS.includes(raw as AttackCardTechniqueKey)
    ? raw as AttackCardTechniqueKey
    : null;
}

function platformFieldId(
  value: unknown,
  selectedTechnique: AttackCardTechniqueKey | null,
): AttackCardPlatformFieldId | null {
  const raw = String(value ?? "").trim();
  if (!selectedTechnique) return null;
  return ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS[selectedTechnique].some((
      field,
    ) => field.field_id === raw
    )
    ? raw as AttackCardPlatformFieldId
    : null;
}

function confidence(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "medium";
}

function riskAssessment(value: unknown): PrepareAttackCardRiskAssessment {
  const root = value && typeof value === "object" && !Array.isArray(value)
    ? value as any
    : {};
  const score = Number(root.risk_score ?? 0);
  const band = [
      "none",
      "low",
      "medium",
      "high",
      "critical",
    ].includes(String(root.risk_band ?? ""))
    ? root.risk_band as PrepareAttackCardRiskAssessment["risk_band"]
    : "none";
  return {
    risk_score: Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0,
    risk_band: band,
    safety_preempt: root.safety_preempt === true,
    reason_codes: stringArray(root.reason_codes),
  };
}

function flowAction(value: unknown): PrepareAttackCardLocalFlowAction {
  const raw = String(value ?? "").trim();
  return [
      "continue_local",
      "missing_info",
      "confirm_candidate",
      "answer_current_field",
      "confirm_proposed_field",
      "choose_technique",
      "confirm_technique_proposal",
      "revise_current_field",
      "revise_technique",
      "revise_target",
      "revise",
      "get_info_product",
      "get_info_db",
      "inline_product",
      "inline_status",
      "handoff_ready",
      "repeat_handoff",
      "platform_destination_followup",
      "destination_followup",
      "apply_attempt",
      "exit_to_global_dispatcher",
      "cancel_flow",
      "defer_flow",
      "handoff_to_local_flow",
      "exit_to_global_dispatcher",
      "safety_preempt",
    ].includes(raw)
    ? raw as PrepareAttackCardLocalFlowAction
    : "answer_current_field";
}

function visibleTaskKind(value: unknown): PrepareAttackCardVisibleTaskKind {
  const raw = String(value ?? "").trim();
  return [
      "ask_target",
      "confirm_target_candidate",
      "ask_blocker",
      "ask_or_confirm_technique",
      "ask_platform_field",
      "confirm_platform_field_proposal",
      "handoff_ready",
      "revision_done",
      "destination_short",
      "apply_attempt",
      "repeat_handoff",
      "inline_tool_return",
      "stop_or_cancel",
      "exit_ack",
      "exit_or_cancel",
      "safety",
      "safety_transition",
      "none",
    ].includes(raw)
    ? raw as PrepareAttackCardVisibleTaskKind
    : "ask_target";
}

function localStage(value: unknown): PrepareAttackCardLocalStage {
  const raw = String(value ?? "").trim();
  return [
      "target_intake",
      "blocker_intake",
      "technique_selection",
      "platform_field_intake",
      "handoff_ready",
      "handoff_delivered",
      "exit",
    ].includes(raw)
    ? raw as PrepareAttackCardLocalStage
    : "target_intake";
}

function flowKind(value: unknown): AttackCardPlatformFlowKind | null {
  const raw = String(value ?? "").trim();
  return [
      "free_attack_card",
      "plan_action_cards",
      "adjust_existing_attack_card",
    ].includes(raw)
    ? raw as AttackCardPlatformFlowKind
    : null;
}

function targetState(raw: unknown): PrepareAttackCardTargetState {
  const root = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as any
    : {};
  const status = [
      "missing",
      "ambiguous",
      "proposed",
      "locked",
    ].includes(String(root.status ?? ""))
    ? root.status as PrepareAttackCardTargetState["status"]
    : "missing";
  const kind = [
      "plan_item",
      "personal_action",
      "unknown",
    ].includes(String(root.kind ?? ""))
    ? root.kind as PrepareAttackCardTargetState["kind"]
    : null;
  return {
    status,
    kind,
    plan_item_id: stringValue(root.plan_item_id),
    candidate_value: stringValue(root.candidate_value),
    locked_value: stringValue(root.locked_value),
    needs_user_confirmation: root.needs_user_confirmation === true ||
      status === "proposed",
    why_status: stringValue(root.why_status),
  };
}

function blockerState(raw: unknown): PrepareAttackCardBlockerState {
  const root = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as any
    : {};
  const status = [
      "missing",
      "proposed",
      "locked",
    ].includes(String(root.status ?? ""))
    ? root.status as PrepareAttackCardBlockerState["status"]
    : "missing";
  const blockerType = [
      "avoidance",
      "procrastination",
      "action_too_heavy",
      "unclear_first_step",
      "low_energy",
      "friction",
      "mixed",
    ].includes(String(root.blocker_type ?? ""))
    ? root.blocker_type as PrepareAttackCardBlockerState["blocker_type"]
    : null;
  return {
    status,
    blocker_type: blockerType,
    candidate_value: stringValue(root.candidate_value),
    locked_value: stringValue(root.locked_value),
    needs_user_confirmation: root.needs_user_confirmation === true ||
      status === "proposed",
    why_status: stringValue(root.why_status),
  };
}

function techniqueOption(
  raw: unknown,
): PrepareAttackCardTechniqueOption | null {
  const root = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as any
    : {};
  const key = techniqueKey(root.technique_key);
  if (!key) return null;
  return {
    technique_key: key,
    technique_label: ATTACK_CARD_TECHNIQUE_LABELS[key],
    reason: stringValue(root.reason),
    recommended: root.recommended === true,
  };
}

function techniqueState(raw: unknown): PrepareAttackCardTechniqueState {
  const root = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as any
    : {};
  const status = [
      "missing",
      "ambiguous",
      "proposed",
      "locked",
    ].includes(String(root.status ?? ""))
    ? root.status as PrepareAttackCardTechniqueState["status"]
    : "missing";
  const key = techniqueKey(root.technique_key);
  return {
    status,
    technique_key: key,
    technique_label: key ? ATTACK_CARD_TECHNIQUE_LABELS[key] : null,
    explicitly_requested: root.explicitly_requested === true,
    candidate_options: Array.isArray(root.candidate_options)
      ? root.candidate_options.flatMap((item: unknown) => {
        const normalized = techniqueOption(item);
        return normalized ? [normalized] : [];
      }).slice(0, 3)
      : [],
    fit_warning: stringValue(root.fit_warning),
    needs_user_confirmation: root.needs_user_confirmation === true ||
      status === "proposed" || status === "ambiguous",
    why_status: stringValue(root.why_status),
  };
}

function fieldState(
  raw: unknown,
  selectedTechnique: AttackCardTechniqueKey | null,
): PrepareAttackCardPlatformFieldState | null {
  const root = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as any
    : {};
  const fieldTechnique = techniqueKey(root.technique_key) ?? selectedTechnique;
  const fieldId = platformFieldId(root.field_id, fieldTechnique);
  if (!fieldTechnique || !fieldId) return null;
  const definition = ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS[fieldTechnique]
    .find((item) => item.field_id === fieldId);
  if (!definition) return null;
  const status = [
      "missing",
      "proposed",
      "locked",
    ].includes(String(root.status ?? ""))
    ? root.status as PrepareAttackCardPlatformFieldState["status"]
    : "missing";
  return {
    field_id: fieldId,
    technique_key: fieldTechnique,
    field_label: definition.field_label,
    status,
    candidate_value: stringValue(root.candidate_value),
    locked_value: stringValue(root.locked_value),
    previous_value: stringValue(root.previous_value),
    needs_user_confirmation: root.needs_user_confirmation === true ||
      status === "proposed",
    why_status: stringValue(root.why_status),
  };
}

function activationKeywordState(
  raw: unknown,
  technique: AttackCardTechniqueKey | null,
): PrepareAttackCardActivationKeywordState {
  const root = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as any
    : {};
  const rawStatus = String(root.status ?? "").trim();
  const status = technique === "pre_engagement" &&
      ["missing", "proposed", "locked"].includes(rawStatus)
    ? rawStatus as PrepareAttackCardActivationKeywordState["status"]
    : "not_applicable";
  return {
    status,
    candidate_value: stringValue(root.candidate_value),
    locked_value: stringValue(root.locked_value),
    needs_user_confirmation: root.needs_user_confirmation === true ||
      status === "proposed",
    why_status: stringValue(root.why_status),
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeTargetDispatcher(
  value: unknown,
  fallback: NoteInformationTargetDispatcher,
): NoteInformationTargetDispatcher {
  const raw = String(value ?? "").trim();
  return [
      "global",
      "safety_crisis",
      "clarification",
      "create_one_shot_reminder",
      "create_recurring_reminder",
      "prepare_attack_card",
      "prepare_defense_card",
      "adjust_plan_item",
      "select_state_potion",
      "track_progress_plan_item",
      "update_coach_preferences",
      "emotional_repair",
      "demotivation_repair",
      "product_help",
      "status_recap",
      "weekly_adaptive_review_v1",
      "verification_opportunities",
      "other_local",
    ].includes(raw)
    ? raw as NoteInformationTargetDispatcher
    : fallback;
}

function normalizeDispatcherNoteInformation(args: {
  raw: unknown;
  outputRoot: Record<string, unknown>;
  targetDispatcher: NoteInformationTargetDispatcher;
  fallbackStateSummary: string;
  fallbackContext: Record<string, unknown>;
  riskScore: number;
}): NoteInformation | null {
  const raw = recordValue(args.raw);
  const needed = raw.needed === true ||
    args.outputRoot.flow_action === "exit_to_global_dispatcher" ||
    args.outputRoot.flow_action === "safety_preempt" ||
    args.outputRoot.flow_action === "handoff_to_local_flow";
  if (!needed && Object.keys(raw).length === 0) return null;
  const collectedState = recordValue(raw.collected_state);
  const structuredContext = {
    ...args.fallbackContext,
    ...(Object.keys(collectedState).length
      ? { collected_state: collectedState }
      : {}),
    unresolved_questions: stringArray(raw.unresolved_questions, 6),
    confidence: confidence(raw.confidence),
    evidence: stringArray(raw.evidence, 6),
    recommended_next_focus: stringValue(raw.recommended_next_focus),
  };
  return createNoteInformation({
    source_flow_id: stringValue(raw.source_flow_id) ||
      stringValue(raw.source_flow) ||
      "prepare_attack_card",
    handoff_reason: args.targetDispatcher === "safety_crisis"
      ? "safety"
      : args.targetDispatcher === "global"
      ? "topic_change"
      : args.targetDispatcher === "product_help" ||
          args.targetDispatcher === "status_recap"
      ? "inline_tool"
      : "bridge",
    target_dispatcher: normalizeTargetDispatcher(
      raw.target_dispatcher,
      args.targetDispatcher,
    ),
    handoff_context_for_next_dispatcher:
      stringValue(raw.handoff_context_for_next_dispatcher) ||
      stringValue(raw.user_message_summary) ||
      JSON.stringify(structuredContext),
    user_words: stringArray(raw.user_words, 4),
    structured_context: structuredContext,
    confidence: confidence(raw.confidence),
  });
}

function initialFieldStates(
  technique: AttackCardTechniqueKey | null,
): Record<string, PrepareAttackCardPlatformFieldState> {
  if (!technique) return {};
  return Object.fromEntries(
    ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS[technique].map((definition) => [
      definition.field_id,
      {
        field_id: definition.field_id,
        technique_key: technique,
        field_label: definition.field_label,
        status: "missing" as const,
        candidate_value: null,
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "Champ plateforme pas encore rempli.",
      },
    ]),
  );
}

function requiredFieldOrder(
  technique: AttackCardTechniqueKey | null,
): AttackCardPlatformFieldId[] {
  return technique
    ? ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS[technique].map((field) =>
      field.field_id
    )
    : [];
}

function nextFieldId(
  state: Pick<
    PrepareAttackCardLocalState,
    "platform_field_order" | "platform_field_states"
  >,
): AttackCardPlatformFieldId | null {
  return state.platform_field_order.find((fieldId) =>
    state.platform_field_states[fieldId]?.status !== "locked" ||
    !state.platform_field_states[fieldId]?.locked_value
  ) ?? null;
}

export function createInitialPrepareAttackCardLocalState(
  args: {
    activeState?: AttackCardHandoffState | null;
    operationInput?: Record<string, unknown> | null;
  } = {},
): PrepareAttackCardLocalState {
  const draft = args.activeState?.draft ?? null;
  const inputTarget = args.operationInput?.target &&
      typeof args.operationInput.target === "object"
    ? args.operationInput.target as Record<string, unknown>
    : null;
  const targetTitle = stringValue(inputTarget?.title) ??
    stringValue(args.operationInput?.target_label) ??
    stringValue(args.operationInput?.action_title) ??
    draft?.target_summary ?? null;
  const targetKind = inputTarget?.kind === "plan_item"
    ? "plan_item"
    : targetTitle
    ? "personal_action"
    : null;
  const target: PrepareAttackCardTargetState = targetTitle
    ? {
      status: "proposed",
      kind: targetKind,
      plan_item_id: stringValue(inputTarget?.plan_item_id),
      candidate_value: targetTitle,
      locked_value: null,
      needs_user_confirmation: true,
      why_status: "Cible proposée depuis le contexte structuré.",
    }
    : {
      status: "missing",
      kind: null,
      plan_item_id: null,
      candidate_value: null,
      locked_value: null,
      needs_user_confirmation: false,
      why_status: "Cible manquante.",
    };
  const technique = techniqueKey(draft?.platform_handoff?.technique_key);
  const fields = initialFieldStates(technique);
  for (const input of draft?.platform_handoff?.inputs ?? []) {
    const fieldId = platformFieldId(input.field_id, technique);
    if (!fieldId || !fields[fieldId]) continue;
    const value = stringValue(input.value) ??
      stringValue(input.suggested_answer);
    if (!value) continue;
    fields[fieldId] = {
      ...fields[fieldId],
      status: "locked",
      locked_value: value,
      needs_user_confirmation: false,
      why_status: "Valeur reprise du dernier handoff.",
    };
  }
  const state: PrepareAttackCardLocalState = {
    flow_id: "prepare_attack_card",
    flow_kind: draft?.platform_handoff?.flow_kind ?? null,
    platform_destination: PLATFORM_DESTINATION,
    target_state: draft?.target_summary
      ? {
        status: "locked",
        kind: targetKind,
        plan_item_id: stringValue(inputTarget?.plan_item_id),
        candidate_value: null,
        locked_value: draft.target_summary,
        needs_user_confirmation: false,
        why_status: "Cible reprise du dernier handoff.",
      }
      : target,
    blocker_state: draft?.blocker_summary
      ? {
        status: "locked",
        blocker_type: null,
        candidate_value: null,
        locked_value: draft.blocker_summary,
        needs_user_confirmation: false,
        why_status: "Piège repris du dernier handoff.",
      }
      : {
        status: "missing",
        blocker_type: null,
        candidate_value: null,
        locked_value: null,
        needs_user_confirmation: false,
        why_status: "Piège manquant.",
      },
    technique_state: technique
      ? {
        status: "locked",
        technique_key: technique,
        technique_label: ATTACK_CARD_TECHNIQUE_LABELS[technique],
        explicitly_requested: false,
        candidate_options: [],
        fit_warning: null,
        needs_user_confirmation: false,
        why_status: "Technique reprise du dernier handoff.",
      }
      : {
        status: "missing",
        technique_key: null,
        technique_label: null,
        explicitly_requested: false,
        candidate_options: [],
        fit_warning: null,
        needs_user_confirmation: false,
        why_status: "Technique manquante.",
      },
    platform_field_order: requiredFieldOrder(technique),
    platform_field_states: fields,
    activation_keyword_state: {
      status: technique === "pre_engagement" ? "missing" : "not_applicable",
      candidate_value: null,
      locked_value: null,
      needs_user_confirmation: false,
      why_status: technique === "pre_engagement"
        ? "Mot de bascule optionnel non fourni."
        : "Non applicable.",
    },
    current_field_id: null,
    last_visible_task: null,
    last_handoff_delivered: Boolean(draft),
    subskill_history: Array.isArray(
        (args.activeState as any)?.local_state
          ?.subskill_history,
      )
      ? (args.activeState as any).local_state.subskill_history.slice(-8)
      : [],
  };
  return { ...state, current_field_id: nextFieldId(state) };
}

export function normalizePrepareAttackCardLocalDispatcherOutput(
  raw: unknown,
): PrepareAttackCardLocalDispatcherOutput {
  const root = parseJsonObject(raw);
  const normalizedTechnique = techniqueState(root.technique_state);
  const normalizedTarget = targetState(root.target_state);
  const normalizedBlocker = blockerState(root.blocker_state);
  const selectedTechnique = normalizedTechnique.technique_key;
  const fields = Array.isArray(root.platform_field_states)
    ? root.platform_field_states.flatMap((item) => {
      const normalized = fieldState(item, selectedTechnique);
      return normalized ? [normalized] : [];
    })
    : [];
  const risk = riskAssessment(root.risk_assessment);
  const action = flowAction(root.flow_action);
  const task = visibleTaskKind((root.visible_task as any)?.kind);
  const targetDispatcher: NoteInformationTargetDispatcher =
    action === "safety_preempt"
      ? "safety_crisis"
      : action === "get_info_product" || action === "inline_product"
      ? "product_help"
      : action === "get_info_db" || action === "inline_status"
      ? "status_recap"
      : action === "handoff_to_local_flow"
      ? normalizeTargetDispatcher(
        (root.note_information as any)?.target_dispatcher,
        "other_local",
      )
      : "global";
  const fallbackNoteContext = {
    source_flow: "prepare_attack_card",
    flow_action: action,
    visible_task_kind: task,
    target_state: normalizedTarget,
    blocker_state: normalizedBlocker,
    technique_state: normalizedTechnique,
    platform_field_states: fields,
    activation_keyword_state: activationKeywordState(
      root.activation_keyword_state,
      selectedTechnique,
    ),
    no_chat_mutation: true,
  };
  const fallbackStateSummary = [
    normalizedTarget.locked_value || normalizedTarget.candidate_value
      ? `target=${
        normalizedTarget.locked_value ?? normalizedTarget.candidate_value
      }`
      : "target=missing",
    normalizedBlocker.locked_value || normalizedBlocker.candidate_value
      ? `blocker=${
        normalizedBlocker.locked_value ?? normalizedBlocker.candidate_value
      }`
      : "blocker=missing",
    normalizedTechnique.technique_label
      ? `technique=${normalizedTechnique.technique_label}`
      : "technique=missing",
  ].join("; ");
  return {
    flow_action: action,
    confidence: confidence(root.confidence),
    stage: localStage(root.stage),
    flow_kind: flowKind(root.flow_kind),
    target_state: normalizedTarget,
    blocker_state: normalizedBlocker,
    technique_state: normalizedTechnique,
    platform_field_states: fields,
    activation_keyword_state: activationKeywordState(
      root.activation_keyword_state,
      selectedTechnique,
    ),
    revision: {
      is_revision: (root.revision as any)?.is_revision === true,
      revision_target: [
          "target",
          "blocker",
          "technique",
          "platform_field",
          "activation_keyword",
          "unknown",
        ].includes(String((root.revision as any)?.revision_target ?? ""))
        ? (root.revision as any).revision_target
        : null,
      field_id: stringValue((root.revision as any)?.field_id),
      replacement_value: stringValue((root.revision as any)?.replacement_value),
      replaces_previous_value:
        (root.revision as any)?.replaces_previous_value === true,
    },
    visible_task: {
      kind: task,
      conversation_context: recordValue(
        (root.visible_task as any)?.conversation_context,
      ),
    },
    subskill_call: {
      needed: (root.subskill_call as any)?.needed === true,
      skill_id: ["product_help", "status_recap"].includes(
          String((root.subskill_call as any)?.skill_id ?? ""),
        )
        ? (root.subskill_call as any).skill_id
        : null,
      reason: stringValue((root.subskill_call as any)?.reason),
      context_for_subskill: (root.subskill_call as any)?.context_for_subskill &&
          typeof (root.subskill_call as any).context_for_subskill ===
            "object" &&
          !Array.isArray((root.subskill_call as any).context_for_subskill)
        ? (root.subskill_call as any).context_for_subskill
        : {},
    },
    exit_memo: {
      needed: (root.exit_memo as any)?.needed === true,
      reason: [
          "none",
          "topic_change",
          "cancelled",
          "safety",
        ].includes(String((root.exit_memo as any)?.reason ?? ""))
        ? (root.exit_memo as any).reason
        : "none",
      flow_summary: stringValue((root.exit_memo as any)?.flow_summary),
      handoff_hint_for_global_dispatcher: stringValue(
        (root.exit_memo as any)?.handoff_hint_for_global_dispatcher,
      ),
    },
    no_chat_mutation: {
      attack_card_created: false,
      chat_side_effect_committed: false,
      platform_write_committed: false,
      db_write_committed: false,
    },
    note_information: normalizeDispatcherNoteInformation({
      raw: root.note_information,
      outputRoot: root,
      targetDispatcher,
      fallbackStateSummary,
      fallbackContext: fallbackNoteContext,
      riskScore: risk.risk_score,
    }),
    risk_assessment: action === "safety_preempt" && risk.safety_preempt !== true
      ? {
        risk_score: Math.max(risk.risk_score, 8),
        risk_band: risk.risk_band === "none" ? "high" : risk.risk_band,
        safety_preempt: true,
        reason_codes: risk.reason_codes.length
          ? risk.reason_codes
          : ["prepare_attack_card_local_safety_preempt"],
      }
      : risk,
    evidence: stringArray(root.evidence),
  };
}

function mergeTarget(
  previous: PrepareAttackCardTargetState,
  incoming: PrepareAttackCardTargetState,
): PrepareAttackCardTargetState {
  if (incoming.status === "missing") return previous;
  return { ...previous, ...incoming };
}

function mergeBlocker(
  previous: PrepareAttackCardBlockerState,
  incoming: PrepareAttackCardBlockerState,
): PrepareAttackCardBlockerState {
  if (incoming.status === "missing") return previous;
  return { ...previous, ...incoming };
}

function mergeTechnique(
  previous: PrepareAttackCardTechniqueState,
  incoming: PrepareAttackCardTechniqueState,
): PrepareAttackCardTechniqueState {
  if (incoming.status === "missing" && previous.status !== "missing") {
    return previous;
  }
  if (
    incoming.technique_key && incoming.technique_key !== previous.technique_key
  ) {
    return incoming;
  }
  return { ...previous, ...incoming };
}

function mergeFields(args: {
  previous: Record<string, PrepareAttackCardPlatformFieldState>;
  incoming: PrepareAttackCardPlatformFieldState[];
  technique: AttackCardTechniqueKey | null;
}): Record<string, PrepareAttackCardPlatformFieldState> {
  const base = {
    ...initialFieldStates(args.technique),
    ...args.previous,
  };
  for (const field of args.incoming) {
    if (field.technique_key !== args.technique) continue;
    const previous = base[field.field_id];
    if (!previous) {
      base[field.field_id] = field;
      continue;
    }
    if (field.status === "missing" && previous.status !== "missing") continue;
    base[field.field_id] = {
      ...previous,
      ...field,
      previous_value: field.previous_value ?? previous.locked_value ??
        previous.candidate_value,
    };
  }
  return base;
}

function allReady(state: PrepareAttackCardLocalState): boolean {
  return state.target_state.status === "locked" &&
    Boolean(state.target_state.locked_value) &&
    state.blocker_state.status === "locked" &&
    Boolean(state.blocker_state.locked_value) &&
    state.technique_state.status === "locked" &&
    Boolean(state.technique_state.technique_key) &&
    state.platform_field_order.every((fieldId) =>
      state.platform_field_states[fieldId]?.status === "locked" &&
      Boolean(state.platform_field_states[fieldId]?.locked_value)
    );
}

function lockedFields(state: PrepareAttackCardLocalState) {
  return state.platform_field_order.flatMap((fieldId) => {
    const field = state.platform_field_states[fieldId];
    return field?.locked_value
      ? [{
        field_id: field.field_id,
        field_label: field.field_label,
        field_value: field.locked_value,
      }]
      : [];
  });
}

function missingFields(state: PrepareAttackCardLocalState): string[] {
  const missing: string[] = [];
  if (state.target_state.status !== "locked") missing.push("target");
  if (state.blocker_state.status !== "locked") missing.push("blocker");
  if (state.technique_state.status !== "locked") missing.push("technique");
  for (const fieldId of state.platform_field_order) {
    const field = state.platform_field_states[fieldId];
    if (field?.status !== "locked" || !field.locked_value) {
      missing.push(fieldId);
    }
  }
  return missing;
}

function stateSummaryForConversation(
  state: PrepareAttackCardLocalState,
): string {
  const target = state.target_state.locked_value ??
    state.target_state.candidate_value;
  const blocker = state.blocker_state.locked_value ??
    state.blocker_state.candidate_value;
  const technique = state.technique_state.technique_label;
  return [
    target ? `Cible: ${target}` : "Cible non verrouillee",
    blocker ? `Piege: ${blocker}` : "Piege non verrouille",
    technique ? `Technique: ${technique}` : "Technique non verrouillee",
  ].join(" | ");
}

function buildPrepareAttackCardConversationContext(args: {
  state: PrepareAttackCardLocalState;
  visibleTask: PrepareAttackCardVisibleTaskKind;
  output: PrepareAttackCardLocalDispatcherOutput;
  currentFieldId: AttackCardPlatformFieldId | null;
  draft: AttackCardHandoffDraft | null;
}): PrepareAttackCardConversationContext {
  const currentField = args.currentFieldId
    ? args.state.platform_field_states[args.currentFieldId] ?? null
    : null;
  const locked = lockedFields(args.state);
  const missing = missingFields(args.state);
  const incomingContext = recordValue(
    args.output.visible_task.conversation_context,
  );
  const selectedCandidate = recordValue(incomingContext.selected_candidate);
  const canExposePlatformHandoff = [
    "handoff_ready",
    "revision_done",
    "destination_short",
    "apply_attempt",
    "repeat_handoff",
  ].includes(args.visibleTask);
  const revisionField = currentField?.previous_value
    ? currentField
    : args.state.platform_field_order.map((fieldId) =>
      args.state.platform_field_states[fieldId]
    ).find((field) => Boolean(field?.previous_value)) ??
      null;
  return {
    state_summary: stringValue(incomingContext.state_summary) ??
      stateSummaryForConversation(args.state),
    user_words: stringArray(incomingContext.user_words, 4),
    field_or_stage: stringValue(incomingContext.field_or_stage) ??
      args.currentFieldId ?? args.visibleTask,
    known_values: {
      target: args.state.target_state,
      blocker: args.state.blocker_state,
      technique: args.state.technique_state,
      current_field: currentField,
      activation_keyword: args.state.activation_keyword_state,
    },
    missing_or_weak_values: stringArray(
        incomingContext.missing_or_weak_values,
        8,
      ).length
      ? stringArray(incomingContext.missing_or_weak_values, 8)
      : missing,
    selected_candidate: {
      ...selectedCandidate,
      previous_value: selectedCandidate.previous_value ??
        revisionField?.previous_value ?? null,
    },
    handoff_data: {
      operation_name: "prepare_attack_card",
      surface_label: "Cartes d'attaque",
      platform_destination: canExposePlatformHandoff
        ? args.state.platform_destination
        : "",
      platform_steps: canExposePlatformHandoff ? PLATFORM_STEPS : [],
      flow_kind: args.state.flow_kind,
      technique_label: args.state.technique_state.technique_label,
      target_value: args.state.target_state.locked_value ??
        args.state.target_state.candidate_value,
      blocker_value: args.state.blocker_state.locked_value ??
        args.state.blocker_state.candidate_value,
      locked_fields: locked,
      missing_fields: missing,
      activation_keyword: args.state.activation_keyword_state.locked_value,
      no_chat_mutation: true,
    },
    tone_constraints: stringArray(incomingContext.tone_constraints, 6),
    do_not_say: [
      "c'est cree",
      "je l'ai creee",
      "je l'ai ajoutee",
      "c'est active",
      "dis oui et je la cree",
      ...stringArray(incomingContext.do_not_say, 8),
    ],
    context_summary: stringValue(incomingContext.context_summary) ??
      (args.draft
        ? "Tous les champs necessaires sont prets pour le handoff plateforme."
        : null),
    evidence_used: stringArray(incomingContext.evidence_used, 8).length
      ? stringArray(incomingContext.evidence_used, 8)
      : args.output.evidence,
  };
}

function emptyConversationContext(args: {
  previous: PrepareAttackCardLocalState;
  output: PrepareAttackCardLocalDispatcherOutput;
  visibleTask: PrepareAttackCardVisibleTaskKind;
}): PrepareAttackCardConversationContext {
  return buildPrepareAttackCardConversationContext({
    state: args.previous,
    visibleTask: args.visibleTask,
    output: args.output,
    currentFieldId: args.previous.current_field_id,
    draft: null,
  });
}

function targetDispatcherForFlowAction(
  output: PrepareAttackCardLocalDispatcherOutput,
): NoteInformationTargetDispatcher | null {
  switch (output.flow_action) {
    case "exit_to_global_dispatcher":
      return "global";
    case "safety_preempt":
      return "safety_crisis";
    case "get_info_product":
    case "inline_product":
      return "product_help";
    case "get_info_db":
    case "inline_status":
      return "status_recap";
    case "handoff_to_local_flow":
      return output.note_information?.target_dispatcher ?? "other_local";
    default:
      return null;
  }
}

function noteInformationForFlowAction(args: {
  output: PrepareAttackCardLocalDispatcherOutput;
  state: PrepareAttackCardLocalState;
  context: PrepareAttackCardConversationContext;
}): NoteInformation | null {
  const targetDispatcher = targetDispatcherForFlowAction(args.output);
  if (!targetDispatcher) return null;
  if (args.output.note_information) return args.output.note_information;
  return createNoteInformation({
    source_flow_id: "prepare_attack_card",
    handoff_reason: targetDispatcher === "safety_crisis"
      ? "safety"
      : targetDispatcher === "global"
      ? "topic_change"
      : targetDispatcher === "product_help" ||
          targetDispatcher === "status_recap"
      ? "inline_tool"
      : "bridge",
    target_dispatcher: targetDispatcher,
    handoff_context_for_next_dispatcher: JSON.stringify({
      source_flow: "prepare_attack_card",
      flow_action: args.output.flow_action,
      active_flow_summary: args.context.state_summary,
      collected_state: {
        target: args.state.target_state,
        blocker: args.state.blocker_state,
        technique: args.state.technique_state,
        locked_fields: args.context.handoff_data.locked_fields,
        missing_fields: args.context.handoff_data.missing_fields,
      },
      unresolved_questions: args.context.missing_or_weak_values,
      evidence: args.output.evidence,
      recommended_next_focus: targetDispatcher === "global"
        ? "Reprendre la nouvelle intention utilisateur sans relancer la carte d'attaque sauf demande explicite."
        : targetDispatcher === "safety_crisis"
        ? "Prioriser la prise en charge safety; ignorer la carte sauf contexte utile."
        : "Traiter la demande cible en conservant le flow prepare_attack_card comme parent.",
    }),
    user_words: args.context.user_words,
    structured_context: {
      source_flow: "prepare_attack_card",
      target_dispatcher: targetDispatcher,
      flow_action: args.output.flow_action,
      active_flow_summary: args.context.state_summary,
      collected_state: {
        target: args.state.target_state,
        blocker: args.state.blocker_state,
        technique: args.state.technique_state,
        locked_fields: args.context.handoff_data.locked_fields,
        missing_fields: args.context.handoff_data.missing_fields,
      },
      unresolved_questions: args.context.missing_or_weak_values,
      confidence: args.output.confidence,
      evidence: args.output.evidence,
      recommended_next_focus: targetDispatcher === "global"
        ? "Reprendre la nouvelle intention utilisateur sans relancer la carte d'attaque sauf demande explicite."
        : targetDispatcher === "safety_crisis"
        ? "Prioriser la prise en charge safety; ignorer la carte sauf contexte utile."
        : "Traiter la demande cible en conservant le flow prepare_attack_card comme parent.",
    },
    confidence: args.output.confidence,
  });
}

function draftFromState(
  state: PrepareAttackCardLocalState,
): AttackCardHandoffDraft | null {
  if (!allReady(state) || !state.technique_state.technique_key) return null;
  const technique = state.technique_state.technique_key;
  const inputs = lockedFields(state).map((field) => ({
    field_id: field.field_id as AttackCardPlatformFieldId,
    question: field.field_label,
    suggested_answer: field.field_value,
    value: field.field_value,
    status: "locked" as const,
  }));
  const keyword = state.activation_keyword_state.locked_value;
  return {
    operation_type: "prepare_attack_card",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    target_summary: state.target_state.locked_value ?? "",
    blocker_summary: state.blocker_state.locked_value ?? "",
    recommendation: {
      technique_label: ATTACK_CARD_TECHNIQUE_LABELS[technique],
      why_this_technique: state.technique_state.why_status ??
        "Technique choisie dans le flow local.",
      card_draft_summary: "",
      preserve: [],
      avoid: [],
      platform_destination: PLATFORM_DESTINATION,
      platform_steps: PLATFORM_STEPS,
    },
    platform_handoff: {
      flow_kind: state.flow_kind ?? "free_attack_card",
      surface_label: "Cartes d'attaque",
      destination: PLATFORM_DESTINATION,
      steps: PLATFORM_STEPS,
      technique_key: technique,
      technique_label: ATTACK_CARD_TECHNIQUE_LABELS[technique],
      inputs,
      expected_result: technique === "pre_engagement" && keyword
        ? {
          output_title: "",
          generated_asset: "",
          supporting_points: [],
          mode_emploi: "",
          keyword_trigger: {
            activation_keyword: keyword,
            risk_situation: state.blocker_state.locked_value ?? "",
            strength_anchor: state.target_state.locked_value ?? "",
            first_response_intent:
              "Revenir au choix protege avant la reaction automatique.",
            assistant_prompt:
              `Quand j'envoie ${keyword}, aide-moi a tenir le choix protege sans creer de carte depuis le chat.`,
          },
        }
        : null,
      plan_action_note: state.flow_kind === "plan_action_cards"
        ? "Pour une action du plan, reprends ces champs depuis la carte d'attaque de l'action dans la plateforme."
        : null,
    },
    missing_decisions: [],
  };
}

function withVisibleTask(
  state: PrepareAttackCardLocalState,
  visibleTask: PrepareAttackCardVisibleTaskKind,
): PrepareAttackCardLocalState {
  return {
    ...state,
    current_field_id: nextFieldId(state),
    last_visible_task: visibleTask,
    last_handoff_delivered: state.last_handoff_delivered ||
      [
        "handoff_ready",
        "revision_done",
        "destination_short",
        "apply_attempt",
        "repeat_handoff",
      ].includes(visibleTask),
  };
}

function platformFieldVisibleTask(
  state: PrepareAttackCardLocalState,
  currentFieldId: AttackCardPlatformFieldId | null,
): PrepareAttackCardVisibleTaskKind {
  if (!currentFieldId) return "handoff_ready";
  const field = state.platform_field_states[currentFieldId];
  return field?.status === "proposed" && field.needs_user_confirmation
    ? "confirm_platform_field_proposal"
    : "ask_platform_field";
}

function normalizeVisibleTaskForState(args: {
  state: PrepareAttackCardLocalState;
  output: PrepareAttackCardLocalDispatcherOutput;
  currentFieldId: AttackCardPlatformFieldId | null;
}): PrepareAttackCardVisibleTaskKind {
  const requested = args.output.visible_task.kind;
  const stateWithCurrent = {
    ...args.state,
    current_field_id: args.currentFieldId,
  };
  if (allReady(stateWithCurrent)) {
    return [
        "apply_attempt",
        "repeat_handoff",
        "destination_short",
        "revision_done",
      ].includes(requested)
      ? requested
      : "handoff_ready";
  }
  if (
    requested === "ask_or_confirm_technique" &&
    (args.state.technique_state.status === "ambiguous" ||
      args.state.technique_state.status === "proposed")
  ) {
    return "ask_or_confirm_technique";
  }
  if (args.state.target_state.status !== "locked") {
    return args.state.target_state.status === "proposed" ||
        args.state.target_state.needs_user_confirmation
      ? "confirm_target_candidate"
      : "ask_target";
  }
  if (args.state.blocker_state.status !== "locked") return "ask_blocker";
  if (args.state.technique_state.status !== "locked") {
    return "ask_or_confirm_technique";
  }
  if (requested === "revision_done") return "revision_done";
  return platformFieldVisibleTask(args.state, args.currentFieldId);
}

export function reducePrepareAttackCardLocalDispatcherOutput(args: {
  previous: PrepareAttackCardLocalState | null;
  output: PrepareAttackCardLocalDispatcherOutput;
}): PrepareAttackCardReducerResult {
  const previous = args.previous ?? createInitialPrepareAttackCardLocalState();
  const output = args.output;
  const toolFlags = {
    get_info_product: false,
    get_info_db: false,
    subskill_context: null as Record<string, unknown> | null,
  };
  if (output.flow_action === "exit_to_global_dispatcher") {
    const context = emptyConversationContext({
      previous,
      output,
      visibleTask: "exit_ack",
    });
    const note = noteInformationForFlowAction({
      output,
      state: previous,
      context,
    });
    return {
      status: "topic_change",
      reason_code: "prepare_attack_card_local_exit_to_global_dispatcher",
      local_state: null,
      draft: null,
      visible_task: "exit_ack",
      visible_task_context: context,
      note_information: note,
      exit_to_global_dispatcher: true,
      handoff_to_local_flow: false,
      target_dispatcher: note?.target_dispatcher ?? "global",
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
    };
  }
  if (
    output.flow_action === "cancel_flow" ||
    output.flow_action === "defer_flow"
  ) {
    const context = emptyConversationContext({
      previous,
      output,
      visibleTask: "stop_or_cancel",
    });
    return {
      status: "cancelled",
      reason_code: output.flow_action === "cancel_flow"
        ? "prepare_attack_card_local_cancelled"
        : "prepare_attack_card_local_stopped_no_handoff",
      local_state: null,
      draft: null,
      visible_task: "stop_or_cancel",
      visible_task_context: context,
      note_information: null,
      exit_to_global_dispatcher: false,
      handoff_to_local_flow: false,
      target_dispatcher: null,
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
    };
  }
  const nextTechnique = mergeTechnique(
    previous.technique_state,
    output.technique_state,
  );
  const techniqueChanged = nextTechnique.technique_key !==
    previous.technique_state.technique_key;
  const fieldOrder = requiredFieldOrder(nextTechnique.technique_key);
  const fieldStates = mergeFields({
    previous: techniqueChanged ? {} : previous.platform_field_states,
    incoming: output.platform_field_states,
    technique: nextTechnique.technique_key,
  });
  const reduced: PrepareAttackCardLocalState = {
    ...previous,
    flow_kind: output.flow_kind ?? previous.flow_kind ?? "free_attack_card",
    target_state: mergeTarget(previous.target_state, output.target_state),
    blocker_state: mergeBlocker(previous.blocker_state, output.blocker_state),
    technique_state: nextTechnique,
    platform_field_order: fieldOrder,
    platform_field_states: fieldStates,
    activation_keyword_state: activationKeywordState(
      output.activation_keyword_state,
      nextTechnique.technique_key,
    ),
  };
  const currentFieldId = nextFieldId(reduced);
  const visibleTask = normalizeVisibleTaskForState({
    state: reduced,
    output,
    currentFieldId,
  });
  const state = withVisibleTask(
    { ...reduced, current_field_id: currentFieldId },
    visibleTask,
  );
  const draft = draftFromState(state);
  const context = buildPrepareAttackCardConversationContext({
    state,
    visibleTask,
    output,
    currentFieldId,
    draft,
  });
  const noteInformation = noteInformationForFlowAction({
    output,
    state,
    context,
  });
  if (
    output.flow_action === "get_info_product" ||
    output.flow_action === "inline_product"
  ) {
    return {
      status: "collecting",
      reason_code: "prepare_attack_card_get_info_product",
      local_state: withVisibleTask(state, "none"),
      draft,
      visible_task: "none",
      visible_task_context: context,
      note_information: noteInformation,
      exit_to_global_dispatcher: false,
      handoff_to_local_flow: false,
      target_dispatcher: "product_help",
      get_info_product: true,
      get_info_db: false,
      subskill_context: output.subskill_call.context_for_subskill,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
    };
  }
  if (
    output.flow_action === "get_info_db" ||
    output.flow_action === "inline_status"
  ) {
    return {
      status: "collecting",
      reason_code: "prepare_attack_card_get_info_db",
      local_state: withVisibleTask(state, "none"),
      draft,
      visible_task: "none",
      visible_task_context: context,
      note_information: noteInformation,
      exit_to_global_dispatcher: false,
      handoff_to_local_flow: false,
      target_dispatcher: "status_recap",
      get_info_product: false,
      get_info_db: true,
      subskill_context: output.subskill_call.context_for_subskill,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
    };
  }
  if (output.flow_action === "handoff_to_local_flow") {
    return {
      status: "topic_change",
      reason_code: "prepare_attack_card_handoff_to_local_flow",
      local_state: null,
      draft: null,
      visible_task: "none",
      visible_task_context: context,
      note_information: noteInformation,
      exit_to_global_dispatcher: false,
      handoff_to_local_flow: true,
      target_dispatcher: noteInformation?.target_dispatcher ?? "other_local",
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
    };
  }
  if (output.flow_action === "safety_preempt") {
    return {
      status: "blocked",
      reason_code: "prepare_attack_card_local_safety_preempt",
      local_state: state,
      draft: null,
      visible_task: "safety_transition",
      visible_task_context: context,
      note_information: noteInformation,
      exit_to_global_dispatcher: false,
      handoff_to_local_flow: false,
      target_dispatcher: "safety_crisis",
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
    };
  }
  if (output.flow_action === "apply_attempt") {
    return {
      status: "apply_attempt",
      reason_code: "apply_attempt_no_chat_mutation",
      local_state: state,
      draft,
      visible_task: "apply_attempt",
      visible_task_context: buildPrepareAttackCardConversationContext({
        state,
        visibleTask: "apply_attempt",
        output,
        currentFieldId,
        draft,
      }),
      note_information: null,
      exit_to_global_dispatcher: false,
      handoff_to_local_flow: false,
      target_dispatcher: null,
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [{
        type: "create_attack_card",
        reason_code: "chat_creation_disabled_platform_handoff",
      }],
    };
  }
  if (output.flow_action === "repeat_handoff") {
    return {
      status: "repeat_handoff",
      reason_code: "repeat_platform_handoff",
      local_state: state,
      draft,
      visible_task: "repeat_handoff",
      visible_task_context: buildPrepareAttackCardConversationContext({
        state,
        visibleTask: "repeat_handoff",
        output,
        currentFieldId,
        draft,
      }),
      note_information: null,
      exit_to_global_dispatcher: false,
      handoff_to_local_flow: false,
      target_dispatcher: null,
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
    };
  }
  if (
    output.flow_action === "platform_destination_followup" ||
    output.flow_action === "destination_followup"
  ) {
    return {
      status: "handoff_delivered",
      reason_code: "destination_short",
      local_state: state,
      draft,
      visible_task: "destination_short",
      visible_task_context: buildPrepareAttackCardConversationContext({
        state,
        visibleTask: "destination_short",
        output,
        currentFieldId,
        draft,
      }),
      note_information: null,
      exit_to_global_dispatcher: false,
      handoff_to_local_flow: false,
      target_dispatcher: null,
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
    };
  }
  if (draft && (allReady(state) || output.flow_action === "handoff_ready")) {
    return {
      status: "handoff_delivered",
      reason_code: "handoff_ready",
      local_state: state,
      draft,
      visible_task: visibleTask,
      visible_task_context: context,
      note_information: null,
      exit_to_global_dispatcher: false,
      handoff_to_local_flow: false,
      target_dispatcher: null,
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
    };
  }
  return {
    status: visibleTask === "ask_blocker" ||
        visibleTask === "ask_or_confirm_technique" ||
        visibleTask === "ask_platform_field" ||
        visibleTask === "confirm_platform_field_proposal"
      ? "clarifying"
      : "collecting",
    reason_code: `prepare_attack_card_local_${visibleTask}`,
    local_state: state,
    draft: null,
    visible_task: visibleTask,
    visible_task_context: context,
    note_information: null,
    exit_to_global_dispatcher: false,
    handoff_to_local_flow: false,
    target_dispatcher: null,
    ...toolFlags,
    risk_assessment: output.risk_assessment,
    blocked_effects: [],
  };
}

export function dispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local structure du flow prepare_attack_card.",
    "Tu ne reponds jamais directement au user. Tu retournes uniquement un JSON valide.",
    "Le dispatcher global ne doit pas tourner pendant ce flow actif. Tu ne sors vers lui que si le message quitte clairement ce flow.",
    "Mission: aider le user a preparer une carte d'attaque a reprendre dans la plateforme. Le chat ne cree jamais la carte.",
    "Tu es l'unique decideur metier du flow actif: cible, piege, technique, champs plateforme, revision, repeat, destination, apply_attempt et sortie.",
    "Aucune regex metier, aucun mot-cle isole, aucune creation DB, aucun pending executable, aucun token de confirmation, aucun effet durable.",
    "",
    "Field Completion Rules:",
    "- flow_action: decision principale du tour courant. Choisis-la depuis le message actuel + l'etat actif, pas seulement depuis l'etat precedent. Utilise continue_local/missing_info/confirm_candidate/answer_current_field/confirm_proposed_field/choose_technique/confirm_technique_proposal pour avancer localement; revise_current_field/revise_technique/revise_target/revise pour corriger; repeat_handoff pour repeter les valeurs pretes; platform_destination_followup ou destination_followup pour une question courte de destination; apply_attempt si le user demande creer/lancer/ajouter depuis le chat; exit_to_global_dispatcher si le user arrete ce flow ou si un nouveau sujet clair doit etre reanalyse par global; handoff_to_local_flow si le user bascule explicitement vers un autre flow local autorise; safety_preempt pour safety. Erreur a eviter: continuer le flow carte quand le user demande clairement autre chose.",
    "- confidence: high si intention et prochaine action sont claires; medium si probable mais une valeur reste a confirmer; low si clarification/prudence necessaire. Le reducer ne doit pas recevoir high pour une hypothese fragile.",
    "- stage: etape interne actuelle. target_intake pour cible, blocker_intake pour piege/friction, technique_selection pour technique, platform_field_intake pour champs plateforme, handoff_ready quand toutes les valeurs requises sont locked, handoff_delivered apres livraison, exit pour stop/exit/safety. Il aide les traces et le visible stage; ne l'utilise pas pour masquer une incoherence d'etat.",
    "- flow_kind: free_attack_card si carte libre; plan_action_cards si cible reliee clairement a une action/plan id existant; adjust_existing_attack_card seulement si le user corrige une carte existante; null si inconnu. Ne fabrique pas de plan_item_id.",
    "- target_state: cible/action de la carte. status=missing si aucune action; ambiguous si plusieurs cibles ou reference vague; proposed si cible probable a confirmer; locked seulement si le user l'a donnee/validee clairement. kind=plan_item uniquement avec id fiable; personal_action sinon; unknown si domaine incertain. candidate_value pour une proposition; locked_value uniquement pour une valeur stabilisee. needs_user_confirmation=true avec proposed/ambiguous. Influence: target non locked -> ask_target ou confirm_target_candidate.",
    "- blocker_state: piege, excuse, friction ou moment ou l'action deraille. missing si absent; proposed si inference plausible; locked si user l'a donne/valide. blocker_type decrit la nature, sans forcer. Ne transforme pas un contexte vague en fait. Influence: target locked + blocker non locked -> ask_blocker.",
    "- technique_state: technique choisie ou a proposer. status=missing si aucune technique ni option; ambiguous si plusieurs techniques pertinentes ou demande incoherente; proposed si tu proposes une technique; locked si label exact demande/valide ou proposition confirmee. technique_key doit etre une cle exacte; technique_label le label exact. candidate_options max 3 options utiles. explicitly_requested=true seulement si le user demande vraiment la technique. fit_warning si la technique forcee semble incoherente. Ne choisis pas pre_engagement/Mot de bascule pour un simple demarrage d'action sauf demande explicite de mot de bascule, craquage, rupture, esquive ou validation user. Influence: technique non locked -> ask_or_confirm_technique.",
    "- platform_field_states: champs specifiques a la technique. Ne remplis que les field_id autorises pour technique_key. status=missing si absent; proposed si deduit mais pas valide; locked si donne/valide clairement. candidate_value pour proposition; locked_value pour valeur finale; previous_value pour revision. Un champ vague reste proposed/missing. Influence: le reducer calcule current_field_id et demande ask_platform_field ou confirm_platform_field_proposal.",
    "- activation_keyword_state: seulement pour pre_engagement. not_applicable pour toutes les autres techniques. Pour pre_engagement, missing/proposed/locked seulement si le user donne, demande ou valide un mot d'activation. Ne rends jamais activation_keyword obligatoire hors demande explicite.",
    "- revision: is_revision=true si le user corrige/remplace cible, piege, technique, champ plateforme ou activation keyword. revision_target exact; field_id seulement pour platform_field; replacement_value avec la nouvelle valeur; replaces_previous_value=true si elle remplace une valeur locked/proposed. Laisser false/null hors correction. Influence: le reducer remplace la valeur principale et visible_task.kind peut devenir revision_done.",
    "- visible_task.kind: stage visible exact, jamais generique. ask_target si cible absente; confirm_target_candidate si cible probable; ask_blocker si piege a obtenir/confirmer; ask_or_confirm_technique si technique a choisir/confirmer; ask_platform_field si champ manquant; confirm_platform_field_proposal si champ propose; handoff_ready quand tout est locked; revision_done apres correction; destination_short pour question de destination; apply_attempt pour demande de creation chat; repeat_handoff pour repetition; inline_tool_return seulement apres retour inline; stop_or_cancel pour sortie/annulation; exit_ack pour exit global; safety_transition pour safety; none pour inline/handoff sans message visible local. Erreur a eviter: utiliser handoff_ready ou donner destination avant champs requis locked.",
    "- visible_task.conversation_context: seul contexte que l'agent visible peut utiliser. Filtre-le: state_summary, user_words, field_or_stage, known_values, missing_or_weak_values, selected_candidate, handoff_data, tone_constraints, do_not_say, context_summary, evidence_used. Pas de DB brute, pas de memoire brute, pas de note_information brute. Pendant ask_target/confirm_target_candidate/ask_blocker/ask_or_confirm_technique/ask_platform_field/confirm_platform_field_proposal, handoff_data.platform_steps doit rester vide et ne doit pas encourager a aller dans la plateforme; reserve platform_steps aux stages handoff_ready, repeat_handoff, destination_short et apply_attempt. Inclure contraintes user et limites de ton dans tone_constraints/do_not_say.",
    "- subskill_call: inline product/status temporaire, pas changement definitif de flow. needed=true seulement pour get_info_product/get_info_db/inline_product/inline_status. skill_id=product_help pour question produit; status_recap pour objets existants/DB. context_for_subskill doit contenir active_flow='prepare_attack_card', question_to_answer, active_flow_context compact (target_state, blocker_state, technique_state, current_field_id, flow_kind) et preserve_active_flow=true. Laisser needed=false, skill_id=null et context_for_subskill={} sinon. Influence: le router appelle l'inline tool puis revient au parent flow.",
    "- exit_memo: memo compact pour quitter ce flow. needed=true si exit_to_global_dispatcher, cancel_flow/defer_flow avec contexte utile, ou safety_preempt. reason=topic_change pour nouveau sujet clair; cancelled pour abandon; safety pour safety; none sinon. flow_summary resume l'etat acquis; handoff_hint_for_global_dispatcher explique quoi reanalyser si global reprend. Ne l'utilise pas comme message visible.",
    "- note_information: obligatoire pour tout changement de dispatcher: premiere activation entrante est dans l'input, sortie vers global, safety_crisis, product/status inline si bridge, ou handoff_to_local_flow. Structure canonique: source_flow_id='prepare_attack_card', target_dispatcher, handoff_reason, handoff_context_for_next_dispatcher, user_words, structured_context non vide, confidence si utile. Mets user_message_summary, active_flow_summary, collected_state, unresolved_questions, evidence et recommended_next_focus dans structured_context. Ne mets jamais source_flow_presentation, source_flow_state_summary, target_local_dispatcher_hint, risk_score ou no_chat_mutation dans la note. Elle est consommee par le dispatcher cible et jamais transmise brute au prompt visible. Laisser null si le flow continue localement sans inline ni transition.",
    "- no_chat_mutation: garde-fou fixe. Toujours attack_card_created=false, chat_side_effect_committed=false, platform_write_committed=false, db_write_committed=false. Si le user demande creation, garde ces champs false et flow_action=apply_attempt.",
    "- risk_assessment: risk_score 0-10 utile au flow; risk_band none/low/medium/high/critical; safety_preempt=true seulement pour safety reelle. Ne fabrique pas de safety. Si safety reelle: flow_action=safety_preempt, visible_task.kind=safety_transition, note_information.target_dispatcher=safety_crisis, reason_codes courts.",
    "- evidence: indices semantiques vraiment utilises pour la decision. Cite de courts fragments ou resumes observables du message/contexte. Pas de pseudo-preuves, pas d'explication inventee.",
    "",
    "Transition Rules:",
    "- exit_to_global_dispatcher: user arrete ou reporte la carte, ou apporte un nouveau sujet clair. visible_task.kind=stop_or_cancel ou exit_ack, note_information obligatoire vers global, pas d'outil.",
    "- exit_to_global_dispatcher: nouveau sujet clair. visible_task.kind=exit_ack ou none selon router, note_information obligatoire target_dispatcher=global, exit_memo.reason=topic_change.",
    "- safety_preempt: safety prioritaire. note_information obligatoire target_dispatcher=safety_crisis, visible_task.kind=safety_transition, pas de global normal.",
    "- handoff_to_local_flow: seulement si le contrat cible est clair (prepare_defense_card, select_state_potion, product_help, status_recap ou other_local). note_information obligatoire; ne l'invente pas pour une simple question dans le flow.",
    "- get_info_product/get_info_db: inline roundtrip; subskill_call obligatoire; preserve active flow.",
    "",
    "Example JSON 1 - continuation normale:",
    '{"flow_action":"confirm_proposed_field","confidence":"high","stage":"platform_field_intake","flow_kind":"free_attack_card","target_state":{"status":"locked","kind":"personal_action","plan_item_id":null,"candidate_value":null,"locked_value":"footing du soir","needs_user_confirmation":false,"why_status":"user confirmed"},"blocker_state":{"status":"locked","blocker_type":"procrastination","candidate_value":null,"locked_value":"ce sera plus sérieux demain","needs_user_confirmation":false,"why_status":"user confirmed"},"technique_state":{"status":"locked","technique_key":"texte_recadrage","technique_label":"Le texte magique","explicitly_requested":false,"candidate_options":[],"fit_warning":null,"needs_user_confirmation":false,"why_status":"proposal confirmed"},"platform_field_states":[{"field_id":"negotiated_action","technique_key":"texte_recadrage","field_label":"Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ?","status":"locked","candidate_value":"footing du soir","locked_value":"footing du soir","previous_value":null,"needs_user_confirmation":false,"why_status":"confirmed"},{"field_id":"recurring_excuse","technique_key":"texte_recadrage","field_label":"Quelles excuses ou pensees reviennent quand tu sens que tu glisses ?","status":"proposed","candidate_value":"ce sera plus sérieux demain","locked_value":null,"previous_value":null,"needs_user_confirmation":true,"why_status":"from user words"}],"activation_keyword_state":{"status":"not_applicable","candidate_value":null,"locked_value":null,"needs_user_confirmation":false,"why_status":"not pre_engagement"},"revision":{"is_revision":false,"revision_target":null,"field_id":null,"replacement_value":null,"replaces_previous_value":false},"visible_task":{"kind":"confirm_platform_field_proposal","conversation_context":{"state_summary":"Cible et technique verrouillees; excuse a confirmer.","user_words":["ce sera plus sérieux demain"],"field_or_stage":"recurring_excuse","known_values":{},"missing_or_weak_values":["recurring_excuse"],"selected_candidate":{"field_id":"recurring_excuse","candidate_value":"ce sera plus sérieux demain"},"handoff_data":{"operation_name":"prepare_attack_card","surface_label":"Cartes d\'attaque","platform_destination":"dans la section Cartes d\'attaque","platform_steps":[],"flow_kind":"free_attack_card","technique_label":"Le texte magique","target_value":"footing du soir","blocker_value":"ce sera plus sérieux demain","locked_fields":[],"missing_fields":["recurring_excuse","desired_reframe_state"],"activation_keyword":null,"no_chat_mutation":true},"tone_constraints":[],"do_not_say":["c\'est cree"],"context_summary":"Confirmer l\'excuse recurrente.","evidence_used":["ce sera plus sérieux demain"]}},"subskill_call":{"needed":false,"skill_id":null,"reason":null,"context_for_subskill":{}},"exit_memo":{"needed":false,"reason":"none","flow_summary":null,"handoff_hint_for_global_dispatcher":null},"note_information":null,"no_chat_mutation":{"attack_card_created":false,"chat_side_effect_committed":false,"platform_write_committed":false,"db_write_committed":false},"risk_assessment":{"risk_score":0,"risk_band":"none","safety_preempt":false,"reason_codes":[]},"evidence":["user confirms technique and excuse candidate"]}',
    "Example JSON 2 - transition critique exit global:",
    '{"flow_action":"exit_to_global_dispatcher","confidence":"high","stage":"exit","flow_kind":"free_attack_card","target_state":{"status":"locked","kind":"personal_action","plan_item_id":null,"candidate_value":null,"locked_value":"footing du soir","needs_user_confirmation":false,"why_status":"previously locked"},"blocker_state":{"status":"locked","blocker_type":"procrastination","candidate_value":null,"locked_value":"ce sera plus sérieux demain","needs_user_confirmation":false,"why_status":"previously locked"},"technique_state":{"status":"locked","technique_key":"texte_recadrage","technique_label":"Le texte magique","explicitly_requested":false,"candidate_options":[],"fit_warning":null,"needs_user_confirmation":false,"why_status":"previously locked"},"platform_field_states":[],"activation_keyword_state":{"status":"not_applicable","candidate_value":null,"locked_value":null,"needs_user_confirmation":false,"why_status":"not pre_engagement"},"revision":{"is_revision":false,"revision_target":null,"field_id":null,"replacement_value":null,"replaces_previous_value":false},"visible_task":{"kind":"exit_ack","conversation_context":{"state_summary":"User leaves attack card flow for evening prioritization.","user_words":["aide-moi plutôt à prioriser"],"field_or_stage":"exit","known_values":{},"missing_or_weak_values":[],"selected_candidate":{},"handoff_data":{"operation_name":"prepare_attack_card","surface_label":"Cartes d\'attaque","platform_destination":"dans la section Cartes d\'attaque","platform_steps":[],"flow_kind":"free_attack_card","technique_label":"Le texte magique","target_value":"footing du soir","blocker_value":"ce sera plus sérieux demain","locked_fields":[],"missing_fields":[],"activation_keyword":null,"no_chat_mutation":true},"tone_constraints":["acknowledge short"],"do_not_say":["c\'est cree"],"context_summary":"Stop card flow and let global reanalyse prioritization.","evidence_used":["laisse tomber la carte","prioriser ce que je fais ce soir"]}},"subskill_call":{"needed":false,"skill_id":null,"reason":null,"context_for_subskill":{}},"exit_memo":{"needed":true,"reason":"topic_change","flow_summary":"Attack card partly prepared for footing du soir.","handoff_hint_for_global_dispatcher":"Reanalyse current user message as evening prioritization, not attack card."},"note_information":{"needed":true,"source_flow_id":"prepare_attack_card","target_dispatcher":"global","handoff_reason":"topic_change","handoff_context_for_next_dispatcher":"User stops card flow and asks to prioritize tonight.","user_words":["laisse tomber la carte","prioriser"],"structured_context":{"user_message_summary":"User stops card flow and asks to prioritize tonight.","active_flow_summary":"Attack card flow was active for footing du soir.","collected_state":{"target":"footing du soir","technique":"texte_recadrage"},"unresolved_questions":[],"evidence":["laisse tomber la carte","prioriser"],"recommended_next_focus":"prioritization"},"confidence":"high"},"no_chat_mutation":{"attack_card_created":false,"chat_side_effect_committed":false,"platform_write_committed":false,"db_write_committed":false},"risk_assessment":{"risk_score":0,"risk_band":"none","safety_preempt":false,"reason_codes":[]},"evidence":["clear topic change from card to prioritization"]}',
    "",
    "Stage coherence:",
    "target non locked -> ask_target ou confirm_target_candidate; target locked + blocker non locked -> ask_blocker; target+blocker locked + technique non locked -> ask_or_confirm_technique; target+blocker+technique locked + champ courant manquant/proposed -> ask_platform_field ou confirm_platform_field_proposal; n'utilise jamais ask_target quand target et blocker sont deja locked.",
    "Si tous les champs requis sont locked, retourne visible_task.kind=handoff_ready.",
    "Si une valeur est plausible mais non donnee explicitement, mets status=proposed et needs_user_confirmation=true.",
    "Si le user demande de creer/lancer/ajouter depuis le chat, retourne apply_attempt.",
    "Si le user pose une question produit pendant ce flow (c'est quoi, comment ça marche, où est-ce, différence entre cartes/techniques), retourne flow_action=get_info_product, visible_task.kind=none, subskill_call.skill_id=product_help.",
    "Si le user pose une question sur ses objets existants ou l'état DB pendant ce flow (cartes d'attaque actives, cartes libres déjà créées, ce qui existe déjà), retourne flow_action=get_info_db, visible_task.kind=none, subskill_call.skill_id=status_recap.",
    ...directEffectLocalDispatcherPromptLines(),
    "Pour get_info_product/get_info_db, remplis subskill_call.context_for_subskill avec active_flow='prepare_attack_card', question_to_answer reformulée, active_flow_context utile (target_state, blocker_state, technique_state, current_field_id, flow_kind), preserve_active_flow=true.",
    "Techniques exactes: texte_recadrage / Le texte magique; mantra_force / Mantra de force; ancre_visuelle / Ancre visuelle; visualisation_matinale / Meditation de 5 minutes; preparer_terrain / Preparer le terrain; pre_engagement / Mot de bascule.",
    "Champs: texte_recadrage = negotiated_action, recurring_excuse, desired_reframe_state; mantra_force = effort_target, importance_reason, mantra_tone; ancre_visuelle = commitment_to_keep_alive, anchor_location, visual_phrase; visualisation_matinale = visualized_action, morning_window, helpful_sensations; preparer_terrain = action_to_simplify, prep_in_advance, ready_environment; pre_engagement = risk_situation, protected_value. activation_keyword est optionnel et seulement pour pre_engagement si le user le donne, le demande ou le valide.",
    "Retourne uniquement le JSON strict conforme au schema fourni.",
  ].join("\n");
}

export async function runPrepareAttackCardLocalDispatcher(
  input: PrepareAttackCardLocalDispatcherInput,
): Promise<PrepareAttackCardLocalDispatcherOutput | null> {
  const userPrompt = JSON.stringify({
    task: "prepare_attack_card_local_dispatcher",
    current_user_message: input.user_message,
    recent_messages: input.recent_messages,
    active_attack_card_state: input.active_state,
    local_state: input.local_state,
    note_information_inbound: input.note_information_inbound ?? null,
    db_context_pack: input.db_context_pack ?? null,
    micro_memory_context: input.micro_memory_context ?? null,
    platform_context: withDirectEffectLocalContext(
      input.platform_context ?? null,
      input.plan_snapshot ?? null,
    ),
    parent_flow_context: input.parent_flow_context ?? null,
    risk_context: input.risk_context ?? null,
    available_inline_tools: input.available_inline_tools ?? [
      "product_help",
      "status_recap",
    ],
    route_decision_context_only: input.route_decision,
    turn_frame_context_only: input.turn_frame,
    plan_snapshot: input.plan_snapshot ?? null,
    last_handoff: input.last_handoff ?? null,
    platform_destination: PLATFORM_DESTINATION,
    technique_labels: ATTACK_CARD_TECHNIQUE_LABELS,
    platform_fields_by_technique: ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS,
    required_json_shape: {
      flow_action:
        "continue_local|missing_info|confirm_candidate|answer_current_field|confirm_proposed_field|choose_technique|confirm_technique_proposal|revise_current_field|revise_technique|revise_target|revise|get_info_product|get_info_db|inline_product|inline_status|handoff_ready|repeat_handoff|platform_destination_followup|destination_followup|apply_attempt|exit_to_global_dispatcher|cancel_flow|defer_flow|handoff_to_local_flow|safety_preempt",
      confidence: "low|medium|high",
      stage:
        "target_intake|blocker_intake|technique_selection|platform_field_intake|handoff_ready|handoff_delivered|exit",
      flow_kind:
        "free_attack_card|plan_action_cards|adjust_existing_attack_card|null",
      target_state: "object",
      blocker_state: "object",
      technique_state: "object",
      platform_field_states: "array",
      activation_keyword_state: "object",
      revision: "object",
      visible_task: {
        kind:
          "ask_target|confirm_target_candidate|ask_blocker|ask_or_confirm_technique|ask_platform_field|confirm_platform_field_proposal|handoff_ready|revision_done|destination_short|apply_attempt|repeat_handoff|inline_tool_return|stop_or_cancel|exit_ack|exit_or_cancel|safety|safety_transition|none",
        conversation_context:
          "object filtered for visible prompt only; no raw DB pack or raw memory",
      },
      note_information: {
        needed: "boolean",
        source_flow_id: "prepare_attack_card",
        target_dispatcher:
          "global|safety_crisis|product_help|status_recap|prepare_defense_card|select_state_potion|other_local|null",
        handoff_reason:
          "topic_change|safety|inline_tool|bridge|flow_interruption|explicit_user_request|null",
        handoff_context_for_next_dispatcher: "string|null",
        user_words: "array",
        structured_context: "object",
        confidence: "low|medium|high|null",
      },
      subskill_call: {
        needed: "boolean",
        skill_id: "product_help|status_recap|null",
        reason: "string|null",
        context_for_subskill: "object",
      },
      exit_memo: "object",
      no_chat_mutation: "object",
      risk_assessment: "object",
      evidence: "array",
    },
  });
  try {
    const raw = await generateWithGemini(
      dispatcherSystemPrompt(),
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "prepare_attack_card.local_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalizePrepareAttackCardLocalDispatcherOutput(raw);
  } catch (error) {
    console.warn("[PrepareAttackCard] local dispatcher failed", error);
    return null;
  }
}
