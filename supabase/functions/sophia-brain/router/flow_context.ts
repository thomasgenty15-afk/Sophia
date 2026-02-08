import type { FlowContext } from "./dispatcher.ts";
import type { PendingResolutionType } from "./pending_resolution.ts";
import {
  getActiveActivateActionFlow,
  getActiveBreakdownActionFlow,
  getActiveCreateActionFlow,
  getActiveDeactivateActionFlow,
  getActiveDeleteActionFlow,
  getActiveSafetyFirefighterFlow,
  getActiveSafetySentryFlow,
  getActiveTopicSession,
  getActiveTrackProgressFlow,
  getActiveUpdateActionFlow,
  getCurrentFactToConfirm,
  getProfileConfirmationState,
  hasActiveProfileConfirmation,
} from "../supervisor.ts";
import { getDeferredTopicsV2 } from "./deferred_topics_v2.ts";

/**
 * Check if a machine type matches a signal type.
 * Used to update signal status when entering a machine.
 */
export function machineMatchesSignalType(
  machineType: string | null,
  signalType: string,
): boolean {
  if (!machineType || !signalType) return false;
  const mappings: Record<string, string[]> = {
    "create_action_flow": ["create_action_intent", "create_action"],
    "update_action_flow": ["update_action_intent", "update_action"],
    "breakdown_action_flow": [
      "breakdown_action_intent",
      "breakdown_action",
      "breakdown_intent",
    ],
    "activate_action_flow": ["activate_action_intent", "activate_action"],
    "delete_action_flow": ["delete_action_intent", "delete_action"],
    "deactivate_action_flow": ["deactivate_action_intent", "deactivate_action"],
    "track_progress_flow": ["track_progress"],
    "track_progress_consent": ["track_progress"],
    "update_action_consent": ["update_action"],
    "topic_serious": ["topic_exploration_intent", "topic_serious"],
    "topic_light": ["topic_exploration_intent", "topic_light"],
    "deep_reasons_exploration": ["deep_reasons_intent", "deep_reasons"],
    "user_profile_confirmation": [
      "profile_info_detected",
      "profile_confirmation",
    ],
    // Safety flows - they handle safety_resolution signals
    "safety_firefighter_flow": [
      "safety_resolution",
      "firefighter_resolution",
      "crisis_resolution",
    ],
    "safety_sentry_flow": [
      "safety_resolution",
      "sentry_resolution",
      "vital_danger_resolution",
    ],
    // Onboarding flow (WhatsApp) - no mother signal, forced entry only
    "whatsapp_onboarding_flow": ["onboarding_ready", "onboarding_score"],
  };
  return mappings[machineType]?.includes(signalType) ?? false;
}

/**
 * Get the currently active machine type from temp_memory.
 */
export function getActiveMachineType(tempMemory: any): string | null {
  // SAFETY FLOWS FIRST - they have highest priority and can interrupt any other machine
  const sentryFlow = getActiveSafetySentryFlow(tempMemory);
  if (sentryFlow && sentryFlow.phase !== "resolved") {
    return "safety_sentry_flow";
  }

  const firefighterFlow = getActiveSafetyFirefighterFlow(tempMemory);
  if (firefighterFlow && firefighterFlow.phase !== "resolved") {
    return "safety_firefighter_flow";
  }

  // ONBOARDING FLOW (WhatsApp) - forced, one-shot, right after safety
  if ((tempMemory as any)?.__onboarding_flow) return "whatsapp_onboarding_flow";

  // Check tool flows
  if ((tempMemory as any)?.create_action_flow) return "create_action_flow";
  if ((tempMemory as any)?.update_action_flow) return "update_action_flow";
  if ((tempMemory as any)?.breakdown_action_flow) {
    return "breakdown_action_flow";
  }

  // Check activate_action_flow
  if (getActiveActivateActionFlow(tempMemory)) return "activate_action_flow";

  // Check delete_action_flow
  if (getActiveDeleteActionFlow(tempMemory)) return "delete_action_flow";

  // Check deactivate_action_flow
  if (getActiveDeactivateActionFlow(tempMemory)) {
    return "deactivate_action_flow";
  }

  // Check track_progress_flow (supervisor) or legacy __update_flow_stage awaiting consent
  if (getActiveTrackProgressFlow(tempMemory)) return "track_progress_flow";
  {
    const legacyStage = (tempMemory as any)?.__update_flow_stage;
    if (legacyStage && String(legacyStage.stage ?? "") === "awaiting_consent") {
      const kind = String(legacyStage.kind ?? "");
      if (kind === "track_progress") return "track_progress_consent";
      if (kind === "update_action_structure") return "update_action_consent";
    }
  }

  // Check topic sessions
  const topicSession = getActiveTopicSession(tempMemory);
  if (topicSession?.type === "topic_serious") return "topic_serious";
  if (topicSession?.type === "topic_light") return "topic_light";

  // Check deep reasons
  if ((tempMemory as any)?.deep_reasons_state) {
    return "deep_reasons_exploration";
  }

  // Check profile confirmation
  if (hasActiveProfileConfirmation(tempMemory)) {
    return "user_profile_confirmation";
  }

  return null;
}

/**
 * Build the flow context for the active machine.
 * This enriches the dispatcher prompt with details about what's happening in the flow.
 */
export function buildFlowContext(
  tempMemory: any,
  state?: any,
): FlowContext | undefined {
  const tm = tempMemory as any;
  const checkupAddon = tm?.__checkup_entry_pending
    ? "CHECKUP_ENTRY_CONFIRM"
    : tm?.__bilan_already_done_pending
    ? "BILAN_ALREADY_DONE"
    : tm?.__checkup_deferred_topic
    ? "CHECKUP_DEFERRED"
    : undefined;

  // Check for pending relaunch consent (highest priority after safety)
  const pendingConsent = tm?.__pending_relaunch_consent;
  const pendingRelaunchConsent = pendingConsent
    ? {
      machine_type: pendingConsent.machine_type,
      action_target: pendingConsent.action_target,
      summaries: pendingConsent.summaries ?? [],
    }
    : undefined;

  // Generic pending resolution context (priority: dual_tool > relaunch_consent > checkup_entry > resume_prompt)
  const pendingSignalResolution = (() => {
    const pendingDual = tm?.__pending_dual_tool;
    if (pendingDual && pendingDual.tool1 && pendingDual.tool2) {
      return {
        pending_type: "dual_tool" as PendingResolutionType,
        dual_tool: {
          tool1_verb: String(pendingDual.tool1.verb ?? "actionner"),
          tool1_target: pendingDual.tool1.target_hint
            ? String(pendingDual.tool1.target_hint)
            : undefined,
          tool2_verb: String(pendingDual.tool2.verb ?? "actionner"),
          tool2_target: pendingDual.tool2.target_hint
            ? String(pendingDual.tool2.target_hint)
            : undefined,
        },
      };
    }
    if (pendingConsent?.machine_type) {
      return {
        pending_type: "relaunch_consent" as PendingResolutionType,
        relaunch_consent: {
          machine_type: String(pendingConsent.machine_type),
          action_target: pendingConsent.action_target
            ? String(pendingConsent.action_target)
            : undefined,
        },
      };
    }
    if (tm?.__checkup_entry_pending) {
      return {
        pending_type: "checkup_entry" as PendingResolutionType,
      };
    }
    {
      const marker = tm?.__router_resume_prompt_v1;
      const kindRaw = String(marker?.kind ?? "");
      const askedAt = Date.parse(String(marker?.asked_at ?? ""));
      const expired = Number.isFinite(askedAt)
        ? (Date.now() - askedAt) > 30 * 60 * 1000
        : true;
      if (
        !expired &&
        (kindRaw === "toolflow" || kindRaw === "safety_recovery")
      ) {
        return {
          pending_type: "resume_prompt" as PendingResolutionType,
          resume_prompt: {
            kind: kindRaw as "toolflow" | "safety_recovery",
          },
        };
      }
    }
    return undefined;
  })();

  // Calculate deferred topics summary for dispatcher awareness
  const deferredTopics = getDeferredTopicsV2(tempMemory);
  const deferredTopicsSummary = deferredTopics.length > 0
    ? deferredTopics.map((t) => ({
      id: t.id,
      machine_type: t.machine_type,
      action_target: t.action_target,
      briefs: t.signal_summaries.map((s) => s.summary),
      trigger_count: t.trigger_count,
      age_hours: Math.round(
        (Date.now() - new Date(t.created_at).getTime()) / 3600000,
      ),
    }))
    : undefined;

  const withCheckup = (ctx: FlowContext): FlowContext => {
    let result = ctx;
    if (checkupAddon) {
      result = {
        ...result,
        checkupAddon,
        checkupDeferredTopic: tm?.__checkup_deferred_topic,
      };
    }
    if (pendingSignalResolution) {
      result = { ...result, pendingSignalResolution };
    }
    if (pendingRelaunchConsent) {
      result = { ...result, pendingRelaunchConsent };
    }
    if (deferredTopicsSummary) {
      result = { ...result, deferredTopicsSummary };
    }
    return result;
  };

  // SAFETY FLOWS - highest priority (they can interrupt anything)
  const sentryFlow = getActiveSafetySentryFlow(tempMemory);
  if (sentryFlow && sentryFlow.phase !== "resolved") {
    return withCheckup({
      isSafetyFlow: true,
      safetyFlowType: "sentry",
      safetyPhase: sentryFlow.phase,
      safetyTurnCount: sentryFlow.turn_count,
      safetyConfirmed: sentryFlow.safety_confirmed,
      externalHelpMentioned: sentryFlow.external_help_mentioned,
    });
  }

  const firefighterFlow = getActiveSafetyFirefighterFlow(tempMemory);
  if (firefighterFlow && firefighterFlow.phase !== "resolved") {
    return withCheckup({
      isSafetyFlow: true,
      safetyFlowType: "firefighter",
      safetyPhase: firefighterFlow.phase,
      safetyTurnCount: firefighterFlow.turn_count,
      stabilizationSignals: firefighterFlow.stabilization_signals,
      distressSignals: firefighterFlow.distress_signals,
      lastTechnique: firefighterFlow.technique_used,
    });
  }

  // ONBOARDING FLOW (WhatsApp) - forced, one-shot, right after safety
  const onbFlow = (tm as any)?.__onboarding_flow;
  if (onbFlow) {
    return withCheckup({
      onboardingStep: onbFlow.step,
      onboardingTurnCount: Number(onbFlow.turn_count ?? 0),
      onboardingPlanTitle: onbFlow.plan_title,
    });
  }

  // Bilan (investigation) active - highest priority after safety
  const invState = state?.investigation_state;
  if (invState && invState.status !== "post_checkup") {
    const currentIndex = invState.current_item_index ?? 0;
    const currentItem = invState.pending_items?.[currentIndex];
    const pendingOffer = invState.temp_memory?.bilan_defer_offer;

    const missedStreaksByAction = (invState.temp_memory as any)
      ?.missed_streaks_by_action as Record<string, number> | undefined;
    const currentId = pendingOffer?.action_id ?? currentItem?.id;
    const cachedStreak = currentId
      ? missedStreaksByAction?.[String(currentId)]
      : undefined;
    // Get missed streak from pending offer, cache, or legacy breakdown state if available
    const missedStreak = pendingOffer?.streak_days ??
      cachedStreak ??
      invState.temp_memory?.breakdown?.streak_days ??
      0;

    return withCheckup({
      isBilan: true,
      currentItemTitle: pendingOffer?.action_title ?? currentItem?.title,
      currentItemId: pendingOffer?.action_id ?? currentItem?.id,
      missedStreak,
      missedStreaksByAction:
        missedStreaksByAction && Object.keys(missedStreaksByAction).length > 0
          ? missedStreaksByAction
          : undefined,
    });
  }

  // Create action flow (v2 supervisor)
  {
    const session = getActiveCreateActionFlow(tempMemory);
    const candidate = (session as any)?.meta?.candidate;
    if (candidate) {
      return withCheckup({
        actionLabel: candidate.label,
        actionType: candidate.type,
        actionStatus: candidate.status,
        clarificationCount: candidate.clarification_count ?? 0,
      });
    }
  }

  // Update action flow (v2 supervisor)
  {
    const session = getActiveUpdateActionFlow(tempMemory);
    const candidate = (session as any)?.meta?.candidate;
    if (candidate) {
      const changes: string[] = [];
      if (candidate.proposed_changes?.new_reps) {
        changes.push(`freq: ${candidate.proposed_changes.new_reps}x`);
      }
      if (candidate.proposed_changes?.new_days) {
        changes.push(
          `jours: ${candidate.proposed_changes.new_days.join(", ")}`,
        );
      }
      if (candidate.proposed_changes?.new_time_of_day) {
        changes.push(`moment: ${candidate.proposed_changes.new_time_of_day}`);
      }
      if (candidate.proposed_changes?.new_title) {
        changes.push(`titre: ${candidate.proposed_changes.new_title}`);
      }
      return withCheckup({
        targetActionTitle: candidate.target_action?.title,
        proposedChanges: changes.length > 0 ? changes.join(", ") : undefined,
        updateStatus: candidate.status,
        updateClarificationCount: candidate.clarification_count ?? 0,
      });
    }
  }

  // Breakdown action flow (v2 supervisor)
  {
    const session = getActiveBreakdownActionFlow(tempMemory);
    const candidate = (session as any)?.meta?.candidate;
    if (candidate) {
      return withCheckup({
        breakdownTarget: candidate.target_action?.title,
        blocker: candidate.blocker,
        proposedStep: candidate.proposed_step?.title,
        breakdownStatus: candidate.status,
        breakdownClarificationCount: candidate.clarification_count ?? 0,
      });
    }
  }

  // Activate action flow (v2 supervisor)
  {
    const session = getActiveActivateActionFlow(tempMemory);
    if (session) {
      const meta = session.meta as any;
      return withCheckup({
        activateActionTarget: meta?.target_action,
        activateExerciseType: meta?.exercise_type,
        activateStatus: meta?.phase ?? "exploring",
      });
    }
  }

  // Delete action flow (v2 supervisor)
  {
    const session = getActiveDeleteActionFlow(tempMemory);
    if (session) {
      const meta = session.meta as any;
      return withCheckup({
        deleteActionTarget: meta?.target_action,
        deleteActionReason: meta?.reason,
        deleteActionStatus: meta?.phase ?? "exploring",
      });
    }
  }

  // Deactivate action flow (v2 supervisor)
  {
    const session = getActiveDeactivateActionFlow(tempMemory);
    if (session) {
      const meta = session.meta as any;
      return withCheckup({
        deactivateActionTarget: meta?.target_action,
        deactivateActionStatus: meta?.phase ?? "exploring",
      });
    }
  }

  // Track progress flow (supervisor-based or legacy awaiting consent)
  {
    const tpSession = getActiveTrackProgressFlow(tempMemory);
    if (tpSession) {
      const meta = tpSession.meta as any;
      const legacyStage = tm?.__update_flow_stage;
      const isAwaitingConsent = legacyStage &&
        String(legacyStage.kind ?? "") === "track_progress" &&
        String(legacyStage.stage ?? "") === "awaiting_consent";
      return withCheckup({
        trackProgressTarget: meta?.target_action ??
          legacyStage?.draft?.target_name,
        trackProgressStatusHint: meta?.status_hint ??
          legacyStage?.draft?.status,
        trackProgressAwaiting: isAwaitingConsent ?? false,
      });
    }
    // Legacy-only track_progress consent (no supervisor session)
    const legacyStage = tm?.__update_flow_stage;
    if (
      legacyStage &&
      String(legacyStage.kind ?? "") === "track_progress" &&
      String(legacyStage.stage ?? "") === "awaiting_consent"
    ) {
      return withCheckup({
        trackProgressTarget: legacyStage.draft?.target_name,
        trackProgressStatusHint: legacyStage.draft?.status,
        trackProgressAwaiting: true,
      });
    }
    // Legacy update_action_structure consent
    if (
      legacyStage &&
      String(legacyStage.kind ?? "") === "update_action_structure" &&
      String(legacyStage.stage ?? "") === "awaiting_consent"
    ) {
      return withCheckup({
        updateActionOldTarget: legacyStage.draft?.target_name,
        updateActionOldAwaiting: true,
      });
    }
  }

  // Topic exploration
  const topicSession = getActiveTopicSession(tempMemory);
  if (topicSession) {
    return withCheckup({
      topicLabel: topicSession.topic,
      topicPhase: topicSession.phase,
    });
  }

  // Deep reasons exploration
  if (tm?.deep_reasons_state) {
    const dr = tm.deep_reasons_state;
    const deepTopic = String(
      dr?.action_context?.title ??
        dr?.user_words ??
        "blocage motivationnel",
    ).trim().slice(0, 160);
    return withCheckup({
      deepReasonsTopic: deepTopic,
      deepReasonsPhase: dr?.phase,
      deepReasonsTurnCount: Number(dr?.turn_count ?? 0),
      deepReasonsPattern: dr?.detected_pattern,
    });
  }

  // Profile confirmation
  if (hasActiveProfileConfirmation(tempMemory)) {
    const confirmState = getProfileConfirmationState(tempMemory);
    const pending = getCurrentFactToConfirm(tempMemory);
    if (pending && confirmState) {
      return withCheckup({
        profileFactKey: pending.key,
        profileFactValue: pending.proposed_value,
        profileConfirmPhase: confirmState.phase ?? "awaiting_confirm",
        profileConfirmQueueSize: confirmState.facts_queue?.length ?? 0,
        profileConfirmCurrentIndex: confirmState.current_index ?? 0,
      });
    }
  }

  // Return context if we have checkup addon or pending relaunch consent
  if (checkupAddon || pendingRelaunchConsent) {
    return withCheckup({});
  }

  return undefined;
}
