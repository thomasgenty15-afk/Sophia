import React from "react";
import { t } from "../i18n/t";

/**
 * KEEL — inline editor for ONE plan commitment, all six axes (W6.3).
 *
 * The coach edits a typed row, not a paragraph: polarity, class, time anchor,
 * measure/unit/target, evidence, cadence, governance. Every closed vocabulary
 * (R1) is a SELECTOR whose options come from the server — `plan-template-v1`
 * action `vocabulary` returns the token lists of `_shared/keel/tokens.ts` plus
 * the `substances`, `food_groups` and `slot_vocabulary` tables. There is no
 * hardcoded vocabulary in this file, on purpose: a free-text slug field is
 * exactly how a closed register leaks (R7).
 *
 * VALIDATION IS A MIRROR, NOT THE AUTHORITY. `validateDraft` below restates the
 * named CHECK constraints of `plan_commitments` so the coach sees the problem
 * while typing. The server re-runs the same rules in
 * `supabase/functions/plan-template-v1/commitment_rules.ts` and is the only
 * thing that can accept a write. The two lists are duplicated deliberately —
 * the alternative was importing the Deno module across the frontend/edge
 * boundary, which Vite refuses (`server.fs.allow` stops at `frontend/`), and
 * vite.config.ts is outside this lot's perimeter. Mitigation: each rule quotes
 * the SQL constraint name it mirrors, and any divergence surfaces as a VISIBLE
 * server rejection at save time (`review.save_error`), never as a silent
 * accept.
 *
 * Substance and food-group options are shown as raw slugs. They are tokens, not
 * prose (R1) — see the note in i18n/en.ts.
 */

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ---------------------------------------------------------------------------
// Types — field names are the COLUMN names of plan_commitments, verbatim.
// ---------------------------------------------------------------------------

export interface DraftCommitment {
  /** Client-side row identity. Never persisted; the DB assigns its own id. */
  local_id: string;
  template_commitment_key: string | null;
  title: string;
  student_instruction: string | null;
  content_locale: string;

  polarity: string;
  activity_class: string;

  anchor_kind: string;
  slot_key: string | null;
  clock_local: string | null;
  tolerance_minutes: number | null;
  window_start_local: string | null;
  window_end_local: string | null;

  measure: string;
  unit: string | null;
  target_op: string;
  target_min: number | null;
  target_max: number | null;
  substance_ref: string | null;
  food_group_ref: string | null;

  evidence_kind: string;
  evidence_required: boolean;
  auto_source: string | null;
  counts_toward_adherence: boolean;

  evaluation_grain: string;
  slot_kind: string | null;
  scheduled_days: string[] | null;
  required_days_per_week: number | null;
  expected_occasions_per_day: number | null;

  priority: string;
  autonomy: string;
  flex_eligible: boolean;
  provenance: string;
  requires_clinician_signoff: boolean;

  auto_generated: boolean;
  source_span: Record<string, unknown> | null;

  /** Review-screen state, stripped before the row is sent to the server. */
  needs_review: boolean;
  extraction_confidence: number | null;
  extraction_issues: string[];
}

export interface KeelVocabulary {
  enums: Record<string, readonly string[]>;
  slot_vocabulary: Array<{ key: string; sort_order: number }>;
  food_groups: Array<{ slug: string; class: string }>;
  substances: Array<{ slug: string; kind: string }>;
  substance_limits: Array<{
    substance_ref: string;
    ul_amount: number;
    ul_unit: string;
    per: string;
  }>;
  substance_interactions: Array<{
    substance_ref: string;
    medication_class: string;
    severity: string;
    note: string;
  }>;
}

/**
 * Reference facts about a molecule-register line, FOR THE COACH ONLY.
 *
 * Mirrors `plan-template-v1/safety.ts` exactly, including what it no longer
 * carries: there is no `degraded` and no `student_text`. The server cannot send
 * them and this screen cannot render them — the prescription reaches the
 * student as the coach wrote it (product decision, 2026-07-28).
 */
export interface SafetyFinding {
  index: number;
  reasons: Array<"exceeds_ul" | "ul_not_comparable" | "interaction_watchlist">;
  ul: { amount: number; unit: string; per: string } | null;
  target_label: string | null;
  watchlist: Array<{ medication_class: string; severity: string; note: string }>;
  coach_notes: string[];
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

/**
 * One call for every action of plan-template-v1. The session token is attached
 * when there is one: `vocabulary` and `safety_review` are open to the anon key
 * (seeded reference data only), the CRUD actions resolve the coach from this
 * very JWT and reject anything else with 403.
 */
export async function callPlanTemplate<T>(
  payload: Record<string, unknown>,
  accessToken?: string | null,
): Promise<T> {
  const res = await fetch(`${FUNCTIONS_BASE}/plan-template-v1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken ?? ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const issues = (json as { issues?: string[] } | null)?.issues;
    const detail = Array.isArray(issues) ? ` — ${issues.join("; ")}` : "";
    throw new Error(
      `${(json as { error?: string } | null)?.error ?? `HTTP ${res.status}`}${detail}`,
    );
  }
  return json as T;
}

export function loadVocabulary(): Promise<KeelVocabulary> {
  return callPlanTemplate<KeelVocabulary>({ action: "vocabulary" });
}

/**
 * Coach-only reference notes, computed server-side. The note text is composed
 * once, in the render layer, and shown here verbatim: a second wording of the
 * same fact in the browser would be a second product, drifting.
 */
export async function reviewSafety(
  commitments: DraftCommitment[],
): Promise<SafetyFinding[]> {
  const res = await callPlanTemplate<{ findings: SafetyFinding[] }>({
    action: "safety_review",
    commitments: commitments.map((c) => ({
      title: c.title,
      substance_ref: c.substance_ref,
      measure: c.measure,
      unit: c.unit,
      target_op: c.target_op,
      target_min: c.target_min,
      target_max: c.target_max,
    })),
  });
  return res.findings;
}

// ---------------------------------------------------------------------------
// Draft construction
// ---------------------------------------------------------------------------

let localIdSeq = 0;
function nextLocalId(): string {
  localIdSeq += 1;
  return `draft_${localIdSeq}`;
}

/**
 * `plan_commitments.template_commitment_key` — the join key each student clone
 * carries back to its template line. plan-publish-v1 REFUSES a template whose
 * lines have no key ("a template line must be addressable by a per-student
 * diff"), so it is required, not decorative.
 *
 * This derives a first proposal from the coach's own title. It is a machine
 * key, never prose (R1: ASCII snake_case), it is SHOWN in the editor, and the
 * coach can change it — nothing is filled behind their back. The index suffix
 * only exists to keep two similarly-titled lines addressable.
 */
export function suggestTemplateKey(title: string, index: number): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug === "" ? `line_${index + 1}` : `${slug}_${index + 1}`;
}

/**
 * A blank line the coach fills in. Every default here is the SQL default of the
 * column, so an untouched line is the row Postgres would have created — never a
 * guess the editor invented.
 */
export function blankCommitment(
  overrides: Partial<DraftCommitment> = {},
): DraftCommitment {
  return {
    local_id: nextLocalId(),
    template_commitment_key: null,
    title: "",
    student_instruction: null,
    content_locale: "en-US",
    polarity: "do",
    activity_class: "other",
    anchor_kind: "free",
    slot_key: null,
    clock_local: null,
    tolerance_minutes: null,
    window_start_local: null,
    window_end_local: null,
    measure: "presence",
    unit: null,
    target_op: "any",
    target_min: null,
    target_max: null,
    substance_ref: null,
    food_group_ref: null,
    evidence_kind: "self_report",
    evidence_required: false,
    auto_source: null,
    counts_toward_adherence: true,
    evaluation_grain: "day",
    slot_kind: null,
    scheduled_days: null,
    required_days_per_week: null,
    expected_occasions_per_day: 1,
    priority: "core",
    autonomy: "strict",
    flex_eligible: false,
    provenance: "coach_educational",
    requires_clinician_signoff: false,
    auto_generated: false,
    source_span: null,
    needs_review: false,
    extraction_confidence: null,
    extraction_issues: [],
    ...overrides,
  };
}

/** Strip the review-screen state before the row travels to the server. */
export function toServerCommitment(c: DraftCommitment): Record<string, unknown> {
  const {
    local_id: _localId,
    needs_review: _needsReview,
    extraction_confidence: _confidence,
    extraction_issues: _issues,
    ...row
  } = c;
  return row;
}

// ---------------------------------------------------------------------------
// Validation — mirrors the named CHECK constraints of plan_commitments
// ---------------------------------------------------------------------------

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function blank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

/**
 * Structural coherence only. Vocabulary membership is not re-checked here:
 * every token field is a `<select>` whose options come from the server, so an
 * out-of-vocabulary value cannot be produced by this UI. The server re-parses
 * them anyway (R7).
 */
export function validateDraft(c: DraftCommitment): string[] {
  const issues: string[] = [];

  if (blank(c.title)) issues.push("title: required");
  if (blank(c.content_locale)) issues.push("content_locale: required (R2)");
  // plan-publish-v1 refuses a template line with no key: without it the
  // per-student diff has nothing to address.
  if (blank(c.template_commitment_key)) {
    issues.push("template_commitment_key: required — a line must be addressable by the per-student diff");
  } else if (!/^[a-z][a-z0-9_]*$/.test(String(c.template_commitment_key))) {
    issues.push("template_commitment_key: ASCII snake_case, starting with a letter (R1)");
  }

  for (const [field, value] of [
    ["clock_local", c.clock_local],
    ["window_start_local", c.window_start_local],
    ["window_end_local", c.window_end_local],
  ] as const) {
    if (!blank(value) && !HHMM.test(String(value))) {
      issues.push(`${field}: expected HH:MM (24h)`);
    }
  }

  const hasSlot = !blank(c.slot_key);
  const hasClock = !blank(c.clock_local);
  const hasTol = c.tolerance_minutes !== null;
  const hasStart = !blank(c.window_start_local);
  const hasEnd = !blank(c.window_end_local);

  // plan_commitments_anchor_check
  if (c.anchor_kind === "slot") {
    if (!hasSlot) issues.push("plan_commitments_anchor_check: anchor_kind='slot' requires slot_key");
    if (hasClock || hasTol) {
      issues.push("plan_commitments_anchor_check: anchor_kind='slot' forbids clock_local / tolerance_minutes");
    }
    if (hasStart !== hasEnd) {
      issues.push("plan_commitments_anchor_check: a slot window needs BOTH bounds");
    }
  } else if (c.anchor_kind === "clock") {
    if (!hasClock) issues.push("plan_commitments_anchor_check: anchor_kind='clock' requires clock_local");
    if (hasSlot || hasStart || hasEnd) {
      issues.push("plan_commitments_anchor_check: anchor_kind='clock' forbids slot_key and the window columns");
    }
  } else if (c.anchor_kind === "window") {
    if (!hasStart || !hasEnd) {
      issues.push("plan_commitments_anchor_check: anchor_kind='window' requires both bounds");
    }
    if (hasSlot || hasClock || hasTol) {
      issues.push("plan_commitments_anchor_check: anchor_kind='window' forbids slot_key, clock_local and tolerance_minutes");
    }
  } else if (c.anchor_kind === "free") {
    if (hasSlot || hasClock || hasTol || hasStart || hasEnd) {
      issues.push("plan_commitments_anchor_check: anchor_kind='free' forbids every anchor column");
    }
  }

  // plan_commitments_target_check
  const { target_op: op, target_min: min, target_max: max } = c;
  if (op === ">=" || op === "==") {
    if (min === null) issues.push(`plan_commitments_target_check: target_op='${op}' requires target_min`);
    if (max !== null) issues.push(`plan_commitments_target_check: target_op='${op}' forbids target_max`);
  } else if (op === "<=") {
    if (max === null) issues.push("plan_commitments_target_check: target_op='<=' requires target_max");
    if (min !== null) issues.push("plan_commitments_target_check: target_op='<=' forbids target_min");
  } else if (op === "between") {
    if (min === null || max === null) {
      issues.push("plan_commitments_target_check: target_op='between' requires target_min and target_max");
    } else if (min > max) {
      issues.push("plan_commitments_target_check: target_min must be <= target_max");
    }
  } else if (op === "any") {
    if (min !== null || max !== null) {
      issues.push("plan_commitments_target_check: target_op='any' forbids target_min and target_max");
    }
  }

  // plan_commitments_substance_ref_check (R7 corollary)
  if ((c.measure === "dose" || c.measure === "micronutrient") && blank(c.substance_ref)) {
    issues.push(
      `plan_commitments_substance_ref_check: measure='${c.measure}' requires substance_ref`,
    );
  }

  // plan_commitments_occasion_anchor_check
  if (c.evaluation_grain === "occasion" && c.anchor_kind === "free") {
    issues.push(
      "plan_commitments_occasion_anchor_check: grain='occasion' needs an anchor that resolves to an occasion",
    );
  }

  // plan_commitments_nominal_slot_check
  if (c.slot_kind === "nominal" && c.slot_key === "any_meal") {
    issues.push("plan_commitments_nominal_slot_check: slot_kind='nominal' forbids slot_key='any_meal'");
  }

  // plan_commitments_avoid_grain_check
  if (c.polarity === "avoid" && c.evaluation_grain !== "day" && c.evaluation_grain !== "week") {
    issues.push("plan_commitments_avoid_grain_check: polarity='avoid' evaluates at day or week grain only");
  }

  if (
    c.required_days_per_week !== null &&
    (!Number.isInteger(c.required_days_per_week) ||
      c.required_days_per_week < 0 ||
      c.required_days_per_week > 7)
  ) {
    issues.push("required_days_per_week: integer between 0 and 7");
  }
  if (
    c.expected_occasions_per_day !== null &&
    (!Number.isInteger(c.expected_occasions_per_day) || c.expected_occasions_per_day < 1)
  ) {
    issues.push("expected_occasions_per_day: integer >= 1");
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Field primitives
// ---------------------------------------------------------------------------

const FIELD =
  "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 " +
  "focus:border-gray-600 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function TokenSelect({
  label,
  value,
  options,
  onChange,
  nullable = false,
  disabled = false,
  groups,
}: {
  label: string;
  value: string | null;
  options: readonly string[];
  onChange: (v: string | null) => void;
  nullable?: boolean;
  disabled?: boolean;
  /** optional slug -> group name, renders <optgroup> (substance kind, food class) */
  groups?: Record<string, string>;
}) {
  const grouped = React.useMemo(() => {
    if (!groups) return null;
    const map = new Map<string, string[]>();
    for (const opt of options) {
      const g = groups[opt] ?? "other";
      map.set(g, [...(map.get(g) ?? []), opt]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [options, groups]);

  return (
    <Field label={label}>
      <select
        className={`${FIELD} font-mono`}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      >
        {nullable && <option value="">{t("editor.none_option")}</option>}
        {grouped
          ? grouped.map(([group, slugs]) => (
            <optgroup key={group} label={group}>
              {slugs.map((o) => <option key={o} value={o}>{o}</option>)}
            </optgroup>
          ))
          : options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  disabled = false,
  min,
  step,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  min?: number;
  step?: number;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        className={FIELD}
        value={value ?? ""}
        min={min}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </Field>
  );
}

function TimeInput({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <input
        type="time"
        className={FIELD}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      />
    </Field>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-gray-700">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-gray-400">{hint}</span>}
      </span>
    </label>
  );
}

function DayPicker({
  value,
  options,
  onChange,
}: {
  value: string[] | null;
  options: readonly string[];
  onChange: (v: string[] | null) => void;
}) {
  const selected = new Set(value ?? []);
  return (
    <Field label={t("editor.scheduled_days")}>
      <div className="flex flex-wrap gap-1">
        {options.map((d) => {
          const on = selected.has(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => {
                const next = new Set(selected);
                if (on) next.delete(d);
                else next.add(d);
                // Ordered by the vocabulary, never by click order: scheduled_days
                // is data the evaluator reads, not a UI trace.
                const ordered = options.filter((o) => next.has(o));
                onChange(ordered.length === 0 ? null : [...ordered]);
              }}
              className={`rounded px-2 py-1 font-mono text-[11px] ${
                on
                  ? "bg-gray-900 text-white"
                  : "border border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded border border-gray-200 p-2">
      <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Safety note — reference facts for the coach, from the SERVER's finding
// ---------------------------------------------------------------------------

/**
 * WHAT THIS IS NOT, ANYMORE (2026-07-28). It used to be a red panel headed
 * "Shown to the student without the dose", showing the coach the watered-down
 * sentence their student would get instead of the prescription, with a button
 * to buy the prescription back by attesting it was clinician-ordered. That is
 * the software second-guessing the person who wrote the plan.
 *
 * WHAT IT IS. The facts, and nothing else: the upper limit on record, the
 * interaction the seed knows about. Everything about the presentation is
 * deliberate and is the difference between informing a professional and
 * grading them:
 *
 *  - NO ALARM COLOUR. Slate on white, the same weight as the source quote
 *    underneath. Red says "you did something wrong"; this says "here is what
 *    is on file".
 *  - NO CONTROL. No button, no checkbox, no link. There is nothing to answer,
 *    so there is nothing to click — and a coach who reads a note and moves on
 *    has done the right thing.
 *  - NO SECOND WORDING. The sentences come from `renderCoachSafetyNote` in the
 *    shared render layer. This component lays them out; it never composes them.
 */
export function SafetyNote({ finding }: { finding: SafetyFinding }) {
  if (finding.coach_notes.length === 0) return null;

  return (
    <div className="mt-2 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-600">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {t("safety.note_title")}
      </div>
      <ul className="mt-0.5 space-y-0.5">
        {finding.coach_notes.map((note, i) => <li key={i}>{note}</li>)}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

export function CommitmentEditor({
  draft,
  vocabulary,
  onChange,
}: {
  draft: DraftCommitment;
  vocabulary: KeelVocabulary;
  onChange: (next: DraftCommitment) => void;
}) {
  const set = <K extends keyof DraftCommitment>(key: K, value: DraftCommitment[K]) =>
    onChange({ ...draft, [key]: value });

  const enums = vocabulary.enums;
  const slotKeys = vocabulary.slot_vocabulary.map((s) => s.key);
  const substanceGroups = Object.fromEntries(
    vocabulary.substances.map((s) => [s.slug, s.kind]),
  );
  const foodGroupClasses = Object.fromEntries(
    vocabulary.food_groups.map((f) => [f.slug, f.class]),
  );

  const anchor = draft.anchor_kind;
  const op = draft.target_op;

  return (
    <div className="space-y-2">
      <Section title={t("editor.axis_identity")}>
        <div className="space-y-2">
          <Field label={t("editor.title")}>
            <input
              className={FIELD}
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </Field>
          <Field label={t("editor.student_instruction")}>
            <textarea
              className={`${FIELD} h-14`}
              value={draft.student_instruction ?? ""}
              onChange={(e) =>
                set("student_instruction", e.target.value === "" ? null : e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <TokenSelect
              label={t("editor.polarity")}
              value={draft.polarity}
              options={enums.polarity}
              onChange={(v) => set("polarity", v ?? "do")}
            />
            <TokenSelect
              label={t("editor.activity_class")}
              value={draft.activity_class}
              options={enums.activity_class}
              onChange={(v) => set("activity_class", v ?? "other")}
            />
            <Field label={t("editor.content_locale")}>
              <input
                className={`${FIELD} font-mono`}
                value={draft.content_locale}
                onChange={(e) => set("content_locale", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label={t("editor.template_key")}>
              <input
                className={`${FIELD} font-mono`}
                value={draft.template_commitment_key ?? ""}
                onChange={(e) =>
                  set(
                    "template_commitment_key",
                    e.target.value === "" ? null : e.target.value,
                  )}
              />
            </Field>
          </div>
        </div>
      </Section>

      {/* AXIS 2 — time anchor. The conditional columns are DISABLED, not
          hidden: a coach must see that 'free' has no time, rather than watch
          fields appear and vanish. */}
      <Section title={t("editor.axis_anchor")}>
        <div className="grid grid-cols-3 gap-2">
          <TokenSelect
            label={t("editor.anchor_kind")}
            value={anchor}
            options={enums.anchor_kind}
            onChange={(v) => {
              const next = v ?? "free";
              // Switching the anchor clears the columns the new kind forbids —
              // otherwise the CHECK fails on a value the coach cannot see.
              onChange({
                ...draft,
                anchor_kind: next,
                slot_key: next === "slot" ? draft.slot_key : null,
                clock_local: next === "clock" ? draft.clock_local : null,
                tolerance_minutes: next === "clock" ? draft.tolerance_minutes : null,
                window_start_local: next === "window" || next === "slot"
                  ? draft.window_start_local
                  : null,
                window_end_local: next === "window" || next === "slot"
                  ? draft.window_end_local
                  : null,
              });
            }}
          />
          <TokenSelect
            label={t("editor.slot_key")}
            value={draft.slot_key}
            options={slotKeys}
            nullable
            disabled={anchor !== "slot"}
            onChange={(v) => set("slot_key", v)}
          />
          <TokenSelect
            label={t("editor.slot_kind")}
            value={draft.slot_kind}
            options={enums.slot_kind}
            nullable
            onChange={(v) => set("slot_kind", v)}
          />
          <TimeInput
            label={t("editor.clock_local")}
            value={draft.clock_local}
            disabled={anchor !== "clock"}
            onChange={(v) => set("clock_local", v)}
          />
          <NumberInput
            label={t("editor.tolerance_minutes")}
            value={draft.tolerance_minutes}
            disabled={anchor !== "clock"}
            min={0}
            onChange={(v) => set("tolerance_minutes", v)}
          />
          <div />
          <TimeInput
            label={t("editor.window_start_local")}
            value={draft.window_start_local}
            disabled={anchor !== "window" && anchor !== "slot"}
            onChange={(v) => set("window_start_local", v)}
          />
          <TimeInput
            label={t("editor.window_end_local")}
            value={draft.window_end_local}
            disabled={anchor !== "window" && anchor !== "slot"}
            onChange={(v) => set("window_end_local", v)}
          />
        </div>
      </Section>

      <Section title={t("editor.axis_level")}>
        <div className="grid grid-cols-3 gap-2">
          <TokenSelect
            label={t("editor.measure")}
            value={draft.measure}
            options={enums.measure}
            onChange={(v) => set("measure", v ?? "presence")}
          />
          <TokenSelect
            label={t("editor.unit")}
            value={draft.unit}
            options={enums.unit}
            nullable
            onChange={(v) => set("unit", v)}
          />
          <TokenSelect
            label={t("editor.target_op")}
            value={op}
            options={enums.target_op}
            onChange={(v) => {
              const next = v ?? "any";
              // Each operator owns its columns (plan_commitments_target_check):
              // clear the one it forbids instead of leaving an invisible value.
              onChange({
                ...draft,
                target_op: next,
                target_min: next === "<=" || next === "any" ? null : draft.target_min,
                target_max: next === "between" ? draft.target_max : null,
              });
            }}
          />
          <NumberInput
            label={t("editor.target_min")}
            value={draft.target_min}
            disabled={op === "<=" || op === "any"}
            onChange={(v) => set("target_min", v)}
          />
          <NumberInput
            label={t("editor.target_max")}
            value={draft.target_max}
            disabled={op !== "between" && op !== "<="}
            onChange={(v) => set("target_max", v)}
          />
          <div />
          <TokenSelect
            label={t("editor.substance_ref")}
            value={draft.substance_ref}
            options={vocabulary.substances.map((s) => s.slug)}
            groups={substanceGroups}
            nullable
            onChange={(v) => set("substance_ref", v)}
          />
          <TokenSelect
            label={t("editor.food_group_ref")}
            value={draft.food_group_ref}
            options={vocabulary.food_groups.map((f) => f.slug)}
            groups={foodGroupClasses}
            nullable
            onChange={(v) => set("food_group_ref", v)}
          />
        </div>
      </Section>

      <Section title={t("editor.axis_evidence")}>
        <div className="grid grid-cols-3 gap-2">
          <TokenSelect
            label={t("editor.evidence_kind")}
            value={draft.evidence_kind}
            options={enums.evidence_kind}
            onChange={(v) => set("evidence_kind", v ?? "self_report")}
          />
          <TokenSelect
            label={t("editor.auto_source")}
            value={draft.auto_source}
            options={enums.auto_source}
            nullable
            onChange={(v) => set("auto_source", v)}
          />
          <div className="space-y-1 pt-4">
            <Toggle
              label={t("editor.evidence_required")}
              checked={draft.evidence_required}
              onChange={(v) => set("evidence_required", v)}
            />
            <Toggle
              label={t("editor.counts_toward_adherence")}
              hint={t("editor.counts_hint")}
              checked={draft.counts_toward_adherence}
              onChange={(v) => set("counts_toward_adherence", v)}
            />
          </div>
        </div>
      </Section>

      <Section title={t("editor.axis_cadence")}>
        <div className="grid grid-cols-3 gap-2">
          <TokenSelect
            label={t("editor.evaluation_grain")}
            value={draft.evaluation_grain}
            options={enums.evaluation_grain}
            onChange={(v) => set("evaluation_grain", v ?? "day")}
          />
          <NumberInput
            label={t("editor.required_days_per_week")}
            value={draft.required_days_per_week}
            min={0}
            onChange={(v) => set("required_days_per_week", v)}
          />
          <NumberInput
            label={t("editor.expected_occasions_per_day")}
            value={draft.expected_occasions_per_day}
            min={1}
            onChange={(v) => set("expected_occasions_per_day", v)}
          />
        </div>
        <div className="mt-2">
          <DayPicker
            value={draft.scheduled_days}
            options={enums.scheduled_days}
            onChange={(v) => set("scheduled_days", v)}
          />
          <p className="mt-1 text-[11px] text-gray-400">
            {t("editor.required_days_hint")}
          </p>
        </div>
      </Section>

      {/* The provenance selector and the "Needs clinician sign-off" toggle
          used to sit here. Both are gone (2026-07-28): they asked the coach to
          classify their own prescription so the software could decide whether
          to honour it. `draft.provenance` and `draft.requires_clinician_signoff`
          still travel to the server at their defaults — the columns exist, and
          nothing reads them to change what the student receives. */}
      <Section title={t("editor.axis_governance")}>
        <div className="grid grid-cols-2 gap-2">
          <TokenSelect
            label={t("editor.priority")}
            value={draft.priority}
            options={enums.priority}
            onChange={(v) => set("priority", v ?? "core")}
          />
          <TokenSelect
            label={t("editor.autonomy")}
            value={draft.autonomy}
            options={enums.autonomy}
            onChange={(v) => set("autonomy", v ?? "strict")}
          />
        </div>
        <div className="mt-2 space-y-1">
          <Toggle
            label={t("editor.flex_eligible")}
            checked={draft.flex_eligible}
            onChange={(v) => set("flex_eligible", v)}
          />
        </div>
      </Section>
    </div>
  );
}

export default CommitmentEditor;
