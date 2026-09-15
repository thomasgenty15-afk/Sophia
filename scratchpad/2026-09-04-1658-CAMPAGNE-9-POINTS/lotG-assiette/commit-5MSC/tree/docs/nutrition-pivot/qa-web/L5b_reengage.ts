/** L5-b — la boucle de décrochage, ciblée sur UN élève, hors heures calmes. */
import { admin, callCron, makeCoach, makeStudent, publishPlanFor, rows, scalar } from "./harness.ts";

const coach = await makeCoach({ displayName: "Marlow", country: "GB" });
const lapsed = await makeStudent({ coach, timezone: "Etc/GMT", country: "GB", fullName: "Lapsed Student" });
await publishPlanFor(coach, lapsed.userId, { timezone: "Etc/GMT" });
await admin().from("profiles").update({
  chat_last_inbound_at: new Date(Date.now() - 5 * 86400_000).toISOString(),
} as never).eq("id", lapsed.userId);

// Demain 15h00 UTC = 15h00 local en Etc/GMT: hors heures calmes, et ≥ réel.
const d = new Date(Date.now() + 86400_000);
d.setUTCHours(15, 0, 0, 0);
const now = d.toISOString();
console.log(`élève=${lapsed.userId}  horloge=${now}`);

const dry = await callCron("keel-reengage-v1", { now, limit: 500, dry_run: true });
console.log(`DRY  → ${JSON.stringify(dry.json).slice(0, 400)}`);
console.log(`  armé ? ${JSON.stringify((dry.json?.armed_users ?? []).filter((u: any) => u.user_id === lapsed.userId))}`);

const real = await callCron("keel-reengage-v1", { now, limit: 500 });
console.log(`RÉEL → ${JSON.stringify(real.json).slice(0, 400)}`);
console.log(`épisodes  : ${JSON.stringify(await rows(`select days_inactive_at_open, last_touch_step, coalesce(touch1_sent_at::text,'<jamais>') t1, coalesce(closed_at::text,'<ouvert>') from reengagement_episodes where user_id='${lapsed.userId}'`))}`);
console.log(`messages  : ${await scalar(`select count(*) from chat_messages where user_id='${lapsed.userId}'`)}`);
console.log(`contenu   : ${JSON.stringify(await rows(`select role || ': ' || left(content,140) from chat_messages where user_id='${lapsed.userId}' order by created_at`))}`);

// FERMETURE: l'élève répond, l'épisode doit se refermer.
const { turn } = await import("./harness.ts");
await turn(lapsed, "sorry, been busy — I'm back");
console.log(`après réponse: ${JSON.stringify(await rows(`select coalesce(closed_at::text,'<TOUJOURS OUVERT>') from reengagement_episodes where user_id='${lapsed.userId}'`))}`);
