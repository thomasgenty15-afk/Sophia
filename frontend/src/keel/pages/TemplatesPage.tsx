import React from "react";
import { t } from "../i18n/t";
import { supabase } from "../../lib/supabase";
import { addDays, localDateIn } from "../api/dates";
import { autonomyLabel, commitmentSentence, foodGroupLabel, priorityLabel } from "../api/labels";
import {
  buildPlanStructure,
  type PlanPart,
  type PlanSection,
  type PlanSubsection,
} from "../api/planStructure";
import { planWindowUntilNextSession } from "../api/todayModel";
import { ActivityChip } from "../components/CommitmentLine";
import { KeelAppShell } from "../components/KeelAppShell";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import {
  blankCommitment,
  callPlanTemplate,
  CommitmentEditor,
  type DraftCommitment,
  type KeelVocabulary,
  loadVocabulary,
  reviewSafety,
  SafetyNote,
  suggestTemplateKey,
  type SafetyFinding,
  toServerCommitment,
  validateDraft,
} from "../components/CommitmentEditor";

// KEEL — the coach's template library (W6.4).
//
// `plan_templates` is where the coach WORKS. The PDF is imported once into a
// template; each student is a clone + diff (SCHEMA.md). Without this table,
// onboarding 25 clients costs 25 imports and 25 reviews, and the permanent
// gain is zero.
//
// `default_swap_policy` is ticked ONCE here, at template level, in the exact
// shape the evaluator reads back out of `content.swap_policy`
// (`{class_equivalent, allowed_groups}`) — a policy, not an enumerated menu.
//
// Every read and write goes through plan-template-v1: `plan_templates` has RLS
// enabled with NO policy for `authenticated`, so PostgREST cannot touch it and
// the coach identity is re-derived server-side from the JWT.

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

interface TemplateRow {
  id: string;
  coach_id: string;
  title: string;
  description: string | null;
  content_locale: string;
  default_swap_policy: { class_equivalent?: boolean; allowed_groups?: string[] | null } | null;
  default_autonomy: string;
  default_flex_allowance: number;
  default_adherence_target_pct: number;
  commitments: unknown[];
  version: number;
  status: string;
  created_at: string;
  updated_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "templates.status_draft",
  active: "templates.status_active",
  archived: "templates.status_archived",
};

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  active: "positive",
  archived: "neutral",
};

/**
 * A stored template commitment is a plain object with the column names; the
 * editor needs the review-screen fields on top. `blankCommitment` supplies the
 * SQL defaults for anything the stored row does not carry, so an older template
 * saved before a field existed opens without inventing a value for it.
 */
function toDraft(raw: unknown): DraftCommitment {
  const row = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<DraftCommitment>;
  const { local_id: _ignored, ...rest } = row as DraftCommitment;
  return blankCommitment(rest);
}

// ---------------------------------------------------------------------------
// THE TEMPLATE IS A PLAN, SO IT IS SHAPED LIKE ONE
//
// This editor used to render `lines.map()` — one flat column in which a
// magnesium, a bedtime and a weekly weigh-in had exactly the same weight. The
// coach composed a template in that column, imported a document into the review
// screen and got FOOD / ACTIONS with the four food headings, then opened their
// client's day and got a third layout. Three readings of the same eighteen
// lines.
//
// The sections below come from `api/planStructure.ts` — the same call the
// import review and the student's day make, in the same order, with the same
// headings and the same family chips. Nothing about the layout is decided here;
// this file only chooses the colours, and it chooses the import screen's.
// ---------------------------------------------------------------------------

const PRIORITY_STYLE: Record<string, string> = {
  core: "bg-gray-100 text-gray-700",
  secondary: "bg-sky-50 text-sky-800",
  optional: "bg-gray-50 text-gray-500",
};

/** The priority as the WORD, never the token (R1: tokens are data, not copy). */
function PriorityChip({ priority }: { priority: string }) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
        PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.optional
      }`}
    >
      {priorityLabel(priority)}
    </span>
  );
}

/**
 * One part of the template — "Food", "Actions", and the quiet observations.
 *
 * Same frame, same tones, same counts as `PartSection` on the import review. A
 * coach who composes here and imports there must not have to notice they
 * changed screen.
 */
function TemplateSection({
  section,
  children,
}: {
  section: PlanSection<DraftCommitment>;
  children: React.ReactNode;
}) {
  const { part, label, hint, count } = section;
  if (count === 0) return null;

  if (part === "observations") {
    return (
      <section className="rounded-lg border border-dashed border-gray-200 bg-gray-50/70 p-3">
        <h4 className="flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {label}
          <span className="rounded bg-gray-200/70 px-1.5 text-[11px] font-normal tabular-nums text-gray-600">
            {count}
          </span>
        </h4>
        <p className="mb-2 mt-0.5 text-[11px] text-gray-500">{hint}</p>
        <div className="space-y-1">{children}</div>
      </section>
    );
  }

  const tone: Record<PlanPart, string> = {
    food: "border-lime-300",
    actions: "border-orange-300",
    unsorted: "border-amber-300",
    observations: "border-gray-200",
  };
  const head: Record<PlanPart, string> = {
    food: "border-lime-200 bg-lime-50 text-lime-900",
    actions: "border-orange-200 bg-orange-50 text-orange-900",
    unsorted: "border-amber-200 bg-amber-50 text-amber-900",
    observations: "border-gray-200 bg-gray-50 text-gray-700",
  };

  return (
    <section className={`overflow-hidden rounded-lg border ${tone[part]} bg-white`}>
      <header className={`border-b px-3 py-2 ${head[part]}`}>
        <h4 className="flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wide">
          {label}
          <span className="rounded bg-white/70 px-1.5 text-xs font-normal tabular-nums">
            {count}
          </span>
        </h4>
        <p className="mt-0.5 text-[11px] font-normal normal-case opacity-80">{hint}</p>
      </header>
      <div className="space-y-4 p-3">{children}</div>
    </section>
  );
}

/**
 * A sub-group: the coach's own heading inside food, the family chip inside
 * actions. The count is there because it is the number the coach checks against
 * their document — four daily rules, two weekly targets.
 */
function TemplateSubgroup({
  subsection,
  children,
}: {
  subsection: PlanSubsection<DraftCommitment>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        {subsection.kind === "activity_class"
          ? <ActivityChip activityClass={subsection.key} size="md" />
          : (
            <h5 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {subsection.label}
            </h5>
          )}
        <span className="text-[11px] tabular-nums text-gray-400">
          {subsection.lines.length}
        </span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export default function TemplatesPage() {
  const [templates, setTemplates] = React.useState<TemplateRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const [vocabulary, setVocabulary] = React.useState<KeelVocabulary | null>(null);
  const [vocabError, setVocabError] = React.useState<string | null>(null);

  // Working copy of the selected template. Nothing is written until "Save".
  const [draft, setDraft] = React.useState<TemplateRow | null>(null);
  const [lines, setLines] = React.useState<DraftCommitment[]>([]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [findings, setFindings] = React.useState<Record<string, SafetyFinding>>({});
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const [studentId, setStudentId] = React.useState("");
  const [timezone, setTimezone] = React.useState(
    // The day boundary is a PLAN property (plan_versions.timezone). Defaulting
    // to the browser's zone is a convenience for the common case, never a
    // silent claim about where the student lives — the field is visible and
    // editable right next to the publish button.
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  // HOW LONG THE PLAN RUNS (E2). Same conversion as the import screen, and
  // deliberately the same helper: `anchor_week_start` + `duration_weeks` decide
  // whether `provision-day-v1` opens the student's day at all, so the two
  // publish paths must not compute them differently. Default: four weeks out.
  const [nextSession, setNextSession] = React.useState<string | null>(
    () => addDays(localDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone), 28),
  );
  const [publishing, setPublishing] = React.useState(false);
  const [publishNote, setPublishNote] = React.useState<string | null>(null);
  /**
   * The approval CLICK, timestamped at the moment it happens. plan-publish-v1
   * writes it to `coach_access_events` as the regulatory trace, so it must be
   * the real click and not a `new Date()` minted inside `publish()`. Any edit
   * to the lines voids it (see `setLines` call sites).
   */
  const [approvedAt, setApprovedAt] = React.useState<string | null>(null);

  // The plan's first day, resolved in the PLAN's timezone. The field is free
  // text: an unfinished entry makes `Intl` throw, and the fallback keeps the
  // panel alive without changing the timezone that ships.
  const planWindow = React.useMemo(() => {
    let publishedOn: string;
    try {
      publishedOn = localDateIn(timezone);
    } catch {
      publishedOn = localDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
    }
    return planWindowUntilNextSession({
      publishedOn,
      // Matches the `week_starts_on` sent below. A different anchor day here
      // than in the payload would shift week 1 by up to six days.
      weekStartsOn: "mon",
      nextSessionDate: nextSession,
    });
  }, [timezone, nextSession]);
  const planWindowInvalid = planWindow.durationWeeks !== null &&
    planWindow.durationWeeks < 1;

  const accessToken = React.useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await callPlanTemplate<{ templates: TemplateRow[] }>(
        { action: "list" },
        await accessToken(),
      );
      setTemplates(res.templates);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  React.useEffect(() => {
    void refresh();
    loadVocabulary()
      .then(setVocabulary)
      .catch((err) => setVocabError(err instanceof Error ? err.message : String(err)));
  }, [refresh]);

  // Coach-only reference notes, server-side, over the lines being edited.
  React.useEffect(() => {
    if (lines.length === 0) {
      setFindings({});
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      reviewSafety(lines)
        .then((list) => {
          if (cancelled) return;
          const byId: Record<string, SafetyFinding> = {};
          list.forEach((f) => {
            const line = lines[f.index];
            if (line) byId[line.local_id] = f;
          });
          setFindings(byId);
        })
        .catch(() => {/* additive badge: a failed check shows nothing, never a green light */});
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lines]);

  /** Every mutation of the lines voids the approval it was given for. */
  const editLines = (next: (list: DraftCommitment[]) => DraftCommitment[]) => {
    setLines(next);
    setApprovedAt(null);
  };

  const open = (tpl: TemplateRow) => {
    setSelectedId(tpl.id);
    setDraft(tpl);
    setLines((tpl.commitments ?? []).map(toDraft));
    setEditingId(null);
    setSaveError(null);
    setSaved(false);
    setPublishNote(null);
    setApprovedAt(null);
  };

  const startNew = () => {
    setSelectedId(null);
    setDraft({
      id: "",
      coach_id: "",
      title: "",
      description: null,
      content_locale: "en-US",
      default_swap_policy: { class_equivalent: false, allowed_groups: null },
      default_autonomy: "strict",
      default_flex_allowance: 4,
      default_adherence_target_pct: 80,
      commitments: [],
      version: 1,
      status: "draft",
      created_at: "",
      updated_at: "",
    });
    setLines([]);
    setEditingId(null);
    setSaveError(null);
    setSaved(false);
  };

  const blocking = lines.filter((l) => validateDraft(l).length > 0);

  // THE TEMPLATE, IN THE COACH'S OWN SECTIONS. The same call the import review
  // and the student's day make — `voice: "coach"` only picks the word set
  // ("Food" rather than "What I eat"); the partition is identical.
  const structure = buildPlanStructure(lines, (line) => line, { voice: "coach" });

  /**
   * ONE LINE. The card is unchanged apart from its second row, which used to
   * print five raw tokens — `do · nutrition · dose · day · core`. That is the
   * storage triple and the enum set, in a place a coach reads: the same failure
   * `commitmentSentence` was written to end on the import screen. It now says
   * "With breakfast — 5000 IU", in the coach's own words, and the priority
   * travels beside it as the WORD.
   */
  const lineCard = (line: DraftCommitment) => {
    const issues = validateDraft(line);
    const finding = findings[line.local_id] ?? null;
    return (
      <div
        key={line.local_id}
        // A safety note no longer colours the row: it is a fact about the line,
        // not a defect in it. Only a blocking issue still frames the card.
        className={`rounded border p-2 text-sm ${
          issues.length > 0 ? "border-amber-400 bg-amber-50" : "border-gray-200"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => setEditingId((id) => (id === line.local_id ? null : line.local_id))}
          >
            <div className="font-medium text-gray-900">
              {line.title || <span className="text-gray-400">{t("review.untitled_line")}</span>}
            </div>
            <div className="mt-0.5 text-xs text-gray-500">{commitmentSentence(line)}</div>
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            <PriorityChip priority={line.priority} />
            <button
              type="button"
              onClick={() => editLines((l) => l.filter((x) => x.local_id !== line.local_id))}
              className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
            >
              {t("templates.delete")}
            </button>
          </div>
        </div>
        {finding && <SafetyNote finding={finding} />}
        {issues.length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-xs text-amber-900">
            {issues.map((issue, i) => <li key={i}>{issue}</li>)}
          </ul>
        )}
        {editingId === line.local_id && vocabulary && (
          <div className="mt-2 border-t border-gray-200 pt-2">
            <CommitmentEditor
              draft={line}
              vocabulary={vocabulary}
              onChange={(next) =>
                editLines((l) => l.map((x) => (x.local_id === line.local_id ? next : x)))}
            />
          </div>
        )}
      </div>
    );
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const payload = {
        title: draft.title,
        description: draft.description,
        content_locale: draft.content_locale,
        default_swap_policy: {
          class_equivalent: draft.default_swap_policy?.class_equivalent === true,
          allowed_groups: draft.default_swap_policy?.allowed_groups ?? null,
        },
        default_autonomy: draft.default_autonomy,
        default_flex_allowance: draft.default_flex_allowance,
        default_adherence_target_pct: draft.default_adherence_target_pct,
        status: draft.status,
        commitments: lines.map(toServerCommitment),
      };
      const res = await callPlanTemplate<{ template: TemplateRow }>(
        selectedId
          ? { action: "update", id: selectedId, ...payload }
          : { action: "create", ...payload },
        await accessToken(),
      );
      // Write-through: reopen on the row the server re-read, never on our payload.
      open(res.template);
      setSaved(true);
      await refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (tpl: TemplateRow) => {
    if (!globalThis.confirm(t("templates.delete_confirm"))) return;
    try {
      await callPlanTemplate({ action: "delete", id: tpl.id }, await accessToken());
      if (selectedId === tpl.id) {
        setSelectedId(null);
        setDraft(null);
        setLines([]);
      }
      await refresh();
    } catch (err) {
      // The server refuses to hard-delete anything that is not a draft: a
      // published plan_version still points here (ON DELETE SET NULL).
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  };

  const publish = async () => {
    if (!selectedId) return;
    setPublishing(true);
    setPublishNote(null);
    try {
      const token = await accessToken();
      const res = await fetch(`${FUNCTIONS_BASE}/plan-publish-v1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON_KEY,
          Authorization: `Bearer ${token ?? ANON_KEY}`,
        },
        body: JSON.stringify({
          student_id: studentId.trim(),
          // EXACTLY ONE of template_id / commitments (plan-publish-v1 contract).
          // From the library the answer is template_id: the whole point of this
          // table is that the student is a CLONE + diff of the template, not a
          // second copy of a line list posted from a browser.
          template_id: selectedId,
          plan: {
            title: draft?.title ?? "",
            content_locale: draft?.content_locale ?? "en-US",
            timezone,
            week_starts_on: "mon",
            // The calendar window `provision-day-v1` enforces: outside it the
            // student's day simply does not open. Sending it is what makes
            // "runs until our next session" a fact rather than an intention.
            anchor_week_start: planWindow.anchorWeekStart,
            duration_weeks: planWindow.durationWeeks,
          },
          approvals: approvedAt
            ? [{ section: "template_lines", approved_at: approvedAt }]
            : [],
        }),
      });
      const json = await res.json().catch(() => null);
      setPublishNote(
        res.ok
          ? t("templates.publish_result", {
            message: `plan_version ${
              (json as { plan_version?: { id?: string } } | null)?.plan_version?.id ?? "?"
            }`,
          })
          : `HTTP ${res.status} — ${JSON.stringify(json)}`,
      );
    } catch (err) {
      setPublishNote(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  };

  const setDraftField = <K extends keyof TemplateRow>(key: K, value: TemplateRow[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  return (
    <KeelAppShell
      variant="coach"
      width="wide"
      title={t("templates.title")}
      subtitle={t("templates.subtitle")}
      actions={
        <Button variant="primary" onClick={startNew}>
          {t("templates.new")}
        </Button>
      }
    >
      {vocabError && (
        <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-700">
          {t("editor.vocabulary_error", { message: vocabError })}
        </p>
      )}
      {loadError && (
        <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-700">
          {t("templates.error", { message: loadError })}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* LEFT — the library */}
        <section className="space-y-2">
          {loading && <p className="text-sm text-gray-500">{t("templates.loading")}</p>}
          {!loading && templates.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-400">
              {t("templates.empty")}
            </p>
          )}
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className={`rounded-xl border p-3 ${
                selectedId === tpl.id ? "border-gray-900 bg-white" : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <button type="button" className="min-w-0 text-left" onClick={() => open(tpl)}>
                  <div className="truncate text-sm font-medium text-gray-900">{tpl.title}</div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {t("templates.commitment_count", {
                      count: (tpl.commitments ?? []).length,
                    })}
                    {" · "}
                    {t("templates.updated", {
                      date: new Date(tpl.updated_at).toISOString().slice(0, 10),
                    })}
                  </div>
                </button>
                <Badge
                  tone={STATUS_TONE[tpl.status] ?? "neutral"}
                  className="shrink-0"
                >
                  {t(
                    (STATUS_LABEL[tpl.status] ?? "templates.status_draft") as
                      Parameters<typeof t>[0],
                  )}
                </Badge>
              </div>
              <div className="mt-2 flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => open(tpl)}
                  className="rounded border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-50"
                >
                  {t("templates.open")}
                </button>
                {tpl.status === "draft" && (
                  <button
                    type="button"
                    onClick={() => remove(tpl)}
                    className="rounded border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50"
                  >
                    {t("templates.delete")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>

        {/* RIGHT — the editor */}
        <section>
          {!draft && (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-400">
              {t("templates.select_hint")}
            </p>
          )}
          {draft && (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {t("templates.field_title")}
                  </span>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    value={draft.title}
                    onChange={(e) => setDraftField("title", e.target.value)}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {t("templates.field_description")}
                  </span>
                  <textarea
                    className="h-16 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    value={draft.description ?? ""}
                    onChange={(e) =>
                      setDraftField("description", e.target.value === "" ? null : e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {t("templates.field_locale")}
                  </span>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-sm"
                    value={draft.content_locale}
                    onChange={(e) => setDraftField("content_locale", e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {t("templates.field_status")}
                  </span>
                  {/* The VALUE stays the token — it is what Postgres stores.
                      What the coach reads is the word, from the same map the
                      badge in the list uses (R1: tokens are data, not copy). */}
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    value={draft.status}
                    onChange={(e) => setDraftField("status", e.target.value)}
                  >
                    {["draft", "active", "archived"].map((s) => (
                      <option key={s} value={s}>
                        {t((STATUS_LABEL[s] ?? "templates.status_draft") as Parameters<typeof t>[0])}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {t("templates.field_autonomy")}
                  </span>
                  {/* The VALUE stays the token — it is what travels to the
                      server — but what the coach reads is English. This select
                      printed `swap_within_policy` raw, in a monospaced box, and
                      it was the last storage slug visible on the three plan
                      screens. `autonomyLabel` throws on a value the seed has no
                      word for (R7), so the next one added cannot leak. */}
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    value={draft.default_autonomy}
                    onChange={(e) => setDraftField("default_autonomy", e.target.value)}
                  >
                    {(vocabulary?.enums.autonomy ?? [draft.default_autonomy]).map((a) => (
                      <option key={a} value={a}>{autonomyLabel(a)}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {t("templates.field_flex")}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={7}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    value={draft.default_flex_allowance}
                    onChange={(e) =>
                      setDraftField("default_flex_allowance", Number(e.target.value))}
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {t("templates.field_target")}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    value={draft.default_adherence_target_pct}
                    onChange={(e) =>
                      setDraftField("default_adherence_target_pct", Number(e.target.value))}
                  />
                </label>
              </div>

              {/* default_swap_policy — ticked ONCE, at template level. */}
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-gray-800">
                  {t("templates.swap_title")}
                </h3>
                <p className="mb-2 mt-0.5 text-xs text-gray-500">{t("templates.swap_hint")}</p>
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={draft.default_swap_policy?.class_equivalent === true}
                    onChange={(e) =>
                      setDraftField("default_swap_policy", {
                        ...(draft.default_swap_policy ?? {}),
                        class_equivalent: e.target.checked,
                      })}
                  />
                  <span>{t("templates.swap_class_equivalent")}</span>
                </label>
                <div className="mt-3">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {t("templates.swap_allowed_groups")}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {(vocabulary?.food_groups ?? []).map((g) => {
                      const selected = draft.default_swap_policy?.allowed_groups ?? [];
                      const on = selected.includes(g.slug);
                      return (
                        <button
                          key={g.slug}
                          type="button"
                          title={g.class}
                          onClick={() => {
                            const next = on
                              ? selected.filter((s) => s !== g.slug)
                              : [...selected, g.slug];
                            setDraftField("default_swap_policy", {
                              ...(draft.default_swap_policy ?? {}),
                              allowed_groups: next.length === 0 ? null : next,
                            });
                          }}
                          className={`rounded px-2 py-1 text-[11px] ${
                            on
                              ? "bg-gray-900 text-white"
                              : "border border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
                          }`}
                        >
                          {/* The slug is the VALUE the policy stores; "oily
                              fish" is what the coach picks. Printing
                              `fatty_fish` at a coach was the same raw-token
                              leak the line cards had. */}
                          {foodGroupLabel(g.slug)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* THE LINES, IN THE SHAPE OF A PLAN — the import screen's
                  sections, from the import screen's module. */}
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="mb-3 flex items-baseline gap-2 text-sm font-semibold text-gray-800">
                  {t("templates.commitments_section")}
                  {/* THE HEADLINE IS "THINGS TO HOLD", NOT "ROWS ON SCREEN".
                      A weigh-in and an energy rating are watched, never held;
                      the import screen already counts them apart and this one
                      must agree, or the same template reads as two sizes. */}
                  <span className="rounded bg-gray-100 px-1.5 text-xs font-normal tabular-nums text-gray-600">
                    {structure.toHold}
                  </span>
                  {structure.observed > 0 && (
                    <span className="text-[11px] font-normal text-gray-400">
                      {t("import.stat_observed", { count: structure.observed })}
                    </span>
                  )}
                </h3>
                <div className="space-y-4">
                  {structure.sections.map((section) => (
                    <TemplateSection key={section.part} section={section}>
                      {section.subsections.length > 0
                        ? section.subsections.map((subsection) => (
                          <TemplateSubgroup key={subsection.key} subsection={subsection}>
                            {subsection.lines.map((line) => lineCard(line))}
                          </TemplateSubgroup>
                        ))
                        : (
                          <div className="space-y-1">
                            {section.lines.map((line) => lineCard(line))}
                          </div>
                        )}
                    </TemplateSection>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const line = blankCommitment({
                      content_locale: draft.content_locale,
                      template_commitment_key: suggestTemplateKey("", lines.length),
                    });
                    editLines((l) => [...l, line]);
                    setEditingId(line.local_id);
                  }}
                  className="mt-2 w-full rounded border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  + {t("review.add_line")}
                </button>
              </div>

              {/* Save + publish */}
              <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-4">
                {blocking.length > 0 && (
                  <p className="rounded bg-amber-100 p-2 text-xs text-amber-900">
                    {t("review.blocked_by_issues", { count: blocking.length })}
                  </p>
                )}
                <button
                  type="button"
                  disabled={saving || blocking.length > 0}
                  onClick={save}
                  className="w-full rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
                >
                  {saving ? t("templates.saving") : t("templates.save")}
                </button>
                {saveError && (
                  <p className="break-words rounded bg-red-50 p-2 text-xs text-red-700">
                    {t("review.save_error", { message: saveError })}
                  </p>
                )}
                {saved && (
                  <p className="rounded bg-emerald-50 p-2 text-xs text-emerald-800">
                    {t("templates.saved")}
                  </p>
                )}

                <p className="pt-2 text-xs text-gray-500">{t("templates.publish_hint")}</p>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {t("templates.student_id_label")}
                  </span>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {t("templates.timezone_label")}
                  </span>
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                  />
                  <span className="mt-0.5 block text-[11px] text-gray-400">
                    {t("templates.timezone_hint")}
                  </span>
                </label>

                {/* HOW LONG IT RUNS — a date, not two database columns. */}
                <div className="rounded border border-gray-200 bg-white p-2">
                  <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {t("templates.next_session_label")}
                  </span>
                  {nextSession === null
                    ? (
                      <button
                        type="button"
                        className="text-xs text-gray-700 underline"
                        onClick={() =>
                          setNextSession(
                            addDays(
                              localDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone),
                              28,
                            ),
                          )}
                      >
                        {t("templates.next_session_open")}
                      </button>
                    )
                    : (
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                          value={nextSession}
                          onChange={(e) => setNextSession(e.target.value || null)}
                        />
                        <button
                          type="button"
                          className="text-[11px] text-gray-400 underline"
                          onClick={() => setNextSession(null)}
                        >
                          {t("templates.next_session_clear")}
                        </button>
                      </div>
                    )}
                  <span className="mt-1 block text-[11px] text-gray-400">
                    {t("templates.next_session_hint")}
                  </span>
                  {/* The conversion, read back before publish. */}
                  <span className="mt-1 block text-[11px] text-gray-600">
                    {planWindow.durationWeeks === null
                      ? t("templates.plan_window_open_ended", {
                        anchor: planWindow.anchorWeekStart,
                      })
                      : planWindowInvalid
                      ? t("templates.plan_window_invalid")
                      : t("templates.plan_window_readout", {
                        anchor: planWindow.anchorWeekStart,
                        weeks: planWindow.durationWeeks,
                        session: nextSession ?? "",
                      })}
                  </span>
                </div>

                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={approvedAt !== null}
                    onChange={(e) =>
                      setApprovedAt(e.target.checked ? new Date().toISOString() : null)}
                  />
                  <span>
                    {t("templates.approve_lines")}
                    <span className="block text-xs text-gray-400">
                      {t("review.approval_hint")}
                    </span>
                  </span>
                </label>
                <button
                  type="button"
                  disabled={publishing || !selectedId || studentId.trim() === "" ||
                    blocking.length > 0 || approvedAt === null}
                  onClick={publish}
                  className="w-full rounded border border-gray-900 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100 disabled:opacity-40"
                >
                  {publishing ? t("templates.publishing") : t("templates.publish")}
                </button>
                {publishNote && (
                  <p className="break-words rounded bg-gray-100 p-2 text-xs text-gray-600">
                    {publishNote}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </KeelAppShell>
  );
}
