import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import {
  createNoteInformation,
  normalizeNoteInformation as normalizeCanonicalNoteInformation,
} from "../../contracts/note_information.v1.ts";
import {
  type DemotivationRepairActionReadiness,
  type DemotivationRepairBridgePotion,
  type DemotivationRepairConfidence,
  type DemotivationRepairConstraint,
  type DemotivationRepairConversationContext,
  type DemotivationRepairDurableNeedKind,
  type DemotivationRepairIntent,
  type DemotivationRepairLocalDispatcherOutput,
  type DemotivationRepairLocalFlowAction,
  type DemotivationRepairLocalState,
  type DemotivationRepairMotivationState,
  type DemotivationRepairNoteInformation,
  type DemotivationRepairPhase,
  type DemotivationRepairPotionBridgeContext,
  type DemotivationRepairResponseContract,
  type DemotivationRepairVisiblePotionLabel,
  type DemotivationRepairVisibleTask,
  type DemotivationRepairVisibleTaskKind,
  normalizeDemotivationRepairConstraints,
} from "./contract.ts";
import {
  directEffectLocalDispatcherPromptLines,
  withDirectEffectLocalContext,
} from "../../router/direct_effect_local_context.ts";

export type DemotivationRepairLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: DemotivationRepairLocalState | null;
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
    | DemotivationRepairLocalState["last_potion_bridge_offer"]
    | null;
  turn_frame: TurnFrame | null;
  explicit_constraints: string[];
};

export type DemotivationRepairLocalDispatcher = (
  input: DemotivationRepairLocalDispatcherInput,
) => Promise<DemotivationRepairLocalDispatcherOutput | null>;

export type DemotivationRepairReducerResult = {
  status: "continue" | "complete" | "exit" | "handoff" | "safety";
  response_intent: string;
  local_state: DemotivationRepairLocalState | null;
  visible_task: DemotivationRepairVisibleTask;
  potion_bridge_context: DemotivationRepairPotionBridgeContext | null;
  note_information: DemotivationRepairNoteInformation | null;
  exit_to_global_dispatcher: boolean;
  reason_code: string;
  constraints: DemotivationRepairConstraint[];
  blocked_effects: Array<{ type: string; reason_code: string }>;
  evidence: string[];
};

const FLOW_ACTIONS: readonly DemotivationRepairLocalFlowAction[] = [
  "answer_repair",
  "ask_gentle_clarification",
  "reduce_friction",
  "restore_meaning",
  "stabilize_energy",
  "smaller_step",
  "action_card_candidate",
  "potion_bridge_offer",
  "confirm_potion_bridge",
  "revise_repair_context",
  "repeat_last_repair",
  "get_info_product",
  "get_info_db",
  "apply_attempt",
  "exit_to_global_dispatcher",
  "cancel_flow",
  "complete_flow",
  "defer_flow",
  "handoff_to_local_flow",
  "exit_to_global_dispatcher",
  "safety_preempt",
];

const INTENTS: readonly DemotivationRepairIntent[] = [
  "fatigue_drop",
  "loss_of_meaning",
  "failure_accumulation",
  "avoidance_loop",
  "overwhelm",
  "concrete_action_emerged",
  "asks_smaller_step",
  "asks_no_tool_support",
  "asks_recurring_support",
  "status_or_meta_question",
  "unclear",
];

const PHASES: readonly DemotivationRepairPhase[] = [
  "diagnose",
  "reduce_friction",
  "restore_meaning",
  "stabilize_energy",
  "action_card_ready",
  "exit",
];

const MOTIVATION_STATES: readonly DemotivationRepairMotivationState[] = [
  "fatigue",
  "loss_of_meaning",
  "failure_accumulation",
  "avoidance",
  "overwhelm",
  "unclear",
];

const READINESS: readonly DemotivationRepairActionReadiness[] = [
  "none",
  "hypothetical",
  "ready",
  "already_chosen",
];

const BRIDGE_POTIONS: readonly DemotivationRepairBridgePotion[] = [
  "clarte",
  "courage",
  "rappel",
];

const NEEDS: readonly DemotivationRepairDurableNeedKind[] = [
  "meaning_reconnection",
  "courage_through_avoidance",
  "anti_dropout_anchor",
];

const VISIBLE_TASKS: readonly DemotivationRepairVisibleTaskKind[] = [
  "diagnose",
  "reduce_friction",
  "restore_meaning",
  "stabilize_energy",
  "smaller_step",
  "action_card_candidate",
  "potion_bridge_offer",
  "potion_bridge_choice",
  "potion_bridge_handoff",
  "ask_gentle_clarification",
  "inline_tool_return",
  "apply_attempt",
  "repeat_repair",
  "exit_or_cancel",
  "safety",
];

const TONES: readonly DemotivationRepairResponseContract["tone"][] = [
  "grounded",
  "soft_direct",
  "energy_preserving",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

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

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && new Set<string>(allowed).has(value)
    ? value as T
    : fallback;
}

function nullableEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" && new Set<string>(allowed).has(value)
    ? value as T
    : null;
}

function confidence(value: unknown): DemotivationRepairConfidence {
  return enumValue(value, ["low", "medium", "high"] as const, "medium");
}

function bridgePotion(value: unknown): DemotivationRepairBridgePotion | null {
  return nullableEnumValue(value, BRIDGE_POTIONS);
}

export function demotivationRepairVisiblePotionLabel(
  potion: DemotivationRepairBridgePotion | null,
): DemotivationRepairVisiblePotionLabel | null {
  switch (potion) {
    case "clarte":
      return "Potion de clarté";
    case "courage":
      return "Potion de courage";
    case "rappel":
      return "Potion anti-décrochage";
    default:
      return null;
  }
}

function normalizeRepairState(
  raw: unknown,
): DemotivationRepairLocalState["repair_state"] {
  const root = isRecord(raw) ? raw : {};
  return {
    intent: enumValue(root.intent, INTENTS, "unclear"),
    phase: enumValue(root.phase, PHASES, "diagnose"),
    motivation_state: enumValue(
      root.motivation_state,
      MOTIVATION_STATES,
      "unclear",
    ),
    action_readiness: enumValue(
      root.action_readiness,
      READINESS,
      "none",
    ),
    summary: stringValue(root.summary) ??
      "Réparation motivationnelle en cours.",
    user_words: stringArray(root.user_words),
    identity_freeze_risk: root.identity_freeze_risk === true,
    motivation_source_diagnosed: root.motivation_source_diagnosed === true,
  };
}

function normalizeResponseContract(
  raw: unknown,
): DemotivationRepairResponseContract {
  const root = isRecord(raw) ? raw : {};
  return {
    max_questions: root.max_questions === 1 ? 1 : 0,
    allow_plan_edit: root.allow_plan_edit === true,
    allow_tool_suggestion: root.allow_tool_suggestion === true,
    allow_potion_suggestion: root.allow_potion_suggestion === true,
    allow_attack_card_suggestion: root.allow_attack_card_suggestion === true,
    allow_concrete_action: root.allow_concrete_action === true,
    tone: enumValue(root.tone, TONES, "energy_preserving"),
  };
}

function normalizePrefillCandidates(
  raw: unknown,
): DemotivationRepairLocalDispatcherOutput["potion_bridge"][
  "prefill_candidates"
] {
  const root = isRecord(raw) ? raw : {};
  return {
    plan_meaning_loss_reason: stringValue(root.plan_meaning_loss_reason),
    avoidance_target: stringValue(root.avoidance_target),
    blocker_kind: nullableEnumValue(
      root.blocker_kind,
      ["resultat", "regard", "inconfort", "conflit"] as const,
    ),
    drift_target: stringValue(root.drift_target),
    drift_style: nullableEnumValue(
      root.drift_style,
      ["oubli", "repousse", "laisse_filer", "baisse_elan"] as const,
    ),
  };
}

function normalizeNoteInformation(
  raw: unknown,
  targetFlow: "global" | "select_state_potion" | "safety",
  fallbackSummary: string,
): DemotivationRepairNoteInformation {
  const root = isRecord(raw) ? raw : {};
  const targetDispatcher = targetFlow === "safety"
    ? "safety_crisis"
    : targetFlow === "global"
    ? "global"
    : "select_state_potion";
  const note = normalizeCanonicalNoteInformation(root, {
    source_flow_id: "demotivation_repair",
    handoff_reason: targetFlow === "safety"
      ? "safety"
      : targetFlow === "select_state_potion"
      ? "bridge"
      : "topic_change",
    target_dispatcher: targetDispatcher,
    handoff_context_for_next_dispatcher: fallbackSummary,
    user_words: [],
    structured_context: {
      source_flow: "demotivation_repair",
      active_flow_summary: fallbackSummary,
      collected_state: {},
      unresolved_questions: [],
      recommended_next_focus: targetDispatcher,
    },
  });
  return {
    ...note,
    target_flow: targetFlow,
  };
}

function normalizeVisibleTask(
  raw: unknown,
  selectedPotion: DemotivationRepairBridgePotion | null,
  repairSummary: string,
  userWords: string[],
): DemotivationRepairVisibleTask {
  const root = isRecord(raw) ? raw : {};
  const context = isRecord(root.conversation_context)
    ? root.conversation_context
    : {};
  const kind = enumValue(root.kind, VISIBLE_TASKS, "diagnose");
  return {
    kind,
    conversation_context: normalizeConversationContext({
      raw: context,
      kind,
      repairSummary,
      userWords,
      selectedPotion,
      potionLabel: demotivationRepairVisiblePotionLabel(selectedPotion),
      bridgeContextSummary: null,
    }),
  };
}

function normalizeConversationContext(args: {
  raw: Record<string, unknown>;
  kind: DemotivationRepairVisibleTaskKind;
  repairSummary: string;
  userWords: string[];
  selectedPotion: DemotivationRepairBridgePotion | null;
  potionLabel: DemotivationRepairVisiblePotionLabel | null;
  bridgeContextSummary: string | null;
}): DemotivationRepairConversationContext {
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
    ) as DemotivationRepairConversationContext["field_or_stage"],
    known_values: {
      intent: enumValue(known.intent, INTENTS, "unclear"),
      phase: enumValue(known.phase, PHASES, "diagnose"),
      motivation_state: enumValue(
        known.motivation_state,
        MOTIVATION_STATES,
        "unclear",
      ),
      action_readiness: enumValue(
        known.action_readiness,
        READINESS,
        "none",
      ),
      identity_freeze_risk: known.identity_freeze_risk === true,
      motivation_source_diagnosed: known.motivation_source_diagnosed === true,
    },
    missing_or_weak_values: stringArray(args.raw.missing_or_weak_values),
    selected_candidate: {
      potion: bridgePotion(selected.potion) ?? args.selectedPotion,
      potion_label: stringValue(selected.potion_label) as
        | DemotivationRepairVisiblePotionLabel
        | null ??
        args.potionLabel,
      durable_need_kind: enumValue(
        selected.durable_need_kind,
        [...NEEDS, null] as any,
        null as any,
      ),
      durable_need_summary: stringValue(selected.durable_need_summary),
    },
    handoff_data: {
      bridge_context_summary: stringValue(handoff.bridge_context_summary) ??
        args.bridgeContextSummary,
      target_dispatcher: targetDispatcher === "select_state_potion" ||
          targetDispatcher === "safety_crisis" ||
          targetDispatcher === "product_help" ||
          targetDispatcher === "status_recap" ||
          targetDispatcher === "global"
        ? targetDispatcher
        : null,
      no_chat_mutation: true,
    },
    tone_constraints: stringArray(args.raw.tone_constraints),
    do_not_say: stringArray(args.raw.do_not_say),
    context_summary: stringValue(args.raw.context_summary),
    evidence_used: stringArray(args.raw.evidence_used),
    db_context_summary: stringValue(args.raw.db_context_summary),
    memory_context_summary: stringValue(args.raw.memory_context_summary),
    max_questions: args.raw.max_questions === 1 ? 1 : 0,
  };
}

export function normalizeDemotivationRepairLocalDispatcherOutput(
  raw: unknown,
): DemotivationRepairLocalDispatcherOutput | null {
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
  const exitMemo = isRecord(root.exit_memo) ? root.exit_memo : {};
  const bridgeNote = bridge.note_information === null
    ? null
    : normalizeNoteInformation(
      bridge.note_information,
      "select_state_potion",
      stringValue(bridge.why_ready_or_blocked) ?? repairState.summary,
    );
  return {
    flow_action: enumValue(root.flow_action, FLOW_ACTIONS, "answer_repair"),
    confidence: confidence(root.confidence),
    risk_score: Math.max(0, Math.min(10, Number(root.risk_score ?? 0) || 0)),
    repair_state: repairState,
    constraints: normalizeDemotivationRepairConstraints(root.constraints),
    response_contract: normalizeResponseContract(root.response_contract),
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
      visible_potion_label: demotivationRepairVisiblePotionLabel(
        selectedPotion,
      ),
      candidate_potions: Array.isArray(bridge.candidate_potions)
        ? bridge.candidate_potions.flatMap((item) => {
          if (!isRecord(item)) return [];
          const potion = bridgePotion(item.potion_type);
          if (!potion) return [];
          return [{
            potion_type: potion,
            visible_label: demotivationRepairVisiblePotionLabel(potion)!,
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
      note_information: bridgeNote,
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
      note_information: exitMemo.note_information === null
        ? null
        : normalizeNoteInformation(
          exitMemo.note_information,
          "global",
          stringValue(exitMemo.handoff_hint_for_global_dispatcher) ??
            repairState.summary,
        ),
    },
    no_chat_mutation: {
      potion_session_created: false,
      recurring_reminder_created: false,
      scheduled_checkin_created: false,
      executable_confirmation_generated: false,
      db_write_committed: false,
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
    throw new Error("demotivation_repair_local_dispatcher_missing_json");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function localDispatcherFieldCompletionRules(): string {
  return [
    "Field Completion Rules pour demotivation_repair:",
    "- flow_action: decision principale du tour courant. Utilise answer_repair, ask_gentle_clarification, reduce_friction, restore_meaning, stabilize_energy, smaller_step, action_card_candidate ou repeat_last_repair pour continuer localement; exit_to_global_dispatcher si le user veut arreter ce flow, apporte un nouveau sujet clair, pose une question produit/statut autonome, ou demande explicitement un tool/flow hors demotivation_repair; cancel_flow/complete_flow/defer_flow seulement pour une issue metier locale deja prevue par le flow; safety_preempt pour safety; get_info_product/get_info_db seulement pour une question inline courte qui sert encore le repair actif; potion_bridge_offer/confirm_potion_bridge/handoff_to_local_flow seulement pour le bridge potion autorise.",
    "- confidence: high si l'intention du tour et le prochain stage sont clairs; medium si le sens est probable mais incomplet; low si tu dois clarifier, ralentir ou proteger contre une hypothese fragile.",
    "- risk_score: score 0..10 utile au flow local. Ne fabrique pas de safety. Si le risque safety est reel, flow_action=safety_preempt et visible_task.kind=safety.",
    "- repair_state.intent: classification locale de la demotivation du tour. Ne conserve que ce qui aide ce flow; si la cause est une hypothese, garde unclear ou un intent prudent.",
    "- repair_state.phase: phase de travail locale. diagnose quand la source manque; reduce_friction quand l'obstacle pratique domine; restore_meaning quand le lien au sens est rompu; stabilize_energy quand l'energie basse domine; action_card_ready seulement si le user a explicitement demande/accepte un support actionnable ou si une action concrete est vraiment prete et utile sans interrompre le repair; exit pour stop/exit/safety.",
    "- repair_state.motivation_state: etat motivationnel local, pas un profil global. Ne transforme pas une observation du tour en trait permanent.",
    "- repair_state.action_readiness: none si aucune action n'est stabilisee; hypothetical si elle est envisagee; ready si le prochain pas est clair; already_chosen si le user a deja choisi l'action.",
    "- repair_state.summary: resume court de l'etat du flow, utile au reducer. Pas de diagnostic clinique, pas de cause verrouillee sans preuve.",
    "- repair_state.user_words: mots ou formulations du user vraiment utiles. Pas de paraphrase inventee, pas de dump historique.",
    "- repair_state.identity_freeze_risk: true seulement si le user se fige en identite globale negative; sinon false.",
    "- repair_state.motivation_source_diagnosed: true seulement si la source du decrochage est assez claire pour agir sans faire repeter le user; sinon false.",
    "- constraints: limites du tour. Ajoute no_potion/no_tool/no_plan_edit/no_questions/short_reply quand le user les demande ou quand le flow doit rester prudent; ne retire pas une contrainte explicite.",
    "- response_contract.max_questions: 1 quand le message visible doit poser une question de clarification ou de reconnexion; 0 si stop, safety, handoff, phrase courte fermee ou contrainte no_questions. Ne demande jamais plusieurs choses.",
    "- response_contract.allow_plan_edit: true seulement si le user demande ou consent a modifier le plan; sinon false.",
    "- response_contract.allow_tool_suggestion: true seulement si proposer un support produit est coherent, attendu par le user, et non bloque par no_tool/no_potion; sinon false.",
    "- response_contract.allow_potion_suggestion: true seulement si une potion peut etre proposee sans forcer et sans contredire les contraintes; sinon false.",
    "- response_contract.allow_attack_card_suggestion: true seulement si le user demande/accepte une carte, un support a garder, une formalisation actionnable, ou un pas concret pret a etre stabilise; false quand le user vient seulement de retrouver du sens ou veut rester conversationnel.",
    "- response_contract.allow_concrete_action: true si un mini-pas peut aider sans pression; sinon false.",
    "- response_contract.tone: grounded pour clarifier sobrement; soft_direct pour nommer un point clair; energy_preserving quand le user est bas, fatigue ou fragile.",
    "- potion_bridge.status: not_applicable hors bridge; candidate pour candidat interne non visible; offered_waiting_consent seulement si l'offre est visible et confirmable; confirmed_handoff seulement apres consentement a une offre locale precedente; blocked si bridge interdit ou immature.",
    "- potion_bridge.selected_potion et visible_potion_label: null hors bridge. Si non-null, doivent correspondre a clarte/Potion de clarté, courage/Potion de courage, rappel/Potion anti-décrochage.",
    "- potion_bridge.candidate_potions: candidats internes courts, 0 a 2. Ne mets pas un candidat low comme offre visible.",
    "- potion_bridge.durable_need: kind et summary seulement si le besoin durable est assez clair; null sinon.",
    "- potion_bridge.prefill_candidates: valeurs candidates pour select_state_potion. Utilise seulement les infos fournies ou raisonnablement stabilisees; sur confirmation avec ancre user, copie l'ancre dans le champ cible pertinent.",
    "- potion_bridge.missing_before_handoff: questions encore faibles avant bridge. Vide seulement si le handoff est exploitable.",
    "- potion_bridge.why_ready_or_blocked: raison courte expliquant pourquoi le bridge est pret, candidat interne ou bloque.",
    "- potion_bridge.note_information: obligatoire quand confirm_potion_bridge/handoff_to_local_flow transfere vers select_state_potion; null hors transition.",
    "- visible_task.kind: stage visible exact. Utilise diagnose, reduce_friction, restore_meaning, stabilize_energy, smaller_step, action_card_candidate, potion_bridge_offer, potion_bridge_choice, potion_bridge_handoff, ask_gentle_clarification, inline_tool_return, apply_attempt, repeat_repair, exit_or_cancel ou safety selon la suite exacte. En cancel/defer/complete/exit, utilise exit_or_cancel. N'utilise action_card_candidate que si flow_action=action_card_candidate, repair_state.phase=action_card_ready, action_readiness=ready/already_chosen, allow_attack_card_suggestion=true et la demande de support/action est presente dans evidence.",
    "- visible_task.conversation_context: seul contexte du prompt visible. Mets state_summary, user_words, known_values, missing_or_weak_values, selected_candidate, handoff_data, tone_constraints, do_not_say, context_summary, evidence_used et max_questions. Ne transmets pas DB brute, memoire brute ou note_information brute.",
    "- visible_task.conversation_context.selected_candidate: null si aucune offre visible persistable. Ne mets une potion que si le stage visible peut la mentionner.",
    "- visible_task.conversation_context.handoff_data: target_dispatcher seulement pour transition ou roundtrip inline; null sinon; no_chat_mutation reste true.",
    "- visible_task.conversation_context.do_not_say: contraintes visibles importantes, surtout pas de promesse de creation, activation, rappel ou DB write.",
    "- exit_memo.needed: true seulement pour exit_to_global_dispatcher, safety_preempt ou transition qui a besoin d'un memo; false sinon.",
    "- exit_memo.reason: cancelled quand le user veut arreter ce flow sans autre demande; topic_change pour nouveau sujet clair; explicit_tool_request si le user demande explicitement une capacite hors flow; inline_product/inline_status seulement pour roundtrip inline qui reste au service du repair actif; safety/potion_handoff selon le cas; none sinon.",
    "- exit_memo.flow_summary et handoff_hint_for_global_dispatcher: utiles pour le dispatcher cible; null si le flow continue localement.",
    "- exit_memo.potion_bridge_context: object seulement si le contexte bridge doit etre transmis; null sinon.",
    "- exit_memo.note_information: obligatoire pour exit_to_global_dispatcher; null si pas de changement de dispatcher. Structure conservee: source_flow_id, target_dispatcher, handoff_reason, handoff_context_for_next_dispatcher, user_words, structured_context, confidence si utile. user_words contient 1 a 3 fragments du message courant. structured_context doit etre succinct et non vide: user_message_summary, active_flow_summary, micro-geste ou sens retrouve, contraintes explicites comme stop/no_tool/no_potion/no_questions, unresolved_questions, recommended_next_focus. Ne mets pas source_flow_presentation, source_flow_state_summary, target_local_dispatcher_hint, risk_score ou no_chat_mutation dans la note.",
    ...directEffectLocalDispatcherPromptLines(),
    "- no_chat_mutation: tous les champs doivent rester false. Le dispatcher ne cree rien, n'active rien, ne programme rien et ne confirme aucun write.",
    "- evidence: indices semantiques vraiment utilises pour la decision. Pas de pseudo-preuve, pas de chaine de pensee, pas de mots isoles sans contexte.",
  ].join("\n");
}

function localDispatcherTransitionRules(): string {
  return [
    "Transition Rules:",
    "- exit_to_global_dispatcher: le user veut arreter ce flow ou apporte un nouveau sujet clair hors demotivation_repair; exit_memo.note_information obligatoire; le global peut reprendre seulement apres cette note.",
    "- Cas de sortie observes en QA et obligatoires: 1) le user annonce un changement de sujet ou passe a une conversation generale qui ne demande plus de repair; 2) le user pose une question produit/statut autonome a part, par exemple destination, emplacement, etat ou fonctionnement d'une surface Sophia; 3) le user demande explicitement de lancer un tool/flow comme une carte, un rappel, une preference ou un ajustement. Dans ces trois familles, produis exit_to_global_dispatcher avec exit_memo.note_information; ne reponds pas localement comme demotivation_repair.",
    "- Si le message contient une intention concurrente explicite hors repair, le dispatcher global doit pouvoir reprocesser le message courant depuis exit_memo.note_information. Ne transforme pas cette intention en conseil conversationnel local.",
    "- cancel_flow/defer_flow/complete_flow: issue metier locale sans changement de dispatcher, visible_task.kind=exit_or_cancel, note_information null.",
    "- safety_preempt: safety prioritaire; note_information vers safety_crisis; le global normal ne fonctionne pas.",
    "- get_info_product/get_info_db: question inline produit ou statut seulement si elle est courte, au service direct du repair actif et ne demande pas un nouveau owner autonome. Sinon exit_to_global_dispatcher.",
    "- handoff_to_local_flow/confirm_potion_bridge: seulement vers select_state_potion apres offre locale persistable et consentement; note_information demotivation_repair obligatoire.",
    "- anti-faux-positif: si le user continue a parler de sa demotivation, revise une nuance ou repond a une question locale, reste owner du flow au lieu de sortir.",
  ].join("\n");
}

export function demotivationRepairDispatcherOutputExamples() {
  return [
    {
      case: "continuation_normale",
      output: {
        flow_action: "restore_meaning",
        confidence: "medium",
        risk_score: 0,
        repair_state: {
          intent: "loss_of_meaning",
          phase: "restore_meaning",
          motivation_state: "loss_of_meaning",
          action_readiness: "none",
          summary: "Le user sent que ses actions ont perdu leur lien au cap.",
          user_words: ["je ne vois plus pourquoi je fais tout ca"],
          identity_freeze_risk: false,
          motivation_source_diagnosed: true,
        },
        constraints: ["do_not_moralize", "one_question_max"],
        response_contract: {
          max_questions: 1,
          allow_plan_edit: false,
          allow_tool_suggestion: false,
          allow_potion_suggestion: false,
          allow_attack_card_suggestion: false,
          allow_concrete_action: false,
          tone: "energy_preserving",
        },
        potion_bridge: {
          status: "not_applicable",
          selected_potion: null,
          visible_potion_label: null,
          candidate_potions: [],
          durable_need: { kind: null, summary: null },
          prefill_candidates: {},
          missing_before_handoff: ["meaning_anchor"],
          why_ready_or_blocked:
            "Le flow doit d'abord restaurer le lien au sens.",
          note_information: null,
        },
        visible_task: {
          kind: "restore_meaning",
          conversation_context: {
            state_summary:
              "Le user a perdu le lien entre ses actions et le cap.",
            user_words: ["je ne vois plus pourquoi je fais tout ca"],
            field_or_stage: "restore_meaning",
            known_values: {
              intent: "loss_of_meaning",
              phase: "restore_meaning",
              motivation_state: "loss_of_meaning",
              action_readiness: "none",
              identity_freeze_risk: false,
              motivation_source_diagnosed: true,
            },
            missing_or_weak_values: ["meaning_anchor"],
            selected_candidate: {
              potion: null,
              potion_label: null,
              durable_need_kind: null,
              durable_need_summary: null,
            },
            handoff_data: {
              bridge_context_summary: null,
              target_dispatcher: null,
              no_chat_mutation: true,
            },
            tone_constraints: ["energy_preserving", "one_question_max"],
            do_not_say: ["Ne propose pas de potion dans ce message."],
            context_summary:
              "Rester conversationnel et retrouver le lien au sens.",
            evidence_used: ["perte de sens explicite"],
            db_context_summary: null,
            memory_context_summary: null,
            max_questions: 1,
          },
        },
        exit_memo: {
          needed: false,
          reason: "none",
          flow_summary: null,
          handoff_hint_for_global_dispatcher: null,
          potion_bridge_context: null,
          note_information: null,
        },
        no_chat_mutation: {
          potion_session_created: false,
          recurring_reminder_created: false,
          scheduled_checkin_created: false,
          executable_confirmation_generated: false,
          db_write_committed: false,
        },
        evidence: ["perte de sens explicite"],
      },
    },
    {
      case: "transition_safety",
      output: {
        flow_action: "safety_preempt",
        confidence: "high",
        risk_score: 9,
        repair_state: {
          intent: "unclear",
          phase: "exit",
          motivation_state: "overwhelm",
          action_readiness: "none",
          summary: "Le message contient un risque safety prioritaire.",
          user_words: ["je risque de me faire du mal"],
          identity_freeze_risk: true,
          motivation_source_diagnosed: false,
        },
        constraints: ["no_tool", "no_potion", "short_reply"],
        response_contract: {
          max_questions: 0,
          allow_plan_edit: false,
          allow_tool_suggestion: false,
          allow_potion_suggestion: false,
          allow_attack_card_suggestion: false,
          allow_concrete_action: false,
          tone: "grounded",
        },
        potion_bridge: {
          status: "blocked",
          selected_potion: null,
          visible_potion_label: null,
          candidate_potions: [],
          durable_need: { kind: null, summary: null },
          prefill_candidates: {},
          missing_before_handoff: [],
          why_ready_or_blocked: "Safety prioritaire.",
          note_information: null,
        },
        visible_task: {
          kind: "safety",
          conversation_context: {
            state_summary: "Safety prioritaire.",
            user_words: ["je risque de me faire du mal"],
            field_or_stage: "safety",
            known_values: {
              intent: "unclear",
              phase: "exit",
              motivation_state: "overwhelm",
              action_readiness: "none",
              identity_freeze_risk: true,
              motivation_source_diagnosed: false,
            },
            missing_or_weak_values: [],
            selected_candidate: {
              potion: null,
              potion_label: null,
              durable_need_kind: null,
              durable_need_summary: null,
            },
            handoff_data: {
              bridge_context_summary: "Safety prioritaire.",
              target_dispatcher: "safety_crisis",
              no_chat_mutation: true,
            },
            tone_constraints: ["grounded", "short_reply"],
            do_not_say: ["Ne propose pas de potion ou d'outil."],
            context_summary: "Transmettre vers safety.",
            evidence_used: ["risque de dommage a soi"],
            db_context_summary: null,
            memory_context_summary: null,
            max_questions: 0,
          },
        },
        exit_memo: {
          needed: true,
          reason: "safety",
          flow_summary: "Safety prioritaire dans demotivation_repair.",
          handoff_hint_for_global_dispatcher: null,
          potion_bridge_context: null,
          note_information: {
            source_flow_id: "demotivation_repair",
            target_dispatcher: "safety_crisis",
            handoff_reason: "safety",
            handoff_context_for_next_dispatcher:
              "Risque safety prioritaire; safety_crisis doit reprendre.",
            user_words: ["risque de dommage a soi"],
            structured_context: {
              user_message_summary: "risque safety prioritaire",
              active_flow_summary:
                "demotivation_repair interrompt le flow pour safety.",
              collected_state: {},
              unresolved_questions: [],
              recommended_next_focus: "safety_crisis",
            },
            confidence: "high",
            target_flow: "safety",
          },
        },
        no_chat_mutation: {
          potion_session_created: false,
          recurring_reminder_created: false,
          scheduled_checkin_created: false,
          executable_confirmation_generated: false,
          db_write_committed: false,
        },
        evidence: ["risque de dommage a soi"],
      },
    },
  ] as const;
}

export function localDispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local structure du flow demotivation_repair.",
    "Tu n'es pas le dispatcher global et tu ne reponds jamais directement au user.",
    "Retourne uniquement un JSON strict conforme au contrat fourni.",
    "Safety preempt gagne sur tout.",
    "Tu peux seulement preparer un bridge vers clarte, courage ou rappel.",
    "Le label visible de rappel est toujours Potion anti-décrochage. N'ecris jamais Potion rappel.",
    "Ne propose pas de potion tant que la source du decrochage n'est pas diagnostiquee.",
    "Ne propose pas de potion si no_potion, no_tool ou asks_no_tool_support bloque les outils.",
    "potion_bridge.status=candidate signifie candidat interne seulement: ne demande pas consentement visible et n'utilise pas visible_task.kind=potion_bridge_offer.",
    "Utilise potion_bridge_offer seulement si status=offered_waiting_consent, selected_potion non-null, candidat exploitable, et le user a deja eu un vrai moment de repair conversationnel.",
    "Un bridge potion exige diagnostic et consentement; confirm_potion_bridge signifie que le user consent a une offre deja faite.",
    "Si le user confirme une offre precedente, utilise confirm_potion_bridge uniquement si previous_potion_bridge_offer existe et correspond.",
    "Quand le user confirme et ajoute une ancre utile, copie cette ancre dans prefill_candidates du champ potion cible: clarte.plan_meaning_loss_reason, courage.avoidance_target/blocker_kind, rappel.drift_target/drift_style.",
    "La note d'information pour le flow suivant doit contenir une presentation du flow quitte et le contexte utile au dispatcher potion.",
    "Aucune session potion, aucun rappel, aucun scheduled_checkin, aucune confirmation executable, aucun write DB.",
    localDispatcherFieldCompletionRules(),
    localDispatcherTransitionRules(),
  ].join("\n");
}

export const runDemotivationRepairLocalDispatcher:
  DemotivationRepairLocalDispatcher = async (input) => {
    const userPrompt = JSON.stringify({
      task: "dispatch_demotivation_repair_local_flow",
      required_json_shape: {
        flow_action:
          "answer_repair|ask_gentle_clarification|reduce_friction|restore_meaning|stabilize_energy|smaller_step|action_card_candidate|potion_bridge_offer|confirm_potion_bridge|revise_repair_context|repeat_last_repair|get_info_product|get_info_db|apply_attempt|exit_to_global_dispatcher|cancel_flow|complete_flow|defer_flow|handoff_to_local_flow|safety_preempt",
        confidence: "low|medium|high",
        risk_score: "number 0..10",
        repair_state: {
          intent:
            "fatigue_drop|loss_of_meaning|failure_accumulation|avoidance_loop|overwhelm|concrete_action_emerged|asks_smaller_step|asks_no_tool_support|asks_recurring_support|status_or_meta_question|unclear",
          phase:
            "diagnose|reduce_friction|restore_meaning|stabilize_energy|action_card_ready|exit",
          motivation_state:
            "fatigue|loss_of_meaning|failure_accumulation|avoidance|overwhelm|unclear",
          action_readiness: "none|hypothetical|ready|already_chosen",
          summary: "string",
          user_words: ["string"],
          identity_freeze_risk: true,
          motivation_source_diagnosed: false,
        },
        constraints: [
          "no_potion|no_tool|no_plan_edit|no_questions|one_question_max|concrete_before_question|short_reply|do_not_moralize|do_not_modify_plan_yet|prefer_smallest_action",
        ],
        response_contract: {
          max_questions: "0|1",
          allow_plan_edit: false,
          allow_tool_suggestion: false,
          allow_potion_suggestion: false,
          allow_attack_card_suggestion: false,
          allow_concrete_action: false,
          tone: "grounded|soft_direct|energy_preserving",
        },
        potion_bridge: {
          status:
            "not_applicable|candidate|offered_waiting_consent|confirmed_handoff|blocked",
          selected_potion: "clarte|courage|rappel|null",
          visible_potion_label:
            "Potion de clarté|Potion de courage|Potion anti-décrochage|null",
          candidate_potions: [{
            potion_type: "clarte|courage|rappel",
            visible_label:
              "Potion de clarté|Potion de courage|Potion anti-décrochage",
            confidence: "low|medium|high",
            reason: "string",
          }],
          durable_need: {
            kind:
              "meaning_reconnection|courage_through_avoidance|anti_dropout_anchor|null",
            summary: "string|null",
          },
          prefill_candidates: {
            plan_meaning_loss_reason: "string|null",
            avoidance_target: "string|null",
            blocker_kind: "resultat|regard|inconfort|conflit|null",
            drift_target: "string|null",
            drift_style: "oubli|repousse|laisse_filer|baisse_elan|null",
          },
          missing_before_handoff: ["string"],
          why_ready_or_blocked: "string",
          note_information: {
            source_flow_id: "demotivation_repair",
            target_dispatcher: "global|select_state_potion|safety_crisis|null",
            handoff_reason:
              "topic_change|safety|inline_tool|bridge|flow_interruption|explicit_user_request|null",
            handoff_context_for_next_dispatcher: "string|null",
            user_words: ["string"],
            structured_context: "object",
            confidence: "low|medium|high|null",
            target_flow: "select_state_potion|null",
          },
        },
        visible_task: {
          kind:
            "diagnose|reduce_friction|restore_meaning|stabilize_energy|smaller_step|action_card_candidate|potion_bridge_offer|potion_bridge_choice|potion_bridge_handoff|ask_gentle_clarification|inline_tool_return|apply_attempt|repeat_repair|exit_or_cancel|safety",
          conversation_context: {
            state_summary: "string",
            user_words: ["string"],
            field_or_stage:
              "diagnose|reduce_friction|restore_meaning|stabilize_energy|smaller_step|action_card_candidate|potion_bridge_offer|potion_bridge_choice|potion_bridge_handoff|ask_gentle_clarification|inline_tool_return|apply_attempt|repeat_repair|exit_or_cancel|safety|null",
            known_values: {
              intent:
                "fatigue_drop|loss_of_meaning|failure_accumulation|avoidance_loop|overwhelm|concrete_action_emerged|asks_smaller_step|asks_no_tool_support|asks_recurring_support|status_or_meta_question|unclear",
              phase:
                "diagnose|reduce_friction|restore_meaning|stabilize_energy|action_card_ready|exit",
              motivation_state:
                "fatigue|loss_of_meaning|failure_accumulation|avoidance|overwhelm|unclear",
              action_readiness: "none|hypothetical|ready|already_chosen",
              identity_freeze_risk: false,
              motivation_source_diagnosed: false,
            },
            missing_or_weak_values: ["string"],
            selected_candidate: {
              potion: "clarte|courage|rappel|null",
              potion_label:
                "Potion de clarté|Potion de courage|Potion anti-décrochage|null",
              durable_need_kind:
                "meaning_reconnection|courage_through_avoidance|anti_dropout_anchor|null",
              durable_need_summary: "string|null",
            },
            handoff_data: {
              bridge_context_summary: "string|null",
              target_dispatcher:
                "select_state_potion|safety_crisis|product_help|status_recap|global|null",
              no_chat_mutation: true,
            },
            tone_constraints: ["string"],
            do_not_say: ["string"],
            context_summary: "string|null",
            evidence_used: ["string"],
            db_context_summary: "string|null",
            memory_context_summary: "string|null",
            max_questions: "0|1",
          },
        },
        exit_memo: {
          needed: false,
          reason:
            "topic_change|explicit_tool_request|inline_product|inline_status|cancelled|safety|potion_handoff|none",
          flow_summary: "string|null",
          handoff_hint_for_global_dispatcher: "string|null",
          potion_bridge_context: "object|null",
          note_information: {
            source_flow_id: "demotivation_repair",
            target_dispatcher: "global|select_state_potion|safety_crisis|null",
            handoff_reason:
              "topic_change|safety|inline_tool|bridge|flow_interruption|explicit_user_request|null",
            handoff_context_for_next_dispatcher: "string|null",
            user_words: ["string"],
            structured_context: "object",
            confidence: "low|medium|high|null",
            target_flow: "global|select_state_potion|safety|null",
          },
        },
        no_chat_mutation: {
          potion_session_created: false,
          recurring_reminder_created: false,
          scheduled_checkin_created: false,
          executable_confirmation_generated: false,
          db_write_committed: false,
        },
        evidence: ["string"],
      },
      current_user_message: input.user_message,
      recent_messages: input.recent_messages,
      active_demotivation_repair_state: input.active_state,
      previous_repair_summary: input.previous_repair_summary,
      previous_potion_bridge_offer: input.previous_potion_bridge_offer,
      note_information_inbound: input.note_information_inbound ?? null,
      db_context_pack: input.db_context_pack ?? null,
      micro_memory_context: input.micro_memory_context ?? null,
      platform_context: withDirectEffectLocalContext(
        input.platform_context ?? null,
        (input.turn_frame as any)?.plan_snapshot ??
          (input.platform_context as any)?.plan_snapshot ??
          null,
      ),
      risk_context: input.risk_context ?? null,
      available_inline_tools: input.available_inline_tools ?? [
        "product_help",
        "status_recap",
      ],
      parent_flow_context: input.parent_flow_context ?? null,
      timezone: input.timezone ?? null,
      channel: input.channel ?? null,
      turn_frame_safety: input.turn_frame?.safety ?? null,
      turn_frame_risk: input.turn_frame?.conversation_risk ?? null,
      explicit_constraints: input.explicit_constraints,
      possible_potion_bridge_targets: {
        clarte: ["plan_meaning_loss_reason"],
        courage: [
          "avoidance_target",
          "blocker_kind:resultat|regard|inconfort|conflit",
        ],
        rappel: [
          "drift_target",
          "drift_style:oubli|repousse|laisse_filer|baisse_elan",
        ],
      },
      dispatcher_output_examples: demotivationRepairDispatcherOutputExamples(),
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
          source: "demotivation_repair.local_dispatcher",
          forceRealAi: true,
          reasoningEffort: "low",
          httpTimeoutMs: 45_000,
          maxRetries: 1,
        },
      );
      return normalizeDemotivationRepairLocalDispatcherOutput(
        parseJsonObject(raw),
      );
    } catch (error) {
      console.warn("[DemotivationRepair] local dispatcher failed", { error });
      return null;
    }
  };

function constraintsWithInvariants(args: {
  output: DemotivationRepairLocalDispatcherOutput;
  explicitConstraints: string[];
}): DemotivationRepairConstraint[] {
  const constraints = new Set<DemotivationRepairConstraint>([
    ...args.output.constraints,
    ...normalizeDemotivationRepairConstraints(args.explicitConstraints),
    "do_not_moralize",
  ]);
  if (args.output.repair_state.intent === "asks_no_tool_support") {
    constraints.add("no_tool");
    constraints.add("no_potion");
  }
  if (constraints.has("no_tool")) constraints.add("no_potion");
  if (constraints.has("do_not_modify_plan_yet")) {
    constraints.add("no_plan_edit");
  }
  return [...constraints];
}

function bridgeBlocked(args: {
  output: DemotivationRepairLocalDispatcherOutput;
  constraints: DemotivationRepairConstraint[];
}): boolean {
  return args.constraints.some((constraint) =>
    constraint === "no_potion" || constraint === "no_tool"
  ) ||
    args.output.repair_state.intent === "asks_no_tool_support" ||
    args.output.repair_state.motivation_source_diagnosed !== true ||
    args.output.response_contract.allow_tool_suggestion !== true ||
    args.output.response_contract.allow_potion_suggestion !== true;
}

function isPersistablePotionOffer(args: {
  output: DemotivationRepairLocalDispatcherOutput;
  selectedPotion: DemotivationRepairBridgePotion | null;
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

function fieldConfidence(
  action: "offer" | "handoff",
): DemotivationRepairConfidence {
  return action === "handoff" ? "high" : "medium";
}

function bridgeCandidateObject(args: {
  value?: string | null;
  optionValue?: string | null;
  optionLabel?: string | null;
  confidence: DemotivationRepairConfidence;
}) {
  return {
    candidate_value: args.value ?? null,
    option_value: args.optionValue ?? null,
    option_label: args.optionLabel ?? null,
    confidence: args.confidence,
    source: "demotivation_repair" as const,
  };
}

function blockerKindLabel(value: string | null | undefined): string | null {
  switch (value) {
    case "resultat":
      return "Résultat";
    case "regard":
      return "Regard";
    case "inconfort":
      return "Inconfort";
    case "conflit":
      return "Conflit";
    default:
      return null;
  }
}

function driftStyleLabel(value: string | null | undefined): string | null {
  switch (value) {
    case "oubli":
      return "Oubli";
    case "repousse":
      return "Repousse";
    case "laisse_filer":
      return "Laisse filer";
    case "baisse_elan":
      return "Baisse d'élan";
    default:
      return null;
  }
}

function bridgePrefillsForContext(args: {
  selectedPotion: DemotivationRepairBridgePotion;
  prefill: DemotivationRepairLocalDispatcherOutput["potion_bridge"][
    "prefill_candidates"
  ];
  confidence: DemotivationRepairConfidence;
}): DemotivationRepairPotionBridgeContext["prefill_candidates"] {
  const p = args.prefill;
  if (args.selectedPotion === "clarte") {
    return {
      plan_meaning_loss_reason: bridgeCandidateObject({
        value: p.plan_meaning_loss_reason ?? null,
        confidence: args.confidence,
      }),
    };
  }
  if (args.selectedPotion === "courage") {
    return {
      avoidance_target: bridgeCandidateObject({
        value: p.avoidance_target ?? null,
        confidence: args.confidence,
      }),
      blocker_kind: bridgeCandidateObject({
        optionValue: p.blocker_kind ?? null,
        optionLabel: blockerKindLabel(p.blocker_kind),
        confidence: args.confidence,
      }),
    };
  }
  return {
    drift_target: bridgeCandidateObject({
      value: p.drift_target ?? null,
      confidence: args.confidence,
    }),
    drift_style: bridgeCandidateObject({
      optionValue: p.drift_style ?? null,
      optionLabel: driftStyleLabel(p.drift_style),
      confidence: args.confidence,
    }),
  };
}

function needKindForPotion(
  potion: DemotivationRepairBridgePotion,
): DemotivationRepairDurableNeedKind {
  if (potion === "clarte") return "meaning_reconnection";
  if (potion === "courage") return "courage_through_avoidance";
  return "anti_dropout_anchor";
}

function noteInformation(args: {
  output: DemotivationRepairLocalDispatcherOutput;
  selectedPotion: DemotivationRepairBridgePotion;
}): DemotivationRepairNoteInformation {
  const providedNote = args.output.potion_bridge.note_information;
  const providedStructuredContext = isRecord(providedNote?.structured_context)
    ? providedNote.structured_context
    : {};
  const structuredContext = {
    origin_flow: "demotivation_repair",
    selected_potion: args.selectedPotion,
    visible_potion_label: demotivationRepairVisiblePotionLabel(
      args.selectedPotion,
    ),
    repair_intent: args.output.repair_state.intent,
    motivation_state: args.output.repair_state.motivation_state,
    user_words: args.output.repair_state.user_words,
    durable_need: args.output.potion_bridge.durable_need,
    prefill_candidates: args.output.potion_bridge.prefill_candidates,
    instruction:
      "Utiliser cette note comme contexte pour remplir le JSON du sous-flow potion, sans faire répéter l'épisode de décrochage.",
    ...providedStructuredContext,
  };
  return {
    ...createNoteInformation({
      source_flow_id: "demotivation_repair",
      handoff_reason: "bridge",
      target_dispatcher: "select_state_potion",
      handoff_context_for_next_dispatcher:
        providedNote?.handoff_context_for_next_dispatcher ??
          JSON.stringify(structuredContext),
      user_words: providedNote?.user_words?.length
        ? providedNote.user_words
        : args.output.repair_state.user_words,
      structured_context: structuredContext,
      confidence: providedNote?.confidence,
    }),
    target_flow: "select_state_potion",
  };
}

function bridgeContext(args: {
  output: DemotivationRepairLocalDispatcherOutput;
  selectedPotion: DemotivationRepairBridgePotion;
  confidence: DemotivationRepairConfidence;
}): DemotivationRepairPotionBridgeContext {
  const needKind = args.output.potion_bridge.durable_need.kind ??
    needKindForPotion(args.selectedPotion);
  const note = noteInformation({
    output: args.output,
    selectedPotion: args.selectedPotion,
  });
  return {
    origin_flow: "demotivation_repair",
    origin_flow_status: args.confidence === "high"
      ? "bridge_consented"
      : "diagnosed",
    note_information: note,
    origin_turn_summary: args.output.repair_state.summary,
    repair_intent: args.output.repair_state.intent,
    motivation_state: args.output.repair_state.motivation_state,
    action_readiness: args.output.repair_state.action_readiness,
    demotivation_episode: {
      summary: args.output.repair_state.summary,
      user_words: args.output.repair_state.user_words,
      identity_freeze_risk: args.output.repair_state.identity_freeze_risk,
      already_diagnosed: args.output.repair_state.motivation_source_diagnosed,
    },
    durable_need: {
      kind: needKind,
      summary: args.output.potion_bridge.durable_need.summary ??
        args.output.potion_bridge.why_ready_or_blocked,
    },
    selected_potion: args.selectedPotion,
    visible_potion_label: demotivationRepairVisiblePotionLabel(
      args.selectedPotion,
    )!,
    selection_reason: args.output.potion_bridge.why_ready_or_blocked,
    prefill_candidates: bridgePrefillsForContext({
      selectedPotion: args.selectedPotion,
      prefill: args.output.potion_bridge.prefill_candidates,
      confidence: args.confidence,
    }),
    handoff_instruction_for_potion_subskill:
      "Use these as candidates, not forced locked values. Ask only for missing or low-confidence details. Do not ask the user to repeat the full demotivation episode.",
    no_chat_mutation: {
      potion_session_created: false,
      recurring_reminder_created: false,
      scheduled_checkin_created: false,
      executable_confirmation_generated: false,
    },
  };
}

function visibleKindForOutput(
  output: DemotivationRepairLocalDispatcherOutput,
  bridgeIsBlocked: boolean,
  offerIsPersistable = false,
  actionCardIsAllowed = false,
): DemotivationRepairVisibleTaskKind {
  if (output.flow_action === "safety_preempt") return "safety";
  if (
    output.flow_action === "cancel_flow" ||
    output.flow_action === "complete_flow" ||
    output.flow_action === "defer_flow"
  ) return "exit_or_cancel";
  if (
    output.flow_action === "get_info_product" ||
    output.flow_action === "get_info_db"
  ) return "inline_tool_return";
  if (output.flow_action === "apply_attempt") return "apply_attempt";
  if (output.flow_action === "repeat_last_repair") return "repeat_repair";
  if (output.flow_action === "ask_gentle_clarification") {
    return "ask_gentle_clarification";
  }
  if (output.flow_action === "confirm_potion_bridge" && !bridgeIsBlocked) {
    return "potion_bridge_handoff";
  }
  if (output.flow_action === "potion_bridge_offer" && offerIsPersistable) {
    return output.potion_bridge.candidate_potions.length > 1
      ? "potion_bridge_choice"
      : "potion_bridge_offer";
  }
  if (output.flow_action === "potion_bridge_offer") {
    return output.repair_state.phase === "diagnose"
      ? "ask_gentle_clarification"
      : output.repair_state.phase === "reduce_friction"
      ? "reduce_friction"
      : output.repair_state.phase === "stabilize_energy"
      ? "stabilize_energy"
      : "restore_meaning";
  }
  if (output.flow_action === "reduce_friction") return "reduce_friction";
  if (output.flow_action === "restore_meaning") return "restore_meaning";
  if (output.flow_action === "stabilize_energy") return "stabilize_energy";
  if (output.flow_action === "smaller_step") return "smaller_step";
  if (output.flow_action === "action_card_candidate" && actionCardIsAllowed) {
    return "action_card_candidate";
  }
  if (output.flow_action === "action_card_candidate") {
    return conversationalVisibleKindForRepairState(output);
  }
  return output.visible_task.kind;
}

function conversationalVisibleKindForRepairState(
  output: DemotivationRepairLocalDispatcherOutput,
): DemotivationRepairVisibleTaskKind {
  if (output.repair_state.phase === "diagnose") {
    return "ask_gentle_clarification";
  }
  if (output.repair_state.phase === "reduce_friction") return "reduce_friction";
  if (output.repair_state.phase === "stabilize_energy") {
    return "stabilize_energy";
  }
  if (output.repair_state.phase === "restore_meaning") return "restore_meaning";
  if (output.repair_state.phase === "action_card_ready") {
    if (
      output.repair_state.intent === "concrete_action_emerged" ||
      output.repair_state.intent === "asks_smaller_step"
    ) {
      return "smaller_step";
    }
    if (output.repair_state.motivation_state === "fatigue") {
      return "stabilize_energy";
    }
    if (
      output.repair_state.motivation_state === "avoidance" ||
      output.repair_state.motivation_state === "failure_accumulation"
    ) {
      return "reduce_friction";
    }
    return "restore_meaning";
  }
  return "restore_meaning";
}

function actionCardCandidateIsAllowed(args: {
  output: DemotivationRepairLocalDispatcherOutput;
  constraints: DemotivationRepairConstraint[];
}): boolean {
  if (args.output.flow_action !== "action_card_candidate") return false;
  if (args.constraints.includes("no_tool")) return false;
  if (!args.output.response_contract.allow_attack_card_suggestion) return false;
  if (!args.output.response_contract.allow_tool_suggestion) return false;
  if (args.output.repair_state.phase !== "action_card_ready") return false;
  if (
    args.output.repair_state.action_readiness !== "ready" &&
    args.output.repair_state.action_readiness !== "already_chosen"
  ) {
    return false;
  }
  return args.output.repair_state.intent === "concrete_action_emerged" ||
    args.output.repair_state.intent === "asks_smaller_step";
}

function conversationContextForVisibleTask(args: {
  output: DemotivationRepairLocalDispatcherOutput;
  visibleTaskKind: DemotivationRepairVisibleTaskKind;
  selectedPotion: DemotivationRepairBridgePotion | null;
  potionLabel: DemotivationRepairVisiblePotionLabel | null;
  bridgeContextSummary: string | null;
  constraints: DemotivationRepairConstraint[];
  evidence: string[];
}): DemotivationRepairConversationContext {
  const constraintSet = new Set(args.constraints);
  const durableNeed = args.output.potion_bridge.durable_need;
  const targetDispatcher =
    args.output.flow_action === "confirm_potion_bridge" &&
      args.selectedPotion
      ? "select_state_potion"
      : args.output.flow_action === "safety_preempt"
      ? "safety_crisis"
      : args.output.flow_action === "exit_to_global_dispatcher"
      ? "global"
      : args.output.flow_action === "get_info_product"
      ? "product_help"
      : args.output.flow_action === "get_info_db"
      ? "status_recap"
      : null;
  return {
    state_summary: args.output.repair_state.summary,
    user_words: args.output.repair_state.user_words,
    field_or_stage: args.visibleTaskKind,
    known_values: {
      intent: args.output.repair_state.intent,
      phase: args.output.repair_state.phase,
      motivation_state: args.output.repair_state.motivation_state,
      action_readiness: args.output.repair_state.action_readiness,
      identity_freeze_risk: args.output.repair_state.identity_freeze_risk,
      motivation_source_diagnosed:
        args.output.repair_state.motivation_source_diagnosed,
    },
    missing_or_weak_values: args.output.potion_bridge.missing_before_handoff,
    selected_candidate: {
      potion: args.selectedPotion,
      potion_label: args.potionLabel,
      durable_need_kind: durableNeed.kind,
      durable_need_summary: durableNeed.summary,
    },
    handoff_data: {
      bridge_context_summary: args.bridgeContextSummary,
      target_dispatcher: targetDispatcher,
      no_chat_mutation: true,
    },
    tone_constraints: [
      args.output.response_contract.tone,
      ...args.constraints,
    ].slice(0, 12),
    do_not_say: [
      "Ne mentionne pas dispatcher, JSON, reducer, trace ou target_flow.",
      "Ne promets aucune creation, activation, session potion, rappel ou ecriture DB.",
      "Ne traite jamais la demotivation comme de la paresse.",
      "Ne dis jamais Potion rappel.",
      args.output.flow_action === "action_card_candidate" &&
        args.visibleTaskKind !== "action_card_candidate"
        ? "Ne propose pas de carte ou de support produit dans ce message."
        : "",
      args.selectedPotion ? "" : "Ne propose pas de potion dans ce message.",
      constraintSet.has("no_potion") ? "Ne propose pas de potion." : "",
      constraintSet.has("no_tool") ? "Ne propose pas d'outil." : "",
      constraintSet.has("no_questions") ? "Ne pose pas de question." : "",
      constraintSet.has("no_plan_edit")
        ? "Ne propose pas de modification du plan."
        : "",
    ].filter(Boolean),
    context_summary: args.output.repair_state.summary,
    evidence_used: args.evidence,
    db_context_summary: stringValue(
      (args.output.visible_task.conversation_context as any)
        ?.db_context_summary,
    ),
    memory_context_summary: stringValue(
      (args.output.visible_task.conversation_context as any)
        ?.memory_context_summary,
    ),
    max_questions: maxQuestionsForVisibleTask({
      output: args.output,
      visibleTaskKind: args.visibleTaskKind,
      constraints: args.constraints,
    }),
  };
}

function maxQuestionsForVisibleTask(args: {
  output: DemotivationRepairLocalDispatcherOutput;
  visibleTaskKind: DemotivationRepairVisibleTaskKind;
  constraints: DemotivationRepairConstraint[];
}): 0 | 1 {
  if (args.constraints.includes("no_questions")) return 0;
  if (
    args.visibleTaskKind === "exit_or_cancel" ||
    args.visibleTaskKind === "safety" ||
    args.visibleTaskKind === "potion_bridge_handoff" ||
    args.visibleTaskKind === "inline_tool_return" ||
    args.visibleTaskKind === "apply_attempt" ||
    args.output.flow_action === "exit_to_global_dispatcher" ||
    args.output.flow_action === "cancel_flow" ||
    args.output.flow_action === "complete_flow" ||
    args.output.flow_action === "defer_flow" ||
    args.output.flow_action === "safety_preempt"
  ) {
    return 0;
  }
  if (
    args.visibleTaskKind === "ask_gentle_clarification" ||
    args.visibleTaskKind === "diagnose" ||
    (args.visibleTaskKind === "restore_meaning" &&
      args.output.potion_bridge.missing_before_handoff.length > 0)
  ) {
    return 1;
  }
  return args.output.response_contract.max_questions;
}

function transitionNoteInformation(args: {
  output: DemotivationRepairLocalDispatcherOutput;
  target: "global" | "safety" | "product_help" | "status_recap";
  reason:
    | "topic_change"
    | "safety"
    | "inline_tool"
    | "explicit_user_request";
  contextSummary?: string | null;
}): DemotivationRepairNoteInformation {
  const targetDispatcher = args.target === "safety"
    ? "safety_crisis"
    : args.target;
  const structuredContext = {
    origin_flow: "demotivation_repair",
    flow_action: args.output.flow_action,
    repair_intent: args.output.repair_state.intent,
    motivation_state: args.output.repair_state.motivation_state,
    action_readiness: args.output.repair_state.action_readiness,
    user_words: args.output.repair_state.user_words,
    unresolved_questions: args.output.potion_bridge.missing_before_handoff,
    evidence: args.output.evidence,
  };
  return {
    ...createNoteInformation({
      source_flow_id: "demotivation_repair",
      handoff_reason: args.reason,
      target_dispatcher: targetDispatcher,
      handoff_context_for_next_dispatcher: args.contextSummary ??
        JSON.stringify(structuredContext),
      user_words: args.output.repair_state.user_words,
      structured_context: structuredContext,
    }),
    target_flow: args.target === "safety" ? "safety" : args.target,
  };
}

export function readDemotivationRepairLocalState(
  activeState: unknown,
): DemotivationRepairLocalState | null {
  const root = isRecord(activeState) ? activeState : {};
  const working = isRecord(root.working_state) ? root.working_state : root;
  const state = working.demotivation_repair_local_state;
  if (!isRecord(state) || state.skill_id !== "demotivation_repair") {
    return null;
  }
  return state as DemotivationRepairLocalState;
}

export function reduceDemotivationRepairLocalDispatcherOutput(args: {
  previous: DemotivationRepairLocalState | null;
  output: DemotivationRepairLocalDispatcherOutput;
  explicit_constraints?: string[];
  turn_frame?: TurnFrame | null;
}): DemotivationRepairReducerResult {
  const safetyRisk = args.turn_frame?.safety?.risk_band ?? "none";
  if (
    safetyRisk === "high" ||
    safetyRisk === "critical" ||
    args.output.flow_action === "safety_preempt"
  ) {
    const visibleTask: DemotivationRepairVisibleTask = {
      ...args.output.visible_task,
      kind: "safety",
      conversation_context: conversationContextForVisibleTask({
        output: args.output,
        visibleTaskKind: "safety",
        selectedPotion: null,
        potionLabel: null,
        bridgeContextSummary: null,
        constraints: args.output.constraints,
        evidence: args.output.evidence,
      }),
    };
    const noteInformation = transitionNoteInformation({
      output: args.output,
      target: "safety",
      reason: "safety",
    });
    return {
      status: "safety",
      response_intent: "handoff_to_safety",
      local_state: null,
      visible_task: visibleTask,
      potion_bridge_context: null,
      note_information: noteInformation,
      exit_to_global_dispatcher: false,
      reason_code: "safety_preempt",
      constraints: args.output.constraints,
      blocked_effects: [{
        type: "demotivation_repair",
        reason_code: "safety_preempt",
      }],
      evidence: args.output.evidence,
    };
  }
  const constraints = constraintsWithInvariants({
    output: args.output,
    explicitConstraints: args.explicit_constraints ?? [],
  });
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
  const actionCardIsAllowed = actionCardCandidateIsAllowed({
    output: args.output,
    constraints,
  });
  const actionCardNotAllowed =
    args.output.flow_action === "action_card_candidate" && !actionCardIsAllowed;
  const visibleTaskKind = visibleKindForOutput(
    args.output,
    blocked,
    offerIsPersistable,
    actionCardIsAllowed,
  );
  const dispatcherBridgeContextSummary = args.output.visible_task
    .conversation_context.handoff_data.bridge_context_summary;
  const visibleTask: DemotivationRepairVisibleTask = {
    ...args.output.visible_task,
    kind: visibleTaskKind,
    conversation_context: conversationContextForVisibleTask({
      output: args.output,
      visibleTaskKind,
      selectedPotion: offerIsPersistable ||
          args.output.flow_action === "confirm_potion_bridge"
        ? selectedPotion
        : null,
      potionLabel: !(offerIsPersistable ||
          args.output.flow_action === "confirm_potion_bridge")
        ? null
        : demotivationRepairVisiblePotionLabel(selectedPotion),
      bridgeContextSummary: offerIsPersistable ||
          args.output.flow_action === "confirm_potion_bridge"
        ? dispatcherBridgeContextSummary ??
          args.output.potion_bridge.why_ready_or_blocked
        : null,
      constraints,
      evidence: args.output.evidence,
    }),
  };
  const now = new Date().toISOString();
  const turnCount = Number(args.previous?.turn_count ?? 0) + 1;

  if (args.output.flow_action === "exit_to_global_dispatcher") {
    const noteInformation = args.output.exit_memo.note_information ??
      transitionNoteInformation({
        output: args.output,
        target: "global",
        reason: "topic_change",
        contextSummary:
          args.output.exit_memo.handoff_hint_for_global_dispatcher,
      });
    return {
      status: "exit",
      response_intent: "exit_to_global_dispatcher",
      local_state: null,
      visible_task: visibleTask,
      potion_bridge_context: null,
      note_information: noteInformation,
      exit_to_global_dispatcher: true,
      reason_code: "demotivation_repair_exit_to_global_dispatcher",
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
      response_intent: args.output.flow_action === "cancel_flow"
        ? "cancelled"
        : "exit_to_global_dispatcher",
      local_state: null,
      visible_task: visibleTask,
      potion_bridge_context: null,
      note_information: null,
      exit_to_global_dispatcher: false,
      reason_code: args.output.flow_action === "cancel_flow"
        ? "demotivation_repair_cancelled"
        : "demotivation_repair_exit_to_global_dispatcher",
      constraints,
      blocked_effects: [],
      evidence: args.output.evidence,
    };
  }
  if (
    args.output.flow_action === "get_info_product" ||
    args.output.flow_action === "get_info_db"
  ) {
    const noteInformation = transitionNoteInformation({
      output: args.output,
      target: args.output.flow_action === "get_info_product"
        ? "product_help"
        : "status_recap",
      reason: "inline_tool",
      contextSummary:
        args.output.exit_memo.handoff_hint_for_global_dispatcher ??
          args.output.repair_state.summary,
    });
    return {
      status: "continue",
      response_intent: args.output.flow_action,
      local_state: {
        skill_id: "demotivation_repair",
        mode: "local_repair_flow",
        status: "active",
        repair_state: args.output.repair_state,
        last_visible_task: visibleTask.kind,
        last_potion_bridge_offer: args.previous?.last_potion_bridge_offer ??
          null,
        previous_repair_summary: args.output.repair_state.summary,
        turn_count: turnCount,
        max_turns: Number(args.previous?.max_turns ?? 6) || 6,
        created_at: args.previous?.created_at ?? now,
        updated_at: now,
      },
      visible_task: visibleTask,
      potion_bridge_context: null,
      note_information: noteInformation,
      exit_to_global_dispatcher: false,
      reason_code: args.output.flow_action === "get_info_product"
        ? "demotivation_repair_inline_product_help"
        : "demotivation_repair_inline_status_recap",
      constraints,
      blocked_effects: [],
      evidence: args.output.evidence,
    };
  }

  const confirmed = (
    args.output.flow_action === "confirm_potion_bridge" ||
    args.output.flow_action === "handoff_to_local_flow"
  ) &&
    args.output.potion_bridge.status === "confirmed_handoff" &&
    selectedPotion &&
    !blocked &&
    args.previous?.last_potion_bridge_offer?.selected_potion === selectedPotion;
  if (confirmed) {
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
          skill_id: "demotivation_repair",
          mode: "local_repair_flow",
          turn_count: 0,
          max_turns: 6,
          created_at: now,
        } as DemotivationRepairLocalState),
        status: "handoff_to_potion",
        repair_state: args.output.repair_state,
        last_visible_task: visibleTask.kind,
        previous_repair_summary: args.output.repair_state.summary,
        updated_at: now,
      },
      visible_task: visibleTask,
      potion_bridge_context: context,
      note_information: context.note_information,
      exit_to_global_dispatcher: false,
      reason_code: "demotivation_repair_handoff_to_select_state_potion",
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
      visible_potion_label: demotivationRepairVisiblePotionLabel(
        selectedPotion,
      )!,
      durable_need: offerContext!.durable_need,
      prefill_candidates: args.output.potion_bridge.prefill_candidates,
      selection_reason: args.output.potion_bridge.why_ready_or_blocked,
      offered_at_turn: turnCount,
      note_information: offerContext!.note_information,
    }
    : args.previous?.last_potion_bridge_offer ?? null;
  return {
    status: "continue",
    response_intent: args.output.repair_state.phase,
    local_state: {
      skill_id: "demotivation_repair",
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
    note_information: null,
    exit_to_global_dispatcher: false,
    reason_code: bridgeOfferNotPersistable
      ? "demotivation_repair_potion_bridge_blocked"
      : actionCardNotAllowed
      ? "demotivation_repair_action_card_candidate_blocked"
      : "demotivation_repair_local_continue",
    constraints,
    blocked_effects: [
      ...(bridgeOfferNotPersistable
        ? [{ type: "select_state_potion", reason_code: "bridge_not_mature" }]
        : []),
      ...(actionCardNotAllowed
        ? [{ type: "action_card", reason_code: "stage_not_mature" }]
        : []),
    ],
    evidence: args.output.evidence,
  };
}
