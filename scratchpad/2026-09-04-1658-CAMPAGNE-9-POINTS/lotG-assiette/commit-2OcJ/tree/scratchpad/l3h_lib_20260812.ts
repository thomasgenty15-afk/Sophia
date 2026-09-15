/**
 * L3 · D2/D7 — LA PRISE DE MAIN. Outillage du run réel (testeur, 2026-08-12).
 * HTTP réel partout: /auth/v1/token pour les jetons, /rest/v1/rpc sous VRAIS
 * JWT, /functions/v1 pour le générateur. La vérité est relue en base par psql.
 */
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const URL_BASE = (Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321")
  .replace(/\/+$/, "");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(URL_BASE)) {
  throw new Error(`Refus: local uniquement (recu ${URL_BASE}).`);
}
export const ANON = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
export const SERVICE = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
if (!ANON || !SERVICE) throw new Error("Manque ANON / SERVICE_ROLE.");
export { URL_BASE };

export const STATE_FILE = new URL("./l3h_state_20260812.json", import.meta.url);

export function admin(): SupabaseClient {
  return createClient(URL_BASE, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Account = { userId: string; email: string; token: string };

/** Un VRAI jeton, par le vrai endpoint mot de passe. */
export async function signIn(email: string, password = "1234567"): Promise<Account> {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok || !json?.access_token || !json?.user?.id) {
    throw new Error(`signin ${email} HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return {
    userId: json.user.id as string,
    email: String(json.user.email ?? email).toLowerCase(),
    token: json.access_token as string,
  };
}

export async function rpcAs(
  account: Account | null,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const bearer = account ? account.token : SERVICE;
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: account ? ANON : SERVICE,
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* brut */ }
  return { status: res.status, body };
}

export async function callFn(
  account: Account,
  fn: string,
  body: unknown,
): Promise<{ status: number; json: any; ms: number }> {
  const t0 = performance.now();
  const res = await fetch(`${URL_BASE}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${account.token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = text;
  try { json = JSON.parse(text); } catch { /* brut */ }
  return { status: res.status, json, ms: Math.round(performance.now() - t0) };
}

export const FAILURES: string[] = [];
export function pass(label: string, detail = "") {
  console.log(`  [OK] ${label}${detail ? ` -- ${detail}` : ""}`);
}
export function fail(label: string, detail = "") {
  console.log(`  [KO] ${label}${detail ? ` -- ${detail}` : ""}`);
  FAILURES.push(label);
}
export function info(label: string, detail = "") {
  console.log(`  ,  ${label}${detail ? ` -- ${detail}` : ""}`);
}
