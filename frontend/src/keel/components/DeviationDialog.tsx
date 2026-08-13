import React from "react";
import { deviationKindLabel, slotLabel } from "../api/labels";
import type { DeviationKind, SlotVocabularyRow } from "../api/types";
import { t } from "../i18n/t";
import { Button, type ButtonVariant } from "./ui/Button";
import { inputClass } from "./ui/Field";

// KEEL — "Declare a deviation", the first-class action of the student app.
//
// PRODUCT DOCTRINE, not decoration: in nutrition the off-plan meal is the
// NOMINAL case, not an admission of failure. A deviation declared in advance
// makes the evaluator emit `not_applicable` and removes the slot from the
// denominator; the same meal not declared scores zero. So the affordance is a
// button on the page, at the top, in the same weight as the plan itself —
// never a link buried in an overflow menu where only a guilty user would dig
// for it.
//
// The form declares FORWARD ONLY (today or tomorrow). A retroactive "deviation"
// would be the student grading their own paper after the fact, which the
// contract refuses.
//
// ── CE PANNEAU ÉTAIT ENTIÈREMENT VIOLET, ET IL FAUT LIRE POURQUOI ÇA COMPTE ──
// 32 classes saturées, toutes `violet-*`, zéro autre couleur: le fond, la
// bordure, les quatre libellés, les deux bordures de champ et les huit boutons.
// Le violet est la marque du produit GRAND PUBLIC SUPPRIMÉ (`--color-primary:
// #7c3aed`, mort depuis) — donc la teinte la plus voyante de `/app/today` ne
// disait RIEN: ni un état (déclarer n'est ni ok, ni attention, ni échec, ni
// info), ni la marque actuelle.
//
// ⚠️ CE QUI PORTE LA FRONTIÈRE MAINTENANT EST UNE FORME, PAS UNE TEINTE. Le
// panneau est une FICHE: un fronton `paper-2` fermé par un trait `line`, et
// l'équerre `.eq` collée à son titre — l'idiome de `ui/Modal.tsx` et de
// `ui/SetupSection.tsx`, c'est-à-dire la réponse que la charte réserve
// justement à « séparer une section de la page » (charte §4, §5).
// Il est rendu EN LIGNE dans la page et pas dans une fenêtre: c'est une section
// de `/app/today`, donc l'équerre y est légitime (elle ne redoublerait un titre
// de dialogue que dans un `Modal`, qui la refuse pour cette raison).
//
// LA SEULE COULEUR QUI RESTE EST UN FAIT: `red-50/red-700` sur l'erreur de
// soumission. Elle était en `rose-*`, une SECONDE famille saturée pour le même
// sens — le produit dit l'échec en `red` (`ui/Badge.tsx`, `ui/Field.tsx`,
// `ui/Button.tsx`), et deux rouges pour un rouge, c'est un vocabulaire de moins.
//
// Autorité: `docs/keel/CHARTE-VITRINE.md` §2 et §4.

const KINDS: readonly DeviationKind[] = [
  "restaurant",
  "social",
  "travel",
  "family",
  "work",
  "other",
];

export interface DeviationDialogProps {
  slotVocabulary: readonly SlotVocabularyRow[];
  today: string;
  tomorrow: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (args: {
    localDate: string;
    slotKey: string | null;
    kind: DeviationKind;
    note: string | null;
  }) => void;
  onClose: () => void;
}

export function DeviationDialog(props: DeviationDialogProps) {
  const [kind, setKind] = React.useState<DeviationKind>("restaurant");
  const [localDate, setLocalDate] = React.useState(props.today);
  const [slotKey, setSlotKey] = React.useState<string>("");
  const [note, setNote] = React.useState("");

  // LE CHOIX SÉLECTIONNÉ EST UN GESTE, DONC IL PORTE LA MARQUE — et il la porte
  // par le bouton du kit, pas par une classe recopiée. `primary` = `fig-700` /
  // `paper` (9,98:1), `secondary` = contour `line-strong` sur `paper` (3,84:1,
  // le seuil des composants d'interface). `aria-pressed` double la couleur par
  // un ÉTAT ANNONÇABLE: sans lui, un lecteur d'écran n'entendait rien du choix
  // en cours, et c'est la couleur seule qui le portait.
  const chip = (selected: boolean): ButtonVariant =>
    selected ? "primary" : "secondary";

  return (
    <section className="overflow-hidden rounded-card border border-line-strong bg-paper">
      {/* LE FRONTON — c'est lui qui remplace le fond violet. `paper-2` sur
          `paper` (1,08:1) plus le trait `line`: le panneau s'ouvre sans emprunter
          une teinte. L'équerre marque l'origine de ce qui est spécifié, et elle a
          un mot à sa droite.
          ⚠️ PAS de `px-*` sur le nœud qui porte `.eq`: la classe pose
          `padding-left: 1.125rem` hors de toute couche CSS et bat un utilitaire
          de même spécificité. Le `px-4` est donc sur le fronton. */}
      <div className="flex items-start justify-between gap-3 border-b border-line bg-paper-2 px-4 py-3">
        <h2 className="eq text-base font-semibold text-ink">
          {t("deviation.title")}
        </h2>
        <button
          type="button"
          onClick={props.onClose}
          className="shrink-0 rounded-part px-2 py-1 text-sm text-ink-soft underline underline-offset-2 hover:text-ink"
        >
          {t("common.close")}
        </button>
      </div>

      <div className="p-4">
        <p className="max-w-[62ch] text-sm leading-6 text-ink-soft">
          {t("deviation.subtitle")}
        </p>

        <fieldset className="mt-4">
          <legend className="text-label font-semibold uppercase text-ink-soft">
            {t("deviation.kind_label")}
          </legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <Button
                key={k}
                size="sm"
                variant={chip(kind === k)}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {deviationKindLabel(k)}
              </Button>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <fieldset className="min-w-0">
            <legend className="text-label font-semibold uppercase text-ink-soft">
              {t("deviation.when_label")}
            </legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant={chip(localDate === props.today)}
                aria-pressed={localDate === props.today}
                onClick={() => setLocalDate(props.today)}
              >
                {t("deviation.when_today")}
              </Button>
              <Button
                size="sm"
                variant={chip(localDate === props.tomorrow)}
                aria-pressed={localDate === props.tomorrow}
                onClick={() => setLocalDate(props.tomorrow)}
              >
                {t("deviation.when_tomorrow")}
              </Button>
            </div>
          </fieldset>

          {/* LES DEUX CHAMPS PASSENT PAR `inputClass`, ET CE N'EST PAS COSMÉTIQUE.
              Ils portaient `text-sm` — 14 px — donc Safari iOS ZOOMAIT au focus
              et ne dézoomait pas en sortant. `inputClass` est `text-base` sous
              `lg` et `lg:text-sm` au-dessus; il apporte aussi l'anneau de focus
              `fig-600` (7,36:1) que ces deux champs n'avaient pas du tout. */}
          <label className="block min-w-0">
            <span className="mb-2 block text-label font-semibold uppercase text-ink-soft">
              {t("deviation.slot_label")}
            </span>
            <select
              value={slotKey}
              onChange={(e) => setSlotKey(e.target.value)}
              className={inputClass}
            >
              <option value="">{t("deviation.slot_all_day")}</option>
              {props.slotVocabulary.map((s) => (
                <option key={s.key} value={s.key}>
                  {slotLabel(s.key)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-2 block text-label font-semibold uppercase text-ink-soft">
            {t("deviation.note_label")}
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("deviation.note_placeholder")}
            className={`${inputClass} h-20`}
          />
        </label>

        {/* ⛔ UN FAIT, ET IL RESTE. Rouge = échec dans tout le produit; le
            bandeau porte le refus du serveur. Seule la FAMILLE a changé —
            `rose-*` était un second rouge pour le même sens. */}
        {props.error && (
          <p className="mt-3 rounded-card bg-red-50 p-2 text-xs leading-5 text-red-700">
            {props.error}
          </p>
        )}

        {/* L'ACTION FIGUE DE CET ÉCRAN, et la seule. `/app/today` en rendait zéro
            dans cet état: le budget d'une action de marque par vue est donc tenu,
            et il est dépensé sur le geste que la doctrine du produit appelle
            « first class ». */}
        <div className="mt-4 flex justify-end">
          <Button
            variant="primary"
            disabled={props.submitting}
            onClick={() =>
              props.onSubmit({
                localDate,
                slotKey: slotKey === "" ? null : slotKey,
                kind,
                note: note.trim() === "" ? null : note.trim(),
              })}
          >
            {props.submitting ? t("deviation.submitting") : t("deviation.submit")}
          </Button>
        </div>
      </div>
    </section>
  );
}

export default DeviationDialog;
