import { createClient } from "@supabase/supabase-js";
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// NOTE:
// We avoid relying on Node's fetch here because long-running Edge Functions can hit client-side
// header timeouts depending on runtime/version. Instead, we invoke run-evals via curl with a
// generous --max-time (local-only).

function getLocalSupabaseStatus() {
  const raw = execSync("supabase status --output json", { encoding: "utf8" });
  return JSON.parse(raw);
}

function jwtAlgFromToken(token) {
  try {
    const p0 = String(token ?? "").split(".")[0];
    if (!p0) return null;
    const header = JSON.parse(Buffer.from(p0, "base64url").toString("utf8"));
    return header?.alg ?? null;
  } catch {
    return null;
  }
}

function getEdgeRuntimeEnvJwtAlg({ container = "supabase_edge_runtime_Sophia_2", envKey }) {
  try {
    const out = execSync(`docker inspect ${container} --format '{{range .Config.Env}}{{println .}}{{end}}'`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const line = String(out)
      .split("\n")
      .find((l) => l.startsWith(`${envKey}=`));
    if (!line) return null;
    const val = line.slice(envKey.length + 1);
    return jwtAlgFromToken(val);
  } catch {
    return null;
  }
}

function inspectLocalEdgeRuntimeKeys() {
  const serviceAlg = getEdgeRuntimeEnvJwtAlg({ envKey: "SUPABASE_SERVICE_ROLE_KEY" });
  const anonAlg = getEdgeRuntimeEnvJwtAlg({ envKey: "SUPABASE_ANON_KEY" });
  return { ok: serviceAlg === "HS256" && anonAlg === "HS256", serviceAlg, anonAlg };
}

function makeNonce() {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return String(rand).replace(/[^a-zA-Z0-9]/g, "").slice(0, 14);
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

function readJsonIfExists(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonAtomic(p, obj) {
  const tmp = `${p}.tmp_${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, p);
}

function maybeDeleteFile(p) {
  try { fs.unlinkSync(p); } catch {}
}

function hoursBetween(aIso, bIso) {
  try {
    const a = new Date(aIso).getTime();
    const b = new Date(bIso).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
    return Math.abs(b - a) / (1000 * 60 * 60);
  } catch {
    return Infinity;
  }
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

function dumpCmdToFile(cmd, outFile) {
  const fd = fs.openSync(outFile, "w");
  try {
    const res = spawnSync("/bin/bash", ["-lc", cmd], {
      stdio: ["ignore", fd, fd],
      encoding: "utf8",
    });
    return { ok: res.status === 0, status: res.status ?? null, error: res.error?.message ?? null };
  } finally {
    fs.closeSync(fd);
  }
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
    if ((res.status ?? 0) !== 0) {
      throw new Error(`curl failed (status=${res.status ?? "null"}): ${String(res.stderr ?? "").slice(0, 400)}`);
    }
    return JSON.parse(String(res.stdout ?? "{}"));
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBoolEnv(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}

async function invokeWithRetry({ url, anonKey, accessToken, fnName, body, timeoutMs, requestId, maxAttempts = 4 }) {
  let last = null;
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const out = curlInvokeFunctionJson({ url, anonKey, accessToken, fnName, body, timeoutMs, requestId });
      last = out;
      lastErr = null;
      const code = out?.code || out?.error?.code || null;
      const msg = out?.message || out?.error?.message || "";
      const isWorkerLimit = code === "WORKER_LIMIT" || /WORKER_LIMIT/i.test(String(msg));
      const isBootError = code === "BOOT_ERROR" || /failed to boot/i.test(String(msg)) || /BOOT_ERROR/i.test(String(msg));
      const isUpstreamInvalid = /invalid response/i.test(String(msg)) || /upstream server/i.test(String(msg));
      const isBadJwtEnv =
        code === "BAD_JWT_ENV" ||
        /bad_jwt/i.test(String(msg)) ||
        /invalid jwt/i.test(String(msg)) ||
        /signing method es256/i.test(String(msg));
      if (!isWorkerLimit && !isBootError && !isUpstreamInvalid && !isBadJwtEnv) return out;
      const backoff = Math.min(6000, 800 * attempt);
      console.warn(
        `[Runner] ${fnName} retryable error attempt=${attempt}/${maxAttempts} code=${code ?? "n/a"} backoff_ms=${backoff} msg=${String(msg).slice(0, 180)}`,
      );
      if (isBadJwtEnv) {
        // Local flake: edge runtime sometimes boots with stale SUPABASE_* keys (ES256), which breaks auth.admin in run-evals.
        // Force a restart and then retry.
        safeExec(`cd "${path.join(process.cwd(), "..")}" && ./scripts/supabase_local.sh restart`);
        const timeoutScript = path.join(process.cwd(), "..", "scripts", "local_extend_kong_functions_timeout.sh");
        if (fs.existsSync(timeoutScript)) safeExec(`TIMEOUT_MS=${timeoutMs ?? 600000} "${timeoutScript}"`);
      }
      if (attempt < maxAttempts) await sleepMs(backoff);
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message ?? e ?? "");
      // Transient infra flake cases (common right after local supabase restart):
      // - curl (52) Empty reply from server
      // - connection refused while Kong/edge-runtime is booting
      const isTransientCurl =
        /curl failed \(status=52\)/i.test(msg) ||
        /Empty reply from server/i.test(msg) ||
        /Couldn[’']t connect to server/i.test(msg) ||
        /Connection refused/i.test(msg);
      if (!isTransientCurl || attempt >= maxAttempts) throw e;
      const backoff = Math.min(6000, 800 * attempt);
      console.warn(`[Runner] ${fnName} transient curl error attempt=${attempt}/${maxAttempts} backoff_ms=${backoff} msg=${msg.slice(0, 180)}`);
      await sleepMs(backoff);
    }
  }
  if (last) return last;
  throw lastErr ?? new Error(`${fnName} failed (retries exhausted)`);
}

async function ensureMasterAdminSession({ url, anonKey, serviceRoleKey }) {
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // internal_admins is locked down to a single master email (see SQL migration).
  const email = (process.env.SOPHIA_MASTER_ADMIN_EMAIL ?? "thomasgenty15@gmail.com").trim();
  const password = String(process.env.SOPHIA_MASTER_ADMIN_PASSWORD ?? "123456").trim();
  const allowResetPassword = parseBoolEnv(process.env.SOPHIA_MASTER_ADMIN_RESET_PASSWORD);

  // Preferred path: do NOT touch the user; just sign in with the configured password.
  const authed = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  {
    const { data: signIn, error: signInErr } = await authed.auth.signInWithPassword({ email, password });
    if (!signInErr && signIn.session?.access_token) {
      return { authed, admin, email, accessToken: signIn.session.access_token };
    }
  }

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

  const { data: signIn, error: signInErr } = await authed.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;
  if (!signIn.session?.access_token) throw new Error("Missing access_token after sign-in");

  return { authed, admin, email, accessToken: signIn.session.access_token };
}

async function fetchEvalRun({ url, serviceRoleKey, evalRunId }) {
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin
    .from("conversation_eval_runs")
    .select("id,created_at,status,dataset_key,scenario_key,transcript,state_before,state_after,issues,suggestions,metrics,config,error")
    .eq("id", evalRunId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchSystemErrorLogs({ url, serviceRoleKey, sinceIso, requestIdPrefix }) {
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
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
}

async function fetchProductionLog({ url, serviceRoleKey, sinceIso }) {
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // get_production_log is overloaded in DB (with/without p_include_chat). Provide it explicitly to disambiguate.
  const { data, error } = await admin.rpc("get_production_log", {
    p_since: sinceIso,
    p_only_errors: false,
    p_source: null,
    p_limit: 300,
    p_include_chat: false,
  });
  if (error) throw error;
  return data ?? [];
}

function parseArgs(argv) {
  const out = {
    turns: 15,
    bilanActions: 3,
    difficulty: "mid",
    model: "gemini-2.5-flash",
    timeoutMs: 600000,
    postBilan: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--turns") out.turns = Number(argv[++i] ?? "15") || 15;
    else if (a === "--bilan-actions") out.bilanActions = Number(argv[++i] ?? "3") || 3;
    else if (a === "--difficulty") out.difficulty = String(argv[++i] ?? "mid");
    else if (a === "--model") out.model = String(argv[++i] ?? out.model);
    else if (a === "--timeout-ms") out.timeoutMs = Number(argv[++i] ?? "600000") || 600000;
    else if (a === "--post-bilan" || a === "--test-post-checkup-deferral") {
      const v = (argv[i + 1] ?? "").toString().trim().toLowerCase();
      // Support both: `--post-bilan` (flag) and `--post-bilan true/false`
      if (v === "" || v.startsWith("--")) {
        out.postBilan = true;
      } else {
        out.postBilan = v === "1" || v === "true" || v === "yes" || v === "y" || v === "on";
        i += 1;
      }
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const st = getLocalSupabaseStatus();
  const url = st.API_URL;
  const anonKey = st.ANON_KEY;
  const serviceRoleKey = st.SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("Missing local Supabase status keys (API_URL / ANON_KEY / SERVICE_ROLE_KEY)");
  }

  const startIso = nowIso();
  const startMs = Date.now();
  const startEpochSec = Math.floor(startMs / 1000);

  // Extend Kong timeout (infra only, no app logic changes) so long runs don't 504.
  // We do a kong reload (no container restart) to preserve the edit.
  const timeoutScript = path.join(process.cwd(), "..", "scripts", "local_extend_kong_functions_timeout.sh");
  const timeoutRes = fs.existsSync(timeoutScript)
    ? safeExec(`TIMEOUT_MS=${args.timeoutMs} "${timeoutScript}"`)
    : { ok: false, error: `missing ${timeoutScript}` };

  // Hard guard: the edge runtime container sometimes restarts with stale/non-local SUPABASE_* keys.
  // That breaks auth.admin.* calls in run-evals (bad_jwt / ES256). Auto-heal by restarting via supabase_local.sh.
  // NOTE: This is a best-effort diagnostic only. The actual source of truth is `run-evals`:
  // it returns a structured retryable error (code=BAD_JWT_ENV) when auth.admin calls would fail.
  // We therefore avoid restarting or failing early here (it can destabilize a running local stack).
  const envHealth = inspectLocalEdgeRuntimeKeys();
  if (!envHealth.ok) {
    console.warn(
      `[Env] edge runtime keys look unusual (service=${envHealth.serviceAlg ?? "?"} anon=${envHealth.anonAlg ?? "?"}). ` +
        `Continuing; if run-evals returns BAD_JWT_ENV we will restart + retry automatically.`,
    );
  }

  const { accessToken } = await ensureMasterAdminSession({ url, anonKey, serviceRoleKey });
  try {
    console.log(`[Auth] access_token alg=${jwtAlgFromToken(accessToken) ?? "?"}`);
  } catch {}

  // Realistic (non-scripted) bilan scenario: NO steps -> run-evals uses simulate-user.
  // IMPORTANT for "vital sign": we DO NOT force a deterministic vital (no "bilan.vitals" tag),
  // so the runner will seed from the generated plan's vitalSignal (if present).
  // IMPORTANT: make the run resumable across *manual* reruns of this command.
  // If the last run crashed mid-flight, we reuse the same scenario_id + x-request-id so run-evals can resume from DB.
  const inflightFile = path.join(process.cwd(), "test-results", "bilan_eval_inflight.json");
  ensureDir(path.dirname(inflightFile));
  const inflight = readJsonIfExists(inflightFile);
  const inflightFresh = inflight?.scenario_id && inflight?.request_id && hoursBetween(inflight?.started_at, nowIso()) < 6;

  const nonce = inflightFresh ? String(inflight.scenario_id).split("__").pop() : makeNonce();
  const scenario = {
    dataset_key: "core",
    id: inflightFresh ? String(inflight.scenario_id) : `bilan_real_bundle__${nonce}`,
    scenario_target: "bilan",
    description: "Bilan real (simulate-user) bundle run: capture full logs + full transcript.",
    tags: ["sophia.investigator"],
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
      assistant_must_not_match: ["\\*\\*"],
      must_keep_investigator_until_stop: true,
    },
  };

  const limits = {
    max_scenarios: 1,
    max_turns_per_scenario: Math.max(1, Math.min(50, args.turns)),
    bilan_actions_count: Math.max(1, Math.min(20, args.bilanActions)),
    // "Test spécial post-bilan" (parking lot): continue after bilan closure to handle deferred topics.
    test_post_checkup_deferral: Boolean(args.postBilan),
    user_difficulty: args.difficulty,
    stop_on_first_failure: false,
    budget_usd: 0,
    model: args.model,
    use_real_ai: true,
  };

  // IMPORTANT:
  // If run-evals is retried (WORKER_LIMIT / edge worker cancellation / local hot-reload),
  // a stable request id keeps logs and DB writes grouped, and allows downstream idempotency.
  const stableRequestId = `bilan_eval_bundle:${scenario.id}`;

  // Persist inflight marker early so manual reruns can resume after a crash.
  writeJsonAtomic(inflightFile, { started_at: startIso, scenario_id: scenario.id, request_id: stableRequestId });

  const runData = await invokeWithRetry({
    url,
    anonKey,
    accessToken,
    fnName: "run-evals",
    body: { scenarios: [scenario], limits },
    timeoutMs: args.timeoutMs,
    maxAttempts: 4,
    requestId: stableRequestId,
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
    limits,
    kong_timeout_apply: timeoutRes,
  });

  const evalRow = await fetchEvalRun({ url, serviceRoleKey, evalRunId });
  writeJson(path.join(bundleDir, "conversation_eval_run.json"), evalRow);

  const sinceIso = new Date(Date.now() - Math.max(60_000, durationMs + 30_000)).toISOString();
  const sysErrors = await fetchSystemErrorLogs({ url, serviceRoleKey, sinceIso, requestIdPrefix: requestId });
  writeJson(path.join(bundleDir, "system_error_logs.json"), sysErrors);

  // Production log is a "nice to have" for global view; don't fail the whole bundle if it errors.
  try {
    const prodLog = await fetchProductionLog({ url, serviceRoleKey, sinceIso });
    writeJson(path.join(bundleDir, "production_log.json"), prodLog);
  } catch (e) {
    writeJson(path.join(bundleDir, "production_log.json"), {
      ok: false,
      error: e?.message ?? String(e),
    });
  }

  // Docker logs: "what you see in the terminal" for Edge Functions.
  // Capture a time window since the run started to keep files bounded.
  const edgeContainer = "supabase_edge_runtime_Sophia_2";
  const kongContainer = "supabase_kong_Sophia_2";

  // NOTE: docker logs can be very large; stream to files (avoid execSync maxBuffer issues).
  const edgeLogFile = path.join(bundleDir, "docker_edge_runtime.log");
  const kongLogFile = path.join(bundleDir, "docker_kong.log");
  const edgeDump = dumpCmdToFile(`docker logs --since ${startEpochSec} ${edgeContainer}`, edgeLogFile);
  const kongDump = dumpCmdToFile(`docker logs --since ${startEpochSec} ${kongContainer}`, kongLogFile);
  writeJson(path.join(bundleDir, "docker_logs_meta.json"), { edgeDump, kongDump, since_epoch_sec: startEpochSec });

  // Fallback (handy when --since is flaky or when you only need “recent run”)
  const edgeTailFile = path.join(bundleDir, "docker_edge_runtime.tail.log");
  const kongTailFile = path.join(bundleDir, "docker_kong.tail.log");
  dumpCmdToFile(`docker logs --tail 5000 ${edgeContainer}`, edgeTailFile);
  dumpCmdToFile(`docker logs --tail 5000 ${kongContainer}`, kongTailFile);

  const edgeLogsText = fs.existsSync(edgeLogFile) ? fs.readFileSync(edgeLogFile, "utf8") : "";
  const kongLogsText = fs.existsSync(kongLogFile) ? fs.readFileSync(kongLogFile, "utf8") : "";

  // Quick filtered views (super handy during debugging).
  const filterNeedles = [String(requestId ?? ""), String(evalRunId), String(scenario.id)];
  const filterText = (txt) => {
    const lines = String(txt ?? "").split("\n");
    return lines
      .filter((l) => {
        if (filterNeedles.some((n) => n && l.includes(n))) return true;
        // Useful generic markers even when request_id isn't printed everywhere.
        return (
          l.includes("serving the request with supabase/functions/") ||
          l.includes("[Eval]") ||
          l.includes("[run-evals]") ||
          l.includes("run-evals:") ||
          l.includes("eval-judge") ||
          l.includes("simulate-user") ||
          l.includes("sophia-brain")
        );
      })
      .join("\n");
  };
  fs.writeFileSync(path.join(bundleDir, "docker_edge_runtime.filtered.log"), filterText(edgeLogsText), "utf8");
  fs.writeFileSync(path.join(bundleDir, "docker_kong.filtered.log"), filterText(kongLogsText), "utf8");

  // Final console output: where to look.
  console.log(
    JSON.stringify(
      {
        ok: true,
        eval_run_id: evalRunId,
        request_id: requestId,
        bundle_dir: bundleDir,
        duration_ms: durationMs,
        turns: Array.isArray(evalRow?.transcript) ? evalRow.transcript.filter((m) => m.role === "user").length : null,
        issues_count: Array.isArray(evalRow?.issues) ? evalRow.issues.length : null,
        suggestions_count: Array.isArray(evalRow?.suggestions) ? evalRow.suggestions.length : null,
      },
      null,
      2,
    ),
  );

  // Success: clear inflight marker so the next run starts fresh.
  maybeDeleteFile(inflightFile);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


