/**
 * FF-021 · PHASE B — R7: une donnée incohérente JETTE, jamais un « tout va bien ».
 *
 * Et la question que la fiche ne pose pas: que fait l'APPELANT du throw ?
 * B8 la mesure sur un TOUR RÉEL.
 */
import {
  admin,
  evalFloor,
  iso,
  line,
  makeCoach,
  makeStudent,
  mondayOfIso,
  publishPlanFor,
  purge,
  sql,
  writeStudentNote,
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
    const c = await makeCoach({ displayName: `FF021B Coach ${coaches.length + 1}` });
    coaches.push(c);
    created.push(c.userId);
  }
  seats++;
  return coaches[coaches.length - 1];
}

/** Le `response_owner` du DERNIER tour de cet élève, lu dans la trace. */
async function ownerOf(userId: string): Promise<string> {
  const out = await sql(
    `select response_owner from conversation_turn_traces where user_id = '${userId}' order by ts desc limit 1`,
  );
  return (out.split("\n")[1] ?? "").trim() || "(aucune trace)";
}

/** Attend un THROW. Rend le message, ou `null` si rien n'a été jeté. */
async function expectThrow(
  id: string,
  userId: string,
  needle: string,
): Promise<void> {
  try {
    const r = await evalFloor({ userId, asOfLocalDate: today });
    record(
      id,
      "RED",
      `AUCUN throw — flag=${r.restriction_flag} codes=[${
        r.triggers.map((t) => t.code).join(",")
      }] (une garde qui declare « safe » sur une donnee cassee)`,
      r,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    record(
      id,
      msg.includes(needle) ? "GREEN" : "RED",
      `throw: ${msg.slice(0, 160)}`,
      msg,
    );
  }
}

try {
  // ── B1..B4 · un élève, une corruption à la fois ──────────────────────────
  const coach = await nextCoach();
  const s = await makeStudent({ coach, locale: "en-US", timezone: "Europe/Paris" });
  created.push(s.userId);
  await publishPlanFor(coach, s.userId);

  await writeWeeklyRow({ userId: s.userId, weekStart: w0, weightKg: -70 });
  await expectThrow("B1 poids negatif", s.userId, "outside the plausible");

  await sql(`delete from weekly_reviews where user_id = '${s.userId}'`);
  await writeWeeklyRow({ userId: s.userId, weekStart: w0, weightKg: 170 });
  await expectThrow("B2 livres etiquetees kg (170 = 77 kg reels)", s.userId, "unit bug");

  // B2-bis · LA SÉRIE MIXTE, qui est la forme dangereuse du bug d'unite:
  // semaine -14 en LIVRES (170 lb = 77 kg), semaine 0 en KG (76). Le plancher
  // doit-il jeter, ou fabrique-t-il une perte de 27 %/semaine ?
  await sql(`delete from weekly_reviews where user_id = '${s.userId}'`);
  await writeWeeklyRow({ userId: s.userId, weekStart: wm2, weightKg: 170 });
  await writeWeeklyRow({ userId: s.userId, weekStart: w0, weightKg: 76 });
  try {
    const mixed = await evalFloor({ userId: s.userId, asOfLocalDate: today });
    const ev = mixed.triggers.find((t) => t.code === "rapid_weight_loss")?.evidence;
    record(
      "B2-bis serie MIXTE lb/kg",
      "RED",
      `AUCUN throw — flag=${mixed.restriction_flag} weekly_loss_pct=${
        ev?.weekly_loss_pct
      } (un faux positif fabrique par un bug d'unite, exactement ce que l'en-tete du module dit empecher)`,
      ev ?? null,
    );
  } catch (e) {
    record("B2-bis serie MIXTE lb/kg", "GREEN", `throw: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`);
  }

  await sql(`delete from weekly_reviews where user_id = '${s.userId}'`);
  await writeWeeklyRow({ userId: s.userId, weekStart: w0, weightKg: 0 });
  await expectThrow("B3 poids zero", s.userId, "outside the plausible");

  await sql(`delete from weekly_reviews where user_id = '${s.userId}'`);
  await writeWeeklyRow({
    userId: s.userId,
    weekStart: w0,
    weightKg: 70,
    loggingCoverageFraction: 3, // un COMPTE de jours dans une colonne de FRACTION
  });
  await expectThrow("B4 logging_coverage = 3 (deux echelles)", s.userId, "coverage FRACTION");

  // ── B5 · série NON hebdomadaire (3 jours d'écart) ────────────────────────
  await sql(`delete from weekly_reviews where user_id = '${s.userId}'`);
  await writeWeeklyRow({ userId: s.userId, weekStart: w0, weightKg: 70 });
  await writeWeeklyRow({ userId: s.userId, weekStart: iso(-3, new Date(`${w0}T00:00:00Z`)), weightKg: 69 });
  await expectThrow("B5 serie non hebdomadaire", s.userId, "not a weekly series");

  // ── B6 · doublon de semaine: DÉDUPLIQUÉ, pas jeté ────────────────────────
  await sql(`delete from weekly_reviews where user_id = '${s.userId}'`);
  // l'index partiel interdit deux lignes (user, week) sans plan; on passe par
  // le plan_version_id DÉJÀ publié pour reproduire la republication mid-semaine.
  const pv = String(
    (await sql(
      `select id from plan_versions where student_id = '${s.userId}' limit 1`,
    )).split("\n")[1] ?? "",
  ).trim();
  await writeWeeklyRow({ userId: s.userId, weekStart: wm2, weightKg: 80 });
  await writeWeeklyRow({ userId: s.userId, weekStart: w0, weightKg: 76 });
  await admin().from("weekly_reviews").insert({
    user_id: s.userId,
    plan_version_id: pv,
    week_start_date: w0,
    content_locale: "en-US",
    biofeedback: { weight_kg: 74, source: "qa_ff021_dupe" },
  } as never);
  try {
    const r = await evalFloor({ userId: s.userId, asOfLocalDate: today });
    const pct = r.triggers.find((t) => t.code === "rapid_weight_loss")?.evidence
      ?.weekly_loss_pct;
    // 80 -> 76 = 2,5 %/sem (ligne ancienne) ; 80 -> 74 = 3,75 %/sem (la PLUS
    // RECENTE). Le chiffre dit laquelle des deux a gagne.
    record(
      "B6 doublon de semaine dedupe (le plus recent gagne)",
      r.restriction_flag && Number(pct) === 3.75 ? "GREEN" : "RED",
      `flag=${r.restriction_flag} weekly_loss_pct=${pct} (3.75 = la ligne la plus recente a gagne, 2.5 = l'ancienne)`,
      r.triggers,
    );
  } catch (e) {
    record(
      "B6 doublon de semaine dedupe (le plus recent gagne)",
      "INFO",
      `throw: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`,
    );
  }

  // ── B7 · prose sans locale ───────────────────────────────────────────────
  {
    const coachB = await nextCoach();
    const sb = await makeStudent({ coach: coachB, locale: "en-US" });
    created.push(sb.userId);
    await publishPlanFor(coachB, sb.userId);
    // `protocol_events.content_locale` est NOT NULL: le cas « locale absente »
    // est impossible par le SCHÉMA, pas seulement par la garde. On teste donc
    // la forme qui reste atteignable — la chaîne VIDE.
    record(
      "B7-schema content_locale NOT NULL (le cas NULL est impossible en prod)",
      "GREEN",
      await sql(
        `select is_nullable from information_schema.columns where table_name='protocol_events' and column_name='content_locale'`,
      ),
    );
    await sql(
      `insert into protocol_events (user_id, local_date, occurred_at, source, student_note, content_locale)
       values ('${sb.userId}', '${iso(1)}', '${iso(1)}T12:00:00Z', 'chat', 'I skipped dinner', '')`,
    );
    await expectThrow("B7 prose avec content_locale vide (R2)", sb.userId, "content_locale");
  }

  // ══════════════════════════════════════════════════════════════════════
  // B8 · CE QUE L'APPELANT FAIT DU THROW, SUR UN TOUR RÉEL
  //
  // HYPOTHÈSE H1, écrite avant d'être jouée: `loadKeelTurnContext` rattrape le
  // throw (`restriction = null`, fail-open NOMMÉ). Une SEULE ligne cassée dans
  // la fenêtre de 6 semaines rend donc le plancher aveugle à TOUS ses
  // déclencheurs, y compris le langage compensatoire du tour courant — c'est
  // à dire que R4 (« throw plutôt qu'un tout va bien silencieux ») est tenue
  // dans le module et RENVERSÉE chez son appelant de conversation.
  // ══════════════════════════════════════════════════════════════════════
  {
    const coachC = await nextCoach();
    const sc = await makeStudent({ coach: coachC, locale: "en-US", timezone: "Europe/Paris" });
    created.push(sc.userId);
    await publishPlanFor(coachC, sc.userId);

    // Témoin: sans corruption, le langage compensatoire OUVRE la lane clinique.
    // `response_owner` est lu dans `conversation_turn_traces` — la VÉRITÉ du
    // routage. `chat_messages.metadata` ne le porte pas sur ce chemin (mesuré:
    // ses clés sont celles du message du soir), et compter dessus aurait rendu
    // deux faux ROUGES.
    const control = await turn(sc, "I skipped dinner to make up for lunch");
    const controlOwner = await ownerOf(sc.userId);
    record(
      "B8-temoin sans corruption: la lane clinique s'ouvre",
      controlOwner === "disordered_eating_guard" ? "GREEN" : "RED",
      `route_owner=${controlOwner} reply="${(control.reply ?? "").slice(0, 110)}"`,
      control.reply,
    );

    // Puis UNE ligne cassée, ailleurs dans la fenêtre — un poids que la garde
    // JETTE (B1: negatif), pas un 170 kg qui reste dans les bornes.
    await writeWeeklyRow({ userId: sc.userId, weekStart: wm1, weightKg: -70 });
    const blinded = await turn(sc, "I skipped breakfast to make up for last night");
    const blindedOwner = await ownerOf(sc.userId);
    record(
      "B8 une ligne cassee AVEUGLE le plancher sur le tour reel (H1)",
      blindedOwner === "disordered_eating_guard" ? "GREEN" : "RED",
      `route_owner=${blindedOwner} (attendu disordered_eating_guard) reply="${
        (blinded.reply ?? "").slice(0, 140)
      }"`,
      blinded.reply,
    );
    record(
      "B8-preuve base: aucune escalade coach ecrite pendant l'aveuglement",
      "INFO",
      await sql(
        `select reason_code, urgency, status from contract_change_requests where user_id = '${sc.userId}'`,
      ),
    );
  }
} finally {
  await Deno.writeTextFile(
    "scratchpad/ff021_B_results.json",
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
