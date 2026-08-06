import React from "react";
import { supabase } from "../../lib/supabase";
import { KeelAppShell } from "../components/KeelAppShell";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
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
 * i18n — READ THIS BEFORE COPYING THE PATTERN
 * ---------------------------------------------------------------------------
 * `frontend/src/keel/i18n/en.ts` belongs to ONE owner (W9). The copy below is
 * therefore a LOCAL map with the exact keys W9 must add, so this page ships
 * without another agent's file being edited by two hands. When W9 lands the
 * keys (they are listed in the W10 report), replace `c(...)` with `t(...)`
 * and delete `COPY` — the key strings are already the final ones.
 */

const COPY = {
  "coach.billing.title": "Billing",
  "coach.billing.subtitle": "You pay for the students who actually used the protocol.",
  "coach.billing.loading": "Loading your billing...",
  "coach.billing.load_error":
    "Your billing could not be loaded. Nothing is shown rather than something wrong.",
  "coach.billing.retry": "Try again",
  "coach.billing.not_coach":
    "This account has no coach profile, so it has no billing.",

  "coach.billing.seats_billed_label": "Seats billed this month",
  "coach.billing.seats_billed_hint":
    "One seat per enrolled student. Invited and paused students are never billed.",
  "coach.billing.students_followed_label": "Students followed",
  "coach.billing.students_followed_hint":
    "Active links. Invited and paused students are never billed.",

  "coach.billing.plan_label": "Your plan",
  "coach.billing.plan_flat": "Platform",
  "coach.billing.plan_seat": "Per active student",
  "coach.billing.status_subscribed": "Subscribed",
  "coach.billing.status_trialing": "Free trial",
  "coach.billing.status_expired": "Trial ended",
  "coach.billing.status_unknown": "No billing on file",
  "coach.billing.trial_days_left": "{days} days left, up to {seats} students",
  "coach.billing.trial_ended_body":
    "Your trial has ended. Your students keep no access until you subscribe.",
  "coach.billing.renews_on": "Renews on {date}",
  "coach.billing.cancels_on": "Ends on {date}",
  // `subscribe_cta` a été SCINDÉE EN DEUX: l'intervalle était figé à `monthly`
  // en dur, donc l'annuel — accepté par la fonction edge depuis le premier
  // jour — n'avait aucun chemin. Un seul bouton ne pouvait pas porter le choix.
  "coach.billing.subscribe_monthly_cta": "Subscribe monthly",
  "coach.billing.subscribe_yearly_cta": "Subscribe yearly",
  // LE PRIX EST DIT ICI, PAS DANS LE BOUTON. Un libellé qui porterait « 7 € »
  // deviendrait faux le jour d'un changement de tarif, sur un bouton que
  // personne ne pense à relire. La phrase, elle, se relit.
  "coach.billing.interval_hint":
    "7 € per student per month, or 6 € when your student has paid for the year. No platform fee.",
  "coach.billing.manage_cta": "Manage billing",
  "coach.billing.checkout_error": "Checkout could not be opened: {message}",

  "coach.billing.ledger_title": "This month, student by student",
  "coach.billing.ledger_empty": "No students yet, so nothing is billed.",
  "coach.billing.interactions": "{count} interactions",
  "coach.billing.interaction_one": "1 interaction",
  "coach.billing.billed_badge": "Billed",
  "coach.billing.not_billed_badge": "Not billed",
  "coach.billing.invited_badge": "Invited",
  "coach.billing.paused_badge": "Paused",
  "coach.billing.student_anonymous": "Student",
  "coach.billing.no_account_yet": "Has not created their account yet",

  "coach.billing.explainer_title": "How the seat count is decided",
  // ⚠️ CETTE COPIE A ÉTÉ CORRIGÉE APRÈS UN CHANGEMENT DE FACTURATION.
  // Elle disait: « on compte combien de fois chaque élève a agi; 3 fois ou plus
  // et le siège est facturé, moins et il est gratuit ce mois-ci ». La migration
  // 20260806170000 a retiré cette condition — le siège facturable est l'élève
  // RATTACHÉ, actif ou non. La phrase décrivait donc une facturation qui
  // n'existait plus, sur l'écran qu'un coach payant relit tous les mois.
  //
  // Le compte d'interactions RESTE affiché ligne par ligne (colonne du registre):
  // il ne décide plus de la facture, mais « cet élève est rattaché et n'a rien
  // fait ce mois-ci » est exactement ce qu'un coach doit voir — c'est le siège
  // qu'il devrait envisager de rendre.
  "coach.billing.explainer_body":
    "You are billed one seat per student enrolled with you, whether they used the app that month or not - you sell them the access, so you collect from them either way. A student you invited but who has not joined is not billed, and neither is a seat you turned off. We never bill for a seat we did not show you here.",
  // Le compte d'interactions garde sa colonne, mais il change de sens: ce n'est
  // plus un critère de facturation, c'est un signal d'usage.
  "coach.billing.activity_hint":
    "Interactions are shown so you can see who is actually using it. They no longer decide the bill - if a student has stopped for good, turn their seat off on their page.",
} as const;

type CopyKey = keyof typeof COPY;

function c(key: CopyKey, params?: Record<string, string | number>): string {
  const template = COPY[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = params[name];
    return v === undefined ? whole : String(v);
  });
}

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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
      title={c("coach.billing.title")}
      subtitle={c("coach.billing.subtitle")}
    >
      {state.kind === "loading" && (
        <p className="text-sm text-gray-500">{c("coach.billing.loading")}</p>
      )}

      {state.kind === "not_coach" && (
        <Card tone="dashed" className="p-8 text-center">
          <p className="text-sm text-gray-600">{c("coach.billing.not_coach")}</p>
        </Card>
      )}

      {state.kind === "error" && (
        <Card tone="warning">
          <p className="text-sm text-amber-900">{c("coach.billing.load_error")}</p>
          <Button
            className="mt-3 border-amber-300 text-amber-900 hover:bg-amber-100"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            {c("coach.billing.retry")}
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
          label={c("coach.billing.seats_billed_label")}
          value={String(billed)}
          hint={c("coach.billing.seats_billed_hint")}
        />
        <StatTile
          label={c("coach.billing.students_followed_label")}
          value={String(followed)}
          hint={c("coach.billing.students_followed_hint")}
        />
      </section>

      <section className="mb-8">
        <SectionLabel>{c("coach.billing.plan_label")}</SectionLabel>
        <Card>
          <PlanState summary={data.summary} kind={kind} />
          {/* DÉJÀ ABONNÉ: UN SEUL BOUTON, qui ouvre le portail Stripe.
              L'intervalle ne se choisit qu'à la souscription — le proposer à
              quelqu'un qui a déjà un contrat laisserait croire qu'un clic
              bascule son abonnement en cours, ce que ce bouton ne fait pas.
              L'intervalle passé est alors sans effet, et `"monthly"` est la
              valeur honnête: c'est ce que le portail sert. */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {kind === "subscribed"
              ? (
                <Button variant="primary" onClick={() => onCheckout("monthly")} disabled={busy}>
                  {c("coach.billing.manage_cta")}
                </Button>
              )
              : (
                <>
                  <Button variant="primary" onClick={() => onCheckout("monthly")} disabled={busy}>
                    {c("coach.billing.subscribe_monthly_cta")}
                  </Button>
                  <Button variant="secondary" onClick={() => onCheckout("yearly")} disabled={busy}>
                    {c("coach.billing.subscribe_yearly_cta")}
                  </Button>
                </>
              )}
          </div>
          {kind !== "subscribed" && (
            <p className="mt-3 text-xs leading-5 text-gray-500">
              {c("coach.billing.interval_hint")}
            </p>
          )}
          {checkoutError && (
            <p className="mt-3 text-sm text-red-700">
              {c("coach.billing.checkout_error", { message: checkoutError })}
            </p>
          )}
        </Card>
      </section>

      <section className="mb-8">
        <SectionLabel>{c("coach.billing.ledger_title")}</SectionLabel>
        {data.ledger.length === 0
          ? (
            <Card tone="dashed" className="p-6 text-center">
              <p className="text-sm text-gray-600">
                {c("coach.billing.ledger_empty")}
              </p>
            </Card>
          )
          : (
            <Card padded={false}>
              <ul className="divide-y divide-gray-200">
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
        <h3 className="text-sm font-semibold text-gray-900">
          {c("coach.billing.explainer_title")}
        </h3>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {c("coach.billing.explainer_body")}
        </p>
        <p className="mt-3 border-t border-gray-100 pt-3 text-xs leading-5 text-gray-500">
          {c("coach.billing.activity_hint")}
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
        <Badge tone="positive">{c("coach.billing.status_subscribed")}</Badge>
        {date && (
          <p className="mt-2 text-sm text-gray-600">
            {summary.cancel_at_period_end
              ? c("coach.billing.cancels_on", { date })
              : c("coach.billing.renews_on", { date })}
          </p>
        )}
      </div>
    );
  }

  if (kind === "trialing") {
    return (
      <div>
        <Badge tone="info">{c("coach.billing.status_trialing")}</Badge>
        <p className="mt-2 text-sm text-gray-600">
          {c("coach.billing.trial_days_left", {
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
        <Badge tone="critical">{c("coach.billing.status_expired")}</Badge>
        {/* Said plainly, because it is true and the student feels it before the
            coach does: an unpaid coach means their students lose access. */}
        <p className="mt-2 text-sm text-gray-600">
          {c("coach.billing.trial_ended_body")}
        </p>
      </div>
    );
  }

  return <Badge tone="neutral">{c("coach.billing.status_unknown")}</Badge>;
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
  let label = c("coach.billing.not_billed_badge");
  if (row.link_status === "invited") {
    tone = "info";
    label = c("coach.billing.invited_badge");
  } else if (row.link_status === "paused") {
    tone = "caution";
    label = c("coach.billing.paused_badge");
  } else if (row.is_active_seat) {
    tone = "positive";
    label = c("coach.billing.billed_badge");
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">
          {name ?? c("coach.billing.student_anonymous")}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          {row.student_user_id
            ? (count === 1
              ? c("coach.billing.interaction_one")
              : c("coach.billing.interactions", { count }))
            : c("coach.billing.no_account_yet")}
        </p>
      </div>
      <Badge tone={tone}>{label}</Badge>
    </li>
  );
}

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
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-1 text-3xl font-semibold text-gray-900">{value}</div>
      {hint && <p className="mt-2 text-xs leading-5 text-gray-500">{hint}</p>}
    </Card>
  );
}

export default CoachBillingPage;
