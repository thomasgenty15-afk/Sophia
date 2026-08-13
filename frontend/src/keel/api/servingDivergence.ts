/**
 * KEEL — LES DIRECTIONS DE SERVICE DIVERGENT-ELLES ? côté écran. AUCUNE RÈGLE ICI.
 *
 * ── CE FICHIER EST UN PONT, ET IL DOIT LE RESTER ──────────────────────────
 * La question « ce foyer porte-t-il deux façons de manger différentes ? » se
 * répond en comparant des CHAÎNES qui vivent dans
 * `supabase/functions/_shared/keel/household_portions.ts`. Les recopier ici
 * ferait un jumeau, et ce dépôt sait exactement ce que ça coûte: `health` a
 * rendu MOT POUR MOT la chaîne de `maintenance` pendant des semaines, donc
 * « santé » servait l'assiette de qui n'a rien déclaré, et rien n'a échoué.
 *
 * Le patron est celui de `groceryWaves.ts`, déjà en production depuis le
 * 2026-08-10, dont l'en-tête porte le raisonnement: « Deux définitions d'une
 * même règle physique sont une divergence en attente […]. SI TU AJOUTES UNE
 * RÈGLE ICI, TU AS RECRÉÉ LE JUMEAU. »
 *
 * Faisabilité vérifiée: la clôture d'imports de `household_portions.ts` est
 * `household.ts` → `student_age.ts`, `forbidden_matcher.ts` (aucun import) et
 * `meal_body.ts` → `student_age.ts`/`student_body.ts`/`household.ts`. Zéro
 * spécificateur `jsr:`/`npm:`/`https:`, zéro global `Deno.`, et
 * `allowImportingTsExtensions` est actif dans `tsconfig.app.json`.
 *
 * ⚠️ UNE NOTE EXISTANTE DIT LE CONTRAIRE, ET ELLE A ÉTÉ RELUE.
 * `i18n/servingDirections.int.test.ts` affirme qu'importer ce module depuis le
 * front « ferait entrer tout `supabase/functions/` dans le graphe de vitest,
 * pour trois constantes ». C'est faux pour CE module-ci (clôture de cinq
 * fichiers purs) et c'est déjà contredit en production par `groceryWaves.ts`.
 * La phrase reste VRAIE pour le besoin propre de ce test-là — il lit le fichier
 * comme du TEXTE pour épingler les six chaînes sur deux pages de vente — et il
 * continue tel quel. On ne le touche pas.
 *
 * SI TU AJOUTES UNE RÈGLE ICI, TU AS RECRÉÉ LE JUMEAU.
 */

import { distinctServingDirections } from "../../../../supabase/functions/_shared/keel/household_portions.ts";

export { distinctServingDirections };

/**
 * DEUX ADULTES AU MOINS PORTENT-ILS DES DIRECTIONS DIFFÉRENTES ?
 *
 * C'est le prédicat de montage de « quelle façon de manger le plat commun
 * suit »: sans deux positions, l'arbitrage n'a pas de sujet et la carte ne
 * s'affiche pas.
 *
 * ⚠️ L'APPELANT FILTRE LES ADULTES, ET C'EST DÉLIBÉRÉ. `CHILD_DIRECTION` est
 * une TAILLE, pas une orientation: un mineur ne peut pas gagner un arbitrage
 * (« un mineur n'est jamais référent »). Le filtre reste chez l'appelant parce
 * que c'est lui qui connaît la forme de son roster.
 *
 * ⚠️ ET L'OBJECTIF PASSÉ DOIT ÊTRE L'OBJECTIF RÉSOLU — celui de
 * `student_goals` pour une bouche qui a réclamé son compte, pas une colonne de
 * roster qui peut être en retard. La fonction est pure: elle croit ce qu'on lui
 * donne, et répond juste sur une donnée fausse.
 */
export function servingDirectionsDiverge(
  adults: readonly { ageState: "minor" | "adult" | "unknown"; goal: string | null }[],
): boolean {
  return distinctServingDirections(adults).length >= 2;
}
