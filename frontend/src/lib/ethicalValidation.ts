import { supabase } from "./supabase";
import { newRequestId, requestHeaders } from "./requestId";

export type EthicalEntityType = "action" | "rendez_vous" | "north_star" | "vital_sign";
export type EthicalOperation = "create" | "update";

export function normalizeTextForCompare(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function shouldValidateOnUpdate(
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
  textFieldKeys: string[],
): boolean {
  const prev = previous ?? {};
  const nxt = next ?? {};
  for (const key of textFieldKeys) {
    if (normalizeTextForCompare((prev as any)[key]) !== normalizeTextForCompare((nxt as any)[key])) {
      return true;
    }
  }
  return false;
}

type ValidatePayload = {
  entityType: EthicalEntityType;
  operation: EthicalOperation;
  textFields: Record<string, unknown>;
  previousTextFields?: Record<string, unknown> | null;
  textFieldKeys: string[];
  context?: Record<string, unknown>;
};

export async function validateEthicalText(payload: ValidatePayload): Promise<{ decision: "allow" | "block"; reasonShort: string; validated: boolean }> {
  const reqId = newRequestId();
  const timeoutMessage = "Petit souci de tuyaux, est-ce que tu peux ré-essayer ?";

  const invokePromise = supabase.functions.invoke("ethical-text-validator", {
    body: {
      entity_type: payload.entityType,
      operation: payload.operation,
      text_fields: payload.textFields,
      previous_text_fields: payload.previousTextFields ?? null,
      text_field_keys: payload.textFieldKeys,
      context: payload.context ?? {},
      request_id: reqId,
    },
    headers: requestHeaders(reqId),
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(timeoutMessage)), 20_000);
  });

  const result = await Promise.race([invokePromise, timeoutPromise]) as Awaited<typeof invokePromise>;
  if (result.error) {
    const maybeMessage = (result.error as any)?.message;
    throw new Error(String(maybeMessage || timeoutMessage));
  }
  const decision = String((result.data as any)?.decision ?? "allow") === "block" ? "block" : "allow";
  return {
    decision,
    reasonShort: String((result.data as any)?.reason_short ?? "").trim(),
    validated: Boolean((result.data as any)?.validated),
  };
}

