import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import {
  committedOneShotReminderKnown,
  directEffectContextCommittedThisTurn,
  oneShotReminderCanonicalVisiblePromptLines,
  oneShotReminderVisibleContextPresent,
} from "../../router/one_shot_reminder_prompt_contract.ts";
import {
  VISIBLE_CONVERSATION_FLOW_RULES,
  VISIBLE_OUTPUT_STYLE_RULES,
} from "../../router/response_style_policy.ts";
import { userIdentityVisiblePromptLines } from "../../context/user_identity.ts";
import type {
  FeatureOpportunityConversationContext,
  FeatureOpportunityVisibleTaskKind,
} from "./contract.ts";

export type FeatureOpportunityVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: FeatureOpportunityVisibleTaskKind;
  conversation_context: FeatureOpportunityConversationContext;
  visible_runtime_context?: {
    style_rules: string;
    recent_messages: Array<{
      role: "user" | "assistant";
      content: string;
      created_at?: string | null;
    }>;
    recent_effects_summary?: string | null;
    user_identity?: {
      first_name: string | null;
      age: number | null;
      gender: "male" | "female" | "other" | null;
    } | null;
  };
};

export type FeatureOpportunityVisibleAgent = (
  input: FeatureOpportunityVisibleAgentInput,
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

function featureLabel(feature: string | null): string {
  return feature === "coach_preferences"
    ? "preferences de coaching"
    : "initiatives";
}

function fallbackMessage(
  context: FeatureOpportunityConversationContext,
): string {
  const feature = context.recommendation.feature ?? context.feature;
  if (!feature) {
    return "Je vois peut-etre une piste a ranger dans Sophia, mais il me manque le contexte exact a reprendre.";
  }
  const why = context.recommendation.why
    ? `: ${context.recommendation.why}`
    : ".";
  const next = context.recommendation.user_facing_next_step
    ? ` Prochaine etape dans Sophia: ${context.recommendation.user_facing_next_step}`
    : " Prochaine etape dans Sophia: regarde cet espace et decide si tu veux l'ajouter toi-meme.";
  return `Ca ressemble surtout a une opportunite pour ${
    featureLabel(feature)
  }${why}${next}`;
}

export function productGuidancePromptLines(): string[] {
  return [
    "Guidance produit interne au visible feature_opportunity:",
    "- initiatives: une initiative est un message recurrent planifie que Sophia envoie. Elle contient une instruction/message, un contexte, une heure, des jours actifs, une destination et un statut actif/inactif.",
    "- initiatives: elle sert aux contextes recurrents, rituels, moments repetes ou difficultes avant/apres une situation. Nom visible obligatoire: initiatives.",
    "- initiatives: reglages a mentionner si utile: quoi dire, pourquoi/avant quel moment le dire, horaire, jours actifs ou rythme, destination Plan actuel ou Base de vie, actif/inactif.",
    "- initiatives: destination utilisateur: section Initiatives. Le user peut creer, modifier, activer/desactiver ou archiver depuis la plateforme si son acces le permet.",
    "- initiatives: ne dis jamais recurring_reminder, rappel recurrent interne, ni que le chat l'a programmee.",
    "- preferences de coaching: elles reglent la maniere d'accompagner: ton global, niveau de challenge, et tendance a poser des questions.",
    "- preferences de coaching: les trois reglages supportes sont coach.tone (plus doux, chaleureux/direct, direct), coach.challenge_level (faible, equilibre, eleve), coach.question_tendency (peu de questions, normal, tres questionnant).",
    "- preferences de coaching: destination utilisateur: Preferences coach. Le user choisit le reglage et l'applique depuis la plateforme.",
    "- preferences de coaching: elles ne reglent pas les formats fins comme exactement trois lignes, zero emoji ou jamais de question finale.",
    "- preferences de coaching: seuls ces trois axes (ton, niveau de challenge, tendance a poser des questions) sont reglables aujourd'hui dans Preferences coach.",
    "- Si le user exprime une preference hors de ces trois axes (par exemple un moment ou un horaire prefere comme faire le sport le matin, un contenu precis, ou une demande du type 'retiens ce fait sur moi'), ne la presente pas comme reglable dans Preferences coach et ne l'y renvoie pas: dis honnetement que Sophia ne sait pas encore prendre en compte ce type de preference et que ce sera possible dans une version suivante, sans le presenter comme deja fait ni le promettre.",
    "- preferences de coaching: si le user refuse explicitement d'aller regler lui-meme et te demande de l'appliquer directement, dis honnetement que le reglage durable ne se fait pas depuis le chat, confirme que tu adaptes ton style des maintenant dans la conversation, et ne repete jamais la meme redirection une deuxieme fois.",
    "- Depuis ce flow, aiguille et explique. Ne promets jamais une sauvegarde, creation, modification ou application depuis le chat.",
  ];
}

function visibleInstruction(stage: FeatureOpportunityVisibleTaskKind) {
  switch (stage) {
    case "ask_opportunity_clarification":
      return "Pose au maximum une question pour clarifier l'opportunite.";
    case "recommend_feature":
      return "Recommande la surface Sophia pertinente et une prochaine action, sans promettre de sauvegarde.";
    case "answer_followup":
      return "Reponds au suivi en gardant la recommandation produit concrete.";
    case "close_opportunity":
      return "Clos sobrement, sans creer ni modifier quoi que ce soit.";
    case "exit_ack":
      return "Accuse reception tres brievement, sans recommander de feature.";
  }
}

export function featureOpportunityVisiblePrompt(
  stage: FeatureOpportunityVisibleTaskKind,
  opts?: {
    oneShotReminderContextPresent?: boolean;
    committedOneShotReminderThisTurn?: boolean;
    committedOneShotReminderKnown?: boolean;
  },
): string {
  return [
    "Tu es l'agent visible du skill feature_opportunity.",
    "Tu aides le user a reconnaitre une opportunite produit Sophia non-coaching.",
    "Tu ne crees rien, ne modifies rien, ne programmes rien, ne sauvegardes rien, et ne dis jamais que Sophia l'a fait pour les features, initiatives ou preferences de coaching.",
    "Exception stricte: si conversation_context.direct_effect_confirmation_context.one_shot_reminder.committed=true ou si visible_runtime_context.recent_effects_summary prouve une ligne 'Rappel ponctuel cree: execute et persiste' avec etat DB actuel, tu peux confirmer sobrement le rappel selon les regles one_shot_reminder ci-dessous. Cette exception ne permet pas de dire qu'une feature, initiative ou preference a ete creee.",
    "Si visible_runtime_context.recent_effects_summary contient un effet recent, utilise-le seulement si le user demande ce qui vient d'etre fait, programme, note, valide ou annule, ou pour eviter de contredire un effet recent. Ne nomme jamais EffectLedger et ne le mentionne pas spontanement.",
    "Features visibles autorisees uniquement: initiatives, preferences de coaching, coach_preferences.",
    "Ne cite jamais les noms internes des anciennes surfaces de rappel.",
    "Pour feature=initiatives, utilise toujours le nom visible initiatives.",
    "Pour feature=coach_preferences, recommande une preference de coaching sans promettre qu'elle est sauvegardee.",
    ...productGuidancePromptLines(),
    ...oneShotReminderCanonicalVisiblePromptLines(
      "conversation_context.direct_effect_confirmation_context",
      {
        present: opts?.oneShotReminderContextPresent === true,
        committedThisTurn: opts?.committedOneShotReminderThisTurn === true,
        committedKnown: opts?.committedOneShotReminderKnown === true,
      },
    ),
    "Ne mentionne jamais route, dispatcher, JSON, DB, note_information ou outil interne.",
    "Pose au maximum une question.",
    ...userIdentityVisiblePromptLines(),
    VISIBLE_OUTPUT_STYLE_RULES,
    VISIBLE_CONVERSATION_FLOW_RULES,
    visibleInstruction(stage),
    'Retourne uniquement un JSON strict: {"message":"..."}.',
  ].join("\n");
}

export async function runFeatureOpportunityVisibleAgent(
  input: FeatureOpportunityVisibleAgentInput,
): Promise<string | null> {
  const prompt = featureOpportunityVisiblePrompt(input.stage, {
    oneShotReminderContextPresent: oneShotReminderVisibleContextPresent(
      input.conversation_context?.direct_effect_confirmation_context,
    ),
    committedOneShotReminderThisTurn: directEffectContextCommittedThisTurn(
      input.conversation_context?.direct_effect_confirmation_context,
    ),
    committedOneShotReminderKnown: committedOneShotReminderKnown({
      directEffectConfirmationContext:
        input.conversation_context?.direct_effect_confirmation_context,
      recentEffectsSummary:
        input.visible_runtime_context?.recent_effects_summary,
    }),
  });
  try {
    const raw = await generateWithGemini(
      prompt,
      JSON.stringify({
        stage: input.stage,
        visible_runtime_context: input.visible_runtime_context ?? {
          style_rules: VISIBLE_OUTPUT_STYLE_RULES,
          recent_messages: [],
        },
        conversation_context: input.conversation_context,
      }),
      0.35,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: `feature_opportunity.visible.${input.stage}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    const message = parseVisibleMessage(raw) ?? fallbackMessage(
      input.conversation_context,
    );
    return message.replaceAll("recurring_reminder", "initiatives");
  } catch (error) {
    console.warn("[FeatureOpportunity] visible agent failed", error);
    return fallbackMessage(input.conversation_context);
  }
}
