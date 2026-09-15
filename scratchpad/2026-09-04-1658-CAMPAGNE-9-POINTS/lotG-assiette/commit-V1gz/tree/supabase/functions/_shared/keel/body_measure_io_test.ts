/**
 * FF-031 — LA DATE LOCALE D'UNE MESURE SAISIE AU FORMULAIRE, et l'écriture.
 *
 * Les deux formulaires (le point du dimanche, la carte des mesures) portent une
 * SEMAINE dans leur jeton, pas un jour. L'invariant que ces cas tiennent est
 * qu'il ressort toujours un jour DE CETTE SEMAINE — sans quoi la même pesée
 * atterrirait dans deux semaines dérivées différentes selon qu'on la lit par la
 * table ou par le miroir `weekly_reviews`, et la divergence serait invisible
 * jusqu'à ce qu'elle change un pourcentage de perte.
 */
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  BODY_MEASURES_TABLE,
  insertBodyMeasures,
  loadBodyMeasures,
  resolveMeasureLocalDate,
} from "./body_measure_io.ts";

const USER = "33333333-3333-4333-8333-333333333333";

// ---------------------------------------------------------------------------
// La date locale
// ---------------------------------------------------------------------------

Deno.test("le jour vient du FUSEAU DE L'ÉLÈVE, pas de l'horloge du serveur", () => {
  // Mardi 22:30 UTC = mercredi 08:30 à Sydney. Un serveur qui daterait la
  // mesure de sa propre journée la rangerait un jour trop tôt.
  const now = new Date("2026-08-04T22:30:00Z");
  assertEquals(
    resolveMeasureLocalDate({ weekStart: "2026-08-03", timezone: "Australia/Sydney", now }),
    "2026-08-05",
  );
  assertEquals(
    resolveMeasureLocalDate({ weekStart: "2026-08-03", timezone: "Europe/Paris", now }),
    "2026-08-05", // 00:30 le 5 à Paris
  );
  assertEquals(
    resolveMeasureLocalDate({ weekStart: "2026-08-03", timezone: "America/Los_Angeles", now }),
    "2026-08-04", // encore mardi après-midi
  );
});

Deno.test("L'INVARIANT — la date rendue est TOUJOURS dans la semaine du jeton", () => {
  // Un onglet resté ouvert depuis dimanche, un envoi rejoué: l'horloge et le
  // jeton peuvent nommer deux semaines. Le jeton gagne, parce que c'est LUI qui
  // décide de la ligne fusionnée côté miroir.
  const late = new Date("2026-08-20T10:00:00Z");
  assertEquals(
    resolveMeasureLocalDate({ weekStart: "2026-08-03", timezone: "Europe/Paris", now: late }),
    "2026-08-09", // le dimanche de la semaine nommée
  );
  const early = new Date("2026-07-01T10:00:00Z");
  assertEquals(
    resolveMeasureLocalDate({ weekStart: "2026-08-03", timezone: "Europe/Paris", now: early }),
    "2026-08-03",
  );
});

Deno.test("un fuseau ABSENT ou INCONNU ne fait pas perdre la mesure", () => {
  // `localDateInZone` jette, à raison, sur un fuseau vide ou inconnu: pour un
  // dîner, mieux vaut un tour qui échoue qu'un fait rangé la veille. Ici
  // l'enjeu s'inverse — jeter ferait PERDRE la mesure, alors que la semaine est
  // connue de façon certaine.
  const now = new Date("2026-08-05T10:00:00Z");
  for (const timezone of [null, "", "   ", "Mars/Olympus_Mons"]) {
    assertEquals(
      resolveMeasureLocalDate({ weekStart: "2026-08-03", timezone, now }),
      "2026-08-05",
    );
  }
});

Deno.test("une semaine illisible JETTE — elle ne se devine pas depuis l'horloge", () => {
  assertThrows(
    () =>
      resolveMeasureLocalDate({
        weekStart: "mardi",
        timezone: "Europe/Paris",
        now: new Date("2026-08-05T10:00:00Z"),
      }),
    Error,
    "weekStart",
  );
});

// ---------------------------------------------------------------------------
// L'écriture et la lecture
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function memoryTable() {
  const rows: Row[] = [];
  let autoId = 0;
  function builder(table: string) {
    if (table !== BODY_MEASURES_TABLE) throw new Error(`table inattendue ${table}`);
    const filters: Array<[string, string, unknown]> = [];
    const sorts: Array<[string, boolean]> = [];
    const selected = () => {
      const found = rows.filter((row) =>
        filters.every(([op, column, value]) => {
          const actual = row[column];
          if (op === "eq") return String(actual ?? "") === String(value ?? "");
          if (op === "gte") return String(actual ?? "") >= String(value ?? "");
          if (op === "lte") return String(actual ?? "") <= String(value ?? "");
          if (op === "in") return (value as unknown[]).map(String).includes(String(actual));
          return true;
        })
      );
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
      eq(c: string, v: unknown) {
        filters.push(["eq", c, v]);
        return api;
      },
      gte(c: string, v: unknown) {
        filters.push(["gte", c, v]);
        return api;
      },
      lte(c: string, v: unknown) {
        filters.push(["lte", c, v]);
        return api;
      },
      in(c: string, v: unknown[]) {
        filters.push(["in", c, v]);
        return api;
      },
      insert(payload: Row | Row[]) {
        const list = Array.isArray(payload) ? payload : [payload];
        const ids = list.map((row) => {
          autoId += 1;
          rows.push({ id: `m-${autoId}`, ...row });
          return { id: `m-${autoId}` };
        });
        return {
          select: () => Promise.resolve({ data: ids, error: null }),
        };
      },
      // deno-lint-ignore no-explicit-any
      then: (resolve: (v: any) => unknown) =>
        Promise.resolve({ data: selected(), error: null }).then(resolve),
    };
    return api;
  }
  return { db: { from: builder }, rows };
}

Deno.test("l'écriture est RELUE — un décompte qui ne correspond pas jette", async () => {
  const { db, rows } = memoryTable();
  const written = await insertBodyMeasures(db, [
    {
      userId: USER,
      kind: "weight",
      valueSi: 78.4,
      source: "chat",
      measuredAt: "2026-08-05T07:12:00Z",
      localDate: "2026-08-05",
      contentLocale: "fr-FR",
      studentNote: "je suis à 78,4 kg ce matin",
    },
  ]);
  assertEquals(written.written, 1);
  assertEquals(written.ids.length, 1);
  assertEquals(rows[0].value_si, 78.4);
  assertEquals(rows[0].student_note, "je suis à 78,4 kg ce matin");

  const silent = {
    from: () => ({
      insert: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
    }),
  };
  let threw = false;
  try {
    await insertBodyMeasures(silent, [{
      userId: USER,
      kind: "weight",
      valueSi: 78.4,
      source: "chat",
      measuredAt: "2026-08-05T07:12:00Z",
      localDate: "2026-08-05",
    }]);
  } catch (error) {
    threw = true;
    assert(String(error).includes("write-through"));
  }
  assert(threw, "une écriture qu'on n'a pas vue atterrir n'est pas une écriture");
});

Deno.test("rien à écrire n'écrit rien, et ne prétend pas le contraire", async () => {
  const { db, rows } = memoryTable();
  assertEquals(await insertBodyMeasures(db, []), { written: 0, ids: [] });
  assertEquals(rows.length, 0);
});

Deno.test("une entrée invalide JETTE avant d'atteindre la base", async () => {
  const { db, rows } = memoryTable();
  const base = {
    userId: USER,
    kind: "weight" as const,
    valueSi: 78,
    source: "chat" as const,
    measuredAt: "2026-08-05T07:12:00Z",
    localDate: "2026-08-05",
  };
  for (const [patch, needle] of [
    [{ userId: "  " }, "userId"],
    [{ valueSi: Number.NaN }, "valueSi"],
    [{ localDate: "05/08/2026" }, "localDate"],
    [{ measuredAt: "hier matin" }, "measuredAt"],
    // deno-lint-ignore no-explicit-any
    [{ kind: "hips" as any }, "kind"],
  ] as const) {
    let threw = false;
    try {
      await insertBodyMeasures(db, [{ ...base, ...patch }]);
    } catch (error) {
      threw = true;
      assert(String(error).includes(needle), `${needle} attendu, reçu ${error}`);
    }
    assert(threw, `${needle} aurait dû jeter`);
  }
  assertEquals(rows.length, 0);
});

Deno.test("la lecture rend un ordre STABLE — c'est un contrat, pas une commodité", async () => {
  // `dailyValues` départage par `measured_at` et, à instant égal, « la dernière
  // de la liste gagne ». Un tri instable ferait gagner tantôt l'une tantôt
  // l'autre sur deux lectures de la même base.
  const { db } = memoryTable();
  await insertBodyMeasures(db, [
    {
      userId: USER,
      kind: "weight",
      valueSi: 80,
      source: "chat",
      measuredAt: "2026-08-06T07:00:00Z",
      localDate: "2026-08-06",
    },
    {
      userId: USER,
      kind: "waist",
      valueSi: 84,
      source: "chat",
      measuredAt: "2026-08-05T07:00:00Z",
      localDate: "2026-08-05",
    },
    {
      userId: USER,
      kind: "weight",
      valueSi: 81,
      source: "plan_card",
      measuredAt: "2026-08-05T20:00:00Z",
      localDate: "2026-08-05",
    },
  ]);
  const all = await loadBodyMeasures(db, {
    userId: USER,
    sinceLocalDate: "2026-08-03",
    untilLocalDate: "2026-08-09",
  });
  assertEquals(all.map((m) => `${m.localDate}/${m.kind}`), [
    "2026-08-05/waist",
    "2026-08-05/weight",
    "2026-08-06/weight",
  ]);

  const weights = await loadBodyMeasures(db, {
    userId: USER,
    sinceLocalDate: "2026-08-03",
    untilLocalDate: "2026-08-09",
    kinds: ["weight"],
  });
  assertEquals(weights.map((m) => m.valueSi), [81, 80]);
});

Deno.test("un `numeric` rendu en CHAÎNE reste un nombre, et `\"\"` ne vaut pas zéro", async () => {
  // « `as` sur un type étranger désarme le typecheck »: le cast aurait compilé
  // et menti. Un zéro fabriqué serait une pesée de 0 kg dans une moyenne qui
  // arme une ceinture.
  const stringy = {
    from: () => {
      const api = {
        select: () => api,
        order: () => api,
        eq: () => api,
        gte: () => api,
        lte: () => api,
        in: () => api,
        // deno-lint-ignore no-explicit-any
        then: (resolve: (v: any) => unknown) =>
          Promise.resolve({
            data: [{
              local_date: "2026-08-05",
              kind: "weight",
              value_si: "78.4",
              measured_at: "2026-08-05T07:00:00Z",
            }],
            error: null,
          }).then(resolve),
      };
      return api;
    },
  };
  const rows = await loadBodyMeasures(stringy, {
    userId: USER,
    sinceLocalDate: "2026-08-03",
    untilLocalDate: "2026-08-09",
  });
  assertEquals(rows[0].valueSi, 78.4);

  const empty = {
    from: () => {
      const api = {
        select: () => api,
        order: () => api,
        eq: () => api,
        gte: () => api,
        lte: () => api,
        in: () => api,
        // deno-lint-ignore no-explicit-any
        then: (resolve: (v: any) => unknown) =>
          Promise.resolve({
            data: [{
              local_date: "2026-08-05",
              kind: "weight",
              value_si: "",
              measured_at: "2026-08-05T07:00:00Z",
            }],
            error: null,
          }).then(resolve),
      };
      return api;
    },
  };
  let threw = false;
  try {
    await loadBodyMeasures(empty, {
      userId: USER,
      sinceLocalDate: "2026-08-03",
      untilLocalDate: "2026-08-09",
    });
  } catch (error) {
    threw = true;
    assert(String(error).includes("value_si"));
  }
  assert(threw, "une valeur vide doit jeter, jamais devenir 0 kg");
});
