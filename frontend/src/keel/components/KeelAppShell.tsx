import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
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
    // DE-WHATSAPP — la conversation doit être à ≤1 tap depuis tout l'espace
    // élève. Elle est en deuxième position, pas en dernière: c'est le canal,
    // pas une annexe.
    { to: "/app/chat", label: () => t("app.nav.chat") },
    // PIVOT N3 — une route sans lien est une fonctionnalité que personne n'a
    // (voir la note en tête de ce fichier): l'écran plan arrive avec son
    // entrée de nav dans le même changement.
    { to: "/app/plan", label: () => t("app.nav.plan") },
    { to: "/app/meals", label: () => t("app.nav.meals") },
    { to: "/app/progress", label: () => t("app.nav.progress") },
    // UNE ROUTE SANS LIEN EST UNE FONCTIONNALITÉ QUE PERSONNE N'A (voir la note
    // en tête de ce fichier). L'écran santé arrive avec son entrée de nav dans
    // le même changement — et il compte double: une allergie que l'élève ne
    // trouve pas où déclarer est une allergie que le produit ne connaît pas.
    { to: "/app/health", label: () => t("app.nav.health") },
  ],
  coach: [
    // `end` so /coach/templates and /coach/clients/:id do not light "Students".
    { to: "/coach", label: () => t("shell.nav.students"), end: true },
    // LA MÉTHODE prend la place des TEMPLATES. Le coach exprimait sa méthode
    // sur deux écrans qui faisaient le même travail (`/coach/import` et
    // `/coach/templates`), en engagements structurés qu'il n'a aucune raison de
    // connaître. Il l'exprime maintenant ici, en postures et en règles, et les
    // engagements en sont dérivés.
    // `/coach/templates` garde sa route sans lien tant que la migration des
    // coachs déjà équipés n'est pas tranchée: c'est le seul cas où une route
    // sans entrée de nav est légitime ici, et il est temporaire.
    { to: "/coach/protocol", label: () => t("shell.nav.protocol") },
    // A ROUTE WITH NO LINK IS A FEATURE NOBODY HAS (see the note above): the
    // doctrine screen ships with its nav entry in the same change.
    { to: "/coach/doctrine", label: () => t("shell.nav.doctrine") },
    // C5: the Monday read. It shipped with its nav entry for exactly the
    // reason above — the synthesis had been written weekly for nobody.
    { to: "/coach/weekly", label: () => t("shell.nav.weekly") },
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
          {/* A ROUTE WITH NO LINK IS A FEATURE NOBODY HAS — the note at the top
              of this file, applied to /legal. The connected shell had no path
              to it at all, in either space: a student wanting to know who
              holds their data, or a coach checking who they are paying, had to
              sign out to find the answer. Deliberately NOT a ShellLink: it is
              not a destination in the product, so it never lights up as the
              active tab next to Today / Students. */}
          <Link
            to="/legal"
            className="rounded-full px-3 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            {t("shell.nav.legal")}
          </Link>
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
