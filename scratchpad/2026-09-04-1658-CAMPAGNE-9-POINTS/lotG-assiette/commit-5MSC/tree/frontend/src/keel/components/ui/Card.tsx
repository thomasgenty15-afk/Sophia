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
 * L'étiquette d'une section: le cran `text-label` de la charte, **sans équerre**.
 *
 * ── ⛔ L'ÉQUERRE A ÉTÉ POSÉE ICI PUIS RETIRÉE. NE LA REMETS PAS ─────────────
 * Elle y a vécu quelques heures, au motif — juste — que ce composant est le
 * `Kicker` de la vitrine sous un autre nom, et que l'équerre « marque l'origine
 * de ce qui est spécifié » (charte §4). Deux MESURES l'ont fait retirer, et
 * c'est la mesure qui tranche, pas le raisonnement:
 *
 * 1. **LA DENSITÉ.** `SectionLabel` est importé par 31 fichiers, donc le nombre
 *    d'équerres d'un écran est proportionnel à son nombre de cartes. Relevé par
 *    fenêtre glissante sur les coordonnées du document (et NON dans le viewport
 *    à scroll 0, qui sous-compte et m'avait donné « 3 au pire »):
 *    **8 équerres simultanées** sur `/coach/clients/<id>` (13 dans la page),
 *    **7 à 1280 px sur `/app/progress`**, 5 sur `/app/household`.
 *    La charte dit « une seule marque répétée » (§1). Huit fois dans un écran,
 *    ce n'est plus une signature, c'est une trame.
 *
 * 2. **L'INCOHÉRENCE, qui est l'argument décisif.** Le cran `text-label` est
 *    rendu **76 fois** dans le produit connecté **sans** équerre, et zéro fois
 *    avec en dehors de ce composant. La marque ne distinguait donc pas une
 *    catégorie d'étiquettes: elle marquait « cette étiquette-ci passe par
 *    `SectionLabel` », ce qui est un fait d'implémentation, pas une règle de
 *    dessin. Sur `/app/today`, trois étiquettes du même cran se suivaient et
 *    une seule portait la marque.
 *
 * **Où la signature vit dans l'app, et ça suffit:** le mot-symbole du shell
 * (une par écran, alignée sur `PublicHeader`) et le fronton de
 * `ui/SetupSection.tsx`. C'est la dose de la vitrine.
 *
 * ⚠️ SI TU LA REMETS UN JOUR: `.eq` pose `padding-left: 1.125rem` **hors de
 * toute couche CSS**, donc elle bat un utilitaire `px-*` de même spécificité —
 * les deux sur le même nœud cassent silencieusement la marge de gauche.
 *
 * `text-label`: 0,6875rem, +0,1em d'approche, capitales (charte §3).
 * `ink-soft` sur `paper` = 6,11:1.
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
      className={`mb-3 text-label font-semibold uppercase text-ink-soft ${className}`}
    >
      {children}
    </h2>
  );
}

export default Card;
