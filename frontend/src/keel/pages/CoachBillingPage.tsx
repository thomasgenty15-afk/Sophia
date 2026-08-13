import React from "react";
import { supabase } from "../../lib/supabase";
import { KeelAppShell } from "../components/KeelAppShell";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { formatDate as formatDateIn } from "../i18n/format";
import { plural } from "../i18n/plural";
import { t } from "../i18n/t";
// L'arithmétique de la facture vit à côté, pas ici: un module qui exporte un
// composant ET des fonctions casse le Fast Refresh. Le calcul est inchangé.
import {
  billingStatusKind,
  type BillingStatusKind,
  type BillingSummary,
  countBilling,
  type SeatLedgerRow,
  trialDaysLeft,
} from "./coachBilling";

/**
 * KEEL W10.3 — `/coach/billing`: what the coach pays, and exactly why.
 *
 * ---------------------------------------------------------------------------
 * THE INVOICE AND THE SCREEN READ THE SAME QUERY
 * ---------------------------------------------------------------------------
 * `keel_my_seat_ledger()` is the function `stripe-reconcile-seats` sums to set
 * the Stripe quantity. This page does not recompute anything from a different
 * angle: it renders that ledger row by row. A coach can therefore point at a
 * name and see the number that put it on the bill. If the two ever disagree,
 * they disagree loudly here rather than silently on a statement.
 *
 * ---------------------------------------------------------------------------
 * TWO NUMBERS, NEVER MERGED (CONTRACT)
 * ---------------------------------------------------------------------------
 * "Students followed" and "seats billed" are different numbers and stay
 * different on screen. A coach who follows 8 students of whom 5 were active
 * this month is billed for 5, and the other 3 are LISTED with their interaction
 * count — not hidden, not rounded away. Showing only the billed count is how a
 * coach concludes they are being overcharged; showing only the roster is how
 * they are surprised by the invoice.
 *
 * ---------------------------------------------------------------------------
 * FAIL LOUD, SHOW NOTHING
 * ---------------------------------------------------------------------------
 * A failed read renders the error state. A billing screen that shows "0 seats"
 * because a query failed is worse than one that shows nothing.
 *
 * ---------------------------------------------------------------------------
 * i18n — LE `COPY` LOCAL A DISPARU (lot 5)
 * ---------------------------------------------------------------------------
 * Cette page portait ses 39 phrases dans une table `COPY` locale et un `c()`
 * qui réimplémentait l'interpolation de `t()`. C'était une mesure de
 * COORDINATION — « `en.ts` appartient à un seul propriétaire (W9) » — et elle a
 * survécu à sa cause: les clés qu'elle réservait sont maintenant dans le seed,
 * aux MÊMES noms, et `c()` est devenu `t()` sans qu'une seule phrase change.
 *
 * Ce que ça débloque n'est pas cosmétique: hors du seed, ni la garde de `t()`
 * (qui LÈVE en DEV sur une couture) ni `pageSeams.int.test.ts` ne voyaient ces
 * phrases, et `/coach/billing` ne pouvait pas basculer de langue quoi qu'on
 * écrive dans `fr.ts`.
 */

// LA CONSTANTE DE SEUIL A ÉTÉ RETIRÉE D'ICI.
//
// Elle valait 3 et n'était utilisée que pour interpoler « au moins 3 fois » dans
// deux phrases. La migration 20260806170000 a retiré cette condition de
// `keel_coach_seat_ledger`: le siège facturable est l'élève RATTACHÉ. Les deux
// phrases sont réécrites, donc le miroir n'a plus de lecteur.
//
// `keel_active_student_threshold()` et `ACTIVE_STUDENT_MIN_INTERACTIONS` dans
// `_shared/billing-tier.ts` SURVIVENT côté serveur — ils restent justes, ils ne
// sont simplement plus le critère de facturation, et `billing-tier_test.ts`
// vérifie encore leur accord avec le SQL.
//
// Son ancien commentaire disait: « une constante périmée ici peut rendre une
// phrase fausse, jamais une facture fausse ». C'est exactement ce qui est
// arrivé — la facture avait raison, la phrase mentait pendant une journée.

interface DirectoryRow {
  id: string;
  full_name: string | null;
}

interface BillingData {
  summary: BillingSummary;
  ledger: SeatLedgerRow[];
  directory: Map<string, DirectoryRow>;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: BillingData }
  | { kind: "not_coach" }
  | { kind: "error" };

/**
 * ⚠️ CETTE FONCTION RENDAIT EN `en-US` SUR UNE PAGE DÉCLARÉE TRADUITE. Elle
 * écrivait « Aug 7, 2026 » sous un chrome français, et c'était le seul `en-US`
 * du dépôt — `CoachHomePage` disait `en-GB` à trois écrans de là. Le tag vit
 * maintenant dans `i18n/format.ts`, une fois.
 */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return formatDateIn(d);
}

async function loadBilling(): Promise<BillingData | "not_coach"> {
  const [summaryRes, ledgerRes] = await Promise.all([
    supabase.rpc("keel_my_billing_summary"),
    supabase.rpc("keel_my_seat_ledger"),
  ]);

  // The RPCs raise 42501 for a caller with no coaches row. That is a state, not
  // a failure: it renders its own sentence rather than the generic error.
  const notCoach = (err: { code?: string; message?: string } | null) =>
    Boolean(err) &&
    (err?.code === "42501" || /not (an active )?coach/i.test(err?.message ?? ""));

  if (notCoach(summaryRes.error)) return "not_coach";
  if (summaryRes.error) {
    throw new Error(`[keel/billing] summary failed: ${summaryRes.error.message}`);
  }
  if (ledgerRes.error) {
    throw new Error(`[keel/billing] ledger failed: ${ledgerRes.error.message}`);
  }

  const summary = ((summaryRes.data ?? []) as unknown as BillingSummary[])[0];
  if (!summary) return "not_coach";

  const ledger = (ledgerRes.data ?? []) as unknown as SeatLedgerRow[];

  // Names come from the Tier B allowlist view, never from `profiles`: the
  // billing screen has no business reading a student's email or birth date.
  const directory = new Map<string, DirectoryRow>();
  const { data: dirRows, error: dirErr } = await supabase
    .from("coach_student_directory")
    .select("id, full_name");
  if (dirErr) {
    throw new Error(`[keel/billing] directory failed: ${dirErr.message}`);
  }
  for (const row of (dirRows ?? []) as unknown as DirectoryRow[]) {
    directory.set(row.id, row);
  }

  return { summary, ledger, directory };
}

export function CoachBillingPage() {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = React.useState(0);
  const [checkoutBusy, setCheckoutBusy] = React.useState(false);
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    loadBilling()
      .then((data) => {
        if (cancelled) return;
        setState(
          data === "not_coach" ? { kind: "not_coach" } : { kind: "ready", data },
        );
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // L'INTERVALLE EST UN CHOIX, PLUS UNE CONSTANTE.
  //
  // Il était figé à `"monthly"` en dur ici, donc l'annuel — que la fonction
  // edge accepte pourtant depuis le premier jour — était inatteignable. Le
  // paramètre existait, personne ne pouvait le passer.
  const openCheckout = React.useCallback(async (interval: "monthly" | "yearly") => {
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "stripe-create-checkout-session",
        { body: { plan: "keel_coach", interval } },
      );
      if (error) throw error;
      const url = String((data as { url?: unknown } | null)?.url ?? "").trim();
      // R7: no silent no-op. A button that does nothing is indistinguishable
      // from a button that worked, and this one moves money.
      if (!url) throw new Error("no checkout url returned");
      window.location.assign(url);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckoutBusy(false);
    }
  }, []);

  return (
    <KeelAppShell
      variant="coach"
      title={t("coach.billing.title")}
      subtitle={t("coach.billing.subtitle")}
    >
      {state.kind === "loading" && (
        <p className="text-sm text-ink-soft">{t("coach.billing.loading")}</p>
      )}

      {state.kind === "not_coach" && (
        <Card tone="dashed" className="p-8 text-center">
          <p className="text-sm text-ink-soft">{t("coach.billing.not_coach")}</p>
        </Card>
      )}

      {state.kind === "error" && (
        <Card tone="warning">
          <p className="text-sm text-amber-900">{t("coach.billing.load_error")}</p>
          {/* ⚠️ TROIS CLASSES AMBRE ONT ÉTÉ RETIRÉES DE CE BOUTON PARCE QU'ELLES
              NE RENDAIENT RIEN — MESURÉ AU NAVIGATEUR, PAS DÉDUIT.
              Il portait `border-amber-300 text-amber-900 hover:bg-amber-100`.
              Calculé sur l'écran rendu: bordure `rgb(142,120,134)` = `line-strong`,
              texte `rgb(35,25,31)` = `ink`. Les deux classes du kit GAGNENT —
              même couche, même spécificité, c'est l'ordre de génération de
              Tailwind qui tranche. C'est le piège que la charte documente déjà
              pour `hidden` contre `inline-flex` (§9 nº4): sur un utilitaire, on
              enveloppe ou on change de variante, on n'empile pas.
              Les laisser serait pire que de ne rien avoir écrit: le prochain
              lecteur croit le bouton ambre et « répare » le kit pour le rendre.
              ⛔ ET L'AMBRE DU BANDEAU, ELLE, RESTE: c'est la carte
              (`tone="warning"`, `amber-50` + `amber-200`) et sa PHRASE
              (`text-amber-900`, juste au-dessus) qui portent le fait. Le bouton
              est une ACTION — la moitié de la règle de couleur qui n'appartient
              pas aux états. `ink` sur `amber-50` = 15,1:1, `line-strong` sur
              `amber-50` = 3,8:1: le `secondary` du kit se lit sur cet aplat. */}
          <Button
            className="mt-3"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            {t("coach.billing.retry")}
          </Button>
        </Card>
      )}

      {state.kind === "ready" && (
        <BillingBody
          data={state.data}
          busy={checkoutBusy}
          checkoutError={checkoutError}
          onCheckout={openCheckout}
        />
      )}
    </KeelAppShell>
  );
}

function BillingBody({
  data,
  busy,
  checkoutError,
  onCheckout,
}: {
  data: BillingData;
  busy: boolean;
  checkoutError: string | null;
  onCheckout: (interval: "monthly" | "yearly") => void;
}) {
  const { billed, followed } = countBilling(data.ledger);
  const kind = billingStatusKind(data.summary);

  return (
    <>
      <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatTile
          label={t("coach.billing.seats_billed_label")}
          value={String(billed)}
          hint={t("coach.billing.seats_billed_hint")}
        />
        <StatTile
          label={t("coach.billing.students_followed_label")}
          value={String(followed)}
          hint={t("coach.billing.students_followed_hint")}
        />
      </section>

      <section className="mb-8">
        <SectionLabel>{t("coach.billing.plan_label")}</SectionLabel>
        <Card>
          <PlanState summary={data.summary} kind={kind} />
          {/* DÉJÀ ABONNÉ: UN SEUL BOUTON, qui ouvre le portail Stripe.
              L'intervalle ne se choisit qu'à la souscription — le proposer à
              quelqu'un qui a déjà un contrat laisserait croire qu'un clic
              bascule son abonnement en cours, ce que ce bouton ne fait pas.
              L'intervalle passé est alors sans effet, et `"monthly"` est la
              valeur honnête: c'est ce que le portail sert.

              ⛔ LES DEUX `variant="primary"` DE CE FICHIER NE SONT JAMAIS RENDUS
              ENSEMBLE, et c'est la même ternaire qui le garantit: abonné → un
              seul bouton (« gérer »); pas abonné → « souscrire au mois » en
              primaire et « à l'année » en secondaire. Vérifié au navigateur: un
              seul aplat `fig-700` par rendu. Ne « factorise » pas les deux
              appels en un seul bouton pour autant — leur libellé et leur sens
              diffèrent, c'est la duplication qui est apparente. */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {kind === "subscribed"
              ? (
                <Button variant="primary" onClick={() => onCheckout("monthly")} disabled={busy}>
                  {t("coach.billing.manage_cta")}
                </Button>
              )
              : (
                <>
                  <Button variant="primary" onClick={() => onCheckout("monthly")} disabled={busy}>
                    {t("coach.billing.subscribe_monthly_cta")}
                  </Button>
                  <Button variant="secondary" onClick={() => onCheckout("yearly")} disabled={busy}>
                    {t("coach.billing.subscribe_yearly_cta")}
                  </Button>
                </>
              )}
          </div>
          {kind !== "subscribed" && (
            <p className="mt-3 text-xs leading-5 text-ink-soft">
              {t("coach.billing.interval_hint")}
            </p>
          )}
          {checkoutError && (
            <p className="mt-3 text-sm text-red-700">
              {t("coach.billing.checkout_error", { message: checkoutError })}
            </p>
          )}
        </Card>
      </section>

      <section className="mb-8">
        <SectionLabel>{t("coach.billing.ledger_title")}</SectionLabel>
        {data.ledger.length === 0
          ? (
            <Card tone="dashed" className="p-6 text-center">
              <p className="text-sm text-ink-soft">
                {t("coach.billing.ledger_empty")}
              </p>
            </Card>
          )
          : (
            <Card padded={false}>
              <ul className="divide-y divide-line">
                {data.ledger.map((row) => (
                  <LedgerRow
                    key={row.coach_client_id}
                    row={row}
                    name={row.student_user_id
                      ? data.directory.get(row.student_user_id)?.full_name ?? null
                      : null}
                  />
                ))}
              </ul>
            </Card>
          )}
      </section>

      <Card tone="dashed">
        <h3 className="text-sm font-semibold text-ink">
          {t("coach.billing.explainer_title")}
        </h3>
        <p className="mt-2 max-w-[62ch] text-sm leading-6 text-ink-soft">
          {t("coach.billing.explainer_body")}
        </p>
        <p className="mt-3 border-t border-line pt-3 text-xs leading-5 text-ink-soft">
          {t("coach.billing.activity_hint")}
        </p>
      </Card>
    </>
  );
}

function PlanState({
  summary,
  kind,
}: {
  summary: BillingSummary;
  kind: BillingStatusKind;
}) {
  if (kind === "subscribed") {
    const date = formatDate(summary.current_period_end);
    return (
      <div>
        <Badge tone="positive">{t("coach.billing.status_subscribed")}</Badge>
        {date && (
          <p className="mt-2 text-sm text-ink-soft">
            {summary.cancel_at_period_end
              ? t("coach.billing.cancels_on", { date })
              : t("coach.billing.renews_on", { date })}
          </p>
        )}
      </div>
    );
  }

  if (kind === "trialing") {
    return (
      <div>
        <Badge tone="info">{t("coach.billing.status_trialing")}</Badge>
        <p className="mt-2 text-sm text-ink-soft">
          {t("coach.billing.trial_days_left", {
            days: trialDaysLeft(summary.trial_ends_at),
            seats: summary.trial_seat_limit ?? 3,
          })}
        </p>
      </div>
    );
  }

  if (kind === "expired") {
    return (
      <div>
        <Badge tone="critical">{t("coach.billing.status_expired")}</Badge>
        {/* Said plainly, because it is true and the student feels it before the
            coach does: an unpaid coach means their students lose access. */}
        <p className="mt-2 text-sm text-ink-soft">
          {t("coach.billing.trial_ended_body")}
        </p>
      </div>
    );
  }

  return <Badge tone="neutral">{t("coach.billing.status_unknown")}</Badge>;
}

function LedgerRow({
  row,
  name,
}: {
  row: SeatLedgerRow;
  name: string | null;
}) {
  const count = Number(row.interaction_count ?? 0);
  let tone: BadgeTone = "neutral";
  let label = t("coach.billing.not_billed_badge");
  if (row.link_status === "invited") {
    tone = "info";
    label = t("coach.billing.invited_badge");
  } else if (row.link_status === "paused") {
    tone = "caution";
    label = t("coach.billing.paused_badge");
  } else if (row.is_active_seat) {
    tone = "positive";
    label = t("coach.billing.billed_badge");
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">
          {name ?? t("coach.billing.student_anonymous")}
        </p>
        <p className="mt-0.5 text-xs text-ink-soft">
          {/*
            ⚠️ `count === 1` ÉTAIT LA RÈGLE ANGLAISE, ET ELLE EST FAUSSE EN
            FRANÇAIS: « 0 interactions » se dit « 0 interaction ». Or zéro est
            le cas le plus fréquent de cette colonne — c'est exactement le siège
            que le coach devrait envisager de rendre. `plural()` porte la seule
            divergence des deux langues (i18n/plural.ts).
          */}
          {row.student_user_id
            ? plural(
              count,
              t("coach.billing.interaction_one", { count }),
              t("coach.billing.interactions", { count }),
            )
            : t("coach.billing.no_account_yet")}
        </p>
      </div>
      <Badge tone={tone}>{label}</Badge>
    </li>
  );
}

/**
 * UN COMPTEUR DE L'ÉCRAN — et il est le JUMEAU EXACT de celui de
 * `CoachHomePage.tsx`.
 *
 * ⚠️ LES DEUX COPIES SONT MAINTENANT IDENTIQUES AU CARACTÈRE, ET ELLES DOIVENT
 * LE RESTER. C'est le même objet: une étiquette, un chiffre, une note. Le siège
 * facturé ici EST celui compté là-bas — les deux tuiles qui le rendent ne
 * peuvent pas se ressembler « à peu près ». Si tu modifies celle-ci, modifie
 * l'autre dans le même geste.
 * SIGNALÉ, PAS FAIT: la vraie réponse est UNE tuile dans `keel/components/ui/`,
 * et ce dossier appartient à l'orchestrateur (un lot visuel n'ouvre pas le kit
 * pendant que sept familles écrivent à côté).
 *
 * ⛔ AUCUNE FIGUE ICI. Un chiffre est un FAIT; la teinte de marque marque la
 * navigation et l'action. Et sur CET écran c'est plus qu'une règle de style: la
 * page promet qu'un coach « peut pointer un nom et voir le nombre qui l'a mis
 * sur la facture ». Un nombre peint comme un bouton se lirait comme un geste.
 *
 * PUBLIC SANS SUR LE CHIFFRE, et c'est la charte §3 qui l'attribue: « texte,
 * chiffres, libellés ». Young Serif est display uniquement — et le dépôt a déjà
 * mesuré qu'elle rend mal un nombre (`PriceCard` a perdu `tabular-nums` parce
 * que « 12,99 € » sortait en « 1 2,99 € »).
 *
 * `text-label` remplace `text-xs … tracking-wide`: c'est le cran d'étiquette de
 * la charte (0,6875rem, +0,1em, capitales), le même que `SectionLabel` et que
 * l'étiquette de champ. `tracking-wide` est retiré — `text-label` porte déjà son
 * approche, et les deux sur le même nœud se battraient.
 */
function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <div className="text-label font-semibold uppercase text-ink-soft">
        {label}
      </div>
      <div className="mt-1 text-3xl font-semibold tabular-nums text-ink">{value}</div>
      {hint && <p className="mt-2 text-xs leading-5 text-ink-soft">{hint}</p>}
    </Card>
  );
}

export default CoachBillingPage;
