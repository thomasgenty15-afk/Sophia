import React from "react";
import { t } from "../i18n/t";
import { supabase } from "../../lib/supabase";
import {
  type CoachQuestion,
  commitmentQuestions,
  commitmentSentence,
  gapQuestion,
  priorityLabel,
  slotLabel,
} from "../api/labels";
import { buildPlanStructure, type PlanSection } from "../api/planStructure";
import { addDays, localDateIn } from "../api/dates";
import { planWindowUntilNextSession } from "../api/todayModel";
import { ActivityChip } from "../components/CommitmentLine";
import { KeelAppShell } from "../components/KeelAppShell";
import {
  blankCommitment,
  callPlanTemplate,
  CommitmentEditor,
  type DraftCommitment,
  type KeelVocabulary,
  loadVocabulary,
  reviewSafety,
  suggestTemplateKey,
  SafetyNote,
  type SafetyFinding,
  toServerCommitment,
  validateDraft,
} from "../components/CommitmentEditor";

// KEEL — coach plan import & FULL review screen (W6.3).
//
// Left: the coach's document (pasted text or uploaded PDF/photo), then the
// save/publish column. Right: the extracted plan split into the two queues
// that are the whole point of this screen:
//
//   "To verify"   — lines the extraction is unsure about (needs_review). The
//                   coach's time goes to the uncertain 10 %, not to re-reading
//                   the plan.
//   "To complete" — the HOLES the parse found. Each one is a PROPOSAL the coach
//                   accepts, edits or deletes at the keyboard. The coach fills
//                   their own gaps; they do not receive a generation, and they
//                   stay the prescriber — nothing reaches a student without
//                   their click.
//
//   "Ready"       — everything that parsed cleanly, and the only queue that is
//                   the PLAN rather than a triage state. It is therefore read
//                   on the plan's own axis and not as a list: FOOD (what the
//                   client eats) and ACTIONS (what the client does), each with
//                   its own title and its own count, plus a quiet block for the
//                   lines that are only watched. See `PartSection`.
//
// Doctrine (docs/keel/CONTRACT.md): the AI transcribes, never authors. A gap
// line is born `auto_generated=true, priority='secondary'` — the trace that it
// did not come from the document survives into `plan_commitments` — and an
// UNACCEPTED proposal is never saved.
//
// Persistence: this screen writes a TEMPLATE (`plan_templates`, through
// plan-template-v1). Publishing a version to one student goes through
// plan-publish-v1, which owns the clone + diff + supersede transaction.

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

interface ImportCommitment {
  template_commitment_key?: string | null;
  title: string;
  polarity: string;
  activity_class: string;
  anchor_kind: string;
  slot_key: string | null;
  clock_local: string | null;
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
  evaluation_grain: string;
  priority: string;
  scheduled_days: string[] | null;
  required_days_per_week: number | null;
  expected_occasions_per_day: number | null;
  confidence: number;
  needs_review: boolean;
  validation_issues: string[];
  source_span?: { quote?: string } | null;
}

interface ImportResult {
  request_id: string;
  content_locale?: string;
  summary: {
    commitments: number;
    needs_review: number;
    gaps: number;
    unparsed_spans: number;
  };
  commitments: ImportCommitment[];
  gaps: Array<{ description: string; suggested?: boolean; priority?: string }>;
  unparsed_spans: string[];
}

// ---------------------------------------------------------------------------
// Import payload -> editable drafts
// ---------------------------------------------------------------------------

/**
 * The parse fills what it read and NOTHING else: every field the extractor did
 * not produce keeps the SQL default from `blankCommitment`. No inference, no
 * padding — a missing cadence stays missing, surfaces as a blocking issue, and
 * that is exactly what the "to verify" queue is for.
 *
 * The CADENCE columns (`required_days_per_week`, `expected_occasions_per_day`)
 * and the CLOCK columns are carried through even though the review screen used
 * to drop them. Dropping them was not neutral: "legumes 3 times a week — and I
 * mean three different days" arrived as `required_days_per_week: 3` and was
 * silently replaced by the SQL default, so the screen could only ever say
 * "each week" about a line whose whole point was the three days. A line the
 * coach cannot read back correctly is a line they cannot approve.
 *
 * The TEMPLATE KEY is the extractor's when it sends one. `suggestTemplateKey`
 * derives its fallback from the title, and a title that starts with a digit
 * ("10 minutes of daylight...") derives a key that starts with a digit — which
 * `plan_commitments` refuses (R1: ASCII snake_case starting with a letter).
 * That produced a line blocking the save over a machine key the coach must
 * never even be told exists. The fallback stays for a line typed by hand.
 */
function letterInitialKey(key: string, index: number): string {
  // Belt for the same class of bug from either side (ours or the extractor's):
  // a key that cannot start a valid identifier gets a prefix rather than
  // becoming an unanswerable blocking issue on the coach's screen.
  return /^[a-z]/.test(key) ? key : `line_${index + 1}_${key}`;
}

function fromImport(
  c: ImportCommitment,
  locale: string,
  index: number,
): DraftCommitment {
  return blankCommitment({
    template_commitment_key: letterInitialKey(
      c.template_commitment_key ?? suggestTemplateKey(c.title, index),
      index,
    ),
    title: c.title,
    content_locale: locale,
    polarity: c.polarity,
    activity_class: c.activity_class,
    anchor_kind: c.anchor_kind,
    slot_key: c.slot_key,
    clock_local: c.clock_local ?? null,
    window_start_local: c.window_start_local ?? null,
    window_end_local: c.window_end_local ?? null,
    measure: c.measure,
    unit: c.unit,
    target_op: c.target_op,
    target_min: c.target_min,
    target_max: c.target_max,
    substance_ref: c.substance_ref,
    food_group_ref: c.food_group_ref,
    evidence_kind: c.evidence_kind,
    evaluation_grain: c.evaluation_grain,
    priority: c.priority,
    scheduled_days: c.scheduled_days,
    required_days_per_week: c.required_days_per_week ?? null,
    expected_occasions_per_day: c.expected_occasions_per_day ?? 1,
    source_span: (c.source_span ?? null) as Record<string, unknown> | null,
    needs_review: c.needs_review,
    extraction_confidence: c.confidence,
    extraction_issues: c.validation_issues ?? [],
  });
}

/** A gap becomes ONE proposed line, marked as such in the schema itself. */
function fromGap(
  gap: { description: string; priority?: string },
  locale: string,
  index: number,
): DraftCommitment {
  return blankCommitment({
    template_commitment_key: suggestTemplateKey(gap.description, index),
    title: gap.description,
    content_locale: locale,
    auto_generated: true,
    priority: gap.priority ?? "secondary",
  });
}

// ---------------------------------------------------------------------------
// Line card
// ---------------------------------------------------------------------------

// The priority is a COACH DECISION (which lines carry the block), so it stays
// on the card — as the word, never the token. The extraction confidence that
// used to sit beside it is gone: "core 98%" told the coach nothing they could
// act on and invited them to distrust the other 98 % of the screen. What they
// need to know about a line they cannot trust is WHICH QUESTION it raises, and
// that is what the card now says.
const PRIORITY_STYLE: Record<string, string> = {
  core: "bg-gray-100 text-gray-700",
  secondary: "bg-sky-50 text-sky-800",
  optional: "bg-gray-50 text-gray-500",
};

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

function sourceQuote(draft: DraftCommitment): string | null {
  const quote = (draft.source_span as { quote?: string } | null)?.quote;
  return typeof quote === "string" && quote.trim() !== "" ? quote : null;
}

/**
 * ONE QUESTION, and the control that answers it.
 *
 * The slot picker is here rather than in the full editor because "when in the
 * day?" is the one blocking question a coach can answer without opening
 * anything — and because the six-axis editor is exactly the vocabulary this
 * screen is trying to stop showing them. Choosing a moment writes the anchor
 * AND clears the columns the anchor forbids, so answering the question really
 * clears it instead of trading it for another one.
 */
function QuestionRow({
  question,
  draft,
  vocabulary,
  onChange,
}: {
  question: CoachQuestion;
  draft: DraftCommitment;
  vocabulary: KeelVocabulary | null;
  onChange: (next: DraftCommitment) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-amber-900">{question.question}</span>
      {question.fix === "slot" && vocabulary && (
        <select
          className="rounded border border-amber-300 bg-white px-2 py-1 text-xs text-gray-900"
          value={draft.anchor_kind === "slot" ? draft.slot_key ?? "" : ""}
          onChange={(e) => {
            const slot = e.target.value;
            if (slot === "") return;
            onChange({
              ...draft,
              anchor_kind: "slot",
              slot_key: slot,
              clock_local: null,
              tolerance_minutes: null,
              // 'any_meal' is by definition not a nominal slot
              // (plan_commitments_nominal_slot_check): answering the question
              // must not create the next violation.
              slot_kind: slot === "any_meal" && draft.slot_kind === "nominal"
                ? "opportunistic"
                : draft.slot_kind,
            });
          }}
        >
          <option value="">{t("question.slot_placeholder")}</option>
          {vocabulary.slot_vocabulary.map((s) => (
            <option key={s.key} value={s.key}>{slotLabel(s.key)}</option>
          ))}
        </select>
      )}
    </div>
  );
}

/**
 * ONE LINE OF THE IMPORTED PLAN.
 *
 * The card has two weights, and which one it takes is the whole point of the
 * screen. A line that parsed cleanly is a QUIET ROW: the coach's own sentence,
 * read in one pass, controls hidden until they reach for it. A line that needs
 * a decision — a supplement over its upper limit, an unanswerable question, a
 * proposal — becomes a bordered card that states the decision. Before this,
 * eighteen lines had identical visual weight and the three that mattered were
 * indistinguishable from the fifteen that did not.
 */
function CommitmentCard({
  draft,
  vocabulary,
  finding,
  editing,
  focused,
  proposal,
  onChange,
  onToggleEdit,
  onAccept,
  onDelete,
  onFocus,
}: {
  draft: DraftCommitment;
  vocabulary: KeelVocabulary | null;
  finding: SafetyFinding | null;
  editing: boolean;
  focused: boolean;
  proposal: boolean;
  onChange: (next: DraftCommitment) => void;
  onToggleEdit: () => void;
  onAccept?: () => void;
  onDelete: () => void;
  onFocus: () => void;
}) {
  const issues = validateDraft(draft);
  const questions = commitmentQuestions(issues);
  // What "needs the coach" means, exactly. Everything else is reading.
  //
  // A safety note is NOT in this list, deliberately. Since the provenance gate
  // was removed, a UL or an interaction is a fact the coach reads, not a
  // decision they owe us — putting it back here would rebuild the gate out of
  // attention instead of code.
  const needsDecision = questions.length > 0 || proposal;

  // A proposal has no prescription yet — it is a question about a hole in the
  // document, so it shows the document's words, not a sentence we composed
  // out of the blank defaults it was born with.
  const heading = proposal
    ? gapQuestion(draft.title)
    : draft.title.trim() === ""
    ? t("review.untitled_line")
    : draft.title;
  const sentence = proposal ? null : commitmentSentence(draft);
  const quote = sourceQuote(draft);

  const frame = questions.length > 0
    ? "border-l-4 border-l-amber-400 border-y border-r border-gray-200 bg-white p-3"
    : proposal
    ? "border border-dashed border-sky-300 bg-sky-50/50 p-3"
    : "border border-transparent px-2 py-1.5 hover:border-gray-200 hover:bg-gray-50/80 focus-within:border-gray-200";

  const actionsHidden = !needsDecision && !editing;

  return (
    <div
      tabIndex={0}
      onFocus={onFocus}
      onKeyDown={(e) => {
        // Keyboard triage on the focused line: a / e / del. Ignored while a
        // form control has focus, so typing "e" in the title never deletes.
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (e.key === "a" && onAccept) {
          e.preventDefault();
          onAccept();
        }
        if (e.key === "e") {
          e.preventDefault();
          onToggleEdit();
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          onDelete();
        }
      }}
      className={`group rounded-lg text-sm outline-none ${frame} ${
        focused ? "ring-2 ring-gray-900/15" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onToggleEdit}>
          <div className={needsDecision ? "font-medium text-gray-900" : "text-gray-900"}>
            {heading}
          </div>
          {/* The coach's own line, in the coach's own words. */}
          {sentence !== null && (
            <div className="mt-0.5 text-xs text-gray-500">{sentence}</div>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {proposal && (
            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">
              {t("review.auto_generated")}
            </span>
          )}
          <PriorityChip priority={draft.priority} />
        </div>
      </div>

      {/* WHAT THE DOCUMENT SAID — the evidence behind a proposal. */}
      {proposal && (
        <div className="mt-2 rounded border border-sky-200 bg-white/70 p-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
            {t("review.gap_source")}
          </div>
          <p className="mt-0.5 text-xs text-gray-700">{draft.title}</p>
        </div>
      )}

      {/* THE QUESTIONS. Never a constraint name — see api/labels.ts. */}
      {questions.length > 0 && (
        <div className="mt-2 space-y-1.5 rounded border border-amber-200 bg-amber-50 p-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            {t("question.section")}
          </div>
          {questions.map((q) => (
            <QuestionRow
              key={q.family}
              question={q}
              draft={draft}
              vocabulary={vocabulary}
              onChange={onChange}
            />
          ))}
        </div>
      )}

      {/* Reference facts for the coach. Rendered from the server's finding,
          untouched, and carrying nothing to answer. */}
      {finding && <SafetyNote finding={finding} />}

      {/* Traceability, kept for the lines that are being decided on and for
          the one the coach opened. On a quiet row it is noise between two
          sentences they can already read.

          `needs_review` is in the list because of what the queue asks for. "To
          verify" means "check this against the document" — and the line was
          showing the coach our two sentences and nothing to check them against,
          so the only way to answer was to go back and re-read the plan, which
          is the exact work this screen exists to remove. */}
      {quote !== null && (needsDecision || editing || draft.needs_review) && !proposal && (
        <blockquote className="mt-2 border-l-2 border-gray-200 pl-2 text-xs italic text-gray-500">
          “{quote}”
        </blockquote>
      )}

      <div
        className={`flex flex-wrap items-center gap-2 text-xs ${
          needsDecision || editing ? "mt-2 border-t border-gray-200/70 pt-2" : ""
        } ${
          actionsHidden
            ? "pointer-events-none h-0 overflow-hidden opacity-0 group-hover:pointer-events-auto group-hover:mt-2 group-hover:h-auto group-hover:overflow-visible group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:mt-2 group-focus-within:h-auto group-focus-within:overflow-visible group-focus-within:opacity-100"
            : ""
        }`}
      >
        {onAccept && (
          <button
            type="button"
            onClick={onAccept}
            className="rounded bg-gray-900 px-2 py-1 font-medium text-white hover:bg-gray-700"
          >
            {proposal ? t("review.gap_add") : t("review.accept")}{" "}
            <kbd className="opacity-60">a</kbd>
          </button>
        )}
        <button
          type="button"
          onClick={onToggleEdit}
          className="rounded border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-50"
        >
          {editing ? t("review.done_editing") : t("review.edit")}{" "}
          <kbd className="opacity-60">e</kbd>
        </button>
        {draft.needs_review && !editing && (
          <button
            type="button"
            onClick={() => onChange({ ...draft, needs_review: false })}
            className="rounded border border-emerald-300 px-2 py-1 text-emerald-700 hover:bg-emerald-50"
          >
            {t("review.mark_verified")}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto rounded border border-gray-300 px-2 py-1 text-gray-600 hover:bg-gray-50"
        >
          {proposal ? t("review.gap_ignore") : t("review.delete")}{" "}
          <kbd className="opacity-60">del</kbd>
        </button>
      </div>

      {editing && vocabulary && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          {/* OUR diagnostics, not the coach's decision: they live inside the
              editor, where someone has already decided to look under the hood. */}
          {draft.extraction_issues.length > 0 && (
            <div className="mb-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {t("review.extraction_notes")}
              </div>
              <ul className="mt-0.5 list-disc pl-4 text-xs text-gray-500">
                {draft.extraction_issues.map((issue, i) => <li key={i}>{issue}</li>)}
              </ul>
            </div>
          )}
          <CommitmentEditor draft={draft} vocabulary={vocabulary} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

/**
 * A queue, with its OWN timestamped approval.
 *
 * plan-publish-v1 refuses to publish without at least one `SectionApproval`,
 * and it writes each one to `coach_access_events`: "the coach is the prescriber
 * and the approval click is the regulatory trace". So the timestamp sent is the
 * moment of THIS click — never a `new Date()` minted at publish time, which
 * would attest an approval that never happened.
 */
function Queue({
  title,
  hint,
  children,
  count,
  tone,
  approvedAt,
  onApprove,
  approvable = true,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
  count: number;
  tone: "amber" | "sky" | "gray";
  approvedAt: string | null;
  onApprove: () => void;
  approvable?: boolean;
}) {
  const dot = tone === "amber" ? "bg-amber-500" : tone === "sky" ? "bg-sky-500" : "bg-gray-400";
  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {title}
        <span className="rounded bg-gray-100 px-1.5 text-xs font-normal tabular-nums text-gray-600">
          {count}
        </span>
        {approvable && count > 0 && (
          approvedAt
            ? (
              <span className="ml-auto rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                {t("review.approved_section", {
                  time: new Date(approvedAt).toLocaleTimeString(),
                })}
              </span>
            )
            : (
              <button
                type="button"
                onClick={onApprove}
                className="ml-auto rounded border border-gray-900 px-2 py-0.5 text-[11px] font-medium text-gray-900 hover:bg-gray-100"
              >
                {t("review.approve_section")}
              </button>
            )
        )}
      </h3>
      <p className="mb-2 mt-0.5 text-xs text-gray-500">{hint}</p>
      {count === 0
        ? (
          <p className="rounded border border-dashed border-gray-200 p-3 text-center text-xs text-gray-400">
            {t("review.queue_empty")}
          </p>
        )
        : <div className="space-y-2">{children}</div>}
    </section>
  );
}

/**
 * ONE PART OF THE PLAN — "Food", "Actions", and what is only watched.
 *
 * THE PROBLEM THIS SOLVES. A queue is a TRIAGE STATE ("this one still needs
 * you"), and triage is the right axis while the coach is deciding. It is the
 * wrong axis once they are done: "Ready — 18" was one flat column in which a
 * magnesium, a bedtime, two servings of vegetables and a weekly weigh-in had
 * identical weight. The coach's own document had six headings; the screen gave
 * back a list, and the first dietitian who read it said it was not clear.
 *
 * So inside the ready queue the plan is read on its OWN axis, the one the coach
 * already thinks in — what the client EATS, what the client DOES — with its own
 * title and its own count on each side. The SHAPE is not decided here: it comes
 * from `api/planStructure.ts`, which the student's day and the template editor
 * also read, so the same eighteen lines cannot come out under three different
 * sets of headings. This component only paints what that value says.
 *
 * The observations block is a footnote rather than a third pillar: a weigh-in
 * and an energy rating are not things to hold, and giving them a framed section
 * would put them in the count of the things that are.
 */
function PartSection({
  section,
  children,
}: {
  section: PlanSection<DraftCommitment>;
  children: React.ReactNode;
}) {
  const { part, count } = section;
  // An empty part is not "0 lines", it is a part this plan does not have. A
  // coach whose document has no movement in it should not be shown an
  // "Actions — 0" heading and left wondering what they forgot.
  //
  // `buildPlanStructure` already drops the empty parts, so this is a belt: a
  // caller that builds a section by hand cannot slip an empty heading through.
  if (count === 0) return null;

  // QUIET IS A PROPERTY OF THE PART, NOT A CHOICE OF THIS SCREEN. Observations
  // are a footnote wherever they are read — the student's day makes the same
  // call — so the flag is derived from the part rather than passed in, and the
  // two screens cannot end up disagreeing about which block is loud.
  if (part === "observations") {
    return (
      <section className="rounded-lg border border-dashed border-gray-200 bg-gray-50/70 p-3">
        <h4 className="flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {section.label}
          <span className="rounded bg-gray-200/70 px-1.5 text-[11px] font-normal tabular-nums text-gray-600">
            {count}
          </span>
        </h4>
        <p className="mb-2 mt-0.5 text-[11px] text-gray-500">{section.hint}</p>
        <div className="space-y-1">{children}</div>
      </section>
    );
  }

  const tone = part === "food"
    ? "border-lime-300"
    : part === "unsorted"
    ? "border-amber-300"
    : "border-orange-300";
  const head = part === "food"
    ? "border-lime-200 bg-lime-50 text-lime-900"
    : part === "unsorted"
    ? "border-amber-200 bg-amber-50 text-amber-900"
    : "border-orange-200 bg-orange-50 text-orange-900";

  return (
    <section className={`overflow-hidden rounded-lg border ${tone} bg-white`}>
      <header className={`border-b px-3 py-2 ${head}`}>
        <h4 className="flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wide">
          {section.label}
          <span className="rounded bg-white/70 px-1.5 text-xs font-normal tabular-nums">
            {count}
          </span>
        </h4>
        <p className="mt-0.5 text-[11px] font-normal normal-case opacity-80">
          {section.hint}
        </p>
      </header>
      <div className="space-y-4 p-3">{children}</div>
    </section>
  );
}

/**
 * A sub-group inside FOOD, headed by the coach's own word.
 *
 * "Every day", "What we are cutting" — never "day grain" and never
 * `evaluation_grain`. The count is there because it is the number the coach
 * checks against their document: four daily rules, two weekly targets.
 */
function PartSubgroup({
  label,
  count,
  children,
}: {
  label: React.ReactNode;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        {typeof label === "string"
          ? (
            <h5 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {label}
            </h5>
          )
          : label}
        <span className="text-[11px] tabular-nums text-gray-400">{count}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function PlanImportPage() {
  const [rawText, setRawText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);

  const [drafts, setDrafts] = React.useState<DraftCommitment[]>([]);
  const [acceptedIds, setAcceptedIds] = React.useState<Set<string>>(new Set());
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [focusedId, setFocusedId] = React.useState<string | null>(null);

  const [vocabulary, setVocabulary] = React.useState<KeelVocabulary | null>(null);
  const [vocabError, setVocabError] = React.useState<string | null>(null);
  const [findings, setFindings] = React.useState<Record<string, SafetyFinding>>({});
  const [safetyBusy, setSafetyBusy] = React.useState(false);

  const [templateTitle, setTemplateTitle] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [savedTemplate, setSavedTemplate] = React.useState<{ id: string; title: string } | null>(
    null,
  );
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [studentId, setStudentId] = React.useState("");
  const [timezone, setTimezone] = React.useState(
    // The day boundary is a PLAN property (plan_versions.timezone). Defaulting
    // to the browser's zone is a convenience for the common case, never a
    // silent claim about where the student lives — the field is visible and
    // editable right next to the publish button.
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  // HOW LONG THE PLAN RUNS (E2). The coach names a DATE — the next session —
  // and this screen converts it to the pair `plan_versions` actually stores
  // (`anchor_week_start`, `duration_weeks`), showing the conversion back before
  // publish. Default: four weeks out, the ordinary gap between two sessions;
  // the coach sees that default and the window it produces, so it is a proposal
  // rather than a silent policy.
  const [nextSession, setNextSession] = React.useState<string | null>(
    () => addDays(localDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone), 28),
  );
  const [publishNote, setPublishNote] = React.useState<string | null>(null);
  const [publishing, setPublishing] = React.useState(false);
  // R1: the section names are ASCII snake_case tokens — plan-publish-v1
  // validates them as such before writing them to coach_access_events.
  const [approvals, setApprovals] = React.useState<Record<string, string>>({});

  // The plan's first day is resolved in the PLAN's timezone, not the coach's.
  // The field is free text, so an unfinished entry ("Europe/") makes `Intl`
  // throw; falling back to the browser keeps the panel alive, and the timezone
  // that ships is still the one in the field.
  const planWindow = React.useMemo(() => {
    let publishedOn: string;
    try {
      publishedOn = localDateIn(timezone);
    } catch {
      publishedOn = localDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
    }
    return planWindowUntilNextSession({
      publishedOn,
      // Both publish screens send `week_starts_on: "mon"`; reading the literal
      // from one place would be better, but sending a different anchor day
      // here than in the payload is the bug worth preventing first.
      weekStartsOn: "mon",
      nextSessionDate: nextSession,
    });
  }, [timezone, nextSession]);
  const planWindowInvalid = planWindow.durationWeeks !== null &&
    planWindow.durationWeeks < 1;

  // R7 at the boundary: if the vocabularies cannot be loaded, NO selector can
  // be trusted, so the failure is shown rather than an editor of empty menus.
  React.useEffect(() => {
    loadVocabulary()
      .then(setVocabulary)
      .catch((err) => setVocabError(err instanceof Error ? err.message : String(err)));
  }, []);

  // The reference notes are computed on the SERVER over the current drafts,
  // debounced. Recomputed on every edit: changing the dose or the unit changes
  // which facts apply, and a stale note is worse than none.
  React.useEffect(() => {
    if (drafts.length === 0) {
      setFindings({});
      return;
    }
    let cancelled = false;
    setSafetyBusy(true);
    const timer = setTimeout(() => {
      reviewSafety(drafts)
        .then((list) => {
          if (cancelled) return;
          const byId: Record<string, SafetyFinding> = {};
          list.forEach((f) => {
            const draft = drafts[f.index];
            if (draft) byId[draft.local_id] = f;
          });
          setFindings(byId);
        })
        .catch(() => {
          // The badge is additive: a failed check never blocks the screen. It
          // also never turns into a green light — nothing is shown at all.
        })
        .finally(() => {
          if (!cancelled) setSafetyBusy(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [drafts]);

  const runImport = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSavedTemplate(null);
    setSaveError(null);
    try {
      let body: Record<string, unknown>;
      if (file) {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        }
        body = { media: { mime_type: file.type, base64: btoa(bin) } };
      } else {
        body = { raw_text: rawText };
      }
      const res = await fetch(`${FUNCTIONS_BASE}/plan-import-v1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(String(json?.error ?? `HTTP ${res.status}`));
      const parsed = json as ImportResult;
      const locale = parsed.content_locale ?? "en-US";
      setResult(parsed);
      const offset = parsed.commitments.length;
      setDrafts([
        ...parsed.commitments.map((c, i) => fromImport(c, locale, i)),
        ...parsed.gaps.map((g, i) => fromGap(g, locale, offset + i)),
      ]);
      setAcceptedIds(new Set());
      // A new document is a new prescription: every previous approval is void.
      setApprovals({});
      setTemplateTitle((prev) => prev || (file?.name ?? "Imported plan"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  /**
   * ANY change to the lines voids EVERY approval. An approval attests to what
   * was on screen when it was clicked; carrying it across an edit would make
   * the `coach_access_events` trace attest to something the coach never saw.
   * Cheap to re-click, impossible to reconstruct after the fact.
   */
  const voidApprovals = () => setApprovals({});

  const patch = (localId: string, next: DraftCommitment) => {
    setDrafts((list) => list.map((d) => (d.local_id === localId ? next : d)));
    voidApprovals();
  };

  const remove = (localId: string) => {
    setDrafts((list) => list.filter((d) => d.local_id !== localId));
    setEditingId((id) => (id === localId ? null : id));
    voidApprovals();
  };

  const accept = (localId: string) => {
    setAcceptedIds((s) => new Set(s).add(localId));
    voidApprovals();
  };

  const addLine = () => {
    const line = blankCommitment({
      auto_generated: true,
      priority: "secondary",
      template_commitment_key: suggestTemplateKey("", drafts.length),
    });
    setDrafts((list) => [...list, line]);
    setAcceptedIds((s) => new Set(s).add(line.local_id));
    setEditingId(line.local_id);
    voidApprovals();
  };

  const approveSection = (section: string) =>
    setApprovals((a) => ({ ...a, [section]: new Date().toISOString() }));

  // The three queues. An accepted proposal does not disappear, it MOVES to
  // "ready": the coach must keep seeing what they signed for.
  const toVerify = drafts.filter((d) => d.needs_review && !d.auto_generated);
  const toComplete = drafts.filter((d) => d.auto_generated && !acceptedIds.has(d.local_id));
  const ready = drafts.filter((d) => !toVerify.includes(d) && !toComplete.includes(d));

  // DISPLAY ORDER ONLY — nothing about the plan changes here. An unanswered
  // question is a decision; in a fifteen-line "ready" list those were rows the
  // coach had to hunt for. Sorting them to the top is the cheapest version of
  // "what needs you is at the top".
  //
  // A safety note no longer weighs here. It used to sort a flagged supplement
  // to the very top, which is what a blocking gate does; it is a fact attached
  // to a line, so it now stays with its line.
  const decisionWeight = (d: DraftCommitment): number => {
    if (validateDraft(d).length > 0) return 0;
    return 1;
  };
  const readyByAttention = [...ready].sort((a, b) => decisionWeight(a) - decisionWeight(b));

  // THE PLAN, ON ITS OWN AXIS — and NOT built here.
  //
  // This screen used to own the sectioning: it filtered the four parts itself,
  // then rebuilt the food headings and the family groups inline. That code was
  // correct, and it was still the problem: it was the THIRD layout of the same
  // eighteen lines, and the other two (the template editor's flat list, the
  // student's occasions) had no way to agree with it.
  //
  // `buildPlanStructure` now owns the shape — which parts exist, which heading
  // holds a line, in what order they are read. This screen is the REFERENCE
  // reading, so nothing about its output changes; what changes is that the
  // other screens now get the same value instead of a second implementation of
  // it. `as_given` keeps `readyByAttention`'s sort inside every heading: an
  // unanswered question stays at the top of its own section.
  const structure = buildPlanStructure(readyByAttention, (d) => d, { voice: "coach" });

  // Only ACCEPTED lines are ever saved. An untouched proposal is not a
  // prescription — this is the line that keeps the coach the prescriber.
  const savable = drafts.filter((d) => !d.auto_generated || acceptedIds.has(d.local_id));
  const blocking = savable.filter((d) => validateDraft(d).length > 0);
  const notedCount = Object.values(findings).filter((f) => f.coach_notes.length > 0).length;

  // THE HEADLINE NUMBER IS "THINGS TO HOLD", NOT "ROWS ON SCREEN".
  //
  // It used to be `drafts.length`, labelled "commitments". On the reference
  // document that read "19 commitments" for a plan whose real size is FIFTEEN:
  // the 19 also counted the three observations (a weigh-in, an energy rating, a
  // breakfast photo) and one gap proposal the coach had not accepted and which
  // therefore travels nowhere.
  //
  // The observations block already says, in as many words, "never a thing to
  // hold, so never counted as one" — and `planStructure.ts` says the same in
  // its own header. The headline was the one place contradicting both. A dietitian reads
  // the top of this screen to size a plan; three lines that are watched and one
  // line that does not exist yet must not inflate that.
  //
  // Observations are not hidden by this: they keep their own section, with
  // their own count, one screen below. They are simply not added to the count
  // of what the student has to hold.
  //
  // The two numbers come from the same module that draws the sections, so the
  // headline and the sections can never disagree about what a "thing to hold"
  // is. It is read over `savable` and not over the ready queue: the headline
  // sizes the plan that will be PUBLISHED, which still includes the lines the
  // coach has yet to verify.
  const savableStructure = buildPlanStructure(savable, (d) => d, { voice: "coach" });
  const toHoldCount = savableStructure.toHold;
  const observedCount = savableStructure.observed;

  // Only NON-EMPTY sections need an approval: an empty queue has nothing to
  // attest to, and a fabricated approval for it would pollute the audit trail.
  //
  // "to_complete" is NOT a section. An unaccepted proposal never travels, and
  // an accepted one has already moved into "ready" — approving it there is
  // approving the line that will actually be published.
  const sections: Array<[string, number]> = [
    ["to_verify", toVerify.length],
    ["ready", ready.length],
  ];
  const pendingSections = sections.filter(([s, n]) => n > 0 && !approvals[s]);

  const saveTemplate = async () => {
    setSaving(true);
    setSaveError(null);
    setSavedTemplate(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const locale = savable[0]?.content_locale ?? "en-US";
      const res = await callPlanTemplate<{ template: { id: string; title: string } }>(
        {
          action: "create",
          title: templateTitle.trim() || "Imported plan",
          content_locale: locale,
          default_swap_policy: { class_equivalent: false, allowed_groups: null },
          default_autonomy: "strict",
          commitments: savable.map(toServerCommitment),
        },
        session?.access_token,
      );
      // Write-through: this is the row Postgres re-read, not our payload.
      setSavedTemplate(res.template);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Approve & publish -> plan-publish-v1, which owns the clone + diff +
   * supersede transaction and the in-flight check-in re-seed. This screen only
   * hands over what the coach approved; it never writes `plan_versions` itself.
   *
   * The response is surfaced verbatim, success or failure. A publish that
   * half-failed (`published_but_post_step_failed`) must NOT read as "nothing
   * happened" — the coach would republish and create a second version.
   */
  const publishToStudent = async () => {
    setPublishing(true);
    setPublishNote(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${FUNCTIONS_BASE}/plan-publish-v1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON_KEY,
          Authorization: `Bearer ${session?.access_token ?? ANON_KEY}`,
        },
        body: JSON.stringify({
          student_id: studentId.trim(),
          // EXACTLY ONE of template_id / commitments (plan-publish-v1 contract).
          // This screen sends the LINES: they are the coach's working copy and
          // may already differ from the template that was saved a minute ago.
          // Sending template_id here would publish a plan the coach is not
          // looking at.
          plan: {
            title: templateTitle.trim() || "Imported plan",
            content_locale: savable[0]?.content_locale ?? "en-US",
            timezone,
            week_starts_on: "mon",
            // The calendar window. `provision-day-v1` refuses to open a day
            // outside it (`plan_not_started` / `plan_duration_elapsed`), so
            // these two are not metadata: they decide whether the student's
            // app has anything in it tomorrow.
            anchor_week_start: planWindow.anchorWeekStart,
            duration_weeks: planWindow.durationWeeks,
          },
          commitments: savable.map(toServerCommitment),
          approvals: sections
            .filter(([s, n]) => n > 0 && approvals[s])
            .map(([s]) => ({ section: s, approved_at: approvals[s] })),
        }),
      });
      const json = await res.json().catch(() => null);
      // The readout is the last thing the coach reads on this screen, so it is
      // written for them: what reached the student, or what did not. It used to
      // print `plan_version <uuid>` and a JSON dump of the error — our storage
      // vocabulary and our transport, on the surface a dietitian meets first.
      setPublishNote(
        res.ok
          ? t("review.publish_done", {
            count: (json as { summary?: { commitments?: number } } | null)?.summary
              ?.commitments ?? 0,
          })
          : t("review.publish_failed", {
            message: String(
              (json as { error?: unknown } | null)?.error ?? `HTTP ${res.status}`,
            ),
          }),
      );
    } catch (err) {
      setPublishNote(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  };

  const canRun = !loading && (file !== null || rawText.trim().length > 0);

  const card = (d: DraftCommitment, proposal: boolean) => (
    <CommitmentCard
      key={d.local_id}
      draft={d}
      vocabulary={vocabulary}
      finding={findings[d.local_id] ?? null}
      editing={editingId === d.local_id}
      focused={focusedId === d.local_id}
      proposal={proposal}
      onChange={(next) => patch(d.local_id, next)}
      onToggleEdit={() => setEditingId((id) => (id === d.local_id ? null : d.local_id))}
      onAccept={proposal ? () => accept(d.local_id) : undefined}
      onDelete={() => remove(d.local_id)}
      onFocus={() => setFocusedId(d.local_id)}
    />
  );

  return (
    <KeelAppShell
      variant="coach"
      width="wide"
      title={t("import.title")}
      subtitle={t("import.subtitle")}
    >
      {vocabError && (
        <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-700">
          {t("editor.vocabulary_error", { message: vocabError })}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* LEFT — the document, then save & publish */}
        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-400">
            {t("import.document")}
          </h2>
          <textarea
            className="h-72 w-full rounded-lg border border-gray-300 p-3 font-mono text-sm focus:border-gray-500 focus:outline-none disabled:bg-gray-50"
            placeholder={t("import.paste_placeholder")}
            value={rawText}
            disabled={file !== null}
            onChange={(e) => setRawText(e.target.value)}
          />
          <div className="mt-2 flex items-center gap-3">
            <label className="cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              {file ? file.name : t("import.upload_label")}
              <input
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {file && (
              <button
                type="button"
                className="text-xs text-gray-400 underline"
                onClick={() => setFile(null)}
              >
                {t("common.clear")}
              </button>
            )}
            <button
              type="button"
              disabled={!canRun}
              onClick={runImport}
              className="ml-auto rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
            >
              {loading ? t("import.running") : t("import.run")}
            </button>
          </div>
          {error && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

          {drafts.length > 0 && (
            <div className="mt-6 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <label className="block">
                <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  {t("review.template_title_label")}
                </span>
                <input
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  value={templateTitle}
                  onChange={(e) => setTemplateTitle(e.target.value)}
                />
              </label>
              {blocking.length > 0 && (
                <p className="rounded bg-amber-100 p-2 text-xs text-amber-900">
                  {t("review.blocked_by_issues", { count: blocking.length })}
                </p>
              )}
              <button
                type="button"
                disabled={saving || blocking.length > 0 || savable.length === 0}
                onClick={saveTemplate}
                className="w-full rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
              >
                {saving ? t("review.saving") : t("review.save_template")}
              </button>
              {saveError && (
                <p className="rounded bg-red-50 p-2 text-xs text-red-700">
                  {t("review.save_error", { message: saveError })}
                </p>
              )}
              {savedTemplate && (
                <p className="rounded bg-emerald-50 p-2 text-xs text-emerald-800">
                  {t("review.saved", { title: savedTemplate.title })}
                </p>
              )}

              <label className="block pt-2">
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
                {/* The conversion, read back. A coach who disagrees with the
                    window can see it here instead of discovering it when the
                    student's app goes empty. */}
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

              <p className="text-xs text-gray-500">{t("review.approval_hint")}</p>
              {pendingSections.length > 0 && (
                <p className="rounded bg-amber-100 p-2 text-xs text-amber-900">
                  {t("review.approvals_missing", { count: pendingSections.length })}
                </p>
              )}
              <button
                type="button"
                disabled={publishing || studentId.trim() === "" || blocking.length > 0 ||
                  pendingSections.length > 0 || planWindowInvalid}
                onClick={publishToStudent}
                className="w-full rounded border border-gray-900 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100 disabled:opacity-40"
              >
                {t("review.publish")}
              </button>
              {publishNote && (
                <p className="break-words rounded bg-gray-100 p-2 text-xs text-gray-600">
                  {publishNote}
                </p>
              )}
            </div>
          )}
        </section>

        {/* RIGHT — the two queues */}
        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-400">
            {t("import.extraction")}
          </h2>
          {!result && !loading && drafts.length === 0 && (
            <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
              {t("import.empty_state")}
            </p>
          )}
          {loading && (
            <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
              {t("import.loading_hint")}
            </p>
          )}

          {drafts.length > 0 && (
            <div className="space-y-5">
              <div className="flex gap-4 rounded-lg bg-gray-50 p-3 text-center text-sm">
                <div className="flex-1">
                  <div className="text-xl font-semibold text-gray-900">{toHoldCount}</div>
                  <div className="text-xs text-gray-500">{t("import.stat_commitments")}</div>
                  {observedCount > 0 && (
                    <div className="text-[11px] text-gray-400">
                      {t("import.stat_observed", { count: observedCount })}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div
                    className={`text-xl font-semibold ${
                      toVerify.length > 0 ? "text-amber-600" : "text-emerald-600"
                    }`}
                  >
                    {toVerify.length}
                  </div>
                  <div className="text-xs text-gray-500">{t("import.stat_review")}</div>
                </div>
                <div className="flex-1">
                  <div className="text-xl font-semibold text-sky-700">{toComplete.length}</div>
                  <div className="text-xs text-gray-500">{t("import.stat_gaps")}</div>
                </div>
                {/* Neutral on purpose: this used to be a red count under
                    "Shown to the student without the dose", which read as a
                    tally of the coach's mistakes. It counts lines that carry a
                    reference note, and a note is not a problem. */}
                <div className="flex-1">
                  <div className="text-xl font-semibold text-gray-900">
                    {safetyBusy ? "…" : notedCount}
                  </div>
                  <div className="text-xs text-gray-500">{t("safety.stat_notes")}</div>
                </div>
              </div>

              <Queue
                title={t("review.queue_verify")}
                hint={t("review.queue_verify_hint")}
                count={toVerify.length}
                tone="amber"
                approvedAt={approvals.to_verify ?? null}
                onApprove={() => approveSection("to_verify")}
              >
                {toVerify.map((d) => card(d, false))}
              </Queue>

              <Queue
                title={t("review.queue_complete")}
                hint={t("review.queue_complete_hint")}
                count={toComplete.length}
                tone="sky"
                // No approval control here on purpose: an unaccepted proposal
                // never travels, and an accepted one is approved in "ready".
                approvable={false}
                approvedAt={null}
                onApprove={() => {}}
              >
                {toComplete.map((d) => card(d, true))}
              </Queue>

              {/* THE PLAN ITSELF — two parts, plus what is only watched.
                  ONE approval still covers the whole queue: what the coach
                  attests to is the prescription that will be published, and
                  splitting the trace in two would mean a plan could go out
                  half-approved. The split is a READING of the same lines. */}
              <Queue
                title={t("review.queue_ready")}
                hint={t("review.queue_ready_hint")}
                count={ready.length}
                tone="gray"
                approvedAt={approvals.ready ?? null}
                onApprove={() => approveSection("ready")}
              >
                <div className="space-y-4">
                  {structure.sections.map((section) => (
                    <PartSection key={section.part} section={section}>
                      {section.subsections.length > 0
                        ? section.subsections.map((group) => (
                          <PartSubgroup
                            key={group.key}
                            // The family reads as its CHIP — same glyph, same
                            // colour the student sees on the line itself
                            // (CommitmentLine/ActivityChip). No second
                            // vocabulary. A food heading is a heading.
                            label={group.kind === "activity_class"
                              ? <ActivityChip activityClass={group.key} size="md" />
                              : group.label}
                            count={group.lines.length}
                          >
                            {group.lines.map((d) => card(d, false))}
                          </PartSubgroup>
                        ))
                        : section.lines.map((d) => card(d, false))}
                    </PartSection>
                  ))}
                </div>
              </Queue>

              <button
                type="button"
                onClick={addLine}
                className="w-full rounded border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                + {t("review.add_line")}
              </button>

              {result && result.unparsed_spans.length > 0 && (
                <details className="text-xs text-gray-500">
                  <summary className="cursor-pointer">
                    {t("import.unparsed_title")} ({result.unparsed_spans.length})
                  </summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {result.unparsed_spans.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </section>
      </div>
    </KeelAppShell>
  );
}
