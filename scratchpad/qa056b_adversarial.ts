/**
 * FF-056 · LOT BOUTONS — LA REVUE ADVERSARIALE, exécutée.
 *
 * Hypothèses écrites AVANT le run (voir le rapport §hypothèses). Chacune est
 * un tap réel par `chat-inbound-v1`, et chaque verdict se lit EN BASE.
 */
import { admin } from "../docs/nutrition-pivot/qa-web/harness.ts";
const db = admin();
const P = JSON.parse(await Deno.readTextFile(new URL(`./${Deno.args[0]}`, import.meta.url)));
const URL_BASE = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

async function tap(p: { user_id: string; access_token: string }, payload: string) {
  const res = await fetch(`${URL_BASE}/functions/v1/chat-inbound-v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${p.access_token}` },
    body: JSON.stringify({ client_message_id: `adv-${crypto.randomUUID()}`, kind: "button", button_payload: payload }),
  });
  await res.json().catch(() => null);
  const msg = await db.from("chat_messages").select("content").eq("user_id", p.user_id)
    .eq("role", "assistant").lte("created_at", new Date().toISOString())
    .order("created_at", { ascending: false }).limit(1);
  if (msg.error) throw new Error(`msg: ${msg.error.message}`);
  const ep = await db.from("student_weight_divergence_episodes")
    .select("id,state,category,turn_count").eq("user_id", p.user_id);
  if (ep.error) throw new Error(`ep: ${ep.error.message}`);
  return { http: res.status, reply: String((msg.data ?? [])[0]?.content ?? "").slice(0, 130), episode: ep.data };
}

const [A, B, C] = P;

console.log("H1 · DOUBLE TAP sur un épisode DÉJÀ clos (idempotence)");
console.log(JSON.stringify(await tap(A, `KEEL_WDIV_CAT|${A.episode[0].id}|declined`)));

console.log("\nH2 · CHARGE FORGÉE citant l'épisode d'un AUTRE élève");
const before = await db.from("student_weight_divergence_episodes")
  .select("id,state,category,turn_count").eq("user_id", C.user_id);
if (before.error) throw new Error(before.error.message);
console.log("  cible AVANT:", JSON.stringify(before.data));
console.log("  " + JSON.stringify(await tap(B, `KEEL_WDIV_CAT|${C.episode[0].id}|unknown`)));
const after = await db.from("student_weight_divergence_episodes")
  .select("id,state,category,turn_count").eq("user_id", C.user_id);
if (after.error) throw new Error(after.error.message);
console.log("  cible APRÈS:", JSON.stringify(after.data));

console.log("\nH3 · CHARGE TRONQUÉE (le piège de Number(''))");
console.log(JSON.stringify(await tap(B, `KEEL_WDIV_CAT|${B.episode[0].id}|`)));

console.log("\nH4 · JETON HORS LISTE FERMÉE (`other`, non tapable)");
console.log(JSON.stringify(await tap(B, `KEEL_WDIV_CAT|${B.episode[0].id}|other`)));
