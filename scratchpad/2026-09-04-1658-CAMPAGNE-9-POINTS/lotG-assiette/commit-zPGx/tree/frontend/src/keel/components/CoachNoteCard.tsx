import { t } from "../i18n/t";
import React from "react";

import {
  COACH_NOTE_MAX_CHARS,
  loadCoachNote,
  saveCoachNote,
} from "../api/coachNote";
import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";
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
      {/* ⚠️ L'ÉTIQUETTE MAISON EST DEVENUE `SectionLabel`: c'était le composant
          du kit recopié à la main, en `gray-400` (2,84:1 sur blanc, sous le seuil
          4,5 du texte). Le kit rend `text-label` + `ink-soft` = 6,11:1, en `h2`,
          avec l'équerre.
          ⚠️ NE POSE PAS DE `px-*` sur ce nœud: `.eq` écrit son `padding-left`
          hors de toute couche CSS et battrait un utilitaire de même
          spécificité. */}
      <SectionLabel>{t("coach.note.section")}</SectionLabel>
      <p className="max-w-[62ch] text-sm leading-6 text-ink-soft">
        {t("coach.note.lead")}
      </p>

      <textarea
        className={`${inputClass} mt-3 min-h-[7rem] resize-y`}
        value={draft}
        maxLength={COACH_NOTE_MAX_CHARS}
        placeholder={t("coach.note.placeholder")}
        disabled={status.kind === "saving"}
        onChange={(e) => {
          setDraft(e.target.value);
          setJustSaved(false);
        }}
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p
          // ⛔ L'AMBRE RESTE, ET ELLE PORTE UN FAIT: « il te reste moins de cent
          // caractères » est un avertissement, pas une décoration. C'est
          // exactement le rôle d'`attention` dans le vocabulaire du produit.
          className={`text-xs ${remaining < 100 ? "text-amber-700" : "text-ink-soft"}`}
        >
          {t("coach.note.remaining", { count: remaining })}
        </p>
        <div className="flex items-center gap-3">
          {justSaved && !dirty ? (
            <span className="text-xs text-ink-soft">{t("coach.note.saved")}</span>
          ) : null}
          {/* ⛔ LE SEUL `variant="primary"` DE `/coach/clients/:id`, ET C'EST
              DÉLIBÉRÉ. La page est une LECTURE (son en-tête dit « READ-ONLY, and
              structurally so »); cette note est sa seule écriture routinière,
              donc c'est elle qui porte l'unique aplat de marque de l'écran.
              `CoachSeatCard`, montée juste en dessous, a été démotée en
              `secondary`/`danger` pour cette raison — deux boutons figue côte à
              côte, c'est zéro hiérarchie. */}
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

      {/* `border-line` (1,30:1): une règle horizontale À L'INTÉRIEUR d'une carte
          est le seul emploi légitime du séparateur décoratif. */}
      <p className="mt-3 max-w-[62ch] border-t border-line pt-3 text-xs leading-5 text-ink-soft">
        This is a note about a person, so it belongs to them too: it is included
        if they ever request their data. It also does not prescribe — your
        method and their allergies both outrank it wherever they meet.
      </p>
    </Card>
  );
}
