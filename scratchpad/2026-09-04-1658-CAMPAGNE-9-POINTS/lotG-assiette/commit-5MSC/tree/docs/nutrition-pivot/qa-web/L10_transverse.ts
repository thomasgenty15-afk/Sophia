/** L10 — RLS élève, privilèges anon, erreurs serveur. */
import { ANON, URL_BASE, makeCoach, makeStudent, publishPlanFor, rows, scalar, turn } from "./harness.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const lines: string[] = [];
const say = (s: string) => { console.log(s); lines.push(s); };

const asUser = (token: string) =>
  createClient(URL_BASE, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });

const coachA = await makeCoach({ displayName: "Alpha", country: "GB" });
const coachB = await makeCoach({ displayName: "Beta", country: "GB" });
const alice = await makeStudent({ coach: coachA, timezone: "Europe/London", country: "GB", fullName: "Alice" });
const bob = await makeStudent({ coach: coachB, timezone: "Europe/London", country: "GB", fullName: "Bob" });
await publishPlanFor(coachA, alice.userId, { timezone: "Europe/London" });
await publishPlanFor(coachB, bob.userId, { timezone: "Europe/London" });
await turn(alice, "j'ai mangé du poulet");
await turn(bob, "je suis allergique aux arachides");

say(`${"█".repeat(74)}\n1 — RLS: un élève ne lit QUE ses lignes\n${"█".repeat(74)}`);
const aliceC = asUser(alice.accessToken);
for (const table of ["chat_messages", "protocol_events", "student_safety_constraints", "student_week_plans", "meal_precision_questions", "plan_commitments", "plan_versions"]) {
  const mine = await aliceC.from(table).select("*");
  const ids = new Set(((mine.data ?? []) as any[]).map((r) => String(r.user_id ?? r.student_id ?? "")));
  const foreign = [...ids].filter((i) => i && i !== alice.userId);
  say(`  ${table.padEnd(28)} → ${mine.error ? `refus: ${mine.error.message.slice(0, 50)}` : `${(mine.data ?? []).length} ligne(s)`} ${
    foreign.length === 0 ? "✅ aucune ligne d'autrui" : `🔴 LIGNES D'AUTRUI: ${JSON.stringify(foreign)}`
  }`);
}
// Écriture croisée: Alice tente d'écrire chez Bob.
const cross = await aliceC.from("chat_messages").insert({ user_id: bob.userId, scope: "app", role: "user", content: "intrusion" } as never);
say(`  écriture chez Bob → ${cross.error ? `✅ refusée: ${cross.error.message.slice(0, 70)}` : "🔴 ACCEPTÉE"}`);

say(`\n${"█".repeat(74)}\n2 — PRIVILÈGES anon (jamais 'public')\n${"█".repeat(74)}`);
const PIVOT = ["protocol_events", "chat_messages", "student_week_plans", "student_safety_constraints", "student_daily_checkins", "planned_deviations", "meal_precision_questions", "outbound_messages", "coach_syntheses", "reengagement_episodes", "contract_change_requests", "coach_clients", "coach_doctrines", "coaches", "coach_invitations", "plan_versions", "plan_commitments"];
const granted: string[] = [];
for (const t of PIVOT) {
  const has = await rows(`select has_table_privilege('anon','public.${t}','SELECT')::text || ',' || has_table_privilege('anon','public.${t}','INSERT')::text || ',' || has_table_privilege('anon','public.${t}','UPDATE')::text || ',' || has_table_privilege('anon','public.${t}','DELETE')::text as v`);
  const rls = await rows(`select relrowsecurity::text from pg_class where oid='public.${t}'::regclass`);
  const any = (has[0] ?? "").includes("t");
  if (any) granted.push(t);
  say(`  ${t.padEnd(28)} anon(S,I,U,D)=${has[0]}  rls=${rls[0]} ${any ? "⚠️ privilèges présents" : "✅ aucun"}`);
}
say(`\n  tables avec un privilège anon : ${granted.length}/${PIVOT.length}`);
// La preuve qui compte: anon lit-il RÉELLEMENT quelque chose ?
const anonC = createClient(URL_BASE, ANON, { auth: { persistSession: false } });
for (const t of granted.slice(0, 8)) {
  const r = await anonC.from(t).select("*").limit(3);
  say(`  anon lit ${t.padEnd(28)} → ${r.error ? `refus (${r.error.code})` : `${(r.data ?? []).length} ligne(s)`} ${
    !r.error && (r.data ?? []).length > 0 ? "🔴 FUITE" : "✅"
  }`);
}

say(`\n${"█".repeat(74)}\n3 — system_error_logs (30 dernières minutes)\n${"█".repeat(74)}`);
say(JSON.stringify(await rows(
  `select coalesce(function_name,'?') || ' | ' || coalesce(severity,'?') || ' | ' || left(coalesce(message,''),110) as v from system_error_logs where created_at > now() - interval '30 minutes' order by created_at desc limit 25`,
).catch((e) => [`<${e.message}>`]), null, 1));

await Deno.writeTextFile(new URL("./L10-transverse.txt", import.meta.url), lines.join("\n") + "\n");
