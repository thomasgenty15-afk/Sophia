function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

// True only when the Edge Runtime talks to a local Supabase instance. Used to
// keep MEGA_TEST_MODE (deterministic Stripe stub / signature bypass) strictly
// local — see SEC-08.
function isLocalSupabaseEnv(): boolean {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "kong" ||
      host.startsWith("supabase_");
  } catch {
    return false;
  }
}

/**
 * Convert a nested JS object into Stripe-compatible x-www-form-urlencoded fields.
 * - Objects use bracket notation: a[b][c]=x
 * - Arrays use index notation: items[0][price]=...
 */
export function toStripeFormBody(input: Record<string, unknown>): URLSearchParams {
  const out = new URLSearchParams();

  const add = (key: string, value: unknown) => {
    if (value === null || value === undefined) return;
    if (typeof value === "boolean") {
      out.append(key, value ? "true" : "false");
      return;
    }
    if (typeof value === "number") {
      out.append(key, String(value));
      return;
    }
    if (typeof value === "string") {
      out.append(key, value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => add(`${key}[${i}]`, v));
      return;
    }
    if (isRecord(value)) {
      Object.entries(value).forEach(([k, v]) => add(`${key}[${k}]`, v));
      return;
    }
    // Fallback: stringify unknown types.
    out.append(key, JSON.stringify(value));
  };

  Object.entries(input).forEach(([k, v]) => add(k, v));
  return out;
}

export async function stripeRequest<T = any>(
  opts: {
    method: "GET" | "POST" | "DELETE";
    path: string; // ex: "/v1/customers"
    secretKey: string;
    body?: Record<string, unknown>;
    stripeVersion?: string;
    // Stripe-side idempotency (e.g. balance credits triggered by replayable webhooks).
    idempotencyKey?: string;
  },
): Promise<T> {
  // Mega test runner / local deterministic mode:
  // - Avoids network calls (Stripe API) during offline tests.
  // - Controlled via MEGA_TEST_MODE=1 (already used elsewhere in Edge functions).
  try {
    const mega = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
    // SEC-08: the deterministic Stripe stub must only ever run locally, never
    // against a deployed environment (where it would fabricate active subscriptions).
    if (mega === "1" && isLocalSupabaseEnv()) {
      if (opts.method === "POST" && opts.path === "/v1/customers") {
        return { id: "cus_MEGA_TEST" } as T;
      }
      if (opts.method === "GET" && opts.path.startsWith("/v1/customers?")) {
        return { data: [{ id: "cus_MEGA_TEST" }, { id: "cus_MEGA_TEST_2" }] } as T;
      }
      if (opts.method === "GET" && opts.path.startsWith("/v1/subscriptions?")) {
        return {
          data: [
            {
              id: "sub_MEGA_TEST",
              status: "active",
              cancel_at_period_end: false,
              current_period_start: Math.floor(Date.now() / 1000) - 60,
              current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
              items: { data: [{ id: "si_MEGA_TEST", price: { id: "price_test_alliance_monthly" } }] },
            },
          ],
        } as T;
      }
      if (opts.method === "GET" && opts.path.startsWith("/v1/subscriptions/")) {
        return {
          id: "sub_MEGA_TEST",
          status: "active",
          cancel_at_period_end: false,
          current_period_start: Math.floor(Date.now() / 1000) - 60,
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
          items: { data: [{ id: "si_MEGA_TEST", price: { id: "price_test_alliance_monthly" } }] },
        } as T;
      }
      if (opts.method === "POST" && opts.path.startsWith("/v1/subscriptions/")) {
        // Simulate an immediate plan change.
        const newPrice =
          (opts.body as any)?.items?.[0]?.price ??
          "price_test_architecte_monthly";
        // If proration_behavior is always_invoice, Stripe would also create/pay an invoice.
        // We don't model invoices in MEGA_TEST_MODE; callers only rely on subscription shape.
        return {
          id: "sub_MEGA_TEST",
          status: "active",
          cancel_at_period_end: false,
          current_period_start: Math.floor(Date.now() / 1000) - 60,
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
          items: { data: [{ id: "si_MEGA_TEST", price: { id: String(newPrice) } }] },
        } as T;
      }
      if (opts.method === "DELETE" && opts.path.startsWith("/v1/subscriptions/")) {
        // Simulate an immediate cancellation (account deletion flow).
        return {
          id: opts.path.split("/").pop() ?? "sub_MEGA_TEST",
          status: "canceled",
          cancel_at_period_end: false,
          canceled_at: Math.floor(Date.now() / 1000),
        } as T;
      }
      if (opts.method === "POST" && opts.path === "/v1/subscription_schedules") {
        return { id: "subsch_MEGA_TEST" } as T;
      }
      if (opts.method === "POST" && opts.path.startsWith("/v1/subscription_schedules/")) {
        // Simulate a schedule update (downgrade at period end).
        return { id: "subsch_MEGA_TEST", status: "active" } as T;
      }
      if (opts.method === "POST" && opts.path === "/v1/checkout/sessions") {
        // ── FF-064 · LE STUB REND LE CORPS QU'ON LUI A DONNÉ ────────────────
        // Il ne le regardait PAS, et c'est ce qui rendait `trial_end`
        // invérifiable hors production: on pouvait poser la clé, la voir
        // partir dans le vide et lire un `cs_MEGA_TEST` triomphal. Un champ
        // déclaré sans compteur ressemble à un champ qui marche.
        //
        // ⚠️ `__mega_` EST UN PRÉFIXE DE TEST, PAS UN CHAMP STRIPE. Il n'existe
        // que sous `MEGA_TEST_MODE` — lui-même gardé par `isLocalSupabaseEnv()`
        // (SEC-08) —, aucun appelant de production ne le lit, et le rendre ne
        // change rien à ce qui part sur le fil quand le stub est éteint.
        return {
          id: "cs_MEGA_TEST",
          url: "https://checkout.stripe.test/session/cs_MEGA_TEST",
          __mega_body: Object.fromEntries(
            toStripeFormBody(opts.body ?? {}).entries(),
          ),
        } as T;
      }
      if (opts.method === "POST" && opts.path === "/v1/billing_portal/sessions") {
        return { url: "https://billing.stripe.test/portal/session/bps_MEGA_TEST" } as T;
      }
      if (opts.method === "GET" && opts.path.startsWith("/v1/prices/")) {
        // Deterministic monthly amounts per tier for referral-credit tests.
        const priceId = opts.path.slice("/v1/prices/".length);
        const unitAmount = priceId.includes("architecte")
          ? 4990
          : priceId.includes("alliance")
          ? 2990
          : 1990;
        return {
          id: priceId,
          unit_amount: unitAmount,
          currency: "eur",
          recurring: { interval: "month" },
        } as T;
      }
      if (
        opts.method === "POST" &&
        /^\/v1\/customers\/[^/]+\/balance_transactions$/.test(opts.path)
      ) {
        // Simulate a customer balance credit (referral reward).
        return {
          id: `cbtxn_MEGA_TEST_${crypto.randomUUID().slice(0, 8)}`,
          amount: Number((opts.body as any)?.amount ?? 0),
          currency: String((opts.body as any)?.currency ?? "eur"),
        } as T;
      }
      throw new Error(`Stripe stub (MEGA_TEST_MODE) does not support: ${opts.method} ${opts.path}`);
    }
  } catch {
    // If Deno/env isn't available (non-edge usage), just fall through to real network request.
  }

  const url = `https://api.stripe.com${opts.path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.secretKey}`,
  };
  if (opts.stripeVersion) headers["Stripe-Version"] = opts.stripeVersion;
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  let res: Response;
  if (opts.method === "GET") {
    res = await fetch(url, { method: "GET", headers });
  } else {
    const body = opts.body ? toStripeFormBody(opts.body) : new URLSearchParams();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    res = await fetch(url, { method: opts.method, headers, body });
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Stripe should always return JSON, but keep safe.
    json = { raw: text };
  }

  if (!res.ok) {
    const msg =
      (json && typeof json === "object" && json.error && typeof json.error.message === "string" && json.error.message) ||
      `Stripe API error (${res.status})`;
    const err = new Error(msg);
    (err as any).stripe = json;
    (err as any).status = res.status;
    throw err;
  }

  return json as T;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error("Invalid hex");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyStripeWebhookSignature(opts: {
  rawBody: string;
  signatureHeader: string | null;
  webhookSecret: string;
  toleranceSeconds?: number;
}): Promise<{ ok: true; timestamp: number } | { ok: false; error: string }> {
  const tolerance = opts.toleranceSeconds ?? 5 * 60;
  const sig = opts.signatureHeader;
  if (!sig) return { ok: false, error: "Missing Stripe-Signature header" };

  const parts = sig.split(",").map((p) => p.trim());
  let timestamp: number | null = null;
  const v1: string[] = [];
  for (const p of parts) {
    const [k, v] = p.split("=");
    if (!k || !v) continue;
    if (k === "t") timestamp = Number(v);
    if (k === "v1") v1.push(v);
  }
  if (!timestamp || !Number.isFinite(timestamp)) return { ok: false, error: "Invalid Stripe-Signature timestamp" };
  if (!v1.length) return { ok: false, error: "Missing v1 signature" };

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - timestamp) > tolerance) {
    return { ok: false, error: "Webhook timestamp outside tolerance" };
  }

  const signedPayload = `${timestamp}.${opts.rawBody}`;
  const expectedHex = await hmacSha256Hex(opts.webhookSecret, signedPayload);
  const expected = hexToBytes(expectedHex);

  for (const candidateHex of v1) {
    try {
      const candidate = hexToBytes(candidateHex);
      if (timingSafeEqual(candidate, expected)) return { ok: true, timestamp };
    } catch {
      // ignore invalid hex candidate
    }
  }

  return { ok: false, error: "Invalid signature" };
}


