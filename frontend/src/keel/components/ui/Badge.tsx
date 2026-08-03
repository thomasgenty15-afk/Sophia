import React from "react";

// KEEL UI — the one badge. Tones map to meaning, shared across coach and
// student surfaces: `positive` = an active/kept state, `info` = pending,
// `caution` = degraded or paused, `critical` = refused or exceeded,
// `neutral` = everything that is only a label.

export type BadgeTone = "neutral" | "positive" | "info" | "caution" | "critical";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-gray-100 text-gray-600",
  positive: "bg-emerald-50 text-emerald-700",
  info: "bg-blue-50 text-blue-700",
  caution: "bg-amber-50 text-amber-800",
  critical: "bg-red-50 text-red-700",
};

export function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export default Badge;
