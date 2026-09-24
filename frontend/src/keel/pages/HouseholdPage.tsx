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
  isDirectionalGoal,
  type MemberBodyView,
  type MemberGoal,
  mergeCounterparts,
  removeAllergy,
  removeHouseholdMember,
  removeRestriction,
  type RestrictionView,
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
  type EatingOccasionSlot,
} from "../api/mealGeneration";
import {
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
  type KnownMouth,
  knownMouthForOwner,
  type MouthFormDraft,
  mouthToPersist,
  shakerCanBeSaved,
  shakerPartialToWrite,
} from "../lib/mouthForm";
// LE DÉCOUPAGE « prose / bulle » D'UNE LIGNE D'HABITUDE, EN UN SEUL EXEMPLAIRE.
// La fiche d'une bouche écrit la même liste que l'entonnoir et que
// `persistMouth`: une seconde règle ici ferait diverger le sens d'une entrée
// qui ne porte QUE « + repas léger » (pas de prose ⇒ `household_dish`).
import {
  habitEntriesToWrite,
} from "../lib/mealExtras";
import {
  loadPracticalConstraints,
  type PracticalConstraints,
} from "../api/practicalConstraints";
import KitchenEquipmentCard from "../components/KitchenEquipmentCard";
import HouseholdTraditionsCard from "../components/HouseholdTraditionsCard";
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
import { SectionLabel } from "../components/ui/Card";

// ── ⟳ 2026-09-24 (lot 4c) · LES SOUS-COMPOSANTS VIVENT DANS `household/` ─────
// Les sous-composants de cet écran et ses libellés sont déplacés À
// L'IDENTIQUE dans `household/`. Ce fichier garde la page elle-même.
// Il RÉ-EXPORTE ce qu'il exportait: les imports des tests ne changent pas.
// Les modules font partie de la famille de ce fichier
// (`scripts/source-families.json`), que les tests lisent à la place du
// fichier seul. Les commentaires des imports partis avec eux les ont suivis.
import { householdErrorText } from "./household/labels.ts";
import { CreateCard } from "./household/CreateCard.tsx";
import type { OwnFiche } from "./household/MeFiche.tsx";
import { AddMouthCard } from "./household/AddMouth.tsx";
import { MembersCard } from "./household/MembersCard.tsx";

export { SheetFrame } from "./household/SheetFrame.tsx";
export { MemberAccess } from "./household/MemberAccess.tsx";
export type { OwnFiche } from "./household/MeFiche.tsx";
export { MeFiche, MeSheetForm, MePrefsForm } from "./household/MeFiche.tsx";
export { AddMouthForm } from "./household/AddMouth.tsx";

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
