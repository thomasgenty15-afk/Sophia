import {
  loadBaseSkillContext,
  type LoadSkillContextInput,
} from "../_shared/context.ts";

export async function loadSafetyCrisisContext(input: LoadSkillContextInput) {
  return await loadBaseSkillContext("safety_crisis", input, {
    include_plan: false,
    include_product: false,
    allow_sensitive: false,
    allow_safety_memory: false,
  });
}
