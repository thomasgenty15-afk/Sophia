import React from "react";

import Modal from "./ui/Modal";
import { Button } from "./ui/Button";
import { Field, inputClass } from "./ui/Field";
import { SectionLabel } from "./ui/Card";
import { allergenLabel, ALLERGEN_OPTIONS } from "../copy/allergens";
import { type MessageKey, t } from "../i18n/t";
import { uiLocale } from "../i18n/runtime";
import { MEMBER_GENDERS } from "../api/household";
import GoalTiles from "./GoalTiles";
import ActivityAxesTiles from "./ActivityAxesTiles";
import type { MemberGender, MemberGoal } from "../api/household";
import { DIET_ANSWERS } from "../api/onboarding";
import {
  EATING_OCCASIONS,
  type EatingOccasion,
  type EatingOccasionSlot,
} from "../api/mealGeneration";
import { mealCopy } from "../api/mealLabels";
import { type MouthVoice, voiced, whoOf } from "../lib/mouthVoice";
import { arrivalHorizonCopy } from "../lib/arrivalHorizon";
import { scaleDirectionOf } from "../../../../supabase/functions/_shared/keel/weight_pace.ts";
import {
  ageStateOfDraft,
  blockList,
  filledPreferenceBlocks,
  type MouthFormDraft,
  missingRequiredBlocks,
  paceControlFor,
  type ShakerDraft,
  shakerCanBeSaved,
  shakerIsComplete,
  shakerIsForeground,
  submitIsHeld,
  targetWeightStateFor,
  foldMinorGoal,
} from "../lib/mouthForm";
import type { EatingStructure } from "../api/eatingStructure";
import { rhythmPrefillFor, rhythmPrefillLatches } from "../lib/rhythmPrefill";
import { slotBearsLight, toggleLight } from "../lib/mealExtras";
import { APPETITE_LEVELS } from "../../../../supabase/functions/_shared/keel/tokens.ts";
import type {
  AppetiteLevel,
  DayActivityLevel,
  SportFrequency,
} from "../../../../supabase/functions/_shared/keel/tokens.ts";
import { PACE_WARNING_LABELS } from "../../../../supabase/functions/_shared/keel/weight_pace.ts";

// ═══════════════════════════════════════════════════════════════════════════
// UNE BOUCHE — SIX BLOCS, ET DEUX SURFACES DEPUIS LE 2026-08-18.
//
// Conception: `scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md` §1.
// La DÉCISION vit dans `lib/mouthForm.ts`; ce fichier REND.
//
// ── ⚠️ LA RÈGLE DE RÉPARTITION, DANS LES MOTS DE LA DÉCISION ─────────────
// « Le poids visé et le rythme d'évolution, il faut pas que ce soit dans la
//   pop-up […]. Et le reste (allergies, etc.) dans une pop-up accessible depuis
//   "Renseigner ses préférences alimentaires". »
//
// Ce qui STRUCTURE le plan reste dans le flux, en ligne, sans clic; ce qui
// l'AFFINE passe derrière un bouton:
//
//   `MouthCoreFields`        blocs 1-3 — qui c'est · la direction (avec le
//                            poids visé ET le curseur de rythme) · le corps et
//                            le cran d'activité. C'est lui qui porte le bouton
//                            d'enregistrement, parce que c'est lui qui porte
//                            les trois blocs obligatoires.
//   `MouthPreferencesFields` blocs 4-6 — ce qu'elle mange déjà (avec le
//                            shaker) · les allergies · ses dégoûts et son
//                            régime. Rendus dans `MouthFormDialog`.
//
// ⚠️ UN SEUL BROUILLON POUR LES DEUX, ET UN SEUL ÉCRIVAIN. La fenêtre n'a pas
// de bouton qui enregistre: elle édite le même `MouthFormDraft` que la fiche en
// ligne, et c'est le Save de la fiche qui écrit. Deux boutons d'enregistrement
// sur un même brouillon, c'est la garantie qu'un jour l'un des deux cessera
// d'écrire ce que l'autre écrit — le dépôt l'a déjà mesuré sur `MeCard`.
// La contrepartie est nommée à l'écran: ce qui a été renseigné derrière le
// bouton est RÉCAPITULÉ sous lui (`filledPreferenceBlocks`), sinon fermer la
// fenêtre se lirait comme perdre ce qu'on vient de taper.
//
// ── IL S'OUVRE POUR TOUT LE MONDE, MAÎTRE COMPRIS ────────────────────────
// « sans quoi celui qui tient la maison serait le seul dont on ne sait rien ».
// D'où `subject`: la même fenêtre sert la première bouche et la cinquième, et
// les deux seuls écarts sont nommés dans le type — un compte porte son shaker,
// une bouche sans compte porte son régime.
//
// ── ⚠️ ELLE SE FERME TOUJOURS ────────────────────────────────────────────
// « un pop-up qu'on ne peut pas fermer fait abandonner l'ajout de la deuxième
// personne, et le foyer meurt là ». Échap, la croix et le bouton de sortie
// referment sans condition; ce que les trois blocs obligatoires retiennent est
// le bouton qui INSCRIT. Ne pas transformer « obligatoire » en fenêtre captive:
// c'est la lecture littérale, et elle coûte le foyer.
//
// ── ⛔ ON NE DEMANDE JAMAIS « ADULTE OU ENFANT » ─────────────────────────
// La date de naissance le dit. Ce fichier n'a aucun champ `kind`, et le seul
// endroit où l'âge entre est `ageStateOfDraft`. Poser la question en plus
// ouvrirait deux réponses qui se contredisent.
//
// ── ⚠️ ET UN MINEUR PORTE LES SIX BLOCS — MAIS UNE SEULE DIRECTION ───────
// Les six blocs sont rendus pour lui comme pour les autres (renversement du
// 2026-08-18, toujours vrai: aucun bloc n'est masqué). Ce qui a changé le
// 2026-09-03 (chantier P3, décision D3.2) est le CONTENU du bloc 3:
// `goalsForAge("minor")` ne rend que `maintenance`, libellée « Manger
// normalement » — parce que depuis le 2026-08-22 (`20260822041500`, lot S4)
// les quatre portes d'écriture refusent `fat_loss` et `muscle_gain` sur un
// mineur, et qu'un écran qui propose ce que la base refuse rend un jeton brut.
// Une direction héritée est PLIÉE à `maintenance` par `foldMinorGoal` — au
// rendu ET à l'écriture — et la fiche le DIT (`household.goal.minor_switched`).
// Ce qui le protège en plus n'est pas à l'écran: l'énergie d'un mineur reste
// une maintenance calculée sur son âge, et son corps n'est jamais ÉNONCÉ.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * QUI EST DEVANT LE FORMULAIRE — trois faits, et pas un de plus.
 *
 * `hasAccount` décide de DEUX blocs, et dans des sens opposés:
 *   · le shaker n'existe QUE pour un compte (`fixed_intakes` est clé sur
 *     `user_id`, et la lane foyer n'en lit aucun — voir `api/mouthProfile.ts`);
 *   · le régime n'existe QUE pour une bouche sans compte (la base refuse
 *     `has_account` sur `keel_household_set_member_diet`: le régime de
 *     quelqu'un qui a un compte vit dans SON « about you »).
 *
 * Afficher l'un ou l'autre au mauvais endroit montrerait un contrôle qui échoue
 * à tous les coups — « pire qu'un contrôle absent, parce qu'il promet ».
 */
export interface MouthSubject {
  /** `false` pour une bouche qu'on ajoute; `true` quand on complète une fiche. */
  existing: boolean;
  hasAccount: boolean;
  /**
   * EST-CE MA PROPRE FICHE ? REQUIS — jamais optionnel.
   *
   * ⚠️ C'EST CE QUI DÉCIDE DE LA VOIX, et un défaut le désarmerait en silence:
   * non passé, le titulaire relirait « Son corps » et « Comment elle mange »
   * sur SA carte, ce qui est exactement le défaut signalé le 2026-08-19. Voir
   * `lib/mouthVoice.ts` — et pourquoi la troisième personne NOMME plutôt
   * qu'elle ne genre.
   */
  isSelf: boolean;
}

/** Les blocs 1-3, EN LIGNE — c'est la fiche, pas la fenêtre. */
export interface MouthCoreFieldsProps {
  draft: MouthFormDraft;
  onChange: React.Dispatch<React.SetStateAction<MouthFormDraft>>;
  subject: MouthSubject;
  /**
   * `YYYY-MM-DD` LOCAL, REQUIS — jamais une horloge lue ici.
   *
   * L'âge décide du plafond du curseur et du plancher de la cible. Le lire du
   * navigateur au milieu d'un rendu rendrait ce composant intestable sur la
   * valeur, et un `new Date()` au rendu change de réponse à minuit pendant
   * qu'on remplit le formulaire.
   */
  todayLocalIso: string;
  busy: boolean;
  /** Le refus du dernier enregistrement, ou `null`. REQUIS. */
  failure: string | null;
  /**
   * LE GESTE QUI OUVRE LES PRÉFÉRENCES. REQUIS — jamais optionnel: un bouton
   * dont le geste est facultatif est un bouton qui peut ne rien faire, et
   * « un geste qui ne fait rien est indiscernable d'un geste qui a marché ».
   */
  onOpenPreferences: () => void;
  onSubmit: () => void;
}

/** Les blocs 4-6, DANS LA FENÊTRE — ils affinent, ils ne structurent pas. */
/**
 * OÙ VA LE SHAKER DE CE SUJET — trois états, et pas un booléen.
 *
 * ── ⛔ CE QUI ÉTAIT FAUX AVANT (2026-09-01) ────────────────────────────────
 * Cette prop était `onSaveShaker: fn | null`, et `null` confondait DEUX choses
 * très différentes:
 *   · « ce sujet n'a nulle part où porter un apport fixe »;
 *   · « il a un endroit, mais ce n'est pas CE bouton-ci qui l'écrira ».
 * Le bloc entier était retiré dans les deux cas — donc le shaker d'une bouche
 * qu'on AJOUTE n'était pas seulement non-enregistrable: il était INCOLLECTABLE.
 * Signalé à l'écran: « dans les préférences alimentaires des personnes
 * ajoutées, il n'y a pas le shaker ».
 *
 * ⚠️ ET LE STOCK EXISTE DEPUIS LE 2026-08-19. `household_members.fixed_intakes`
 * (migration `20260819170000`), la porte `keel_household_set_member_fixed_
 * intakes`, l'écrivain `addShakerToMemberIntakes` et le LECTEUR du moteur
 * (`household_fixed_intakes.ts`, branche `!mouth.userId`) ont tous été livrés
 * ce jour-là. Seul l'écran n'a jamais rien appelé: une boucle construite aux
 * trois quarts, dont le quart manquant est le seul visible.
 *
 * ── LES TROIS ÉTATS ───────────────────────────────────────────────────────
 * · `now` — il y a une ligne, et ce bouton-ci l'écrit tout de suite. C'est la
 *   demande d'origine (« je veux un bouton enregistrer pour le shaker »): un
 *   objet qu'on ajoute doit pouvoir se poser sans emporter le formulaire.
 * · `with_the_card` — la ligne n'existe pas encore (fiche d'ajout), ou son
 *   écrivain est le bouton de la CARTE. On collecte, la carte écrit. Le bloc
 *   se rend SANS son bouton, et il dit où part la déclaration.
 * · `none` — il n'y a aucun stock que le moteur relira pour ce sujet. Le bloc
 *   ne se rend pas: un contrôle sans écrivain est pire qu'un contrôle absent,
 *   « parce qu'il promet ».
 *
 * ⛔ TROIS ÉTATS NOMMÉS, PAS DEUX BOOLÉENS. Le compilateur oblige chaque site
 * de montage à en choisir un, et deux booléens auraient un quatrième état
 * inexprimable à l'écran mais écrivable en TypeScript.
 */
export type ShakerPort =
  | {
    kind: "now";
    save: (
      shaker: ShakerDraft,
      rhythm: readonly EatingOccasionSlot[] | null,
    ) => void;
  }
  | { kind: "with_the_card" }
  | { kind: "none" };

export interface MouthPreferencesFieldsProps {
  draft: MouthFormDraft;
  onChange: React.Dispatch<React.SetStateAction<MouthFormDraft>>;
  subject: MouthSubject;
  busy: boolean;
  onClose: () => void;
  /**
   * LE BLOC SAUTABLE OUVERT, ou `null` — TOUS REPLIÉS.
   *
   * ⚠️ CONTRÔLÉ ET REQUIS, PAS UN `useState` INTERNE, ET C'EST UNE MUTATION
   * QUI L'A IMPOSÉ. Tant que l'état vivait dedans, un test ne pouvait pas
   * ouvrir un bloc: les deux assertions qui portent sur le CONTENU des blocs
   * sautables (le régime réservé à une bouche sans compte, les dégoûts)
   * restaient vertes quoi qu'on fasse — « une garde a besoin d'un cas qui
   * passe », et celles-là n'en avaient pas. Le rendre contrôlé donne au test
   * le seul levier qui manquait, et il donne à l'appelant celui de rouvrir la
   * fiche sur le bloc qu'il vient de refuser.
   */
  /**
   * LES MOMENTS OÙ CETTE BOUCHE MANGE — la liste que la section « ce qu'elle
   * mange déjà » propose, dans l'ordre de la journée.
   *
   * ⚠️ REQUISE, ET C'EST LE DÉFAUT QU'ELLE FERME. Cette section rendait les
   * SIX créneaux en dur (`EATING_OCCASIONS`). Signalé capture à l'appui le
   * 2026-08-19: « par défaut on a mis les 6 plages et ça n'a pas de sens pour
   * une personne qui indique qu'elle mange que 2 fois par jour ». On demandait
   * donc à quelqu'un ce qu'il mange à quatre moments dont il vient de dire
   * qu'ils n'existent pas — et chaque champ laissé vide ressemble alors à un
   * oubli plutôt qu'à une réponse.
   *
   * L'appelant la calcule: le rythme de CETTE bouche s'il en a un, sinon celui
   * de la maison, sinon les six. C'est exactement la cascade que le moteur
   * applique (`null` sur la ligne membre = « comme la maison »), donc l'écran
   * propose ce que la composition servira — pas autre chose.
   *
   * ⛔ NE PAS LA RENDRE OPTIONNELLE avec un défaut à six: le défaut serait
   * précisément le bug, et il reviendrait au premier appelant distrait.
   */
  slots: readonly EatingOccasion[];
  /**
   * ENREGISTRER LE SHAKER, TOUT DE SUITE — ou `null` quand ce sujet n'a pas de
   * port où l'écrire.
   *
   * ── ⚠️ C'EST LA SEULE ÉCRITURE DE CETTE FENÊTRE, ET ELLE EST DEMANDÉE ────
   * Le reste de la fiche est un BROUILLON que la carte enregistre; j'ai
   * d'abord appliqué la même règle ici, et l'utilisateur l'a refusée deux fois
   * — « je veux un bouton enregistrer pour le shaker ». Il a raison sur le
   * fond: ce bloc-ci est un OBJET qu'on ajoute et qu'on retire, pas un champ de
   * la personne, et un objet qui s'ajoute doit pouvoir se poser sans emporter
   * tout le formulaire avec lui.
   *
   * ⚠️ `null` QUAND LE SUJET N'A PAS DE COMPTE. `fixed_intakes` vit dans
   * `student_goals.practical_constraints`, donc sur `user_id`: une bouche sans
   * compte n'a nulle part où le ranger, et un bouton qui écrirait « son »
   * shaker le poserait en fait sur la ligne du MAÎTRE. On ne rend alors pas le
   * bloc du tout — un contrôle qui échoue à tous les coups est pire qu'un
   * contrôle absent, « parce qu'il promet ».
   *
   * ⚠️ IL PORTE AUSSI LE RYTHME DEPUIS LE 2026-09-01, ET LE COMPILATEUR NE
   * L'AURAIT PAS RÉCLAMÉ. TypeScript accepte qu'une fonction déclarée à UN
   * argument soit passée là où DEUX sont fournis: le rythme aurait donc été
   * jeté EN SILENCE chez chaque appelant, et le seul symptôme aurait été un
   * shaker en base sur un moment que la personne ne mange pas. Le second
   * paramètre est écrit ici pour que les sites de montage soient recensés par
   * le compilateur, pas par la relecture.
   */
  shakerPort: ShakerPort;
  /**
   * CE QUE LE CORPS EXIGE — ou `null` quand on ne sait pas encore.
   *
   * Autorité: `docs/fonctionnalites/composition-des-repas/FF-060-...md`
   *
   * ── ⛔ `null` NE VERROUILLE RIEN, ET C'EST LA DIRECTION D'ÉCHEC CHOISIE ──
   * Pas encore calculée, appel en vol, serveur muet: dans les trois cas aucune
   * case n'est désactivée. Une panne qui cocherait-désactiverait un moment
   * laisserait quelqu'un avec un repas qu'il ne peut pas retirer et dont
   * personne ne sait dire d'où il vient. **On perd l'explication, jamais la
   * main.**
   *
   * ⚠️ REQUISE, JAMAIS OPTIONNELLE. Un défaut à `null` ferait qu'un appelant
   * distrait n'afficherait simplement jamais le verrou — et l'écran promettrait
   * une composition que le plan fait quand même, ce qui est le pire des deux
   * mensonges: celui qui ne se voit pas.
   */
  structure: EatingStructure | null;
  /**
   * ⟳ 2026-09-01 — `memberScoped` A ÉTÉ RETIRÉ, ET IL NE DOIT PAS REVENIR.
   *
   * Il cachait deux sections — « ce que tu n'aimes pas » et « quand tu manges,
   * et quoi » — à qui n'avait pas de ligne de foyer, c'est-à-dire au parcours
   * SOLO. Le motif était vrai: les deux vivent sur `member_id`, et un solo n'en
   * avait pas. La conséquence l'était aussi, et elle n'était pas acceptable —
   * **le produit n'était pas le même selon le chemin d'entrée.**
   *
   * La réparation est en amont: le solo a maintenant un foyer d'UNE bouche
   * (`SetupPage::chooseSize`), donc une ligne membre, donc les mêmes
   * destinations que tout le monde. Cette fenêtre n'a plus rien à conditionner.
   *
   * ⛔ SI UNE SECTION FUTURE N'A PAS DE DESTINATION POUR QUELQU'UN, la réponse
   * n'est pas de la cacher pour lui: c'est de lui donner la destination. Un
   * test compare les deux parcours et refuse toute divergence — voir
   * `mouthFormDialog.int.test.ts :: « la fiche est la MÊME pour tout le
   * monde »`.
   */
}

/**
 * LA FENÊTRE DES PRÉFÉRENCES — le chrome, et ce qu'il porte.
 *
 * ⛔ PAS DE `onSubmit` ICI, ET C'EST LE POINT DE LA SÉPARATION. Elle édite le
 * brouillon de la fiche; c'est la fiche qui enregistre.
 */
export interface MouthFormDialogProps extends MouthPreferencesFieldsProps {
  open: boolean;
}

/**
 * LES BLOCS SAUTABLES SONT REPLIÉS, ET LEUR EN-TÊTE DIT QU'ILS LE SONT.
 *
 * Dépliés, les six blocs font trente champs dans une fenêtre — et le dépôt a
 * déjà mesuré ce que ça donne: « l'écran se lisait comme UN formulaire de
 * trente champs dont on ne voyait pas où l'un finissait ». Repliés, on voit
 * trois blocs à remplir et trois qu'on peut ignorer, ce qui est exactement la
 * promesse de la conception.
 */
/**
 * UNE SECTION DE LA FICHE — TOUJOURS OUVERTE.
 *
 * ── ⛔ ELLE REMPLACE `Foldable`, ET LE REPLI EST PARTI POUR DE BON ─────────
 * Le repli existait pour une raison mesurée: dépliés, les blocs faisaient
 * « trente champs dont on ne voyait pas où l'un finissait ». Mais il coûtait
 * plus qu'il ne rendait, et l'utilisateur l'a tranché le 2026-08-19 — « il faut
 * arrêter avec le dépliable ». Ce qu'il coûtait, en clair:
 *
 *   · UNE RÉPONSE REPLIÉE EST UNE RÉPONSE INVISIBLE. Un régime déjà choisi,
 *     une allergie déjà cochée, ne se voyaient qu'en rouvrant le bloc — sur un
 *     écran dont le seul travail est de dire ce qu'on sait de quelqu'un;
 *   · IL FALLAIT DEVINER OÙ. Trois en-têtes fermés ne disent pas laquelle des
 *     trois porte « pas de champignons »;
 *   · ET IL COÛTAIT UN ÉTAT CONTRÔLÉ à chaque appelant (`openBlock`), pour un
 *     confort de mise en page.
 *
 * Ce que le repli achetait — ne pas noyer le lecteur — est repris par l'ORDRE
 * des sections, qui n'est plus arbitraire: le régime d'abord (il écarte des
 * familles entières d'aliments), les allergies ensuite (elles interdisent), les
 * dégoûts après (ils évitent), et ce qu'elle mange déjà en dernier, parce que
 * cette section-là ne se lit bien qu'une fois qu'on sait combien de fois elle
 * mange.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⟳ RENVERSEMENT PARTIEL — A5 (D5.1), 2026-09-03. LIRE AVANT DE « RÉPARER ».
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La décision du 2026-08-19 (« il faut arrêter avec le dépliable ») TIENT POUR
 * CETTE FENÊTRE-CI: `MouthPreferencesFields` n'a toujours aucun repli, et ses
 * six blocs restent ouverts. Ce qui est renversé est son extension à la FICHE
 * D'UNE BOUCHE sur `/app/household`, qui porte depuis A5 deux cadres
 * repliables NOMMÉS — « Informations personnelles » et « Préférences
 * alimentaires » (`SheetFrame`, dans `HouseholdPage.tsx`).
 *
 * ── POURQUOI LES DEUX DÉCISIONS NE SE CONTREDISENT PAS ────────────────────
 * Les trois motifs de 08-19 ont été repris un par un; deux ne s'appliquent pas
 * à la ligne d'une bouche, et le troisième est PAYÉ:
 *
 *   · « UNE RÉPONSE REPLIÉE EST UNE RÉPONSE INVISIBLE » — le seul qui tienne,
 *     et il est payé deux fois: un cadre replié rend son RÉCAPITULATIF
 *     (`filledPreferenceBlocks`, avec les mêmes clés
 *     `household.mouth.preferences_filled` / `_empty` que le bouton de cette
 *     fiche-ci), et les deux cadres sont OUVERTS PAR DÉFAUT. On ne referme que
 *     ce qu'on vient de lire.
 *   · « IL FALLAIT DEVINER OÙ » — vrai pour trois en-têtes fermés et anonymes;
 *     faux pour DEUX cadres dont les titres disent ce que chacun décide (ce
 *     qui dimensionne l'assiette / ce qui l'affine).
 *   · « IL COÛTAIT UN ÉTAT CONTRÔLÉ À CHAQUE APPELANT » — l'état vit dans la
 *     LIGNE (`identityOpen`, `prefsOpen`), pas chez l'appelant, et il meurt
 *     avec elle: le panneau se démonte à la fermeture.
 *
 * ── CE QUE LA FICHE D'UNE BOUCHE A, ET QUE CETTE FENÊTRE N'A PAS ──────────
 * Elle empile identité, corps, direction, régime, habitudes, déjeuner de
 * semaine, allergies et règles de maison — huit sujets, une trentaine de
 * contrôles, EN LIGNE, dans une liste qui peut porter huit personnes. Cette
 * fenêtre-ci est déjà une fenêtre: une personne à la fois, et elle se ferme
 * d'un geste.
 *
 * ⛔ NE PAS « HARMONISER » EN REMETTANT UN REPLI ICI. La fenêtre n'a pas de
 * récapitulatif sous ses blocs; le repli y redeviendrait exactement ce qu'il
 * était le 2026-08-19 — une réponse invisible.
 */
/**
 * L'EXEMPLE DE CHAQUE MOMENT — `Record` COMPLET, jamais un repli.
 *
 * ⛔ PAS DE CLÉ GÉNÉRIQUE EN SECOURS. Il y en avait une, la même pour les six,
 * et c'est ce qui mettait « un café et deux tartines » sous DÎNER. Un repli
 * muet la réintroduirait au premier moment ajouté; le `Record` fait échouer la
 * compilation à la place.
 */
const HABIT_PLACEHOLDERS: Record<EatingOccasion, MessageKey> = {
  breakfast: "household.mouth.habit_placeholder_breakfast",
  snack_am: "household.mouth.habit_placeholder_snack_am",
  lunch: "household.mouth.habit_placeholder_lunch",
  snack_pm: "household.mouth.habit_placeholder_snack_pm",
  dinner: "household.mouth.habit_placeholder_dinner",
  before_bed: "household.mouth.habit_placeholder_before_bed",
};

function Section(
  { title, hint, children }: {
    title: string;
    hint: string;
    children: React.ReactNode;
  },
) {
  return (
    <div
      // LA MARQUE D'UNE SECTION DE FICHE, auditable dans le DOM — même geste
      // que `data-box-id` ailleurs. Elle ne s'affiche pas.
      //
      // ⚠️ ELLE EXISTE PARCE QUE LA CLASSE NE SUFFIT PAS À COMPTER: chaque
      // LIGNE d'option porte le même `rounded-card border border-line-strong`,
      // donc compter la classe rendait 21 au lieu de 7. Un test incapable de
      // distinguer une section d'une ligne ne peut pas dire qu'une section a
      // perdu son cadre — et c'est très exactement ce qu'il doit dire.
      data-sheet-section=""
      className="rounded-card border border-line-strong bg-paper p-4"
    >
      <SectionLabel>{title}</SectionLabel>
      <p className="mt-1 text-xs leading-5 text-ink-soft">{hint}</p>
      {/* `space-y-5` ET PAS `space-y-4`: mesuré sur capture le 2026-08-19, les
          six lignes d'habitudes se lisaient collées — l'étiquette en capitales
          du moment SUIVANT touchait presque le champ du précédent, et la liste
          se lisait comme un seul pavé au lieu de six questions. */}
      <div className="mt-4 space-y-5">{children}</div>
    </div>
  );
}

/** Le bloc obligatoire — encadré plein, jamais repliable. */
function RequiredBlock(
  { title, hint, children }: {
    title: string;
    hint: string;
    children: React.ReactNode;
  },
) {
  return (
    <div className="rounded-card border border-line-strong bg-fig-50/40 p-4">
      <SectionLabel>{title}</SectionLabel>
      <p className="mt-1 text-xs leading-5 text-ink-soft">{hint}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

/**
 * LES MOTS DES TROIS DIRECTIONS — ET IL N'EN RESTE QU'UN JEU.
 *
 * ⟳ 2026-09-06 — PASSÉ DE `household.goal.*` À `setup.goal.*`. Deux libellés
 * pour les trois mêmes jetons vivaient à un doigt l'un de l'autre depuis que le
 * lot A5 (2026-09-03) a monté cette fiche dans l'étape 2 de l'entonnoir: la
 * carte du titulaire disait « Perdre du poids », la fiche de la personne qu'on
 * ajoute « Perte de masse grasse » — le même choix, deux registres, sur le même
 * écran. `GoalTiles` porte encore un `labelOf` par appelant (« les mots restent
 * à la page »), et cette règle valait tant qu'il y avait DEUX pages.
 *
 * ⛔ ET C'EST LE VOCABULAIRE CLINIQUE QUI TOMBE, PAS L'AUTRE. Sa justification
 * était écrite dans le catalogue et elle est MORTE: « forme nominale pour
 * toutes: ce sont des étiquettes dans une liste déroulante, pas des phrases ».
 * La liste déroulante n'existe plus — le chantier P3 l'a remplacée par des
 * tuiles le 2026-09-03. `/mealprep` avait déjà quitté ce registre le
 * 2026-09-01 (« le vocabulaire d'une fiche clinique »), et `plan.goal.*` porte
 * l'argument du mot retenu: « Perdre du poids » et pas « perdre du gras », le
 * second demandant de savoir ce qu'on perd, ce que personne ne sait avant de
 * commencer.
 *
 * ⚠️ LES CLÉS `household.goal.minor_*` NE BOUGENT PAS. Elles ne nomment pas une
 * direction: elles disent le pli de l'âge, et `GoalTiles` les écrit en littéral
 * pour les cinq sites d'un coup.
 */
function goalLabel(goal: MemberGoal): string {
  return t(`setup.goal.${goal}` as "setup.goal.fat_loss");
}

/**
 * LA LISTE DE CE QUI MANQUE, DANS LA GRAMMAIRE DE LA LANGUE.
 *
 * ⚠️ PAS DE CLÉ i18n POUR LE SÉPARATEUR, ET LA GARDE DE PARITÉ L'A DIT AVANT
 * MOI. Une première version portait `household.mouth.block_join` = « , » dans
 * les deux packs: le test « ne recopie pas l'anglais pour faire verdir la CI »
 * l'a rougi, et il avait raison deux fois — une virgule n'est pas une
 * traduction, et un `join(", ")` rend « a, b, c » là où les deux langues
 * disent « a, b et c » / « a, b and c ».
 *
 * `Intl.ListFormat` connaît la règle des deux; il vient du même endroit que
 * `i18n/format.ts` (une seule autorité de locale, jamais `navigator.language`).
 */
// ⟳ `blockList` A DÉMÉNAGÉ DANS `lib/mouthForm.ts` — A5, 2026-09-03.
// La fiche d'une bouche sur `/app/household` rend le MÊME récapitulatif sous
// son cadre replié, et un `.join(", ")` recopié là-bas aurait rendu « a, b, c »
// là où les deux langues disent « a, b et c » / « a, b and c ». La grammaire
// est une règle de langue: elle vit dans le module partagé, pas dans un `.tsx`
// (que `react-refresh/only-export-components` interdit d'ailleurs d'exporter).

/**
 * LE NOMBRE DANS LA LANGUE DE L'ÉCRAN.
 *
 * `0.45` doit se lire « 0,45 » en français. `toLocaleString` sans argument
 * prendrait `navigator.language`, c'est-à-dire la langue du NAVIGATEUR et non
 * celle de la page — vingt-six sites du produit ont déjà divergé comme ça.
 */
function pace(value: number): string {
  return value.toLocaleString(uiLocale() === "fr" ? "fr-FR" : "en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * LA FENÊTRE — le chrome, et rien d'autre.
 *
 * ⚠️ LE CORPS EST UN COMPOSANT SÉPARÉ, ET C'EST UNE CONTRAINTE DE PREUVE, PAS
 * UN GOÛT. `Modal` passe par `createPortal(…, document.body)`, et
 * `vitest.config.ts` tourne en environnement `node` — il n'y a pas de
 * `document`. Monter la fenêtre entière sous `renderToStaticMarkup` lève
 * `ReferenceError: document is not defined`, donc les six blocs ne seraient
 * prouvables que par un test de SOURCE, et ce dépôt a déjà vu des tests de
 * source rester verts sur du code mort.
 *
 * ⛔ NE PAS « RÉPARER » ÇA EN PASSANT `vitest.config.ts` EN `jsdom`: le fichier
 * est partagé par toutes les lanes, et changer l'environnement global de la
 * suite pour un composant est un effet de bord que personne n'a demandé.
 */
export default function MouthFormDialog(
  props: MouthFormDialogProps,
): React.ReactElement {
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      // LE TITRE NOMME LE BOUTON QUI L'A OUVERTE, et le prénom vient après.
      // Une fenêtre qui ne porte pas le nom du geste laisse le doute sur ce
      // qu'on est en train de remplir.
      title={props.draft.firstName.trim()
        ? t("household.mouth.preferences_title_named", {
          name: props.draft.firstName.trim(),
        })
        : t("household.mouth.preferences_title")}
      size="lg"
      // ── ⛔ UNE CROIX, PLUS « PLUS TARD » (2026-08-19) ────────────────────
      // Le libellé disait « plus tard » pour rassurer: la fiche se reprend, on
      // ne perd rien. Il n'a plus lieu d'être — la fenêtre ÉCRIT à la
      // fermeture depuis ce matin, donc il n'y a pas de « plus tard », il y a
      // « c'est enregistré ». Un mot qui décrit une hésitation sur un geste qui
      // n'en est plus une.
      //
      // ⚠️ LE TEXTE SURVIT EN `aria-label`: une croix sans nom accessible est
      // un bouton muet pour un lecteur d'écran.
      closeAsIcon
      closeLabel={t("common.close")}
    >
      {/* `{...props}` porte déjà `structure`: la nommer une seconde fois la
          ferait écraser par l'étalement, en silence. */}
      <MouthPreferencesFields {...props} />
    </Modal>
  );
}

/**
 * LA PORTE DES PRÉFÉRENCES — LE BOUTON, ET CE QU'IL DIT DÉJÀ PORTER.
 *
 * ⚠️ UN COMPOSANT À PART DEPUIS LE 2026-08-18, parce que l'entonnoir le monte
 * aussi — trois fois, même: sur la fiche du titulaire, sur le formulaire
 * d'ajout, et sur la ligne de chaque bouche déjà inscrite. Les champs
 * d'allergies EN LIGNE ont disparu de cet écran; ce bouton est alors la SEULE
 * porte vers eux, et une porte recopiée à trois endroits est une porte dont
 * deux exemplaires cesseront un jour de dire la même chose.
 *
 * ⚠️ LE RÉCAPITULATIF N'EST PAS DÉCORATIF. Sans lui, refermer la fenêtre se lit
 * comme perdre ce qu'on vient de taper: le brouillon le garde, mais l'écran
 * n'en montre plus rien — et « un geste qui ne fait rien est indiscernable d'un
 * geste qui a marché » vaut aussi dans l'autre sens.
 */
export function MouthPreferencesButton(
  { draft, busy, onOpen, voice, who }: {
    draft: MouthFormDraft;
    busy: boolean;
    onOpen: () => void;
    /** REQUIS: le maître lisait « Renseigner SES préférences » sur sa carte. */
    voice: MouthVoice;
    who: string;
  },
): React.ReactElement {
  const filled = filledPreferenceBlocks(draft);
  return (
    <div className="rounded-card border border-line-strong bg-paper p-4">
      <Button variant="secondary" disabled={busy} onClick={onOpen}>
        {t(voiced("household.mouth.preferences_open", voice), { who })}
      </Button>
      <p className="mt-2 text-xs leading-5 text-ink-soft">
        {filled.length > 0
          ? t("household.mouth.preferences_filled", {
            blocks: blockList(
              filled.map((b) =>
                t(`household.mouth.block_${b}` as "household.mouth.block_identity")
              ),
            ),
          })
          : t("household.mouth.preferences_empty")}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ② LES DEUX AXES · ① LES TROIS CASES — un seul composant, deux appelants
// ---------------------------------------------------------------------------
//
// ⛔ POURQUOI UN COMPOSANT PARTAGÉ ET PAS DEUX BLOCS RECOPIÉS. Ces cinq
// questions se posent à DEUX endroits de `/app/household`: la fiche du maître
// et la fiche neuve (`MouthCoreFields`, sur un brouillon), et la ligne d'une
// bouche déjà inscrite (`BodyFields`, sur un état local semé par la base). Deux
// copies d'un même formulaire finissent par poser deux questions différentes —
// et c'est la copie la moins regardée qui garde l'ancienne formulation.
//
// ── ⛔ POURQUOI DES « OUI / NON » ET PAS TROIS CASES À COCHER ─────────────
// Une case cochée ou non ne sait dire que deux choses, et il en faut TROIS:
// « oui », « non », et « je n'ai pas répondu ». Sans le troisième, un
// formulaire enregistré sans être lu écrirait « ni pain ni fromage ni
// dessert », c'est-à-dire un plat qui porte 100 % du repas — deux fois et demie
// la part servie aujourd'hui, dans le sens qui nourrit trop. C'est la cicatrice
// « coche auto = faits faux indémentables », et elle interdit la case.
//
// ⚠️ ET LES TROIS SE RÉPONDENT ENSEMBLE OU PAS DU TOUT. Une seule réponse ne
// suffit pas au calcul (`composedDishShare` rend alors la moyenne), et c'est
// dit à l'écran plutôt que découvert dans un compteur.

/** Ce que les questions du 2026-08-20 valent, pour une bouche. */
export interface MouthActivityAndStructure {
  dayActivity: DayActivityLevel | "";
  sportFrequency: SportFrequency | "";
  /** ⑤ (2026-08-20). `""` = pas répondu ⇒ ×1,00, un neutre VRAI. */
  appetite: AppetiteLevel | "";
}


// ── ⟳ 2026-09-06 · UNE SEULE GRILLE POUR LES SIX JETONS ────────────────────
// Ces deux axes étaient rendus ICI par des radios d'une ligne, avec leur propre
// catalogue (`household.mouth.day_activity_*`, `household.mouth.sport_*`),
// pendant que l'entonnoir les rendait en TUILES titre + explication avec le
// sien (`setup.day_activity.*`, `setup.sport.*`). Deux formulaires, six jetons,
// douze libellés — exactement le mode d'échec que l'en-tête de ce fichier
// annonce deux paragraphes plus haut, et qui s'est vu le jour où le lot A5 a
// monté cette fiche DANS l'étape 2, à côté de la carte du titulaire.
//
// ⛔ LE CATALOGUE QUI SURVIT EST CELUI DE L'ENTONNOIR, et ce n'est pas un tirage
// au sort: lui seul porte une PAIRE par jeton, et son explication est mot pour
// mot le libellé que rendait celui-ci (« Plutôt assis » + « Assis toute la
// journée, peu de marche »). L'écran ne perd donc aucun mot; il perd un
// exemplaire.
//
// ⚠️ CE QUI RESTE À CETTE FICHE EST SA VOIX. Les titres continuent de NOMMER la
// personne (`voiced` + `whoOf`), et les deux phrases d'aide continuent de dire
// où s'arrête chaque axe — c'est elles qui empêchent de compter ses séances une
// fois dans la journée et une fois dans le sport.
export function MouthActivityAxesFields(
  { value, onChange, voice, who }: {
    value: MouthActivityAndStructure;
    onChange: (patch: Partial<MouthActivityAndStructure>) => void;
    voice: MouthVoice;
    who: string;
  },
): React.ReactElement {
  return (
    <ActivityAxesTiles
      dayLabel={t(voiced("household.mouth.day_activity", voice), { who })}
      dayHint={t("household.mouth.day_activity_hint")}
      sportLabel={t(voiced("household.mouth.sport", voice), { who })}
      sportHint={t("household.mouth.sport_hint")}
      day={value.dayActivity === "" ? null : value.dayActivity}
      sport={value.sportFrequency === "" ? null : value.sportFrequency}
      onDay={(next) => onChange({ dayActivity: next })}
      onSport={(next) => onChange({ sportFrequency: next })}
      // ⚠️ JAMAIS GRISÉES. Cette fiche n'a pas d'état « occupé » à ce niveau —
      // son bouton en a un, les champs non —, et griser une grille pendant une
      // écriture voisine ferait lire un refus là où il n'y en a pas.
      busy={false}
      idPrefix="mouth"
    />
  );
}

/**
 * ① LA STRUCTURE DU REPAS · ⑤ L'APPÉTIT — LE SECOND BLOC, ET IL VIT AILLEURS.
 *
 * ⛔ SCINDÉ DE `MouthActivityAxesFields` LE 2026-08-20 (soir), SUR UNE DÉCISION
 * D'ÉCRAN. Les deux axes d'activité sont la TROISIÈME ENTRÉE DE L'ÉQUATION
 * D'ENTRETIEN, au même titre que la taille et le poids: ils restent collés au
 * corps. Ces cinq questions-ci décrivent une HABITUDE DE TABLE — ce qu'on
 * prend à côté du plat, et de quel côté de la formule on tombe — et elles
 * appartiennent aux préférences.
 *
 * ⚠️ UN SEUL COMPOSANT POUR TROIS ÉCRANS, comme son jumeau: la fenêtre des
 * préférences (entonnoir ET foyer) et la rangée d'une bouche déjà inscrite, qui
 * n'a pas de fenêtre. Deux copies poseraient deux fois la même question dans
 * deux formulations, et c'est celle qu'on regarde le moins qui garderait
 * l'ancienne.
 */
export function MouthAppetiteFields(
  { value, onChange, voice, who }: {
    value: MouthActivityAndStructure;
    onChange: (patch: Partial<MouthActivityAndStructure>) => void;
    voice: MouthVoice;
    who: string;
  },
): React.ReactElement {
  return (
    <>
      {/* ── ⑤ L'APPÉTIT — TROIS CRANS, ET IL EST TRANSITOIRE ────────────
          ⚠️ IL NE DEMANDE PAS « as-tu faim ». Les ±10 % sont l'incertitude
          inter-individuelle de l'équation de prédiction (Mifflin-St Jeor), pas
          un curseur de confort: la question est « la formule me tombe-t-elle
          juste ? », et la seule personne qui puisse y répondre est celle qui se
          connaît. Les libellés le disent, sinon on obtient une réponse à une
          autre question.

          ⛔ ET IL EST DESTINÉ À MOURIR: le lot ⑦ (boucle de poids) le remplace
          pour qui a un compte et une série de pesées. Une stabilité est une
          MESURE, ces trois crans sont une DÉCLARATION. */}
      {/* `Section`, PAS `Field` — LE MÊME CADRE QUE LE RESTE DE LA FICHE.
          Ces deux blocs étaient les SEULS rendus nus, avec l'aide en bas
          (capture du 2026-08-20). Deux composants ajoutés plus tard avec le
          primitif du FORMULAIRE au lieu de celui de la FICHE. */}
      <Section
        title={t(voiced("household.mouth.appetite", voice), { who })}
        hint={t(voiced("household.mouth.appetite_hint", voice), { who })}
      >
        <div
          className="flex flex-col gap-2"
          role="radiogroup"
          aria-label={t(voiced("household.mouth.appetite", voice), { who })}
        >
          {APPETITE_LEVELS.map((level) => (
            <label
              key={level}
              className="flex cursor-pointer items-center gap-3 rounded-card border border-line-strong bg-paper px-3 py-2.5 text-sm text-ink"
            >
              <input
                type="radio"
                name="mouth-appetite"
                value={level}
                checked={value.appetite === level}
                onChange={() => onChange({ appetite: level })}
              />
              <span>
                {t(`household.mouth.appetite_${level}` as "household.mouth.appetite_small")}
              </span>
            </label>
          ))}
        </div>
      </Section>

    </>
  );
}


export function MouthCoreFields(
  props: MouthCoreFieldsProps,
): React.ReactElement {
  // LA VOIX, ET CE QUE `{who}` VAUT — voir `lib/mouthVoice.ts`.
  const voice: MouthVoice = props.subject.isSelf ? "self" : "other";
  const who = whoOf(props.draft.firstName, t("household.mouth.who_fallback"));
  const { onChange, subject, todayLocalIso } = props;
  // ── LE BROUILLON PLIÉ À SON ÂGE (chantier P3, 2026-09-03) ───────────────
  // Tout ce que cette fiche LIT passe par le pli — les tuiles, le curseur, ce
  // qui retient le bouton, l'`aria-required` de l'activité; tout ce qu'elle
  // ÉCRIT (`set`) va dans le brouillon BRUT de l'appelant. Le seul lecteur du
  // brouillon brut est `GoalTiles`, qui a besoin de la direction d'origine
  // pour NOMMER celle que le pli a remplacée. Voir `foldMinorGoal`.
  const draft = foldMinorGoal(props.draft, todayLocalIso).draft;
  // ⚠️ MISE À JOUR FONCTIONNELLE. React groupe les mises à jour d'un même tick:
  // deux champs touchés coup sur coup partiraient sinon du MÊME état de départ,
  // et le second effacerait le premier. Mesuré sur `SetupPage` le 2026-08-12.
  const set = (patch: Partial<MouthFormDraft>) =>
    onChange((prev) => ({ ...prev, ...patch }));

  const missing = missingRequiredBlocks(draft);
  const held = submitIsHeld(draft, todayLocalIso);
  const ageState = ageStateOfDraft(draft, todayLocalIso);

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {/* ⛔ LA PHRASE D'INTRODUCTION EST PARTIE (2026-09-09) ─────────────
            « Trois choses dont on a besoin, trois que tu peux sauter… » décrivait
            LE FORMULAIRE au lieu de dire quoi que ce soit de la personne — et ce
            qu'elle promettait est déjà dit par ce que l'écran FAIT: les trois
            blocs qui retiennent le bouton portent leur cadre, et la ligne
            « il manque… » les nomme à côté du geste. Décision de l'utilisateur
            (« ça n'apporte pas de valeur »). La clé `household.mouth.intro` est
            partie des deux packs avec elle.
            ⚠️ CE QUI NE DOIT PAS REVENIR ICI à sa place: une phrase qui dit
            comment la fiche se remplit. Ce qui manque se dit à côté du bouton
            qui le lève, jamais en tête. */}

        {/* ── BLOC 1 · QUI C'EST ─────────────────────────────────────────── */}
        <RequiredBlock
          title={t("household.mouth.identity")}
          hint={t(voiced("household.mouth.identity_hint", voice), { who })}
        >
          <Field
            label={t("setup.people.first_name")}
            hint={t(voiced("setup.mouths.first_name_hint", voice), { who })}
            htmlFor="mouth-first-name"
          >
            <input
              id="mouth-first-name"
              type="text"
              maxLength={40}
              value={draft.firstName}
              onChange={(e) => set({ firstName: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field
            label={t("setup.people.birth_date")}
            // ⛔ CE `hint` EST LA RÉPONSE À « pourquoi vous ne demandez pas si
            // c'est un enfant ». La date de naissance le dit, et la poser en
            // plus ouvrirait deux réponses qui se contredisent.
            hint={t("household.mouth.birth_date_hint")}
            htmlFor="mouth-birth-date"
          >
            <input
              id="mouth-birth-date"
              type="date"
              max={todayLocalIso}
              value={draft.birthDate}
              onChange={(e) => set({ birthDate: e.target.value })}
              className={inputClass}
            />
          </Field>
          {/* L'ÉTAT D'ÂGE EST RENDU, JAMAIS DEMANDÉ. Il dit à qui remplit ce
              que le produit a compris — et surtout quand il n'a RIEN compris,
              cas où aucune direction ne s'appliquera. */}
          {draft.birthDate.trim() !== "" && ageState === "unknown" ? (
            <p className="rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              {t("household.mouth.age_unknown")}
            </p>
          ) : null}
        </RequiredBlock>

        {/* ── BLOC 2 · LE CORPS ───────────────────────────────────────────
            ⚠️ IL EST PASSÉ DEVANT LA DIRECTION LE 2026-08-18, SUR UNE MESURE.
            Le curseur de rythme est BORNÉ par ce corps: tant qu'il manque, le
            bloc de la direction ne peut rendre qu'une phrase (`needs_body`) —
            et cette phrase renvoyait vers un bloc situé PLUS BAS dans la même
            fenêtre. Mesuré au navigateur sur la fiche du maître, qui s'ouvre
            avec un corps vide; rapporté par l'utilisateur comme « je ne vois ni
            le poids visé ni le rythme ». La cause du silence n'était pas le
            calcul, c'était l'ordre. Voir `MOUTH_FORM_BLOCKS`. */}
        <RequiredBlock
          title={t(voiced("household.mouth.body", voice), { who })}
          hint={t("household.mouth.body_hint")}
        >
          {/* ── ⟳ TROIS ÉTIQUETTES, PLUS TROIS PLACEHOLDERS — A5, 2026-09-03 ─
              Les trois contrôles n'avaient qu'un `placeholder` (doublé d'un
              `aria-label`), c'est-à-dire un libellé QUI S'EFFACE AU MOMENT OÙ
              ON SAISIT: absent de toute fiche remplie, donc illisible dès
              qu'on relit ce qu'on vient de taper.

              La carte d'ajout de l'entonnoir avait été corrigée le 2026-09-01
              — « chacun des quatre porte enfin une ÉTIQUETTE » — mais cette
              fiche-ci ne l'avait pas suivie, et c'est cette fiche-ci qui reste
              maintenant que l'entonnoir la monte à son tour (A5, unification).
              La correction MONTE dans le composant partagé, elle ne redescend
              pas dans une copie: c'est tout l'objet du lot.

              ⚠️ LES `id` ET LES `aria-label` NE BOUGENT PAS. Le `<label for>`
              s'ajoute par-dessus, il ne remplace rien — les tests qui visent
              `mouth-height` continuent de viser le même contrôle.

              ⚠️ BORNES DE `keel_household_set_member_body` (30–260 cm,
              2–400 kg) et pas celles de `profiles`: une bouche peut être un
              enfant de trois ans, que les bornes adultes refuseraient. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("setup.people.height")} htmlFor="mouth-height">
              <input
                id="mouth-height"
                type="number"
                inputMode="numeric"
                min={30}
                max={260}
                aria-label={t("setup.people.height")}
                value={draft.heightCm}
                onChange={(e) => set({ heightCm: e.target.value })}
                className={`${inputClass} min-w-0`}
              />
            </Field>
            <Field label={t("setup.people.weight")} htmlFor="mouth-weight">
              <input
                id="mouth-weight"
                type="number"
                inputMode="decimal"
                step="0.1"
                min={2}
                max={400}
                aria-label={t("setup.people.weight")}
                value={draft.weightKg}
                onChange={(e) => set({ weightKg: e.target.value })}
                className={`${inputClass} min-w-0`}
              />
            </Field>
            <Field label={t("setup.people.gender")} htmlFor="mouth-gender">
              <select
                id="mouth-gender"
                aria-label={t("setup.people.gender")}
                value={draft.gender}
                onChange={(e) =>
                  set({ gender: e.target.value as MemberGender | "" })}
                className={`${inputClass} min-w-0`}
              >
                <option value="">—</option>
                {MEMBER_GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {t(
                      `household.body.gender_${g}` as "household.body.gender_female",
                    )}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* ── LE TOUT-OU-RIEN DU CORPS, ET IL EST NOMMÉ — A5, 2026-09-03 ───
              ⛔ CETTE LIGNE NOMME UN REFUS DE LA BASE, pas une préférence de
              mise en page. `keel_household_set_member_body` rend
              `body_incomplete` dès qu'un des trois manque, et le moteur SAUTE
              une bouche sans corps — elle reçoit la part de tout le monde, en
              silence. Taille et poids saisis, sexe laissé sur « — », c'est un
              corps qui n'existe nulle part.

              Elle vivait sur la carte d'ajout de l'entonnoir
              (`setup.mouths.body_together`), et cette carte vient d'être
              remplacée par CETTE fiche (A5). Sans ce déménagement, la seule
              phrase du produit qui annonce `body_incomplete` avant le clic
              serait partie avec les champs qu'elle commentait.

              ⛔ NE PAS LA SUPPRIMER PARCE QUE LES TROIS CHAMPS ONT DÉSORMAIS
              DES ÉTIQUETTES. Les étiquettes disent ce QU'EST chaque champ;
              elle seule dit que les trois vont ENSEMBLE. */}
          <p className="-mt-1 text-sm leading-6 text-ink-soft">
            {t("setup.mouths.body_together")}
          </p>

          {/* ── ⛔ ICI SE TENAIENT LES QUATRE CRANS D'ACTIVITÉ ───────────────
              Retirés le 2026-09-06. Ils demandaient en UNE question ce que les
              deux grilles juste en dessous demandent en deux, et l'entonnoir
              avait déjà tranché le 2026-08-19: les quatre crans mélangeaient la
              journée et le sport, donc quelqu'un d'assis qui court deux fois par
              semaine ne pouvait dire que l'un des deux — il cochait « Sport 2 à
              3 fois » et héritait de PAL 1,80 quand le croisement vaut ~1,60.
              **239 kcal/jour fabriqués par la forme de la question.**

              CETTE FICHE-CI N'AVAIT PAS SUIVI, et le lot A5 (2026-09-03) l'a
              montée dans l'étape 2 telle quelle: l'écran posait alors la même
              question DEUX FOIS, dans les deux formes, celle d'avant au-dessus
              de celle d'après.

              ⛔ ET LA QUESTION EN TROP RETENAIT LE BOUTON, pendant que les deux
              qui comptent ne le retenaient pas. `missingRequiredBlocks` exigeait
              `activityLevel` dès que la direction bougeait; `activityFactorOf`,
              lui, JETTE ce cran dès que les deux axes sont remplis (`crossed`
              l'emporte sur `legacy`). On bloquait donc l'inscription sur une
              réponse dont on savait déjà qu'on ne la lirait pas — et si un seul
              axe manquait, c'est le cran qui gagnait, c'est-à-dire très
              exactement le PAL faux que la scission avait retiré.

              ⚠️ LA COLONNE, ELLE, RESTE, ET IL NE FAUT PAS LA VIDER.
              `p_activity_level` est un paramètre REQUIS de la RPC, `legacy` est
              le repli NOMMÉ des fiches qui n'ont répondu qu'à lui, et le
              brouillon continue de le porter d'un bout à l'autre: ce qui a été
              déclaré autrefois est renvoyé tel quel. On a retiré le CONTRÔLE,
              pas la donnée. Son vocabulaire reste lisible dans
              `SetupPage.tsx` (`ACTIVITY_KEYS`), gardé exprès pour ça. */}

        </RequiredBlock>

        {/* ── BLOC 3 · CE QU'ELLE VISE — ET SES DEUX CHAMPS DÉPLIABLES ────
            ⟳ 2026-09-06 — LE TITRE NOMME L'INTENTION, PLUS L'EFFET. Il disait
            « Le sens dans lequel la balance va »: vrai du calcul, faux de la
            question. Voir la note du catalogue, et `setup.people.goal` sur la
            carte du titulaire, qui portait déjà ces mots-là. */}
        <RequiredBlock
          title={t(voiced("household.mouth.direction", voice))}
          hint={t("household.mouth.direction_hint")}
        >
          {/* TROIS CHOIX, PAS SIX — ET UN SEUL POUR UN MINEUR (2026-09-03).
              L'axe qui fait bifurquer un plan est la DIRECTION DE LA BALANCE:
              descend, monte, ne bouge pas. La liste vient de `goalsForAge`,
              dérivée de `GOAL_TOKENS` — une seule liste, six sélecteurs, et un
              test la confronte au CHECK de la base ET à la garde d'âge lue sur
              le disque. Les tuiles sont le MÊME composant que les cinq autres
              sites (`GoalTiles`): aucune pré-sélection, aucune option vide.

              ⚠️ `value` EST LE BROUILLON BRUT, EXPRÈS: c'est la seule lecture
              non pliée de cette fiche, parce que la phrase de bascule doit
              nommer la direction d'ORIGINE. Le pli, lui, est dans `checked`. */}
          <GoalTiles
            name="mouth-goal"
            ariaLabel={t(voiced("household.mouth.direction", voice))}
            value={props.draft.goal}
            ageState={ageState}
            labelOf={goalLabel}
            // CHANGER DE DIRECTION VIDE LA CIBLE ET LE RYTHME. Les deux
            // n'ont de sens que sous la direction qui les a produits, et
            // `household_members_target_needs_direction_check` refuse
            // une cible sur `maintenance`. Les garder en mémoire les
            // ferait repartir au prochain basculement, vers une
            // violation de contrainte.
            onChange={(g) => set({ goal: g, targetWeightKg: "", paceKgPerWeek: "" })}
          />

          {/* ── LES DEUX CHAMPS QUI SE DÉPLIENT ─────────────────────────
              Ils sont un COMPOSANT À PART depuis le 2026-08-18, parce que
              l'entonnoir d'inscription les monte aussi — et qu'une seconde
              copie de ces quatre états divergerait au premier correctif. */}
          <TargetAndPaceFields
            draft={draft}
            onChange={onChange}
            todayLocalIso={todayLocalIso}
            // `mouth` — les `id` d'origine, inchangés: cette fiche est SEULE
            // sur sa page (`/app/household`), et les renommer casserait les
            // tests qui les mesurent sans rien réparer.
            idPrefix="mouth"
            voice={voice}
            who={who}
          />
        </RequiredBlock>

        {/* ── ② LES DEUX AXES — SOUS LA DIRECTION, ET PAS DANS LE CORPS ───
            ⟳ 2026-09-06 · DEMANDÉ À L'ÉCRAN. Ils étaient dans le bloc du corps
            depuis le 2026-08-20, et l'argument était le CALCUL: le corps dit
            combien on pèse, l'activité dit ce qu'on en fait, `meal_envelope.ts`
            multiplie les deux, et l'écart entre les deux extrêmes du croisement
            vaut ~47 % de l'enveloppe. Rien de tout ça n'a bougé — mais ce n'est
            pas l'ordre de la LECTURE.

            La carte du titulaire avait déjà fait ce déplacement le 2026-09-01,
            avec ses mots: « d'abord CE QU'EST ce corps (naissance, sexe, taille,
            poids), ensuite CE QU'IL VISE, ensuite CE QU'IL FAIT de ses
            journées ». Les deux fiches se lisent l'une sous l'autre dans
            l'étape 2 depuis A5; celle-ci suit la même route.

            ⛔ ET ELLES RESTENT EN LIGNE, HORS DES PRÉFÉRENCES. Les ranger
            derrière le bouton en ferait une option, alors qu'elles
            dimensionnent chaque part. Elles sont hors des trois cadres
            obligatoires parce qu'elles ne retiennent rien — et c'est ce que le
            cadre dit.

            ⛔ ① ET ⑤ NE SONT PAS ICI (2026-08-20, soir). Ils décrivent une
            habitude de table, pas un corps: ils vivent dans la fenêtre des
            préférences (`MouthEatingHabitsFields`). */}
        <MouthActivityAxesFields
          voice={voice}
          who={who}
          value={{
            dayActivity: draft.dayActivity,
            sportFrequency: draft.sportFrequency,
            appetite: draft.appetite,
          }}
          onChange={(patch) => set(patch)}
        />

        {/* ── LE BOUTON QUI OUVRE LES PRÉFÉRENCES ─────────────────────────
            Les blocs 4-6 vivent DERRIÈRE lui depuis le 2026-08-18: ils affinent
            un plan, ils ne le structurent pas. Ce qui le précède — qui c'est, où
            va la balance, quel corps — décide de la forme des assiettes, donc
            reste en ligne, sans clic.

            ⚠️ CE QUI A ÉTÉ RENSEIGNÉ DERRIÈRE EST DIT SOUS LE BOUTON. Sans ce
            récapitulatif, fermer la fenêtre se lit comme perdre ce qu'on vient
            de taper: le brouillon le garde, mais l'écran n'en montrait plus
            rien — et « un geste qui ne fait rien est indiscernable d'un geste
            qui a marché » vaut aussi dans l'autre sens. */}
        <MouthPreferencesButton
          draft={draft}
          busy={props.busy}
          onOpen={props.onOpenPreferences}
          voice={voice}
          who={who}
        />

        {/* ── LE REFUS, PUIS CE QUI RETIENT, PUIS LE GESTE ───────────────── */}
        {props.failure !== null ? (
          <p className="rounded-card border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900">
            {props.failure}
          </p>
        ) : null}
        {/* ⚠️ CE QUI RETIENT LE BOUTON EST NOMMÉ, ET IL EST À CÔTÉ DU BOUTON.
            Un bouton grisé sans phrase est le mode d'échec n°1 de ce dépôt: le
            geste ne fait rien, et rien ne dit ce qui le lèverait. */}
        {missing.length > 0 ? (
          <p className="rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            {t("household.mouth.held", {
              blocks: blockList(
                missing.map((b) =>
                  t(
                    `household.mouth.block_${b}` as "household.mouth.block_identity",
                  )
                ),
              ),
            })}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={props.busy || held}
            onClick={props.onSubmit}
          >
            {subject.existing
              ? t("household.mouth.save")
              : t("household.mouth.add")}
          </Button>
          {/* ⛔ PLUS DE « PLUS TARD » ICI. Cette fiche est EN LIGNE depuis le
              2026-08-18: il n'y a plus de fenêtre à quitter, et un bouton de
              sortie sur une carte de page ne mène nulle part. La sortie qui
              reste est celle de la fenêtre des préférences, chez elle. */}
        </div>
      </div>
    </div>
  );
}


/**
 * LES BLOCS 4-6 — CE QUI AFFINE, JAMAIS CE QUI STRUCTURE.
 *
 * ⚠️ ILS ÉDITENT LE BROUILLON DE LA FICHE, ET N'ENREGISTRENT RIEN. Il n'y a
 * donc ici NI bouton de save, NI ligne « il manque… »: les trois blocs qui
 * retiennent l'enregistrement sont en ligne, dans `MouthCoreFields`, et leur
 * refus est rendu à côté du bouton qui les lève. Poser un second bouton
 * d'enregistrement sur le même brouillon ferait diverger les deux écritures —
 * la cicatrice « deux formulaires qui écrivent les mêmes colonnes ».
 *
 * ⚠️ LA FENÊTRE SE FERME TOUJOURS, et fermer ne jette rien: le brouillon vit
 * chez l'appelant. La phrase du bas le DIT, parce que personne ne peut le
 * deviner d'un `onClose`.
 */
export function MouthPreferencesFields(
  props: MouthPreferencesFieldsProps,
): React.ReactElement {
  const { draft, onChange, subject } = props;
  const set = (patch: Partial<MouthFormDraft>) =>
    onChange((prev) => ({ ...prev, ...patch }));
  const voice: MouthVoice = subject.isSelf ? "self" : "other";
  const who = whoOf(draft.firstName, t("household.mouth.who_fallback"));

  /**
   * ══════════════════════════════════════════════════════════════════════
   * FF-060 — LES MOMENTS DÉRIVÉS SONT PROPOSÉS COCHÉS, UNE SEULE FOIS
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⚠️ CE N'EST PAS INVENTER UNE RÉPONSE: c'est MONTRER celle que le plan
   * appliquera de toute façon. Le générateur ouvre ces moments avec ou sans
   * cet écran; les laisser vides ferait composer une journée en cinq temps à
   * quelqu'un dont la fiche en montre trois — et le désaccord se découvrirait
   * au plan, c'est-à-dire trop tard.
   *
   * ⛔ SEULEMENT QUAND RIEN N'EST DÉCLARÉ (`rhythm === null`). Une personne qui
   * a coché ses moments a répondu: on ne réécrit pas sa réponse, on verrouille
   * seulement son plancher. Et comme la condition tombe dès qu'on a écrit, cet
   * effet ne peut pas boucler.
   *
   * ── ⟳ 2026-09-08 — REVENU, APRÈS AVOIR ÉTÉ RETIRÉ LE 2026-09-06 ─────────
   * La pierre tombale qui vivait ici disait qu'une pré-coche confond le
   * PLANCHER (« ce corps a besoin de N moments ») et la DÉCLARATION (« voilà
   * quand je mange »), et que la cicatrice `auto-tick-writes-undeniable-false-
   * facts` s'appliquait mot pour mot.
   *
   * Décision du propriétaire, et son argument porte: cette fiche se remplit
   * DANS L'ENTONNOIR, sous les yeux de la personne, et c'est elle qui
   * l'enregistre. Des cases qu'elle voit, qu'elle peut décocher, et qu'elle
   * valide en enregistrant ne sont pas un fait écrit dans son dos — c'est un
   * formulaire pré-rempli, et l'enregistrement EST la confirmation. La
   * cicatrice de 2026-08-05 parlait d'une coche écrite par une PHOTO, sans
   * personne devant l'écran et sans moyen de la retirer; ce n'est pas ce cas.
   *
   * ⚠️ CE QUI SURVIT DE LA CICATRICE, ET QUI EST LA MOITIÉ DU LOT: la
   * proposition ne se fait qu'UNE FOIS par fiche (`prefilled`). Sans ce
   * verrou, décocher le dernier moment remettrait `rhythm` à `null` — l'état
   * même sur lequel on propose —, la liste se recocherait sous les doigts, et
   * « comme la maison » deviendrait un état que le produit refuse d'atteindre.
   *
   * ⛔ ET LA DÉCISION N'EST PAS ICI. Quels moments et combien viennent de
   * `structure.slots`, c'est-à-dire de `_shared/keel/eating_structure.ts` — le
   * même module pur que le générateur. Le tri du « quand » vit dans
   * `lib/rhythmPrefill.ts`, testé seul; cet effet ne fait que le câbler.
   */
  const prefilled = React.useRef(false);
  React.useEffect(() => {
    if (rhythmPrefillLatches(draft.rhythm)) {
      prefilled.current = true;
      return;
    }
    const next = rhythmPrefillFor({
      declared: draft.rhythm,
      // ⚠️ `slots` ET PAS `opened` — voir `RhythmPrefillInput`: `opened` est le
      // delta, et il retombe à zéro dès que le brouillon porte les moments.
      derived: props.structure?.slots ?? [],
      latched: prefilled.current,
    });
    if (next === null) return;
    prefilled.current = true;
    set({ rhythm: next });
  }, [draft.rhythm, props.structure]);

  /**
   * ⛔ LA PHRASE SUIT LE VERROU, PAS `opened` — ET C'EST UN DÉFAUT MESURÉ.
   *
   * Elle était conditionnée à `structure.opened.length > 0`. Or `opened` est ce
   * que le SERVEUR a ajouté par rapport aux moments déclarés: dès que la
   * personne coche ce qu'on lui propose, elle déclare ces moments, le serveur
   * n'a plus rien à ajouter, et `opened` retombe à zéro — pendant que le
   * plancher, lui, verrouille toujours ses quatre cases.
   *
   * Vu à l'écran le 2026-09-04: quatre cases grisées et **aucune phrase pour
   * les expliquer**. C'est très exactement ce que ce lot s'interdisait.
   *
   * La condition est donc CELLE DU VERROU: dès qu'un plancher peut mordre, il
   * se dit.
   */
  const floorCount = props.structure?.requiredCount ?? 0;
  const tickedCount = (draft.rhythm ?? []).length;
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ CE QUI S'EST PASSÉ ICI EN TROIS JOURS — à lire avant de re-trancher
  // ══════════════════════════════════════════════════════════════════════════
  //
  // 2026-09-04  la pré-coche arrive, en écrivant `structure.opened`.
  // 2026-09-06  elle est RETIRÉE: « pourquoi cette personne a l'après-midi qui
  //             est automatiquement cochée ? ». Motif écrit alors: deux choses
  //             sans rapport tombaient dans le même champ — le PLANCHER (le
  //             serveur dit « ce corps a besoin de N moments ») et la
  //             DÉCLARATION (ce qu'elle dit manger).
  // 2026-09-08  elle REVIENT, et le motif de 09-06 est jugé faux ICI: la fiche
  //             se remplit dans l'entonnoir, sous les yeux de la personne, et
  //             l'enregistrement est sa confirmation. Le détail, et ce qui
  //             survit quand même de la cicatrice, sont sur l'effet plus haut
  //             et dans `lib/rhythmPrefill.ts`.
  //
  // ⚠️ CE QUI N'A JAMAIS BOUGÉ, DANS LES TROIS ÉTATS: la PHRASE. Sans elle, la
  // personne ne sait pas d'où vient le goûter coché — et une case pré-cochée
  // sans phrase est exactement ce qui a fait retirer le lot en 09-06.
  //
  // ⚠️ ET RIEN N'EST PERDU SI ELLE DÉCOCHE TOUT. `rhythm = null` veut dire
  // « comme la maison », et le générateur dérive le plancher lui-même
  // (`eatingStructureFor`, le MÊME module pur que cette réponse): les moments
  // manquants s'ouvriront au plan. Décocher ne prive donc de rien — c'est ce
  // qui rend la pré-coche acceptable.

  // ── CE QUI VERROUILLE, ET SEULEMENT QUAND ÇA A UN SENS ────────────────────
  // ⟳ 2026-09-06 — `<=` EST DEVENU `===`, ET LE `<=` ÉTAIT UN PIÈGE MASQUÉ.
  // Il ne se voyait pas tant que l'effet ci-dessus pré-cochait exactement
  // `floorCount` moments: on partait donc TOUJOURS à l'égalité. Sans lui, une
  // fiche part à zéro coché — et `tickedCount <= floorCount` verrouillait la
  // PREMIÈRE case cochée (1 <= 4), sans qu'aucune autre ne soit cochable pour
  // la libérer. Un formulaire où le premier geste est irréversible.
  //
  // ⛔ 2026-09-08 — LA PRÉ-COCHE EST REVENUE, DONC LE MASQUE AUSSI: on repart
  // à l'égalité, et un `<=` redeviendrait invisible en fiche neuve. Il ne
  // mordrait qu'après le premier décochage — c'est-à-dire chez la personne qui
  // essaie précisément de corriger ce qu'on lui a proposé. NE LE REMETS PAS.
  // `oneCookingSessionField`-style: le test qui tient ça est
  // `rhythmPrefill.int.test.ts :: « le verrou ne mord qu'à l'égalité »`.
  //
  // La règle juste est celle que ce fichier écrit déjà plus bas: « on peut
  // échanger, on ne peut pas DESCENDRE ». Elle ne mord qu'À l'égalité —
  // au-dessous, la personne est déjà sous le compte et le plan complètera;
  // au-dessus, il reste de la marge.
  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ ON N'IMPOSE DE MANGER QU'À QUI VEUT PRENDRE DU POIDS — 2026-09-06
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Décision produit, mot pour mot: « si une personne n'a pas pour objectif de
  // prendre du poids il faut pas qu'on impose de manger. Donc on propose
  // 3 repas par jour mais si c'est pas pour gagner du poids on peut décocher
  // et après l'algorithme fera comme il peut ».
  //
  // ── CE QUE LE VERROU FAISAIT, ET POURQUOI ÇA NE TIENT QUE DANS UN SENS ───
  // Le plancher vient d'un plafond de MASSE: une assiette ne peut pas porter
  // toute la journée, donc au-delà d'un certain besoin il faut plus de
  // moments. Le raisonnement est juste, mais sa CONSÉQUENCE ne l'est que quand
  // on cherche à faire ENTRER de l'énergie. Pour qui maintient ou perd, une
  // journée en trois repas qui n'atteint pas tout à fait sa cible n'est pas un
  // défaut à corriger de force: c'est une journée ordinaire, et le plan
  // compose au mieux dans ce qu'on lui laisse.
  //
  // ⛔ ET « IMPOSER DE MANGER » N'EST PAS UNE FIGURE DE STYLE. Une case grisée
  // sur un goûter dit à quelqu'un qu'il doit prendre une collation. À une
  // personne qui perd du poids, c'est le produit qui se met en travers de son
  // objectif; à une personne qui a un rapport difficile à la nourriture, c'est
  // pire que ça. Le plancher TCA est ailleurs et reste entier
  // (`mouthTargetKcal`, `restriction_floor`): il protège d'un déficit, il ne
  // réclame pas un repas de plus.
  //
  // ⚠️ LE PLANCHER CONTINUE DE SE DIRE, DANS LES DEUX CAS. Ce qui disparaît est
  // la contrainte, jamais l'information: la phrase annonce toujours combien de
  // moments le plan ouvrira, et c'est ce qui évite de découvrir un goûter dans
  // son plan sans rien pour l'expliquer.
  // ⚠️ `""` — AUCUNE DIRECTION CHOISIE — N'IMPOSE RIEN NON PLUS. Elle n'est pas
  // « probablement une prise »: c'est une question sans réponse, et un verrou
  // posé dessus réclamerait un repas au nom d'un objectif que personne n'a
  // encore nommé.
  const gainsWeight = draft.goal !== "" && scaleDirectionOf(draft.goal) === "up";
  const floorBinds = gainsWeight && floorCount > 0 &&
    tickedCount === floorCount;
  // ── ET CE QUI PARLE, QUI N'EST PAS LA MÊME CHOSE ─────────────────────────
  // La phrase couvre TOUT le dessous du plancher, verrou compris: à zéro coché
  // elle annonce ce que le plan ouvrira, à l'égalité elle explique en plus la
  // case grisée. Au-DESSUS, elle se tait — il n'y a plus rien à ouvrir, et une
  // phrase qui resterait dirait une contrainte que l'écran n'applique plus.
  //
  // ⚠️ C'EST L'ANCIEN `floorBinds`, ET CE N'EST PAS UN HASARD: il faisait les
  // deux travaux à la fois parce que l'écran pré-cochait exactement
  // `floorCount` moments, ce qui collait les deux conditions l'une sur l'autre.
  // Elles se séparent le jour où la fiche part vide.
  const floorSpeaks = floorCount > 0 && tickedCount <= floorCount;

  /**
   * ⟳ `declaredSlots` A ÉTÉ RETIRÉ LE 2026-09-01 — IL N'AVAIT PLUS DE LECTEUR.
   *
   * Il portait la cascade « les moments cochés, sinon ceux de la maison, sinon
   * les six », et il servait à décider quels champs d'habitude s'affichaient.
   * Depuis que le champ s'ouvre AVEC SA CASE (voir le pavé de la section), la
   * seule chose qui décide est `draft.rhythm` — et le repli n'a plus d'endroit
   * où s'appliquer: une case décochée ne pose pas de question.
   *
   * ⚠️ `props.slots` A DONC PERDU SON SEUL LECTEUR DANS CE COMPOSANT, et il
   * reste déclaré REQUIS. C'est signalé, pas réparé: le retirer touche ses
   * trois sites de montage (`SetupPage`, deux fois `HouseholdPage`) et les
   * fixtures de test des sessions voisines, ce qui déborde de ce lot. Une prop
   * requise que personne ne lit est exactement le genre de ceinture armée sur
   * un coffre vide que ce dépôt paie en boucle — à retirer dans un lot à elle.
   */

  /**
   * ── ⛔ IL N'Y A PLUS DE « VOIR LES N AUTRES MOMENTS » ────────────────────
   * Le contrôle a vécu quelques heures le 2026-08-19. Il existait pour qu'une
   * ligne d'habitude ne disparaisse pas en silence quand on décoche un moment
   * au-dessus — une inquiétude légitime, et fausse en pratique:
   *
   *   · il ne s'affichait QUE sur une bouche dont le rythme est déclaré, jamais
   *     sur la carte du maître (qui n'a rien déclaré, donc rien de caché). Deux
   *     fiches identiques ne se ressemblaient plus, sans raison lisible;
   *   · et ce qu'il « révélait » sont des moments dont la personne vient de
   *     dire qu'ils n'existent pas. Proposer de les rouvrir, c'est proposer de
   *     répondre à une question qu'on a retirée soi-même.
   *
   * La section suit donc les moments déclarés, point — et la liste de cases
   * juste au-dessus est ce qui les change.
   */

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-ink-soft">
        {t("household.mouth.preferences_intro")}
      </p>

      {/* ═══ L'ORDRE DES SECTIONS EST UNE DÉCISION, PAS UNE MISE EN PAGE ═══
          Il va du plus EXCLUANT au plus informatif, et chaque cran contient le
          suivant:

            1. LE RÉGIME écarte des familles entières d'aliments. Le poser en
               dernier ferait remplir des dégoûts sur des aliments qu'on ne
               servira de toute façon jamais.
            2. LES ALLERGIES interdisent — médicales, fail-closed.
            3. LES DÉGOÛTS évitent — un fait de goût, que le serveur tait.
            4. COMBIEN DE FOIS ELLE MANGE dimensionne la journée…
            5. …et c'est ce qui rend la dernière section lisible: on ne demande
               « qu'est-ce qu'elle mange déjà » QUE sur les moments qui
               existent. Cette dépendance est la raison de l'ordre, pas un
               goût: l'inverse posait six questions à quelqu'un qui mange deux
               fois.

          Ordre demandé et arbitré par l'utilisateur le 2026-08-19. */}

      {/* ── 1 · LE RÉGIME ────────────────────────────────────────────────────
          ⚠️ IL EST MONTRÉ À TOUT LE MONDE DEPUIS LE 2026-08-19, et il ne
          l'était pas: la ligne portait `subject.hasAccount ? null : (…)`, au
          motif que `keel_household_set_member_diet` refuse `has_account`. Le
          motif est juste et ne dit rien de l'ÉCRAN: le régime de quelqu'un qui
          a un compte existe, il vit simplement dans une autre table
          (`student_safety_constraints`, via `saveOwnDiet`) — et cet écrivain-là
          est branché depuis toujours sur ce même champ de brouillon. Le cacher
          faisait donc que le titulaire, seul de la maison, ne voyait nulle part
          la question qui écarte le plus d'aliments; il devait la retrouver deux
          écrans plus loin. C'est l'inverse de la règle de la fenêtre — « sans
          quoi celui qui tient la maison serait le seul dont on ne sait rien ».

          ⚠️ CE QUI RESTE VRAI: l'écrivain n'est pas le même des deux côtés.
          C'est à l'appelant de le savoir, et les deux le savent déjà. */}
      <Section
        title={t(voiced("household.mouth.diet", voice), { who })}
        hint={t("household.mouth.diet_hint")}
      >
        {/* ⛔ PAS DE `Field`: LA SECTION EST DÉJÀ L'ÉTIQUETTE. Les deux
            rendaient la MÊME clé, donc « COMMENT TU MANGES » s'affichait DEUX
            FOIS (capture du 2026-08-20). `aria-label` garde le contrôle nommé
            pour un lecteur d'écran — réparer à l'œil en cassant à l'oreille
            n'est pas réparer. */}
        <select
          id="mouth-diet"
          aria-label={t(voiced("household.mouth.diet", voice), { who })}
          value={draft.diet}
          onChange={(e) => set({ diet: e.target.value })}
          className={inputClass}
        >
          {/* ⛔ L'ÉTAT DE DÉPART EST UNE INVITE, PLUS UN CHOIX. C'était
              « Personne n'a dit » — un constat sur un tiers, proposé à
              quelqu'un qui répond pour lui-même.
              ⚠️ MAIS L'OPTION RESTE, `disabled`. La retirer afficherait « Je
              mange de tout » à qui n'a rien choisi, pendant que le brouillon
              vaut `""`: l'écran annoncerait un régime que personne n'a
              déclaré, sur le champ qui écarte le plus d'aliments. */}
          <option value="" disabled>
            {t("household.mouth.diet_unset")}
          </option>
          {DIET_ANSWERS.map((d) => (
            <option key={d} value={d}>
              {t(`setup.people.diet_${d}` as "setup.people.diet_omnivore")}
            </option>
          ))}
        </select>
      </Section>


      {/* ── 2 · LES ALLERGIES · fail-closed ──────────────────────────────── */}
      <Section
        title={t(voiced("setup.mouths.allergies", voice), { who })}
        hint={t("setup.people.allergies_hint")}
      >
        <div className="flex flex-wrap gap-2">
          {ALLERGEN_OPTIONS.map((option) => {
            const on = draft.allergies.includes(option.slug);
            return (
              <Button
                key={option.slug}
                variant={on ? "primary" : "secondary"}
                size="sm"
                onClick={() =>
                  set({
                    allergies: on
                      ? draft.allergies.filter((s) => s !== option.slug)
                      : [...draft.allergies, option.slug],
                    // COCHER UN ALLERGÈNE LÈVE « rien ». Les deux ensemble
                    // sont un état contradictoire que la base n'a pas à
                    // arbitrer.
                    allergiesNone: false,
                  })}
              >
                {allergenLabel(option.slug)}
              </Button>
            );
          })}
        </div>
        {/* « RIEN » EST UNE RÉPONSE, distincte de « personne n'a demandé ».
            Sans ce bouton, une section sautée et une section remplie d'un
            « non » seraient le même état en base. */}
        <Button
          variant={draft.allergiesNone ? "primary" : "secondary"}
          size="sm"
          onClick={() =>
            set({
              allergiesNone: !draft.allergiesNone,
              allergies: draft.allergiesNone ? draft.allergies : [],
            })}
        >
          {t("setup.people.allergies_none")}
        </Button>
      </Section>

      {/* ── 3 · CE QU'ELLE N'AIME PAS ────────────────────────────────────────
          ⚠️ CE N'EST PAS UNE ALLERGIE, et la séparation d'avec la section du
          dessus est le point. Deux tables, deux natures: une allergie est
          MÉDICALE et rejoint l'union de sécurité fail-closed; un dégoût est un
          fait de foyer dont le verrou serveur TAIT le pourquoi. Les fondre
          promettrait une garde de sécurité sur une préférence. Elles étaient
          dans le même bloc replié que le régime — donc indistinctes une fois
          fermé.

          ⚠️ ET ÇA VIT SUR LA LIGNE MEMBRE, pas sur `food_preferences`:
          celle-là est indexée sur `user_id`, donc INATTEIGNABLE pour une bouche
          sans compte — c'est-à-dire pour un enfant, le cas nominal du foyer. */}
      
        <Section
          title={t(voiced("household.mouth.tastes", voice), { who })}
          hint={t(voiced("household.mouth.tastes_hint", voice), { who })}
        >
          <DislikeFields
            dislikes={draft.dislikes}
            onChange={(next) => set({ dislikes: next })}
          />
        </Section>

      {/* ── ⑤ L'APPÉTIT, ET CE QU'IL Y A D'AUTRE DANS L'ASSIETTE ─────────
          ⟳ DESCENDUES SOUS LES ALLERGIES ET LES DÉGOÛTS LE 2026-09-01, SUR
          DEMANDE DU PROPRIÉTAIRE — ET C'EST L'INVERSE DE CE QU'IL AVAIT
          DEMANDÉ LE 2026-08-20. Le commentaire d'alors disait « JUSTE SOUS LA
          SECTION DU RÉGIME, ET C'EST UNE DEMANDE EXPLICITE ». Il est réécrit
          plutôt que complété: laisser les deux consignes côte à côte ferait
          restaurer l'ancienne place par le premier lecteur qui citerait la
          plus ancienne.

          ⚠️ CE N'EST PAS LA PLACE QUI AVAIT ÉTÉ REFUSÉE. Le refus du
          2026-08-20 portait sur « plus bas, SOUS LES HABITUDES PAR MOMENT »,
          qui les séparait de ce qu'elles précisent. Ici elles restent AVANT la
          section des moments — elles ont seulement laissé passer les deux
          blocs qui EXCLUENT.

          ── ET ÇA SUIT LA RÈGLE DÉJÀ ÉCRITE ICI ─────────────────────────
          « L'ordre des sections va du plus EXCLUANT au plus informatif »: le
          régime écarte des familles entières, les allergies et les dégoûts
          écartent des aliments. L'appétit et l'assiette, eux, n'écartent rien
          — ils PRÉCISENT. Ils étaient les seuls informatifs coincés entre deux
          excluants; ils sont maintenant du bon côté de la charnière.

          ⛔ LES DEUX RESTENT DEUX BLOCS, jamais fondues: l'assiette attend une
          décision de forme — posée UNE FOIS pour la personne (aujourd'hui) ou
          PAR MOMENT (la forme visée: le déjeuner et le dîner de quelqu'un
          n'ont pas le même pain).

          ⚠️ ELLES ONT BESOIN D'UN CORPS POUR AGIR, et c'est pour ça qu'elles ne
          bloquent rien: sans taille/poids/sexe, `mouthTargetKcal` rend
          `no_body`, le facteur vaut 1, et ni l'une ni l'autre n'a le moindre
          effet. Les exiger ici ferait un mur devant deux champs qui, eux, sont
          exigés ailleurs.

          ⚠️ REMISE UNE FOIS APRÈS AVOIR ÉTÉ EFFACÉE (2026-08-20): un
          `git checkout` sur ce fichier, lancé pour annuler UNE mutation de
          test, a emporté tout le travail non commité — dont un déplacement
          fait par une autre session. Ne fais pas ça ici. */}
      <MouthAppetiteFields
        voice={voice}
        who={who}
        value={{
          dayActivity: draft.dayActivity,
          sportFrequency: draft.sportFrequency,
          appetite: draft.appetite,
        }}
        onChange={(patch) => set(patch)}
      />

      {/* ⛔ « CE QU'IL Y A D'AUTRE DANS L'ASSIETTE » N'EXISTE PLUS.
          Les trois oui/non par personne ont été retirés de l'écran le
          2026-09-01, remplacés par des bulles par moment; les bulles elles-
          mêmes ont été retirées le 2026-09-10.

          ⛔ DÉCISION PRODUIT: le plan dimensionne les aliments qu'il prévoit et
          ne réserve plus d'énergie pour un accompagnement personnel hors plan.
          La phrase qui le dit est sous le bloc « quand … mange, et quoi ».

          ⚠️ `takes_dessert / takes_cheese / takes_bread` RESTENT EN BASE et ne
          sont effacés par personne — l'écran ne les écrit plus et le moteur ne
          les lit plus, ce qui suffit à les neutraliser. */}

      {/* ══════════════════════════════════════════════════════════════════
          4 · QUAND ELLE MANGE, ET QUOI — UNE SEULE QUESTION (2026-09-01)
          ══════════════════════════════════════════════════════════════════

          ── CE QUE CETTE FUSION REMPLACE ────────────────────────────────
          Deux sections se suivaient: « Combien de fois elle mange par jour »,
          qui cochait des moments, puis « Ce qu'elle mange déjà », qui
          redemandait une ligne par moment coché. C'était la même question
          posée deux fois, et rien entre les deux ne disait que la seconde
          DÉPENDAIT de la première: on cochait en haut, le détail apparaissait
          ailleurs, et décocher faisait disparaître une ligne à distance.

          Le détail vit désormais DANS la case qu'il concerne. Une question, un
          endroit, et la dépendance se voit au lieu de se deviner.

          ── ⛔ LE DÉTAIL S'OUVRE AVEC LA CASE, ET C'EST UN ALLER-RETOUR ──
          Trois rédactions, et il faut les connaître toutes les trois pour ne
          pas refaire la deuxième.

            ① accroché à la case — refusé par un test écrit contre la décision
              du 2026-08-19 (« il faut arrêter avec le dépliable »), dont le
              motif est juste: une réponse repliée est une réponse INVISIBLE.
            ② accroché à `declaredSlots` — tous les champs visibles, y compris
              via le repli sur le rythme de la maison. Correct sur le papier,
              et refusé À L'ÉCRAN le 2026-09-01, capture à l'appui: sur un
              compte neuf, `rhythm` est `null`, donc CINQ champs vides et
              ouverts s'empilaient sous cinq cases décochées. La section se
              lisait comme un formulaire de cinq questions au lieu d'une liste
              de moments.
            ③ accroché à la case, à nouveau — demandé explicitement le
              2026-09-01, après avoir vu ②.

          ⚠️ CE N'EST PAS UN RETOUR AU « DÉPLIABLE » DE 2026-08-19, et la
          nuance décide: ce repli-là cachait des RÉPONSES derrière un en-tête
          fermé. Ici, une case décochée veut dire « elle ne mange pas à ce
          moment » — il n'y a pas de réponse cachée, il n'y a pas de question.
          C'est mot pour mot ce que la note de `declaredSlots` dit déjà du
          contrôle « voir les N autres moments », retiré le même jour: « ce
          qu'il révélait sont des moments dont la personne vient de dire qu'ils
          n'existent pas ».

          ⚠️ CE QUE ③ COÛTE, ET C'EST ASSUMÉ: quelqu'un qui n'a rien coché ne
          voit aucun champ. C'est le cas d'un compte neuf, et c'est voulu — la
          case est l'entrée, pas le champ.

          ⛔ ET ON NE PRÉ-COCHE TOUJOURS PAS. Une case cochée d'avance écrirait
          sur la ligne de quelqu'un un fait que personne n'a énoncé — ce que
          `rhythm: null` existe précisément pour ne pas faire.

          ⛔ NE RIEN COCHER N'EST PAS « ELLE NE MANGE JAMAIS ». C'est « comme la
          maison » (`null`), le repli documenté de la ligne membre, et la base
          refuse de toute façon un tableau vide (`empty_rhythm`). La phrase sous
          la liste le DIT, sinon une rangée décochée se lit comme un oubli. */}
      
        <Section
          title={t(voiced("household.mouth.eating", voice), { who })}
          hint={t(voiced("household.mouth.eating_hint", voice), { who })}
        >
          <ul className="space-y-2">
            {EATING_OCCASIONS.map((slot) => {
              const on = (draft.rhythm ?? []).some((r) => r.slot === slot);
              // LE SHAKER EST-IL POSÉ ICI ? C'est la seconde moitié du lot: un
              // apport déclaré sur ce moment doit se VOIR sur ce moment, sinon
              // il vit dans un bloc à part et la journée se lit à deux endroits.
              const shakerHere = draft.shaker !== null &&
                draft.shaker.slot === slot;
              // ══════════════════════════════════════════════════════════
              // FF-060 — ON VERROUILLE UN COMPTE, PAS DES MOMENTS NOMMÉS
              // ══════════════════════════════════════════════════════════
              //
              // ⛔ CE QUI ÉTAIT FAUX AU PREMIER JET, ET MESURÉ À L'ÉCRAN. Je
              // verrouillais `structure.opened`. Sur une fiche où rien n'est
              // encore coché, la dérivation ouvre les quatre moments depuis
              // rien — donc les QUATRE se verrouillaient, et la personne ne
              // pouvait plus jamais dire qu'elle saute le petit-déjeuner.
              // Un produit qui interdit de décrire ses propres repas a cessé
              // d'être un produit.
              //
              // La contrainte réelle n'a jamais été « CES moments-là »: c'est
              // « au moins N moments », parce qu'une assiette a un plafond de
              // masse. Lesquels reste le choix de la personne.
              //
              // ⇒ ON PEUT ÉCHANGER, ON NE PEUT PAS DESCENDRE. Un moment coché
              // se verrouille seulement quand en retirer un ferait passer sous
              // le compte requis. Cocher `before_bed` libère aussitôt les
              // autres, et le petit-déjeuner redevient décochable.
              const locked = on && floorBinds;
              return (
                <li
                  key={slot}
                  className={`rounded-card border px-3 py-2 ${
                    on ? "border-ink bg-fig-50" : "border-line"
                  }`}
                >
                  {/* `accent-ink`, ET CE N'EST PAS DÉCORATIF: sans lui, une case
                      cochée prend la couleur d'accent du SYSTÈME — bleue sur
                      les réglages par défaut de macOS et de Windows. */}
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      id={`mouth-rhythm-${slot}`}
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-ink"
                      checked={on}
                      disabled={props.busy || locked}
                      data-mouth-slot-locked={locked ? slot : undefined}
                      onChange={() => {
                        const current = draft.rhythm ?? [];
                        const next: EatingOccasionSlot[] = on
                          ? current.filter((r) => r.slot !== slot)
                          : [...current, { slot, size: null }];
                        // ⛔ LE VIDE REDEVIENT `null`. Voir la note du champ:
                        // décocher le dernier moment veut dire « finalement,
                        // comme la maison », pas « elle ne mange jamais ».
                        set({
                          rhythm: next.length === 0
                            ? null
                            : EATING_OCCASIONS
                              .filter((s) => next.some((r) => r.slot === s))
                              .map((s) => ({ slot: s, size: null })),
                        });
                      }}
                    />
                    <span className="text-sm font-medium text-ink">
                      {mealCopy(`meals.slot.${slot}` as "meals.slot.breakfast")}
                    </span>
                  </label>

                  {/* ── LE DÉPLIANT: CE QU'ELLE Y PREND DÉJÀ ────────────────
                      ⚠️ IL N'APPARAÎT QUE COCHÉ, et c'est tout l'objet de la
                      fusion. Un champ visible sous un moment décoché
                      demanderait ce qu'on mange à un moment dont on vient de
                      dire qu'il n'existe pas — le défaut exact que le
                      déplacement du 2026-08-19 réparait déjà, une fois.

                      ⚠️ MÊMES PLACEHOLDERS QU'AVANT (`HABIT_PLACEHOLDERS`): le
                      `Record` complet refuse de compiler si un septième moment
                      arrivait sans le sien — la même garde que `ACTIVITY_KEYS`.

                      ⛔ ET UNE ÉTIQUETTE VISIBLE, pas le placeholder seul. Le
                      nom du moment est sur la case au-dessus, il ne dit pas CE
                      QU'ON DEMANDE; et un placeholder disparaît à la première
                      frappe. Même règle que les trois nombres du shaker. */}
                  {on ? (
                    <div className="mt-3 border-t border-line pt-3">
                      {/* ⚠️ L'ÉTIQUETTE NE NOMME PLUS PERSONNE, donc elle n'a
                          plus de jumelle « tu »: « Des habitudes ? » se lit
                          pareil dans les deux voix. Garder un `_you` identique
                          aurait été deux clés pour un seul texte, et une
                          divergence en attente au premier retouchage. */}
                      <Field
                        label={t("household.mouth.habit_field")}
                        htmlFor={`mouth-habit-${slot}`}
                      >
                        <input
                          id={`mouth-habit-${slot}`}
                          type="text"
                          maxLength={120}
                          placeholder={t(HABIT_PLACEHOLDERS[slot])}
                          value={draft.habits[slot] ?? ""}
                          disabled={props.busy}
                          onChange={(e) =>
                            set({
                              habits: {
                                ...draft.habits,
                                [slot]: e.target.value,
                              },
                            })}
                          className={inputClass}
                        />
                      </Field>
                      {/* ── « + REPAS LÉGER » ────────────────────────────
                          ⟳ 2026-09-10 — LES CINQ BULLES D'EXTRAS QUI VIVAIENT
                          ICI ONT ÉTÉ RETIRÉES (pain, fromage, yaourt, fruit,
                          dessert, sur le déjeuner et le dîner). Le plan
                          dimensionne les aliments qu'il prévoit; il ne réserve
                          plus d'énergie pour un accompagnement personnel.

                          ⚠️ TROIS MOMENTS, PAS SIX: une collation pèse déjà
                          0,10 de la journée, la marquer légère demanderait au
                          plan de composer ~40 kcal. « Je ne prends pas de
                          goûter » se dit en ne cochant pas le goûter.

                          ⛔ ET UNE BULLE ÉTEINTE N'EST PAS « NON ». Trois
                          états, deux apparences: jamais touché, touché puis
                          éteint (« ce moment est comme d'habitude »), allumé.
                          Ce qui les sépare est la CLÉ du moment, posée au
                          premier clic — voir `toggleLight`. */}
                      {slotBearsLight(slot) ? (
                        <div className="mt-3">
                          <button
                            type="button"
                            disabled={props.busy}
                            aria-pressed={draft.light[slot] === true}
                            data-mouth-light={slot}
                            onClick={() => set({ light: toggleLight(draft.light, slot) })}
                            className={`rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
                              draft.light[slot] === true
                                ? "border-ink bg-ink text-paper"
                                : "border-line-strong bg-paper text-ink-soft hover:border-ink hover:text-ink"
                            }`}
                          >
                            {draft.light[slot] === true ? "" : "+ "}
                            {t("household.mouth.light")}
                          </button>
                          <p className="mt-1.5 text-xs leading-5 text-ink-soft">
                            {t("household.mouth.light_hint")}
                          </p>
                        </div>
                      ) : null}
                      {shakerHere ? (
                        <p className="mt-2 text-xs leading-5 text-ink-soft">
                          {t(
                            voiced("household.mouth.habit_shaker_here", voice),
                            { who },
                          )}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {draft.rhythm === null ? (
            <p className="text-xs leading-5 text-ink-soft">
              {t(voiced("household.mouth.rhythm_house", voice), { who })}
            </p>
          ) : null}
          {/* ⟳ 2026-09-10 — CE QUE LE PLAN COMPTE, ET CE QU'IL NE COMPTE PAS.
              ⛔ ELLE REMPLACE UNE QUESTION PAR UN FAIT. Les cinq bulles
              demandaient ce qui était pris à côté du plat pour en retrancher
              l'énergie; le plan ne réserve plus rien hors de ce qu'il compose.
              Sans cette phrase, quelqu'un qui ajoute du pain croirait que son
              plan en tient compte — et rien à l'écran ne le démentirait. */}
          <p className="mt-2 text-xs leading-5 text-ink-soft">
            {t("household.mouth.portions_plan_only")}
          </p>
          {/* ⚠️ ON NE COCHE JAMAIS UN MOMENT SANS LE DIRE — la règle est déjà
              écrite pour le shaker, et elle vaut ici pour la même raison: un
              moment apparu tout seul, sans phrase, se lit comme un bug. */}
          {/* ── LE PLANCHER SE DIT DÈS QU'IL EXISTE — 2026-09-06 ────────────
              ⟳ LA CONDITION ÉTAIT `floorBinds`, ET ELLE EST DEVENUE
              `floorCount > 0`. Tant que l'écran cochait les moments tout seul,
              les deux revenaient au même: on partait à l'égalité, donc la
              phrase était toujours là. Depuis que plus rien n'est coché
              d'office, `floorBinds` est faux sur une fiche neuve — et la
              personne n'aurait plus rien pour savoir que le plan lui ouvrira
              un goûter. Un plancher qu'on applique sans le nommer est
              indiscernable d'une lubie du plan.

              ⟳ 2026-09-08 (soir) — TROIS PHRASES EMPILÉES SONT DEVENUES UNE,
              ET L'EMPILEMENT SE CONTREDISAIT. Il rendait `rhythm_derived` +
              `rhythm_derived_why` + `rhythm_floor_locked` à la suite: le
              chiffre trois fois, « cochés » trois fois — et une invitation à
              « décocher » posée juste au-dessus de la phrase qui explique que
              les cases sont tenues. Signalé mot pour mot: « on peut pas
              décocher les repas imposés ».

              ⛔ UNE PHRASE PAR ÉTAT, ET CHACUNE NE NOMME QUE LE GESTE QUI
              EXISTE. Tenu (`floorBinds`) ⇒ on ne peut qu'AJOUTER, et la phrase
              porte alors le pourquoi, parce que c'est là qu'il sert. Libre ⇒ on
              peut RETIRER. Les servir toutes les deux, c'était promettre un
              geste que l'écran refuse — la cicatrice du bouton mort prise par
              l'autre bout. */}
          {floorSpeaks
            ? (
              <p className="text-xs leading-5 text-ink-soft">
                {t(
                  voiced(
                    floorBinds
                      ? "household.mouth.rhythm_floor_locked"
                      : "household.mouth.rhythm_derived",
                    voice,
                  ),
                  { who, count: String(floorCount) },
                )}
              </p>
            )
            : null}
          {/* LE SHAKER COMPOSÉ — et la phrase POINTE le bloc du dessous, qui
              est sa sortie: déclarer le sien fait que le plan n'y touche pas. */}
          {props.structure?.shake === "compose"
            ? (
              <p className="text-xs leading-5 text-ink-soft">
                {t(voiced("household.mouth.shake_composed", voice), { who })}
              </p>
            )
            : null}
        </Section>

      {/* ══════════════════════════════════════════════════════════════════
          5 · LE SHAKER — SA PROPRE SECTION (2026-09-01)
          ══════════════════════════════════════════════════════════════════

          ⚠️ IL VIVAIT AU FOND DE « ce qu'elle mange déjà », ET C'ÉTAIT LE
          MAUVAIS RANG. Cette section-là parle des moments de la journée; le
          shaker est un OBJET qu'on déclare une fois, avec sa marque et ses
          trois nombres. Rangé dessous, il se lisait comme une septième ligne
          d'habitude — et il porte pourtant son propre bouton d'enregistrement,
          ce qu'aucune ligne d'habitude n'a.

          ⛔ IL N'EXISTE QUE LÀ OÙ LE MOTEUR RELIRA QUELQUE CHOSE
          (`shakerPort.kind !== "none"`). ⟳ CE N'EST PLUS « là où il y a un
          bouton »: la fiche d'AJOUT le COLLECTE désormais, et c'est
          « Ajouter à la table » qui l'écrit sur la ligne qu'il vient de créer.
          Voir `ShakerPort` — et le défaut qu'il ferme, signalé le 2026-09-01:
          le shaker était incollectable pour toute personne ajoutée.

          ⚠️ IL PORTE SON PROPRE CADRE, donc pas de `Section` autour: il en
          aurait deux. Le cadre POINTILLÉ quand il n'y a rien, PLEIN quand
          l'objet existe — l'idiome de la fiche d'ajout d'une personne, et la
          seule chose qui distingue « rien encore ici » de « tu as ajouté
          ça ». Il porte en revanche `data-sheet-section`, parce qu'il EST une
          section de la fiche et que le compte de cadres le vérifie. */}
      {props.shakerPort.kind !== "none" ? (
        <ShakerFields
          shaker={draft.shaker}
          foreground={shakerIsForeground(draft.goal)}
          onChange={(next) => set({ shaker: next })}
          // ── LE MOMENT, ET L'AJOUT QUI VA AVEC ──────────────────────────
          // ⛔ LE PARENT TRANCHE, PAS LE BLOC. Choisir un moment peut AJOUTER
          // ce moment au rythme, et le rythme n'appartient pas au shaker: le
          // laisser l'écrire ferait un second écrivain sur un champ qui en a
          // déjà un, à deux lignes d'écart.
          onSlot={(slot) => {
            const current = draft.rhythm ?? [];
            const already = slot === "" ||
              current.some((r) => r.slot === slot);
            set({
              shaker: draft.shaker === null
                ? null
                : { ...draft.shaker, slot },
              // ⚠️ L'ORDRE DE LA JOURNÉE, PAS CELUI DES CLICS — la même règle
              // que la case à cocher juste au-dessus. Deux ordres pour une
              // même liste feraient deux affichages du même rythme.
              ...(already ? {} : {
                rhythm: EATING_OCCASIONS
                  .filter((s) =>
                    s === slot || current.some((r) => r.slot === s)
                  )
                  .map((s) => ({ slot: s, size: null })),
              }),
            });
          }}
          // CE QUI EST COCHÉ EN CE MOMENT — pour dire, au clic, qu'un moment
          // non coché sera ajouté. Jamais pour RESTREINDRE la liste: on doit
          // pouvoir nommer un moment qu'on n'a pas encore déclaré, c'est
          // précisément le cas « je mange midi et soir, et j'ai un shaker
          // l'après-midi ».
          rhythm={draft.rhythm}
          // `null` = PAS DE BOUTON ICI, ET LES CHAMPS RESTENT. Voir
          // `ShakerPort`: la fiche d'ajout collecte, la carte écrit.
          onSave={props.shakerPort.kind === "now" ? props.shakerPort.save : null}
          busy={props.busy}
          voice={voice}
          who={who}
        />
      ) : null}

      {/* ⛔ « Fermer cette fenêtre garde ce que tu as tapé » A ÉTÉ RETIRÉ LE
          2026-08-19. La phrase existait pour rassurer sur une CROIX de
          fermeture; le bouton « Terminé » juste en dessous dit la même chose en
          se laissant cliquer, et deux façons de dire « c'est gardé » font
          douter qu'il le soit.

          ⚠️ ET LE BOUTON EST CENTRÉ: c'est le seul geste de fin de la fenêtre,
          donc il ne s'aligne sur rien d'autre. Collé à gauche sous une colonne
          de sections, il se lisait comme le bouton d'une de ces sections. */}
      <div className="flex justify-center pt-2">
        <Button variant="secondary" disabled={props.busy} onClick={props.onClose}>
          {t("household.mouth.preferences_done")}
        </Button>
      </div>
    </div>
  );
}


/**
 * LE POIDS VISÉ ET LE CURSEUR DE RYTHME — UN SEUL EXEMPLAIRE DANS LE DÉPÔT.
 *
 * ⚠️ EXTRAITS POUR QUE L'ENTONNOIR LES MONTE AUSSI. Mesuré au navigateur:
 * `/app/setup` ne portait NI poids visé NI curseur — zéro `input[type=range]`
 * sur la page après avoir choisi une direction. Les y recopier aurait fait une
 * SECONDE lecture de `paceControlFor`, donc deux écrans qui divergent au premier
 * correctif; le dépôt a déjà payé ça sur les listes d'objectifs.
 *
 * Les quatre états restent ceux du module, et ils ne se confondent pas:
 *   `folded`      la direction ne bouge pas — on ne demande rien, et ce
 *                 composant rend `null`;
 *   `needs_body`  `null` = « je ne connais pas ce corps » — une phrase;
 *   `no_margin`   `0` = « je le connais, il n'a pas de marge » — une AUTRE
 *                 phrase, jamais un curseur de 0,05 à 0;
 *   `slider`      un curseur borné sur CE corps.
 *
 * ⚠️ `idPrefix` EST REQUIS, ET CE N'EST PAS DU CONFORT. Les deux contrôles
 * portaient `id="mouth-target-weight"` et `id="mouth-pace"` en dur. Depuis le
 * 2026-08-18 l'étape 2 de l'entonnoir les monte DEUX FOIS sur la même page —
 * une fois pour le titulaire, une fois pour la bouche qu'on ajoute: deux
 * éléments du même `id` font qu'un `<label for>` désigne le premier, donc
 * cliquer le libellé du second met le curseur du premier au point. Un préfixe
 * OPTIONNEL aurait laissé les appelants d'aujourd'hui produire la collision en
 * silence — c'est le patron `idPrefix` d'`ActivityTiles`, requis pour la même
 * raison.
 */
export function TargetAndPaceFields(
  // ⚠️ `voice` ET `who` RESTENT DANS LE CONTRAT, ET NE SONT PLUS DESTRUCTURÉS
  // (2026-09-03). Les deux `hint` qui les lisaient sont partis le 2026-09-01
  // (voir les deux « PAS DE `hint` ICI » plus bas), et le lint rendait depuis
  // « defined but never used » sur un fichier que personne ne modifiait — donc
  // que le gate ne lintait jamais. Les six appelants les passent encore, et
  // le prochain texte voisé les relira: on ne retire pas une prop du contrat
  // pour faire taire une règle.
  { draft, onChange, todayLocalIso, idPrefix }: {
    draft: MouthFormDraft;
    onChange: React.Dispatch<React.SetStateAction<MouthFormDraft>>;
    todayLocalIso: string;
    idPrefix: string;
    /** REQUIS, même raison que partout ailleurs sur cette fiche. */
    voice: MouthVoice;
    who: string;
  },
): React.ReactElement | null {
  const set = (patch: Partial<MouthFormDraft>) =>
    onChange((prev) => ({ ...prev, ...patch }));
  const paceControl = paceControlFor(draft, todayLocalIso);
  const targetState = targetWeightStateFor(draft, todayLocalIso);
  if (paceControl.kind === "folded") return null;
  return (
            <div className="space-y-4 border-t border-line pt-4">
              <Field
                label={t("household.mouth.target_weight")}
                // ⛔ PAS DE `hint` ICI (2026-09-01, à la demande), ET CETTE
                // PLACE A DÉJÀ PORTÉ DEUX PHRASES CONTRAIRES:
                //   · « Avec le rythme ci-dessous, il donne une date
                //     d'arrivée. » — la promesse, énoncée plus explicitement
                //     que le nombre lui-même (retirée le 2026-08-22);
                //   · « …il dit le sens de marche, pas le moment où il sera
                //     atteint. » — sa négation, qui CONTREDIRAIT maintenant le
                //     nombre de semaines rendu quinze lignes plus bas.
                // Les deux sont intenables avec le chiffre de retour. La
                // phrase sous le curseur porte l'horizon ET sa réserve, au
                // moment exact où le curseur se pousse; un troisième texte ici
                // ne pourrait que diverger de celui-là.
                // ⚠️ LE REFUS EST RENDU À CÔTÉ DU CHAMP, ET C'EST LE CONTRAT DE
                // PASSATION DU SOCLE. Trois fois dans `SetupPage`, un refus
                // rendu loin du geste s'est lu comme un bouton mort.
                error={targetState.kind === "refused"
                  ? t(
                    `household.mouth.target_refused_${targetState.refusal}` as "household.mouth.target_refused_implausible",
                  )
                  : undefined}
                htmlFor={`${idPrefix}-target-weight`}
              >
                <input
                  id={`${idPrefix}-target-weight`}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={25}
                  max={400}
                  value={draft.targetWeightKg}
                  onChange={(e) => set({ targetWeightKg: e.target.value })}
                  className={inputClass}
                />
              </Field>

              {paceControl.kind === "needs_body" ? (
                // ⚠️ `null` DE `paceCeilingFor` = « JE NE CONNAIS PAS CE CORPS ».
                // On demande le corps, on n'affiche PAS de curseur: un maximum
                // deviné promettrait une date d'arrivée calculée sur une
                // personne qui n'existe pas.
                <p className="rounded-card border border-line-strong bg-paper-2 p-3 text-xs leading-5 text-ink-soft">
                  {t("household.mouth.pace_needs_body")}
                </p>
              ) : null}

              {paceControl.kind === "no_margin" ? (
                // ⚠️ ET `0` = « JE LE CONNAIS, ET IL N'A PAS DE MARGE » (défaut
                // D3 de la vérification du socle, porté dans le type de
                // `PaceCeiling`). Les deux appellent des écrans DIFFÉRENTS, et
                // surtout: on n'affiche pas un curseur de 0,05 à 0 — c'est un
                // contrôle mort, et un contrôle mort se lit comme un bouton
                // cassé, jamais comme un refus.
                <p className="rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  {t("household.mouth.pace_no_margin")}
                </p>
              ) : null}

              {paceControl.kind === "slider" ? (
                <Field
                  label={t("household.mouth.pace")}
                  // ⛔ PAS DE `hint` ICI (2026-09-01, à la demande).
                  // `household.mouth.pace_hint` disait « le maximum de ce
                  // curseur est réglé sur ton corps — c'est le rythme le plus
                  // rapide que le plan sait vraiment cuisiner. » Le plafond
                  // se VOIT: le curseur ne monte pas plus haut, et
                  // `paceCeilingFor` le calcule déjà sur ce corps. Les deux
                  // clés ont été retirées des catalogues avec ce lot — un
                  // texte gardé « au cas où » est un texte qu'on rerend.
                  // ⚠️ CE QUI RESTE EST CE QUI N'EST PAS DÉDUCTIBLE DU
                  // CONTRÔLE: `pace_needs_body` et `pace_no_margin`
                  // au-dessus (aucun curseur du tout), et
                  // `PACE_WARNING_LABELS` en dessous (un fait de
                  // physiologie, pas une borne).
                  htmlFor={`${idPrefix}-pace`}
                >
                  <input
                    id={`${idPrefix}-pace`}
                    type="range"
                    min={paceControl.min}
                    max={paceControl.max}
                    step={paceControl.step}
                    value={paceControl.value}
                    onChange={(e) => set({ paceKgPerWeek: e.target.value })}
                    className="w-full"
                  />
                  <p className="mt-2 text-sm font-medium text-ink">
                    {t("household.mouth.pace_value", {
                      pace: pace(paceControl.value),
                    })}
                  </p>
                  {/* ⚠️ LA PHRASE VIENT DU MODULE, DANS LES DEUX LANGUES, ET
                      ELLE N'EST PAS RÉÉCRITE ICI. Le seuil et son mot sont une
                      seule décision (`PACE_WARN_UP_KG_PER_WEEK` +
                      `PACE_WARNING_LABELS`): les séparer laisse l'un bouger
                      sans l'autre. Elle DIT un fait — « le surplus part surtout
                      en gras » —, elle n'interdit rien: le curseur monte
                      jusqu'à la borne dure. */}
                  {paceControl.warning !== null ? (
                    <p className="mt-2 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                      {PACE_WARNING_LABELS[paceControl.warning][
                        uiLocale() === "fr" ? "fr" : "en"
                      ]}
                    </p>
                  ) : null}
                  {/* ③ — LA SATURATION, ET POURQUOI IL N'Y A PLUS RIEN ICI.
                      Du 2026-08-18 au -08-19, cette place a porté « à partir
                      de ce cran, l'assiette ne change plus » : le moteur
                      rabotait une prise à +10 % de l'entretien pendant que le
                      curseur montait à la borne dure, et 0,20 comme 0,60
                      rendaient la même boîte. L'AFFICHAGE est parti le
                      2026-08-19 (la phrase répétait en trente mots ce que la
                      butée du curseur montrait déjà). Le PLAFOND CACHÉ, lui,
                      est parti le 2026-09-09 : le curseur est le contrat, et
                      un cran réglé ici est exécuté tel quel — en-tête de
                      `weight_pace.ts`. Il n'y a donc plus de cran qui « ne
                      change plus rien », et plus rien à dire à cette place. */}
                  {/* ⚠️ L'HORIZON — REVENU LE 2026-09-01, À LA DEMANDE, ET
                      IL NE REVIENT PAS NU.

                      ── CE QUE CETTE PLACE A PORTÉ ────────────────────────
                      ① « About 12 weeks at this pace. » — retiré le
                         2026-08-22 (lot `L3`). Mesuré le même jour: l'écart
                         quotidien prescrit vaut 495 kcal/j et notre erreur
                         d'estimation ±580 kcal/j, donc l'écart RÉELLEMENT
                         exécuté vit dans [-85 … 1075] kcal/j — il traverse
                         zéro, et le nombre de semaines réellement possible
                         allait « de 6 à JAMAIS ».
                      ② Sa phrase de remplacement, qui expliquait en trois
                         lignes POURQUOI il n'y avait pas de date — retirée le
                         2026-09-01: un cours de méthode servi à quelqu'un qui
                         pousse un curseur.

                      ── ⚠️ CE QUI REND LE CHIFFRE TENABLE AUJOURD'HUI ─────
                      LA MESURE N'A PAS BOUGÉ. C'est la décision prise dessus
                      qui a changé: le chiffre se rend COLLÉ à ce qu'il est —
                      « le calcul du curseur, pas une date : seule la balance
                      dira le rythme réel ». Les deux moitiés vivent dans UNE
                      SEULE chaîne (`ARRIVAL_HORIZON_TEMPLATES`), donc aucun
                      rendu ne peut prendre le nombre sans sa réserve, et
                      `arrivalCopyCarriesItsReserve` refuse tout gabarit qui
                      la perdrait.

                      ⛔ ET C'EST POUR ÇA QUE LE `hint` DU CHAMP AU-DESSUS EST
                      PARTI: il disait « pas le moment où il sera atteint »,
                      ce qui contredit ce paragraphe à quinze lignes de
                      distance.

                      ⚠️ TON NEUTRE, PAS AMBRE — même règle que la phrase de
                      saturation retirée plus haut. Ce n'est pas un risque,
                      c'est ce que le curseur vient de calculer.

                      ⚠️ LA PRÉMISSE EST DANS `arrivalHorizonFor`, PAS ICI:
                      cible acceptée, deux poids connus, cran vivant, écart
                      non nul. Un `&&` de plus à l'écran serait une seconde
                      prémisse à faire diverger de la première. */}
                  {targetState.kind === "accepted" &&
                      targetState.horizon !== null
                    ? (
                      <p className="mt-2 text-sm leading-5 text-ink-soft">
                        {arrivalHorizonCopy(
                          targetState.horizon,
                          uiLocale() === "fr" ? "fr" : "en",
                        )}
                      </p>
                    )
                    : null}
                </Field>
              ) : null}
            </div>
  );
}

/**
 * LE SHAKER — ET LES DEUX NOMBRES QU'ON LUI DEMANDE.
 *
 * ⚠️ ON DEMANDE CE QU'IL APPORTE, PAS SEULEMENT CE QUE C'EST. Protéines et
 * calories par portion: c'est ce qui lui permet de COMPTER DANS L'ENVELOPPE au
 * lieu d'être contourné — un shaker ignoré, c'est 380 kcal invisibles par jour,
 * et un générateur qui rajoute de quoi combler un creux qui n'existe pas.
 *
 * ⚠️ LES DEUX NOMBRES SE LISENT SUR L'ÉTIQUETTE DU POT, et c'est ce qui garde
 * la frontière du §3 de la conception: c'est un FAIT DU PRODUIT, pas un verdict
 * sur la personne. Le référentiel, lui, ne connaît aucune poudre de protéine
 * (mesuré: 911 références, zéro whey) et n'en connaîtrait qu'une moyenne.
 *
 * ⚠️ MIS EN AVANT POUR QUI PREND DU POIDS, PROPOSÉ SANS INSISTANCE AUX AUTRES.
 * « Sans insistance » n'est pas « absent »: quelqu'un qui perd du poids peut
 * très bien en prendre un, et ne pas le demander le rendrait invisible au
 * calcul.
 */
/**
 * L'APPORT CHIFFRÉ — UN OBJET, PAS UNE SUITE DE CHAMPS.
 *
 * ── ⚠️ REFAIT LE 2026-08-19, SUR UN SIGNALEMENT DE COMPRÉHENSION ──────────
 * « La partie ajouter un shaker, on ne comprend pas […] refais la partie UI
 * parce qu'on comprend vraiment pas. » Ce qui ne se comprenait pas, en clair,
 * et chaque point était une cause distincte:
 *
 *   · REPLIÉ, ON NE VOYAIT QU'UN PARAGRAPHE ET UN BOUTON. Rien ne disait ce
 *     qu'est cette chose ni où elle atterrit — juste une phrase sur la prise de
 *     poids, suivie d'un bouton de vingt-cinq caractères.
 *   · DÉPLIÉ, IL N'AVAIT PAS DE CADRE. Les champs tombaient dans le flux, à la
 *     suite des lignes d'habitudes: on lisait la suite de la section du dessus,
 *     pas un objet ajouté.
 *   · LES TROIS NOMBRES N'AVAIENT QUE DES `placeholder`. Le placeholder
 *     DISPARAÎT dès qu'on tape: trois cases de chiffres sans étiquette, et plus
 *     aucun moyen de savoir laquelle porte les protéines. C'est le défaut le
 *     plus coûteux des trois — il produit des données FAUSSES, pas seulement de
 *     la confusion.
 *   · ET RIEN NE DISAIT OÙ ÇA S'ENREGISTRE. « Il faut que ça permette
 *     d'enregistrer, de supprimer. »
 *
 * ── ⚠️ CE BLOC N'A TOUJOURS PAS SON PROPRE BOUTON D'ENREGISTREMENT ────────
 * Et c'est délibéré, pas un raccourci: la fenêtre édite LE MÊME brouillon que
 * la fiche, et c'est la fiche qui écrit. Un second bouton d'enregistrement sur
 * les mêmes colonnes est « la garantie qu'un jour l'un des deux cessera
 * d'écrire ce que l'autre écrit » — le dépôt l'a déjà mesuré sur `MeCard`.
 * Ce qui manquait n'était donc pas un bouton, c'était la PHRASE: le pied du
 * cadre dit maintenant par quoi il part. Le retrait, lui, est immédiat et local
 * — il ne touche que le brouillon.
 */
function ShakerFields(
  { shaker, foreground, onChange, onSlot, rhythm, onSave, busy, voice, who }: {
    shaker: ShakerDraft | null;
    foreground: boolean;
    onChange: (next: ShakerDraft | null) => void;
    /**
     * LE MOMENT SE POSE PAR LE PARENT — 2026-09-01.
     *
     * ⛔ PAS PAR `onChange`, ET C'EST LA MOITIÉ QUI COMPTE. Choisir un moment
     * que la personne n'a pas coché AJOUTE ce moment à son rythme, et le
     * rythme n'appartient pas à ce bloc. L'écrire ici en ferait un second
     * écrivain sur un champ qui en a déjà un — deux idées du même rythme, à
     * deux lignes d'écart.
     */
    onSlot: (slot: string) => void;
    /**
     * CE QUI EST COCHÉ EN CE MOMENT. `null` = « comme la maison ».
     *
     * ⚠️ IL NE RESTREINT PAS LA LISTE DES MOMENTS OFFERTS, il sert à DIRE
     * qu'un moment non coché sera ajouté. Restreindre rendrait le cas
     * fondateur inexprimable: « je mange midi et soir, et j'ai un shaker
     * l'après-midi » — l'après-midi n'est pas dans la liste, et c'est
     * justement pour ça qu'on le choisit.
     */
    rhythm: readonly EatingOccasionSlot[] | null;
    /**
     * Enregistre TOUT DE SUITE, sans passer par le Save de la fiche.
     *
     * ⚠️ IL PORTE AUSSI LE RYTHME DEPUIS LE 2026-09-01, ET CE N'EST PAS DU
     * CONFORT. Le rythme et le shaker ont deux chemins d'écriture différents
     * (`setMemberRhythm` via le bouton de la FICHE, `addShakerTo…Intakes` via
     * CE bouton-ci). Sans le second argument, déclarer un shaker sur un moment
     * non coché écrivait le shaker et laissait le moment dans le brouillon:
     * en base, un apport posé sur un moment où la personne ne mange pas.
     * C'est la moitié d'écriture que ce dépôt paie en boucle.     *
     * ⚠️ `null` = IL N'Y A PAS DE BOUTON ICI, ET LES CHAMPS RESTENT. C'est la
     * fiche d'AJOUT: la ligne n'existe pas encore, donc rien ne peut être
     * écrit tout de suite — mais la déclaration se COLLECTE, et « Ajouter à la
     * table » l'écrit avec le reste du brouillon. Retirer le bloc entier dans
     * ce cas était le défaut du 2026-09-01. Voir `ShakerPort`.
     */
    onSave:
      | ((
        shaker: ShakerDraft,
        rhythm: readonly EatingOccasionSlot[] | null,
      ) => void)
      | null;
    busy: boolean;
    /** REQUIS: sans elle, ce bloc reparlerait de « son » shaker au maître. */
    voice: MouthVoice;
    who: string;
  },
) {
  const empty: ShakerDraft = {
    label: "",
    servingGrams: "",
    proteinGPerServing: "",
    energyKcalPerServing: "",
    slot: "",
  };

  // ── REPLIÉ: UNE INVITATION ENCADRÉE, PAS UN BOUTON ORPHELIN ──────────────
  // Le cadre en pointillé dit « il n'y a rien encore ici », exactement comme la
  // fiche d'ajout d'une personne — un seul idiome dans tout l'entonnoir.
  if (shaker === null) {
    return (
      <div
        // IL EST UNE SECTION DE LA FICHE depuis qu'il a quitté « ce
        // qu'elle mange déjà » — et le compte de cadres le vérifie.
        data-sheet-section=""
        className="rounded-card border border-dashed border-line-strong p-4"
      >
        <span className="block text-sm font-semibold text-ink">
          {t(voiced("household.mouth.shaker_title", voice), { who })}
        </span>
        <p className="mt-1 text-xs leading-5 text-ink-soft">
          {foreground
            ? t("household.mouth.shaker_foreground")
            : t("household.mouth.shaker_background")}
        </p>
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={() => onChange(empty)}>
            {t("household.mouth.shaker_add")}
          </Button>
        </div>
      </div>
    );
  }

  const set = (patch: Partial<ShakerDraft>) => onChange({ ...shaker, ...patch });
  const complete = shakerIsComplete(shaker);
  // LES TROIS NOMBRES, DÉCLARÉS UNE FOIS. Le `Record` n'est pas du zèle: il
  // garantit qu'aucun des trois ne peut être rendu sans son étiquette, ce qui
  // est très précisément le défaut qu'on referme.
  const numbers: Array<{
    id: string;
    label: string;
    value: string;
    onValue: (v: string) => void;
    min: number;
  }> = [
    {
      id: "mouth-shaker-grams",
      label: t("household.mouth.shaker_grams"),
      value: shaker.servingGrams,
      onValue: (v) => set({ servingGrams: v }),
      min: 1,
    },
    {
      id: "mouth-shaker-protein",
      label: t("household.mouth.shaker_protein"),
      value: shaker.proteinGPerServing,
      onValue: (v) => set({ proteinGPerServing: v }),
      min: 0,
    },
    {
      id: "mouth-shaker-kcal",
      label: t("household.mouth.shaker_kcal"),
      value: shaker.energyKcalPerServing,
      onValue: (v) => set({ energyKcalPerServing: v }),
      min: 0,
    },
  ];

  return (
    // ── DÉPLIÉ: UN CADRE PLEIN — « ceci est un objet que tu as ajouté » ─────
    // Trait plein contre le pointillé de l'invitation, exactement comme une
    // bouche inscrite contre la fiche d'ajout.
    <div
      data-sheet-section=""
      className="space-y-4 rounded-card border border-line-strong bg-paper p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {/* SON NOM EN TÊTE, comme une personne inscrite: c'est ce qui dit « ici
            commence un objet », et ce qui permet de le reconnaître plus tard.
            Tant qu'il n'est pas nommé, le titre générique tient la place. */}
        <span className="min-w-0 text-sm font-semibold text-ink">
          {shaker.label.trim() || t(voiced("household.mouth.shaker_title", voice), { who })}
        </span>
        {/* ⚠️ « RETIRER » EST EN TÊTE, PAS AU FOND. Au fond d'un bloc de six
            champs, il se lisait comme le geste de la SECTION entière. */}
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
          {t("household.mouth.shaker_remove")}
        </Button>
      </div>

      <Field
        label={t(voiced("household.mouth.shaker_label", voice), { who })}
        hint={t(voiced("household.mouth.shaker_label_hint", voice), { who })}
        htmlFor="mouth-shaker-label"
      >
        <input
          id="mouth-shaker-label"
          type="text"
          maxLength={60}
          value={shaker.label}
          onChange={(e) => set({ label: e.target.value })}
          className={inputClass}
        />
      </Field>

      {/* ── ⛔ CHAQUE NOMBRE PORTE SON ÉTIQUETTE, ET PAS UN `placeholder` ────
          Le placeholder disparaît à la première frappe. Trois cases de chiffres
          côte à côte SANS étiquette, c'est un tableau qu'on ne peut plus relire
          — et une protéine saisie dans la case des calories est une donnée
          fausse qui entre ensuite dans un calcul d'énergie avec l'autorité
          d'une mesure. L'`aria-label` seul ne réparait rien: il ne se VOIT
          pas. */}
      <div className="grid gap-4 sm:grid-cols-3">
        {numbers.map((n) => (
          <Field key={n.id} label={n.label} htmlFor={n.id}>
            <input
              id={n.id}
              type="number"
              inputMode="decimal"
              min={n.min}
              value={n.value}
              onChange={(e) => n.onValue(e.target.value)}
              className={`${inputClass} min-w-0`}
            />
          </Field>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          À QUEL MOMENT — le champ qui manquait depuis toujours (2026-09-01)
          ══════════════════════════════════════════════════════════════════

          ⛔ `ShakerDraft.slot` EXISTAIT DÉJÀ ET N'ÉTAIT RENDU NULLE PART. Le
          champ partait donc en base avec sa valeur d'origine — `""`, « hors
          moment nommé » — sans que personne ait jamais pu la choisir. Ce n'est
          pas un déplacement de contrôle, c'est un contrôle qui manquait.

          ⚠️ LES SIX MOMENTS SONT OFFERTS, PAS SEULEMENT LES COCHÉS. Restreindre
          rendrait le cas fondateur inexprimable: « je mange midi et soir, et
          j'ai un shaker l'après-midi ». L'après-midi n'est pas dans sa liste —
          c'est justement pour ça qu'on le choisit, et c'est ce qui l'ajoutera.

          ⛔ ET L'AJOUT SE DIT AVANT LE CLIC, jamais après. Un moment qui
          apparaîtrait coché plus haut sans un mot serait une écriture que
          personne n'a demandée; la phrase sous le champ dit ce que le choix
          va faire. */}
      <Field
        label={t(voiced("household.mouth.shaker_at", voice), { who })}
        htmlFor="mouth-shaker-slot"
      >
        <select
          id="mouth-shaker-slot"
          value={shaker.slot}
          disabled={busy}
          onChange={(e) => onSlot(e.target.value)}
          className={inputClass}
        >
          {/* `""` EST UNE RÉPONSE, pas un vide: « il ne tombe sur aucun de mes
              moments ». C'est la valeur d'origine, et elle reste atteignable. */}
          <option value="">{t("household.mouth.shaker_at_loose")}</option>
          {/* ══════════════════════════════════════════════════════════════
              ⛔ LES OPTIONS PORTENT LE NOM DU MOMENT, ET RIEN D'AUTRE.
              ══════════════════════════════════════════════════════════════

              Deux rédactions ont essayé d'annoncer l'ajout ICI, et les deux
              ont échoué pour des raisons opposées:

                ① une phrase sous le champ (« ce moment n'est pas coché plus
                  haut ») — INATTEIGNABLE: `onSlot` ajoute le moment au rythme
                  dans le MÊME `set()` que le slot, donc au rendu suivant la
                  condition était déjà fausse. Mesuré au navigateur avec un
                  `MutationObserver`: zéro occurrence, pas même une image.
                ② une marque « — à ajouter » sur chaque option non cochée —
                  ATTEIGNABLE mais ILLISIBLE: le cas courant est `rhythm:
                  null` (« comme la maison »), où AUCUN moment n'est coché. Les
                  six options portaient donc la marque, et une marque que tout
                  le monde porte ne distingue plus rien. Vu à l'écran le
                  2026-09-01, capture à l'appui.

              ⚠️ L'AJOUT N'EST PAS MUET POUR AUTANT, et c'est ce qui autorise à
              se taire ici: la case se coche dans la section juste au-dessus, à
              l'écran, dans le même geste. La conséquence est VISIBLE — elle
              n'a pas besoin d'être aussi annoncée. */}
          {EATING_OCCASIONS.map((slot) => (
            <option key={slot} value={slot}>
              {mealCopy(`meals.slot.${slot}` as "meals.slot.breakfast")}
            </option>
          ))}
        </select>
      </Field>

      <p className="text-xs leading-5 text-ink-soft">
        {t("household.mouth.shaker_label_source")}
      </p>

      {/* ⛔ L'AVERTISSEMENT AMBRE A ÉTÉ RETIRÉ LE 2026-08-19. Il disait « il
          faut un nom et les trois nombres, sinon la ligne est jetée sans un
          mot » — au-dessus d'une ligne d'état qui dit déjà, sous le bouton,
          exactement où en est cette déclaration. Deux phrases pour le même
          fait, dont une en ambre: on lisait un refus là où il n'y en a pas. */}
      {!complete ? null : (
        // ── COMPLET: ON RELIT CE QUI PARTIRA ───────────────────────────────
        // ⚠️ CE RÉCAPITULATIF EST LA SECONDE MOITIÉ DES ÉTIQUETTES. Il rejoue
        // les trois nombres AVEC leur unité, dans une phrase: c'est ce qui
        // permet d'attraper une protéine tapée dans la case des calories, que
        // trois champs remplis ne montrent pas.
        <p className="rounded-card border border-line-strong bg-paper-2 p-3 text-xs leading-5 text-ink">
          {t("household.mouth.shaker_summary", {
            grams: shaker.servingGrams,
            protein: shaker.proteinGPerServing,
            kcal: shaker.energyKcalPerServing,
          })}
        </p>
      )}

      {/* ── SON PROPRE BOUTON D'ENREGISTREMENT ─────────────────────────────
          ⚠️ IL S'ACTIVE DÈS QU'IL Y A UN NOM ET **UNE** DES TROIS MESURES, et
          c'est la règle demandée: « ça enregistre peu importe si tout est
          complété, il faut au moins une des 3 mesures ».

          ⛔ MAIS UNE DÉCLARATION INCOMPLÈTE N'EST PAS COMPTÉE, ET L'ÉCRAN NE
          PEUT PAS LE TAIRE. `parseFixedIntakes` est TOUT-OU-RIEN sur les trois
          nombres — « une déclaration à moitié lisible n'est pas une
          déclaration […] ferait perdre la protéine en silence ». Un shaker
          enregistré avec le seul grammage est donc gardé sur la fiche et JETÉ
          par le moteur. On enregistre quand même (c'est la demande), et la
          phrase juste en dessous dit dans quel état il est: gardé, ou compté.
          Un bouton qui dit « enregistré » sur une ligne que la composition
          ignore serait le mensonge que ce dépôt passe son temps à fermer. */}
      {/* ⛔ PAS DE BOUTON QUAND IL N'Y A PAS DE LIGNE OÙ ÉCRIRE, et les champs
          restent quand même. Un bouton « Enregistrer » sur la fiche d'ajout
          échouerait à tous les coups — la ligne membre n'existe qu'après
          « Ajouter à la table ». C'est la phrase d'état, plus bas, qui dit
          alors où part la déclaration. */}
      {onSave !== null ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !shakerCanBeSaved(shaker)}
            // ⛔ LES DEUX, ET DANS LE MÊME GESTE. Le moment choisi ici a pu
            // AJOUTER une case au rythme; sans ce second argument, le shaker
            // partait en base et la case restait dans le brouillon.
            onClick={() => onSave(shaker, rhythm)}
          >
            {t("household.mouth.shaker_save")}
          </Button>
        </div>
      ) : null}
      {/* ── OÙ EN EST CETTE DÉCLARATION, ET LES DEUX COLONNES NE MENTENT PAS
          L'UNE POUR L'AUTRE ────────────────────────────────────────────────
          ⚠️ « Compté » EST UN FAIT SUR LA BASE, pas sur le brouillon. Le dire
          sans bouton d'écriture serait annoncer qu'une chose est en base au
          moment précis où elle ne l'est pas — le mensonge que ce dépôt passe
          son temps à fermer. Sans port immédiat, une déclaration complète dit
          donc PAR OÙ elle partira, pas qu'elle est arrivée.

          Les deux autres crans, eux, parlent de la DÉCLARATION elle-même
          (« il manque une mesure », « gardé mais pas compté »): ils sont vrais
          des deux côtés, et ils ne bougent pas. */}
      <p className="text-xs leading-5 text-ink-soft">
        {!shakerCanBeSaved(shaker)
          ? t("household.mouth.shaker_needs_one")
          : !complete
          ? t("household.mouth.shaker_kept_not_counted")
          : onSave === null
          ? t("household.mouth.shaker_with_the_card")
          : t("household.mouth.shaker_counted")}
      </p>
    </div>
  );
}

/** Les aliments refusés par DÉGOÛT — texte libre, une ligne par aliment. */
function DislikeFields(
  { dislikes, onChange }: {
    dislikes: readonly string[];
    onChange: (next: readonly string[]) => void;
  },
) {
  const [entry, setEntry] = React.useState("");
  return (
    // ⛔ NI LIBELLÉ NI AIDE ICI — LA SECTION LES PORTE DÉJÀ (2026-08-20).
    // Le bloc disait la même chose TROIS FOIS: « Ce que tu n'aimes pas » en
    // titre, « un dégoût, pas une allergie » en aide de section, puis
    // « Aliments refusés » en libellé de champ et la MÊME phrase sur
    // l'allergie en aide de champ. Jugé: « cette section est verbeuse, pas du
    // tout optimisée ».
    //
    // ⚠️ LE CONTRÔLE RESTE NOMMÉ: `aria-label` sur l'input, plus bas. Retirer
    // le `<label>` sans rien mettre laisserait un champ anonyme.
    <div>
      {dislikes.length > 0 ? (
        // `break-words` PARCE QUE C'EST DU TEXTE D'UTILISATEUR: rien ne
        // garantit une espace, et un mot de 39 signes pousse la PAGE ENTIÈRE à
        // défiler horizontalement dans un cadre de 320 px.
        <ul className="mb-2 flex flex-wrap gap-2 break-words">
          {dislikes.map((d) => (
            <li key={d}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onChange(dislikes.filter((x) => x !== d))}
              >
                {d} ×
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <input
          id="mouth-dislike"
          aria-label={t("household.mouth.dislikes")}
          type="text"
          maxLength={120}
          value={entry}
          placeholder={t("household.mouth.dislikes_placeholder")}
          onChange={(e) => setEntry(e.target.value)}
          className={`${inputClass} flex-1`}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={entry.trim() === ""}
          onClick={() => {
            const label = entry.trim();
            if (label === "" || dislikes.includes(label)) return;
            onChange([...dislikes, label]);
            setEntry("");
          }}
        >
          {t("setup.people.allergies_add")}
        </Button>
      </div>
    </div>
  );
}
