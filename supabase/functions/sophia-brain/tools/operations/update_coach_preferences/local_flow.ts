import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import {
  createNoteInformation,
  normalizeNoteInformation,
  type NoteInformation,
} from "../../../contracts/note_information.v1.ts";
import {
  COACH_PREFERENCE_VALUES,
  type CoachPreferenceConversationContext,
  type CoachPreferenceDbContextPack,
  type CoachPreferenceDispatcherNoteInformation,
  type CoachPreferenceLocalDispatcherOutput,
  type CoachPreferenceLocalFlowAction,
  type CoachPreferenceLocalUpdate,
  type CoachPreferenceMicroMemoryContext,
  type CoachPreferenceVisibleTaskKind,
} from "./contract.ts";
import type { CoachPreferenceLocalFlowState } from "./state.ts";
import {
  directEffectLocalDispatcherPromptLines,
  withDirectEffectLocalContext,
} from "../../../router/direct_effect_local_context.ts";

export type CoachPreferenceLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: CoachPreferenceLocalFlowState | null;
  note_information_inbound?: NoteInformation | null;
  db_context_pack?: CoachPreferenceDbContextPack | null;
  micro_memory_context?: CoachPreferenceMicroMemoryContext | null;
  platform_context?: {
    timezone?: string | null;
    channel?: string | null;
  } | null;
  available_inline_tools?: Array<"status_recap" | "product_help">;
  current_preferences: Array<{
    key: string;
    value: string;
    label: string;
  }>;
  safety_risk_band?: string | null;
};

export type CoachPreferenceLocalDispatcher = (
  input: CoachPreferenceLocalDispatcherInput,
) => Promise<CoachPreferenceLocalDispatcherOutput | null>;

export type CoachPreferenceReducerResult = {
  status:
    | "collecting"
    | "proposed"
    | "write_ready"
    | "written"
    | "blocked"
    | "cancelled"
    | "exit";
  reason_code: string;
  local_state: CoachPreferenceLocalFlowState | null;
  visible_task: CoachPreferenceVisibleTaskKind;
  conversation_context: CoachPreferenceConversationContext;
  note_information: NoteInformation | null;
  write_updates: CoachPreferenceLocalUpdate[];
  exit_to_global_dispatcher: boolean;
  safety_preempt: boolean;
  blocked_effects: Array<{ type: string; reason_code: string }>;
  evidence: string[];
};

const FLOW_ACTIONS = new Set([
  "write_preferences",
  "clarify_durable_vs_punctual",
  "clarify_supported_setting",
  "clarify_value",
  "propose_supported_mapping",
  "confirm_proposed_mapping",
  "punctual_instruction",
  "unsupported_preference",
  "status_question",
  "explain_preferences",
  "revise_preferences",
  "repeat_saved_preferences",
  "repeat_current_state",
  "inline_tool_roundtrip",
  "exit_to_global_dispatcher",
  "complete_flow",
  "handoff_to_local_flow",
  "cancel_flow",
  "exit_to_global_dispatcher",
  "safety_preempt",
]);

const VISIBLE_TASKS = new Set([
  "preference_saved",
  "ask_durable_vs_punctual",
  "ask_setting_or_value",
  "confirm_supported_mapping",
  "punctual_instruction_ack",
  "unsupported_preference",
  "get_info_db",
  "get_info_product",
  "repeat_saved_preferences",
  "repeat_current_state",
  "write_failed_or_blocked",
  "inline_tool_return",
  "exit_or_cancel",
  "stop_or_cancel",
  "exit_ack",
  "safety",
  "safety_transition",
]);

const INTENT_KINDS = new Set([
  "durable_supported",
  "durable_unsupported",
  "punctual_instruction",
  "ambiguous",
  "status_question",
  "explain",
  "cancel",
  "topic_change",
  "safety",
]);

const DURABILITIES = new Set([
  "durable",
  "punctual",
  "ambiguous",
  "not_applicable",
]);

const SUPPORT_STATUSES = new Set([
  "supported",
  "unsupported",
  "partial",
  "ambiguous",
  "not_applicable",
]);

const UPDATE_STATUSES = new Set(["missing", "proposed", "locked", "rejected"]);
const RISK_WRITE_THRESHOLD = 6;

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function stringArray(value: unknown, max = 10): string[] {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean).slice(0, max)
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
    throw new Error("update_coach_preferences_local_dispatcher_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("update_coach_preferences_local_dispatcher_not_object");
  }
  return parsed as Record<string, unknown>;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: Set<string>,
  fallback: T,
): T {
  const raw = stringValue(value);
  return allowed.has(raw) ? raw as T : fallback;
}

function confidence(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
}

function riskScore(value: unknown): number {
  const score = Number(value ?? 0);
  return Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeCurrentPreferences(value: unknown): Array<{
  key: string;
  value: string;
  label: string;
}> {
  return Array.isArray(value)
    ? value.flatMap((item) => {
      const root = recordValue(item);
      const key = stringValue(root.key);
      const preferenceValue = stringValue(root.value);
      if (!key || !preferenceValue) return [];
      return [{
        key,
        value: preferenceValue,
        label: stringValue(root.label) || key,
      }];
    }).slice(0, 8)
    : [];
}

function normalizeConversationContext(
  raw: unknown,
): CoachPreferenceConversationContext {
  const root = recordValue(raw);
  const knownRoot = recordValue(root.known_values);
  const writeRoot = recordValue(root.write_result);
  const inlineRoot = recordValue(root.inline_tool_result);
  const field = stringValue(root.field_or_stage);
  const inlineSkill = stringValue(inlineRoot.skill_id);
  return {
    state_summary: stringValue(root.state_summary),
    user_words: stringArray(root.user_words, 6),
    field_or_stage: field === "durability" || field === "setting" ||
        field === "value" || field === "confirmation" || field === "done"
      ? field
      : null,
    known_values: {
      current_preferences: normalizeCurrentPreferences(
        knownRoot.current_preferences,
      ),
      proposed_updates: Array.isArray(knownRoot.proposed_updates)
        ? knownRoot.proposed_updates.flatMap((item) => {
          const update = normalizeUpdate(item);
          return update ? [update] : [];
        }).slice(0, 3)
        : [],
      committed_updates: Array.isArray(knownRoot.committed_updates)
        ? knownRoot.committed_updates.flatMap((item) => {
          const update = normalizeUpdate(item);
          return update ? [update] : [];
        }).slice(0, 3)
        : [],
    },
    missing_or_weak_values: stringArray(root.missing_or_weak_values, 6),
    selected_candidate: recordValue(root.selected_candidate),
    unsupported_parts: stringArray(root.unsupported_parts, 8),
    write_result: {
      committed: writeRoot.committed === true,
      preference_keys: stringArray(writeRoot.preference_keys, 3),
      blocked_reason: stringValue(writeRoot.blocked_reason) || null,
    },
    inline_tool_result: {
      skill_id: inlineSkill === "status_recap" || inlineSkill === "product_help"
        ? inlineSkill
        : null,
      summary: stringValue(inlineRoot.summary) || null,
    },
    tone_constraints: stringArray(root.tone_constraints, 6),
    do_not_say: stringArray(root.do_not_say, 8),
    context_summary: stringValue(root.context_summary) || null,
    evidence_used: stringArray(root.evidence_used, 8),
  };
}

function mergeConversationContext(
  base: CoachPreferenceConversationContext,
  patch: Partial<CoachPreferenceConversationContext>,
): CoachPreferenceConversationContext {
  return {
    ...base,
    ...patch,
    known_values: {
      ...base.known_values,
      ...(patch.known_values ?? {}),
    },
    write_result: {
      ...base.write_result,
      ...(patch.write_result ?? {}),
    },
    inline_tool_result: {
      ...base.inline_tool_result,
      ...(patch.inline_tool_result ?? {}),
    },
  };
}

function mergeDispatcherConversationContext(
  base: CoachPreferenceConversationContext,
  dispatcher: CoachPreferenceConversationContext,
): CoachPreferenceConversationContext {
  return mergeConversationContext(base, {
    state_summary: dispatcher.state_summary || base.state_summary,
    user_words: dispatcher.user_words.length
      ? dispatcher.user_words
      : base.user_words,
    field_or_stage: dispatcher.field_or_stage ?? base.field_or_stage,
    known_values: {
      current_preferences: dispatcher.known_values.current_preferences.length
        ? dispatcher.known_values.current_preferences
        : base.known_values.current_preferences,
      proposed_updates: dispatcher.known_values.proposed_updates.length
        ? dispatcher.known_values.proposed_updates
        : base.known_values.proposed_updates,
      committed_updates: dispatcher.known_values.committed_updates.length
        ? dispatcher.known_values.committed_updates
        : base.known_values.committed_updates,
    },
    missing_or_weak_values: dispatcher.missing_or_weak_values.length
      ? dispatcher.missing_or_weak_values
      : base.missing_or_weak_values,
    selected_candidate: Object.keys(dispatcher.selected_candidate).length
      ? dispatcher.selected_candidate
      : base.selected_candidate,
    unsupported_parts: dispatcher.unsupported_parts.length
      ? dispatcher.unsupported_parts
      : base.unsupported_parts,
    write_result: {
      committed: dispatcher.write_result.committed ||
        base.write_result.committed,
      preference_keys: dispatcher.write_result.preference_keys.length
        ? dispatcher.write_result.preference_keys
        : base.write_result.preference_keys,
      blocked_reason: dispatcher.write_result.blocked_reason ??
        base.write_result.blocked_reason,
    },
    inline_tool_result: {
      skill_id: dispatcher.inline_tool_result.skill_id ??
        base.inline_tool_result.skill_id,
      summary: dispatcher.inline_tool_result.summary ??
        base.inline_tool_result.summary,
    },
    tone_constraints: dispatcher.tone_constraints.length
      ? dispatcher.tone_constraints
      : base.tone_constraints,
    do_not_say: [
      ...base.do_not_say,
      ...dispatcher.do_not_say.filter((item) =>
        !base.do_not_say.includes(item)
      ),
    ].slice(0, 12),
    context_summary: dispatcher.context_summary ?? base.context_summary,
    evidence_used: dispatcher.evidence_used.length
      ? dispatcher.evidence_used
      : base.evidence_used,
  });
}

function defaultConversationContext(args: {
  previous: CoachPreferenceLocalFlowState | null;
  output?: CoachPreferenceLocalDispatcherOutput | null;
  visibleTask?: CoachPreferenceVisibleTaskKind | null;
  reasonCode?: string | null;
}): CoachPreferenceConversationContext {
  const output = args.output;
  const stage = args.previous?.current_stage ?? null;
  return {
    state_summary: output?.preference_intent.summary ||
      args.reasonCode ||
      "Preference coach flow state.",
    user_words: [],
    field_or_stage: stage,
    known_values: {
      current_preferences: [],
      proposed_updates: args.previous?.proposed_updates ?? [],
      committed_updates: args.previous?.last_committed_updates ?? [],
    },
    missing_or_weak_values: output?.missing_decisions ?? [],
    selected_candidate: output?.preference_updates?.[0] ?? {},
    unsupported_parts: output?.unsupported_parts ??
      args.previous?.unsupported_parts ?? [],
    write_result: {
      committed: false,
      preference_keys: [],
      blocked_reason: null,
    },
    inline_tool_result: {
      skill_id: args.visibleTask === "get_info_db"
        ? "status_recap"
        : args.visibleTask === "get_info_product"
        ? "product_help"
        : null,
      summary: null,
    },
    tone_constraints: [],
    do_not_say: [
      "Ne pas dire que c'est enregistré, noté, gardé ou appliqué si committed=false.",
      "Ne pas mentionner le Dashboard comme chemin nominal pour une préférence supportée.",
      "Ne pas inventer de préférence hors coach.tone, coach.challenge_level, coach.question_tendency.",
    ],
    context_summary: output?.visible_task.instruction || null,
    evidence_used: output?.evidence ?? [],
  };
}

function targetDispatcherForOutput(
  output: CoachPreferenceLocalDispatcherOutput,
): "global" | "safety_crisis" | "status_recap" | "product_help" | null {
  if (output.flow_action === "exit_to_global_dispatcher") return "global";
  if (output.flow_action === "safety_preempt") return "safety_crisis";
  if (output.visible_task.kind === "get_info_db") return "status_recap";
  if (output.visible_task.kind === "get_info_product") return "product_help";
  const note = output.note_information;
  if (note?.needed === true) {
    const target = note.target_dispatcher;
    if (
      target === "global" || target === "safety_crisis" ||
      target === "status_recap" || target === "product_help"
    ) return target;
  }
  return null;
}

function handoffReasonForTarget(
  target: "global" | "safety_crisis" | "status_recap" | "product_help",
): "topic_change" | "safety" | "inline_tool" {
  if (target === "safety_crisis") return "safety";
  if (target === "status_recap" || target === "product_help") {
    return "inline_tool";
  }
  return "topic_change";
}

function ensureNoteInformation(args: {
  previous: CoachPreferenceLocalFlowState | null;
  output: CoachPreferenceLocalDispatcherOutput;
  target: "global" | "safety_crisis" | "status_recap" | "product_help" | null;
}): NoteInformation | null {
  const target = args.target;
  if (!target) return null;
  const fallbackStructuredContext = {
    source_flow: "update_coach_preferences",
    active_flow_summary: args.output.preference_intent.summary,
    collected_state: {
      status: args.previous?.status ?? "collecting",
      current_stage: args.previous?.current_stage ?? null,
      proposed_updates: args.previous?.proposed_updates ?? [],
      preference_updates: args.output.preference_updates,
      unsupported_parts: args.output.unsupported_parts,
    },
    unresolved_questions: args.output.missing_decisions,
    confidence: args.output.confidence,
    evidence: args.output.evidence,
    recommended_next_focus: args.output.visible_task.instruction,
  };
  const fallback = {
    source_flow_id: "update_coach_preferences",
    handoff_reason: handoffReasonForTarget(target),
    target_dispatcher: target,
    handoff_context_for_next_dispatcher: JSON.stringify(
      fallbackStructuredContext,
    ),
    user_words: args.output.visible_task.conversation_context.user_words,
    structured_context: fallbackStructuredContext,
    confidence: args.output.confidence,
  };
  if (args.output.note_information?.needed === true) {
    return normalizeNoteInformation(args.output.note_information, fallback);
  }
  return createNoteInformation(fallback);
}

function validValueForKey(
  key: CoachPreferenceLocalUpdate["key"],
  value: string,
) {
  return COACH_PREFERENCE_VALUES[key].includes(value);
}

function normalizeUpdate(raw: unknown): CoachPreferenceLocalUpdate | null {
  const root = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const key = stringValue(root.key) as CoachPreferenceLocalUpdate["key"];
  if (!(key in COACH_PREFERENCE_VALUES)) return null;
  const value = stringValue(root.value) as CoachPreferenceLocalUpdate["value"];
  const status = enumValue<CoachPreferenceLocalUpdate["status"]>(
    root.status,
    UPDATE_STATUSES,
    "missing",
  );
  return {
    key,
    value,
    status,
    user_facing_label: stringValue(root.user_facing_label) || key,
    user_facing_value: stringValue(root.user_facing_value) || value,
    reason: stringValue(root.reason),
    needs_user_confirmation: root.needs_user_confirmation === true ||
      status === "proposed",
    source: (() => {
      const source = stringValue(root.source);
      return source === "user_message" || source === "db_context" ||
          source === "note_information" || source === "inference"
        ? source
        : undefined;
    })(),
    confidence: confidence(root.confidence),
    evidence: stringArray(root.evidence, 6),
  };
}

export function normalizeCoachPreferenceLocalDispatcherOutput(
  raw: unknown,
): CoachPreferenceLocalDispatcherOutput {
  const root = parseJsonObject(raw);
  const flowAction = enumValue<CoachPreferenceLocalFlowAction>(
    root.flow_action,
    FLOW_ACTIONS,
    "clarify_supported_setting",
  );
  const visibleRoot = root.visible_task &&
      typeof root.visible_task === "object" &&
      !Array.isArray(root.visible_task)
    ? root.visible_task as Record<string, unknown>
    : {};
  const intentRoot = root.preference_intent &&
      typeof root.preference_intent === "object" &&
      !Array.isArray(root.preference_intent)
    ? root.preference_intent as Record<string, unknown>
    : {};
  const exitRoot = root.exit_memo && typeof root.exit_memo === "object" &&
      !Array.isArray(root.exit_memo)
    ? root.exit_memo as Record<string, unknown>
    : {};
  const normalizedVisibleKind = enumValue<CoachPreferenceVisibleTaskKind>(
    visibleRoot.kind,
    VISIBLE_TASKS,
    "ask_setting_or_value",
  );
  const noteRoot = root.note_information &&
      typeof root.note_information === "object" &&
      !Array.isArray(root.note_information)
    ? root.note_information as Record<string, unknown>
    : {};
  const noteNeeded = noteRoot.needed === true;
  return {
    flow_action: flowAction,
    confidence: confidence(root.confidence),
    risk_score: riskScore(root.risk_score),
    preference_intent: {
      kind: enumValue(intentRoot.kind, INTENT_KINDS, "ambiguous"),
      durability: enumValue(intentRoot.durability, DURABILITIES, "ambiguous"),
      support_status: enumValue(
        intentRoot.support_status,
        SUPPORT_STATUSES,
        "ambiguous",
      ),
      summary: stringValue(intentRoot.summary),
    },
    preference_updates: Array.isArray(root.preference_updates)
      ? root.preference_updates.flatMap((item) => {
        const update = normalizeUpdate(item);
        return update ? [update] : [];
      }).slice(0, 3)
      : [],
    unsupported_parts: stringArray(root.unsupported_parts),
    missing_decisions:
      (Array.isArray(root.missing_decisions)
        ? root.missing_decisions.map((item) => stringValue(item)).filter((
          item,
        ) => ["durability", "setting", "value", "confirmation"].includes(item))
        : []) as CoachPreferenceLocalDispatcherOutput["missing_decisions"],
    visible_task: {
      kind: normalizedVisibleKind,
      instruction: stringValue(visibleRoot.instruction),
      conversation_context: normalizeConversationContext(
        visibleRoot.conversation_context,
      ),
    },
    note_information: noteNeeded
      ? {
        needed: true,
        ...normalizeNoteInformation(noteRoot, {
          source_flow_id: "update_coach_preferences",
          handoff_reason: "explicit_user_request",
          target_dispatcher: "global",
          handoff_context_for_next_dispatcher:
            stringValue(exitRoot.handoff_hint_for_global_dispatcher) ||
            "No handoff context provided.",
          user_words: normalizeConversationContext(
            visibleRoot.conversation_context,
          ).user_words,
          structured_context: {
            source_flow: "update_coach_preferences",
            user_message_summary: stringValue(
              intentRoot.summary,
            ),
            active_flow_summary: stringValue(exitRoot.flow_summary) ||
              "update_coach_preferences local transition.",
            collected_state: {
              preference_updates: Array.isArray(root.preference_updates)
                ? root.preference_updates
                : [],
              unsupported_parts: Array.isArray(root.unsupported_parts)
                ? root.unsupported_parts
                : [],
            },
            unresolved_questions: Array.isArray(root.missing_decisions)
              ? root.missing_decisions
              : [],
            recommended_next_focus:
              stringValue(exitRoot.handoff_hint_for_global_dispatcher) ||
              "global",
          },
          confidence: confidence(root.confidence),
        }),
      }
      : { needed: false },
    exit_memo: Object.keys(exitRoot).length
      ? {
        needed: exitRoot.needed === true,
        reason: enumValue(
          exitRoot.reason,
          new Set(["topic_change", "cancelled", "safety", "none"]),
          "none",
        ),
        flow_summary: stringValue(exitRoot.flow_summary) || null,
        handoff_hint_for_global_dispatcher:
          stringValue(exitRoot.handoff_hint_for_global_dispatcher) || null,
      }
      : undefined,
    safety: (() => {
      const safetyRoot = recordValue(root.safety);
      const riskBand = stringValue(safetyRoot.risk_band);
      return {
        risk_band: riskBand === "low" || riskBand === "medium" ||
            riskBand === "high" || riskBand === "critical" ||
            riskBand === "none"
          ? riskBand
          : "none",
        reason_codes: stringArray(safetyRoot.reason_codes, 8),
        should_preempt: safetyRoot.should_preempt === true ||
          flowAction === "safety_preempt",
      };
    })(),
    evidence: stringArray(root.evidence),
  };
}

export function createCoachPreferenceLocalFlowState(args: {
  previous?: CoachPreferenceLocalFlowState | null;
  status?: CoachPreferenceLocalFlowState["status"];
  currentStage?: CoachPreferenceLocalFlowState["current_stage"];
  proposedUpdates?: CoachPreferenceLocalUpdate[];
  lastCommittedUpdates?: CoachPreferenceLocalUpdate[];
  unsupportedParts?: string[];
  subskillHistory?: CoachPreferenceLocalFlowState["subskill_history"];
}): CoachPreferenceLocalFlowState {
  const now = new Date().toISOString();
  return {
    skill_id: "update_coach_preferences",
    operation_type: "update_coach_preferences",
    mode: "local_write_flow",
    status: args.status ?? args.previous?.status ?? "collecting",
    current_stage: args.currentStage ?? args.previous?.current_stage ??
      "setting",
    proposed_updates: args.proposedUpdates ?? args.previous?.proposed_updates ??
      [],
    last_committed_updates: args.lastCommittedUpdates ??
      args.previous?.last_committed_updates ?? [],
    unsupported_parts: args.unsupportedParts ??
      args.previous?.unsupported_parts ??
      [],
    subskill_history: args.subskillHistory ?? args.previous?.subskill_history ??
      [],
    turn_count: Number(args.previous?.turn_count ?? 0) + 1,
    max_turns: Number(args.previous?.max_turns ?? 4) || 4,
    created_at: args.previous?.created_at ?? now,
    updated_at: now,
  };
}

function validationIssues(
  updates: CoachPreferenceLocalUpdate[],
): string[] {
  const issues: string[] = [];
  const keys = new Set<string>();
  for (const update of updates) {
    if (!(update.key in COACH_PREFERENCE_VALUES)) {
      issues.push("invalid_key");
      continue;
    }
    if (!validValueForKey(update.key, update.value)) {
      issues.push("invalid_value");
    }
    if (!UPDATE_STATUSES.has(update.status)) issues.push("invalid_status");
    if (keys.has(update.key)) issues.push("duplicate_key");
    keys.add(update.key);
  }
  return issues;
}

function visibleTaskForClarification(
  output: CoachPreferenceLocalDispatcherOutput,
): CoachPreferenceVisibleTaskKind {
  if (output.visible_task.kind !== "preference_saved") {
    return output.visible_task.kind;
  }
  return "write_failed_or_blocked";
}

export function reduceCoachPreferenceLocalDispatcherOutput(args: {
  previous: CoachPreferenceLocalFlowState | null;
  output: CoachPreferenceLocalDispatcherOutput;
}): CoachPreferenceReducerResult {
  const output = args.output;
  const evidence = output.evidence;
  const transitionTarget = targetDispatcherForOutput(output);
  const noteInformation = ensureNoteInformation({
    previous: args.previous,
    output,
    target: transitionTarget,
  });
  const conversationContext = mergeDispatcherConversationContext(
    defaultConversationContext({
      previous: args.previous,
      output,
      visibleTask: output.visible_task.kind,
    }),
    output.visible_task.conversation_context,
  );
  if (output.flow_action === "exit_to_global_dispatcher") {
    return {
      status: "exit",
      reason_code: "update_coach_preferences_local_exit_to_global_dispatcher",
      local_state: createCoachPreferenceLocalFlowState({
        previous: args.previous,
        status: "exit",
        currentStage: "done",
      }),
      visible_task: "exit_or_cancel",
      conversation_context: mergeConversationContext(conversationContext, {
        field_or_stage: "done",
      }),
      note_information: noteInformation,
      write_updates: [],
      exit_to_global_dispatcher: true,
      safety_preempt: false,
      blocked_effects: [],
      evidence,
    };
  }
  if (
    output.flow_action === "cancel_flow" ||
    output.flow_action === "complete_flow"
  ) {
    return {
      status: "cancelled",
      reason_code: "update_coach_preferences_local_cancelled",
      local_state: createCoachPreferenceLocalFlowState({
        previous: args.previous,
        status: "cancelled",
        currentStage: "done",
      }),
      visible_task: "exit_or_cancel",
      conversation_context: mergeConversationContext(conversationContext, {
        field_or_stage: "done",
      }),
      note_information: null,
      write_updates: [],
      exit_to_global_dispatcher: false,
      safety_preempt: false,
      blocked_effects: [],
      evidence,
    };
  }
  if (
    output.flow_action === "punctual_instruction" ||
    (output.preference_intent.kind === "punctual_instruction" &&
      output.preference_intent.durability === "punctual")
  ) {
    return {
      status: "cancelled",
      reason_code: "update_coach_preferences_punctual_instruction_ack",
      local_state: createCoachPreferenceLocalFlowState({
        previous: args.previous,
        status: "cancelled",
        currentStage: "done",
        proposedUpdates: [],
        unsupportedParts: output.unsupported_parts,
      }),
      visible_task: "punctual_instruction_ack",
      conversation_context: mergeConversationContext(conversationContext, {
        field_or_stage: "done",
        known_values: {
          ...conversationContext.known_values,
          proposed_updates: [],
          committed_updates: [],
        },
        write_result: {
          committed: false,
          preference_keys: [],
          blocked_reason: null,
        },
        do_not_say: [
          "Ne pas dire que c'est enregistré, noté, gardé ou appliqué comme préférence durable.",
          "Dire clairement que l'adaptation vaut seulement pour l'échange courant si c'est utile.",
        ],
      }),
      note_information: null,
      write_updates: [],
      exit_to_global_dispatcher: false,
      safety_preempt: false,
      blocked_effects: [],
      evidence,
    };
  }
  if (
    output.flow_action === "safety_preempt" ||
    output.risk_score > RISK_WRITE_THRESHOLD
  ) {
    return {
      status: "blocked",
      reason_code: output.flow_action === "safety_preempt"
        ? "update_coach_preferences_safety_preempt"
        : "update_coach_preferences_risk_score_blocked",
      local_state: createCoachPreferenceLocalFlowState({
        previous: args.previous,
        status: "blocked",
        currentStage: "done",
        unsupportedParts: output.unsupported_parts,
      }),
      visible_task: output.flow_action === "safety_preempt"
        ? "safety_transition"
        : "write_failed_or_blocked",
      conversation_context: mergeConversationContext(conversationContext, {
        field_or_stage: "done",
        write_result: {
          ...conversationContext.write_result,
          committed: false,
          blocked_reason: output.flow_action === "safety_preempt"
            ? "safety_preempt"
            : "risk_score_blocked",
        },
      }),
      note_information: output.flow_action === "safety_preempt"
        ? noteInformation
        : null,
      write_updates: [],
      exit_to_global_dispatcher: false,
      safety_preempt: output.flow_action === "safety_preempt",
      blocked_effects: [{
        type: "update_coach_preferences",
        reason_code: output.flow_action === "safety_preempt"
          ? "safety_preempt"
          : "risk_score_blocked",
      }],
      evidence,
    };
  }

  const proposedUpdates = output.flow_action === "confirm_proposed_mapping" &&
      output.preference_updates.length === 0
    ? (args.previous?.proposed_updates ?? []).map((update) => ({
      ...update,
      status: "locked" as const,
      needs_user_confirmation: false,
    }))
    : output.preference_updates;
  const issues = validationIssues(proposedUpdates);
  if (issues.length > 0) {
    return {
      status: "blocked",
      reason_code: `update_coach_preferences_${issues[0]}`,
      local_state: createCoachPreferenceLocalFlowState({
        previous: args.previous,
        status: "blocked",
        currentStage: "setting",
        proposedUpdates: [],
        unsupportedParts: output.unsupported_parts,
      }),
      visible_task: "write_failed_or_blocked",
      conversation_context: mergeConversationContext(conversationContext, {
        write_result: {
          ...conversationContext.write_result,
          committed: false,
          blocked_reason: issues[0],
        },
      }),
      note_information: null,
      write_updates: [],
      exit_to_global_dispatcher: false,
      safety_preempt: false,
      blocked_effects: issues.map((reason_code) => ({
        type: "update_coach_preferences",
        reason_code,
      })),
      evidence,
    };
  }

  const hasProposed = proposedUpdates.some((update) =>
    update.status === "proposed" || update.needs_user_confirmation
  );
  if (hasProposed || output.flow_action === "propose_supported_mapping") {
    return {
      status: "proposed",
      reason_code: "update_coach_preferences_mapping_proposed",
      local_state: createCoachPreferenceLocalFlowState({
        previous: args.previous,
        status: "proposed",
        currentStage: "confirmation",
        proposedUpdates: proposedUpdates.filter((update) =>
          update.status !== "rejected" && update.status !== "missing"
        ),
        unsupportedParts: output.unsupported_parts,
      }),
      visible_task: "confirm_supported_mapping",
      conversation_context: mergeConversationContext(conversationContext, {
        field_or_stage: "confirmation",
        known_values: {
          ...conversationContext.known_values,
          proposed_updates: proposedUpdates.filter((update) =>
            update.status !== "rejected" && update.status !== "missing"
          ),
        },
      }),
      note_information: null,
      write_updates: [],
      exit_to_global_dispatcher: false,
      safety_preempt: false,
      blocked_effects: [],
      evidence,
    };
  }

  const writeUpdates = proposedUpdates.filter((update) =>
    update.status === "locked"
  );
  const confirmationResolvesUnsupportedScope =
    output.flow_action === "confirm_proposed_mapping" &&
    args.previous?.status === "proposed" &&
    output.confidence !== "low" &&
    output.preference_intent.kind === "durable_supported" &&
    output.preference_intent.durability === "durable" &&
    output.preference_intent.support_status === "supported" &&
    !output.missing_decisions.includes("confirmation");
  if (
    output.unsupported_parts.length > 0 &&
    writeUpdates.length > 0 &&
    !confirmationResolvesUnsupportedScope
  ) {
    const confirmationUpdates = writeUpdates.map((update) => ({
      ...update,
      status: "proposed" as const,
      needs_user_confirmation: true,
      reason: update.reason ||
        "Mapping partiel vers un réglage durable supporté.",
    }));
    return {
      status: "proposed",
      reason_code:
        "update_coach_preferences_partial_mapping_requires_confirmation",
      local_state: createCoachPreferenceLocalFlowState({
        previous: args.previous,
        status: "proposed",
        currentStage: "confirmation",
        proposedUpdates: confirmationUpdates,
        unsupportedParts: output.unsupported_parts,
      }),
      visible_task: "confirm_supported_mapping",
      conversation_context: mergeConversationContext(conversationContext, {
        field_or_stage: "confirmation",
        known_values: {
          ...conversationContext.known_values,
          proposed_updates: confirmationUpdates,
        },
        missing_or_weak_values: [
          ...conversationContext.missing_or_weak_values,
          "confirmation",
        ],
        selected_candidate: confirmationUpdates[0] ?? {},
        write_result: {
          committed: false,
          preference_keys: [],
          blocked_reason: null,
        },
      }),
      note_information: null,
      write_updates: [],
      exit_to_global_dispatcher: false,
      safety_preempt: false,
      blocked_effects: [],
      evidence,
    };
  }
  const writeBlockedReason = output.confidence === "low"
    ? "low_confidence"
    : output.preference_intent.kind !== "durable_supported"
    ? "intent_not_durable_supported"
    : output.preference_intent.durability !== "durable"
    ? "durability_not_durable"
    : output.preference_intent.support_status !== "supported"
    ? "support_not_supported"
    : writeUpdates.length === 0
    ? "no_locked_update"
    : null;

  if (
    output.flow_action === "write_preferences" ||
    output.flow_action === "confirm_proposed_mapping"
  ) {
    if (writeBlockedReason) {
      return {
        status: "blocked",
        reason_code: `update_coach_preferences_${writeBlockedReason}`,
        local_state: createCoachPreferenceLocalFlowState({
          previous: args.previous,
          status: "blocked",
          currentStage: "setting",
          proposedUpdates: proposedUpdates.filter((update) =>
            update.status !== "locked"
          ),
          unsupportedParts: output.unsupported_parts,
        }),
        visible_task: "write_failed_or_blocked",
        conversation_context: mergeConversationContext(conversationContext, {
          write_result: {
            ...conversationContext.write_result,
            committed: false,
            blocked_reason: writeBlockedReason,
          },
        }),
        note_information: null,
        write_updates: [],
        exit_to_global_dispatcher: false,
        safety_preempt: false,
        blocked_effects: [{
          type: "update_coach_preferences",
          reason_code: writeBlockedReason,
        }],
        evidence,
      };
    }
    return {
      status: "write_ready",
      reason_code: "update_coach_preferences_write_ready",
      local_state: createCoachPreferenceLocalFlowState({
        previous: args.previous,
        status: "write_ready",
        currentStage: "done",
        proposedUpdates: [],
        lastCommittedUpdates: [],
        unsupportedParts: output.unsupported_parts,
      }),
      visible_task: "preference_saved",
      conversation_context: mergeConversationContext(conversationContext, {
        field_or_stage: "done",
        known_values: {
          ...conversationContext.known_values,
          proposed_updates: [],
          committed_updates: writeUpdates,
        },
        write_result: {
          committed: false,
          preference_keys: writeUpdates.map((update) => update.key),
          blocked_reason: null,
        },
      }),
      note_information: null,
      write_updates: writeUpdates,
      exit_to_global_dispatcher: false,
      safety_preempt: false,
      blocked_effects: [],
      evidence,
    };
  }

  const stage = output.missing_decisions.includes("durability")
    ? "durability"
    : output.missing_decisions.includes("value")
    ? "value"
    : "setting";
  return {
    status: "collecting",
    reason_code: `update_coach_preferences_${output.flow_action}`,
    local_state: createCoachPreferenceLocalFlowState({
      previous: args.previous,
      status: "collecting",
      currentStage: stage,
      proposedUpdates: args.previous?.proposed_updates ?? [],
      unsupportedParts: output.unsupported_parts,
    }),
    visible_task: visibleTaskForClarification(output),
    conversation_context: conversationContext,
    note_information: noteInformation,
    write_updates: [],
    exit_to_global_dispatcher: false,
    safety_preempt: false,
    blocked_effects: [],
    evidence,
  };
}

export function dispatcherSystemPrompt(): string {
  return [
    "Tu es update_coach_preferences.local_dispatcher.",
    "Tu ne réponds jamais au user. Tu retournes uniquement un JSON strict.",
    "Tu es l'unique décideur métier du flow local. Le reducer validera ensuite les enums, le risque et les writes.",
    "Ne crée jamais de texte visible final. Remplis visible_task.kind et visible_task.conversation_context; l'agent visible écrira ensuite.",
    "Distingue durable clair, consigne ponctuelle, ambigu durable/ponctuel, réglage supporté, non supporté, mapping partiel, confirmation, révision, status, explication produit, cancel, topic change et safety.",
    "Les seules préférences durables supportées sont coach.tone, coach.challenge_level, coach.question_tendency.",
    "Valeurs supportées: coach.tone=soft|warm_direct|direct; coach.challenge_level=low|balanced|high; coach.question_tendency=low|normal|high.",
    "Ne stocke pas longueur exacte, emoji, jamais de question finale, ordre action-avant-question, format de réponse, règle conditionnelle cachée ou style trop spécifique.",
    "Si une demande hors support peut se traduire partiellement vers un réglage supporté, propose un mapping avec status=proposed et needs_user_confirmation=true.",
    "Si une demande est claire, durable et supportée, utilise flow_action=write_preferences et des preference_updates status=locked.",
    "Une demande de modification ponctuelle de posture reste dans ce domaine mais ne modifie jamais les préférences: si le user dit que c'est seulement pour cette conversation, cet échange, maintenant, ce tour-ci, ou précise de ne pas changer ses réglages, utilise flow_action=punctual_instruction, preference_intent.kind=punctual_instruction, durability=punctual, preference_updates=[], visible_task.kind=punctual_instruction_ack, note_information.needed=false. Après l'ack, le flow est fini: aucune proposition durable, aucune clarification durable/ponctuelle, aucun write.",
    "Si le user confirme une proposition active, utilise flow_action=confirm_proposed_mapping; tu peux retourner l'update locked ou laisser preference_updates vide si l'état actif porte déjà la proposition.",
    "Si le user veut arrêter ce flow, utilise exit_to_global_dispatcher avec note_information target_dispatcher=global. Utilise cancel_flow seulement pour une annulation locale de préférence sans changement de dispatcher.",
    "Si le user change clairement de sujet, utilise exit_to_global_dispatcher avec note_information.needed=true target_dispatcher=global.",
    "Si safety préempte, utilise safety_preempt avec note_information.needed=true target_dispatcher=safety_crisis.",
    "Si le user demande les préférences actives pendant ce flow, utilise status_question avec visible_task.kind=get_info_db et note_information target_dispatcher=status_recap.",
    "Si le user demande une explication produit des réglages, utilise explain_preferences avec visible_task.kind=get_info_product et note_information target_dispatcher=product_help.",
    "conversation_context doit être filtré pour l'agent visible: pas de DB brute, pas de mémoire brute, seulement les valeurs/propositions nécessaires.",
    ...directEffectLocalDispatcherPromptLines(),
    "",
    "Field Completion Rules:",
    "- flow_action: décision principale du tour courant. Choisis l'action qui reflète le dernier message user, pas seulement active_state. Utilise write_preferences seulement pour une préférence durable, supportée, claire et lockable. Utilise clarify_durable_vs_punctual quand la durée est incertaine; clarify_supported_setting ou clarify_value quand le réglage ou l'intensité manque. Utilise propose_supported_mapping pour une demande partiellement représentable, confirm_proposed_mapping quand le user confirme une proposition active, revise_preferences quand il corrige une proposition ou une valeur, punctual_instruction pour une consigne locale/non durable valable seulement pour le tour, l'échange courant ou la conversation actuelle, surtout si le user ajoute de ne pas changer ses réglages. unsupported_preference quand aucun réglage durable supporté ne couvre la demande, status_question pour une demande d'état DB, explain_preferences pour une explication produit, repeat_saved_preferences ou repeat_current_state pour répétition, exit_to_global_dispatcher pour arrêter le flow ou pour un nouveau sujet clair, cancel_flow pour annulation locale, complete_flow quand le flow est fini, handoff_to_local_flow seulement si une autre flow local doit reprendre, safety_preempt pour safety réelle.",
    "- confidence: high si l'intention et la valeur sont claires; medium si l'intention est probable mais une décision manque; low si le dispatcher doit surtout clarifier ou se protéger. Le reducer bloque les writes low confidence.",
    "- risk_score: score numérique local de risque. Mets 0 pour absence de risque observé. N'invente pas de safety. Si risque réel élevé/critique, choisis safety_preempt et remplis safety + note_information.",
    "- preference_intent: état métier local du tour. kind classe l'intention utilisateur; durability décrit durable/punctual/ambiguous/not_applicable; support_status décrit supported/unsupported/partial/ambiguous/not_applicable; summary résume sans inventer de profil global. Ce champ guide le reducer pour autoriser ou bloquer l'écriture.",
    "- preference_updates: liste uniquement les changements candidats sur coach.tone, coach.challenge_level, coach.question_tendency. status=locked seulement pour durable_supported clair sans confirmation requise et sans unsupported_parts non résolu qui change la portée. status=proposed pour mapping partiel, unsupported_parts non résolu, ou confirmation nécessaire. Si le user confirme explicitement qu'une proposition partielle doit devenir un réglage général durable, utilise confirm_proposed_mapping avec updates locked, support_status=supported, missing_decisions vide, needs_user_confirmation=false. status=missing si un champ manque; status=rejected si une demande évoquée ne doit pas être appliquée. Chaque update doit avoir key/value valides, labels visibles courts, reason, needs_user_confirmation, source, confidence et evidence. Ne mets jamais une préférence non supportée ici.",
    "- unsupported_parts: parties de la demande non stockables durablement depuis ce skill: longueur exacte, emoji, jamais de question finale, ordre de réponse, format, règle cachée, style trop spécifique. Garde ici seulement les parties encore actives/non résolues. Si le user abandonne explicitement la portée non stockable et confirme un réglage général durable, ne garde pas cette ancienne portée dans unsupported_parts; mets-la seulement dans evidence ou context_summary. L'agent visible reçoit unsupported_parts via conversation_context; elles ne doivent pas devenir des updates.",
    "- missing_decisions: mets durability, setting, value ou confirmation seulement si la prochaine étape locale doit demander cette décision. Vide si write_ready, punctual_instruction clair, unsupported final, status, product help, stop, exit ou safety.",
    "- visible_task.kind: stage visible exact. Utilise preference_saved seulement après write commit possible; ask_durable_vs_punctual pour durée ambiguë; ask_setting_or_value pour réglage/intensité manquant; confirm_supported_mapping pour mapping proposé; punctual_instruction_ack pour ponctuel; unsupported_preference pour non stockable; get_info_db pour status_recap; get_info_product pour product_help; repeat_* pour répétition; write_failed_or_blocked pour blocage; stop_or_cancel ou exit_or_cancel/exit_ack pour arrêt/sortie; safety_transition ou safety pour safety. Évite un stage générique si un stage précis existe.",
    "- visible_task.instruction: instruction courte pour l'agent visible, jamais un texte final à copier. Elle doit dire l'objectif du stage et les limites importantes.",
    "- visible_task.conversation_context: seul contexte utilisable par l'agent visible. Remplis state_summary, user_words, field_or_stage, known_values.current_preferences/proposed_updates/committed_updates, missing_or_weak_values, selected_candidate, unsupported_parts, write_result, inline_tool_result, tone_constraints, do_not_say, context_summary, evidence_used. Ne transmets jamais DB brute, mémoire brute, prompt interne ou note_information brute. Mets write_result.committed=false avant commit; le router/reducer le mettra à true seulement après DB commit.",
    "- note_information: obligatoire avec needed=true pour exit_to_global_dispatcher, safety_preempt, status_question/get_info_db, explain_preferences/get_info_product, handoff_to_local_flow. Utilise needed=false seulement pour une continuation locale sans changement de dispatcher. Elle est consommée par le dispatcher cible et ne va jamais brute au prompt visible. Structure canonique: source_flow_id, target_dispatcher, handoff_reason, handoff_context_for_next_dispatcher, user_words, structured_context non vide, confidence si utile. Ne mets jamais source_flow_presentation, source_flow_state_summary, target_local_dispatcher_hint, risk_score ou committed_effects dans la note.",
    "- exit_memo: présent seulement pour compatibilité/trace de sortie. needed=true pour topic_change, cancelled ou safety; reason doit correspondre. Laisser needed=false ou null-like quand le flow continue localement.",
    "- safety: remplir quand risk_score ou message indique un risque. should_preempt=true seulement avec safety_preempt. Sinon risk_band none/low, reason_codes vide, should_preempt=false.",
    "- evidence: indices sémantiques réellement utilisés: mots user, état actif, proposition précédente, note inbound, DB context compact. Pas de pseudo-preuves ni de mots-clés inventés. Le reducer et les logs s'en servent pour expliquer la décision.",
    "",
    "Transition Rules:",
    "- exit_to_global_dispatcher: user veut arrêter ce flow ou apporte un nouveau sujet clair hors préférences coach. note_information.needed=true target_dispatcher=global; aucun write; le global pourra réanalyser le même message.",
    "- cancel_flow: annulation locale sans changement de dispatcher; aucun write; pas de question finale.",
    "- safety_preempt: safety réelle. note_information.needed=true target_dispatcher=safety_crisis; aucun dispatcher global normal; aucun write.",
    "- handoff_to_local_flow: seulement si le contrat cible est nécessaire et autorisé. Produis une note_information canonique complète; ne l'utilise pas pour status_recap/product_help, qui passent par status_question/explain_preferences + inline tool boundary.",
    "- Anti-faux-positif: ne sors pas du flow quand le user répond à une clarification, confirme une proposition, révise une préférence, demande une répétition ou donne une consigne ponctuelle liée au flow.",
    "",
    'Example JSON 1 - continuation normale: {"flow_action":"write_preferences","confidence":"high","risk_score":0,"preference_intent":{"kind":"durable_supported","durability":"durable","support_status":"supported","summary":"Le user demande durablement moins de questions."},"preference_updates":[{"key":"coach.question_tendency","value":"low","status":"locked","user_facing_label":"Questions","user_facing_value":"Peu de questions","reason":"Demande durable claire.","needs_user_confirmation":false,"source":"user_message","confidence":"high","evidence":["à partir de maintenant","moins de questions"]}],"unsupported_parts":[],"missing_decisions":[],"visible_task":{"kind":"preference_saved","instruction":"Confirmer naturellement seulement après commit DB.","conversation_context":{"state_summary":"Préférence durable prête à écrire.","user_words":["à partir de maintenant","moins de questions"],"field_or_stage":"done","known_values":{"current_preferences":[],"proposed_updates":[],"committed_updates":[]},"missing_or_weak_values":[],"selected_candidate":{"key":"coach.question_tendency","value":"low"},"unsupported_parts":[],"write_result":{"committed":false,"preference_keys":["coach.question_tendency"],"blocked_reason":null},"inline_tool_result":{"skill_id":null,"summary":null},"tone_constraints":[],"do_not_say":["Ne pas dire enregistré si committed=false."],"context_summary":"Le user veut durablement réduire les questions.","evidence_used":["à partir de maintenant","moins de questions"]}},"note_information":{"needed":false},"exit_memo":{"needed":false,"reason":"none","flow_summary":null,"handoff_hint_for_global_dispatcher":null},"safety":{"risk_band":"none","reason_codes":[],"should_preempt":false},"evidence":["à partir de maintenant","moins de questions"]}',
    'Example JSON 2 - transition critique exit global: {"flow_action":"exit_to_global_dispatcher","confidence":"high","risk_score":0,"preference_intent":{"kind":"topic_change","durability":"not_applicable","support_status":"not_applicable","summary":"Le user abandonne les préférences et demande un autre sujet."},"preference_updates":[],"unsupported_parts":[],"missing_decisions":[],"visible_task":{"kind":"exit_ack","instruction":"Ne pas répondre au nouveau sujet; laisser le global reprendre.","conversation_context":{"state_summary":"Sortie du flow préférences vers un nouveau sujet.","user_words":["laisse ça","aide-moi à revoir mon plan"],"field_or_stage":null,"known_values":{"current_preferences":[],"proposed_updates":[],"committed_updates":[]},"missing_or_weak_values":[],"selected_candidate":{},"unsupported_parts":[],"write_result":{"committed":false,"preference_keys":[],"blocked_reason":null},"inline_tool_result":{"skill_id":null,"summary":null},"tone_constraints":[],"do_not_say":["Ne pas prétendre avoir écrit une préférence."],"context_summary":"Le user change clairement de sujet.","evidence_used":["laisse ça","revoir mon plan"]}},"note_information":{"needed":true,"source_flow_id":"update_coach_preferences","handoff_reason":"topic_change","target_dispatcher":"global","handoff_context_for_next_dispatcher":"Le user veut quitter les préférences coach et revoir son plan.","user_words":["laisse ça","aide-moi à revoir mon plan"],"structured_context":{"source_flow":"update_coach_preferences","user_message_summary":"Le user change de sujet vers la revue de plan.","active_flow_summary":"Aucun write en cours; sortie demandée.","collected_state":{"collected_updates":[]},"unresolved_questions":[],"recommended_next_focus":"revoir le plan"},"confidence":"high"},"exit_memo":{"needed":true,"reason":"topic_change","flow_summary":"Sortie sans write.","handoff_hint_for_global_dispatcher":"Reprendre sur la demande de revue de plan."},"safety":{"risk_band":"none","reason_codes":[],"should_preempt":false},"evidence":["laisse ça","revoir mon plan"]}',
    'Retourne exactement ce JSON: {"flow_action":"write_preferences|clarify_durable_vs_punctual|clarify_supported_setting|clarify_value|propose_supported_mapping|confirm_proposed_mapping|punctual_instruction|unsupported_preference|status_question|explain_preferences|revise_preferences|repeat_saved_preferences|repeat_current_state|inline_tool_roundtrip|exit_to_global_dispatcher|complete_flow|handoff_to_local_flow|cancel_flow|safety_preempt","confidence":"low|medium|high","risk_score":0,"preference_intent":{"kind":"durable_supported|durable_unsupported|punctual_instruction|ambiguous|status_question|explain|cancel|topic_change|safety","durability":"durable|punctual|ambiguous|not_applicable","support_status":"supported|unsupported|partial|ambiguous|not_applicable","summary":"string"},"preference_updates":[{"key":"coach.tone|coach.challenge_level|coach.question_tendency","value":"soft|warm_direct|direct|low|balanced|high|normal","status":"missing|proposed|locked|rejected","user_facing_label":"string","user_facing_value":"string","reason":"string","needs_user_confirmation":true,"source":"user_message|db_context|note_information|inference","confidence":"low|medium|high","evidence":["string"]}],"unsupported_parts":["string"],"missing_decisions":["durability|setting|value|confirmation"],"visible_task":{"kind":"preference_saved|ask_durable_vs_punctual|ask_setting_or_value|confirm_supported_mapping|punctual_instruction_ack|unsupported_preference|get_info_db|get_info_product|repeat_saved_preferences|repeat_current_state|write_failed_or_blocked|inline_tool_return|exit_or_cancel|stop_or_cancel|exit_ack|safety|safety_transition","instruction":"string","conversation_context":{"state_summary":"string","user_words":["string"],"field_or_stage":"durability|setting|value|confirmation|done|null","known_values":{"current_preferences":[],"proposed_updates":[],"committed_updates":[]},"missing_or_weak_values":[],"selected_candidate":{},"unsupported_parts":[],"write_result":{"committed":false,"preference_keys":[],"blocked_reason":null},"inline_tool_result":{"skill_id":"status_recap|product_help|null","summary":null},"tone_constraints":[],"do_not_say":[],"context_summary":"string|null","evidence_used":["string"]}},"note_information":{"needed":false,"source_flow_id":"update_coach_preferences","handoff_reason":"topic_change|safety|inline_tool|bridge|flow_interruption|explicit_user_request","target_dispatcher":"global|safety_crisis|product_help|status_recap|other_local","handoff_context_for_next_dispatcher":"string","user_words":["string"],"structured_context":{},"confidence":"low|medium|high"},"exit_memo":{"needed":true,"reason":"topic_change|cancelled|safety|none","flow_summary":"string|null","handoff_hint_for_global_dispatcher":"string|null"},"safety":{"risk_band":"none|low|medium|high|critical","reason_codes":[],"should_preempt":false},"evidence":["string"]}',
  ].join("\n");
}

export async function runCoachPreferenceLocalDispatcher(
  input: CoachPreferenceLocalDispatcherInput,
): Promise<CoachPreferenceLocalDispatcherOutput | null> {
  const userPrompt = JSON.stringify({
    task: "dispatch_update_coach_preferences_local_flow",
    current_user_message: input.user_message,
    recent_messages: input.recent_messages,
    active_state: input.active_state,
    note_information_inbound: input.note_information_inbound ?? null,
    db_context_pack: input.db_context_pack ?? null,
    micro_memory_context: input.micro_memory_context ?? {
      items: [],
      exclusions: [
        "no default memory retrieval for coach preferences",
        "no raw micro memory in visible prompt",
      ],
      budget: {
        max_items: 0,
        reason:
          "Current coach preferences and local state are enough for this closed write-skill.",
      },
    },
    platform_context: withDirectEffectLocalContext(
      input.platform_context ?? null,
      (input.platform_context as any)?.plan_snapshot ??
        (input.db_context_pack as any)?.plan_snapshot ??
        null,
    ),
    available_inline_tools: input.available_inline_tools ?? [
      "status_recap",
      "product_help",
    ],
    current_preferences: input.current_preferences,
    safety_risk_band: input.safety_risk_band ?? null,
    supported_mappings: {
      "coach.tone": ["soft", "warm_direct", "direct"],
      "coach.challenge_level": ["low", "balanced", "high"],
      "coach.question_tendency": ["low", "normal", "high"],
    },
    previous_proposal: input.active_state?.proposed_updates ?? [],
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
        source: "update_coach_preferences.local_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalizeCoachPreferenceLocalDispatcherOutput(raw);
  } catch (error) {
    console.warn("[UpdateCoachPreferences] local dispatcher failed", error);
    return null;
  }
}
