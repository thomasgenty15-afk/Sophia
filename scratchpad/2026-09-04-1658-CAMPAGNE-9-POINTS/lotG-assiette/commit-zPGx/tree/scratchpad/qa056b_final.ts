import { admin } from "../docs/nutrition-pivot/qa-web/harness.ts";
const db = admin();
const P = JSON.parse(await Deno.readTextFile(new URL("./qa056b_personas_E.json", import.meta.url)));
const U = Deno.env.get("SUPABASE_URL") ?? "", A = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const last = async (u: string) => {
  const m = await db.from("chat_messages").select("content").eq("user_id", u).eq("role","assistant")
    .lte("created_at", new Date().toISOString()).order("created_at",{ascending:false}).limit(1);
  if (m.error) throw new Error(m.error.message);
  return String((m.data ?? [])[0]?.content ?? "");
};
const ep = async (u: string) => {
  const e = await db.from("student_weight_divergence_episodes").select("state,category,turn_count").eq("user_id", u);
  if (e.error) throw new Error(e.error.message);
  return e.data;
};
const tap = async (p: any, payload: string) => {
  const r = await fetch(`${U}/functions/v1/chat-inbound-v1`, { method: "POST",
    headers: { "Content-Type": "application/json", apikey: A, Authorization: `Bearer ${p.access_token}` },
    body: JSON.stringify({ client_message_id: `f-${crypto.randomUUID()}`, kind: "button", button_payload: payload }) });
  await r.json().catch(() => null); return r.status;
};
const say = async (p: any, text: string) => {
  const r = await fetch(`${U}/functions/v1/test-send-message`, { method: "POST",
    headers: { "Content-Type": "application/json", apikey: A, Authorization: `Bearer ${A}`, "x-user-authorization": `Bearer ${p.access_token}` },
    body: JSON.stringify({ user_id: p.user_id, content: text, channel: "web", scope: "app", force_full_ai: true, disable_debounce: true }) });
  const j = await r.json().catch(() => null); return { http: r.status, reply: String(j?.response?.content ?? "") };
};

// ── H5 · ÉPISODE PÉRIMÉ (ouvert il y a 5 jours, plafond = 2) ───────────────
const p0 = P[0];
await db.from("student_weight_divergence_episodes")
  .update({ opened_local_date: new Date(Date.now() - 5*864e5).toISOString().slice(0,10) } as never)
  .eq("id", p0.episode[0].id).eq("user_id", p0.user_id);
console.log("H5 · avant:", JSON.stringify(await ep(p0.user_id)));
console.log("H5 · http=", await tap(p0, `KEEL_WDIV_CAT|${p0.episode[0].id}|unknown`));
console.log("H5 · après:", JSON.stringify(await ep(p0.user_id)), "|", (await last(p0.user_id)).slice(0,90));

// ── ⑤ · LE TEXTE LIBRE SURVIT, AVEC LES BOUTONS ATTACHÉS ──────────────────
const p1 = P[1];
const t = await say(p1, "j'ai commencé un traitement pour la thyroïde il y a trois semaines");
console.log("\n⑤ · http=", t.http, "|", t.reply.slice(0,140));
console.log("⑤ · épisode:", JSON.stringify(await ep(p1.user_id)));

// ── full_chars · un tour NORMAL, épisode clos ─────────────────────────────
const p2 = P[2];
await tap(p2, `KEEL_WDIV_CAT|${p2.episode[0].id}|not_a_divergence`);
console.log("\nfull_chars · épisode clos:", JSON.stringify(await ep(p2.user_id)));
const n = await say(p2, "je peux remplacer les pommes de terre par du riz ?");
console.log("full_chars · tour normal http=", n.http, "|", n.reply.slice(0,100));
