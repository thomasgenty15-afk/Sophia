// @ts-nocheck
// Shared helpers for the self-service account-deletion / RGPD flows.
//
// Terminology:
//   * `deletion_pending` — T0 state: access cut, WhatsApp silent, Stripe cancelled,
//     hard purge scheduled at profiles.purge_at (J+7). Restorable until then.
//   * deletion_records — anonymised proof of deletion kept after the purge
//     (SHA-256 hashes only, see migration 20260708150000).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

export const ACCOUNT_STATUS_ACTIVE = "active";
export const ACCOUNT_STATUS_DELETION_PENDING = "deletion_pending";
export const DELETION_GRACE_DAYS = 7;

// Typed "DELETE" is the strong-confirmation contract shared with the frontend.
export const DELETION_CONFIRMATION_WORD = "DELETE";

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return bytesToHex(new Uint8Array(digest));
}

// Normalisations must stay stable over time: deletion_records rows are only
// useful as proof if the same email/phone always hashes to the same value.
export async function hashEmail(email: unknown): Promise<string | null> {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return await sha256Hex(`email:${normalized}`);
}

export async function hashPhone(phone: unknown): Promise<string | null> {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return await sha256Hex(`phone:${digits}`);
}

export async function hashUserId(userId: string): Promise<string> {
  return await sha256Hex(`user:${userId}`);
}

export function formatFrenchDate(iso: string, timezone?: string | null): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: (timezone ?? "").trim() || "Europe/Paris",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleDateString("fr-FR");
  }
}

function internalFunctionSecret(): string {
  const secret = (Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "").trim();
  if (secret) return secret;
  // Local fallback, mirroring _shared/internal-auth.ts.
  return (Deno.env.get("SECRET_KEY") ?? "").trim();
}

/**
 * Secret used to sign INV-5 confirmation tokens. Prefers the dedicated
 * CONFIRMATION_TOKEN_SECRET; falls back to the internal-function secret so the
 * flow works in environments where the dedicated secret was never provisioned
 * (the token stays server-signed and unforgeable either way).
 */
export function confirmationTokenSecret(): string {
  const dedicated = (Deno.env.get("CONFIRMATION_TOKEN_SECRET") ?? "").trim();
  return dedicated || internalFunctionSecret();
}

/**
 * Best-effort internal call to the whatsapp-send edge function (same transport
 * as process-checkins). Returns true when the message was accepted.
 */
export async function sendInternalWhatsApp(payload: {
  user_id: string;
  body: string;
  purpose: string;
  metadata_extra?: Record<string, unknown>;
}): Promise<boolean> {
  try {
    const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
    const secret = internalFunctionSecret();
    if (!supabaseUrl || !anonKey || !secret) return false;
    const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        "x-internal-secret": secret,
      },
      body: JSON.stringify({
        user_id: payload.user_id,
        message: { type: "text", body: payload.body },
        purpose: payload.purpose,
        metadata_extra: payload.metadata_extra ?? {},
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn("[account_lifecycle] whatsapp send failed (non-blocking)", err);
    return false;
  }
}

/**
 * Server-side fresh re-authentication: verifies the caller's password against
 * GoTrue right now (not "has a JWT from some point in the past"). Required
 * before the export and before preparing a deletion.
 */
export async function verifyPasswordFresh(opts: {
  createClient: (url: string, key: string, opts?: unknown) => any;
  email: string;
  password: string;
}): Promise<boolean> {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  if (!supabaseUrl || !anonKey || !opts.email || !opts.password) return false;
  const authClient = opts.createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({
    email: opts.email,
    password: opts.password,
  });
  return !error && Boolean(data?.user);
}
