import {
  loadBaseSkillContext,
  type LoadSkillContextInput,
} from "../_shared/context.ts";

export async function loadDemotivationRepairContext(
  input: LoadSkillContextInput,
) {
  return await loadBaseSkillContext("demotivation_repair", input, {
    include_plan: true,
    include_product: false,
    allow_sensitive: false,
    allow_safety_memory: false,
  });
}
