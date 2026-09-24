import React from "react";

// LE CADRE D'UNE COUCHE (`Modal` → `layer`) — 2026-09-24.
//
// Une couche recouvre la fenêtre entière; elle porte donc les mêmes trois
// bandes qu'elle: un fronton qui nomme ce qu'on fait, un corps qui défile, un
// pied qui ne bouge pas. Mêmes classes que `Modal`, pour qu'une couche se lise
// comme la suite de la fenêtre et pas comme un second écran.
//
// ⛔ AUCUNE SORTIE ICI. Ce que « annuler » veut dire dépend de la couche (garder
// le plat, ne rien répondre): c'est l'appelant qui la met dans `footer`.

export interface ModalLayerFrameProps {
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}

export default function ModalLayerFrame(props: ModalLayerFrameProps) {
  const titleId = React.useId();
  return (
    <div role="group" aria-labelledby={titleId} className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line bg-paper-2 px-4 py-3">
        {/* `break-words`: le titre cite souvent un plat, et un titre de plat
            n'a aucune longueur garantie — la contrainte est 320 px. */}
        <h3 id={titleId} className="break-words text-base font-semibold text-ink">
          {props.title}
        </h3>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{props.children}</div>
      <div className="shrink-0 border-t border-line bg-paper-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {props.footer}
      </div>
    </div>
  );
}
