import React from "react";

import { GROCERY_RUNS, type GroceryRuns, readGroceryRuns } from "../api/cookingPlan";
import { t, type MessageKey } from "../i18n/t";
import { Field, inputClass } from "./ui/Field";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * « COMBIEN DE COURSES ? » — P2, le second champ. 2026-09-03.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QU'IL DÉCIDE, ET CE QU'IL NE DÉCIDE PAS ────────────────────────────
 * Il dit combien de fois par plan la personne accepte d'aller au magasin. Le
 * moteur en tire le nombre de SESSIONS de cuisine —
 * `min(courses, 3, plafond du style, jours mangés)` — et donc le nombre de
 * vagues de courses. Il ne dit rien de ce qu'on achète.
 *
 * ⛔ « UNE SEULE COURSE » DEMANDE UN CONGÉLATEUR, et l'écran ne le vérifie PAS
 * ici. C'est délibéré: la porte du congélateur vit à UN endroit
 * (`hasFreezerDeclared`, côté serveur, plus son miroir sur
 * `OneCookingSessionField`), et une quatrième implémentation de la même règle
 * divergerait au premier ajustement — trois sont déjà alignées par
 * `freezerMirror.int.test.ts`. Le serveur sert alors deux courses ET LE DIT
 * dans l'explication du plan.
 *
 * ── POURQUOI PAS UN CURSEUR ───────────────────────────────────────────────
 * Trois valeurs, trois gestes différents dans une vie — un curseur donnerait
 * l'illusion d'un continuum et coûterait une visée fine pour rien.
 */
const LABEL_KEYS: Record<GroceryRuns, MessageKey> = {
  1: "plan.cooking.runs_one",
  2: "plan.cooking.runs_two",
  3: "plan.cooking.runs_three",
};

export interface GroceryRunsFieldProps {
  /**
   * LE NOMBRE CHOISI. `null` = **pas encore répondu**, et surtout pas « une ».
   *
   * ⚠️ REQUIS ET NULLABLE, jamais optionnel — même arbitrage que le style.
   */
  value: GroceryRuns | null;
  onChange: (next: GroceryRuns | null) => void;
  id: string;
  disabled: boolean;
}

export default function GroceryRunsField(props: GroceryRunsFieldProps) {
  return (
    <Field
      label={t("plan.cooking.runs_label")}
      hint={t("plan.cooking.runs_hint")}
      htmlFor={props.id}
    >
      <select
        id={props.id}
        className={inputClass}
        value={props.value === null ? "" : String(props.value)}
        disabled={props.disabled}
        onChange={(e) =>
          props.onChange(readGroceryRuns({ grocery_runs: Number(e.target.value) }))}
      >
        <option value="">{t("plan.cooking.runs_unset")}</option>
        {/* LUES DE LA LISTE FERMÉE, jamais trois `<option>` écrites à la main:
            une quatrième cadence ajoutée au module apparaîtrait ici sans
            libellé plutôt que de manquer en silence. */}
        {GROCERY_RUNS.map((runs) => (
          <option key={runs} value={runs}>
            {t(LABEL_KEYS[runs])}
          </option>
        ))}
      </select>
    </Field>
  );
}
