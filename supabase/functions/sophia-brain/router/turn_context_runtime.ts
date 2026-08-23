import type { AgentMode } from "../state-manager.ts";
import {
  DEFAULT_SIGNALS,
  type DispatcherMemoryPlan,
  type DispatcherSignals,
} from "./dispatcher.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { dispatcherTrackProgressSignalFromTurnFrame } from "../tools/always_on/track_progress_plan_item/router.ts";
import type { V2PlanItemSnapshotItem } from "./plan_snapshot_runtime.ts";

export const DEFAULT_DISPATCHER_MEMORY_PLAN: DispatcherMemoryPlan = {
  response_intent: "reflection",
  reasoning_complexity: "low",
  context_need: "minimal",
  memory_mode: "none",
  model_tier_hint: "lite",
  context_budget_tier: "tiny",
  targets: [],
  retrieval_policy: "semantic_first",
  plan_confidence: 0.7,
};

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label}_timeout_${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function riskScoreFromBand(band: string): number {
  switch (band) {
    case "critical":
      return 10;
    case "high":
      return 8;
    case "medium":
      return 5;
    case "low":
      return 2;
    default:
      return 0;
  }
}

export function dispatcherSignalsFromTurnFrame(args: {
  turnFrame: TurnFrame | null;
  userMessage: string;
}): DispatcherSignals {
  void args.userMessage;
  const turnFrame = args.turnFrame;
  const riskBand = turnFrame?.safety.risk_band ?? "none";
  const researchSignal = turnFrame?.needs_research;
  return {
    ...DEFAULT_SIGNALS,
    safety: DEFAULT_SIGNALS.safety,
    interrupt: DEFAULT_SIGNALS.interrupt,
    risk_score: riskScoreFromBand(riskBand),
    needs_research: researchSignal?.detected || researchSignal?.value === true
      ? researchSignal
      : DEFAULT_SIGNALS.needs_research,
    track_progress_plan_item: dispatcherTrackProgressSignalFromTurnFrame(
      turnFrame,
    ),
    // ── LOT 4A · LE CHAÎNON QUI MANQUAIT ─────────────────────────────────────
    //
    // ⚠️ C'EST ICI, ET NULLE PART AILLEURS, QUE LE LOT EXISTAIT PAS. Le renvoi
    // du sizing (lot 2C) était complet, testé et bilingue; le signal qui l'arme
    // était déclaré au type, avait quatre lecteurs, et RESTAIT à
    // `DEFAULT_SIGNALS.plan_feedback` — c'est-à-dire `{ detected: false }` —
    // parce que ce mapper ne le recopiait pas du frame. Une ceinture armée sur
    // un coffre vide, en une ligne d'omission.
    //
    // ⛔ AUCUNE RELECTURE DU MESSAGE ICI. `args.userMessage` est explicitement
    // `void`-é au-dessus: le verdict vient du modèle, jamais d'un matcher.
    //
    // ⚠️ LE REPLI EST `DEFAULT_SIGNALS.plan_feedback`, PAS `{detected:true}`
    // ni un objet vide. Un frame absent (dispatcher neutre, crise) doit rendre
    // « pas détecté », pas « détecté sans rien dedans ».
    plan_feedback: turnFrame?.skill_signals?.plan_feedback ??
      DEFAULT_SIGNALS.plan_feedback,
  };
}

function normalizePlanItemTitle(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function resolvePlanItemTitleFromSnapshot(
  planItemSnapshot: V2PlanItemSnapshotItem[] | undefined,
  targetItemId: string | null | undefined,
): string {
  const id = String(targetItemId ?? "").trim();
  if (!id || !Array.isArray(planItemSnapshot)) return "";
  const matched = planItemSnapshot.find((item) => item.id === id);
  return String(matched?.title ?? "").trim().slice(0, 120);
}

export function resolvePlanItemIdFromSnapshot(
  planItemSnapshot: V2PlanItemSnapshotItem[] | undefined,
  targetTitle: string | null | undefined,
): string {
  const normalizedTitle = normalizePlanItemTitle(String(targetTitle ?? ""));
  if (!normalizedTitle || !Array.isArray(planItemSnapshot)) return "";

  const matches = planItemSnapshot.filter((item) =>
    normalizePlanItemTitle(item.title) === normalizedTitle
  );
  return matches.length === 1 ? String(matches[0]?.id ?? "").trim() : "";
}

export function ymdToUtcNoonDate(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  return new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
    0,
    0,
  ));
}

function handlePlanItemFeedback(args: {
  tempMemory: any;
  state: any;
  dispatcherSignals: DispatcherSignals;
  planItemSnapshot?: V2PlanItemSnapshotItem[];
}) {
  const { tempMemory, state, dispatcherSignals, planItemSnapshot } = args;
  const feedback = dispatcherSignals.plan_feedback;
  if (!feedback?.detected) {
    try {
      delete (tempMemory as any).__plan_feedback_addon;
    } catch {
      // best effort
    }
    return;
  }

  const targetItemId = String(feedback.target_item_id ?? "").trim() || null;
  const targetTitle = String(
    feedback.target_title ??
      resolvePlanItemTitleFromSnapshot(planItemSnapshot, targetItemId),
  ).trim().slice(0, 120) || null;
  const detail = String(feedback.detail ?? "").trim().slice(0, 160) || null;
  const sentiment = String(feedback.sentiment ?? "neutral").trim()
    .toLowerCase();

  (tempMemory as any).__plan_feedback_addon = {
    sentiment: sentiment === "positive" || sentiment === "negative"
      ? sentiment
      : "neutral",
    target_item_id: targetItemId,
    target_title: targetTitle,
    detail,
    from_bilan: Boolean(state?.investigation_state),
    detected_at: new Date().toISOString(),
  };
}

function parseIsoMs(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function stabilizeOnboardingFlag(tempMemory: any): {
  tempMemory: any;
  onboardingActive: boolean;
} {
  if (!tempMemory || typeof tempMemory !== "object") {
    return { tempMemory: {}, onboardingActive: false };
  }

  const ONBOARDING_MAX_TURNS = 10;
  const ONBOARDING_MAX_MS = 3 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const active = (tempMemory as any).__onboarding_active;
  if (!active || typeof active !== "object") {
    return { tempMemory, onboardingActive: false };
  }

  const startedMs = parseIsoMs(active.started_at);
  const elapsedMs = startedMs > 0 ? nowMs - startedMs : 0;
  const turnCount = Number(active.user_turn_count ?? 0) + 1;

  const shouldExpire = turnCount >= ONBOARDING_MAX_TURNS ||
    elapsedMs >= ONBOARDING_MAX_MS;
  if (shouldExpire) {
    try {
      delete (tempMemory as any).__onboarding_active;
    } catch {
      // best effort
    }
    (tempMemory as any).__onboarding_done_v2 = {
      completed_at: nowIso,
      reason: turnCount >= ONBOARDING_MAX_TURNS ? "max_turns" : "max_time",
    };
    return { tempMemory, onboardingActive: false };
  }

  (tempMemory as any).__onboarding_active = {
    ...(active ?? {}),
    user_turn_count: turnCount,
    last_updated_at: nowIso,
  };
  return { tempMemory, onboardingActive: true };
}

export function isCheckupActive(state: any): boolean {
  const inv = state?.investigation_state;
  if (!inv || typeof inv !== "object") return false;
  const status = String(inv.status ?? "");
  return Boolean(status) && status !== "post_checkup" &&
    status !== "post_checkup_done";
}

export function parseInvestigationStartedMs(state: any): number {
  const inv = state?.investigation_state;
  if (!inv || typeof inv !== "object") return 0;
  const raw = String(inv?.started_at ?? "").trim() ||
    String(inv?.updated_at ?? "").trim() ||
    String(inv?.temp_memory?.started_at ?? "").trim();
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function detectCheckupIntent(
  dispatcherSignals: DispatcherSignals,
): boolean {
  const checkupIntentSignal = dispatcherSignals?.checkup_intent;
  return (
    Boolean(checkupIntentSignal?.detected) &&
    Number(checkupIntentSignal?.confidence ?? 0) >= 0.6
  );
}

export function selectTargetMode(args: {
  state: any;
  dispatcherSignals: DispatcherSignals;
  onboardingActive: boolean;
}): {
  targetMode: AgentMode;
  stopCheckup: boolean;
  checkupIntentDetected: boolean;
} {
  const { state, dispatcherSignals, onboardingActive } = args;

  const checkupActive = isCheckupActive(state);
  const stopCheckup = (dispatcherSignals.interrupt.kind === "EXPLICIT_STOP" &&
    dispatcherSignals.interrupt.confidence >= 0.6) ||
    (dispatcherSignals.interrupt.kind === "BORED" &&
      dispatcherSignals.interrupt.confidence >= 0.65);

  const checkupIntentDetected = detectCheckupIntent(dispatcherSignals);

  if (checkupActive && !stopCheckup) {
    return { targetMode: "companion", stopCheckup, checkupIntentDetected };
  }

  if (onboardingActive) {
    return { targetMode: "companion", stopCheckup, checkupIntentDetected };
  }

  return { targetMode: "companion", stopCheckup, checkupIntentDetected };
}

export function attachDynamicAddons(args: {
  tempMemory: any;
  state: any;
  dispatcherSignals: DispatcherSignals;
  checkupIntentDetected: boolean;
  userMessage: string;
  planItemSnapshot?: V2PlanItemSnapshotItem[];
}) {
  const {
    tempMemory,
    state,
    dispatcherSignals,
    checkupIntentDetected,
    planItemSnapshot,
  } = args;
  const checkupActive = isCheckupActive(state);

  if (!checkupActive && checkupIntentDetected) {
    const checkupIntentSignal = dispatcherSignals?.checkup_intent;
    (tempMemory as any).__checkup_not_triggerable_addon = {
      detected_at: new Date().toISOString(),
      confidence: Number(
        checkupIntentSignal?.confidence ??
          0,
      ),
      trigger_phrase: String(checkupIntentSignal?.trigger_phrase ?? "")
        .trim()
        .slice(0, 120),
    };
  } else {
    try {
      delete (tempMemory as any).__checkup_not_triggerable_addon;
    } catch {
      // best effort
    }
  }

  try {
    delete (tempMemory as any).__dashboard_redirect_addon;
    delete (tempMemory as any).__dashboard_capabilities_addon;
  } catch {
    // best effort
  }
  handlePlanItemFeedback({
    tempMemory,
    state,
    dispatcherSignals,
    planItemSnapshot,
  });

  const dashboardPreferencesSignal =
    dispatcherSignals.dashboard_preferences_intent;
  if (dashboardPreferencesSignal?.detected) {
    (tempMemory as any).__dashboard_preferences_intent_addon = {
      keys: Array.isArray(dashboardPreferencesSignal.preference_keys)
        ? dashboardPreferencesSignal.preference_keys.slice(0, 5)
        : [],
      confidence: Number(dashboardPreferencesSignal.confidence ?? 0),
      from_bilan: Boolean(state?.investigation_state),
      detected_at: new Date().toISOString(),
    };
  } else {
    try {
      delete (tempMemory as any).__dashboard_preferences_intent_addon;
    } catch {
      // best effort
    }
  }

}

export function clearOneShotKeys(
  tempMemory: any,
  consumedBilanStopped: boolean,
): void {
  if (!tempMemory || typeof tempMemory !== "object") return;
  const keys = [
    "__checkup_not_triggerable_addon",
    "__dashboard_redirect_addon",
    "__dashboard_capabilities_addon",
    "__dashboard_preferences_intent_addon",
    "__plan_feedback_addon",
    "__coaching_intervention_addon",
    "__track_progress_plan_item_runtime",
    "__dual_tool_addon",
    "__resume_message_prefix",
    "__abandon_message",
  ];
  for (const key of keys) {
    try {
      delete (tempMemory as any)[key];
    } catch {
      // best effort
    }
  }
  if (consumedBilanStopped) {
    try {
      delete (tempMemory as any).__bilan_just_stopped;
    } catch {
      // best effort
    }
  }
}
