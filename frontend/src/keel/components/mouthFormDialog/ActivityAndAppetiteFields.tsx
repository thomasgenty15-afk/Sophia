// ⟳ 2026-09-24 — SORTI DE `MouthFormDialog.tsx` (découpage, lot 4a), À L'IDENTIQUE.
// Les deux axes d'activité et l'appétit.
// Le fichier d'origine ré-exporte ce qu'il exportait: aucun appelant ne change
// d'import.

import React from "react";

import ActivityAxesTiles from "../ActivityAxesTiles";
import { t } from "../../i18n/t";
import { type MouthVoice, voiced } from "../../lib/mouthVoice";
import { APPETITE_LEVELS } from "../../../../../supabase/functions/_shared/keel/tokens.ts";
import type {
  AppetiteLevel,
  DayActivityLevel,
  SportFrequency,
} from "../../../../../supabase/functions/_shared/keel/tokens.ts";
import { Section } from "./blocks.tsx";

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

