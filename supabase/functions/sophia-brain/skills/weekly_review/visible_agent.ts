import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
// W9/R3 — la langue de la reponse VISIBLE est RECUE (`input.response_locale`),
// resolue une seule fois par le proprietaire du tour. Ce module appelait
// `resolveResponseLocale({})`: une chaine de priorite sans aucune entree, donc
// une langue decidee par son repli. Le bloc RESPONSE_LANGUAGE part en DERNIERE
// instruction du prompt (la position est le mecanisme: la recence gagne).
import { appendResponseLanguageBlock } from "../../../_shared/keel/locale.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "../../router/response_style_policy.ts";
import {
  committedOneShotReminderKnown,
  directEffectContextCommittedThisTurn,
  oneShotReminderVisibleContextPresent,
} from "../../router/one_shot_reminder_prompt_contract.ts";
import type { DirectEffectConfirmationContext } from "../../router/direct_effect_local_context.ts";
import {
  WEEKLY_COACH_DESTINATION,
  type WeeklyReviewConversationContext,
  type WeeklyReviewVisibleTaskKind,
} from "./local_flow.ts";
import {
  weeklyReviewVisibleAgentSpec,
  weeklyReviewVisibleSystemPrompt,
} from "./visible_agents.ts";

export type WeeklyReviewVisibleAgentInput = {
  user_id: string;
  /** W9/R3 — résolue par le runtime, descendue par le skill. Jamais devinée. */
  response_locale: string;
  request_id?: string | null;
  stage: WeeklyReviewVisibleTaskKind;
  user_message?: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  conversation_context: WeeklyReviewConversationContext;
  direct_effect_confirmation_context?: DirectEffectConfirmationContext | null;
  recent_effects_summary?: string | null;
};

export type WeeklyReviewVisibleAgent = (
  input: WeeklyReviewVisibleAgentInput,
) => Promise<string | null>;

function cleanMessage(value: unknown): string | null {
  const text = String(value ?? "").replaceAll("\r\n", "\n").trim();
  return text ? text : null;
}

function parseVisibleMessage(raw: unknown): string | null {
  try {
    const root = typeof raw === "string" ? JSON.parse(raw) : raw as any;
    return cleanMessage(root?.message);
  } catch {
    return cleanMessage(raw);
  }
}

function recentUserMessagesForVisible(
  recentMessages?: Array<
    { role: string; content: string; created_at?: string }
  >,
) {
  return (recentMessages ?? [])
    .filter((message) => cleanMessage(message.role)?.toLowerCase() === "user")
    .map((message) => ({
      role: "user",
      content: cleanMessage(message.content) ?? "",
      ...(cleanMessage(message.created_at)
        ? { created_at: cleanMessage(message.created_at) }
        : {}),
    }))
    .filter((message) => message.content)
    .slice(-5);
}

/**
 * W4.4 — sortie UNIQUE: la synthese vers le coach.
 *
 * Les deux phrases precedentes renvoyaient vers « Ajuster mon plan » et vers
 * « Validation du niveau », deux surfaces supprimees en W2. Le weekly a donc
 * passe la periode a proposer chaque dimanche des portes fermees. Le mode du
 * `weekly_planning_context` ne choisit plus la destination: il n'y en a qu'une.
 *
 * Formulation deliberement non-promettante (verite d'execution): « je fais
 * remonter » decrit ce que le tour fait, pas une ecriture confirmee. Le cablage
 * vers `contract_change_requests` + la boite coach est W7.
 */
function adjustDestinationInstruction(
  _context: WeeklyReviewConversationContext,
): string {
  return "Je fais remonter ce point a ton coach avec le bilan: c'est lui qui decide de ce qui bouge dans le plan.";
}

// Une fois la recommandation d'ajustement surfacee dans le weekly, elle ne doit
// pas etre re-deroulee lors des etapes de synthese/cloture (repetition). Le
// stage weekly_adjust_recommendation reste hors de ce set: c'est la ou le user
// demande explicitement quoi ajuster, donc une (re)surface y est legitime.
const STAGES_BLOCKING_ALREADY_SURFACED_ADJUST_RECOMMENDATION = new Set<
  WeeklyReviewVisibleTaskKind
>(["weekly_synthesis", "weekly_closure"]);

function chatPlanMutationRefusalRequired(
  context: WeeklyReviewConversationContext,
): boolean {
  return (context.known_values?.chat_plan_mutation_request as unknown) === true;
}

function canSurfaceAdjustRecommendation(
  context: WeeklyReviewConversationContext,
  options: { stage?: WeeklyReviewVisibleTaskKind } = {},
): boolean {
  // Une demande d'application dans le chat n'est pas une demande "quoi ajuster":
  // on ne re-deroule pas la recommandation, on refuse et on renvoie plateforme.
  if (chatPlanMutationRefusalRequired(context)) {
    return false;
  }
  if (
    options.stage &&
    STAGES_BLOCKING_ALREADY_SURFACED_ADJUST_RECOMMENDATION.has(options.stage) &&
    context.adjust_recommendation.surfaced_in_weekly === true
  ) {
    return false;
  }
  return context.adjust_recommendation.safe_to_surface === true &&
    context.adjust_recommendation.confidence >= 0.95 &&
    context.adjust_recommendation.what_to_adjust.length > 0 &&
    context.adjust_recommendation.why.length > 0 &&
    context.adjust_recommendation.evidence.length >= 2;
}

function visibleAdjustRecommendation(
  context: WeeklyReviewConversationContext,
  canSurface: boolean,
  destinationMessage: string,
) {
  const recommendation = context.adjust_recommendation;
  if (canSurface) {
    return {
      ...recommendation,
      destination_instruction: destinationMessage,
    };
  }
  return {
    ...recommendation,
    confidence: 0,
    what_to_adjust: [],
    why: [],
    evidence: [],
    target_scope: null,
    destination_instruction: null,
    safe_to_surface: false,
  };
}

function visibleSafeConversationContext(
  context: WeeklyReviewConversationContext,
  stage?: WeeklyReviewVisibleTaskKind,
): WeeklyReviewConversationContext {
  const destinationMessage = adjustDestinationInstruction(context);
  const canSurface = canSurfaceAdjustRecommendation(context, { stage });
  const adjustRecommendation = visibleAdjustRecommendation(
    context,
    canSurface,
    destinationMessage,
  );
  return {
    ...context,
    known_values: {
      ...context.known_values,
      adjust_recommendation: adjustRecommendation,
    },
    // W4.4 — la destination est ECRASEE en entier (mode + label + instruction),
    // pas seulement l'instruction. Un flow weekly ouvert avant ce lot porte en
    // base `{mode:'adjust_plan_platform', label:'Ajuster mon plan'}`; un spread
    // qui ne remplacait que l'instruction laissait ce label remonter au prompt,
    // et le modele renvoyait l'eleve vers l'ecran supprime. Le desarmement doit
    // survivre a l'etat persiste, sinon il ne desarme rien.
    weekly_planning_context: {
      ...context.weekly_planning_context,
      // `validation_input_destination` designait « Validation du niveau »,
      // supprimee elle aussi: elle est recouverte au meme titre.
      next_level: context.weekly_planning_context.next_level
        ? {
          ...context.weekly_planning_context.next_level,
          validation_input_destination: WEEKLY_COACH_DESTINATION.label,
        }
        : context.weekly_planning_context.next_level,
      adjustment_destination: {
        ...WEEKLY_COACH_DESTINATION,
        instruction: destinationMessage,
      },
    },
    adjust_recommendation: adjustRecommendation,
    handoff_data: {
      ...context.handoff_data,
      adjustment_destination: context.handoff_data.adjustment_destination &&
          typeof context.handoff_data.adjustment_destination === "object" &&
          !Array.isArray(context.handoff_data.adjustment_destination)
        ? {
          ...(context.handoff_data.adjustment_destination as Record<
            string,
            unknown
          >),
          ...WEEKLY_COACH_DESTINATION,
          instruction: destinationMessage,
        }
        : context.handoff_data.adjustment_destination,
    },
  };
}

export function weeklyReviewVisibleSystemPromptForTest(
  stage: WeeklyReviewVisibleTaskKind,
): string | null {
  return weeklyReviewVisibleSystemPrompt(stage);
}

export async function runWeeklyReviewVisibleAgent(
  input: WeeklyReviewVisibleAgentInput,
): Promise<string | null> {
  const spec = weeklyReviewVisibleAgentSpec(input.stage);
  const systemPrompt = weeklyReviewVisibleSystemPrompt(input.stage, {
    oneShotReminderContextPresent: oneShotReminderVisibleContextPresent(
      input.direct_effect_confirmation_context,
    ),
    committedOneShotReminderThisTurn: directEffectContextCommittedThisTurn(
      input.direct_effect_confirmation_context,
    ),
    committedOneShotReminderKnown: committedOneShotReminderKnown({
      directEffectConfirmationContext:
        input.direct_effect_confirmation_context,
      recentEffectsSummary: input.recent_effects_summary,
    }),
  });
  if (!spec || !systemPrompt) return null;
  const userPrompt = buildWeeklyReviewVisibleAgentUserPrompt(input);
  try {
    const raw = await generateWithGemini(
      appendResponseLanguageBlock(systemPrompt, input.response_locale),
      userPrompt,
      0.35,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel(),
        source: `${spec.source}.${input.stage}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    const message = parseVisibleMessage(raw);
    return message;
  } catch (error) {
    console.warn("[WeeklyReview] visible agent failed", error);
    return null;
  }
}

export function buildWeeklyReviewVisibleAgentUserPrompt(
  input: WeeklyReviewVisibleAgentInput,
): string {
  const visibleContext = visibleSafeConversationContext(
    input.conversation_context,
    input.stage,
  );
  const adjustRecommendationAlreadySurfaced =
    visibleContext.adjust_recommendation.surfaced_in_weekly === true;
  const chatPlanMutationRefusal = chatPlanMutationRefusalRequired(
    input.conversation_context,
  );
  const canSurfaceAdjust = canSurfaceAdjustRecommendation(visibleContext, {
    stage: input.stage,
  });
  return JSON.stringify({
    task: "write_weekly_adaptive_review_visible_message",
    visible_runtime_context: {
      style_rules: VISIBLE_OUTPUT_STYLE_RULES,
      recent_user_messages: recentUserMessagesForVisible(input.recent_messages),
      direct_effect_confirmation_context:
        input.direct_effect_confirmation_context ?? null,
      recent_effects_summary: input.recent_effects_summary ?? null,
    },
    visible_task: {
      kind: input.stage,
      conversation_context: visibleContext,
    },
    hard_constraints: {
      plan_patch_empty_until_platform_handoff: true,
      no_chat_plan_mutation: true,
      adjust_recommendation_is_non_mutant: true,
      adjust_recommendation_already_surfaced:
        adjustRecommendationAlreadySurfaced,
      repeat_adjust_recommendation_forbidden:
        STAGES_BLOCKING_ALREADY_SURFACED_ADJUST_RECOMMENDATION.has(
          input.stage,
        ) &&
        adjustRecommendationAlreadySurfaced,
      can_surface_adjust_recommendation: canSurfaceAdjust,
      adjust_recommendation_safe_to_surface: canSurfaceAdjust,
      chat_plan_mutation_refusal_required: chatPlanMutationRefusal,
      adjustment_destination: visibleContext.weekly_planning_context
        .adjustment_destination,
      adjust_recommendation_destination_user_message:
        adjustDestinationInstruction(visibleContext),
      weekly_closure_claim_allowed:
        visibleContext.weekly_gates.closure_status ===
          "complete" &&
        input.stage === "weekly_closure",
      synthesis_already_rendered:
        visibleContext.known_values.synthesis_already_rendered === true,
      executedTools: [],
      committed_plan_effects: [],
      forbidden_patch_wording: [
        "ce qui bougerait",
        "ce qui resterait",
        "patch en attente",
        "changement de plan pret a appliquer",
      ],
      platform_destination:
        input.conversation_context.handoff_data.platform_destination ?? null,
      no_internal_labels: true,
      one_question_max: true,
      do_not_say: input.conversation_context.do_not_say,
      do_not_claim_uncommitted_tools: true,
      one_shot_reminder:
        input.direct_effect_confirmation_context?.one_shot_reminder ?? null,
    },
    required_json_shape: { message: "string" },
  });
}
