// SONDE DE LECTURE — pourquoi la journée de mercredi vaut moins que la cible.
// Aucun appel modèle, aucune écriture: on rejoue `planEnergy` (le module de
// PRODUCTION) sur le plan déjà en base, avec le référentiel déjà en base.
import { loadCompositionIndex } from "../supabase/functions/_shared/keel/food_composition_io.ts";
import {
  readDishes,
  readPreparations,
} from "../supabase/functions/_shared/keel/plan_energy_read.ts";
import { planEnergy } from "../supabase/functions/_shared/keel/plan_energy.ts";

const S = Deno.args[0];
const refs = JSON.parse(await Deno.readTextFile(`${S}/refs.json`));
const aliases = JSON.parse(await Deno.readTextFile(`${S}/aliases.json`));
const plan = JSON.parse(await Deno.readTextFile(`${S}/plan.json`));

// Un client de lecture qui sert deux tableaux déjà chargés.
const db = {
  from(table: string) {
    const rows = table === "food_composition_refs" ? refs : aliases;
    return {
      select() {
        return {
          range(from: number, to: number) {
            return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
          },
        };
      },
    };
  },
} as never;

const index = await loadCompositionIndex(db);
const dishes = readDishes(plan.dishes);
const preparations = readPreparations(plan.preparations);

const energy = planEnergy({
  index,
  dishes,
  preparations,
  servings: 1,
  addons: [],
  mealsOutByDay: new Map(),
});

console.log("jours:", energy.days.length);
for (const d of energy.days) {
  console.log(
    `${d.day}\t${d.kcal}\tcomplet=${d.complete}\tplats ${d.dishesCounted}/${d.dishesTotal}\t${
      JSON.stringify(d.gaps ?? [])
    }`,
  );
}
console.log("\n— TOUS LES PLATS —");
const wed = plan.dishes as Record<string, unknown>[];
for (const raw of wed) {
  const one = planEnergy({
    index,
    dishes: readDishes([raw]),
    preparations,
    servings: 1,
    addons: [],
    mealsOutByDay: new Map(),
  });
  const day = one.days[0];
  console.log(
    `${String(raw.day)} ${String(raw.slot).padEnd(10)} ${String(day?.kcal).padStart(5)} kcal  ` +
      `complet=${day?.complete} ${JSON.stringify(day?.gaps ?? [])}  « ${raw.title} »`,
  );
}
