import { EATING_OCCASIONS, type EatingOccasion } from "../api/mealGeneration";

/**
 * LES MOMENTS SUR LESQUELS ON INTERROGE QUELQU'UN — la cascade, en un endroit.
 *
 * ── LE DÉFAUT QUE CETTE FONCTION FERME ────────────────────────────────────
 * La fenêtre des préférences rendait les SIX créneaux en dur. Signalé capture à
 * l'appui le 2026-08-19: « par défaut on a mis les 6 plages et ça n'a pas de
 * sens pour une personne qui indique qu'elle mange que 2 fois par jour ». On
 * demandait donc ce que quelqu'un mange à quatre moments dont il venait de dire
 * qu'ils n'existent pas — et un champ laissé vide se lit alors comme un oubli,
 * pas comme une réponse.
 *
 * ── LA CASCADE EST CELLE DU MOTEUR, PAS UNE RÈGLE D'ÉCRAN ─────────────────
 * `null` sur la ligne d'une bouche ne veut pas dire « on ne sait pas »: il veut
 * dire « aux moments de la maison ». Le repli est donc le rythme du foyer,
 * celui-là même avec lequel la composition tourne — l'écran propose ce qui sera
 * servi, et rien d'autre.
 *
 * ⚠️ ET LE DERNIER REPLI EST LES SIX, PAS LE VIDE. Une maison qui n'a pas
 * encore répondu ne mange pas « jamais »: rendre `[]` ferait disparaître la
 * section entière sur un compte neuf, c'est-à-dire cacher la question à la
 * seule personne qui ne l'a jamais vue.
 *
 * ⚠️ TROISIÈME COPIE ÉVITÉE. La même cascade était écrite à la main dans
 * `HouseholdPage` (`habitSlots`), dans `MealBuilder` et dans `SetupPage`. Trois
 * arithmétiques du même repli divergent au premier ajustement, et c'est
 * l'utilisateur qui mesure l'écart.
 *
 * @param memberSlots ce que la bouche a dit d'elle-même, ou `null` (« comme la
 *                    maison »). La TAILLE de la part ne sert pas ici — on liste
 *                    des moments, pas des portions —, mais elle voyage avec le
 *                    moment depuis le 2026-08-14, d'où le `{ slot }`.
 * @param houseRhythm le rythme du foyer, tel qu'il a été lu. Vide = pas répondu.
 */
export function habitSlotsFor(
  memberSlots: readonly { slot: string }[] | null | undefined,
  houseRhythm: readonly { slot: string }[] | null | undefined,
): EatingOccasion[] {
  const own = memberSlots ?? null;
  const house = houseRhythm ?? [];
  const raw = (own !== null && own.length > 0 ? own : house).map((r) => r.slot);
  if (raw.length === 0) return [...EATING_OCCASIONS];
  // Le vocabulaire fermé du moteur, et l'ORDRE DE LA JOURNÉE. Un jeton inconnu
  // s'écarte plutôt que de fabriquer une ligne qu'on ne saurait pas nommer à
  // l'écran — et l'ordre vient d'ici, jamais de celui où la réponse a été
  // cochée: « petit-déjeuner » après « dîner » se lirait comme une erreur.
  const asked = new Set(raw);
  return EATING_OCCASIONS.filter((s) => asked.has(s));
}
