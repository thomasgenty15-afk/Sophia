import React from "react";

import { mealCopy } from "../../api/mealLabels";
import { t } from "../../i18n/t";
import { Button } from "../ui/Button";
import AnchoredPanel from "../ui/AnchoredPanel";

// ⟳ 2026-09-24 — « ÇA VAUT AUSSI POUR… », LA BULLE QUI SUIT « VALIDER ».
//
// Demandé par le propriétaire le jour même de « Changer »: trois matins aux
// œufs, et la même raison tapée trois fois. Après la raison d'un plat, un
// appel rapide lit les AUTRES plats du brouillon (`keel-read-note-v1`, mode
// `match`); ceux à qui la raison s'applique sont PROPOSÉS ici, cochés.
//
// ⟳ même jour — DANS LA BULLE DU BOUTON, PLUS EN COUCHE PLEIN CADRE: « on ne
// sait pas ce qui se passe pendant la recherche, et la fenêtre fait vide ».
// Pendant l'appel, la bulle le dit (indicateur qui tourne, lu par les lecteurs
// d'écran) et garde la place des plats à venir.
//
// ⛔ RIEN N'EST BARRÉ SANS LA PERSONNE. « Barrer aussi » barre ce qui est
// coché, avec la même raison; « Non merci », Échap ou un clic ailleurs ne
// barrent rien de plus. Le plat d'origine, lui, est déjà barré.
//
// ⚠️ LE PLAFOND D'UN REMPLACEMENT VAUT ICI AUSSI: une case qui ferait passer
// le total au-delà est grisée, et la phrase du plafond le dit.

export interface SameReasonSuggestion {
  /** La clé du titre (`dishTitleKey`) — la même que celle des plats barrés. */
  key: string;
  title: string;
  /** Où il revient: « sam., dim. · Petit-déjeuner ». */
  where: string;
  /** Faux si le cocher ferait dépasser le plafond (et qu'il n'est pas coché). */
  fits: boolean;
}

export interface SameReasonPanelProps {
  reason: string;
  status: "looking" | "ready";
  suggestions: ReadonlyArray<SameReasonSuggestion>;
  checked: ReadonlySet<string>;
  /** Vrai quand au moins une case est grisée par le plafond. */
  capped: boolean;
  capText: string;
  onToggle: (key: string) => void;
  onConfirm: () => void;
  onSkip: () => void;
}

export default function SameReasonPanel(props: SameReasonPanelProps) {
  const groupId = React.useId();
  const count = props.checked.size;
  const looking = props.status === "looking";
  return (
    <AnchoredPanel
      title={looking
        ? (
          <span role="status" aria-live="polite" className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-fig-700 motion-reduce:animate-none"
            />
            {t("plan.draft.same_reason_looking")}
          </span>
        )
        : t("plan.draft.same_reason_title")}
      onDismiss={props.onSkip}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={props.onSkip}>
            {t("plan.draft.same_reason_skip")}
          </Button>
          {!looking && (
            <Button variant="primary" disabled={count === 0} onClick={props.onConfirm}>
              {count === 1
                ? t("plan.draft.same_reason_confirm_one")
                : t("plan.draft.same_reason_confirm_many", { count })}
            </Button>
          )}
        </div>
      }
    >
      {/* LA RAISON, CITÉE — c'est elle qui partira avec chaque plat coché. */}
      <p id={groupId} className="break-words text-sm text-ink-soft">
        {mealCopy("meals.dish.replace_reason", { reason: props.reason })}
      </p>
      {looking
        ? (
          // LA PLACE DES PLATS À VENIR — la bulle ne se rétracte pas à l'arrivée.
          <div aria-hidden="true" className="mt-3 space-y-2">
            <div className="h-9 animate-pulse rounded-part bg-paper-2 motion-reduce:animate-none" />
            <div className="h-9 w-4/5 animate-pulse rounded-part bg-paper-2 motion-reduce:animate-none" />
          </div>
        )
        : (
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto" aria-labelledby={groupId}>
            {props.suggestions.map((s, index) => {
              const on = props.checked.has(s.key);
              // Un titre porte espaces et virgules: l'identifiant vient du rang.
              const id = `${groupId}-${index}`;
              return (
                <li key={s.key}>
                  <label
                    htmlFor={id}
                    className={`flex items-start gap-3 rounded-part border border-line px-3 py-2 ${
                      !on && !s.fits ? "opacity-50" : "hover:bg-fig-50"
                    }`}
                  >
                    <input
                      id={id}
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded-part border-line-strong text-ink focus:ring-fig-600"
                      checked={on}
                      disabled={!on && !s.fits}
                      onChange={() => props.onToggle(s.key)}
                    />
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-medium text-ink">{s.title}</span>
                      <span className="block text-xs text-ink-soft">{s.where}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      {!looking && props.capped && (
        <p className="mt-3 text-label text-ink-soft">{props.capText}</p>
      )}
    </AnchoredPanel>
  );
}
