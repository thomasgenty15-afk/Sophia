import React from "react";
import { Link } from "react-router-dom";

import {
  correctJournalMeal,
  describeJournalMeal,
  type JournalDay,
  type JournalMeal,
  type JournalReport,
  type JournalTargetBreakdown,
  loadJournalTracking,
  retryJournalMeal,
  skipJournalMeal,
} from "../api/tracking";
import { signMealPhotoUrls, uploadMealPhoto } from "../api/mealPhoto";
import { slotLabel } from "../api/labels";
import { KeelAppShell } from "../components/KeelAppShell";
import { WeightCurveCard } from "../components/WeightCurveCard";
import { Button } from "../components/ui/Button";
import { Card, SectionLabel } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";
import Modal from "../components/ui/Modal";
import { formatDate, formatWeekday } from "../i18n/format";
import { type MessageKey, t } from "../i18n/t";

type Relation = "planned" | "replacement" | "outside" | "extra";
type Editor =
  | { kind: "describe"; day: JournalDay; meal: JournalMeal }
  | { kind: "add"; day: JournalDay }
  | { kind: "correct"; day: JournalDay; meal: JournalMeal }
  | null;

const SLOTS = ["breakfast", "snack_am", "lunch", "snack_pm", "dinner", "before_bed"];

function readableError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const token = raw.match(/journal_[a-z_]+/)?.[0];
  if (!token) return t("student_progress.journal.error_unknown");
  const key = `student_progress.journal.error_${token.slice("journal_".length)}`;
  try {
    return t(key as MessageKey);
  } catch {
    return t("student_progress.journal.error_unknown");
  }
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function browserToday(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mondayOf(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  const weekday = date.getUTCDay();
  return shiftDate(value, -(weekday === 0 ? 6 : weekday - 1));
}

function dayStateKey(day: JournalDay): MessageKey {
  if (day.meals.length === 0 && day.state !== "future") {
    return "student_progress.journal.day_free";
  }
  return `student_progress.journal.day_${day.state === "in_progress" ? "progress" : day.state}` as MessageKey;
}

function mealStateKey(state: JournalMeal["state"]): MessageKey {
  const suffix = state === "reported"
    ? "confirmed"
    : state === "unattached"
    ? "missing"
    : state;
  return `student_progress.journal.state_${suffix}` as MessageKey;
}

function originKey(origin: JournalMeal["origin"]): MessageKey {
  return `student_progress.journal.${origin}` as MessageKey;
}

function relationFor(meal: JournalMeal): Relation {
  if (meal.origin === "planned") return "planned";
  if (meal.planRefs.length > 0) return "replacement";
  if (meal.origin === "extra") return "extra";
  return "outside";
}

function safeSlotLabel(slot: string | null): string {
  if (!slot) return "";
  try {
    return slotLabel(slot);
  } catch {
    return slot;
  }
}

function ErrorLine({ message }: { message: string | null }) {
  return message
    ? (
      <p role="alert" className="mt-3 text-sm text-red-700">
        {t("student_progress.journal.error", { message })}
      </p>
    )
    : null;
}

function MealEditor({
  editor,
  today,
  busy,
  error,
  onClose,
  onDescribe,
  onCorrect,
  onPhoto,
}: {
  editor: Editor;
  today: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onDescribe: (args: {
    date: string;
    slot: string;
    mealId: string;
    relation: Relation;
    text: string;
  }) => Promise<void>;
  onCorrect: (args: {
    sourceDate: string;
    sourceMealId: string;
    date: string;
    slot: string;
    mealId: string;
    relation: Relation;
  }) => Promise<void>;
  onPhoto: (args: {
    file: File;
    date: string;
    slot: string;
    mealId: string;
    relation: Relation;
  }) => Promise<void>;
}) {
  const defaultSlot = editor?.kind === "add" ? "lunch" : editor?.meal.slot ?? "lunch";
  const defaultRelation = !editor || editor.kind === "add" ? "extra" : relationFor(editor.meal);
  const defaultDate = editor?.day.date ?? today;
  const [text, setText] = React.useState("");
  const [slot, setSlot] = React.useState(defaultSlot);
  const [relation, setRelation] = React.useState<Relation>(defaultRelation);
  const [date, setDate] = React.useState(defaultDate);
  const [file, setFile] = React.useState<File | null>(null);

  React.useEffect(() => {
    setText("");
    setSlot(defaultSlot);
    setRelation(defaultRelation);
    setDate(defaultDate);
    setFile(null);
  }, [defaultDate, defaultRelation, defaultSlot, editor]);

  if (!editor) return null;
  const editingExisting = editor.kind !== "add";
  const sourceMeal = editingExisting ? editor.meal : null;
  const planRelated = sourceMeal?.origin === "planned" || Boolean(sourceMeal?.planRefs.length);
  const generatedMealId = (targetRelation: Relation) =>
    `${targetRelation === "extra" ? "extra" : "outside"}:${date}:${slot}:${crypto.randomUUID()}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (editor?.kind === "correct" && sourceMeal) {
      const moved = date !== editor.day.date || slot !== sourceMeal.slot;
      const targetRelation = !moved
        ? relation
        : relation === "extra"
        ? "extra"
        : "outside";
      const targetMealId = moved ? generatedMealId(targetRelation) : sourceMeal.id;
      await onCorrect({
        sourceDate: editor.day.date,
        sourceMealId: sourceMeal.id,
        date,
        slot,
        mealId: targetMealId,
        relation: targetRelation,
      });
      return;
    }

    const mealId = sourceMeal?.id ?? generatedMealId(relation);
    if (file) {
      await onPhoto({ file, date, slot, mealId, relation });
      return;
    }
    if (!text.trim()) return;
    await onDescribe({ date, slot, mealId, relation, text: text.trim() });
  }

  return (
    <Modal
      open
      onClose={onClose}
      closeAsIcon
      title={editor.kind === "correct"
        ? t("student_progress.journal.correct")
        : t("student_progress.journal.dialog_title")}
    >
      <form onSubmit={submit} className="space-y-4">
        {editor.kind === "correct"
          ? (
            <Field label={t("student_progress.journal.dialog_date")} htmlFor="journal-date">
              <input
                id="journal-date"
                type="date"
                className={inputClass}
                value={date}
                min={shiftDate(today, -14)}
                max={today}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </Field>
          )
          : null}

        {(editor.kind === "add" || editor.kind === "correct")
          ? (
            <Field label={t("student_progress.journal.dialog_slot")} htmlFor="journal-slot">
              <select
                id="journal-slot"
                className={inputClass}
                value={slot}
                onChange={(event) => setSlot(event.target.value)}
              >
                {SLOTS.map((item) => <option key={item} value={item}>{safeSlotLabel(item)}</option>)}
              </select>
            </Field>
          )
          : null}

        <Field label={t("student_progress.journal.dialog_relation")} htmlFor="journal-relation">
          <select
            id="journal-relation"
            className={inputClass}
            value={relation}
            onChange={(event) => setRelation(event.target.value as Relation)}
          >
            {planRelated
              ? <option value="planned">{t("student_progress.journal.dialog_as_planned")}</option>
              : null}
            {planRelated
              ? <option value="replacement">{t("student_progress.journal.dialog_replacement")}</option>
              : null}
            {!planRelated
              ? <option value="outside">{t("student_progress.journal.dialog_outside")}</option>
              : null}
            {!planRelated
              ? <option value="extra">{t("student_progress.journal.dialog_extra")}</option>
              : null}
          </select>
        </Field>

        {editor.kind === "correct"
          ? null
          : (
            <>
              <Field label={t("student_progress.journal.dialog_prompt")} htmlFor="journal-description">
                <textarea
                  id="journal-description"
                  rows={4}
                  className={inputClass}
                  placeholder={t("student_progress.journal.dialog_placeholder")}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  disabled={Boolean(file)}
                />
              </Field>
              <Field label={t("student_progress.journal.add_photo")} htmlFor="journal-photo">
                <input
                  id="journal-photo"
                  className={inputClass}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </Field>
            </>
          )}

        <ErrorLine message={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || (editor.kind !== "correct" && !file && !text.trim())}
          >
            {busy
              ? file
                ? t("student_progress.journal.photo_saving")
                : t("student_progress.journal.dialog_saving")
              : t("student_progress.journal.dialog_save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MealRow({
  meal,
  signedPhotos,
  busy,
  onDescribe,
  onCorrect,
  onSkip,
  onPhoto,
  onRetry,
}: {
  meal: JournalMeal;
  signedPhotos: Record<string, string>;
  busy: boolean;
  onDescribe: () => void;
  onCorrect: () => void;
  onSkip: () => void;
  onPhoto: (file: File) => void;
  onRetry: (eventId: string) => void;
}) {
  const firstPhoto = meal.events.find((event) => event.mediaPath && signedPhotos[event.mediaPath]);
  const note = meal.events.map((event) => event.note?.trim()).find(Boolean);
  const showMissingActions = meal.state === "missing" && meal.origin === "outside";

  return (
    <article className="rounded-card border border-line bg-paper p-3">
      <div className="flex min-w-0 gap-3">
        {firstPhoto?.mediaPath
          ? (
            <img
              src={signedPhotos[firstPhoto.mediaPath]}
              alt=""
              className="h-16 w-16 shrink-0 rounded-card object-cover"
            />
          )
          : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                {meal.slot ? `${safeSlotLabel(meal.slot)} · ` : ""}{t(originKey(meal.origin))}
              </p>
              {meal.title ? <h4 className="truncate text-sm font-semibold text-ink">{meal.title}</h4> : null}
            </div>
            <span className="text-xs text-ink-soft">{t(mealStateKey(meal.state))}</span>
          </div>
          {note ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-soft">{note}</p> : null}
          {meal.events.some((event) => event.analysis !== "ready")
            ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-xs text-ink-soft">
                  {t(meal.events.some((event) => event.analysis === "pending")
                    ? "student_progress.journal.analysis_pending"
                    : "student_progress.journal.analysis_unavailable")}
                </p>
                {meal.actions.retry
                  ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        const event = meal.events.find((item) => item.analysis !== "ready");
                        if (event) onRetry(event.id);
                      }}
                    >
                      {t("student_progress.journal.retry")}
                    </Button>
                  )
                  : null}
              </div>
            )
            : null}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
            {meal.plannedEnergy
              ? <span>{t("student_progress.journal.planned_kcal", { kcal: meal.plannedEnergy.kcal })}</span>
              : null}
            {meal.reportedEnergy
              ? (
                <span>
                  {t(
                    meal.reportedEnergy.basis === "photo_estimate" || meal.reportedEnergy.basis === "text_estimate"
                      ? "student_progress.journal.reported_estimated"
                      : "student_progress.journal.reported_kcal",
                    { kcal: meal.reportedEnergy.kcal },
                  )}
                </span>
              )
              : null}
            {meal.origin === "planned"
              ? (
                <Link to="/app/plan" className="underline underline-offset-2 hover:text-ink">
                  {t("student_progress.journal.open_plan")}
                </Link>
              )
              : null}
          </div>
        </div>
      </div>

      {showMissingActions
        ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {meal.actions.photo ? <label className="inline-flex cursor-pointer items-center rounded-full border border-line-strong bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:bg-fig-50">
              {t("student_progress.journal.add_photo")}
              <input
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onPhoto(file);
                  event.target.value = "";
                }}
              />
            </label> : null}
            {meal.actions.describe ? <Button size="sm" onClick={onDescribe} disabled={busy}>{t("student_progress.journal.describe")}</Button> : null}
            {meal.actions.skip ? <Button size="sm" variant="ghost" onClick={onSkip} disabled={busy}>{t("student_progress.journal.skip")}</Button> : null}
          </div>
        )
        : null}

      {meal.actions.correct || (meal.actions.photo && meal.events.length > 0)
        ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {meal.actions.correct ? <Button size="sm" variant="ghost" onClick={onCorrect} disabled={busy}>
              {t("student_progress.journal.correct")}
            </Button> : null}
            {meal.actions.photo ? <label className="inline-flex cursor-pointer items-center rounded-full px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-fig-50">
              {t("student_progress.journal.add_photo")}
              <input
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onPhoto(file);
                  event.target.value = "";
                }}
              />
            </label> : null}
          </div>
        )
        : null}
      {!meal.editable && meal.origin !== "fixed" && meal.state !== "future"
        ? <p className="mt-3 text-xs text-ink-soft">{t("student_progress.journal.readonly")}</p>
        : null}
    </article>
  );
}

function DayPanel({
  day,
  today,
  signedPhotos,
  busy,
  onAdd,
  onDescribe,
  onCorrect,
  onSkip,
  onPhoto,
  onRetry,
}: {
  day: JournalDay;
  today: string;
  signedPhotos: Record<string, string>;
  busy: boolean;
  onAdd: () => void;
  onDescribe: (meal: JournalMeal) => void;
  onCorrect: (meal: JournalMeal) => void;
  onSkip: (meal: JournalMeal) => void;
  onPhoto: (meal: JournalMeal, file: File) => void;
  onRetry: (eventId: string) => void;
}) {
  const canAdd = day.date <= today && shiftDate(today, -14) <= day.date;
  return (
    <section className="rounded-fiche border border-line bg-paper-2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-semibold text-ink">
            {formatWeekday(day.date, { long: true })} · {formatDate(day.date, { year: false })}
          </h3>
          <p className="text-xs text-ink-soft">{t(dayStateKey(day))}</p>
        </div>
        {day.reportedKcal !== null
          ? (
            <p className="text-sm font-semibold text-ink">
              {t(
                day.state === "complete" ? "student_progress.journal.total" : "student_progress.journal.subtotal",
                { kcal: day.reportedKcal },
              )}
            </p>
          )
          : null}
      </div>
      {day.reportedKcal !== null && day.state !== "complete"
        ? <p className="mt-1 text-xs text-ink-soft">{t("student_progress.journal.incomplete_note")}</p>
        : day.meals.some((meal) => meal.state === "reported")
        ? <p className="mt-1 text-xs text-ink-soft">{t("student_progress.journal.no_total")}</p>
        : null}

      <div className="mt-3 space-y-2">
        {day.meals.length === 0
          ? <p className="text-sm text-ink-soft">{t("student_progress.journal.empty")}</p>
          : day.meals.map((meal) => (
            <MealRow
              key={meal.id}
              meal={meal}
              signedPhotos={signedPhotos}
              busy={busy}
              onDescribe={() => onDescribe(meal)}
              onCorrect={() => onCorrect(meal)}
              onSkip={() => onSkip(meal)}
              onPhoto={(file) => onPhoto(meal, file)}
              onRetry={onRetry}
            />
          ))}
      </div>
      {canAdd
        ? (
          <Button className="mt-3" size="sm" variant="ghost" onClick={onAdd} disabled={busy}>
            + {t("student_progress.journal.add")}
          </Button>
        )
        : null}
    </section>
  );
}

/**
 * LE DÉTAIL DU CALCUL — 2026-09-21.
 *
 * ── ⛔ CE COMPOSANT NE CALCULE RIEN ───────────────────────────────────────
 * Tous les nombres arrivent tout faits (`energy_breakdown.ts`), et c'est la
 * règle du dépôt: **le front n'a aucune formule d'énergie**. Le jour où cet
 * écran dériverait son propre entretien, l'écran et le plan diraient deux
 * choses différentes au premier arbitrage changé, et le désaccord serait
 * invisible — chacun aurait raison chez lui.
 *
 * Les deux seules décisions prises ici sont de MISE EN PAGE: quelles lignes
 * existent selon la chaîne, et le signe affiché devant l'écart (qui est déjà
 * porté par la valeur — on ne fait que ne pas écrire « +-500 »).
 *
 * ⚠️ L'ORDRE DES LIGNES EST L'ORDRE DU CALCUL, et c'est tout l'intérêt: la
 * pesée, puis ce qu'on en tire, puis ce que l'objectif y ajoute, puis le
 * résultat. Les réordonner casserait la seule chose que ce panneau promet.
 */
export function TargetDetail({ breakdown }: { breakdown: JournalTargetBreakdown }) {
  const perKg = breakdown.chain === "weight_per_kg" &&
    breakdown.per_kg_low !== null && breakdown.per_kg_high !== null;
  // UN POINT OU UNE FOURCHETTE, selon la chaîne — les deux bornes sont égales
  // sur l'équation du corps, et écrire « 2726–2726 » serait du bruit.
  const upkeep = breakdown.maintenance_low === null
    ? null
    : breakdown.maintenance_low === breakdown.maintenance_high
    ? `${breakdown.maintenance_low} kcal`
    : `${breakdown.maintenance_low}–${breakdown.maintenance_high} kcal`;
  const rows: Array<[string, string]> = [];
  if (breakdown.weight_kg !== null) {
    rows.push([
      t("student_progress.journal.detail_weight"),
      `${breakdown.weight_kg} ${t("unit.kg")}`,
    ]);
  }
  /* ── ⛔ ICI SE TENAIT UNE LIGNE « Tes journées » — RETIRÉE AVANT D'ÊTRE
     LIVRÉE, PAR LE DÉTECTEUR DE COUTURES ─────────────────────────────────
     Elle rendait `setup.activity.<cran>`, et `i18n/pageSeams.int.test.ts` l'a
     refusée: `/app/progress` ne déclare pas le namespace `setup`. Les deux
     sorties possibles étaient mauvaises — déclarer `setup` ici est une
     PROMESSE (« cette page peut rendre ces clés »), et le catalogue avertit
     qu'une déclaration écrite pour faire taire un rouge affaiblit le seul
     détecteur qui voie les coutures avant l'utilisateur; recopier les quatre
     libellés sous `student_progress.*` en ferait une cinquième copie d'un
     vocabulaire fermé, le défaut que `food_group` a déjà payé.

     ⚠️ ET ON NE PERD PAS L'INFORMATION: sur le raccourci, la ligne « Par
     kilo » EST l'effet du cran, en chiffres (28 à 31 pour « debout, en
     mouvement »); sur l'équation du corps, la phrase de chaîne nomme « tes
     journées » en toutes lettres. `activity_level` reste dans la charge utile
     — il est vrai, et un écran qui déclare `setup` pourra le rendre. */
  if (perKg) {
    rows.push([
      t("student_progress.journal.detail_per_kg"),
      t("student_progress.journal.detail_per_kg_value", {
        low: String(breakdown.per_kg_low),
        high: String(breakdown.per_kg_high),
      }),
    ]);
  }
  if (upkeep !== null) {
    rows.push([t("student_progress.journal.detail_maintenance"), upkeep]);
  }
  if (breakdown.daily_delta_kcal !== 0) {
    rows.push([
      t("student_progress.journal.detail_delta"),
      // LE SIGNE EST DÉJÀ DANS LA VALEUR (négatif sur une perte). On n'ajoute
      // que le « + », que `String(500)` n'écrit pas.
      `${breakdown.daily_delta_kcal > 0 ? "+" : ""}${breakdown.daily_delta_kcal} kcal`,
    ]);
  }
  rows.push([
    t("student_progress.journal.detail_total"),
    `${breakdown.low}–${breakdown.high} kcal`,
  ]);
  return (
    <div className="mt-4 rounded-card border border-line bg-paper-2 p-3">
      <p className="text-label font-semibold uppercase text-ink-soft">
        {t("student_progress.journal.detail_title")}
      </p>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {rows.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt className="text-ink-soft">{label}</dt>
            <dd className="text-ink">{value}</dd>
          </React.Fragment>
        ))}
      </dl>
      {/* QUELLE CHAÎNE A SERVI, EN TOUTES LETTRES. Deux comptes n'ont pas
          forcément les mêmes étapes, et le taire ferait passer un raccourci
          pour une équation. */}
      <p className="mt-3 text-xs leading-5 text-ink-soft">
        {breakdown.chain === "body_equation"
          ? t("student_progress.journal.detail_chain_body_equation")
          : t("student_progress.journal.detail_chain_weight_per_kg")}
      </p>
      <p className="mt-2 text-xs leading-5 text-ink-soft">
        {t("student_progress.journal.detail_reserve")}
      </p>
    </div>
  );
}

export default function StudentProgressPage() {
  const initialToday = browserToday();
  const [weekStart, setWeekStart] = React.useState(() => mondayOf(initialToday));
  const [selectedDate, setSelectedDate] = React.useState<string | null>(initialToday);
  const [wholeWeek, setWholeWeek] = React.useState(false);
  /** ⟳ 2026-09-21 — le panneau « Détail » du repère. Fermé par défaut. */
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [report, setReport] = React.useState<JournalReport | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [mutationError, setMutationError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [editor, setEditor] = React.useState<Editor>(null);
  const [signedPhotos, setSignedPhotos] = React.useState<Record<string, string>>({});
  const alignedToServer = React.useRef(false);

  const weekEnd = shiftDate(weekStart, 6);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadJournalTracking({ from: weekStart, to: weekEnd });
      if (!alignedToServer.current) {
        alignedToServer.current = true;
        const serverWeek = mondayOf(next.today);
        if (serverWeek !== weekStart) {
          setWeekStart(serverWeek);
          setSelectedDate(next.today);
          return;
        }
      }
      setReport(next);
      setSelectedDate((current) => {
        if (current && current >= weekStart && current <= weekEnd) return current;
        return next.today < weekStart ? weekStart : next.today > weekEnd ? weekEnd : next.today;
      });
      const paths = next.days.flatMap((day) => day.meals.flatMap((meal) => meal.events.map((event) => event.mediaPath).filter(Boolean))) as string[];
      setSignedPhotos(await signMealPhotoUrls(paths).catch(() => ({})));
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setLoading(false);
    }
  }, [weekEnd, weekStart]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function mutate(work: () => Promise<void>) {
    setBusy(true);
    setMutationError(null);
    try {
      await work();
      setEditor(null);
      await refresh();
    } catch (caught) {
      setMutationError(readableError(caught));
    } finally {
      setBusy(false);
    }
  }

  function goToWeek(offset: number) {
    const start = shiftDate(weekStart, offset * 7);
    const end = shiftDate(start, 6);
    const today = report?.today ?? initialToday;
    setWeekStart(start);
    setSelectedDate(today < start ? start : today > end ? end : today);
    setWholeWeek(false);
  }

  if (loading && !report) {
    return <KeelAppShell variant="student" title={t("student_progress.title")}><p>{t("student_progress.loading")}</p></KeelAppShell>;
  }
  if (error || !report) {
    return (
      <KeelAppShell variant="student" title={t("student_progress.title")}>
        <Card><ErrorLine message={error ?? "journal_unavailable"} /></Card>
      </KeelAppShell>
    );
  }
  if (report.floor) {
    return (
      <KeelAppShell variant="student" title={t("student_progress.title")}>
        <Card><p className="text-sm text-ink-soft">{t("student_progress.restricted")}</p></Card>
      </KeelAppShell>
    );
  }

  const shownDays = wholeWeek
    ? report.days
    : report.days.filter((day) => day.date === selectedDate);
  const goalKey = report.target?.direction === "down"
    ? "student_progress.journal.target_goal_down"
    : report.target?.direction === "up"
    ? "student_progress.journal.target_goal_up"
    : "student_progress.journal.target_goal_other";

  return (
    <KeelAppShell variant="student" width="wide" title={t("student_progress.title")}>
      <div className="space-y-6">
        <Card>
          {/* ── ⟳ 2026-09-21 · « Détail » À CÔTÉ DU REPÈRE ──────────────────
              Demandé à l'écran: « un bouton Détail qui permette de donner le
              détail du calcul de manière carrée, comme ça c'est transparent ».

              ⛔ IL N'EXISTE QUE QUAND IL Y A QUELQUE CHOSE À EXPLIQUER.
              `breakdown` vaut `null` dès qu'il n'y a pas de fourchette, et le
              serveur est le seul à le décider: un bouton posé à côté de « pas
              encore disponible » ouvrirait un panneau sur du vide. */}
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <SectionLabel className="mb-0">{t("student_progress.journal.target")}</SectionLabel>
            {report.energy.open && report.target?.breakdown
              ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDetailOpen((v) => !v)}
                >
                  {detailOpen
                    ? t("student_progress.journal.detail_close")
                    : t("student_progress.journal.detail")}
                </Button>
              )
              : null}
          </div>
          {report.energy.open && report.target && report.target.low !== null && report.target.high !== null
            ? (
              <div className="mt-2">
                <p className="text-3xl font-semibold text-ink">
                  {report.target.low}–{report.target.high} <span className="text-base text-ink-soft">kcal</span>
                </p>
                <p className="mt-1 text-sm text-ink-soft">{t(goalKey as MessageKey)}</p>
                {report.target.weight_week_start
                  ? <p className="mt-1 text-xs text-ink-soft">{t("student_progress.journal.target_date", { date: formatDate(report.target.weight_week_start) })}</p>
                  : null}
                {detailOpen && report.target.breakdown
                  ? <TargetDetail breakdown={report.target.breakdown} />
                  : null}
              </div>
            )
            : <p className="mt-2 text-sm text-ink-soft">{t("student_progress.journal.target_missing")}</p>}
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionLabel className="mb-0">{t("student_progress.journal.week")}</SectionLabel>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => goToWeek(-1)} aria-label={t("student_progress.journal.previous")}>←</Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const today = report.today;
                  setWeekStart(mondayOf(today));
                  setSelectedDate(today);
                  setWholeWeek(false);
                }}
              >
                {t("student_progress.journal.today")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => goToWeek(1)} aria-label={t("student_progress.journal.next")}>→</Button>
            </div>
          </div>
          <p className="mt-2 text-sm text-ink-soft">
            {formatDate(weekStart, { year: false })} – {formatDate(weekEnd)}
          </p>

          <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8" role="tablist">
            {report.days.map((day) => (
              <button
                key={day.date}
                type="button"
                role="tab"
                aria-selected={!wholeWeek && selectedDate === day.date}
                onClick={() => {
                  setSelectedDate(day.date);
                  setWholeWeek(false);
                }}
                className={`rounded-card border px-2 py-3 text-center transition-colors ${
                  !wholeWeek && selectedDate === day.date
                    ? "border-fig-700 bg-fig-50 text-ink"
                    : "border-line bg-paper text-ink-soft hover:border-line-strong"
                }`}
              >
                <span className="block text-xs font-semibold uppercase">{formatWeekday(day.date)}</span>
                <span className="mt-1 block text-lg font-semibold">{Number(day.date.slice(-2))}</span>
                <span className="mt-1 block text-[10px] leading-3">{t(dayStateKey(day))}</span>
              </button>
            ))}
            <button
              type="button"
              role="tab"
              aria-selected={wholeWeek}
              onClick={() => setWholeWeek(true)}
              className={`rounded-card border px-2 py-3 text-xs font-semibold transition-colors ${
                wholeWeek ? "border-fig-700 bg-fig-50 text-ink" : "border-line bg-paper text-ink-soft hover:border-line-strong"
              }`}
            >
              {t("student_progress.journal.all")}
            </button>
          </div>

          <div className={`mt-4 grid gap-4 ${wholeWeek ? "lg:grid-cols-2" : ""}`}>
            {shownDays.map((day) => (
              <DayPanel
                key={day.date}
                day={day}
                today={report.today}
                signedPhotos={signedPhotos}
                busy={busy}
                onAdd={() => {
                  setMutationError(null);
                  setEditor({ kind: "add", day });
                }}
                onDescribe={(meal) => {
                  setMutationError(null);
                  setEditor({ kind: "describe", day, meal });
                }}
                onCorrect={(meal) => {
                  setMutationError(null);
                  setEditor({ kind: "correct", day, meal });
                }}
                onSkip={(meal) => void mutate(() => skipJournalMeal({
                  date: day.date,
                  slot: meal.slot ?? "lunch",
                  mealId: meal.id,
                  mutationId: crypto.randomUUID(),
                }))}
                onPhoto={(meal, file) => void mutate(async () => {
                  await uploadMealPhoto({
                    file,
                    localDate: day.date,
                    journalMealId: meal.id,
                    journalRelation: relationFor(meal),
                    slotKey: meal.slot,
                    clientUploadId: crypto.randomUUID(),
                  });
                })}
                onRetry={(eventId) => void mutate(() => retryJournalMeal(eventId))}
              />
            ))}
          </div>
          <ErrorLine message={editor ? null : mutationError} />
        </Card>

        {report.weight
          ? (
            <WeightCurveCard
              points={report.weight}
              today={report.today}
              label={t("student_progress.journal.weight")}
            />
          )
          : null}
      </div>

      <MealEditor
        editor={editor}
        today={report.today}
        busy={busy}
        error={mutationError}
        onClose={() => {
          if (!busy) setEditor(null);
        }}
        onDescribe={(args) => mutate(() => describeJournalMeal({ ...args, mutationId: crypto.randomUUID() }))}
        onCorrect={(args) => mutate(() => correctJournalMeal({ ...args, mutationId: crypto.randomUUID() }))}
        onPhoto={(args) => mutate(async () => {
          await uploadMealPhoto({
            file: args.file,
            localDate: args.date,
            journalMealId: args.mealId,
            journalRelation: args.relation,
            slotKey: args.slot,
            clientUploadId: crypto.randomUUID(),
          });
        })}
      />
    </KeelAppShell>
  );
}
