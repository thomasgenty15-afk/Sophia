/**
 * L'ORCHESTRATEUR — mince, comme le patron `safety_crisis` l'impose.
 *
 * Il lit l'état, appelle le reducer pur, rend le gabarit. Aucune décision ne
 * vit ici : elles sont toutes dans `reducer.ts`, qui se teste hors réseau.
 */

import { baseOutput, type RunSkillInput } from "../_shared/skill_helpers.ts";
import { emptyConversationEffects } from "../_shared/conversation_skill_contract.ts";
import type { ConversationSkillOutput } from "../../contracts/skill_output.v1.ts";
import {
  KEEL_REENGAGEMENT_RESUME_SKILL_ID,
  type KeelReengagementResumeState,
} from "./contract.ts";
import { reduceKeelReengagementResume } from "./reducer.ts";
import { renderKeelReengagementResume } from "./renderer.ts";

/** La clé du working state, dans l'`active_skill_state`. */
export const KEEL_REENGAGEMENT_RESUME_STATE_KEY =
  "keel_reengagement_resume_local_state";

export function runKeelReengagementResumeSkill(
  input: RunSkillInput & { safety_band?: string },
): ConversationSkillOutput {
  const working = (input.context.active_skill_working_state ?? {}) as Record<
    string,
    unknown
  >;
  const decision = reduceKeelReengagementResume({
    persistedState: working[KEEL_REENGAGEMENT_RESUME_STATE_KEY],
    userMessage: input.user_message,
    safetyBand: String(input.safety_band ?? "none"),
  });

  // SORTIE SILENCIEUSE. `reply` vide + status `exit`: le runtime global reprend
  // le tour. C'est le contrat d'exit du dépôt — un exit qui rendrait du texte
  // parlerait par-dessus le propriétaire suivant.
  if (decision.kind === "hand_back") {
    return baseOutput(KEEL_REENGAGEMENT_RESUME_SKILL_ID as never, {
      status: "exit",
      response_intent: "exit",
      reply: "",
      effects: emptyConversationEffects(),
      diagnosis: { reason_code: `keel_resume_exit_${decision.reason}` } as never,
    });
  }

  const next: KeelReengagementResumeState = decision.next;
  return baseOutput(KEEL_REENGAGEMENT_RESUME_SKILL_ID as never, {
    status: next.stage === "handed_back" ? "complete" : "continue",
    reply: renderKeelReengagementResume({
      stage: next.stage,
      responseLocale: input.context.response_locale,
    }),
    // Il CADRE, il n'écrit pas. Les effets durables restent à leur lane.
    effects: emptyConversationEffects(),
    state_patch: { [KEEL_REENGAGEMENT_RESUME_STATE_KEY]: next } as never,
  });
}
