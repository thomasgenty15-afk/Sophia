import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function getLocalSupabaseStatus() {
  const raw = execSync("supabase status --output json", { encoding: "utf8" });
  return JSON.parse(raw);
}

function makeNonce() {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return String(rand).replace(/[^a-zA-Z0-9]/g, "").slice(0, 14);
}

function parseBoolEnv(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}

async function main() {
  const st = getLocalSupabaseStatus();
  const url = st.API_URL;
  const anonKey = st.ANON_KEY;
  const serviceRoleKey = st.SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("Missing local Supabase status keys (API_URL / ANON_KEY / SERVICE_ROLE_KEY)");
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // IMPORTANT: internal_admins is locked down to a single master admin email.
  // See migration: 20251216123000_master_admin_email_lockdown.sql
  const email = (process.env.SOPHIA_MASTER_ADMIN_EMAIL ?? "thomasgenty15@gmail.com").trim();
  const password = String(process.env.SOPHIA_MASTER_ADMIN_PASSWORD ?? "123456").trim();
  const allowResetPassword = parseBoolEnv(process.env.SOPHIA_MASTER_ADMIN_RESET_PASSWORD);

  const authed = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  {
    const { data: signIn, error: signInErr } = await authed.auth.signInWithPassword({ email, password });
    if (signInErr || !signIn.session?.access_token) {
      // If sign-in failed, ensure the user exists; only reset password if explicitly allowed.
      const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200, page: 1 });
      if (listErr) throw listErr;
      const found = (listed?.users ?? []).find((u) => String(u.email ?? "").toLowerCase() === email.toLowerCase());
      if (!found?.id) {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: "Master Admin (local)" },
        });
        if (createErr) throw createErr;
        if (!created?.user?.id) throw new Error("Missing user id after createUser");
      } else if (allowResetPassword) {
        const { error: updErr } = await admin.auth.admin.updateUserById(found.id, { password });
        if (updErr) throw updErr;
      } else {
        throw new Error(
          [
            `[Auth] Cannot sign in as master admin (${email}).`,
            `Refusing to reset its password automatically.`,
            `Fix: set SOPHIA_MASTER_ADMIN_PASSWORD to the correct password,`,
            `or (local only) set SOPHIA_MASTER_ADMIN_RESET_PASSWORD=1 to overwrite it.`,
          ].join(" "),
        );
      }

      const { data: signIn2, error: signInErr2 } = await authed.auth.signInWithPassword({ email, password });
      if (signInErr2) throw signInErr2;
      if (!signIn2.session?.access_token) throw new Error("Missing access_token after sign-in");
    }
  }

  const scenarioPath = path.join(process.cwd(), "eval", "scenarios", "sophia_bilan_includes_vitals.json");
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf8"));

  // Mirror the UI defaults requested:
  // - 1 test
  // - 15 turns
  // - 3 actions to verify
  // - + vital sign (scenario enforces 'Sommeil' before actions)
  const limits = {
    max_scenarios: 1,
    max_turns_per_scenario: 15,
    bilan_actions_count: 3,
    test_post_checkup_deferral: false,
    user_difficulty: "mid",
    stop_on_first_failure: false,
    budget_usd: 0,
    model: "gemini-2.5-flash",
    use_real_ai: true,
    use_pre_generated_plans: true,
    pre_generated_plans_required: true,
  };

  const startedAt = Date.now();
  const { data, error } = await authed.functions.invoke("run-evals", {
    body: { scenarios: [scenario], limits },
  });
  const durationMs = Date.now() - startedAt;

  if (error) throw error;

  const res0 = Array.isArray(data?.results) ? data.results[0] : null;
  console.log(JSON.stringify({
    ok: true,
    duration_ms: durationMs,
    request_id: data?.request_id ?? null,
    mega_test_mode: data?.mega_test_mode ?? null,
    limits_applied: data?.limits_applied ?? null,
    stopped_reason: data?.stopped_reason ?? null,
    total_cost_usd: data?.total_cost_usd ?? null,
    total_tokens: data?.total_tokens ?? null,
    first_result: res0,
    results_count: Array.isArray(data?.results) ? data.results.length : 0,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


