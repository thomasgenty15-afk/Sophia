import React from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { t } from "../i18n/t";

// KEEL W6.1 — the coach route guard.
//
// Modelled on KeelStudentRoute (and, through it, on security/RouteGuards.tsx),
// with the same two deliberate departures:
//
//   1. It does NOT wrap RequireAppAccess. That guard gates on the legacy French
//      subscription tiers (trial / system / alliance / architecte), an axis
//      that says nothing about being a coach. Stacking them would lock a
//      legitimate coach out on a billing plan that does not apply to them.
//
//   2. It reads the DATABASE, not a JWT claim. `keel_role='coach'` on profiles
//      is routing metadata and is deliberately NOT an entitlement (migration
//      20260727120000 says so in as many words). The thing that makes someone a
//      coach is an ACTIVE row in `public.coaches`, so that is what this guard
//      asks for. A user who flipped their own keel_role would still land on the
//      refusal screen, and would still read nothing: RLS is the real boundary,
//      this guard is navigation.
//
// FAIL CLOSED. A failed read resolves to the refusal screen, never to a grant.
// The suspended case gets its own screen: "your account is suspended" and "this
// space is for coaches" are different facts, and telling a suspended coach the
// second one would send them to create a second account.

type CoachState =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "suspended" }
  | { kind: "active" }
  | { kind: "error" };

async function loadCoachStatus(userId: string): Promise<CoachState> {
  // RLS policy `coaches_self_select` scopes this to the caller's own row; the
  // `.eq(user_id)` is belt, not the boundary.
  const { data, error } = await supabase
    .from("coaches")
    .select("id, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`[keel/coach] loadCoachStatus failed: ${error.message}`);
  }
  const row = data as { id: string; status: string } | null;
  if (!row) return { kind: "none" };
  return row.status === "active" ? { kind: "active" } : { kind: "suspended" };
}

export function CoachRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [state, setState] = React.useState<CoachState>({ kind: "loading" });

  const userId = user?.id ?? null;

  React.useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setState({ kind: "loading" });
      return;
    }
    setState({ kind: "loading" });
    loadCoachStatus(userId)
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return null;

  if (!user) {
    const dest = `${location.pathname}${location.search || ""}`;
    const params = new URLSearchParams();
    params.set("redirect", dest);
    return <Navigate to={`/auth?${params.toString()}`} replace />;
  }

  if (state.kind === "loading") {
    return <p className="p-8 text-sm text-gray-500">{t("coach.guard.checking")}</p>;
  }

  if (state.kind === "suspended") {
    return (
      <RefusalPanel
        title={t("coach.guard.suspended_title")}
        body={t("coach.guard.suspended_body")}
      />
    );
  }

  if (state.kind !== "active") {
    // `none` and `error` share a screen on purpose: from the outside they are
    // the same fact ("we cannot establish that you are a coach"), and a
    // distinct error screen would be an oracle for whether a coaches row exists.
    return (
      <RefusalPanel
        title={t("coach.guard.not_coach_title")}
        body={t("coach.guard.not_coach_body")}
        actions={
          <>
            <Link
              to="/auth?role=coach"
              className="rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              {t("coach.guard.signup_cta")}
            </Link>
            <Link
              to="/app/today"
              className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {t("coach.guard.student_app_cta")}
            </Link>
          </>
        }
      />
    );
  }

  return <>{children}</>;
}

function RefusalPanel({
  title,
  body,
  actions,
}: {
  title: string;
  body: string;
  actions?: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-gray-600">{body}</p>
      {actions && <div className="mt-6 flex flex-wrap gap-3">{actions}</div>}
    </main>
  );
}

export default CoachRoute;
