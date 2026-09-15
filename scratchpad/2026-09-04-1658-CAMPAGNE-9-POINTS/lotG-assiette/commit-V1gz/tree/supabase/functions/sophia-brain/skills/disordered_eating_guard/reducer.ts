/**
 * `disordered_eating_guard` — reducer.
 *
 * Pure and deterministic. No model decides whether this flow opens, what it
 * does next, or when it ends: the entry comes from the deterministic
 * `restriction_guard` floor, and every transition below comes from a folded
 * lexicon over the student's own words. A stochastic classifier in this path
 * would mean the flow is enterable and leavable at a temperature — and this
 * repo already has the scar (`safety_crisis_flow_no_exit_on_denial`: a false
 * positive trapped a student for three turns because the exit was a model's
 * opinion).
 */

import type { RestrictionGuardResult } from "../../../_shared/keel/restriction_guard.ts";
import {
  DISORDERED_EATING_MAX_TURNS,
  type DisorderedEatingPhase,
  type DisorderedEatingReduction,
  disorderedEatingResponseContract,
  type DisorderedEatingStudentSignal,
  type DisorderedEatingVisibleTask,
  type DisorderedEatingVisibleTaskKind,
  type DisorderedEatingWorkingState,
  normalizeDisorderedEatingPhase,
  triggerCodesOf,
} from "./contract.ts";
import {
  allowedNumericStrings,
  renderResourceLines,
  resolveEatingDisorderResources,
} from "./resources.ts";

// ---------------------------------------------------------------------------
// Deterministic turn classification
// ---------------------------------------------------------------------------

/** Same folding as the restriction guard: accents and punctuation cannot hide intent. */
function fold(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Acute physical symptoms of restriction/purging that need care TODAY. These
 * outrank every other reading of the turn, including a request to move on.
 */
const ACUTE_MEDICAL = [
  /\b(fainted|fainting|passed out|blacked out|black out)\b/,
  /\b(chest pain|heart racing|palpitations|irregular heartbeat)\b/,
  /\b(vomiting blood|blood in|coughing blood)\b/,
  /\b(can t stand|cannot stand|too weak to|dizzy all)\b/,
  /\b(seizure|convulsion)\b/,
  /\b(evanoui|malaise|palpitations|sang dans)\b/,
];

const ASKS_FOR_NUMBERS = [
  /\b(how many|how much)\b.*\b(calories|kcal|grams|kilos|kg|pounds|lbs)\b/,
  /\b(my|the)\s+(score|percentage|percent|adherence|compliance|number|numbers|stats|streak)\b/,
  /\bwhat s my\b.*\b(score|weight|adherence|percentage|number)\b/,
  /\b(am i|was i)\s+(on track|at|above|below)\b/,
  /\b(mon|ma)\s+(score|pourcentage|adherence|poids|chiffre|chiffres)\b/,
  /\bcombien de\b.*\b(calories|kilos|grammes)\b/,
];

const ACCEPTS_SUPPORT = [
  /\b(yes|yeah|yep|ok|okay|sure|please|i d like|i would like|go ahead|send it|that would help)\b/,
  /\b(oui|d accord|ok|volontiers|je veux bien)\b/,
  /\b(talk to|speak to|call|contact)\b.*\b(coach|someone|them|helpline)\b/,
];

const DECLINES_SUPPORT = [
  /\b(no|nope|not really|i m fine|i am fine|it s fine|i m ok|i am ok|nothing s wrong|nothing is wrong|don t need|do not need|leave it|not interested)\b/,
  /\b(non|ca va|tout va bien|pas besoin|laisse tomber)\b/,
];

const ASKS_TO_MOVE_ON = [
  /\b(can we|let s|lets)\s+(move on|change the subject|talk about something else|drop it|stop)\b/,
  /\b(drop it|stop talking about|change the subject|move on|another topic|something else)\b/,
  /\b(on peut|passons|parlons)\s+(a autre chose|d autre chose)\b|\bautre chose\b/,
];

function matchesAny(folded: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(folded));
}

/**
 * Classifies one student turn. Order is the arbitration:
 * acute medical > asks to move on > asks for numbers > declines > accepts.
 *
 * "Asks to move on" sits ABOVE "asks for numbers" and above the accept/decline
 * pair on purpose: a request to leave must never be re-read as engagement,
 * which is precisely how a flow becomes sticky.
 */
export function classifyStudentTurn(
  message: string,
): DisorderedEatingStudentSignal {
  const folded = fold(message);
  if (folded === "") return "unclear";
  if (matchesAny(folded, ACUTE_MEDICAL)) return "reports_acute_medical";
  if (matchesAny(folded, ASKS_TO_MOVE_ON)) return "asks_to_move_on";
  if (matchesAny(folded, ASKS_FOR_NUMBERS)) return "asks_for_numbers";
  if (matchesAny(folded, DECLINES_SUPPORT)) return "declines_support";
  if (matchesAny(folded, ACCEPTS_SUPPORT)) return "accepts_support";
  return "unclear";
}

// ---------------------------------------------------------------------------
// Reduction
// ---------------------------------------------------------------------------

export type DisorderedEatingReducerInput = {
  previousState: DisorderedEatingWorkingState;
  /** The floor's verdict for this student. Its flag is the entry condition. */
  guardResult: RestrictionGuardResult;
  userMessage: string;
  /** ISO-3166 alpha-2 of the student's profile, when known. */
  country: string | null;
};

const NEXT_FOCUS: Record<DisorderedEatingVisibleTaskKind, string> = {
  open_without_numbers:
    "Say plainly that the scores and reminders are paused, without explaining the calculation, and ask one open question about how they are doing.",
  numbers_refusal:
    "Decline the figure once, without negotiating it and without naming it, then stay with the person.",
  clinical_resources:
    "Hand over the eating-disorder resources and the human coach, in that order, and stop.",
  medical_escalation:
    "Point at same-day medical care first, then the coach. Nothing else in the message.",
  respect_decline_hold:
    "Accept the no in one sentence. Do not ask again. Leave the door open.",
  holding: "Stay present. No agenda, no follow-up task.",
  close:
    "Close warmly and state once that the scores stay paused until their coach checks in.",
};

const TONE_CONSTRAINTS = [
  "non_judgemental",
  "factual",
  "short",
  "no_reassurance_about_the_body",
  "no_praise_for_restraint",
  "no_insisting_after_a_no",
];

const DO_NOT_SAY = [
  "any calorie, gram, kilo or pound figure",
  "any adherence, coverage, percentage or score",
  "any comment on the student's body or appearance",
  "any plan, reminder, streak or product suggestion",
  "any suicide hotline (that is the safety_crisis flow, not this one)",
  "any diagnosis or clinical label",
];

function visibleTask(args: {
  kind: DisorderedEatingVisibleTaskKind;
  phase: DisorderedEatingPhase;
  state: DisorderedEatingWorkingState;
  guardResult: RestrictionGuardResult;
  userMessage: string;
  country: string | null;
  coachEscalated: boolean;
  resourcesDelivered: boolean;
  declined: boolean;
}): DisorderedEatingVisibleTask {
  const resolution = resolveEatingDisorderResources(args.country);
  const contract = disorderedEatingResponseContract({ kind: args.kind });
  return {
    kind: args.kind,
    conversation_context: {
      state_summary:
        `Restriction signal raised by the deterministic guard; adherence pressure is suspended. Phase: ${args.phase}.`,
      user_words: args.userMessage.trim() ? [args.userMessage.trim()] : [],
      phase: args.phase,
      known_values: {
        coach_escalated: args.coachEscalated,
        resources_delivered: args.resourcesDelivered,
        student_declined_support: args.declined,
        entry_trigger_codes: args.state.entry_trigger_codes ??
          triggerCodesOf(args.guardResult.triggers),
      },
      clinical_resources: {
        resolution,
        lines: renderResourceLines(resolution),
        fallback_reason_code: resolution.fallbackUsed
          ? resolution.resolutionSource
          : null,
      },
      next_focus: NEXT_FOCUS[args.kind],
      tone_constraints: TONE_CONSTRAINTS,
      do_not_say: DO_NOT_SAY,
      max_questions: contract.max_questions,
    },
  };
}

/**
 * Entry is NOT negotiable: this reducer refuses to run on a clear guard result.
 * The flow exists to serve a raised floor, and a flow that can be opened
 * without one is a flow a model can open.
 */
export function reduceDisorderedEatingGuard(
  input: DisorderedEatingReducerInput,
): DisorderedEatingReduction {
  const { guardResult } = input;
  if (!guardResult || guardResult.restriction_flag !== true) {
    throw new Error(
      "[disordered_eating_guard] reducer called without a raised restriction " +
        "flag — this flow is only ever opened by the deterministic floor",
    );
  }

  const state = input.previousState ?? {};
  const previousPhase = state.phase === undefined
    ? null
    : normalizeDisorderedEatingPhase(state.phase);
  const turnCount = (typeof state.turn_count === "number" ? state.turn_count : 0) +
    1;
  const isFirstTurn = previousPhase === null;
  const currentPhase: DisorderedEatingPhase = previousPhase ?? "entry";
  const signal = isFirstTurn ? "unclear" : classifyStudentTurn(input.userMessage);
  const declines = signal === "declines_support"
    ? (state.consecutive_declines ?? 0) + 1
    : 0;

  let kind: DisorderedEatingVisibleTaskKind;
  let phase: DisorderedEatingPhase;
  let status: "continue" | "exit" = "continue";
  let reasonCode: string;

  if (isFirstTurn) {
    kind = "open_without_numbers";
    phase = "entry";
    reasonCode = "disordered_eating_guard.entry";
  } else if (signal === "reports_acute_medical") {
    // Outranks a request to move on: physical danger is not a topic choice.
    kind = "medical_escalation";
    phase = "medical_escalated";
    reasonCode = "disordered_eating_guard.acute_medical";
  } else if (signal === "asks_to_move_on") {
    kind = "close";
    phase = "closed";
    status = "exit";
    reasonCode = "disordered_eating_guard.student_requested_exit";
  } else if (signal === "asks_for_numbers") {
    kind = "numbers_refusal";
    phase = currentPhase;
    reasonCode = "disordered_eating_guard.numbers_refused";
  } else if (signal === "accepts_support") {
    kind = "clinical_resources";
    phase = "supported";
    reasonCode = "disordered_eating_guard.resources_offered";
  } else if (signal === "declines_support") {
    // A second no is a clear answer. Asking again is the pressure this flow
    // exists to remove, so the flow closes itself instead of insisting.
    if (declines >= 2) {
      kind = "close";
      phase = "closed";
      status = "exit";
      reasonCode = "disordered_eating_guard.declined_twice";
    } else {
      kind = "respect_decline_hold";
      phase = "holding";
      reasonCode = "disordered_eating_guard.decline_respected";
    }
  } else {
    kind = "holding";
    // Never downgrade a medical escalation into a neutral hold.
    phase = currentPhase === "medical_escalated" ? "medical_escalated" : "holding";
    reasonCode = "disordered_eating_guard.holding";
  }

  // Hard ceiling. A flow that cannot time out is a trap.
  if (status === "continue" && turnCount >= DISORDERED_EATING_MAX_TURNS) {
    kind = "close";
    phase = "closed";
    status = "exit";
    reasonCode = "disordered_eating_guard.max_turns_reached";
  }

  const coachAlreadyEscalated = state.coach_escalated === true;
  const escalateToCoach = !coachAlreadyEscalated ||
    kind === "medical_escalation";
  const resourcesDelivered = state.resources_delivered === true ||
    kind === "clinical_resources" || kind === "medical_escalation";

  const task = visibleTask({
    kind,
    phase,
    state,
    guardResult,
    userMessage: input.userMessage,
    country: input.country,
    coachEscalated: coachAlreadyEscalated || escalateToCoach,
    resourcesDelivered,
    declined: declines > 0,
  });

  return {
    phase,
    visibleTask: task,
    responseContract: disorderedEatingResponseContract({ kind }),
    statePatch: {
      phase,
      turn_count: turnCount,
      entry_trigger_codes: state.entry_trigger_codes ??
        triggerCodesOf(guardResult.triggers),
      coach_escalated: coachAlreadyEscalated || escalateToCoach,
      resources_delivered: resourcesDelivered,
      consecutive_declines: declines,
      last_student_signal: signal,
      last_visible_task: kind,
    },
    escalateToCoach,
    status,
    reasonCode,
  };
}

/** Exported for the visible-agent validator (same resolution, same numbers). */
export function allowedNumbersForTask(
  task: DisorderedEatingVisibleTask,
): string[] {
  return allowedNumericStrings(task.conversation_context.clinical_resources.resolution);
}
