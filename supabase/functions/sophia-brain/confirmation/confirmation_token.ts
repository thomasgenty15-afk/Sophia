import type { ConfirmationToken } from "../contracts/confirmation_token.v1.ts";
import type { RiskBand } from "../contracts/turn_frame.v1.ts";

declare const Deno: any;

export type ConfirmationTokenVerifyResult =
  | { ok: true }
  | { ok: false; reason_code: string };

function envSecret(): string {
  try {
    return String(Deno?.env?.get?.("CONFIRMATION_TOKEN_SECRET") ?? "").trim();
  } catch {
    return "";
  }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${
    entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(
      ",",
    )
  }}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return bytesToHex(new Uint8Array(digest));
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return bytesToHex(new Uint8Array(sig));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function signablePayload(token: Omit<ConfirmationToken, "signature">): string {
  return canonicalJson(token);
}

export async function createConfirmationToken(input: {
  user_id: string;
  operation_id: string;
  operation_type: string;
  draft: unknown;
  source_message_id: string;
  pending_confirmation_id: string;
  now_iso?: string;
  ttl_ms?: number;
  secret?: string;
}): Promise<ConfirmationToken> {
  const secret = input.secret ?? envSecret();
  if (!secret) throw new Error("missing_confirmation_token_secret");
  const confirmedAt = input.now_iso ?? new Date().toISOString();
  const expiresAt = new Date(
    new Date(confirmedAt).getTime() + (input.ttl_ms ?? 10 * 60_000),
  ).toISOString();
  const unsigned: Omit<ConfirmationToken, "signature"> = {
    token_id: crypto.randomUUID(),
    user_id: input.user_id,
    operation_id: input.operation_id,
    operation_type: input.operation_type,
    draft_hash: await sha256Hex(canonicalJson(input.draft)),
    source_message_id: input.source_message_id,
    pending_confirmation_id: input.pending_confirmation_id,
    confirmed_at: confirmedAt,
    expires_at: expiresAt,
  };
  return {
    ...unsigned,
    signature: await hmacSha256Hex(secret, signablePayload(unsigned)),
  };
}

export async function verifyConfirmationToken(input: {
  token: ConfirmationToken;
  draft: unknown;
  user_id: string;
  pending_confirmation_lookup: (
    id: string,
  ) => Promise<{ consumed: boolean } | null>;
  token_consumption_check: (token_id: string) => Promise<boolean>;
  safety_pregate_risk_band: RiskBand;
  now_iso?: string;
  secret?: string;
}): Promise<ConfirmationTokenVerifyResult> {
  if (
    input.safety_pregate_risk_band === "medium" ||
    input.safety_pregate_risk_band === "high" ||
    input.safety_pregate_risk_band === "critical"
  ) {
    return { ok: false, reason_code: "safety_override" };
  }
  if (input.token.user_id !== input.user_id) {
    return { ok: false, reason_code: "user_id_mismatch" };
  }
  if (
    new Date(input.token.expires_at).getTime() <=
      new Date(input.now_iso ?? new Date().toISOString()).getTime()
  ) {
    return { ok: false, reason_code: "expired" };
  }
  const pending = await input.pending_confirmation_lookup(
    input.token.pending_confirmation_id,
  );
  if (!pending) return { ok: false, reason_code: "pending_not_found" };
  if (pending.consumed) return { ok: false, reason_code: "pending_consumed" };
  if (await input.token_consumption_check(input.token.token_id)) {
    return { ok: false, reason_code: "token_consumed" };
  }
  const draftHash = await sha256Hex(canonicalJson(input.draft));
  if (draftHash !== input.token.draft_hash) {
    return { ok: false, reason_code: "draft_hash_mismatch" };
  }
  const secret = input.secret ?? envSecret();
  if (!secret) return { ok: false, reason_code: "missing_secret" };
  const { signature: _signature, ...unsigned } = input.token;
  const expected = await hmacSha256Hex(secret, signablePayload(unsigned));
  if (!safeEqual(expected, input.token.signature)) {
    return { ok: false, reason_code: "signature_invalid" };
  }
  return { ok: true };
}

const consumedTokenIds = new Set<string>();

export async function consumeConfirmationToken(
  token_id: string,
): Promise<void> {
  consumedTokenIds.add(token_id);
}

export function hasConsumedConfirmationToken(tokenId: string): boolean {
  return consumedTokenIds.has(tokenId);
}

export const hasConsumedConfirmationTokenForTest = hasConsumedConfirmationToken;

export function resetConsumedConfirmationTokensForTest(): void {
  consumedTokenIds.clear();
}
