import { generateWithGemini, getGlobalAiModel } from "../../_shared/gemini.ts";
import type { NoteInformation } from "../contracts/note_information.v1.ts";
import {
  directEffectLocalDispatcherPromptLines,
  withDirectEffectLocalContext,
} from "../router/direct_effect_local_context.ts";
import type {
  ClarificationAmbiguityKind,
  ClarificationCandidateSignal,
  ClarificationConversationContext,
  ClarificationKnownReference,
  ClarificationLocalDispatcherOutput,
  ClarificationLocalFlowAction,
  ClarificationLocalState,
  ClarificationLocalStatus,
  ClarificationMissingDecision,
  ClarificationQuestionConstraints,
  ClarificationReferenceGuess,
  ClarificationVisibleTask,
  ClarificationVisibleTaskKind,
} from "./contract.ts";

export type ClarificationLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: ClarificationLocalState | null;
  clarification_id: string;
  source_dispatcher: "global" | "local";
  source_flow_id: string | null;
  ambiguity_kind: ClarificationAmbiguityKind;
  conflict_summary: string;
  candidate_signals: ClarificationCandidateSignal[];
  known_context: Record<string, unknown>;
  inbound_note_information?: NoteInformation | Record<string, unknown> | null;
};

export type ClarificationLocalLlmRunner = (input: {
  system_prompt: string;
  user_prompt: string;
  json_mode: true;
  model_name: string;
}) => Promise<unknown>;

export type ClarificationLocalDispatcher = (
  input: ClarificationLocalDispatcherInput,
) => Promise<ClarificationLocalDispatcherOutput | null>;

const FLOW_ACTIONS = new Set([
  "ask_disambiguation",
  "answer_clarification",
  "still_ambiguous",
  "resolved_to_candidate",
  "revise_understanding",
  "explain_candidate_options",
  "get_info_product",
  "get_info_db",
  "exit_to_global_dispatcher",
  "cancel_clarification",
  "exit_to_global_dispatcher",
  "safety_preempt",
]);

const LOCAL_STATUSES = new Set([
  "asking",
  "still_ambiguous",
  "resolved",
  "cancelled",
  "topic_change",
  "safety",
]);

const VISIBLE_TASKS = new Set([
  "ask_choice",
  "ask_target_reference",
  "confirm_candidate",
  "inline_info_return",
  "ask_disambiguation",
  "ask_simpler_choice",
  "still_ambiguous",
  "resolved_transition",
  "explain_options",
  "repeat_question",
  "stop_or_cancel",
  "exit_ack",
  "inline_tool_return",
  "safety",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown, max = 1000): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max).trimEnd() : text;
}

function nullableString(value: unknown, max = 1000): string | null {
  const text = stringValue(value, max);
  return text ? text : null;
}

function stringArray(value: unknown, max = 8): string[] {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item, 320)).filter(Boolean).slice(0, max)
    : [];
}

function ambiguityAxes(value: unknown, fallback: ClarificationAmbiguityKind) {
  const allowed = new Set([
    "intent",
    "target",
    "scope",
    "surface",
    "timing",
    "confirmation",
    "handoff_readiness",
  ]);
  const axes = Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter((item) => allowed.has(item))
    : [];
  return axes.length ? axes as ClarificationAmbiguityKind[] : [fallback];
}

function objectValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function enumValue<T extends string>(
  value: unknown,
  allowed: Set<string>,
  fallback: T,
): T {
  const text = stringValue(value);
  return allowed.has(text) ? text as T : fallback;
}

function confidence(value: unknown): "low" | "medium" | "high" {
  const text = stringValue(value);
  return text === "high" || text === "medium" || text === "low" ? text : "low";
}

function riskScore(value: unknown): number {
  const score = Number(value ?? 0);
  return Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
}

function normalizeSignal(
  raw: unknown,
  fallback: ClarificationCandidateSignal | null,
): ClarificationCandidateSignal | null {
  const root = isRecord(raw) ? raw : {};
  const candidateId = stringValue(root.candidate_id ?? fallback?.candidate_id);
  const label = stringValue(root.label ?? fallback?.label);
  const targetDispatcher = stringValue(
    root.target_dispatcher ?? fallback?.target_dispatcher ?? candidateId,
  );
  if (!candidateId || !label || !targetDispatcher) return null;
  const rawConfidence = stringValue(root.confidence ?? fallback?.confidence);
  return {
    candidate_id: candidateId,
    label,
    target_dispatcher: targetDispatcher,
    operation_type: nullableString(
      root.operation_type ?? fallback?.operation_type,
    ),
    surface_id: nullableString(root.surface_id ?? fallback?.surface_id),
    confidence: rawConfidence === "high" ? "high" : "medium",
    why_plausible: stringValue(
      root.why_plausible ?? fallback?.why_plausible ??
        "Signal candidat structure fourni.",
      360,
    ),
    structured_payload_hint: objectValue(
      root.structured_payload_hint ?? fallback?.structured_payload_hint,
    ),
  };
}

function normalizeSignals(
  raw: unknown,
  fallback: ClarificationCandidateSignal[],
): ClarificationCandidateSignal[] {
  const byId = new Map(fallback.map((signal) => [signal.candidate_id, signal]));
  const source = Array.isArray(raw) ? raw : fallback;
  return source.flatMap((item) => {
    const id = isRecord(item) ? stringValue(item.candidate_id) : "";
    const signal = normalizeSignal(item, byId.get(id) ?? null);
    return signal ? [signal] : [];
  }).slice(0, 8);
}

function defaultVisibleTask(args: {
  kind: ClarificationVisibleTaskKind;
  conflict_summary: string;
  candidate_signals: ClarificationCandidateSignal[];
  selected_candidate_id?: string | null;
  question?: string | null;
  user_words?: string[];
}): ClarificationVisibleTask {
  const selected =
    args.candidate_signals.find((candidate) =>
      candidate.candidate_id === args.selected_candidate_id
    ) ?? null;
  const conversationContext: ClarificationConversationContext = {
    question_goal: args.kind === "ask_target_reference"
      ? "Identifier la reference exacte visee par le user."
      : args.kind === "confirm_candidate"
      ? "Confirmer l'hypothese la plus utile."
      : "Clarifier la direction utile avec une seule question.",
    conflict_summary: args.conflict_summary,
    candidate_labels: args.candidate_signals.map((candidate) =>
      candidate.label
    ),
    selected_candidate_label: selected?.label ?? null,
    known_references: [],
    best_reference_guess: null,
    missing_decision: null,
    question_constraints: {
      max_questions: 1,
      should_confirm_guess: args.kind === "confirm_candidate",
      should_offer_options: args.kind === "ask_choice" ||
        args.kind === "ask_disambiguation",
      must_not_list_all_references: true,
      must_not_explain_internals: true,
    },
    question: args.question ?? null,
    user_words: args.user_words ?? [],
    evidence_used: [],
    do_not_say: [
      "dispatcher",
      "signal",
      "candidate_id",
      "JSON",
      "note_information",
    ],
    tone_constraints: ["whatsapp", "court", "tutoiement"],
  };
  return {
    kind: args.kind,
    conversation_context: conversationContext,
  };
}

function visibleKind(value: unknown, fallback: ClarificationVisibleTaskKind) {
  const raw = stringValue(value);
  if (raw === "ask_disambiguation" || raw === "ask_simpler_choice") {
    return "ask_choice";
  }
  if (raw === "inline_tool_return") return "inline_info_return";
  return enumValue(raw, VISIBLE_TASKS, fallback);
}

function knownReference(raw: unknown): ClarificationKnownReference | null {
  const root = isRecord(raw) ? raw : {};
  const label = stringValue(root.label ?? root.title ?? root.name, 240);
  if (!label) return null;
  const type = stringValue(root.type, 80);
  const allowedTypes = new Set([
    "active_plan_item",
    "attack_card",
    "defense_card",
    "recurring_reminder",
    "product_concept",
    "unknown",
  ]);
  return {
    type: allowedTypes.has(type)
      ? type as ClarificationKnownReference["type"]
      : "unknown",
    id: nullableString(root.id, 160) ?? undefined,
    label,
    status: nullableString(root.status, 80) ?? undefined,
    why_relevant: nullableString(root.why_relevant, 320) ?? undefined,
  };
}

function knownReferences(value: unknown): ClarificationKnownReference[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
      const ref = knownReference(item);
      return ref ? [ref] : [];
    }).slice(0, 8)
    : [];
}

function referenceGuess(raw: unknown): ClarificationReferenceGuess | null {
  const root = isRecord(raw) ? raw : {};
  const label = stringValue(root.label ?? root.title ?? root.name, 240);
  if (!label) return null;
  const rawConfidence = stringValue(root.confidence);
  return {
    type: stringValue(root.type, 80) || "unknown",
    id: nullableString(root.id, 160) ?? undefined,
    label,
    confidence: rawConfidence === "high" || rawConfidence === "medium" ||
        rawConfidence === "low"
      ? rawConfidence
      : "low",
    evidence: stringArray(root.evidence, 6),
  };
}

function missingDecision(raw: unknown): ClarificationMissingDecision | null {
  const root = isRecord(raw) ? raw : {};
  const kind = stringValue(root.kind);
  const allowed = new Set([
    "choose_direction",
    "identify_target",
    "confirm_target",
    "understand_product_concept",
    "answer_db_status",
    "confirm_handoff",
  ]);
  const description = stringValue(root.description, 360);
  if (!allowed.has(kind) || !description) return null;
  return { kind: kind as ClarificationMissingDecision["kind"], description };
}

function questionConstraints(raw: unknown): ClarificationQuestionConstraints {
  const root = isRecord(raw) ? raw : {};
  return {
    max_questions: 1,
    should_confirm_guess: root.should_confirm_guess === true,
    should_offer_options: root.should_offer_options !== false,
    must_not_list_all_references: root.must_not_list_all_references !== false,
    must_not_explain_internals: true,
  };
}

function normalizeVisibleTask(
  raw: unknown,
  fallback: ClarificationVisibleTask,
): ClarificationVisibleTask {
  const root = isRecord(raw) ? raw : {};
  const data = isRecord(root.conversation_context)
    ? root.conversation_context
    : {};
  const context: ClarificationConversationContext = {
    question_goal: stringValue(
      data.question_goal ?? fallback.conversation_context.question_goal,
      320,
    ),
    conflict_summary: stringValue(
      data.conflict_summary ?? fallback.conversation_context.conflict_summary,
      500,
    ),
    candidate_labels: stringArray(data.candidate_labels).length
      ? stringArray(data.candidate_labels)
      : fallback.conversation_context.candidate_labels,
    selected_candidate_label: nullableString(
      data.selected_candidate_label ??
        fallback.conversation_context.selected_candidate_label,
    ),
    known_references: knownReferences(data.known_references).length
      ? knownReferences(data.known_references)
      : fallback.conversation_context.known_references,
    best_reference_guess: referenceGuess(data.best_reference_guess) ??
      fallback.conversation_context.best_reference_guess,
    missing_decision: missingDecision(data.missing_decision) ??
      fallback.conversation_context.missing_decision,
    question_constraints: questionConstraints(
      data.question_constraints ??
        fallback.conversation_context.question_constraints,
    ),
    question: nullableString(
      data.question ?? fallback.conversation_context.question,
    ),
    user_words: stringArray(data.user_words).length
      ? stringArray(data.user_words)
      : fallback.conversation_context.user_words,
    evidence_used: stringArray(data.evidence_used).length
      ? stringArray(data.evidence_used)
      : fallback.conversation_context.evidence_used,
    do_not_say: stringArray(data.do_not_say).length
      ? stringArray(data.do_not_say)
      : fallback.conversation_context.do_not_say,
    tone_constraints: stringArray(data.tone_constraints).length
      ? stringArray(data.tone_constraints)
      : fallback.conversation_context.tone_constraints,
  };
  return {
    kind: visibleKind(root.kind, fallback.kind),
    conversation_context: context,
  };
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) return raw;
  const text = String(raw ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("clarification_local_dispatcher_missing_json");
  }
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!isRecord(parsed)) {
    throw new Error("clarification_local_dispatcher_not_object");
  }
  return parsed;
}

function visibleKindForAction(
  action: ClarificationLocalFlowAction,
): ClarificationVisibleTaskKind {
  switch (action) {
    case "resolved_to_candidate":
      return "resolved_transition";
    case "still_ambiguous":
    case "answer_clarification":
      return "still_ambiguous";
    case "revise_understanding":
      return "repeat_question";
    case "explain_candidate_options":
      return "explain_options";
    case "get_info_product":
    case "get_info_db":
      return "inline_info_return";
    case "exit_to_global_dispatcher":
    case "cancel_clarification":
      return "stop_or_cancel";
    case "exit_to_global_dispatcher":
      return "exit_ack";
    case "safety_preempt":
      return "safety";
    case "ask_disambiguation":
    default:
      return "ask_choice";
  }
}

function inlineInfoKind(value: unknown): "product" | "db" | null {
  const text = stringValue(value);
  if (text === "product" || text === "get_info_product") return "product";
  if (text === "db" || text === "get_info_db") return "db";
  return null;
}

function inlineObjectTypes(value: unknown) {
  const allowed = new Set([
    "attack_card",
    "defense_card",
    "recurring_reminder",
    "plan_item",
  ]);
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter((item) => allowed.has(item))
      .slice(0, 6) as Array<
        "attack_card" | "defense_card" | "recurring_reminder" | "plan_item"
      >
    : [];
}

export function normalizeClarificationLocalDispatcherOutput(args: {
  raw: unknown;
  input: ClarificationLocalDispatcherInput;
}): ClarificationLocalDispatcherOutput {
  const root = parseJsonObject(args.raw);
  const action: ClarificationLocalFlowAction = enumValue<
    ClarificationLocalFlowAction
  >(
    root.flow_action,
    FLOW_ACTIONS,
    "still_ambiguous",
  );
  const stateRoot = isRecord(root.clarification_state)
    ? root.clarification_state
    : {};
  const signals = normalizeSignals(
    stateRoot.candidate_signals,
    args.input.candidate_signals,
  );
  const selectedCandidateId = nullableString(
    stateRoot.selected_candidate_id ?? root.selected_candidate_id,
    160,
  );
  const userWords = stringArray(stateRoot.user_words).length
    ? stringArray(stateRoot.user_words)
    : [args.input.user_message].filter(Boolean);
  const fallbackVisible = defaultVisibleTask({
    kind: visibleKindForAction(action),
    conflict_summary: stringValue(
      stateRoot.conflict_summary ?? args.input.conflict_summary,
      500,
    ),
    candidate_signals: signals,
    selected_candidate_id: selectedCandidateId,
    question: nullableString(root.question),
    user_words: userWords,
  });
  const inlineRoot = isRecord(root.inline_info) ? root.inline_info : {};
  const inlineKind = action === "get_info_product"
    ? "product"
    : action === "get_info_db"
    ? "db"
    : inlineInfoKind(
      inlineRoot.kind ?? inlineRoot.tool_name,
    );
  const noteRoot = isRecord(root.note_information) ? root.note_information : {};
  return {
    flow_action: action,
    confidence: confidence(root.confidence),
    risk_score: riskScore(root.risk_score),
    clarification_state: {
      clarification_id: stringValue(
        stateRoot.clarification_id ?? args.input.clarification_id,
        160,
      ),
      status: enumValue(
        stateRoot.status,
        LOCAL_STATUSES,
        action === "resolved_to_candidate"
          ? "resolved"
          : action === "cancel_clarification"
          ? "cancelled"
          : action === "exit_to_global_dispatcher"
          ? "topic_change"
          : action === "safety_preempt"
          ? "safety"
          : action === "still_ambiguous"
          ? "still_ambiguous"
          : "asking",
      ),
      source_dispatcher: enumValue(
        stateRoot.source_dispatcher,
        new Set(["global", "local"]),
        args.input.source_dispatcher,
      ),
      source_flow_id: nullableString(
        stateRoot.source_flow_id ?? args.input.source_flow_id,
      ),
      ambiguity_kind: stringValue(
        stateRoot.ambiguity_kind ?? args.input.ambiguity_kind,
      ) as ClarificationAmbiguityKind,
      ambiguity_axes: ambiguityAxes(
        stateRoot.ambiguity_axes,
        stringValue(
          stateRoot.ambiguity_kind ?? args.input.ambiguity_kind,
        ) as ClarificationAmbiguityKind,
      ),
      conflict_summary: fallbackVisible.conversation_context.conflict_summary,
      candidate_signals: signals,
      selected_candidate_id: selectedCandidateId,
      selected_candidate_label: nullableString(
        stateRoot.selected_candidate_label,
      ),
      why_selected_or_not: stringValue(
        stateRoot.why_selected_or_not ?? root.reasoning_summary,
        500,
      ),
      user_words: userWords,
      turn_count: Math.max(
        0,
        Number(
          stateRoot.turn_count ?? args.input.active_state?.turn_count ?? 0,
        ) ||
          0,
      ),
    },
    inline_info: {
      requested: inlineRoot.requested === true ||
        action === "get_info_product" ||
        action === "get_info_db",
      kind: inlineKind,
      question_to_answer: nullableString(inlineRoot.question_to_answer),
      resume_clarification_goal: nullableString(
        inlineRoot.resume_clarification_goal ??
          inlineRoot.active_flow_context,
        500,
      ),
      object_types: inlineObjectTypes(inlineRoot.object_types),
    },
    visible_task: normalizeVisibleTask(root.visible_task, fallbackVisible),
    note_information: {
      needed: noteRoot.needed === true ||
        [
          "resolved_to_candidate",
          "exit_to_global_dispatcher",
          "safety_preempt",
          "get_info_product",
          "get_info_db",
        ].includes(action),
      source_flow_id: "clarification",
      handoff_reason: enumValue(
        noteRoot.handoff_reason,
        new Set([
          "clarification_resolved",
          "topic_change",
          "safety",
          "inline_tool",
          "none",
        ]),
        action === "resolved_to_candidate"
          ? "clarification_resolved"
          : action === "exit_to_global_dispatcher"
          ? "topic_change"
          : action === "safety_preempt"
          ? "safety"
          : action === "get_info_product" || action === "get_info_db"
          ? "inline_tool"
          : "none",
      ),
      target_dispatcher: nullableString(noteRoot.target_dispatcher),
      handoff_context_for_next_dispatcher: nullableString(
        noteRoot.handoff_context_for_next_dispatcher,
        1200,
      ),
      user_words: stringArray(noteRoot.user_words, 3),
      structured_context: objectValue(noteRoot.structured_context),
      confidence: confidence(noteRoot.confidence),
    },
    evidence: stringArray(root.evidence),
  };
}

function fallbackDispatcherOutput(
  input: ClarificationLocalDispatcherInput,
): ClarificationLocalDispatcherOutput {
  const labels = input.candidate_signals.map((candidate) => candidate.label)
    .filter(Boolean);
  const fallbackQuestion = labels.length >= 2
    ? `Tu veux plutôt ${labels[0]}, ou ${labels[1]} ?`
    : "Tu peux préciser ce que tu veux choisir ?";
  return normalizeClarificationLocalDispatcherOutput({
    input,
    raw: {
      flow_action: "ask_disambiguation",
      confidence: "low",
      risk_score: 0,
      clarification_state: {
        clarification_id: input.clarification_id,
        status: "asking",
        source_dispatcher: input.source_dispatcher,
        source_flow_id: input.source_flow_id,
        ambiguity_kind: input.ambiguity_kind,
        conflict_summary: input.conflict_summary,
        candidate_signals: input.candidate_signals,
        selected_candidate_id: null,
        selected_candidate_label: null,
        why_selected_or_not: "clarification_local_dispatcher_fallback",
        user_words: [input.user_message].filter(Boolean),
        turn_count: input.active_state?.turn_count ?? 0,
      },
      visible_task: {
        kind: "ask_disambiguation",
        conversation_context: {
          conflict_summary: input.conflict_summary,
          candidate_labels: input.candidate_signals.map((candidate) =>
            candidate.label
          ),
          selected_candidate_label: null,
          question: fallbackQuestion,
          user_words: [input.user_message].filter(Boolean),
        },
      },
      note_information: {
        needed: false,
        handoff_reason: "none",
        target_dispatcher: null,
      },
      evidence: ["clarification_local_dispatcher_fallback"],
    },
  });
}

export function localDispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local structure du flow clarification.",
    "Tu ne reponds jamais directement au user.",
    "Tu retournes uniquement un JSON strict conforme au contrat.",
    "Tu n'es pas le dispatcher global ni un dispatcher metier cible.",
    "Tu arbitres seulement entre les candidate_signals fournis.",
    "Tu peux selectionner seulement un candidate_id present dans candidate_signals.",
    "Tu ne dois jamais inventer une nouvelle route, operation, candidat ou flow depuis le message brut.",
    "Utilise db_context_pack pour comprendre les references possibles: actions actives, cartes, rappels. Ce contexte aide la clarification, il ne decide pas a ta place.",
    "micro_memory_context n'est pas charge par defaut pour clarification: n'invente aucune memoire absente.",
    "Safety preempt gagne sur tout.",
    "resolved_to_candidate exige une confiance medium ou high et un selected_candidate_id fourni.",
    "Si confidence=low, ne resous pas.",
    "Pour ask_disambiguation ou still_ambiguous, prepare une visible_task avec une seule question.",
    "visible_task.conversation_context est le seul contrat vers l'agent visible: remplis question_goal, known_references, best_reference_guess, missing_decision, evidence_used, do_not_say, tone_constraints et question_constraints avec les infos utiles pour poser une question ciblee.",
    "conversation_context doit etre filtre: pas de dump DB brut, pas de memoire brute, pas d'id technique inutile au message visible.",
    "Si le user demande une explication produit ou une difference conceptuelle, utilise explain_candidate_options si les candidats suffisent, sinon get_info_product avec inline_info.kind=product.",
    "Si le user demande ce qui existe chez lui, quel objet est actif, ou une info DB/status, utilise get_info_db avec inline_info.kind=db.",
    "Produis note_information pour resolved_to_candidate, exit_to_global_dispatcher, safety_preempt, get_info_product et get_info_db.",
    "",
    "Field Completion Rules",
    ...directEffectLocalDispatcherPromptLines(),
    "- flow_action: decision principale du tour courant. Choisis seulement une action du contrat clarification. Utilise ask_disambiguation pour poser la premiere question ciblee, still_ambiguous si la reponse ne suffit pas, answer_clarification si tu reponds a une demande de clarification sans changer d'owner, revise_understanding si le user corrige le cadrage, explain_candidate_options si les candidats fournis suffisent a expliquer les options, resolved_to_candidate si un candidat fourni est choisi avec confiance medium/high, get_info_product ou get_info_db pour un roundtrip inline, exit_to_global_dispatcher si le user veut arreter la clarification ou apporte un nouveau sujet clair, cancel_clarification seulement pour une annulation locale de l'objet de clarification, safety_preempt pour safety reelle. Ne te base pas seulement sur l'etat precedent.",
    "- confidence: high si l'intention et la cible sont claires; medium si la direction est probable mais encore incomplete; low si la clarification reste necessaire ou si une resolution serait prudente. Si confidence=low, flow_action ne doit pas etre resolved_to_candidate.",
    "- risk_score: nombre 0..10 lie au risque du tour. Garde 0 ou faible pour une simple ambiguite. N'invente pas de safety; si le message contient une safety reelle, utilise safety_preempt et un score coherent.",
    "- clarification_state.clarification_id: recopie l'id du flow actif. Ne cree pas un nouvel id.",
    "- clarification_state.status: asking pour une question locale, still_ambiguous si la reponse ne tranche pas, resolved si selected_candidate_id est valide, cancelled pour exit_to_global_dispatcher/cancel_clarification, topic_change pour exit_to_global_dispatcher, safety pour safety_preempt.",
    "- clarification_state.source_dispatcher et source_flow_id: conserve l'origine recue. Ne les remplace pas par la cible choisie.",
    "- clarification_state.ambiguity_kind et ambiguity_axes: decris les axes utiles au conflit courant (intent, target, scope, surface, timing, confirmation, handoff_readiness). N'ajoute pas d'axe decoratif.",
    "- clarification_state.conflict_summary: resume le conflit produit en une phrase exploitable. Il doit aider le reducer et le prochain dispatcher, pas expliquer les internals au user.",
    "- clarification_state.candidate_signals: conserve la liste fermee fournie en entree. Tu peux reformuler why_plausible seulement si cela preserve le sens; n'ajoute jamais un candidat.",
    "- clarification_state.selected_candidate_id et selected_candidate_label: remplis seulement pour resolved_to_candidate avec un candidate_id present dans candidate_signals. Sinon mets null.",
    "- clarification_state.why_selected_or_not: explique brievement la decision structuree, y compris pourquoi tu ne selectionnes pas encore. Pas de raisonnement long.",
    "- clarification_state.user_words: extraits courts des mots du user qui ont vraiment servi. Ne mets pas tout l'historique.",
    "- clarification_state.turn_count: conserve le compteur observe; ne l'utilise pas pour forcer un exit si le message veut continuer.",
    "- inline_info.requested: true seulement pour get_info_product ou get_info_db. false pour les autres actions.",
    "- inline_info.kind: product pour explication produit/concept Sophia; db pour statut ou objets existants du user; null quand requested=false.",
    "- inline_info.question_to_answer: question compacte a donner au flow inline. null hors inline.",
    "- inline_info.resume_clarification_goal: but a reprendre apres le roundtrip inline. null hors inline.",
    "- inline_info.object_types: renseigne seulement les familles DB utiles au statut demande (attack_card, defense_card, recurring_reminder, plan_item). Laisse vide si non utile.",
    "- visible_task.kind: stage visible exact. ask_choice pour choix entre directions, ask_target_reference pour identifier une reference, confirm_candidate pour confirmer une hypothese, still_ambiguous ou ask_simpler_choice si la reponse ne suffit pas, explain_options pour expliquer les options, repeat_question pour revision/repetition, resolved_transition pour resolution, inline_info_return pour inline, stop_or_cancel pour stop/cancel, exit_ack pour exit global, safety pour safety.",
    "- visible_task.conversation_context: seul contexte autorise pour l'agent visible. Il ne doit contenir ni DB brute, ni micro-memoire brute, ni note_information brute, ni ids techniques inutiles.",
    "- conversation_context.question_goal: objectif visible du prochain message en une phrase. Il doit dire ce que l'agent visible doit obtenir ou expliquer.",
    "- conversation_context.conflict_summary: version visible-safe du conflit. Pas de jargon dispatcher.",
    "- conversation_context.candidate_labels: labels humains des candidats utiles. Ne liste pas tous les objets DB si question_constraints.must_not_list_all_references=true.",
    "- conversation_context.selected_candidate_label: label choisi uniquement si confirmation ou resolution. null sinon.",
    "- conversation_context.known_references: objets compacts vraiment utiles depuis db_context_pack (actions actives, cartes, rappels, concepts). Pas de dump.",
    "- conversation_context.best_reference_guess: meilleure hypothese si elle aide a poser une question ciblee; null si trop faible.",
    "- conversation_context.missing_decision: decision encore manquante (choisir direction, identifier cible, confirmer cible, comprendre concept, repondre DB/status, confirmer handoff). null si aucune.",
    "- conversation_context.question_constraints: max_questions doit rester 1; should_confirm_guess=true si une hypothese doit etre confirmee; should_offer_options=true si un choix court aide; must_not_list_all_references=true par defaut; must_not_explain_internals=true toujours.",
    "- conversation_context.question: question proposee si utile, courte et en tutoiement. null pour resolved_transition, exit_ack, safety ou stop sans question.",
    "- conversation_context.user_words et evidence_used: mots et indices semantiques reellement utilises. Pas de pseudo-preuves.",
    "- conversation_context.do_not_say: termes a ne pas exposer (dispatcher, signal, candidate_id, JSON, note_information, internals).",
    "- conversation_context.tone_constraints: inclure whatsapp, court, tutoiement; ajouter une contrainte seulement si elle vient du contexte.",
    "- note_information.needed: true pour tout changement d'owner ou roundtrip inline: resolved_to_candidate, exit_to_global_dispatcher, safety_preempt, get_info_product, get_info_db. false pour continuation locale et cancel_clarification sans changement de dispatcher.",
    "- note_information.source_flow_id: toujours clarification.",
    "- note_information.handoff_reason: clarification_resolved, topic_change, safety, inline_tool ou none selon flow_action.",
    "- note_information.target_dispatcher: dispatcher cible seulement si needed=true; global pour exit, safety_crisis pour safety, product_help/status_recap pour inline, target_dispatcher du candidat pour resolution. null sinon.",
    "- note_information.handoff_context_for_next_dispatcher: contexte exploitable par le dispatcher cible. Jamais un message visible.",
    "- note_information.user_words: 1 a 3 fragments courts du message courant qui justifient le handoff; [] seulement si aucun mot user disponible.",
    "- note_information.structured_context: obligatoire et non vide si needed=true. Inclure candidate_signals, contexte compact utile, selected_candidate_payload_hint, evidence, questions non resolues et recommended_next_focus. Ne transmets pas de DB brute. Ne mets jamais source_flow_presentation, source_flow_state_summary, target_local_dispatcher_hint, risk_score ou no_chat_mutation dans la note.",
    "- evidence: indices courts et reels qui justifient la decision. Vide seulement si aucun indice fiable.",
    "",
    "Transition Rules",
    "- exit_to_global_dispatcher: le user veut arreter la clarification ou apporte un nouveau sujet clair. note_information obligatoire vers global; visible_task.kind=exit_ack.",
    "- cancel_clarification: le user annule explicitement l'objet de clarification sans changement de dispatcher. visible_task.kind=stop_or_cancel, note_information.needed=false.",
    "- safety_preempt: safety reelle prioritaire. note_information obligatoire vers safety_crisis; le dispatcher global normal ne reprend pas.",
    "- resolved_to_candidate: selectionne seulement un candidat existant, note_information obligatoire vers son target_dispatcher. Clarification ne lance pas l'action cible.",
    "- get_info_product/get_info_db: roundtrip inline temporaire avec note_information; le parent clarification doit pouvoir reprendre ensuite.",
    "",
    "JSON Examples - structured decisions only, never visible templates",
    "Example 1 - normal continuation (not visible)",
    JSON.stringify({
      flow_action: "ask_disambiguation",
      confidence: "low",
      risk_score: 0,
      clarification_state: {
        clarification_id: "clar-123",
        status: "asking",
        source_dispatcher: "global",
        source_flow_id: null,
        ambiguity_kind: "intent",
        ambiguity_axes: ["intent", "target"],
        conflict_summary:
          "Hesitation entre expliquer une carte et preparer une carte d'attaque.",
        candidate_signals: [],
        selected_candidate_id: null,
        selected_candidate_label: null,
        why_selected_or_not: "Le user n'a pas encore choisi la direction.",
        user_words: ["je parle de la carte"],
        turn_count: 0,
      },
      inline_info: {
        requested: false,
        kind: null,
        question_to_answer: null,
        resume_clarification_goal: null,
        object_types: [],
      },
      visible_task: {
        kind: "ask_target_reference",
        conversation_context: {
          question_goal: "Identifier la carte ou la direction visee.",
          conflict_summary: "Deux directions restent possibles.",
          candidate_labels: ["expliquer la carte", "preparer une attaque"],
          selected_candidate_label: null,
          known_references: [],
          best_reference_guess: null,
          missing_decision: {
            kind: "identify_target",
            description: "La carte visee n'est pas claire.",
          },
          question_constraints: {
            max_questions: 1,
            should_confirm_guess: false,
            should_offer_options: true,
            must_not_list_all_references: true,
            must_not_explain_internals: true,
          },
          question: "Tu parles de quelle carte exactement ?",
          user_words: ["je parle de la carte"],
          evidence_used: ["reference incomplete"],
          do_not_say: ["dispatcher", "candidate_id", "note_information"],
          tone_constraints: ["whatsapp", "court", "tutoiement"],
        },
      },
      note_information: {
        needed: false,
        source_flow_id: "clarification",
        handoff_reason: "none",
        target_dispatcher: null,
        handoff_context_for_next_dispatcher: null,
        user_words: ["je parle de la carte"],
        structured_context: {},
      },
      evidence: ["reference incomplete"],
    }),
    "Example 2 - safety transition (not visible)",
    JSON.stringify({
      flow_action: "safety_preempt",
      confidence: "high",
      risk_score: 8,
      clarification_state: {
        clarification_id: "clar-123",
        status: "safety",
        source_dispatcher: "global",
        source_flow_id: null,
        ambiguity_kind: "intent",
        ambiguity_axes: ["intent"],
        conflict_summary: "La clarification est interrompue par un risque.",
        candidate_signals: [],
        selected_candidate_id: null,
        selected_candidate_label: null,
        why_selected_or_not: "Le signal safety prime sur le choix.",
        user_words: ["je vais me faire du mal"],
        turn_count: 1,
      },
      inline_info: {
        requested: false,
        kind: null,
        question_to_answer: null,
        resume_clarification_goal: null,
        object_types: [],
      },
      visible_task: {
        kind: "safety",
        conversation_context: {
          question_goal: "Basculer vers le flow safety.",
          conflict_summary: "Safety prioritaire.",
          candidate_labels: [],
          selected_candidate_label: null,
          known_references: [],
          best_reference_guess: null,
          missing_decision: null,
          question_constraints: {
            max_questions: 1,
            should_confirm_guess: false,
            should_offer_options: false,
            must_not_list_all_references: true,
            must_not_explain_internals: true,
          },
          question: null,
          user_words: ["je vais me faire du mal"],
          evidence_used: ["menace auto-dommage"],
          do_not_say: ["dispatcher", "candidate_id", "note_information"],
          tone_constraints: ["whatsapp", "court", "tutoiement"],
        },
      },
      note_information: {
        needed: true,
        source_flow_id: "clarification",
        handoff_reason: "safety",
        target_dispatcher: "safety_crisis",
        handoff_context_for_next_dispatcher:
          "Traiter le risque courant avant toute clarification.",
        user_words: ["je vais me faire du mal"],
        structured_context: {
          user_message_summary: "menace auto-dommage",
          active_flow_summary: "Clarification interrompue par safety.",
          evidence: ["menace auto-dommage"],
          unresolved_questions: [],
          recommended_next_focus: "safety_crisis",
        },
        confidence: "high",
      },
      evidence: ["menace auto-dommage"],
    }),
    "Retourne uniquement le JSON.",
  ].join("\n");
}

export async function runClarificationLocalDispatcher(args: {
  input: ClarificationLocalDispatcherInput;
  llmRunner?: ClarificationLocalLlmRunner;
  modelName?: string;
}): Promise<ClarificationLocalDispatcherOutput | null> {
  const dbContextPack = args.input.known_context.db_context_pack ??
    args.input.known_context.clarification_context_pack ?? null;
  const userPrompt = JSON.stringify({
    task: "dispatch_clarification_local_flow",
    current_user_message: args.input.user_message,
    recent_messages: args.input.recent_messages,
    active_flow_state: args.input.active_state,
    note_information_inbound: args.input.inbound_note_information ?? null,
    db_context_pack: dbContextPack,
    micro_memory_context: {
      items: [],
      exclusions: ["clarification_micro_memory_not_loaded_by_default"],
      budget: {
        max_items: 0,
        reason:
          "Clarification utilise le db_context_pack dynamique; pas de micro-memoire par defaut.",
      },
    },
    platform_context: withDirectEffectLocalContext(
      {},
      (dbContextPack as any)?.plan_snapshot ?? dbContextPack,
    ),
    risk_context: {},
    available_inline_tools: ["get_info_product", "get_info_db"],
    parent_flow_context: {
      clarification_id: args.input.clarification_id,
      source_dispatcher: args.input.source_dispatcher,
      source_flow_id: args.input.source_flow_id,
      ambiguity_kind: args.input.ambiguity_kind,
      conflict_summary: args.input.conflict_summary,
    },
    candidate_signals: args.input.candidate_signals,
    candidates: args.input.candidate_signals.map((candidate) => ({
      id: candidate.candidate_id,
      label: candidate.label,
      description: candidate.why_plausible,
      operation_type: candidate.operation_type,
      surface_id: candidate.surface_id,
    })),
    required_json_shape: {
      flow_action:
        "ask_disambiguation|answer_clarification|still_ambiguous|resolved_to_candidate|revise_understanding|explain_candidate_options|get_info_product|get_info_db|exit_to_global_dispatcher|cancel_clarification|safety_preempt",
      confidence: "low|medium|high",
      risk_score: "number 0..10",
      clarification_state: {
        clarification_id: "string",
        status: "asking|still_ambiguous|resolved|cancelled|topic_change|safety",
        source_dispatcher: "global|local",
        source_flow_id: "string|null",
        ambiguity_kind:
          "intent|target|scope|surface|timing|confirmation|handoff_readiness",
        ambiguity_axes: [
          "intent|target|scope|surface|timing|confirmation|handoff_readiness",
        ],
        conflict_summary: "string",
        candidate_signals: "same closed candidate_signals list",
        selected_candidate_id: "string|null",
        selected_candidate_label: "string|null",
        why_selected_or_not: "string",
        user_words: ["string"],
        turn_count: "number",
      },
      inline_info: {
        requested: false,
        kind: "product|db|null",
        question_to_answer: "string|null",
        resume_clarification_goal: "string|null",
        object_types: ["attack_card|defense_card|recurring_reminder|plan_item"],
      },
      visible_task: {
        kind:
          "ask_choice|ask_target_reference|confirm_candidate|still_ambiguous|resolved_transition|explain_options|repeat_question|stop_or_cancel|exit_ack|inline_info_return|safety",
        conversation_context: {
          question_goal: "string",
          conflict_summary: "string",
          candidate_labels: ["string"],
          selected_candidate_label: "string|null",
          known_references: [{
            type:
              "active_plan_item|attack_card|defense_card|recurring_reminder|product_concept|unknown",
            id: "string|null",
            label: "string",
            status: "string|null",
            why_relevant: "string|null",
          }],
          best_reference_guess: {
            type: "string",
            id: "string|null",
            label: "string",
            confidence: "low|medium|high",
            evidence: ["string"],
          },
          missing_decision: {
            kind:
              "choose_direction|identify_target|confirm_target|understand_product_concept|answer_db_status|confirm_handoff",
            description: "string",
          },
          question_constraints: {
            max_questions: 1,
            should_confirm_guess: "boolean",
            should_offer_options: "boolean",
            must_not_list_all_references: "boolean",
            must_not_explain_internals: true,
          },
          question: "string|null",
          user_words: ["string"],
          evidence_used: ["string"],
          do_not_say: ["string"],
          tone_constraints: ["whatsapp|court|tutoiement"],
        },
      },
      note_information: {
        needed: false,
        source_flow_id: "clarification",
        handoff_reason:
          "clarification_resolved|topic_change|safety|inline_tool|none",
        target_dispatcher: "string|null",
        handoff_context_for_next_dispatcher: "string|null",
        user_words: ["string"],
        structured_context: {},
        confidence: "low|medium|high",
      },
      evidence: ["string"],
    },
  });
  try {
    const raw = args.llmRunner
      ? await args.llmRunner({
        system_prompt: localDispatcherSystemPrompt(),
        user_prompt: userPrompt,
        json_mode: true,
        model_name: args.modelName ?? "gemini-2.5-flash",
      })
      : await generateWithGemini(
        localDispatcherSystemPrompt(),
        userPrompt,
        0.2,
        true,
        [],
        "auto",
        {
          requestId: args.input.request_id ?? undefined,
          userId: args.input.user_id,
          model: getGlobalAiModel(args.modelName ?? "gemini-2.5-flash"),
          source: "clarification.local_dispatcher",
          forceRealAi: true,
          reasoningEffort: "low",
          httpTimeoutMs: 45_000,
          maxRetries: 1,
        },
      );
    return normalizeClarificationLocalDispatcherOutput({
      raw,
      input: args.input,
    });
  } catch (error) {
    console.warn("[Clarification] local dispatcher failed", {
      request_id: args.input.request_id ?? null,
      error,
    });
    return fallbackDispatcherOutput(args.input);
  }
}
