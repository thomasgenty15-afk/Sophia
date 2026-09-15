// One-turn QA sender for the real Sophia AI path (test-send-message, force_full_ai).
// Usage: node send.mjs "<message>" <turnNumber>
// Reads SB_URL, ANON_KEY, ACCESS_TOKEN from env. Never prints the JWT.
import { writeFileSync, mkdirSync } from "node:fs";

const SB_URL = process.env.SB_URL;
const ANON = process.env.ANON_KEY;
const TOKEN = process.env.ACCESS_TOKEN;
const message = process.argv[2];
const turn = process.argv[3] ?? "x";
if (!SB_URL || !ANON || !TOKEN) {
  console.error("missing env SB_URL/ANON_KEY/ACCESS_TOKEN");
  process.exit(2);
}
if (!message) {
  console.error("missing message arg");
  process.exit(2);
}

const dir = decodeURIComponent(new URL(".", import.meta.url).pathname);
mkdirSync(dir, { recursive: true });

const res = await fetch(`${SB_URL}/functions/v1/test-send-message`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: ANON,
    Authorization: `Bearer ${ANON}`,
    "x-user-authorization": `Bearer ${TOKEN}`,
  },
  body: JSON.stringify({
    message,
    channel: "web",
    scope: "web",
    force_full_ai: true,
    client_timezone: "Europe/Paris",
  }),
});

const status = res.status;
let j;
try {
  j = await res.json();
} catch (e) {
  console.log(JSON.stringify({ http_status: status, parse_error: String(e) }, null, 2));
  process.exit(1);
}

writeFileSync(`${dir}/turn${turn}.full.json`, JSON.stringify(j, null, 2));

const t = j.conversation_turn_trace ?? {};
const rd = t.route_decision ?? {};
const de = t.direct_effects ?? j.response?.direct_effects ?? null;
const ledger = t.effect_ledger ?? null;
const tf = t.turn_frame ?? {};

const short = {
  http_status: status,
  ok: j.ok,
  aborted: j.aborted,
  empty_response: j.empty_response,
  content: String(j.response?.content ?? "").trim(),
  response_owner: rd.response_owner ?? t.response_owner ?? null,
  selected_handler: rd.selected_handler ?? rd.handler ?? null,
  route_reason: rd.route_reason ?? rd.reason ?? null,
  active_flow: tf.active_flow?.flow ?? tf.active_flow ?? null,
  safety: rd.safety ?? t.safety ?? null,
  direct_effects: de,
  pending_confirmation: rd.pending_confirmation ?? t.pending_confirmation ?? null,
  tool_skill_run: t.tool_skill_run ? {
    tool: t.tool_skill_run.tool ?? t.tool_skill_run.skill ?? null,
    status: t.tool_skill_run.status ?? null,
  } : null,
  effect_ledger: ledger,
};
console.log(JSON.stringify(short, null, 2));
