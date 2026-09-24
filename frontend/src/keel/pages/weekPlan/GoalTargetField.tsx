// ⟳ 2026-09-24 — SORTI DE `StudentWeekPlanPage.tsx` (découpage, lot 4a), À L'IDENTIQUE.
// Ce que la dynamique choisie vise: un chiffre, ou un axe.
// Le fichier d'origine l'importe; il ré-exporte ce qu'il exportait.

import { inputClass } from "../../components/ui/Field";
import {
  axisReading,
  FOCUS_AXES,
  focusAxisLabel,
  type FocusAxis,
  indicatorFor,
  type ReviewRow,
} from "../../api/bodyMeasures";
import type { GoalToken } from "../../../../../supabase/functions/_shared/keel/tokens.ts";
import { type MessageKey, t } from "../../i18n/t";

/**
 * LES MESURES DE CETTE DIRECTION-LÀ.
 *
 * Trois blocs, et le premier est le seul obligatoire:
 *   1. ce que l'élève a saisi, DATÉ, avec la tendance quand il y a de quoi;
 *   2. la cible — seulement pour les dynamiques qui en ont une;
 *   3. la mise à jour, qui passe par le formulaire (voir `saveMeasures`).
 *
 * Ce composant ne DÉCIDE rien: `indicatorFor` et `readIndicator` décident, et
 * ils sont testés sans React (`bodyMeasures.int.test.ts`). Ici il n'y a que de
 * l'affichage — c'est ce qui permet à la règle « poids ↑ = victoire en prise
 * de masse » d'être la même à l'écran et dans le générateur.
 */
/**
 * CE QUE CETTE DYNAMIQUE VISE — un chiffre, ou un axe, jamais les deux.
 *
 * ── POURQUOI C'EST DANS L'OPTION ET PLUS DANS UN ENCADRÉ EN DESSOUS ───────
 * Ça vivait dans un bloc « What this goal tracks » posé sous la liste des six
 * dynamiques. Deux défauts, et le second est le vrai:
 *
 *   1. la question n'était pas rattachée visuellement à ce qui la déclenche —
 *      on choisit « perdre du poids » en haut, et le champ du poids visé
 *      apparaît ailleurs, dans un cadre qui a son propre titre;
 *   2. ce bloc CHANGEAIT DE CONTENU selon l'option cochée sans qu'on regarde
 *      au bon endroit. Cocher « Eat better » remplaçait le champ de poids par
 *      un menu d'axes, en dehors du champ de vision de qui vient de cliquer.
 *
 * La cible appartient à la dynamique: elle apparaît AVEC elle, à l'endroit
 * où on vient d'appuyer, et disparaît avec elle.
 */
export function GoalTargetField(props: {
  goal: GoalToken;
  reviews: ReviewRow[];
  target: string;
  onTargetChange: (v: string) => void;
  axis: string;
  onAxisChange: (v: string) => void;
  /** Le plancher TCA: aucun chiffre à VISER pour un élève signalé. */
  restricted: boolean;
}) {
  const indicator = indicatorFor(props.goal);
  const targetUnit: MessageKey = indicator.target === "waist" ? "unit.cm" : "unit.kg";
  const targetLabel = t(
    indicator.target === "band"
      ? "plan.goal.target_band"
      : indicator.target === "waist"
      ? "plan.goal.target_waist"
      : "plan.goal.target_weight",
  );
  const axis = props.axis && (FOCUS_AXES as readonly string[]).includes(props.axis)
    ? axisReading(props.reviews, props.axis as FocusAxis)
    : null;

  // LE PLANCHER MORD ICI AUSSI, et pas seulement sur les mesures.
  // Il couvrait l'encadré entier; en éclatant l'encadré, la cible se serait
  // retrouvée dehors — c'est-à-dire un champ « poids que je vise » remis sous
  // les yeux de la personne que la garde protège. L'AXE, lui, reste: ce n'est
  // pas un nombre à atteindre, c'est ce qu'on veut voir s'améliorer.
  if (indicator.target !== null && props.restricted) return null;

  if (indicator.target !== null) {
    return (
      <div className="mt-3">
        <label htmlFor="goal-target" className="block text-label font-semibold uppercase text-ink-soft">
          {targetLabel}
        </label>
        {/* Un champ étroit avec son unité collée: trois chiffres dans une
            boîte pleine largeur donnent l'impression d'attendre une phrase. */}
        {/* LA LARGEUR EST SUR UN CONTENEUR, PAS SUR L'INPUT.
            `inputClass` porte `w-full`, et `w-full` gagne contre `w-24` quel
            que soit l'ordre dans l'attribut `class` — c'est l'ordre du CSS
            généré par Tailwind qui tranche, pas celui qu'on écrit. Le
            `${inputClass} w-24` d'avant était donc un no-op: mesuré, ce champ
            faisait 606 px au lieu de 96. */}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <div className="w-24">
            <input
              id="goal-target"
              className={inputClass}
              inputMode="decimal"
              value={props.target}
              placeholder="—"
              onChange={(e) => props.onTargetChange(e.target.value)}
            />
          </div>
          <span className="text-sm text-ink-soft">{t(targetUnit)}</span>
          <span className="text-xs text-ink-soft">{t("plan.goal.optional")}</span>
        </div>
        <p className="mt-1.5 text-xs leading-5 text-ink-soft">
          {t("plan.goal.target_hint")}
        </p>
      </div>
    );
  }

  // L'AXE, pour les deux dynamiques qu'aucun chiffre ne porte. Les six valeurs
  // sont celles du point du dimanche: l'objectif est mesurable sans une seule
  // saisie de plus.
  return (
    <div className="mt-3">
      <label htmlFor="goal-axis" className="block text-label font-semibold uppercase text-ink-soft">
        {t("plan.goal.axis_label")}
      </label>
      <select
        id="goal-axis"
        className={`${inputClass} mt-1`}
        value={props.axis}
        onChange={(e) => props.onAxisChange(e.target.value)}
      >
        <option value="">{t("plan.goal.axis_none")}</option>
        {FOCUS_AXES.map((a) => (
          <option key={a} value={a}>{focusAxisLabel(a)}</option>
        ))}
      </select>
      <p className="mt-1.5 text-xs leading-5 text-ink-soft">
        {t("plan.goal.axis_hint")}
      </p>
      {axis ? (
        <p className="mt-2 text-sm text-ink">
          {axis.latest === null
            ? t("plan.goal.axis_unrated")
            : axis.trend === "unknown"
            ? t("plan.goal.axis_last_sunday", { value: axis.latest.value })
            : t(
              axis.improving
                ? "plan.goal.axis_rising"
                : axis.trend === "falling"
                ? "plan.goal.axis_falling"
                : "plan.goal.axis_steady",
              { axis: axis.label },
            )}
        </p>
      ) : null}
    </div>
  );
}
