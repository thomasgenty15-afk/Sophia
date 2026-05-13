import {
  loadBaseSkillContext,
  type LoadSkillContextInput,
} from "../_shared/context.ts";

export async function loadProductHelpContext(input: LoadSkillContextInput) {
  return await loadBaseSkillContext("product_help", input, {
    include_plan: false,
    include_product: true,
    allow_sensitive: false,
    allow_safety_memory: false,
  });
}
