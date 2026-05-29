import type { RunSkillInput } from "../_shared/skill_helpers.ts";
import {
  buildDemotivationRepairIntakeInput,
  type DemotivationRepairIntakeModel,
  runDemotivationRepairStructuredIntake,
} from "./intake.ts";
import { reduceDemotivationRepairTurn } from "./reducer.ts";

export type RunDemotivationRepairSkillInput = RunSkillInput & {
  intake_model?: DemotivationRepairIntakeModel;
  request_id?: string | null;
};

export async function runDemotivationRepairSkill(
  input: RunDemotivationRepairSkillInput,
) {
  const intakeInput = buildDemotivationRepairIntakeInput(
    input,
    input.request_id,
  );
  const intake = await runDemotivationRepairStructuredIntake({
    ...intakeInput,
    intake_model: input.intake_model,
  });
  return reduceDemotivationRepairTurn({ run_input: input, intake });
}
