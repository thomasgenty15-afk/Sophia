import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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

  // Local convenience: forge HS256 anon/service tokens for tools that expect HS256 (PostgREST/JWT secret).
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 365 * 10;
  const iss = "supabase-demo";
  const anonKey = signJwtHs256({ secret: jwtSecret, payload: { iss, role: "anon", exp } });
  const serviceRoleKey = signJwtHs256({ secret: jwtSecret, payload: { iss, role: "service_role", exp } });
  return { ...st, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceRoleKey };
}

function parseArgs(argv) {
  const out = { eval_run_id: null, scenario: null, force_new: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--eval-run-id") out.eval_run_id = String(argv[++i] ?? "").trim() || null;
    else if (a === "--scenario") out.scenario = String(argv[++i] ?? "").trim() || null;
    else if (a === "--force-new") out.force_new = true;
  }
  return out;
}

function must(v, msg) {
  if (!v) throw new Error(msg);
  return v;
}

function getLocalSupabaseStatus() {
  const repoRoot = path.resolve(process.cwd(), "..");
  // IMPORTANT: default to the installed supabase CLI (avoid npx/npm EPERM issues).
  const supabaseCli = String(process.env.SOPHIA_SUPABASE_CLI ?? "supabase").trim();
  const raw = execSync(`${supabaseCli} status --output json`, { encoding: "utf8", cwd: repoRoot });
  return normalizeSupabaseStatusKeys(JSON.parse(raw));
}

function curlJson({ url, headers }) {
  const args = ["-sS", "-X", "GET", url];
  for (const [k, v] of Object.entries(headers ?? {})) args.push("-H", `${k}: ${v}`);
  const res = spawnSync("curl", args, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  if (res.error) throw res.error;
  if ((res.status ?? 0) !== 0) throw new Error(`curl failed (status=${res.status ?? "null"}): ${(res.stderr ?? "").slice(0, 400)}`);
  const raw = String(res.stdout ?? "");
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return { _raw: raw };
  }
}

function dockerDbContainerName() {
  try {
    const res = spawnSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
    const out = String(res.stdout ?? "");
    const names = out.split("\n").map((s) => s.trim()).filter(Boolean);
    // Local supabase convention: supabase_db_<project>
    const hit = names.find((n) => /^supabase_db_/i.test(n));
    return hit ?? null;
  } catch {
    return null;
  }
}

function dockerPsqlJson({ sql }) {
  const container = dockerDbContainerName();
  if (!container) return null;
  try {
    const res = spawnSync(
      "docker",
      ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-q", "-c", sql],
      // eval rows can be large (transcript + state_before/state_after). Avoid spawnSync 1MB default truncation.
      { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
    );
    const out = String(res.stdout ?? "").trim();
    if (!out) return null;
    // psql prints a single JSON value (not wrapped). Keep it flexible:
    // - for `select row_to_json(t)` it returns the object directly
    // - for `select json_agg(...)` it returns the array directly
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}
function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}
function safeName(s) {
  return String(s ?? "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 140);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const evalRunId = must(args.eval_run_id, "Missing --eval-run-id <uuid>");

  const st = getLocalSupabaseStatus();
  const url = must(st.API_URL, "Missing API_URL from supabase status");
  const anonKey = must(st.ANON_KEY, "Missing ANON_KEY from supabase status");
  const serviceRoleKey = must(st.SERVICE_ROLE_KEY, "Missing SERVICE_ROLE_KEY from supabase status");
  const dbUrl = String(st.DB_URL ?? "").trim();

  // Use select=* to avoid breaking when local schema differs (migrations added/removed columns).
  const runUrl = `${url}/rest/v1/conversation_eval_runs?id=eq.${encodeURIComponent(evalRunId)}&select=${encodeURIComponent("*")}&limit=1`;
  let row = null;
  try {
    const rowJson = curlJson({ url: runUrl, headers: { apikey: anonKey, Authorization: `Bearer ${serviceRoleKey}` } });
    row = Array.isArray(rowJson) ? (rowJson[0] ?? null) : null;
  } catch {
    row = null;
  }
  // If PostgREST rejects JWT (PGRST301) or other auth issues, fall back to DB direct query (psql).
  if (!row && dbUrl) {
    try {
      const sql =
        `select row_to_json(t) as json from (` +
        `select id, created_at, status, dataset_key, scenario_key, transcript, state_before, state_after, issues, suggestions, metrics, config, error, completed_at, partial_reason, partial_at ` +
        `from public.conversation_eval_runs where id = '${evalRunId.replace(/'/g, "''")}' limit 1` +
        `) t;`;
      const res = spawnSync(
        "psql",
        [dbUrl, "-t", "-A", "-q", "-c", sql],
        { encoding: "utf8" },
      );
      const out = String(res.stdout ?? "").trim();
      if (out) {
        const parsed = JSON.parse(out);
        row = parsed?.json ?? null;
      }
    } catch {
      // ignore; row remains null
    }
  }
  // If psql isn't available on the host (common), fall back to running psql inside the dockerized DB.
  if (!row) {
    const sql =
      `select row_to_json(t) from (` +
      `select * from public.conversation_eval_runs where id = '${evalRunId.replace(/'/g, "''")}' limit 1` +
      `) t;`;
    const parsed = dockerPsqlJson({ sql });
    if (parsed && typeof parsed === "object") row = parsed;
  }

  const evUrl = `${url}/rest/v1/conversation_eval_events?eval_run_id=eq.${encodeURIComponent(evalRunId)}&select=${encodeURIComponent("*")}&order=${encodeURIComponent("created_at.asc")}&limit=5000`;
  let evs = [];
  try {
    evs = curlJson({ url: evUrl, headers: { apikey: anonKey, Authorization: `Bearer ${serviceRoleKey}` } });
  } catch {
    evs = [];
  }
  if ((!Array.isArray(evs) || evs.length === 0) && dbUrl) {
    try {
      const sql =
        `select coalesce(json_agg(t order by t.created_at), '[]'::json) as json from (` +
        `select id, created_at, level, event, source, request_id, payload ` +
        `from public.conversation_eval_events where eval_run_id = '${evalRunId.replace(/'/g, "''")}' ` +
        `order by created_at asc limit 5000` +
        `) t;`;
      const res = spawnSync("psql", [dbUrl, "-t", "-A", "-q", "-c", sql], { encoding: "utf8" });
      const out = String(res.stdout ?? "").trim();
      if (out) evs = JSON.parse(out)?.json ?? [];
    } catch {
      // ignore
    }
  }
  if (!Array.isArray(evs) || evs.length === 0) {
    const sql =
      `select coalesce(json_agg(t order by t.created_at), '[]'::json) from (` +
      `select * from public.conversation_eval_events where eval_run_id = '${evalRunId.replace(/'/g, "''")}' ` +
      `order by created_at asc limit 5000` +
      `) t;`;
    const parsed = dockerPsqlJson({ sql });
    if (Array.isArray(parsed)) evs = parsed;
  }

  const scenarioKey = args.scenario ?? (row?.scenario_key ?? "scenario");
  // By default, keep exports stable/idempotent (same folder for same eval_run_id).
  // Use --force-new if you want a new folder each time.
  const bundleTitle = args.force_new
    ? safeName(`${scenarioKey}_${evalRunId}_${Date.now()}_${safeName(crypto.randomUUID().slice(0, 8))}_EXPORT`)
    : safeName(`${scenarioKey}_${evalRunId}_EXPORT`);
  const bundleDir = path.join(process.cwd(), "test-results", `eval_bundle_${bundleTitle}`);
  if (!args.force_new) {
    try { fs.rmSync(bundleDir, { recursive: true, force: true }); } catch {}
  }
  ensureDir(bundleDir);

  writeJson(path.join(bundleDir, "supabase_status.json"), st);
  writeJson(path.join(bundleDir, "bundle_meta.json"), {
    kind: "eval_bundle_dir",
    ok: true,
    exported_only: true,
    scenario_key: scenarioKey,
    eval_run_id: evalRunId,
    request_id: row?.config?.request_id ?? null,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  });
  writeJson(path.join(bundleDir, "conversation_eval_run.json"), row ?? { ok: false, error: "eval_run_not_found" });
  writeJson(path.join(bundleDir, "conversation_eval_events.json"), Array.isArray(evs) ? evs : []);

  // Verifier logs are now included in conversation_eval_events during eval runs.

  console.log(JSON.stringify({ ok: true, eval_run_id: evalRunId, bundle_dir: bundleDir }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


