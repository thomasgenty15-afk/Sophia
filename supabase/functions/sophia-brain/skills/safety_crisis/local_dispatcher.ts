import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type { RunSkillInput } from "../_shared/skill_helpers.ts";
import {
  emptySafetySignal,
  type SafetyCrisisLocalDispatcherOutput,
  type SafetyCrisisLocalFlowAction,
  type SafetyCrisisProductToolAttemptKind,
  type SafetyCrisisResolutionFact,
  type SafetyCrisisSnapshot,
  type SafetySignal,
} from "./contract.ts";

export type SafetyCrisisLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: RunSkillInput["context"]["recent_messages"];
  source_safety_pregate: {
    risk_band: SafetyCrisisSnapshot["source_risk_band"];
    reason_codes?: string[];
    evidence?: unknown[];
  };
  previous_active_safety_state: RunSkillInput["context"][
    "active_skill_working_state"
  ];
  prior_phase: string | null;
  prior_known_facts: Record<string, unknown>;
  channel?: string | null;
  timezone?: string | null;
  turn_frame: unknown;
};

export type SafetyCrisisLocalDispatcher = (
  input: SafetyCrisisLocalDispatcherInput,
) => Promise<SafetyCrisisLocalDispatcherOutput | null>;

const FLOW_ACTIONS = new Set([
  "answer_safety_check",
  "provide_means_status",
  "provide_alone_status",
  "provide_support_status",
  "provide_emergency_status",
  "provide_deescalation_evidence",
  "needs_grounding",
  "repeat_current_step",
  "product_or_tool_attempt",
  "wants_to_exit",
  "safety_escalate",
]);

const CURRENT_NEEDS = new Set([
  "immediate_risk_check",
  "grounding",
  "move_means_away",
  "contact_human",
  "stay_with_support",
  "exit_request",
  "unclear",
]);

const PRODUCT_TOOL_ATTEMPTS = new Set([
  "product_question",
  "tool_creation",
  "plan_work",
  "status_request",
  "none",
]);

const RESOLUTION_FACTS = new Set([
  "immediate_danger_absent",
  "means_safe",
  "human_support_available",
  "not_alone",
  "no_fresh_risk_signal",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableString(value: unknown, max = 320): string | null {
  const text = stringValue(value).slice(0, max);
  return text || null;
}

function stringArray(value: unknown, max = 12): string[] {
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
    throw new Error("safety_crisis_local_dispatcher_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!isRecord(parsed)) {
    throw new Error("safety_crisis_local_dispatcher_not_object");
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

function confidence(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
}

function riskScore(value: unknown): number {
  const score = Number(value ?? 0);
  return Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
}

function booleanOrFalse(value: unknown): boolean {
  return value === true;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function uncertainty(value: unknown): SafetySignal["uncertainty"] {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : "high";
}

function rejectForbiddenMutations(root: Record<string, unknown>) {
  for (
    const key of [
      "operation_suggestions",
      "requested_effects",
      "allowed_effects",
      "committed_effects",
    ]
  ) {
    const value = root[key];
    if (Array.isArray(value) && value.length > 0) {
      throw new Error(`safety_crisis_local_dispatcher_forbidden_${key}`);
    }
  }
  if (isRecord(root.pending_confirmation)) {
    throw new Error("safety_crisis_local_dispatcher_forbidden_confirmation");
  }
}

function normalizeNoTooling(
  value: unknown,
): SafetyCrisisLocalDispatcherOutput["no_tooling"] {
  const root = isRecord(value) ? value : {};
  const noTooling = {
    product_help_called: false,
    status_recap_called: false,
    tool_skill_called: false,
    operation_suggestion_created: false,
    pending_confirmation_created: false,
    db_write_committed: false,
  } as const;
  for (const key of Object.keys(noTooling)) {
    if (root[key] === true) {
      throw new Error(`safety_crisis_local_dispatcher_tooling_${key}`);
    }
  }
  return noTooling;
}

export function normalizeSafetyCrisisLocalDispatcherOutput(
  raw: unknown,
): SafetyCrisisLocalDispatcherOutput {
  const root = parseJsonObject(raw);
  rejectForbiddenMutations(root);
  const signalsRoot = isRecord(root.safety_signals) ? root.safety_signals : {};
  const summaryRoot = isRecord(root.user_state_summary)
    ? root.user_state_summary
    : {};
  const boundaryRoot = isRecord(root.product_tool_boundary)
    ? root.product_tool_boundary
    : {};
  const exitRoot = isRecord(root.exit_request) ? root.exit_request : {};
  const hintsRoot = isRecord(root.state_hints) ? root.state_hints : {};
  const flowAction = enumValue<SafetyCrisisLocalFlowAction>(
    root.flow_action,
    FLOW_ACTIONS,
    "answer_safety_check",
  );
  const attempted = boundaryRoot.attempted === true ||
    flowAction === "product_or_tool_attempt";

  return {
    flow_action: flowAction,
    confidence: confidence(root.confidence),
    risk_score: riskScore(root.risk_score),
    safety_signals: emptySafetySignal({
      suicidal_ideation: booleanOrFalse(signalsRoot.suicidal_ideation),
      self_harm_intent: booleanOrFalse(signalsRoot.self_harm_intent),
      immediate_danger: booleanOrNull(signalsRoot.immediate_danger),
      has_means_nearby: booleanOrNull(signalsRoot.has_means_nearby),
      means_moved_away: booleanOrNull(signalsRoot.means_moved_away),
      user_currently_alone: booleanOrNull(signalsRoot.user_currently_alone),
      human_support_available: booleanOrNull(
        signalsRoot.human_support_available,
      ),
      emergency_help_contacted: booleanOrNull(
        signalsRoot.emergency_help_contacted,
      ),
      clarified_non_immediate: booleanOrFalse(
        signalsRoot.clarified_non_immediate,
      ),
      deescalation_evidence: booleanOrFalse(
        signalsRoot.deescalation_evidence,
      ),
      uncertainty: uncertainty(signalsRoot.uncertainty),
    }),
    user_state_summary: {
      paraphrase: nullableString(summaryRoot.paraphrase),
      current_need: enumValue(
        summaryRoot.current_need,
        CURRENT_NEEDS,
        "unclear",
      ),
      what_changed_since_previous_turn: nullableString(
        summaryRoot.what_changed_since_previous_turn,
      ),
    },
    product_tool_boundary: {
      attempted,
      attempt_kind: enumValue<SafetyCrisisProductToolAttemptKind>(
        boundaryRoot.attempt_kind,
        PRODUCT_TOOL_ATTEMPTS,
        attempted ? "tool_creation" : "none",
      ),
      defer_reason: nullableString(boundaryRoot.defer_reason),
    },
    exit_request: {
      requested: exitRoot.requested === true ||
        flowAction === "wants_to_exit",
      why_user_thinks_safe: nullableString(exitRoot.why_user_thinks_safe),
      missing_resolution_facts: stringArray(
        exitRoot.missing_resolution_facts,
        8,
      ).filter((fact): fact is SafetyCrisisResolutionFact =>
        RESOLUTION_FACTS.has(fact)
      ),
    },
    state_hints: {
      suggested_trigger_summary: nullableString(
        hintsRoot.suggested_trigger_summary,
      ),
      suggested_last_user_safety_signal: nullableString(
        hintsRoot.suggested_last_user_safety_signal,
      ),
    },
    no_tooling: normalizeNoTooling(root.no_tooling),
    evidence: stringArray(root.evidence, 12),
  };
}

let dispatcherForTest: SafetyCrisisLocalDispatcher | null = null;

export function setSafetyCrisisLocalDispatcherForTest(
  dispatcher: SafetyCrisisLocalDispatcher | null,
) {
  dispatcherForTest = dispatcher;
}

function compactRecentMessages(
  recentMessages: SafetyCrisisLocalDispatcherInput["recent_messages"],
) {
  return recentMessages.slice(-8).map((message) => ({
    role: message.role,
    content: String(message.content ?? "").replace(/\s+/g, " ").trim().slice(
      0,
      280,
    ),
  }));
}

function dispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local structure du flow safety_crisis.",
    "Le flow safety_crisis est actif ou vient d'etre selectionne par la couche safety. Tu n'es pas le dispatcher global.",
    "Tu ne reponds jamais directement au user. Tu retournes uniquement un JSON strict conforme au contrat.",
    "Mission: comprendre ce que le message user apporte au flow safety: danger immediat, auto-agression, moyens dangereux proches ou eloignes, solitude, aide humaine, aide d'urgence, desescalade, grounding, repetition, tentative produit/outil/plan/statut, demande de sortie.",
    "Tu ne choisis pas la phase finale et tu ne declares jamais le flow resolved. Le reducer safety choisira la phase et la prochaine tache visible.",
    "L'assistant IA ne compte jamais comme aide humaine.",
    '"Je vais mieux" ne suffit pas a resoudre le flow sans faits sur danger immediat, moyens, solitude/support.',
    "Si le user demande une potion, une carte, un plan, un rappel, une preference, un statut ou une aide produit pendant safety, retourne product_or_tool_attempt. Ne route pas.",
    "Ne propose aucun outil, ne cree aucun effet durable, ne cree aucune confirmation, ne baisse jamais le risque sur une formulation vague.",
    'Si une information est absente, retourne null. Si la formulation est contradictoire ou ambigue, uncertainty="high".',
    "no_tooling.* doit toujours etre false.",
    'Retourne exactement ce JSON: {"flow_action":"answer_safety_check|provide_means_status|provide_alone_status|provide_support_status|provide_emergency_status|provide_deescalation_evidence|needs_grounding|repeat_current_step|product_or_tool_attempt|wants_to_exit|safety_escalate","confidence":"low|medium|high","risk_score":0,"safety_signals":{"suicidal_ideation":false,"self_harm_intent":false,"immediate_danger":true,"has_means_nearby":true,"means_moved_away":false,"user_currently_alone":true,"human_support_available":false,"emergency_help_contacted":false,"clarified_non_immediate":false,"deescalation_evidence":false,"uncertainty":"low|medium|high"},"user_state_summary":{"paraphrase":"string|null","current_need":"immediate_risk_check|grounding|move_means_away|contact_human|stay_with_support|exit_request|unclear","what_changed_since_previous_turn":"string|null"},"product_tool_boundary":{"attempted":false,"attempt_kind":"product_question|tool_creation|plan_work|status_request|none","defer_reason":"string|null"},"exit_request":{"requested":false,"why_user_thinks_safe":"string|null","missing_resolution_facts":["immediate_danger_absent|means_safe|human_support_available|not_alone|no_fresh_risk_signal"]},"state_hints":{"suggested_trigger_summary":"string|null","suggested_last_user_safety_signal":"string|null"},"no_tooling":{"product_help_called":false,"status_recap_called":false,"tool_skill_called":false,"operation_suggestion_created":false,"pending_confirmation_created":false,"db_write_committed":false},"evidence":["string"]}',
  ].join("\n");
}

export async function runSafetyCrisisLocalDispatcher(
  input: SafetyCrisisLocalDispatcherInput,
): Promise<SafetyCrisisLocalDispatcherOutput | null> {
  if (dispatcherForTest) return await dispatcherForTest(input);
  const userPrompt = JSON.stringify({
    task: "dispatch_safety_crisis_local_flow",
    current_user_message: input.user_message,
    recent_messages: compactRecentMessages(input.recent_messages),
    source_safety_pregate: input.source_safety_pregate,
    previous_active_safety_state: input.previous_active_safety_state,
    prior_phase: input.prior_phase,
    prior_known_facts: input.prior_known_facts,
    channel: input.channel ?? null,
    timezone: input.timezone ?? null,
    turn_frame: input.turn_frame,
    no_tooling_constraints: {
      product_help: "blocked",
      status_recap: "blocked",
      tool_skill_runtime: "blocked",
      operation_suggestions: "blocked",
      pending_confirmation: "blocked",
      db_write: "blocked",
      visible_message: "forbidden",
    },
  });
  try {
    console.info("safety_crisis.local_dispatcher_called", {
      source_risk_band: input.source_safety_pregate.risk_band,
      prior_phase: input.prior_phase,
      no_tooling: true,
    });
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
        source: "safety_crisis.local_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    const output = normalizeSafetyCrisisLocalDispatcherOutput(raw);
    console.info("safety_crisis.local_dispatcher_result", {
      flow_action: output.flow_action,
      risk_score: output.risk_score,
      uncertainty: output.safety_signals.uncertainty,
      no_tooling: output.no_tooling,
    });
    return output;
  } catch (error) {
    console.warn("[SafetyCrisis] local dispatcher failed", error);
    return null;
  }
}
