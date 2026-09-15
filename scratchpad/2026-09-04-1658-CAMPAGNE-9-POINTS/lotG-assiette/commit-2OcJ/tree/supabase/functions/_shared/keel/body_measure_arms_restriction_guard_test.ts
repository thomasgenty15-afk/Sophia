/**
 * LA PREUVE QUI FAIT FF-008 PUIS FF-031 : un poids ANNONCÉ DANS LE CHAT arme la
 * ceinture — par le miroir hebdomadaire ET par la série datée.
 *
 * ── POURQUOI CE TEST EXISTE, ET POURQUOI IL EST BOUT-À-BOUT ────────────────
 * FF-008 R7: « une mesure venue du chat arme la ceinture EXACTEMENT comme celle
 * du dimanche ». La fiche exige que ce soit affirmé « sur le chemin réel, pas
 * sur un mock » — parce que les trois maillons peuvent chacun être justes et la
 * chaîne cassée: c'est LITTÉRALEMENT ce qui était en place avant ce lot.
 * `restriction_guard` lisait `outcomes.weight_7d_avg`, que PERSONNE n'écrit
 * dans le modèle pivot, pendant que tous les écrivains alimentaient
 * `biofeedback.weight_kg`. Une ceinture armée sur un coffre vide.
 *
 * FF-031 rejoue exactement la même exigence un cran plus loin. Le poids ne vit
 * plus dans une case de semaine mais dans `student_body_measures`, une ligne
 * par pesée, et la série que le plancher lit en est DÉRIVÉE. Déplacer le
 * stockage sans prouver la chaîne neuve refabriquerait le défaut d'origine,
 * avec une couche de plus pour le cacher. Les deux chemins sont donc prouvés
 * ici, côte à côte, tant que la double écriture dure (FF-031 R7).
 *
 * Rien n'est simulé sauf le transport. Le plancher est le vrai
 * (`detectDeclaredBodyMeasure`), l'écriture est la vraie
 * (`writeDeclaredBodyMeasure`), les chargeurs sont les vrais
 * (`loadWeeklyOutcomeSamples`, `loadBodyMeasures`), la dérivation est la vraie
 * (`deriveWeeklyOutcomeSamples`), la ceinture est la vraie
 * (`evaluateRestrictionGuard`). Seul PostgREST est remplacé par des tables en
 * mémoire qui appliquent réellement leurs filtres — un faux qui ignorerait les
 * filtres prouverait une chaîne qui n'existe pas.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { detectDeclaredBodyMeasure } from "./body_measure_floor.ts";
import { weekStartOfLocalDate, writeDeclaredBodyMeasure } from "./week_review_io.ts";
import { loadWeeklyOutcomeSamples } from "./restriction_runtime.ts";
import { evaluateRestrictionGuard } from "./restriction_guard.ts";
import { BODY_MEASURES_TABLE, loadBodyMeasures } from "./body_measure_io.ts";
import { deriveWeeklyOutcomeSamples } from "./body_measure_series.ts";

const USER = "22222222-2222-4222-8222-222222222222";

// ---------------------------------------------------------------------------
// Des tables en mémoire qui appliquent VRAIMENT leurs filtres
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

const KNOWN_TABLES = ["weekly_reviews", BODY_MEASURES_TABLE] as const;

function memoryDb(seed: Row[]) {
  const tables: Record<string, Row[]> = {
    weekly_reviews: seed.map((row) => ({ ...row })),
    [BODY_MEASURES_TABLE]: [],
  };
  let autoId = 0;

  function matches(row: Row, filters: Array<[string, string, unknown]>): boolean {
    return filters.every(([op, column, value]) => {
      const actual = row[column];
      if (op === "eq") return String(actual ?? "") === String(value ?? "");
      if (op === "is") return value === null ? actual == null : actual === value;
      if (op === "gte") return String(actual ?? "") >= String(value ?? "");
      if (op === "lte") return String(actual ?? "") <= String(value ?? "");
      if (op === "in") {
        return (value as unknown[]).map(String).includes(String(actual ?? ""));
      }
      return true;
    });
  }

  function builder(table: string) {
    if (!(KNOWN_TABLES as readonly string[]).includes(table)) {
      throw new Error(`memoryDb: table inattendue ${table}`);
    }
    const rows = tables[table];
    const filters: Array<[string, string, unknown]> = [];
    const sorts: Array<[string, boolean]> = [];
    let pendingUpdate: Row | null = null;

    const selected = () => {
      const found = rows.filter((row) => matches(row, filters));
      // Le tri est appliqué POUR DE VRAI: `dailyValues` départage deux mesures
      // du même jour par `measured_at` et « à instant égal, la dernière de la
      // liste gagne ». Un faux qui rendrait les lignes dans l'ordre d'insertion
      // prouverait un déterminisme que la base ne donne pas.
      for (const [column, ascending] of [...sorts].reverse()) {
        found.sort((a, b) => {
          const cmp = String(a[column] ?? "").localeCompare(String(b[column] ?? ""));
          return ascending ? cmp : -cmp;
        });
      }
      return found;
    };

    const api = {
      select: () => api,
      order(column: string, opts?: { ascending?: boolean }) {
        sorts.push([column, opts?.ascending !== false]);
        return api;
      },
      limit: () => api,
      eq(column: string, value: unknown) {
        filters.push(["eq", column, value]);
        return api;
      },
      is(column: string, value: unknown) {
        filters.push(["is", column, value]);
        return api;
      },
      gte(column: string, value: unknown) {
        filters.push(["gte", column, value]);
        return api;
      },
      lte(column: string, value: unknown) {
        filters.push(["lte", column, value]);
        return api;
      },
      in(column: string, values: unknown[]) {
        filters.push(["in", column, values]);
        return api;
      },
      not: () => api,
      maybeSingle() {
        const found = selected();
        if (found.length > 1) {
          return Promise.resolve({
            data: null,
            error: { message: "multiple rows", code: "PGRST116" },
          });
        }
        return Promise.resolve({ data: found[0] ?? null, error: null });
      },
      single() {
        const found = selected();
        return Promise.resolve({ data: found[0] ?? null, error: null });
      },
      update(patch: Row) {
        pendingUpdate = patch;
        return api;
      },
      insert(rowOrRows: Row | Row[]) {
        const list = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        const inserted = list.map((row) => {
          autoId += 1;
          const stored = { id: `row-${autoId}`, ...row };
          rows.push(stored);
          return stored;
        });
        const returned = { data: inserted.map((r) => ({ id: r.id })), error: null };
        const afterSelect = {
          single: () =>
            Promise.resolve({ data: returned.data[0] ?? null, error: null }),
          // deno-lint-ignore no-explicit-any
          then: (resolve: (v: any) => unknown) =>
            Promise.resolve(returned).then(resolve),
        };
        return {
          select: () => afterSelect,
          // deno-lint-ignore no-explicit-any
          then: (resolve: (v: any) => unknown) =>
            Promise.resolve({ data: null, error: null }).then(resolve),
        };
      },
      // deno-lint-ignore no-explicit-any
      then(resolve: (v: any) => unknown) {
        if (pendingUpdate) {
          for (const row of selected()) Object.assign(row, pendingUpdate);
          pendingUpdate = null;
          return Promise.resolve({ data: null, error: null }).then(resolve);
        }
        return Promise.resolve({ data: selected(), error: null }).then(resolve);
      },
    };
    return api;
  }

  return {
    db: { from: builder },
    rows: tables.weekly_reviews,
    measures: tables[BODY_MEASURES_TABLE],
  };
}

/** Une semaine telle que le point du dimanche l'écrit. */
function sundayWeek(weekStart: string, weightKg: number): Row {
  return {
    id: `seed-${weekStart}`,
    user_id: USER,
    week_start_date: weekStart,
    plan_version_id: null,
    biofeedback: { weight_kg: weightKg, source: "in_app_weekly_form" },
    outcomes: null,
    self_rated_adherence: null,
    logging_coverage: null,
    created_at: `${weekStart}T20:00:00Z`,
  };
}

/** Une mesure datée telle que la table la porte, pour l'historique du seed. */
function datedRow(localDate: string, valueSi: number): Row {
  return {
    id: `seed-m-${localDate}`,
    user_id: USER,
    local_date: localDate,
    measured_at: `${localDate}T20:00:00Z`,
    kind: "weight",
    value_si: valueSi,
    source: "sunday_flow",
  };
}

// deno-lint-ignore no-explicit-any
async function derivedSeries(db: any, todayLocalDate: string, sinceLocalDate: string) {
  return deriveWeeklyOutcomeSamples({
    measures: await loadBodyMeasures(db, {
      userId: USER,
      sinceLocalDate,
      untilLocalDate: todayLocalDate,
      kinds: ["weight"],
    }),
    weeks: [],
  });
}

// ---------------------------------------------------------------------------
// LA PREUVE — le miroir hebdomadaire (FF-008)
// ---------------------------------------------------------------------------

Deno.test("BOUT-À-BOUT — un poids annoncé DANS LE CHAT lève le plancher", async () => {
  // Deux semaines déjà là, écrites par le point du dimanche. À elles seules
  // elles ne déclenchent rien: 70,0 → 69,7 sur 14 jours = 0,21 %/semaine, très
  // en dessous du plafond de 1,2 %.
  const { db, rows, measures } = memoryDb([
    sundayWeek("2026-07-20", 70.0),
    sundayWeek("2026-07-27", 69.7),
  ]);

  const today = "2026-08-05"; // un mardi
  const weekStart = weekStartOfLocalDate(today);
  assertEquals(weekStart, "2026-08-03");

  // Avant le chat: la ceinture ne voit rien d'anormal.
  const before = evaluateRestrictionGuard({
    as_of_local_date: today,
    weekly_outcomes: await loadWeeklyOutcomeSamples(db, {
      userId: USER,
      asOfLocalDate: today,
    }),
    energy_days: [],
    texts: [],
  });
  assertEquals(before.restriction_flag, false);

  // L'élève écrit son poids, un mardi matin, dans la conversation.
  const measure = detectDeclaredBodyMeasure("je suis à 67,4 kg ce matin", "metric");
  assert(measure, "le plancher doit reconnaître la déclaration");
  assertEquals(measure.kind, "weight");
  assertEquals(measure.valueSi, 67.4);

  const written = await writeDeclaredBodyMeasure(db, {
    userId: USER,
    weekStart: weekStart!,
    kind: measure.kind,
    valueSi: measure.valueSi,
    measuredAt: `${today}T07:12:00`,
    localDate: today,
    contentLocale: "fr-FR",
    studentNote: measure.studentNote,
  });
  assertEquals(written.outcome, "inserted");
  // Vérité d'exécution: la valeur affirmée est celle RELUE.
  assertEquals(written.storedValue, 67.4);
  // FF-031 — et la mesure DATÉE a atterri, elle aussi.
  assertEquals(written.datedMeasureWritten, true);
  assertEquals(written.datedMeasureIssue, null);

  // Après le chat: 70,0 → 67,4 sur 14 jours = 1,857 %/semaine > 1,2 %.
  const after = evaluateRestrictionGuard({
    as_of_local_date: today,
    weekly_outcomes: await loadWeeklyOutcomeSamples(db, {
      userId: USER,
      asOfLocalDate: today,
    }),
    energy_days: [],
    texts: [],
  });
  assertEquals(after.restriction_flag, true);
  const rapid = after.triggers.find((t) => t.code === "rapid_weight_loss");
  assert(rapid, "le déclencheur attendu est rapid_weight_loss");
  assertEquals(rapid.evidence.window_start_week, "2026-07-20");
  assertEquals(rapid.evidence.window_end_week, "2026-08-03");

  // Le miroir hebdomadaire porte la valeur, avec sa provenance honnête.
  const chatWeek = rows.find((row) => row.week_start_date === "2026-08-03");
  assert(chatWeek, "la semaine courante doit exister");
  assertEquals((chatWeek.biofeedback as Record<string, unknown>).weight_kg, 67.4);
  assertEquals((chatWeek.biofeedback as Record<string, unknown>).source, "chat");

  // Et la mesure datée porte le JOUR, pas le lundi de sa semaine.
  assertEquals(measures.length, 1);
  assertEquals(measures[0].local_date, "2026-08-05");
  assertEquals(measures[0].kind, "weight");
  assertEquals(measures[0].value_si, 67.4);
  assertEquals(measures[0].source, "chat");
});

// ---------------------------------------------------------------------------
// LA PREUVE — la série DATÉE (FF-031)
// ---------------------------------------------------------------------------

Deno.test("FF-031 BOUT-À-BOUT — la SÉRIE DÉRIVÉE lève le plancher, sans le miroir", async () => {
  // Le même élève, la même perte, mais la ceinture est nourrie par la table
  // datée et par elle seule. C'est le chemin qui restera quand le miroir
  // partira: s'il ne mord pas ici, le retrait du miroir désarmerait le plancher
  // sans qu'aucun test ne rougisse.
  const { db } = memoryDb([]);
  const seedRows = [datedRow("2026-07-26", 70.0), datedRow("2026-08-02", 69.7)];
  for (const row of seedRows) {
    await db.from(BODY_MEASURES_TABLE).insert(row);
  }

  const today = "2026-08-09"; // le dimanche de la semaine du 03
  const before = evaluateRestrictionGuard({
    as_of_local_date: today,
    weekly_outcomes: await derivedSeries(db, today, "2026-07-01"),
    energy_days: [],
    texts: [],
  });
  assertEquals(before.restriction_flag, false);

  const measure = detectDeclaredBodyMeasure("je suis à 67,4 kg ce matin", "metric");
  assert(measure);
  await writeDeclaredBodyMeasure(db, {
    userId: USER,
    weekStart: "2026-08-03",
    kind: measure.kind,
    valueSi: measure.valueSi,
    measuredAt: `${today}T07:12:00`,
    localDate: today,
    contentLocale: "fr-FR",
  });

  const series = await derivedSeries(db, today, "2026-07-01");
  assertEquals(series.map((s) => s.week_start_date), [
    "2026-07-20",
    "2026-07-27",
    "2026-08-03",
  ]);
  assertEquals(series.map((s) => s.weight_7d_avg_kg), [70.0, 69.7, 67.4]);

  const after = evaluateRestrictionGuard({
    as_of_local_date: today,
    weekly_outcomes: series,
    energy_days: [],
    texts: [],
  });
  assertEquals(after.restriction_flag, true);
  assertEquals(after.triggers[0].code, "rapid_weight_loss");
});

Deno.test("FF-031 — la correction du même jour NE crée PAS de variation fantôme", async () => {
  // « 87… pardon, 78 ». Le miroir REMPLACE (une case par semaine); la table
  // datée AJOUTE, et c'est la dérivation qui tranche. Les deux doivent aboutir
  // au même chiffre, sinon la ceinture et l'écran se contrediraient.
  const { db, rows, measures } = memoryDb([]);
  const common = {
    userId: USER,
    weekStart: "2026-08-03",
    kind: "weight" as const,
    localDate: "2026-08-05",
    contentLocale: "fr-FR",
  };
  const first = await writeDeclaredBodyMeasure(db, {
    ...common,
    valueSi: 87,
    measuredAt: "2026-08-05T07:12:00Z",
  });
  assertEquals(first.outcome, "inserted");
  const second = await writeDeclaredBodyMeasure(db, {
    ...common,
    valueSi: 78,
    measuredAt: "2026-08-05T07:13:00Z",
  });
  assertEquals(second.outcome, "updated");
  assertEquals(second.storedValue, 78);

  // Le miroir: une ligne de semaine, la dernière valeur.
  assertEquals(rows.filter((r) => r.week_start_date === "2026-08-03").length, 1);
  // La table datée: DEUX lignes — le démenti est gardé, il est auditable.
  assertEquals(measures.length, 2);
  // Et la série dérivée ne moyenne pas 87 et 78 en 82,5.
  const series = await derivedSeries(db, "2026-08-09", "2026-08-01");
  assertEquals(series.length, 1);
  assertEquals(series[0].weight_7d_avg_kg, 78);
});

Deno.test("FF-031 — trois pesées dans la semaine, et les trois comptent", async () => {
  // Le cas qui n'existait pas avant ce chantier: lundi 98,5 · mercredi 98,1 ·
  // vendredi 97,9. La case unique de `weekly_reviews` n'en gardait qu'une.
  const { db, rows, measures } = memoryDb([]);
  for (const [localDate, value] of [
    ["2026-08-03", 98.5],
    ["2026-08-05", 98.1],
    ["2026-08-07", 97.9],
  ] as const) {
    await writeDeclaredBodyMeasure(db, {
      userId: USER,
      weekStart: "2026-08-03",
      kind: "weight",
      valueSi: value,
      measuredAt: `${localDate}T07:12:00Z`,
      localDate,
      contentLocale: "fr-FR",
    });
  }
  assertEquals(measures.length, 3);
  // Le miroir n'a gardé que la dernière — c'est ce que FF-031 nomme comme le
  // défaut, et il survit tel quel le temps de la double écriture.
  assertEquals(
    (rows[0].biofeedback as Record<string, unknown>).weight_kg,
    97.9,
  );
  // La série dérivée, elle, moyenne les trois jours.
  const series = await derivedSeries(db, "2026-08-09", "2026-08-01");
  assertEquals(series[0].weight_7d_avg_kg, 98.2);
});

Deno.test("EXACTEMENT COMME LE DIMANCHE — la même valeur, l'autre écrivain", async () => {
  // La contre-épreuve de R7: si la même valeur écrite par le formulaire du
  // dimanche ne levait PAS le plancher, « exactement comme s'il venait du
  // dimanche » serait faux dans l'autre sens.
  const { db } = memoryDb([
    sundayWeek("2026-07-20", 70.0),
    sundayWeek("2026-07-27", 69.7),
    sundayWeek("2026-08-03", 67.4),
  ]);
  const result = evaluateRestrictionGuard({
    as_of_local_date: "2026-08-05",
    weekly_outcomes: await loadWeeklyOutcomeSamples(db, {
      userId: USER,
      asOfLocalDate: "2026-08-05",
    }),
    energy_days: [],
    texts: [],
  });
  assertEquals(result.restriction_flag, true);
  assertEquals(result.triggers[0].code, "rapid_weight_loss");
});

Deno.test("LA FUSION — une mesure dite mardi n'efface pas le dimanche", async () => {
  // Le formulaire du dimanche a rempli six axes. Une mesure annoncée en
  // conversation ne doit pas les effacer: le jsonb est relu et fusionné.
  const { db, rows } = memoryDb([
    {
      id: "seed",
      user_id: USER,
      week_start_date: "2026-08-03",
      plan_version_id: null,
      biofeedback: { energy: 3, hunger: 4, sleep: 2, source: "in_app_weekly_form" },
      outcomes: null,
      created_at: "2026-08-03T20:00:00Z",
    },
  ]);
  await writeDeclaredBodyMeasure(db, {
    userId: USER,
    weekStart: "2026-08-03",
    kind: "weight",
    valueSi: 78,
    measuredAt: "2026-08-05T07:12:00",
    localDate: "2026-08-05",
    contentLocale: "fr-FR",
  });
  const bio = rows[0].biofeedback as Record<string, unknown>;
  assertEquals(bio.energy, 3);
  assertEquals(bio.hunger, 4);
  assertEquals(bio.sleep, 2);
  assertEquals(bio.weight_kg, 78);
  // La provenance dit la vérité sur le DERNIER geste.
  assertEquals(bio.source, "chat");
});

Deno.test("LE TOUR DE TAILLE va dans sa colonne, pas dans celle du poids", async () => {
  const { db, rows, measures } = memoryDb([]);
  await writeDeclaredBodyMeasure(db, {
    userId: USER,
    weekStart: "2026-08-03",
    kind: "waist",
    valueSi: 84,
    measuredAt: "2026-08-05T07:12:00",
    localDate: "2026-08-05",
    contentLocale: "fr-FR",
  });
  const bio = rows[0].biofeedback as Record<string, unknown>;
  assertEquals(bio.waist_cm, 84);
  assertEquals(bio.weight_kg, undefined);
  // Et côté table datée: une grandeur, la bonne.
  assertEquals(measures.length, 1);
  assertEquals(measures[0].kind, "waist");
  // Le chargeur du plancher ne lit QUE le poids: un tour de taille ne doit
  // jamais entrer dans une série de poids.
  const weights = await loadBodyMeasures(db, {
    userId: USER,
    sinceLocalDate: "2026-08-01",
    untilLocalDate: "2026-08-09",
    kinds: ["weight"],
  });
  assertEquals(weights.length, 0);
});

Deno.test("UNE SEMAINE MAL FORMÉE EST REFUSÉE, pas rangée n'importe où", async () => {
  const { db } = memoryDb([]);
  let threw = false;
  try {
    await writeDeclaredBodyMeasure(db, {
      userId: USER,
      weekStart: "mardi",
      kind: "weight",
      valueSi: 78,
      measuredAt: "2026-08-05T07:12:00",
      localDate: "2026-08-05",
      contentLocale: "fr-FR",
    });
  } catch (error) {
    threw = true;
    assert(String(error).includes("weekStart"));
  }
  assert(threw, "une semaine illisible doit remonter, jamais s'écrire ailleurs");
});

Deno.test("R9 — une panne de la table datée n'emporte PAS l'écriture miroir", async () => {
  // Tant que la double écriture dure, `biofeedback` est le chemin qui marche:
  // le perdre pour une panne de la table neuve serait une régression sur un
  // accusé que l'élève reçoit déjà. Le motif est RENDU, pas seulement
  // journalisé — un échec lisible seulement dans les logs d'un cron est un
  // échec qu'on découvre le jour où la ceinture n'a pas mordu.
  const { db, rows } = memoryDb([]);
  const broken = {
    from(table: string) {
      if (table === BODY_MEASURES_TABLE) {
        throw new Error("relation does not exist");
      }
      return db.from(table);
    },
  };
  const written = await writeDeclaredBodyMeasure(broken, {
    userId: USER,
    weekStart: "2026-08-03",
    kind: "weight",
    valueSi: 78,
    measuredAt: "2026-08-05T07:12:00",
    localDate: "2026-08-05",
    contentLocale: "fr-FR",
  });
  assertEquals(written.storedValue, 78);
  assertEquals(written.datedMeasureWritten, false);
  assert(String(written.datedMeasureIssue).includes("relation does not exist"));
  assertEquals((rows[0].biofeedback as Record<string, unknown>).weight_kg, 78);
});
