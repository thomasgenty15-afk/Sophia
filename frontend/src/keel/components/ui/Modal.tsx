import React from "react";
import { createPortal } from "react-dom";

// KEEL UI — la fenêtre. Une seule, pour que ses obligations soient tenues une
// seule fois.
//
// ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
// La liste de courses avait sa fenêtre écrite à la main. Les sessions de
// cuisine en demandaient une deuxième. Deux copies d'un même dialogue, ce n'est
// pas deux fois le même code: c'est deux endroits où Échap peut manquer, deux
// verrous de défilement dont un seul restaure la valeur d'avant, et un jour une
// fenêtre qui piège le clavier pendant que l'autre non. Le dépôt tient déjà UN
// bouton, UNE carte, UN badge — celui-ci est la même règle.
//
// ── CE QU'UNE FENÊTRE DOIT, ET QUI N'EST PAS OPTIONNEL ────────────────────
// Recouvrir la page engage. Sans `role`/`aria-modal`, un lecteur d'écran
// continue d'annoncer ce qu'il y a derrière. Sans Échap, la seule sortie est un
// bouton qu'il faut viser. Sans verrou de défilement, le premier geste au-dessus
// du fond emporte la page et on ressort en ayant perdu sa place. Sans focus
// entrant, la tabulation continue dans l'écran RECOUVERT et on agit à l'aveugle
// sur des boutons qu'on ne voit plus.
//
// ── ELLE NE DÉMONTE PAS SES ENFANTS, ELLE LES CACHE ───────────────────────
// `open === false` rend `null`, donc l'appelant qui monte la fenêtre en
// permanence garde SON état: les articles rayés de la liste de courses et les
// recettes dépliées survivent à une fermeture. C'est le comportement voulu —
// on referme pour aller relire un plat, pas pour tout recommencer.

/**
 * DEUX LARGEURS, PAS UNE PAR APPELANT.
 *
 * `md` est celle d'origine et reste le défaut: une liste de courses ou une
 * session de cuisine se lit en colonne étroite. `lg` existe pour la fenêtre de
 * réglages, qui porte des champs côte à côte sur un écran large — à `max-w-lg`
 * ses grilles `sm:grid-cols-2` se retrouvaient à l'étroit alors que la place
 * était là.
 */
export type ModalSize = "md" | "lg";

const SIZE: Record<ModalSize, string> = {
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Nommée: c'est le `aria-label` autant que le titre affiché. */
  title: string;
  closeLabel?: string;
  size?: ModalSize;
  children: React.ReactNode;
}

export default function Modal(
  { open, onClose, title, closeLabel = "Close", size = "md", children }: ModalProps,
) {
  // ── ÉCHAP FERME, ET LA PAGE DERRIÈRE NE DÉFILE PLUS ─────────────────────
  // Les deux moitiés du même contrat, posées et retirées ensemble.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // La valeur PRÉCÉDENTE est restaurée, pas `""`: un autre composant peut
    // avoir posé le verrou avant nous, et écrire une chaîne vide le lèverait
    // pour lui aussi.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  // `createPortal` vers `body`: à l'intérieur de l'arbre, le premier parent qui
  // crée un contexte d'empilement (une `transform`, un `overflow`) suffirait à
  // enfermer la fenêtre dans la carte qui l'a ouverte.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 p-0 sm:items-center sm:p-6"
      // LE FOND FERME, mais uniquement quand c'est LUI qu'on vise: sans le test
      // de cible, un clic relâché sur le fond après avoir coché un article
      // fermerait la fenêtre en pleine course.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`flex max-h-[90vh] w-full ${SIZE[size]} flex-col overflow-hidden rounded-t-2xl bg-gray-50 shadow-xl outline-none sm:rounded-2xl`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-gray-600 underline underline-offset-2 hover:text-gray-900"
          >
            {closeLabel}
          </button>
        </div>

        {/* LE DÉFILEMENT EST ICI, pas sur la page: une liste de courses ou une
            semaine de préparations ne tient pas dans une fenêtre, et laisser la
            page défiler derrière fait perdre le contenu dès le premier geste. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
