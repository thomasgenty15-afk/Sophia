import React from "react";

/**
 * UNE CASE À COCHER, SON LIBELLÉ, SA LIGNE D'AIDE — la chrome, et rien d'autre.
 *
 * ── POURQUOI ELLE N'EST PAS `Field` ───────────────────────────────────────
 * `Field` pose son étiquette AU-DESSUS du contrôle. Une case à cocher se lit
 * avec son libellé À DROITE, et l'étiquette en capitales du formulaire
 * au-dessus d'une case isolée fabrique une section pour une seule ligne.
 *
 * ⛔ ELLE NE PORTE AUCUNE RÈGLE, ET AUCUNE CLÉ D'i18n. Le champ qui l'utilise
 * (« tout cuisiner en une seule fois ») a sa porte et ses mots; ce fichier
 * n'existe que pour que ses DEUX sites de montage — l'entonnoir et
 * `/app/plan` — ne dessinent pas deux cases différentes. Une seconde markup
 * aurait divergé au premier ajustement d'espacement, et c'est celle qu'on
 * regarde le moins qui garderait l'ancienne.
 *
 * ── ⟳ 2026-09-04 — LA TYPOGRAPHIE EST CELLE D'UNE SOUS-OPTION ─────────────
 * `text-xs`, pas `text-sm`. La case ne vit plus seule dans le formulaire: elle
 * est posée SOUS le sélecteur « Comment voulez-vous cuisiner ? », dont elle
 * précise la réponse. Au même corps que le champ au-dessus, elle se lisait
 * comme une septième question de plein droit; un cran plus petit dit qu'elle
 * appartient à celle qui la précède. Le libellé reste `text-ink` — c'est un
 * contrôle, pas une note de bas de page.
 */
export interface CheckboxFieldProps {
  id: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /**
   * CE QUI MANQUE POUR QUE LA CASE SOIT COCHABLE — entre parenthèses, à côté du
   * libellé. `null` = rien ne manque, et la parenthèse n'existe pas.
   *
   * ⚠️ REQUIS ET NULLABLE, jamais `?`. Un site de montage qui l'oublierait
   * rendrait une case grisée SANS DIRE POURQUOI — « un refus loin du geste se
   * lit comme un bouton mort », cicatrice mesurée trois fois dans ce dépôt. Le
   * `?` en ferait un oubli que le compilateur laisse passer.
   *
   * ⛔ LES PARENTHÈSES SONT DANS LA MARKUP, PAS DANS LA TRADUCTION. Une chaîne
   * qui les porterait se retrouverait un jour rendue ailleurs, parenthèses
   * comprises, au milieu d'une phrase qui n'en veut pas.
   */
  note: string | null;
  /**
   * LA LIGNE SOUS LA CASE. Elle dit ce que le geste FAIT. `null` = rien à
   * ajouter — c'est le cas quand `note` porte déjà le seul message utile, et
   * empiler les deux ferait dire deux fois la même chose sous une seule case.
   */
  hint: string | null;
}

export function CheckboxField(props: CheckboxFieldProps) {
  return (
    <div>
      <label htmlFor={props.id} className="flex cursor-pointer items-start gap-2">
        <input
          id={props.id}
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong text-fig-600 focus:ring-2 focus:ring-fig-600 disabled:opacity-60"
          checked={props.checked}
          disabled={props.disabled}
          onChange={(e) => props.onChange(e.target.checked)}
        />
        <span className="text-xs leading-5 text-ink">
          {props.label}
          {/* ⚠️ DANS LE MÊME `<span>` QUE LE LIBELLÉ, ET C'EST LE POINT: la
              parenthèse doit se lire À LA SUITE, sur la même ligne tant qu'il
              y a la place, et repasser sous le libellé quand il n'y en a plus.
              Un second bloc l'aurait décrochée de la phrase qu'elle complète. */}
          {props.note === null ? null : (
            <span className="text-ink-soft">{" "}({props.note})</span>
          )}
        </span>
      </label>
      {props.hint === null
        ? null
        : <p className="mt-1 text-xs leading-5 text-ink-soft">{props.hint}</p>}
    </div>
  );
}

export default CheckboxField;
