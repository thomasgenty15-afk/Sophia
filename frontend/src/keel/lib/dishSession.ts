import type {
  CookingSession,
  GeneratedDish,
  MealPreparation,
} from "../api/mealGeneration";

/**
 * LE PLAT ET LA SESSION QUI A FAIT SON LOT — le chemin existait, l'écran non.
 *
 * ── LE CHEMIN, EN ENTIER, ET IL EST DÉJÀ DANS LA DONNÉE ───────────────────
 *
 *     dish.uses[].preparation_id
 *        → cooking_sessions[].preparation_ids
 *
 * Rien à calculer, rien à demander au modèle: deux tableaux d'identifiants qui
 * se répondent depuis toujours, et qui ne se rencontraient nulle part à
 * l'écran. « Tes sessions de cuisine » porte les grosses cuissons sans dire
 * quel plat en sort; la carte du plat dit d'où vient son lot (`sources`) sans
 * dire dans quelle session il a été fait. Le lien manquait des deux côtés.
 *
 * ── ⛔ LA PRÉPARATION EST ATTACHÉE AU PLAT, JAMAIS À LA PERSONNE ──────────
 * C'est la formulation exacte, et elle règle les deux cas d'un coup:
 *
 *   · MÊME PLAT, DEUX PERSONNES ⇒ UNE préparation. On réchauffe une fois, on
 *     tranche une fois. Ce qui diffère est la PART (`member_portions`), pas le
 *     geste. Écrire « réchauffe 10 min » deux fois avec deux quantités
 *     transformerait une cuisine en service à la carte — le contraire du
 *     produit, dont l'unité est la session de cuisson PARTAGÉE.
 *   · DEUX PLATS DIFFÉRENTS ⇒ deux préparations, MÉCANIQUEMENT, parce qu'il y
 *     a deux plats. Ce n'est pas une individualisation: c'est un plat qui
 *     porte son geste, comme tous les autres.
 *
 * Ce module ne prend donc AUCUN membre en entrée, et c'est structurel: il n'a
 * pas de champ où une personne pourrait entrer.
 *
 * ── ⛔ AUCUNE DURÉE N'EST RÉSOLUE ICI, ET C'EST UNE GARDE ─────────────────
 * `active_minutes` et `total_minutes` vivent sur les PRÉPARATIONS et sur la
 * SESSION, pas sur les plats. Les remonter jusqu'à la carte d'un plat
 * donnerait à un ASSEMBLAGE le temps d'une CUISSON — « réchauffe une portion »
 * annoncé à 50 minutes. Les deux temps ont déjà leur surface, « tes sessions
 * de cuisine », et c'est là qu'ils se lisent pour planifier.
 *
 * PURE MODULE: aucune I/O, aucune horloge, aucun aléa, aucun `t()`.
 */

/** La session dont un plat tire son lot, résolue pour l'écran. */
export interface DishSessionView {
  /** Le jeton de jour de la session (`wed`, `sat`…). L'écran le traduit. */
  day: string;
  /** Le déroulé de la session, tel que le modèle l'a écrit. */
  runThrough: string;
  /**
   * Les titres des préparations faites DANS cette session, dans son ordre.
   * C'est ce que le plat n'avait nulle part: « le poulet, le riz et les
   * légumes sont sortis de la même casserolée ».
   */
  preparations: string[];
  /**
   * ⚠️ L'IDENTIFIANT QUI A FAIT LE LIEN, GARDÉ ET JAMAIS AFFICHÉ.
   *
   * Il ne sert pas à l'écran — un slug de lot ne veut rien dire à table — mais
   * il rend la jointure AUDITABLE: l'écran le pose en `data-preparation-id`,
   * donc « quelle préparation a relié ce plat à cette session » se lit dans le
   * DOM sans relire le code. Une jointure invisible est une jointure qu'on ne
   * sait pas prouver juste.
   */
  viaPreparationId: string;
}

/**
 * LA SESSION D'UN PLAT — ou `null`, et `null` est le cas COURANT.
 *
 * `null` pour un plat cuisiné de zéro: il n'a pas de lot, donc pas de session,
 * et son bouton ne doit pas exister. Un bouton qui ouvre un vide est pire que
 * pas de bouton.
 *
 * ⚠️ LA PREMIÈRE SESSION QUI CONTIENT UN DES LOTS DU PLAT, dans l'ordre du
 * PLAT. Un plat qui puise dans trois lots cuits dans DEUX sessions existe (le
 * riz du mercredi, le poulet du samedi); en nommer deux sous un plat ferait de
 * la carte une liste de sessions, ce que « discret par défaut » interdit. On
 * nomme celle du premier lot cité, qui est l'ordre dans lequel le modèle a
 * écrit le plat.
 */
export function sessionForDish(
  dish: Pick<GeneratedDish, "uses">,
  sessions: readonly CookingSession[],
  preparations: readonly Pick<MealPreparation, "id" | "title">[],
): DishSessionView | null {
  for (const use of dish.uses) {
    const session = sessions.find((s) => s.preparation_ids.includes(use.preparation_id));
    if (!session) continue;
    return {
      day: session.day,
      runThrough: session.run_through,
      // ⚠️ LES `id` INCONNUS SONT ÉCARTÉS, PAS RENDUS TELS QUELS. Une session
      // peut citer un lot absent de `preparations` (plan tronqué, donnée
      // ancienne): afficher `prep_chicken_bowls` à table ne veut rien dire.
      preparations: session.preparation_ids
        .map((id) => preparations.find((p) => p.id === id)?.title ?? "")
        .filter((title) => title !== ""),
      viaPreparationId: use.preparation_id,
    };
  }
  return null;
}
