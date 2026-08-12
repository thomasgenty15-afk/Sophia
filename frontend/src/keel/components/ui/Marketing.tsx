import React from "react";
import { Card } from "./Card";

// KEEL UI — the primitives the PUBLIC sales pages share.
//
// They lived inside `pages/LandingPage.tsx` while there was exactly one sales
// page. There are EIGHT now (three household pages, three professional ones and
// their two halls), and a second copy of `Kicker` is how those pages start
// drifting apart in tracking, weight and colour without anybody deciding that
// they should.
//
// ── ⚠️ LA TEINTE DE MARQUE EXISTE DÉSORMAIS, ET C'EST UN RENVERSEMENT ──────
// Ce fichier et l'en-tête de l'ancienne `LandingPage` ont porté pendant des
// mois la règle inverse: « aucune teinte d'accent, toute couleur saturée est un
// ÉTAT ». Elle était juste tant que la vitrine était un rapport en noir et
// blanc. La refonte de 2026-08-12 la RENVERSE en connaissance de cause: la
// marque a une teinte, `fig-700` (#632C4C, 325°), et elle est ici.
//
// CE QUE LA RÈGLE D'ORIGINE PROTÉGEAIT RESTE VRAI, et c'est la partie à ne pas
// perdre: dans l'app, la couleur saturée appartient au SENS — émeraude = ok,
// ambre = attention, rouge = échec, bleu = info (quatre familles, pas trois:
// `info` occupe le bleu dans `ui/Badge.tsx`). La figue ne s'y confond pas pour
// deux raisons, et il faut les deux: elle est à 35° du rouge, 73° de l'ambre,
// 101° du bleu et 165° de l'émeraude; et surtout ELLE N'ENTRE JAMAIS DANS UNE
// PASTILLE — la pastille appartient aux états, la figue au texte, aux traits
// et aux boutons pleins.
//
// Si tu lis un commentaire ailleurs qui interdit encore l'accent, il est
// périmé: réécris-le plutôt que de retirer la couleur.
// Autorité: `scratchpad/site/design/CHARTE.md` §2.
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

/**
 * L'étiquette de champ d'une section — capitales, et TOUJOURS précédée de
 * l'équerre (la classe `eq`, définie dans `tokens.css`).
 *
 * ⚠️ L'équerre ne flotte jamais seule: il y a toujours un mot à sa droite. Une
 * équerre sans libellé est un défaut, pas une décoration. C'est pour ça qu'elle
 * vit ICI, collée au texte, et non comme un composant à part qu'on pourrait
 * poser dans le vide.
 *
 * `onDark` remonte l'équerre à `fig-300`: sur le bloc sombre, `fig-700` tombe à
 * 2,4:1 et le trait disparaît.
 */
export function Kicker(
  { children, onDark = false }: { children: React.ReactNode; onDark?: boolean },
) {
  return (
    <p
      className={`eq text-label font-semibold uppercase ${
        onDark ? "eq-on-dark text-fig-300" : "text-ink-soft"
      }`}
    >
      {children}
    </p>
  );
}

/**
 * Le `<h2>` d'une section de vente. Dimensionné pour tenir sous un `Kicker`.
 *
 * Young Serif n'a QU'UNE graisse: la hiérarchie se fait à la taille et à
 * l'espace, jamais au gras. Ne pas ajouter de `font-bold` ici — il n'y a rien
 * à charger, le navigateur le simulerait en épaississant les contours.
 */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-3 max-w-2xl text-balance font-display text-title">
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
      {/* Le prix en display: c'est le seul chiffre d'une page de vente qui a le
          droit d'être un titre. `tabular-nums` pour que deux cartes côte à côte
          alignent leurs virgules. */}
      <div className="whitespace-nowrap font-display text-4xl tabular-nums leading-none text-ink">
        {price}
      </div>
      <div className="mt-2 text-sm text-ink-soft">{period}</div>
      <p className="mt-3 border-t border-line pt-3 text-sm font-medium text-ink">
        {label}
      </p>
    </Card>
  );
}
