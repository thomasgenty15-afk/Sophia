import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type {
  ProductHelpBridgeOperationType,
  ProductHelpIntent,
  ProductHelpLocalDispatcherOutput,
  ProductHelpLocalFlowAction,
  ProductHelpLocalFlowState,
  ProductHelpObjectType,
  ProductHelpTargetKind,
  ProductHelpVisibleTaskKind,
} from "./contract.ts";
import type { ProductHelpFeature } from "./knowledge.ts";

export const PRODUCT_HELP_EXIT_MEMO_KEY = "__last_product_help_exit_memo";

export type ProductHelpLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  product_help_state: ProductHelpLocalFlowState | null;
  parent_flow_context: Record<string, unknown> | null;
  catalog_candidates: ProductHelpFeature[];
  product_surface_registry: unknown[];
  recent_committed_effects: unknown[];
  db_projection_sources?: unknown[] | null;
  active_flow_context?: Record<string, unknown> | null;
  mode: "standalone" | "inline";
  turn_frame: unknown;
};

export type ProductHelpLocalDispatcher = (
  input: ProductHelpLocalDispatcherInput,
) => Promise<ProductHelpLocalDispatcherOutput | null>;

export type ProductHelpReducerResult = {
  status: "answered" | "closing" | "closed" | "exit" | "safety" | "blocked";
  reason_code: string;
  local_state: ProductHelpLocalFlowState | null;
  visible_task: ProductHelpVisibleTaskKind;
  exit_to_global_dispatcher: boolean;
  return_to_parent_flow: boolean;
  answer_summary: string | null;
  visible_facts_json: Record<string, unknown>;
  blocked_effects: Array<{ type: string; reason_code: string }>;
  evidence: string[];
};

const FLOW_ACTIONS = new Set([
  "answer_product_question",
  "clarify_product_question",
  "answer_destination",
  "compare_features",
  "explain_limit",
  "bridge_explanation_only",
  "repeat_answer",
  "apply_attempt",
  "close_product_help",
  "return_to_parent_flow",
  "exit_to_global_dispatcher",
  "safety_preempt",
]);

const PRODUCT_HELP_INTENTS = new Set([
  "explain_feature",
  "how_to",
  "where_is_it",
  "benefits",
  "limits",
  "can_i_do_x",
  "modify_or_cancel_where",
  "object_status_question",
  "tool_action_request",
  "compare_features",
  "repeat",
  "close",
  "off_topic",
  "safety",
  "unclear",
]);

const TARGET_KINDS = new Set([
  "feature_catalog",
  "user_object",
  "recent_effect",
  "pending_draft",
  "tool_flow",
  "unknown",
]);

const OBJECT_TYPES = new Set([
  "attack_card",
  "defense_card",
  "one_shot_reminder",
  "recurring_reminder",
  "potion",
  "plan_item",
  "preference",
  "initiative",
  "unknown",
]);

const BRIDGE_OPERATIONS = new Set([
  "prepare_attack_card",
  "prepare_defense_card",
  "select_state_potion",
  "create_recurring_reminder",
  "one_shot_reminder",
  "adjust_plan_item",
  "update_coach_preferences",
]);

const VISIBLE_TASKS = new Set([
  "answer_product_question",
  "clarify_product_question",
  "answer_destination",
  "compare_features",
  "explain_limit",
  "bridge_explanation_only",
  "repeat_answer",
  "apply_attempt",
  "close_product_help",
  "safety",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
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
    throw new Error("product_help_local_dispatcher_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!isRecord(parsed)) {
    throw new Error("product_help_local_dispatcher_not_object");
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

function rejectMutationFields(root: Record<string, unknown>) {
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
      throw new Error(`product_help_local_dispatcher_forbidden_${key}`);
    }
  }
  if (isRecord(root.pending_confirmation)) {
    throw new Error("product_help_local_dispatcher_forbidden_confirmation");
  }
}

export function readProductHelpFlowState(
  activeSkillState: unknown,
): ProductHelpLocalFlowState | null {
  if (
    !isRecord(activeSkillState) || activeSkillState.skill_id !== "product_help"
  ) {
    return null;
  }
  const working = isRecord(activeSkillState.working_state)
    ? activeSkillState.working_state
    : activeSkillState;
  const local = isRecord(working.product_help_local_state)
    ? working.product_help_local_state
    : working;
  if (!isRecord(local) || local.skill_id !== "product_help") return null;
  if (local.mode !== "standalone") return null;
  const status = stringValue(local.status);
  if (
    !["open", "answered", "closing", "exit_to_global", "safety"].includes(
      status,
    )
  ) {
    return null;
  }
  return local as ProductHelpLocalFlowState;
}

export function hasActiveProductHelpFlow(activeSkillState: unknown): boolean {
  const state = readProductHelpFlowState(activeSkillState);
  return Boolean(
    state && (state.status === "open" || state.status === "answered"),
  );
}

function createProductHelpFlowState(args: {
  previous?: ProductHelpLocalFlowState | null;
  status: ProductHelpLocalFlowState["status"];
  stage: ProductHelpLocalFlowState["product_help_state"]["stage"];
  lastIntent: string | null;
  lastTarget: Record<string, unknown>;
  lastAnswerSummary: string | null;
  lastCatalogFeatureIds: string[];
  lastLocations: string[];
  turnCountIncrement?: number;
}): ProductHelpLocalFlowState {
  const now = new Date().toISOString();
  const previousTurns = Number(
    args.previous?.product_help_state.turn_count ?? 0,
  );
  const increment = Number(args.turnCountIncrement ?? 1);
  return {
    skill_id: "product_help",
    status: args.status,
    mode: "standalone",
    product_help_state: {
      stage: args.stage,
      last_intent: args.lastIntent,
      last_target: args.lastTarget,
      last_answer_summary: args.lastAnswerSummary,
      last_catalog_feature_ids: args.lastCatalogFeatureIds.slice(0, 8),
      last_locations: args.lastLocations.slice(0, 8),
      parent_flow_context: null,
      turn_count: Math.max(0, previousTurns + increment),
      max_turns: Number(args.previous?.product_help_state.max_turns ?? 3) || 3,
      updated_at: now,
    },
  };
}

export function normalizeProductHelpLocalDispatcherOutput(
  raw: unknown,
): ProductHelpLocalDispatcherOutput {
  const root = parseJsonObject(raw);
  rejectMutationFields(root);
  const flowAction = enumValue<ProductHelpLocalFlowAction>(
    root.flow_action,
    FLOW_ACTIONS,
    "clarify_product_question",
  );
  const intentRoot = isRecord(root.product_help_intent)
    ? root.product_help_intent
    : {};
  const targetRoot = isRecord(root.target) ? root.target : {};
  const groundingRoot = isRecord(root.grounding) ? root.grounding : {};
  const bridgeRoot = isRecord(root.bridge) ? root.bridge : {};
  const stateRoot = isRecord(root.state_updates) ? root.state_updates : {};
  const visibleRoot = isRecord(root.visible_task) ? root.visible_task : {};
  const returnRoot = isRecord(root.return_to_parent)
    ? root.return_to_parent
    : {};
  const exitRoot = isRecord(root.exit_memo) ? root.exit_memo : {};
  const exitContext = isRecord(exitRoot.local_flow_context)
    ? exitRoot.local_flow_context
    : {};
  const exitHint = isRecord(exitRoot.handoff_hint_for_global_dispatcher)
    ? exitRoot.handoff_hint_for_global_dispatcher
    : {};
  const mode = root.mode === "inline" ? "inline" : "standalone";
  const exitNeeded = flowAction === "exit_to_global_dispatcher" ||
    flowAction === "safety_preempt" || exitRoot.needed === true;
  const visibleKindFallback: ProductHelpVisibleTaskKind =
    flowAction === "safety_preempt"
      ? "safety"
      : flowAction === "return_to_parent_flow"
      ? "answer_product_question"
      : VISIBLE_TASKS.has(flowAction)
      ? flowAction as ProductHelpVisibleTaskKind
      : "answer_product_question";
  return {
    flow_action: flowAction,
    confidence: confidence(root.confidence),
    risk_score: riskScore(root.risk_score),
    mode,
    product_help_intent: {
      kind: enumValue<ProductHelpIntent>(
        intentRoot.kind,
        PRODUCT_HELP_INTENTS,
        "unclear",
      ),
      summary: stringValue(intentRoot.summary),
    },
    target: {
      kind: enumValue<ProductHelpTargetKind>(
        targetRoot.kind,
        TARGET_KINDS,
        "unknown",
      ),
      feature_id: stringValue(targetRoot.feature_id) || null,
      object_type: stringValue(targetRoot.object_type)
        ? enumValue<ProductHelpObjectType>(
          targetRoot.object_type,
          OBJECT_TYPES,
          "unknown",
        )
        : null,
      object_ref: stringValue(targetRoot.object_ref) || null,
      confidence: confidence(targetRoot.confidence),
    },
    grounding: {
      catalog_feature_ids: stringArray(groundingRoot.catalog_feature_ids, 10),
      surface_ids: stringArray(groundingRoot.surface_ids, 10),
      db_sources_required: groundingRoot.db_sources_required === true,
      db_sources_used: stringArray(groundingRoot.db_sources_used, 10),
      active_flow_used: groundingRoot.active_flow_used === true,
      missing_grounding_reason:
        stringValue(groundingRoot.missing_grounding_reason) || null,
    },
    bridge: {
      needed: bridgeRoot.needed === true ||
        flowAction === "bridge_explanation_only" ||
        flowAction === "apply_attempt",
      operation_type:
        BRIDGE_OPERATIONS.has(stringValue(bridgeRoot.operation_type))
          ? stringValue(
            bridgeRoot.operation_type,
          ) as ProductHelpBridgeOperationType
          : null,
      kind: enumValue(
        bridgeRoot.kind,
        new Set(["explain_only", "offer_with_consent", "handoff_needed", ""]),
        flowAction === "apply_attempt" ? "handoff_needed" : "explain_only",
      ) || null,
      executable: false,
      why: stringValue(bridgeRoot.why) || null,
    },
    state_updates: {
      status: enumValue(
        stateRoot.status,
        new Set(["open", "answered", "closing", "exit_to_global", "safety"]),
        flowAction === "close_product_help" ? "closing" : "answered",
      ),
      stage: enumValue(
        stateRoot.stage,
        new Set(["answering", "clarifying", "bridge_explained", "closing"]),
        flowAction === "clarify_product_question"
          ? "clarifying"
          : flowAction === "bridge_explanation_only" ||
              flowAction === "apply_attempt"
          ? "bridge_explained"
          : flowAction === "close_product_help"
          ? "closing"
          : "answering",
      ),
      turn_count_increment: Math.max(
        0,
        Math.min(1, Number(stateRoot.turn_count_increment ?? 1) || 1),
      ),
      close_after_visible: stateRoot.close_after_visible === true ||
        flowAction === "close_product_help",
      preserve_parent_flow: stateRoot.preserve_parent_flow !== false,
    },
    visible_task: {
      kind: enumValue<ProductHelpVisibleTaskKind>(
        visibleRoot.kind,
        VISIBLE_TASKS,
        visibleKindFallback,
      ),
      instruction: stringValue(visibleRoot.instruction),
    },
    return_to_parent: {
      needed: mode === "inline" || returnRoot.needed === true ||
        flowAction === "return_to_parent_flow",
      parent_skill_id: stringValue(returnRoot.parent_skill_id) || null,
      return_summary: stringValue(returnRoot.return_summary) || null,
      preserve_parent_state: true,
    },
    exit_memo: {
      needed: exitNeeded,
      reason: enumValue(
        exitRoot.reason,
        new Set([
          "topic_change",
          "explicit_tool_request",
          "status_question",
          "normal_coaching",
          "safety",
          "unknown",
          "none",
        ]),
        exitNeeded ? "unknown" : "none",
      ),
      user_intent_summary: stringValue(exitRoot.user_intent_summary) || null,
      local_flow_context: {
        skill_id: "product_help",
        mode,
        stage: stringValue(exitContext.stage) || null,
        last_answer_summary: stringValue(exitContext.last_answer_summary) ||
          null,
        parent_skill_id: stringValue(exitContext.parent_skill_id) || null,
        committed_effects: Array.isArray(exitContext.committed_effects)
          ? exitContext.committed_effects.slice(0, 5)
          : [],
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: enumValue(
          exitHint.likely_intent,
          new Set([
            "prepare_attack_card",
            "prepare_defense_card",
            "select_state_potion",
            "update_coach_preferences",
            "status_recap",
            "adjust_plan_item",
            "one_shot_reminder",
            "create_recurring_reminder",
            "normal_coaching",
            "unknown",
          ]),
          "unknown",
        ),
        why: stringValue(exitHint.why) || null,
        constraints: stringArray(exitHint.constraints, 6),
      },
    },
    evidence: stringArray(root.evidence),
  };
}

function answerSummary(output: ProductHelpLocalDispatcherOutput): string {
  return output.product_help_intent.summary ||
    `${output.flow_action}:${output.visible_task.kind}`;
}

function visibleFacts(args: {
  output: ProductHelpLocalDispatcherOutput;
  catalogCandidates: ProductHelpFeature[];
  previous: ProductHelpLocalFlowState | null;
  parentFlowContext: Record<string, unknown> | null;
  recentCommittedEffects: unknown[];
  productSurfaces: unknown[];
}): Record<string, unknown> {
  const selectedIds = new Set(args.output.grounding.catalog_feature_ids);
  const features = args.catalogCandidates
    .filter((feature) => selectedIds.size === 0 || selectedIds.has(feature.id))
    .map((feature) => ({
      id: feature.id,
      label: feature.label,
      explain: feature.explain,
      how_to: feature.how_to,
      benefits: feature.benefits,
      locations: feature.locations,
      limits: feature.limits,
      operation_bridge: feature.operation_bridge ?? null,
    }));
  return {
    product_help_intent: args.output.product_help_intent,
    target: args.output.target,
    grounding: args.output.grounding,
    bridge: args.output.bridge,
    catalog_answer_material: features,
    catalog_candidates: args.catalogCandidates.map((feature) => ({
      id: feature.id,
      label: feature.label,
      locations: feature.locations,
      limits: feature.limits,
    })),
    product_surface_registry: args.productSurfaces,
    recent_committed_effects: args.recentCommittedEffects,
    parent_flow_context: args.parentFlowContext,
    previous_answer_summary:
      args.previous?.product_help_state.last_answer_summary ?? null,
  };
}

export function reduceProductHelpLocalDispatcherOutput(args: {
  previous: ProductHelpLocalFlowState | null;
  output: ProductHelpLocalDispatcherOutput;
  catalogCandidates: ProductHelpFeature[];
  parentFlowContext: Record<string, unknown> | null;
  productSurfaces: unknown[];
  recentCommittedEffects: unknown[];
}): ProductHelpReducerResult {
  const output = args.output;
  const summary = answerSummary(output);
  if (output.mode === "inline" && !output.state_updates.preserve_parent_flow) {
    return {
      status: "blocked",
      reason_code: "product_help_inline_parent_preservation_required",
      local_state: null,
      visible_task: "safety",
      exit_to_global_dispatcher: false,
      return_to_parent_flow: true,
      answer_summary: null,
      visible_facts_json: {},
      blocked_effects: [{
        type: "product_help",
        reason_code: "parent_preservation_required",
      }],
      evidence: output.evidence,
    };
  }
  if (output.flow_action === "exit_to_global_dispatcher") {
    if (!output.exit_memo.needed || output.exit_memo.reason === "none") {
      return {
        status: "blocked",
        reason_code: "product_help_exit_memo_required",
        local_state: args.previous,
        visible_task: "close_product_help",
        exit_to_global_dispatcher: false,
        return_to_parent_flow: output.mode === "inline",
        answer_summary: null,
        visible_facts_json: {},
        blocked_effects: [{
          type: "product_help",
          reason_code: "exit_memo_required",
        }],
        evidence: output.evidence,
      };
    }
    return {
      status: "exit",
      reason_code: "product_help_exit_to_global_dispatcher",
      local_state: output.mode === "standalone"
        ? createProductHelpFlowState({
          previous: args.previous,
          status: "exit_to_global",
          stage: args.previous?.product_help_state.stage ?? "closing",
          lastIntent: args.previous?.product_help_state.last_intent ?? null,
          lastTarget: args.previous?.product_help_state.last_target ?? {},
          lastAnswerSummary:
            args.previous?.product_help_state.last_answer_summary ?? null,
          lastCatalogFeatureIds:
            args.previous?.product_help_state.last_catalog_feature_ids ?? [],
          lastLocations: args.previous?.product_help_state.last_locations ?? [],
          turnCountIncrement: output.state_updates.turn_count_increment,
        })
        : null,
      visible_task: output.visible_task.kind,
      exit_to_global_dispatcher: true,
      return_to_parent_flow: output.mode === "inline",
      answer_summary: null,
      visible_facts_json: {},
      blocked_effects: [],
      evidence: output.evidence,
    };
  }
  if (output.flow_action === "safety_preempt" || output.risk_score >= 7) {
    return {
      status: "safety",
      reason_code: "product_help_safety_preempt",
      local_state: output.mode === "standalone"
        ? createProductHelpFlowState({
          previous: args.previous,
          status: "safety",
          stage: "closing",
          lastIntent: "safety",
          lastTarget: {},
          lastAnswerSummary:
            args.previous?.product_help_state.last_answer_summary ?? null,
          lastCatalogFeatureIds: [],
          lastLocations: [],
          turnCountIncrement: output.state_updates.turn_count_increment,
        })
        : null,
      visible_task: "safety",
      exit_to_global_dispatcher: false,
      return_to_parent_flow: output.mode === "inline",
      answer_summary: null,
      visible_facts_json: {},
      blocked_effects: [{
        type: "product_help",
        reason_code: "safety_preempt",
      }],
      evidence: output.evidence,
    };
  }
  const objectStatusWithoutGrounding =
    output.product_help_intent.kind === "object_status_question" &&
    output.grounding.db_sources_required &&
    output.grounding.db_sources_used.length === 0 &&
    !output.grounding.active_flow_used;
  const visibleTask = objectStatusWithoutGrounding
    ? "explain_limit"
    : output.visible_task.kind;
  const previousTurns = Number(
    args.previous?.product_help_state.turn_count ?? 0,
  );
  const nextTurns = previousTurns + output.state_updates.turn_count_increment;
  const maxTurns = Number(args.previous?.product_help_state.max_turns ?? 3) ||
    3;
  const shouldClose = output.mode === "inline" ||
    output.state_updates.close_after_visible ||
    output.flow_action === "close_product_help" ||
    nextTurns >= maxTurns;
  const localState = output.mode === "standalone" && !shouldClose
    ? createProductHelpFlowState({
      previous: args.previous,
      status: output.state_updates.status === "open" ? "open" : "answered",
      stage: output.state_updates.stage,
      lastIntent: output.product_help_intent.kind,
      lastTarget: output.target as unknown as Record<string, unknown>,
      lastAnswerSummary: summary,
      lastCatalogFeatureIds: output.grounding.catalog_feature_ids,
      lastLocations: args.catalogCandidates.flatMap((feature) =>
        feature.locations.map((location) => location.surface)
      ),
      turnCountIncrement: output.state_updates.turn_count_increment,
    })
    : output.mode === "standalone" && shouldClose
    ? createProductHelpFlowState({
      previous: args.previous,
      status: "closing",
      stage: "closing",
      lastIntent: output.product_help_intent.kind,
      lastTarget: output.target as unknown as Record<string, unknown>,
      lastAnswerSummary: summary,
      lastCatalogFeatureIds: output.grounding.catalog_feature_ids,
      lastLocations: args.catalogCandidates.flatMap((feature) =>
        feature.locations.map((location) => location.surface)
      ),
      turnCountIncrement: output.state_updates.turn_count_increment,
    })
    : null;
  return {
    status: shouldClose ? "closing" : "answered",
    reason_code: output.flow_action === "apply_attempt"
      ? "product_help_apply_attempt_no_mutation"
      : `product_help_local_${output.flow_action}`,
    local_state: localState,
    visible_task: visibleTask,
    exit_to_global_dispatcher: false,
    return_to_parent_flow: output.mode === "inline" ||
      output.return_to_parent.needed,
    answer_summary: summary,
    visible_facts_json: visibleFacts({
      output,
      catalogCandidates: args.catalogCandidates,
      previous: args.previous,
      parentFlowContext: args.parentFlowContext,
      recentCommittedEffects: args.recentCommittedEffects,
      productSurfaces: args.productSurfaces,
    }),
    blocked_effects: [],
    evidence: output.evidence,
  };
}

function dispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local structure du skill product_help.",
    "Tu ne reponds jamais directement au user. Tu retournes uniquement un JSON valide.",
    "product_help explique le produit Sophia: utilite, fonctionnement, navigation, limites, comparaison et destinations dans l'app.",
    "product_help ne cree, modifie, annule, programme, active, enregistre ou applique jamais rien.",
    "Modes: standalone si product_help est le flow actif; inline si un flow parent t'appelle puis reprend.",
    "Contraintes strictes: aucune operation_suggestions, requested_effects, allowed_effects ou committed_effects; aucun pending confirmation; aucun token de confirmation; aucun flow lance.",
    "En inline, preserve_parent_flow doit rester true et return_to_parent.needed true.",
    "Pour une demande de faire/creer/modifier/activer depuis product_help, utilise apply_attempt ou exit_to_global_dispatcher selon que le user demande seulement depuis l'aide produit ou quitte explicitement vers l'action.",
    "Si tu sors vers global, exit_memo.needed=true et le memo explique la question produit precedente, le mode, le parent eventuel et l'intention probable.",
    "Si une question porte sur l'etat d'un objet reel, n'affirme rien sans source recent_committed_effects, active_flow_context ou db_projection_sources.",
    'Retourne exactement ce JSON: {"flow_action":"answer_product_question|clarify_product_question|answer_destination|compare_features|explain_limit|bridge_explanation_only|repeat_answer|apply_attempt|close_product_help|return_to_parent_flow|exit_to_global_dispatcher|safety_preempt","confidence":"low|medium|high","risk_score":0,"mode":"standalone|inline","product_help_intent":{"kind":"explain_feature|how_to|where_is_it|benefits|limits|can_i_do_x|modify_or_cancel_where|object_status_question|tool_action_request|compare_features|repeat|close|off_topic|safety|unclear","summary":"string"},"target":{"kind":"feature_catalog|user_object|recent_effect|pending_draft|tool_flow|unknown","feature_id":"string|null","object_type":"attack_card|defense_card|one_shot_reminder|recurring_reminder|potion|plan_item|preference|initiative|unknown|null","object_ref":"string|null","confidence":"low|medium|high"},"grounding":{"catalog_feature_ids":[],"surface_ids":[],"db_sources_required":false,"db_sources_used":[],"active_flow_used":false,"missing_grounding_reason":"string|null"},"bridge":{"needed":false,"operation_type":"prepare_attack_card|prepare_defense_card|select_state_potion|create_recurring_reminder|one_shot_reminder|adjust_plan_item|update_coach_preferences|null","kind":"explain_only|offer_with_consent|handoff_needed|null","executable":false,"why":"string|null"},"state_updates":{"status":"open|answered|closing|exit_to_global|safety","stage":"answering|clarifying|bridge_explained|closing","turn_count_increment":1,"close_after_visible":false,"preserve_parent_flow":true},"visible_task":{"kind":"answer_product_question|clarify_product_question|answer_destination|compare_features|explain_limit|bridge_explanation_only|repeat_answer|apply_attempt|close_product_help|safety","instruction":"string"},"return_to_parent":{"needed":false,"parent_skill_id":"string|null","return_summary":"string|null","preserve_parent_state":true},"exit_memo":{"needed":false,"reason":"topic_change|explicit_tool_request|status_question|normal_coaching|safety|unknown|none","user_intent_summary":"string|null","local_flow_context":{"skill_id":"product_help","mode":"standalone|inline","stage":"string|null","last_answer_summary":"string|null","parent_skill_id":"string|null","committed_effects":[]},"handoff_hint_for_global_dispatcher":{"likely_intent":"prepare_attack_card|prepare_defense_card|select_state_potion|update_coach_preferences|status_recap|adjust_plan_item|one_shot_reminder|create_recurring_reminder|normal_coaching|unknown","why":"string|null","constraints":["product_help did not execute or mutate anything.","Global dispatcher is allowed only because product_help.local_dispatcher returned exit_to_global_dispatcher."]}},"evidence":["string"]}',
  ].join("\n");
}

function compactFeature(feature: ProductHelpFeature): Record<string, unknown> {
  return {
    id: feature.id,
    label: feature.label,
    aliases: feature.aliases.slice(0, 8),
    explain: feature.explain,
    how_to: feature.how_to,
    benefits: feature.benefits.slice(0, 4),
    locations: feature.locations,
    limits: feature.limits,
    operation_bridge: feature.operation_bridge ?? null,
  };
}

export async function runProductHelpLocalDispatcher(
  input: ProductHelpLocalDispatcherInput,
): Promise<ProductHelpLocalDispatcherOutput | null> {
  const userPrompt = JSON.stringify({
    task: "dispatch_product_help_local_flow",
    current_user_message: input.user_message,
    mode: input.mode,
    conversation_excerpt: input.recent_messages,
    product_help_state: input.product_help_state,
    parent_flow_context: input.parent_flow_context,
    active_flow_context: input.active_flow_context,
    catalog_candidates: input.catalog_candidates.map(compactFeature),
    product_surface_registry: input.product_surface_registry,
    recent_committed_effects: input.recent_committed_effects,
    db_projection_sources: input.db_projection_sources ?? [],
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
        source: "product_help.local_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalizeProductHelpLocalDispatcherOutput(raw);
  } catch (error) {
    console.warn("[ProductHelp] local dispatcher failed", error);
    return null;
  }
}
