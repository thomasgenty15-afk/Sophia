import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { t } from "../i18n/t";
import { Page, PageHeader, type PageWidth } from "./ui/Page";

// KEEL — chrome shared by every connected KEEL screen, coach and student.
// Sober on purpose: the plan is the interface, the chrome is a way back to it.
// One top bar for both spaces so the product feels like one product; only the
// nav entries change with the variant.

export type ShellVariant = "student" | "coach";

// A ROUTE WITH NO LINK IS A FEATURE NOBODY HAS.
// `/app/meals` shipped with Q6 and was reachable only by typing the URL: the
// student's nav had two entries and the meal week was not one of them. That is
// the "thirteen unwired modules" failure one layer up — `wiring-check` owns the
// edge from a module to its caller, and a React route IS a caller, so the check
// stayed green while the whole screen was unreachable. The entry below is the
// missing edge.
const NAV: Record<ShellVariant, { to: string; label: () => string; end?: boolean }[]> = {
  student: [
    { to: "/app/today", label: () => t("app.nav.today") },
    { to: "/app/meals", label: () => t("app.nav.meals") },
    { to: "/app/progress", label: () => t("app.nav.progress") },
  ],
  coach: [
    // `end` so /coach/templates and /coach/clients/:id do not light "Students".
    { to: "/coach", label: () => t("shell.nav.students"), end: true },
    { to: "/coach/templates", label: () => t("shell.nav.templates") },
  ],
};

/** The top bar alone — for pages whose header is custom (student space). */
export function KeelShellBar({ variant = "student" }: { variant?: ShellVariant }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  // The legacy index.html ships a French title and lang="fr". Every KEEL
  // screen is English; restating both here covers all connected KEEL pages
  // without touching the consumer path.
  React.useEffect(() => {
    document.title = t("brand.wordmark");
    document.documentElement.lang = "en";
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-4">
          <span className="text-lg font-semibold tracking-tight text-gray-900">
            {t("brand.wordmark")}
          </span>
          <nav className="flex gap-2 text-sm">
            {NAV[variant].map((item) => (
              <ShellLink key={item.to} to={item.to} end={item.end} label={item.label()} />
            ))}
          </nav>
        </div>
        <nav className="flex items-center gap-2 text-sm">
          <ShellLink to="/account" label={t("shell.nav.account")} />
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-full px-3 py-1 text-gray-600 hover:bg-gray-100"
          >
            {t("shell.nav.sign_out")}
          </button>
        </nav>
      </div>
    </div>
  );
}

export function KeelAppShell({
  variant = "student",
  width = "narrow",
  title,
  subtitle,
  actions,
  children,
}: {
  variant?: ShellVariant;
  width?: PageWidth;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      <KeelShellBar variant={variant} />
      <Page width={width} fullHeight={false}>
        <PageHeader title={title} subtitle={subtitle} actions={actions} />
        {children}
      </Page>
    </div>
  );
}

function ShellLink({
  to,
  label,
  end,
}: {
  to: string;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `rounded-full px-3 py-1 ${
          isActive
            ? "bg-gray-900 text-white"
            : "text-gray-600 hover:bg-gray-100"
        }`}
    >
      {label}
    </NavLink>
  );
}

export default KeelAppShell;
