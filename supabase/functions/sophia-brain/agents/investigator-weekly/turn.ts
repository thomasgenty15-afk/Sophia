import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import { generateWithGemini } from "../../../_shared/gemini.ts";
import { resolveBinaryConsent, resolveSuggestionConsent } from "../investigator/utils.ts";
import { updateEtoilePolaire } from "../../lib/north_star_tools.ts";
import { weeklyInvestigatorSay } from "./copy.ts";
import { persistWeeklyRecap } from "./db.ts";
import {
  applySuggestionProposal,
  buildSuggestionQueue,
  logWeeklySuggestionOutcome,
} from "./suggestions.ts";
import type {
  WeeklyInvestigationState,
  WeeklyPhase,
  WeeklyRecapDraft,
  WeeklySuggestionOutcome,
  WeeklySuggestionProposal,
} from "./types.ts";

type WeeklyTurnResult = {
  content: string;
  investigationComplete: boolean;
  newState: WeeklyInvestigationState | null;
};

type TransitionDecision = "stay_on_topic" | "next_topic" | "closing";

type TransitionModelResult = {
  decision: TransitionDecision;
  new_info: boolean;
  decisions_next_week: string[];
  coach_note: string | null;
};

const PHASE_ORDER: WeeklyPhase[] = [
  "execution",
  "etoile_polaire",
  "action_load",
  "closing",
];

function uniqText(items: string[]): string[] {
  return [...new Set(items.map((x) => String(x ?? "").trim()).filter(Boolean))];
}

function nextPhase(current: WeeklyPhase): WeeklyPhase {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx < 0 || idx >= PHASE_ORDER.length - 1) return "closing";
  return PHASE_ORDER[idx + 1] ?? "closing";
}

function safeJsonParse(raw: unknown): any {
  const text = String(raw ?? "")
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseTransitionResult(raw: unknown): TransitionModelResult {
  const parsed = safeJsonParse(raw) ?? {};
  const decisionRaw = String(parsed?.decision ?? "stay_on_topic").trim();
  const decision: TransitionDecision =
    decisionRaw === "next_topic" || decisionRaw === "closing"
      ? decisionRaw
      : "stay_on_topic";

  const newInfo = Boolean(parsed?.new_info);
  const decisions = Array.isArray(parsed?.decisions_next_week)
    ? parsed.decisions_next_week.map((x: unknown) => String(x ?? "").trim()).filter(Boolean).slice(0, 4)
    : [];
  const coachNote = String(parsed?.coach_note ?? "").trim();

  return {
    decision,
    new_info: newInfo,
    decisions_next_week: decisions,
    coach_note: coachNote ? coachNote.slice(0, 600) : null,
  };
}

async function classifyTransition(opts: {
  message: string;
  state: WeeklyInvestigationState;
  history: any[];
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string };
}): Promise<TransitionModelResult> {
  const { message, state, history, meta } = opts;
  const prompt = [
    "Tu es un classifieur de transition pour un bilan hebdomadaire.",
    "Rends UNIQUEMENT du JSON avec ce format:",
    '{"decision":"stay_on_topic|next_topic|closing","new_info":boolean,"decisions_next_week":string[],"coach_note":string|null}',
    "Règles:",
    "- stay_on_topic: continuer le même bloc.",
    "- next_topic: passer au bloc suivant.",
    "- closing: passer à la synthèse finale.",
    "- decisions_next_week: max 3 décisions concrètes.",
    "- coach_note: 1 phrase utile et courte.",
    `phase_actuelle=${state.weekly_phase}`,
    `turn_count=${state.turn_count}`,
    `stagnation=${state.weekly_stagnation_count}`,
    `covered=${JSON.stringify(state.weekly_covered_topics ?? [])}`,
    `payload=${JSON.stringify(state.weekly_payload)}`,
    `recent_history=${JSON.stringify((history ?? []).slice(-12))}`,
    `user_message=${JSON.stringify(message)}`,
  ].join("\n");

  try {
    const raw = await generateWithGemini(
      prompt,
      "Classe la transition.",
      0.1,
      true,
      [],
      "auto",
      {
        requestId: meta?.requestId,
        model: meta?.model,
        source: "sophia-brain:investigator_weekly_transition",
        forceRealAi: meta?.forceRealAi,
      },
    );
    return parseTransitionResult(raw);
  } catch {
    return {
      decision: "stay_on_topic",
      new_info: String(message ?? "").trim().length > 15,
      decisions_next_week: [],
      coach_note: null,
    };
  }
}

function maybeExtractNumber(text: string): number | null {
  const m = String(text ?? "").replace(/,/g, ".").match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function extractProposedEtoileValueFromText(text: string): number | null {
  const src = String(text ?? "").replace(/,/g, ".").trim();
  if (!src) return null;

  // Typical wording: "mettre à jour ta valeur à 3 pour ton Etoile Polaire"
  const direct = src.match(/(?:valeur|mettre(?:\s+\S+){0,8})\s+à\s*(-?\d+(?:\.\d+)?)/i);
  if (direct?.[1]) {
    const n = Number(direct[1]);
    if (Number.isFinite(n)) return n;
  }

  // Fallback: if message explicitly references Etoile Polaire, take last numeric token.
  if (/etoile\s+polaire/i.test(src)) {
    const all = [...src.matchAll(/-?\d+(?:\.\d+)?/g)];
    if (all.length > 0) {
      const n = Number(all[all.length - 1][0]);
      if (Number.isFinite(n)) return n;
    }
  }

  return null;
}

function extractRecentAssistantProposedValue(history: any[]): number | null {
  const rows = Array.isArray(history) ? history : [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const role = String((rows[i] as any)?.role ?? "").trim();
    if (role !== "assistant") continue;
    const content = String((rows[i] as any)?.content ?? "");
    const value = extractProposedEtoileValueFromText(content);
    if (value !== null) return value;
  }
  return null;
}

async function maybeHandleEtoileToolCall(opts: {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  history: any[];
  state: WeeklyInvestigationState;
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string };
}): Promise<any | null> {
  if (opts.state.weekly_phase !== "etoile_polaire") return null;

  const consent = resolveBinaryConsent(opts.message);
  const candidate = maybeExtractNumber(opts.message);
  const proposedFromHistory = extractRecentAssistantProposedValue(opts.history);
  // If assistant already proposed a concrete value and user confirms with "oui",
  // apply it directly to avoid asking the same question again.
  const effectiveValue = candidate ?? (consent === "yes" ? proposedFromHistory : null);
  if (effectiveValue === null) return null;

  const updated = await updateEtoilePolaire(opts.supabase, opts.userId, {
    new_value: effectiveValue,
    note: String(opts.message ?? "").slice(0, 400),
  }).catch(() => null);
  return updated
    ? { ...updated, source: consent === "yes" && candidate === null ? "consent_proposed_value" : "explicit_value" }
    : updated;
}

function mergeDraft(
  prev: WeeklyRecapDraft,
  update: TransitionModelResult,
  toolResult: any,
): WeeklyRecapDraft {
  const mergedDecisions = uniqText([
    ...(Array.isArray(prev?.decisions_next_week) ? prev.decisions_next_week : []),
    ...update.decisions_next_week,
  ]).slice(0, 6);

  const toolDecision = toolResult?.success
    ? `Etoile Polaire mise à jour à ${String(toolResult.new_value)}${toolResult.unit ? ` ${toolResult.unit}` : ""}`
    : "";

  const decisions = toolDecision
    ? uniqText([...mergedDecisions, toolDecision]).slice(0, 6)
    : mergedDecisions;

  const coachNote = update.coach_note ?? prev?.coach_note ?? undefined;

  return {
    decisions_next_week: decisions,
    ...(coachNote ? { coach_note: coachNote } : {}),
  };
}

function withOutcome(
  outcomes: WeeklySuggestionOutcome[] | undefined,
  outcome: WeeklySuggestionOutcome,
): WeeklySuggestionOutcome[] {
  return [...(Array.isArray(outcomes) ? outcomes : []), outcome].slice(-12);
}

function mergeDecisionNote(prev: WeeklyRecapDraft, note: string): WeeklyRecapDraft {
  return {
    ...prev,
    decisions_next_week: uniqText([
      ...(Array.isArray(prev?.decisions_next_week) ? prev.decisions_next_week : []),
      String(note ?? "").trim(),
    ]).slice(0, 6),
  };
}

function shiftProposalQueue(
  queue: WeeklySuggestionProposal[] | undefined,
): { pending: WeeklySuggestionProposal | null; rest: WeeklySuggestionProposal[] } {
  const rows = Array.isArray(queue) ? queue : [];
  const [pending, ...rest] = rows;
  return { pending: pending ?? null, rest };
}

async function buildSuggestionConsentReask(opts: {
  proposal: WeeklySuggestionProposal;
  message: string;
  state: WeeklyInvestigationState;
  history: any[];
  meta?: {
    requestId?: string;
    forceRealAi?: boolean;
    channel?: "web" | "whatsapp";
    model?: string;
  };
}): Promise<string> {
  try {
    return await weeklyInvestigatorSay(
      "weekly_bilan_reask_suggestion",
      {
        user_message: opts.message,
        suggestion_proposal: opts.proposal,
        weekly_payload: opts.state.weekly_payload,
        opening_context: opts.state.opening_context ?? null,
        recent_history: (opts.history ?? []).slice(-12),
      },
      opts.meta,
    );
  } catch {
    return `${opts.proposal.prompt} Si tu préfères, dis-moi simplement si on le fait maintenant, si on le laisse comme ça, ou si on en reparle plus tard.`;
  }
}

export async function handleWeeklyTurn(opts: {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  history: any[];
  state: WeeklyInvestigationState;
  meta?: {
    requestId?: string;
    forceRealAi?: boolean;
    channel?: "web" | "whatsapp";
    model?: string;
  };
}): Promise<WeeklyTurnResult> {
  const { supabase, userId, message, history, state, meta } = opts;

  if (state.weekly_phase === "action_load" && state.weekly_pending_suggestion) {
    const consent = resolveSuggestionConsent(message);
    const proposal = state.weekly_pending_suggestion;
    const weekStart = String(state.weekly_payload?.week_start ?? "").trim();

    if (consent === "accept") {
      try {
        const applied = await applySuggestionProposal({ supabase, userId, proposal });
        await logWeeklySuggestionOutcome({
          supabase,
          userId,
          weekStart,
          proposal,
          outcome: "applied",
          summary: applied.summary,
          appliedChanges: applied.applied_changes,
        }).catch(() => null);

        const outcome: WeeklySuggestionOutcome = {
          proposal_id: proposal.id,
          outcome: "applied",
          summary: applied.summary,
          applied_changes: applied.applied_changes,
          created_at: new Date().toISOString(),
        };
        const nextDraft = mergeDecisionNote(
          state.weekly_recap_draft ?? { decisions_next_week: [] },
          applied.applied_changes.join(" • "),
        );
        const { pending: nextPending, rest: nextQueue } = shiftProposalQueue(state.weekly_suggestion_queue);
        return {
          content: nextPending
            ? `${applied.summary} ${nextPending.prompt}`
            : `${applied.summary} On garde ce réglage pour la semaine qui vient.`,
          investigationComplete: false,
          newState: {
            ...state,
            weekly_recap_draft: nextDraft,
            weekly_pending_suggestion: nextPending,
            weekly_suggestion_queue: nextQueue,
            weekly_suggestion_outcomes: withOutcome(state.weekly_suggestion_outcomes, outcome),
            turn_count: (state.turn_count ?? 0) + 1,
            updated_at: new Date().toISOString(),
          },
        };
      } catch {
        const summary = "Je n'ai pas réussi à appliquer ce changement tout de suite.";
        await logWeeklySuggestionOutcome({
          supabase,
          userId,
          weekStart,
          proposal,
          outcome: "failed",
          summary,
        }).catch(() => null);
        const outcome: WeeklySuggestionOutcome = {
          proposal_id: proposal.id,
          outcome: "failed",
          summary,
          created_at: new Date().toISOString(),
        };
        return {
          content: `${summary} On peut le garder comme recommandation pour plus tard.`,
          investigationComplete: false,
          newState: {
            ...state,
            weekly_suggestion_outcomes: withOutcome(state.weekly_suggestion_outcomes, outcome),
            turn_count: (state.turn_count ?? 0) + 1,
            updated_at: new Date().toISOString(),
          },
        };
      }
    }

    if (consent === "reject" || consent === "defer") {
      const summary = "Ok, on ne touche pas à ça pour l'instant.";
      await logWeeklySuggestionOutcome({
        supabase,
        userId,
        weekStart,
        proposal,
        outcome: "rejected",
        summary,
      }).catch(() => null);
      const outcome: WeeklySuggestionOutcome = {
        proposal_id: proposal.id,
        outcome: "rejected",
        summary,
        created_at: new Date().toISOString(),
      };
      const { pending: nextPending, rest: nextQueue } = shiftProposalQueue(state.weekly_suggestion_queue);
      return {
        content: nextPending
          ? `${summary} ${nextPending.prompt}`
          : `${summary} On garde donc les actions comme elles sont.`,
        investigationComplete: false,
        newState: {
          ...state,
          weekly_pending_suggestion: nextPending,
          weekly_suggestion_queue: nextQueue,
          weekly_suggestion_outcomes: withOutcome(state.weekly_suggestion_outcomes, outcome),
          turn_count: (state.turn_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        },
      };
    }

    return {
      content: await buildSuggestionConsentReask({
        proposal,
        message,
        state,
        history,
        meta,
      }),
      investigationComplete: false,
      newState: {
        ...state,
        updated_at: new Date().toISOString(),
      },
    };
  }

  const transition = await classifyTransition({ message, state, history, meta });

  let decision: TransitionDecision = transition.decision;
  let stagnation = transition.new_info || decision !== "stay_on_topic"
    ? 0
    : (state.weekly_stagnation_count ?? 0) + 1;

  const turnCount = (state.turn_count ?? 0) + 1;
  const coveredSet = new Set((state.weekly_covered_topics ?? []).map((x) => String(x)));
  coveredSet.add(state.weekly_phase);

  const hasCoreCoverage = ["execution", "etoile_polaire", "action_load"].every((x) =>
    coveredSet.has(x)
  );

  if (turnCount >= 12) {
    decision = "closing";
  } else if (stagnation >= 3 && state.weekly_phase !== "closing") {
    decision = "next_topic";
    stagnation = 0;
  } else if (turnCount >= 10 && decision === "stay_on_topic") {
    decision = "closing";
  } else if (turnCount >= 6 && hasCoreCoverage && decision === "stay_on_topic") {
    decision = "closing";
  }

  const toolResult = await maybeHandleEtoileToolCall({
    supabase,
    userId,
    message,
    history,
    state,
    meta,
  });

  if (
    state.weekly_phase === "etoile_polaire" &&
    toolResult?.success &&
    toolResult?.source === "consent_proposed_value" &&
    decision === "stay_on_topic"
  ) {
    // The user already accepted the proposed value: move forward, don't ask again.
    decision = "next_topic";
    stagnation = 0;
  }

  const nextDraft = mergeDraft(
    state.weekly_recap_draft ?? { decisions_next_week: [] },
    transition,
    toolResult,
  );

  let targetPhase: WeeklyPhase = state.weekly_phase;
  if (decision === "next_topic") targetPhase = nextPhase(state.weekly_phase);
  if (decision === "closing") targetPhase = "closing";

  if (targetPhase === "closing") {
    const closingText = await weeklyInvestigatorSay(
      "weekly_bilan_closing",
      {
        user_message: message,
        weekly_payload: state.weekly_payload,
        decisions_next_week: nextDraft.decisions_next_week,
        coach_note: nextDraft.coach_note ?? null,
        tool_result: toolResult,
        suggestion_outcomes: state.weekly_suggestion_outcomes ?? [],
      },
      meta,
    );

    await persistWeeklyRecap({
      supabase,
      userId,
      state: {
        ...state,
        weekly_recap_draft: nextDraft,
      },
      closingMessage: closingText,
    }).catch((e) => {
      console.error("[investigator-weekly] persistWeeklyRecap failed:", e);
    });

    return {
      content: closingText,
      investigationComplete: true,
      newState: null,
    };
  }

  const scenario = targetPhase === "execution"
    ? "weekly_bilan_execution"
    : targetPhase === "etoile_polaire"
    ? "weekly_bilan_etoile_polaire"
    : "weekly_bilan_action_load";

  const etoilePolaireMissing =
    targetPhase === "etoile_polaire" && !state.weekly_payload?.etoile_polaire;

  const seededQueue = targetPhase === "action_load"
    ? ((Array.isArray(state.weekly_suggestion_queue) && state.weekly_suggestion_queue.length > 0)
      ? state.weekly_suggestion_queue
      : buildSuggestionQueue(state.weekly_payload))
    : (state.weekly_suggestion_queue ?? []);
  const pendingSuggestionForPrompt = targetPhase === "action_load" && !state.weekly_pending_suggestion
    ? shiftProposalQueue(seededQueue).pending
    : state.weekly_pending_suggestion ?? null;
  const remainingQueueForState = targetPhase === "action_load" && !state.weekly_pending_suggestion
    ? shiftProposalQueue(seededQueue).rest
    : (state.weekly_suggestion_queue ?? []);

  const text = await weeklyInvestigatorSay(
    scenario,
    {
      user_message: message,
      transition: decision,
      phase: targetPhase,
      weekly_payload: state.weekly_payload,
      covered_topics: [...coveredSet],
      stagnation_count: stagnation,
      turn_count: turnCount,
      tool_result: toolResult,
      recap_draft: nextDraft,
      suggestion_proposal: pendingSuggestionForPrompt,
      suggestion_outcomes: state.weekly_suggestion_outcomes ?? [],
      recent_history: (history ?? []).slice(-15),
      etoile_polaire_missing: etoilePolaireMissing,
      etoile_polaire_missing_guidance: etoilePolaireMissing
        ? "Encourage l'utilisateur a configurer son Etoile Polaire en expliquant la valeur: cap long terme, meilleure priorisation, et mesure claire de progression semaine apres semaine."
        : null,
    },
    meta,
  );

  const nextState: WeeklyInvestigationState = {
    ...state,
    status: "reviewing",
    weekly_phase: targetPhase,
    weekly_covered_topics: [...coveredSet],
    weekly_stagnation_count: stagnation,
    weekly_recap_draft: nextDraft,
    weekly_suggestion_queue: remainingQueueForState,
    weekly_pending_suggestion: pendingSuggestionForPrompt,
    weekly_suggestion_outcomes: state.weekly_suggestion_outcomes ?? [],
    turn_count: turnCount,
    updated_at: new Date().toISOString(),
  };

  return {
    content: text,
    investigationComplete: false,
    newState: nextState,
  };
}
