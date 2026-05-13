import type { PotionSessionSelectorInput } from "../_shared/operation_payload_builder.ts";

export type PotionSessionDraftV1 = {
  operation_type: "select_state_potion";
  output_schema: "potion_session_draft_v1";
  draft: {
    potion_type: PotionSessionSelectorInput["potion_type"];
    title: string;
    opening_prompt: string;
    instant_support_message: string;
    expected_duration: "short";
    why_this_potion: string;
    follow_up: {
      reminder_instruction: string;
      local_time_hhmm: string;
      duration_days: 7;
      reason_for_time: string;
    };
  };
  confirmation_message: string;
  confirmation_actions: ["yes", "no"];
};

const LABELS: Record<PotionSessionSelectorInput["potion_type"], string> = {
  rappel: "rappel",
  courage: "courage",
  guerison: "guerison",
  clarte: "clarte",
  amour: "amour",
  apaisement: "apaisement",
};

export function runPotionSessionSelector(
  input: PotionSessionSelectorInput,
): PotionSessionDraftV1 {
  if (input.operation_type !== "select_state_potion") {
    throw new Error("potion_operation_type_invalid");
  }
  if (!input.state.kind || !input.potion_type) {
    throw new Error("potion_state_or_type_missing");
  }
  const label = LABELS[input.potion_type];
  const time = input.potion_type === "apaisement" ? "18:30" : "09:00";
  return {
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    draft: {
      potion_type: input.potion_type,
      title: `Potion ${label}`,
      opening_prompt:
        "On commence court, sans pression. L'objectif est de changer l'etat d'un cran, pas de regler toute la situation.",
      instant_support_message: input.potion_type === "guerison"
        ? "Tu n'as pas besoin de transformer cette honte en verdict. La premiere chose, c'est de redevenir habitable pour toi-meme."
        : input.potion_type === "apaisement"
        ? "Tu n'as pas besoin de tout porter maintenant. On fait juste baisser la pression d'un cran."
        : "On va faire simple et court: revenir a un point d'appui maintenant.",
      expected_duration: "short",
      why_this_potion:
        `Cette potion correspond a l'etat ${input.state.kind} avec intensite ${input.state.intensity}.`,
      follow_up: {
        reminder_instruction:
          `Petit point ${label}: prends 30 secondes pour revenir a l'etat que tu veux nourrir aujourd'hui.`,
        local_time_hhmm: time,
        duration_days: 7,
        reason_for_time: input.potion_type === "apaisement"
          ? "Le soir est un bon moment par defaut pour faire redescendre la pression."
          : "Le matin donne un rappel calme avant que la journee n'accelere.",
      },
    },
    confirmation_message:
      `Je te propose une potion ${label} courte. Tu veux la lancer ?`,
    confirmation_actions: ["yes", "no"],
  };
}
