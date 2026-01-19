import { createClient } from "@supabase/supabase-js";
import { execSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const LOCK_PATH = "/tmp/sophia_tools_activate_action_eval.lock";

function acquireLock() {
  try {
    const fd = fs.openSync(LOCK_PATH, "wx");
    fs.writeFileSync(fd, String(process.pid), "utf8");
    fs.closeSync(fd);
    process.on("exit", () => { try { fs.unlinkSync(LOCK_PATH); } catch {} });
    process.on("SIGINT", () => process.exit(130));
    process.on("SIGTERM", () => process.exit(143));
    return true;
  } catch {
    const pidRaw = String(fs.readFileSync(LOCK_PATH, "utf8") ?? "").trim();
    const pid = Number(pidRaw);
    const pidValid = Number.isFinite(pid) && pid > 0;
    const isRunning = (() => {
      if (!pidValid) return false;
      try { process.kill(pid, 0); return true; } catch { return false; }
    })();
    if (!isRunning) {
      try { fs.unlinkSync(LOCK_PATH); } catch {}
      return acquireLock();
    }
    throw new Error(
      `Another tools_activate_action eval runner seems to be running (lock=${LOCK_PATH} pid=${pidRaw}). ` +
      `Stop it first or delete the lock file if stale.`,
    );
  }
}

function getLocalSupabaseStatus() {
  const repoRoot = path.resolve(process.cwd(), "..");
  const raw = execSync("npx --yes supabase@latest status --output json", {
    encoding: "utf8",
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "ignore"],
  });
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

async function ensureMasterAdminSession({ url, anonKey, serviceRoleKey }) {
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const authed = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const email = String(process.env.SOPHIA_MASTER_ADMIN_EMAIL ?? "thomasgenty15@gmail.com").trim();
  const password = String(process.env.SOPHIA_MASTER_ADMIN_PASSWORD ?? "123456").trim();
  const allowResetPassword = String(process.env.SOPHIA_MASTER_ADMIN_RESET_PASSWORD ?? "").trim() === "1";

  let { data: signIn, error: signErr } = await authed.auth.signInWithPassword({ email, password });
  if (signErr || !signIn.session?.access_token || !signIn.user?.id) {
    const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200, page: 1 });
    if (listErr) throw listErr;
    const found = (listed?.users ?? []).find((u) => String(u.email ?? "").toLowerCase() === email.toLowerCase());
    if (!found?.id) {
      const { error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "Master Admin (local)" },
      });
      if (createErr) throw createErr;
    } else if (allowResetPassword) {
      const { error: updErr } = await admin.auth.admin.updateUserById(found.id, { password });
      if (updErr) throw updErr;
    } else {
      throw new Error(`[Auth] Cannot sign in as master admin (${email}). Set SOPHIA_MASTER_ADMIN_PASSWORD or allow reset.`);
    }
    const { data: signIn2, error: signErr2 } = await authed.auth.signInWithPassword({ email, password });
    if (signErr2 || !signIn2.session?.access_token) throw signErr2 ?? new Error("Missing access_token after sign-in");
    signIn = signIn2;
  }

  await admin.from("internal_admins").upsert({ user_id: signIn.user.id });
  return { accessToken: signIn.session.access_token };
}

function curlInvokeRunEvals({ url, anonKey, accessToken, body }) {
  const tmp = `/tmp/sophia_run_evals_${Date.now()}_${Math.random().toString(16).slice(2)}.json`;
  fs.writeFileSync(tmp, JSON.stringify(body ?? {}, null, 0), "utf8");
  try {
    const MARK = "__HTTP_CODE__:";
    const args = [
      "-sS",
      "--max-time",
      "1200",
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
      "--write-out",
      `\n${MARK}%{http_code}\n`,
    ];
    const res = spawnSync("curl", args, { encoding: "utf8" });
    if (res.error) throw res.error;
    const out = String(res.stdout ?? "");
    if ((res.status ?? 0) !== 0) {
      throw new Error(
        `curl failed (status=${res.status ?? "null"}):\n` +
          `stderr=${String(res.stderr ?? "").slice(0, 1200)}\n` +
          `stdout=${out.slice(0, 1200)}`,
      );
    }
    const idx = out.lastIndexOf(`\n${MARK}`);
    const rawJson = (idx >= 0 ? out.slice(0, idx) : out).trim();
    const httpCode = idx >= 0 ? out.slice(idx + (`\n${MARK}`).length).trim() : "unknown";
    if (!rawJson) throw new Error(`Empty response body from run-evals (http=${httpCode}).`);
    if (String(httpCode) !== "200") throw new Error(`run-evals http=${httpCode} body=${rawJson.slice(0, 1600)}`);
    try { return JSON.parse(rawJson); } catch { throw new Error(`Non-JSON response from run-evals (http=${httpCode}):\n${rawJson.slice(0, 1200)}`); }
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

function sleepMs(ms) {
  const sab = new SharedArrayBuffer(4);
  const ia = new Int32Array(sab);
  Atomics.wait(ia, 0, 0, ms);
}

function tryParseRunEvalsErrorBody(msg) {
  const m = String(msg ?? "");
  const idx = m.indexOf(" body=");
  if (idx < 0) return null;
  const raw = m.slice(idx + " body=".length).trim();
  try { return JSON.parse(raw); } catch { return null; }
}

async function main() {
  acquireLock();
  const st0 = getLocalSupabaseStatus();
  const st = normalizeSupabaseStatusKeys(st0);
  const url = st.API_URL;
  const anonKey = st.ANON_KEY;
  const serviceRoleKey = st.SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) throw new Error("Missing local Supabase status keys");

  const { accessToken } = await ensureMasterAdminSession({ url, anonKey, serviceRoleKey });

  const scenarioPath = path.join(process.cwd(), "eval", "scenarios", "tools", "tools_activate_action_ai_user.json");
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf8"));

  const limits = {
    max_scenarios: 1,
    max_turns_per_scenario: 14,
    bilan_actions_count: 0,
    test_post_checkup_deferral: false,
    user_difficulty: "mid",
    stop_on_first_failure: false,
    budget_usd: 0,
    model: "gemini-2.5-flash",
    use_real_ai: true,
    judge_force_real_ai: true,
    use_pre_generated_plans: true,
    pre_generated_plans_required: true,
    plan_bank_theme_key: "ENERGY",
    keep_test_user: true,
  };

  let data = null;
  let lastErr = null;
  let lastErrBody = null;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const requestId = crypto.randomUUID();
    try {
      const body = { request_id: requestId, scenarios: [scenario], limits };
      data = curlInvokeRunEvals({ url, anonKey, accessToken, body });
      lastErr = null;
      lastErrBody = null;
      break;
    } catch (e) {
      lastErr = e;
      lastErrBody = tryParseRunEvalsErrorBody(e?.message);
      const msg = String(e?.message ?? e);
      const nonRetryable =
        msg.includes("Forbidden") ||
        msg.includes("Unauthorized") ||
        msg.includes("simulate-user failed: invalid output after rescue");
      if (nonRetryable) break;
      if (attempt < 6) sleepMs(800 + attempt * 250);
    }
  }

  const res0 = Array.isArray(data?.results) ? data.results[0] : null;
  const out = {
    ok: Boolean(data?.success) && !lastErr,
    request_id: data?.request_id ?? null,
    eval_run_id: res0?.eval_run_id ?? null,
    test_user_id: res0?.test_user_id ?? null,
    issues_count: res0?.issues_count ?? null,
    suggestions_count: res0?.suggestions_count ?? null,
    ...(lastErr
      ? { error: String(lastErrBody?.error ?? lastErr?.message ?? lastErr).slice(0, 1600) }
      : (!data?.success ? { error: String(data?.error ?? data?.detail ?? JSON.stringify(data ?? {})).slice(0, 1600) } : {})),
  };
  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({
    ok: false,
    request_id: null,
    eval_run_id: null,
    test_user_id: null,
    issues_count: null,
    suggestions_count: null,
    error: String(e?.message ?? e),
  }, null, 2));
  process.exitCode = 1;
});


