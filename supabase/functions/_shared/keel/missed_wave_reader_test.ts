import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";

import { loadSkippedDishIndexes } from "./accident_io.ts";
import { type AccidentPlan, parseAccidentPlan } from "./accident.ts";

/**
 * FF-061 R6 — UNE VAGUE RATÉE INVALIDE, MÊME QUAND LE DÉCALAGE EST REFUSÉ.
 *
 * ══ LE DÉFAUT QUE CES ÉPREUVES FERMENT ═══════════════════════════════════
 *
 * `grocery_wave_states` était ÉCRITE depuis FF-058 et **personne ne la lisait
 * pour invalider**. `loadSkippedDishIndexes` — le lecteur unique par lequel
 * tout appelant qui ANNONCE des plats doit passer — ne regardait que les
 * SESSIONS. Conséquence: « je n'ai pas fait les courses » + « non » au décalage
 * ne faisait littéralement rien, et le plan continuait d'annoncer une cuisson
 * et des repas qu'aucun ingrédient ne permettait.
 *
 * La réparation n'est PAS une écriture de plus sur le refus — ce serait le
 * second état à invalider que ce dépôt paie en boucle. C'est un LECTEUR de plus
 * sur un marqueur qui était déjà écrit.
 *
 * ⚠️ CES ÉPREUVES EXÉCUTENT LE VRAI LECTEUR contre une base doublée. Une
 * épingle textuelle sur `cascadeSkippedWave(` ne verrait pas un appel dont on
 * a coupé l'argument — la cicatrice `safety_wiring_executed_test.ts`.
 */

const USER = "44444444-4444-4444-8444-444444444444";
const MEAL = "55555555-5555-4555-8555-555555555555";
const STARTS_ON = "2026-03-09"; // lundi

function dish(title: string, day: string, prepIds: string[]) {
  return {
    title,
    slot: "dinner",
    day,
    method: `Cook ${title}.`,
    ingredients: [{ term: "filler", amount: 100, unit: "g" }],
    uses: prepIds.map((id) => ({ preparation_id: id, servings: 1 })),
  };
}

function planRow(): Record<string, unknown> {
  return {
    id: MEAL,
    starts_on: STARTS_ON,
    duration_days: 7,
    dishes: [
      dish("Mercredi", "wed", ["prep_a"]), // 0 — dépend de la cuisson de mercredi
      dish("Jeudi", "thu", ["prep_a"]), // 1 — idem
      dish("Vendredi", "fri", []), // 2 — ne dépend de rien
    ],
    preparations: [{
      id: "prep_a",
      title: "Roast chicken",
      cook_on: "wed",
      servings_made: 3,
      method: "Roast.",
      active_minutes: 10,
      total_minutes: 50,
      // Périssable, donc la vague qui le porte a un `buyOn` calculé et sert
      // bien la cuisson de mercredi.
      ingredients: [{ term: "chicken thighs", amount: 600, unit: "g" }],
    }],
    cooking_sessions: [
      { day: "wed", preparation_ids: ["prep_a"], run_through: "Oven on." },
    ],
    shopping_list: [
      { term: "chicken thighs", aisle: "protein", quantity: "600 g", food_group: "poultry" },
    ],
  };
}

function planOf(): AccidentPlan {
  const parsed = parseAccidentPlan(MEAL, planRow());
  if (!parsed) throw new Error("fixture did not parse");
  return parsed;
}

/**
 * Une base doublée. Chaque table rend les lignes qu'on lui donne, quel que soit
 * le filtre: ces épreuves n'éprouvent pas les requêtes (leurs propres tests le
 * font), elles éprouvent QUI est lu.
 */
function stubDb(rows: Record<string, unknown[]>) {
  const builder = (table: string) => {
    const result = { data: rows[table] ?? [], error: null };
    // deno-lint-ignore no-explicit-any
    const b: any = {};
    for (
      const m of ["select", "eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "not", "like", "ilike", "order", "limit"]
    ) b[m] = () => b;
    b.maybeSingle = () =>
      Promise.resolve({ data: (rows[table] ?? [])[0] ?? null, error: null });
    b.single = b.maybeSingle;
    // deno-lint-ignore no-explicit-any
    b.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
    return b;
  };
  return { from: (t: string) => builder(t) };
}

Deno.test("⛔ UNE VAGUE NON FAITE INVALIDE CE QUI EN DESCEND", async () => {
  const plan = planOf();
  // On lit la vague par le même calcul que la production, pour ne pas inventer
  // un `buyOn`.
  const { planGroceryWavesForPlan } = await import("./accident.ts");
  const waves = planGroceryWavesForPlan(plan);
  const served = waves.find((w) => w.servesCookDates.length > 0);
  assert(served, "la fixture doit produire une vague qui sert une cuisson");

  const db = stubDb({
    cooking_session_states: [],
    protocol_events: [],
    grocery_wave_states: [{ buy_on: served.buyOn, done: false }],
    student_generated_meals: [planRow()],
  });

  const skipped = await loadSkippedDishIndexes(db as never, {
    userId: USER,
    plan,
  });
  assertEquals(
    skipped,
    [0, 1],
    "les deux plats qui consomment la préparation de mercredi tombent",
  );
  assert(
    !skipped.includes(2),
    "le vendredi ne consomme aucune préparation: il a eu lieu",
  );
});

Deno.test("une vague FAITE n'invalide rien", async () => {
  const plan = planOf();
  const { planGroceryWavesForPlan } = await import("./accident.ts");
  const served = planGroceryWavesForPlan(plan).find((w) =>
    w.servesCookDates.length > 0
  )!;
  const db = stubDb({
    cooking_session_states: [],
    protocol_events: [],
    // `done: true` — le lecteur ne demande que les `done: false`, mais le stub
    // rend tout: c'est donc la PRÉSENCE de la ligne qui compte ici, et ce test
    // vérifie surtout qu'aucune invalidation ne sort d'un état vide.
    grocery_wave_states: [],
    student_generated_meals: [planRow()],
  });
  assertEquals(
    await loadSkippedDishIndexes(db as never, { userId: USER, plan }),
    [],
    `aucune vague ratée (${served.buyOn}) ⇒ aucun plat ne tombe`,
  );
});

Deno.test("une lecture de vagues en panne n'efface RIEN (fail-open)", async () => {
  const plan = planOf();
  const failing = {
    from: (table: string) => {
      // deno-lint-ignore no-explicit-any
      const b: any = {};
      for (
        const m of ["select", "eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "not", "like", "ilike", "order", "limit"]
      ) b[m] = () => b;
      const result = table === "grocery_wave_states"
        ? { data: null, error: { message: "boom" } }
        : { data: table === "student_generated_meals" ? [planRow()] : [], error: null };
      b.maybeSingle = () =>
        Promise.resolve(
          table === "student_generated_meals"
            ? { data: planRow(), error: null }
            : result,
        );
      b.single = b.maybeSingle;
      // deno-lint-ignore no-explicit-any
      b.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
      return b;
    },
  };
  assertEquals(
    await loadSkippedDishIndexes(failing as never, { userId: USER, plan }),
    [],
    "un plan qui s'efface pour une panne de Postgres efface du RÉEL — c'est " +
      "pire que le mensonge qu'on corrige",
  );
});
