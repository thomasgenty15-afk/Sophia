import { POTION_DEFINITIONS } from "../../../../../_shared/v2-potions.ts";
import type {
  PotionQuestion,
  PotionType,
} from "../../../../../_shared/v2-types.ts";
import type { StatePotionSubskillPotionType } from "../contract.ts";
import { visiblePotionLabel } from "../labels.ts";
import { APAISEMENT_POTION_SUBSKILL } from "./potions/apaisement.ts";
import { AMOUR_POTION_SUBSKILL } from "./potions/amour.ts";
import { COURAGE_POTION_SUBSKILL } from "./potions/courage.ts";
import { GUERISON_POTION_SUBSKILL } from "./potions/guerison.ts";
import { RAPPEL_POTION_SUBSKILL } from "./potions/rappel.ts";
import type { StatePotionDetailSubSkillDefinition } from "./potions/types.ts";

export const SUPPORT_TIMING_QUESTION_ID = "support_timing";
export const SUPPORT_TIMING_SLOT =
  `potion_detail:${SUPPORT_TIMING_QUESTION_ID}`;
export const OPTIONAL_FREE_TEXT_QUESTION_ID = "optional_free_text";

export const STATE_POTION_LOCAL_SUBSKILLS: Record<
  Exclude<StatePotionSubskillPotionType, "clarte">,
  StatePotionDetailSubSkillDefinition
> = {
  rappel: RAPPEL_POTION_SUBSKILL,
  courage: COURAGE_POTION_SUBSKILL,
  guerison: GUERISON_POTION_SUBSKILL,
  amour: AMOUR_POTION_SUBSKILL,
  apaisement: APAISEMENT_POTION_SUBSKILL,
};

export function isStatePotionLocalSubskillType(
  value: string | null | undefined,
): value is Exclude<StatePotionSubskillPotionType, "clarte"> {
  return value === "rappel" ||
    value === "courage" ||
    value === "guerison" ||
    value === "amour" ||
    value === "apaisement";
}

export function isActionAwarePotion(
  _type: PotionType | null,
): boolean {
  return false;
}

export function chatDetailQuestionIds(type: PotionType | null): string[] {
  if (!type) return [];
  if (type === "clarte") return ["plan_meaning_loss_reason"];
  return isStatePotionLocalSubskillType(type)
    ? [...STATE_POTION_LOCAL_SUBSKILLS[type].required_question_ids]
    : [];
}

export function chatDetailQuestionLabel(
  type: PotionType | null,
  questionId: string,
): string {
  if (questionId === SUPPORT_TIMING_QUESTION_ID) {
    return "Quand est-ce que Sophia doit etre la autour de cette action ?";
  }
  const definition = type ? POTION_DEFINITIONS[type] : null;
  return definition?.questionnaire.find((question) =>
    question.id === questionId
  )?.label ?? questionId;
}

export function statePotionQuestion(
  type: Exclude<StatePotionSubskillPotionType, "clarte">,
  fieldId: string,
): PotionQuestion | null {
  return POTION_DEFINITIONS[type].questionnaire.find((question) =>
    question.id === fieldId
  ) ?? null;
}

export function statePotionLocalFieldPromptLines(
  type: Exclude<StatePotionSubskillPotionType, "clarte">,
): string[] {
  const definition = POTION_DEFINITIONS[type];
  return STATE_POTION_LOCAL_SUBSKILLS[type].required_question_ids.map(
    (fieldId) => {
      const question = statePotionQuestion(type, fieldId);
      const options = question?.input_type === "single_select"
        ? question.options.map((option) => `${option.value} = ${option.label}`)
          .join(" | ")
        : "free_text";
      return `- ${fieldId}: ${question?.label ?? fieldId}; type=${
        question?.input_type ?? "free_text"
      }; options=${options}`;
    },
  ).concat([
    `- potion_name_visible: ${visiblePotionLabel(type)}`,
    `- product_title_internal: ${definition.title}`,
  ]);
}
