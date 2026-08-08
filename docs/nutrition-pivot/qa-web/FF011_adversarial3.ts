/**
 * FF-011 — TROISIÈME PASSE: OÙ PASSE LA MATIÈRE ?
 *
 *  H10 — LA MATIÈRE FF-011 N'ARRIVE QUE SUR CERTAINES ROUTES.
 *        Mesuré en H8: MÊME décor (5 coches aujourd'hui), MÊME élève, et la
 *        réponse cite « 5 dishes » sur « this week has been horrible » mais
 *        déclare « the only hard fact I have from today is [lunch unknowns] »
 *        dès que le message porte en plus une affirmation alimentaire.
 *
 *        Deux causes possibles, et elles se distinguent par la ROUTE:
 *          (a) le bloc est tronqué PAR LA QUEUE (rabbit hole §9) — il est le
 *              DERNIER des sept blocs, donc le premier à sauter;
 *          (b) le tour part sur une autre lane, qui ne porte pas le bloc —
 *              la famille `keel-doctrine-injected-one-lane-locked-six`.
 *
 *        Le même élève reçoit les deux messages, à la suite, et on lit la
 *        route de chacun. Un élève unique élimine toute différence de décor.
 */
import {
  admin,
  cleanup,
  makeCoach,
  makeStudent,
  publishPlanFor,
  sql,
  turn,
} from "./harness.ts";

const created: string[] = [];
try {
  const coach = await makeCoach({ displayName: "ff011 adv3" });
  const s = await makeStudent({
    coach, locale: "en-US", timezone: "Europe/Paris", country: "FR",
    fullName: "ff011 adv3",
  });
  created.push(s.userId);
  await publishPlanFor(coach, s.userId, { timezone: "Europe/Paris" });

  const dayOut = await sql(
    `select to_char((now() at time zone 'Europe/Paris')::date,'YYYY-MM-DD');`,
  );
  const day = dayOut.split("\n")[1].trim();
  const mealId = crypto.randomUUID();
  await admin().from("protocol_events").insert(
    ["Roast chicken", "Salmon", "Lentil curry", "Beef stir fry", "Cod and greens"]
      .map((title, index) => ({
        user_id: s.userId,
        occurred_at: new Date().toISOString(),
        local_date: day,
        source: "quick_tap",
        source_message_id: `meal_tick:${mealId}:${index}`,
        student_note: title,
        content_locale: "en-GB",
        evidence_weight: 0.4,
      })) as never,
  );
  const decor = await sql(
    `select count(*) from protocol_events where user_id='${s.userId}'
       and local_date='${day}' and source='quick_tap' and disqualified_reason is null;`,
  );
  console.log(`DÉCOR: ${decor.split("\n")[1]} coches le ${day}\n`);

  const MESSAGES = [
    "this week has been horrible",
    "this week has been horrible, I missed all my meals this week",
    "this week has been horrible",
    "this week has been horrible, I skipped every lunch this week",
  ];

  for (let i = 0; i < MESSAGES.length; i++) {
    const r = await turn(s, MESSAGES[i]);
    const trace = await sql(
      `select coalesce(route_decision->>'response_owner','—'),
              coalesce(route_decision->>'path','—'),
              coalesce(response_owner,'—'),
              coalesce(dispatcher_run->>'intent','—')
       from conversation_turn_traces where user_id='${s.userId}'
       order by created_at desc limit 1;`,
    );
    const reply = r.reply ?? "";
    const cites5 = /\b(5|five)\b/i.test(reply);
    console.log("-".repeat(78));
    console.log(`T${i + 1} « ${MESSAGES[i]} »`);
    console.log(`   route (owner|path|response_owner|intent): ${trace.split("\n")[1]}`);
    console.log(`   cite les 5 coches: ${cites5 ? "OUI" : "NON ❌"}`);
    console.log(`   ${JSON.stringify(reply)}`);
  }
} finally {
  console.log("\nNETTOYAGE");
  for (const id of created) {
    await cleanup(id);
    console.log(`  supprimé ${id}`);
  }
}
