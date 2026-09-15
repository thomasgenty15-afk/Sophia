/** Étape 3: le « Oui » de FF-028 sur la proposition née de la divergence. */
import { admin } from "../docs/nutrition-pivot/qa-web/harness.ts";
const db = admin();
const personas = JSON.parse(await Deno.readTextFile(new URL(`./${Deno.args[0]}`, import.meta.url)));
const verb = Deno.args[1] ?? "ACCEPT";
for (const p of personas) {
  const props = await db.from("student_daily_recommendations")
    .select("id,action_id,state").eq("user_id", p.user_id);
  if (props.error) throw new Error(`reco: ${props.error.message}`);
  const row = (props.data ?? [])[0];
  if (!row) { console.log(`${p.user_id.slice(0,8)} AUCUNE PROPOSITION`); continue; }
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/chat-inbound-v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "", Authorization: `Bearer ${p.access_token}` },
    body: JSON.stringify({ client_message_id: `qa056b-${crypto.randomUUID()}`, kind: "button", button_payload: `KEEL_RECO_${verb}_${row.id}` }),
  });
  const eps = await db.from("student_weight_divergence_episodes").select("state,category,turn_count,closed_at").eq("user_id", p.user_id);
  if (eps.error) throw new Error(`ep: ${eps.error.message}`);
  const after = await db.from("student_daily_recommendations").select("state,applied_at").eq("id", row.id).maybeSingle();
  if (after.error) throw new Error(`reco2: ${after.error.message}`);
  const rhythm = await db.from("student_goals").select("eating_rhythm").eq("user_id", p.user_id).maybeSingle();
  const msg = await db.from("chat_messages").select("content").eq("user_id", p.user_id).eq("role","assistant")
    .lte("created_at", new Date().toISOString()).order("created_at",{ascending:false}).limit(1);
  console.log(JSON.stringify({
    user: p.user_id.slice(0,8), http: res.status, action: row.action_id,
    proposal: after.data, episode: eps.data, rhythm: rhythm.data?.eating_rhythm ?? null,
    reply: String((msg.data ?? [])[0]?.content ?? "").slice(0,120),
  }));
}
