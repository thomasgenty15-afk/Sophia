/**
 * LOT 3 — CE QUE LA CASSEROLE A REFUSÉ DE DONNER.
 *
 * Chantier: `scratchpad/2026-08-19-2200-MASTER-PROMPT-GRAMMAGE.md`, LOT 3.
 *
 * ── LE FORK QUE CE MODULE EXISTE POUR TRANCHER, ET AVEC UNE MESURE ────────
 * Quand l'ancrage (LOT 2) demande 1,5x ce que le plan a composé, il y a deux
 * façons de répondre, et une seule est honnête selon la fréquence du cas:
 *
 *   · EN AVAL — on réécrit les grammes de la boîte, et on tape le plafond du
 *     récipient: la casserole ne contient pas 1,5x. On rabote, et l'ancrage
 *     redevient décoratif;
 *   · EN AMONT — le facteur remonte dans les QUANTITÉS DES PRÉPARATIONS, donc
 *     dans la liste de courses. C'est la seule version où le grammage cesse
 *     d'être une intuition.
 *
 * ⛔ CE MODULE NE TRANCHE PAS, IL MESURE — et c'est délibéré. Implémenter
 * l'amont avant de savoir si le plafond mord serait construire précisément la
 * chose que la mesure doit justifier. Il rend deux nombres:
 *
 *   1. `unmetDemand` — combien de kcal l'ancrage voulait et n'a pas obtenus, et
 *      LEQUEL des deux plafonds l'a refusé;
 *   2. `neededPotFactor` — de combien chaque casserole devrait grossir pour que
 *      l'amont soit possible. Calculé, jamais appliqué.
 *
 * ── ⛔ AUCUN PLAN EN BASE NE PERMET ENCORE CETTE MESURE ───────────────────
 * Mesuré le 2026-08-19: 136 plans de foyer en base, **0 avec une boîte** —
 * l'unité « un contenant par repas » date du jour même. Ce module est donc
 * l'instrument, et le premier run réel est la mesure. Tant qu'elle n'a pas eu
 * lieu, le fork n'est pas tranché, et personne ne doit faire comme s'il l'était.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  ANCHOR_FACTOR_MAX,
  ANCHOR_FACTOR_MIN,
  type AnchorFactor,
  type AnchorMouth,
  mealMassCapFor,
  type MealCapBit,
  mouthTargetKcal,
  slotPlanTargets,
  wholeDaySlots,
} from "./mouth_anchor.ts";
import type { MouthDayEnergy } from "./mouth_energy.ts";
import type { CountingStance } from "./energy_gate.ts";

/**
 * QUI A REFUSÉ. Nommé, parce que les deux se réparent à deux endroits
 * différents et qu'un compteur qui les fondrait enverrait au mauvais.
 */
export const UNMET_CAUSES = Object.freeze(
  [
    /** Rien n'a été refusé: la part servie porte la cible. */
    "none",
    /** Les bornes de plausibilité du facteur ont raboté (`ANCHOR_FACTOR_*`). */
    "factor_clamped",
    /** La casserole ne produisait pas assez (`sizeBoxesFromTarget`, §③). */
    "pot_ceiling",
    /** Les deux, et c'est le cas qui dit que l'aval seul ne suffira jamais. */
    "both",
    /** Aucun ancrage n'a eu lieu: il n'y a pas de demande à confronter. */
    "not_anchored",
    /**
     * ⟳ 2026-09-06 — LA JOURNÉE « BAC COMMUN SEUL », ESTIMÉE POUR LE COMPTEUR.
     * Mesuré sur le quatre (C03 02:10) : 14 journées-bouche sur 21 sortaient
     * `not_anchored` parce que la bouche n'a mangé que dans des bacs — et le
     * manque de trois personnes sur quatre était invisible au compteur. Ici le
     * servi est Σ kcal des bacs de la journée / leurs mangeurs : une ESTIMATION,
     * nommée, jamais un chiffre au nom de quelqu'un sur un couvercle (v4), et
     * jamais un facteur — la règle du bac (`potFactorFor`) reste la seule à
     * dimensionner. Le compteur dit « la table nourrit-elle », rien d'autre.
     */
    "tub_estimate",
  ] as const,
);
export type UnmetCause = (typeof UNMET_CAUSES)[number];

export interface UnmetDemand {
  memberId: string;
  day: string | null;
  /** Ce que le corps demandait, en kcal. `null` si aucune cible. */
  wantedKcal: number | null;
  /** Ce que la part réellement servie porte, en kcal. `null` si inconnu. */
  servedKcal: number | null;
  /**
   * L'ÉCART NON COUVERT, en kcal. Toujours >= 0 — un écart NÉGATIF (on sert
   * plus que la cible) n'est pas une demande non satisfaite, c'est un
   * dépassement, et il se lit sur `servedKcal` face à `wantedKcal`. Les fondre
   * dans un seul nombre signé ferait une somme où les deux s'annulent, et une
   * table où la moitié manque et l'autre déborde paraîtrait parfaite.
   */
  unmetKcal: number | null;
  cause: UnmetCause;
}

/**
 * CE QUE L'ANCRAGE A DEMANDÉ ET N'A PAS OBTENU, bouche par bouche et jour par
 * jour.
 *
 * @param potShrink le rabot du plafond de récipient appliqué à cette bouche ce
 *   jour-là (`1` = la casserole a suivi). Il vient de `sizeBoxesFromTarget`,
 *   qui est le seul à le connaître. ⛔ REQUIS, jamais `?`: un défaut à `1`
 *   ferait de « la casserole a suivi » la réponse silencieuse de tous les
 *   appelants, et le lot serait construit, branché, désarmé.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function unmetDemand(
  anchors: ReadonlyMap<string, AnchorFactor>,
  days: readonly MouthDayEnergy[],
  potShrink: ReadonlyMap<string, number>,
  /**
   * ⟳ 2026-09-06 — le servi ESTIMÉ des journées « bac commun seul », clé
   * `<memberId> <day>` (la clé des ancres) : Σ kcal des bacs de la journée
   * divisée par leurs mangeurs (`null` quand un bac est illisible), et le
   * BESOIN DES MOMENTS QUE CES BACS COUVRENT — pas la journée entière : un
   * petit-déjeuner mangé à table, sans boîte pour personne, n'est la dette
   * d'aucun bac (mesuré sur FC4 : la cible de journée faisait lire 18/18
   * journées sous le besoin là où les bacs étaient à 85–92 % de leurs moments).
   * Optionnel : sans lui, ces journées restent `not_anchored`, comme hier.
   */
  tubServed: ReadonlyMap<string, { servedKcal: number | null; wantedKcal: number }> = new Map(),
): UnmetDemand[] {
  const out: UnmetDemand[] = [];
  for (const day of days) {
    const key = `${day.memberId} ${day.day ?? ""}`;
    const anchor = anchors.get(key);
    if (
      anchor !== undefined && anchor.reason === "common_pot_day" && anchor.targetKcal !== null &&
      tubServed.has(key)
    ) {
      const tub = tubServed.get(key)!;
      const served = tub.servedKcal;
      out.push({
        memberId: day.memberId,
        day: day.day,
        wantedKcal: Math.round(tub.wantedKcal),
        servedKcal: served === null ? null : Math.round(served),
        unmetKcal: served === null ? null : Math.max(0, Math.round(tub.wantedKcal - served)),
        cause: "tub_estimate",
      });
      continue;
    }
    if (!anchor || anchor.targetKcal === null || anchor.raw === null) {
      out.push({
        memberId: day.memberId,
        day: day.day,
        wantedKcal: anchor?.targetKcal ?? null,
        servedKcal: null,
        unmetKcal: null,
        cause: "not_anchored",
      });
      continue;
    }
    const shrink = potShrink.get(key) ?? 1;
    // Ce que la part porte VRAIMENT: le livré, multiplié par le facteur
    // réellement appliqué, lui-même raboté par le récipient.
    const served = (anchor.deliveredKcal ?? 0) * anchor.factor * shrink;
    const clamped = anchor.raw !== anchor.factor;
    const potBit = shrink !== 1;
    const cause: UnmetCause = clamped && potBit
      ? "both"
      : clamped
      ? "factor_clamped"
      : potBit
      ? "pot_ceiling"
      : "none";
    out.push({
      memberId: day.memberId,
      day: day.day,
      wantedKcal: Math.round(anchor.targetKcal),
      servedKcal: Math.round(served),
      unmetKcal: Math.max(0, Math.round(anchor.targetKcal - served)),
      cause,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// LE BAC SE DIMENSIONNE SUR SES MANGEURS (A2, 2026-09-04)
// ---------------------------------------------------------------------------

/**
 * POURQUOI CE FACTEUR N'EST CELUI D'AUCUNE BOUCHE, ET DOIT EXISTER QUAND MÊME.
 *
 * ── ⛔ CE QUE v4 INTERDIT, ET QUE CE LOT NE FAIT PAS ──────────────────────
 * « JAMAIS UNE PART PAR PERSONNE DANS LE CONTENANT COMMUN. C'est très exactement
 * ce qui a tué v2 […] c'est la balance de retour à table. » Rien ici n'écrit un
 * gramme au nom de quelqu'un sur un couvercle partagé, et `dishSlices` continue
 * de rendre `common_pot` pour chacun de ses mangeurs, pour toujours.
 *
 * ── CE QUE CE LOT FAIT, ET QUI EST UNE AUTRE QUESTION ─────────────────────
 * « Combien faut-il DANS ce récipient pour que ceux qui y mangent soient
 * nourris » a une réponse, et elle n'est la portion de personne: c'est la SOMME
 * de ce que ses mangeurs doivent recevoir à ce moment-là. Le bac reste un bac —
 * un seul nombre sur un couvercle, qui ne vise personne.
 *
 * Sans ce facteur, le seul chemin absolu du produit (`anchorFactorFor`) est
 * muet sur la population majoritaire: 24 bouches sur 36 mesurées le 2026-08-22,
 * et six journées-bouche sur huit le 2026-09-03. Elles restaient dimensionnées
 * par la chaîne RELATIVE, « qui est un rapport et ne décide jamais du niveau ».
 *
 * ── ⛔ SUR LES MAINTENANCES, JAMAIS SUR LES ÉCARTS ────────────────────────
 * Une bouche à objectif qui mange dans un bac y compte pour son ENTRETIEN. Deux
 * raisons, et elles se répondent: v4 dit qu'« un objectif de poids ouvre une
 * portion millimétrée », donc l'écart s'exécute dans une boîte à un nom, pas
 * ici; et faire porter le déficit de l'une aux autres est le défaut « une
 * ceinture posée sur l'un retire à l'autre », par l'autre bout. FF-043 R14 dit
 * la même chose du corps de fiche: il n'achète qu'une maintenance.
 */
export const POT_REASONS = Object.freeze(
  [
    /** Le bac a été dimensionné sur la somme des besoins de ses mangeurs. */
    "pot_sized",
    /** Dimensionné, puis raboté par une borne (facteur ou masse). Compté. */
    "pot_clamped",
    /** Le plat n'a pas rendu son énergie: on ne divise pas par un inconnu. */
    "pot_incomplete",
    /** Une bouche du couvercle n'a pas de cible calculable. Fail-closed. */
    "pot_mouth_unknown",
    /** Le contenant ne pèse rien: aucun rapport n'est constructible. */
    "pot_empty",
  ] as const,
);
export type PotReason = (typeof POT_REASONS)[number];

export interface PotFactor {
  /** ⟳ ARBITRAGE 1 (2026-09-06) — la borne qui a décidé du facteur (`density`, `physical`, `assumed_density`, `factor_bound`, `none`). */
  capBit: MealCapBit;
  factor: number;
  /** Le facteur AVANT rabotage. `null` quand rien n'a été calculé. */
  raw: number | null;
  reason: PotReason;
}

/** Un mangeur de ce bac, et ce que sa journée porte. */
export interface PotEater {
  mouth: AnchorMouth;
  /**
   * ⟳ ARBITRAGE 3 (2026-09-06) — LE CRAN D'UNE NOTE DATÉE, PAR LE BAC. « Claire a
   * du sport le mardi soir » grossit sa part ce jour-là ; côté ancre (a5d1b636)
   * le cran est inerte pour une bouche qui mange en bac (`common_pot_day`,
   * 14/28 sur le quatre : `note_boost.applied 0`). Ici il entre dans la SOMME
   * des besoins du bac — sa part, pas celle des autres. `0` ou absent = rien.
   */
  noteBoost?: number;
  /** TOUS ses moments de ce jour-là (`MouthDayEnergy.slots`). Le dénominateur. */
  daySlots: readonly string[];
}

/**
 * DE COMBIEN CE BAC DOIT GROSSIR (OU MAIGRIR) POUR NOURRIR CEUX QUI Y MANGENT.
 *
 *     besoin  = Σ_mangeurs  part(ce moment) de son entretien de la journée
 *     livré   = ce que le récipient contient, en kcal
 *     facteur = besoin / livré, borné
 *
 * ⚠️ LE PARTAGE PAR MOMENT EST CELUI DE L'ANCRAGE, APPELÉ ET PAS RECOPIÉ
 * (`slotPlanTargets`). Une seconde arithmétique du même partage divergerait de
 * celle qui fait autorité au premier ajustement, et c'est le grammage de
 * quelqu'un qui se tromperait.
 *
 * ⚠️ LE PLAFOND DE MASSE EST LA SOMME DES CORPS. Huit grammes par kilo et par
 * repas, additionnés sur les mangeurs: un bac pour quatre peut légitimement
 * peser ce que quatre assiettes pèsent. Le lire sur un seul corps rendrait
 * l'inverse du défaut qu'il existe pour éviter.
 *
 * ⛔ FAIL-CLOSED, ET CHAQUE REFUS EST NOMMÉ. Une bouche sans cible fait
 * s'abstenir le bac ENTIER: servir la somme de trois besoins quand on n'en
 * connaît que deux, c'est sous-remplir en ayant l'air d'avoir calculé.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function potFactorFor(args: {
  slot: string | null;
  /** Ce que le récipient pèse. Le dénominateur du plafond de masse. */
  grams: number;
  /** Ce que le récipient porte, en kcal. `null` = illisible. */
  deliveredKcal: number | null;
  eaters: readonly PotEater[];
  coachCounting: CountingStance;
}): PotFactor {
  const nothing = (reason: PotReason): PotFactor => ({ factor: 1, raw: null, reason, capBit: "none" });
  if (args.slot === null) return nothing("pot_incomplete");
  if (args.eaters.length === 0) return nothing("pot_mouth_unknown");
  if (args.deliveredKcal === null || args.deliveredKcal <= 0) {
    return nothing("pot_incomplete");
  }
  if (!Number.isFinite(args.grams) || args.grams <= 0) return nothing("pot_empty");

  let needed = 0;
  let massCeilingGrams = 0;
  let anyFloor = false;
  let anyAssumed = false;
  for (const eater of args.eaters) {
    // ⛔ `direction: null` — L'ENTRETIEN, PAS LA CIBLE. Voir l'en-tête du bloc.
    const target = mouthTargetKcal({ ...eater.mouth, direction: null }, args.coachCounting);
    if (target.kcal === null) return nothing("pot_mouth_unknown");
    const shared = slotPlanTargets({
      targetKcal: target.kcal,
      coveredSlots: [args.slot],
      // ⟳ 2026-09-11 · LOT B — LE REPLI DES TROIS REPAS MANQUAIT ICI. Une
      // bouche qui n'a RIEN déclaré et dont la table ne sert qu'un moment ce
      // jour-là voyait sa journée entière ramenée sur ce seul moment: `whole`
      // valait le poids de ce moment, la part valait 1. C'est le défaut mesuré
      // du lot B (facteur 2,86 sur un dîner de vendredi), par un autre chemin.
      wholeSlots: wholeDaySlots(eater.mouth.declaredSlots, eater.daySlots),
      // ⛔ LA DEMANDE D'UNE CASSEROLE EST UN CALCUL DE TABLE, pas de personne
      // seule: elle additionne les parts de TOUS ses mangeurs. Le « repas
      // léger » n'est collecté qu'à une bouche (chemin `portion_v1`) et sa
      // généralisation est un chantier à part — voir `slotPlanTargets`.
      // `[]` + `null` rendent ce calcul octet-identique à celui d'avant le lot.
      lightSlots: [],
      slotFixedKcal: null,
    });
    const mealKcal = shared.bySlot.get(args.slot);
    // Un moment sans poids reconnu ne se réduit pas: on ne sait pas ce qu'il
    // vaut dans sa journée, donc on ne prétend pas le savoir pour la casserole.
    if (mealKcal === undefined || !(mealKcal > 0)) return nothing("pot_mouth_unknown");
    // ⟳ ARBITRAGE 3 — le cran de la note datée de CE mangeur, sur SA part.
    const boost = Number.isFinite(eater.noteBoost) && (eater.noteBoost ?? 0) > 0 ? (eater.noteBoost as number) : 0;
    needed += mealKcal * (1 + boost);
    // ⟳ 2026-09-04: le plafond de masse du bac est la somme de ce que porte le
    // besoin de chaque bouche — ⟳ ARBITRAGE 1 (2026-09-06) : à la densité
    // MESURÉE du bac (ce qu'il livre par gramme), bornée entre le plancher de
    // densité et 1,35 (`mealMassCapFor`, et pourquoi le kilo ne revient pas).
    // ⟳ ARBITRAGE 3 (suite, N3d) — le plafond VOIT le cran : borner le repas à
    // sa part sans le cran reprenait d'une main ce que la note donnait de l'autre
    // (3 bacs bornés `density` sur N3d). Même geste que 6f9385d3 côté ancre.
    const cap = mealMassCapFor({
      mealKcal: mealKcal * (1 + boost),
      deliveredKcal: args.deliveredKcal,
      deliveredGrams: args.grams,
    });
    if (cap.grams === null) return nothing("pot_mouth_unknown");
    massCeilingGrams += cap.grams;
    if (cap.source === "density_floor") anyFloor = true;
    if (cap.source === "assumed_density") anyAssumed = true;
  }
  if (!(needed > 0)) return nothing("pot_mouth_unknown");

  const raw = needed / args.deliveredKcal;
  const physicalMax = massCeilingGrams / args.grams;
  const bounded = Math.min(raw, physicalMax);
  const factor = bounded < ANCHOR_FACTOR_MIN
    ? ANCHOR_FACTOR_MIN
    : bounded > ANCHOR_FACTOR_MAX
    ? ANCHOR_FACTOR_MAX
    : bounded;
  // ⚠️ UN RABOTAGE SE COMPTE. Une borne qui mord sans qu'on le sache est une
  // borne qu'on croit inerte — et si elle mord sur la population entière, elle
  // n'est plus une borne de plausibilité, elle EST le calcul. Ce dépôt l'a
  // mesuré trois fois (`BOX_FACTOR_MIN`, `ANCHOR_FACTOR_MAX`).
  const capBit: MealCapBit = bounded !== raw
    ? (anyFloor ? "density_floor" : anyAssumed ? "assumed_density" : "density")
    : factor !== raw
    ? "factor_bound"
    : "none";
  return { factor, raw, reason: factor === raw ? "pot_sized" : "pot_clamped", capBit };
}

/** Ce qu'un repas prélève sur une casserole, réduit à ce qui compte ici. */
export interface PotDraw {
  /**
   * LES CONTENANTS DE CE REPAS, réduits à `<memberId> <day>` et à leur poids.
   *
   * ⚠️ CE TYPE EST **LOCAL**, ET IL SE RÉALIMENTE AU NIVEAU DU BAC (v4). Il ne
   * dépend d'aucune forme du parseur: un contenant à UN nom rend une entrée
   * (`key` = sa bouche, `grams` = ce que le bac pèse), et un bac COMMUN n'en
   * rend aucune — son poids n'est la demande de personne, et l'ancrage n'a
   * aucun facteur à lui appliquer. Le nom `shares` est resté; ce qu'il porte
   * est une demande par CONTENANT, plus une part par personne.
   */
  shares: readonly { key: string; grams: number }[];
  uses: readonly { preparationId: string; servings: number }[];
}

/**
 * DE COMBIEN CHAQUE CASSEROLE DEVRAIT GROSSIR pour que l'ancrage soit servi
 * sans rabot — le levier AMONT, calculé et **jamais appliqué**.
 *
 * `1` = elle suffit. `1,4` = il faudrait en produire 40 % de plus, donc acheter
 * 40 % de plus de ses ingrédients.
 *
 * ⚠️ LE PRORATA EST CELUI DE `sizeBoxesFromTarget`, ET IL N'EST PAS RÉÉCRIT ICI
 * — on répartit la demande d'un repas entre ses casseroles au prorata de ce
 * qu'il tire vraiment. Une seconde arithmétique du même partage divergerait de
 * celle qui fait autorité au premier ajustement, et c'est celle qu'on relit le
 * moins qui commanderait des courses fausses.
 *
 * ⛔ CE N'EST PAS UNE DÉCISION PRODUIT. Faire grossir une casserole change la
 * liste de courses de quelqu'un. Ce nombre existe pour que la mesure du fork
 * soit possible; le brancher est une décision qui se prend APRÈS elle.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function neededPotFactor(
  meals: readonly PotDraw[],
  /**
   * ⟳ 2026-09-04 — TYPE STRUCTUREL, RÉDUIT À CE QUE CETTE FONCTION LIT. Elle ne
   * regarde que `raw ?? factor`; exiger un `AnchorFactor` entier obligeait tout
   * appelant qui n'en a pas — la table des facteurs RÉSOLUS par contenant, par
   * exemple — à fabriquer un objet menteur ou à le forcer par un `as`. Et « `as`
   * sur un type étranger désarme le typecheck » est une cicatrice de ce dépôt.
   */
  anchors: ReadonlyMap<string, { raw: number | null; factor: number }>,
  /**
   * ⟳ 2026-09-05 — LA MASSE RÉELLE DU POT, quand elle est connue. Mesuré sur
   * C03 après le regram: le quinoa faisait ~3 900 g prêts et les boîtes en
   * tiraient 4 506 g DÈS LE DÉPART; le facteur, calculé sur les tirages
   * (« now »), ne grossissait le pot que du surplus d'ancrage, jamais de
   * l'écart initial — et le plafond de récipient rabotait ensuite les boîtes
   * sur 12 journées-bouche. Quand la masse est connue et positive, c'est
   * ELLE la base; sinon, les tirages, comme avant.
   */
  potMass: ReadonlyMap<string, number | null> = new Map(),
): Map<string, number> {
  /** Par casserole: ce qui est tiré aujourd'hui, et ce qui serait tiré ancré. */
  const now = new Map<string, number>();
  const wanted = new Map<string, number>();
  for (const meal of meals) {
    let gramsNow = 0;
    let gramsWanted = 0;
    for (const share of meal.shares) {
      const g = Number(share.grams);
      if (!Number.isFinite(g) || g <= 0) continue;
      gramsNow += g;
      // ⚠️ `raw`, PAS `factor`. La question posée est « de combien la casserole
      // devrait grossir pour que le rabot ne soit plus nécessaire »; utiliser le
      // facteur DÉJÀ raboté rendrait toujours 1 et le module ne dirait rien.
      const anchor = anchors.get(share.key);
      gramsWanted += g * (anchor?.raw ?? anchor?.factor ?? 1);
    }
    if (gramsNow <= 0 || meal.uses.length === 0) continue;
    // Le prorata: chaque casserole reçoit la part du repas qui vient d'elle.
    let servingsTotal = 0;
    for (const use of meal.uses) servingsTotal += Math.max(0, Number(use.servings) || 0);
    if (servingsTotal <= 0) continue;
    for (const use of meal.uses) {
      const w = Math.max(0, Number(use.servings) || 0) / servingsTotal;
      now.set(use.preparationId, (now.get(use.preparationId) ?? 0) + gramsNow * w);
      wanted.set(use.preparationId, (wanted.get(use.preparationId) ?? 0) + gramsWanted * w);
    }
  }
  const out = new Map<string, number>();
  for (const [id, drawn] of now) {
    if (drawn <= 0) continue;
    const mass = potMass.get(id) ?? null;
    const base = mass !== null && mass > 0 ? mass : drawn;
    out.set(id, (wanted.get(id) ?? drawn) / base);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-06 — LE MOMENT PERDU D'UNE BOUCHE EST COMPTÉ, PAS EFFACÉ
// ═══════════════════════════════════════════════════════════════════════════
//
// Mesuré (banc « un retour et les calories », 0f, FB3) : « Nora n'aime pas le
// yaourt de soja » → le modèle obéit, Nora n'a plus de collation, et sa CIBLE
// suit ses moments restants (`ownSlots`) : elle tombe à 44 % de son besoin
// (témoin 61 %) sans qu'aucun compteur ne la distingue. La réduction de la
// cible aux moments couverts est juste pour un plat que PERSONNE ne met en
// boîte (mangé à table, attribué à personne) ; elle est un silence quand la
// table sert ce moment aux autres et pas à elle.
//
// Ici on COMPTE : les moments que la table sert ce jour-là (un contenant chez
// n'importe qui) et que cette bouche n'a pas, valorisés sur sa cible PLEINE.
// Aucun dimensionnement ne change — grossir ses autres boîtes ou relancer
// sera une décision prise sur ce compteur, pas avant lui.
//
// PURE: no I/O, no clock, no randomness.
export function lostSlotEnergy(args: {
  mouth: AnchorMouth;
  coachCounting: CountingStance;
  /** Les moments où CETTE bouche a un contenant (à son nom ou en bac). */
  mySlots: readonly string[];
  /** Les moments où la table sert un contenant à quelqu'un, ce jour-là. */
  tableSlots: readonly string[];
}): { lostSlots: string[]; kcal: number | null } {
  const mine = new Set(args.mySlots);
  const lostSlots = [...new Set(args.tableSlots)].filter((s) => !mine.has(s)).sort();
  if (lostSlots.length === 0) return { lostSlots, kcal: 0 };
  const target = mouthTargetKcal({ ...args.mouth, direction: null }, args.coachCounting).kcal;
  if (target === null) return { lostSlots, kcal: null };
  const shared = slotPlanTargets({
    targetKcal: target,
    coveredSlots: lostSlots,
    wholeSlots: wholeDaySlots(args.mouth.declaredSlots, args.tableSlots),
    // Idem: l'énergie des moments que la table ne sert PAS à cette bouche se
    // compte sur le chemin legacy, octet-identique.
    lightSlots: [],
    slotFixedKcal: null,
  });
  return { lostSlots, kcal: Math.round(shared.total) };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-06 — LE RÉTRÉCISSEMENT SYMÉTRIQUE : UNE CASSEROLE QUE PERSONNE NE
// TIRE NE SE CUIT PAS
// ═══════════════════════════════════════════════════════════════════════════
//
// Banc « un retour et les calories » (0f, FC4) : après une exclusion de table,
// 21 boîtes ont sauté et la casserole de poulet (1 100 g, 6 parts) restait cuite
// et achetée pour quatre — `neededPotFactor` ne connaît que le sens « plus », et
// les courses ne suivent que si un pot a grossi. « Les courses et casseroles ne
// rétrécissent jamais après un retrait » était vrai, et c'était un défaut.
//
// La décision est ici, pure et comptée ; l'index l'applique aux ingrédients,
// aux citations, aux sessions et aux courses.
//   · un plat SANS boîte qui cite la casserole (mangé à table, attribué à
//     personne) la PROTÈGE : on ne rétrécit pas ce qu'on ne sait pas mesurer ;
//   · 0 tirage ⇒ facteur 0 : retirée ;
//   · tirage × marge sous (1 − tolérance) de la masse prête ⇒ facteur < 1 ;
//   · sinon rien — la casserole a raison d'avoir des restes.
//
// PURE: no I/O, no clock, no randomness.
export const POT_SHRINK_TOLERANCE = 0.15;

export type PotShrinkVerdict =
  | { factor: 0; reason: "removed" }
  | { factor: number; reason: "shrunk" }
  | { factor: 1; reason: "kept" | "unboxed_use" | "unreadable" };

export function potShrinkPlan(
  pots: readonly {
    id: string;
    /** Masse prête (`preparationReadyGrams`), `null` si illisible. */
    readyGrams: number | null;
    /** Ce que les boîtes lui tirent, en grammes, après ceinture, relance et recours. */
    drawnGrams: number;
    /** Nombre de plats SANS boîte qui la citent. */
    unboxedUses: number;
  }[],
  opts: { margin: number; tolerance?: number } ,
): Map<string, PotShrinkVerdict> {
  const tolerance = opts.tolerance ?? POT_SHRINK_TOLERANCE;
  const out = new Map<string, PotShrinkVerdict>();
  for (const pot of pots) {
    if (pot.unboxedUses > 0) {
      out.set(pot.id, { factor: 1, reason: "unboxed_use" });
      continue;
    }
    if (!(pot.drawnGrams > 0)) {
      out.set(pot.id, { factor: 0, reason: "removed" });
      continue;
    }
    if (pot.readyGrams === null || !(pot.readyGrams > 0)) {
      out.set(pot.id, { factor: 1, reason: "unreadable" });
      continue;
    }
    const wanted = pot.drawnGrams * opts.margin;
    if (wanted >= pot.readyGrams * (1 - tolerance)) {
      out.set(pot.id, { factor: 1, reason: "kept" });
      continue;
    }
    out.set(pot.id, { factor: wanted / pot.readyGrams, reason: "shrunk" });
  }
  return out;
}
