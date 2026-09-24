// ⟳ 2026-09-24 — SORTI DE `HouseholdPage.tsx` (découpage, lot 4c), À L'IDENTIQUE.
// La ligne d'une bouche et ses deux fenêtres, avec `memberTargetDraft`.
// Le fichier d'origine l'atteint par ses imports; il ré-exporte ce qu'il exportait.

import React from "react";
import { type AllergyView, type HouseholdMemberView, goalForAge, type MemberBodyView, type MemberGender, type MemberGoal, type RestrictionView, type LiveInvitation } from "../../api/household";
import { EATING_OCCASIONS, type EatingOccasion, type EatingOccasionSlot } from "../../api/mealGeneration";
import type { HabitSlotWrite, MemberHabitsView } from "../../api/householdHabits";
import type { MemberTargetView } from "../../api/mouthProfile";
import { ageStateOfTypedDate, emptyMouthDraft, targetPayloadOf, targetWriteIsBlind, type MouthFormDraft } from "../../lib/mouthForm";
import { habitEntriesToWrite, type SideCoursesDraft } from "../../lib/mealExtras";
// ⚠️ LE LIBELLÉ D'UN ALLERGÈNE, PAS SON SLUG. Le catalogue écrit `peanut`; la
// liste de la fiche affichait le jeton nu sous une case cochée « Arachide ».
import { allergenLabel } from "../../copy/allergens";
import { useEatingStructure } from "../../lib/useEatingStructure";
import {
  type MouthActivityAndStructure,
  MouthPreferencesFields,
  // ⟳ 2026-09-22 (LOT A2) — LE POIDS VISÉ ET LE CURSEUR, SUR LA FICHE D'UNE
  // BOUCHE DÉJÀ INSCRITE. ⛔ IMPORTÉ, JAMAIS RECOPIÉ: une seconde lecture de
  // `paceControlFor` ferait deux écrans qui divergent au premier correctif —
  // c'est le motif écrit sur le composant lui-même, et le dépôt l'a déjà payé
  // sur les listes d'objectifs.
  TargetAndPaceFields,
} from "../../components/MouthFormDialog";
import Modal from "../../components/ui/Modal";
import HouseholdHabitsCard from "../../components/HouseholdHabitsCard";
// ⟳ 2026-09-23 — LES À-CÔTÉS SUR LA LIGNE D'UN MEMBRE, à côté de sa carte
// d'habitudes: c'est la seule porte que la base lui ouvre ici. La fiche
// partagée (`MouthPreferencesFields`) monte le même champ pour le maître.
import SideCoursesField from "../../components/SideCoursesField";
import { t } from "../../i18n/t";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { SectionLabel } from "../../components/ui/Card";
import { Field, inputClass } from "../../components/ui/Field";
import { goalLabel } from "./labels.ts";
import { type MouthDraft, MouthFields } from "./MouthFields.tsx";
import { BodyFields } from "./BodyFields.tsx";
import { MemberAccess } from "./MemberAccess.tsx";

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

export function MemberRow(
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
