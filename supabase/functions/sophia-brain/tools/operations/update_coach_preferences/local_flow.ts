import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import type {
  CoachPreferenceLocalDispatcherOutput,
  CoachPreferenceLocalFlowAction,
  CoachPreferenceLocalUpdate,
  CoachPreferenceVisibleTaskKind,
} from "./contract.ts";
import type { CoachPreferenceLocalFlowState } from "./state.ts";
import { COACH_PREFERENCE_VALUES } from "./workflow.ts";

export type CoachPreferenceLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: CoachPreferenceLocalFlowState | null;
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
  write_updates: CoachPreferenceLocalUpdate[];
  exit_to_global_dispatcher: boolean;
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
  "write_failed_or_blocked",
  "exit_or_cancel",
  "safety",
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean).slice(0, 10)
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

function validValueForKey(key: CoachPreferenceLocalUpdate["key"], value: string) {
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
    missing_decisions: (Array.isArray(root.missing_decisions)
      ? root.missing_decisions.map((item) => stringValue(item)).filter((
        item,
      ) => ["durability", "setting", "value", "confirmation"].includes(item))
      : []) as CoachPreferenceLocalDispatcherOutput["missing_decisions"],
    visible_task: {
      kind: enumValue<CoachPreferenceVisibleTaskKind>(
        visibleRoot.kind,
        VISIBLE_TASKS,
        "ask_setting_or_value",
      ),
      instruction: stringValue(visibleRoot.instruction),
    },
    exit_memo: {
      needed: exitRoot.needed === true,
      reason: enumValue(
        exitRoot.reason,
        new Set(["topic_change", "cancelled", "safety", "none"]),
        "none",
      ),
      flow_summary: stringValue(exitRoot.flow_summary) || null,
      handoff_hint_for_global_dispatcher:
        stringValue(exitRoot.handoff_hint_for_global_dispatcher) || null,
    },
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
    unsupported_parts: args.unsupportedParts ?? args.previous?.unsupported_parts ??
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
      write_updates: [],
      exit_to_global_dispatcher: true,
      blocked_effects: [],
      evidence,
    };
  }
  if (output.flow_action === "cancel_flow") {
    return {
      status: "cancelled",
      reason_code: "update_coach_preferences_local_cancelled",
      local_state: createCoachPreferenceLocalFlowState({
        previous: args.previous,
        status: "cancelled",
        currentStage: "done",
      }),
      visible_task: "exit_or_cancel",
      write_updates: [],
      exit_to_global_dispatcher: false,
      blocked_effects: [],
      evidence,
    };
  }
  if (output.flow_action === "safety_preempt" || output.risk_score > RISK_WRITE_THRESHOLD) {
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
        ? "safety"
        : "write_failed_or_blocked",
      write_updates: [],
      exit_to_global_dispatcher: false,
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
      write_updates: [],
      exit_to_global_dispatcher: false,
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
      write_updates: [],
      exit_to_global_dispatcher: false,
      blocked_effects: [],
      evidence,
    };
  }

  const writeUpdates = proposedUpdates.filter((update) =>
    update.status === "locked"
  );
  const writeBlockedReason =
    output.confidence === "low"
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
        write_updates: [],
        exit_to_global_dispatcher: false,
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
      write_updates: writeUpdates,
      exit_to_global_dispatcher: false,
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
    write_updates: [],
    exit_to_global_dispatcher: false,
    blocked_effects: [],
    evidence,
  };
}

function dispatcherSystemPrompt(): string {
  return [
    "Tu es update_coach_preferences.local_dispatcher.",
    "Tu ne réponds jamais au user. Tu retournes uniquement un JSON strict.",
    "Tu es l'unique décideur métier du flow local. Le reducer validera ensuite les enums, le risque et les writes.",
    "Ne crée jamais de texte visible final. Remplis seulement visible_task.kind et une instruction courte.",
    "Distingue durable clair, consigne ponctuelle, ambigu durable/ponctuel, réglage supporté, non supporté, mapping partiel, confirmation, révision, status, explication produit, cancel, topic change et safety.",
    "Les seules préférences durables supportées sont coach.tone, coach.challenge_level, coach.question_tendency.",
    "Valeurs supportées: coach.tone=soft|warm_direct|direct; coach.challenge_level=low|balanced|high; coach.question_tendency=low|normal|high.",
    "Ne stocke pas longueur exacte, emoji, jamais de question finale, ordre action-avant-question, format de réponse, règle conditionnelle cachée ou style trop spécifique.",
    "Si une demande hors support peut se traduire partiellement vers un réglage supporté, propose un mapping avec status=proposed et needs_user_confirmation=true.",
    "Si une demande est claire, durable et supportée, utilise flow_action=write_preferences et des preference_updates status=locked.",
    "Si le user confirme une proposition active, utilise flow_action=confirm_proposed_mapping; tu peux retourner l'update locked ou laisser preference_updates vide si l'état actif porte déjà la proposition.",
    "Si le user change de sujet, retourne exit_to_global_dispatcher avec exit_memo.needed=true.",
    'Retourne exactement ce JSON: {"flow_action":"write_preferences|clarify_durable_vs_punctual|clarify_supported_setting|clarify_value|propose_supported_mapping|confirm_proposed_mapping|punctual_instruction|unsupported_preference|status_question|explain_preferences|revise_preferences|repeat_saved_preferences|cancel_flow|exit_to_global_dispatcher|safety_preempt","confidence":"low|medium|high","risk_score":0,"preference_intent":{"kind":"durable_supported|durable_unsupported|punctual_instruction|ambiguous|status_question|explain|cancel|topic_change|safety","durability":"durable|punctual|ambiguous|not_applicable","support_status":"supported|unsupported|partial|ambiguous|not_applicable","summary":"string"},"preference_updates":[{"key":"coach.tone|coach.challenge_level|coach.question_tendency","value":"soft|warm_direct|direct|low|balanced|high|normal","status":"missing|proposed|locked|rejected","user_facing_label":"string","user_facing_value":"string","reason":"string","needs_user_confirmation":true}],"unsupported_parts":["string"],"missing_decisions":["durability|setting|value|confirmation"],"visible_task":{"kind":"preference_saved|ask_durable_vs_punctual|ask_setting_or_value|confirm_supported_mapping|punctual_instruction_ack|unsupported_preference|get_info_db|get_info_product|repeat_saved_preferences|write_failed_or_blocked|exit_or_cancel|safety","instruction":"string"},"exit_memo":{"needed":true,"reason":"topic_change|cancelled|safety|none","flow_summary":"string|null","handoff_hint_for_global_dispatcher":"string|null"},"evidence":["string"]}',
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
