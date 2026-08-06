/**
 * `plan_question` — skill entry point (KEEL W4.4).
 *
 * Orchestration only, and deliberately thin: every decision was already taken
 * by something deterministic.
 *
 *   what may be swapped  swap_resolver.ts   (the coach's autonomy + policy)
 *   what may be said     renderer.ts        (+ the W3.3 medical gate)
 *   what the coach sees  escalation.ts      (a draft, never applied)
 *
 * NO I/O. The skill returns the row to write; the runtime writes it and
 * re-reads it (execution truth), then the ledger fills. Nothing here announces
 * a commit — `effects` is empty on purpose, and the reply never claims the
 * plan changed, because this module cannot change it.
 *
 * TURN STATUS. `complete`, always: a swap question is answered in one turn.
 * This lane is not sticky — there is no `plan_question` continuation branch in
 * `routers.ts`, on purpose. A student who keeps asking gets a fresh, correct
 * two-second answer each time rather than a flow that has to be exited.
 *
 * RUNTIME WIRING — NOT DONE IN THIS LOT (see README). `router/run.ts` belongs
 * to the W4.3 lot; like `disordered_eating_guard` before it, this skill refuses
 * loudly if its runtime channel is missing rather than composing an answer from
 * a plan it did not read.
 */

import { baseOutput, type RunSkillInput } from "../_shared/skill_helpers.ts";
import { emptyConversationEffects } from "../_shared/conversation_skill_contract.ts";
import type { ConversationSkillOutput } from "../../contracts/skill_output.v1.ts";
import type { StudentSafetyConstraint } from "../../../_shared/keel/safety_constraints.ts";
import {
  PLAN_QUESTION_SKILL_ID,
  type PlanQuestionChangeRequest,
  type PlanQuestionCommitment,
  type PlanQuestionKind,
  type PlanQuestionOutcomeKind,
} from "./contract.ts";
import { resolveTier0Swap } from "./swap_resolver.ts";
import { buildChangeRequest } from "./escalation.ts";
import { renderPlanQuestion } from "./renderer.ts";

/**
 * What the runtime must hand over. Read from the SKILL CONTEXT, never from the
 * turn frame: the turn frame is authored by the dispatcher LLM, and the
 * commitment, the swap policy and the safety constraints must not travel
 * through a model on their way to a permission decision.
 */
export type PlanQuestionSkillRuntime = {
  /** The line the question is about, resolved by the runtime from the DB. */
  commitment: PlanQuestionCommitment | null;
  /** `food_groups.slug -> class`, read from the DB. */
  food_group_classes: Readonly<Record<string, string>>;
  /** Loaded EVERY turn, outside the memory path (W3.3). */
  safety_constraints: readonly StudentSafetyConstraint[];
  /** BCP-47 of the student's words (R2 — the row stores prose). */
  content_locale: string;
};

export type PlanQuestionResolution = {
  outcome: PlanQuestionOutcomeKind;
  reply: string;
  change_request: PlanQuestionChangeRequest | null;
  diagnosis: Record<string, unknown>;
};

/**
 * The whole lane as a pure function. Exported so tests (and any non-chat
 * caller: the photo path in W5 asks the same question about a plate) exercise
 * the decision without a skill context.
 */
export function resolvePlanQuestion(input: {
  user_id: string;
  question_kind: PlanQuestionKind;
  requested_food_group: string | null;
  student_words: string;
  runtime: PlanQuestionSkillRuntime;
  /**
   * R3 — la langue de la RÉPONSE VISIBLE de ce tour. Distincte du
   * `runtime.content_locale`, qui est la langue des MOTS DE L'ÉLÈVE stockés
   * sur la ligne. Les confondre, c'est la fusion d'axes que R3 interdit.
   */
  response_locale: string;
}): PlanQuestionResolution {
  const verdict = resolveTier0Swap({
    commitment: input.runtime.commitment,
    requested_food_group: input.requested_food_group,
    food_group_classes: input.runtime.food_group_classes,
    safety_constraints: input.runtime.safety_constraints,
  });

  const changeRequest = verdict.decision === "allowed" ? null : buildChangeRequest({
    user_id: input.user_id,
    question_kind: input.question_kind,
    verdict,
    commitment: input.runtime.commitment,
    student_words: input.student_words,
    content_locale: input.runtime.content_locale,
  });

  const render = renderPlanQuestion({
    verdict,
    change_request: changeRequest,
    safety_constraints: input.runtime.safety_constraints,
    locale: input.response_locale,
  });

  const outcome: PlanQuestionOutcomeKind = verdict.decision === "allowed"
    ? "tier0_allowed"
    : verdict.decision === "denied"
    ? "hard_deny"
    : "escalated";

  return {
    outcome,
    reply: render.reply,
    change_request: changeRequest,
    diagnosis: {
      outcome,
      tier: 0,
      decision: verdict.decision,
      reason_code: verdict.reason_code,
      question_kind: input.question_kind,
      commitment_id: input.runtime.commitment?.id ?? null,
      autonomy: input.runtime.commitment?.autonomy ?? null,
      // The two properties that make the lane worth having, stated so an
      // operator can read them off a log line rather than infer them.
      resolved_without_model: true,
      escalated_to_coach: changeRequest !== null,
      urgency: changeRequest?.urgency ?? null,
      bypasses_digest: changeRequest?.bypasses_digest ?? false,
      // Nothing in this lane mutates the prescription, ever.
      prescription_mutated: false,
      suggested_option_is_draft: true,
      render_reason_code: render.render_reason_code,
      medical_validator_tripped: render.medical_validator_tripped,
    },
  };
}

function runtimeOf(input: RunSkillInput): PlanQuestionSkillRuntime {
  // Le champ est déclaré `unknown` sur `SkillContext` (canal de runtime): la
  // vérification ci-dessous EST la validation, pas une formalité. Elle lisait
  // auparavant `(input.context as any)`, ce qui désarmait le typecheck sur
  // l'objet entier au lieu du seul champ.
  const runtime = input.context.plan_question_runtime as
    | PlanQuestionSkillRuntime
    | undefined;
  if (!runtime || typeof runtime !== "object") {
    // R7: refuse to guess. A permission answered from an unread plan is worse
    // than no answer — the student would act on it.
    throw new Error(
      "[plan_question] missing plan_question_runtime on the skill context — " +
        "the commitment, the swap policy and the safety constraints must be " +
        "read from the database by the runtime, never inferred from the turn " +
        "frame",
    );
  }
  return runtime;
}

export async function runPlanQuestionSkill(
  input: RunSkillInput,
): Promise<ConversationSkillOutput> {
  const runtime = runtimeOf(input);
  const signal = input.context.turn_frame.skill_signals.plan_question;
  const context = signal?.context;
  const questionKind: PlanQuestionKind = context?.kind ?? "other";

  const resolution = resolvePlanQuestion({
    user_id: input.context.user_id,
    question_kind: questionKind,
    requested_food_group: context?.requested_food_group ?? null,
    student_words: input.user_message,
    runtime,
    response_locale: input.context.response_locale,
  });

  console.info("plan_question.resolution", resolution.diagnosis);

  return await Promise.resolve(baseOutput(PLAN_QUESTION_SKILL_ID, {
    status: "complete",
    response_intent: resolution.outcome === "tier0_allowed"
      ? "answer_swap_within_policy"
      : "escalate_to_coach",
    reply: resolution.reply,
    diagnosis: {
      ...resolution.diagnosis,
      // Handed to the runtime for the write-through. Announced by nothing: the
      // reply above never says "your coach has been notified" as a completed
      // fact beyond the request being raised in this turn's ledger.
      contract_change_request: resolution.change_request,
    },
    recommendation_need: {
      needed: false,
      type: "none",
      urgency: "none",
      constraints: [
        "never_author_or_edit_a_prescription",
        "never_apply_suggested_option",
        "no_adherence_numbers_in_this_lane",
      ],
    },
    // Empty on purpose: this skill performs no I/O, so it commits nothing and
    // claims nothing. The runtime writes the escalation and re-reads it.
    effects: emptyConversationEffects(),
    memory_write_candidates: [],
    state_patch: {},
  }));
}
