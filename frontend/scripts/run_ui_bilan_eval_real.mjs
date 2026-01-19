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

async function ensureMasterAdminSession({ url, anonKey, serviceRoleKey }) {
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // internal_admins is locked down to a single master email (see SQL migration).
  const email = (process.env.SOPHIA_MASTER_ADMIN_EMAIL ?? "thomasgenty15@gmail.com").trim();
  const password = String(process.env.SOPHIA_MASTER_ADMIN_PASSWORD ?? "123456").trim();
  const allowResetPassword = parseBoolEnv(process.env.SOPHIA_MASTER_ADMIN_RESET_PASSWORD);

  const authed = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  {
    const { data: signIn, error: signInErr } = await authed.auth.signInWithPassword({ email, password });
    if (!signInErr && signIn.session?.access_token) {
      return { authed, admin, email };
    }
  }

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

  const { data: signIn, error: signInErr } = await authed.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;
  if (!signIn.session?.access_token) throw new Error("Missing access_token after sign-in");

  return { authed, admin, email };
}

async function fetchEvalRun({ url, serviceRoleKey, evalRunId }) {
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin
    .from("conversation_eval_runs")
    .select("id,created_at,status,scenario_key,transcript,state_before,state_after,issues,suggestions,metrics,config,error")
    .eq("id", evalRunId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function main() {
  const st = getLocalSupabaseStatus();
  const url = st.API_URL;
  const anonKey = st.ANON_KEY;
  const serviceRoleKey = st.SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("Missing local Supabase status keys (API_URL / ANON_KEY / SERVICE_ROLE_KEY)");
  }

  const { authed } = await ensureMasterAdminSession({ url, anonKey, serviceRoleKey });

  // Realistic (non-scripted) bilan scenario: NO steps -> run-evals will use simulate-user for up to 15 turns.
  // Includes vitals: tag + assertion so seedActivePlan includes at least one vital sign before actions.
  const nonce = makeNonce();
  const scenario = {
    dataset_key: "core",
    id: `bilan_real_vitals__${nonce}`,
    scenario_target: "bilan",
    description: "Bilan real (simulate-user) with vitals first + 3 actions to verify, 15 turns max.",
    tags: ["sophia.investigator", "bilan.vitals"],
    persona: {
      label: "Utilisateur coopératif",
      age_range: "25-50",
      style: "réponses claires, bonne foi, ton neutre",
      background: "veut bien faire, prêt à répondre point par point",
    },
    objectives: [
      { kind: "trigger_checkup" },
      {
        kind: "bilan_user_behavior",
        demeanor: "cooperative",
        outcome: "mixed",
        constraint: "normal",
        instructions: [
          "Contexte: l'assistant fait un BILAN (check-up) de plusieurs actions/frameworks actifs.",
          "Réponds comme un humain, en français, messages courts.",
          "Reste dans le bilan, répond item par item jusqu'à la fin.",
          "Mélange completed / partial / missed. Donne des réponses réalistes et variées.",
        ],
      },
    ],
    assertions: {
      must_include_agent: ["investigator"],
      assistant_must_match: ["Sommeil"],
      assistant_must_not_match: ["\\*\\*"],
      include_vitals_in_bilan: true,
      must_keep_investigator_until_stop: true,
    },
  };

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
  const evalRunId = res0?.eval_run_id ?? null;
  if (!evalRunId) {
    console.log(JSON.stringify({ ok: false, duration_ms: durationMs, request_id: data?.request_id ?? null, data }, null, 2));
    throw new Error("Missing eval_run_id in run-evals response");
  }

  const full = await fetchEvalRun({ url, serviceRoleKey, evalRunId });
  const outPath = path.join(process.cwd(), "test-results", `bilan_real_${evalRunId}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(full, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        duration_ms: durationMs,
        request_id: data?.request_id ?? null,
        eval_run_id: evalRunId,
        output_file: outPath,
        turns: Array.isArray(full?.transcript) ? full.transcript.filter((m) => m.role === "user").length : null,
        issues_count: Array.isArray(full?.issues) ? full.issues.length : null,
        suggestions_count: Array.isArray(full?.suggestions) ? full.suggestions.length : null,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


