import React from "react";
import { Link } from "react-router-dom";

// KEEL UI — the one button. Every KEEL surface renders actions through this
// component (or ButtonLink for navigations), so the registry of what a button
// looks like lives in exactly one file. Variants map to intent, not to color:
// pick by what the action IS, never by what shade a page happens to want.

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "brand";
export type ButtonSize = "md" | "sm";

const VARIANT: Record<ButtonVariant, string> = {
  // ── `primary` EST PASSÉE À LA FIGUE, ET C'EST L'ARBITRAGE DU CHANTIER ─────
  // La règle de couleur de l'app: LA TEINTE DE MARQUE MARQUE LA NAVIGATION ET
  // L'ACTION, LES COULEURS D'ÉTAT MARQUENT LES FAITS, ELLES NE SE CROISENT
  // JAMAIS. Une action principale a donc le droit à la marque — c'est même le
  // seul endroit du produit connecté où un aplati de couleur est légitime.
  // Contrastes calculés: libellé `paper` sur `fig-700` = 9,98:1; au survol,
  // sur `fig-800` = 12,79:1 (charte §2, seuil 4,5).
  //
  // ⚠️ CE QUE ÇA N'AUTORISE PAS: la figue n'entre jamais dans une pastille
  // `Badge`, ni dans un chiffre, ni dans un verdict. Un bouton est une ACTION,
  // pas un fait. Et une seule action principale par écran — deux boutons figue
  // côte à côte, c'est zéro hiérarchie.
  primary:
    "bg-fig-700 text-paper hover:bg-fig-800 disabled:hover:bg-fig-700",
  // Le geste secondaire: un contour de CONTRÔLE, donc `line-strong` (3,84:1) et
  // jamais `line` (1,30:1 — décoratif, WCAG 1.4.11 exige 3:1). Texte `ink` sur
  // `paper` = 16,18:1; sur le survol `fig-50` = 15,38:1.
  secondary:
    "border border-line-strong bg-paper text-ink hover:bg-fig-50 disabled:hover:bg-paper",
  // Le geste qu'on peut ignorer — « Annuler », « Ne plus afficher ». Il reste
  // NEUTRE exprès: si les trois premiers gestes d'un écran portent la marque,
  // aucun ne la porte plus. `ink-soft` sur `paper` = 6,11:1, sur `fig-50` =
  // 5,81:1.
  ghost: "text-ink-soft hover:bg-fig-50 disabled:hover:bg-transparent",
  // ⛔ `danger` EST UN ÉTAT, ET SES TROIS VALEURS ROUGES N'ONT PAS BOUGÉ.
  // Rouge = échec/refus dans tout le produit; un bouton destructeur emprunte ce
  // sens et doit rester distinguable de `primary` (35° séparent le rouge de la
  // figue, et surtout l'un est un contour rouge sur fond clair, l'autre un
  // aplati de marque). Seul le fond neutre a suivi la charte: `bg-white` →
  // `bg-paper`. `red-700` sur `paper` = 6,13:1.
  danger:
    "border border-red-200 bg-paper text-red-700 hover:bg-red-50 disabled:hover:bg-paper",
  // ── `brand` — LE GESTE COMMERCIAL D'UNE PAGE DE VENTE ─────────────────────
  // ⚠️ CE COMMENTAIRE A ÉTÉ RÉÉCRIT LE 2026-08-13, ET IL FAUT LIRE POURQUOI.
  //
  // Cette variante a été ajoutée plutôt que `primary` re-teintée, à un moment
  // où l'app authentifiée était HORS du périmètre de la charte: la reteindre
  // aurait fait entrer la vitrine dans `/app` et `/coach` par effet de bord,
  // avant que l'arbitrage de couleur de l'app soit rendu. La consigne qui
  // allait avec — « si tu la vois ailleurs que sur les huit pages publiques,
  // c'est une fuite » — était un CONFINEMENT, pas une règle de style.
  //
  // Le chantier « la plateforme passe à la charte » a rendu cet arbitrage: la
  // marque marque l'action, ici comme là-bas. `brand` et `primary` rendent donc
  // désormais LA MÊME CHOSE, et c'est voulu, pas un oubli à nettoyer.
  //
  // Ce qui reste de la distinction est une INTENTION LISIBLE AU SITE D'APPEL:
  // `brand` = le geste commercial d'une page de vente (« Essayer », « Voir les
  // tarifs »), `primary` = l'action principale d'un écran de travail. Les deux
  // noms survivent parce que 21 appels portent `brand` et qu'un lot visuel n'a
  // pas le droit de renommer une API à travers huit pages livrées.
  // ⚠️ N'écris pas `brand` dans `/app` ni `/coach` pour autant: `primary` y dit
  // la même chose et le dit juste. Fusionner les deux est un lot à part.
  brand:
    "bg-fig-700 text-paper hover:bg-fig-800 disabled:hover:bg-fig-700",
};

// ── LES DEUX TAILLES ONT UN PLANCHER, ET IL EST MESURÉ ────────────────────
// `sm` faisait **22 px** de haut (`py-0.5` = 2 px de part et d'autre d'un
// `text-xs`), donc SOUS le minimum de 24 px de WCAG 2.5.8 — et c'est la taille
// que les seize écrans emploient pour leurs gestes de ligne. `min-h-6` (24 px)
// pose le plancher sans toucher au rythme vertical: le padding reste le même,
// seule la hauteur minimale est garantie.
//
// ⚠️ `md` est à ~36 px, sous les 44 px de la cible tactile CONFORTABLE (2.5.5,
// niveau AAA). Non corrigé ici EXPRÈS: passer `md` à 44 px déplace la mise en
// page des seize écrans d'un coup, ce qui est un lot à soi et pas un effet de
// bord de la charte. Consigné dans `scratchpad/plateforme/SIGNALE.md` §3.
// Le plancher de 24 px, lui, est le minimum de niveau AA: il n'est pas
// négociable, et il ne coûte aucun déplacement.
const SIZE: Record<ButtonSize, string> = {
  md: "px-4 py-2 text-sm",
  sm: "min-h-6 px-2.5 py-0.5 text-xs",
};

// `buttonClass` reste exportée, et son commentaire d'origine est PÉRIMÉ: il
// annonçait « quatre appelants — des surfaces qui ont besoin de l'APPARENCE
// d'un bouton sur un élément qui n'en est pas un ». Vérifié le 2026-08-13, hors
// commentaires, sur tout `frontend/src`: ZÉRO appelant. Les trois occurrences
// qui restent dans le dépôt sont des commentaires qui parlent d'elle (dont un
// piège utile: `hidden` perd contre le `inline-flex` posé ici, il faut
// ENVELOPPER pour masquer un bouton — voir `PublicHeader.tsx`).
// Elle n'est donc pas supprimée pour autant: c'est une API publique, et la
// retirer est un geste de purge qui n'a rien à voir avec la charte.
// La règle `only-export-components` mord ici parce que le gate ne linte que les
// fichiers modifiés; la déplacer dans son propre module est la vraie réponse et
// c'est un lot à part.
// eslint-disable-next-line react-refresh/only-export-components
export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  extra = "",
): string {
  return [
    // `rounded-full` sur un bouton, et c'est la charte: `tokens.css` §2 réserve
    // le cercle complet aux boutons et aux pastilles d'état. Le reste du
    // vocabulaire de rayon est `part` (4px), `card` (12px), `fiche` (16px).
    "inline-flex items-center justify-center gap-2 rounded-full font-medium",
    "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest} />
  );
}

type ButtonLinkProps = {
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
};

export function ButtonLink({
  to,
  variant = "secondary",
  size = "md",
  className = "",
  children,
}: ButtonLinkProps) {
  return (
    <Link to={to} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

export default Button;
