import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import process from "node:process";

function parseArgs(argv) {
  const out = {
    userId: null,
    scope: "web",
    scopeAll: false,
    since: null,
    until: null,
    bundleId: null,
    outDir: null,
    prod: false,
    pageSize: 1000,
    limitMessages: 50_000,
    limitTurnSummaries: 50_000,
    writeMeta: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--user-id") out.userId = String(argv[++i] ?? "").trim() || null;
    else if (a === "--scope") out.scope = String(argv[++i] ?? "").trim() || "web";
    else if (a === "--scope-all") out.scopeAll = true;
    else if (a === "--since") out.since = String(argv[++i] ?? "").trim() || null; // ISO string
    else if (a === "--until") out.until = String(argv[++i] ?? "").trim() || null; // ISO string
    else if (a === "--bundle-id") out.bundleId = String(argv[++i] ?? "").trim() || null;
    else if (a === "--out-dir") out.outDir = String(argv[++i] ?? "").trim() || null;
    else if (a === "--prod") out.prod = true;
    else if (a === "--page-size") out.pageSize = Math.max(100, Math.min(5000, Number(argv[++i] ?? 1000) || 1000));
    else if (a === "--limit-messages")
      out.limitMessages = Math.max(1, Number(argv[++i] ?? out.limitMessages) || out.limitMessages);
    else if (a === "--limit-turn-summaries")
      out.limitTurnSummaries = Math.max(1, Number(argv[++i] ?? out.limitTurnSummaries) || out.limitTurnSummaries);
    else if (a === "--write-meta") out.writeMeta = true;
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

function isLocalUrl(u) {
  const s = String(u ?? "").toLowerCase();
  return s.includes("127.0.0.1") || s.includes("localhost") || s.includes("0.0.0.0");
}

function validateSupabaseUrlOrThrow(rawUrl, { prod }) {
  const u = String(rawUrl ?? "").trim();
  let parsed = null;
  try {
    parsed = new URL(u);
  } catch {
    throw new Error(
      `Invalid SUPABASE_URL (${JSON.stringify(u)}). Expected something like "https://<project-ref>.supabase.co"`,
    );
  }

  // In prod mode, prevent common footguns:
  // - passing only the project ref (no dot / no supabase.co)
  // - accidentally using a local URL
  if (prod) {
    if (isLocalUrl(parsed.href)) {
      throw new Error(`Refusing to run with a local SUPABASE_URL in --prod mode (${parsed.href}).`);
    }
    if (!parsed.hostname.includes(".")) {
      throw new Error(
        `SUPABASE_URL hostname looks incomplete (${JSON.stringify(parsed.hostname)}). Did you mean "https://${parsed.hostname}.supabase.co" ?`,
      );
    }
  }

  return parsed;
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

function buildWhereRange({ since, until }, field = "created_at") {
  const parts = [];
  if (since) parts.push(`${field}=gte.${encodeURIComponent(since)}`);
  if (until) parts.push(`${field}=lte.${encodeURIComponent(until)}`);
  return parts.length ? "&" + parts.join("&") : "";
}

function pickRequestIds(messages) {
  const ids = new Set();
  for (const m of messages ?? []) {
    const rid = m?.metadata?.router_decision_v1?.request_id ?? m?.metadata?.request_id ?? null;
    if (typeof rid === "string" && rid.trim()) ids.add(rid.trim());
  }
  return [...ids];
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchAll({ urlBase, headers, pageSize, hardLimit }) {
  const out = [];
  for (let offset = 0; offset < hardLimit; offset += pageSize) {
    const limit = Math.min(pageSize, hardLimit - offset);
    const sep = urlBase.includes("?") ? "&" : "?";
    const pageUrl = `${urlBase}${sep}limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`;
    const rows = await fetchJson(pageUrl, headers);
    if (!Array.isArray(rows)) break;
    out.push(...rows);
    if (rows.length < limit) break;
  }
  return out;
}

function safeShortUser(userId) {
  const s = String(userId ?? "");
  return s.length >= 8 ? s.slice(0, 8) : s;
}

function slugifyLabel(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
    .toLowerCase();
}

function jsonlWrite(filePath, rows) {
  const fd = fs.openSync(filePath, "w");
  try {
    for (const r of rows) {
      fs.writeSync(fd, JSON.stringify(r) + "\n", null, "utf8");
    }
  } finally {
    fs.closeSync(fd);
  }
}

function transcriptWrite(filePath, rows) {
  const fd = fs.openSync(filePath, "w");
  try {
    for (const r of rows) {
      const ts = String(r?.ts ?? "");
      const scope = String(r?.scope ?? "");
      const role = String(r?.role ?? "");
      const rid = r?.request_id ? String(r.request_id) : "";
      const content = String(r?.content ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const header = `[${ts}]${scope ? ` [${scope}]` : ""} ${role}${rid ? ` (request_id=${rid})` : ""}:`;
      fs.writeSync(fd, header + "\n" + content + "\n\n", null, "utf8");
    }
  } finally {
    fs.closeSync(fd);
  }
}

function todayFolderNameLocal() {
  // Folder name intended for humans + stable sorting: YYYY-MM-DD (local time)
  const d = new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function main() {
  const repoRoot = path.resolve(process.cwd());
  const args = parseArgs(process.argv.slice(2));

  if (!args.userId) {
    console.error('Missing --user-id "<uuid>"');
    process.exit(1);
  }

  const { url, serviceKey, source } = getSupabaseConnection(repoRoot);
  try {
    validateSupabaseUrlOrThrow(url, { prod: args.prod });
  } catch (e) {
    console.error(String(e?.message ?? e));
    process.exit(1);
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: "application/json",
  };

  // Best-effort: fetch a human label for the user for nicer bundle folder names.
  let userLabel = "";
  try {
    const profUrl =
      `${url}/rest/v1/profiles` +
      `?select=${encodeURIComponent("full_name")}` +
      `&id=eq.${encodeURIComponent(args.userId)}` +
      `&limit=1`;
    const profRows = await fetchJson(profUrl, headers);
    const fullName = Array.isArray(profRows) ? String(profRows?.[0]?.full_name ?? "").trim() : "";
    userLabel = slugifyLabel(fullName);
  } catch {
    userLabel = "";
  }

  const userSlug = [userLabel, safeShortUser(args.userId)].filter(Boolean).join("_");

  const bundleId =
    args.bundleId ||
    `bundle_${userSlug}_${new Date().toISOString().replaceAll(":", "").replaceAll(".", "")}`;

  const datedBundlesDir = path.join(repoRoot, "tmp", "bundles", todayFolderNameLocal());
  const outDir = args.outDir
    ? path.resolve(repoRoot, args.outDir)
    : path.join(datedBundlesDir, bundleId);
  fs.mkdirSync(outDir, { recursive: true });

  const range = buildWhereRange({ since: args.since, until: args.until }, "created_at");
  const scopeFilter = args.scopeAll ? "" : `&scope=eq.${encodeURIComponent(args.scope)}`;

  const chatUrlBase =
    `${url}/rest/v1/chat_messages` +
    `?select=${encodeURIComponent("id,created_at,user_id,role,content,agent_used,metadata,scope")}` +
    `&user_id=eq.${encodeURIComponent(args.userId)}` +
    `${scopeFilter}` +
    `${range}` +
    `&order=created_at.asc`;

  const chatMessages = await fetchAll({
    urlBase: chatUrlBase,
    headers,
    pageSize: args.pageSize,
    hardLimit: args.limitMessages,
  });

  const requestIds = pickRequestIds(chatMessages);

  // Turn summary logs: fetch by request_id IN (...) batches for accuracy.
  // Also apply created_at range to keep exports bounded.
  let turnSummaries = [];
  if (requestIds.length > 0) {
    const batches = chunk(requestIds, 40); // keep URLs short/safe
    for (const b of batches) {
      const inList = b.map((x) => `"${String(x).replaceAll('"', '\\"')}"`).join(",");
      const tsUrlBase =
        `${url}/rest/v1/turn_summary_logs` +
        `?select=${encodeURIComponent(
          [
            "id",
            "created_at",
            "request_id",
            "user_id",
            "channel",
            "scope",
            "latency_total_ms",
            "latency_dispatcher_ms",
            "latency_context_ms",
            "latency_agent_ms",
            "dispatcher_model",
            "dispatcher_safety",
            "dispatcher_intent",
            "dispatcher_intent_conf",
            "dispatcher_interrupt",
            "dispatcher_topic_depth",
            "dispatcher_flow_resolution",
            "context_profile",
            "context_elements",
            "context_tokens",
            "target_dispatcher",
            "target_initial",
            "target_final",
            "risk_score",
            "agent_model",
            "agent_outcome",
            "agent_tool",
            "checkup_active",
            "toolflow_active",
            "supervisor_stack_top",
            "aborted",
            "abort_reason",
            "payload",
          ].join(","),
        )}` +
        `&user_id=eq.${encodeURIComponent(args.userId)}` +
        `&request_id=in.(${encodeURIComponent(inList)})` +
        `&order=created_at.asc`;

      const rows = await fetchAll({
        urlBase: tsUrlBase,
        headers,
        pageSize: args.pageSize,
        hardLimit: args.limitTurnSummaries,
      });
      if (Array.isArray(rows) && rows.length > 0) turnSummaries = turnSummaries.concat(rows);
    }
  }

  // Normalize exports to JSONL rows that are easy to stream / diff / grep.
  const conversationRows = (chatMessages ?? []).map((m) => ({
    ts: m.created_at,
    kind: "chat_message",
    user_id: m.user_id,
    scope: m.scope ?? args.scope,
    role: m.role,
    agent_used: m.agent_used ?? null,
    request_id: m?.metadata?.router_decision_v1?.request_id ?? m?.metadata?.request_id ?? null,
    content: m.content,
    metadata: m.metadata ?? {},
  }));

  const turnSummaryRows = (turnSummaries ?? []).map((t) => ({
    ts: t.created_at,
    kind: "turn_summary_log",
    user_id: t.user_id,
    channel: t.channel,
    scope: t.scope,
    request_id: t.request_id,
    aborted: t.aborted ?? false,
    abort_reason: t.abort_reason ?? null,
    latency_total_ms: t.latency_total_ms ?? null,
    latency_dispatcher_ms: t.latency_dispatcher_ms ?? null,
    latency_context_ms: t.latency_context_ms ?? null,
    latency_agent_ms: t.latency_agent_ms ?? null,
    dispatcher: {
      model: t.dispatcher_model ?? null,
      safety: t.dispatcher_safety ?? null,
      intent: t.dispatcher_intent ?? null,
      intent_conf: t.dispatcher_intent_conf ?? null,
      interrupt: t.dispatcher_interrupt ?? null,
      topic_depth: t.dispatcher_topic_depth ?? null,
      flow_resolution: t.dispatcher_flow_resolution ?? null,
    },
    context: {
      profile: t.context_profile ?? null,
      elements: t.context_elements ?? null,
      tokens: t.context_tokens ?? null,
    },
    routing: {
      target_dispatcher: t.target_dispatcher ?? null,
      target_initial: t.target_initial ?? null,
      target_final: t.target_final ?? null,
      risk_score: t.risk_score ?? null,
    },
    agent: {
      model: t.agent_model ?? null,
      outcome: t.agent_outcome ?? null,
      tool: t.agent_tool ?? null,
    },
    state: {
      checkup_active: t.checkup_active ?? null,
      toolflow_active: t.toolflow_active ?? null,
      supervisor_stack_top: t.supervisor_stack_top ?? null,
    },
    payload: t.payload ?? {},
  }));

  // Files requested for analysis:
  // 1) human-readable transcript
  // 2) brain trace (payloads)
  const transcriptPath = path.join(outDir, "conversation_transcript.txt");
  const brainTracePath = path.join(outDir, "brain_trace.jsonl");

  transcriptWrite(transcriptPath, conversationRows);
  jsonlWrite(
    brainTracePath,
    turnSummaryRows.map((r) => ({
      // Minimal "trace" export: DB timestamp + payload (payload already includes request_id, channel, scope, etc.)
      ts_db: r.ts,
      payload: r.payload ?? {},
    })),
  );

  const foundSummaryRequestIds = new Set(turnSummaries.map((t) => String(t?.request_id ?? "")));
  const missingSummary = requestIds.filter((rid) => !foundSummaryRequestIds.has(String(rid)));

  const meta = {
    ok: true,
    bundle_id: bundleId,
    source,
    supabase_url: url,
    user_id: args.userId,
    scope: args.scopeAll ? "ALL" : args.scope,
    since: args.since,
    until: args.until,
    counts: {
      chat_messages: conversationRows.length,
      request_ids: requestIds.length,
      turn_summary_logs: turnSummaryRows.length,
      missing_turn_summaries: missingSummary.length,
    },
    outputs: {
      out_dir: outDir,
      conversation_transcript: transcriptPath,
      brain_trace_jsonl: brainTracePath,
    },
    missing_turn_summary_request_ids: missingSummary.slice(0, 200), // cap for sanity
  };

  if (args.writeMeta) {
    const metaPath = path.join(outDir, "meta.json");
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
  }

  console.log(JSON.stringify(meta, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


