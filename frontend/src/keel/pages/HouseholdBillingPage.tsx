import React from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useHouseholdAccess } from "../../context/HouseholdAccessContext";
import { supabase } from "../../lib/supabase";
import {
  type HouseholdView,
  loadHousehold,
  openHouseholdCheckout,
} from "../api/household";
import { ExtraAccessCard } from "../components/ExtraAccessCard";
import { KeelAppShell } from "../components/KeelAppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { OfferLines } from "../components/ui/OfferLines";
import { formatDateLong } from "../i18n/format";
import { plural } from "../i18n/plural";
import { t } from "../i18n/t";
// L'arithmétique vit à côté — Fast Refresh, et elle se teste sans monter React.
import {
  householdBillingKind,
  isHouseholdOwner,
  todayUtcIso,
  trialDaysLeftInclusive,
} from "./householdBilling";

// ---------------------------------------------------------------------------
// FF-064 — `/app/billing`: LA SEULE SURFACE OÙ L'ARGENT SE DEMANDE
// ---------------------------------------------------------------------------
//
// ── LE DÉFAUT QU'ELLE FERME, MESURÉ LE 2026-09-09 ─────────────────────────
// Tout le socle Stripe du foyer existait et ne vendait rien. Le seul bouton de
// paiement du produit vivait dans une carte de `/app/household` qui
// n'apparaissait qu'une fois le foyer DÉJÀ gelé, et le tunnel REFUSAIT
// (`409 household_in_trial`) tant que l'essai courait. Autrement dit: on ne
// pouvait payer ni avant, ni pendant — seulement après la coupure, et
// seulement en trouvant un écran qui ne l'annonçait nulle part.
//
// ── UN SEUL APPEL, DEUX GESTES ────────────────────────────────────────────
// « S'abonner » et « gérer mon abonnement » passent par le MÊME
// `openHouseholdCheckout()`: la fonction edge rend une session de portail
// quand un abonnement est déjà vivant. Décider ici lequel des deux appeler
// dupliquerait la question « a-t-il payé ? » côté navigateur, où la réponse
// est fausse pendant les quelques secondes qui séparent le retour de Stripe de
// l'arrivée du webhook.
//
// ── CE QUE CET ÉCRAN NE DÉCIDE PAS ────────────────────────────────────────
// Ni la couverture (`keel_household_is_covered`, en base), ni le prix
// (`PRICES` + `<OfferLines />`), ni la date de reprise d'un foyer gelé (elle
// est chez Stripe). Il LIT et il ouvre une porte.
//
// ⛔ UNE SEULE ACTION PRINCIPALE PAR ÉTAT. Les cinq cartes ci-dessous ne sont
// jamais rendues ensemble, et aucune ne porte deux `variant="primary"`.

/** La clé de la tentative unique de synchronisation, par personne et par retour. */
function syncKey(userId: string, tag: string): string {
  return `keel.household_billing_sync:${userId}:${tag}`;
}

export function HouseholdBillingPage() {
  const { user, subscription } = useAuth();
  const { status, coverage, refresh } = useHouseholdAccess();
  const [params, setParams] = useSearchParams();

  // LE ROSTER, POUR LA SEULE CARTE QUI EN A BESOIN. `null` = pas lu: la carte
  // se rend elle-même invisible plutôt que d'afficher une liste vide, qui se
  // lirait comme « il n'y a personne à inviter ».
  const [household, setHousehold] = React.useState<HouseholdView | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [syncing, setSyncing] = React.useState(false);

  const billingParam = params.get("billing");
  const sessionId = params.get("session_id");

  // ── LE RETOUR DE STRIPE, ET SA TENTATIVE UNIQUE ─────────────────────────
  // Le webhook peut atterrir APRÈS le navigateur. Sans ceci, quelqu'un qui
  // vient de payer revient sur « ton foyer est en pause ». Avec une tentative
  // NON gardée, on obtient une boucle de rechargement infinie le jour où
  // Stripe est lent — d'où le drapeau en `sessionStorage`, le même patron que
  // `UpgradePlan.tsx`.
  React.useEffect(() => {
    if (!user?.id) return;
    if (billingParam !== "success" && billingParam !== "portal") return;

    const key = syncKey(user.id, sessionId ?? billingParam);
    let already = false;
    try {
      already = window.sessionStorage.getItem(key) === "1";
    } catch {
      // Navigation privée, stockage refusé: on ne synchronise pas plutôt que
      // de risquer la boucle. L'écran reste juste, il est seulement en retard
      // d'un rafraîchissement manuel.
      already = true;
    }
    if (already) return;

    try {
      window.sessionStorage.setItem(key, "1");
    } catch {
      return;
    }

    let cancelled = false;
    setSyncing(true);
    void (async () => {
      try {
        await supabase.functions.invoke("stripe-sync-subscription");
      } catch {
        // Un échec de synchronisation n'est pas un échec de paiement: Stripe a
        // encaissé, le webhook rattrapera. On relit quand même la couverture.
      }
      await refresh();
      if (!cancelled) setSyncing(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, billingParam, sessionId, refresh]);

  // ⟳ 2026-09-11 — L'IDENTIFIANT EST SORTI DU RAPPEL, ET C'EST CE QUI REND LA
  // MÉMOÏSATION LISIBLE AU COMPILATEUR REACT. Lu en `user?.id` dans le corps,
  // il infère `user` entier comme dépendance et refuse d'optimiser: la valeur
  // changerait plus souvent que la liste ne le dit. Nommé ici, les deux
  // coïncident.
  const userId = user?.id ?? null;
  const readHousehold = React.useCallback(async () => {
    if (!userId) return;
    try {
      setHousehold(await loadHousehold(userId));
    } catch {
      // Fail-open: sans roster, la carte d'accès supplémentaire ne se monte
      // pas. Le reste de la page — l'état, l'échéance, le tunnel — ne dépend
      // pas de cette lecture.
    }
  }, [userId]);

  React.useEffect(() => {
    void readHousehold();
  }, [readHousehold]);

  const today = React.useMemo(() => todayUtcIso(), []);
  const kind = householdBillingKind({ coverage, subscription, today });
  const isOwner = isHouseholdOwner(coverage);
  const daysLeft = trialDaysLeftInclusive(coverage?.freeUntil, today);

  const openTunnel = React.useCallback(async () => {
    setBusy(true);
    setFailure(null);
    try {
      window.location.assign(await openHouseholdCheckout());
    } catch (e) {
      // LE MOTIF TEL QUEL. Tant que les deux prix Stripe ne sont pas posés, la
      // fonction edge échoue BRUYAMMENT, et « une erreur est survenue » ne
      // dirait pas que le produit n'est pas encore en vente.
      setFailure(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }, []);

  const cta = (label: string) => (
    <Button className="mt-4" variant="primary" disabled={busy} onClick={openTunnel}>
      {busy ? t("billing.cta.working") : label}
    </Button>
  );

  return (
    <KeelAppShell title={t("billing.title")}>
      <div className="flex flex-col gap-4">
        {billingParam === "cancelled" ? (
          <div className="rounded-card bg-fig-50 p-3 text-sm text-ink">
            {t("billing.cancelled")}
          </div>
        ) : null}

        {syncing ? (
          <p className="text-sm text-ink-soft">{t("billing.syncing")}</p>
        ) : null}

        {status === "loading" ? null : kind === "not_in_household" ? (
          <Card tone="dashed">
            <p className="text-sm text-ink">{t("billing.not_in_household.body")}</p>
            <Link
              to="/app/setup"
              className="mt-4 inline-flex text-sm text-ink underline decoration-line-strong"
              onClick={() => setParams({})}
            >
              {t("billing.not_in_household.cta")}
            </Link>
          </Card>
        ) : kind === "subscribed" ? (
          <Card>
            <Badge tone="positive">{t("billing.badge.active")}</Badge>
            <SectionLabel className="mt-3">{t("billing.title")}</SectionLabel>
            <p className="text-sm text-ink">{t("billing.active.body")}</p>
            {subscription?.current_period_end ? (
              <p className="mt-2 text-sm text-ink-soft">
                {t(
                  subscription.cancel_at_period_end
                    ? "billing.active.cancels"
                    : "billing.active.renews",
                  { date: formatDateLong(subscription.current_period_end) },
                )}
              </p>
            ) : null}
            {isOwner ? cta(t("billing.cta.manage")) : null}
          </Card>
        ) : kind === "trialing" ? (
          <Card>
            <Badge tone="info">{t("billing.badge.trial")}</Badge>
            <SectionLabel className="mt-3">{t("billing.title")}</SectionLabel>
            <p className="text-sm text-ink">
              {t("billing.trial.left", {
                days: plural(
                  daysLeft,
                  t("shell.trial.days_one", { count: daysLeft }),
                  t("shell.trial.days_many", { count: daysLeft }),
                ),
              })}
            </p>
            {coverage?.freeUntil ? (
              <p className="mt-2 text-sm text-ink-soft">
                {t("billing.trial.ends_on", {
                  date: formatDateLong(coverage.freeUntil),
                })}
              </p>
            ) : null}
            {isOwner ? (
              <>
                <OfferLines className="mt-4" />
                <p className="mt-3 text-sm text-ink-soft">
                  {t("billing.trial.no_early_charge")}
                </p>
                {cta(t("billing.cta.subscribe"))}
              </>
            ) : (
              <p className="mt-3 text-sm text-ink">{t("app.paywall.owner_only")}</p>
            )}
          </Card>
        ) : kind === "frozen" ? (
          // ⛔ NI DATE NI MONTANT DANS CET ÉTAT — voir le pavé de `en.ts`. Le
          // décompte au-dessus est légitime parce que sa source est NOTRE
          // colonne; ici la date de reprise est chez Stripe.
          <Card tone="warning">
            <Badge tone="caution">{t("billing.badge.paused")}</Badge>
            <SectionLabel className="mt-3">{t("app.paywall.title")}</SectionLabel>
            <p className="text-sm text-ink">{t("app.paywall.body")}</p>
            <p className="mt-2 text-sm text-ink">{t("app.paywall.kept")}</p>
            {isOwner ? (
              <>
                <OfferLines className="mt-4" />
                {cta(t("app.paywall.resume_cta"))}
              </>
            ) : (
              <p className="mt-3 text-sm text-ink">{t("app.paywall.owner_only")}</p>
            )}
          </Card>
        ) : (
          <Card>
            <p className="text-sm text-ink">{t("billing.unknown.body")}</p>
          </Card>
        )}

        {/* ⚠️ LE MOTIF BRUT, SANS CLÉ DE TRADUCTION, ET C'EST DÉLIBÉRÉ. Une
            clé `billing.error` valant « {message} » dans les deux packs est un
            passe-plat déguisé en traduction — `parity.int.test.ts` la refuse à
            juste titre. Ce qui s'affiche ici vient du serveur (« Missing env
            var: … » tant que les prix Stripe ne sont pas posés), et le
            traduire en « une erreur est survenue » retirerait la seule
            information utile. Même geste que l'ancienne `PausedCard`. */}
        {/* ⚠️ APRÈS l'état, et seulement dans un foyer. On ne propose pas un
            accès de plus à quelqu'un qui n'a pas encore réglé le sien: la
            carte se tait quand `kind` vaut `not_in_household`, et
            `ExtraAccessCard` se tait elle-même pour un profil réclamé. */}
        {kind !== "not_in_household" && status !== "loading"
          ? (
            <ExtraAccessCard
              household={household}
              viewerIsOwner={isOwner}
              onInvited={readHousehold}
            />
          )
          : null}

        {failure ? <p className="text-sm text-red-700">{failure}</p> : null}
      </div>
    </KeelAppShell>
  );
}

export default HouseholdBillingPage;
