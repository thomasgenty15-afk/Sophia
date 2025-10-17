import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type WindowState = "open" | "closed";

const KEYS_ONBOARDING = new Set([
  "onboarding_confirm_01",
  "onboarding_start_01",
  "onboarding_followup_01",
]);

const KEYS_BILAN = new Set([
  "weekly_bilan_invite_01",
  "weekly_bilan_feedback_01",
  "weekly_bilan_summary_01",
]);

const KEYS_A8 = new Set([
  "check_action_01",
  "after_event_01",
  "soft_check_01",
  "reflection_01",
  "motivation_optin_01",
]);

const KEYS_SOCLE = new Set([
  "deep_optin_01",
  "deep_optin_02",
  "deep_optin_03",
  "deep_optin_04",
  "deep_optin_05",
  "deep_optin_06",
]);

const KEYS_A6 = new Set([
  "inspiration_optin_01",
  "inspiration_optin_02",
]);

const KEY_A5_FALLBACK = "motivation_optin_02";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const {
    user_id,
    window_state,
    due_bilan,
    onboarding_incomplete,
  } = (await req.json().catch(() => ({}))) as {
    user_id?: string;
    window_state?: WindowState;
    due_bilan?: boolean;
    onboarding_incomplete?: boolean;
  };

  if (!user_id || !window_state) {
    return json({ error: "missing user_id or window_state" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (await hasProactiveToday(supabase, user_id)) {
    return json({ decision: null, reason: "already_sent_today" });
  }

  if (window_state === "open") {
    return json({ decision: null, reason: "window_open" });
  }

  if (
    onboarding_incomplete &&
    (await cooldownOkForKeys(supabase, user_id, KEYS_ONBOARDING, 24))
  ) {
    return json({
      decision: { template_key: "onboarding_followup_01", category: "onboarding" },
    });
  }

  if (due_bilan === true) {
    return json({ decision: { template_key: "weekly_bilan_invite_01", category: "bilan" } });
  }

  if (await cooldownOkForKeys(supabase, user_id, KEYS_A8, 72)) {
    return json({ decision: { template_key: "check_action_01", category: "a8" } });
  }

  if (await cooldownOkForKeys(supabase, user_id, KEYS_SOCLE, 24 * 7)) {
    const key = await rotateSocleKey(supabase, user_id);
    return json({ decision: { template_key: key, category: "socle" } });
  }

  if (
    (await a6QuotaOk(supabase, user_id)) &&
    (await cooldownOkForKeys(supabase, user_id, KEYS_A6, 48))
  ) {
    return json({
      decision: { template_key: "inspiration_optin_01", category: "a6" },
    });
  }

  return json({
    decision: { template_key: KEY_A5_FALLBACK, category: "a5_fallback" },
  });
};

async function hasProactiveToday(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await supabase.rpc("has_proactive_today", { p_user_id: userId });
  if (error) return false;
  return !!data;
}

async function cooldownOkForKeys(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  keys: Set<string>,
  hours: number,
) {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("user_messages")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .in("template_key", Array.from(keys))
    .gte("created_at", since);

  if (error) {
    return true;
  }

  return (data ?? []).length === 0;
}

async function a6QuotaOk(supabase: ReturnType<typeof createClient>, userId: string) {
  const now = new Date();
  const dow = (now.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow));

  const { count, error } = await supabase
    .from("user_messages")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .in("template_key", Array.from(KEYS_A6))
    .gte("created_at", monday.toISOString());

  if (error) {
    return true;
  }

  return (count ?? 0) < 2;
}

async function rotateSocleKey(supabase: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const { data } = await supabase
    .from("user_messages")
    .select("template_key, created_at")
    .eq("user_id", userId)
    .in("template_key", Array.from(KEYS_SOCLE))
    .order("created_at", { ascending: false })
    .limit(6);

  const used = new Set((data ?? []).map((row: { template_key: string }) => row.template_key));

  for (const key of KEYS_SOCLE) {
    if (!used.has(key)) {
      return key;
    }
  }

  return "deep_optin_01";
}
