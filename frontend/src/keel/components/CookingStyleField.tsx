import React from "react";

import {
  COOKING_STYLES,
  type CookingStyle,
  readCookingStyle,
} from "../api/cookingPlan";
import { t, type MessageKey } from "../i18n/t";
import { Field, inputClass } from "./ui/Field";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * « COMMENT VOULEZ-VOUS CUISINER ? » — P2, le champ. 2026-09-03.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── CE QU'IL REMPLACE, ET POURQUOI L'ANCIENNE QUESTION ÉTAIT MAUVAISE ─────
 * « Combien de temps dure une session de cuisine ? » — une question
 * d'ingénieur. Personne ne sait répondre « 45 » avant d'avoir vu le plan, et la
 * réponse ne dit rien de ce qu'on veut vraiment savoir: est-ce que cette
 * personne AIME cuisiner. Le nombre était pourtant BLOQUANT dans l'entonnoir.
 *
 * Celle-ci se répond sans réfléchir, et elle porte trois réglages du moteur
 * (`cooking_time_min`, `recipe_difficulty`, `variety`) plus le plafond des
 * sessions de cuisine. La dérivation vit côté serveur
 * (`_shared/keel/cooking_plan.ts`), et cet écran ne la rejoue pas.
 *
 * ── LES LIBELLÉS PORTENT LA CONSÉQUENCE, PAS LE JARGON ────────────────────
 * Même règle que `CookingShapeField`: « minimal » ne veut rien dire à
 * quelqu'un qui prépare à manger, « le moins possible — je réchauffe » dit ce
 * qui va se passer dans sa cuisine.
 *
 * ⛔ ET ELLES SONT ICI, PAS DANS `api/cookingPlan.ts`. Ce module-là est un
 * réexport du socle serveur; le détecteur de coutures (`pageSeams`) relève
 * chaque littéral qui est une clé du seed, et les y laisser ferait rougir toute
 * page qui importerait le module sans déclarer le namespace `plan.*`.
 *
 * ⚠️ LA CORRESPONDANCE EST UN POUR UN, ET LE TYPE LA TIENT: un style ajouté à
 * `COOKING_STYLES` sans sa clé ici ne compile pas.
 */
const LABEL_KEYS: Record<CookingStyle, MessageKey> = {
  minimal: "plan.cooking.style_minimal",
  balanced: "plan.cooking.style_balanced",
  keen: "plan.cooking.style_keen",
};

export interface CookingStyleFieldProps {
  /**
   * LE STYLE CHOISI. `null` = **la question n'a pas encore de réponse**.
   *
   * ⛔ CE N'EST PAS « le moins possible ». La cicatrice
   * (`20260818110000:48-51`, payée sur `kitchen_equipment`) dit qu'une clé
   * absente et une réponse basse se ressemblent en JSON et ne veulent pas dire
   * la même chose: sans réponse, le moteur retombe sur ce qu'il faisait hier.
   *
   * ⚠️ REQUIS ET NULLABLE, jamais optionnel: `undefined` laisserait passer un
   * site de montage sans que le compilateur bronche, et le champ serait
   * construit sans être branché.
   */
  value: CookingStyle | null;
  onChange: (next: CookingStyle | null) => void;
  /** L'identifiant du `<select>`. REQUIS: deux champs sur une page le partagent sinon. */
  id: string;
  disabled: boolean;
}

export default function CookingStyleField(props: CookingStyleFieldProps) {
  return (
    <Field
      label={t("plan.cooking.style_label")}
      hint={t("plan.cooking.style_hint")}
      htmlFor={props.id}
    >
      <select
        id={props.id}
        className={inputClass}
        // `""` ET PAS `null`: un `<select>` dont la valeur est `null` devient
        // non contrôlé et garde en silence la sélection du navigateur.
        value={props.value ?? ""}
        disabled={props.disabled}
        onChange={(e) =>
          props.onChange(readCookingStyle({ cooking_style: e.target.value }))}
      >
        {/* ⛔ L'OPTION VIDE RESTE, ET ELLE N'EST PAS UN QUATRIÈME STYLE: c'est
            « pas encore répondu ». La retirer pré-cocherait un comportement que
            personne n'a demandé — exactement ce que la cicatrice interdit. */}
        <option value="">{t("plan.cooking.style_unset")}</option>
        {COOKING_STYLES.map((style) => (
          <option key={style} value={style}>
            {t(LABEL_KEYS[style])}
          </option>
        ))}
      </select>
    </Field>
  );
}
