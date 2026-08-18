/**
 * FF-021 · PHASE H — APRÈS CORRECTIF, assertions SÉPARÉES.
 *
 * Le correctif ne porte que sur la SOLLICITATION (les deux lanes de demande).
 * L'EFFET durable est laissé tel quel: « le plancher doit-il avaler l'effet ? »
 * est un arbitrage produit (T-7), pas un bug à réparer en passant. Les deux
 * moitiés sont donc mesurées SÉPARÉMENT — un test qui les mélange rendrait le
 * correctif invisible.
 */
import {
  evalFloor,
  iso,
  line,
  makeCoach,
  makeStudent,
  mondayOfIso,
  publishPlanFor,
  purge,
  sql,
  writeWeeklyRow,
} from "./ff021_lib.ts";
import { turn } from "../docs/nutrition-pivot/qa-web/harness.ts";

const results: Array<Record<string, unknown>> = [];
const created: string[] = [];
function record(id: string, verdict: "GREEN" | "RED" | "INFO", detail: string, proof: unknown = null) {
  results.push({ id, verdict, detail, proof });
  line(id, verdict, detail);
}

const today = iso(0);
const w0 = mondayOfIso(today);
const wm1 = mondayOfIso(iso(7));
const wm2 = mondayOfIso(iso(14));

const coaches: Awaited<ReturnType<typeof makeCoach>>[] = [];
let seats = 0;
async function nextCoach() {
  if (seats % 3 === 0) {
    const c = await makeCoach({ displayName: `FF021H Coach ${coaches.length + 1}` });
    coaches.push(c);
    created.push(c.userId);
  }
  seats++;
  return coaches[coaches.length - 1];
}
async function ownerOf(userId: string): Promise<string> {
  const out = await sql(
    `select response_owner from conversation_turn_traces where user_id = '${userId}' order by ts desc limit 1`,
  );
  return (out.split("\n")[1] ?? "").trim() || "(aucune trace)";
}
async function one(q: string): Promise<string> {
  return ((await sql(q)).split("\n")[1] ?? "").trim();
}

try {
  for (const [label, message] of [
    ["repas conforme (question de precision)", "I had grilled chicken and rice for lunch today"],
    ["repas hors plan (invitation photo)", "no time to cook today, I just ordered in"],
  ] as const) {
    for (let run = 1; run <= 3; run++) {
      const coach = await nextCoach();
      const s = await makeStudent({ coach, locale: "en-US", timezone: "Europe/Paris" });
      created.push(s.userId);
      await publishPlanFor(coach, s.userId);
      await writeWeeklyRow({ userId: s.userId, weekStart: wm2, weightKg: 80 });
      await writeWeeklyRow({ userId: s.userId, weekStart: wm1, weightKg: 78 });
      await writeWeeklyRow({ userId: s.userId, weekStart: w0, weightKg: 76 });
      // On ferme l'épisode par le CHEMIN RÉEL: le plafond de six tours.
      for (let i = 0; i < 6; i++) await turn(s, "ok");
      const closed = await one(
        `select temp_memory -> '__keel_disordered_eating_guard_state' ->> 'closed' from user_chat_states where user_id = '${s.userId}'`,
      );
      const raised = await evalFloor({ userId: s.userId, asOfLocalDate: today });
      const r = await turn(s, message);
      const owner = await ownerOf(s.userId);
      const asks = await one(
        `select count(*) from meal_precision_questions where user_id = '${s.userId}'`,
      );
      const events = await one(
        `select count(*) from protocol_events where user_id = '${s.userId}'`,
      );
      const invite = /send it over|envoie-la/i.test(r.reply ?? "");
      record(
        `H1.${run} ${label} — SOLLICITATION (corrigee)`,
        asks === "0" && !invite ? "GREEN" : "RED",
        `closed=${closed} plancher=${raised.restriction_flag} owner=${owner} demandes=${asks} invitation_photo=${invite}`,
        r.reply,
      );
      record(
        `H2.${run} ${label} — EFFET durable (arbitrage T-7, NON corrige)`,
        "INFO",
        `protocol_events=${events} reply="${(r.reply ?? "").slice(0, 130)}"`,
        r.reply,
      );
    }
  }
} finally {
  await Deno.writeTextFile(
    "scratchpad/ff021_H_results.json",
    JSON.stringify({ created, results }, null, 2),
  );
  console.log(
    `\n--- GREEN=${results.filter((r) => r.verdict === "GREEN").length} RED=${
      results.filter((r) => r.verdict === "RED").length
    } INFO=${results.filter((r) => r.verdict === "INFO").length}`,
  );
  if (Deno.env.get("FF021_KEEP") !== "1") {
    for (const id of created) {
      try {
        await purge(id);
      } catch (e) {
        console.warn(`purge ${id}: ${e}`);
      }
    }
    console.log("--- fixtures purgées");
  }
}
