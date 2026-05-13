import {
  loadBaseSkillContext,
  type LoadSkillContextInput,
} from "../_shared/context.ts";

export async function loadExecutionBreakdownContext(
  input: LoadSkillContextInput,
) {
  return await loadBaseSkillContext("execution_breakdown", input, {
    include_plan: true,
    include_product: false,
    allow_sensitive: false,
    allow_safety_memory: false,
  });
}
