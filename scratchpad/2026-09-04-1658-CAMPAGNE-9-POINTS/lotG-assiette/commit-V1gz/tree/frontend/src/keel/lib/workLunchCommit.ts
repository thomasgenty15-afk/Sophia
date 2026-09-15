import type { WorkLunch } from "./presenceMarks";
import { workLunchWriteIsNeeded } from "./workLunchForm";

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

/**
 * LIT LES RÉPONSES ENREGISTRÉES — ET RATE EN DISANT `null`, JAMAIS EN VIDE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ UNE LECTURE RATÉE RENDUE « VIDE » SE LIT « PERSONNE N'A RÉPONDU ».
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Les deux valeurs ne disent pas la même chose, et c'est toute la garde de
 * `WorkLunchCard`: `null` = la lecture n'a pas eu lieu (la carte ne rend aucune
 * question), une `Map` vide = elle a eu lieu et personne n'a répondu (la carte
 * pose ses questions, vierges). Retomber sur une `Map` vide quand le réseau
 * tombe affiche donc sept questions vierges à un foyer qui a répondu — et le
 * premier clic écrit par-dessus la réponse de quelqu'un, en croyant la créer.
 *
 * ⚠️ CETTE FONCTION EXISTE POUR ÊTRE MESURÉE, ET LA RAISON EST LA MÊME QUE
 * POUR `commitWorkLunch`. Écrit en `catch` dans le composant, le repli est
 * inatteignable: `renderToStaticMarkup` ne joue aucun effet, donc y remplacer
 * `null` par `new Map()` n'aurait fait tomber aucun test de ce dépôt. Mutation
 * jouée avant l'extraction: **0 rouge sur 9 tests** — le pavé de commentaire
 * qui l'interdisait était la seule chose qui la retenait.
 *
 * ⚠️ AUCUN RÉSEAU ICI NON PLUS: le lecteur lui est PASSÉ. C'est ce qui permet
 * de lui faire jeter une exception dans un test sans base ni serveur.
 */
export async function readWorkLunchAnswers(
  load: () => Promise<Map<string, WorkLunch | null>>,
): Promise<
  | { answers: Map<string, WorkLunch | null>; error: null }
  | { answers: null; error: string }
> {
  try {
    return { answers: await load(), error: null };
  } catch (e) {
    return { answers: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * LE GESTE D'UNE BOUCHE — ET LA GARDE D'ÉCRITURE EST ICI, PAS DANS LA CARTE.
 *
 * A6 (2026-09-03): la question a quitté l'étape 3 pour la fiche de chaque
 * personne sur `/app/household` (`MemberWorkLunchCard`). L'ancienne carte
 * comparait `saved` et `next` dans sa fermeture `commit` — mesurable par aucun
 * test (`renderToStaticMarkup` ne clique pas), donc tenue par un commentaire.
 * Au nouveau site, la comparaison est SORTIE ici, pour la même raison que les
 * deux fonctions au-dessus.
 *
 * ⛔ CE QUE ÇA GARDE: la porte SQL ré-applique son pré-remplissage à CHAQUE
 * écriture, même identique — réécrire `{"at_work":true,"mode":"outside"}`
 * REMET les cinq midis « dehors », y compris celui qu'on venait de décocher à
 * la main dans la grille juste en dessous. `saved` est ce que la page a LU;
 * comparer au brouillon dirait toujours « ça a changé ».
 *
 * `written: false` = rien n'est parti, et ce n'est pas un échec: c'est la garde
 * qui a mordu. L'appelant n'a rien à relire.
 */
export async function commitMemberWorkLunch(args: {
  /** La réponse ENREGISTRÉE pour cette bouche — `null` = jamais demandé. */
  saved: WorkLunch | null;
  next: WorkLunch;
  /** Le geste complet (`commitWorkLunch`, câblé par la page). */
  commit: (next: WorkLunch) => Promise<{ ok: boolean; reason: string | null }>;
}): Promise<{ ok: boolean; reason: string | null; written: boolean }> {
  if (!workLunchWriteIsNeeded(args.saved, args.next)) {
    return { ok: true, reason: null, written: false };
  }
  const result = await args.commit(args.next);
  return { ok: result.ok, reason: result.reason, written: true };
}
