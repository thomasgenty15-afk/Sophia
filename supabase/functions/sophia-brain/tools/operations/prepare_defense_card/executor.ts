import type { ConfirmationToken } from "../../../contracts/confirmation_token.v1.ts";
import type { RiskBand } from "../../../contracts/turn_frame.v1.ts";
import { verifyExecutorConfirmation } from "../_shared/executor_guard.ts";
import type { DefenseCardDraftV1 } from "./generator.ts";

export type PrepareDefenseCardExecutorOutcome =
  | { status: "executed"; defense_card_id: string; ack: string }
  | { status: "blocked"; reason_code: string; ack: string };

export async function executePrepareDefenseCard(input: {
  operation_id: string;
  user_id: string;
  draft: DefenseCardDraftV1;
  token?: ConfirmationToken | null;
  safety_pregate_risk_band: RiskBand;
  pending_confirmation_lookup: (
    id: string,
  ) => Promise<{ consumed: boolean } | null>;
  token_consumption_check: (token_id: string) => Promise<boolean>;
  write_defense_card: (
    draft: DefenseCardDraftV1["draft"],
  ) => Promise<{ defense_card_id: string }>;
  now_iso?: string;
  secret?: string;
}): Promise<PrepareDefenseCardExecutorOutcome> {
  if (
    !input.draft.draft.risk_situation ||
    !input.draft.draft.defense_response
  ) {
    return {
      status: "blocked",
      reason_code: "draft_invalid",
      ack:
        "Je ne peux pas creer cette carte de defense: le draft est incomplet.",
    };
  }
  const guard = await verifyExecutorConfirmation({
    token: input.token,
    draft: input.draft,
    user_id: input.user_id,
    operation_type: "prepare_defense_card",
    pending_confirmation_lookup: input.pending_confirmation_lookup,
    token_consumption_check: input.token_consumption_check,
    safety_pregate_risk_band: input.safety_pregate_risk_band,
    now_iso: input.now_iso,
    secret: input.secret,
  });
  if (!guard.ok) return { status: "blocked", ...guard };
  const written = await input.write_defense_card(input.draft.draft);
  return {
    status: "executed",
    defense_card_id: written.defense_card_id,
    ack:
      `C'est fait. J'ai cree une carte de defense pour ${input.draft.draft.risk_situation} : ${input.draft.draft.defense_response} Tu peux la retrouver dans Ressources > Cartes de defense pour la relire, l'utiliser et l'ajuster depuis la plateforme quand l'option est disponible. Depuis le chat, je ne modifie pas une carte existante; si elle ne convient plus, je peux aussi en preparer une nouvelle version apres confirmation.`,
  };
}
