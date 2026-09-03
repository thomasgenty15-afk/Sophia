/**
 * FF-059 LOT 3 — LA CIBLE QUOTIDIENNE. Le niveau C, et il n'est pas du même
 * genre que A et B.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-059-le-chiffre-affiche.md`
 *
 * ── LA FRONTIÈRE QU'ON FRANCHIT ICI, EN CONNAISSANCE DE CAUSE ──────────────
 * A (« ce plat : 537 kcal ») et B (« la journée : 813 ») sont des FAITS SUR LA
 * NOURRITURE. Ce module produit un jugement SUR LA PERSONNE — c'est un
 * tracker, et `coachStartingNumbers` refuse depuis toujours de le montrer à un
 * élève, avec ces mots: *« un chiffre affiché à l'élève devient un objectif »*.
 *
 * On le franchit parce que la décision produit le demande, donc avec le plus de
 * gardes, donc en dernier. Ce que ça impose, et qui n'est pas négociable:
 *
 *   · UNE FOURCHETTE, JAMAIS UN POINT (voir ci-dessous);
 *   · AUCUN RESTE. Ce module ne soustrait rien. « Il te reste 680 kcal » est
 *     LA phrase d'un tracker, et elle n'existe nulle part dans ce chemin —
 *     ni ici, ni dans la fonction edge, ni à l'écran;
 *   · AUCUN VERDICT. Pas de « au-dessus », pas de « en dessous », pas de
 *     couleur, pas de barre. Le nombre du jour et la fourchette se posent
 *     côte à côte, et c'est l'élève qui lit;
 *   · ~~ELLE N'ENTRE PAS DANS LE GÉNÉRATEUR (R6). Un plan qui vise un chiffre
 *     est un régime chiffré, et ce n'est pas ce produit.~~
 *     ⛔ **RENVERSÉ LE 2026-08-18** — voir l'encadré ci-dessous. La phrase est
 *     laissée barrée plutôt que supprimée: elle a porté une vraie protection
 *     pendant douze jours, et un lecteur qui ne la trouve plus croira qu'elle
 *     n'a jamais existé.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ LE RENVERSEMENT DU 2026-08-18 — LA CIBLE ENTRE DANS LE GÉNÉRATEUR, ET
 *    ELLE N'Y CONTRAINT QUE LES GRAMMAGES.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **Autorité: décision produit de l'utilisateur, 2026-08-18.** Écrite dans
 * `scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md` §3, et développée
 * dans `docs/keel/CALORIE_REVERSAL.md` §7. Le lot qui l'exécute est L8
 * (`_shared/keel/household_portions.ts`, section « LA CIBLE DIMENSIONNE LES
 * GRAMMAGES »).
 *
 *     « La cible contraint les GRAMMAGES, pas le choix des plats. »
 *
 * ── CE QUI CHANGE, EXACTEMENT ─────────────────────────────────────────────
 * Les plats restent choisis librement — aucun aliment n'est retenu ou écarté
 * pour atteindre un nombre. Ce qui s'ajuste par personne est la QUANTITÉ PESÉE:
 * les boîtes du protocole de pesée (« Boîte Theo 560 g · Zoe 520 g · Lou
 * 280 g », mesuré sur un run réel le 2026-08-17). On pèse une fois à la session,
 * et le jour J on cite la boîte.
 *
 * ── LE RAISONNEMENT, ET IL A ÉTÉ CORRIGÉ UNE FOIS ─────────────────────────
 * Ce n'est PAS « parce qu'il n'y a qu'une cuisson »: c'est faux, le mode de
 * cuisson est un choix à trois valeurs (`COOKING_SHAPES`) exposé à l'écran
 * depuis le 2026-08-15. C'est parce que **le gramme est le bon niveau de
 * précision**: « une poignée » ne veut rien dire, et peser à chaque repas est
 * intenable.
 *
 * ── CE QUE LE RENVERSEMENT N'OUVRE PAS, ET C'EST LA MOITIÉ QUI COMPTE ─────
 *   · **CE module ne bouge pas d'un octet de comportement.** `maintenanceRange`
 *     ne connaît toujours aucun objectif, ne soustrait toujours rien, et rend
 *     toujours une fourchette. Le renversement porte sur ce que le GÉNÉRATEUR a
 *     le droit de faire, pas sur ce que cette fonction-ci calcule.
 *   · **La chaîne de gardes est renforcée, pas contournée.** Le dimensionnement
 *     passe par `canSizeFromTarget`, et depuis L8 la porte ② est évaluée **par
 *     bouche** (`keel_household_member_age`) — avant L8, une cible aurait
 *     dimensionné les grammages d'un enfant de douze ans parce que son parent
 *     est adulte.
 *   · **Aucun kcal n'entre dans le plan.** Ce qui entre est un FACTEUR sans
 *     unité; ce qui sort est un gramme d'ALIMENT. Les chiffres de corps et les
 *     kcal par bouche restent interdits en sortie (clause C5).
 *
 * ⚠️ SI TU LIS CECI DANS SIX MOIS EN TE DISANT « quelqu'un a oublié de refermer
 * la vanne »: non. C'est daté, c'est signé, et la protection d'origine a été
 * déplacée dans `energy_gate.ts` plutôt que retirée. Ne « répare » pas.
 *
 * ── POURQUOI UNE FOURCHETTE PAR KG, ET PAS MIFFLIN-ST JEOR ─────────────────
 * `estimatedMaintenanceKcal` existe déjà dans `meal_envelope.ts` et rendrait un
 * POINT. Il le rend en multipliant un métabolisme de base par `ACTIVITY_FACTOR
 * = 1.5` — une constante qu'aucune donnée de cet élève ne justifie, parce que
 * **rien ne collecte le niveau d'activité**. C'est le rabbit hole nommé par la
 * fiche: « le multiplier par une valeur devinée produit une cible fausse avec
 * l'aplomb d'un tableau ».
 *
 * 28 à 33 kcal/kg est le raccourci qu'un coach fait de tête, et la fourchette
 * EST l'honnêteté sur l'activité: elle couvre du sédentaire à l'actif modéré au
 * lieu de choisir pour lui. Deux conséquences qu'on assume:
 *   · elle est plus large qu'une cible d'app de comptage — c'est le point;
 *   · une fourchette se lit moins comme un objectif qu'un point. Personne ne
 *     « rate » un intervalle de 400 kcal, et c'est exactement ce qu'on veut.
 *
 * ⚠️ MÊMES CONSTANTES QUE `coachStartingNumbers` (`frontend/src/keel/lib/weekInFood.ts`),
 * qui sert la même fourchette au COACH depuis toujours. Deux copies d'un même
 * nombre divergent, et c'est celle qu'on regarde le moins qui garde l'ancienne:
 * `energy_target_test.ts` LIT le fichier du front et refuse le désaccord.
 *
 * ── ET DEPUIS LE 2026-08-18, LE PRODUIT DEMANDE L'ACTIVITÉ ────────────────
 * Le paragraphe ci-dessus disait « rien ne collecte le niveau d'activité »
 * comme la RAISON de la fourchette large. Ce n'est plus vrai: quatre crans
 * lisibles sont posés à l'inscription (`ACTIVITY_LEVELS`), et le trou nommé
 * par la fiche est fermé.
 *
 * ⚠️ CETTE PHRASE A ÉTÉ FAUSSE PENDANT UNE DEMI-JOURNÉE, ET LE DIRE EST LA
 * MOITIÉ UTILE DU PARAGRAPHE. Le matin du 2026-08-18, les colonnes, le CHECK,
 * les facteurs et cette fourchette-ci existaient — et RIEN N'ÉCRIVAIT LA
 * COLONNE. `activity_level` n'apparaissait pas une seule fois dans
 * `frontend/src`. Un lecteur sans écrivain rend `null` à tout le monde, et
 * `null` est ici exactement le comportement d'avant: le lot ressemblait donc,
 * de bout en bout, à un lot qui marche. Ce qui rend la phrase vraie est le
 * lot L0 de l'après-midi, et il tient en trois endroits nommables:
 *
 *   · `frontend/src/keel/api/onboarding.ts` — `own_activity_level` et
 *     `member_activity_level` dans `FUNNEL_QUESTIONS` (étape « people », à
 *     côté de taille/poids/sexe), et les deux écritures `saveOwnProfile` /
 *     `saveMouthBody`;
 *   · `frontend/src/keel/pages/SetupPage.tsx` — `ActivityTiles`, quatre
 *     tuiles et jamais un nombre, montées sur ma fiche et sur celle de chaque
 *     autre bouche;
 *   · `supabase/migrations/20260818160000_the_funnel_writes_the_activity_level.sql`
 *     — `keel_household_set_member_body` gagne `p_activity_level` (la bouche
 *     sans compte n'a pas d'autre porte), et `keel_household_member_bodies`
 *     le rend pour que l'écran puisse montrer la réponse déjà donnée.
 *
 * ⚠️ ET CE QUI RESTE VRAI SI TU LIS CECI PLUS TARD: le cran n'est pas EXIGÉ.
 * `canGenerate` ne refuse aucune composition pour son absence, parce que
 * « personne n'est obligé de répondre » (`tokens.ts`) et qu'un cinquième jeton
 * d'ignorance est refusé. La majorité des lignes de la base porteront `null`
 * longtemps, et c'est le cas nominal — pas une migration en retard.
 *
 * Ce qui change, et ce qui ne change PAS:
 *
 *   · Ce qui ne change pas — le chemin SANS réponse. `activityLevel: null`
 *     rend exactement 28-33, au caractère près, et c'est le cas de toute la
 *     base existante et du coach, dont l'écran ne connaît pas ce champ. Le
 *     lien avec `weekInFood.ts` porte sur CES deux nombres-là, et il tient.
 *
 *   · Ce qui change — quand quelqu'un a répondu, la fourchette se resserre ET
 *     se déplace (voir `ACTIVITY_KCAL_PER_KG`). Elle DÉBORDE 28-33 aux deux
 *     bouts, et c'est le point: 28 kcal/kg reste trop haut pour qui est assis
 *     huit heures, et 33 trop bas pour qui s'entraîne quatre fois par semaine.
 *     La fourchette d'origine n'était pas la vérité; elle était l'aveu qu'on
 *     ne savait pas.
 *
 * ⚠️ CE QUI RESTE INTERDIT ICI, ET QUE L'ACTIVITÉ NE ROUVRE PAS. Aucune
 * dynamique n'entre dans ce module: la fourchette est ce que ce corps DÉPENSE,
 * pas ce qu'il « devrait » manger pour changer. Le test de ce module lit la
 * source et refuse les jetons de dynamique; il refuse aussi la constante
 * DEVINÉE de `meal_envelope.ts`, et il continue de la refuser — c'est
 * précisément elle que ce lot remplace.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import type { ActivityLevel } from "./tokens.ts";
/**
 * ⚠️ IMPORT DE TYPE SEUL. `weight_pace.ts` est le propriétaire de la règle des
 * trois directions (`scaleDirectionOf`, où `maintenance` rend `null`), et une
 * seconde table de cette règle ici serait celle qu'on oublie d'ajuster. Un
 * `import type` est effacé à la compilation: ce module reste pur et sans arête.
 */
import type { ScaleDirection } from "./weight_pace.ts";

/**
 * LA BASE, et elle nomme ce qu'elle SAIT — le poids, et rien d'autre.
 *
 * Le vocabulaire est délibérément différent de `plan_quantities`: celui-là dit
 * « on a calculé la nourriture », celui-ci dit « on a estimé la personne ». Les
 * confondre ferait passer une estimation pour un calcul, ce qui est très
 * exactement l'erreur que `CALORIE_REVERSAL` existe pour empêcher.
 */
export const ENERGY_TARGET_BASIS = "weight_range";

/**
 * ⟳ LOT 4 (2026-09-01) — LA BASE DE LA FOURCHETTE QUI A SUIVI LA DIRECTION.
 *
 * Un second jeton, et pas un drapeau à côté du premier: R3 de la fiche dit
 * qu'un chiffre vit dans un champ qui PORTE SA BASE. « 1 900–2 300 pour ton
 * poids » et « 1 900–2 300 parce que tu vises une perte » ne sont pas le même
 * nombre même quand ils s'écrivent pareil, et l'écran doit pouvoir le dire.
 */
export const ENERGY_TARGET_BASIS_DIRECTED = "weight_range_with_direction";

export const ENERGY_TARGET_BASES = Object.freeze(
  [ENERGY_TARGET_BASIS, ENERGY_TARGET_BASIS_DIRECTED] as const,
);
export type EnergyTargetBasis = (typeof ENERGY_TARGET_BASES)[number];

/**
 * kcal par kg de poids corporel, QUAND ON NE SAIT PAS. Le bas couvre le
 * sédentaire, le haut l'actif — c'est-à-dire que la fourchette couvre
 * l'ignorance elle-même.
 */
export const MAINTENANCE_KCAL_PER_KG_LOW = 28;
export const MAINTENANCE_KCAL_PER_KG_HIGH = 33;

/**
 * kcal/kg PAR CRAN D'ACTIVITÉ — la fourchette de quelqu'un qui a répondu.
 *
 * ── D'OÙ VIENNENT CES NOMBRES ─────────────────────────────────────────────
 * Du même raccourci de coach que 28-33, appliqué cran par cran plutôt qu'à
 * tout le monde. Les quatre bandes se recouvrent d'un point à chaque
 * frontière, et ce recouvrement est voulu: un cran est une réponse à une
 * question, pas une mesure, et deux personnes de part et d'autre d'une
 * frontière ne dépensent pas deux choses disjointes.
 *
 *   sedentary    26-29   assis toute la journée
 *   on_feet      28-31   debout, en mouvement — le cran qui contient 28-33
 *   trains_some  30-33   2 à 3 séances
 *   trains_hard  32-36   4 séances et plus, ou métier physique
 *
 * ⚠️ LA LARGEUR NE DESCEND PAS SOUS TROIS POINTS, ET C'EST UNE DÉCISION. On
 * pourrait resserrer davantage maintenant qu'on sait quelque chose. On ne le
 * fait pas: « une fourchette se lit moins comme un objectif qu'un point.
 * Personne ne rate un intervalle » — la phrase de l'en-tête vaut toujours, et
 * une fourchette de 100 kcal se lirait comme une cible. On a gagné en
 * JUSTESSE, on n'a pas décidé de gagner en précision affichée.
 *
 * ⚠️ ELLES DÉBORDENT 28-33 AUX DEUX BOUTS, ET C'EST LE POINT. Voir l'en-tête.
 * Le lien avec `weekInFood.ts` porte sur la fourchette de l'ignorance, pas sur
 * celles-ci — l'écran du coach ne collecte pas ce champ.
 */
export const ACTIVITY_KCAL_PER_KG: Readonly<
  Record<ActivityLevel, { low: number; high: number }>
> = Object.freeze({
  sedentary: { low: 26, high: 29 },
  on_feet: { low: 28, high: 31 },
  trains_some: { low: 30, high: 33 },
  trains_hard: { low: 32, high: 36 },
});

/**
 * Les bornes de plausibilité, les mêmes que le point hebdo et que
 * `coachStartingNumbers`. Hors bornes, pas de nombres: un 500 kg d'erreur de
 * frappe produirait une cible absurde présentée avec l'aplomb d'un tableau.
 *
 * ⚠️ « Les mêmes que le point hebdo » était une PROMESSE, pas un fait: quatre
 * modules de `_shared/keel/` déclaraient ces deux nombres et l'un d'eux portait
 * déjà 350. Depuis le lot `X1′` (2026-08-22) c'est un fait — ils sont IMPORTÉS
 * de `weight_bounds.ts`, seule déclaration du back, et l'alias `TARGET_` reste
 * le nom public de ce module.
 */
import {
  WEIGHT_KG_MAX as TARGET_WEIGHT_KG_MAX,
  WEIGHT_KG_MIN as TARGET_WEIGHT_KG_MIN,
} from "./weight_bounds.ts";
export { TARGET_WEIGHT_KG_MAX, TARGET_WEIGHT_KG_MIN };

/**
 * POURQUOI IL N'Y A PAS DE CIBLE. Nommé, jamais un `null` nu — les deux motifs
 * ne se disent pas pareil et ne se réparent pas au même endroit.
 */
export const TARGET_GAPS = Object.freeze(
  [
    /** Aucune pesée exploitable. L'élève peut en saisir une. */
    "no_weight",
    /** Une pesée hors bornes. C'est une faute de frappe, pas une personne. */
    "implausible_weight",
  ] as const,
);
export type TargetGap = (typeof TARGET_GAPS)[number];

/**
 * ⟳ LOT 4 — POURQUOI LA DIRECTION N'A PAS ÉTÉ APPLIQUÉE À UNE FOURCHETTE QUI
 * EXISTE POURTANT. Nommé, jamais un silence.
 *
 * ⚠️ CE N'EST PAS `TargetGap`, ET LES CONFONDRE SERAIT UN CONTRESENS. Un
 * `TargetGap` dit « il n'y a AUCUNE fourchette » (pas de pesée, pesée absurde).
 * Ceux-ci disent « il y en a une, c'est la maintenance, et voici pourquoi elle
 * n'a pas bougé ». L'écran ne les rend pas pareil: le premier demande une
 * réparation à la personne, le second ne demande rien du tout.
 */
export const TARGET_DIRECTION_GAPS = Object.freeze(
  [
    /**
     * Le moteur n'exécute aucun écart: pas de rythme, pas de corps, ou un écart
     * si petit qu'il disparaît à l'arrondi. La cible EST l'entretien, et c'est
     * le cas de la majorité de la base.
     */
    "no_pace",
    /**
     * La fourchette décalée passerait sous le plancher d'énergie de ce corps.
     * On rend la maintenance plutôt qu'un nombre de famine — voir `directedRange`.
     */
    "below_energy_floor",
    /**
     * Une condition déclarée annule tout déficit en amont (`pregnancy`,
     * `breastfeeding` — `condition_energy_gate.ts`). Le bon chiffre de déficit
     * y est ZÉRO, pas « un déficit plus petit ».
     */
    "condition_cancelled",
  ] as const,
);
export type TargetDirectionGap = (typeof TARGET_DIRECTION_GAPS)[number];

export interface EnergyTarget {
  /** `null` avec un `gap` nommé, ou la fourchette. JAMAIS un point. */
  range: { low: number; high: number } | null;
  basis: EnergyTargetBasis;
  gap: TargetGap | null;
  /**
   * LE POIDS QUI A SERVI, ET SA DATE.
   *
   * ⚠️ La date n'est pas décorative. Une cible posée sur une pesée de six
   * semaines est une cible sur quelqu'un d'autre, et l'élève est le seul à
   * pouvoir le savoir. On la rend pour qu'il le puisse — et pas pour qu'un
   * écran calcule une fraîcheur, ce qui serait un verdict de plus.
   */
  weightKg: number | null;
  weightWeekStart: string | null;
  /**
   * ⟳ LOT 4 — LA DIRECTION QUE CETTE FOURCHETTE A SUIVIE. `null` = c'est une
   * maintenance, et c'est ce que `maintenanceRange` rend TOUJOURS.
   *
   * ⚠️ IL PART AVEC `basis`, JAMAIS SEUL. `basis === "weight_range"` et une
   * direction non nulle serait une fourchette qui prétend deux choses
   * contraires; `directedRange` les écrit ensemble ou pas du tout.
   */
  direction: ScaleDirection | null;
  /**
   * ⟳ LOT 4 — POURQUOI ELLE NE L'A PAS SUIVIE, alors que la personne en a une.
   * `null` quand il n'y a rien à expliquer: soit elle l'a suivie, soit la
   * personne n'a aucune direction.
   */
  directionGap: TargetDirectionGap | null;
}

function noTarget(gap: TargetGap): EnergyTarget {
  return {
    range: null,
    basis: ENERGY_TARGET_BASIS,
    gap,
    weightKg: null,
    weightWeekStart: null,
    // Une fourchette qui n'existe pas n'a suivi aucune direction, et il n'y a
    // rien à expliquer de plus que `gap` — qui dit déjà tout.
    direction: null,
    directionGap: null,
  };
}

/**
 * La fourchette de maintenance, ou le motif nommé de son absence.
 *
 * ── ARRONDI AUX 50 kcal, ET C'EST UN ARBITRAGE D'AFFICHAGE ─────────────────
 * « 2 100 – 2 500 » se lit comme un ordre de grandeur; « 2 086 – 2 459 » se lit
 * comme une mesure, et invite à viser le chiffre exact. Même arrondi que
 * `coachStartingNumbers`, qui l'a tranché en premier.
 *
 * ⚠️ AUCUN OBJECTIF N'ENTRE ICI. Ni `fat_loss`, ni `muscle_gain`. Cette
 * fourchette est la MAINTENANCE — ce que ce corps dépense — et pas ce qu'il
 * « devrait » manger pour changer.
 *
 * ⟳ **ET CETTE PHRASE RESTE VRAIE APRÈS LE LOT 4 (2026-09-01)**, parce qu'elle
 * porte sur CETTE fonction. La direction s'applique dans `directedRange`, qui
 * prend le résultat d'ici en entrée et ne le recalcule pas: il n'existe donc
 * toujours qu'un seul endroit où « ce que ce corps dépense » se calcule, et un
 * seul autre où un écart s'y ajoute. Le paragraphe qui suivait — « dériver un
 * déficit reviendrait à prescrire un régime chiffré à quelqu'un que personne
 * n'a examiné » — a été écrit quand l'écart aurait dû être INVENTÉ ici. Il ne
 * l'est plus: `directedRange` reçoit l'écart que le moteur EXÉCUTE déjà sur les
 * grammages de cette personne, avec le plafond de 500 kcal/j de `meal_envelope`
 * et le plancher d'énergie déjà appliqués dessus. On n'a pas ouvert un calcul
 * neuf; on a cessé d'afficher un autre nombre que celui qu'on sert.
 */
export function maintenanceRange(args: {
  weightKg: number | null;
  /** La semaine de la pesée, `YYYY-MM-DD`. `null` = date inconnue. */
  weightWeekStart: string | null;
  /**
   * ⚠️ REQUIS, JAMAIS OPTIONNEL. « Paramètre de garde optionnel = garde
   * désarmée » est une cicatrice mesurée de ce dépôt; ici l'enjeu est le
   * symétrique — un champ facultatif aurait laissé les appelants continuer de
   * servir la fourchette de l'ignorance à quelqu'un qui a répondu, sans
   * qu'aucun compilateur ne les recense.
   *
   * `null` veut dire « personne n'a répondu » et rend 28-33.
   */
  activityLevel: ActivityLevel | null;
}): EnergyTarget {
  const w = Number(args.weightKg);
  if (args.weightKg === null || !Number.isFinite(w) || w <= 0) {
    return noTarget("no_weight");
  }
  if (w < TARGET_WEIGHT_KG_MIN || w > TARGET_WEIGHT_KG_MAX) {
    return noTarget("implausible_weight");
  }
  const perKg = args.activityLevel === null
    ? {
      low: MAINTENANCE_KCAL_PER_KG_LOW,
      high: MAINTENANCE_KCAL_PER_KG_HIGH,
    }
    : ACTIVITY_KCAL_PER_KG[args.activityLevel];
  const round50 = (n: number) => Math.round(n / 50) * 50;
  return {
    range: {
      low: round50(perKg.low * w),
      high: round50(perKg.high * w),
    },
    basis: ENERGY_TARGET_BASIS,
    gap: null,
    weightKg: w,
    weightWeekStart: args.weightWeekStart,
    // ⚠️ TOUJOURS `null` ICI, ET C'EST LE CONTRAT DE CETTE FONCTION. Elle rend
    // une MAINTENANCE, et le paragraphe ci-dessus reste vrai au mot près:
    // aucun objectif n'entre. La direction s'applique APRÈS, dans
    // `directedRange`, et sur son résultat à elle.
    direction: null,
    directionGap: null,
  };
}

// ---------------------------------------------------------------------------
// ⟳ LOT 4 (2026-09-01) — LA FOURCHETTE SUIT LA DIRECTION
// ---------------------------------------------------------------------------

/**
 * LA FOURCHETTE DE QUELQU'UN QUI VISE QUELQUE CHOSE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QUE CETTE FONCTION FERME, ET IL ÉTAIT MESURABLE À L'ÉCRAN
 * ══════════════════════════════════════════════════════════════════════════
 * Run réel du 2026-09-01, compte `meals-demo@test.dev`, objectif `fat_loss`,
 * les cinq portes ouvertes à la main:
 *
 *     target = {"low": 2600, "high": 3050, "basis": "weight_range"}
 *
 * 2 600–3 050 est l'ENTRETIEN de ce corps. La personne vise une perte, et le
 * produit lui posait, sous le total de sa journée, la fourchette de quelqu'un
 * qui ne vise rien — en la laissant faire la soustraction elle-même. Pendant ce
 * temps le moteur, lui, dimensionnait déjà ses grammages sur une cible EN
 * DÉFICIT (`mouthTargetKcal`, `mouth_anchor.ts`). Deux nombres, sur le même
 * écran, en désaccord sur ce que cette personne cherche.
 *
 * ── ⛔ POURQUOI ON DÉCALE LA FOURCHETTE PLUTÔT QUE DE MONTRER LA CIBLE ─────
 * `mouthTargetKcal` rend un POINT, et il le rend depuis `estimatedMaintenanceFor`
 * — Mifflin-St Jeor × facteur d'activité. Ce module refuse ce chemin depuis le
 * premier jour, dans son en-tête, et le refuse toujours: un point se rate, une
 * fourchette non; et la base de ce module est le POIDS, pas une équation dont
 * `energy_target_test.ts` interdit nommément la constante.
 *
 * Ce qu'on emprunte au moteur n'est donc PAS son entretien: c'est son ÉCART.
 * `executedPaceFor().dailyDeltaKcal` est essentiellement le rythme choisi
 * converti en kcal/jour (`kgPerWeek × 7700 / 7`), raboté par les bornes de ce
 * corps — plafond de déficit, plancher d'énergie, bande de surplus, fraction du
 * mineur. En décalant, on hérite de ces quatre protections sans en réécrire une
 * seule, et le chiffre affiché bouge exactement de ce que la casserole bouge.
 *
 * ── LA LARGEUR NE CHANGE PAS, ET C'EST UNE DÉCISION ───────────────────────
 * Les deux bornes se déplacent du MÊME nombre. Une fourchette qui se
 * resserrerait en gagnant une direction se lirait comme une cible qu'on vient
 * de préciser — et « personne ne rate un intervalle de 400 kcal » est la phrase
 * qui tient tout ce module. L'écart est arrondi aux 50 AVANT le décalage, pas
 * après: arrondir chaque borne séparément ferait respirer la largeur de ±50 au
 * gré des rythmes.
 *
 * ── ⛔ ET SI LE DÉCALAGE PASSE SOUS LE PLANCHER, ON NE RABOTE PAS ─────────
 * On rend la MAINTENANCE, avec `below_energy_floor`. Raboter la borne basse au
 * plancher produirait deux torts à la fois: une fourchette rétrécie (qui se lit
 * comme une cible) et un nombre que le moteur n'exécute pas. La maintenance,
 * elle, reste VRAIE — c'est ce que ce corps dépense — et elle n'est un nombre
 * de famine pour personne.
 *
 * ⚠️ Le plancher du moteur est calculé sur l'entretien de Mifflin; celui-ci est
 * calculé sur la fourchette au poids. Les deux ne mordent donc pas au même
 * moment, et c'est voulu: ce sont deux ceintures sur deux estimations, et deux
 * ceintures ne divergent pas — elles se doublent.
 *
 * ── TOUTES LES ENTRÉES SONT REQUISES ──────────────────────────────────────
 * Y compris `cancelled`, qui vaut `null` dans le cas nominal. « Un paramètre de
 * garde optionnel est une garde désarmée »: un `cancelled?` aurait laissé le
 * garde de grossesse être branché nulle part, et un déficit se serait affiché à
 * une femme enceinte pendant que le moteur, lui, le lui retirait.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function directedRange(args: {
  /** Ce que `maintenanceRange` a rendu. REQUIS: c'est la seule porte d'entrée. */
  maintenance: EnergyTarget;
  /**
   * La direction de la balance, telle que `scaleDirectionOf` l'a réduite.
   * `null` = `maintenance`, ou aucun objectif: la fourchette ne bouge pas, et
   * SANS motif — il n'y a rien à expliquer à qui ne vise rien.
   */
  direction: ScaleDirection | null;
  /**
   * `executedPaceFor().dailyDeltaKcal` — l'écart que le moteur EXÉCUTE
   * vraiment, toujours ≥ 0. Jamais le rythme choisi: le curseur d'une prise
   * monte plus haut que ce que la casserole livre (cicatrice L8).
   */
  dailyDeltaKcal: number;
  /** `energyFloorFor(gender)` — le plancher d'énergie de ce corps. */
  energyFloorKcal: number;
  /**
   * Un motif d'annulation décidé EN AMONT, ou `null`. Aujourd'hui une seule
   * valeur y arrive: `condition_cancelled`.
   */
  cancelled: TargetDirectionGap | null;
}): EnergyTarget {
  const base = args.maintenance;
  const keep = (directionGap: TargetDirectionGap | null): EnergyTarget => ({
    ...base,
    // ⚠️ LA BASE NE BOUGE PAS NON PLUS. Une fourchette qui n'a pas suivi la
    // direction est une maintenance, et elle doit se dire comme telle à
    // l'écran — sinon la phrase « pour ta perte de poids » se poserait sur des
    // nombres d'entretien, ce qui est le défaut d'origine avec l'étiquette en
    // plus.
    basis: ENERGY_TARGET_BASIS,
    direction: null,
    directionGap,
  });

  // AUCUNE FOURCHETTE: `gap` dit déjà tout, et une direction posée sur du vide
  // n'ajouterait rien à lire.
  if (base.range === null) return keep(null);
  // AUCUNE DIRECTION: rien à expliquer. C'est le cas de `maintenance` et de
  // toute personne sans objectif lisible.
  if (args.direction === null) return keep(null);
  // UNE CONDITION A ANNULÉ L'ÉCART EN AMONT. Évalué AVANT le rythme: une femme
  // enceinte dont le rythme est nul doit lire l'annulation, pas `no_pace`.
  if (args.cancelled !== null) return keep(args.cancelled);

  const delta = Number(args.dailyDeltaKcal);
  if (!Number.isFinite(delta) || delta <= 0) return keep("no_pace");
  // ARRONDI AVANT LE DÉCALAGE — voir l'en-tête. Un écart sous 25 kcal/jour
  // disparaît, et c'est juste: il ne déplace pas une fourchette large de 400.
  const shift = Math.round(delta / 50) * 50;
  if (shift <= 0) return keep("no_pace");

  const signed = args.direction === "up" ? shift : -shift;
  const low = base.range.low + signed;
  const high = base.range.high + signed;

  // LE PLANCHER, ET IL NE RABOTE RIEN — il refuse.
  const floor = Number(args.energyFloorKcal);
  if (!Number.isFinite(floor) || floor <= 0) return keep("no_pace");
  if (args.direction === "down" && low < floor) return keep("below_energy_floor");

  return {
    ...base,
    range: { low, high },
    basis: ENERGY_TARGET_BASIS_DIRECTED,
    direction: args.direction,
    directionGap: null,
  };
}
