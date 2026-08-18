/**
 * FF-009 — SONDE. Un message, un élève neuf, et on relit le TRACE complet:
 * ce que le dispatcher a demandé, ce que le plancher a fait, et pourquoi
 * l'effet a été refusé.
 *
 *   deno run -A scratchpad/ff009_probe.ts "j'ai commandé une pizza margherita" fr-FR [n]
 */
import {
  admin,
  cleanup,
  makeCoach,
  makeStudent,
  publishPlanFor,
  rows,
  turn,
} from "../docs/nutrition-pivot/qa-web/harness.ts";

const TEXT = Deno.args[0] ?? "j'ai commandé une pizza margherita";
const LOCALE = Deno.args[1] ?? "fr-FR";
const N = Number(Deno.args[2] ?? "1");

const coaches = [await makeCoach({ displayName: "FF009 Probe" })];
let seats = 3;
const created: string[] = [];

for (let i = 1; i <= N; i++) {
  if (seats === 0) {
    coaches.push(await makeCoach({ displayName: `FF009 Probe ${coaches.length + 1}` }));
    seats = 3;
  }
  const coach = coaches[coaches.length - 1];
  seats--;
  const fr = LOCALE.startsWith("fr");
  const st = await makeStudent({
    coach,
    locale: LOCALE,
    timezone: fr ? "Europe/Paris" : "Europe/London",
    country: fr ? "FR" : "GB",
    fullName: "ff009_probe",
  });
  created.push(st.userId);
  await publishPlanFor(coach, st.userId, {
    timezone: fr ? "Europe/Paris" : "Europe/London",
    contentLocale: fr ? "fr-FR" : "en-GB",
  });
  const t = await turn(st, TEXT);
  await new Promise((r) => setTimeout(r, 1500));

  const ev = await rows(
    `select coalesce(plan_relation,'NULL')||' | '||coalesce(food_group_ref,'-')
       from public.protocol_events where user_id='${st.userId}'`,
  );
  const trace = await rows(
    `select jsonb_pretty(jsonb_build_object(
        'effects', turn_frame->'direct_effects',
        'route', route_decision->'direct_effects_to_run',
        'tool_status', tool_skill_run->'status',
        'blocked', tool_skill_run->'blocked_effects',
        'committed', tool_skill_run->'committed_effects'))
       from public.conversation_turn_traces
      where user_id='${st.userId}' order by ts desc limit 1`,
  );
  console.log(`\n───── run ${i} · « ${TEXT} » ─────`);
  console.log(`ROWS(${ev.length}): ${ev.join(" ;; ") || "(vide)"}`);
  console.log(`TRACE:\n${trace.join("\n")}`);
  console.log(`REPLY: ${(t.reply ?? "").replace(/\n/g, " ").slice(0, 400)}`);

  if (Deno.env.get("FF009_KEEP") !== "1") await cleanup(st.userId);
}

if (Deno.env.get("FF009_KEEP") !== "1") {
  for (const c of coaches) {
    await cleanup(c.userId);
    await admin().from("coaches").delete().eq("id", c.coachId);
  }
}
