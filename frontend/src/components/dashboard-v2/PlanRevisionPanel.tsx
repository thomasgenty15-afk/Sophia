import {
  CheckCircle2,
  GitBranch,
  Loader2,
  MessageSquareQuote,
  RefreshCcw,
} from "lucide-react";

export type PlanRevisionThreadEntry = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

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
};

type PlanRevisionPanelProps = {
  value: string;
  thread: PlanRevisionThreadEntry[];
  proposal: PlanRevisionProposal | null;
  isBusy: boolean;
  currentLevelTitle?: string | null;
  currentLevelOrder?: number | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onDismissProposal: () => void;
  onCompleteLevel: () => void;
};

function reviewKindLabel(kind: PlanRevisionProposal["review_kind"]) {
  switch (kind) {
    case "clarification":
      return "Clarification";
    case "preference_change":
      return "Préférence";
    case "invalidating_fact":
      return "Fait nouveau";
  }
}

function decisionLabel(decision: PlanRevisionProposal["decision"]) {
  switch (decision) {
    case "no_change":
      return "Pas de changement";
    case "minor_adjustment":
      return "Ajustement mineur";
    case "partial_replan":
      return "Révision partielle";
    case "full_replan":
      return "Révision complète";
  }
}

function adjustmentScopeLabel(scope: PlanRevisionProposal["adjustment_scope"]) {
  switch (scope) {
    case "current_level_only":
      return "Niveau actuel";
    case "future_levels_only":
      return "Niveaux suivants";
    case "current_plus_future":
      return "Niveau + suite";
    case "full_plan":
      return "Plan complet";
  }
}

export function PlanRevisionPanel({
  value,
  thread,
  proposal,
  isBusy,
  currentLevelTitle,
  currentLevelOrder,
  onChange,
  onSubmit,
  onDismissProposal,
  onCompleteLevel,
}: PlanRevisionPanelProps) {
  const canSubmit = value.trim().length > 0 && !isBusy;
  const levelLabel = currentLevelOrder
    ? `Niveau de plan ${currentLevelOrder}`
    : "Niveau de plan actuel";

  return (
    <section className="rounded-[30px] border border-blue-100 bg-white px-5 py-5 shadow-sm">
      <div className="flex items-center gap-2 text-blue-700">
        <MessageSquareQuote className="h-5 w-5" />
        <h3 className="text-lg font-semibold text-stone-950">Panneau de contrôle</h3>
      </div>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
        {levelLabel}{currentLevelTitle ? ` — ${currentLevelTitle}` : ""}
      </p>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
        Ici, tu peux signaler qu&apos;un niveau est trop lourd, trop léger, déjà absorbé, mal placé
        dans la semaine, ou que tu te sens prêt à aller plus vite. Sophia te répond avec une
        proposition encadrée pour le niveau actuel, la suite du plan, ou le passage au niveau
        suivant si ça a du sens.
      </p>

      {thread.length > 0 ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          {thread.slice(-4).map((entry, index) => (
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

      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        placeholder="Exemple: la mission du mardi tombe mal. Ou: j'ai déjà absorbé ce niveau, je me sens prêt pour la suite. Ou: ce niveau demande trop de répétitions pour l'instant."
        className="mt-4 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
      />

      {proposal ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
              {reviewKindLabel(proposal.review_kind)}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-600">
              {decisionLabel(proposal.decision)}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-600">
              {adjustmentScopeLabel(proposal.adjustment_scope)}
            </span>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Ce qu&apos;on a compris
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-700">{proposal.understanding}</p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Impact sur le plan
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-700">{proposal.impact}</p>
            </div>
          </div>

          {proposal.resistance_note || proposal.principle_reminder ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {proposal.resistance_note ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Point de vigilance
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-700">
                    {proposal.resistance_note}
                  </p>
                </div>
              ) : null}
              {proposal.principle_reminder ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50/70 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
                    Principe à garder
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-700">
                    {proposal.principle_reminder}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl border border-emerald-200 bg-white px-4 py-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <GitBranch className="h-4 w-4" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                Proposition
              </p>
            </div>
            <div className="mt-3 space-y-2">
              {proposal.proposed_changes.map((change) => (
                <div key={change} className="flex items-start gap-2 text-sm text-stone-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{change}</span>
                </div>
              ))}
            </div>
            {proposal.clarification_question ? (
              <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                {proposal.clarification_question}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onSubmit}
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
              Analyser la demande
            </>
          )}
        </button>

        {proposal?.offer_complete_level ? (
          <button
            type="button"
            onClick={onCompleteLevel}
            disabled={isBusy}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Valider ce niveau et passer au suivant
          </button>
        ) : null}

        {proposal ? (
          <button
            type="button"
            onClick={onDismissProposal}
            disabled={isBusy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Garder le plan actuel
          </button>
        ) : null}
      </div>
    </section>
  );
}
