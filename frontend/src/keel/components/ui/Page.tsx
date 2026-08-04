import React from "react";

// KEEL UI — page column. One max-width per surface kind so coach and student
// screens stop choosing their own: `narrow` for the student app and dialogs,
// `default` for coach work screens, `wide` for the two-pane editors.

export type PageWidth = "narrow" | "default" | "wide";

const WIDTH: Record<PageWidth, string> = {
  narrow: "max-w-3xl",
  default: "max-w-4xl",
  wide: "max-w-6xl",
};

export function Page({
  width = "default",
  /** false when a shell above already owns the viewport height. */
  fullHeight = true,
  className = "",
  children,
}: {
  width?: PageWidth;
  fullHeight?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mx-auto ${fullHeight ? "min-h-screen" : ""} w-full ${WIDTH[width]} px-4 py-8 ${className}`}
    >
      {children}
    </div>
  );
}

/** Page heading block: title + optional subtitle, same rhythm everywhere. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export default Page;
