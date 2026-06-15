import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import {
  buildClarificationRequest,
  candidatesFromSignals,
  candidateSignalFromCandidate,
  type ClarificationCandidate,
  type ClarificationLocalDispatcherOutput,
  type ClarificationLocalState,
  type ClarificationVisibleTask,
} from "../clarification/contract.ts";
import {
  clearClarificationState,
  readClarificationLocalState,
  writeClarificationLocalState,
} from "../clarification/state.ts";
import {
  type ClarificationLocalDispatcherInput,
  type ClarificationLocalLlmRunner,
  runClarificationLocalDispatcher,
} from "../clarification/local_dispatcher.ts";
import {
  type ClarificationReducerResult,
  reduceClarificationLocalDispatcherOutput,
} from "../clarification/reducer.ts";
import {
  createNoteInformation,
  type NoteInformation,
} from "../contracts/note_information.v1.ts";
import type { ClarificationVisibleAgent } from "../clarification/visible_agent.ts";
import {
  buildActiveSkillClarificationCandidatesFromTurnFrame,
  buildClarificationCandidatesFromTurnFrame,
} from "./clarification_candidate_builder.ts";
import {
  buildClarificationContextPack,
} from "../clarification/context_pack.ts";
import {
  type InlineInfoToolContext,
  runInlineGetInfoDbTool,
  runInlineGetInfoProductTool,
} from "../tools/operations/inline_info_tools.ts";
import type { StatusRecapObjectType } from "../skills/status_recap/contract.ts";

const EXECUTABLE_SIGNAL_IDS = new Set([
  "create_one_shot_reminder",
  "cancel_one_shot_reminder",
  "create_recurring_reminder",
  "prepare_attack_card",
  "prepare_defense_card",
  "adjust_plan_item",
  "select_state_potion",
  "update_coach_preferences",
  "track_progress_plan_item",
]);

type ClarificationArbitrationOutput = {
  status:
    | "ask"
    | "resolved"
    | "still_ambiguous"
    | "cancelled"
    | "topic_change"
    | "safety";
  flow_action: ClarificationLocalDispatcherOutput["flow_action"];
  selected_candidate_id?: string | null;
  confidence: "low" | "medium" | "high";
  question?: string | null;
  user_goal_summary?: string | null;
  reasoning_summary?: string | null;
  handoff_notes?: {
    known_slots?: Record<string, unknown>;
    recommended_next_step?: string | null;
  };
  local_dispatcher_output?: ClarificationLocalDispatcherOutput;
  visible_task?: ClarificationVisibleTask;
  note_information?: NoteInformation | null;
  diagnosis?: ClarificationReducerResult["diagnosis"];
  state_mutation_audit?: ClarificationReducerResult["state_mutation_audit"];
};

export type DispatcherClarificationArbitrationResult =
  | {
    status: "none";
    turnFrame: TurnFrame;
    tempMemory: Record<string, unknown>;
  }
  | {
    status: "ask";
    turnFrame: TurnFrame;
    tempMemory: Record<string, unknown>;
    routeDecision: RouteDecision;
    output: ClarificationArbitrationOutput;
    visibleQuestion: string;
    inlineInfoRun?: Record<string, unknown> | null;
  }
  | {
    status: "resolved" | "cancelled" | "topic_change" | "safety";
    turnFrame: TurnFrame;
    tempMemory: Record<string, unknown>;
    output: ClarificationArbitrationOutput;
    selectedCandidate?: ClarificationCandidate | null;
    noteInformation?: NoteInformation | null;
  };

export type ActiveSkillClarificationArbitrationResult =
  DispatcherClarificationArbitrationResult;

function routeDecisionForClarification(): RouteDecision {
  return {
    route_version: "v1",
    response_owner: "orientation_clarification",
    selected_handler: "orientation_clarification",
    blocked_paths: [
      { path: "tool_skill_router", reason_code: "clarification_required" },
      { path: "product_help", reason_code: "clarification_required" },
      {
        path: "operation_runtime_pipeline",
        reason_code: "clarification_required",
      },
      { path: "direct_effects", reason_code: "clarification_required" },
    ],
    direct_effects_to_run: [],
    reason_code: "clarification_required",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
  };
}

function suppressExecutableSignals(turnFrame: TurnFrame): TurnFrame {
  const preservedEntry = Object.fromEntries(
    Object.entries(turnFrame.skill_signals?.entry ?? {}).filter(([skillId]) =>
      !EXECUTABLE_SIGNAL_IDS.has(skillId)
    ),
  );
  return {
    ...turnFrame,
    direct_effects: [],
    tool_skill_intents: [],
    skill_signals: {
      ...(turnFrame.skill_signals ?? {}),
      entry: preservedEntry,
    },
  };
}

function isInternalSkillCandidate(
  candidate: ClarificationCandidate | null | undefined,
): boolean {
  return Boolean(
    candidate?.evidence?.some((item) =>
      item === "active_skill_state.phase" ||
      item.startsWith("active_skill_state.phase:")
    ),
  );
}

function shouldResolveInternalCandidateToOwner(args: {
  owner: string;
  candidate: ClarificationCandidate | null;
}): boolean {
  if (!args.candidate) return false;
  if (!isInternalSkillCandidate(args.candidate)) return false;
  if (args.candidate.operation_type) return false;
  if (
    args.candidate.id === args.owner ||
    args.candidate.id === "emotional_repair" ||
    args.candidate.id === "product_help" ||
    args.candidate.id === "safety_crisis"
  ) {
    return false;
  }
  return true;
}

function outputForResolvedActiveSkillCandidate(args: {
  output: ClarificationArbitrationOutput;
  owner: string;
  candidate: ClarificationCandidate | null;
}): ClarificationArbitrationOutput {
  if (
    args.output.status !== "resolved" ||
    !shouldResolveInternalCandidateToOwner({
      owner: args.owner,
      candidate: args.candidate,
    })
  ) {
    return args.output;
  }
  return {
    ...args.output,
    selected_candidate_id: args.owner,
    handoff_notes: {
      ...(args.output.handoff_notes ?? {}),
      known_slots: {
        ...(args.output.handoff_notes?.known_slots ?? {}),
        clarified_internal_candidate_id: args.candidate?.id,
        clarified_internal_candidate_label: args.candidate?.label,
      },
    },
  };
}

function none(
  turnFrame: TurnFrame,
  tempMemory: unknown,
): DispatcherClarificationArbitrationResult {
  return {
    status: "none",
    turnFrame,
    tempMemory: typeof tempMemory === "object" && tempMemory
      ? { ...(tempMemory as Record<string, unknown>) }
      : {},
  };
}

function conflictSummary(candidates: ClarificationCandidate[]): string {
  const labels = candidates.map((candidate) => candidate.label).filter(Boolean)
    .slice(0, 4);
  return labels.length
    ? `Sophia hesite entre ${labels.join(" / ")}.`
    : "Sophia hesite entre plusieurs directions plausibles.";
}

function localDispatcherInput(args: {
  userId: string;
  requestId?: string | null;
  userMessage: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  previous: ClarificationLocalState | null;
  clarificationId: string;
  sourceDispatcher: "global" | "local";
  sourceFlowId: string | null;
  ambiguityKind: string;
  candidates: ClarificationCandidate[];
  knownContext: Record<string, unknown>;
  inboundNoteInformation?: NoteInformation | Record<string, unknown> | null;
}): ClarificationLocalDispatcherInput {
  return {
    user_id: args.userId,
    request_id: args.requestId ?? null,
    user_message: args.userMessage,
    recent_messages: args.recentMessages,
    active_state: args.previous,
    clarification_id: args.previous?.clarification_id ?? args.clarificationId,
    source_dispatcher: args.previous?.source_dispatcher ??
      args.sourceDispatcher,
    source_flow_id: args.previous?.source_flow_id ?? args.sourceFlowId,
    ambiguity_kind: (args.previous?.ambiguity_kind ??
      args.ambiguityKind) as any,
    conflict_summary: args.previous?.conflict_summary ??
      conflictSummary(args.candidates),
    candidate_signals: args.previous?.candidate_signals ??
      args.candidates.map(candidateSignalFromCandidate),
    known_context: {
      ...(args.previous?.known_context ?? {}),
      ...args.knownContext,
    },
    inbound_note_information: args.previous?.inbound_note_information ??
      args.inboundNoteInformation ?? null,
  };
}

function inboundNoteForClarification(args: {
  sourceFlowId: string;
  sourceSummary: string;
  userMessage: string;
  candidates: ClarificationCandidate[];
  targetHint?: string | null;
}): NoteInformation {
  return createNoteInformation({
    source_flow_id: args.sourceFlowId,
    handoff_reason: "bridge",
    target_dispatcher: "clarification",
    handoff_context_for_next_dispatcher:
      "Plusieurs signaux forts coexistent. Le dispatcher clarification doit arbitrer sans executer et produire un conversation_context filtre pour le prompt visible.",
    user_words: [args.userMessage].filter(Boolean),
    structured_context: {
      source_flow: args.sourceFlowId,
      user_message_summary: args.userMessage,
      active_flow_summary: args.sourceSummary,
      candidate_labels: args.candidates.map((candidate) => candidate.label),
      candidate_operation_types: args.candidates.map((candidate) =>
        candidate.operation_type ?? candidate.id
      ),
      unresolved_questions: ["direction_or_target_to_select"],
      evidence: ["multiple_candidate_signals"],
      recommended_next_focus: args.targetHint ?? "clarification",
    },
  });
}

function compatibilityOutput(args: {
  reducer: ClarificationReducerResult;
  localOutput: ClarificationLocalDispatcherOutput;
}): ClarificationArbitrationOutput {
  const reducer = args.reducer;
  const context = reducer.visible_task.conversation_context;
  const status: ClarificationArbitrationOutput["status"] = reducer.status ===
      "resolved"
    ? "resolved"
    : reducer.status === "cancelled"
    ? "cancelled"
    : reducer.status === "topic_change"
    ? "topic_change"
    : reducer.status === "safety"
    ? "safety"
    : reducer.visible_task.kind === "still_ambiguous"
    ? "still_ambiguous"
    : "ask";
  return {
    status,
    flow_action: args.localOutput.flow_action,
    selected_candidate_id: reducer.selected_candidate?.candidate_id ??
      (reducer.status === "safety" ? "safety_crisis" : null),
    confidence: args.localOutput.confidence,
    question: context.question,
    user_goal_summary: context.conflict_summary,
    reasoning_summary: reducer.reason_code,
    handoff_notes: reducer.note_information
      ? {
        known_slots: reducer.note_information.structured_context,
        recommended_next_step:
          reducer.note_information.handoff_context_for_next_dispatcher,
      }
      : undefined,
    local_dispatcher_output: args.localOutput,
    visible_task: reducer.visible_task,
    note_information: reducer.note_information,
    diagnosis: reducer.diagnosis,
    state_mutation_audit: reducer.state_mutation_audit,
  };
}

type InlineInfoRuntimeDeps = {
  supabase?: SupabaseClient | null;
  userTimezone?: string | null;
  history?: unknown;
  routeDecision?: RouteDecision | null;
  runInlineGetInfoProduct?: typeof runInlineGetInfoProductTool;
  runInlineGetInfoDb?: typeof runInlineGetInfoDbTool;
};

function objectTypesFromSignals(
  signals: Array<
    { operation_type?: string | null; target_dispatcher?: string }
  >,
): StatusRecapObjectType[] {
  const values = new Set<StatusRecapObjectType>();
  for (const signal of signals) {
    const op = String(signal.operation_type ?? signal.target_dispatcher ?? "");
    if (op === "prepare_attack_card") values.add("attack_card");
    if (op === "prepare_defense_card") values.add("defense_card");
    if (op === "create_recurring_reminder") values.add("recurring_reminder");
    if (op === "adjust_plan_item") values.add("plan_item");
  }
  return [...values];
}

function inlineInfoContext(args: {
  reducer: ClarificationReducerResult;
  localOutput: ClarificationLocalDispatcherOutput;
  knownContext: Record<string, unknown>;
}): InlineInfoToolContext {
  const context = args.localOutput.visible_task.conversation_context;
  const question = String(
    args.localOutput.inline_info.question_to_answer ??
      context.question ??
      args.localOutput.clarification_state.user_words.at(-1) ?? "",
  ).trim();
  return {
    active_flow: "clarification",
    active_flow_status: args.reducer.local_state?.status ?? "asking",
    question_to_answer: question || "Question de clarification inline.",
    active_flow_context: {
      conflict_summary: args.localOutput.clarification_state.conflict_summary,
      candidate_signals: args.localOutput.clarification_state.candidate_signals,
      clarification_context_pack:
        args.knownContext.clarification_context_pack ??
          null,
      resume_clarification_goal:
        args.localOutput.inline_info.resume_clarification_goal ??
          context.question_goal,
      conversation_context: context,
    },
    dispatcher_context: args.reducer.note_information?.structured_context ??
      null,
    note_information: args.reducer.note_information,
  };
}

async function maybeRunClarificationInlineInfo(args: {
  deps: InlineInfoRuntimeDeps;
  turnFrame: TurnFrame;
  userId: string;
  userMessage: string;
  requestId?: string | null;
  tempMemory: unknown;
  knownContext: Record<string, unknown>;
  reducer: ClarificationReducerResult;
  localOutput: ClarificationLocalDispatcherOutput;
}): Promise<{ content: string; run: Record<string, unknown> } | null> {
  if (args.reducer.status !== "inline_tool") return null;
  const kind = args.localOutput.inline_info.kind;
  if (!kind) return null;
  const context = inlineInfoContext({
    reducer: args.reducer,
    localOutput: args.localOutput,
    knownContext: args.knownContext,
  });
  if (kind === "product") {
    const info = await (args.deps.runInlineGetInfoProduct ??
      runInlineGetInfoProductTool)({
        userId: args.userId,
        userMessage: args.userMessage,
        history: args.deps.history,
        turnFrame: args.turnFrame,
        context,
        requestId: args.requestId ?? null,
      });
    return {
      content: info.content,
      run: {
        subskill_run: info.subskillRun,
        runtime_trace: info.runtimeTrace,
        context: info.context,
      },
    };
  }
  if (!args.deps.supabase) return null;
  const objectTypes = args.localOutput.inline_info.object_types?.length
    ? args.localOutput.inline_info.object_types as StatusRecapObjectType[]
    : objectTypesFromSignals(
      args.localOutput.clarification_state.candidate_signals,
    );
  const info = await (args.deps.runInlineGetInfoDb ?? runInlineGetInfoDbTool)({
    supabase: args.deps.supabase,
    userId: args.userId,
    userMessage: args.userMessage,
    userTimezone: args.deps.userTimezone ?? "Europe/Paris",
    history: args.deps.history,
    turnFrame: args.turnFrame,
    routeDecision: args.deps.routeDecision ?? null,
    tempMemory: args.tempMemory,
    requestId: args.requestId ?? null,
    objectTypes,
    context,
  });
  return {
    content: info.content,
    run: {
      subskill_run: info.subskillRun,
      runtime_trace: info.runtimeTrace,
      context: info.context,
    },
  };
}

function candidateFromSignal(
  candidates: ClarificationCandidate[],
  signal: { candidate_id: string; operation_type?: string | null } | null,
): ClarificationCandidate | null {
  if (!signal) return null;
  return candidates.find((candidate) =>
    candidate.id === signal.candidate_id ||
    (signal.operation_type &&
      candidate.operation_type === signal.operation_type)
  ) ?? {
    id: signal.candidate_id,
    label: signal.candidate_id.replaceAll("_", " "),
    operation_type: signal.operation_type ?? null,
    evidence: ["clarification.resolved_candidate_signal"],
  };
}

function arbitrationStatus(
  status: ClarificationReducerResult["status"],
): "resolved" | "cancelled" | "topic_change" {
  if (status === "cancelled") return "cancelled";
  if (status === "topic_change") return "topic_change";
  return "resolved";
}

function isUnsafeClarificationFallbackQuestion(question: string): boolean {
  const lower = question.toLowerCase();
  return lower.includes("souhaitez-vous") ||
    lower.includes("voulez-vous") ||
    lower.includes("préférez-vous") ||
    lower.includes("preferez-vous") ||
    lower.includes(" votre ") ||
    lower.startsWith("votre ");
}

async function visibleMessage(args: {
  visibleAgent?: ClarificationVisibleAgent;
  userId: string;
  requestId?: string | null;
  userMessage: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  reducer: ClarificationReducerResult;
}): Promise<string> {
  const fromAgent = args.visibleAgent
    ? await args.visibleAgent({
      user_id: args.userId,
      request_id: args.requestId ?? null,
      stage: args.reducer.visible_task.kind,
      user_message: args.userMessage,
      recent_messages: args.recentMessages,
      local_state: args.reducer.local_state,
      visible_task: args.reducer.visible_task,
      dispatcher_evidence: args.reducer.evidence,
    })
    : null;
  if (fromAgent?.trim()) return fromAgent.trim();
  const context = args.reducer.visible_task.conversation_context;
  const question = context.question?.trim();
  if (question && !isUnsafeClarificationFallbackQuestion(question)) {
    return question;
  }
  switch (args.reducer.visible_task.kind) {
    case "stop_or_cancel":
      return "D'accord, on laisse ça de côté.";
    case "exit_ack":
      return "D'accord, je mets cette clarification de côté.";
    case "resolved_transition":
      return "D'accord, je reprends dans cette direction.";
    case "safety":
      return "Je mets la clarification de côté, la priorité c'est ta sécurité.";
    default:
      return "Tu peux préciser ce que tu veux choisir ?";
  }
}

function explicitStructuredToolIntent(args: {
  turnFrame: TurnFrame;
  candidates: ClarificationCandidate[];
  operationType: string;
}): ClarificationCandidate | null {
  const hasCandidate = args.candidates.find((candidate) =>
    candidate.operation_type === args.operationType ||
    candidate.id === args.operationType
  );
  if (!hasCandidate) return null;
  const intent = (args.turnFrame.tool_skill_intents ?? []).find((item) =>
    item.operation_type === args.operationType &&
    item.confidence_band === "high" &&
    item.user_intent !== "explain_only"
  );
  return intent ? hasCandidate : null;
}

export async function maybeStartDispatcherClarification(args: {
  turnFrame: TurnFrame;
  userMessage: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  tempMemory: unknown;
  llmRunner?: ClarificationLocalLlmRunner;
  visibleAgent?: ClarificationVisibleAgent;
  modelName?: string;
  requestId?: string | null;
  userTurnSnapshot?: unknown;
  supabase?: SupabaseClient | null;
  userTimezone?: string | null;
  history?: unknown;
  routeDecision?: RouteDecision | null;
  runInlineGetInfoProduct?: typeof runInlineGetInfoProductTool;
  runInlineGetInfoDb?: typeof runInlineGetInfoDbTool;
}): Promise<DispatcherClarificationArbitrationResult> {
  if (!args.llmRunner) return none(args.turnFrame, args.tempMemory);
  if (
    args.turnFrame.safety.risk_band === "high" ||
    args.turnFrame.safety.risk_band === "critical"
  ) return none(args.turnFrame, args.tempMemory);

  const previousLocal = readClarificationLocalState(args.tempMemory);
  const built = previousLocal
    ? {
      ambiguity_kind: previousLocal.ambiguity_kind,
      candidates: candidatesFromSignals(previousLocal.candidate_signals),
      known_context: previousLocal.known_context ?? {},
    }
    : buildClarificationCandidatesFromTurnFrame(args.turnFrame);
  if (!built || built.candidates.length < 2) {
    return none(args.turnFrame, args.tempMemory);
  }
  if (!previousLocal) {
    const explicitStatePotion = explicitStructuredToolIntent({
      turnFrame: args.turnFrame,
      candidates: built.candidates,
      operationType: "select_state_potion",
    });
    if (explicitStatePotion) {
      return {
        status: "resolved",
        turnFrame: args.turnFrame,
        tempMemory: typeof args.tempMemory === "object" && args.tempMemory
          ? { ...(args.tempMemory as Record<string, unknown>) }
          : {},
        output: {
          status: "resolved",
          flow_action: "resolved_to_candidate",
          selected_candidate_id: explicitStatePotion.id,
          confidence: "high",
          user_goal_summary:
            "Structured dispatcher output already identified a state potion request.",
          reasoning_summary:
            "No orientation clarification needed when the explicit structured tool intent is select_state_potion.",
          handoff_notes: {
            known_slots: {
              operation_type: "select_state_potion",
            },
          },
        },
        selectedCandidate: explicitStatePotion,
      };
    }
  }

  const clarificationId = previousLocal?.clarification_id ??
    `${args.turnFrame.turn_id}:dispatcher_clarification`;
  const request = buildClarificationRequest({
    clarification_id: clarificationId,
    owner: previousLocal?.source_flow_id ?? "dispatcher",
    ambiguity_kind: built.ambiguity_kind,
    user_message: args.userMessage,
    recent_messages: args.recentMessages,
    active_flow_state: args.userTurnSnapshot ?? null,
    known_context: built.known_context,
    candidates: built.candidates,
  });
  const candidateSignals = previousLocal?.candidate_signals ??
    request.candidates.map(candidateSignalFromCandidate);
  const contextPack = await buildClarificationContextPack({
    supabase: args.supabase ?? null,
    userId: args.turnFrame.user_id,
    candidateSignals,
    existingKnownContext: request.known_context ?? {},
  });
  const knownContext = {
    ...(request.known_context ?? {}),
    db_context_pack: contextPack,
    clarification_context_pack: contextPack,
  };
  const inboundNote = previousLocal?.inbound_note_information ??
    inboundNoteForClarification({
      sourceFlowId: "global",
      sourceSummary: conflictSummary(request.candidates),
      userMessage: args.userMessage,
      candidates: request.candidates,
      targetHint: "dispatcher_clarification",
    });
  const input = localDispatcherInput({
    userId: args.turnFrame.user_id,
    requestId: args.requestId ?? null,
    userMessage: args.userMessage,
    recentMessages: args.recentMessages,
    previous: previousLocal,
    clarificationId,
    sourceDispatcher: "global",
    sourceFlowId: null,
    ambiguityKind: request.ambiguity_kind,
    candidates: request.candidates,
    knownContext,
    inboundNoteInformation: inboundNote,
  });
  if (previousLocal) {
    console.info("[Clarification] global_dispatcher_skipped", {
      request_id: args.requestId ?? null,
      clarification_id: input.clarification_id,
      source: "dispatcher_clarification_active",
    });
  }
  console.info("[Clarification] local_dispatcher_called", {
    request_id: args.requestId ?? null,
    clarification_id: input.clarification_id,
    source_dispatcher: input.source_dispatcher,
    candidate_count: input.candidate_signals.length,
  });
  const localOutput = await runClarificationLocalDispatcher({
    input,
    llmRunner: args.llmRunner as ClarificationLocalLlmRunner,
    modelName: args.modelName,
  });
  if (!localOutput) return none(args.turnFrame, args.tempMemory);
  console.info("[Clarification] local_dispatcher_result", {
    request_id: args.requestId ?? null,
    clarification_id: input.clarification_id,
    flow_action: localOutput.flow_action,
    visible_task_kind: localOutput.visible_task.kind,
    risk_score: localOutput.risk_score,
    target_dispatcher: localOutput.note_information.target_dispatcher,
  });
  const reduced = reduceClarificationLocalDispatcherOutput({
    previous: previousLocal,
    output: localOutput,
    known_context: knownContext,
  });
  const output = compatibilityOutput({ reducer: reduced, localOutput });
  if (reduced.note_information) {
    console.info("[Clarification] note_information_created", {
      request_id: args.requestId ?? null,
      source_flow_id: reduced.note_information.source_flow_id,
      target_dispatcher: reduced.note_information.target_dispatcher,
      handoff_reason: reduced.note_information.handoff_reason,
    });
  }

  if (reduced.status === "continue" || reduced.status === "inline_tool") {
    const tempMemory = reduced.local_state
      ? writeClarificationLocalState(args.tempMemory, reduced.local_state)
      : clearClarificationState(args.tempMemory);
    const inlineInfo = await maybeRunClarificationInlineInfo({
      deps: {
        supabase: args.supabase ?? null,
        userTimezone: args.userTimezone ?? null,
        history: args.history,
        routeDecision: args.routeDecision ?? null,
        runInlineGetInfoProduct: args.runInlineGetInfoProduct,
        runInlineGetInfoDb: args.runInlineGetInfoDb,
      },
      turnFrame: args.turnFrame,
      userId: args.turnFrame.user_id,
      userMessage: args.userMessage,
      requestId: args.requestId ?? null,
      tempMemory: args.tempMemory,
      knownContext,
      reducer: reduced,
      localOutput,
    });
    if (inlineInfo) {
      console.info("[Clarification] inline_tool_roundtrip", {
        request_id: args.requestId ?? null,
        clarification_id: input.clarification_id,
        inline_kind: localOutput.inline_info.kind,
      });
      return {
        status: "ask",
        turnFrame: suppressExecutableSignals(args.turnFrame),
        tempMemory,
        routeDecision: routeDecisionForClarification(),
        output,
        visibleQuestion: inlineInfo.content ||
          "Je n'arrive pas à répondre à cette question maintenant, mais je garde la clarification en cours.",
        inlineInfoRun: inlineInfo.run,
      };
    }
    const visibleQuestion = await visibleMessage({
      visibleAgent: args.visibleAgent,
      userId: args.turnFrame.user_id,
      requestId: args.requestId ?? null,
      userMessage: args.userMessage,
      recentMessages: args.recentMessages,
      reducer: reduced,
    });
    return {
      status: "ask",
      turnFrame: suppressExecutableSignals(args.turnFrame),
      tempMemory,
      routeDecision: routeDecisionForClarification(),
      output,
      visibleQuestion,
    };
  }

  if (
    reduced.status === "resolved" ||
    reduced.status === "cancelled" ||
    reduced.status === "topic_change" ||
    reduced.status === "safety"
  ) {
    const selectedCandidate = candidateFromSignal(
      request.candidates,
      reduced.selected_candidate,
    );
    return {
      status: arbitrationStatus(reduced.status),
      turnFrame: suppressExecutableSignals(args.turnFrame),
      tempMemory: clearClarificationState(args.tempMemory),
      output,
      selectedCandidate,
      noteInformation: reduced.note_information,
    };
  }

  return none(args.turnFrame, args.tempMemory);
}

export async function maybeStartActiveSkillClarification(args: {
  turnFrame: TurnFrame;
  activeSkillState: unknown;
  userMessage: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  tempMemory: unknown;
  llmRunner?: ClarificationLocalLlmRunner;
  visibleAgent?: ClarificationVisibleAgent;
  modelName?: string;
  requestId?: string | null;
  userTurnSnapshot?: unknown;
  supabase?: SupabaseClient | null;
  userTimezone?: string | null;
  history?: unknown;
  routeDecision?: RouteDecision | null;
  runInlineGetInfoProduct?: typeof runInlineGetInfoProductTool;
  runInlineGetInfoDb?: typeof runInlineGetInfoDbTool;
}): Promise<ActiveSkillClarificationArbitrationResult> {
  if (!args.llmRunner) return none(args.turnFrame, args.tempMemory);
  if (
    args.turnFrame.safety.risk_band === "high" ||
    args.turnFrame.safety.risk_band === "critical"
  ) return none(args.turnFrame, args.tempMemory);

  const activeOwner = String(
    (args.activeSkillState as { skill_id?: unknown } | null)?.skill_id ?? "",
  ).trim();
  if (!activeOwner) return none(args.turnFrame, args.tempMemory);

  const previousLocal = readClarificationLocalState(args.tempMemory);
  if (previousLocal && previousLocal.source_flow_id !== activeOwner) {
    return none(args.turnFrame, args.tempMemory);
  }

  const built = previousLocal
    ? {
      owner: previousLocal.source_flow_id ?? activeOwner,
      ambiguity_kind: previousLocal.ambiguity_kind,
      candidates: candidatesFromSignals(previousLocal.candidate_signals),
      known_context: previousLocal.known_context ?? {},
    }
    : buildActiveSkillClarificationCandidatesFromTurnFrame({
      turnFrame: args.turnFrame,
      activeSkillState: args.activeSkillState,
      userMessage: args.userMessage,
    });
  if (!built || built.candidates.length < 2) {
    return none(args.turnFrame, args.tempMemory);
  }

  const clarificationId = previousLocal?.clarification_id ??
    `${args.turnFrame.turn_id}:${built.owner}:clarification`;
  const request = buildClarificationRequest({
    clarification_id: clarificationId,
    owner: built.owner,
    ambiguity_kind: built.ambiguity_kind,
    user_message: args.userMessage,
    recent_messages: args.recentMessages,
    active_flow_state: args.activeSkillState ?? args.userTurnSnapshot ?? null,
    known_context: built.known_context,
    candidates: built.candidates,
  });
  const candidateSignals = previousLocal?.candidate_signals ??
    request.candidates.map(candidateSignalFromCandidate);
  const contextPack = await buildClarificationContextPack({
    supabase: args.supabase ?? null,
    userId: args.turnFrame.user_id,
    candidateSignals,
    existingKnownContext: request.known_context ?? {},
  });
  const knownContext = {
    ...(request.known_context ?? {}),
    db_context_pack: contextPack,
    clarification_context_pack: contextPack,
  };
  const inboundNote = previousLocal?.inbound_note_information ??
    inboundNoteForClarification({
      sourceFlowId: built.owner,
      sourceSummary:
        `Flow actif ${built.owner} a plusieurs suites plausibles en clarification.`,
      userMessage: args.userMessage,
      candidates: request.candidates,
      targetHint: `${built.owner}:clarification`,
    });
  const input = localDispatcherInput({
    userId: args.turnFrame.user_id,
    requestId: args.requestId ?? null,
    userMessage: args.userMessage,
    recentMessages: args.recentMessages,
    previous: previousLocal,
    clarificationId,
    sourceDispatcher: "local",
    sourceFlowId: built.owner,
    ambiguityKind: request.ambiguity_kind,
    candidates: request.candidates,
    knownContext,
    inboundNoteInformation: inboundNote,
  });
  if (previousLocal) {
    console.info("[Clarification] global_dispatcher_skipped", {
      request_id: args.requestId ?? null,
      clarification_id: input.clarification_id,
      source: "active_skill_clarification_active",
    });
  }
  console.info("[Clarification] local_dispatcher_called", {
    request_id: args.requestId ?? null,
    clarification_id: input.clarification_id,
    source_dispatcher: input.source_dispatcher,
    source_flow_id: input.source_flow_id,
    candidate_count: input.candidate_signals.length,
  });
  const localOutput = await runClarificationLocalDispatcher({
    input,
    llmRunner: args.llmRunner as ClarificationLocalLlmRunner,
    modelName: args.modelName,
  });
  if (!localOutput) return none(args.turnFrame, args.tempMemory);
  console.info("[Clarification] local_dispatcher_result", {
    request_id: args.requestId ?? null,
    clarification_id: input.clarification_id,
    flow_action: localOutput.flow_action,
    visible_task_kind: localOutput.visible_task.kind,
    risk_score: localOutput.risk_score,
    target_dispatcher: localOutput.note_information.target_dispatcher,
  });
  const reduced = reduceClarificationLocalDispatcherOutput({
    previous: previousLocal,
    output: localOutput,
    known_context: knownContext,
  });
  const output = compatibilityOutput({ reducer: reduced, localOutput });
  if (reduced.note_information) {
    console.info("[Clarification] note_information_created", {
      request_id: args.requestId ?? null,
      source_flow_id: reduced.note_information.source_flow_id,
      target_dispatcher: reduced.note_information.target_dispatcher,
      handoff_reason: reduced.note_information.handoff_reason,
    });
  }

  if (reduced.status === "continue" || reduced.status === "inline_tool") {
    const tempMemory = reduced.local_state
      ? writeClarificationLocalState(args.tempMemory, reduced.local_state)
      : clearClarificationState(args.tempMemory);
    const inlineInfo = await maybeRunClarificationInlineInfo({
      deps: {
        supabase: args.supabase ?? null,
        userTimezone: args.userTimezone ?? null,
        history: args.history,
        routeDecision: args.routeDecision ?? null,
        runInlineGetInfoProduct: args.runInlineGetInfoProduct,
        runInlineGetInfoDb: args.runInlineGetInfoDb,
      },
      turnFrame: args.turnFrame,
      userId: args.turnFrame.user_id,
      userMessage: args.userMessage,
      requestId: args.requestId ?? null,
      tempMemory: args.tempMemory,
      knownContext,
      reducer: reduced,
      localOutput,
    });
    if (inlineInfo) {
      console.info("[Clarification] inline_tool_roundtrip", {
        request_id: args.requestId ?? null,
        clarification_id: input.clarification_id,
        inline_kind: localOutput.inline_info.kind,
      });
      return {
        status: "ask",
        turnFrame: suppressExecutableSignals(args.turnFrame),
        tempMemory,
        routeDecision: routeDecisionForClarification(),
        output,
        visibleQuestion: inlineInfo.content ||
          "Je n'arrive pas à répondre à cette question maintenant, mais je garde la clarification en cours.",
        inlineInfoRun: inlineInfo.run,
      };
    }
    const visibleQuestion = await visibleMessage({
      visibleAgent: args.visibleAgent,
      userId: args.turnFrame.user_id,
      requestId: args.requestId ?? null,
      userMessage: args.userMessage,
      recentMessages: args.recentMessages,
      reducer: reduced,
    });
    return {
      status: "ask",
      turnFrame: suppressExecutableSignals(args.turnFrame),
      tempMemory,
      routeDecision: routeDecisionForClarification(),
      output,
      visibleQuestion,
    };
  }

  if (
    reduced.status === "resolved" ||
    reduced.status === "cancelled" ||
    reduced.status === "topic_change" ||
    reduced.status === "safety"
  ) {
    const selectedCandidate = candidateFromSignal(
      request.candidates,
      reduced.selected_candidate,
    );
    const routedOutput = outputForResolvedActiveSkillCandidate({
      output,
      owner: built.owner,
      candidate: selectedCandidate,
    });
    return {
      status: arbitrationStatus(reduced.status),
      turnFrame: suppressExecutableSignals(args.turnFrame),
      tempMemory: clearClarificationState(args.tempMemory),
      output: routedOutput,
      selectedCandidate,
      noteInformation: reduced.note_information,
    };
  }

  return none(args.turnFrame, args.tempMemory);
}
