/**
 * FF-011 — QUATRIÈME PASSE: ISOLER LA CAUSE.
 *
 *  H11 — LE GROUND EST PRIS SUR L'AFFIRMATION DE L'ÉLÈVE, PAS SUR `day_facts`.
 *
 *        Mesuré en 3e passe, MÊME élève, MÊME route (`normal_reply`), MÊME
 *        décor (5 coches):
 *          T1 « this week has been horrible »            → cite « 5 dishes » ✓
 *          T3 « this week has been horrible » (identique) → ne cite plus rien ✗
 *        La seule variable entre T1 et T3 est l'HISTORIQUE (FF-023).
 *
 *        Deux causes se disputent le résultat, et il faut les séparer:
 *          (a) l'HISTORIQUE contaminé — une affirmation passée fait ground;
 *          (b) le MESSAGE COURANT — une affirmation alimentaire dans le tour
 *              lui-même suffit à écraser `day_facts`.
 *
 *        On isole (b): élèves NEUFS, un SEUL tour chacun, donc historique
 *        vide. Si le fait n'est pas cité dès le premier tour, la cause est le
 *        message, pas l'historique — et la ceinture est structurellement
 *        aveugle aux deux (ni verdict interdit, ni chiffre: rien à mordre).
 *
 *        Groupe témoin: même décor, message SANS affirmation alimentaire.
 */
import {
  admin,
  type Coach,
  cleanup,
  makeCoach,
  makeStudent,
  publishPlanFor,
  sql,
  turn,
} from "./harness.ts";

const created: string[] = [];

async function freshStudentWithFacts(coach: Coach) {
  const s = await makeStudent({
    coach, locale: "en-US", timezone: "Europe/Paris", country: "FR",
    fullName: "ff011 adv4",
  });
  created.push(s.userId);
  await publishPlanFor(coach, s.userId, { timezone: "Europe/Paris" });
  const dayOut = await sql(
    `select to_char((now() at time zone 'Europe/Paris')::date,'YYYY-MM-DD');`,
  );
  const day = dayOut.split("\n")[1].trim();
  const mealId = crypto.randomUUID();
  const { error } = await admin().from("protocol_events").insert(
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
  if (error) throw new Error(error.message);
  return { s, day };
}

/** Une affirmation que la base CONTREDIT (5 coches aujourd'hui). */
const WITH_CLAIM = "this week has been horrible, I missed all my meals this week";
/** Le même découragement, SANS affirmation alimentaire. */
const WITHOUT_CLAIM = "this week has been horrible";

type Row = { arm: string; cites: boolean; echoes: boolean; reply: string };
const rows: Row[] = [];

try {
  // Plafond de 3 élèves par coach: deux coachs pour six élèves.
  for (const arm of ["WITH_CLAIM", "WITHOUT_CLAIM"] as const) {
    const coach = await makeCoach({ displayName: `ff011 adv4 ${arm}` });
    console.log("\n" + "=".repeat(78));
    console.log(`BRAS ${arm} — 3 élèves NEUFS, UN SEUL tour chacun`);
    console.log("=".repeat(78));
    for (let i = 1; i <= 3; i++) {
      const { s, day } = await freshStudentWithFacts(coach);
      const n = await sql(
        `select count(*) from protocol_events where user_id='${s.userId}'
           and local_date='${day}' and source='quick_tap' and disqualified_reason is null;`,
      );
      const msg = arm === "WITH_CLAIM" ? WITH_CLAIM : WITHOUT_CLAIM;
      const r = await turn(s, msg);
      const reply = r.reply ?? "";
      const cites = /\b(5|five)\b/i.test(reply);
      const echoes =
        /you missed all (your|of your) meals|missed all your meals|you skipped/i
          .test(reply);
      rows.push({ arm, cites, echoes, reply });
      console.log(`  élève ${i} (décor ${n.split("\n")[1]} coches) — 1er tour, historique VIDE`);
      console.log(`    cite les 5 coches: ${cites ? "OUI" : "NON ❌"} · reprend l'affirmation: ${echoes}`);
      console.log(`    ${JSON.stringify(reply)}`);
    }
  }

  console.log("\n" + "=".repeat(78));
  console.log("RÉSULTAT");
  console.log("=".repeat(78));
  for (const arm of ["WITH_CLAIM", "WITHOUT_CLAIM"]) {
    const set = rows.filter((r) => r.arm === arm);
    const c = set.filter((r) => r.cites).length;
    const e = set.filter((r) => r.echoes).length;
    console.log(`${arm.padEnd(14)} | cite day_facts ${c}/${set.length} | reprend l'affirmation ${e}/${set.length}`);
  }
} finally {
  console.log("\nNETTOYAGE");
  for (const id of created) {
    await cleanup(id);
    console.log(`  supprimé ${id}`);
  }
}
