/**
 * ⟳ 2026-09-25 — LE BOUTON QUI REFERME UN DÉPLIANT, EN BAS de ce qu'il a
 * ouvert (« masquer la liste », « masquer le détail »), sur demande: « en bas
 * et pas en haut ». Va avec `lib/useBottomFold`. Même idiome que le bouton
 * « Voir … » du haut: le soulignement porte l'affordance; `min-h-6` = 24 px.
 */
export function FoldCloser(
  { panelId, label, onClose }: {
    panelId: string;
    label: string;
    /** `userGesture`: un vrai clic (`isTrusted`), pas un clic de programme. */
    onClose: (userGesture: boolean) => void;
  },
) {
  return (
    // À DROITE (⟳ 2026-09-25, demandé): sous le « Voir … » du haut, qui est
    // lui aussi au bord droit des cartes du jour.
    <div className="mt-3 flex justify-end">
      <button
        type="button"
        aria-expanded
        aria-controls={panelId}
        onClick={(e) => onClose(e.nativeEvent.isTrusted)}
        className="min-h-6 text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
      >
        {label}
      </button>
    </div>
  );
}
