// Lecture hors ligne des deux tirs : fonctions de production, aucun appel modèle.
//
// ⛔ CE FICHIER EST UNE PREUVE FIGÉE — ON NE LE CORRIGE PAS, ON LE CONSERVE.
// Lot 0 du chantier « Fiabiliser les portions et préserver les recettes »
// (2026-09-11) : son rejeu a été relancé et rend `resultats.json` à l'octet
// près. C'est cette reproduction qui atteste la preuve de départ (14 cases,
// 12 portions calculées, 11 énergies mesurables, dimanches à 2 455,69 et
// 2 916,14 kcal, contrefactuel petit-suisse à 546 kcal, huit alertes d'achats
// nominatives). Le modifier retirerait le seul témoin de l'ancien état.
//
// ⚠️ CE QU'IL NE FAIT PAS, ET QUI VIT AILLEURS DÉSORMAIS. Il ne publie aucun
// dénominateur, ne sépare pas les états de référence, ne reconstruit pas le
// contrat de densité et ne compare rien à une cible. L'instrument complet est
// `scripts/2026-09-11-mesure-grille.ts`, sur les fixtures figées de
// `scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures/`.
import { loadCompositionIndex } from '../../supabase/functions/_shared/keel/food_composition_io.ts';
import { indexForReading } from '../../supabase/functions/_shared/keel/composition_fill_io.ts';
import { readIngredients, readEnergyBoxDishes, readPreparations } from '../../supabase/functions/_shared/keel/plan_energy_read.ts';
import { boxEnergies } from '../../supabase/functions/_shared/keel/mouth_energy.ts';
import { finalPlanGate, asGatePlan, FINAL_GATE_POLICY_LOT_1 } from '../../supabase/functions/_shared/keel/final_plan_gate.ts';
import { CLEAN_HOUSEHOLD_CONTEXT } from '../../supabase/functions/_shared/keel/final_plan_gate_fixtures.ts';

const data = JSON.parse(await Deno.readTextFile(Deno.args[0]));
const tables = JSON.parse(await Deno.readTextFile(Deno.args[1]));
const db = {from: (table: string) => ({ select: () => ({
  range: async (a: number, b: number) => ({data: (tables[table] ?? []).slice(a, b+1), error: null}),
  in: async (field: string, wanted: string[]) => ({data: (tables[table] ?? []).filter((r: any) => wanted.includes(r[field])), error: null}),
}) })};
const baseIndex = await loadCompositionIndex(db as never);
const result = [];
for (const p of data.plans) {
  const inputs = [...p.dishes, ...p.preparations].flatMap((u: any) => readIngredients(u.ingredients));
  const read = await indexForReading({db: db as never, baseIndex, inputs});
  const all = boxEnergies({index: read.index, dishes: readEnergyBoxDishes(p.dishes), preparations: readPreparations(p.preparations)});
  const boxes = p.dishes.map((d: any) => ({day: d.day, slot: d.slot, title: d.title,
    measured: all.find(b => b.boxId === d.boxes?.[0]?.id) ?? null}));
  // Contrefactuel identifié : mêmes quantités, seul le petit-suisse est relié
  // à l'identifiant déjà demandé et rendu par le modèle. Pas un nouveau plan.
  const corrected = structuredClone(p);
  for (const d of corrected.dishes) {
    for (const i of d.ingredients) {
      if (i.ref !== 'petit_suisse_cream_cheese') continue;
      const term = i.term;
      i.term = i.ref;
      for (const b of d.boxes ?? []) for (const item of b.items) {
        if (!item.preparation_id && item.term === term) item.term = i.ref;
      }
    }
  }
  const counterfactual = boxEnergies({index: read.index, dishes: readEnergyBoxDishes(corrected.dishes), preparations: readPreparations(corrected.preparations)})
    .filter(b => b.day === 'sat' && b.slot === 'breakfast');
  // Le contexte de grille ne sert pas à prouver sa couverture ici : on ne retient
  // que les alertes de courses, indépendantes de cette grille.
  const gate = finalPlanGate(asGatePlan(p), {...CLEAN_HOUSEHOLD_CONTEXT,
    startsOn: '2026-09-11', windowDays: ['fri','sat','sun'], mouths: [],
    pantryTerms: [], energy: null, boxContract: null, policy: FINAL_GATE_POLICY_LOT_1});
  result.push({id: p.id, indexAsked: read.asked, indexKept: read.kept, boxes, counterfactualPetitSuisse: counterfactual,
    shoppingRefusals: gate.refusals.filter(r => ['ingredient_not_bought','unclassified_perishable'].includes(r.cause))});
}
console.log(JSON.stringify(result, null, 2));
