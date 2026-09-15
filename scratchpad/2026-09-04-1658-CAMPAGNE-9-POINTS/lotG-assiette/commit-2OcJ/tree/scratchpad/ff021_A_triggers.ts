/**
 * FF-021 · PHASE A — les quatre déclencheurs, un à un, sur des fixtures
 * multi-semaines, à travers le VRAI chargeur (`evaluateRestrictionForStudent`).
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
  snapshotFor,
  sql,
  writeEnergyDays,
  writeStudentNote,
  writeWeeklyRow,
} from "./ff021_lib.ts";

const results: Array<Record<string, unknown>> = [];
const created: string[] = [];

function record(id: string, verdict: "GREEN" | "RED" | "INFO", detail: string, proof: unknown) {
  results.push({ id, verdict, detail, proof });
  line(id, verdict, detail);
}

const today = iso(0);
const w0 = mondayOfIso(today);
const wm1 = mondayOfIso(iso(7));
const wm2 = mondayOfIso(iso(14));

// PLAFOND DE 3 SIÈGES par coach en essai (cicatrice `qa-harness-trial-seat-cap`):
// un coach neuf tous les 3 élèves, sinon le 4e plante le run EN COURS.
const coaches: Awaited<ReturnType<typeof makeCoach>>[] = [];
let seats = 0;
async function nextCoach() {
  if (seats % 3 === 0) {
    const c = await makeCoach({ displayName: `FF021 Coach ${coaches.length + 1}` });
    coaches.push(c);
    created.push(c.userId);
  }
  seats++;
  return coaches[coaches.length - 1];
}

try {
  // ── A1 · rapid_weight_loss ──────────────────────────────────────────────
  {
    const coach = await nextCoach();
    const s = await makeStudent({ coach, locale: "en-US", timezone: "Europe/Paris" });
    created.push(s.userId);
    await publishPlanFor(coach, s.userId);
    // 80 -> 78 -> 76 sur 14 j = 2,5 %/sem, plafond 1,2 %.
    await writeWeeklyRow({ userId: s.userId, weekStart: wm2, weightKg: 80 });
    await writeWeeklyRow({ userId: s.userId, weekStart: wm1, weightKg: 78 });
    await writeWeeklyRow({ userId: s.userId, weekStart: w0, weightKg: 76 });
    const r = await evalFloor({ userId: s.userId, asOfLocalDate: today });
    const codes = r.triggers.map((t) => t.code);
    record(
      "A1 rapid_weight_loss",
      r.restriction_flag && codes.includes("rapid_weight_loss") ? "GREEN" : "RED",
      `flag=${r.restriction_flag} codes=[${codes.join(",")}]`,
      r.triggers.find((t) => t.code === "rapid_weight_loss")?.evidence ?? null,
    );

    // A1-bis · le SEUIL est gelé: 1,1 %/sem ne mord pas.
    await sql(`delete from weekly_reviews where user_id = '${s.userId}'`);
    await writeWeeklyRow({ userId: s.userId, weekStart: wm2, weightKg: 80 });
    await writeWeeklyRow({ userId: s.userId, weekStart: w0, weightKg: 78.24 }); // 1,1 %/sem
    const under = await evalFloor({ userId: s.userId, asOfLocalDate: today });
    record(
      "A1-bis seuil gele (1,1 %/sem)",
      under.restriction_flag === false ? "GREEN" : "RED",
      `flag=${under.restriction_flag} codes=[${under.triggers.map((t) => t.code).join(",")}]`,
      null,
    );

    // A1-ter · le poids du modèle 1:1 (`outcomes.weight_7d_avg`) est le REPLI.
    await sql(`delete from weekly_reviews where user_id = '${s.userId}'`);
    await writeWeeklyRow({ userId: s.userId, weekStart: wm2, outcomesWeight7dAvg: 80 });
    await writeWeeklyRow({ userId: s.userId, weekStart: w0, outcomesWeight7dAvg: 76 });
    const legacy = await evalFloor({ userId: s.userId, asOfLocalDate: today });
    record(
      "A1-ter repli outcomes.weight_7d_avg",
      legacy.restriction_flag ? "GREEN" : "RED",
      `flag=${legacy.restriction_flag} codes=[${legacy.triggers.map((t) => t.code).join(",")}]`,
      null,
    );
  }

  // ── A2 · energy_deficit_streak ──────────────────────────────────────────
  {
    const coach = await nextCoach();
    const s = await makeStudent({ coach, locale: "en-US", timezone: "Europe/Paris" });
    created.push(s.userId);
    const pv = await publishPlanFor(coach, s.userId);
    await writeEnergyDays({
      userId: s.userId,
      planVersionId: pv,
      coachId: coach.coachId,
      days: [
        { localDate: iso(4), target: 2000, observed: 1900 }, // 95 % — pas un deficit
        { localDate: iso(3), target: 2000, observed: 1200 }, // 60 %
        { localDate: iso(2), target: 2000, observed: 1100 }, // 55 %
        { localDate: iso(1), target: 2000, observed: 1000 }, // 50 %
      ],
    });
    const r = await evalFloor({ userId: s.userId, asOfLocalDate: today });
    const trig = r.triggers.find((t) => t.code === "energy_deficit_streak");
    record(
      "A2 energy_deficit_streak",
      r.restriction_flag && trig ? "GREEN" : "RED",
      `flag=${r.restriction_flag} codes=[${r.triggers.map((t) => t.code).join(",")}]`,
      trig?.evidence ?? null,
    );

    // A2-bis · un jour INCONNU ne fait pas le pont (`observed_kcal: null`).
    await sql(`delete from commitment_evaluations where user_id = '${s.userId}'`);
    await sql(`delete from plan_commitments where user_id = '${s.userId}' and measure = 'energy'`);
    await writeEnergyDays({
      userId: s.userId,
      planVersionId: pv,
      coachId: coach.coachId,
      days: [
        { localDate: iso(3), target: 2000, observed: 1200 },
        { localDate: iso(2), target: 2000, observed: null }, // inconnu
        { localDate: iso(1), target: 2000, observed: 1000 },
      ],
    });
    const bridged = await evalFloor({ userId: s.userId, asOfLocalDate: today });
    record(
      "A2-bis un jour inconnu ne ponte pas la serie",
      bridged.triggers.some((t) => t.code === "energy_deficit_streak") ? "RED" : "GREEN",
      `codes=[${bridged.triggers.map((t) => t.code).join(",")}]`,
      null,
    );
  }

  // ── A3 · compensatory_language (FR + EN, note ET tour) ───────────────────
  {
    const coach = await nextCoach();
    const s = await makeStudent({ coach, locale: "en-US", timezone: "Europe/Paris" });
    created.push(s.userId);
    await publishPlanFor(coach, s.userId);

    const en = await evalFloor({
      userId: s.userId,
      asOfLocalDate: today,
      turnMessage: "I skipped dinner to make up for lunch",
      turnLocale: "en-US",
    });
    record(
      "A3-EN tour: skipped dinner / make up for lunch",
      en.triggers.some((t) => t.code === "compensatory_language") ? "GREEN" : "RED",
      `codes=[${en.triggers.map((t) => t.code).join(",")}]`,
      en.triggers.find((t) => t.code === "compensatory_language")?.evidence ?? null,
    );

    const fr = await evalFloor({
      userId: s.userId,
      asOfLocalDate: today,
      turnMessage: "j'ai sauté le dîner pour compenser le repas d'hier",
      turnLocale: "fr-FR",
    });
    record(
      "A3-FR tour: saute le diner / compenser le repas",
      fr.triggers.some((t) => t.code === "compensatory_language") ? "GREEN" : "RED",
      `codes=[${fr.triggers.map((t) => t.code).join(",")}]`,
      fr.triggers.find((t) => t.code === "compensatory_language")?.evidence ?? null,
    );

    // Le faux ami: « skip the intro » ne doit PAS mordre.
    const innocent = await evalFloor({
      userId: s.userId,
      asOfLocalDate: today,
      turnMessage: "can we skip the intro and I burned 400 kcal on the bike",
      turnLocale: "en-US",
    });
    record(
      "A3-homonyme innocent ne mord pas",
      innocent.restriction_flag === false ? "GREEN" : "RED",
      `flag=${innocent.restriction_flag} codes=[${innocent.triggers.map((t) => t.code).join(",")}]`,
      null,
    );

    // La NOTE en base (pas le tour): même déclencheur, autre source.
    await writeStudentNote({
      userId: s.userId,
      localDate: iso(2),
      note: "j'ai sauté le déjeuner encore une fois",
      contentLocale: "fr-FR",
    });
    const note = await evalFloor({ userId: s.userId, asOfLocalDate: today });
    const noteTrig = note.triggers.find((t) => t.code === "compensatory_language");
    record(
      "A3-note en base (source protocol_event_student_note)",
      noteTrig && (noteTrig.evidence.sources as string[]).includes(
          "protocol_event_student_note",
        )
        ? "GREEN"
        : "RED",
      `codes=[${note.triggers.map((t) => t.code).join(",")}] sources=${
        JSON.stringify(noteTrig?.evidence?.sources ?? null)
      }`,
      noteTrig?.evidence ?? null,
    );

    // A3-bis · LA PHRASE QUE L'EN-TÊTE DU RUNTIME CITE LUI-MÊME comme « le
    // signal à ne pas manquer » (restriction_runtime.ts:311-313). Elle est au
    // PASSÉ; le lexique ne porte que l'INFINITIF (`ne rien manger de la
    // journee`). Hypothèse H2, écrite avant d'être jouée.
    const coach2 = await nextCoach();
    const s2 = await makeStudent({ coach: coach2, locale: "fr-FR", timezone: "Europe/Paris" });
    created.push(s2.userId);
    await publishPlanFor(coach2, s2.userId);
    await writeStudentNote({
      userId: s2.userId,
      localDate: iso(3),
      note: "je n'ai rien mangé aujourd'hui non plus",
      contentLocale: "fr-FR",
    });
    await writeStudentNote({
      userId: s2.userId,
      localDate: iso(2),
      note: "je n'ai rien mangé aujourd'hui non plus",
      contentLocale: "fr-FR",
    });
    await writeStudentNote({
      userId: s2.userId,
      localDate: iso(1),
      note: "je n'ai rien mangé aujourd'hui non plus",
      contentLocale: "fr-FR",
    });
    const headerPhrase = await evalFloor({ userId: s2.userId, asOfLocalDate: today });
    record(
      "A3-bis la phrase citee par l'en-tete du runtime, 3 jours de suite",
      headerPhrase.restriction_flag ? "GREEN" : "RED",
      `flag=${headerPhrase.restriction_flag} codes=[${
        headerPhrase.triggers.map((t) => t.code).join(",")
      }] — 3 notes « je n'ai rien mangé aujourd'hui non plus » en base`,
      await snapshotFor({ userId: s2.userId, asOfLocalDate: today }),
    );
  }

  // ── A4 · overclaimed_adherence_with_hidden_logging ──────────────────────
  {
    const coach = await nextCoach();
    const s = await makeStudent({ coach, locale: "en-US", timezone: "Europe/Paris" });
    created.push(s.userId);
    await publishPlanFor(coach, s.userId);
    // 3 semaines: 80 -> 79 (1,25 %) -> 77.8 (1,52 %) — l'accélération + 9/10
    // auto-declare + 2/7 jours logués (fraction 0,28 -> round(1,96) = 2).
    await writeWeeklyRow({ userId: s.userId, weekStart: wm2, weightKg: 80, selfRated: 9, loggingCoverageFraction: 0.28 });
    await writeWeeklyRow({ userId: s.userId, weekStart: wm1, weightKg: 79, selfRated: 9, loggingCoverageFraction: 0.28 });
    await writeWeeklyRow({ userId: s.userId, weekStart: w0, weightKg: 77.8, selfRated: 9, loggingCoverageFraction: 0.28 });
    const r = await evalFloor({ userId: s.userId, asOfLocalDate: today });
    const trig = r.triggers.find(
      (t) => t.code === "overclaimed_adherence_with_hidden_logging",
    );
    record(
      "A4 overclaimed_adherence_with_hidden_logging",
      trig ? "GREEN" : "RED",
      `flag=${r.restriction_flag} codes=[${r.triggers.map((t) => t.code).join(",")}]`,
      trig?.evidence ?? null,
    );

    const snap = await snapshotFor({ userId: s.userId, asOfLocalDate: today });
    record(
      "A4-forme du snapshot (T-15: la sonde parle la prod)",
      "INFO",
      `weeks=${snap.weekly_outcomes.length} logged_days=${
        snap.weekly_outcomes.map((w) => w.logging_coverage_days).join(",")
      } weights=${snap.weekly_outcomes.map((w) => w.weight_7d_avg_kg).join(",")}`,
      snap.weekly_outcomes,
    );
  }

  // ── A5 · plancher DÉSARMÉ par absence de premisse ───────────────────────
  {
    const coach = await nextCoach();
    const s = await makeStudent({ coach, locale: "en-US", timezone: "Europe/Paris" });
    created.push(s.userId);
    await publishPlanFor(coach, s.userId);
    const r = await evalFloor({
      userId: s.userId,
      asOfLocalDate: today,
      turnMessage: "hello, what should I have for lunch?",
      turnLocale: "en-US",
    });
    record(
      "A5 eleve neuf: aucun declencheur (silence != symptome)",
      r.restriction_flag === false && r.triggers.length === 0 ? "GREEN" : "RED",
      `flag=${r.restriction_flag} codes=[${r.triggers.map((t) => t.code).join(",")}]`,
      null,
    );
  }
} finally {
  await Deno.writeTextFile(
    "scratchpad/ff021_A_results.json",
    JSON.stringify({ created, results }, null, 2),
  );
  console.log(`\n--- fixtures créées: ${created.join(" ")}`);
  console.log(
    `--- GREEN=${results.filter((r) => r.verdict === "GREEN").length} RED=${
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
  } else {
    console.log("--- fixtures CONSERVÉES (FF021_KEEP=1)");
  }
}
