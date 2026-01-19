import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function parseArgs(argv) {
  const out = {
    evalRunId: null,
    outFile: null,
    logsFile: null,
    includeChatMessages: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--eval-run-id" || a === "--id") out.evalRunId = String(argv[++i] ?? "").trim() || null;
    else if (a === "--out") out.outFile = String(argv[++i] ?? "").trim() || null;
    else if (a === "--logs-file") out.logsFile = String(argv[++i] ?? "").trim() || null;
    else if (a === "--no-chat-messages") out.includeChatMessages = false;
  }
  return out;
}

function must(v, name) {
  const s = String(v ?? "").trim();
  if (!s) throw new Error(`Missing ${name}`);
  return s;
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

function getLocalSupabaseStatus() {
  const repoRoot = path.resolve(process.cwd(), "..");
  const supabaseCli = String(process.env.SOPHIA_SUPABASE_CLI ?? "npx --yes supabase@latest").trim();
  const raw = execSync(`${supabaseCli} status --output json`, { encoding: "utf8", cwd: repoRoot });
  return normalizeSupabaseStatusKeys(JSON.parse(raw));
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function safeReadText(p) {
  try {
    if (!p) return null;
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const evalRunId = must(args.evalRunId, "--eval-run-id");

  const st = getLocalSupabaseStatus();
  const url = must(st?.API_URL, "Supabase API_URL");
  const serviceRoleKey = must(st?.SERVICE_ROLE_KEY, "Supabase SERVICE_ROLE_KEY");

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: runRow, error: runErr } = await admin
    .from("conversation_eval_runs")
    .select("*")
    .eq("id", evalRunId)
    .single();
  if (runErr) throw runErr;

  const config = (runRow ?? {})?.config ?? {};
  const testUserId = String(config?.test_user_id ?? "").trim() || null;
  const channel = String(config?.channel ?? "").trim() || null;
  const scope = channel === "whatsapp" ? "whatsapp" : "web";

  let chatMessages = null;
  let chatState = null;
  if (args.includeChatMessages && testUserId) {
    const { data: msgs } = await admin
      .from("chat_messages")
      .select("id,role,content,created_at,agent_used,metadata,scope")
      .eq("user_id", testUserId)
      .eq("scope", scope)
      .order("created_at", { ascending: true })
      .limit(600);
    chatMessages = msgs ?? null;

    const { data: stRow } = await admin
      .from("user_chat_states")
      .select("*")
      .eq("user_id", testUserId)
      .eq("scope", scope)
      .maybeSingle();
    chatState = stRow ?? null;
  }

  // Optional: attach a log capture file (supabase logs --follow > file) for post-mortem analysis.
  const logsText = safeReadText(args.logsFile);

  const bundle = {
    kind: "eval_bundle",
    exported_at: nowIso(),
    eval_run_id: evalRunId,
    scenario_key: runRow?.scenario_key ?? null,
    dataset_key: runRow?.dataset_key ?? null,
    status: runRow?.status ?? null,
    config: runRow?.config ?? null,
    issues: runRow?.issues ?? null,
    suggestions: runRow?.suggestions ?? null,
    metrics: runRow?.metrics ?? null,
    // What eval-judge saw:
    transcript: runRow?.transcript ?? null,
    state_before: runRow?.state_before ?? null,
    state_after: runRow?.state_after ?? null,
    // Extra raw DB artifacts (useful when debugging races / routing):
    db: {
      test_user_id: testUserId,
      scope,
      chat_state_live: chatState,
      chat_messages: chatMessages,
    },
    logs: args.logsFile
      ? {
          source_file: args.logsFile,
          text: logsText,
        }
      : null,
  };

  const outFile = args.outFile
    ? args.outFile
    : path.join(process.cwd(), "eval", "bundles", `${evalRunId}.json`);
  ensureDir(path.dirname(outFile));
  fs.writeFileSync(outFile, JSON.stringify(bundle, null, 2), "utf8");
  console.log(JSON.stringify({ ok: true, eval_run_id: evalRunId, out: outFile }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


