// ═══════════════════════════════════════════════════════════════════════════
// L30b — LE BUDGET DEVIENT UN CONSTAT · la mesure
// ═══════════════════════════════════════════════════════════════════════════
//
// Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L30b`.
// Directions écrites AVANT: `scratchpad/2026-08-22-L30b-DIRECTIONS-avant-mesure.txt`.
//
// ── ⛔ CE QUE CE SCRIPT NE FAIT PAS ────────────────────────────────────────
// Aucune écriture en base, aucun appel de modèle. Il LIT le référentiel, la
// grille du sas et le corpus de plans, et il compte.
//
// ── ⛔ LES DEUX DÉNOMINATEURS, TOUJOURS, ET LA POPULATION EXCLUE NOMMÉE ────
// Le prompt VIVANT est `meal.en.v18_one_box_per_group` (solo) et
// `…+household.v21_one_box_per_group` (foyer). 180 des 193 plans du corpus
// sont HORS de cette population — mesurer sur le corpus entier fait passer un
// millésime mort pour le produit d'aujourd'hui, et mesurer sur le seul prompt
// vivant fait passer 13 plans pour un corpus. Les deux sortent, côte à côte,
// à chaque compteur.
//
// ⚠️ AMENDEMENT MESURÉ (§⑨ n° 50): sur le dénominateur restreint, les seuils
// d'un lot peuvent être ATTEINTS AVANT le lot. C'est pourquoi ce script se
// lance DEUX FOIS — avant et après la promotion — et que le DELTA est calculé
// dans le MÊME processus par la même fonction (§⑨ n° 55). La grille du sas
// donne la colonne « le sas dirait », le référentiel donne « ce que le
// produit lit vraiment ».
//
// ── LE SEUIL DE LA FICHE ───────────────────────────────────────────────────
// Le coût d'un plan chiffrable, ramené à 1 000 kcal, doit tomber dans
// **[1,50 ; 4,00] €/1 000 kcal**. Hors bande, c'est la GRILLE qui est fausse,
// pas le plan.

import {
  type CompositionIndex,
  type CompositionInput,
} from "../supabase/functions/_shared/keel/food_composition.ts";
import { loadCompositionIndex } from "../supabase/functions/_shared/keel/food_composition_io.ts";
import { foldPreparationsIntoDishes } from "../supabase/functions/_shared/keel/meal_verdict.ts";
import { dishEnergy } from "../supabase/functions/_shared/keel/plan_energy.ts";
import {
  buildPriceIndex,
  type CeilingVerdict,
  ceilingVerdict,
  costOfIngredients,
  type CostMarket,
  costPerThousandKcal,
  type PriceIndex,
} from "../supabase/functions/_shared/keel/meal_cost.ts";
import {
  fileClient,
  readDishes,
  readPreparations,
} from "./keel_v0e_resolveur_20260821.ts";

const dir = Deno.args[0] ?? ".";

/** Le seuil de la fiche, en €/1 000 kcal. */
export const BANDE_BASSE = 1.5;
export const BANDE_HAUTE = 4.0;

/** Le prompt VIVANT, et rien d'autre. */
const PROMPTS_VIVANTS = new Set([
  "meal.en.v18_one_box_per_group",
  "meal.en.v18_one_box_per_group+household.v21_one_box_per_group",
]);

function readNdjson(file: string): Record<string, unknown>[] {
  const raw = Deno.readTextFileSync(`${dir}/${file}`);
  const out: Record<string, unknown>[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    out.push(JSON.parse(t) as Record<string, unknown>);
  }
  return out;
}

// ---------------------------------------------------------------------------
// LES DEUX GRILLES — celle que le produit LIT, et celle que le sas PROPOSE
// ---------------------------------------------------------------------------

/**
 * ⛔ « CE QUE LE PRODUIT LIT » EST `food_composition_refs`, PAS LE SAS.
 * Le sas est une proposition; tant qu'elle n'est pas promue, aucun lecteur
 * n'en voit rien. Les confondre ferait annoncer une couverture de 917 lignes
 * là où le référentiel en porte zéro — exactement le genre de chiffre qui a
 * l'air d'un résultat.
 */
function grilleDuReferentiel(market: CostMarket): PriceIndex {
  const col = market === "fr" ? "fr" : "us";
  const rows = readNdjson("food_prices_refs.ndjson").map((r) => ({
    slug: String(r.slug ?? ""),
    price: r[`price_${col}`] === null || r[`price_${col}`] === undefined
      ? null
      : Number(r[`price_${col}`]),
    source: r[`source_${col}`] === null ? null : String(r[`source_${col}`] ?? ""),
    observedOn: r[`observed_${col}`] === null
      ? null
      : String(r[`observed_${col}`] ?? ""),
  }));
  return buildPriceIndex(market, rows);
}

/** La grille du SAS, telle qu'elle serait si tout passait. Comparaison seule. */
function grilleDuSas(market: CostMarket): PriceIndex {
  const col = market === "fr" ? "fr" : "us";
  const rows = readNdjson("food_prices_pending.ndjson").map((r) => ({
    slug: String(r.slug ?? ""),
    price: r[`price_${col}`] === null || r[`price_${col}`] === undefined
      ? null
      : Number(r[`price_${col}`]),
    source: r[`source_${col}`] === null ? null : String(r[`source_${col}`] ?? ""),
    observedOn: String(r.observed_on ?? ""),
  }));
  return buildPriceIndex(market, rows);
}

// ---------------------------------------------------------------------------
// LE COMPTE — une seule fonction, appelée sur les deux dénominateurs
// ---------------------------------------------------------------------------

interface Compte {
  plans: number;
  plansComplets: number;
  plats: number;
  platsChiffres: number;
  lignes: number;
  lignesChiffrees: number;
  lignesInconnues: number;
  motifNonResolu: number;
  motifNonPese: number;
  motifSansPrix: number;
  /** Les €/1 000 kcal des plans COMPLETS des deux côtés (coût ET énergie). */
  ratios: number[];
  /** Le coût des plans complets, pour la lecture. */
  montants: number[];
  sansPrixTop: Map<string, number>;
  /**
   * ⛔ LA PROMESSE, ET CE QU'ON PEUT EN DIRE. Les plans dont la raison
   * ARCHIVÉE nomme un plafond, ventilés par `ceilingVerdict`. Les trois
   * cases sortent TOUJOURS ensemble: `notProven` seul se lirait comme
   * « dans le budget », c'est-à-dire comme la promesse qu'on retire.
   */
  plafondAnnonce: number;
  plafondOverCeiling: number;
  plafondNotProven: number;
  plafondUnknown: number;
}

function compteVide(): Compte {
  return {
    plans: 0,
    plansComplets: 0,
    plats: 0,
    platsChiffres: 0,
    lignes: 0,
    lignesChiffrees: 0,
    lignesInconnues: 0,
    motifNonResolu: 0,
    motifNonPese: 0,
    motifSansPrix: 0,
    ratios: [],
    montants: [],
    sansPrixTop: new Map(),
    plafondAnnonce: 0,
    plafondOverCeiling: 0,
    plafondNotProven: 0,
    plafondUnknown: 0,
  };
}

/**
 * LE PLAFOND TEL QU'IL A ÉTÉ ANNONCÉ AVEC LE PLAN, relu dans la raison
 * archivée. `null` = aucune promesse n'a été faite sur ce plan.
 *
 * ⚠️ L'ARCHIVE NE PORTE PAS LA DEVISE. `plan_rationale.ts` écrit « The
 * shopping budget is 152. » — un nombre nu, parce que le montant est saisi
 * « in your currency » et que rien ne l'accompagne. Le verdict rendu ici
 * suppose donc que le plafond est dans la devise de la grille interrogée, et
 * c'est une LIMITE DE L'ARCHIVE, pas du lecteur.
 */
export function plafondArchive(ligne: unknown): number | null {
  if (typeof ligne !== "string" || ligne.length === 0) return null;
  const m = ligne.match(/([0-9]+(?:[.,][0-9]+)?)/);
  if (m === null) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * ⛔ LA MÊME FONCTION POUR LES DEUX DÉNOMINATEURS ET POUR LES DEUX GRILLES.
 * Un compteur écrit deux fois diverge le jour où l'un des deux est corrigé.
 */
function mesure(
  index: CompositionIndex,
  prices: PriceIndex,
  plans: Record<string, unknown>[],
): Compte {
  const c = compteVide();
  for (const row of plans) {
    c.plans += 1;
    const dishes = readDishes(row.dishes);
    const preparations = readPreparations(row.preparations);
    const folded = foldPreparationsIntoDishes({
      dishes: dishes.map((d) => ({
        slot: null,
        method: d.method,
        ingredients: d.ingredients,
        uses: d.uses,
      })),
      preparations: preparations.map((p) => ({
        id: p.id,
        servingsMade: p.servingsMade,
        ingredients: p.ingredients,
      })),
    });

    let planCout = 0;
    let planKcal = 0;
    let planComplet = folded.length > 0;
    folded.forEach((dish, i) => {
      const ings = dish.ingredients as readonly CompositionInput[];
      const v = costOfIngredients(index, prices, ings);
      c.plats += 1;
      c.lignes += v.pricedLines + v.unknownLines;
      c.lignesChiffrees += v.pricedLines;
      c.lignesInconnues += v.unknownLines;
      c.motifNonResolu += v.unresolvedTerms.length;
      c.motifNonPese += v.unweighedTerms.length;
      c.motifSansPrix += v.unpricedTerms.length;
      for (const t of v.unpricedTerms) {
        c.sansPrixTop.set(t, (c.sansPrixTop.get(t) ?? 0) + 1);
      }
      const e = dishEnergy(index, { method: dishes[i]?.method ?? "", ingredients: ings });
      if (v.complete && v.amount !== null) {
        c.platsChiffres += 1;
        planCout += v.amount;
      } else {
        planComplet = false;
      }
      // ⛔ LE RATIO EXIGE LES DEUX COMPLÉTUDES. Un coût complet divisé par une
      // énergie absente rendrait un nombre qui a l'air d'un résultat.
      if (e.complete && e.kcal !== null) planKcal += e.kcal;
      else planComplet = false;
    });

    // ── ⛔ LA PROMESSE, MESURÉE SUR LE PLAN QUI LA PORTE ────────────────
    const plafond = plafondArchive(row.rationale_budget_line);
    if (plafond !== null) {
      c.plafondAnnonce += 1;
      const verdict: CeilingVerdict = ceilingVerdict(
        {
          market: prices.market,
          amount: planComplet && planKcal > 0 ? planCout : null,
          complete: planComplet && planKcal > 0,
          pricedLines: 0,
          unknownLines: 0,
          gaps: [],
          unpricedTerms: [],
          unresolvedTerms: [],
          unweighedTerms: [],
        },
        plafond,
      );
      if (verdict === "over_ceiling") c.plafondOverCeiling += 1;
      else if (verdict === "not_proven") c.plafondNotProven += 1;
      else c.plafondUnknown += 1;
    }

    if (planComplet && planKcal > 0) {
      c.plansComplets += 1;
      c.montants.push(planCout);
      const ratio = costPerThousandKcal(
        {
          market: prices.market,
          amount: planCout,
          complete: true,
          pricedLines: 0,
          unknownLines: 0,
          gaps: [],
          unpricedTerms: [],
          unresolvedTerms: [],
          unweighedTerms: [],
        },
        planKcal,
      );
      if (ratio !== null) c.ratios.push(ratio);
    }
  }
  return c;
}

// ---------------------------------------------------------------------------
// L'IMPRESSION
// ---------------------------------------------------------------------------

const pc = (n: number, d: number) => d === 0 ? "  —  " : `${((100 * n) / d).toFixed(1)} %`;

function mediane(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function imprime(titre: string, c: Compte): void {
  console.log(`\n   ── ${titre} ${"─".repeat(Math.max(0, 56 - titre.length))}`);
  console.log(`      plans                       ${c.plans}`);
  console.log(
    `      plans à TOTAL COMPLET       ${c.plansComplets}   (${pc(c.plansComplets, c.plans)})`,
  );
  console.log(
    `      plats chiffrés              ${c.platsChiffres} / ${c.plats}   (${pc(c.platsChiffres, c.plats)})`,
  );
  console.log(
    `      ⛔ LES DEUX POPULATIONS     chiffrées ${c.lignesChiffrees} · INCONNUES ${c.lignesInconnues}   (sur ${c.lignes} lignes)`,
  );
  console.log(
    `         motifs de l'inconnu      non résolu ${c.motifNonResolu} · non pesé ${c.motifNonPese} · SANS PRIX ${c.motifSansPrix}`,
  );
  const med = mediane(c.ratios);
  if (med === null) {
    console.log(`      €/1 000 kcal                — · AUCUN plan complet, le budget S'ABSTIENT`);
  } else {
    const dans = med >= BANDE_BASSE && med <= BANDE_HAUTE;
    const s = [...c.ratios].sort((a, b) => a - b);
    console.log(
      `      €/1 000 kcal (médiane)      ${med.toFixed(2)}   [min ${s[0].toFixed(2)} · max ${s[s.length - 1].toFixed(2)}]   bande [${BANDE_BASSE} ; ${BANDE_HAUTE}] ⇒ ${dans ? "DEDANS ✅" : "HORS BANDE ⛔"}`,
    );
    const mm = mediane(c.montants)!;
    console.log(`      coût médian d'un plan       ${mm.toFixed(2)}`);
  }
  // ── ⛔ LA PROMESSE — les trois cases, toujours ensemble ────────────────
  console.log(
    `      ⛔ LE PLAFOND ANNONCÉ         ${c.plafondAnnonce} plan(s) portent la phrase ` +
      `« To stay inside it… »   (${pc(c.plafondAnnonce, c.plans)})`,
  );
  if (c.plafondAnnonce > 0) {
    console.log(
      `         VIOLATION DÉMONTRÉE      ${c.plafondOverCeiling}   ·   non démontrable ` +
        `${c.plafondNotProven}   ·   coût inconnu ${c.plafondUnknown}`,
    );
    console.log(
      `         ⚠️ « non démontrable » N'EST PAS « dans le budget »: le panier du plan est`,
    );
    console.log(
      `            un SOUS-ENSEMBLE des courses que le plafond couvre.`,
    );
  }
  if (c.sansPrixTop.size > 0) {
    const top = [...c.sansPrixTop.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log(
      `      sans prix, les plus vus     ${top.map(([t, n]) => `${t}×${n}`).join(", ")}`,
    );
  }
}

async function main() {
  const index = await loadCompositionIndex(fileClient(dir));
  const plans = readNdjson("plans.ndjson");
  const vivants = plans.filter((p) => PROMPTS_VIVANTS.has(String(p.prompt_version ?? "")));
  const exclus = plans.length - vivants.length;

  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log("L30b — LE BUDGET DEVIENT UN CONSTAT");
  console.log(`lancé le ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════════════════════════════════════");

  console.log("\n── ① LES DEUX DÉNOMINATEURS ───────────────────────────────────────────");
  console.log(`   corpus entier                  ${plans.length} plans`);
  console.log(`   prompt VIVANT                  ${vivants.length} plans`);
  console.log(
    `   ⛔ population EXCLUE           ${exclus} plans — tout millésime autre que`,
  );
  console.log(`      meal.en.v18_one_box_per_group [+household.v21_one_box_per_group]`);

  // ── ⓪ ⛔ LE CONTRÔLE NÉGATIF — sans lui, ce pilote est invérifiable ────
  //
  // La `direction D2`, écrite le 2026-08-22 AVANT toute ligne de code: « le
  // référentiel porte 0 prix, je prédis donc 0/13 et 0/193 plans complets —
  // par construction, et le harnais doit le RETROUVER. S'il en rend un seul,
  // mon lecteur invente. »
  //
  // ⛔ CETTE PRÉDICTION EST DEVENUE IRREPRODUCTIBLE le jour de la promotion:
  // le référentiel porte désormais 893 prix, et on ne les retire pas pour
  // refaire une mesure. Le contrôle négatif la rejoue SANS toucher à la base,
  // sur une grille VIDE construite par le même `buildPriceIndex`. Il tourne à
  // CHAQUE run: un lecteur qui se mettrait à inventer un total le ferait ici
  // aussi, et le pilote sortirait en `rc=1`.
  const grilleVide = buildPriceIndex("fr", []);
  const controle = mesure(index, grilleVide, plans);
  const controleOk = controle.plansComplets === 0 && controle.lignesChiffrees === 0;
  console.log("\n── ⓪ CONTRÔLE NÉGATIF · GRILLE VIDE ───────────────────────────────────");
  console.log(
    `   plans complets ${controle.plansComplets} · lignes chiffrées ${controle.lignesChiffrees}` +
      `   ⇒ ${controleOk ? "✅ le lecteur s'abstient" : "⛔ LE LECTEUR INVENTE"}`,
  );
  if (!controleOk) Deno.exitCode = 1;

  const refs = [...index.bySlug.values()];
  console.log("\n── ② LES DEUX GRILLES ─────────────────────────────────────────────────");
  for (const market of ["fr", "us"] as CostMarket[]) {
    const ref = grilleDuReferentiel(market);
    const sas = grilleDuSas(market);
    console.log(
      `   ${market.toUpperCase()}   référentiel LU par le produit  ${ref.bySlug.size} / ${refs.length} lignes` +
        `   ·   sas (proposition)  ${sas.bySlug.size}`,
    );
    if (ref.rejectedSlugs.length > 0) {
      console.log(
        `        ⚠️ refusées à l'entrée de la grille: ${ref.rejectedSlugs.length}`,
      );
    }
  }

  console.log("\n── ③ LE CONSTAT, SUR LA GRILLE QUE LE PRODUIT LIT VRAIMENT ────────────");
  const prixFr = grilleDuReferentiel("fr");
  imprime("prompt VIVANT · marché FR", mesure(index, prixFr, vivants));
  imprime("corpus entier · marché FR", mesure(index, prixFr, plans));

  console.log("\n── ④ CE QUE LE SAS DIRAIT, S'IL ÉTAIT PROMU EN ENTIER ─────────────────");
  console.log("   ⚠️ COMPARAISON SEULE. Aucun lecteur ne voit le sas.");
  const sasFr = grilleDuSas("fr");
  imprime("prompt VIVANT · marché FR (sas)", mesure(index, sasFr, vivants));
  imprime("corpus entier · marché FR (sas)", mesure(index, sasFr, plans));

  console.log("\n═══════════════════════════════════════════════════════════════════════════");
}

if (import.meta.main) await main();
