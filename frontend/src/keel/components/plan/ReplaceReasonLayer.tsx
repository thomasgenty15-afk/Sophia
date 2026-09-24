import React from "react";

import {
  DRAFT_NOTE_MAX_CHARS,
  hasNote,
  noteLength,
  noteOverflows,
} from "../../api/planDraft";
import { t } from "../../i18n/t";
import { Button } from "../ui/Button";
import { inputClass } from "../ui/Field";
import ModalLayerFrame from "../ui/ModalLayer";

// ⟳ 2026-09-24 — « POURQUOI REMPLACER CE PLAT ? », LA COUCHE DE L'APERÇU.
//
// Demandé: « une pop-up qui demande pourquoi il faut remplacer, et ensuite
// valider — on ne peut pas remplacer si on n'a rien écrit, c'est contraignant
// mais c'est hyper important pour s'améliorer ». Le bouton « Valider » ne
// s'allume donc qu'avec du texte, et rien d'autre ne barre un plat.
//
// ⛔ CE COMPOSANT N'ÉCRIT RIEN ET N'APPELLE PERSONNE. « Valider » barre le plat
// dans l'aperçu (état du dialogue); la raison ne part au serveur qu'au clic sur
// « Ajuster le plan ». Annuler ne laisse aucune trace.
//
// ⚠️ LE COMPTEUR COMPTE, IL NE REFUSE PAS SEUL — même règle que la note: pas de
// `maxLength`, qui couperait la phrase en silence; au-delà du plafond le
// bouton s'éteint et le compteur passe au rouge.

export interface ReplaceReasonLayerProps {
  /** Le titre du plat, tel que la carte l'affiche. */
  dishTitle: string;
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ReplaceReasonLayer(props: ReplaceReasonLayerProps) {
  const fieldId = React.useId();
  const overflows = noteOverflows(props.value);
  const ready = hasNote(props.value) && !overflows;
  return (
    <ModalLayerFrame
      title={t("plan.draft.replace_title")}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={props.onCancel}>
            {t("plan.draft.replace_cancel")}
          </Button>
          <Button variant="primary" disabled={!ready} onClick={props.onConfirm}>
            {t("plan.draft.replace_confirm")}
          </Button>
        </div>
      }
    >
      {/* LE PLAT, CITÉ — on écrit sur quelque chose qu'on voit. */}
      <p className="break-words text-sm font-medium text-ink">{props.dishTitle}</p>
      <label htmlFor={fieldId} className="mt-4 block text-sm text-ink">
        {t("plan.draft.replace_label")}
      </label>
      <textarea
        id={fieldId}
        // Le focus va à la couche à son ouverture (`Modal`); le champ le prend
        // ici, puisque c'est la seule chose à faire dans cette couche.
        autoFocus
        className={`${inputClass} mt-1 min-h-24`}
        rows={3}
        value={props.value}
        placeholder={t("plan.draft.replace_placeholder")}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <p className={`mt-1 text-label ${overflows ? "text-red-700" : "text-ink-soft"}`}>
        {overflows
          ? t("plan.draft.note_too_long")
          : t("plan.draft.chars_left", { count: DRAFT_NOTE_MAX_CHARS - noteLength(props.value) })}
      </p>
    </ModalLayerFrame>
  );
}
