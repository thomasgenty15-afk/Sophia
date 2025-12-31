import "jsr:@supabase/functions-js/edge-runtime.d.ts";

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  const base = 600;
  const max = 10_000;
  const exp = Math.min(max, base * Math.pow(2, attempt - 1));
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(max, exp + jitter);
}

function isMegaTestMode(): boolean {
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
  return megaRaw === "1" || (megaRaw === "" && isLocalSupabase);
}

export async function sendResendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  from?: string;
  maxAttempts?: number;
}): Promise<{ ok: true; data: any; skipped?: boolean } | { ok: false; error: string; status?: number; data?: any }> {
  // In tests/local deterministic runs we never want to send real emails.
  if (isMegaTestMode()) {
    return { ok: true, skipped: true, data: { id: "resend_MEGA_TEST" } };
  }

  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!apiKey) return { ok: false, error: "Missing RESEND_API_KEY" };

  const from = (opts.from ?? Deno.env.get("SENDER_EMAIL") ?? "Sophia <sophia@sophia-coach.ai>").trim();
  const maxAttempts = Math.max(1, Math.min(8, opts.maxAttempts ?? 5));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
      signal: controller.signal,
    })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        return { __fetch_error: msg } as any;
      })
      .finally(() => clearTimeout(timeout));

    if ((res as any)?.__fetch_error) {
      const msg = String((res as any).__fetch_error);
      if (attempt >= maxAttempts) return { ok: false, error: `Resend fetch failed: ${msg}` };
      await sleep(backoffMs(attempt));
      continue;
    }

    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data };

    // Retry on 429 rate limit.
    if (res.status === 429 && attempt < maxAttempts) {
      await sleep(backoffMs(attempt));
      continue;
    }

    return { ok: false, status: res.status, data, error: `Resend error ${res.status}: ${JSON.stringify(data)}` };
  }

  return { ok: false, error: "Resend retry exhausted" };
}


