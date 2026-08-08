// PIVOT NUTRITION §1.4 — coach_synthesis_io.ts.
//
// The tests that carry the doctrine:
//   * "a written synthesis is NOT a delivered one"  -- execution truth.
//   * "the weekly window is the LAST COMPLETE week" -- a synthesis that
//     includes today reports on a week that is not over.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  buildAndWriteCoachSynthesis,
  lastCompleteWeek,
  loadCohortStudentIds,
  loadStudentWeek,
} from "./coach_synthesis_io.ts";

// ---------------------------------------------------------------------------
// A fake matching the exact chains the module uses.
// ---------------------------------------------------------------------------
type Rows = Record<string, Array<Record<string, unknown>>>;

function fakeDb(rows: Rows) {
  const writes: Array<Record<string, unknown>> = [];
  const make = (table: string) => {
    let data = [...(rows[table] ?? [])];
    const node: Record<string, unknown> = {
      eq: (col: string, val: unknown) => {
        data = data.filter((r) => String(r[col] ?? "") === String(val));
        return node;
      },
      in: (col: string, vals: unknown[]) => {
        const set = new Set(vals.map(String));
        data = data.filter((r) => set.has(String(r[col] ?? "")));
        return node;
      },
      // `is(col, null)` — le fake doit connaître le filtre de disqualification,
      // sinon il rend VRAI un comptage que la vraie base refuserait. Un fake
      // incomplet est un faux vert autant qu'un faux rouge.
      is: (col: string, val: unknown) => {
        if (val === null) {
          data = data.filter((r) => r[col] === null || r[col] === undefined);
        } else {
          data = data.filter((r) => r[col] === val);
        }
        return node;
      },
      gte: (col: string, val: string) => {
        data = data.filter((r) => String(r[col] ?? "") >= val);
        return node;
      },
      lte: (col: string, val: string) => {
        data = data.filter((r) => String(r[col] ?? "") <= val);
        return node;
      },
      order: () => node,
      limit: () => node,
      select: () => node,
      single: () => Promise.resolve({ data: data[0] ?? null, error: null }),
      // `maybeSingle` manquait au fake: le module l'utilise pour lire le plan
      // de la semaine, et son absence faisait tomber cinq tests qui n'avaient
      // rien à voir. Un fake incomplet est un faux rouge.
      maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ data, error: null }),
    };
    return node;
  };
  return {
    db: {
      from: (table: string) => ({
        select: () => make(table),
        upsert: (row: Record<string, unknown>) => {
          writes.push(row);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: "syn-1" }, error: null }),
            }),
          };
        },
        update: (patch: Record<string, unknown>) => {
          writes.push({ __update: patch });
          return { eq: () => Promise.resolve({ error: null }) };
        },
      }),
    },
    writes,
  };
}

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

Deno.test("the weekly window is the LAST COMPLETE week, Monday to Sunday", () => {
  // 2026-08-03 is a Monday. The week to report on is the one that just ended.
  const w = lastCompleteWeek("2026-08-03");
  assertEquals(w.periodStart, "2026-07-27");
  assertEquals(w.periodEnd, "2026-08-02");
  assertEquals(w.weekDates.length, 7);
  assertEquals(w.weekDates[0], "2026-07-27");
  assertEquals(w.weekDates[6], "2026-08-02");
});

Deno.test("the window is stable whatever day of the week the job runs", () => {
  // A retry on Tuesday must produce the same week as Monday, or a rerun
  // silently reports on a different period than the row it upserts into.
  for (const day of ["2026-08-03", "2026-08-04", "2026-08-07", "2026-08-09"]) {
    const w = lastCompleteWeek(day);
    assertEquals(w.periodStart, "2026-07-27", day);
    assertEquals(w.periodEnd, "2026-08-02", day);
  }
});

// ---------------------------------------------------------------------------
// Reading the facts
// ---------------------------------------------------------------------------

const WINDOW = lastCompleteWeek("2026-08-03");

Deno.test("cohort = the coach's LIVE students only", async () => {
  const { db } = fakeDb({
    coach_clients: [
      { coach_id: "c1", student_user_id: "s1", status: "active" },
      { coach_id: "c1", student_user_id: "s2", status: "ended" },
      { coach_id: "c2", student_user_id: "s3", status: "active" },
    ],
  });
  assertEquals(await loadCohortStudentIds(db, "c1"), ["s1"]);
});

Deno.test("commitment weight comes from the PRESCRIPTION, not the evaluation", async () => {
  // If everything defaulted to core/counts=true, a silent sensor line
  // (counts_toward_adherence=false) would enter the score — exactly what R6
  // forbids.
  const { db } = fakeDb({
    commitment_evaluations: [
      { user_id: "s1", commitment_id: "k1", local_date: "2026-07-27", grain: "day", status: "met" },
      { user_id: "s1", commitment_id: "k2", local_date: "2026-07-27", grain: "day", status: "unknown" },
    ],
    plan_commitments: [
      { id: "k1", priority: "secondary", counts_toward_adherence: true, expected_occasions_per_day: 1 },
      { id: "k2", priority: "core", counts_toward_adherence: false, expected_occasions_per_day: 2 },
    ],
    protocol_events: [],
    chat_messages: [],
  });
  const week = await loadStudentWeek(db, { studentUserId: "s1", window: WINDOW });
  const k1 = week.adherence.evaluations.find((e) => e.commitmentId === "k1")!;
  const k2 = week.adherence.evaluations.find((e) => e.commitmentId === "k2")!;
  assertEquals(k1.priority, "secondary");
  assertEquals(k2.countsTowardAdherence, false);
  assertEquals(k2.expectedEvaluationsPerDay, 2);
});

Deno.test("coverage counts EVENTS per day, and portion bands are collected", async () => {
  const { db } = fakeDb({
    commitment_evaluations: [],
    plan_commitments: [],
    protocol_events: [
      { user_id: "s1", local_date: "2026-07-27", portion_band: "large" },
      { user_id: "s1", local_date: "2026-07-27", portion_band: null },
      { user_id: "s1", local_date: "2026-07-28", portion_band: "small" },
      // Outside the window: must not leak in.
      { user_id: "s1", local_date: "2026-08-09", portion_band: "large" },
    ],
    chat_messages: [],
  });
  const week = await loadStudentWeek(db, { studentUserId: "s1", window: WINDOW });
  assertEquals(week.adherence.eventCountsByDate["2026-07-27"], 2);
  assertEquals(week.adherence.eventCountsByDate["2026-07-28"], 1);
  assertEquals(week.adherence.eventCountsByDate["2026-08-02"], 0);
  assertEquals([...(week.portionBands ?? [])].sort(), ["large", "small"]);
});

Deno.test("contact reads the last INBOUND message only", async () => {
  const { db } = fakeDb({
    commitment_evaluations: [],
    plan_commitments: [],
    protocol_events: [],
    chat_messages: [
      { user_id: "s1", role: "user", created_at: "2026-07-30T10:00:00Z" },
      { user_id: "s1", role: "assistant", created_at: "2026-08-02T10:00:00Z" },
    ],
  });
  const week = await loadStudentWeek(db, { studentUserId: "s1", window: WINDOW });
  // The assistant message is more recent and must NOT be what is reported:
  // three unanswered nudges would otherwise read as "in touch".
  assertEquals(week.lastInboundAt, "2026-07-30T10:00:00Z");
});

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

Deno.test("a written synthesis is NOT a delivered one (execution truth)", async () => {
  const { db, writes } = fakeDb({
    coach_clients: [{ coach_id: "c1", student_user_id: "s1", status: "active" }],
    commitment_evaluations: [],
    plan_commitments: [],
    protocol_events: [],
    chat_messages: [],
  });
  const out = await buildAndWriteCoachSynthesis(db, {
    coachId: "c1",
    coachName: "Marc",
    asOfLocalDate: "2026-08-03",
    now: new Date("2026-08-03T09:00:00Z"),
  });
  assertEquals(out.write.written, true);
  assertEquals(out.write.id, "syn-1");

  const row = writes[0];
  assertEquals(row.coach_id, "c1");
  assertEquals(row.kind, "weekly");
  assertEquals(row.period_start, "2026-07-27");
  assertEquals(row.period_end, "2026-08-02");
  // THE assertion: generated is not delivered.
  assertEquals(row.delivered_at, undefined);
  assertEquals(row.delivery_channel, undefined);
});

Deno.test("the narrative is a template over computed numbers", async () => {
  const { db } = fakeDb({
    coach_clients: [
      { coach_id: "c1", student_user_id: "s1", status: "active" },
      { coach_id: "c1", student_user_id: "s2", status: "active" },
    ],
    commitment_evaluations: [],
    plan_commitments: [],
    protocol_events: [],
    chat_messages: [],
  });
  const out = await buildAndWriteCoachSynthesis(db, {
    coachId: "c1",
    asOfLocalDate: "2026-08-03",
    now: new Date("2026-08-03T09:00:00Z"),
  });
  assert(out.narrative.includes("2 students this week"));
  // Nobody logged: the gate must speak instead of an invented average.
  assert(out.narrative.includes("No adherence figure this week"));
  assert(!/\d+%/.test(out.narrative));
});

// ---------------------------------------------------------------------------
// QA AGENT 11 (2026-08-03) — la garde qui était déclarée et désarmée.
//
// `StudentWeekInput.restrictionFlag` existait, `classifyRisk` le faisait passer
// avant tout, `flagFor` en tirait `restriction_signal` (sévérité 0, exempt du
// plafond) — et le chemin de production ne le renseignait JAMAIS. Un élève
// marqué restrictif sortait donc en `no_evaluable_plan`, puis se faisait
// tronquer par le plafond des 3. Ces tests arment la garde ET prouvent qu'elle
// ne mord pas quand le problème n'existe pas.
// ---------------------------------------------------------------------------

function restrictionFixture(extra: Rows): Rows {
  return {
    coach_clients: [
      { coach_id: "c1", student_user_id: "s1", status: "active" },
      { coach_id: "c1", student_user_id: "s2", status: "active" },
    ],
    profiles: [
      { id: "s1", full_name: "Ada" },
      { id: "s2", full_name: "Bilal" },
    ],
    commitment_evaluations: [],
    plan_commitments: [],
    // Les deux ont loggé 5 jours: sans le drapeau, les deux sortent en
    // `no_evaluable_plan` — c'est exactement ce qui masquait le signal.
    protocol_events: [
      ...["2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31"]
        .flatMap((local_date) => [
          { user_id: "s1", local_date, portion_band: null },
          { user_id: "s1", local_date, portion_band: null },
          { user_id: "s2", local_date, portion_band: null },
          { user_id: "s2", local_date, portion_band: null },
        ]),
    ],
    chat_messages: [
      { user_id: "s1", role: "user", created_at: "2026-08-03T06:00:00Z" },
      { user_id: "s2", role: "user", created_at: "2026-08-03T06:00:00Z" },
    ],
    ...extra,
  };
}

Deno.test("an OPEN restriction escalation reaches the synthesis (the live writer)", async () => {
  const { db, writes } = fakeDb(restrictionFixture({
    contract_change_requests: [
      { user_id: "s1", reason_code: "restriction_signal", status: "open" },
      // Bruit qui ne doit PAS lever le drapeau: une escalade close, et une
      // escalade ouverte pour un autre motif.
      { user_id: "s2", reason_code: "restriction_signal", status: "resolved" },
      { user_id: "s2", reason_code: "coach_review", status: "open" },
    ],
  }));
  const out = await buildAndWriteCoachSynthesis(db, {
    coachId: "c1",
    asOfLocalDate: "2026-08-03",
    now: new Date("2026-08-03T09:00:00Z"),
  });

  const flagged = writes[0].flagged_students as Array<Record<string, unknown>>;
  assertEquals(flagged[0].student_user_id, "s1");
  assertEquals(flagged[0].reason_code, "restriction_signal");
  assertEquals(flagged[0].risk_band, "restriction_flag");
  // La ligne ne porte NI chiffre d'adhérence NI relance: la pression s'arrête.
  assert(out.narrative.includes("this one is yours to handle"), out.narrative);
  // Et l'autre élève n'a pas été contaminé.
  assertEquals(
    out.synthesis.lines.find((l) => l.studentUserId === "s2")?.flagReason,
    "no_evaluable_plan",
  );
});

Deno.test("a risk_band on weekly_reviews no longer reaches the synthesis (L3)", async () => {
  // ── LA CEINTURE DE NON-RÉGRESSION DU RETRAIT ──────────────────────────────
  // Ce test disait l'inverse: `weekly_reviews.risk_band='restriction_flag'`
  // levait le drapeau. La colonne n'a AUCUN écrivain (épreuves d'absence
  // refaites le 2026-08-08: code, `prosrc`, vues, base), donc cette branche ne
  // pouvait mordre que sur une fixture. Elle est retirée.
  //
  // Le test est INVERSÉ plutôt que supprimé, exprès: la garde qui compte
  // maintenant est « une ligne semée à la main ne doit PLUS accuser personne ».
  // Une suppression pure aurait laissé le retrait sans témoin.
  const { db, writes } = fakeDb(restrictionFixture({
    contract_change_requests: [],
    weekly_reviews: [
      { user_id: "s2", risk_band: "restriction_flag", week_start_date: "2026-07-27" },
      { user_id: "s1", risk_band: "restriction_flag", week_start_date: "2026-07-13" },
    ],
  }));
  await buildAndWriteCoachSynthesis(db, {
    coachId: "c1",
    asOfLocalDate: "2026-08-03",
    now: new Date("2026-08-03T09:00:00Z"),
  });
  const flagged = writes[0].flagged_students as Array<Record<string, unknown>>;
  assert(
    !flagged.some((f) => f.reason_code === "restriction_signal"),
    JSON.stringify(flagged),
  );
});

Deno.test("no restriction anywhere: nobody is accused of one (premise false)", async () => {
  // La condition de désarmement. Une ceinture qui mord toujours est une
  // ceinture qu'on finit par retirer.
  const { db, writes } = fakeDb(restrictionFixture({
    contract_change_requests: [],
    weekly_reviews: [],
  }));
  await buildAndWriteCoachSynthesis(db, {
    coachId: "c1",
    asOfLocalDate: "2026-08-03",
    now: new Date("2026-08-03T09:00:00Z"),
  });
  const flagged = writes[0].flagged_students as Array<Record<string, unknown>>;
  assert(flagged.length > 0, "the cohort still has something to say");
  assert(!flagged.some((f) => f.reason_code === "restriction_signal"));
});

Deno.test("a coach with no students writes NO row at all", async () => {
  // L'en-tête de `coach-synthesis-v1` promet exactement ça depuis le premier
  // jour; l'écriture avait simplement lieu avant le test. Trouvé en QA: 19
  // lignes en base pour 16 annoncées par le job.
  const { db, writes } = fakeDb({
    coach_clients: [{ coach_id: "c2", student_user_id: "s9", status: "active" }],
  });
  const out = await buildAndWriteCoachSynthesis(db, {
    coachId: "c1",
    asOfLocalDate: "2026-08-03",
    now: new Date("2026-08-03T09:00:00Z"),
  });
  assertEquals(out.studentCount, 0);
  assertEquals(out.write.written, false);
  assertEquals(out.write.reason_code, "no_students");
  assertEquals(writes.length, 0);
});

Deno.test("une photo disqualifiée ne compte PAS dans ce que le coach lit", async () => {
  // Le défaut d'origine, vu depuis l'écran du lundi: un selfie et une capture
  // d'écran de menu gonflaient les jours actifs de l'élève et la distribution
  // de ses portions. Le coach voyait un élève régulier là où il y avait une
  // photo de chat.
  const { db } = fakeDb({
    commitment_evaluations: [],
    plan_commitments: [],
    protocol_events: [
      // Un vrai repas.
      {
        user_id: "s1",
        local_date: "2026-07-27",
        portion_band: "large",
        disqualified_reason: null,
      },
      // Un menu de restaurant: des aliments réels, aucun repas mangé.
      {
        user_id: "s1",
        local_date: "2026-07-27",
        portion_band: "moderate",
        disqualified_reason: "food_not_eaten",
      },
      // Un selfie.
      {
        user_id: "s1",
        local_date: "2026-07-28",
        portion_band: "unclear",
        disqualified_reason: "not_food",
      },
      // Une photo trop sombre: le geste a eu lieu, la preuve non.
      {
        user_id: "s1",
        local_date: "2026-07-29",
        portion_band: null,
        disqualified_reason: "unreadable",
      },
    ],
    chat_messages: [],
  });
  const week = await loadStudentWeek(db, { studentUserId: "s1", window: WINDOW });

  assertEquals(week.adherence.eventCountsByDate["2026-07-27"], 1);
  // Le jour du selfie n'est pas un jour actif.
  assertEquals(week.adherence.eventCountsByDate["2026-07-28"], 0);
  assertEquals(week.adherence.eventCountsByDate["2026-07-29"], 0);
  // Et la distribution des portions ne porte que celle du vrai repas.
  assertEquals([...(week.portionBands ?? [])], ["large"]);
});
