import React from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { useHouseholdAccess } from "../../context/HouseholdAccessContext";
import { plural } from "../i18n/plural";
import { t } from "../i18n/t";
import { todayUtcIso } from "../pages/householdBilling";
import { trialBannerDecision } from "./trialBannerDecision";

/**
 * FF-064 — « TA SEMAINE OFFERTE SE TERMINE ».
 *
 * ── IL NE COÛTE AUCUNE LECTURE ────────────────────────────────────────────
 * Il lit `useHouseholdAccess()`, c'est-à-dire EXACTEMENT la même réponse que
 * le mur de paiement, obtenue une fois par session au-dessus du routeur. Un
 * bandeau monté sur chaque écran qui interrogerait le serveur lui-même
 * ajouterait un appel par navigation, et surtout: il pourrait annoncer deux
 * jours restants pendant que le mur, lui, aurait déjà fermé.
 *
 * ── UN LIEN, PAS UN BOUTON ────────────────────────────────────────────────
 * L'action vit sur `/app/billing`. Le bandeau porte l'information; lui donner
 * un bouton principal ferait deux actions principales sur chaque écran de
 * l'app, ce que la charte interdit — et ce serait la même sur toutes.
 *
 * ── LE PIÈGE DU MODE `fill` ───────────────────────────────────────────────
 * ⚠️ `shrink-0` N'EST PAS DÉCORATIF. `/app/chat` monte la coquille en
 * `flex h-[100dvh] flex-col overflow-hidden`: sans cette classe, ce bandeau se
 * fait écraser à zéro (ou pousse le composeur hors de l'écran, selon le
 * contenu). C'est la panne déjà payée et documentée dans le commentaire
 * `h-` vs `min-h-` de `KeelAppShell`.
 *
 * ⛔ PAS EN BAS DE L'ÉCRAN. La barre d'onglets élève y est déjà (`fixed
 * bottom-0`), `StickyCta` aussi ailleurs, et sur iPhone la barre gestuelle
 * mange les derniers 34 px.
 */
export function TrialEndingBanner() {
  const { user, subscription } = useAuth();
  const { coverage } = useHouseholdAccess();
  const today = React.useMemo(() => todayUtcIso(), []);

  // La clé porte LA DATE: rejeter vaut pour la journée, pas pour l'essai. Sans
  // ça, un clic à J-2 emporterait aussi le dernier avertissement.
  const key = user?.id ? `keel.trial_banner.dismissed:${user.id}` : null;
  const [dismissedFor, setDismissedFor] = React.useState<string | null>(() => {
    if (!key) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      // Navigation privée, stockage refusé: on n'a jamais rejeté. Le bandeau
      // s'affiche, ce qui est le sens sûr — il informe, il ne bloque rien.
      return null;
    }
  });

  const decision = trialBannerDecision({
    coverage,
    subscription,
    today,
    dismissedFor,
  });
  if (!decision.show) return null;

  const days = plural(
    decision.daysLeft,
    t("shell.trial.days_one", { count: decision.daysLeft }),
    t("shell.trial.days_many", { count: decision.daysLeft }),
  );

  return (
    <div
      data-testid="trial-ending-banner"
      // `amber-50` / `ink`: un compte à rebours est un ÉTAT du système, et
      // l'ambre est sa couleur dans ce dépôt (la même surface que le panneau de
      // pause). Le texte reste `ink` — 16,46:1 mesuré sur cette surface.
      className="shrink-0 border-b border-amber-200 bg-amber-50"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 text-sm">
        <p className="min-w-0 flex-1 text-ink">
          {t("shell.trial.ending", { days })}{" "}
          <Link
            to="/app/billing"
            className="underline decoration-line-strong hover:text-ink"
          >
            {t("shell.trial.cta")}
          </Link>
        </p>
        {decision.dismissible
          ? (
            <button
              type="button"
              aria-label={t("shell.trial.dismiss")}
              onClick={() => {
                setDismissedFor(today);
                if (!key) return;
                try {
                  window.localStorage.setItem(key, today);
                } catch {
                  // Rien à faire: le rejet vaut alors pour ce rendu seulement.
                }
              }}
              className="shrink-0 rounded-full p-1 text-ink-soft transition-colors hover:bg-amber-100 hover:text-ink"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )
          : null}
      </div>
    </div>
  );
}

export default TrialEndingBanner;
