import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildClarificationVisibleAgentUserPrompt } from "./visible_agent.ts";
import type { ClarificationVisibleTask } from "./contract.ts";

const conversationContext = {
  question_goal: "identifier la reference cible",
  conflict_summary: "Sophia hesite entre carte attaque et carte defense.",
  candidate_labels: ["carte attaque", "carte defense"],
  selected_candidate_label: null,
  known_references: [{
    type: "attack_card" as const,
    id: "attack-1",
    label: "Routine du matin",
    status: "active",
    why_relevant: "reference utile pour formuler la question",
  }],
  best_reference_guess: null,
  missing_decision: {
    kind: "identify_target" as const,
    description: "La carte visee n'est pas encore claire.",
  },
  question_constraints: {
    max_questions: 1 as const,
    should_confirm_guess: false,
    should_offer_options: true,
    must_not_list_all_references: true,
    must_not_explain_internals: true as const,
  },
  question: "Tu parles de quelle carte exactement ?",
  user_words: ["préparons-la pour demain matin"],
  evidence_used: ["attack_card.title:Routine du matin"],
  do_not_say: ["dispatcher", "candidate_id", "note_information"],
  tone_constraints: ["whatsapp", "court", "tutoiement"],
};

Deno.test("clarification visible agent prompt only receives conversation_context", () => {
  const visibleTask: ClarificationVisibleTask = {
    kind: "ask_target_reference",
    conversation_context: conversationContext,
  };
  const prompt = buildClarificationVisibleAgentUserPrompt({
    user_id: "user-1",
    request_id: "req-1",
    stage: "ask_target_reference",
    user_message: "RAW USER MESSAGE OUTSIDE CONTEXT",
    recent_messages: [{ role: "assistant", content: "raw history" }],
    local_state: {
      skill_id: "clarification",
      mode: "local_flow",
      clarification_id: "clar-1",
      status: "asking",
      turn_count: 1,
      max_turns: 4,
      source_dispatcher: "global",
      source_flow_id: null,
      ambiguity_kind: "target",
      ambiguity_axes: ["target"],
      conflict_summary: "raw conflict",
      candidate_signals: [],
      selected_candidate_id: null,
      user_words: [],
      known_context: { db_context_pack: { raw: true } },
      inbound_note_information: null,
      outbound_note_information: null,
      created_at: "2026-06-09T00:00:00.000Z",
      updated_at: "2026-06-09T00:00:00.000Z",
      executable_from_chat: false,
    },
    visible_task: visibleTask,
    dispatcher_evidence: ["raw dispatcher evidence"],
  });
  const parsed = JSON.parse(prompt);

  assertEquals(Object.keys(parsed).sort(), [
    "conversation_context",
    "stage",
  ]);
  assertEquals(
    parsed.conversation_context.question_goal,
    conversationContext.question_goal,
  );
  assert(!prompt.includes("current_user_message"));
  assert(!prompt.includes("RAW USER MESSAGE OUTSIDE CONTEXT"));
  assert(!prompt.includes("raw history"));
  assert(!prompt.includes("raw dispatcher evidence"));
  assert(!prompt.includes("db_context_pack"));
  assert(!prompt.includes("recent_messages"));
  assert(!prompt.includes("dispatcher_evidence"));
});
