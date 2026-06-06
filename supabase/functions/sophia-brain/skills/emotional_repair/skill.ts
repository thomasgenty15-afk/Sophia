import type { ConversationSkillOutput } from "../../contracts/skill_output.v1.ts";
import type { RunSkillInput } from "../_shared/skill_helpers.ts";
import {
  type EmotionalRepairIntakeModel,
  runEmotionalRepairStructuredIntake,
} from "./intake.ts";
import {
  reduceEmotionalRepairTurn,
  safetyHandoffEmotionalRepairOutput,
} from "./reducer.ts";

export type RunEmotionalRepairSkillInput = RunSkillInput & {
  intake_model?: EmotionalRepairIntakeModel;
  request_id?: string | null;
  explicit_constraints?: string[];
};

export async function runEmotionalRepairSkill(
  input: RunEmotionalRepairSkillInput,
): Promise<ConversationSkillOutput> {
  const safetyRisk = input.context.turn_frame.safety.risk_band;
  if (safetyRisk === "high" || safetyRisk === "critical") {
    return safetyHandoffEmotionalRepairOutput(input);
  }

  const intake = await runEmotionalRepairStructuredIntake({
    user_message: input.user_message,
    context: input.context,
    intake_model: input.intake_model,
    request_id: input.request_id,
    explicit_constraints: input.explicit_constraints,
  });
  return reduceEmotionalRepairTurn({
    run_input: input,
    intake_decision: intake.decision,
    intake_errors: intake.errors,
    intake_trace: intake.trace,
    explicit_constraints: input.explicit_constraints,
  });
}
