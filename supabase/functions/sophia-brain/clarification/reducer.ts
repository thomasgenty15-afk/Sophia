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

function localState(args: {
  previous: ClarificationLocalState | null;
  output: ClarificationLocalDispatcherOutput;
  status: ClarificationLocalState["status"];
  selectedCandidateId?: string | null;
  noteInformation?: NoteInformation | null;
  knownContext?: Record<string, unknown>;
}): ClarificationLocalState {
  const now = new Date().toISOString();
  return {
    skill_id: "clarification",
    mode: "local_flow",
    clarification_id: args.output.clarification_state.clarification_id,
    status: args.status,
    turn_count: Math.min(Number(args.previous?.turn_count ?? 0) + 1, 99),
    max_turns: Number(args.previous?.max_turns ?? 4) || 4,
    source_dispatcher: args.output.clarification_state.source_dispatcher,
    source_flow_id: args.output.clarification_state.source_flow_id,
    ambiguity_kind: args.output.clarification_state.ambiguity_kind,
    ambiguity_axes: args.output.clarification_state.ambiguity_axes,
    conflict_summary: args.output.clarification_state.conflict_summary,
    candidate_signals: args.output.clarification_state.candidate_signals,
    selected_candidate_id: args.selectedCandidateId ?? null,
    user_words: userWords(args.output, args.previous),
    known_context: args.knownContext ?? args.previous?.known_context ?? {},
    inbound_note_information: args.previous?.inbound_note_information ?? null,
    outbound_note_information: args.noteInformation ?? null,
    created_at: args.previous?.created_at ?? now,
    updated_at: now,
  };
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
  return {
    status: "continue",
    reason_code: args.reason_code,
    local_state: localState({
      previous: args.previous,
      output: args.output,
      status: "still_ambiguous",
    }),
    visible_task: task,
    selected_candidate: null,
    note_information: null,
    inline_info: null,
    exit_to_global_dispatcher: false,
    blocked_effects: [{
      type: "clarification_resolution",
      reason_code: args.reason_code,
    }],
    evidence: args.output.evidence,
  };
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
    return {
      status: "safety",
      reason_code: "clarification_to_safety_with_note",
      local_state: null,
      visible_task: visibleTask({ output, kind: "safety", selected: null }),
      selected_candidate: null,
      note_information: note,
      inline_info: null,
      exit_to_global_dispatcher: false,
      blocked_effects: [{
        type: "clarification",
        reason_code: "safety_preempt",
      }],
      evidence: output.evidence,
    };
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
    return {
      status: "topic_change",
      reason_code: "clarification_exit_to_global_with_note",
      local_state: null,
      visible_task: visibleTask({ output, kind: "exit_ack", selected: null }),
      selected_candidate: null,
      note_information: note,
      inline_info: null,
      exit_to_global_dispatcher: true,
      blocked_effects: [],
      evidence: output.evidence,
    };
  }

  if (output.flow_action === "cancel_clarification") {
    return {
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
      evidence: output.evidence,
    };
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
    return {
      status: "inline_tool",
      reason_code: "clarification_inline_tool_with_note",
      local_state: localState({
        previous: args.previous,
        output,
        status: "asking",
        noteInformation: note,
        knownContext: args.known_context,
      }),
      visible_task: visibleTask({
        output,
        kind: "inline_info_return",
        selected: null,
      }),
      selected_candidate: null,
      note_information: note,
      inline_info: output.inline_info,
      exit_to_global_dispatcher: false,
      blocked_effects: [],
      evidence: output.evidence,
    };
  }

  if (output.flow_action === "resolved_to_candidate") {
    if (!selected) {
      return invalidSelectionResult({
        previous: args.previous,
        output,
        reason_code: "clarification_selected_candidate_absent",
      });
    }
    if (output.confidence === "low") {
      return invalidSelectionResult({
        previous: args.previous,
        output,
        reason_code: "clarification_low_confidence_resolution_rejected",
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
    return {
      status: "resolved",
      reason_code: "clarification_resolved_with_note",
      local_state: null,
      visible_task: visibleTask({
        output,
        kind: "resolved_transition",
        selected,
        question: null,
      }),
      selected_candidate: selected,
      note_information: note,
      inline_info: null,
      exit_to_global_dispatcher: false,
      blocked_effects: [],
      evidence: output.evidence,
    };
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
  return {
    status: "continue",
    reason_code: output.flow_action === "still_ambiguous"
      ? "clarification_still_ambiguous"
      : "clarification_started",
    local_state: {
      ...localState({
        previous: args.previous,
        output,
        status: output.flow_action === "still_ambiguous"
          ? "still_ambiguous"
          : "asking",
      }),
      known_context: args.known_context ?? args.previous?.known_context ?? {},
    },
    visible_task: visibleTask({ output, kind: visibleKind, selected: null }),
    selected_candidate: null,
    note_information: null,
    inline_info: null,
    exit_to_global_dispatcher: false,
    blocked_effects: [],
    evidence: output.evidence,
  };
}
