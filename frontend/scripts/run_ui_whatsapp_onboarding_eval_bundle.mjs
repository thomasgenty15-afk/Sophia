import { createClient } from "@supabase/supabase-js";
import { execSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// WhatsApp onboarding eval runner (bundle)
// - Selects random WhatsApp webhook onboarding scenarios (mechanical)
// - Runs them through `run-evals` (which calls `whatsapp-webhook` internally when channel="whatsapp")
// - Exports a bundle per eval_run_id (same structure as bilan bundle)

function getLocalSupabaseStatus() {
  // NOTE: We prefer a recent Supabase CLI because older global installs can reject newer config
  // fields (e.g. db.major_version = 17) and make the eval runner fail before it starts.
  //
  // You can override the CLI command used here:
  //   SOPHIA_SUPABASE_CLI="supabase" npm run eval:wa:onboarding:bundle -- ...
  const repoRoot = path.resolve(process.cwd(), "..");
  const supabaseCli = String(process.env.SOPHIA_SUPABASE_CLI ?? "npx --yes supabase@latest").trim();
  const raw = execSync(`${supabaseCli} status --output json`, { encoding: "utf8", cwd: repoRoot });
  const st = JSON.parse(raw);
  return normalizeSupabaseStatusKeys(st);
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
  // Newer supabase CLI can output ES256 anon/service keys, but local GoTrue (auth) in our setup
  // only accepts HS256 ("JWT_SECRET"). When that happens, auth.admin.* fails with:
  //   signing method ES256 is invalid
  //
  // To make the eval runner robust, if keys aren't HS256 and JWT_SECRET is present, we mint
  // compatible HS256 keys on-the-fly and use those for the run.
  const anonAlg = decodeJwtAlg(st?.ANON_KEY);
  const serviceAlg = decodeJwtAlg(st?.SERVICE_ROLE_KEY);
  if (anonAlg === "HS256" && serviceAlg === "HS256") return st;

  const jwtSecret = String(st?.JWT_SECRET ?? "").trim();
  if (!jwtSecret) return st;

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 365 * 10; // 10 years
  const iss = "supabase-demo";

  const anonKey = signJwtHs256({ secret: jwtSecret, payload: { iss, role: "anon", exp } });
  const serviceRoleKey = signJwtHs256({ secret: jwtSecret, payload: { iss, role: "service_role", exp } });
  return { ...st, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceRoleKey };
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

function nowIso() {
  return new Date().toISOString();
}

function dumpCmdToFile(cmd, outFile) {
  const fd = fs.openSync(outFile, "w");
  try {
    const res = spawnSync("/bin/bash", ["-lc", cmd], { stdio: ["ignore", fd, fd], encoding: "utf8" });
    return { ok: res.status === 0, status: res.status ?? null, error: res.error?.message ?? null };
  } finally {
    fs.closeSync(fd);
  }
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeExec(cmd) {
  try {
    return { ok: true, stdout: execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    return {
      ok: false,
      error: e?.message ?? String(e),
      stdout: e?.stdout?.toString?.() ?? "",
      stderr: e?.stderr?.toString?.() ?? "",
    };
  }
}

function parseBoolEnv(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}

function parseArgs(argv) {
  const out = {
    tests: 5,
    seed: null,
    turns: 8,
    model: "gemini-2.5-flash",
    timeoutMs: 600000,
    scenario: null,
    suite: "post_optin_v2",
    exclude: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tests") out.tests = Number(argv[++i] ?? "5") || 5;
    else if (a === "--seed") out.seed = String(argv[++i] ?? "").trim() || null;
    else if (a === "--turns") out.turns = Number(argv[++i] ?? "8") || 8;
    else if (a === "--model") out.model = String(argv[++i] ?? out.model);
    else if (a === "--timeout-ms") out.timeoutMs = Number(argv[++i] ?? "600000") || 600000;
    else if (a === "--scenario") out.scenario = String(argv[++i] ?? "").trim() || null;
    else if (a === "--suite") out.suite = String(argv[++i] ?? "").trim() || out.suite;
    else if (a === "--exclude") {
      const raw = String(argv[++i] ?? "").trim();
      if (raw) out.exclude.push(...raw.split(",").map((s) => s.trim()).filter(Boolean));
    }
  }
  out.tests = Math.max(1, Math.min(50, Math.floor(out.tests)));
  out.turns = Math.max(1, Math.min(50, Math.floor(out.turns)));
  out.suite = String(out.suite || "post_optin_v2").trim() || "post_optin_v2";
  out.exclude = Array.from(new Set((out.exclude ?? []).map((s) => String(s).trim()).filter(Boolean)));
  return out;
}

function mulberry32(seedInt) {
  let a = seedInt >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedToInt(seed) {
  const s = String(seed ?? "").trim();
  if (!s) return Math.floor(Math.random() * 1e9);
  // simple string hash
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function ensureMasterAdminSession({ url, anonKey, serviceRoleKey }) {
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const email = (process.env.SOPHIA_MASTER_ADMIN_EMAIL ?? "thomasgenty15@gmail.com").trim();
  const password = String(process.env.SOPHIA_MASTER_ADMIN_PASSWORD ?? "123456").trim();
  const allowResetPassword = parseBoolEnv(process.env.SOPHIA_MASTER_ADMIN_RESET_PASSWORD);

  const authed = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  {
    const { data: signIn, error: signInErr } = await authed.auth.signInWithPassword({ email, password });
    if (!signInErr && signIn.session?.access_token) return { authed, admin, email, accessToken: signIn.session.access_token };
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

  const { data: signIn2, error: signInErr2 } = await authed.auth.signInWithPassword({ email, password });
  if (signInErr2) throw signInErr2;
  if (!signIn2.session?.access_token) throw new Error("Missing access_token after sign-in");
  return { authed, admin, email, accessToken: signIn2.session.access_token };
}

function curlInvokeFunctionJson({ url, anonKey, accessToken, fnName, body, timeoutMs, requestId }) {
  const tmp = `/tmp/sophia_${fnName}_${Date.now()}_${Math.random().toString(16).slice(2)}.json`;
  fs.writeFileSync(tmp, JSON.stringify(body ?? {}, null, 0), "utf8");
  try {
    const maxTimeSec = Math.max(60, Math.ceil((timeoutMs ?? 600000) / 1000) + 60);
    const args = [
      "-sS",
      "--max-time",
      String(maxTimeSec),
      "-X",
      "POST",
      `${url}/functions/v1/${fnName}`,
      "-H",
      "Content-Type: application/json",
      ...(requestId ? ["-H", `x-request-id: ${requestId}`] : []),
      "-H",
      `Authorization: Bearer ${accessToken}`,
      "-H",
      `apikey: ${anonKey}`,
      "--data-binary",
      `@${tmp}`,
    ];
    const res = spawnSync("curl", args, { encoding: "utf8" });
    if (res.error) throw res.error;
    if ((res.status ?? 0) !== 0) throw new Error(`curl failed (status=${res.status ?? "null"}): ${String(res.stderr ?? "").slice(0, 400)}`);
    return JSON.parse(String(res.stdout ?? "{}"));
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {}
  }
}

async function invokeWithRetry({ url, anonKey, accessToken, fnName, body, timeoutMs, requestId, maxAttempts = 4 }) {
  let last = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const out = curlInvokeFunctionJson({ url, anonKey, accessToken, fnName, body, timeoutMs, requestId });
    last = out;
    const code = out?.code || out?.error?.code || null;
    const msg = out?.message || out?.error?.message || out?.error || "";
    const isBadJwtEnv =
      code === "BAD_JWT_ENV" ||
      /bad_jwt/i.test(String(msg)) ||
      /invalid jwt/i.test(String(msg)) ||
      /signing method es256/i.test(String(msg));
    const isWorkerLimit = code === "WORKER_LIMIT" || /WORKER_LIMIT/i.test(String(msg));
    const isBootError = code === "BOOT_ERROR" || /failed to boot/i.test(String(msg)) || /BOOT_ERROR/i.test(String(msg));
    const isUpstreamTimeout =
      /upstream server is timing out/i.test(String(msg)) ||
      /timing out/i.test(String(msg));
    const isInternalError = String(msg).trim() === "Internal Server Error";
    if (!isBadJwtEnv && !isWorkerLimit && !isBootError && !isUpstreamTimeout && !isInternalError && !out?.error) return out;

    const backoff = Math.min(6000, 800 * attempt);
    console.warn(`[Runner] ${fnName} retryable attempt=${attempt}/${maxAttempts} code=${code ?? "n/a"} backoff_ms=${backoff} msg=${String(msg).slice(0, 180)}`);
    if (isBadJwtEnv) {
      // Local flake: edge runtime sometimes boots with stale SUPABASE_* keys (ES256), which breaks auth.admin.
      safeExec(`cd "${path.join(process.cwd(), "..")}" && ./scripts/supabase_local.sh restart`);
    } else if (isUpstreamTimeout || isBootError) {
      // Give Kong/edge-runtime time to come back after restarts.
      // Also best-effort increase function timeout to match the CLI runner.
      const timeoutScript = path.join(process.cwd(), "..", "scripts", "local_extend_kong_functions_timeout.sh");
      if (fs.existsSync(timeoutScript)) safeExec(`TIMEOUT_MS=${timeoutMs ?? 600000} "${timeoutScript}"`);
    }
    if (attempt < maxAttempts) await sleepMs(backoff);
  }
  return last;
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

async function fetchSystemErrorLogs({ url, serviceRoleKey, sinceIso, requestIdPrefix }) {
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let q = admin
    .from("system_error_logs")
    .select("id,created_at,request_id,function_name,source,message,metadata")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (requestIdPrefix) q = q.ilike("request_id", `${requestIdPrefix}%`);
  const { data, error } = await q;
  if (error) throw error;
  return { ok: true, since_iso: sinceIso, request_id_prefix: requestIdPrefix ?? null, rows: data ?? [] };
}

async function fetchProductionLog({ url, serviceRoleKey, sinceIso }) {
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin
    .from("production_log")
    .select("*")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) throw error;
  return { ok: true, since_iso: sinceIso, rows: data ?? [] };
}

function listScenarioFiles() {
  const dir = path.join(process.cwd(), "eval", "scenarios", "whatsapp_onboarding");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  return files.map((f) => path.join(dir, f));
}

function loadScenario(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function scenarioEligible({ scenario, filePath, suite }) {
  const sc = scenario ?? {};
  const target = String(sc.scenario_target ?? "").trim().toLowerCase();
  const id = String(sc.id ?? path.basename(filePath, ".json"));
  const setup = sc.setup ?? {};
  const optedIn = setup?.whatsapp_opted_in;
  const waSteps = Array.isArray(sc.wa_steps) ? sc.wa_steps : [];

  // Default suite: only scenarios that start right after OPTIN_V2 ("c'est bien moi" / OPTIN_YES / wrong number),
  // i.e. setup.whatsapp_opted_in is explicitly false (pre-optin). This avoids mid-state unit tests
  // like awaiting_personal_fact / open_chat, unless explicitly requested via --scenario or --suite all.
  if (String(suite).toLowerCase() === "post_optin_v2") {
    if (target !== "onboarding") return false;
    if (optedIn !== false) return false;
    if (waSteps.length < 1) return false;
    return true;
  }

  // All scenarios (legacy behavior)
  return true;
}

function isExcluded({ scenario, filePath, exclude }) {
  const sc = scenario ?? {};
  const id = String(sc.id ?? path.basename(filePath, ".json"));
  const fileBase = path.basename(filePath);
  const hay = `${id} ${fileBase} ${filePath}`.toLowerCase();
  const patterns = Array.isArray(exclude) ? exclude : [];
  if (patterns.length === 0) return false;
  return patterns.some((p) => hay.includes(String(p).toLowerCase()));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const st = getLocalSupabaseStatus();
  const url = st.API_URL;
  const anonKey = st.ANON_KEY;
  const serviceRoleKey = st.SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) throw new Error("Missing local Supabase status keys (API_URL / ANON_KEY / SERVICE_ROLE_KEY)");

  const { accessToken } = await ensureMasterAdminSession({ url, anonKey, serviceRoleKey });

  const files = listScenarioFiles();
  const selectedFiles = (() => {
    if (args.scenario) {
      // Explicit scenario: no suite filtering (user knows what they want).
      return files
        .filter((p) => path.basename(p, ".json") === args.scenario || path.basename(p).includes(args.scenario))
        .filter((p) => !isExcluded({ scenario: loadScenario(p), filePath: p, exclude: args.exclude }));
    }

    // Default: curated suite to match the “post OPTIN_V2” onboarding flow.
    const filtered = files
      .filter((p) => scenarioEligible({ scenario: loadScenario(p), filePath: p, suite: args.suite }))
      .filter((p) => !isExcluded({ scenario: loadScenario(p), filePath: p, exclude: args.exclude }));
    if (filtered.length > 0) return filtered;

    // Fallback: legacy behavior (all), still respecting excludes
    return files.filter((p) => !isExcluded({ scenario: loadScenario(p), filePath: p, exclude: args.exclude }));
  })();
  if (selectedFiles.length === 0) throw new Error("No WhatsApp onboarding scenarios found (after --scenario filter)");

  const seedInt = seedToInt(args.seed ?? "");
  const rand = mulberry32(seedInt);

  for (let i = 0; i < args.tests; i++) {
    const pick = selectedFiles[Math.floor(rand() * selectedFiles.length)];
    const baseScenario = loadScenario(pick);
    const runSuffix = `run_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const scenario = {
      ...baseScenario,
      id: `${baseScenario.id}__${runSuffix}`,
      base_scenario_id: baseScenario.id,
    };

    // Ensure --turns behaves like an actual target length for WhatsApp runs:
    // If a scenario has fewer wa_steps than max turns, automatically enable simulate-user loopback
    // unless the scenario explicitly opted out (wa_auto_simulate=false).
    if (String(scenario.channel ?? "").toLowerCase() === "whatsapp") {
      const waStepsLen = Array.isArray(scenario.wa_steps) ? scenario.wa_steps.length : 0;
      const wantsLongRun = Number(args.turns ?? 0) > waStepsLen;
      const explicitNoAuto = scenario.wa_auto_simulate === false;
      if (wantsLongRun && !explicitNoAuto) {
        scenario.wa_auto_simulate = true;
        scenario.wa_force_turns = true;
      }
    }

    const startIso = nowIso();
    const startMs = Date.now();
    const startEpochSec = Math.floor(startMs / 1000);

    const limits = {
      max_scenarios: 1,
      max_turns_per_scenario: args.turns,
      bilan_actions_count: 0,
      test_post_checkup_deferral: false,
      user_difficulty: "mid",
      stop_on_first_failure: false,
      budget_usd: 0,
      model: args.model,
      use_real_ai: true,
      judge_force_real_ai: true,
      use_pre_generated_plans: true,
      pre_generated_plans_required: true,
    };

    const stableRequestId = `wa_onboarding_bundle:${scenario.id}:i${i}:s${seedInt}`;
    const runData = await invokeWithRetry({
      url,
      anonKey,
      accessToken,
      fnName: "run-evals",
      body: { scenarios: [scenario], limits },
      timeoutMs: args.timeoutMs,
      requestId: stableRequestId,
      maxAttempts: 4,
    });

    const durationMs = Date.now() - startMs;
    const requestId = runData?.request_id ?? null;
    const res0 = Array.isArray(runData?.results) ? runData.results[0] : null;
    const evalRunId = res0?.eval_run_id ?? null;
    if (!evalRunId) {
      console.error("run-evals raw response:", JSON.stringify(runData, null, 2));
      throw new Error("Missing eval_run_id in run-evals response");
    }

    const bundleDir = path.join(process.cwd(), "test-results", `eval_bundle_${evalRunId}`);
    ensureDir(bundleDir);

    writeJson(path.join(bundleDir, "supabase_status.json"), st);
    writeJson(path.join(bundleDir, "run_evals_response.json"), runData);
    writeJson(path.join(bundleDir, "bundle_meta.json"), {
      started_at: startIso,
      finished_at: nowIso(),
      duration_ms: durationMs,
      request_id: requestId,
      eval_run_id: evalRunId,
      scenario_id: scenario.id,
      base_scenario_id: baseScenario.id,
      scenario_file: pick,
      random_seed: args.seed ?? null,
      random_seed_int: seedInt,
      iteration: i,
      limits,
    });

    const evalRow = await fetchEvalRun({ url, serviceRoleKey, evalRunId });
    writeJson(path.join(bundleDir, "conversation_eval_run.json"), evalRow);

    const sinceIso = new Date(Date.now() - Math.max(60_000, durationMs + 30_000)).toISOString();
    const sysErrors = await fetchSystemErrorLogs({ url, serviceRoleKey, sinceIso, requestIdPrefix: requestId });
    writeJson(path.join(bundleDir, "system_error_logs.json"), sysErrors);

    try {
      const prodLog = await fetchProductionLog({ url, serviceRoleKey, sinceIso });
      writeJson(path.join(bundleDir, "production_log.json"), prodLog);
    } catch (e) {
      writeJson(path.join(bundleDir, "production_log.json"), { ok: false, error: e?.message ?? String(e) });
    }

    // Docker logs (optional, but very useful for debugging parity with bilan bundles)
    const edgeContainer = "supabase_edge_runtime_Sophia_2";
    const kongContainer = "supabase_kong_Sophia_2";
    const edgeLogFile = path.join(bundleDir, "docker_edge_runtime.log");
    const kongLogFile = path.join(bundleDir, "docker_kong.log");
    dumpCmdToFile(`docker logs --since ${startEpochSec} ${edgeContainer}`, edgeLogFile);
    dumpCmdToFile(`docker logs --since ${startEpochSec} ${kongContainer}`, kongLogFile);

    const edgeTailFile = path.join(bundleDir, "docker_edge_runtime.tail.log");
    const kongTailFile = path.join(bundleDir, "docker_kong.tail.log");
    dumpCmdToFile(`docker logs --tail 5000 ${edgeContainer}`, edgeTailFile);
    dumpCmdToFile(`docker logs --tail 5000 ${kongContainer}`, kongTailFile);

    console.log(JSON.stringify({ ok: true, eval_run_id: evalRunId, request_id: requestId, bundle_dir: bundleDir }, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


