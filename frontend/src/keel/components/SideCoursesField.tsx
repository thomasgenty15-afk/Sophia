import React from "react";

import { type MessageKey, t } from "../i18n/t";
import { type MouthVoice, voiced } from "../lib/mouthVoice";
import {
  SIDE_COURSE_CHOICES,
  SIDE_COURSE_KINDS,
  type SideCourseChoice,
  type SideCourseKind,
  type SideCoursesDraft,
  setSideCourseChoice,
  sideCourseChoiceOf,
} from "../lib/mealExtras";

// ═══════════════════════════════════════════════════════════════════════════
// LES À-CÔTÉS D'UNE PERSONNE — ENTRÉE, FROMAGE, DESSERT, PAIN
// ⟳ 2026-09-23 — plan « assiettes normales », décision 2 du propriétaire.
// ═══════════════════════════════════════════════════════════════════════════
//
// Le plan sert un petit à-côté au déjeuner et au dîner, choisi selon
// l'objectif de la personne. Ce champ dit, type par type, ce qu'elle veut À LA
// PLACE du défaut: « Oui » (toujours), « Non » (jamais), « Selon l'objectif »
// (le défaut — la clé ABSENTE en base, jamais une valeur écrite).
//
// ⛔ LA MÊME RÉPONSE AU DÉJEUNER ET AU DÎNER. La base les porte séparément (la
// mémoire peut écrire « pas d'entrée le soir » sur le seul dîner): quand les
// deux ne disent pas la même chose, la ligne n'allume AUCUN bouton plutôt que
// d'en affirmer un — voir `sideCourseChoiceOf`. Un clic rend la réponse unique.
//
// ⛔ PAS `takes_*`. Ces colonnes portaient le sens inverse (« ce que je prends
// déjà à côté, à retrancher du plat ») et leurs valeurs sont périmées.
//
// ⚠️ CONTRÔLÉ, ET IL N'ENREGISTRE RIEN LUI-MÊME. Dans la fiche
// (`MouthPreferencesFields`) il édite le brouillon, que le bouton de la fiche
// écrit; sur la ligne d'un membre (`HouseholdPage`), son parent écrit à chaque
// clic. Dans les deux cas l'écriture passe par `habitEntriesToWrite`, le seul
// sérialiseur de la colonne.
//
// ⚠️ DES BOUTONS, PAS DES `<input type="radio">`. La fiche se monte DEUX FOIS
// sur la même page dans l'entonnoir (le titulaire, puis la bouche qu'on
// ajoute): deux groupes de radios au même `name` n'en feraient qu'un, et cocher
// la seconde fiche décocherait la première.
//
// ⚠️ ET `role="radio"` + `aria-checked`, PAS `aria-pressed`. Les trois réponses
// s'excluent: c'est un choix unique, pas trois interrupteurs. Et « Selon
// l'objectif » est allumé sur une fiche vierge PARCE QUE C'EST L'ÉTAT RÉEL — la
// clé est absente, le moteur choisit selon l'objectif. Ce n'est pas la coche
// automatique de la cicatrice `auto-tick-writes-undeniable-false-facts`: cette
// réponse-là ne s'ÉCRIT jamais (elle retire la clé), donc elle ne peut pas
// devenir un fait que personne n'a énoncé. Les tuiles de la fiche qui, elles,
// écriraient une réponse restent tenues à zéro `aria-pressed` sur une fiche
// vierge (`mouthFormDialog.int.test.ts`).
//
// ⛔ AUCUNE PHRASE D'ÉCHEC, AUCUN CHIFFRE D'ÉNERGIE: le champ dit ce qu'on sert,
// jamais ce que ça pèse.

/**
 * ⚠️ DES `Record` COMPLETS, ET PAS UN GABARIT `…${kind}`: un cinquième type
 * ajouté au vocabulaire sans son libellé refuse de compiler, là où un gabarit
 * casté rendrait la clé brute à l'écran.
 */
const KIND_LABELS: Readonly<Record<SideCourseKind, MessageKey>> = {
  starter: "household.mouth.side_courses.starter",
  cheese: "household.mouth.side_courses.cheese",
  dessert: "household.mouth.side_courses.dessert",
  bread: "household.mouth.side_courses.bread",
};

const CHOICE_LABELS: Readonly<Record<SideCourseChoice, MessageKey>> = {
  yes: "household.mouth.side_courses.yes",
  no: "household.mouth.side_courses.no",
  auto: "household.mouth.side_courses.auto",
};

export default function SideCoursesField(
  { value, onChange, disabled, voice, who }: {
    /** Le réglage LU (ou le brouillon qui l'a semé). `{}` = tout « selon l'objectif ». */
    value: SideCoursesDraft;
    /** Le réglage entier après le clic — les autres types inchangés. */
    onChange: (next: SideCoursesDraft) => void;
    disabled: boolean;
    /**
     * ⟳ 2026-09-24 — LE TITRE EST UNE QUESTION POSÉE À QUELQU'UN: « Est-ce que
     * tu manges… » sur sa propre fiche, « Est-ce que {prénom} mange… » sur
     * celle d'un autre. REQUIS: sans voix, la fiche d'une autre personne
     * dirait « tu » au maître.
     */
    voice: MouthVoice;
    who: string;
  },
): React.ReactElement {
  return (
    <div data-side-courses="">
      <p className="text-sm font-medium text-ink">
        {t(voiced("household.mouth.side_courses.title", voice), { who })}
      </p>
      <p className="mt-1 text-xs leading-5 text-ink-soft">
        {t("household.mouth.side_courses.hint")}
      </p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {SIDE_COURSE_KINDS.map((kind) => {
          const current = sideCourseChoiceOf(value, kind);
          const label = t(KIND_LABELS[kind]);
          return (
            <li
              key={kind}
              data-side-course={kind}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5"
            >
              {/* `min-w-0`: un enfant de flex ne rétrécit pas sous son contenu
                  sans lui — mesuré sur l'`input` du dépôt à 320 px. */}
              <span className="min-w-0 text-sm text-ink">{label}</span>
              <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
                {SIDE_COURSE_CHOICES.map((choice) => {
                  const on = current === choice;
                  return (
                    <button
                      key={choice}
                      type="button"
                      role="radio"
                      disabled={disabled}
                      aria-checked={on}
                      data-side-course-choice={choice}
                      onClick={() =>
                        onChange(setSideCourseChoice(value, kind, choice))}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
                        on
                          ? "border-ink bg-ink text-paper"
                          : "border-line-strong bg-paper text-ink-soft hover:border-ink hover:text-ink"
                      }`}
                    >
                      {t(CHOICE_LABELS[choice])}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
