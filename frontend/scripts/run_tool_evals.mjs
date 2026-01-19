import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function parseArgs(argv) {
  const out = {
    model: "gemini-2.5-flash",
    turns: 6,
    scenario: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--model") out.model = String(argv[++i] ?? out.model);
    else if (a === "--turns") out.turns = Number(argv[++i] ?? "6") || 6;
    else if (a === "--scenario") out.scenario = String(argv[++i] ?? "").trim() || null;
  }
  out.turns = Math.max(1, Math.min(50, Math.floor(out.turns)));
  return out;
}

function parseBoolEnv(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}

function getLocalSupabaseStatus() {
  const repoRoot = path.resolve(process.cwd(), "..");
  const supabaseCli = String(process.env.SOPHIA_SUPABASE_CLI ?? "npx --yes supabase@latest").trim();
  const raw = execSync(`${supabaseCli} status --output json`, { encoding: "utf8", cwd: repoRoot });
  return JSON.parse(raw);
}

function decodeJwtAlg(jwt) {
  const t = String(jwt ?? "").trim();
  const p0 = t.split(".")[0] ?? "";
  if (!p0) return "missing";
  try {
    const header = JSON.parse(Buffer.from(p0, "base64url").toString("utf8"));
    return String(header?.alg ?? "unknown");
  } catch {
    return "parse_failed";
  }
}

function signJwtHs256({ secret, payload }) {
  const header = { alg: "HS256", typ: "JWT" };
  const enc = (obj) => Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
  const headerB64 = enc(header);
  const payloadB64 = enc(payload);
  const toSign = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac("sha256", secret).update(toSign).digest("base64url");
  return `${toSign}.${sig}`;
}

function normalizeSupabaseStatusKeys(st) {
  const anonAlg = decodeJwtAlg(st?.ANON_KEY);
  const serviceAlg = decodeJwtAlg(st?.SERVICE_ROLE_KEY);
  if (anonAlg === "HS256" && serviceAlg === "HS256") return st;

  const jwtSecret = String(st?.JWT_SECRET ?? "").trim();
  if (!jwtSecret) return st;

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 365 * 10;
  const iss = "supabase-demo";
  const anonKey = signJwtHs256({ secret: jwtSecret, payload: { iss, role: "anon", exp } });
  const serviceRoleKey = signJwtHs256({ secret: jwtSecret, payload: { iss, role: "service_role", exp } });
  return { ...st, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceRoleKey };
}

function mustEnv(name, fallback = null) {
  const v = process.env[name];
  if (v == null || String(v).trim().length === 0) {
    if (fallback != null) return fallback;
    throw new Error(`Missing env ${name}`);
  }
  return String(v).trim();
}

function listScenarioFiles() {
  const dir = path.join(process.cwd(), "eval", "scenarios", "tools");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  return files.map((f) => path.join(dir, f));
}

function loadScenario(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function ensureMasterAdminSession({ url, anonKey, serviceRoleKey }) {
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const authed = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const email = mustEnv("SOPHIA_MASTER_ADMIN_EMAIL", "thomasgenty15@gmail.com");
  const password = mustEnv("SOPHIA_MASTER_ADMIN_PASSWORD", "123456");
  const allowResetPassword = parseBoolEnv(process.env.SOPHIA_MASTER_ADMIN_RESET_PASSWORD);

  // Sign in (best-effort). If it fails, give a clear error to the operator.
  let { data: signIn, error: signErr } = await authed.auth.signInWithPassword({ email, password });
  if (signErr || !signIn.session?.access_token || !signIn.user?.id) {
    // Ensure user exists; optionally reset password (local convenience).
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
          `User exists; set SOPHIA_MASTER_ADMIN_PASSWORD to the correct password,`,
          `or set SOPHIA_MASTER_ADMIN_RESET_PASSWORD=1 (local only) to overwrite it.`,
        ].join(" "),
      );
    }
    const { data: signIn2, error: signErr2 } = await authed.auth.signInWithPassword({ email, password });
    if (signErr2 || !signIn2.session?.access_token || !signIn2.user?.id) throw signErr2 ?? new Error("Missing access_token after sign-in");
    signIn = signIn2;
  }

  const accessToken = signIn.session.access_token;
  try {
    const alg = decodeJwtAlg(accessToken);
    console.log(`[Auth] signed in as ${email} user_id=${signIn.user.id} token_alg=${alg}`);
  } catch {}
  // Sanity: token works against auth endpoint from this runner context.
  {
    const { data: me, error: meErr } = await authed.auth.getUser(accessToken);
    if (meErr || !me?.user?.id) {
      throw new Error(`[Auth] access_token invalid for auth.getUser(): ${meErr?.message ?? "unknown_error"}`);
    }
  }

  // Ensure this user is in internal_admins so it can call run-evals/simulate-user/eval-judge.
  // Use service_role to bypass RLS (local runs often start from a fresh DB).
  try {
    await admin.from("internal_admins").upsert({ user_id: signIn.user.id });
  } catch (e) {
    // Best effort, but if this fails the run will 401 anyway, so surface it.
    const msg = e?.message ?? String(e);
    throw new Error(`[Auth] Failed to upsert internal_admins for ${email}: ${msg}`);
  }

  return { authed, email, accessToken };
}

function invokeRunEvalsJson({ url, anonKey, accessToken, body }) {
  // Node's fetch (undici) has a separate headers timeout that can trigger on long eval runs.
  // Use curl instead for robust long-running requests.
  const timeoutMs = Number(process.env.SOPHIA_RUN_EVALS_HTTP_TIMEOUT_MS ?? "900000") || 900000; // 15min
  const maxTimeSec = Math.max(60, Math.ceil(timeoutMs / 1000) + 30);
  const tmp = `/tmp/sophia_run_evals_${Date.now()}_${Math.random().toString(16).slice(2)}.json`;
  fs.writeFileSync(tmp, JSON.stringify(body ?? {}, null, 0), "utf8");
  try {
    const args = [
      "-sS",
      "--max-time",
      String(maxTimeSec),
      "-X",
      "POST",
      `${url}/functions/v1/run-evals`,
      "-H",
      "Content-Type: application/json",
      "-H",
      `Authorization: Bearer ${accessToken}`,
      "-H",
      `apikey: ${anonKey}`,
      "--data-binary",
      `@${tmp}`,
    ];
    const res = spawnSync("curl", args, { encoding: "utf8" });
    if (res.error) throw res.error;
    if ((res.status ?? 0) !== 0) {
      throw new Error(`curl failed (status=${res.status ?? "null"}): ${(res.stderr ?? "").slice(0, 400)}`);
    }
    const rawText = String(res.stdout ?? "");
    let json = {};
    try {
      json = rawText ? JSON.parse(rawText) : {};
    } catch {
      json = { _raw: rawText };
    }
    if (json?.error) {
      throw new Error(`run-evals error: ${String(json.error).slice(0, 500)}`);
    }
    return json;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {}
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const st0 = getLocalSupabaseStatus();
  const st = normalizeSupabaseStatusKeys(st0);
  const url = st.API_URL;
  const anonKey = st.ANON_KEY;
  const serviceRoleKey = st.SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) throw new Error("Missing local Supabase status keys (API_URL / ANON_KEY / SERVICE_ROLE_KEY)");

  const { accessToken } = await ensureMasterAdminSession({ url, anonKey, serviceRoleKey });

  const files = listScenarioFiles();
  if (files.length === 0) throw new Error("No tool scenarios found in frontend/eval/scenarios/tools");

  const selected = args.scenario
    ? files.filter((p) => path.basename(p, ".json") === args.scenario || path.basename(p).includes(args.scenario))
    : files;

  const scenarios = selected.map(loadScenario);
  const limits = {
    max_scenarios: scenarios.length,
    max_turns_per_scenario: args.turns,
    bilan_actions_count: 0,
    test_post_checkup_deferral: false,
    user_difficulty: "mid",
    stop_on_first_failure: false,
    budget_usd: 0,
    model: args.model,
    use_real_ai: true,
    judge_force_real_ai: true,
    // Use the local file-based plan bank to avoid calling generate-plan during eval runs.
    use_pre_generated_plans: true,
    pre_generated_plans_required: true,
  };

  const data = invokeRunEvalsJson({ url, anonKey, accessToken, body: { scenarios, limits } });
  const results = Array.isArray(data?.results) ? data.results : [];
  console.log(JSON.stringify({ ok: true, results_count: results.length, results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


