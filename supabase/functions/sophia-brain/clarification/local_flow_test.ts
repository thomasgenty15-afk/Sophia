import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  ClarificationCandidateSignal,
  ClarificationLocalDispatcherOutput,
  ClarificationLocalFlowAction,
  ClarificationLocalState,
} from "./contract.ts";
import { localDispatcherSystemPrompt } from "./local_dispatcher.ts";
import { reduceClarificationLocalDispatcherOutput } from "./reducer.ts";

const candidates: ClarificationCandidateSignal[] = [{
  candidate_id: "product_help",
  label: "une explication sur Sophia",
  target_dispatcher: "product_help",
  operation_type: null,
  surface_id: null,
  confidence: "high",
  why_plausible: "Le user demande ce que signifie une carte attaque.",
  structured_payload_hint: {},
}, {
  candidate_id: "prepare_attack_card",
  label: "préparer une carte d'attaque",
  target_dispatcher: "prepare_attack_card",
  operation_type: "prepare_attack_card",
  surface_id: "attack_cards",
  confidence: "high",
  why_plausible: "Le user mentionne une carte attaque pour demain.",
  structured_payload_hint: { target_hint: "demain" },
}];

function output(
  flowAction: ClarificationLocalFlowAction,
  overrides: Partial<ClarificationLocalDispatcherOutput> = {},
): ClarificationLocalDispatcherOutput {
  const selected = overrides.clarification_state?.selected_candidate_id ?? null;
  const conversationContext = {
    question_goal: "choisir entre expliquer ou préparer",
    conflict_summary:
      "Sophia hesite entre expliquer une carte attaque et en préparer une.",
    candidate_labels: candidates.map((candidate) => candidate.label),
    selected_candidate_label: null,
    known_references: [],
    best_reference_guess: null,
    missing_decision: null,
    question_constraints: {
      max_questions: 1 as const,
      should_confirm_guess: false,
      should_offer_options: true,
      must_not_list_all_references: true,
      must_not_explain_internals: true as const,
    },
    question: "Tu veux l'explication ou la préparer ?",
    user_words: ["je veux la préparer"],
    evidence_used: ["test"],
    do_not_say: ["dispatcher", "candidate_id", "note_information"],
    tone_constraints: ["whatsapp", "court", "tutoiement"],
  };
  return {
    flow_action: flowAction,
    confidence: overrides.confidence ?? "medium",
    risk_score: overrides.risk_score ?? 0,
    clarification_state: {
      clarification_id: "clar-1",
      status: "asking",
      source_dispatcher: "global",
      source_flow_id: null,
      ambiguity_kind: "intent",
      ambiguity_axes: ["intent"],
      conflict_summary:
        "Sophia hesite entre expliquer une carte attaque et en préparer une.",
      candidate_signals: candidates,
      selected_candidate_id: selected,
      selected_candidate_label: selected
        ? candidates.find((candidate) => candidate.candidate_id === selected)
          ?.label ?? null
        : null,
      why_selected_or_not: "test",
      user_words: ["je veux la préparer"],
      turn_count: 0,
      ...(overrides.clarification_state ?? {}),
    },
    inline_info: {
      requested: false,
      kind: null,
      question_to_answer: null,
      resume_clarification_goal: null,
      ...(overrides.inline_info ?? {}),
    },
    visible_task: {
      kind: "ask_choice",
      conversation_context: conversationContext,
      ...(overrides.visible_task ?? {}),
    },
    note_information: {
      needed: false,
      source_flow_id: "clarification",
      handoff_reason: "none",
      target_dispatcher: null,
      handoff_context_for_next_dispatcher: null,
      user_words: [],
      structured_context: {},
      ...(overrides.note_information ?? {}),
    },
    evidence: overrides.evidence ?? ["test"],
  };
}

function previous(): ClarificationLocalState {
  const now = "2026-06-08T10:00:00.000Z";
  return {
    skill_id: "clarification",
    mode: "local_flow",
    clarification_id: "clar-1",
    status: "asking",
    turn_count: 1,
    max_turns: 4,
    source_dispatcher: "global",
    source_flow_id: null,
    ambiguity_kind: "intent",
    ambiguity_axes: ["intent"],
    conflict_summary:
      "Sophia hesite entre expliquer une carte attaque et en préparer une.",
    candidate_signals: candidates,
    selected_candidate_id: null,
    user_words: ["c'est quoi une carte attaque pour demain ?"],
    known_context: {},
    inbound_note_information: null,
    outbound_note_information: null,
    created_at: now,
    updated_at: now,
    executable_from_chat: false,
  };
}

Deno.test("clarification reducer asks disambiguation and persists local state", () => {
  const result = reduceClarificationLocalDispatcherOutput({
    previous: null,
    output: output("ask_disambiguation"),
  });
  assertEquals(result.status, "continue");
  assertEquals(result.visible_task.kind, "ask_choice");
  assertEquals(result.local_state?.skill_id, "clarification");
  assertEquals(result.local_state?.candidate_signals.length, 2);
  assertEquals(result.note_information, null);
});

Deno.test("clarification local dispatcher prompt documents real output field rules", () => {
  const prompt = localDispatcherSystemPrompt();

  assertStringIncludes(prompt, "Field Completion Rules");
  assertStringIncludes(prompt, "flow_action");
  assertStringIncludes(prompt, "confidence");
  assertStringIncludes(prompt, "risk_score");
  assertStringIncludes(prompt, "clarification_state.selected_candidate_id");
  assertStringIncludes(prompt, "inline_info.object_types");
  assertStringIncludes(prompt, "visible_task.kind");
  assertStringIncludes(prompt, "visible_task.conversation_context");
  assertStringIncludes(prompt, "conversation_context.question_constraints");
  assertStringIncludes(prompt, "note_information.needed");
  assertStringIncludes(prompt, "evidence");
  assertStringIncludes(prompt, "exit_to_global_dispatcher");
  assertStringIncludes(prompt, "exit_to_global_dispatcher");
  assertStringIncludes(prompt, "safety_preempt");
  assertEquals(prompt.split("(not visible)").length - 1, 2);
});

Deno.test("clarification reducer resolves only to an existing candidate with note", () => {
  const result = reduceClarificationLocalDispatcherOutput({
    previous: previous(),
    output: output("resolved_to_candidate", {
      confidence: "high",
      clarification_state: {
        selected_candidate_id: "prepare_attack_card",
      } as any,
    }),
  });
  assertEquals(result.status, "resolved");
  assertEquals(result.local_state, null);
  assertEquals(result.selected_candidate?.candidate_id, "prepare_attack_card");
  assertEquals(
    result.note_information?.handoff_reason,
    "clarification_resolved",
  );
  assertEquals(
    result.note_information?.target_dispatcher,
    "prepare_attack_card",
  );
  assertEquals(
    (result.note_information?.structured_context as any)
      .selected_candidate_payload_hint.target_hint,
    "demain",
  );
});

Deno.test("clarification reducer rejects absent selected candidate", () => {
  const result = reduceClarificationLocalDispatcherOutput({
    previous: previous(),
    output: output("resolved_to_candidate", {
      confidence: "high",
      clarification_state: { selected_candidate_id: "invented_flow" } as any,
    }),
  });
  assertEquals(result.status, "continue");
  assertEquals(result.visible_task.kind, "ask_simpler_choice");
  assertEquals(result.reason_code, "clarification_selected_candidate_absent");
  assertEquals(result.note_information, null);
});

Deno.test("clarification reducer rejects low-confidence resolution", () => {
  const result = reduceClarificationLocalDispatcherOutput({
    previous: previous(),
    output: output("resolved_to_candidate", {
      confidence: "low",
      clarification_state: {
        selected_candidate_id: "prepare_attack_card",
      } as any,
    }),
  });
  assertEquals(result.status, "continue");
  assertEquals(
    result.reason_code,
    "clarification_low_confidence_resolution_rejected",
  );
  assertEquals(result.note_information, null);
});

Deno.test("clarification reducer stop request exits to global with note", () => {
  const result = reduceClarificationLocalDispatcherOutput({
    previous: previous(),
    output: output("exit_to_global_dispatcher"),
  });
  assertEquals(result.status, "topic_change");
  assertEquals(result.local_state, null);
  assertEquals(result.exit_to_global_dispatcher, true);
  assertEquals(result.note_information?.target_dispatcher, "global");
  assertEquals(result.visible_task.kind, "exit_ack");
});

Deno.test("clarification reducer preserves visible conversation constraints", () => {
  const dispatcherOutput = output("ask_disambiguation");
  dispatcherOutput.visible_task.conversation_context = {
    ...dispatcherOutput.visible_task.conversation_context,
    known_references: [{
      type: "attack_card",
      id: "attack-1",
      label: "Carte attaque du matin",
      status: "active",
      why_relevant: "Reference DB proche du message user.",
    }],
    best_reference_guess: {
      type: "attack_card",
      id: "attack-1",
      label: "Carte attaque du matin",
      confidence: "medium",
      evidence: ["demain matin"],
    },
    missing_decision: {
      kind: "confirm_target",
      description: "Confirmer si la carte attaque du matin est la cible.",
    },
    question_constraints: {
      max_questions: 1,
      should_confirm_guess: true,
      should_offer_options: false,
      must_not_list_all_references: true,
      must_not_explain_internals: true,
    },
    question: "Tu parles bien de la carte attaque du matin ?",
    tone_constraints: ["whatsapp", "court", "tutoiement"],
  };

  const result = reduceClarificationLocalDispatcherOutput({
    previous: previous(),
    output: dispatcherOutput,
  });

  const context = result.visible_task.conversation_context;
  assertEquals(context.question_constraints.max_questions, 1);
  assertEquals(context.question_constraints.should_confirm_guess, true);
  assertEquals(context.known_references[0].label, "Carte attaque du matin");
  assertEquals(context.best_reference_guess?.label, "Carte attaque du matin");
  assertEquals(
    context.question,
    "Tu parles bien de la carte attaque du matin ?",
  );
  assert(context.tone_constraints.includes("tutoiement"));
});

Deno.test("clarification reducer topic change exits to global with note", () => {
  const result = reduceClarificationLocalDispatcherOutput({
    previous: previous(),
    output: output("exit_to_global_dispatcher"),
  });
  assertEquals(result.status, "topic_change");
  assertEquals(result.exit_to_global_dispatcher, true);
  assertEquals(result.note_information?.target_dispatcher, "global");
  assertEquals(result.note_information?.handoff_reason, "topic_change");
});

Deno.test("clarification reducer safety preempts with safety note", () => {
  const result = reduceClarificationLocalDispatcherOutput({
    previous: previous(),
    output: output("safety_preempt", { risk_score: 8 }),
  });
  assertEquals(result.status, "safety");
  assertEquals(result.local_state, null);
  assertEquals(result.note_information?.target_dispatcher, "safety_crisis");
  assertEquals(result.note_information?.handoff_reason, "safety");
});

Deno.test("clarification reducer anti false positive keeps continuation local", () => {
  const result = reduceClarificationLocalDispatcherOutput({
    previous: previous(),
    output: output("still_ambiguous", {
      confidence: "low",
      clarification_state: {
        user_words: ["je veux continuer mais je ne sais pas laquelle"],
        why_selected_or_not:
          "Le user veut continuer la clarification mais la cible reste floue.",
      } as any,
      visible_task: {
        kind: "still_ambiguous",
        conversation_context: {
          ...output("still_ambiguous").visible_task.conversation_context,
          question:
            "Ok, tu veux continuer sur l'explication ou sur la preparation ?",
        },
      },
    }),
  });

  assertEquals(result.status, "continue");
  assertEquals(result.exit_to_global_dispatcher, false);
  assertEquals(result.note_information, null);
  assertEquals(result.local_state?.status, "still_ambiguous");
});

Deno.test("clarification reducer inline product/status keeps parent flow", () => {
  const product = reduceClarificationLocalDispatcherOutput({
    previous: previous(),
    output: output("get_info_product", {
      inline_info: {
        requested: true,
        kind: "product",
        question_to_answer: "c'est quoi la difference ?",
        resume_clarification_goal: "choisir entre expliquer ou préparer",
      },
    }),
  });
  assertEquals(product.status, "inline_tool");
  assertEquals(product.local_state?.skill_id, "clarification");
  assertEquals(product.note_information?.target_dispatcher, "product_help");

  const db = reduceClarificationLocalDispatcherOutput({
    previous: previous(),
    output: output("get_info_db", {
      inline_info: {
        requested: true,
        kind: "db",
        question_to_answer: "qu'est-ce qui existe deja ?",
        resume_clarification_goal: "choisir entre expliquer ou préparer",
      },
    }),
  });
  assertEquals(db.status, "inline_tool");
  assertEquals(db.note_information?.target_dispatcher, "status_recap");
});
