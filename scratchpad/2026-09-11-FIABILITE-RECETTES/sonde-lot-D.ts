/**
 * ══════════════════════════════════════════════════════════════════════════
 * SONDE DU LOT D — LE COÛT DE LA POLITIQUE, MESURÉ SUR LES DEUX PLANS FIGÉS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LA QUESTION EST CELLE DU PLAN, MOT POUR MOT: « Rejouer les cinq
 * corrections de densité archivées et décrire lesquelles restent autorisées. Il
 * n'est PAS exigé que les cinq ferment sous la nouvelle politique. »
 *
 * ⛔ AUCUN APPEL MODÈLE, AUCUNE ÉCRITURE, AUCUNE HORLOGE DE DÉCISION. Elle lit
 * les deux plans figés du lot 0, en prend une COPIE PROFONDE, et compte ce que
 * l'ajusteur a le DROIT de toucher sous deux politiques, dans le même run:
 *
 *   ① `EVERY_LINE_ITS_OWN_FREE_BODY` — l'état d'AVANT le lot D, nommé. Une
 *      ligne, une variable libre. C'est l'état que la revue du 2026-09-11 §5 a
 *      mesuré en train de réécrire quatre recettes.
 *   ② la politique du lot D — la structure culinaire déclarée par le modèle,
 *      validée par le moteur, et conservatrice au premier défaut.
 *
 * ⚠️ CE QU'ELLE NE PEUT PAS FAIRE, ET IL FAUT LE LIRE AVANT LES CHIFFRES. Les
 * deux plans figés sont ANTÉRIEURS au contrat: aucun ne porte `components` ni
 * `part`. La mesure ② est donc celle d'une population qui n'a pas encore vu la
 * consigne — pas celle du moteur corrigé sur un plan neuf. Un plan neuf demande
 * un tir réel, que ce lot n'a pas le droit de faire.
 *
 * ⚠️ ET ELLE NE DIT RIEN DU GOÛT. Aucune de ces lignes n'a été cuisinée.
 *
 *     deno run --allow-read scratchpad/2026-09-11-FIABILITE-RECETTES/sonde-lot-D.ts
 */
import { chargerFixtures, troisIndex, entreesDeRelecture } from "../../scripts/2026-09-11-mesure-grille.ts";
import {
  type AdjustablePlanDish,
  type AdjustablePlanPreparation,
  unitsOfPlan,
} from "../../supabase/functions/_shared/keel/plan_proportion_units.ts";
import { EVERY_LINE_ITS_OWN_FREE_BODY } from "../../supabase/functions/_shared/keel/culinary_structure.ts";

// ⚠️ `decodeURIComponent`: le dépôt vit dans « Sophia 2 », et `.pathname` rend
// l'espace en `%20`, que `Deno.readTextFile` ne décode pas.
const RACINE = decodeURIComponent(new URL("./fixtures", import.meta.url).pathname);

const fx = await chargerFixtures(RACINE);
const L: string[] = [];
const p = (s = "") => L.push(s);

p("╔══════════════════════════════════════════════════════════════════════════╗");
p("║ SONDE LOT D — ce que l'ajusteur a le DROIT de toucher, avant et après    ║");
p("╚══════════════════════════════════════════════════════════════════════════╝");
p();

let libresAvant = 0;
let libresApres = 0;
let lignesTotal = 0;

for (const plan of fx.plans) {
  const nom = String(plan.id).slice(0, 8);
  const copie = JSON.parse(JSON.stringify(plan)) as Record<string, unknown>;
  const dishes = (copie.dishes ?? []) as AdjustablePlanDish[];
  const preparations = (copie.preparations ?? []) as AdjustablePlanPreparation[];
  const idx = await troisIndex(fx, entreesDeRelecture(copie), String(plan.content_locale ?? "fr"));
  const index = idx.relecture.index;

  const built = unitsOfPlan({ index, dishes, preparations, baselineOf: () => null });

  // ── ① L'ÉTAT D'AVANT, NOMMÉ ────────────────────────────────────────────
  let avant = 0;
  for (const u of built.units) {
    const bodies = EVERY_LINE_ITS_OWN_FREE_BODY(
      u.unitId,
      u.ingredients.map((i) => i.ingredientId),
    );
    avant += bodies.filter((b) => b.movable).length;
  }
  // ── ② LA POLITIQUE DU LOT D ────────────────────────────────────────────
  const apres = built.units.reduce(
    (n, u) => n + u.bodies.filter((b) => b.movable).reduce((m, b) => m + b.lineIds.length, 0),
    0,
  );

  libresAvant += avant;
  libresApres += apres;
  lignesTotal += built.counts.lines;

  p(`── plan ${nom} · ${plan.content_locale} ─────────────────────────────────`);
  p(`   unités                                   ${built.counts.units}`);
  p(`   lignes                                   ${built.counts.lines}`);
  p(`   lignes dans un corps MOBILE — avant      ${avant}`);
  p(`   lignes dans un corps MOBILE — après      ${apres}`);
  p(`   blocs dont le contrat est ACCEPTÉ        ${built.counts.structure.units_contracted}`);
  p(`   blocs retombés sur le conservateur       ${built.counts.units - built.counts.structure.units_contracted}`);
  for (const [motif, n] of Object.entries(built.counts.structure.units_conservative)) {
    if (n > 0) p(`     · ${motif.padEnd(24)} ${n}`);
  }
  p(`   rétrogradations « dense »                ${built.counts.structure.demoted_dense_seasoning}`);
  p();
}

p("══ VERDICT ════════════════════════════════════════════════════════════════");
p();
p(`   lignes du plan                                   ${lignesTotal}`);
p(`   lignes ajustables sous l'ANCIENNE politique      ${libresAvant}`);
p(`   lignes ajustables sous la NOUVELLE               ${libresApres}`);
p();
p("   ⛔ LES CINQ CORRECTIONS DE DENSITÉ ARCHIVÉES");
p("   Les deux plans figés sont ANTÉRIEURS au contrat: aucun bloc ne déclare");
p("   de `components`, aucune ligne ne porte de `part`. Chaque bloc retombe");
p("   donc sur `contract_absent`, et l'ajusteur n'a AUCUNE ligne à déplacer.");
p(`   Sous la nouvelle politique, ces recettes-là ferment **0 des 5** défauts`);
p("   de densité que la campagne du 2026-09-11 leur avait fermés. Les cinq");
p("   partent en recomposition — ou restent non conformes et le DISENT.");
p();
p("   ⚠️ CE CHIFFRE MESURE UNE POPULATION SANS CONTRAT, PAS UN MOTEUR CASSÉ.");
p("   Un plan neuf reçoit la consigne `== SAY WHAT HOLDS THE RECIPE TOGETHER ==`");
p("   et le schéma qui va avec; ce que le modèle en fera n'est pas mesurable");
p("   sans un tir réel, que ce lot n'a pas le droit de faire.");
p();
p("   ⚠️ ET AUCUN DE CES NOMBRES NE DIT QUOI QUE CE SOIT DU GOÛT.");

console.log(L.join("\n"));
