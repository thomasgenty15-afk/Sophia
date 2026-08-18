import React from "react";

import Modal from "./ui/Modal";
import { Button } from "./ui/Button";
import { Field, inputClass } from "./ui/Field";
import { SectionLabel } from "./ui/Card";
import { allergenLabel, ALLERGEN_OPTIONS } from "../copy/allergens";
import { t } from "../i18n/t";
import { uiLocale } from "../i18n/runtime";
import { MEMBER_GENDERS, MEMBER_GOALS } from "../api/household";
import type { MemberGender, MemberGoal } from "../api/household";
import { DIET_ANSWERS } from "../api/onboarding";
import { EATING_OCCASIONS } from "../api/mealGeneration";
import { mealCopy } from "../api/mealLabels";
import {
  activityIsRequired,
  ageStateOfDraft,
  filledPreferenceBlocks,
  type MouthFormBlock,
  type MouthFormDraft,
  missingRequiredBlocks,
  paceControlFor,
  type ShakerDraft,
  shakerIsComplete,
  shakerIsForeground,
  submitIsHeld,
  targetWeightStateFor,
} from "../lib/mouthForm";
import { ACTIVITY_LEVELS } from "../../../../supabase/functions/_shared/keel/tokens.ts";
import type { ActivityLevel } from "../../../../supabase/functions/_shared/keel/tokens.ts";
import {
  PACE_SATURATION_LABELS,
  PACE_WARNING_LABELS,
} from "../../../../supabase/functions/_shared/keel/weight_pace.ts";

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
  openBlock: MouthFormBlock | null;
  onOpenBlock: (next: MouthFormBlock | null) => void;
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
function Foldable(
  { title, hint, open, onToggle, children }: {
    title: string;
    hint: string;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
  },
) {
  return (
    <div className="rounded-card border border-line-strong bg-paper p-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <SectionLabel>{title}</SectionLabel>
          <span className="mt-1 block text-xs leading-5 text-ink-soft">
            {hint}
          </span>
        </span>
        <span className="shrink-0 text-sm text-fig-700 underline underline-offset-2">
          {open ? t("household.mouth.fold") : t("household.mouth.unfold")}
        </span>
      </button>
      {open ? <div className="mt-4 space-y-4">{children}</div> : null}
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
      // LA SORTIE DIT CE QU'ELLE FAIT. « Fermer » sur une fenêtre à moitié
      // remplie laisse croire qu'on perd tout; « plus tard » dit que la
      // personne reste et que la fiche se reprend.
      closeLabel={t("household.mouth.later")}
    >
      <MouthPreferencesFields {...props} />
    </Modal>
  );
}

export function MouthCoreFields(
  props: MouthCoreFieldsProps,
): React.ReactElement {
  const { draft, onChange, subject, todayLocalIso } = props;
  // ⚠️ MISE À JOUR FONCTIONNELLE. React groupe les mises à jour d'un même tick:
  // deux champs touchés coup sur coup partiraient sinon du MÊME état de départ,
  // et le second effacerait le premier. Mesuré sur `SetupPage` le 2026-08-12.
  const set = (patch: Partial<MouthFormDraft>) =>
    onChange((prev) => ({ ...prev, ...patch }));

  const missing = missingRequiredBlocks(draft);
  const filled = filledPreferenceBlocks(draft);
  const held = submitIsHeld(draft, todayLocalIso);
  const paceControl = paceControlFor(draft, todayLocalIso);
  const targetState = targetWeightStateFor(draft, todayLocalIso);
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
          hint={t("household.mouth.identity_hint")}
        >
          <Field
            label={t("setup.people.first_name")}
            hint={t("setup.mouths.first_name_hint")}
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
          title={t("household.mouth.body")}
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
            label={t("household.mouth.activity")}
            hint={t("household.mouth.activity_hint")}
          >
            <div
              className="flex flex-col gap-2"
              role="radiogroup"
              aria-label={t("household.mouth.activity")}
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
        <div className="rounded-card border border-line-strong bg-paper p-4">
          <Button
            variant="secondary"
            disabled={props.busy}
            onClick={props.onOpenPreferences}
          >
            {t("household.mouth.preferences_open")}
          </Button>
          <p className="mt-2 text-xs leading-5 text-ink-soft">
            {filled.length > 0
              ? t("household.mouth.preferences_filled", {
                blocks: blockList(
                  filled.map((b) =>
                    t(
                      `household.mouth.block_${b}` as "household.mouth.block_identity",
                    )
                  ),
                ),
              })
              : t("household.mouth.preferences_empty")}
          </p>
        </div>

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

  const toggle = (id: MouthFormBlock) =>
    props.onOpenBlock(props.openBlock === id ? null : id);

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-ink-soft">
        {t("household.mouth.preferences_intro")}
      </p>

        {/* ── BLOC 4 · CE QU'ELLE MANGE DÉJÀ · sautable ──────────────────── */}
        <Foldable
          title={t("household.mouth.habits")}
          hint={t("household.mouth.habits_hint")}
          open={props.openBlock === "habits" || shakerIsForeground(draft.goal)}
          onToggle={() => toggle("habits")}
        >
          {/* UNE HABITUDE DIT UNE TENDANCE QUE LA COMPOSITION CONTOURNE, pas
              une quantité qui remplace un repas. On ne demande donc NI
              quantité NI aliment résolu: « une pomme » n'a ni l'un ni l'autre,
              et lui en inventer écrirait un fait que personne n'a pesé.
              Le cas qui a ouvert le chantier: sept matins d'œufs brouillés
              servis à une femme qui mange une pomme — personne ne le lui avait
              demandé. */}
          {EATING_OCCASIONS.map((slot) => (
            <Field
              key={slot}
              label={mealCopy(`meals.slot.${slot}` as "meals.slot.breakfast")}
              htmlFor={`mouth-habit-${slot}`}
              className="mb-0"
            >
              <input
                id={`mouth-habit-${slot}`}
                type="text"
                maxLength={120}
                placeholder={t("household.mouth.habit_placeholder")}
                value={draft.habits[slot] ?? ""}
                onChange={(e) =>
                  set({ habits: { ...draft.habits, [slot]: e.target.value } })}
                className={inputClass}
              />
            </Field>
          ))}

          {/* ── LE SHAKER ────────────────────────────────────────────────────
              ⚠️ IL N'EXISTE QUE POUR UNE BOUCHE QUI A UN COMPTE, et ce n'est
              pas un oubli: `fixed_intakes` vit dans
              `student_goals.practical_constraints`, donc sur `user_id`, et la
              lane foyer passe `fixedIntakes: []` EN DUR. Le montrer à une
              bouche sans compte serait montrer un contrôle qui échoue à tous
              les coups — « pire qu'un contrôle absent, parce qu'il promet ».
              Le trou appartient à L7/L8 (le lecteur vit dans le prompt). */}
          {subject.hasAccount ? (
            <ShakerFields
              shaker={draft.shaker}
              foreground={shakerIsForeground(draft.goal)}
              onChange={(next) => set({ shaker: next })}
            />
          ) : null}
        </Foldable>

        {/* ── BLOC 5 · LES ALLERGIES · sautable mais fail-closed ─────────── */}
        <Foldable
          title={t("setup.mouths.allergies")}
          hint={t("setup.people.allergies_hint")}
          open={props.openBlock === "allergies"}
          onToggle={() => toggle("allergies")}
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
              Sans ce bouton, un bloc sauté et un bloc rempli d'un « non »
              seraient le même état en base. */}
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
        </Foldable>

        {/* ── BLOC 6 · SES GOÛTS, SON RÉGIME · sautable ──────────────────── */}
        <Foldable
          title={t("household.mouth.tastes")}
          hint={t("household.mouth.tastes_hint")}
          open={props.openBlock === "tastes"}
          onToggle={() => toggle("tastes")}
        >
          {/* ⚠️ CE BLOC VIT SUR LA LIGNE MEMBRE, PAS SUR `food_preferences`.
              Celle-là est indexée sur `user_id` — donc INATTEIGNABLE pour une
              bouche sans compte, c'est-à-dire pour un enfant, le cas nominal
              du foyer. Les dégoûts partent dans
              `household_food_restrictions` (clé `member_id`, comme les
              allergies et les habitudes), qui est exactement la table du
              « pas de champignons pour Léa ».

              ⚠️ ET CE N'EST PAS UNE ALLERGIE. Deux tables, deux natures: une
              allergie est MÉDICALE et rejoint l'union de sécurité fail-closed;
              un dégoût est un fait de foyer dont le verrou serveur TAIT le
              pourquoi. Les fondre promettrait une garde de sécurité sur une
              préférence. */}
          <DislikeFields
            dislikes={draft.dislikes}
            onChange={(next) => set({ dislikes: next })}
          />

          {/* LE RÉGIME (FF-042) — POUR UNE BOUCHE SANS COMPTE SEULEMENT. La
              base refuse `has_account`: le régime de quelqu'un qui a un compte
              vit dans SON « about you », et le roster ne lit pas la colonne
              pour lui. */}
          {subject.hasAccount ? null : (
            <Field label={t("household.mouth.diet")} htmlFor="mouth-diet">
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
          )}
        </Foldable>


      {/* CE QUI SE PASSE À LA FERMETURE, DIT AVANT DE FERMER. */}
      <p className="rounded-card border border-line-strong bg-paper-2 p-3 text-xs leading-5 text-ink-soft">
        {t("household.mouth.preferences_kept")}
      </p>
      <div className="flex flex-wrap items-center gap-3">
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
 */
export function TargetAndPaceFields(
  { draft, onChange, todayLocalIso }: {
    draft: MouthFormDraft;
    onChange: React.Dispatch<React.SetStateAction<MouthFormDraft>>;
    todayLocalIso: string;
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
                hint={t("household.mouth.target_weight_hint")}
                // ⚠️ LE REFUS EST RENDU À CÔTÉ DU CHAMP, ET C'EST LE CONTRAT DE
                // PASSATION DU SOCLE. Trois fois dans `SetupPage`, un refus
                // rendu loin du geste s'est lu comme un bouton mort.
                error={targetState.kind === "refused"
                  ? t(
                    `household.mouth.target_refused_${targetState.refusal}` as "household.mouth.target_refused_implausible",
                  )
                  : undefined}
                htmlFor="mouth-target-weight"
              >
                <input
                  id="mouth-target-weight"
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
                  hint={t("household.mouth.pace_hint")}
                  htmlFor="mouth-pace"
                >
                  <input
                    id="mouth-pace"
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
                  {paceControl.saturation !== null ? (
                    <p className="mt-2 rounded-card border border-line-strong bg-paper-2 p-3 text-xs leading-5 text-ink-soft">
                      {PACE_SATURATION_LABELS[paceControl.saturation][
                        uiLocale() === "fr" ? "fr" : "en"
                      ]}
                    </p>
                  ) : null}
                  {/* LA DATE D'ARRIVÉE — ce qui rend l'objectif réel au lieu
                      d'abstrait. `null` = on n'affiche rien; « tu y es dans 0
                      semaine » et « ce rythme ne mène nulle part » ne se disent
                      pas de la même façon. */}
                  {targetState.kind === "accepted" && targetState.weeks !== null
                    ? (
                      <p className="mt-2 text-sm text-ink-soft">
                        {t("household.mouth.arrival", {
                          weeks: targetState.weeks,
                        })}
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
function ShakerFields(
  { shaker, foreground, onChange }: {
    shaker: ShakerDraft | null;
    foreground: boolean;
    onChange: (next: ShakerDraft | null) => void;
  },
) {
  const empty: ShakerDraft = {
    label: "",
    servingGrams: "",
    proteinGPerServing: "",
    energyKcalPerServing: "",
    slot: "",
  };
  if (shaker === null) {
    return (
      <div className="border-t border-line pt-4">
        <p className="mb-2 text-xs leading-5 text-ink-soft">
          {foreground
            ? t("household.mouth.shaker_foreground")
            : t("household.mouth.shaker_background")}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange(empty)}
        >
          {t("household.mouth.shaker_add")}
        </Button>
      </div>
    );
  }
  const set = (patch: Partial<ShakerDraft>) => onChange({ ...shaker, ...patch });
  return (
    <div className="space-y-3 border-t border-line pt-4">
      <Field
        label={t("household.mouth.shaker_label")}
        hint={t("household.mouth.shaker_label_hint")}
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
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          id="mouth-shaker-grams"
          type="number"
          inputMode="decimal"
          min={1}
          placeholder={t("household.mouth.shaker_grams")}
          aria-label={t("household.mouth.shaker_grams")}
          value={shaker.servingGrams}
          onChange={(e) => set({ servingGrams: e.target.value })}
          className={`${inputClass} min-w-0`}
        />
        <input
          id="mouth-shaker-protein"
          type="number"
          inputMode="decimal"
          min={0}
          placeholder={t("household.mouth.shaker_protein")}
          aria-label={t("household.mouth.shaker_protein")}
          value={shaker.proteinGPerServing}
          onChange={(e) => set({ proteinGPerServing: e.target.value })}
          className={`${inputClass} min-w-0`}
        />
        <input
          id="mouth-shaker-kcal"
          type="number"
          inputMode="decimal"
          min={0}
          placeholder={t("household.mouth.shaker_kcal")}
          aria-label={t("household.mouth.shaker_kcal")}
          value={shaker.energyKcalPerServing}
          onChange={(e) => set({ energyKcalPerServing: e.target.value })}
          className={`${inputClass} min-w-0`}
        />
      </div>
      <p className="text-xs leading-5 text-ink-soft">
        {t("household.mouth.shaker_label_source")}
      </p>
      {/* CE QUI MANQUE EST DIT ICI, PAS AU SAVE. Un apport déclaré sans ses
          trois nombres est jeté par `parseFixedIntakes`, et la déclaration
          disparaîtrait sans un mot. */}
      {!shakerIsComplete(shaker) ? (
        <p className="text-xs leading-5 text-amber-900">
          {t("household.mouth.shaker_incomplete")}
        </p>
      ) : null}
      <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
        {t("household.mouth.shaker_remove")}
      </Button>
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
