import type { RunSkillInput } from "../_shared/skill_helpers.ts";
import {
  buildExecutionBreakdownIntakeInput,
  type ExecutionBreakdownIntakeModel,
  runExecutionBreakdownStructuredIntake,
} from "./intake.ts";
import { reduceExecutionBreakdownTurn } from "./reducer.ts";

export type RunExecutionBreakdownSkillInput = RunSkillInput & {
  intake_model?: ExecutionBreakdownIntakeModel;
  request_id?: string | null;
};

export async function runExecutionBreakdownSkill(
  input: RunExecutionBreakdownSkillInput,
) {
  const intake = await runExecutionBreakdownStructuredIntake(
    {
      ...buildExecutionBreakdownIntakeInput(input, input.request_id),
      intake_model: input.intake_model,
    },
  );
  return reduceExecutionBreakdownTurn({ run_input: input, intake });
}
