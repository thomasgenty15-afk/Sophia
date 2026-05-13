import {
  loadBaseSkillContext,
  type LoadSkillContextInput,
} from "../_shared/context.ts";

export async function loadEmotionalRepairContext(input: LoadSkillContextInput) {
  return await loadBaseSkillContext("emotional_repair", input, {
    include_plan: true,
    include_product: false,
    allow_sensitive: false,
    allow_safety_memory: false,
  });
}
