import React from "react";

// KEEL UI — the one card. A bordered white surface; density comes from the
// content, not from the frame. `tone` exists for the few stateful surfaces
// (error banners, dashed empty states) so pages stop hand-rolling them.

export type CardTone = "default" | "warning" | "dashed";

const TONE: Record<CardTone, string> = {
  default: "border-gray-200 bg-white",
  warning: "border-amber-200 bg-amber-50",
  dashed: "border-dashed border-gray-300 bg-white",
};

export function Card({
  tone = "default",
  padded = true,
  className = "",
  children,
}: {
  tone?: CardTone;
  /** false when the content manages its own edge (lists with dividers). */
  padded?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={[
        "rounded-xl border",
        TONE[tone],
        padded ? "p-4" : "overflow-hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </section>
  );
}

/** Uppercase kicker used to head a group of cards or a list. */
export function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 ${className}`}
    >
      {children}
    </h2>
  );
}

export default Card;
