import {
  GOAL_TOKENS,
  type GoalToken,
} from "../../../../supabase/functions/_shared/keel/tokens.ts";
import { type MessageKey, t } from "../i18n/t";

/**
 * LES DIRECTIONS PROPOSÉES, ET POURQUOI ELLES NE SONT PLUS ÉCRITES ICI.
 *
 * Un mot seul ne se choisit pas: chaque fiche porte une phrase, écrite autour
 * de LA MÊME CHOSE — le sens de l'aiguille. C'est le seul critère qu'un élève
 * peut appliquer à lui-même sans se tromper (descendre / monter / ne pas
 * bouger), et c'est aussi, mot pour mot, ce que `directionIsWorking` mesure
 * ensuite dans `student_body.ts`.
 *
 * ── CE QUI A ÉTÉ RETIRÉ LE 2026-08-18, ET CE QUE ÇA CASSAIT ───────────────
 * Cet écran portait SA PROPRE liste de six jetons (`GOAL_VALUES`), dont
 * `recomposition`, `performance` et `health` — les trois retirés du socle le
 * même jour (`GOAL_TOKENS`, `RETIRED_GOAL_TOKENS`) et refusés par le `CHECK`
 * de `student_goals.goal`. Les six fiches étaient RENDUES. Cliquer l'une des
 * trois mortes appelait `indicatorFor` — un `switch` sans `default` sur les
 * trois survivants — et déréférençait `undefined.target` dans l'`onChange`;
 * l'enregistrement, lui, aurait envoyé un jeton que la base refuse.
 * `indicatorFor(g.value as GoalToken)` désarmait l'exhaustivité TypeScript qui
 * aurait dû l'attraper à la compilation: la cicatrice « `as` sur un type
 * étranger désarme le typecheck », resignée.
 *
 * ⚠️ UNE SEULE SOURCE DE VÉRITÉ, DÉSORMAIS: `GOAL_TOKENS`. La liste que la
 * base accepte, celle que `parseGoalToken` valide, celle que la doctrine
 * (`goalScope`) porte et celle que cet écran propose sont le MÊME tableau. Un
 * jeton ajouté ou retiré au socle traverse jusqu'ici sans qu'on y pense, et
 * `bodyMeasures.int.test.ts` (« l'écran ne propose que des directions que la
 * base accepte ») tombe si quelqu'un remet une liste locale à la place.
 *
 * LES MOTS, eux, vivent dans le seed — les jetons restent anglais et
 * snake_case (R1).
 */

/** Une FONCTION: une table de module se figerait à la langue du démarrage. */
export function goalOptions(): Array<
  { value: GoalToken; label: string; blurb: string }
> {
  return GOAL_TOKENS.map((value) => ({
    value,
    label: t(`plan.goal.${value}.label` as MessageKey),
    blurb: t(`plan.goal.${value}.blurb` as MessageKey),
  }));
}
