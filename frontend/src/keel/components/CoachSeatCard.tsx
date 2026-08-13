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
import { Card, SectionLabel } from "./ui/Card";

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
 *
 * ⚠️ CE QUI A CHANGÉ AU PASSAGE À LA CHARTE, ET POURQUOI (2026-08-13):
 * le DÉCLENCHEUR reste `secondary` — le raisonnement ci-dessus est intact — mais
 * le bouton de CONFIRMATION est passé de `primary` à `danger`. Le kit a une
 * variante pour un geste destructeur, et un aplat de la teinte de marque sur
 * « oui, ferme ce siège » recommandait l'action au lieu de la nommer.
 * Et « Réactiver » est passé de `primary` à `secondary`: cette carte est montée
 * sur `/coach/clients/:id` sous `CoachNoteCard`, qui porte l'unique action
 * principale de la page. La règle est « une seule action figue par vue rendue ».
 * Cette carte n'en pose donc plus aucune.
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
      {/* ⚠️ L'ÉTIQUETTE MAISON EST DEVENUE `SectionLabel`. C'était un
          `<p className="text-xs font-semibold uppercase tracking-wide gray-400">`
          — le composant du kit refabriqué à la main, et mal: `gray-400` sur blanc
          fait 2,84:1, sous le seuil 4,5 du texte. `SectionLabel` est un `h2`,
          porte l'équerre et rend `text-label` + `ink-soft` (6,11:1).
          ⚠️ NE POSE PAS DE `px-*` sur ce nœud: `.eq` écrit `padding-left` hors de
          toute couche CSS et gagnerait contre lui. */}
      <SectionLabel>{t("coach.seat.title")}</SectionLabel>

      {state === "active" && (
        <>
          <p className="max-w-[62ch] text-sm leading-6 text-ink-soft">
            {t("coach.seat.active_body")}
          </p>

          {/* L'INTERVALLE DE CE SIÈGE, et il est ici plutôt que sur la page de
              facturation parce qu'il se décide PAR ÉLÈVE: le coach sait que
              CELUI-CI lui a payé l'année, pas que « sa cohorte est annuelle ».
              Une cohorte réelle est mixte. */}
          {/* `border-line` (1,30:1) et pas `line-strong`: une règle horizontale
              À L'INTÉRIEUR d'une carte est le seul emploi légitime du séparateur
              décoratif. Ce n'est pas la bordure d'un contrôle. */}
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-label font-semibold uppercase text-ink-soft">
              {t("coach.seat.interval_label")}
            </p>
            {/* ── L'INTERVALLE COURANT EST UN FAIT, PAS UNE ACTION ──────────
                Ce sélecteur portait `bg-gray-900 text-white` sur le segment
                actif: un aplat sombre, c'est-à-dire un accent de marque qui
                n'osait pas se nommer. Le premier passage l'a mis en `fig-700` —
                et MESURÉ AU NAVIGATEUR, ça donnait DEUX pastilles figue sur
                `/coach/clients/:id`: celle-ci et le « Save » de `CoachNoteCard`.
                Le kit n'en autorise qu'une par vue rendue.
                La sortie n'est pas d'arbitrer laquelle gagne, c'est de voir que
                ce segment n'est pas une action: « ce siège est au mois » est un
                RÉGLAGE ENREGISTRÉ, un fait sur le siège. Il porte donc le
                remplissage neutre du produit (`bg-line`, celui de
                `Badge tone="neutral"`), et c'est le segment qu'on PEUT presser
                qui garde un contour de contrôle.
                ⚠️ NE LE REPEINS PAS EN FIGUE « pour qu'on voie mieux la
                sélection »: la sélection se voit à la FORME — un fond sans
                contour d'un côté, un contour sans fond de l'autre — et le segment
                courant est de toute façon `disabled`, donc sans survol.
                Le seul endroit du coach où une pastille pleine et figue dit « où
                je suis » est le sélecteur de semaine de `/coach/weekly`: là c'est
                de la NAVIGATION entre rapports, le même vocabulaire que la
                pastille active du shell.
                `ring` plutôt qu'une bordure: la sélection ne décale pas la ligne
                d'un pixel quand elle change de segment. `ring-line-strong` =
                3,84:1 (WCAG 1.4.11); `gray-300`, remplacé, était à 1,86:1. */}
            <div className="mt-2 flex flex-wrap gap-2">
              {(["month", "year"] as const).map((iv) => {
                const current = seatInterval(seat) === iv;
                return (
                  <button
                    key={iv}
                    type="button"
                    aria-current={current ? "true" : undefined}
                    disabled={busy || current}
                    onClick={() => run(() => setSeatInterval(studentId, iv))}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      current
                        ? "bg-line text-ink"
                        : "bg-paper text-ink ring-1 ring-line-strong hover:bg-fig-50"
                    }`}
                  >
                    {iv === "year"
                      ? t("coach.seat.interval_year")
                      : t("coach.seat.interval_month")}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 max-w-[62ch] text-xs leading-5 text-ink-soft">
              {t("coach.seat.interval_hint")}
            </p>
          </div>
          {confirming ? (
            // ⛔ L'AMBRE RESTE: la boîte de confirmation PORTE UN FAIT — « tu es
            // sur le point de retirer un accès ». Un état a le droit d'être une
            // surface, pas seulement une pastille. Seul le rayon a suivi le kit.
            <div className="mt-3 rounded-card border border-amber-200 bg-amber-50 p-3">
              <p className="max-w-[62ch] text-sm leading-6 text-amber-900">
                {t("coach.seat.confirm_body")}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {/* ⚠️ `primary` → `danger`, ET C'EST PLUS JUSTE, PAS PLUS PRUDENT.
                    Ce bouton PROGRAMME LA FIN D'UN SIÈGE: il retire un accès à
                    une personne. Le kit a une variante pour ça, et c'est un état
                    (`red-700` sur `paper` = 6,13:1) — un aplat de marque disait
                    « voici l'action recommandée » sur le seul geste destructeur
                    de l'écran. Ça libère aussi la figue: `CoachNoteCard`, montée
                    juste au-dessus sur la même page, garde la seule action
                    principale de `/coach/clients/:id`.
                    L'en-tête de ce fichier dit que « le bouton est `secondary` et
                    demande confirmation » — c'est du DÉCLENCHEUR qu'il parle
                    (plus bas, inchangé), pas de cette confirmation-ci. */}
                <Button
                  variant="danger"
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
          <p className="max-w-[62ch] text-sm leading-6 text-ink-soft">
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
          <p className="max-w-[62ch] text-sm leading-6 text-ink-soft">
            {t("coach.seat.paused_body")}
          </p>
          {/* ⚠️ `primary` → `secondary`, ET C'EST UNE CONTRAINTE D'ÉCRAN, PAS UN
              AVIS SUR CE GESTE. `/coach/clients/:id` monte quatre composants, et
              deux posaient un aplat `fig-700`: le « Save » de `CoachNoteCard` et
              ce « Réactiver ». Deux boutons de marque côte à côte, c'est zéro
              hiérarchie — le kit n'en autorise qu'UN par vue rendue.
              C'est la note qui garde la marque: elle est la seule écriture
              ROUTINIÈRE de la page, l'état `paused` est rare, et un `secondary`
              activé à côté d'un `primary` désactivé (Save l'est tant que rien
              n'est tapé) reste le geste évident de la page. */}
          <div className="mt-3">
            <Button
              variant="secondary"
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
