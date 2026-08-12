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
  primary:
    "bg-gray-900 text-white hover:bg-gray-700 disabled:hover:bg-gray-900",
  secondary:
    "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 disabled:hover:bg-white",
  ghost: "text-gray-600 hover:bg-gray-100 disabled:hover:bg-transparent",
  danger:
    "border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:hover:bg-white",
  // ── `brand` — LE GESTE COMMERCIAL D'UNE PAGE DE VENTE, ET RIEN D'AUTRE ────
  // Ajoutée plutôt que `primary` re-teintée, et c'est le point de ce commentaire.
  //
  // `primary` est rendue par TOUTE l'app authentifiée — des centaines d'appels.
  // La reteindre en figue aurait fait entrer la charte de la vitrine dans
  // `/app` et `/coach` par effet de bord, alors que l'app y entrera par un
  // chantier à elle, avec ses propres arbitrages (au premier rang desquels: la
  // couleur saturée y appartient au SENS, et un bouton de marque partout
  // rendrait un état indistinguable d'une action).
  //
  // Cette variante est donc réservée aux HUIT pages publiques. Si tu la vois
  // dans `/app` ou `/coach`, c'est une fuite, pas une décision.
  brand:
    "bg-fig-700 text-white hover:bg-fig-800 disabled:hover:bg-fig-700",
};

const SIZE: Record<ButtonSize, string> = {
  md: "px-4 py-2 text-sm",
  sm: "px-2.5 py-0.5 text-xs",
};

// `buttonClass` est exportée depuis toujours et a quatre appelants: des
// surfaces qui ont besoin de l'APPARENCE d'un bouton sur un élément qui n'en
// est pas un. La règle `only-export-components` a commencé à mordre ici parce
// que le gate ne lint QUE les fichiers modifiés, et que ce fichier n'avait pas
// bougé depuis `26af8ef7` — ce n'est pas une régression de la refonte du site.
// La déplacer dans son propre module est la vraie réponse, et c'est un lot à
// part: elle touche quatre importateurs pour une raison sans rapport.
// eslint-disable-next-line react-refresh/only-export-components
export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  extra = "",
): string {
  return [
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
