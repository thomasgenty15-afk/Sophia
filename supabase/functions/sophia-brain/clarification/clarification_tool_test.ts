import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildClarificationRequest,
  type ClarificationRequest,
} from "./contract.ts";
import { renderClarificationQuestion } from "./renderer.ts";
import {
  clearClarificationState,
  readClarificationState,
  writeClarificationState,
} from "./state.ts";
import { runClarificationTool } from "./tool.ts";

function request(): ClarificationRequest {
  return buildClarificationRequest({
    clarification_id: "clarify-test",
    owner: "dispatcher",
    ambiguity_kind: "intent",
    user_message: "Je veux le faire demain",
    recent_messages: [
      { role: "assistant", content: "Tu veux que je t'aide ?" },
      { role: "user", content: "Oui" },
    ],
    candidates: [
      { id: "one", label: "un rappel ponctuel" },
      { id: "two", label: "un rappel récurrent" },
    ],
  });
}

Deno.test("clarification_tool: ask valide avec question", async () => {
  const output = await runClarificationTool({
    request: request(),
    llm_runner: async () => ({
      status: "ask",
      confidence: "medium",
      question: "Tu veux que ce soit ponctuel ou répété ?",
    }),
  });
  assertEquals(output.status, "ask");
  assertEquals(output.question, "Tu veux que ce soit ponctuel ou répété ?");
  assertEquals(renderClarificationQuestion(output), output.question);
});

Deno.test("clarification_tool: normalise le vouvoiement en tutoiement", async () => {
  const output = await runClarificationTool({
    request: request(),
    llm_runner: async () => ({
      status: "ask",
      confidence: "medium",
      question: "Souhaitez-vous un rappel ponctuel ou récurrent ?",
    }),
  });
  assertEquals(output.status, "ask");
  assertEquals(output.question, "Tu veux un rappel ponctuel ou récurrent ?");
});

Deno.test("clarification_tool: injecte les ressources product_help attack card", async () => {
  let prompt: any = null;
  const attackRequest = buildClarificationRequest({
    clarification_id: "clarify-attack",
    owner: "product_help",
    ambiguity_kind: "intent",
    user_message:
      "Je veux comprendre les cartes d'attaque ou en préparer une pour mon démarrage demain.",
    candidates: [
      { id: "product_help", label: "une explication sur Sophia" },
      {
        id: "prepare_attack_card",
        label: "préparer une carte d'attaque",
        operation_type: "prepare_attack_card",
      },
    ],
  });
  await runClarificationTool({
    request: attackRequest,
    llm_runner: async (input) => {
      prompt = JSON.parse(input.user_prompt);
      return {
        status: "ask",
        confidence: "medium",
        question:
          "Souhaitez-vous comprendre l'utilité des cartes d'attaque ou en préparer une pour demain ?",
      };
    },
  });
  const resources = prompt?.clarification_resources as Array<
    { id?: string; content?: string }
  >;
  assertEquals(
    resources.map((resource) => resource.id),
    [
      "style.tutoiement",
      "product_help.intent_slice",
      "product_help.attack_card_explanation_slice",
      "attack_card.prepare_action_slice",
      "attack_card.temporal_hint_policy",
      "attack_card.action_anchor_hint",
    ],
  );
});

Deno.test("clarification_tool: ancre la carte d'attaque sur l'action plutôt que demain", async () => {
  const attackRequest = buildClarificationRequest({
    clarification_id: "clarify-attack",
    owner: "product_help",
    ambiguity_kind: "intent",
    user_message:
      "Je veux comprendre les cartes d'attaque ou en préparer une pour mon démarrage demain.",
    candidates: [
      { id: "product_help", label: "une explication sur Sophia" },
      {
        id: "prepare_attack_card",
        label: "préparer une carte d'attaque",
        operation_type: "prepare_attack_card",
      },
    ],
  });
  const output = await runClarificationTool({
    request: attackRequest,
    llm_runner: async () => ({
      status: "ask",
      confidence: "medium",
      question:
        "Souhaitez-vous comprendre l'utilité des cartes d'attaque ou en préparer une pour demain ?",
    }),
  });
  assertEquals(
    output.question,
    "Tu veux comprendre l'utilité des cartes d'attaque ou en préparer une pour ton action ?",
  );
});

Deno.test("clarification_tool: resolved valide avec candidate id existant", async () => {
  const output = await runClarificationTool({
    request: request(),
    llm_runner: async () => ({
      status: "resolved",
      selected_candidate_id: "one",
      confidence: "high",
      user_goal_summary: "L'utilisateur veut le premier candidat.",
    }),
  });
  assertEquals(output.status, "resolved");
  assertEquals(output.selected_candidate_id, "one");
});

Deno.test("clarification_tool: resolved avec candidate id inconnu est rejeté vers fallback", async () => {
  const output = await runClarificationTool({
    request: request(),
    llm_runner: async () => ({
      status: "resolved",
      selected_candidate_id: "missing",
      confidence: "high",
    }),
  });
  assertEquals(output.status, "ask");
  assertEquals(output.selected_candidate_id, null);
  assertEquals(
    output.question,
    "Tu veux plutôt un rappel ponctuel, ou un rappel récurrent ?",
  );
});

Deno.test("clarification_tool: confidence low + resolved devient ask", async () => {
  const output = await runClarificationTool({
    request: request(),
    llm_runner: async () => ({
      status: "resolved",
      selected_candidate_id: "one",
      confidence: "low",
      question: "Tu veux plutôt le premier choix ?",
    }),
  });
  assertEquals(output.status, "ask");
  assertEquals(output.selected_candidate_id, null);
  assertEquals(output.question, "Tu veux plutôt le premier choix ?");
});

Deno.test("clarification_tool: JSON invalide donne question neutre", async () => {
  const output = await runClarificationTool({
    request: request(),
    llm_runner: async () => "not json",
  });
  assertEquals(output.status, "ask");
  assertEquals(output.confidence, "low");
  assertEquals(
    output.question,
    "Tu veux plutôt un rappel ponctuel, ou un rappel récurrent ?",
  );
});

Deno.test("clarification_tool: topic_change accepté sans candidate", async () => {
  const output = await runClarificationTool({
    request: request(),
    llm_runner: async () => ({
      status: "topic_change",
      confidence: "medium",
      selected_candidate_id: "one",
      question: "Inutile ?",
    }),
  });
  assertEquals(output.status, "topic_change");
  assertEquals(output.selected_candidate_id, null);
  assertEquals(output.question, null);
});

Deno.test("clarification_tool: cancelled accepté sans candidate", async () => {
  const output = await runClarificationTool({
    request: request(),
    llm_runner: async () => ({
      status: "cancelled",
      confidence: "high",
      selected_candidate_id: "one",
    }),
  });
  assertEquals(output.status, "cancelled");
  assertEquals(output.selected_candidate_id, null);
});

Deno.test("clarification_tool: plusieurs questions visibles sont normalisées", async () => {
  const output = await runClarificationTool({
    request: request(),
    llm_runner: async () => ({
      status: "ask",
      confidence: "medium",
      question: "Tu veux le premier ? Ou le deuxième ?",
    }),
  });
  assertEquals(output.status, "ask");
  assertEquals(output.question, "Tu veux le premier ?");
});

Deno.test("clarification_state: no_chat_mutation reste toujours true", () => {
  const state = {
    skill_id: "orientation_clarification" as const,
    clarification_id: "clarify-test",
    owner: "dispatcher",
    ambiguity_kind: "intent" as const,
    candidates: request().candidates,
    turn_count: 0,
    max_turns: 2,
    created_at: "2026-06-01T00:00:00.000Z",
    no_chat_mutation: true as const,
  };
  const tempMemory = writeClarificationState({}, state);
  assertEquals(readClarificationState(tempMemory)?.no_chat_mutation, true);
  assertEquals(
    readClarificationState(tempMemory)?.skill_id,
    "orientation_clarification",
  );
  assertEquals(
    readClarificationState(clearClarificationState(tempMemory)),
    null,
  );
});
