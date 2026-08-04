import fs from "node:fs";
import path from "node:path";

const [
  ,
  ,
  connectionName,
  scope,
  requestId,
  outDir,
  ...contentParts
] = process.argv;

if (!connectionName || !scope || !requestId || !outDir || contentParts.length === 0) {
  console.error(
    "usage: node tmp/qa_send_execution_breakdown_turn.mjs <connection_name> <scope> <request_id> <out_dir> <content...>",
  );
  process.exit(2);
}

const content = contentParts.join(" ").trim();
const root = process.cwd();
const connectionPath = path.join(
  root,
  "tests/real-personas/qa-skill/connections",
  `${connectionName}.json`,
);
const connection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));

const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const functionsUrl = process.env.FUNCTIONS_URL || `${supabaseUrl}/functions/v1`;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!anonKey) {
  console.error("missing SUPABASE_ANON_KEY");
  process.exit(1);
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

async function main() {
  const tokenResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ refresh_token: connection.refresh_token }),
  });
  const tokenBody = await readJson(tokenResponse);
  if (!tokenResponse.ok || !tokenBody?.access_token) {
    throw new Error(`token failed: ${JSON.stringify(tokenBody)}`);
  }

  const verifyResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${tokenBody.access_token}`,
    },
  });
  const verifyBody = await readJson(verifyResponse);
  if (!verifyResponse.ok || verifyBody?.id !== connection.user_id) {
    throw new Error(`auth verify failed: ${JSON.stringify(verifyBody)}`);
  }

  const response = await fetch(`${functionsUrl}/test-send-message`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "x-user-authorization": `Bearer ${tokenBody.access_token}`,
      "x-request-id": requestId,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      user_id: connection.user_id,
      channel: "web",
      scope,
      content,
      disable_debounce: true,
      force_full_ai: true,
      client_now_iso: "2026-06-02T12:00:00.000Z",
    }),
  });
  const body = await readJson(response);
  fs.mkdirSync(outDir, { recursive: true });
  const rawPath = path.join(outDir, `${requestId}.raw.json`);
  fs.writeFileSync(rawPath, `${JSON.stringify(body, null, 2)}\n`);

  const trace = body?.conversation_turn_trace ?? {};
  const responseBody = body?.response ?? {};
  const tracePayload = trace?.trace ?? trace?.payload ?? trace ?? {};
  const router = tracePayload?.router ?? tracePayload?.routing ?? {};
  const tool = tracePayload?.tool ?? tracePayload?.tool_execution ?? {};
  const memoryPlan = tracePayload?.memory_plan ?? tracePayload?.memory ?? null;
  const summary = {
    http_status: response.status,
    ok: body?.ok ?? false,
    request_id: body?.request_id ?? requestId,
    user_id: body?.user_id ?? connection.user_id,
    scope: body?.scope ?? scope,
    content,
    assistant: String(responseBody?.content ?? ""),
    response_owner:
      responseBody?.response_owner ??
      tracePayload?.response_owner ??
      router?.response_owner ??
      null,
    selected_handler:
      responseBody?.selected_handler ??
      tracePayload?.selected_handler ??
      router?.selected_handler ??
      null,
    route_reason:
      responseBody?.route_reason ??
      tracePayload?.route_reason ??
      router?.route_reason ??
      null,
    safety:
      responseBody?.safety ??
      tracePayload?.safety ??
      tracePayload?.safety_level ??
      null,
    operation:
      responseBody?.operation ??
      tool?.operation ??
      tracePayload?.operation ??
      null,
    pending_confirmation:
      responseBody?.pending_confirmation ??
      tracePayload?.pending_confirmation ??
      null,
    executed_tools:
      responseBody?.executed_tools ??
      tracePayload?.executed_tools ??
      [],
    direct_effects:
      responseBody?.direct_effects ??
      tracePayload?.direct_effects ??
      [],
    memory_plan: memoryPlan,
    trace_error: body?.trace_error ?? null,
    raw_path: rawPath,
  };
  const summaryPath = path.join(outDir, `${requestId}.summary.json`);
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
