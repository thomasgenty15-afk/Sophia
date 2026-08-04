// Attack cards — extracted from the legacy `components/dashboard-v2/LabCardsPanel.tsx`
// during W2.B. That file mixed two products in 2406 lines: the potions (deleted with
// the rest of the potion surface) and the attack cards, which KEEL keeps. Only the
// attack half survives here, with explicit props and English copy through `t()` (R1).
//
// W8 — THE CATALOGUE MOVED TO THE DATABASE.
// This file used to import `ATTACK_TECHNIQUE_PREVIEWS` from
// `components/dashboard-v2/attackTechniquePreviews.ts`, which was the THIRD
// hardcoded copy of the six techniques (the other two: this component's merge
// defaults, and `generate-attack-card-v1/index.ts:37-127`). The three had
// already diverged — different question wording in each. There is now one
// source: `card_templates` seeded with `owner_scope='global'`.
//
// The panel takes `catalogue` as a prop. When a caller does not pass one it
// loads the catalogue itself, once, from the table — a deliberate exception to
// the "no data fetching here" rule stated below, and the alternative was worse:
// either a fourth hardcoded copy for the callers that have no loader, or a
// panel that silently renders an empty technique list. The fetch is one read of
// a global reference table, the same class as `slot_vocabulary`.
//
// Everything else the panel needs is still passed in. The generation/analysis
// callbacks stay with the caller.

import { type ReactNode, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Map as MapIcon,
  Plus,
  Sparkles,
  Sword,
  X,
} from "lucide-react"

import type { AttackCardContent } from "../../types/v2"
import type {
  AttackTechniqueAdjustmentAnalysis,
  AttackTechniqueAdjustmentReasonKey,
  AttackTechniqueGeneratedResult,
  AttackTechniqueKey,
} from "../../hooks/useLabCards"
import { loadAttackTechniqueCatalogue } from "../api/cards"
import { t } from "../i18n/t"

/**
 * One technique as this panel renders it. Structurally identical to the shape
 * stored in `user_attack_cards.content.techniques[]`, which is why the stored
 * card and the catalogue merge field by field in `getAttackTechniques`.
 */
export type AttackTechniqueView = AttackCardContent["techniques"][number]

/**
 * The catalogue, loaded once from `card_templates`. Returns `provided` verbatim
 * when the caller owns the loading (the KEEL cards page does), so there is
 * exactly one fetch on the screen either way.
 *
 * A load failure yields an EMPTY catalogue and a logged error, never a
 * hardcoded fallback: a silent local copy is precisely the thing W8 removed,
 * and it would come back the first time the table was unreachable.
 */
function useAttackTechniqueCatalogue(
  provided: AttackTechniqueView[] | undefined,
): AttackTechniqueView[] {
  const [loaded, setLoaded] = useState<AttackTechniqueView[]>([])

  useEffect(() => {
    if (provided) return undefined
    let cancelled = false
    loadAttackTechniqueCatalogue()
      .then((entries) => {
        if (!cancelled) setLoaded(entries as AttackTechniqueView[])
      })
      .catch((error) => {
        console.error("[AttackCards] catalogue load failed:", error)
      })
    return () => {
      cancelled = true
    }
  }, [provided])

  return provided ?? loaded
}

export type AttackTechniqueAdjustmentContext = {
  currentTechniqueKey: AttackTechniqueKey
  failureReasonKey: AttackTechniqueAdjustmentReasonKey
  failureNotes: string
  recommendationReason: string
  diagnosticQuestions: string[]
  diagnosticAnswers: string[]
}

export type GenerateAttackTechnique = (
  techniqueKey: AttackTechniqueKey,
  answers: string[],
  options?: {
    questions?: string[]
    adjustmentContext?: AttackTechniqueAdjustmentContext
  },
) => Promise<AttackTechniqueGeneratedResult | null>

export type AnalyzeAttackTechniqueAdjustment = (
  currentTechniqueKey: AttackTechniqueKey,
  failureReasonKey: AttackTechniqueAdjustmentReasonKey,
  failureNotes: string,
) => Promise<AttackTechniqueAdjustmentAnalysis | null>

type AttackCardsProps = {
  /** True while the stored attack card is being fetched. */
  loading: boolean
  /** True while a card creation is being prepared (disables the entry points). */
  generatingAttack: boolean
  /** Technique currently being generated, or null. */
  generatingTechniqueKey: AttackTechniqueKey | null
  /** Technique currently being analysed for adjustment, or null. */
  analyzingTechniqueKey: AttackTechniqueKey | null
  /** Stored card; null falls back to the catalogue. */
  attackCard: AttackCardContent | null
  onGenerateTechnique: GenerateAttackTechnique
  onAnalyzeTechniqueAdjustment: AnalyzeAttackTechniqueAdjustment
  /** Optional slot for the plan-anchored cards, rendered in its own sub-section. */
  planAttackCardsNode?: ReactNode
  /**
   * The technique catalogue, read from `card_templates`. Omit it and the panel
   * loads it itself; pass it when the screen already holds the templates, so
   * the table is queried once per screen rather than once per panel.
   */
  catalogue?: AttackTechniqueView[]
}

const ADJUSTMENT_REASON_KEYS: AttackTechniqueAdjustmentReasonKey[] = [
  "forgot",
  "too_abstract",
  "too_hard",
  "did_not_resonate",
  "wrong_problem",
  "other",
]

function adjustmentReasonLabel(key: AttackTechniqueAdjustmentReasonKey): string {
  switch (key) {
    case "forgot":
      return t("attack.adjust.reason.forgot")
    case "too_abstract":
      return t("attack.adjust.reason.too_abstract")
    case "too_hard":
      return t("attack.adjust.reason.too_hard")
    case "did_not_resonate":
      return t("attack.adjust.reason.did_not_resonate")
    case "wrong_problem":
      return t("attack.adjust.reason.wrong_problem")
    case "other":
      return t("attack.adjust.reason.other")
  }
}

/**
 * Merge the stored card with the technique catalogue: the catalogue owns the prompt
 * copy and the question list, the stored card owns the generated result.
 */
function getAttackTechniques(
  content: AttackCardContent,
  catalogue: AttackTechniqueView[],
): AttackTechniqueView[] {
  if (!Array.isArray(content.techniques)) return []

  const defaultsByKey = new Map(
    catalogue.map((technique) => [technique.technique_key, technique]),
  )

  return content.techniques.map((technique) => {
    const defaults = defaultsByKey.get(technique.technique_key)
    if (!defaults) return technique
    return {
      ...defaults,
      ...technique,
      questions: defaults.questions,
      generated_result: technique.generated_result ?? null,
    }
  })
}

function useLockedBodyScroll(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])
}

function CardShell({
  title,
  subtitle,
  icon,
  accentClass,
  isOpen,
  onToggle,
  children,
}: {
  title: string
  subtitle: string
  icon: ReactNode
  accentClass: string
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 px-5 py-5 text-left"
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${accentClass}`}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-h-10 items-center">
              <h3
                className="text-xl font-semibold tracking-[0.01em] text-stone-950"
                style={{
                  fontFamily:
                    '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
                }}
              >
                {title}
              </h3>
            </div>
            <p className="mt-1 text-sm leading-6 text-stone-600">{subtitle}</p>
          </div>
        </div>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {isOpen ? <div className="px-5 pb-5">{children}</div> : null}
    </section>
  )
}

function AttackTechniquePreviewCard({ technique }: { technique: AttackTechniqueView }) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
        {technique.title}
      </p>
      <p className="mt-3 text-sm leading-6 text-stone-800">{technique.pour_quoi}</p>
      <p className="mt-3 text-xs font-medium text-stone-500">
        {t("attack.preview.generates", { output: technique.objet_genere })}
      </p>
    </article>
  )
}

function GeneratedResultBody({
  result,
}: {
  result: AttackTechniqueGeneratedResult
}) {
  return (
    <>
      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
        <p className="whitespace-pre-wrap text-sm leading-6 text-stone-800">
          {result.generated_asset}
        </p>
      </div>

      {result.supporting_points?.length
        ? (
          <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
              {t("attack.card.supporting_points")}
            </p>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-stone-700">
              {result.supporting_points.map((point, index) => (
                <li key={`support-${index}`}>
                  {index + 1}. {point}
                </li>
              ))}
            </ul>
          </div>
        )
        : null}

      <div className="mt-4 rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
          {t("attack.card.how_to_use")}
        </p>
        <p className="mt-2 text-sm leading-6 text-amber-950">{result.mode_emploi}</p>
      </div>
    </>
  )
}

function GeneratedAttackCard({
  technique,
  analyzing,
  onAdjust,
}: {
  technique: AttackTechniqueView
  analyzing: boolean
  onAdjust: (techniqueKey: AttackTechniqueKey) => void
}) {
  if (!technique.generated_result) return null

  return (
    <article className="rounded-[26px] border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
            {technique.title}
          </p>
          <h4 className="mt-2 text-lg font-semibold text-amber-950">
            {technique.generated_result.output_title}
          </h4>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
          {t("attack.card.created_badge")}
        </span>
      </div>

      {technique.generated_result.keyword_trigger?.activation_keyword
        ? (
          <div className="mt-4 flex items-center gap-2">
            <span className="rounded-full bg-stone-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
              {t("attack.card.keyword_label")}
            </span>
            <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-800">
              {technique.generated_result.keyword_trigger.activation_keyword}
            </span>
          </div>
        )
        : null}

      <div className="mt-4">
        <GeneratedResultBody result={technique.generated_result} />
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => onAdjust(technique.technique_key)}
          disabled={analyzing}
          className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-700 disabled:opacity-60"
        >
          {analyzing
            ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("attack.card.analyzing")}
              </>
            )
            : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                {t("attack.card.adjust")}
              </>
            )}
        </button>
      </div>
    </article>
  )
}

/**
 * Creation flow for a single attack card. Exported because the plan-item resource
 * actions open it directly, anchored on a plan action.
 */
export function AttackTechniqueFlowModal({
  isOpen,
  techniques,
  generatingTechniqueKey,
  contextLabel,
  onClose,
  onSubmit,
}: {
  isOpen: boolean
  techniques: AttackTechniqueView[]
  generatingTechniqueKey: AttackTechniqueKey | null
  contextLabel?: string | null
  onClose: () => void
  onSubmit: (
    techniqueKey: AttackTechniqueKey,
    answers: string[],
    options?: { questions?: string[] },
  ) => Promise<AttackTechniqueGeneratedResult | null>
}) {
  const [step, setStep] = useState<"choose" | "questions" | "result">("choose")
  const [selectedTechniqueKey, setSelectedTechniqueKey] = useState<AttackTechniqueKey | null>(
    null,
  )
  const [answers, setAnswers] = useState<string[]>([])
  const [result, setResult] = useState<AttackTechniqueGeneratedResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setStep("choose")
      setSelectedTechniqueKey(null)
      setAnswers([])
      setResult(null)
      setError(null)
    }
  }, [isOpen])

  useLockedBodyScroll(isOpen)

  if (!isOpen) return null

  const selectedTechnique = selectedTechniqueKey
    ? techniques.find((technique) => technique.technique_key === selectedTechniqueKey) ?? null
    : null
  const questions = selectedTechnique?.questions ?? []

  const handleGenerate = async () => {
    if (!selectedTechnique) return
    if (answers.length < questions.length || answers.some((answer) => !answer.trim())) {
      setError(t("attack.flow.error_missing_answers"))
      return
    }

    const generated = await onSubmit(
      selectedTechnique.technique_key,
      answers.map((answer) => answer.trim()),
      { questions },
    )

    if (!generated) {
      setError(t("attack.flow.error_generate_failed"))
      return
    }

    setError(null)
    setResult(generated)
    setStep("result")
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-amber-100 bg-amber-50 px-5 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
              {t("attack.flow.eyebrow")}
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-stone-950">
              {step === "choose"
                ? t("attack.flow.title_choose")
                : step === "questions"
                ? selectedTechnique?.title ?? t("attack.flow.title_questions")
                : t("attack.flow.title_result")}
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {step === "choose"
                ? t("attack.flow.help_choose")
                : step === "questions"
                ? t("attack.flow.help_questions")
                : t("attack.flow.help_result")}
            </p>
            {contextLabel
              ? <p className="mt-1 text-sm font-medium text-amber-800">{contextLabel}</p>
              : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-stone-400 transition-colors hover:bg-white hover:text-stone-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {step === "choose"
            ? (
              techniques.length > 0
                ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    {techniques.map((technique) => (
                      <button
                        key={technique.technique_key}
                        type="button"
                        onClick={() => {
                          setSelectedTechniqueKey(technique.technique_key)
                          setAnswers((technique.questions ?? []).map(() => ""))
                          setError(null)
                          setStep("questions")
                        }}
                        className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-left transition-colors hover:border-amber-300 hover:bg-amber-50"
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                          {technique.title}
                        </p>
                        <p className="mt-3 text-sm leading-6 text-stone-800">
                          {technique.pour_quoi}
                        </p>
                        <p className="mt-3 text-xs font-medium text-stone-500">
                          {t("attack.preview.generates", { output: technique.objet_genere })}
                        </p>
                      </button>
                    ))}
                  </div>
                )
                : (
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-5 text-sm text-stone-600">
                    {t("attack.flow.none_left")}
                  </div>
                )
            )
            : null}

          {step === "questions" && selectedTechnique
            ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                  <p className="text-sm leading-6 text-amber-950">
                    {selectedTechnique.pour_quoi}
                  </p>
                </div>

                {questions.map((question, index) => (
                  <label key={`${selectedTechnique.technique_key}-${index}`} className="block">
                    <p className="text-sm font-semibold text-stone-900">{question}</p>
                    <textarea
                      value={answers[index] ?? ""}
                      onChange={(event) => {
                        const next = [...answers]
                        next[index] = event.target.value
                        setAnswers(next)
                      }}
                      rows={3}
                      className="mt-3 w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 outline-none placeholder:text-stone-400"
                    />
                  </label>
                ))}

                {error ? <p className="text-xs text-rose-600">{error}</p> : null}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("choose")
                      setError(null)
                    }}
                    className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-700"
                  >
                    {t("attack.flow.change_technique")}
                  </button>
                  <button
                    type="button"
                    disabled={generatingTechniqueKey === selectedTechnique.technique_key}
                    onClick={() => void handleGenerate()}
                    className="inline-flex items-center gap-2 rounded-full bg-amber-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {generatingTechniqueKey === selectedTechnique.technique_key
                      ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {t("attack.flow.generating")}
                        </>
                      )
                      : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          {t("attack.flow.generate")}
                        </>
                      )}
                  </button>
                </div>
              </div>
            )
            : null}

          {step === "result" && result
            ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    {t("attack.flow.generated_eyebrow")}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-amber-950">
                    {result.output_title}
                  </p>
                </div>
                <GeneratedResultBody result={result} />
              </div>
            )
            : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4 md:flex-row md:justify-end">
          {step === "result"
            ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-900 px-5 py-3 text-xs font-semibold text-white"
              >
                <Check className="h-4 w-4" />
                {t("common.close")}
              </button>
            )
            : (
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-stone-200 bg-white px-4 py-3 text-xs font-semibold text-stone-700"
              >
                {t("common.cancel")}
              </button>
            )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function AttackTechniqueAdjustmentModal({
  isOpen,
  currentTechniqueKey,
  techniques,
  analyzingTechniqueKey,
  generatingTechniqueKey,
  onClose,
  onAnalyze,
  onSubmit,
}: {
  isOpen: boolean
  currentTechniqueKey: AttackTechniqueKey | null
  techniques: AttackTechniqueView[]
  analyzingTechniqueKey: AttackTechniqueKey | null
  generatingTechniqueKey: AttackTechniqueKey | null
  onClose: () => void
  onAnalyze: AnalyzeAttackTechniqueAdjustment
  onSubmit: GenerateAttackTechnique
}) {
  const [step, setStep] = useState<"feedback" | "choose" | "questions" | "result">("feedback")
  const [reasonKey, setReasonKey] = useState<AttackTechniqueAdjustmentReasonKey>("too_hard")
  const [failureNotes, setFailureNotes] = useState("")
  const [analysis, setAnalysis] = useState<AttackTechniqueAdjustmentAnalysis | null>(null)
  const [selectedTechniqueKey, setSelectedTechniqueKey] = useState<AttackTechniqueKey | null>(
    null,
  )
  const [questionAnswers, setQuestionAnswers] = useState<string[]>([])
  const [result, setResult] = useState<AttackTechniqueGeneratedResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setStep("feedback")
      setReasonKey("too_hard")
      setFailureNotes("")
      setAnalysis(null)
      setSelectedTechniqueKey(null)
      setQuestionAnswers([])
      setResult(null)
      setError(null)
    }
  }, [isOpen])

  useLockedBodyScroll(isOpen)

  const selectedTechnique = selectedTechniqueKey
    ? techniques.find((technique) => technique.technique_key === selectedTechniqueKey) ?? null
    : null
  const baseQuestions = selectedTechnique?.questions ?? []
  const diagnosticQuestions = analysis?.diagnosticQuestions ?? []
  const allQuestions = useMemo(
    () => [...baseQuestions, ...diagnosticQuestions],
    [baseQuestions, diagnosticQuestions],
  )

  useEffect(() => {
    if (step !== "questions") return
    setQuestionAnswers((current) =>
      Array.from({ length: allQuestions.length }, (_, index) => current[index] ?? "")
    )
  }, [allQuestions.length, step, selectedTechniqueKey])

  if (!isOpen || !currentTechniqueKey) return null

  const currentTechnique =
    techniques.find((technique) => technique.technique_key === currentTechniqueKey) ?? null

  const handleAnalyze = async () => {
    const nextAnalysis = await onAnalyze(currentTechniqueKey, reasonKey, failureNotes)
    if (!nextAnalysis) {
      setError(t("attack.adjust.error_analyze"))
      return
    }

    setAnalysis(nextAnalysis)
    setSelectedTechniqueKey(nextAnalysis.recommendedTechniqueKey)
    setQuestionAnswers([])
    setError(null)
    setStep("choose")
  }

  const handleGenerate = async () => {
    if (!selectedTechnique || !analysis) return
    if (allQuestions.some((_, index) => !String(questionAnswers[index] ?? "").trim())) {
      setError(t("attack.adjust.error_missing_answers"))
      return
    }

    const diagnosticAnswers = questionAnswers.slice(baseQuestions.length)
    const generated = await onSubmit(
      selectedTechnique.technique_key,
      questionAnswers.map((answer) => answer.trim()),
      {
        adjustmentContext: {
          currentTechniqueKey,
          failureReasonKey: reasonKey,
          failureNotes,
          recommendationReason: analysis.recommendationReason,
          diagnosticQuestions,
          diagnosticAnswers: diagnosticAnswers.map((answer) => answer.trim()),
        },
      },
    )

    if (!generated) {
      setError(t("attack.adjust.error_regenerate"))
      return
    }

    setError(null)
    setResult(generated)
    setStep("result")
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-amber-100 bg-amber-50 px-5 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
              {t("attack.adjust.eyebrow")}
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-stone-950">
              {step === "feedback"
                ? t("attack.adjust.title_feedback")
                : step === "choose"
                ? t("attack.adjust.title_choose")
                : step === "questions"
                ? selectedTechnique?.title ?? t("attack.flow.title_questions")
                : t("attack.adjust.title_result")}
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {step === "feedback"
                ? t("attack.adjust.help_feedback")
                : step === "choose"
                ? t("attack.adjust.help_choose")
                : step === "questions"
                ? t("attack.adjust.help_questions")
                : t("attack.adjust.help_result")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-stone-400 transition-colors hover:bg-white hover:text-stone-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {step === "feedback"
            ? (
              <div className="space-y-4">
                {currentTechnique
                  ? (
                    <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                        {t("attack.adjust.current_technique")}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-amber-950">
                        {currentTechnique.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-stone-700">
                        {currentTechnique.pour_quoi}
                      </p>
                    </div>
                  )
                  : null}

                <div>
                  <p className="text-sm font-semibold text-stone-900">
                    {t("attack.adjust.why_question")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ADJUSTMENT_REASON_KEYS.map((key) => {
                      const selected = key === reasonKey
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setReasonKey(key)}
                          className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                            selected
                              ? "border-stone-900 bg-stone-900 text-white"
                              : "border-stone-200 bg-white text-stone-700"
                          }`}
                        >
                          {adjustmentReasonLabel(key)}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <label className="block">
                  <p className="text-sm font-semibold text-stone-900">
                    {t("attack.adjust.notes_label")}
                  </p>
                  <textarea
                    value={failureNotes}
                    onChange={(event) => setFailureNotes(event.target.value)}
                    rows={4}
                    className="mt-3 w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 outline-none placeholder:text-stone-400"
                  />
                </label>

                {error ? <p className="text-xs text-rose-600">{error}</p> : null}
              </div>
            )
            : null}

          {step === "choose" && analysis
            ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    {t("attack.adjust.proposal")}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-amber-950">
                    {analysis.decision === "change"
                      ? t("attack.adjust.decision_change")
                      : t("attack.adjust.decision_refine")}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-700">
                    {analysis.recommendationReason}
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {techniques.map((technique) => {
                    const selected = technique.technique_key === selectedTechniqueKey
                    return (
                      <button
                        key={technique.technique_key}
                        type="button"
                        onClick={() => {
                          setSelectedTechniqueKey(technique.technique_key)
                          setError(null)
                        }}
                        className={`rounded-2xl border p-4 text-left transition-colors ${
                          selected
                            ? "border-amber-400 bg-amber-50"
                            : "border-stone-200 bg-stone-50 hover:border-amber-300 hover:bg-amber-50"
                        }`}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                          {technique.title}
                        </p>
                        <p className="mt-3 text-sm leading-6 text-stone-800">
                          {technique.pour_quoi}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
            : null}

          {step === "questions" && selectedTechnique
            ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                  <p className="text-sm leading-6 text-amber-950">
                    {analysis?.recommendationReason}
                  </p>
                </div>

                {allQuestions.map((question, index) => (
                  <label
                    key={`${selectedTechnique.technique_key}-adjust-${index}`}
                    className="block"
                  >
                    <p className="text-sm font-semibold text-stone-900">{question}</p>
                    <textarea
                      value={questionAnswers[index] ?? ""}
                      onChange={(event) => {
                        const next = [...questionAnswers]
                        next[index] = event.target.value
                        setQuestionAnswers(next)
                      }}
                      rows={3}
                      className="mt-3 w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 outline-none placeholder:text-stone-400"
                    />
                  </label>
                ))}

                {error ? <p className="text-xs text-rose-600">{error}</p> : null}
              </div>
            )
            : null}

          {step === "result" && result
            ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    {t("attack.adjust.new_version")}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-amber-950">
                    {result.output_title}
                  </p>
                </div>
                <GeneratedResultBody result={result} />
              </div>
            )
            : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4 md:flex-row md:justify-between">
          <div className="flex flex-wrap gap-3">
            {step !== "feedback" && step !== "result"
              ? (
                <button
                  type="button"
                  onClick={() => {
                    setError(null)
                    setStep((current) => (current === "questions" ? "choose" : "feedback"))
                  }}
                  className="rounded-full border border-stone-200 bg-white px-4 py-3 text-xs font-semibold text-stone-700"
                >
                  {t("common.back")}
                </button>
              )
              : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-stone-200 bg-white px-4 py-3 text-xs font-semibold text-stone-700"
            >
              {step === "result" ? t("common.close") : t("common.cancel")}
            </button>
          </div>

          {step === "feedback"
            ? (
              <button
                type="button"
                disabled={analyzingTechniqueKey === currentTechniqueKey}
                onClick={() => void handleAnalyze()}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-900 px-5 py-3 text-xs font-semibold text-white disabled:opacity-60"
              >
                {analyzingTechniqueKey === currentTechniqueKey
                  ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("attack.card.analyzing")}
                    </>
                  )
                  : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      {t("common.continue")}
                    </>
                  )}
              </button>
            )
            : null}

          {step === "choose"
            ? (
              <button
                type="button"
                disabled={!selectedTechniqueKey}
                onClick={() => {
                  setError(null)
                  setStep("questions")
                }}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-900 px-5 py-3 text-xs font-semibold text-white disabled:opacity-60"
              >
                {t("common.continue")}
              </button>
            )
            : null}

          {step === "questions" && selectedTechniqueKey
            ? (
              <button
                type="button"
                disabled={generatingTechniqueKey === selectedTechniqueKey}
                onClick={() => void handleGenerate()}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-700 px-5 py-3 text-xs font-semibold text-white disabled:opacity-60"
              >
                {generatingTechniqueKey === selectedTechniqueKey
                  ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("attack.adjust.regenerating")}
                    </>
                  )
                  : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      {t("attack.adjust.regenerate")}
                    </>
                  )}
              </button>
            )
            : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function AttackCards({
  loading,
  generatingAttack,
  generatingTechniqueKey,
  analyzingTechniqueKey,
  attackCard,
  onGenerateTechnique,
  onAnalyzeTechniqueAdjustment,
  planAttackCardsNode,
  catalogue,
}: AttackCardsProps) {
  const [isAttackFlowOpen, setIsAttackFlowOpen] = useState(false)
  const [adjustingTechniqueKey, setAdjustingTechniqueKey] = useState<AttackTechniqueKey | null>(
    null,
  )
  const [isAttackExpanded, setIsAttackExpanded] = useState(false)
  const [isIntroOpen, setIsIntroOpen] = useState(true)
  const [isTechniquesOpen, setIsTechniquesOpen] = useState(false)
  const [isFreeSectionOpen, setIsFreeSectionOpen] = useState(true)
  const [isPlanSectionOpen, setIsPlanSectionOpen] = useState(true)

  const resolvedCatalogue = useAttackTechniqueCatalogue(catalogue)

  const techniques = useMemo(() => {
    const stored = attackCard
      ? getAttackTechniques(attackCard, resolvedCatalogue)
      : []
    return stored.length > 0 ? stored : resolvedCatalogue
  }, [attackCard, resolvedCatalogue])
  const generatedTechniques = techniques.filter((technique) => technique.generated_result)
  const remainingTechniques = techniques.filter((technique) => !technique.generated_result)

  return (
    <div className="space-y-5">
      <div className="grid gap-5">
        <CardShell
          title={t("attack.section.title")}
          subtitle={t("attack.section.subtitle")}
          icon={<Sword className="h-5 w-5 text-amber-700" />}
          accentClass="bg-amber-50"
          isOpen={isAttackExpanded}
          onToggle={() => setIsAttackExpanded((value) => !value)}
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
              <button
                type="button"
                onClick={() => setIsIntroOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                  {t("attack.how_it_works.label")}
                </span>
                {isIntroOpen
                  ? <ChevronUp className="h-4 w-4 text-amber-700" />
                  : <ChevronDown className="h-4 w-4 text-amber-700" />}
              </button>
              {isIntroOpen
                ? (
                  <p className="mt-2 text-sm leading-6 text-amber-950">
                    {t("attack.how_it_works.body")}
                  </p>
                )
                : null}
            </div>

            <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
              <button
                type="button"
                onClick={() => setIsTechniquesOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                  {t("attack.techniques.label")}
                </span>
                {isTechniquesOpen
                  ? <ChevronUp className="h-4 w-4 text-amber-700" />
                  : <ChevronDown className="h-4 w-4 text-amber-700" />}
              </button>
              {isTechniquesOpen
                ? (
                  remainingTechniques.length > 0
                    ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        {remainingTechniques.map((technique) => (
                          <AttackTechniquePreviewCard
                            key={technique.technique_key}
                            technique={technique}
                          />
                        ))}
                      </div>
                    )
                    : (
                      <p className="mt-3 text-sm text-amber-950">
                        {t("attack.techniques.all_created")}
                      </p>
                    )
                )
                : null}
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50">
              <button
                type="button"
                onClick={() => setIsFreeSectionOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-amber-100">
                    <Sparkles className="h-4 w-4 text-amber-700" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-950">
                      {t("attack.free.title")}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      {t("attack.free.subtitle")}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-stone-500 transition-transform duration-200 ${
                    isFreeSectionOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isFreeSectionOpen
                ? (
                  <div className="space-y-4 border-t border-stone-200 px-4 py-4">
                    {loading
                      ? (
                        <div className="flex items-center gap-2 text-sm text-stone-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t("attack.free.loading")}
                        </div>
                      )
                      : generatedTechniques.length > 0
                      ? (
                        <>
                          <div className="flex flex-wrap items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => setIsAttackFlowOpen(true)}
                              disabled={remainingTechniques.length === 0 || generatingAttack}
                              className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-60"
                            >
                              {generatingAttack
                                ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    {t("attack.free.preparing")}
                                  </>
                                )
                                : (
                                  <>
                                    <Plus className="h-3 w-3" />
                                    {t("attack.free.add")}
                                  </>
                                )}
                            </button>
                          </div>

                          <div className="grid gap-4 xl:grid-cols-2">
                            {generatedTechniques.map((technique) => (
                              <GeneratedAttackCard
                                key={technique.technique_key}
                                technique={technique}
                                analyzing={analyzingTechniqueKey === technique.technique_key}
                                onAdjust={(techniqueKey) =>
                                  setAdjustingTechniqueKey(techniqueKey)}
                              />
                            ))}
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <p className="text-xs text-stone-500">
                              {remainingTechniques.length === 0
                                ? t("attack.free.all_created")
                                : remainingTechniques.length === 1
                                ? t("attack.free.remaining_one", { count: 1 })
                                : t("attack.free.remaining_many", {
                                  count: remainingTechniques.length,
                                })}
                            </p>
                          </div>
                        </>
                      )
                      : (
                        <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-5 py-6 text-center">
                          <p className="text-sm leading-6 text-stone-600">
                            {t("attack.free.empty")}
                          </p>
                          <button
                            type="button"
                            onClick={() => setIsAttackFlowOpen(true)}
                            disabled={generatingAttack}
                            className="mt-4 inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            {generatingAttack
                              ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  {t("attack.free.preparing")}
                                </>
                              )
                              : t("attack.free.create_first")}
                          </button>
                        </div>
                      )}
                  </div>
                )
                : null}
            </div>
          </div>

          {planAttackCardsNode
            ? (
              <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50">
                <button
                  type="button"
                  onClick={() => setIsPlanSectionOpen((value) => !value)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-sky-50">
                      <MapIcon className="h-4 w-4 text-sky-700" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-stone-950">
                        {t("attack.plan.title")}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-stone-600">
                        {t("attack.plan.subtitle")}
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-stone-500 transition-transform duration-200 ${
                      isPlanSectionOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isPlanSectionOpen
                  ? (
                    <div className="border-t border-stone-200 px-4 py-4">
                      {planAttackCardsNode}
                    </div>
                  )
                  : null}
              </div>
            )
            : null}
        </CardShell>
      </div>

      <AttackTechniqueFlowModal
        isOpen={isAttackFlowOpen}
        techniques={remainingTechniques}
        generatingTechniqueKey={generatingTechniqueKey}
        onClose={() => setIsAttackFlowOpen(false)}
        onSubmit={onGenerateTechnique}
      />

      <AttackTechniqueAdjustmentModal
        isOpen={adjustingTechniqueKey !== null}
        currentTechniqueKey={adjustingTechniqueKey}
        techniques={techniques}
        analyzingTechniqueKey={analyzingTechniqueKey}
        generatingTechniqueKey={generatingTechniqueKey}
        onClose={() => setAdjustingTechniqueKey(null)}
        onAnalyze={onAnalyzeTechniqueAdjustment}
        onSubmit={onGenerateTechnique}
      />
    </div>
  )
}
