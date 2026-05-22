import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../../_shared/gemini.ts";
import { POTION_DEFINITIONS } from "../../../../../_shared/v2-potions.ts";
import type { PotionSessionSelectorInput } from "../../_shared/operation_payload_builder.ts";
import type {
  SelectStatePotionSlotFillerInput,
  SelectStatePotionSlotFillerOutput,
} from "../intake.ts";
import { APAISEMENT_POTION_SUBSKILL } from "./potions/apaisement.ts";
import { AMOUR_POTION_SUBSKILL } from "./potions/amour.ts";
import { CLARTE_POTION_SUBSKILL } from "./potions/clarte.ts";
import { COURAGE_POTION_SUBSKILL } from "./potions/courage.ts";
import { GUERISON_POTION_SUBSKILL } from "./potions/guerison.ts";
import { RAPPEL_POTION_SUBSKILL } from "./potions/rappel.ts";
import type { StatePotionDetailSubSkillDefinition } from "./potions/types.ts";

export const POTION_DETAIL_SUBSKILLS: Record<
  PotionSessionSelectorInput["potion_type"],
  StatePotionDetailSubSkillDefinition
> = {
  rappel: RAPPEL_POTION_SUBSKILL,
  courage: COURAGE_POTION_SUBSKILL,
  guerison: GUERISON_POTION_SUBSKILL,
  clarte: CLARTE_POTION_SUBSKILL,
  amour: AMOUR_POTION_SUBSKILL,
  apaisement: APAISEMENT_POTION_SUBSKILL,
};

export const SUPPORT_TIMING_QUESTION_ID = "support_timing";
export const SUPPORT_TIMING_SLOT = `potion_detail:${SUPPORT_TIMING_QUESTION_ID}`;

export function isActionAwarePotion(
  type: PotionSessionSelectorInput["potion_type"] | null,
): boolean {
  return type === "courage" || type === "clarte" || type === "rappel";
}

export function chatDetailQuestionIds(
  type: PotionSessionSelectorInput["potion_type"] | null,
): string[] {
  return type ? [...POTION_DETAIL_SUBSKILLS[type].required_question_ids] : [];
}

export function chatDetailQuestionLabel(
  type: PotionSessionSelectorInput["potion_type"] | null,
  questionId: string,
): string {
  if (questionId === SUPPORT_TIMING_QUESTION_ID) {
    return "Quand est-ce que Sophia doit etre la autour de cette action ?";
  }
  const definition = type ? POTION_DEFINITIONS[type] : null;
  return definition?.questionnaire.find((question) =>
    question.id === questionId
  )
    ?.label ?? questionId;
}

export function buildPotionDetailSubskillPrompt(
  type?: PotionSessionSelectorInput["potion_type"] | null,
): string {
  const entries = type
    ? [POTION_DETAIL_SUBSKILLS[type]]
    : Object.values(POTION_DETAIL_SUBSKILLS);
  return [
    "Sous-skills detail par potion. Chaque sous-skill extrait les deux champs de base avant generation du draft.",
    "Exception action-aware: pour courage, clarte et rappel, si le user parle d'une action concrete mais n'a pas donne le moment/frequence du soutien, tu dois ajouter le slot optionnel support_timing avant draft_generation.",
    ...entries.map((entry) => {
      const definition = POTION_DEFINITIONS[entry.potion_type];
      const questions = entry.required_question_ids.map((id) => {
        const question = definition.questionnaire.find((item) =>
          item.id === id
        );
        return `${id}: ${question?.label ?? id}.`;
      });
      return [
        `- ${entry.sub_skill}`,
        `  potion_type: ${entry.potion_type}`,
        `  champs: ${questions.join(" | ")}`,
        `  ton: ${entry.tone_rules.join(" ")}`,
        `  extraction: ${entry.extraction_rules.join(" ")}`,
      ].join("\n");
    }),
  ].join("\n");
}

export async function fillPotionDetailSlotsWithAi(
  input: SelectStatePotionSlotFillerInput,
  normalize: (raw: unknown) => SelectStatePotionSlotFillerOutput,
): Promise<SelectStatePotionSlotFillerOutput | null> {
  const selectedPotion = String(
    input.current_state?.selected_potion.value ??
      input.current_state?.explicit_potion_request.potion_type ??
      "",
  ).trim() as PotionSessionSelectorInput["potion_type"];
  const systemPrompt = [
    "Tu es un sous-skill detail interne du Tool Skill select_state_potion.",
    "Tu ne choisis pas la potion: elle est deja selectionnee dans current_state.",
    "Tu ne reponds jamais librement au user. Tu retournes uniquement un JSON de progression.",
    "Principe strict: l'extraction des deux champs detail se fait ici, dans le JSON. Le code ne fera pas de regex ni de fallback metier.",
    buildPotionDetailSubskillPrompt(selectedPotion || null),
    "Utilise current_user_message ET recent_messages: si le user a deja repondu naturellement a un champ dans les derniers tours, remplis ce champ au lieu de reposer la meme question.",
    "Quand le user ajoute une precision apres une question Sophia, rattache cette precision au champ manquant le plus probable, meme si les mots ne reprennent pas le libelle canonique.",
    "Remplis details.answers pour les deux champs obligatoires de la potion selectionnee.",
    "Pour le slot optionnel support_timing, utilise question_id='support_timing'. Il ne sert qu'a capter quand Sophia doit etre presente: date/heure precise, fenetre, jours recurrents, ou indication que le soutien doit rester general.",
    "Si un ou deux champs manquent, current_sub_skill='detail_intake', missing_slots contient potion_detail:<question_id>, et generated_user_message pose UNE seule question courte, naturelle et prioritaire.",
    "Si les deux champs de base sont remplis mais support_timing manque pour une action concrete, current_sub_skill='detail_intake', missing_slots=['potion_detail:support_timing'], et generated_user_message demande quand placer le soutien sans proposer une frequence par defaut.",
    "Si le user repond au timing apres cette question, ajoute une reponse details.answers avec question_id='support_timing', vide missing_slots, puis passe en draft_generation.",
    "Ne pose pas les deux questions canoniques d'un coup. Si deux champs manquent, choisis celui qui debloque le mieux la suite.",
    "Ne liste jamais les options internes au user. Interdits visibles: 'peur du resultat, du regard, de l'inconfort ou du conflit', 'ponctuel ou recurrent', 'moment precis ou situation qui revient', et toute enumeration type formulaire.",
    "Avant la question, tu peux faire une micro-reformulation en mots user, mais pas de phrase generique.",
    "La question doit sonner comme une conversation: ancree dans ce que le user vient de dire, pas comme un questionnaire. Ne repose pas une question deja repondue dans recent_messages.",
    "Si les deux champs de base sont remplis et qu'aucun support_timing n'est necessaire, current_sub_skill='draft_generation' et generated_user_message peut rester null.",
    "Tu tutoies toujours l'utilisateur. Pas de vocabulaire technique.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    task: "fill_state_potion_detail_subskill_slots",
    required_json_shape: {
      current_sub_skill: "detail_intake|draft_generation",
      state_patch: {
        details: {
          status: "missing|ambiguous|identified",
          required_question_ids: ["string"],
          answers: [{
            question_id: "string",
            label: "string",
            answer: "string",
            evidence: ["string"],
          }],
          evidence: ["string"],
        },
        missing_slots: ["potion_detail:<question_id>"],
        generated_user_message: "string|null",
        confidence: "low|medium|high",
      },
      missing_slots: ["potion_detail:<question_id>"],
      confidence: "low|medium|high",
      generated_user_message: "string|null",
      evidence: ["string"],
    },
    current_user_message: input.message,
    recent_messages: input.recent_messages ?? [],
    current_state: input.current_state ?? null,
    operation_input: input.operation_input ?? null,
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
        source: "select_state_potion.detail_intake",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalize(raw);
  } catch (error) {
    console.warn("[SelectStatePotion] detail subskill failed", error);
    return null;
  }
}
