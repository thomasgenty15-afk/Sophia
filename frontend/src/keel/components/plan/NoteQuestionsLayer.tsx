import React from "react";

import type { NoteQuestion } from "../../api/planDraft";
import { t } from "../../i18n/t";
import { Button } from "../ui/Button";
import ModalLayerFrame from "../ui/ModalLayer";

// ⟳ 2026-09-24 — LES QUESTIONS DE PRÉCISION, EN COUCHE (les deux canaux:
// la note d'« Ajuster le plan » et les raisons de « Remplacer »).
//
// Demandé: « dans une pop-up, au premier temps de chargement, avec des
// questions — trois au plus, en donnant des options à cocher ». Elles vivaient
// sous le plan, une à la fois, un bouton par personne: on les cherchait en
// bas d'une semaine de plats.
//
// ⛔ CE COMPOSANT N'ÉCRIT RIEN. Il rend un choix par question — une personne,
// ou `null` (« Personne de la liste », ou rien coché) — et c'est le dialogue
// qui envoie chaque réponse par la branche `answer` de `keel-read-note-v1`.
// Une question sans réponse n'écrit rien: le serveur ne devine jamais.
//
// ⚠️ PAS DE SORTIE PAR ÉCHAP ICI (le dialogue ne passe pas `onLayerDismiss`):
// la phrase a déjà été lue et rangée, et « Continuer » sans rien cocher est la
// sortie honnête — elle dit « personne », et la suite part quand même.

export interface NoteQuestionsLayerProps {
  /** Déjà plafonnées par l'appelant (`NOTE_QUESTIONS_MAX`). */
  questions: ReadonlyArray<NoteQuestion>;
  busy: boolean;
  /** Un choix par question, dans l'ordre: un `memberId`, ou `null`. */
  onContinue: (choices: ReadonlyArray<string | null>) => void;
}

export default function NoteQuestionsLayer(props: NoteQuestionsLayerProps) {
  const groupId = React.useId();
  const [choices, setChoices] = React.useState<ReadonlyArray<string | null>>(
    () => props.questions.map(() => null),
  );
  const choose = (index: number, memberId: string | null) =>
    setChoices((prev) => prev.map((c, i) => (i === index ? memberId : c)));

  return (
    <ModalLayerFrame
      title={t("plan.draft.questions_title")}
      footer={
        <div className="flex justify-end">
          <Button
            variant="primary"
            disabled={props.busy}
            onClick={() => props.onContinue(choices)}
          >
            {t("plan.draft.questions_continue")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {props.questions.map((question, index) => {
          const name = `${groupId}-${index}`;
          return (
            <fieldset key={name} className="min-w-0">
              {/* On cite le MORCEAU sur lequel le serveur a buté, jamais la
                  note entière. `break-words`: c'est une phrase libre. */}
              <legend className="break-words text-sm text-ink">
                {t("plan.draft.question_who", { text: question.text })}
              </legend>
              <div className="mt-2 flex flex-col gap-1">
                {question.options.map((option) => (
                  <label key={option.memberId} className="flex min-h-6 items-center gap-2 text-sm text-ink">
                    <input
                      type="radio"
                      name={name}
                      value={option.memberId}
                      checked={choices[index] === option.memberId}
                      onChange={() => choose(index, option.memberId)}
                      className="h-4 w-4 border-line-strong text-ink focus:ring-fig-600"
                    />
                    <span className="break-words">{option.label}</span>
                  </label>
                ))}
                <label className="flex min-h-6 items-center gap-2 text-sm text-ink-soft">
                  <input
                    type="radio"
                    name={name}
                    value=""
                    checked={choices[index] === null}
                    onChange={() => choose(index, null)}
                    className="h-4 w-4 border-line-strong text-ink focus:ring-fig-600"
                  />
                  <span>{t("plan.draft.question_none")}</span>
                </label>
              </div>
            </fieldset>
          );
        })}
      </div>
    </ModalLayerFrame>
  );
}
