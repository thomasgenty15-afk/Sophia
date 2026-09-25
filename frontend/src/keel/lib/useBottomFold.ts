import React from "react";

/**
 * ⟳ 2026-09-25 — UN DÉPLIANT QUI SE REFERME PAR LE BAS.
 *
 * Demandé sur `/app/plan`: « masquer la liste » et « masquer le détail » en
 * bas, pas en haut. On ouvre par le bouton du haut (« Voir … »), qui disparaît;
 * on referme par un bouton posé sous ce qu'on vient de lire.
 *
 * ⚠️ REFERMER PAR LE BAS FAIT REMONTER LA PAGE SOUS LE LECTEUR: une liste de
 * 38 lignes qui se replie laisse l'écran sur la carte suivante, ou plus loin.
 * Au repli, le bouton du haut reprend le focus, et la page revient sur lui
 * s'il est sorti de l'écran — sinon rien ne bouge.
 */
export function useBottomFold(): {
  open: boolean;
  openFold: () => void;
  /**
   * `userGesture` faux = un clic de programme (la visite guidée du plan de
   * démonstration): la page ne revient PAS sur le bouton du haut — la visite
   * mène elle-même le défilement, et ce retour la faisait sauter.
   */
  closeFromBottom: (userGesture?: boolean) => void;
  /** Le bouton « Voir … » du haut: il reprend le focus au repli. */
  topRef: React.RefObject<HTMLButtonElement | null>;
} {
  const [open, setOpen] = React.useState(false);
  const topRef = React.useRef<HTMLButtonElement | null>(null);
  const refocus = React.useRef(false);
  React.useEffect(() => {
    if (open || !refocus.current) return;
    refocus.current = false;
    const top = topRef.current;
    if (!top) return;
    top.focus({ preventScroll: true });
    const rect = top.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      top.scrollIntoView({ block: "center" });
    }
  }, [open]);
  return {
    open,
    openFold: () => setOpen(true),
    closeFromBottom: (userGesture = true) => {
      refocus.current = userGesture;
      setOpen(false);
    },
    topRef,
  };
}
