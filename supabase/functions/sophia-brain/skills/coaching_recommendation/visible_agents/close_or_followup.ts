import {
  type CoachingVisibleAgentInput,
  type CoachingVisibleAgentOutput,
  runSpecializedVisibleAgent,
} from "./shared.ts";

export function runCloseOrFollowupVisibleAgent(
  input: CoachingVisibleAgentInput,
): Promise<CoachingVisibleAgentOutput | null> {
  return runSpecializedVisibleAgent({
    input,
    source: "coaching_recommendation.visible.close_or_followup",
    roleLines: [
      "Tu es le visible agent de suivi et cloture.",
      "Ta mission: repondre sobrement au suivi ou clore la recommandation.",
      "Tu gardes la recommandation actuelle.",
      "Tu ne changes pas de feature.",
    ],
    fallback: (value) => {
      const recommendation = value.flow_context.recommendation;
      if (value.step_context.task_kind === "close_recommendation") {
        return "Oui, garde ce levier comme prochaine piste. Rien n'est cree ni modifie depuis ce chat.";
      }
      return recommendation.why_primary
        ? `Oui: ${recommendation.why_primary}`
        : "Oui, on garde cette piste sans rien creer ni modifier depuis ce chat.";
    },
  });
}
