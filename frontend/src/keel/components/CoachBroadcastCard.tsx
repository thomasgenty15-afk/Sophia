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
import { Card, SectionLabel } from "./ui/Card";
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
    // ⚠️ `mb-8` AJOUTÉ, ET C'EST UN DÉFAUT MESURÉ AU RENDU, PAS UNE PRÉFÉRENCE.
    // Cette carte n'avait qu'un `mt-6`. Les sections de `/coach` se séparent
    // toutes par `mb-8` (32 px) — sauf après celle-ci, qui n'en posait aucune:
    // l'étiquette « STUDENTS » de la section suivante se retrouvait à 6 px du
    // bord inférieur de cette carte, son équerre collée au trait. Invisible tant
    // que l'étiquette était un `<p>` gris clair; la signature l'a rendu criant.
    <Card className="mt-6 mb-8">
      {/* ⚠️ L'ÉTIQUETTE MAISON EST DEVENUE `SectionLabel`: c'était le composant
          du kit recopié à la main, en `gray-400` (2,84:1 sur blanc, sous le seuil
          4,5 du texte). Le kit rend `text-label` + `ink-soft` = 6,11:1, en `h2`,
          avec l'équerre.
          ⚠️ NE POSE PAS DE `px-*` sur ce nœud: `.eq` écrit son `padding-left`
          hors de toute couche CSS. */}
      <SectionLabel>{t("coach.broadcast.title")}</SectionLabel>
      <p className="max-w-[62ch] text-sm leading-6 text-ink-soft">{t("coach.broadcast.body")}</p>

      {block === "no_recipients" ? (
        <p className="mt-3 max-w-[62ch] text-sm leading-6 text-ink-soft">
          {t("coach.broadcast.blocked.no_recipients")}
        </p>
      ) : block === "already_sent_this_week" ? (
        <p className="mt-3 max-w-[62ch] text-sm leading-6 text-ink-soft">
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
            <p className="text-xs text-ink-soft">
              {t("coach.broadcast.recipients", { count: String(state.recipients) })}
              {" · "}
              {t("coach.broadcast.chars_left", { count: String(Math.max(0, remaining)) })}
            </p>
            <div className="flex items-center gap-3">
              {justSent ? (
                <span className="text-xs text-ink-soft">{t("coach.broadcast.sent")}</span>
              ) : null}
              {/* ⚠️ `primary` → `secondary`, ET C'EST UNE CONTRAINTE D'ÉCRAN.
                  Cette carte est montée au milieu de `/coach`, dont l'en-tête dit
                  « l'invitation est la SEULE action de cet écran » — et
                  `CoachHomePage` rend ce bouton d'invitation en `primary`. Deux
                  aplats `fig-700` sur la même vue, c'est zéro hiérarchie; le kit
                  n'en autorise qu'un par vue rendue.
                  Le geste ne perd rien: il est de toute façon désactivé la
                  plupart du temps (la cadence d'un mot par semaine est tenue en
                  base), et un contour de contrôle sous une zone de saisie se lit
                  comme le bouton d'envoi de cette zone. */}
              <Button
                variant="secondary"
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
        // `border-line` (1,30:1): règle horizontale À L'INTÉRIEUR d'une carte,
        // le seul emploi du séparateur décoratif de la charte.
        <div className="mt-3 border-t border-line pt-3">
          <p className="max-w-[62ch] text-xs leading-5 text-ink-soft">
            {last.finished_at
              ? t("coach.broadcast.last_result", {
                delivered: String(last.delivered_count),
                skipped: String(last.skipped_count),
              })
              : t("coach.broadcast.last_pending")}
          </p>
          {last.finished_at && last.skipped_count > 0 ? (
            <p className="mt-1 max-w-[62ch] text-xs leading-5 text-ink-soft">
              {t("coach.broadcast.skipped_hint")}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-3 text-xs text-red-700">{error}</p> : null}
    </Card>
  );
}
