import React from "react";
import { deviationKindLabel, slotLabel } from "../api/labels";
import type { DeviationKind, SlotVocabularyRow } from "../api/types";
import { t } from "../i18n/t";

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

  return (
    <div className="rounded-lg border border-violet-300 bg-violet-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-violet-900">
            {t("deviation.title")}
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-violet-800">
            {t("deviation.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          className="text-xs text-violet-700 underline"
        >
          {t("common.close")}
        </button>
      </div>

      <fieldset className="mt-3">
        <legend className="text-[11px] font-medium uppercase tracking-wide text-violet-700">
          {t("deviation.kind_label")}
        </legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-full border px-3 py-1 text-xs ${
                kind === k
                  ? "border-violet-600 bg-violet-600 text-white"
                  : "border-violet-300 bg-white text-violet-800 hover:bg-violet-100"
              }`}
            >
              {deviationKindLabel(k)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <fieldset>
          <legend className="text-[11px] font-medium uppercase tracking-wide text-violet-700">
            {t("deviation.when_label")}
          </legend>
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => setLocalDate(props.today)}
              className={`rounded-full border px-3 py-1 text-xs ${
                localDate === props.today
                  ? "border-violet-600 bg-violet-600 text-white"
                  : "border-violet-300 bg-white text-violet-800 hover:bg-violet-100"
              }`}
            >
              {t("deviation.when_today")}
            </button>
            <button
              type="button"
              onClick={() => setLocalDate(props.tomorrow)}
              className={`rounded-full border px-3 py-1 text-xs ${
                localDate === props.tomorrow
                  ? "border-violet-600 bg-violet-600 text-white"
                  : "border-violet-300 bg-white text-violet-800 hover:bg-violet-100"
              }`}
            >
              {t("deviation.when_tomorrow")}
            </button>
          </div>
        </fieldset>

        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-violet-700">
            {t("deviation.slot_label")}
          </span>
          <select
            value={slotKey}
            onChange={(e) => setSlotKey(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-violet-300 bg-white px-2 py-1.5 text-sm text-violet-900"
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

      <label className="mt-3 block">
        <span className="text-[11px] font-medium uppercase tracking-wide text-violet-700">
          {t("deviation.note_label")}
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("deviation.note_placeholder")}
          className="mt-1.5 h-16 w-full rounded-lg border border-violet-300 bg-white p-2 text-sm text-violet-900"
        />
      </label>

      {props.error && (
        <p className="mt-2 rounded bg-rose-50 p-2 text-xs text-rose-700">
          {props.error}
        </p>
      )}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={props.submitting}
          onClick={() =>
            props.onSubmit({
              localDate,
              slotKey: slotKey === "" ? null : slotKey,
              kind,
              note: note.trim() === "" ? null : note.trim(),
            })}
          className="rounded-lg bg-violet-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-40"
        >
          {props.submitting ? t("deviation.submitting") : t("deviation.submit")}
        </button>
      </div>
    </div>
  );
}

export default DeviationDialog;
