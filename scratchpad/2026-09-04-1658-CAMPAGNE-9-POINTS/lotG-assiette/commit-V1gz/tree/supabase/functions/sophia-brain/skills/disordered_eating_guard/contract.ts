/**
 * `disordered_eating_guard` — contract.
 *
 * A CLINICAL flow, structurally distinct from `safety_crisis`:
 *
 *   safety_crisis            disordered_eating_guard
 *   ------------------------ --------------------------------------------
 *   suicidal / self-harm     restriction, compensation, disordered eating
 *   emergency + 988/3114     ED helpline (NEDA/Beat/ABIE) + human coach
 *   triage questions         no triage, no numbers, no plan
 *   resolves when safe       never "resolves": the SUSPENSION outlives the
 *                            conversation and only a coach review lifts it
 *
 * The two never merge. Routing them into one skill would either recite a
 * suicide hotline at someone who is restricting, or drop the ED referral for
 * someone in crisis. When both signals are present, `safety_crisis` outranks
 * this flow (routers.ts branch order) — nothing here is more urgent than an
 * immediate danger to life.
 *
 * INVARIANT THAT DEFINES THIS SKILL: it never discusses numbers. Not calories,
 * not weight, not adherence, not a score, not a percentage, not "you only
 * logged 2 of 7 days". Quantifying is the pressure. The visible agent is
 * validated against this deterministically after generation; the model is not
 * trusted to remember it.
 */

import type { RestrictionTrigger } from "../../../_shared/keel/restriction_guard.ts";
import type { EatingDisorderResourceResolution } from "./resources.ts";

export const DISORDERED_EATING_GUARD_SKILL_ID = "disordered_eating_guard" as const;

// ---------------------------------------------------------------------------
// Phases and turn classification (deterministic — no model in this path)
// ---------------------------------------------------------------------------

export type DisorderedEatingPhase =
  /** First turn of the flow: the guard just raised. */
  | "entry"
  /** ED resources have been offered or given. */
  | "supported"
  /** An acute medical report was made; emergency + coach are on the table. */
  | "medical_escalated"
  /** The student declined support; we hold, we do not insist. */
  | "holding"
  /** The CONVERSATION is closed. The suspension is not. */
  | "closed";

/**
 * How the student's turn reads. Produced by `classifyStudentTurn` — a folded
 * lexicon, not a model, because the entry into this flow must not be
 * negotiable and the exit must not depend on a temperature.
 */
export type DisorderedEatingStudentSignal =
  | "asks_for_numbers"
  | "accepts_support"
  | "declines_support"
  | "asks_to_move_on"
  | "reports_acute_medical"
  | "unclear";

export type DisorderedEatingVisibleTaskKind =
  /** Open the flow: name the suspension plainly, no numbers, no diagnosis. */
  | "open_without_numbers"
  /** The student asked for a figure. Refuse the figure, keep the person. */
  | "numbers_refusal"
  /** Give the country resources + the coach handoff. */
  | "clinical_resources"
  /** Acute physical symptoms: emergency services, then the coach. */
  | "medical_escalation"
  /** They declined. One line, no second ask, door open. */
  | "respect_decline_hold"
  /** Present, no agenda. */
  | "holding"
  /** Close the conversation while stating that the numbers stay off. */
  | "close";

// ---------------------------------------------------------------------------
// Response contract — what the visible agent may and may not do
// ---------------------------------------------------------------------------

export type DisorderedEatingResponseContract = {
  /** THE invariant. Never true, for any phase, for any student request. */
  allow_numbers: false;
  allow_adherence_reference: false;
  allow_plan_work: false;
  allow_product_reference: false;
  allow_memory_persistence_default: false;
  /** Never the suicide hotline by default — that is `safety_crisis`. */
  use_suicide_crisis_line: false;
  must_offer_human_coach: true;
  must_include_eating_disorder_resources: boolean;
  /** At most one, and zero when the student just declined (no insisting). */
  max_questions: 0 | 1;
};

// ---------------------------------------------------------------------------
// Working state
// ---------------------------------------------------------------------------

export type DisorderedEatingWorkingState = {
  phase?: DisorderedEatingPhase;
  turn_count?: number;
  /** Guard triggers that opened the flow (codes only — evidence stays server-side). */
  entry_trigger_codes?: string[];
  /** True once the immediate `contract_change_requests` row has been raised. */
  coach_escalated?: boolean;
  /** True once the ED resources have actually been delivered. */
  resources_delivered?: boolean;
  /** Consecutive declines — two is a clear answer, and we stop asking. */
  consecutive_declines?: number;
  last_student_signal?: DisorderedEatingStudentSignal | null;
  last_visible_task?: DisorderedEatingVisibleTaskKind | null;
};

/**
 * A flow that cannot be left is a trap — the `safety_crisis_flow_no_exit_on_denial`
 * class this repo has already paid for. Six turns is the hard ceiling; the
 * student asking to move on ends it in one.
 */
export const DISORDERED_EATING_MAX_TURNS = 6;

// ---------------------------------------------------------------------------
// Visible task
// ---------------------------------------------------------------------------

export type DisorderedEatingConversationContext = {
  state_summary: string;
  /** Verbatim student words the flow is responding to. */
  user_words: string[];
  phase: DisorderedEatingPhase;
  known_values: {
    coach_escalated: boolean;
    resources_delivered: boolean;
    student_declined_support: boolean;
    /** Codes only. The numeric evidence never crosses into the reply path. */
    entry_trigger_codes: string[];
  };
  clinical_resources: {
    resolution: EatingDisorderResourceResolution;
    lines: string[];
    /**
     * Non-null when the student's own country could not be served and the
     * international directory was substituted. Loud, never silent.
     */
    fallback_reason_code: string | null;
  };
  next_focus: string;
  tone_constraints: string[];
  do_not_say: string[];
  max_questions: 0 | 1;
};

export type DisorderedEatingVisibleTask = {
  kind: DisorderedEatingVisibleTaskKind;
  conversation_context: DisorderedEatingConversationContext;
};

// ---------------------------------------------------------------------------
// Reduction
// ---------------------------------------------------------------------------

export type DisorderedEatingReduction = {
  phase: DisorderedEatingPhase;
  visibleTask: DisorderedEatingVisibleTask;
  responseContract: DisorderedEatingResponseContract;
  statePatch: DisorderedEatingWorkingState;
  /** True on the turn the immediate coach escalation must be written. */
  escalateToCoach: boolean;
  /** "exit" leaves the CONVERSATION; the restriction flag is untouched. */
  status: "continue" | "exit";
  reasonCode: string;
};

export const DISORDERED_EATING_GUARD_INVARIANTS = [
  "never_states_a_number",
  "never_references_adherence_or_score",
  "never_offers_plan_or_product_work",
  "suicide_line_only_via_safety_crisis",
  "human_coach_always_offered",
  "decline_is_respected_without_a_second_ask",
  "flow_exit_never_lifts_the_suspension",
  "visible_message_validated_deterministically",
] as const;

/**
 * Metric vocabulary the reply must never contain. Kept narrow and unambiguous
 * on purpose: a broad list would reject legitimate sentences and push the
 * fallback into nominal use, which is how a validator ends up disabled.
 */
// FORBIDDEN_METRIC_TERMS a DÉMÉNAGÉ dans `_shared/keel/nutrition_lexicon.ts`,
// où il devient l'UNION EN+FR. La liste était anglaise seulement: « kilos »,
// « poids », « assiduité », « IMC » passaient tous le validateur — sur la lane
// clinique, celle où un chiffre coûte le plus cher. Réexporté ici pour ne pas
// casser les appelants qui le lisent depuis le contrat du skill.
export { FORBIDDEN_METRIC_TERMS } from "../../../_shared/keel/nutrition_lexicon.ts";

export function disorderedEatingResponseContract(args: {
  kind: DisorderedEatingVisibleTaskKind;
}): DisorderedEatingResponseContract {
  return {
    allow_numbers: false,
    allow_adherence_reference: false,
    allow_plan_work: false,
    allow_product_reference: false,
    allow_memory_persistence_default: false,
    use_suicide_crisis_line: false,
    must_offer_human_coach: true,
    must_include_eating_disorder_resources: args.kind === "clinical_resources" ||
      args.kind === "medical_escalation",
    // Zero questions where asking would be pressure: a decline, a hold, or a
    // close. One elsewhere, never two.
    max_questions: args.kind === "respect_decline_hold" ||
        args.kind === "close" ||
        args.kind === "holding"
      ? 0
      : 1,
  };
}

export function normalizeDisorderedEatingPhase(
  value: unknown,
): DisorderedEatingPhase {
  return value === "entry" || value === "supported" ||
      value === "medical_escalated" || value === "holding" ||
      value === "closed"
    ? value
    : "entry";
}

/** Trigger codes only — the numeric evidence belongs to the coach, not the reply. */
export function triggerCodesOf(triggers: RestrictionTrigger[]): string[] {
  return triggers.map((t) => t.code);
}
