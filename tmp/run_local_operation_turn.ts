import { createClient } from "jsr:@supabase/supabase-js@2";
import { processMessage } from "../supabase/functions/sophia-brain/router/run.ts";

type SummaryTurn = {
  turn: number;
  requestId: string;
  status: number;
  ok: boolean | null;
  user: string;
  assistant: string;
  aborted: boolean;
  abort_reason: unknown;
  empty_response: boolean;
  response_tool_execution: unknown;
  response_executed_tools: unknown[];
  response_owner: unknown;
  selected_handler: unknown;
  route_reason_code: unknown;
  operation_flow_run: unknown;
  pending_tool_skill_confirmation: unknown;
  pending_operation_resolution: unknown;
  trace_error: unknown;
};

const root = Deno.cwd();
const date = Deno.env.get("QA_DATE") ?? "2026-05-14";
const runId = Deno.env.get("QA_RUN_ID") ?? "local-direct";
const turn = Number(Deno.env.get("QA_TURN") ?? "0");
const content = (Deno.env.get("QA_CONTENT") ?? "").trim();
const channel = Deno.env.get("QA_CHANNEL") === "whatsapp" ? "whatsapp" : "web";
if (!turn || !content) throw new Error("missing QA_TURN or QA_CONTENT");

function readEnvFile(path: string): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of Deno.readTextFileSync(path).split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      out[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const fileEnv = readEnvFile(`${root}/supabase/.env`);
for (const [key, value] of Object.entries(fileEnv)) {
  if (!Deno.env.get(key)) Deno.env.set(key, value);
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_KEY") ??
  fileEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) throw new Error("missing service role key");

const connection = JSON.parse(
  Deno.readTextFileSync(`${root}/tests/real-personas/alex/connection.json`),
) as { user_id: string };
const userId = connection.user_id;
const runDir = `${root}/tests/real-personas/alex/runs/operations`;
await Deno.mkdir(runDir, { recursive: true });
const scope = `qa-operation-suggestion-test1-alex-${date}-${runId}`;
const rawPath = `${runDir}/${date}-test1-${runId}.raw.json`;
const summaryPath = `${runDir}/${date}-test1-${runId}.summary.json`;
const durablePath = `${runDir}/${date}-test1-${runId}.durable.json`;

function readJsonArray<T>(path: string): T[] {
  try {
    const parsed = JSON.parse(Deno.readTextFileSync(path));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const existingSummary = readJsonArray<SummaryTurn>(summaryPath);
const history: Array<{ role: "user" | "assistant"; content: string }> = [];
for (const item of existingSummary.slice(-12)) {
  if (item.user) history.push({ role: "user", content: item.user });
  if (item.assistant) history.push({ role: "assistant", content: item.assistant });
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const requestId = `qa-operation-suggestion-test1-alex-${date}-${runId}-t${
  String(turn).padStart(2, "0")
}`;
const startedAt = new Date().toISOString();
let response: any;
let errorText: string | null = null;
try {
  response = await processMessage(
    supabase as any,
    userId,
    content,
    history,
    {
      requestId,
      channel,
      scope,
      forceBrainTrace: true,
      forceRealAi: true,
    },
    {
      logMessages: true,
      disableDebounce: true,
      messageMetadata: {
        test_endpoint: "local-direct-operation-runner",
        test_persona: true,
        force_full_ai: true,
        request_id: requestId,
      },
    },
  );
} catch (error) {
  errorText = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  response = null;
}

const { data: traces, error: traceError } = await supabase
  .from("conversation_turn_traces")
  .select("*")
  .eq("user_id", userId)
  .gte("ts", startedAt)
  .order("ts", { ascending: false })
  .limit(1);
const trace = Array.isArray(traces) ? traces[0] ?? null : null;
const text = String(response?.content ?? "").trim();

const raw = readJsonArray<Record<string, unknown>>(rawPath);
raw.push({
  turn,
  requestId,
  user: content,
  status: errorText ? 500 : text ? 200 : 409,
  response,
  trace,
  error: errorText,
  trace_error: traceError?.message ?? null,
});
await Deno.writeTextFile(rawPath, `${JSON.stringify(raw, null, 2)}\n`);

const summary = existingSummary;
summary.push({
  turn,
  requestId,
  status: errorText ? 500 : text ? 200 : 409,
  ok: !errorText && text.length > 0,
  user: content,
  assistant: text,
  aborted: Boolean(response?.aborted),
  abort_reason: response?.abort_reason ?? null,
  empty_response: text.length === 0,
  response_tool_execution: response?.tool_execution ?? null,
  response_executed_tools: response?.executed_tools ?? [],
  response_owner: trace?.response_owner ?? trace?.route_decision?.response_owner ?? null,
  selected_handler: trace?.route_decision?.selected_handler ?? null,
  route_reason_code: trace?.route_decision?.reason_code ?? null,
  operation_flow_run: trace?.operation_flow_run ?? null,
  pending_tool_skill_confirmation:
    trace?.turn_frame?.pending_tool_skill_confirmation ?? null,
  pending_operation_resolution:
    trace?.pending_operation_resolution ?? null,
  trace_error: traceError?.message ?? errorText,
});
await Deno.writeTextFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

const { data: cards } = await supabase
  .from("user_attack_cards")
  .select("id,plan_item_id,status,content,metadata,generated_at,last_updated_at")
  .eq("user_id", userId)
  .order("generated_at", { ascending: false })
  .limit(20);
await Deno.writeTextFile(
  durablePath,
  `${JSON.stringify({ user_attack_cards: cards ?? [] }, null, 2)}\n`,
);

console.log(JSON.stringify({
  turn,
  status: errorText ? 500 : text ? 200 : 409,
  error: errorText,
  empty_response: text.length === 0,
  tool_execution: response?.tool_execution ?? null,
  executed_tools: response?.executed_tools ?? [],
  response_owner: trace?.response_owner ?? trace?.route_decision?.response_owner ?? null,
  selected_handler: trace?.route_decision?.selected_handler ?? null,
  reason_code: trace?.route_decision?.reason_code ?? null,
  operation_flow_status: trace?.operation_flow_run?.status ?? null,
  operation_id: trace?.operation_flow_run?.operation_id ?? null,
  attack_card_id: trace?.operation_flow_run?.attack_card_id ?? null,
  content_preview: text.slice(0, 500),
  rawPath,
  summaryPath,
  durablePath,
}, null, 2));
