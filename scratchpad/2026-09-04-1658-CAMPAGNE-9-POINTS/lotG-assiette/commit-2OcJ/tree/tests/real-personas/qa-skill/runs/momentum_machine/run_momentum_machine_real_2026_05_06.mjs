import fs from "node:fs";
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";

const apiUrl = "http://127.0.0.1:54321";
const anonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const runId = "r1";
const scope = `qa-momentum-machine-real-2026-05-06-${runId}`;
const channel = "web";

const messages = [
  "hey, je veux tester la reprise sur ma presentation client de jeudi",
  "j'ai deja une intro brouillon et je peux l'ameliorer en dix minutes",
  "j'ai fait deux phrases, c'est imparfait mais ca avance",
  "la je bloque sur la suite, je tourne autour du truc depuis ce matin",
  "j'ai essaye puis j'ai ferme le doc; je sens que j'evite",
  "ok",
  "j'en peux plus, je suis submerge et j'ai honte de bloquer sur si peu",
  "pas de plan maintenant, aide-moi juste a redescendre",
  "la phrase courte m'aide, je peux rouvrir le doc une minute",
  "stop pour ce soir, pas aujourd'hui, on reprendra plus tard",
  "finalement oui on peut reprendre doucement demain",
  "j'ai pose une micro-action: relire juste les deux phrases demain a 9h",
];
const interTurnDelayMs = 500;

async function jsonFetch(url, opts, timeoutMs = 90000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, text, json };
}

function responseText(response) {
  if (!response || typeof response !== "object") return "";
  return String(response.content || response.reply || response.text || "");
}

function safeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function supabaseGet(baseUrl, serviceKey, tablePath) {
  const res = await fetch(`${baseUrl}/rest/v1/${tablePath}`, {
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET ${tablePath} -> ${res.status}: ${text.slice(0, 800)}`);
  }
  return text ? JSON.parse(text) : null;
}

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const runDir = path.join(root, "tests/real-personas/qa-skill/runs/momentum_machine");
const connPath = path.join(
  root,
  "tests/real-personas/qa-skill/connections/emotional_repair.json",
);
const conn = JSON.parse(fs.readFileSync(connPath, "utf8"));
const status = JSON.parse(execSync("supabase status --output json", {
  cwd: root,
  encoding: "utf8",
}));
const serviceKey = String(status.SERVICE_ROLE_KEY ?? status.SECRET_KEY ?? "");

const tokenResult = await jsonFetch(
  `${apiUrl}/auth/v1/token?grant_type=refresh_token`,
  {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: conn.refresh_token }),
  },
);
if (!tokenResult.res.ok || !tokenResult.json?.access_token) {
  throw new Error(`token refresh failed: ${tokenResult.text}`);
}
const jwt = tokenResult.json.access_token;

fs.mkdirSync(runDir, { recursive: true });
const rawPath = path.join(runDir, `2026-05-06-momentum-machine-real-${runId}.raw.json`);
const summaryPath = path.join(runDir, `2026-05-06-momentum-machine-real-${runId}.summary.json`);
const proofPath = path.join(runDir, `2026-05-06-momentum-machine-real-${runId}.proof.json`);

const history = [];
const raw = [];
const summary = [];
const startedAt = new Date(Date.now() - 1000).toISOString();

for (let i = 0; i < messages.length; i += 1) {
  const content = messages[i];
  const requestId = `qa-momentum-machine-real-2026-05-06-${runId}-t${
    String(i + 1).padStart(2, "0")
  }`;
  console.log(`turn ${i + 1}/${messages.length}: ${content}`);
  const result = await jsonFetch(`${apiUrl}/functions/v1/test-send-message`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${jwt}`,
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({
      user_id: conn.user_id,
      channel,
      scope,
      content,
      history,
      disable_debounce: true,
    }),
  });

  const body = result.json || {};
  const trace = body.conversation_turn_trace || null;
  const response = body.response || {};
  const assistant = responseText(response);
  const routeDecision = trace?.route_decision || null;
  const turnFrame = trace?.turn_frame || null;

  raw.push({
    turn: i + 1,
    requestId,
    user: content,
    status: result.res.status,
    body: result.json ?? result.text,
  });
  summary.push({
    turn: i + 1,
    requestId,
    status: result.res.status,
    ok: body.ok ?? null,
    user: content,
    assistant,
    aborted: body.aborted ?? response.aborted ?? false,
    empty_response: body.empty_response ?? assistant.trim().length === 0,
    response_owner: trace?.response_owner ?? routeDecision?.response_owner ?? null,
    selected_handler: routeDecision?.selected_handler ?? routeDecision?.skill_choisi ?? null,
    route_reason_code: routeDecision?.reason_code ?? null,
    skill_entry_ids: Object.keys(turnFrame?.skill_signals?.entry ?? {}),
    skill_lifecycle_ids: Object.keys(turnFrame?.skill_signals?.lifecycle ?? {}),
    safety_risk_band: trace?.safety_pregate?.risk_band ?? null,
    response_tool_execution: response.tool_execution ?? null,
    response_executed_tools: response.executed_tools ?? [],
    trace_id: trace?.turn_id ?? trace?.id ?? trace?.trace_id ?? null,
    trace_error: body.trace_error ?? null,
  });
  safeJsonFile(rawPath, raw);
  safeJsonFile(summaryPath, summary);

  console.log(`  -> ${result.res.status} ${assistant.slice(0, 100).replace(/\s+/g, " ")}`);
  if (!result.res.ok) break;
  history.push({
    role: "user",
    content,
    created_at: new Date(Date.now() + i * 2000).toISOString(),
  });
  history.push({
    role: "assistant",
    content: assistant,
    created_at: new Date(Date.now() + i * 2000 + 1000).toISOString(),
  });
  if (interTurnDelayMs > 0 && i < messages.length - 1) {
    await new Promise((resolve) => setTimeout(resolve, interTurnDelayMs));
  }
}

const endedAt = new Date(Date.now() + 1000).toISOString();
const encodedScope = encodeURIComponent(scope);
const encodedUserId = encodeURIComponent(conn.user_id);
const encodedFrom = encodeURIComponent(startedAt);
const encodedTo = encodeURIComponent(endedAt);
const eventPath =
  `memory_observability_events?user_id=eq.${encodedUserId}` +
  `&scope=eq.${encodedScope}` +
  `&created_at=gte.${encodedFrom}` +
  `&created_at=lte.${encodedTo}` +
  "&select=id,created_at,request_id,turn_id,channel,scope,source_component,event_name,payload" +
  "&order=created_at.asc";
const statePath =
  `user_chat_states?user_id=eq.${encodedUserId}` +
  `&scope=eq.${encodedScope}` +
  "&select=user_id,scope,current_mode,unprocessed_msg_count,last_interaction_at,temp_memory" +
  "&limit=1";
const [events, states] = await Promise.all([
  supabaseGet(apiUrl, serviceKey, eventPath),
  supabaseGet(apiUrl, serviceKey, statePath),
]);

const momentumEvents = Array.isArray(events)
  ? events.filter((event) => String(event.event_name ?? "").includes("momentum"))
  : [];
const state = Array.isArray(states) ? states[0] ?? null : null;
const storedMomentum = state?.temp_memory?.__momentum_state_v2 ?? null;
const momentumInternal = storedMomentum?._internal ?? {};
const proof = {
  ok: true,
  run_id: runId,
  scope,
  user_id: conn.user_id,
  started_at: startedAt,
  ended_at: endedAt,
  counts: {
    turns_attempted: messages.length,
    turns_recorded: summary.length,
    successful_turns: summary.filter((turn) => turn.status >= 200 && turn.status < 300).length,
    observability_events: Array.isArray(events) ? events.length : 0,
    momentum_events: momentumEvents.length,
  },
  final_state: {
    current_mode: state?.current_mode ?? null,
    unprocessed_msg_count: state?.unprocessed_msg_count ?? null,
    last_interaction_at: state?.last_interaction_at ?? null,
    momentum_current_state: storedMomentum?.current_state ?? null,
    momentum_state_reason: storedMomentum?.state_reason ?? null,
    recommended_posture: storedMomentum?.posture?.recommended_posture ?? null,
    dimensions: {
      engagement: storedMomentum?.dimensions?.engagement?.level ?? null,
      execution_traction: storedMomentum?.dimensions?.execution_traction?.level ??
        storedMomentum?.dimensions?.progression?.level ?? null,
      emotional_load: storedMomentum?.dimensions?.emotional_load?.level ?? null,
      consent: storedMomentum?.dimensions?.consent?.level ?? null,
    },
    pending_transition: storedMomentum?.stability?.pending_transition ??
      momentumInternal?.stability?.pending_transition ?? null,
    metrics: storedMomentum?.metrics ?? momentumInternal?.metrics_cache ?? null,
  },
  state_events: momentumEvents.map((event) => ({
    at: event.created_at,
    request_id: event.request_id,
    event_name: event.event_name,
    source_component: event.source_component,
    state_before: event.payload?.state_before ?? null,
    state_after: event.payload?.state_after ?? null,
    state_reason: event.payload?.state_reason ?? null,
    dimensions: event.payload?.dimensions ?? null,
    pending_transition: event.payload?.pending_transition ?? null,
  })),
  files: {
    raw: rawPath,
    summary: summaryPath,
    proof: proofPath,
  },
};

safeJsonFile(proofPath, proof);
console.log(JSON.stringify(proof, null, 2));
