/**
 * FF-016 R2 — LA PARITÉ, EN CONDITIONS RÉELLES.
 *
 * Le test unitaire fait tourner Tier 0 et l'évaluateur sur les MÊMES entrées.
 * Ce script fait la chose que le test ne peut pas faire: il joue le tour, il
 * fait déclarer le repas substitué, il lance l'évaluateur du soir, et il relit
 * `commitment_evaluations`. « Un OUI de Tier 0 que l'évaluateur note `missed` à
 * 23 h 59 est pire que pas de Tier 0 » — c'est l'invariant de la fiche, et il
 * ne se prouve qu'ici.
 */
import { admin, callAs, nonce } from "../docs/nutrition-pivot/qa-web/harness.ts";

const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./ff016_fixture.json", import.meta.url)),
);
const db = admin();
const a = fixture.students.a;
const SECRET = (Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "").trim();
const URL_BASE = "http://127.0.0.1:54321";

async function turn(text: string) {
  const res = await callAs(a, "chat-inbound-v1", {
    client_message_id: `ff016-parity-${nonce()}`,
    kind: "text",
    text,
  });
  await new Promise((r) => setTimeout(r, 1500));
  const { data } = await db.from("chat_messages")
    .select("content").eq("user_id", a.userId).eq("role", "assistant")
    .order("created_at", { ascending: false }).limit(1);
  const rows = (data ?? []) as Array<{ content: string }>;
  console.log(`  → ${rows[0]?.content ?? "(rien)"}`);
  return res.status;
}

console.log("1. la question de substitution");
await turn("Can I swap the potatoes for rice tonight?");

console.log("2. le repas déclaré, substitution appliquée");
await turn("I had white rice with my chicken for dinner tonight instead of the potatoes.");

const { data: events } = await db.from("protocol_events")
  .select("id, food_group_ref, slot_key, local_date, commitment_id")
  .eq("user_id", a.userId)
  .order("created_at", { ascending: false })
  .limit(5);
console.log("protocol_events:", JSON.stringify(events, null, 2));

const today = new Date().toISOString().slice(0, 10);
console.log(`3. l'évaluateur du soir sur ${today}`);
const res = await fetch(`${URL_BASE}/functions/v1/evaluate-adherence-v1`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: (Deno.env.get("SUPABASE_ANON_KEY") ?? ""),
    Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") ?? ""}`,
    "x-internal-secret": SECRET,
  },
  body: JSON.stringify({ user_id: a.userId, local_date: today }),
});
console.log("evaluate-adherence-v1", res.status, (await res.text()).slice(0, 600));

const { data: evals } = await db.from("commitment_evaluations")
  .select("commitment_id, status, local_date, reason_code")
  .eq("user_id", a.userId)
  .eq("local_date", today);
console.log("commitment_evaluations:", JSON.stringify(evals, null, 2));

const { data: commitments } = await db.from("plan_commitments")
  .select("id, title, food_group_ref, autonomy")
  .eq("user_id", a.userId);
console.log("plan_commitments:", JSON.stringify(commitments, null, 2));
