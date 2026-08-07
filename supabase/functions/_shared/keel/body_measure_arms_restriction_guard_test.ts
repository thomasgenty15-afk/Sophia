/**
 * LA PREUVE QUI FAIT FF-008 : un poids ANNONCÉ DANS LE CHAT arme la ceinture.
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
 * Donc: rien n'est simulé ici sauf le transport. Le plancher est le vrai
 * (`detectDeclaredBodyMeasure`), l'écriture est la vraie
 * (`writeDeclaredBodyMeasure`), le chargeur est le vrai
 * (`loadWeeklyOutcomeSamples`), la ceinture est la vraie
 * (`evaluateRestrictionGuard`). Seul PostgREST est remplacé par une table en
 * mémoire qui applique réellement ses filtres — un faux qui ignorerait les
 * filtres prouverait une chaîne qui n'existe pas.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { detectDeclaredBodyMeasure } from "./body_measure_floor.ts";
import { weekStartOfLocalDate, writeDeclaredBodyMeasure } from "./week_review_io.ts";
import { loadWeeklyOutcomeSamples } from "./restriction_runtime.ts";
import { evaluateRestrictionGuard } from "./restriction_guard.ts";

const USER = "22222222-2222-4222-8222-222222222222";

// ---------------------------------------------------------------------------
// Une table en mémoire qui applique VRAIMENT ses filtres
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function memoryDb(seed: Row[]) {
  const rows: Row[] = seed.map((row) => ({ ...row }));
  let autoId = 0;

  function matches(row: Row, filters: Array<[string, string, unknown]>): boolean {
    return filters.every(([op, column, value]) => {
      const actual = row[column];
      if (op === "eq") return String(actual ?? "") === String(value ?? "");
      if (op === "is") return value === null ? actual == null : actual === value;
      if (op === "gte") return String(actual ?? "") >= String(value ?? "");
      if (op === "lte") return String(actual ?? "") <= String(value ?? "");
      return true;
    });
  }

  function builder(table: string) {
    if (table !== "weekly_reviews") {
      throw new Error(`memoryDb: table inattendue ${table}`);
    }
    const filters: Array<[string, string, unknown]> = [];
    let pendingUpdate: Row | null = null;

    const selected = () => rows.filter((row) => matches(row, filters));

    const api = {
      select: () => api,
      order: () => api,
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
      insert(row: Row) {
        autoId += 1;
        const inserted = { id: `row-${autoId}`, ...row };
        rows.push(inserted);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: inserted.id }, error: null }),
          }),
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

  return { db: { from: builder }, rows };
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

// ---------------------------------------------------------------------------
// LA PREUVE
// ---------------------------------------------------------------------------

Deno.test("BOUT-À-BOUT — un poids annoncé DANS LE CHAT lève le plancher", async () => {
  // Deux semaines déjà là, écrites par le point du dimanche. À elles seules
  // elles ne déclenchent rien: 70,0 → 69,4 sur 14 jours = 0,43 %/semaine, très
  // en dessous du plafond de 1,2 %.
  const { db, rows } = memoryDb([
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
    contentLocale: "fr-FR",
  });
  assertEquals(written.outcome, "inserted");
  // Vérité d'exécution: la valeur affirmée est celle RELUE.
  assertEquals(written.storedValue, 67.4);

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

  // Et la mesure est rangée LÀ OÙ LE POINT DU DIMANCHE LA RANGE, avec sa
  // provenance honnête — pas dans une table à part.
  const chatWeek = rows.find((row) => row.week_start_date === "2026-08-03");
  assert(chatWeek, "la semaine courante doit exister");
  assertEquals(
    (chatWeek.biofeedback as Record<string, unknown>).weight_kg,
    67.4,
  );
  assertEquals((chatWeek.biofeedback as Record<string, unknown>).source, "chat");
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

Deno.test("UNE SECONDE DÉCLARATION REMPLACE, elle n'ajoute pas", async () => {
  // « pardon, 78 pas 87 ». Deux lignes pour une semaine créeraient une
  // variation fantôme — et `restriction_guard` JETTE sur une semaine dupliquée.
  const { db, rows } = memoryDb([]);
  const common = {
    userId: USER,
    weekStart: "2026-08-03",
    kind: "weight" as const,
    contentLocale: "fr-FR",
  };
  const first = await writeDeclaredBodyMeasure(db, {
    ...common,
    valueSi: 87,
    measuredAt: "2026-08-05T07:12:00",
  });
  assertEquals(first.outcome, "inserted");
  const second = await writeDeclaredBodyMeasure(db, {
    ...common,
    valueSi: 78,
    measuredAt: "2026-08-05T07:13:00",
  });
  assertEquals(second.outcome, "updated");
  assertEquals(second.storedValue, 78);
  assertEquals(rows.filter((r) => r.week_start_date === "2026-08-03").length, 1);
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
  const { db, rows } = memoryDb([]);
  await writeDeclaredBodyMeasure(db, {
    userId: USER,
    weekStart: "2026-08-03",
    kind: "waist",
    valueSi: 84,
    measuredAt: "2026-08-05T07:12:00",
    contentLocale: "fr-FR",
  });
  const bio = rows[0].biofeedback as Record<string, unknown>;
  assertEquals(bio.waist_cm, 84);
  assertEquals(bio.weight_kg, undefined);
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
      contentLocale: "fr-FR",
    });
  } catch (error) {
    threw = true;
    assert(String(error).includes("weekStart"));
  }
  assert(threw, "une semaine illisible doit remonter, jamais s'écrire ailleurs");
});
