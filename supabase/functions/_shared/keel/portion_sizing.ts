/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA PART D'UNE PERSONNE, CALCULÉE — 2026-09-07
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Chantier: `docs/keel/METHODE-GENERATION-DE-PLAN-SOLO.md`, lot 2.
 *
 * ── LE RENVERSEMENT ───────────────────────────────────────────────────────
 * Aujourd'hui le MODÈLE écrit les grammes de chaque boîte à partir de faits de
 * corps qu'on lui donne, et le moteur MESURE l'écart sans rien appliquer
 * (`applied:false`, `would_resize`). Un plat sans boîte ne compte pas du tout.
 *
 * La méthode nouvelle inverse les rôles: le modèle écrit UNE RECETTE STANDARD
 * (une portion, sans corps, sans boîte) et l'ALGORITHME multiplie. Ce module
 * porte toute l'arithmétique de cette multiplication.
 *
 * ── CE LOT NE FAIT QUE MESURER ────────────────────────────────────────────
 * Rien n'est appliqué au lot 2: le calcul tourne sur la recette telle qu'elle
 * sort AUJOURD'HUI, et n'écrit que le journal. L'application est le lot 4.
 *
 * ⛔ CE QUE CE MODULE NE FAIT PAS, ET NE FERA JAMAIS: ajouter un aliment. Il
 * multiplie ce que le modèle a écrit; un terme qui n'était pas en entrée ne
 * peut pas être en sortie. Un test le tient.
 *
 * ⛔ CE QU'IL NE RÉÉCRIT PAS NON PLUS: le partage de la journée entre les
 * moments. `slotPlanTargets` (`mouth_anchor.ts`) fait autorité et porte déjà
 * le moment léger et le retrait des apports fixes. Une seconde écriture de
 * cette arithmétique divergerait de la première au premier ajustement — c'est
 * la règle que son propre commentaire énonce.
 *
 * PURE: no I/O, no clock, no randomness.
 */
import {
  type CompositionIndex,
  type CompositionRef,
  normalizeTerm,
} from "./food_composition.ts";
// ⟳ 2026-09-11 · LOT B — LA MESURE D'UNE ASSIETTE VIT DANS `preparation_mass.ts`
// et elle décide de l'eau PAR UNITÉ DE CUISSON. Voir `standardPortionOf`.
import {
  measurePlate,
  measurePreparation,
  POT_MISSING_PREPARATION_GAP,
  type WaterTreatment,
  WATER_TREATMENTS,
} from "./preparation_mass.ts";
// ⟳ 2026-09-11 · LOT B — LA MESURE FINALE LIT LES CONTENANTS ÉCRITS, et c'est
// `boxNutrition` qui les lit (items × densité de casserole, protéine comprise).
// Aucun second lecteur: `finalPortionCheck` ne fait qu'y attacher un verdict.
import { type BoxedMouthEnergyDish, boxNutrition } from "./mouth_energy.ts";
import type { EnergyPreparation } from "./plan_energy.ts";
import { weighedReadyGrams } from "./box_densify.ts";
import type { AppetiteLevel } from "./tokens.ts";
import {
  type AnchorMouth,
  type AnchorReason,
  goalGapKcalOf,
  LIGHT_MEAL_KCAL_PER_G_FLOOR,
  maintenanceKcalOf,
  MEAL_KCAL_PER_G_COMPOSED,
  MEAL_KCAL_PER_G_FLOOR,
  slotPlanTargets,
  withPortionCran,
} from "./mouth_anchor.ts";
// ⟳ 2026-09-10 — LE PLANCHER D'ÉNERGIE DE CE CORPS, POUR LE CRAN À LA BAISSE.
// `withPortionCran` le REÇOIT plutôt que de le lire: ce module-ci a la bouche
// sous la main, pas `mouth_anchor`. Deux lectures du même plancher divergent.
import { energyFloorFor } from "./weight_pace.ts";
import { appetiteFactorOf } from "./meal_envelope.ts";
import type { CountingStance } from "./energy_gate.ts";

// ══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-10 — L'APPÉTIT REVIENT ICI, ET IL Y RESTE. C'EST UN RENVERSEMENT.
// ══════════════════════════════════════════════════════════════════════════
//
// La veille encore, ce bloc disait le contraire: « `APPETITE_FACTORS` ne
// transite plus par ici, il entre une seule fois dans l'entretien estimé ». La
// raison invoquée était juste — deux couches qui dimensionnent font un double
// comptage — mais elle avait été appliquée à la MAUVAISE couche.
//
//     ⛔ AVOIR BON APPÉTIT NE FAIT PAS DÉPENSER 10 % DE PLUS.
//
// Posé sur l'entretien, l'appétit ajoutait des CALORIES: il annulait une part
// du déficit de quelqu'un qui perd du poids parce qu'il aime manger, sans que
// rien ne le nomme. Posé ici, sur les BORNES DE MASSE, il dit ce qu'il décrit —
// à énergie CONSTANTE, une même cible servie plus dense à petit appétit, plus
// volumineuse à grand appétit.
//
// Il n'y a toujours qu'UNE couche: `estimatedMaintenanceKcal` ne le lit plus.

// ═══════════════════════════════════════════════════════════════════════════
// ① LA GARDE — QUEL CHEMIN, ET POURQUOI
// ═══════════════════════════════════════════════════════════════════════════

/**
 * COMBIEN DE BOUCHES CE CHEMIN SAIT DIMENSIONNER.
 *
 * ⛔ UNE. Ce n'est pas une timidité, c'est ce qui est éprouvé: la méthode est
 * écrite, calibrée et mesurée sur un foyer d'une personne. À plusieurs bouches,
 * une casserole est tirée par des parts DIFFÉRENTES et la somme n'est pas
 * écrite ici — `applySizing` (lot 4) prend déjà des lignes par (plat, bouche),
 * mais rien ne l'a mesuré.
 *
 * ⚠️ C'EST AUSSI LE BOUTON DE RETOUR ARRIÈRE. `0` désarme le chemin neuf
 * entièrement: tout retombe sur `legacy_measure`, sans toucher une ligne de
 * câblage. Un lot sans marche arrière d'un caractère est un lot qu'on ne peut
 * pas retirer un vendredi soir.
 */
// ══════════════════════════════════════════════════════════════════════════
// ⟳ BASCULE (2026-09-08) — LA TABLE ENTIÈRE PASSE SUR LE CHEMIN NEUF
// ══════════════════════════════════════════════════════════════════════════
//
// La borne valait `1` depuis le premier lot: le moteur dimensionnait une bouche
// seule, et toute table retombait sur le chemin où le MODÈLE écrit les grammes.
// Elle passe au plafond de la lane, mesuré sur deux foyers réels le 2026-09-08:
//
//                                  seuil    `quatre`     `cinq`
//   journée à ±5 % de la cible     ≥ 90 %   4/4 = 100 %  5/5 = 100 %
//   assiettes dans les bornes      ≥ 80 %   12/12 = 100% 12/15 = 80 %
//   bac à un seul nom                   0   0            0
//   mangeur non dimensionné             0   0            0
//
// ⚠️ ET C'EST LA RÉPARATION QUI A FAIT LA DIFFÉRENCE, pas la chance du jour.
// Le compteur `repair_effect` porte l'avant et l'après du MÊME plan:
//   `quatre` — 11 assiettes dans les bornes avant, 12 après;
//   `cinq`   —  6 avant, 12 après, sur quinze.
// Sans lui, « douze sur douze » n'aurait pas été distinguable d'un bon tirage.
//
// ⛔ LE RETOUR ARRIÈRE EST CETTE LIGNE, ET RIEN D'AUTRE. La remettre à `1`
// referme tout — prompt v34, couvercles autorés, réparation par mangeur — et
// rend à toute la population le chemin d'avant, en un commit. Le chemin legacy
// n'a pas été retiré: il est PRÉCÉDÉ, jamais remplacé.
// ⚠️ LE NOMBRE, ET PAS `HOUSEHOLD_MAX_MOUTHS`: celui-là est déclaré plus bas
// dans ce fichier, et une constante ne peut pas se lire avant sa ligne. Le lien
// entre les deux est tenu par une épreuve, pas par une référence.
export const PORTION_SIZING_MAX_MOUTHS = 12;

export type SizingPath = "portion_v1" | "legacy_measure";

export const SIZING_PATH_REASONS = [
  "one_mouth",
  "several_mouths",
  "no_mouth",
  "merge_requested",
  "unmerge_requested",
  "composition_unavailable",
] as const;
export type SizingPathReason = (typeof SIZING_PATH_REASONS)[number];

/**
 * LE VERDICT EST CALCULÉ UNE FOIS, ET TOUT LE MONDE LE LIT.
 *
 * ⛔ AUCUN DRAPEAU DE REQUÊTE, AUCUNE VARIABLE D'ENVIRONNEMENT. Le chemin se
 * DÉRIVE de l'état du foyer. Un drapeau que l'appelant passe est un drapeau
 * qu'un appelant oublie, et on se retrouverait avec un prompt qui promet une
 * recette standard pendant qu'un moteur attend des boîtes — les deux moitiés
 * d'un même lot, désaccordées, en production.
 *
 * ⚠️ LA COMPOSITION EST UNE CONDITION, PAS UN CONFORT. Sans index de
 * composition il n'y a ni kcal ni masse cuite: on ne peut RIEN dimensionner, et
 * prétendre le contraire rendrait un facteur 1 déguisé en mesure.
 *
 * ⚠️ FUSION ET DÉFUSION FERMENT LE CHEMIN. Elles recomposent les assiettes
 * entre bouches; le dimensionnement par personne n'y a pas encore de sens
 * défini, et deviner en aurait un très visible dans l'assiette de quelqu'un.
 */
export function sizingPathFor(args: {
  platedMouths: number;
  merge: boolean;
  unmerge: boolean;
  compositionLoaded: boolean;
}): { path: SizingPath; reason: SizingPathReason } {
  if (!args.compositionLoaded) {
    return { path: "legacy_measure", reason: "composition_unavailable" };
  }
  if (args.merge) return { path: "legacy_measure", reason: "merge_requested" };
  if (args.unmerge) {
    return { path: "legacy_measure", reason: "unmerge_requested" };
  }
  if (args.platedMouths <= 0) {
    return { path: "legacy_measure", reason: "no_mouth" };
  }
  if (args.platedMouths > PORTION_SIZING_MAX_MOUTHS) {
    return { path: "legacy_measure", reason: "several_mouths" };
  }
  return { path: "portion_v1", reason: "one_mouth" };
}

// ═══════════════════════════════════════════════════════════════════════════
// ② LA PART STANDARD D'UN PLAT
// ═══════════════════════════════════════════════════════════════════════════

/** Ce qu'un plat sert à UNE personne, avant toute multiplication. */
export interface StandardPortion {
  /** `null` quand `dishEnergy` s'abstient — jamais une somme amputée. */
  kcal: number | null;
  /** La masse SERVIE, en grammes. `null` si aucune ligne ne se pèse. */
  cookedG: number | null;
  /** kcal pour 100 g servis. `null` dès que l'un des deux manque. */
  densityPer100G: number | null;
  /**
   * ⟳ 2026-09-11 · LOT B — LA PROTÉINE DE CETTE PART, CASSEROLES PLIÉES.
   *
   * ⛔ ELLE EST MESURÉE AU PRORATA RÉELLEMENT SERVI DE CHAQUE CASSEROLE, jamais
   * sur le frais du plat seul. C'est la cicatrice
   * `preparations-must-be-folded-into-dishes`: sans le pliage, **51 % de la
   * protéine sort du verdict** — 111/32/26 g par jour mesurés sans lui,
   * 167/133/126 g avec.
   *
   * ⚠️ AUCUN SECOND BARÈME N'EST INVENTÉ ICI. Les planchers restent ceux de
   * `meal_envelope.ts` (`PROTEIN_FLOOR_G_PER_KG`, `proteinFloorG`); ce champ ne
   * fait que dire ce que la part CONTIENT, pour que la garde ait quelque chose
   * à comparer.
   *
   * `null` quand l'énergie se tait, et aussi quand un terme inconnu n'a été
   * admis que par sa borne de groupe: une borne donne une densité d'énergie,
   * jamais des grammes de protéine.
   */
  proteinG: number | null;
  /** Les casseroles tirées, et par combien de plats chacune est tirée. */
  pots: readonly { id: string; draws: number }[];
  /** Ce qui manque, quand `kcal` est nul. */
  gaps: readonly string[];
}

interface PortionIngredient {
  term: string;
  quantity?: string | null;
  amount?: number | null;
  unit?: string | null;
  state?: string | null;
  /**
   * ⟳ LOT A (2026-09-11) — L'IDENTIFIANT DE LA LIGNE, jusqu'à la part standard.
   *
   * `standardPortionOf` passe ces lignes à `measurePlate`, donc à
   * `resolveIngredients`. Sans ces deux champs, la part standard d'une assiette
   * se calculait sur le libellé pendant que `grams_raw` avait été pesé sur
   * l'identifiant — deux masses pour le même plat.
   */
  ref?: string | null;
  refRefused?: boolean;
}

/**
 * LA PART STANDARD = LE FRAIS DU PLAT + LA RECETTE DE CHAQUE CASSEROLE DIVISÉE
 * PAR LE NOMBRE DE PLATS QUI LA TIRENT.
 *
 * ⛔ PAS `servings_made`, ET C'EST MESURÉ. Le modèle écrit `servings: 1` sur des
 * pots que quinze plats tirent; s'en servir attribuerait la casserole entière à
 * chaque assiette. Le nombre de TIRAGES est une propriété du plan, observable,
 * et personne ne peut se tromper en la comptant.
 *
 * ⟳ 2026-09-11 · LOT B — LE BIAIS DE LA PINCÉE EST CORRIGÉ. Cette fonction
 * comptait ENTIÈRE, dans chaque part, toute ligne de casserole sans `amount`
 * (une pincée de sel, un brin de persil, pesés par `condimentMassFor`). Trois
 * parts de la casserole de couscous de GAIN `a18f522e` réclamaient ainsi
 * 997,5 g d'un pot qui en produit 986,5. La part est désormais `masse prête de
 * la casserole ÷ tirages` — la MÊME division que `applySizing` écrit dans la
 * boîte. Voir `shareOf` (`preparation_mass.ts`).
 */
/**
 * LE TROU D'UNE CASSEROLE CITÉE MAIS ABSENTE DU PLAN.
 *
 * ⚠️ NOMMÉ, ET ÉPINGLÉ, parce que c'est le seul trou qu'une RÉPARATION peut
 * créer: la fusion renomme les casseroles réécrites, et un plat non repris cite
 * encore l'ancien identifiant. Le lire dans `unmeasurable_by` est ce qui
 * distingue « le référentiel ne connaît pas cet aliment » de « la fusion a
 * cassé le plan ».
 */
/**
 * ⟳ 2026-09-11 · LOT B — LE JETON EST DÉCLARÉ UNE FOIS, DANS `preparation_mass.ts`,
 * et réexporté ici sous son nom historique. Le journal de la lane
 * (`unmeasurable_by`) le compte depuis le 2026-09-08; deux littéraux `"missing_
 * preparation"` dans deux fichiers auraient fini par diverger d'une lettre, et
 * c'est le compteur qu'on regarde le moins qui aurait gardé l'ancien.
 */
export const MISSING_PREPARATION_GAP = POT_MISSING_PREPARATION_GAP;

/**
 * LE TROU QU'ON N'A PAS SU NOMMER.
 *
 * ⛔ IL NE DOIT JAMAIS ÊTRE FRÉQUENT. Sa présence dans un journal dit que
 * `dishEnergy` a rendu `complete: false` sans dire de quoi il manquait — un
 * défaut de l'instrument, pas du plan. On préfère un nom laid à un compteur
 * vide: `unmeasurable_by: {}` sur huit assiettes s'est déjà lu comme « rien à
 * signaler ».
 */
export const UNNAMED_ENERGY_GAP = "energy_incomplete_unnamed";
/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-11 · LOT B — PLUS D'APLATISSEMENT AVANT LA DÉCISION SUR L'EAU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUE CETTE FONCTION FAISAIT, ET CE QUE ÇA COÛTAIT. Elle empilait le frais
 * du plat et les ingrédients de TOUTES les casseroles dans une seule liste
 * `parts`, puis appelait `weighedReadyGrams(parts)` **une fois**. Or ce lecteur
 * décide de l'eau sur la liste qu'il reçoit: un couscous (`grain_absorbs`) dans
 * l'assiette effaçait l'eau de la casserole de lentilles, qui n'absorbe rien.
 *
 * Mesuré sur GAIN `a18f522e`, samedi déjeuner, après deuxième réparation:
 * 20 + 548,5 + 332,5 = **901 g** par composants, **811 g** aplati. Le moteur
 * dimensionnait sur 811, annonçait 657, et `applySizing` — qui mesure chaque
 * casserole SÉPARÉMENT — écrivait 727. Le même moteur, deux masses, le même
 * assemblage.
 *
 * La mesure vit désormais dans `preparation_mass.ts` (`measurePlate`), et cette
 * fonction n'est plus que l'adaptateur qui la met à la forme que la lane lit.
 * Les trois cicatrices de l'ancienne version sont conservées et TESTÉES:
 * `drawsByPreparation` (jamais `servings_made`), `MISSING_PREPARATION_GAP`,
 * `UNNAMED_ENERGY_GAP`.
 */
export function standardPortionOf(args: {
  index: CompositionIndex;
  dish: { method?: string | null; ingredients?: readonly PortionIngredient[] };
  /**
   * ⚠️ `preparationId`, EN CAMELCASE. C'est la forme PARSÉE (`GeneratedDish`),
   * pas celle du JSON du modèle (`preparation_id`). Les deux existent dans ce
   * dépôt et se ressemblent assez pour qu'un lecteur lise systématiquement des
   * casseroles vides — chaque plat vaudrait alors son seul frais.
   */
  uses: readonly { preparationId?: string | null }[];
  preparations: readonly {
    id: string;
    /**
     * ⟳ 2026-09-11 · LOT B — LA MÉTHODE DE LA CASSEROLE, quand l'appelant la
     * porte. Elle ne sert qu'à une chose: l'imputation d'huile de friture
     * (`isFriedMethod`, 12 % du poids cuit). Avant ce lot, la liste aplatie
     * faisait porter la méthode du PLAT à toutes les casseroles; désormais
     * chaque unité de cuisson répond de la sienne — comme `potDensities` le
     * fait déjà de son côté. Les deux appelants de production passent
     * `meal.preparations`, qui porte `method`.
     */
    method?: string | null;
    ingredients?: readonly PortionIngredient[];
  }[];
  drawsByPrep: ReadonlyMap<string, number>;
}): StandardPortion {
  const m = measurePlate({
    index: args.index,
    dish: args.dish,
    uses: args.uses,
    preparations: args.preparations,
    drawsByPrep: args.drawsByPrep,
  });
  // ⚠️ LE VOCABULAIRE DES TROUS NE CHANGE PAS. `unmeasurable_by` compte ces
  // jetons depuis des mois dans le journal de la lane; `measurePlate` rend
  // déjà ceux de `plan_energy.ts` (`unknown_ingredient`, `missing_quantity`,
  // `no_ingredients`) plus `missing_preparation`. On ne renomme rien ici.
  const named = m.gaps.map((g) => String(g));
  // ⛔ « IMMESURABLE SANS RAISON » NE DOIT PAS EXISTER. Mesuré au tir `IDENTITE`
  // du 2026-09-08: huit assiettes `unmeasurable` et `unmeasurable_by: {}` — le
  // compteur qui sert précisément à dire POURQUOI était vide, et rien ne le
  // signalait. Un trou sans nom se relit comme un trou qu'on n'a pas cherché.
  if (m.kcal === null && named.length === 0) named.push(UNNAMED_ENERGY_GAP);
  const cooked = m.readyG;
  return {
    kcal: m.kcal,
    cookedG: cooked === null ? null : Math.round(cooked),
    densityPer100G: m.kcal !== null && cooked !== null && cooked > 0
      ? Math.round((m.kcal / cooked) * 1000) / 10
      : null,
    proteinG: m.proteinG,
    pots: m.pots.map((p) => ({ id: p.id, draws: p.draws })),
    gaps: named,
  };
}

/**
 * COMBIEN DE PLATS TIRENT SUR CHAQUE CASSEROLE.
 *
 * Séparé de `standardPortionOf` parce que le compte se fait sur le plan ENTIER
 * et se lit ensuite plat par plat. Le calculer dans la boucle rendrait 1 partout.
 */
export function drawsByPreparation(
  dishes: readonly { uses?: readonly { preparationId?: string | null }[] }[],
): Map<string, number> {
  const draws = new Map<string, number>();
  for (const d of dishes) {
    for (const u of d.uses ?? []) {
      const id = String(u?.preparationId ?? "");
      if (id) draws.set(id, (draws.get(id) ?? 0) + 1);
    }
  }
  return draws;
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ LES BORNES DE L'ASSIETTE
// ═══════════════════════════════════════════════════════════════════════════

export const PLATE_BOUND_BANDS = ["adult", "teen", "child", "toddler"] as const;
export type PlateBoundBand = (typeof PLATE_BOUND_BANDS)[number];
export type PlateSlotClass = "meal" | "snack";

/**
 * CE QU'UNE ASSIETTE PEUT PESER, PAR TRANCHE D'ÂGE ET PAR TYPE DE MOMENT.
 *
 * ⛔ UNE CAPACITÉ D'ESTOMAC, PAS UN BESOIN. C'est toute la différence, et c'est
 * la cicatrice qui a fait écrire ces bornes: `8 g/kg` donnait 288 g de plafond à
 * une enfant de 36 kg — un dîner d'enfant borné à une assiette de poupée. Et un
 * plafond dérivé des kcal est CIRCULAIRE: on borne la masse par une cible qu'on
 * multiplie ensuite pour atteindre cette cible.
 *
 * ⚠️ CE SONT DES CONVENTIONS, ET ELLES SONT À CALIBRER SUR DES RUNS RÉELS. Le
 * doc de méthode les liste comme telles. Ce qui est éprouvé, c'est leur FORME —
 * par tranche d'âge, modulée par l'appétit — pas leurs valeurs au gramme.
 *
 * ⚠️ LES BORNES DE COLLATION DES TROIS BANDES D'ENFANT SONT DÉRIVÉES, PAS
 * MESURÉES: le rapport de leur plafond de REPAS à celui de l'adulte, appliqué
 * aux bornes de collation adulte (650/700, 450/700, 300/700). C'est écrit ici
 * plutôt que calculé pour que les nombres soient épinglables — mais il faut
 * savoir que ce sont des dérivées, pas des observations.
 */
export const PLATE_MASS_BOUNDS_G = Object.freeze({
  adult: Object.freeze({
    meal: Object.freeze({ min: 250, max: 700 }),
    snack: Object.freeze({ min: 80, max: 300 }),
  }),
  teen: Object.freeze({
    meal: Object.freeze({ min: 250, max: 650 }),
    snack: Object.freeze({ min: 75, max: 280 }),
  }),
  child: Object.freeze({
    meal: Object.freeze({ min: 150, max: 450 }),
    snack: Object.freeze({ min: 50, max: 195 }),
  }),
  toddler: Object.freeze({
    meal: Object.freeze({ min: 100, max: 300 }),
    snack: Object.freeze({ min: 35, max: 130 }),
  }),
});

/** Les moments où l'on s'assied. Les autres sont des collations. */
export const PLATE_MEAL_SLOTS = ["breakfast", "lunch", "dinner"] as const;

export function plateSlotClassOf(slot: string): PlateSlotClass {
  return (PLATE_MEAL_SLOTS as readonly string[]).includes(slot)
    ? "meal"
    : "snack";
}

/**
 * ⛔ L'ÂGE INCONNU REND `adult`, ET LA SOURCE LE DIT. C'est la borne la plus
 * LARGE: se tromper vers l'adulte laisse passer une assiette d'enfant un peu
 * grande, alors que se tromper vers l'enfant RABOTE l'assiette d'un adulte —
 * et un adulte raboté ne mange pas assez, ce qui est le sens d'erreur que ce
 * chantier existe pour fermer. La source est ventilée pour qu'on sache combien
 * de bornes ont été posées sans savoir.
 */
export function plateBandOf(ageYears: number | null): {
  band: PlateBoundBand;
  known: boolean;
} {
  if (ageYears === null || !Number.isFinite(ageYears)) {
    return { band: "adult", known: false };
  }
  if (ageYears < 6) return { band: "toddler", known: true };
  if (ageYears < 12) return { band: "child", known: true };
  if (ageYears < 18) return { band: "teen", known: true };
  return { band: "adult", known: true };
}

/**
 * ⟳ 2026-09-10 — QUI A DÉCIDÉ DU PLAFOND DE MASSE, ET IL EST COMPTÉ.
 *
 * ⛔ SANS CE COMPTEUR, « la table ne mord jamais » et « la table mord partout »
 * rendraient exactement le même objet. C'est la règle du module (« une borne
 * qui mord sur la population entière n'est plus une borne, c'est le calcul »)
 * appliquée à sa propre table.
 *
 *   `target`   la part kcal de ce moment a décidé — le cas nominal;
 *   `table`    la capacité d'estomac de la tranche d'âge a rabattu le plafond;
 *   `no_target`  aucune part lisible: la table est la SEULE source, comme avant
 *                ce lot.
 */
export const PLATE_BOUND_SOURCES = ["target", "table", "no_target"] as const;
export type PlateBoundSource = (typeof PLATE_BOUND_SOURCES)[number];

export interface PlateBounds {
  min: number;
  max: number;
  /**
   * ⟳ 2026-09-10 — LA MASSE VISÉE, AU MILIEU DU COULOIR.
   *
   * ⛔ ELLE N'EST PAS `(min + max) / 2` APRÈS COUP. Elle est calculée AVANT le
   * rabattement par la table, puis ramenée dans `[min, max]`: prendre le milieu
   * des bornes finales ferait dériver la visée à chaque fois que la table mord
   * d'un seul côté, et la visée est ce qu'on DEMANDE au modèle.
   */
  preferred: number;
  /**
   * ⟳ 2026-09-10 — LE FACTEUR D'APPÉTIT RÉELLEMENT APPLIQUÉ ICI.
   *
   * `1` sur un mineur (jamais d'appétit sur un enfant) et sur un moment sans
   * cible. Rendu plutôt que redevinné: un lecteur qui le recalculerait
   * n'aurait pas la garde du mineur.
   */
  appetiteFactor: number;
  /** ⟳ 2026-09-10 — le plancher de densité de ce moment: 1,0, ou 0,6 s'il est léger. */
  densityFloorPerG: number;
  band: PlateBoundBand;
  slotClass: PlateSlotClass;
  /** `age_unknown` quand la bande est le repli adulte. */
  source: "age_known" | "age_unknown";
  /** ⟳ 2026-09-10 — QUI a décidé du plafond. Voir `PLATE_BOUND_SOURCES`. */
  boundSource: PlateBoundSource;
  /**
   * ⟳ 2026-09-10 — LE PLAFOND PHYSIQUE SEUL: la capacité d'estomac de cette
   * tranche d'âge, sans la part kcal.
   *
   * ⛔ DEUX PLAFONDS PARCE QUE CE SONT DEUX QUESTIONS, et les confondre rend
   * l'une des deux circulaire:
   *
   *   `max`         « jusqu'où cette assiette-ci peut grossir avant qu'on
   *                 refuse de la servir » — dérivé de la part, donc il mord
   *                 exactement quand le plat passe sous `MEAL_KCAL_PER_G_FLOOR`
   *                 (c'est la règle de `mealMassCapFor`, écrite en masse);
   *   `physicalMax` « combien cette personne peut avaler en une fois » — la
   *                 table, et rien d'autre.
   *
   * `requiredDensityFor` pose la SECONDE question (« quelle densité faut-il
   * pour que ce besoin tienne dans une assiette ? »). La poser contre `max`
   * rendrait toujours le même nombre — `MEAL_KCAL_PER_G_FLOOR × 100 × marge` —
   * pour tout le monde, c'est-à-dire un brief qui répète et cesse d'être lu.
   * C'est très exactement le « plafond dérivé des kcal est CIRCULAIRE » que le
   * pavé de `PLATE_MASS_BOUNDS_G` met en garde.
   */
  physicalMax: number;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-10 — LA BANDE DE GRAMMES DESCEND DE LA PART KCAL DE CE MOMENT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QUI VIVAIT ICI, ET CE QUE ÇA COÛTAIT ──────────────────────────────
 * `PLATE_MASS_BOUNDS_G[bande d'âge][repas|collation] × APPETITE_FACTORS`. Une
 * table fixe, sans le moindre lien avec ce que cette personne-là doit manger à
 * ce moment-là. Deux conséquences, et elles tiraient en sens contraire:
 *
 *   · un adulte de 55 kg en perte et un adulte de 95 kg en prise recevaient le
 *     MÊME plafond de 700 g au déjeuner — c'est-à-dire aucun plafond pour le
 *     premier, et un plafond qui mord pour le second;
 *   · l'appétit, lui, était appliqué ICI, sur les GRAMMES. Il déplaçait donc la
 *     borne sans déplacer la cible que le facteur poursuit: `sizeDishForMouth`
 *     visait toujours le même nombre de kcal, et la borne se contentait de le
 *     laisser passer un peu plus ou un peu moins. Un cran qui bouge la borne
 *     mais pas la visée ne change rien tant que la borne ne mord pas — et il
 *     retire de la nourriture, sans rien viser, quand elle mord.
 *
 * ── LA RÈGLE, ET ELLE EST CELLE QUE `mealMassCapFor` ÉNONÇAIT DÉJÀ ────────
 * « Le plus gros repas plausible pèse ce que porte son énergie à la densité
 * d'un plat ordinaire. » Les deux densités sont déjà nommées et mesurées dans
 * ce dépôt (`mouth_anchor.ts`), et ce sont elles qui bornent:
 *
 *     max = part kcal / MEAL_KCAL_PER_G_FLOOR      (1,0 — le plat le moins dense)
 *     min = part kcal / MEAL_KCAL_PER_G_COMPOSED   (1,35 — le plat ordinaire)
 *
 * ⛔ ET `PLATE_MASS_BOUNDS_G` RESTE, EN GARDE-FOU, PAS EN SOURCE. C'est une
 * CAPACITÉ D'ESTOMAC: un besoin de 1 200 kcal sur un seul repas ne se sert pas
 * en 1,2 kg d'assiette à un enfant de sept ans, quelle que soit l'arithmétique.
 * Le plafond retenu est donc le PLUS PETIT des deux, et `boundSource` dit
 * lequel a décidé.
 *
 * ⚠️ LE PLANCHER, LUI, NE MONTE JAMAIS AU-DESSUS DE LA TABLE — `Math.min`, et
 * c'est le sens le moins intuitif. `clampToBounds` fait MONTER une assiette
 * sous le plancher (`under_min` ⇒ on sert PLUS que la cible). Un plancher
 * dérivé au-dessus des 250 g de la table forcerait donc à servir plus que la
 * cible à toute assiette un peu dense — c'est-à-dire à défaire, par la borne,
 * le dimensionnement qu'on vient de calculer. La table garde ici son rôle
 * d'origine: « une assiette qui ne ressemble pas à un repas », et rien de plus.
 *
 * ⛔ L'APPÉTIT NE PASSE PLUS PAR ICI, ET C'EST L'AUTRE MOITIÉ DU LOT. Il entre
 * une seule fois, tout en haut, dans l'entretien estimé
 * (`estimatedMaintenanceKcal` → `appetiteFactorOf`), donc il traverse la cible
 * du jour, la part du moment, et cette bande-ci — mécaniquement. Deux couches
 * qui dimensionnent, c'est le double comptage que `meal_envelope.ts` documente
 * en toutes lettres et que ce dépôt a déjà mesuré une fois.
 *
 * @param slotTargetKcal ce que `slotPlanTargets` rend pour CE moment et CETTE
 * bouche — apports fixes déjà retranchés. ⛔ REQUIS ET NULLABLE,
 * jamais `?`: un défaut aurait fait de la table la réponse SILENCIEUSE de tous
 * les appelants, c'est-à-dire aurait laissé ce lot construit et désarmé.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function plateBoundsFor(args: {
  ageYears: number | null;
  slot: string;
  slotTargetKcal: number | null;
  /**
   * ⟳ 2026-09-10 — CE MOMENT EST-IL MARQUÉ « LÉGER » ?
   *
   * ⛔ REQUIS, jamais `?`. Un défaut aurait fait de « normal » la réponse
   * silencieuse de tous les appelants, c'est-à-dire aurait laissé le plancher
   * léger construit et désarmé — le mode d'échec n° 1 de ce dépôt.
   */
  light: boolean;
  /**
   * ⟳ 2026-09-10 — L'APPÉTIT, ET C'EST ICI QU'IL VIT DÉSORMAIS.
   *
   * ⛔ REQUIS ET NULLABLE. `null` = non renseigné = ×1,00, un neutre VRAI.
   */
  appetite: AppetiteLevel | null;
}): PlateBounds {
  const { band, known } = plateBandOf(args.ageYears);
  const slotClass = plateSlotClassOf(args.slot);
  const table = PLATE_MASS_BOUNDS_G[band][slotClass];
  const kcal = Number(args.slotTargetKcal);
  // ⛔ PAS D'APPÉTIT SUR UN MINEUR. La table pédiatrique est une capacité
  // d'estomac d'enfant; l'élargir de 10 % parce qu'il « mange bien » servirait
  // une assiette d'adulte à un corps qui n'en est pas un. Le chemin
  // pédiatrique garde son propre facteur, sur l'ÉNERGIE, et il ne peut que
  // monter (`childAppetiteFactor`).
  const isMinor = band === "child" || band === "toddler" || band === "teen";
  const densityFloorPerG = args.light
    ? LIGHT_MEAL_KCAL_PER_G_FLOOR
    : MEAL_KCAL_PER_G_FLOOR;
  if (args.slotTargetKcal === null || !Number.isFinite(kcal) || kcal <= 0) {
    return {
      min: table.min,
      max: table.max,
      preferred: Math.round((table.min + table.max) / 2),
      appetiteFactor: 1,
      densityFloorPerG,
      band,
      slotClass,
      source: known ? "age_known" : "age_unknown",
      boundSource: "no_target",
      physicalMax: table.max,
    };
  }
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-10 — LE COULOIR DE MASSE, EN TROIS TEMPS
  // ══════════════════════════════════════════════════════════════════════
  //
  //   ① `b` — ce que la PART KCAL autorise, rabattu par la table:
  //        bmin = min(E / 1,35 ; table.min)     le plat ordinaire
  //        bmax = min(E / ρ    ; table.max)     ρ = 1,0, ou 0,6 si léger
  //   ② `A` — l'appétit, appliqué aux DEUX bornes, jamais à l'énergie;
  //   ③ le rabattement final par la table: l'appétit ne fait pas grossir un
  //      estomac. `Gmax = min(A × bmax ; table.max)`.
  //
  // ⛔ LA VISÉE SE CALCULE SUR `b`, PAS SUR `G`. `A × (bmin + bmax) / 2` puis
  // ramenée dans `[Gmin, Gmax]`: prendre le milieu des bornes FINALES ferait
  // dériver la visée chaque fois que la table mord d'un seul côté — et la
  // visée est très exactement ce qu'on demande au modèle.
  // ⚠️ LES DEUX FORMES SONT GARDÉES, ET C'EST CE QUI FAIT PARLER `boundSource`.
  // `…Raw` est ce que la PART demande; `b…` est ce qui reste après la table.
  // Sans la brute, comparer « le plafond final » à « le plafond dérivé » revient
  // à comparer un nombre à lui-même: la table aurait mordu sans jamais se dire.
  const bMaxRaw = kcal / densityFloorPerG;
  const bMinRaw = kcal / MEAL_KCAL_PER_G_COMPOSED;
  const bMax = Math.min(bMaxRaw, table.max);
  const bMin = Math.min(bMinRaw, table.min);
  const appetiteFactor = isMinor ? 1 : appetiteFactorOf(args.appetite).factor;
  const gMax = Math.min(appetiteFactor * bMax, table.max);
  const gMin = Math.min(appetiteFactor * bMin, gMax);
  const gPref = Math.min(
    Math.max(appetiteFactor * ((bMin + bMax) / 2), gMin),
    gMax,
  );
  return {
    min: Math.round(gMin),
    max: Math.round(gMax),
    preferred: Math.round(gPref),
    appetiteFactor,
    densityFloorPerG,
    band,
    slotClass,
    source: known ? "age_known" : "age_unknown",
    // ⚠️ LE MOTIF SE LIT SUR LA BORNE NON ARRONDIE, et l'appétit en fait
    // partie: c'est bien la TABLE qui décide quand `A × bmax` la dépasse.
    boundSource: gMax < appetiteFactor * bMaxRaw ? "table" : "target",
    physicalMax: table.max,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ bis — LE COULOIR DE DENSITÉ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LA DENSITÉ QU'UNE ASSIETTE DOIT AVOIR POUR QUE SA MASSE TIENNE DANS SES DEUX
 * BORNES — les deux bouts, et la visée.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ POURQUOI DEUX BOUTS, ET PAS UN PLANCHER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Mesuré au tir SPLICE3 (2026-09-08): un adulte en perte de gras SOUS son
 * plancher d'assiette au petit-déjeuner a reçu, en consigne, « reste sous 145
 * kcal/100 g » — et un bouillon à **57,8** est revenu. Son assiette est passée
 * de trop petite à trop grosse. « Reste sous N » sans plancher laisse le modèle
 * diluer sans limite; « au moins N » sans plafond le laisse concentrer sans
 * limite. Les deux erreurs sont la même erreur.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * L'ARITHMÉTIQUE, ET ELLE EST LA MÊME QUE CELLE DU DIMENSIONNEMENT
 * ══════════════════════════════════════════════════════════════════════════
 *
 *     Dmin  = 100 × E / Gmax      sous Dmin, l'assiette dépasse son plafond
 *     Dmax  = 100 × E / Gmin      au-dessus, la part tient dans trois cuillères
 *     Dpréf = 100 × E / Gpréf     la visée, toujours à l'intérieur
 *
 * C'est `étape 10` (« cible ÷ densité ») écrite à l'envers, dite AVANT la
 * composition au lieu d'après. Elle ne coûte pas un appel.
 *
 * ⚠️ `E` EST L'ÉNERGIE À COMPOSER, apports fixes déjà retranchés — la même que
 * `slotPlanTargets` rend. Une seconde arithmétique de la cible d'un moment
 * ferait annoncer au modèle une densité que le moteur ne demanderait pas.
 *
 * ⛔ LE PLAFOND DE DEMANDE MORD SUR LES DEUX BORNES, ET IL SE NOMME. Un besoin
 * au-dessus de `MAX_ASKABLE_DENSITY_PER_100G` ne fait pas taire le couloir: il
 * le rabat à ce qui est tenable et pose `incompatible`, en gardant
 * `neededMinPer100G`. Un minimum tronqué en silence apprendrait au modèle que
 * ces nombres-là sont décoratifs — mesuré (389 demandés, 126,7 rendus).
 *
 * PURE: no I/O, no clock, no randomness.
 */
export interface DensityCorridor {
  minPer100G: number;
  maxPer100G: number;
  preferredPer100G: number;
  /** Le besoin AVANT le plafond de demande. Égal à `minPer100G` sans plafond. */
  neededMinPer100G: number;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-11 · LOT B — `100 × E / Gpréf`: CE QUE LA CIBLE IMPLIQUERAIT.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ IL N'EST PAS LA CONSIGNE. `preferredPer100G` reste `Dmin × REPAIR_DENSITY_
   * HEADROOM`, projeté dans le couloir, et il ne bouge pas. La substitution a
   * été demandée (chantier, lot C.4) et elle est REFUSÉE par un arbitrage
   * mesuré — **A15**, `docs/keel/CHANTIER-DENSITE-PORTIONS-ET-FAST.md:573`:
   * `100 × E / Gpréf` rend **236 kcal/100 g** sur un déjeuner de 1 120 kcal,
   * alors que les plats réels de ce dépôt vivent entre **113 et 156**; on a
   * mesuré **389 demandés au dîner et 126,7 rendus**, consigne ignorée. Revenir
   * à cette formule réintroduirait un défaut déjà payé.
   *
   * ⚠️ CE QU'ON RETIENT DE LA DEMANDE, C'EST LE MOT « SILENCIEUSEMENT ». Les
   * deux nombres sortent donc côte à côte, et `anchorDivergencePer100G` dit de
   * combien ils s'écartent. Rien n'est substitué en silence, et la mesure qui a
   * fondé A15 n'est pas jetée.
   */
  targetAnchoredPer100G: number;
  /**
   * `targetAnchoredPer100G − preferredPer100G`, signé. `0` quand les deux
   * coïncident. ⛔ C'EST LE COMPTEUR DE DIVERGENCE, et il est PAR APPEL parce
   * que ce module est pur: l'appelant l'agrège (une somme, un maximum, un
   * histogramme) et le journalise. Un compteur global vivant ici ferait de
   * `densityCorridorFor` une fonction à mémoire, donc à deux réponses pour la
   * même entrée.
   */
  anchorDivergencePer100G: number;
  incompatible: DensityIncompatibility | null;
}

export function densityCorridorFor(args: {
  targetKcal: number | null;
  bounds: PlateBounds;
}): DensityCorridor | null {
  const kcal = Number(args.targetKcal);
  if (args.targetKcal === null || !Number.isFinite(kcal) || kcal <= 0) {
    return null;
  }
  const { min: gMin, max: gMax, preferred: gPref } = args.bounds;
  if (!(gMax > 0) || !(gMin > 0)) return null;
  const neededMin = (kcal / gMax) * 100;
  const rawMax = (kcal / gMin) * 100;
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ LA VISÉE N'EST PAS LE MILIEU DU COULOIR, ET C'EST MESURÉ
  // ══════════════════════════════════════════════════════════════════════
  //
  // `100 × E / Gpréf` — la densité de l'assiette de masse moyenne — donne des
  // nombres INTENABLES dès que le besoin est grand: sur un déjeuner de
  // 1 120 kcal, `Gpréf` vaut 475 g et la visée **236 kcal/100 g**. Or les plats
  // réels mesurés par ce dépôt vivent entre **113 et 156**; un gratin fait 180,
  // des lasagnes 150. On aurait redemandé exactement ce que
  // `MAX_ASKABLE_DENSITY_PER_100G` existe pour empêcher — et ce qui a été
  // mesuré: 389 demandés au dîner, **126,7 rendus**, la consigne ignorée.
  //
  // ⚠️ ET LE MILIEU EST FAUX DANS SA DIRECTION. Quand la masse plafonne, on
  // VEUT la grande assiette: moins dense, plus facile à composer, et c'est
  // exactement ce que `Dmin` décrit. La visée doit donc partir du BAS du
  // couloir, pas de son centre.
  //
  // Ce qui reste utile d'une marge, c'est d'éloigner de la borne: viser le
  // strict minimum revient à demander d'échouer, le moindre arrondi remettant
  // le plat dehors. D'où `Dmin × REPAIR_DENSITY_HEADROOM`, **projeté dans le
  // couloir** — la marge est intérieure, elle ne déplace plus la cible au-delà.
  //
  // ⚠️ `bounds.preferred` (une MASSE) garde, lui, le milieu de `[bmin, bmax]`:
  // les deux répondent à deux questions différentes — « quelle assiette vise-
  // t-on » et « quelle densité DEMANDE-T-ON à un modèle qui rend ±23 à +63 % ».
  const rawPref = neededMin * REPAIR_DENSITY_HEADROOM;

  const cap = MAX_ASKABLE_DENSITY_PER_100G;
  const incompatible: DensityIncompatibility | null = neededMin > cap
    ? "above_askable_cap"
    : null;
  // ⛔ L'ARRONDI EST DIRIGÉ, ET DANS LE SENS QUI GARDE LE COULOIR HABITABLE.
  // Le plancher monte (`ceil`), le plafond descend (`floor`): l'inverse
  // élargirait la consigne d'un kcal de chaque côté à chaque tour, et la
  // consigne finirait par ne plus rien exiger.
  const minPer100G = Math.min(cap, Math.ceil(neededMin));
  const maxPer100G = Math.max(minPer100G, Math.min(cap, Math.floor(rawMax)));
  const preferredPer100G = Math.min(
    maxPer100G,
    Math.max(minPer100G, Math.round(rawPref)),
  );
  // ⟳ 2026-09-11 · LOT B — LE NOMBRE QUE LA CIBLE IMPLIQUERAIT, RENDU BRUT.
  // ⛔ NI RABATTU DANS LE COULOIR, NI PLAFONNÉ PAR `MAX_ASKABLE_DENSITY_PER_100G`:
  // c'est un TÉMOIN, pas une consigne. Le projeter le rendrait indiscernable de
  // `preferredPer100G` exactement dans les cas où il diverge le plus — les
  // grandes cibles, c'est-à-dire ceux qui ont fondé A15.
  const targetAnchoredPer100G = Math.round((kcal / gPref) * 100);
  return {
    minPer100G,
    maxPer100G,
    preferredPer100G,
    neededMinPer100G: Math.ceil(neededMin),
    targetAnchoredPer100G,
    anchorDivergencePer100G: targetAnchoredPer100G - preferredPer100G,
    incompatible,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ LE DIMENSIONNEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LE FACTEUR D'UN PLAT QU'ON NE SAIT PAS MESURER.
 *
 * ⛔ `1`, C'EST-À-DIRE « LA RECETTE TELLE QUELLE ». Pas zéro (qui retirerait le
 * plat), pas une moyenne (qui inventerait une mesure). Un plat dont on ignore
 * l'énergie est servi tel que le modèle l'a écrit, et c'est COMPTÉ.
 */
export const UNMEASURABLE_PORTION_FACTOR = 1;

/**
 * LA TOLÉRANCE AU-DESSOUS DE LAQUELLE UNE LIGNE DE COURSES NE SE RÉÉCRIT PAS.
 *
 * ⚠️ ELLE EXISTAIT DÉJÀ EN DUR (`Math.abs(f - 1) <= 0.02`) dans le bloc des
 * courses; elle est nommée ici parce que le lot 4 la fait mordre sur une
 * population NEUVE — jusqu'ici seule une casserole qui grossit ou rétrécit
 * touchait la liste, maintenant chaque plan `portion_v1` la traverse.
 *
 * ⛔ 2 % SUR UNE LIGNE DE COURSES, PAS SUR UNE ASSIETTE. Réécrire « 1 kg de riz »
 * en « 1,01 kg » est du bruit qu'un humain lit comme une erreur; l'écart réel
 * qu'on veut suivre est celui d'un plan multiplié par 0,8 ou 1,6.
 */
export const SHOPPING_RESCALE_TOLERANCE = 0.02;

/**
 * ⟳ LU AU LOT 6. Sous plancher TCA (`restriction: "raised"`), la cible du jour
 * devient l'ENTRETIEN au lieu de se fermer. Le dimensionnement d'une assiette
 * n'est pas un conseil de perte de poids: refuser de dimensionner ne protège
 * personne, ça sert juste une assiette au hasard. La constante existe dès
 * maintenant pour que le lot 6 soit un branchement, pas une décision.
 */
export const RESTRICTION_FLOOR_SIZES_MAINTENANCE = true;

export const SIZING_VERDICTS = [
  "in_bounds",
  "over_max",
  "under_min",
  "unmeasurable",
] as const;
export type SizingVerdict = (typeof SIZING_VERDICTS)[number];

export interface SizedDish {
  factor: number;
  /** La masse servie à cette personne, après facteur. `null` si non mesurable. */
  personCookedG: number | null;
  verdict: SizingVerdict;
  /** Les kcal que la borne empêche de servir. `0` quand elle ne mord pas. */
  unmetKcal: number;
}

/**
 * facteur = cible du moment ÷ kcal de la part standard.
 *
 * ⛔ AUCUNE BORNE N'EST APPLIQUÉE ICI. `sizeDishForMouth` rend le facteur NU et
 * le verdict; `clampToBounds` raboté est un geste séparé et compté. Les fondre
 * rendrait impossible de savoir combien de fois la borne a mordu — et « la
 * borne mord toujours » est indistinguable de « la borne ne mord jamais » si
 * personne ne compte.
 */
export function sizeDishForMouth(args: {
  standard: StandardPortion;
  targetKcal: number | null;
  bounds: PlateBounds;
}): SizedDish {
  const { standard, targetKcal, bounds } = args;
  if (
    standard.kcal === null || !(standard.kcal > 0) ||
    targetKcal === null || !(targetKcal > 0)
  ) {
    return {
      factor: UNMEASURABLE_PORTION_FACTOR,
      personCookedG: standard.cookedG,
      verdict: "unmeasurable",
      unmetKcal: 0,
    };
  }
  const factor = targetKcal / standard.kcal;
  const cooked = standard.cookedG === null ? null : standard.cookedG * factor;
  let verdict: SizingVerdict = "in_bounds";
  if (cooked !== null) {
    if (cooked > bounds.max) verdict = "over_max";
    else if (cooked < bounds.min) verdict = "under_min";
  }
  return {
    factor,
    personCookedG: cooked === null ? null : Math.round(cooked),
    verdict,
    unmetKcal: 0,
  };
}

/**
 * LA BORNE, APPLIQUÉE — et ce qu'elle coûte, en kcal, dit à voix haute.
 *
 * ⚠️ `unmetKcal` EST LE PRIX DE LA BORNE, et il n'est jamais nul quand elle
 * mord. Une assiette rabotée à 700 g pour quelqu'un qui avait besoin de 900 g
 * de nourriture est une décision: elle ne le nourrit pas. Ce dépôt a déjà payé
 * deux bornes silencieuses (`ANCHOR_FACTOR_MAX`, `BOX_FACTOR_MIN`).
 *
 * ⚠️ `under_min` MONTE le facteur, et c'est le sens le moins intuitif: une
 * assiette au-dessous du plancher n'est pas une assiette qu'on économise, c'est
 * une assiette qui ne ressemble pas à un repas. `unmetKcal` y est NÉGATIF —
 * on sert PLUS que la cible — et il est compté à part.
 */
export function clampToBounds(args: {
  sized: SizedDish;
  standard: StandardPortion;
  bounds: PlateBounds;
}): SizedDish {
  const { sized, standard, bounds } = args;
  if (sized.verdict === "in_bounds" || sized.verdict === "unmeasurable") {
    return sized;
  }
  if (standard.cookedG === null || !(standard.cookedG > 0)) return sized;
  const limit = sized.verdict === "over_max" ? bounds.max : bounds.min;
  const factor = limit / standard.cookedG;
  const lostKcal = standard.kcal === null
    ? 0
    : Math.round((sized.factor - factor) * standard.kcal);
  return {
    factor,
    personCookedG: limit,
    verdict: sized.verdict,
    unmetKcal: lostKcal,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ④ bis — PLUSIEURS MANGEURS SUR LA MÊME RECETTE (lot 10)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ UNE RECETTE, N FACTEURS. C'est toute la différence entre le solo et la
// table, et il n'y en a pas d'autre: chaque mangeur d'un plat a SA cible de
// moment, donc SON facteur sur la MÊME part standard. Rien dans le calcul
// d'un facteur ne regarde les autres mangeurs.
//
// ⚠️ ET SURTOUT PAS UNE MOYENNE. Servir à quatre personnes la moyenne de leurs
// besoins, c'est le défaut que tout ce chantier existe pour retirer — la
// portion unique que le modèle écrivait, sous un autre nom.

/**
 * LE PLAFOND DE BOUCHES QUE CETTE LANE SERT — nommé, plus déduit.
 *
 * ⚠️ C'EST LE `Math.min(12, …)` DE `presence.servings`, et il vivait en
 * littéral à quatre endroits de la lane. Le nommer ici ne change aucun
 * comportement; il donne à la bascule du lot 14 une constante à bouger, et à
 * `sizingPathFor` une borne haute qui ne soit pas un nombre nu.
 */
export const HOUSEHOLD_MAX_MOUTHS = 12;

/**
 * LE DIMENSIONNEMENT TOURNE-T-IL EN OMBRE À PLUSIEURS BOUCHES ?
 *
 * ⛔ « EN OMBRE » VEUT DIRE: calculé, journalisé, JAMAIS POSÉ. Les grammes
 * servis restent ceux du modèle, `applied: false`, et le chemin de la lane
 * reste `legacy_measure`. C'est la seule façon de comparer ce que le moteur
 * ferait à ce que le modèle fait, sur les MÊMES plans, sans variance de modèle
 * entre les deux — la leçon « journaliser le contrefactuel, pas deux runs ».
 *
 * ⚠️ À `false`, tout le bloc s'éteint et la lane redevient octet pour octet
 * celle d'avant le lot. C'est le retour arrière du lot 10, et il tient en une
 * constante.
 */
export const SHADOW_SIZING_AT_N = true;

/** Ce qu'un mangeur apporte à la table de calcul d'un plat. */
export interface EaterAtDish {
  memberId: string;
  /**
   * LE SEAU DU JOURNAL — jamais un `member_id` à côté d'un kcal.
   * `adult_fat_loss`, `minor_6_11`, `age_unknown`… L'appelant le nomme; ce
   * module ne fait que le recopier sur la ligne.
   */
  bucket: string;
  /** Sa cible pour CE moment, extras et apports fixes déjà retranchés. */
  targetKcal: number | null;
  bounds: PlateBounds;
}

export interface SizedForEater extends SizedDish {
  memberId: string;
  bucket: string;
}

/**
 * UNE RECETTE, UN FACTEUR PAR MANGEUR.
 *
 * ⛔ AUCUNE BORNE N'EST APPLIQUÉE ICI, exactement comme `sizeDishForMouth`
 * dont c'est la boucle: le facteur sort NU, le verdict l'accompagne, et
 * `clampToBounds` est un geste séparé et compté. Les fondre rendrait
 * impossible de savoir combien de fois la borne a mordu, et sur qui.
 *
 * ⚠️ UN MANGEUR SANS CIBLE NE BLOQUE PAS LA TABLE. Il reçoit
 * `UNMEASURABLE_PORTION_FACTOR` — la recette telle quelle — et il est compté.
 * Refuser de dimensionner tout le plat parce qu'une bouche n'a pas de corps
 * priverait les trois autres d'une portion juste, au nom de la quatrième.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function sizeDishForEaters(args: {
  standard: StandardPortion;
  eaters: readonly EaterAtDish[];
}): SizedForEater[] {
  return args.eaters.map((e) => ({
    memberId: e.memberId,
    bucket: e.bucket,
    ...sizeDishForMouth({
      standard: args.standard,
      targetKcal: e.targetKcal,
      bounds: e.bounds,
    }),
  }));
}

/**
 * LE FACTEUR D'UNE CASSEROLE QUAND PLUSIEURS MANGEURS TIRENT SUR ELLE.
 *
 * ⛔ ON SOMME SUR LES MANGEURS D'UN PLAT, PUIS ON MOYENNE SUR LES PLATS. Les
 * deux opérations disent deux choses différentes et ne commutent pas:
 *
 *     un plat qui nourrit 4 bouches réclame la SOMME de leurs 4 parts;
 *     une casserole tirée par 3 plats a été écrite pour 3 tirages.
 *
 * D'où `Σ_plats (Σ_mangeurs f) ÷ nombre de tirages`, c'est-à-dire exactement
 * `potFactorOf` appliqué aux SOMMES PAR PLAT. Passer les facteurs à plat
 * moyennerait sur les (plat × mangeur) et diviserait la casserole par le
 * nombre de bouches — quatre personnes recevraient le quart de ce qu'il faut.
 *
 * ⚠️ LA CONTRE-ÉPREUVE: une bouche par plat rend `Σf / n`, qui est
 * `potFactorOf` mot pour mot. Le chemin solo ne bouge pas.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function potFactorAcross(
  perDishEaterFactors: readonly (readonly number[])[],
): number {
  return potFactorOf(
    perDishEaterFactors.map((fs) => fs.reduce((a, b) => a + b, 0)),
  );
}

export const LID_KINDS = ["own", "tub"] as const;
export type LidKind = (typeof LID_KINDS)[number];

export interface LidPlan {
  /** Les couvercles à UN nom, et le facteur qui écrit leurs grammes. */
  own: { memberId: string; factor: number }[];
  /**
   * LE BAC PARTAGÉ, ou `null`. Son total est la SOMME des parts de ses
   * mangeurs — jamais une moyenne, jamais une division.
   */
  tub: { memberIds: string[]; factorSum: number } | null;
}

/**
 * QUI A UNE BOÎTE À SON NOM, ET QUI PARTAGE UN BAC.
 *
 * ⛔ LA RÈGLE PRODUIT EST INCHANGÉE, ET ELLE EST APPELÉE, PAS RECOPIÉE: un
 * objectif de poids ouvre une portion millimétrée (`weighedPortionMembers`,
 * `household_portions.ts`), rien d'autre ne la demande. Ce module reçoit
 * l'ensemble déjà résolu — le recalculer ici ferait deux lectures d'une même
 * décision produit.
 *
 * ⚠️ UN SEUL MANGEUR DANS LE BAC REÇOIT UNE BOÎTE À SON NOM, PAS UN BAC D'UN.
 * Deux raisons, et la seconde est mesurable: un contenant à un nom veut dire
 * « c'est ta portion » (v4), donc un bac d'un mentirait sur ses propres
 * grammes; et l'écran lit `memberIds.length > 1` pour dire « partagé », donc un
 * bac d'un s'afficherait comme un plat commun pour une personne seule.
 *
 * ⚠️ LES GRAMMES NE SONT PAS ÉCRITS ICI. Ce module rend des FACTEURS et des
 * noms; `applySizing` en fait des items. Séparer les deux est ce qui permet au
 * lot 10 de tourner en ombre sans toucher un plat.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function lidPlanFor(args: {
  rows: readonly SizedForEater[];
  /** Les bouches à qui un objectif de poids ouvre une boîte à elles. */
  weighed: ReadonlySet<string>;
}): LidPlan {
  const own: { memberId: string; factor: number }[] = [];
  const shared: SizedForEater[] = [];
  for (const r of args.rows) {
    if (args.weighed.has(r.memberId)) {
      own.push({ memberId: r.memberId, factor: r.factor });
    } else shared.push(r);
  }
  // ⛔ VOIR LE PAVÉ: un bac d'un nom n'existe pas.
  if (shared.length === 1) {
    own.push({ memberId: shared[0].memberId, factor: shared[0].factor });
    return { own: sortLids(own), tub: null };
  }
  if (shared.length === 0) return { own: sortLids(own), tub: null };
  return {
    own: sortLids(own),
    tub: {
      memberIds: shared.map((r) => r.memberId).sort(),
      factorSum: shared.reduce((a, r) => a + r.factor, 0),
    },
  };
}

function sortLids(
  lids: { memberId: string; factor: number }[],
): { memberId: string; factor: number }[] {
  return lids.sort((a, b) => a.memberId.localeCompare(b.memberId));
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LES COMPTEURS — TOUS PRÉSENTS, MÊME À ZÉRO
// ═══════════════════════════════════════════════════════════════════════════

export interface SizingCounters {
  dishes: number;
  measured: number;
  unmeasurable_by: Record<string, number>;
  verdicts: Record<SizingVerdict, number>;
  bounds_source: Record<"age_known" | "age_unknown", number>;
  clamped: { max: number; min: number };
  unmet_band: { lt_200: number; gte_200: number };
  pot_ingredients_without_amount: number;
}

/**
 * ⛔ TOUTES LES CLÉS, MÊME À ZÉRO. Un compteur absent et un compteur à zéro se
 * relisent pareil dans un journal, et ne veulent pas du tout dire la même chose:
 * « aucun plat n'a débordé » et « le comptage n'est pas branché » sont
 * exactement le genre de paire que ce dépôt confond en boucle.
 */
export function sizingCounters(): SizingCounters {
  return {
    dishes: 0,
    measured: 0,
    unmeasurable_by: {},
    verdicts: { in_bounds: 0, over_max: 0, under_min: 0, unmeasurable: 0 },
    bounds_source: { age_known: 0, age_unknown: 0 },
    clamped: { max: 0, min: 0 },
    unmet_band: { lt_200: 0, gte_200: 0 },
    pot_ingredients_without_amount: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ L'APPLICATION — lot 4
// ═══════════════════════════════════════════════════════════════════════════

/** Ce que `applySizing` a fait, compté. Toutes les clés, même à zéro. */
export interface ApplyCounts {
  boxes_authored: number;
  /** Plats sans facteur mesurable: la recette part telle quelle, aucune boîte. */
  dishes_unsized: number;
  fresh_scaled: number;
  /** Ingrédient frais dont la quantité n'est qu'en prose: pas d'item de boîte. */
  fresh_unweighed: number;
  pots_scaled: number;
  pots_unreadable: number;
  servings_rewritten: number;
  /** Items écartés parce que le référentiel ne les résout pas. */
  items_unresolved: number;
  /** ⟳ LOT 12 — les couvercles à UN nom (objectif de poids, ou seul mangeur). */
  own_authored: number;
  /** ⟳ LOT 12 — les bacs partagés. Leur total est la SOMME des parts. */
  tubs_authored: number;
  /** ⟳ LOT 12 — les mangeurs non dimensionnés sur un plat pourtant mesuré. */
  eaters_unsized: number;
}

export function applyCounts(): ApplyCounts {
  return {
    boxes_authored: 0,
    dishes_unsized: 0,
    fresh_scaled: 0,
    fresh_unweighed: 0,
    pots_scaled: 0,
    pots_unreadable: 0,
    servings_rewritten: 0,
    items_unresolved: 0,
    own_authored: 0,
    tubs_authored: 0,
    eaters_unsized: 0,
  };
}

/**
 * LE FACTEUR D'UNE CASSEROLE = Σ DES FACTEURS DE SES TIRAGES ÷ LE NOMBRE DE TIRAGES.
 *
 * ⛔ ET PAS « Σ DES FACTEURS », que le plan de chantier écrivait. La démonstration
 * tient en trois lignes, et se trompe d'un facteur `n` si on la saute:
 *
 *     la recette écrite `R` sert `n` tirages, donc UN tirage vaut `R / n`;
 *     le plat `i`, multiplié par `fᵢ`, en réclame `(R / n) × fᵢ`;
 *     la casserole doit donc contenir `Σᵢ (R / n) × fᵢ` = `R × (Σfᵢ) / n`.
 *
 * Avec `Σfᵢ` on cuisinerait `n` fois trop — sur trois plats à facteur 1, une
 * casserole de trois portions deviendrait neuf. ⚠️ Et le cas où tous les
 * facteurs valent `f` rend `n·f / n = f`, ce qui est la contre-épreuve: le
 * chemin nominal ne bouge pas.
 */
export function potFactorOf(factors: readonly number[]): number {
  if (factors.length === 0) return 1;
  return factors.reduce((a, b) => a + b, 0) / factors.length;
}

/**
 * ⟳ LOT A (2026-09-11) — L'ITEM DE CONTENANT QUE LE MOTEUR ÉCRIT.
 *
 * ⚠️ DÉCLARÉ ICI ET PAS IMPORTÉ DE `meal_generation.ts` (`BoxItem`): ce module
 * est pur et ne dépend pas du parseur. La forme est structurellement celle de
 * `BoxItem`, et le typecheck du handler le prouve à chaque affectation.
 */
interface SizedBoxItem {
  preparationId: string | null;
  term: string;
  grams: number;
  ref: string | null;
  refRefused: boolean;
}

interface ScalableIngredient {
  term: string;
  quantity?: string | null;
  amount?: number | null;
  unit?: string | null;
  state?: string | null;
  gramsRaw?: number | null;
  /**
   * ⟳ LOT A (2026-09-11) — NOMMÉS malgré l'index de signature ci-dessous, parce
   * que `itemsAt` les RECOPIE dans l'item de contenant qu'il écrit. Sous
   * `[k: string]: unknown` ils se liraient `unknown`, et le lot deviendrait un
   * `as` sur un type étranger — la cicatrice `as-cast-on-foreign-type-disarms-
   * typecheck`, mot pour mot.
   */
  ref?: string | null;
  refRefused?: boolean;
  [k: string]: unknown;
}

/**
 * ⚠️ SEUL `amount` EST MIS À L'ÉCHELLE — jamais la prose, jamais `gramsRaw`.
 *   · la PROSE (`quantity`) n'est lue qu'en dernier recours par
 *     `resolveIngredients`, et « 1 pincée de sel » ne se multiplie pas;
 *   · `gramsRaw` est un CACHE que `regramMeal` recalcule depuis `amount` juste
 *     après. Le toucher ici ferait deux sources pour un seul nombre, et c'est
 *     celle qu'on regarde le moins qui garderait l'ancienne.
 */
function scaleIngredients<T extends ScalableIngredient>(
  ingredients: readonly T[],
  factor: number,
): { out: T[]; scaled: number; unweighed: number } {
  let scaled = 0;
  let unweighed = 0;
  const out = ingredients.map((ing) => {
    if (
      typeof ing.amount === "number" && Number.isFinite(ing.amount) &&
      ing.amount > 0
    ) {
      scaled++;
      return { ...ing, amount: ing.amount * factor };
    }
    unweighed++;
    return { ...ing };
  });
  return { out, scaled, unweighed };
}

/** La masse SERVIE d'un seul ingrédient, par l'arithmétique du moteur. */
function readyGramsOfOne(
  index: CompositionIndex,
  ing: ScalableIngredient,
): number | null {
  const g = weighedReadyGrams([ing as never], index);
  return g === null || !(g > 0) ? null : g;
}

export interface SizingRowForApply {
  /** L'index du plat dans `meal.dishes`. */
  dishIndex: number;
  factor: number;
  /** `false` quand le plat n'a pas pu être mesuré: aucune boîte, aucun facteur. */
  sized: boolean;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE MOTEUR AUTORE LES BOÎTES, MULTIPLIE LE FRAIS ET LES CASSEROLES — lot 4
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ IL RETOURNE DES COPIES. Muter le plan en place ferait dépendre le résultat
 * de l'ordre d'appel, et ce module promet d'être pur.
 *
 * ⛔ AUCUN TERME NEUF. Chaque item de boîte vient soit d'une casserole que le
 * plat TIRE, soit d'un ingrédient que le plat PORTE. Le moteur ne met jamais
 * dans une boîte quelque chose que personne n'a écrit — c'est l'invariant du
 * chantier, et un test le tient.
 *
 * ⚠️ LA BOÎTE EST UNE PRESCRIPTION, PAS UN BAC. Un seul `memberId` dedans: à
 * une bouche, « le contenant EST sa portion » (v4). Le jour où la borne monte,
 * c'est ce point-là qu'il faudra rouvrir — plusieurs noms font basculer la
 * lecture des grammes vers « quantité de bac », et l'écran change de phrase.
 */
export interface EaterRowForApply {
  /** L'index du plat dans `meal.dishes`. */
  dishIndex: number;
  memberId: string;
  factor: number;
  /** `false` quand ce mangeur n'a pas pu être dimensionné sur ce plat. */
  sized: boolean;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE MOTEUR AUTORE LES COUVERCLES DE TOUTE LA TABLE — lot 12
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ UNE RECETTE, N PARTS, ET LA CASSEROLE EST LEUR SOMME. C'est la seule
 * différence avec le chemin solo, et elle porte tout le reste:
 *
 *     part d'un mangeur  = recette × SON facteur
 *     frais d'un plat    = recette × Σ des facteurs de SES mangeurs
 *     casserole          = recette × Σ_plats (Σ_mangeurs f) ÷ tirages
 *
 * ⚠️ LE FRAIS SE MULTIPLIE PAR LA SOMME, PAS PAR UN FACTEUR MOYEN. Un plat qui
 * nourrit quatre personnes doit CONTENIR quatre parts; le multiplier par la
 * moyenne rendrait une casserole pour une personne et trois assiettes vides.
 *
 * ⛔ AUCUN TERME NEUF, comme au solo: chaque item vient d'une casserole que le
 * plat TIRE ou d'un ingrédient qu'il PORTE.
 *
 * ⚠️ LES COUVERCLES SUIVENT L'OBJECTIF, ET LA RÈGLE EST APPELÉE, PAS RECOPIÉE
 * (`lidPlanFor` → `weighedPortionMembers`). Un mangeur seul au bac reçoit une
 * boîte à son nom: un bac d'un nom mentirait sur ses propres grammes, et
 * l'écran lit `memberIds.length > 1` pour dire « partagé ».
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function applySizingForEaters(args: {
  meal: {
    // deno-lint-ignore no-explicit-any
    dishes: readonly any[];
    // deno-lint-ignore no-explicit-any
    preparations: readonly any[];
  };
  rows: readonly EaterRowForApply[];
  /** Les bouches à qui un objectif de poids ouvre une boîte à elles. */
  weighed: ReadonlySet<string>;
  index: CompositionIndex;
  // deno-lint-ignore no-explicit-any
}): { dishes: any[]; preparations: any[]; counts: ApplyCounts } {
  const counts = applyCounts();
  const byDish = new Map<number, EaterRowForApply[]>();
  for (const r of args.rows) {
    byDish.set(r.dishIndex, [...(byDish.get(r.dishIndex) ?? []), r]);
  }
  /** La somme des facteurs des mangeurs d'un plat. Non dimensionné ⇒ 1. */
  const dishSum = (i: number): number => {
    const rows = byDish.get(i) ?? [];
    if (rows.length === 0) return 1;
    return rows.reduce(
      (a, r) => a + (r.sized ? r.factor : UNMEASURABLE_PORTION_FACTOR),
      0,
    );
  };

  // ── ① LES TIRAGES, ET LE FACTEUR DE CHAQUE CASSEROLE ────────────────────
  // ⛔ UNE ENTRÉE PAR TIRAGE, PORTANT LA SOMME DES MANGEURS DE CE PLAT. C'est
  // `potFactorAcross` écrit en place: moyenner les facteurs à plat diviserait
  // la casserole par le nombre de bouches.
  const factorsByPot = new Map<string, number[]>();
  const drawsByPot = new Map<string, number>();
  args.meal.dishes.forEach((d, i) => {
    const sum = dishSum(i);
    for (const u of d.uses ?? []) {
      const id = String(u?.preparationId ?? "");
      if (!id) continue;
      drawsByPot.set(id, (drawsByPot.get(id) ?? 0) + 1);
      factorsByPot.set(id, [...(factorsByPot.get(id) ?? []), sum]);
    }
  });

  // ── ② LES CASSEROLES ────────────────────────────────────────────────────
  const potReadyPerDraw = new Map<string, number | null>();
  const preparations = args.meal.preparations.map((p) => {
    const id = String(p.id ?? "");
    const draws = drawsByPot.get(id) ?? 0;
    // ⟳ 2026-09-11 · LOT B — LA MÊME MESURE QUE LE DIMENSIONNEMENT. Avant ce
    // lot, `applySizing` mesurait chaque casserole SÉPARÉMENT pendant que
    // `standardPortionOf` les aplatissait: 727 g écrits contre 657 g annoncés
    // sur GAIN `a18f522e`. Les deux passent désormais par `measurePreparation`,
    // donc par la même règle d'eau, la même résolution et la même abstention.
    const ready = measurePreparation(args.index, {
      id,
      method: p.method ?? null,
      ingredients: (p.ingredients ?? []) as readonly unknown[],
      waterTreatment: p.waterTreatment ?? null,
    }).readyG;
    potReadyPerDraw.set(
      id,
      ready === null || draws === 0 ? null : ready / draws,
    );
    if (ready === null) counts.pots_unreadable++;
    if (draws === 0) return { ...p };
    const f = potFactorOf(factorsByPot.get(id) ?? []);
    const sc = scaleIngredients(
      (p.ingredients ?? []) as ScalableIngredient[],
      f,
    );
    counts.pots_scaled++;
    if (p.servingsMade !== draws) counts.servings_rewritten++;
    return { ...p, ingredients: sc.out, servingsMade: draws };
  });

  // ── ③ LES PLATS: FRAIS × Σ, ET UN COUVERCLE PAR GROUPE ──────────────────
  const dishes = args.meal.dishes.map((d, i) => {
    const rows = (byDish.get(i) ?? []).filter((r) => r.sized);
    if (rows.length === 0) {
      counts.dishes_unsized++;
      counts.eaters_unsized += (byDish.get(i) ?? []).length;
      return { ...d };
    }
    const sum = dishSum(i);
    const sc = scaleIngredients(
      (d.ingredients ?? []) as ScalableIngredient[],
      sum,
    );
    counts.fresh_scaled += sc.scaled;
    counts.fresh_unweighed += sc.unweighed;

    /** Les items d'UNE part, à un facteur donné. */
    const itemsAt = (f: number) => {
      const items: SizedBoxItem[] = [];
      for (const u of d.uses ?? []) {
        const id = String(u?.preparationId ?? "");
        if (!id) continue;
        const perDraw = potReadyPerDraw.get(id);
        if (perDraw === null || perDraw === undefined) {
          counts.items_unresolved++;
          continue;
        }
        const prep = args.meal.preparations.find((p) =>
          String(p.id ?? "") === id
        );
        const grams = Math.round(perDraw * f);
        if (grams <= 0) {
          counts.items_unresolved++;
          continue;
        }
        items.push({
          preparationId: id,
          term: String(prep?.title ?? id),
          grams,
          // ⟳ LOT A — UN ITEM QUI CITE UNE CASSEROLE N'A PAS DE FICHE: son
          // énergie vient de la casserole entière (`potDensities`), et son
          // `term` est le TITRE de la casserole, pas un aliment.
          ref: null,
          refRefused: false,
        });
      }
      for (const ing of (d.ingredients ?? []) as ScalableIngredient[]) {
        const ready = readyGramsOfOne(args.index, ing);
        if (ready === null) {
          counts.items_unresolved++;
          continue;
        }
        const grams = Math.round(ready * f);
        if (grams <= 0) continue;
        items.push({
          preparationId: null,
          term: String(ing.term ?? ""),
          grams,
          // ⟳ LOT A (2026-09-11) — L'IDENTITÉ DE LA LIGNE SUIT DANS LA BOÎTE.
          // « Ne plus retrouver son aliment par son libellé »: cet item EST né
          // de cette ligne-ci, on n'a donc aucune raison de le rechercher.
          ref: ing.ref ?? null,
          refRefused: ing.refRefused === true,
        });
      }
      return items;
    };

    const plan = lidPlanFor({
      rows: rows.map((r) => ({
        memberId: r.memberId,
        bucket: "",
        factor: r.factor,
        personCookedG: null,
        verdict: "in_bounds" as SizingVerdict,
        unmetKcal: 0,
      })),
      weighed: args.weighed,
    });

    const boxes: {
      id: string;
      memberIds: string[];
      items: { preparationId: string | null; term: string; grams: number }[];
      legacyTotalGrams: null;
    }[] = [];
    const base = `box_${String(d.day ?? "day")}_${
      String(d.slot ?? "slot")
    }_${i}`;
    for (const lid of plan.own) {
      const items = itemsAt(lid.factor);
      if (items.length === 0) continue;
      boxes.push({
        id: `${base}_${lid.memberId}`,
        memberIds: [lid.memberId],
        items,
        legacyTotalGrams: null,
      });
      counts.own_authored++;
    }
    if (plan.tub !== null) {
      // ⛔ LA SOMME DES PARTS, JAMAIS UNE MOYENNE. Le bac est un RÉCIPIENT: il
      // doit contenir de quoi servir tous ses mangeurs.
      const items = itemsAt(plan.tub.factorSum);
      if (items.length > 0) {
        boxes.push({
          id: `${base}_tub`,
          memberIds: [...plan.tub.memberIds],
          items,
          legacyTotalGrams: null,
        });
        counts.tubs_authored++;
      }
    }
    if (boxes.length === 0) {
      counts.dishes_unsized++;
      return { ...d, ingredients: sc.out };
    }
    counts.boxes_authored += boxes.length;
    return { ...d, ingredients: sc.out, boxes };
  });

  return { dishes, preparations, counts };
}

export function applySizing(args: {
  meal: {
    // deno-lint-ignore no-explicit-any
    dishes: readonly any[];
    // deno-lint-ignore no-explicit-any
    preparations: readonly any[];
  };
  memberId: string;
  rows: readonly SizingRowForApply[];
  index: CompositionIndex;
  // deno-lint-ignore no-explicit-any
}): { dishes: any[]; preparations: any[]; counts: ApplyCounts } {
  const counts = applyCounts();
  const byIndex = new Map(args.rows.map((r) => [r.dishIndex, r]));

  // ── ① LES TIRAGES, ET LE FACTEUR DE CHAQUE CASSEROLE ────────────────────
  const factorsByPot = new Map<string, number[]>();
  const drawsByPot = new Map<string, number>();
  args.meal.dishes.forEach((d, i) => {
    const row = byIndex.get(i);
    for (const u of d.uses ?? []) {
      const id = String(u?.preparationId ?? "");
      if (!id) continue;
      drawsByPot.set(id, (drawsByPot.get(id) ?? 0) + 1);
      // ⚠️ UN PLAT NON MESURÉ COMPTE POUR 1 DANS LA CASSEROLE. Il est servi tel
      // que le modèle l'a écrit (`UNMEASURABLE_PORTION_FACTOR`), donc il tire
      // sa portion entière. L'omettre ferait cuisiner moins que ce que la
      // table mange.
      factorsByPot.set(id, [
        ...(factorsByPot.get(id) ?? []),
        row?.sized ? row.factor : 1,
      ]);
    }
  });

  // ── ② LES CASSEROLES, MULTIPLIÉES ET RE-PORTIONNÉES ─────────────────────
  const potReadyPerDraw = new Map<string, number | null>();
  const preparations = args.meal.preparations.map((p) => {
    const id = String(p.id ?? "");
    const draws = drawsByPot.get(id) ?? 0;
    // ⟳ 2026-09-11 · LOT B — LA MÊME MESURE QUE LE DIMENSIONNEMENT. Avant ce
    // lot, `applySizing` mesurait chaque casserole SÉPARÉMENT pendant que
    // `standardPortionOf` les aplatissait: 727 g écrits contre 657 g annoncés
    // sur GAIN `a18f522e`. Les deux passent désormais par `measurePreparation`,
    // donc par la même règle d'eau, la même résolution et la même abstention.
    const ready = measurePreparation(args.index, {
      id,
      method: p.method ?? null,
      ingredients: (p.ingredients ?? []) as readonly unknown[],
      waterTreatment: p.waterTreatment ?? null,
    }).readyG;
    potReadyPerDraw.set(
      id,
      ready === null || draws === 0 ? null : ready / draws,
    );
    if (ready === null) counts.pots_unreadable++;
    if (draws === 0) return { ...p };
    const f = potFactorOf(factorsByPot.get(id) ?? []);
    const s = scaleIngredients(
      (p.ingredients ?? []) as ScalableIngredient[],
      f,
    );
    counts.pots_scaled++;
    // ⛔ `servingsMade` DEVIENT LE NOMBRE DE TIRAGES, jamais ce que le modèle a
    // écrit. Mesuré faux: `servings: 1` sur des pots que quinze plats tirent.
    if (p.servingsMade !== draws) counts.servings_rewritten++;
    return { ...p, ingredients: s.out, servingsMade: draws };
  });

  // ── ③ LES PLATS: FRAIS MULTIPLIÉ, ET UNE BOÎTE AUTORÉE ──────────────────
  const dishes = args.meal.dishes.map((d, i) => {
    const row = byIndex.get(i);
    if (!row || !row.sized) {
      counts.dishes_unsized++;
      return { ...d };
    }
    const f = row.factor;
    const s = scaleIngredients(
      (d.ingredients ?? []) as ScalableIngredient[],
      f,
    );
    counts.fresh_scaled += s.scaled;
    counts.fresh_unweighed += s.unweighed;

    const items: SizedBoxItem[] = [];
    for (const u of d.uses ?? []) {
      const id = String(u?.preparationId ?? "");
      if (!id) continue;
      const perDraw = potReadyPerDraw.get(id);
      if (perDraw === null || perDraw === undefined) {
        counts.items_unresolved++;
        continue;
      }
      const prep = args.meal.preparations.find((p) =>
        String(p.id ?? "") === id
      );
      const grams = Math.round(perDraw * f);
      if (grams <= 0) {
        counts.items_unresolved++;
        continue;
      }
      // ⟳ LOT A — voir `itemsAt`: un item citant une casserole n'a pas de fiche.
      items.push({
        preparationId: id,
        term: String(prep?.title ?? id),
        grams,
        ref: null,
        refRefused: false,
      });
    }
    // ⚠️ LE FRAIS EST PESÉ SUR LA RECETTE D'ORIGINE PUIS MULTIPLIÉ, jamais sur
    // la recette déjà mise à l'échelle: deux multiplications par `f` feraient
    // `f²`, et l'erreur serait invisible à facteur 1.
    for (const ing of (d.ingredients ?? []) as ScalableIngredient[]) {
      const ready = readyGramsOfOne(args.index, ing);
      if (ready === null) {
        counts.items_unresolved++;
        continue;
      }
      const grams = Math.round(ready * f);
      if (grams <= 0) continue;
      // ⟳ LOT A (2026-09-11) — L'IDENTITÉ DE LA LIGNE SUIT DANS LA BOÎTE.
      items.push({
        preparationId: null,
        term: String(ing.term ?? ""),
        grams,
        ref: ing.ref ?? null,
        refRefused: ing.refRefused === true,
      });
    }
    if (items.length === 0) {
      counts.dishes_unsized++;
      return { ...d, ingredients: s.out };
    }
    counts.boxes_authored++;
    return {
      ...d,
      ingredients: s.out,
      boxes: [{
        // ⚠️ L'ID EST DÉRIVÉ DU JOUR, DU CRÉNEAU ET DU RANG — pas d'un compteur
        // global. Deux plans successifs du même jour donnent le même id pour la
        // même case, ce qui rend un diff lisible; un compteur les décalerait
        // tous dès qu'un plat est ajouté au milieu.
        id: `box_${String(d.day ?? "day")}_${String(d.slot ?? "slot")}_${i}`,
        memberIds: [args.memberId],
        items,
        legacyTotalGrams: null,
      }],
    };
  });

  return { dishes, preparations, counts };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ bis — LA MESURE APRÈS APPLICATION, ET ELLE VAUT AUSSI À **UNE** BOUCHE
// ═══════════════════════════════════════════════════════════════════════════
//
// ── LE DÉFAUT QUE CE BLOC FERME, ET IL EST DANS L'ENQUÊTE ─────────────────
// « Le contrôle final appelle un chemin qui s'abstient pour `single_mouth`. Il
// laisse donc passer ce dépassement réel sans reprendre le verdict établi sur
// les 657 g théoriques » (`ENQUETE-DEUX-DIRECTIONS-2026-09-11.md` § 4). Sur GAIN
// `a18f522e`, samedi déjeuner: le moteur annonce **657 g**, `applySizing` écrit
// **727 g**, le plafond est à 700 — et personne ne le dit, parce que le seul
// contrôle qui pesait les assiettes ne tournait qu'à partir de DEUX bouches.
//
// ⛔ CETTE FONCTION N'A AUCUNE EXCEPTION DE POPULATION. Un foyer d'une personne
// et un foyer de cinq traversent la même mesure, avec le même vocabulaire de
// verdict. C'est la ligne du chantier: « même calcul et mêmes contrôles pour une
// personne seule et plusieurs personnes ».
//
// ⛔ ET ELLE MESURE CE QUI EST **ÉCRIT**, pas ce qui était prévu. Elle part des
// `boxes[].items` — les grammes que `applySizing` vient de poser, arrondis
// compris — et de la composition des casseroles telles qu'elles ont été mises à
// l'échelle. Un verdict calculé avant application ne valide pas les quantités
// écrites; c'est très exactement ce que les 727 g ont prouvé.

/** Ce qu'un contenant écrit pèse vraiment, et ce que la borne en dit. */
export interface FinalPortionRow {
  boxId: string;
  day: string | null;
  slot: string | null;
  memberIds: readonly string[];
  /** La somme des items ÉCRITS. */
  grams: number;
  kcal: number | null;
  proteinG: number | null;
  /** `unmeasurable` quand la mesure se tait ou qu'aucune borne n'est connue. */
  verdict: SizingVerdict;
  /**
   * LES GRAMMES QUE LA BORNE REFUSE. `0` quand elle ne mord pas, NÉGATIF sous
   * le plancher — même convention de signe que `clampToBounds.unmetKcal`.
   */
  overshootG: number;
}

export const FINAL_PORTION_REASONS = [
  "remeasured_after_apply",
  "composition_unavailable",
  "no_box",
] as const;
export type FinalPortionReason = (typeof FINAL_PORTION_REASONS)[number];

export interface FinalPortionCheck {
  measured: boolean;
  reason: FinalPortionReason;
  /** Tous les contenants rencontrés, jugés ou non. Le dénominateur. */
  boxes: number;
  /** Ceux dont on a pu comparer la masse à une borne. */
  judged: number;
  verdicts: Record<SizingVerdict, number>;
  /** Ce qu'on a décidé de l'eau de chaque casserole du plan. */
  water: Record<WaterTreatment, number>;
  /**
   * LES BACS, COMPTÉS À PART ET JAMAIS JUGÉS. Les grammes d'un contenant à
   * plusieurs noms sont une quantité de RÉCIPIENT, pas la portion de quelqu'un:
   * les comparer à un plafond d'assiette ferait rougir un bac correct (v4).
   */
  tubsNotJudged: number;
  /**
   * LES DÉPASSEMENTS, SANS `member_id`. C'est cette liste qui va au journal:
   * le seau d'un jour et d'un moment dit assez pour lire, et pas assez pour
   * nommer (précédent `residualGaps`, retiré pour avoir porté un identifiant).
   */
  outOfBounds: readonly {
    day: string | null;
    slot: string | null;
    grams: number;
    limit: number;
    bound: "min" | "max";
  }[];
  /** Les lignes complètes, pour l'appelant qui doit AGIR — jamais pour un log. */
  rows: readonly FinalPortionRow[];
}

/**
 * LA MESURE FINALE D'UN PLAN ÉCRIT — grammes, kcal et protéine des items posés.
 *
 * @param plateFor les bornes de CE contenant. `null` = on ne sait pas ce que
 * cette assiette devrait peser, donc on ne juge pas et on le compte
 * (`unmeasurable`). ⛔ REQUIS ET NULLABLE, jamais `?`: un défaut ferait de
 * « pas de borne » la réponse silencieuse de tous les appelants, c'est-à-dire
 * laisserait ce contrôle construit et désarmé — le mode d'échec n° 1 du dépôt.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function finalPortionCheck(args: {
  index: CompositionIndex | null;
  dishes: readonly BoxedMouthEnergyDish[];
  preparations: readonly EnergyPreparation[];
  plateFor: (box: {
    memberIds: readonly string[];
    day: string | null;
    slot: string | null;
  }) => PlateBounds | null;
}): FinalPortionCheck {
  const verdicts = Object.fromEntries(
    SIZING_VERDICTS.map((v) => [v, 0]),
  ) as Record<SizingVerdict, number>;
  const water = Object.fromEntries(
    WATER_TREATMENTS.map((w) => [w, 0]),
  ) as Record<WaterTreatment, number>;
  const empty = (reason: FinalPortionReason): FinalPortionCheck => ({
    measured: false,
    reason,
    boxes: 0,
    judged: 0,
    verdicts,
    water,
    tubsNotJudged: 0,
    outOfBounds: [],
    rows: [],
  });
  if (args.index === null) return empty("composition_unavailable");
  for (const prep of args.preparations) {
    water[measurePreparation(args.index, prep).water]++;
  }
  const measured = boxNutrition({
    index: args.index,
    dishes: args.dishes,
    preparations: args.preparations,
  });
  if (measured.length === 0) {
    return { ...empty("no_box"), water };
  }

  const rows: FinalPortionRow[] = [];
  const outOfBounds: {
    day: string | null;
    slot: string | null;
    grams: number;
    limit: number;
    bound: "min" | "max";
  }[] = [];
  let judged = 0;
  let tubs = 0;
  for (const box of measured) {
    const bounds = box.memberIds.length === 1
      ? args.plateFor({ memberIds: box.memberIds, day: box.day, slot: box.slot })
      : null;
    if (box.memberIds.length !== 1) tubs++;
    let verdict: SizingVerdict = "unmeasurable";
    let overshoot = 0;
    if (bounds !== null && box.grams > 0) {
      judged++;
      if (box.grams > bounds.max) {
        verdict = "over_max";
        overshoot = Math.round(box.grams - bounds.max);
        outOfBounds.push({
          day: box.day,
          slot: box.slot,
          grams: Math.round(box.grams),
          limit: bounds.max,
          bound: "max",
        });
      } else if (box.grams < bounds.min) {
        verdict = "under_min";
        overshoot = Math.round(box.grams - bounds.min);
        outOfBounds.push({
          day: box.day,
          slot: box.slot,
          grams: Math.round(box.grams),
          limit: bounds.min,
          bound: "min",
        });
      } else verdict = "in_bounds";
    }
    verdicts[verdict]++;
    rows.push({
      boxId: box.boxId,
      day: box.day,
      slot: box.slot,
      memberIds: box.memberIds,
      grams: Math.round(box.grams),
      kcal: box.kcal === null ? null : Math.round(box.kcal),
      proteinG: box.proteinG,
      verdict,
      overshootG: overshoot,
    });
  }
  return {
    measured: true,
    reason: "remeasured_after_apply",
    boxes: measured.length,
    judged,
    verdicts,
    water,
    tubsNotJudged: tubs,
    outOfBounds,
    rows,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ LA RÉPARATION — lot 5
// ═══════════════════════════════════════════════════════════════════════════

/**
 * UNE SEULE DEMANDE PAR PLAT, ET UN SEUL APPEL PAR PLAN.
 *
 * ⛔ LA VERSION D'AVANT DISAIT « PAS DE BOUCLE », ET ELLE AVAIT TORT SUR SA
 * PROPRE PRÉMISSE. Elle supposait qu'un refus veut dire « le modèle ne sait pas
 * rendre ce plat plus dense ». Mesuré le 2026-09-09, c'est faux dans trois cas
 * sur quatre :
 *
 *   · `title_changed` — il a composé un AUTRE plat. Il n'a pas échoué à
 *     densifier, il n'a pas fait l'exercice demandé.
 *   · `no_cell` — la case n'est pas revenue. Il n'a rien dit sur la densité.
 *   · `unparseable` — du JSON cassé, ou l'appel qui tombe.
 *
 * Dans les trois, la deuxième version n'est pas « une troisième version qu'on
 * bornera pareil » : c'est le premier essai réel. Seul le quatrième cas — une
 * recette rendue, lisible, plus dense, et toujours insuffisante — justifiait la
 * phrase d'origine, et celui-là ne repart pas (`still_out` le compte).
 *
 * ⚠️ DEUX, PAS TROIS. Le budget d'un plan reste ce qu'il était à un facteur
 * près, et le second appel ne part QUE sur un refus — un plan qui passe du
 * premier coup ne coûte rien de plus. Décision du propriétaire, 2026-09-09.
 */
export const REPAIR_CALLS_PER_DISH = 2;

/**
 * COMBIEN DE PLATS UN SEUL APPEL PEUT NOMMER.
 *
 * ⚠️ UN BUDGET, PAS UNE LIMITE TECHNIQUE. Au-delà de quatre plats hors bornes,
 * ce n'est plus un plat à réparer, c'est un plan à recomposer — et recomposer
 * n'est pas ce que cette relance fait. Les plats au-delà du budget sont bornés
 * et COMPTÉS (`skipped_budget`), jamais silencieusement laissés.
 */
export const REPAIR_MAX_DISHES_PER_PLAN = 4;

/**
 * CE QU'IL FAUT AVOIR PERDU POUR QUE RAPPELER LE MODÈLE AIT UN SENS.
 *
 * ⛔ « ENCORE HORS BORNES » NE VEUT PAS DIRE « ÇA VAUT UN APPEL ». Mesuré le
 * 2026-09-10 sur les dix tirs `qa-genty-clone`, les trois plats restés hors
 * bornes après une réparation acceptée :
 *
 *   · R5 — 701 g pour un plafond de 700 : **2 kcal** manquantes sur 3 080
 *     (0,06 %). Un gramme. C'est du bruit de référentiel, pas un défaut.
 *   · R3 — 708 g : **12 kcal** (0,4 %).
 *   · R6 — 758 g : **74 kcal** (2,4 %), et celui-là mérite un second essai.
 *
 * Un seuil à 25 kcal sépare les deux familles sans couper au milieu d'aucune:
 * en dessous, un appel modèle coûte du temps mur et de l'argent pour corriger
 * ce qu'on ne saurait même pas mesurer sur une balance de cuisine.
 *
 * ⚠️ CE N'EST PAS UNE TOLÉRANCE SUR LA BORNE. L'assiette est rabotée à 700 g
 * dans tous les cas, et le manque est compté dans tous les cas (`unmet_kcal`).
 * Ce seuil décide d'UNE chose: faut-il redemander au modèle.
 */
export const REPAIR_RETRY_MIN_UNMET_KCAL = 25;

/**
 * LA MARGE QU'ON DEMANDE AU-DELÀ DU STRICT NÉCESSAIRE.
 *
 * ⛔ ELLE EXISTE PARCE QUE DEMANDER LE STRICT MINIMUM REVIENT À DEMANDER
 * D'ÉCHOUER. Un plat qui atteint exactement la densité nécessaire tient tout
 * juste dans la borne; le moindre écart d'arrondi ou d'ingrédient le remet
 * dehors, et on aurait dépensé un appel pour rien. 10 % est assez pour absorber
 * ça et assez peu pour ne pas déformer le plat.
 */
export const REPAIR_DENSITY_HEADROOM = 1.10;

export interface RepairAsk {
  /** `densify` = le plat est trop dilué; `lighten` = trop concentré. */
  direction: "densify" | "lighten";
  /** La densité actuelle, en kcal pour 100 g SERVIS. */
  currentPer100G: number;
  /**
   * ⟳ 2026-09-08 — LE PLANCHER D'UNE DEMANDE « ALLÉGER ». Mesuré au tir
   * SPLICE3 : un adulte en perte de gras SOUS son plancher d'assiette au
   * petit-déjeuner a reçu, en plat à son nom, un bouillon à 57,8 kcal/100 g —
   * et son assiette est passée d'« trop petite » à « trop grosse » (over_max).
   * « Reste sous N » sans plancher laisse le modèle diluer sans limite. Le
   * plancher est la densité en dessous de laquelle l'assiette dépasse son
   * plafond de masse : `max_i(target_i ÷ maxMass_i)`. `null` en densify.
   */
  floorPer100G: number | null;
  /**
   * ⟳ 2026-09-10 — LE HAUT DU COULOIR, ET IL EXISTE DANS LES DEUX SENS.
   *
   * ⛔ « AU MOINS N » N'A PAS DE HAUT. Sur 40 densités demandées puis pesées,
   * 23 étaient AU-DESSUS de la consigne, jusqu'à +63 %. Un plat trop dense
   * n'est pas un bonus: la part tient dans trois cuillères, passe sous le
   * plancher d'assiette, et déclenche une réparation « allège » qui coûte le
   * même appel. `null` = pas de couloir calculable (chemin legacy).
   */
  ceilingPer100G: number | null;
  /**
   * La densité à VISER, à l'intérieur du couloir.
   *
   * ⟳ 2026-09-10 — ce n'est plus « le nécessaire × 1,10 ». La marge poussait le
   * centre d'un tir déjà centré (médiane +3,1 %), alors que c'est la DISPERSION
   * qui coûtait. La visée est maintenant `100 × E / Gpréf`, projetée dans
   * `[min, max]`: la marge est INTÉRIEURE au couloir.
   */
  aimPer100G: number;
}

/**
 * CE QU'IL FAUT DEMANDER POUR CE PLAT — ou rien.
 *
 * ⛔ LE VERDICT SE TRADUIT EN DENSITÉ, ET C'EST TOUT LE LOT. La borne porte sur
 * une MASSE, la cible sur une ÉNERGIE; le modèle n'a ni l'une ni l'autre — il
 * n'a plus le corps de personne depuis v33. La seule grandeur qu'on puisse lui
 * donner sans lui rendre le corps est la DENSITÉ, qui est une propriété du plat:
 *
 *     pour que `cible` tienne dans `max` grammes, il faut `cible / max` kcal/g
 *     pour que `cible` remplisse `min` grammes, il faut au plus `cible / min`
 *
 * ⚠️ NI LA CIBLE NI LES BORNES NE SORTENT D'ICI. Un test lit l'instruction et
 * vérifie qu'elle ne porte ni kcal de journée, ni kg, ni prénom.
 *
 * PURE: no I/O, no clock, no randomness.
 */
/**
 * LA VISÉE D'UNE RÉPARATION — elle dépend du CÔTÉ d'où l'on vient.
 *
 * ⛔ « LA MARGE ÉLOIGNE TOUJOURS DE LA BORNE, JAMAIS NE S'EN RAPPROCHE. » Un
 * plat trop dilué arrive par le BAS du couloir: sa visée monte au-dessus du
 * plancher (`min × 1,10`). Un plat trop dense arrive par le HAUT: sa visée
 * descend sous le plafond (`max ÷ 1,10`). Prendre la même visée des deux côtés
 * demanderait à un plat déjà trop dense de l'être ENCORE plus — c'est le piège
 * que le test « la marge va dans l'AUTRE SENS » garde depuis le lot 5.
 *
 * ⚠️ ET LES DEUX RESTENT DANS LE COULOIR. La marge est intérieure: sur un
 * couloir étroit, `min × 1,10` peut dépasser `max`, et c'est `max` qui gagne.
 */
function repairAimFor(
  corridor: DensityCorridor,
  direction: RepairDirection,
): number {
  if (direction === "densify") return corridor.preferredPer100G;
  const down = Math.floor(corridor.maxPer100G / REPAIR_DENSITY_HEADROOM);
  return Math.min(corridor.maxPer100G, Math.max(corridor.minPer100G, down));
}

export function repairDecision(args: {
  sized: SizedDish;
  standard: StandardPortion;
  bounds: PlateBounds;
  targetKcal: number | null;
}): RepairAsk | null {
  const { sized, standard, bounds, targetKcal } = args;
  if (sized.verdict === "in_bounds" || sized.verdict === "unmeasurable") {
    return null;
  }
  if (targetKcal === null || !(targetKcal > 0)) return null;
  if (standard.densityPer100G === null || !(standard.densityPer100G > 0)) {
    return null;
  }
  // ⟳ 2026-09-10 — LE MÊME COULOIR QUE CELUI ANNONCÉ AVANT LA COMPOSITION.
  // ⛔ DEUX ARITHMÉTIQUES DE LA MÊME DENSITÉ FERAIENT DEMANDER À LA RÉPARATION
  // UN NOMBRE QUE LE BRIEF N'AVAIT PAS DIT — et le modèle lirait deux consignes
  // contradictoires sur le même plat.
  const corridor = densityCorridorFor({ targetKcal, bounds });
  if (corridor === null) return null;
  const current = Math.round(standard.densityPer100G);
  if (sized.verdict === "over_max") {
    return {
      direction: "densify",
      currentPer100G: current,
      floorPer100G: corridor.minPer100G,
      ceilingPer100G: corridor.maxPer100G,
      aimPer100G: repairAimFor(corridor, "densify"),
    };
  }
  return {
    direction: "lighten",
    currentPer100G: current,
    // ⛔ LE PLANCHER : la densité sous laquelle l'assiette dépasserait son
    // plafond de masse. Sans lui, un bouillon à 58 passe (tir SPLICE3).
    floorPer100G: corridor.minPer100G,
    ceilingPer100G: corridor.maxPer100G,
    aimPer100G: repairAimFor(corridor, "lighten"),
  };
}

/**
 * L'INSTRUCTION DE RELANCE — un fait sur chaque plat, jamais sur la personne.
 *
 * ⛔ « KEEP ITS IDENTITY » EST LA MOITIÉ QUI COMPTE. Sans elle, « rends ce plat
 * plus dense » se satisfait en remplaçant la soupe par un gratin: le plat
 * atteint la densité et la personne ne reçoit pas ce qu'elle avait demandé. La
 * relance répare une RECETTE, elle ne recompose pas un plan.
 */
export type RepairDirection = "densify" | "lighten";

/**
 * UNE UNITÉ DE RECETTE PEUT-ELLE ÊTRE RÉÉCRITE POUR CETTE PERSONNE ?
 *
 * ⛔ « UNITÉ » VEUT DIRE LE FRAIS DU PLAT **COMME** CHAQUE CASSEROLE, et les
 * traiter différemment était le défaut de la première version. Le frais d'un
 * plat partagé est mangé par tous ceux qui mangent le plat: le densifier pour
 * l'un le densifie pour l'autre, exactement comme une casserole.
 */
export type Repairability = "reworkable" | "frozen";

/** Un ingrédient tel que le modèle l'a écrit — sa quantité comprise. */
export interface RepairIngredient {
  term: string;
  /** La chaîne du modèle (« 250 g », « 2 c. à s. »). `null` = il n'en a pas mis. */
  quantity: string | null;
}

export interface RepairPot {
  id: string;
  title: string;
  ingredients: readonly RepairIngredient[];
  repairability: Repairability;
}

/** Ce qu'on rend au modèle pour qu'il réécrive UN plat: sa recette entière. */
export interface RepairDishInput {
  title: string;
  ask: RepairAsk;
  fresh: readonly RepairIngredient[];
  freshRepairability: Repairability;
  pots: readonly RepairPot[];
}

/**
 * L'INSTRUCTION DE RELANCE — un fait sur chaque plat, jamais sur la personne.
 *
 * ⛔ « KEEP ITS IDENTITY » EST LA MOITIÉ QUI COMPTE. Sans elle, « rends ce plat
 * plus dense » se satisfait en remplaçant la soupe par un gratin: le plat
 * atteint la densité et la personne ne reçoit pas ce qu'elle avait demandé. La
 * relance répare une RECETTE, elle ne recompose pas un plan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-08 — LA RECETTE PART AVEC SES QUANTITÉS, ET C'EST LE LOT ENTIER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * L'instruction ne nommait que les INGRÉDIENTS (« poulet, riz, tomate ») et
 * demandait de changer « les PROPORTIONS ». Le message de relance, lui, est le
 * prompt d'ORIGINE plus cette consigne: le modèle n'y voit nulle part le plan
 * qu'il vient d'écrire. On lui demandait donc de re-proportionner une recette
 * qu'il ne relit pas — c'est-à-dire de la recomposer de mémoire.
 *
 * Mesuré le 2026-09-07 sur `qa-genty-clone`: deux plats demandés (114 → 182 et
 * 92 → 159 kcal/100 g), deux acceptés par la garde d'identité, **deux toujours
 * hors bornes** (142 et 113 rendus). Le modèle obéissait dans le bon sens et
 * s'arrêtait à mi-chemin, faute de savoir d'où il partait.
 *
 * ⛔ ET LE MOT « PROPORTIONS » DISPARAÎT. Il décrivait ce qu'on voulait obtenir
 * (« ne change pas les aliments »), mais il se lit comme « sers-en moins » —
 * ce qui laisse la personne avec la même assiette rabotée, par l'autre bout.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-08 SOIR — « THE PLATE STAYS THE SAME SIZE » EST RETIRÉE, ET C'EST
 * ELLE QUI FAISAIT ÉCHOUER LA RÉPARATION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cette phrase disait « ne réponds pas en servant une plus petite portion »,
 * et c'était un vrai risque. Mais elle est FAUSSE ICI, et la contradiction se
 * lit dans la même consigne: on demande « moins d'eau et moins de légume
 * aqueux », puis on interdit de rétrécir. Or retirer les légumes aqueux, c'est
 * exactement rétrécir.
 *
 * ⛔ LA RECETTE N'EST PAS UNE ASSIETTE. Depuis v33, le modèle écrit une recette
 * STANDARD que le moteur multiplie ensuite (`applySizing`). Réduire la sauce
 * dans la recette est la manœuvre juste; c'est le facteur, pas le modèle, qui
 * décide de ce qui atterrit dans l'assiette. La phrase fermait la seule porte
 * praticable.
 *
 * MESURÉ le 2026-09-08 sur `qa-genty-clone`: « Pâtes, sauce de lentilles, feta
 * et noix » à 97 kcal/100 g, à porter à 159. Le plat pèse ~1 340 g dont 400 g
 * de tomates concassées et 200 g de carotte. À masse constante il aurait fallu
 * ajouter ~875 kcal — 100 g d'huile, ou tripler la feta et les noix. Le modèle
 * a fait la seule chose que la consigne lui laissait: il a composé un AUTRE
 * plat (« Poulet, pommes de terre, poivron et salade au yaourt », 111 g de
 * survie sur 1 341). La garde d'identité l'a refusé, et les 333 kcal sont
 * restées au plafond.
 *
 * Ce qui la remplace dit ce qu'on voulait vraiment: la recette a le droit de
 * maigrir, et la portion servie n'est pas son affaire.
 *
 * ── LES CASSEROLES GELÉES SE NOMMENT, ELLES NE SE TAISENT PAS ────────────
 * Une casserole que d'autres assiettes tirent ne peut pas bouger pour une
 * seule d'entre elles. Ne pas la mentionner ferait un plat dont la moitié des
 * ingrédients semble absente; la nommer INTOUCHABLE dit au modèle où il a le
 * droit de travailler. Solo, aucune ne l'est.
 *
 * PURE: no I/O, no clock, no randomness.
 */
/**
 * ⛔ ON NE TIRE JAMAIS UN ENFANT VERS LE BAS SUR UN PLAT PARTAGÉ.
 *
 * Alléger un plat parce qu'un mineur y dépasse son plancher ferait servir à
 * TOUS une recette plus diluée — donc des assiettes plus grosses pour les
 * adultes, pour corriger la portion d'un enfant que son facteur suffit à
 * corriger. La borne individuelle et son `unmetKcal` disent le reste.
 */
export const REPAIR_MINOR_NEVER_LIGHTEN = true;

/**
 * ⛔ ON N'ALLÈGE QUE SI TOUT LE MONDE EST SOUS SON PLANCHER.
 *
 * Un seul mangeur `under_min` sur quatre veut dire que le plat convient aux
 * trois autres: l'alléger leur servirait un volume qu'ils n'ont pas demandé
 * pour régler le cas d'un seul. Densifier, à l'inverse, se décide sur UN seul
 * `over_max` — parce que là, quelqu'un ne peut pas manger sa part.
 */
export const REPAIR_SHARED_LIGHTEN_REQUIRES_ALL = true;

export const REPAIR_REASONS = [
  "over_max",
  "all_under_min",
  "conflict",
  "minor_blocks_lighten",
  "partial_under_min",
  "none",
] as const;
export type RepairReason = (typeof REPAIR_REASONS)[number];

export interface RepairAskForDish {
  ask: RepairAsk | null;
  reason: RepairReason;
  /** Les mangeurs que la borne va raboter si rien ne change. */
  clampedEaters: number;
}

/**
 * LA RÉPARATION D'UN PLAT QUE PLUSIEURS PERSONNES MANGENT.
 *
 * ⛔ ON DENSIFIE VERS LE PLUS EXIGEANT, ET C'EST DISSYMÉTRIQUE EXPRÈS. Un seul
 * `over_max` suffit à demander un plat plus dense: cette personne-là ne peut
 * pas manger sa part, et les autres n'y perdent rien — leur facteur baisse
 * d'autant. Alléger, à l'inverse, coûte à tout le monde, donc il faut
 * l'unanimité.
 *
 * ⚠️ `over_max` ET `under_min` SUR LE MÊME PLAT: on densifie, et on le compte
 * (`conflict`). Quelqu'un qui n'est pas nourri est un défaut plus grave qu'une
 * assiette qui paraît petite.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function repairDecisionForDish(args: {
  standard: StandardPortion;
  eaters: readonly {
    verdict: SizingVerdict;
    targetKcal: number | null;
    bounds: PlateBounds;
    isMinor: boolean;
  }[];
}): RepairAskForDish {
  const { standard, eaters } = args;
  const clampedEaters = eaters.filter(
    (e) => e.verdict === "over_max" || e.verdict === "under_min",
  ).length;
  const none = (reason: RepairReason): RepairAskForDish => ({
    ask: null,
    reason,
    clampedEaters,
  });
  if (standard.densityPer100G === null || !(standard.densityPer100G > 0)) {
    return none("none");
  }
  const current = Math.round(standard.densityPer100G);

  const over = eaters.filter((e) =>
    e.verdict === "over_max" && (e.targetKcal ?? 0) > 0
  );
  if (over.length > 0) {
    // ⛔ LE PLUS EXIGEANT: celui dont la cible rapportée à SON plafond réclame
    // la densité la plus haute. Prendre la moyenne laisserait le plus contraint
    // au-dessus de sa borne, c'est-à-dire non nourri.
    // ⟳ 2026-09-10 — L'INTERSECTION DES COULOIRS DE SES MANGEURS, pas une
    // moyenne. ⛔ « Ne pas moyenner les besoins » : la moyenne laisserait le
    // plus contraint au-dessus de sa borne, c'est-à-dire NON NOURRI.
    //   plancher = le PLUS HAUT des planchers (le plus exigeant décide)
    //   plafond  = le PLUS BAS des plafonds  (au-delà, quelqu'un a une part
    //              qui tient dans trois cuillères)
    const band = intersectCorridors(over, "densify");
    const under = eaters.some((e) => e.verdict === "under_min");
    return {
      ask: {
        direction: "densify",
        currentPer100G: current,
        floorPer100G: band.min,
        ceilingPer100G: band.max,
        aimPer100G: band.aim,
      },
      reason: under ? "conflict" : "over_max",
      clampedEaters,
    };
  }

  const under = eaters.filter((e) =>
    e.verdict === "under_min" && (e.targetKcal ?? 0) > 0
  );
  if (under.length === 0) return none("none");
  if (REPAIR_MINOR_NEVER_LIGHTEN && eaters.some((e) => e.isMinor)) {
    return none("minor_blocks_lighten");
  }
  if (REPAIR_SHARED_LIGHTEN_REQUIRES_ALL && under.length !== eaters.length) {
    return none("partial_under_min");
  }
  // Le moins exigeant décide: viser plus bas rendrait un plat trop dilué pour
  // celui qui en demandait encore le plus.
  const band = intersectCorridors(under, "lighten");
  return {
    ask: {
      direction: "lighten",
      currentPer100G: current,
      // ⛔ LE PLANCHER : la densité sous laquelle l'assiette de l'un d'eux
      // dépasserait son plafond de masse. Sans lui, un bouillon à 58 passe.
      floorPer100G: band.min,
      ceilingPer100G: band.max,
      aimPer100G: band.aim,
    },
    reason: "all_under_min",
    clampedEaters,
  };
}

/**
 * L'INTERSECTION DES COULOIRS D'UN PLAT PARTAGÉ.
 *
 * ⛔ JAMAIS UNE MOYENNE. Deux mangeurs aux besoins opposés n'ont pas un besoin
 * moyen: ils ont deux besoins, et une recette unique doit tenir les deux ou
 * aucun. Le plancher est le PLUS HAUT des planchers, le plafond le PLUS BAS des
 * plafonds.
 *
 * ⚠️ INTERSECTION VIDE ⇒ ON GARDE LE PLANCHER ET ON REMONTE LE PLAFOND SUR LUI.
 * On ne rabote pas le plancher: il est ce qui empêche quelqu'un d'avoir une
 * assiette de 1 100 g. Le conflit se lit alors au fait que `min === max`, et le
 * complément (`splitPlateWithComplement`) est la sortie prévue pour ce cas.
 */
function intersectCorridors(
  eaters: readonly {
    targetKcal: number | null;
    bounds: PlateBounds;
  }[],
  direction: RepairDirection,
): { min: number; max: number; aim: number } {
  const corridors = eaters
    .map((e) =>
      densityCorridorFor({ targetKcal: e.targetKcal, bounds: e.bounds })
    )
    .filter((c): c is DensityCorridor => c !== null);
  if (corridors.length === 0) return { min: 0, max: 0, aim: 0 };
  const min = Math.max(...corridors.map((c) => c.minPer100G));
  const max = Math.max(min, Math.min(...corridors.map((c) => c.maxPer100G)));
  // ⚠️ LA VISÉE SUIT LE CÔTÉ, comme pour une bouche seule — mais l'intersection
  // est déjà faite, donc on la recalcule sur la bande commune.
  const aim = direction === "densify"
    ? Math.min(max, Math.max(min, Math.ceil(min * REPAIR_DENSITY_HEADROOM)))
    : Math.min(max, Math.max(min, Math.floor(max / REPAIR_DENSITY_HEADROOM)));
  return { min, max, aim };
}

export function repairInstruction(
  asks: readonly RepairDishInput[],
): string | null {
  if (asks.length === 0) return null;
  const say = (ings: readonly RepairIngredient[]): string =>
    ings
      .map((g) => g.quantity === null ? g.term : `${g.quantity} ${g.term}`)
      .join(", ");
  const lines = asks.slice(0, REPAIR_MAX_DISHES_PER_PLAN).flatMap((d) => {
    // ⟳ 2026-09-10 — LA CONSIGNE DIT UNE BANDE, PAS UN SEUL BOUT.
    // ⛔ « Reste sous N » sans plancher a rendu un bouillon à 57,8 (tir SPLICE3):
    // l'assiette est passée de trop petite à trop grosse. « Au moins N » sans
    // plafond fait l'erreur miroir — 23 densités sur 40 sont revenues AU-DESSUS
    // de la consigne, jusqu'à +63 %. Les deux bords, et la visée au milieu.
    const band = d.ask.ceilingPer100G !== null && d.ask.floorPer100G !== null
      ? `between ${d.ask.floorPer100G} and ${d.ask.ceilingPer100G} kcal per 100 g ` +
        `as served, aiming for ${d.ask.aimPer100G}`
      : `at least ${d.ask.aimPer100G} kcal per 100 g as served`;
    const head = d.ask.direction === "densify"
      ? `- "${d.title}" serves ${d.ask.currentPer100G} kcal per 100 g; it has to land ` +
        `${band}. Rewrite the recipe, ` +
        `keeping its identity: more of the starch, the protein or the fat it ` +
        `already contains, less water and less watery vegetable. The recipe may end ` +
        `up smaller, and that is fine — the app decides how much of it goes on a ` +
        `plate, you do not.`
      : `- "${d.title}" serves ${d.ask.currentPer100G} kcal per 100 g; it has to land ` +
        `${band}. Rewrite the recipe, ` +
        `keeping its identity: less of the fat and the dense starch it already ` +
        `contains, more vegetable. The recipe may end up bigger, and that is fine — ` +
        `the app decides how much of it goes on a plate, you do not.`;
    const out = [head];
    // ⛔ CE QU'IL A ÉCRIT, AVEC SES QUANTITÉS. Voir le pavé: sans elles, la
    // relance demande de re-proportionner une recette que le modèle ne relit
    // nulle part.
    if (d.fresh.length > 0) {
      out.push(
        d.freshRepairability === "reworkable"
          ? `  Its own fresh ingredients, REWORKABLE: ${say(d.fresh)}.`
          : `  Its own fresh ingredients, FROZEN — return them unchanged: ${
            say(d.fresh)
          }.`,
      );
    }
    for (const pot of d.pots) {
      out.push(
        pot.repairability === "reworkable"
          ? `  Preparation ${pot.id} "${pot.title}", REWORKABLE: ${
            say(pot.ingredients)
          }.`
          : `  Preparation ${pot.id} "${pot.title}", FROZEN — other plates draw on it ` +
            `as it is, return it unchanged: ${say(pot.ingredients)}.`,
      );
    }
    return out;
  });
  return [
    "SOME DISHES DO NOT WORK AS A PLATE. Fix only these, and here is what you",
    "wrote for each one:",
    ...lines,
    "⛔ Keep each dish's identity: the same name, the same foods, the same cooking.",
    "A dish that comes back with different food is a REPLACEMENT, and it will be",
    "thrown away — the person asked for this dish. Do not swap, do not add a",
    "course, do not touch any other dish.",
    "A FROZEN part comes back unchanged: reach the density through the dish's own",
    "fresh ingredients and its REWORKABLE preparations.",
    "Return the full plan JSON with only these dishes and the preparations they",
    "draw on changed.",
  ].join("\n");
}

/**
 * CE QU'UNE UNITÉ APPREND D'UN PLAT QUI LA TIRE.
 *
 * ⛔ EXTRAITE LE 2026-09-08 POUR QUE LE FRAIS ET LA CASSEROLE SOIENT TRAITÉS
 * PAREIL, ce que la règle des mangeurs exige mot pour mot: « une unité, c'est
 * soit les ingrédients frais d'un plat, soit une casserole; les deux se
 * traitent pareil ».
 *
 * ⛔ MESURÉ AVANT L'EXTRACTION: la lane déclarait `freshRepairability:
 * "reworkable"` EN DUR. Sur un plat partagé, le frais est mangé par toute la
 * table: le densifier pour celui qui dépasse enrichit l'assiette de celui qui
 * était dans ses bornes, et celui-là ne le saura jamais — sa boîte est juste
 * plus riche. C'est très exactement le défaut que cette règle existe pour
 * empêcher, et il n'était gardé que sur les casseroles.
 *
 * ⚠️ « PAS BESOIN » N'EST PAS « BESOIN DU CONTRAIRE ». Un mangeur déjà dans ses
 * bornes n'inscrit aucune direction, donc il DISSENT dans les deux sens. C'est
 * `repairabilityOf` qui en tire la conséquence.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function absorbDishInto(
  unit: { eaters: Set<string>; needs: Map<string, Set<RepairDirection>> },
  dish: {
    eaters: ReadonlySet<string>;
    verdicts: ReadonlyMap<string, SizingVerdict>;
  },
): void {
  for (const eater of dish.eaters) {
    unit.eaters.add(eater);
    const verdict = dish.verdicts.get(eater);
    const direction: RepairDirection | null = verdict === "over_max"
      ? "densify"
      : verdict === "under_min"
      ? "lighten"
      : null;
    if (direction === null) continue;
    const set = unit.needs.get(eater) ?? new Set<RepairDirection>();
    set.add(direction);
    unit.needs.set(eater, set);
  }
}

/**
 * L'UNITÉ QUE FORMENT LES INGRÉDIENTS FRAIS D'UN PLAT.
 *
 * Ses mangeurs sont ceux du plat, et rien d'autre: le frais n'appartient qu'à
 * lui. C'est ce qui la distingue d'une casserole, tirée par plusieurs plats et
 * donc mangée par leur union.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function freshUnitOf(dish: {
  eaters: ReadonlySet<string>;
  verdicts: ReadonlyMap<string, SizingVerdict>;
}): { eaters: Set<string>; needs: Map<string, Set<RepairDirection>> } {
  const unit = {
    eaters: new Set<string>(),
    needs: new Map<string, Set<RepairDirection>>(),
  };
  absorbDishInto(unit, dish);
  return unit;
}

/**
 * QUI MANGE CHAQUE UNITÉ, ET DE QUOI CHACUN A BESOIN.
 *
 * ⛔ L'APPELANT PASSE LES MANGEURS, ON NE LES DÉDUIT PAS. Solo, c'est la bouche
 * unique; à N ≥ 2 c'est `eatersByDish(...).fedByDish[i]` — la même liste que le
 * reste du moteur, appelée et pas recopiée. Une seconde idée de « qui mange ce
 * plat » finirait par contredire la première, et c'est la dette que ce dépôt a
 * déjà payée quatre fois.
 *
 * La clé `""` désigne le FRAIS du plat: il est une unité comme une autre (voir
 * `Repairability`), et lui donner une clé le fait passer par la même règle.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function potRepairability(args: {
  dishes: readonly {
    eaters: ReadonlySet<string>;
    uses: readonly { preparationId?: string | null }[];
    /** Le verdict de CHAQUE mangeur sur CE plat. */
    verdicts: ReadonlyMap<string, SizingVerdict>;
  }[];
}): Map<
  string,
  { eaters: Set<string>; needs: Map<string, Set<RepairDirection>> }
> {
  const out = new Map<
    string,
    { eaters: Set<string>; needs: Map<string, Set<RepairDirection>> }
  >();
  const unit = (id: string) => {
    const found = out.get(id);
    if (found) return found;
    const fresh = {
      eaters: new Set<string>(),
      needs: new Map<string, Set<RepairDirection>>(),
    };
    out.set(id, fresh);
    return fresh;
  };
  for (const dish of args.dishes) {
    const ids = [
      ...new Set(
        dish.uses
          .map((u) => String(u.preparationId ?? ""))
          .filter((x) => x.length > 0),
      ),
    ];
    for (const id of ids) {
      const u = unit(id);
      absorbDishInto(u, dish);
    }
  }
  return out;
}

/**
 * CETTE UNITÉ PEUT-ELLE ÊTRE RÉÉCRITE DANS CETTE DIRECTION ?
 *
 * ⛔ IL FAUT QUE **CHAQUE** MANGEUR EN AIT BESOIN, et c'est la décision produit
 * du 2026-09-08. « Au moins un dépasse son plafond ⇒ on densifie » densifie
 * aussi l'assiette de celui qui était dans ses bornes: on répare quelqu'un en
 * cassant son voisin, et le voisin ne le saura jamais — sa boîte est juste plus
 * riche. Quand les mangeurs divergent, la casserole est GELÉE, et celui qui
 * reste hors bornes reçoit un plat à lui (voir `dedicatedRepairFor`).
 *
 * ⚠️ « BESOIN DE D » N'EST PAS « PAS BESOIN DU CONTRAIRE ». Un mangeur dans ses
 * bornes n'a besoin de RIEN: il compte comme dissident. Sans ça, la règle se
 * réduirait à « personne ne veut l'inverse », qui est presque toujours vrai.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function repairabilityOf(
  unit: {
    eaters: ReadonlySet<string>;
    needs: ReadonlyMap<string, ReadonlySet<RepairDirection>>;
  },
  direction: RepairDirection,
): { repairability: Repairability; dissenting: number } {
  let dissenting = 0;
  for (const eater of unit.eaters) {
    if (!(unit.needs.get(eater)?.has(direction) ?? false)) dissenting += 1;
  }
  return {
    repairability: dissenting === 0 && unit.eaters.size > 0
      ? "reworkable"
      : "frozen",
    dissenting,
  };
}

/**
 * QUELLE PART DE LA NOURRITURE D'UN PLAT DOIT SURVIVRE À SA RÉPARATION.
 *
 * ⛔ PLUS DE LA MOITIÉ DE SA MASSE — pas de ses termes, et la différence est
 * tout le lot. Écrite en comptant les TERMES, cette garde refusait la bonne
 * réparation autant que la mauvaise, et c'est un test qui l'a dit avant qu'un
 * run ne le fasse:
 *
 *     « poulet, riz, tomate, concombre » → « poulet, riz, laitue, avocat »
 *     2 termes sur 4 survivent = la moitié exactement, donc REFUSÉ.
 *
 * Or le poulet et le riz SONT ce plat; la tomate et le concombre en sont la
 * garniture — et c'est très exactement la garniture qu'on avait demandé de
 * remplacer (« moins de légume aqueux »). Compter les termes donne le même
 * poids à un blanc de poulet et à une rondelle de concombre.
 *
 * ⚠️ LA MASSE, ELLE, DIT LE BON MOT: sur ce plat, poulet + riz pèsent bien plus
 * que la moitié. Sur le remplacement mesuré au même jour — « poulet, quinoa,
 * légumes, feta » → « thon, haricots blancs, pain, avocat » — rien ne survit,
 * ni en termes ni en grammes.
 *
 * ⛔ ET CE N'EST PAS UN MATCHER MAISON. L'appariement est une INTERSECTION
 * EXACTE sur les jetons du modèle, passés par `normalizeTerm` — le normaliseur
 * du produit, celui qui résout déjà chaque ingrédient. Les grammes viennent de
 * `weighedReadyGrams`, l'arithmétique du moteur. Aucune similarité, aucune
 * distance, aucun mot deviné: « laitue » ne compte jamais pour « lait ».
 */
export const REPAIR_MIN_MASS_SURVIVAL = 0.5;

/**
 * LE PLAT RÉPARÉ EST-IL ENCORE LE MÊME PLAT ?
 *
 * ⛔ LA LISTE COMPARÉE EST CELLE QU'ON A NOMMÉE AU MODÈLE. `repairInstruction`
 * lui rend ses propres aliments (« Its ingredients, to be re-proportioned: … »)
 * et cette garde vérifie qu'ils sont revenus. La promesse et le contrôle lisent
 * la MÊME liste — c'est ce qui empêche de demander une chose et d'en vérifier
 * une autre.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function repairIdentityHeld(args: {
  /** Les ingrédients d'AVANT, avec leur masse servie. */
  before: readonly { term: string; grams: number }[];
  /** Les termes rendus par la relance — leur masse n'entre pas dans le verdict. */
  after: readonly string[];
}): { held: boolean; survivedGrams: number; ofGrams: number } {
  const after = new Set(
    args.after.map(normalizeTerm).filter((t) => t.length > 0),
  );
  let ofGrams = 0;
  let survivedGrams = 0;
  for (const b of args.before) {
    const t = normalizeTerm(b.term);
    if (t.length === 0 || !(b.grams > 0)) continue;
    ofGrams += b.grams;
    if (after.has(t)) survivedGrams += b.grams;
  }
  // ⚠️ UN PLAT DONT AUCUN INGRÉDIENT NE SE PÈSE NE PEUT PAS ÊTRE JUGÉ. On
  // REFUSE — le repli est l'abstention, et un plat non jugeable qu'on
  // accepterait serait la porte grande ouverte à un remplacement.
  if (ofGrams <= 0) return { held: false, survivedGrams: 0, ofGrams: 0 };
  return {
    held: survivedGrams / ofGrams > REPAIR_MIN_MASS_SURVIVAL,
    survivedGrams: Math.round(survivedGrams),
    ofGrams: Math.round(ofGrams),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ LA CIBLE DU JOUR — et le plancher TCA (lot 6)
// ═══════════════════════════════════════════════════════════════════════════

export const DAY_TARGET_GAP_CLOSED = ["restriction_floor", "none"] as const;
export type DayTargetGapClosed = (typeof DAY_TARGET_GAP_CLOSED)[number];

/**
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUE CETTE PERSONNE MANGE DANS SA JOURNÉE — l'entretien dimensionne TOUJOURS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LA DIFFÉRENCE AVEC `mouthTargetKcal` TIENT EN UNE LIGNE, et c'est le lot 6.
 * Sous plancher TCA (`restriction: "raised"`), `mouthTargetKcal` rend `null` —
 * elle refuse de dire un objectif, ce qui est juste, car c'est SA question.
 * Ici la question n'est pas la même: **combien mettre dans l'assiette**.
 *
 * ⚠️ REFUSER DE DIMENSIONNER NE PROTÈGE PERSONNE. Une assiette non dimensionnée
 * n'est pas une assiette neutre: c'est la recette du modèle servie telle quelle,
 * c'est-à-dire une quantité tirée au sort. Quelqu'un dont le plancher est levé
 * reçoit alors, au hasard, trop ou pas assez — et « pas assez » est très
 * exactement le sens d'erreur qu'un plancher TCA existe pour empêcher.
 *
 * ⛔ CE QUI RESTE FERMÉ, ET NE DOIT PAS BOUGER:
 *   · L'ÉCART D'OBJECTIF. Sous plancher, `goalGapKcalOf` rend zéro (la chaîne
 *     ①②③ le ferme déjà): la cible EST l'entretien. Aucun déficit n'est ouvert.
 *   · L'AFFICHAGE. `canShowEnergy` et `decideBoxEnergy` ne sont pas touchés —
 *     la boîte se dimensionne, son chiffre ne se montre pas.
 *   · `restriction: "unreadable"`. « Plancher levé » est une décision connue;
 *     « on n'a pas su lire » est une ignorance, et sur une ignorance on
 *     s'abstient. `maintenanceKcalOf` ferme.
 *
 * ⚠️ LE RETOUR ARRIÈRE EST UNE CONSTANTE: `RESTRICTION_FLOOR_SIZES_MAINTENANCE`
 * à `false` referme tout, sans toucher une ligne de câblage.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function dayTargetFor(
  mouth: AnchorMouth,
  coachCounting: CountingStance,
): {
  kcal: number | null;
  reason: AnchorReason;
  gapClosed: DayTargetGapClosed;
} {
  const base = maintenanceKcalOf(mouth);
  if (base.kcal === null) return { ...base, gapClosed: "none" };
  const goal = goalGapKcalOf(mouth, coachCounting);
  if (goal.reason !== null) {
    return { kcal: null, reason: goal.reason, gapClosed: "none" };
  }
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-10 — LE CRAN DE PART ARRIVE ENFIN ICI
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ IL ÉTAIT PASSÉ EN ARGUMENT ET LU PAR PERSONNE. Les deux appelants de
  // cette fonction (`generate-household-meal-v1`, à une bouche et à N) lui
  // remplissent `portionIndex` sous un commentaire qui dit, mot pour mot, que
  // « sans lui, un "ma mère ne mange pas autant" s'écrit en mémoire et ne
  // déplace aucune assiette ». C'était vrai — et le champ ne servait à rien:
  // `mouthTargetKcal` appliquait le cran, `dayTargetFor` ne l'appliquait pas,
  // et c'est `dayTargetFor` qui dimensionne sous `portion_v1`.
  //
  // ⛔ LA TRADUCTION N'EST PAS RECOPIÉE. `withPortionCran` (`mouth_anchor.ts`)
  // est le SEUL endroit qui traduise une position en facteur; deux écritures
  // du même adverbe divergent, et ce dépôt en porte déjà la cicatrice.
  //
  // ⚠️ ET LE PLANCHER SUIT LE CRAN, SUR LA BAISSE. `energyFloorFor(gender)` —
  // le même que partout ailleurs, jamais un nombre inventé ici. Un corps sans
  // sexe lisible rend `null` et **on ne rabat rien**: le cran à la baisse passe
  // alors tel quel, ce qui est la direction d'erreur de `withPortionCran` et
  // pas une décision prise ici.
  const floorKcal = mouth.body === null
    ? null
    : energyFloorFor(mouth.body.gender);
  if (mouth.restriction === "raised") {
    if (!RESTRICTION_FLOOR_SIZES_MAINTENANCE) {
      return { kcal: null, reason: "restriction_floor", gapClosed: "none" };
    }
    // ⚠️ `goal.gap` VAUT DÉJÀ ZÉRO ICI — la chaîne ①②③ ferme sous plancher. On
    // n'écrit donc pas « sans l'écart », on écrit CE QUI EST: l'entretien. Le
    // jeton dit pourquoi, pour que le compteur distingue « pas d'objectif » de
    // « objectif fermé par le plancher ».
    //
    // ⛔ ET LE CRAN S'APPLIQUE QUAND MÊME. Le plancher TCA retire l'ÉCART
    // D'OBJECTIF, pas la réponse de la personne à « c'était trop ? ». Refuser
    // de l'écouter ici servirait, à quelqu'un dont le plancher est levé, une
    // assiette dont il vient de dire qu'elle ne lui convient pas — et le
    // plancher d'énergie reste dessous, appliqué par `withPortionCran`.
    return {
      kcal: withPortionCran({
        kcal: base.kcal,
        portionIndex: mouth.portionIndex,
        floorKcal,
      }),
      reason: "anchored",
      gapClosed: "restriction_floor",
    };
  }
  return {
    kcal: withPortionCran({
      kcal: base.kcal + goal.gap,
      portionIndex: mouth.portionIndex,
      floorKcal,
    }),
    reason: "anchored",
    gapClosed: "none",
  };
}

// ══════════════════════════════════════════════════════════════════════════
// ⑨ — LA DENSITÉ REQUISE, DITE AVANT LA COMPOSITION (2026-09-08)
// ══════════════════════════════════════════════════════════════════════════
//
// ── LE DÉFAUT QUE CE BLOC FERME, ET IL A ÉTÉ MESURÉ ───────────────────────
// Tir du 2026-09-07 sur un corps de 187 cm / 72 kg / 28 ans en prise de masse
// (cible 3 180 kcal/jour): le modèle écrit un déjeuner à 142 kcal/100 g et un
// dîner à 113. Pour porter leurs cibles (1 156 et 1 012 kcal) il faudrait
// servir 813 g et 897 g — au-delà du plafond d'assiette (700 g). Le moteur
// rabote, et **383 kcal sur 3 080 ne sont jamais servies**.
//
// La réparation (`repairDecision`) traduit déjà ce défaut en densité, mais
// APRÈS COUP: elle demande au modèle de refaire un plat qu'il vient d'écrire.
// La même arithmétique, dite AVANT, ne coûte rien et évite le second appel.
//
// ⛔ C'EST LA MÊME FORMULE QUE LA BRANCHE `densify` DE `repairDecision`, et
// elle n'est pas dupliquée par distraction: `repairDecision` part d'un plat
// MESURÉ (il a une densité constatée à comparer), celui-ci part d'une CIBLE
// seule, avant qu'aucun plat n'existe. Ce qu'ils partagent est
// `REPAIR_DENSITY_HEADROOM` — la marge est nommée une fois, ici comme là-bas.
//
// ⛔ UNE DENSITÉ EST UN FAIT SUR LE PLAT, PAS UN OBJECTIF DE PERSONNE, et
// c'est ce qui rend ce lot compatible avec le renversement du 2026-08-06
// (`docs/keel/CALORIE_REVERSAL.md`): « au moins 182 kcal pour 100 g » décrit ce
// qu'on met dans une casserole. « Tu vises 3 180 kcal » décrirait quelqu'un.
// Le premier se rend au modèle; le second ne sort JAMAIS de ce fichier.

/**
 * LA DENSITÉ LA PLUS HAUTE QU'ON PUISSE DEMANDER À UN PLAT — 2026-09-08.
 *
 * ⛔ CONVENTION, ET ELLE VIENT D'UN TIR. Le second tir sur `qa-genty-clone` a
 * exigé **389 kcal/100 g** au dîner. Aucun plat ne tient ça: un gratin
 * dauphinois fait 180, des lasagnes 150, un parmentier de canard 230. À 389 on
 * ne demande plus un plat, on demande une pâte à tartiner — et le modèle a
 * rendu 126,7, c'est-à-dire qu'il a ignoré la consigne.
 *
 * ⛔ UNE CONSIGNE INTENABLE EST PIRE QU'UNE CONSIGNE ABSENTE. Elle apprend au
 * modèle que ces nombres-là sont décoratifs, sur toute la ligne — y compris aux
 * moments où l'exigence était atteignable.
 *
 * ── D'OÙ VENAIT LE 389, ET POURQUOI CE N'EST PAS UN BUG DE CALCUL ────────
 * Le `max` sur les jours: la veille de cuisine ne porte souvent qu'UN moment
 * pour cette bouche, donc ce moment-là pèse la journée entière, et sa densité
 * requise explose. Le calcul est juste; c'est ce qu'on en DEMANDE qui doit être
 * borné. Le besoin réel n'est pas perdu pour autant — il continue de sortir en
 * `unmet_kcal` quand l'assiette plafonne, ce qui est la réponse honnête: « ce
 * jour-là, un seul repas ne peut pas porter la journée ».
 *
 * ⚠️ ELLE DOIT MORDRE RAREMENT, ET DONC SE COMPTER (`counters.capped`). Une
 * borne qui mord sur la population entière n'est plus une borne, c'est le
 * calcul — ce dépôt l'a déjà mesuré trois fois (`ANCHOR_FACTOR_MAX`,
 * `BOX_FACTOR_MIN`, et le défunt `COMPOSED_DISH_MIN_MEAL_SHARE`, retiré le
 * 2026-09-10 avec les extras qu'il bornait).
 */
export const MAX_ASKABLE_DENSITY_PER_100G = 250;

/** Ce qu'un moment exige du plat qu'on y sert. */
/**
 * ⟳ 2026-09-10 — POURQUOI UNE INCOMPATIBILITÉ SE NOMME AU LIEU DE SE TAIRE.
 *
 * ⛔ « Une consigne intenable est pire qu'une consigne absente: elle apprend au
 * modèle que ces nombres-là sont décoratifs, sur toute la ligne. » C'est la
 * règle de `MAX_ASKABLE_DENSITY_PER_100G`, mesurée (389 demandés au dîner,
 * 126,7 rendus). Quand le besoin sort du couloir demandable, on ne rabote pas
 * le minimum en silence: on demande ce qui est tenable ET on écrit que le
 * besoin, lui, ne l'était pas. La différence continue de sortir en `unmet_kcal`.
 */
// ⟳ 2026-09-10 · LOT 4 — `empty_intersection` REJOINT LE VOCABULAIRE.
// ⛔ Deux jours qui partagent un moment peuvent avoir des couloirs disjoints:
// un lundi à [140, 160] et un jeudi à [100, 120] n'ont AUCUNE densité commune.
// Jusqu'ici la fusion gardait le couloir du jour le plus exigeant et taisait
// le conflit — le modèle recevait une bande tenable pour un jour et intenable
// pour l'autre, sans que rien ne le dise.
export const DENSITY_INCOMPATIBILITIES = [
  "above_askable_cap",
  "empty_intersection",
] as const;
export type DensityIncompatibility = (typeof DENSITY_INCOMPATIBILITIES)[number];

export interface SlotDensity {
  slot: string;
  /**
   * ⟳ 2026-09-11 · LOT B — LES JOURS QUE CETTE LIGNE COUVRE.
   *
   * ⛔ REQUIS, jamais `?`. Sans lui, deux lignes du même moment sont
   * indiscernables — et c'est très exactement ce que le chantier interdit :
   * « ne pas fusionner tous les dîners par leur valeur maximale ; une consigne
   * commune n'est possible que si les contrats sont effectivement compatibles
   * et les cases concernées restent IDENTIFIABLES ».
   *
   * ⚠️ `[]` EST ADMIS ET SIGNIFIE « CETTE LIGNE NE DIT PAS SES JOURS » — un
   * décor de test qui monte un `SlotDensity` à la main, ou un chemin qui n'a
   * pas de calendrier. Les lecteurs qui cherchent une date (`cellDensityOf`)
   * traitent ce cas comme « elle vaut pour tous les jours », ce qui est le
   * comportement d'avant ce lot.
   */
  days: readonly string[];
  /**
   * La borne BASSE du couloir — « au moins N kcal pour 100 g ».
   *
   * ⚠️ C'est le champ historique, et il garde son nom parce que c'est lui que
   * la ligne du prompt rend. Il vaut `minPer100G`.
   */
  kcalPer100G: number;
  /** ⟳ 2026-09-10 — le couloir: `100 × E / Gmax`. */
  minPer100G: number;
  /** ⟳ 2026-09-10 — le couloir: `100 × E / Gmin`. En dessous, l'assiette est vide. */
  maxPer100G: number;
  /** ⟳ 2026-09-10 — la visée, projetée DANS `[min, max]`. */
  preferredPer100G: number;
  /**
   * ⟳ 2026-09-10 — ce que le besoin demanderait SANS le plafond de demande.
   * Égal à `minPer100G` dans le cas nominal; au-dessus quand le plafond mord.
   */
  neededMinPer100G: number;
  /**
   * ⟳ 2026-09-10 · LOT 4 — LA BORNE BASSE N'AJOUTE RIEN AU PLANCHER DU BLOC.
   *
   * ⛔ CE DRAPEAU REMPLACE UN FILTRE QUI JETAIT LA LIGNE ENTIÈRE. Jusqu'ici,
   * un moment dont `min` ne dépassait pas le plancher commun (100, ou 60 en
   * léger) était SUPPRIMÉ — et son PLAFOND partait avec lui, alors que le
   * plancher du bloc ne le porte pas et que rien d'autre ne le porte non plus.
   * Un goûter de 250 kcal a un couloir [100, 135]: le jeter, c'est perdre le
   * 135.
   *
   * Ce qui reste vrai de l'objection d'origine — « répéter au moins 100 en
   * face d'un goûter ajoute un nombre sans ajouter une contrainte, et un brief
   * qui répète cesse d'être lu » — est une question de RENDU, pas de calcul.
   * Le rédacteur du brief lit ce drapeau et écrit « au plus 135 » au lieu de
   * « entre 100 et 135 ». L'information ne se perd plus pour éviter une
   * répétition.
   */
  redundantMin: boolean;
  /**
   * ⟳ 2026-09-10 · LOT 4 — SUR COMBIEN D'OCCURRENCES CE COULOIR A ÉTÉ CROISÉ.
   * 1 = un seul jour. Au-delà, `min` est le MAX des occurrences et `max` leur
   * MIN: la bande commune, pas celle du jour le plus exigeant.
   */
  occurrences: number;
  /** ⟳ 2026-09-10 — `null` = le couloir est tenable tel quel. */
  incompatible: DensityIncompatibility | null;
  /** Le moment est marqué « léger »: son plancher n'est pas celui d'un repas. */
  light: boolean;
  /**
   * ⟳ 2026-09-11 — CE QUE LA CIBLE IMPLIQUERAIT, À CÔTÉ DE CE QU'ON DEMANDE.
   *
   * `100 × E / Gpréf`, **brut**: ni rabattu dans le couloir, ni plafonné. C'est
   * le témoin de l'arbitrage **A15** (`docs/keel/CHANTIER-DENSITE-PORTIONS-ET-FAST.md`):
   * `preferredPer100G` reste ancré au BAS du couloir parce que `100 × E / Gpréf`
   * rend 236 kcal/100 g sur un déjeuner de 1 120 kcal, quand les plats réels de
   * ce dépôt vivent entre 113 et 156 — mesuré, 389 demandés et 126,7 rendus.
   *
   * ⛔ IL EST ICI POUR QUE LA SUBSTITUTION CESSE D'ÊTRE SILENCIEUSE. Le
   * chantier du 2026-09-11 ne demande pas de revenir à cette formule, il
   * demande que les deux nombres soient NOMMÉS quand ils divergent —
   * `densityFragment` (`household_portions.ts`) le fait au-delà de
   * `ANCHOR_DIVERGENCE_RATIO`.
   *
   * ⚠️ `null` EST ADMIS PAR LE TYPE ET N'ARRIVE PAS PAR CE CHEMIN:
   * `densityCorridorFor` rend `null` pour le couloir ENTIER quand la masse
   * préférée manque, donc la projection ci-dessous n'a jamais de témoin
   * absent. Le `null` existe pour les décors de test qui montent un
   * `SlotDensity` à la main sans témoin — il ne décrit pas un état du moteur.
   */
  targetAnchoredPer100G: number | null;
}

/**
 * LA DENSITÉ REQUISE D'UNE BOUCHE, ET OÙ ELLE A LE DROIT D'ÊTRE DITE.
 *
 * ⛔ DEUX LISTES, ET LA SÉPARATION EST LA GARDE — PAS UNE COMMODITÉ. Sous
 * plancher TCA (`gapClosed: "restriction_floor"`), le plan continue de
 * dimensionner (c'est la décision du lot 6: refuser de dimensionner ne protège
 * personne, ça sert une assiette au hasard) mais **plus rien ne peut être écrit
 * en face du nom de cette personne**. Sa densité part donc dans `floorOnly`, où
 * `densityFloorsOf` la fond dans le plancher COMMUN du bloc, avec celles de
 * tout le monde: le modèle reçoit le nombre, personne ne reçoit la personne.
 */
export interface RequiredDensity {
  /** Rendues sur la ligne de la personne, dans le brief. */
  named: readonly SlotDensity[];
  /** Fondues anonymement dans le plancher du bloc. JAMAIS nommées. */
  floorOnly: readonly SlotDensity[];
  reason: AnchorReason;
  gapClosed: DayTargetGapClosed;
  counters: {
    /** Les moments examinés, tous jours confondus. */
    slots: number;
    /** Ceux dont la densité requise dépasse le plancher de leur classe. */
    above_floor: number;
    /** Ceux dont la densité DIFFÈRE d'un jour à l'autre (on garde le max). */
    days_varied: number;
    /**
     * Ceux dont l'exigence a été rabotée par `MAX_ASKABLE_DENSITY_PER_100G`.
     * ⛔ IL DOIT RESTER PROCHE DE ZÉRO: voir le pavé de la constante.
     */
    capped: number;
    /**
     * ⟳ 2026-09-10 — CEUX QUE LES APPORTS FIXES COUVRENT DÉJÀ ENTIÈREMENT.
     *
     * ⛔ IL EXISTE PARCE QUE LE PLANCHER DE 30 % A ÉTÉ RETIRÉ. Tant qu'il
     * vivait, une part de moment ne pouvait pas tomber à zéro; elle le peut
     * désormais, et ce compteur est ce qui distingue « ce cas n'arrive
     * jamais » de « le shaker mange le goûter de tout le monde ».
     */
    fixed_covered: number;
    /**
     * ⟳ 2026-09-10 · LOT 4 — CEUX QUE L'ANCIEN FILTRE JETAIT.
     *
     * ⛔ Non nul, il dit combien de PLAFONDS le produit perdait à chaque plan
     * avant ce lot: la ligne était supprimée parce que sa borne BASSE
     * n'ajoutait rien au bloc, et sa borne HAUTE — que rien d'autre ne porte —
     * partait avec elle.
     */
    floor_min_kept: number;
    /**
     * ⟳ 2026-09-10 · LOT 4 — DEUX OCCURRENCES SANS DENSITÉ COMMUNE.
     *
     * ⚠️ IL DOIT RESTER RARE. S'il grimpe, la grille d'un moment change trop
     * d'un jour à l'autre pour qu'une seule recette les serve, et la sortie
     * est une recette SÉPARÉE — pas une bande moyenne qu'aucun jour ne tient.
     */
    empty_intersection: number;
    /**
     * ⟳ 2026-09-11 — LES JOURNÉES DONT L'ÉNERGIE A ÉTÉ DÉPLACÉE pour qu'un
     * moment intenable redevienne composable. Somme conservée, apports fixes
     * et moments légers respectés (`redistributeDayBudget`).
     */
    relaxed_days: number;
    /**
     * ⛔ POURQUOI UNE JOURNÉE N'A PAS PU ÊTRE RELÂCHÉE. `no_room_in_day` dit
     * que les assiettes de la journée ne suffisent pas, quel que soit le
     * partage; `nothing_movable` que tout y est figé. Dans les deux cas le
     * conflit RESTE, et le couloir garde son `incompatible`.
     */
    relax_refused: Record<string, number>;
  };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-11 · LOT B — `requiredDensityFor` A DÉMÉNAGÉ, ET VOICI POURQUOI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Elle vit désormais dans `slot_nutrition_contract.ts`, avec un paramètre de
 * plus: `rhythmSlots`, le rythme alimentaire COMPLET de la bouche.
 *
 * ⛔ CE QU'ELLE FAISAIT ICI, ET CE QUE ÇA COÛTAIT. Elle prenait pour
 * dénominateur les seuls moments PRÉSENTS DANS LA GRILLE de chaque jour. Un
 * vendredi qui ne porte que son dîner donnait donc la JOURNÉE ENTIÈRE à ce
 * dîner. Mesuré le 2026-09-11: la case `PERTE / 2026-09-11 / dinner` valait
 * **858,90 kcal** pour le dimensionnement et **2 454,00** pour le couloir
 * envoyé au modèle — un facteur **2,86** sur la même case. Et comme les
 * couloirs étaient repliés par NOM DE MOMENT, sans clé de date, ce vendredi
 * imposait son [250–250] `above_askable_cap` aux dîners du samedi et du
 * dimanche, qui méritaient [123–250] visée 135.
 *
 * ⚠️ CE QUI RESTE ICI EST CE QU'ELLE APPELAIT: `dayTargetFor`,
 * `plateBoundsFor`, `densityCorridorFor`, `mergeCorridors`,
 * `relaxDayForCorridors`. Le contrat les appelle entières; aucune
 * arithmétique n'a été recopiée.
 */
/**
 * ⟳ 2026-09-10 · LOT 4 — DEUX OCCURRENCES D'UN MÊME MOMENT, UNE SEULE BANDE.
 *
 * `max(Dmin)` et `min(Dmax)`, la règle du chantier pour une recette partagée
 * ou réutilisée. C'est la même arithmétique que `intersectCorridors` applique
 * côté réparation; elle vit ici en clair parce que ce chemin-ci doit aussi
 * NOMMER l'intersection vide, ce dont la réparation n'a pas besoin.
 *
 * ⛔ UNE INTERSECTION VIDE NE SE REFERME PAS EN MOYENNE. Quand les deux bandes
 * sont disjointes, on garde `min` (la contrainte la plus haute, celle qui
 * protège l'assiette de déborder) et on POSE le motif. Fabriquer une bande
 * tenable en rabotant l'une des deux ferait exactement ce que le chantier
 * interdit: « ne pas tronquer un minimum impossible pour fabriquer un couloir
 * valide ».
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function mergeCorridors(
  a: DensityCorridor,
  b: DensityCorridor,
): DensityCorridor {
  const min = Math.max(a.minPer100G, b.minPer100G);
  const max = Math.min(a.maxPer100G, b.maxPer100G);
  const vide = min > max;
  // La visée reste DANS la bande commune. Sur une intersection vide il n'y a
  // pas de bande: on vise le plancher, seul point que les deux respectent par
  // le haut.
  const preferred = vide ? min : Math.min(
    max,
    Math.max(min, Math.max(a.preferredPer100G, b.preferredPer100G)),
  );
  // ⟳ 2026-09-11 · LOT B — LE TÉMOIN DE LA CIBLE SUIT LA MÊME RÈGLE QUE LE
  // PLANCHER: le plus EXIGEANT des deux. Deux bouches sur la même recette
  // n'impliquent pas la même densité; garder la plus haute dit ce que la bande
  // commune coûterait à celle qui demande le plus.
  const anchored = Math.max(a.targetAnchoredPer100G, b.targetAnchoredPer100G);
  return {
    minPer100G: min,
    maxPer100G: vide ? min : max,
    preferredPer100G: preferred,
    neededMinPer100G: Math.max(a.neededMinPer100G, b.neededMinPer100G),
    targetAnchoredPer100G: anchored,
    anchorDivergencePer100G: anchored - preferred,
    // ⚠️ `above_askable_cap` GARDE LA PRIORITÉ: un besoin au-dessus du plafond
    // de demande est un fait sur le besoin, l'intersection vide un fait sur la
    // grille. Le premier se répare en changeant la portion, le second en
    // séparant les recettes — et on ne peut en nommer qu'un.
    incompatible: a.incompatible ?? b.incompatible ??
      (vide ? "empty_intersection" : null),
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-11 — LA SORTIE D'UN COULOIR INTENABLE: DÉPLACER, PUIS RECALCULER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUE CECI FERME. `redistributeDayBudget` a été écrite au lot 4, éprouvée
 * à onze cas — et **aucun code de production ne l'appelait**. Le lot 4 en fait
 * la sortie du couloir vide; le couloir vide se produit, et ne déclenchait
 * rien. C'est le mode d'échec « ceinture armée sur coffre vide », posé par
 * celui-là même qui passe sa nuit à le nommer.
 *
 * ⛔ ET CE N'EST PAS UN SIMPLE APPEL. Déplacer de l'énergie change les cibles
 * de moment, donc les bornes d'assiette, donc les couloirs. Une redistribution
 * qui ne serait pas suivie d'un RECALCUL rendrait des couloirs calculés sur une
 * journée qui n'existe plus — exactement le défaut que le lot 5 vient de fermer
 * en aval. Cette fonction rend donc les NOUVELLES cibles, et l'appelant
 * recalcule tout depuis elles.
 *
 * ⛔ ET SI LE CONFLIT NE SE RÉSOUT PAS, IL RESTE EXPLICITE. On ne rabote pas, on
 * ne moyenne pas, on ne baisse pas la journée en silence: `moved: 0` et le
 * couloir garde son `incompatible`. Le chantier l'exige — « si aucune
 * allocation compatible n'existe, conserver le conflit ».
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function relaxDayForCorridors(args: {
  /** Moment → cible actuelle, telle que `slotPlanTargets` l'a rendue. */
  targets: ReadonlyMap<string, number>;
  /** Moment → la masse maximale de cette bouche à ce moment-là. */
  maxGramsBySlot: ReadonlyMap<string, number>;
  /** Les moments que rien ne peut déplacer: apport fixe, dehors, gelé. */
  lockedSlots: readonly string[];
  lightSlots: readonly string[];
}): {
  targets: ReadonlyMap<string, number>;
  moved: number;
  refusal: string | null;
} {
  const locked = new Set(args.lockedSlots);
  const light = new Set(args.lightSlots);
  const slots: RedistributableSlot[] = [...args.targets].map((
    [slot, targetKcal],
  ) => ({
    slot,
    targetKcal,
    // ⚠️ SANS MASSE CONNUE, LE MOMENT EST FIGÉ. Lui inventer une capacité
    // ferait déplacer de l'énergie vers une assiette dont on ne sait rien.
    maxGrams: args.maxGramsBySlot.get(slot) ?? 0,
    locked: locked.has(slot) || !args.maxGramsBySlot.has(slot),
    light: light.has(slot),
  }));
  const out = redistributeDayBudget(slots);
  if (!out.ok) return { targets: args.targets, moved: 0, refusal: out.reason };
  return { targets: out.bySlot, moved: out.moved, refusal: null };
}


/**
 * L'ORDRE D'UNE JOURNÉE. Un moment inconnu part à la fin, dans l'ordre où il
 * est arrivé — on ne devine pas l'heure d'un jeton qu'on ne connaît pas.
 */
export function slotOrderOf(slot: string): number {
  const i = DAY_SLOT_ORDER.indexOf(slot);
  return i < 0 ? DAY_SLOT_ORDER.length : i;
}

/**
 * ⚠️ MIROIR DE `WEIGHTED_SLOTS` (`mouth_anchor.ts`), ET PAS UN IMPORT — c'est
 * l'idiome de ce dépôt pour deux listes qui doivent se ressembler sans se
 * tirer l'une l'autre. Un test les compare. `snack` est le jeton legacy, il
 * n'a pas d'heure connue: il tombe en fin de journée avec les inconnus.
 */
const DAY_SLOT_ORDER: readonly string[] = Object.freeze([
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
]);

// ═══════════════════════════════════════════════════════════════════════════
// ⑪ LE PLAT DÉDIÉ — quand tout ce que la bouche mange est gelé (2026-09-08)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ IL NE SE DÉCLENCHE JAMAIS À UNE BOUCHE, ET C'EST STRUCTUREL. Une bouche
// seule ne contredit personne: `repairabilityOf` rend `reworkable` sur chaque
// unité de son plat, donc il y a toujours quelque chose à réécrire. Ce bloc est
// écrit ici, avec ses tests, parce que la RÈGLE des mangeurs est décidée ici —
// et parce qu'une décision qui vit dans la tête de celui qui l'a prise se perd.
// Son CÂBLAGE appartient à la lane du foyer (lot 14 du plan foyer): il demande
// que la bouche soit dans `dishBearerIds` (sans quoi le parseur refuse
// `for_member_id`) et que la fusion ne perde pas le plat dédié de la case.
//
// ── LA SYMÉTRIE N'EST PAS DÉCORATIVE ──────────────────────────────────────
// « Trop dense » et « trop maigre » ne sont pas l'un le cas normal et l'autre
// l'exception. Un plat riche servi à quelqu'un qui perd du poids passe SOUS son
// plancher d'assiette — sa part de ce plat tient dans trois cuillères — et il a
// besoin de volume, exactement comme l'autre a besoin de densité. Le même
// mécanisme, en miroir.

/** Ce qu'on demande au modèle d'ajouter, pour une bouche et un moment. */
export interface DedicatedRepair {
  memberId: string;
  day: string;
  slot: string;
  direction: RepairDirection;
  /** La densité que ce plat À ELLE doit porter. */
  aimPer100G: number;
  /** Plancher d\'une demande « alléger » (voir `RepairAsk.floorPer100G`) ; `null` en densify. */
  floorPer100G: number | null;
}

/**
 * COMBIEN D'ENTRÉES DE DERNIER RECOURS PAR PLAN, AU PLUS.
 *
 * ⛔ ÉPINGLÉ. C'est UN appel modèle de plus par plan quand il se déclenche —
 * quel que soit le nombre d'entrées demandées — et il ne se déclenche que pour
 * les BLOQUÉS, ceux qu'aucune réécriture ne pouvait servir. Au-delà, on compte
 * (`skipped_budget`).
 *
 * ⟳ 2026-09-09 — DE DEUX À QUATRE. Mesuré au tir COMP2 (cinq bouches, un
 * jour) : quatre bloqués sur le plan final — deux « trop petit » au
 * petit-déjeuner, deux « trop gros » (1 021 g, 879 g) pour l'adulte en prise —
 * et le budget de deux servait les premiers dans l'ordre des plats. Depuis que
 * l'entrée COMPLÈTE la part rabotée, une entrée par bloqué est la réponse
 * juste, et elle ne coûte pas un appel de plus.
 */
export const DEDICATED_REPAIR_MAX_PER_PLAN = 4;

/**
 * FAUT-IL UN PLAT À ELLE ? — seulement si tout le reste est gelé.
 *
 * ⛔ « TOUT », C'EST LE FRAIS **ET** CHAQUE CASSEROLE. Tant qu'une seule unité
 * bouge, on répare la recette: ajouter un plat pendant qu'on pouvait réécrire
 * celui qui existe fait deux plats là où la personne en attendait un, et le
 * second n'a été demandé par personne.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function dedicatedRepairFor(args: {
  memberId: string;
  day: string;
  slot: string;
  ask: RepairAsk;
  freshRepairability: Repairability;
  pots: readonly { id: string; repairability: Repairability }[];
}): DedicatedRepair | null {
  if (args.freshRepairability === "reworkable") return null;
  if (args.pots.some((p) => p.repairability === "reworkable")) return null;
  return {
    memberId: args.memberId,
    day: args.day,
    slot: args.slot,
    direction: args.ask.direction,
    aimPer100G: args.ask.aimPer100G,
    floorPer100G: args.ask.floorPer100G,
  };
}

/**
 * CE QU'ON DEMANDE AU MODÈLE — un plat de plus, au nom de quelqu'un.
 *
 * ⛔ AUCUN PRÉNOM, AUCUNE CIBLE DE JOURNÉE, AUCUN KG. Le `for_member_id` est un
 * identifiant, pas une personne: le modèle n'apprend rien de qui il nourrit. La
 * seule grandeur qui sort est la densité, qui est une propriété du plat — même
 * règle que `repairInstruction`, et un test la lit.
 *
 * ⚠️ ON NOMME DES ALIMENTS, PAS UNE CONSIGNE ABSTRAITE. « Rends ce plat dense »
 * a déjà été mesuré comme insuffisant le 2026-09-07: le modèle obéit dans le bon
 * sens et s'arrête à mi-chemin. « Des noix, du fromage, de l'huile, du pain »
 * lui donne des ordres de grandeur qu'il connaît.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function dedicatedDishInstruction(
  asks: readonly DedicatedRepair[],
): string | null {
  if (asks.length === 0) return null;
  // ⟳ 2026-09-09 — UN COMPLÉMENT, PAS UN REMPLACEMENT. La personne GARDE le
  // plat partagé : le moteur rabote sa part à la borne et dimensionne ce plat-ci
  // à la différence (`splitPlateWithComplement`). Le texte le dit au modèle
  // pour qu'il écrive une entrée, pas un repas — mesuré avant : « beside the
  // shared dish » seul rendait des plats entiers, et le moteur retirait la
  // personne de la table.
  const lines = asks.map((a) =>
    a.direction === "densify"
      ? `- On ${a.day} at ${a.slot}, add ONE small side dish with for_member_id ` +
        `"${a.memberId}", and nothing else changes. That person keeps eating the ` +
        `shared dish: the app cuts their share of it and sizes this side dish to ` +
        `the difference. It has to carry at least ${a.aimPer100G} kcal per 100 g ` +
        `as served: nuts, cheese, oil, bread, a spoon of nut butter — small and rich.`
      : `- On ${a.day} at ${a.slot}, add ONE side dish with for_member_id ` +
        `"${a.memberId}", and nothing else changes. That person keeps eating the ` +
        `shared dish: the app cuts their share of it and sizes this side dish to ` +
        `the difference. ` +
        (a.floorPer100G === null
          ? `It has to stay at or under ${a.aimPer100G} kcal per 100 g as served — `
          : `It has to land between ${a.floorPer100G} and ${a.aimPer100G} kcal per 100 g as served — `) +
        `bulky and light (vegetables, a salad, a soup WITH something in it).` +
        (a.floorPer100G === null
          ? ""
          : ` Below ${a.floorPer100G} the plate becomes enormous.`)
  );
  return [
    "ONE PERSON CANNOT BE SERVED FROM THE SHARED POTS ALONE. The pots are eaten",
    "by others too, so they stay as they are — give that person a side dish of",
    "their own, eaten WITH the shared dish:",
    ...lines,
    "⛔ Do not touch any other dish, any preparation, or anyone else's plate.",
    "Return the full plan JSON with only these dishes added.",
  ].join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑬ LE COMPLÉMENT — raboter la part gelée à la borne, l'entrée porte le reste
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-09 — DÉCISION DU PROPRIÉTAIRE : « dans le cas où tout est gelé,
// on diminue la portion et on ajoute de la calorie dans l'entrée ». Avant, la
// table ne rabotait JAMAIS (`served_over_max` compté, rien de fait) et le plat
// ajouté REMPLAÇAIT l'assiette partagée (`mouthsFedByDish` retirait la personne
// de la table), dimensionné à sa cible ENTIÈRE : « une petite entrée riche » de
// 700 kcal, ou un bouillon accepté parce qu'il ne dégradait rien.
//
// ⛔ DEUX INCONNUES, DEUX ÉQUATIONS, ET RIEN D'AUTRE. Pour une personne dont la
// part du plat partagé (densité ρs) sort de sa borne, et un complément de
// densité ρc :
//
//     masse   : gS + gC = borne         (max si trop gros, min si trop petit)
//     énergie : gS·ρs + gC·ρc = cible
//
//     ⇒ gC = (cible − borne·ρs) ÷ (ρc − ρs),   gS = borne − gC
//
// Trop gros ⇒ le numérateur est positif, donc il faut ρc > ρs (plus dense) ;
// trop petit ⇒ négatif, donc ρc < ρs (plus léger). Un complément du mauvais
// côté, ou qui prendrait toute l'assiette (gC ≥ borne), ne résout rien : on
// rend `null`, l'appelant retire le plat et le compte. Pas de « presque ».

/**
 * LA PART DE L'ASSIETTE QUE LE COMPLÉMENT PEUT PRENDRE, quand le modèle atteint
 * exactement la densité demandée — c'est ce qui fait une ENTRÉE et pas un
 * second plat. 0,2 × 700 g = 140 g de pain-fromage à côté de 560 g de plat.
 *
 * ⚠️ C'EST LA DEMANDE, PAS UNE BORNE : plus dense que demandé ⇒ plus petit ;
 * moins dense ⇒ plus gros, tant que `splitPlateWithComplement` résout.
 */
export const COMPLEMENT_PLATE_SHARE = 0.2;

/**
 * LA DENSITÉ À DEMANDER POUR UN COMPLÉMENT — celle qui lui donne
 * `COMPLEMENT_PLATE_SHARE` de l'assiette.
 *
 * ⛔ CE N'EST PAS `repairDecisionForDish` SUR UNE LIGNE : celle-là rend la
 * densité qu'il faudrait à l'ASSIETTE ENTIÈRE (cible ÷ plafond), ce qui, pour
 * un complément, donne un plat qui déplace la moitié de la table. Ici :
 *
 *     trop gros  : ρc = ρs + (cible − max·ρs) ÷ (part·max)
 *     trop petit : ρc = ρs ÷ 2   (⇒ gC = 2 × la masse qui manque)
 *
 * Ni cible, ni borne, ni prénom ne sortent : une densité, propriété du plat.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function complementAskFor(args: {
  shared: StandardPortion;
  targetKcal: number | null;
  bounds: PlateBounds;
  verdict: SizingVerdict;
}): RepairAsk | null {
  const { shared, targetKcal, bounds, verdict } = args;
  if (targetKcal === null || !(targetKcal > 0)) return null;
  if (shared.densityPer100G === null || !(shared.densityPer100G > 0)) {
    return null;
  }
  const rhoS = shared.densityPer100G / 100;
  const current = Math.round(shared.densityPer100G);
  if (verdict === "over_max") {
    const missing = targetKcal - bounds.max * rhoS;
    if (!(missing > 0)) return null;
    const rhoC = rhoS + missing / (COMPLEMENT_PLATE_SHARE * bounds.max);
    return {
      direction: "densify",
      currentPer100G: current,
      floorPer100G: null,
      // ⛔ UN COMPLÉMENT N'A PAS DE COULOIR, et c'est structurel: sa densité
      // sort d'une ÉQUATION à deux inconnues (masse totale = borne, énergie
      // totale = cible), pas d'un intervalle de plausibilité. Lui poser un
      // plafond de couloir demanderait « entre A et B » là où une seule valeur
      // résout — et un modèle à qui on donne une bande vise le milieu.
      ceilingPer100G: null,
      aimPer100G: Math.ceil(rhoC * 100),
    };
  }
  if (verdict === "under_min") {
    const excess = bounds.min * rhoS - targetKcal;
    if (!(excess > 0)) return null;
    return {
      direction: "lighten",
      currentPer100G: current,
      floorPer100G: null,
      ceilingPer100G: null,
      aimPer100G: Math.max(1, Math.floor(shared.densityPer100G / 2)),
    };
  }
  return null;
}

export interface PlateSplit {
  /** Le facteur de la personne sur le plat partagé, raboté. */
  sharedFactor: number;
  /** Le facteur de la personne sur le complément. */
  complementFactor: number;
  sharedG: number;
  complementG: number;
  /** Ce que le complément porte, en kcal — ce que le rabotage a retiré. */
  complementKcal: number;
  bound: "max" | "min";
}

/**
 * RABOTER LA PART PARTAGÉE À LA BORNE, ET FAIRE PORTER LE RESTE AU COMPLÉMENT.
 *
 * Voir le pavé ⑬. `null` quand il n'y a rien à compléter (`in_bounds`,
 * `unmeasurable`), quand une masse ou une énergie manque, ou quand le
 * complément ne peut pas résoudre (mauvais côté, ou toute l'assiette).
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function splitPlateWithComplement(args: {
  shared: StandardPortion;
  complement: StandardPortion;
  targetKcal: number | null;
  bounds: PlateBounds;
  verdict: SizingVerdict;
}): PlateSplit | null {
  const { shared, complement, targetKcal, bounds, verdict } = args;
  if (verdict !== "over_max" && verdict !== "under_min") return null;
  if (targetKcal === null || !(targetKcal > 0)) return null;
  const S = { kcal: shared.kcal, g: shared.cookedG };
  const C = { kcal: complement.kcal, g: complement.cookedG };
  if (S.kcal === null || S.g === null || !(S.kcal > 0) || !(S.g > 0)) {
    return null;
  }
  if (C.kcal === null || C.g === null || !(C.kcal > 0) || !(C.g > 0)) {
    return null;
  }
  const rhoS = S.kcal / S.g;
  const rhoC = C.kcal / C.g;
  const bound = verdict === "over_max" ? bounds.max : bounds.min;
  const denom = rhoC - rhoS;
  if (Math.abs(denom) < 1e-9) return null;
  const gC = (targetKcal - bound * rhoS) / denom;
  if (!(gC > 0) || !(gC < bound)) return null;
  const gS = bound - gC;
  return {
    sharedFactor: gS / S.g,
    complementFactor: gC / C.g,
    sharedG: Math.round(gS),
    complementG: Math.round(gC),
    complementKcal: Math.round(gC * rhoC),
    bound: verdict === "over_max" ? "max" : "min",
  };
}

/**
 * ABSORBER UN INDEX RÉPARÉ DANS L'INDEX VIVANT — en place, sans réassigner.
 *
 * ⟳ 2026-09-09 — L'entrée de dernier recours passe par le sas de remplissage
 * APRÈS que la lane a fermé `composition` dans une dizaine de fermetures
 * (`shadowSizing`, les demandes). Réassigner la variable ferait perdre son
 * rétrécissement à toutes ces fermetures (le compilateur le refuse, à juste
 * titre : une fermeture créée avant une réassignation ne peut plus supposer
 * `non null`). On copie donc les entrées NEUVES dans les tables existantes.
 *
 * ⚠️ `ReadonlyMap` est le contrat de LECTURE ; l'objet est un `Map` construit
 * par `buildCompositionIndex`. Le seul écrivain est ici, et il n'ajoute jamais
 * une entrée qui écraserait une entrée présente.
 *
 * PURE hors de la mutation demandée: no I/O, no clock, no randomness.
 */
export function absorbIndexInto(
  target: CompositionIndex,
  source: CompositionIndex,
): { slugs_added: number; aliases_added: number } {
  const bySlug = target.bySlug as Map<string, CompositionRef>;
  const byAlias = target.byAlias as Map<string, string>;
  let slugsAdded = 0;
  let aliasesAdded = 0;
  for (const [slug, ref] of source.bySlug) {
    if (bySlug.has(slug)) continue;
    bySlug.set(slug, ref);
    slugsAdded++;
  }
  for (const [alias, slug] of source.byAlias) {
    if (byAlias.has(alias) || !bySlug.has(slug)) continue;
    byAlias.set(alias, slug);
    aliasesAdded++;
  }
  return { slugs_added: slugsAdded, aliases_added: aliasesAdded };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-10 · LOT 4 — QUAND UN COULOIR EST VIDE, ON DÉPLACE DE L'ÉNERGIE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE CAS RÉEL: un moment dont le besoin dépasse ce qu'on s'autorise à
// demander (`neededMinPer100G > MAX_ASKABLE_DENSITY_PER_100G`). Sa part ne
// TIENT PAS dans son assiette, quelle que soit la recette. Jusqu'ici le
// produit rabotait la demande à 250 et servait une consigne qu'aucun plat ne
// peut respecter — et une consigne intenable apprend au modèle que ces
// nombres-là sont décoratifs.
//
// LA SORTIE PROPRE: la journée garde son total, et l'énergie change de moment.
// Un dîner qui déborde donne au déjeuner, qui a de la place.
//
// ⛔ CE QUI NE BOUGE JAMAIS — la liste est le contrat, pas une commodité:
//   · un apport fixe (le shaker est avalé, il ne se déplace pas);
//   · un repas dehors (personne ne compose au restaurant);
//   · une case consommée ou gelée (elle est déjà dans une assiette);
//   · un moment léger ne DÉPASSE PAS son budget de départ — « léger » est une
//     décision de la personne, pas une variable d'ajustement.
//
// ⛔ ET AUCUN NOUVEAU MOMENT. Ajouter un goûter pour faire tenir l'arithmétique
// serait décider à la place de quelqu'un ce qu'il mange. La journée n'a pas
// non plus le droit de baisser en silence: si rien ne tient, on rend le
// conflit, et l'appelant demande une recette séparée ou un complément ciblé.

/** Un moment de la journée, tel que la redistribution le voit. */
export interface RedistributableSlot {
  slot: string;
  /** Ce que ce moment porte aujourd'hui, en kcal à composer. */
  targetKcal: number;
  /**
   * La masse maximale que cette bouche peut mettre dans ce moment, en grammes
   * (`plateBoundsFor(...).max`). C'est elle qui, avec le plafond de demande,
   * borne l'énergie qu'un moment peut porter.
   */
  maxGrams: number;
  /**
   * `false` = ce moment est déplaçable. `true` = il est figé (apport fixe,
   * repas dehors, case consommée ou gelée).
   */
  locked: boolean;
  /** Un moment léger ne remonte jamais au-dessus de son budget de départ. */
  light: boolean;
}

export const REDISTRIBUTION_REFUSALS = [
  /** La somme des capacités des moments déplaçables ne suffit pas. */
  "no_room_in_day",
  /** Tout est figé: il n'y a rien à déplacer. */
  "nothing_movable",
] as const;
export type RedistributionRefusal = (typeof REDISTRIBUTION_REFUSALS)[number];

export type Redistribution =
  | {
    ok: true;
    /** Moment → nouvelle cible en kcal. Les figés y sont, inchangés. */
    bySlot: ReadonlyMap<string, number>;
    /** Combien de moments ont bougé. 0 = rien à faire, et c'est un succès. */
    moved: number;
  }
  | { ok: false; reason: RedistributionRefusal };

/**
 * L'ÉNERGIE QU'UN MOMENT PEUT PORTER AU PLUS, en kcal.
 *
 * ⚠️ `maxGrams × plafond / 100`, et rien d'autre. C'est la MÊME borne que le
 * couloir emploie à l'envers (`Dmin = 100 × E / Gmax`): au-delà, `Dmin`
 * dépasse le plafond de demande et la case devient intenable. Une seconde
 * définition de « ce moment est plein » divergerait de la première.
 */
function slotCapacityKcal(slot: RedistributableSlot): number {
  return (slot.maxGrams * MAX_ASKABLE_DENSITY_PER_100G) / 100;
}

/**
 * REDISTRIBUE UNE JOURNÉE. PURE: no I/O, no clock, no randomness.
 *
 * ⚠️ LA SOMME EST CONSERVÉE, AU CENTIÈME PRÈS. Ce n'est pas une élégance: une
 * redistribution qui perd 40 kcal en route creuse un déficit que personne n'a
 * demandé, et le fait sur la journée de quelqu'un qui vise une prise de masse.
 */
export function redistributeDayBudget(
  slots: readonly RedistributableSlot[],
): Redistribution {
  const movable = slots.filter((s) => !s.locked);
  if (movable.length === 0) return { ok: false, reason: "nothing_movable" };

  // Ce qu'il faut recaser: le total des moments déplaçables. Les figés gardent
  // leur cible et ne participent ni au don ni à la réception.
  const aRepartir = movable.reduce((n, s) => n + s.targetKcal, 0);

  // ── LA FAISABILITÉ, AVANT TOUT DÉPLACEMENT ────────────────────────────
  // ⛔ UN MOMENT LÉGER PLAFONNE À SON BUDGET DE DÉPART, pas à sa capacité
  // physique: le rendre « moins léger » pour équilibrer une journée
  // renverserait une décision de la personne.
  const plafond = (s: RedistributableSlot): number =>
    s.light ? s.targetKcal : slotCapacityKcal(s);
  const capaciteTotale = movable.reduce((n, s) => n + plafond(s), 0);
  // ⚠️ UNE TOLÉRANCE DE 0,01 kcal, ET ELLE EST ARITHMÉTIQUE, pas indulgente:
  // sans elle, une somme reconstituée en virgule flottante refuserait une
  // journée qui tient exactement.
  if (capaciteTotale + 0.01 < aRepartir) {
    return { ok: false, reason: "no_room_in_day" };
  }

  // ── LE REMPLISSAGE, PROPORTIONNEL AUX POIDS EXISTANTS ─────────────────
  // ⚠️ « LES POIDS EXISTANTS » SONT LES CIBLES ACTUELLES, et c'est voulu: elles
  // portent déjà `slotPlanTargets` — les poids de moment, le léger, le shaker
  // retranché. Repartir des poids bruts referait cette arithmétique une
  // seconde fois, et les deux divergeraient.
  //
  // Saturation: un moment qui atteint son plafond est FIGÉ à ce plafond, et le
  // reste se répartit entre les autres. On boucle jusqu'à ce que plus personne
  // ne sature — au plus une fois par moment.
  const sature = new Map<string, number>();
  let restants = [...movable];
  let reste = aRepartir;

  for (let passe = 0; passe <= movable.length; passe++) {
    const base = restants.reduce((n, s) => n + s.targetKcal, 0);
    if (restants.length === 0 || base <= 0) break;
    let aSature = false;
    const suivants: RedistributableSlot[] = [];
    let consomme = 0;
    for (const s of restants) {
      const part = (s.targetKcal / base) * reste;
      const cap = plafond(s);
      if (part > cap + 0.01) {
        sature.set(s.slot, cap);
        consomme += cap;
        aSature = true;
      } else {
        suivants.push(s);
      }
    }
    if (!aSature) {
      // Personne ne sature: la part proportionnelle est la bonne.
      for (const s of restants) {
        sature.set(s.slot, (s.targetKcal / base) * reste);
      }
      restants = [];
      break;
    }
    reste -= consomme;
    restants = suivants;
  }
  // Filet: un reste non placé (tous saturés) retombe sur le dernier non figé.
  // ⛔ IL NE DOIT PAS ARRIVER — la faisabilité l'a écarté plus haut — et s'il
  // arrive, perdre les kcal serait pire que les poser quelque part.
  for (const s of restants) sature.set(s.slot, plafond(s));

  const bySlot = new Map<string, number>();
  for (const s of slots) {
    bySlot.set(
      s.slot,
      s.locked ? s.targetKcal : (sature.get(s.slot) ?? s.targetKcal),
    );
  }
  let moved = 0;
  for (const s of movable) {
    if (Math.abs((bySlot.get(s.slot) ?? 0) - s.targetKcal) > 0.01) moved++;
  }
  return { ok: true, bySlot, moved };
}
