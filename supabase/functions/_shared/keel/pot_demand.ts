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

import type { AnchorFactor } from "./mouth_anchor.ts";
import type { MouthDayEnergy } from "./mouth_energy.ts";

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
): UnmetDemand[] {
  const out: UnmetDemand[] = [];
  for (const day of days) {
    const key = `${day.memberId} ${day.day ?? ""}`;
    const anchor = anchors.get(key);
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
  anchors: ReadonlyMap<string, AnchorFactor>,
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
  for (const [id, base] of now) {
    if (base <= 0) continue;
    out.set(id, (wanted.get(id) ?? base) / base);
  }
  return out;
}
