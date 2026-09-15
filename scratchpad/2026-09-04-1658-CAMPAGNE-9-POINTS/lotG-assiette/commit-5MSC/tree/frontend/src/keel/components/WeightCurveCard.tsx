import React from "react";

import { Card, SectionLabel } from "./ui/Card";
import { type MessageKey, t } from "../i18n/t";
import { formatDate } from "../i18n/format";
import {
  curveGeometry,
  pointsInPeriod,
  WEIGHT_PERIODS,
  type WeightPeriod,
} from "../lib/weightCurve";
import type { TrackingWeightPoint } from "../api/tracking";

/**
 * LA COURBE DE POIDS — six fenêtres, un SVG, aucune bibliothèque.
 *
 * ⟳ FF-031 §3 est renversée PAR ÉCRIT dans `lib/weightCurve.ts` (D7.10), avec
 * ce qui change et ce qui ne change pas. Ici, seulement le rendu.
 *
 * ⛔ AUCUN COMPOSANT DE GRAPHE DANS `ui/`. Une primitive de graphique se
 * justifie au troisième usage; il y en a UN. Un `<svg>` de trente lignes se
 * relit, une abstraction de graphe ne se relit jamais.
 *
 * ⚠️ LA COURBE NE MÈNE PAS L'ÉCRAN, et elle est en bas. La raison est celle de
 * la page depuis le 2026-08-03: la variation d'eau quotidienne (±1-2 kg)
 * dépasse le signal hebdomadaire, et c'est la métrique la plus associée aux
 * troubles alimentaires. Elle est affichée en clair — arbitrage produit — mais
 * elle ne commence jamais une page.
 *
 * ⚠️ SOUS PLANCHER TCA, CE COMPOSANT N'EST PAS MONTÉ DU TOUT, parce que le
 * serveur rend `weight: null` avant d'avoir lu une pesée. Ce n'est pas un `if`
 * d'affichage ici — un `if` d'affichage se retire par distraction.
 */

const BOX = { width: 320, height: 120, padding: 12 };

export function WeightCurveCard(
  { points, today }: { points: TrackingWeightPoint[]; today: string },
) {
  const [period, setPeriod] = React.useState<WeightPeriod>("1m");
  const shown = pointsInPeriod(points, period, today);
  const geometry = curveGeometry(shown, BOX);
  const last = shown.length > 0 ? shown[shown.length - 1] : null;

  return (
    <Card>
      <SectionLabel>{t("tracking.weight.label")}</SectionLabel>

      {/* Les six fenêtres sont de la NAVIGATION — même forme que les onglets du
          shell et que le sélecteur semaine/mois de cette page. Elles ne
          mesurent rien, elles choisissent ce qu'on regarde. */}
      <div className="mt-2 flex flex-wrap gap-1" role="group">
        {WEIGHT_PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            aria-pressed={period === p}
            className={`min-h-[24px] rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              period === p
                ? "bg-fig-700 text-paper"
                : "text-ink-soft hover:bg-fig-50 hover:text-ink"
            }`}
          >
            {t(`tracking.weight.period.${p}` as MessageKey)}
          </button>
        ))}
      </div>

      {geometry === null
        ? (
          <p className="mt-3 text-sm text-ink-soft">
            {t("tracking.weight.empty")}
          </p>
        )
        : (
          <>
            {last
              ? (
                <p className="mt-3 text-3xl font-semibold text-ink">
                  {last.value.toFixed(1)}
                  <span className="text-lg text-ink-soft">
                    {" "}
                    {t("unit.kg")}
                  </span>
                </p>
              )
              : null}
            {/* Le SVG défile dans son conteneur plutôt que d'élargir la page:
                à 320 px de large, une carte qui déborde emmène toute la
                colonne avec elle. */}
            <div className="mt-2 overflow-x-auto">
              <svg
                viewBox={`0 0 ${BOX.width} ${BOX.height}`}
                width={BOX.width}
                height={BOX.height}
                role="img"
                aria-label={t("tracking.weight.label")}
                className="max-w-full"
              >
                {geometry.path
                  ? (
                    <path
                      d={geometry.path}
                      fill="none"
                      stroke="var(--color-fig-700)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )
                  : null}
                {geometry.dots.map((dot) => (
                  <circle
                    key={dot.localDate}
                    cx={dot.x}
                    cy={dot.y}
                    r="2.5"
                    fill="var(--color-fig-700)"
                  >
                    <title>
                      {t("tracking.weight.point", {
                        value: dot.value.toFixed(1),
                        date: formatDate(dot.localDate),
                      })}
                    </title>
                  </circle>
                ))}
              </svg>
            </div>
            <p className="mt-2 max-w-[62ch] text-xs leading-5 text-ink-soft">
              {t("student_progress.weight.footnote")}
            </p>
          </>
        )}
    </Card>
  );
}

export default WeightCurveCard;
