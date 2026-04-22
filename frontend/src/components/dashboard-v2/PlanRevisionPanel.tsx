import type { ReactNode } from "react";
import {
  Loader2,
  MessageSquareQuote,
  RefreshCcw,
} from "lucide-react";

import { getDisplayPhaseOrder } from "../../lib/planPhases";

export type PlanRevisionThreadEntry = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type PlanRevisionConversationMode =
  | "level_adjustment"
  | "plan_adjustment"
  | "explanation_chat"
  | "guardrail_chat";

export type PlanReviewSessionStatus =
  | "active"
  | "preview_ready"
  | "completed"
  | "expired"
  | "restarted";

export type PlanRevisionProposal = {
  review_id: string;
  review_kind: "clarification" | "preference_change" | "invalidating_fact";
  adjustment_scope: "current_level_only" | "future_levels_only" | "current_plus_future" | "full_plan";
  decision: "no_change" | "minor_adjustment" | "partial_replan" | "full_replan";
  understanding: string;
  impact: string;
  proposed_changes: string[];
  control_mode: "clarify_only" | "adjust_current_level" | "adjust_future_levels" | "advance_ready";
  resistance_note: string | null;
  principle_reminder: string | null;
  offer_complete_level: boolean;
  regeneration_feedback: string | null;
  clarification_question: string | null;
  assistant_summary: string;
  conversation_mode: PlanRevisionConversationMode;
  precision_count: number;
  message_count: number;
  session_status: PlanReviewSessionStatus;
  session_expires_at: string | null;
};

export type PlanRevisionPanelAction = {
  key: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  isLoading?: boolean;
  loadingLabel?: string;
};

type PlanRevisionPanelProps = {
  value: string;
  thread: PlanRevisionThreadEntry[];
  isBusy: boolean;
  errorMessage?: string | null;
  currentLevelTitle?: string | null;
  currentLevelOrder?: number | null;
  showComposer?: boolean;
  composerPlaceholder?: string;
  submitLabel?: string;
  helperText?: string | null;
  busyLabel?: string | null;
  previewNode?: ReactNode;
  actions?: PlanRevisionPanelAction[];
  onChange: (value: string) => void;
  onSubmit: () => void;
};

function actionClassName(variant: PlanRevisionPanelAction["variant"]) {
  switch (variant) {
    case "primary":
      return "border-blue-600 bg-blue-600 text-white hover:bg-blue-700";
    case "danger":
      return "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100";
    case "ghost":
      return "border-transparent bg-stone-100 text-stone-700 hover:bg-stone-200";
    case "secondary":
    default:
      return "border-stone-200 bg-white text-stone-700 hover:border-blue-200 hover:text-stone-950";
  }
}

export function PlanRevisionPanel({
  value,
  thread,
  isBusy,
  errorMessage,
  currentLevelTitle,
  currentLevelOrder,
  showComposer = true,
  composerPlaceholder,
  submitLabel = "Analyser la demande",
  helperText,
  busyLabel,
  previewNode,
  actions = [],
  onChange,
  onSubmit,
}: PlanRevisionPanelProps) {
  const canSubmit = value.trim().length > 0 && !isBusy;
  const levelLabel = currentLevelOrder
    ? `Niveau de plan ${getDisplayPhaseOrder(currentLevelOrder)}`
    : "Niveau de plan actuel";

  return (
    <section className="rounded-[30px] border border-blue-100 bg-white px-5 py-5 shadow-sm">
      <div className="flex items-center gap-2 text-blue-700">
        <MessageSquareQuote className="h-5 w-5" />
        <h3 className="text-lg font-semibold text-stone-950">Ajuster le plan</h3>
      </div>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
        {levelLabel}{currentLevelTitle ? ` — ${currentLevelTitle}` : ""}
      </p>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
        Ici, tu peux signaler qu&apos;un niveau est trop lourd, trop léger, déjà absorbé, mal placé
        dans la semaine, ou qu&apos;un élément nouveau change la façon d&apos;ajuster le plan.
      </p>

      {thread.length > 0 ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          {thread.map((entry, index) => (
            <div
              key={`${entry.created_at}-${index}`}
              className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                entry.role === "user"
                  ? "ml-auto max-w-[88%] bg-blue-600 text-white"
                  : "mr-auto max-w-[92%] border border-stone-200 bg-white text-stone-700"
              }`}
            >
              {entry.content}
            </div>
          ))}
        </div>
      ) : null}

      {helperText ? (
        <p className="mt-4 text-sm leading-6 text-stone-600">
          {helperText}
        </p>
      ) : null}

      {showComposer ? (
        <div className="mt-4">
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={4}
            placeholder={composerPlaceholder ?? "Explique ce que tu veux ajuster dans le plan."}
            className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void onSubmit()}
              disabled={!canSubmit}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-blue-200 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyse en cours…
                </>
              ) : (
                <>
                  <RefreshCcw className="h-4 w-4" />
                  {submitLabel}
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {errorMessage}
        </div>
      ) : null}

      {isBusy && busyLabel ? (
        <div className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{busyLabel}</span>
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-3">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={action.onClick}
              disabled={Boolean(action.disabled)}
              className={`inline-flex items-center justify-center rounded-xl border px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${actionClassName(action.variant)}`}
            >
              {action.isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {action.loadingLabel ?? action.label}
                </>
              ) : (
                action.label
              )}
            </button>
          ))}
        </div>
      ) : null}

      {previewNode ? (
        <div className="mt-5">
          {previewNode}
        </div>
      ) : null}
    </section>
  );
}
