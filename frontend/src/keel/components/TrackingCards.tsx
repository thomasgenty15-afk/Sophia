import React from "react";

import { Card, SectionLabel } from "./ui/Card";
import { plural } from "../i18n/plural";
import { type MessageKey, t } from "../i18n/t";
import { slotLabel } from "../api/labels";
import type {
  TrackedTotal,
  TrackingDay,
  TrackingObjective,
  TrackingPermanent,
  TrackingReport,
} from "../api/tracking";

/**
 * LES DEUX BLOCS DU SUIVI — le permanent, puis l'objectif.
 *
 * ── L'ORDRE EST UNE DÉCISION ──────────────────────────────────────────────
 * Le bloc PERMANENT vient d'abord et existe pour tout le monde: il ne parle que
 * de ce que le produit a FAIT (des plans menés au bout, des repas décidés, des
 * séances de cuisine). Le bloc OBJECTIF n'apparaît qu'avec une direction posée,
 * et il est le seul à porter un chiffre d'énergie.
 *
 * ⛔ CE QUI N'EST PAS ICI, ET NE DOIT PAS Y ARRIVER
 * Aucun « il te reste X kcal »: le produit ne pilote pas un budget, et un
 * reste-à-manger transforme une lecture en consigne. Aucun POURCENTAGE
 * d'adhérence: FF-059 R10 — sommer les comptes d'un écran est un score déguisé,
 * et un score sur cette page-ci est précisément ce que la doctrine W3.2
 * interdit. Aucun « temps économisé »: personne ne l'a mesuré, et le dire est
 * une phrase du pack (`tracking.permanent.no_minutes`), pas un silence.
 *
 * ⚠️ ET AUCUN CHIFFRE N'EST CALCULÉ ICI. Tout vient du serveur, déjà sommé,
 * déjà accompagné de sa base. Un composant qui additionnerait deux kcal
 * refabriquerait le défaut que `CALORIE_REVERSAL.md` §5 ferme.
 */

/** La clé d'un total PORTE sa base — il n'existe pas de phrase sans elle. */
function totalLine(total: TrackedTotal): string {
  return t(`tracking.total.${total.basis}` as MessageKey, {
    kcal: String(total.kcal),
  });
}

function TotalRow({ scope, total }: { scope: "day" | "week" | "plan"; total: TrackedTotal | null }) {
  return (
    <div className="border-t border-line py-2 first:border-t-0">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">
        {t(`tracking.scope.${scope}` as MessageKey)}
      </p>
      <p className="mt-1 text-sm leading-6 text-ink break-words">
        {total === null ? t("tracking.total.empty") : totalLine(total)}
      </p>
    </div>
  );
}

export function TrackingSummaryCard(
  { permanent, leftoverBoxes }: {
    permanent: TrackingPermanent;
    leftoverBoxes: TrackingReport["leftoverBoxes"];
  },
) {
  return (
    <Card>
      <SectionLabel>{t("tracking.permanent.label")}</SectionLabel>
      <ul className="mt-2 space-y-1 text-sm leading-6 text-ink">
        <li>
          {plural(
            permanent.plansDone,
            t("tracking.permanent.plans_done_one", {
              count: String(permanent.plansDone),
            }),
            t("tracking.permanent.plans_done_other", {
              count: String(permanent.plansDone),
            }),
          )}
          {permanent.plansChanged > 0
            ? (
              <span className="text-ink-soft">
                {" — "}
                {plural(
                  permanent.plansChanged,
                  t("tracking.permanent.plans_changed_one", {
                    count: String(permanent.plansChanged),
                  }),
                  t("tracking.permanent.plans_changed_other", {
                    count: String(permanent.plansChanged),
                  }),
                )}
              </span>
            )
            : null}
        </li>
        <li>
          {plural(
            permanent.mealsDecided,
            t("tracking.permanent.meals_decided_one", {
              count: String(permanent.mealsDecided),
            }),
            t("tracking.permanent.meals_decided_other", {
              count: String(permanent.mealsDecided),
            }),
          )}
        </li>
        {permanent.cookSessions > 0
          ? (
            <li>
              {t("tracking.permanent.cooked", {
                sessions: String(permanent.cookSessions),
                meals: String(permanent.cookedForMeals),
              })}
            </li>
          )
          : null}
      </ul>
      {/* D7.4 — la phrase qui remplace le chiffre qu'on n'a pas. */}
      <p className="mt-2 max-w-[62ch] text-xs leading-5 text-ink-soft">
        {t("tracking.permanent.no_minutes")}
      </p>
      {/* Tant que `meal_share_outcomes` n'existe pas (A8.2), on dit INCONNU.
          Un zéro affirmerait qu'on a regardé. */}
      {leftoverBoxes.known
        ? null
        : (
          <p className="mt-1 max-w-[62ch] text-xs leading-5 text-ink-soft">
            {t("tracking.permanent.leftovers_unknown")}
          </p>
        )}
    </Card>
  );
}

function DayBlock(
  { day, dayName, photoUrls, onDescribe }: {
    day: TrackingDay;
    dayName: (iso: string) => string;
    photoUrls: Record<string, string>;
    onDescribe: (date: string, slot: string) => void;
  },
) {
  const empty = day.planned.length === 0 && day.photos.length === 0 &&
    day.missed.length === 0;
  if (empty) return null;
  return (
    <div className="border-t border-line pt-3 first:border-t-0 first:pt-0">
      <p className="text-sm font-medium text-ink">
        {dayName(day.date)}
      </p>
      <p className="mt-1 text-sm leading-6 text-ink break-words">
        {day.total === null ? t("tracking.total.empty") : totalLine(day.total)}
      </p>

      {day.planned.length > 0
        ? (
          <>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-ink-soft">
              {t("tracking.day.planned")}
            </p>
            <ul className="mt-1 space-y-1 text-sm text-ink">
              {day.planned.map((dish) => (
                <li
                  key={`${dish.mealId}:${dish.dishIndex}`}
                  className="break-words"
                >
                  {dish.title}
                  <span className="text-ink-soft">
                    {" — "}
                    {t(`tracking.dish.${dish.state}` as MessageKey)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )
        : null}

      {day.photos.length > 0
        ? (
          <>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-ink-soft">
              {t("tracking.day.photos")}
            </p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {day.photos.map((photo, i) => (
                <li key={`${day.date}:${i}`} className="text-sm text-ink">
                  {photo.mediaPath && photoUrls[photo.mediaPath]
                    ? (
                      <img
                        src={photoUrls[photo.mediaPath]}
                        alt=""
                        className="h-16 w-16 rounded object-cover"
                      />
                    )
                    : null}
                  {/* ⚠️ LA PHRASE D'UN KCAL DE PHOTO EST CELLE DE `photo.*`,
                      pas une phrase du suivi: c'est la MÊME lecture, elle doit
                      se dire avec les mêmes mots et la même base. */}
                  {photo.energy
                    ? (
                      <span className="block max-w-[24ch] text-xs leading-5 text-ink-soft break-words">
                        {t(
                          `photo.energy.${photo.energy.basis}` as MessageKey,
                          { kcal: String(photo.energy.kcal) },
                        )}
                      </span>
                    )
                    : null}
                </li>
              ))}
            </ul>
          </>
        )
        : null}

      {day.missed.length > 0
        ? (
          <>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-ink-soft">
              {t("tracking.day.missed")}
            </p>
            <ul className="mt-1 space-y-2 text-sm text-ink">
              {day.missed.map((missed) => (
                <li key={`${day.date}:${missed.slot}`}>
                  <span className="break-words">{slotLabel(missed.slot)}</span>
                  <span className="block max-w-[62ch] text-xs leading-5 text-ink-soft break-words">
                    {missed.estimate
                      ? t("tracking.energy.slot_estimate", {
                        kcal: String(missed.estimate.kcal),
                      })
                      : t("tracking.missed.no_estimate")}
                  </span>
                  {/* La seule ACTION de cette page, donc la seule figue —
                      `ui/Button.tsx` variante `primary`, réduite à la taille
                      d'une ligne de liste. Cible ≥ 24 px. */}
                  <button
                    type="button"
                    onClick={() => onDescribe(day.date, missed.slot)}
                    className="mt-1 min-h-[24px] rounded-full bg-fig-700 px-3 py-1 text-xs font-medium text-paper transition-colors hover:bg-fig-800"
                  >
                    {t("tracking.describe")}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )
        : null}
    </div>
  );
}

export function TrackingObjectiveCard(
  { objective, dayName, photoUrls, onDescribe }: {
    objective: TrackingObjective;
    dayName: (iso: string) => string;
    photoUrls: Record<string, string>;
    onDescribe: (date: string, slot: string) => void;
  },
) {
  // Du plus récent au plus ancien: un journal se lit par le haut.
  const days = [...objective.days].reverse();
  return (
    <Card>
      <SectionLabel>{t("tracking.objective.label")}</SectionLabel>
      <div className="mt-2">
        <TotalRow scope="day" total={objective.day} />
        <TotalRow scope="week" total={objective.week} />
        <TotalRow scope="plan" total={objective.plan} />
      </div>
      <div className="mt-4 space-y-3">
        {days.map((day) => (
          <DayBlock
            key={day.date}
            day={day}
            dayName={dayName}
            photoUrls={photoUrls}
            onDescribe={onDescribe}
          />
        ))}
      </div>
    </Card>
  );
}

export default TrackingSummaryCard;
