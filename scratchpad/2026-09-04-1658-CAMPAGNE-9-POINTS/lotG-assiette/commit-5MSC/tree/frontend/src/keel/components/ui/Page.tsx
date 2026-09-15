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

/**
 * Page heading block: title + optional subtitle, same rhythm everywhere.
 *
 * ⚠️ LE `h1` EST EN DISPLAY, ET IL N'A PAS DE GRAISSE. `font-display text-title`
 * remplace `text-2xl font-semibold`: c'est le même cran que le `h1` de `/start`
 * et de `/auth`, donc le titre d'un écran de travail et celui d'une porte du
 * produit se ressemblent enfin. `text-title` va de 1,7rem (27,2 px à 320) à
 * 2,7rem — toujours au-dessus du plancher de 20 px de Young Serif.
 *
 * ⛔ NE REMETS PAS DE `font-semibold` NI DE `font-bold` ICI. Young Serif n'a
 * QU'UNE graisse: il n'y a rien à charger, le navigateur la simulerait en
 * épaississant les contours. La hiérarchie se fait à la taille et à l'espace.
 *
 * Le chapô passe au corps de la charte (1rem) et à la mesure de lecture de 62
 * caractères: sous un titre de 27 à 43 px, une ligne de 14 px n'appartenait plus
 * au même bloc. `ink-soft` sur `paper` = 6,11:1.
 */
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
      <div className="min-w-0">
        <h1 className="text-balance font-display text-title text-ink">{title}</h1>
        {subtitle && (
          <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-ink-soft">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export default Page;
