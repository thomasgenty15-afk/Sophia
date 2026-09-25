import React from "react";

// ⟳ 2026-09-24 — LA BULLE RATTACHÉE À UN BOUTON (retour du propriétaire).
//
// « Changer » ouvrait une couche plein cadre par-dessus l'aperçu: une grande
// surface vide pour un champ de trois lignes, et, pendant la recherche des
// autres plats, rien ne disait ce qui se passait. La bulle sort DU bouton,
// une pointe la relie à lui, et elle ne couvre que ce qu'il faut.
//
// ── COMMENT ELLE SE PLACE ────────────────────────────────────────────────
// L'appelant la rend DANS un conteneur `relative` qui porte aussi le bouton:
// elle s'ouvre dessous, alignée à droite, et le conteneur est la frontière du
// « clic ailleurs ». Sa largeur tient à 320 px (`100vw - 4rem`).
//
// ── COMMENT ELLE SE FERME ────────────────────────────────────────────────
// Échap, ou un appui hors du conteneur (le bouton compris dans le conteneur:
// son propre clic décide, pas le « clic ailleurs »). `onDismiss` dit à
// l'appelant ce que « fermer » veut dire à ce moment-là.

export interface AnchoredPanelProps {
  title: React.ReactNode;
  children?: React.ReactNode;
  footer: React.ReactNode;
  onDismiss: () => void;
}

export default function AnchoredPanel(props: AnchoredPanelProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const titleId = React.useId();
  const [shown, setShown] = React.useState(false);
  const dismiss = React.useRef(props.onDismiss);
  React.useEffect(() => {
    dismiss.current = props.onDismiss;
  });

  // L'APPARITION: un fondu court qui part du coin du bouton.
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  React.useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const boundary = ref.current?.parentElement ?? null;
      if (boundary && e.target instanceof Node && !boundary.contains(e.target)) dismiss.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss.current();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={titleId}
      className={`absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-4rem))] origin-top-right rounded-card border border-line-strong bg-paper text-left shadow-lg transition duration-150 ease-out motion-reduce:transition-none ${
        shown ? "scale-100 opacity-100" : "scale-95 opacity-0"
      }`}
    >
      {/* LA POINTE, sous le bouton: c'est elle qui dit « d'où je sors ». */}
      <span
        aria-hidden="true"
        className="absolute -top-1.5 right-5 h-3 w-3 rotate-45 border-l border-t border-line-strong bg-paper"
      />
      <div className="relative p-3">
        <div id={titleId} className="text-sm font-semibold text-ink">{props.title}</div>
        {props.children !== undefined && <div className="mt-2">{props.children}</div>}
        <div className="mt-3">{props.footer}</div>
      </div>
    </div>
  );
}
