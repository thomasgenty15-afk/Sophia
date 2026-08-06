/**
 * COCHER UN REPAS DU PLAN — et pouvoir le décocher.
 *
 * CE QU'UNE COCHE EST, ET OÙ ELLE VA
 * ----------------------------------
 * « J'ai mangé le dîner prévu » est un FAIT, pas un état d'interface. Il va donc
 * là où vont les faits: `protocol_events`, avec `source='quick_tap'` — une
 * valeur qui existait déjà dans le vocabulaire fermé, et dont
 * `evidenceWeightForSource` dit qu'elle pèse 0.4. C'est le geste le moins cher
 * du produit, et il est noté comme tel: une tape n'est pas une photo.
 *
 * CE QU'ELLE NE PRÉTEND PAS. Aucun `food_group_ref`, aucun `substance_ref`. Un
 * plat généré porte des ingrédients en prose, pas des jetons du vocabulaire
 * fermé, et les mapper serait une déduction. La règle conservatrice de
 * `evaluator.ts` s'applique donc: sans référence structurée, ce fait ne crédite
 * AUCUNE ligne du plan. Il compte pour la COUVERTURE — « cet élève rapporte ce
 * qu'il mange » — et rien d'autre. C'est exactement ce qu'une case cochée
 * prouve.
 *
 * DÉCOCHER, SANS VIOLER L'APPEND-ONLY
 * -----------------------------------
 * `protocol_events` ne se supprime pas: une ligne effacée depuis l'écran est un
 * fait qu'on ne peut pas récupérer, et le dépôt l'a écrit noir sur blanc. Mais
 * le schéma porte déjà le bon outil: `disqualified_reason = 'food_not_eaten'`,
 * dont le commentaire de migration dit « de la nourriture, mais pas une assiette
 * servie ». Une coche retirée, c'est littéralement ça.
 *
 *   cocher    -> insert (ou on ré-arme la ligne existante)
 *   décocher  -> disqualified_reason = 'food_not_eaten'
 *   recocher  -> disqualified_reason = null
 *
 * La ligne survit à tous les allers-retours, et tout lecteur qui COMPTE filtre
 * déjà sur `disqualified_reason IS NULL` (migration 20260804160000).
 *
 * PURE MODULE: la clé et rien d'autre. L'écriture appartient à l'appelant.
 */

/**
 * L'IDENTITÉ D'UNE COCHE, et c'est elle qui rend le geste idempotent.
 *
 * Elle passe par `source_message_id`, dont l'index unique partiel
 * `(user_id, source_message_id)` existe déjà. Deux tapes sur la même case ne
 * font donc qu'UNE ligne — arbitré par Postgres, pas par un « ai-je déjà
 * cliqué ? » côté navigateur qui court contre lui-même sur un double tap.
 *
 * Elle est bâtie sur la POSITION dans le plan généré (`meal_id` + index), pas
 * sur le titre du plat: deux jours peuvent porter le même plat en lot, et les
 * cocher doivent rester deux gestes distincts.
 */
export function mealTickKey(generatedMealId: string, dishIndex: number): string {
  const id = String(generatedMealId ?? "").trim();
  if (!id) throw new Error("[keel/meal_tick] empty generated meal id (R7)");
  if (!Number.isInteger(dishIndex) || dishIndex < 0) {
    throw new Error(
      `[keel/meal_tick] dish index must be a non-negative integer, got ${dishIndex}`,
    );
  }
  return `meal_tick:${id}:${dishIndex}`;
}

/** Le préfixe que `mealTickKey` produit. Une seule définition. */
export const MEAL_TICK_PREFIX = "meal_tick:";

/**
 * La clé, relue: de quel PLAN et de quel plat cette coche parle-t-elle.
 *
 * ── POURQUOI ÇA REMPLACE `startsWith("meal_tick:")` ───────────────────────
 * Tant qu'un élève n'avait qu'un plan, tester le préfixe suffisait: toutes les
 * coches venaient forcément de lui. Depuis qu'un plan COURANT et un plan
 * SUIVANT coexistent, les coches des deux portent le même préfixe — et un
 * numérateur qui les additionne face à un dénominateur venu d'un seul plan
 * produit « 5 des 3 ». Le ratio dépasse 100 % dans le message du soir, et rien
 * ne le signale.
 *
 * Rend `null` sur ce qui n'est pas une clé de coche, plutôt que de deviner: une
 * clé mal formée est un fait qu'on ne sait pas rattacher, pas un fait à
 * rattacher au hasard.
 */
export function parseMealTickKey(
  key: unknown,
): { mealId: string; dishIndex: number } | null {
  const raw = String(key ?? "");
  if (!raw.startsWith(MEAL_TICK_PREFIX)) return null;
  const rest = raw.slice(MEAL_TICK_PREFIX.length);
  const at = rest.lastIndexOf(":");
  if (at <= 0) return null;
  const mealId = rest.slice(0, at);
  const dishIndex = Number(rest.slice(at + 1));
  if (!mealId || !Number.isInteger(dishIndex) || dishIndex < 0) return null;
  return { mealId, dishIndex };
}

/** Le motif porté par une coche RETIRÉE. Valeur du CHECK de la table. */
export const MEAL_UNTICK_REASON = "food_not_eaten" as const;
