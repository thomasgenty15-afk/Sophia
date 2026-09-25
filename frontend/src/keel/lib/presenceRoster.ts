import type { FunnelMouth } from "../api/onboarding";
import type { EatingOccasionSlot } from "../api/mealGeneration";
import type { AwayMark } from "./presenceMarks";

// ═══════════════════════════════════════════════════════════════════════════
// D4 ② — QUI A UNE GRILLE DE PRÉSENCE À L'ÉTAPE 4, ET LE TITULAIRE EN FAIT
// PARTIE.
//
// `presenceRoster` assemble la liste des bouches de la grille de présence de
// l'entonnoir, TITULAIRE COMPRIS (lu par `SetupPage`). `readFunnelFacts` retire
// le titulaire de `mouths` (il vit dans `state.self`); sans cette liste, celui
// qui remplit le formulaire n'avait aucune case pour dire « je ne suis pas là
// à ce repas ».
//
// ⟳ Historique. La liste est née pour contredire le pré-remplissage de la
// question du déjeuner en semaine (cinq midis « dehors » écrits par
// `keel_household_set_member_work_lunch`). La question est retirée depuis le
// 2026-09-19, et l'état « dehors » le 2026-09-24 (ses cases converties en
// absences). La liste reste: c'est la grille de présence du titulaire.
//
// ── ⚠️ IL PASSE PAR LA MÊME PORTE QUE LES AUTRES ─────────────────────────
// Ses absences de foyer vivent dans `household_members.away_days`, sur SA
// ligne membre — la même colonne que pour n'importe quelle bouche, et le roster
// la rend étiquetée `source: 'household'` comme les autres.
// `setMemberAway(ownMemberId, …)` est donc la porte, sans un chemin d'écriture
// de plus.
//
// ⛔ ET SANS LIGNE MEMBRE, IL N'A PAS DE GRILLE — PAS UNE FABRIQUÉE. Un compte
// solo n'a pas de foyer: `ownMemberId` est `null`, il n'existe aucune ligne où
// écrire, et lui montrer une grille serait montrer un contrôle qui échoue à
// tous les coups. Ses absences à lui vivent dans son « about you », et c'est un
// autre écran.
// ═══════════════════════════════════════════════════════════════════════════

/** Ce que le titulaire apporte à la liste, quand il a une ligne membre. */
export interface PresenceSelf {
  /** `null` = aucune ligne membre (compte solo) ⇒ aucune grille. */
  ownMemberId: string | null;
  firstName: string;
  /** Sa colonne du foyer, telle que le roster l'étiquette. */
  away: readonly AwayMark[];
  /** `null` = aux moments de la maison. Jamais `[]`. */
  eatingSlots: EatingOccasionSlot[] | null;
}

/**
 * LES BOUCHES QUI ONT UNE GRILLE, DANS L'ORDRE DE L'ÉCRAN — titulaire d'abord.
 *
 * ⚠️ IL EST EN TÊTE PARCE QU'IL EST LA PREMIÈRE BOUCHE DE SA TABLE, comme sur
 * la fiche du foyer (`MeFiche`, et le roster de `MembersCard`). Trois
 * écrans qui rangent les mêmes personnes dans trois ordres différents font
 * chercher la sienne à chaque fois.
 *
 * ⚠️ ET IL N'APPARAÎT JAMAIS DEUX FOIS. `readFunnelFacts` le retire déjà de
 * `mouths`, mais cette fonction ne le CROIT PAS sur parole: une ligne de
 * `mouths` qui porterait son `memberId` est écartée ici. Deux cartes au même
 * nom, chacune écrivant la même colonne, laisseraient gagner celle qu'on
 * enregistre en dernier — et personne ne saurait laquelle il a modifiée.
 */
export function presenceRoster(args: {
  self: PresenceSelf;
  mouths: readonly FunnelMouth[];
}): FunnelMouth[] {
  const others = args.mouths.filter((m) =>
    m.memberId !== null && m.memberId !== args.self.ownMemberId
  );
  if (args.self.ownMemberId === null) return [...others];
  return [selfAsMouth(args.self), ...others];
}

/**
 * LE TITULAIRE, DANS LA FORME QUE LA CARTE DE PRÉSENCE LIT.
 *
 * ⚠️ ELLE NE LIT QUE QUATRE CHAMPS (`memberId`, `firstName`, `eatingSlots`,
 * `away`), et les autres sont ici pour satisfaire le type — jamais pour être
 * rendus. C'est écrit franchement plutôt que masqué derrière un `as`: un `as`
 * sur un type étranger désarme le typecheck, et le jour où la carte lira un
 * cinquième champ, c'est le compilateur qui doit le dire, pas l'écran.
 *
 * `claimed: true` est le seul de ces champs qui soit un FAIT plutôt qu'un
 * remplissage: le titulaire a un compte par définition.
 */
function selfAsMouth(self: PresenceSelf): FunnelMouth {
  return {
    memberId: self.ownMemberId,
    claimed: true,
    eatingSlots: self.eatingSlots,
    away: [...self.away],
    firstName: self.firstName,
    kind: "adult",
    birthDate: null,
    goal: null,
    allergiesReviewed: false,
    diet: null,
    heightCm: null,
    weightKg: null,
    gender: null,
    activityLevel: null,
    // ② Cette fabrique ne sert QUE la grille de présence: elle ne lit aucun
    // corps, donc elle ne peut rien dire de l'activité. `null` = pas répondu.
    dayActivity: null,
    sportFrequency: null,
    appetite: null,
  };
}
