import React from "react";

import {
  COOKING_SHAPES,
  type CookingShape,
  readCookingShape,
} from "../api/cookingShape";
import { t, type MessageKey } from "../i18n/t";
import { Field, inputClass } from "./ui/Field";

/**
 * LES LIBELLÉS PORTENT LA CONSÉQUENCE, PAS LE JARGON.
 *
 * « one_session » ne veut rien dire à quelqu'un qui prépare à manger; « une
 * cuisson, des plats un peu différents » dit ce qui va se passer dans sa
 * cuisine. Personne à table n'a à connaître le mot « barreau ».
 *
 * ⚠️ LA CORRESPONDANCE EST UN POUR UN, et le TYPE la tient: un jeton ajouté à
 * `COOKING_SHAPES` sans sa clé ici ne compile pas.
 *
 * ⛔ ET ELLES SONT ICI, PAS DANS `api/cookingShape.ts`. Ce module-là est
 * atteint par `api/household.ts`, donc par `/join-household` — une page qui ne
 * déclare pas le namespace `plan.*`. Le détecteur de coutures relève chaque
 * littéral qui est une clé du seed: les y laisser faisait rougir une page
 * d'invitation pour un champ qu'elle ne monte pas. Mesuré le 2026-08-15.
 */
const LABEL_KEYS: Record<CookingShape, MessageKey> = {
  one_dish: "plan.cooking.shape_one_dish",
  one_session: "plan.cooking.shape_one_session",
  separate_sessions: "plan.cooking.shape_separate",
};

/**
 * « COMMENT ON CUISINE CETTE SEMAINE » — LOT B, LE CHAMP.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * IL EST POSÉ SUR L'ÉCRAN QUI COMPOSE, JAMAIS DANS UN RÉGLAGE DE PROFIL.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Même arbitrage que le budget, déplacé du profil vers la composition le
 * 2026-08-13: « un réglage de profil s'écrit une fois et s'applique en silence
 * à toutes les semaines suivantes, y compris celle où on reçoit du monde »
 * (`CookingCapacityCard`). Ce champ ne s'enregistre nulle part; il part avec la
 * demande, et la semaine d'après repose la question.
 *
 * ── UN SEUL COMPOSANT POUR LES DEUX ÉCRANS ────────────────────────────────
 * `MealBuilder` et l'entonnoir posent la MÊME question. Deux champs écrits
 * séparément divergeraient au premier libellé retouché, et c'est celui qu'on
 * regarde le moins qui garderait l'ancien mot — le motif que ce dépôt paie en
 * boucle.
 *
 * ── LE DÉFAUT EST « LAISSE DÉCIDER », ET C'EST UNE DÉCISION ───────────────
 * Il n'est PAS « un seul plat ». Pré-cocher un barreau clouerait tous les
 * foyers qui n'ouvrent jamais la question à un comportement qu'ils n'ont pas
 * demandé; l'option vide dit exactement ce qui se passe aujourd'hui — le moteur
 * regarde ce que la table demande et tranche.
 *
 * ⛔ ET LE CHOIX EST UN PLAFOND. La phrase d'aide le dit, parce qu'un choix
 * qu'on croit être un ordre se lit comme une panne le jour où le plan ne le
 * suit pas. Quand le plafond mord, le plan le DIT lui aussi
 * (`plan_rationale.ts`), et les deux phrases se répondent.
 */

export interface CookingShapeFieldProps {
  /**
   * LE JETON CHOISI. `null` = « laisse décider », et c'est le défaut.
   *
   * ⚠️ REQUIS ET NULLABLE, jamais optionnel: `undefined` ferait passer un site
   * de montage sans que le compilateur bronche, et le champ serait construit
   * sans être branché — « une ceinture armée sur un coffre vide ».
   */
  value: CookingShape | null;
  onChange: (next: CookingShape | null) => void;
  /** L'identifiant du `<select>`. REQUIS: deux champs sur une page les partagent sinon. */
  id: string;
  disabled: boolean;
}

export default function CookingShapeField(props: CookingShapeFieldProps) {
  return (
    <Field
      label={t("plan.cooking.shape_label")}
      hint={t("plan.cooking.shape_hint")}
      htmlFor={props.id}
    >
      <select
        id={props.id}
        className={inputClass}
        // `""` ET PAS `null`: un `<select>` dont la valeur est `null` devient
        // non contrôlé et garde en silence la sélection du navigateur.
        value={props.value ?? ""}
        disabled={props.disabled}
        onChange={(e) => props.onChange(readCookingShape(e.target.value))}
      >
        <option value="">{t("plan.cooking.shape_engine")}</option>
        {/* LES TROIS, DANS L'ORDRE DE L'ÉCHELLE, ET LUS DE LA LISTE — jamais
            trois `<option>` écrites à la main. Un quatrième barreau ajouté au
            module apparaîtrait ici sans libellé plutôt que de manquer en
            silence, et le test de correspondance le refuserait avant. */}
        {COOKING_SHAPES.map((shape) => (
          <option key={shape} value={shape}>
            {t(LABEL_KEYS[shape])}
          </option>
        ))}
      </select>
    </Field>
  );
}
