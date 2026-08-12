/**
 * FF-059 — L'ÉNERGIE D'UN PLAN COMPOSÉ, PAR PLAT ET PAR JOUR.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-059-le-chiffre-affiche.md`
 * Cadre: `docs/keel/CALORIE_REVERSAL.md` · Mesures: `docs/keel/PHOTO_QUANTIFICATION.md`
 *
 * ── C'EST UN CALCUL, PAS UNE ESTIMATION, ET C'EST TOUTE LA DÉCISION ────────
 * Le refus d'origine était fondé sur LA PHOTO: −26,6 % de biais, systématique,
 * dans le sens flatteur, et pire sur les gros repas. Ici les quantités ne sont
 * devinées par personne — **le produit les a écrites**, et le parseur les a
 * RECALCULÉES en grammes crus (`DishIngredient.gramsRaw`, FF-038) au lieu de
 * croire l'arithmétique du modèle. Condition « grammages fournis » du banc:
 * MAPE 2,3 %, un cas à 662 kcal contre 661,8 de vérité terrain.
 *
 * ── `basis` EST UNE CONSTANTE DU CHEMIN ────────────────────────────────────
 * `plan_quantities`. Jamais une déclaration du modèle sur lui-même — c'est
 * l'arbitrage de `CALORIE_REVERSAL` §3, transposé: la base est une propriété de
 * L'ENTRÉE, pas une opinion. Le plan porte les quantités, donc la base est
 * acquise. Un champ que le modèle remplirait serait un champ qu'il peut mentir.
 *
 * ── RIEN NE SE STOCKE (R5) ─────────────────────────────────────────────────
 * Ce module ne renvoie aucune valeur destinée à une colonne. Un chiffre stocké
 * survit au plan qui l'a produit et ment le jour où le plan change — le même
 * défaut que la divergence de FF-056. On recalcule, à chaque lecture, depuis
 * les quantités du jour et le référentiel du jour.
 *
 * ── L'ABSTENTION EST PAR PLAT, ET LE JOUR L'AVOUE ──────────────────────────
 * Un plat dont un seul ingrédient manque au référentiel, ou dont une seule
 * quantité n'est pas convertible, ne porte PAS de chiffre. Et la journée qui le
 * contient DIT qu'elle est incomplète. « Un total qui paraît exhaustif et ne
 * l'est pas est pire que pas de total » — c'est le rabbit hole n°3 de la fiche,
 * et c'est le mode de défaillance que ce module est le plus tenté de produire.
 *
 * ⚠️ ── CE MODULE NE DÉCIDE PAS S'IL FAUT AFFICHER ───────────────────────────
 * Il calcule. La question « cet élève a-t-il le droit de voir un chiffre »
 * appartient à `energy_gate.ts`, et l'appelant doit avoir traversé les quatre
 * portes AVANT d'arriver ici. Les fondre ferait une fonction qui, appelée pour
 * une raison, répondrait à l'autre.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  type CompositionIndex,
  type CompositionInput,
  isFriedMethod,
  type NutrientsOrUnknown,
  nutrientsOf,
  resolveIngredients,
} from "./food_composition.ts";
import { foldPreparationsIntoDishes } from "./meal_verdict.ts";

// ---------------------------------------------------------------------------
// LE TYPE QUI PORTE SA BASE
// ---------------------------------------------------------------------------

/**
 * LA BASE, ET IL N'Y EN A QU'UNE SUR CE CHEMIN.
 *
 * `photo_estimate` existe dans `CALORIE_REVERSAL.md` et n'a rien à faire ici:
 * la photo est un autre chantier, une autre base, un autre calendrier. Un
 * `EnergyBasis` à deux valeurs dans ce module inviterait un appelant à choisir,
 * alors qu'il n'y a rien à choisir.
 */
export const PLAN_ENERGY_BASIS = "plan_quantities";
export type PlanEnergyBasis = typeof PLAN_ENERGY_BASIS;

/**
 * POURQUOI UN PLAT N'A PAS DE CHIFFRE. Nommé, jamais un `null` nu.
 *
 * Les trois se réparent différemment: `unknown_ingredient` pilote la curation
 * d'alias du référentiel, `missing_quantity` dit que le générateur a rendu une
 * quantité non structurée, `no_ingredients` dit que le plat est vide. Les
 * confondre ferait chercher des alias pour un problème de prompt — la même
 * distinction que `unresolvedTerms` / `unweighedTerms` dans FF-038.
 */
export const ENERGY_GAPS = Object.freeze(
  ["unknown_ingredient", "missing_quantity", "no_ingredients"] as const,
);
export type EnergyGap = (typeof ENERGY_GAPS)[number];

export interface DishEnergy {
  /**
   * L'ÉNERGIE D'UNE ASSIETTE, arrondie. `null` quand `complete` est faux.
   *
   * ⚠️ `null` ET PAS UNE SOMME PARTIELLE. Une somme amputée de l'huile a l'air
   * d'un résultat et vaut plusieurs dizaines de pour cent d'écart, toujours
   * dans le même sens. C'est la règle de `nutrientsOf`, tenue jusqu'à l'écran.
   */
  kcal: number | null;
  basis: PlanEnergyBasis;
  complete: boolean;
  /** Ce qui manque, quand `complete` est faux. Vide sinon. */
  gaps: EnergyGap[];
  /** Les termes que le référentiel n'a pas su lire. La worklist de curation. */
  unreadableTerms: string[];
}

export interface DayEnergy {
  /** Jeton `mon`..`sun`, ou `null` pour un plat sans jour. */
  day: string | null;
  /**
   * LA SOMME DES PLATS CALCULABLES DE CE JOUR.
   *
   * ⚠️ Elle est rendue MÊME quand `complete` est faux, et c'est le §8 de la
   * fiche mot pour mot: « ce plat n'affiche pas de chiffre / ET le total du
   * jour dit qu'il est incomplet ». Ce qui rend ça honnête plutôt que trompeur
   * est le couple `dishesCounted` / `dishesTotal`, qui n'est pas décoratif:
   * c'est lui que la copie doit rendre, pas seulement le mot « incomplet ».
   *
   * `null` quand AUCUN plat du jour n'est calculable — un « 0 kcal » se lirait
   * « cette journée ne nourrit pas », le sens exactement inverse.
   */
  kcal: number | null;
  basis: PlanEnergyBasis;
  complete: boolean;
  dishesCounted: number;
  dishesTotal: number;
  /**
   * FF-059 — CE QUI S'AJOUTE À L'ASSIETTE DE CETTE BOUCHE, ce jour-là.
   *
   * `0` dans le cas nominal (plan personnel, ou bouche dont le besoin EST le
   * tronc). Non nul dans un foyer où les portions divergent — et c'est très
   * exactement la bifurcation par objectif, enfin lisible en nombre.
   *
   * ⚠️ IL EST DANS `kcal`, et il est aussi rendu À PART. L'écran doit pouvoir
   * dire « le plat, plus ce qui va dans ton assiette », parce qu'un total qui
   * fond les deux ferait croire que le plat est plus gros qu'il n'est — et deux
   * personnes autour de la même casserole liraient deux chiffres pour le même
   * plat sans que rien n'explique pourquoi.
   */
  addonKcal: number;
}

export interface PlanEnergy {
  basis: PlanEnergyBasis;
  /** Un par plat, dans l'ordre d'entrée. Les index se correspondent. */
  dishes: DishEnergy[];
  /** Un par jour rencontré, dans l'ordre de première apparition. */
  days: DayEnergy[];
}

// ---------------------------------------------------------------------------
// L'ENTRÉE
// ---------------------------------------------------------------------------

/** Un plat, réduit à ce dont le calcul a besoin. */
export interface EnergyDish {
  day: string | null;
  method: string;
  ingredients: readonly CompositionInput[];
  /** Ce que ce plat prélève sur des préparations déjà faites (FF-038). */
  uses: readonly { preparationId: string; servings: number }[];
}

export interface EnergyPreparation {
  id: string;
  servingsMade: number;
  ingredients: readonly CompositionInput[];
}

// ---------------------------------------------------------------------------
// LE CALCUL
// ---------------------------------------------------------------------------

function emptyDish(gap: EnergyGap, unreadableTerms: string[] = []): DishEnergy {
  return {
    kcal: null,
    basis: PLAN_ENERGY_BASIS,
    complete: false,
    gaps: [gap],
    unreadableTerms,
  };
}

/**
 * L'énergie d'UN plat, préparations déjà pliées dedans.
 *
 * ── LA COMPLÉTUDE EST BINAIRE, ET PLUS STRICTE QUE CELLE DU VERDICT ────────
 * FF-039 s'abstient sous 80 % de résolution, parce qu'il rend une DIRECTION
 * (`within` / `above` / `below`) et qu'une direction survit à une marge. Ici on
 * rend un NOMBRE que quelqu'un va lire comme sa journée: la moindre lacune le
 * rend faux, et faux dans une direction (toujours vers le bas, puisqu'un
 * ingrédient manquant ne retire jamais d'énergie).
 *
 * D'où le seuil à 100 %: `unresolvedTerms` vide ET `unweighedTerms` vide. Le
 * sel et le poivre y comptent, et c'est assumé — ils sont dans le référentiel
 * avec un poids d'unité, donc ils ne coûtent une abstention que là où le
 * générateur n'a pas structuré sa quantité. `coverage` de FF-038 n'est PAS lu
 * ici: il compte les termes connus, pesés ou non, ce qui est la bonne question
 * pour une porte de verdict et la mauvaise pour une somme.
 */
export function dishEnergy(
  index: CompositionIndex,
  dish: { method: string; ingredients: readonly CompositionInput[] },
): DishEnergy {
  const named = dish.ingredients.filter((i) => String(i?.term ?? "").trim() !== "");
  if (named.length === 0) return emptyDish("no_ingredients");

  const r = resolveIngredients(index, named);
  if (r.unresolvedTerms.length > 0) {
    return emptyDish("unknown_ingredient", [...r.unresolvedTerms].sort());
  }
  if (r.unweighedTerms.length > 0) {
    return emptyDish("missing_quantity", [...r.unweighedTerms].sort());
  }
  if (r.resolved.length === 0) return emptyDish("no_ingredients");

  const n: NutrientsOrUnknown = nutrientsOf(r.resolved, {
    // L'imputation d'huile de friture (12 % du poids cuit) est une CONVENTION
    // avouée de FF-038. On la garde: sans elle un beignet se compte comme le
    // même plat à la vapeur, ce qui est l'erreur de sens que ce chantier
    // existe pour ne pas commettre.
    friedMethod: isFriedMethod(dish.method),
  });
  if (n === "unknown") return emptyDish("no_ingredients");

  return {
    kcal: n.energyKcal,
    basis: PLAN_ENERGY_BASIS,
    complete: true,
    gaps: [],
    unreadableTerms: [],
  };
}

// ---------------------------------------------------------------------------
// FF-059 — L'ADD-ON D'UNE BOUCHE, dans un foyer
// ---------------------------------------------------------------------------

/**
 * UN ADD-ON, tel que `generated_from.household.member_deltas` le porte.
 *
 * Un slug de `food_composition_refs` et des grammes CRUS. Pas de prose, pas de
 * raison, pas d'objectif — c'est le contrat de `memberDeltasPayload`, et c'est
 * ce qui rend cet objet lisible sans rien révéler du corps de personne.
 */
export interface MemberAddon {
  foodRef: string;
  grams: number;
}

/**
 * CE QUI S'AJOUTE À L'ASSIETTE D'UNE BOUCHE, PAR JOUR.
 *
 * ── POURQUOI C'EST UNE GRANDEUR DE JOUR ET PAS DE PLAT ─────────────────────
 * Le delta de FF-043 comble un écart QUOTIDIEN — `m.envelope.energy.low -
 * trunk.energy.low`, deux bandes journalières. Il n'est attaché à aucun plat, et
 * l'attacher à un plat au hasard inventerait un rattachement que le moteur n'a
 * jamais fait.
 *
 * ⚠️ ── LES DENSITÉS DU CATALOGUE NE SERVENT PAS ICI ─────────────────────────
 * `DELTA_CATALOGUE` porte des `kcalPer100g` que son propre commentaire déclare
 * bons « à DIMENSIONNER un ajout, jamais à afficher un chiffre ». On repasse
 * donc par le référentiel, comme pour n'importe quel ingrédient — sinon
 * l'add-on serait le seul nombre de l'écran calculé sur un ordre de grandeur.
 *
 * `complete: false` dès qu'un `food_ref` n'est pas résolvable: le total du jour
 * dira alors qu'il lui manque quelque chose, au lieu de compter l'add-on à
 * zéro et de rendre une journée qui a l'air maigre.
 */
export function memberAddonEnergy(
  index: CompositionIndex,
  addons: readonly MemberAddon[],
): DishEnergy {
  if (addons.length === 0) {
    // AUCUN ADD-ON EST UN RÉSULTAT, PAS UNE ABSENCE. Le tronc est dimensionné
    // sur le MIN de toutes les bouches: celle qui a le plus petit besoin n'a
    // rien à ajouter, et sa journée est COMPLÈTE à zéro. Rendre `null` ici
    // ferait dire « incomplet » à la seule personne dont l'assiette est
    // exactement le plat.
    return {
      kcal: 0,
      basis: PLAN_ENERGY_BASIS,
      complete: true,
      gaps: [],
      unreadableTerms: [],
    };
  }
  return dishEnergy(index, {
    // Aucune méthode: un add-on n'est pas cuisiné, il est ajouté. Passer une
    // méthode de plat ici lui imputerait l'huile de friture du plat.
    method: "",
    ingredients: addons.map((a) => ({
      term: a.foodRef,
      amount: a.grams,
      unit: "g" as const,
      // Les grammes du delta sont CRUS — `DELTA_CATALOGUE` les dimensionne sur
      // des `kcalPer100g` « pour 100 g CRUS ». Sans ce `state`, le riz (×2,6)
      // s'abstiendrait.
      state: "raw" as const,
    })),
  });
}

/**
 * L'énergie d'un plan entier — par plat, puis par jour.
 *
 * @param servings LE NOMBRE DE BOUCHES QUE LES QUANTITÉS COUVRENT.
 *
 *   Le contrat du générateur est explicite (« A PORTION IS ONE PERSON'S
 *   PLATE »): toute quantité écrite est pour le nombre de personnes à table.
 *   Diviser est donc obligatoire, pas cosmétique — sur un plan de foyer à
 *   quatre, ne pas diviser rendrait un chiffre quatre fois trop grand, et il
 *   aurait l'air d'un chiffre.
 *
 *   REQUIS, jamais optionnel, et un `servings` non entier ≥ 1 LÈVE. Un défaut à
 *   1 serait la version désarmée de ce paramètre: elle ne casserait aucun
 *   appelant existant et rendrait le mauvais nombre au premier foyer.
 */
export function planEnergy(args: {
  index: CompositionIndex;
  dishes: readonly EnergyDish[];
  preparations: readonly EnergyPreparation[];
  servings: number;
  /**
   * FF-059 — LES ADD-ONS DE **CETTE** BOUCHE, par jour.
   *
   * REQUIS, jamais optionnel, et `[]` est une valeur pleine qui veut dire
   * « rien à ajouter » — pas « on ne sait pas ». Un plan personnel passe `[]`;
   * un foyer passe les deltas du lecteur, et personne d'autre.
   *
   * ⚠️ CEUX DU LECTEUR, ET D'EUX SEULS. Un add-on est dimensionné sur le corps
   * et l'objectif de quelqu'un: rendre ceux des autres bouches ferait lire à
   * table, en kcal, le déficit de sa mère. « Ce qui touche le corps est à soi »
   * est déjà la règle du domaine, et c'est ici qu'elle se tient.
   */
  addons: readonly MemberAddon[];
}): PlanEnergy {
  const { index, dishes, preparations, servings } = args;
  if (!Number.isInteger(servings) || servings < 1) {
    throw new Error(
      `[keel/plan_energy] servings must be an integer >= 1, got ${JSON.stringify(servings)}`,
    );
  }
  if (!Array.isArray(args.addons)) {
    throw new Error("[keel/plan_energy] addons is required (pass [] for none)");
  }
  const addon = memberAddonEnergy(index, args.addons);

  // LE PLIAGE D'ABORD. En cuisine en lot, 41 % de l'énergie et 51 % de la
  // protéine vivent dans les préparations, pas dans les plats (mesuré le
  // 2026-08-12 sur 80 générations). Un calcul qui ne lirait que
  // `dish.ingredients` rendrait un chiffre amputé de moitié — avec sa base, sa
  // complétude à `true`, et l'air parfaitement juste.
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

  const perDish = folded.map((f) => {
    const e = dishEnergy(index, { method: f.method, ingredients: f.ingredients });
    if (e.kcal === null) return e;
    // La division par `servings` se fait ICI, sur le plat déjà plié: elle porte
    // donc aussi la part de préparation, qui est écrite pour la table elle
    // aussi.
    return { ...e, kcal: Math.round(e.kcal / servings) };
  });

  // ── LES JOURS, DANS L'ORDRE DE PREMIÈRE APPARITION ──────────────────────
  // Pas triés par jeton: un plan « jeu → ven → sam » se lirait « ven → jeu →
  // sam » avec un tri alphabétique, et un plan sans jour (`null`) n'aurait pas
  // de place dans l'ordre de la semaine. L'ordre d'entrée est celui que
  // l'écran affiche déjà.
  const order: (string | null)[] = [];
  const byDay = new Map<string | null, DayEnergy>();
  for (const [i, dish] of dishes.entries()) {
    const day = dish.day;
    let entry = byDay.get(day);
    if (!entry) {
      entry = {
        day,
        kcal: null,
        basis: PLAN_ENERGY_BASIS,
        complete: true,
        dishesCounted: 0,
        dishesTotal: 0,
        addonKcal: 0,
      };
      byDay.set(day, entry);
      order.push(day);
    }
    entry.dishesTotal++;
    const e = perDish[i];
    if (e.complete && e.kcal !== null) {
      entry.kcal = (entry.kcal ?? 0) + e.kcal;
      entry.dishesCounted++;
    } else {
      entry.complete = false;
    }
  }

  // ── L'ADD-ON S'AJOUTE AU JOUR, PAS AU PLAT ──────────────────────────────
  // Le delta comble un écart QUOTIDIEN et n'est attaché à aucun plat. Le
  // rattacher à l'un d'eux inventerait un lien que le moteur n'a jamais fait —
  // et ferait lire deux chiffres différents pour la même casserole à deux
  // personnes assises côte à côte.
  //
  // ⚠️ SUR UN JOUR DONT AUCUN PLAT N'EST LISIBLE, IL NE FABRIQUE PAS UN TOTAL.
  // `kcal` reste `null`: « 180 kcal » sur une journée dont on n'a su lire aucun
  // repas serait le total qui fait semblant, dans sa version la plus trompeuse.
  for (const entry of byDay.values()) {
    entry.addonKcal = addon.kcal ?? 0;
    if (!addon.complete) entry.complete = false;
    if (entry.kcal !== null && addon.kcal !== null) entry.kcal += addon.kcal;
  }

  return {
    basis: PLAN_ENERGY_BASIS,
    dishes: perDish,
    days: order.map((d) => byDay.get(d)!),
  };
}
