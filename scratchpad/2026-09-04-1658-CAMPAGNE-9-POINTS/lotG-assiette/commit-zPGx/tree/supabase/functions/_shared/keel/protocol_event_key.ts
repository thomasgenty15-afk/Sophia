/**
 * L'IDENTITÉ D'UN COMPOSANT DE REPAS — une seule implémentation, deux fonctions
 * edge.
 *
 * La clé vivait dans `sophia-brain/tools/always_on/log_protocol_event/contract.ts`,
 * où seule la lane texte pouvait l'atteindre: chaque fonction edge se bundle
 * séparément et `_shared` est la seule racine partageable. Le flow de précision
 * a besoin de la MÊME clé côté photo (`meal-photo-upload-v1`) pour interdire à
 * une réponse de réécrire un aliment déjà enregistré.
 *
 * Deux copies de cette règle seraient deux réponses différentes à « est-ce le
 * même aliment ? », et la divergence serait silencieuse: elle ne produirait ni
 * erreur ni log, juste un doublon de temps en temps. D'où ce module.
 */

/**
 * The discriminant that lets one message carry several facts, and the reason
 * this is one exported function rather than a template literal at the call
 * site: the WRITE and any later read of these rows must agree on it exactly.
 *
 * It is built from the item's IDENTITY, in a fixed field order, never from its
 * index in the array. Two consequences, both wanted:
 *  - a retry that lists the same foods in another order produces the same keys,
 *    so the partial unique index reports `already_logged` and no duplicate fact
 *    is appended (`protocol_events` is APPEND-ONLY: a duplicate cannot be taken
 *    back from the chat, and it would double-count a `serving` target);
 *  - two components with the same identity ("broccoli and cauliflower" — one
 *    slug, `cruciferous_veg`) collapse to one key. The closed vocabulary cannot
 *    tell them apart, so the honest count is one fact, not two.
 */
export function protocolEventComponentKey(component: {
  food_group_ref: string | null;
  substance_ref: string | null;
  commitment_id: string | null;
}): string {
  const parts: string[] = [];
  if (component.food_group_ref) {
    parts.push(`food_group:${component.food_group_ref}`);
  }
  if (component.substance_ref) parts.push(`substance:${component.substance_ref}`);
  if (component.commitment_id) parts.push(`commitment:${component.commitment_id}`);
  // A fact with no structured identity (a slot and a note) is still a fact, and
  // there can only be one of it per message.
  return parts.length > 0 ? parts.join("+") : "item";
}
