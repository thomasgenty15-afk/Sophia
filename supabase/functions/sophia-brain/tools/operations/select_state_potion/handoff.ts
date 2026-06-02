/// <reference path="../../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import { loadPotionBaseContext } from "../../../../_shared/potion-base-context.ts";
import { POTION_DEFINITIONS } from "../../../../_shared/v2-potions.ts";
import type { PotionQuestion, PotionType } from "../../../../_shared/v2-types.ts";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type { runSafetyPregate } from "../../../safety/safety_pregate.ts";
import type { ClarificationLlmRunner } from "../../../clarification/tool.ts";
import { runSkillClarification } from "../../../skills/_shared/clarification_adapter.ts";
import {
  hardConsentGuards,
  isPendingStatePotionRecommendationOperation,
  noPotionReply,
  selectStatePotionRouteIsSelected,
} from "./policy.ts";
import type {
  StatePotionHandoffDraft,
  StatePotionHandoffStatus,
} from "./contract.ts";
import {
  generatePotionSessionDraftWithAi,
  type PotionSessionDraftGenerator,
  type PotionSessionDraftGeneratorInput,
  type PotionSessionDraftV1,
} from "./generator.ts";
import {
  runSelectStatePotionIntake,
  type SelectStatePotionIntakeState,
  type SelectStatePotionSlotFiller,
} from "./intake.ts";
import {
  renderSelectStatePotionHandoffDraft,
  renderStatePotionRepeatHandoff,
  renderStatePotionApplyAttemptHandoff,
} from "./renderer.ts";
import {
  clearPotionFollowupConsent,
  clearSelectStatePotionFrame,
  loadSelectStatePotionFrameFromTempMemory,
  loadStatePotionHandoffStateFromTempMemory,
  markPotionFollowupConsentRefused,
  readPotionFollowupConsent,
  type StatePotionHandoffState,
  writeSelectStatePotionPendingRecommendation,
  writeStatePotionHandoffState,
} from "./state.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";

type ToolExecutionStatus =
  | "none"
  | "blocked"
  | "success"
  | "failed"
  | "uncertain"
  | "platform_handoff";

type RecentChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type StatePotionHandoffRuntimeResult = {
  content: string;
  additionalContents?: string[];
  nextTempMemory: any;
  toolExecution: ToolExecutionStatus;
  executedTools: string[];
  toolSkillRun: Record<string, unknown>;
};

const STATE_POTION_HANDOFF_TARGET = getHandoffTargetForOperation(
  "select_state_potion",
);
const PLATFORM_DESTINATION =
  STATE_POTION_HANDOFF_TARGET?.user_facing_destination ??
    "depuis la section État / Potions";
const PLATFORM_STEPS = STATE_POTION_HANDOFF_TARGET?.platform_steps ?? [
  "ouvre l'espace Potions / État",
  "choisis l'option recommandée",
  "lance-la depuis la plateforme si elle te convient",
];

function recentMessagesFromHistory(history: unknown): RecentChatMessage[] {
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

function recentUserMessagesFromHistory(history: unknown): string[] {
  return recentMessagesFromHistory(history)
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .slice(-8);
}

function normalizeControlText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, " ")
    .toLowerCase()
    .trim();
}

function potionLabel(type: string): string {
  switch (type) {
    case "apaisement":
      return "une potion d'apaisement court";
    case "clarte":
      return "une potion de clarté";
    case "courage":
      return "une potion de courage";
    case "guerison":
      return "une potion de réparation";
    case "amour":
      return "une potion d'amour envers soi";
    case "rappel":
      return "une potion de rappel";
    default:
      return "une potion d'état courte";
  }
}

function desiredShiftForPotion(type: string): string {
  switch (type) {
    case "apaisement":
      return "Le shift recommandé est de redescendre la pression avant de reprendre.";
    case "clarte":
      return "Le shift recommandé est de retrouver un fil simple plutôt que tout résoudre.";
    case "courage":
      return "Le shift recommandé est de franchir un passage évité avec un appui court.";
    case "guerison":
      return "Le shift recommandé est de réparer la trace émotionnelle sans rouvrir toute l'analyse.";
    case "amour":
      return "Le shift recommandé est de baisser la dureté envers toi-même.";
    case "rappel":
      return "Le shift recommandé est de revenir au geste utile sans ritualiser.";
    default:
      return "Le shift recommandé est de changer d'état avec un protocole court.";
  }
}

function isPotionType(value: string): value is PotionType {
  return value in POTION_DEFINITIONS;
}

function detailAnswerById(
  intakeState: SelectStatePotionIntakeState | null | undefined,
  questionId: string,
): string | null {
  const answer = intakeState?.details.answers.find((item) =>
    item.question_id === questionId && item.answer.trim()
  )?.answer.trim();
  return answer || null;
}

function normalizeOptionText(value: string): string {
  return normalizeControlText(value)
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function optionForValueOrLabel(
  question: PotionQuestion,
  rawValue: string | null,
): { value: string; label: string } | null {
  if (!question.options.length) return null;
  if (rawValue) {
    const normalizedRaw = normalizeOptionText(rawValue);
    const exact = question.options.find((option) =>
      normalizeOptionText(option.value) === normalizedRaw ||
      normalizeOptionText(option.label) === normalizedRaw
    );
    if (exact) return exact;
    const fuzzy = question.options.find((option) =>
      normalizedRaw.includes(normalizeOptionText(option.value)) ||
      normalizedRaw.includes(normalizeOptionText(option.label)) ||
      normalizeOptionText(option.label).includes(normalizedRaw)
    );
    if (fuzzy) return fuzzy;
  }
  return null;
}

function fallbackTextAnswer(args: {
  potionType: PotionType;
  questionId: string;
  userStateSummary: string;
  immediateStep?: string | null;
}): string {
  const summary = args.userStateSummary.trim();
  switch (args.questionId) {
    case "clarity_problem":
      return summary ||
        "Je ne sais plus quoi prioriser et je veux retrouver une prochaine action claire.";
    case "avoidance_target":
      return summary || "Je repousse un passage concret qui me met sous tension.";
    case "recent_hurt":
      return summary || "Je me suis senti touche ou retombe recemment.";
    case "self_talk":
      return summary || "Je me parle trop durement en ce moment.";
    case "pressure_source":
      return summary || "Je sens une pression qui monte et j'ai besoin de redescendre.";
    case "drift_target":
      return summary || "Je sens que je laisse filer un geste ou un cap important.";
    default:
      return summary || args.immediateStep ||
        `Je veux utiliser ${potionLabel(args.potionType)} maintenant.`;
  }
}

function fallbackOption(args: {
  potionType: PotionType;
  question: PotionQuestion;
  userStateSummary: string;
  noFollowup: boolean;
}): { value: string; label: string } | null {
  const text = normalizeControlText(args.userStateSummary);
  const byId: Record<string, string> = {
    drift_style: text.includes("oubl") ? "oubli" : text.includes("repouss")
      ? "repousse"
      : text.includes("elan")
      ? "baisse_elan"
      : "laisse_filer",
    support_need: args.noFollowup ? "rappel" : "relance",
    blocker_kind: text.includes("regard") ? "regard" : text.includes("conflit")
      ? "conflit"
      : text.includes("resultat")
      ? "resultat"
      : "inconfort",
    desired_help: "premier_pas",
    dominant_feeling: text.includes("honte") ? "honte"
      : text.includes("culp")
      ? "culpabilite"
      : text.includes("fatigue")
      ? "fatigue"
      : "decouragement",
    repair_need: "reprendre_doucement",
    clarity_need: text.includes("commencer") ? "par_ou_commencer"
      : text.includes("compte")
      ? "ce_qui_compte"
      : "quoi_faire",
    output_style: text.includes("priorit") || text.includes("prochaine action")
      ? "priorite"
      : text.includes("structure")
      ? "structure"
      : "simple",
    love_state: text.includes("seul") ? "seul" : text.includes("vide")
      ? "vide"
      : "dur",
    love_need: text.includes("reconfort") ? "reconfort"
      : text.includes("tendre")
      ? "tendresse"
      : "douceur",
    pressure_state: text.includes("submerg") ? "submerge"
      : text.includes("cran")
      ? "a_cran"
      : "stresse",
    calm_need: text.includes("respir") ? "respirer"
      : text.includes("relach")
      ? "relacher"
      : "ralentir",
  };
  const preferredValue = byId[args.question.id];
  return optionForValueOrLabel(args.question, preferredValue) ??
    args.question.options[0] ?? null;
}

function buildPlatformInputs(args: {
  potionType: string;
  intakeState?: SelectStatePotionIntakeState | null;
  userStateSummary: string;
  immediateStep?: string | null;
  noFollowup: boolean;
}): StatePotionHandoffDraft["recommendation"]["platform_inputs"] | undefined {
  if (!isPotionType(args.potionType)) return undefined;
  const potionType = args.potionType;
  const definition = POTION_DEFINITIONS[potionType];
  const answers = definition.questionnaire.map((question) => {
    const rawAnswer = detailAnswerById(args.intakeState, question.id);
    if (question.input_type === "single_select") {
      const option = optionForValueOrLabel(question, rawAnswer) ??
        fallbackOption({
          potionType,
          question,
          userStateSummary: args.userStateSummary,
          noFollowup: args.noFollowup,
        });
      return {
        question_id: question.id,
        question_label: question.label,
        value: option?.label ?? rawAnswer ?? "",
        option_value: option?.value ?? null,
        option_label: option?.label ?? null,
      };
    }
    return {
      question_id: question.id,
      question_label: question.label,
      value: rawAnswer ??
        fallbackTextAnswer({
          potionType,
          questionId: question.id,
          userStateSummary: args.userStateSummary,
          immediateStep: args.immediateStep,
        }),
      option_value: null,
      option_label: null,
    };
  });
  return {
    potion_type: potionType,
    potion_title: definition.title,
    answers,
    optional_free_text: {
      label: definition.free_text_label,
      value: args.immediateStep ?? args.userStateSummary,
    },
  };
}

function userStateSummaryFromDraft(
  draft: PotionSessionDraftV1,
  intakeState?: SelectStatePotionIntakeState | null,
): string {
  const evidence = intakeState?.state.evidence?.filter(Boolean).slice(0, 2) ??
    [];
  if (evidence.length > 0) return evidence.join(" ");
  return draft.draft.title ||
    "tu veux changer d'état sans transformer ça en gros protocole.";
}

function handoffDraftFromPotionDraft(args: {
  draft: PotionSessionDraftV1;
  intakeState?: SelectStatePotionIntakeState | null;
  noFollowup: boolean;
}): StatePotionHandoffDraft {
  const potionType = args.draft.draft.potion_type;
  const userStateSummary = userStateSummaryFromDraft(
    args.draft,
    args.intakeState,
  );
  const immediateStep = args.draft.draft.instant_support_message || null;
  return {
    operation_type: "select_state_potion",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    user_state_summary: userStateSummary,
    desired_shift_summary: desiredShiftForPotion(potionType),
    recommendation: {
      potion_label: potionLabel(potionType),
      why_this_potion: args.draft.draft.why_this_potion,
      immediate_step: immediateStep,
      preserve: [],
      avoid: [],
      platform_destination: PLATFORM_DESTINATION,
      platform_steps: PLATFORM_STEPS,
      platform_inputs: buildPlatformInputs({
        potionType,
        intakeState: args.intakeState,
        userStateSummary,
        immediateStep,
        noFollowup: args.noFollowup,
      }),
    },
    missing_decisions: [],
  };
}

function defaultClarificationRunner(args: {
  requestId?: string | null;
  userId?: string | null;
}): ClarificationLlmRunner {
  return async (input) =>
    await generateWithGemini(
      input.system_prompt,
      input.user_prompt,
      0.1,
      input.json_mode,
      [],
      "auto",
      {
        requestId: args.requestId ?? undefined,
        userId: args.userId ?? undefined,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "select_state_potion.handoff_clarification",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
}

function createHandoffState(args: {
  status: StatePotionHandoffStatus;
  previous?: StatePotionHandoffState | null;
  draft?: StatePotionHandoffDraft | null;
  phase?: string | null;
  operationInput?: Record<string, unknown> | null;
  intakeState?: SelectStatePotionIntakeState | null;
}): StatePotionHandoffState {
  const now = new Date().toISOString();
  return {
    skill_id: "select_state_potion",
    mode: "platform_handoff",
    status: args.status,
    draft: args.draft ?? args.previous?.draft ?? null,
    phase: args.phase ?? args.previous?.phase ?? null,
    operation_input: args.operationInput ?? args.previous?.operation_input ??
      null,
    intake_state: args.intakeState ?? args.previous?.intake_state ?? null,
    turn_count: Number(args.previous?.turn_count ?? 0) + 1,
    max_turns: Number(args.previous?.max_turns ?? 6) || 6,
    created_at: args.previous?.created_at ?? now,
    updated_at: now,
    no_chat_mutation: true,
  };
}

function runtimeResult(args: {
  content: string;
  nextTempMemory: any;
  status: StatePotionHandoffStatus;
  reasonCode: string;
  draft?: StatePotionHandoffDraft | null;
  constraints?: Array<Record<string, unknown>>;
  handoffTarget?: string | null;
}): StatePotionHandoffRuntimeResult {
  return {
    content: args.content,
    nextTempMemory: args.nextTempMemory,
    toolExecution: args.status === "blocked" || args.status === "cancelled"
      ? "blocked"
      : "platform_handoff",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "select_state_potion",
      operation_type: "select_state_potion",
      mode: "platform_handoff",
      no_chat_mutation: true,
      executable_from_chat: false,
      status: args.status,
      reason_code: args.reasonCode,
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [],
      constraints: args.constraints ?? [],
      handoff: args.handoffTarget ? { target: args.handoffTarget } : null,
      platform_handoff: {
        operation_type: "select_state_potion",
        status: args.status === "cancelled" ? "cancelled" : "delivered",
        surface_id: STATE_POTION_HANDOFF_TARGET?.surface_id ??
          "state_potions",
        reason_code: args.reasonCode,
        no_chat_mutation: true,
        draft: args.draft ?? null,
      },
    },
  };
}

function structuredHandoffActionForActiveState(args: {
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
}): StatePotionHandoffStatus | "continue_collecting" {
  const reason = args.routeDecision?.reason_code ?? "";
  if (
    reason === "active_handoff_repeat_handoff" ||
    reason === "repeat_handoff"
  ) return "repeat_handoff";
  if (
    reason === "active_handoff_apply_attempt" ||
    reason === "confirmation_yes_is_handoff_apply_attempt" ||
    reason === "platform_handoff_apply_attempt"
  ) return "apply_attempt";
  if (
    reason === "correction_to_pending_revises_active_handoff" ||
    reason === "same_operation_signal_continues_active_handoff"
  ) return "revise_handoff";
  if (
    args.turnFrame?.confirmation_response?.kind === "yes" &&
    args.turnFrame.confirmation_response.confidence_band !== "low"
  ) return "apply_attempt";
  if (
    args.turnFrame?.confirmation_response?.kind === "correction_to_pending" &&
    args.turnFrame.confirmation_response.confidence_band !== "low"
  ) return "revise_handoff";
  return "continue_collecting";
}

function sanitizeHandoffQuestion(question: string): string {
  let output = String(question ?? "").trim();
  output = output.replace(
    /^(c['’ ]?est bon|ça y est|ca y est|voilà c['’ ]?est|voila c['’ ]?est)\s+pour\s+[^.?!]+[.?!]\s*/i,
    "",
  );
  output = output.replace(
    /^(c['’ ]?est bon|ça y est|ca y est|voilà c['’ ]?est|voila c['’ ]?est)[.?!]\s*/i,
    "",
  );
  return output.trim() || question;
}

async function maybeClarifyWithTool(args: {
  outputQuestion: string;
  phase: string;
  intakeState?: SelectStatePotionIntakeState | null;
  userMessage: string;
  recentMessages: RecentChatMessage[];
  activeState?: StatePotionHandoffState | null;
  llmRunner: ClarificationLlmRunner;
  requestId?: string | null;
}): Promise<string> {
  const shortlist = args.intakeState?.shortlist.options ?? [];
  const candidates = args.phase === "potion_choice" && shortlist.length >= 2
    ? shortlist.map((option) => ({
      id: option.potion_type,
      label: potionLabel(option.potion_type),
      description: option.reason,
      operation_type: "select_state_potion",
      surface_id: STATE_POTION_HANDOFF_TARGET?.surface_id ??
        "state_potions",
      evidence: option.evidence,
    }))
    : [
      {
        id: "immediate_support",
        label: "soutien immédiat",
        description: "recevoir une phrase ou un pas court sans potion",
        operation_type: null,
        surface_id: null,
        evidence: [],
      },
      {
        id: "state_potion_handoff",
        label: "potion d'état",
        description: "choisir une potion à lancer dans la plateforme",
        operation_type: "select_state_potion",
        surface_id: STATE_POTION_HANDOFF_TARGET?.surface_id ??
          "state_potions",
        evidence: [],
      },
    ];
  if (candidates.length < 2) return args.outputQuestion;
  const clarification = await runSkillClarification({
    owner: "state_potion_handoff",
    ambiguity_kind: args.phase === "potion_choice"
      ? "surface"
      : "handoff_readiness",
    candidates,
    known_context: {
      phase: args.phase,
      no_chat_mutation: true,
    },
    user_message: args.userMessage,
    recent_messages: args.recentMessages,
    active_flow_state: args.activeState ?? null,
    llm_runner: args.llmRunner,
    request_id: args.requestId ?? null,
  });
  return clarification.status === "ask" || clarification.status ===
      "still_ambiguous"
    ? clarification.question ?? args.outputQuestion
    : args.outputQuestion;
}

export async function runSelectStatePotionHandoffSkill(args: {
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
  history?: unknown;
  slotFillerOverride?: SelectStatePotionSlotFiller;
  draftGeneratorOverride?: PotionSessionDraftGenerator;
  clarificationLlmRunnerOverride?: ClarificationLlmRunner | null;
}): Promise<StatePotionHandoffRuntimeResult | null> {
  const existingHandoff = loadStatePotionHandoffStateFromTempMemory(
    args.tempMemory,
  );
  const routeSelected = Boolean(existingHandoff) ||
    selectStatePotionRouteIsSelected({
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
      tempMemory: args.tempMemory,
      userMessage: args.userMessage,
    });
  if (!routeSelected) return null;
  if (
    existingHandoff &&
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision.selected_handler &&
    args.routeDecision.selected_handler !== "select_state_potion"
  ) return null;
  if (
    existingHandoff &&
    (args.routeDecision?.reason_code ===
        "create_one_shot_reminder_interrupts_active_handoff" ||
      args.routeDecision?.reason_code ===
        "status_recap_interrupts_active_handoff" ||
      args.routeDecision?.reason_code ===
        "product_help_interrupts_active_handoff" ||
      args.routeDecision?.reason_code ===
        "safety_interrupts_active_handoff")
  ) return null;

  const recentMessages = recentMessagesFromHistory(args.history);
  const recentUserMessages = recentUserMessagesFromHistory(args.history);
  let nextTempMemory = { ...(args.tempMemory ?? {}) };
  const frame = loadSelectStatePotionFrameFromTempMemory(nextTempMemory);

  if (
    hardConsentGuards.detectsExplicitNoPotionRequest(args.userMessage) ||
    (existingHandoff &&
      hardConsentGuards.detectsExplicitStatePotionExit(args.userMessage))
  ) {
    nextTempMemory = clearSelectStatePotionFrame(nextTempMemory);
    return runtimeResult({
      content: noPotionReply(args.userMessage),
      nextTempMemory,
      status: "cancelled",
      reasonCode: "select_state_potion_no_potion_constraint",
      constraints: [{
        kind: "no_potion",
        evidence: [args.userMessage],
      }],
    });
  }

  const currentFollowupRefusal = hardConsentGuards.detectsPotionFollowUpRefusal(
    args.userMessage,
  );
  const recentFollowupRefusals = recentUserMessages.filter((message) =>
    hardConsentGuards.detectsPotionFollowUpRefusal(message)
  );
  if (currentFollowupRefusal || recentFollowupRefusals.length > 0) {
    nextTempMemory = markPotionFollowupConsentRefused(nextTempMemory);
  }
  const noFollowup = readPotionFollowupConsent(nextTempMemory) === "refused";

  const draftGeneratorWithDbContext = async (
    input: PotionSessionDraftGeneratorInput,
  ) => {
    if (args.draftGeneratorOverride) {
      return await args.draftGeneratorOverride(input);
    }
    const baseContext = await loadPotionBaseContext({
      admin: args.supabase,
      userId: args.userId,
      potionType: input.potion_type,
      relatedPlanItemId: input.context?.related_plan_item_id ?? null,
    });
    return await generatePotionSessionDraftWithAi({
      ...input,
      base_context: baseContext,
    });
  };

  if (existingHandoff) {
    const action = structuredHandoffActionForActiveState({
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
    });
    if (action === "apply_attempt") {
      const nextState = createHandoffState({
        status: "apply_attempt",
        previous: existingHandoff,
      });
      nextTempMemory = writeStatePotionHandoffState(nextTempMemory, nextState);
      return runtimeResult({
        content: renderStatePotionApplyAttemptHandoff(existingHandoff.draft),
        nextTempMemory,
        status: "apply_attempt",
        reasonCode: "state_potion_apply_attempt_no_chat_execution",
        draft: existingHandoff.draft,
      });
    }
    if (action === "repeat_handoff") {
      const nextState = createHandoffState({
        status: "repeat_handoff",
        previous: existingHandoff,
      });
      nextTempMemory = writeStatePotionHandoffState(nextTempMemory, nextState);
      return runtimeResult({
        content: renderStatePotionRepeatHandoff(existingHandoff.draft),
        nextTempMemory,
        status: "repeat_handoff",
        reasonCode: existingHandoff.draft
          ? "state_potion_repeat_handoff"
          : "state_potion_repeat_platform_destination_without_draft",
        draft: existingHandoff.draft,
      });
    }
  }

  const activeOperationInput = frame.active &&
      typeof frame.active === "object" &&
      !Array.isArray(frame.active) &&
      (frame.active as any).operation_type === "select_state_potion"
    ? {
      ...(((frame.active as any).operation_input &&
          typeof (frame.active as any).operation_input === "object" &&
          !Array.isArray((frame.active as any).operation_input))
        ? (frame.active as any).operation_input
        : {}),
      ...((frame.active as any).intake_state
        ? { intake_state: (frame.active as any).intake_state }
        : {}),
    }
    : {};
  const existingHandoffOperationInput = existingHandoff
    ? {
      ...((existingHandoff.operation_input &&
          typeof existingHandoff.operation_input === "object" &&
          !Array.isArray(existingHandoff.operation_input))
        ? existingHandoff.operation_input
        : {}),
      ...(existingHandoff.intake_state
        ? { intake_state: existingHandoff.intake_state }
        : {}),
    }
    : {};
  const pendingRecommendationOperationInput =
    isPendingStatePotionRecommendationOperation(frame.recommendation)
      ? frame.recommendation.operation_input ?? null
      : null;

  if (isPendingStatePotionRecommendationOperation(frame.recommendation)) {
    nextTempMemory = writeSelectStatePotionPendingRecommendation(
      nextTempMemory,
      null,
    );
  }

  const output = await runSelectStatePotionIntake({
    user_id: args.userId,
    channel: args.channel,
    timezone: args.userTimezone,
    message: args.userMessage,
    recent_messages: recentMessages,
    source: isPendingStatePotionRecommendationOperation(frame.recommendation)
      ? "recommendation_tool"
      : "direct_user_request",
    trigger_message_id: args.sourceMessageId ?? args.requestId ??
      crypto.randomUUID(),
    safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
    turn_count: Number(
      existingHandoff?.turn_count ?? (frame.active as any)
        ?.turn_count ??
        0,
    ),
    operation_input: pendingRecommendationOperationInput ??
      (Object.keys(existingHandoffOperationInput).length > 0
        ? existingHandoffOperationInput
        : activeOperationInput),
    request_id: args.requestId ?? null,
    slot_filler: args.slotFillerOverride,
    draft_generator: draftGeneratorWithDbContext,
  });

  if (output.status === "ask_question") {
    const activeState = createHandoffState({
      status: output.phase === "state_resolution" ? "collecting" : "clarifying",
      previous: existingHandoff,
      phase: output.phase,
      operationInput: output.state_patch.operation_input ?? null,
      intakeState: output.state_patch.intake_state ?? null,
    });
    const question = sanitizeHandoffQuestion(
      output.next_question?.question ?? output.ack ??
        "Tu veux plutôt apaiser, activer, clarifier ou faire un reset rapide ?",
    );
    const llmRunner = args.clarificationLlmRunnerOverride === null
      ? null
      : args.clarificationLlmRunnerOverride ??
        defaultClarificationRunner({
          requestId: args.requestId ?? null,
          userId: args.userId,
        });
    const visibleQuestion = llmRunner
      ? await maybeClarifyWithTool({
        outputQuestion: question,
        phase: output.phase,
        intakeState: output.state_patch.intake_state ?? null,
        userMessage: args.userMessage,
        recentMessages,
        activeState,
        llmRunner,
        requestId: args.requestId ?? null,
      })
      : question;
    nextTempMemory = writeStatePotionHandoffState(nextTempMemory, {
      ...activeState,
      draft: null,
    });
    return runtimeResult({
      content: visibleQuestion,
      nextTempMemory,
      status: activeState.status,
      reasonCode: output.phase === "state_resolution"
        ? "state_potion_handoff_collecting"
        : "state_potion_handoff_clarifying",
      constraints: noFollowup
        ? [{
          kind: "no_followup",
          evidence: [
            ...(currentFollowupRefusal ? [args.userMessage] : []),
            ...recentFollowupRefusals,
          ],
        }]
        : [],
    });
  }

  if (output.status === "pending_confirmation" && output.draft) {
    const handoffDraft = handoffDraftFromPotionDraft({
      draft: output.draft,
      intakeState: output.state_patch.intake_state ?? null,
      noFollowup,
    });
    nextTempMemory = clearPotionFollowupConsent(nextTempMemory);
    nextTempMemory = writeStatePotionHandoffState(
      nextTempMemory,
      createHandoffState({
        status: "handoff_delivered",
        previous: existingHandoff,
        draft: handoffDraft,
        phase: output.phase,
        operationInput: output.state_patch.operation_input ?? null,
        intakeState: output.state_patch.intake_state ?? null,
      }),
    );
    return runtimeResult({
      content: renderSelectStatePotionHandoffDraft(handoffDraft),
      nextTempMemory,
      status: "handoff_delivered",
      reasonCode: "state_potion_platform_handoff_delivered",
      draft: handoffDraft,
      constraints: noFollowup
        ? [{ kind: "no_followup", evidence: [args.userMessage] }]
        : [],
    });
  }

  if (output.status === "blocked_by_safety") {
    nextTempMemory = clearSelectStatePotionFrame(nextTempMemory);
    return runtimeResult({
      content: output.ack ??
        "Je ne vais pas orienter vers une potion dans cet état.",
      nextTempMemory,
      status: "blocked",
      reasonCode: "state_potion_handoff_blocked_by_safety",
    });
  }

  return runtimeResult({
    content: output.ack ??
      "Je peux t'aider à choisir une potion à reprendre dans la plateforme, sans l'activer depuis le chat.",
    nextTempMemory,
    status: "blocked",
    reasonCode: `state_potion_handoff_${output.status}`,
  });
}
