/**
 * QUEL GÉNÉRATEUR, ET C'EST UN FAIT — PAS UNE BRANCHE RECOPIÉE.
 *
 * ── LA RÈGLE, EXTRAITE DE `SetupPage.tsx` ─────────────────────────────────
 * `generate-household-meal-v1` si le foyer a AU MOINS DEUX bouches ET que je
 * suis le maître; sinon `generate-meal-v1`.
 *
 * ── POURQUOI ELLE VIT DANS UN MODULE, MAINTENANT ──────────────────────────
 * Elle n'avait qu'un seul appelant tant que le couloir d'entrée était le seul
 * endroit où l'on composait. `/app/plan` accueille désormais la demande POUR
 * TOUT LE MONDE, maître compris: la règle a deux appelants, et deux copies
 * d'une règle de routage divergent — celle qui se trompe envoie un maître sur
 * le générateur individuel, c'est-à-dire trente secondes d'attente, un appel
 * modèle PAYÉ, et rien à l'écran (`cookedPlans` masque le plan personnel
 * derrière la ligne `household`).
 *
 * ⚠️ `isOwner` EST LA MOITIÉ DU ROUTAGE, pas une précaution.
 * `generate-household-meal-v1` rend 403 `not_owner` à un secondaire — et c'est
 * voulu: son plan à lui est PERSONNEL (D2 du modèle foyer). Router sur le seul
 * nombre de bouches enverrait toute personne ayant réclamé son profil droit
 * dans un refus que rien ne peut fermer.
 *
 * ⚠️ LE COMPTE DE BOUCHES INCLUT LE MAÎTRE. La liste des bouches d'un foyer ne
 * contient PAS la ligne du maître: l'appelant historique écrit
 * `fresh.mouths.length + (fresh.householdId ? 1 : 0)`. D'où `otherMouths` —
 * nommé pour ce qu'il est, « les bouches AUTRES que moi », plutôt qu'un
 * `mouthCount` que chaque appelant recalculerait à sa façon. Un foyer de deux
 * personnes parti sur le générateur individuel est exactement le défaut que ce
 * nom empêche.
 *
 * ⚠️ AUCUN PARAMÈTRE OPTIONNEL. Un appelant qui ne sait pas s'il est maître ne
 * doit pas hériter de `false`: `false` est une AFFIRMATION. Sept paramètres
 * optionnels ont déjà été des gardes désarmées dans ce dépôt.
 *
 * PURE. Aucune I/O, aucune horloge, aucun `t()`, AUCUN IMPORT D'i18n — et ce
 * dernier point est une contrainte de couture, pas une élégance: le scanner de
 * `i18n/pageSeams.int.test.ts` suit les IMPORTS, pas les appels. Poser cette
 * fonction dans `api/onboarding.ts` (qui importe `../copy/allergens`, 13
 * littéraux `allergen.*`) ferait entrer `allergen` dans le périmètre de
 * `/app/plan`, qui ne le déclare pas. D'où ce fichier, sans aucun import.
 */

export type PlanGenerator = "household" | "personal";

export function chooseGenerator(place: {
  /** Suis-je dans un foyer ? REQUIS. */
  inHousehold: boolean;
  /** Suis-je le maître ? REQUIS. `false` est une affirmation, pas un défaut. */
  isOwner: boolean;
  /**
   * Le nombre de bouches AUTRES que le maître. REQUIS.
   * `0` dit « personne d'autre »; ce n'est pas la même chose qu'un foyer non lu,
   * qui se dit par `inHousehold: false`.
   */
  otherMouths: number;
}): PlanGenerator {
  // L'ORDRE DES TROIS CONDITIONS N'EST PAS INDIFFÉRENT. `inHousehold` d'abord:
  // un `isOwner: true` sur un compte sans foyer est un état INCOHÉRENT, et la
  // direction sûre est le générateur individuel — celui qui ne peut pas rendre
  // `no_household`.
  if (!place.inHousehold) return "personal";
  if (!place.isOwner) return "personal";
  // « Au moins deux bouches » = moi + au moins une autre. Un foyer commencé
  // puis laissé à une seule bouche compose comme un solo, et c'est juste: il
  // n'y a pas de table à arbitrer.
  return place.otherMouths >= 1 ? "household" : "personal";
}
