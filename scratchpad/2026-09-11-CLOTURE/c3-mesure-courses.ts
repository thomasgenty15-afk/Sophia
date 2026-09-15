/**
 * ══════════════════════════════════════════════════════════════════════════
 * ÉTAPE C3 — COMBIEN DE LIGNES DE COURSES ÉTAIENT PERDUES, FAUSSEMENT
 *            SIGNALÉES, OU RÉELLEMENT MANQUANTES. AVANT, ET APRÈS.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ UN SEUL RUN, DEUX LECTURES. Le contrefactuel est calculé DANS le même
 * passage, sur les MÊMES plans : « journaliser le contrefactuel, pas deux
 * runs ». Aucun appel modèle, aucune génération, aucune écriture.
 *
 * ── CE QUE CHAQUE COLONNE VEUT DIRE, ET ELLES NE SE FONDENT JAMAIS ───────
 * · PERDUES              — lignes que la décision de conservation SUPPRIME.
 *                          C'est le défaut de C3 : quelqu'un part au magasin
 *                          sans ce qu'il lui faut.
 * · FAUSSEMENT SIGNALÉES — `ingredient_not_bought` sur un aliment qui EST sur
 *                          la liste (pluriel) ou qui ne s'achète pas (eau).
 * · RÉELLEMENT MANQUANTES— `ingredient_not_bought` qui reste après identité et
 *                          après la classe « non achetable ». Ce sont de VRAIS
 *                          oublis du modèle, et C3 ne les répare pas : il les
 *                          rend lisibles.
 *
 * Usage :
 *   deno run --allow-read scratchpad/2026-09-11-CLOTURE/c3-mesure-courses.ts
 */
import {
  chargerFixtures,
  troisIndex,
} from "../../scripts/2026-09-11-mesure-grille.ts";
import type { CompositionIndex } from "../../supabase/functions/_shared/keel/food_composition.ts";
import { normalizePantryTerm } from "../../supabase/functions/_shared/keel/meal_generation.ts";
import {
  claimedIdentities,
  foodIdentityOf,
  isNonPurchasableIdentity,
  sortShoppingLines,
} from "../../supabase/functions/_shared/keel/shopping_identity.ts";
import { shoppingIdentityAudit } from "../../supabase/functions/_shared/keel/final_plan_audit.ts";

const FIXTURES = "scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures";
const C0 = "scratchpad/2026-09-11-CLOTURE/fixtures";

type Rec = Record<string, unknown>;
const arr = (v: unknown): Rec[] => (Array.isArray(v) ? v as Rec[] : []);

/** Les unités d'un plan : plats ET casseroles. */
function unites(plan: Rec): { ingredients: Rec[] }[] {
  return [...arr(plan.dishes), ...arr(plan.preparations)].map((u) => ({
    ingredients: arr(u.ingredients),
  }));
}

/**
 * L'ANCIENNE RÈGLE, RECOPIÉE — le corps EXACT du filtre retiré de
 * `retry_merge.ts` : `claimedAll.has(normalizePantryTerm(l.term))`, où
 * `claimedAll` sont les TERMES des ingrédients du plan. Une ligne qui n'y est
 * pas était SUPPRIMÉE, sans que personne puisse la nommer.
 */
function perduesParLancienFiltre(plan: Rec): string[] {
  const claimed = new Set<string>();
  for (const u of unites(plan)) {
    for (const i of u.ingredients) claimed.add(normalizePantryTerm(String(i.term ?? "")));
  }
  return arr(plan.shopping_list)
    .filter((l) => !claimed.has(normalizePantryTerm(String(l.term ?? ""))))
    .map((l) => String(l.term ?? ""));
}

/**
 * LA NOUVELLE RÈGLE. Trois sorts, par identité : réclamée ⇒ reste ; retirée
 * ⇒ part ; orpheline ⇒ RESTE et se compte. Sur un plan FINAL, rien n'a été
 * retiré (`removed` vide) : la colonne « perdues » doit donc valoir zéro.
 */
function perduesParLaNouvelleRegle(index: CompositionIndex, plan: Rec): {
  perdues: string[];
  orphelines: string[];
} {
  const claimed = claimedIdentities(
    index,
    unites(plan).map((u) => ({
      ingredients: u.ingredients.map((i) => ({
        term: String(i.term ?? ""),
        ref: typeof i.ref === "string" ? i.ref : null,
        refRefused: i.ref_refused === true,
      })),
    })),
  );
  const out = sortShoppingLines({
    index,
    lines: arr(plan.shopping_list).map((l) => ({
      term: String(l.term ?? ""),
      ref: typeof l.ref === "string" ? l.ref : null,
      refRefused: l.ref_refused === true,
    })),
    claimed,
    removed: new Set<string>(),
  });
  return {
    perdues: out.dropped.map((l) => l.term),
    orphelines: out.kept.filter((l) => !claimed.has(foodIdentityOf(index, l).identity)).map((l) =>
      l.term
    ),
  };
}

/** Les alertes d'achat, avant et après la classe « non achetable ». */
function alertes(index: CompositionIndex, plan: Rec): {
  avant: string[];
  eau: string[];
  reelles: string[];
  quantifiees: number;
  incomplets: number;
} {
  const audit = shoppingIdentityAudit({
    index,
    plan: plan as never,
    pantryTerms: [],
  });
  const manques = audit.rows.filter((r) => r.state === "not_bought");
  const eau = audit.rows.filter((r) => r.state === "not_purchasable");
  return {
    // ⚠️ « AVANT » = ce que la même mesure rendait quand l'eau n'avait pas sa
    // classe : elle tombait alors dans `not_bought`.
    avant: [...manques, ...eau].map((r) => r.displayTerm).sort(),
    eau: eau.map((r) => r.displayTerm),
    reelles: manques.map((r) => r.displayTerm).sort(),
    quantifiees: audit.quantified,
    incomplets: audit.unverified,
  };
}

const fx = await chargerFixtures(FIXTURES);
// ⚠️ UN SEUL RÉFÉRENTIEL POUR TOUS LES PLANS, ET C'EST DIT. C'est celui figé
// par le lot 0 (empreinte vérifiée à la lecture). Les six tirs du soir ont
// tourné sur le référentiel de la base au même moment ; un écart de curation
// entre les deux se verrait en `term:` supplémentaires, pas en achats perdus.
const { historique: INDEX } = await troisIndex(fx, fx.plans[0] as Rec);

const plans: { nom: string; plan: Rec }[] = [];
for (const p of fx.plans) {
  plans.push({ nom: `archive ${String((p as Rec).id ?? "").slice(0, 8)}`, plan: p as Rec });
}
for (const n of [1, 2, 3, 4, 5, 6]) {
  const j = JSON.parse(await Deno.readTextFile(`${C0}/c0-tir${n}.json`)) as Rec;
  plans.push({ nom: `tir ${n} (${String(j.cas)})`, plan: j.ligne_ecrite as Rec });
}
{
  const j = JSON.parse(await Deno.readTextFile(`${C0}/c0-apresmidi.json`)) as Rec;
  plans.push({ nom: "banc après-midi", plan: j.ligne_ecrite as Rec });
}

console.log("═".repeat(78));
console.log("C3 — LES COURSES, AVANT ET APRÈS. Un seul passage, deux lectures.");
console.log("═".repeat(78));
console.log(
  "\n" +
    "plan".padEnd(24) + "lignes".padStart(7) +
    "  perdues AV/AP" +
    "  faux AV/AP" +
    "  manques réels" +
    "  quantifiées",
);
console.log("─".repeat(78));

let totalLignes = 0, totalPerduesAvant = 0, totalPerduesApres = 0;
let totalFauxAvant = 0, totalFauxApres = 0, totalReels = 0;
let totalQuantifiees = 0, totalIdentites = 0, totalIncomplets = 0;

for (const { nom, plan } of plans) {
  const lignes = arr(plan.shopping_list).length;
  const avant = perduesParLancienFiltre(plan);
  const apres = perduesParLaNouvelleRegle(INDEX, plan);
  const a = alertes(INDEX, plan);
  const audit = shoppingIdentityAudit({ index: INDEX, plan: plan as never, pantryTerms: [] });
  totalLignes += lignes;
  totalPerduesAvant += avant.length;
  totalPerduesApres += apres.perdues.length;
  totalFauxAvant += a.eau.length;
  totalFauxApres += 0;
  totalReels += a.reelles.length;
  totalQuantifiees += a.quantifiees;
  totalIdentites += audit.identities;
  totalIncomplets += a.incomplets;
  console.log(
    nom.padEnd(24) + String(lignes).padStart(7) +
      `${String(avant.length).padStart(9)} / ${apres.perdues.length}` +
      `${String(a.eau.length).padStart(9)} / 0` +
      `${String(a.reelles.length).padStart(13)}` +
      `${String(a.quantifiees).padStart(13)} / ${audit.identities}`,
  );
  if (avant.length > 0) {
    console.log(`      ⛔ l'ancien filtre jetait : ${avant.join(", ")}`);
  }
  if (a.eau.length > 0) {
    console.log(`      ⚠️ non achetable (plus signalé) : ${a.eau.join(", ")}`);
  }
  if (a.reelles.length > 0) {
    console.log(`      ❌ vrais oublis du modèle, toujours signalés : ${a.reelles.join(", ")}`);
  }
  if (apres.orphelines.length > 0) {
    console.log(
      `      ⚪ rattachées à rien, GARDÉES et comptées : ${apres.orphelines.join(", ")}`,
    );
  }
}

console.log("─".repeat(78));
console.log(
  "TOTAL".padEnd(24) + String(totalLignes).padStart(7) +
    `${String(totalPerduesAvant).padStart(9)} / ${totalPerduesApres}` +
    `${String(totalFauxAvant).padStart(9)} / ${totalFauxApres}` +
    `${String(totalReels).padStart(13)}` +
    `${String(totalQuantifiees).padStart(13)} / ${totalIdentites}`,
);
console.log(`\ncontrôles incomplets (défaut RESTANT, nommé) : ${totalIncomplets}`);
console.log(
  "\n⛔ CE QUE CES NOMBRES NE DISENT PAS : ils portent sur les plans ÉCRITS.\n" +
    "   Les lignes que l'ancien filtre jetait pendant une RÉPARATION ne sont pas\n" +
    "   dans la base : elles avaient déjà disparu. La colonne « perdues AV » est\n" +
    "   donc le contrefactuel du filtre rejoué sur le plan final — le même corps,\n" +
    "   les mêmes entrées. Le cas de la réparation est mesuré par le banc de\n" +
    "   `shopping_c3_test.ts`, qui fait passer un plan par le vrai `spliceReworkableUnits`.",
);
console.log(
  "\n⛔ ET ILS NE DISENT RIEN DU GOÛT : aucune recette n'a été cuisinée.",
);
// ⚠️ ON LES CHERCHE DANS LES RECETTES, PAS SUR LA LISTE. L'eau est un
// INGRÉDIENT que le modèle écrit dans une casserole; ce qui arrivait, c'est que
// l'audit réclamait de l'acheter. Une ligne de courses « eau » n'existe sur
// aucun de ces plans, et c'est le cas normal.
const nonAchetables = [...new Set(
  plans.flatMap(({ plan }) =>
    unites(plan).flatMap((u) =>
      u.ingredients
        .map((i) =>
          foodIdentityOf(INDEX, {
            term: String(i.term ?? ""),
            ref: typeof i.ref === "string" ? i.ref : null,
          }).identity
        )
        .filter(isNonPurchasableIdentity)
    )
  ),
)];
console.log(
  `\nidentités non achetables rencontrées dans les recettes : ${
    nonAchetables.join(", ") || "aucune"
  }`,
);
