import type { RunSkillInput } from "../_shared/skill_helpers.ts";
import {
  type ProductHelpIntakeModel,
  runProductHelpStructuredIntake,
} from "./intake.ts";
import { reduceProductHelpTurn } from "./reducer.ts";
import {
  choosePrimaryCatalogCandidate,
  getProductHelpFeature,
  pickCatalogFeatureForObject,
  retrieveProductHelpCandidates,
} from "./retrieval.ts";

export type ProductHelpRunSkillInput = RunSkillInput & {
  intake_model?: ProductHelpIntakeModel;
};

export async function runProductHelpSkill(input: ProductHelpRunSkillInput) {
  const candidates = retrieveProductHelpCandidates(input.user_message);
  const intakeResult = await runProductHelpStructuredIntake({
    user_message: input.user_message,
    recent_messages: input.context.recent_messages,
    active_skill_working_state: input.context.active_skill_working_state,
    turn_frame: input.context.turn_frame,
    product_surfaces: input.context.product_surfaces,
    catalog_candidates: candidates,
    intake_model: input.intake_model,
  });
  const decision = intakeResult.decision;
  const feature = decision.target.feature_id === "one_shot_reminder.chat"
    ? getProductHelpFeature("initiatives")!
    : getProductHelpFeature(decision.target.feature_id) ??
      pickCatalogFeatureForObject(decision.target.object_type) ??
      choosePrimaryCatalogCandidate(candidates);
  return reduceProductHelpTurn({
    decision,
    feature,
    intake_errors: intakeResult.errors,
  });
}
