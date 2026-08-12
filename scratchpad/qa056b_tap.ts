/**
 * FF-056 · LOT BOUTONS — UN TAP, par le chemin produit réel.
 *
 * `chat-inbound-v1` et PAS `test-send-message`: les taps ne passent pas par la
 * porte de test (elle n'envoie que du texte), et `handleDeterministicButton`
 * est le maillon qu'on veut mesurer. `apikey` = ANON pour le gateway,
 * `Authorization` = le JWT de la persona (c'est lui qui désigne l'élève —
 * l'identifiant ne fait jamais l'aller-retour par le corps).
 *
 * Le JWT n'est jamais affiché.
 *
 * Usage: deno run -A qa056b_tap.ts <user_id> <access_token> <payload> [text]
 */
import { admin } from "../docs/nutrition-pivot/qa-web/harness.ts";

const [userId, token, payload, ...rest] = Deno.args;
const label = rest.join(" ");
const URL_BASE = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const t0 = Date.now();
const res = await fetch(`${URL_BASE}/functions/v1/chat-inbound-v1`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: ANON,
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    client_message_id: `qa056b-${crypto.randomUUID()}`,
    kind: "button",
    button_payload: payload,
    text: label || undefined,
  }),
});
const json = await res.json().catch(() => null);
console.log(
  `HTTP ${res.status} · ${Date.now() - t0} ms · handled=${
    json?.handled_as ?? json?.handled ?? "?"
  }`,
);
if (json?.error) console.log(`ERREUR: ${JSON.stringify(json)}`);

// LA VÉRITÉ EST EN BASE, JAMAIS DANS LA RÉPONSE HTTP.
const db = admin();
const msgs = await db.from("chat_messages")
  .select("role,content,metadata,created_at")
  .eq("user_id", userId).eq("scope", "app")
  .order("created_at", { ascending: false }).limit(2);
if (msgs.error) throw new Error(`chat_messages: ${msgs.error.message}`);
const eps = await db.from("student_weight_divergence_episodes")
  .select("id,state,category,turn_count,observation_opened_on,observation_ends_on,closed_at")
  .eq("user_id", userId);
if (eps.error) throw new Error(`episodes: ${eps.error.message}`);
const props = await db.from("student_daily_recommendations")
  .select("id,action_id,state,applied_at,proposed_text")
  .eq("user_id", userId);
if (props.error) throw new Error(`recommendations: ${props.error.message}`);
const rhythm = await db.from("student_goals")
  .select("eating_rhythm").eq("user_id", userId).maybeSingle();

console.log("--- RÉPONSE (base) ---");
for (const m of (msgs.data ?? []).slice().reverse()) {
  const meta = (m.metadata ?? {}) as Record<string, unknown>;
  console.log(
    `[${m.role}] ${String(m.content).replace(/\n/g, " / ")}`,
  );
  const b = (meta.buttons ?? []) as Array<{ payload: string; label: string }>;
  if (b.length > 0) {
    console.log(`   boutons: ${b.map((x) => `${x.label}=${x.payload}`).join(" | ")}`);
  }
}
console.log("--- ÉPISODE ---");
console.log(JSON.stringify(eps.data));
console.log("--- PROPOSITIONS FF-028 ---");
console.log(JSON.stringify(props.data));
if (!rhythm.error) console.log("--- RYTHME ---", JSON.stringify(rhythm.data));
