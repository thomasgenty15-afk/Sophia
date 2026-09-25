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

/** Une session dont un plat tire au moins un lot, résolue pour l'écran. */
export interface DishSessionView {
  /** Le jeton de jour de la session (`wed`, `sat`…). L'écran le traduit. */
  day: string;
  /**
   * LES LOTS DE CE PLAT CUITS DANS CETTE SESSION, dans l'ordre du plat. C'est
   * la réponse à « Quelles cuissons ? ».
   *
   * ⚠️ `id` N'EST JAMAIS AFFICHÉ — un slug de lot ne veut rien dire à table —
   * mais l'écran le pose en `data-preparation-id`: la jointure plat → session
   * se lit dans le DOM sans relire le code.
   */
  dishPreparations: { id: string; title: string }[];
  /**
   * Les AUTRES préparations de la même session, dans son ordre: « le poulet,
   * le riz et les légumes sont sortis de la même casserolée ».
   */
  alsoMade: string[];
}

/**
 * ⟳ 2026-09-25 — TOUTES LES SESSIONS D'UN PLAT, PLUS SEULEMENT LA PREMIÈRE.
 *
 * La carte portait un dépliant « La session de cuisine » qui ne nommait que la
 * session du premier lot cité. Il est devenu un bouton « Quelles cuissons ? »
 * qui ouvre une bulle: une bulle a la place de lister deux sessions quand le
 * plat tire le riz du mercredi et le poulet du samedi.
 *
 * `[]` pour un plat cuisiné de zéro: pas de lot, pas de session, pas de bouton.
 *
 * ⚠️ LES `id` INCONNUS SONT ÉCARTÉS, PAS RENDUS TELS QUELS. Un lot absent de
 * `preparations` (plan tronqué, donnée ancienne) ne s'affiche pas en slug; un
 * lot qu'aucune session ne revendique ne fabrique pas de session.
 */
export function sessionsForDish(
  dish: Pick<GeneratedDish, "uses">,
  sessions: readonly CookingSession[],
  preparations: readonly Pick<MealPreparation, "id" | "title">[],
): DishSessionView[] {
  const titleOf = (id: string) => preparations.find((p) => p.id === id)?.title ?? "";
  const usedIds = new Set(dish.uses.map((u) => u.preparation_id));
  const views: { session: CookingSession; view: DishSessionView }[] = [];
  for (const use of dish.uses) {
    const session = sessions.find((s) => s.preparation_ids.includes(use.preparation_id));
    const title = titleOf(use.preparation_id);
    if (!session || title === "") continue;
    let entry = views.find((v) => v.session === session);
    if (!entry) {
      entry = {
        session,
        view: {
          day: session.day,
          dishPreparations: [],
          alsoMade: session.preparation_ids
            .filter((id) => !usedIds.has(id))
            .map(titleOf)
            .filter((t) => t !== ""),
        },
      };
      views.push(entry);
    }
    if (!entry.view.dishPreparations.some((p) => p.id === use.preparation_id)) {
      entry.view.dishPreparations.push({ id: use.preparation_id, title });
    }
  }
  return views.map((v) => v.view);
}
