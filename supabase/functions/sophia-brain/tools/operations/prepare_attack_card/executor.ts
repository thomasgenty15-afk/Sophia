import type { ConfirmationToken } from "../../../contracts/confirmation_token.v1.ts";
import type { RiskBand } from "../../../contracts/turn_frame.v1.ts";
import { verifyExecutorConfirmation } from "../_shared/executor_guard.ts";
import type { AttackCardDraftV1 } from "./generator.ts";

export type PrepareAttackCardExecutorOutcome =
  | {
    status: "executed";
    attack_card_id: string;
    ack: string;
  }
  | { status: "blocked"; reason_code: string; ack: string };

function attackCardResourceLabel(target: {
  kind: "plan_item" | "personal_action";
}): string {
  return target.kind === "personal_action"
    ? "Ressources > Cartes d'attaque"
    : "Ressources > Cartes d'attaque du plan";
}

export async function executePrepareAttackCard(input: {
  operation_id: string;
  user_id: string;
  target: {
    plan_item_id?: string | null;
    kind: "plan_item" | "personal_action";
    title: string;
  };
  draft: AttackCardDraftV1;
  token?: ConfirmationToken | null;
  safety_pregate_risk_band: RiskBand;
  pending_confirmation_lookup: (
    id: string,
  ) => Promise<{ consumed: boolean } | null>;
  token_consumption_check: (token_id: string) => Promise<boolean>;
  write_attack_card: (
    input: {
      target: {
        plan_item_id?: string | null;
        kind: "plan_item" | "personal_action";
        title: string;
      };
      draft: AttackCardDraftV1["draft"];
    },
  ) => Promise<{ attack_card_id: string }>;
  now_iso?: string;
  secret?: string;
}): Promise<PrepareAttackCardExecutorOutcome> {
  if (
    !input.target.title ||
    (input.target.kind === "plan_item" && !input.target.plan_item_id) ||
    !input.draft.draft.title ||
    !input.draft.draft.instruction
  ) {
    return {
      status: "blocked",
      reason_code: "draft_or_target_invalid",
      ack:
        "Je ne peux pas creer cette carte: la cible ou le draft est incomplet.",
    };
  }
  const guard = await verifyExecutorConfirmation({
    token: input.token,
    draft: input.draft,
    user_id: input.user_id,
    operation_type: "prepare_attack_card",
    pending_confirmation_lookup: input.pending_confirmation_lookup,
    token_consumption_check: input.token_consumption_check,
    safety_pregate_risk_band: input.safety_pregate_risk_band,
    now_iso: input.now_iso,
    secret: input.secret,
  });
  if (!guard.ok) return { status: "blocked", ...guard };
  const written = await input.write_attack_card({
    target: input.target,
    draft: input.draft.draft,
  });
  return {
    status: "executed",
    attack_card_id: written.attack_card_id,
    ack:
      `C'est fait. J'ai cree une carte d'attaque pour ${input.target.title} : ${input.draft.draft.generated_asset}. Tu peux la retrouver dans ${attackCardResourceLabel(input.target)} pour la relire et l'utiliser.${
        input.draft.draft.technique === "pre_engagement"
          ? " Le mot de cette carte peut etre remplace depuis cette zone; pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation."
          : " Pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation."
      }`,
  };
}
