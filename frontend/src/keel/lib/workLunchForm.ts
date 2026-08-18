import {
  assessBirthDate,
} from "../../../../supabase/functions/_shared/keel/student_age.ts";
import {
  type WorkLunch,
  type WorkLunchMode,
  WORK_WEEK_DAYS,
  workLunchPrefillCells,
} from "./presenceMarks";

// L6 — LE DÉPLIAGE DU DÉJEUNER DEHORS, ET RIEN D'AUTRE.
//
// Spec: scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md §2.2, §2.2 bis,
// §2.3.
//
//   « La semaine, est-ce que <Prénom> mange au bureau ? »
//      ├─ NON ────────────► le plan compose tous ses repas
//      └─ OUI ─► « gamelle, ou dehors ? »
//                  ├─ GAMELLE ─► « micro-ondes au bureau ? »
//                  │              non → le repas doit être BON FROID
//                  └─ DEHORS ──► le plan ne compose pas ce midi,
//                                MAIS il en fait la place
//
// ── CE QUE CE MODULE FAIT, ET CE QU'IL NE FAIT PAS ────────────────────────
// Il décide QUELLES QUESTIONS SONT VISIBLES, à QUI on les pose, et SI un
// enregistrement a lieu d'être. Il n'écrit rien, ne calcule aucun
// pré-remplissage (c'est la base qui coche, une fois, à l'écriture) et ne dit
// aucun chiffre.
//
// ── ⛔ LA GARDE QUI PORTE TOUT LE LOT: `workLunchWriteIsNeeded` ────────────
// Mesuré par L3-B: la porte SQL ré-applique le pré-remplissage à CHAQUE
// écriture, MÊME IDENTIQUE. Réenregistrer `{"at_work":true,"mode":"outside"}`
// REMET les cinq midis « dehors » — y compris celui qu'on venait de décocher à
// la main dans la grille. Un formulaire qui ré-émet sa réponse au montage, au
// blur, ou « pour être sûr » effacerait donc la correction que la personne
// vient de faire, sans qu'aucun écran ne bouge. C'est la cicatrice
// `mount-snapshot-forms-need-a-loading-gate`, et elle coûte ici une DONNÉE, pas
// un affichage.
//
// D'où la règle: ON N'ÉCRIT QUE SUR UN CHANGEMENT RÉEL, et c'est une fonction
// pure, testée, mutée — pas une discipline d'appelant.

/**
 * L'ÂGE, À TROIS ÉTATS. Jumeau de `MemberAgeState` (`api/household.ts`) et de
 * `keel_household_member_age` en base.
 *
 * ⚠️ IL EST RECOPIÉ PLUTÔT QU'IMPORTÉ DE `api/household.ts`, et c'est délibéré:
 * ce module est PUR (aucun `supabase`), et l'importer depuis un module d'API
 * ferait entrer le client réseau dans la moitié testable du lot.
 */
export type WorkLunchAgeState = "minor" | "adult" | "unknown";

/** Une bouche telle que l'écran la voit pour CETTE question. */
export interface WorkLunchPerson {
  /** `null` = pas encore de ligne en base ⇒ rien à écrire, donc rien à demander. */
  memberId: string | null;
  /** Vide = pas de prénom. La question le NOMME, donc il n'est pas optionnel. */
  firstName: string;
  ageState: WorkLunchAgeState;
}

/**
 * L'ÂGE D'UNE DATE, RELU CÔTÉ NAVIGATEUR — pour le titulaire SEUL.
 *
 * ⚠️ LES AUTRES BOUCHES NE PASSENT PAS PAR ICI. Leur `ageState` vient du roster,
 * donc de `keel_household_member_age`, qui est l'AUTORITÉ — c'est elle qui rend
 * `not_adult` à l'écriture. Le titulaire, lui, n'est pas dans la liste des
 * bouches de l'entonnoir (il en est retiré par `readFunnelFacts`), et sa date
 * vit dans `profiles.birth_date`, exactement la colonne que la base regarde en
 * PREMIER pour lui. Les deux lectures répondent donc à la même question sur la
 * même donnée.
 *
 * ⚠️ TOUT CE QUI N'EST PAS `minor` OU `adult` VAUT `unknown` — une date future,
 * illisible ou aberrante n'est pas une date, et surtout ce n'est PAS une preuve
 * de majorité. C'est la même direction sûre qu'en base, et c'est ce qui fait que
 * la question ne se pose jamais à quelqu'un dont on ne sait pas s'il est adulte.
 */
export function ageStateFromBirthDate(
  raw: unknown,
  todayLocalIso: string,
): WorkLunchAgeState {
  const verdict = assessBirthDate(raw, todayLocalIso);
  if (verdict.status === "minor") return "minor";
  if (verdict.status === "adult") return "adult";
  return "unknown";
}

/**
 * ON POSE LA QUESTION, OU PAS.
 *
 * Deux refus, et ils n'ont pas la même nature:
 *   · pas de `memberId` — il n'y a nulle part où écrire la réponse. Poser la
 *     question rendrait un bouton qui échoue.
 *   · pas `adult` — la base refuse `not_adult`, ET `unknown` EN FAIT PARTIE.
 *     « Ne pas savoir » n'est pas « savoir que c'est un adulte »: on ne pose pas
 *     une question d'adulte à quelqu'un dont on ignore s'il en est un.
 *
 * ⛔ L'ÂGE NE SE REDEMANDE JAMAIS. Il se DÉDUIT de la date de naissance (§1,
 * bloc 1). Une case « adulte ? » à côté d'une date de naissance ouvre la porte à
 * deux réponses qui se contredisent.
 */
export function workLunchIsAskable(person: WorkLunchPerson): boolean {
  if (!person.memberId) return false;
  return person.ageState === "adult";
}

/** Les bouches à qui l'écran pose la question, dans l'ordre reçu. */
export function askableWorkLunchPeople(
  people: readonly WorkLunchPerson[],
): WorkLunchPerson[] {
  return people.filter(workLunchIsAskable);
}

/**
 * LES QUESTIONS VISIBLES, DANS L'ORDRE — le dépliage du §2.2.
 *
 * Liste FERMÉE. Chaque jeton a une branche nommée dans la carte; en ajouter un
 * sans branche rendrait une question muette.
 */
export const WORK_LUNCH_QUESTIONS = ["at_work", "mode", "microwave"] as const;
export type WorkLunchQuestion = (typeof WORK_LUNCH_QUESTIONS)[number];

/**
 * Ce qui est DÉPLIÉ pour cette réponse-là.
 *
 * `null` = la question n'a jamais été posée ⇒ seule la première est visible.
 * C'est le cas nominal, et c'est pour ça que le formulaire ne fait pas peur:
 * une seule question tant qu'on n'a pas répondu.
 */
export function workLunchQuestions(
  answer: WorkLunch | null,
): WorkLunchQuestion[] {
  if (!answer || !answer.atWork) return ["at_work"];
  if (answer.mode !== "lunchbox") return ["at_work", "mode"];
  return ["at_work", "mode", "microwave"];
}

/**
 * LA RÉPONSE EST-ELLE FINIE ? — pour que l'écran puisse le DIRE.
 *
 * ⚠️ CE N'EST PAS UNE CONDITION D'ÉCRITURE. Une réponse à moitié donnée
 * (« oui, au bureau », mode pas encore choisi) S'ÉCRIT: la colonne l'accepte,
 * la base ne coche alors aucun midi, et la question suivante reste posée au
 * prochain montage. Retenir l'écriture jusqu'à la fin perdrait le premier clic
 * de quelqu'un qui ferme l'onglet entre deux questions.
 */
export function workLunchIsComplete(answer: WorkLunch | null): boolean {
  if (!answer) return false;
  if (!answer.atWork) return true;
  if (answer.mode === "outside") return true;
  if (answer.mode === "lunchbox") return answer.microwave !== null;
  return false;
}

/**
 * ⛔ FAUT-IL ÉCRIRE ? — LA GARDE DU LOT.
 *
 * `false` quand rien n'a changé, et c'est tout l'enjeu: la porte SQL est
 * IDEMPOTENTE sur son propre pré-remplissage (elle retire puis réécrit les cinq
 * midis), donc une écriture identique n'est PAS un no-op — elle RESSUSCITE les
 * midis « dehors » que la grille avait retirés à la main. Mesuré par L3-B:
 * « re-enregistrer `{"at_work":true,"mode":"outside"}` remet mercredi ».
 *
 * La comparaison porte sur les TROIS champs, parce que les trois voyagent dans
 * la charge utile. Comparer le seul `mode` laisserait passer un changement de
 * micro-ondes; comparer le seul `atWork` laisserait passer tout le reste.
 *
 * ⚠️ ELLE COMPARE À CE QUI EST ENREGISTRÉ, PAS À CE QUI EST AFFICHÉ. L'appelant
 * doit lui passer la réponse LUE en base (`saved`), sinon la garde compare un
 * brouillon à lui-même et rend toujours `false`.
 */
export function workLunchWriteIsNeeded(
  saved: WorkLunch | null,
  next: WorkLunch | null,
): boolean {
  if (saved === null || next === null) return saved !== next;
  return saved.atWork !== next.atWork ||
    saved.mode !== next.mode ||
    saved.microwave !== next.microwave;
}

/**
 * LE PROCHAIN BROUILLON APRÈS UN CLIC — et il REPLIE ce qui n'a plus de sens.
 *
 * ⚠️ RÉPONDRE « NON » EFFACE LE MODE ET LE MICRO-ONDES. Les garder ferait
 * repartir en base `{"at_work":false,"mode":"lunchbox"}` — un objet qui dit deux
 * choses contraires, que `parseWorkLunch` relit `{atWork:false, mode:null}` et
 * dont la moitié serait donc perdue en silence au premier aller-retour. Un état
 * d'écran qui ne survit pas à sa propre relecture est un état faux.
 *
 * Même raison pour `outside`, qui n'a pas de micro-ondes: la contrainte de
 * réchauffage ne porte que sur un repas que le plan COMPOSE.
 */
export function workLunchAfterAtWork(
  current: WorkLunch | null,
  atWork: boolean,
): WorkLunch {
  if (!atWork) return { atWork: false, mode: null, microwave: null };
  return {
    atWork: true,
    mode: current?.atWork ? current.mode : null,
    microwave: current?.atWork && current.mode === "lunchbox"
      ? current.microwave
      : null,
  };
}

export function workLunchAfterMode(
  current: WorkLunch | null,
  mode: WorkLunchMode,
): WorkLunch {
  return {
    atWork: true,
    mode,
    microwave: mode === "lunchbox" && current?.mode === "lunchbox"
      ? current.microwave
      : null,
  };
}

export function workLunchAfterMicrowave(
  current: WorkLunch | null,
  microwave: boolean,
): WorkLunch {
  return { atWork: true, mode: "lunchbox", microwave };
}

/**
 * COMBIEN DE MIDIS LA RÉPONSE VA COCHER — pour le DIRE avant de le faire (§2.3).
 *
 * ⚠️ C'EST UNE DESCRIPTION, PAS LE GESTE. Le pré-remplissage est appliqué UNE
 * FOIS, par la base, dans la transaction d'écriture. Le refaire ici ferait un
 * second auteur du même geste, et le navigateur gagnerait la course une fois
 * sur deux.
 *
 * ⚠️ `lunchbox` REND 0, et c'est le point le plus facile à rater du lot: une
 * gamelle est un repas COMPOSÉ, transportable, pas un repas manqué.
 */
export function workLunchPrefillCount(answer: WorkLunch | null): number {
  return workLunchPrefillCells(answer).length;
}

/** Les jours que la question désigne — réexporté pour que l'écran les nomme. */
export { WORK_WEEK_DAYS };

/**
 * LE REPAS DOIT-IL ÊTRE BON FROID ? — la seule contrainte que la gamelle ajoute.
 *
 * `microwave === null` rend `false`: on n'invente pas une contrainte réelle sur
 * un silence. Tant que la question n'a pas de réponse, le plan compose comme
 * avant.
 */
export function workLunchNeedsColdMeal(answer: WorkLunch | null): boolean {
  return answer !== null && answer.atWork && answer.mode === "lunchbox" &&
    answer.microwave === false;
}
