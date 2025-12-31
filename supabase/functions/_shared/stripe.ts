function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
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
  },
): Promise<T> {
  // Mega test runner / local deterministic mode:
  // - Avoids network calls (Stripe API) during offline tests.
  // - Controlled via MEGA_TEST_MODE=1 (already used elsewhere in Edge functions).
  try {
    const mega = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
    if (mega === "1") {
      if (opts.method === "POST" && opts.path === "/v1/customers") {
        return { id: "cus_MEGA_TEST" } as T;
      }
      if (opts.method === "POST" && opts.path === "/v1/checkout/sessions") {
        return { id: "cs_MEGA_TEST", url: "https://checkout.stripe.test/session/cs_MEGA_TEST" } as T;
      }
      if (opts.method === "POST" && opts.path === "/v1/billing_portal/sessions") {
        return { url: "https://billing.stripe.test/portal/session/bps_MEGA_TEST" } as T;
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


