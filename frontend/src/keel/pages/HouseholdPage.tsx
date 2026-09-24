import React from "react";

import { useAuth } from "../../context/AuthContext";
import { useHouseholdAccess } from "../../context/HouseholdAccessContext";
// ⚠️ LA MÊME PORTE D'ALLERGIE QUE L'ENTONNOIR: elle écrit les libellés ET
// l'accusé « on a demandé » sur la ligne du maître. Deux écrivains pour ce
// couple-là voudrait dire un `canGenerate` qui redemande une question posée.
//
// ⟳ `DIET_ANSWERS` N'EST PLUS IMPORTÉ ICI (2026-09-19). La liste fermée des
// quatre réponses est toujours lue et jamais recopiée — c'est
// `MouthPreferencesFields` qui la lit maintenant, avec le reste de la fiche.
// Cet écran n'a plus de second jeu de boutons de régime.
import { saveEatingRhythm, saveMouthAllergies } from "../api/onboarding";
import {
  addAllergy,
  addHouseholdMember,
  addRestriction,
  type AllergyView,
  birthDateDoor,
  createHousehold,
  createOwnerGoalRow,
  detachHouseholdMember,
  hasOwnerGoalRow,
  type HouseholdMealView,
  type HouseholdMemberView,
  type HouseholdView,
  loadAllergies,
  loadHousehold,
  loadHouseholdMeal,
  loadHouseholdRhythm,
  loadMemberBirthDates,
  loadMemberBodies,
  loadRestrictions,
  goalForAge,
  isDirectionalGoal,
  type MemberBodyView,
  type MemberGender,
  type MemberGoal,
  mergeCounterparts,
  removeAllergy,
  removeHouseholdMember,
  removeRestriction,
  type RestrictionView,
  restrictionNotice,
  setMemberBirthDate,
  setMemberBody,
  setMemberDiet,
  setMemberRhythm,
  setMemberGoal,
  setMemberName,
  setOwnBirthDate,
  loadLiveInvitations,
  type LiveInvitation,
} from "../api/household";
// ── LOT C · LE MAGASIN DES PRÉFÉRENCES, EN LECTURE ────────────────────────
// L'écriture passe par `writtenDislikeWriter` (`api/mouthProfile`), qui adapte
// le contrat « ça lève » de ce module au contrat « ça rend un refus » de cet
// écran. La lecture, elle, n'a pas de refus à traduire.
import {
  EATING_OCCASIONS,
  type EatingOccasion,
  type EatingOccasionSlot,
} from "../api/mealGeneration";
import {
  type HabitSlotWrite,
  loadMemberHabits,
  type MemberHabitsView,
  setMemberHabits,
} from "../api/householdHabits";
import { loadMutedMembers, muteMergeProposals } from "../api/householdMerge";
// L5 — LE POP-UP « UNE BOUCHE ». Il s'ouvre à chaque ajout de personne, ET sur
// la fiche du maître (D5, 2026-08-18): « sans quoi celui qui tient la maison
// serait le seul dont on ne sait rien ».
import {
  type KnownOwnMouth,
  loadMemberTargets,
  type MemberTargetView,
  loadOwnMouth,
  ownGoalWriter,
  ownShakerWriter,
  ownTargetWriter,
  persistMouth,
  addShakerToMemberIntakes,
  loadMemberFixedIntakes,
  setMemberTarget,
  writtenDislikeWriter,
} from "../api/mouthProfile";
import {
  ageStateOfTypedDate,
  blockList,
  draftFromKnown,
  emptyMouthDraft,
  targetPayloadOf,
  targetWriteIsBlind,
  filledPreferenceBlocks,
  type KnownMouth,
  knownMouthForOwner,
  type MouthFormDraft,
  mouthToPersist,
  shakerCanBeSaved,
  submitIsHeld,
  shakerPartialToWrite,
} from "../lib/mouthForm";
// LE DÉCOUPAGE « prose / bulle » D'UNE LIGNE D'HABITUDE, EN UN SEUL EXEMPLAIRE.
// La fiche d'une bouche écrit la même liste que l'entonnoir et que
// `persistMouth`: une seconde règle ici ferait diverger le sens d'une entrée
// qui ne porte QUE « + repas léger » (pas de prose ⇒ `household_dish`).
import {
  habitEntriesToWrite,
  type SideCoursesDraft,
} from "../lib/mealExtras";
// ⚠️ LE LIBELLÉ D'UN ALLERGÈNE, PAS SON SLUG. Le catalogue écrit `peanut`; la
// liste de la fiche affichait le jeton nu sous une case cochée « Arachide ».
import { allergenLabel } from "../copy/allergens";
import { useEatingStructure } from "../lib/useEatingStructure";
// ⟳ 2026-09-09 — LE DÉFAUT (`MouthFormDialog`, le chrome) N'EST PLUS IMPORTÉ.
// La fiche du titulaire l'ouvrait par-dessus la page; elle porte maintenant ses
// préférences dans un accordéon, DANS sa propre fenêtre (`MeSheetForm`). Le
// composant vit toujours: `SetupPage` le monte. Ce qu'on retire ici, c'est le
// second `createPortal` empilé.
import {
  type MouthActivityAndStructure,
  MouthCoreFields,
  MouthPreferencesFields,
  // ⟳ 2026-09-22 (LOT A2) — LE POIDS VISÉ ET LE CURSEUR, SUR LA FICHE D'UNE
  // BOUCHE DÉJÀ INSCRITE. ⛔ IMPORTÉ, JAMAIS RECOPIÉ: une seconde lecture de
  // `paceControlFor` ferait deux écrans qui divergent au premier correctif —
  // c'est le motif écrit sur le composant lui-même, et le dépôt l'a déjà payé
  // sur les listes d'objectifs.
  TargetAndPaceFields,
} from "../components/MouthFormDialog";
import Modal from "../components/ui/Modal";
import {
  loadPracticalConstraints,
  type PracticalConstraints,
} from "../api/practicalConstraints";
import KitchenEquipmentCard from "../components/KitchenEquipmentCard";
import HouseholdTraditionsCard from "../components/HouseholdTraditionsCard";
// ⛔ LE PLAFOND, EN UN SEUL EXEMPLAIRE (A5). Il vit en base
// (`keel_household_max_mouths()`); cette constante ne le décide pas, elle
// l'ANNONCE avant le clic. Elle était recopiée ici sous un second nom.
import { HOUSEHOLD_MAX_MOUTHS } from "../api/onboarding";
import HouseholdHabitsCard from "../components/HouseholdHabitsCard";
// ⟳ 2026-09-23 — LES À-CÔTÉS SUR LA LIGNE D'UN MEMBRE, à côté de sa carte
// d'habitudes: c'est la seule porte que la base lui ouvre ici. La fiche
// partagée (`MouthPreferencesFields`) monte le même champ pour le maître.
import SideCoursesField from "../components/SideCoursesField";
// ⟳ 2026-09-19 — SEPT IMPORTS SONT PARTIS AVEC LES BLOCS QU'ILS SERVAIENT:
// `MealPickerGrid` (la grille d'absences), `EatingRhythmCard` et
// `FoodPreferencesCard` (les deux cartes du compte), `MemberWorkLunchCard` et
// ses deux portes, et `parseAwayMarks`. Les composants VIVENT — c'est
// `StudentWeekPlanPage` et `SetupPage` qui les montent. Ce qui part d'ici est
// le doublon de la fiche du foyer. Voir le pavé de `MePrefsForm`.
import HouseholdMergeCard from "../components/HouseholdMergeCard";
import HouseholdPlanCard from "../components/HouseholdPlanCard";
import { t } from "../i18n/t";
import { habitSlotsFor } from "../lib/habitSlots";
import KeelAppShell from "../components/KeelAppShell";
import { ExtraAccessCard } from "../components/ExtraAccessCard";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";

// ── ⟳ 2026-09-24 (lot 4c) · LES SOUS-COMPOSANTS VIVENT DANS `household/` ─────
// Les sous-composants de cet écran et ses libellés sont déplacés À
// L'IDENTIQUE dans `household/`. Ce fichier garde la page elle-même et ce qui
// n'est pas encore sorti.
// Il RÉ-EXPORTE ce qu'il exportait: les imports des tests ne changent pas.
// Les modules font partie de la famille de ce fichier
// (`scripts/source-families.json`), que les tests lisent à la place du
// fichier seul. Les commentaires des imports partis avec eux les ont suivis.
import { householdErrorText, goalLabel } from "./household/labels.ts";
import { CreateCard } from "./household/CreateCard.tsx";
import { type MouthDraft, MouthFields } from "./household/MouthFields.tsx";
import { MemberBadges } from "./household/MemberBadges.tsx";
import { BodyFields } from "./household/BodyFields.tsx";
import { SheetFrame } from "./household/SheetFrame.tsx";
import { MemberAccess } from "./household/MemberAccess.tsx";

export { SheetFrame } from "./household/SheetFrame.tsx";
export { MemberAccess } from "./household/MemberAccess.tsx";

// KEEL — /app/household.
//
// LE FOYER: qui mange ici, ce dont chacun a envie, et ce que la maison ne sert
// pas. Autorité produit: docs/keel/PIVOT-FOYER.md §8.
//
// ── LA DÉCISION QUI GOUVERNE TOUT L'ÉCRAN (§8.5 règle 4) ───────────────────
// Il y a DEUX autorités dans ce produit, et cet écran est le seul endroit où
// elles se croisent visuellement. Elles ne doivent jamais se ressembler:
//
//   SOPHIA        explique, ne bloque jamais.       — ailleurs dans le produit
//   COMPTE MAÎTRE restreint, sous conditions.       — ICI, et nommément
//
// D'où le libellé de chaque restriction: « Not served here — {owner} decided
// that ». Jamais « ce n'est pas recommandé », jamais une raison de santé. Faire
// passer une décision parentale pour une vérité nutritionnelle est le mensonge
// que §8.5 interdit, et le jour où l'enfant s'en aperçoit, plus rien de ce que
// dit Sophia n'a de poids.
//
// ── LA GARDE DE MONTAGE ────────────────────────────────────────────────────
// Rien n'est rendu avant la première lecture. Un formulaire monté sur du vide
// affiche des champs que personne n'a lus, puis les écrase au premier Save
// (leçon `mount-snapshot-forms-need-a-loading-gate`).
//
// ── L'AJOUT EN 90 SECONDES (lot 4, 2026-08-10) ─────────────────────────────
//
// LE COMPTE MAÎTRE EST LA PREMIÈRE BOUCHE, pas un administrateur. Ce n'est pas
// une posture: `generate-household-meal-v1` refuse de démarrer tant qu'il n'a
// pas de ligne `student_goals` (`goal_required`, 409) — et on se prenait ce mur
// EXACTEMENT après l'effort d'avoir saisi trois personnes. Sa carte est donc la
// première de l'écran, et elle écrit cette ligne.
//
// TROIS CHAMPS, ET DEUX SONT FACULTATIFS:
//   · le PRÉNOM est obligatoire. `household_turn_context.ts` filtre en silence
//     toute portion au prénom vide: une bouche sans prénom voit sa part
//     DISPARAÎTRE, sans erreur.
//   · l'ÂGE est facultatif mais gouvernant. Sans lui, `keel_household_member_age`
//     rend `unknown` et `goalApplies` refuse toute direction. La garde échoue du
//     bon côté, et l'incitation à compléter est écrite sous le champ.
//   · l'OBJECTIF est facultatif: pas de direction = part standard.
//
// ── LES DEUX NATURES D'UNE CONTRAINTE, ET POURQUOI L'ÉCRAN LES DEMANDE ─────
//
// Une ALLERGIE est médicale: elle rejoint l'union de sécurité du générateur,
// gouverne toute la casserole, et rien ne se compose si on ne peut pas la lire.
// Une RÈGLE DE MAISON est parentale: elle garde le verrou qui EFFACE le
// « pourquoi » du plat, pour que Sophia ne porte pas une décision domestique
// comme un conseil de santé. Deux tables, deux RPC — et la question est posée à
// l'utilisateur parce que la réponse change ce que le produit fait.

type Loading = "loading" | "ready" | "error";

/**
 * ⛔ ICI SE TENAIT `HOUSEHOLD_MAX_MEMBERS = 8` — A5 point 6bis, 2026-09-03.
 *
 * Le même plafond était écrit DEUX FOIS côté front, sous deux noms:
 * `HOUSEHOLD_MAX_MOUTHS` (`api/onboarding.ts`, lu par l'entonnoir) et celui-ci
 * (lu par la carte d'ajout du Foyer). Deux nombres pour une seule règle: le
 * jour où la base en change un, c'est l'écran qu'on relit le moins qui garde
 * l'ancien — et il refuse, ou laisse passer, sans que rien ne rougisse.
 *
 * ⚠️ ET LE PLAFOND N'EST NI L'UN NI L'AUTRE: il vit EN BASE
 * (`keel_household_max_mouths()` rend 8, et la porte refuse `household_full`).
 * Ces constantes ne le décident pas, elles l'ANNONCENT avant le clic — un
 * bouton qui part pour être refusé est un bouton mort. Une seule suffit donc.
 */

export default function HouseholdPage(): React.ReactElement {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [phase, setPhase] = React.useState<Loading>("loading");
  const [household, setHousehold] = React.useState<HouseholdView | null>(null);
  const [restrictions, setRestrictions] = React.useState<RestrictionView[]>([]);
  /* ══════════════════════════════════════════════════════════════════════
     ⛔ `dislikes` — L'ÉTAT ET SA LECTURE SONT PARTIS — ⟳ 2026-09-21
     ══════════════════════════════════════════════════════════════════════

     Les dégoûts par bouche (`food.exclude`, `source=written`, lot C) étaient
     chargés ici pour UN lecteur: le résumé des cartes (« Déjà renseigné : ses
     dégoûts et son régime. »), retiré le même jour sur demande. Le fil entier
     est remonté avec — page → `MembersCard` → `MemberRow`.

     ⚠️ LA FENÊTRE DES PRÉFÉRENCES NE LES PERD PAS, parce qu'elle ne les a
     JAMAIS lus d'ici: son brouillon part vide, et c'est délibéré (« ni les
     dégoûts ni le shaker ne se sèment depuis la base — ils s'AJOUTENT, ils ne
     se posent pas »). Il n'y a donc aucun écran qui affichait l'existant et
     qui cesserait de l'afficher.

     ⚠️ `loadWrittenDislikes` RESTE — exportée, testée (`writtenDislikes`,
     `retainedItems`), et c'est la seule lecture de ce magasin côté navigateur.
     Ce qui est retiré est son APPEL sur cette page, c'est-à-dire une requête
     par ouverture dont plus personne ne lisait le résultat. */
  const [allergies, setAllergies] = React.useState<AllergyView[]>([]);
  const [meal, setMeal] = React.useState<HouseholdMealView | null>(null);
  // `null` = pas encore lu. C'est la garde de montage: tant qu'on ne SAIT pas
  // si la ligne `student_goals` existe, on ne rend ni la carte qui la crée ni
  // le bouton de composition qui en dépend.
  const [ownerGoalRow, setOwnerGoalRow] = React.useState<boolean | null>(null);
  /**
   * `student_goals.practical_constraints` DU MAÎTRE (A5) — l'équipement de la
   * cuisine y vit, et « Paramètres du foyer » le rend ici.
   *
   * ⚠️ `null` = PAS LU (ou lecture tombée), et c'est la porte de rendu de la
   * carte, pas un détail: sept cases décochées pendant la lecture partiraient
   * telles quelles au premier Enregistrer.
   */
  const [practicalConstraints, setPracticalConstraints] = React.useState<
    PracticalConstraints | null
  >(null);
  /**
   * LES INVITATIONS VIVANTES, par `member_id` (A5, §5.5).
   *
   * ⚠️ `null` = PAS LU. La ligne d'une bouche sans compte offre alors
   * « Inviter » sans dire « invitation envoyée le … »: annoncer « personne n'a
   * été invité » sur une lecture qui n'a pas eu lieu ferait renvoyer un lien à
   * quelqu'un qui vient d'en recevoir un.
   *
   * ⛔ AUCUN `token_hash` NE TRAVERSE. Le jeton n'est rendu en clair qu'une
   * fois, par la RPC qui le crée; ce qui est lu ici ne sert qu'à DATER.
   */
  const [invitations, setInvitations] = React.useState<
    Map<string, LiveInvitation> | null
  >(null);
  /**
   * LES MOMENTS D'UNE JOURNÉE ORDINAIRE — les LIGNES de la grille de présence.
   *
   * Lus sur la ligne du compte maître, comme tout ce qui gouverne la
   * composition. `[]` tant qu'on n'a pas lu; `loadHouseholdRhythm` retombe sur
   * le défaut du moteur quand rien n'est déclaré, donc la grille a toujours des
   * lignes à montrer dès que la lecture a eu lieu.
   */
  const [rhythm, setRhythm] = React.useState<EatingOccasionSlot[]>([]);
  /**
   * D17 — LES BOUCHES DONT LE MAÎTRE NE VEUT PLUS VOIR LES PROPOSITIONS.
   *
   * `null` = pas lu, ou lecture impossible — et les deux se traitent pareil à
   * l'écran: pas d'interrupteur. Un interrupteur qui affiche toujours
   * « éteint » se fait basculer deux fois.
   *
   * ⚠️ SEUL LE MAÎTRE PEUT LIRE CETTE TABLE (RLS, policy `owner`), et c'est
   * voulu: un secondaire n'a pas à apprendre qu'on a coupé les propositions qui
   * le concernent.
   */
  const [mutedMembers, setMutedMembers] = React.useState<Set<string> | null>(null);
  /**
   * LE CORPS DE CHAQUE BOUCHE (2026-08-12), par `member_id`.
   *
   * ⚠️ VIDE POUR UN NON-MAÎTRE, et ce n'est pas l'écran qui l'impose:
   * `household_member_bodies` n'a AUCUN grant à `authenticated` et sa RPC de
   * lecture rend zéro ligne à qui n'est pas maître. Sondé avant d'écrire la
   * migration: la policy de `household_members` est household-wide, donc une
   * colonne `poids` posée là-bas aurait été lisible par tout co-membre.
   *
   * Une carte VIDE ne veut donc pas dire « personne n'a de corps »: pour un
   * membre, elle veut dire « ce n'est pas ton affaire ». C'est pour ça que le
   * bloc de saisie ne s'affiche que dans la vue du maître.
   *
   * ⟳ A5, 2026-09-03 — `null` = LA LECTURE N'A PAS EU LIEU. Cet état partait
   * de `new Map()`, et les deux faits étaient donc INDISTINGUABLES: « pas
   * encore lu » et « lu, personne n'a de corps ». `BodyFields` fige ses trois
   * champs AU MONTAGE (`useState(body ? … : "")`), et le panneau d'une ligne
   * se monte au clic — donc une ligne ouverte avant que la lecture revienne
   * affichait trois champs vides sur une bouche renseignée. C'est la cicatrice
   * `mount-snapshot-forms-need-a-loading-gate`, et le cadre « Informations
   * personnelles » ne se rend plus tant que cette lecture est `null`.
   */
  const [bodies, setBodies] = React.useState<
    Map<string, MemberBodyView> | null
  >(null);
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * LOT A2, 2026-09-22 — LE POIDS VISÉ ET LE RYTHME DE CHAQUE BOUCHE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⚠️ `null` = LA LECTURE N'A PAS EU LIEU, et ce n'est pas un état
   * d'affichage: `keel_household_set_member_target` REMPLACE la paire. Le
   * cadre « Informations personnelles » ne monte donc son curseur que quand
   * cette Map existe, et son Enregistrer n'appelle la porte que dans ce cas.
   * Monté sur `null`, il afficherait un champ vide non lu puis l'écrirait —
   * cicatrice `mount-snapshot-forms-need-a-loading-gate`, prise par le bout
   * qui coûte une donnée.
   *
   * ⚠️ `household_members`, PAS `student_goals`. La cible d'un TITULAIRE vit
   * dans sa ligne d'objectif, et elle est déjà lue par `loadOwnMouth`: sa
   * fiche à lui est `MeFiche`, pas `MemberRow`. Les deux colonnes portent le
   * même nom des deux côtés — lire la mauvaise rendrait la valeur de
   * quelqu'un d'autre.
   */
  const [targets, setTargets] = React.useState<
    Map<string, MemberTargetView> | null
  >(null);
  /**
   * LES DATES DE NAISSANCE DES BOUCHES — `null` = pas lu.
   *
   * ⛔ ELLES NE SONT PAS DANS LE ROSTER, ET C'EST VOULU: il rend l'état d'âge,
   * jamais la date (le foyer doit savoir qu'il y a un enfant à table, pas son
   * âge). Une porte scopée au maître la rend
   * (`keel_household_member_birth_date_for_owner`).
   *
   * ⚠️ SANS ELLE, LE CURSEUR DE RYTHME N'EXISTE PAS. Son plafond se calcule sur
   * l'entretien estimé, et `estimatedMaintenanceKcal` rend `null` sans bande
   * d'âge: `paceCeilingFor` rend `null`, `paceControlFor` rend `needs_body`, et
   * la fiche promet un rythme qu'elle ne donne pas. Exactement le défaut mesuré
   * sur l'entonnoir le 2026-09-19.
   *
   * ⛔ ELLE NE SÈME AUCUN CHAMP DE SAISIE. Le champ date de la fiche reste ce
   * qu'il était — vide, et il n'écrit que si on tape: le seeder ferait du Save
   * une réécriture de la date à chaque passage, sur une porte qui a sa propre
   * résolution (`birthDateDoor`).
   */
  const [memberBirthDates, setMemberBirthDates] = React.useState<
    Map<string, string> | null
  >(null);
  /**
   * CE QUE CHAQUE BOUCHE MANGE D'HABITUDE (2026-08-14).
   *
   * ⚠️ `null` VEUT DIRE « PAS ENCORE LU », ET C'EST TOUT LE POINT — pas une
   * carte vide. Une carte vide se lirait « personne n'a d'habitude », et le
   * formulaire monté là-dessus afficherait du vide non lu qu'il ÉCRASERAIT au
   * Save (cicatrice `mount-snapshot-forms-need-a-loading-gate`). La carte
   * reçoit donc `loaded` et n'affiche aucun champ avant.
   *
   * Même discipline de lecture que les corps: la table n'a aucun grant à
   * `authenticated` (spec §G1), donc c'est une RPC, et la demander pour un
   * non-maître rendrait zéro ligne — c'est-à-dire un fait qu'on n'a pas.
   */
  const [habits, setHabits] = React.useState<Map<string, MemberHabitsView> | null>(
    null,
  );
  /**
   * LE DÉJEUNER EN SEMAINE DE CHAQUE BOUCHE (A6, 2026-09-03), par `member_id`.
   *
   * ⚠️ `null` = LA LECTURE N'A PAS EU LIEU, et une `Map` vide = « lu, personne
   * n'a répondu ». Les deux ne se confondent pas: la carte ne pose aucune
   * question sur `null` (cicatrice `mount-snapshot-forms-need-a-loading-gate`),
   * et le repli d'une lecture ratée vit dans `readWorkLunchAnswers` — module
   * pur, mesuré — jamais dans un `catch` d'ici.
   *
   * ⛔ ELLE SE RELIT APRÈS CHAQUE ÉCRITURE, ET AVANT `refresh`. La porte SQL
   * ré-applique son pré-remplissage à chaque écriture, même identique; la
   * carte s'en garde en comparant à CE QUI EST ENREGISTRÉ — et « enregistré »
   * ne redevient vrai que si on relit (`commitWorkLunch`, ordre imposé).
   */
  /**
   * LE GEL (chantier 3, D4). `null` = pas encore lu.
   *
   * ⚠️ L'ÉCRAN NE DÉCIDE PAS DU GEL, il l'affiche. La règle vit en base
   * (`keel_household_is_covered`), la garde vit dans la fonction edge, et ceci
   * n'est que la PHRASE — sans elle, le refus du serveur arriverait comme
   * « non-2xx status code », c'est-à-dire comme une panne.
   *
   * ⚠️ DEPUIS FF-064 (2026-09-09) LA LECTURE N'EST PLUS ICI. Elle est faite une
   * fois par session par `HouseholdAccessProvider`, au-dessus du routeur: le
   * mur de paiement et le bandeau de fin d'essai posent la même question, et
   * trois lectures indépendantes rendent trois réponses qui divergent.
   */
  // ⟳ 2026-09-11 — LA VALEUR N'EST PLUS LUE ICI, ET C'EST VOULU: depuis
  // FF-064 la couverture est posée une fois par `HouseholdAccessProvider`,
  // au-dessus du routeur, et c'est lui qui rend le mur. Cet écran ne fait
  // plus que dépendre de son contexte.
  useHouseholdAccess();
  /**
   * D5 — CE QU'ON SAIT DÉJÀ DU MAÎTRE, ET QUE RIEN D'AUTRE ICI NE LIT.
   *
   * ⚠️ `null` = PAS LU, et tant qu'il l'est, **la fenêtre de sa fiche ne
   * s'ouvre pas**. Ce n'est pas une précaution: `persistMouth` appelle des
   * portes qui REMPLACENT — `setHabits` prend la liste complète, `setTarget`
   * efface à `(null, null)`. Une fenêtre ouverte sur ce qu'on n'a pas lu
   * effacerait donc le poids visé réglé sur `/app/plan` et les habitudes
   * déclarées, sans un mot et en cliquant sur « Enregistrer ». C'est la
   * cicatrice `mount-snapshot-forms-need-a-loading-gate`, prise par l'autre
   * bout: là-bas le formulaire affichait du vide non lu, ici il l'écrirait.
   *
   * La date de naissance et la cible sont les deux seuls faits que ni le
   * roster, ni les corps, ni les habitudes ne rendent. Voir `loadOwnMouth`.
   */
  const [ownMouth, setOwnMouth] = React.useState<KnownOwnMouth | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const weekStart = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  // ⚠️ L'ANCRE DES ENVIES A QUITTÉ CET ÉCRAN AVEC LA CARTE. Elle vit dans le
  // formulaire de demande de `/app/plan`, et elle y est calculée sur la DATE DE
  // DÉPART DU PLAN — pas sur aujourd'hui. C'est ce que le générateur relit
  // (`weekStartOf(starts_on)`), et les deux ancres ne coïncidaient que tant que
  // la fenêtre démarrait forcément aujourd'hui.

  /**
   * ⟳ 2026-09-19 — `awayWindow` EST PARTI AVEC LA GRILLE DE PRÉSENCE. Il
   * résolvait les COLONNES de la grille (`until_sunday`, la même fenêtre que
   * le bouton de composition). La grille n'est plus montée ici: elle vit sur
   * `/app/plan` et dans l'entonnoir, qui résolvent leur fenêtre eux-mêmes.
   */

  const refresh = React.useCallback(async () => {
    if (!userId) return;
    try {
      const hh = await loadHousehold(userId);
      setHousehold(hh);
      if (hh) {
        setRestrictions(await loadRestrictions());
        // ── LOT C · LES DÉGOÛTS, DEPUIS LE MAGASIN DES PRÉFÉRENCES ────────
        // ⛔ ET SURTOUT PAS DEPUIS `restrictions`. Le brouillon de la fiche
        // était semé avec les RÈGLES DE MAISON (`restrictions.map(r => r.label)`);
        // rouvrir la fiche et enregistrer aurait donc RECOPIÉ chaque interdit
        // parental en préférence — une migration de données faite par accident,
        // sur un sens (« goût » ou « interdit ») que personne ne peut déduire
        // d'un libellé. Le sort des lignes existantes est une décision humaine.
        //
        // ⚠️ UNE SEULE LECTURE POUR TOUTE LA PAGE: le magasin vit sur la ligne
        // de la personne qui compose, et le `subject` de chaque item dit de
        // quelle bouche il parle. RLS ne rend que sa propre ligne, donc un
        // membre lit `null` — et un membre n'ouvre pas la fiche des autres.
        setAllergies(await loadAllergies());
        setMeal(await loadHouseholdMeal(weekStart));
        setOwnerGoalRow(await hasOwnerGoalRow(userId));
        // SEUL LE MAÎTRE MARQUE UNE PRÉSENCE, donc seul lui a besoin des
        // lignes de la grille — et lui seul peut les lire: RLS sur
        // `student_goals` ne rend que SA ligne. Le demander pour un membre
        // rendrait `null`, puis le défaut, c'est-à-dire une lecture inutile.
        if (hh.me?.role === "owner") {
          setRhythm(await loadHouseholdRhythm(userId));
          // LES CORPS — MAÎTRE SEUL, et pas parce que l'écran le décide:
          // `keel_household_member_bodies` rend zéro ligne à un non-maître, et
          // la table n'a aucun grant à `authenticated`. La demander pour un
          // membre rendrait une carte vide, c'est-à-dire « personne n'a de
          // corps » — un fait qu'on n'a pas.
          setBodies(await loadMemberBodies());
          // ── LOT A2 · LA CIBLE ET LE RYTHME DE CHAQUE BOUCHE ─────────────
          // MÊME DISCIPLINE QUE LES HABITUDES, ET LE MÊME `null`: un échec
          // dégrade LE SEUL cadre qui en dépend (le curseur ne se rend pas),
          // il ne fait pas tomber les sept autres cartes. Et surtout il RESTE
          // `null` — c'est ce qui empêche un Enregistrer d'effacer la paire
          // qu'on n'a pas su lire.
          // ⚠️ `hh.id` VIDE ⇒ ON NE LIT PAS, ET ON RESTE À `null`.
          // `loadMemberTargets("")` rend une Map VIDE, c'est-à-dire « lu,
          // personne n'a de cible » — un fait qu'on n'a pas.
          try {
            setTargets(hh.id ? await loadMemberTargets(hh.id) : null);
          } catch (e) {
            setTargets(null);
            console.error("[household] member targets unreadable", e);
          }
          // ── LOT A2 · LES DATES, POUR BORNER LE CURSEUR ──────────────────
          // ⚠️ `loadMemberBirthDates` REND UNE MAP PARTIELLE plutôt que de
          // lever: une date absente se lit « corps incomplet » et le curseur
          // le DIT (`pace_needs_body`). C'est une dégradation nommée, pas un
          // silence.
          try {
            setMemberBirthDates(
              await loadMemberBirthDates(hh.members.map((m) => m.memberId)),
            );
          } catch (e) {
            setMemberBirthDates(null);
            console.error("[household] member birth dates unreadable", e);
          }
          // ── LES HABITUDES, ET POURQUOI LEUR ÉCHEC NE TUE PAS L'ÉCRAN ─────
          // Elles ne portent RIEN d'autre sur cette page: les bouches, les
          // allergies, les règles de maison, les corps et le plan se lisent et
          // s'écrivent sans elles. Une lecture qui échoue doit donc dégrader
          // LA SEULE CARTE qui en dépend, pas les six autres — sinon un foyer
          // entier perd `/app/household` pour une carte repliée.
          //
          // ⚠️ CE N'EST PAS UN `catch` MUET, et la différence est le `null`.
          // On ne pose PAS une carte vide (« personne n'a d'habitude », un
          // fait qu'on n'a pas): on laisse `null`, c'est-à-dire « pas lu », et
          // la carte n'affiche alors AUCUN champ. Le défaut reste visible en
          // console au lieu de se déguiser en réponse.
          try {
            setHabits(await loadMemberHabits());
          } catch (e) {
            setHabits(null);
            console.error("[household] habits unreadable", e);
          }
          // D5 — MÊME DISCIPLINE QUE LES HABITUDES, ET LE MÊME `null`. Une
          // lecture qui échoue dégrade LA SEULE carte qui en dépend: la fenêtre
          // de la fiche du maître ne s'ouvre pas, et sa carte retombe sur les
          // trois champs en ligne. Fail-closed, parce que ce que cette lecture
          // porte n'est pas de l'affichage — c'est ce qu'un enregistrement
          // aveugle EFFACERAIT.
          try {
            setOwnMouth(await loadOwnMouth(userId));
          } catch (e) {
            setOwnMouth(null);
            console.error("[household] own mouth unreadable", e);
          }
          // A5 — LES CONTRAINTES PRATIQUES, POUR « PARAMÈTRES DU FOYER ».
          //
          // ⚠️ MÊME `null` QUE LES DEUX AU-DESSUS, et il porte la même garde:
          // c'est la porte de rendu de `KitchenEquipmentCard`. Sept cases
          // décochées affichées pendant la lecture partiraient telles quelles
          // au premier Enregistrer — la carte ne rend donc aucun contrôle tant
          // que c'est `null`, et un échec de lecture y RESTE.
          //
          // ⚠️ C'EST UNE PHOTO, JAMAIS DE QUOI ÉCRIRE: `mergePracticalConstraints`
          // relit la colonne dans la même requête que l'update.
          try {
            setPracticalConstraints(await loadPracticalConstraints(userId));
          } catch (e) {
            setPracticalConstraints(null);
            console.error("[household] practical constraints unreadable", e);
          }
          // A5 §5.5 — CE QUI A DÉJÀ ÉTÉ ENVOYÉ, pour que la ligne le dise.
          // Même `null` fail-closed que les lectures au-dessus.
          if (hh.id) {
            try {
              setInvitations(await loadLiveInvitations(hh.id));
            } catch (e) {
              setInvitations(null);
              console.error("[household] invitations unreadable", e);
            }
          }
          // D17 — même raison que la ligne au-dessus: la table n'est lisible
          // que du maître, et la demander pour un membre rendrait zéro ligne,
          // c'est-à-dire « personne n'est masqué » — un fait qu'on n'a pas.
          setMutedMembers(await loadMutedMembers());
        }
        // ⚠️ LA COUVERTURE N'EST PLUS LUE ICI (FF-064, 2026-09-09). Elle vient
        // de `useHouseholdAccess()`, lu une fois par session au-dessus du
        // routeur: le mur de paiement et le bandeau de fin d'essai posent la
        // MÊME question, et trois lectures indépendantes peuvent rendre trois
        // réponses différentes à une seconde d'intervalle.
      }
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [userId, weekStart]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * A5 §5.5 — LES INVITATIONS, RELUES À PART DE `refresh`.
   *
   * `refresh` ne lit pas `household_invitations`, et une invitation créée est
   * un fait de la page: sans cette relecture, la ligne dirait « jamais invitée »
   * juste après avoir rendu un lien. On ne remet PAS la Map à `null` sur un
   * échec — ce qui a déjà été lu reste vrai.
   */
  const refreshInvitations = React.useCallback(async () => {
    const id = household?.id ?? null;
    if (id === null) return;
    try {
      setInvitations(await loadLiveInvitations(id));
    } catch (e) {
      console.error("[household] invitations reread failed", e);
    }
  }, [household?.id]);

  /**
   * LA COLONNE DU COMPTE, RELUE — A5 point 7, sortie du JSX le 2026-09-19.
   *
   * ⚠️ `refresh` NE LIT PAS `student_goals`. Sans cette relecture, tout ce qui
   * FUSIONNE sur `practical_constraints` (la carte d'équipement, et l'accusé
   * d'allergie d'une bouche) repartirait de la photo d'avant — et la fusion
   * suivante écraserait l'écriture d'avant. Cicatrice
   * `stale-current-erases-the-previous-write`.
   */
  const refreshPracticalConstraints = React.useCallback(async () => {
    if (!userId) return;
    try {
      setPracticalConstraints(await loadPracticalConstraints(userId));
    } catch (e) {
      console.error("[household] pc reread failed", e);
    }
  }, [userId]);

  const run = React.useCallback(
    async (action: () => Promise<{ ok: boolean; reason: string }>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const res = await action();
        // LE MOTIF DE REFUS EST TRADUIT PAR UNE LISTE FERMÉE, et rendu tel quel
        // s'il n'y est pas. Afficher `household_full` à quelqu'un n'est pas une
        // information; afficher « une erreur est survenue » non plus.
        if (!res.ok) setError(householdErrorText(res.reason) ?? res.reason);
        await refresh();
        return res.ok;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * CE QUE LA FICHE DE GOÛTS D'UNE BOUCHE ÉCRIT — 2026-09-19
   * ══════════════════════════════════════════════════════════════════════════
   *
   * L'ORDRE EST CELUI DE `persistMouth`, et ce n'est pas une coquetterie: les
   * habitudes REMPLACENT la liste, les dégoûts et les allergies AJOUTENT, le
   * régime et le rythme remplacent une valeur. Un ordre différent ici ferait
   * diverger deux écrans sur le même jeu de portes au premier correctif.
   *
   * ⛔ ON NE PASSE PAS PAR `persistMouth`, ET C'EST DÉLIBÉRÉ. Lui écrit AUSSI
   * le prénom, la date, la direction, le CORPS et la CIBLE — et ce brouillon-ci
   * ne porte ni corps ni cible (le cadre « Informations personnelles » les
   * tient, avec ses propres lectures). Le lui donner quand même poserait un
   * corps à zéro et effacerait le poids visé au premier enregistrement de
   * goûts: la cicatrice `mount-snapshot-forms-need-a-loading-gate`, prise par
   * le bout qui coûte la donnée.
   *
   * ⚠️ CE QU'IL NE TENTE PAS SUR UNE BOUCHE QUI A UN COMPTE — le régime, le
   * rythme et l'apport fixe. Les trois portes répondent `has_account` (leur
   * source canonique est le « about you » de la personne), et les appeler
   * ferait échouer TOUT l'enregistrement sur un motif qui ne parle d'aucun
   * champ visible. La fiche partagée ne se monte de toute façon pas pour elle
   * (`sharedSheet`); la garde est ici quand même, parce que c'est le second
   * appelant qui l'oublie.
   */
  const saveMemberPreferences = React.useCallback(
    (member: HouseholdMemberView, draft: MouthFormDraft): Promise<boolean> =>
      run(async () => {
        const id = member.memberId;
        const claimed = member.userId !== null;

        // ① SES HABITUDES — la porte pose la liste ENTIÈRE, vide comprise:
        //    retirer la dernière habitude doit pouvoir vider la ligne.
        //    ⟳ 2026-09-23 — LES À-CÔTÉS PARTENT DANS LA MÊME LISTE: la porte
        //    la remplace entière, donc les omettre les effacerait.
        const slots = habitEntriesToWrite({
          habits: draft.habits,
          light: draft.light,
          sideCourses: draft.sideCourses,
          occasions: EATING_OCCASIONS,
        });
        const written = await setMemberHabits(
          id,
          slots,
          habits?.get(id)?.note ?? null,
        );
        if (!written.ok) return written;

        // ② SES DÉGOÛTS — `food.exclude` sur la ligne de qui COMPOSE, avec le
        //    sujet qui dit de quelle bouche on parle. La porte AJOUTE, donc on
        //    n'appelle pas pour rien: une liste vide n'est pas « efface ».
        if (userId && draft.dislikes.length > 0) {
          const res = await writtenDislikeWriter(userId, weekStart)(
            id,
            [...draft.dislikes],
          );
          if (!res.ok) return res;
        }

        // ③ SES ALLERGIES, ET L'ACCUSÉ « ON A DEMANDÉ ». La MÊME porte que
        //    l'entonnoir: elle ajoute les libellés ET marque la bouche dans la
        //    colonne du maître. Sans ce second membre, « aucune » ne s'écrirait
        //    nulle part — et `canGenerate` redemanderait éternellement une
        //    question déjà posée.
        //
        // ⛔ LA COLONNE EST RELUE ICI, JAMAIS PRISE DANS L'ÉTAT D'ÉCRAN — ET
        //    C'EST UN DÉFAUT MESURÉ, PAS UNE PRÉCAUTION. `mergePracticalConstraints`
        //    REMPLACE la colonne par `{...current, ...patch}`. Or la marche ②
        //    juste au-dessus vient d'écrire `practical_constraints.retained_items`
        //    CÔTÉ SERVEUR: nourri de la photo du montage, cet accusé la
        //    réécrivait sans le dégoût. Vu en base le 2026-09-19 — « champignons »
        //    enregistré, puis absent de la colonne à la seconde d'après.
        //    Cicatrice `stale-current-erases-the-previous-write`, et c'est le
        //    même geste que `saveMouthPreferences` dans l'entonnoir, qui relit
        //    lui aussi avant d'accuser.
        if (userId && (draft.allergies.length > 0 || draft.allergiesNone)) {
          await saveMouthAllergies({
            userId,
            memberId: id,
            labels: [...draft.allergies],
            current: await loadPracticalConstraints(userId),
          });
          await refreshPracticalConstraints();
        }

        // ④ SON RÉGIME — `null` n'est pas envoyé: effacer ce que personne n'a
        //    posé n'apporte rien.
        if (!claimed && draft.diet !== "") {
          const res = await setMemberDiet(id, draft.diet);
          if (!res.ok) return res;
        }

        // ⑤ SES MOMENTS. ⛔ JAMAIS UN TABLEAU VIDE: la base refuse
        //    `empty_rhythm`, et « rien coché » veut dire « comme la maison ».
        //    ⚠️ ET `null` EST UNE ÉCRITURE, PAS UN SAUT — c'est la seule façon
        //    de REVENIR au repli après avoir coché un moment.
        if (!claimed) {
          const res = await setMemberRhythm(
            id,
            draft.rhythm && draft.rhythm.length > 0 ? draft.rhythm : null,
          );
          if (!res.ok) return res;
        }

        // ⑥ SON APPORT FIXE. ⚠️ LECTURE FRAÎCHE AVANT D'ÉCRIRE: la porte
        //    REMPLACE le tableau entier, et cette fiche sert à REPRENDRE une
        //    bouche — écrire sans relire y effacerait un second apport.
        //    `shakerCanBeSaved` est la MÊME garde que le bouton du bloc.
        if (!claimed && draft.shaker !== null && shakerCanBeSaved(draft.shaker)) {
          const res = await addShakerToMemberIntakes({
            memberId: id,
            current: await loadMemberFixedIntakes(id),
            shaker: shakerPartialToWrite(draft.shaker),
          });
          if (!res.ok) return res;
        }

        return { ok: true, reason: "" };
      }),
    // ⛔ `practicalConstraints` N'EST PAS UNE DÉPENDANCE, ET SON ABSENCE EST LE
    // CORRECTIF: cette fonction RELIT la colonne au moment d'écrire. L'y
    // remettre remettrait la photo d'écran dans le chemin.
    [run, userId, weekStart, habits, refreshPracticalConstraints],
  );

  if (phase === "loading") {
    return (
      <KeelAppShell title={t("household.title")}>
        <div className="p-4 text-sm text-ink-soft">…</div>
      </KeelAppShell>
    );
  }

  // Extrait AVANT le rendu: `household.me` est une propriété d'un état, donc
  // le rétrécissement de type ne survit pas à l'entrée dans une closure JSX.
  const me = household?.me ?? null;
  const isOwner = me?.role === "owner";
  // ⟳ 2026-09-09 (FF-064) — `frozen` A QUITTÉ CET ÉCRAN AVEC SA CARTE. Un
  // foyer gelé n'atteint plus cette page: `KeelPaywallGate` rend le panneau à
  // sa place, sur les sept routes `/app/*`. Le `=== true` qui protégeait la
  // lecture en cours vit maintenant dans `paywallDecision.ts`, avec ses trois
  // cas de fail-open et leurs tests — il n'a pas disparu, il a une seule
  // maison au lieu d'une par écran.
  /**
   * D5 — CE QU'ON SAIT DÉJÀ DU MAÎTRE, ASSEMBLÉ DES QUATRE LECTURES DE L'ÉCRAN.
   *
   * `null` = **on n'ouvre pas la fenêtre**, et il y a trois façons d'y arriver,
   * toutes délibérées:
   *
   *   · ce n'est pas le maître — `keel_household_set_member_body` répond
   *     `not_owner` à un profil réclamé, donc la fenêtre échouerait à sa
   *     deuxième marche. Un contrôle qui échoue à tous les coups est « pire
   *     qu'un contrôle absent, parce qu'il promet »; sa carte garde les trois
   *     champs en ligne, qui, eux, marchent pour lui;
   *   · une des deux lectures qui REMPLACENT n'a pas abouti (`ownMouth`,
   *     `habits`) — voir l'état plus haut;
   *   · il n'y a pas de ligne membre, donc rien où écrire.
   *
   * ⚠️ CE N'EST PAS UN HOOK, ET C'EST OBLIGATOIRE: `me` n'existe qu'après les
   * gardes de montage, et un `useMemo` posé ici ne s'exécuterait pas au même
   * rang à chaque rendu.
   *
   * ⚠️ LA DIRECTION VIENT DE `student_goals`, PAS DU ROSTER, et elle est
   * RETROUVÉE dans la liste plutôt que castée: un jeton hérité de l'ancienne
   * énumération (`health`, `performance`, `recomposition`) laisse le champ
   * vide au lieu de faire choisir une valeur que le CHECK refuse.
   */
  const meKnown: KnownMouth | null = me === null ? null : knownMouthForOwner({
    isOwner,
    displayName: me.displayName,
    ownMouth,
    // `?? null` — la lecture peut n'avoir pas eu lieu (`bodies === null`);
    // `MeFiche` traite déjà « pas de corps » et « pas lu » de la même façon ici,
    // parce que sa fiche est gardée par `meKnown`, une autre lecture.
    body: bodies?.get(me.memberId) ?? null,
    // ⚠️ `null` TRAVERSE, ET C'EST LE SUJET. `habits` vaut `null` tant que la
    // lecture n'a pas eu lieu (ou a échoué); l'aplatir en `[]` ici dirait « lu,
    // et elle n'en a aucune », et la fenêtre s'ouvrirait sur du vide qu'elle
    // écrirait.
    habits: habits === null
      ? null
      : (habits.get(me.memberId)?.slots ?? []),
    // ⚠️ LA MÊME LECTURE, L'AUTRE MOITIÉ. `slots` porte la prose, `light` le
    // « + repas léger »: `parseHabitSlots` jette les entrées sans prose, qui
    // sont précisément celles des bulles. Sans cette semence, ouvrir la fiche
    // puis enregistrer effacerait une bulle cochée.
    light: habits === null ? {} : (habits.get(me.memberId)?.light ?? {}),
    // ⟳ 2026-09-23 — ET LA TROISIÈME LECTURE DE LA MÊME COLONNE. Sans elle,
    // ouvrir sa fiche puis enregistrer effacerait « jamais de dessert ».
    sideCourses: habits === null
      ? {}
      : (habits.get(me.memberId)?.sideCourses ?? {}),
  });

  /**
   * ── LA FICHE DU TITULAIRE — 2026-09-09 ──────────────────────────────────
   *
   * Elle vivait dans une CARTE À PART au-dessus de la liste, et la liste
   * portait AUSSI sa ligne: deux fiches pour la même personne, deux boutons
   * « Modifier », deux fenêtres qui écrivent les mêmes colonnes. Elle est
   * maintenant la première fiche de la liste, et `MembersCard` retire sa ligne
   * quand elle la rend — voir `ownFiche`.
   *
   * ⛔ AU MAÎTRE SEUL. Un profil réclamé garde SA ligne dans la liste (éditable
   * depuis A5 point 6) et règle sa direction dans son « about you »: lui
   * donner cette fiche-ci lui montrerait un corps et des allergies que la base
   * lui refuse (`not_owner`).
   *
   * ⚠️ `ownerGoalRow !== null` EST UNE GARDE DE LECTURE, pas un état: tant que
   * la ligne `student_goals` n'a pas été CHERCHÉE, la fiche ne peut pas dire
   * si elle débloque quelque chose.
   */
  const ownFiche: OwnFiche | null = me !== null && isOwner && ownerGoalRow !== null
    ? {
      // ── D5 · LA FICHE COMPLÈTE, OU LE REPLI ──────────────────────────
      // « sans quoi celui qui tient la maison serait le seul dont on ne sait
      // rien » (conception §1). `null` = on retombe sur les trois champs —
      // voir `meKnown`.
      sheet: meKnown === null ? null : {
      known: meKnown,
      todayLocalIso: weekStart,
      failure: error,
      onSave: (draft) =>
        run(() =>
          persistMouth(
            // ⚠️ SON `member_id`, ET C'EST TOUTE LA DIFFÉRENCE
            // AVEC LA CARTE D'AJOUT: la bouche EXISTE, donc
            // `persistMouth` prend la marche 1 bis et exige les
            // trois portes ci-dessous.
            mouthToPersist(draft, weekStart, me.memberId),
            {
              // ⛔ INATTEIGNABLE, ET ON LE DIT FORT. `memberId`
              // n'est jamais `null` ici; y arriver voudrait dire
              // que le maître se fait ajouter une seconde fois.
              addMember: () => {
                throw new Error(
                  "[household] MeFiche: the owner's mouth " +
                    "already exists — `addMember` must never " +
                    "be reached from this card.",
                );
              },
              setName: setMemberName,
              // ⚠️ SA DATE VA DANS SON PROFIL, PAS SUR SA FICHE.
              // Depuis `20260812180000`, l'âge d'une bouche QUI A
              // UN COMPTE se résout sur `profiles.birth_date`
              // d'abord: l'écrire sur sa ligne de foyer ferait un
              // champ qui enregistre et ne change rien. Même
              // arbitrage que `birthDateDoor` dans `saveMember`.
              setBirthDate: (_id, d) => setOwnBirthDate(userId, d),
              // ⚠️ `keel_household_set_member_goal` LUI RÉPOND
              // `has_account`: la direction de qui a un compte
              // vit dans son « about you ». Et cette porte-là
              // CRÉE la ligne quand elle manque — c'est le geste
              // qui supprime la falaise `goal_required`.
              setGoal: ownGoalWriter(userId, createOwnerGoalRow),
              setTarget: ownTargetWriter(userId),
              setBody: setMemberBody,
              setHabits: (id, slots, note) =>
                setMemberHabits(id, slots, note),
              // ⚠️ LA PORTE DU COMPTE, ET ELLE IGNORE LE
              // `memberId` QU'ON LUI PASSE. Le stock d'un compte
              // est `student_goals.practical_constraints`, clé
              // sur `user_id`; sa ligne membre porte l'AUTRE
              // colonne (`household_members.fixed_intakes`), que
              // le lecteur du moteur ne relit QUE pour une bouche
              // sans compte. Y écrire serait écrire dans une
              // colonne que personne ne relit.
              setShaker: (_memberId, shaker) =>
                ownShakerWriter(userId)(shaker),
              addAllergy,
              // ⟳ LOT C — LE DÉGOÛT VA DANS `retained_items`,
              // plus dans la table des interdits domestiques.
              // `userId` EST CELUI DE LA PERSONNE QUI COMPOSE:
              // le magasin vit sur SA ligne, et le sujet dit de
              // quelle bouche on parle.
              addDislikes: (id, labels) =>
                writtenDislikeWriter(userId, weekStart)(id, labels),
              // Jamais appelé: la fenêtre ne montre pas le régime
              // à qui a un compte, donc `diet` part `null`.
              setDiet: setMemberDiet,
              // ══════════════════════════════════════════════
              // ⛔ PAS `setMemberRhythm` — MESURÉ LE 2026-09-19
              // ══════════════════════════════════════════════
              //
              // `keel_household_set_member_rhythm` REFUSE un
              // titulaire: `has_account`, « son rythme vit dans
              // SON about you » (migration 20260814120000, et la
              // migration du 2026-09-12 le rappelle noir sur
              // blanc). Vérifié contre la base locale avec son
              // propre JWT: `{"ok": false, "reason":
              // "has_account"}` — même avec `null`, la garde
              // passe AVANT l'écriture.
              //
              // `persistMouth` appelle cette porte à chaque
              // enregistrement, `null` compris: la fiche du
              // titulaire échouait donc en entier, sur un motif
              // qui ne nomme aucun champ visible. Ça ne se
              // voyait pas tant que « comment se passe ta
              // journée » portait la vraie porte juste en
              // dessous; ce bloc est parti le 2026-09-19, et la
              // case des moments de la fiche est désormais LE
              // contrôle — il fallait qu'elle écrive.
              //
              // ⚠️ LA SOURCE CANONIQUE D'UN COMPTE EST SA
              // COLONNE, et c'est celle que l'entonnoir écrit et
              // que le moteur relit (`saveEatingRhythm`).
              //
              // ⛔ LECTURE FRAÎCHE AVANT DE FUSIONNER: la marche
              // d'avant a pu écrire cette même colonne
              // (`retained_items`), et `mergePracticalConstraints`
              // REMPLACE `{...current, ...patch}`. Cicatrice
              // `stale-current-erases-the-previous-write`.
              //
              // ⚠️ `[]` QUAND RIEN N'EST COCHÉ: pour un COMPTE,
              // le vide est la valeur que cette colonne porte
              // déjà (`EatingRhythmCard` l'écrit ainsi sur
              // `/app/plan`) — il n'y a pas de `null` « comme la
              // maison » dans `practical_constraints`.
              setRhythm: async (_memberId, slots) => {
                await saveEatingRhythm({
                  userId,
                  current: await loadPracticalConstraints(userId),
                  rhythm: slots ?? [],
                });
                await refreshPracticalConstraints();
                return { ok: true, reason: "" };
              },
            },
          )
        ),
    },
      slots: habitSlotsFor(me.eatingSlots, rhythm),
      // ⚠️ LA PROMESSE N'EST FAITE QU'À QUI PEUT LA TENIR: « ceci débloque la
      // composition » est vrai pour le maître, et c'est le seul à qui cette
      // fiche est rendue.
      needsGoalRow: !ownerGoalRow,
      // D1: on n'offre le champ que tant que SA ligne n'existe pas. Après,
      // elle se modifie dans son « about you », pas ici.
      goalEditable: !ownerGoalRow,
      onSave: (patch) =>
        saveMember(me, patch, { userId, alsoCreateGoalRow: !ownerGoalRow }),
    }
    : null;

  /**
   * « AJOUTER QUELQU'UN » — AU PIED DE LA LISTE, PLUS DANS SA PROPRE CARTE.
   *
   * ⟳ 2026-09-09: elle portait son titre de section (« ajouter quelqu'un »)
   * juste au-dessus de « qui mange ici » — deux en-têtes pour un seul sujet,
   * les gens du foyer. Le geste allonge la liste: il vit sous elle.
   */
  // `household !== null` — le foyer n'est pas encore lu au premier rendu, et le
  // plafond se compte sur SES bouches. Sans la garde, la constante lirait une
  // longueur sur `null`; avec un `?? 0`, elle ANNONCERAIT un plafond calculé
  // sur rien.
  const addMouth = isOwner && household !== null
    ? (
          <AddMouthCard
            // RIEN N'EST ENCORE DIT DE CETTE PERSONNE: les moments de la
            // maison sont ce sur quoi elle sera servie tant qu'elle n'a
            // pas parlé, donc ce sur quoi on l'interroge.
            slots={habitSlotsFor(null, rhythm)}
            count={household.members.length}
            busy={busy}
            // ⚠️ LA DATE LOCALE EST CALCULÉE UNE FOIS, ICI, ET DESCENDUE.
            // L'âge décide du plafond du curseur et du plancher de la
            // cible; une horloge lue au rendu changerait de réponse à
            // minuit pendant qu'on remplit le formulaire.
            todayLocalIso={weekStart}
            failure={error}
            onAdd={(draft) =>
              // `run` traduit le refus par la liste fermée de
              // `copy/planRefusals.ts` et rafraîchit — donc la fenêtre se
              // remonte sur ce que le serveur a VRAIMENT gardé.
              run(() => persistMouth(mouthToPersist(draft, weekStart), {
                addMember: addHouseholdMember,
                // ⚠️ `null` ×3, ET C'EST LA BONNE RÉPONSE ICI. Cette
                // carte AJOUTE: `addHouseholdMember` écrit déjà le
                // prénom, la date et la direction dans le même geste, et
                // `persistMouth` ne touche ces portes que sur une bouche
                // qui EXISTE. Les brancher quand même rejouerait trois
                // écritures pour la même valeur. La fiche du maître, elle,
                // les branche — c'est son seul chemin.
                setName: null,
                setBirthDate: null,
                setGoal: null,
                setTarget: setMemberTarget,
                setBody: setMemberBody,
                setHabits: (id, slots, note) =>
                  setMemberHabits(id, slots, note),
                // ⟳ BRANCHÉE LE 2026-09-01, ET SON `null` D'AVANT ÉTAIT
                // PÉRIMÉ. Il disait: « cette carte ajoute quelqu'un qui
                // n'a pas de compte, et `fixed_intakes` est clé sur
                // `user_id` » — vrai jusqu'au 2026-08-19, faux depuis:
                // une bouche sans compte a SON stock
                // (`household_members.fixed_intakes`), que le moteur
                // relit déjà. Seul l'écran ne l'appelait pas.
                //
                // ⚠️ LECTURE FRAÎCHE AVANT D'ÉCRIRE: la porte REMPLACE le
                // tableau entier. Sur une bouche qu'on vient de créer il
                // est vide, mais `persistMouth` sert AUSSI à reprendre
                // une fiche — et écrire sans relire y effacerait un
                // second apport.
                setShaker: async (memberId, shaker) =>
                  addShakerToMemberIntakes({
                    memberId,
                    current: await loadMemberFixedIntakes(memberId),
                    shaker,
                  }),
                addAllergy,
                addDislikes: (id, labels) =>
                  writtenDislikeWriter(userId, weekStart)(id, labels),
                setDiet: setMemberDiet,
                setRhythm: setMemberRhythm,
              }))}
          />
    )
    : null;

  // ⚠️ `canCompose` A QUITTÉ CET ÉCRAN AVEC `ComposeCard`, et le GEL l'a suivi
  // le 2026-09-09 (FF-064): un foyer gelé ne voit plus aucune page d'app, donc
  // plus celle-ci. Ce que le gel coupait — la production — reste refusé par le
  // serveur (`household_frozen`, 402, deux générateurs), et ce refus a toujours
  // des mots dans `copy/planRefusals.ts`. Le mur ne l'a pas remplacé: il s'est
  // ajouté devant.

  return (
    <KeelAppShell title={t("household.title")}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
        {error ? (
          // LE ROUGE RESTE, ET LE RAYON CHANGE. Un refus est un ÉTAT du système
          // (charte §2), donc `red-50` / `red-700` — 6,13:1 — ne bouge pas. Le
          // `rounded-md` d'avant était la sixième valeur de rayon de l'écran;
          // le vocabulaire n'en a que deux, et un bandeau est un panneau.
          <div className="rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</div>
        ) : null}

        {!household
          ? <CreateCard busy={busy} onCreate={(n) => run(() => createHousehold(n))} />
          : (
            <>
              {/* ══════════════════════════════════════════════════════════
                  LES MEMBRES DU FOYER — UNE SECTION, UNE FICHE PAR PERSONNE
                  ══════════════════════════════════════════════════════════

                  Trois cartes se succédaient, chacune avec son titre: « ta
                  fiche », « ajouter quelqu'un », « qui mange ici ». Trois
                  en-têtes pour un seul sujet — les gens qui mangent ici —, et
                  la première répétait la troisième. Une section les coiffe
                  maintenant toutes les trois, comme « paramètres du foyer »
                  coiffe ses deux cartes. */}
              <section className="flex flex-col gap-4">
                <SectionLabel>{t("household.members.title")}</SectionLabel>
                <MembersCard
                  ownFiche={ownFiche}
                  footer={addMouth}
                  household={household}
                  todayLocalIso={weekStart}
                  restrictions={restrictions}
                  allergies={allergies}
                  busy={busy}
                  mutedMembers={mutedMembers}
                  rhythm={rhythm}
                  bodies={bodies}
                  // LOT A2 — LES DEUX LECTURES QUI BORNENT ET QUI SÈMENT LE
                  // CURSEUR. `null` traverse: c'est la LIGNE qui distingue
                  // « pas lu » de « lu, rien pour cette bouche ».
                  targets={targets}
                  memberBirthDates={memberBirthDates}
                  // ══════════════════════════════════════════════════════
                  // LOT A2 — LA SEULE PORTE DE LA CIBLE D'UNE BOUCHE
                  // ══════════════════════════════════════════════════════
                  //
                  // ⚠️ `keel_household_set_member_target` REMPLACE LA PAIRE,
                  // et elle est TOUT-OU-RIEN: `(null, null)` efface (le geste
                  // légitime de qui repasse en `maintenance`), un seul des
                  // deux sort en `target_incomplete`. C'est `targetPayloadOf`
                  // qui décide des deux nombres ensemble, côté ligne.
                  //
                  // ⛔ PAS `setOwnTarget` ICI. La cible d'un compte vit dans
                  // `student_goals`, et la fiche d'un compte — le titulaire —
                  // est `MeFiche`, qui passe déjà par `ownTargetWriter`.
                  // Appeler cette porte-ci sur une bouche réclamée écrirait la
                  // colonne que le moteur lit EN PREMIER, donc par-dessus ce
                  // que la personne a réglé chez elle.
                  //
                  // `run` traduit le refus par `copy/planRefusals.ts` et
                  // relit: `target_not_for_minor` et `target_needs_direction`
                  // arrivent en phrase, jamais en jeton nu.
                  onSaveTarget={(memberId, targetWeightKg, paceKgPerWeek) =>
                    run(() =>
                      setMemberTarget(memberId, targetWeightKg, paceKgPerWeek)
                    )}
                  habits={habits}
                  invitations={invitations}
                  // A5 §5.5 — RELIRE LES INVITATIONS, PAS SEULEMENT LA PAGE:
                  // `refresh` ne lit pas `household_invitations`, donc sans cette
                  // relecture la ligne dirait encore « jamais invitée » juste
                  // après avoir créé un lien.
                  onInvited={refreshInvitations}
                  // `run` traduit le refus par la liste fermée de
                  // `copy/planRefusals.ts` et rafraîchit — donc le formulaire se
                  // remonte sur ce que le serveur a VRAIMENT gardé, et un
                  // `bad_slots` arrive en phrase, jamais en jeton nu.
                  onSaveHabits={(memberId, s, n) =>
                    run(() => setMemberHabits(memberId, s, n))}
                  // ⚠️ LE CRAN D'ACTIVITÉ EST RELU ET RENVOYÉ TEL QUEL, ET C'EST
                  // OBLIGATOIRE. Cette RPC est TOUT-OU-RIEN: cet écran-ci ne
                  // pose pas la question (elle vit dans l'entonnoir, à côté de
                  // taille/poids/sexe — voir `FUNNEL_QUESTIONS`), donc corriger
                  // ici un poids sans repasser le cran ferait retomber sur
                  // l'hypothèse 1,5 quelqu'un qui a répondu — en silence, en
                  // cliquant sur « Enregistrer ». C'est la cicatrice « `current`
                  // périmé efface l'écriture d'avant », et `bodies` est la
                  // lecture fraîche de `keel_household_member_bodies`.
                  //
                  // (La base porte la même ceinture: `null` y veut dire « ne
                  // touche pas ». Les deux existent parce que c'est le troisième
                  // appelant, celui qui n'est pas encore écrit, qui casse.)
                  onSaveBody={(memberId, h, w, g, extras) =>
                    run(() =>
                      setMemberBody(
                        memberId,
                        h,
                        w,
                        g,
                        bodies?.get(memberId)?.activityLevel ?? null,
                        // ── ② ET ⑤ — CETTE RANGÉE POSE VRAIMENT CES
                        // QUESTIONS (2026-08-20) ────────────────────────────────
                        // C'est le SEUL chemin d'écriture d'une bouche déjà
                        // inscrite: la fiche du maître et la fiche neuve passent
                        // par `persistMouth`, jamais par ici.
                        //
                        // ⚠️ LES DEUX DRAPEAUX SONT À `true` PARCE QUE LE
                        // FORMULAIRE LES PORTE, et pas parce qu'on a des
                        // réponses. C'est « on a demandé », et c'est ce qui
                        // sépare `not_answered` de `not_asked` dans le compteur —
                        // et ce qui autorise la base à écrire un `null`,
                        // c'est-à-dire à DÉ-répondre.
                        {
                          dayActivity: extras.dayActivity === ""
                            ? null
                            : extras.dayActivity,
                          sportFrequency: extras.sportFrequency === ""
                            ? null
                            : extras.sportFrequency,
                          axesAsked: true,
                          appetite: extras.appetite === "" ? null : extras.appetite,
                          appetiteAsked: true,
                        },
                      )
                    )}
                  // LA FICHE DE GOÛTS D'UNE BOUCHE, EN UN GESTE — elle a
                  // remplacé `onSaveDiet` le 2026-09-19. Même `run` que les
                  // autres: le refus (`bad_diet`, `has_account`, `bad_slots`)
                  // arrive en phrase, et la page se remonte sur ce que la base
                  // a VRAIMENT gardé.
                  onSavePreferences={saveMemberPreferences}
                  onMute={(memberId, next) => run(() => muteMergeProposals(memberId, next))}
                  onSave={(member, patch) => saveMember(member, patch, { userId })}
                  onRemove={(memberId) => run(() => removeHouseholdMember(memberId))}
                  onDetach={(memberId) => run(() => detachHouseholdMember(memberId))}
                  onAddAllergy={(m, l) => run(() => addAllergy(m, l))}
                  onRemoveAllergy={(id) => run(() => removeAllergy(id))}
                  onAddRestriction={(m, l) => run(() => addRestriction(m, l))}
                  onRemoveRestriction={(id) => run(() => removeRestriction(id))}
                />
                {/* FF-064 — LE MÊME COMPOSANT QUE SUR `/app/billing`, et c'est
                    le point: la phrase du prix et la règle « facturé à la
                    réclamation » ne peuvent pas diverger entre l'écran où on
                    décrit les gens et celui où on paie.
                    ⚠️ Le geste PAR LIGNE au-dessus reste: là-haut on invite la
                    personne dont on lit la fiche, ici on part du prix et on
                    choisit qui. Même RPC, mêmes refus nommés. */}
                <ExtraAccessCard
                  household={household}
                  viewerIsOwner={isOwner}
                  onInvited={refreshInvitations}
                />
              </section>

              {/* ── FF-043 · QUI GOUVERNE LA DOCTRINE DU TRONC ──────────────
                  APRÈS la liste des bouches, parce que la question ne se pose
                  qu'une fois qu'on sait qui est à table — et la carte se tait
                  d'elle-même en dessous de deux adultes, ce qui est le cas
                  nominal du produit (un parent, ses enfants). */}
              {/* ── TROIS CARTES SONT PARTIES SUR `/app/plan` (2026-08-13) ──
                  `ReferenceMemberCard`, `EnvyCard` et `ComposeCard`.

                  La règle de partage: cette page décrit LES GENS — qui mange
                  ici, leurs corps, leurs interdits, les invitations, les
                  propositions de fusion. `/app/plan` fabrique LA SEMAINE. Les
                  trois cartes fabriquaient la semaine depuis la page des gens.

                  `ComposeCard` ne déménage pas, elle DISPARAÎT: elle demandait
                  le BUDGET SEUL et codait la fenêtre en dur (« d'ici
                  dimanche »), alors que le formulaire de `/app/plan` pose les
                  deux dates, les jours de cuisine, la durée de session, le
                  budget ET la présence par bouche. Garder les deux aurait fait
                  deux formulaires pour un geste, dont le plus pauvre était
                  celui réservé au maître. */}
              {/* ══════════════════════════════════════════════════════════
                  PARAMÈTRES DU FOYER — A5, 2026-09-03
                  ══════════════════════════════════════════════════════════

                  DEUX FAITS DE MAISON, ET ILS VIVAIENT DANS L'ENTONNOIR. Avec
                  quoi cette cuisine cuisine, et quels repas cette maison ne
                  déplace pas: aucun des deux n'appartient à une PERSONNE, donc
                  aucun n'a sa place dans la fiche d'une bouche — les poser par
                  bouche les ferait demander huit fois, et rien ne dirait
                  laquelle des huit réponses compte.

                  ⛔ ILS VIVAIENT À L'ÉTAPE 3 D'UN ENTONNOIR QU'ON NE REFAIT
                  PAS. Une fois inscrit, personne ne repasse par `/app/setup`:
                  changer de four ou décider que le dimanche est un repas de
                  famille n'avait donc PLUS AUCUN ÉCRAN après l'inscription.
                  C'est le trou que ce déplacement referme.

                  ⚠️ L'ÉQUIPEMENT RESTE AUSSI DANS L'ENTONNOIR, et ce n'est pas
                  une hésitation: le congélateur décide du nombre de courses
                  (lane CUISINE), donc la question doit être posée AVANT le
                  premier plan. C'est la MÊME carte montée à deux endroits —
                  elle lit et écrit elle-même, et relit la colonne avant de
                  fusionner —, pas deux copies. Les traditions, elles, ne
                  gouvernent rien avant le premier plan: elles QUITTENT
                  l'entonnoir, et `TableStepPlanning` disparaît avec.

                  ⚠️ AU MAÎTRE SEUL. `keel_household_set_traditions` refuse
                  `not_owner`, et l'équipement vit dans `student_goals` du
                  maître: montrer à un secondaire deux cartes que la base lui
                  refusera est le bouton mort qu'on évite. */}
              {isOwner ? (
                <section className="flex flex-col gap-4">
                  <SectionLabel>{t("household.settings.title")}</SectionLabel>
                  <KitchenEquipmentCard
                    // LA PHOTO DE LA COLONNE, JAMAIS DE QUOI ÉCRIRE. `null` =
                    // pas encore lu, et c'est la porte de rendu de la carte.
                    practicalConstraints={practicalConstraints}
                    // `false` tant qu'aucune ligne `student_goals` n'existe:
                    // il n'y a rien à mettre à jour, et l'écrivain le dirait
                    // en erreur au lieu de le dire avant le clic.
                    hasGoal={ownerGoalRow === true}
                    onSaved={async () => {
                      // ON RELIT LA COLONNE, PAS SEULEMENT LA PAGE: la carte
                      // se remonte sur ce que le serveur a VRAIMENT gardé, et
                      // `refresh` ne lit pas `student_goals`.
                      if (userId) {
                        try {
                          setPracticalConstraints(
                            await loadPracticalConstraints(userId),
                          );
                        } catch (e) {
                          console.error("[household] pc reread failed", e);
                        }
                      }
                    }}
                  />
                  {/* ELLE LIT ET ÉCRIT SEULE, comme sa voisine: on ne lui
                      passe que de quoi prévenir la page. */}
                  <HouseholdTraditionsCard onSaved={refresh} />
                </section>
              ) : null}

              {/* ── L8/D10 — CE QU'ON PROPOSE AU MAÎTRE ────────────────────
                  APRÈS la composition et AVANT la table: une proposition de
                  fusion se lit une fois qu'on sait qu'un plan existe, et elle
                  explique la table qui vient juste en dessous. La carte se
                  tait d'elle-même pour un secondaire (le serveur refuse 403,
                  et D10 met le geste dans les mains du maître).

                  ⚠️ ET ELLE SE TAIT AUSSI QUAND PERSONNE N'A RÉCLAMÉ SON
                  PROFIL. `mergeCounterparts` est lu ICI et pas dans la carte:
                  le roster est déjà chargé par cette page, et une carte qui
                  irait le relire ferait une seconde lecture du même fait. */}
              <HouseholdMergeCard
                isOwner={isOwner}
                hasCounterpart={mergeCounterparts(household).length > 0}
                onComposed={refresh}
              />
              {/* « À table » est parti sur `/app/plan`, sous le plan: il dit
                  comment on SERT ce que le plan dit qu'on CUISINE, et cet
                  écran-ci ne montre pas le plan. */}
              {/* ── L8/D9 — CE QUE LA MAISON CUISINE, ET CE QUI N'A PAS
                  FUSIONNÉ. Pour un secondaire c'est le seul endroit où le plan
                  du foyer se voit; pour tout le monde, c'est là que la
                  divergence est attribuée à la divergence. */}
              {meal
                ? (
                  <HouseholdPlanCard
                    meal={meal}
                    members={household.members}
                    meMemberId={me?.memberId ?? null}
                    isOwner={isOwner}
                  />
                )
                : null}
              {/* ── ⛔ ICI SE TENAIT `InviteCard` — A5 §5.5, 2026-09-03 ────
                  Une carte en bas de page, avec un menu déroulant qui
                  redemandait « qui invites-tu ? » à quelqu'un qui regardait
                  déjà la ligne de la personne. Elle ne RELISAIT rien non plus:
                  elle n'affichait que le jeton qu'elle venait de créer, donc
                  une invitation envoyée hier était invisible et le maître
                  renvoyait un second lien sans le savoir.

                  L'affordance vit maintenant dans l'EN-TÊTE DE CHAQUE LIGNE
                  (`MemberAccess`), avec trois états dérivés des faits et la
                  date de la dernière invitation vivante. */}
            </>
          )}
      </div>
    </KeelAppShell>
  );

  /**
   * LES TROIS CHAMPS D'UNE BOUCHE, ÉCRITS PAR TROIS PORTES ÉTROITES.
   *
   * Une seule RPC « set_identity(prénom, date, objectif) » serait plus courte
   * et FAUSSE: le roster ne rend jamais la date de naissance, donc un écran ne
   * peut pas la préremplir, et l'envoyer avec le prénom l'effacerait à chaque
   * correction de prénom. D'où la règle d'ici — un champ vide ne s'écrit PAS.
   *
   * ── ⚠️ L'ORDRE DE LA DATE ET DE L'OBJECTIF DÉPEND DE CE QU'ON ÉCRIT
   *    (chantier P3, 2026-09-03) ───────────────────────────────────────────
   * Il était fixe: « la date d'abord, l'objectif ensuite ». Depuis la
   * migration `20260822041500` (lot S4), deux refus symétriques se regardent
   * sur la même ligne — `set_member_birth_date(minor)` refuse
   * `goal_not_for_minor` quand la ligne PORTE `fat_loss`/`muscle_gain`, et
   * `set_member_goal(fat_loss)` le refuse quand la ligne EST déjà datée
   * mineure. L'ordre fixe échouait donc sur le cas nominal de ce lot: une
   * bouche mineure héritée à `fat_loss`, que les tuiles plient à « Manger
   * normalement » et qu'on enregistre avec sa date.
   * La règle est celle de `persistMouth`: une direction qui NE bouge PAS
   * s'écrit D'ABORD (elle passe sur tout âge) et libère la date; une direction
   * qui bouge s'écrit APRÈS la date (elle n'est acceptée que sur un âge adulte
   * ou inconnu).
   */
  async function saveMember(
    member: HouseholdMemberView,
    patch: { firstName: string; birthDate: string | null; goal: MemberGoal | null },
    opts: { userId: string; alsoCreateGoalRow?: boolean },
  ): Promise<boolean> {
    return await run(async () => {
      if (patch.firstName.trim() && patch.firstName.trim() !== member.displayName) {
        const named = await setMemberName(member.memberId, patch.firstName.trim());
        if (!named.ok) return named;
      }
      const writeDate = async () => {
        if (!patch.birthDate) return { ok: true, reason: "" };
        // ── D18 (L9) · MA DATE VA DANS MON PROFIL, PAS SUR MA FICHE ────────
        //
        // Depuis 20260812180000, l'âge d'une bouche QUI A UN COMPTE se résout
        // sur `profiles.birth_date` d'abord. Écrire la mienne sur ma fiche de
        // foyer ferait un champ qui enregistre et ne change rien dès que mon
        // « about you » porte une date — donc un champ décoratif, exactement
        // ce que ce chantier répare partout ailleurs.
        //
        // ⚠️ SEULEMENT LA MIENNE. RLS ne laisse écrire que son propre profil:
        // pour la date de quelqu'un d'autre — un enfant, un conjoint qui n'est
        // jamais passé par son écran — la fiche reste la seule porte, et le
        // repli SQL la fait compter.
        return birthDateDoor(member, opts.userId) === "own_profile"
          ? await setOwnBirthDate(opts.userId, patch.birthDate)
          : await setMemberBirthDate(member.memberId, patch.birthDate);
      };
      // D1 (2026-08-11) — `keel_household_set_member_goal` REFUSE désormais
      // toute bouche qui a un compte (`has_account`). L'appeler quand même
      // ferait échouer l'enregistrement du prénom et de la date, qui eux
      // viennent de passer: une carte cassée par un champ qu'on n'aurait pas
      // dû soumettre. Pour un titulaire, la seule écriture d'objectif permise
      // depuis cet écran est la CRÉATION de sa ligne, juste en dessous.
      const writeGoal = async () => {
        if (member.userId !== null || patch.goal === member.goal) {
          return { ok: true, reason: "" };
        }
        return await setMemberGoal(member.memberId, patch.goal);
      };
      // L'ordre — voir l'en-tête. `isDirectionalGoal` est la même définition
      // que la garde SQL (arbitrage ① de `20260822041500`).
      const [first, second] = isDirectionalGoal(patch.goal)
        ? [writeDate, writeGoal]
        : [writeGoal, writeDate];
      const a = await first();
      if (!a.ok) return a;
      const b = await second();
      if (!b.ok) return b;
      // LA LIGNE QUI SUPPRIME LA FALAISE. Elle n'est écrite QUE si elle
      // n'existe pas: la table porte des CHECK croisés entre l'objectif et les
      // cibles chiffrées, et écraser `goal` ici ferait échouer l'écriture chez
      // ceux qui ont déjà rempli une cible sur `/app/plan`.
      if (opts.alsoCreateGoalRow && patch.goal) {
        await createOwnerGoalRow(opts.userId, patch.goal);
      }
      return { ok: true, reason: "" };
    });
  }
}

/**
 * CE QUI N'APPARTIENT QU'À LA FICHE DU TITULAIRE — un seul objet, exprès.
 *
 * ⚠️ IL VOYAGE D'UN SEUL BLOC de la page à `MembersCard` puis à `MeFiche`.
 * Cinq props éparses auraient laissé un appelant en passer quatre: la fiche se
 * serait rendue, et son seul chemin d'écriture aurait été muet.
 */
export interface OwnFiche {
  /**
   * D5 — SA FICHE COMPLÈTE, ou `null`.
   *
   * `null` REMET LE FORMULAIRE DE REPLI (prénom · date · direction), et ce
   * n'est pas décoratif: c'est le seul qui n'écrase rien quand une des deux
   * lectures qui REMPLACENT n'a pas abouti, et le seul qui CRÉE la ligne
   * `student_goals`. Voir `knownMouthForOwner`.
   */
  sheet: null | {
    known: KnownMouth;
    todayLocalIso: string;
    failure: string | null;
    onSave: (draft: MouthFormDraft) => Promise<boolean>;
  };
  /**
   * LES MOMENTS SUR LESQUELS SA FICHE L'INTERROGE. REQUIS — non passé, la
   * fenêtre reviendrait aux six créneaux en dur, le défaut signalé le
   * 2026-08-19. `habitSlotsFor` porte la cascade.
   */
  slots: readonly EatingOccasion[];
  /** Tant que sa ligne `student_goals` n'existe pas, la composition refuse. */
  needsGoalRow: boolean;
  /**
   * D1 — l'objectif d'un titulaire vit dans son « about you ». On ne l'offre
   * dans le repli que tant que sa ligne N'EXISTE PAS: c'est la CRÉATION qui
   * supprime la falaise.
   */
  goalEditable: boolean;
  /** Le chemin d'écriture du repli — il porte `alsoCreateGoalRow`. */
  onSave: (patch: {
    firstName: string;
    birthDate: string | null;
    goal: MemberGoal | null;
  }) => Promise<boolean>;
}

/**
 * MA FICHE — LA PREMIÈRE DE LA LISTE, ET UNE FICHE COMME LES AUTRES.
 *
 * ── ⟳ 2026-09-09 · ELLE ÉTAIT UNE CARTE À PART, ET C'ÉTAIT UN DOUBLON ─────
 * `MeCard` vivait au-dessus de « qui mange ici », et la liste en dessous
 * portait AUSSI la ligne du titulaire: deux fiches pour la même personne, deux
 * boutons « Modifier », deux fenêtres qui écrivent les mêmes colonnes.
 * Signalé à l'écran (« qui mange ici, ça fait un peu doublon »).
 *
 * Elle est maintenant le PREMIER ÉLÉMENT DE LA LISTE, et `MembersCard` retire
 * la ligne du titulaire quand elle la rend — une personne, une fiche.
 *
 * ⚠️ CE QU'ELLE PORTE EN PLUS DE LA FENÊTRE DE LA FICHE, et pourquoi. En
 * retirant sa ligne de la liste, on lui retirait quatre choses que `MemberRow`
 * lui donnait: son déjeuner de semaine, ses absences, ses allergies déjà
 * enregistrées, et les deux cartes de son compte. Elles sont donc ici. Ce sont
 * les MÊMES composants montés à un second endroit (chacun lit et écrit
 * lui-même), jamais des copies — la règle que `KitchenEquipmentCard` porte
 * déjà entre l'entonnoir et cet écran.
 *
 * ⛔ ELLE N'EST RENDUE QU'AU MAÎTRE. Un profil réclamé garde SA ligne dans la
 * liste (elle est éditable depuis A5 point 6), et sa direction se règle dans
 * son « about you » sur `/app/plan`: lui donner cette fiche-ci lui montrerait
 * un corps et des allergies que la base lui refuse (`not_owner`).
 *
 * ⚠️ EXPORTÉE POUR SON HARNAIS, et pas par commodité: ce qui se prouve est
 * « QU'EST-CE QUE LE LECTEUR VOIT » — que la fiche repliée ne porte AUCUN
 * formulaire, et que les deux formulaires possibles ne coexistent jamais.
 */
export function MeFiche(
  {
    me,
    fiche,
    allergies,
    busy,
    todayLocalIso,
    onRemoveAllergy,
  }: {
    me: HouseholdMemberView;
    /** Tout ce qui n'appartient qu'à SA fiche — voir `MembersCard`. */
    fiche: OwnFiche;
    /** SES allergies, déjà filtrées. La fenêtre les LISTE et les retire. */
    allergies: AllergyView[];
    busy: boolean;
    /**
     * `YYYY-MM-DD` LOCAL, REQUIS — jamais une horloge lue ici. L'âge qui filtre
     * les directions se lit sur la date TAPÉE dans le formulaire de repli.
     */
    todayLocalIso: string;
    onRemoveAllergy: (id: string) => void;
    /**
     * ⟳ 2026-09-19 — SIX PROPS SONT PARTIES AVEC LEURS BLOCS, et il faut savoir
     * lesquelles avant d'en rebrancher une:
     *
     *   `rhythm` · `awayWindow` · `onSaveAway`  — la grille d'absences;
     *   `workLunch` · `workLunchError` · `onSaveWorkLunch` — le déjeuner en
     *      semaine;
     *   `practicalConstraints` · `hasGoal` · `onSavedOwnConstraints` — les deux
     *      cartes du compte (« comment se passe ta journée », « ce que Sophia
     *      sait »).
     *
     * Aucune des trois questions n'a disparu du produit: elles vivent sur
     * `/app/plan` et dans l'entonnoir. Ce qui part est le DOUBLON de cette
     * fiche-ci. Voir le pavé de `MePrefsForm`.
     */
  },
) {
  const { sheet: sheet2, needsGoalRow, goalEditable, slots, onSave } = fiche;
  const [draft, setDraft] = React.useState<MouthDraft>({
    firstName: me.displayName === "—" ? "" : me.displayName,
    birthDate: "",
    goal: (me.goal as MemberGoal | null) ?? "",
  });
  const [saved, setSaved] = React.useState(false);
  // ── D5 · L'ÉTAT DE LA FENÊTRE ──────────────────────────────────────────
  // ⚠️ LES HOOKS SONT INCONDITIONNELS, même quand `sheet` est `null`: une
  // fiche qui gagne sa fenêtre à la deuxième lecture changerait sinon de
  // nombre de hooks entre deux rendus.
  /**
   * QUELLE FENÊTRE EST OUVERTE — 2026-09-19.
   *
   * ⛔ UN ÉTAT À TROIS VALEURS, PAS DEUX BOOLÉENS: deux booléens ont un
   * quatrième état inexprimable à l'écran (les deux ouvertes) mais écrivable
   * en TypeScript — c'est-à-dire deux `createPortal` empilés, que ce dépôt
   * n'a jamais essayés.
   */
  const [sheet, setSheet] = React.useState<"identity" | "preferences" | null>(
    null,
  );
  // ⚠️ SEMÉ DÈS LE PREMIER RENDU, ET RE-SEMÉ À CHAQUE LECTURE DIFFÉRENTE (voir
  // l'effet juste en dessous). L'initialiseur seul laisserait la fiche montrer
  // du vide pendant un battement — « un formulaire qui affiche du vide non lu
  // finit toujours par le faire écrire ».
  //
  // ⚠️ ET IL VIT ICI, PAS DANS LA FENÊTRE: `Modal` démonte ses enfants en se
  // fermant, donc un brouillon posé plus bas serait perdu au premier clic à
  // côté.
  const [sheetDraft, setSheetDraft] = React.useState<MouthFormDraft>(() =>
    sheet2 === null ? emptyMouthDraft() : draftFromKnown(sheet2.known)
  );
  /**
   * ⚠️ ON SÈME SUR LA LECTURE, PAS AU MONTAGE, ET C'EST LA MOITIÉ QUI COMPTE.
   *
   * `setHabits` comme `setTarget` REMPLACENT ce qu'elles trouvent: un brouillon
   * figé au montage rendrait, au deuxième Save, la photo d'AVANT le premier.
   * C'est la cicatrice « `current` périmé efface l'écriture d'avant ».
   *
   * La dépendance est la VALEUR lue, sérialisée: un re-rendu qui rend le même
   * `known` ne touche à rien, donc une saisie en cours survit à tout ce qui
   * n'est pas une lecture différente.
   */
  const knownKey = JSON.stringify(sheet2?.known ?? null);
  React.useEffect(() => {
    if (sheet2 === null) return;
    setSheetDraft(draftFromKnown(sheet2.known));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownKey]);
  // L'ÂGE DU FORMULAIRE DE REPLI: la date tapée gagne sur le roster.
  const meAge = ageStateOfTypedDate(draft.birthDate, me.ageState, todayLocalIso);

  /* ⛔ `filledBlocks` A ÉTÉ RETIRÉ D'ICI — ⟳ 2026-09-21. Il ne servait qu'au
     résumé de la carte, parti le même jour (voir le pavé à son ancienne
     place, sous les deux portes). `filledPreferenceBlocks` reste employé par
     le cadre repliable du formulaire, où le résumé est la contrepartie du
     repli; c'est cet appel-ci, et lui seul, qui n'avait plus de lecteur. */

  return (
    <li className="rounded-card border border-line bg-paper-2 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{me.displayName}</span>
        {me.role === "owner" ? <Badge>{t("household.members.owner")}</Badge> : null}
        {me.goal ? <Badge>{goalLabel(me.goal as MemberGoal)}</Badge> : null}
        {allergies.map((a) => (
          // ⚠️ `allergenLabel` ET PAS LE JETON NU: le catalogue écrit des SLUGS.
          <Badge key={a.id} tone="critical">{allergenLabel(a.label)}</Badge>
        ))}
        {/* MÊME AFFORDANCE QUE LES AUTRES FICHES tant qu'il n'y a rien à
            débloquer. Quand la ligne d'objectif manque, ce bouton est le seul
            geste qui ouvre la composition: il prend alors la teinte de marque,
            et la fiche dit juste en dessous ce qu'il lève. */}
        {needsGoalRow
          ? (
            <Button
              className="ml-auto"
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => setSheet("identity")}
            >
              {t("household.me.open")}
            </Button>
          )
          : (
            /* ── DEUX PORTES, COMME SUR CHAQUE AUTRE LIGNE (2026-09-19) ────
               ⛔ SEULEMENT HORS `needsGoalRow`. Tant que la ligne d'objectif
               manque, il n'y a qu'UN geste sur cette carte — celui qui ouvre
               la composition —, et lui donner un voisin le noierait. */
            /* ── DEUX PORTES, EN BOUTONS — ⟳ 2026-09-21 ───────────────────
               Elles étaient deux textes soulignés, et le motif écrit ici
               disait: « PAS DEUX BOUTONS PLEINS: huit bouches feraient seize
               actions principales ». Renversé sur demande — « ils vont pas
               dans la DA ceux-là ».

               ⚠️ `secondary`, ET C'EST CE QUI GARDE LA MOITIÉ VRAIE DE
               L'ANCIEN MOTIF. Un bouton de contour n'est pas une action
               principale: huit bouches font seize portes lisibles, pas seize
               appels à cliquer. Le plein (`primary`) reste réservé au geste
               qui débloque la composition, juste au-dessus. */
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => setSheet("identity")}
              >
                {t("household.member.frame_identity")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => setSheet("preferences")}
              >
                {t("household.member.frame_preferences")}
              </Button>
            </span>
          )}
      </div>

      {/* ⚠️ UN ÉTAT, PAS UNE PRÉSENTATION. Tant que la ligne `student_goals`
          n'existe pas, `generate-household-meal-v1` rend `goal_required` (409)
          — et on le découvrait après avoir saisi tout le foyer. */}
      {/* ⛔ LE RÉSUMÉ DE LA CARTE EST PARTI — ⟳ 2026-09-21, SUR DEMANDE.
          « Rien de renseigné — le plan se compose sans. Ça se remplit plus
          tard. » / « Déjà renseigné : … » s'écrivait une fois par bouche, sous
          deux portes qui disent déjà où aller.

          ⚠️ CE QU'IL PAYAIT: « une réponse repliée est une réponse invisible »
          (2026-08-19). Ce qui rend le retrait tenable est que les deux portes
          restent, visibles et nommées — ce n'est plus un repli muet, c'est une
          carte sans commentaire.

          ⚠️ L'AVERTISSEMENT D'OBJECTIF, LUI, RESTE. Il ne résume rien: il dit
          qu'une composition RENDRA 409 tant que la ligne manque. */}
      {needsGoalRow
        ? (
          <p className="mt-1 text-xs leading-5 text-amber-800">
            {t("household.me.unlock")}
          </p>
        )
        : null}

      {/* ══════════════════════════════════════════════════════════════════
          DEUX FENÊTRES, DEUX CONTENUS — 2026-09-19
          ══════════════════════════════════════════════════════════════════

          Le détail de ce qui part, et de ce qui le garde ailleurs, est sur
          `MePrefsForm`. Ce qui se lit ici est la mécanique: UN état à trois
          valeurs, donc jamais deux `createPortal` empilés — `Modal` rend `null`
          quand il est fermé, et `sheet` n'en ouvre qu'un.

          ⚠️ ELLES SE DÉMONTENT EN SE FERMANT, et c'est voulu: rouvrir une
          fenêtre la rouvre sur ce que la BASE dit. Le brouillon, lui, vit dans
          la ligne (`sheetDraft`) — il survit donc au passage d'une fenêtre à
          l'autre, ce qui est exactement ce que le bouton « Renseigner tes
          préférences » a besoin de faire. */}
      <Modal
        open={sheet === "identity"}
        onClose={() => setSheet(null)}
        title={me.displayName === "—"
          ? t("household.me.open")
          : t("household.member.identity_title_named", { name: me.displayName })}
        size="lg"
        closeAsIcon
        closeLabel={t("common.close")}
      >
        <div className="flex flex-col gap-3">
          {sheet2 !== null
            ? (
              <MeSheetForm
                draft={sheetDraft}
                onChange={setSheetDraft}
                todayLocalIso={sheet2.todayLocalIso}
                busy={busy}
                failure={sheet2.failure}
                // LE PONT ENTRE LES DEUX FENÊTRES: on ferme celle-ci et on
                // ouvre l'autre, sur le MÊME brouillon.
                onOpenPreferences={() => setSheet("preferences")}
                onSubmit={() => {
                  void (async () => {
                    const ok = await sheet2.onSave(sheetDraft);
                    // ON NE FERME QUE SUR UN SUCCÈS: un refus doit rester SOUS
                    // le geste, dans la fenêtre qui porte le champ fautif.
                    if (ok) setSheet(null);
                  })();
                }}
              />
            )
            : (
              /* ── LE REPLI — LES TROIS CHAMPS ────────────────────────────
                 `sheet2 === null` veut dire qu'une des deux lectures qui
                 REMPLACENT n'a pas abouti. Ce formulaire-ci n'écrit que prénom,
                 date et direction: il n'écrase rien de ce qu'on n'a pas lu, et
                 il reste le seul chemin qui CRÉE la ligne d'objectif.

                 ⚠️ LES DEUX NE COEXISTENT JAMAIS: deux formulaires qui écrivent
                 les mêmes trois colonnes, c'est la garantie qu'un jour l'un des
                 deux cessera d'écrire ce que l'autre écrit. */
              <>
                <MouthFields
                  draft={draft}
                  onChange={(next) => {
                    setSaved(false);
                    setDraft(next);
                  }}
                  mine
                  showKeptDateHint={me.ageState !== "unknown"}
                  goalEditable={goalEditable}
                  ageState={meAge}
                  radioName="household-goal-me"
                />
                {/* L'INCITATION EST INTÉGRÉE, et elle est vraie: un objectif
                    posé sur une bouche sans âge est enregistré et NON APPLIQUÉ
                    (`goalApplies`). Le taire ferait un champ qui ne fait rien. */}
                {me.goal && me.ageState === "unknown" ? (
                  <p className="text-sm text-amber-800">
                    {t("household.member.goal_inactive")}
                  </p>
                ) : null}
                <div className="flex items-center gap-3">
                  <Button
                    variant={needsGoalRow ? "primary" : "secondary"}
                    disabled={busy || !draft.firstName.trim()}
                    onClick={async () => {
                      const ok = await onSave({
                        firstName: draft.firstName,
                        birthDate: draft.birthDate || null,
                        // PLIÉE À L'ÂGE, comme à l'écran.
                        goal: goalForAge(draft.goal, meAge) || null,
                      });
                      setSaved(ok);
                      if (ok) setDraft((d) => ({ ...d, birthDate: "" }));
                    }}
                  >
                    {t("household.member.save")}
                  </Button>
                  {saved ? (
                    <span className="text-sm text-ink-soft">
                      {t("household.member.saved")}
                    </span>
                  ) : null}
                </div>
              </>
            )}
        </div>
      </Modal>

      <Modal
        open={sheet === "preferences"}
        onClose={() => setSheet(null)}
        title={me.displayName === "—"
          ? t("household.mouth.preferences_title")
          : t("household.mouth.preferences_title_named", { name: me.displayName })}
        size="lg"
        closeAsIcon
        closeLabel={t("common.close")}
      >
        <div className="flex flex-col gap-3">
          {sheet2 !== null ? (
            <MePrefsForm
              draft={sheetDraft}
              onChange={setSheetDraft}
              todayLocalIso={sheet2.todayLocalIso}
              busy={busy}
              slots={slots}
              // ══════════════════════════════════════════════════════════
              // « TERMINÉ » ENREGISTRE, PUIS FERME — 2026-09-19
              // ══════════════════════════════════════════════════════════
              //
              // ⛔ LE PIÈGE QUE LE DÉCOUPAGE VENAIT DE CRÉER. Tant que les
              // goûts étaient un accordéon, le bouton « Enregistrer » de la
              // fiche était SOUS eux, dans la même fenêtre: « Terminé » ne
              // faisait que replier, et ça se voyait. En fenêtre séparée, le
              // même bouton est le SEUL geste de fin — et il n'écrivait rien.
              // « Un geste qui ne fait rien est indiscernable d'un geste qui a
              // marché », le mode d'échec n°1 de ce dépôt.
              //
              // ⛔ ET C'EST LA MÊME PORTE, PAS UNE SECONDE. `sheet2.onSave` est
              // exactement ce que « Enregistrer » appelle sur l'autre fenêtre:
              // un brouillon, un écrivain. Deux écrivains sur le même
              // brouillon finiraient par ne pas écrire la même chose.
              //
              // ⚠️ ET IL NE TENTE RIEN QUAND LA FICHE EST RETENUE. `persistMouth`
              // écrit AUSSI le corps: sur un brouillon incomplet il poserait une
              // taille et un poids à ZÉRO. La fenêtre d'identité, elle, nomme ce
              // qui manque à côté de son bouton (`submitIsHeld` y grise déjà le
              // geste) — on referme donc sans écrire, et le brouillon survit
              // dans la ligne.
              onClose={() => {
                if (submitIsHeld(sheetDraft, sheet2.todayLocalIso)) {
                  setSheet(null);
                  return;
                }
                void (async () => {
                  const ok = await sheet2.onSave(sheetDraft);
                  if (ok) setSheet(null);
                })();
              }}
            />
          ) : null}

          {/* ── SES ALLERGIES DÉJÀ ENREGISTRÉES ──────────────────────────
              LA LISTE ET LE RETRAIT, JAMAIS UN SECOND CHAMP D'AJOUT: on ajoute
              dans le catalogue juste au-dessus (`add_allergy` n'a pas de
              « poser la liste »), et deux champs qui ajoutent la même chose
              finiraient par ne pas ajouter la même chose.

              ⚠️ ELLE NE SE REND QUE S'IL Y A QUELQUE CHOSE À RETIRER. C'est ce
              qui la garde compatible avec « cette fenêtre, c'est la fiche de
              goûts et rien d'autre »: sur un compte sans allergie — le cas de
              la capture du 2026-09-19 — elle n'existe pas. Sans elle, une
              allergie enregistrée n'aurait plus AUCUN endroit où se retirer. */}
          {allergies.length > 0 ? (
            <div className="border-t border-line pt-3">
              <SectionLabel>{t("household.constraint.kind.allergy")}</SectionLabel>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {allergies.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-red-700">
                      {allergenLabel(a.label)}
                    </span>
                    <button
                      className="text-ink-soft underline"
                      disabled={busy}
                      onClick={() => onRemoveAllergy(a.id)}
                    >
                      {t("household.allergy.remove")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Modal>
    </li>
  );
}

/**
 * LE CORPS DE LA FICHE DU TITULAIRE — 2026-09-09.
 *
 * ⚠️ UN COMPOSANT À PART, ET C'EST UNE CONTRAINTE DE PREUVE, PAS UN GOÛT. Même
 * raison que `AddMouthForm`, écrite juste en dessous: `Modal` passe par
 * `createPortal(…, document.body)`, et `renderToStaticMarkup` ne rend RIEN d'un
 * portail. Monté à travers le chrome, ce formulaire serait une chaîne vide, et
 * chaque assertion qui le vise serait verte quoi qu'il arrive.
 *
 * ⛔ ET IL N'OUVRE PAS DE SECONDE FENÊTRE. Le bouton des préférences (dans
 * `MouthCoreFields`) bascule l'accordéon qui est JUSTE EN DESSOUS, dans la même
 * fenêtre.
 */
export function MeSheetForm(
  { draft, onChange, todayLocalIso, busy, failure, onOpenPreferences, onSubmit }: {
    draft: MouthFormDraft;
    onChange: React.Dispatch<React.SetStateAction<MouthFormDraft>>;
    todayLocalIso: string;
    busy: boolean;
    failure: string | null;
    /**
     * LE PONT VERS L'AUTRE FENÊTRE. REQUIS — `MouthCoreFields` rend le bouton
     * quoi qu'il arrive; sans geste branché, il ne ferait rien.
     */
    onOpenPreferences: () => void;
    onSubmit: () => void;
  },
) {
  // `/app/household` ne rend cette fiche QUE pour le compte courant: sa ligne
  // EXISTE (`existing`), elle a un compte (`hasAccount`), et la fiche lui parle
  // à la deuxième personne (`isSelf`).
  const subject = { existing: true, hasAccount: true, isSelf: true } as const;

  return (
    <div className="flex flex-col gap-4">
      <MouthCoreFields
        draft={draft}
        onChange={onChange}
        subject={subject}
        todayLocalIso={todayLocalIso}
        busy={busy}
        failure={failure}
        // ⟳ 2026-09-19 — IL OUVRE L'AUTRE FENÊTRE, il ne déplie plus un
        // accordéon: les deux moitiés de la fiche sont deux `Modal` distincts.
        onOpenPreferences={onOpenPreferences}
        onSubmit={onSubmit}
      />
    </div>
  );
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA SECONDE FENÊTRE DU TITULAIRE — SES GOÛTS, ET RIEN D'AUTRE (2026-09-19)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QUE CE DÉCOUPAGE REMPLACE, ET POURQUOI ─────────────────────────────
 * La fiche était UNE fenêtre: le formulaire d'identité, puis un accordéon de
 * goûts, puis le déjeuner en semaine, puis « comment se passe ta journée »,
 * puis « ce que Sophia sait », puis la grille d'absences. Six sujets sous un
 * seul prénom, dont deux posaient DEUX FOIS la même question — les moments de
 * la journée se cochaient dans l'accordéon ET dans la carte du dessous, avec
 * une taille en plus d'un côté.
 *
 * Décision du propriétaire, 2026-09-19: deux fenêtres, deux contenus, et rien
 * d'autre dedans. Ce qui posait la question en double est parti (la carte de
 * rythme), la grille d'absences aussi.
 *
 * ⚠️ CE QUI N'EST PAS PERDU, ET C'EST CE QUI REND LE RETRAIT ACCEPTABLE:
 *   · « comment se passe ta journée » et « ce que Sophia sait » vivent sur
 *     `/app/plan` (`StudentWeekPlanPage`), qui les monte toujours;
 *   · le déjeuner en semaine se pose dans l'entonnoir (`SetupPage`);
 *   · la grille d'absences est celle de `/app/plan` et de l'entonnoir.
 * Aucune de ces quatre surfaces n'a bougé — c'est le DOUBLON de la fiche du
 * foyer qui part.
 *
 * ⚠️ UN COMPOSANT À PART, ET C'EST UNE CONTRAINTE DE PREUVE: `Modal` passe par
 * `createPortal(…, document.body)`, dont `renderToStaticMarkup` ne rend RIEN.
 * Monté à travers le chrome, ce formulaire serait une chaîne vide et chaque
 * assertion qui le vise serait verte quoi qu'il arrive.
 */
export function MePrefsForm(
  { draft, onChange, todayLocalIso, busy, slots, onClose }: {
    draft: MouthFormDraft;
    onChange: React.Dispatch<React.SetStateAction<MouthFormDraft>>;
    todayLocalIso: string;
    busy: boolean;
    /** Les moments sur lesquels sa fiche l'interroge. REQUIS — voir `OwnFiche`. */
    slots: readonly EatingOccasion[];
    onClose: () => void;
  },
) {
  const subject = { existing: true, hasAccount: true, isSelf: true } as const;
  // ⚠️ FF-060 — MÊME VERROU QU'À L'INSCRIPTION. Sans lui, cette fiche laisserait
  // décocher un moment que le parcours d'inscription venait de verrouiller: deux
  // écrans, deux réponses, et celui qui ment est le second.
  const structure = useEatingStructure({
    draft,
    // LA FENÊTRE EST OUVERTE QUAND CE CORPS EST MONTÉ: `Modal` démonte ses
    // enfants en se fermant, donc le montage EST la porte.
    active: true,
    todayLocalIso,
    // LA FICHE DU TITULAIRE, ET ELLE SEULE.
    subject: "self",
  });

  return (
    <MouthPreferencesFields
      draft={draft}
      onChange={onChange}
      subject={subject}
      busy={busy}
      structure={structure}
      onClose={onClose}
      slots={slots}
      // ⟳ `with_the_card` DEPUIS LE 2026-09-01: le stock d'un compte est
      // `student_goals.practical_constraints`, et c'est le bouton de la fiche
      // qui l'écrit (`ownShakerWriter`). Voir `ShakerPort`.
      shakerPort={{ kind: "with_the_card" }}
    />
  );
}

/**
 * AJOUTER UNE BOUCHE — le geste que tout ce chantier existe pour permettre.
 *
 * ── ⚠️ LE FORMULAIRE EST DEVENU UNE FENÊTRE LE 2026-08-18 (lot L5) ────────
 * Trois champs en ligne (prénom, naissance, direction) laissaient une personne
 * inscrite dont on ne savait NI le corps, NI son niveau d'activité, NI ce
 * qu'elle mange déjà — c'est-à-dire une bouche que la composition dimensionne
 * au jugé. La fenêtre pose les six blocs de la conception d'un seul geste.
 *
 * ⚠️ ELLE SE FERME TOUJOURS, et le formulaire NE SE REPLIE PAS tout seul après
 * un ajout: il se vide et se rouvre. Trois personnes d'affilée sans quitter le
 * flux est la mesure de ce lot, et une fenêtre qui se referme à chaque succès
 * la rate.
 */
function AddMouthCard(
  { count, slots, busy, todayLocalIso, failure, onAdd }: {
    count: number;
    busy: boolean;
    todayLocalIso: string;
    /** Le refus du dernier geste, ou `null`. REQUIS — voir `MouthFormDialog`. */
    failure: string | null;
    onAdd: (draft: MouthFormDraft) => Promise<boolean>;
    /**
     * LES MOMENTS DE LA MAISON. REQUIS, même raison qu'ailleurs — et c'est
     * bien CEUX DE LA MAISON: quelqu'un qu'on ajoute n'a encore rien dit de
     * lui, et le repli documenté de `null` sur sa ligne est le rythme du foyer.
     */
    slots: readonly EatingOccasion[];
  },
) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<MouthFormDraft>(emptyMouthDraft);

  // LE PLAFOND REND SON MOTIF. La limite vit en base (`household_full`) et doit
  // tenir face à un appel direct de la RPC; ici on ne fait que la DIRE, et on
  // la dit AVANT le refus plutôt qu'après.
  const full = count >= HOUSEHOLD_MAX_MOUTHS;

  return (
    // ── LE PIED DE LA LISTE, PLUS UNE CARTE À PART (2026-09-09) ────────────
    // Elle était une `Card` avec son propre titre de section (« ajouter
    // quelqu'un ») et sa phrase, posée entre la fiche du titulaire et la liste
    // des bouches: trois en-têtes pour un seul sujet. Le geste allonge la
    // liste — il vit sous elle, séparé par le même trait que les blocs d'une
    // fiche. `household.add.body` est partie des deux packs: elle expliquait
    // un titre qui n'existe plus.
    <div className="mt-3 border-t border-line pt-3">
      {full ? (
        // LE PLAFOND ATTEINT EST UN FAIT, donc l'ambre reste (charte §2:
        // ambre = attention). Ce qui change: le rayon passe au vocabulaire, et
        // l'encre à `amber-800`, la valeur que `Badge tone="caution"` emploie —
        // un état se reconnaît d'un écran à l'autre à sa VALEUR, pas seulement
        // à sa famille.
        <p className="rounded-card bg-amber-50 p-3 text-sm text-amber-800">
          {t("household.add.full")}
        </p>
      ) : (
        <div>
          {/* ── ⟳ A5 POINT 3 — UNE SEULE FENÊTRE, ET TOUT EST DEDANS ───────
              La fiche était EN LIGNE sur la page (les trois blocs
              obligatoires), et les goûts derrière un second écran (`Modal`).
              Deux surfaces pour une seule personne, dont une qui s'ouvrait
              par-dessus l'autre.

              Le bouton ouvre maintenant UNE fenêtre qui porte les deux: les
              blocs obligatoires en ligne, les préférences dans un accordéon
              DEDANS.

              ⛔ PAS DEUX `Modal` IMBRIQUÉS, et ce n'est pas un goût: `Modal`
              passe par `createPortal(document.body)`, et deux portails
              empilés n'ont JAMAIS été essayés dans ce dépôt — ni le piège du
              focus, ni celui de la touche Échap (laquelle ferme?), ni celui du
              défilement de fond. L'accordéon (`SheetFrame`, le troisième usage
              qui le justifie) répond à la même demande sans ouvrir ce
              chantier-là. */}
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setOpen(true)}
          >
            {t("household.add.open")}
          </Button>
          <Modal
            open={open}
            onClose={() => setOpen(false)}
            title={draft.firstName.trim()
              ? t("household.mouth.preferences_title_named", {
                name: draft.firstName.trim(),
              })
              : t("household.add.title")}
            size="lg"
            closeAsIcon
            closeLabel={t("common.close")}
          >
            <AddMouthForm
              draft={draft}
              onChange={setDraft}
              todayLocalIso={todayLocalIso}
              busy={busy}
              failure={failure}
              slots={slots}
              onSubmit={() => {
                void (async () => {
                  const ok = await onAdd(draft);
                  if (!ok) return;
                  // ON VIDE ET ON FERME: le brouillon suivant est celui de
                  // quelqu'un d'autre, et une fenêtre restée ouverte sur les
                  // préférences de la personne d'avant écrirait dans la fiche
                  // de la suivante.
                  setDraft(emptyMouthDraft());
                  setOpen(false);
                })();
              }}
            />
          </Modal>
        </div>
      )}
    </div>
  );
}

/**
 * LE CORPS DE LA FENÊTRE D'AJOUT — A5 point 3, 2026-09-03.
 *
 * ⚠️ UN COMPOSANT À PART, ET C'EST UNE CONTRAINTE DE PREUVE, PAS UN GOÛT.
 * `Modal` passe par `createPortal(…, document.body)`, et `renderToStaticMarkup`
 * ne rend RIEN d'un portail: monté à travers le chrome, ce formulaire serait
 * une chaîne vide, et chaque assertion qui le vise serait verte quoi qu'il
 * arrive. Les tests de ce dépôt montent donc les CORPS, jamais le chrome.
 *
 * ⛔ ET IL N'OUVRE PAS DE SECONDE FENÊTRE. Le bouton des préférences (dans
 * `MouthCoreFields`) bascule l'accordéon qui est JUSTE EN DESSOUS, dans la même
 * fenêtre — deux `createPortal` empilés n'ont jamais été essayés ici.
 */
export function AddMouthForm(
  { draft, onChange, todayLocalIso, busy, failure, slots, onSubmit }: {
    draft: MouthFormDraft;
    onChange: React.Dispatch<React.SetStateAction<MouthFormDraft>>;
    todayLocalIso: string;
    busy: boolean;
    failure: string | null;
    slots: readonly EatingOccasion[];
    onSubmit: () => void;
  },
) {
  // OUVERT PAR DÉFAUT? NON — ET C'EST LE SEUL CADRE DE CE LOT QUI NE L'EST PAS.
  // Les cadres d'une fiche EXISTANTE s'ouvrent parce qu'ils portent des
  // réponses déjà données, qu'on cacherait sinon. Ici il n'y a encore rien à
  // cacher: la personne n'existe pas, et les six blocs de goûts au-dessus du
  // bouton « Ajouter » feraient une fenêtre de trente champs pour quelqu'un qui
  // veut juste inscrire un prénom. Le récapitulatif dit ce qui s'y trouve.
  const [prefsOpen, setPrefsOpen] = React.useState(false);
  const filled = filledPreferenceBlocks(draft);
  // ⚠️ `existing: false` — on l'AJOUTE. `hasAccount: false` — une bouche qu'on
  // saisit n'a jamais de compte au moment où on la saisit; elle en gagne un si
  // elle réclame sa place plus tard.
  const subject = { existing: false, hasAccount: false, isSelf: false } as const;
  // ⚠️ FF-060 — CE FORMULAIRE CALCULE LE SIEN. Il a le brouillon et la date
  // locale; lui faire descendre la structure en prop l'aurait couplé à un
  // parent qui n'a pas besoin de la connaître, et le troisième site de montage
  // aurait fini par l'oublier.
  const structure = useEatingStructure({
    draft,
    active: prefsOpen,
    todayLocalIso,
    // UNE SEULE BOUCHE PAR MONTAGE: la fiche d'ajout ne parle que d'elle.
    subject: "new",
  });

  return (
    <div className="flex flex-col gap-4">
      <MouthCoreFields
        draft={draft}
        onChange={onChange}
        subject={subject}
        todayLocalIso={todayLocalIso}
        busy={busy}
        failure={failure}
        // ⛔ IL BASCULE L'ACCORDÉON, IL N'OUVRE PAS UNE FENÊTRE.
        onOpenPreferences={() => setPrefsOpen((v) => !v)}
        onSubmit={onSubmit}
      />
      <SheetFrame
        title={t("household.member.frame_preferences")}
        open={prefsOpen}
        onToggle={() => setPrefsOpen((v) => !v)}
        // RIEN À LIRE: ce brouillon n'existe qu'ici, il ne vient d'aucune
        // lecture. La garde n'a donc rien à retenir — et c'est le seul site du
        // lot où elle est vraie par construction.
        loaded
        summary={filled.length === 0
          ? t("household.mouth.preferences_empty")
          : t("household.mouth.preferences_filled", {
            blocks: blockList(
              filled.map((b) =>
                t(`household.mouth.block_${b}` as "household.mouth.block_identity")
              ),
            ),
          })}
      >
        <MouthPreferencesFields
          draft={draft}
          onChange={onChange}
          subject={subject}
          busy={busy}
          structure={structure}
          // FERMER L'ACCORDÉON, PAS LA FENÊTRE: la fiche obligatoire est
          // au-dessus, et refermer la fenêtre entière perdrait le geste.
          onClose={() => setPrefsOpen(false)}
          slots={slots}
          // ⟳ ELLE A BIEN OÙ RANGER SON SHAKER DEPUIS LE 2026-08-19
          // (`household_members.fixed_intakes`), et c'est « Ajouter » qui
          // l'écrit: la ligne membre n'existe qu'après. Voir `ShakerPort`.
          shakerPort={{ kind: "with_the_card" }}
        />
      </SheetFrame>
    </div>
  );
}

/**
 * QUI MANGE ICI — la liste, et pour le compte maître, l'endroit où l'on corrige.
 *
 * La carte de restrictions séparée a disparu: elle demandait « pour qui ? »
 * dans un sélecteur alors que la personne est déjà la ligne qu'on regarde. Ce
 * qu'elle portait est ici, PAR BOUCHE, avec la question qui manquait — de
 * quelle nature est cette contrainte.
 */
function MembersCard(
  { household, ownFiche, footer, restrictions, allergies, busy, mutedMembers, rhythm, bodies, targets, memberBirthDates, habits, invitations, onInvited, onSaveHabits, onSavePreferences, onSaveTarget, onSaveBody, onMute, onSave, onRemove, onDetach, onAddAllergy, onRemoveAllergy, onAddRestriction, onRemoveRestriction, todayLocalIso }: {
    household: HouseholdView;
    /**
     * LA FICHE DU TITULAIRE, ou `null` — 2026-09-09.
     *
     * ⛔ QUAND ELLE N'EST PAS `null`, LA LIGNE DU TITULAIRE NE SE REND PAS.
     * C'est toute la raison de cette prop: les deux se rendaient, et la même
     * personne portait deux fiches, deux boutons « Modifier » et deux fenêtres
     * qui écrivent les mêmes colonnes. Une personne, une fiche.
     *
     * `null` = la page n'a pas de quoi la monter (pas de `me`, ou la ligne
     * `student_goals` pas encore lue), ou le lecteur n'est pas le maître: sa
     * ligne reste alors dans la liste, éditable comme avant.
     */
    ownFiche: OwnFiche | null;
    /**
     * CE QUI SE FAIT SOUS LA LISTE — « ajouter quelqu'un », ou `null`.
     *
     * ⚠️ UN SLOT ET PAS UNE CARTE À PART: la carte d'ajout portait son propre
     * titre de section au-dessus de « qui mange ici », ce qui faisait deux
     * en-têtes pour un seul sujet — les gens du foyer. Le geste vit maintenant
     * au pied de la liste qu'il allonge.
     */
    footer: React.ReactNode;
    restrictions: RestrictionView[];
    /* ⛔ `dislikes` A ÉTÉ RETIRÉ DE CETTE CARTE — ⟳ 2026-09-21, avec le
       résumé qui était son seul lecteur. Le pavé qui vivait ici tenait une
       distinction qui reste VRAIE et qui est écrite à sa source
       (`MouthPreferencesFields`): une RÈGLE DE MAISON est une interdiction
       du maître, un DÉGOÛT est une préférence de la bouche. Les confondre
       avait fait réenregistrer chaque règle en préférence au premier
       « Enregistrer » — défaut fermé par le lot C, et rien ici ne le
       rouvre: ce fil ne transporte plus rien. */
    allergies: AllergyView[];
    busy: boolean;
    /** `YYYY-MM-DD` local, descendu à chaque fiche — voir `MeFiche`. */
    todayLocalIso: string;
    /** A5 §5.5 — les invitations vivantes, `null` = pas lu. */
    invitations: Map<string, LiveInvitation> | null;
    /** La page relit ses faits après une invitation créée. REQUIS. */
    onInvited: () => void | Promise<void>;
    /**
     * CE QUE CHAQUE BOUCHE MANGE D'HABITUDE. `null` = PAS ENCORE LU — et la
     * carte n'affiche alors aucun champ. Voir l'état de la page.
     */
    habits: Map<string, MemberHabitsView> | null;
    onSaveHabits: (
      memberId: string,
      slots: HabitSlotWrite[],
      note: string | null,
    ) => Promise<boolean>;
    /**
     * TOUT CE QUE LA FICHE DE GOÛTS D'UNE BOUCHE A COLLECTÉ — 2026-09-19.
     * Il REMPLACE `onSaveDiet`: le régime est une section de la fiche, plus un
     * bloc de boutons à part. Voir `MemberRow`.
     */
    onSavePreferences: (
      member: HouseholdMemberView,
      draft: MouthFormDraft,
    ) => Promise<boolean>;
    /**
     * Les corps saisis, par `member_id`. VIDE pour un non-maître, et pas parce
     * que l'écran le décide: `keel_household_member_bodies` lui rend zéro
     * ligne. La table n'a aucun grant à `authenticated`.
     *
     * ⟳ A5 — `null` = LA LECTURE N'A PAS EU LIEU, et ce n'est PAS « vide ».
     * `BodyFields` fige ses champs au montage: le cadre « Informations
     * personnelles » ne se rend pas tant que c'est `null`.
     */
    bodies: Map<string, MemberBodyView> | null;
    /**
     * LOT A2 — LA CIBLE ET LE RYTHME DE CHAQUE BOUCHE. `null` = PAS LU.
     *
     * ⛔ LA MAP ENTIÈRE DESCEND, `null` COMPRIS, et c'est la ligne qui y
     * cherche la sienne: aplatir ici en `?? new Map()` ferait de « pas lu » un
     * « lu, rien » — c'est-à-dire un curseur vide qu'un Enregistrer écrirait.
     */
    targets: Map<string, MemberTargetView> | null;
    /** LOT A2 — les dates, pour l'âge qui borne le curseur. `null` = pas lu. */
    memberBirthDates: Map<string, string> | null;
    /**
     * LOT A2 — ÉCRIT LA PAIRE, OU L'EFFACE. REQUIS, jamais optionnel: un
     * curseur dont l'écrivain est facultatif est un curseur qui peut ne rien
     * faire, et « un geste qui ne fait rien est indiscernable d'un geste qui a
     * marché ».
     */
    onSaveTarget: (
      memberId: string,
      targetWeightKg: number | null,
      paceKgPerWeek: number | null,
    ) => Promise<boolean>;
    onSaveBody: (
      memberId: string,
      heightCm: number,
      weightKg: number,
      gender: MemberGender,
      /**
       * ② les deux axes · ① les trois cases (2026-08-20), REQUIS.
       *
       * ⛔ Ce sont les questions que la fiche pose maintenant, et cette
       * rangée est le SEUL chemin d'écriture d'une bouche déjà inscrite. Un
       * paramètre facultatif ici aurait laissé le formulaire les afficher et le
       * bouton les jeter — « un champ qu'on remplit et qui ne va nulle part est
       * pire qu'un champ absent, il promet ».
       */
      extras: MouthActivityAndStructure,
    ) => Promise<boolean>;
    /** D17 — les bouches dont on ne veut plus voir les propositions. */
    mutedMembers: Set<string> | null;
    /** Le repli des moments d'une bouche qui n'a rien déclaré. */
    rhythm: EatingOccasionSlot[];
    onMute: (memberId: string, muted: boolean) => void;
    onSave: (
      member: HouseholdMemberView,
      patch: { firstName: string; birthDate: string | null; goal: MemberGoal | null },
    ) => Promise<boolean>;
    onRemove: (memberId: string) => void;
    onDetach: (memberId: string) => void;
    onAddAllergy: (memberId: string, label: string) => void;
    onRemoveAllergy: (id: string) => void;
    onAddRestriction: (memberId: string, label: string) => void;
    onRemoveRestriction: (id: string) => void;
  },
) {
  const me = household.me;
  const isOwner = me?.role === "owner";

  // CÔTÉ MEMBRE NON MAÎTRE: la liste, et SES contraintes, attribuées. §8.5
  // règle 3 — elle voit qu'elle est restreinte ET par qui.
  if (!isOwner) {
    const mine = restrictions.filter((r) => r.memberId === me?.memberId);
    return (
      <Card>
        {/* ⟳ LE TITRE EST REMONTÉ DANS LA SECTION DE LA PAGE (2026-09-09):
            « les membres du foyer » coiffe la liste ET le geste d'ajout, comme
            « paramètres du foyer » coiffe ses deux cartes. */}
        {/* ══════════════════════════════════════════════════════════════
            A5 POINT 6 — SA LIGNE S'ÉDITE, LES AUTRES SE LISENT
            ══════════════════════════════════════════════════════════════

            ⛔ CE QUI ÉTAIT FAUX: la page entière était en lecture seule pour un
            profil réclamé — huit pastilles, et rien d'autre. Or il PEUT écrire
            sur sa propre ligne, et la base le dit: `not_your_line` (et non
            `not_owner`) garde le prénom, la date de naissance, les habitudes,
            les absences et le déjeuner de semaine. Un écran qui ne propose pas
            ce que la base accepte est un écran qui ment par omission, et c'est
            LUI qui décide de ce que la personne peut dire d'elle-même.

            ⚠️ LES AUTRES LIGNES RESTENT DES PASTILLES: prénom et état d'âge.
            Pas un cadre vide, JAMAIS — `keel_household_member_bodies` rend zéro
            ligne à un membre, donc un cadre « personne n'a de corps » affirmerait
            une absence qu'il n'a pas lue. On ne rend pas ce qu'on ne sait pas.

            ⚠️ ET LA FICHE OUVERTE EST BORNÉE PAR `viewerIsOwner`, pas par une
            liste de champs recopiée ici: le corps, le régime, les allergies,
            les règles, l'invitation et les deux retraits ne se rendent pas, un
            par un, à l'endroit où ils sont écrits. Une seconde liste de droits
            divergerait de la première au premier champ ajouté. */}
        <ul className="mb-3 flex flex-col gap-3">
          {household.members.map((m) =>
            m.memberId === me?.memberId
              ? (
                <MemberRow
                  key={m.memberId}
                  member={m}
                  todayLocalIso={todayLocalIso}
                  isMe
                  viewerIsOwner={false}
                  allergies={allergies.filter((a) => a.memberId === m.memberId)}
                  restrictions={restrictions.filter((r) => r.memberId === m.memberId)}
                  busy={busy}
                  // Le réglage de fusion est au maître: `null` = on ne montre
                  // pas un interrupteur dont on ignore la position, et celui-ci
                  // n'est même pas le sien.
                  muted={null}
                  rhythm={rhythm}
                  // ⛔ ZÉRO LIGNE POUR LUI, ET LE CADRE NE SE REND PAS: `body`
                  // reste `null`, mais c'est `viewerIsOwner={false}` qui retire
                  // le bloc — pas cette valeur, qui voudrait dire « lu, rien ».
                  body={null}
                  bodiesLoaded={bodies !== null}
                  // ⛔ LOT A2 · TROIS FAITS QUE LA BASE NE LUI REND PAS, ET LE
                  // CADRE NE SE REND PAS NON PLUS. `keel_household_set_member_
                  // target` répond `not_owner` à un profil réclamé, et
                  // `loadMemberTargets` n'est appelé que dans la branche du
                  // maître: `targets` vaut donc `null` ici, ce qui est la
                  // vérité — « pas lu », pas « rien ». C'est `viewerIsOwner`
                  // qui retire le bloc, comme pour le corps.
                  target={null}
                  targetsLoaded={false}
                  knownBirthDate={null}
                  onSaveTarget={(tw, pw) => onSaveTarget(m.memberId, tw, pw)}
                  // ⚠️ CE COMMENTAIRE A ÉTÉ FAUX, et c'est le défaut n°1 de la
                  // vérification: il affirmait que `MemberAccess` ne rendait
                  // « qu'un état » à un membre, alors que le composant ne
                  // recevait AUCUN fait sur son lecteur et rendait le bouton de
                  // détachement à tout le monde. Il dit maintenant ce que le
                  // code FAIT: la garde est `viewerIsOwner`, passée par
                  // `MemberRow`, et un cas la capture sur le HTML rendu.
                  invitations={invitations}
                  onInvited={onInvited}
                  // ⚠️ MÊME PARTAGE QUE CHEZ LE MAÎTRE: `habitsLoaded` dit si
                  // la LECTURE a eu lieu, `habits` ce qu'elle a trouvé. Le
                  // cadre des préférences ne se rend pas tant que le premier
                  // est faux.
                  habitsLoaded={habits !== null}
                  habits={habits?.get(m.memberId) ?? null}
                  onSaveHabits={(sl, n) => onSaveHabits(m.memberId, sl, n)}
                  onSavePreferences={(d) => onSavePreferences(m, d)}
                  onSaveBody={(h, w, g, extras) => onSaveBody(m.memberId, h, w, g, extras)}
                  onMute={(next) => onMute(m.memberId, next)}
                  onSave={(patch) => onSave(m, patch)}
                  // Câblés mais INATTEIGNABLES depuis cette vue: les deux
                  // boutons ne se rendent pas (`viewerIsOwner={false}`), et la
                  // base les refuserait (`not_owner`). On ne passe pas `null`:
                  // une porte facultative est une porte désarmée, et la même
                  // ligne rendue au maître doit garder ses gestes.
                  onRemove={() => onRemove(m.memberId)}
                  onDetach={() => onDetach(m.memberId)}
                  onAddAllergy={(label) => onAddAllergy(m.memberId, label)}
                  onRemoveAllergy={onRemoveAllergy}
                  onAddRestriction={(label) => onAddRestriction(m.memberId, label)}
                  onRemoveRestriction={onRemoveRestriction}
                />
              )
              : <MemberBadges key={m.memberId} member={m} />
          )}
        </ul>
        {mine.length > 0 ? (
          <>
          <SectionLabel>{t("household.restriction.title")}</SectionLabel>
          <ul className="flex flex-col gap-1 text-sm">
            {mine.map((r) => {
              const notice = restrictionNotice(household, r);
              return (
                <li key={r.id}>
                  <span className="font-medium">{r.label}</span>{" — "}
                  <span className="text-ink-soft">
                    {notice.kind === "set_by_me"
                      ? t("household.restriction.notice_me")
                      : t("household.restriction.notice_owner", { owner: notice.ownerName })}
                  </span>
                </li>
              );
            })}
          </ul>
          </>
        ) : null}
        {/* ⚠️ RENDU DANS LES DEUX BRANCHES, même s'il vaut `null` pour un
            secondaire (`keel_household_add_member` lui répond `not_owner`):
            une prop rendue dans une seule branche est une prop qu'on croit
            passer et qui disparaît en silence. */}
        {footer}
      </Card>
    );
  }

  return (
    <Card>
      <ul className="flex flex-col gap-3">
        {/* ── MA FICHE EN PREMIER, ET UNE SEULE FOIS ────────────────────
            « La première bouche en premier »: tant que la ligne d'objectif du
            compte maître n'existe pas, la composition échouerait — autant le
            lui dire AVANT qu'il saisisse trois personnes. */}
        {ownFiche !== null && me !== null ? (
          <MeFiche
            key={me.memberId}
            me={me}
            fiche={ownFiche}
            allergies={allergies.filter((a) => a.memberId === me.memberId)}
            busy={busy}
            todayLocalIso={todayLocalIso}
            onRemoveAllergy={onRemoveAllergy}
          />
        ) : null}
        {household.members
          // ⛔ SA LIGNE NE SE REND PAS DEUX FOIS. Voir `ownFiche`.
          .filter((m) => !(ownFiche !== null && m.memberId === me?.memberId))
          .map((m) => (
          <MemberRow
            key={m.memberId}
            member={m}
            todayLocalIso={todayLocalIso}
            isMe={m.memberId === me?.memberId}
            viewerIsOwner
            allergies={allergies.filter((a) => a.memberId === m.memberId)}
            restrictions={restrictions.filter((r) => r.memberId === m.memberId)}
            busy={busy}
            // D17 — `null` tant que le réglage n'est pas lu, et `null` aussi
            // quand la lecture a échoué: on ne montre pas un interrupteur dont
            // on ignore la position.
            muted={mutedMembers === null ? null : mutedMembers.has(m.memberId)}
            rhythm={rhythm}
            // `null` = rien de saisi POUR CETTE BOUCHE. La carte des corps est
            // vide pour un non-maître (la RPC lui rend zéro ligne), donc ce
            // bloc ne s'affiche que là où il est légitime.
            body={bodies?.get(m.memberId) ?? null}
            // LA LECTURE DES CORPS, SÉPARÉE DE SON CONTENU — même partage que
            // `habitsLoaded` juste en dessous, et pour la même raison.
            bodiesLoaded={bodies !== null}
            // ── LOT A2 · LA CIBLE, SA LECTURE, ET LA DATE QUI LA BORNE ──────
            // MÊME PARTAGE QUE LES CORPS, ET IL EST OBLIGATOIRE ICI: `target`
            // nul avec `targetsLoaded` vrai veut dire « lu, cette bouche ne
            // vise rien » — une réponse, sur laquelle le curseur part à son
            // maximum. `targetsLoaded` faux veut dire « on ne sait pas », et
            // rien ne doit s'afficher ni s'écrire dessus.
            target={targets?.get(m.memberId) ?? null}
            targetsLoaded={targets !== null}
            // `undefined` DEVIENT `null` — « pas de date lisible ». Le curseur
            // le DIT (`pace_needs_body`) plutôt que de calculer un plafond sur
            // un âge deviné.
            knownBirthDate={memberBirthDates?.get(m.memberId) ?? null}
            onSaveTarget={(tw, pw) => onSaveTarget(m.memberId, tw, pw)}
            invitations={invitations}
            onInvited={onInvited}
            // DEUX `null` QUI NE VEULENT PAS DIRE LA MÊME CHOSE, et c'est le
            // piège du lot. `habitsLoaded` faux = LA LECTURE N'A PAS EU LIEU.
            // `habits` nul avec `habitsLoaded` vrai = LA LECTURE A EU LIEU et
            // personne n'a rien dit de cette bouche. Le second est une
            // réponse; le premier n'en est pas une, et rien ne doit s'afficher
            // dessus.
            habitsLoaded={habits !== null}
            habits={habits?.get(m.memberId) ?? null}
            // A6 — la Map ENTIÈRE descend, `null` compris: c'est la carte qui
            // distingue « pas lu » de « lu, rien pour cette bouche ».
            onSaveHabits={(s, n) => onSaveHabits(m.memberId, s, n)}
            onSavePreferences={(dr) => onSavePreferences(m, dr)}
            onSaveBody={(h, w, g, extras) => onSaveBody(m.memberId, h, w, g, extras)}
            onMute={(next) => onMute(m.memberId, next)}
            onSave={(patch) => onSave(m, patch)}
            onRemove={() => onRemove(m.memberId)}
            onDetach={() => onDetach(m.memberId)}
            onAddAllergy={(label) => onAddAllergy(m.memberId, label)}
            onRemoveAllergy={onRemoveAllergy}
            onAddRestriction={(label) => onAddRestriction(m.memberId, label)}
            onRemoveRestriction={onRemoveRestriction}
          />
        ))}
      </ul>
      {footer}
    </Card>
  );
}

/**
 * ⟳ 2026-09-19 — `MemberAwayOpener` A ÉTÉ RETIRÉ AVEC LA GRILLE DE PRÉSENCE.
 *
 * Il ouvrait « quand cette bouche n'est pas là » depuis la fiche. Décision du
 * propriétaire: la fiche du foyer est deux fenêtres de QUESTIONS, et une
 * absence est une DATE — elle change chaque semaine et se relit chaque semaine.
 *
 * ⛔ LA FONCTIONNALITÉ N'EST PAS MORTE, et c'est ce qui rend le retrait
 * acceptable: `MealPickerGrid` reste montée par `/app/plan` et par l'entonnoir,
 * et `keel_household_set_member_away` n'a pas bougé. Ce qui part est la
 * troisième porte, celle qui vivait au fond d'une fiche de trente champs.
 */

/**
 * LA FICHE D'UNE BOUCHE INSCRITE, DANS LE VOCABULAIRE DE `MouthFormDraft`.
 *
 * ⚠️ `TargetAndPaceFields` PARLE CE VOCABULAIRE-LÀ, et il lui faut le CORPS —
 * pas seulement les deux nombres de la cible. Son plafond est borné par ce
 * corps; sans lui, le curseur retombe sur `needs_body`, c'est-à-dire une fiche
 * qui promet un rythme et n'en donne pas.
 *
 * ⛔ NI DATE NI DIRECTION ICI, ET C'EST DÉLIBÉRÉ: les deux sont DÉRIVÉES au
 * rendu (`rowTargetDraft`), parce que les mettre dans la semence obligerait à
 * les mettre dans la clé — et chaque frappe dans le champ date re-sèmerait le
 * brouillon, donc effacerait un poids visé en cours de saisie.
 */
function memberTargetDraft(
  member: HouseholdMemberView,
  body: MemberBodyView | null,
  target: MemberTargetView | null,
): MouthFormDraft {
  const asText = (n: number | null | undefined) =>
    n === null || n === undefined ? "" : String(n);
  return {
    ...emptyMouthDraft(),
    firstName: member.displayName === "—" ? "" : member.displayName,
    goal: (member.goal as MemberGoal | null) ?? "",
    heightCm: asText(body?.heightCm),
    weightKg: asText(body?.weightKg),
    gender: body?.gender ?? "",
    activityLevel: body?.activityLevel ?? "",
    dayActivity: body?.dayActivity ?? "",
    sportFrequency: body?.sportFrequency ?? "",
    appetite: body?.appetite ?? "",
    targetWeightKg: asText(target?.targetWeightKg),
    paceKgPerWeek: asText(target?.paceKgPerWeek),
  };
}

function MemberRow(
  { member, isMe, viewerIsOwner, allergies, restrictions, busy, muted, rhythm, body, bodiesLoaded, target, targetsLoaded, knownBirthDate, onSaveTarget, habits, habitsLoaded, invitations, onInvited, onSaveHabits, onSavePreferences, onSaveBody, onMute, onSave, onRemove, onDetach, onAddAllergy, onRemoveAllergy, onAddRestriction, onRemoveRestriction, todayLocalIso }: {
    member: HouseholdMemberView;
    isMe: boolean;
    /**
     * QUI REGARDE — A5 point 6, 2026-09-03. REQUIS, jamais optionnel: non
     * passé, il vaudrait `undefined`, donc « pas maître », et la fiche du
     * MAÎTRE perdrait le corps, le régime et les allergies sans que rien ne
     * casse. Une garde facultative est une garde désarmée.
     *
     * ⛔ IL NE DÉCIDE DE RIEN, IL RECOPIE CE QUE LA BASE REFUSE DÉJÀ. Le corps
     * (`set_member_body`), le régime, les allergies, les règles de maison,
     * l'invitation et les deux retraits répondent tous `not_owner`; les rendre
     * à un membre serait poser des contrôles que la base refusera, c'est-à-dire
     * des boutons morts. Ce qui RESTE à un membre sur sa propre ligne est ce
     * que la base lui accepte (`not_your_line` et non `not_owner`): son prénom,
     * sa date, ses habitudes, ses absences, son déjeuner de semaine.
     *
     * ⛔ ET IL NE CACHE JAMAIS UN CADRE VIDE: un membre ne voit pas « personne
     * n'a de corps », il ne voit PAS LE CADRE. `keel_household_member_bodies`
     * lui rend zéro ligne, donc un cadre monté là-dessus affirmerait une
     * absence qu'il n'a pas lue.
     */
    viewerIsOwner: boolean;
    /** `YYYY-MM-DD` local — l'âge des tuiles se lit sur la date tapée. */
    todayLocalIso: string;
    allergies: AllergyView[];
    restrictions: RestrictionView[];
    /* ⛔ `dislikes` A ÉTÉ RETIRÉ DE CETTE LIGNE — ⟳ 2026-09-21. Ses
       `food.exclude` n'étaient lus que par le résumé de la carte, parti le
       même jour, et le fil entier (page → `MembersCard` → ici) est remonté
       avec. La DONNÉE, elle, n'a pas bougé: `loadDislikes` la charge toujours
       dans l'état de la page, et c'est la fenêtre des préférences qui la lit
       et l'édite, par sa propre porte. */
    busy: boolean;
    /** `null` = rien de saisi. Voir `BodyFields`: la bouche a une part standard. */
    body: MemberBodyView | null;
    /**
     * Faux = LA LECTURE DES CORPS N'A PAS EU LIEU — distinct de `body === null`
     * (« lue, cette bouche n'a pas de corps »). Le cadre « Informations
     * personnelles » ne rend rien tant que c'est faux: `BodyFields` fige ses
     * trois champs au montage, et un cadre monté sur une lecture non faite
     * affiche du vide non lu.
     */
    bodiesLoaded: boolean;
    /**
     * ══════════════════════════════════════════════════════════════════════
     * LOT A2, 2026-09-22 — SON POIDS VISÉ ET SON RYTHME
     * ══════════════════════════════════════════════════════════════════════
     *
     * `null` = LU, et cette bouche ne vise rien. Distinct de `targetsLoaded`
     * faux, qui veut dire « on ne sait pas ».
     */
    target: MemberTargetView | null;
    /**
     * LA LECTURE A-T-ELLE EU LIEU ? REQUIS — jamais optionnel.
     *
     * ⛔ C'EST LA PORTE DE CHARGEMENT DU CURSEUR, et elle ne protège pas un
     * affichage: `keel_household_set_member_target` REMPLACE la paire. Monté
     * sur du vide non lu, le bloc afficherait « pas de poids visé » sur une
     * bouche qui en a un, et « Enregistrer » l'effacerait.
     */
    targetsLoaded: boolean;
    /**
     * SA DATE DE NAISSANCE TELLE QUE LA BASE LA REND, ou `null`.
     *
     * ⛔ LE ROSTER NE LA REND JAMAIS (il rend l'état d'âge), et sans elle
     * `estimatedMaintenanceKcal` n'a pas de bande d'âge: le curseur retombe sur
     * `needs_body`, c'est-à-dire une fiche qui promet un rythme et n'en donne
     * pas. Mesuré sur l'entonnoir le 2026-09-19, même cause.
     *
     * ⚠️ ELLE NE SÈME PAS LE CHAMP DE SAISIE, elle BORNE le curseur. La date
     * tapée dans la fiche gagne sur elle — c'est la même règle que `rowAge`.
     */
    knownBirthDate: string | null;
    /**
     * ÉCRIT LA PAIRE, OU L'EFFACE. REQUIS.
     *
     * ⚠️ LES DEUX NOMBRES PARTENT ENSEMBLE: la porte est tout-ou-rien, et un
     * seul des deux sort en `target_incomplete`.
     */
    onSaveTarget: (
      targetWeightKg: number | null,
      paceKgPerWeek: number | null,
    ) => Promise<boolean>;
    /** `null` = LA LECTURE A EU LIEU et personne n'a rien dit de cette bouche. */
    habits: MemberHabitsView | null;
    /** Faux = la lecture n'a PAS eu lieu. Les deux `null` sont distincts. */
    habitsLoaded: boolean;
    /**
     * A5 §5.5 — LES INVITATIONS VIVANTES DU FOYER, `null` = pas lu. La Map
     * ENTIÈRE descend: c'est la ligne qui y cherche la sienne, et c'est elle
     * qui distingue « pas lu » de « lu, jamais invitée ».
     */
    invitations: Map<string, LiveInvitation> | null;
    /** La page relit ses faits après une invitation créée. REQUIS. */
    onInvited: () => void | Promise<void>;
    onSaveHabits: (slots: HabitSlotWrite[], note: string | null) => Promise<boolean>;
    /**
     * TOUT CE QUE LA FICHE DE GOÛTS A COLLECTÉ, EN UN GESTE — 2026-09-19.
     *
     * ⚠️ REQUIS, JAMAIS OPTIONNEL. Le cadre monte `MouthPreferencesFields` et
     * son bouton: sans porte branchée, il collecterait six blocs et les
     * jetterait, ce qui est strictement pire que de ne pas les demander — « un
     * champ qu'on remplit et qui ne va nulle part promet ».
     *
     * ⛔ L'ÉCRIVAIN VIT DANS LA PAGE (`saveMemberPreferences`), pas ici: il lui
     * faut le `user_id` de la session (les dégoûts et l'accusé d'allergie
     * vivent sur SA ligne), la lecture fraîche des habitudes, et `run` pour que
     * le refus arrive en phrase. Une ligne n'a aucun de ces trois faits.
     */
    onSavePreferences: (draft: MouthFormDraft) => Promise<boolean>;
    /**
     * ⟳ `onSaveDiet` EST PARTI LE 2026-09-19, AVEC SES BOUTONS. Le régime est
     * une SECTION de `MouthPreferencesFields`, et il part avec le reste par
     * `onSavePreferences`. Le garder aurait laissé deux portes sur
     * `keel_household_set_member_diet` — celle du bloc et celle de la fiche —
     * dont une seule se voit.
     */
    onSaveBody: (
      h: number,
      w: number,
      g: MemberGender,
      extras: MouthActivityAndStructure,
    ) => Promise<boolean>;
    /** D17 — `null` = le réglage n'a pas pu être lu. Voir l'interrupteur. */
    muted: boolean | null;
    rhythm: EatingOccasionSlot[];
    onMute: (muted: boolean) => void;
    /**
     * ⟳ 2026-09-19 — HUIT PROPS SONT PARTIES AVEC LEURS BLOCS. Avant d'en
     * rebrancher une, lire le pavé des deux fenêtres, plus bas:
     *
     *   `awayWindow` · `onSaveAway`                       — la grille d'absences;
     *   `workLunch` · `workLunchError` · `onSaveWorkLunch` — le déjeuner en
     *      semaine;
     *   `practicalConstraints` · `hasGoal` · `onSavedOwnConstraints` — les deux
     *      cartes du compte.
     *
     * Les trois questions vivent toujours: sur `/app/plan` et dans l'entonnoir.
     */
    onSave: (
      patch: { firstName: string; birthDate: string | null; goal: MemberGoal | null },
    ) => Promise<boolean>;
    onRemove: () => void;
    onDetach: () => void;
    onAddAllergy: (label: string) => void;
    onRemoveAllergy: (id: string) => void;
    onAddRestriction: (label: string) => void;
    onRemoveRestriction: (id: string) => void;
  },
) {
  /**
   * ⟳ 2026-09-23 · FF-066 LOT 4 — LA CONFIRMATION EN DEUX TEMPS DE « RETIRER DU
   * FOYER ». Le commentaire du bouton la promettait depuis A5; le bouton
   * appelait `onRemove` au premier clic, et la base effaçait la ligne (sa part,
   * ses allergies, ses règles de maison) sans retour possible.
   */
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  /**
   * QUELLE FENÊTRE EST OUVERTE — 2026-09-19.
   *
   * ⟳ IL REMPLACE `open` + `identityOpen` + `prefsOpen`. Les deux moitiés de la
   * fiche étaient deux CADRES repliables dans une seule fenêtre (A5, D5.1); ce
   * sont deux FENÊTRES, et la ligne ouvre celle qu'on vient chercher.
   *
   * ⛔ TROIS VALEURS, PAS DEUX BOOLÉENS: deux booléens ont un quatrième état
   * inexprimable à l'écran — les deux fenêtres ouvertes, c'est-à-dire deux
   * `createPortal` empilés, que ce dépôt n'a jamais essayés.
   *
   * ⚠️ IL VIT DANS LA LIGNE: rouvrir une ligne la rouvre sur ce que la base
   * dit, jamais sur l'état laissé par la ligne d'à côté.
   */
  const [sheet, setSheet] = React.useState<"identity" | "preferences" | null>(
    null,
  );
  const openSheet = (frame: "identity" | "preferences") => setSheet(frame);
  const [draft, setDraft] = React.useState<MouthDraft>({
    firstName: member.displayName === "—" ? "" : member.displayName,
    birthDate: "",
    goal: (member.goal as MemberGoal | null) ?? "",
  });
  // LA NATURE EST DEMANDÉE, PAS DEVINÉE. Les deux libellés vont dans deux
  // tables différentes et n'ont pas le même effet sur le repas.
  const [kind, setKind] = React.useState<"allergy" | "house_rule">("allergy");
  /**
   * PEUT-ON POSER UN INTERDIT DE MAISON SUR CETTE BOUCHE ? — §8.5 règle 1.
   *
   * ⛔ `=== "minor"`, ET SURTOUT PAS `!== "adult"`. `unknown` (aucune date de
   * naissance) doit être refusé DU CÔTÉ DU MAJEUR: « un produit où un adulte
   * peut contrôler en silence l'alimentation d'un autre adulte est un outil de
   * contrôle coercitif ». Un `!== "adult"` rouvrirait la porte sur toute bouche
   * dont personne n'a tapé l'âge — c'est-à-dire le cas le plus courant, et
   * exactement la cicatrice « ceinture armée sur coffre vide ».
   *
   * ⚠️ CE N'EST PAS LA GARDE, C'EST SON AFFICHAGE. La garde vit dans
   * `keel_household_add_restriction` (migration `20260903180000`), qui refuse
   * `not_a_minor`. Un écran qui cache un contrôle ne ferme rien: il rend le
   * défaut plus difficile à voir. Les deux existent, et le refus a des mots.
   */
  const canSetHouseRule = member.ageState === "minor";
  /**
   * CE QUE LE BOUTON ÉCRIRA VRAIMENT.
   *
   * ⚠️ L'ÉTAT `kind` NE SE REMET PAS À ZÉRO TOUT SEUL quand la fiche change de
   * bouche. Le dériver ici plutôt que de le corriger dans un effet évite
   * l'instant — court, mais réel — où le formulaire montre « allergie » et le
   * gestionnaire de clic tient encore « règle de maison ».
   */
  const effectiveKind = canSetHouseRule ? kind : "allergy";
  const [label, setLabel] = React.useState("");
  // L'ÂGE DES TROIS CHAMPS: la date tapée gagne sur ce que le roster a compris.
  // C'est ce qui fait qu'une date de mineur tapée sur une bouche à `fat_loss`
  // plie la direction À L'ÉCRAN, avant le Save — et que le Save passe.
  const rowAge = ageStateOfTypedDate(draft.birthDate, member.ageState, todayLocalIso);

  /* ══════════════════════════════════════════════════════════════════════
     LOT A2, 2026-09-22 — LE BROUILLON DE SA CIBLE
     ══════════════════════════════════════════════════════════════════════

     ⚠️ IL PORTE LE CORPS, PAS SEULEMENT LES DEUX NOMBRES. `paceControlFor`
     borne le curseur SUR CE CORPS-LÀ: un brouillon réduit à
     `{goal, targetWeightKg}` proposerait un rythme calculé sur un corps
     inexistant, c'est-à-dire un nombre inventé qui entre ensuite dans un
     calcul d'énergie avec l'autorité d'une mesure.

     ⚠️ ET IL SE RE-SÈME QUAND LA LECTURE CHANGE. `run` relit après chaque
     écriture; un `useState` initialisé une seule fois garderait la photo
     d'AVANT l'enregistrement, et le second Save reposerait cette photo —
     cicatrice `stale-current-erases-the-previous-write`. La clé est la
     VALEUR lue, donc une saisie en cours survit à tout re-rendu qui ne
     change pas la base. */
  const [targetDraft, setTargetDraft] = React.useState<MouthFormDraft>(() =>
    memberTargetDraft(member, body, target)
  );
  const targetSeed = `${target?.targetWeightKg ?? ""}|${
    target?.paceKgPerWeek ?? ""
  }|${body?.heightCm ?? ""}|${body?.weightKg ?? ""}|${body?.gender ?? ""}|` +
    `${body?.dayActivity ?? ""}|${body?.sportFrequency ?? ""}|${member.goal ?? ""}`;
  // ⚠️ UN `useState`, PAS UN `useRef` — motif « ajuster l'état pendant le
  // rendu »: la clé de semence doit participer au rendu qui la compare.
  const [targetSeededFrom, setTargetSeededFrom] = React.useState(targetSeed);
  if (targetSeededFrom !== targetSeed) {
    setTargetSeededFrom(targetSeed);
    setTargetDraft(memberTargetDraft(member, body, target));
  }
  /**
   * LA DIRECTION ET LA DATE SONT **DÉRIVÉES**, PAS SEMÉES — ET C'EST LA MÊME
   * RAISON QUE DANS L'ENTONNOIR.
   *
   * Les mettre dans la clé de semence ferait re-semer le brouillon à CHAQUE
   * frappe dans le champ date ou à chaque clic sur une tuile — donc effacerait
   * un poids visé en cours de saisie. On les dérive: le brouillon garde ce
   * qu'on y tape, le curseur voit l'âge et la direction que la fiche montre.
   *
   * ⚠️ CHANGER DE DIRECTION VIDE LA CIBLE, comme sur la fiche d'ajout: les
   * deux n'ont de sens que sous la direction qui les a produits, et
   * `household_members_target_needs_direction_check` refuse une cible sur
   * `maintenance`.
   */
  const rowShownGoal = goalForAge(draft.goal, rowAge);
  const rowTargetDraft: MouthFormDraft = {
    ...(rowShownGoal === targetDraft.goal ? targetDraft : {
      ...targetDraft,
      goal: rowShownGoal,
      targetWeightKg: "",
      paceKgPerWeek: "",
    }),
    // LA DATE TAPÉE GAGNE SUR CELLE DE LA BASE — même règle que `rowAge`.
    birthDate: draft.birthDate || (knownBirthDate ?? ""),
  };
  /**
   * LE CURSEUR SE REND-IL ? — TROIS PRÉMISSES, ET CHACUNE EST UN REFUS DE LA
   * BASE OU UNE LECTURE MANQUANTE.
   *
   *   · `viewerIsOwner` — `keel_household_set_member_target` répond
   *     `not_owner`. Un contrôle qui échoue à tous les coups est pire qu'un
   *     contrôle absent, « parce qu'il promet »;
   *   · `member.userId === null` — D1: la cible de qui a un COMPTE vit dans
   *     son « about you » (`student_goals`), et le moteur lit
   *     `household_members` EN PREMIER. Écrire ici par-dessus poserait, sur
   *     la colonne prioritaire, un nombre que la personne n'a pas réglé.
   *     C'est la même frontière que `goalEditable`, quelques lignes plus bas;
   *   · `targetsLoaded` — la porte de chargement. Voir la prop.
   */
  const showTarget = viewerIsOwner && member.userId === null && targetsLoaded;

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * LA FICHE DE GOÛTS D'UNE BOUCHE EST CELLE DE L'ENTONNOIR — 2026-09-19
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ── LE DÉFAUT, DIT PAR LE PROPRIÉTAIRE ─────────────────────────────────
   * « les préférences alimentaires, c'est pas la même chose dans le foyer que
   * dans l'onboarding […] les dispos, c'est des dispos de tout temps, genre
   * matin midi et soir; là c'est confondu avec les dispos pour faire le plan ».
   *
   * Et c'était exact, littéralement. Cette fiche ne posait JAMAIS la question
   * « à quels moments cette personne mange-t-elle ? »: elle montait
   * `HouseholdHabitsCard` sur `habitSlots`, c'est-à-dire sur sa ligne SI elle
   * en a une, sinon sur le rythme DE LA MAISON — celui avec lequel le plan se
   * compose. Une bouche sans ligne (le cas nominal: on vient de l'ajouter)
   * héritait donc des moments du foyer, sans que rien à l'écran ne permette de
   * dire qu'elle, elle ne déjeune pas. La seule surface qui posait la question
   * était l'entonnoir, et on ne repasse pas par l'entonnoir.
   *
   * ── CE QUI REMPLACE ────────────────────────────────────────────────────
   * `MouthPreferencesFields` — LE MÊME COMPOSANT que la fenêtre de
   * l'entonnoir, la fiche du maître et la fiche d'ajout. Même ordre de
   * sections (régime → allergies → dégoûts → moments+habitudes), mêmes champs,
   * et la case d'un moment porte la ligne d'habitude qu'elle ouvre.
   *
   * ⛔ IL N'Y A PLUS DE SECOND FORMULAIRE SUR CES COLONNES. Les boutons de
   * régime écrits ici, la carte d'habitudes et le champ libre d'allergie sont
   * partis avec ce lot: ils écrivaient les mêmes portes avec d'autres mots, et
   * c'est exactement la plaie « deux formulaires sur les mêmes colonnes ».
   *
   * ── ⚠️ ET ELLE SE MONTE POUR TOUTE BOUCHE QUE LE MAÎTRE OUVRE ──────────
   *
   * ⟳ 2026-09-19, SECOND PASSAGE — `sharedSheet` a valu, quelques heures,
   * `viewerIsOwner && member.userId === null`. Le motif tenait sur le papier:
   * `set_member_diet` et `set_member_rhythm` répondent `has_account`, donc deux
   * sections seraient inertes sur une bouche réclamée. Il a été renversé par le
   * propriétaire, en une phrase: « quand tu cliques sur Informations
   * personnelles et Préférences alimentaires, ça ouvre la même chose que dans
   * l'étape 2 de l'onboarding ». Deux fiches différentes selon qu'une bouche a
   * réclamé son accès, c'est deux produits pour une même question.
   *
   * ⚠️ ET C'EST DÉJÀ CE QUE FAIT L'ENTONNOIR, à la ligne près: `MouthRow` monte
   * cette même fiche sur une bouche réclamée, et `writeMouthPreferences` SAUTE
   * les portes que la base refuse (`claimed`). Le même arbitrage vaut ici, avec
   * le même écrivain: voir `saveMemberPreferences`, marches ④ ⑤ ⑥.
   *
   * ⛔ CE QUI RESTE GARDÉ, ET QUI EST UN REFUS DE LA BASE: `add_allergy` répond
   * `not_owner`. Un membre qui regarde SA propre ligne ne reçoit donc pas cette
   * fiche — il garde sa carte d'habitudes, la seule porte que la base lui
   * ouvre ici. Son régime et ses moments se règlent dans son « à propos de
   * toi », comme avant.
   */
  const sharedSheet = viewerIsOwner;
  /**
   * CE QUE LE CHAMP LIBRE DE CE CADRE ÉCRIRA VRAIMENT.
   *
   * ⚠️ IL PLIE DEUX FOIS, ET LES DEUX PLIS SONT DES REFUS DE LA BASE, PAS UN
   * GOÛT: `add_restriction` répond `not_a_minor` sur une bouche majeure
   * (§8.5 règle 1), et le catalogue d'allergènes de la fiche partagée reprend
   * l'allergie dès qu'il est monté — il ne reste alors que la règle de maison.
   *
   * ⛔ ET ÇA SE DÉRIVE, ÇA NE SE CORRIGE PAS DANS UN EFFET: l'état `kind`
   * survit au changement de bouche, donc il y aurait un instant — court, réel —
   * où le formulaire montre une nature et le gestionnaire de clic en tient une
   * autre.
   */
  const constraintKind: "allergy" | "house_rule" = sharedSheet
    ? "house_rule"
    : effectiveKind;

  /**
   * LE BROUILLON DE SES GOÛTS — SEMÉ SUR LA LECTURE, JAMAIS SUR LE MONTAGE.
   *
   * ⚠️ CE QUI EST SEMÉ EST CE QUE LA PORTE REMPLACE: les habitudes et les
   * bulles (`set_member_habits` pose la liste ENTIÈRE), le rythme
   * (`set_member_rhythm` REMPLACE la ligne) et le régime. Ouvrir la fiche sur
   * du vide non lu puis enregistrer effacerait les trois — c'est la cicatrice
   * `mount-snapshot-forms-need-a-loading-gate`, prise par le bout qui coûte la
   * donnée, et c'est très exactement ce que l'entonnoir a payé le 2026-09-01
   * sur ce même rythme.
   *
   * ⛔ CE QUI N'EST PAS SEMÉ N'EST PAS UN OUBLI: les allergies et les dégoûts
   * s'AJOUTENT (`add_*`, il n'existe pas de « poser la liste »), donc les semer
   * les rejouerait à chaque enregistrement. Ils se retirent là où ils sont
   * LISIBLES — la liste au bas de ce cadre. Même règle que `draftFromKnown`.
   */
  const prefsSeed = React.useMemo<MouthFormDraft>(() => ({
    ...emptyMouthDraft(),
    firstName: member.displayName === "—" ? "" : member.displayName,
    goal: (member.goal as MemberGoal | null) ?? "",
    diet: member.diet ?? "",
    rhythm: member.eatingSlots,
    habits: Object.fromEntries(
      (habits?.slots ?? []).map((h) => [h.slot, h.usual]),
    ),
    light: { ...(habits?.light ?? {}) },
    // ⟳ 2026-09-23 — SEMÉS POUR LA MÊME RAISON QUE LES BULLES: `emptyMouthDraft`
    // les met à `{}`, et la porte REMPLACE la liste — oublier cette ligne ne
    // casse aucun type, et efface le réglage au premier « Terminé ».
    sideCourses: { ...(habits?.sideCourses ?? {}) },
  }), [
    member.displayName,
    member.goal,
    member.diet,
    member.eatingSlots,
    habits,
  ]);
  const [prefsDraft, setPrefsDraft] = React.useState<MouthFormDraft>(prefsSeed);
  /**
   * ⟳ 2026-09-23 — LA RÉPONSE D'UN CLIC SUR SES À-CÔTÉS, LE TEMPS DE L'ÉCRITURE.
   *
   * `null` = rien en vol: le champ montre la LECTURE. Sans cet état, le bouton
   * cliqué ne s'allumerait qu'après l'aller-retour et la relecture — un geste
   * qui a l'air de ne rien faire. Un refus remet `null`, donc la lecture, qui
   * n'a pas bougé: l'écran ne garde jamais une réponse que la base a refusée.
   */
  const [sidePending, setSidePending] = React.useState<SideCoursesDraft | null>(null);
  /**
   * ⚠️ LA DÉPENDANCE EST LA VALEUR LUE, SÉRIALISÉE — comme `MeFiche`. Un
   * re-rendu qui rend la même lecture ne touche à rien, donc une saisie en
   * cours survit à tout ce qui n'est PAS une lecture différente; et une
   * lecture qui arrive après le montage re-sème au lieu de laisser le vide.
   */
  const prefsSeedKey = JSON.stringify(prefsSeed);
  React.useEffect(() => {
    setPrefsDraft(prefsSeed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsSeedKey]);
  /**
   * FF-060 — LE MÊME PLANCHER QU'À L'INSCRIPTION. Sans lui, cette fiche
   * proposerait un nombre de moments différent de celui que l'entonnoir vient
   * de proposer pour la même personne: deux écrans, deux réponses, et celui
   * qui ment est le second.
   *
   * `active` SUIT LE CADRE OUVERT: rien n'est calculé pour huit bouches dont
   * les fenêtres sont fermées.
   */
  const prefsStructure = useEatingStructure({
    draft: prefsDraft,
    // LA FENÊTRE DES GOÛTS EST OUVERTE, ET ELLE MONTE LA FICHE PARTAGÉE.
    active: sheet === "preferences" && sharedSheet,
    todayLocalIso,
    // ⚠️ UNE LIGNE PAR BOUCHE, DONC UN CROCHET PAR BOUCHE — mais le nom est
    // passé quand même: c'est la garde qui empêche une réponse de traverser,
    // et une garde qu'on ne pose « que là où ça peut arriver » finit par
    // manquer là où ça arrive.
    subject: `member:${member.memberId}`,
  });

  /* ⛔ `filledBlocks` A ÉTÉ RETIRÉ D'ICI — ⟳ 2026-09-21, même geste et même
     raison que sur la carte du titulaire: son seul lecteur était le résumé
     de la carte. Le pavé qui portait ses trois gardes (allergies lues et
     non semées, `allergiesNone` qui sous-clame, `dislikes` jamais semé
     depuis les règles de maison) vivait ici; ces gardes restent VRAIES et
     écrites dans `filledPreferenceBlocks` et dans le cadre qui l'appelle. */

  /**
   * LES MOMENTS DE CETTE PERSONNE — les LIGNES de la carte des habitudes.
   *
   * ⚠️ LES SIENS, PAS UNE LISTE DE SIX (spec §H1). Quelqu'un qui ne prend pas
   * de collation ne doit pas lire une ligne vide toutes les semaines.
   *
   * `member.eatingSlots` est DÉJÀ tranché par le roster entre son « about you »
   * (si elle a un compte) et sa ligne (sinon) — cet écran ne refait pas la
   * résolution. `null` n'est pas une absence de donnée: il veut dire « aux
   * moments de la maison », et le repli est donc le rythme du foyer, celui-là
   * même avec lequel la composition tourne.
   */
  const habitSlots = React.useMemo<EatingOccasion[]>(() => {
    // La TAILLE ne sert pas ici — cette carte liste des lignes d'habitude, pas
    // des portions —, mais elle voyage maintenant avec le moment (2026-08-14),
    // donc on prend le `slot` des deux côtés du repli plutôt que d'un seul.
    const raw = (member.eatingSlots ?? rhythm).map((r) => r.slot);
    // Le vocabulaire fermé du moteur, et l'ordre de LA JOURNÉE. Un jeton
    // inconnu s'écarte plutôt que de fabriquer une ligne qu'on ne saurait pas
    // nommer à l'écran.
    const asked = new Set(raw);
    return EATING_OCCASIONS.filter((s) => asked.has(s));
  }, [member.eatingSlots, rhythm]);

  return (
    // ── UNE FICHE PAR PERSONNE (2026-09-09) ─────────────────────────────────
    // C'était une rangée d'une liste séparée par un trait, qui dépliait trente
    // contrôles SOUS elle: à huit bouches, la page devenait un formulaire dont
    // on ne voyait plus où l'un finissait. Chaque personne est maintenant une
    // carte qui tient en trois lignes — son prénom, ce qui la gouverne, ce qui
    // est déjà renseigné — et tout ce qui s'ÉDITE est dans sa fenêtre.
    // `paper-2` ET PAS `paper`: la fiche est posée DANS une carte, et `paper`
    // est le fond de cette carte — huit fiches y seraient huit traits fins.
    // `paper-2` est le jeton du « fond de section alterné », et son couple avec
    // `ink` reste à 15,02:1.
    <li className="rounded-card border border-line bg-paper-2 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{member.displayName}</span>
        {member.role === "owner" ? <Badge>{t("household.members.owner")}</Badge> : null}
        {member.ageState === "minor" ? <Badge>{t("household.members.child")}</Badge> : null}
        {member.goal ? <Badge>{goalLabel(member.goal as MemberGoal)}</Badge> : null}
        {/* ── DEUX PASTILLES MAISON PASSENT AU KIT, ET LEURS TONS SONT DES FAITS
            ─────────────────────────────────────────────────────────────────────
            Elles se dessinaient à la main (`rounded bg-…-50 px-2 py-0.5`), avec
            un rayon qui n'était ni celui d'une carte ni celui d'une pastille.
            Le TON n'est pas un choix de couleur, il nomme ce que la ligne fait
            au repas:
              · une ALLERGIE rejoint l'union de sécurité du générateur et
                gouverne toute la casserole — rien ne se compose si on ne peut
                pas la lire. C'est un refus: `critical`.
              · une RÈGLE DE MAISON est une décision domestique. Elle n'est
                l'état de rien dans le système, et la faire ressembler à un
                verdict de santé est précisément le mensonge que §8.5 interdit.
                Donc `neutral` — une étiquette, et c'est tout. */}
        {allergies.map((a) => (
          // ⚠️ `allergenLabel` ET PAS LE JETON NU — même raison que la liste
          // de la fiche: le catalogue écrit des SLUGS, et une pastille
          // « peanut » sur un écran français est une donnée rendue brute.
          <Badge key={a.id} tone="critical">{allergenLabel(a.label)}</Badge>
        ))}
        {restrictions.map((r) => (
          <Badge key={r.id} tone="neutral">{r.label}</Badge>
        ))}
        {/* ══════════════════════════════════════════════════════════════
            DEUX PORTES SUR LA LIGNE, PAS UNE — 2026-09-19
            ══════════════════════════════════════════════════════════════

            Il y avait « Modifier », qui ouvrait la fenêtre sur SES DEUX CADRES
            ouverts: on arrivait sur trente champs, et la question qu'on venait
            poser — « qu'est-ce qu'elle mange, elle ? » — était à un défilement
            de là. Demandé le 2026-09-19: « pour chaque personne il faut la
            partie info personnelles et la section préférences alimentaires
            directement accessibles depuis la ligne ».

            ⚠️ UNE SEULE FENÊTRE, DEUX ENTRÉES. Le bouton ne choisit pas un
            écran, il choisit le cadre qui s'OUVRE (`openOn`); l'autre reste
            replié, avec son récapitulatif, et se déplie d'un clic. Deux
            fenêtres distinctes auraient dédoublé l'état de la fiche, et
            `Modal` démonte ses enfants — le brouillon d'un cadre ne survivrait
            pas au passage à l'autre.

            ⟳ 2026-09-21 — ELLES ÉTAIENT DEUX TEXTES SOULIGNÉS. Le motif
            d'alors: « PAS DEUX BOUTONS PLEINS: huit bouches feraient seize
            actions principales ». Renversé sur demande — « ils vont pas dans
            la DA ceux-là ».

            ⚠️ `secondary`, ET C'EST CE QUI GARDE LA MOITIÉ VRAIE DE L'ANCIEN
            MOTIF: un bouton de contour n'est pas une action principale. Le
            plein reste au geste qui débloque la composition. */}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openSheet("identity")}
          >
            {t("household.member.frame_identity")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openSheet("preferences")}
          >
            {t("household.member.frame_preferences")}
          </Button>
        </span>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ⛔ ICI SE TENAIT « CE QUE LA FICHE REPLIÉE DIT QUAND MÊME » — RETIRÉ
             LE 2026-09-21, SUR DEMANDE.
          ══════════════════════════════════════════════════════════════════

          Une ligne par bouche: « Rien de renseigné — le plan se compose sans.
          Ça se remplit plus tard. », ou « Déjà renseigné : ses dégoûts et son
          régime. » Sur un foyer de trois, trois lignes de gris sous trois
          paires de portes.

          ⚠️ CE QU'ELLE PAYAIT, ET IL FAUT LE SAVOIR: « une réponse repliée est
          une réponse invisible » (2026-08-19). La carte est repliée, donc elle
          disait ce qu'elle cache. Ce qui rend le retrait tenable est que les
          deux portes restent nommées et visibles — et elles sont maintenant
          des boutons, donc plus lisibles qu'avant.

          ⚠️ `filledPreferenceBlocks`, `habitsLoaded` ET LES DEUX CLÉS RESTENT
          VIVANTS: le cadre repliable du formulaire (`SheetFrame summary=`) les
          emploie toujours, et là-bas le résumé EST la contrepartie du repli —
          on y referme un formulaire qu'on vient de remplir. Les retirer
          « puisque la carte ne s'en sert plus » casserait cet autre écran. */}

      {/* ── A5 §5.5 · L'ACCÈS, DANS L'EN-TÊTE DE LA LIGNE ─────────────────
          Il vivait dans une carte tout en bas, derrière un menu déroulant qui
          redemandait « qui invites-tu ? » — une question à laquelle la ligne
          qu'on regarde répond déjà. Il est ici, et il se lit SANS ouvrir la
          fiche: l'état d'accès est un fait de l'en-tête, pas une préférence.

          ⚠️ HORS DES DEUX CADRES, exprès: inviter et retirer un accès sont des
          GESTES, pas des réponses à un formulaire. */}
      <MemberAccess
        member={member}
        // ⛔ QUI REGARDE, ET C'EST CE QUI MANQUAIT. Sans ce fait, un membre
        // réclamé lisait un bouton « Retirer son accès » que la base refuse
        // `not_owner`. Voir le pavé de la prop.
        viewerIsOwner={viewerIsOwner}
        invitation={invitations?.get(member.memberId) ?? null}
        // `null` = PAS LU ≠ « personne n'a été invité ». La ligne n'annonce
        // alors aucune date, et propose « Inviter » plutôt que « Renvoyer ».
        invitationsLoaded={invitations !== null}
        busy={busy}
        onDetach={onDetach}
        onInvited={onInvited}
      />

      {/* ══════════════════════════════════════════════════════════════════
          DEUX FENÊTRES, DEUX CONTENUS — 2026-09-19
          ══════════════════════════════════════════════════════════════════

          La fiche était UNE fenêtre à deux cadres repliables (A5, 2026-09-03),
          et sous ces deux cadres vivaient encore quatre choses: le déjeuner en
          semaine, « comment se passe ta journée », « ce que Sophia sait », et
          la grille d'absences. Six sujets sous un seul prénom, dont DEUX
          posaient la même question — les moments de la journée se cochaient
          dans le cadre des goûts ET dans la carte de rythme, avec une taille en
          plus d'un côté.

          Décision du propriétaire, 2026-09-19: deux fenêtres, deux contenus,
          rien d'autre dedans. Le pavé de `MePrefsForm` dit ce qui part et où ça
          continue de vivre (`/app/plan`, l'entonnoir) — aucune question n'a
          disparu du produit, c'est le doublon de cette fiche-ci qui part.

          ⛔ UN ÉTAT À TROIS VALEURS, PAS DEUX BOOLÉENS: deux `createPortal`
          empilés n'ont jamais été essayés dans ce dépôt — ni le piège du focus,
          ni celui d'Échap, laquelle fermerait les deux d'un coup.

          ⚠️ ELLES SE DÉMONTENT À LA FERMETURE (`Modal` rend `null`), et c'est
          voulu: rouvrir une fenêtre la rouvre sur ce que la BASE dit, jamais
          sur l'état laissé par la fiche d'à côté. `BodyFields` et le brouillon
          de goûts figent leurs champs au montage — un état gardé entre deux
          ouvertures serait la photo périmée que « `current` périmé efface
          l'écriture d'avant » décrit. */}
      <Modal
        open={sheet === "identity"}
        onClose={() => setSheet(null)}
        // LE TITRE NOMME LA PERSONNE **ET** LA MOITIÉ QU'ON VIENT D'OUVRIR:
        // c'est aussi l'`aria-label` du dialogue, et il y en a deux maintenant.
        // « — » (le tiret du roster pour un prénom vide) ne nomme personne.
        title={member.displayName === "—"
          ? t("household.mouth.title")
          : t("household.member.identity_title_named", {
            name: member.displayName,
          })}
        size="lg"
        closeAsIcon
        closeLabel={t("common.close")}
      >
        {/* ⛔ LA GARDE DE CHARGEMENT EST LA MÊME QU'AVANT, elle a juste changé
            de porteur: `BodyFields` fige ses trois champs AU MONTAGE, et monté
            sur une lecture non faite il affiche du vide non lu — que
            « Enregistrer » écrirait par-dessus un corps renseigné. Cicatrice
            `mount-snapshot-forms-need-a-loading-gate`. */}
        {bodiesLoaded ? (
        <div className="flex flex-col gap-3">
          <MouthFields
            draft={draft}
            onChange={setDraft}
            mine={isMe}
            showKeptDateHint={member.ageState !== "unknown"}
            // D1 — une bouche qui a un compte règle son objectif elle-même.
            goalEditable={member.userId === null}
            ageState={rowAge}
            radioName={`household-goal-${member.memberId}`}
          />
          {member.goal && member.ageState === "unknown" ? (
            <p className="text-sm text-amber-800">
              {t("household.member.goal_inactive")}
            </p>
          ) : null}

          {/* ── LE CORPS DE CETTE BOUCHE (2026-08-12) ──────────────────────
              Y COMPRIS POUR UN MINEUR, ET C'EST LE RENVERSEMENT. Avant ce lot,
              un enfant n'avait ni corps ni enveloppe ni add-on: il mangeait le
              tronc commun, c'est-à-dire — dans un foyer où un adulte est en
              déficit — LE DÉFICIT DE CET ADULTE, sans rien en plus.

              Ce que le formulaire collecte ne ressort JAMAIS: pas au prompt
              pour un mineur, pas dans une consigne de service, pas dans un log
              nominatif. Il entre dans le moteur et en ressort en grammes. */}
          {/* ⛔ LE CORPS EST AU MAÎTRE (A5 point 6). `set_member_body` répond
              `not_owner`, et `keel_household_member_bodies` rend ZÉRO LIGNE à
              un membre: le cadre monté sur cette lecture affirmerait « personne
              n'a de corps », une absence qu'il n'a pas lue. Il ne le voit donc
              pas — il ne lit pas « rien ». */}
          {viewerIsOwner ? (
          <BodyFields
            body={body}
            busy={busy}
            // L'ÉQUATION DÉPEND DE L'ÂGE, et celle d'un enfant n'est pas celle
            // d'un adulte. Sans date, aucune des deux ne s'applique: la bouche
            // garde une part standard, jamais réduite.
            needsBirthDate={member.ageState === "unknown"}
            onSave={onSaveBody}
          />
          ) : null}

          {/* ══════════════════════════════════════════════════════════════
              LOT A2, 2026-09-22 — LE POIDS VISÉ ET LE CURSEUR DE RYTHME
              ══════════════════════════════════════════════════════════════

              ── LE FAIT MESURÉ ────────────────────────────────────────────
              Cette fiche n'en portait AUCUN des deux. Conséquence sur le
              foyer de test: une bouche réglée à 0,45 kg/semaine avant le
              resserrement du 2026-09-21 restait figée là, alors que sa borne
              était passée à 0,80 — et personne, sur aucun écran, ne pouvait
              l'y amener. Le curseur existait pourtant, à deux endroits
              (l'entonnoir et la fiche d'ajout); il manquait exactement là où
              on va corriger quelqu'un qui est déjà inscrit.

              ── ⚠️ SOUS LE CORPS, ET PAS AU-DESSUS ────────────────────────
              Le plafond du curseur est borné par ce corps: tant qu'il manque,
              ce bloc ne rend qu'une phrase (`pace_needs_body`) qui renvoie
              « juste au-dessus ». Le monter avant `BodyFields` ferait pointer
              cette phrase vers un bloc situé PLUS BAS — la cause exacte du
              silence mesuré le 2026-08-18 sur la fiche du maître.

              ⛔ IMPORTÉ, JAMAIS RECOPIÉ. Voir l'import en tête de fichier. */}
          {showTarget ? (
            <TargetAndPaceFields
              draft={rowTargetDraft}
              onChange={setTargetDraft}
              todayLocalIso={todayLocalIso}
              // ⚠️ UN PRÉFIXE PAR BOUCHE. Huit fiches peuvent être ouvertes
              // l'une après l'autre dans la même page; deux `id` identiques
              // feraient qu'un `<label for>` désigne le contrôle d'une autre
              // personne. Même raison que les deux cartes de l'entonnoir.
              idPrefix={`member-${member.memberId}`}
              // ⚠️ LA VOIX EST OBLIGATOIRE: la phrase d'arrivée TUTOIE, et
              // cette fiche se règle pour quelqu'un d'autre. Sans elle,
              // « tu seras à ton objectif » s'afficherait sous le prénom d'un
              // tiers — la cicatrice déjà payée sur cet écran.
              voice={isMe ? "self" : "other"}
              who={member.displayName === "—"
                ? t("household.mouth.who_fallback")
                : member.displayName}
            />
          ) : null}

            <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={busy || !draft.firstName.trim()}
              onClick={async () => {
                // ⚠️ LA PAIRE EST CALCULÉE **AVANT** L'ATTENTE, et ce n'est
                // pas du style: `onSave` passe par `run`, qui RELIT la page et
                // re-sème ce brouillon. Lire la paire après l'attente rendrait
                // la valeur d'avant le geste — c'est-à-dire un curseur qu'on
                // pousse et qui revient tout seul.
                // ⛔ ET PAS QUAND LE CORPS MANQUE. `targetPayloadOf` rend
                // `(null, null)` aussi bien sur `maintenance` — où effacer est
                // le geste légitime — que sur un corps qu'on ne connaît pas,
                // où AUCUN contrôle n'est à l'écran: là, écrire effacerait une
                // cible posée ailleurs, sans que personne n'ait rien demandé.
                const pair =
                  showTarget && !targetWriteIsBlind(rowTargetDraft, todayLocalIso)
                    ? targetPayloadOf(rowTargetDraft, todayLocalIso)
                    : null;
                const ok = await onSave({
                  firstName: draft.firstName,
                  birthDate: draft.birthDate || null,
                  // PLIÉE À L'ÂGE, comme à l'écran: ce qui part est ce qui
                  // est coché — une bouche mineure héritée à `fat_loss` part
                  // en `maintenance`, et `saveMember` l'écrit AVANT la date.
                  goal: goalForAge(draft.goal, rowAge) || null,
                });
                // ⚠️ LA DIRECTION D'ABORD, LA CIBLE ENSUITE, ET L'ORDRE EST
                // UNE CONTRAINTE DE LA BASE:
                // `household_members_target_needs_direction_check` refuse une
                // cible chiffrée tant que `goal` n'est pas `fat_loss` ou
                // `muscle_gain`. Écrire la paire en premier ferait échouer le
                // tout premier réglage de quelqu'un qui vient de choisir sa
                // direction dans la même fenêtre.
                //
                // ⚠️ ET SEULEMENT SI LA DIRECTION EST PASSÉE: sur un refus, la
                // base porte encore l'ancienne, et la paire d'à côté irait se
                // poser sous une direction qui ne l'attend pas.
                if (ok && pair !== null) {
                  await onSaveTarget(pair.targetWeightKg, pair.paceKgPerWeek);
                }
                if (ok) setDraft((d) => ({ ...d, birthDate: "" }));
              }}
            >
              {t("household.member.save")}
            </Button>
            </div>
          {/* ⟳ LES GESTES RESTENT AU FOND DE LA FENÊTRE OUVERTE, et ce n'est
              pas un oubli: « Retirer du foyer » DÉTRUIT la ligne, avec sa
              portion et ses allergies. Le remonter sur la ligne, à côté des
              deux portes, en ferait un bouton qu'on croise en parcourant la
              liste — exactement ce que la note d'origine interdit. */}
          <div className="flex flex-wrap items-center gap-2">
            {/* DEUX GESTES, DEUX LIBELLÉS, JAMAIS UN SEUL BOUTON (chantier 2).
                « Retirer l'accès » DÉTACHE: la personne perd la lecture du
                foyer, et reste une bouche à table avec sa portion et ses
                allergies. « Retirer du foyer » SUPPRIME la ligne. Un seul
                bouton « retirer » voudrait dire deux choses irréversibles
                différentes selon la ligne qu'on regarde.

                LE MAÎTRE NE SE RETIRE PAS, ET NE SE DÉTACHE PAS. La base
                refuse les deux (`cannot_remove_owner`, `cannot_detach_owner`)
                parce qu'un foyer sans personne pour composer laisse ses
                bouches sans compte sans recours; l'écran ne montre pas un
                bouton qui sera refusé. */}
            {/* ⟳ A5 §5.5 — « RETIRER L'ACCÈS » A REJOINT L'EN-TÊTE DE LA
                LIGNE, avec l'état d'accès qu'il inverse (`MemberAccess`): les
                deux se lisent ensemble, et sans ouvrir la fiche. Il n'est PAS
                dupliqué ici — un geste irréversible offert à deux endroits est
                un geste qu'on fait par accident au second.

                « RETIRER DU FOYER » RESTE ICI, et l'écart est le sujet: il
                DÉTRUIT la ligne, avec sa portion et ses allergies. Il vit donc
                au fond de la fiche ouverte, derrière une confirmation en deux
                temps, pas dans un en-tête qu'on parcourt. */}
            {viewerIsOwner && member.role !== "owner" ? (
              !confirmRemove
                ? (
                  <Button variant="danger" disabled={busy} onClick={() => setConfirmRemove(true)}>
                    {t("household.member.remove")}
                  </Button>
                )
                : (
                  <>
                    <span className="text-sm font-medium text-ink">
                      {t("household.member.remove_confirm")}
                    </span>
                    <Button
                      variant="danger"
                      disabled={busy}
                      onClick={() => {
                        setConfirmRemove(false);
                        onRemove();
                      }}
                    >
                      {t("household.member.remove_confirm_yes")}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setConfirmRemove(false)}
                    >
                      {t("household.member.remove_cancel")}
                    </Button>
                  </>
                )
            ) : null}
          </div>
          {/* Le geste ne se distingue pas par sa couleur: on ÉCRIT ce qu'il
              fait, à côté de lui, au moment de choisir. */}
          {viewerIsOwner && member.role !== "owner" ? (
            <p className="text-xs text-ink-soft">
              {t("household.member.remove_hint")}
            </p>
          ) : null}

          {/* ── D17 · LE RÉGLAGE DISCRET (L8) ────────────────────────────────
              « Un réglage discret permet au maître de ne plus se voir proposer
              la fusion pour une personne donnée. Assumé comme un peu brutal,
              donc caché. » Il est donc ICI, rangé dans la fiche de la
              personne, et JAMAIS sur la carte de proposition: un bouton
              « ne plus me parler de lui » à côté de « fusionner » ferait du
              geste brutal le geste le plus facile.

              ⚠️ IL NE BLOQUE PAS LA FUSION, et la phrase d'aide le dit: le
              geste reste possible (`operation: "merge"` ne lit pas ce réglage,
              un test de source le tient), et il ne coupe pas l'avertissement
              de D8, qui parle du plan du MAÎTRE.

              RÉSERVÉ AUX BOUCHES QUI ONT UN COMPTE: une bouche sans compte n'a
              pas de plan à elle (D3), donc rien à proposer, donc rien à taire.
              `muted === null` ⇒ on n'a pas pu lire le réglage: on ne montre
              pas un interrupteur dont on ignore la position. */}
          {viewerIsOwner && member.role !== "owner" && member.userId &&
              muted !== null
            ? (
            <button
              type="button"
              className="self-start text-xs text-ink-soft underline disabled:opacity-50"
              disabled={busy}
              onClick={() => onMute(!muted)}
            >
              {muted ? t("household.merge.unmute") : t("household.merge.mute")}
            </button>
          ) : null}
          {viewerIsOwner && member.role !== "owner" && member.userId &&
              muted !== null
            ? (
            <p className="text-xs text-ink-soft">
              {muted ? t("household.merge.muted") : t("household.merge.mute_hint")}
            </p>
          ) : null}
        </div>
        ) : (
          <p className="text-sm text-ink-soft">{t("household.mouth.frame_loading")}</p>
        )}
      </Modal>

      <Modal
        open={sheet === "preferences"}
        onClose={() => setSheet(null)}
        title={member.displayName === "—"
          ? t("household.mouth.preferences_title")
          : t("household.mouth.preferences_title_named", {
            name: member.displayName,
          })}
        size="lg"
        closeAsIcon
        closeLabel={t("common.close")}
      >
        {/* MÊME GARDE, SUR SA PROPRE LECTURE: les habitudes. Le brouillon de
            goûts est semé dessus (`prefsSeed`), et ses portes REMPLACENT ce
            qu'elles trouvent: ouvert sur du vide non lu, « Enregistrer »
            effacerait ce qui est en base. */}
        {habitsLoaded ? (
        <div className="flex flex-col gap-3">
          {/* ══════════════════════════════════════════════════════════════
              LA FICHE DE L'ENTONNOIR, TELLE QUELLE — 2026-09-19
              ══════════════════════════════════════════════════════════════

              Le pavé qui dit CE QUE ÇA REMPLACE, et pourquoi elle ne se monte
              pas pour tout le monde, est sur `sharedSheet`, plus haut. Ce qui
              se lit ici est l'ordre des sections, et il vient du composant:
              régime → allergies → dégoûts → moments ET habitudes. */}
          {sharedSheet
            ? (
              <>
                <MouthPreferencesFields
                  draft={prefsDraft}
                  onChange={setPrefsDraft}
                  // ⚠️ `hasAccount` EST LU, PLUS SUPPOSÉ: la fiche se monte
                  // aussi sur une bouche réclamée depuis le 2026-09-19, et
                  // c'est ce jeton qui décide de ce que ses sections DISENT.
                  // `isSelf` décide de la VOIX, et il est faux dès que le
                  // maître regarde quelqu'un d'autre.
                  subject={{
                    existing: true,
                    hasAccount: member.userId !== null,
                    isSelf: isMe,
                  }}
                  busy={busy}
                  structure={prefsStructure}
                  // ⚠️ REQUISE, ET LE COMPOSANT NE LA LIT PLUS — c'est écrit
                  // chez lui, au pavé de `declaredSlots`: depuis que la ligne
                  // d'habitude s'ouvre AVEC SA CASE, ce qui décide des
                  // questions posées est `draft.rhythm`, pas cette liste. On
                  // passe la même cascade que les deux autres sites de montage
                  // (sa ligne, sinon la maison) plutôt qu'une valeur inventée:
                  // le jour où la prop retrouve un lecteur, elle sera juste.
                  slots={habitSlots}
                  // Le bouton de ce cadre emporte le shaker avec le reste —
                  // `addShakerToMemberIntakes`, sur SA ligne. Voir
                  // `saveMemberPreferences`.
                  shakerPort={{ kind: "with_the_card" }}
                  // FERMER LE CADRE, PAS LA FENÊTRE: l'autre cadre est
                  // au-dessus, et refermer la fenêtre perdrait le geste.
                  // ══════════════════════════════════════════════════════
                  // « TERMINÉ » ENREGISTRE, PUIS FERME — 2026-09-19
                  // ══════════════════════════════════════════════════════
                  //
                  // ⛔ UN SEUL GESTE DE FIN, ET IL ÉCRIT. Il y a eu, quelques
                  // heures, « Terminé » (qui ferme) ET « Enregistrer » (qui
                  // écrit) l'un sous l'autre: deux boutons de fin sur une même
                  // fenêtre, dont un qui jette en silence ce qu'on vient de
                  // cocher. « Un geste qui ne fait rien est indiscernable d'un
                  // geste qui a marché. »
                  //
                  // ⚠️ IL NE PEUT RIEN ZÉROER, CONTRAIREMENT À CELUI DU
                  // TITULAIRE: `onSavePreferences` n'écrit que les portes des
                  // GOÛTS (habitudes, dégoûts, allergies, régime, moments,
                  // apport fixe). Ni corps, ni cible, ni prénom — ceux-là ont
                  // leur fenêtre, avec leurs lectures.
                  onClose={() => {
                    void (async () => {
                      const ok = await onSavePreferences(prefsDraft);
                      if (ok) setSheet(null);
                    })();
                  }}
                />
              </>
            )
            : (
              /* ── UN MEMBRE SUR SA PROPRE LIGNE — CE QUE LA BASE LUI OUVRE ──
                 ⛔ CETTE BRANCHE N'EST PLUS ATTEINTE QUE PAR UN NON-MAÎTRE
                 (`sharedSheet === viewerIsOwner`), et c'est un refus de la
                 base: `add_allergy` lui répond `not_owner`, donc la fiche
                 partagée lui montrerait un catalogue mort. Ses habitudes,
                 elles, s'écrivent bien d'ici (`not_your_line` seulement); son
                 régime et ses moments vivent dans son « à propos de toi ».

                 ⚠️ PAS DE `viewerIsOwner` ICI: il vaut `false` par
                 construction. Le tester donnerait une branche morte qui a
                 l'air d'une garde. */
              <>
                <HouseholdHabitsCard
                  slots={habitSlots}
                  habits={habits}
                  loaded={habitsLoaded}
                  busy={busy}
                  // ⟳ 2026-09-23 — les à-côtés LUS partent avec la prose DEPUIS
                  // la carte (le `carried` de `habitPayload` les porte): plus de
                  // report au montage.
                  onSave={onSaveHabits}
                />
                {/* ── ⟳ 2026-09-23 · SES À-CÔTÉS, SUR SA PROPRE LIGNE ────────
                    « La personne peut le changer elle-même » (décision du
                    propriétaire). La porte le lui permet: un membre écrit sa
                    ligne d'habitudes (`not_your_line` seulement ailleurs).

                    ⛔ PAS AVANT LA LECTURE: le champ écrit la liste ENTIÈRE,
                    prose et léger compris, depuis `habits`. Rendu sur du vide
                    non lu, un clic effacerait ses habitudes — la cicatrice
                    `mount-snapshot-forms-need-a-loading-gate`.

                    ⚠️ UN CLIC = UNE ÉCRITURE. Pas de second bouton
                    « Enregistrer »: ce champ n'a pas de brouillon à part, et la
                    réponse affichée pendant l'écriture est celle du clic
                    (`sidePending`), puis celle de la base relue. */}
                {habitsLoaded ? (
                  <div className="border-t border-line pt-3">
                    <SideCoursesField
                      value={sidePending ?? habits?.sideCourses ?? {}}
                      disabled={busy}
                      voice={isMe ? "self" : "other"}
                      who={member.displayName === "—"
                        ? t("household.mouth.who_fallback")
                        : member.displayName}
                      onChange={(next) => {
                        setSidePending(next);
                        void onSaveHabits(
                          habitEntriesToWrite({
                            habits: Object.fromEntries(
                              (habits?.slots ?? []).map((h) => [h.slot, h.usual]),
                            ),
                            light: habits?.light ?? {},
                            sideCourses: next,
                            occasions: EATING_OCCASIONS,
                          }),
                          habits?.note ?? null,
                        ).finally(() => setSidePending(null));
                      }}
                    />
                  </div>
                ) : null}
              </>
            )}
          {/* ⛔ LES ALLERGIES ET LES RÈGLES DE MAISON SONT AU MAÎTRE (A5
              point 6). `add_allergy` / `add_restriction` répondent `not_owner`.
              ⚠️ CE QUE LE MEMBRE VOIT QUAND MÊME est ailleurs, et c'est la
              contrepartie du modèle: chaque contrainte reste affichée AVEC QUI
              L'A POSÉE dans sa vue à lui (`restrictionNotice`). Ce qui
              distingue ce modèle du contrôle coercitif, c'est que rien n'est
              secret — pas qu'il puisse tout écrire. */}
          {viewerIsOwner ? (
          <div className="border-t border-line pt-3">
            {/* ══════════════════════════════════════════════════════════
                ⛔ LE CHAMP LIBRE D'ALLERGIE S'EN VA AVEC LA FICHE PARTAGÉE
                ══════════════════════════════════════════════════════════

                Dès que `MouthPreferencesFields` est monté au-dessus, cette
                bouche a DÉJÀ un champ d'allergie: le catalogue fermé, le même
                qu'à l'inscription — et c'est lui qu'il faut, parce que choisir
                dans la liste fait reconnaître l'allergène SOUS SES AUTRES NOMS
                (`copy/allergens.ts`: `peanut` couvre « satay », « groundnut »,
                « PB »), là où une saisie libre n'est reconnue que sous le mot
                écrit. Garder les deux aurait été deux champs qui écrivent la
                MÊME table avec deux promesses différentes.

                CE QUI RESTE ICI est ce que le catalogue ne porte pas: la RÈGLE
                DE MAISON (§8.5 règle 1 — sur un mineur, et sur lui seul), et le
                RETRAIT des deux natures, qui n'existe nulle part ailleurs.

                ⚠️ POUR UNE BOUCHE QUI A UN COMPTE, RIEN NE CHANGE: sa fiche
                partagée ne se monte pas, donc son champ libre est toujours là —
                sans lui, elle n'aurait plus aucune porte d'allergie. */}
            {sharedSheet
              ? (canSetHouseRule
                ? (
                  /* ⛔ PLUS DE SÉLECTEUR DE NATURE: la fiche partagée tient
                     déjà l'allergie, il ne reste qu'UNE chose à écrire ici.
                     Un choix à une seule option est une question sans réponse
                     alternative. */
                  <>
                    <SectionLabel>
                      {t("household.constraint.kind.house_rule")}
                    </SectionLabel>
                    <p className="mt-1 text-xs leading-5 text-ink-soft">
                      {t("household.constraint.kind.house_rule_hint")}
                    </p>
                  </>
                )
                : null)
              : canSetHouseRule
              ? (
                <Field
                  label={t("household.constraint.kind")}
                  hint={kind === "allergy"
                    ? t("household.constraint.kind.allergy_hint")
                    : t("household.constraint.kind.house_rule_hint")}
                >
                  <select
                    className={inputClass}
                    value={kind}
                    onChange={(e) => setKind(e.target.value as "allergy" | "house_rule")}
                  >
                    <option value="allergy">
                      {t("household.constraint.kind.allergy")}
                    </option>
                    <option value="house_rule">
                      {t("household.constraint.kind.house_rule")}
                    </option>
                  </select>
                </Field>
              )
              : (
                <Field
                  label={t("household.constraint.kind.allergy")}
                  hint={t("household.constraint.kind.allergy_hint")}
                >
                  <p className="text-xs leading-5 text-ink-soft">
                    {t("household.constraint.house_rule_minor_only")}
                  </p>
                </Field>
              )}
            {/* ⛔ PAS DE CHAMP QUAND IL N'A PLUS RIEN À ÉCRIRE: fiche partagée
                montée + bouche majeure = le catalogue tient l'allergie et la
                règle de maison n'existe pas. Un champ qui n'a pas de porte est
                un champ qui promet. */}
            {sharedSheet && !canSetHouseRule ? null : (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                className={`${inputClass} min-w-0 flex-1`}
                value={label}
                maxLength={120}
                placeholder={constraintKind === "allergy"
                  ? t("household.allergy.placeholder")
                  : t("household.restriction.placeholder")}
                onChange={(e) => setLabel(e.target.value)}
              />
              <Button
                disabled={busy || !label.trim()}
                onClick={() => {
                  const value = label.trim();
                  setLabel("");
                  // ⛔ `constraintKind`, JAMAIS `kind`. L'état survit au
                  // changement de bouche dans la liste: quelqu'un qui choisit
                  // « règle de maison » sur son enfant puis ouvre la fiche d'un
                  // adulte enverrait cette valeur sur la mauvaise porte, et
                  // lirait un `not_a_minor` sur un formulaire qui ne montre
                  // plus le choix.
                  if (constraintKind === "allergy") onAddAllergy(value);
                  else onAddRestriction(value);
                }}
              >
                {constraintKind === "allergy"
                  ? t("household.allergy.add")
                  : t("household.restriction.add")}
              </Button>
            </div>
            )}
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {allergies.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  {/* ⚠️ `allergenLabel` ET PAS LE JETON NU. Le catalogue écrit
                      des SLUGS (`peanut`, `tree_nut`): rendus tels quels, la
                      liste d'une fiche française affichait « peanut » sous une
                      case cochée « Arachide ». Le slug reste la donnée, jamais
                      l'affichage — et une saisie libre inconnue traverse, elle,
                      rendue lisible. */}
                  <span className="font-medium text-red-700">
                    {allergenLabel(a.label)}
                  </span>
                  <span className="text-ink-soft">
                    {t("household.constraint.kind.allergy")}
                  </span>
                  <button
                    className="text-ink-soft underline"
                    disabled={busy}
                    onClick={() => onRemoveAllergy(a.id)}
                  >
                    {t("household.allergy.remove")}
                  </button>
                </li>
              ))}
              {restrictions.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.label}</span>
                  <span className="text-ink-soft">
                    {t("household.constraint.kind.house_rule")}
                  </span>
                  <button
                    className="text-ink-soft underline"
                    disabled={busy}
                    onClick={() => onRemoveRestriction(r.id)}
                  >
                    {t("household.restriction.remove")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          ) : null}
        </div>
        ) : (
          <p className="text-sm text-ink-soft">{t("household.mouth.frame_loading")}</p>
        )}
      </Modal>
    </li>
  );
}

/*
 * ── LA CARTE DE CONSENTEMENT A ÉTÉ RETIRÉE (lot 2, 2026-08-10) ──────────────
 *
 * Elle permettait à un majeur d'accepter, puis de révoquer, le droit du compte
 * maître de lui poser des interdits. Elle protégeait un adulte d'un autre
 * adulte, dans un monde où chaque bouche avait un compte.
 *
 * Le modèle arrêté le 2026-08-08 dit qu'une seule personne gouverne le menu —
 * c'est ce qui évite le marécage d'un arbitrage entre un parent et son enfant.
 * LA CONTREPARTIE N'EST PAS RIEN, et elle est plus haut dans ce fichier (dans
 * `MembersCard`, côté membre non maître): chaque contrainte reste affichée AVEC
 * QUI L'A POSÉE (`restrictionNotice`). Ce qui distingue ce modèle du contrôle
 * coercitif, c'est que rien n'est secret.
 */

/*
 * ── LA CARTE DES INTERDITS A ÉTÉ RETIRÉE (lot 4, 2026-08-10) ───────────────
 *
 * Elle demandait « pour qui ? » dans un sélecteur, alors que la personne est
 * déjà la ligne qu'on regarde — et elle ne posait PAS la question qui compte:
 * de quelle nature est cette contrainte. Ce qu'elle portait vit maintenant
 * dans `MemberRow`, par bouche, avec le choix allergie / règle de maison.
 *
 * `household.restriction.for_whom` est partie avec elle: son sélecteur n'a
 * plus de sujet.
 */

/*
 * ── ⛔ `InviteCard` A ÉTÉ RETIRÉE — A5 §5.5, 2026-09-03 ────────────────────
 *
 * Elle vivait en bas de `/app/household` et demandait « qui invites-tu ? »
 * dans un `<select>` de bouches libres, à quelqu'un qui regardait déjà les
 * huit lignes portant ces prénoms. Ce qu'elle faisait vit maintenant DANS
 * l'en-tête de chaque ligne (`MemberAccess`), avec ce qu'elle ne faisait pas:
 *
 *   · elle ne RELISAIT rien. Elle n'affichait que le jeton qu'elle venait de
 *     créer — une invitation envoyée la veille était invisible, et le maître
 *     émettait un second lien sans savoir qu'un premier courait. La ligne lit
 *     désormais les invitations VIVANTES (`loadLiveInvitations`, jamais
 *     `token_hash`) et dit « envoyée le … à … »;
 *   · elle ne disait pas ce que l'accès COÛTE, alors que c'est ce que le
 *     maître promet en écrivant. La ligne lit `offer.extra` (D5.8: aucun
 *     montant recopié, jamais);
 *   · « Retirer l'accès » était au fond de la fiche, loin de l'état qu'il
 *     inverse. Les deux sont maintenant côte à côte.
 *
 * ⚠️ CE QUI N'A PAS CHANGÉ, ET QUI EST LE CŒUR: l'invitation PORTE SA CIBLE
 * (`keel_household_invite(email, member_id)`, FF-048 R2). Si la bouche était
 * choisie au moment de rejoindre, un lien qui fuite deviendrait le droit de se
 * déclarer n'importe qui du foyer.
 *
 * ⚠️ ET AUCUN E-MAIL N'EST ENVOYÉ (FF-060 R7). L'écran rend le lien, le fait
 * copier, ouvre un brouillon `mailto:` — c'est tout. En local,
 * `EMAIL_DELIVERY_ENABLED=1` porte une vraie clé Resend.
 */

/** Réexporté pour le test de route: la page monte sans foyer sans exploser. */
export type { HouseholdMemberView };

// ⟳ 2026-09-09 — `PausedCard` A DÉMÉNAGÉ EN `components/PaywallPanel.tsx`
// (FF-064). Elle n'est pas morte: elle est devenue le MUR. Son doc-comment
// l'a suivie mot pour mot, augmenté de la frontière entre l'état gelé (ni
// date, ni montant, ni décompte — la source est Stripe) et l'essai qui court
// (le décompte est légitime — la source est `households.free_until`).
