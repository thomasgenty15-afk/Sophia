// KEEL W4.6 — the wiring of the restriction floor. Stubbed client, no network.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  escalateRestrictionSignal,
  evaluateRestrictionForStudent,
  type KeelDbClient,
  loadEnergyDaySamples,
  loadWeeklyOutcomeSamples,
  loggingCoverageDaysFromFraction,
} from "./restriction_runtime.ts";
import { evaluateRestrictionGuard } from "./restriction_guard.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const TODAY = "2026-07-29";

type TableData = Record<string, Array<Record<string, unknown>>>;

/**
 * Minimal PostgREST-shaped stub: every filter is a no-op recorder and the awaited
 * query resolves to the rows seeded for the table. Enough to exercise the
 * conversions and the ordering contracts, which is what can actually be wrong here.
 */
function stubDb(tables: TableData, opts: {
  inserts?: Array<{ table: string; row: unknown }>;
} = {}): KeelDbClient {
  const passthrough = [
    "select",
    "eq",
    "gte",
    "lte",
    "in",
    "not",
    "order",
    "limit",
    "or",
    "filter",
  ];
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      // deno-lint-ignore no-explicit-any
      const builder: any = {
        insert(row: unknown) {
          opts.inserts?.push({ table, row });
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: "ccr-1" }, error: null }),
            }),
          };
        },
        then(
          // deno-lint-ignore no-explicit-any
          resolve: (v: any) => unknown,
        ) {
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      for (const method of passthrough) builder[method] = () => builder;
      return builder;
    },
  };
}

// ---------------------------------------------------------------------------
// The conversion that had to be done once, loudly
// ---------------------------------------------------------------------------

Deno.test("logging_coverage is a FRACTION converted once to whole days", () => {
  assertEquals(loggingCoverageDaysFromFraction(null), null);
  assertEquals(loggingCoverageDaysFromFraction(0), 0);
  assertEquals(loggingCoverageDaysFromFraction(1), 7);
  // 3/7 = 0.428... -> 3 days, the number the "< 4/7" display gate speaks in.
  assertEquals(loggingCoverageDaysFromFraction(3 / 7), 3);
});

Deno.test("a coverage value outside [0,1] throws — two scales disagreeing is the bug", () => {
  let threw = false;
  try {
    loggingCoverageDaysFromFraction(3);
  } catch (error) {
    threw = true;
    assert(String(error).includes("outside [0, 1]"));
  }
  assert(threw, "expected a loud failure, not a silent clamp to 7 days");
});

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

Deno.test("weekly rows are de-duplicated by week, newest row wins", async () => {
  // A plan republished mid-week writes two weekly_reviews for the same week
  // (unique key includes plan_version_id). The guard refuses a duplicated week.
  const db = stubDb({
    weekly_reviews: [
      {
        week_start_date: "2026-07-20",
        self_rated_adherence: 4,
        logging_coverage: 1,
        outcomes: { weight_7d_avg: 70 },
        created_at: "2026-07-27T10:00:00Z",
      },
      {
        week_start_date: "2026-07-20",
        self_rated_adherence: 9,
        logging_coverage: 2 / 7,
        outcomes: { weight_7d_avg: 68 },
        created_at: "2026-07-27T12:00:00Z",
      },
    ],
  });
  const weeks = await loadWeeklyOutcomeSamples(db, {
    userId: USER,
    asOfLocalDate: TODAY,
  });
  assertEquals(weeks.length, 1);
  assertEquals(weeks[0].self_rated_adherence, 9);
  assertEquals(weeks[0].weight_7d_avg_kg, 68);
  assertEquals(weeks[0].logging_coverage_days, 2);
});

// ---------------------------------------------------------------------------
// FF-031 — LES TROIS SOURCES DE POIDS, ET LEUR ORDRE
//
// Le poids vit maintenant dans `student_body_measures`. `weekly_reviews` reste
// lu pour l'adhérence et la couverture, et son `biofeedback` sert de REPLI. Ces
// cas tiennent l'ordre: si le repli l'emportait, la finesse à la journée serait
// perdue en silence; s'il disparaissait, une semaine antérieure à la reprise
// sortirait de la série et le plancher cesserait de comparer quatorze jours.
// ---------------------------------------------------------------------------

const MEASURE_TABLE = "student_body_measures";

function weightRow(localDate: string, valueSi: number) {
  return {
    local_date: localDate,
    kind: "weight",
    value_si: valueSi,
    measured_at: `${localDate}T07:00:00Z`,
  };
}

Deno.test("FF-031 — la table datée l'emporte sur le miroir hebdomadaire", async () => {
  const db = stubDb({
    weekly_reviews: [{
      week_start_date: "2026-07-27",
      self_rated_adherence: 8,
      logging_coverage: 2 / 7,
      // Le miroir n'a gardé que la DERNIÈRE pesée de la semaine: 69,0.
      biofeedback: { weight_kg: 69.0, source: "chat" },
      created_at: "2026-07-27T10:00:00Z",
    }],
    [MEASURE_TABLE]: [
      weightRow("2026-07-27", 70.0),
      weightRow("2026-07-29", 69.5),
      weightRow("2026-07-31", 69.0),
    ],
  });
  const weeks = await loadWeeklyOutcomeSamples(db, {
    userId: USER,
    asOfLocalDate: TODAY,
  });
  assertEquals(weeks.length, 1);
  // La moyenne des trois jours, pas le dernier.
  assertEquals(weeks[0].weight_7d_avg_kg, 69.5);
  // Et l'adhérence, elle, vient toujours de `weekly_reviews`.
  assertEquals(weeks[0].self_rated_adherence, 8);
  assertEquals(weeks[0].logging_coverage_days, 2);
});

Deno.test("FF-031 — le miroir COMBLE une semaine que la table n'a pas", async () => {
  // Une semaine antérieure à la reprise, ou une écriture datée qui a échoué là
  // où le miroir a réussi (R9). Sans ce repli, elle sortirait de la série — et
  // la fenêtre de quatorze jours du déclencheur n° 1 n'aurait plus de bord.
  const db = stubDb({
    weekly_reviews: [
      {
        week_start_date: "2026-07-13",
        biofeedback: { weight_kg: 72.0 },
        created_at: "2026-07-13T10:00:00Z",
      },
      {
        week_start_date: "2026-07-27",
        biofeedback: null,
        created_at: "2026-07-27T10:00:00Z",
      },
    ],
    [MEASURE_TABLE]: [weightRow("2026-07-27", 69.0)],
  });
  const weeks = await loadWeeklyOutcomeSamples(db, {
    userId: USER,
    asOfLocalDate: TODAY,
  });
  assertEquals(weeks.map((w) => w.week_start_date), ["2026-07-13", "2026-07-27"]);
  assertEquals(weeks.map((w) => w.weight_7d_avg_kg), [72.0, 69.0]);
  // 72,0 -> 69,0 sur 14 jours = 2,08 %/semaine: la ceinture mord, et elle ne
  // mordrait pas si le repli avait laissé tomber la première semaine.
  const result = evaluateRestrictionGuard({
    as_of_local_date: TODAY,
    weekly_outcomes: weeks,
    energy_days: [],
    texts: [],
  });
  assertEquals(result.triggers.map((t) => t.code), ["rapid_weight_loss"]);
});

Deno.test("FF-031 — une semaine SANS ligne de revue entre par la table", async () => {
  // L'élève qui ne fait que parler à Sophia et n'a jamais rempli de point
  // hebdo. Avant l'union, sa pesée était invisible au plancher.
  const db = stubDb({
    weekly_reviews: [],
    [MEASURE_TABLE]: [weightRow("2026-07-28", 69.0)],
  });
  const weeks = await loadWeeklyOutcomeSamples(db, {
    userId: USER,
    asOfLocalDate: TODAY,
  });
  assertEquals(weeks, [{
    week_start_date: "2026-07-27",
    weight_7d_avg_kg: 69.0,
    self_rated_adherence: null,
    logging_coverage_days: null,
  }]);
});

Deno.test("FF-031 — une lecture de mesures EN PANNE retombe sur le miroir, pas sur du vide", async () => {
  // La seule exception nommée à « nothing here is best-effort ». Propager
  // ferait JETER la ceinture, et une ceinture qui jette est une ceinture qui ne
  // mord pas. On retombe sur la source d'avant FF-031, bruyamment.
  const healthy = stubDb({
    weekly_reviews: [
      {
        week_start_date: "2026-07-13",
        biofeedback: { weight_kg: 72.0 },
        created_at: "2026-07-13T10:00:00Z",
      },
      {
        week_start_date: "2026-07-27",
        biofeedback: { weight_kg: 69.0 },
        created_at: "2026-07-27T10:00:00Z",
      },
    ],
  });
  const broken: KeelDbClient = {
    from(table: string) {
      if (table === MEASURE_TABLE) throw new Error("relation does not exist");
      return healthy.from(table);
    },
  };
  const weeks = await loadWeeklyOutcomeSamples(broken, {
    userId: USER,
    asOfLocalDate: TODAY,
  });
  assertEquals(weeks.map((w) => w.weight_7d_avg_kg), [72.0, 69.0]);
  assertEquals(
    evaluateRestrictionGuard({
      as_of_local_date: TODAY,
      weekly_outcomes: weeks,
      energy_days: [],
      texts: [],
    }).restriction_flag,
    true,
  );
});

Deno.test("energy days aggregate per date and never read silence as zero intake", async () => {
  const db = stubDb({
    plan_commitments: [{ id: "c-energy" }, { id: "c-energy-training" }],
    commitment_evaluations: [
      { local_date: "2026-07-27", expected: { target_min: 1800 }, observed_value: 900 },
      { local_date: "2026-07-27", expected: { target_min: 200 }, observed_value: null },
      // Nobody logged this day: it stays unknown, it does not become 0 kcal.
      { local_date: "2026-07-28", expected: { target_min: 2000 }, observed_value: null },
      // No prescribed target: dropped, there is no deficit to compute.
      { local_date: "2026-07-29", expected: {}, observed_value: 300 },
    ],
  });
  const days = await loadEnergyDaySamples(db, { userId: USER, asOfLocalDate: TODAY });
  assertEquals(days, [
    { local_date: "2026-07-27", target_kcal: 2000, observed_kcal: 900 },
    { local_date: "2026-07-28", target_kcal: 2000, observed_kcal: null },
  ]);
});

Deno.test("a student with no energy commitment yields no energy days (premise absent)", async () => {
  const db = stubDb({ plan_commitments: [] });
  assertEquals(
    await loadEnergyDaySamples(db, { userId: USER, asOfLocalDate: TODAY }),
    [],
  );
});

Deno.test("student prose without content_locale is refused, not guessed (R2)", async () => {
  const db = stubDb({
    protocol_events: [
      { student_note: "skipped lunch again", content_locale: "", local_date: "2026-07-28" },
    ],
  });
  await assertRejects(
    () => evaluateRestrictionForStudent(db, { userId: USER, asOfLocalDate: TODAY }),
    Error,
    "content_locale",
  );
});

Deno.test("end to end: a compensatory note in the DB raises the flag", async () => {
  const db = stubDb({
    weekly_reviews: [],
    plan_commitments: [],
    protocol_events: [
      {
        student_note: "I skipped dinner to make up for the weekend",
        content_locale: "en",
        local_date: "2026-07-28",
      },
    ],
  });
  const result = await evaluateRestrictionForStudent(db, {
    userId: USER,
    asOfLocalDate: TODAY,
  });
  assertEquals(result.restriction_flag, true);
  assertEquals(result.triggers.map((t) => t.code), ["compensatory_language"]);
  assertEquals(result.evaluated_for_date, TODAY);
});

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

function flaggedResult() {
  return evaluateRestrictionGuard({
    as_of_local_date: TODAY,
    weekly_outcomes: [],
    energy_days: [],
    texts: [
      {
        source: "turn_message",
        text: "I need to burn off dinner",
        content_locale: "en",
      },
    ],
  });
}

Deno.test("escalation writes ONE immediate contract_change_request, stripped of the non-column", async () => {
  const inserts: Array<{ table: string; row: unknown }> = [];
  const db = stubDb({ contract_change_requests: [] }, { inserts });
  const result = flaggedResult();
  assertEquals(result.restriction_flag, true);

  const escalation = await escalateRestrictionSignal(db, {
    userId: USER,
    planVersionId: "22222222-2222-4222-8222-222222222222",
    result,
  });
  assertEquals(escalation.escalated, true);
  assertEquals(escalation.reason, "raised");
  assertEquals(escalation.contractChangeRequestId, "ccr-1");
  assertEquals(inserts.length, 1);

  const row = inserts[0].row as Record<string, unknown>;
  assertEquals(inserts[0].table, "contract_change_requests");
  assertEquals(row.reason_code, "restriction_signal");
  assertEquals(row.urgency, "immediate");
  assertEquals(row.raised_by, "system");
  assertEquals(row.status, "open");
  // The AI proposes nothing about a restriction signal.
  assertEquals(row.suggested_option, null);
  // `bypasses_digest` is NOT a column: sending it would 400 the write and the
  // alert would be lost. urgency='immediate' IS the bypass.
  assertEquals("bypasses_digest" in row, false);
});

Deno.test("an already-open signal is not re-raised (one alert, not thirty)", async () => {
  const inserts: Array<{ table: string; row: unknown }> = [];
  const db = stubDb({ contract_change_requests: [{ id: "ccr-existing" }] }, { inserts });
  const escalation = await escalateRestrictionSignal(db, {
    userId: USER,
    result: flaggedResult(),
  });
  assertEquals(escalation.escalated, false);
  assertEquals(escalation.reason, "already_open");
  assertEquals(escalation.contractChangeRequestId, "ccr-existing");
  assertEquals(inserts.length, 0);
});

Deno.test("a clear result never produces an escalation", async () => {
  const inserts: Array<{ table: string; row: unknown }> = [];
  const db = stubDb({ contract_change_requests: [] }, { inserts });
  const clear = evaluateRestrictionGuard({
    as_of_local_date: TODAY,
    weekly_outcomes: [],
    energy_days: [],
    texts: [],
  });
  const escalation = await escalateRestrictionSignal(db, { userId: USER, result: clear });
  assertEquals(escalation.escalated, false);
  assertEquals(escalation.reason, "flag_down");
  assertEquals(inserts.length, 0);
});
