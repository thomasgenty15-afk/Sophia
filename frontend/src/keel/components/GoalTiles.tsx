import React from "react";

import { t } from "../i18n/t";
import {
  goalForAge,
  goalsForAge,
  type MemberAgeState,
  type MemberGoal,
} from "../api/household";

// ===========================================================================
// LES TUILES DE DIRECTION — chantier P3, 2026-09-03 (décisions D3.1-D3.3)
//
// ── CE QUE CE COMPOSANT REMPLACE ───────────────────────────────────────────
// Six sélecteurs de direction vivaient dans le dépôt: le radiogroup de la
// fiche (`MouthFormDialog.tsx`), et CINQ `<select>` — trois dans l'entonnoir
// (la carte du titulaire, la fiche d'ajout, la ligne d'une bouche inscrite),
// deux sur `/app/household` (`MouthFields`, en édition et en lecture). Les
// cinq `<select>` portaient une QUATRIÈME ligne: `<option value="">Aucune
// direction particulière</option>` — l'« option vide », que l'utilisateur a
// lue comme une quatrième direction et demandé de retirer.
//
// ⚠️ ELLE N'ÉTAIT PAS UN QUATRIÈME JETON. `null` en base reste valide (D3.3:
// part standard, `goalApplies` rend `false`), et le moteur le distingue de
// `maintenance` (`NEUTRAL_DIRECTION` ≠ `SERVING_DIRECTION.maintenance`). Ce
// qui disparaît est la possibilité de le PRODUIRE depuis l'écran: une ligne
// à `goal = null` n'a rien de coché tant que le maître ne choisit pas — trois
// tuiles, aucune pré-sélection, et pas de bouton « aucune ».
//
// ── UN MINEUR NE VOIT QU'UNE TUILE (D3.2) ──────────────────────────────────
// `goalsForAge(ageState)` FILTRE la liste (voir sa note dans
// `api/household.ts`): pour `minor`, `maintenance` seule, libellée « Manger
// normalement » — le registre éducatif de PIVOT-FOYER §8.4, jamais « maintenir
// un poids ». Pour `unknown`, les trois: « je ne sais pas » n'est pas « c'est
// un enfant ». C'est un filtre de liste, testé sur la valeur rendue — jamais
// une tuile masquée par `display:none`.
//
// ── ET LA BASCULE SE DIT ───────────────────────────────────────────────────
// Quand la valeur reçue est une direction que l'âge ne peut pas porter (une
// bouche mineure à `fat_loss` en base, ou une date tapée qui vient de rendre
// quelqu'un mineur), la tuile « Manger normalement » est cochée ET une phrase
// nomme la direction remplacée (`household.goal.minor_switched`). Une bascule
// muette serait exactement le renversement silencieux que ce dépôt refuse.
// Le PLI lui-même vit dans `goalForAge`; ce composant le rend, il ne le
// décide pas.
//
// ── LES MOTS RESTENT À LA PAGE ─────────────────────────────────────────────
// `labelOf` est passé par l'appelant: l'entonnoir dit « Perdre du poids »
// (`setup.goal.*`), le foyer « Perte de masse grasse » (`household.goal.*`),
// et les deux vocabulaires sont tenus par `servingDirections.int.test.ts`.
// Les trois clés que ce fichier écrit en littéral vivent dans `household`,
// déclaré sur `/app/setup` ET `/app/household` (`catalog.ts`).
// ===========================================================================

export function GoalTiles(props: {
  value: MemberGoal | "";
  ageState: MemberAgeState;
  onChange: (goal: MemberGoal) => void;
  /** Le mot de chaque direction, dans le vocabulaire de la page qui monte. */
  labelOf: (goal: MemberGoal) => string;
  /** Le `name` des boutons radio — UNIQUE par formulaire sur la page. */
  name: string;
  /** L'`id` du groupe, pour le `<label for>` du `Field` qui l'enveloppe. */
  id?: string;
  ariaLabel: string;
  disabled?: boolean;
}): React.ReactElement {
  const { value, ageState, onChange, labelOf, name, id, ariaLabel } = props;
  const disabled = props.disabled ?? false;
  const offered = goalsForAge(ageState);
  const shown = goalForAge(value, ageState);
  // Non-nul SEULEMENT quand le pli a remplacé une direction choisie: c'est ce
  // que la phrase nomme, et rien d'autre ne l'affiche.
  const switchedFrom = value !== "" && shown !== value ? value : null;

  return (
    <div className="flex flex-col gap-2">
      <div
        id={id}
        role="radiogroup"
        aria-label={ariaLabel}
        className="flex flex-col gap-2"
      >
        {offered.map((g) => (
          <label
            key={g}
            className="flex cursor-pointer items-center gap-3 rounded-card border border-line-strong bg-paper px-3 py-2.5 text-sm text-ink"
          >
            <input
              type="radio"
              name={name}
              value={g}
              checked={shown === g}
              disabled={disabled}
              onChange={() => onChange(g)}
            />
            <span>
              {ageState === "minor" && g === "maintenance"
                ? t("household.goal.minor_maintenance")
                : labelOf(g)}
            </span>
          </label>
        ))}
      </div>
      {ageState === "minor" ? (
        <p className="text-xs leading-5 text-ink-soft">
          {t("household.goal.minor_only")}
        </p>
      ) : null}
      {switchedFrom !== null ? (
        <p className="rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          {t("household.goal.minor_switched", { from: labelOf(switchedFrom) })}
        </p>
      ) : null}
    </div>
  );
}

export default GoalTiles;
