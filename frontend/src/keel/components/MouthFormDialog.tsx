import React from "react";

import Modal from "./ui/Modal";
import { Button } from "./ui/Button";
import { Field, inputClass } from "./ui/Field";
import { SectionLabel } from "./ui/Card";
import { allergenLabel, ALLERGEN_OPTIONS } from "../copy/allergens";
import { type MessageKey, t } from "../i18n/t";
import { uiLocale } from "../i18n/runtime";
import { MEMBER_GENDERS, MEMBER_GOALS } from "../api/household";
import type { MemberGender, MemberGoal } from "../api/household";
import { DIET_ANSWERS } from "../api/onboarding";
import {
  EATING_OCCASIONS,
  type EatingOccasion,
  type EatingOccasionSlot,
} from "../api/mealGeneration";
import { mealCopy } from "../api/mealLabels";
import { type MouthVoice, voiced, whoOf } from "../lib/mouthVoice";
import {
  ARRIVAL_HORIZON_COPY,
  TARGET_WEIGHT_HINT_COPY,
} from "../lib/arrivalHorizon";
import {
  activityIsRequired,
  ageStateOfDraft,
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
} from "../lib/mouthForm";
import {
  ACTIVITY_LEVELS,
  APPETITE_LEVELS,
  DAY_ACTIVITY_LEVELS,
  SPORT_FREQUENCIES,
} from "../../../../supabase/functions/_shared/keel/tokens.ts";
import type {
  ActivityLevel,
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
// ── ⚠️ ET UN MINEUR PORTE LES SIX BLOCS, COMME LES AUTRES ────────────────
// Renversement du 2026-08-18. Aucun bloc n'est masqué pour lui: la liste
// d'objectifs est la même (`goalsForAge` rend `MEMBER_GOALS` des deux côtés),
// et ce qui le protège n'est pas à l'écran — l'énergie d'un mineur reste une
// maintenance calculée sur son âge, le plafond de son rythme se calcule sur son
// besoin, et son corps n'est jamais ÉNONCÉ. Le SEUL écart visible ici est le
// poids visé, que `targetWeightRefusal` laisse passer sans plancher adulte
// parce que sa garde est ailleurs.
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
   */
  onSaveShaker: ((shaker: ShakerDraft) => void) | null;
  /**
   * CET ÉCRAN SAIT-IL ÉCRIRE SUR UNE LIGNE DE FOYER ? REQUIS, jamais `?`.
   *
   * ⚠️ CE N'EST PAS UN GOÛT DE MISE EN PAGE, C'EST LA CARTE DES ÉCRIVAINS.
   * Trois des blocs de cette fenêtre sont clés sur un `member_id`: les
   * habitudes (`household_member_habits`), les dégoûts
   * (`household_food_restrictions`) et le régime
   * (`keel_household_set_member_diet`). Un compte SOLO n'a pas de foyer, donc
   * pas de ligne membre: ces trois-là n'auraient nulle part où aller.
   *
   * `false` les retire. Ce qui reste — les allergies
   * (`student_safety_constraints`, clé `user_id`) et le shaker
   * (`fixed_intakes`, clé `user_id`) — s'écrit sans ligne de foyer.
   *
   * ⛔ NE PAS LE RENDRE OPTIONNEL avec un défaut `true`: un appelant qui
   * l'oublie montrerait alors trois contrôles qui échouent à tous les coups —
   * « pire qu'un contrôle absent, parce qu'il promet ». Un paramètre de garde
   * facultatif est une garde désarmée.
   */
  memberScoped: boolean;
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
    <div className="rounded-card border border-line-strong bg-paper p-4">
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

function goalLabel(goal: MemberGoal): string {
  return t(`household.goal.${goal}` as "household.goal.fat_loss");
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
function blockList(labels: readonly string[]): string {
  return new Intl.ListFormat(uiLocale() === "fr" ? "fr-FR" : "en-GB", {
    style: "long",
    type: "conjunction",
  }).format(labels as string[]);
}

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

/** Ce que les cinq questions du 2026-08-20 valent, pour une bouche. */
export interface MouthActivityAndStructure {
  dayActivity: DayActivityLevel | "";
  sportFrequency: SportFrequency | "";
  takesDessert: boolean | null;
  takesCheese: boolean | null;
  takesBread: boolean | null;
  /** ⑤ (2026-08-20). `""` = pas répondu ⇒ ×1,00, un neutre VRAI. */
  appetite: AppetiteLevel | "";
}

/** Une question à trois états, rendue par deux boutons radio et rien d'autre. */
function YesNo(
  { name, value, onChange }: {
    name: string;
    value: boolean | null;
    onChange: (next: boolean) => void;
  },
): React.ReactElement {
  return (
    <div className="flex items-center gap-4" role="radiogroup" aria-label={name}>
      {[true, false].map((v) => (
        <label key={String(v)} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input
            type="radio"
            name={name}
            value={v ? "yes" : "no"}
            checked={value === v}
            onChange={() => onChange(v)}
          />
          <span>{t(v ? "household.mouth.answer_yes" : "household.mouth.answer_no")}</span>
        </label>
      ))}
    </div>
  );
}

export function MouthActivityAxesFields(
  { value, onChange, voice, who }: {
    value: MouthActivityAndStructure;
    onChange: (patch: Partial<MouthActivityAndStructure>) => void;
    voice: MouthVoice;
    who: string;
  },
): React.ReactElement {
  return (
    <>
      {/* ── ② LA JOURNÉE ──────────────────────────────────────────────── */}
      <Field
        label={t(voiced("household.mouth.day_activity", voice), { who })}
        hint={t("household.mouth.day_activity_hint")}
      >
        <div
          className="flex flex-col gap-2"
          role="radiogroup"
          aria-label={t(voiced("household.mouth.day_activity", voice), { who })}
        >
          {DAY_ACTIVITY_LEVELS.map((level) => (
            <label
              key={level}
              className="flex cursor-pointer items-center gap-3 rounded-card border border-line-strong bg-paper px-3 py-2.5 text-sm text-ink"
            >
              <input
                type="radio"
                name="mouth-day-activity"
                value={level}
                checked={value.dayActivity === level}
                onChange={() => onChange({ dayActivity: level })}
              />
              <span>
                {t(
                  `household.mouth.day_activity_${level}` as "household.mouth.day_activity_seated",
                )}
              </span>
            </label>
          ))}
        </div>
      </Field>

      {/* ── ② LE SPORT ────────────────────────────────────────────────── */}
      <Field
        label={t(voiced("household.mouth.sport", voice), { who })}
        hint={t("household.mouth.sport_hint")}
      >
        <div
          className="flex flex-col gap-2"
          role="radiogroup"
          aria-label={t(voiced("household.mouth.sport", voice), { who })}
        >
          {SPORT_FREQUENCIES.map((freq) => (
            <label
              key={freq}
              className="flex cursor-pointer items-center gap-3 rounded-card border border-line-strong bg-paper px-3 py-2.5 text-sm text-ink"
            >
              <input
                type="radio"
                name="mouth-sport-frequency"
                value={freq}
                checked={value.sportFrequency === freq}
                onChange={() => onChange({ sportFrequency: freq })}
              />
              <span>
                {t(`household.mouth.sport_${freq}` as "household.mouth.sport_none")}
              </span>
            </label>
          ))}
        </div>
      </Field>
    </>
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
      <Field
        label={t(voiced("household.mouth.appetite", voice), { who })}
        hint={t("household.mouth.appetite_hint")}
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
      </Field>

    </>
  );
}

/**
 * ① CE QU'IL Y A D'AUTRE DANS L'ASSIETTE — UN COMPOSANT À PART, ET EN SURSIS.
 *
 * ⛔ SÉPARÉ DE L'APPÉTIT LE 2026-08-20 (soir), SUR DEMANDE DU PROPRIÉTAIRE, ET
 * CE N'EST PAS UN RANGEMENT: c'est un aveu écrit dans la structure du fichier.
 * L'appétit est une propriété de la PERSONNE — de quel côté de l'incertitude de
 * Mifflin-St Jeor elle tombe — et il est stable. Ces trois questions-ci sont une
 * propriété du REPAS: le déjeuner de quelqu'un (une salade froide) et son dîner
 * n'ont pas le même pain, pas le même fromage, pas le même dessert.
 *
 * Les poser UNE FOIS pour la personne force un seul nombre sur deux repas
 * différents — la MÊME faute que les quatre crans d'activité (une réponse pour
 * deux axes) et que `COMPOSED_DISH_MEAL_SHARE` lui-même (une moyenne pour tout
 * le monde). C'est la troisième occurrence du même défaut dans ce chantier.
 *
 * ⚠️ ELLES ATTENDENT UNE DÉCISION, ET ELLES SONT EN BAS DE FENÊTRE POUR ÇA. La
 * forme visée est une question PAR MOMENT, dans le bloc des habitudes
 * (`household_member_habits` est déjà clavetée `(member_id, slot)` et atteint
 * déjà le prompt). Ne pas les consolider ici en attendant — et surtout ne pas
 * les remonter: leur place actuelle dit qu'elles sont provisoires.
 */
export function MouthMealComponentsFields(
  { value, onChange, voice, who }: {
    value: MouthActivityAndStructure;
    onChange: (patch: Partial<MouthActivityAndStructure>) => void;
    voice: MouthVoice;
    who: string;
  },
): React.ReactElement {
  return (
      <Field
        label={t(voiced("household.mouth.meal_structure", voice), { who })}
        hint={t("household.mouth.meal_structure_hint")}
      >
        <div className="flex flex-col gap-2">
          {([
            ["takesDessert", "household.mouth.takes_dessert"],
            ["takesCheese", "household.mouth.takes_cheese"],
            ["takesBread", "household.mouth.takes_bread"],
          ] as const).map(([key, label]) => (
            <div
              key={key}
              className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line-strong bg-paper px-3 py-2.5 text-sm text-ink"
            >
              <span>{t(label)}</span>
              <YesNo
                name={key}
                value={value[key]}
                onChange={(next) => onChange({ [key]: next } as Partial<MouthActivityAndStructure>)}
              />
            </div>
          ))}
        </div>
      </Field>
  );
}

export function MouthCoreFields(
  props: MouthCoreFieldsProps,
): React.ReactElement {
  // LA VOIX, ET CE QUE `{who}` VAUT — voir `lib/mouthVoice.ts`.
  const voice: MouthVoice = props.subject.isSelf ? "self" : "other";
  const who = whoOf(props.draft.firstName, t("household.mouth.who_fallback"));
  const { draft, onChange, subject, todayLocalIso } = props;
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
        <p className="text-sm leading-6 text-ink-soft">
          {t("household.mouth.intro")}
        </p>

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
          <div className="grid gap-3 sm:grid-cols-3">
            {/* Bornes de `keel_household_set_member_body` (30–260 cm, 2–400 kg)
                et pas celles de `profiles`: une bouche peut être un enfant de
                trois ans, que les bornes adultes refuseraient. */}
            <input
              id="mouth-height"
              type="number"
              inputMode="numeric"
              min={30}
              max={260}
              placeholder={t("setup.people.height")}
              aria-label={t("setup.people.height")}
              value={draft.heightCm}
              onChange={(e) => set({ heightCm: e.target.value })}
              className={`${inputClass} min-w-0`}
            />
            <input
              id="mouth-weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={2}
              max={400}
              placeholder={t("setup.people.weight")}
              aria-label={t("setup.people.weight")}
              value={draft.weightKg}
              onChange={(e) => set({ weightKg: e.target.value })}
              className={`${inputClass} min-w-0`}
            />
            <select
              id="mouth-gender"
              aria-label={t("setup.people.gender")}
              value={draft.gender}
              onChange={(e) =>
                set({ gender: e.target.value as MemberGender | "" })}
              className={`${inputClass} min-w-0`}
            >
              <option value="">{t("setup.people.gender")}</option>
              {MEMBER_GENDERS.map((g) => (
                <option key={g} value={g}>
                  {t(
                    `household.body.gender_${g}` as "household.body.gender_female",
                  )}
                </option>
              ))}
            </select>
          </div>

          {/* ── LE NIVEAU D'ACTIVITÉ — le champ neuf ────────────────────────
              `energy_target.ts` servait une fourchette de 28 à 33 kcal/kg parce
              que « rien ne collecte le niveau d'activité », et multiplier un
              métabolisme de base par une constante devinée « produit une cible
              fausse avec l'aplomb d'un tableau ».

              ⛔ QUATRE CRANS ET PAS CINQ: aucun « je ne sais pas ». `null` (ne
              pas répondre) est déjà cette réponse, et il vit dans la colonne;
              un cinquième bouton en ferait une réponse cochée, c'est-à-dire un
              fait que personne n'a dit.

              ⛔ ET JAMAIS UN NOMBRE. Un nombre demandé est un nombre inventé, et
              l'inventé entre ensuite dans un calcul avec l'autorité d'une
              mesure.

              ── ⚠️ RÉCLAMÉ SEULEMENT SOUS UNE DIRECTION QUI BOUGE ────────────
              Décision du 2026-08-18. Le champ reste MONTRÉ à tout le monde —
              « facultatif » n'est pas « absent », et quelqu'un qui maintient
              peut très bien répondre —, mais il ne retient le bouton que si la
              balance doit bouger. La décision vit dans `activityIsRequired`, et
              elle est rendue ICI par `aria-required`: sans cet attribut, la
              seule trace de la règle serait la ligne « il manque… », c'est-à-dire
              une différence qu'on ne voit qu'APRÈS avoir essayé de sortir.

              ⚠️ ET LE BLOCAGE SUIT PAR LE MÊME CHEMIN: `missingRequiredBlocks`
              lit `activityIsRequired`, `submitIsHeld` lit `missingRequired
              Blocks`, et le bouton lit `submitIsHeld`. Un `aria-required` qui
              dirait « facultatif » au-dessus d'un bouton qui retient quand même
              serait une garde désarmée doublée d'un mensonge. */}
          <Field
            label={t(voiced("household.mouth.activity", voice), { who })}
            hint={t("household.mouth.activity_hint")}
          >
            <div
              className="flex flex-col gap-2"
              role="radiogroup"
              aria-label={t(voiced("household.mouth.activity", voice), { who })}
              aria-required={activityIsRequired(draft.goal)}
            >
              {ACTIVITY_LEVELS.map((level) => (
                <label
                  key={level}
                  className="flex cursor-pointer items-center gap-3 rounded-card border border-line-strong bg-paper px-3 py-2.5 text-sm text-ink"
                >
                  <input
                    type="radio"
                    name="mouth-activity"
                    value={level}
                    checked={draft.activityLevel === level}
                    onChange={() =>
                      set({ activityLevel: level as ActivityLevel })}
                  />
                  <span>
                    {t(
                      `household.mouth.activity_${level}` as "household.mouth.activity_sedentary",
                    )}
                  </span>
                </label>
              ))}
            </div>
          </Field>

          {/* ── ② LES DEUX AXES, DANS LE BLOC DU CORPS ────────────────────
              Ils y sont parce qu'ils sont la TROISIÈME ENTRÉE DE LA MÊME
              ÉQUATION: le corps dit combien on pèse, l'activité dit ce qu'on en
              fait, et `meal_envelope.ts` multiplie les deux. Les ranger dans
              les préférences en ferait une option, alors que l'écart entre les
              deux extrêmes du croisement est de ~47 % de l'enveloppe.

              ⛔ ① ET ⑤ NE SONT PLUS ICI (2026-08-20, soir). Ils décrivent une
              habitude de table, pas un corps: ils vivent dans la fenêtre des
              préférences (`MouthEatingHabitsFields`). */}
          <MouthActivityAxesFields
            voice={voice}
            who={who}
            value={{
              dayActivity: draft.dayActivity,
              sportFrequency: draft.sportFrequency,
              takesDessert: draft.takesDessert,
              takesCheese: draft.takesCheese,
              takesBread: draft.takesBread,
              appetite: draft.appetite,
            }}
            onChange={(patch) => set(patch)}
          />
        </RequiredBlock>

        {/* ── BLOC 3 · LA DIRECTION — ET SES DEUX CHAMPS DÉPLIABLES ─────── */}
        <RequiredBlock
          title={t("household.mouth.direction")}
          hint={t("household.mouth.direction_hint")}
        >
          {/* TROIS CHOIX, PAS SIX. L'axe qui fait bifurquer un plan est la
              DIRECTION DE LA BALANCE: descend, monte, ne bouge pas. La liste
              vient de `GOAL_TOKENS` par `MEMBER_GOALS` — une seule liste, trois
              lecteurs, et un test la confronte au CHECK de la base. */}
          <div className="flex flex-col gap-2" role="radiogroup" aria-label={t("household.mouth.direction")}>
            {MEMBER_GOALS.map((g) => (
              <label
                key={g}
                className="flex cursor-pointer items-center gap-3 rounded-card border border-line-strong bg-paper px-3 py-2.5 text-sm text-ink"
              >
                <input
                  type="radio"
                  name="mouth-goal"
                  value={g}
                  checked={draft.goal === g}
                  onChange={() =>
                    // CHANGER DE DIRECTION VIDE LA CIBLE ET LE RYTHME. Les deux
                    // n'ont de sens que sous la direction qui les a produits, et
                    // `household_members_target_needs_direction_check` refuse
                    // une cible sur `maintenance`. Les garder en mémoire les
                    // ferait repartir au prochain basculement, vers une
                    // violation de contrainte.
                    set({ goal: g, targetWeightKg: "", paceKgPerWeek: "" })}
                />
                <span>{goalLabel(g)}</span>
              </label>
            ))}
          </div>

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
   * LES MOMENTS SUR LESQUELS ON INTERROGE — LE BROUILLON D'ABORD.
   *
   * `props.slots` porte la cascade LUE (les siens, sinon la maison, sinon les
   * six). Dès que la personne coche quelque chose au-dessus, c'est SON choix
   * en cours qui commande: une question et son effet doivent tenir dans le même
   * geste, sinon la case cochée n'a l'air de rien faire.
   */
  // ⛔ `[]` COMPTE COMME `null`, ET C'EST UN DÉFAUT MESURÉ DANS L'UI ────────
  // Le titulaire n'avait AUCUNE ligne « ce qu'il mange déjà », là où une bouche
  // en avait six. Constaté au navigateur le 2026-08-19 sur un onboarding
  // complet, et l'utilisateur l'avait vu avant moi: « je comprends pas pourquoi
  // c'est pas pareil que le maître à ce niveau-là ».
  //
  // La cause: son brouillon est semé depuis `plan.eatingRhythm`, qui vaut un
  // TABLEAU VIDE tant que la maison n'a rien déclaré — pas `null`. Le filtre
  // rendait donc « zéro moment déclaré » au lieu de « rien de déclaré », et la
  // section se vidait entièrement. Une bouche, elle, part de `null` et tombait
  // sur le repli.
  //
  // Les deux disent la même chose et doivent se lire pareil: `habitSlotsFor`
  // fait déjà cette égalité côté cascade lue, elle manquait ici.
  const declaredSlots: readonly EatingOccasion[] =
    draft.rhythm === null || draft.rhythm.length === 0
      ? props.slots
      : EATING_OCCASIONS.filter((s) => draft.rhythm!.some((r) => r.slot === s));
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
        <Field label={t(voiced("household.mouth.diet", voice), { who })} htmlFor="mouth-diet">
          <select
            id="mouth-diet"
            value={draft.diet}
            onChange={(e) => set({ diet: e.target.value })}
            className={inputClass}
          >
            <option value="">{t("household.mouth.diet_unset")}</option>
            {DIET_ANSWERS.map((d) => (
              <option key={d} value={d}>
                {t(`setup.people.diet_${d}` as "setup.people.diet_omnivore")}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      {/* ── ⑤ L'APPÉTIT, ET LUI SEUL ──────────────────────────────────
          ⛔ JUSTE SOUS « COMMENT {who} MANGE » — LA SECTION DU RÉGIME, ET
          C'EST UNE DEMANDE EXPLICITE DU PROPRIÉTAIRE (2026-08-20). Elles y sont
          parce que c'est la MÊME question sous trois angles: ce qu'elle
          s'interdit (le régime), de quel côté de la formule elle tombe
          (l'appétit). Les poser en tête de fenêtre — ou plus bas, sous les
          habitudes par moment — les séparait de ce qu'elles précisent.

          ⛔ ① N'EST PLUS ICI: elle est descendue TOUT EN BAS, dans son propre
          bloc, parce qu'elle attend une décision de forme (par personne ou par
          moment). Voir `MouthMealComponentsFields`.

          ⚠️ POSÉES DEUX FOIS AU MAUVAIS ENDROIT AVANT D'ARRIVER ICI: en tête de
          fenêtre, puis sous le bloc des habitudes. « Comment {who} mange » est
          le titre de la section du RÉGIME, pas de celle des habitudes — les
          deux se lisent pareil dans un fichier et pas du tout à l'écran.

          ⚠️ ELLES ONT BESOIN D'UN CORPS POUR AGIR, et c'est pour ça qu'elles ne
          bloquent rien: sans taille/poids/sexe, `mouthTargetKcal` rend
          `no_body`, le facteur vaut 1, et ni l'une ni l'autre n'a le moindre
          effet. Les exiger ici ferait un mur devant deux champs qui, eux, sont
          exigés ailleurs.

      */}
      <MouthAppetiteFields
        voice={voice}
        who={who}
        value={{
          dayActivity: draft.dayActivity,
          sportFrequency: draft.sportFrequency,
          takesDessert: draft.takesDessert,
          takesCheese: draft.takesCheese,
          takesBread: draft.takesBread,
          appetite: draft.appetite,
        }}
        onChange={(patch) => set(patch)}
      />

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
      {props.memberScoped ? (
        <Section
          title={t(voiced("household.mouth.tastes", voice), { who })}
          hint={t(voiced("household.mouth.tastes_hint", voice), { who })}
        >
          <DislikeFields
            dislikes={draft.dislikes}
            onChange={(next) => set({ dislikes: next })}
          />
        </Section>
      ) : null}

      {/* ── 4 · COMBIEN DE FOIS ELLE MANGE, ET QUAND ────────────────────────
          ⚠️ CETTE QUESTION VIVAIT À L'ÉTAPE 3, DEUX ÉCRANS PLUS LOIN, et c'est
          ce qui rendait la section du dessous absurde: on demandait ce que
          quelqu'un mange à six moments sans lui avoir demandé combien de fois
          il mange. Déplacée ici le 2026-08-19, JUSTE AU-DESSUS de ce qu'elle
          dimensionne — la même règle que le poids visé sous la direction qui
          le débloque.

          ⛔ NE RIEN COCHER N'EST PAS « ELLE NE MANGE JAMAIS ». C'est « comme la
          maison » (`null`), le repli documenté de la ligne membre, et la base
          refuse de toute façon un tableau vide (`empty_rhythm`). La phrase sous
          la liste le DIT, sinon une rangée décochée se lit comme un oubli. */}
      {props.memberScoped ? (
        <Section
          title={t(voiced("household.mouth.rhythm", voice), { who })}
          hint={t(voiced("household.mouth.rhythm_hint", voice), { who })}
        >
          <ul className="space-y-2">
            {EATING_OCCASIONS.map((slot) => {
              const on = (draft.rhythm ?? []).some((r) => r.slot === slot);
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
                      disabled={props.busy}
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
                </li>
              );
            })}
          </ul>
          {draft.rhythm === null ? (
            <p className="text-xs leading-5 text-ink-soft">
              {t(voiced("household.mouth.rhythm_house", voice), { who })}
            </p>
          ) : null}
        </Section>
      ) : null}

      {/* ── 5 · CE QU'ELLE MANGE DÉJÀ, SUR LES MOMENTS QUI EXISTENT ──────────
          ⚠️ `props.slots`, JAMAIS `EATING_OCCASIONS`. Voir la note du champ:
          les six créneaux en dur demandaient à quelqu'un ce qu'il mange à des
          moments dont il venait de dire qu'ils n'existent pas.

          ⚠️ LES LIGNES PAR MOMENT VIVENT SUR `household_member_habits`, clé
          `member_id`. Un compte solo n'a pas de ligne de foyer: les montrer
          chez lui promettrait une saisie qui n'irait nulle part. Le shaker, lui,
          reste — il est clé sur `user_id`.

          UNE HABITUDE DIT UNE TENDANCE QUE LA COMPOSITION CONTOURNE, pas une
          quantité qui remplace un repas. On ne demande donc NI quantité NI
          aliment résolu: « une pomme » n'a ni l'un ni l'autre, et lui en
          inventer écrirait un fait que personne n'a pesé. Le cas qui a ouvert
          le chantier: sept matins d'œufs brouillés servis à une femme qui mange
          une pomme — personne ne le lui avait demandé. */}
      <Section
        title={t(voiced("household.mouth.habits", voice), { who })}
        hint={t(voiced("household.mouth.habits_hint", voice), { who })}
      >
        {/* ⚠️ LE BROUILLON GAGNE SUR LA BASE, ET C'EST TOUT L'INTÉRÊT DU
            DÉPLACEMENT: on décoche « milieu de matinée » juste au-dessus, la
            ligne disparaît ici DANS LE MÊME GESTE. `props.slots` reste le repli
            pour qui n'a rien dit (la cascade du moteur — voir `habitSlotsFor`).
            Sans cette priorité, la question du dessus n'aurait aucun effet
            visible avant un aller-retour en base. */}
        {/* ── LES LIGNES ONT LEUR PROPRE RESPIRATION ────────────────────────
            ⚠️ MESURÉ DEUX FOIS SUR CAPTURE, LE 2026-08-19: « trop serré entre
            la zone de texte et les plages ». Elles héritaient de l'espacement
            de la SECTION (20 px) — le même qui sépare deux blocs entiers. Or
            ici l'étiquette du moment SUIVANT arrive 20 px sous un champ de
            44 px de haut, et 8 px seulement au-dessus du sien: l'œil groupe
            par proximité, donc chaque étiquette se lisait comme la légende du
            champ du DESSUS, et les six lignes formaient un pavé au lieu de six
            questions.

            ⛔ CE N'EST PAS L'ESPACEMENT DE LA SECTION QU'IL FAUT MONTER: il
            sert aussi à séparer cette liste du bloc « shaker » en dessous, et
            l'augmenter partout ferait dériver toutes les autres sections. La
            liste prend donc son propre conteneur, à 32 px — soit QUATRE fois
            l'écart étiquette↔champ (8 px). C'est le rapport qui décide de la
            lecture, pas la valeur absolue: en dessous de 3:1 sur un champ de
            46 px de haut, l'étiquette se rattache au champ du dessus.

            ⛔ ET `mb-0` EST PARTI DES `Field`: il ne servait à rien (`Field`
            n'a pas de marge basse par défaut) et il faisait croire, en
            relecture, que l'espacement se réglait là. */}
        <div className="space-y-8">
        {(props.memberScoped ? declaredSlots : []).map((slot) => (
          <Field
            key={slot}
            label={mealCopy(`meals.slot.${slot}` as "meals.slot.breakfast")}
            htmlFor={`mouth-habit-${slot}`}
          >
            <input
              id={`mouth-habit-${slot}`}
              type="text"
              maxLength={120}
              // ⚠️ UN EXEMPLE PAR MOMENT. Le `Record` complet de
              // `HABIT_PLACEHOLDERS` refuse de compiler si un septième moment
              // arrivait sans le sien — la même garde que `ACTIVITY_KEYS`.
              placeholder={t(HABIT_PLACEHOLDERS[slot])}
              value={draft.habits[slot] ?? ""}
              onChange={(e) =>
                set({ habits: { ...draft.habits, [slot]: e.target.value } })}
              className={inputClass}
            />
          </Field>
        ))}
        </div>


        {/* ── LE SHAKER ────────────────────────────────────────────────────
            ⚠️ IL N'EXISTE QUE POUR UNE BOUCHE QUI A UN COMPTE, et ce n'est
            pas un oubli: `fixed_intakes` vit dans
            `student_goals.practical_constraints`, donc sur `user_id`, et la
            lane foyer passe `fixedIntakes: []` EN DUR. Le montrer à une
            bouche sans compte serait montrer un contrôle qui échoue à tous
            les coups — « pire qu'un contrôle absent, parce qu'il promet ».
            Le trou appartient à L7/L8 (le lecteur vit dans le prompt). */}
        {/* ── ⛔ PLUS DE CONDITION `hasAccount` (2026-08-19) ────────────────
            Elle était juste tant que `fixed_intakes` n'existait que sur
            `user_id`: une bouche sans compte n'avait nulle part où le ranger,
            et le bloc aurait écrit son shaker sur la ligne du MAÎTRE.
            `household_members.fixed_intakes` a fermé ce trou (migration
            `20260819170000`), et le moteur lit les deux stocks.

            ⚠️ CE QUI DÉCIDE MAINTENANT EST LE PORT, pas le compte: `null` veut
            dire « cet appelant n'a pas d'endroit où écrire » — c'est le cas de
            la fiche d'AJOUT, dont la ligne n'existe pas encore. Un contrôle
            sans écrivain reste pire qu'un contrôle absent. */}
        {props.onSaveShaker !== null ? (
          <ShakerFields
            shaker={draft.shaker}
            foreground={shakerIsForeground(draft.goal)}
            onChange={(next) => set({ shaker: next })}
            onSave={props.onSaveShaker}
            busy={props.busy}
            voice={voice}
            who={who}
          />
        ) : null}
      </Section>

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
  { draft, onChange, todayLocalIso, idPrefix, voice, who }: {
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
                // ⛔ LA SECONDE SURFACE DU LOT `L3` — et la plus explicite des
                // deux. `household.mouth.target_weight_hint` disait « Avec le
                // rythme ci-dessous, il donne une date d'arrivée. » Retirer le
                // nombre de semaines en la laissant aurait donné le pire des
                // deux états: un écran qui ANNONCE une date et n'en donne
                // aucune. La clé i18n reste en place, elle n'est plus lue.
                hint={TARGET_WEIGHT_HINT_COPY[
                  uiLocale() === "fr" ? "fr" : "en"
                ]}
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
                  hint={t(voiced("household.mouth.pace_hint", voice), { who })}
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
                  {/* ③ — LE CURSEUR SATURE, ET RIEN NE LE DISAIT. Mesuré: au
                      delà de `MAX_SURPLUS_FRACTION`, 0,20 et 0,60 rendent le
                      MÊME écart quotidien — les deux tiers de la course du
                      curseur ne changent pas un gramme dans une boîte. Sans
                      cette phrase, quelqu'un pousse à 1,0 en croyant
                      accélérer, ne voit aucune différence, et ne peut pas
                      savoir si c'est le produit qui l'ignore ou son corps qui
                      plafonne.

                      ⚠️ SÉPARÉE DE L'AVERTISSEMENT DU DESSUS, et pas fondue
                      dedans: les deux sont vraies en même temps au-delà de
                      0,5 kg/semaine sur un grand corps, et elles ne disent pas
                      la même chose — l'une parle de physiologie, l'autre de ce
                      que le plan exécute. Un bloc unique en ferait taire une.

                      ⚠️ TON NEUTRE, PAS AMBRE. Ce n'est pas un risque, c'est
                      une information sur le contrôle: le peindre en alerte
                      ferait lire « tu fais quelque chose de dangereux » à
                      quelqu'un qui a simplement poussé un curseur. */}
                  {/* ⛔ LA PHRASE DE SATURATION N'EST PLUS RENDUE (2026-08-19).
                      « À partir de ce cran, l'assiette ne change plus… »
                      décrivait le comportement INTERNE du plafond à quelqu'un
                      qui pousse un curseur déjà borné par ce même plafond: le
                      contrôle ne monte pas plus haut, ce qui est l'information
                      — la phrase ne faisait que la répéter en trente mots.

                      ⚠️ `PACE_SATURATION_LABELS` RESTE dans le module moteur,
                      avec ses tests: c'est l'AFFICHAGE qui part, pas la
                      décision. Le jour où un écran veut l'expliquer, le texte
                      est là et il est traduit. */}
                  {/* ⛔ LA DATE D'ARRIVÉE EST PARTIE (lot `L3`, 2026-08-22),
                      ET CE N'EST PAS UN SILENCE. Cette place affichait « About
                      12 weeks at this pace. ». Mesuré le même jour sur les cas
                      de design: l'écart quotidien prescrit vaut 495 kcal/j et
                      notre erreur d'estimation ±580 kcal/j, donc l'écart
                      RÉELLEMENT exécuté vit dans [-85 … 1075] kcal/j — il
                      TRAVERSE ZÉRO, et le nombre de semaines réellement
                      possible allait « de 6 à JAMAIS ». Une fourchette aurait
                      donc été une seconde promesse, fausse comme la première.

                      ⚠️ LA SURFACE RESTE, SOUS LA MÊME PRÉMISSE — cible
                      acceptée et curseur vivant. Seul son contenu change: la
                      direction survit (« vers ce poids »), la raison de
                      l'absence de date est NOMMÉE, et ce qui donnera le rythme
                      réel est dit (la balance). Rien de plus: on n'annonce PAS
                      que le plan suivra les pesées — `L11★` mesure zéro bouche
                      pesée plus d'une fois, et aucun écrivain ne propage.

                      ⚠️ LA PHRASE VIENT DU MODULE, DANS LES DEUX LANGUES, ET
                      ELLE N'EST PAS RÉÉCRITE ICI — même règle que
                      `PACE_WARNING_LABELS` juste au-dessus. Elle n'a donc
                      AUCUNE clé i18n: `arrivalHorizon.ts` porte son propre
                      catalogue, et sa garde refuse tout chiffre et toute unité
                      de calendrier dans les deux langues. */}
                  {targetState.kind === "accepted" &&
                      targetState.horizon !== null
                    ? (
                      <p className="mt-2 text-sm text-ink-soft">
                        {ARRIVAL_HORIZON_COPY[targetState.horizon][
                          uiLocale() === "fr" ? "fr" : "en"
                        ]}
                      </p>
                    )
                    : null}
                </Field>
              ) : null}
      {/* ── ① CE QU'IL Y A D'AUTRE DANS L'ASSIETTE — EN DERNIER, ET EN SURSIS
          ⛔ SA PLACE DIT SON STATUT. Elle est ici, seule, en bas de fenêtre,
          parce qu'elle attend une décision de forme: posée UNE FOIS pour la
          personne (aujourd'hui) ou PAR MOMENT (la forme visée — le déjeuner et
          le dîner de quelqu'un n'ont pas le même pain). Tant que la décision
          n'est pas prise, elle ne se mélange à rien: un bloc à elle, que
          personne ne consolide par erreur. */}
      <div>
        <MouthMealComponentsFields
          voice={voice}
          who={who}
          value={{
            dayActivity: draft.dayActivity,
            sportFrequency: draft.sportFrequency,
            takesDessert: draft.takesDessert,
            takesCheese: draft.takesCheese,
            takesBread: draft.takesBread,
            appetite: draft.appetite,
          }}
          onChange={(patch) => set(patch)}
        />
      </div>
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
  { shaker, foreground, onChange, onSave, busy, voice, who }: {
    shaker: ShakerDraft | null;
    foreground: boolean;
    onChange: (next: ShakerDraft | null) => void;
    /** Enregistre TOUT DE SUITE, sans passer par le Save de la fiche. */
    onSave: (shaker: ShakerDraft) => void;
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
      <div className="rounded-card border border-dashed border-line-strong p-4">
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
    <div className="space-y-4 rounded-card border border-line-strong bg-paper p-4">
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
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          disabled={busy || !shakerCanBeSaved(shaker)}
          onClick={() => onSave(shaker)}
        >
          {t("household.mouth.shaker_save")}
        </Button>
      </div>
      <p className="text-xs leading-5 text-ink-soft">
        {complete
          ? t("household.mouth.shaker_counted")
          : shakerCanBeSaved(shaker)
          ? t("household.mouth.shaker_kept_not_counted")
          : t("household.mouth.shaker_needs_one")}
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
    <Field
      label={t("household.mouth.dislikes")}
      hint={t("household.mouth.dislikes_hint")}
      htmlFor="mouth-dislike"
    >
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
    </Field>
  );
}
