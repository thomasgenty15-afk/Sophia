import { assertEquals } from "jsr:@std/assert@1";

import {
  normalizeWinbackReengagementDecision,
  winbackReengagementLocalFailureDecision,
} from "./local_flow.ts";
import type { WinbackReengagementLocalState } from "./state.ts";

const STATE: WinbackReengagementLocalState = {
  version: 1,
  episode_id: "ep-123",
  winback_step: 1,
  days_inactive_at_send: 3,
  awaiting_first_reply: false,
  turn_count: 2,
  stage: "diagnose",
  gates: {
    reason_status: "missing",
    reanchor_status: "pending",
    solution_status: "pending",
  },
  working_reason_note: null,
  solution_kind: null,
  redirect_target: null,
  context: {
    stalled_actions: [],
    past_episodes: [],
    recent_episode_confirmable: false,
  },
};

function normalize(raw: unknown, state: WinbackReengagementLocalState = STATE) {
  return normalizeWinbackReengagementDecision({
    raw,
    userMessage: "je sais pas trop",
    state,
  });
}

Deno.test("winback normalize: invalid output continues with state unchanged", () => {
  const decision = normalize("pas du json du tout");
  assertEquals(decision.action, "continue_reengagement");
  assertEquals(decision.stage_next, STATE.stage);
  assertEquals(decision.gates, STATE.gates);
  assertEquals(decision.note_information, null);
  assertEquals(decision.coercions, ["invalid_output_continue_unchanged"]);
});

Deno.test("winback normalize: failure decision is deterministic continue", () => {
  const decision = winbackReengagementLocalFailureDecision({
    userMessage: "hello",
    state: STATE,
  });
  assertEquals(decision.action, "continue_reengagement");
  assertEquals(decision.reason, "local_dispatcher_invalid_output");
});

Deno.test("winback normalize: complete without reason nor evidence is downgraded", () => {
  const decision = normalize(JSON.stringify({
    action: "complete_reengaged",
    confidence: "high",
    reason: "il va bien",
    stage_next: "closure",
    gates: {
      reason_status: "missing",
      reanchor_status: "pending",
      solution_status: "pending",
    },
    resume_evidence: null,
  }));
  assertEquals(decision.action, "continue_reengagement");
  assertEquals(
    decision.coercions.includes("complete_without_reason_or_evidence_downgraded"),
    true,
  );
});

Deno.test("winback normalize: first-turn completion is always downgraded (QA S2, P8)", () => {
  // Le LLM peut fabriquer gates «acquises» + citation-excuse dans la même
  // sortie que l'action — l'invariant s'appuie sur le turn_count persisté.
  const firstTurn: WinbackReengagementLocalState = { ...STATE, turn_count: 0 };
  const decision = normalize(
    JSON.stringify({
      action: "complete_reengaged",
      confidence: "high",
      reason: "reprend et s'excuse",
      stage_next: "closure",
      gates: {
        reason_status: "captured",
        reanchor_status: "done",
        solution_status: "accepted",
      },
      resume_evidence: "désolée, encore une fois j'ai disparu",
    }),
    firstTurn,
  );
  assertEquals(decision.action, "continue_reengagement");
  assertEquals(
    decision.coercions.includes("first_turn_completion_downgraded"),
    true,
  );
  // Les gates fabriquées sont écartées, le stage retombe en diagnose (là où
  // vit la règle «confirme la raison passée»).
  assertEquals(decision.gates.reason_status, "missing");
  assertEquals(decision.stage_next, "diagnose");
});

Deno.test("winback normalize: complete with explicit resume evidence passes", () => {
  const decision = normalize(JSON.stringify({
    action: "complete_reengaged",
    confidence: "high",
    reason: "reprise explicite",
    stage_next: "closure",
    gates: {
      reason_status: "missing",
      reanchor_status: "not_needed",
      solution_status: "pending",
    },
    resume_evidence: "c'est bon je m'y remets ce soir",
  }));
  assertEquals(decision.action, "complete_reengaged");
});

Deno.test("winback normalize: pause without user evidence is downgraded", () => {
  const decision = normalize(JSON.stringify({
    action: "accept_pause",
    confidence: "high",
    reason: "il a l'air fatigué",
    stage_next: "closure",
    pause: { kind: "week", user_evidence: "" },
  }));
  assertEquals(decision.action, "continue_reengagement");
  assertEquals(
    decision.coercions.includes("pause_without_evidence_downgraded"),
    true,
  );
});

Deno.test("winback normalize: explicit pause carries kind and marks solution pause", () => {
  const decision = normalize(JSON.stringify({
    action: "accept_pause",
    confidence: "high",
    reason: "demande explicite",
    stage_next: "closure",
    pause: { kind: "week", user_evidence: "pas cette semaine stp" },
  }));
  assertEquals(decision.action, "accept_pause");
  assertEquals(decision.pause?.kind, "week");
  assertEquals(decision.solution_kind, "pause");
});

Deno.test("winback normalize: coaching handoff requires a card solution kind", () => {
  const withoutCard = normalize(JSON.stringify({
    action: "handoff_coaching_recommendation",
    confidence: "high",
    reason: "il veut un outil",
    stage_next: "solution",
    solution_kind: "adjust_plan",
  }));
  assertEquals(withoutCard.action, "continue_reengagement");
  assertEquals(
    withoutCard.coercions.includes("handoff_without_card_kind_downgraded"),
    true,
  );

  const withCard = normalize(JSON.stringify({
    action: "handoff_coaching_recommendation",
    confidence: "high",
    reason: "craving sur le moment",
    stage_next: "solution",
    solution_kind: "defense_card",
  }));
  assertEquals(withCard.action, "handoff_coaching_recommendation");
  assertEquals(
    (withCard.note_information?.structured_context as Record<string, unknown>)
      ?.recommended_next_focus,
    "coaching_recommendation",
  );
});

Deno.test("winback normalize: exits carry a note with no-mutation render constraint", () => {
  const decision = normalize(JSON.stringify({
    action: "exit_to_global_dispatcher",
    confidence: "medium",
    reason: "changement de sujet",
    stage_next: "diagnose",
  }));
  assertEquals(decision.action, "exit_to_global_dispatcher");
  const constraints = (decision.note_information?.structured_context as
    | Record<string, unknown>
    | undefined)?.render_constraints as string[] | undefined;
  assertEquals(Array.isArray(constraints), true);
  assertEquals(
    (constraints ?? []).some((entry) => entry.includes("no_mutation_claim")),
    true,
  );
});

Deno.test("winback normalize: numeric confidence is coerced to a band", () => {
  const decision = normalize(JSON.stringify({
    action: "continue_reengagement",
    confidence: 0.9,
    reason: "ok",
    stage_next: "reanchor",
  }));
  assertEquals(decision.confidence, "high");
});

Deno.test("winback normalize: max turns forces completion", () => {
  const nearCap = { ...STATE, turn_count: 11 };
  const decision = normalize(
    JSON.stringify({
      action: "continue_reengagement",
      confidence: "high",
      reason: "on continue",
      stage_next: "diagnose",
    }),
    nearCap,
  );
  assertEquals(decision.action, "complete_reengaged");
  assertEquals(decision.coercions.includes("max_turns_forced_completion"), true);
});

Deno.test("winback normalize: partial gates object does not regress a captured reason", () => {
  const withCaptured: WinbackReengagementLocalState = {
    ...STATE,
    gates: { ...STATE.gates, reason_status: "captured" },
  };
  const decision = normalize(
    JSON.stringify({
      action: "continue_reengagement",
      confidence: "high",
      reason: "on avance vers la solution",
      stage_next: "solution",
      // LLM ne renvoie que solution_status : reason_status doit rester captured
      gates: { solution_status: "offered" },
    }),
    withCaptured,
  );
  assertEquals(decision.gates.reason_status, "captured");
  assertEquals(decision.gates.solution_status, "offered");
});

Deno.test("winback normalize: redirect_target tracks the current solution, no stickiness", () => {
  const withPlanRedirect: WinbackReengagementLocalState = {
    ...STATE,
    solution_kind: "adjust_plan",
    redirect_target: "Plan",
  };
  // Bascule vers une pause : plus aucune cible de redirection.
  const decision = normalize(
    JSON.stringify({
      action: "accept_pause",
      confidence: "high",
      reason: "demande explicite",
      stage_next: "closure",
      pause: { kind: "week", user_evidence: "pas cette semaine stp" },
    }),
    withPlanRedirect,
  );
  assertEquals(decision.solution_kind, "pause");
  assertEquals(decision.redirect_target, null);
});

Deno.test("winback normalize: empty closure stage falls back to diagnose (QA S11)", () => {
  // Une closure sans aucune gate acquise est une incohérence de machine à
  // états — le stage retombe en diagnose (où vit la confirmation mémoire).
  const virgin: WinbackReengagementLocalState = { ...STATE, turn_count: 0 };
  const decision = normalize(
    JSON.stringify({
      action: "continue_reengagement",
      confidence: "medium",
      reason: "réponse vague",
      stage_next: "closure",
      gates: {
        reason_status: "missing",
        reanchor_status: "pending",
        solution_status: "pending",
      },
    }),
    virgin,
  );
  assertEquals(decision.stage_next, "diagnose");
  assertEquals(
    decision.coercions.includes("empty_closure_stage_redirected_to_diagnose"),
    true,
  );
  // Anti-faux-positif : une closure avec une raison acquise passe.
  const earned = normalize(
    JSON.stringify({
      action: "continue_reengagement",
      confidence: "high",
      reason: "on scelle",
      stage_next: "closure",
      gates: {
        reason_status: "captured",
        reanchor_status: "done",
        solution_status: "offered",
      },
    }),
    { ...STATE, gates: { ...STATE.gates, reason_status: "captured" } },
  );
  assertEquals(earned.stage_next, "closure");
});

Deno.test("winback normalize: unknown action falls back to continue", () => {
  const decision = normalize(JSON.stringify({
    action: "delete_everything",
    confidence: "high",
    reason: "??",
    stage_next: "closure",
  }));
  assertEquals(decision.action, "continue_reengagement");
  assertEquals(decision.coercions.includes("unknown_action_to_continue"), true);
});
