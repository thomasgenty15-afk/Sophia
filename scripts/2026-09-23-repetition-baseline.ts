/**
 * LE TAUX DE RÉPÉTITION D'UN PLAN À L'AUTRE — mesuré sur les plans déjà en
 * base, SANS appel au modèle. Lecture seule.
 *
 * Pour chaque plan de foyer qui a au moins un plan AVANT lui (ordre de
 * génération, `created_at`), on calcule la liste « à éviter » qu'il aurait
 * reçue (`avoidListFrom`, sur les deux plans d'avant), puis ce qui en est
 * revenu dans ce plan (`avoidedCameBack`). Ce sont les MÊMES fonctions que le
 * compteur de la lane: le chiffre d'avant et le chiffre d'après se lisent avec
 * le même instrument.
 *
 * ⚠️ LES PLANS REMPLACÉS SONT COMPTÉS (`retired_at` ignoré). Ils n'ont pas été
 * mangés, mais ils ont été ÉCRITS par le modèle à la suite des autres: c'est la
 * tendance du modèle à reprendre les mêmes aliments qu'on mesure ici.
 *
 * ⚠️ CES PLANS VIENNENT SURTOUT DES COMPTES DE TEST.
 *
 * Usage:
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=… \
 *     deno run --allow-net --allow-env --allow-read scripts/2026-09-23-repetition-baseline.ts
 */
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { loadCompositionIndex } from "../supabase/functions/_shared/keel/food_composition_io.ts";
import {
  avoidedCameBack,
  avoidListFrom,
  type AvoidPlan,
  readAvoidPlan,
} from "../supabase/functions/_shared/keel/plan_avoid_list.ts";

const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.");
  Deno.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });
const index = await loadCompositionIndex(admin, { lang: "fr" });

interface Row {
  id: string;
  user_id: string;
  household_id: string;
  starts_on: string;
  ends_on: string;
  retired_at: string | null;
  created_at: string;
  dishes: unknown;
  preparations: unknown;
}

const rows: Row[] = [];
for (let from = 0;; from += 200) {
  const { data, error } = await admin
    .from("student_generated_meals")
    .select("id, user_id, household_id, starts_on, ends_on, retired_at, created_at, dishes, preparations")
    .eq("plan_kind", "household")
    .order("created_at", { ascending: true })
    .range(from, from + 199);
  if (error) throw error;
  rows.push(...(data as Row[]));
  if ((data ?? []).length < 200) break;
}

const byHousehold = new Map<string, Row[]>();
for (const r of rows) {
  const list = byHousehold.get(r.household_id) ?? [];
  list.push(r);
  byHousehold.set(r.household_id, list);
}

let evaluated = 0;
let withList = 0;
let given = 0;
let cameBack = 0;
let mainDishes = 0;
let dishesWithAvoided = 0;
const backByFamily = new Map<string, number>();
const givenByFamily = new Map<string, number>();

for (const plans of byHousehold.values()) {
  const read: AvoidPlan[] = plans.map((p) => readAvoidPlan(p.dishes, p.preparations));
  for (let i = 1; i < plans.length; i++) {
    evaluated += 1;
    // Du plus récent au plus ancien, comme la lane.
    const previous = [read[i - 1], ...(i >= 2 ? [read[i - 2]] : [])];
    const { list } = avoidListFrom({ previousPlans: previous, index });
    const out = avoidedCameBack({ plan: read[i], index, list });
    if (out.given === 0) continue;
    withList += 1;
    given += out.given;
    cameBack += out.came_back.length;
    mainDishes += out.main_dishes;
    dishesWithAvoided += out.dishes_with_avoided;
    for (const f of [...list.proteins, ...list.starches]) {
      givenByFamily.set(f, (givenByFamily.get(f) ?? 0) + 1);
    }
    for (const f of out.came_back) backByFamily.set(f, (backByFamily.get(f) ?? 0) + 1);
  }
}

const pct = (a: number, b: number) => (b === 0 ? "—" : `${Math.round((a / b) * 1000) / 10} %`);
console.log(`plans de foyer lus:            ${rows.length} (${byHousehold.size} foyers)`);
console.log(`plans avec au moins 1 d'avant: ${evaluated}`);
console.log(`… dont liste non vide:         ${withList}`);
console.log(`aliments listés:               ${given}`);
console.log(`… revenus dans le plan suivant: ${cameBack}  (${pct(cameBack, given)})`);
console.log(`plats principaux:              ${mainDishes}`);
console.log(`… portant un aliment listé:    ${dishesWithAvoided}  (${pct(dishesWithAvoided, mainDishes)})`);
console.log("");
console.log("famille · listée · revenue");
for (const [f, n] of [...givenByFamily.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${f.padEnd(16)} ${String(n).padStart(4)}  ${String(backByFamily.get(f) ?? 0).padStart(4)}`);
}

// Les foyers utilisables pour le run réel: au moins 2 plans NON remplacés.
console.log("");
console.log("foyers avec ≥ 2 plans vivants (candidats au run réel):");
for (const [hh, plans] of byHousehold) {
  const live = plans.filter((p) => p.retired_at === null);
  if (live.length < 2) continue;
  const lastEnd = live.map((p) => p.ends_on).sort().at(-1);
  console.log(`  ${hh}  maître ${live[0].user_id}  ${live.length} plans  dernier jour ${lastEnd}`);
}
