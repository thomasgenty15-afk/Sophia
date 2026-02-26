/// <reference path="../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
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
import { runAgentAndVerify } from "./agent_exec.ts";
import {
  type BrainTracePhase,
  logBrainTrace,
} from "../../_shared/brain-trace.ts";
import { persistTurnSummaryLog } from "./turn_summary_writer.ts";
import { enqueueLlmRetryJob } from "./emergency.ts";

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
  if (
    signals.create_action?.intent_strength === "explicit" ||
    signals.create_action?.intent_strength === "implicit" ||
    signals.create_action?.intent_strength === "exploration"
  ) intents.push("create_action");
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
    "__bilan_defer_pending",
    "__bilan_defer_confirm_addon",
    "__checkup_deferred_topic",
    "__deferred_bilan_pending",
    "__bilan_tomorrow_addon",
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

  const checkupIntentSignal = machineSignals?.checkup_intent;
  const checkupIntentDetected =
    (Boolean(checkupIntentSignal?.detected) && Number(checkupIntentSignal?.confidence ?? 0) >= 0.6) ||
    (dispatcherSignals.user_intent_primary === "CHECKUP" &&
      Number(dispatcherSignals.user_intent_confidence ?? 0) >= 0.6);

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
          dispatcherSignals.user_intent_confidence ??
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
        ? dashboardPreferencesSignal.preference_keys.slice(0, 9)
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
    const prev = (tempMemory as any)?.__safety_stabilization ?? {};
    const stabilized = Boolean(dispatcherSignals.safety_resolution?.stabilizing_signal);
    const symptomsStill = Boolean(dispatcherSignals.safety_resolution?.symptoms_still_present);
    const consecutiveOk = symptomsStill
      ? 0
      : (stabilized ? Number(prev.consecutive_ok ?? 0) + 1 : Number(prev.consecutive_ok ?? 0));

    (tempMemory as any).__safety_stabilization = {
      level: dispatcherSignals.safety.level,
      consecutive_ok: Math.max(0, Math.min(5, consecutiveOk)),
      threshold: 3,
      updated_at: new Date().toISOString(),
    };
    (tempMemory as any).__safety_active_addon = {
      level: dispatcherSignals.safety.level.toLowerCase(),
      phase: "active",
      consecutive_ok: Math.max(0, Math.min(5, consecutiveOk)),
      threshold: 3,
    };
  } else {
    try {
      delete (tempMemory as any).__safety_active_addon;
      delete (tempMemory as any).__safety_stabilization;
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

  const track = dispatcherSignals.track_progress;
  const trackStatus = String(track?.status_hint ?? "unknown");
  const trackTarget = String(track?.target_hint ?? "").trim();
  const canTrack =
    !isCheckupActive(state) &&
    track?.detected === true &&
    (track?.confidence ?? 0) >= 0.8 &&
    trackTarget.length >= 2 &&
    (trackStatus === "completed" || trackStatus === "missed" || trackStatus === "partial");

  const alreadyLogged =
    (tempMemory as any)?.__track_progress_parallel?.source_message_id &&
    loggedMessageId &&
    (tempMemory as any).__track_progress_parallel.source_message_id === loggedMessageId;

  if (!canTrack || alreadyLogged) return;

  try {
    const trackingMsg = await handleTracking(
      supabase,
      userId,
      {
        target_name: trackTarget,
        value: trackStatus === "missed" ? 0 : 1,
        operation: "add",
        status: trackStatus as any,
      },
      { source: channel },
    );
    const raw = String(trackingMsg ?? "");
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
        target: trackTarget,
        status: trackStatus,
        source_message_id: loggedMessageId ?? null,
      };
    }
  } catch (e) {
    console.warn("[Router] parallel track_progress failed (non-blocking):", e);
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
    "__deferred_signal_addon",
    "__dual_tool_addon",
    "__resume_safety_addon",
    "__resume_message_prefix",
    "__deferred_ack_prefix",
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

  const state = await getUserState(supabase, userId, scope);
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

  const contextual = await runContextualDispatcherV2({
    userMessage,
    lastAssistantMessage,
    history,
    tempMemory,
    state,
    meta,
    stateSnapshot,
    signalHistoryKey: "signal_history",
    minTurnIndex: -4,
    trace,
    traceV: trace,
  });
  dispatcherLatencyMs = Date.now() - turnStartMs;

  const dispatcherSignals = contextual.dispatcherSignals;
  const machineSignals = contextual.dispatcherResult?.machine_signals;
  tempMemory = contextual.tempMemory;

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

  const riskScore = Number(dispatcherSignals.risk_score ?? 0);
  if (riskScore !== Number((state as any)?.risk_level ?? 0)) {
    await updateUserState(supabase, userId, scope, { risk_level: riskScore });
  }

  const userTime = await getUserTimeContext({ supabase, userId }).catch(() => null as any);

  const onDemandTriggers: OnDemandTriggers = {
    create_action_intent:
      dispatcherSignals.create_action?.intent_strength === "explicit" ||
      dispatcherSignals.create_action?.intent_strength === "implicit",
    update_action_intent: dispatcherSignals.update_action?.detected ?? false,
    plan_discussion_intent: dispatcherSignals.topic_depth?.plan_focus ?? false,
    breakdown_recommended: dispatcherSignals.breakdown_action?.detected ?? false,
    topic_depth: dispatcherSignals.topic_depth?.value === "SERIOUS"
      ? "deep"
      : dispatcherSignals.topic_depth?.value === "LIGHT"
      ? "shallow"
      : undefined,
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
      (globalThis as any)?.Deno?.env?.get?.("SOPHIA_CHAT_MODEL") ?? "gemini-2.5-flash",
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
          intent_primary: dispatcherSignals.user_intent_primary,
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
          model: String(meta?.model ?? (globalThis as any)?.Deno?.env?.get?.("SOPHIA_DISPATCHER_MODEL") ?? "gemini-2.5-flash").trim(),
          signals: {
            safety: String(dispatcherSignals.safety.level ?? "NONE"),
            intent: String(dispatcherSignals.user_intent_primary ?? "UNKNOWN"),
            intent_conf: Number(dispatcherSignals.user_intent_confidence ?? 0),
            interrupt: String(dispatcherSignals.interrupt.kind ?? "NONE"),
            topic_depth: String(dispatcherSignals.topic_depth?.value ?? "NONE"),
            flow_resolution: String(dispatcherSignals.flow_resolution?.kind ?? "NONE"),
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
          model: String(meta?.model ?? (globalThis as any)?.Deno?.env?.get?.("SOPHIA_CHAT_MODEL") ?? "gemini-2.5-flash").trim(),
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
