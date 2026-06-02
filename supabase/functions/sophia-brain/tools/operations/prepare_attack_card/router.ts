/// <reference path="../../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import {
  buildConfirmationDecisionFromSkillReview,
  normalizeSkillConfirmationReview,
  type SkillConfirmationReview,
} from "../../../router/confirmation_contract.ts";
import type { runSafetyPregate } from "../../../safety/safety_pregate.ts";
import { loadCoachQuestionTendencyLow } from "../update_coach_preferences/runtime_policy.ts";
import {
  isPendingDefenseCardOperation,
  isPendingDefenseCardRecommendationOperation,
} from "../prepare_defense_card/router.ts";
import {
  applyAttackCardSingleTechniquePreference,
  attackCardOperationInputWithSingleTechniqueApproval,
  attackCardTargetFromPendingConfirmation,
  attackCardTargetFromQuestionCandidate,
  isActiveAttackCardKeywordIntake,
  isAttackCardLocationOrManagementQuestion,
  isPendingAttackCardOperation,
  isPendingAttackCardRecommendationOperation,
  loadActiveAttackKeywordOptions,
  loadRecentActiveAttackCardForUser,
  mergeAttackCardQuestionKnownSlots,
  renderAttackCardSlotQuestion,
  userExplicitlyAsksForNewAttackCard,
} from "./run_support.ts";
import {
  type AttackCardHandoffDraft,
  type AttackCardPlatformFlowKind,
  type AttackCardTechniqueKey,
  decidePrepareAttackCardNextStep,
  type PrepareAttackCardCommittedEffect,
  type PrepareAttackCardConstraint,
  type PrepareAttackCardSkillResult,
  type PrepareAttackCardUserIntent,
} from "./contract.ts";
import { runPrepareAttackCardAiIntake } from "./ai_intake.ts";
import type { AttackCardDraftV1 } from "./generator.ts";
import {
  type AttackCardHandoffState,
  buildAttackCardHandoffState,
  isAttackCardHandoffState,
} from "./state.ts";
import {
  ATTACK_CARD_PLATFORM_DESTINATION,
  renderAttackCardApplyAttemptReply,
  renderAttackCardBlockedCreateReply,
  renderAttackCardCancelledReply,
  renderAttackCardDraftOnlyReply,
  renderAttackCardExplanationReply,
  renderAttackCardFailedReply,
  renderAttackCardPlatformHandoff,
} from "./renderer.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";

export type OperationRuntimeResult = {
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

function attackCardFrameRecord(tempMemory: any) {
  const memory = tempMemory ?? {};
  return {
    pending: memory.__pending_tool_skill_confirmation ??
      memory.pending_tool_skill_confirmation ?? null,
    draftReview: memory.__pending_attack_card_draft_review ?? null,
    active: memory.__active_tool_skill_intake ??
      memory.active_tool_skill_intake ?? null,
    recommendation: memory.__pending_recommendation_operation ?? null,
    handoff: memory.__active_attack_card_handoff ?? null,
  };
}

export function loadPrepareAttackCardFrameFromTempMemory(tempMemory: any) {
  return attackCardFrameRecord(tempMemory);
}

export function writePrepareAttackCardFrameToTempMemory(
  tempMemory: any,
  frame: {
    pending?: Record<string, unknown> | null;
    draftReview?: Record<string, unknown> | null;
    active?: Record<string, unknown> | null;
    recommendation?: Record<string, unknown> | null;
    handoff?: AttackCardHandoffState | null;
  },
) {
  const next = { ...(tempMemory ?? {}) };
  if ("pending" in frame) {
    if (frame.pending) next.__pending_tool_skill_confirmation = frame.pending;
    else delete next.__pending_tool_skill_confirmation;
    delete next.pending_tool_skill_confirmation;
  }
  if ("draftReview" in frame) {
    if (frame.draftReview) {
      next.__pending_attack_card_draft_review = frame.draftReview;
    } else {
      delete next.__pending_attack_card_draft_review;
    }
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
  if ("handoff" in frame) {
    if (frame.handoff) next.__active_attack_card_handoff = frame.handoff;
    else delete next.__active_attack_card_handoff;
  }
  return next;
}

export function clearPrepareAttackCardFrame(tempMemory: any) {
  return writePrepareAttackCardFrameToTempMemory(tempMemory, {
    pending: null,
    draftReview: null,
    active: null,
    recommendation: null,
    handoff: null,
  });
}

function committedRuntimeTools(
  committedEffects: PrepareAttackCardCommittedEffect[],
): string[] {
  return committedEffects.length > 0 ? ["prepare_attack_card"] : [];
}

function isAttackCardHandoffStatus(status: string): boolean {
  return [
    "draft_ready",
    "handoff_ready",
    "handoff_delivered",
    "revise_handoff",
    "repeat_handoff",
    "apply_attempt",
  ].includes(status);
}

function attackCardPlatformHandoffRun(reasonCode: string) {
  return {
    operation_type: "prepare_attack_card",
    status: "delivered",
    surface_id: getHandoffTargetForOperation("prepare_attack_card")
      ?.surface_id ?? "attack_cards",
    reason_code: reasonCode,
    no_chat_mutation: true,
  };
}

function attackCardPlatformHandoffCancelledRun(reasonCode: string) {
  return {
    operation_type: "prepare_attack_card",
    status: "cancelled",
    surface_id: getHandoffTargetForOperation("prepare_attack_card")
      ?.surface_id ?? "attack_cards",
    reason_code: reasonCode,
    no_chat_mutation: true,
  };
}

function normalizeAttackCardControlText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .replace(/[-–—]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function controlTextIncludesAny(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value));
}

function activeAttackCardHandoffDecisionFromMessage(
  message: string,
): "approve" | "reject" | "revise" | "explain" | null {
  const text = normalizeAttackCardControlText(message);
  if (!text) return null;
  if (
    controlTextIncludesAny(text, [
      "pas de carte",
      "pas une carte",
      "aucune carte",
      "stop carte",
      "annule la carte",
      "arrete la carte",
      "laisse tomber",
      "oublie ca",
      "non finalement",
    ])
  ) return "reject";
  if (
    controlTextIncludesAny(text, [
      "ok cree la",
      "cree la",
      "creer la",
      "vas y",
      "ok vas y",
      "applique",
    ])
  ) return "approve";
  if (
    controlTextIncludesAny(text, [
      "rends la",
      "rends le",
      "rends ca",
      "plus simple",
      "plus court",
      "plus courte",
      "simplifie",
      "change la technique",
      "change le",
      "change la",
      "une seule proposition",
    ])
  ) return "revise";
  if (
    controlTextIncludesAny(text, [
      "redis moi",
      "repete",
      "rappelle moi",
      "quoi mettre",
      "ou je la mets",
      "ou je le mets",
      "ou la mettre",
    ])
  ) return "explain";
  return null;
}

function adaptPrepareAttackCardResultToOperationRuntime(args: {
  result: PrepareAttackCardSkillResult;
  nextTempMemory: any;
  extraToolSkillRun?: Record<string, unknown>;
}): OperationRuntimeResult {
  const committedEffects = args.result.committed_effects;
  const executedTools = committedRuntimeTools(committedEffects);
  const handoffExecution = isAttackCardHandoffStatus(args.result.status);
  const extraToolSkillRun = args.extraToolSkillRun ?? {};
  return {
    content: args.result.reply ?? "",
    nextTempMemory: args.nextTempMemory,
    toolExecution: handoffExecution
      ? "platform_handoff"
      : committedEffects.length > 0
      ? "success"
      : args.result.status === "failed"
      ? "failed"
      : args.result.status === "explained"
      ? "none"
      : "blocked",
    executedTools,
    toolSkillRun: {
      selected_handler: "prepare_attack_card",
      status: args.result.status,
      user_intent: args.result.user_intent,
      requested_effects: args.result.requested_effects,
      allowed_effects: args.result.allowed_effects,
      committed_effects: committedEffects,
      blocked_effects: args.result.blocked_effects,
      pending_confirmation: args.result.pending_confirmation ?? null,
      debug: args.result.debug,
      ...(handoffExecution && !("platform_handoff" in extraToolSkillRun)
        ? {
          platform_handoff: attackCardPlatformHandoffRun(
            args.result.debug.reason_code || args.result.status,
          ),
        }
        : {}),
      ...extraToolSkillRun,
    },
  };
}

function withPrepareAttackCardReply(
  result: PrepareAttackCardSkillResult,
  patch: Partial<PrepareAttackCardSkillResult> & { reply: string },
): PrepareAttackCardSkillResult {
  return {
    ...result,
    ...patch,
    committed_effects: patch.committed_effects ?? result.committed_effects,
  };
}

function technicalAttackCardRuntime(args: {
  output: Awaited<ReturnType<typeof runPrepareAttackCardAiIntake>>;
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
      selected_handler: "prepare_attack_card",
      status: "technical_blocked",
      reason_code: reasonCode,
      operation_id: args.operationId ?? null,
      source: args.source ?? args.output.source,
      recommendation_id: args.recommendationId ?? null,
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [{
        type: "prepare_attack_card",
        reason_code: reasonCode,
      }],
      pending_confirmation: null,
      should_preserve_pending: args.output.should_preserve_pending ?? true,
      retryable: args.output.retryable ?? true,
      technical_source: args.output.technical_source ?? "technical_fallback",
      debug: {
        reason_code: args.output.readiness?.reason ?? reasonCode,
        evidence: [],
      },
    },
  };
}

function operationInputFromLastPlanItemLocal(
  tempMemory: any,
): Record<string, unknown> | null {
  const raw = (tempMemory as any)?.__last_resolved_plan_item;
  if (!raw || typeof raw !== "object") return null;
  const id = String((raw as any).id ?? "").trim();
  const title = String((raw as any).title ?? "").trim();
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function summarizeBlocker(value: unknown): string {
  const blocker = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const evidence = stringArray(blocker?.evidence).slice(0, 2);
  if (evidence.length > 0) return evidence.join("; ");
  const type = String(blocker?.type ?? "").trim();
  switch (type) {
    case "avoidance":
      return "Évitement au moment de démarrer.";
    case "procrastination":
      return "Procrastination ou négociation intérieure.";
    case "action_too_heavy":
      return "Action ressentie comme trop lourde.";
    case "unclear_first_step":
      return "Premier pas encore trop flou.";
    case "low_energy":
      return "Énergie basse au moment de passer à l'action.";
    case "friction":
      return "Friction concrète avant le démarrage.";
    default:
      return "Piège de démarrage ou d'évitement identifié pendant l'intake.";
  }
}

function isGenericAttackCardBlockerSummary(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return !normalized ||
    normalized ===
      "Piège de démarrage ou d'évitement identifié pendant l'intake.";
}

const ATTACK_CARD_PLATFORM_QUESTIONS: Record<AttackCardTechniqueKey, string[]> =
  {
    texte_recadrage: [
      "Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ?",
      "Quelles excuses ou pensees reviennent quand tu sens que tu glisses ?",
      "Dans quel etat tu veux te remettre en ecrivant ce texte ?",
    ],
    mantra_force: [
      "Par rapport a quelle action ou quel effort tu veux devenir plus solide ?",
      "Pourquoi c'est important pour toi d'arreter de reculer la-dessus ?",
      "Tu veux un mantra plutot calme, noble ou percutant ?",
    ],
    ancre_visuelle: [
      "Quel engagement envers toi-meme tu veux garder vivant ?",
      "Dans quel lieu ou sur quel objet tu pourrais l'accrocher a ton quotidien ?",
      "Quelle phrase courte devrait revenir quand tu le vois ?",
    ],
    visualisation_matinale: [
      "Quelle action ou habitude tu veux te voir faire naturellement ?",
      "A quel moment du matin pourrais-tu prendre 5 minutes pour te projeter calmement ?",
      "Quelles sensations ou images t'aideraient a te voir deja en train de faire l'action ?",
    ],
    preparer_terrain: [
      "Par rapport a quelle action tu veux te rendre la vie plus simple ?",
      "Qu'est-ce que tu pourrais preparer en avance pour enlever de la friction ?",
      "Quand le moment arrive, qu'est-ce qui devrait deja etre pret autour de toi ?",
    ],
    pre_engagement: [
      "Dans quelle situation precise tu sens que tu vas craquer ou perdre le controle ?",
      "Quand tu tiens bon dans ce moment-la, qu'est-ce que tu proteges de vraiment important chez toi ?",
    ],
  };

const ATTACK_CARD_TECHNIQUE_KEYS = new Set<AttackCardTechniqueKey>([
  "texte_recadrage",
  "mantra_force",
  "ancre_visuelle",
  "visualisation_matinale",
  "preparer_terrain",
  "pre_engagement",
]);

function normalizeAttackCardTechniqueKey(
  value: unknown,
): AttackCardTechniqueKey | null {
  const raw = String(value ?? "").trim();
  return ATTACK_CARD_TECHNIQUE_KEYS.has(raw as AttackCardTechniqueKey)
    ? raw as AttackCardTechniqueKey
    : null;
}

function firstSentence(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const match = normalized.match(/^(.+?[.!?])\s/);
  return (match?.[1] ?? normalized).trim();
}

function compactAttackCardPhrase(value: string, fallback: string): string {
  const sentence = firstSentence(value);
  return sentence.length > 0 && sentence.length <= 170 ? sentence : fallback;
}

function buildAttackCardPlatformInputs(args: {
  techniqueKey: AttackCardTechniqueKey;
  targetSummary: string;
  blockerSummary: string;
  generatedAsset: string;
}): Array<{ question: string; suggested_answer: string }> {
  const { blockerSummary, generatedAsset, targetSummary, techniqueKey } = args;
  const shortAsset = compactAttackCardPhrase(
    generatedAsset,
    "Revenir au premier geste avant que la négociation intérieure prenne le dessus.",
  );
  const questions = ATTACK_CARD_PLATFORM_QUESTIONS[techniqueKey];
  switch (techniqueKey) {
    case "texte_recadrage":
      return [
        { question: questions[0], suggested_answer: targetSummary },
        { question: questions[1], suggested_answer: blockerSummary },
        {
          question: questions[2],
          suggested_answer:
            "Un état plus simple et direct : revenir au premier geste sans négocier.",
        },
      ];
    case "mantra_force":
      return [
        { question: questions[0], suggested_answer: targetSummary },
        {
          question: questions[1],
          suggested_answer:
            `Parce que cette action protège une avancée concrète : ${targetSummary}.`,
        },
        { question: questions[2], suggested_answer: "Calme et percutant." },
      ];
    case "ancre_visuelle":
      return [
        {
          question: questions[0],
          suggested_answer:
            `Garder vivant l'engagement suivant : ${targetSummary}.`,
        },
        {
          question: questions[1],
          suggested_answer:
            "Sur un objet visible juste avant le moment d'action : carnet, écran, porte ou zone de préparation.",
        },
        { question: questions[2], suggested_answer: shortAsset },
      ];
    case "visualisation_matinale":
      return [
        { question: questions[0], suggested_answer: targetSummary },
        {
          question: questions[1],
          suggested_answer:
            "Le matin, avant que la journée parte dans tous les sens.",
        },
        {
          question: questions[2],
          suggested_answer:
            `Me voir commencer calmement malgré ce piège : ${blockerSummary}.`,
        },
      ];
    case "preparer_terrain":
      return [
        { question: questions[0], suggested_answer: targetSummary },
        {
          question: questions[1],
          suggested_answer:
            "Préparer l'objet, le lieu ou le premier geste pour que l'action devienne évidente.",
        },
        {
          question: questions[2],
          suggested_answer:
            `Le support d'action doit être visible et prêt, avec ce rappel : ${shortAsset}`,
        },
      ];
    case "pre_engagement":
      return [
        { question: questions[0], suggested_answer: blockerSummary },
        {
          question: questions[1],
          suggested_answer:
            `Je protège mon engagement envers cette action : ${targetSummary}.`,
        },
      ];
  }
}

function buildAttackCardKeywordTriggerDraft(args: {
  techniqueKey: AttackCardTechniqueKey;
  draft: AttackCardDraftV1;
  targetSummary: string;
  blockerSummary: string;
}) {
  if (args.techniqueKey !== "pre_engagement") return null;
  const activationKeyword = String(args.draft.draft.activation_keyword ?? "")
    .trim() || "BASCULE";
  return {
    activation_keyword: activationKeyword,
    risk_situation: args.blockerSummary,
    strength_anchor: args.targetSummary,
    first_response_intent:
      "Ramener l'attention sur le premier geste et empêcher la sortie automatique.",
    assistant_prompt:
      `Quand j'envoie ${activationKeyword}, rappelle-moi l'action cible et guide-moi vers le premier geste sans débat.`,
  };
}

function inferAttackCardPlatformFlowKind(args: {
  target: Record<string, unknown>;
  previousHandoffDraft?: AttackCardHandoffDraft | null;
}): AttackCardPlatformFlowKind {
  const previous = args.previousHandoffDraft?.platform_handoff?.flow_kind;
  if (previous === "adjust_existing_attack_card") return previous;
  const targetKind = String(args.target.kind ?? "").trim();
  if (
    targetKind === "plan_item" && String(args.target.plan_item_id ?? "").trim()
  ) {
    return "plan_action_cards";
  }
  return previous ?? "free_attack_card";
}

function buildAttackCardPlatformSteps(args: {
  flowKind: AttackCardPlatformFlowKind;
  targetSummary: string;
  techniqueLabel: string;
}): string[] {
  if (args.flowKind === "plan_action_cards") {
    return [
      `Ouvre ton plan puis l'action "${args.targetSummary}".`,
      "Dans le bloc Ressources, ouvre Attaque ou clique Générer si les cartes ne sont pas encore préparées.",
      "Retrouve la carte dans Ressources > Attaque > Cartes d'attaque du plan.",
      "Utilise l'aperçu ci-dessous pour vérifier ou ajuster le résultat proposé par la plateforme.",
    ];
  }
  if (args.flowKind === "adjust_existing_attack_card") {
    return [
      "Ouvre Ressources > Attaque.",
      "Ouvre la carte existante à ajuster.",
      "Clique Ajuster cette carte.",
      `Sélectionne ${args.techniqueLabel} si la plateforme te propose de choisir la technique.`,
      "Renseigne les réponses préparées ci-dessous, puis génère la nouvelle version.",
    ];
  }
  return [
    "Ouvre Ressources.",
    "Ouvre Attaque.",
    "Dans Cartes d'attaque libres, clique Créer ma première carte ou Ajouter une carte.",
    `Sélectionne ${args.techniqueLabel}.`,
    "Renseigne les réponses préparées ci-dessous, puis clique Générer la carte.",
  ];
}

function buildAttackCardHandoffDraft(args: {
  draft: AttackCardDraftV1;
  target: Record<string, unknown>;
  pendingConfirmation?: Record<string, unknown> | null;
  previousHandoffDraft?: AttackCardHandoffDraft | null;
}): AttackCardHandoffDraft {
  const handoffTarget = getHandoffTargetForOperation("prepare_attack_card");
  const targetSummary = String(
    args.target.title ?? args.draft.draft.target_label ?? "",
  ).trim() || "Action libre à finaliser dans la plateforme";
  const intakeState = args.pendingConfirmation?.intake_state &&
      typeof args.pendingConfirmation.intake_state === "object"
    ? args.pendingConfirmation.intake_state as Record<string, unknown>
    : null;
  const preserve = [
    args.draft.draft.generated_asset,
    ...stringArray(args.draft.draft.supporting_points),
  ].filter(Boolean).slice(0, 3);
  const blockerSummary = summarizeBlocker(intakeState?.blocker);
  const previousBlockerSummary = String(
    args.previousHandoffDraft?.blocker_summary ?? "",
  ).trim();
  const finalBlockerSummary =
    isGenericAttackCardBlockerSummary(blockerSummary) &&
      previousBlockerSummary
      ? previousBlockerSummary
      : blockerSummary;
  const techniqueKey = normalizeAttackCardTechniqueKey(
    args.draft.draft.technique,
  );
  const flowKind = inferAttackCardPlatformFlowKind({
    target: args.target,
    previousHandoffDraft: args.previousHandoffDraft,
  });
  const platformSteps = buildAttackCardPlatformSteps({
    flowKind,
    targetSummary,
    techniqueLabel: args.draft.draft.technique_title,
  });
  const platformInputs = techniqueKey
    ? buildAttackCardPlatformInputs({
      techniqueKey,
      targetSummary,
      blockerSummary: finalBlockerSummary,
      generatedAsset: args.draft.draft.generated_asset,
    })
    : [];
  const platformDestination = flowKind === "plan_action_cards"
    ? "Ressources > Attaque > Cartes d'attaque du plan"
    : "Ressources > Attaque > Cartes d'attaque libres";
  return {
    operation_type: "prepare_attack_card",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    target_summary: targetSummary,
    blocker_summary: finalBlockerSummary,
    recommendation: {
      technique_label: args.draft.draft.technique_title,
      why_this_technique: args.draft.draft.why_it_helps,
      card_draft_summary: [
        args.draft.draft.title,
        args.draft.draft.generated_asset,
        `Mode d'emploi : ${args.draft.draft.mode_emploi}`,
      ].filter(Boolean).join("\n"),
      preserve: preserve.length > 0
        ? preserve
        : ["Le geste minuscule qui coupe la négociation intérieure."],
      avoid: [
        "Transformer ce brouillon en promesse trop longue.",
        "Ajouter plusieurs techniques concurrentes dans la même carte.",
      ],
      platform_destination: platformDestination,
      platform_steps: platformSteps.length > 0
        ? platformSteps
        : handoffTarget?.platform_steps ?? [
          "Ouvre Cartes / Attaque.",
          "Choisis la cible ou l'action correspondante.",
          "Copie le brouillon puis finalise la carte dans la plateforme.",
        ],
    },
    platform_handoff: {
      flow_kind: flowKind,
      surface_label: flowKind === "plan_action_cards"
        ? "Plan > Action > Ressources > Attaque"
        : "Ressources > Attaque",
      destination: platformDestination,
      steps: platformSteps,
      technique_key: techniqueKey,
      technique_label: args.draft.draft.technique_title,
      inputs: flowKind === "plan_action_cards" ? [] : platformInputs,
      expected_result: {
        output_title: args.draft.draft.title,
        generated_asset: args.draft.draft.generated_asset,
        supporting_points: stringArray(args.draft.draft.supporting_points),
        mode_emploi: args.draft.draft.mode_emploi,
        keyword_trigger: techniqueKey
          ? buildAttackCardKeywordTriggerDraft({
            techniqueKey,
            draft: args.draft,
            targetSummary,
            blockerSummary: finalBlockerSummary,
          })
          : null,
      },
      plan_action_note: flowKind === "plan_action_cards"
        ? "Pour une action du plan, la plateforme prépare les cartes depuis le bloc Ressources de l'action. Sophia te donne ici l'aperçu et les points à vérifier, pas une création depuis le chat."
        : null,
    },
    missing_decisions: [],
  };
}

function detectStructuredAttackCardConfirmation(
  turnFrame: TurnFrame | null,
): "yes" | "no" | null {
  const confirmation = turnFrame?.confirmation_response;
  if (!confirmation || confirmation.confidence_band === "low") return null;
  return confirmation.kind === "yes" || confirmation.kind === "no"
    ? confirmation.kind
    : null;
}

function attackCardReviewFromPending(
  pendingRaw: Record<string, unknown>,
): SkillConfirmationReview | null {
  const operationInput = pendingRaw.operation_input &&
      typeof pendingRaw.operation_input === "object" &&
      !Array.isArray(pendingRaw.operation_input)
    ? pendingRaw.operation_input as Record<string, unknown>
    : null;
  return normalizeSkillConfirmationReview(
    pendingRaw.draft_review_decision ??
      operationInput?.draft_review_decision,
  );
}

function userIntentFromConfirmationReview(
  review: SkillConfirmationReview | null,
): PrepareAttackCardUserIntent {
  if (review?.decision === "approve") return "create";
  if (review?.decision === "reject") return "reject";
  if (review?.decision === "revise") return "revise";
  if (review?.decision === "explain") return "explain";
  if (review?.decision === "preview") return "draft_only";
  if (review?.decision === "status") return "status_question";
  if (review?.decision === "topic_change") return "topic_change";
  return "unknown";
}

function constraintsFromConfirmationReview(
  review: SkillConfirmationReview | null,
): PrepareAttackCardConstraint[] {
  return review?.decision === "preview"
    ? [
      { kind: "draft_only" as const, evidence: review.evidence ?? [] },
      { kind: "no_create" as const, evidence: review.evidence ?? [] },
    ]
    : [];
}

function localOperationType(value: unknown): string {
  const record = value && typeof value === "object" ? value as any : null;
  return String(record?.operation_type ?? "").trim();
}

function operationRouteIsSelected(args: {
  operationType: "prepare_attack_card";
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  tempMemory: any;
}): boolean {
  const frame = loadPrepareAttackCardFrameFromTempMemory(args.tempMemory);
  const pendingType = localOperationType(frame.pending);
  if (pendingType === args.operationType) return true;
  if (pendingType && pendingType !== args.operationType) return false;
  if (isAttackCardHandoffState(frame.handoff)) return true;
  const activeType = localOperationType(frame.active);
  if (activeType === args.operationType) return true;
  if (activeType && activeType !== args.operationType) return false;
  if (isPendingAttackCardOperation(frame.draftReview)) return true;
  if (isPendingAttackCardRecommendationOperation(frame.recommendation)) {
    return true;
  }
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === args.operationType
  ) return true;
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler &&
    args.routeDecision.selected_handler !== args.operationType
  ) return false;
  return (args.turnFrame?.tool_skill_intents ?? []).some((intent) =>
    intent.operation_type === args.operationType &&
    intent.confidence_band !== "low"
  );
}

function buildAttackCardPendingFrame(args: {
  pendingConfirmation: Record<string, unknown>;
  draft: AttackCardDraftV1;
  target: Record<string, unknown>;
  supersedesOperationId?: string | null;
}): Record<string, unknown> {
  return {
    ...args.pendingConfirmation,
    operation_type: "prepare_attack_card",
    draft: args.draft,
    target: args.target,
    phase: "platform_handoff",
    executable: false,
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    created_at: new Date().toISOString(),
    turn_count: 0,
    ...(args.supersedesOperationId
      ? { supersedes_operation_id: args.supersedesOperationId }
      : {}),
  };
}

function buildAttackCardDraftReviewFrame(args: {
  pendingConfirmation: Record<string, unknown>;
  draft: AttackCardDraftV1;
  target: Record<string, unknown>;
  supersedesOperationId?: string | null;
}): Record<string, unknown> {
  return {
    ...buildAttackCardPendingFrame(args),
    phase: "draft_review",
    executable: false,
  };
}

export function applyPrepareAttackCardInitialDraftDecision(args: {
  output: Awaited<ReturnType<typeof runPrepareAttackCardAiIntake>>;
  target: Record<string, unknown>;
  fallbackOperationInput?: Record<string, unknown> | null;
  tempMemory: any;
  supersedesOperationId?: string | null;
  source?: string;
}): OperationRuntimeResult | null {
  if (
    args.output.status !== "pending_confirmation" ||
    !args.output.pending_confirmation ||
    !args.output.draft
  ) {
    return null;
  }
  const pendingConfirmation = args.output.pending_confirmation as Record<
    string,
    unknown
  >;
  const handoffDraft = buildAttackCardHandoffDraft({
    draft: args.output.draft,
    target: args.target,
    pendingConfirmation,
  });
  const handoffState = buildAttackCardHandoffState({
    draft: handoffDraft,
    sourceDraft: args.output.draft,
    target: args.target,
    status: "handoff_delivered",
  });
  const skillDecision = decidePrepareAttackCardNextStep({
    pendingRaw: null,
    user_intent: args.output.user_intent,
    constraints: args.output.constraints,
    draft_review_decision: args.output.state_patch.draft_review_decision ??
      null,
  });
  const next = writePrepareAttackCardFrameToTempMemory(args.tempMemory, {
    pending: null,
    draftReview: null,
    active: null,
    handoff: handoffState,
    recommendation: args.source === "recommendation_tool" ? null : undefined,
  });
  return adaptPrepareAttackCardResultToOperationRuntime({
    result: withPrepareAttackCardReply(skillDecision, {
      status: "handoff_delivered",
      reply: renderAttackCardPlatformHandoff(handoffDraft),
      pending_confirmation: null,
    }),
    nextTempMemory: next,
    extraToolSkillRun: {
      operation_id: pendingConfirmation.operation_id ?? null,
      draft: args.output.draft,
      source: args.source ?? "direct_user_request",
      handoff_state: handoffState,
      platform_handoff: {
        operation_type: "prepare_attack_card",
        status: "delivered",
        surface_id: getHandoffTargetForOperation("prepare_attack_card")
          ?.surface_id ?? "attack_cards",
        reason_code: "attack_card_platform_handoff",
        no_chat_mutation: true,
      },
    },
  });
}

function routeOrTurnFramePrefersDefenseCard(args: {
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
}): boolean {
  if (
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === "prepare_defense_card"
  ) {
    return true;
  }
  return Boolean(
    args.turnFrame?.tool_skill_intents?.some((intent) =>
      intent.operation_type === "prepare_defense_card" &&
      intent.confidence_band !== "low"
    ),
  );
}

function attackCardDispatcherOperationInput(
  turnFrame: TurnFrame | null,
  userMessage: string,
): Record<string, unknown> | null {
  const intent = (turnFrame?.tool_skill_intents ?? []).find((candidate) =>
    candidate.operation_type === "prepare_attack_card" &&
    candidate.confidence_band !== "low"
  );
  if (!intent) return null;
  return {
    ...(intent.operation_input ?? {}),
    ...(intent.payload_hint ?? {}),
    ...(intent.target_hint ? { target_label: intent.target_hint } : {}),
    user_message: userMessage,
    dispatcher_user_intent: intent.user_intent,
  };
}

export async function maybeRunPrepareAttackCardOperation(args: {
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
  runIntake?: typeof runPrepareAttackCardAiIntake;
}): Promise<OperationRuntimeResult | null> {
  const initialFrame = loadPrepareAttackCardFrameFromTempMemory(
    args.tempMemory,
  );
  const routeSelected = operationRouteIsSelected({
    operationType: "prepare_attack_card",
    routeDecision: args.routeDecision,
    turnFrame: args.turnFrame,
    tempMemory: args.tempMemory,
  }) || isPendingAttackCardOperation(initialFrame.draftReview);
  if (!routeSelected) return null;
  if (
    routeOrTurnFramePrefersDefenseCard({
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
    })
  ) return null;
  const nextTempMemory = { ...(args.tempMemory ?? {}) };
  const frame = loadPrepareAttackCardFrameFromTempMemory(nextTempMemory);
  const pendingRaw = frame.pending;
  const draftReviewRaw = frame.draftReview;
  const pendingRecommendation = frame.recommendation;
  const activeHandoffRaw = frame.handoff;
  if (
    isPendingDefenseCardOperation(pendingRaw) ||
    isPendingDefenseCardRecommendationOperation(pendingRecommendation) ||
    String(
        (nextTempMemory.__active_tool_skill_intake ??
          nextTempMemory.active_tool_skill_intake ?? {})?.operation_type ?? "",
      ) === "prepare_defense_card"
  ) {
    return null;
  }
  const activeAttackCardIntakeRaw = frame.active;
  const explicitAttackCardRoute =
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision?.selected_handler === "prepare_attack_card";
  const hasAttackCardFlow = isPendingAttackCardOperation(pendingRaw) ||
    isPendingAttackCardOperation(draftReviewRaw) ||
    isAttackCardHandoffState(activeHandoffRaw) ||
    isPendingAttackCardRecommendationOperation(pendingRecommendation) ||
    String((activeAttackCardIntakeRaw as any)?.operation_type ?? "") ===
      "prepare_attack_card";
  if (
    !explicitAttackCardRoute &&
    !isPendingAttackCardOperation(pendingRaw) &&
    !isPendingAttackCardOperation(draftReviewRaw) &&
    !isAttackCardHandoffState(activeHandoffRaw) &&
    !isPendingAttackCardRecommendationOperation(pendingRecommendation) &&
    String((activeAttackCardIntakeRaw as any)?.operation_type ?? "") !==
      "prepare_attack_card" &&
    args.routeDecision?.response_owner !== "tool_skill"
  ) {
    return null;
  }
  if (
    isPendingAttackCardRecommendationOperation(pendingRecommendation) &&
    !explicitAttackCardRoute &&
    args.routeDecision?.response_owner !== "tool_skill" &&
    !detectStructuredAttackCardConfirmation(args.turnFrame)
  ) {
    return null;
  }
  if (!explicitAttackCardRoute && !hasAttackCardFlow) return null;
  if (
    isAttackCardHandoffState(activeHandoffRaw) &&
    (args.routeDecision?.selected_handler === "create_one_shot_reminder" ||
      args.routeDecision?.selected_handler === "cancel_one_shot_reminder" ||
      (args.routeDecision?.direct_effects_to_run ?? []).some((effect) =>
        effect === "create_one_shot_reminder" ||
        effect === "cancel_one_shot_reminder"
      ))
  ) {
    return null;
  }
  if (
    !isPendingAttackCardOperation(pendingRaw) &&
    !isPendingAttackCardOperation(draftReviewRaw) &&
    !isAttackCardHandoffState(activeHandoffRaw) &&
    !isPendingAttackCardRecommendationOperation(pendingRecommendation) &&
    !activeAttackCardIntakeRaw &&
    isAttackCardLocationOrManagementQuestion(args.userMessage)
  ) {
    return null;
  }
  const occupiedAttackKeywords = await loadActiveAttackKeywordOptions({
    supabase: args.supabase,
    userId: args.userId,
  });
  const preferSingleTechniqueQuestion = await loadCoachQuestionTendencyLow(
    args.supabase,
    args.userId,
  );
  const withOccupiedAttackKeywords = (
    input: Record<string, unknown> | null | undefined,
  ) => ({
    ...(input ?? {}),
    occupied_activation_keywords: occupiedAttackKeywords,
  });
  const detectAttackCardConfirmation = () =>
    detectStructuredAttackCardConfirmation(args.turnFrame);
  const runAttackCardIntake = (
    input: Parameters<typeof runPrepareAttackCardAiIntake>[0],
  ) =>
    (args.runIntake ?? runPrepareAttackCardAiIntake)({
      ...input,
      request_id: args.requestId ?? null,
    });
  let fallbackOperationInput = operationInputFromLastPlanItemLocal(
    nextTempMemory,
  );
  const dispatcherOperationInput = attackCardDispatcherOperationInput(
    args.turnFrame,
    args.userMessage,
  );
  if (isAttackCardHandoffState(activeHandoffRaw)) {
    const activeHandoff = activeHandoffRaw;
    const sourceDraft = activeHandoff.source_draft;
    const handoffDraft = activeHandoff.draft ?? null;
    const target = activeHandoff.target ?? {
      kind: "personal_action",
      title: handoffDraft?.target_summary ?? null,
      plan_item_id: null,
    };
    const reviewOutput = sourceDraft
      ? await runAttackCardIntake({
        user_id: args.userId,
        channel: args.channel,
        timezone: args.userTimezone,
        message: args.userMessage,
        source: "direct_user_request",
        trigger_message_id: args.sourceMessageId ?? args.requestId ??
          crypto.randomUUID(),
        safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
        turn_count: Number(activeHandoff.turn_count ?? 0) + 1,
        plan_snapshot: args.planSnapshot ?? {},
        operation_input: withOccupiedAttackKeywords({
          previous_draft: sourceDraft,
          target,
          technique: sourceDraft.draft.technique,
          activation_keyword: sourceDraft.draft.activation_keyword ??
            undefined,
        }),
      })
      : null;
    if (reviewOutput?.status === "technical_blocked") {
      return technicalAttackCardRuntime({
        output: reviewOutput,
        nextTempMemory,
      });
    }
    const draftReviewDecision = reviewOutput?.state_patch
      .draft_review_decision;
    const forcedDecision = activeAttackCardHandoffDecisionFromMessage(
      args.userMessage,
    );
    const decision = forcedDecision ?? draftReviewDecision?.decision;
    const effectiveDraftReviewDecision = decision
      ? {
        ...(draftReviewDecision ?? {}),
        decision,
        evidence: [
          ...((draftReviewDecision?.evidence ?? []) as string[]),
          ...(forcedDecision ? ["active_handoff_control_message"] : []),
        ],
      }
      : draftReviewDecision;
    if (decision === "reject") {
      const cleared = clearPrepareAttackCardFrame(nextTempMemory);
      return {
        content: renderAttackCardCancelledReply(),
        nextTempMemory: cleared,
        toolExecution: "platform_handoff",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: "cancelled",
          draft_review_decision: effectiveDraftReviewDecision,
          requested_effects: [],
          allowed_effects: [],
          committed_effects: [],
          blocked_effects: [],
          platform_handoff: attackCardPlatformHandoffCancelledRun(
            "cancelled_platform_handoff",
          ),
        },
      };
    }
    if (decision === "topic_change" && !explicitAttackCardRoute) return null;
    if (decision === "approve") {
      const nextHandoff = buildAttackCardHandoffState({
        draft: handoffDraft!,
        sourceDraft,
        target,
        previous: activeHandoff,
        status: "apply_attempt",
      });
      const next = writePrepareAttackCardFrameToTempMemory(nextTempMemory, {
        handoff: nextHandoff,
        pending: null,
        draftReview: null,
        active: null,
      });
      return {
        content: renderAttackCardApplyAttemptReply(handoffDraft),
        nextTempMemory: next,
        toolExecution: "platform_handoff",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: "apply_attempt",
          draft_review_decision: effectiveDraftReviewDecision,
          requested_effects: [],
          allowed_effects: [],
          committed_effects: [],
          blocked_effects: [{
            type: "create_attack_card",
            reason_code: "chat_creation_disabled_platform_handoff",
          }],
          handoff_state: nextHandoff,
          platform_handoff: {
            operation_type: "prepare_attack_card",
            status: "delivered",
            surface_id: getHandoffTargetForOperation("prepare_attack_card")
              ?.surface_id ?? "attack_cards",
            reason_code: "apply_attempt_no_chat_mutation",
            no_chat_mutation: true,
          },
        },
      };
    }
    if (decision === "revise") {
      if (
        reviewOutput?.status === "pending_confirmation" &&
        reviewOutput.pending_confirmation &&
        reviewOutput.draft
      ) {
        const nextDraft = buildAttackCardHandoffDraft({
          draft: reviewOutput.draft,
          target: attackCardTargetFromPendingConfirmation(
            reviewOutput.pending_confirmation,
            target,
          ) as Record<string, unknown>,
          pendingConfirmation: reviewOutput.pending_confirmation,
          previousHandoffDraft: handoffDraft,
        });
        const nextHandoff = buildAttackCardHandoffState({
          draft: nextDraft,
          sourceDraft: reviewOutput.draft,
          target,
          previous: activeHandoff,
          status: "revise_handoff",
        });
        const next = writePrepareAttackCardFrameToTempMemory(nextTempMemory, {
          handoff: nextHandoff,
          pending: null,
          draftReview: null,
          active: null,
        });
        return {
          content: renderAttackCardPlatformHandoff(nextDraft),
          nextTempMemory: next,
          toolExecution: "platform_handoff",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_attack_card",
            status: "revise_handoff",
            draft_review_decision: effectiveDraftReviewDecision,
            draft: reviewOutput.draft,
            requested_effects: [],
            allowed_effects: [],
            committed_effects: [],
            blocked_effects: [],
            handoff_state: nextHandoff,
            platform_handoff: attackCardPlatformHandoffRun(
              "revised_platform_handoff",
            ),
          },
        };
      }
      if (reviewOutput?.status === "ask_question") {
        const nextQuestion = applyAttackCardSingleTechniquePreference(
          reviewOutput.next_question,
          { preferSingleTechnique: preferSingleTechniqueQuestion },
        );
        const next = writePrepareAttackCardFrameToTempMemory(nextTempMemory, {
          handoff: activeHandoff,
          active: {
            operation_type: "prepare_attack_card",
            phase: reviewOutput.phase,
            missing_slots: reviewOutput.state_patch.missing_slots,
            slot_state: nextQuestion ?? null,
            operation_input: mergeAttackCardQuestionKnownSlots(
              reviewOutput.state_patch.operation_input ??
                reviewOutput.next_question?.known_slots ?? null,
              nextQuestion,
            ),
            tool_skill_state: reviewOutput.state_patch.tool_skill_state ?? null,
            turn_count: Number(activeHandoff.turn_count ?? 0) + 1,
            updated_at: new Date().toISOString(),
          },
        });
        return {
          content: renderAttackCardSlotQuestion(nextQuestion),
          nextTempMemory: next,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_attack_card",
            status: "clarifying",
            draft_review_decision: effectiveDraftReviewDecision,
            missing_slots: reviewOutput.state_patch.missing_slots,
            committed_effects: [],
          },
        };
      }
    }
    const nextHandoff = buildAttackCardHandoffState({
      draft: handoffDraft!,
      sourceDraft,
      target,
      previous: activeHandoff,
      status: "repeat_handoff",
    });
    const next = writePrepareAttackCardFrameToTempMemory(nextTempMemory, {
      handoff: nextHandoff,
      pending: null,
      draftReview: null,
      active: null,
    });
    return {
      content: handoffDraft
        ? renderAttackCardPlatformHandoff(handoffDraft)
        : renderAttackCardBlockedCreateReply(),
      nextTempMemory: next,
      toolExecution: "platform_handoff",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_attack_card",
        status: "repeat_handoff",
        draft_review_decision: effectiveDraftReviewDecision ?? null,
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        handoff_state: nextHandoff,
        platform_handoff: attackCardPlatformHandoffRun(
          "repeat_platform_handoff",
        ),
      },
    };
  }
  if (isPendingAttackCardOperation(pendingRaw)) {
    if (detectAttackCardConfirmation() === "yes") {
      const target = attackCardTargetFromPendingConfirmation(
        pendingRaw as unknown as Record<string, unknown>,
        null,
      ) as Record<string, unknown>;
      const handoffDraft = buildAttackCardHandoffDraft({
        draft: pendingRaw.draft,
        target,
        pendingConfirmation: pendingRaw as Record<string, unknown>,
      });
      const handoffState = buildAttackCardHandoffState({
        draft: handoffDraft,
        sourceDraft: pendingRaw.draft,
        target,
        status: "apply_attempt",
      });
      const skillDecision = decidePrepareAttackCardNextStep({
        pendingRaw,
        user_intent: "create",
        constraints: [],
        draft_review_decision: {
          decision: "approve",
          evidence: ["structured_confirmation_response"],
        },
      });
      const next = writePrepareAttackCardFrameToTempMemory(nextTempMemory, {
        pending: null,
        draftReview: null,
        active: null,
        handoff: handoffState,
      });
      return adaptPrepareAttackCardResultToOperationRuntime({
        result: withPrepareAttackCardReply(skillDecision, {
          status: "apply_attempt",
          reply: renderAttackCardApplyAttemptReply(handoffDraft),
          pending_confirmation: null,
        }),
        nextTempMemory: next,
        extraToolSkillRun: {
          operation_id: pendingRaw.operation_id ?? null,
          confirmation_decision: {
            decision: "approve",
            source: "structured_confirmation_response",
          },
          handoff_state: handoffState,
          platform_handoff: {
            operation_type: "prepare_attack_card",
            status: "delivered",
            surface_id: getHandoffTargetForOperation("prepare_attack_card")
              ?.surface_id ?? "attack_cards",
            reason_code: "apply_attempt_no_chat_mutation",
            no_chat_mutation: true,
          },
        },
      });
    }
    const injectedDraftReviewDecision = attackCardReviewFromPending(
      pendingRaw as unknown as Record<string, unknown>,
    );
    const pendingReviewOutput = injectedDraftReviewDecision
      ? {
        status: "draft_review_decision",
        user_intent: userIntentFromConfirmationReview(
          injectedDraftReviewDecision,
        ),
        constraints: constraintsFromConfirmationReview(
          injectedDraftReviewDecision,
        ),
        ack: null,
        pending_confirmation: null,
        draft: null,
        next_question: null,
        phase: "confirmation",
        state_patch: {
          missing_slots: [],
          operation_input: null,
          tool_skill_state: null,
          draft_review_decision: injectedDraftReviewDecision,
        },
      } as unknown as Awaited<ReturnType<typeof runPrepareAttackCardAiIntake>>
      : await runAttackCardIntake({
        user_id: args.userId,
        channel: args.channel,
        timezone: args.userTimezone,
        message: args.userMessage,
        source: "direct_user_request",
        trigger_message_id: args.sourceMessageId ?? args.requestId ??
          crypto.randomUUID(),
        safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
        turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
        plan_snapshot: args.planSnapshot ?? {},
        operation_input: withOccupiedAttackKeywords({
          previous_draft: pendingRaw.draft,
          target: attackCardTargetFromPendingConfirmation(
            pendingRaw as unknown as Record<string, unknown>,
            null,
          ),
          technique: pendingRaw.draft?.draft?.technique ?? undefined,
          activation_keyword: pendingRaw.draft?.draft?.activation_keyword ??
            undefined,
          intake_state: (pendingRaw as any).intake_state ?? undefined,
        }),
      });
    if (pendingReviewOutput.status === "technical_blocked") {
      return technicalAttackCardRuntime({
        output: pendingReviewOutput,
        nextTempMemory,
        operationId: pendingRaw.operation_id ?? null,
      });
    }
    const draftReviewDecision =
      pendingReviewOutput.state_patch.draft_review_decision;
    const confirmationDecision = buildConfirmationDecisionFromSkillReview({
      pending: {
        operation_id: pendingRaw.operation_id ?? null,
        operation_type: "prepare_attack_card",
        effect_type: "attack_card.create",
        summary: pendingRaw.draft?.draft?.title ?? null,
        draft: pendingRaw.draft,
        expires_after_turns: pendingRaw.expires_after_turns ?? null,
      },
      review: draftReviewDecision,
      reason_code_prefix: "prepare_attack_card",
    });
    if (confirmationDecision.decision === "unrelated") return null;
    if (
      confirmationDecision.decision === "topic_change" &&
      !explicitAttackCardRoute
    ) {
      return null;
    }
    const skillDecision = decidePrepareAttackCardNextStep({
      pendingRaw,
      user_intent: pendingReviewOutput.user_intent,
      constraints: pendingReviewOutput.constraints,
      draft_review_decision: draftReviewDecision,
    });
    if (skillDecision.status === "draft_ready") {
      return adaptPrepareAttackCardResultToOperationRuntime({
        result: withPrepareAttackCardReply(skillDecision, {
          reply: renderAttackCardDraftOnlyReply(pendingRaw.draft),
        }),
        nextTempMemory,
        extraToolSkillRun: {
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision ?? null,
          confirmation_decision: confirmationDecision,
        },
      });
    }
    if (skillDecision.status === "explained") {
      return adaptPrepareAttackCardResultToOperationRuntime({
        result: withPrepareAttackCardReply(skillDecision, {
          reply: renderAttackCardExplanationReply(pendingRaw.draft),
        }),
        nextTempMemory,
        extraToolSkillRun: {
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision ?? null,
          confirmation_decision: confirmationDecision,
        },
      });
    }
    if (!skillDecision.handled) {
      if (skillDecision.status === "topic_change") {
        const cleared = clearPrepareAttackCardFrame(nextTempMemory);
        return adaptPrepareAttackCardResultToOperationRuntime({
          result: withPrepareAttackCardReply(skillDecision, {
            reply: "Ok, je laisse cette carte d'attaque de côté.",
          }),
          nextTempMemory: cleared,
          extraToolSkillRun: {
            operation_id: pendingRaw.operation_id ?? null,
          },
        });
      }
      return null;
    }
    if (!draftReviewDecision) {
      if (
        pendingReviewOutput.status === "pending_confirmation" &&
        pendingReviewOutput.pending_confirmation &&
        pendingReviewOutput.draft
      ) {
        const target = attackCardTargetFromPendingConfirmation(
          pendingReviewOutput.pending_confirmation,
          {
            target: pendingRaw.target ?? null,
            intake_state: (pendingRaw as any).intake_state ?? undefined,
          },
        ) as Record<string, unknown>;
        const handoffDraft = buildAttackCardHandoffDraft({
          draft: pendingReviewOutput.draft,
          target,
          pendingConfirmation: pendingReviewOutput.pending_confirmation,
        });
        const handoffState = buildAttackCardHandoffState({
          draft: handoffDraft,
          sourceDraft: pendingReviewOutput.draft,
          target,
          status: "revise_handoff",
        });
        const next = writePrepareAttackCardFrameToTempMemory(nextTempMemory, {
          pending: null,
          draftReview: null,
          active: null,
          handoff: handoffState,
        });
        return {
          content: renderAttackCardPlatformHandoff(handoffDraft),
          nextTempMemory: next,
          toolExecution: "platform_handoff",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_attack_card",
            status: "revise_handoff",
            operation_id: String(
              pendingReviewOutput.pending_confirmation.operation_id ??
                pendingRaw.operation_id ??
                "",
            ),
            previous_operation_id: pendingRaw.operation_id ?? null,
            draft: pendingReviewOutput.draft,
            draft_review_decision: null,
            committed_effects: [],
            handoff_state: handoffState,
            platform_handoff: attackCardPlatformHandoffRun(
              "revised_platform_handoff",
            ),
          },
        };
      }
      if (pendingReviewOutput.status === "ask_question") {
        const nextQuestion = applyAttackCardSingleTechniquePreference(
          pendingReviewOutput.next_question,
          { preferSingleTechnique: preferSingleTechniqueQuestion },
        );
        nextTempMemory.__active_tool_skill_intake = {
          operation_type: "prepare_attack_card",
          phase: pendingReviewOutput.phase,
          missing_slots: pendingReviewOutput.state_patch.missing_slots,
          slot_state: nextQuestion ?? null,
          operation_input: mergeAttackCardQuestionKnownSlots(
            pendingReviewOutput.state_patch.operation_input ??
              pendingReviewOutput.next_question?.known_slots ?? null,
            nextQuestion,
          ),
          tool_skill_state: pendingReviewOutput.state_patch.tool_skill_state ??
            null,
          turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        };
        return {
          content: renderAttackCardSlotQuestion(nextQuestion),
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_attack_card",
            status: pendingReviewOutput.status,
            operation_id: pendingRaw.operation_id ?? null,
            missing_slots: pendingReviewOutput.state_patch.missing_slots,
            slot_state: nextQuestion ?? null,
            draft_review_decision: null,
          },
        };
      }
      return {
        content: pendingReviewOutput.ack ??
          "Je n'ai pas réussi à relire cette validation techniquement. Je préfère ne rien créer sans confirmation claire.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: pendingReviewOutput.status,
          operation_id: pendingRaw.operation_id ?? null,
          missing_slots: pendingReviewOutput.state_patch.missing_slots,
          draft_review_decision: null,
        },
      };
    }
    if (draftReviewDecision.decision === "reject") {
      const cleared = clearPrepareAttackCardFrame(nextTempMemory);
      return adaptPrepareAttackCardResultToOperationRuntime({
        result: withPrepareAttackCardReply(skillDecision, {
          status: "cancelled",
          reply: renderAttackCardCancelledReply(),
        }),
        nextTempMemory: cleared,
        extraToolSkillRun: {
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
        },
      });
    }
    if (draftReviewDecision.decision === "explain") {
      return adaptPrepareAttackCardResultToOperationRuntime({
        result: withPrepareAttackCardReply(skillDecision, {
          status: "explained",
          reply: renderAttackCardExplanationReply(pendingRaw.draft),
        }),
        nextTempMemory,
        extraToolSkillRun: {
          operation_id: pendingRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision,
        },
      });
    }
    if (draftReviewDecision.decision === "revise") {
      if (
        pendingReviewOutput.status === "pending_confirmation" &&
        pendingReviewOutput.pending_confirmation &&
        pendingReviewOutput.draft
      ) {
        const target = attackCardTargetFromPendingConfirmation(
          pendingReviewOutput.pending_confirmation,
          null,
        ) as Record<string, unknown>;
        const handoffDraft = buildAttackCardHandoffDraft({
          draft: pendingReviewOutput.draft,
          target,
          pendingConfirmation: pendingReviewOutput.pending_confirmation,
        });
        const handoffState = buildAttackCardHandoffState({
          draft: handoffDraft,
          sourceDraft: pendingReviewOutput.draft,
          target,
          status: "revise_handoff",
        });
        const next = writePrepareAttackCardFrameToTempMemory(nextTempMemory, {
          pending: null,
          draftReview: null,
          active: null,
          handoff: handoffState,
        });
        return {
          content: renderAttackCardPlatformHandoff(handoffDraft),
          nextTempMemory: next,
          toolExecution: "platform_handoff",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_attack_card",
            status: "revise_handoff",
            operation_id: String(
              pendingReviewOutput.pending_confirmation.operation_id ??
                pendingRaw.operation_id ??
                "",
            ),
            previous_operation_id: pendingRaw.operation_id ?? null,
            draft: pendingReviewOutput.draft,
            draft_review_decision: draftReviewDecision,
            committed_effects: [],
            handoff_state: handoffState,
            platform_handoff: attackCardPlatformHandoffRun(
              "revised_platform_handoff",
            ),
          },
        };
      }

      delete nextTempMemory.__pending_tool_skill_confirmation;
      delete nextTempMemory.pending_tool_skill_confirmation;
      const nextQuestion = applyAttackCardSingleTechniquePreference(
        pendingReviewOutput.next_question,
        { preferSingleTechnique: preferSingleTechniqueQuestion },
      );
      nextTempMemory.__active_tool_skill_intake = {
        operation_type: "prepare_attack_card",
        phase: pendingReviewOutput.phase,
        missing_slots: pendingReviewOutput.state_patch.missing_slots,
        slot_state: nextQuestion ?? null,
        operation_input: mergeAttackCardQuestionKnownSlots(
          pendingReviewOutput.state_patch.operation_input ?? {
            ...(pendingReviewOutput.next_question?.known_slots ?? {}),
          },
          nextQuestion,
        ),
        tool_skill_state: pendingReviewOutput.state_patch.tool_skill_state ??
          null,
        turn_count: Number(pendingRaw.turn_count ?? 0) + 1,
      };
      return {
        content: renderAttackCardSlotQuestion(nextQuestion),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: pendingReviewOutput.status,
          operation_id: pendingRaw.operation_id ?? null,
          missing_slots: pendingReviewOutput.state_patch.missing_slots,
          slot_state: nextQuestion ?? null,
          draft_review_decision: draftReviewDecision,
        },
      };
    }
    if (draftReviewDecision.decision !== "approve") return null;

    const handoffDraft = buildAttackCardHandoffDraft({
      draft: pendingRaw.draft,
      target: attackCardTargetFromPendingConfirmation(
        pendingRaw as unknown as Record<string, unknown>,
        null,
      ) as Record<string, unknown>,
      pendingConfirmation: pendingRaw as Record<string, unknown>,
    });
    const handoffState = buildAttackCardHandoffState({
      draft: handoffDraft,
      sourceDraft: pendingRaw.draft,
      target: attackCardTargetFromPendingConfirmation(
        pendingRaw as unknown as Record<string, unknown>,
        null,
      ) as Record<string, unknown>,
      status: "apply_attempt",
    });
    const next = writePrepareAttackCardFrameToTempMemory(nextTempMemory, {
      pending: null,
      draftReview: null,
      active: null,
      handoff: handoffState,
    });
    return adaptPrepareAttackCardResultToOperationRuntime({
      result: withPrepareAttackCardReply(skillDecision, {
        status: "apply_attempt",
        reply: renderAttackCardApplyAttemptReply(handoffDraft),
        pending_confirmation: null,
      }),
      nextTempMemory: next,
      extraToolSkillRun: {
        operation_id: pendingRaw.operation_id ?? null,
        draft_review_decision: draftReviewDecision,
        handoff_state: handoffState,
        platform_handoff: {
          operation_type: "prepare_attack_card",
          status: "delivered",
          surface_id: getHandoffTargetForOperation("prepare_attack_card")
            ?.surface_id ?? "attack_cards",
          reason_code: "apply_attempt_no_chat_mutation",
          no_chat_mutation: true,
        },
      },
    });
  }

  if (isPendingAttackCardOperation(draftReviewRaw)) {
    const draftReviewOutput = await runAttackCardIntake({
      user_id: args.userId,
      channel: args.channel,
      timezone: args.userTimezone,
      message: args.userMessage,
      source: "direct_user_request",
      trigger_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      turn_count: Number(draftReviewRaw.turn_count ?? 0) + 1,
      plan_snapshot: args.planSnapshot ?? {},
      operation_input: withOccupiedAttackKeywords({
        previous_draft: draftReviewRaw.draft,
        target: attackCardTargetFromPendingConfirmation(
          draftReviewRaw as unknown as Record<string, unknown>,
          null,
        ),
        technique: draftReviewRaw.draft?.draft?.technique ?? undefined,
        activation_keyword: draftReviewRaw.draft?.draft?.activation_keyword ??
          undefined,
        intake_state: (draftReviewRaw as any).intake_state ?? undefined,
      }),
    });
    if (draftReviewOutput.status === "technical_blocked") {
      return technicalAttackCardRuntime({
        output: draftReviewOutput,
        nextTempMemory,
        operationId: draftReviewRaw.operation_id ?? null,
      });
    }
    const draftReviewDecision =
      draftReviewOutput.state_patch.draft_review_decision;
    const skillDecision = decidePrepareAttackCardNextStep({
      pendingRaw: draftReviewRaw,
      user_intent: draftReviewOutput.user_intent,
      constraints: draftReviewOutput.constraints,
      draft_review_decision: draftReviewDecision,
    });

    if (skillDecision.status === "draft_ready") {
      const next = writePrepareAttackCardFrameToTempMemory(nextTempMemory, {
        draftReview: {
          ...(draftReviewRaw as Record<string, unknown>),
          turn_count: Number(draftReviewRaw.turn_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        },
      });
      return adaptPrepareAttackCardResultToOperationRuntime({
        result: withPrepareAttackCardReply(skillDecision, {
          reply: renderAttackCardDraftOnlyReply(draftReviewRaw.draft),
        }),
        nextTempMemory: next,
        extraToolSkillRun: {
          operation_id: draftReviewRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision ?? null,
        },
      });
    }

    if (skillDecision.status === "explained") {
      return adaptPrepareAttackCardResultToOperationRuntime({
        result: withPrepareAttackCardReply(skillDecision, {
          reply: renderAttackCardExplanationReply(draftReviewRaw.draft),
        }),
        nextTempMemory,
        extraToolSkillRun: {
          operation_id: draftReviewRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision ?? null,
        },
      });
    }

    if (
      skillDecision.status === "cancelled" ||
      skillDecision.status === "topic_change"
    ) {
      const cleared = clearPrepareAttackCardFrame(nextTempMemory);
      return adaptPrepareAttackCardResultToOperationRuntime({
        result: withPrepareAttackCardReply(skillDecision, {
          status: skillDecision.status === "topic_change"
            ? "topic_change"
            : "cancelled",
          reply: skillDecision.status === "topic_change"
            ? "Ok, je laisse cette carte d'attaque de côté."
            : renderAttackCardCancelledReply(),
        }),
        nextTempMemory: cleared,
        extraToolSkillRun: {
          operation_id: draftReviewRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision ?? null,
        },
      });
    }

    if (skillDecision.status === "apply_attempt") {
      const target = attackCardTargetFromPendingConfirmation(
        draftReviewRaw as unknown as Record<string, unknown>,
        null,
      ) as Record<string, unknown>;
      const handoffDraft = buildAttackCardHandoffDraft({
        draft: draftReviewRaw.draft,
        target,
        pendingConfirmation: draftReviewRaw as Record<string, unknown>,
      });
      const handoffState = buildAttackCardHandoffState({
        draft: handoffDraft,
        sourceDraft: draftReviewRaw.draft,
        target,
        status: "apply_attempt",
      });
      const next = writePrepareAttackCardFrameToTempMemory(nextTempMemory, {
        pending: null,
        draftReview: null,
        active: null,
        handoff: handoffState,
      });
      return adaptPrepareAttackCardResultToOperationRuntime({
        result: withPrepareAttackCardReply(skillDecision, {
          status: "apply_attempt",
          reply: renderAttackCardApplyAttemptReply(handoffDraft),
          pending_confirmation: null,
        }),
        nextTempMemory: next,
        extraToolSkillRun: {
          operation_id: draftReviewRaw.operation_id ?? null,
          draft_review_decision: draftReviewDecision ?? null,
          handoff_state: handoffState,
          platform_handoff: {
            operation_type: "prepare_attack_card",
            status: "delivered",
            surface_id: getHandoffTargetForOperation("prepare_attack_card")
              ?.surface_id ?? "attack_cards",
            reason_code: "apply_attempt_no_chat_mutation",
            no_chat_mutation: true,
          },
        },
      });
    }

    if (
      draftReviewOutput.status === "pending_confirmation" &&
      draftReviewOutput.pending_confirmation &&
      draftReviewOutput.draft
    ) {
      const target = attackCardTargetFromPendingConfirmation(
        draftReviewOutput.pending_confirmation,
        { target: draftReviewRaw.target ?? null },
      );
      const runtime = applyPrepareAttackCardInitialDraftDecision({
        output: draftReviewOutput,
        target,
        tempMemory: nextTempMemory,
        supersedesOperationId: draftReviewRaw.operation_id ?? null,
      });
      if (runtime) return runtime;
    }

    if (draftReviewOutput.status === "ask_question") {
      const nextQuestion = applyAttackCardSingleTechniquePreference(
        draftReviewOutput.next_question,
        { preferSingleTechnique: preferSingleTechniqueQuestion },
      );
      const next = writePrepareAttackCardFrameToTempMemory(nextTempMemory, {
        draftReview: null,
        active: {
          operation_type: "prepare_attack_card",
          phase: draftReviewOutput.phase,
          missing_slots: draftReviewOutput.state_patch.missing_slots,
          slot_state: nextQuestion ?? null,
          operation_input: mergeAttackCardQuestionKnownSlots(
            draftReviewOutput.state_patch.operation_input ?? {
              previous_draft: draftReviewRaw.draft,
              target: draftReviewRaw.target ?? null,
              ...(draftReviewOutput.next_question?.known_slots ?? {}),
            },
            nextQuestion,
          ),
          tool_skill_state: draftReviewOutput.state_patch.tool_skill_state ??
            null,
          turn_count: Number(draftReviewRaw.turn_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        },
      });
      return {
        content: renderAttackCardSlotQuestion(nextQuestion),
        nextTempMemory: next,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: "revised",
          operation_id: draftReviewRaw.operation_id ?? null,
          missing_slots: draftReviewOutput.state_patch.missing_slots,
          slot_state: nextQuestion ?? null,
          draft_review_decision: draftReviewDecision ?? null,
          committed_effects: [],
        },
      };
    }

    return adaptPrepareAttackCardResultToOperationRuntime({
      result: withPrepareAttackCardReply(skillDecision, {
        reply: renderAttackCardBlockedCreateReply(),
      }),
      nextTempMemory,
      extraToolSkillRun: {
        operation_id: draftReviewRaw.operation_id ?? null,
        draft_review_decision: draftReviewDecision ?? null,
      },
    });
  }

  const activeAttackCardIntake = activeAttackCardIntakeRaw as any;
  const activeTargetQuestion = activeAttackCardIntake?.operation_type ===
      "prepare_attack_card"
    ? activeAttackCardIntake.slot_state ?? activeAttackCardIntake.next_question
    : null;
  const activeTargetCandidate = attackCardTargetFromQuestionCandidate(
    activeTargetQuestion?.candidate,
  );
  const activeKnownSlots = attackCardOperationInputWithSingleTechniqueApproval(
    activeAttackCardIntake?.operation_input ??
      activeTargetQuestion?.known_slots ??
      {},
    args.userMessage,
  ) ?? {};
  if (activeTargetCandidate) {
    const candidateOutput = await runAttackCardIntake({
      user_id: args.userId,
      channel: args.channel,
      timezone: args.userTimezone,
      message: args.userMessage,
      source: "direct_user_request",
      trigger_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      turn_count: Number(activeAttackCardIntake.turn_count ?? 0) + 1,
      plan_snapshot: args.planSnapshot ?? {},
      operation_input: withOccupiedAttackKeywords({
        ...activeKnownSlots,
        target_candidate: activeTargetCandidate,
      }),
    });
    if (candidateOutput.status === "technical_blocked") {
      return technicalAttackCardRuntime({
        output: candidateOutput,
        nextTempMemory,
      });
    }
    if (
      candidateOutput.status === "pending_confirmation" &&
      candidateOutput.pending_confirmation &&
      candidateOutput.draft
    ) {
      const target = attackCardTargetFromPendingConfirmation(
        candidateOutput.pending_confirmation,
        { target: activeTargetCandidate },
      );
      const runtime = applyPrepareAttackCardInitialDraftDecision({
        output: candidateOutput,
        target,
        tempMemory: nextTempMemory,
      });
      if (runtime) {
        runtime.toolSkillRun = {
          ...(runtime.toolSkillRun ?? {}),
          target_slot_resolution: {
            status: "resolved_by_skill_intake",
            target: activeTargetCandidate,
          },
        };
        return runtime;
      }
    }
    const nextQuestion = applyAttackCardSingleTechniquePreference(
      candidateOutput.next_question,
      { preferSingleTechnique: preferSingleTechniqueQuestion },
    );
    nextTempMemory.__active_tool_skill_intake = {
      operation_type: "prepare_attack_card",
      phase: candidateOutput.phase,
      missing_slots: candidateOutput.state_patch.missing_slots,
      slot_state: nextQuestion ?? null,
      operation_input: mergeAttackCardQuestionKnownSlots(
        candidateOutput.state_patch.operation_input ?? {
          ...activeKnownSlots,
          target_candidate: activeTargetCandidate,
          ...(candidateOutput.next_question?.known_slots ?? {}),
        },
        nextQuestion,
      ),
      tool_skill_state: candidateOutput.state_patch.tool_skill_state ?? null,
      turn_count: Number(activeAttackCardIntake.turn_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    };
    return {
      content: renderAttackCardSlotQuestion(nextQuestion),
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_attack_card",
        status: candidateOutput.status,
        missing_slots: candidateOutput.state_patch.missing_slots,
        slot_state: nextQuestion ?? null,
        target_slot_resolution: {
          status: "handled_by_skill_intake",
          target: activeTargetCandidate,
        },
      },
    };
  }

  if (
    activeAttackCardIntake?.operation_type === "prepare_attack_card" &&
    activeAttackCardIntake?.operation_input
  ) {
    fallbackOperationInput =
      attackCardOperationInputWithSingleTechniqueApproval(
        activeAttackCardIntake.operation_input,
        args.userMessage,
      ) ?? activeAttackCardIntake.operation_input;
  }

  if (isPendingAttackCardRecommendationOperation(pendingRecommendation)) {
    const confirmation = detectAttackCardConfirmation();
    if (confirmation === "no") {
      delete nextTempMemory.__pending_recommendation_operation;
      return {
        content: "Ok, je ne crée pas cette carte d'attaque.",
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: "recommendation_cancelled",
          recommendation_id: pendingRecommendation.recommendation_id ?? null,
        },
      };
    }
    if (confirmation !== "yes" && !explicitAttackCardRoute) return null;

    const recommendationOutput = await runAttackCardIntake({
      user_id: args.userId,
      channel: args.channel,
      timezone: args.userTimezone,
      message: args.userMessage,
      source: "recommendation_tool",
      trigger_message_id: args.sourceMessageId ?? args.requestId ??
        crypto.randomUUID(),
      safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
      plan_snapshot: args.planSnapshot ?? {},
      operation_input: withOccupiedAttackKeywords(
        pendingRecommendation.operation_input ?? null,
      ),
    });
    if (recommendationOutput.status === "technical_blocked") {
      return technicalAttackCardRuntime({
        output: recommendationOutput,
        nextTempMemory,
        source: "recommendation_tool",
        recommendationId: pendingRecommendation.recommendation_id ?? null,
      });
    }

    if (
      recommendationOutput.status !== "pending_confirmation" ||
      !recommendationOutput.draft ||
      !recommendationOutput.pending_confirmation
    ) {
      delete nextTempMemory.__pending_recommendation_operation;
      if (recommendationOutput.status === "ask_question") {
        const nextQuestion = applyAttackCardSingleTechniquePreference(
          recommendationOutput.next_question,
          { preferSingleTechnique: preferSingleTechniqueQuestion },
        );
        nextTempMemory.__active_tool_skill_intake = {
          operation_type: "prepare_attack_card",
          phase: recommendationOutput.phase,
          missing_slots: recommendationOutput.state_patch.missing_slots,
          slot_state: nextQuestion ?? null,
          operation_input: mergeAttackCardQuestionKnownSlots(
            recommendationOutput.state_patch.operation_input ?? {
              ...(pendingRecommendation.operation_input ?? {}),
              ...(recommendationOutput.next_question?.known_slots ?? {}),
            },
            nextQuestion,
          ),
          tool_skill_state: recommendationOutput.state_patch.tool_skill_state ??
            null,
          turn_count: 1,
          updated_at: new Date().toISOString(),
        };
        return {
          content: renderAttackCardSlotQuestion(
            nextQuestion,
            recommendationOutput.state_patch.missing_slots.includes("target")
              ? "Il manque la cible à rattacher à cette carte."
              : "Il me manque encore un choix pour préparer cette carte.",
          ),
          nextTempMemory,
          toolExecution: "blocked",
          executedTools: [],
          toolSkillRun: {
            selected_handler: "prepare_attack_card",
            status: recommendationOutput.status,
            source: "recommendation_tool",
            missing_slots: recommendationOutput.state_patch.missing_slots,
            slot_state: nextQuestion ?? null,
          },
        };
      }
      return {
        content: renderAttackCardSlotQuestion(
          recommendationOutput.next_question,
          recommendationOutput.state_patch.missing_slots.includes("target")
            ? "Il manque la cible à rattacher à cette carte."
            : "Il me manque encore un choix pour préparer cette carte.",
        ),
        nextTempMemory,
        toolExecution: "blocked",
        executedTools: [],
        toolSkillRun: {
          selected_handler: "prepare_attack_card",
          status: recommendationOutput.status,
          source: "recommendation_tool",
          missing_slots: recommendationOutput.state_patch.missing_slots,
          slot_state: recommendationOutput.next_question ?? null,
        },
      };
    }

    const runtime = applyPrepareAttackCardInitialDraftDecision({
      output: recommendationOutput,
      target: attackCardTargetFromPendingConfirmation(
        recommendationOutput.pending_confirmation,
        pendingRecommendation.operation_input ?? null,
      ),
      tempMemory: nextTempMemory,
      source: "recommendation_tool",
    });
    if (runtime) {
      runtime.toolSkillRun = {
        ...(runtime.toolSkillRun ?? {}),
        source: "recommendation_tool",
        recommendation_id: pendingRecommendation.recommendation_id ?? null,
      };
      return runtime;
    }
  }

  // Chantier 4 (2026-05-28) — Garde-fou: si une carte d'attaque active a
  // été créée très récemment (< 5 min) ET que le user ne demande PAS
  // explicitement une nouvelle carte, on court-circuite le slot filling et
  // on demande de clarifier. Empêche le handler de produire le bug
  // historique A2-r4 T8 ("Je n'ai pas encore créé de carte d'attaque, on
  // commence juste la préparation") alors qu'une carte fraîche existe.
  // Voir docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md, chantier 4.
  const recentActiveCard = await loadRecentActiveAttackCardForUser({
    supabase: args.supabase,
    userId: args.userId,
    maxAgeSeconds: 300,
  });
  if (
    recentActiveCard &&
    !userExplicitlyAsksForNewAttackCard(args.userMessage)
  ) {
    const minutes = Math.max(1, Math.round(recentActiveCard.ageSeconds / 60));
    const ageLabel = recentActiveCard.ageSeconds < 60
      ? "il y a moins d'une minute"
      : `il y a ${minutes} min`;
    const clarification = [
      `Avant que je relance une préparation : tu as déjà une carte d'attaque active "${recentActiveCard.title}" (créée ${ageLabel}).`,
      "",
      "Tu veux qu'on en prépare une nouvelle, ou tu utilises celle-là ?",
    ].join("\n");
    return {
      content: clarification,
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_attack_card",
        status: "duplicate_active_attack_card_guard",
        recent_active_attack_card_id: recentActiveCard.id,
        recent_active_attack_card_age_seconds: recentActiveCard.ageSeconds,
        recent_active_attack_card_title: recentActiveCard.title,
      },
    };
  }

  const output = await runAttackCardIntake({
    user_id: args.userId,
    channel: args.channel,
    timezone: args.userTimezone,
    message: args.userMessage,
    source: "direct_user_request",
    trigger_message_id: args.sourceMessageId ?? args.requestId ??
      crypto.randomUUID(),
    safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
    turn_count: Number(activeAttackCardIntake?.turn_count ?? 0),
    plan_snapshot: args.planSnapshot ?? {},
    operation_input: {
      ...(fallbackOperationInput ?? {}),
      ...(dispatcherOperationInput ?? {}),
      user_message: args.userMessage,
      occupied_activation_keywords: occupiedAttackKeywords,
    },
  });
  if (output.status === "technical_blocked") {
    return technicalAttackCardRuntime({
      output,
      nextTempMemory,
    });
  }

  if (
    output.status === "pending_confirmation" &&
    output.pending_confirmation &&
    output.draft
  ) {
    const target = attackCardTargetFromPendingConfirmation(
      output.pending_confirmation,
      fallbackOperationInput,
    );
    const runtime = applyPrepareAttackCardInitialDraftDecision({
      output,
      target,
      fallbackOperationInput,
      tempMemory: nextTempMemory,
    });
    if (runtime) return runtime;
  }

  if (output.status === "ask_question") {
    const nextQuestion = applyAttackCardSingleTechniquePreference(
      output.next_question,
      { preferSingleTechnique: preferSingleTechniqueQuestion },
    );
    nextTempMemory.__active_tool_skill_intake = {
      operation_type: "prepare_attack_card",
      phase: output.phase,
      missing_slots: output.state_patch.missing_slots,
      slot_state: nextQuestion ?? null,
      operation_input: mergeAttackCardQuestionKnownSlots(
        output.state_patch.operation_input ??
          output.next_question?.known_slots ?? null,
        nextQuestion,
      ),
      tool_skill_state: output.state_patch.tool_skill_state ?? null,
      turn_count: 1,
      updated_at: new Date().toISOString(),
    };
    return {
      content: renderAttackCardSlotQuestion(nextQuestion),
      nextTempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "prepare_attack_card",
        status: "ask_question",
        missing_slots: output.state_patch.missing_slots,
        slot_state: nextQuestion ?? null,
      },
    };
  }

  return {
    content: output.ack ??
      "Je n'ai pas pu préparer cette carte depuis le chat pour l'instant.",
    nextTempMemory,
    toolExecution: output.status === "blocked_by_safety" ? "blocked" : "failed",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "prepare_attack_card",
      status: output.status,
      missing_slots: output.state_patch.missing_slots,
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [{
        type: "prepare_attack_card",
        reason_code: output.status === "blocked_by_safety"
          ? "blocked_by_safety"
          : output.readiness?.reason ?? "intake_failed",
      }],
    },
  };
}
