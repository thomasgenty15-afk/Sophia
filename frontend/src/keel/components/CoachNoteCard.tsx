import React from "react";

import {
  COACH_NOTE_MAX_CHARS,
  loadCoachNote,
  saveCoachNote,
} from "../api/coachNote";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { inputClass } from "./ui/Field";

// CE QUE LE COACH A OBSERVÉ SUR CET ÉLÈVE — la seule surface d'ÉCRITURE de
// `/coach/clients/:id`, et la seule chose nominative que le coach produise.
//
// POURQUOI ELLE EXISTE, ET CONTRE QUOI
// ------------------------------------
// `docs/keel/MODEL.md` interdit qu'un coach écrive quoi que ce soit par élève,
// pour une raison de passage à l'échelle qui reste vraie: 200 élèves × une
// note, c'est le produit d'avant. Arbitrage du 2026-08-05: le cas 1:1 assumé
// (un coach, dix élèves qu'il connaît) mérite une porte, à condition qu'elle
// reste OPTIONNELLE au sens fort.
//
// Ce que « optionnelle au sens fort » veut dire À L'ÉCRAN, et qui décide de
// tout le reste de ce fichier:
//   * pas de champ obligatoire, pas d'astérisque, pas de bandeau;
//   * VIDE PAR DÉFAUT ET SANS REPROCHE — la copie de l'état vide dit ce que la
//     note ferait, jamais que le coach devrait l'écrire. Un « ajoute une note »
//     transformerait l'option en corvée par élève, ce qui est exactement ce
//     que le modèle refuse;
//   * vide côté runtime = RIEN dans le prompt (`coach_note.ts`), pas un bloc
//     « le coach n'a rien noté ».
//
// CE QUE LE COACH DOIT SAVOIR AVANT D'ÉCRIRE, ET QUI EST DIT SOUS LE CHAMP
// -----------------------------------------------------------------------
// 1. La note part dans l'export RGPD de l'élève. C'est une donnée personnelle
//    le concernant, écrite par un tiers: son droit d'accès la couvre. Un coach
//    qui l'apprend après coup a été trahi par l'écran, pas par le règlement.
// 2. Elle ne prescrit rien. Les interdits vivent dans la doctrine (avec leur
//    double verrou), les allergies dans leur propre table, et les deux gagnent
//    contre la note quand ils se croisent.
//
// LECTURE ET ÉCRITURE SOUS LE JWT DU COACH. Aucune edge function: la policy
// `student_coach_notes_coach_all` décide, comme partout ailleurs sur cette page.

type Status =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "saving" }
  | { kind: "failed"; message: string };

export default function CoachNoteCard({ studentId }: { studentId: string }) {
  const [status, setStatus] = React.useState<Status>({ kind: "loading" });
  // `saved` est ce que la BASE porte; `draft` est ce que le coach tape. Les
  // garder séparés est ce qui rend « rien à sauvegarder » calculable sans
  // deviner, et évite le bouton actif sur un formulaire intouché.
  const [saved, setSaved] = React.useState<string>("");
  const [draft, setDraft] = React.useState<string>("");
  const [justSaved, setJustSaved] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "loading" });
    (async () => {
      try {
        const note = await loadCoachNote(studentId);
        if (cancelled) return;
        setSaved(note?.note ?? "");
        setDraft(note?.note ?? "");
        setStatus({ kind: "ready" });
      } catch (err) {
        if (cancelled) return;
        // R7 à la frontière: une lecture en échec est DITE. Une zone de saisie
        // vide sur une note qui existe ferait croire au coach qu'elle a été
        // effacée — et l'inviterait à la réécrire par-dessus.
        setStatus({
          kind: "failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const dirty = draft.trim() !== saved.trim();
  const remaining = COACH_NOTE_MAX_CHARS - draft.length;

  async function onSave() {
    setStatus({ kind: "saving" });
    setJustSaved(false);
    try {
      const next = await saveCoachNote(studentId, draft);
      setSaved(next?.note ?? "");
      setDraft(next?.note ?? "");
      setStatus({ kind: "ready" });
      setJustSaved(true);
    } catch (err) {
      setStatus({
        kind: "failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (status.kind === "loading") return null;

  return (
    <Card className="mt-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        What you have noticed about them
      </p>
      <p className="mt-2 text-sm leading-6 text-gray-600">
        Optional. Anything here reaches their plans and their conversations with
        Sophia — the shift work, the bad knee, the week they always skip. Leave
        it empty and nothing changes.
      </p>

      <textarea
        className={`${inputClass} mt-3 min-h-[7rem] resize-y`}
        value={draft}
        maxLength={COACH_NOTE_MAX_CHARS}
        placeholder="Works nights, eats around 3am. Hates cooking on Sundays."
        disabled={status.kind === "saving"}
        onChange={(e) => {
          setDraft(e.target.value);
          setJustSaved(false);
        }}
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p
          className={`text-xs ${remaining < 100 ? "text-amber-700" : "text-gray-500"}`}
        >
          {remaining} characters left
        </p>
        <div className="flex items-center gap-3">
          {justSaved && !dirty ? (
            <span className="text-xs text-gray-500">Saved.</span>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty || status.kind === "saving"}
            onClick={onSave}
          >
            {status.kind === "saving" ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {status.kind === "failed" ? (
        <p className="mt-2 text-xs text-red-700">
          Not saved — {status.message}
        </p>
      ) : null}

      <p className="mt-3 border-t border-gray-100 pt-3 text-xs leading-5 text-gray-500">
        This is a note about a person, so it belongs to them too: it is included
        if they ever request their data. It also does not prescribe — your
        method and their allergies both outrank it wherever they meet.
      </p>
    </Card>
  );
}
