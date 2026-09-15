import React from "react";

/**
 * UNE CASE À COCHER, SON LIBELLÉ, SA LIGNE D'AIDE — la chrome, et rien d'autre.
 *
 * ── POURQUOI ELLE N'EST PAS `Field` ───────────────────────────────────────
 * `Field` pose son étiquette AU-DESSUS du contrôle. Une case à cocher se lit
 * avec son libellé À DROITE, et l'étiquette en capitales du formulaire
 * au-dessus d'une case isolée fabrique une section pour une seule ligne.
 *
 * ⛔ ELLE NE PORTE AUCUNE RÈGLE, ET AUCUNE CLÉ D'i18n. Les deux champs de plan
 * qui l'utilisent (« tout cuisiner en une seule fois », « je cuisine la
 * veille ») ont chacun leur porte et leurs mots; ce fichier n'existe que pour
 * qu'ils ne dessinent pas deux cases différentes. Une seconde markup aurait
 * divergé au premier ajustement d'espacement, et c'est celle qu'on regarde le
 * moins qui garderait l'ancienne.
 */
export interface CheckboxFieldProps {
  id: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** La ligne sous la case. Elle dit ce que le geste FAIT, ou ce qui le bloque. */
  hint: string;
}

export function CheckboxField(props: CheckboxFieldProps) {
  return (
    <div>
      <label htmlFor={props.id} className="flex cursor-pointer items-start gap-3">
        <input
          id={props.id}
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong text-fig-600 focus:ring-2 focus:ring-fig-600 disabled:opacity-60"
          checked={props.checked}
          disabled={props.disabled}
          onChange={(e) => props.onChange(e.target.checked)}
        />
        <span className="text-sm leading-6 text-ink">{props.label}</span>
      </label>
      <p className="mt-2 text-sm leading-6 text-ink-soft">{props.hint}</p>
    </div>
  );
}

export default CheckboxField;
