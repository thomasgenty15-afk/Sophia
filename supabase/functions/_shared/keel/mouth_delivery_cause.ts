/**
 * L-anchor-nodelivery — POURQUOI UNE JOURNÉE-BOUCHE NE LIVRE AUCUNE ÉNERGIE.
 *
 * Chantier: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche
 * `L-anchor-nodelivery`.
 *
 * ── LE DÉFAUT QUE CE MODULE NOMME, ET QU'IL NE CORRIGE PAS ────────────────
 * `anchorFactorFor` (`mouth_anchor.ts:636`) porte une seule sortie pour six
 * situations qui ne se réparent pas au même endroit:
 *
 *     if (day === null || day.kcal === null || day.kcal <= 0) → "no_delivery"
 *
 * ⛔ ET ELLE EST LUE **AVANT** `day_incomplete`. Une journée dont TOUS les
 * plats sont illisibles sort donc `no_delivery`, pendant qu'une journée dont un
 * seul l'est sort `day_incomplete` — le motif le plus grave porte le nom le
 * plus vague, et il efface les `gaps` que `mouthDayEnergy` avait pris la peine
 * de nommer. C'est le « zéro ambigu » de ce dépôt, pour la dixième fois.
 *
 * ⚠️ CE MODULE NE CHANGE AUCUN VERDICT. Il ne s'insère pas dans la chaîne de
 * dimensionnement, ne déplace pas un gramme, et `anchorFactorFor` ne l'importe
 * pas. Il rend LISIBLE ce que `no_delivery` recouvre, pour que le compteur du
 * chantier puisse dire lesquels de ces silences sont JUSTES.
 *
 * ── POURQUOI UN MODULE À PART, ET PAS UN `switch` DANS LE COMPTEUR ────────
 * Parce qu'un compteur qui porte sa propre règle de classement n'est pas
 * réfutable: il rend toujours ce qu'il a décidé de rendre. Ici la règle est
 * pure, exportée, et une épreuve unitaire la tient plat par plat — c'est la
 * seule forme sous laquelle une mutation peut la tuer.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import type { MouthDayEnergy, MouthEnergyGap } from "./mouth_energy.ts";

/**
 * LES SEPT SITUATIONS QUE `no_delivery` CONFOND, plus celle qui livre.
 *
 * ⛔ VOCABULAIRE FERMÉ. Un huitième cas ajouté ici DOIT porter son verdict
 * dans `DELIVERY_CAUSE_VERDICT` — le type l'y oblige, et c'est exprès.
 */
export const DELIVERY_CAUSES = Object.freeze(
  [
    /**
     * La journée rend un chiffre: l'ancrage a de quoi calculer. Le seul cas où
     * `anchorFactorFor` dépasse la ligne 604.
     */
    "delivered",
    /**
     * ⛔ AUCUNE LIGNE POUR CE COUPLE. `mouthDayEnergy` n'en produit que pour les
     * bouches NOMMÉES sur un contenant; une bouche absente ce jour-là n'a donc
     * pas de ligne du tout.
     *
     * ⚠️ ET C'EST LE POINT LE PLUS MAL COMPRIS DE LA FICHE: `householdAnchors`
     * itère sur les LIGNES (`mouth_anchor.ts:757`). Un couple sans ligne
     * n'atteint jamais `anchorFactorFor`, **n'entre dans aucun seau**, et la
     * branche `day === null` de la ligne 604 est donc INATTEIGNABLE par la
     * production. Ce cas existe ici pour être COMPTÉ à côté des seaux, jamais
     * dedans.
     */
    "no_row",
    /**
     * Toutes ses parts sortent d'un bac à plusieurs noms. Ses grammes décrivent
     * un récipient, pas une assiette (v4) — il n'y a rien à savoir.
     */
    "common_pot_only",
    /**
     * `dishEnergy` s'est abstenu sur **tous** ses plats: terme inconnu, ou
     * quantité non pesée. C'est la famille de `L-1` / `L17`.
     */
    "unreadable_dishes_only",
    /** Ses contenants existent et ne pèsent rien. Aucune fraction calculable. */
    "empty_box_only",
    /**
     * Plusieurs lacunes se cumulent, et aucune ne suffit seule à expliquer le
     * silence. Le compteur rend l'ensemble exact des `gaps` à côté.
     */
    "mixed_gaps",
    /**
     * ⚠️ DES PLATS ONT ÉTÉ COMPTÉS, ET LE TOTAL TOMBE À ZÉRO. `day.kcal <= 0`
     * mord alors sur une journée qui a bel et bien été lue. C'est rare et ce
     * n'est pas un silence: c'est un chiffre faux.
     */
    "zero_kcal",
  ] as const,
);
export type DeliveryCause = (typeof DELIVERY_CAUSES)[number];

/**
 * CE QUE CHAQUE CAUSE VAUT — `juste`, `defaut`, ou `n/a`.
 *
 * ⛔ C'EST UN JUGEMENT, ET IL EST ÉCRIT ICI POUR ÊTRE CONTREDIT. Un compteur
 * qui rangerait les sept causes en « bon » et « mauvais » sans exposer sa règle
 * ne serait pas relisible. Chaque verdict porte sa raison au-dessus.
 *
 *   `juste`  — le silence est VOULU par le modèle produit. Le réparer
 *              fabriquerait un nombre que rien ne soutient.
 *   `defaut` — le silence n'est voulu par personne. Il a une réparation, et
 *              elle est nommée dans la fiche.
 */
export const DELIVERY_CAUSE_VERDICT: Readonly<
  Record<DeliveryCause, "juste" | "defaut" | "n/a">
> = Object.freeze({
  /** Elle livre. Aucun verdict à rendre. */
  delivered: "n/a",
  /**
   * ⛔ JUSTE, ET C'EST LA DÉCOUVERTE. Le plan ne compose rien pour elle ce
   * jour-là — le cas de Yanis, absent le mercredi midi ET soir. Forcer un
   * chiffre ici obligerait le moteur à inventer un repas pour quelqu'un qui
   * n'est pas à table.
   *
   * ⚠️ « Juste » NE VEUT PAS DIRE « sans conséquence »: ces couples ne sont
   * comptés NULLE PART, et un lot qui viserait le seau `no_delivery` sans les
   * voir mesurerait un dénominateur amputé.
   */
  no_row: "juste",
  /**
   * JUSTE. `mouth_energy.ts` l'écrit noir sur blanc: diviser le bac par le
   * nombre de mangeurs ferait revenir la division que v3 et v4 existent pour
   * supprimer, et le nombre aurait l'air personnel alors qu'il ne l'est pas.
   */
  common_pot_only: "juste",
  /**
   * DÉFAUT. La bouche a bien une assiette à son nom; c'est le référentiel ou
   * la pesée qui n'a pas su la lire. Réparation: `L-1`, `L-1-b`, `L17`.
   */
  unreadable_dishes_only: "defaut",
  /** DÉFAUT. Un contenant à zéro gramme est une prescription vide. */
  empty_box_only: "defaut",
  /**
   * DÉFAUT — au moins une de ses composantes en est un. Le détail des `gaps`
   * est rendu à côté par le compteur, jamais fondu dans cette seule étiquette.
   */
  mixed_gaps: "defaut",
  /** DÉFAUT. Une journée lue qui rend 0 kcal est un chiffre faux, pas un vide. */
  zero_kcal: "defaut",
});

/**
 * LA CAUSE D'UN COUPLE BOUCHE-JOUR.
 *
 * ⛔ `day` PEUT ÊTRE `null` ET LE `null` A UN SENS PROPRE (`no_row`). C'est la
 * seule façon de compter la population que `householdAnchors` ne voit pas: son
 * appelant lui passe le produit cartésien bouche × jour, pas la liste des
 * lignes.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function deliveryCauseOf(day: MouthDayEnergy | null): DeliveryCause {
  if (day === null) return "no_row";
  // ⚠️ LA MÊME EXPRESSION QUE `mouth_anchor.ts:604`, DANS LE MÊME ORDRE. Si
  // elle change là-bas, ce module doit devenir faux de façon visible — c'est
  // pour ça qu'elle est recopiée telle quelle et pas approximée.
  if (day.kcal === null) return causeOfSilence(day.gaps);
  if (day.kcal <= 0) return "zero_kcal";
  return "delivered";
}

/**
 * ⛔ `no_box` N'EST JAMAIS UNE CAUSE DE SILENCE, ET C'EST MESURÉ.
 *
 * `mouthDayEnergy` le pose APRÈS coup sur TOUTES les lignes du jour (`:395`),
 * pour dire qu'un plat n'a été attribué à personne. Il ne retire aucun kcal à
 * la bouche qui le porte. Le compter comme une cause ferait passer toute
 * journée du corpus en `mixed_gaps` et effacerait les six autres.
 */
function causeOfSilence(gaps: readonly MouthEnergyGap[]): DeliveryCause {
  const blocking = gaps.filter((g) => g !== "no_box");
  if (blocking.length === 0) {
    // Aucune lacune bloquante et pourtant aucun kcal: la bouche n'a que des
    // plats sans contenant. Elle est sur la ligne par un `no_box` seul.
    return "mixed_gaps";
  }
  if (blocking.length > 1) return "mixed_gaps";
  switch (blocking[0]) {
    case "common_pot":
      return "common_pot_only";
    case "dish_incomplete":
      return "unreadable_dishes_only";
    case "empty_box":
      return "empty_box_only";
    default:
      return "mixed_gaps";
  }
}

/**
 * L'ENSEMBLE EXACT DES LACUNES, en jeton stable et trié — la clé d'histogramme
 * du compteur. `«aucune»` quand la ligne n'en porte pas.
 *
 * ⚠️ `no_box` EST GARDÉ ICI, contrairement à `causeOfSilence`. L'étiquette dit
 * la cause; cette clé-ci dit ce que la ligne portait vraiment, et les deux ne
 * répondent pas à la même question.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function gapKeyOf(day: MouthDayEnergy): string {
  if (day.gaps.length === 0) return "«aucune»";
  return [...day.gaps].sort().join("+");
}
