// ═══════════════════════════════════════════════════════════════════════════
// KEEL · LE PLANCHER DU BUDGET — CE QU'AUCUN PANIER NE PEUT DESCENDRE.
// ═══════════════════════════════════════════════════════════════════════════
//
// ── CE QUE CE MODULE FERME ─────────────────────────────────────────────────
// `budget_amount` n'avait qu'une borne: `> 0` et `<= BUDGET_MAX`. Quelqu'un
// pouvait donc demander sept jours pour quatre personnes avec **1 €**, et le
// prompt partait avec « budget for this plan: 1 … it is a ceiling ». Le modèle
// ne refuse jamais un plafond: il COUPE, dans l'ordre qu'on lui donne
// (protéines chères, hors saison, variété), et quand l'ordre ne suffit pas il
// rend un plan qui a l'air de tenir. Personne ne vérifie ensuite: la mesure
// L30b du 2026-08-23 rend 0 violation démontrée sur 193 plans, pour la seule
// raison que 92 % d'entre eux n'ont pas de coût connu.
//
// Un plafond qu'on ne peut pas tenir est pire qu'aucun plafond: il fait
// arbitrer le modèle contre une contrainte imaginaire, et le seul poste qu'il
// lui reste à rogner est celui que tout le reste du prompt calcule.
//
// ── D'OÙ VIENNENT CES NOMBRES ──────────────────────────────────────────────
// De la grille de prix du dépôt (`food_composition_refs.price_eur_per_100g_fr`
// et `…_usd_per_100g_us`, 893 et 843 lignes chiffrées sur 943), lue le
// 2026-09-11 sur des **paniers NOMMÉS**. Un panier se vérifie ligne à ligne;
// un centile de groupe ne se vérifie pas, et le safran vit dans le même groupe
// que les lentilles à quatre ordres de grandeur d'écart (`meal_cost.ts`).
//
// Les deux paniers, par personne et par jour, normalisés à
// `BUDGET_FLOOR_REFERENCE_KCAL`:
//
//   ① LE MINIMUM — pâtes 250 g, lentilles sèches 150 g, pomme de terre 300 g,
//     carotte 200 g, oignon 100 g, tomates en boîte 200 g, huile 30 g.
//     1 992 kcal, 77 g de protéines, **2,64 €** (FR). Sa variante sans gluten
//     remplace les pâtes par du riz: 2 115 kcal, **2,93 €**.
//     ⚠️ CE PANIER EST DÉJÀ VÉGÉTALIEN. C'est le fait le plus important de ce
//     module: la façon la moins chère de nourrir quelqu'un est la MÊME pour un
//     carnivore et pour un végane. Le régime ne durcit donc pas le plancher —
//     il ne le déplace que là où il retire un aliment BON MARCHÉ, c'est-à-dire
//     sur le gluten, et seulement en France (aux États-Unis le riz est moins
//     cher que les pâtes, et la variante sans gluten est la moins chère des
//     deux).
//
//   ② LE FRUGAL — le même jour, mangeable: du pain, des œufs, un yaourt, un
//     pilon de poulet, deux féculents. 2 045 kcal, 91 g de protéines,
//     **3,86 €** (FR). Ses variantes par régime sont dans la seconde table.
//
// ⛔ LE FRUGAL NE REFUSE RIEN. C'est un seuil de ce qu'on DIT, pas de ce qu'on
// accepte: entre le minimum et lui, la composition part, et l'écran nomme ce
// que ce budget va changer (« ce sera surtout des légumes secs, et ça se
// répétera »). C'est exactement le cas de quelqu'un qui mange de la viande, qui
// a peu d'argent, et à qui le modèle proposera naturellement plus de végétal:
// c'est entendable, ça ne se refuse pas, ça se dit.
//
// ── ⚠️ CE QUE CE PLANCHER N'EST PAS ────────────────────────────────────────
//
//   · **Ce n'est pas une estimation.** Le budget couvre TOUTE la liste de
//     courses; ces paniers ne couvrent que des assiettes. Le plancher est donc
//     structurellement SOUS-ESTIMÉ — la bonne direction pour un plancher, la
//     mauvaise pour un chiffre qu'on afficherait comme « ton plan coûtera X ».
//     Il ne doit jamais se rendre autrement que comme un minimum.
//
//   · ⟳ 2026-09-25 — **Il est indexé sur les corps, par le besoin que le
//     moteur calcule déjà.** Demandé: « le besoin calorique est déjà calculé
//     par personne, pourquoi ne pas le prendre ». Chaque bouche porte son
//     coût par jour (`BudgetFloorMouth.dayRates`), qui est le panier de son
//     régime × son besoin ÷ `BUDGET_FLOOR_REFERENCE_KCAL`
//     (`budgetDayRatesOf`). Ce besoin est calculé par le serveur SEUL
//     (`budget_mouth_kcal_io.ts`, la cible de `mouthTargetKcal`, repli sur
//     l'entretien); l'écran ne reçoit que l'ARGENT (`budget-rates-v1`).
//     Une bouche sans corps connu garde la journée de référence. Ce qui était
//     écrit ici avant — « un foyer avec de jeunes enfants a un plancher un peu
//     trop haut » — est donc fermé pour toute bouche dont le corps est saisi.
//
//   · **Ce n'est pas saisonnier.** Même limite que `meal_cost.ts`: la tomate
//     varie de ±35 % dans l'année et la grille ne le porte pas.
//
//   · **Il n'existe que sur deux marchés.** Les prix sont FR et US, et les deux
//     colonnes ne se convertissent PAS l'une dans l'autre (`food_price_fx_smell`
//     existe pour ça). Hors de ces deux pays, ce module **s'abstient** — pas de
//     plancher, pas de refus, pas de conversion inventée. Un compte marocain
//     garde exactement le comportement d'hier.
//
// PURE: no I/O, no clock, no randomness.
// ═══════════════════════════════════════════════════════════════════════════

// ⚠️ DEUX IMPORTS DE TYPE, ET ILS S'EFFACENT À LA COMPILATION. C'est ce qui
// permet à ce module d'être lu par le navigateur sans traîner `meal_cost.ts`
// (et son référentiel de composition) ni `dietary_regime.ts` (et son moteur de
// formes de surface) dans le paquet d'un écran. Ce qu'ils apportent est ce qui
// compte: les deux `Record` ci-dessous sont EXHAUSTIFS par construction — un
// marché ajouté à `COST_MARKETS` ou un régime ajouté à `DIETARY_REGIMES` sans
// sa ligne ici ne compile pas.
import type { CostMarket } from "./meal_cost.ts";
import type { DietaryRegime } from "./dietary_regime.ts";
import { dayCoverageOf } from "./mouth_anchor.ts";

/**
 * LA JOURNÉE DE RÉFÉRENCE QUI NORMALISE LES PANIERS.
 *
 * ⚠️ CE N'EST PAS UNE CIBLE, ET ELLE NE SE MONTRE À PERSONNE. Les six paniers
 * mesurés ne font pas tous la même énergie (1 992 à 2 644 kcal); les comparer
 * en euros bruts aurait fait passer le panier végane pour le plus cher alors
 * qu'il est le moins cher au millier de kilocalories. Ce nombre ne sert qu'à
 * les ramener au même dénominateur avant de les figer en euros par bouche et
 * par jour.
 *
 * ⛔ IL NE SORT PAS DE CE MODULE. Rien de ce que ce fichier rend ne porte de
 * kilocalories: seulement de l'argent. Le produit refuse de dire un chiffre de
 * calories à quatre populations, et un plancher qui en laisserait deviner un
 * serait le cinquième chemin.
 */
export const BUDGET_FLOOR_REFERENCE_KCAL = 2000;

/**
 * LES CINQ FAÇONS DE MANGER QUE LE PLANCHER DISTINGUE.
 *
 * `omnivore` n'est PAS un régime au sens de `DIETARY_REGIMES` — c'est ce que
 * le roster écrit quand quelqu'un répond « je mange de tout », et c'est aussi
 * le repli d'une bouche à qui personne n'a demandé. Les quatre autres sont la
 * liste fermée du dépôt, LUE et pas recopiée.
 */
export type BudgetDiet = DietaryRegime | "omnivore";

/**
 * ⛔ LE PLANCHER — LE PANIER LE MOINS CHER QUE CE RÉGIME AUTORISE.
 *
 * En dessous, aucun assemblage de notre propre référentiel ne nourrit cette
 * bouche ce jour-là. Ce n'est pas un jugement sur le train de vie de qui que ce
 * soit: c'est une impossibilité arithmétique, et c'est pour ça qu'elle a le
 * droit de refuser.
 *
 * ⚠️ `omnivore`, `vegetarian`, `vegan` et `pescatarian` PARTAGENT LEUR CHIFFRE,
 * et c'est mesuré, pas simplifié: le panier minimum ne contient aucun produit
 * animal, donc les quatre régimes l'autorisent tous. Écrire quatre nombres
 * différents aurait fait payer à un carnivore un plancher qu'il peut manger.
 *
 * ⚠️ SANS GLUTEN, LES DEUX MARCHÉS NE VONT PAS DANS LE MÊME SENS: en France le
 * riz coûte plus cher que les pâtes (+4,5 %), aux États-Unis il coûte moins
 * cher — la variante sans gluten y devient donc le panier le moins cher de
 * tous, y compris pour qui n'a aucune restriction. Les deux lignes disent ce
 * que la grille dit, jamais ce qu'on attendait d'elle.
 */
export const BUDGET_FLOOR_PER_MOUTH_DAY: Readonly<
  Record<CostMarket, Readonly<Record<BudgetDiet, number>>>
> = Object.freeze({
  fr: Object.freeze({
    omnivore: 2.65,
    vegetarian: 2.65,
    vegan: 2.65,
    pescatarian: 2.65,
    gluten_free: 2.77,
  }),
  us: Object.freeze({
    omnivore: 3.45,
    vegetarian: 3.45,
    vegan: 3.45,
    pescatarian: 3.45,
    gluten_free: 3.45,
  }),
});

/**
 * LE SEUIL DE CE QU'ON DIT — le panier frugal, mais mangeable, de ce régime.
 *
 * ⛔ IL NE REFUSE JAMAIS RIEN. Entre le plancher et lui, la composition part;
 * l'écran nomme seulement ce que ce budget va changer. Un seuil qui bloque et
 * un seuil qui explique ne sont pas le même objet, et les confondre ferait
 * refuser des gens qui ont raison.
 *
 * ⚠️ ICI LE RÉGIME COMPTE VRAIMENT, ET DANS LE SENS QU'ON N'ATTEND PAS: le jour
 * frugal d'un végane est le MOINS CHER des cinq (3,19 € contre 3,77 € pour un
 * omnivore en France). C'est la même mesure qui dit qu'un budget serré pousse
 * un plan vers le végétal — sauf qu'ici, elle le dit avant la composition, en
 * euros, plutôt qu'après, en surprise.
 */
export const BUDGET_PLAUSIBLE_PER_MOUTH_DAY: Readonly<
  Record<CostMarket, Readonly<Record<BudgetDiet, number>>>
> = Object.freeze({
  fr: Object.freeze({
    omnivore: 3.77,
    vegetarian: 3.45,
    vegan: 3.19,
    pescatarian: 3.45,
    gluten_free: 3.92,
  }),
  us: Object.freeze({
    omnivore: 4.15,
    vegetarian: 3.92,
    vegan: 3.46,
    pescatarian: 3.92,
    gluten_free: 4.27,
  }),
});

/**
 * ⟳ 2026-09-25 — LE HAUT DU CURSEUR DE BUDGET, PAR BOUCHE ET PAR JOUR.
 *
 * Demandé: un curseur à la place du champ libre, avec un maximum « dans la
 * mesure du raisonnable » pour éviter les dérives. Ce n'est pas un prix mesuré
 * sur la grille comme les deux tables du dessus: c'est une borne haute, calée
 * sur les budgets publiés le 2026-09-25.
 *
 *   · FR — UNAF, budget-type « famille A » (un couple, deux garçons de 6 à
 *     13 ans), décembre 2025: 990 à 1 109 € d'alimentation par mois, soit
 *     ≈ 8,6 € par personne et par jour. 15 € ≈ 1,75 fois ce budget, et au-dessus
 *     du profil « bio et circuits courts » à Paris. Sept jours à quatre:
 *     420 €.
 *   · US — USDA, Cost of Food at Home, janvier 2025, plan « Liberal » (le plus
 *     cher des quatre plans officiels): 370,60 $ la semaine pour la famille de
 *     référence, ≈ 13,2 $ par personne et par jour; 107,30 $ la semaine pour
 *     un homme de 19 à 50 ans, ≈ 15,3 $. 18 $ ≈ 1,35 fois la famille. Sept
 *     jours à quatre: 504 $.
 *
 * ⚠️ PAR MARCHÉ SEULEMENT, PAS PAR RÉGIME: ce qui fait monter une liste de
 * courses vers le haut est le choix des produits, pas le régime.
 *
 * ⛔ LE SERVEUR NE LE LIT PAS. Il ne sert qu'à borner le curseur des deux
 * écrans; la borne de saisie du moteur reste `BUDGET_MAX`.
 */
export const BUDGET_CEILING_PER_MOUTH_DAY: Readonly<Record<CostMarket, number>> = Object
  .freeze({
    fr: 15,
    us: 18,
  });

/**
 * LE MARCHÉ D'UN PAYS, ou `null` — jamais un repli.
 *
 * ⛔ `null` EST LA RÉPONSE NORMALE POUR LE RESTE DU MONDE, et elle doit le
 * rester. Appliquer la grille française à un compte marocain rendrait un
 * plancher en euros à quelqu'un qui saisit des dirhams: le refus serait faux
 * d'un facteur dix, et il tomberait sur la personne, pas sur nous.
 *
 * La source est `profiles.country` (alpha-2), la MÊME que le prompt porte déjà
 * et que le résolveur de crise lit en premier. Un second chemin (le fuseau, la
 * langue de l'écran) ferait un plancher qui bouge quand on voyage.
 */
export function budgetMarketFor(country: string | null | undefined): CostMarket | null {
  const code = String(country ?? "").trim().toUpperCase();
  if (code === "FR") return "fr";
  if (code === "US") return "us";
  return null;
}

/**
 * LE RÉGIME D'UNE BOUCHE, RAMENÉ AUX CINQ QUE LE PLANCHER DISTINGUE.
 *
 * ⚠️ L'INCONNU VAUT `omnivore`, et c'est le choix SÛR ici — l'inverse de ce
 * qu'il serait sur une question de sécurité. Le plancher d'un omnivore est le
 * même que celui de tout le monde (le panier minimum est végétalien), donc ce
 * repli ne peut pas faire refuser quelqu'un à tort. Il n'ouvre qu'un seuil
 * d'EXPLICATION un peu plus haut, c'est-à-dire une phrase de plus, jamais un
 * refus de plus.
 */
export function budgetDietOf(raw: string | null | undefined): BudgetDiet {
  const slug = String(raw ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(
      BUDGET_FLOOR_PER_MOUTH_DAY.fr,
      slug,
    )
    ? slug as BudgetDiet
    : "omnivore";
}

/**
 * UNE BOUCHE, TELLE QUE LE PLANCHER LA LIT. Rien d'autre n'entre.
 */
export interface BudgetFloorMouth {
  /** Ce que le roster porte: `omnivore`, un des quatre régimes, ou `null`. */
  diet: string | null;
  /**
   * ⟳ 2026-09-25 — SON COÛT PAR JOUR, AJUSTÉ À SON BESOIN (`budgetDayRatesOf`
   * ou `budgetGateDayRatesOf`), ou `null` = la journée de référence de son
   * régime.
   *
   * ⛔ REQUIS ET NULLABLE, jamais `?`: un appelant qui l'oublierait ferait
   * repartir toutes les bouches à 2 000 kcal sans que rien ne le dise — un lot
   * désarmé ressemble trait pour trait à un lot qui marche.
   */
  dayRates: BudgetDayRates | null;
  /**
   * LA PART DE JOURNÉE QUE LE PLAN COMPOSE POUR ELLE, SOMMÉE SUR LA FENÊTRE.
   *
   * ⛔ REQUIS ET NON OPTIONNEL. Un défaut à « la fenêtre entière » ferait payer
   * sept journées pleines à une bouche qui dîne dehors six soirs — c'est-à-dire
   * refuser un budget honnête, le seul défaut que ce module n'a pas le droit
   * d'avoir. `budgetMouthDays` le calcule; ce n'est pas au type de le deviner.
   */
  mouthDays: number;
}

/**
 * COMBIEN DE JOURNÉES DE BOUCHE UN PLAN NOURRIT — et ça a le droit d'être une
 * fraction.
 *
 * ⛔ LA RÈGLE PAR JOUR N'EST PAS ÉCRITE ICI. `dayCoverageOf` la tient déjà,
 * avec ses poids (`SLOT_DAY_WEIGHT`), son repli des trois repas de la maison et
 * sa cicatrice mesurée. La recopier ferait le jumeau que ce dépôt interdit —
 * et surtout un second avis sur « quelle part de sa journée cette personne
 * mange-t-elle ici », alors que c'est ce même avis qui dimensionne son
 * assiette.
 *
 * ⚠️ CE QUE ÇA VEUT DIRE POUR QUELQU'UN QUI NE DÎNE QUE LE SOIR: sa journée
 * vaut **1**, pas 0,35. `dayCoverageOf` normalise par ce que la bouche
 * DÉCLARE, et pour elle le dîner EST sa journée. Ce qui descend sous 1 n'est
 * donc pas un rythme court, c'est une absence: un midi dehors, un jour parti.
 */
export function budgetMouthDays(
  days: readonly { declaredSlots: readonly string[]; askedSlots: readonly string[] }[],
): number {
  let total = 0;
  for (const day of days) {
    // ⚠️ AUCUN CRÉNEAU DEMANDÉ = AUCUNE JOURNÉE, et il faut le dire ici:
    // `dayCoverageOf` rend `1` sur une composition vide (son repli anti-division
    // par zéro, écrit pour un dénominateur d'énergie). Ce repli est juste
    // là-bas et faux ici — il ferait payer une journée pleine pour un jour où
    // le plan ne compose rien du tout.
    if (day.askedSlots.length === 0) continue;
    total += dayCoverageOf(day.declaredSlots, day.askedSlots);
  }
  return total;
}

/**
 * ⟳ 2026-09-25 — LE COÛT PAR JOUR D'UNE BOUCHE: plancher et seuil.
 */
export interface BudgetDayRates {
  floor: number;
  plausible: number;
}

/**
 * LE COÛT PAR JOUR D'UNE BOUCHE, AJUSTÉ À SON BESOIN.
 *
 * Les deux paniers sont mesurés à `BUDGET_FLOOR_REFERENCE_KCAL`; une bouche
 * qui a besoin de 1 400 kcal en achète 70 %, une qui en a besoin de 3 000 en
 * achète 150 %. `dayKcal` absent ou illisible = la journée de référence.
 *
 * ⛔ AUCUN KCAL NE SORT D'ICI: le résultat est de l'argent. C'est ce qui permet
 * au serveur de le rendre à l'écran sans faire traverser un chiffre d'énergie.
 */
export function budgetDayRatesOf(args: {
  market: CostMarket;
  diet: string | null;
  dayKcal: number | null;
}): BudgetDayRates {
  const diet = budgetDietOf(args.diet);
  const kcal = Number(args.dayKcal);
  const share = args.dayKcal !== null && Number.isFinite(kcal) && kcal > 0
    ? kcal / BUDGET_FLOOR_REFERENCE_KCAL
    : 1;
  return {
    floor: BUDGET_FLOOR_PER_MOUTH_DAY[args.market][diet] * share,
    plausible: BUDGET_PLAUSIBLE_PER_MOUTH_DAY[args.market][diet] * share,
  };
}

/**
 * LE MÊME COÛT, POUR LA PORTE DU MOTEUR — jamais au-dessus de la référence.
 *
 * ── POURQUOI DEUX VERSIONS, ET POURQUOI CELLE-CI EST PLAFONNÉE ────────────
 * Le plancher se calcule deux fois: sur l'écran, pour borner le curseur, et
 * dans `generate-household-meal-v1`, pour décider si le budget entre dans le
 * prompt. Si celui du moteur dépasse celui de l'écran, un montant que le
 * curseur a proposé est jugé impossible et RETIRÉ du prompt, sans un mot à la
 * personne. Les deux lisent le même chargeur (`budget_mouth_kcal_io.ts`), mais
 * l'écran peut ne pas l'avoir reçu (fonction pas encore déployée, panne), ou
 * un corps peut changer entre les deux lectures.
 *
 * La porte du moteur ne MONTE donc jamais au-dessus de la journée de
 * référence: elle descend avec un enfant comme l'écran, elle ne monte pas avec
 * un grand mangeur. L'écran, lui, monte — son minimum reste au-dessus de celui
 * du moteur dans tous les cas, et un montant proposé n'est jamais retiré.
 */
export function budgetGateDayRatesOf(args: {
  market: CostMarket;
  diet: string | null;
  dayKcal: number | null;
}): BudgetDayRates {
  const kcal = Number(args.dayKcal);
  return budgetDayRatesOf({
    ...args,
    dayKcal: args.dayKcal !== null && Number.isFinite(kcal) && kcal > 0
      ? Math.min(kcal, BUDGET_FLOOR_REFERENCE_KCAL)
      : null,
  });
}

/** Un coût reçu (du réseau, d'un appelant) qui ne se lit pas vaut `null`. */
function usableDayRates(rates: BudgetDayRates | null): BudgetDayRates | null {
  if (rates === null) return null;
  const floor = Number(rates.floor);
  const plausible = Number(rates.plausible);
  if (!Number.isFinite(floor) || floor <= 0) return null;
  if (!Number.isFinite(plausible) || plausible <= 0) return null;
  return { floor, plausible };
}

/**
 * LES DEUX BORNES D'UNE DEMANDE, ou `null` hors des deux marchés.
 *
 * ⚠️ ARRONDIES AU CENTIME SUPÉRIEUR pour le plancher, INFÉRIEUR pour le seuil.
 * Un plancher arrondi vers le bas laisserait passer un budget que le module
 * vient de déclarer impossible; un seuil arrondi vers le haut ferait dire
 * « c'est serré » à quelqu'un qui est pile dessus. Chacun s'arrondit du côté
 * où il ne se contredit pas.
 */
export function budgetBoundsFor(args: {
  market: CostMarket | null;
  mouths: readonly BudgetFloorMouth[];
}): { floor: number; plausible: number } | null {
  if (args.market === null) return null;
  const floorTable = BUDGET_FLOOR_PER_MOUTH_DAY[args.market];
  const plausibleTable = BUDGET_PLAUSIBLE_PER_MOUTH_DAY[args.market];
  let floor = 0;
  let plausible = 0;
  for (const mouth of args.mouths) {
    const days = Number(mouth.mouthDays);
    if (!Number.isFinite(days) || days <= 0) continue;
    const diet = budgetDietOf(mouth.diet);
    const rates = usableDayRates(mouth.dayRates);
    floor += (rates?.floor ?? floorTable[diet]) * days;
    plausible += (rates?.plausible ?? plausibleTable[diet]) * days;
  }
  // ⛔ AUCUNE BOUCHE NOURRIE = AUCUNE BORNE. Rendre `{ floor: 0 }` ferait dire
  // « tout budget convient » à une demande qui ne compose rien, et cette
  // phrase-là n'a pas de sujet.
  if (floor <= 0) return null;
  return {
    floor: Math.ceil(floor * 100) / 100,
    plausible: Math.floor(plausible * 100) / 100,
  };
}

/**
 * ⟳ 2026-09-25 — LE HAUT D'UNE DEMANDE, ou `null` là où le plancher s'abstient.
 *
 * ⚠️ LES MÊMES JOURNÉES DE BOUCHE QUE LE PLANCHER (`mouthDays`), jamais
 * « personnes × jours »: une bouche qui déjeune dehors cinq midis achète moins,
 * et le haut du curseur descend avec elle comme le bas.
 */
export function budgetCeilingFor(args: {
  market: CostMarket | null;
  mouths: readonly BudgetFloorMouth[];
}): number | null {
  if (args.market === null) return null;
  let mouthDays = 0;
  for (const mouth of args.mouths) {
    const days = Number(mouth.mouthDays);
    if (!Number.isFinite(days) || days <= 0) continue;
    mouthDays += days;
  }
  if (mouthDays <= 0) return null;
  return Math.ceil(mouthDays * BUDGET_CEILING_PER_MOUTH_DAY[args.market] * 100) / 100;
}

/**
 * LE VERDICT, EN VOCABULAIRE FERMÉ.
 *
 * ⛔ `unbounded` N'EST PAS `ok`. Le premier dit « on ne sait pas borner ici »
 * (hors marché, ou rien à nourrir), le second dit « ce budget tient ». Les
 * confondre ferait afficher une approbation qu'on n'a pas mesurée — c'est la
 * règle de `meal_cost.ts`, à un étage au-dessus: un total partiel présenté
 * comme un total est le mode d'échec de ce dépôt.
 */
export type BudgetVerdict =
  | { kind: "unbounded" }
  | { kind: "below_floor"; floor: number; plausible: number }
  | { kind: "tight"; floor: number; plausible: number }
  | { kind: "ok"; floor: number; plausible: number };

/**
 * CE BUDGET-LÀ, POUR CETTE DEMANDE-LÀ.
 *
 * ⚠️ `amount` ARRIVE DÉJÀ FILTRÉ par `usableBudget` / `isUsableBudgetAmount`:
 * ce module ne rejuge ni le zéro, ni le plafond, ni la forme. Il ne connaît
 * qu'une question — « est-ce que ça peut acheter ce qu'on demande ? » — et un
 * second avis sur les bornes de saisie les ferait diverger au premier
 * ajustement.
 */
export function assessBudget(args: {
  amount: number | null;
  market: CostMarket | null;
  mouths: readonly BudgetFloorMouth[];
}): BudgetVerdict {
  const bounds = budgetBoundsFor({ market: args.market, mouths: args.mouths });
  if (bounds === null) return { kind: "unbounded" };
  const amount = Number(args.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { kind: "unbounded" };
  if (amount < bounds.floor) {
    return { kind: "below_floor", floor: bounds.floor, plausible: bounds.plausible };
  }
  if (amount < bounds.plausible) {
    return { kind: "tight", floor: bounds.floor, plausible: bounds.plausible };
  }
  return { kind: "ok", floor: bounds.floor, plausible: bounds.plausible };
}
