import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import type { ProductSurfaceDefinition } from "../../product_surface_registry/registry.ts";
import type { ActiveConversationSkillWorkingState } from "../_shared/active_skill_state.ts";
import { normalizeText } from "../_shared/skill_helpers.ts";
import {
  baseProductHelpDecision,
  type ProductHelpBridgeOperationType,
  type ProductHelpConstraint,
  type ProductHelpDecision,
  type ProductHelpIntent,
  type ProductHelpObjectType,
  type ProductHelpTargetKind,
} from "./contract.ts";
import type { ProductHelpFeature } from "./knowledge.ts";
import { PRODUCT_HELP_PROMPT } from "./prompt.ts";
import {
  catalogFeatureIds,
  choosePrimaryCatalogCandidate,
  pickCatalogFeatureForObject,
} from "./retrieval.ts";

export type ProductHelpObjectCandidate = {
  object_type: ProductHelpObjectType;
  source_type: "recent_effect" | "active_flow";
  id: string;
  label: string;
  evidence_text: string;
  confidence_hint: "low" | "medium" | "high";
};

export type ProductHelpStructuredIntakeInput = {
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_skill_working_state: ActiveConversationSkillWorkingState | null;
  turn_frame: TurnFrame;
  product_surfaces: Array<Record<string, unknown> | ProductSurfaceDefinition>;
  catalog_candidates: ProductHelpFeature[];
  recent_object_candidates: ProductHelpObjectCandidate[];
  explicit_constraints: string[];
  request_id?: string | null;
};

export type ProductHelpStructuredIntakeResult = {
  decision: ProductHelpDecision;
  errors: string[];
  raw?: unknown;
};

export type ProductHelpIntakeModel = (
  input: ProductHelpStructuredIntakeInput,
) => Promise<unknown> | unknown;

export type ProductHelpIntakeInput =
  & Omit<
    ProductHelpStructuredIntakeInput,
    "recent_object_candidates" | "explicit_constraints"
  >
  & {
    intake_model?: ProductHelpIntakeModel;
  };

const INTENTS: readonly ProductHelpIntent[] = [
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
  "unclear",
];

const TARGET_KINDS: readonly ProductHelpTargetKind[] = [
  "feature_catalog",
  "user_object",
  "recent_effect",
  "pending_draft",
  "tool_flow",
  "unknown",
];

const OBJECT_TYPES: readonly ProductHelpObjectType[] = [
  "attack_card",
  "defense_card",
  "one_shot_reminder",
  "recurring_reminder",
  "potion",
  "plan_item",
  "preference",
  "initiative",
];

const CONSTRAINTS: readonly ProductHelpConstraint[] = [
  "non_mutating",
  "do_not_execute_tool",
  "do_not_claim_object_exists_without_source",
  "do_not_render_status_block",
  "preserve_active_flow",
  "short_reply",
  "exact_location_requested",
];

const BRIDGE_OPERATIONS: readonly ProductHelpBridgeOperationType[] = [
  "prepare_attack_card",
  "prepare_defense_card",
  "select_state_potion",
  "create_recurring_reminder",
  "one_shot_reminder",
  "adjust_plan_item",
  "update_coach_preferences",
];

function includesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(normalizeText(pattern)));
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function optionalOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return allowed.includes(value as T) ? value as T : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseJsonObject(raw: unknown): unknown {
  if (raw && typeof raw === "object") return raw;
  const text = String(raw ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("product_help_intake_missing_json");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function activeSkillObjectType(skillId: string): ProductHelpObjectType | null {
  if (skillId === "prepare_attack_card") return "attack_card";
  if (skillId === "prepare_defense_card") return "defense_card";
  if (skillId === "create_recurring_reminder") return "recurring_reminder";
  if (skillId === "select_state_potion") return "potion";
  if (skillId === "adjust_plan_item") return "plan_item";
  if (skillId === "update_coach_preferences") return "preference";
  return null;
}

function recentCandidate(args: {
  object_type: ProductHelpObjectType;
  id: string;
  label: string;
  evidence_text: string;
  confidence_hint?: "low" | "medium" | "high";
}): ProductHelpObjectCandidate {
  return {
    object_type: args.object_type,
    source_type: "recent_effect",
    id: args.id,
    label: args.label,
    evidence_text: args.evidence_text.slice(0, 500),
    confidence_hint: args.confidence_hint ?? "medium",
  };
}

export function collectRecentProductObjectCandidates(
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>,
  activeState: ActiveConversationSkillWorkingState | null,
): ProductHelpObjectCandidate[] {
  const candidates: ProductHelpObjectCandidate[] = [];
  for (const [index, turn] of recentMessages.slice(-6).entries()) {
    if (turn.role !== "assistant") continue;
    const text = normalizeText(turn.content);
    const sourceId = `recent_message_${index}`;
    if (
      includesAny(text, ["carte d'attaque", "carte d attaque"]) &&
      includesAny(text, ["j'ai cree", "j ai cree", "c'est fait", "cree"])
    ) {
      candidates.push(recentCandidate({
        object_type: "attack_card",
        id: sourceId,
        label: "carte d'attaque recente",
        evidence_text: turn.content,
        confidence_hint: "high",
      }));
    }
    if (
      includesAny(text, ["carte de defense"]) &&
      includesAny(text, ["j'ai cree", "j ai cree", "c'est fait", "cree"])
    ) {
      candidates.push(recentCandidate({
        object_type: "defense_card",
        id: sourceId,
        label: "carte de defense recente",
        evidence_text: turn.content,
        confidence_hint: "high",
      }));
    }
    if (
      includesAny(text, ["c'est programme", "c est programme", "programme"]) &&
      !includesAny(text, ["recurrent", "initiative recurrente"])
    ) {
      candidates.push(recentCandidate({
        object_type: "one_shot_reminder",
        id: sourceId,
        label: "rappel ponctuel recent",
        evidence_text: turn.content,
        confidence_hint: "high",
      }));
    }
  }

  if (activeState && activeState.skill_id !== "product_help") {
    const objectType = activeSkillObjectType(activeState.skill_id);
    if (objectType) {
      candidates.push({
        object_type: objectType,
        source_type: "active_flow",
        id: activeState.skill_id,
        label: `flow actif ${activeState.skill_id}`,
        evidence_text: String(activeState.summary ?? activeState.skill_id),
        confidence_hint: "medium",
      });
    }
  }

  return candidates;
}

function compactCatalogFeature(feature: ProductHelpFeature) {
  return {
    id: feature.id,
    label: feature.label,
    aliases: feature.aliases.slice(0, 8),
    explain: feature.explain,
    how_to: feature.how_to,
    benefits: feature.benefits.slice(0, 4),
    locations: feature.locations.map((location) => ({
      surface: location.surface,
      when_visible: location.when_visible,
      user_can_do: location.user_can_do,
    })),
    limits: feature.limits,
    must_not_claim: feature.sophia_must_not_claim,
    operation_bridge: feature.operation_bridge
      ? {
        skill_or_operation: feature.operation_bridge.skill_or_operation,
        requires_confirmation: feature.operation_bridge.requires_confirmation,
      }
      : null,
  };
}

function compactTurnFrame(turnFrame: TurnFrame) {
  return {
    safety: turnFrame.safety,
    skill_signals: turnFrame.skill_signals,
    tool_skill_intents: turnFrame.tool_skill_intents,
    tool_skill_opportunity: turnFrame.tool_skill_opportunity,
    direct_effects: turnFrame.direct_effects,
    action_reference: turnFrame.action_reference ?? null,
    level_reference: turnFrame.level_reference ?? null,
  };
}

function bridgeOperationForFeature(
  feature: ProductHelpFeature | null,
  objectType: ProductHelpObjectType | null,
): ProductHelpBridgeOperationType | null {
  if (objectType === "one_shot_reminder") return "one_shot_reminder";
  const bridge = feature?.operation_bridge?.skill_or_operation;
  if (!bridge) return null;
  if (bridge === "adjust_plan") return "adjust_plan_item";
  if (bridge === "activate_potion") return "select_state_potion";
  if (bridge === "create_or_update_initiative") {
    return "create_recurring_reminder";
  }
  return bridge;
}

function sourceForCandidate(
  candidate: ProductHelpObjectCandidate | undefined,
): ProductHelpDecision["grounding"]["db_sources_used"] {
  if (!candidate) return [];
  return [{
    source_type: candidate.source_type,
    id: candidate.id,
    label: candidate.label,
  }];
}

function constraintsFromUnknown(value: unknown): ProductHelpConstraint[] {
  const next: ProductHelpConstraint[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (CONSTRAINTS.includes(item as ProductHelpConstraint)) {
        const constraint = item as ProductHelpConstraint;
        if (!next.includes(constraint)) next.push(constraint);
      }
    }
  }
  for (
    const invariant of [
      "non_mutating",
      "do_not_execute_tool",
      "do_not_claim_object_exists_without_source",
      "do_not_render_status_block",
      "short_reply",
    ] as ProductHelpConstraint[]
  ) {
    if (!next.includes(invariant)) next.push(invariant);
  }
  return next;
}

function responseContractDefaults(intent: ProductHelpIntent) {
  return {
    max_questions: intent === "unclear" ? 1 as const : 0 as const,
    allow_operation_suggestion: false,
    allow_status_projection: false,
    allow_generic_catalog_answer: intent !== "object_status_question",
    must_include_location: [
      "where_is_it",
      "how_to",
      "modify_or_cancel_where",
    ].includes(intent),
    must_include_limit: [
      "limits",
      "can_i_do_x",
      "modify_or_cancel_where",
      "tool_action_request",
    ].includes(intent),
  };
}

function normalizeResponseContract(
  value: unknown,
  intent: ProductHelpIntent,
): ProductHelpDecision["response_contract"] {
  const defaults = responseContractDefaults(intent);
  const record = isRecord(value) ? value : {};
  return {
    max_questions: record.max_questions === 1 ? 1 : defaults.max_questions,
    allow_operation_suggestion: false,
    allow_status_projection: false,
    allow_generic_catalog_answer: record.allow_generic_catalog_answer === false
      ? false
      : defaults.allow_generic_catalog_answer,
    must_include_location: record.must_include_location === true ||
      defaults.must_include_location,
    must_include_limit: record.must_include_limit === true ||
      defaults.must_include_limit,
  };
}

function normalizeBridge(
  value: unknown,
  feature: ProductHelpFeature | null,
  objectType: ProductHelpObjectType | null | undefined,
  intent: ProductHelpIntent,
): ProductHelpDecision["bridge"] | undefined {
  const record = isRecord(value) ? value : {};
  if (!isRecord(value) && intent !== "tool_action_request") return undefined;
  const operationType =
    optionalOneOf(record.operation_type, BRIDGE_OPERATIONS) ??
      (intent === "tool_action_request"
        ? bridgeOperationForFeature(feature, objectType ?? null)
        : null);
  if (!operationType) return undefined;
  return {
    operation_type: operationType,
    bridge_kind: oneOf(
      record.bridge_kind,
      ["explain_only", "offer_with_consent", "handoff_needed"] as const,
      intent === "tool_action_request" ? "handoff_needed" : "explain_only",
    ),
    requires_confirmation: true,
  };
}

function normalizeGroundingSources(
  value: unknown,
  input: ProductHelpStructuredIntakeInput,
  feature: ProductHelpFeature,
): ProductHelpDecision["grounding"]["db_sources_used"] {
  const allowedRecent = new Map(
    input.recent_object_candidates.map((
      candidate,
    ) => [candidate.id, candidate]),
  );
  const sources: ProductHelpDecision["grounding"]["db_sources_used"] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item)) continue;
      const sourceType = oneOf(
        item.source_type,
        ["recent_effect", "db_projection", "active_flow", "catalog"] as const,
        "catalog",
      );
      const id = String(item.id ?? "").trim();
      if (
        (sourceType === "recent_effect" || sourceType === "active_flow") &&
        id &&
        !allowedRecent.has(id)
      ) continue;
      sources.push({
        source_type: sourceType,
        id: id || undefined,
        label: String(item.label ?? "").trim() || undefined,
      });
    }
  }
  if (
    !sources.some((source) =>
      source.source_type === "catalog" && source.id === feature.id
    )
  ) {
    sources.push({
      source_type: "catalog",
      id: feature.id,
      label: feature.label,
    });
  }
  return sources;
}

function selectedRecentCandidate(
  decisionRecord: Record<string, unknown>,
  input: ProductHelpStructuredIntakeInput,
  objectType: ProductHelpObjectType | undefined,
): ProductHelpObjectCandidate | undefined {
  const grounding = isRecord(decisionRecord.grounding)
    ? decisionRecord.grounding
    : {};
  const sources = Array.isArray(grounding.db_sources_used)
    ? grounding.db_sources_used
    : [];
  for (const source of sources) {
    if (!isRecord(source)) continue;
    const id = String(source.id ?? "").trim();
    const candidate = input.recent_object_candidates.find((item) =>
      item.id === id
    );
    if (candidate) return candidate;
  }
  if (!objectType) return undefined;
  const matching = input.recent_object_candidates.filter((candidate) =>
    candidate.object_type === objectType
  );
  return matching.length === 1 ? matching[0] : undefined;
}

export function normalizeProductHelpDecision(
  raw: unknown,
  input: ProductHelpStructuredIntakeInput,
): ProductHelpDecision {
  const record = isRecord(raw) ? raw : {};
  const targetRecord = isRecord(record.target) ? record.target : {};
  const groundingRecord = isRecord(record.grounding) ? record.grounding : {};
  const intent = oneOf(record.intent, INTENTS, "unclear");
  const objectType = optionalOneOf(targetRecord.object_type, OBJECT_TYPES);
  const rawFeatureId = String(targetRecord.feature_id ?? "").trim();
  const featureFromObject = pickCatalogFeatureForObject(objectType);
  const feature =
    input.catalog_candidates.find((item) => item.id === rawFeatureId) ??
      (rawFeatureId === "one_shot_reminder.chat"
        ? pickCatalogFeatureForObject("one_shot_reminder")
        : null) ??
      featureFromObject ??
      choosePrimaryCatalogCandidate(input.catalog_candidates);
  const selectedSource = selectedRecentCandidate(record, input, objectType);
  const hasActiveFlow = Boolean(input.active_skill_working_state) &&
    input.active_skill_working_state?.skill_id !== "product_help";
  const constraints = constraintsFromUnknown(record.constraints);
  if (hasActiveFlow && !constraints.includes("preserve_active_flow")) {
    constraints.push("preserve_active_flow");
  }
  if (
    ["where_is_it", "modify_or_cancel_where"].includes(intent) &&
    !constraints.includes("exact_location_requested")
  ) {
    constraints.push("exact_location_requested");
  }
  const targetKind = oneOf(
    targetRecord.kind,
    TARGET_KINDS,
    (
      intent === "tool_action_request"
        ? "tool_flow"
        : selectedSource
        ? "recent_effect"
        : objectType
        ? "user_object"
        : feature
        ? "feature_catalog"
        : "unknown"
    ) as ProductHelpTargetKind,
  );
  const dbSourcesRequired = Boolean(groundingRecord.db_sources_required) ||
    intent === "object_status_question";
  const sources = normalizeGroundingSources(
    groundingRecord.db_sources_used,
    input,
    feature,
  );
  const bridge = normalizeBridge(
    record.bridge,
    feature,
    objectType ?? null,
    intent,
  );
  const responseContract = normalizeResponseContract(
    record.response_contract,
    intent,
  );
  if (dbSourcesRequired) {
    responseContract.allow_generic_catalog_answer = false;
  }
  return baseProductHelpDecision({
    intent,
    target: {
      kind: targetKind,
      feature_id: rawFeatureId ||
        (objectType === "one_shot_reminder"
          ? "one_shot_reminder.chat"
          : feature.id),
      object_type: objectType || undefined,
      object_ref: String(targetRecord.object_ref ?? selectedSource?.label ?? "")
        .trim() || undefined,
      confidence_band: oneOf(
        targetRecord.confidence_band,
        ["low", "medium", "high"] as const,
        selectedSource || feature ? "high" : "low",
      ),
    },
    grounding: {
      catalog_feature_ids: catalogFeatureIds([
        feature,
        ...input.catalog_candidates,
      ]),
      db_sources_required: dbSourcesRequired,
      db_sources_used: selectedSource
        ? [
          ...sourceForCandidate(selectedSource),
          ...sources.filter((source) => source.id !== selectedSource.id),
        ]
        : sources,
    },
    bridge,
    constraints,
    response_contract: responseContract,
    reply: String(record.reply ?? "").trim(),
    state_patch: isRecord(record.state_patch) ? record.state_patch : {
      summary: `Product help structured intake: ${intent} / ${feature.id}`,
    },
  });
}

async function defaultProductHelpIntakeModel(
  input: ProductHelpStructuredIntakeInput,
): Promise<unknown> {
  const systemPrompt = [
    PRODUCT_HELP_PROMPT,
    "",
    "Tu es l'intake structure du conversation skill product_help.",
    "Retourne uniquement un JSON strict, sans Markdown.",
    "Le catalogue et les candidats recents ci-dessous sont des sources et candidats; ils ne decident pas seuls.",
    "Ta sortie doit choisir intent, target, grounding et bridge selon le contrat.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    output_contract: {
      skill_id: "product_help",
      intent: INTENTS.join("|"),
      target: {
        kind: TARGET_KINDS.join("|"),
        feature_id: "one of catalog_candidates.id or one_shot_reminder.chat",
        object_type: `${OBJECT_TYPES.join("|")} optional`,
        object_ref: "optional string",
        confidence_band: "low|medium|high",
      },
      grounding: {
        catalog_feature_ids: "array of chosen catalog feature ids",
        db_sources_required: "boolean",
        db_sources_used:
          "array of { source_type: recent_effect|db_projection|active_flow|catalog, id?: string, label?: string } using only provided candidate ids unless catalog",
      },
      bridge:
        "optional { operation_type: prepare_attack_card|prepare_defense_card|select_state_potion|create_recurring_reminder|one_shot_reminder|adjust_plan_item|update_coach_preferences, bridge_kind: explain_only|offer_with_consent|handoff_needed, requires_confirmation: true }",
      constraints: CONSTRAINTS,
      response_contract: {
        max_questions: "0|1",
        allow_operation_suggestion: false,
        allow_status_projection: false,
        allow_generic_catalog_answer: "boolean",
        must_include_location: "boolean",
        must_include_limit: "boolean",
      },
      operation_suggestions: [],
      reply:
        "optional string; required when intent=compare_features and the user asks a contextual choice or follow-up; keep it short, grounded in catalog_candidates, non-mutating",
      state_patch: "object",
    },
    behavioral_rules: [
      "product_help explique le produit; il ne cree, modifie, annule, programme, active ou enregistre jamais.",
      "operation_suggestions doit toujours etre [].",
      "Une demande d'action tool devient intent=tool_action_request avec bridge requires_confirmation=true; ne dis jamais que c'est fait.",
      "Une question d'etat reel devient object_status_question, pas une reponse catalogue generique.",
      "'ou retrouver/modifier/annuler dans l'app' est product_help et doit inclure localisation/limites sans mutation.",
      "Pour intent=where_is_it, repondre a la localisation, pas au modele complet de la fonctionnalite.",
      "Pour intent=compare_features avec demande de choix, inclure une reply courte qui choisit selon le besoin courant, sans creer ni proposer une operation.",
      "Le message courant prime sur le contexte recent pour carte vs rappel vs potion.",
      "Le contexte recent sert seulement a resoudre un pronom ou une reference ambigue.",
      "N'affirme pas qu'un objet reel existe sans source recente/db/active_flow choisie dans grounding.db_sources_used.",
      "Si un active flow existe et que la question produit est inline, ajoute preserve_active_flow.",
      "Ne recopie pas de draft pending ou de confirmation pending dans la reponse.",
      "Ne rends jamais de bloc status complet.",
    ],
    current_user_message: input.user_message,
    recent_messages: input.recent_messages,
    active_skill_working_state: input.active_skill_working_state
      ? {
        skill_id: input.active_skill_working_state.skill_id,
        status: input.active_skill_working_state.status,
        summary: input.active_skill_working_state.summary ?? null,
      }
      : null,
    turn_frame: compactTurnFrame(input.turn_frame),
    product_surfaces: input.product_surfaces,
    catalog_candidates: input.catalog_candidates.map(compactCatalogFeature),
    recent_object_candidates: input.recent_object_candidates,
    explicit_constraints: input.explicit_constraints,
  });
  return await generateWithGemini(
    systemPrompt,
    userPrompt,
    0.1,
    true,
    [],
    "auto",
    {
      requestId: input.request_id ?? undefined,
      userId: input.turn_frame.user_id,
      model: getGlobalAiModel("gemini-2.5-flash"),
      source: "product_help.structured_intake",
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 45_000,
      maxRetries: 1,
    },
  );
}

function conservativeProductHelpFallback(
  input: ProductHelpStructuredIntakeInput,
  reason: string,
): ProductHelpDecision {
  const feature = input.catalog_candidates.length === 1
    ? input.catalog_candidates[0]
    : choosePrimaryCatalogCandidate(input.catalog_candidates);
  return baseProductHelpDecision({
    intent: input.catalog_candidates.length === 1
      ? "explain_feature"
      : "unclear",
    target: {
      kind: input.catalog_candidates.length === 1
        ? "feature_catalog"
        : "unknown",
      feature_id: feature.id,
      confidence_band: input.catalog_candidates.length === 1 ? "medium" : "low",
    },
    grounding: {
      catalog_feature_ids: catalogFeatureIds([
        feature,
        ...input.catalog_candidates,
      ]),
      db_sources_required: false,
      db_sources_used: [{
        source_type: "catalog",
        id: feature.id,
        label: feature.label,
      }],
    },
    constraints: [
      "non_mutating",
      "do_not_execute_tool",
      "do_not_claim_object_exists_without_source",
      "do_not_render_status_block",
      ...(input.active_skill_working_state?.skill_id &&
          input.active_skill_working_state.skill_id !== "product_help"
        ? ["preserve_active_flow" as const]
        : []),
      "short_reply",
    ],
    response_contract: {
      max_questions: 0,
      allow_operation_suggestion: false,
      allow_status_projection: false,
      allow_generic_catalog_answer: input.catalog_candidates.length === 1,
      must_include_location: false,
      must_include_limit: false,
    },
    reply:
      "Je peux t'expliquer la fonction, mais je ne vois pas assez de source ici pour confirmer l'objet exact.",
    state_patch: {
      summary: "Product help structured intake fallback.",
      intake_status: "fallback",
      reason,
    },
  });
}

export async function runProductHelpStructuredIntake(
  input: ProductHelpIntakeInput,
): Promise<ProductHelpStructuredIntakeResult> {
  const structuredInput: ProductHelpStructuredIntakeInput = {
    ...input,
    recent_object_candidates: collectRecentProductObjectCandidates(
      input.recent_messages,
      input.active_skill_working_state,
    ),
    explicit_constraints: [],
  };
  try {
    const raw = await (input.intake_model ?? defaultProductHelpIntakeModel)(
      structuredInput,
    );
    const parsed = parseJsonObject(raw);
    return {
      decision: normalizeProductHelpDecision(parsed, structuredInput),
      errors: [],
      raw: parsed,
    };
  } catch (error) {
    const reason = error instanceof Error
      ? error.message
      : "product_help_structured_intake_failed";
    return {
      decision: conservativeProductHelpFallback(structuredInput, reason),
      errors: [reason],
    };
  }
}

// Kept only as a compatibility export. Product Help intent must come from the
// dispatcher or structured intake, never from raw user-message heuristics.
export function legacyProductHelpHeuristicIntake(
  input: ProductHelpStructuredIntakeInput,
): ProductHelpDecision {
  return conservativeProductHelpFallback(
    input,
    "legacy_product_help_heuristic_removed",
  );
}
