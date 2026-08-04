import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { loadKeelRole } from "../api/keelClient";
import { t } from "../i18n/t";

// KEEL — the student route guard.
//
// It deliberately does NOT wrap `RequireAppAccess`: that guard gates on the
// legacy French subscription tiers (trial / system / alliance / architecte),
// which say nothing about whether someone is a coach's student. Stacking them
// would lock a legitimate KEEL student out on a billing axis that does not
// apply to them. So this guard checks exactly two things: a session, and
// `profiles.keel_role = 'student'`.
//
// The role is read from the database rather than from a claim, because the row
// is the truth and RLS enforces the same boundary server-side anyway: this
// guard is navigation, not security. A student who forces the URL still sees
// only their own rows.

type RoleState =
  | { kind: "loading" }
  | { kind: "resolved"; role: string | null }
  | { kind: "error" };

export function KeelStudentRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [state, setState] = React.useState<RoleState>({ kind: "loading" });

  const userId = user?.id ?? null;

  React.useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setState({ kind: "loading" });
      return;
    }
    setState({ kind: "loading" });
    loadKeelRole(userId)
      .then((role) => {
        if (!cancelled) setState({ kind: "resolved", role });
      })
      .catch(() => {
        // A failed read is NOT an implicit grant. It resolves to the refusal
        // screen, same as a wrong role.
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
    return (
      <p className="p-8 text-sm text-gray-500">{t("app.guard.checking")}</p>
    );
  }

  if (state.kind === "error" || state.role !== "student") {
    return <NotAStudentPanel />;
  }

  return <>{children}</>;
}

function NotAStudentPanel() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-xl font-semibold text-gray-900">
        {t("app.guard.not_student_title")}
      </h1>
      <p className="mt-2 text-sm leading-6 text-gray-600">
        {t("app.guard.not_student_body")}
      </p>
    </main>
  );
}

export default KeelStudentRoute;
