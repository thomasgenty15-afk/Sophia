import React from "react";

import { Button } from "./ui/Button";
import { Kicker } from "./ui/Marketing";

// KEEL — L'ENCADRÉ DE RÉPONSE, AU-DESSUS DU CHAMP DE SAISIE.
//
// ⟳ 2026-09-25 — décision du propriétaire: les réponses d'une question de
// Sophia étaient des boutons `sm` (24 px) posés sous la bulle, dans le fil qui
// défile. Ils se perdaient dès que le fil remontait, et se ratent au pouce.
//
// ── CE QUI A ÉTÉ CHOISI ───────────────────────────────────────────────────
// · L'EMPLACEMENT: juste au-dessus du champ, qui ne quitte jamais l'écran. La
//   question en cours se répond là où l'on écrit.
// · LA SIGNATURE: l'équerre (`Kicker`), qui dans la charte marque « ce qui est
//   à remplir ». Elle ouvre l'encadré, elle ne l'encadre pas.
// · PAS DE RAPPEL DE LA QUESTION: elle est la dernière bulle du fil, juste
//   au-dessus, et la répéter se lisait comme un doublon (vu à l'écran).
// · DES CIBLES DE 44 PX, qui se partagent la largeur.
//
// ⛔ AUCUN BOUTON FIGUE ICI. La charte n'admet qu'une action principale par
// écran, et c'est « Envoyer », juste en dessous. Les réponses sont des gestes
// de même rang: contour de CONTRÔLE (`line-strong`, 3,84:1) sur `paper`.
//
// L'encadré n'existe que tant que la question attend (`openQuestionId`):
// répondre le fait disparaître.

export interface ChatAnswerTrayProps {
  buttons: ReadonlyArray<{ payload: string; label: string }>;
  kicker: string;
  disabled: boolean;
  onAnswer: (payload: string, label: string) => void;
}

export function ChatAnswerTray(props: ChatAnswerTrayProps) {
  const kickerId = React.useId();
  return (
    <div
      role="group"
      aria-labelledby={kickerId}
      data-testid="chat-answer-tray"
      className="rounded-card border border-line-strong bg-paper-2 px-3 pb-3 pt-2.5"
    >
      <div id={kickerId}>
        <Kicker>{props.kicker}</Kicker>
      </div>
      {/* `auto-fit` + `minmax`: deux ou trois réponses se partagent la ligne à
          375 px; une quatrième passe dessous au lieu d'écraser les libellés.
          ⚠️ LE PLAFOND EST SUR LA RANGÉE (`max-w-md`), PAS DANS `minmax`: un
          maximum défini y fait compter les colonnes sur cette largeur, et à
          375 px les trois réponses passaient chacune sur sa ligne (mesuré). */}
      <div className="mt-2 grid max-w-md grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2">
        {props.buttons.map((button) => (
          <Button
            key={button.payload}
            variant="secondary"
            className="min-h-11 w-full"
            disabled={props.disabled}
            data-testid="chat-answer"
            onClick={() => props.onAnswer(button.payload, button.label)}
          >
            {button.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export default ChatAnswerTray;
