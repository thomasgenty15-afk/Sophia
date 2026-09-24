// ⟳ 2026-09-24 — SORTI DE `SetupPage.tsx` (découpage, lot 4b), À L'IDENTIQUE.
// Ce qu'on sait d'une bouche, hors édition — lu par ma fiche et par la ligne
// de chaque bouche —, avec les quatre crans d'activité qu'il nomme
// (`ACTIVITY_KEYS`) et leur grille d'origine, gardée pour les fiches `legacy`.
// `ACTIVITY_LEVELS` vient de `tokens.ts` et pas d'`activity_floor.ts`: voir la
// note sur cet import dans `SetupPage.tsx`.
// Le fichier d'origine l'importe; il ré-exporte ce qu'il exportait.

import React from "react";
import { Field } from "../../components/ui/Field";
import {
  ACTIVITY_LEVELS,
  type ActivityLevel,
} from "../../../../../supabase/functions/_shared/keel/tokens.ts";
import { DAY_ACTIVITY_KEYS, SPORT_KEYS } from "../../lib/activityAxisLabels";
import { BIRTH_DATE_ON_FILE, type FunnelPerson } from "../../api/onboarding";
import type { MemberTargetView } from "../../api/mouthProfile";
import type { MouthVoice } from "../../lib/mouthVoice";
import { t, type MessageKey } from "../../i18n/t";
import { formatDate } from "../../i18n/format";
import { goalLabel } from "./labels.ts";

// ───────────────────────────────────────────────────────────────────────────
// ② L'ACTIVITÉ EN DEUX AXES — DEUX GRILLES, TROIS ENDROITS, UN SEUL RENDU
// ───────────────────────────────────────────────────────────────────────────
//
// ⛔ CE QUI A REMPLACÉ QUOI, ET POURQUOI (2026-08-20, soir). Les quatre crans
// d'`ACTIVITY_KEYS` — gardés juste en dessous, et NON rendus — mélangeaient
// deux axes: les deux premiers décrivent une JOURNÉE, les deux derniers un
// SPORT. Quelqu'un d'assis qui court deux fois par semaine ne pouvait dire que
// l'un des deux: il cochait « Sport 2 à 3 fois » et héritait de PAL 1,80, quand
// le croisement vaut ~1,60. **239 kcal/jour fabriqués par la forme de la
// question**, et ils traversaient toute la chaîne avec l'autorité d'une mesure.
//
// ⚠️ `ACTIVITY_KEYS` ET `ActivityTiles` RESTENT DANS CE FICHIER, SANS APPELANT
// D'ÉCRAN, ET C'EST DÉLIBÉRÉ — mais ce n'est pas gratuit non plus. Le cran
// d'avant reste le REPLI NOMMÉ de toute fiche qui n'a répondu qu'à lui
// (`activityFactorOf`, source `legacy`), donc son vocabulaire doit rester lisible
// à côté du neuf. Le jour où plus aucune fiche ne porte de `legacy`, les deux
// partent ensemble.

// ⟳ 2026-09-06 — `DAY_ACTIVITY_KEYS`, `SPORT_KEYS` ET `TokenTiles` SONT PARTIS
// DANS `components/ActivityAxesTiles.tsx`, avec le composant qui les monte.
// Ils vivaient ici parce que les trois sites qui les montaient étaient tous sur
// cette page; un quatrième les monte depuis que la fiche d'une bouche
// (`MouthCoreFields`) a remplacé la carte d'ajout de l'étape 2 (A5,
// 2026-09-03). Cette fiche-là portait sa PROPRE grille — des radios d'une
// ligne, son propre catalogue de mots pour les mêmes six jetons —, et les deux
// se sont retrouvées à un doigt l'une de l'autre sur le même écran. Le pourquoi
// complet est dans l'en-tête du fichier d'arrivée.

/** Le libellé court et l'aide d'un cran. `Record` complet: un cran ajouté sans
 *  ses mots ne compile pas — la même garde que `GOAL_KEYS` au-dessus. */
const ACTIVITY_KEYS: Record<ActivityLevel, { label: MessageKey; hint: MessageKey }> = {
  sedentary: { label: "setup.activity.sedentary", hint: "setup.activity.sedentary_hint" },
  on_feet: { label: "setup.activity.on_feet", hint: "setup.activity.on_feet_hint" },
  trains_some: {
    label: "setup.activity.trains_some",
    hint: "setup.activity.trains_some_hint",
  },
  trains_hard: {
    label: "setup.activity.trains_hard",
    hint: "setup.activity.trains_hard_hint",
  },
};

/**
 * LES QUATRE CRANS D'ACTIVITÉ — ET IL N'Y EN A QUE QUATRE.
 *
 * ⛔ NE PAS AJOUTER UNE CINQUIÈME TUILE « JE NE SAIS PAS ». Ne rien cocher EST
 * la non-réponse: `null` traverse jusqu'à `meal_envelope.ts`, qui rend alors
 * l'hypothèse 1,5 — exactement le comportement d'avant ce lot. Un jeton
 * d'ignorance ferait de l'ignorance une RÉPONSE, et une réponse se met à peser
 * dans un calcul d'énergie (`tokens.ts`, le paragraphe qui refuse ce jeton).
 *
 * ⛔ ET JAMAIS UN CHAMP NUMÉRIQUE. Ni PAL, ni heures de sport par semaine: « un
 * nombre demandé à l'utilisateur est un nombre qu'il invente, et l'inventé
 * entre ensuite dans un calcul avec l'autorité d'une mesure ». Un cran se
 * reconnaît, et il porte sa propre imprécision.
 *
 * ── POURQUOI UN SEUL COMPOSANT POUR TROIS ENDROITS ────────────────────────
 * Il est monté par `SelfStep` (moi), par le formulaire d'ajout de `MouthsStep`
 * (une bouche neuve) et par `MouthRow` (une bouche déjà en base, à la reprise).
 * Les trois écrivent la MÊME colonne à travers la MÊME RPC tout-ou-rien: trois
 * grilles de tuiles recopiées divergeraient au premier ajustement, et c'est
 * celle qu'on regarde le moins qui garderait l'ancienne liste.
 *
 * Le rendu est celui des cartes de l'étape 1 (`SituateStep`), au mot près —
 * lavis `fig-100` fermé par `fig-700` pour le choix retenu, contour de contrôle
 * `line-strong` pour les autres, `aria-pressed` parce que la couleur ne peut
 * pas être la seule porteuse de l'information (WCAG 1.4.1).
 */
// ⚠️ SANS APPELANT D'ÉCRAN, ET C'EST DÉLIBÉRÉ: voir le bloc au-dessus
// d'`ACTIVITY_KEYS`. Le cran d'avant reste le repli NOMMÉ de toute fiche qui
// n'a répondu qu'à lui (`activityFactorOf`, source `legacy`), donc son
// vocabulaire doit rester lisible à côté du neuf. Le jour où plus aucune fiche
// ne porte de `legacy`, `ACTIVITY_KEYS`, ce composant et cette dérogation
// partent ENSEMBLE.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ActivityTiles(props: {
  label: MessageKey;
  /**
   * L'AIDE SOUS LES TUILES, ou `null` pour ne rien mettre.
   *
   * ⚠️ `null` EXPLICITE, JAMAIS UNE CHAÎNE VIDE. Vider la clé dans le catalogue
   * a été essayé le 2026-08-19 et la garde de parité l'a refusé, à raison: deux
   * catalogues avec la même valeur vide sont indiscernables d'une traduction
   * oubliée. L'absence d'aide est une décision d'ÉCRAN, elle se dit ici.
   */
  hint: MessageKey | null;
  /** `null` = personne n'a répondu. Aucune tuile n'est alors marquée. */
  value: ActivityLevel | null;
  onChange: (next: ActivityLevel) => void;
  busy: boolean;
  /** Préfixe d'`id` — trois grilles peuvent coexister sur le même écran. */
  idPrefix: string;
}) {
  return (
    <Field
      label={t(props.label)}
      hint={props.hint === null ? undefined : t(props.hint)}
    >
      {/* Deux colonnes et pas quatre: à quatre, chaque tuile tombe sous 80 px
          au format de la carte et l'aide se casse en cinq lignes. Une seule
          colonne à 320 px — pas de `whitespace-nowrap`, le texte se replie. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {ACTIVITY_LEVELS.map((level) => {
          const chosen = props.value === level;
          return (
            <button
              key={level}
              id={`${props.idPrefix}-activity-${level}`}
              type="button"
              disabled={props.busy}
              aria-pressed={chosen}
              onClick={() => props.onChange(level)}
              className={[
                "rounded-card border p-3 text-left transition-colors",
                chosen
                  ? "border-fig-700 bg-fig-100"
                  : "border-line-strong bg-paper hover:bg-fig-50",
              ].join(" ")}
            >
              <span className="block text-sm font-medium text-ink">
                {t(ACTIVITY_KEYS[level].label)}
              </span>
              <span className="mt-1 block text-xs leading-5 text-ink-soft">
                {t(ACTIVITY_KEYS[level].hint)}
              </span>
            </button>
          );
        })}
      </div>
    </Field>
  );
}

/**
 * CE QU'ON SAIT D'UNE BOUCHE, HORS ÉDITION.
 *
 * ⚠️ IL DIT AUSSI CE QU'ON NE SAIT PAS, ET C'EST LA MOITIÉ QUI COMPTE. Une
 * carte qui n'énumère que les champs remplis laisse croire que le reste n'est
 * pas demandé — alors que c'est très exactement ce qui manque au plan. Chaque
 * ligne absente porte donc son « — », et le bouton « Modifier » est à trois
 * centimètres au-dessus.
 */
/**
 * ── ⟳ 2026-09-20 · `FunnelPerson` ET PLUS `FunnelMouth`, PLUS UNE VOIX ─────
 *
 * Ce résumé ne lisait déjà que des champs de `FunnelPerson` — prénom mis à
 * part, qu'il ne rend pas: date, direction, corps, activité, cible. Le type
 * plus étroit n'achetait donc rien, et il fermait la porte au seul autre
 * sujet de cet écran qui a exactement les mêmes faits: LE TITULAIRE
 * (`FunnelSelf = FunnelPerson`). Sa carte se replie depuis aujourd'hui, et
 * une seconde copie de ces cinq lignes aurait divergé au premier champ
 * ajouté — c'est ce qui est arrivé aux trois sérialiseurs d'habitudes.
 *
 * ⚠️ LA VOIX EST UNE PROP, PAS UNE DEVINETTE. Deux des cinq libellés sont à
 * la troisième personne (« Ce qu'il ou elle vise », « Ses journées »), et les
 * lire sur sa propre fiche est le défaut que `lib/mouthVoice.ts` existe pour
 * empêcher. Les trois autres sont déjà neutres, et n'ont donc pas de paire.
 */
export function MouthRowSummary(
  { mouth, target, birthDate, voice }: {
    mouth: FunnelPerson;
    target: MemberTargetView | null;
    /** `""` = pas de date, `null` = lecture pas faite. */
    birthDate: string | null;
    voice: MouthVoice;
  },
) {
  const dash = "—";
  const rows: Array<{ label: string; value: string }> = [
    {
      label: t("setup.people.birth_date"),
      // ⚠️ LA DATE, PAS « Renseignée ». Le résumé disait un ÉTAT là où il
      // pouvait dire un FAIT — et l'état était la seule chose que l'écran
      // savait, faute de porte de lecture. Elle existe depuis le 2026-08-19.
      // Le repli reste l'état pour la seule fenêtre où il est vrai: la lecture
      // n'a pas encore rendu.
      value: birthDate
        ? formatDate(birthDate)
        : mouth.birthDate === BIRTH_DATE_ON_FILE
        ? t("setup.mouths.summary_on_file")
        : dash,
    },
    {
      label: voice === "self"
        ? t("setup.people.goal")
        : t("setup.mouths.goal"),
      // « — » ET PLUS « Aucune direction particulière » (2026-09-03): un
      // résumé qui nomme une quatrième direction en fabrique une.
      value: mouth.goal ? goalLabel(mouth.goal) : dash,
    },
    {
      label: t("setup.mouths.body"),
      // LES TROIS OU RIEN, comme la RPC: une taille seule ne dimensionne
      // aucune part, et l'afficher laisserait croire que le corps est posé.
      value: mouth.heightCm !== null && mouth.weightKg !== null && mouth.gender
        ? `${mouth.heightCm} cm · ${mouth.weightKg} kg`
        : dash,
    },
  ];
  /**
   * ── ⟳ 2026-09-20 · LES DEUX AXES, ET PLUS LE CRAN UNIQUE ────────────────
   *
   * Cette ligne lisait `activityLevel` et rendait « — » sur TOUTE personne
   * passée par l'entonnoir. Ce n'était pas une donnée manquante: l'entonnoir
   * ne demande plus ce cran depuis le 2026-08-20 (`ActivityAxesTiles` pose
   * `day_activity` et `sport_frequency`), et `own_activity_level` a même
   * quitté les refus. Le résumé interrogeait donc une colonne que l'écran
   * au-dessus de lui n'écrit plus. Signalé à l'écran: « quand c'est rétracté
   * "vos journées elles sont comment ?" ne remonte pas sur la carte ».
   *
   * ⛔ LE CRAN N'EST PAS SUPPRIMÉ POUR AUTANT, IL DEVIENT LE REPLI NOMMÉ. Un
   * compte ouvert avant le 2026-08-20 porte `profiles.activity_level` et RIEN
   * sur les deux axes; c'est cette valeur-là que `meal_envelope.ts` applique
   * pour lui. Rendre deux tirets pendant que le moteur utilise un vrai cran
   * serait la même faute dans l'autre sens — un résumé qui tait ce que la
   * base sait.
   */
  if (mouth.dayActivity !== null || mouth.sportFrequency !== null) {
    rows.push({
      label: voice === "self"
        ? t("setup.day_activity.label")
        : t("setup.day_activity.member_label"),
      value: mouth.dayActivity
        ? t(DAY_ACTIVITY_KEYS[mouth.dayActivity].label)
        : dash,
    });
    rows.push({
      label: voice === "self"
        ? t("setup.sport.label")
        : t("setup.sport.member_label"),
      value: mouth.sportFrequency
        ? t(SPORT_KEYS[mouth.sportFrequency].label)
        : dash,
    });
  } else {
    rows.push({
      label: voice === "self"
        ? t("setup.activity.label")
        : t("setup.activity.member_label"),
      value: mouth.activityLevel
        ? t(ACTIVITY_KEYS[mouth.activityLevel].label)
        : dash,
    });
  }
  // LA CIBLE N'APPARAÎT QUE SOUS UNE DIRECTION QUI BOUGE — même règle que les
  // champs qu'elle résume: sur `maintenance`, elle n'a pas de sens et la base
  // la refuse (`target_needs_direction_check`).
  if (mouth.goal === "fat_loss" || mouth.goal === "muscle_gain") {
    rows.push({
      label: t("household.mouth.target_weight"),
      value: target?.targetWeightKg == null
        ? dash
        : `${target.targetWeightKg} kg`,
    });
  }
  return (
    <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
      {rows.map((r) => (
        <React.Fragment key={r.label}>
          <dt className="text-xs uppercase tracking-wide text-ink-soft">
            {r.label}
          </dt>
          <dd className="text-ink">{r.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
