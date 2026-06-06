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
export const SUPPORT_TIMING_SLOT =
  `potion_detail:${SUPPORT_TIMING_QUESTION_ID}`;
export const OPTIONAL_FREE_TEXT_QUESTION_ID = "optional_free_text";

export function isActionAwarePotion(
  type: PotionSessionSelectorInput["potion_type"] | null,
): boolean {
  return false;
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
    "Sous-skills detail par potion. Chaque sous-skill decrit les champs a remplir; le moteur commun les verrouille un par un avant generation du draft.",
    "Le chat potion ne collecte pas de timing de soutien: chaque potion prepare seulement ses champs UI, puis la plateforme gere l'activation et le contexte.",
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
    "Principe strict: l'extraction du champ detail courant se fait ici, dans le JSON. Le code ne fera pas de regex ni de fallback metier.",
    "Compatibilite technique: l'ID interne rappel correspond au produit visible Potion anti-decrochage. Ne rends jamais le mot rappel visible comme nom de potion.",
    "Interdits visibles dans generated_user_message: potion rappel, rappel comme nom de potion, potion de reparation, reparation comme nom de potion, apaisement court.",
    buildPotionDetailSubskillPrompt(selectedPotion || null),
    "Tu pilotes un mini-flow incremental: un seul champ a la fois, puis validation/verrouillage, puis champ suivant.",
    "current_state.details.fields contient les champs deja verrouilles ou proposes. Ne modifie pas un champ verrouille sauf correction explicite du user.",
    "Si operation_input.revision_request existe ou si le user reformule explicitement une valeur deja preparee, traite le tour comme une correction de champ: mets a jour le champ UI concerne dans details.fields et details.answers. Ne te contente pas de changer le pourquoi, le ton ou le resume du draft.",
    "Quand un seul champ requis existe pour la potion selectionnee, toute reformulation explicite de contenu pendant une revision concerne ce champ, sauf si le user change de potion ou annule.",
    "Le champ courant est le premier champ requis non locked. Si tous les requis sont locked, le champ courant devient optional_free_text seulement quand la potion expose un champ libre optionnel.",
    "Interdiction stricte: ne verrouille jamais plusieurs champs dans le meme tour, meme si le message user contient assez d'indices.",
    "Extraction opportuniste autorisee: si le message user contient aussi une reponse claire pour un champ requis suivant, retourne ce champ avec status='proposed', proposed_value, needs_user_confirmation=true, mais jamais dans details.answers et jamais status='locked'.",
    "Si un champ suivant est proposed, le tour suivant doit simplement le confirmer ou le corriger; ne redemande pas comme si l'information etait absente.",
    "Interdiction stricte: ne devine pas les champs suivants et ne mets pas de phrase de coaching dans le champ libre.",
    "Si current_state.context.handoff_summary existe, utilise-le seulement pour poser la bonne premiere question ou proposer une valeur pour le champ courant; ne remplis pas tous les champs.",
    "Utilise current_user_message ET recent_messages: si le user valide une proposition precedente, lock uniquement le champ propose.",
    "Quand le user ajoute une precision apres une question Sophia, rattache cette precision au champ courant, meme si les mots ne reprennent pas le libelle canonique.",
    "Si la reponse au champ courant est trop vague, retourne details.fields avec status='proposed' et une meilleure proposed_value, puis generated_user_message demande validation ou correction.",
    "Si la reponse est exploitable et vient du user, retourne details.fields avec status='locked', locked_value, et passe au champ suivant via generated_user_message.",
    "Pour plan_meaning_loss_reason, 'je suis en vrac', 'tout va mal' ou 'tout est flou' decrit l'etat mais n'est pas une bonne valeur locked si on ne sait pas pourquoi le plan perd son sens; propose une formulation centree plan/pourquoi profond et demande validation.",
    "Pour optional_free_text, si le user dit qu'il ne sait pas, rien, laisse vide, ou pas besoin, retourne details.optional_free_text.status='skipped_optional'.",
    "Pour optional_free_text, ne retourne status='locked' que si le user donne explicitement le texte a mettre dans ce champ.",
    "Pour rappel, il n'y a pas de champ libre optionnel: apres drift_target et drift_style, passe directement en draft_generation.",
    "Pour rappel, ne demande jamais lie au plan/hors plan et ne demande jamais d'action du plan.",
    "Pour courage, apres avoidance_target et blocker_kind, passe directement en draft_generation; ne demande jamais lie au plan/hors plan, timing de soutien, ni action du plan.",
    "Pour amour, apres love_lack_context et love_state, passe directement en draft_generation; ne demande jamais lie au plan/hors plan ni quelle action du plan. Le choix plan/hors-plan appartient a la plateforme.",
    "Pour love_lack_context, la reponse doit dire par rapport a quoi le user manque d'amour: sujet, partie de soi, situation, action, echec, ou endroit ou il se juge. Si l'objet reste vague, propose une formulation et demande validation.",
    "Pour love_state, verrouille seulement une option canonique: dur, seul, ou vide.",
    "Pour amour, un besoin de douceur, reconfort ou regard plus tendre peut colorer generated_user_message, mais ne doit jamais devenir un champ requis.",
    "Pour apaisement, apres pressure_source et pressure_state, passe directement en draft_generation; ne demande jamais lie au plan/hors plan ni quelle action du plan. Le choix plan/hors-plan appartient a la plateforme.",
    "Pour pressure_source, la reponse doit dire ce qui met le user sous pression. Si l'objet reste vague, propose une formulation et demande validation sans insister lourdement.",
    "Pour pressure_state, verrouille seulement une option canonique: stresse, a_cran, ou submerge.",
    "Pour apaisement, un besoin de respirer, ralentir ou relacher peut colorer generated_user_message, mais ne doit jamais devenir un champ requis.",
    "Remplis details.answers seulement pour le champ courant quand il est locked. Sinon laisse answers vide. Les champs suivants opportunistes restent uniquement dans details.fields en proposed.",
    "Si un champ manque ou est seulement proposed, current_sub_skill='detail_intake', missing_slots contient potion_detail:<question_id>, et generated_user_message pose UNE seule question courte, naturelle et prioritaire.",
    "Ne pose pas plusieurs questions canoniques d'un coup. Si plusieurs champs manquent, choisis celui qui debloque le mieux la suite.",
    "Ne liste jamais les options internes au user. Interdits visibles: 'peur du resultat, du regard, de l'inconfort ou du conflit', 'ponctuel ou recurrent', 'moment precis ou situation qui revient', et toute enumeration type formulaire.",
    "Avant la question, tu peux faire une micro-reformulation en mots user, mais pas de phrase generique.",
    "La question doit sonner comme une conversation: ancree dans ce que le user vient de dire, pas comme un questionnaire. Ne repose pas une question deja repondue dans recent_messages.",
    "Si les champs UI requis sont locked et que le champ libre optionnel est absent, locked ou skipped_optional, current_sub_skill='draft_generation' et generated_user_message peut rester null.",
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
          fields: [{
            question_id: "string",
            label: "string",
            required: true,
            status: "missing|proposed|locked",
            proposed_value: "string|null",
            locked_value: "string|null",
            user_evidence: ["string"],
            needs_user_confirmation: true,
            evidence: ["string"],
          }],
          answers: [{
            question_id: "string",
            label: "string",
            answer: "string",
            evidence: ["string"],
          }],
          optional_free_text: {
            question_id: OPTIONAL_FREE_TEXT_QUESTION_ID,
            label: "string",
            required: false,
            status: "missing|proposed|locked|skipped_optional",
            proposed_value: "string|null",
            locked_value: "string|null",
            user_evidence: ["string"],
            needs_user_confirmation: true,
            evidence: ["string"],
          },
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
