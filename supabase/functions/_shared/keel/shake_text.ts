/**
 * LE DÉBUT DE LA PHRASE DU SHAKER QUE LE PLAN COMPOSE — une feuille.
 *
 * ⟳ 2026-09-25 — SORTI D'`eating_structure.ts` pour que `household_habits.ts`
 * le lise sans import circulaire (son en-tête le dit: il n'importe rien qui
 * mène à `meal_generation.ts`). Il sert à RECONNAÎTRE ce que le plan a ajouté:
 * la carte d'une bouche ne dit plus « has their own » d'un shaker qu'elle n'a
 * jamais déclaré (banc des trois foyers). `eating_structure.ts` le réexporte.
 *
 * PURE: aucune dépendance.
 */
export const SHAKE_TEXT_PREFIX = "a drinkable shake";
