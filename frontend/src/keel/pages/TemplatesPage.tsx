import React from "react";
import { t } from "../i18n/t";
import { supabase } from "../../lib/supabase";
import { addDays, localDateIn } from "../api/dates";
import { autonomyLabel, commitmentSentence, foodGroupLabel } from "../api/labels";
import {
  buildPlanStructure,
  type PlanSection,
  type PlanSubsection,
} from "../api/planStructure";
import { planWindowUntilNextSession } from "../api/todayModel";
import { ActivityChip, PriorityMark } from "../components/CommitmentLine";
import { KeelAppShell } from "../components/KeelAppShell";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Field, inputClass } from "../components/ui/Field";
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
// headings and the same family chips. Nothing about the layout is decided here.
//
// ⚠️ CETTE DERNIÈRE PHRASE DISAIT « ce fichier ne choisit que les couleurs, et
// il choisit celles de l'écran d'import ». Elle est périmée depuis le
// 2026-08-13: il n'y a plus de couleur à choisir. Le code-couleur de partie
// (lime / orange / ambre) et le rang en trois teintes ont été retirés des DEUX
// écrans, et ce qui les remplace est une FORME partagée — le fronton à équerre
// de `TemplateSection` et `PriorityMark`. Si tu relis « il choisit les
// couleurs » quelque part, réécris-le, ne remets pas la teinte.
// ---------------------------------------------------------------------------

// ⛔ `PriorityChip` A ÉTÉ SUPPRIMÉ D'ICI. Il était recopié À L'IDENTIQUE dans
// `PlanImportPage.tsx` — deux définitions du même rang, sur deux écrans qui
// rendent les mêmes lignes, plus un TROISIÈME rendu, différent, dans
// `KeelBadges.PriorityBadge`. Le rang vit maintenant une seule fois, dans
// `components/CommitmentLine.tsx` (`PriorityMark`), avec ses trois écrans comme
// appelants, et il est une forme ordinale et non trois couleurs — le `sky` qu'il
// portait prenait le bleu de `Badge tone="info"`. Lis son commentaire avant d'y
// toucher.

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
      <section className="rounded-card border border-dashed border-line-strong bg-paper-2 p-3">
        <h4 className="flex items-baseline gap-2 text-label font-semibold uppercase text-ink-soft">
          {label}
          <span className="font-normal tabular-nums">{count}</span>
        </h4>
        <p className="mb-2 mt-0.5 max-w-[62ch] text-[11px] text-ink-soft">{hint}</p>
        <div className="space-y-1">{children}</div>
      </section>
    );
  }

  // ⛔ LE CODE-COULEUR DE PARTIE EST PARTI — MÊME DÉCISION, MÊMES VALEURS, MÊME
  // JOUR QUE `PlanImportPage.PartSection`, où le raisonnement complet est écrit.
  // En résumé: `food` en lime, `actions` en orange, `unsorted` en ambre, c'était
  // trois familles saturées pour dire trois CATÉGORIES, alors qu'une teinte
  // saturée dit un FAIT dans ce produit (émeraude/bleu/ambre/rouge). L'orange et
  // l'ambre étaient à 30° l'un de l'autre, donc l'échelle ne se lisait même pas,
  // et l'ambre était déjà « attention » deux blocs plus haut.
  //
  // La frontière est désormais la forme que le kit a choisie pour le même
  // problème (`ui/SetupSection.tsx`, charte §4): un FRONTON `paper-2` fermé par
  // un trait `line`, portant l'ÉQUERRE collée au nom de la partie.
  // ⚠️ Pas de `px-*` sur le nœud qui porte `.eq` — elle pose son propre
  // `padding-left` hors couche CSS. Il est sur le fronton.
  //
  // `unsorted` GARDE l'ambre, et c'est le seul: `planStructure.ts` dit qu'une
  // ligne dont la famille n'a pas pu être placée est « a thing the coach must
  // FIX ». C'est un fait qui attend une décision, donc `Card tone="warning"` et
  // ses valeurs, reprises telles quelles pour qu'il n'y ait qu'un ambre.
  const unsorted = part === "unsorted";
  const frame = unsorted ? "border-amber-200" : "border-line-strong";
  const head = unsorted
    ? "border-amber-200 bg-amber-50 text-amber-900"
    : "border-line bg-paper-2 text-ink";

  return (
    <section className={`overflow-hidden rounded-card border bg-paper ${frame}`}>
      <header className={`border-b px-3 py-2 ${head}`}>
        <h4 className="eq flex flex-wrap items-baseline gap-2 text-label font-semibold uppercase">
          {label}
          <span className="font-normal tabular-nums">{count}</span>
        </h4>
        <p className="mt-0.5 max-w-[62ch] text-[11px] font-normal normal-case opacity-80">
          {hint}
        </p>
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
      <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
        {subsection.kind === "activity_class"
          ? <ActivityChip activityClass={subsection.key} size="md" />
          : (
            // Le même cran que le chip en rôle d'en-tête (`text-label`): les
            // deux branches de ce ternaire sont deux en-têtes de sous-groupe.
            <h5 className="text-label font-semibold uppercase text-ink-soft">
              {subsection.label}
            </h5>
          )}
        <span className="text-[11px] tabular-nums text-ink-soft">
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
        className={`rounded-card border p-2 text-sm ${
          issues.length > 0 ? "border-amber-400 bg-amber-50" : "border-line-strong"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => setEditingId((id) => (id === line.local_id ? null : line.local_id))}
          >
            <div className="font-medium text-ink">
              {line.title || <span className="text-ink-soft">{t("review.untitled_line")}</span>}
            </div>
            <div className="mt-0.5 text-xs text-ink-soft">{commitmentSentence(line)}</div>
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            <PriorityMark priority={line.priority} />
            <Button
              variant="danger"
              size="sm"
              onClick={() => editLines((l) => l.filter((x) => x.local_id !== line.local_id))}
            >
              {t("templates.delete")}
            </Button>
          </div>
        </div>
        {finding && <SafetyNote finding={finding} />}
        {issues.length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-xs text-amber-900">
            {issues.map((issue, i) => <li key={i}>{issue}</li>)}
          </ul>
        )}
        {editingId === line.local_id && vocabulary && (
          <div className="mt-2 border-t border-line pt-2">
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
      // LA MÊME LECTURE QUE L'ÉCRAN D'IMPORT, ET POUR LA MÊME RAISON.
      //
      // Cette ligne rendait « Published: plan_version <uuid> » en succès et le
      // JSON de la réponse brut en échec — notre vocabulaire de stockage et
      // notre transport, sur l'écran où une diététicienne publie. L'écran
      // d'import avait déjà retiré exactement ces deux formes; les deux chemins
      // de publication disent maintenant la même chose, avec les mêmes clés.
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

  const setDraftField = <K extends keyof TemplateRow>(key: K, value: TemplateRow[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  return (
    <KeelAppShell
      variant="coach"
      width="wide"
      title={t("templates.title")}
      subtitle={t("templates.subtitle")}
      actions={
        // ⛔ `primary` EST DESCENDU SUR « ENREGISTRER », ET C'EST UNE DÉCISION.
        // Une seule action figue par vue rendue. Quand un gabarit est ouvert,
        // l'en-tête (« Nouveau ») et le pied de l'éditeur (« Enregistrer ») sont
        // rendus EN MÊME TEMPS: deux aplats de marque, zéro hiérarchie. Celui qui
        // la garde est celui que le coach cherche à ce moment-là — il vient
        // d'écrire, il veut garder. « Nouveau » reste toujours atteignable, en
        // contour. Sans gabarit ouvert, l'écran n'a AUCUNE figue, et c'est juste:
        // il n'y a rien à faire d'autre que choisir dans la liste.
        <Button onClick={startNew}>
          {t("templates.new")}
        </Button>
      }
    >
      {vocabError && (
        <p className="mb-4 rounded-card bg-red-50 p-2 text-sm text-red-700">
          {t("editor.vocabulary_error", { message: vocabError })}
        </p>
      )}
      {loadError && (
        <p className="mb-4 rounded-card bg-red-50 p-2 text-sm text-red-700">
          {t("templates.error", { message: loadError })}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* LEFT — the library */}
        <section className="min-w-0 space-y-2">
          {loading && <p className="text-sm text-ink-soft">{t("templates.loading")}</p>}
          {!loading && templates.length === 0 && (
            <Card tone="dashed" padded={false} className="p-6 text-center text-sm text-ink-soft">
              {t("templates.empty")}
            </Card>
          )}
          {templates.map((tpl) => (
            // LE GABARIT OUVERT SE DISTINGUE PAR UN TRAIT DOUBLÉ, PAS PAR UNE
            // TEINTE: `ring-1` posé sur la même couleur que la bordure épaissit
            // le contour sans emprunter de sens. `border-gray-900` disait la même
            // chose et n'existe plus dans la palette.
            <div
              key={tpl.id}
              className={`rounded-card border border-line-strong bg-paper p-3 ${
                selectedId === tpl.id ? "ring-1 ring-line-strong" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <button type="button" className="min-w-0 text-left" onClick={() => open(tpl)}>
                  <div className="truncate text-sm font-medium text-ink">{tpl.title}</div>
                  <div className="mt-0.5 text-xs text-ink-soft">
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
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => open(tpl)}>
                  {t("templates.open")}
                </Button>
                {tpl.status === "draft" && (
                  <Button variant="danger" size="sm" onClick={() => remove(tpl)}>
                    {t("templates.delete")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </section>

        {/* RIGHT — the editor */}
        <section className="min-w-0">
          {!draft && (
            <Card tone="dashed" padded={false} className="p-6 text-center text-sm text-ink-soft">
              {t("templates.select_hint")}
            </Card>
          )}
          {draft && (
            <div className="space-y-4">
              {/* LES SEPT CHAMPS DE CE PANNEAU ÉTAIENT RECOPIÉS À LA MAIN, en
                  `text-sm` — 14 px. `index.css` pose 16 px sur les champs sous
                  `lg` parce que Safari iOS zoome sur un champ plus petit au focus
                  et NE DÉZOOME PAS; la règle vit dans `@layer base` et un
                  utilitaire la bat, donc la protection était contournée sept fois
                  ici. `Field` + `inputClass` la rétablissent, et donnent en même
                  temps l'étiquette de la charte et la bordure de CONTRÔLE que
                  WCAG 1.4.11 exige à 3:1 (`line-strong`, 3,84:1). */}
              <Card className="grid gap-3 sm:grid-cols-2">
                <Field
                  className="sm:col-span-2"
                  label={t("templates.field_title")}
                  htmlFor="tpl-title"
                >
                  <input
                    id="tpl-title"
                    className={inputClass}
                    value={draft.title}
                    onChange={(e) => setDraftField("title", e.target.value)}
                  />
                </Field>
                <Field
                  className="sm:col-span-2"
                  label={t("templates.field_description")}
                  htmlFor="tpl-description"
                >
                  <textarea
                    id="tpl-description"
                    className={`${inputClass} h-20`}
                    value={draft.description ?? ""}
                    onChange={(e) =>
                      setDraftField("description", e.target.value === "" ? null : e.target.value)}
                  />
                </Field>
                <Field label={t("templates.field_locale")} htmlFor="tpl-locale">
                  <input
                    id="tpl-locale"
                    className={`${inputClass} font-mono`}
                    value={draft.content_locale}
                    onChange={(e) => setDraftField("content_locale", e.target.value)}
                  />
                </Field>
                <Field label={t("templates.field_status")} htmlFor="tpl-status">
                  {/* The VALUE stays the token — it is what Postgres stores.
                      What the coach reads is the word, from the same map the
                      badge in the list uses (R1: tokens are data, not copy). */}
                  <select
                    id="tpl-status"
                    className={inputClass}
                    value={draft.status}
                    onChange={(e) => setDraftField("status", e.target.value)}
                  >
                    {["draft", "active", "archived"].map((s) => (
                      <option key={s} value={s}>
                        {t((STATUS_LABEL[s] ?? "templates.status_draft") as Parameters<typeof t>[0])}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("templates.field_autonomy")} htmlFor="tpl-autonomy">
                  {/* The VALUE stays the token — it is what travels to the
                      server — but what the coach reads is their own language.
                      This select printed `swap_within_policy` raw, in a
                      monospaced box, and it was the last storage slug visible on
                      the three plan screens. `autonomyLabel` throws on a value
                      the seed has no word for (R7), so the next one added cannot
                      leak. */}
                  <select
                    id="tpl-autonomy"
                    className={inputClass}
                    value={draft.default_autonomy}
                    onChange={(e) => setDraftField("default_autonomy", e.target.value)}
                  >
                    {(vocabulary?.enums.autonomy ?? [draft.default_autonomy]).map((a) => (
                      <option key={a} value={a}>{autonomyLabel(a)}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t("templates.field_flex")} htmlFor="tpl-flex">
                  <input
                    id="tpl-flex"
                    type="number"
                    min={0}
                    max={7}
                    className={inputClass}
                    value={draft.default_flex_allowance}
                    onChange={(e) =>
                      setDraftField("default_flex_allowance", Number(e.target.value))}
                  />
                </Field>
                <Field label={t("templates.field_target")} htmlFor="tpl-target">
                  <input
                    id="tpl-target"
                    type="number"
                    min={1}
                    max={100}
                    className={inputClass}
                    value={draft.default_adherence_target_pct}
                    onChange={(e) =>
                      setDraftField("default_adherence_target_pct", Number(e.target.value))}
                  />
                </Field>
              </Card>

              {/* default_swap_policy — ticked ONCE, at template level. */}
              <Card>
                <h3 className="text-sm font-semibold text-ink">
                  {t("templates.swap_title")}
                </h3>
                <p className="mb-2 mt-0.5 max-w-[62ch] text-xs text-ink-soft">
                  {t("templates.swap_hint")}
                </p>
                <label className="flex items-start gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-fig-700"
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
                  <span className="mb-2 block text-label font-semibold uppercase text-ink-soft">
                    {t("templates.swap_allowed_groups")}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {(vocabulary?.food_groups ?? []).map((g) => {
                      const selected = draft.default_swap_policy?.allowed_groups ?? [];
                      const on = selected.includes(g.slug);
                      return (
                        // UN GROUPE COCHÉ EST UN CHOIX, DONC UNE ACTION, donc la
                        // marque a le droit d'y entrer (charte §2) — ce que
                        // `bg-gray-900 text-white` disait déjà, sans jeton.
                        // ⚠️ `aria-pressed` parce que c'est un interrupteur:
                        // sans lui, un lecteur d'écran entend « Poisson gras,
                        // bouton » et n'apprend jamais s'il est coché.
                        <button
                          key={g.slug}
                          type="button"
                          title={g.class}
                          aria-pressed={on}
                          onClick={() => {
                            const next = on
                              ? selected.filter((s) => s !== g.slug)
                              : [...selected, g.slug];
                            setDraftField("default_swap_policy", {
                              ...(draft.default_swap_policy ?? {}),
                              allowed_groups: next.length === 0 ? null : next,
                            });
                          }}
                          className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                            on
                              ? "border-fig-700 bg-fig-700 text-paper"
                              : "border-line-strong bg-paper text-ink-soft hover:bg-fig-50"
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
              </Card>

              {/* THE LINES, IN THE SHAPE OF A PLAN — the import screen's
                  sections, from the import screen's module. */}
              <Card>
                <h3 className="mb-3 flex flex-wrap items-baseline gap-2 text-sm font-semibold text-ink">
                  {t("templates.commitments_section")}
                  {/* THE HEADLINE IS "THINGS TO HOLD", NOT "ROWS ON SCREEN".
                      A weigh-in and an energy rating are watched, never held;
                      the import screen already counts them apart and this one
                      must agree, or the same template reads as two sizes.
                      Un chiffre est un chiffre: `tabular-nums` et pas une
                      pastille grise — voir `PlanImportPage.Queue`. */}
                  <span className="text-xs font-normal tabular-nums text-ink-soft">
                    {structure.toHold}
                  </span>
                  {structure.observed > 0 && (
                    <span className="text-[11px] font-normal text-ink-soft">
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
                <Button
                  className="mt-2 w-full"
                  onClick={() => {
                    const line = blankCommitment({
                      content_locale: draft.content_locale,
                      template_commitment_key: suggestTemplateKey("", lines.length),
                    });
                    editLines((l) => [...l, line]);
                    setEditingId(line.local_id);
                  }}
                >
                  + {t("review.add_line")}
                </Button>
              </Card>

              {/* Save + publish */}
              <Card className="space-y-3">
                {blocking.length > 0 && (
                  <p className="rounded-card bg-amber-50 p-2 text-xs text-amber-900">
                    {t("review.blocked_by_issues", { count: blocking.length })}
                  </p>
                )}
                {/* ⛔ LA SEULE ACTION FIGUE DE CET ÉCRAN. Voir le commentaire de
                    l'en-tête: « Nouveau » a été démoté pour celle-ci. */}
                <Button
                  variant="primary"
                  className="w-full"
                  disabled={saving || blocking.length > 0}
                  onClick={save}
                >
                  {saving ? t("templates.saving") : t("templates.save")}
                </Button>
                {saveError && (
                  <p className="break-words rounded-card bg-red-50 p-2 text-xs text-red-700">
                    {t("review.save_error", { message: saveError })}
                  </p>
                )}
                {saved && (
                  <p className="rounded-card bg-emerald-50 p-2 text-xs text-emerald-800">
                    {t("templates.saved")}
                  </p>
                )}

                <p className="max-w-[62ch] pt-2 text-xs text-ink-soft">
                  {t("templates.publish_hint")}
                </p>
                <Field label={t("templates.student_id_label")} htmlFor="tpl-student-id">
                  <input
                    id="tpl-student-id"
                    className={`${inputClass} font-mono`}
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                  />
                </Field>
                <Field
                  label={t("templates.timezone_label")}
                  hint={t("templates.timezone_hint")}
                  htmlFor="tpl-timezone"
                >
                  <input
                    id="tpl-timezone"
                    className={`${inputClass} font-mono`}
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                  />
                </Field>

                {/* HOW LONG IT RUNS — a date, not two database columns. */}
                <div className="rounded-card border border-line bg-paper-2 p-3">
                  <span className="mb-2 block text-label font-semibold uppercase text-ink-soft">
                    {t("templates.next_session_label")}
                  </span>
                  {nextSession === null
                    ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          setNextSession(
                            addDays(
                              localDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone),
                              28,
                            ),
                          )}
                      >
                        {t("templates.next_session_open")}
                      </Button>
                    )
                    : (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="date"
                          aria-label={t("templates.next_session_label")}
                          className={`${inputClass} w-auto`}
                          value={nextSession}
                          onChange={(e) => setNextSession(e.target.value || null)}
                        />
                        <Button variant="ghost" size="sm" onClick={() => setNextSession(null)}>
                          {t("templates.next_session_clear")}
                        </Button>
                      </div>
                    )}
                  <span className="mt-2 block max-w-[62ch] text-[11px] text-ink-soft">
                    {t("templates.next_session_hint")}
                  </span>
                  {/* The conversion, read back before publish. */}
                  <span className="mt-1 block max-w-[62ch] text-[11px] text-ink">
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

                <label className="flex items-start gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-fig-700"
                    checked={approvedAt !== null}
                    onChange={(e) =>
                      setApprovedAt(e.target.checked ? new Date().toISOString() : null)}
                  />
                  <span>
                    {t("templates.approve_lines")}
                    <span className="mt-1 block max-w-[62ch] text-xs text-ink-soft">
                      {t("review.approval_hint")}
                    </span>
                  </span>
                </label>
                <Button
                  className="w-full"
                  disabled={publishing || !selectedId || studentId.trim() === "" ||
                    blocking.length > 0 || approvedAt === null}
                  onClick={publish}
                >
                  {publishing ? t("templates.publishing") : t("templates.publish")}
                </Button>
                {publishNote && (
                  <p className="break-words rounded-card bg-paper-2 p-2 text-xs text-ink">
                    {publishNote}
                  </p>
                )}
              </Card>
            </div>
          )}
        </section>
      </div>
    </KeelAppShell>
  );
}
