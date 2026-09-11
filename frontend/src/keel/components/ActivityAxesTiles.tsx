import React from "react";

import { Field } from "./ui/Field";
import { type MessageKey, t } from "../i18n/t";
import {
  DAY_ACTIVITY_LEVELS,
  SPORT_FREQUENCIES,
} from "../../../../supabase/functions/_shared/keel/tokens.ts";
import type {
  DayActivityLevel,
  SportFrequency,
} from "../../../../supabase/functions/_shared/keel/tokens.ts";

// ===========================================================================
// LES DEUX AXES D'ACTIVITÉ — UN SEUL RENDU, POUR LES QUATRE ENDROITS
//
// ── ⟳ SORTI DE `pages/SetupPage.tsx` LE 2026-09-06 ─────────────────────────
// Il y vivait depuis la scission du 2026-08-19, et il servait les TROIS sites
// de l'entonnoir. Une quatrième grille existait à côté, dans
// `MouthFormDialog.tsx`: des radios d'une ligne, avec son propre catalogue de
// mots (`household.mouth.day_activity_*`, `household.mouth.sport_*`), pour les
// MÊMES six jetons.
//
// Les deux ne se voyaient pas jusqu'au 2026-09-03: l'entonnoir montait ses
// tuiles, le Foyer ses radios, chacun sur sa page. Le lot A5 a monté la fiche
// du Foyer DANS l'étape 2 de l'entonnoir — et les deux grilles se sont
// retrouvées sur le même écran, à un doigt l'une de l'autre: « Plutôt assis »
// avec son explication en dessous pour le titulaire, « Assis toute la journée,
// peu de marche » sur une ligne pour la personne qu'on ajoute. Rapporté par
// l'utilisateur, mot pour mot: « pourquoi c'est pas pareil en fait ? ».
//
// ⛔ CE FICHIER EST LA RÉPONSE, ET IL N'EN SURVIT QU'UN. Le catalogue qui reste
// est celui de l'entonnoir (`setup.day_activity.*`, `setup.sport.*`), parce que
// c'est le seul des deux qui porte une PAIRE par jeton — un titre court et son
// explication —, et que l'explication de l'entonnoir est mot pour mot le
// libellé qu'affichait le Foyer. Rien ne se perd à l'écran; ce qui disparaît
// est le second exemplaire.
//
// ⚠️ LA VOIX RESTE À L'APPELANT, LES OPTIONS NON. `dayLabel`/`sportLabel` sont
// des chaînes DÉJÀ TRADUITES: la carte du titulaire dit « Vos journées », la
// fiche d'une bouche dit « La journée de Fabrice » (`voiced` + `whoOf`, qui
// NOMME la personne au lieu de deviner son genre). C'est la seule chose que
// les sites décident encore — le titre est une voix, les six options sont une
// donnée, et c'est la donnée qui divergeait.
// ===========================================================================

/**
 * ② LE PREMIER AXE — la journée, sport EXCLU. `Record` complet: un cran ajouté
 * sans ses mots ne compile pas.
 */
const DAY_ACTIVITY_KEYS: Record<
  DayActivityLevel,
  { label: MessageKey; hint: MessageKey }
> = {
  seated: {
    label: "setup.day_activity.seated",
    hint: "setup.day_activity.seated_hint",
  },
  on_feet: {
    label: "setup.day_activity.on_feet",
    hint: "setup.day_activity.on_feet_hint",
  },
  physical_job: {
    label: "setup.day_activity.physical_job",
    hint: "setup.day_activity.physical_job_hint",
  },
};

/**
 * ② LE SECOND AXE — les séances par semaine, journée EXCLUE.
 *
 * ⚠️ `none` EST UNE TUILE, ET CE N'EST PAS UN « JE NE SAIS PAS ». « Je ne fais
 * pas de sport » est une RÉPONSE, et elle pèse: elle fait descendre le PAL au
 * bas de la bande sédentaire. C'est `null` — aucune tuile cochée — qui veut
 * dire « pas répondu », et il n'a pas de tuile, exprès.
 */
const SPORT_KEYS: Record<
  SportFrequency,
  { label: MessageKey; hint: MessageKey }
> = {
  none: { label: "setup.sport.none", hint: "setup.sport.none_hint" },
  "1_2": { label: "setup.sport.1_2", hint: "setup.sport.1_2_hint" },
  "3_4": { label: "setup.sport.3_4", hint: "setup.sport.3_4_hint" },
  "5_plus": { label: "setup.sport.5_plus", hint: "setup.sport.5_plus_hint" },
};

/**
 * UNE GRILLE DE JETONS — titre court en haut de tuile, explication en dessous.
 *
 * ⛔ UN SEUL RENDU POUR LES DEUX AXES, ET POUR TOUS LES ENDROITS. Deux grilles
 * de tuiles recopiées divergeraient au premier ajustement, et c'est celle qu'on
 * regarde le moins qui garderait l'ancienne. Ce n'est pas une crainte: c'est
 * l'histoire de ce fichier, écrite dans son en-tête.
 */
function TokenTiles<T extends string>(props: {
  /** DÉJÀ TRADUIT: c'est la voix de la page, voir l'en-tête. */
  label: string;
  /** `null` = aucune aide sous la grille. Déjà traduite, sinon. */
  hint: string | null;
  tokens: readonly T[];
  keys: Record<T, { label: MessageKey; hint: MessageKey }>;
  /** `null` = personne n'a répondu. Aucune tuile n'est alors marquée. */
  value: T | null;
  onChange: (next: T) => void;
  busy: boolean;
  /** Préfixe d'`id` — plusieurs grilles coexistent sur le même écran. */
  idPrefix: string;
}) {
  return (
    <Field label={props.label} hint={props.hint ?? undefined}>
      {/* Deux colonnes et pas quatre: à quatre, chaque tuile tombe sous 80 px
          au format de la carte et l'aide se casse en cinq lignes. Une seule
          colonne à 320 px — pas de `whitespace-nowrap`, le texte se replie. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {props.tokens.map((token) => {
          const chosen = props.value === token;
          return (
            <button
              key={token}
              id={`${props.idPrefix}-${token}`}
              type="button"
              disabled={props.busy}
              aria-pressed={chosen}
              onClick={() => props.onChange(token)}
              className={[
                "rounded-card border p-3 text-left transition-colors",
                chosen
                  ? "border-fig-700 bg-fig-100"
                  : "border-line-strong bg-paper hover:bg-fig-50",
              ].join(" ")}
            >
              <span className="block text-sm font-medium text-ink">
                {t(props.keys[token].label)}
              </span>
              <span className="mt-1 block text-xs leading-5 text-ink-soft">
                {t(props.keys[token].hint)}
              </span>
            </button>
          );
        })}
      </div>
    </Field>
  );
}

/**
 * LES DEUX AXES, ENSEMBLE — parce qu'ils se répondent ensemble ou pas du tout.
 *
 * ⛔ `activityFactorOf` N'APPLIQUE LE CROISEMENT QUE SI LES DEUX SONT LÀ. Un
 * seul axe retombe sur le cran d'avant (`legacy`), parce qu'une journée sans
 * sport déclaré n'est PAS une journée sans sport — compléter l'axe manquant
 * serait inventer une réponse que personne n'a donnée. Les rendre côte à côte,
 * dans un seul composant, est ce qui rend improbable qu'un écran n'en pose
 * qu'un.
 */
export function ActivityAxesTiles(props: {
  /** Le titre de la grille des journées, DÉJÀ TRADUIT. Voir l'en-tête. */
  dayLabel: string;
  /** Le titre de la grille du sport, DÉJÀ TRADUIT. */
  sportLabel: string;
  /**
   * L'aide sous chaque grille, ou `null` pour ne rien mettre.
   *
   * ⟳ 2026-09-06 — CES DEUX PROPS REVIENNENT, ET C'EST ARGUMENTÉ. Elles
   * avaient été RETIRÉES le 2026-09-01 parce que les trois sites passaient
   * tous `null`: « un paramètre dont aucun appelant ne fait varier la valeur
   * ment sur ce qui est réglable ». Un quatrième site les fait varier depuis
   * qu'il monte ici — la fiche d'une bouche porte deux phrases qui disent où
   * s'arrête chaque axe (« le sport, c'est la question juste après »), et elles
   * sont ce qui empêche de compter ses séances deux fois. Le paramètre ne ment
   * plus: il est réglable, et il est réglé.
   */
  dayHint: string | null;
  sportHint: string | null;
  day: DayActivityLevel | null;
  sport: SportFrequency | null;
  onDay: (next: DayActivityLevel) => void;
  onSport: (next: SportFrequency) => void;
  busy: boolean;
  idPrefix: string;
}): React.ReactElement {
  return (
    <>
      <TokenTiles
        label={props.dayLabel}
        hint={props.dayHint}
        tokens={DAY_ACTIVITY_LEVELS}
        keys={DAY_ACTIVITY_KEYS}
        value={props.day}
        onChange={props.onDay}
        busy={props.busy}
        idPrefix={`${props.idPrefix}-day`}
      />
      <TokenTiles
        label={props.sportLabel}
        hint={props.sportHint}
        tokens={SPORT_FREQUENCIES}
        keys={SPORT_KEYS}
        value={props.sport}
        onChange={props.onSport}
        busy={props.busy}
        idPrefix={`${props.idPrefix}-sport`}
      />
    </>
  );
}

export default ActivityAxesTiles;
