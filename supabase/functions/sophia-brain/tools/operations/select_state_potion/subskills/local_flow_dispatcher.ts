import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../../_shared/gemini.ts";
import type { RouteDecision } from "../../../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../../../contracts/turn_frame.v1.ts";
import type { SelectStatePotionRiskAssessment } from "../contract.ts";
import type { StatePotionHandoffState } from "../state.ts";

export type SelectStatePotionFlowAction =
  | "continue_routing"
  | "field_answer"
  | "field_confirmation"
  | "revise_collected_field"
  | "platform_destination_followup"
  | "apply_attempt"
  | "repeat_handoff"
  | "stop_local_no_handoff"
  | "handoff_to_local_flow"
  | "cancel_flow"
  | "exit_to_global_dispatcher"
  | "safety_preempt"
  | "unclear";

export type SelectStatePotionFlowStage =
  | "state_routing"
  | "potion_choice"
  | "detail_intake"
  | "handoff_ready"
  | "handoff_delivered"
  | "global_dispatcher";

export type SelectStatePotionLocalFlowDecision = {
  flow_action: SelectStatePotionFlowAction;
  confidence: "low" | "medium" | "high";
  target_stage: SelectStatePotionFlowStage;
  slot_interpretation: {
    answers_current_field: boolean;
    confirms_proposed_field: boolean;
    corrects_existing_field: boolean;
    asks_platform_destination: boolean;
    asks_chat_creation: boolean;
    gives_future_field_candidates: boolean;
  };
  field_pointer: {
    likely_field_id: string | null;
    raw_user_text: string | null;
    relation_to_field:
      | "current_field"
      | "collected_field"
      | "future_field"
      | "unknown"
      | "not_applicable";
    needs_specialized_interpretation: boolean;
  };
  revision_pointer: {
    candidate_field_ids: string[];
    raw_revision_text: string | null;
    revision_intent:
      | "replace"
      | "append"
      | "refine"
      | "unknown"
      | "not_applicable";
  };
  exit_memo_request: {
    needed: boolean;
    exit_reason:
      | "topic_change"
      | "explicit_interrupt"
      | "cancelled"
      | "safety"
      | "none";
    handoff_hint_for_global_dispatcher: string | null;
  };
  risk_assessment: SelectStatePotionRiskAssessment;
  evidence: string[];
};

export type SelectStatePotionLocalFlowDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: StatePotionHandoffState;
  route_decision: RouteDecision | null;
  turn_frame: TurnFrame | null;
};

export type SelectStatePotionLocalFlowDispatcher = (
  input: SelectStatePotionLocalFlowDispatcherInput,
) => Promise<SelectStatePotionLocalFlowDecision | null>;

function emptyDecision(
  flowAction: SelectStatePotionFlowAction,
  confidence: "low" | "medium" | "high",
  targetStage: SelectStatePotionFlowStage,
  evidence: string[],
): SelectStatePotionLocalFlowDecision {
  return {
    flow_action: flowAction,
    confidence,
    target_stage: targetStage,
    slot_interpretation: {
      answers_current_field: flowAction === "field_answer",
      confirms_proposed_field: flowAction === "field_confirmation",
      corrects_existing_field: flowAction === "revise_collected_field",
      asks_platform_destination: flowAction === "platform_destination_followup",
      asks_chat_creation: flowAction === "apply_attempt",
      gives_future_field_candidates: false,
    },
    field_pointer: {
      likely_field_id: null,
      raw_user_text: null,
      relation_to_field: flowAction === "field_answer"
        ? "current_field"
        : "not_applicable",
      needs_specialized_interpretation: flowAction === "field_answer",
    },
    revision_pointer: {
      candidate_field_ids: [],
      raw_revision_text: null,
      revision_intent: flowAction === "revise_collected_field"
        ? "unknown"
        : "not_applicable",
    },
    exit_memo_request: {
      needed: flowAction === "exit_to_global_dispatcher" ||
        flowAction === "handoff_to_local_flow" ||
        flowAction === "cancel_flow" || flowAction === "safety_preempt",
      exit_reason: flowAction === "cancel_flow"
        ? "cancelled"
        : flowAction === "safety_preempt"
        ? "safety"
        : flowAction === "exit_to_global_dispatcher" ||
            flowAction === "handoff_to_local_flow"
        ? "topic_change"
        : "none",
      handoff_hint_for_global_dispatcher: null,
    },
    risk_assessment: {
      risk_score: flowAction === "safety_preempt" ? 10 : 0,
      risk_band: flowAction === "safety_preempt" ? "critical" : "none",
      safety_preempt: flowAction === "safety_preempt",
      reason_codes: flowAction === "safety_preempt"
        ? ["local_flow_safety_preempt"]
        : [],
    },
    evidence,
  };
}

function flowActionFromStructuredIntent(
  value: string,
): SelectStatePotionFlowAction | null {
  switch (value) {
    case "handoff_apply_attempt":
    case "apply_attempt":
      return "apply_attempt";
    case "repeat_handoff":
      return "repeat_handoff";
    case "platform_destination_followup":
      return "platform_destination_followup";
    case "field_confirmation":
      return "field_confirmation";
    case "field_answer":
      return "field_answer";
    case "revise_handoff":
    case "revise_collected_field":
      return "revise_collected_field";
    case "cancel_handoff":
    case "stop_local_no_handoff":
      return "stop_local_no_handoff";
    case "handoff_to_local_flow":
      return "handoff_to_local_flow";
    case "cancel_flow":
      return "cancel_flow";
    case "topic_change":
    case "exit_to_global_dispatcher":
      return "exit_to_global_dispatcher";
    case "safety_preempt":
      return "safety_preempt";
    default:
      return null;
  }
}

function activeStateHasPendingFieldProposal(
  state: StatePotionHandoffState,
): boolean {
  if (state.phase !== "detail_intake") return false;
  return (state.intake_state?.details.fields ?? []).some((field) =>
    field.status === "proposed" && field.needs_user_confirmation === true
  );
}

function structuredDecision(
  input: SelectStatePotionLocalFlowDispatcherInput,
): SelectStatePotionLocalFlowDecision | null {
  if (
    String((input.route_decision as any)?.reason_code ?? "").trim() ===
      "active_select_state_potion_local_dispatcher"
  ) {
    return null;
  }
  const hasPendingFieldProposal = activeStateHasPendingFieldProposal(
    input.active_state,
  );
  const arbitrationIntent = String(
    (input.route_decision as any)?.active_flow_arbitration
      ?.continuation_intent ?? "",
  ).trim();
  const fromArbitration = flowActionFromStructuredIntent(arbitrationIntent);
  if (fromArbitration) {
    if (
      hasPendingFieldProposal &&
      fromArbitration === "apply_attempt"
    ) return null;
    return emptyDecision(
      fromArbitration,
      "high",
      fromArbitration === "exit_to_global_dispatcher" ||
          fromArbitration === "handoff_to_local_flow"
        ? "global_dispatcher"
        : input.active_state.status === "handoff_delivered"
        ? "handoff_delivered"
        : "detail_intake",
      [`active_flow_arbitration:${arbitrationIntent}`],
    );
  }

  const activeHandoffAction = input.turn_frame?.active_handoff_action;
  const actionType = String(activeHandoffAction?.type ?? "").trim();
  const fromTurnFrame = flowActionFromStructuredIntent(actionType);
  if (fromTurnFrame && activeHandoffAction?.confidence !== "low") {
    if (
      hasPendingFieldProposal &&
      fromTurnFrame === "apply_attempt"
    ) return null;
    return emptyDecision(
      fromTurnFrame,
      activeHandoffAction?.confidence === "medium" ? "medium" : "high",
      fromTurnFrame === "exit_to_global_dispatcher" ||
          fromTurnFrame === "handoff_to_local_flow"
        ? "global_dispatcher"
        : input.active_state.status === "handoff_delivered"
        ? "handoff_delivered"
        : "detail_intake",
      [`turn_frame.active_handoff_action:${actionType}`],
    );
  }

  const confirmation = input.turn_frame?.confirmation_response;
  if (confirmation?.kind === "yes" && confirmation.confidence_band !== "low") {
    if (hasPendingFieldProposal) {
      return emptyDecision("field_confirmation", "high", "detail_intake", [
        "turn_frame.confirmation_response:yes_for_pending_field",
      ]);
    }
    return emptyDecision("apply_attempt", "high", "handoff_delivered", [
      "turn_frame.confirmation_response:yes",
    ]);
  }
  if (
    confirmation?.kind === "correction_to_pending" &&
    confirmation.confidence_band !== "low"
  ) {
    return emptyDecision("revise_collected_field", "high", "detail_intake", [
      "turn_frame.confirmation_response:correction_to_pending",
    ]);
  }
  if (confirmation?.kind === "no" && confirmation.confidence_band !== "low") {
    return emptyDecision("stop_local_no_handoff", "high", "detail_intake", [
      "turn_frame.confirmation_response:no",
    ]);
  }

  const reasonCode = String(input.route_decision?.reason_code ?? "").trim();
  const reasonAction = flowActionFromStructuredIntent(reasonCode);
  if (reasonAction) {
    return emptyDecision(
      reasonAction,
      "high",
      reasonAction === "exit_to_global_dispatcher" ||
          reasonAction === "handoff_to_local_flow"
        ? "global_dispatcher"
        : input.active_state.status === "handoff_delivered"
        ? "handoff_delivered"
        : "detail_intake",
      [`route_decision.reason_code:${reasonCode}`],
    );
  }
  const reasonCodeAliases: Record<string, SelectStatePotionFlowAction> = {
    active_handoff_repeat_handoff: "repeat_handoff",
    active_handoff_platform_destination_followup:
      "platform_destination_followup",
    product_help_followup_continues_active_handoff:
      "platform_destination_followup",
    active_handoff_field_confirmation: "field_confirmation",
    active_handoff_apply_attempt: "apply_attempt",
    confirmation_yes_is_handoff_apply_attempt: "apply_attempt",
    platform_handoff_apply_attempt: "apply_attempt",
    correction_to_pending_revises_active_handoff: "revise_collected_field",
    same_operation_signal_continues_active_handoff: "revise_collected_field",
  };
  const aliasAction = reasonCodeAliases[reasonCode];
  if (aliasAction) {
    if (
      hasPendingFieldProposal &&
      aliasAction === "apply_attempt"
    ) return null;
    return emptyDecision(
      aliasAction,
      "high",
      aliasAction === "exit_to_global_dispatcher" ||
          aliasAction === "handoff_to_local_flow"
        ? "global_dispatcher"
        : input.active_state.status === "handoff_delivered"
        ? "handoff_delivered"
        : "detail_intake",
      [`route_decision.reason_code:${reasonCode}`],
    );
  }

  return null;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 6)
    : [];
}

function riskAssessment(value: unknown): SelectStatePotionRiskAssessment {
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
    ? root.risk_band as SelectStatePotionRiskAssessment["risk_band"]
    : "none";
  return {
    risk_score: Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0,
    risk_band: band,
    safety_preempt: root.safety_preempt === true,
    reason_codes: stringArray(root.reason_codes),
  };
}

function normalizeDecision(raw: unknown): SelectStatePotionLocalFlowDecision {
  const root = typeof raw === "string" ? JSON.parse(raw) : raw as any;
  const flowAction = flowActionFromStructuredIntent(
    String(root?.flow_action ?? "").trim(),
  ) ?? "unclear";
  const targetStage = [
      "state_routing",
      "potion_choice",
      "detail_intake",
      "handoff_ready",
      "handoff_delivered",
      "global_dispatcher",
    ].includes(String(root?.target_stage ?? ""))
    ? String(root.target_stage) as SelectStatePotionFlowStage
    : "detail_intake";
  const confidence = root?.confidence === "high" || root?.confidence === "low"
    ? root.confidence
    : "medium";
  return {
    ...emptyDecision(
      flowAction,
      confidence,
      targetStage,
      stringArray(root?.evidence),
    ),
    slot_interpretation: {
      answers_current_field: booleanValue(
        root?.slot_interpretation?.answers_current_field,
      ),
      confirms_proposed_field: booleanValue(
        root?.slot_interpretation?.confirms_proposed_field,
      ),
      corrects_existing_field: booleanValue(
        root?.slot_interpretation?.corrects_existing_field,
      ),
      asks_platform_destination: booleanValue(
        root?.slot_interpretation?.asks_platform_destination,
      ),
      asks_chat_creation: booleanValue(
        root?.slot_interpretation?.asks_chat_creation,
      ),
      gives_future_field_candidates: booleanValue(
        root?.slot_interpretation?.gives_future_field_candidates,
      ),
    },
    field_pointer: {
      likely_field_id:
        String(root?.field_pointer?.likely_field_id ?? "").trim() || null,
      raw_user_text: String(root?.field_pointer?.raw_user_text ?? "").trim() ||
        null,
      relation_to_field: [
          "current_field",
          "collected_field",
          "future_field",
          "unknown",
          "not_applicable",
        ].includes(String(root?.field_pointer?.relation_to_field ?? ""))
        ? root.field_pointer.relation_to_field
        : "unknown",
      needs_specialized_interpretation: root?.field_pointer
        ?.needs_specialized_interpretation !== false,
    },
    revision_pointer: {
      candidate_field_ids: stringArray(
        root?.revision_pointer?.candidate_field_ids,
      ),
      raw_revision_text:
        String(root?.revision_pointer?.raw_revision_text ?? "").trim() || null,
      revision_intent: [
          "replace",
          "append",
          "refine",
          "unknown",
          "not_applicable",
        ].includes(String(root?.revision_pointer?.revision_intent ?? ""))
        ? root.revision_pointer.revision_intent
        : "unknown",
    },
    exit_memo_request: {
      needed: booleanValue(root?.exit_memo_request?.needed),
      exit_reason: [
          "topic_change",
          "explicit_interrupt",
          "cancelled",
          "safety",
          "none",
        ].includes(String(root?.exit_memo_request?.exit_reason ?? ""))
        ? root.exit_memo_request.exit_reason
        : "none",
      handoff_hint_for_global_dispatcher: String(
        root?.exit_memo_request?.handoff_hint_for_global_dispatcher ?? "",
      ).trim() || null,
    },
    risk_assessment: riskAssessment(root?.risk_assessment),
    evidence: stringArray(root?.evidence),
  };
}

export async function runSelectStatePotionLocalFlowDispatcher(
  input: SelectStatePotionLocalFlowDispatcherInput,
): Promise<SelectStatePotionLocalFlowDecision | null> {
  const structured = structuredDecision(input);
  if (structured) return structured;

  const systemPrompt = [
    "Tu es le dispatcher local du flow select_state_potion.",
    "Tu ne reponds jamais directement au user.",
    "Tu ne choisis pas une route globale sauf si le user sort clairement du flow.",
    "Tu analyses uniquement ce que le message utilisateur fait au flow potion actif.",
    "Aucune regex, aucun mot-cle metier: raisonne depuis le message, l'etat du flow, le champ courant, les champs collectes et les derniers messages.",
    "Le chat ne lance jamais de potion.",
    "Si le user demande de creer/lancer/activer la potion depuis le chat, retourne apply_attempt.",
    "Si le user demande ou la lancer, retourne platform_destination_followup.",
    "Si le user corrige une valeur deja collectee, retourne revise_collected_field.",
    "Si le user confirme une proposition de champ encore en attente, retourne field_confirmation.",
    "Si le user repond au champ courant, retourne field_answer.",
    "Si le user donne aussi des informations pour des champs futurs, signale gives_future_field_candidates, sans les verrouiller.",
    "Si le user veut seulement arrêter ou laisser tomber la potion sans nouveau sujet clair, retourne stop_local_no_handoff.",
    "Si le user annule explicitement l'objet potion en cours, retourne cancel_flow.",
    "Si le user demande explicitement un autre flow local, retourne handoff_to_local_flow avec exit_memo_request.needed=true.",
    "Si le user change clairement de sujet, retourne exit_to_global_dispatcher avec exit_memo_request.needed=true.",
    "Si safety est present, retourne safety_preempt.",
    "Renseigne toujours risk_assessment. Si safety_preempt, risk_assessment.safety_preempt=true et risk_score eleve.",
    "Tu ne produis pas la valeur plateforme finale d'un champ.",
    "",
    "Field Completion Rules:",
    "- flow_action: decision principale du tour courant. Continue le flow avec field_answer, field_confirmation, revise_collected_field, platform_destination_followup, apply_attempt ou repeat_handoff quand le message reste lie a la potion active. Utilise stop_local_no_handoff quand le user arrete sans nouveau sujet; cancel_flow quand il annule l'objet potion; exit_to_global_dispatcher seulement pour un nouveau sujet clair; handoff_to_local_flow seulement si un autre flow local est explicitement vise; safety_preempt pour safety reelle. Ne choisis pas depuis l'etat precedent seul.",
    "- confidence: high si l'intention du tour est claire; medium si elle est probable mais partielle; low si le flow doit clarifier ou si plusieurs lectures restent possibles.",
    "- target_stage: stage du flow apres cette decision. Garde detail_intake pour une reponse de champ, potion_choice si le choix potion reste actif, handoff_delivered pour repeat/apply/destination apres handoff, global_dispatcher uniquement avec exit_to_global_dispatcher.",
    "- slot_interpretation: booleans semantiques utilises par le reducer pour savoir si le message repond, confirme, corrige, demande la destination, demande une creation chat, ou donne aussi des candidats futurs. Mets false quand le signal n'est pas present; ne marque pas plusieurs booleans par simple precaution.",
    "- field_pointer: pointe seulement le champ concerne par le message. raw_user_text reprend les mots utiles du user, pas un resume invente. relation_to_field vaut current_field, collected_field, future_field, unknown ou not_applicable selon l'etat reel. needs_specialized_interpretation=true quand le sous-dispatcher doit interpreter la valeur.",
    "- revision_pointer: rempli seulement pour une correction/revision explicite. candidate_field_ids reste vide sans champ plausible; raw_revision_text reste null sans correction; revision_intent vaut replace, append, refine, unknown ou not_applicable.",
    "- exit_memo_request: required pour exit_to_global_dispatcher, handoff_to_local_flow, cancel_flow et safety_preempt. Le reducer construira la note_information; ici fournis seulement le besoin, la raison et un hint exploitable. Pour stop_local_no_handoff, needed=false: pas de dispatcher global sur le meme tour.",
    "- risk_assessment/risk_score: score 0..10 lie au risque du tour. N'invente pas de safety; si safety est reelle, safety_preempt=true, risk_score eleve, reason_codes courts et evidence associee.",
    "- evidence: indices semantiques reels qui justifient la decision. Pas de pseudo-preuves, pas de copie longue, pas de mention d'un mot-cle isole sans contexte.",
    "",
    "Transition Rules:",
    "- stop_local_no_handoff: arret local simple, pas de note global, pas de reprise du dispatcher global.",
    "- exit_to_global_dispatcher: nouveau sujet clair, exit_memo_request.needed=true pour que le reducer cree la note_information.",
    "- safety_preempt: risque prioritaire, exit_memo_request.needed=true avec exit_reason=safety pour handoff safety.",
    "- handoff_to_local_flow: seulement si le user vise explicitement un autre flow local; fournir un hint exploitable.",
    "",
    "Exemples JSON non visibles (2 seulement):",
    JSON.stringify({
      flow_action: "field_answer",
      confidence: "high",
      target_stage: "detail_intake",
      slot_interpretation: {
        answers_current_field: true,
        confirms_proposed_field: false,
        corrects_existing_field: false,
        asks_platform_destination: false,
        asks_chat_creation: false,
        gives_future_field_candidates: false,
      },
      field_pointer: {
        likely_field_id: "love_state",
        raw_user_text: "je me parle tres durement",
        relation_to_field: "current_field",
        needs_specialized_interpretation: true,
      },
      revision_pointer: {
        candidate_field_ids: [],
        raw_revision_text: null,
        revision_intent: "not_applicable",
      },
      exit_memo_request: {
        needed: false,
        exit_reason: "none",
        handoff_hint_for_global_dispatcher: null,
      },
      risk_assessment: {
        risk_score: 0,
        risk_band: "none",
        safety_preempt: false,
        reason_codes: [],
      },
      evidence: ["reponse au champ courant"],
    }),
    JSON.stringify({
      flow_action: "exit_to_global_dispatcher",
      confidence: "high",
      target_stage: "global_dispatcher",
      slot_interpretation: {
        answers_current_field: false,
        confirms_proposed_field: false,
        corrects_existing_field: false,
        asks_platform_destination: false,
        asks_chat_creation: false,
        gives_future_field_candidates: false,
      },
      field_pointer: {
        likely_field_id: null,
        raw_user_text: null,
        relation_to_field: "not_applicable",
        needs_specialized_interpretation: false,
      },
      revision_pointer: {
        candidate_field_ids: [],
        raw_revision_text: null,
        revision_intent: "not_applicable",
      },
      exit_memo_request: {
        needed: true,
        exit_reason: "topic_change",
        handoff_hint_for_global_dispatcher:
          "Le user quitte la potion pour une demande de rappel ponctuel.",
      },
      risk_assessment: {
        risk_score: 0,
        risk_band: "none",
        safety_preempt: false,
        reason_codes: [],
      },
      evidence: ["nouvelle demande hors potion"],
    }),
  ].join("\n");

  const userPrompt = JSON.stringify({
    task: "dispatch_active_select_state_potion_flow",
    required_json_shape: {
      flow_action:
        "continue_routing|field_answer|field_confirmation|revise_collected_field|platform_destination_followup|apply_attempt|repeat_handoff|stop_local_no_handoff|handoff_to_local_flow|cancel_flow|exit_to_global_dispatcher|safety_preempt|unclear",
      confidence: "low|medium|high",
      target_stage:
        "state_routing|potion_choice|detail_intake|handoff_ready|handoff_delivered|global_dispatcher",
      slot_interpretation: {
        answers_current_field: true,
        confirms_proposed_field: false,
        corrects_existing_field: false,
        asks_platform_destination: false,
        asks_chat_creation: false,
        gives_future_field_candidates: false,
      },
      field_pointer: {
        likely_field_id: "string|null",
        raw_user_text: "string|null",
        relation_to_field:
          "current_field|collected_field|future_field|unknown|not_applicable",
        needs_specialized_interpretation: true,
      },
      revision_pointer: {
        candidate_field_ids: ["string"],
        raw_revision_text: "string|null",
        revision_intent: "replace|append|refine|unknown|not_applicable",
      },
      exit_memo_request: {
        needed: true,
        exit_reason: "topic_change|explicit_interrupt|cancelled|safety|none",
        handoff_hint_for_global_dispatcher: "string|null",
      },
      risk_assessment: {
        risk_score: "number 0..10",
        risk_band: "none|low|medium|high|critical",
        safety_preempt: false,
        reason_codes: ["string"],
      },
      evidence: ["string"],
    },
    current_user_message: input.user_message,
    recent_messages: input.recent_messages,
    active_state: input.active_state,
    route_decision: input.route_decision,
    turn_frame: input.turn_frame,
  });

  try {
    const raw = await generateWithGemini(
      systemPrompt,
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "select_state_potion.local_flow_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalizeDecision(raw);
  } catch (error) {
    console.warn("[SelectStatePotion] local flow dispatcher failed", error);
    return null;
  }
}
