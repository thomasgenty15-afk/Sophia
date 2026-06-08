/// <reference path="../../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type { runSafetyPregate } from "../../../safety/safety_pregate.ts";
import { buildToolConfirmationDecision } from "../_shared/confirmation_adapter.ts";
import {
  type DefenseCardHandoffDraft,
  type DefenseCardHandoffState,
  hasPrepareDefenseCardNoCreateConstraint,
  type PrepareDefenseCardCommittedEffect,
  type PrepareDefenseCardEffect,
  type PrepareDefenseCardSkillResult,
  type PrepareDefenseCardUserIntent,
} from "./contract.ts";
import { runPrepareDefenseCardAiIntake } from "./ai_intake.ts";
import type { DefenseCardDraftV1 } from "./generator.ts";
import {
  getDefenseCardPlatformField,
  type DefenseCardPlatformFieldProgress,
  type DefenseCardPlatformFieldState,
} from "./platform_fields.ts";
import type { DefenseCardAttachment } from "./persistence.ts";
import {
  renderDefenseCardBlocked,
  renderDefenseCardFallbackFailed,
  renderDefenseCardHandoff,
  renderDefenseCardSkillResult,
} from "./renderer.ts";
import {
  createInitialPrepareDefenseCardLocalState,
  reducePrepareDefenseCardLocalDispatcherOutput,
  runPrepareDefenseCardLocalDispatcher,
  type PrepareDefenseCardLocalDispatcher,
  type PrepareDefenseCardLocalState,
} from "./local_flow.ts";
import {
  runPrepareDefenseCardVisibleAgent,
  type PrepareDefenseCardVisibleAgent,
} from "./visible_agent.ts";
import {
  type InlineInfoToolContext,
  runInlineGetInfoDbTool,
  runInlineGetInfoProductTool,
} from "../inline_info_tools.ts";

type OperationRuntimeResult = {
  content: string;
  additionalContents?: string[];
  nextTempMemory: any;
  toolExecution:
    | "none"
    | "blocked"
    | "success"
    | "failed"
    | "uncertain"
    | "platform_handoff";
  executedTools: string[];
  toolSkillRun: Record<string, unknown>;
};

function pendingOperationType(value: unknown): string | null {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const operationType = String(record?.operation_type ?? "").trim();
  return operationType || null;
}

export function isPendingDefenseCardOperation(value: unknown): value is {
  operation_id?: string;
  operation_type: "prepare_defense_card";
  draft: DefenseCardDraftV1;
  attachment?: DefenseCardAttachment | null;
  risk_situation?: { label?: string | null } | null;
  defense_response_hint?: Record<string, unknown> | null;
  turn_count?: number;
  expires_after_turns?: number;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "prepare_defense_card" &&
      record.draft?.operation_type === "prepare_defense_card" &&
      record.draft?.draft?.title &&
      record.draft?.draft?.defense_response,
  );
}

export function isPendingDefenseCardRecommendationOperation(
  value: unknown,
): value is {
  operation_type: "prepare_defense_card";
  surface_id?: string | null;
  surface_label?: string | null;
  recommendation_id?: string | null;
  operation_input?: Record<string, unknown> | null;
  created_at?: string;
  request_id?: string | null;
} {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.operation_type === "prepare_defense_card" &&
      (record.surface_id === "defense_card" ||
        record.surface_id === "defense_cards"),
  );
}

function operationRouteIsSelected(args: {
  operationType: "prepare_defense_card";
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  tempMemory: any;
}): boolean {
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === args.operationType
  ) return true;
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler &&
    args.routeDecision.selected_handler !== args.operationType
  ) return false;

  const pending = (args.tempMemory as any)?.pending_tool_skill_confirmation ??
    (args.tempMemory as any)?.__pending_tool_skill_confirmation ??
    null;
  const pendingType = pendingOperationType(pending);
  if (pendingType === args.operationType) return true;
  if (pendingType && pendingType !== args.operationType) return false;

  const activeIntake = (args.tempMemory as any)?.__active_tool_skill_intake ??
    (args.tempMemory as any)?.active_tool_skill_intake ??
    null;
  const activeOperationType = String(
    (activeIntake as any)?.operation_type ?? "",
  );
  if (activeOperationType && activeOperationType !== args.operationType) {
    return false;
  }
  if (activeOperationType === args.operationType) return true;

  const pendingRecommendation = (args.tempMemory as any)
    ?.__pending_recommendation_operation;
  if (isPendingDefenseCardRecommendationOperation(pendingRecommendation)) {
    return true;
  }
  return (args.turnFrame?.tool_skill_intents ?? []).some((intent) =>
    intent.operation_type === args.operationType &&
    intent.confidence_band !== "low"
  );
}

function operationInputFromLastPlanItem(
  tempMemory: any,
): Record<string, unknown> | null {
  const item = (tempMemory as any)?.__last_resolved_plan_item;
  if (!item || typeof item !== "object") return null;
  const id = String((item as any).id ?? "").trim();
  const title = String((item as any).title ?? "").trim();
  if (!id || !title) return null;
  return {
    target: {
      kind: "plan_item",
      plan_item_id: id,
      title,
    },
    scope: {
      kind: "specific_plan_item",
      plan_item_id: id,
      title,
      current_summary: title,
    },
  };
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textValue(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function hasAttachmentSeed(value?: Record<string, unknown> | null): boolean {
  if (!value) return false;
  return Boolean(recordValue(value.attachment) || recordValue(value.target));
}

function selectedDefenseCardIntent(
  turnFrame: TurnFrame | null,
): NonNullable<TurnFrame["tool_skill_intents"]>[number] | null {
  const intents = (turnFrame?.tool_skill_intents ?? []).filter((intent) =>
    intent.operation_type === "prepare_defense_card" &&
    intent.confidence_band !== "low"
  );
  return intents.find((intent) => intent.explicitness === "explicit") ??
    intents[0] ?? null;
}

function operationInputFromTurnFrameIntent(
  turnFrame: TurnFrame | null,
  base?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const intent = selectedDefenseCardIntent(turnFrame);
  if (!intent) return null;
  const operationInput = recordValue(intent.operation_input) ?? {};
  const payloadHint = recordValue(intent.payload_hint) ?? {};
  const targetHint = textValue(intent.target_hint) ??
    textValue(operationInput.target_hint) ??
    textValue(payloadHint.target_hint);
  const riskBehavior = textValue(operationInput.risk_behavior) ??
    textValue(operationInput.risk_summary) ??
    textValue(payloadHint.risk_behavior) ??
    textValue(payloadHint.risk_summary);
  const triggerHint = textValue(operationInput.trigger) ??
    textValue(operationInput.trigger_hint) ??
    textValue(payloadHint.trigger) ??
    textValue(payloadHint.trigger_hint);
  const next: Record<string, unknown> = {
    ...operationInput,
    dispatcher_intent: {
      operation_type: intent.operation_type,
      explicitness: intent.explicitness,
      confidence_band: intent.confidence_band,
      ambiguity: intent.ambiguity,
      user_intent: intent.user_intent,
      target_hint: targetHint,
      risk_behavior: riskBehavior,
    },
  };
  if (targetHint && !textValue(next.target_hint)) {
    next.target_hint = targetHint;
  }
  if (triggerHint && !textValue(next.trigger_hint)) {
    next.trigger_hint = triggerHint;
  }
  if (!hasAttachmentSeed(next) && !hasAttachmentSeed(base)) {
    const title = targetHint ?? riskBehavior;
    if (title) {
      next.attachment = {
        kind: "free_risk_context",
        plan_item_id: null,
        title,
      };
    }
  }
  if (!recordValue(next.risk_situation)) {
    const label = riskBehavior ?? targetHint;
    if (label) {
      next.risk_situation = {
        label,
        description: targetHint && riskBehavior && targetHint !== riskBehavior
          ? targetHint
          : riskBehavior,
        timing_hint: triggerHint,
        context_hint: targetHint,
      };
    }
  }
  return Object.keys(next).length > 1 ? next : null;
}

function mergeOperationInputSeeds(
  base: Record<string, unknown> | null,
  incoming: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!base) return incoming;
  if (!incoming) return base;
  return { ...base, ...incoming };
}

function defenseCardFrameRecord(tempMemory: any) {
  const memory = tempMemory ?? {};
  return {
    pending: memory.__pending_tool_skill_confirmation ??
      memory.pending_tool_skill_confirmation ?? null,
    active: memory.__active_tool_skill_intake ??
      memory.active_tool_skill_intake ?? null,
    recommendation: memory.__pending_recommendation_operation ?? null,
  };
}

export function loadDefenseCardFrameFromTempMemory(tempMemory: any) {
  return defenseCardFrameRecord(tempMemory);
}

export function writeDefenseCardFrameToTempMemory(
  tempMemory: any,
  frame: {
    pending?: Record<string, unknown> | null;
    active?: Record<string, unknown> | null;
    recommendation?: Record<string, unknown> | null;
  },
) {
  const next = { ...(tempMemory ?? {}) };
  if ("pending" in frame) {
    if (frame.pending) next.__pending_tool_skill_confirmation = frame.pending;
    else delete next.__pending_tool_skill_confirmation;
    delete next.pending_tool_skill_confirmation;
  }
  if ("active" in frame) {
    if (frame.active) next.__active_tool_skill_intake = frame.active;
    else delete next.__active_tool_skill_intake;
    delete next.active_tool_skill_intake;
  }
  if ("recommendation" in frame) {
    if (frame.recommendation) {
      next.__pending_recommendation_operation = frame.recommendation;
    } else {
      delete next.__pending_recommendation_operation;
    }
  }
  return next;
}

export const writeDefenseCardActiveIntake = (
  tempMemory: any,
  active: Record<string, unknown> | null,
) => writeDefenseCardFrameToTempMemory(tempMemory, { active });

export const writeDefenseCardPendingConfirmation = (
  tempMemory: any,
  pending: Record<string, unknown> | null,
) => writeDefenseCardFrameToTempMemory(tempMemory, { pending });

export function clearDefenseCardFrame(tempMemory: any) {
  return writeDefenseCardFrameToTempMemory(tempMemory, {
    pending: null,
    active: null,
    recommendation: null,
  });
}

function buildDefenseCardHandoffDraft(args: {
  draft: DefenseCardDraftV1;
  attachment?: DefenseCardAttachment | null;
  missingDecisions?: string[];
}): DefenseCardHandoffDraft {
  const card = args.draft.draft;
  const target = String(args.attachment?.title ?? card.target_label ?? "")
    .trim() || "situation libre";
  const risk = String(card.risk_situation ?? card.situation ?? "").trim();
  const signal = String(card.signal ?? "").trim();
  const routeKind = args.attachment?.kind === "plan_item"
    ? "plan_item_card"
    : "free_card";
  const routeLabel = routeKind === "plan_item_card"
    ? "Carte de défense liée à une mission ou habitude du plan"
    : "Carte de défense libre";
  const platformDestination = routeKind === "plan_item_card"
    ? "dans Ressources / Défense / Cartes de défense du plan"
    : "dans Ressources / Défense / Cartes de défense libres / Ajouter une carte";
  const supportNeed = [
    target && target !== "situation libre" ? target : "",
    risk ? `situation : ${risk}` : "",
    signal ? `pulsion ou signal : ${signal}` : "",
  ].filter(Boolean).join(" - ") || target;
  const platformSteps = routeKind === "plan_item_card"
    ? [
      "Ouvre la mission ou l'habitude concernée dans le plan.",
      "Dans Ressources, utilise Générer si les cartes du plan ne sont pas encore prêtes.",
      "Ouvre Ressources / Défense / Cartes de défense du plan et ajuste les champs ci-dessous.",
    ]
    : [
      "Ouvre Ressources / Défense.",
      "Dans Cartes de défense libres, clique sur Ajouter une carte.",
      "Renseigne le besoin libre, réponds aux 3 questions, puis reprends les champs finaux ci-dessous.",
    ];
  return {
    operation_type: "prepare_defense_card",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    target_summary: target,
    risk_summary: signal ? `${risk} (${signal})` : risk,
    platform_flow: {
      route_kind: routeKind,
      route_label: routeLabel,
      entry_need: supportNeed
        ? {
          question_label:
            "Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?",
          value: supportNeed,
          status: "locked",
        }
        : null,
      questionnaire_answers: [],
    },
    platform_fields: null,
    recommendation: {
      platform_destination: platformDestination,
      platform_steps: platformSteps,
    },
    missing_decisions: args.missingDecisions ?? [],
  };
}

function platformFieldValue(
  field: DefenseCardPlatformFieldProgress | null,
): string | null {
  if (!field) return null;
  if (field.status !== "locked") return null;
  const value = String(field.locked_value ?? "").trim();
  return value || null;
}

function buildDefenseCardHandoffDraftFromPlatformFields(args: {
  intakeState?: unknown;
  attachment?: DefenseCardAttachment | null;
  platformFields: DefenseCardPlatformFieldState;
  missingDecisions?: string[];
}): DefenseCardHandoffDraft {
  const intake = recordValue(args.intakeState);
  const risk = recordValue(intake?.risk_situation);
  const attachment = args.attachment;
  const routeKind = args.platformFields.route_kind;
  const routeLabel = routeKind === "plan_item_card"
    ? "Carte de défense liée à une mission ou habitude du plan"
    : "Carte de défense libre";
  const platformDestination = routeKind === "plan_item_card"
    ? "dans Ressources / Défense / Cartes de défense du plan"
    : "dans Ressources / Défense / Cartes de défense libres / Ajouter une carte";
  const platformSteps = routeKind === "plan_item_card"
    ? [
      "Ouvre la mission ou l'habitude concernée dans le plan.",
      "Ouvre son bloc Ressources / Défense.",
      "Renseigne les réponses ci-dessous dans les champs de la carte.",
    ]
    : [
      "Ouvre Ressources / Défense.",
      "Dans Cartes de défense libres, clique sur Ajouter une carte.",
      "Renseigne les réponses ci-dessous dans les champs de la plateforme.",
    ];
  const supportNeed = platformFieldValue(
    getDefenseCardPlatformField(args.platformFields, "support_need"),
  );
  const target = String(
    attachment?.title ?? supportNeed ?? intake?.target_summary ?? "",
  ).trim() || "situation à protéger";
  const riskSummary = String(risk?.label ?? risk?.description ?? supportNeed ??
    "").trim();
  const supportField = getDefenseCardPlatformField(
    args.platformFields,
    "support_need",
  );
  return {
    operation_type: "prepare_defense_card",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    target_summary: target,
    risk_summary: riskSummary || target,
    platform_flow: {
      route_kind: routeKind,
      route_label: routeLabel,
      entry_need: supportNeed && supportField
        ? {
          question_label: supportField.question_label,
          value: supportNeed,
          status: "locked",
        }
        : null,
      questionnaire_answers: [],
    },
    platform_fields: args.platformFields,
    recommendation: {
      platform_destination: platformDestination,
      platform_steps: platformSteps,
    },
    missing_decisions: args.missingDecisions ?? [],
  };
}

function writeDefenseCardHandoffState(args: {
  tempMemory: any;
  status: DefenseCardHandoffState["status"];
  handoff: DefenseCardHandoffDraft | null;
  previous?: Record<string, unknown> | null;
}): any {
  const now = new Date().toISOString();
  const previous = args.previous ?? null;
  const createdAt = String(previous?.created_at ?? now);
  return writeDefenseCardFrameToTempMemory(args.tempMemory, {
    pending: null,
    active: {
      operation_type: "prepare_defense_card",
      skill_id: "prepare_defense_card",
      mode: "platform_handoff",
      status: args.status,
      draft: args.handoff,
      turn_count: Number(previous?.turn_count ?? 0) + 1,
      max_turns: Number(previous?.max_turns ?? 6),
      created_at: createdAt,
      updated_at: now,
      no_chat_mutation: true,
      draft_payload: previous?.draft_payload ?? null,
      operation_input: previous?.operation_input ?? null,
    },
  });
}

function handoffRuntime(args: {
  status: DefenseCardHandoffState["status"];
  handoff: DefenseCardHandoffDraft;
  nextTempMemory: any;
  userIntent?: PrepareDefenseCardUserIntent;
  reasonCode: string;
  extraToolSkillRun?: Record<string, unknown>;
}): OperationRuntimeResult {
  return {
    content: renderDefenseCardHandoff({
      handoff: args.handoff,
      status: args.status === "apply_attempt"
        ? "apply_attempt"
        : args.status === "revise_handoff"
        ? "revise_handoff"
        : args.status === "repeat_handoff"
        ? "repeat_handoff"
        : "handoff_delivered",
    }),
    nextTempMemory: args.nextTempMemory,
    toolExecution: "platform_handoff",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "prepare_defense_card",
      operation_type: "prepare_defense_card",
      status: args.status,
      user_intent: args.userIntent ?? "unknown",
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [],
      pending_confirmation: null,
      reason: args.reasonCode,
      reason_code: args.reasonCode,
      platform_handoff: {
        operation_type: "prepare_defense_card",
        status: args.status,
        surface_id: "defense_cards",
        no_chat_mutation: true,
        draft: args.handoff,
      },
      ...(args.extraToolSkillRun ?? {}),
    },
  };
}

function intentFromDraftReviewDecision(
  decision: string | undefined,
  fallback: PrepareDefenseCardUserIntent,
): PrepareDefenseCardUserIntent {
  if (decision === "approve") return "create";
  if (decision === "reject") return "reject";
  if (decision === "revise") return "revise";
  if (decision === "explain") return "explain";
  if (decision === "topic_change") return "topic_change";
  if (decision === "unclear") {
    return fallback === "unknown" ? "clarify" : fallback;
  }
  return fallback;
}

function questionCandidate(value: unknown): {
  plan_item_id: string;
  title: string;
} | null {
  const candidate = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const planItemId = String(candidate?.plan_item_id ?? "").trim();
  const title = String(candidate?.title ?? "").trim();
  return planItemId && title ? { plan_item_id: planItemId, title } : null;
}

function defenseCardAttachmentFromPendingConfirmation(
  pendingConfirmation: Record<string, unknown> | undefined,
  fallbackOperationInput?: Record<string, unknown> | null,
): DefenseCardAttachment {
  const pendingAttachment = pendingConfirmation?.attachment as
    | Record<string, unknown>
    | undefined;
  const fallbackAttachment = fallbackOperationInput?.attachment as
    | Record<string, unknown>
    | undefined;
  const fallbackTarget = fallbackOperationInput?.target as
    | Record<string, unknown>
    | undefined;
  const attachment = pendingAttachment ?? fallbackAttachment ??
    fallbackTarget ??
    {};
  const planItemId = typeof attachment.plan_item_id === "string"
    ? attachment.plan_item_id
    : attachment.plan_item_id === null
    ? null
    : undefined;
  const rawKind = String(attachment.kind ?? "");
  const title = typeof attachment.title === "string" ? attachment.title : null;
  const kind = rawKind === "personal_action" ||
      rawKind === "free_risk_context" ||
      rawKind === "recurring_context"
    ? rawKind
    : rawKind === "plan_item" && planItemId
    ? "plan_item"
    : "free_risk_context";
  return {
    kind,
    title,
    plan_item_id: planItemId ?? null,
  };
}

function buildDefenseCardHandoffDraftFromOutput(args: {
  output: {
    draft?: DefenseCardDraftV1;
    platform_fields?: DefenseCardPlatformFieldState;
    pending_confirmation?: Record<string, unknown>;
    state_patch: {
      intake_state?: unknown;
      platform_fields?: DefenseCardPlatformFieldState | null;
    };
  };
  fallbackOperationInput?: Record<string, unknown> | null;
}): DefenseCardHandoffDraft | null {
  const platformFields = args.output.platform_fields ??
    args.output.state_patch.platform_fields ?? null;
  if (platformFields) {
    return buildDefenseCardHandoffDraftFromPlatformFields({
      intakeState: args.output.state_patch.intake_state,
      attachment: defenseCardAttachmentFromPendingConfirmation(
        args.output.pending_confirmation,
        args.fallbackOperationInput,
      ),
      platformFields,
    });
  }
  if (args.output.draft) {
    return buildDefenseCardHandoffDraft({
      draft: args.output.draft,
      attachment: defenseCardAttachmentFromPendingConfirmation(
        args.output.pending_confirmation,
        args.fallbackOperationInput,
      ),
    });
  }
  return null;
}

function defenseCardAttachmentFromQuestionCandidate(
  value: unknown,
): DefenseCardAttachment | null {
  const candidate = questionCandidate(value);
  if (!candidate) return null;
  return {
    kind: "plan_item",
    plan_item_id: candidate.plan_item_id,
    title: candidate.title,
  };
}

function renderDefenseCardSlotQuestion(
  nextQuestion: unknown,
  fallback =
    "Il me manque l'action ou le moment à protéger. Donne-moi la cible ou décris-la en une phrase.",
): string {
  const question = nextQuestion as any;
  const generated = String(question?.question ?? "").trim();
  if (generated) return generated;
  const slot = String(question?.slot ?? "");
  const status = String(question?.status ?? "");
  const candidate = questionCandidate(question?.candidate);
  const candidates = Array.isArray(question?.candidates)
    ? question.candidates.map(questionCandidate).filter(Boolean)
    : [];
  if (slot === "risk_situation") {
    return "Il me manque le moment de risque à couvrir. Décris ce qui risque de te faire décrocher.";
  }
  if (slot === "tool_fit") {
    return "Je veux éviter de créer la mauvaise carte: tu veux plutôt une carte d'attaque pour aider à démarrer, ou une carte de défense pour le moment où tu risques de déraper ?";
  }
  if (status === "candidate_needs_confirmation" && candidate) {
    return `Je pense à "${candidate.title}" comme cible à protéger. Confirme si c'est ça, sinon corrige la cible.`;
  }
  if (status === "ambiguous" && candidates.length > 0) {
    return `J'hésite entre ${
      candidates.map((item: any) => `"${item.title}"`).join(" / ")
    }. Dis-moi laquelle protéger.`;
  }
  return fallback;
}

function pendingEffect(
  pendingRaw: { operation_id?: string; draft: DefenseCardDraftV1 },
): PrepareDefenseCardEffect {
  return {
    type: "create_defense_card",
    operation_id: String(pendingRaw.operation_id ?? ""),
    draft: pendingRaw.draft,
  };
}

export function defenseSkillResult(args: {
  status: PrepareDefenseCardSkillResult["status"];
  userIntent: PrepareDefenseCardUserIntent;
  reasonCode: string;
  evidence?: string[];
  reply?: string | null;
  requestedEffects?: PrepareDefenseCardEffect[];
  allowedEffects?: PrepareDefenseCardEffect[];
  committedEffects?: PrepareDefenseCardCommittedEffect[];
  blockedEffects?: Array<{ type: string; reason_code: string }>;
  pendingConfirmation?: Record<string, unknown> | null;
  updatedState?: PrepareDefenseCardSkillResult["updated_state"];
}): PrepareDefenseCardSkillResult {
  return {
    handled: true,
    status: args.status,
    user_intent: args.userIntent,
    updated_state: args.updatedState,
    reply: args.reply ?? null,
    requested_effects: args.requestedEffects ?? [],
    allowed_effects: args.allowedEffects ?? [],
    committed_effects: args.committedEffects ?? [],
    blocked_effects: args.blockedEffects ?? [],
    pending_confirmation: args.pendingConfirmation ?? null,
    debug: {
      reason_code: args.reasonCode,
      evidence: args.evidence ?? [],
    },
  };
}

export function toRuntimeResult(args: {
  skillResult: PrepareDefenseCardSkillResult;
  nextTempMemory: any;
  extraToolSkillRun?: Record<string, unknown>;
}): OperationRuntimeResult {
  const committedEffects = args.skillResult.committed_effects;
  const committed = committedEffects.length > 0;
  const status = args.skillResult.status;
  const toolExecution = committed
    ? "success"
    : status === "blocked" || status === "pending_confirmation" ||
        status === "ask_question" || status === "draft_ready" ||
        status === "cancelled" || status === "revised" ||
        status === "technical_blocked" ||
        status === "explained" || status === "topic_change" ||
        status === "handoff_to_attack_card"
    ? "blocked"
    : "failed";
  return {
    content: renderDefenseCardSkillResult(args.skillResult),
    nextTempMemory: args.nextTempMemory,
    toolExecution,
    executedTools: committed ? ["prepare_defense_card"] : [],
    toolSkillRun: {
      selected_handler: "prepare_defense_card",
      status,
      user_intent: args.skillResult.user_intent,
      requested_effects: args.skillResult.requested_effects,
      allowed_effects: args.skillResult.allowed_effects,
      committed_effects: args.skillResult.committed_effects,
      blocked_effects: args.skillResult.blocked_effects,
      pending_confirmation: args.skillResult.pending_confirmation ?? null,
      reason: args.skillResult.debug.reason_code,
      reason_code: args.skillResult.debug.reason_code,
      evidence: args.skillResult.debug.evidence,
      ...(args.extraToolSkillRun ?? {}),
    },
  };
}

function technicalDefenseCardRuntime(args: {
  output: Awaited<ReturnType<typeof runPrepareDefenseCardAiIntake>>;
  nextTempMemory: any;
  operationId?: string | null;
  source?: string | null;
  recommendationId?: string | null;
}): OperationRuntimeResult {
  const reasonCode = String(
    args.output.reason_code ??
      args.output.readiness?.reason ?? "structured_intake_failed",
  );
  return {
    content: args.output.ack ??
      "Je n'arrive pas à préparer cette carte proprement là. On peut reprendre dans un instant.",
    nextTempMemory: args.nextTempMemory,
    toolExecution: "failed",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "prepare_defense_card",
      status: "technical_blocked",
      reason_code: reasonCode,
      operation_id: args.operationId ?? null,
      source: args.source ?? args.output.source,
      recommendation_id: args.recommendationId ?? null,
      user_intent: args.output.state_patch.user_intent,
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [{
        type: "prepare_defense_card",
        reason_code: reasonCode,
      }],
      pending_confirmation: null,
      should_preserve_pending: args.output.should_preserve_pending ?? true,
      retryable: args.output.retryable ?? true,
      technical_source: args.output.technical_source ?? "technical_fallback",
    },
  };
}

function recentMessagesFromHistory(history: unknown): Array<{
  role: "user" | "assistant";
  content: string;
}> {
  if (!Array.isArray(history)) return [];
  return history
    .filter((message: any) =>
      (message?.role === "user" || message?.role === "assistant") &&
      typeof message?.content === "string" && message.content.trim()
    )
    .map((message: any) => ({
      role: message.role as "user" | "assistant",
      content: String(message.content),
    }))
    .slice(-8);
}

function defenseCardLocalRuntimeTraceBase(args: {
  event: string;
  flowAction?: string | null;
  visibleTask?: string | null;
  toolFit?: string | null;
  supportNeedStatus?: string | null;
  supportNeedReady?: boolean;
  slotsModified?: string[];
  exitToGlobalDispatcher?: boolean;
  aiCallCount?: number;
  riskAssessment?: Record<string, unknown> | null;
}) {
  return {
    component: "prepare_defense_card.local_flow",
    event: args.event,
    flow_action: args.flowAction ?? null,
    visible_task_kind: args.visibleTask ?? null,
    tool_fit: args.toolFit ?? null,
    support_need_status: args.supportNeedStatus ?? null,
    handoff_ready: args.supportNeedReady ?? false,
    slots_modified: args.slotsModified ?? [],
    exit_to_global_dispatcher: args.exitToGlobalDispatcher ?? false,
    ai_call_count: args.aiCallCount ?? null,
    risk_assessment: args.riskAssessment ?? null,
    selected_handler: "prepare_defense_card",
  };
}

function changedDefenseSlots(
  previous: PrepareDefenseCardLocalState | null,
  next: PrepareDefenseCardLocalState | null,
): string[] {
  if (!next) return [];
  if (!previous) {
    return [
      "tool_fit",
      "attachment",
      "risk_situation",
      "trigger",
      "defense_goal",
      "defense_response_hint",
      "support_need",
    ].filter((slot) => {
      const state = slot === "tool_fit"
        ? next.tool_fit_state.status
        : slot === "attachment"
        ? next.attachment_state.status
        : slot === "risk_situation"
        ? next.risk_state.status
        : slot === "trigger"
        ? next.trigger_state.status
        : slot === "defense_goal"
        ? next.defense_goal_state.status
        : slot === "defense_response_hint"
        ? next.defense_response_hint_state.status
        : next.support_need_state.status;
      return state !== "missing" && state !== "ambiguous";
    });
  }
  const changed: string[] = [];
  if (
    JSON.stringify(previous.tool_fit_state) !==
      JSON.stringify(next.tool_fit_state)
  ) changed.push("tool_fit");
  if (
    JSON.stringify(previous.attachment_state) !==
      JSON.stringify(next.attachment_state)
  ) changed.push("attachment");
  if (JSON.stringify(previous.risk_state) !== JSON.stringify(next.risk_state)) {
    changed.push("risk_situation");
  }
  if (
    JSON.stringify(previous.trigger_state) !== JSON.stringify(next.trigger_state)
  ) changed.push("trigger");
  if (
    JSON.stringify(previous.defense_goal_state) !==
      JSON.stringify(next.defense_goal_state)
  ) changed.push("defense_goal");
  if (
    JSON.stringify(previous.defense_response_hint_state) !==
      JSON.stringify(next.defense_response_hint_state)
  ) changed.push("defense_response_hint");
  if (
    JSON.stringify(previous.support_need_state) !==
      JSON.stringify(next.support_need_state)
  ) changed.push("support_need");
  return changed;
}

function defenseInlineInfoContext(args: {
  state: PrepareDefenseCardLocalState;
  userMessage: string;
  subskillContext: Record<string, unknown> | null;
}): InlineInfoToolContext {
  const context = args.subskillContext ?? {};
  const question = String(
    context.question_to_answer ?? context.question ?? args.userMessage,
  ).trim();
  return {
    active_flow: "prepare_defense_card",
    active_flow_status: "collecting",
    question_to_answer: question,
    active_flow_context: {
      route_kind: args.state.route_kind,
      platform_destination: args.state.platform_destination,
      tool_fit_state: args.state.tool_fit_state,
      attachment_state: args.state.attachment_state,
      risk_state: args.state.risk_state,
      trigger_state: args.state.trigger_state,
      defense_goal_state: args.state.defense_goal_state,
      defense_response_hint_state: args.state.defense_response_hint_state,
      support_need_state: args.state.support_need_state,
    },
    dispatcher_context: context,
  };
}

function appendDefenseCardSubskillHistory(args: {
  state: PrepareDefenseCardLocalState | null;
  skillId: "product_help" | "status_recap";
  userMessage: string;
  context: InlineInfoToolContext;
  reply: string;
}): PrepareDefenseCardLocalState | null {
  if (!args.state) return null;
  return {
    ...args.state,
    subskill_history: [
      ...(args.state.subskill_history ?? []),
      {
        skill_id: args.skillId,
        user_message: args.userMessage,
        question_to_answer: args.context.question_to_answer,
        active_flow_context: args.context.active_flow_context,
        reply_summary: args.reply.slice(0, 500),
        created_at: new Date().toISOString(),
      },
    ].slice(-8),
  };
}

function writeDefenseCardLocalHandoffState(args: {
  tempMemory: any;
  status: DefenseCardHandoffState["status"];
  draft: DefenseCardHandoffDraft | null;
  localState: PrepareDefenseCardLocalState;
  previous?: Record<string, unknown> | null;
}) {
  const now = new Date().toISOString();
  const previous = args.previous ?? null;
  return writeDefenseCardFrameToTempMemory(args.tempMemory, {
    pending: null,
    active: {
      operation_type: "prepare_defense_card",
      skill_id: "prepare_defense_card",
      mode: "platform_handoff",
      status: args.status,
      draft: args.draft,
      local_state: args.localState,
      turn_count: Number(previous?.turn_count ?? 0) + 1,
      max_turns: Number(previous?.max_turns ?? 8),
      created_at: String(previous?.created_at ?? now),
      updated_at: now,
      no_chat_mutation: true,
      operation_input: previous?.operation_input ?? null,
    },
  });
}

function defenseCardLegacyRuntimeEnabled(): boolean {
  return false;
}

async function runPrepareDefenseCardLocalRuntime(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  userTimezone: string;
  tempMemory: any;
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  requestId?: string | null;
  history?: unknown;
  planSnapshot?: unknown;
  activeHandoff: DefenseCardHandoffState | null;
  operationInput?: Record<string, unknown> | null;
  dispatcher?: PrepareDefenseCardLocalDispatcher;
  visibleAgent?: PrepareDefenseCardVisibleAgent;
}): Promise<OperationRuntimeResult> {
  const runtimeTrace: Array<Record<string, unknown>> = [];
  let aiCallCount = 0;
  const previousLocalState = (args.activeHandoff as any)?.local_state ??
    createInitialPrepareDefenseCardLocalState({
      activeState: args.activeHandoff,
      operationInput: args.operationInput,
    });
  runtimeTrace.push(defenseCardLocalRuntimeTraceBase({
    event: "active flow entry",
    toolFit: previousLocalState.tool_fit_state.status,
    supportNeedStatus: previousLocalState.support_need_state.status,
    supportNeedReady: previousLocalState.support_need_state.status === "locked",
    aiCallCount,
  }));
  runtimeTrace.push(defenseCardLocalRuntimeTraceBase({
    event: "local_dispatcher called",
    toolFit: previousLocalState.tool_fit_state.status,
    supportNeedStatus: previousLocalState.support_need_state.status,
    aiCallCount,
  }));
  const dispatcher = args.dispatcher ?? runPrepareDefenseCardLocalDispatcher;
  aiCallCount += 1;
  const decision = await dispatcher({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    user_message: args.userMessage,
    recent_messages: recentMessagesFromHistory(args.history),
    active_state: args.activeHandoff,
    local_state: previousLocalState,
    route_decision: args.routeDecision,
    turn_frame: args.turnFrame,
    plan_snapshot: args.planSnapshot ?? null,
    last_handoff: args.activeHandoff?.draft ?? null,
  });
  if (!decision) {
    runtimeTrace.push(defenseCardLocalRuntimeTraceBase({
      event: "local_dispatcher failed",
      aiCallCount,
    }));
    return {
      content:
        "Je garde la carte de défense en cours, mais je n'arrive pas à traiter correctement ce tour. Réessaie dans un instant.",
      nextTempMemory: args.tempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_defense_card",
        operation_type: "prepare_defense_card",
        mode: "platform_handoff",
        no_chat_mutation: true,
        executable_from_chat: false,
        status: "blocked",
        reason_code: "prepare_defense_card_local_dispatcher_failed",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [{
          type: "local_dispatcher",
          reason_code: "prepare_defense_card_local_dispatcher_failed",
        }],
        pending_confirmation: null,
        runtime_trace: runtimeTrace,
        ai_call_count: aiCallCount,
      },
    };
  }
  runtimeTrace.push(defenseCardLocalRuntimeTraceBase({
    event: "local_dispatcher decision",
    flowAction: decision.flow_action,
    visibleTask: decision.visible_task.kind,
    toolFit: decision.tool_fit_state.status,
    supportNeedStatus: decision.support_need_state.status,
    supportNeedReady: decision.support_need_state.status === "locked",
    slotsModified: Object.keys(decision.slot_updates ?? {}),
    exitToGlobalDispatcher: decision.flow_action === "exit_to_global_dispatcher",
    aiCallCount,
    riskAssessment: decision.risk_assessment as any,
  }));
  const reduced = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: previousLocalState,
    output: decision,
  });
  const slotsModified = changedDefenseSlots(
    previousLocalState,
    reduced.local_state,
  );
  runtimeTrace.push(defenseCardLocalRuntimeTraceBase({
    event: "reducer reduced",
    flowAction: decision.flow_action,
    visibleTask: reduced.visible_task,
    toolFit: reduced.local_state?.tool_fit_state.status ?? null,
    supportNeedStatus: reduced.local_state?.support_need_state.status ?? null,
    supportNeedReady: Boolean(reduced.draft),
    slotsModified,
    exitToGlobalDispatcher: reduced.exit_to_global_dispatcher,
    aiCallCount,
    riskAssessment: reduced.risk_assessment as any,
  }));
  if (reduced.exit_to_global_dispatcher) {
    const exitReason = decision.exit_memo?.reason &&
        decision.exit_memo.reason !== "none"
      ? decision.exit_memo.reason
      : "topic_change";
    const exitMemo = {
      reason: exitReason,
      flow_summary: decision.exit_memo?.flow_summary ?? null,
      handoff_hint_for_global_dispatcher:
        decision.exit_memo?.handoff_hint_for_global_dispatcher ?? null,
      at: new Date().toISOString(),
    };
    const cleared = {
      ...clearDefenseCardFrame(args.tempMemory),
      __last_prepare_defense_card_exit_memo: exitMemo,
    };
    runtimeTrace.push(defenseCardLocalRuntimeTraceBase({
      event: "exit_to_global_dispatcher",
      flowAction: decision.flow_action,
      visibleTask: reduced.visible_task,
      exitToGlobalDispatcher: true,
      aiCallCount,
      riskAssessment: reduced.risk_assessment as any,
    }));
    return {
      content: "",
      nextTempMemory: cleared,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_defense_card",
        operation_type: "prepare_defense_card",
        status: "topic_change",
        reason_code: "prepare_defense_card_local_exit_to_global_dispatcher",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        pending_confirmation: null,
        exit_memo: exitMemo,
        runtime_trace: runtimeTrace,
        ai_call_count: aiCallCount,
      },
    };
  }
  if (
    (reduced.get_info_product || reduced.get_info_db) && reduced.local_state
  ) {
    const toolContext = defenseInlineInfoContext({
      state: reduced.local_state,
      userMessage: args.userMessage,
      subskillContext: reduced.subskill_context,
    });
    const info = reduced.get_info_product
      ? await runInlineGetInfoProductTool({
        userId: args.userId,
        userMessage: args.userMessage,
        history: args.history,
        turnFrame: args.turnFrame,
        context: toolContext,
      })
      : await runInlineGetInfoDbTool({
        supabase: args.supabase,
        userId: args.userId,
        userMessage: args.userMessage,
        userTimezone: args.userTimezone,
        history: args.history,
        turnFrame: args.turnFrame,
        routeDecision: args.routeDecision,
        tempMemory: args.tempMemory,
        requestId: args.requestId ?? null,
        objectTypes: ["defense_card"],
        context: toolContext,
      });
    const nextLocalState = appendDefenseCardSubskillHistory({
      state: reduced.local_state,
      skillId: reduced.get_info_product ? "product_help" : "status_recap",
      userMessage: args.userMessage,
      context: toolContext,
      reply: info.content,
    });
    const nextTempMemory = nextLocalState
      ? writeDefenseCardLocalHandoffState({
        tempMemory: args.tempMemory,
        status: "collecting",
        draft: reduced.draft ?? args.activeHandoff?.draft ?? null,
        localState: nextLocalState,
        previous: args.activeHandoff as any,
      })
      : args.tempMemory;
    runtimeTrace.push(...info.runtimeTrace);
    return {
      content: info.content ||
        "Je n'arrive pas à répondre à cette question maintenant, mais je garde la carte de défense en cours.",
      additionalContents: info.additionalContents,
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_defense_card",
        operation_type: "prepare_defense_card",
        mode: "platform_handoff",
        no_chat_mutation: true,
        executable_from_chat: false,
        status: reduced.status,
        reason_code: reduced.reason_code,
        flow_action: decision.flow_action,
        visible_task_kind: "none",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        pending_confirmation: null,
        local_flow_state: nextLocalState,
        subskill_run: info.subskillRun,
        risk_assessment: reduced.risk_assessment,
        runtime_trace: runtimeTrace,
        ai_call_count: aiCallCount,
      },
    };
  }
  runtimeTrace.push(defenseCardLocalRuntimeTraceBase({
    event: "visible_prompt called",
    flowAction: decision.flow_action,
    visibleTask: reduced.visible_task,
    toolFit: reduced.local_state?.tool_fit_state.status ?? null,
    supportNeedStatus: reduced.local_state?.support_need_state.status ?? null,
    supportNeedReady: Boolean(reduced.draft),
    slotsModified,
    aiCallCount,
    riskAssessment: reduced.risk_assessment as any,
  }));
  const visibleAgent = args.visibleAgent ?? runPrepareDefenseCardVisibleAgent;
  aiCallCount += 1;
  const visibleMessage = await visibleAgent({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    stage: reduced.visible_task,
    user_message: args.userMessage,
    recent_messages: recentMessagesFromHistory(args.history),
    local_state: reduced.local_state,
    draft: reduced.draft,
    trace_event: (event) => runtimeTrace.push(event),
  });
  runtimeTrace.push(defenseCardLocalRuntimeTraceBase({
    event: visibleMessage ? "visible_prompt complete" : "visible_prompt failed",
    flowAction: decision.flow_action,
    visibleTask: reduced.visible_task,
    toolFit: reduced.local_state?.tool_fit_state.status ?? null,
    supportNeedStatus: reduced.local_state?.support_need_state.status ?? null,
    supportNeedReady: Boolean(reduced.draft),
    slotsModified,
    aiCallCount,
    riskAssessment: reduced.risk_assessment as any,
  }));
  if (!visibleMessage) {
    return {
      content:
        "Je garde la carte de défense en cours, mais je n'arrive pas à formuler correctement la réponse visible. Réessaie dans un instant.",
      nextTempMemory: args.tempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_defense_card",
        operation_type: "prepare_defense_card",
        mode: "platform_handoff",
        no_chat_mutation: true,
        executable_from_chat: false,
        status: "blocked",
        reason_code: "prepare_defense_card_visible_agent_failed",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [{
          type: "visible_agent",
          reason_code: "prepare_defense_card_visible_agent_failed",
        }],
        pending_confirmation: null,
        risk_assessment: reduced.risk_assessment,
        runtime_trace: runtimeTrace,
        ai_call_count: aiCallCount,
      },
    };
  }
  const nextHandoff = reduced.local_state
    ? {
      skill_id: "prepare_defense_card" as const,
      mode: "platform_handoff" as const,
      status: reduced.status === "apply_attempt"
        ? "apply_attempt" as const
        : reduced.status === "repeat_handoff"
        ? "repeat_handoff" as const
        : reduced.status === "cancelled"
        ? "cancelled" as const
        : reduced.draft
        ? "handoff_delivered" as const
        : "collecting" as const,
      draft: reduced.draft ?? args.activeHandoff?.draft ?? null,
      local_state: reduced.local_state,
      turn_count: Number((args.activeHandoff as any)?.turn_count ?? 0) + 1,
      max_turns: Number((args.activeHandoff as any)?.max_turns ?? 8),
      created_at: String(
        (args.activeHandoff as any)?.created_at ?? new Date().toISOString(),
      ),
      updated_at: new Date().toISOString(),
      no_chat_mutation: true as const,
    }
    : null;
  const nextTempMemory = nextHandoff && reduced.local_state
    ? writeDefenseCardLocalHandoffState({
      tempMemory: args.tempMemory,
      status: nextHandoff.status,
      draft: nextHandoff.draft,
      localState: reduced.local_state,
      previous: args.activeHandoff as any,
    })
    : clearDefenseCardFrame(args.tempMemory);
  const deliversPlatformHandoff = Boolean(reduced.draft) ||
    [
      "apply_attempt",
      "repeat_handoff",
      "handoff_delivered",
      "cancelled",
    ].includes(reduced.status) ||
    reduced.visible_task === "destination_short";
  return {
    content: visibleMessage,
    nextTempMemory,
    toolExecution: deliversPlatformHandoff ? "platform_handoff" : "blocked",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "prepare_defense_card",
      operation_type: "prepare_defense_card",
      mode: "platform_handoff",
      no_chat_mutation: true,
      executable_from_chat: false,
      status: reduced.status,
      reason_code: reduced.reason_code,
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: reduced.blocked_effects,
      pending_confirmation: null,
      handoff_state: nextHandoff,
      risk_assessment: reduced.risk_assessment,
      runtime_trace: runtimeTrace,
      ai_call_count: aiCallCount,
      ...(deliversPlatformHandoff
        ? {
          platform_handoff: {
            operation_type: "prepare_defense_card",
            status: reduced.status === "cancelled" ? "cancelled" : "delivered",
            surface_id: "defense_cards",
            reason_code: reduced.reason_code,
            no_chat_mutation: true,
            draft: reduced.draft,
          },
        }
        : {}),
    },
  };
}

export async function maybeRunPrepareDefenseCardOperation(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  tempMemory: any;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>;
  sourceMessageId: string | null;
  requestId?: string | null;
  planSnapshot?: unknown;
  history?: unknown;
  runIntake?: typeof runPrepareDefenseCardAiIntake;
  runLocalDispatcher?: PrepareDefenseCardLocalDispatcher;
  runVisibleAgent?: PrepareDefenseCardVisibleAgent;
}): Promise<OperationRuntimeResult | null> {
  const runIntake = args.runIntake ?? runPrepareDefenseCardAiIntake;
  const defenseCardRouteSelected = operationRouteIsSelected({
    operationType: "prepare_defense_card",
    routeDecision: args.routeDecision,
    turnFrame: args.turnFrame,
    tempMemory: args.tempMemory,
  });
  if (!defenseCardRouteSelected) return null;

  const nextTempMemory = { ...(args.tempMemory ?? {}) };
  const frame = loadDefenseCardFrameFromTempMemory(nextTempMemory);
  const pendingRaw = frame.pending;
  const pendingRecommendation = frame.recommendation;
  const explicitDefenseCardRoute =
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === "prepare_defense_card";
  const activeDefenseIntakeRaw = frame.active;
  const hasDefenseCardFlow = isPendingDefenseCardOperation(pendingRaw) ||
    isPendingDefenseCardRecommendationOperation(pendingRecommendation) ||
    String((activeDefenseIntakeRaw as any)?.operation_type ?? "") ===
      "prepare_defense_card";
  const hasTurnFrameDefenseIntent = Boolean(
    selectedDefenseCardIntent(args.turnFrame),
  );
  if (
    !explicitDefenseCardRoute &&
    !hasDefenseCardFlow &&
    !hasTurnFrameDefenseIntent &&
    args.routeDecision?.response_owner !== "tool_skill"
  ) {
    return null;
  }
  const lastPlanOperationInput = operationInputFromLastPlanItem(nextTempMemory);
  let fallbackOperationInput = mergeOperationInputSeeds(
    lastPlanOperationInput,
    operationInputFromTurnFrameIntent(args.turnFrame, lastPlanOperationInput),
  );

  if (!defenseCardLegacyRuntimeEnabled()) {
    return await runPrepareDefenseCardLocalRuntime({
      supabase: args.supabase,
      userId: args.userId,
      userMessage: args.userMessage,
      userTimezone: args.userTimezone,
      tempMemory: nextTempMemory,
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
      requestId: args.requestId ?? null,
      history: args.history,
      planSnapshot: args.planSnapshot ?? null,
      activeHandoff: activeDefenseIntakeRaw &&
          String((activeDefenseIntakeRaw as any)?.operation_type ?? "") ===
            "prepare_defense_card"
        ? activeDefenseIntakeRaw as DefenseCardHandoffState
        : null,
      operationInput: fallbackOperationInput,
      dispatcher: args.runLocalDispatcher,
      visibleAgent: args.runVisibleAgent,
    });
  }

  if (isPendingDefenseCardOperation(pendingRaw)) {
    const directConfirmationDecision = buildToolConfirmationDecision({
      user_message: args.userMessage,
      turn_frame: args.turnFrame,
      pending_confirmation: pendingRaw,
      operation_type: "prepare_defense_card",
      local_review: null,
      request_id: args.requestId ?? null,
    });
    const baseHandoff = buildDefenseCardHandoffDraft({
      draft: pendingRaw.draft,
      attachment: pendingRaw.attachment ?? null,
    });
    if (directConfirmationDecision.decision === "reject") {
      const cleared = clearDefenseCardFrame(nextTempMemory);
      return {
        content:
          "Ok, pas de carte de défense finalement. Je ne crée rien depuis le chat.",
        nextTempMemory: cleared,
        toolExecution: "platform_handoff",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          operation_type: "prepare_defense_card",
          status: "cancelled",
          operation_id: pendingRaw.operation_id ?? null,
          user_intent: "reject",
          requested_effects: [],
          allowed_effects: [],
          committed_effects: [],
          blocked_effects: [],
          platform_handoff: {
            operation_type: "prepare_defense_card",
            status: "cancelled",
            no_chat_mutation: true,
            draft: baseHandoff,
          },
          confirmation_decision: directConfirmationDecision,
          draft_review_decision: null,
        },
      };
    }
    if (directConfirmationDecision.decision === "approve") {
      const active = writeDefenseCardHandoffState({
        tempMemory: nextTempMemory,
        status: "apply_attempt",
        handoff: baseHandoff,
        previous: {
          draft_payload: pendingRaw.draft,
          operation_input: {
            previous_draft: pendingRaw.draft,
            attachment: pendingRaw.attachment ?? null,
            risk_situation: pendingRaw.risk_situation ?? null,
            intake_state: (pendingRaw as any).intake_state ?? undefined,
          },
        },
      });
      return handoffRuntime({
        status: "apply_attempt",
        handoff: baseHandoff,
        nextTempMemory: active,
        userIntent: "create",
        reasonCode: "chat_apply_attempt_redirected_to_platform",
        extraToolSkillRun: {
          operation_id: pendingRaw.operation_id ?? null,
          confirmation_decision: directConfirmationDecision,
        },
      });
    }
    const pendingReviewOutput = await runIntake({
      user_id: args.userId,
      request_id: args.requestId ?? null,
      channel: args.channel,
      timezone: args.userTimezone,
      message: args.userMessage,
      source: "direct_user_request",
      trigger_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
      plan_snapshot: args.planSnapshot ?? {},
      operation_input: {
        previous_draft: pendingRaw.draft,
        attachment: pendingRaw.attachment ?? null,
        risk_situation: pendingRaw.risk_situation ?? null,
        defense_response_hint: pendingRaw.defense_response_hint ??
          (pendingRaw.draft?.draft?.defense_response
            ? {
              strategy_hint: "unknown",
              value: pendingRaw.draft.draft.defense_response,
            }
            : undefined),
        intake_state: (pendingRaw as any).intake_state ?? undefined,
      },
    });
    if (pendingReviewOutput.status === "technical_blocked") {
      return technicalDefenseCardRuntime({
        output: pendingReviewOutput,
        nextTempMemory,
        operationId: pendingRaw.operation_id ?? null,
      });
    }
    const draftReviewDecision =
      pendingReviewOutput.state_patch.draft_review_decision;
    const confirmationDecision = buildToolConfirmationDecision({
      user_message: args.userMessage,
      turn_frame: args.turnFrame,
      pending_confirmation: pendingRaw,
      operation_type: "prepare_defense_card",
      local_review: draftReviewDecision,
      request_id: args.requestId ?? null,
    });
    const userIntent = intentFromDraftReviewDecision(
      confirmationDecision.decision === "topic_change"
        ? "topic_change"
        : confirmationDecision.decision,
      pendingReviewOutput.state_patch.user_intent,
    );
    const noCreate = hasPrepareDefenseCardNoCreateConstraint(
      pendingReviewOutput.state_patch.constraints,
    ) || userIntent === "draft_only";
    if (!draftReviewDecision) {
      if (
        (pendingReviewOutput.status === "pending_confirmation" ||
          pendingReviewOutput.status === "handoff_ready") &&
        (pendingReviewOutput.platform_fields || pendingReviewOutput.draft)
      ) {
        const handoff = buildDefenseCardHandoffDraftFromOutput({
          output: pendingReviewOutput,
          fallbackOperationInput: {
            attachment: pendingRaw.attachment ?? null,
            risk_situation: pendingRaw.risk_situation ?? null,
            intake_state: (pendingRaw as any).intake_state ?? undefined,
          },
        });
        if (!handoff) return null;
        const active = writeDefenseCardHandoffState({
          tempMemory: nextTempMemory,
          status: noCreate ? "handoff_ready" : "handoff_delivered",
          handoff,
          previous: {
            draft_payload: pendingReviewOutput.draft ?? null,
            operation_input: pendingReviewOutput.state_patch.operation_input ??
              null,
          },
        });
        return handoffRuntime({
          status: noCreate ? "handoff_ready" : "handoff_delivered",
          handoff,
          nextTempMemory: active,
          userIntent,
          reasonCode: noCreate
            ? "draft_only_platform_handoff"
            : "platform_handoff_delivered",
          extraToolSkillRun: {
            previous_operation_id: pendingRaw.operation_id ?? null,
            draft: pendingReviewOutput.draft ?? null,
            platform_fields: pendingReviewOutput.platform_fields ??
              pendingReviewOutput.state_patch.platform_fields ?? null,
            draft_review_decision: null,
          },
        });
      }
      if (pendingReviewOutput.status === "ask_question") {
        const active = writeDefenseCardFrameToTempMemory(nextTempMemory, {
          pending: null,
          active: {
            operation_type: "prepare_defense_card",
            skill_id: "prepare_defense_card",
            mode: "platform_handoff",
            status: "clarifying",
            phase: pendingReviewOutput.phase,
            missing_slots: pendingReviewOutput.state_patch.missing_slots,
            slot_state: pendingReviewOutput.next_question ?? null,
            operation_input: pendingReviewOutput.next_question?.known_slots ??
              null,
            tool_skill_state:
              pendingReviewOutput.state_patch.tool_skill_state ??
                null,
            turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
            max_turns: 6,
            no_chat_mutation: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        });
        return {
          content: renderDefenseCardSlotQuestion(
            pendingReviewOutput.next_question,
          ),
          nextTempMemory: active,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_defense_card",
            status: pendingReviewOutput.status,
            operation_id: pendingRaw.operation_id ?? null,
            user_intent: userIntent,
            missing_slots: pendingReviewOutput.state_patch.missing_slots,
            requested_effects: [],
            allowed_effects: [],
            committed_effects: [],
            blocked_effects: [],
            slot_state: pendingReviewOutput.next_question ?? null,
            draft_review_decision: null,
          },
        };
      }
      return {
        content: pendingReviewOutput.ack ??
          "Je n'ai pas réussi à relire cette demande techniquement. Je ne crée rien depuis le chat.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          status: pendingReviewOutput.status,
          operation_id: pendingRaw.operation_id ?? null,
          user_intent: userIntent,
          missing_slots: pendingReviewOutput.state_patch.missing_slots,
          requested_effects: [],
          allowed_effects: [],
          committed_effects: [],
          blocked_effects: [{
            type: "create_defense_card",
            reason_code: "pending_review_failed",
          }],
          draft_review_decision: null,
        },
      };
    }
    if (
      confirmationDecision.decision === "reject" || userIntent === "cancel" ||
      userIntent === "reject"
    ) {
      const cleared = clearDefenseCardFrame(nextTempMemory);
      return {
        content:
          "Ok, pas de carte de défense finalement. Je ne crée rien depuis le chat.",
        nextTempMemory: cleared,
        toolExecution: "platform_handoff",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          operation_type: "prepare_defense_card",
          status: "cancelled",
          operation_id: pendingRaw.operation_id ?? null,
          user_intent: userIntent,
          requested_effects: [],
          allowed_effects: [],
          committed_effects: [],
          blocked_effects: [],
          confirmation_decision: confirmationDecision,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (
      confirmationDecision.decision === "explain" ||
      userIntent === "explain" ||
      userIntent === "status_question" ||
      userIntent === "draft_only"
    ) {
      const active = writeDefenseCardHandoffState({
        tempMemory: nextTempMemory,
        status: "repeat_handoff",
        handoff: baseHandoff,
        previous: {
          draft_payload: pendingRaw.draft,
          operation_input: {
            previous_draft: pendingRaw.draft,
            attachment: pendingRaw.attachment ?? null,
            risk_situation: pendingRaw.risk_situation ?? null,
          },
        },
      });
      return handoffRuntime({
        status: "repeat_handoff",
        handoff: baseHandoff,
        nextTempMemory: active,
        userIntent,
        reasonCode: "repeat_platform_handoff",
        extraToolSkillRun: {
          operation_id: pendingRaw.operation_id ?? null,
          confirmation_decision: confirmationDecision,
          draft_review_decision: draftReviewDecision,
        },
      });
    }
    if (
      confirmationDecision.decision === "topic_change" ||
      userIntent === "topic_change"
    ) {
      const cleared = clearDefenseCardFrame(nextTempMemory);
      return {
        content: pendingReviewOutput.ack ??
          (pendingReviewOutput.state_patch.intake_state &&
              typeof pendingReviewOutput.state_patch.intake_state === "object"
            ? String(
              (pendingReviewOutput.state_patch.intake_state as any)
                .generated_user_message ?? "",
            )
            : "Ok, je sors de cette carte de défense."),
        nextTempMemory: cleared,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          status: "topic_change",
          operation_id: pendingRaw.operation_id ?? null,
          user_intent: userIntent,
          requested_effects: [],
          allowed_effects: [],
          committed_effects: [],
          blocked_effects: [{
            type: "prepare_defense_card",
            reason_code: "topic_change",
          }],
          confirmation_decision: confirmationDecision,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (confirmationDecision.decision === "revise" || userIntent === "revise") {
      if (
        (pendingReviewOutput.status === "pending_confirmation" ||
          pendingReviewOutput.status === "handoff_ready") &&
        (pendingReviewOutput.platform_fields || pendingReviewOutput.draft)
      ) {
        const handoff = buildDefenseCardHandoffDraftFromOutput({
          output: pendingReviewOutput,
          fallbackOperationInput: {
            attachment: pendingRaw.attachment ?? null,
            risk_situation: pendingRaw.risk_situation ?? null,
          },
        });
        if (!handoff) return null;
        const active = writeDefenseCardHandoffState({
          tempMemory: nextTempMemory,
          status: "revise_handoff",
          handoff,
          previous: {
            draft_payload: pendingReviewOutput.draft ?? null,
            operation_input: pendingReviewOutput.state_patch.operation_input ??
              null,
          },
        });
        return handoffRuntime({
          status: "revise_handoff",
          handoff,
          nextTempMemory: active,
          userIntent,
          reasonCode: "revised_platform_handoff",
          extraToolSkillRun: {
            previous_operation_id: pendingRaw.operation_id ?? null,
            confirmation_decision: confirmationDecision,
            draft: pendingReviewOutput.draft ?? null,
            platform_fields: pendingReviewOutput.platform_fields ??
              pendingReviewOutput.state_patch.platform_fields ?? null,
            draft_review_decision: draftReviewDecision,
          },
        });
      }

      const active = writeDefenseCardFrameToTempMemory(nextTempMemory, {
        pending: null,
        active: {
          operation_type: "prepare_defense_card",
          skill_id: "prepare_defense_card",
          mode: "platform_handoff",
          status: "clarifying",
          phase: pendingReviewOutput.phase,
          missing_slots: pendingReviewOutput.state_patch.missing_slots,
          slot_state: pendingReviewOutput.next_question ?? null,
          operation_input: pendingReviewOutput.next_question?.known_slots ??
            null,
          turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
          max_turns: 6,
          no_chat_mutation: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });
      return {
        content: renderDefenseCardSlotQuestion(
          pendingReviewOutput.next_question,
        ),
        nextTempMemory: active,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          status: pendingReviewOutput.status,
          operation_id: pendingRaw.operation_id ?? null,
          user_intent: userIntent,
          missing_slots: pendingReviewOutput.state_patch.missing_slots,
          requested_effects: [],
          allowed_effects: [],
          committed_effects: [],
          blocked_effects: [],
          slot_state: pendingReviewOutput.next_question ?? null,
          confirmation_decision: confirmationDecision,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (confirmationDecision.decision !== "approve") return null;
    const active = writeDefenseCardHandoffState({
      tempMemory: nextTempMemory,
      status: "apply_attempt",
      handoff: baseHandoff,
      previous: {
        draft_payload: pendingRaw.draft,
        operation_input: {
          previous_draft: pendingRaw.draft,
          attachment: pendingRaw.attachment ?? null,
          risk_situation: pendingRaw.risk_situation ?? null,
        },
      },
    });
    return handoffRuntime({
      status: "apply_attempt",
      handoff: baseHandoff,
      nextTempMemory: active,
      userIntent,
      reasonCode: noCreate
        ? "no_create_constraint_platform_handoff"
        : "chat_apply_attempt_redirected_to_platform",
      extraToolSkillRun: {
        operation_id: pendingRaw.operation_id ?? null,
        confirmation_decision: confirmationDecision,
        draft_review_decision: draftReviewDecision,
      },
    });
  }

  if (isPendingDefenseCardRecommendationOperation(pendingRecommendation)) {
    const confirmationDecision = buildToolConfirmationDecision({
      user_message: args.userMessage,
      turn_frame: args.turnFrame,
      pending_confirmation: pendingRecommendation,
      operation_type: "prepare_defense_card",
      local_review: (pendingRecommendation as any).draft_review_decision ??
        null,
      request_id: args.requestId ?? null,
    });
    if (confirmationDecision.decision === "reject") {
      delete nextTempMemory.__pending_recommendation_operation;
      return {
        content:
          "Ok, pas de carte de défense finalement. Je ne crée rien depuis le chat.",
        nextTempMemory,
        toolExecution: "platform_handoff",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          operation_type: "prepare_defense_card",
          status: "cancelled",
          user_intent: "reject",
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
          requested_effects: [],
          allowed_effects: [],
          committed_effects: [],
          blocked_effects: [],
          confirmation_decision: confirmationDecision,
        },
      };
    }
    if (
      confirmationDecision.decision !== "approve" && !explicitDefenseCardRoute
    ) return null;

    const recommendationOutput = await runIntake({
      user_id: args.userId,
      request_id: args.requestId ?? null,
      channel: args.channel,
      timezone: args.userTimezone,
      message: args.userMessage,
      source: "recommendation_tool",
      trigger_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      plan_snapshot: args.planSnapshot ?? {},
      operation_input: pendingRecommendation.operation_input ?? null,
    });
    if (recommendationOutput.status === "technical_blocked") {
      return technicalDefenseCardRuntime({
        output: recommendationOutput,
        nextTempMemory,
        source: "recommendation_tool",
        recommendationId: pendingRecommendation.recommendation_id ?? null,
      });
    }

    if (
      (recommendationOutput.status !== "pending_confirmation" &&
        recommendationOutput.status !== "handoff_ready") ||
      !(recommendationOutput.platform_fields || recommendationOutput.draft)
    ) {
      delete nextTempMemory.__pending_recommendation_operation;
      if (recommendationOutput.status === "ask_question") {
        nextTempMemory.__active_tool_skill_intake = {
          operation_type: "prepare_defense_card",
          phase: recommendationOutput.phase,
          missing_slots: recommendationOutput.state_patch.missing_slots,
          slot_state: recommendationOutput.next_question ?? null,
          operation_input: recommendationOutput.state_patch.operation_input ??
            recommendationOutput.next_question?.known_slots ??
            pendingRecommendation.operation_input ?? null,
          tool_skill_state: recommendationOutput.state_patch.tool_skill_state ??
            null,
          turn_count: 1,
          updated_at: new Date().toISOString(),
        };
      }
      return {
        content: renderDefenseCardSlotQuestion(
          recommendationOutput.next_question,
        ),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          status: recommendationOutput.status,
          source: "recommendation_tool",
          user_intent: recommendationOutput.state_patch.user_intent,
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
          missing_slots: recommendationOutput.state_patch.missing_slots,
          requested_effects: [],
          allowed_effects: [],
          committed_effects: [],
          blocked_effects: [],
          slot_state: recommendationOutput.next_question ?? null,
        },
      };
    }

    const noCreate = hasPrepareDefenseCardNoCreateConstraint(
      recommendationOutput.state_patch.constraints,
    ) || recommendationOutput.state_patch.user_intent === "draft_only";
    const handoff = buildDefenseCardHandoffDraftFromOutput({
      output: recommendationOutput,
      fallbackOperationInput: pendingRecommendation.operation_input ?? null,
    });
    if (!handoff) return null;
    delete nextTempMemory.__pending_recommendation_operation;
    const active = writeDefenseCardHandoffState({
      tempMemory: nextTempMemory,
      status: noCreate ? "handoff_ready" : "handoff_delivered",
      handoff,
      previous: {
        draft_payload: recommendationOutput.draft ?? null,
        operation_input: recommendationOutput.state_patch.operation_input ??
          pendingRecommendation.operation_input ?? null,
      },
    });
    return handoffRuntime({
      status: noCreate ? "handoff_ready" : "handoff_delivered",
      handoff,
      nextTempMemory: active,
      userIntent: recommendationOutput.state_patch.user_intent,
      reasonCode: noCreate
        ? "draft_only_platform_handoff"
        : "platform_handoff_delivered",
      extraToolSkillRun: {
        source: "recommendation_tool",
        recommendation_id: pendingRecommendation.recommendation_id ?? null,
        draft: recommendationOutput.draft ?? null,
        platform_fields: recommendationOutput.platform_fields ??
          recommendationOutput.state_patch.platform_fields ?? null,
      },
    });
  }

  const activeDefenseIntake = (
    nextTempMemory.__active_tool_skill_intake ??
      nextTempMemory.active_tool_skill_intake
  ) as any;
  if (
    activeDefenseIntake?.operation_type === "prepare_defense_card" &&
    activeDefenseIntake?.mode === "platform_handoff" &&
    activeDefenseIntake?.draft
  ) {
    const handoff = activeDefenseIntake.draft as DefenseCardHandoffDraft;
    const draftPayload = activeDefenseIntake.draft_payload as
      | DefenseCardDraftV1
      | undefined;
    const operationInput = {
      ...(activeDefenseIntake.operation_input ?? {}),
      ...(draftPayload ? { previous_draft: draftPayload } : {}),
    };
    const activeRouteReason = String(
      args.routeDecision?.reason_code ?? "",
    );
    if (
      activeRouteReason === "explicit_cancel_clears_active_handoff" ||
      activeRouteReason === "negative_confirmation_clears_active_handoff"
    ) {
      const cleared = clearDefenseCardFrame(nextTempMemory);
      return {
        content:
          "Ok, pas de carte de défense finalement. Je ne crée rien depuis le chat.",
        nextTempMemory: cleared,
        toolExecution: "platform_handoff",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          operation_type: "prepare_defense_card",
          status: "cancelled",
          user_intent: "reject",
          requested_effects: [],
          allowed_effects: [],
          committed_effects: [],
          blocked_effects: [],
          pending_confirmation: null,
          platform_handoff: {
            operation_type: "prepare_defense_card",
            status: "cancelled",
            no_chat_mutation: true,
            draft: handoff,
          },
        },
      };
    }
    if (activeRouteReason === "active_handoff_repeat_handoff") {
      const active = writeDefenseCardHandoffState({
        tempMemory: nextTempMemory,
        status: "repeat_handoff",
        handoff,
        previous: activeDefenseIntake,
      });
      return handoffRuntime({
        status: "repeat_handoff",
        handoff,
        nextTempMemory: active,
        userIntent: "explain",
        reasonCode: "repeat_platform_handoff",
      });
    }
    if (
      activeRouteReason === "active_handoff_apply_attempt" ||
      activeRouteReason === "confirmation_yes_is_handoff_apply_attempt"
    ) {
      const active = writeDefenseCardHandoffState({
        tempMemory: nextTempMemory,
        status: "apply_attempt",
        handoff,
        previous: activeDefenseIntake,
      });
      return handoffRuntime({
        status: "apply_attempt",
        handoff,
        nextTempMemory: active,
        userIntent: "create",
        reasonCode: "chat_apply_attempt_redirected_to_platform",
      });
    }
    const reviewOutput = await runIntake({
      user_id: args.userId,
      request_id: args.requestId ?? null,
      channel: args.channel,
      timezone: args.userTimezone,
      message: args.userMessage,
      source: "direct_user_request",
      trigger_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      turn_count: Number(activeDefenseIntake.turn_count ?? 0) + 1,
      plan_snapshot: args.planSnapshot ?? {},
      operation_input: operationInput,
    });
    if (reviewOutput.status === "technical_blocked") {
      const active = writeDefenseCardHandoffState({
        tempMemory: nextTempMemory,
        status: "blocked",
        handoff,
        previous: activeDefenseIntake,
      });
      return handoffRuntime({
        status: "blocked",
        handoff,
        nextTempMemory: active,
        reasonCode: "active_handoff_review_failed",
      });
    }
    const decision = reviewOutput.state_patch.draft_review_decision;
    const userIntent = intentFromDraftReviewDecision(
      decision?.decision,
      reviewOutput.state_patch.user_intent,
    );
    if (
      decision?.decision === "reject" || userIntent === "cancel" ||
      userIntent === "reject"
    ) {
      const cleared = clearDefenseCardFrame(nextTempMemory);
      return {
        content:
          "Ok, pas de carte de défense finalement. Je ne crée rien depuis le chat.",
        nextTempMemory: cleared,
        toolExecution: "platform_handoff",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_defense_card",
          operation_type: "prepare_defense_card",
          status: "cancelled",
          user_intent: userIntent,
          requested_effects: [],
          allowed_effects: [],
          committed_effects: [],
          blocked_effects: [],
          pending_confirmation: null,
          platform_handoff: {
            operation_type: "prepare_defense_card",
            status: "cancelled",
            no_chat_mutation: true,
            draft: handoff,
          },
        },
      };
    }
    if (decision?.decision === "approve" || userIntent === "create") {
      const active = writeDefenseCardHandoffState({
        tempMemory: nextTempMemory,
        status: "apply_attempt",
        handoff,
        previous: activeDefenseIntake,
      });
      return handoffRuntime({
        status: "apply_attempt",
        handoff,
        nextTempMemory: active,
        userIntent,
        reasonCode: "chat_apply_attempt_redirected_to_platform",
        extraToolSkillRun: { draft_review_decision: decision ?? null },
      });
    }
    if (
      decision?.decision === "revise" || userIntent === "revise" ||
      reviewOutput.status === "handoff_ready" ||
      reviewOutput.status === "pending_confirmation"
    ) {
      if (reviewOutput.platform_fields || reviewOutput.draft) {
        const revised = buildDefenseCardHandoffDraftFromOutput({
          output: reviewOutput,
          fallbackOperationInput: reviewOutput.state_patch.operation_input ??
            activeDefenseIntake.operation_input ?? null,
        });
        if (!revised) return null;
        const active = writeDefenseCardHandoffState({
          tempMemory: nextTempMemory,
          status: "revise_handoff",
          handoff: revised,
          previous: {
            ...activeDefenseIntake,
            draft_payload: reviewOutput.draft ?? null,
            operation_input: reviewOutput.state_patch.operation_input ??
              activeDefenseIntake.operation_input ?? null,
          },
        });
        return handoffRuntime({
          status: "revise_handoff",
          handoff: revised,
          nextTempMemory: active,
          userIntent,
          reasonCode: "revised_platform_handoff",
          extraToolSkillRun: { draft_review_decision: decision ?? null },
        });
      }
      if (reviewOutput.status === "ask_question") {
        const active = writeDefenseCardFrameToTempMemory(nextTempMemory, {
          active: {
            ...activeDefenseIntake,
            status: "clarifying",
            slot_state: reviewOutput.next_question ?? null,
            operation_input: reviewOutput.next_question?.known_slots ??
              activeDefenseIntake.operation_input ?? null,
            turn_count: Number(activeDefenseIntake.turn_count ?? 0) + 1,
            updated_at: new Date().toISOString(),
          },
        });
        return {
          content: renderDefenseCardSlotQuestion(reviewOutput.next_question),
          nextTempMemory: active,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_defense_card",
            status: "clarifying",
            user_intent: userIntent,
            missing_slots: reviewOutput.state_patch.missing_slots,
            requested_effects: [],
            allowed_effects: [],
            committed_effects: [],
            blocked_effects: [],
            slot_state: reviewOutput.next_question ?? null,
          },
        };
      }
    }
    const active = writeDefenseCardHandoffState({
      tempMemory: nextTempMemory,
      status: "repeat_handoff",
      handoff,
      previous: activeDefenseIntake,
    });
    return handoffRuntime({
      status: "repeat_handoff",
      handoff,
      nextTempMemory: active,
      userIntent,
      reasonCode: "repeat_platform_handoff",
      extraToolSkillRun: { draft_review_decision: decision ?? null },
    });
  }
  const activeAttachmentQuestion = activeDefenseIntake?.operation_type ===
      "prepare_defense_card"
    ? activeDefenseIntake.slot_state ?? activeDefenseIntake.next_question
    : null;
  const activeAttachmentCandidate = defenseCardAttachmentFromQuestionCandidate(
    activeAttachmentQuestion?.candidate,
  );
  if (activeAttachmentCandidate) {
    const activeKnownSlots = activeDefenseIntake?.operation_input ??
      activeAttachmentQuestion?.known_slots ??
      {};
    const candidateOutput = await runIntake({
      user_id: args.userId,
      request_id: args.requestId ?? null,
      channel: args.channel,
      timezone: args.userTimezone,
      message: args.userMessage,
      source: "direct_user_request",
      trigger_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      turn_count: Number(activeDefenseIntake.turn_count ?? 0) + 1,
      plan_snapshot: args.planSnapshot ?? {},
      operation_input: {
        ...activeKnownSlots,
        attachment_candidate: activeAttachmentCandidate,
      },
    });
    if (candidateOutput.status === "technical_blocked") {
      return technicalDefenseCardRuntime({
        output: candidateOutput,
        nextTempMemory,
      });
    }
    if (
      (candidateOutput.status === "pending_confirmation" ||
        candidateOutput.status === "handoff_ready") &&
      (candidateOutput.platform_fields || candidateOutput.draft)
    ) {
      const noCreate = hasPrepareDefenseCardNoCreateConstraint(
        candidateOutput.state_patch.constraints,
      ) || candidateOutput.state_patch.user_intent === "draft_only";
      const handoff = buildDefenseCardHandoffDraftFromOutput({
        output: candidateOutput,
        fallbackOperationInput: { attachment: activeAttachmentCandidate },
      });
      if (!handoff) return null;
      const active = writeDefenseCardHandoffState({
        tempMemory: nextTempMemory,
        status: noCreate ? "handoff_ready" : "handoff_delivered",
        handoff,
        previous: {
          draft_payload: candidateOutput.draft ?? null,
          operation_input: candidateOutput.state_patch.operation_input ?? {
            ...activeKnownSlots,
            attachment_candidate: activeAttachmentCandidate,
          },
        },
      });
      return handoffRuntime({
        status: noCreate ? "handoff_ready" : "handoff_delivered",
        handoff,
        nextTempMemory: active,
        userIntent: candidateOutput.state_patch.user_intent,
        reasonCode: noCreate
          ? "draft_only_platform_handoff"
          : "platform_handoff_delivered",
        extraToolSkillRun: {
          draft: candidateOutput.draft ?? null,
          platform_fields: candidateOutput.platform_fields ??
            candidateOutput.state_patch.platform_fields ?? null,
          attachment_slot_resolution: {
            status: "resolved_by_skill_intake",
            attachment: activeAttachmentCandidate,
          },
        },
      });
    }
    nextTempMemory.__active_tool_skill_intake = {
      operation_type: "prepare_defense_card",
      phase: candidateOutput.phase,
      missing_slots: candidateOutput.state_patch.missing_slots,
      slot_state: candidateOutput.next_question ?? null,
      operation_input: candidateOutput.state_patch.operation_input ?? {
        ...activeKnownSlots,
        attachment_candidate: activeAttachmentCandidate,
      },
      turn_count: Number(activeDefenseIntake.turn_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    };
    return {
      content: renderDefenseCardSlotQuestion(candidateOutput.next_question),
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_defense_card",
        status: candidateOutput.status,
        user_intent: candidateOutput.state_patch.user_intent,
        missing_slots: candidateOutput.state_patch.missing_slots,
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        slot_state: candidateOutput.next_question ?? null,
        attachment_slot_resolution: {
          status: "handled_by_skill_intake",
          attachment: activeAttachmentCandidate,
        },
      },
    };
  }

  if (
    activeDefenseIntake?.operation_type === "prepare_defense_card" &&
    activeDefenseIntake?.operation_input
  ) {
    fallbackOperationInput = activeDefenseIntake.operation_input;
  }

  const output = await runIntake({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    channel: args.channel,
    timezone: args.userTimezone,
    message: args.userMessage,
    source: "direct_user_request",
    trigger_message_id: args.sourceMessageId ?? args.requestId ??
      crypto.randomUUID(),
    safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
    turn_count: Number(
      (nextTempMemory.__active_tool_skill_intake as any)?.turn_count ?? 0,
    ),
    plan_snapshot: args.planSnapshot ?? {},
    operation_input: fallbackOperationInput,
  });
  if (output.status === "technical_blocked") {
    return technicalDefenseCardRuntime({
      output,
      nextTempMemory,
    });
  }

  if (
    (output.status === "pending_confirmation" ||
      output.status === "handoff_ready") &&
    (output.platform_fields || output.draft)
  ) {
    const noCreate = hasPrepareDefenseCardNoCreateConstraint(
      output.state_patch.constraints,
    ) || output.state_patch.user_intent === "draft_only";
    const handoff = buildDefenseCardHandoffDraftFromOutput({
      output,
      fallbackOperationInput,
    });
    if (!handoff) return null;
    const active = writeDefenseCardHandoffState({
      tempMemory: nextTempMemory,
      status: noCreate ? "handoff_ready" : "handoff_delivered",
      handoff,
      previous: {
        draft_payload: output.draft ?? null,
        operation_input: output.state_patch.operation_input ??
          fallbackOperationInput ?? null,
      },
    });
    return handoffRuntime({
      status: noCreate ? "handoff_ready" : "handoff_delivered",
      handoff,
      nextTempMemory: active,
      userIntent: output.state_patch.user_intent,
      reasonCode: noCreate
        ? "draft_only_platform_handoff"
        : "platform_handoff_delivered",
      extraToolSkillRun: {
        draft: output.draft ?? null,
        platform_fields: output.platform_fields ??
          output.state_patch.platform_fields ?? null,
      },
    });
  }

  if (output.status === "ask_question") {
    nextTempMemory.__active_tool_skill_intake = {
      operation_type: "prepare_defense_card",
      phase: output.phase,
      missing_slots: output.state_patch.missing_slots,
      slot_state: output.next_question ?? null,
      operation_input: output.next_question?.known_slots ?? null,
      tool_skill_state: output.state_patch.tool_skill_state ?? null,
      turn_count: 1,
      updated_at: new Date().toISOString(),
    };
    return {
      content: renderDefenseCardSlotQuestion(output.next_question),
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_defense_card",
        status: "ask_question",
        user_intent: output.state_patch.user_intent,
        missing_slots: output.state_patch.missing_slots,
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        slot_state: output.next_question ?? null,
      },
    };
  }

  return {
    content: output.ack ?? renderDefenseCardFallbackFailed(),
    nextTempMemory,
    toolExecution: output.status === "blocked_by_safety" ? "blocked" : "failed",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "prepare_defense_card",
      status: output.status,
      user_intent: output.state_patch.user_intent,
      missing_slots: output.state_patch.missing_slots,
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [{
        type: "create_defense_card",
        reason_code: output.status === "blocked_by_safety"
          ? "blocked_by_safety"
          : "intake_failed",
      }],
    },
  };
}
