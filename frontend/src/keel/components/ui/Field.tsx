import React from "react";

// KEEL UI — form field chrome. The label/hint/control stack every KEEL form
// repeats, plus the shared control classes so <input>, <select> and <textarea>
// all carry the same border, focus ring and disabled state.

/**
 * La classe d'un contrôle de saisie. Cent appels dans le produit connecté.
 *
 * ⛔ `text-base … lg:text-sm`, ET C'EST LA CORRECTION D'UN DÉFAUT MESURÉ.
 * Cette constante portait `text-sm` — 14 px — sur toutes les tailles. `index.css`
 * pose pourtant `font-size: 16px` sur les champs sous `lg`, précisément parce que
 * Safari iOS ZOOME sur un champ dont le texte fait moins de 16 px au focus et NE
 * DÉZOOME JAMAIS en sortant. Mais cette règle vit dans `@layer base`, et un
 * utilitaire la BAT: la protection était contournée sans avoir été retirée, sur
 * chacun des cent champs du produit. Le zoom se voyait sur `/start` avant que
 * cette page se fabrique sa propre classe (elle avait raison).
 * ⚠️ La réponse n'est PAS `maximum-scale=1`: ça réglerait le symptôme en
 * interdisant aussi le zoom volontaire. Ne remets pas `text-sm` nu ici.
 *
 * ⛔ `border-line-strong` ET JAMAIS `border-line`. WCAG 1.4.11 exige 3:1 pour la
 * bordure d'un composant d'interface; `line` est à 1,30:1 sur le papier (c'est un
 * séparateur décoratif), `line-strong` à 3,84:1. Un champ est un contrôle.
 *
 * ⛔ `min-w-0`, ET CE N'EST PAS DÉCORATIF. Un enfant de flex a `min-width: auto`
 * par défaut: il refuse d'être plus étroit que son contenu, donc un champ en
 * `flex-1` NE RÉTRÉCIT PAS et pousse la ligne — mesuré à 320 px, c'est un
 * débordement horizontal de la page entière. Même piège que `.fig-scroll`.
 *
 * L'anneau de focus est explicite: la règle `:focus-visible` de `tokens.css` ne
 * couvre que `a`, `button` et `[tabindex]` — un champ n'en fait pas partie.
 * `fig-600` sur `paper` = 7,36:1 (seuil 3:1 pour un élément non textuel).
 */
export const inputClass =
  "block w-full min-w-0 rounded-card border border-line-strong bg-paper px-3 py-2.5 " +
  "text-base text-ink placeholder-ink-soft transition-colors " +
  "focus:border-fig-600 focus:outline-none focus:ring-2 focus:ring-fig-600 " +
  "disabled:bg-paper-2 disabled:text-ink-soft disabled:opacity-60 lg:text-sm";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  className = "",
  children,
}: {
  label: string;
  /** La ligne d'aide sous le contrôle, en encre secondaire. */
  hint?: string;
  /** La ligne rouge sous le contrôle; gagne contre `hint`. */
  error?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      {/* L'étiquette de la charte (§3): `text-label` — 0,6875rem, +0,1em
          d'approche, capitales. C'est le seul cran de l'échelle qui existe pour
          ce rôle, et il est le même sur la vitrine et dans l'app.
          ⚠️ PAS de `font-display` ici: Young Serif ne descend jamais sous 20 px
          (une seule graisse, contours simulés si on la met en gras). */}
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-label font-semibold uppercase text-ink-soft"
      >
        {label}
      </label>
      {children}
      {/* ⛔ LE ROUGE EST UN ÉTAT ET IL NE BOUGE PAS: rouge = échec dans tout le
          produit, et la teinte de marque n'entre jamais dans un objet d'état.
          `red-700` sur `paper` = 6,13:1. `ink-soft` = 6,11:1.
          SIGNALÉ, PAS FAIT: ce paragraphe apparaît APRÈS un clic et n'est donc
          pas annoncé aux lecteurs d'écran — il lui manque un `role="alert"`.
          Ne pas l'ajouter ici sans auditer les 77 appels: plusieurs enveloppent
          déjà le champ dans une région annoncée, et deux `alert` imbriqués
          lisent le message deux fois. */}
      {error ? (
        <p className="mt-2 text-sm leading-6 text-red-700">{error}</p>
      ) : hint ? (
        <p className="mt-2 text-sm leading-6 text-ink-soft">{hint}</p>
      ) : null}
    </div>
  );
}

export default Field;
