import { generateWithGemini, getGlobalAiModel } from "../_shared/gemini.ts";
import type {
  CoachingInterventionOutcome,
  CoachingInterventionRuntimeAddon,
  CoachingInterventionTechniqueHistory,
} from "./coaching_intervention_selector.ts";
import type {
  CoachingBlockerType,
  CoachingTechniqueId,
} from "./coaching_interventions.ts";

export interface CoachingInterventionHistoryEntry
  extends CoachingInterventionTechniqueHistory {
  intervention_id: string;
  status: "pending" | "resolved" | "expired";
  proposed_at: string;
  resolved_at?: string | null;
  target_action_title?: string | null;
  selector_source?: "llm" | "fallback" | null;
  outcome_reason?: string | null;
}

export interface CoachingInterventionPendingState {
  intervention_id: string;
  technique_id: CoachingTechniqueId;
  blocker_type: CoachingBlockerType | "unknown";
  proposed_at: string;
  follow_up_due_at?: string | null;
  target_action_title?: string | null;
  selector_source?: "llm" | "fallback" | null;
}

export interface CoachingInterventionFollowUpDecision {
  decision: "ignore" | "resolve";
  outcome?: CoachingInterventionOutcome;
  helpful?: boolean | null;
  reason?: string | null;
}

const HISTORY_KEY = "__coaching_intervention_history";
const PENDING_KEY = "__coaching_intervention_pending";
const MAX_HISTORY = 24;
const PENDING_EXPIRY_HOURS = 96;

const OUTCOME_PATTERNS = {
  not_tried: [
    /\bj[' ]?ai pas test[eé]\b/i,
    /\bpas test[eé]\b/i,
    /\bpas essay[eé]\b/i,
    /\bj[' ]?ai oubli[eé]\b/i,
    /\bje ne l[' ]?ai pas fait\b/i,
  ],
  tried_not_helpful: [
    /\bca n[' ]?a pas aid[eé]\b/i,
    /\bça n[' ]?a pas aid[eé]\b/i,
    /\bca n[' ]?a pas march[eé]\b/i,
    /\bça n[' ]?a pas march[eé]\b/i,
    /\bpas utile\b/i,
    /\bj[' ]?ai quand m[eê]me fum[eé]\b/i,
    /\bj[' ]?ai essay[eé].*pas march[eé]\b/i,
  ],
  tried_helpful: [
    /\bca m[' ]?a aid[eé]\b/i,
    /\bça m[' ]?a aid[eé]\b/i,
    /\bca a aid[eé]\b/i,
    /\bça a aid[eé]\b/i,
    /\bca a march[eé]\b/i,
    /\bça a march[eé]\b/i,
    /\bun peu aid[eé]\b/i,
    /\bj[' ]?ai test[eé]\b/i,
    /\bj[' ]?ai essay[eé]\b/i,
  ],
  behavior_changed: [
    /\bj[' ]?ai r[eé]ussi\b/i,
    /\bje n[' ]?ai pas fum[eé]\b/i,
    /\bj[' ]?ai tenu\b/i,
    /\bj[' ]?ai fait la t[aâ]che\b/i,
    /\bj[' ]?ai fait l[' ]?appel\b/i,
    /\bj[' ]?ai commenc[eé]\b/i,
    /\bj[' ]?ai avanc[eé]\b/i,
  ],
} as const;

function nowIso(): string {
  return new Date().toISOString();
}

function safeGlobalAiModel(fallback = "gemini-2.5-flash"): string {
  try {
    return getGlobalAiModel(fallback);
  } catch {
    return fallback;
  }
}

function parseIsoMs(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function safeObj(x: any): Record<string, unknown> {
  return x && typeof x === "object" && !Array.isArray(x)
    ? x as Record<string, unknown>
    : {};
}

function normalizeOutcome(value: unknown): CoachingInterventionOutcome {
  switch (String(value ?? "").trim()) {
    case "not_tried":
    case "tried_not_helpful":
    case "tried_helpful":
    case "behavior_changed":
      return String(value) as CoachingInterventionOutcome;
    default:
      return "unknown";
  }
}

function normalizeHistoryEntry(raw: any): CoachingInterventionHistoryEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const interventionId = String(raw.intervention_id ?? "").trim();
  const techniqueId = String(raw.technique_id ?? "").trim();
  if (!interventionId || !techniqueId) return null;
  const statusRaw = String(raw.status ?? "resolved").trim();
  const status = statusRaw === "pending" || statusRaw === "expired"
    ? statusRaw
    : "resolved";
  return {
    intervention_id: interventionId,
    technique_id: techniqueId as CoachingTechniqueId,
    blocker_type: typeof raw.blocker_type === "string"
      ? raw.blocker_type as CoachingBlockerType
      : null,
    outcome: normalizeOutcome(raw.outcome),
    helpful: typeof raw.helpful === "boolean" ? raw.helpful : null,
    last_used_at: typeof raw.last_used_at === "string" ? raw.last_used_at : null,
    status,
    proposed_at: typeof raw.proposed_at === "string" ? raw.proposed_at : nowIso(),
    resolved_at: typeof raw.resolved_at === "string" ? raw.resolved_at : null,
    target_action_title: typeof raw.target_action_title === "string"
      ? raw.target_action_title
      : null,
    selector_source: raw.selector_source === "llm" || raw.selector_source === "fallback"
      ? raw.selector_source
      : null,
    outcome_reason: typeof raw.outcome_reason === "string" ? raw.outcome_reason : null,
  };
}

function normalizePending(raw: any): CoachingInterventionPendingState | null {
  if (!raw || typeof raw !== "object") return null;
  const interventionId = String(raw.intervention_id ?? "").trim();
  const techniqueId = String(raw.technique_id ?? "").trim();
  if (!interventionId || !techniqueId) return null;
  return {
    intervention_id: interventionId,
    technique_id: techniqueId as CoachingTechniqueId,
    blocker_type: typeof raw.blocker_type === "string"
      ? raw.blocker_type as CoachingBlockerType | "unknown"
      : "unknown",
    proposed_at: typeof raw.proposed_at === "string" ? raw.proposed_at : nowIso(),
    follow_up_due_at: typeof raw.follow_up_due_at === "string"
      ? raw.follow_up_due_at
      : null,
    target_action_title: typeof raw.target_action_title === "string"
      ? raw.target_action_title
      : null,
    selector_source: raw.selector_source === "llm" || raw.selector_source === "fallback"
      ? raw.selector_source
      : null,
  };
}

export function readCoachingInterventionMemory(tempMemory: any): {
  history: CoachingInterventionHistoryEntry[];
  pending: CoachingInterventionPendingState | null;
} {
  const tm = safeObj(tempMemory);
  const rawHistory = Array.isArray((tm as any)[HISTORY_KEY])
    ? (tm as any)[HISTORY_KEY]
    : [];
  const history = rawHistory
    .map((item: any) => normalizeHistoryEntry(item))
    .filter(Boolean) as CoachingInterventionHistoryEntry[];
  const pending = normalizePending((tm as any)[PENDING_KEY]);
  return { history: history.slice(-MAX_HISTORY), pending };
}

function writeCoachingInterventionMemory(args: {
  tempMemory: any;
  history: CoachingInterventionHistoryEntry[];
  pending: CoachingInterventionPendingState | null;
}) {
  const next = {
    ...(safeObj(args.tempMemory)),
    [HISTORY_KEY]: args.history.slice(-MAX_HISTORY),
  } as any;
  if (args.pending) {
    next[PENDING_KEY] = args.pending;
  } else {
    delete next[PENDING_KEY];
  }
  return next;
}

export function buildTechniqueHistoryForSelector(
  tempMemory: any,
): CoachingInterventionTechniqueHistory[] {
  const memory = readCoachingInterventionMemory(tempMemory);
  const entries = memory.history.slice(-16).map((item) => ({
    technique_id: item.technique_id,
    blocker_type: item.blocker_type ?? null,
    outcome: memory.pending &&
        item.intervention_id === memory.pending.intervention_id &&
        item.status === "pending"
      ? "not_tried"
      : item.outcome,
    helpful: item.helpful ?? null,
    last_used_at: item.resolved_at ?? item.proposed_at,
  }));
  return entries.slice(-16);
}

function classifyOutcomeHeuristically(
  message: string,
): CoachingInterventionFollowUpDecision {
  const text = String(message ?? "").trim();
  if (!text) return { decision: "ignore" };
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (OUTCOME_PATTERNS.behavior_changed.some((pattern) => pattern.test(text))) {
    return {
      decision: "resolve",
      outcome: "behavior_changed",
      helpful: true,
      reason: "heuristic_behavior_changed",
    };
  }
  if (
    normalized.includes("j'ai commence") ||
    normalized.includes("j'ai finalement commence") ||
    normalized.includes("j'ai reussi") ||
    normalized.includes("je n'ai pas fume")
  ) {
    return {
      decision: "resolve",
      outcome: "behavior_changed",
      helpful: true,
      reason: "heuristic_normalized_behavior_changed",
    };
  }
  if (OUTCOME_PATTERNS.tried_not_helpful.some((pattern) => pattern.test(text))) {
    return {
      decision: "resolve",
      outcome: "tried_not_helpful",
      helpful: false,
      reason: "heuristic_tried_not_helpful",
    };
  }
  if (OUTCOME_PATTERNS.not_tried.some((pattern) => pattern.test(text))) {
    return {
      decision: "resolve",
      outcome: "not_tried",
      helpful: false,
      reason: "heuristic_not_tried",
    };
  }
  if (OUTCOME_PATTERNS.tried_helpful.some((pattern) => pattern.test(text))) {
    return {
      decision: "resolve",
      outcome: "tried_helpful",
      helpful: true,
      reason: "heuristic_tried_helpful",
    };
  }
  if (
    normalized.includes("j'ai teste") &&
    (normalized.includes("ca m'a aide") || normalized.includes("ca a aide"))
  ) {
    return {
      decision: "resolve",
      outcome: "tried_helpful",
      helpful: true,
      reason: "heuristic_normalized_tried_helpful",
    };
  }
  return { decision: "ignore" };
}

export async function classifyCoachingInterventionFollowUp(args: {
  pending: CoachingInterventionPendingState;
  userMessage: string;
  history: any[];
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string; userId?: string };
}): Promise<CoachingInterventionFollowUpDecision> {
  const heuristic = classifyOutcomeHeuristically(args.userMessage);
  if (heuristic.decision === "resolve") return heuristic;

  const message = String(args.userMessage ?? "").trim();
  if (!message) return { decision: "ignore" };

  const historyBlock = (args.history ?? [])
    .slice(-4)
    .map((m: any) => `${String(m?.role ?? "unknown")}: ${String(m?.content ?? "").trim().slice(0, 200)}`)
    .join("\n");

  const prompt = `
Tu determines si le message utilisateur donne un retour exploitable sur une technique coach proposee precedemment.

Technique en attente:
- technique_id: ${args.pending.technique_id}
- blocker_type: ${args.pending.blocker_type}
- action_title: ${args.pending.target_action_title ?? "unknown"}

Règles:
- decision=ignore si le message ne parle pas vraiment du test, du resultat, ou du fait d'avoir essaye / pas essaye.
- decision=resolve seulement si on peut classer le retour utilement.
- behavior_changed = le comportement cible a effectivement change.
- tried_helpful = il a teste et cela a aide, meme partiellement.
- tried_not_helpful = il a teste mais cela n'a pas aide.
- not_tried = il n'a pas essaye.

Réponds en JSON STRICT:
{
  "decision": "ignore" | "resolve",
  "outcome": "unknown" | "not_tried" | "tried_not_helpful" | "tried_helpful" | "behavior_changed" | null,
  "helpful": boolean | null,
  "reason": string
}

Historique recent:
${historyBlock || "(vide)"}
  `.trim();

  try {
    const raw = await generateWithGemini(
      prompt,
      message,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: args.meta?.requestId,
        model: args.meta?.model ?? safeGlobalAiModel("gemini-2.5-flash"),
        source: "sophia-brain:coaching-intervention-followup",
        forceRealAi: args.meta?.forceRealAi,
        userId: args.meta?.userId,
      },
    );
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const decision = String((parsed as any)?.decision ?? "").trim();
    if (decision !== "resolve") return { decision: "ignore" };
    return {
      decision: "resolve",
      outcome: normalizeOutcome((parsed as any)?.outcome),
      helpful: typeof (parsed as any)?.helpful === "boolean"
        ? Boolean((parsed as any).helpful)
        : null,
      reason: String((parsed as any)?.reason ?? "").trim().slice(0, 180) ||
        "llm_followup_resolve",
    };
  } catch (error) {
    console.warn(
      "[CoachingInterventionTracking] follow-up classifier failed:",
      error,
    );
    return { decision: "ignore" };
  }
}

export async function reconcileCoachingInterventionStateFromUserTurn(args: {
  tempMemory: any;
  userMessage: string;
  history: any[];
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string; userId?: string };
}): Promise<any> {
  const memory = readCoachingInterventionMemory(args.tempMemory);
  const now = nowIso();
  let history = memory.history.slice();
  let pending = memory.pending;

  if (pending) {
    const expiryMs = parseIsoMs(pending.proposed_at) + PENDING_EXPIRY_HOURS * 60 * 60 * 1000;
    if (expiryMs > 0 && expiryMs <= Date.now()) {
      history = history.map((entry) =>
        entry.intervention_id === pending?.intervention_id
          ? {
            ...entry,
            status: "expired",
            outcome: "unknown",
            helpful: null,
            resolved_at: now,
            last_used_at: now,
            outcome_reason: "expired_without_user_feedback",
          }
          : entry
      );
      pending = null;
    }
  }

  if (pending) {
    const followUp = await classifyCoachingInterventionFollowUp({
      pending,
      userMessage: args.userMessage,
      history: args.history,
      meta: args.meta,
    });
    if (followUp.decision === "resolve" && followUp.outcome) {
      history = history.map((entry) =>
        entry.intervention_id === pending?.intervention_id
          ? {
            ...entry,
            status: "resolved",
            outcome: followUp.outcome ?? "unknown",
            helpful: typeof followUp.helpful === "boolean"
              ? followUp.helpful
              : followUp.outcome === "tried_helpful" || followUp.outcome === "behavior_changed",
            resolved_at: now,
            last_used_at: now,
            outcome_reason: followUp.reason ?? null,
          }
          : entry
      );
      pending = null;
    }
  }

  return writeCoachingInterventionMemory({
    tempMemory: args.tempMemory,
    history,
    pending,
  });
}

export function recordCoachingInterventionProposal(args: {
  tempMemory: any;
  addon: CoachingInterventionRuntimeAddon | null | undefined;
}): any {
  const addon = args.addon;
  if (!addon || addon.decision !== "propose" || !addon.recommended_technique) {
    return args.tempMemory;
  }

  const memory = readCoachingInterventionMemory(args.tempMemory);
  const now = nowIso();
  const interventionId = `coach_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  let history = memory.history.slice();
  if (memory.pending) {
    history = history.map((entry) =>
      entry.intervention_id === memory.pending?.intervention_id
        ? {
          ...entry,
          status: "expired",
          outcome: "unknown",
          helpful: null,
          resolved_at: now,
          last_used_at: now,
          outcome_reason: "superseded_by_new_intervention",
        }
        : entry
    );
  }

  const entry: CoachingInterventionHistoryEntry = {
    intervention_id: interventionId,
    technique_id: addon.recommended_technique,
    blocker_type: addon.blocker_type === "unknown" ? null : addon.blocker_type,
    outcome: "unknown",
    helpful: null,
    last_used_at: now,
    status: "pending",
    proposed_at: now,
    resolved_at: null,
    target_action_title: addon.target_action_title ?? null,
    selector_source: addon.selector_source,
    outcome_reason: null,
  };

  const pending: CoachingInterventionPendingState = {
    intervention_id: interventionId,
    technique_id: addon.recommended_technique,
    blocker_type: addon.blocker_type,
    proposed_at: now,
    follow_up_due_at: addon.follow_up_window_hours
      ? new Date(Date.now() + addon.follow_up_window_hours * 60 * 60 * 1000)
        .toISOString()
      : null,
    target_action_title: addon.target_action_title ?? null,
    selector_source: addon.selector_source,
  };

  return writeCoachingInterventionMemory({
    tempMemory: args.tempMemory,
    history: [...history, entry].slice(-MAX_HISTORY),
    pending,
  });
}
