import type { PotionSessionSelectorInput } from "../../../_shared/operation_payload_builder.ts";

export type StatePotionDetailSubSkillDefinition = {
  potion_type: PotionSessionSelectorInput["potion_type"];
  sub_skill: `${PotionSessionSelectorInput["potion_type"]}_intake`;
  required_question_ids: [string, string];
  tone_rules: string[];
  extraction_rules: string[];
};
