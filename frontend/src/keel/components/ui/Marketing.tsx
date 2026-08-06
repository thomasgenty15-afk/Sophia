import React from "react";
import { Card } from "./Card";

// KEEL UI — the three primitives the PUBLIC sales pages share.
//
// They lived inside `pages/LandingPage.tsx` while there was exactly one sales
// page. There are two now (`/` sells to someone who sells a course, `/gyms`
// sells to an independent gym owner), and a second copy of `Kicker` is how the
// two pages start drifting apart in tracking, weight and colour without anybody
// deciding that they should.
//
// They are here rather than imported from `LandingPage` on purpose: importing a
// component from a page module drags that page's whole dependency graph — auth
// context, `resolveHomePath`, the structured-data block — into every other page
// that wants an uppercase eyebrow.
//
// NOTHING PAGE-SPECIFIC BELONGS IN THIS FILE. The schematic panels (the Monday
// page, the chat, the worked example) stay local to the page that shows them:
// they are copy, they read that page's own `landing.*` / `gyms.*` keys, and a
// shared mock is a mock that silently changes meaning on both pages when one of
// them is edited.

/** Uppercase eyebrow over a section title. */
export function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
      {children}
    </p>
  );
}

/** The `<h2>` of a sales section. Sized to sit under a `Kicker`. */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-2 max-w-2xl text-balance text-2xl font-semibold leading-tight sm:text-3xl">
      {children}
    </h2>
  );
}

/**
 * One price, one period, one line of what it buys — stacked, in that order.
 *
 * There is deliberately no "features" list and no second card: both sales pages
 * quote a single per-seat price with no platform fee, and a card built to be
 * compared is a card that invites the reader to look for the plan they are
 * missing.
 */
export function PriceCard({
  price,
  period,
  label,
}: {
  price: string;
  period: string;
  label: string;
}) {
  return (
    <Card className="h-full">
      <div className="whitespace-nowrap text-4xl font-semibold tabular-nums leading-none text-gray-900">
        {price}
      </div>
      <div className="mt-2 text-sm text-gray-500">{period}</div>
      <p className="mt-3 border-t border-gray-100 pt-3 text-sm font-medium text-gray-900">
        {label}
      </p>
    </Card>
  );
}
