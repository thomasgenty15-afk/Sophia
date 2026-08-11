/**
 * UN SEUL TOUR, par le chemin IA réel exigé par le cadre QA :
 * `POST /functions/v1/test-send-message` avec `force_full_ai=true`,
 * `scope: "app"` (le scope du produit — `chat-inbound-v1:22` le documente),
 * `apikey`/`Authorization` = ANON pour le gateway, `x-user-authorization` =
 * le JWT de la persona.
 *
 * Le JWT n'est jamais affiché.
 *
 * Usage: deno run -A qa2_say.ts <user_id> <access_token> "<message>"
 */
import { admin } from "../docs/nutrition-pivot/qa-web/harness.ts";

const [userId, token, ...rest] = Deno.args;
const message = rest.join(" ");
const URL_BASE = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const t0 = Date.now();
const res = await fetch(`${URL_BASE}/functions/v1/test-send-message`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: ANON,
    Authorization: `Bearer ${ANON}`,
    "x-user-authorization": `Bearer ${token}`,
  },
  body: JSON.stringify({
    user_id: userId,
    content: message,
    channel: "web",
    scope: "app",
    force_full_ai: true,
    disable_debounce: true,
  }),
});
const json = await res.json().catch(() => null);
const ms = Date.now() - t0;

const trace = json?.conversation_turn_trace ?? {};
console.log(`HTTP ${res.status} · ${ms} ms · ok=${json?.ok} · aborted=${json?.aborted ?? false} · empty=${json?.empty_response ?? false}`);
if (json?.error) console.log(`ERREUR: ${json.error}`);
console.log(`--- RÉPONSE VISIBLE ---`);
console.log(String(json?.response?.content ?? "<<VIDE>>"));
console.log(`--- TRACE COURTE ---`);
console.log(JSON.stringify({
  owner: trace.response_owner ?? trace.owner ?? null,
  route: trace.route_decision?.route ?? trace.route ?? null,
  skill: trace.active_skill ?? null,
  blocked: trace.route_decision?.blocked_paths ?? null,
  effects: (json?.response?.direct_effects ?? []).map((e: Record<string, unknown>) => e.tool_id ?? e.type),
}));

// La vérité est en base, jamais dans la réponse HTTP.
const db = admin();
const { data: msgs } = await db.from("chat_messages")
  .select("role,content,created_at").eq("user_id", userId).eq("scope", "app")
  .order("created_at", { ascending: false }).limit(1);
console.log(`--- DERNIER MESSAGE EN BASE (${(msgs ?? []).length}) ---`);
console.log(JSON.stringify(msgs ?? []));
