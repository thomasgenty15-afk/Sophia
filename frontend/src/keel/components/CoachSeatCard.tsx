import React from "react";

import { t } from "../i18n/t";
import {
  cancelSeatEnd,
  formatSeatEndDate,
  loadSeat,
  reactivateSeat,
  scheduleSeatEnd,
  type SeatRow,
  seatDisplayState,
  seatInterval,
  setSeatInterval,
} from "../api/coachSeat";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

/**
 * LE SIÈGE, ET SON SEUL BOUTON — `/coach/clients/:id`.
 *
 * ── LE TROU QUE CETTE CARTE FERME ────────────────────────────────────────
 * `coach_clients` portait `'paused'` depuis le premier jour, `CoachHomePage`
 * savait l'AFFICHER, et rien ne savait le POSER. Tant que le siège n'était
 * facturé qu'au-delà de 3 interactions dans le mois, ça ne se voyait pas:
 * l'élève qui partait cessait d'interagir, donc cessait d'être facturé. Le jour
 * où la facturation suit l'ABONNEMENT, ce filet disparaît et le coach paie
 * indéfiniment quelqu'un qui l'a quitté.
 *
 * ── POURQUOI L'ÉCRITURE PASSE PAR UNE RPC ────────────────────────────────
 * `coach_clients` n'a AUCUNE policy d'écriture, et c'est délibéré: une policy
 * RLS ne restreint pas les colonnes, donc ouvrir `status` ouvrirait aussi
 * `consent_granted_at` et `seat_state`. Les trois RPC de la migration
 * 20260806160000 sont la porte étroite. Cette carte n'a rien à décider là-
 * dessus: elle appelle, elle relit.
 *
 * ── RELECTURE APRÈS CHAQUE ÉCRITURE, JAMAIS D'ÉTAT OPTIMISTE ─────────────
 * Les RPC peuvent refuser (`already_coached` quand l'élève a rejoint un autre
 * coach pendant la pause) et la base est la seule à savoir. Peindre l'état
 * espéré puis le corriger ferait clignoter le siège d'un coach entre deux
 * vérités — sur l'écran qui porte sa facture.
 *
 * ── LA CONFIRMATION N'EST PAS DÉCORATIVE ─────────────────────────────────
 * Le bouton retire un accès à une personne. Il est donc `variant="secondary"`
 * et il demande confirmation, là où « Réactiver » ne demande rien: rendre
 * l'accès ne casse rien.
 */
export default function CoachSeatCard({ studentId }: { studentId: string }) {
  const [seat, setSeat] = React.useState<SeatRow | null>(null);
  const [phase, setPhase] = React.useState<"loading" | "ready" | "busy">("loading");
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const row = await loadSeat(studentId);
    setSeat(row);
  }, [studentId]);

  React.useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    loadSeat(studentId)
      .then((row) => {
        if (cancelled) return;
        setSeat(row);
        setPhase("ready");
      })
      .catch(() => {
        // Un siège illisible ne doit pas coûter la page: la carte s'efface, le
        // reste de l'écran élève reste lisible. Même arbitrage de panne que le
        // chargeur de doctrine côté serveur.
        if (!cancelled) setPhase("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  async function run(action: () => Promise<{ ok: boolean; reason: string }>) {
    setPhase("busy");
    setError(null);
    try {
      const res = await action();
      if (!res.ok) {
        setError(
          res.reason === "already_coached"
            ? t("coach.seat.error.already_coached")
            : t("coach.seat.error.generic", { message: res.reason }),
        );
      }
      await refresh();
    } catch (err) {
      setError(
        t("coach.seat.error.generic", {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setConfirming(false);
      setPhase("ready");
    }
  }

  if (phase === "loading") return null;

  const state = seatDisplayState(seat);
  // `invited` et `ended` ne portent aucune action: pas de carte plutôt qu'une
  // carte vide.
  if (state === "other") return null;

  const busy = phase === "busy";
  const endDate = formatSeatEndDate(seat?.scheduled_end_at ?? null);

  return (
    <Card className="mt-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {t("coach.seat.title")}
      </p>

      {state === "active" && (
        <>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            {t("coach.seat.active_body")}
          </p>

          {/* L'INTERVALLE DE CE SIÈGE, et il est ici plutôt que sur la page de
              facturation parce qu'il se décide PAR ÉLÈVE: le coach sait que
              CELUI-CI lui a payé l'année, pas que « sa cohorte est annuelle ».
              Une cohorte réelle est mixte. */}
          <div className="mt-4 border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("coach.seat.interval_label")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["month", "year"] as const).map((iv) => {
                const current = seatInterval(seat) === iv;
                return (
                  <button
                    key={iv}
                    type="button"
                    disabled={busy || current}
                    onClick={() => run(() => setSeatInterval(studentId, iv))}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      current
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-300 text-gray-700 hover:border-gray-400"
                    }`}
                  >
                    {iv === "year"
                      ? t("coach.seat.interval_year")
                      : t("coach.seat.interval_month")}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              {t("coach.seat.interval_hint")}
            </p>
          </div>
          {confirming ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm leading-6 text-gray-700">
                {t("coach.seat.confirm_body")}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => scheduleSeatEnd(studentId))}
                >
                  {busy ? t("coach.seat.working") : t("coach.seat.confirm_cta")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  {t("coach.seat.confirm_cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
                {t("coach.seat.deactivate_cta")}
              </Button>
            </div>
          )}
        </>
      )}

      {state === "ending" && (
        <>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            {/* `endDate` ne peut être null ici — `ending` implique une date —
                mais on ne fabrique pas de texte à partir d'un `!`: si la date
                était illisible, la phrase resterait vraie sans elle. */}
            {endDate
              ? t("coach.seat.ending_body", { date: endDate })
              : t("coach.seat.active_body")}
          </p>
          <div className="mt-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => run(() => cancelSeatEnd(studentId))}
            >
              {busy ? t("coach.seat.working") : t("coach.seat.ending_undo_cta")}
            </Button>
          </div>
        </>
      )}

      {state === "paused" && (
        <>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            {t("coach.seat.paused_body")}
          </p>
          <div className="mt-3">
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => run(() => reactivateSeat(studentId))}
            >
              {busy ? t("coach.seat.working") : t("coach.seat.reactivate_cta")}
            </Button>
          </div>
        </>
      )}

      {error ? <p className="mt-3 text-xs text-red-700">{error}</p> : null}
    </Card>
  );
}
