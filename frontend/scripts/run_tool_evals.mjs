import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function parseArgs(argv) {
  const out = {
    // Default: test 3.0 flash first (as requested).
    model: "gemini-3-flash-preview",
    turns: 6,
    scenario: null,
    // Optional: when a scenario file contains `variants`, pick:
    // - null/"random": randomly (default)
    // - "all": expand into all variants
    // - "<variant_id>": pick a specific variant
    variant: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--model") out.model = String(argv[++i] ?? out.model);
    else if (a === "--turns") out.turns = Number(argv[++i] ?? "6") || 6;
    else if (a === "--scenario") out.scenario = String(argv[++i] ?? "").trim() || null;
    else if (a === "--variant") out.variant = String(argv[++i] ?? "").trim() || null;
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

function materializeScenarioVariants({ scenario, filePath, variant }) {
  const baseId = String(scenario?.id ?? path.basename(filePath, ".json")).trim() || path.basename(filePath, ".json");
  const variants = Array.isArray(scenario?.variants) ? scenario.variants : [];
  if (variants.length === 0) return [scenario];

  const requested = String(variant ?? "").trim().toLowerCase();
  const pickOne = (v) => {
    const vid = String(v?.id ?? "").trim() || "variant";
    const out = { ...(scenario ?? {}) };
    delete out.variants;
    out.steps = Array.isArray(v?.steps) ? v.steps : out.steps;
    if (v && typeof v === "object") {
      if (v.assertions && typeof v.assertions === "object") out.assertions = v.assertions;
      if (v.mechanical_assertions && typeof v.mechanical_assertions === "object") out.mechanical_assertions = v.mechanical_assertions;
      if (v.setup && typeof v.setup === "object") out.setup = v.setup;
      if (v.scenario_target != null) out.scenario_target = v.scenario_target;
      if (Array.isArray(v.tags)) out.tags = v.tags;
    }
    out.id = `${baseId}__${vid}`;
    out.description = `${String(out.description ?? "").trim()} [variant=${vid}]`.trim();
    return out;
  };

  if (!requested || requested === "random") {
    const pick = variants[Math.floor(Math.random() * variants.length)];
    return [pickOne(pick)];
  }

  if (requested === "all") {
    return variants.map(pickOne);
  }

  const found = variants.find((v) => String(v?.id ?? "").trim().toLowerCase() === requested);
  if (!found) {
    const avail = variants.map((v) => String(v?.id ?? "").trim()).filter(Boolean).join(", ");
    throw new Error(`[Runner] Unknown --variant "${variant}" for scenario "${baseId}". Available: ${avail || "(none)"}`);
  }
  return [pickOne(found)];
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
    const requestId = String(body?.limits?._run_request_id ?? crypto.randomUUID());
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
      "-H",
      `x-request-id: ${requestId}`,
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
      const err = json.error;
      const detail = typeof err === "string" ? err : JSON.stringify(err);
      throw new Error(`run-evals error: ${detail.slice(0, 800)}`);
    }
    return json;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {}
  }
}

function getSupabaseCredentials() {
  // STAGING/PROD MODE: Use environment variables if SOPHIA_EVAL_REMOTE=1
  const useRemote = parseBoolEnv(process.env.SOPHIA_EVAL_REMOTE);
  if (useRemote) {
    const url = process.env.SOPHIA_SUPABASE_URL;
    const anonKey = process.env.SOPHIA_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SOPHIA_SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceRoleKey) {
      throw new Error(
        "SOPHIA_EVAL_REMOTE=1 but missing credentials. Set:\n" +
        "  SOPHIA_SUPABASE_URL=https://xxx.supabase.co\n" +
        "  SOPHIA_SUPABASE_ANON_KEY=eyJ...\n" +
        "  SOPHIA_SUPABASE_SERVICE_ROLE_KEY=eyJ..."
      );
    }
    console.log(`[Runner] Using REMOTE Supabase: ${url}`);
    return { url, anonKey, serviceRoleKey };
  }

  // LOCAL MODE: Use supabase status (default)
  const st0 = getLocalSupabaseStatus();
  const st = normalizeSupabaseStatusKeys(st0);
  console.log(`[Runner] Using LOCAL Supabase: ${st.API_URL}`);
  return { url: st.API_URL, anonKey: st.ANON_KEY, serviceRoleKey: st.SERVICE_ROLE_KEY };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f0e4cdf2-e090-4c26-80a9-306daf5df797',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-run',hypothesisId:'H1',location:'run_tool_evals.mjs:main:args',message:'parsed args',data:{scenario:args.scenario,turns:args.turns,model:args.model},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const { url, anonKey, serviceRoleKey } = getSupabaseCredentials();
  if (!url || !anonKey || !serviceRoleKey) throw new Error("Missing Supabase credentials (url / anonKey / serviceRoleKey)");

  const { accessToken } = await ensureMasterAdminSession({ url, anonKey, serviceRoleKey });

  const files = listScenarioFiles();
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f0e4cdf2-e090-4c26-80a9-306daf5df797',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-run',hypothesisId:'H1',location:'run_tool_evals.mjs:main:files',message:'scenario files discovered',data:{files_count:files.length,files_sample:files.slice(0,5).map((f)=>path.basename(f))},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (files.length === 0) throw new Error("No tool scenarios found in frontend/eval/scenarios/tools");

  const selected = args.scenario
    ? files.filter((p) => path.basename(p, ".json") === args.scenario || path.basename(p).includes(args.scenario))
    : files;
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f0e4cdf2-e090-4c26-80a9-306daf5df797',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-run',hypothesisId:'H1',location:'run_tool_evals.mjs:main:selected',message:'scenario selection',data:{selected_count:selected.length,selected_sample:selected.slice(0,5).map((p)=>path.basename(p))},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const scenarios = selected
    .map((filePath) => {
      const scenario = loadScenario(filePath);
      return materializeScenarioVariants({ scenario, filePath, variant: args.variant });
    })
    .flat();
  const runRequestId = crypto.randomUUID();
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f0e4cdf2-e090-4c26-80a9-306daf5df797',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:runRequestId,hypothesisId:'H2',location:'run_tool_evals.mjs:main:scenarios',message:'scenarios loaded',data:{scenarios_count:scenarios.length,scenario_ids:scenarios.slice(0,5).map((s)=>s?.id ?? s?.name ?? s?.scenario_name ?? 'unknown')},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const limits = {
    max_scenarios: scenarios.length,
    max_turns_per_scenario: args.turns,
    // Tool evals may still want a bilan state machine (investigator) to be seeded.
    // Use scenario_target="bilan" (or explicit setup.bilan_actions_count) to request it.
    bilan_actions_count: (() => {
      const explicit = scenarios
        .map((s) => Number(s?.setup?.bilan_actions_count))
        .find((n) => Number.isFinite(n) && n >= 0);
      if (Number.isFinite(explicit)) return Math.floor(explicit);
      const wantsBilan = scenarios.some((s) => String(s?.scenario_target ?? "") === "bilan");
      return wantsBilan ? 1 : 0;
    })(),
    // Enable the post-checkup "parking lot" loop for scenarios that explicitly want it.
    // (This keeps default tool evals fast, but allows complex multi-machine tests to fully close.)
    test_post_checkup_deferral: scenarios.some((s) => Boolean(s?.setup?.test_post_checkup_deferral) || String(s?.scenario_target ?? "") === "bilan"),
    user_difficulty: "mid",
    stop_on_first_failure: false,
    budget_usd: 0,
    model: args.model,
    use_real_ai: true,
    // IMPORTANT (local dev):
    // Disable the Gemini qualitative judge by default. We do manual qualitative judging in Cursor (GPT-5.2)
    // because large inputs can degrade Gemini judge quality (fallbacks / truncation / overload).
    judge_force_real_ai: false,
    judge_async: false,
    // Manual qualitative judge (GPT in Cursor / human): do not generate issues/suggestions automatically.
    manual_judge: true,
    // Use the local file-based plan bank to avoid calling generate-plan during eval runs.
    use_pre_generated_plans: true,
    pre_generated_plans_required: true,
    // Keep a stable request id across chunked run-evals calls (resume across wall-clock kills).
    _run_request_id: runRequestId,
    // Keep each run-evals request under edge-runtime wall clock limits.
    max_wall_clock_ms_per_request: 150000,
  };
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f0e4cdf2-e090-4c26-80a9-306daf5df797',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:runRequestId,hypothesisId:'H3',location:'run_tool_evals.mjs:main:limits',message:'limits prepared',data:{max_scenarios:limits.max_scenarios,max_turns_per_scenario:limits.max_turns_per_scenario,test_post_checkup_deferral:limits.test_post_checkup_deferral,use_pre_generated_plans:limits.use_pre_generated_plans,pre_generated_plans_required:limits.pre_generated_plans_required,model:limits.model},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const isTransientUpstreamFailure = (d) => {
    const msg = String(d?.message ?? d?.error?.message ?? "");
    const raw = String(d?._raw ?? "");
    // Kong/edge-runtime hot reload or brief crashes can yield 502 or a non-JSON payload.
    return (
      /invalid response/i.test(msg) ||
      /upstream server/i.test(msg) ||
      /__HTTP_CODE__:(502|503|504)/i.test(msg) ||
      /\b(502|503|504)\b/.test(msg) ||
      /upstream prematurely closed connection/i.test(raw) ||
      /\b(502|503|504)\b/.test(raw) ||
      /Bad Gateway/i.test(raw)
    );
  };

  let data = null;
  for (let i = 0; i < 30; i++) {
    data = invokeRunEvalsJson({ url, anonKey, accessToken, body: { scenarios, limits } });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f0e4cdf2-e090-4c26-80a9-306daf5df797',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:runRequestId,hypothesisId:'H3',location:'run_tool_evals.mjs:main:invoke',message:'run-evals response chunk',data:{iteration:i,partial:Boolean(data?.partial),resume:Boolean(data?.resume),has_results_array:Array.isArray(data?.results),results_len:Array.isArray(data?.results)?data.results.length:null,keys:Object.keys(data ?? {}).slice(0,12)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (data?.partial === true || data?.resume === true) {
      // Chunked: continue.
      continue;
    }
    if (!Array.isArray(data?.results) && isTransientUpstreamFailure(data)) {
      // Retry with small backoff (local edge runtime can briefly return 502 during reload/crash/restart).
      const backoffMs = Math.min(10_000, 750 + i * 750);
      console.warn(`[Runner] transient upstream failure (retrying in ${backoffMs}ms): ${String(data?.message ?? data?._raw ?? "").slice(0, 180)}`);
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }
    break;
  }
  const results = Array.isArray(data?.results) ? data.results : [];
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f0e4cdf2-e090-4c26-80a9-306daf5df797',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:runRequestId,hypothesisId:'H4',location:'run_tool_evals.mjs:main:results',message:'final results summary',data:{results_count:results.length,stopped_reason:data?.stopped_reason,selected_scenarios:data?.selected_scenarios,ran:data?.ran,success:data?.success,error:data?.error},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!Array.isArray(data?.results)) {
    try {
      console.warn(`[Runner] run-evals returned no results array; keys=${Object.keys(data ?? {}).join(",")}`);
      if (data && typeof data === "object") {
        console.warn(
          `[Runner] run-evals response preview: ${
            JSON.stringify(
              {
                success: data.success,
                error: data.error,
                code: data.code,
                message: data.message,
                ran: data.ran,
                selected_scenarios: data.selected_scenarios,
                stopped_reason: data.stopped_reason,
              },
              null,
              0,
            )
          }`,
        );
      }
    } catch {}
  }
  // --- Auto export eval bundles (one folder per scenario run) ---
  const ensureDir = (p) => fs.mkdirSync(p, { recursive: true });
  const writeJson = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
  const nowIso = () => new Date().toISOString();
  const safeName = (s) => String(s ?? "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  const dumpCmdToFile = (cmd, outFile) => {
    const fd = fs.openSync(outFile, "w");
    try {
      const res = spawnSync("/bin/bash", ["-lc", cmd], { stdio: ["ignore", fd, fd], encoding: "utf8" });
      return { ok: res.status === 0, status: res.status ?? null, error: res.error?.message ?? null };
    } finally {
      fs.closeSync(fd);
    }
  };
  const curlJson = ({ url, headers, body, method = "GET" }) => {
    const args = ["-sS", "-X", method, url];
    for (const [k, v] of Object.entries(headers ?? {})) {
      args.push("-H", `${k}: ${v}`);
    }
    if (body != null) {
      args.push("-H", "Content-Type: application/json", "--data-binary", JSON.stringify(body));
    }
    const res = spawnSync("curl", args, { encoding: "utf8" });
    if (res.error) throw res.error;
    if ((res.status ?? 0) !== 0) throw new Error(`curl failed (status=${res.status ?? "null"}): ${(res.stderr ?? "").slice(0, 400)}`);
    const raw = String(res.stdout ?? "");
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return { _raw: raw };
    }
  };
  const fetchEvalRun = async ({ admin, evalRunId }) => {
    try {
      const { data: row, error } = await admin
        .from("conversation_eval_runs")
        .select("*")
        .eq("id", evalRunId)
        .maybeSingle();
      if (error) throw error;
      return row ?? null;
    } catch (e) {
      // Fallback: supabase-js can hit undici "fetch failed" in some local setups; use curl directly.
      const u = `${url}/rest/v1/conversation_eval_runs?id=eq.${encodeURIComponent(evalRunId)}&select=${encodeURIComponent("*")}&limit=1`;
      const json = curlJson({
        url: u,
        headers: {
          // Kong/PostgREST expects apikey=anon (even for service_role Authorization).
          apikey: anonKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      });
      if (Array.isArray(json) && json.length > 0) return json[0];
      if (json && typeof json === "object" && json.error) throw new Error(String(json.error));
      // keep original error context if curl returns nothing useful
      throw e;
    }
  };
  const fetchEvalEvents = async ({ admin, evalRunId }) => {
    try {
      const { data, error } = await admin
        .from("conversation_eval_events")
        .select("*")
        .eq("eval_run_id", evalRunId)
        .order("created_at", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    } catch (e) {
      const u = `${url}/rest/v1/conversation_eval_events?eval_run_id=eq.${encodeURIComponent(evalRunId)}&select=${encodeURIComponent("*")}&order=${encodeURIComponent("created_at.asc")}&limit=5000`;
      const json = curlJson({
        url: u,
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      });
      if (Array.isArray(json)) return json;
      if (json && typeof json === "object" && json.error) throw new Error(String(json.error));
      throw e;
    }
  };
  const fetchSystemErrorLogs = async ({ admin, sinceIso, requestIdPrefix }) => {
    let q = admin
      .from("system_error_logs")
      .select("id,created_at,severity,source,function_name,title,message,stack,request_id,user_id,metadata")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(500);
    if (requestIdPrefix) q = q.ilike("request_id", `${requestIdPrefix}%`);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  };
  const fetchProductionLog = async ({ admin, sinceIso }) => {
    const { data, error } = await admin.rpc("get_production_log", {
      p_since: sinceIso,
      p_only_errors: false,
      p_source: null,
      p_limit: 300,
      p_include_chat: false,
    });
    if (error) throw error;
    return data ?? [];
  };

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const startedAt = nowIso();
  const startEpochSec = Math.floor(Date.now() / 1000);
  const requestId = data?.request_id ?? runRequestId;
  // Unique per runner execution (so re-running the same scenario never overwrites a previous bundle)
  const runStamp = `${Date.now()}`;
  const runTag = safeName(`${runRequestId}`.slice(0, 8));

  // Even if run-evals returns no results (Kong "invalid upstream response"), we still want a bundle directory.
  const exportFailureBundle = async ({ reason }) => {
    const scenarioKey = args.scenario ?? (selected.length === 1 ? path.basename(selected[0], ".json") : "tools_bundle");
    const bundleTitle = safeName(`${scenarioKey}_${runStamp}_${runTag}_FAILED`);
    const bundleDir = path.join(process.cwd(), "test-results", `eval_bundle_${bundleTitle}`);
    ensureDir(bundleDir);

    writeJson(path.join(bundleDir, "supabase_status.json"), st);
    writeJson(path.join(bundleDir, "run_evals_response.json"), data ?? null);
    writeJson(path.join(bundleDir, "bundle_meta.json"), {
      kind: "eval_bundle_dir",
      ok: false,
      failure_reason: String(reason ?? "unknown_failure"),
      scenario_key: scenarioKey,
      eval_run_id: null,
      request_id: requestId ?? null,
      model: args.model,
      turns: args.turns,
      started_at: startedAt,
      finished_at: nowIso(),
      limits,
    });

    const sinceIso = new Date(Date.now() - 10 * 60_000).toISOString();
    try {
      const sysErrors = await fetchSystemErrorLogs({ admin, sinceIso, requestIdPrefix: requestId });
      writeJson(path.join(bundleDir, "system_error_logs.json"), sysErrors);
    } catch (e) {
      writeJson(path.join(bundleDir, "system_error_logs.json"), { ok: false, error: e?.message ?? String(e) });
    }
    try {
      const prod = await fetchProductionLog({ admin, sinceIso });
      writeJson(path.join(bundleDir, "production_log.json"), prod);
    } catch (e) {
      writeJson(path.join(bundleDir, "production_log.json"), { ok: false, error: e?.message ?? String(e) });
    }

    // Docker logs (best effort)
    const edgeContainer = "supabase_edge_runtime_Sophia_2";
    const kongContainer = "supabase_kong_Sophia_2";
    dumpCmdToFile(`docker logs --since ${startEpochSec} ${edgeContainer}`, path.join(bundleDir, "docker_edge_runtime.log"));
    dumpCmdToFile(`docker logs --since ${startEpochSec} ${kongContainer}`, path.join(bundleDir, "docker_kong.log"));
    dumpCmdToFile(`docker logs --tail 5000 ${edgeContainer}`, path.join(bundleDir, "docker_edge_runtime.tail.log"));
    dumpCmdToFile(`docker logs --tail 5000 ${kongContainer}`, path.join(bundleDir, "docker_kong.tail.log"));

    console.log(JSON.stringify({ ok: false, bundle_dir: bundleDir, reason: String(reason ?? "") }, null, 2));
    return bundleDir;
  };

  for (const r of results) {
    const evalRunId = r?.eval_run_id;
    const scenarioKey = r?.scenario_key;
    if (!evalRunId) continue;
    const bundleTitle = safeName(`${scenarioKey || "scenario"}_${evalRunId}_${runStamp}_${runTag}`);
    const bundleDir = path.join(process.cwd(), "test-results", `eval_bundle_${bundleTitle}`);
    ensureDir(bundleDir);
    writeJson(path.join(bundleDir, "supabase_status.json"), st);
    writeJson(path.join(bundleDir, "run_evals_response.json"), data);
    writeJson(path.join(bundleDir, "bundle_meta.json"), {
      kind: "eval_bundle_dir",
      scenario_key: scenarioKey ?? null,
      eval_run_id: evalRunId,
      request_id: requestId ?? null,
      model: args.model,
      turns: args.turns,
      started_at: startedAt,
      finished_at: nowIso(),
      limits,
    });
    try {
      const row = await fetchEvalRun({ admin, evalRunId });
      writeJson(path.join(bundleDir, "conversation_eval_run.json"), row);
    } catch (e) {
      writeJson(path.join(bundleDir, "conversation_eval_run.json"), { ok: false, error: e?.message ?? String(e) });
    }
    try {
      const evs = await fetchEvalEvents({ admin, evalRunId });
      writeJson(path.join(bundleDir, "conversation_eval_events.json"), evs);
    } catch (e) {
      writeJson(path.join(bundleDir, "conversation_eval_events.json"), { ok: false, error: e?.message ?? String(e) });
    }
    const sinceIso = new Date(Date.now() - 10 * 60_000).toISOString();
    try {
      const sysErrors = await fetchSystemErrorLogs({ admin, sinceIso, requestIdPrefix: requestId });
      writeJson(path.join(bundleDir, "system_error_logs.json"), sysErrors);
    } catch (e) {
      writeJson(path.join(bundleDir, "system_error_logs.json"), { ok: false, error: e?.message ?? String(e) });
    }
    try {
      const prod = await fetchProductionLog({ admin, sinceIso });
      writeJson(path.join(bundleDir, "production_log.json"), prod);
    } catch (e) {
      writeJson(path.join(bundleDir, "production_log.json"), { ok: false, error: e?.message ?? String(e) });
    }
    // Docker logs (best effort)
    const edgeContainer = "supabase_edge_runtime_Sophia_2";
    const kongContainer = "supabase_kong_Sophia_2";
    dumpCmdToFile(`docker logs --since ${startEpochSec} ${edgeContainer}`, path.join(bundleDir, "docker_edge_runtime.log"));
    dumpCmdToFile(`docker logs --since ${startEpochSec} ${kongContainer}`, path.join(bundleDir, "docker_kong.log"));
    dumpCmdToFile(`docker logs --tail 5000 ${edgeContainer}`, path.join(bundleDir, "docker_edge_runtime.tail.log"));
    dumpCmdToFile(`docker logs --tail 5000 ${kongContainer}`, path.join(bundleDir, "docker_kong.tail.log"));
    console.log(JSON.stringify({ ok: true, eval_run_id: evalRunId, scenario_key: scenarioKey ?? null, bundle_dir: bundleDir }, null, 2));
  }

  // Keep the main runner output minimal (manual analysis is done from the bundle artifacts).
  if (!Array.isArray(data?.results) || results.length === 0) {
    const msg = String(data?.message ?? data?.error?.message ?? "");
    const reason = msg || "run-evals returned no results (likely Kong/edge upstream invalid response)";
    await exportFailureBundle({ reason });
    console.log(JSON.stringify({ ok: false, results_count: 0, results: [], error: reason }, null, 2));
    return;
  }

  console.log(JSON.stringify({ ok: true, results_count: results.length, results: results.map((r) => ({ ...r, issues_count: null, suggestions_count: null })) }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


