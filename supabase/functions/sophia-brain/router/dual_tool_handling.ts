/**
 * Dual-Tool Intent Detection and Handling
 *
 * Detects when a user message implies two distinct tool operations in a single message
 * (e.g., "supprime X et crée Y", "désactive X et modifie Y").
 *
 * Key design:
 * - Does NOT change the "1 signal mère" dispatcher rule.
 * - Exploits filterToSingleMotherSignal's { primarySignal, filtered } output.
 * - When exactly 2 tool signals are detected, activates dual-tool handling.
 * - Normal mode: disambiguate order, launch primary, defer secondary.
 * - Active machine mode: notify user, defer both.
 */

import type { MotherSignalType } from "./deferral_handling.ts";
import type { DispatcherSignals } from "./dispatcher.ts";
import type { DeferredMachineType } from "./deferred_topics_v2.ts";
import { deferSignal } from "./deferred_topics_v2.ts";
import { generateDeferredSignalSummary } from "./dispatcher.ts";
import type { PendingResolutionSignal } from "./pending_resolution.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** All tool-related mother signal types (non-conversational). */
const TOOL_SIGNAL_TYPES: MotherSignalType[] = [
  "create_action",
  "update_action",
  "delete_action",
  "deactivate_action",
  "activate_action",
  "breakdown_action",
];

/** Human-readable verb for each tool signal type. */
const TOOL_VERB_LABELS: Record<string, string> = {
  create_action: "créer",
  update_action: "modifier",
  delete_action: "supprimer",
  deactivate_action: "désactiver",
  activate_action: "activer",
  breakdown_action: "simplifier",
};

export interface DualToolEntry {
  signal_type: MotherSignalType;
  verb: string; // Human-readable: "créer", "supprimer", etc.
  target_hint?: string; // Action name if detected (e.g., "méditation")
  confidence: number; // Signal confidence (0..1)
}

export interface DualToolIntent {
  tool1: DualToolEntry;
  tool2: DualToolEntry;
}

export interface PendingDualTool {
  tool1: DualToolEntry;
  tool2: DualToolEntry;
  /** Monotonic router turn index when created (preferred TTL mechanism). */
  turn_created?: number;
  /** Legacy timestamp fallback for older entries. */
  created_at?: string;
  /** How many times we've re-asked for clarification (max 1) */
  reask_count: number;
}

/** Result of processing a pending dual-tool user response. */
export type DualToolResponseResult =
  | { outcome: "confirmed_both"; tool1: DualToolEntry; tool2: DualToolEntry }
  | {
    outcome: "confirmed_reversed";
    tool1: DualToolEntry;
    tool2: DualToolEntry;
  }
  | { outcome: "only_first"; tool: DualToolEntry }
  | { outcome: "only_second"; tool: DualToolEntry }
  | { outcome: "unclear"; reask: boolean }
  | { outcome: "dropped" };

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Check if a mother signal type is a tool signal (not topic/deep_reasons/checkup). */
export function isToolMotherSignal(signalType: MotherSignalType): boolean {
  return TOOL_SIGNAL_TYPES.includes(signalType);
}

/** Get human-readable verb label for a tool signal type. */
export function toolVerbLabel(signalType: MotherSignalType): string {
  return TOOL_VERB_LABELS[signalType] ?? signalType;
}

/**
 * Extract the target_hint and confidence for a given signal type from dispatcher signals.
 */
function extractSignalDetails(
  signalType: MotherSignalType,
  signals: DispatcherSignals,
): { target_hint?: string; confidence: number } {
  switch (signalType) {
    case "create_action":
      return {
        target_hint: signals.create_action?.action_label_hint,
        confidence: signals.create_action?.confidence ?? 0,
      };
    case "update_action":
      return {
        target_hint: signals.update_action?.target_hint,
        confidence: signals.update_action?.confidence ?? 0,
      };
    case "delete_action":
      return {
        target_hint: signals.delete_action?.target_hint,
        confidence: signals.delete_action?.confidence ?? 0,
      };
    case "deactivate_action":
      return {
        target_hint: signals.deactivate_action?.target_hint,
        confidence: signals.deactivate_action?.confidence ?? 0,
      };
    case "activate_action":
      return {
        target_hint: signals.activate_action?.target_hint,
        confidence: signals.activate_action?.confidence ?? 0,
      };
    case "breakdown_action":
      return {
        target_hint: signals.breakdown_action?.target_hint,
        confidence: signals.breakdown_action?.confidence ?? 0,
      };
    default:
      return { confidence: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract a DualToolIntent from filterToSingleMotherSignal's output.
 * Returns non-null when primary is a tool signal and there's at least one
 * filtered tool signal candidate (highest-priority candidate should be first).
 *
 * @param primarySignal - The primary signal from filterToSingleMotherSignal
 * @param filtered - The filtered-out signals
 * @param signals - Full dispatcher signals (to extract target_hint/confidence)
 */
export function extractDualToolIntent(
  primarySignal: MotherSignalType | null,
  filtered: MotherSignalType[],
  signals: DispatcherSignals,
): DualToolIntent | null {
  // Need exactly 1 primary + at least 1 filtered
  if (!primarySignal || filtered.length === 0) return null;

  // Primary must be a tool signal
  if (!isToolMotherSignal(primarySignal)) return null;

  // Find the first tool signal in the filtered list
  const secondaryToolSignal = filtered.find((s) => isToolMotherSignal(s));
  if (!secondaryToolSignal) return null;

  // Both must be different signal types (e.g., not create + create)
  if (primarySignal === secondaryToolSignal) return null;

  const primaryDetails = extractSignalDetails(primarySignal, signals);
  const secondaryDetails = extractSignalDetails(secondaryToolSignal, signals);

  // Both need minimum confidence
  if (primaryDetails.confidence < 0.5 || secondaryDetails.confidence < 0.5) {
    return null;
  }

  return {
    tool1: {
      signal_type: primarySignal,
      verb: toolVerbLabel(primarySignal),
      target_hint: primaryDetails.target_hint,
      confidence: primaryDetails.confidence,
    },
    tool2: {
      signal_type: secondaryToolSignal,
      verb: toolVerbLabel(secondaryToolSignal),
      target_hint: secondaryDetails.target_hint,
      confidence: secondaryDetails.confidence,
    },
  };
}

/**
 * Determine if a dual-tool intent is "clear" (both tools have distinct verbs AND
 * distinct/identifiable targets with high confidence).
 * If clear, we can skip the confirmation step and go straight to execution.
 */
export function isDualToolClear(intent: DualToolIntent): boolean {
  // Both must have >= 0.7 confidence
  if (intent.tool1.confidence < 0.7 || intent.tool2.confidence < 0.7) {
    return false;
  }

  // Verbs must be different (which they always are since we filter same types)
  if (intent.tool1.verb === intent.tool2.verb) return false;

  // Both should have target hints (otherwise ambiguous)
  if (!intent.tool1.target_hint && !intent.tool2.target_hint) return false;

  // If both have targets, they must be different
  if (
    intent.tool1.target_hint &&
    intent.tool2.target_hint &&
    intent.tool1.target_hint.toLowerCase() ===
      intent.tool2.target_hint.toLowerCase()
  ) {
    // Same target on two different tools: still clear (e.g., "supprime méditation et recrée-la")
    return true;
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NORMAL MODE: No active machine
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle dual-tool when NO machine is currently active.
 *
 * Clear case: launch primary tool normally, defer secondary as a deferred topic.
 * Ambiguous case: store __pending_dual_tool, inject confirmation add-on, route to companion.
 */
export function handleDualToolNoMachine(opts: {
  tempMemory: any;
  intent: DualToolIntent;
  signals: DispatcherSignals;
  userMessage: string;
  currentTurn?: number;
}): {
  tempMemory: any;
  /** "launch_primary_defer_secondary" or "ask_confirmation" */
  action: "launch_primary_defer_secondary" | "ask_confirmation";
  /** Add-on to inject into conversational prompt */
  addon: string;
} {
  const { intent, signals, userMessage } = opts;
  let { tempMemory } = opts;

  if (isDualToolClear(intent)) {
    // CLEAR CASE: launch primary, defer secondary
    const summary = generateDeferredSignalSummary({
      signals,
      userMessage,
      machine_type: intent.tool2.signal_type as DeferredMachineType,
      action_target: intent.tool2.target_hint,
    });

    const deferResult = deferSignal({
      tempMemory,
      machine_type: intent.tool2.signal_type as DeferredMachineType,
      action_target: intent.tool2.target_hint,
      summary,
    });
    tempMemory = deferResult.tempMemory;

    // Lightweight info add-on (no confirmation needed)
    const addon = buildDualToolInfoAddon(intent);

    return { tempMemory, action: "launch_primary_defer_secondary", addon };
  }

  // AMBIGUOUS CASE: ask for confirmation
  const pending: PendingDualTool = {
    tool1: intent.tool1,
    tool2: intent.tool2,
    turn_created: Number.isFinite(opts.currentTurn)
      ? Number(opts.currentTurn)
      : undefined,
    created_at: new Date().toISOString(), // backward-compatible fallback
    reask_count: 0,
  };
  (tempMemory as any).__pending_dual_tool = pending;

  const addon = buildDualToolConfirmationAddon(intent);

  return { tempMemory, action: "ask_confirmation", addon };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVE MACHINE MODE: Bilan, tool flow, or other
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle dual-tool when a machine IS currently active.
 * Defers BOTH tools and injects a notification add-on.
 */
export function handleDualToolWithMachine(opts: {
  tempMemory: any;
  intent: DualToolIntent;
  signals: DispatcherSignals;
  userMessage: string;
  currentMachineType: string;
  currentMachineTarget?: string;
  isBilan: boolean;
}): {
  tempMemory: any;
  addon: string;
} {
  const { intent, signals, userMessage } = opts;
  let { tempMemory } = opts;

  // Defer BOTH tools
  for (const tool of [intent.tool1, intent.tool2]) {
    const summary = generateDeferredSignalSummary({
      signals,
      userMessage,
      machine_type: tool.signal_type as DeferredMachineType,
      action_target: tool.target_hint,
    });

    const deferResult = deferSignal({
      tempMemory,
      machine_type: tool.signal_type as DeferredMachineType,
      action_target: tool.target_hint,
      summary,
    });
    tempMemory = deferResult.tempMemory;
  }

  const addon = buildDualToolNotificationAddon(intent, {
    currentMachineType: opts.currentMachineType,
    currentMachineTarget: opts.currentMachineTarget,
    isBilan: opts.isBilan,
  });

  return { tempMemory, addon };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PENDING DUAL-TOOL RESPONSE PROCESSING
// ═══════════════════════════════════════════════════════════════════════════════

/** Max time (ms) for legacy entries that don't have turn_created. */
const PENDING_DUAL_TOOL_TTL_MS = 5 * 60 * 1000;
/** Preferred TTL: drop pending intent after 2 turns. */
const PENDING_DUAL_TOOL_TTL_TURNS = 2;
/** Max number of re-asks for unclear responses. */
const MAX_REASK_COUNT = 1;

/**
 * Get the pending dual-tool from temp memory (if any).
 */
export function getPendingDualTool(tempMemory: any): PendingDualTool | null {
  return (tempMemory as any)?.__pending_dual_tool ?? null;
}

/**
 * Clear the pending dual-tool from temp memory.
 */
export function clearPendingDualTool(tempMemory: any): any {
  const next = { ...(tempMemory ?? {}) };
  delete next.__pending_dual_tool;
  return next;
}

/**
 * Process user response to a pending dual-tool confirmation.
 * Interprets the user's answer to determine what to do.
 */
export function processPendingDualToolResponse(opts: {
  tempMemory: any;
  userMessage: string;
  pending: PendingDualTool;
  currentTurn?: number;
  pendingResolutionSignal?: PendingResolutionSignal;
}): { result: DualToolResponseResult; tempMemory: any } {
  let { tempMemory } = opts;
  void opts.userMessage;
  const { pending } = opts;

  // TTL check (preferred): drop after 2 turns.
  const currentTurn = Number(opts.currentTurn);
  const createdTurn = Number((pending as any).turn_created);
  const hasTurnTtl = Number.isFinite(currentTurn) &&
    Number.isFinite(createdTurn);
  if (
    hasTurnTtl && (currentTurn - createdTurn) >= PENDING_DUAL_TOOL_TTL_TURNS
  ) {
    tempMemory = clearPendingDualTool(tempMemory);
    return { result: { outcome: "dropped" }, tempMemory };
  }

  // TTL fallback for legacy entries (no turn_created)
  const createdAtMs = pending.created_at
    ? new Date(pending.created_at).getTime()
    : NaN;
  const elapsed = Date.now() - createdAtMs;
  if (
    !hasTurnTtl && Number.isFinite(createdAtMs) &&
    elapsed > PENDING_DUAL_TOOL_TTL_MS
  ) {
    tempMemory = clearPendingDualTool(tempMemory);
    return { result: { outcome: "dropped" }, tempMemory };
  }

  // Parse pending resolution from dispatcher (hybrid model, no regex fallback)
  const resolution = opts.pendingResolutionSignal;
  const hasUsableResolution = Boolean(
    resolution &&
      resolution.pending_type === "dual_tool" &&
      (resolution.confidence ?? 0) >= 0.55,
  );

  if (hasUsableResolution) {
    const code = resolution!.decision_code;
    if (code === "dual.confirm_both") {
      tempMemory = clearPendingDualTool(tempMemory);
      return {
        result: {
          outcome: "confirmed_both",
          tool1: pending.tool1,
          tool2: pending.tool2,
        },
        tempMemory,
      };
    }
    if (code === "dual.confirm_reversed") {
      tempMemory = clearPendingDualTool(tempMemory);
      return {
        result: {
          outcome: "confirmed_reversed",
          tool1: pending.tool2,
          tool2: pending.tool1,
        },
        tempMemory,
      };
    }
    if (code === "dual.only_first") {
      tempMemory = clearPendingDualTool(tempMemory);
      return {
        result: { outcome: "only_first", tool: pending.tool1 },
        tempMemory,
      };
    }
    if (code === "dual.only_second") {
      tempMemory = clearPendingDualTool(tempMemory);
      return {
        result: { outcome: "only_second", tool: pending.tool2 },
        tempMemory,
      };
    }
    if (code === "dual.decline_all") {
      tempMemory = clearPendingDualTool(tempMemory);
      return { result: { outcome: "dropped" }, tempMemory };
    }
  }

  // Unclear / unrelated / missing signal → re-ask once then drop
  if (pending.reask_count < MAX_REASK_COUNT) {
    const updated: PendingDualTool = {
      ...pending,
      reask_count: pending.reask_count + 1,
    };
    (tempMemory as any).__pending_dual_tool = updated;
    return { result: { outcome: "unclear", reask: true }, tempMemory };
  }

  // Max re-asks reached, drop silently
  tempMemory = clearPendingDualTool(tempMemory);
  return { result: { outcome: "dropped" }, tempMemory };
}

/**
 * Given a DualToolResponseResult, restore the right signal(s) into dispatcherSignals
 * so the normal routing pipeline picks them up.
 * Returns the secondary tool to defer (if any).
 */
export function applyDualToolDecision(opts: {
  result: DualToolResponseResult;
  signals: DispatcherSignals;
  tempMemory: any;
  userMessage: string;
}): {
  tempMemory: any;
  /** Signal type to activate for immediate processing (or null if none) */
  activateSignal: MotherSignalType | null;
  /** Signal to defer for later (or null if none) */
  deferSignalType: DualToolEntry | null;
} {
  let { tempMemory } = opts;
  const { result } = opts;

  switch (result.outcome) {
    case "confirmed_both":
      return {
        tempMemory,
        activateSignal: result.tool1.signal_type,
        deferSignalType: result.tool2,
      };

    case "confirmed_reversed":
      return {
        tempMemory,
        activateSignal: result.tool1.signal_type,
        deferSignalType: result.tool2,
      };

    case "only_first":
      return {
        tempMemory,
        activateSignal: result.tool.signal_type,
        deferSignalType: null,
      };

    case "only_second":
      return {
        tempMemory,
        activateSignal: result.tool.signal_type,
        deferSignalType: null,
      };

    case "dropped":
    case "unclear":
      return {
        tempMemory,
        activateSignal: null,
        deferSignalType: null,
      };

    default:
      return { tempMemory, activateSignal: null, deferSignalType: null };
  }
}

/**
 * Re-enable a specific tool signal in dispatcherSignals.
 * This is needed after dual-tool confirmation to re-inject the chosen signal
 * so that the normal routing pipeline can pick it up.
 */
export function reactivateToolSignal(
  signals: DispatcherSignals,
  toolEntry: DualToolEntry,
): void {
  switch (toolEntry.signal_type) {
    case "create_action":
      signals.create_action = {
        ...signals.create_action,
        intent_strength: "explicit",
        confidence: toolEntry.confidence,
        action_label_hint: toolEntry.target_hint,
      };
      break;
    case "update_action":
      signals.update_action = {
        ...signals.update_action,
        detected: true,
        confidence: toolEntry.confidence,
        target_hint: toolEntry.target_hint,
      };
      break;
    case "delete_action":
      signals.delete_action = {
        ...signals.delete_action,
        detected: true,
        confidence: toolEntry.confidence,
        target_hint: toolEntry.target_hint,
      };
      break;
    case "deactivate_action":
      signals.deactivate_action = {
        ...signals.deactivate_action,
        detected: true,
        confidence: toolEntry.confidence,
        target_hint: toolEntry.target_hint,
      };
      break;
    case "activate_action":
      signals.activate_action = {
        ...signals.activate_action,
        detected: true,
        confidence: toolEntry.confidence,
        target_hint: toolEntry.target_hint,
      };
      break;
    case "breakdown_action":
      signals.breakdown_action = {
        ...signals.breakdown_action,
        detected: true,
        confidence: toolEntry.confidence,
        target_hint: toolEntry.target_hint,
      };
      break;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADD-ON BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Lightweight info add-on for CLEAR dual-tool case (no confirmation needed).
 * Tells the agent to briefly inform the user about the execution order.
 */
function buildDualToolInfoAddon(intent: DualToolIntent): string {
  const t1Label = intent.tool1.target_hint
    ? `"${intent.tool1.target_hint}"`
    : "l'action concernée";
  const t2Label = intent.tool2.target_hint
    ? `"${intent.tool2.target_hint}"`
    : "nouvelle action";

  return `
═══════════════════════════════════════════════════════════════════════════════
🔀 DOUBLE ACTION DÉTECTÉE (cas clair)
═══════════════════════════════════════════════════════════════════════════════

L'utilisateur veut faire DEUX choses:
  ACTION 1 (${intent.tool1.verb.toUpperCase()}): ${t1Label}
  ACTION 2 (${intent.tool2.verb.toUpperCase()}): ${t2Label}

TA MISSION:
Au début de ta réponse, informe BRIÈVEMENT l'utilisateur:
"Ok, je vais d'abord ${intent.tool1.verb} ${t1Label}, puis on s'occupe de ${intent.tool2.verb} ${t2Label} juste après."

Puis lance IMMÉDIATEMENT l'action 1 (${intent.tool1.verb} ${t1Label}).
L'action 2 sera traitée automatiquement après.

IMPORTANT:
• NE mélange PAS les deux actions.
• ${t1Label} = celle à ${intent.tool1.verb}. ${t2Label} = celle à ${intent.tool2.verb}.
• Ne demande PAS de confirmation, le message était clair.
`;
}

/**
 * Confirmation add-on for AMBIGUOUS dual-tool case.
 * Asks the user to confirm the order (or clarify).
 */
export function buildDualToolConfirmationAddon(intent: DualToolIntent): string {
  const t1Label = intent.tool1.target_hint
    ? `"${intent.tool1.target_hint}"`
    : "l'action concernée";
  const t2Label = intent.tool2.target_hint
    ? `"${intent.tool2.target_hint}"`
    : "nouvelle action";

  // Specific handling for create_action (might not have a name yet)
  const t2Display =
    intent.tool2.signal_type === "create_action" && !intent.tool2.target_hint
      ? "une nouvelle action (on définira le nom ensemble)"
      : t2Label;
  const t1Display =
    intent.tool1.signal_type === "create_action" && !intent.tool1.target_hint
      ? "une nouvelle action (on définira le nom ensemble)"
      : t1Label;

  return `
═══════════════════════════════════════════════════════════════════════════════
🔀 DOUBLE ACTION DÉTECTÉE (confirmation nécessaire)
═══════════════════════════════════════════════════════════════════════════════

L'utilisateur semble vouloir faire DEUX choses:
  ACTION 1 (${intent.tool1.verb.toUpperCase()}): ${t1Display}
  ACTION 2 (${intent.tool2.verb.toUpperCase()}): ${t2Display}

TA MISSION:
Demande confirmation à l'utilisateur de manière NATURELLE:
"Si je comprends bien, tu voudrais ${intent.tool1.verb} ${t1Display} et ensuite ${intent.tool2.verb} ${t2Display}. C'est bien ça ? On fait dans cet ordre ?"

ATTENDS sa réponse avant de faire quoi que ce soit.

RÉPONSES POSSIBLES:
• "oui" / "c'est ça" → On lance l'action 1 puis l'action 2
• "inverse" / "l'autre ordre" → On fait d'abord l'action 2 puis l'action 1
• "juste le premier" → On ne fait que l'action 1
• "juste le deuxième" → On ne fait que l'action 2
• Autre → Reprécise et repose la question

IMPORTANT:
• NE mélange JAMAIS les deux actions dans ta compréhension.
• ACTION 1 (${intent.tool1.verb.toUpperCase()}) et ACTION 2 (${intent.tool2.verb.toUpperCase()}) sont DISTINCTS.
• Ne lance AUCUN outil maintenant. Attends la confirmation.
`;
}

/**
 * Re-ask add-on when the user's response to dual-tool confirmation was unclear.
 */
export function buildDualToolReaskAddon(pending: PendingDualTool): string {
  const t1Label = pending.tool1.target_hint
    ? `"${pending.tool1.target_hint}"`
    : "l'action concernée";
  const t2Label = pending.tool2.target_hint
    ? `"${pending.tool2.target_hint}"`
    : "l'action";

  return `
═══════════════════════════════════════════════════════════════════════════════
🔀 DOUBLE ACTION - CLARIFICATION NÉCESSAIRE
═══════════════════════════════════════════════════════════════════════════════

On avait détecté deux intentions:
  1. ${pending.tool1.verb.toUpperCase()} ${t1Label}
  2. ${pending.tool2.verb.toUpperCase()} ${t2Label}

La réponse n'était pas claire. Repose la question SIMPLEMENT:
"Juste pour être sûre : tu veux que je fasse les deux (d'abord ${pending.tool1.verb} puis ${pending.tool2.verb}), ou juste l'un des deux ?"
`;
}

/**
 * Notification add-on for dual-tool when a machine IS active.
 * Does NOT ask for confirmation. Just notifies and defers.
 */
export function buildDualToolNotificationAddon(
  intent: DualToolIntent,
  context: {
    currentMachineType: string;
    currentMachineTarget?: string;
    isBilan: boolean;
  },
): string {
  const t1Label = intent.tool1.target_hint
    ? `"${intent.tool1.target_hint}"`
    : "l'action concernée";
  const t2Label = intent.tool2.target_hint
    ? `"${intent.tool2.target_hint}"`
    : "l'action";

  const currentLabel = context.currentMachineTarget || "le sujet en cours";
  const whenLabel = context.isBilan
    ? "quand le bilan sera terminé"
    : `quand on aura fini de discuter de ${currentLabel}`;

  return `
═══════════════════════════════════════════════════════════════════════════════
🔀 DOUBLE ACTION NOTÉE (machine active)
═══════════════════════════════════════════════════════════════════════════════

L'utilisateur veut faire DEUX choses:
  1. ${intent.tool1.verb.toUpperCase()} ${t1Label}
  2. ${intent.tool2.verb.toUpperCase()} ${t2Label}

MAIS on est actuellement sur ${context.currentMachineType}${
    context.currentMachineTarget ? ` (${context.currentMachineTarget})` : ""
  }.

TA MISSION:
Notifie BRIÈVEMENT l'utilisateur:
"J'ai bien noté que tu veux ${intent.tool1.verb} ${t1Label} et ${intent.tool2.verb} ${t2Label}. On s'en occupe ${whenLabel}, promis."

Puis CONTINUE NORMALEMENT avec ${currentLabel}.

IMPORTANT:
• Ne demande PAS de confirmation pour les deux actions maintenant.
• Ne commence AUCUNE des deux actions.
• Continue le flux en cours.
`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL CLEARING HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Clear BOTH tool signals from dispatcherSignals.
 * Used in the ambiguous case (ask_confirmation) and active machine case.
 */
export function clearBothToolSignals(
  signals: DispatcherSignals,
  intent: DualToolIntent,
): void {
  clearToolSignal(signals, intent.tool1.signal_type);
  clearToolSignal(signals, intent.tool2.signal_type);
}

/**
 * Clear a single tool signal from dispatcherSignals.
 * Used after dual-tool decision to prevent the deferred tool from triggering.
 */
export function clearToolSignal(
  signals: DispatcherSignals,
  signalType: MotherSignalType,
): void {
  switch (signalType) {
    case "create_action":
      signals.create_action = {
        ...signals.create_action,
        intent_strength: "none",
        sophia_suggested: false,
        user_response: "none",
        modification_info: "none",
        action_type_hint: "unknown",
        action_label_hint: undefined,
      };
      break;
    case "update_action":
      signals.update_action = {
        ...signals.update_action,
        detected: false,
        target_hint: undefined,
        change_type: "unknown",
        new_value_hint: undefined,
        user_response: "none",
      };
      break;
    case "delete_action":
      signals.delete_action = {
        ...signals.delete_action,
        detected: false,
        target_hint: undefined,
        reason_hint: undefined,
      };
      break;
    case "deactivate_action":
      signals.deactivate_action = {
        ...signals.deactivate_action,
        detected: false,
        target_hint: undefined,
      };
      break;
    case "activate_action":
      signals.activate_action = {
        ...signals.activate_action,
        detected: false,
        target_hint: undefined,
        exercise_type_hint: undefined,
      };
      break;
    case "breakdown_action":
      signals.breakdown_action = {
        ...signals.breakdown_action,
        detected: false,
        target_hint: undefined,
        blocker_hint: undefined,
        sophia_suggested: false,
        user_response: "none",
      };
      break;
  }
}
