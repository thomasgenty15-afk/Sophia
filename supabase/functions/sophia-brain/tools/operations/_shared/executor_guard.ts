import type { ConfirmationToken } from "../../../contracts/confirmation_token.v1.ts";
import type { RiskBand } from "../../../contracts/turn_frame.v1.ts";
import {
  consumeConfirmationToken,
  verifyConfirmationToken,
} from "../../../confirmation/confirmation_token.ts";

export type ExecutorGuardResult =
  | { ok: true }
  | { ok: false; reason_code: string; ack: string };

export async function verifyExecutorConfirmation(input: {
  token?: ConfirmationToken | null;
  draft: unknown;
  user_id: string;
  operation_type: string;
  pending_confirmation_lookup: (
    id: string,
  ) => Promise<{ consumed: boolean } | null>;
  token_consumption_check: (token_id: string) => Promise<boolean>;
  safety_context_risk_band: RiskBand;
  now_iso?: string;
  secret?: string;
}): Promise<ExecutorGuardResult> {
  if (!input.token) {
    return {
      ok: false,
      reason_code: "missing_confirmation_token",
      ack: "Je ne peux pas executer sans confirmation Oui valide.",
    };
  }
  if (input.token.operation_type !== input.operation_type) {
    return {
      ok: false,
      reason_code: "operation_type_mismatch",
      ack:
        "Je ne peux pas executer cette confirmation pour une autre operation.",
    };
  }
  const verified = await verifyConfirmationToken({
    token: input.token,
    draft: input.draft,
    user_id: input.user_id,
    pending_confirmation_lookup: input.pending_confirmation_lookup,
    token_consumption_check: input.token_consumption_check,
    safety_context_risk_band: input.safety_context_risk_band,
    now_iso: input.now_iso,
    secret: input.secret,
  });
  if (!verified.ok) {
    return {
      ok: false,
      reason_code: verified.reason_code,
      ack: "Je ne peux pas executer cette operation: confirmation invalide.",
    };
  }
  await consumeConfirmationToken(input.token.token_id);
  return { ok: true };
}
