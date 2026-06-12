import { type ComponentType, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  ChevronRight,
  LayoutDashboard,
  Server,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

type AdminSection = "overview" | "usage" | "production-log";

type AdminShellProps = {
  active: AdminSection;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  actions?: ReactNode;
  children: ReactNode;
  width?: "standard" | "wide";
};

const NAV_ITEMS: Array<{
  id: AdminSection;
  href: string;
  label: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  {
    id: "overview",
    href: "/admin",
    label: "Overview",
    detail: "Etat general et outils actifs",
    icon: LayoutDashboard,
  },
  {
    id: "usage",
    href: "/admin/usage",
    label: "Costs",
    detail: "Couts, users, appels et pricing",
    icon: BarChart3,
  },
  {
    id: "production-log",
    href: "/admin/production-log",
    label: "Logs",
    detail: "Web, WhatsApp, Stripe, Edge",
    icon: Terminal,
  },
];

export function AdminShell({
  active,
  title,
  description,
  icon: Icon,
  actions,
  children,
  width = "wide",
}: AdminShellProps) {
  const location = useLocation();
  const activeItem = NAV_ITEMS.find((item) => item.id === active) ?? NAV_ITEMS[0];
  const container = width === "standard" ? "max-w-6xl" : "max-w-[1520px]";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-indigo-500/30">
      <div className={cn("mx-auto px-4 sm:px-6 lg:px-8", container)}>
        <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
          <aside className="hidden lg:block border-r border-neutral-900 pr-6">
            <div className="sticky top-0 flex h-screen flex-col py-6">
              <Link to="/admin" className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-neutral-900/70">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">Sophia Admin</div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-600">Control room</div>
                </div>
              </Link>

              <nav className="mt-8 space-y-1">
                {NAV_ITEMS.map((item) => {
                  const ItemIcon = item.icon;
                  const isActive = item.id === active;
                  return (
                    <Link
                      key={item.id}
                      to={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors",
                        isActive
                          ? "border-indigo-500/25 bg-indigo-500/10 text-white"
                          : "border-transparent text-neutral-400 hover:border-neutral-800 hover:bg-neutral-900/70 hover:text-neutral-100"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                          isActive
                            ? "border-indigo-500/25 bg-indigo-500/10 text-indigo-300"
                            : "border-neutral-800 bg-neutral-950 text-neutral-500 group-hover:text-neutral-300"
                        )}
                      >
                        <ItemIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{item.label}</span>
                        <span className="block truncate text-xs text-neutral-500">{item.detail}</span>
                      </span>
                      {isActive ? <ChevronRight className="h-4 w-4 text-indigo-300" /> : null}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-auto rounded-xl border border-neutral-800 bg-neutral-900/35 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-neutral-300">
                  <Server className="h-4 w-4 text-emerald-300" />
                  Production
                </div>
                <p className="mt-2 text-xs leading-5 text-neutral-500">
                  Toutes les pages admin utilisent les memes filtres visuels et le meme cadre de lecture.
                </p>
              </div>
            </div>
          </aside>

          <div className="min-w-0 pb-10">
            <header className="sticky top-0 z-20 -mx-4 border-b border-neutral-900 bg-neutral-950/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
              <div className="flex items-center justify-between gap-3">
                <Link to="/admin" className="flex min-w-0 items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">Sophia Admin</div>
                    <div className="truncate text-xs text-neutral-500">{activeItem.label}</div>
                  </div>
                </Link>
                {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
              </div>
              <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {NAV_ITEMS.map((item) => {
                  const ItemIcon = item.icon;
                  const isActive = item.id === active;
                  return (
                    <Link
                      key={item.id}
                      to={item.href}
                      className={cn(
                        "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-medium",
                        isActive
                          ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-200"
                          : "border-neutral-800 bg-neutral-900/50 text-neutral-400"
                      )}
                    >
                      <ItemIcon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </header>

            <main className="py-6 lg:py-8">
              <section className="mb-6 flex flex-col gap-4 border-b border-neutral-900 pb-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0">
                  <div className="mb-3 flex items-center gap-2 text-xs text-neutral-500">
                    <Link to="/admin" className="hover:text-neutral-300">Admin</Link>
                    {location.pathname !== "/admin" ? (
                      <>
                        <ChevronRight className="h-3.5 w-3.5" />
                        <span className="text-neutral-400">{activeItem.label}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-indigo-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h1 className="text-2xl font-semibold tracking-normal text-white">{title}</h1>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">{description}</p>
                    </div>
                  </div>
                </div>
                {actions ? <div className="hidden shrink-0 items-center gap-2 lg:flex">{actions}</div> : null}
              </section>

              {children}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminShell;
