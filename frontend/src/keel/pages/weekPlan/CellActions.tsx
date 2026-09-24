// ⟳ 2026-09-24 — SORTI DE `StudentWeekPlanPage.tsx` (découpage, lot 4a), À L'IDENTIQUE.
// Le duo enregistrer/annuler d'une cellule.
// Le fichier d'origine l'importe; il ré-exporte ce qu'il exportait.

import { Button } from "../../components/ui/Button";
import { t } from "../../i18n/t";

/**
 * LE DUO SAVE/CANCEL D'UNE CELLULE — écrit une fois pour les cinq.
 *
 * Cinq copies du même couple de boutons, c'est cinq endroits où l'un peut
 * cesser d'être désactivé pendant une écriture. Le composant porte la règle:
 * on n'enregistre pas deux cellules à la fois.
 */
export function CellActions(
  { busy, disabled, onSave, onCancel }: {
    busy: boolean;
    disabled: boolean;
    onSave: () => void;
    onCancel: () => void;
  },
) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button onClick={onSave} disabled={disabled} variant="secondary">
        {busy ? t("plan.busy") : t("plan.save")}
      </Button>
      <button
        type="button"
        onClick={onCancel}
        className="text-xs text-fig-700 underline underline-offset-2 hover:text-fig-800"
      >
        {t("plan.cancel")}
      </button>
    </div>
  );
}
