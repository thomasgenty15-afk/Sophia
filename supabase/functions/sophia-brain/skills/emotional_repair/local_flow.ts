import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import { createNoteInformation } from "../../contracts/note_information.v1.ts";
import {
  type EmotionalRepairBridgePotion,
  type EmotionalRepairConfidence,
  type EmotionalRepairConstraint,
  type EmotionalRepairContextDomain,
  type EmotionalRepairConversationContext,
  type EmotionalRepairDominance,
  type EmotionalRepairDurableNeedKind,
  type EmotionalRepairIntent,
  type EmotionalRepairLocalDispatcherOutput,
  type EmotionalRepairLocalFlowAction,
  type EmotionalRepairLocalState,
  type EmotionalRepairPhase,
  type EmotionalRepairPotionBridgeContext,
  type EmotionalRepairPotionLabel,
  type EmotionalRepairResponseTone,
  type EmotionalRepairVisibleTask,
  type EmotionalRepairVisibleTaskKind,
  normalizeEmotionalRepairConstraints,
} from "./contract.ts";
import {
  directEffectLocalDispatcherPromptLines,
  withDirectEffectLocalContext,
} from "../../router/direct_effect_local_context.ts";

export type EmotionalRepairLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  current_user_message?: string;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: EmotionalRepairLocalState | null;
  note_information_inbound?: Record<string, unknown> | null;
  db_context_pack?: Record<string, unknown> | null;
  micro_memory_context?: Record<string, unknown> | null;
  platform_context?: Record<string, unknown> | null;
  risk_context?: Record<string, unknown> | null;
  available_inline_tools?: string[];
  parent_flow_context?: Record<string, unknown> | null;
  timezone?: string | null;
  channel?: string | null;
  previous_repair_summary: string | null;
  previous_potion_bridge_offer:
    | EmotionalRepairLocalState["last_potion_bridge_offer"]
    | null;
  turn_frame: TurnFrame | null;
  explicit_constraints: string[];
};

export type EmotionalRepairLocalDispatcher = (
  input: EmotionalRepairLocalDispatcherInput,
) => Promise<EmotionalRepairLocalDispatcherOutput | null>;

export type EmotionalRepairReducerResult = {
  status: "continue" | "complete" | "exit" | "handoff" | "safety";
  response_intent: string;
  local_state: EmotionalRepairLocalState | null;
  visible_task: EmotionalRepairVisibleTask;
  potion_bridge_context: EmotionalRepairPotionBridgeContext | null;
  exit_to_global_dispatcher: boolean;
  reason_code: string;
  constraints: EmotionalRepairConstraint[];
  blocked_effects: Array<{ type: string; reason_code: string }>;
  evidence: string[];
};

const FLOW_ACTIONS: readonly EmotionalRepairLocalFlowAction[] = [
  "answer_repair",
  "ask_gentle_clarification",
  "repair_relationship",
  "provide_concrete_phrase",
  "soft_presence",
  "regulation_without_potion",
  "potion_bridge_offer",
  "confirm_potion_bridge",
  "revise_repair_context",
  "repeat_last_repair",
  "exit_to_global_dispatcher",
  "cancel_flow",
  "complete_flow",
  "defer_flow",
  "exit_to_global_dispatcher",
  "safety_preempt",
];

const INTENTS: readonly EmotionalRepairIntent[] = [
  "acute_self_attack",
  "shame_or_guilt",
  "anxiety_or_panic",
  "relational_repair",
  "emotion_lowered_action_blocked",
  "asks_concrete_phrase",
  "asks_regulation_without_potion",
  "asks_recurring_support",
  "status_or_meta_question",
  "action_card_ready",
  "unclear",
];

const PHASES: readonly EmotionalRepairPhase[] = [
  "stabilize",
  "de_shame",
  "separate_fact_from_identity",
  "repair_relationship",
  "action_card_ready",
  "exit",
];

const DOMINANCE: readonly EmotionalRepairDominance[] = [
  "high",
  "medium",
  "low",
];

const DOMAINS: readonly EmotionalRepairContextDomain[] = [
  "relationship",
  "work",
  "body",
  "plan_execution",
  "unknown",
];

const TONES: readonly EmotionalRepairResponseTone[] = [
  "soft",
  "grounded",
  "direct_soft",
];

const BRIDGE_POTIONS: readonly EmotionalRepairBridgePotion[] = [
  "amour",
  "guerison",
  "apaisement",
];

const NEEDS: readonly EmotionalRepairDurableNeedKind[] = [
  "self_kindness",
  "healing_after_hurt",
  "pressure_relief",
];

const VISIBLE_TASKS: readonly EmotionalRepairVisibleTaskKind[] = [
  "soft_presence",
  "de_shame",
  "separate_fact_from_identity",
  "repair_relationship",
  "concrete_phrase",
  "stabilize_anxiety",
  "potion_bridge_offer",
  "potion_bridge_choice",
  "potion_bridge_handoff",
  "ask_gentle_clarification",
  "repeat_repair",
  "exit_or_cancel",
  "safety",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 8)
    : [];
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
      (allowed as readonly string[]).includes(value)
    ? value as T
    : fallback;
}

function confidence(value: unknown): EmotionalRepairConfidence {
  return enumValue(value, ["low", "medium", "high"] as const, "medium");
}

function bridgePotion(value: unknown): EmotionalRepairBridgePotion | null {
  return typeof value === "string" &&
      (BRIDGE_POTIONS as readonly string[]).includes(value)
    ? value as EmotionalRepairBridgePotion
    : null;
}

function potionLabel(value: EmotionalRepairBridgePotion | null) {
  switch (value) {
    case "amour":
      return "Potion d'amour" as const;
    case "guerison":
      return "Potion de guerison" as const;
    case "apaisement":
      return "Potion d'apaisement" as const;
    default:
      return null;
  }
}

function normalizedPotionLabel(
  value: unknown,
): EmotionalRepairPotionLabel | null {
  const text = String(value ?? "").trim();
  return text === "Potion d'amour" || text === "Potion de guerison" ||
      text === "Potion d'apaisement"
    ? text
    : null;
}

function normalizeRepairState(
  raw: unknown,
): EmotionalRepairLocalState["repair_state"] {
  const root = isRecord(raw) ? raw : {};
  return {
    intent: enumValue(root.intent, INTENTS, "unclear"),
    phase: enumValue(root.phase, PHASES, "de_shame"),
    emotional_dominance: enumValue(
      root.emotional_dominance,
      DOMINANCE,
      "medium",
    ),
    context_domain: enumValue(root.context_domain, DOMAINS, "unknown"),
    summary: stringValue(root.summary) ?? "Réparation émotionnelle en cours.",
    user_words: stringArray(root.user_words),
    identity_freeze_risk: root.identity_freeze_risk === true,
    emotion_stabilized_enough_for_tool:
      root.emotion_stabilized_enough_for_tool === true,
  };
}

function normalizeVisibleTask(
  raw: unknown,
  selectedPotion: EmotionalRepairBridgePotion | null,
  repairSummary: string,
  userWords: string[],
): EmotionalRepairVisibleTask {
  const root = isRecord(raw) ? raw : {};
  const context = isRecord(root.conversation_context)
    ? root.conversation_context
    : {};
  const kind = enumValue(root.kind, VISIBLE_TASKS, "soft_presence");
  return {
    kind,
    conversation_context: normalizeConversationContext({
      raw: context,
      kind,
      repairSummary,
      userWords,
      selectedPotion,
      potionLabel: potionLabel(selectedPotion),
      bridgeContextSummary: null,
    }),
  };
}

function nullableEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" &&
      (allowed as readonly string[]).includes(value)
    ? value as T
    : null;
}

function normalizeConversationContext(args: {
  raw: Record<string, unknown>;
  kind: EmotionalRepairVisibleTaskKind;
  repairSummary: string;
  userWords: string[];
  selectedPotion: EmotionalRepairBridgePotion | null;
  potionLabel: EmotionalRepairPotionLabel | null;
  bridgeContextSummary: string | null;
}): EmotionalRepairConversationContext {
  const known = isRecord(args.raw.known_values) ? args.raw.known_values : {};
  const selected = isRecord(args.raw.selected_candidate)
    ? args.raw.selected_candidate
    : {};
  const handoff = isRecord(args.raw.handoff_data) ? args.raw.handoff_data : {};
  const targetDispatcher = String(handoff.target_dispatcher ?? "").trim();
  return {
    state_summary: stringValue(args.raw.state_summary) ?? args.repairSummary,
    user_words: stringArray(args.raw.user_words).length
      ? stringArray(args.raw.user_words)
      : args.userWords,
    field_or_stage: enumValue(
      args.raw.field_or_stage,
      [...PHASES, ...VISIBLE_TASKS] as const,
      args.kind,
    ) as EmotionalRepairConversationContext["field_or_stage"],
    known_values: {
      intent: enumValue(known.intent, INTENTS, "unclear"),
      phase: enumValue(known.phase, PHASES, "de_shame"),
      emotional_dominance: enumValue(
        known.emotional_dominance,
        DOMINANCE,
        "medium",
      ),
      context_domain: enumValue(known.context_domain, DOMAINS, "unknown"),
      identity_freeze_risk: known.identity_freeze_risk === true,
      emotion_stabilized_enough_for_tool:
        known.emotion_stabilized_enough_for_tool === true,
    },
    missing_or_weak_values: stringArray(args.raw.missing_or_weak_values),
    selected_candidate: {
      potion: bridgePotion(selected.potion) ?? args.selectedPotion,
      potion_label: normalizedPotionLabel(selected.potion_label) ??
        args.potionLabel,
      durable_need_kind: nullableEnumValue(selected.durable_need_kind, NEEDS),
      durable_need_summary: stringValue(selected.durable_need_summary),
    },
    handoff_data: {
      bridge_context_summary: stringValue(handoff.bridge_context_summary) ??
        args.bridgeContextSummary,
      target_dispatcher: targetDispatcher === "select_state_potion" ||
          targetDispatcher === "safety_crisis" ||
          targetDispatcher === "global"
        ? targetDispatcher
        : null,
    },
    tone_constraints: stringArray(args.raw.tone_constraints),
    do_not_say: stringArray(args.raw.do_not_say),
    context_summary: stringValue(args.raw.context_summary),
    evidence_used: stringArray(args.raw.evidence_used),
    max_questions: args.raw.max_questions === 1 ? 1 : 0,
  };
}

function normalizePrefillCandidates(
  raw: unknown,
): EmotionalRepairLocalDispatcherOutput["potion_bridge"]["prefill_candidates"] {
  const root = isRecord(raw) ? raw : {};
  return {
    love_lack_context: stringValue(root.love_lack_context),
    love_state: nullableEnumValue(
      root.love_state,
      ["dur", "seul", "vide"] as const,
    ),
    recent_hurt: stringValue(root.recent_hurt),
    dominant_feeling: nullableEnumValue(
      root.dominant_feeling,
      ["culpabilite", "honte", "decouragement", "fatigue"] as const,
    ),
    pressure_source: stringValue(root.pressure_source),
    pressure_state: nullableEnumValue(
      root.pressure_state,
      ["stresse", "a_cran", "submerge"] as const,
    ),
  };
}

export function normalizeEmotionalRepairLocalDispatcherOutput(
  raw: unknown,
): EmotionalRepairLocalDispatcherOutput | null {
  const root = isRecord(raw) ? raw : null;
  if (!root) return null;
  const repairState = normalizeRepairState(root.repair_state);
  const bridge = isRecord(root.potion_bridge) ? root.potion_bridge : {};
  const selectedPotion = bridgePotion(bridge.selected_potion);
  const durable = isRecord(bridge.durable_need) ? bridge.durable_need : {};
  const visibleTask = normalizeVisibleTask(
    root.visible_task,
    selectedPotion,
    repairState.summary,
    repairState.user_words,
  );
  const responseContract = isRecord(root.response_contract)
    ? root.response_contract
    : {};
  const exitMemo = isRecord(root.exit_memo) ? root.exit_memo : {};
  return {
    flow_action: enumValue(root.flow_action, FLOW_ACTIONS, "answer_repair"),
    confidence: confidence(root.confidence),
    risk_score: Math.max(0, Math.min(10, Number(root.risk_score ?? 0) || 0)),
    repair_state: repairState,
    constraints: normalizeEmotionalRepairConstraints(root.constraints),
    response_contract: {
      max_questions: responseContract.max_questions === 1 ? 1 : 0,
      allow_plan: responseContract.allow_plan === true,
      allow_tool_suggestion: responseContract.allow_tool_suggestion === true,
      allow_potion_suggestion:
        responseContract.allow_potion_suggestion === true,
      allow_concrete_action: responseContract.allow_concrete_action === true,
      tone: enumValue(responseContract.tone, TONES, "soft"),
    },
    potion_bridge: {
      status: enumValue(
        bridge.status,
        [
          "not_applicable",
          "candidate",
          "offered_waiting_consent",
          "confirmed_handoff",
          "blocked",
        ] as const,
        "not_applicable",
      ),
      selected_potion: selectedPotion,
      candidate_potions: Array.isArray(bridge.candidate_potions)
        ? bridge.candidate_potions.flatMap((item) => {
          if (!isRecord(item)) return [];
          const potion = bridgePotion(item.potion_type);
          if (!potion) return [];
          return [{
            potion_type: potion,
            confidence: confidence(item.confidence),
            reason: stringValue(item.reason) ?? "Candidat bridge potion.",
          }];
        }).slice(0, 2)
        : [],
      durable_need: {
        kind: nullableEnumValue(durable.kind, NEEDS),
        summary: stringValue(durable.summary),
      },
      prefill_candidates: normalizePrefillCandidates(
        bridge.prefill_candidates,
      ),
      missing_before_handoff: stringArray(bridge.missing_before_handoff),
      why_ready_or_blocked: stringValue(bridge.why_ready_or_blocked) ??
        "Non précisé.",
    },
    visible_task: visibleTask,
    exit_memo: {
      needed: exitMemo.needed === true,
      reason: enumValue(
        exitMemo.reason,
        [
          "topic_change",
          "explicit_tool_request",
          "cancelled",
          "safety",
          "potion_handoff",
          "none",
        ] as const,
        "none",
      ),
      flow_summary: stringValue(exitMemo.flow_summary),
      handoff_hint_for_global_dispatcher: stringValue(
        exitMemo.handoff_hint_for_global_dispatcher,
      ),
      potion_bridge_context: isRecord(exitMemo.potion_bridge_context)
        ? exitMemo.potion_bridge_context
        : null,
    },
    evidence: stringArray(root.evidence),
  };
}

function parseJsonObject(raw: unknown): unknown {
  if (raw && typeof raw === "object") return raw;
  const text = String(raw ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("emotional_repair_local_dispatcher_missing_json");
  }
  return JSON.parse(text.slice(start, end + 1));
}

export const EMOTIONAL_REPAIR_DISPATCHER_FIELD_COMPLETION_RULES = {
  flow_action: [
    "Choisis l'action qui sert le message courant, pas seulement l'etat precedent.",
    "Ne continue pas emotional_repair si le user demande clairement d'arreter ou change de sujet.",
    "Utilise provide_concrete_phrase quand le user demande une phrase, une formulation courte ou une aide verbale precise.",
    "Utilise exit_to_global_dispatcher quand le user veut arreter emotional_repair ou apporte un nouveau sujet clair hors emotional_repair.",
    "Utilise cancel_flow/defer_flow/complete_flow seulement pour une issue metier locale deja prevue par le flow.",
    "Utilise safety_preempt si le message courant contient un signal safety prioritaire.",
    "N'invente pas handoff_to_local_flow: ce contrat utilise confirm_potion_bridge pour le bridge select_state_potion.",
  ],
  confidence: [
    "high: intention claire et stable.",
    "medium: intention probable mais partiellement ambigue.",
    "low: clarification ou prudence necessaire.",
  ],
  risk_score: [
    "Score 0..10 raccord avec le risque emotionnel/safety du tour.",
    "Ne pas inventer de risque safety sans signal explicite.",
    "Un vrai signal safety doit produire safety_preempt.",
  ],
  repair_state: [
    "Resume seulement ce qui est utile au flow local.",
    "Ne transforme pas une hypothese en fait.",
    "Ne stocke pas de profil emotionnel global.",
    "user_words contient les mots utiles du user courant, pas un dump de conversation.",
  ],
  constraints: [
    "Reprends les contraintes explicites du user: no_plan, no_technique, no_questions, short_reply, no_tool, no_potion.",
    "Les contraintes doivent se retrouver dans response_contract et visible_task.conversation_context.",
    "Une contrainte explicite du tour courant gagne sur l'etat precedent.",
  ],
  response_contract: [
    "Decrit les limites de la reponse visible.",
    "max_questions=0 si le user demande presence, stop, phrase courte ou pas de question.",
    "allow_plan/tool/potion/action reste false tant que l'emotion domine ou que le user refuse technique/outil/plan.",
  ],
  potion_bridge: [
    "status=not_applicable tant que le besoin durable n'est pas stabilise.",
    "status=candidate est interne: ne demande pas consentement visible.",
    "status=offered_waiting_consent seulement si l'emotion est assez redescendue et que le user est ouvert.",
    "status=confirmed_handoff seulement si le user confirme une offre deja faite.",
    "Ne propose jamais de potion quand honte, culpabilite, panique ou auto-attaque dominent encore.",
  ],
  visible_task: [
    "kind doit pointer vers le prompt visible stage-specific exact.",
    "Pour stop/cancel/defer/complete/exit, utilise exit_or_cancel.",
    "Pour demande de phrase, utilise concrete_phrase.",
    "conversation_context est le seul contexte donne au visible agent.",
    "conversation_context doit contenir contraintes, valeurs connues, incertitudes, ton, limites et evidence utile.",
    "Ne mets pas de DB brute, memoire brute ou note_information brute dans conversation_context.",
  ],
  exit_memo: [
    "needed=true pour exit_to_global_dispatcher.",
    "needed=false pour cancel_flow, complete_flow ou defer_flow sans changement de dispatcher.",
    "reason=cancelled si le user veut arreter ce flow; reason=topic_change si le user apporte un autre sujet clair.",
    "handoff_hint_for_global_dispatcher doit resumer le nouveau besoin et le contexte utile.",
    "Le downstream creera la note_information depuis exit_memo; remplis donc exit_memo avec soin.",
    "Si tu fournis une note_information de bridge/safety, garde strictement la structure source_flow_id, target_dispatcher, handoff_reason, handoff_context_for_next_dispatcher, user_words, structured_context, confidence si utile. user_words contient 1 a 3 fragments du message courant. structured_context est succinct, non vide, sans DB brute, memoire brute, diagnostic, source_flow_presentation, source_flow_state_summary, target_local_dispatcher_hint ni risk_score.",
  ],
  effects: [
    "Le dispatcher ne cree rien, n'active rien, ne programme rien et ne confirme aucun write.",
  ],
  evidence: [
    "Cite les indices semantiques courts utilises.",
    "Pas de pseudo-preuves, pas de mots-cles rigides.",
  ],
} as const;

export const EMOTIONAL_REPAIR_DISPATCHER_FLOW_ACTION_RULES = {
  exit_to_global_dispatcher: [
    "Le user veut arreter ce sujet, ce flow ou les questions sans nouveau sujet clair.",
    "Le user change clairement de sujet ou demande une aide hors emotional_repair.",
    "Ne reponds pas au nouveau sujet dans emotional_repair.",
    "visible_task.kind=exit_or_cancel.",
    "exit_memo.needed=true avec reason=topic_change ou explicit_tool_request.",
    "handoff_hint_for_global_dispatcher doit permettre au dispatcher global de reanalyser le message courant.",
    "Pas de question finale ni coaching additionnel dans emotional_repair.",
  ],
  safety_preempt: [
    "Safety gagne sur toute continuation, potion, produit ou statut.",
    "visible_task.kind=safety.",
    "handoff_data.target_dispatcher=safety_crisis.",
    "Aucun outil normal, aucune mutation, aucune reprise global dispatcher normale.",
  ],
  confirm_potion_bridge: [
    "Seulement si le user consent a une offre potion deja faite et compatible.",
    "C'est le bridge local autorise vers select_state_potion.",
    "Ne l'utilise pas pour une simple emotion encore dominante.",
  ],
  continuation: [
    "Reste local si le user demande de continuer le soutien emotionnel ou donne une precision emotionnelle.",
    "Respecte les contraintes du tour courant: phrase courte, pas de technique, pas de plan, pas de question.",
    "Ne repete pas mecaniquement le dernier visible_task si le user demande un format ou un stage plus precis.",
  ],
} as const;

export const EMOTIONAL_REPAIR_DISPATCHER_DECISION_EXAMPLES = [
  {
    name: "continuation_with_concrete_phrase_constraint",
    current_user_message:
      "Reste avec moi, une seule phrase pour ne pas confondre ce moment avec mon identite.",
    expected_decision: {
      flow_action: "provide_concrete_phrase",
      constraints: ["short_reply", "no_questions", "no_plan", "no_technique"],
      response_contract: {
        max_questions: 0,
        allow_plan: false,
        allow_tool_suggestion: false,
        allow_potion_suggestion: false,
        allow_concrete_action: false,
        tone: "direct_soft",
      },
      visible_task: {
        kind: "concrete_phrase",
        conversation_context_must_include: [
          "phrase courte",
          "pas de question",
          "separer moment et identite",
        ],
      },
      exit_memo: { needed: false, reason: "none" },
    },
  },
  {
    name: "stop_without_new_topic",
    current_user_message:
      "Ok on s'arrete la, pas besoin de continuer ce sujet.",
    expected_decision: {
      flow_action: "exit_to_global_dispatcher",
      constraints: ["short_reply", "no_questions", "no_plan", "no_technique"],
      response_contract: {
        max_questions: 0,
        allow_plan: false,
        allow_tool_suggestion: false,
        allow_potion_suggestion: false,
        allow_concrete_action: false,
        tone: "soft",
      },
      visible_task: {
        kind: "exit_or_cancel",
        conversation_context_must_include: [
          "ack court",
          "pas de question finale",
          "pas de continuation emotionnelle",
        ],
      },
      exit_memo: { needed: false, reason: "cancelled" },
    },
  },
] as const;

export function localDispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local structure du flow emotional_repair.",
    "Tu n'es pas le dispatcher global et tu ne reponds jamais directement au user.",
    "Retourne uniquement un JSON strict conforme au contrat fourni.",
    "Tu dois appliquer les field_completion_rules, flow_action_rules et decision_examples du prompt utilisateur.",
    "Le message courant est prioritaire sur l'etat precedent.",
    "Le visible agent ne decide pas: tu dois remplir visible_task.conversation_context avec tout le contexte filtre utile.",
    "Safety preempt gagne sur tout.",
    "Tu peux seulement preparer un bridge vers amour, guerison ou apaisement.",
    "Ne propose pas de potion quand honte, culpabilite, panique ou auto-attaque dominent encore.",
    "Ne propose pas de potion si no_potion, no_tool, soft_support_only, no_protocol ou no_technique est present.",
    "potion_bridge.status=candidate signifie candidat interne seulement: ne demande pas consentement visible et n'utilise pas visible_task.kind=potion_bridge_offer.",
    "Utilise potion_bridge_offer seulement si status=offered_waiting_consent, selected_potion non-null, candidat exploitable, besoin durable clair, et l'emotion est deja stabilisee.",
    "Un bridge potion exige stabilisation et consentement; confirm_potion_bridge signifie que le user consent a une offre deja faite.",
    "Si le user confirme une offre precedente, utilise confirm_potion_bridge uniquement si previous_potion_bridge_offer existe et correspond.",
    "La note d'information pour le flow suivant doit contenir un resume succinct du flow quitte et le contexte utile au dispatcher potion.",
    ...directEffectLocalDispatcherPromptLines(),
    "Aucune session potion, aucun rappel, aucun scheduled_checkin, aucune confirmation executable, aucun write DB.",
  ].join("\n");
}

export const runEmotionalRepairLocalDispatcher: EmotionalRepairLocalDispatcher =
  async (input) => {
    const userPrompt = JSON.stringify({
      task: "dispatch_emotional_repair_local_flow",
      doctrine_summary: {
        local_dispatcher_is_brain: true,
        visible_agent_only_uses_conversation_context: true,
        current_message_over_previous_state: true,
        no_regex_or_keyword_routing: true,
        no_visible_reply_from_dispatcher: true,
      },
      field_completion_rules:
        EMOTIONAL_REPAIR_DISPATCHER_FIELD_COMPLETION_RULES,
      flow_action_rules: EMOTIONAL_REPAIR_DISPATCHER_FLOW_ACTION_RULES,
      decision_examples: EMOTIONAL_REPAIR_DISPATCHER_DECISION_EXAMPLES,
      required_json_shape: {
        flow_action:
          "answer_repair|ask_gentle_clarification|repair_relationship|provide_concrete_phrase|soft_presence|regulation_without_potion|potion_bridge_offer|confirm_potion_bridge|revise_repair_context|repeat_last_repair|exit_to_global_dispatcher|cancel_flow|complete_flow|defer_flow|safety_preempt",
        confidence: "low|medium|high",
        risk_score: "number 0..10",
        repair_state: {
          intent:
            "acute_self_attack|shame_or_guilt|anxiety_or_panic|relational_repair|emotion_lowered_action_blocked|asks_concrete_phrase|asks_regulation_without_potion|status_or_meta_question|unclear",
          phase:
            "stabilize|de_shame|separate_fact_from_identity|repair_relationship|action_card_ready|exit",
          emotional_dominance: "high|medium|low",
          context_domain: "relationship|work|body|plan_execution|unknown",
          summary: "string",
          user_words: ["string"],
          identity_freeze_risk: true,
          emotion_stabilized_enough_for_tool: false,
        },
        constraints: [
          "no_potion|no_tool|no_plan|no_protocol|no_technique|no_questions|one_question_max|concrete_before_question|soft_support_only|short_reply|relationship_context|do_not_persist_identity_attack",
        ],
        response_contract: {
          max_questions: "0|1",
          allow_plan: false,
          allow_tool_suggestion: false,
          allow_potion_suggestion: false,
          allow_concrete_action: false,
          tone: "soft|grounded|direct_soft",
        },
        potion_bridge: {
          status:
            "not_applicable|candidate|offered_waiting_consent|confirmed_handoff|blocked",
          selected_potion: "amour|guerison|apaisement|null",
          candidate_potions: [{
            potion_type: "amour|guerison|apaisement",
            confidence: "low|medium|high",
            reason: "string",
          }],
          durable_need: {
            kind: "self_kindness|healing_after_hurt|pressure_relief|null",
            summary: "string|null",
          },
          prefill_candidates: {
            love_lack_context: "string|null",
            love_state: "dur|seul|vide|null",
            recent_hurt: "string|null",
            dominant_feeling: "culpabilite|honte|decouragement|fatigue|null",
            pressure_source: "string|null",
            pressure_state: "stresse|a_cran|submerge|null",
          },
          missing_before_handoff: ["string"],
          why_ready_or_blocked: "string",
        },
        visible_task: {
          kind:
            "soft_presence|de_shame|separate_fact_from_identity|repair_relationship|concrete_phrase|stabilize_anxiety|potion_bridge_offer|potion_bridge_choice|potion_bridge_handoff|ask_gentle_clarification|repeat_repair|exit_or_cancel|safety",
          conversation_context: {
            state_summary: "string",
            user_words: ["string"],
            field_or_stage: "string|null",
            known_values: {
              intent:
                "acute_self_attack|shame_or_guilt|anxiety_or_panic|relational_repair|emotion_lowered_action_blocked|asks_concrete_phrase|asks_regulation_without_potion|status_or_meta_question|unclear",
              phase:
                "stabilize|de_shame|separate_fact_from_identity|repair_relationship|action_card_ready|exit",
              emotional_dominance: "high|medium|low",
              context_domain: "relationship|work|body|plan_execution|unknown",
              identity_freeze_risk: true,
              emotion_stabilized_enough_for_tool: false,
            },
            missing_or_weak_values: ["string"],
            selected_candidate: {
              potion: "amour|guerison|apaisement|null",
              potion_label:
                "Potion d'amour|Potion de guerison|Potion d'apaisement|null",
              durable_need_kind:
                "self_kindness|healing_after_hurt|pressure_relief|null",
              durable_need_summary: "string|null",
            },
            handoff_data: {
              bridge_context_summary: "string|null",
              target_dispatcher:
                "select_state_potion|safety_crisis|global|null",
            },
            tone_constraints: ["string"],
            do_not_say: ["string"],
            context_summary: "string|null",
            evidence_used: ["string"],
            max_questions: "0|1",
          },
        },
        exit_memo: {
          needed: false,
          reason:
            "topic_change|explicit_tool_request|cancelled|safety|potion_handoff|none",
          flow_summary: "string|null",
          handoff_hint_for_global_dispatcher: "string|null",
          potion_bridge_context: "object|null",
        },
        evidence: ["string"],
      },
      current_user_message: input.current_user_message ?? input.user_message,
      recent_messages: input.recent_messages,
      active_emotional_repair_state: input.active_state,
      note_information_inbound: input.note_information_inbound ?? null,
      db_context_pack: input.db_context_pack ?? {},
      micro_memory_context: input.micro_memory_context ?? {
        items: [],
        exclusions: ["not_loaded"],
        budget: { max_items: 4, reason: "not provided" },
      },
      platform_context: withDirectEffectLocalContext(
        input.platform_context ?? {},
        (input.turn_frame as any)?.plan_snapshot ??
          (input.platform_context as any)?.plan_snapshot ??
          null,
      ),
      risk_context: input.risk_context ?? {},
      available_inline_tools: input.available_inline_tools ?? [
        "product_help",
        "status_recap",
      ],
      parent_flow_context: input.parent_flow_context ?? null,
      timezone: input.timezone ?? null,
      channel: input.channel ?? null,
      previous_repair_summary: input.previous_repair_summary,
      previous_potion_bridge_offer: input.previous_potion_bridge_offer,
      turn_frame_safety: input.turn_frame?.safety ?? null,
      explicit_constraints: input.explicit_constraints,
      possible_potion_bridge_targets: {
        amour: ["love_lack_context", "love_state:dur|seul|vide"],
        guerison: [
          "recent_hurt",
          "dominant_feeling:culpabilite|honte|decouragement|fatigue",
        ],
        apaisement: [
          "pressure_source",
          "pressure_state:stresse|a_cran|submerge",
        ],
      },
    });
    try {
      const raw = await generateWithGemini(
        localDispatcherSystemPrompt(),
        userPrompt,
        0.1,
        true,
        [],
        "auto",
        {
          requestId: input.request_id ?? undefined,
          userId: input.user_id,
          model: getGlobalAiModel("gemini-2.5-flash"),
          source: "emotional_repair.local_dispatcher",
          forceRealAi: true,
          reasoningEffort: "low",
          httpTimeoutMs: 45_000,
          maxRetries: 1,
        },
      );
      return normalizeEmotionalRepairLocalDispatcherOutput(
        parseJsonObject(raw),
      );
    } catch (error) {
      console.warn("[EmotionalRepair] local dispatcher failed", { error });
      return null;
    }
  };

function constraintsWithInvariants(
  output: EmotionalRepairLocalDispatcherOutput,
  explicitConstraints: string[],
): EmotionalRepairConstraint[] {
  const constraints = new Set<EmotionalRepairConstraint>([
    ...output.constraints,
    ...normalizeEmotionalRepairConstraints(explicitConstraints),
  ]);
  if (constraints.has("soft_support_only")) {
    constraints.add("no_plan");
    constraints.add("no_protocol");
    constraints.add("no_technique");
    constraints.add("no_questions");
    constraints.add("no_tool");
    constraints.add("no_potion");
  }
  if (constraints.has("no_technique")) constraints.add("no_protocol");
  return [...constraints];
}

function bridgeBlocked(args: {
  output: EmotionalRepairLocalDispatcherOutput;
  constraints: EmotionalRepairConstraint[];
}): boolean {
  return args.constraints.some((constraint) =>
    constraint === "no_potion" ||
    constraint === "no_tool" ||
    constraint === "no_protocol" ||
    constraint === "no_technique" ||
    constraint === "soft_support_only"
  ) ||
    args.output.repair_state.emotional_dominance === "high" ||
    args.output.repair_state.emotion_stabilized_enough_for_tool !== true;
}

function isPersistablePotionOffer(args: {
  output: EmotionalRepairLocalDispatcherOutput;
  selectedPotion: EmotionalRepairBridgePotion | null;
  bridgeIsBlocked: boolean;
}): boolean {
  if (args.bridgeIsBlocked || !args.selectedPotion) return false;
  if (args.output.flow_action !== "potion_bridge_offer") return false;
  if (args.output.potion_bridge.status !== "offered_waiting_consent") {
    return false;
  }
  if (args.output.potion_bridge.selected_potion !== args.selectedPotion) {
    return false;
  }
  if (!args.output.potion_bridge.durable_need.kind) return false;
  return args.output.potion_bridge.candidate_potions.some((candidate) =>
    candidate.potion_type === args.selectedPotion &&
    candidate.confidence !== "low"
  );
}

function isConfirmablePotionBridge(args: {
  output: EmotionalRepairLocalDispatcherOutput;
  previous: EmotionalRepairLocalState | null;
  selectedPotion: EmotionalRepairBridgePotion | null;
  bridgeIsBlocked: boolean;
}): boolean {
  return args.output.flow_action === "confirm_potion_bridge" &&
    args.output.potion_bridge.status === "confirmed_handoff" &&
    Boolean(args.selectedPotion) &&
    !args.bridgeIsBlocked &&
    args.previous?.last_potion_bridge_offer?.selected_potion ===
      args.selectedPotion;
}

function fieldConfidence(
  action: "offer" | "handoff",
): EmotionalRepairConfidence {
  return action === "handoff" ? "high" : "medium";
}

function bridgeCandidateObject(args: {
  value?: string | null;
  optionValue?: string | null;
  optionLabel?: string | null;
  confidence: EmotionalRepairConfidence;
}) {
  return {
    candidate_value: args.value ?? null,
    option_value: args.optionValue ?? null,
    option_label: args.optionLabel ?? null,
    confidence: args.confidence,
    source: "emotional_repair" as const,
  };
}

function bridgePrefillsForContext(args: {
  selectedPotion: EmotionalRepairBridgePotion;
  prefill:
    EmotionalRepairLocalDispatcherOutput["potion_bridge"]["prefill_candidates"];
  confidence: EmotionalRepairConfidence;
}): EmotionalRepairPotionBridgeContext["prefill_candidates"] {
  const p = args.prefill;
  if (args.selectedPotion === "amour") {
    return {
      love_lack_context: bridgeCandidateObject({
        value: p.love_lack_context ?? null,
        confidence: args.confidence,
      }),
      love_state: bridgeCandidateObject({
        optionValue: p.love_state ?? null,
        optionLabel: p.love_state
          ? p.love_state === "dur"
            ? "Dur"
            : p.love_state === "seul"
            ? "Seul"
            : "Vide"
          : null,
        confidence: args.confidence,
      }),
    };
  }
  if (args.selectedPotion === "guerison") {
    return {
      recent_hurt: bridgeCandidateObject({
        value: p.recent_hurt ?? null,
        confidence: args.confidence,
      }),
      dominant_feeling: bridgeCandidateObject({
        optionValue: p.dominant_feeling ?? null,
        optionLabel: p.dominant_feeling
          ? p.dominant_feeling.charAt(0).toUpperCase() +
            p.dominant_feeling.slice(1)
          : null,
        confidence: args.confidence,
      }),
    };
  }
  return {
    pressure_source: bridgeCandidateObject({
      value: p.pressure_source ?? null,
      confidence: args.confidence,
    }),
    pressure_state: bridgeCandidateObject({
      optionValue: p.pressure_state ?? null,
      optionLabel: p.pressure_state
        ? p.pressure_state === "a_cran"
          ? "A cran"
          : p.pressure_state === "submerge"
          ? "Submerge"
          : "Stresse"
        : null,
      confidence: args.confidence,
    }),
  };
}

function needKindForPotion(
  potion: EmotionalRepairBridgePotion,
): EmotionalRepairDurableNeedKind {
  if (potion === "amour") return "self_kindness";
  if (potion === "guerison") return "healing_after_hurt";
  return "pressure_relief";
}

function informationNote(args: {
  output: EmotionalRepairLocalDispatcherOutput;
  selectedPotion: EmotionalRepairBridgePotion;
}) {
  const structuredContext = {
    origin_flow: "emotional_repair",
    selected_potion: args.selectedPotion,
    repair_intent: args.output.repair_state.intent,
    context_domain: args.output.repair_state.context_domain,
    user_words: args.output.repair_state.user_words,
    durable_need: args.output.potion_bridge.durable_need,
    prefill_candidates: args.output.potion_bridge.prefill_candidates,
    instruction:
      "Utiliser cette note comme contexte pour remplir le JSON du sous-flow potion, sans faire répéter l'épisode complet.",
  };
  return {
    note_information: createNoteInformation({
      source_flow_id: "emotional_repair",
      handoff_reason: "bridge",
      target_dispatcher: "select_state_potion",
      handoff_context_for_next_dispatcher: JSON.stringify(structuredContext),
      user_words: args.output.repair_state.user_words,
      structured_context: structuredContext,
    }),
    departed_flow_summary: args.output.repair_state.summary,
    context_for_next_dispatcher: structuredContext,
  };
}

function bridgeContext(args: {
  output: EmotionalRepairLocalDispatcherOutput;
  selectedPotion: EmotionalRepairBridgePotion;
  confidence: EmotionalRepairConfidence;
}): EmotionalRepairPotionBridgeContext {
  const needKind = args.output.potion_bridge.durable_need.kind ??
    needKindForPotion(args.selectedPotion);
  const bridgeNote = informationNote({
    output: args.output,
    selectedPotion: args.selectedPotion,
  });
  return {
    origin_flow: "emotional_repair",
    origin_flow_status: args.confidence === "high"
      ? "bridge_consented"
      : "stabilized",
    note_information: bridgeNote.note_information,
    information_note: {
      departed_flow_summary: bridgeNote.departed_flow_summary,
      context_for_next_dispatcher: bridgeNote.context_for_next_dispatcher,
    },
    origin_turn_summary: args.output.repair_state.summary,
    repair_intent: args.output.repair_state.intent,
    context_domain: args.output.repair_state.context_domain,
    emotional_episode: {
      summary: args.output.repair_state.summary,
      user_words: args.output.repair_state.user_words,
      identity_freeze_risk: args.output.repair_state.identity_freeze_risk,
      already_stabilized:
        args.output.repair_state.emotion_stabilized_enough_for_tool,
    },
    durable_need: {
      kind: needKind,
      summary: args.output.potion_bridge.durable_need.summary ??
        args.output.potion_bridge.why_ready_or_blocked,
    },
    selected_potion: args.selectedPotion,
    selection_reason: args.output.potion_bridge.why_ready_or_blocked,
    prefill_candidates: bridgePrefillsForContext({
      selectedPotion: args.selectedPotion,
      prefill: args.output.potion_bridge.prefill_candidates,
      confidence: args.confidence,
    }),
    handoff_instruction_for_potion_subskill:
      "Use these as candidates, not forced locked values. Ask only for missing or low-confidence details. Do not ask the user to repeat the full emotional episode.",
  };
}

function visibleKindForOutput(
  output: EmotionalRepairLocalDispatcherOutput,
  bridgeIsBlocked: boolean,
  offerIsPersistable = false,
  confirmIsValid = false,
): EmotionalRepairVisibleTaskKind {
  if (output.flow_action === "safety_preempt") return "safety";
  if (
    output.flow_action === "cancel_flow" ||
    output.flow_action === "exit_to_global_dispatcher" ||
    output.flow_action === "complete_flow" ||
    output.flow_action === "defer_flow"
  ) {
    return "exit_or_cancel";
  }
  if (output.flow_action === "repeat_last_repair") return "repeat_repair";
  if (output.flow_action === "ask_gentle_clarification") {
    return "ask_gentle_clarification";
  }
  if (output.flow_action === "confirm_potion_bridge" && confirmIsValid) {
    return "potion_bridge_handoff";
  }
  if (output.flow_action === "confirm_potion_bridge") {
    return output.repair_state.intent === "anxiety_or_panic"
      ? "stabilize_anxiety"
      : output.repair_state.intent === "acute_self_attack"
      ? "separate_fact_from_identity"
      : output.repair_state.intent === "shame_or_guilt"
      ? "de_shame"
      : "ask_gentle_clarification";
  }
  if (output.flow_action === "potion_bridge_offer" && offerIsPersistable) {
    return output.potion_bridge.candidate_potions.length > 1
      ? "potion_bridge_choice"
      : "potion_bridge_offer";
  }
  if (output.flow_action === "potion_bridge_offer") {
    return output.repair_state.intent === "anxiety_or_panic"
      ? "stabilize_anxiety"
      : output.repair_state.intent === "acute_self_attack"
      ? "separate_fact_from_identity"
      : output.repair_state.intent === "shame_or_guilt"
      ? "de_shame"
      : output.repair_state.phase === "repair_relationship"
      ? "repair_relationship"
      : "soft_presence";
  }
  if (output.flow_action === "repair_relationship") {
    return "repair_relationship";
  }
  if (output.flow_action === "provide_concrete_phrase") {
    return "concrete_phrase";
  }
  if (output.repair_state.intent === "anxiety_or_panic") {
    return "stabilize_anxiety";
  }
  if (output.repair_state.intent === "acute_self_attack") {
    return "separate_fact_from_identity";
  }
  if (output.repair_state.intent === "shame_or_guilt") return "de_shame";
  return output.visible_task.kind;
}

function conversationContextForVisibleTask(args: {
  output: EmotionalRepairLocalDispatcherOutput;
  visibleTaskKind: EmotionalRepairVisibleTaskKind;
  selectedPotion: EmotionalRepairBridgePotion | null;
  potionLabel: EmotionalRepairPotionLabel | null;
  bridgeContextSummary: string | null;
  constraints: EmotionalRepairConstraint[];
  evidence: string[];
}): EmotionalRepairConversationContext {
  const selectedPotion = args.selectedPotion;
  const durableNeed = args.output.potion_bridge.durable_need;
  const targetDispatcher = args.visibleTaskKind === "safety" ||
      args.output.flow_action === "safety_preempt"
    ? "safety_crisis"
    : args.output.flow_action === "confirm_potion_bridge" &&
        selectedPotion
    ? "select_state_potion"
    : args.output.flow_action === "exit_to_global_dispatcher"
    ? "global"
    : null;
  return {
    state_summary: args.output.repair_state.summary,
    user_words: args.output.repair_state.user_words,
    field_or_stage: args.visibleTaskKind,
    known_values: {
      intent: args.output.repair_state.intent,
      phase: args.output.repair_state.phase,
      emotional_dominance: args.output.repair_state.emotional_dominance,
      context_domain: args.output.repair_state.context_domain,
      identity_freeze_risk: args.output.repair_state.identity_freeze_risk,
      emotion_stabilized_enough_for_tool:
        args.output.repair_state.emotion_stabilized_enough_for_tool,
    },
    missing_or_weak_values: args.output.potion_bridge.missing_before_handoff,
    selected_candidate: {
      potion: selectedPotion,
      potion_label: args.potionLabel,
      durable_need_kind: durableNeed.kind,
      durable_need_summary: durableNeed.summary,
    },
    handoff_data: {
      bridge_context_summary: args.bridgeContextSummary,
      target_dispatcher: targetDispatcher,
    },
    tone_constraints: [
      args.output.response_contract.tone,
      ...args.constraints,
    ].slice(0, 12),
    do_not_say: [
      "Ne mentionne pas dispatcher, JSON, reducer, trace ou target_flow.",
      "Ne promets aucune creation, activation, session potion, rappel ou ecriture DB.",
      selectedPotion ? "" : "Ne propose pas de potion dans ce message.",
      args.constraints.includes("no_protocol")
        ? "Ne propose pas de protocole."
        : "",
      args.constraints.includes("no_technique")
        ? "Ne propose pas de technique ou exercice."
        : "",
      args.constraints.includes("no_potion") ? "Ne propose pas de potion." : "",
    ].filter(Boolean),
    context_summary: args.output.repair_state.summary,
    evidence_used: args.evidence,
    max_questions: args.output.response_contract.max_questions,
  };
}

export function readEmotionalRepairLocalState(
  activeState: unknown,
): EmotionalRepairLocalState | null {
  const root = isRecord(activeState) ? activeState : {};
  const working = isRecord(root.working_state) ? root.working_state : root;
  const state = working.emotional_repair_local_state;
  if (!isRecord(state) || state.skill_id !== "emotional_repair") return null;
  return state as EmotionalRepairLocalState;
}

export function reduceEmotionalRepairLocalDispatcherOutput(args: {
  previous: EmotionalRepairLocalState | null;
  output: EmotionalRepairLocalDispatcherOutput;
  explicit_constraints?: string[];
  turn_frame?: TurnFrame | null;
}): EmotionalRepairReducerResult {
  const safetyRisk = args.turn_frame?.safety?.risk_band ?? "none";
  const constraints = constraintsWithInvariants(
    args.output,
    args.explicit_constraints ?? [],
  );
  if (
    safetyRisk === "high" ||
    safetyRisk === "critical" ||
    args.output.flow_action === "safety_preempt"
  ) {
    const safetyVisibleTask: EmotionalRepairVisibleTask = {
      ...args.output.visible_task,
      kind: "safety",
      conversation_context: conversationContextForVisibleTask({
        output: args.output,
        visibleTaskKind: "safety",
        selectedPotion: null,
        potionLabel: null,
        bridgeContextSummary: null,
        constraints,
        evidence: args.output.evidence,
      }),
    };
    return {
      status: "safety",
      response_intent: "handoff_to_safety",
      local_state: null,
      visible_task: safetyVisibleTask,
      potion_bridge_context: null,
      exit_to_global_dispatcher: false,
      reason_code: "safety_preempt",
      constraints,
      blocked_effects: [{
        type: "emotional_repair",
        reason_code: "safety_preempt",
      }],
      evidence: args.output.evidence,
    };
  }
  const blocked = bridgeBlocked({ output: args.output, constraints });
  const selectedPotion = args.output.potion_bridge.selected_potion ??
    args.previous?.last_potion_bridge_offer?.selected_potion ??
    null;
  const offerIsPersistable = isPersistablePotionOffer({
    output: args.output,
    selectedPotion,
    bridgeIsBlocked: blocked,
  });
  const bridgeOfferNotPersistable =
    args.output.flow_action === "potion_bridge_offer" && !offerIsPersistable;
  const confirmIsValid = isConfirmablePotionBridge({
    output: args.output,
    previous: args.previous,
    selectedPotion,
    bridgeIsBlocked: blocked,
  });
  const visibleTaskKind = visibleKindForOutput(
    args.output,
    blocked,
    offerIsPersistable,
    confirmIsValid,
  );
  const bridgeShouldBeVisible = offerIsPersistable || confirmIsValid;
  const visibleTask: EmotionalRepairVisibleTask = {
    ...args.output.visible_task,
    kind: visibleTaskKind,
    conversation_context: conversationContextForVisibleTask({
      output: args.output,
      visibleTaskKind,
      selectedPotion: bridgeShouldBeVisible ? selectedPotion : null,
      potionLabel: bridgeShouldBeVisible ? potionLabel(selectedPotion) : null,
      bridgeContextSummary: bridgeShouldBeVisible
        ? args.output.visible_task.conversation_context.handoff_data
          .bridge_context_summary ??
          args.output.potion_bridge.why_ready_or_blocked
        : null,
      constraints,
      evidence: args.output.evidence,
    }),
  };
  const now = new Date().toISOString();
  const turnCount = Number(args.previous?.turn_count ?? 0) + 1;

  if (args.output.flow_action === "confirm_potion_bridge" && !confirmIsValid) {
    const fallbackVisibleTask: EmotionalRepairVisibleTask = {
      ...visibleTask,
      kind: visibleTaskKind,
      conversation_context: conversationContextForVisibleTask({
        output: args.output,
        visibleTaskKind,
        selectedPotion: null,
        potionLabel: null,
        bridgeContextSummary: null,
        constraints,
        evidence: args.output.evidence,
      }),
    };
    return {
      status: "continue",
      response_intent: args.output.repair_state.phase,
      local_state: {
        skill_id: "emotional_repair",
        mode: "local_repair_flow",
        status: "active",
        repair_state: args.output.repair_state,
        last_visible_task: fallbackVisibleTask.kind,
        last_potion_bridge_offer: args.previous?.last_potion_bridge_offer ??
          null,
        previous_repair_summary: args.output.repair_state.summary,
        turn_count: turnCount,
        max_turns: Number(args.previous?.max_turns ?? 6) || 6,
        created_at: args.previous?.created_at ?? now,
        updated_at: now,
      },
      visible_task: fallbackVisibleTask,
      potion_bridge_context: null,
      exit_to_global_dispatcher: false,
      reason_code: "emotional_repair_potion_bridge_blocked",
      constraints,
      blocked_effects: [{
        type: "select_state_potion",
        reason_code: "missing_previous_potion_offer",
      }],
      evidence: args.output.evidence,
    };
  }

  if (args.output.flow_action === "exit_to_global_dispatcher") {
    return {
      status: "exit",
      response_intent: "exit_to_global_dispatcher",
      local_state: null,
      visible_task: visibleTask,
      potion_bridge_context: null,
      exit_to_global_dispatcher: true,
      reason_code: "emotional_repair_exit_to_global_dispatcher",
      constraints,
      blocked_effects: [],
      evidence: args.output.evidence,
    };
  }
  if (
    args.output.flow_action === "cancel_flow" ||
    args.output.flow_action === "complete_flow" ||
    args.output.flow_action === "defer_flow"
  ) {
    return {
      status: "complete",
      response_intent: args.output.flow_action === "defer_flow"
        ? "deferred"
        : args.output.flow_action === "complete_flow"
        ? "completed"
        : "exit_to_global_dispatcher",
      local_state: null,
      visible_task: visibleTask,
      potion_bridge_context: null,
      exit_to_global_dispatcher: false,
      reason_code: `emotional_repair_${args.output.flow_action}`,
      constraints,
      blocked_effects: [],
      evidence: args.output.evidence,
    };
  }

  if (confirmIsValid && selectedPotion) {
    const context = bridgeContext({
      output: args.output,
      selectedPotion,
      confidence: fieldConfidence("handoff"),
    });
    return {
      status: "handoff",
      response_intent: "handoff_to_select_state_potion",
      local_state: {
        ...(args.previous ?? {
          skill_id: "emotional_repair",
          mode: "local_repair_flow",
          turn_count: 0,
          max_turns: 6,
          created_at: now,
        } as EmotionalRepairLocalState),
        status: "handoff_to_potion",
        repair_state: args.output.repair_state,
        last_visible_task: visibleTask.kind,
        previous_repair_summary: args.output.repair_state.summary,
        updated_at: now,
      },
      visible_task: visibleTask,
      potion_bridge_context: context,
      exit_to_global_dispatcher: false,
      reason_code: "emotional_repair_handoff_to_select_state_potion",
      constraints,
      blocked_effects: [],
      evidence: args.output.evidence,
    };
  }

  const shouldOffer = offerIsPersistable && selectedPotion !== null;
  const offerContext = shouldOffer
    ? bridgeContext({
      output: args.output,
      selectedPotion,
      confidence: fieldConfidence("offer"),
    })
    : null;
  const lastOffer = shouldOffer
    ? {
      selected_potion: selectedPotion,
      durable_need: offerContext!.durable_need,
      prefill_candidates: args.output.potion_bridge.prefill_candidates,
      selection_reason: args.output.potion_bridge.why_ready_or_blocked,
      offered_at_turn: turnCount,
      information_note: offerContext!.information_note,
    }
    : constraints.includes("no_potion")
    ? null
    : args.previous?.last_potion_bridge_offer ?? null;
  return {
    status: "continue",
    response_intent: args.output.repair_state.phase,
    local_state: {
      skill_id: "emotional_repair",
      mode: "local_repair_flow",
      status: "active",
      repair_state: args.output.repair_state,
      last_visible_task: visibleTask.kind,
      last_potion_bridge_offer: lastOffer,
      previous_repair_summary: args.output.repair_state.summary,
      turn_count: turnCount,
      max_turns: Number(args.previous?.max_turns ?? 6) || 6,
      created_at: args.previous?.created_at ?? now,
      updated_at: now,
    },
    visible_task: visibleTask,
    potion_bridge_context: null,
    exit_to_global_dispatcher: false,
    reason_code: bridgeOfferNotPersistable
      ? "emotional_repair_potion_bridge_blocked"
      : "emotional_repair_local_continue",
    constraints,
    blocked_effects: bridgeOfferNotPersistable
      ? [{ type: "select_state_potion", reason_code: "bridge_not_mature" }]
      : [],
    evidence: args.output.evidence,
  };
}
