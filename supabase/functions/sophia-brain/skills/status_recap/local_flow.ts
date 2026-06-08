import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type {
  StatusRecapLocalDispatcherOutput,
  StatusRecapLocalFlowAction,
  StatusRecapLocalFlowState,
  StatusRecapObjectType,
  StatusRecapProjection,
  StatusRecapProjectionSummary,
  StatusRecapVisibleTaskKind,
} from "./contract.ts";

export const STATUS_RECAP_FLOW_STATE_KEY = "__status_recap_flow_state_v1";
export const STATUS_RECAP_EXIT_MEMO_KEY = "__last_status_recap_exit_memo";

export type StatusRecapLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: StatusRecapLocalFlowState | null;
  projection_summary: StatusRecapProjectionSummary;
  last_answer_summary: string | null;
  route_decision: unknown;
  turn_frame: unknown;
};

export type StatusRecapLocalDispatcher = (
  input: StatusRecapLocalDispatcherInput,
) => Promise<StatusRecapLocalDispatcherOutput | null>;

export type StatusRecapReducerResult = {
  status: "answered" | "closing" | "closed" | "exit" | "safety" | "blocked";
  reason_code: string;
  local_state: StatusRecapLocalFlowState | null;
  visible_task: StatusRecapVisibleTaskKind;
  exit_to_global_dispatcher: boolean;
  grounded_facts_json: Record<string, unknown>;
  answer_summary: string | null;
  blocked_effects: Array<{ type: string; reason_code: string }>;
  evidence: string[];
};

const FLOW_ACTIONS = new Set([
  "answer_status",
  "answer_object_status",
  "answer_coach_preferences_status",
  "answer_cancelled_objects",
  "answer_recent_effects",
  "answer_fait_prevu_fragile",
  "narrow_scope",
  "repeat_last_status",
  "explain_sources",
  "no_source_status",
  "human_recap_no_db",
  "cancel_flow",
  "exit_to_global_dispatcher",
  "safety_preempt",
]);

const VISIBLE_TASKS = new Set([
  "status_compact",
  "object_status",
  "coach_preferences_status",
  "cancelled_objects",
  "recent_effects",
  "fait_prevu_fragile",
  "narrow_scope_question",
  "repeat_status",
  "explain_sources",
  "no_source",
  "human_recap_redirect",
  "exit_or_cancel",
  "safety",
]);

const STATUS_INTENTS = new Set([
  "durable_status",
  "object_status",
  "recent_effects_recap",
  "fait_prevu_fragile",
  "cancelled_objects",
  "coach_preferences_status",
  "human_recap_no_db",
  "unclear",
  "not_status",
  "safety",
]);

const OBJECT_TYPES = new Set([
  "attack_card",
  "defense_card",
  "one_shot_reminder",
  "recurring_reminder",
  "potion",
  "coach_preference",
  "plan_item",
  "memory",
  "unknown",
]);

const READ_CATEGORIES = new Set([
  "attack_cards",
  "defense_cards",
  "one_shot_reminders",
  "recurring_reminders",
  "potions",
  "coach_preferences",
  "recent_effects",
  "all",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function stringArray(value: unknown, max = 10): string[] {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean).slice(0, max)
    : [];
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) return raw;
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
    throw new Error("status_recap_local_dispatcher_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!isRecord(parsed)) {
    throw new Error("status_recap_local_dispatcher_not_object");
  }
  return parsed;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: Set<string>,
  fallback: T,
): T {
  const raw = stringValue(value);
  return allowed.has(raw) ? raw as T : fallback;
}

function riskScore(value: unknown): number {
  const score = Number(value ?? 0);
  return Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
}

function confidence(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
}

function objectTypes(value: unknown): StatusRecapObjectType[] {
  const values = Array.isArray(value) ? value : [];
  const normalized = values.map((item) =>
    enumValue<StatusRecapObjectType>(item, OBJECT_TYPES, "unknown")
  );
  return normalized.length ? normalized.slice(0, 8) : ["unknown"];
}

export function statusRecapProjectionSummary(
  projection: StatusRecapProjection,
): StatusRecapProjectionSummary {
  return {
    attack_card_count: projection.attack_cards.length,
    defense_card_count: projection.defense_cards.length,
    one_shot_pending_count: projection.one_shot_reminders.pending.length,
    one_shot_cancelled_recent_count:
      projection.one_shot_reminders.cancelled_recent.length,
    recurring_reminder_count: projection.recurring_reminders.length,
    potion_session_count: projection.potion_sessions.length,
    coach_preference_count: projection.coach_preferences.length,
    recent_effect_history_count: projection.recent_effect_history.length,
  };
}

export function readStatusRecapFlowState(
  tempMemory: unknown,
): StatusRecapLocalFlowState | null {
  const raw = isRecord(tempMemory)
    ? tempMemory[STATUS_RECAP_FLOW_STATE_KEY]
    : null;
  if (!isRecord(raw) || raw.skill_id !== "status_recap") return null;
  if (raw.mode !== "local_readonly_flow") return null;
  const status = stringValue(raw.status);
  if (
    !["active", "closing", "closed", "exit_to_global", "safety"].includes(
      status,
    )
  ) {
    return null;
  }
  return raw as StatusRecapLocalFlowState;
}

export function hasActiveStatusRecapFlow(tempMemory: unknown): boolean {
  return readStatusRecapFlowState(tempMemory)?.status === "active";
}

export function writeStatusRecapFlowState(
  tempMemory: unknown,
  state: StatusRecapLocalFlowState | null,
): Record<string, unknown> {
  const next = { ...((tempMemory ?? {}) as Record<string, unknown>) };
  if (state) next[STATUS_RECAP_FLOW_STATE_KEY] = state;
  else delete next[STATUS_RECAP_FLOW_STATE_KEY];
  return next;
}

export function createStatusRecapFlowState(args: {
  previous?: StatusRecapLocalFlowState | null;
  status?: StatusRecapLocalFlowState["status"];
  lastIntent: StatusRecapLocalFlowState["last_intent"];
  lastTargetObjects: StatusRecapObjectType[];
  lastProjectionSummary: StatusRecapProjectionSummary;
  lastAnswerSummary: string | null;
  turnCountIncrement?: number;
}): StatusRecapLocalFlowState {
  const now = new Date().toISOString();
  const previousTurns = Number(args.previous?.turn_count ?? 0);
  const increment = Number(args.turnCountIncrement ?? 1);
  const maxTurns = Number(args.previous?.max_turns ?? 3) || 3;
  return {
    skill_id: "status_recap",
    mode: "local_readonly_flow",
    status: args.status ?? args.previous?.status ?? "active",
    last_intent: args.lastIntent,
    last_target_objects: args.lastTargetObjects,
    last_projection_summary: args.lastProjectionSummary,
    last_answer_summary: args.lastAnswerSummary,
    turn_count: Math.max(0, previousTurns + increment),
    max_turns: maxTurns,
    created_at: args.previous?.created_at ?? now,
    updated_at: now,
  };
}

export function normalizeStatusRecapLocalDispatcherOutput(
  raw: unknown,
): StatusRecapLocalDispatcherOutput {
  const root = parseJsonObject(raw);
  const flowAction = enumValue<StatusRecapLocalFlowAction>(
    root.flow_action,
    FLOW_ACTIONS,
    "narrow_scope",
  );
  const intentRoot = isRecord(root.status_intent) ? root.status_intent : {};
  const readScopeRoot = isRecord(root.read_scope) ? root.read_scope : {};
  const stateRoot = isRecord(root.state_updates) ? root.state_updates : {};
  const visibleRoot = isRecord(root.visible_task) ? root.visible_task : {};
  const exitRoot = isRecord(root.exit_memo) ? root.exit_memo : {};
  const exitContext = isRecord(exitRoot.local_flow_context)
    ? exitRoot.local_flow_context
    : {};
  const exitHint = isRecord(exitRoot.handoff_hint_for_global_dispatcher)
    ? exitRoot.handoff_hint_for_global_dispatcher
    : {};
  const exitNeeded = flowAction === "exit_to_global_dispatcher" ||
    flowAction === "safety_preempt" || exitRoot.needed === true;
  return {
    flow_action: flowAction,
    confidence: confidence(root.confidence),
    risk_score: riskScore(root.risk_score),
    status_intent: {
      kind: enumValue(intentRoot.kind, STATUS_INTENTS, "unclear"),
      summary: stringValue(intentRoot.summary),
      requires_db_projection: intentRoot.requires_db_projection !== false,
      requires_effect_history: intentRoot.requires_effect_history === true ||
        flowAction === "answer_recent_effects",
    },
    target_objects: objectTypes(root.target_objects),
    read_scope: {
      requested_categories:
        (Array.isArray(readScopeRoot.requested_categories)
          ? readScopeRoot.requested_categories
          : ["all"]).map((item) => enumValue(item, READ_CATEGORIES, "all")),
      include_cancelled: readScopeRoot.include_cancelled === true ||
        flowAction === "answer_cancelled_objects",
      include_recent_failed_or_blocked_effects:
        readScopeRoot.include_recent_failed_or_blocked_effects === true ||
        flowAction === "answer_recent_effects",
      format: enumValue(
        readScopeRoot.format,
        new Set(["compact", "object_answer", "recap", "fait_prevu_fragile"]),
        "compact",
      ),
    },
    state_updates: {
      status: enumValue(
        stateRoot.status,
        new Set(["active", "closing", "closed", "exit_to_global", "safety"]),
        flowAction === "cancel_flow" ? "closed" : "active",
      ),
      turn_count_increment: Math.max(
        0,
        Math.min(1, Number(stateRoot.turn_count_increment ?? 1) || 1),
      ),
      close_after_visible: stateRoot.close_after_visible === true,
    },
    visible_task: {
      kind: enumValue<StatusRecapVisibleTaskKind>(
        visibleRoot.kind,
        VISIBLE_TASKS,
        "status_compact",
      ),
      instruction: stringValue(visibleRoot.instruction),
    },
    exit_memo: {
      needed: exitNeeded,
      reason: enumValue(
        exitRoot.reason,
        new Set([
          "topic_change",
          "explicit_tool_request",
          "product_help",
          "preference_update",
          "new_goal",
          "confirmation_for_other_flow",
          "safety",
          "unknown",
          "none",
        ]),
        exitNeeded ? "unknown" : "none",
      ),
      user_intent_summary: stringValue(exitRoot.user_intent_summary) || null,
      local_flow_context: {
        skill_id: "status_recap",
        last_intent: stringValue(exitContext.last_intent) || null,
        last_target_objects: objectTypes(exitContext.last_target_objects),
        last_answer_summary: stringValue(exitContext.last_answer_summary) ||
          null,
        last_projection_summary:
          stringValue(exitContext.last_projection_summary) || null,
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: enumValue(
          exitHint.likely_intent,
          new Set([
            "prepare_attack_card",
            "prepare_defense_card",
            "select_state_potion",
            "update_coach_preferences",
            "one_shot_reminder",
            "recurring_reminder",
            "product_help",
            "normal_coaching",
            "unknown",
          ]),
          "unknown",
        ),
        why: stringValue(exitHint.why) || null,
        constraints: stringArray(exitHint.constraints, 4),
      },
    },
    evidence: stringArray(root.evidence),
  };
}

function projectionHasAnySource(
  summary: StatusRecapProjectionSummary,
): boolean {
  return Object.values(summary).some((count) => Number(count) > 0);
}

function answerSummary(output: StatusRecapLocalDispatcherOutput): string {
  return output.status_intent.summary ||
    `${output.flow_action}:${output.visible_task.kind}`;
}

export function groundedStatusRecapFacts(args: {
  output: StatusRecapLocalDispatcherOutput;
  projection: StatusRecapProjection;
  projectionSummary: StatusRecapProjectionSummary;
  previous: StatusRecapLocalFlowState | null;
}): Record<string, unknown> {
  return {
    projection_summary: args.projectionSummary,
    requested_categories: args.output.read_scope.requested_categories,
    target_objects: args.output.target_objects,
    include_cancelled: args.output.read_scope.include_cancelled,
    include_recent_failed_or_blocked_effects:
      args.output.read_scope.include_recent_failed_or_blocked_effects,
    format: args.output.read_scope.format,
    facts: {
      attack_cards: args.projection.attack_cards,
      defense_cards: args.projection.defense_cards,
      one_shot_reminders: args.projection.one_shot_reminders,
      recurring_reminders: args.projection.recurring_reminders,
      potion_sessions: args.projection.potion_sessions,
      coach_preferences: args.projection.coach_preferences,
      recent_effect_history: args.projection.recent_effect_history,
    },
    previous_answer_summary: args.previous?.last_answer_summary ?? null,
  };
}

export function reduceStatusRecapLocalDispatcherOutput(args: {
  previous: StatusRecapLocalFlowState | null;
  output: StatusRecapLocalDispatcherOutput;
  projection: StatusRecapProjection;
}): StatusRecapReducerResult {
  const projectionSummary = statusRecapProjectionSummary(args.projection);
  const output = args.output;
  const summary = answerSummary(output);
  if (output.flow_action === "exit_to_global_dispatcher") {
    if (!output.exit_memo.needed || output.exit_memo.reason === "none") {
      return {
        status: "blocked",
        reason_code: "status_recap_exit_memo_required",
        local_state: createStatusRecapFlowState({
          previous: args.previous,
          status: "active",
          lastIntent: "unclear",
          lastTargetObjects: output.target_objects,
          lastProjectionSummary: projectionSummary,
          lastAnswerSummary: args.previous?.last_answer_summary ?? null,
        }),
        visible_task: "exit_or_cancel",
        exit_to_global_dispatcher: false,
        grounded_facts_json: {},
        answer_summary: null,
        blocked_effects: [{
          type: "status_recap",
          reason_code: "exit_memo_required",
        }],
        evidence: output.evidence,
      };
    }
    return {
      status: "exit",
      reason_code: "status_recap_local_exit_to_global_dispatcher",
      local_state: createStatusRecapFlowState({
        previous: args.previous,
        status: "exit_to_global",
        lastIntent: args.previous?.last_intent ?? "unclear",
        lastTargetObjects: args.previous?.last_target_objects ??
          output.target_objects,
        lastProjectionSummary: projectionSummary,
        lastAnswerSummary: args.previous?.last_answer_summary ?? null,
      }),
      visible_task: "exit_or_cancel",
      exit_to_global_dispatcher: true,
      grounded_facts_json: {},
      answer_summary: null,
      blocked_effects: [],
      evidence: output.evidence,
    };
  }
  if (output.flow_action === "safety_preempt" || output.risk_score >= 7) {
    return {
      status: "safety",
      reason_code: "status_recap_safety_preempt",
      local_state: createStatusRecapFlowState({
        previous: args.previous,
        status: "safety",
        lastIntent: "unclear",
        lastTargetObjects: output.target_objects,
        lastProjectionSummary: projectionSummary,
        lastAnswerSummary: args.previous?.last_answer_summary ?? null,
      }),
      visible_task: "safety",
      exit_to_global_dispatcher: false,
      grounded_facts_json: {},
      answer_summary: null,
      blocked_effects: [{
        type: "status_recap",
        reason_code: "safety_preempt",
      }],
      evidence: output.evidence,
    };
  }
  if (output.flow_action === "cancel_flow") {
    return {
      status: "closed",
      reason_code: "status_recap_local_cancelled",
      local_state: createStatusRecapFlowState({
        previous: args.previous,
        status: "closed",
        lastIntent: args.previous?.last_intent ?? "unclear",
        lastTargetObjects: args.previous?.last_target_objects ??
          output.target_objects,
        lastProjectionSummary: projectionSummary,
        lastAnswerSummary: args.previous?.last_answer_summary ?? null,
      }),
      visible_task: "exit_or_cancel",
      exit_to_global_dispatcher: false,
      grounded_facts_json: {},
      answer_summary: null,
      blocked_effects: [],
      evidence: output.evidence,
    };
  }
  const requiresProjection = output.status_intent.requires_db_projection;
  const hasSource = projectionHasAnySource(projectionSummary);
  const noSourceEligible = output.flow_action === "answer_status" ||
    output.flow_action === "answer_object_status" ||
    output.flow_action === "answer_coach_preferences_status" ||
    output.flow_action === "answer_cancelled_objects" ||
    output.flow_action === "answer_recent_effects" ||
    output.flow_action === "answer_fait_prevu_fragile" ||
    output.flow_action === "no_source_status";
  const visibleTask = noSourceEligible && requiresProjection && !hasSource &&
      output.visible_task.kind !== "narrow_scope_question"
    ? "no_source"
    : output.visible_task.kind;
  const currentTurns = Number(args.previous?.turn_count ?? 0) +
    output.state_updates.turn_count_increment;
  const shouldClose = output.state_updates.close_after_visible ||
    currentTurns >= Number(args.previous?.max_turns ?? 3);
  const stateStatus = shouldClose ? "closing" : output.state_updates.status;
  const intentKind = STATUS_INTENTS.has(output.status_intent.kind)
    ? output.status_intent.kind
    : "unclear";
  const localState = createStatusRecapFlowState({
    previous: args.previous,
    status: stateStatus === "closed" ? "closed" : stateStatus,
    lastIntent: intentKind === "not_status" || intentKind === "safety"
      ? "unclear"
      : intentKind,
    lastTargetObjects: output.target_objects,
    lastProjectionSummary: projectionSummary,
    lastAnswerSummary: summary,
    turnCountIncrement: output.state_updates.turn_count_increment,
  });
  return {
    status: shouldClose ? "closing" : "answered",
    reason_code: `status_recap_local_${output.flow_action}`,
    local_state: localState,
    visible_task: visibleTask,
    exit_to_global_dispatcher: false,
    grounded_facts_json: groundedStatusRecapFacts({
      output,
      projection: args.projection,
      projectionSummary,
      previous: args.previous,
    }),
    answer_summary: summary,
    blocked_effects: [],
    evidence: output.evidence,
  };
}

function dispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local du flow status_recap.",
    "status_recap est read-only et DB-grounded. Tu ne réponds jamais directement au user.",
    "Tu retournes uniquement un JSON conforme au contrat. Tu ne crées, modifies, annules, actives, confirmes ou programmes rien.",
    "Le dispatcher global ne doit pas tourner pendant ce flow actif. Tu sors vers lui seulement avec flow_action=exit_to_global_dispatcher et exit_memo.needed=true.",
    "Si le user demande de créer, modifier, annuler, activer, confirmer, changer une préférence, ou demande où/comment dans le produit, sors vers le dispatcher global.",
    "Si le user demande une catégorie précise, une répétition, les sources, les rappels, les préférences coach, les annulés, les effets récents, ou fait/prévu/fragile, reste dans status_recap.",
    "Un recap humain de conversation n'est pas un status DB: utilise human_recap_no_db ou exit_to_global_dispatcher vers normal_coaching.",
    'Retourne exactement ce JSON: {"flow_action":"answer_status|answer_object_status|answer_coach_preferences_status|answer_cancelled_objects|answer_recent_effects|answer_fait_prevu_fragile|narrow_scope|repeat_last_status|explain_sources|no_source_status|human_recap_no_db|cancel_flow|exit_to_global_dispatcher|safety_preempt","confidence":"low|medium|high","risk_score":0,"status_intent":{"kind":"durable_status|object_status|recent_effects_recap|fait_prevu_fragile|cancelled_objects|coach_preferences_status|human_recap_no_db|unclear|not_status|safety","summary":"string","requires_db_projection":true,"requires_effect_history":false},"target_objects":["attack_card|defense_card|one_shot_reminder|recurring_reminder|potion|coach_preference|plan_item|memory|unknown"],"read_scope":{"requested_categories":["attack_cards|defense_cards|one_shot_reminders|recurring_reminders|potions|coach_preferences|recent_effects|all"],"include_cancelled":false,"include_recent_failed_or_blocked_effects":false,"format":"compact|object_answer|recap|fait_prevu_fragile"},"state_updates":{"status":"active|closing|closed|exit_to_global|safety","turn_count_increment":1,"close_after_visible":false},"visible_task":{"kind":"status_compact|object_status|coach_preferences_status|cancelled_objects|recent_effects|fait_prevu_fragile|narrow_scope_question|repeat_status|explain_sources|no_source|human_recap_redirect|exit_or_cancel|safety","instruction":"string"},"exit_memo":{"needed":false,"reason":"topic_change|explicit_tool_request|product_help|preference_update|new_goal|confirmation_for_other_flow|safety|unknown|none","user_intent_summary":"string|null","local_flow_context":{"skill_id":"status_recap","last_intent":"string|null","last_target_objects":[],"last_answer_summary":"string|null","last_projection_summary":"string|null"},"handoff_hint_for_global_dispatcher":{"likely_intent":"prepare_attack_card|prepare_defense_card|select_state_potion|update_coach_preferences|one_shot_reminder|recurring_reminder|product_help|normal_coaching|unknown","why":"string|null","constraints":["Status recap was read-only and did not mutate anything.","Do not treat previous status facts as a request to create or modify unless the current user message asks for it."]}},"evidence":["string"]}',
  ].join("\n");
}

export async function runStatusRecapLocalDispatcher(
  input: StatusRecapLocalDispatcherInput,
): Promise<StatusRecapLocalDispatcherOutput | null> {
  const userPrompt = JSON.stringify({
    task: "dispatch_status_recap_local_flow",
    current_user_message: input.user_message,
    status_recap_state_json: input.active_state,
    projection_summary_json: input.projection_summary,
    last_answer_summary: input.last_answer_summary,
    conversation_excerpt: input.recent_messages,
    route_decision: input.route_decision,
    turn_frame: input.turn_frame,
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
        source: "status_recap.local_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalizeStatusRecapLocalDispatcherOutput(raw);
  } catch (error) {
    console.warn("[StatusRecap] local dispatcher failed", error);
    return null;
  }
}
