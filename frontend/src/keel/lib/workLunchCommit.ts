import type { WorkLunch } from "./presenceMarks";

// L6 — LE GESTE D'ENREGISTREMENT DU DÉJEUNER, ET IL VIT DANS SON PROPRE FICHIER.
//
// ⚠️ IL A ÉTÉ SORTI DE `components/TableStepPlanning.tsx` DEUX FOIS, POUR DEUX
// RAISONS QUI DISENT LA MÊME CHOSE.
//
//   ① `renderToStaticMarkup` ne joue AUCUN effet et ne clique sur rien: une
//      fermeture posée dans le JSX n'est atteignable par aucun test de ce dépôt
//      (ni jsdom, ni testing-library). Retirer la relecture d'une telle
//      fermeture n'aurait fait tomber personne — et c'est la ligne dont dépend
//      le fait que la grille garde ce qu'on vient d'y corriger.
//   ② `react-refresh/only-export-components` refuse au commit qu'un `.tsx`
//      exporte autre chose qu'un composant. La règle et le besoin de mesure
//      pointent vers le même endroit: un fichier à part.
//
// Il ne fait AUCUN réseau: les deux écritures et la relecture lui sont passées.
// C'est ce qui le rend mesurable, et c'est aussi ce qui l'empêche de décider
// tout seul de ce qu'il relit.

/**
 * ENREGISTRE UNE RÉPONSE, PUIS RELIT — et l'ordre des trois pas EST la règle.
 *
 * Même patron que `MealPickerGridBody`, sorti de son rendu pour la même raison.
 *
 * ⚠️ `reread` AVANT `onSaved`, ET L'ORDRE COMPTE. `onSaved` relit la page
 * entière et peut échouer (réseau, refus de lecture); si la relecture des
 * réponses passait après, une page qui tombe laisserait `saved` périmé — donc
 * la prochaine écriture inutile, donc les cinq midis de retour.
 *
 * ⚠️ ON NE RELIT RIEN SUR UN REFUS. `not_adult`, `too_many_away`… n'ont rien
 * changé en base. Relire remplacerait le motif affiché sous le geste par un
 * ré-affichage muet, et un refus qu'on n'a pas le temps de lire est un bouton
 * mort.
 */
export async function commitWorkLunch(args: {
  memberId: string;
  answer: WorkLunch;
  save: (
    memberId: string,
    answer: WorkLunch,
  ) => Promise<{ ok: boolean; reason: string | null }>;
  /** Relit les réponses enregistrées — c'est elle qui réarme la garde. */
  reread: () => Promise<void>;
  /** Relit les faits de la page: la porte SQL a aussi écrit `away_days`. */
  onSaved: () => void | Promise<void>;
}): Promise<{ ok: boolean; reason: string | null }> {
  const result = await args.save(args.memberId, args.answer);
  if (!result.ok) return result;
  await args.reread();
  await args.onSaved();
  return result;
}
