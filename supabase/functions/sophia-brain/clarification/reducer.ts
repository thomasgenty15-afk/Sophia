import {
  createNoteInformation,
  type NoteInformation,
  type NoteInformationTargetDispatcher,
} from "../contracts/note_information.v1.ts";
import type {
  ClarificationCandidateSignal,
  ClarificationConversationContext,
  ClarificationLocalDispatcherOutput,
  ClarificationLocalState,
  ClarificationStateMutationAudit,
  ClarificationVisibleTask,
  ClarificationVisibleTaskKind,
} from "./contract.ts";

export type ClarificationReducerResult = {
  status:
    | "continue"
    | "resolved"
    | "cancelled"
    | "topic_change"
    | "inline_tool"
    | "safety";
  reason_code: string;
  local_state: ClarificationLocalState | null;
  visible_task: ClarificationVisibleTask;
  selected_candidate: ClarificationCandidateSignal | null;
  note_information: NoteInformation | null;
  inline_info: ClarificationLocalDispatcherOutput["inline_info"] | null;
  exit_to_global_dispatcher: boolean;
  blocked_effects: Array<{ type: string; reason_code: string }>;
  state_mutation_audit: ClarificationStateMutationAudit;
  diagnosis: {
    flow_action: ClarificationLocalDispatcherOutput["flow_action"];
    visible_task: ClarificationVisibleTaskKind;
    selected_candidate_id: string | null;
    selected_target_dispatcher: string | null;
    pending_offer_present: boolean;
    pending_confirmation_present: boolean;
    direct_handoff_flag_present: boolean;
    candidate_count: number;
    candidate_ids: string[];
    constraints: string[];
    stabilized_enough: boolean;
    blocked_effects: Array<{ type: string; reason_code: string }>;
    state_mutation_audit: ClarificationStateMutationAudit;
  };
  evidence: string[];
};

const TARGET_DISPATCHERS = new Set([
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
]);

function targetDispatcher(
  value: string | null,
): NoteInformationTargetDispatcher {
  const text = String(value ?? "").trim();
  return TARGET_DISPATCHERS.has(text)
    ? text as NoteInformationTargetDispatcher
    : "other_local";
}

function text(value: unknown, fallback = ""): string {
  const output = String(value ?? "").replace(/\s+/g, " ").trim();
  return output || fallback;
}

function userWords(
  output: ClarificationLocalDispatcherOutput,
  previous: ClarificationLocalState | null,
): string[] {
  const words = output.clarification_state.user_words.length
    ? output.clarification_state.user_words
    : previous?.user_words ?? [];
  return words.map((word) => text(word)).filter(Boolean).slice(-10);
}

function visibleTask(args: {
  output: ClarificationLocalDispatcherOutput;
  kind: ClarificationVisibleTaskKind;
  selected: ClarificationCandidateSignal | null;
  question?: string | null;
}): ClarificationVisibleTask {
  const sourceContext = args.output.visible_task.conversation_context;
  const context: ClarificationConversationContext = {
    ...sourceContext,
    conflict_summary: text(
      sourceContext.conflict_summary,
      args.output.clarification_state.conflict_summary,
    ),
    candidate_labels: args.output.clarification_state.candidate_signals.map((
      candidate,
    ) => candidate.label),
    selected_candidate_label: args.selected?.label ??
      sourceContext.selected_candidate_label ??
      null,
    known_references: sourceContext.known_references ?? [],
    best_reference_guess: sourceContext.best_reference_guess ?? null,
    missing_decision: sourceContext.missing_decision ?? null,
    question_constraints: sourceContext.question_constraints,
    question_goal: text(
      sourceContext.question_goal,
      "Clarifier la direction utile.",
    ),
    question: args.question ?? sourceContext.question ?? null,
    user_words: args.output.clarification_state.user_words,
    evidence_used: sourceContext.evidence_used ?? args.output.evidence ?? [],
    do_not_say: sourceContext.do_not_say ?? [
      "dispatcher",
      "signal",
      "candidate_id",
      "JSON",
      "note_information",
    ],
    tone_constraints: sourceContext.tone_constraints ?? [
      "whatsapp",
      "court",
      "tutoiement",
    ],
  };
  return {
    ...args.output.visible_task,
    kind: args.kind,
    conversation_context: context,
  };
}

const SERVER_OWNED_FIELDS = [
  "clarification_id",
  "source_dispatcher",
  "source_flow_id",
  "ambiguity_kind",
  "ambiguity_axes",
  "conflict_summary",
  "candidate_signals",
  "selected_candidate_id",
  "known_context",
  "inbound_note_information",
  "outbound_note_information",
  "current_question",
  "current_ambiguity",
  "resolved_candidate",
  "rejected_candidates",
  "pending_offer",
  "pending_confirmation",
  "last_selected_option",
  "active_subflow_context",
  "active_clarification_context",
  "exit_memo",
  "local_state_summary",
  "previous_flow_summary",
  "executable_from_chat",
  "created_at",
] as const;

type ServerOwnedField = typeof SERVER_OWNED_FIELDS[number];

type ClarificationStateTransition =
  | "start"
  | "continue"
  | "invalid_resolution"
  | "inline_tool"
  | "resolved"
  | "cancelled"
  | "topic_change"
  | "safety";

function uniqueStrings(values: unknown[], max = 40): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const item = text(value);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

function declaredStateFields(
  output: ClarificationLocalDispatcherOutput,
  key: "modified_fields" | "clear_fields",
): string[] {
  return uniqueStrings(output.state_updates?.[key] ?? [], 24);
}

function noteRecord(
  note: NoteInformation | Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  return note && typeof note === "object" && !Array.isArray(note)
    ? note as Record<string, unknown>
    : null;
}

function buildPendingOffer(args: {
  output: ClarificationLocalDispatcherOutput;
  visible: ClarificationVisibleTask;
}): Record<string, unknown> {
  return {
    clarification_id: args.output.clarification_state.clarification_id,
    ambiguity_axes: args.output.clarification_state.ambiguity_axes,
    conflict_summary: args.visible.conversation_context.conflict_summary,
    candidate_ids: args.output.clarification_state.candidate_signals.map((
      candidate,
    ) => candidate.candidate_id),
    candidate_labels: args.visible.conversation_context.candidate_labels,
    question: args.visible.conversation_context.question,
  };
}

function candidateById(
  candidates: ClarificationCandidateSignal[],
  id: string | null | undefined,
): ClarificationCandidateSignal | null {
  const candidateId = text(id);
  if (!candidateId) return null;
  return candidates.find((candidate) => candidate.candidate_id === candidateId) ??
    null;
}

function mergeCandidateSignalsById(args: {
  previous: ClarificationCandidateSignal[];
  next: ClarificationCandidateSignal[];
}): ClarificationCandidateSignal[] {
  if (!args.previous.length) return args.next;
  if (!args.next.length) return args.previous;
  const byId = new Map(args.previous.map((candidate) => [
    candidate.candidate_id,
    candidate,
  ]));
  for (const candidate of args.next) {
    if (byId.has(candidate.candidate_id)) {
      byId.set(candidate.candidate_id, candidate);
    }
  }
  return args.previous.map((candidate) =>
    byId.get(candidate.candidate_id) ?? candidate
  );
}

function rejectedCandidates(args: {
  candidates: ClarificationCandidateSignal[];
  selected: ClarificationCandidateSignal | null | undefined;
}): ClarificationCandidateSignal[] {
  const selectedId = args.selected?.candidate_id ?? "";
  return args.candidates.filter((candidate) =>
    candidate.candidate_id !== selectedId
  );
}

function canClearField(
  transition: ClarificationStateTransition,
  field: ServerOwnedField,
): boolean {
  if (
    transition === "resolved" ||
    transition === "cancelled" ||
    transition === "topic_change" ||
    transition === "safety"
  ) return true;
  if (transition === "inline_tool" && field === "outbound_note_information") {
    return false;
  }
  return false;
}

function emptyAudit(args: {
  output: ClarificationLocalDispatcherOutput;
}): ClarificationStateMutationAudit {
  return {
    server_owned_fields: [...SERVER_OWNED_FIELDS],
    modified_fields_declared: declaredStateFields(args.output, "modified_fields"),
    clear_fields_declared: declaredStateFields(args.output, "clear_fields"),
    applied_fields: [],
    preserved_fields: [],
    restored_fields: [],
    cleared_fields: [],
    rejected_changes: [],
  };
}

function addUnique(target: string[], field: string) {
  if (!target.includes(field)) target.push(field);
}

function mergeClarificationLocalState(args: {
  previous: ClarificationLocalState | null;
  output: ClarificationLocalDispatcherOutput;
  status: ClarificationLocalState["status"];
  selectedCandidateId?: string | null;
  selectedCandidate?: ClarificationCandidateSignal | null;
  noteInformation?: NoteInformation | null;
  knownContext?: Record<string, unknown>;
  visibleTask: ClarificationVisibleTask;
  transition: ClarificationStateTransition;
  now?: string;
}): { state: ClarificationLocalState; audit: ClarificationStateMutationAudit } {
  const now = args.now ?? new Date().toISOString();
  const previous = args.previous;
  const audit = emptyAudit({ output: args.output });
  const declaredModified = new Set(audit.modified_fields_declared);
  const declaredClear = new Set(audit.clear_fields_declared);
  const selectedFromPrevious = previous?.selected_candidate_id ?? null;
  const selectedCandidateId = args.transition === "resolved"
    ? args.selectedCandidateId ?? null
    : previous
    ? selectedFromPrevious
    : args.selectedCandidateId ?? null;
  const candidateSignals = previous?.candidate_signals?.length
    ? args.output.flow_action === "revise_understanding"
      ? mergeCandidateSignalsById({
        previous: previous.candidate_signals,
        next: args.output.clarification_state.candidate_signals,
      })
      : previous.candidate_signals
    : args.output.clarification_state.candidate_signals;
  const sourceDispatcher = previous?.source_dispatcher ??
    args.output.clarification_state.source_dispatcher;
  const sourceFlowId = previous?.source_flow_id ??
    args.output.clarification_state.source_flow_id;
  const ambiguityKind = previous?.ambiguity_kind ??
    args.output.clarification_state.ambiguity_kind;
  const ambiguityAxes = previous?.ambiguity_axes?.length
    ? previous.ambiguity_axes
    : args.output.clarification_state.ambiguity_axes;
  const conflictSummary = previous?.conflict_summary ??
    args.output.clarification_state.conflict_summary;
  const knownContext = {
    ...(previous?.known_context ?? {}),
    ...(args.knownContext ?? {}),
  };
  const pendingOffer = args.status === "asking" ||
      args.status === "still_ambiguous"
    ? {
      ...(previous?.pending_offer ?? {}),
      ...buildPendingOffer({ output: args.output, visible: args.visibleTask }),
    }
    : previous?.pending_offer ?? null;
  const outboundNote = args.noteInformation ?? previous?.outbound_note_information ??
    null;
  const lastSelectedOption = args.selectedCandidate ??
    previous?.last_selected_option ??
    candidateById(candidateSignals, selectedCandidateId);
  const state: ClarificationLocalState = {
    skill_id: "clarification",
    mode: "local_flow",
    server_state_version: "clarification_state_v2",
    clarification_id: previous?.clarification_id ??
      args.output.clarification_state.clarification_id,
    status: args.status,
    turn_count: Math.min(Number(args.previous?.turn_count ?? 0) + 1, 99),
    max_turns: Number(args.previous?.max_turns ?? 4) || 4,
    source_dispatcher: sourceDispatcher,
    source_flow_id: sourceFlowId,
    ambiguity_kind: ambiguityKind,
    ambiguity_axes: ambiguityAxes,
    conflict_summary: conflictSummary,
    candidate_signals: candidateSignals,
    selected_candidate_id: selectedCandidateId,
    user_words: userWords(args.output, args.previous),
    known_context: knownContext,
    inbound_note_information: previous?.inbound_note_information ?? null,
    outbound_note_information: outboundNote,
    current_question: args.visibleTask.conversation_context.question ??
      previous?.current_question ?? null,
    current_ambiguity: {
      kind: ambiguityKind,
      axes: ambiguityAxes,
      conflict_summary: conflictSummary,
    },
    resolved_candidate: args.transition === "resolved"
      ? args.selectedCandidate ?? null
      : previous?.resolved_candidate ?? null,
    rejected_candidates: args.transition === "resolved"
      ? rejectedCandidates({
        candidates: candidateSignals,
        selected: args.selectedCandidate ?? null,
      })
      : previous?.rejected_candidates ?? [],
    pending_offer: pendingOffer,
    pending_confirmation: previous?.pending_confirmation ?? null,
    last_selected_option: lastSelectedOption,
    active_subflow_context: previous?.active_subflow_context ??
      noteRecord(args.output.note_information.structured_context) ?? null,
    active_clarification_context: {
      clarification_id: previous?.clarification_id ??
        args.output.clarification_state.clarification_id,
      current_question: args.visibleTask.conversation_context.question ?? null,
      current_ambiguity: {
        kind: ambiguityKind,
        axes: ambiguityAxes,
        conflict_summary: conflictSummary,
      },
      candidate_ids: candidateSignals.map((candidate) =>
        candidate.candidate_id
      ),
      candidate_labels: candidateSignals.map((candidate) => candidate.label),
    },
    exit_memo: previous?.exit_memo ?? null,
    local_state_summary: (text(
      args.output.clarification_state.conflict_summary,
      previous?.local_state_summary ?? "",
    ) || previous?.local_state_summary) ?? null,
    previous_flow_summary: (previous?.previous_flow_summary ??
      text(
        noteRecord(previous?.inbound_note_information)?.active_flow_summary ??
          noteRecord(previous?.inbound_note_information)
            ?.handoff_context_for_next_dispatcher,
      )) || null,
    executable_from_chat: previous?.executable_from_chat ?? true,
    created_at: args.previous?.created_at ?? now,
    updated_at: now,
  };
  for (const field of SERVER_OWNED_FIELDS) {
    const previousValue = previous?.[field as keyof ClarificationLocalState];
    const nextValue = state[field as keyof ClarificationLocalState];
    if (declaredClear.has(field)) {
      if (canClearField(args.transition, field)) {
        addUnique(audit.cleared_fields, field);
      } else {
        if (previous && previousValue !== undefined) {
          (state as Record<string, unknown>)[field] = previousValue;
          addUnique(audit.restored_fields, field);
        }
        audit.rejected_changes.push({
          field,
          reason_code: "clear_not_allowed_for_transition",
        });
      }
      continue;
    }
    if (declaredModified.has(field)) {
      const allowed = !previous ||
        field === "outbound_note_information" && args.transition === "inline_tool" ||
        field === "last_selected_option" && args.transition === "resolved";
      if (allowed) {
        addUnique(audit.applied_fields, field);
      } else {
        if (previousValue !== undefined) {
          (state as Record<string, unknown>)[field] = previousValue;
          addUnique(audit.restored_fields, field);
        }
        audit.rejected_changes.push({
          field,
          reason_code: "modify_not_allowed_for_transition",
        });
      }
      continue;
    }
    if (previous && previousValue !== undefined && previousValue === nextValue) {
      addUnique(audit.preserved_fields, field);
    } else if (previous && previousValue !== undefined) {
      if (
        field === "known_context" ||
        field === "outbound_note_information" && args.transition === "inline_tool" ||
        field === "pending_offer" && (args.status === "asking" ||
          args.status === "still_ambiguous")
      ) {
        addUnique(audit.applied_fields, field);
      } else {
        addUnique(audit.preserved_fields, field);
      }
    } else {
      addUnique(audit.applied_fields, field);
    }
  }
  return { state, audit };
}

function clearedStateAudit(args: {
  output: ClarificationLocalDispatcherOutput;
  previous: ClarificationLocalState | null;
  transition: ClarificationStateTransition;
}): ClarificationStateMutationAudit {
  const audit = emptyAudit({ output: args.output });
  if (args.previous) {
    for (const field of SERVER_OWNED_FIELDS) {
      if (canClearField(args.transition, field)) {
        addUnique(audit.cleared_fields, field);
      } else {
        addUnique(audit.preserved_fields, field);
      }
    }
  }
  for (const field of audit.clear_fields_declared) {
    if (
      SERVER_OWNED_FIELDS.includes(field as ServerOwnedField) &&
      !canClearField(args.transition, field as ServerOwnedField)
    ) {
      audit.rejected_changes.push({
        field,
        reason_code: "clear_not_allowed_for_transition",
      });
    }
  }
  return audit;
}

function selectedCandidate(
  output: ClarificationLocalDispatcherOutput,
): ClarificationCandidateSignal | null {
  const selectedId = text(output.clarification_state.selected_candidate_id);
  if (!selectedId) return null;
  return output.clarification_state.candidate_signals.find((candidate) =>
    candidate.candidate_id === selectedId
  ) ?? null;
}

function resultWithDiagnosis(args: {
  output: ClarificationLocalDispatcherOutput;
  result: Omit<ClarificationReducerResult, "diagnosis">;
}): ClarificationReducerResult {
  const result = args.result;
  const selectedTarget = result.selected_candidate?.target_dispatcher ??
    (result.note_information?.target_dispatcher
      ? String(result.note_information.target_dispatcher)
      : null);
  return {
    ...result,
    diagnosis: {
      flow_action: args.output.flow_action,
      visible_task: result.visible_task.kind,
      selected_candidate_id: result.selected_candidate?.candidate_id ??
        result.local_state?.selected_candidate_id ?? null,
      selected_target_dispatcher: selectedTarget,
      pending_offer_present: Boolean(result.local_state?.pending_offer),
      pending_confirmation_present: Boolean(
        result.local_state?.pending_confirmation,
      ),
      direct_handoff_flag_present: Boolean(result.note_information),
      candidate_count: result.local_state?.candidate_signals.length ??
        (Array.isArray(
            (result.note_information?.structured_context as any)
              ?.candidate_signals,
          )
          ? ((result.note_information?.structured_context as any)
            ?.candidate_signals ?? []).length
          : 0),
      candidate_ids: result.local_state?.candidate_signals.map((candidate) =>
        candidate.candidate_id
      ) ??
        (((result.note_information?.structured_context as any)
          ?.candidate_signals ?? []) as Array<{ candidate_id?: string }>)
          .map((candidate) => String(candidate.candidate_id ?? ""))
          .filter(Boolean)
          .slice(0, 8),
      constraints: result.visible_task.conversation_context.do_not_say ?? [],
      stabilized_enough: !result.blocked_effects.some((effect) =>
        effect.reason_code === "not_stabilized_enough" ||
        effect.reason_code === "selected_option_missing" ||
        effect.reason_code === "candidate_missing"
      ),
      blocked_effects: result.blocked_effects,
      state_mutation_audit: result.state_mutation_audit,
    },
  };
}

function noteInformation(args: {
  output: ClarificationLocalDispatcherOutput;
  selected: ClarificationCandidateSignal | null;
  target: NoteInformationTargetDispatcher;
  reason: "clarification_resolved" | "topic_change" | "safety" | "inline_tool";
  contextFallback: string;
  knownContext?: Record<string, unknown>;
}): NoteInformation {
  const dispatcherStructuredContext =
    args.output.note_information.structured_context ?? {};
  const clarificationContextPack =
    args.knownContext?.clarification_context_pack ??
      dispatcherStructuredContext.clarification_context_pack ?? null;
  const structuredContext = {
    clarification_id: args.output.clarification_state.clarification_id,
    clarification_task_kind: args.output.visible_task.kind,
    selected_candidate_id: args.selected?.candidate_id ?? null,
    selected_candidate_label: args.selected?.label ?? null,
    resolved_candidate: args.selected ?? null,
    rejected_candidates: rejectedCandidates({
      candidates: args.output.clarification_state.candidate_signals,
      selected: args.selected,
    }),
    original_conflict_summary: args.output.clarification_state.conflict_summary,
    ambiguity_axes: args.output.clarification_state.ambiguity_axes,
    user_words: args.output.clarification_state.user_words,
    selected_candidate_payload_hint: args.selected?.structured_payload_hint ??
      null,
    candidate_signals: args.output.clarification_state.candidate_signals,
    clarification_context_pack: clarificationContextPack,
    context_evidence_used:
      (dispatcherStructuredContext.context_evidence_used as unknown) ?? [],
    best_reference_guess:
      args.output.visible_task.conversation_context.best_reference_guess ??
        null,
    missing_for_target_dispatcher:
      (dispatcherStructuredContext.missing_for_target_dispatcher as unknown) ??
        [],
    dispatcher_structured_context: dispatcherStructuredContext,
    ...(args.reason === "topic_change"
      ? {
        exit_memo: {
          source_flow_id: "clarification",
          previous_flow_summary:
            args.output.clarification_state.conflict_summary,
          user_words: args.output.clarification_state.user_words,
          unresolved_questions: [
            "clarification_interrupted_by_topic_change",
          ],
        },
      }
      : {}),
  };
  return createNoteInformation({
    source_flow_id: "clarification",
    handoff_reason: args.reason,
    target_dispatcher: args.target,
    handoff_context_for_next_dispatcher: text(
      args.output.note_information.handoff_context_for_next_dispatcher,
      args.contextFallback,
    ),
    user_words: args.output.clarification_state.user_words,
    structured_context: structuredContext,
    confidence: args.output.confidence,
  });
}

function invalidSelectionResult(args: {
  previous: ClarificationLocalState | null;
  output: ClarificationLocalDispatcherOutput;
  reason_code: string;
}): ClarificationReducerResult {
  const task = visibleTask({
    output: args.output,
    kind: "ask_simpler_choice",
    selected: null,
  });
  const merged = mergeClarificationLocalState({
    previous: args.previous,
    output: args.output,
    status: "still_ambiguous",
    visibleTask: task,
    transition: "invalid_resolution",
  });
  const blockedEffects = [{
    type: "clarification_resolution",
    reason_code: args.reason_code,
  }];
  return resultWithDiagnosis({
    output: args.output,
    result: {
    status: "continue",
    reason_code: args.reason_code,
    local_state: merged.state,
    visible_task: task,
    selected_candidate: null,
    note_information: null,
    inline_info: null,
    exit_to_global_dispatcher: false,
    blocked_effects: blockedEffects,
    state_mutation_audit: merged.audit,
    evidence: args.output.evidence,
    },
  });
}

export function reduceClarificationLocalDispatcherOutput(args: {
  previous: ClarificationLocalState | null;
  output: ClarificationLocalDispatcherOutput;
  known_context?: Record<string, unknown>;
}): ClarificationReducerResult {
  const output = args.output;
  const selected = selectedCandidate(output);

  if (output.flow_action === "safety_preempt") {
    const note = noteInformation({
      output,
      selected: null,
      target: "safety_crisis",
      reason: "safety",
      contextFallback:
        "Clarification interrompue par un signal safety. Reprendre uniquement le contexte de risque et deferer le conflit initial.",
      knownContext: args.known_context ?? args.previous?.known_context ?? {},
    });
    const blockedEffects = [{
      type: "clarification",
      reason_code: "safety_preempt",
    }];
    return resultWithDiagnosis({
      output,
      result: {
      status: "safety",
      reason_code: "clarification_to_safety_with_note",
      local_state: null,
      visible_task: visibleTask({ output, kind: "safety", selected: null }),
      selected_candidate: null,
      note_information: note,
      inline_info: null,
      exit_to_global_dispatcher: false,
      blocked_effects: blockedEffects,
      state_mutation_audit: clearedStateAudit({
        output,
        previous: args.previous,
        transition: "safety",
      }),
      evidence: output.evidence,
      },
    });
  }

  if (output.flow_action === "exit_to_global_dispatcher") {
    const note = noteInformation({
      output,
      selected: null,
      target: "global",
      reason: "topic_change",
      contextFallback:
        "Le user change de sujet pendant une clarification active. Reanalyser le nouveau sujet en conservant le conflit precedent comme contexte non visible.",
      knownContext: args.known_context ?? args.previous?.known_context ?? {},
    });
    return resultWithDiagnosis({
      output,
      result: {
      status: "topic_change",
      reason_code: "clarification_exit_to_global_with_note",
      local_state: null,
      visible_task: visibleTask({ output, kind: "exit_ack", selected: null }),
      selected_candidate: null,
      note_information: note,
      inline_info: null,
      exit_to_global_dispatcher: true,
      blocked_effects: [],
      state_mutation_audit: clearedStateAudit({
        output,
        previous: args.previous,
        transition: "topic_change",
      }),
      evidence: output.evidence,
      },
    });
  }

  if (output.flow_action === "cancel_clarification") {
    return resultWithDiagnosis({
      output,
      result: {
      status: "cancelled",
      reason_code: "clarification_cancelled_local",
      local_state: null,
      visible_task: visibleTask({
        output,
        kind: "stop_or_cancel",
        selected: null,
        question: null,
      }),
      selected_candidate: null,
      note_information: null,
      inline_info: null,
      exit_to_global_dispatcher: false,
      blocked_effects: [],
      state_mutation_audit: clearedStateAudit({
        output,
        previous: args.previous,
        transition: "cancelled",
      }),
      evidence: output.evidence,
      },
    });
  }

  if (
    output.flow_action === "get_info_product" ||
    output.flow_action === "get_info_db"
  ) {
    const target = output.flow_action === "get_info_product"
      ? "product_help"
      : "status_recap";
    const note = noteInformation({
      output,
      selected: null,
      target,
      reason: "inline_tool",
      contextFallback:
        "Question inline pendant clarification. Repondre uniquement a la question necessaire au choix, puis rendre le flow parent.",
      knownContext: args.known_context ?? args.previous?.known_context ?? {},
    });
    const task = visibleTask({
      output,
      kind: "inline_info_return",
      selected: null,
    });
    const merged = mergeClarificationLocalState({
      previous: args.previous,
      output,
      status: "asking",
      noteInformation: note,
      knownContext: args.known_context,
      visibleTask: task,
      transition: "inline_tool",
    });
    return resultWithDiagnosis({
      output,
      result: {
      status: "inline_tool",
      reason_code: "clarification_inline_tool_with_note",
      local_state: merged.state,
      visible_task: task,
      selected_candidate: null,
      note_information: note,
      inline_info: output.inline_info,
      exit_to_global_dispatcher: false,
      blocked_effects: [],
      state_mutation_audit: merged.audit,
      evidence: output.evidence,
      },
    });
  }

  if (output.flow_action === "resolved_to_candidate") {
    if (!text(output.clarification_state.selected_candidate_id)) {
      return invalidSelectionResult({
        previous: args.previous,
        output,
        reason_code: "selected_option_missing",
      });
    }
    if (!selected) {
      return invalidSelectionResult({
        previous: args.previous,
        output,
        reason_code: "candidate_missing",
      });
    }
    if (output.confidence === "low") {
      return invalidSelectionResult({
        previous: args.previous,
        output,
        reason_code: "not_stabilized_enough",
      });
    }
    const target = targetDispatcher(selected.target_dispatcher);
    const note = noteInformation({
      output,
      selected,
      target,
      reason: "clarification_resolved",
      contextFallback:
        "Le user a clarifie la direction. Le dispatcher cible doit remplir son propre JSON depuis le candidat selectionne et les mots user, sans execution directe par clarification.",
      knownContext: args.known_context ?? args.previous?.known_context ?? {},
    });
    const task = visibleTask({
      output,
      kind: "resolved_transition",
      selected,
      question: null,
    });
    return resultWithDiagnosis({
      output,
      result: {
      status: "resolved",
      reason_code: "clarification_resolved_with_note",
      local_state: null,
      visible_task: task,
      selected_candidate: selected,
      note_information: note,
      inline_info: null,
      exit_to_global_dispatcher: false,
      blocked_effects: [],
      state_mutation_audit: clearedStateAudit({
        output,
        previous: args.previous,
        transition: "resolved",
      }),
      evidence: output.evidence,
      },
    });
  }

  const visibleKind: ClarificationVisibleTaskKind =
    output.flow_action === "explain_candidate_options"
      ? "explain_options"
      : output.flow_action === "revise_understanding"
      ? "repeat_question"
      : output.flow_action === "still_ambiguous"
      ? "still_ambiguous"
      : args.previous
      ? "ask_simpler_choice"
      : "ask_choice";
  const task = visibleTask({ output, kind: visibleKind, selected: null });
  const merged = mergeClarificationLocalState({
    previous: args.previous,
    output,
    status: output.flow_action === "still_ambiguous"
      ? "still_ambiguous"
      : "asking",
    knownContext: args.known_context,
    visibleTask: task,
    transition: args.previous ? "continue" : "start",
  });
  return resultWithDiagnosis({
    output,
    result: {
    status: "continue",
    reason_code: output.flow_action === "still_ambiguous"
      ? "clarification_still_ambiguous"
      : "clarification_started",
    local_state: merged.state,
    visible_task: task,
    selected_candidate: null,
    note_information: null,
    inline_info: null,
    exit_to_global_dispatcher: false,
    blocked_effects: [],
    state_mutation_audit: merged.audit,
    evidence: output.evidence,
    },
  });
}
