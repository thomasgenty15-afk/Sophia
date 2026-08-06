import React from "react";

import { t } from "../i18n/t";
import {
  BROADCAST_MAX_CHARS,
  type BroadcastState,
  broadcastGate,
  formatNextWindow,
  loadBroadcastState,
  sendBroadcast,
} from "../api/coachBroadcast";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { inputClass } from "./ui/Field";

/**
 * LE MOT DU COACH À TOUTE SA COHORTE — `/coach`.
 *
 * ── LE TROU QUE CETTE CARTE FERME ────────────────────────────────────────
 * Il n'existait AUCUN canal coach → élèves. L'élève paie pour la méthode de son
 * coach et ne le voit jamais: l'autorité qui a porté l'adoption ne se renouvelle
 * jamais. C'est le trou de rétention le moins cher à combler du produit.
 *
 * ── POURQUOI ELLE EST SUR `/coach` ET PAS SUR LA FICHE D'UN ÉLÈVE ────────
 * Parce que le geste ne grandit pas avec la cohorte. La note par élève vit sur
 * `CoachStudentPage` et c'est cohérent: elle parle d'UNE personne. Celle-ci
 * parle à TOUT LE MONDE, donc elle vit sur l'écran de la cohorte — et l'endroit
 * dit la nature du geste avant que la copie ne l'explique.
 *
 * ── LA CADENCE EST AFFICHÉE, JAMAIS SEULEMENT APPLIQUÉE ─────────────────
 * La limite d'un par semaine est tenue en base (index unique). Ici on ne la
 * duplique pas: on la LIT (`can_send_now`, calculé par la RPC) et on affiche la
 * date de réouverture. Un bouton grisé sans phrase est un bouton dont le coach
 * ne sait pas quoi faire.
 *
 * ── ON MONTRE LES ÉCARTS ────────────────────────────────────────────────
 * `skipped_count` est affiché. Un élève peut ne pas recevoir: plafond quotidien
 * atteint, notifications coupées. Cacher ce chiffre laisserait le coach croire
 * que toute sa cohorte a lu — c'est la même règle que « le silence n'est jamais
 * arrondi vers le haut », appliquée à ce qu'on lui montre à lui.
 */
export default function CoachBroadcastCard() {
  const [state, setState] = React.useState<BroadcastState | null>(null);
  const [phase, setPhase] = React.useState<"loading" | "ready" | "sending">("loading");
  const [draft, setDraft] = React.useState("");
  const [justSent, setJustSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    loadBroadcastState()
      .then((s) => {
        if (cancelled) return;
        setState(s);
        setPhase("ready");
      })
      .catch(() => {
        // Un état illisible ne doit pas coûter l'écran de la cohorte: la carte
        // s'efface. Même arbitrage de panne que la carte de siège.
        if (!cancelled) setPhase("ready");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSend() {
    setPhase("sending");
    setError(null);
    try {
      const res = await sendBroadcast(draft.trim());
      if (res.ok) {
        setDraft("");
        setJustSent(true);
      } else {
        setError(t("coach.broadcast.error", { message: res.reason }));
      }
      // RELECTURE APRÈS ÉCRITURE, JAMAIS D'ÉTAT OPTIMISTE: la cadence est
      // décidée en base, et peindre « envoyé » sur un refus ferait recliquer.
      setState(await loadBroadcastState());
    } catch (err) {
      setError(
        t("coach.broadcast.error", {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setPhase("ready");
    }
  }

  if (phase === "loading" || !state) return null;

  const block = broadcastGate(state, draft);
  const busy = phase === "sending";
  const remaining = BROADCAST_MAX_CHARS - draft.trim().length;
  const nextWindow = formatNextWindow(state.nextWindowOpensAt);
  const last = state.last;

  return (
    <Card className="mt-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {t("coach.broadcast.title")}
      </p>
      <p className="mt-2 text-sm leading-6 text-gray-600">{t("coach.broadcast.body")}</p>

      {block === "no_recipients" ? (
        <p className="mt-3 text-sm leading-6 text-gray-500">
          {t("coach.broadcast.blocked.no_recipients")}
        </p>
      ) : block === "already_sent_this_week" ? (
        <p className="mt-3 text-sm leading-6 text-gray-500">
          {nextWindow
            ? t("coach.broadcast.blocked.already_sent", { date: nextWindow })
            : t("coach.broadcast.blocked.already_sent", { date: "—" })}
        </p>
      ) : (
        <>
          <textarea
            className={`${inputClass} mt-3 min-h-[6rem] resize-y`}
            value={draft}
            maxLength={BROADCAST_MAX_CHARS}
            placeholder={t("coach.broadcast.placeholder")}
            disabled={busy}
            onChange={(e) => {
              setDraft(e.target.value);
              setJustSent(false);
            }}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              {t("coach.broadcast.recipients", { count: String(state.recipients) })}
              {" · "}
              {t("coach.broadcast.chars_left", { count: String(Math.max(0, remaining)) })}
            </p>
            <div className="flex items-center gap-3">
              {justSent ? (
                <span className="text-xs text-gray-500">{t("coach.broadcast.sent")}</span>
              ) : null}
              <Button
                variant="primary"
                size="sm"
                disabled={block !== null || busy}
                onClick={onSend}
              >
                {busy ? t("coach.broadcast.sending") : t("coach.broadcast.send")}
              </Button>
            </div>
          </div>
        </>
      )}

      {last ? (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-xs leading-5 text-gray-500">
            {last.finished_at
              ? t("coach.broadcast.last_result", {
                delivered: String(last.delivered_count),
                skipped: String(last.skipped_count),
              })
              : t("coach.broadcast.last_pending")}
          </p>
          {last.finished_at && last.skipped_count > 0 ? (
            <p className="mt-1 text-xs leading-5 text-gray-400">
              {t("coach.broadcast.skipped_hint")}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-3 text-xs text-red-700">{error}</p> : null}
    </Card>
  );
}
