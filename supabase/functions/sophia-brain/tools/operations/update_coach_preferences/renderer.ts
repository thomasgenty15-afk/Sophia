import type {
  CoachPreferencesPatchDraftRef,
  UpdateCoachPreferencesCommittedEffect,
  UpdateCoachPreferencesSkillResult,
} from "./contract.ts";

export function renderCoachPreferencesExecuted(args: {
  draft: CoachPreferencesPatchDraftRef;
  committedEffects: UpdateCoachPreferencesCommittedEffect[];
}): string {
  if (args.committedEffects.length === 0) {
    return renderCoachPreferencesFailed();
  }
  return `C'est fait. J'ai mis a jour ta preference : ${args.draft.draft.summary} Tu peux modifier dans ton espace sur sophia-coach.ai.`;
}

export function renderCoachPreferencesFailed(): string {
  return "Je n'ai pas réussi à appliquer cette préférence techniquement. Je préfère ne pas te dire que c'est enregistré tant que la DB ne l'a pas confirmé.";
}

export function renderCoachPreferencesSkillResult(
  result: UpdateCoachPreferencesSkillResult,
): string {
  if (result.status === "executed" && result.committed_effects.length === 0) {
    return renderCoachPreferencesFailed();
  }
  return result.reply ?? "";
}
