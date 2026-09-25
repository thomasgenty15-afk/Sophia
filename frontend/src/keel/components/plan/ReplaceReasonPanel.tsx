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
import AnchoredPanel from "../ui/AnchoredPanel";

// ⟳ 2026-09-24 — « POURQUOI CHANGER CE PLAT ? », LA BULLE DU BOUTON.
//
// Demandé: « une pop-up qui demande pourquoi il faut remplacer, et ensuite
// valider — on ne peut pas remplacer si on n'a rien écrit ». Le bouton
// « Valider » ne s'allume donc qu'avec du texte, et rien d'autre ne barre un
// plat.
//
// ⟳ même jour — UNE BULLE, PLUS UNE COUCHE PLEIN CADRE (retour du
// propriétaire: « la fenêtre fait assez vide »). Elle sort du bouton
// « Changer » de la carte (`AnchoredPanel`); le plat est juste au-dessus, il
// n'est plus recité.
//
// ⛔ CE COMPOSANT N'ÉCRIT RIEN ET N'APPELLE PERSONNE. « Valider » barre le plat
// dans l'aperçu (état du dialogue); la raison ne part au serveur qu'au clic sur
// « Ajuster le plan ». Annuler, Échap ou un clic ailleurs ne laissent aucune
// trace.
//
// ⚠️ LE COMPTEUR COMPTE, IL NE REFUSE PAS SEUL — même règle que la note: pas de
// `maxLength`, qui couperait la phrase en silence; au-delà du plafond le
// bouton s'éteint et le compteur passe au rouge.

export interface ReplaceReasonPanelProps {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ReplaceReasonPanel(props: ReplaceReasonPanelProps) {
  const fieldId = React.useId();
  const overflows = noteOverflows(props.value);
  const ready = hasNote(props.value) && !overflows;
  return (
    <AnchoredPanel
      title={<label htmlFor={fieldId}>{t("plan.draft.replace_title")}</label>}
      onDismiss={props.onCancel}
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
      <textarea
        id={fieldId}
        // La bulle s'ouvre pour ce champ: il prend le focus lui-même.
        autoFocus
        className={`${inputClass} min-h-20`}
        rows={3}
        value={props.value}
        placeholder={t("plan.draft.replace_placeholder")}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => {
          // Entrée valide (Maj+Entrée pour une nouvelle ligne): la bulle est
          // un geste court, pas un formulaire.
          if (e.key === "Enter" && !e.shiftKey && ready) {
            e.preventDefault();
            props.onConfirm();
          }
        }}
      />
      <p className={`mt-1 text-label ${overflows ? "text-red-700" : "text-ink-soft"}`}>
        {overflows
          ? t("plan.draft.note_too_long")
          : t("plan.draft.chars_left", { count: DRAFT_NOTE_MAX_CHARS - noteLength(props.value) })}
      </p>
    </AnchoredPanel>
  );
}
