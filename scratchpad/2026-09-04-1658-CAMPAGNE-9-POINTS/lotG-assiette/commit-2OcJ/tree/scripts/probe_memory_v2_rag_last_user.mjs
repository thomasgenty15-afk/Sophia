#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultReport = "tmp/memory-real-eval-paraphrase-mp49ofqp.json";
const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
const reportPath = path.resolve(
  cwd,
  reportArg ? reportArg.slice("--report=".length) : defaultReport,
);
const runId = `memory-rag-probe-${Date.now().toString(36)}`;
const sourceReport = JSON.parse(readFileSync(reportPath, "utf8"));
const sourceRunId = String(sourceReport.run_id ?? "unknown");
const user = {
  id: String(sourceReport.user?.id ?? ""),
  email: String(sourceReport.user?.email ?? ""),
};
if (!user.id || !user.email) {
  throw new Error(`Report ${reportPath} does not expose user.id/user.email`);
}

function readLocalEnv() {
  const envPath = path.join(cwd, "supabase", ".env");
  const out = {};
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // Missing local .env is handled by the required-key check below.
  }
  return out;
}

function readStatus() {
  try {
    const raw = execFileSync("supabase", ["status", "--output", "json"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const localEnv = readLocalEnv();
const status = readStatus();
const apiUrl = status.API_URL ?? localEnv.SUPABASE_URL ??
  "http://127.0.0.1:54321";
const functionsUrl = status.FUNCTIONS_URL ?? `${apiUrl}/functions/v1`;
const anonKey = status.ANON_KEY ?? localEnv.SUPABASE_ANON_KEY;
const serviceRoleKey = status.SERVICE_ROLE_KEY ??
  localEnv.SUPABASE_SERVICE_ROLE_KEY;
const internalSecret = localEnv.INTERNAL_FUNCTION_SECRET ?? localEnv.SECRET_KEY;

if (!anonKey || !serviceRoleKey) {
  throw new Error(
    "Missing Supabase anon/service keys from `supabase status` or `supabase/.env`.",
  );
}

async function requestJson(url, opts = {}) {
  const response = await fetch(url, opts);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const err = new Error(
      `${opts.method ?? "GET"} ${url} -> ${response.status}`,
    );
    err.status = response.status;
    err.body = body;
    throw err;
  }
  return { status: response.status, body };
}

async function adminRequest(pathname, opts = {}) {
  return await requestJson(`${apiUrl}${pathname}`, {
    ...opts,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      ...(opts.body ? { "content-type": "application/json" } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function rest(pathname, opts = {}) {
  const { body } = await requestJson(`${apiUrl}/rest/v1/${pathname}`, {
    method: opts.method ?? "GET",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      ...(opts.body ? { "content-type": "application/json" } : {}),
      ...(opts.prefer ? { prefer: opts.prefer } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return body;
}

async function signIn() {
  const password = `MemoryProbe-${Date.now()}!`;
  await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
    method: "PUT",
    body: { password, email_confirm: true },
  });
  const { body } = await requestJson(
    `${apiUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: user.email, password }),
    },
  );
  if (!body?.access_token) throw new Error("Could not sign in probe user.");
  return body.access_token;
}

const probes = [
  {
    id: "lisbon",
    message:
      "Je repars sur le voyage dont je t'ai parle. Tu peux me rappeler les points importants que tu as retenus sur Lisbonne ?",
    expected: ["lisbonne", "juin", "calme", "quartier", "festif", "aeroport"],
  },
  {
    id: "health_food",
    message:
      "On cherche un restaurant ensemble: quels ingredients dois-tu eviter pour moi d'apres ce que je t'ai deja dit ?",
    expected: ["allerg", "noix", "noisette", "amande"],
  },
  {
    id: "work_family",
    message:
      "Je suis un peu perdu entre le dossier Orion et ma cousine Lina. Qu'est-ce que tu as retenu de chacun ?",
    expected: ["orion", "client", "brief", "lina", "cousine"],
  },
];

function normalize(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function responseText(body) {
  return String(
    body?.content ?? body?.message ?? body?.response?.content ??
      body?.response ?? body?.raw ?? "",
  ).trim();
}

async function callBrain(accessToken, scope, probe, index) {
  const requestId = `${runId}-${probe.id}`;
  const { body } = await requestJson(`${functionsUrl}/sophia-brain`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({
      message: probe.message,
      scope,
      channel: "web",
      logMessages: true,
      messageMetadata: {
        rag_probe_run_id: runId,
        source_report_run_id: sourceRunId,
        probe_id: probe.id,
        probe_index: index,
        force_full_ai: true,
      },
    }),
  });
  const text = responseText(body);
  const normalized = normalize(text);
  const hits = probe.expected.filter((term) =>
    normalized.includes(normalize(term))
  );
  return {
    id: probe.id,
    request_id: requestId,
    message: probe.message,
    response_text: text,
    response_body: body,
    expected_terms: probe.expected,
    matched_terms: hits,
    semantic_check_ok: hits.length >= Math.min(3, probe.expected.length),
  };
}

async function getTrace(scope) {
  if (!internalSecret) return { skipped: true, reason: "missing_internal_secret" };
  const { body } = await requestJson(`${functionsUrl}/get-memory-trace`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "content-type": "application/json",
      "x-internal-secret": internalSecret,
      "x-request-id": `${runId}-trace`,
    },
    body: JSON.stringify({
      user_id: user.id,
      hours: 6,
      scope,
    }),
  });
  return body?.trace ?? null;
}

function summarizeTrace(trace) {
  if (!trace || trace.skipped) return trace ?? null;
  return {
    summary: trace.summary,
    turns: (trace.turns ?? []).map((turn) => {
      const active = (turn.events ?? [])
        .filter((event) => event.event_name === "memory.runtime.active.loaded")
        .at(-1)?.payload ?? null;
      return {
        request_id: turn.request_id,
        user_message: turn.user_message?.content ?? null,
        dispatcher_memory_mode:
          turn.dispatcher?.memory_plan?.memory_mode ?? null,
        dispatcher_context_need:
          turn.dispatcher?.memory_plan?.context_need ?? null,
        dispatcher_response_intent:
          turn.dispatcher?.memory_plan?.response_intent ?? null,
        injected: Boolean(turn.injection),
        injection_tokens: turn.injection?.estimated_tokens ?? null,
        active_loader: active
          ? {
            retrieval_mode: active.retrieval_mode ?? null,
            requested_scopes: active.loader_plan_requested_scopes ?? [],
            domain_keys: active.loader_plan_domain_keys ?? [],
            topic_decision: active.topic_decision ?? null,
            active_topic_id: active.active_topic_id ?? null,
            payload_item_count: active.payload_item_count ?? null,
            payload_item_ids: active.payload_item_ids ?? [],
            sensitive_excluded_count: active.sensitive_excluded_count ?? null,
            fallback_used: active.fallback_used ?? null,
          }
          : null,
        retrieval: {
          globals: Array.isArray(turn.retrieval?.globals?.results)
            ? turn.retrieval.globals.results.length
            : null,
          topics: Array.isArray(turn.retrieval?.topics?.results)
            ? turn.retrieval.topics.results.length
            : null,
          events: Array.isArray(turn.retrieval?.events?.results)
            ? turn.retrieval.events.results.length
            : null,
        },
      };
    }),
  };
}

async function main() {
  const scope = `${runId}-scope`;
  const accessToken = await signIn();
  const activeItems = await rest(
    `memory_items?user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&select=id,content_text,domain_keys,sensitivity_level,topic_links:memory_item_topics(topic:user_topic_memories(slug,title))&order=created_at.asc`,
  );
  const probeResults = [];
  for (let i = 0; i < probes.length; i++) {
    probeResults.push(await callBrain(accessToken, scope, probes[i], i));
  }
  const trace = await getTrace(scope);
  const scopedMessages = await rest(
    `chat_messages?user_id=eq.${encodeURIComponent(user.id)}&scope=eq.${encodeURIComponent(scope)}&select=role,content,metadata,created_at,agent_used&order=created_at.asc`,
  );
  const summarizedTrace = summarizeTrace(trace);
  const report = {
    ok: true,
    run_id: runId,
    source_report_path: reportPath,
    source_report_run_id: sourceRunId,
    user,
    scope,
    active_memory_item_count: Array.isArray(activeItems) ? activeItems.length : 0,
    active_memory_items: activeItems,
    probes: probeResults,
    scoped_messages: scopedMessages,
    trace,
    trace_summary: summarizedTrace,
    checks: {
      all_probes_have_semantic_hits: probeResults.every((p) =>
        p.semantic_check_ok
      ),
      scoped_conversation_persisted: Array.isArray(scopedMessages) &&
        scopedMessages.filter((row) => row.role === "user").length >= probes.length &&
        scopedMessages.filter((row) => row.role === "assistant").length >=
          probes.length,
      dispatcher_plan_observed: Boolean(
        summarizedTrace?.turns?.some((turn) => turn.dispatcher_memory_mode),
      ),
      active_loader_observed: Boolean(
        summarizedTrace?.turns?.some((turn) => turn.active_loader),
      ),
      memory_payload_observed: Boolean(
        summarizedTrace?.turns?.some((turn) =>
          Number(turn.active_loader?.payload_item_count ?? 0) > 0 ||
          Number(turn.retrieval?.globals ?? 0) > 0 ||
          Number(turn.retrieval?.topics ?? 0) > 0 ||
          Number(turn.retrieval?.events ?? 0) > 0
        ),
      ),
    },
  };
  mkdirSync(path.join(cwd, "tmp"), { recursive: true });
  const outPath = path.join(cwd, "tmp", `${runId}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    report_path: outPath,
    run_id: runId,
    source_report_run_id: sourceRunId,
    user,
    scope,
    active_memory_item_count: report.active_memory_item_count,
    checks: report.checks,
    probes: report.probes.map((probe) => ({
      id: probe.id,
      semantic_check_ok: probe.semantic_check_ok,
      matched_terms: probe.matched_terms,
      response_preview: probe.response_text.slice(0, 600),
    })),
    trace_summary: report.trace_summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  if (error?.body) console.error(JSON.stringify(error.body, null, 2));
  process.exitCode = 1;
});
