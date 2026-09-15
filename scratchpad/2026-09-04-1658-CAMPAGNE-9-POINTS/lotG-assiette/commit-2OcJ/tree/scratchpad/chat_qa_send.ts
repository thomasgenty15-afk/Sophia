/**
 * Envoie UN message à `chat-inbound-v1` en tant qu'élève, et rend la réponse
 * visible telle que l'élève la lit.
 *
 * Usage:
 *   deno run --allow-all scratchpad/chat_qa_send.ts <persona.json> "<texte>"
 */
const URL_BASE = "http://127.0.0.1:54321";
const ANON = Deno.env.get("QA_ANON_KEY")!;

const personaPath = Deno.args[0];
const text = Deno.args[1];
const persona = JSON.parse(await Deno.readTextFile(personaPath));

const started = Date.now();
const res = await fetch(`${URL_BASE}/functions/v1/chat-inbound-v1`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    apikey: ANON,
    authorization: `Bearer ${persona.accessToken}`,
  },
  body: JSON.stringify({
    kind: "text",
    text,
    client_message_id: `qa-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  }),
});
const elapsed = Date.now() - started;
const raw = await res.text();
let body: unknown;
try {
  body = JSON.parse(raw);
} catch {
  body = raw;
}
console.log(JSON.stringify({ status: res.status, ms: elapsed, body }, null, 2));
