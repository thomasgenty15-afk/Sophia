/**
 * LA FUSION — reprendre dans la cuisine commune quelqu'un qui mangeait à part.
 * PUR.
 *
 * Autorité produit: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md,
 * arbitrages D6 (l'échelle), D15 (l'intersection), D16 (le pivot). Lot L4.
 *
 * ── CE QUE LA FUSION EST, ET CE QU'ELLE N'EST PAS ────────────────────────
 * L3 a livré le REPLI, et il marche seul: un secondaire qui a validé un plan
 * personnel recouvrant la fenêtre est RETIRÉ du plan du foyer. Il mange le
 * sien, le maître cuisine sans lui, et personne ne fusionne.
 *
 * L4 ajoute le geste qui rattrape ça. Le maître — LUI, jamais un automatisme
 * (D10) — décide de reprendre cette personne à sa table. Le résultat est un
 * NOUVEAU plan du foyer.
 *
 * ⚠️ CE QUI N'EST JAMAIS ÉCRASÉ: le plan PERSONNEL du secondaire. La fusion
 * écrit une ligne neuve (`plan_kind = 'household'`, sur le compte du maître);
 * la ligne personnelle du secondaire reste intacte, à l'octet près. C'est le
 * repli si le maître défusionne ensuite (D8, L5) — et une défusion qui devrait
 * REGÉNÉRER le plan qu'elle prétend restaurer ne serait pas une défusion.
 *
 * ── CE MODULE DÉCIDE TROIS CHOSES, ET SEULEMENT TROIS ────────────────────
 *   1. SUR QUELS JOURS (D15 · D16) — `resolveMergeWindow`.
 *   2. QUELLE FORME DE CUISINE (D6) — `mergeLadder`.
 *   3. CE QU'ON EN ARCHIVE — `mergedFromEntry`, et le bloc `merge` de
 *      `generated_from`.
 *
 * Il ne lit aucune base, n'appelle aucun modèle, et ne REFUSE rien: il rend un
 * motif nommé, et l'appelant choisit son statut HTTP. Même coupure que
 * `household_hand.ts` et `household_presence.ts` — la moitié qui décide est
 * testable sans base, donc mutable.
 *
 * ── POURQUOI PAS UNE FONCTION EDGE À ELLE ────────────────────────────────
 * Parce qu'elle exige EXACTEMENT les mêmes préconditions que la composition:
 * le gel 402 (L1), la résolution du foyer, l'union des allergies, le plafond de
 * bouches, la version de prompt. Une seconde fonction dupliquerait cinq gardes,
 * et ce dépôt a déjà payé plusieurs fois « deux définitions qui divergent au
 * premier ajustement ». La fusion vit donc dans `generate-household-meal-v1`,
 * comme une OPÉRATION à part (`operation: "merge"`), et les cinq gardes sont
 * franchies une seule fois, par le même chemin.
 */

import { addDays, firstBlockingPlan, planEndsOn } from "./meal_plan_window.ts";
import {
  asksForASecondDish,
  type CookingShape,
  SERVING_AXES,
  type ServingAxisDemands,
  type ServingDemand,
} from "./household_portions.ts";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Une fenêtre de plan, telle que la porte `student_generated_meals`. */
export interface PlanSpan {
  startsOn: string;
  durationDays: number;
}

// ---------------------------------------------------------------------------
// LES MOTIFS DE REFUS — nommés, et décidables SANS le modèle
//
// ⚠️ C'EST LA MOITIÉ QUI COÛTE. L1 a mesuré 28,6 s et 225 s de modèle brûlées
// sur des refus qui ne dépendaient que du corps de la requête. Chacun des
// motifs ci-dessous se tranche sur deux fenêtres et une date: aucun n'a de
// raison d'attendre une génération, et un test de position le garde.
// ---------------------------------------------------------------------------

/**
 * Une des deux fenêtres n'est pas une fenêtre.
 *
 * ⚠️ STRUCTURELLEMENT INATTEIGNABLE DEPUIS UNE BASE VALIDE, ET C'EST ÉCRIT ICI
 * POUR QU'ON NE LE REDÉCOUVRE PAS. Les deux fenêtres viennent de
 * `student_generated_meals`, où `starts_on` est `NOT NULL` et où
 * `student_generated_meals_duration_days_check` impose `duration_days between 1
 * and 7`: `spanUsable` ne peut donc pas rendre `false` sur une ligne que la
 * base a acceptée. La troisième entrée, `today`, est le `todayDate` déjà résolu
 * par l'appelant, qui refuse en `local_day_unresolved` bien avant d'arriver ici.
 *
 * C'EST UNE BRANCHE DÉFENSIVE, PAS UN REFUS QU'UN APPELANT PEUT RECEVOIR. Elle
 * RESTE: le jour où ce module est appelé sur une fenêtre venue d'ailleurs (un
 * écran, une proposition de L5, un import), c'est elle qui empêche une
 * intersection calculée sur `NaN`. Un test la garde par la fonction pure, pas
 * par un scénario HTTP qui n'existe pas.
 */
export const MERGE_WINDOW_UNREADABLE = "merge_window_unreadable";
/** Les deux plans ne partagent aucun jour: il n'y a rien à fusionner (D15). */
export const MERGE_WINDOWS_DISJOINT = "merge_windows_disjoint";
/** Tout ce qu'ils partagent est déjà passé: on ne refusionne pas hier (D16). */
export const MERGE_WINDOW_ALL_PAST = "merge_window_all_past";

export type MergeWindowRefusal =
  | typeof MERGE_WINDOW_UNREADABLE
  | typeof MERGE_WINDOWS_DISJOINT
  | typeof MERGE_WINDOW_ALL_PAST;

export interface MergeWindow {
  /** L'intersection BRUTE des deux fenêtres, avant le pivot (D15). */
  intersection: PlanSpan;
  /** Le premier jour non consommé, dans le fuseau de l'élève (D16). */
  pivot: string;
  /**
   * LES JOURS DE **SON** PLAN QUI REVIENNENT: l'intersection, coupée au pivot.
   *
   * ⚠️ CE N'EST PAS LA FENÊTRE ÉCRITE. Elle l'était jusqu'au 2026-08-12, et
   * c'est ce qui a produit le P0 de la QA: écrire CETTE fenêtre-là quand elle
   * est strictement intérieure au plan du foyer laisse la queue du foyer sans
   * aucun plan, et `write_student_meal_plan` la refuse pour cette raison
   * exacte. Ce qui part à la base est `recomposed`, juste en dessous.
   *
   * C'est ce nombre-ci que la PROPOSITION annonce (« je peux fusionner les 3
   * restants ») et c'est lui qui choisit la paire dans `bestMergePair`: il
   * parle des jours de la personne, et c'est la question que le maître se pose.
   */
  window: PlanSpan;
  /**
   * CE QUE LA FUSION RECOMPOSE VRAIMENT, ET CE QUI PART À `write_student_meal_plan`.
   *
   * ── LE DÉFAUT QU'ELLE FERME (QA du 2026-08-12) ──────────────────────────
   * Le foyer couvre lundi→dimanche, le secondaire mercredi→vendredi. La fenêtre
   * partagée est mercredi→vendredi, et l'écrire coûtait:
   *
   *     POST merge → 409 plan_not_written / plan_overlaps_existing, APRÈS
   *     16,1 s de modèle, 7 335 jetons, et UNE unité du plafond de L7.
   *
   * La base refuse exprès (correctif du 2026-08-11): un plan intérieur à un
   * plan vivant tronquait l'ancien à sa tête et laissait sa QUEUE sans aucune
   * couverture. Et l'autre moitié du même défaut ne refusait pas, elle: quand
   * la fusion commençait LE MÊME JOUR que le plan du foyer, `replace_current`
   * retirait la semaine entière pour la remplacer par trois jours — samedi et
   * dimanche disparaissaient EN SILENCE.
   *
   * ── LA RÈGLE, EN UNE PHRASE ─────────────────────────────────────────────
   * UNE FUSION NE RÉTRÉCIT JAMAIS LA COUVERTURE DU FOYER. Elle recompose la
   * QUEUE du plan du foyer — du pivot jusqu'au dernier jour de ce plan — avec
   * la personne à table. Les jours d'AVANT le pivot restent couverts par la
   * ligne d'avant, tronquée par la RPC: c'est D15 (« hors intersection, chacun
   * garde ce qu'il avait »), et elle est intacte pour la TÊTE.
   *
   * ── POURQUOI ÇA NE PEUT PAS RÉGRESSER UNE FUSION QUI MARCHE ─────────────
   * Quatre formes, et deux seulement changent:
   *
   *   · les deux fenêtres finissent le même jour  ⇒ `recomposed` = `window`,
   *     rien ne bouge (c'est le cas nominal: deux plans « jusqu'à dimanche »);
   *   · son plan déborde par la fin                ⇒ idem, l'intersection
   *     s'arrête déjà à la fin du plan du foyer;
   *   · son plan finit AVANT, fusion à partir du même jour ⇒ aujourd'hui le
   *     foyer perd sa queue en silence; désormais il la garde;
   *   · son plan finit AVANT, fusion plus tard     ⇒ aujourd'hui 409 payé au
   *     prix d'une génération; désormais ça s'écrit.
   *
   * ── CE QUE ÇA CHANGE POUR LES JOURS AJOUTÉS ────────────────────────────
   * Rien sur QUI est à table. La prise de main de L3 est à recouvrement TOTAL
   * (`planCoversWindow`): un plan personnel qui ne couvre pas toute la fenêtre
   * ne retire PAS son porteur du plan du foyer. Ces jours-là, la personne était
   * déjà composée — la fusion les recompose avec elle, elle ne l'y ajoute pas.
   *
   * ── LE RETOUR ARRIÈRE ───────────────────────────────────────────────────
   * Une ligne: rendre `recomposed` égal à `window`. Le prix du retour est le
   * P0 ci-dessus, et les deux moitiés reviennent ensemble.
   */
  recomposed: PlanSpan;
  /**
   * Combien de jours de l'intersection sont tombés parce qu'ils sont passés.
   *
   * RENDU, JAMAIS SEULEMENT CALCULÉ: c'est ce que la proposition de D16 doit
   * dire mot pour mot — « son plan couvre 5 jours, dont 2 déjà passés — je peux
   * fusionner les 3 restants ». Sans ce nombre, l'écran devrait le recalculer,
   * et un nombre recalculé ailleurs est un nombre qui diverge.
   */
  daysAlreadyPast: number;
}

export type MergeWindowResult =
  | ({ ok: true } & MergeWindow)
  | { ok: false; refusal: MergeWindowRefusal };

function spanUsable(span: PlanSpan | null | undefined): boolean {
  return !!span && DATE.test(span.startsOn) &&
    Number.isFinite(span.durationDays) && span.durationDays >= 1;
}

/**
 * ⚠️ `endExclusive` A DISPARU D'ICI (C2). La borne haute exclue —
 * `starts_on + duration_days`, celle que `daterange` compare — vit désormais
 * une seule fois, dans `planOverlapVerdict` (`meal_plan_window.ts`). Deux
 * exemplaires d'une borne de fin sont deux occasions de se tromper d'un jour, et
 * c'est l'erreur que ce dépôt commet le plus.
 */

/**
 * CETTE FENÊTRE-LÀ S'ÉCRIT-ELLE ? PURE, ET C'EST LA RÈGLE DE LA BASE, LUE ICI.
 *
 * ⚠️ ELLE N'EST PAS UNE GARDE, ELLE EST UNE MESURE. Aucun appelant ne s'en sert
 * pour refuser: `resolveMergeWindow` produit désormais une fenêtre qui la
 * satisfait TOUJOURS (voir `recomposed`), et c'est un test de propriété qui
 * l'exerce sur des dizaines de formes. Une fonction dont personne ne lit le
 * `false` pourrait sembler morte — elle est ce qui rend l'invariant VÉRIFIABLE
 * plutôt qu'affirmé, et c'est le seul moyen qu'a ce module de savoir avant le
 * modèle ce que la base dira après.
 *
 * ── CE QUE `write_student_meal_plan` FAIT, DANS SON ORDRE ────────────────
 * (migration 20260811140000, boucle de chevauchement) — pour chaque plan
 * VIVANT du même compte ET DE LA MÊME NATURE qui croise la fenêtre neuve:
 *
 *   ① il commence LE MÊME JOUR ou APRÈS  ⇒ `plan_overlaps_existing`. Le
 *      tronquer le ferait disparaître en silence.
 *   ② il commence AVANT **et finit APRÈS** ⇒ `plan_overlaps_existing`. C'est le
 *      correctif du 2026-08-11: sa QUEUE se retrouvait sans aucun plan.
 *   ③ sinon ⇒ TRONQUÉ, légitimement, et c'est le mécanisme même de D15.
 *
 * Le plan explicitement REMPLACÉ (`replace_current`) est retiré AVANT cette
 * boucle: il ne chevauche donc plus rien, d'où la première ligne ci-dessous.
 *
 * ⚠️ RECOPIER UNE RÈGLE SQL EN TYPESCRIPT SE PAIE, ET LE FIL EST TENDU: un test
 * relit la boucle DANS LA MIGRATION et tombe le jour où l'original bouge.
 *
 * ⚠️ LA RÈGLE ELLE-MÊME A DÉMÉNAGÉ (C2, 2026-08-12), ET CETTE FONCTION EN EST
 * DEVENUE UN APPELANT. Elle vit dans `meal_plan_window.ts` (`planOverlapVerdict`
 * / `firstBlockingPlan`), parce que les trois portes qui écrivent un plan en ont
 * besoin et pas seulement la fusion: la porte `compose` portait le MÊME défaut
 * et se payait le même 409 après le modèle. Ce qui reste ici est ce qui est
 * PROPRE à la fusion — le fait que la ligne du foyer soit celle que la fusion
 * remplace quand les deux démarrent le même jour.
 */
export function mergeWindowWritable(
  household: PlanSpan,
  window: PlanSpan,
): boolean {
  // La fenêtre démarre LE MÊME JOUR: l'appelant passe `replace_current`
  // (`generate-household-meal-v1`, branche `merge`), la RPC retire la ligne
  // AVANT sa boucle de chevauchement, et il n'y a donc plus rien à chevaucher.
  // C'est une hypothèse SUR L'APPELANT, et c'est pour ça qu'elle est ici et pas
  // dans la règle partagée: pour toute autre ligne vivante, « le même jour de
  // départ » est au contraire le refus ① de la RPC.
  const replacesId = window.startsOn === household.startsOn ? HOUSEHOLD_ROW : null;
  return firstBlockingPlan({
    live: [{ id: HOUSEHOLD_ROW, ...household }],
    window,
    replacesId,
  }) === null;
}

/** L'identité de la seule ligne que `mergeWindowWritable` fait concourir. */
const HOUSEHOLD_ROW = "household";

/** Nombre de jours de `start` à `end`, bornes incluses. `end < start` ⇒ 0. */
export function dayCountInclusive(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00Z`).getTime();
  const b = new Date(`${end}T12:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * D15 — L'INTERSECTION DES DEUX FENÊTRES. D16 — LE PIVOT.
 *
 * ── D15, ET POURQUOI CE N'EST PAS « LA FENÊTRE DU FOYER » ────────────────
 * Les deux fenêtres peuvent diverger: le foyer couvre lundi→dimanche, le
 * secondaire mercredi→dimanche. La fusion opère sur ce qu'ils PARTAGENT et
 * s'arrête d'elle-même là où ils se séparent. Hors intersection, chacun garde
 * ce qu'il avait — et ce n'est pas une intention, c'est un effet mécanique:
 * `write_student_meal_plan` TRONQUE le plan du foyer qui commence avant, donc
 * lundi et mardi restent couverts par la ligne d'avant, telle quelle.
 *
 * ── D16, ET LE PIÈGE QUE CE DÉPÔT A DÉJÀ PAYÉ ────────────────────────────
 * Le pivot est le PREMIER JOUR NON ENCORE CONSOMMÉ, pas la date de courses. Un
 * jour déjà passé ne se refusionne pas: le foyer l'a mangé.
 *
 * ⚠️ `today` DOIT ÊTRE LE JOUR LOCAL DE L'ÉLÈVE, jamais l'horloge du serveur.
 * Ce module ne peut pas le vérifier — c'est une chaîne — donc l'appelant en
 * répond, et il n'a qu'une seule façon de bien faire: réutiliser le `todayDate`
 * que `generate-household-meal-v1` résout déjà dans le fuseau du maître
 * (`localDateInZone`, et son refus `local_day_unresolved` quand le fuseau
 * manque). Une résolution de plus ferait un second avis sur « quel jour on est »
 * — et ce dépôt a déjà payé des incidents de « demain » résolus de nuit.
 */
export function resolveMergeWindow(args: {
  household: PlanSpan;
  personal: PlanSpan;
  /** Jour local de l'élève, `YYYY-MM-DD`. Voir l'avertissement ci-dessus. */
  today: string;
}): MergeWindowResult {
  if (
    !spanUsable(args.household) || !spanUsable(args.personal) ||
    !DATE.test(String(args.today ?? ""))
  ) {
    return { ok: false, refusal: MERGE_WINDOW_UNREADABLE };
  }

  const start = args.household.startsOn > args.personal.startsOn
    ? args.household.startsOn
    : args.personal.startsOn;
  const householdEnd = planEndsOn(
    args.household.startsOn,
    args.household.durationDays,
  );
  const personalEnd = planEndsOn(
    args.personal.startsOn,
    args.personal.durationDays,
  );
  const end = householdEnd < personalEnd ? householdEnd : personalEnd;
  if (end < start) return { ok: false, refusal: MERGE_WINDOWS_DISJOINT };

  const intersection: PlanSpan = {
    startsOn: start,
    durationDays: dayCountInclusive(start, end),
  };

  // LE PIVOT. `today` peut être AVANT l'intersection (une fenêtre à venir): on
  // ne repousse alors rien, le premier jour non consommé est le premier jour
  // tout court. Le `max` est donc la bonne opération, pas une affectation.
  const pivot = args.today > start ? args.today : start;
  if (pivot > end) return { ok: false, refusal: MERGE_WINDOW_ALL_PAST };

  const window: PlanSpan = {
    startsOn: pivot,
    durationDays: dayCountInclusive(pivot, end),
  };

  // ── CE QUI PART VRAIMENT À L'ÉCRITURE (D1 de la QA du 2026-08-12) ────────
  //
  // La QUEUE du plan du foyer, du pivot jusqu'à son dernier jour. Elle vaut
  // `window` dès que les deux fenêtres finissent ensemble — le cas nominal — et
  // elle l'ÉTEND quand le plan personnel s'arrête plus tôt. Voir le long
  // commentaire de `recomposed`: la fusion ne rétrécit jamais la couverture du
  // foyer, ni par un 409 payé au prix d'une génération, ni en silence.
  //
  // ⚠️ C'EST ICI, ET PAS DANS LE GÉNÉRATEUR. `bestMergePair` appelle cette
  // fonction, et il est le SEUL choisisseur — pour la PROPOSITION (D10) comme
  // pour le GESTE. Une seconde arithmétique une couche plus haut aurait fait
  // dire à la proposition autre chose que ce que la fusion écrit, ce que L5 a
  // extrait cette fonction pour empêcher.
  //
  // Le `max` n'est pas décoratif: `end` vaut déjà `min(fin du foyer, fin du
  // sien)`, donc il RÉTABLIT la fin du foyer quand c'est le plan personnel qui
  // s'arrête le premier, et ne fait rien dans l'autre sens.
  const recomposed: PlanSpan = {
    startsOn: pivot,
    durationDays: dayCountInclusive(pivot, householdEnd > end ? householdEnd : end),
  };

  return {
    ok: true,
    intersection,
    pivot,
    window,
    recomposed,
    daysAlreadyPast: dayCountInclusive(start, addDays(pivot, -1)),
  };
}

/**
 * LA MEILLEURE PAIRE (plan du foyer, plan personnel) — ET LE SEUL ENDROIT QUI
 * LA CHOISIT.
 *
 * ⚠️ EXTRAITE DE `resolveMergeRequest` LE 2026-08-12 (L5), ET C'EST LA MOITIÉ
 * QUI COMPTE DE CETTE EXTRACTION. La PROPOSITION de D10 doit annoncer « son
 * plan couvre 5 jours, dont 2 déjà passés — je peux fusionner les 3 restants »,
 * c'est-à-dire exactement ce que la fusion fera. Une seconde arithmétique dans
 * le lecteur de propositions aurait divergé de celle qui fusionne vraiment, et
 * la proposition aurait promis des jours que la fusion ne prend pas. Les deux
 * appellent donc CETTE fonction, et il n'y en a pas d'autre.
 *
 * LE CRITÈRE EST LA FENÊTRE FUSIONNABLE, jamais l'intersection brute: c'est la
 * seule mesure qui parle de jours réellement repris (D16 en retire les jours
 * déjà consommés).
 *
 * LE REFUS RENDU EST LE PLUS INFORMATIF DES DEUX. « Tout est déjà passé » en
 * dit plus que « rien en commun »: les deux plans se touchent bien, et c'est le
 * pivot qui a tranché. Renvoyer `disjoint` là où le vrai motif est D16 enverrait
 * le maître vérifier des dates qui sont justes.
 *
 */
export function bestMergePair<H extends PlanSpan, P extends PlanSpan>(args: {
  householdPlans: readonly H[];
  personalPlans: readonly P[];
  /** Jour local de l'élève, `YYYY-MM-DD`. Voir `resolveMergeWindow`. */
  today: string;
}):
  | { ok: true; household: H; personal: P; window: MergeWindow }
  | { ok: false; refusal: MergeWindowRefusal } {
  let best: { household: H; personal: P; window: MergeWindow } | null = null;
  let refusal: MergeWindowRefusal = MERGE_WINDOWS_DISJOINT;
  for (const household of args.householdPlans) {
    for (const personal of args.personalPlans) {
      const resolved = resolveMergeWindow({ household, personal, today: args.today });
      if (!resolved.ok) {
        if (resolved.refusal !== MERGE_WINDOWS_DISJOINT) refusal = resolved.refusal;
        continue;
      }
      if (!best || resolved.window.durationDays > best.window.window.durationDays) {
        best = { household, personal, window: resolved };
      }
    }
  }
  return best ? { ok: true, ...best } : { ok: false, refusal };
}

/**
 * LA QUEUE D'UN PLAN — ce qu'il lui reste à partir d'aujourd'hui (D16).
 *
 * C'est la fenêtre que la DÉFUSION recompose (D8, L5): le plan du foyer vivant,
 * coupé au premier jour non consommé. Refaire le plan à partir de son premier
 * jour recomposerait des dîners déjà mangés.
 *
 * ⚠️ ELLE DÉLÈGUE À `resolveMergeWindow`, ET CE N'EST PAS UNE COQUETTERIE. La
 * queue d'un plan est son intersection AVEC LUI-MÊME coupée au pivot: c'est la
 * même arithmétique, au mot près. L'écrire une seconde fois ici ferait deux
 * définitions de « le premier jour non consommé » — et ce dépôt paie en boucle
 * la seconde définition qui diverge au premier ajustement. Le prix est un refus
 * `MERGE_WINDOWS_DISJOINT` structurellement impossible (un plan croise toujours
 * lui-même), que l'appelant n'a donc jamais à traduire.
 */
export function resolveTailWindow(args: {
  plan: PlanSpan;
  today: string;
}): MergeWindowResult {
  return resolveMergeWindow({
    household: args.plan,
    personal: args.plan,
    today: args.today,
  });
}

// ---------------------------------------------------------------------------
// D6 — L'ÉCHELLE DE FUSION
//
// ① MÊME PLAT, RATIOS DIFFÉRENTS — une casserole, deux assiettes.
// ② PLATS DIFFÉRENTS, MÊME SESSION DE CUISSON — on cuisine deux choses en
//    même temps.
// ③ SESSIONS SÉPARÉES — le dernier recours.
//
// On s'arrête au PREMIER barreau qui tient.
//
// ── LE CRITÈRE D'ABANDON EST VÉRIFIABLE, PAS UN JUGEMENT DE GOÛT ──────────
// Le moteur renonce au niveau ① dès qu'un plat commun forcerait quelqu'un HORS
// DE SA DIRECTION DE SERVICE. Ces directions existent déjà, distinctes pour les
// six objectifs (`household_portions.ts`, `SERVING_DIRECTION`), et elles se
// LISENT axe par axe (`readServingDemands`) plutôt que de se recopier ici.
//
// LA RÈGLE, EN UNE PHRASE: une casserole déjà composée peut toujours en donner
// MOINS, jamais plus qu'elle n'en contient.
//
//   · Une demande à `balanced` ou en dessous (`smaller`, `moderate`) est
//     TOUJOURS servable: on sert moins, et c'est tout.
//   · Une demande AU-DESSUS (`full`, `larger`) exige que quelqu'un à cette
//     table la porte DÉJÀ — sinon le plat n'a pas été dimensionné pour elle, et
//     la servir voudrait dire prendre la part d'un autre.
//
// C'EST LA MOITIÉ QU'ON PEUT PROUVER, ET C'EST ASSUMÉ. Savoir si CE plat-ci
// porte assez de féculent demanderait un modèle de séparabilité par composant
// (D5, non livré). Le critère ci-dessus n'a besoin que des directions, qui sont
// des CONSTANTES du produit — donc il se mute, se teste, et ne ment pas sur ce
// qu'il sait.
//
// EXEMPLE, ET C'EST LE CAS PHARE DU PRODUIT: un père en `fat_loss` seul à
// table, un fils en `muscle_gain` qui revient par la fusion. Le fils demande
// `larger` en protéine ET en féculent; la table plafonne à `full` en protéine
// et `smaller` en féculent. La casserole du père ne peut pas le nourrir: on
// descend au barreau ②, et on cuisine son plat À CÔTÉ, dans la même session.
// Ce n'est PAS le même arbitrage qu'une COMPOSITION où les deux sont là dès le
// départ — là, le plat est dimensionné pour les deux. C'est toute la différence
// entre composer et fusionner.
// ---------------------------------------------------------------------------

const DEMAND_RANK: Record<ServingDemand, number> = {
  smaller: 1,
  moderate: 2,
  balanced: 3,
  full: 4,
  larger: 5,
};

/**
 * CE QU'UNE CASSEROLE DONNE SANS AVOIR ÉTÉ PRÉVUE POUR: l'équilibre, et tout
 * ce qui est en dessous. Nommé plutôt qu'écrit `3` en dur — le rang est un
 * détail de la table, le plancher est la règle.
 */
const ALWAYS_SERVABLE = DEMAND_RANK.balanced;

export interface MergeLadderInput {
  /**
   * Ce que demande la table telle qu'elle est AUJOURD'HUI, sans l'entrant.
   * C'est elle qui a dimensionné la casserole.
   */
  table: readonly ServingAxisDemands[];
  /** Ce que demande la personne qu'on reprend. */
  incoming: ServingAxisDemands;
  /** Les jours où le foyer cuisine, sur la fenêtre fusionnée. Jetons `mon`… */
  householdCookingDays: readonly string[];
  /** Les jours où le plan personnel cuisine, sur la même fenêtre. */
  personalCookingDays: readonly string[];
}

export interface MergeLadderResult {
  shape: CookingShape;
  /** POURQUOI ce barreau. Un barreau sans motif ne se relit pas. */
  reason: string;
  /**
   * Les axes qui ont fait renoncer au niveau ①, nommés
   * (`starch:larger_above_table`, `protein:unreadable`). Vide = niveau ①.
   */
  conflicts: string[];
  /** Les jours de cuisson que les deux plans partagent. */
  sharedCookingDays: string[];
}

export const LADDER_REASON_ONE_DISH = "directions_within_table_span";
export const LADDER_REASON_ONE_SESSION = "serving_direction_conflict";
export const LADDER_REASON_NO_COOKING_DAY =
  "serving_direction_conflict_no_shared_cooking_day";

/** Les axes sur lesquels la casserole du foyer ne peut pas servir l'entrant. */
export function servingConflicts(
  table: readonly ServingAxisDemands[],
  incoming: ServingAxisDemands,
): string[] {
  const conflicts: string[] = [];
  for (const axis of SERVING_AXES) {
    const want = incoming[axis];
    // La direction ne NOMME PAS cet axe: elle n'en demande rien, donc
    // n'importe quelle part convient. `performance` ne parle pas de légumes.
    if (want === null || want === undefined) continue;
    if (want === "unreadable") {
      // ON NE DEVINE PAS. Une direction qu'on n'a pas su lire fait descendre
      // d'un barreau: ça coûte un plat de plus, jamais une assiette qui ment.
      conflicts.push(`${axis}:unreadable`);
      continue;
    }
    if (DEMAND_RANK[want] <= ALWAYS_SERVABLE) continue;
    let ceiling = ALWAYS_SERVABLE;
    for (const member of table) {
      const has = member[axis];
      if (has === null || has === undefined || has === "unreadable") continue;
      ceiling = Math.max(ceiling, DEMAND_RANK[has]);
    }
    if (DEMAND_RANK[want] > ceiling) {
      conflicts.push(`${axis}:${want}_above_table`);
    }
  }
  return conflicts;
}

/**
 * L'ÉCHELLE, ET ON S'ARRÊTE AU PREMIER BARREAU QUI TIENT.
 *
 * ── LE PASSAGE DE ② À ③ N'EST PAS SPÉCIFIÉ PAR D6, ET C'EST ASSUMÉ ───────
 * D6 nomme UN critère, celui de ① → ②, et il est appliqué au-dessus. Pour
 * ② → ③ le chantier ne dit rien, et « ce plat tiendra-t-il dans la même
 * session » n'est pas décidable sans le modèle. On prend donc le seul fait
 * VÉRIFIABLE qui existe dans les deux plans: leurs JOURS DE CUISSON. Deux plans
 * qui ne cuisinent jamais le même jour ne peuvent pas partager une session —
 * c'est de la logistique, pas du goût.
 *
 * ⚠️ UN PLAN QUI NE CUISINE PAS N'EST PAS UN PLAN QUI CUISINE AILLEURS. Quand
 * l'un des deux ne déclare AUCUNE session sur la fenêtre (un plan d'assemblage,
 * une fenêtre d'un jour), il n'y a rien à séparer: on reste au barreau ②, où le
 * second plat rejoint simplement la session du foyer. Descendre à ③ dirait au
 * modèle d'ouvrir une session qui n'existe nulle part.
 */
export function mergeLadder(input: MergeLadderInput): MergeLadderResult {
  const conflicts = servingConflicts(input.table, input.incoming);
  const shared = input.householdCookingDays.filter((d) =>
    input.personalCookingDays.includes(d)
  );
  if (conflicts.length === 0) {
    return {
      shape: "one_dish",
      reason: LADDER_REASON_ONE_DISH,
      conflicts,
      sharedCookingDays: shared,
    };
  }
  const eitherSideCooksNowhere = input.householdCookingDays.length === 0 ||
    input.personalCookingDays.length === 0;
  if (shared.length > 0 || eitherSideCooksNowhere) {
    return {
      shape: "one_session",
      reason: LADDER_REASON_ONE_SESSION,
      conflicts,
      sharedCookingDays: shared,
    };
  }
  return {
    shape: "separate_sessions",
    reason: LADDER_REASON_NO_COOKING_DAY,
    conflicts,
    sharedCookingDays: shared,
  };
}

// ---------------------------------------------------------------------------
// LA PROVENANCE — `merged_from`
//
// ⚠️ SANS ELLE, L'AVERTISSEMENT DE D8 EST INCALCULABLE. L5 doit pouvoir dire
// « le plan de X a été fusionné le … ; il vient d'en valider un NOUVEAU ». Cette
// phrase demande quatre faits, et pas trois: QUI, QUELLE LIGNE de plan, VALIDÉE
// QUAND, et SUR QUELS JOURS. Retirer `validated_at` rendrait « il vient d'en
// valider un nouveau » indécidable — c'est la comparaison de deux dates de
// validation, pas de deux ids.
//
// La forme suit celle de L2 (`generated_from.household.presence`) et de L3
// (`…household.hand`): des clés `snake_case`, des ids de MEMBRE, et une entrée
// par personne concernée — jamais une trace où tout le monde figure.
// ---------------------------------------------------------------------------

export interface MergedFromEntry {
  member_id: string;
  /** `null` impossible en pratique (fusionner exige un compte), rendu quand même. */
  user_id: string | null;
  plan_id: string;
  plan_starts_on: string;
  plan_duration_days: number;
  /** D8: la date que L5 comparera à une validation POSTÉRIEURE. */
  validated_at: string | null;
  /** Les jours réellement repris, en dates. Pas des jetons: un jeton se répète. */
  days: string[];
}

export function mergedFromEntry(args: {
  memberId: string;
  userId: string | null;
  plan: { id: string; startsOn: string; durationDays: number; validatedAt: string | null };
  window: PlanSpan;
}): MergedFromEntry {
  const days: string[] = [];
  for (let i = 0; i < Math.max(1, args.window.durationDays); i++) {
    days.push(addDays(args.window.startsOn, i));
  }
  return {
    member_id: args.memberId,
    user_id: args.userId,
    plan_id: args.plan.id,
    plan_starts_on: args.plan.startsOn,
    plan_duration_days: args.plan.durationDays,
    validated_at: args.plan.validatedAt,
    days,
  };
}

// ---------------------------------------------------------------------------
// LE BLOC DE CONSIGNE
//
// Il dit au modèle TROIS choses, et rien d'autre: qui revient, sur quels jours,
// et ce que cette personne allait manger. La FORME de cuisine, elle, n'est pas
// ici: elle est dans le brief de portions (`CookingShape`), parce que c'est là
// que vit la phrase « combien de plats » — et deux endroits qui donnent le même
// ordre finissent par en donner deux différents.
//
// ⚠️ CE QUI NE PART PAS: le `why` des plats. « Pourquoi CE plat pour CET
// élève » est la seule prose du plan qui parle de la personne, et ce prompt-ci
// produit un texte lu à table par tout le foyer. Les TITRES, eux, sont déjà
// lisibles par tout le foyer (policy `student_generated_meals_household_read`):
// les passer ne divulgue rien de neuf.
// ---------------------------------------------------------------------------

/** Ce qu'on montre d'un plat du plan personnel. Trois champs, pas quatre. */
export interface MergeMaterialDish {
  day: string | null;
  slot: string | null;
  title: string;
}

/** Une case que le plan montré ne remplit pas. Calculée par `emptySlotsIn`. */
export interface ShownPlanGap {
  day: string;
  slot: string;
}

/**
 * C2 ④ — LE TROU DU PLAN MONTRÉ, DIT AU MODÈLE POUR QU'IL NE LE RECOPIE PAS.
 *
 * ── LE DÉFAUT, MESURÉ DEUX FOIS LE 2026-08-12 ──────────────────────────────
 *
 * Un plat dont un ingrédient porte une cible chiffrée est rejeté ENTIER. Sur
 * une fusion, la matière du plan personnel citait « whey protein 90 g » et **les
 * cinq petits-déjeuners du foyer sont tombés d'un coup**. Puis la DÉFUSION a
 * recopié le trou: sa consigne montre le plan de base et demande d'en rester au
 * plus près — et le modèle obéit, 14 titres sur 14. **Deux plans du foyer
 * consécutifs sans petit-déjeuner mercredi.**
 *
 * ── CE QUE CE BLOC FAIT, ET CE QU'IL NE FAIT PAS ───────────────────────────
 *
 * Il NOMME la case, et il dit que c'est un accident. Il ne dit PAS quoi y
 * mettre: le tronc demande déjà, sur toute fenêtre de plusieurs jours, que
 * « every day of the stretch needs <les moments de cette personne> — a day
 * missing one of those is a hole ». La liste ci-dessous ne fait que retirer la
 * contradiction entre cette phrase-là et « reste au plus près du plan de base ».
 * Personne n'invente un plat: le modèle compose cette case comme il compose
 * toutes les autres.
 *
 * ⚠️ VIDE = AUCUNE LIGNE. Le cas nominal — un plan de base complet — rend un
 * bloc byte-identique à celui d'avant C2, et un test le tient. Sans quoi on
 * dirait « voici les trous » à un plan qui n'en a pas, ce qui est la meilleure
 * façon d'en faire fabriquer un.
 */
function gapLines(gaps: readonly ShownPlanGap[]): string[] {
  if (gaps.length === 0) return [];
  return [
    "",
    "These moments have NO dish in the plan above:",
    ...gaps.map((g) => `- ${g.day} ${g.slot}`),
    "That is a GAP, not a choice — a dish was dropped there. Compose those",
    "moments like any other: staying close to a plan never means copying a",
    "missing meal.",
  ];
}

/** Le plafond de lignes de matière. Une semaine de six repas tient dessous. */
export const MERGE_MATERIAL_CAP = 42;

/**
 * LES PLATS PROPRES QUE LE MODÈLE VOIT VRAIMENT — et le seul endroit qui le
 * décide.
 *
 * ⚠️ EXISTE PARCE QUE LE PLAFOND DE PLATS DOIT COMPTER LA MÊME CHOSE QUE LA
 * CONSIGNE. Le budget de la fusion vaut « ce qu'on lui montre »
 * (`mergeDishBonus`); si l'appelant comptait la liste AVANT le `slice`, il
 * ouvrirait un budget pour des plats que le modèle ne voit pas — et deux
 * copies d'un même nombre dont une seule reçoit la modification est le défaut
 * que ce dépôt documente le plus souvent. `buildMergeBlock` passe désormais
 * par ici, donc les deux ne peuvent plus diverger.
 */
export function mergeMaterialShown(
  dishes: readonly MergeMaterialDish[],
): readonly MergeMaterialDish[] {
  return dishes.slice(0, MERGE_MATERIAL_CAP);
}

/**
 * O5 — L'ANCRE. La consigne de fusion, telle qu'elle part au modèle.
 *
 * ── LE DÉFAUT QU'ELLE RÉPARE, MESURÉ CRÉNEAU PAR CRÉNEAU ────────────────────
 *
 * Sur une fusion réelle du 2026-08-12, **15 créneaux sur 15** du plan fusionné
 * venaient du plan PERSONNEL du secondaire, et **aucun** titre du plan du foyer
 * n'a survécu. Un foyer dont le maître est en `fat_loss`, avec un mineur à
 * table, s'est vu servir intégralement un plan de prise de masse. Reproduit à
 * l'identique sur une seconde fusion. `observeMergeShape` le CONSTATE
 * (`honoured: {ok:false, requested:"one_session", observed:"common_pot"}`) et
 * ne fait que ça: le plan est écrit et servi.
 *
 * ── POURQUOI, ET LA PREUVE EST DANS CE MÊME FICHIER ─────────────────────────
 *
 * **La défusion obéit 14/14.** Sa consigne (`buildUnmergeBlock`, cinquante
 * lignes plus bas) montre au modèle **le plan de base** et lui dit d'en rester
 * au plus près — et le modèle a rendu 14 titres identiques sur 14.
 *
 * La fusion, elle, ne montrait **qu'une seule liste de plats**: ceux du plan
 * personnel, présentés comme de la matière. Un modèle à qui l'on ne montre
 * qu'un menu écrit ce menu. Ce n'était pas une désobéissance de barreau, c'était
 * une consigne sans ancre: rien, dans le message, ne disait ce qu'il fallait
 * GARDER.
 *
 * Les deux blocs disent désormais la même chose dans le même ordre — un plan
 * qui fait autorité, montré, et l'instruction d'en rester au plus près. Ce qui
 * les sépare est ce que la fusion AJOUTE, et c'est le barreau (D6) qui le dit.
 *
 * ── L'ORDRE DES DEUX LISTES EST LA MOITIÉ DU CORRECTIF ──────────────────────
 *
 * Le plan personnel vient d'ABORD, le plan du foyer et l'ancre viennent en
 * DERNIER. C'est la posture déjà écrite dans `household_meal_generation.ts`
 * pour le bloc des voix — « un modèle lit la contrainte la plus proche de la
 * fin comme la plus contraignante ». Mettre la matière en dernier, comme
 * avant, faisait de la liste à ne PAS recopier le mot de la fin.
 *
 * ⚠️ CE QUE ÇA NE FAIT PAS: interdire le plat dédié. Aux barreaux ② et ③ le
 * modèle doit toujours produire un plat pour la personne reprise — c'est L4,
 * mesuré, avec son plafond qui en tient compte (`dishBudgetFor`). Ancrer sur le
 * plan du foyer veut dire « n'écrase pas ce que les autres mangent », jamais
 * « n'ajoute rien ».
 */
export const MERGE_ANCHOR_INSTRUCTION =
  "Stay as CLOSE AS POSSIBLE to the household's plan";

export function buildMergeBlock(args: {
  displayName: string;
  window: PlanSpan;
  shape: CookingShape;
  /** Les plats du PLAN PERSONNEL repris — de la matière pour UNE bouche. */
  dishes: readonly MergeMaterialDish[];
  /**
   * LES PLATS DU PLAN DU FOYER, ramenés à la fenêtre recomposée. C'est L'ANCRE.
   *
   * ⚠️ REQUIS, jamais optionnel. Ce dépôt a mesuré sept fois qu'« un paramètre
   * de garde optionnel est une garde désarmée »: un champ facultatif n'aurait
   * fait remonter aucun appelant au compilateur, et la fusion serait retombée
   * en silence sur la consigne sans ancre — celle qui a servi un plan de prise
   * de masse à un foyer en perte de gras, 15 créneaux sur 15.
   */
  baseDishes: readonly MergeMaterialDish[];
  /**
   * C2 ④ — LES CASES QUE `baseDishes` NE REMPLIT PAS, sur cette fenêtre.
   *
   * ⚠️ REQUIS, jamais optionnel. Un paramètre de garde optionnel est une garde
   * désarmée — ce dépôt l'a mesuré sept fois — et ici l'oubli serait
   * PARFAITEMENT silencieux: la fusion recopierait le trou du plan du foyer
   * comme si c'était une intention, exactement comme la défusion l'a fait
   * 14/14. `[]` dit « aucun trou », et rend le bloc byte-identique à v7.
   */
  gaps: readonly ShownPlanGap[];
}): string {
  const end = planEndsOn(args.window.startsOn, args.window.durationDays);
  const lines = (dishes: readonly MergeMaterialDish[]) =>
    mergeMaterialShown(dishes).map((d) => {
      const when = [d.day, d.slot].filter(Boolean).join(" ");
      return when ? `- ${when}: ${d.title}` : `- ${d.title}`;
    });
  const material = lines(args.dishes);
  const base = lines(args.baseDishes);

  const howToUse = args.shape === "one_dish"
    ? [
      `${args.displayName} eats from the SAME dishes as the rest of the table.`,
      "What follows is what they were going to eat on their own. Treat it as a",
      "PREFERENCE — lean the household's dishes towards it where that costs",
      "nothing. Never turn it into a second dish.",
    ]
    : args.shape === "one_session"
    ? [
      `${args.displayName} cannot be served out of the common pot.`,
      "ADD ONE dish for them, and cook it in the SAME cooking session as the",
      "household's — one session at the stove, two dishes out of it.",
      "Everyone else keeps the household's dishes: what follows is material for",
      "THEIR dish, never a menu for the table.",
    ]
    : [
      `${args.displayName} cannot be served out of the common pot, and the two`,
      "plans never cook on the same day.",
      "ADD their dishes, in their OWN cooking session.",
      "Everyone else keeps the household's dishes: what follows is material for",
      "THEIR dishes, never a menu for the table.",
    ];

  return [
    "== BRINGING SOMEONE BACK TO THIS TABLE ==",
    `${args.displayName} has been eating from their own plan. The person who`,
    `runs this home has asked to cook for them again, from ${args.window.startsOn}`,
    `to ${end}.`,
    "",
    ...howToUse,
    ...(material.length > 0
      ? [
        "",
        `What ${args.displayName} was going to eat over these days, on their own:`,
        ...material,
      ]
      : []),
    // ── L'ANCRE, EN DERNIER ─────────────────────────────────────────────────
    // Inconditionnelle: elle ne dit pas « regarde la liste », elle dit ce qui
    // fait autorité. Un plan du foyer dont aucun plat ne tombe dans la fenêtre
    // recomposée est un état qu'on ne sait pas produire, mais s'il arrive, la
    // consigne reste vraie — c'est la liste qui manque, pas la règle.
    "",
    "THE HOUSEHOLD'S PLAN IS THE PLAN, AND IT STAYS.",
    `${MERGE_ANCHOR_INSTRUCTION}: keep the same dishes, the same`,
    "cooking sessions and the same shopping wherever they still work for the",
    "people who were already at this table — only the amounts change. Do NOT",
    `invent a different week, and never serve ${args.displayName}'s dishes to`,
    "the whole table.",
    ...(base.length > 0
      ? ["", "The household's plan over these days:", ...base]
      : []),
    // ── C2 ④ · CE QUE LE PLAN DU FOYER NE COUVRE PAS ────────────────────────
    // En DERNIER, juste après la liste qu'il corrige: « reste au plus près de
    // ce plan » vient d'être écrit, et sans cette précision le trou en fait
    // partie. C'est la même posture d'ordre que l'ancre elle-même.
    ...gapLines(args.gaps),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// D8 — LA DÉFUSION: REFAIRE LE PLAN DU FOYER **SANS** QUELQU'UN
//
// La consigne est écrite MOT POUR MOT dans le registre
// (docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md, D8):
//
//     « rester au plus près du plan de base, sans user X »
//
// C'est elle qui préserve les courses déjà faites. Sans elle, « refaire le plan
// sans X » rendrait une semaine entièrement neuve: le maître qui retire UNE
// bouche perdrait les six autres dîners qu'il avait déjà achetés, et la
// défusion coûterait plus cher que la fusion qu'elle défait.
//
// ── QUEL EST « LE PLAN DE BASE » ? DÉCISION PRISE SEULE, ET ÉCRITE ICI ─────
// Le registre ne le nomme pas, et deux lectures se défendaient:
//
//   ① le plan du foyer d'AVANT la fusion (`into_plan_id`, que L4 archive);
//   ② le plan du foyer VIVANT — c'est-à-dire, après une fusion, le plan
//      fusionné lui-même.
//
// ② EST RETENU, pour la raison même que D8 invoque: « ce qui préserve les
// courses déjà faites ». Les courses se font sur le plan que l'écran montre,
// et l'écran montre le plan VIVANT. Après une fusion, c'est le plan fusionné:
// revenir au plan d'avant jetterait précisément les courses que la phrase
// existe pour sauver. ② a aussi une propriété que ① n'a pas — il est TOUJOURS
// lisible, alors que ① dépend d'une clé d'archive qu'un plan écrit avant L4 ne
// porte pas, ce qui aurait fait une branche de repli sur le chemin nominal.
//
// LE RETOUR ARRIÈRE COÛTE UNE LECTURE: passer `dishes` du plan pointé par
// `into_plan_id` au lieu de celles du plan vivant. Aucune structure ne change,
// et `generated_from.household.unmerge.base_plan_id` dit, ligne par ligne,
// lequel des deux a servi — donc les plans écrits avant et après un changement
// d'avis restent distinguables.
//
// ⚠️ CE BLOC NE DIT PAS AU MODÈLE POURQUOI LA PERSONNE PART. « Elle a validé
// son propre plan » est une information sur ELLE, et ce prompt produit un texte
// lu à table par tout le foyer. On dit ce qu'il faut cuisiner, pas qui a
// décidé quoi.
// ---------------------------------------------------------------------------

/**
 * La consigne de D8, telle qu'elle part au modèle. Isolée pour qu'un test la
 * tienne SUR LA SORTIE de la fonction et non sur la source du fichier: ce dépôt
 * a déjà vu un `src.includes("…")` rester vert parce qu'un commentaire citait
 * la chaîne cherchée.
 */
export const UNMERGE_CLOSENESS_INSTRUCTION =
  "Stay as CLOSE AS POSSIBLE to the base plan below";

export function buildUnmergeBlock(args: {
  displayName: string;
  window: PlanSpan;
  /** Les plats du plan de base, ramenés à la fenêtre recomposée. */
  dishes: readonly MergeMaterialDish[];
  /**
   * C2 ④ — LES CASES QUE `dishes` NE REMPLIT PAS, sur cette fenêtre.
   *
   * ⚠️ REQUIS, et c'est ICI que le défaut a été mesuré. « Reste au plus près du
   * plan de base » est la consigne que le modèle honore le mieux de tout ce
   * chantier — 14 titres identiques sur 14 — donc c'est aussi celle qui recopie
   * le mieux un trou. Deux plans du foyer consécutifs sans petit-déjeuner
   * mercredi, le 2026-08-12. `[]` = aucun trou, bloc byte-identique à v7.
   */
  gaps: readonly ShownPlanGap[];
}): string {
  const end = planEndsOn(args.window.startsOn, args.window.durationDays);
  const material = mergeMaterialShown(args.dishes)
    .map((d) => {
      const when = [d.day, d.slot].filter(Boolean).join(" ");
      return when ? `- ${when}: ${d.title}` : `- ${d.title}`;
    });

  return [
    "== TAKING SOMEONE BACK OUT OF THIS TABLE ==",
    `${args.displayName} is no longer eating from this household's plan, from`,
    `${args.window.startsOn} to ${end}. Cook for the people listed above, and`,
    `for them only.`,
    "",
    `${UNMERGE_CLOSENESS_INSTRUCTION}, without ${args.displayName}.`,
    "Keep the same dishes, the same cooking sessions and the same shopping",
    "wherever they still work for the people who remain — only the amounts",
    "change. Do NOT invent a different week: what has already been bought must",
    "still be used.",
    ...(material.length > 0
      ? ["", "The base plan over these days:", ...material]
      : []),
    // ── C2 ④ · LE TROU DU PLAN DE BASE, QUI N'EST PAS UNE INTENTION ────────
    ...gapLines(args.gaps),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// LE CONSTAT — LE PLAN RENDU PORTE-T-IL CE QU'ON A DEMANDÉ ?
//
// ⚠️ MESURÉ EN RUN RÉEL LE 2026-08-12, SUR UNE FUSION SUR DEUX. Barreau ③
// demandé — conflits `protein:larger_above_table` et `starch:larger_above_table`,
// aucun jour de cuisson partagé. Le modèle a rendu quinze plats, AUCUN second
// plat, AUCUNE session dédiée, et a servi la personne depuis la casserole
// commune: « Serve a larger portion of the protein and starch », part
// « largest plate share ». C'est EXACTEMENT ce que le critère d'abandon de D6
// existe pour interdire — la casserole n'a pas été dimensionnée pour elle, donc
// la servir revient à prendre la part d'un autre.
//
// `ladder.shape` partait dans le prompt et s'archivait dans `generated_from`,
// et RIEN ne comparait le plan rendu à la forme demandée. L'archive disait
// `separate_sessions`, le plan disait le contraire, et les deux étaient dans la
// même ligne.
//
// ── CE MODULE NE FAIT QUE CONSTATER, ET C'EST UNE DÉCISION ────────────────
// Refuser le plan ou relancer le modèle serait un choix de PRODUIT que personne
// n'a pris. Un plan servi depuis la casserole commune reste mangeable: il est
// seulement moins juste que promis. On rend donc le mensonge VISIBLE — un
// `issue` nommé, et la forme OBTENUE à côté de la forme DEMANDÉE dans
// `generated_from` — et on ne le corrige pas en silence.
//
// ── CE QUE LE CONSTAT SAIT VOIR, ET CE QU'IL NE SAIT PAS ──────────────────
// Deux marques STRUCTURELLES, lisibles sur le plan parsé, sans jamais lire un
// titre ni une prose (« jamais de matcher maison » — « laitue » n'est pas
// « lait », et douze faux positifs sur douze ont été mesurés):
//
//   1. UNE PRÉPARATION D'UNE PORTION. C'est littéralement un plat cuisiné pour
//      une seule bouche, et c'est ce que le modèle a rendu quand il a OBÉI
//      (`prep_zoe_tuna_pasta`, `servings_made: 1`) — avant que le parseur ne le
//      jette, ce qui est l'autre moitié de ce lot.
//   2. DEUX PLATS AU MÊME JOUR ET AU MÊME MOMENT. Une grille de repas en porte
//      un par case; deux, c'est que quelqu'un ne mange pas comme la table.
//
// CE QU'IL NE DISTINGUE PAS: ② de ③. Savoir si la session dédiée existe
// vraiment demanderait de rattacher chaque préparation à sa session et de
// comparer les jours — faisable, non fait, et le dire ici vaut mieux que le
// laisser croire. Le constat répond à UNE question: « cette personne a-t-elle
// quelque chose à elle, oui ou non ». C'est la question que le run réel a
// tranchée par la négative.
// ---------------------------------------------------------------------------

/** L'`issue` poussée quand la forme demandée n'est pas dans le plan rendu. */
export const MERGE_SHAPE_NOT_HONOURED = "merge_shape_not_honoured";

export interface MergeShapeObservation {
  /** Le barreau DEMANDÉ, recopié pour que les deux se lisent côte à côte. */
  requested: CookingShape;
  /** Ce que le plan rendu porte: quelque chose à elle, ou la casserole commune. */
  observed: "dedicated_dish" | "common_pot";
  /** Les marques trouvées, nommées. Vide = rien de dédié dans ce plan. */
  marks: string[];
  /**
   * `false` UNIQUEMENT quand ②/③ a été demandé et que rien de dédié n'existe.
   *
   * ① est TOUJOURS honoré ici, et ce n'est pas une complaisance: sa promesse
   * est « pas de second plat », et le budget de plats ne lui en laisse aucune
   * place (`mergeDishBonus` rend 0). Y pousser un constat ferait dépendre le
   * barreau le plus fréquent d'une heuristique dont un faux positif salirait
   * toutes les compositions ordinaires.
   */
  honoured: boolean;
}

/** Ce qu'un plat rendu porte d'utile au constat. Rien de sa prose. */
export interface ObservedDish {
  day: string | null;
  slot: string | null;
}

/** Ce qu'une préparation rendue porte d'utile au constat. */
export interface ObservedPreparation {
  servingsMade: number;
}

export function observeMergeShape(args: {
  shape: CookingShape;
  dishes: readonly ObservedDish[];
  preparations: readonly ObservedPreparation[];
}): MergeShapeObservation {
  const marks: string[] = [];

  const singleServing =
    args.preparations.filter((p) => Number(p.servingsMade) === 1).length;
  if (singleServing > 0) marks.push(`single_serving_preparation:${singleServing}`);

  // LA CASE DE LA GRILLE, ET SEULEMENT QUAND ELLE EST NOMMÉE. Deux plats sans
  // moment déclaré ne disent rien: ils peuvent être le déjeuner et le dîner du
  // même jour. Un moment inconnu ne fabrique donc pas de marque.
  const perCell = new Map<string, number>();
  for (const dish of args.dishes) {
    if (!dish.slot) continue;
    const cell = `${dish.day ?? "any"}/${dish.slot}`;
    perCell.set(cell, (perCell.get(cell) ?? 0) + 1);
  }
  for (const [cell, count] of perCell) {
    if (count > 1) marks.push(`parallel_dishes:${cell}`);
  }

  const observed = marks.length > 0 ? "dedicated_dish" : "common_pot";
  return {
    requested: args.shape,
    observed,
    marks,
    honoured: !asksForASecondDish(args.shape) || observed === "dedicated_dish",
  };
}
