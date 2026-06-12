import {
  createNoteInformation,
  type NoteInformation,
  type NoteInformationHandoffReason,
  type NoteInformationTargetDispatcher,
} from "../../../contracts/note_information.v1.ts";
import type {
  ClarteHandoffState,
  ClarteVisibleTaskKind,
  StatePotionConversationContext,
  StatePotionHandoffDraft,
  StatePotionSubskillHandoffState,
  StatePotionSubskillVisibleTaskKind,
  StatePotionVisibleFieldContext,
} from "./contract.ts";

const DO_NOT_SAY = [
  "ne dis jamais que la potion est activée",
  "ne dis jamais que la potion est lancée",
  "ne dis jamais que Sophia a créé une session potion",
  "ne demande jamais de dire oui pour lancer depuis le chat",
  "ne montre pas les ids techniques, reason_code, evidence ou slots",
];

function fieldValue(field: {
  option_label?: string | null;
  locked_value?: string | null;
  candidate_value?: string | null;
}): string | null {
  return field.option_label ?? field.locked_value ?? field.candidate_value ??
    null;
}

function missingReason(field: StatePotionVisibleFieldContext): string | null {
  if (field.status !== "locked") return "champ plateforme pas encore verrouillé";
  if (
    field.detail_sufficiency?.status === "needs_more_detail" &&
    field.detail_sufficiency.followup_answered !== true
  ) {
    return field.detail_sufficiency.reason ??
      "valeur copiable mais pas encore assez précise";
  }
  return null;
}

function knownValues(fields: StatePotionVisibleFieldContext[]) {
  return Object.fromEntries(
    fields
      .filter((field) => field.status === "locked" && field.value)
      .map((field) => [field.field_id, field.value as string]),
  );
}

function missingValues(fields: StatePotionVisibleFieldContext[]) {
  return fields.flatMap((field) => {
    const reason = missingReason(field);
    return reason
      ? [{
        field_id: field.field_id,
        field_label: field.field_label,
        reason,
        followup_question: field.detail_sufficiency?.followup_question ?? null,
      }]
      : [];
  });
}

function contextSummary(args: {
  potionName: string | null;
  visibleTask: string;
  fields: StatePotionVisibleFieldContext[];
}): string {
  const known = args.fields
    .filter((field) => field.status === "locked" && field.value)
    .map((field) => `${field.field_label}: ${field.value}`)
    .join(" ; ");
  return [
    args.potionName ? `${args.potionName}` : "Potion d'état",
    `tache visible=${args.visibleTask}`,
    known ? `champs verrouillés=${known}` : "aucun champ verrouillé",
  ].join(" | ");
}

function fieldsFromDraft(
  draft: StatePotionHandoffDraft | null | undefined,
): StatePotionVisibleFieldContext[] {
  return (draft?.recommendation.platform_inputs?.answers ?? []).map(
    (answer) => ({
      field_id: answer.question_id,
      field_label: answer.question_label,
      status: "locked" as const,
      value: answer.option_label ?? answer.value,
      candidate_value: null,
      locked_value: answer.value,
      option_value: answer.option_value ?? null,
      option_label: answer.option_label ?? null,
      needs_user_confirmation: false,
      detail_sufficiency: null,
    }),
  );
}

export function buildPotionSubskillConversationContext(args: {
  state: StatePotionSubskillHandoffState | null | undefined;
  visibleTask: StatePotionSubskillVisibleTaskKind;
  draft?: StatePotionHandoffDraft | null;
  userMessage?: string | null;
  evidence?: string[];
}): StatePotionConversationContext {
  const stateFields = args.state
    ? args.state.field_order.map((fieldId) => {
      const field = args.state!.field_states[fieldId];
      return {
        field_id: field.field_id,
        field_label: field.field_label,
        status: field.status,
        value: fieldValue(field),
        candidate_value: field.candidate_value,
        locked_value: field.locked_value,
        option_value: field.option_value,
        option_label: field.option_label,
        needs_user_confirmation: field.needs_user_confirmation,
        detail_sufficiency: field.detail_sufficiency,
      };
    })
    : fieldsFromDraft(args.draft);
  const potionName = args.state?.potion_name ??
    args.draft?.recommendation.potion_label ?? null;
  const platformDestination = args.state?.platform_destination ??
    args.draft?.recommendation.platform_destination ?? "section État / Potions";
  return {
    state_summary: contextSummary({
      potionName,
      visibleTask: args.visibleTask,
      fields: stateFields,
    }),
    user_words: args.userMessage ? [args.userMessage] : [],
    field_or_stage: args.state?.current_field_id ?? args.visibleTask,
    known_values: knownValues(stateFields),
    missing_or_weak_values: missingValues(stateFields),
    selected_candidate: {
      potion_type: args.state?.selected_potion ?? null,
      potion_name: potionName,
    },
    handoff_data: {
      potion_name: potionName,
      platform_destination: platformDestination,
      fields: stateFields,
    },
    tone_constraints: [
      "répondre naturellement",
      "rester court",
      "une seule question si le stage demande une question",
    ],
    do_not_say: DO_NOT_SAY,
    context_summary: args.state?.origin_bridge_context
      ? "Contexte entrant issu d'une note d'information; ne pas demander de répéter tout l'épisode."
      : null,
    evidence_used: args.evidence ?? [],
  };
}

export function buildClarteConversationContext(args: {
  state: ClarteHandoffState | null | undefined;
  visibleTask: ClarteVisibleTaskKind;
  draft?: StatePotionHandoffDraft | null;
  userMessage?: string | null;
  evidence?: string[];
}): StatePotionConversationContext {
  if (!args.state) {
    return buildPotionSubskillConversationContext({
      state: null,
      visibleTask: args.visibleTask === "destination_short"
        ? "destination_short"
        : args.visibleTask,
      draft: args.draft,
      userMessage: args.userMessage,
      evidence: args.evidence,
    });
  }
  const field = args.state.field_state;
  const fields: StatePotionVisibleFieldContext[] = [{
    field_id: args.state.field_id,
    field_label: args.state.field_label,
    status: field.status,
    value: field.locked_value ?? field.candidate_value,
    candidate_value: field.candidate_value,
    locked_value: field.locked_value,
    option_value: null,
    option_label: null,
    needs_user_confirmation: field.needs_user_confirmation,
    detail_sufficiency: null,
  }];
  return {
    state_summary: contextSummary({
      potionName: args.state.potion_name,
      visibleTask: args.visibleTask,
      fields,
    }),
    user_words: args.userMessage ? [args.userMessage] : [],
    field_or_stage: args.state.field_id,
    known_values: knownValues(fields),
    missing_or_weak_values: missingValues(fields),
    selected_candidate: {
      potion_type: args.state.selected_potion,
      potion_name: args.state.potion_name,
    },
    handoff_data: {
      potion_name: args.state.potion_name,
      platform_destination: args.state.platform_destination,
      fields,
    },
    tone_constraints: [
      "centrer sur le sens du plan",
      "ne pas transformer en outil de planification",
      "rester naturel",
    ],
    do_not_say: DO_NOT_SAY,
    context_summary: args.state.origin_bridge_context
      ? "Contexte entrant issu d'une note d'information; utiliser comme indice sans imposer une vérité."
      : null,
    evidence_used: args.evidence ?? [],
  };
}

export function buildStatePotionNoteInformation(args: {
  sourceFlowId: string;
  targetDispatcher: NoteInformationTargetDispatcher;
  handoffReason: NoteInformationHandoffReason;
  userMessage: string;
  riskScore?: number;
  context: StatePotionConversationContext;
  targetHint?: string | null;
}): NoteInformation {
  return createNoteInformation({
    source_flow_id: args.sourceFlowId,
    handoff_reason: args.handoffReason,
    target_dispatcher: args.targetDispatcher,
    handoff_context_for_next_dispatcher: args.context.context_summary ??
      args.context.state_summary,
    user_words: [args.userMessage],
    structured_context: {
      source_flow: args.sourceFlowId,
      user_message_summary: args.userMessage,
      active_flow_summary: args.context.state_summary,
      selected_potion: args.context.selected_candidate,
      collected_fields: args.context.known_values,
      unresolved_questions: args.context.missing_or_weak_values,
      handoff_data: args.context.handoff_data,
      evidence_used: args.context.evidence_used,
      recommended_next_focus: args.targetHint ?? args.targetDispatcher,
    },
  });
}
