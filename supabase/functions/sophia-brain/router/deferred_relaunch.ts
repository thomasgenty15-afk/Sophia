import type { AgentMode } from "../state-manager.ts";
import type { BrainTracePhase } from "../../_shared/brain-trace.ts";
import type {
  DeferredMachineType,
  DeferredTopicV2,
} from "./deferred_topics_v2.ts";
import type { PendingResolutionSignal } from "./pending_resolution.ts";
import {
  getNextDeferredToProcess,
  hasPendingDeferredTopics,
  isDeferredPaused,
  removeDeferredTopicV2,
} from "./deferred_topics_v2.ts";
import {
  upsertActivateActionFlow,
  upsertBreakdownActionFlow,
  upsertCreateActionFlow,
  upsertDeactivateActionFlow,
  upsertDeepReasonsExploration,
  upsertDeleteActionFlow,
  upsertTopicLight,
  upsertTopicSerious,
  upsertUpdateActionFlow,
} from "../supervisor.ts";
import { createActionCandidate } from "../agents/architect/action_candidate_types.ts";
import { createUpdateCandidate } from "../agents/architect/update_action_candidate_types.ts";
import { createBreakdownCandidate } from "../agents/architect/breakdown_candidate_types.ts";
import { startDeepReasonsExploration } from "../agents/architect/deep_reasons.ts";
import {
  looksLikeNoToProceed,
  looksLikeYesToProceed,
} from "../agents/architect/consent.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// PENDING RELAUNCH CONSENT STATE
// ═══════════════════════════════════════════════════════════════════════════════

export interface PendingRelaunchConsent {
  machine_type: DeferredMachineType;
  action_target?: string;
  summaries: string[];
  created_at: string;
  unclear_reask_count?: number;
}

/**
 * Store pending relaunch consent - machine won't start until user confirms.
 */
export function setPendingRelaunchConsent(opts: {
  tempMemory: any;
  topic: DeferredTopicV2;
}): { tempMemory: any } {
  const pending: PendingRelaunchConsent = {
    machine_type: opts.topic.machine_type,
    action_target: opts.topic.action_target,
    summaries: opts.topic.signal_summaries.map((s) => s.summary),
    created_at: new Date().toISOString(),
    unclear_reask_count: 0,
  };
  return {
    tempMemory: {
      ...(opts.tempMemory ?? {}),
      __pending_relaunch_consent: pending,
    },
  };
}

/**
 * Get pending relaunch consent if exists.
 */
export function getPendingRelaunchConsent(
  tempMemory: any,
): PendingRelaunchConsent | null {
  const pending = (tempMemory as any)?.__pending_relaunch_consent;
  if (!pending || typeof pending !== "object") return null;
  if (!pending.machine_type) return null;
  return pending as PendingRelaunchConsent;
}

/**
 * Clear pending relaunch consent (after user responds).
 */
export function clearPendingRelaunchConsent(
  tempMemory: any,
): { tempMemory: any } {
  const next = { ...(tempMemory ?? {}) };
  delete next.__pending_relaunch_consent;
  return { tempMemory: next };
}

/**
 * Legacy consent signal from dispatcher (superseded by pending_resolution).
 */
export interface ConsentSignal {
  value: true | false | "unclear";
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSENT QUESTION MESSAGES (vraies questions, pas d'entrée directe)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a TRUE consent question for relaunch (user must say yes/no).
 */
export function generateRelaunchConsentQuestion(
  topic: DeferredTopicV2,
): string {
  const target = topic.action_target;
  const machineType = topic.machine_type;
  const latestSummary = topic.signal_summaries.length > 0
    ? topic.signal_summaries[topic.signal_summaries.length - 1].summary
    : null;

  switch (machineType) {
    case "breakdown_action":
      if (target && latestSummary) {
        return `Tout à l'heure tu me parlais de ${target} (${latestSummary.toLowerCase()}). Tu veux qu'on s'en occupe maintenant ?`;
      }
      return target
        ? `Tu voulais qu'on simplifie "${target}". On s'y met ?`
        : `Tu voulais qu'on débloque une action. Tu veux qu'on en parle maintenant ?`;

    case "create_action":
      return target
        ? `Tu voulais créer "${target}". On le fait maintenant ?`
        : `Tu avais une idée d'action à créer. Tu veux qu'on s'y mette ?`;

    case "update_action":
      return target
        ? `Tu voulais modifier "${target}". On fait ça maintenant ?`
        : `Tu voulais modifier une action. Tu veux qu'on s'en occupe ?`;

    case "activate_action":
      return target
        ? `Tu voulais activer "${target}". On s'y met maintenant ?`
        : `Tu voulais activer une action. Tu veux qu'on s'en occupe ?`;

    case "delete_action":
      return target
        ? `Tu voulais supprimer "${target}". On s'en occupe maintenant ?`
        : `Tu voulais retirer une action de ton plan. Tu veux qu'on en parle ?`;

    case "deactivate_action":
      return target
        ? `Tu voulais désactiver "${target}". On s'en occupe maintenant ?`
        : `Tu voulais mettre en pause une action. Tu veux qu'on en parle ?`;

    case "track_progress":
      return `Tu voulais noter un progrès. On le fait maintenant ?`;

    case "deep_reasons":
      return target
        ? `Tu voulais qu'on creuse un peu plus ${target}. Tu veux qu'on en parle ?`
        : `Tu voulais explorer quelque chose de plus profond. Tu veux en parler maintenant ?`;

    case "topic_serious":
      return target
        ? `Tu voulais parler de ${target}. Tu veux qu'on en discute maintenant ?`
        : `Tu avais un sujet important à aborder. Tu veux en parler ?`;

    case "topic_light":
      return target
        ? `Au fait, tu voulais parler de ${target}. On y va ?`
        : `Tu voulais qu'on discute de quelque chose. Tu veux en parler ?`;

    case "checkup":
      return `Tu voulais faire le bilan. On s'y met maintenant ?`;

    default:
      return target
        ? `On avait noté "${target}". Tu veux qu'on s'en occupe maintenant ?`
        : `On avait noté quelque chose. Tu veux qu'on en parle ?`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-RELAUNCH FROM DEFERRED (now with consent)
// ═══════════════════════════════════════════════════════════════════════════════

export async function applyAutoRelaunchFromDeferred(opts: {
  tempMemory: any;
  responseContent: string;
  nextMode: AgentMode;
  trace: (
    event: string,
    phase: BrainTracePhase,
    payload?: Record<string, unknown>,
    level?: "debug" | "info" | "warn" | "error",
  ) => Promise<void>;
}): Promise<{ tempMemory: any; responseContent: string; nextMode: AgentMode }> {
  let { tempMemory, responseContent, nextMode } = opts;
  const flowJustClosed = (tempMemory as any)?.__flow_just_closed_normally;
  if (!flowJustClosed) return { tempMemory, responseContent, nextMode };

  try {
    delete (tempMemory as any).__flow_just_closed_normally;
  } catch {}

  if (!isDeferredPaused(tempMemory) && hasPendingDeferredTopics(tempMemory)) {
    const nextDeferred = getNextDeferredToProcess(tempMemory);
    if (nextDeferred) {
      // Store pending consent state (machine will only start if user says yes)
      // The AGENT will ask the question via add-on at next turn (not a template!)
      const consentResult = setPendingRelaunchConsent({
        tempMemory,
        topic: nextDeferred,
      });
      tempMemory = consentResult.tempMemory; // Store flag for agent add-on to be injected at next turn
      (tempMemory as any).__ask_relaunch_consent = {
        machine_type: nextDeferred.machine_type,
        action_target: nextDeferred.action_target,
        summaries: nextDeferred.signal_summaries.map((s) => s.summary),
      };

      // Remove from deferred queue (we're asking about it now)
      const removeResult = removeDeferredTopicV2({
        tempMemory,
        topicId: nextDeferred.id,
      });
      tempMemory = removeResult.tempMemory;

      await opts.trace("brain:relaunch_consent_pending", "routing", {
        machine_type: nextDeferred.machine_type,
        action_target: nextDeferred.action_target,
        from_deferred_id: nextDeferred.id,
        trigger_count: nextDeferred.trigger_count,
      });
    }
  }

  return { tempMemory, responseContent, nextMode };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROCESS USER RESPONSE TO CONSENT QUESTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Process user's response to a relaunch consent question.
 * Called AFTER the dispatcher has analyzed the message.
 *
 * Uses structured pending_resolution signal (preferred), then legacy consent_to_relaunch.
 *
 * Returns:
 * - { handled: true, ... } if consent was processed
 * - { handled: false } if no pending consent
 */
export function processRelaunchConsentResponse(opts: {
  tempMemory: any;
  userMessage: string;
  /** Legacy signal from dispatcher (kept for backward compatibility) */
  dispatcherConsentSignal?: ConsentSignal | undefined;
  /** Structured pending-resolution signal from dispatcher (hybrid model) */
  pendingResolutionSignal?: PendingResolutionSignal | undefined;
}): {
  handled: boolean;
  tempMemory: any;
  shouldInitMachine: boolean;
  machineType?: DeferredMachineType;
  actionTarget?: string;
  nextMode?: AgentMode;
  declineMessage?: string;
  unclearReaskScheduled?: boolean;
  droppedAfterUnclear?: boolean;
} {
  const pending = getPendingRelaunchConsent(opts.tempMemory);
  if (!pending) {
    return {
      handled: false,
      tempMemory: opts.tempMemory,
      shouldInitMachine: false,
    };
  }

  let tempMemory = opts.tempMemory;
  void opts.userMessage;

  // Determine consent: structured pending_resolution first, then legacy consent signal.
  const consentValue = (() => {
    const resolution = opts.pendingResolutionSignal;
    if (
      resolution &&
      resolution.pending_type === "relaunch_consent" &&
      (resolution.confidence ?? 0) >= 0.55
    ) {
      switch (resolution.decision_code) {
        case "relaunch.accept":
          return true;
        case "relaunch.decline":
          return false;
        default:
          return "unclear";
      }
    }
    // Backward-compatible fallback (legacy dispatcher field)
    if (
      opts.dispatcherConsentSignal &&
      opts.dispatcherConsentSignal.confidence >= 0.6
    ) {
      return opts.dispatcherConsentSignal.value;
    }
    // Hybrid fallback: only as guardrail when LLM confidence is missing/low.
    // This prevents repeated relaunch re-asks on explicit short confirmations.
    if (looksLikeYesToProceed(opts.userMessage)) return true;
    if (looksLikeNoToProceed(opts.userMessage)) return false;
    return "unclear";
  })();

  // Process based on consent value
  if (consentValue === true) {
    // User says YES → initialize the machine
    tempMemory = clearPendingRelaunchConsent(tempMemory).tempMemory;
    const initResult = initializeMachineFromConsent({
      tempMemory,
      machineType: pending.machine_type,
      actionTarget: pending.action_target,
      summaries: pending.summaries,
    });
    return {
      handled: true,
      tempMemory: initResult.tempMemory,
      shouldInitMachine: true,
      machineType: pending.machine_type,
      actionTarget: pending.action_target,
      nextMode: initResult.nextMode,
    };
  }

  if (consentValue === false) {
    // User says NO → don't initialize, provide graceful decline
    tempMemory = clearPendingRelaunchConsent(tempMemory).tempMemory;
    return {
      handled: true,
      tempMemory,
      shouldInitMachine: false,
      declineMessage: generateDeclineRelaunchMessage(pending),
    };
  }

  // Unclear response:
  // - First time: keep pending and ask once again.
  // - Second time: drop gracefully to avoid endless relaunch loops.
  const unclearCount = Math.max(
    0,
    Math.floor(Number(pending.unclear_reask_count ?? 0)),
  );
  if (unclearCount < 1) {
    const updatedPending: PendingRelaunchConsent = {
      ...pending,
      unclear_reask_count: unclearCount + 1,
    };
    tempMemory = {
      ...(tempMemory ?? {}),
      __pending_relaunch_consent: updatedPending,
      __ask_relaunch_consent: {
        machine_type: pending.machine_type,
        action_target: pending.action_target,
        summaries: pending.summaries,
      },
    };
    return {
      handled: true,
      tempMemory,
      shouldInitMachine: false,
      unclearReaskScheduled: true,
    };
  }

  tempMemory = clearPendingRelaunchConsent(tempMemory).tempMemory;
  return {
    handled: true,
    tempMemory,
    shouldInitMachine: false,
    declineMessage: generateDeclineRelaunchMessage(pending),
    droppedAfterUnclear: true,
  };
}

/**
 * Generate message when user declines relaunch.
 */
function generateDeclineRelaunchMessage(
  pending: PendingRelaunchConsent,
): string {
  const target = pending.action_target;

  switch (pending.machine_type) {
    case "breakdown_action":
    case "update_action":
    case "create_action":
    case "activate_action":
    case "delete_action":
    case "deactivate_action":
      return target
        ? `Ok, pas de souci. Tu pourras me redemander pour "${target}" quand tu veux.`
        : `Ok, pas de souci. Tu pourras me redemander quand tu veux.`;

    case "deep_reasons":
      return `Ok, on laisse ça pour l'instant. Tu pourras en reparler quand tu te sentiras prêt.`;

    case "topic_serious":
    case "topic_light":
      return target
        ? `Ok, on reparlera de ${target} une autre fois si tu veux.`
        : `Ok, on en reparlera une autre fois.`;

    case "checkup":
      return `Ok, pas de souci. On fera le bilan demain.`;

    default:
      return `Ok, pas de souci. On peut en reparler quand tu veux.`;
  }
}

/**
 * Initialize the machine after user consent.
 */
function initializeMachineFromConsent(opts: {
  tempMemory: any;
  machineType: DeferredMachineType;
  actionTarget?: string;
  summaries: string[];
}): { tempMemory: any; nextMode: AgentMode } {
  let { tempMemory } = opts;
  let nextMode: AgentMode = "companion";

  switch (opts.machineType) {
    case "breakdown_action": {
      const candidate = createBreakdownCandidate({
        target_action: opts.actionTarget
          ? { title: opts.actionTarget }
          : undefined,
      });
      const updated = upsertBreakdownActionFlow({ tempMemory, candidate });
      tempMemory = updated.tempMemory;
      nextMode = "architect";
      break;
    }

    case "update_action": {
      const candidate = createUpdateCandidate({
        target_action: { title: opts.actionTarget ?? "une action" },
        proposed_changes: {},
      });
      const updated = upsertUpdateActionFlow({ tempMemory, candidate });
      tempMemory = updated.tempMemory;
      nextMode = "architect";
      break;
    }

    case "create_action": {
      const candidate = createActionCandidate({
        label: opts.actionTarget ?? "Nouvelle action",
        proposed_by: "sophia",
        status: "exploring", // Start in exploring, not awaiting_confirm
      });
      const updated = upsertCreateActionFlow({ tempMemory, candidate });
      tempMemory = updated.tempMemory;
      nextMode = "architect";
      break;
    }

    case "activate_action": {
      const updated = upsertActivateActionFlow({
        tempMemory,
        targetAction: opts.actionTarget ?? "une action",
        phase: "exploring",
      });
      tempMemory = updated.tempMemory;
      nextMode = "architect";
      break;
    }

    case "delete_action": {
      const updated = upsertDeleteActionFlow({
        tempMemory,
        targetAction: opts.actionTarget ?? "une action",
        phase: "exploring",
      });
      tempMemory = updated.tempMemory;
      nextMode = "architect";
      break;
    }

    case "deactivate_action": {
      const updated = upsertDeactivateActionFlow({
        tempMemory,
        targetAction: opts.actionTarget ?? "une action",
        phase: "exploring",
      });
      tempMemory = updated.tempMemory;
      nextMode = "architect";
      break;
    }

    case "track_progress": {
      nextMode = "architect";
      break;
    }

    case "topic_light": {
      const topic = opts.actionTarget ?? opts.summaries[0] ?? "un sujet";
      const updated = upsertTopicLight({ tempMemory, topic, phase: "opening" });
      tempMemory = updated.tempMemory;
      nextMode = "companion";
      break;
    }

    case "topic_serious": {
      const topic = opts.actionTarget ?? opts.summaries[0] ??
        "un sujet important";
      const updated = upsertTopicSerious({
        tempMemory,
        topic,
        phase: "opening",
      });
      tempMemory = updated.tempMemory;
      nextMode = "architect";
      break;
    }

    case "deep_reasons": {
      const topic = opts.actionTarget ?? opts.summaries[0] ??
        "un blocage motivationnel";
      const deepReasonsState = startDeepReasonsExploration({
        action_title: opts.actionTarget,
        detected_pattern: "unknown",
        user_words: topic,
        source: "deferred",
        // User has already accepted the relaunch consent question.
        skip_re_consent: true,
      });
      const updated = upsertDeepReasonsExploration({
        tempMemory,
        topic,
        phase: deepReasonsState.phase,
        source: "deferred",
      });
      tempMemory = {
        ...(updated.tempMemory ?? {}),
        deep_reasons_state: deepReasonsState,
      };
      nextMode = "architect";
      break;
    }

    case "checkup": {
      // Consent already obtained for relaunch: start bilan directly (no entry confirmation pending).
      delete (tempMemory as any).__checkup_entry_pending;
      delete (tempMemory as any).__ask_checkup_confirmation;
      nextMode = "investigator";
      break;
    }
  }

  return { tempMemory, nextMode };
}
