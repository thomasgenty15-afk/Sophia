/// <reference path="../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  getDispatcherActionSnapshot,
  getPlanMetadata,
  getUserState,
  logMessage,
  normalizeScope,
  updateUserState,
  type AgentMode,
} from "../state-manager.ts";
import {
  buildContextString,
  loadContextForMode,
  type OnDemandTriggers,
} from "../context/loader.ts";
import { getContextProfile, getVectorResultsCount } from "../context/types.ts";
import { getUserTimeContext } from "../../_shared/user_time_context.ts";
import { getGlobalAiModel } from "../../_shared/gemini.ts";
import { debounceAndBurstMerge } from "./debounce.ts";
import {
  buildDispatcherStateSnapshot,
  buildLastAssistantInfo,
  runContextualDispatcherV2,
} from "./dispatcher_flow.ts";
import {
  clearMachineStateTempMemory,
  detectMagicResetCommand,
} from "./magic_reset.ts";
import type { DispatcherSignals, MachineSignals } from "./dispatcher.ts";
import { handleTracking } from "../lib/tracking.ts";
import { updateEtoilePolaire } from "../lib/north_star_tools.ts";
import { runAgentAndVerify } from "./agent_exec.ts";
import {
  type BrainTracePhase,
  logBrainTrace,
} from "../../_shared/brain-trace.ts";
import { persistTurnSummaryLog } from "./turn_summary_writer.ts";
import { enqueueLlmRetryJob } from "./emergency.ts";
import { logEdgeFunctionError } from "../../_shared/error-log.ts";

function envBool(name: string, fallback: boolean): boolean {
  const denoEnv = (globalThis as any)?.Deno?.env;
  const raw = String(denoEnv?.get?.(name) ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function envInt(name: string, fallback: number): number {
  const denoEnv = (globalThis as any)?.Deno?.env;
  const raw = String(denoEnv?.get?.(name) ?? "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function extractDashboardRedirectIntents(signals: DispatcherSignals): string[] {
  const intents: string[] = [];
  if (signals.create_action?.detected) intents.push("create_action");
  if (signals.update_action?.detected) intents.push("update_action");
  if (signals.breakdown_action?.detected) intents.push("breakdown_action");
  if (signals.activate_action?.detected) intents.push("activate_action");
  if (signals.delete_action?.detected) intents.push("delete_action");
  if (signals.deactivate_action?.detected) intents.push("deactivate_action");
  if (signals.dashboard_preferences_intent?.detected) {
    intents.push("dashboard_preferences_intent");
  }
  if (signals.dashboard_recurring_reminder_intent?.detected) {
    intents.push("dashboard_recurring_reminder_intent");
  }
  return intents;
}

function cleanupLegacyBilanFlags(tempMemory: any) {
  if (!tempMemory || typeof tempMemory !== "object") return;
  const legacyKeys = [
    "__checkup_entry_pending",
    "__ask_checkup_confirmation",
    "__bilan_already_done_pending",
    "__propose_track_progress",
    "__track_progress_from_bilan_done",
    "__checkup_addon",
    "__bilan_tomorrow_addon",
    "__safety_stabilization",
  ];
  for (const key of legacyKeys) {
    try {
      delete (tempMemory as any)[key];
    } catch {
      // best effort
    }
  }
}

function parseIsoMs(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function stabilizeOnboardingFlag(tempMemory: any): {
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

  const shouldExpire = turnCount >= ONBOARDING_MAX_TURNS || elapsedMs >= ONBOARDING_MAX_MS;
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

function isCheckupActive(state: any): boolean {
  const inv = state?.investigation_state;
  if (!inv || typeof inv !== "object") return false;
  const status = String(inv.status ?? "");
  return Boolean(status) && status !== "post_checkup" && status !== "post_checkup_done";
}

function resolveBinaryConsentLite(text: unknown): "yes" | "no" | null {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return null;
  const yes = /\b(oui|ouais|ok|okay|d'accord|dac|vas[- ]?y|go|yep|yes|on reprend|reprenons)\b/i.test(t);
  const no = /\b(non|nope|nan|pas maintenant|plus tard|laisse|stop|on laisse|on verra)\b/i.test(t);
  if (yes === no) return null;
  return yes ? "yes" : "no";
}

function parseInvestigationStartedMs(state: any): number {
  const inv = state?.investigation_state;
  if (!inv || typeof inv !== "object") return 0;
  const raw =
    String(inv?.started_at ?? "").trim() ||
    String(inv?.updated_at ?? "").trim() ||
    String(inv?.temp_memory?.started_at ?? "").trim();
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function buildExpiredBilanSummary(inv: any, elapsedMs: number): Record<string, unknown> {
  const pending = Array.isArray(inv?.pending_items) ? inv.pending_items : [];
  const progress = (inv?.temp_memory?.item_progress && typeof inv?.temp_memory?.item_progress === "object")
    ? inv.temp_memory.item_progress
    : {};
  const done: string[] = [];
  const skipped: string[] = [];
  for (const item of pending) {
    const id = String(item?.id ?? "");
    if (!id) continue;
    const title = String(item?.title ?? "item").trim() || "item";
    const phase = String((progress as any)?.[id]?.phase ?? "").trim();
    if (phase === "logged") done.push(title);
    else skipped.push(title);
  }
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / 60000));
  return {
    expired_at: new Date().toISOString(),
    elapsed_minutes: elapsedMinutes,
    items_done: done.slice(0, 12),
    items_skipped: skipped.slice(0, 12),
    reason: "stale_checkup_timeout",
  };
}

function detectCheckupIntent(_dispatcherSignals: DispatcherSignals, machineSignals?: MachineSignals): boolean {
  const checkupIntentSignal = machineSignals?.checkup_intent;
  return (
    Boolean(checkupIntentSignal?.detected) &&
    Number(checkupIntentSignal?.confidence ?? 0) >= 0.6
  );
}

function selectTargetMode(args: {
  state: any;
  dispatcherSignals: DispatcherSignals;
  machineSignals?: MachineSignals;
  onboardingActive: boolean;
}): { targetMode: AgentMode; stopCheckup: boolean; checkupIntentDetected: boolean } {
  const { state, dispatcherSignals, machineSignals, onboardingActive } = args;

  const checkupActive = isCheckupActive(state);
  const stopCheckup =
    (dispatcherSignals.interrupt.kind === "EXPLICIT_STOP" && dispatcherSignals.interrupt.confidence >= 0.6) ||
    (dispatcherSignals.interrupt.kind === "BORED" && dispatcherSignals.interrupt.confidence >= 0.65);

  const checkupIntentDetected = detectCheckupIntent(dispatcherSignals, machineSignals);

  if (
    dispatcherSignals.safety.level === "SENTRY" &&
    dispatcherSignals.safety.confidence >= 0.75
  ) {
    return { targetMode: "sentry", stopCheckup, checkupIntentDetected };
  }

  if (checkupActive && !stopCheckup) {
    return { targetMode: "investigator", stopCheckup, checkupIntentDetected };
  }

  if (onboardingActive) {
    return { targetMode: "companion", stopCheckup, checkupIntentDetected };
  }

  return { targetMode: "companion", stopCheckup, checkupIntentDetected };
}

function attachDynamicAddons(args: {
  tempMemory: any;
  state: any;
  dispatcherSignals: DispatcherSignals;
  machineSignals?: MachineSignals;
  checkupIntentDetected: boolean;
}) {
  const { tempMemory, state, dispatcherSignals, machineSignals, checkupIntentDetected } = args;
  const checkupActive = isCheckupActive(state);

  if (!checkupActive && checkupIntentDetected) {
    const checkupIntentSignal = machineSignals?.checkup_intent;
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

  const dashboardRedirectIntents = extractDashboardRedirectIntents(dispatcherSignals);
  if (dashboardRedirectIntents.length > 0) {
    (tempMemory as any).__dashboard_redirect_addon = {
      intents: dashboardRedirectIntents,
      from_bilan: Boolean(state?.investigation_state),
    };
    // Synthetic umbrella signal: user message can be related to dashboard capabilities.
    // This keeps behavior consistent without adding a new fragile LLM schema field.
    (tempMemory as any).__dashboard_capabilities_addon = {
      detected: true,
      intents: dashboardRedirectIntents,
      from_bilan: Boolean(state?.investigation_state),
      detected_at: new Date().toISOString(),
    };
  } else {
    try {
      delete (tempMemory as any).__dashboard_redirect_addon;
      delete (tempMemory as any).__dashboard_capabilities_addon;
    } catch {
      // best effort
    }
  }

  const dashboardPreferencesSignal =
    dispatcherSignals.dashboard_preferences_intent;
  if (dashboardPreferencesSignal?.detected) {
    (tempMemory as any).__dashboard_preferences_intent_addon = {
      keys: Array.isArray(dashboardPreferencesSignal.preference_keys)
        ? dashboardPreferencesSignal.preference_keys.slice(0, 3)
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

  const dashboardRecurringReminderSignal =
    dispatcherSignals.dashboard_recurring_reminder_intent;
  if (dashboardRecurringReminderSignal?.detected) {
    (tempMemory as any).__dashboard_recurring_reminder_intent_addon = {
      fields: Array.isArray(dashboardRecurringReminderSignal.reminder_fields)
        ? dashboardRecurringReminderSignal.reminder_fields.slice(0, 9)
        : [],
      confidence: Number(dashboardRecurringReminderSignal.confidence ?? 0),
      from_bilan: Boolean(state?.investigation_state),
      detected_at: new Date().toISOString(),
    };
  } else {
    try {
      delete (tempMemory as any).__dashboard_recurring_reminder_intent_addon;
    } catch {
      // best effort
    }
  }

  const safetyActive = dispatcherSignals.safety.level === "SENTRY";
  if (safetyActive && Number(dispatcherSignals.safety.confidence ?? 0) >= 0.6) {
    (tempMemory as any).__safety_active_addon = {
      level: dispatcherSignals.safety.level.toLowerCase(),
      phase: "active",
    };
  } else {
    try {
      delete (tempMemory as any).__safety_active_addon;
    } catch {
      // best effort
    }
  }
}

async function maybeTrackProgressParallel(args: {
  supabase: SupabaseClient;
  userId: string;
  state: any;
  tempMemory: any;
  dispatcherSignals: DispatcherSignals;
  loggedMessageId: string | null;
  channel: "web" | "whatsapp";
}) {
  const { supabase, userId, state, tempMemory, dispatcherSignals, loggedMessageId, channel } = args;

  const trackAction = dispatcherSignals.track_progress_action;
  const trackVital = dispatcherSignals.track_progress_vital_sign;
  const trackNorthStar = dispatcherSignals.track_progress_north_star;
  const trackActionStatus = String(trackAction?.status_hint ?? "unknown");
  const trackActionTarget = String(trackAction?.target_hint ?? "").trim();
  const trackVitalTarget = String(trackVital?.target_hint ?? "").trim();
  const trackVitalValue = Number(trackVital?.value_hint);
  const trackNorthStarValue = Number(trackNorthStar?.value_hint);
  const canTrackAction =
    trackAction?.detected === true &&
    trackActionTarget.length >= 2 &&
    (trackActionStatus === "completed" || trackActionStatus === "missed" || trackActionStatus === "partial");
  const canTrackVital =
    trackVital?.detected === true &&
    trackVitalTarget.length >= 2 &&
    Number.isFinite(trackVitalValue);
  const canTrackNorthStar =
    trackNorthStar?.detected === true &&
    Number.isFinite(trackNorthStarValue);
  const canTrack = !isCheckupActive(state) && (canTrackAction || canTrackVital || canTrackNorthStar);

  const alreadyLogged =
    (tempMemory as any)?.__track_progress_parallel?.source_message_id &&
    loggedMessageId &&
    (tempMemory as any).__track_progress_parallel.source_message_id === loggedMessageId;

  if (!canTrack || alreadyLogged) return;

  try {
    let raw = "";
    if (canTrackNorthStar) {
      const result = await updateEtoilePolaire(supabase, userId, {
        new_value: trackNorthStarValue,
      });
      raw =
        `Etoile Polaire mise à jour: ${result.title} -> ${result.new_value}${result.unit ? ` ${result.unit}` : ""}.`;
    } else if (canTrackVital) {
      const trackingMsg = await handleTracking(
        supabase,
        userId,
        {
          target_name: trackVitalTarget,
          value: trackVitalValue,
          operation: "set",
          status: "completed",
        },
        { source: channel },
      );
      raw = String(trackingMsg ?? "");
    } else {
      const trackingMsg = await handleTracking(
        supabase,
        userId,
        {
          target_name: trackActionTarget,
          value: trackActionStatus === "missed" ? 0 : 1,
          operation: "add",
          status: trackActionStatus as "completed" | "missed" | "partial",
        },
        { source: channel },
      );
      raw = String(trackingMsg ?? "");
    }
    if (raw.startsWith("INFO_POUR_AGENT:")) {
      (tempMemory as any).__track_progress_parallel = {
        mode: "needs_clarify",
        message: raw.replace(/^INFO_POUR_AGENT:\s*/i, "").trim(),
        source_message_id: loggedMessageId ?? null,
      };
    } else {
      (tempMemory as any).__track_progress_parallel = {
        mode: "logged",
        message: raw,
        target: trackActionTarget || trackVitalTarget || "north_star",
        status: trackActionStatus,
        source_message_id: loggedMessageId ?? null,
      };
    }
  } catch (e) {
    console.warn("[Router] parallel track_progress failed (non-blocking):", e);
    (tempMemory as any).__track_progress_parallel = {
      mode: "needs_clarify",
      message: "Impossible de logger automatiquement. Oriente vers le dashboard pour mise à jour immédiate, ou propose d'attendre le prochain bilan.",
      source_message_id: loggedMessageId ?? null,
    };
  }
}

function clearOneShotKeys(tempMemory: any, consumedBilanStopped: boolean) {
  if (!tempMemory || typeof tempMemory !== "object") return;
  const keys = [
    "__checkup_not_triggerable_addon",
    "__dashboard_redirect_addon",
    "__dashboard_capabilities_addon",
    "__dashboard_preferences_intent_addon",
    "__dashboard_recurring_reminder_intent_addon",
    "__safety_active_addon",
    "__track_progress_parallel",
    "__dual_tool_addon",
    "__resume_safety_addon",
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

export async function processMessage(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  history: any[],
  meta?: {
    requestId?: string;
    forceRealAi?: boolean;
    channel?: "web" | "whatsapp";
    model?: string;
    scope?: string;
    whatsappMode?: "onboarding" | "normal";
    evalRunId?: string | null;
    forceBrainTrace?: boolean;
  },
  opts?: {
    logMessages?: boolean;
    forceMode?: AgentMode;
    contextOverride?: string;
    messageMetadata?: Record<string, unknown>;
    disableForcedRouting?: boolean;
    forceOnboardingFlow?: boolean;
  },
) {
  const turnStartMs = Date.now();
  let dispatcherLatencyMs: number | undefined;
  let contextLatencyMs: number | undefined;
  let agentLatencyMs: number | undefined;

  const channel = meta?.channel ?? "web";
  const scope = normalizeScope(
    meta?.scope,
    channel === "whatsapp" ? "whatsapp" : "web",
  );

  const trace = async (
    event: string,
    phase: BrainTracePhase,
    payload: Record<string, unknown> = {},
    level: "debug" | "info" | "warn" | "error" = "info",
  ) => {
    await logBrainTrace({
      supabase,
      userId,
      meta: {
        requestId: meta?.requestId,
        evalRunId: (meta as any)?.evalRunId ?? null,
        forceBrainTrace: (meta as any)?.forceBrainTrace,
      },
      event,
      phase,
      level,
      payload,
    });
  };

  const logMessages = opts?.logMessages !== false;

  let loggedMessageId: string | null = null;
  if (logMessages) {
    const { data: inserted } = await supabase.from("chat_messages").insert({
      user_id: userId,
      scope,
      role: "user",
      content: userMessage,
      metadata: opts?.messageMetadata ?? {},
    }).select("id").single();
    loggedMessageId = inserted?.id ?? null;
  }

  if (loggedMessageId) {
    const debounced = await debounceAndBurstMerge({
      supabase,
      userId,
      scope,
      loggedMessageId,
      userMessage,
    });
    if (debounced.aborted) {
      await trace("brain:debounce_aborted", "io", { reason: "debounceAndBurstMerge" }, "debug");
      return { content: "", mode: "companion" as AgentMode, aborted: true };
    }
    userMessage = debounced.userMessage;
  }

  let state = await getUserState(supabase, userId, scope);
  let tempMemory: any = (state as any)?.temp_memory ?? {};

  cleanupLegacyBilanFlags(tempMemory);

  const onboarding = stabilizeOnboardingFlag(tempMemory);
  tempMemory = onboarding.tempMemory;

  // Magic Reset Check (abracadabra)
  const magicResetVariant = detectMagicResetCommand(userMessage);
  if (magicResetVariant) {
    const { tempMemory: cleared, clearedKeys } = clearMachineStateTempMemory({ tempMemory });
    tempMemory = cleared;
    await trace("brain:magic_reset_command", "routing", {
      variant: magicResetVariant,
      cleared_keys: clearedKeys,
      cleared_count: clearedKeys.length
    }, "warn");
    
    // Force immediate persist to ensure reset sticks even if later logic fails
    await updateUserState(supabase, userId, scope, { temp_memory: tempMemory });
  }

  const { lastAssistantMessage } = buildLastAssistantInfo(history);
  const stateSnapshot = buildDispatcherStateSnapshot({ tempMemory, state });
  let actionSnapshot: any[] | undefined = undefined;
  try {
    const planMeta = await getPlanMetadata(supabase, userId);
    actionSnapshot = await getDispatcherActionSnapshot(
      supabase,
      userId,
      planMeta?.id ? String(planMeta.id) : null,
      30,
    );
  } catch (e) {
    console.warn("[Router] action snapshot load failed (non-blocking):", e);
  }

  const contextual = await runContextualDispatcherV2({
    userMessage,
    lastAssistantMessage,
    history,
    tempMemory,
    state,
    meta,
    stateSnapshot,
    actionSnapshot,
    signalHistoryKey: "signal_history",
    minTurnIndex: -4,
    trace,
    traceV: trace,
  });
  dispatcherLatencyMs = Date.now() - turnStartMs;

  const dispatcherSignals = contextual.dispatcherSignals;
  const machineSignals = contextual.dispatcherResult?.machine_signals;
  tempMemory = contextual.tempMemory;
  const riskScore = Number(dispatcherSignals.risk_score ?? 0);

  // High-risk circuit breaker: clear machine/runtime states to avoid compounding loops
  // when user is in distress or conversation quality degrades sharply.
  const riskResetThreshold = Number(
    envInt("SOPHIA_RISK_RESET_THRESHOLD", 7),
  );
  const shouldResetForRisk = Number.isFinite(riskScore) && riskScore >= riskResetThreshold;
  if (shouldResetForRisk) {
    const { tempMemory: clearedTemp, clearedKeys } = clearMachineStateTempMemory({
      tempMemory,
    });
    const invWasActive = Boolean((state as any)?.investigation_state);
    tempMemory = {
      ...(clearedTemp ?? {}),
      __risk_reset: {
        at: new Date().toISOString(),
        risk_score: riskScore,
        threshold: riskResetThreshold,
      },
    };
    await updateUserState(supabase, userId, scope, {
      investigation_state: null as any,
      temp_memory: tempMemory,
      risk_level: riskScore,
    });
    state = {
      ...(state ?? {}),
      investigation_state: null,
      temp_memory: tempMemory,
      risk_level: riskScore,
    } as any;
    await trace("brain:risk_circuit_breaker_reset", "routing", {
      risk_score: riskScore,
      threshold: riskResetThreshold,
      investigation_was_active: invWasActive,
      cleared_keys_count: clearedKeys.length,
      cleared_keys: clearedKeys.slice(0, 40),
    }, "warn");
  }

  // If a daily bilan/checkup is stale (>4h), decide implicitly:
  // - continue if message answers the current bilan thread
  // - abandon if user starts a new/unrelated topic
  // No explicit "do you want to continue?" question.
  const staleTimeoutMs = envInt("SOPHIA_BILAN_STALE_TIMEOUT_MS", 4 * 60 * 60 * 1000);
  const checkupActiveNow = isCheckupActive(state);
  const startedMs = parseInvestigationStartedMs(state);
  const elapsedSinceStartMs = startedMs > 0 ? Date.now() - startedMs : 0;
  const staleCheckup = checkupActiveNow && startedMs > 0 && elapsedSinceStartMs >= staleTimeoutMs;
  if (staleCheckup) {
    const wantsToContinueByDispatcher = machineSignals?.wants_to_continue_bilan === true;
    const dontWantToContinueByDispatcher = machineSignals?.dont_want_continue_bilan === true;
    const checkupIntentNow = detectCheckupIntent(dispatcherSignals, machineSignals);
    const explicitConsent = resolveBinaryConsentLite(userMessage);
    const explicitContinue = explicitConsent === "yes";
    const explicitStop = explicitConsent === "no";
    const shouldContinue = (wantsToContinueByDispatcher && !dontWantToContinueByDispatcher) ||
      explicitContinue ||
      checkupIntentNow;
    const shouldAbandon = dontWantToContinueByDispatcher || explicitStop || !shouldContinue;
    if (shouldAbandon) {
      const expiredSummary = buildExpiredBilanSummary(state?.investigation_state, elapsedSinceStartMs);
      tempMemory = {
        ...(tempMemory ?? {}),
        __expired_bilan_summary: expiredSummary,
      };
      await updateUserState(supabase, userId, scope, {
        investigation_state: null as any,
        temp_memory: tempMemory,
      });
      state = {
        ...state,
        investigation_state: null,
        temp_memory: tempMemory,
      } as any;
      await trace("brain:stale_checkup_abandoned", "routing", {
        elapsed_ms: elapsedSinceStartMs,
        timeout_ms: staleTimeoutMs,
        reason: dontWantToContinueByDispatcher
          ? "dispatcher_dont_want_continue_bilan"
          : explicitStop
          ? "explicit_user_stop"
          : "message_not_checkup_related",
        wants_to_continue_bilan: wantsToContinueByDispatcher,
        dont_want_continue_bilan: dontWantToContinueByDispatcher,
        checkup_intent_now: checkupIntentNow,
        explicit_consent: explicitConsent,
      }, "info");
    } else {
      await trace("brain:stale_checkup_continues_implicitly", "routing", {
        elapsed_ms: elapsedSinceStartMs,
        timeout_ms: staleTimeoutMs,
        wants_to_continue_bilan: wantsToContinueByDispatcher,
        dont_want_continue_bilan: dontWantToContinueByDispatcher,
        checkup_intent_now: checkupIntentNow,
        explicit_consent: explicitConsent,
      }, "info");
    }
  }

  const { targetMode: routedMode, stopCheckup, checkupIntentDetected } = selectTargetMode({
    state,
    dispatcherSignals,
    machineSignals,
    onboardingActive: onboarding.onboardingActive,
  });

  let targetMode: AgentMode = routedMode;
  if (opts?.forceMode && targetMode !== "sentry") {
    targetMode = opts.forceMode;
  }

  attachDynamicAddons({
    tempMemory,
    state,
    dispatcherSignals,
    machineSignals,
    checkupIntentDetected,
  });

  await maybeTrackProgressParallel({
    supabase,
    userId,
    state,
    tempMemory,
    dispatcherSignals,
    loggedMessageId,
    channel,
  });

  if (riskScore !== Number((state as any)?.risk_level ?? 0)) {
    await updateUserState(supabase, userId, scope, { risk_level: riskScore });
  }

  const userTime = await getUserTimeContext({ supabase, userId }).catch(() => null as any);

  const onDemandTriggers: OnDemandTriggers = {
    create_action_intent: dispatcherSignals.create_action?.detected ?? false,
    update_action_intent: dispatcherSignals.update_action?.detected ?? false,
    breakdown_recommended: dispatcherSignals.breakdown_action?.detected ?? false,
    action_discussion_detected: dispatcherSignals.action_discussion?.detected ?? false,
    action_discussion_hint: dispatcherSignals.action_discussion?.action_hint,
  };

  let context = "";
  const contextProfile = getContextProfile(targetMode);
  const contextLoadResult = await loadContextForMode({
    supabase,
    userId,
    mode: targetMode,
    message: userMessage,
    history,
    state,
    scope,
    tempMemory,
    userTime,
    triggers: onDemandTriggers,
    injectedContext: opts?.contextOverride,
  });
  contextLatencyMs = Date.now() - turnStartMs - (dispatcherLatencyMs ?? 0);

  const vectorMaxResults = getVectorResultsCount(contextProfile);
  if (vectorMaxResults > 0) {
    console.warn(
      `[Router] Legacy vector memories are disabled; requested vectorMaxResults=${vectorMaxResults}`,
    );
  }

  context = buildContextString(contextLoadResult.context);

  let consumedBilanStopped = false;
  try {
    delete (tempMemory as any).__checkup_not_triggerable_addon;
  } catch {
    // best effort
  }
  if (targetMode === "companion" && (tempMemory as any)?.__bilan_just_stopped) {
    consumedBilanStopped = true;
    try {
      delete (tempMemory as any).__bilan_just_stopped;
    } catch {
      // best effort
    }
  }

  const checkupActive = isCheckupActive(state);
  const isPostCheckup = state?.investigation_state?.status === "post_checkup";

  const agentOut = await runAgentAndVerify({
    supabase,
    userId,
    scope,
    channel,
    userMessage,
    history,
    state,
    context,
    meta,
    targetMode,
    nCandidates: 1,
    checkupActive,
    stopCheckup,
    isPostCheckup,
    outageTemplate: "J'ai un petit souci technique, je reviens vers toi dès que c'est réglé!",
    sophiaChatModel: String(
      getGlobalAiModel("gemini-2.5-flash"),
    ).trim(),
    tempMemory,
  });
  agentLatencyMs =
    Date.now() - turnStartMs - (dispatcherLatencyMs ?? 0) - (contextLatencyMs ?? 0);

  let responseContent = String(agentOut.responseContent ?? "").trim();
  const nextMode = agentOut.nextMode;
  let llmRetryJobId: string | null = null;
  if (agentOut.outageFallback) {
    llmRetryJobId = await enqueueLlmRetryJob({
      supabase,
      userId,
      scope,
      channel,
      userMessage,
      investigationActive: checkupActive || isPostCheckup,
      requestId: meta?.requestId,
      reason: `agent_failure:${String(agentOut.outageFailedMode ?? "unknown")}`,
    });
    // Persist fallback details for production debugging (queryable via SQL).
    // This captures swallowed agent failures that otherwise only appear in runtime logs.
    await logEdgeFunctionError({
      functionName: "sophia-brain",
      severity: "warn",
      title: "router_outage_fallback",
      error: agentOut.outageErrorMessage ?? `agent_failure:${String(agentOut.outageFailedMode ?? "unknown")}`,
      requestId: meta?.requestId ?? null,
      userId,
      source: channel,
      metadata: {
        scope,
        target_mode: targetMode,
        next_mode: nextMode,
        outage_fallback: true,
        outage_failed_mode: agentOut.outageFailedMode ?? null,
        outage_error_message: agentOut.outageErrorMessage ?? null,
        llm_retry_job_id: llmRetryJobId,
      },
    });
  }

  let mergedTempMemory = agentOut.tempMemory ?? tempMemory;
  try {
    const latest = await getUserState(supabase, userId, scope);
    mergedTempMemory = {
      ...((latest as any)?.temp_memory ?? {}),
      ...(agentOut.tempMemory ?? {}),
    };
  } catch {
    // keep current mergedTempMemory
  }

  clearOneShotKeys(mergedTempMemory, consumedBilanStopped);
  try {
    const retryAfterRaw = String((mergedTempMemory as any)?.__investigator_retry_after ?? "").trim();
    if (retryAfterRaw) {
      const retryTs = Date.parse(retryAfterRaw);
      if (!Number.isFinite(retryTs) || retryTs <= Date.now()) {
        delete (mergedTempMemory as any).__investigator_retry_after;
      }
    }
  } catch {
    // best effort
  }

  const nextMsgCount = Number((state as any)?.unprocessed_msg_count ?? 0) + 1;
  const nextLastProcessed = new Date().toISOString();

  await updateUserState(supabase, userId, scope, {
    current_mode: nextMode,
    unprocessed_msg_count: nextMsgCount,
    last_processed_at: nextLastProcessed,
    temp_memory: mergedTempMemory,
  });

  if (logMessages) {
    await logMessage(
      supabase,
      userId,
      scope,
      "assistant",
      responseContent,
      nextMode,
      {
        ...(opts?.messageMetadata ?? {}),
        channel,
        request_id: meta?.requestId ?? null,
        router_decision_v2: {
          target_mode: targetMode,
          next_mode: nextMode,
          risk_score: riskScore,
          checkup_active: checkupActive,
          stop_checkup: stopCheckup,
          safety_level: dispatcherSignals.safety.level,
          interrupt_kind: dispatcherSignals.interrupt.kind,
          llm_retry_queued: Boolean(llmRetryJobId),
          llm_retry_job_id: llmRetryJobId,
          outage_fallback: Boolean(agentOut.outageFallback),
          outage_failed_mode: agentOut.outageFailedMode ?? null,
          outage_error: agentOut.outageErrorMessage ?? null,
        },
      },
    );
  }

  await trace("routing_decision_summary", "routing", {
    target_mode: targetMode,
    next_mode: nextMode,
    risk_score: riskScore,
    checkup_active: checkupActive,
    stop_checkup: stopCheckup,
    checkup_intent_detected: checkupIntentDetected,
  }, "info");

  // Persist one turn_summary row per router turn (powers bundle brain_trace exports).
  try {
    await persistTurnSummaryLog({
      supabase,
      config: {
        awaitEnabled: envBool("SOPHIA_TURN_SUMMARY_DB_AWAIT", false),
        timeoutMs: envInt("SOPHIA_TURN_SUMMARY_DB_TIMEOUT_MS", 1200),
        retries: envInt("SOPHIA_TURN_SUMMARY_DB_RETRIES", 1),
      },
      metrics: {
        request_id: meta?.requestId ?? null,
        user_id: userId,
        channel,
        scope,
        latency_ms: {
          total: Date.now() - turnStartMs,
          dispatcher: dispatcherLatencyMs,
          context: contextLoadResult?.metrics?.load_ms ?? contextLatencyMs,
          agent: agentLatencyMs,
        },
        dispatcher: {
          model: String(meta?.model ?? (globalThis as any)?.Deno?.env?.get?.("SOPHIA_DISPATCHER_MODEL") ?? getGlobalAiModel("gemini-2.5-flash")).trim(),
          signals: {
            safety: String(dispatcherSignals.safety.level ?? "NONE"),
            interrupt: String(dispatcherSignals.interrupt.kind ?? "NONE"),
          },
        },
        context: {
          profile: String(targetMode),
          elements: contextLoadResult?.metrics?.elements_loaded ?? [],
          tokens: contextLoadResult?.metrics?.estimated_tokens ?? undefined,
        },
        routing: {
          target_dispatcher: targetMode,
          target_initial: targetMode,
          target_final: nextMode,
          risk_score: riskScore,
        },
        agent: {
          model: String(meta?.model ?? getGlobalAiModel("gemini-2.5-flash")).trim(),
          outcome: (agentOut.toolExecution && agentOut.toolExecution !== "none") ? "tool_call" : "text",
          tool: agentOut.executedTools?.[0] ?? null,
        },
        state_flags: {
          checkup_active: checkupActive,
          toolflow_active: false,
          supervisor_stack_top: String((mergedTempMemory as any)?.__toolflow_owner?.machine_type ?? ""),
        },
        details: {
          source: "sophia-brain/router/run.ts",
          channel,
          tool_execution: agentOut.toolExecution,
          executed_tools: agentOut.executedTools ?? [],
          tool_ack: agentOut.toolAck ?? null,
          outage_fallback: Boolean(agentOut.outageFallback),
          outage_failed_mode: agentOut.outageFailedMode ?? null,
          outage_error: agentOut.outageErrorMessage ?? null,
          llm_retry_queued: Boolean(llmRetryJobId),
          llm_retry_job_id: llmRetryJobId,
        },
        aborted: false,
      },
    });
  } catch (e) {
    console.warn("[Router] persistTurnSummaryLog failed (non-blocking):", e);
  }

  return {
    content: responseContent,
    mode: nextMode,
    tool_execution: agentOut.toolExecution,
    executed_tools: agentOut.executedTools,
  };
}
