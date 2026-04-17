import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import process from "node:process";

function parseArgs(argv) {
  const out = {
    userId: null,
    scope: "web",
    since: null,
    until: null,
    outFile: null,
    limitMessages: 5000,
    limitErrors: 1000,
    limitEvalEvents: 5000,
    limitUsage: 5000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--user-id") out.userId = String(argv[++i] ?? "").trim() || null;
    else if (a === "--scope") out.scope = String(argv[++i] ?? "").trim() || "web";
    else if (a === "--since") out.since = String(argv[++i] ?? "").trim() || null; // ISO string
    else if (a === "--until") out.until = String(argv[++i] ?? "").trim() || null; // ISO string
    else if (a === "--out") out.outFile = String(argv[++i] ?? "").trim() || null;
    else if (a === "--limit-messages") out.limitMessages = Math.max(1, Number(argv[++i] ?? 5000) || 5000);
    else if (a === "--limit-errors") out.limitErrors = Math.max(1, Number(argv[++i] ?? 1000) || 1000);
    else if (a === "--limit-eval-events") out.limitEvalEvents = Math.max(1, Number(argv[++i] ?? 5000) || 5000);
    else if (a === "--limit-usage") out.limitUsage = Math.max(1, Number(argv[++i] ?? 5000) || 5000);
  }
  return out;
}

function getLocalSupabaseStatus(repoRoot) {
  const supabaseCli = String(process.env.SOPHIA_SUPABASE_CLI ?? "supabase").trim();
  const raw = execSync(`${supabaseCli} status --output json`, { encoding: "utf8", cwd: repoRoot });
  return JSON.parse(raw);
}

function getSupabaseConnection(repoRoot) {
  // Prefer explicit env vars (works for prod too).
  const envUrl = String(process.env.SUPABASE_URL ?? "").trim();
  const envService = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "").trim();
  if (envUrl && envService) return { url: envUrl, serviceKey: envService, source: "env" };

  // Fallback to local `supabase status`.
  const st = getLocalSupabaseStatus(repoRoot);
  const url = String(st?.API_URL ?? "").trim();
  const serviceKey = String(st?.SECRET_KEY ?? "").trim(); // local service role key
  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY env vars and no local supabase status found.");
  }
  return { url, serviceKey, source: "local" };
}

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${text.slice(0, 800)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Non-JSON response");
  }
}

function buildWhereRange({ since, until }) {
  const parts = [];
  if (since) parts.push(`created_at=gte.${encodeURIComponent(since)}`);
  if (until) parts.push(`created_at=lte.${encodeURIComponent(until)}`);
  return parts.length ? "&" + parts.join("&") : "";
}

function pickRequestIds(messages) {
  const ids = new Set();
  for (const m of messages ?? []) {
    const rid =
      m?.metadata?.router_decision_v1?.request_id ??
      m?.metadata?.request_id ??
      null;
    if (typeof rid === "string" && rid.trim()) ids.add(rid.trim());
  }
  return [...ids];
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const repoRoot = path.resolve(process.cwd());
  const args = parseArgs(process.argv.slice(2));

  if (!args.userId) {
    console.error('Missing --user-id "<uuid>"');
    process.exit(1);
  }

  const { url, serviceKey, source } = getSupabaseConnection(repoRoot);
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: "application/json",
  };

  const outDir = path.join(repoRoot, "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile =
    args.outFile
      ? path.resolve(repoRoot, args.outFile)
      : path.join(outDir, `conversation_trace_${args.userId}_${args.scope}_${Date.now()}.json`);

  const range = buildWhereRange({ since: args.since, until: args.until });

  const messagesUrl =
    `${url}/rest/v1/chat_messages` +
    `?user_id=eq.${encodeURIComponent(args.userId)}` +
    `&scope=eq.${encodeURIComponent(args.scope)}` +
    `${range}` +
    `&order=created_at.asc` +
    `&limit=${encodeURIComponent(String(args.limitMessages))}`;

  const errorsUrl =
    `${url}/rest/v1/system_error_logs` +
    `?user_id=eq.${encodeURIComponent(args.userId)}` +
    `${range}` +
    `&order=created_at.asc` +
    `&limit=${encodeURIComponent(String(args.limitErrors))}`;

  const [messages, errorLogs] = await Promise.all([
    fetchJson(messagesUrl, headers),
    fetchJson(errorsUrl, headers),
  ]);

  // LLM usage is keyed by request_id, not user_id.
  // We best-effort join by request_ids observed in chat messages.
  const requestIds = pickRequestIds(messages);
  // Eval events are also keyed by request_id (and only exist during eval runs).
  let evalEvents = [];
  if (requestIds.length > 0) {
    const batches = chunk(requestIds, 40); // keep URLs short/safe
    for (const b of batches) {
      const inList = b.map((x) => `"${String(x).replaceAll('"', '\\"')}"`).join(",");
      const evUrl =
        `${url}/rest/v1/conversation_eval_events` +
        `?request_id=in.(${encodeURIComponent(inList)})` +
        `&order=created_at.asc` +
        `&limit=${encodeURIComponent(String(args.limitEvalEvents))}`;
      const rows = await fetchJson(evUrl, headers);
      if (Array.isArray(rows)) evalEvents = evalEvents.concat(rows);
    }
  }
  let llmUsage = [];
  if (requestIds.length > 0) {
    const batches = chunk(requestIds, 40); // keep URLs short/safe
    for (const b of batches) {
      const inList = b.map((x) => `"${String(x).replaceAll('"', '\\"')}"`).join(",");
      const usageUrl =
        `${url}/rest/v1/llm_usage_events` +
        `?request_id=in.(${encodeURIComponent(inList)})` +
        `&order=created_at.asc` +
        `&limit=${encodeURIComponent(String(args.limitUsage))}`;
      const rows = await fetchJson(usageUrl, headers);
      if (Array.isArray(rows)) llmUsage = llmUsage.concat(rows);
    }
  }

  const output = {
    ok: true,
    source,
    user_id: args.userId,
    scope: args.scope,
    since: args.since,
    until: args.until,
    request_ids: requestIds,
    counts: {
      chat_messages: Array.isArray(messages) ? messages.length : null,
      conversation_eval_events: Array.isArray(evalEvents) ? evalEvents.length : null,
      system_error_logs: Array.isArray(errorLogs) ? errorLogs.length : null,
      llm_usage_events: Array.isArray(llmUsage) ? llmUsage.length : null,
    },
    chat_messages: messages,
    conversation_eval_events: evalEvents,
    system_error_logs: errorLogs,
    llm_usage_events: llmUsage,
  };

  fs.writeFileSync(outFile, JSON.stringify(output, null, 2), "utf8");
  console.log(JSON.stringify({ ok: true, out: outFile, counts: output.counts }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


