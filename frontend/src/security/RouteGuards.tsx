import React from "react";
import { ArrowRight, CreditCard, LockKeyhole, UserCog } from "lucide-react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DeletionPendingScreen from "../components/account/DeletionPendingScreen";

function buildRedirectQuery(pathname: string, search: string) {
  const dest = `${pathname}${search || ""}`;
  const params = new URLSearchParams();
  params.set("redirect", dest);
  return params.toString();
}

export function RequireUser({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) {
    return <Navigate to={`/auth?${buildRedirectQuery(location.pathname, location.search)}`} replace />;
  }
  return <>{children}</>;
}

export function RequireAppAccess({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin, prelaunchLockdown, accessTier, accountStatus } = useAuth();
  const location = useLocation();
  const lockdown = prelaunchLockdown;

  if (loading) return null;

  // Always require a signed-in user for the app routes
  if (!user) {
    return <Navigate to={`/auth?${buildRedirectQuery(location.pathname, location.search)}`} replace />;
  }

  // Account flagged for deletion (RGPD): the app is sealed off; the only
  // choices offered are restoring the account or signing out.
  if (accountStatus === "deletion_pending") {
    return <DeletionPendingScreen />;
  }

  // In prelaunch, only internal admins can access the app
  if (lockdown) {
    if (isAdmin === null) return null; // admin check pending
    if (!isAdmin) return <Navigate to="/auth?forbidden=1" replace />;
  }

  if (accessTier === "none") {
    if (isAdmin === null) return null;
    if (!isAdmin && !isExpiredAccessAllowedPath(location.pathname)) {
      return <ExpiredAccessPanel />;
    }
  }

  return <>{children}</>;
}

function isExpiredAccessAllowedPath(pathname: string) {
  return pathname === "/upgrade" || pathname.startsWith("/account");
}

function ExpiredAccessPanel() {
  return (
    <main className="min-h-screen bg-[#f7f6f2] px-4 py-8 text-stone-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center">
        <section className="w-full overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-[0_28px_90px_-48px_rgba(31,41,55,0.55)]">
          <div className="grid min-h-[520px] lg:grid-cols-[0.95fr_1.05fr]">
            <div className="flex flex-col justify-between border-b border-stone-200 bg-stone-950 p-7 text-white lg:border-b-0 lg:border-r">
              <div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
                  <LockKeyhole className="h-5 w-5" />
                </div>
                <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
                  Accès en pause
                </p>
                <h1 className="mt-3 max-w-sm text-3xl font-semibold leading-tight sm:text-4xl">
                  Ton essai Sophia est terminé
                </h1>
              </div>

              <p className="mt-8 max-w-md text-sm leading-6 text-white/72">
                Ton espace reste bien conservé. Pour reprendre le coaching, les rappels et les outils actifs, réactive simplement ton accès.
              </p>
            </div>

            <div className="flex flex-col justify-center p-7 sm:p-9">
              <div className="max-w-xl">
                <p className="text-sm font-semibold text-emerald-700">
                  Rien n’a été supprimé
                </p>
                <h2 className="mt-3 text-2xl font-semibold leading-tight text-stone-950">
                  La navigation est bloquée tant que l’accès n’est pas réactivé.
                </h2>
                <p className="mt-4 text-sm leading-6 text-stone-600">
                  Tu peux consulter ton abonnement ou passer par la page d’upgrade. Une fois l’accès réactivé, le dashboard se débloquera automatiquement.
                </p>

                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <Link
                    to="/upgrade"
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
                  >
                    Réactiver l’accès
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    to="/account?tab=subscription"
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-800 transition hover:border-stone-300 hover:bg-stone-50"
                  >
                    <CreditCard className="h-4 w-4" />
                    Voir mon compte
                  </Link>
                </div>

                <div className="mt-8 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4">
                  <div className="flex items-start gap-3">
                    <UserCog className="mt-0.5 h-4 w-4 text-emerald-700" />
                    <p className="text-sm leading-6 text-emerald-950">
                      Si tu viens de payer ou d’appliquer un code promo, recharge la page après confirmation Stripe pour resynchroniser ton accès.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

// PIVOT KEEL — `RequirePrelaunchGate` gardait les routes « entonnoir invité »
// (le questionnaire, /onboarding-v2). Ces routes sont supprimées, et le garde
// n'avait plus qu'un import sans usage.

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) {
    return <Navigate to={`/auth?${buildRedirectQuery(location.pathname, location.search)}`} replace />;
  }
  if (isAdmin === null) return null;
  if (!isAdmin) return <Navigate to="/auth?forbidden=1" replace />;
  return <>{children}</>;
}

// PIVOT KEEL — `RequireArchitecte` gardait les routes du palier « architecte »
// de l'ancienne offre. Elles ont été démontées en W2.A; le garde n'avait déjà
// plus aucun appelant avant ce chantier.

