/**
 * FF-011 — REVUE ADVERSARIALE, SECONDE PASSE.
 *
 * Deux hypothèses NÉES de la première passe. Écrites avant d'être testées.
 *
 *  H8 — L'ÉCHO COMPLAISANT (« hollow agreement »).
 *       Observé en H7: quand le message de l'élève porte une auto-affirmation
 *       négative — « I missed all my meals this week » — le composeur la
 *       reprend comme « the useful fact » AU LIEU de citer la matière chargée,
 *       ALORS MÊME QUE `day_facts` la contredit (5 coches aujourd'hui).
 *
 *       C'est pire qu'un encouragement creux, et c'est invisible à TOUTES les
 *       ceintures: pas de verdict (`findQualifyingVerdict` muet), pas de
 *       chiffre (`allowedNumbers` n'a rien à juger — il n'y a AUCUN nombre).
 *       La fiche demande « qu'on me dise ce que j'ai réellement fait » (job
 *       story 2) et R1 dit « groundé ou court »; confirmer une contre-vérité
 *       n'est ni l'un ni l'autre.
 *
 *  H9 — LA DÉCLARATION DE REPAS S'ÉCRIT EN DOUBLE.
 *       Observé en extra-hard 2: UN tour (« …, I had grilled chicken and rice
 *       for lunch today ») a produit DEUX lignes `protocol_events` identiques.
 *       Un fait compté deux fois fausse l'adhérence, donc la matière de
 *       FF-011 elle-même. À confirmer, et à attribuer: FF-017, pas FF-011.
 */
import {
  admin,
  type Coach,
  cleanup,
  makeCoach,
  makeStudent,
  publishPlanFor,
  sql,
  type Student,
  turn,
} from "./harness.ts";

async function localDateOf(userId: string): Promise<string> {
  const out = await sql(
    `select to_char((now() at time zone coalesce(p.timezone,'UTC'))::date,'YYYY-MM-DD')
     from profiles p where p.id='${userId}';`,
  );
  return out.split("\n")[1]?.trim() ?? new Date().toISOString().slice(0, 10);
}

async function seedTicks(userId: string, localDate: string, titles: string[]) {
  const mealId = crypto.randomUUID();
  const { error } = await admin().from("protocol_events").insert(
    titles.map((title, index) => ({
      user_id: userId,
      occurred_at: new Date().toISOString(),
      local_date: localDate,
      source: "quick_tap",
      source_message_id: `meal_tick:${mealId}:${index}`,
      student_note: title,
      content_locale: "en-GB",
      evidence_weight: 0.4,
    })) as never,
  );
  if (error) throw new Error(`seedTicks: ${error.message}`);
}

async function makeReadyStudent(coach: Coach): Promise<Student> {
  const s = await makeStudent({
    coach, locale: "en-US", timezone: "Europe/Paris", country: "FR",
    fullName: "ff011 adv2",
  });
  await publishPlanFor(coach, s.userId, { timezone: "Europe/Paris" });
  return s;
}

const created: string[] = [];

try {
  // ── H8 ────────────────────────────────────────────────────────────────────
  console.log("=".repeat(78));
  console.log("H8 — L'ÉCHO COMPLAISANT: l'affirmation de l'élève contre les FAITS");
  console.log("=".repeat(78));
  const c = await makeCoach({ displayName: "ff011 adv2" });
  const s = await makeReadyStudent(c);
  created.push(s.userId);
  const day = await localDateOf(s.userId);
  await seedTicks(s.userId, day, [
    "Roast chicken", "Salmon", "Lentil curry", "Beef stir fry", "Cod and greens",
  ]);
  const decor = await sql(
    `select count(*) as coches from protocol_events
     where user_id='${s.userId}' and local_date='${day}'
       and source='quick_tap' and disqualified_reason is null;`,
  );
  console.log(`  décor: ${decor.split("\n")[1]} coches AUJOURD'HUI (${day})`);
  console.log(`  message: « I missed all my meals this week » — CONTREDIT par la base\n`);

  let echoed = 0;
  let citedTruth = 0;
  for (let i = 1; i <= 3; i++) {
    const r = await turn(s, "this week has been horrible, I missed all my meals this week");
    const reply = r.reply ?? "";
    // L'écho: la réponse REPREND l'affirmation fausse à son compte.
    const echo =
      /you (missed|skipped) all (your|of your) meals|you missed all your meals|missed all your meals/i
        .test(reply);
    // La vérité: la réponse cite le compte réel.
    const truth = /\b(5|five)\b/i.test(reply);
    if (echo) echoed += 1;
    if (truth) citedTruth += 1;
    console.log(`  passe ${i}: écho=${echo} cite_les_5_coches=${truth}`);
    console.log(`     ${JSON.stringify(reply)}`);
  }
  console.log(
    `\n  >>> H8: ${echoed > 0 ? "CONFIRMÉE" : "RÉFUTÉE"} — écho ${echoed}/3, ` +
      `citation du fait réel ${citedTruth}/3`,
  );

  // ── H9 ────────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(78));
  console.log("H9 — la DÉCLARATION DE REPAS s'écrit-elle en DOUBLE ? (attribution FF-017)");
  console.log("=".repeat(78));
  const s2 = await makeReadyStudent(c);
  created.push(s2.userId);
  const before = await sql(
    `select count(*) from protocol_events where user_id='${s2.userId}' and source='chat';`,
  );
  console.log(`  avant: ${before.split("\n")[1]} ligne(s) 'chat'`);
  const r2 = await turn(
    s2,
    "this week has been horrible, I had grilled chicken and rice for lunch today",
  );
  const after = await sql(
    `select count(*) as n, student_note from protocol_events
     where user_id='${s2.userId}' and source='chat' group by student_note;`,
  );
  console.log(`  après:\n${after}`);
  console.log(`  reply: ${JSON.stringify(r2.reply)}`);
  const n = Number((after.split("\n")[1] ?? "0").split("|")[0] ?? 0);
  console.log(
    `\n  >>> H9: ${n > 1 ? `CONFIRMÉE — ${n} lignes pour UN tour` : `RÉFUTÉE — ${n} ligne(s)`}`,
  );
} finally {
  console.log("\nNETTOYAGE");
  for (const id of created) {
    await cleanup(id);
    console.log(`  supprimé ${id}`);
  }
}
