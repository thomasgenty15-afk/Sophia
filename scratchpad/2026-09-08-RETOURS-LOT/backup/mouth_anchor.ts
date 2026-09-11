/**
 * LOT 2 — L'ANCRAGE ABSOLU : `facteur = cible / livré`.
 *
 * Chantier: `scratchpad/2026-08-19-2200-MASTER-PROMPT-GRAMMAGE.md`.
 *
 * ── CE QUI CHANGE, ET POURQUOI C'EST UN CHANGEMENT DE NATURE ──────────────
 * `bodyShareFactors` rend un RAPPORT: `entretien / moyenne(entretiens)`. La
 * somme des facteurs vaut le nombre de bouches, exprès, pour que la casserole
 * ne gonfle pas. Il déplace des grammes entre deux personnes et **ne décide
 * jamais du niveau** — mesuré sur le foyer `5600347f`: `450+450 = 900` avant,
 * `612+344 = 956` après.
 *
 * Ce module décide du niveau. Il compare ce que la journée LIVRE
 * (`mouthDayEnergy`, LOT 1) à ce que le corps DEMANDE (`executedPaceFor`), et
 * rend le facteur qui ferme l'écart.
 *
 * ── ⚠️ IL REND `bodyShareFactors` REDONDANT, ET IL FAUT LE RETIRER ────────
 * Le rapport des entretiens tombe NATURELLEMENT du rapport des cibles: deux
 * bouches ancrées chacune sur son propre entretien reçoivent déjà des grammes
 * dans le rapport de leurs entretiens. Garder les deux ferait DEUX couches qui
 * dimensionnent — très exactement le double comptage mesuré sur trois runs (le
 * modèle découpait par classe, le moteur multipliait par-dessus, et l'ado de
 * 70 kg dont le corps demande 2,03x la part de l'adulte de 47 kg en recevait
 * 1,02x). `docs`: voir le LOT 2 du chantier.
 *
 * ── LES PORTES SONT APPELÉES, JAMAIS RECOPIÉES ───────────────────────────
 * `energy_gate.ts` est en LECTURE SEULE pour ce chantier: il porte le seul
 * point d'écriture de la chaîne ①②③, et recopier ses trois `if` ici ferait les
 * deux points de décision que le module interdit en toutes lettres. On appelle
 * `energySafetyGates` + `canSizeFromTarget`, exactement comme
 * `bodyShareFactors`, et on dépasse les MÊMES deux portes (② et ③) pour la
 * MÊME raison, écrite là-bas: une maintenance pédiatrique n'est pas une cible,
 * et servir à un enfant la boîte d'un adulte AU NOM DE SA PROTECTION est le
 * contraire d'une protection.
 *
 * ⛔ MAIS L'ÉCART (déficit / surplus) RESTE GOUVERNÉ PAR ②③ EN ENTIER. C'est la
 * ligne: la position du coach et la minorité ferment une CIBLE D'ÉCART, elles
 * ne décident pas qui reçoit le plus grand creux de la même casserole.
 *
 * ── ⛔ ON N'ANCRE JAMAIS SUR UNE JOURNÉE INCOMPLÈTE ───────────────────────
 * C'est la garde la plus importante du fichier. Si un plat du jour n'a pas
 * rendu son énergie — terme inconnu, quantité absente, plat sans couvercle — le
 * `livré` est SOUS-ESTIMÉ, et un facteur `cible / livré` sous-estimé est un
 * facteur TROP GRAND: on servirait davantage à quelqu'un parce qu'on n'a pas su
 * lire son assiette. La direction de l'erreur n'est pas neutre, et elle va dans
 * le sens qui nourrit trop. Journée incomplète ⇒ facteur 1, motif nommé.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  canSizeFromTarget,
  type CountingStance,
  energySafetyGates,
} from "./energy_gate.ts";
import type { MouthBody } from "./meal_envelope.ts";
import type { MemberAgeState } from "./household.ts";
// ⛔ LA RÈGLE DE CLASSEMENT EST IMPORTÉE, JAMAIS RECOPIÉE. Le compteur du
// chantier (`scripts/keel_anchor_nodelivery_20260822.ts`) lit la MÊME
// fonction; deux écritures du même verdict divergeraient, et la fiche
// citerait alors un chiffre que le produit ne rend pas.
import { deliveryCauseOf } from "./mouth_delivery_cause.ts";
import {
  DEFAULT_PACE_KG_PER_WEEK,
  mouthAgeVerdict,
  type MouthRestrictionState,
  restrictionFlagOf,
} from "./household_portions.ts";
import {
  estimatedMaintenanceFor,
  executedPaceFor,
  type ScaleDirection,
} from "./weight_pace.ts";
import {
  conditionGatePopulationOf,
  conditionGateReason,
} from "./condition_energy_gate.ts";
import type { MouthDayEnergy } from "./mouth_energy.ts";
import {
  EXTRA_BEARING_SLOTS,
  slotBearsExtras,
  UNANSWERED_EXTRAS_KCAL,
} from "./meal_extras.ts";

/**
 * POURQUOI UNE BOUCHE N'EST PAS ANCRÉE. Nommé, jamais un facteur `1` muet.
 *
 * ⚠️ TOUTES LES BOUCHES SONT COMPTÉES, y compris celles à `1`. Un compteur qui
 * ne nommerait que les refus ne distingue pas « la porte a laissé passer » de
 * « la porte n'a pas tourné », et c'est la confusion que ce chantier paie en
 * boucle.
 */
export const ANCHOR_REASONS = Object.freeze(
  [
    /** Cible et livré tous deux connus: le facteur s'applique. */
    "anchored",
    /**
     * ⛔ LA GARDE PRINCIPALE. Un plat du jour n'a pas rendu son énergie, donc le
     * livré est sous-estimé, donc le facteur serait trop grand. On ne devine
     * pas dans le sens qui nourrit trop.
     */
    "day_incomplete",
    /** Aucun kcal livré calculable ce jour-là: il n'y a rien à comparer. */
    "no_delivery",
    /** ① le plancher TCA de CETTE bouche, réellement levé sur son compte. */
    "restriction_floor",
    /** ① bis on n'a pas su évaluer sa ceinture. Fail-closed, nommé. */
    "restriction_unknown",
    /** Pas de corps exploitable ⇒ pas d'entretien ⇒ pas de cible. */
    "no_body",
    /**
     * L'âge est inconnu. « Je ne sais pas » n'est pas « c'est un adulte », et la
     * seconde phrase choisit l'équation d'entretien de quelqu'un d'autre.
     */
    "age_unknown",
    /** Le facteur est sorti des bornes de plausibilité, et il a été raboté. */
    "clamped",
    /**
     * L0bis — CETTE BOUCHE A DÉCLARÉ UNE GROSSESSE, et le moteur n'exécute
     * donc AUCUN écart pour elle. Elle reçoit la boîte que le modèle a écrite.
     *
     * ⛔ ELLE NE S'ANCRE PAS NON PLUS SUR SA MAINTENANCE, ET C'EST L'ARBITRAGE.
     * `estimatedMaintenanceKcal` est une équation pour un corps qui ne nourrit
     * que lui-même: le besoin d'une grossesse la dépasse d'environ 340 kcal/j
     * au 2ᵉ trimestre et 450 au 3ᵉ. L'ancrer sur cette maintenance-là lui
     * PRESCRIRAIT une journée trop basse — le défaut même que ce lot ferme,
     * portant le masque d'un correctif. Le dépôt n'a ni trimestre ni équation
     * de grossesse; s'abstenir est la seule option honnête.
     */
    "pregnancy",
    /** L0bis — même geste, même raison, pour un allaitement déclaré (~+500 kcal/j). */
    "breastfeeding",
    /**
     * ══════════════════════════════════════════════════════════════════════
     * L-anchor-nodelivery — LE SILENCE **VOULU**, SORTI DE `no_delivery`.
     * ══════════════════════════════════════════════════════════════════════
     *
     * Toutes les parts de cette bouche ce jour-là sortent d'un bac à plusieurs
     * noms. Ses grammes décrivent un RÉCIPIENT, pas une assiette (v4): il n'y
     * a rien à lire, et il n'y aura jamais rien à lire tant qu'un bac est un
     * bac. Ce n'est pas une lacune, c'est une propriété du modèle produit.
     *
     * ⛔ POURQUOI IL SORT DE `no_delivery`, MESURÉ LE 2026-08-22. Sur les 12
     * plans foyer du prompt vivant, `no_delivery` valait **100 lignes sur
     * 149 (67,1 %)** — et **100 sur 100** étaient ce cas-ci. Zéro plat
     * illisible, zéro boîte vide, zéro mélange. Une étiquette qui recouvre à
     * 100 % une situation IRRÉPARABLE PAR CONSTRUCTION faisait lire « il
     * reste 67 % à réparer » là où il n'y avait rien à réparer, et cachait la
     * seule population que quelqu'un peut encore atteindre.
     *
     * ⇒ APRÈS CE LOT, `no_delivery` NE DÉSIGNE PLUS QUE DU RÉPARABLE:
     *   un plat que le référentiel n'a pas su peser, une boîte à zéro gramme,
     *   un cumul de lacunes. C'est ce seau-là qu'un lot de pesée doit faire
     *   baisser, et il vaut **0** aujourd'hui.
     *
     * ⚠️ CE JETON NE CHANGE AUCUN GRAMME. La branche rend le même
     * `{factor: 1, raw: null}` qu'avant, et le générateur l'écarte par la
     * même ligne (`reason !== "anchored" && reason !== "clamped"`). Mesuré:
     * `anchor_applied` reste à 12 sur les 12 plans, à l'unité près.
     *
     * ⛔ ET CE N'EST PAS UNE BONNE NOUVELLE. Ce seau dit qu'une bouche N'A
     * AUCUN ANCRAGE ABSOLU et n'en aura pas: elle reste dimensionnée par la
     * chaîne RELATIVE, qui est un rapport et ne décide jamais du niveau.
     * Mesuré le 2026-08-22: **24 bouches sur 36** sont dans ce cas.
     */
    "common_pot_day",
  ] as const,
);
export type AnchorReason = (typeof ANCHOR_REASONS)[number];

/**
 * LES BORNES DU FACTEUR ABSOLU.
 *
 * ⚠️ CE SONT DES CONVENTIONS DÉCLARÉES, PAS DES BORNES DÉRIVÉES — et c'est dit
 * ici parce que ce fichier documente ailleurs des bornes qui, elles, SE
 * CALCULENT (`BOX_FACTOR_MIN` sort d'un minimum structurel, et sa dérivation est
 * écrite au-dessus). Celles-ci ne le peuvent pas encore: dériver une borne
 * sur `cible / livré` demande de savoir comment le modèle plate en pratique, et
 * **aucun plan en base ne porte encore la nouvelle forme de boîte** (mesuré le
 * 2026-08-19: 136 plans de foyer, 0 avec boîte). Elles sont donc un premier
 * cran prudent, À REDÉRIVER sur les premiers runs réels.
 *
 * ── L'ARBITRAGE: ON RABOTE, ET ON LE COMPTE ──────────────────────────────
 * Le dépôt porte les deux arbitrages opposés, chacun justifié:
 *   · chaîne d'objectif — « un facteur hors bornes ne se rabote pas, il se
 *     refuse »: ramener 0,4 à 0,70 servirait un déficit que personne n'a validé;
 *   · part de fiche — il SE RABOTE: refuser rendrait la boîte de l'adulte de
 *     79 kg à l'enfant de 23 kg.
 *
 * Ici c'est le second qui gouverne, et pour la même raison mesurée: refuser
 * rend `1`, c'est-à-dire **le 450 g du modèle**, qui est très exactement le
 * produit que ce chantier existe pour corriger. Un rabotage compté vaut mieux
 * qu'un refus qui restaure le défaut.
 *
 * ⚠️ ET LE RÉSIDU N'EST PAS PERDU: `AnchorFactor.raw` porte le facteur AVANT
 * rabotage. C'est l'entrée du LOT 3, qui décidera si la casserole doit grossir
 * plutôt que la part être rabotée. Sans lui, l'aval serait un habillage.
 */
export const ANCHOR_FACTOR_MIN = 0.60;

/**
 * COMBIEN DE GRAMMES D'ALIMENT PRÊT UN CORPS PEUT MANGER EN UN SEUL REPAS,
 * par kilo.
 *
 * ── ⛔ LA BORNE JOURNALIÈRE (30 g/kg/jour) ÉTAIT FAUSSE, ET C'EST MESURÉ ──
 * Servie à l'écran du propriétaire le 2026-08-20: **1 232 g dans UNE boîte de
 * dîner**. La journée entière restait sous son plafond pendant qu'un seul
 * repas devenait inmangeable — la borne lisait le mauvais dénominateur. Le
 * produit sert des REPAS; c'est le repas qu'il faut borner.
 *
 * ── D'OÙ VIENT `8` ────────────────────────────────────────────────────────
 * Le plus gros repas d'une journée porte ~35 % de son énergie (le partage
 * FAO/WHO usuel, celui de `SLOT_DAY_WEIGHT`). Pour un entretien adulte de
 * 2 400–3 000 kcal, ça fait 850–1 050 kcal; un plat mixte cuisiné (protéine +
 * féculent + légumes) pèse 1,3–1,6 kcal/g. Le plus gros repas plausible pèse
 * donc ~550–700 g pour 70–80 kg — soit **~8 g/kg**. Pour ce foyer:
 *
 *     iku (73 kg)        584 g max par repas
 *     Christèle (59 kg)  472 g max par repas
 *
 * Deux corps, deux plafonds: ils ne peuvent pas fusionner en s'y collant —
 * c'est la propriété qui a manqué à TROIS ceintures successives de ce
 * chantier, et elle est testée.
 *
 * ⚠️ QUAND ELLE MORD, LA CIBLE D'ÉNERGIE N'EST PAS ATTEINTE, ET C'EST VOULU.
 * L'écart part dans `raw` et `pot_demand.unmetDemand`: la réparation d'un plan
 * trop peu dense est de composer PLUS DENSE (riz, pâtes, huile, oléagineux),
 * jamais de servir un volume que personne ne finit. La masse d'une assiette
 * n'est pas la variable d'ajustement de l'énergie.
 */
export const MEAL_MAX_GRAMS_PER_KG = 8;

/**
 * CE QUE PÈSE UN PLAT CUISINÉ, EN KCAL PAR GRAMME.
 *
 * ⚠️ MESURÉE, PAS CHOISIE. Sur les trois journées du run du 2026-09-04, les
 * assiettes réellement servies pesaient 1,13 · 1,56 · 1,35 kcal/g. La valeur
 * retenue est celle du milieu, et elle tombe dans la fourchette que le pavé de
 * `MEAL_MAX_GRAMS_PER_KG` cite pour en DÉRIVER le 8. Elle vivait dans
 * `eating_structure.ts`, qui la ré-exporte; elle est ici parce que c'est ICI
 * qu'elle borne un repas (voir `mealMassCapGrams`).
 *
 * ⛔ CE N'EST PAS `DENSITY_CEILING_DEFAULT` (1,8, `meal_envelope.ts`). Celui-là
 * est un PLAFOND de verdict — « au-dessus, le plan est trop dense ». Prendre un
 * plafond pour une moyenne ferait croire qu'une assiette ordinaire porte un
 * tiers d'énergie de plus qu'elle n'en porte.
 */
export const MEAL_KCAL_PER_G_COMPOSED = 1.35;

/**
 * ⟳ 2026-09-04 — LE PLAFOND D'UN REPAS SUIT LE BESOIN, PLUS LE KILO.
 *
 * `8 g/kg` a été DÉRIVÉ, dans le pavé ci-dessus, d'un entretien ADULTE: 35 % de
 * 2 400–3 000 kcal à 1,3–1,6 kcal/g. Appliqué tel quel à une enfant de 36 kg
 * qui s'entraîne, il rend 288 g par repas — et le moteur a RÉDUIT la boîte de
 * 500 g que le modèle avait écrite à 300 g, avant de compter qu'elle manque de
 * 200 kcal. Il créait le manque qu'il rapportait. Mesuré sur le foyer
 * `qa-mois-20260904`: `anchored: 0`, `clamped: 5/5`, `unmet gte_200: 5/5`.
 *
 * Le besoin par kilo n'est pas linéaire entre une enfant et un adulte; le
 * plafond ne peut donc pas l'être. Ce que la dérivation disait VRAIMENT, c'est:
 * « le plus gros repas plausible pèse ce que porte son énergie à la densité
 * d'un plat ordinaire ». On le calcule donc pour CE corps, depuis SA cible de
 * repas — la même cible que l'ancre poursuit — au lieu de le figer sur le
 * kilo d'un adulte.
 *
 * ⚠️ CE QUE ÇA GARDE: quand le plat est PEU DENSE (soupe, légumes à l'eau),
 * la cible n'est pas atteinte dans ce volume, le facteur bute, et l'écart part
 * dans `unmetDemand` — la réparation reste de composer plus dense, jamais de
 * servir un volume que personne ne finit. Le 1,2 kg reste mort, et son test
 * aussi.
 *
 * ⚠️ `MEAL_MAX_GRAMS_PER_KG` RESTE pour `eating_structure.ts`: « combien de
 * moments une journée doit ouvrir » a besoin d'une borne PHYSIQUE indépendante
 * de la cible, sinon la question devient circulaire (un repas porterait ce
 * qu'il doit porter). Les deux constantes ne disent donc plus le même monde:
 * l'une borne le nombre de moments, l'autre ne borne plus rien ici.
 */
export function mealMassCapGrams(mealTargetKcal: number): number | null {
  if (!Number.isFinite(mealTargetKcal) || mealTargetKcal <= 0) return null;
  return mealTargetKcal / MEAL_KCAL_PER_G_COMPOSED;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ ARBITRAGE 1 (2026-09-06) — LE PLAFOND DE MASSE SUIT LA DENSITÉ MESURÉE
// ═══════════════════════════════════════════════════════════════════════════
//
// Décision produit du 2026-09-05 (`scratchpad/2026-09-05-1930-ARBITRAGES-PRODUIT.md`,
// n° 1) : « une assiette peut peser plus si elle est dense ; le plafond se
// calcule sur la densité réelle du plat, pas sur un chiffre fixe ».
//
// Mesuré avant : sur C03 (quatre bouches), la boîte de Paul pesait EXACTEMENT
// 880 / 1,35 = 652 g — le plafond supposait 1,35 kcal/g sur une assiette
// mesurée à 0,59, puis 0,80 après v27 — et portait 386 kcal pour 880 visés.
// Le moteur créait le manque qu'il rapportait (`clamped` 12/12, `unmet
// gte_200` 12/12), exactement le défaut que le pavé « 8 g/kg » ci-dessus
// décrivait pour une enfant de 36 kg, pris par l'autre bout.
//
// ── LA RÈGLE ──────────────────────────────────────────────────────────────
//   · la densité de la JOURNÉE de cette bouche est ce que ses boîtes à un nom
//     ont livré : `kcal / grammes` (`MouthDayEnergy.kcal`, `.grams`) — depuis le
//     lot 0, ces kcal suivent les grammes tirés, donc la densité est celle des
//     casseroles et du frais réellement dans la boîte ;
//   · le plafond du plus gros repas = `kcal du repas / densité retenue`, où la
//     densité retenue est la densité mesurée **bornée** entre
//     `MEAL_KCAL_PER_G_FLOOR` et `MEAL_KCAL_PER_G_COMPOSED` : une assiette moins
//     dense qu'un plat ordinaire PEUT peser plus (c'est la décision), jusqu'au
//     plancher ; une assiette plus dense n'est jamais bornée plus serré qu'hier
//     (sinon un dîner plus lourd que le déjeuner serait raboté pour avoir été
//     composé dense — le plafond est une garde de VOLUME, pas un dosage) ;
//   · sous le plancher (soupe, légumes à l'eau : 0,2 kcal/g), c'est le plancher
//     qui borne, et ça se compte `density_floor` : la réparation est de composer
//     plus dense (densifieur), jamais de servir un seau ;
//   · sans grammes lisibles, on retombe sur 1,35 (`assumed_density`), et ça se
//     compte.
//
// ⛔ PAS DE RETOUR AU KILO. `MEAL_MAX_GRAMS_PER_KG` a été retiré du plafond de
// repas le 2026-09-04 (une enfant de 36 kg qui s'entraîne perdait sa boîte à
// 288 g) et deux tests le tiennent ; il reste à `eating_structure.ts`. Le
// plancher de densité est la borne physique de CE plafond.
//
// ⚠️ COMPTEUR OBLIGATOIRE (`capBit`) : quelle borne a décidé du facteur —
// `density`, `density_floor`, `assumed_density`, `factor_bound`
// (ANCHOR_FACTOR_MIN/MAX) ou `none`. Sans lui, un plafond qui ne mord plus
// jamais et un plafond qui mord partout rendraient le même `clamped`.

/**
 * LA DENSITÉ LA PLUS BASSE QU'UNE ASSIETTE PEUT AVOIR POUR QUE SON VOLUME SUIVE
 * SON BESOIN. Mesuré le 2026-09-05 (lecture 74, lot 1) : après attribution par
 * grammes tirés, les foyers de quatre servaient 1,57–1,69 kcal/g, les duos
 * 0,84–1,02 ; les assiettes d'avant v27 étaient à 0,59–0,62. La borne basse du
 * « plat ordinaire » mesuré le 2026-09-04 était 1,13. Sous 1,0 kcal/g, une
 * assiette ne grossit plus vers son besoin : elle se densifie (`box_densify`),
 * et le compteur `density_floor` dit combien de fois c'est arrivé.
 */
export const MEAL_KCAL_PER_G_FLOOR = 1.0;

export const MEAL_CAP_BITS = Object.freeze(
  ["none", "density", "density_floor", "assumed_density", "factor_bound"] as const,
);
export type MealCapBit = (typeof MEAL_CAP_BITS)[number];

/**
 * LE PLAFOND DE MASSE D'UN REPAS, À LA DENSITÉ MESURÉE — et la borne qui l'a fixé.
 *
 * `grams` est `null` quand le repas n'a pas de cible lisible.
 * PURE: no I/O, no clock, no randomness.
 */
export function mealMassCapFor(args: {
  mealKcal: number;
  /** Ce que la bouche (ou la casserole) a livré, pour la densité. */
  deliveredKcal: number | null;
  deliveredGrams: number | null;
}): { grams: number | null; source: Exclude<MealCapBit, "none" | "factor_bound"> } {
  if (!Number.isFinite(args.mealKcal) || args.mealKcal <= 0) {
    return { grams: null, source: "assumed_density" };
  }
  const measured = args.deliveredKcal !== null && args.deliveredGrams !== null &&
      args.deliveredKcal > 0 && args.deliveredGrams > 0
    ? args.deliveredKcal / args.deliveredGrams
    : null;
  if (measured === null) {
    return { grams: args.mealKcal / MEAL_KCAL_PER_G_COMPOSED, source: "assumed_density" };
  }
  if (measured < MEAL_KCAL_PER_G_FLOOR) {
    return { grams: args.mealKcal / MEAL_KCAL_PER_G_FLOOR, source: "density_floor" };
  }
  // Jamais plus serré qu'hier : au-dessus de 1,35, c'est 1,35 qui reste.
  return { grams: args.mealKcal / Math.min(measured, MEAL_KCAL_PER_G_COMPOSED), source: "density" };
}

/**
 * CE QUE CHAQUE MOMENT PORTE À CÔTÉ DU PLAT, EN KCAL — ou `null`.
 *
 * ⛔ TROIS ÉTATS, ET LA DIFFÉRENCE EST LE LOT ENTIER. `null` = jamais demandé.
 * Clé absente = ce moment-là n'a pas été renseigné. Clé à `0` = renseigné, rien
 * à côté du plat. Les deux premiers retombent sur `UNANSWERED_EXTRAS_KCAL`;
 * le troisième laisse le plat porter tout son repas.
 *
 * ⚠️ `Record<string, number>` ET PAS `Record<ExtraBearingSlot, number>`: la clé
 * vient d'une saisie d'écran et d'un jsonb, pas d'un type. Un moment qui ne
 * porte pas d'extras y serait simplement ignoré (`slotBearsExtras`).
 */
export type SlotExtraKcal = Readonly<Record<string, number>> | null;

/**
 * LES QUATRE ÉTATS DE LA QUESTION, POUR LE COMPTEUR.
 *
 * ⟳ 2026-09-01 — LE VOCABULAIRE SURVIT, SON SUJET CHANGE. Ces états comptaient
 * trois CASES (dessert/fromage/pain) posées une fois pour la personne; ils
 * comptent désormais les deux MOMENTS qui portent des extras. Les garder
 * identiques est ce qui rend la colonne d'avant et celle d'après comparables.
 *
 * ⛔ ET `partial` NE COMPLÈTE RIEN. Traiter un moment non renseigné comme un
 * « rien à côté » ferait monter la part du plat sur une réponse que personne
 * n'a donnée, dans la direction qui nourrit trop.
 */
export const MEAL_STRUCTURE_STATES = [
  "answered",
  "partial",
  "not_answered",
  "not_asked",
] as const;
export type MealStructureState = (typeof MEAL_STRUCTURE_STATES)[number];

/** `null` = la fiche n'a jamais vu la question. PURE. */
export function mealStructureState(
  extras: SlotExtraKcal,
): MealStructureState {
  if (extras === null) return "not_asked";
  const known = EXTRA_BEARING_SLOTS.filter((slot) =>
    Object.prototype.hasOwnProperty.call(extras, slot)
  ).length;
  if (known === EXTRA_BEARING_SLOTS.length) return "answered";
  if (known === 0) return "not_answered";
  return "partial";
}

/** Le poids d'un moment, ou `0` pour un jeton hors de la liste fermée. */
/**
 * CE QUE PÈSE UN MOMENT QUE LA PERSONNE A MARQUÉ « LÉGER » — 2026-09-07.
 *
 * ⛔ UNE SECONDE TABLE, PAS UNE MODIFICATION DE LA PREMIÈRE. `SLOT_DAY_WEIGHT`
 * décrit ce que pèse un moment ORDINAIRE et sert quatre autres lecteurs
 * (`dayCoverageOf`, le plafond de vraisemblance, `pot_demand`, le bac). La
 * plier pour un cas particulier ferait bouger tout le monde pour la déclaration
 * d'une seule personne. La table de base n'est pas touchée, et un test épingle
 * qu'elle somme encore 1,30.
 *
 * ⚠️ TROIS MOMENTS SEULEMENT, ET C'EST LA MÊME LISTE QUE `LIGHT_BEARING_SLOTS`.
 * « Une collation légère » ne veut rien dire: une collation est déjà la petite
 * part de la journée (0,10), et la marquer légère demanderait au plan de
 * composer 40 kcal. Les trois repas sont les seuls où « moins que d'habitude »
 * a un sens et de la place.
 *
 * ⚠️ CE SONT DES CONVENTIONS, PAS DES MESURES — comme `SLOT_DAY_WEIGHT`. Le
 * dîner passe de 0,35 à 0,20, le déjeuner de 0,40 à 0,25, le petit-déjeuner de
 * 0,25 à 0,15: à peu près −40 % dans les trois cas. ⛔ Ce qui compte n'est PAS
 * la valeur absolue: les parts sont RENORMALISÉES sur la somme des moments
 * déclarés, donc ce que la personne retire du soir, les autres moments le
 * reprennent. Un dîner léger ne fait pas maigrir la journée, il la déplace.
 */
export const LIGHT_SLOT_WEIGHT = Object.freeze({
  breakfast: 0.15,
  lunch: 0.25,
  dinner: 0.20,
});

/**
 * ⛔ `lightSlots` EST REQUIS, jamais facultatif. Un appelant qui l'oublierait
 * pèserait un dîner léger comme un dîner ordinaire — c'est-à-dire annulerait la
 * déclaration en silence, ce qui est exactement le mode d'échec n°1 du dépôt
 * (`optional-gate-params-are-disarmed-gates`). Le compilateur est le seul
 * recenseur d'appelants qui ne mente pas.
 */
function slotWeight(slot: string, lightSlots: readonly string[]): number {
  if (
    lightSlots.includes(slot) &&
    Object.prototype.hasOwnProperty.call(LIGHT_SLOT_WEIGHT, slot)
  ) {
    return LIGHT_SLOT_WEIGHT[slot as keyof typeof LIGHT_SLOT_WEIGHT];
  }
  return Object.prototype.hasOwnProperty.call(SLOT_DAY_WEIGHT, slot)
    ? SLOT_DAY_WEIGHT[slot as keyof typeof SLOT_DAY_WEIGHT]
    : 0;
}

/**
 * CE QU'ON RETRANCHE À UN MOMENT — et pourquoi ce n'est presque jamais zéro.
 *
 * ⛔ TROIS CHEMINS, ET LE PREMIER EST LE PLUS DANGEREUX:
 *   · le moment ne porte pas d'extras (petit-déjeuner, collations) ⇒ `0`. Le
 *     plan y compose TOUT, il n'y a rien à côté.
 *   · le moment n'a pas été renseigné ⇒ `UNANSWERED_EXTRAS_SHARE` du repas.
 *     Retrancher zéro affirmerait « cette personne ne prend rien à côté »,
 *     c'est-à-dire ×2,4 sur la cible de toute la population muette.
 *   · le moment a été renseigné ⇒ la somme lue, telle quelle.
 *
 * ⚠️ ET UN PLANCHER, NOMMÉ. Cinq extras sur une petite cible rendraient la part
 * du plat négative — une assiette vide servie comme une décision. Le plancher
 * est un RATIO parce que la cible varie d'un facteur trois entre un enfant et
 * un adulte sportif: un plancher en kcal mordrait sur l'un et jamais sur
 * l'autre.
 */
function extrasKcalFor(
  slot: string,
  extras: SlotExtraKcal,
): { kcal: number; floored: boolean } {
  if (!slotBearsExtras(slot)) return { kcal: 0, floored: false };
  const answered = extras !== null &&
    Object.prototype.hasOwnProperty.call(extras, slot);
  // ⟳ 2026-09-04 — LES DEUX BRANCHES ONT ENFIN LA MÊME UNITÉ. La branche
  // supposée valait `mealKcal * 0,58`, une FRACTION du besoin, quand la branche
  // déclarée vaut des kcal. Du pain reste du pain: en pourcentage, plus
  // quelqu'un avait besoin de manger, plus on supposait qu'il mangeait ailleurs.
  const raw = answered
    ? Math.max(0, Number(extras[slot]) || 0)
    : UNANSWERED_EXTRAS_KCAL;
  // ⟳ 2026-09-07 — LE PLANCHER A REMONTÉ D'UN CRAN, chez `slotPlanTargets`.
  // Il y a maintenant DEUX retraits sur le même repas (les extras et les
  // apports fixes) et un seul plancher peut les borner: appliqué ici, il
  // laisserait passer `extras = plafond` PUIS `shaker = 120`, et le plat
  // tomberait sous la part que le plancher promet de lui garder. Cette
  // fonction rend donc le BRUT; c'est l'appelant qui rabote, et qui dit
  // LEQUEL des deux retraits a mordu.
  return { kcal: raw, floored: false };
}

/**
 * CE QUE LE PLAN DOIT FOURNIR À UNE BOUCHE, MOMENT PAR MOMENT.
 *
 *     part(moment)  = poids[moment] / Σ poids[TOUS ses moments]
 *     cible(moment) = cible_jour × part(moment) − extras(moment)
 *
 * ── ⛔ POURQUOI ELLE EST EXPORTÉE (2026-09-04) ────────────────────────────
 * Elle vivait inline dans `anchorFactorFor`. Le dimensionnement d'un BAC a
 * besoin du MÊME partage — la part de `lunch` dans la journée de chacun de ses
 * mangeurs — et une seconde écriture de cette arithmétique divergerait de celle
 * qui fait autorité au premier ajustement. C'est la règle que `neededPotFactor`
 * énonce déjà pour le prorata des casseroles, appliquée ici.
 *
 * ⚠️ DEUX LISTES DE MOMENTS, ET ELLES NE SE CONFONDENT PAS. `wholeSlots` est
 * TOUTE sa journée (déclarés ∪ composés) et fait le dénominateur; `coveredSlots`
 * est ce dont on demande compte, et fait la somme. Les passer identiques rend la
 * journée entière — ce qui est juste quand tout est lisible, et faux dès qu'un
 * moment ne l'est pas.
 *
 * `total: 0` = rien à demander (aucun moment reconnu, ou aucun couvert).
 * L'appelant décide ce que ça veut dire chez lui; ici on ne devine pas.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function slotPlanTargets(args: {
  targetKcal: number;
  coveredSlots: readonly string[];
  wholeSlots: readonly string[];
  slotExtraKcal: SlotExtraKcal;
  /**
   * ⟳ 2026-09-07 — LES MOMENTS QUE LA PERSONNE A MARQUÉS « LÉGER ».
   *
   * ⛔ REQUIS. Un `?` ici ferait peser un dîner léger comme un dîner ordinaire
   * chez tout appelant qui l'oublie — la déclaration annulée en silence.
   * `[]` est la valeur des appelants LEGACY, et elle rend le calcul
   * octet-identique à celui d'avant ce lot.
   */
  lightSlots: readonly string[];
  /**
   * ⟳ 2026-09-07 — CE QUE LA PERSONNE AVALE DÉJÀ À CE MOMENT-LÀ (le shaker).
   *
   * `null` ou moment absent ⇒ rien à retrancher. ⛔ REQUIS pour la même raison:
   * l'oublier laisserait la cible du goûter entière et ferait manger le plat
   * composé EN PLUS du shaker. Vient de `slot_fixed_kcal.ts`.
   */
  slotFixedKcal: ReadonlyMap<string, number> | null;
}): {
  bySlot: Map<string, number>;
  total: number;
  floored: boolean;
  /** Le retrait des EXTRAS a été raboté par le plancher. */
  extrasFloored: boolean;
  /** Le retrait des APPORTS FIXES a été raboté par le plancher. */
  fixedFloored: boolean;
} {
  const whole = [...new Set(args.wholeSlots)]
    .reduce((n, slot) => n + slotWeight(slot, args.lightSlots), 0);
  const bySlot = new Map<string, number>();
  let total = 0;
  let extrasFloored = false;
  let fixedFloored = false;
  if (whole <= 0) {
    return { bySlot, total, floored: false, extrasFloored, fixedFloored };
  }
  for (const slot of new Set(args.coveredSlots)) {
    const meal = args.targetKcal * (slotWeight(slot, args.lightSlots) / whole);
    // ⛔ UN SEUL PLANCHER POUR LES DEUX RETRAITS. `COMPOSED_DISH_MIN_MEAL_SHARE`
    // promet au plat une part de son repas; deux rabotages indépendants la
    // laisseraient passer sous cette part sans qu'aucun des deux ne se déclare.
    const ceiling = meal * (1 - COMPOSED_DISH_MIN_MEAL_SHARE);
    // ⛔ L'APPORT FIXE PASSE EN PREMIER, ET CE N'EST PAS ARBITRAIRE. Le shaker
    // est un FAIT que quelqu'un a écrit — 120 kcal qu'il boira. Les extras
    // sont, pour la population muette, une CONVENTION
    // (`UNANSWERED_EXTRAS_KCAL`). Quand la place manque, c'est la convention
    // qui cède, jamais la déclaration: raboter le shaker d'abord ferait
    // composer un repas entier par-dessus une boisson qu'on sait avalée.
    const fixedRaw = Math.max(0, args.slotFixedKcal?.get(slot) ?? 0);
    const fixed = Math.min(fixedRaw, ceiling);
    if (fixedRaw > ceiling) fixedFloored = true;
    const extrasRaw = extrasKcalFor(slot, args.slotExtraKcal).kcal;
    const extras = Math.min(extrasRaw, ceiling - fixed);
    if (extrasRaw > ceiling - fixed) extrasFloored = true;
    const kcal = meal - fixed - extras;
    bySlot.set(slot, kcal);
    total += kcal;
  }
  // `floored` reste le nom que les appelants legacy lisent, et il garde son
  // sens d'origine: « un retrait a été raboté ».
  return {
    bySlot,
    total,
    floored: extrasFloored || fixedFloored,
    extrasFloored,
    fixedFloored,
  };
}

/**
 * LA PART MINIMALE QU'UN PLAT COMPOSÉ GARDE DE SON REPAS.
 *
 * ⚠️ CONVENTION, ET ELLE EST LÀ POUR UN CAS RÉEL: cinq extras déclarés sur un
 * déjeuner de 560 kcal laisseraient 49 kcal au plat — une cuillère servie comme
 * un repas. L'ancien système ne pouvait pas descendre sous `300/620 = 0,48`
 * par construction; celui-ci le peut, donc il lui faut une borne écrite.
 *
 * ⛔ ELLE DOIT MORDRE RAREMENT. Une borne qui mord sur la population entière
 * n'est plus une borne, c'est le calcul — ce dépôt l'a déjà mesuré deux fois
 * (`ANCHOR_FACTOR_MAX`, `BOX_FACTOR_MIN`). `0,30` laisse passer les cinq extras
 * sur une cible ordinaire et ne retient que l'absurde.
 */
export const COMPOSED_DISH_MIN_MEAL_SHARE = 0.30;

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-01 — `composedDishShare` EST MORT, ET VOICI CE QU'IL FAISAIT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Il rendait UN ratio par personne — `300 / (300 + pain + fromage + dessert)` —
 * et `anchorFactorFor` le multipliait à la cible de la JOURNÉE ENTIÈRE. Avec
 * lui meurent `MEAL_COMPONENT_KCAL` (120/120/80), `COMPOSED_DISH_KCAL` (300) et
 * `COMPOSED_DISH_MEAL_SHARE` (0,42).
 *
 * ── LES DEUX DÉFAUTS QUI L'ONT TUÉ ────────────────────────────────────────
 *   ① IL NE SAVAIT PAS DE QUEL REPAS IL PARLAIT. « Je prends du pain » ne dit
 *     ni midi ni soir; le même ratio partait sur les six moments.
 *   ② IL AMPUTAIT LE PETIT-DÉJEUNER D'UNE CONVENTION DE DÎNER. `0,42` décrit
 *     un dîner français (entrée, plat, pain, fromage, dessert); appliqué au
 *     petit-déjeuner — que le plan compose ENTIÈREMENT — il retirait 58 % d'une
 *     cible que rien ne venait compléter à côté.
 *
 * ── CE QUI LE REMPLACE, ET CE QUE ÇA DÉPLACE ──────────────────────────────
 * Une somme explicite, moment par moment (voir `anchorFactorFor`). Mesuré avant
 * d'écrire, sur la cible effective:
 *
 *     midi + soir seulement ....... 0,420 → 0,420    +0,0 %
 *     les trois repas ............. 0,420 → 0,565   +34,5 %
 *     trois repas + goûter ........ 0,420 → 0,605   +43,9 %
 *     petit-déjeuner seul ......... 0,420 → 1,000  +138,1 %
 *
 * ⚠️ LA LIGNE À +0 % EST LA PREUVE QUE LE RESTE N'EST PAS UN ACCIDENT: une
 * fiche midi+soir garde sa cible au bit près. Tout l'écart vient des moments
 * que le plan compose entièrement et qui cessent d'être amputés.
 *
 * ⛔ LA CONVENTION `0,42` N'A PAS DISPARU POUR AUTANT — elle a changé de rôle
 * et d'adresse: `UNANSWERED_EXTRAS_SHARE = 0,58` (`meal_extras.ts`) est son
 * complément, et il ne s'applique plus qu'à UN MOMENT NON RENSEIGNÉ. La
 * supprimer aurait multiplié par 2,4 la cible de toute la population muette.
 */

/**
 * ⚠️ RELEVÉ DE 1,60 À 3,00 LE 2026-08-20, ET CE N'EST PAS UN DESSERRAGE DE
 * CONFORT — c'est le seul moyen que la borne cesse d'être LA VALEUR OPÉRANTE.
 *
 * Mesuré sur un run réel du foyer `5600347f`: les trois bouches-jours ancrées
 * sortaient à `1,600` **exactement**, c'est-à-dire au plafond, toutes les
 * trois. Deux cibles différentes (3 925 et 2 205 kcal) rendaient donc le MÊME
 * facteur, et l'écran gardait ses grammes identiques — le défaut que tout ce
 * chantier existe pour corriger, reproduit par sa propre ceinture.
 *
 * ⛔ UNE BORNE QUI MORD SUR LA POPULATION ENTIÈRE N'EST PLUS UNE BORNE DE
 * PLAUSIBILITÉ, C'EST LE CALCUL. C'est la troisième fois que ce dépôt le
 * mesure (`BOX_FACTOR_MIN`: « 0,75 était trop serré »), et le patron est
 * toujours le même: la ceinture se referme d'abord sur le cas qu'elle était
 * censée servir.
 *
 * `3,00` reste une CONVENTION, pas une dérivation: elle laisse passer les
 * facteurs réellement mesurés (2,28 à 2,94 sur ce foyer) et refuse encore
 * l'ordre de grandeur absurde. Le résidu part dans `raw`, pour la casserole.
 */
export const ANCHOR_FACTOR_MAX = 3.00;

/**
 * LES MOMENTS QUI ONT UN POIDS — la liste fermée, tenue ICI.
 *
 * ⛔ MIROIR DE `MEAL_SLOTS` (`meal_generation.ts`), ET PAS UN IMPORT. Ce
 * module-ci est petit et pur; `meal_generation.ts` fait sept mille lignes et
 * tire tout le référentiel derrière lui. C'est l'idiome déjà appliqué à
 * `meal_plan_window.ts` et à son jumeau d'écran: deux listes, et UN TEST qui
 * les compare — c'est lui qui empêche la divergence, pas l'import.
 *
 * ⚠️ `snack` EST LE JETON LEGACY, et il est ici pour une raison mesurable.
 * `dayCoverageOf` reçoit `day.slots`, rempli depuis `dish.slot`, validé contre
 * `MEAL_SLOTS` — donc `snack` peut arriver depuis un plan déjà en base. Sans
 * poids, il tomberait à zéro et rejouerait exactement le défaut que ce lot
 * ferme, sur la donnée ancienne.
 *
 * ⛔ ET ON NE DEVINE PAS DE QUEL MOMENT IL S'AGIT. `snack` ne dit ni matin ni
 * après-midi; le mapper sur l'un des deux inventerait une heure que personne
 * n'a écrite. Il pèse ce que pèse une collation, et c'est tout ce qu'on sait.
 */
const WEIGHTED_SLOTS = [
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
  "snack",
] as const;
type WeightedSlot = (typeof WEIGHTED_SLOTS)[number];

/**
 * CE QUE CHAQUE MOMENT PÈSE DANS UNE JOURNÉE — pour savoir quelle PART de la
 * journée d'une bouche le plan a réellement composée.
 *
 * ⛔ LE DÉFAUT QUE CES NOMBRES FERMENT, MESURÉ LE 2026-08-20. Christèle
 * déclare `lunch` + `dinner`; le plan ne lui compose que `dinner`. Comparer sa
 * cible de JOURNÉE ENTIÈRE (2 205 kcal) à ce seul dîner rendait un facteur
 * brut de **6,28** — c'est-à-dire une assiette de deux kilos, ou, une fois
 * rabotée, la même que celle de tout le monde.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-01 — DE TROIS MOMENTS À SEPT, ET C'ÉTAIT UNE SOUS-ALIMENTATION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cette table ne portait que `breakfast`, `lunch` et `dinner`. Les trois
 * collations valaient **zéro** par le `?? 0` de `dayCoverageOf` — et zéro n'est
 * pas neutre ici, c'est faux dans une seule direction.
 *
 * Une habitude composée à l'après-midi apporte de l'énergie réelle dans
 * `day.kcal`, le dénominateur du facteur, **en comptant pour rien** au
 * numérateur. `cible × couverture / livré` rétrécit donc systématiquement, et
 * la personne reçoit moins. Aucun test ne bougeait: le défaut était invisible
 * partout sauf dans l'assiette.
 *
 * ⚠️ LA SOMME NE FAIT PLUS 1, ET CE N'EST PAS UN DÉFAUT. `dayCoverageOf` rend
 * `couvert / total` où le total est la somme sur les moments DÉCLARÉS: c'est un
 * rapport, jamais une valeur absolue. Les nombres se simplifient — seul leur
 * ordre de grandeur relatif compte, et c'est ce qui autorise une convention.
 *
 * ⚠️ AUCUNE RÉGRESSION, ET ELLE EST TESTÉE EN PREMIER. Une bouche qui ne
 * déclare que les trois repas principaux n'atteint jamais les clés neuves: sa
 * couverture est identique au bit près. C'est l'ajout qui est purement additif,
 * pas la table qui est réécrite.
 *
 * ⚠️ CE N'EST PAS UNE RECOMMANDATION NUTRITIONNELLE, c'est une clé de
 * répartition, et elle est ordinaire: une collation pèse moins qu'un déjeuner.
 * Elle ne sert qu'à normaliser, jamais à prescrire.
 *
 * ⛔ `Record` COMPLET SUR `WeightedSlot`: un moment ajouté à la liste sans son
 * poids ne compile pas. C'est la garde que les trois collations n'avaient pas —
 * elles étaient absentes d'un `Record<string, number>`, que rien n'oblige à
 * être complet.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-03 (D7.8) — UN SECOND LECTEUR, ET IL LIT DANS L'AUTRE SENS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cette table a été écrite pour DIMENSIONNER: savoir quelle part de la journée
 * d'une bouche le plan a réellement composée, et corriger un facteur d'ancrage
 * qui rendait sinon une assiette de deux kilos.
 *
 * `keel-tracking-v1` (la page de suivi) l'emploie pour la question INVERSE:
 * *un créneau que la personne a déclaré et que personne n'a renseigné, ça pesait
 * combien ?* La réponse est le milieu de sa fourchette d'entretien réparti sur
 * ce créneau, arrondi aux 50, sous la base `slot_estimate` — une CONVENTION qui
 * dit son nom, jamais une lecture.
 *
 * ⚠️ ET C'EST BIEN LE MÊME OBJET, PAS UN HOMONYME. Dans les deux sens, la table
 * ne répond qu'à « quelle PART », et l'avertissement du dessus vaut toujours
 * mot pour mot: ce n'est pas une recommandation nutritionnelle, ça normalise,
 * ça ne prescrit pas. Ce que le second lecteur ajoute est qu'une part sert
 * maintenant à RECONSTITUER autant qu'à dimensionner.
 *
 * ⛔ LE PIÈGE QUE LE SECOND LECTEUR A DÛ FERMER, ET IL EST DANS CE FICHIER.
 * « La somme ne fait plus 1, et ce n'est pas un défaut » — vrai pour un
 * RAPPORT, mortel pour une valeur absolue. Les six occasions somment à 1,30:
 * multiplier une cible de journée par 0,40 pour le déjeuner, puis recommencer
 * pour les cinq autres, rendrait **130 %** de la journée. Le lecteur du suivi
 * divise donc par la somme des poids DÉCLARÉS
 * (`tracking_window.ts`, `slotDayShare`), exactement comme `dayCoverageOf` le
 * fait ici pour la couverture, et un test vérifie que les six parts somment à 1.
 *
 * ⛔ NE « NORMALISE » PAS CETTE TABLE POUR AUTANT. La ramener à une somme de 1
 * casserait `dayCoverageOf`, dont le dénominateur est justement la somme sur
 * les moments déclarés — et le rapport, lui, est déjà juste.
 */
export const SLOT_DAY_WEIGHT: Readonly<Record<WeightedSlot, number>> = Object
  .freeze({
    breakfast: 0.25,
    snack_am: 0.10,
    lunch: 0.40,
    snack_pm: 0.10,
    dinner: 0.35,
    before_bed: 0.10,
    // Le legacy pèse ce que pèse une collation — voir `WEIGHTED_SLOTS`.
    snack: 0.10,
  });

/** Les moments pesés, pour le test qui les compare à `MEAL_SLOTS`. */
export const WEIGHTED_SLOT_TOKENS: readonly string[] = WEIGHTED_SLOTS;

/**
 * CE QUE « RIEN DE DÉCLARÉ » VEUT DIRE — les moments de la maison.
 *
 * ⛔ TROIS, ET SÛREMENT PAS `Object.keys(SLOT_DAY_WEIGHT)`. C'est ce que
 * `dayCoverageOf` lisait, et c'était juste par accident: la table ne portait
 * QUE ces trois-là. Le jour où elle en a porté sept, la couverture de toute la
 * population muette serait tombée de `1` à `0,77` — 23 % de part en moins, sans
 * qu'une seule ligne de test bouge.
 *
 * Une constante nommée ne peut pas se faire élargir par un lot qui parle d'autre
 * chose.
 */
const HOUSE_DEFAULT_SLOTS: readonly string[] = Object.freeze([
  "breakfast",
  "lunch",
  "dinner",
]);

/**
 * LA PART DE LA JOURNÉE D'UNE BOUCHE QUE LE PLAN PORTE.
 *
 * `1` = le plan compose tous les moments qu'elle a déclarés — le cas nominal.
 * `0,47` = il n'en compose qu'un sur deux, et sa cible doit être réduite
 * d'autant, sinon on demande à un dîner de porter une journée.
 *
 * ⚠️ UN MOMENT COMPOSÉ QU'ELLE N'A PAS DÉCLARÉ COMPTE QUAND MÊME. Le plan le
 * lui sert, donc il la nourrit; l'ignorer sous-estimerait ce qu'elle reçoit et
 * gonflerait sa part.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function dayCoverageOf(
  declaredSlots: readonly string[],
  composedSlots: readonly string[],
): number {
  // ⛔ LE REPLI EST EXPLICITE, ET IL NE PEUT PLUS ÊTRE ATTEINT PAR UN MOMENT
  // LÉGITIME. `SLOT_DAY_WEIGHT` couvre les sept jetons que `dish.slot` accepte;
  // ce `0` ne garde donc plus qu'une chaîne hors de la liste fermée. Avant le
  // 2026-09-01 il valait pour TROIS moments sur six, et c'était une
  // sous-alimentation silencieuse — voir le pavé de la table.
  const weight = (slot: string) =>
    Object.prototype.hasOwnProperty.call(SLOT_DAY_WEIGHT, slot)
      ? SLOT_DAY_WEIGHT[slot as keyof typeof SLOT_DAY_WEIGHT]
      : 0;
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ « RIEN DE DÉCLARÉ » VAUT LES TROIS REPAS, PAS TOUTE LA TABLE.
  // ══════════════════════════════════════════════════════════════════════
  //
  // Cette ligne lisait `Object.keys(SLOT_DAY_WEIGHT)`, ce qui était juste TANT
  // QUE la table ne portait que les trois repas principaux. Le 2026-09-01 elle
  // en porte sept: le repli serait passé de `1,00` à `1,30` de total, et la
  // couverture d'une bouche qui n'a RIEN déclaré serait tombée de `1` à `0,77`
  // — c'est-à-dire 23 % de part en moins, pour toute la population muette, en
  // silence et sans qu'un seul test bouge.
  //
  // « Rien de déclaré » veut dire « aux moments de la maison », et la maison en
  // a trois. La constante le dit maintenant, au lieu de le déduire d'une table
  // qui a le droit de grandir.
  const declared = new Set(
    declaredSlots.length > 0 ? declaredSlots : HOUSE_DEFAULT_SLOTS,
  );
  for (const slot of composedSlots) declared.add(slot);
  let whole = 0;
  for (const slot of declared) whole += weight(slot);
  if (whole <= 0) return 1;
  let covered = 0;
  for (const slot of new Set(composedSlots)) covered += weight(slot);
  if (covered <= 0) return 1;
  return Math.min(1, covered / whole);
}

/** Ce que l'ancrage lit d'une bouche. Rien d'autre n'entre. */
export interface AnchorMouth {
  memberId: string;
  ageState: MemberAgeState;
  restriction: MouthRestrictionState;
  /** Le corps de sa FICHE (`household_member_bodies`), mineurs compris. */
  body: MouthBody | null;
  /** La direction dérivée de son objectif. `null` = ni perte ni prise. */
  direction: ScaleDirection | null;
  /** Le cran réglé, ou `null` — le défaut de la direction s'applique alors. */
  paceKgPerWeek: number | null;
  /**
   * LES MOMENTS QU'ELLE A DÉCLARÉS (`eating_rhythm`). Vide = les moments de la
   * maison, c'est-à-dire les trois.
   *
   * ⛔ REQUIS, jamais `?`. Un défaut à « tous les moments » ferait de la
   * couverture totale la réponse silencieuse de tous les appelants, et le
   * facteur d'une bouche à moitié composée redeviendrait trois fois trop grand
   * sans que rien ne le dise.
   */
  declaredSlots: readonly string[];
  /**
   * CE QU'ELLE PREND À CÔTÉ DU PLAT, MOMENT PAR MOMENT — en kcal (2026-09-01).
   *
   * ⛔ TROIS ÉTATS, ET ILS NE SE CONFONDENT PAS:
   *   · `null` .............. la fiche n'a jamais vu la question;
   *   · clé ABSENTE ......... ce moment-là n'a pas été renseigné;
   *   · clé à `0` ........... renseigné, et il n'y a rien à côté du plat.
   *
   * Les deux premiers retombent sur `UNANSWERED_EXTRAS_SHARE`; le troisième
   * laisse le plat porter tout son repas. Les confondre ferait écrire « cette
   * personne ne prend rien » sur une fiche muette — la cicatrice « coche auto =
   * faits faux indémentables », dans le sens qui nourrit trop.
   *
   * ⛔ DES KCAL, PAS UNE LISTE D'ALIMENTS, ET C'EST DÉLIBÉRÉ. Résoudre un extra
   * demande le référentiel de composition; le faire ICI tirerait tout
   * `food_composition.ts` dans un module qui n'a besoin que d'un nombre.
   * L'appelant résout (`meal_extras.ts::extrasOf`) et passe la somme — ce
   * module reste pur et arithmétique.
   *
   * ⛔ REQUIS ET NULLABLE, jamais `?`. Un champ facultatif aurait fait du repli
   * la réponse SILENCIEUSE de tous les appelants: le lot serait construit,
   * branché, désarmé, et le compteur ne pourrait plus distinguer « pas posé »
   * de « pas câblé ».
   */
  slotExtraKcal: SlotExtraKcal;
  /**
   * L0bis — LES `condition_ref` QUE CETTE BOUCHE A DÉCLARÉS.
   *
   * ⛔ REQUIS ET NON OPTIONNEL, jamais `?`. « Paramètre de garde optionnel =
   * garde désarmée » est une leçon déjà payée par ce dépôt (`safetyBand: null`,
   * jamais passé). Un `?` ici aurait laissé le tableau vide être la réponse
   * SILENCIEUSE de tous les appelants: la garde de grossesse serait écrite,
   * testée, branchée nulle part — et un lot désarmé ressemble trait pour trait
   * à un lot qui marche. `[]` = cette bouche n'a rien déclaré, et il faut
   * l'écrire.
   *
   * ⚠️ SOURCE: `student_safety_constraints.condition_ref`, et ELLE SEULE. Il
   * n'existe pas de `household_member_conditions`, donc une bouche SANS COMPTE
   * ne peut porter aucune condition aujourd'hui — c'est un trou nommé, pas un
   * oubli. Voir la fiche `L0bis-a` du plan.
   */
  conditionRefs: readonly string[];
}

/**
 * ⟳ 2026-09-06 — ARBITRAGE 3 (2026-09-05) : UNE NOTE DATÉE FAIT GROSSIR LA PART
 * D'UN CRAN FIXE. « Léa danse le mardi, il lui faut un vrai repas » arrivait au
 * modèle (la ligne était servie, `notes served=1`) et la boîte du mardi ne
 * changeait pas : une phrase bouge les mots, pas les grammes. Décision du
 * propriétaire : ce jour-là, la cible de cette bouche augmente d'une fraction
 * FIXE, et l'ancre fait le reste. Un quart : l'ordre de grandeur arbitré, à
 * lire sur `note_boost.applied` avant d'y toucher.
 */
export const DATED_NOTE_BOOST = 0.25;

export interface AnchorFactor {
  /** Ce qui est réellement multiplié. Raboté, jamais brut. */
  factor: number;
  /**
   * LE FACTEUR AVANT RABOTAGE — l'entrée du LOT 3.
   *
   * `null` quand rien n'a été calculé. Quand il diffère de `factor`, la
   * casserole ne suit pas ce que le corps demande, et c'est en AMONT (les
   * quantités des préparations) que ça se répare, pas ici.
   */
  raw: number | null;
  reason: AnchorReason;
  /** La cible du jour, en kcal. `null` si aucune n'a pu être calculée. */
  targetKcal: number | null;
  /** Ce que la journée livre à cette bouche, en kcal. `null` si inconnu. */
  deliveredKcal: number | null;
  /**
   * ⟳ 2026-09-04 — CE QUE LE PLUS GROS REPAS DE CETTE BOUCHE PEUT PESER, en
   * grammes: sa cible de repas à la densité d'un plat ordinaire
   * (`mealMassCapGrams`). `null` quand aucune cible n'existe. Rendu pour que
   * l'archive puisse dire « sa boîte est bornée à 519 g » au lieu de « clamped ».
   */
  capGrams: number | null;
  /** ⟳ ARBITRAGE 1 (2026-09-06) — la borne qui a décidé du facteur (voir `MEAL_CAP_BITS`). */
  capBit: MealCapBit;
  /**
   * D'OÙ VIENT LA PART DU PLAT — le compteur du LOT ①, rendu par bouche-jour.
   *
   * ⚠️ RENDU MÊME QUAND LE FACTEUR N'EST PAS CALCULÉ. Un compteur qui ne
   * parlerait que sur les journées ancrées ferait lire « personne n'a répondu »
   * sur un foyer où tout le monde a répondu et où toutes les journées sont
   * incomplètes.
   */
  structureState: MealStructureState;
  /**
   * LE PLANCHER DU PLAT A-T-IL MORDU SUR CETTE BOUCHE-JOUR ?
   *
   * ⛔ IL EXISTE POUR ÊTRE RARE, DONC IL DOIT SE COMPTER. `0,30` est une
   * convention: cinq extras sur une petite cible laisseraient au plat une
   * cuillère servie comme un repas, et la borne l'empêche. Mais une borne qui
   * mordrait sur la population entière ne serait plus une borne, ce serait LE
   * calcul — et rien ne le dirait. Le compteur est la seule différence entre
   * « elle protège d'un cas absurde » et « elle a remplacé la formule ».
   *
   * ⚠️ `false` SUR TOUTES LES SORTIES NON ANCRÉES, et c'est exact: sans cible
   * ou sans journée, aucun repas n'a été dimensionné, donc rien n'a été raboté.
   * Ce n'est pas la même chose que `structureState`, qui dit ce que la FICHE
   * porte et se rend partout.
   */
  extrasFloored: boolean;
  /**
   * ⟳ 2026-09-06 — LES KCAL D'UN MOMENT PERDU PAR LA LIGNE, remis dans la cible.
   *
   * Mesuré (banc « un retour et les calories », FB3) : Nora, végane, qui
   * n'aime pas le yaourt de soja, perd ses petits-déjeuners et passe de 61 % à
   * 44 % de sa cible — et aucun compteur ne la distingue, parce que la cible
   * du jour suit `ownSlots` : un moment qu'elle n'a plus n'est plus demandé.
   * Ici la part de ce moment reste DEMANDÉE à ses autres boîtes du jour ; le
   * facteur monte, le plafond mord ou la densification comble, et ce qui
   * reste est compté `unmet`. 0 quand rien n'a été perdu par une ligne.
   */
  lostLineKcal: number;
  /** ⟳ 2026-09-06 — la fraction de note datée appliquée à la cible (0 = aucune). */
  noteBoost: number;
}

/**
 * LA CIBLE D'UNE BOUCHE, EN KCAL/JOUR — entretien, plus l'écart EXÉCUTABLE.
 *
 * ── DEUX PORTES, DEUX PORTÉES, ET C'EST TOUTE LA FINESSE ─────────────────
 *   · L'ENTRETIEN traverse ② et ③ (comme `bodyShareFactors`): ce n'est pas une
 *     cible, c'est ce que ce corps dépense. Le refuser à un mineur lui servirait
 *     la part d'un adulte au nom de sa protection.
 *   · L'ÉCART (déficit ou surplus) est fermé par ② et ③ EN ENTIER: c'est un
 *     objectif, et un coach qui ne compte pas garde exactement ce qu'il a
 *     demandé — aucun déficit, aucun surplus, pour personne de sa cohorte.
 *
 * ⛔ ① (le plancher TCA) ferme les DEUX, et il est évalué en premier dans les
 * deux passes. C'est ce qui rend le dépassement de ②③ sûr.
 *
 * PURE: no I/O, no clock, no randomness.
 */
/**
 * L'ENTRETIEN D'UNE BOUCHE — le corps, et rien d'autre.
 *
 * ⟳ 2026-09-07 — EXTRAIT DE `mouthTargetKcal` PAR LE LOT 6, sans changer un
 * octet de son comportement (56 cas de test le tiennent).
 *
 * ⛔ LA PORTE ① (LE PLANCHER TCA) N'EST **PAS** APPLIQUÉE ICI, et c'est tout
 * l'objet de l'extraction. Dimensionner une assiette n'est pas conseiller une
 * perte de poids: refuser de dimensionner ne protège personne, ça sert une
 * assiette au hasard. `portion_sizing.ts` a donc besoin de l'entretien SEUL,
 * là où `mouthTargetKcal` doit continuer à fermer.
 *
 * ⚠️ `restriction: "unreadable"` FERME QUAND MÊME. « Plancher levé » et « on
 * n'a pas su lire » ne sont pas le même état: le premier est une décision
 * connue, le second est une ignorance — et sur une ignorance, on s'abstient.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function maintenanceKcalOf(
  mouth: AnchorMouth,
): { kcal: number | null; reason: AnchorReason } {
  if (mouth.restriction === "unreadable") {
    return { kcal: null, reason: "restriction_unknown" };
  }
  if (mouth.ageState === "unknown") return { kcal: null, reason: "age_unknown" };
  if (mouth.body === null) return { kcal: null, reason: "no_body" };
  const maintenance = estimatedMaintenanceFor({
    body: mouth.body,
    isMinor: mouth.ageState === "minor",
  });
  if (maintenance === null || !Number.isFinite(maintenance) || maintenance <= 0) {
    return { kcal: null, reason: "no_body" };
  }
  return { kcal: maintenance, reason: "anchored" };
}

/**
 * L'ÉCART QUE L'OBJECTIF OUVRE AUTOUR DE L'ENTRETIEN — signé, ou zéro.
 *
 * ⟳ 2026-09-07 — L'AUTRE MOITIÉ DE `mouthTargetKcal`. Elle porte la chaîne
 * ①②③ complète et la garde de grossesse; l'entretien, lui, n'en dépend pas.
 *
 * `reason !== null` ⇒ l'écart ne se calcule PAS et la cible entière se ferme
 * (grossesse, allaitement). `gap: 0` ⇒ aucun écart: la cible EST l'entretien,
 * ce qui est exactement ce qu'un coach qui ne compte pas demande.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function goalGapKcalOf(
  mouth: AnchorMouth,
  coachCounting: CountingStance,
): { gap: number; reason: AnchorReason | null } {
  const full = canSizeFromTarget({
    safety: energySafetyGates({
      restrictionFlag: restrictionFlagOf(mouth.restriction),
      ageVerdict: mouthAgeVerdict(mouth.ageState),
      coachCounting,
    }),
  });
  if (mouth.direction === null || !full.size) return { gap: 0, reason: null };
  // ── L0bis — LE GARDE DE GROSSESSE, POSÉ SUR LE DÉFICIT ET PAS SUR LA PERSONNE ──
  //
  // ⚠️ IL EST ICI ET PAS PLUS HAUT, ET LA POSITION EST L'ARBITRAGE. Placé en
  // tête, il aurait effacé du journal `restriction_floor`, `age_unknown` et
  // `no_body` de toute bouche enceinte — trois motifs qui disent chacun une
  // chose vraie et différente. Placé ICI, à l'endroit exact où l'écart va se
  // calculer, il ne change le verdict que des bouches qui allaient RECEVOIR un
  // déficit.
  //
  // ⛔ `direction === "down"` ET RIEN D'AUTRE. Sur une PRISE, ce garde ne mord
  // pas: rabattre un surplus retirerait de l'énergie à une femme enceinte qui
  // en demande, sous le nom d'une protection. Ce module retire des déficits.
  if (mouth.direction === "down") {
    const reason = conditionGateReason(conditionGatePopulationOf(mouth.conditionRefs));
    if (reason !== null) return { gap: 0, reason };
  }
  const pace = mouth.paceKgPerWeek !== null && Number.isFinite(mouth.paceKgPerWeek) &&
      mouth.paceKgPerWeek > 0
    ? mouth.paceKgPerWeek
    : DEFAULT_PACE_KG_PER_WEEK;
  const executed = executedPaceFor(
    mouth.direction,
    { body: mouth.body!, isMinor: mouth.ageState === "minor" },
    pace,
  );
  if (executed === null) return { gap: 0, reason: null };
  return {
    gap: mouth.direction === "up" ? executed.dailyDeltaKcal : -executed.dailyDeltaKcal,
    reason: null,
  };
}

export function mouthTargetKcal(
  mouth: AnchorMouth,
  coachCounting: CountingStance,
): { kcal: number | null; reason: AnchorReason } {
  // ① seul, pour l'ENTRETIEN: on rejoue la MÊME chaîne avec un verdict de
  // majeur et sans position de coach, ce qui est la seule façon de dépasser ②
  // et ③ sans recopier leurs `if`. Un plancher levé sort `restriction_floor` à
  // la PREMIÈRE passe, donc la seconde ne le desserre jamais.
  //
  // ⟳ 2026-09-07 — LE RESTE EST COMPOSÉ, PLUS RECOPIÉ. `maintenanceKcalOf` et
  // `goalGapKcalOf` portent les deux moitiés; cette fonction les assemble dans
  // le MÊME ordre qu'avant, et ses 56 cas de test n'ont pas bougé d'un octet.
  const floorOnly = canSizeFromTarget({
    safety: energySafetyGates({
      restrictionFlag: restrictionFlagOf(mouth.restriction),
      ageVerdict: mouthAgeVerdict("adult"),
      coachCounting: "no_position",
    }),
  });
  if (!floorOnly.size) {
    return {
      kcal: null,
      reason: mouth.restriction === "unreadable"
        ? "restriction_unknown"
        : "restriction_floor",
    };
  }
  const base = maintenanceKcalOf(mouth);
  if (base.kcal === null) return base;
  const goal = goalGapKcalOf(mouth, coachCounting);
  if (goal.reason !== null) return { kcal: null, reason: goal.reason };
  return { kcal: base.kcal + goal.gap, reason: "anchored" };
}

function clampAnchor(factor: number): { factor: number; clamped: boolean } {
  if (factor < ANCHOR_FACTOR_MIN) return { factor: ANCHOR_FACTOR_MIN, clamped: true };
  if (factor > ANCHOR_FACTOR_MAX) return { factor: ANCHOR_FACTOR_MAX, clamped: true };
  return { factor, clamped: false };
}

/**
 * LE FACTEUR ABSOLU D'UNE BOUCHE, POUR UN JOUR — `cible / livré`.
 *
 * ⛔ `day` EST REQUIS ET N'A PAS DE DÉFAUT. Un paramètre facultatif ferait de
 * « la journée entière » le repli silencieux de tous les appelants, et le lot
 * serait construit, branché, désarmé — le mode d'échec n°1 de ce dépôt.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function anchorFactorFor(
  mouth: AnchorMouth,
  day: MouthDayEnergy | null,
  coachCounting: CountingStance,
  /**
   * ⟳ 2026-09-06 — les kcal des moments que la LIGNE de cette bouche lui a
   * retirés ce jour-là (exclusion ou régime, cases encore manquantes après
   * relance et recours), valorisés par `lostSlotEnergy`. Ils s'AJOUTENT à la
   * cible réduite aux moments restants : la journée ne rétrécit pas parce
   * qu'un plat a été retiré. `0` = rien de perdu (comportement d'avant).
   */
  lostLineKcal = 0,
  /** ⟳ 2026-09-06 — fraction fixe d'une note datée pour (bouche, jour) ; voir `DATED_NOTE_BOOST`. */
  noteBoost = 0,
): AnchorFactor {
  const target = mouthTargetKcal(mouth, coachCounting);
  // ⚠️ LU AVANT TOUTE SORTIE, ET RENDU SUR TOUTES. Le compteur du LOT ① dit ce
  // que la FICHE porte, pas ce que la journée a permis: le calculer seulement
  // sur le chemin ancré ferait lire « personne n'a répondu » sur un foyer où
  // tout le monde a répondu et où chaque journée est incomplète.
  const structureState = mealStructureState(mouth.slotExtraKcal);
  if (target.kcal === null) {
    return {
      factor: 1,
      raw: null,
      reason: target.reason,
      targetKcal: null,
      deliveredKcal: day?.kcal ?? null,
      capGrams: null,
      capBit: "none",
      structureState,
      extrasFloored: false,
      lostLineKcal: 0,
      noteBoost: 0,
    };
  }
  // ⛔ L'EXPRESSION EST INCHANGÉE, OCTET POUR OCTET, ET SEULE L'ÉTIQUETTE SE
  // DÉDOUBLE (L-anchor-nodelivery, 2026-08-22). Toucher la condition aurait
  // déplacé des grammes; ce lot n'en déplace aucun. `deliveryCauseOf` est la
  // SEULE écriture de la règle de classement — un second `switch` ici
  // divergerait du compteur au premier ajustement, et c'est celui qu'on relit
  // le moins qui rendrait un chiffre faux.
  if (day === null || day.kcal === null || day.kcal <= 0) {
    return {
      factor: 1,
      raw: null,
      // `common_pot_only` est le seul silence qu'AUCUN lot ne peut réparer:
      // diviser un bac par ses mangeurs remettrait la division que v3 et v4
      // existent pour supprimer. Tous les autres cas restent `no_delivery`,
      // qui désigne désormais du RÉPARABLE et rien d'autre.
      reason: deliveryCauseOf(day) === "common_pot_only" ? "common_pot_day" : "no_delivery",
      targetKcal: target.kcal,
      deliveredKcal: null,
      capGrams: null,
      capBit: "none",
      structureState,
      extrasFloored: false,
      lostLineKcal: 0,
      noteBoost: 0,
    };
  }
  // ⛔ LA GARDE PRINCIPALE — MAIS PAS SUR N'IMPORTE QUELLE LACUNE.
  //
  // Ce qui doit bloquer est ce qui SOUS-ESTIME le livré **sans réduire la
  // cible en face**: un plat dont la boîte existe et dont l'énergie n'a pas pu
  // être lue (`dish_incomplete`), ou une boîte qui ne pèse rien
  // (`empty_box`). Là, `cible / livré` devient trop grand, et on servirait
  // davantage à quelqu'un parce qu'on n'a pas su lire son assiette.
  //
  // ⚠️ `no_box` NE BLOQUE PAS, ET C'EST UNE CORRECTION MESURÉE DU 2026-08-20.
  // Un plat sans couvercle n'entre pas dans `day.slots` — donc `dayCoverageOf`
  // a DÉJÀ retiré son moment de la cible. Les deux côtés du rapport sont
  // réduits ensemble, et le facteur reste juste.
  //
  // Le coût de l'avoir bloqué: sur six runs réels consécutifs, tout plan
  // contenant un seul plat cuisiné le jour même — c'est-à-dire presque tous —
  // sortait `day_incomplete` sur TOUTES ses bouches, et l'ancrage absolu ne
  // s'appliquait jamais. Une garde qui se referme sur la population entière
  // n'est plus une garde, c'est un interrupteur ouvert.
  //
  // ⟳ 2026-09-04 — `common_pot` CESSE DE BLOQUER, ET LA RAISON DE SON BLOCAGE
  // EST CE QUI A ÉTÉ RÉPARÉ. Il bloquait parce qu'un bac laissait le MOMENT du
  // plat dans `day.slots` — la bouche a bien mangé ce midi — pendant qu'il ne
  // rendait aucun kcal: un seul des deux côtés du rapport baissait, donc
  // `cible / livré` gonflait, et on aurait servi davantage à quelqu'un parce que
  // ses grammes décrivaient un récipient.
  //
  // ⛔ CE N'EST PAS UNE SYMÉTRIE AVEC `no_box`, C'EST SON ARGUMENT. La cible est
  // désormais réduite à `day.ownSlots` — les moments où elle est SEULE sur un
  // couvercle — pendant que `day.kcal` ne compte, lui aussi, que ces
  // contenants-là (`dishSlices` rend `null` sur un bac, et la ligne l'écarte
  // avant d'additionner). Les deux côtés baissent ensemble, exactement comme
  // pour `no_box`. Ce qui restait vrai du blocage ne l'est plus.
  //
  // ⚠️ ET UNE JOURNÉE ENTIÈREMENT EN BAC NE PASSE PAS POUR AUTANT: `ownSlots`
  // est alors vide, `planTarget` vaut 0, et le chemin `common_pot_day` ci-dessus
  // a déjà rendu — `day.kcal` est `null` quand aucun contenant à un nom n'a
  // nourri. C'est la garde qui compte 24 bouches sur 36, et elle est intacte.
  const blocking = day.gaps.filter((g) => g !== "no_box" && g !== "common_pot");
  if (blocking.length > 0) {
    return {
      factor: 1,
      raw: null,
      reason: "day_incomplete",
      targetKcal: target.kcal,
      deliveredKcal: day.kcal,
      capGrams: null,
      capBit: "none",
      structureState,
      // Aucun repas dimensionné sur ce chemin: rien n'a pu être raboté.
      extrasFloored: false,
      lostLineKcal: 0,
      noteBoost: 0,
    };
  }
  // ⛔ LA CIBLE EST RÉDUITE À CE QUE LE PLAN PORTE POUR ELLE. Sans ça, un dîner
  // seul se voit demander une journée entière — 6,28 mesuré sur Christèle le
  // 2026-08-20, c'est-à-dire une assiette de deux kilos.
  // ══════════════════════════════════════════════════════════════════════
  // CE QUE LE PLAN DOIT FOURNIR — UNE SOMME, MOMENT PAR MOMENT (2026-09-01)
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⟳ ELLE REMPLACE `coverage × composedDishShare(...)`, deux ratios dont le
  // second était un SCALAIRE appliqué à la journée entière. Voir l'épitaphe de
  // `composedDishShare` plus haut pour ce que ça déplaçait, chiffré.
  //
  //     part(moment)  = poids[moment] / Σ poids[déclarés ∪ composés]
  //     cible(moment) = cible_jour × part(moment) − extras(moment)
  //     à fournir     = Σ cible(moment) sur les moments COMPOSÉS
  //
  // ⛔ ET LE PLAT NE PORTE PAS LE REPAS ENTIER — SUR LE MIDI ET LE SOIR. Le
  // plan ne compose que le plat principal (mesuré: 9 plats sur 9); le pain, le
  // fromage et le dessert existent quand même dans l'assiette. Faire porter au
  // plat l'énergie du repas entier, c'est servir 1,2 kg de poulet à quelqu'un
  // qui prend aussi un yaourt.
  //
  // ⛔ MAIS SUR LES AUTRES MOMENTS, IL LE PORTE. Le plan compose ce que la
  // personne a déclaré y prendre; en retrancher quoi que ce soit compterait
  // deux fois. C'est le défaut ② de l'épitaphe.
  // ⛔ `ownSlots` AU NUMÉRATEUR, `slots` AU DÉNOMINATEUR, ET LES DEUX SONT
  // JUSTES (2026-09-04). Ce qu'on demande au plan de fournir est la part de sa
  // journée qui tombe sur les moments dont on sait LIRE le livré — ceux où elle
  // est seule sur un couvercle. Mais la journée, elle, reste entière: un repas
  // pris dans un bac est un repas qu'elle a mangé, et l'exclure du dénominateur
  // ferait porter à ses deux autres moments l'énergie des trois.
  //
  // ⚠️ INTERVERTIR LES DEUX EST LA MUTATION LA PLUS CHÈRE DE CETTE FONCTION.
  // `covered = day.slots` remet le défaut d'avant (un côté du rapport baisse
  // seul); `whole` sur `ownSlots` gonfle la part de chaque moment restant et
  // sert le dîner d'une journée entière — 6,28 mesuré sur Christèle.
  // ⛔ LE REPLI DES TROIS REPAS QUAND RIEN N'EST DÉCLARÉ — LE MÊME QUE
  // `dayCoverageOf` (`declaredSlots.length > 0 ? … : HOUSE_DEFAULT_SLOTS`).
  //
  // ⚠️ SON ABSENCE ÉTAIT MASQUÉE PAR LE RETRAIT SUPPOSÉ, et le retrait de
  // celui-ci l'a révélée (2026-09-04). Sans ce repli, une bouche qui n'a rien
  // déclaré et dont le plan ne compose QUE le dîner voit sa journée entière
  // ramenée sur ce seul dîner: `whole` vaut alors le poids du dîner, la part
  // vaut 1, et on demande 3 900 kcal à une assiette. C'est le 6,28 de Christèle
  // par un autre chemin — celui qui nourrit trop.
  const shared = slotPlanTargets({
    targetKcal: target.kcal,
    coveredSlots: day.ownSlots,
    wholeSlots: [
      ...(mouth.declaredSlots.length > 0 ? mouth.declaredSlots : HOUSE_DEFAULT_SLOTS),
      ...day.slots,
    ],
    slotExtraKcal: mouth.slotExtraKcal,
    // ⛔ LE CHEMIN LEGACY NE VOIT PAS LE LÉGER, ET C'EST UNE DÉCISION DATÉE
    // (2026-09-07), pas un oubli. `anchorFactorFor` sert les foyers à PLUSIEURS
    // bouches, où « + repas léger » n'est pas encore collecté ni câblé — la
    // généralisation est un chantier à part. Passer `[]` rend ce calcul
    // octet-identique à celui d'avant le lot, ce qui est exactement la
    // propriété que la lane multi-bouches doit conserver.
    lightSlots: [],
    // Idem: le retrait du shaker par créneau appartient au chemin
    // `portion_v1`. Ici il vaut `null`, donc rien n'est retranché — comme avant.
    slotFixedKcal: null,
  });
  const extrasFloored = shared.floored;
  // ⚠️ LE REPLI `whole <= 0` EST CELUI DE `dayCoverageOf`, ET IL SIGNIFIE LA
  // MÊME CHOSE: aucun moment reconnu de part et d'autre ⇒ on ne réduit rien,
  // plutôt que de rendre zéro et de faire diviser par zéro l'appelant.
  const lostLine = Number.isFinite(lostLineKcal) && lostLineKcal > 0
    ? Math.round(lostLineKcal)
    : 0;
  // ⟳ 2026-09-06 — la note datée grossit la cible du jour AVANT les kcal perdus
  // par la ligne (qui se rajoutent tels quels) et avant les plafonds (qui
  // bornent le résultat comme n'importe quelle cible).
  const boost = Number.isFinite(noteBoost) && noteBoost > 0 ? noteBoost : 0;
  const effectiveTarget = (shared.total > 0 ? shared.total : target.kcal) * (1 + boost) + lostLine;
  const raw = effectiveTarget / day.kcal;
  // ── LE PLAFOND DE VRAISEMBLANCE, PAR REPAS ET PAR CORPS ─────────────────
  // Le facteur est UN par bouche et s'applique à toutes ses parts: c'est donc
  // sa PLUS GROSSE part qui décide du plafond. Borner le total du jour a été
  // mesuré faux (1 232 g dans une boîte, journée « plausible »).
  // ⟳ 2026-09-04: le plafond du plus gros repas se dérive de SA cible, pas du
  // kilo (voir `mealMassCapGrams`). `bySlot` ne porte que les moments couverts
  // par une boîte à cette bouche — c'est bien le plus gros de CES repas-là que
  // `day.maxMealGrams` mesure.
  // ⚠️ SANS BOÎTE À ELLE (`ownSlots` vide), la cible est celle du JOUR entier:
  // le plafond est alors le plus gros moment plausible de ce jour, jamais le
  // jour entier — c'est très exactement le 1,2 kg d'un dîner qui portait la
  // journée, et il reste mort.
  const wholeSlots = [
    ...new Set([
      ...(mouth.declaredSlots.length > 0 ? mouth.declaredSlots : HOUSE_DEFAULT_SLOTS),
      ...day.slots,
    ]),
  ];
  // ⛔ `[]` ICI AUSSI, ET IL FAUT LE DIRE: c'est le plafond de VRAISEMBLANCE du
  // chemin legacy. Lui donner les moments légers le ferait diverger de la
  // cible calculée six lignes plus haut, qui n'en a pas — deux poids pour un
  // seul repas, et c'est le plus petit qui gagnerait en silence.
  const wholeWeight = wholeSlots.reduce((n, slot) => n + slotWeight(slot, []), 0);
  const biggestWeight = Math.max(0, ...wholeSlots.map((slot) => slotWeight(slot, [])));
  // ⟳ 2026-09-06 (N3c) — LE PLAFOND VOIT LE CRAN AUSSI. `shared.bySlot` est la
  // répartition de la cible SANS la note ; borner le plus gros repas sur elle
  // reprenait d'une main ce que la note donnait de l'autre (Claire, mardi :
  // cible 790 avec le cran, boîte rabotée à 659 kcal par le plafond).
  const biggestMealKcal = (shared.bySlot.size > 0
    ? Math.max(0, ...shared.bySlot.values())
    : wholeWeight > 0
    ? effectiveTarget * (biggestWeight / wholeWeight)
    : 0) * (shared.bySlot.size > 0 ? 1 + boost : 1);
  // ⟳ ARBITRAGE 1 — à la densité MESURÉE de ce que la bouche a livré, bornée
  // par le physique ; 1,35 seulement quand les grammes ne se lisent pas.
  const cap = mealMassCapFor({
    mealKcal: biggestMealKcal,
    deliveredKcal: day.kcal,
    deliveredGrams: day.grams,
  });
  const capGrams = cap.grams;
  const physicalMax = capGrams !== null && day.maxMealGrams > 0
    ? capGrams / day.maxMealGrams
    : Infinity;
  const bounded = Math.min(raw, physicalMax);
  const { factor, clamped } = clampAnchor(bounded);
  const capBit: MealCapBit = bounded !== raw ? cap.source : clamped ? "factor_bound" : "none";
  return {
    factor,
    raw,
    reason: clamped || bounded !== raw ? "clamped" : "anchored",
    // ⚠️ LA CIBLE RENDUE EST CELLE QUI A SERVI AU CALCUL — donc réduite. Rendre
    // la cible de journée entière à côté d'un livré partiel ferait lire un
    // manque qui n'existe pas, et c'est `pot_demand` qui la relit.
    targetKcal: Math.round(effectiveTarget),
    deliveredKcal: day.kcal,
    capGrams: capGrams === null ? null : Math.round(capGrams),
    capBit,
    structureState,
    extrasFloored,
    lostLineKcal: lostLine,
    noteBoost: boost,
  };
}

/**
 * L'ANCRAGE DE TOUTE LA TABLE, bouche par bouche et jour par jour.
 *
 * La clé est `<memberId> <day>` — la même que `mouthDayEnergy`, pour qu'aucun
 * appelant n'ait à en fabriquer une seconde.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function householdAnchors(
  mouths: readonly AnchorMouth[],
  days: readonly MouthDayEnergy[],
  coachCounting: CountingStance,
  /** ⟳ 2026-09-06 — `<memberId> <day>` → kcal perdus par la ligne ce jour-là. */
  lostLineKcalByKey: ReadonlyMap<string, number> = new Map(),
  /** ⟳ 2026-09-06 — `<memberId> <day>` → fraction d'une note datée (`DATED_NOTE_BOOST`). */
  noteBoostByKey: ReadonlyMap<string, number> = new Map(),
): Map<string, AnchorFactor> {
  const byMouth = new Map(mouths.map((m) => [m.memberId, m]));
  const out = new Map<string, AnchorFactor>();
  for (const day of days) {
    const mouth = byMouth.get(day.memberId);
    if (!mouth) continue;
    const key = `${day.memberId} ${day.day ?? ""}`;
    out.set(key, anchorFactorFor(mouth, day, coachCounting, lostLineKcalByKey.get(key) ?? 0, noteBoostByKey.get(key) ?? 0));
  }
  return out;
}
