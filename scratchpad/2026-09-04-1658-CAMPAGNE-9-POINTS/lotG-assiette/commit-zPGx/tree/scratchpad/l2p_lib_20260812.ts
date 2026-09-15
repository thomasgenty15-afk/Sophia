/**
 * L2 · D14 — LA PRÉSENCE. Outillage du run réel (testeur, 2026-08-12).
 *
 * Tout passe par HTTP réel: `POST /auth/v1/signup` pour les comptes, PostgREST
 * `/rest/v1/rpc/...` sous de VRAIS JWT pour les RPC, `/functions/v1/...` pour
 * le générateur. La vérité est relue en base par `psql`.
 */
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const URL_BASE = (Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321")
  .replace(/\/+$/, "");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(URL_BASE)) {
  throw new Error(`Refus: local uniquement (reçu ${URL_BASE}).`);
}
export const ANON = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
export const SERVICE = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
if (!ANON || !SERVICE) throw new Error("Manque ANON / SERVICE_ROLE.");
export { URL_BASE };

export const TAG = "l2p";
export const STATE_FILE = new URL("./l2p_state_20260812.json", import.meta.url);

export function admin(): SupabaseClient {
  return createClient(URL_BASE, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function nonce(): string {
  return `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
}

export type Account = { userId: string; email: string; token: string };

/** ⚠️ GoTrue met l'adresse en minuscules. On garde CE QU'IL REND. */
export async function signUp(prefix: string): Promise<Account> {
  const email = `${TAG}-${prefix}-${nonce()}@test.dev`;
  const res = await fetch(`${URL_BASE}/auth/v1/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON },
    body: JSON.stringify({ email, password: "1234567" }),
  });
  const json = await res.json();
  if (!res.ok || !json?.access_token || !json?.user?.id) {
    throw new Error(`signup ${prefix} HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return {
    userId: json.user.id as string,
    email: String(json.user.email ?? email).toLowerCase(),
    token: json.access_token as string,
  };
}

/** Une RPC PostgREST sous un VRAI JWT (auth.uid() non nul). */
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
  try {
    body = JSON.parse(text);
  } catch { /* garder le texte brut */ }
  return { status: res.status, body };
}

/** Une table en lecture/écriture directe sous un VRAI JWT (pas la RPC). */
export async function restAs(
  account: Account,
  path: string,
  init: { method?: string; body?: unknown; prefer?: string } = {},
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    apikey: ANON,
    Authorization: `Bearer ${account.token}`,
  };
  if (init.prefer) headers.Prefer = init.prefer;
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch { /* brut */ }
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
  const json = await res.json().catch(() => null);
  return { status: res.status, json, ms: Math.round(performance.now() - t0) };
}

// ── verdicts ───────────────────────────────────────────────────────────────
export const FAILURES: string[] = [];
export function pass(label: string, detail = "") {
  console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`);
}
export function fail(label: string, detail = "") {
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  FAILURES.push(label);
}
export function info(label: string, detail = "") {
  console.log(`  ·  ${label}${detail ? ` — ${detail}` : ""}`);
}

export interface State {
  coachId: string;
  owner: Account;
  nina: Account;       // bouche AVEC compte (non-maître)
  householdId: string;
  members: Record<string, string>; // prénom → member_id
  ninaMemberId: string;
  ownerMemberId: string;
  planA?: string;
  planB?: string;
}

export async function saveState(s: State) {
  await Deno.writeTextFile(STATE_FILE, JSON.stringify(s, null, 2));
}
export async function loadState(): Promise<State> {
  return JSON.parse(await Deno.readTextFile(STATE_FILE)) as State;
}
