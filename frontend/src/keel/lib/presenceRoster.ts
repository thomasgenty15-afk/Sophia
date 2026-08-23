import type { FunnelMouth } from "../api/onboarding";
import type { EatingOccasionSlot } from "../api/mealGeneration";
import type { AwayMark } from "./presenceMarks";

// ═══════════════════════════════════════════════════════════════════════════
// D4 ② — QUI A UNE GRILLE DE PRÉSENCE À L'ÉTAPE 4, ET LE TITULAIRE EN FAIT
// PARTIE.
//
// Spec: `scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md` §2.2 bis —
// « la grille du plan gagne toujours sur la réponse hebdomadaire ».
//
// ── ⛔ LE DÉFAUT, ET IL CASSAIT LA RÈGLE PRODUIT ─────────────────────────
// L'étape 3 pose la question du déjeuner AU TITULAIRE AUSSI (`workLunchRoster`,
// « le titulaire, premier et pareil »), et sa réponse PRÉ-REMPLIT cinq midis
// « dehors » sur SA ligne membre, dans la même transaction. L'étape 4, elle,
// listait `facts.mouths` — dont `readFunnelFacts` RETIRE le titulaire, exprès,
// parce qu'il vit dans `state.self`.
//
// Résultat mesuré: celui qui remplit le formulaire pouvait déclarer « je
// déjeune au bureau », voir cinq de ses midis sortir du plan, et ne trouver
// NULLE PART dans le tunnel de quoi en contredire un seul. Or « pré-remplir
// n'est pas décider »: une réponse hebdomadaire qui ne se laisse pas contredire
// fait disparaître un repas que quelqu'un vient de réclamer à la main, et c'est
// le défaut le plus frustrant qui soit — on a fait le geste, il n'a rien
// changé.
//
// ── POURQUOI RENDRE LA GRILLE PLUTÔT QUE RETIRER LA QUESTION ─────────────
// L'autre issue était de ne plus poser la question du déjeuner au titulaire
// dans le tunnel. Elle est REJETÉE, et pas par confort:
//   · elle lui retirerait le conseil chiffré du midi (`eatingOutAdvice`), qui
//     n'existe QUE pour un midi marqué « dehors » — c'est-à-dire qu'elle
//     supprimerait la moitié utile du lot pour la personne la plus susceptible
//     de composer;
//   · `workLunchRoster` porte en toutes lettres l'arbitrage inverse, pris la
//     veille et écrit dans son en-tête. Le renverser en passant, depuis un lot
//     d'écran, ferait exactement ce que ce dépôt reproche à ses propres
//     commentaires: une contrainte qui survit à sa cause, dans l'autre sens.
//   · la question reste juste: elle décrit une SEMAINE ORDINAIRE. Ce qui
//     manquait n'était pas la question, c'était la case où la démentir.
//
// ── ⚠️ IL PASSE PAR LA MÊME PORTE QUE LES AUTRES ─────────────────────────
// Son pré-remplissage a été écrit dans `household_members.away_days` par
// `keel_household_set_member_work_lunch`, sur SA ligne membre — la même colonne
// que pour n'importe quelle bouche, et le roster la rend étiquetée
// `source: 'household'` comme les autres. `setMemberAway(ownMemberId, …)`
// est donc la porte, sans un chemin d'écriture de plus.
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
 * ⚠️ IL EST EN TÊTE PARCE QU'IL EST LA PREMIÈRE BOUCHE DE SA TABLE, comme à
 * l'étape 3 (`workLunchRoster`) et sur la fiche du foyer (`MeCard`). Trois
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
    takesDessert: null,
    takesCheese: null,
    takesBread: null,
    appetite: null,
  };
}
