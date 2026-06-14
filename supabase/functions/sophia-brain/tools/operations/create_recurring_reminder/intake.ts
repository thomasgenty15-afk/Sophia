import type {
  ConversationChannel,
  RiskBand,
} from "../../../contracts/turn_frame.v1.ts";
import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import {
  buildOperationDraftRequest,
  buildRecurringReminderPayload,
} from "../_shared/operation_payload_builder.ts";
import {
  reviewToolSkillDraftWithAi,
  type ToolSkillDraftReviewDecision,
} from "../_shared/draft_review.ts";
import {
  buildRecurringReminderHandoffDraft,
  type RecurringReminderDraftMessages,
  type RecurringReminderDraftV1,
  runRecurringReminderBuilder,
} from "./generator.ts";
import type {
  CreateRecurringReminderConstraint,
  CreateRecurringReminderHandoffTarget,
  CreateRecurringReminderUserIntent,
  RecurringReminderHandoffDraft,
} from "./contract.ts";

export type RecurringReminderConfidence = "low" | "medium" | "high";
export type RecurringReminderFrequency =
  | "daily"
  | "weekly"
  | "specific_days"
  | "weekdays"
  | "custom";
export type RecurringReminderSubSkill =
  | "recurrence_resolution"
  | "content_intake"
  | "draft_generation"
  | "draft_validation"
  | "confirmation";

type SlotStatus = "missing" | "ambiguous" | "identified";

export type RecurringReminderIntakeState = {
  skill_id: "create_recurring_reminder";
  current_sub_skill: RecurringReminderSubSkill;
  user_intent: CreateRecurringReminderUserIntent;
  constraints: CreateRecurringReminderConstraint[];
  handoff_target: CreateRecurringReminderHandoffTarget;
  recurrence: {
    status: SlotStatus;
    frequency: RecurringReminderFrequency | null;
    days: string[];
    time: string | null;
    timezone: string | null;
    cadence_label: string | null;
    confidence: RecurringReminderConfidence;
    evidence: string[];
  };
  reminder_content: {
    status: SlotStatus;
    message: string | null;
    subject_hint: string | null;
    confidence: RecurringReminderConfidence;
    evidence: string[];
  };
  destination: {
    status: SlotStatus;
    value: "current_plan" | "base_de_vie";
    related_plan_item_id: string | null;
    target_kind: "none" | "transformation" | "plan_item" | "action_family";
    target_plan_item_id: string | null;
    target_action_family_key: string | null;
    target_generated_temp_id: string | null;
    target_binding_policy:
      | "none"
      | "snapshot"
      | "live_action"
      | "live_action_family";
    target_lifecycle_policy:
      | "independent"
      | "while_target_active"
      | "while_family_in_current_plan";
    target_label: string | null;
    confidence: RecurringReminderConfidence;
    evidence: string[];
  };
  draft_messages: RecurringReminderDraftMessages;
  missing_slots: string[];
  confidence: RecurringReminderConfidence;
  generated_user_message: string | null;
};

export type CreateRecurringReminderSlotFillerInput = {
  user_id: string;
  request_id?: string | null;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  current_state?: RecurringReminderIntakeState | null;
  operation_input?: Record<string, unknown> | null;
  platform_context?: Record<string, unknown> | null;
  timezone: string;
  channel: ConversationChannel;
};

export type CreateRecurringReminderSlotFillerOutput = {
  current_sub_skill: RecurringReminderSubSkill;
  user_intent: CreateRecurringReminderUserIntent;
  constraints: CreateRecurringReminderConstraint[];
  handoff_target: CreateRecurringReminderHandoffTarget;
  state_patch: Partial<RecurringReminderIntakeState>;
  missing_slots: string[];
  confidence: RecurringReminderConfidence;
  generated_user_message?: string | null;
  evidence?: string[];
};

export type CreateRecurringReminderSlotFiller = (
  input: CreateRecurringReminderSlotFillerInput,
) => Promise<CreateRecurringReminderSlotFillerOutput | null>;

export type CreateRecurringReminderOperationOutput = {
  operation_type: "create_recurring_reminder";
  status:
    | "ask_question"
    | "draft_ready"
    | "handoff_ready"
    | "handoff_to_one_shot"
    | "cancelled"
    | "fallback_dashboard"
    | "invalid_recommendation_payload"
    | "blocked_by_safety"
    | "technical_error";
  source: "direct_user_request" | "recommendation_tool";
  phase:
    | "recurrence_resolution"
    | "content_intake"
    | "generation"
    | "confirmation"
    | "exit";
  draft?: RecurringReminderDraftV1;
  handoff_draft?: RecurringReminderHandoffDraft;
  confirmation?: {
    required: boolean;
    message: string;
    actions: ["yes", "no"];
  };
  next_question?: { needed: boolean; question?: string; reason?: string };
  pending_confirmation?: Record<string, unknown>;
  ack?: string;
  state_patch: {
    summary: string;
    phase: string;
    missing_slots: string[];
    turn_count_increment: 1;
    operation_input?: Record<string, unknown>;
    intake_state?: RecurringReminderIntakeState;
  };
};

export function reviewCreateRecurringReminderDraft(input: {
  message: string;
  previous_draft: unknown;
  operation_input?: Record<string, unknown> | null;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  request_id?: string | null;
  user_id?: string | null;
}): Promise<ToolSkillDraftReviewDecision | null> {
  return reviewToolSkillDraftWithAi({
    operation_type: "create_recurring_reminder",
    message: input.message,
    previous_draft: input.previous_draft,
    operation_input: input.operation_input,
    recent_messages: input.recent_messages,
    request_id: input.request_id,
    user_id: input.user_id,
  });
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function confidence(value: unknown): RecurringReminderConfidence {
  const raw = String(value ?? "").trim();
  return raw === "high" || raw === "medium" || raw === "low" ? raw : "low";
}

function frequency(value: unknown): RecurringReminderFrequency | null {
  const raw = String(value ?? "").trim();
  return ["daily", "weekly", "specific_days", "weekdays", "custom"].includes(
      raw,
    )
    ? raw as RecurringReminderFrequency
    : null;
}

function subSkill(value: unknown): RecurringReminderSubSkill {
  const raw = String(value ?? "").trim();
  return [
      "recurrence_resolution",
      "content_intake",
      "draft_generation",
      "draft_validation",
      "confirmation",
    ].includes(raw)
    ? raw as RecurringReminderSubSkill
    : "recurrence_resolution";
}

function userIntent(value: unknown): CreateRecurringReminderUserIntent {
  const raw = String(value ?? "").trim();
  return [
      "start",
      "provide_slot",
      "draft_only",
      "create",
      "cancel",
      "reject",
      "revise",
      "explain",
      "topic_change",
      "status_question",
      "one_shot_handoff",
      "clarify",
      "unknown",
    ].includes(raw)
    ? raw as CreateRecurringReminderUserIntent
    : "unknown";
}

function handoffTarget(value: unknown): CreateRecurringReminderHandoffTarget {
  return String(value ?? "").trim() === "create_one_shot_reminder"
    ? "create_one_shot_reminder"
    : null;
}

function constraints(value: unknown): CreateRecurringReminderConstraint[] {
  if (!Array.isArray(value)) return [];
  const allowedKinds = new Set([
    "recurring_only",
    "no_one_shot",
    "no_create",
    "draft_only",
    "base_de_vie",
    "current_plan",
    "exact_text",
    "no_plan_binding",
  ]);
  return value.flatMap((item) => {
    const root = objectValue(item);
    const kind = String(root?.kind ?? "").trim();
    if (!allowedKinds.has(kind)) return [];
    return [{
      kind: kind as CreateRecurringReminderConstraint["kind"],
      value: root && "value" in root ? root.value : undefined,
      evidence: stringArray(root?.evidence),
    }];
  });
}

function destinationValue(value: unknown): "current_plan" | "base_de_vie" {
  return String(value ?? "").trim() === "current_plan"
    ? "current_plan"
    : "base_de_vie";
}

function targetKind(
  value: unknown,
): "none" | "transformation" | "plan_item" | "action_family" {
  const raw = String(value ?? "").trim();
  return raw === "transformation" || raw === "plan_item" ||
      raw === "action_family"
    ? raw
    : "none";
}

function targetBindingPolicy(
  value: unknown,
): "none" | "snapshot" | "live_action" | "live_action_family" {
  const raw = String(value ?? "").trim();
  return raw === "snapshot" || raw === "live_action" ||
      raw === "live_action_family"
    ? raw
    : "none";
}

function targetLifecyclePolicy(
  value: unknown,
): "independent" | "while_target_active" | "while_family_in_current_plan" {
  const raw = String(value ?? "").trim();
  return raw === "while_target_active" ||
      raw === "while_family_in_current_plan"
    ? raw
    : "independent";
}

function timeString(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const parts = raw.split(":");
  if (parts.length !== 2) return null;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (
    !Number.isInteger(hour) || !Number.isInteger(minute) ||
    hour < 0 || hour > 23 || minute < 0 || minute > 59
  ) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function slotStatus(value: unknown): SlotStatus {
  const raw = String(value ?? "").trim();
  return raw === "identified" || raw === "ambiguous" ? raw : "missing";
}

function defaultState(timezone: string): RecurringReminderIntakeState {
  return {
    skill_id: "create_recurring_reminder",
    current_sub_skill: "recurrence_resolution",
    user_intent: "unknown",
    constraints: [{
      kind: "recurring_only",
      evidence: ["create_recurring_reminder_domain"],
    }],
    handoff_target: null,
    recurrence: {
      status: "missing",
      frequency: null,
      days: [],
      time: null,
      timezone,
      cadence_label: null,
      confidence: "low",
      evidence: [],
    },
    reminder_content: {
      status: "missing",
      message: null,
      subject_hint: null,
      confidence: "low",
      evidence: [],
    },
    destination: {
      status: "identified",
      value: "base_de_vie",
      related_plan_item_id: null,
      target_kind: "none",
      target_plan_item_id: null,
      target_action_family_key: null,
      target_generated_temp_id: null,
      target_binding_policy: "none",
      target_lifecycle_policy: "independent",
      target_label: null,
      confidence: "medium",
      evidence: ["default_destination"],
    },
    draft_messages: {},
    missing_slots: ["frequency", "time", "message"],
    confidence: "low",
    generated_user_message: null,
  };
}

function normalizeDraftMessages(
  value: unknown,
): RecurringReminderDraftMessages {
  const root = objectValue(value);
  if (!root) return {};
  const message = (key: keyof RecurringReminderDraftMessages) => {
    const text = String(root[key] ?? "").trim();
    return text || undefined;
  };
  return {
    confirmation_message: message("confirmation_message"),
    user_message_brief: message("user_message_brief"),
    user_message_detailed: message("user_message_detailed"),
    execution_message: message("execution_message"),
    revision_message: message("revision_message"),
  };
}

function normalizeStatePatch(
  value: unknown,
  timezone: string,
): Partial<RecurringReminderIntakeState> {
  const root = objectValue(value);
  if (!root) return {};
  const patch: Partial<RecurringReminderIntakeState> = {};
  const recurrence = objectValue(root.recurrence);
  if (recurrence) {
    const normalizedFrequency = frequency(recurrence.frequency);
    const normalizedTime = timeString(recurrence.time);
    patch.recurrence = {
      status: slotStatus(recurrence.status),
      frequency: normalizedFrequency,
      days: stringArray(recurrence.days),
      time: normalizedTime,
      timezone: String(recurrence.timezone ?? timezone).trim() || timezone,
      cadence_label: String(recurrence.cadence_label ?? "").trim() || null,
      confidence: confidence(recurrence.confidence),
      evidence: stringArray(recurrence.evidence),
    };
  }
  const content = objectValue(root.reminder_content);
  if (content) {
    const message = String(content.message ?? "").trim();
    const subjectHint = String(content.subject_hint ?? "").trim();
    patch.reminder_content = {
      status: message ? slotStatus(content.status) : "missing",
      message: message || null,
      subject_hint: subjectHint || message || null,
      confidence: confidence(content.confidence),
      evidence: stringArray(content.evidence),
    };
  }
  const destination = objectValue(root.destination);
  if (destination) {
    const relatedPlanItemId = destination.related_plan_item_id == null
      ? null
      : String(destination.related_plan_item_id).trim() || null;
    const targetPlanItemId = destination.target_plan_item_id == null
      ? relatedPlanItemId
      : String(destination.target_plan_item_id).trim() || null;
    patch.destination = {
      status: slotStatus(destination.status),
      value: destinationValue(destination.value),
      related_plan_item_id: relatedPlanItemId,
      target_kind: targetKind(destination.target_kind),
      target_plan_item_id: targetPlanItemId,
      target_action_family_key: destination.target_action_family_key == null
        ? null
        : String(destination.target_action_family_key).trim() || null,
      target_generated_temp_id: destination.target_generated_temp_id == null
        ? null
        : String(destination.target_generated_temp_id).trim() || null,
      target_binding_policy: targetBindingPolicy(
        destination.target_binding_policy,
      ),
      target_lifecycle_policy: targetLifecyclePolicy(
        destination.target_lifecycle_policy,
      ),
      target_label: destination.target_label == null
        ? null
        : String(destination.target_label).trim() || null,
      confidence: confidence(destination.confidence),
      evidence: stringArray(destination.evidence),
    };
  }
  const messages = normalizeDraftMessages(root.draft_messages);
  if (Object.keys(messages).length > 0) patch.draft_messages = messages;
  if (Array.isArray(root.missing_slots)) {
    patch.missing_slots = stringArray(root.missing_slots);
  }
  if (root.current_sub_skill) {
    patch.current_sub_skill = subSkill(root.current_sub_skill);
  }
  if (root.user_intent !== undefined) {
    patch.user_intent = userIntent(root.user_intent);
  }
  if (root.handoff_target !== undefined) {
    patch.handoff_target = handoffTarget(root.handoff_target);
  }
  if (root.constraints !== undefined) {
    patch.constraints = constraints(root.constraints);
  }
  if (root.generated_user_message !== undefined) {
    patch.generated_user_message = root.generated_user_message == null
      ? null
      : String(root.generated_user_message).trim() || null;
  }
  patch.confidence = confidence(root.confidence);
  return patch;
}

function mergeState(
  base: RecurringReminderIntakeState,
  patch: unknown,
  timezone: string,
): RecurringReminderIntakeState {
  const normalized = normalizeStatePatch(patch, timezone);
  const next: RecurringReminderIntakeState = {
    ...base,
    recurrence: { ...base.recurrence },
    reminder_content: { ...base.reminder_content },
    destination: { ...base.destination },
    draft_messages: { ...base.draft_messages },
    constraints: [...base.constraints],
    missing_slots: [...base.missing_slots],
  };
  if (normalized.current_sub_skill) {
    next.current_sub_skill = normalized.current_sub_skill;
  }
  if (normalized.user_intent) {
    next.user_intent = normalized.user_intent;
  }
  if (normalized.handoff_target !== undefined) {
    next.handoff_target = normalized.handoff_target;
  }
  if (normalized.constraints) {
    next.constraints = normalized.constraints;
  }
  if (normalized.recurrence) {
    next.recurrence = { ...next.recurrence, ...normalized.recurrence };
  }
  if (normalized.reminder_content) {
    next.reminder_content = {
      ...next.reminder_content,
      ...normalized.reminder_content,
    };
  }
  if (normalized.destination) {
    next.destination = { ...next.destination, ...normalized.destination };
  }
  if (normalized.draft_messages) {
    next.draft_messages = {
      ...next.draft_messages,
      ...normalized.draft_messages,
    };
  }
  if (normalized.generated_user_message !== undefined) {
    next.generated_user_message = normalized.generated_user_message;
  }
  next.confidence = normalized.confidence ?? next.confidence;
  next.missing_slots = normalized.missing_slots ?? next.missing_slots;
  return recalculateReadiness(next, timezone);
}

function stateFromOperationInput(
  operationInput: Record<string, unknown> | null | undefined,
  timezone: string,
): RecurringReminderIntakeState {
  const input = operationInput ?? {};
  const existing = objectValue(input.intake_state);
  const recurrence = objectValue(input.recurrence);
  const content = objectValue(input.reminder_content);
  const destination = objectValue(input.destination);
  return mergeState(defaultState(timezone), {
    ...(existing ?? {}),
    recurrence: {
      ...(objectValue(existing?.recurrence) ?? {}),
      ...(recurrence ?? {}),
      frequency: recurrence?.frequency ?? input.frequency,
      days: recurrence?.days ?? input.days,
      time: recurrence?.time ?? input.time,
      timezone,
      cadence_label: recurrence?.cadence_label ?? input.cadence_label,
      status: recurrence?.status ??
        (input.frequency || input.time ? "identified" : undefined),
      evidence: recurrence?.evidence ?? ["structured_operation_input"],
      confidence: recurrence?.confidence ?? "high",
    },
    reminder_content: {
      ...(objectValue(existing?.reminder_content) ?? {}),
      ...(content ?? {}),
      message: content?.message ?? input.message,
      subject_hint: content?.subject_hint ?? input.message,
      status: content?.status ?? (input.message ? "identified" : undefined),
      evidence: content?.evidence ?? ["structured_operation_input"],
      confidence: content?.confidence ?? "high",
    },
    destination: {
      ...(objectValue(existing?.destination) ?? {}),
      ...(destination ?? {}),
    },
    draft_messages: {
      ...(objectValue(existing?.draft_messages) ?? {}),
      ...(objectValue(input.draft_messages) ?? {}),
    },
    user_intent: existing?.user_intent ?? input.user_intent,
    constraints: existing?.constraints ?? input.constraints,
    handoff_target: existing?.handoff_target ?? input.handoff_target,
    generated_user_message: existing?.generated_user_message,
  }, timezone);
}

function recalculateReadiness(
  state: RecurringReminderIntakeState,
  timezone: string,
): RecurringReminderIntakeState {
  const missing = [
    !state.recurrence.frequency ? "frequency" : "",
    !state.recurrence.time ? "time" : "",
    !state.reminder_content.message ? "message" : "",
  ].filter(Boolean);
  const ready = missing.length === 0;
  return {
    ...state,
    current_sub_skill: ready ? "draft_generation" : state.current_sub_skill,
    recurrence: {
      ...state.recurrence,
      status: state.recurrence.frequency && state.recurrence.time
        ? "identified"
        : state.recurrence.frequency || state.recurrence.time
        ? "ambiguous"
        : "missing",
      timezone: state.recurrence.timezone || timezone,
    },
    reminder_content: {
      ...state.reminder_content,
      status: state.reminder_content.message ? "identified" : "missing",
      subject_hint: state.reminder_content.subject_hint ??
        state.reminder_content.message,
    },
    missing_slots: missing,
  };
}

function operationInputFromState(
  state: RecurringReminderIntakeState,
): Record<string, unknown> {
  return {
    intake_state: state,
    user_intent: state.user_intent,
    constraints: state.constraints,
    handoff_target: state.handoff_target,
    ...(state.recurrence.frequency
      ? { frequency: state.recurrence.frequency }
      : {}),
    ...(state.recurrence.days.length > 0
      ? { days: state.recurrence.days }
      : {}),
    ...(state.recurrence.time ? { time: state.recurrence.time } : {}),
    ...(state.recurrence.cadence_label
      ? { cadence_label: state.recurrence.cadence_label }
      : {}),
    ...(state.reminder_content.message
      ? { message: state.reminder_content.message }
      : {}),
    draft_messages: state.draft_messages,
  };
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
  cleaned = cleaned.trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("recurring_reminder_slots_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("recurring_reminder_slots_not_object");
  }
  return parsed as Record<string, unknown>;
}

export function normalizeCreateRecurringReminderSlotFillerOutput(
  raw: unknown,
  timezone: string,
): CreateRecurringReminderSlotFillerOutput {
  const root = parseJsonObject(raw);
  return {
    current_sub_skill: subSkill(root.current_sub_skill),
    user_intent: userIntent(root.user_intent),
    constraints: constraints(root.constraints),
    handoff_target: handoffTarget(root.handoff_target),
    state_patch: normalizeStatePatch(root.state_patch, timezone),
    missing_slots: stringArray(root.missing_slots),
    confidence: confidence(root.confidence),
    generated_user_message: root.generated_user_message == null
      ? null
      : String(root.generated_user_message).trim() || null,
    evidence: stringArray(root.evidence),
  };
}

export async function fillCreateRecurringReminderSlotsWithAi(
  input: CreateRecurringReminderSlotFillerInput,
): Promise<CreateRecurringReminderSlotFillerOutput | null> {
  const systemPrompt = [
    "Tu es le slot filler interne du Tool Skill create_recurring_reminder de Sophia.",
    "Tu ne réponds jamais librement au user. Tu retournes uniquement un JSON de progression.",
    "Principe strict: la compréhension du message user est ici, dans ce JSON. Le code ne fera pas de regex ni de fallback métier.",
    "Le tool crée seulement des rappels récurrents. Si la demande est ponctuelle, retourne user_intent='one_shot_handoff', handoff_target='create_one_shot_reminder', constraints avec recurring_only/no_one_shot, generated_user_message court, et ne génère jamais de draft récurrent.",
    "Tu dois identifier ou mettre à jour: recurrence, reminder_content, destination, draft_messages, slots manquants et message court à envoyer au user.",
    "Le minimum métier est: fréquence récurrente, heure locale HH:mm, et message exact/actionnable du rappel.",
    "Interprète 'jours de semaine' comme frequency='weekdays'. Interprète les heures françaises comme '12h30', '7h30', '18h' en HH:mm sans redemander l'heure quand elle est déjà présente.",
    "Si le user dit 'même message' ou corrige seulement la fréquence/l'heure, conserve le message déjà présent dans current_state ou operation_input.",
    "Utilise platform_context uniquement comme contexte produit: cycles/plans actifs et items visibles. Ne crée jamais un related_plan_item_id ou target_plan_item_id qui n'existe pas dans platform_context.plan_items.",
    "Destination: si le user dit explicitement base de vie/hors plan, value='base_de_vie', target_kind='none'. Sinon compare le contenu demandé aux plans/items actifs: si un seul plan ou item correspond clairement, value='current_plan'. Une correspondance claire exige que le rappel reprenne un objectif/action/habitude du plan; un thème général de vie (phrase stoïcienne, citation, météo intérieure, journaling générique, méditation générique, intention de journée) ne doit pas être rattaché au plan par simple proximité émotionnelle. Si deux plans actifs peuvent correspondre, generated_user_message demande lequel choisir au lieu de trancher. Si aucun plan/item ne correspond clairement, garde base_de_vie.",
    "Binding: si le rappel vise une action/mission précise, related_plan_item_id=target_plan_item_id=id de l'item, target_kind='plan_item', target_binding_policy='live_action', target_lifecycle_policy='while_target_active', target_label=titre de l'action.",
    "Binding habitude: seulement si l'item est une habitude/action récurrente (kind='habit' ou item_nature='recurring_habit') et que platform_context.plan_items fournit action_family_key, préfère target_kind='action_family', target_action_family_key=action_family_key, target_generated_temp_id si fourni, target_binding_policy='live_action_family', target_lifecycle_policy='while_family_in_current_plan'. Garde aussi related_plan_item_id/target_plan_item_id sur l'item courant. Pour une mission/tâche/exercice non habituel, n'utilise jamais target_kind='action_family': utilise target_kind='plan_item'.",
    "Si le rappel vise seulement la transformation/le plan sans action précise: target_kind='transformation', target_binding_policy='snapshot', target_lifecycle_policy='independent'.",
    "Les messages visibles doivent préciser qu'un rappel lié à une action s'applique tant que cette action reste active dans le plan. Pour une habitude/famille, dis tant que cette famille d'habitude reste active dans le plan.",
    "Les messages visibles ne doivent jamais promettre de modifier/annuler depuis le chat: ils doivent dire d'aller sur la plateforme, dans les Initiatives du plan ou la Base de vie.",
    "Si le user modifie un brouillon, intègre la correction dans le state_patch au lieu d'approuver directement.",
    "Quand tous les slots sont prêts, current_sub_skill='draft_generation' et draft_messages.confirmation_message doit être une phrase naturelle qui présente la version à reprendre dans la section Initiatives, sans demander d'approbation exécutable.",
    "draft_messages doit aussi inclure user_message_brief, user_message_detailed et revision_message quand c'est possible. N'écris jamais de message qui dit que le rappel a été créé, programmé ou qu'il sera relancé depuis le chat.",
    "Si un slot manque, generated_user_message pose une seule question courte pour le prochain slot métier.",
    "Les messages user doivent être courts et naturels pour WhatsApp. Pas de vocabulaire technique.",
    'Tu tutoies toujours l\'utilisateur dans les messages. N\'utilise "vous", "votre" ou "vos" que si tu parles explicitement du couple ou de plusieurs personnes, jamais pour t\'adresser directement à l\'utilisateur.',
    'Quand un message visible parle de toi, utilise la premiere personne du singulier ("je", "me", "moi"), jamais "Sophia".',
    'Sophia est feminine: quand un message visible parle de toi, accorde les adjectifs et participes au feminin ("contente", "prete", "desolee", "ravie", etc.).',
  ].join("\n");
  const userPrompt = JSON.stringify({
    task: "fill_create_recurring_reminder_tool_skill_slots",
    required_json_shape: {
      current_sub_skill:
        "recurrence_resolution|content_intake|draft_generation|draft_validation|confirmation",
      user_intent:
        "start|provide_slot|draft_only|create|cancel|reject|revise|explain|topic_change|status_question|one_shot_handoff|clarify|unknown",
      constraints: [{
        kind:
          "recurring_only|no_one_shot|no_create|draft_only|base_de_vie|current_plan|exact_text|no_plan_binding",
        value: "unknown",
        evidence: ["string"],
      }],
      handoff_target: "create_one_shot_reminder|null",
      state_patch: {
        user_intent:
          "start|provide_slot|draft_only|create|cancel|reject|revise|explain|topic_change|status_question|one_shot_handoff|clarify|unknown",
        constraints: [{
          kind:
            "recurring_only|no_one_shot|no_create|draft_only|base_de_vie|current_plan|exact_text|no_plan_binding",
          value: "unknown",
          evidence: ["string"],
        }],
        handoff_target: "create_one_shot_reminder|null",
        recurrence: {
          status: "missing|ambiguous|identified",
          frequency: "daily|weekly|specific_days|weekdays|custom|null",
          days: ["lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche"],
          time: "HH:mm|null",
          timezone: input.timezone,
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        reminder_content: {
          status: "missing|ambiguous|identified",
          message: "string|null",
          subject_hint: "string|null",
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        destination: {
          status: "missing|ambiguous|identified",
          value: "base_de_vie|current_plan",
          related_plan_item_id: "string|null",
          target_kind: "none|transformation|plan_item|action_family",
          target_plan_item_id: "string|null",
          target_action_family_key: "string|null",
          target_generated_temp_id: "string|null",
          target_binding_policy: "none|snapshot|live_action|live_action_family",
          target_lifecycle_policy:
            "independent|while_target_active|while_family_in_current_plan",
          target_label: "string|null",
          confidence: "low|medium|high",
          evidence: ["string"],
        },
        draft_messages: {
          confirmation_message: "string|null",
          user_message_brief: "string|null",
          user_message_detailed: "string|null",
          execution_message: "string|null",
          revision_message: "string|null",
        },
        missing_slots: ["frequency|time|message"],
        generated_user_message: "string|null",
        confidence: "low|medium|high",
      },
      missing_slots: ["frequency|time|message"],
      confidence: "low|medium|high",
      generated_user_message: "string|null",
      evidence: ["string"],
    },
    current_user_message: input.message,
    recent_messages: input.recent_messages ?? [],
    current_state: input.current_state ?? null,
    operation_input: input.operation_input ?? null,
    platform_context: input.platform_context ?? null,
    timezone: input.timezone,
    channel: input.channel,
  });
  try {
    const raw = await generateWithGemini(
      systemPrompt,
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "create_recurring_reminder.slot_filler",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    const first = normalizeCreateRecurringReminderSlotFillerOutput(
      raw,
      input.timezone,
    );
    return first;
  } catch (error) {
    console.warn("[CreateRecurringReminder] AI slot filler failed", error);
    return null;
  }
}

function phaseFromState(state: RecurringReminderIntakeState) {
  return state.missing_slots.includes("message")
    ? "content_intake" as const
    : "recurrence_resolution" as const;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

function platformPlanItemById(
  platformContext: Record<string, unknown> | null | undefined,
  itemId: string | null,
): Record<string, unknown> | null {
  const id = String(itemId ?? "").trim();
  if (!id) return null;
  const items = Array.isArray(platformContext?.plan_items)
    ? platformContext?.plan_items as unknown[]
    : [];
  for (const raw of items) {
    const item = objectRecord(raw);
    if (String(item?.id ?? "").trim() === id) return item;
  }
  return null;
}

function isRecurringHabitPlatformItem(item: Record<string, unknown> | null) {
  return String(item?.kind ?? "").trim() === "habit" ||
    String(item?.item_nature ?? "").trim() === "recurring_habit";
}

function removeHabitFamilyWording(message: string | undefined) {
  if (!message) return message;
  return message
    .replace(/cette famille d'habitude/g, "cette action")
    .replace(/cette famille d’habitude/g, "cette action")
    .replace(/la famille d'habitude/g, "l'action")
    .replace(/la famille d’habitude/g, "l'action");
}

function normalizeTargetBindingAgainstPlatform(
  state: RecurringReminderIntakeState,
  platformContext: Record<string, unknown> | null | undefined,
): RecurringReminderIntakeState {
  const destination = state.destination;
  if (destination.target_kind !== "action_family") return state;
  const relatedId = destination.related_plan_item_id ||
    destination.target_plan_item_id;
  const item = platformPlanItemById(platformContext, relatedId);
  if (isRecurringHabitPlatformItem(item)) return state;

  return {
    ...state,
    destination: {
      ...destination,
      target_kind: "plan_item",
      target_plan_item_id: relatedId,
      target_action_family_key: null,
      target_binding_policy: "live_action",
      target_lifecycle_policy: "while_target_active",
      target_label: destination.target_label ??
        (item ? String(item.title ?? "").trim() || null : null),
      evidence: [
        ...destination.evidence,
        "normalized_action_family_to_plan_item_for_non_habit",
      ],
    },
    draft_messages: {
      ...state.draft_messages,
      confirmation_message: removeHabitFamilyWording(
        state.draft_messages.confirmation_message,
      ),
      user_message_brief: removeHabitFamilyWording(
        state.draft_messages.user_message_brief,
      ),
      user_message_detailed: removeHabitFamilyWording(
        state.draft_messages.user_message_detailed,
      ),
      execution_message: removeHabitFamilyWording(
        state.draft_messages.execution_message,
      ),
      revision_message: removeHabitFamilyWording(
        state.draft_messages.revision_message,
      ),
    },
    generated_user_message: state.generated_user_message
      ? removeHabitFamilyWording(state.generated_user_message) ?? null
      : null,
  };
}

function technicalErrorOutput(
  source: "direct_user_request" | "recommendation_tool",
): CreateRecurringReminderOperationOutput {
  return {
    operation_type: "create_recurring_reminder",
    status: "technical_error",
    source,
    phase: "exit",
    state_patch: {
      summary: "Recurring reminder skill could not produce structured intake.",
      phase: "exit",
      missing_slots: [],
      turn_count_increment: 1,
    },
  };
}

export async function runCreateRecurringReminderIntake(input: {
  user_id: string;
  channel: ConversationChannel;
  timezone: string;
  message: string;
  source?: "direct_user_request" | "recommendation_tool";
  trigger_message_id: string;
  safety_context_risk_band: RiskBand;
  turn_count?: number;
  operation_input?: Record<string, unknown> | null;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  request_id?: string | null;
  slot_filler?: CreateRecurringReminderSlotFiller;
  platform_context?: Record<string, unknown> | null;
}): Promise<CreateRecurringReminderOperationOutput> {
  const source = input.source ?? "direct_user_request";
  if (
    input.safety_context_risk_band === "medium" ||
    input.safety_context_risk_band === "high" ||
    input.safety_context_risk_band === "critical"
  ) {
    return {
      operation_type: "create_recurring_reminder",
      status: "blocked_by_safety",
      source,
      phase: "exit",
      state_patch: {
        summary: "Safety blocks recurring reminder operation.",
        phase: "exit",
        missing_slots: [],
        turn_count_increment: 1,
      },
    };
  }

  const initialState = stateFromOperationInput(
    input.operation_input,
    input.timezone,
  );
  let nextState: RecurringReminderIntakeState | null =
    source === "recommendation_tool" ? initialState : null;
  if (!nextState) {
    const slotFiller = input.slot_filler ??
      fillCreateRecurringReminderSlotsWithAi;
    const filled = await slotFiller({
      user_id: input.user_id,
      request_id: input.request_id,
      message: input.message,
      recent_messages: input.recent_messages,
      current_state: initialState,
      operation_input: input.operation_input ?? null,
      platform_context: input.platform_context ?? null,
      timezone: input.timezone,
      channel: input.channel,
    });
    if (!filled) return technicalErrorOutput(source);
    nextState = mergeState(initialState, {
      ...filled.state_patch,
      current_sub_skill: filled.current_sub_skill,
      user_intent: filled.user_intent,
      constraints: filled.constraints,
      handoff_target: filled.handoff_target,
      missing_slots: filled.missing_slots,
      generated_user_message: filled.generated_user_message,
      confidence: filled.confidence,
    }, input.timezone);
  }
  nextState = normalizeTargetBindingAgainstPlatform(
    nextState,
    input.platform_context,
  );

  const operationInput = operationInputFromState(nextState);
  if (
    nextState.user_intent === "one_shot_handoff" ||
    nextState.handoff_target === "create_one_shot_reminder"
  ) {
    return {
      operation_type: "create_recurring_reminder",
      status: "handoff_to_one_shot",
      source,
      phase: "exit",
      ack: nextState.generated_user_message ??
        "Ce rappel a l'air ponctuel. Je laisse le rappel ponctuel le gérer.",
      state_patch: {
        summary: "Recurring reminder skill handed off one-shot reminder.",
        phase: "exit",
        missing_slots: nextState.missing_slots,
        turn_count_increment: 1,
        operation_input: operationInput,
        intake_state: nextState,
      },
    };
  }
  if (nextState.user_intent === "cancel") {
    return cancelCreateRecurringReminderOperation();
  }
  if (nextState.missing_slots.length > 0) {
    if (source === "recommendation_tool") {
      return {
        operation_type: "create_recurring_reminder",
        status: "invalid_recommendation_payload",
        source,
        phase: "exit",
        state_patch: {
          summary: "Recommendation payload missing recurring reminder slots.",
          phase: "exit",
          missing_slots: nextState.missing_slots,
          turn_count_increment: 1,
          operation_input: operationInput,
          intake_state: nextState,
        },
      };
    }
    if ((input.turn_count ?? 0) >= 1 && !nextState.generated_user_message) {
      return {
        operation_type: "create_recurring_reminder",
        status: "fallback_dashboard",
        source,
        phase: "exit",
        state_patch: {
          summary: "Recurring reminder intake could not continue cleanly.",
          phase: "exit",
          missing_slots: nextState.missing_slots,
          turn_count_increment: 1,
          operation_input: operationInput,
          intake_state: nextState,
        },
      };
    }
    return {
      operation_type: "create_recurring_reminder",
      status: "ask_question",
      source,
      phase: phaseFromState(nextState),
      next_question: {
        needed: true,
        question: nextState.generated_user_message ?? undefined,
        reason: nextState.missing_slots[0],
      },
      state_patch: {
        summary: "Recurring reminder intake needs structured slot completion.",
        phase: phaseFromState(nextState),
        missing_slots: nextState.missing_slots,
        turn_count_increment: 1,
        operation_input: operationInput,
        intake_state: nextState,
      },
    };
  }

  const request = buildOperationDraftRequest({
    operation_type: "create_recurring_reminder",
    user_id: input.user_id,
    timezone: input.timezone,
    channel: input.channel,
    trigger_message_id: input.trigger_message_id,
    current_user_message: input.message,
    operation_source: source,
  }) as ReturnType<typeof buildOperationDraftRequest> & {
    recurrence: any;
    reminder_content: any;
    destination: any;
  };
  request.recurrence = {
    frequency: nextState.recurrence.frequency,
    days: nextState.recurrence.days,
    time: nextState.recurrence.time,
    timezone: nextState.recurrence.timezone || input.timezone,
    cadence_label: nextState.recurrence.cadence_label,
  };
  request.reminder_content = {
    message: nextState.reminder_content.message,
    subject_hint: nextState.reminder_content.subject_hint ??
      nextState.reminder_content.message,
  };
  request.destination = {
    value: nextState.destination.value,
    related_plan_item_id: nextState.destination.related_plan_item_id,
    target_kind: nextState.destination.target_kind,
    target_plan_item_id: nextState.destination.target_plan_item_id,
    target_action_family_key: nextState.destination.target_action_family_key,
    target_generated_temp_id: nextState.destination.target_generated_temp_id,
    target_binding_policy: nextState.destination.target_binding_policy,
    target_lifecycle_policy: nextState.destination.target_lifecycle_policy,
    target_label: nextState.destination.target_label,
  };
  const draft = runRecurringReminderBuilder(
    buildRecurringReminderPayload(request),
    nextState.draft_messages,
  );
  if (
    nextState.user_intent === "draft_only" ||
    nextState.constraints.some((constraint) =>
      constraint.kind === "draft_only" || constraint.kind === "no_create"
    )
  ) {
    return {
      operation_type: "create_recurring_reminder",
      status: "handoff_ready",
      source,
      phase: "confirmation",
      draft,
      handoff_draft: buildRecurringReminderHandoffDraft(draft),
      ack: nextState.generated_user_message ??
        "J'ai préparé la version à reprendre dans la section Initiatives.",
      state_patch: {
        summary:
          "Recurring reminder handoff draft generated without executable confirmation.",
        phase: "confirmation",
        missing_slots: [],
        turn_count_increment: 1,
        operation_input: operationInput,
        intake_state: nextState,
      },
    };
  }
  return {
    operation_type: "create_recurring_reminder",
    status: "handoff_ready",
    source,
    phase: "confirmation",
    draft,
    handoff_draft: buildRecurringReminderHandoffDraft(draft),
    confirmation: {
      required: false,
      message: draft.confirmation_message,
      actions: ["yes", "no"],
    },
    state_patch: {
      summary: "Recurring reminder handoff draft generated.",
      phase: "confirmation",
      missing_slots: [],
      turn_count_increment: 1,
      operation_input: operationInput,
      intake_state: nextState,
    },
  };
}

export function cancelCreateRecurringReminderOperation() {
  return {
    operation_type: "create_recurring_reminder" as const,
    status: "cancelled" as const,
    source: "direct_user_request" as const,
    phase: "exit" as const,
    ack: "Ok, je ne cree pas ce rappel.",
    state_patch: {
      summary: "Recurring reminder cancelled.",
      phase: "exit",
      missing_slots: [],
      turn_count_increment: 1 as const,
    },
  };
}
