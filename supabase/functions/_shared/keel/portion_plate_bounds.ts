// ═══════════════════════════════════════════════════════════════════════════
// LA PART D'UNE PERSONNE — LES BORNES DE L'ASSIETTE (`PLATE_MASS_BOUNDS_G`)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `portion_sizing.ts` (découpage des gros
// fichiers, lot 2e). Aucune logique changée. `portion_sizing.ts` ré-exporte
// tout ce qui est exporté ici : les appelants continuent d'importer depuis lui.
// Ce module n'importe jamais `portion_sizing.ts`.
//
// Ce qui est ici : la table des bornes par âge et par moment, le plafond dur,
// les bornes personnelles (`personalPlateBoundsFor`), `plateBoundsFor` et
// `hardCeilingBoundsFor`. Le bloc « l'appétit revient ici » qui ouvrait
// `portion_sizing.ts` est venu avec : il parle de ces bornes.

import type { AppetiteLevel } from "./tokens.ts";
import {
  LIGHT_MEAL_KCAL_PER_G_FLOOR,
  MEAL_KCAL_PER_G_COMPOSED,
  MEAL_KCAL_PER_G_FLOOR,
} from "./mouth_anchor.ts";
import { appetiteFactorOf } from "./meal_envelope.ts";

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
 *
 * ⟳ 2026-09-23 — ⚠️ CES RAPPORTS SONT CEUX D'AVANT LE PLAT À 550 g, ET ILS NE
 * SONT PAS REFAITS. Ils ont été pris sur les plafonds de repas de l'époque
 * (adulte 700, adolescent 650). Le repas adulte et adolescent passe à 550 g
 * (ci-dessous); les collations, elles, ne bougent pas: le chantier des
 * à-côtés change le PLAT, pas l'estomac. Refaire les rapports sur 550 aurait
 * rétréci les collations au moment même où elles reçoivent le débordement du
 * déjeuner (`relaxSharedForTable`). Ne pas les « corriger » par symétrie.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-23 — LE PLAT ADULTE PASSE DE 700 À 550 g (chantier « assiettes
 * normales », décision n° 3 du propriétaire)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT, AVEC SON CHIFFRE (`docs/keel/AUDIT-DOSAGES-2026-09-23.md`):
 * un seul plat portait tout le repas, et la recette commune était écrite pour
 * le plus gros mangeur — Thomas arrivait à 700 g d'assiette PAR CONSTRUCTION.
 * Le plat ne porte plus tout le repas: un à-côté (entrée, fromage, dessert,
 * pain) prend sa part, hors de l'assiette (`side_courses_types.ts`).
 *
 * ⚠️ 700 g N'A PAS DISPARU: c'est le plafond de REPLI (`PLATE_HARD_CEILING_G`),
 * posé seulement quand le débordement d'un moment n'a trouvé aucune collation
 * où aller (`slotContractsFor`, `overflow: "hard_ceiling"`).
 *
 * ⚠️ L'ADOLESCENT DESCEND AUSSI À 550 (650 avant): sinon son plat serait plus
 * grand que celui de l'adulte. Enfant et tout-petit ne bougent pas.
 */
export const PLATE_MASS_BOUNDS_G = Object.freeze({
  adult: Object.freeze({
    meal: Object.freeze({ min: 250, max: 550 }),
    snack: Object.freeze({ min: 80, max: 300 }),
  }),
  teen: Object.freeze({
    meal: Object.freeze({ min: 250, max: 550 }),
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

/**
 * ⟳ 2026-09-23 — LE PLAFOND DE REPLI D'UNE ASSIETTE, en grammes.
 *
 * ⛔ CE N'EST PAS UNE BORNE ORDINAIRE, ET PERSONNE NE LA DEMANDE. Le plat vise
 * `PLATE_MASS_BOUNDS_G` (550 g chez l'adulte). Quand un moment déborde — son
 * plat dépasserait 550 g à la densité de table — le surplus part d'abord aux
 * collations de la même personne (`relaxSharedForTable`). S'il n'en a pas, ou
 * qu'elles sont pleines, l'énergie de la journée reste un contrat: le plat
 * MONTE, et seulement jusqu'ici. Décision n° 1 du propriétaire, 2026-09-23:
 * « le surplus va d'abord à ses collations, sinon le plat monte jusqu'à
 * 700 g ». Le compteur `overflow_to_dish` dit combien de moments y sont allés.
 *
 * ⚠️ SEUL LE REPAS ADULTE A UN REPLI. Les autres tranches et les collations
 * retombent sur le plafond de leur table (`hardCeilingBoundsFor`): un repli
 * au-dessus de la capacité d'estomac d'un enfant n'est pas un repli, c'est une
 * assiette d'adulte servie à un corps qui n'en est pas un.
 */
export const PLATE_HARD_CEILING_G: Readonly<
  Partial<Record<PlateBoundBand, Readonly<Partial<Record<PlateSlotClass, number>>>>>
> = Object.freeze({
  adult: Object.freeze({ meal: 700 }),
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

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-24 — LE PLAFOND D'ASSIETTE PROPRE À CHAQUE ADULTE (« l'assiette
// suit l'entretien »)
// ═══════════════════════════════════════════════════════════════════════════
//
// ── LE DÉFAUT, AVEC SON CHIFFRE ──────────────────────────────────────────
// `PLATE_MASS_BOUNDS_G.adult.meal` vaut 550 g pour TOUS les adultes. Dès qu'un
// repas dépasse 550 kcal, le plafond est donc le même pour tout le monde, et
// le seuil où l'à-côté grossit (`sideBudgetFor`, 550 × 1,15 = 632,5 kcal) aussi.
// Christèle (maintien, entretien 1 920) a un plat de 658 kcal au déjeuner: il
// ne déclenche jamais ce seuil, et son plat pèse 516 g en médiane.
//
// ── LA RÈGLE, DÉCIDÉE PAR LE PROPRIÉTAIRE ────────────────────────────────
//     plafond = 25 % de l'ENTRETIEN (en grammes) × appétit, entre 400 et 550 g
//     plancher = la moitié du plafond, entre 220 et 250 g
//
// ⛔ L'ENTRETIEN, PAS LA CIBLE. L'objectif ne rapetisse pas l'assiette de qui
// perd du poids (les légumes font le volume), et n'agrandit pas celle de qui en
// prend (son surplus va aux à-côtés et aux collations). L'entretien porte déjà
// le corps entier: poids, taille, sexe, âge exact, activité.
//
// ⚠️ LE PLANCHER NE MONTE JAMAIS au-dessus de celui de la table (250 g). Il
// reste ce qu'il est: « ça ne ressemble pas à un repas ».
//
// ⚠️ CE N'EST QU'UNE BORNE DE REPAS D'ADULTE. Mineur, âge inconnu ou entretien
// inconnu ⇒ `null`, et la table d'âge s'applique seule, comme avant.

/** ⟳ 2026-09-24 — la part de l'entretien qui fait le plafond: 0,25 g par kcal. */
export const PERSONAL_PLATE_MAX_G_PER_KCAL = 0.25;
/** ⟳ 2026-09-24 — le plafond personnel ne descend jamais sous 400 g. */
export const PERSONAL_PLATE_MAX_LOWEST_G = 400;
/**
 * ⟳ 2026-09-24 — le plafond personnel ne monte jamais au-dessus de 550 g.
 * ⚠️ C'est aujourd'hui le plafond du repas adulte de la table
 * (`PLATE_MASS_BOUNDS_G.adult.meal.max`); ce sont deux décisions, épinglées
 * séparément.
 */
export const PERSONAL_PLATE_MAX_HIGHEST_G = 550;
/** ⟳ 2026-09-24 — le plancher personnel est la moitié du plafond… */
export const PERSONAL_PLATE_MIN_SHARE_OF_MAX = 0.5;
/** ⟳ 2026-09-24 — …jamais sous 220 g… */
export const PERSONAL_PLATE_MIN_LOWEST_G = 220;
/** ⟳ 2026-09-24 — …et jamais au-dessus de 250 g, le plancher de la table. */
export const PERSONAL_PLATE_MIN_HIGHEST_G = 250;

/** ⟳ 2026-09-24 — les bornes d'assiette d'un adulte, en grammes servis. */
export interface PersonalPlateBounds {
  maxG: number;
  minG: number;
}

/**
 * ⟳ 2026-09-24 — LE PLAFOND ET LE PLANCHER D'ASSIETTE D'UN ADULTE, depuis son
 * entretien. `null` pour un mineur, un âge inconnu ou un entretien inconnu.
 *
 * ⚠️ L'APPÉTIT EST DANS LE PLAFOND (0,9 / 1 / 1,1, `appetiteFactorOf`).
 * `plateBoundsFor` l'applique donc APRÈS le facteur d'appétit de la table,
 * jamais une seconde fois: 1 900 kcal à petit appétit font 428 g, pas
 * 428 × 0,9.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function personalPlateBoundsFor(args: {
  ageYears: number | null;
  /** L'entretien de la personne (`maintenanceKcalOf`), jamais sa cible. */
  maintenanceKcal: number | null;
  appetite: AppetiteLevel | null;
}): PersonalPlateBounds | null {
  const { band, known } = plateBandOf(args.ageYears);
  if (!known || band !== "adult") return null;
  const maintenance = Number(args.maintenanceKcal);
  if (args.maintenanceKcal === null || !Number.isFinite(maintenance) || maintenance <= 0) {
    return null;
  }
  const appetite = appetiteFactorOf(args.appetite).factor;
  const maxG = Math.min(
    PERSONAL_PLATE_MAX_HIGHEST_G,
    Math.max(
      PERSONAL_PLATE_MAX_LOWEST_G,
      Math.round(PERSONAL_PLATE_MAX_G_PER_KCAL * maintenance * appetite),
    ),
  );
  const minG = Math.min(
    PERSONAL_PLATE_MIN_HIGHEST_G,
    Math.max(PERSONAL_PLATE_MIN_LOWEST_G, Math.round(PERSONAL_PLATE_MIN_SHARE_OF_MAX * maxG)),
  );
  return { maxG, minG };
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
 *   `personal` ⟳ 2026-09-24 — le plafond de la PERSONNE (25 % de son entretien,
 *              `personalPlateBoundsFor`) a rabattu le plafond, plus bas que la
 *              table. À égalité avec la table, c'est `table`: rien n'a changé;
 *   `no_target`  aucune part lisible: la table est la SEULE source, comme avant
 *                ce lot.
 */
export const PLATE_BOUND_SOURCES = ["target", "table", "personal", "no_target"] as const;
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
  /**
   * ⟳ 2026-09-24 — LES BORNES D'ASSIETTE DE CETTE PERSONNE
   * (`personalPlateBoundsFor`), ou `null`: la table d'âge seule, comme avant.
   *
   * ⛔ REQUIS ET NULLABLE, jamais `?`: c'est la casse de compilation qui
   * recense les appelants. Un défaut à `null` aurait laissé le plafond
   * personnel construit et désarmé chez tous ceux qu'on a oubliés.
   *
   * Pour un REPAS: plafond = min(table, plafond personnel), plancher =
   * min(table, plancher personnel). Une collation ne le lit pas.
   */
  personal: PersonalPlateBounds | null;
  /**
   * ⟳ 2026-09-25 — L'ÉNERGIE QUI DIMENSIONNE LA MASSE DE L'ASSIETTE, quand
   * l'objectif abaisse la cible : la part de ce moment À L'ENTRETIEN
   * (`slotContractsFor`, part × entretien ÷ cible). Jamais sous
   * `slotTargetKcal` : elle n'agrandit l'assiette que de ce que l'objectif lui
   * avait retiré. Absente ou `null` = la part de la cible, la règle d'avant.
   *
   * ── LE DÉFAUT, MESURÉ ────────────────────────────────────────────────
   * La règle du 2026-09-24 dit « l'entretien, pas la cible : l'objectif ne
   * rapetisse pas l'assiette de qui perd du poids ». Le plafond personnel la
   * tenait, mais la borne `E / ρ` la défaisait : calculée sur l'énergie de la
   * CIBLE, elle rendait l'assiette petite. Banc des trois foyers, plan A
   * (Camille, perte, petit appétit) : déjeuner de 416 kcal plafonné à 375 g,
   * collation de 139 kcal à 125 g ; ~16 % de sa journée rognée, que rien ne
   * rattrape en perte de poids. Décision du propriétaire, 2026-09-25 : « le
   * poids max d'un repas vient de sa taille à l'entretien ».
   *
   * ⚠️ FACULTATIVE, ET C'EST ASSUMÉ : son absence rend la règle d'avant, à
   * l'octet, pour la soixantaine d'appels de tests et les replis sans contrat.
   * Les appels de PRODUCTION qui ont un contrat la passent
   * (`slot_nutrition_contract.ts`).
   */
  massKcal?: number | null;
}): PlateBounds {
  return plateBoundsUnder(
    args,
    (band, slotClass) => PLATE_MASS_BOUNDS_G[band][slotClass],
    true,
  );
}

/**
 * ⟳ 2026-09-23 — LES BORNES D'UN MOMENT QUI DÉBORDE: la même règle que
 * `plateBoundsFor`, sous le plafond de REPLI (`PLATE_HARD_CEILING_G`).
 *
 * ⛔ UN SEUL CALCUL, DEUX TABLES. Les deux fonctions passent par
 * `plateBoundsUnder`; seule la table change. Recopier le couloir de masse
 * ici en ferait une deuxième arithmétique — celle qu'on relit le moins, donc
 * celle qui garderait l'ancienne règle d'appétit ou de plancher léger.
 *
 * ⚠️ UNE TRANCHE SANS REPLI RETOMBE SUR SA TABLE: le plancher, lui, ne bouge
 * jamais (`PLATE_MASS_BOUNDS_G[…].min`), et un enfant ou une collation rend
 * exactement `plateBoundsFor`.
 *
 * Appelée par `slotContractsFor` quand un moment garde un débordement que
 * les collations n'ont pas pu prendre (`overflow: "hard_ceiling"`).
 *
 * ⟳ 2026-09-24 — ⚠️ LE REPLI GARDE SA TABLE POUR LE PLAFOND: le plafond
 * personnel ne s'y applique pas (l'énergie de la journée reste un contrat, et
 * c'est ce plafond-ci qui la laisse passer). Le plancher personnel, lui,
 * s'applique.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function hardCeilingBoundsFor(
  args: Parameters<typeof plateBoundsFor>[0],
): PlateBounds {
  return plateBoundsUnder(
    args,
    (band, slotClass) => {
      const table = PLATE_MASS_BOUNDS_G[band][slotClass];
      return {
        min: table.min,
        max: PLATE_HARD_CEILING_G[band]?.[slotClass] ?? table.max,
      };
    },
    false,
  );
}

/**
 * LE COULOIR DE MASSE SOUS UNE TABLE DONNÉE — le corps commun de
 * `plateBoundsFor` et de `hardCeilingBoundsFor`. Voir le pavé de
 * `plateBoundsFor` pour la règle; rien d'autre ne change que `tableOf`.
 *
 * ⟳ 2026-09-24 — et le plafond personnel (`args.personal`), sur un REPAS:
 * son plancher s'applique toujours, son plafond seulement quand
 * `personalCeiling` le dit (`false` au repli à 700 g).
 */
function plateBoundsUnder(
  args: Parameters<typeof plateBoundsFor>[0],
  tableOf: (
    band: PlateBoundBand,
    slotClass: PlateSlotClass,
  ) => { readonly min: number; readonly max: number },
  personalCeiling: boolean,
): PlateBounds {
  const { band, known } = plateBandOf(args.ageYears);
  const slotClass = plateSlotClassOf(args.slot);
  const table = tableOf(band, slotClass);
  // ⟳ 2026-09-24 — LES BORNES DE LA PERSONNE, sur un REPAS seulement.
  // `Infinity` = rien de plus que la table: le `Math.min` la rend telle quelle.
  // ⛔ ELLES PORTENT DÉJÀ L'APPÉTIT (`personalPlateBoundsFor`). Elles
  // bornent donc APRÈS le facteur d'appétit, jamais multipliées par lui: sinon
  // un petit appétit compterait deux fois (428 g × 0,9 = 385 g, sous les 400 g
  // décidés).
  const personal = slotClass === "meal" ? args.personal : null;
  const personalMax = personal !== null && personalCeiling ? personal.maxG : Infinity;
  const personalMin = personal !== null ? personal.minG : Infinity;
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
    // ⟳ 2026-09-24 — sans part lisible, la table de la personne: les deux
    // `Math.min` rendent la table telle quelle quand `personal` est `null`.
    const min = Math.min(table.min, personalMin);
    const max = Math.min(table.max, personalMax);
    return {
      min,
      max,
      preferred: Math.round((min + max) / 2),
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
  // ⟳ 2026-09-25 — la MASSE se dimensionne sur l'énergie à l'entretien quand
  // l'objectif l'abaisse (`massKcal`), jamais en dessous de la cible. Le
  // plancher, lui, reste celui de la part.
  const massKcal = Number(args.massKcal);
  const massBase = args.massKcal != null && Number.isFinite(massKcal) && massKcal > kcal
    ? massKcal
    : kcal;
  const bMaxRaw = massBase / densityFloorPerG;
  const bMinRaw = kcal / MEAL_KCAL_PER_G_COMPOSED;
  const bMax = Math.min(bMaxRaw, table.max);
  const bMin = Math.min(bMinRaw, table.min);
  const appetiteFactor = isMinor ? 1 : appetiteFactorOf(args.appetite).factor;
  const tableMax = Math.min(appetiteFactor * bMax, table.max);
  // ⟳ 2026-09-24 — ④ le plafond et le plancher de la PERSONNE, en dernier:
  // ils portent déjà l'appétit (voir `personal` plus haut).
  const gMax = Math.min(tableMax, personalMax);
  const gMin = Math.min(appetiteFactor * bMin, personalMin, gMax);
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
    // ⟳ 2026-09-24 — et la PERSONNE quand son plafond passe sous celui de la
    // table; à égalité, rien n'a changé et le motif reste `table`.
    boundSource: gMax < appetiteFactor * bMaxRaw
      ? (personalMax < tableMax ? "personal" : "table")
      : "target",
    physicalMax: table.max,
  };
}
