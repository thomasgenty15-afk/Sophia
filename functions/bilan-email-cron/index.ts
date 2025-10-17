import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1?deno-std=0.224.0";
import { BilanEmailCronPayloadSchema } from "../../supabase/types.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const EMAIL_PROVIDER = Deno.env.get("EMAIL_PROVIDER") ?? "";
const EMAIL_API_KEY = Deno.env.get("EMAIL_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "coach@sophia.example";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const body = await req.json().catch(() => null);
  const parsed = BilanEmailCronPayloadSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);

  const weekStart = parsed.data.week_start_date;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: recipients, error: rpcErr } = await supabase.rpc("list_recipients_for_bilan", {
    week_start: weekStart,
  });
  if (rpcErr) return json({ error: rpcErr.message }, 400);

  const list = (recipients ?? []).filter((r) => r.email);
  if (list.length === 0) return json({ success: true, processed: 0 });

  if (!EMAIL_PROVIDER || !EMAIL_API_KEY) {
    return json({
      success: true,
      processed: 0,
      dry_run: true,
      reason: "No email provider configured",
      recipients_preview: list.slice(0, 5),
    });
  }

  const results = await Promise.allSettled(
    list.map((recipient) =>
      sendEmail({
        provider: EMAIL_PROVIDER,
        apiKey: EMAIL_API_KEY,
        from: EMAIL_FROM,
        to: recipient.email,
        subject: "Ton mini-bilan hebdo 🌱",
        html: `
          <p>Bonjour ${recipient.first_name ?? ""},</p>
          <p>C’est l’heure du mini-bilan (5 min max). Clique ici pour commencer :</p>
          <p><a href="https://app.sophia.example/bilan?week=${weekStart}">Faire mon bilan</a></p>
          <p>À tout de suite,</p>
          <p>Sophia</p>
        `,
      })
    )
  );

  const processed = results.filter((r) => r.status === "fulfilled").length;
  const failed = results
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => result.status === "rejected")
    .map(({ result, index }) => ({
      email: list[index].email,
      error: String((result as PromiseRejectedResult).reason),
    }));

  return json({ success: true, processed, failed });
});

type EmailJob = {
  provider: string;
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
};

async function sendEmail(job: EmailJob) {
  if (job.provider === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${job.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: job.from,
        to: [job.to],
        subject: job.subject,
        html: job.html,
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
    return res.json();
  }

  if (job.provider === "sendgrid") {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${job.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: job.to }] }],
        from: { email: job.from },
        subject: job.subject,
        content: [{ type: "text/html", value: job.html }],
      }),
    });
    if (!res.ok) throw new Error(`Sendgrid ${res.status}`);
    return { ok: true };
  }

  throw new Error(`Unsupported provider: ${job.provider}`);
}
