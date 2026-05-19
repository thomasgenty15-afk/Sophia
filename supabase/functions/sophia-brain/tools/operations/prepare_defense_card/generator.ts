import type { DefenseCardGeneratorInput } from "../_shared/operation_payload_builder.ts";

export type DefenseCardDraftV1 = {
  operation_type: "prepare_defense_card";
  output_schema: "defense_card_draft_v1";
  draft: {
    title: string;
    impulse_label: string;
    target_label: string;
    situation: string;
    signal: string;
    risk_situation: string;
    trigger: string;
    defense_response: string;
    plan_b: string;
    fallback_plan?: string | null;
    why_it_helps: string;
    generic_defense: string;
  };
  confirmation_message: string;
  confirmation_actions: ["yes", "no"];
};

export function runDefenseCardGenerator(
  input: DefenseCardGeneratorInput,
): DefenseCardDraftV1 {
  if (!input.risk_situation.label) {
    throw new Error("defense_card_risk_situation_missing");
  }
  if (!input.attachment.title) {
    throw new Error("defense_card_attachment_missing");
  }
  const strategy = input.defense_response_hint?.strategy_hint ?? "delay";
  const requestedResponse = String(input.defense_response_hint?.value ?? "")
    .trim();
  const response = requestedResponse && strategy !== "unknown"
    ? requestedResponse
    : strategy === "leave_context"
    ? "Quitter le contexte pendant 3 minutes avant de decider quoi faire."
    : strategy === "environment_block"
    ? "Bloquer l'acces au declencheur et faire une action de remplacement courte."
    : "Attendre 10 minutes, respirer, puis choisir la prochaine petite action utile.";
  return {
    operation_type: "prepare_defense_card",
    output_schema: "defense_card_draft_v1",
    draft: {
      title: `Carte de defense - ${input.risk_situation.label}`,
      impulse_label: input.risk_situation.label,
      target_label: input.attachment.title,
      situation: input.risk_situation.label,
      signal: input.risk_situation.description ?? input.trigger.evidence[0] ??
        input.trigger.type,
      risk_situation: input.risk_situation.label,
      trigger: input.trigger.type,
      defense_response: response,
      plan_b:
        "Si ca ne suffit pas, reduire les degats et revenir au plan au prochain moment stable.",
      fallback_plan:
        "Si ca ne suffit pas, reduire les degats et revenir au plan au prochain moment stable.",
      why_it_helps:
        "La carte prepare une reponse dans le moment de risque, sans culpabiliser.",
      generic_defense: response,
    },
    confirmation_message:
      `Je te propose de creer une carte de defense pour ${input.risk_situation.label}: ${response} Tu veux que je la cree ?`,
    confirmation_actions: ["yes", "no"],
  };
}
