import React from "react";

// KEEL UI — the one card. A bordered surface; density comes from the content,
// not from the frame. `tone` exists for the few stateful surfaces (error
// banners, dashed empty states) so pages stop hand-rolling them.
//
// ── LE CADRE EST UN TRAIT, PAS UN APLAT — ET C'EST MESURÉ ─────────────────
// Avant la charte, une carte était `bg-white` sur un fond `bg-gray-50`: elle se
// lisait parce qu'elle était PLUS CLAIRE que la page. Ce levier n'existe plus —
// la page est `paper` (#FBF8FA, L 98 %) et la charte ne nomme aucun neutre plus
// clair; le blanc pur est justement le neutre sans température qu'elle refuse.
//
// Deux grounds coexistent, et une carte doit se lire sur LES DEUX: `paper` (les
// seize écrans, l'intérieur d'une fenêtre, la moitié des sections de vente) et
// `paper-2` (les sections alternées — `CouplesPage` et `GymsLandingPage` posent
// un `PriceCard` dessus). Mesuré:
//     remplissage `paper-2` sur ground `paper-2` … 1,00:1  → la carte disparaît
//     bordure `line` sur ground `paper`         … 1,30:1  → hairline décorative
//     bordure `line-strong` sur ground `paper`  … 3,84:1  → un trait dessiné
// Donc: MÊME remplissage que le ground, et un trait de CONTRÔLE. C'est la seule
// combinaison qui tienne sur les deux grounds, et c'est la direction du site —
// une fiche technique a des cases tracées, pas des ombres.
//
// ⚠️ NE REMETS PAS `border-line` ICI. Il est à 1,30:1 sur le papier: sur les
// seize écrans, dont le ground EST `paper`, la carte n'aurait plus ni
// remplissage ni contour visible. `line` est le séparateur DÉCORATIF — il est
// juste pour une règle horizontale À L'INTÉRIEUR de cette carte, et c'est
// d'ailleurs ce qu'il faut employer pour un bloc IMBRIQUÉ dans une carte: pas
// un second remplissage (il n'y en a plus de disponible), une division.
// Autorité: `docs/keel/CHARTE-VITRINE.md` §2.

export type CardTone = "default" | "warning" | "dashed";

const TONE: Record<CardTone, string> = {
  default: "border-line-strong bg-paper",
  // ⛔ UN ÉTAT, ET IL NE BOUGE PAS. Ambre = attention dans tout le produit, et
  // un bandeau d'avertissement PORTE UN FAIT — il a donc le droit d'être une
  // surface saturée et pas seulement une pastille. Ici le fond est le signal:
  // `amber-200` en bordure est faible sur le papier, c'est `amber-50` qui
  // identifie la carte. Ne pas « harmoniser » ces deux valeurs avec la charte.
  warning: "border-amber-200 bg-amber-50",
  // Le vide en attente. Il se distingue du plein par la FORME (le pointillé),
  // jamais par une teinte: un emplacement libre n'est pas un état du système.
  dashed: "border-dashed border-line-strong bg-paper",
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
        // `rounded-card` = `--radius-card` (12px), exactement la valeur que
        // `rounded-xl` rendait ici: le rayon n'a pas changé, il porte enfin son
        // nom. Le vocabulaire du kit est `part` (4px) · `card` (12px) ·
        // `fiche` (16px) · `full` (boutons et pastilles). Rien d'autre.
        "rounded-card border",
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

/**
 * L'étiquette d'une section — l'équerre de l'app.
 *
 * ⚠️ ELLE PORTE LA SIGNATURE, ET C'EST LA DÉCISION LA PLUS VISIBLE DU KIT.
 * C'est le `Kicker` de la vitrine (`ui/Marketing.tsx`) sous un autre nom: même
 * rôle — un sur-titre en capitales qui ouvre un groupe de cartes ou une liste —
 * donc même forme. L'équerre « marque l'origine de ce qui est spécifié »
 * (charte §4), et une section en est une. C'est ce qui fait qu'un visiteur qui
 * s'inscrit reconnaît l'endroit où il arrive.
 *
 * ⚠️ L'ÉQUERRE NE FLOTTE JAMAIS SEULE: il y a toujours un mot à sa droite. Elle
 * vit donc ici, collée au texte, et pas comme un composant qu'on pourrait poser
 * dans le vide. Une équerre sans libellé est un défaut, pas une décoration.
 *
 * ⚠️ NE POSE PAS DE `px-*` SUR CE NŒUD via `className`. La classe `.eq` pose
 * `padding-left: 1.125rem` HORS de toute couche CSS, donc elle bat un utilitaire
 * de même spécificité: les deux sur le même élément cassent silencieusement la
 * marge intérieure de gauche. (Vérifié: les 11 appels qui passent un `className`
 * ne passent qu'un `mb-*`.)
 *
 * `text-label` remplace `text-sm`: 0,6875rem, +0,1em d'approche, capitales —
 * l'étiquette de la charte (§3). `ink-soft` sur `paper` = 6,11:1.
 */
export function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`eq mb-3 text-label font-semibold uppercase text-ink-soft ${className}`}
    >
      {children}
    </h2>
  );
}

export default Card;
