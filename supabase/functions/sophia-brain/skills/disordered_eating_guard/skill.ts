/**
 * `disordered_eating_guard` — skill entry point.
 *
 * Orchestration only. Every decision was already taken by something
 * deterministic upstream:
 *   - whether the flow opens: `_shared/keel/restriction_guard.ts` (the floor);
 *   - what the turn does: `reducer.ts` (a folded lexicon, no model);
 *   - what may be said: `visible_agent.ts` (post-generation validator).
 *
 * This file wires those together, emits the immediate coach escalation, and
 * guarantees the turn is never silent.
 */

import { baseOutput, type RunSkillInput } from "../_shared/skill_helpers.ts";
import { emptyConversationEffects } from "../_shared/conversation_skill_contract.ts";
import type { ConversationSkillOutput } from "../../contracts/skill_output.v1.ts";
import {
  type RestrictionEffect,
  type RestrictionGuardResult,
  restrictionEffect,
} from "../../../_shared/keel/restriction_guard.ts";
import {
  DISORDERED_EATING_GUARD_SKILL_ID,
  type DisorderedEatingWorkingState,
} from "./contract.ts";
import { reduceDisorderedEatingGuard } from "./reducer.ts";
import {
  disorderedEatingDeterministicMessage,
  runDisorderedEatingVisibleAgent,
} from "./visible_agent.ts";

/**
 * Runtime inputs this skill needs beyond the standard `SkillContext`.
 *
 * `restriction_guard_result` is NOT read from the turn frame on purpose: the
 * turn frame is authored by the dispatcher LLM, and the entry condition of
 * this flow must never travel through a model. W4 has the runtime compute it
 * from the DB and hand it over on this channel.
 */
export type DisorderedEatingSkillRuntime = {
  restriction_guard_result: RestrictionGuardResult;
  /** ISO-3166 alpha-2 from the student's profile, when known. */
  country: string | null;
  plan_version_id: string | null;
};

function workingState(input: RunSkillInput): DisorderedEatingWorkingState {
  const raw = input.context.active_skill_working_state?.working_state;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as DisorderedEatingWorkingState
    : {};
}

function runtimeOf(input: RunSkillInput): DisorderedEatingSkillRuntime {
  // Le champ est déclaré `unknown` sur `SkillContext` (canal de runtime): la
  // vérification ci-dessous EST la validation, pas une formalité. Elle lisait
  // auparavant `(input.context as any)`, ce qui désarmait le typecheck sur
  // l'objet entier au lieu du seul champ.
  const runtime = input.context.disordered_eating_guard_runtime as
    | DisorderedEatingSkillRuntime
    | undefined;
  if (!runtime || typeof runtime !== "object") {
    // R7: refuse to guess. A flow that opens without its floor is a flow that
    // can be opened by anything.
    throw new Error(
      "[disordered_eating_guard] missing disordered_eating_guard_runtime on " +
        "the skill context — the restriction guard result must be computed by " +
        "the runtime, never inferred from the turn frame",
    );
  }
  return runtime;
}

export async function runDisorderedEatingGuardSkill(
  input: RunSkillInput,
): Promise<ConversationSkillOutput> {
  const runtime = runtimeOf(input);
  const previousState = workingState(input);

  const reduction = reduceDisorderedEatingGuard({
    previousState,
    guardResult: runtime.restriction_guard_result,
    userMessage: input.user_message,
    country: runtime.country,
  });

  // The escalation leaves the digest: `restriction_signal` is one of the two
  // reason codes allowed to carry urgency='immediate' (SCHEMA DIALOGUE). It is
  // produced here and WRITTEN by the runtime (W4) — this skill has no I/O, so
  // the ledger stays honest: nothing is announced as done that was not re-read.
  let effect: RestrictionEffect | null = null;
  if (reduction.escalateToCoach) {
    effect = restrictionEffect(runtime.restriction_guard_result, {
      user_id: input.context.user_id,
      plan_version_id: runtime.plan_version_id,
      student_words: input.user_message.trim() || null,
    });
  }

  const visible = await runDisorderedEatingVisibleAgent({
    user_id: input.context.user_id,
    response_locale: input.context.response_locale,
    request_id: input.context.turn_frame.source_message_id,
    visible_task: reduction.visibleTask,
  });

  // Anti-silence invariant, same shape as safety_crisis: a rejected or failed
  // generation yields the deterministic text, never an empty clinical turn.
  //
  // ⚠️ L4 — LA LANGUE VOYAGE JUSQU'ICI. Ce repli était anglais en dur: quand la
  // pile tombe, 100 % des tours cliniques passent par lui, et une personne
  // francophone lisait de l'anglais au moment le plus sensible du produit. Le
  // troisième argument est REQUIS — un appelant qui l'oublie ne compile pas.
  const deterministic = visible.message
    ? null
    : disorderedEatingDeterministicMessage(
      reduction.visibleTask.kind,
      reduction.visibleTask.conversation_context.clinical_resources.lines,
      input.context.response_locale,
    );
  if (!visible.message) {
    console.warn("disordered_eating_guard.visible_generation_fallback", {
      "visible_task.kind": reduction.visibleTask.kind,
      reason: visible.failure_reason,
      response_locale: input.context.response_locale,
      deterministic_message_used: true,
    });
  }

  console.info("disordered_eating_guard.reducer_result", {
    phase: reduction.phase,
    "visible_task.kind": reduction.visibleTask.kind,
    reason_code: reduction.reasonCode,
    escalate_to_coach: reduction.escalateToCoach,
    trigger_codes: runtime.restriction_guard_result.triggers.map((t) => t.code),
    adherence_pressure_suspended: true,
    no_tooling: true,
  });

  return baseOutput(DISORDERED_EATING_GUARD_SKILL_ID, {
    status: reduction.status,
    response_intent: reduction.status === "exit"
      ? "close_clinical_guard"
      : "hold_clinical_guard",
    reply: visible.message ?? deterministic ?? "",
    diagnosis: {
      phase: reduction.phase,
      reducer_reason_code: reduction.reasonCode,
      visible_task: reduction.visibleTask.kind,
      response_contract: reduction.responseContract,
      restriction_guard: {
        guard_version: runtime.restriction_guard_result.guard_version,
        restriction_flag: runtime.restriction_guard_result.restriction_flag,
        trigger_codes: runtime.restriction_guard_result.triggers.map((t) =>
          t.code
        ),
        evaluated_for_date:
          runtime.restriction_guard_result.evaluated_for_date,
      },
      clinical_resources: {
        country: reduction.visibleTask.conversation_context.clinical_resources
          .resolution.country,
        fallback_used: reduction.visibleTask.conversation_context
          .clinical_resources.resolution.fallbackUsed,
        fallback_reason_code: reduction.visibleTask.conversation_context
          .clinical_resources.fallback_reason_code,
      },
      // The suspension is a property of the DB facts, not of this conversation.
      // Exiting the flow does NOT lift it — only a coach review does.
      adherence_pressure_suspended: true,
      flow_exit_lifts_suspension: false,
      visible_agent_ok: visible.visible_agent_ok,
      visible_failure_reason: visible.failure_reason,
      deterministic_message_used: Boolean(deterministic),
      contract_change_request: effect?.contract_change_request ?? null,
      constraint_list: [
        "no_numbers_in_clinical_flow",
        "no_adherence_reference",
        "no_plan_or_product_work",
        "no_suicide_crisis_line",
        "human_coach_always_offered",
      ],
    },
    recommendation_need: {
      needed: false,
      type: "none",
      urgency: "none",
      constraints: [
        "no_product_push_during_restriction_flag",
        "no_adherence_pressure",
        "no_memory_persistence_by_default",
      ],
    },
    // Nothing is committed here: this skill performs no I/O. The runtime writes
    // the escalation and re-reads it (execution truth), then the ledger fills.
    effects: emptyConversationEffects(),
    memory_write_candidates: [],
    state_patch: reduction.statePatch as Record<string, unknown>,
  });
}
