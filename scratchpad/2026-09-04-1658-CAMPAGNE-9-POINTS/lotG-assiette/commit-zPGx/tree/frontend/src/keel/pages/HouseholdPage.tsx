import { parseAwayMarks, type WorkLunch } from "../lib/presenceMarks";
import React from "react";

import { useAuth } from "../../context/AuthContext";
// LA LISTE FERMÉE DES QUATRE RÉPONSES, LUE ET PAS RECOPIÉE — la même que
// l'entonnoir. Une seconde liste ici offrirait une case que le moteur n'honore
// pas, ce qui est la version cochable du mensonge que ce lot corrige.
import { DIET_ANSWERS } from "../api/onboarding";
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
  type HouseholdCoverage,
  type HouseholdMealView,
  type HouseholdMemberView,
  type HouseholdView,
  inviteToHousehold,
  loadAllergies,
  loadHousehold,
  loadHouseholdMeal,
  loadHouseholdRhythm,
  loadMemberBodies,
  loadMyHouseholdCoverage,
  loadRestrictions,
  MEMBER_GENDERS,
  goalForAge,
  isDirectionalGoal,
  type MemberAgeState,
  type MemberBodyView,
  type MemberGender,
  type MemberGoal,
  mergeCounterparts,
  openHouseholdCheckout,
  removeAllergy,
  removeHouseholdMember,
  removeRestriction,
  type RestrictionView,
  restrictionNotice,
  setMemberAway,
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
import { addDays } from "../api/dates";
// ── LOT C · LE MAGASIN DES PRÉFÉRENCES, EN LECTURE ────────────────────────
// L'écriture passe par `writtenDislikeWriter` (`api/mouthProfile`), qui adapte
// le contrat « ça lève » de ce module au contrat « ça rend un refus » de cet
// écran. La lecture, elle, n'a pas de refus à traduire.
import { loadWrittenDislikes,
  HOUSEHOLD_SUBJECT,
  memberSubject,
} from "../api/retainedItems";
import {
  type AwayDay,
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
import {
  MAX_WINDOW_DAYS,
  resolveRequestedWindow,
  windowDayOrder,
} from "../api/mealWindow";
import { loadMutedMembers, muteMergeProposals } from "../api/householdMerge";
// L5 — LE POP-UP « UNE BOUCHE ». Il s'ouvre à chaque ajout de personne, ET sur
// la fiche du maître (D5, 2026-08-18): « sans quoi celui qui tient la maison
// serait le seul dont on ne sait rien ».
import {
  type KnownOwnMouth,
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
  filledPreferenceBlocks,
  type KnownMouth,
  knownMouthForOwner,
  type MouthFormDraft,
  mouthToPersist,
} from "../lib/mouthForm";
import { useEatingStructure } from "../lib/useEatingStructure";
import GoalTiles from "../components/GoalTiles";
import MouthFormDialog, {
  MouthActivityAxesFields,
  MouthAppetiteFields,
  type MouthActivityAndStructure,
  MouthCoreFields,
  MouthPreferencesFields,
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
import { householdErrorKey } from "../copy/planRefusals";
import MealPickerGrid from "../components/MealPickerGrid";
import HouseholdHabitsCard from "../components/HouseholdHabitsCard";
// A5 point 7 — LES DEUX CARTES DU COMPTE, rapatriées de la fenêtre de réglages
// de `/app/plan`. Elles écrivent la colonne DE LA SESSION: elles ne se montent
// que sur `isMe`. `CookingCapacityCard` reste là-bas (lane CUISINE).
import EatingRhythmCard from "../components/EatingRhythmCard";
import FoodPreferencesCard from "../components/FoodPreferencesCard";
import MemberWorkLunchCard from "../components/MemberWorkLunchCard";
import { loadWorkLunch, setMemberWorkLunch } from "../api/workLunch";
import { commitWorkLunch, readWorkLunchAnswers } from "../lib/workLunchCommit";
import HouseholdMergeCard from "../components/HouseholdMergeCard";
import HouseholdPlanCard from "../components/HouseholdPlanCard";
import { t } from "../i18n/t";
// ⛔ LE MONTANT EST LU, JAMAIS RECOPIÉ (D5.8): la ligne d'une bouche annonce le
// prix d'un accès personnel avec la MÊME source que les cinq surfaces de vente.
import { formatPrice } from "../i18n/format";
import { PRICES } from "../i18n/prices";
import { habitSlotsFor } from "../lib/habitSlots";
import KeelAppShell from "../components/KeelAppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";

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
 * Le motif de refus d'une RPC de foyer, traduit — liste FERMÉE.
 *
 * Même discipline que `inviteErrorText`: un motif inconnu rend `null` plutôt
 * qu'une clé brute, et l'écran retombe alors sur le motif tel quel. Le silence
 * force à ajouter l'étiquette au lieu de la tolérer.
 */
function householdErrorText(reason: string): string | null {
  // ⚠️ LA LISTE A DÉMÉNAGÉ DANS `copy/planRefusals.ts`, et ce n'est pas un
  // rangement. Elle était un `switch` privé de ce fichier, donc invisible à la
  // carte de proposition — qui reçoit pourtant les mêmes motifs et affichait
  // `not_a_member` en toutes lettres (mesuré deux fois en HTTP réel). Une même
  // liste fermée, deux écrans, un seul exemplaire: c'est la raison d'être du
  // module de refus, écrite dans son en-tête.
  //
  // L'ORDRE EST CELUI D'AVANT: les motifs de foyer d'abord, les motifs propres
  // aux deux RPC de réglage de fusion ensuite (`muted_required`,
  // `member_is_owner`, `notice_moved_on`…). `householdErrorKey` le tient, et le
  // test appelle la même fonction que cette ligne.
  const key = householdErrorKey(reason);
  return key ? t(key) : null;
}

function goalLabel(goal: MemberGoal): string {
  switch (goal) {
    case "fat_loss":
      return t("household.goal.fat_loss");
    case "muscle_gain":
      return t("household.goal.muscle_gain");
    // `recomposition`, `performance` et `health` sont partis avec le
    // vocabulaire (2026-08-18): la base les refuse par `bad_goal`, donc un
    // `case` pour eux était une branche que rien ne pouvait plus atteindre.
    // Leurs clés i18n restent sur le disque — la parité en/fr n'est pas rompue
    // par des clés inutilisées, et c'est à L5 de les retirer avec l'écran.
    case "maintenance":
      return t("household.goal.maintenance");
  }
}

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
  /**
   * LES DÉGOÛTS PAR BOUCHE — `food.exclude` `source=written`, lot C.
   *
   * ⚠️ UNE `Map` VIDE N'EST PAS « PAS LU », et ici ça ne coûte rien: la seule
   * chose qui en dépend est la valeur SEMÉE d'un champ qui AJOUTE. Semer vide
   * quelqu'un qui a des dégoûts ne les efface pas — la porte n'écrit que le
   * delta, et le magasin dédoublonne à sujet égal.
   */
  const [dislikes, setDislikes] = React.useState<Map<string, string[]>>(
    new Map(),
  );
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
  const [workLunch, setWorkLunch] = React.useState<
    Map<string, WorkLunch | null> | null
  >(null);
  const [workLunchError, setWorkLunchError] = React.useState<string | null>(null);
  /**
   * LE GEL (chantier 3, D4). `null` = pas encore lu.
   *
   * ⚠️ L'ÉCRAN NE DÉCIDE PAS DU GEL, il l'affiche. La règle vit en base
   * (`keel_household_is_covered`), la garde vit dans la fonction edge, et ceci
   * n'est que la PHRASE — sans elle, le refus du serveur arriverait comme
   * « non-2xx status code », c'est-à-dire comme une panne.
   */
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
  const [coverage, setCoverage] = React.useState<HouseholdCoverage | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const weekStart = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  // ⚠️ L'ANCRE DES ENVIES A QUITTÉ CET ÉCRAN AVEC LA CARTE. Elle vit dans le
  // formulaire de demande de `/app/plan`, et elle y est calculée sur la DATE DE
  // DÉPART DU PLAN — pas sur aujourd'hui. C'est ce que le générateur relit
  // (`weekStartOf(starts_on)`), et les deux ancres ne coïncidaient que tant que
  // la fenêtre démarrait forcément aujourd'hui.

  /**
   * LES COLONNES DE LA GRILLE DE PRÉSENCE — la fenêtre que le foyer va cuisiner.
   *
   * LA MÊME QUE `ComposeCard` (`until_sunday`), et ce n'est pas un détail: une
   * grille qui montrerait sept jours quand la composition en couvre trois
   * ferait marquer une absence sur des jours que le plan ne verra jamais. On
   * passe donc par la MÊME résolution que le bouton, pas par un calcul voisin.
   *
   * ⚠️ LA GRILLE NE MONTRE QUE LA FENÊTRE, ET C'EST TOUT LE POINT DE SA FUSION:
   * `MealPickerGrid.save` reprend tels quels les jours hors fenêtre, sinon
   * marquer un week-end effacerait « jeudi midi ».
   */
  const awayWindow = React.useMemo(() => {
    const { startsOn, durationDays } = resolveRequestedWindow(
      { kind: "until_sunday" },
      weekStart,
    );
    const n = Math.min(MAX_WINDOW_DAYS, Math.max(1, durationDays));
    return {
      tokens: windowDayOrder(startsOn, n),
      dates: Array.from({ length: n }, (_, i) => addDays(startsOn, i)),
    };
  }, [weekStart]);

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
        setDislikes(await loadWrittenDislikes(userId));
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
        // APRÈS les lectures de contenu, et c'est le sujet: elles ne dépendent
        // PAS du gel. On gèle la production, pas la consultation — les bouches,
        // les allergies, les envies et le plan courant se lisent gelés ou non.
        setCoverage(await loadMyHouseholdCoverage());
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
   * LES RÉPONSES DU DÉJEUNER — une lecture À PART, pas dans `refresh`.
   *
   * `commitWorkLunch` relit les réponses PUIS la page: si cette lecture vivait
   * dans `refresh`, elle partirait deux fois par geste, et surtout l'ordre
   * « réarmer la garde avant de relire la page » ne serait plus lisible ici.
   * On ne remet PAS `workLunch` à `null` sur un échec: ce qui a déjà été lu
   * reste vrai, et l'erreur se dit à côté de la carte.
   */
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

  const refreshWorkLunch = React.useCallback(async () => {
    const read = await readWorkLunchAnswers(loadWorkLunch);
    if (read.answers !== null) setWorkLunch(read.answers);
    setWorkLunchError(read.error);
  }, []);

  // CET EFFET LIT, ET C'EST LE SEUL QUI TOUCHE AU DÉJEUNER. Il attend de
  // savoir QUI regarde, parce que seuls les gens d'un foyer ont des réponses à
  // lire. Keyé sur le `member_id` et pas sur `household`, pour ne pas relire à
  // chaque `refresh`.
  //
  // ⟳ DETTE D'A6, PAYÉE ICI (A5, point 6). Cet effet était keyé sur
  // `meRole === "owner"`, et c'était JUSTE tant qu'un non-maître ne voyait
  // aucune fiche (`MembersCard` lui rendait une liste en lecture seule). Le
  // point 6 ouvre SA ligne à un membre réclamé: sans ce changement, sa propre
  // carte « Le déjeuner en semaine » resterait sur « Lecture… » pour toujours —
  // la lecture n'aurait jamais lieu, et la porte de chargement, qui a raison,
  // ne rendrait aucune question. La porte d'ÉCRITURE, elle, n'a pas bougé:
  // `keel_household_set_member_work_lunch` répond `not_your_line` à qui vise
  // la ligne d'un autre, et c'est elle qui décide.
  const meMemberId = household?.me?.memberId ?? null;
  React.useEffect(() => {
    if (meMemberId === null) return;
    void refreshWorkLunch();
  }, [meMemberId, refreshWorkLunch]);

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
  // ⚠️ `=== true`, PAS `?.frozen`. Tant que la lecture n'a pas eu lieu
  // (`null`), on ne gèle rien à l'écran: annoncer une pause à quelqu'un qui
  // paie sur la foi d'une lecture en cours est le pire des deux sens.
  const frozen = coverage?.frozen === true;
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
    // `MeCard` traite déjà « pas de corps » et « pas lu » de la même façon ici,
    // parce que sa fiche est gardée par `meKnown`, une autre lecture.
    body: bodies?.get(me.memberId) ?? null,
    // ⚠️ `null` TRAVERSE, ET C'EST LE SUJET. `habits` vaut `null` tant que la
    // lecture n'a pas eu lieu (ou a échoué); l'aplatir en `[]` ici dirait « lu,
    // et elle n'en a aucune », et la fenêtre s'ouvrirait sur du vide qu'elle
    // écrirait.
    habits: habits === null
      ? null
      : (habits.get(me.memberId)?.slots ?? []),
    // ⚠️ LA MÊME LECTURE, L'AUTRE MOITIÉ. `slots` porte la prose,
    // `extras` ce qui est pris à côté du plat: `parseHabitSlots` jette les
    // entrées sans prose, qui sont précisément celles des bulles. Sans cette
    // semence, ouvrir la fiche puis enregistrer effacerait des bulles cochées.
    extras: habits === null ? {} : (habits.get(me.memberId)?.extras ?? {}),
  });

  // ⚠️ `canCompose` A QUITTÉ CET ÉCRAN AVEC `ComposeCard`. Le gel reste lu ici
  // (`frozen`, ci-dessus, pour la carte de pause); ce qu'il coupait — la
  // production — se demande maintenant depuis `/app/plan`, et le serveur y
  // refuse par `household_frozen`, qui a des mots dans `copy/planRefusals.ts`.

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
              {/* EN PREMIER QUAND ELLE EXISTE. Un refus qu'on découvre en
                  cliquant est un refus qu'on prend pour une panne. */}
              {frozen ? <PausedCard isOwner={isOwner} /> : null}

              {/* LA PREMIÈRE BOUCHE EN PREMIER. Tant que la ligne d'objectif
                  du compte maître n'existe pas, la composition échouerait —
                  autant le lui dire AVANT qu'il saisisse trois personnes. */}
              {me && ownerGoalRow !== null ? (
                <MeCard
                  me={me}
                  // ⚠️ LA DATE LOCALE, CALCULÉE UNE FOIS ET DESCENDUE — l'âge
                  // qui filtre les directions se lit sur une date TAPÉE, et une
                  // horloge lue au rendu changerait de réponse à minuit.
                  todayLocalIso={weekStart}
                  slots={habitSlotsFor(me.eatingSlots, rhythm)}
                  // ⚠️ LA PROMESSE N'EST FAITE QU'À QUI PEUT LA TENIR. « ceci
                  // débloque la composition » est vrai pour le compte maître et
                  // FAUX pour un profil réclamé, qui ne compose pas. Sa ligne
                  // `student_goals` reste écrite (c'est la sienne), mais la
                  // carte ne lui raconte pas qu'elle ouvre une porte fermée.
                  needsGoalRow={isOwner && !ownerGoalRow}
                  // D1: on n'offre le champ que tant que SA ligne n'existe pas
                  // — pour le maître comme pour un profil réclamé. Après, elle
                  // se modifie dans son « about you », pas ici.
                  goalEditable={!ownerGoalRow}
                  busy={busy}
                  onSave={(patch) =>
                    saveMember(me, patch, {
                      userId,
                      alsoCreateGoalRow: !ownerGoalRow,
                    })}
                  // ── D5 · LA FENÊTRE S'OUVRE AUSSI POUR LUI ─────────────
                  // « sans quoi celui qui tient la maison serait le seul dont
                  // on ne sait rien » (conception §1). `null` = on retombe sur
                  // les trois champs en ligne — voir `meKnown`.
                  sheet={meKnown === null ? null : {
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
                                "[household] MeCard: the owner's mouth " +
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
                            // ⚠️ `null` EST UNE ÉCRITURE, PAS UN SAUT: c'est
                            // la seule façon de revenir à « comme la maison »
                            // après avoir coché un moment.
                            setRhythm: setMemberRhythm,
                          },
                        )
                      ),
                  }}
                />
              ) : null}

              {isOwner ? (
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
              ) : null}

              <MembersCard
                household={household}
                todayLocalIso={weekStart}
                restrictions={restrictions}
                dislikes={dislikes}
                allergies={allergies}
                busy={busy}
                mutedMembers={mutedMembers}
                rhythm={rhythm}
                awayWindow={awayWindow}
                bodies={bodies}
                habits={habits}
                practicalConstraints={practicalConstraints}
                hasGoal={ownerGoalRow === true}
                // A5 point 7 — LA COLONNE DU COMPTE SE RELIT APRÈS SON
                // ÉCRITURE: `refresh` ne lit pas `student_goals`, donc sans
                // ça les deux cartes se remonteraient sur la valeur d'avant —
                // et la suivante fusionnerait par-dessus.
                onSavedOwnConstraints={async () => {
                  if (!userId) return;
                  try {
                    setPracticalConstraints(
                      await loadPracticalConstraints(userId),
                    );
                  } catch (e) {
                    console.error("[household] pc reread failed", e);
                  }
                }}
                invitations={invitations}
                // A5 §5.5 — RELIRE LES INVITATIONS, PAS SEULEMENT LA PAGE:
                // `refresh` ne lit pas `household_invitations`, donc sans cette
                // relecture la ligne dirait encore « jamais invitée » juste
                // après avoir créé un lien.
                onInvited={refreshInvitations}
                workLunch={workLunch}
                workLunchError={workLunchError}
                // A6 — LE GESTE COMPLET, DANS L'ORDRE QUE `commitWorkLunch`
                // IMPOSE: écrire, RELIRE LES RÉPONSES (réarmer la garde), puis
                // relire la page — la porte SQL a aussi écrit `away_days`, et
                // la grille juste en dessous doit montrer les cinq midis.
                // Pas par `run`: un refus doit rester SOUS le geste, dans la
                // carte, pas dans la bannière de la page.
                onSaveWorkLunch={(memberId, answer) =>
                  commitWorkLunch({
                    memberId,
                    answer,
                    save: setMemberWorkLunch,
                    reread: refreshWorkLunch,
                    onSaved: refresh,
                  })}
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
                      // ── ② ET ① — CETTE RANGÉE POSE VRAIMENT LES CINQ
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
                        takesDessert: extras.takesDessert,
                        takesCheese: extras.takesCheese,
                        takesBread: extras.takesBread,
                        structureAsked: true,
                        appetite: extras.appetite === "" ? null : extras.appetite,
                        appetiteAsked: true,
                      },
                    )
                  )}
                // LE RÉGIME D'UNE BOUCHE. Même `run` que les autres: le refus
                // (`bad_diet`, `has_account`) arrive en phrase, et la page se
                // remonte sur ce que la base a VRAIMENT gardé.
                onSaveDiet={(memberId, diet) =>
                  run(() => setMemberDiet(memberId, diet))}
                onMute={(memberId, next) => run(() => muteMergeProposals(memberId, next))}
                onSaveAway={(memberId, next) => run(() => setMemberAway(memberId, parseAwayMarks(next)))}
                onSave={(member, patch) => saveMember(member, patch, { userId })}
                onRemove={(memberId) => run(() => removeHouseholdMember(memberId))}
                onDetach={(memberId) => run(() => detachHouseholdMember(memberId))}
                onAddAllergy={(m, l) => run(() => addAllergy(m, l))}
                onRemoveAllergy={(id) => run(() => removeAllergy(id))}
                onAddRestriction={(m, l) => run(() => addRestriction(m, l))}
                onRemoveRestriction={(id) => run(() => removeRestriction(id))}
              />

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

function CreateCard(
  { busy, onCreate }: { busy: boolean; onCreate: (name: string) => void },
) {
  const [name, setName] = React.useState("");
  // ── LE CHOIX DU MODE A DISPARU (lot 2, 2026-08-10) ────────────────────────
  // Il fallait cocher « famille » ou « colocation », et ce choix gouvernait le
  // droit de restreindre et la visibilité des objectifs. La colocation est
  // sortie du produit: un foyer est un foyer, et la personne qui cuisine
  // gouverne le menu. Un écran de moins, une question de moins, et surtout plus
  // aucune façon de se tromper de mode en s'inscrivant.

  return (
    <Card>
      <SectionLabel>{t("household.empty.title")}</SectionLabel>
      <p className="mb-3 text-sm text-ink-soft">{t("household.empty.body")}</p>
      <Field label={t("household.create.name")}>
        <input
          className={inputClass}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Button
        className="mt-3"
        disabled={busy || !name.trim()}
        onClick={() => onCreate(name.trim())}
      >
        {t("household.create.submit")}
      </Button>
    </Card>
  );
}

/** Ce qu'un formulaire de bouche porte. Un seul type pour les trois usages. */
interface MouthDraft {
  firstName: string;
  /** `""` = « ne touche pas ». Voir `saveMember`: le roster ne rend pas la date. */
  birthDate: string;
  /**
   * `""` = RIEN DE COCHÉ — et l'écran ne sait plus rien produire d'autre que
   * les trois jetons (chantier P3, 2026-09-03: l'option vide « Aucune
   * direction particulière » est retirée des cinq `<select>`). Une ligne à
   * `goal = null` en base s'ouvre sur `""` et reste à `""` tant que le maître
   * ne choisit pas; `null` reste valide EN BASE (part standard, D3.3).
   */
  goal: MemberGoal | "";
}

/**
 * LES TROIS CHAMPS, UNE SEULE FOIS DANS LE FICHIER.
 *
 * Le maître se décrit avec, on ajoute une bouche avec, et on corrige une bouche
 * avec. Trois copies de ce bloc divergeraient sur le seul détail qui compte —
 * ce qu'on fait d'un champ vide — et personne ne saurait laquelle est la règle.
 */
function MouthFields(
  { draft, onChange, mine, showKeptDateHint, goalEditable = true, ageState, radioName }: {
    draft: MouthDraft;
    onChange: (next: MouthDraft) => void;
    /** Change le libellé de l'objectif, rien d'autre. */
    mine?: boolean;
    /**
     * L'ÉTAT D'ÂGE QUI FILTRE LES DIRECTIONS — REQUIS, jamais optionnel. C'est
     * l'appelant qui le dérive (`ageStateOfTypedDate`: la date TAPÉE gagne sur
     * le roster), parce que ce formulaire ne connaît ni la ligne ni le jour.
     * Un défaut ici (`"unknown"`) ferait proposer trois directions à un enfant
     * — exactement l'écran d'avant ce lot.
     */
    ageState: MemberAgeState;
    /** Le `name` des boutons radio — unique par formulaire sur la page. */
    radioName: string;
    /** Vrai quand la ligne PORTE déjà une date qu'on ne peut pas préremplir. */
    showKeptDateHint?: boolean;
    /**
     * FAUX dès que la bouche a un COMPTE (D1, 2026-08-11). Son objectif vit
     * alors dans son « about you » (`student_goals`), et la base refuse
     * `keel_household_set_member_goal` avec `has_account`. Laisser le sélecteur
     * afficherait un contrôle qui échoue à tous les coups — pire qu'un contrôle
     * absent, parce qu'il promet.
     */
    goalEditable?: boolean;
  },
) {
  return (
    <div className="flex flex-col gap-3">
      <Field
        label={t("household.member.first_name")}
        hint={t("household.member.first_name_hint")}
      >
        <input
          // `min-w-0`: un enfant flex ne rétrécit pas sous son contenu sans lui,
          // et la ligne déborde à 320 px (leçon `flex-child-min-width-auto`).
          className={`${inputClass} min-w-0`}
          value={draft.firstName}
          maxLength={40}
          onChange={(e) => onChange({ ...draft, firstName: e.target.value })}
        />
      </Field>
      <Field
        label={t("household.member.birth_date")}
        // D18 — SUR MA PROPRE LIGNE, CE CHAMP EST CELUI DE MON « ABOUT YOU »:
        // il écrit `profiles.birth_date` (voir `saveMember`). Le dire évite la
        // question qui suit sinon — « faut-il la remettre là-bas ? » — et la
        // réponse fausse qui va avec.
        hint={mine
          ? t("household.member.birth_date_mine")
          : showKeptDateHint
          ? t("household.member.birth_date_kept")
          : t("household.member.birth_date_hint")}
      >
        <input
          className={`${inputClass} min-w-0`}
          type="date"
          value={draft.birthDate}
          // La base refuse une date future (`bad_birth_date`); le champ le dit
          // avant l'aller-retour, il ne le REMPLACE pas.
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => onChange({ ...draft, birthDate: e.target.value })}
        />
      </Field>
      <Field
        label={mine ? t("household.member.goal_mine") : t("household.member.goal")}
        hint={goalEditable ? undefined : t("household.member.goal_from_profile")}
      >
        {goalEditable
          ? (
            // TROIS TUILES, AUCUNE PRÉ-SÉLECTION, ET UNE SEULE POUR UN MINEUR
            // — le même composant que la fiche et que l'entonnoir.
            <GoalTiles
              name={radioName}
              ariaLabel={mine ? t("household.member.goal_mine") : t("household.member.goal")}
              value={draft.goal}
              ageState={ageState}
              labelOf={goalLabel}
              onChange={(g) => onChange({ ...draft, goal: g })}
            />
          )
          : (
            <p className="text-sm text-ink">
              {/* « — » ET PLUS « Aucune direction particulière »: une lecture
                  qui nomme une quatrième direction en fabrique une. */}
              {draft.goal ? goalLabel(draft.goal) : "—"}
            </p>
          )}
      </Field>
    </div>
  );
}

/**
 * MOI, CONVIVE — la première carte de l'écran.
 *
 * Elle porte la ligne membre du compte maître ET, la première fois seulement,
 * sa ligne `student_goals`. C'est cette seconde écriture qui supprime la
 * falaise: sans elle, `generate-household-meal-v1` rend `goal_required` (409),
 * et on le découvrait après avoir saisi tout le foyer.
 */
/**
 * ⚠️ EXPORTÉ POUR SON HARNAIS (D5), et pas par commodité. Ce qui se prouve ici
 * est « QU'EST-CE QUE LE LECTEUR VOIT »: que les trois champs en ligne et la
 * fenêtre ne coexistent JAMAIS. Un test de source serait vert sur du code mort
 * — ce dépôt en a mesuré deux.
 */
export function MeCard(
  { me, slots, needsGoalRow, goalEditable, busy, onSave, sheet, todayLocalIso }: {
    me: HouseholdMemberView;
    needsGoalRow: boolean;
    /**
     * `YYYY-MM-DD` LOCAL, REQUIS — jamais une horloge lue ici. L'âge qui
     * filtre les directions se lit sur la date TAPÉE dans les trois champs en
     * ligne, et `sheet.todayLocalIso` n'existe que quand la fiche existe.
     */
    todayLocalIso: string;
    /**
     * D5 — LA FENÊTRE « UNE BOUCHE » POUR LE MAÎTRE, ou `null`.
     *
     * `null` REMET LES TROIS CHAMPS EN LIGNE, et ce n'est pas un repli
     * décoratif: c'est le seul formulaire qui marche pour un profil réclamé
     * (la fenêtre écrit un corps, et cette porte-là est réservée au maître),
     * et le seul qui n'écrase rien quand une lecture a échoué.
     *
     * ⚠️ LES DEUX NE COEXISTENT JAMAIS. Deux formulaires qui écrivent les
     * mêmes trois colonnes sur la même carte, c'est la garantie qu'un jour
     * l'un des deux cessera d'écrire ce que l'autre écrit.
     */
    /**
     * LES MOMENTS SUR LESQUELS SA FICHE L'INTERROGE. REQUIS — jamais
     * optionnel: non passé, la fenêtre reviendrait aux six créneaux en dur,
     * c'est-à-dire au défaut signalé le 2026-08-19. `habitSlotsFor` porte la
     * cascade (les siens, sinon ceux de la maison, sinon les six).
     */
    slots: readonly EatingOccasion[];
    sheet: null | {
      known: KnownMouth;
      todayLocalIso: string;
      failure: string | null;
      onSave: (draft: MouthFormDraft) => Promise<boolean>;
    };
    /**
     * D1 — l'objectif d'un titulaire vit dans son « about you ». On ne l'offre
     * ICI que tant que sa ligne `student_goals` N'EXISTE PAS: c'est la
     * CRÉATION qui supprime la falaise. Une fois la ligne écrite, elle se
     * modifie sur `/app/plan`, et ce champ devient une lecture.
     */
    goalEditable: boolean;
    busy: boolean;
    onSave: (patch: {
      firstName: string;
      birthDate: string | null;
      goal: MemberGoal | null;
    }) => Promise<boolean>;
  },
) {
  const [draft, setDraft] = React.useState<MouthDraft>({
    firstName: me.displayName === "—" ? "" : me.displayName,
    birthDate: "",
    goal: (me.goal as MemberGoal | null) ?? "",
  });
  const [saved, setSaved] = React.useState(false);
  // ── D5 · L'ÉTAT DE LA FENÊTRE ──────────────────────────────────────────
  // ⚠️ LES HOOKS SONT INCONDITIONNELS, même quand `sheet` est `null`: une
  // carte qui gagne sa fenêtre à la deuxième lecture changerait sinon de
  // nombre de hooks entre deux rendus.
  const [open, setOpen] = React.useState(false);
  // ⚠️ SEMÉ DÈS LE PREMIER RENDU, ET RE-SEMÉ À CHAQUE LECTURE DIFFÉRENTE (voir
  // l'effet juste en dessous). L'initialiseur seul laisserait la fiche montrer
  // du vide pendant un battement — « un formulaire qui affiche du vide non lu
  // finit toujours par le faire écrire ».
  const [sheetDraft, setSheetDraft] = React.useState<MouthFormDraft>(() =>
    sheet === null ? emptyMouthDraft() : draftFromKnown(sheet.known)
  );
  /**
   * ⚠️ ON SÈME SUR LA LECTURE, PAS AU MONTAGE, ET C'EST LA MOITIÉ QUI COMPTE.
   *
   * Le brouillon était semé À L'OUVERTURE de la fenêtre. La fiche est en ligne
   * depuis le 2026-08-18: il n'y a plus d'ouverture, et un brouillon figé au
   * montage rendrait, au deuxième Save, la photo d'AVANT le premier — `setHabits`
   * comme `setTarget` REMPLACENT ce qu'elles trouvent. C'est la cicatrice
   * « `current` périmé efface l'écriture d'avant », mesurée deux fois.
   *
   * La dépendance est la VALEUR lue, sérialisée: un re-rendu qui rend le même
   * `known` ne touche à rien, donc une saisie en cours survit à tout ce qui
   * n'est pas une lecture différente.
   */
  // ⚠️ FF-060 — le compte de moments que le corps de cette fiche exige. Voir
  // `useEatingStructure`: aucun calcul ici, c'est le serveur qui répond avec le
  // MÊME module pur que le générateur.
  const sheetStructure = useEatingStructure({
    draft: sheetDraft,
    active: open,
    todayLocalIso: sheet?.todayLocalIso ?? "",
  });

  const knownKey = JSON.stringify(sheet?.known ?? null);
  React.useEffect(() => {
    if (sheet === null) return;
    setSheetDraft(draftFromKnown(sheet.known));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownKey]);
  // L'ÂGE DES TROIS CHAMPS EN LIGNE: la date tapée gagne sur le roster.
  const meAge = ageStateOfTypedDate(draft.birthDate, me.ageState, todayLocalIso);

  if (sheet !== null) {
    return (
      <Card tone={needsGoalRow ? "warning" : "default"}>
        <SectionLabel>{t("household.me.title")}</SectionLabel>
        <p className="mb-3 text-sm text-ink-soft">
          {needsGoalRow ? t("household.me.unlock") : t("household.me.sheet")}
        </p>
        {/* ── LES TROIS BLOCS QUI STRUCTURENT, EN LIGNE (2026-08-18) ───────
            Ils vivaient derrière « Fill in my details ». La direction, le poids
            visé et le curseur de rythme décident de la forme des assiettes: les
            cacher derrière un clic, c'était rendre le réglage central de ce
            produit invisible à qui ne pense pas à ouvrir une fenêtre. Ce qui
            reste dans la fenêtre est ce qui AFFINE. */}
        <MouthCoreFields
          draft={sheetDraft}
          onChange={setSheetDraft}
          // `existing: true` — sa ligne EXISTE, on la complète. `hasAccount:
          // true` — c'est la seule bouche de cet écran qui en a un: elle porte
          // donc son shaker, et pas son régime.
          // `/app/household` ne rend cette fiche QUE pour le compte courant.
          subject={{ existing: true, hasAccount: true, isSelf: true }}
          todayLocalIso={sheet.todayLocalIso}
          busy={busy}
          failure={sheet.failure}
          onOpenPreferences={() => setOpen(true)}
          onSubmit={() => {
            void sheet.onSave(sheetDraft);
          }}
        />
        <MouthFormDialog
          open={open}
          onClose={() => setOpen(false)}
          draft={sheetDraft}
          onChange={setSheetDraft}
          // ⚠️ FF-060 — MÊME VERROU QU'À L'INSCRIPTION, ET C'EST LA RAISON DE
          // LE POSER ICI AUSSI. Sans lui, cette carte laisserait décocher un
          // moment que le parcours d'inscription venait de verrouiller: deux
          // écrans, deux réponses, et celui qui ment est le second.
          structure={sheetStructure}
          // `/app/household` ne rend cette fiche QUE pour le compte courant.
          subject={{ existing: true, hasAccount: true, isSelf: true }}
          busy={busy}
          // `/app/household` N'EXISTE QUE PARCE QU'IL Y A UN FOYER: la ligne
          // membre est là, donc les habitudes, les dégoûts et le régime ont
          // tous les trois où aller. Voir la prop.
          slots={slots}
          // ⟳ `with_the_card` DEPUIS LE 2026-09-01, ET C'ÉTAIT `null`. Le
          // commentaire disait « pas de chemin d'écriture ici »: il y en a un,
          // et c'est le bouton de la carte — `persistMouth` porte
          // `ownShakerWriter(userId)` juste au-dessus. Ce que `null` faisait
          // vraiment, c'est empêcher de COLLECTER la déclaration; le champ
          // était donc invisible sur le seul écran où le titulaire peut
          // reprendre sa fiche. Voir `ShakerPort`.
          shakerPort={{ kind: "with_the_card" }}
        />
      </Card>
    );
  }

  return (
    <Card tone={needsGoalRow ? "warning" : "default"}>
      <SectionLabel>{t("household.me.title")}</SectionLabel>
      <p className="mb-3 text-sm text-ink-soft">
        {needsGoalRow ? t("household.me.unlock") : t("household.me.body")}
      </p>
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
      {/* L'INCITATION À COMPLÉTER EST INTÉGRÉE, et elle est vraie: un objectif
          posé sur une bouche sans âge est enregistré et NON APPLIQUÉ
          (`goalApplies`). Le taire ferait un champ qui ne fait rien. */}
      {me.goal && me.ageState === "unknown" ? (
        <p className="mt-2 text-sm text-amber-800">
          {t("household.member.goal_inactive")}
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-3">
        {/* ── LA SEULE ACTION FIGUE DE L'ÉCRAN, ET ELLE EST CONDITIONNELLE ────
            Mesuré au navigateur avant ce lot: `/app/household` rendait DEUX
            boutons `bg-fig-700` en même temps — celui-ci et « ajouter une
            bouche » — plus le lien de navigation actif du shell. Trois aplats de
            marque sur un écran, c'est-à-dire aucune hiérarchie.
            La promotion suit maintenant le MÊME fait que le ton de la carte:
            tant que la ligne d'objectif du compte maître n'existe pas, ce
            bouton est le seul geste qui débloque la composition, et la carte est
            déjà en `tone="warning"` pour le dire. Une fois la ligne écrite, ce
            même bouton n'est plus qu'une correction de prénom — et l'action
            principale de l'écran devient « composer », plus bas. */}
        <Button
          variant={needsGoalRow ? "primary" : "secondary"}
          disabled={busy || !draft.firstName.trim()}
          onClick={async () => {
            const ok = await onSave({
              firstName: draft.firstName,
              birthDate: draft.birthDate || null,
              // PLIÉE À L'ÂGE, comme à l'écran: ce qui part est ce qui est coché.
              goal: goalForAge(draft.goal, meAge) || null,
            });
            setSaved(ok);
            if (ok) setDraft((d) => ({ ...d, birthDate: "" }));
          }}
        >
          {t("household.member.save")}
        </Button>
        {saved ? (
          <span className="text-sm text-ink-soft">{t("household.member.saved")}</span>
        ) : null}
      </div>
    </Card>
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
    <Card>
      <SectionLabel>{t("household.add.title")}</SectionLabel>
      <p className="mb-3 text-sm text-ink-soft">{t("household.add.body")}</p>
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
    </Card>
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
  { household, restrictions, dislikes, allergies, busy, mutedMembers, rhythm, awayWindow, bodies, habits, invitations, onInvited, practicalConstraints, hasGoal, onSavedOwnConstraints, workLunch, workLunchError, onSaveWorkLunch, onSaveHabits, onSaveDiet, onSaveBody, onMute, onSaveAway, onSave, onRemove, onDetach, onAddAllergy, onRemoveAllergy, onAddRestriction, onRemoveRestriction, todayLocalIso }: {
    household: HouseholdView;
    restrictions: RestrictionView[];
    /**
     * ⚠️ CE QUE LA BOUCHE N'AIME PAS — ET CE N'EST PAS `restrictions`.
     * Une RÈGLE DE MAISON est une décision de la personne qui tient le foyer,
     * étiquetée « pas servi ici, {prénom} l'a décidé »; un DÉGOÛT est une
     * préférence de la bouche elle-même. Les confondre était le défaut fermé
     * par le lot C: la fiche se semait avec les règles, et les réenregistrait
     * en préférences au premier « Enregistrer ».
     */
    dislikes: Map<string, string[]>;
    allergies: AllergyView[];
    busy: boolean;
    /** `YYYY-MM-DD` local, descendu à chaque ligne — voir `MeCard`. */
    todayLocalIso: string;
    /**
     * LE DÉJEUNER EN SEMAINE (A6). `null` = PAS ENCORE LU — la carte ne pose
     * alors aucune question. Voir l'état de la page.
     */
    /** A5 §5.5 — les invitations vivantes, `null` = pas lu. */
    invitations: Map<string, LiveInvitation> | null;
    /** La page relit ses faits après une invitation créée. REQUIS. */
    onInvited: () => void | Promise<void>;
    /** A5 point 7 — la colonne DE LA SESSION, `null` = pas lue. */
    practicalConstraints: PracticalConstraints | null;
    hasGoal: boolean;
    onSavedOwnConstraints: () => void | Promise<void>;
    workLunch: Map<string, WorkLunch | null> | null;
    workLunchError: string | null;
    /** Le geste complet d'une bouche: écrire, relire les réponses, relire la page. */
    onSaveWorkLunch: (
      memberId: string,
      answer: WorkLunch,
    ) => Promise<{ ok: boolean; reason: string | null }>;
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
    /** Le régime d'une bouche. `null` efface — « on n'a pas demandé ». */
    onSaveDiet: (memberId: string, diet: string | null) => Promise<boolean>;
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
    onSaveBody: (
      memberId: string,
      heightCm: number,
      weightKg: number,
      gender: MemberGender,
      /**
       * ② les deux axes · ① les trois cases (2026-08-20), REQUIS.
       *
       * ⛔ Ce sont les CINQ questions que la fiche pose maintenant, et cette
       * rangée est le SEUL chemin d'écriture d'une bouche déjà inscrite. Un
       * paramètre facultatif ici aurait laissé le formulaire les afficher et le
       * bouton les jeter — « un champ qu'on remplit et qui ne va nulle part est
       * pire qu'un champ absent, il promet ».
       */
      extras: MouthActivityAndStructure,
    ) => Promise<boolean>;
    /** D17 — les bouches dont on ne veut plus voir les propositions. */
    mutedMembers: Set<string> | null;
    /** Les LIGNES de la grille de présence — les moments d'une journée. */
    rhythm: EatingOccasionSlot[];
    /** Les COLONNES: la fenêtre que la composition va couvrir. */
    awayWindow: { tokens: string[]; dates: string[] };
    onMute: (memberId: string, muted: boolean) => void;
    onSaveAway: (memberId: string, away: AwayDay[]) => Promise<boolean>;
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
        <SectionLabel>{t("household.members.title")}</SectionLabel>
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
        <ul className="mb-3 flex flex-col divide-y divide-line">
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
                  dislikes={dislikes.get(m.memberId) ?? []}
                  busy={busy}
                  // Le réglage de fusion est au maître: `null` = on ne montre
                  // pas un interrupteur dont on ignore la position, et celui-ci
                  // n'est même pas le sien.
                  muted={null}
                  rhythm={rhythm}
                  awayWindow={awayWindow}
                  // ⛔ ZÉRO LIGNE POUR LUI, ET LE CADRE NE SE REND PAS: `body`
                  // reste `null`, mais c'est `viewerIsOwner={false}` qui retire
                  // le bloc — pas cette valeur, qui voudrait dire « lu, rien ».
                  body={null}
                  bodiesLoaded={bodies !== null}
                  // ⚠️ CE COMMENTAIRE A ÉTÉ FAUX, et c'est le défaut n°1 de la
                  // vérification: il affirmait que `MemberAccess` ne rendait
                  // « qu'un état » à un membre, alors que le composant ne
                  // recevait AUCUN fait sur son lecteur et rendait le bouton de
                  // détachement à tout le monde. Il dit maintenant ce que le
                  // code FAIT: la garde est `viewerIsOwner`, passée par
                  // `MemberRow`, et un cas la capture sur le HTML rendu.
                  invitations={invitations}
                  onInvited={onInvited}
                  practicalConstraints={practicalConstraints}
                  hasGoal={hasGoal}
                  onSavedOwnConstraints={onSavedOwnConstraints}
                  // ⚠️ MÊME PARTAGE QUE CHEZ LE MAÎTRE: `habitsLoaded` dit si
                  // la LECTURE a eu lieu, `habits` ce qu'elle a trouvé. Le
                  // cadre des préférences ne se rend pas tant que le premier
                  // est faux.
                  habitsLoaded={habits !== null}
                  habits={habits?.get(m.memberId) ?? null}
                  workLunch={workLunch}
                  workLunchError={workLunchError}
                  onSaveWorkLunch={(answer) => onSaveWorkLunch(m.memberId, answer)}
                  onSaveHabits={(sl, n) => onSaveHabits(m.memberId, sl, n)}
                  onSaveDiet={(diet) => onSaveDiet(m.memberId, diet)}
                  onSaveBody={(h, w, g, extras) => onSaveBody(m.memberId, h, w, g, extras)}
                  onMute={(next) => onMute(m.memberId, next)}
                  onSaveAway={(next) => onSaveAway(m.memberId, next)}
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
      </Card>
    );
  }

  return (
    <Card>
      <SectionLabel>{t("household.members.title")}</SectionLabel>
      <ul className="flex flex-col divide-y divide-line">
        {household.members.map((m) => (
          <MemberRow
            key={m.memberId}
            member={m}
            todayLocalIso={todayLocalIso}
            isMe={m.memberId === me?.memberId}
            viewerIsOwner
            allergies={allergies.filter((a) => a.memberId === m.memberId)}
            restrictions={restrictions.filter((r) => r.memberId === m.memberId)}
            dislikes={dislikes.get(m.memberId) ?? []}
            busy={busy}
            // D17 — `null` tant que le réglage n'est pas lu, et `null` aussi
            // quand la lecture a échoué: on ne montre pas un interrupteur dont
            // on ignore la position.
            muted={mutedMembers === null ? null : mutedMembers.has(m.memberId)}
            rhythm={rhythm}
            awayWindow={awayWindow}
            // `null` = rien de saisi POUR CETTE BOUCHE. La carte des corps est
            // vide pour un non-maître (la RPC lui rend zéro ligne), donc ce
            // bloc ne s'affiche que là où il est légitime.
            body={bodies?.get(m.memberId) ?? null}
            // LA LECTURE DES CORPS, SÉPARÉE DE SON CONTENU — même partage que
            // `habitsLoaded` juste en dessous, et pour la même raison.
            bodiesLoaded={bodies !== null}
            invitations={invitations}
            onInvited={onInvited}
            practicalConstraints={practicalConstraints}
            hasGoal={hasGoal}
            onSavedOwnConstraints={onSavedOwnConstraints}
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
            workLunch={workLunch}
            workLunchError={workLunchError}
            onSaveWorkLunch={(answer) => onSaveWorkLunch(m.memberId, answer)}
            onSaveHabits={(s, n) => onSaveHabits(m.memberId, s, n)}
            onSaveDiet={(diet) => onSaveDiet(m.memberId, diet)}
            onSaveBody={(h, w, g, extras) => onSaveBody(m.memberId, h, w, g, extras)}
            onMute={(next) => onMute(m.memberId, next)}
            onSaveAway={(next) => onSaveAway(m.memberId, next)}
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
    </Card>
  );
}


/**
 * LE CORPS D'UNE BOUCHE — taille, poids, sexe. TOUT-OU-RIEN.
 *
 * Décision humaine du 2026-08-12, qui renverse FF-047 §3 et le « cran 2 » du
 * README du foyer: on collecte pour CHAQUE bouche, y compris sans compte, y
 * compris pour un mineur.
 *
 * ⚠️ CE QUE CE FORMULAIRE NE FAIT PAS, ET NE FERA PAS. Il ne rend aucun
 * chiffre calculé — ni besoin, ni IMC, ni catégorie, ni cible. Ce qu'on saisit
 * entre dans le MOTEUR et en ressort en grammes d'aliment sur une assiette.
 * C'est la ligne de partage du lot: collecter et calculer, jamais énoncer.
 */
function BodyFields(
  { body, busy, needsBirthDate, onSave }: {
    body: MemberBodyView | null;
    busy: boolean;
    /** L'équation dépend de l'âge, et elle n'est pas la même avant 18 ans. */
    needsBirthDate: boolean;
    onSave: (
      h: number,
      w: number,
      g: MemberGender,
      extras: MouthActivityAndStructure,
    ) => Promise<boolean>;
  },
) {
  const [height, setHeight] = React.useState(body ? String(body.heightCm) : "");
  const [weight, setWeight] = React.useState(body ? String(body.weightKg) : "");
  const [gender, setGender] = React.useState<MemberGender | "">(body?.gender ?? "");
  const [saved, setSaved] = React.useState(false);
  // ── ② LES DEUX AXES · ① LES TROIS CASES (2026-08-20) ──────────────────
  const [extras, setExtras] = React.useState<MouthActivityAndStructure>({
    dayActivity: body?.dayActivity ?? "",
    sportFrequency: body?.sportFrequency ?? "",
    takesDessert: body?.takesDessert ?? null,
    takesCheese: body?.takesCheese ?? null,
    takesBread: body?.takesBread ?? null,
    appetite: body?.appetite ?? "",
  });
  /**
   * ⛔ ON RESÈME SUR LA LECTURE, PAS AU MONTAGE — ET ICI ÇA COÛTE PLUS CHER
   * QU'AILLEURS.
   *
   * Les trois champs du dessus (taille, poids, sexe) sont semés au montage, et
   * c'est supportable: la porte les lit comme un tout-ou-rien qu'on renvoie
   * complet. Ces cinq-là, non. Depuis le 2026-08-20 la porte accepte de
   * DÉ-répondre — le drapeau `…_asked` autorise l'écriture d'un `null` — donc
   * un formulaire figé sur du vide non lu ne se contente plus de ne rien dire:
   * il EFFACE. C'est « formulaire figé au montage » et « `current` périmé
   * efface l'écriture d'avant », les deux à la fois.
   *
   * La dépendance est la VALEUR lue, sérialisée: un re-rendu qui rend le même
   * corps ne touche à rien, donc une saisie en cours survit à tout ce qui n'est
   * pas une lecture différente.
   */
  const bodyKey = JSON.stringify(body ?? null);
  React.useEffect(() => {
    setExtras({
      dayActivity: body?.dayActivity ?? "",
      sportFrequency: body?.sportFrequency ?? "",
      takesDessert: body?.takesDessert ?? null,
      takesCheese: body?.takesCheese ?? null,
      takesBread: body?.takesBread ?? null,
      appetite: body?.appetite ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyKey]);

  const h = Number(height);
  const w = Number(weight);
  // LE MÊME TOUT-OU-RIEN QU'EN BASE. Le bouton reste inerte tant que les trois
  // ne sont pas là: `body_incomplete` existe quand même côté serveur, parce
  // qu'un bouton grisé n'est pas une garde.
  const complete = Number.isFinite(h) && h > 0 && Number.isFinite(w) && w > 0 &&
    gender !== "";

  return (
    <div className="border-t border-line pt-3">
      <SectionLabel>{t("household.body.title")}</SectionLabel>
      <p className="mb-2 text-xs text-ink-soft">{t("household.body.hint")}</p>
      {body === null ? (
        <p className="mb-2 text-xs text-amber-800">{t("household.body.missing")}</p>
      ) : null}
      {needsBirthDate ? (
        <p className="mb-2 text-xs text-amber-800">
          {t("household.body.needs_birth_date")}
        </p>
      ) : null}
      {/* ── LES TROIS CHAMPS PASSENT PAR `Field`, ET CE N'EST PAS COSMÉTIQUE ──
          Ils se tenaient à la main: un `<label class="flex flex-col text-xs">`
          enveloppant un `<input class="rounded border-gray-300 text-sm">`. Trois
          conséquences mesurables, pas une:
            · `text-sm` = 14 px, donc Safari iOS zoomait au focus et ne
              dézoomait plus — la règle des 16 px d'`index.css` est dans
              `@layer base` et un utilitaire la bat;
            · `border-gray-300` est à 1,73:1 sur ce papier, sous le seuil de
              3:1 que WCAG 1.4.11 exige d'une bordure de CONTRÔLE;
            · l'étiquette n'était liée au champ que par l'enveloppe, et son
              cran (`text-xs`) n'était celui d'aucune autre étiquette du produit.
          La largeur vit maintenant sur l'ENVELOPPE (`w-24`), parce que
          `inputClass` porte `w-full`: la poser sur le champ ferait deux
          utilitaires `w-*` dont l'ordre de génération, et non la source,
          désignerait le gagnant. */}
      {/* `items-start` ET PAS `items-end`: un `<select>` fait 41 px là où un
          `<input>` en fait 42 (mesuré), donc aligner par le BAS décalait le haut
          des trois boîtes de 2 px et l'étiquette « sexe » d'autant. Aligné par
          le haut, ce sont les étiquettes et les bords supérieurs qui tombent
          juste — la ligne que l'œil suit. */}
      <div className="flex flex-wrap items-start gap-2">
        {/* ⚠️ `w-20` ET PAS `w-24`, ET C'EST UNE MESURE. À 320 px la fiche
            ouverte ne laisse que 198 px sur cette ligne (carte `p-4` + panneau
            `p-3`): deux champs de 96 px et leur gouttière de 8 en font 200, donc
            « taille » et « poids » se retrouvaient empilés pour 2 px. 80 + 80 + 8
            = 168, et 80 px tiennent « 180 » à 16 px. */}
        <Field label={t("household.body.height")} className="w-20">
          <input
            type="number"
            inputMode="decimal"
            className={inputClass}
            value={height}
            onChange={(e) => { setHeight(e.target.value); setSaved(false); }}
          />
        </Field>
        <Field label={t("household.body.weight")} className="w-20">
          <input
            type="number"
            inputMode="decimal"
            className={inputClass}
            value={weight}
            onChange={(e) => { setWeight(e.target.value); setSaved(false); }}
          />
        </Field>
        <Field label={t("household.body.gender")} className="w-40">
          <select
            className={inputClass}
            value={gender}
            onChange={(e) => {
              setGender(e.target.value as MemberGender | "");
              setSaved(false);
            }}
          >
            <option value="">—</option>
            {MEMBER_GENDERS.map((g) => (
              <option key={g} value={g}>{t(`household.body.gender_${g}` as never)}</option>
            ))}
          </select>
        </Field>
      </div>
      {/* ── ② LES DEUX AXES · ① LES TROIS QUESTIONS ─────────────────────
          Sous le corps, dans le MÊME geste d'enregistrement, parce que c'est la
          même porte qui les écrit. Deux boutons sur un même bloc, c'est la
          garantie qu'un jour l'un des deux cessera d'écrire ce que l'autre
          écrit — mesuré sur `MeCard`. */}
      <div className="mt-3 flex flex-col gap-3">
        {/* ⛔ LES DEUX BLOCS ICI, ET C'EST LE SEUL ÉCRAN DANS CE CAS. Cette
            rangée n'ouvre AUCUNE fenêtre de préférences: y laisser seulement
            les deux axes rendrait ① et ⑤ inatteignables pour une bouche déjà
            inscrite — un champ qu'on peut remplir sur une fiche neuve et plus
            jamais ensuite. */}
        {/* ⛔ LES DEUX BLOCS ICI, ET C'EST LE SEUL ÉCRAN DANS CE CAS. Cette
            rangée n'ouvre AUCUNE fenêtre de préférences: n'y laisser que les
            deux axes rendrait ① et ⑤ inatteignables pour une bouche déjà
            inscrite — un champ qu'on peut remplir sur une fiche neuve et plus
            jamais ensuite. */}
        <MouthActivityAxesFields
          voice="other"
          who={t("household.mouth.who_fallback")}
          value={extras}
          onChange={(patch) => {
            setExtras((prev) => ({ ...prev, ...patch }));
            setSaved(false);
          }}
        />
        <MouthAppetiteFields
          voice="other"
          who={t("household.mouth.who_fallback")}
          value={extras}
          onChange={(patch) => {
            setExtras((prev) => ({ ...prev, ...patch }));
            setSaved(false);
          }}
        />
        {/* ⛔ « CE QU'IL Y A D'AUTRE DANS L'ASSIETTE » A ÉTÉ RETIRÉ LE
            2026-09-01. Les trois oui/non étaient posés UNE FOIS POUR LA
            PERSONNE et leur ratio partait sur les six moments; la question se
            pose maintenant DANS le moment qu'elle concerne, en bulles, depuis
            la fiche (`MouthPreferencesFields`). Cette carte-ci n'édite QUE le
            corps — elle n'a pas de section « quand elle mange » où les
            ranger. */}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button
          variant="secondary"
          disabled={busy || !complete}
          onClick={async () => {
            // `complete` porte déjà `gender !== ""`, et TypeScript le sait: le
            // rétrécissement voyage par la constante. Rajouter le test ici
            // ferait une comparaison que le compilateur signale comme morte.
            if (!complete) return;
            const ok = await onSave(h, w, gender, extras);
            if (ok) setSaved(true);
          }}
        >
          {t("household.body.save")}
        </Button>
        {saved ? (
          <span className="text-xs text-emerald-700">{t("household.body.saved")}</span>
        ) : null}
      </div>
    </div>
  );
}

function MemberBadges({ member }: { member: HouseholdMemberView }) {
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{member.displayName}</span>
      {member.role === "owner" ? <Badge>{t("household.members.owner")}</Badge> : null}
      {/* L'ÉTIQUETTE, JAMAIS L'ÂGE. Un enfant n'a pas à voir son âge affiché sur
          un écran que tout le foyer regarde.
          ⚠️ `unknown` ne porte AUCUNE étiquette: écrire « adulte » par défaut
          affirmerait un fait qu'on n'a pas. */}
      {member.ageState === "minor" ? <Badge>{t("household.members.child")}</Badge> : null}
    </li>
  );
}

/**
 * UN CADRE NOMMÉ DE LA FICHE — A5 (D5.1), 2026-09-03.
 *
 * ── ⛔ CE N'EST PAS UNE PRIMITIVE `Accordion`, ET C'EST DÉLIBÉRÉ ────────────
 * La charte interdit une primitive `Tabs`/`Accordion` neuve avant un TROISIÈME
 * usage. Il y en a deux ici (les deux cadres d'une ligne). Ce composant reste
 * donc LOCAL à cet écran: le jour où la pop-up d'ajout porte le sien (point 3
 * du mandat), les trois se comptent et la primitive se sort — pas avant, parce
 * qu'une abstraction tirée de deux cas fige le mauvais dénominateur.
 *
 * ── LES TROIS CHOSES QU'IL FAIT, ET CHACUNE RÉPOND À UN DÉFAUT MESURÉ ──────
 *   ① IL SE REPLIE, mais il s'ouvre PAR DÉFAUT. Le repli avait été retiré le
 *      2026-08-19 (« il faut arrêter avec le dépliable ») sur trois motifs;
 *      celui qui tenait vraiment est « une réponse repliée est une réponse
 *      invisible ». Ouvert par défaut, il ne cache rien; refermé À LA MAIN, il
 *      est refermé par quelqu'un qui vient de lire.
 *   ② IL RÉSUME CE QU'IL CACHE. C'est ce qui répond au motif ci-dessus, et
 *      c'est la seule chose qui rende le repli acceptable: le résumé reste à
 *      l'écran quand le contenu n'y est plus.
 *   ③ IL A UNE GARDE DE CHARGEMENT. `loaded` faux ⇒ AUCUN champ, une phrase.
 *      Les formulaires de cette page figent leurs champs au montage et
 *      REMPLACENT à l'enregistrement: un cadre monté sur une lecture non faite
 *      affiche du vide non lu, puis l'écrit. Le paramètre est REQUIS — jamais
 *      optionnel: une garde facultative est une garde désarmée.
 *
 * ⚠️ ET IL DÉMONTE SON CONTENU QUAND IL EST REPLIÉ, exprès: les champs d'ici
 * sont figés au montage, donc les remonter à l'ouverture est ce qui les fait
 * repartir de la lecture FRAÎCHE plutôt que de celle du premier rendu. C'est
 * l'inverse du choix fait pour `Modal` (qui rend `null` sans démonter, pour
 * qu'une grille en cours de saisie survive à une fermeture accidentelle), et
 * l'inverse est juste ici: on ne saisit rien dans un cadre replié.
 */
/**
 * L'ACCÈS D'UNE BOUCHE, DEPUIS SA LIGNE — A5 (§5.5), 2026-09-03.
 *
 * ── ⛔ CE QUI ÉTAIT FAUX AVANT: UN MENU DÉROULANT EN BAS DE PAGE ──────────
 * `InviteCard` demandait « qui invites-tu ? » dans un `<select>`, tout en bas,
 * loin des huit lignes qui portent déjà les prénoms. Trois défauts, et aucun
 * cosmétique:
 *   · la question était DÉJÀ RÉPONDUE par la ligne qu'on regarde;
 *   · la carte ne relisait RIEN: elle n'affichait que le jeton qu'elle venait
 *     de créer, donc une invitation envoyée hier était invisible, et le maître
 *     n'avait aucun moyen de savoir qu'il renvoyait un second lien;
 *   · elle ne disait pas ce que l'accès COÛTE, alors que c'est ce qu'il promet
 *     à quelqu'un en lui écrivant.
 *
 * ── LES TROIS ÉTATS SONT DÉRIVÉS DES FAITS, JAMAIS D'UN DRAPEAU ───────────
 * · `user_id` non nul ⇒ RÉCLAMÉE — « a son accès », et le geste inverse est
 *   « Retirer l'accès » (détacher: la bouche reste à table, avec sa portion et
 *   ses allergies) — distinct de « Retirer du foyer », qui détruit la ligne;
 * · une invitation vivante ⇒ INVITÉE — « envoyée le … à … », et « Renvoyer »;
 * · sinon ⇒ LIBRE — « Inviter ».
 * Un drapeau se désynchronise de la base; ces trois-là ne peuvent pas.
 *
 * ⚠️ `invitations === null` (pas lu) N'EST PAS « personne n'a été invité ». La
 * ligne offre alors « Inviter » sans dater quoi que ce soit: annoncer une
 * absence qu'on n'a pas lue ferait renvoyer un lien à quelqu'un qui vient d'en
 * recevoir un.
 *
 * ── ⛔ AUCUN MONTANT N'EST RECOPIÉ (D5.8) ─────────────────────────────────
 * La phrase vient de `offer.extra` + `PRICES.claimedProfile`, la MÊME source
 * que les cinq surfaces de vente. Le produit a déjà vendu ce même accès 2 € sur
 * deux pages et 1,99 € sur une troisième; le chiffre lui-même reste une
 * décision humaine, prise avant les gestes Stripe — l'écran, lui, ne fait que
 * lire.
 *
 * ⚠️ ET UNE BOUCHE MINEURE EST INVITABLE, comme aujourd'hui. Rien ne
 * l'interdit en base, et facturer l'accès d'un enfant est une décision
 * commerciale NON PRISE (FF-049 §7). La restreindre ici serait la prendre.
 *
 * ⚠️ AUCUN E-MAIL N'EST ENVOYÉ PAR CE PRODUIT (FF-060 R7). L'écran rend le
 * lien, propose de le copier et ouvre un brouillon `mailto:` — c'est le maître
 * qui écrit. En local, `EMAIL_DELIVERY_ENABLED=1` est un pistolet chargé: un
 * envoi depuis ici partirait pour de vrai.
 */
/**
 * ⚠️ EXPORTÉ POUR ÊTRE PROUVÉ, pas pour être réutilisé ailleurs: `HouseholdPage`
 * entier ne se monte pas sous `renderToStaticMarkup`. Voir
 * `pages/memberAccess.int.test.ts`.
 */
export function MemberAccess(
  { member, viewerIsOwner, invitation, invitationsLoaded, busy, onDetach, onInvited }: {
    member: HouseholdMemberView;
    /**
     * QUI REGARDE. REQUIS, jamais optionnel — et ce paramètre-ci a été AJOUTÉ
     * APRÈS COUP, le 2026-09-03, parce qu'il manquait et que TROIS TEXTES
     * affirmaient qu'il était là.
     *
     * ── ⛔ LE DÉFAUT, ET IL EST INSTRUCTIF ────────────────────────────────
     * Ce composant ne recevait AUCUN fait sur son lecteur, et `MemberRow` le
     * montait sans garde. Un membre réclamé lisait donc, sur sa propre ligne,
     * « A son accès » ET un bouton « Retirer son accès » — que
     * `keel_household_detach_member` refuse `not_owner`
     * (`20260811040000_household_detachment.sql:236`). Un bouton mort, à
     * l'endroit exact où le produit promet de ne pas en poser.
     *
     * ⚠️ TROIS AFFIRMATIONS CONCORDANTES, ET AUCUNE N'ÉTAIT VRAIE: l'analyse
     * §5.5 (« le maître seul voit ces boutons »), le journal du lot (« aucun
     * bouton d'invitation, aucun retrait »), et le commentaire de ce fichier
     * au site de montage. Aucun test ne l'a vu non plus — celui qui aurait dû
     * s'appelle « le retrait … sont gardés » et ne listait que
     * `household.member.remove`, jamais `.detach`. Un nom qui couvre deux
     * gestes, une assertion qui n'en vérifie qu'un.
     *
     * Il a fallu MONTER le composant et LIRE le rendu pour le trouver. C'est
     * la seule chose qui ait dit la vérité, et c'est pour ça que la garde est
     * désormais tenue par un cas qui capture le HTML, pas par un commentaire.
     */
    viewerIsOwner: boolean;
    /** L'invitation vivante de CETTE bouche, ou `null`. */
    invitation: LiveInvitation | null;
    /** Faux = la lecture n'a pas eu lieu. REQUIS: voir le pavé. */
    invitationsLoaded: boolean;
    busy: boolean;
    onDetach: () => void;
    /** La page relit ses faits — l'invitation qu'on vient de créer en est un. */
    onInvited: () => void | Promise<void>;
  },
) {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState(invitation?.email ?? "");
  const [token, setToken] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // LE MAÎTRE N'A PAS D'ACCÈS À DONNER NI À RETIRER: il EST l'accès.
  if (member.role === "owner") return null;

  const link = token === null
    ? null
    : `${globalThis.location?.origin ?? ""}/join-household?token=${token}`;

  async function send() {
    setWorking(true);
    setToken(null);
    setReason(null);
    setCopied(false);
    try {
      const res = await inviteToHousehold(email.trim(), member.memberId);
      if (res.ok) {
        // LE JETON VIENT DE LA RÉPONSE, et le prénom aussi côté RPC: c'est la
        // ligne que la base a RÉELLEMENT visée, pas celle qu'on croyait viser.
        setToken(String(res.token ?? ""));
        // ON RELIT: l'invitation qu'on vient de créer est un fait de la page,
        // et sans relecture la ligne dirait encore « jamais invitée ».
        await onInvited();
      } else setReason(res.reason);
    } finally {
      setWorking(false);
    }
  }

  // ── ÉTAT ③ · RÉCLAMÉE ─────────────────────────────────────────────────
  if (member.userId) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {/* L'ÉTAT EST UN FAIT, ET IL SE LIT PAR TOUT LE MONDE. « A son accès »
            décrit la ligne, il ne propose rien: le cacher à la personne
            concernée lui retirerait la seule phrase qui lui dise pourquoi elle
            peut éditer sa fiche. */}
        <Badge tone="neutral">{t("household.access.claimed")}</Badge>
        {/* ⛔ LE GESTE, LUI, EST AU MAÎTRE — et la phrase qui l'explique part
            avec lui. `keel_household_detach_member` refuse `not_owner`: rendu à
            un membre, ce bouton est mort, et l'aide à côté décrirait un geste
            qu'il ne peut pas faire. Voir le pavé de la prop. */}
        {viewerIsOwner
          ? (
            <>
              <button
                type="button"
                className="text-ink-soft underline disabled:opacity-50"
                disabled={busy}
                onClick={onDetach}
              >
                {t("household.member.detach")}
              </button>
              <span className="basis-full text-ink-soft">
                {t("household.member.detach_hint")}
              </span>
            </>
          )
          : null}
      </div>
    );
  }

  // ⛔ ET RIEN D'AUTRE POUR UN NON-MAÎTRE. Inviter est `not_owner` comme
  // détacher: sur une ligne encore libre, un membre ne voit ni le bouton, ni la
  // date d'une invitation en cours — ce n'est pas son foyer à administrer.
  if (!viewerIsOwner) return null;

  return (
    <div className="mt-2 flex flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {/* ⚠️ « INVITÉE LE … » NE S'AFFICHE QUE SI ON A LU. Voir le pavé. */}
        {invitationsLoaded && invitation !== null
          ? (
            <span className="text-ink-soft">
              {t("household.access.invited", {
                date: invitation.createdAt.slice(0, 10),
                email: invitation.email,
              })}
            </span>
          )
          : null}
        <button
          type="button"
          className="text-fig-700 underline disabled:opacity-50"
          disabled={busy}
          onClick={() => setOpen((v) => !v)}
        >
          {invitationsLoaded && invitation !== null
            ? t("household.access.resend")
            : t("household.access.invite")}
        </button>
      </div>

      {open
        ? (
          <div className="flex flex-col gap-2 rounded-card bg-paper-2 p-3">
            {/* CE QUE ÇA DONNE, ET CE QUE ÇA NE DONNE PAS (FF-048 R10). Le
                maître écrit le message d'accompagnement: s'il promet « tu
                pourras composer », la base le démentira et c'est LUI qui aura
                menti. */}
            <p className="text-ink-soft">{t("household.invite.grants")}</p>
            {/* ⛔ LE MONTANT EST LU, JAMAIS RECOPIÉ (D5.8). */}
            <p className="text-ink-soft">
              {t("offer.extra", { amount: formatPrice(PRICES.claimedProfile) })}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              {/* `sm:flex-1` et pas `flex-1`: en `flex-col` sous 640 px, la
                  grandeur s'appliquerait à la HAUTEUR. `min-w-0` va avec, sinon
                  l'enfant refuse de descendre sous son contenu et fait défiler
                  la page à 320 px. */}
              <Field
                label={t("household.invite.email")}
                className="min-w-0 sm:flex-1"
              >
                <input
                  className={`${inputClass} min-w-0`}
                  value={email}
                  type="email"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Button
                size="sm"
                disabled={busy || working || !email.trim()}
                onClick={() => void send()}
              >
                {t("household.invite.submit")}
              </Button>
            </div>

            {/* LE JETON N'EST RENDU QU'UNE FOIS PAR LA RPC — on l'affiche donc
                en entier, et on NOMME la bouche qu'il vise: le maître en émet
                plusieurs dans la même minute, et un lien anonyme part à la
                mauvaise personne. */}
            {link !== null
              ? (
                <div className="flex flex-col gap-2">
                  <p className="text-ink-soft">
                    {t("household.invite.link_ready", {
                      name: member.displayName,
                    })}
                  </p>
                  <code className="block overflow-x-auto rounded-card bg-paper p-2">
                    {link}
                  </code>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="text-fig-700 underline"
                      onClick={() => {
                        // ⚠️ LE PRESSE-PAPIER PEUT NE PAS EXISTER (contexte non
                        // sécurisé, permission refusée): on ne promet « copié »
                        // qu'après coup, et le lien reste sélectionnable
                        // au-dessus dans tous les cas.
                        void navigator.clipboard
                          ?.writeText(link)
                          .then(() => setCopied(true))
                          .catch(() => setCopied(false));
                      }}
                    >
                      {copied
                        ? t("household.access.copied")
                        : t("household.access.copy")}
                    </button>
                    {/* ⛔ `mailto:` OUVRE UN BROUILLON, IL N'ENVOIE RIEN. Ce
                        produit n'envoie aucun e-mail d'invitation (FF-060 R7),
                        et en local une vraie clé Resend est branchée. */}
                    <a
                      className="text-fig-700 underline"
                      href={`mailto:${encodeURIComponent(email.trim())}` +
                        `?subject=${
                          encodeURIComponent(t("household.access.mail_subject"))
                        }&body=${encodeURIComponent(link)}`}
                    >
                      {t("household.access.mail")}
                    </a>
                  </div>
                </div>
              )
              : null}

            {reason !== null
              ? (
                // UN REFUS EST UN ÉTAT: il sort en rouge, sous le geste qui
                // l'a déclenché.
                <p className="text-sm text-red-700">{inviteErrorText(reason)}</p>
              )
              : null}
          </div>
        )
        : null}
    </div>
  );
}

/**
 * ⚠️ EXPORTÉ POUR ÊTRE PROUVÉ, pas pour être réutilisé ailleurs. `HouseholdPage`
 * entier ne se monte pas sous `renderToStaticMarkup` (session, routeur, quatre
 * lectures), et ce qui doit être mesuré ici est le CADRE: sa garde de
 * chargement, son récapitulatif replié, et le fait qu'il démonte son contenu.
 * Voir `pages/memberSheetFrames.int.test.ts`.
 */
export function SheetFrame(
  { title, hint, open, onToggle, loaded, summary, children }: {
    title: string;
    hint?: string;
    open: boolean;
    onToggle: () => void;
    /** Faux = la lecture n'a pas eu lieu. REQUIS — voir ③. */
    loaded: boolean;
    /** Ce que le cadre cache, dit quand il est replié. */
    summary?: string;
    children: React.ReactNode;
  },
) {
  return (
    <section className="rounded-card border border-line bg-paper p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
        onClick={onToggle}
      >
        <SectionLabel>{title}</SectionLabel>
        {/* LE CHEVRON EST UN CARACTÈRE, PAS UNE IMAGE: il tourne avec l'état,
            et `aria-expanded` au-dessus porte le fait pour qui ne le voit pas.
            `aria-hidden`, parce qu'il répète ce que l'état dit déjà. */}
        <span aria-hidden className="text-ink-soft">{open ? "▾" : "▸"}</span>
      </button>
      {hint !== undefined && open
        ? <p className="mt-1 text-xs leading-5 text-ink-soft">{hint}</p>
        : null}
      {open
        ? (
          !loaded
            // ⛔ AUCUN CHAMP TANT QUE LA LECTURE N'EST PAS REVENUE. Voir ③.
            ? (
              <p className="mt-2 text-sm text-ink-soft">
                {t("household.mouth.frame_loading")}
              </p>
            )
            : <div className="mt-3 flex flex-col gap-3">{children}</div>
        )
        : summary !== undefined
        ? <p className="mt-1 text-xs leading-5 text-ink-soft">{summary}</p>
        : null}
    </section>
  );
}

function MemberRow(
  { member, isMe, viewerIsOwner, allergies, restrictions, dislikes, busy, muted, rhythm, awayWindow, body, bodiesLoaded, habits, habitsLoaded, invitations, onInvited, practicalConstraints, hasGoal, onSavedOwnConstraints, workLunch, workLunchError, onSaveWorkLunch, onSaveHabits, onSaveDiet, onSaveBody, onMute, onSaveAway, onSave, onRemove, onDetach, onAddAllergy, onRemoveAllergy, onAddRestriction, onRemoveRestriction, todayLocalIso }: {
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
    /** A6 — les réponses du foyer, `null` = pas lu. La carte filtre les majeurs. */
    workLunch: Map<string, WorkLunch | null> | null;
    workLunchError: string | null;
    onSaveWorkLunch: (answer: WorkLunch) => Promise<{ ok: boolean; reason: string | null }>;
    allergies: AllergyView[];
    restrictions: RestrictionView[];
    /** Ses `food.exclude` — voir `MembersCard`: ce n'est PAS `restrictions`. */
    dislikes: string[];
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
    /**
     * A5 point 7 — `student_goals.practical_constraints` DE LA SESSION.
     * `null` = pas lu, et les deux cartes du compte ne se montent pas:
     * `mergePracticalConstraints` FUSIONNE sur ce qu'on lui donne, donc un
     * objet vide non lu effacerait le rythme et les goûts déjà déclarés.
     */
    practicalConstraints: PracticalConstraints | null;
    /** `false` tant qu'aucune ligne `student_goals` n'existe: rien à écrire. */
    hasGoal: boolean;
    /** Relit la colonne du compte après une écriture des deux cartes. REQUIS. */
    onSavedOwnConstraints: () => void | Promise<void>;
    onSaveHabits: (slots: HabitSlotWrite[], note: string | null) => Promise<boolean>;
    /** Le régime de CETTE bouche. `null` efface. */
    onSaveDiet: (diet: string | null) => Promise<boolean>;
    onSaveBody: (
      h: number,
      w: number,
      g: MemberGender,
      extras: MouthActivityAndStructure,
    ) => Promise<boolean>;
    /** D17 — `null` = le réglage n'a pas pu être lu. Voir l'interrupteur. */
    muted: boolean | null;
    rhythm: EatingOccasionSlot[];
    awayWindow: { tokens: string[]; dates: string[] };
    onMute: (muted: boolean) => void;
    onSaveAway: (away: AwayDay[]) => Promise<boolean>;
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
  const [open, setOpen] = React.useState(false);
  /**
   * LES DEUX CADRES DE LA FICHE — A5 (D5.1), 2026-09-03.
   *
   * ⚠️ OUVERTS PAR DÉFAUT, ET C'EST LA MOITIÉ DU RENVERSEMENT. Le repli avait
   * été retiré le 2026-08-19 parce qu'« une réponse repliée est une réponse
   * invisible » — vrai, et c'est exactement pourquoi ils s'ouvrent sur la ligne
   * qu'on vient d'ouvrir. Ce que le repli rend, c'est de pouvoir REFERMER ce
   * qu'on vient de lire sur une fiche de trente champs; ce qu'il coûtait est
   * payé par le récapitulatif, qui reste visible replié.
   *
   * ⚠️ ILS VIVENT DANS LA LIGNE, PAS DANS LA PAGE. Le panneau se démonte à la
   * fermeture (`open ? … : null`): rouvrir une ligne la rouvre donc sur ses
   * deux cadres, jamais sur l'état laissé par la ligne d'à côté.
   */
  const [identityOpen, setIdentityOpen] = React.useState(true);
  const [prefsOpen, setPrefsOpen] = React.useState(true);
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
  const [awayOpen, setAwayOpen] = React.useState(false);
  // L'ÂGE DES TROIS CHAMPS: la date tapée gagne sur ce que le roster a compris.
  // C'est ce qui fait qu'une date de mineur tapée sur une bouche à `fat_loss`
  // plie la direction À L'ÉCRAN, avant le Save — et que le Save passe.
  const rowAge = ageStateOfTypedDate(draft.birthDate, member.ageState, todayLocalIso);

  /**
   * CE QUI EST DÉJÀ RENSEIGNÉ DERRIÈRE LE CADRE REPLIÉ — A5 (D5.1).
   *
   * ⚠️ C'EST LA CONTREPARTIE DU REPLI, PAS UNE DÉCORATION. Le repli avait été
   * retiré le 2026-08-19 sur le motif exact « une réponse repliée est une
   * réponse invisible »; sans ce résumé, refermer « Préférences alimentaires »
   * cacherait un régime déjà choisi et une allergie déjà cochée sur un écran
   * dont le seul travail est de dire ce qu'on sait de quelqu'un.
   *
   * ⚠️ ON PASSE PAR `filledPreferenceBlocks`, LE MÊME COMPTEUR QUE LA FICHE,
   * et pas par un compte maison: c'est lui qui porte les deux cicatrices
   * (« une bulle éteinte compte si son moment a été RÉPONDU »,
   * « `allergiesNone` est une réponse »). Deux comptes divergeraient sur ces
   * deux-là, et c'est l'écran le moins relu qui aurait tort.
   *
   * ⛔ IL PEUT SOUS-CLAMER, JAMAIS SUR-CLAMER, et les deux manques sont NOMMÉS:
   * `shaker` et `allergiesNone` n'ont AUCUN contrôle dans cette fiche-ci (elle
   * n'a jamais posé ni l'un ni l'autre), donc ils partent à `null`/`false`. Si
   * l'un des deux gagne un contrôle ici, il doit entrer dans ce brouillon le
   * même jour — sinon le résumé dira « rien » sur une réponse donnée.
   */
  const filledBlocks = React.useMemo(
    () =>
      filledPreferenceBlocks({
        ...emptyMouthDraft(),
        habits: Object.fromEntries(
          (habits?.slots ?? []).map((h) => [h.slot, h.usual]),
        ),
        extras: habits?.extras ?? {},
        shaker: null,
        allergies: allergies.map((a) => a.label),
        allergiesNone: false,
        // ⛔ `dislikes`, JAMAIS `restrictions.map(r => r.label)`. Le brouillon
        // se semait avec les RÈGLES DE MAISON: rouvrir la fiche et enregistrer
        // recopiait chaque interdit parental en préférence de la bouche — une
        // migration de données faite par accident, sur un sens qu'aucun libellé
        // ne porte (le sort des lignes existantes est une décision humaine).
        dislikes,
        diet: (member.diet ?? "") as MouthFormDraft["diet"],
      }),
    [habits, allergies, dislikes, member.diet],
  );

  /** Combien de moments sont marqués DANS la fenêtre — pour le bouton. */
  const awayInWindow = React.useMemo(() => {
    const inWindow = new Set(awayWindow.tokens);
    const slots = rhythm.length;
    return member.awayHousehold
      .filter((a) => inWindow.has(a.day))
      .reduce((n, a) => n + (a.slots.length === 0 ? slots : a.slots.length), 0);
  }, [member.awayHousehold, awayWindow.tokens, rhythm.length]);

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

  /** Ce que la personne a dit d'elle-même, dans la fenêtre. LECTURE SEULE. */
  const selfInWindow = React.useMemo(() => {
    const inWindow = new Set(awayWindow.tokens);
    return member.awaySelf.filter((a) => inWindow.has(a.day));
  }, [member.awaySelf, awayWindow.tokens]);

  return (
    <li className="py-3">
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
          <Badge key={a.id} tone="critical">{a.label}</Badge>
        ))}
        {restrictions.map((r) => (
          <Badge key={r.id} tone="neutral">{r.label}</Badge>
        ))}
        {/* OUVRIR LA FICHE EST L'ACTION DE LA LIGNE, donc elle porte la teinte
            de marque (charte §2: la figue marque la navigation et l'action).
            Elle reste un texte souligné et non un bouton plein: huit lignes,
            huit boutons pleins, ce serait huit actions principales. */}
        <button
          className="ml-auto text-fig-700 underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t("household.member.close") : t("household.member.edit")}
        </button>
      </div>

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

      {open ? (
        // `bg-paper-2` ET PAS `bg-paper`: c'est un panneau EN CREUX dans une
        // carte, et `paper` est le fond de cette carte — la fiche ouverte
        // aurait disparu. `paper-2` est le jeton du « fond de section
        // alterné », et son couple avec `ink` reste à 15,02:1.
        <div className="mt-3 flex flex-col gap-3 rounded-card bg-paper-2 p-3">
          {/* ══════════════════════════════════════════════════════════════
              DEUX CADRES NOMMÉS, ET LE REPLI EST RENVERSÉ — A5 (D5.1), 2026-09-03
              ══════════════════════════════════════════════════════════════

              La fiche d'une bouche était UN accordéon à un niveau: dix contrôles
              à la suite, du prénom aux règles de maison, sans qu'aucun titre ne
              dise où l'un finit. Elle porte maintenant deux cadres NOMMÉS —
              « Informations personnelles » (ce qui dimensionne l'assiette) et
              « Préférences alimentaires » (ce qui l'affine) —, le même partage
              que la fiche d'ajout tient déjà entre ses blocs en ligne et sa
              fenêtre.

              ⛔ CE QUI RESTE DEHORS, ET CE N'EST PAS UN OUBLI. « Quand cette
              bouche n'est pas là » est une DATE, pas un trait de la personne:
              elle change chaque semaine et se relit chaque semaine. Retirer
              l'accès, retirer du foyer et le réglage de fusion sont des gestes
              SUR LA LIGNE, pas des réponses: les ranger dans un cadre de
              questions ferait d'un geste irréversible une case de formulaire.

              ⚠️ LE RENVERSEMENT EST ÉCRIT LÀ OÙ VIT LA PHRASE INVERSE —
              `MouthFormDialog.tsx` (« il faut arrêter avec le dépliable »,
              2026-08-19). Ici on ne fait que l'appliquer. */}
          <SheetFrame
            title={t("household.member.frame_identity")}
            hint={t("household.member.frame_identity_hint")}
            open={identityOpen}
            onToggle={() => setIdentityOpen((v) => !v)}
            // ⛔ LA GARDE DE CHARGEMENT DU CADRE. `BodyFields` fige ses trois
            // champs AU MONTAGE; monté sur une lecture non faite, il affiche du
            // vide non lu — et « Enregistrer » l'écrirait par-dessus un corps
            // renseigné. `bodies === null` ⇒ ce cadre ne rend AUCUN champ.
            // Cicatrice `mount-snapshot-forms-need-a-loading-gate`.
            loaded={bodiesLoaded}
          >
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

            <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={busy || !draft.firstName.trim()}
              onClick={async () => {
                const ok = await onSave({
                  firstName: draft.firstName,
                  birthDate: draft.birthDate || null,
                  // PLIÉE À L'ÂGE, comme à l'écran: ce qui part est ce qui
                  // est coché — une bouche mineure héritée à `fat_loss` part
                  // en `maintenance`, et `saveMember` l'écrit AVANT la date.
                  goal: goalForAge(draft.goal, rowAge) || null,
                });
                if (ok) setDraft((d) => ({ ...d, birthDate: "" }));
              }}
            >
              {t("household.member.save")}
            </Button>
            </div>
          </SheetFrame>

          <SheetFrame
            title={t("household.member.frame_preferences")}
            hint={t("household.member.frame_preferences_hint")}
            open={prefsOpen}
            onToggle={() => setPrefsOpen((v) => !v)}
            // MÊME GARDE, SUR SA PROPRE LECTURE: les habitudes. `HouseholdHabitsCard`
            // tient déjà la sienne en interne (`loaded`), mais un cadre REPLIÉ
            // annonce un résumé — et un résumé calculé sur une lecture non faite
            // dirait « rien de renseigné » à quelqu'un qui a tout rempli.
            loaded={habitsLoaded}
            // CE QUI EST DÉJÀ RENSEIGNÉ, VISIBLE MÊME REPLIÉ. Voir `filledBlocks`.
            // ⚠️ LES DEUX PHRASES SONT CELLES DE LA FICHE D'AJOUT
            // (`MouthPreferencesButton`), pas des jumelles écrites ici: le même
            // fait — « voilà ce qui est déjà renseigné » — se dit du même mot
            // aux deux endroits, et une seconde paire de clés divergerait au
            // premier ajustement.
            summary={filledBlocks.length === 0
              ? t("household.mouth.preferences_empty")
              : t("household.mouth.preferences_filled", {
                blocks: blockList(
                  filledBlocks.map((b) =>
                    t(`household.mouth.block_${b}` as "household.mouth.block_identity")
                  ),
                ),
              })}
          >
          {/* ── COMMENT CETTE BOUCHE MANGE (2026-08-14) ────────────────────
              LA QUESTION EXISTAIT POUR LE TITULAIRE ET POUR PERSONNE D'AUTRE,
              et l'utilisateur l'a redemandée deux fois. Les trois jetons
              vivaient sur `student_safety_constraints`, clée sur `user_id`:
              une bouche sans compte n'avait nulle part où porter un régime, et
              un enfant végétarien était INDÉCLARABLE.

              ⚠️ AVANT LES HABITUDES, ET L'ORDRE PORTE DU SENS: ceci dit ce
              qu'elle ne mange JAMAIS, la carte du dessous dit ce qu'elle mange
              À LA PLACE du plat commun. Dans l'autre sens, l'habitude se lirait
              comme une exception à une règle pas encore énoncée.

              ⚠️ RIEN N'EST PRÉ-ALLUMÉ, et re-cliquer efface. `null` veut dire
              « on n'a pas demandé »; `omnivore` veut dire « on a demandé, elle
              mange de tout ». Allumer `omnivore` par défaut écrirait à l'écran
              une réponse que personne n'a donnée.

              ⚠️ UNE BOUCHE AVEC COMPTE N'EST PAS ÉDITABLE ICI — la base refuse
              (`has_account`) et le roster ne lirait pas la colonne. L'écran le
              DIT plutôt que de masquer la ligne, exactement comme l'objectif
              depuis D1: « il n'y a rien ici » et « ça se règle ailleurs » ne
              sont pas la même phrase. */}
          {/* ⛔ LE RÉGIME AUSSI (A5 point 6): `set_member_diet` répond
              `not_owner`. Et pour un membre RÉCLAMÉ il répondrait de toute
              façon `has_account` — son régime vit dans son « about you ». Deux
              refus pour un contrôle: il ne se rend pas. */}
          {viewerIsOwner ? (
          <div className="border-t border-line pt-3">
            <Field
              label={t("household.member.diet")}
              hint={t("household.member.diet_hint")}
            >
              {member.userId === null
                ? (
                  <div className="flex flex-wrap gap-2">
                    {DIET_ANSWERS.map((d) => (
                      <Button
                        key={d}
                        size="sm"
                        variant={member.diet === d ? "primary" : "secondary"}
                        disabled={busy}
                        onClick={() => {
                          void onSaveDiet(member.diet === d ? null : d);
                        }}
                      >
                        {/* ⚠️ LES LIBELLÉS SONT DANS LE NAMESPACE DE CETTE
                            PAGE, pas dans `setup.*`. La LISTE est partagée
                            (`DIET_ANSWERS`, importée) — c'est elle qui est
                            load-bearing; les mots, eux, ne traversent pas la
                            couture: `pageSeams.int.test.ts` refuse qu'une page
                            atteigne le namespace d'une autre, et il a raison —
                            la couverture de locale se mesure par namespace. */}
                        {t(
                          `household.member.diet_${d}` as
                            "household.member.diet_omnivore",
                        )}
                      </Button>
                    ))}
                  </div>
                )
                : (
                  <p className="text-xs text-ink-soft">
                    {t("household.member.diet_from_profile")}
                  </p>
                )}
            </Field>
          </div>
          ) : null}

          {/* ── CE QUE CETTE BOUCHE MANGE D'HABITUDE (2026-08-14) ──────────
              L'ENDROIT QUI MANQUAIT. Une bouche sans compte n'avait nulle part
              où dire ce qu'elle mange: `food_preferences` est clé sur
              `user_id`. On savait d'elle prénom, naissance, objectif, absences,
              moments, allergies et corps — et rien sur ce qu'elle mange. Un
              plan réel a donc servi des œufs brouillés sept matins d'affilée à
              une femme qui mange une pomme.

              ⚠️ RIEN N'EST PRÉ-COCHÉ, ET AUCUNE ABSENCE N'EST COMPTÉE. Les deux
              règles vivent dans la carte et dans `habitDraft`; elles sont la
              raison d'être du lot, pas une finition. */}
          <HouseholdHabitsCard
            slots={habitSlots}
            habits={habits}
            loaded={habitsLoaded}
            busy={busy}
            onSave={onSaveHabits}
          />

          {/* ── A6 · LE DÉJEUNER EN SEMAINE (2026-09-03) ──────────────────
              LA QUESTION VIVAIT À L'ÉTAPE 3 DE L'ENTONNOIR, deux écrans avant
              la grille que sa réponse pré-remplit. Elle est ici, JUSTE
              AU-DESSUS de « sa semaine »: la réponse et ce qu'elle coche sur
              le même écran — « pré-remplir n'est pas décider, la grille
              gagne » ne se lit que si la grille est à portée de main.

              AUX MAJEURS DU ROSTER, compte ou pas: `member.ageState` est
              `keel_household_member_age`, l'autorité qui rend `not_adult` à
              l'écriture — jamais un `kind` à deux valeurs. La carte filtre
              elle-même et ne rend rien pour un mineur ou un âge inconnu.

              `workLunch` descend ENTIER, `null` compris: c'est la carte qui
              tient la porte « pas lu » ≠ « lu, rien pour cette bouche ». */}
          <MemberWorkLunchCard
            person={{
              memberId: member.memberId,
              firstName: member.displayName === "—" ? "" : member.displayName,
              ageState: member.ageState,
            }}
            answers={workLunch}
            readError={workLunchError}
            busy={busy}
            onSave={(_memberId, answer) => onSaveWorkLunch(answer)}
          />

          {/* ⛔ LES ALLERGIES ET LES RÈGLES DE MAISON SONT AU MAÎTRE (A5
              point 6). `add_allergy` / `add_restriction` répondent `not_owner`.
              ⚠️ CE QUE LE MEMBRE VOIT QUAND MÊME est ailleurs, et c'est la
              contrepartie du modèle: chaque contrainte reste affichée AVEC QUI
              L'A POSÉE dans sa vue à lui (`restrictionNotice`). Ce qui
              distingue ce modèle du contrôle coercitif, c'est que rien n'est
              secret — pas qu'il puisse tout écrire. */}
          {viewerIsOwner ? (
          <div className="border-t border-line pt-3">
            {/* ── §8.5 RÈGLE 1 · LE CHOIX N'EXISTE QUE SUR UN ENFANT ─────
                Sur une bouche majeure — ou dont personne n'a tapé la date de
                naissance — il n'y a plus DEUX natures à distinguer: il n'y a
                qu'une allergie. Le sélecteur disparaît donc au lieu de proposer
                une option qui serait refusée par la base, et le champ dit
                lui-même ce qu'il écrit. */}
            {canSetHouseRule
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
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                className={`${inputClass} min-w-0 flex-1`}
                value={label}
                maxLength={120}
                placeholder={effectiveKind === "allergy"
                  ? t("household.allergy.placeholder")
                  : t("household.restriction.placeholder")}
                onChange={(e) => setLabel(e.target.value)}
              />
              <Button
                disabled={busy || !label.trim()}
                onClick={() => {
                  const value = label.trim();
                  setLabel("");
                  // ⛔ `effectiveKind`, JAMAIS `kind`. L'état survit au
                  // changement de bouche dans la liste: quelqu'un qui choisit
                  // « règle de maison » sur son enfant puis ouvre la fiche d'un
                  // adulte enverrait cette valeur sur la mauvaise porte, et
                  // lirait un `not_a_minor` sur un formulaire qui ne montre
                  // plus le choix.
                  if (effectiveKind === "allergy") onAddAllergy(value);
                  else onAddRestriction(value);
                }}
              >
                {effectiveKind === "allergy"
                  ? t("household.allergy.add")
                  : t("household.restriction.add")}
              </Button>
            </div>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {allergies.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-red-700">{a.label}</span>
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
          </SheetFrame>

          {/* ══════════════════════════════════════════════════════════════
              CE QUE LE COMPTE A DÉJÀ DIT — A5 point 7, 2026-09-03
              ══════════════════════════════════════════════════════════════

              DEUX CARTES QUI VIVAIENT DANS LA FENÊTRE DE RÉGLAGES DE
              `/app/plan`, et qui parlent de la MÊME personne que cette fiche:
              son rythme (quand elle mange, et quelle taille de part) et ce que
              la conversation a retenu de ses goûts.

              ⛔ SUR SA PROPRE LIGNE, ET SEULEMENT LÀ. Les deux écrivent
              `student_goals.practical_constraints` DE LA SESSION
              (`auth.user.id`, lu dans la carte elle-même, pas passé en prop):
              montées sur la ligne de quelqu'un d'autre, elles afficheraient les
              réponses du lecteur sous le prénom d'un tiers, et le premier
              enregistrement écrirait la colonne du lecteur en croyant écrire
              celle de l'autre. `isMe` n'est donc pas un confort d'affichage,
              c'est la seule chose qui fasse coïncider la ligne et la colonne.

              ⚠️ ET ELLES ATTENDENT LA LECTURE, comme le reste du cadre:
              `practicalConstraints === null` ⇒ elles ne se montent pas.
              `mergePracticalConstraints` FUSIONNE sur ce qu'on lui donne —
              nourri d'un objet vide non lu, il effacerait le rythme et les
              goûts déjà déclarés, en silence, au premier Enregistrer.

              ⚠️ `CookingCapacityCard` NE VIENT PAS, exprès: elle reste sur
              `/app/plan` (la lane CUISINE la remplace, mandat point 7). */}
          {isMe && practicalConstraints !== null ? (
            <>
              <div className="border-t border-line pt-3">
                <SectionLabel>{t("plan.section.day.title")}</SectionLabel>
                <EatingRhythmCard
                  embedded
                  hasGoal={hasGoal}
                  practicalConstraints={practicalConstraints}
                  rhythm={rhythm}
                  onSaved={onSavedOwnConstraints}
                />
              </div>
              <div className="border-t border-line pt-3">
                <SectionLabel>{t("plan.section.told.title")}</SectionLabel>
                <FoodPreferencesCard
                  embedded
                  hasGoal={hasGoal}
                  practicalConstraints={practicalConstraints}
                  onSaved={onSavedOwnConstraints}
                  // ⟳ 2026-09-06 (arbitrage 2): « Garder » écrit une ligne retenue au
                  // sujet de CETTE bouche — la sienne, puisque `isMe`.
                  keepAs={{
                    subject: memberSubject(member.memberId) ?? HOUSEHOLD_SUBJECT,
                    todayLocalIso,
                  }}
                />
              </div>
            </>
          ) : null}

          {/* ── D14 · QUAND CETTE BOUCHE N'EST PAS LÀ ──────────────────────
              LA GRILLE EST CELLE DU CONSTRUCTEUR, pas une seconde. Deux
              grilles pour la même question divergeraient sur le seul détail
              qui compte — ce que « tout décoché » veut dire — et c'est celle
              qu'on regarde le moins qui garderait l'ancienne règle.

              CE QU'ELLE MONTRE ET ÉCRIT EST LA MARQUE DU MAÎTRE, JAMAIS
              L'UNION. La grille réécrit ce qu'on lui donne: nourrie de
              l'union, elle recopierait la déclaration de la personne dans la
              colonne du foyer, où elle survivrait à sa rétractation. */}
          <div className="border-t border-line pt-3">
            <SectionLabel>{t("household.away.title")}</SectionLabel>
            <p className="mb-2 text-xs text-ink-soft">
              {t("household.away.hint")}
            </p>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setAwayOpen(true)}
            >
              {awayInWindow === 0
                ? t("household.away.open")
                : t("household.away.open_count", { n: String(awayInWindow) })}
            </Button>
            {/* CE QUE LA PERSONNE A DIT ELLE-MÊME, en lecture seule. Sans cette
                ligne, le maître verrait sa propre marque et pas le FAIT: il
                remarquerait une assiette manquante sans pouvoir dire d'où elle
                vient — et re-marquerait par-dessus. */}
            {selfInWindow.length > 0 ? (
              <p className="mt-2 text-xs text-ink-soft">
                {t("household.away.self_declared", {
                  days: selfInWindow.map((a) => a.day).join(", "),
                })}
              </p>
            ) : null}
          </div>

          {/* MONTÉE MÊME FERMÉE — `Modal` rend `null` sans démonter — donc une
              grille modifiée survit à une fermeture accidentelle. */}
          <MealPickerGrid
            open={awayOpen}
            onClose={() => setAwayOpen(false)}
            days={awayWindow.tokens}
            dates={awayWindow.dates}
            rhythm={rhythm}
            away={member.awayHousehold}
            busy={busy}
            onSave={async (next) => {
              const ok = await onSaveAway(next);
              if (ok) setAwayOpen(false);
            }}
          />

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
              <Button variant="danger" disabled={busy} onClick={onRemove}>
                {t("household.member.remove")}
              </Button>
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
      ) : null}
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

/**
 * Le motif de refus d'invitation, traduit — liste FERMÉE.
 *
 * Un motif inconnu rend `null` plutôt qu'une clé brute: afficher
 * `household.invite.error.something` à quelqu'un est pire que ne rien
 * afficher, et le silence force à ajouter l'étiquette au lieu de la tolérer.
 */
function inviteErrorText(reason: string): string | null {
  switch (reason) {
    case "rate_limited":
      return t("household.invite.error.rate_limited");
    case "bad_email":
      return t("household.invite.error.bad_email");
    case "not_owner":
      return t("household.invite.error.not_owner");
    // LOT 6 — les deux refus que la CIBLE peut produire. Ils sont rares à
    // l'écran (le sélecteur ne propose que des bouches libres du foyer) et ils
    // arrivent quand même: deux onglets ouverts, ou une bouche réclamée entre
    // le chargement et le clic. Sans étiquette, l'écran afficherait le jeton
    // brut `already_claimed` à quelqu'un.
    case "already_claimed":
      return t("household.invite.error.already_claimed");
    case "not_a_member":
      return t("household.error.not_a_member");
    default:
      return null;
  }
}

/**
 * « TON FOYER EST EN PAUSE » (chantier 3, D4).
 *
 * ── CE QUE CETTE CARTE DOIT DIRE, ET DANS CET ORDRE ───────────────────────
 *   1. RIEN N'EST PERDU. C'est la première phrase parce que c'est la première
 *      peur, et parce que c'est vrai: D4 gèle et n'efface jamais. Les huit
 *      bouches, leurs âges, leurs allergies et leurs objectifs sont là.
 *   2. CE QUI S'ARRÊTE, nommément: on ne compose plus de nouvelle semaine.
 *      Une pause qu'on ne délimite pas se lit comme une panne totale.
 *   3. LE GESTE POUR REPRENDRE. Un écran qui annonce une coupure sans issue
 *      fait ouvrir un ticket au lieu d'un paiement.
 *
 * ── ET CE QU'ELLE NE DIT PAS ──────────────────────────────────────────────
 * Ni la date d'expiration, ni le montant, ni un décompte. La date est
 * derrière le tunnel de Stripe, qui est la source, et l'afficher ici en
 * ferait une seconde — celle qui se trompe le jour où quelqu'un prolonge un
 * essai à la main.
 *
 * ── LE MEMBRE N'EST PAS LE MAÎTRE ─────────────────────────────────────────
 * Un profil réclamé ne peut PAS reprendre l'abonnement: la carte Stripe est
 * celle du maître (`not_household_owner`, 403). Lui montrer un bouton qui sera
 * refusé serait exactement le défaut que ce chantier retire ailleurs — on lui
 * dit l'état, et à qui s'adresser.
 */
function PausedCard({ isOwner }: { isOwner: boolean }) {
  const [working, setWorking] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  return (
    // ── L'AMBRE EST L'ÉTAT, PAS LA DÉCORATION DE LA CARTE ────────────────────
    // « En pause » EST un état, et il reste: il est porté par la SURFACE de la
    // carte (`tone="warning"` = `border-amber-200 bg-amber-50`, le bandeau
    // d'état de l'arbitrage §5.2). Ce qui part, c'est l'ambre répandu sur
    // chacune des quatre phrases et sur le bouton — sept classes saturées qui ne
    // portaient aucun fait de plus que la surface sous elles, et qui rendaient
    // le seul vrai message d'échec de la carte indiscernable du reste.
    // Le texte passe à `ink` (16,46:1 sur `amber-50`, mesuré au calcul WCAG),
    // et l'échec de paiement au rouge — c'est un état, et c'est le même rouge
    // que l'échec de composition dix lignes plus bas.
    <Card tone="warning">
      <SectionLabel>{t("household.paused.title")}</SectionLabel>
      <p className="text-sm text-ink">{t("household.paused.body")}</p>
      <p className="mt-2 text-sm text-ink">{t("household.paused.kept")}</p>
      {isOwner
        ? (
          <>
            {/* ⚠️ PAS DE VARIANTE MAISON ICI. Ce bouton se reteignait à la main
                (`border-amber-300 text-amber-900 hover:bg-amber-100`) — une
                sixième variante de bouton, née de l'idée qu'un bouton posé sur
                de l'ambre doit être ambre. Le `secondary` du kit
                (`border-line-strong bg-paper text-ink`) se détache MIEUX sur
                cette surface, et c'est le même bouton que partout ailleurs. */}
            <Button
              className="mt-3"
              disabled={working}
              onClick={async () => {
                setWorking(true);
                setFailure(null);
                try {
                  window.location.assign(await openHouseholdCheckout());
                } catch (e) {
                  // LE MOTIF TEL QUEL. Tant qu'un humain n'a pas créé les prix
                  // Stripe, la fonction edge refuse BRUYAMMENT — et « une
                  // erreur est survenue » ne dirait pas que le produit n'est
                  // pas encore en vente.
                  setFailure(e instanceof Error ? e.message : String(e));
                  setWorking(false);
                }
              }}
            >
              {working
                ? t("household.paused.working")
                : t("household.paused.resume_cta")}
            </Button>
            {failure
              ? <p className="mt-2 text-sm text-red-700">{failure}</p>
              : null}
          </>
        )
        : (
          <p className="mt-2 text-sm text-ink">
            {t("household.paused.owner_only")}
          </p>
        )}
    </Card>
  );
}


