import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  normalizeWeeklyReviewLocalDispatcherOutput,
  reduceWeeklyReviewLocalDispatcherOutput,
  runWeeklyReviewLocalRuntime,
  weeklyReviewLocalDispatcherSystemPromptForTest,
} from "./local_flow.ts";
import { buildWeeklyReviewVisibleAgentUserPrompt } from "./visible_agent.ts";

function weeklyState() {
  return {
    skill_id: "weekly_adaptive_review_v1",
    status: "open",
    weekly_progress_review: {
      week_start_date: "2026-06-01",
      week_end_date: "2026-06-07",
      transformations: [],
    },
    weekly_adaptive_review: {
      week_strategy: { decision: "bridge_week", reason: "charge forte" },
      question: { text: "Comment tu ressors de la semaine ?" },
      item_decisions: [],
    },
    weekly_flow_state: {
      stage: "strategy_ready",
      proposal_status: "none",
      validation_unlock_status: "locked_until_weekly_complete",
      human_signals: {
        objective_delta: "unknown",
        felt_state: "unknown",
      },
      weekly_gates: {
        week_experience_status: "captured",
        action_review_status: "captured",
        global_progress_status: "missing",
        felt_progress_status: "missing",
        solution_fit_status: "missing",
        synthesis_status: "missing",
        closure_status: "missing",
      },
      detour_candidate: {
        kind: "none",
        source_stage: null,
        target_action_or_plan: null,
        fit_hypothesis: null,
        readiness: "none",
        user_consent: false,
        scope: {},
        return_focus: null,
      },
      last_visible_summary: "Semaine chargee, alleger serait prudent.",
      last_handoff_summary: null,
      turn_count: 1,
      max_turns: 6,
      updated_at: "2026-06-08T08:00:00.000Z",
    },
  };
}

function baseOutput(overrides: Record<string, unknown> = {}) {
  return {
    flow_action: "answer_weekly_question",
    confidence: "high",
    risk_score: 0,
    weekly_intent: {
      kind: "weekly_answer",
      summary: "User confirme fatigue mais progression legere.",
    },
    human_signal_updates: {
      objective_delta: "slight_progress",
      felt_progress: "encouraged",
      felt_state: "tired_but_ok",
      dominant_blocker_confirmation: "confirmed",
      user_summary: "fatigue mais progression legere",
    },
    handoff_updates: {
      status: "none",
      requested_adjustment_summary: null,
      revision_summary: null,
      platform_destination: null,
      scope: {
        kind: "none",
        plan_id: null,
        plan_title: null,
        plan_item_ids: [],
        scope_summary: null,
        needs_scope_clarification: false,
      },
    },
    forgotten_progress: {
      status: "none",
      target_hint: null,
      outcome_hint: null,
      evidence: null,
    },
    weekly_gates: {
      week_experience_status: "captured",
      action_review_status: "captured",
      global_progress_status: "captured",
      felt_progress_status: "captured",
      solution_fit_status: "missing",
      synthesis_status: "missing",
      closure_status: "missing",
    },
    detour_candidate: {
      kind: "none",
      source_stage: null,
      target_action_or_plan: null,
      fit_hypothesis: null,
      readiness: "none",
      user_consent: false,
      scope: {},
      return_focus: null,
    },
    state_updates: {
      status: "open",
      weekly_stage: "strategy_ready",
      validation_unlock_status: "locked_until_weekly_complete",
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: "qualify_solution_fit",
      instruction: "Qualifier la prochaine piste weekly.",
    },
    exit_memo: {
      needed: false,
      reason: "none",
      user_intent_summary: null,
      local_flow_context: {
        skill_id: "weekly_adaptive_review_v1",
        weekly_stage: null,
        week_strategy: null,
        last_weekly_question: null,
        last_visible_summary: null,
        last_handoff_summary: null,
        validation_unlock_status: null,
        committed_effects: [],
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "unknown",
        why: null,
        constraints: [],
      },
    },
    evidence: ["test"],
    ...overrides,
  };
}

function noteInformation(
  targetDispatcher = "prepare_attack_card",
  handoffReason = "bridge",
): Record<string, unknown> {
  return {
    source_flow_id: "weekly_adaptive_review_v1",
    source_flow_state_summary:
      "Weekly active, user explicitly asks to prepare a card.",
    handoff_reason: handoffReason,
    target_dispatcher: targetDispatcher,
    handoff_context_for_next_dispatcher: JSON.stringify({
      user_message_summary: "prepare a card from weekly",
      active_flow_summary: "weekly reading already discussed",
      collected_state: { weekly_stage: "strategy_ready" },
      unresolved_questions: [],
      recommended_next_focus: "start target local dispatcher",
    }),
    target_local_dispatcher_hint:
      "Run the target local dispatcher from its own contract.",
    user_words: ["fais moi une carte d'attaque"],
    structured_context: {
      user_message_summary: "prepare a card from weekly",
      active_flow_summary: "weekly reading already discussed",
      collected_state: { weekly_stage: "strategy_ready" },
      unresolved_questions: [],
      recommended_next_focus: "start target local dispatcher",
    },
    risk_score: 0,
    executable_from_chat: {
      db_write_committed: false,
      potion_session_created: false,
      scheduled_checkin_created: false,
      recurring_reminder_created: false,
      executable_confirmation_generated: false,
    },
  };
}

Deno.test("weekly dispatcher prompt documents field completion rules and exactly two examples", () => {
  const prompt = weeklyReviewLocalDispatcherSystemPromptForTest();
  assert(prompt.includes("Field Completion Rules:"));
  assert(
    prompt.includes("- flow_action: decision principale du tour courant."),
  );
  assert(
    prompt.includes(
      "- weekly_intent: resume l'intention weekly du message courant.",
    ),
  );
  assert(prompt.includes("Frontiere chat/outils"));
  assert(prompt.includes("- action_status_updates: liste les corrections"));
  assert(
    prompt.includes(
      "- visible_task.conversation_context: ce champ existe dans le contrat",
    ),
  );
  assert(
    prompt.includes(
      "- note_information: obligatoire pour exit_to_global_dispatcher",
    ),
  );
  assert(prompt.includes("- weekly_gates: etat de progression du weekly."));
  assert(prompt.includes("- detour_candidate: hypothese d'outil"));
  assert(prompt.includes("weekly_synthesis -> weekly_closure"));
  const examples = prompt.match(/Exemple JSON [0-9]/g) ?? [];
  assertEquals(examples.length, 2);
});

Deno.test("weekly local reducer continues normally with visible-safe context", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(baseOutput());
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "answered");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.target_dispatcher, "none");
  assertEquals(reduced.note_information, null);
  assertEquals(reduced.visible_task, "qualify_solution_fit");
  assertEquals(
    reduced.conversation_context?.state_summary,
    output.weekly_intent.summary,
  );
  assert(
    reduced.conversation_context?.do_not_say.includes("modifie le plan") ===
      true,
  );
  assertEquals(
    (reduced.weekly_state?.weekly_flow_state as any).felt_progress,
    "encouraged",
  );
  assertEquals(
    (reduced.conversation_context?.known_values as any).felt_progress,
    "encouraged",
  );
  assertEquals(
    (reduced.conversation_context?.known_values as any)
      .action_review_before_global_progress_required,
    true,
  );
  assert(
    reduced.conversation_context?.tone_constraints.includes(
      "prefer_gender_neutral_wording_when_not_certain",
    ) === true,
  );
  assert(
    reduced.conversation_context?.do_not_say.includes(
      "reussite pleine pour une action partielle",
    ) === true,
  );
  assertEquals(
    (reduced.weekly_state?.weekly_adaptive_review as any)?.plan_patch,
    undefined,
  );
  assert(
    (reduced.weekly_state?.weekly_adaptive_review as any)?.constraints
      ?.includes("no_legacy_plan_patch") === true,
  );
});

Deno.test("weekly local reducer preserves server-owned pending detour when IA clears it", () => {
  const state = {
    ...weeklyState(),
    weekly_flow_state: {
      ...weeklyState().weekly_flow_state,
      detour_candidate: {
        kind: "defense_card",
        source_stage: "solution_fit",
        target_action_or_plan: "Rangement du soir",
        fit_hypothesis: "Proteger la fenetre de fatigue du soir.",
        readiness: "offer",
        user_consent: false,
        scope: { plan_item_ids: ["item-rangement"] },
        return_focus: "Revenir a la synthese weekly.",
      },
    },
  };
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      clear_fields: ["detour_candidate"],
      detour_candidate: {
        kind: "none",
        source_stage: null,
        target_action_or_plan: null,
        fit_hypothesis: null,
        readiness: "none",
        user_consent: false,
        scope: {},
        return_focus: null,
      },
    }),
  );

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: state,
    output,
  });

  assertEquals(
    (reduced.weekly_state?.weekly_flow_state as any).detour_candidate.kind,
    "defense_card",
  );
  assert(
    reduced.state_mutation_audit.restored_fields.includes(
      "detour_candidate",
    ),
  );
  assertEquals(
    reduced.state_mutation_audit.rejected_changes.some((entry) =>
      entry.field === "detour_candidate" &&
      entry.reason_code === "blocked_by_constraint"
    ),
    true,
  );
});

Deno.test("weekly local reducer clears pending detour on explicit user refusal", () => {
  const state = {
    ...weeklyState(),
    weekly_flow_state: {
      ...weeklyState().weekly_flow_state,
      detour_candidate: {
        kind: "defense_card",
        source_stage: "solution_fit",
        target_action_or_plan: "Rangement du soir",
        fit_hypothesis: "Proteger la fenetre de fatigue du soir.",
        readiness: "offer",
        user_consent: false,
        scope: { plan_item_ids: ["item-rangement"] },
        return_focus: "Revenir a la synthese weekly.",
      },
    },
  };
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "reject_weekly_diagnostic",
      clear_fields: ["detour_candidate"],
      weekly_intent: {
        kind: "weekly_rejection",
        summary: "User refuses the defense card detour.",
      },
      handoff_updates: {
        status: "cancelled",
        requested_adjustment_summary: null,
        revision_summary: null,
        platform_destination: null,
        scope: {
          kind: "none",
          plan_id: null,
          plan_title: null,
          plan_item_ids: [],
          scope_summary: null,
          needs_scope_clarification: false,
        },
      },
      detour_candidate: {
        kind: "none",
        source_stage: null,
        target_action_or_plan: null,
        fit_hypothesis: null,
        readiness: "none",
        user_consent: false,
        scope: {},
        return_focus: null,
      },
      visible_task: {
        kind: "ask_global_progress_feeling",
        instruction: "Continue weekly without the refused detour.",
      },
    }),
  );

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: state,
    output,
  });

  assertEquals(
    (reduced.weekly_state?.weekly_flow_state as any).detour_candidate.kind,
    "none",
  );
  assert(
    reduced.state_mutation_audit.cleared_fields.includes("detour_candidate"),
  );
});

Deno.test("weekly local reducer preserves proposed plan patch with server confirmation required", () => {
  const state = {
    ...weeklyState(),
    weekly_adaptive_review: {
      ...weeklyState().weekly_adaptive_review,
      plan_patch: {
        operations: [{ op: "carry_over_item", plan_item_id: "item-1" }],
        requires_confirmation: false,
        source: "weekly_projection",
      },
    },
  };
  const output = normalizeWeeklyReviewLocalDispatcherOutput(baseOutput());

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: state,
    output,
  });

  assertEquals(
    (reduced.weekly_state?.weekly_adaptive_review as any).plan_patch
      .requires_confirmation,
    true,
  );
  assertEquals(
    (reduced.weekly_state?.weekly_adaptive_review as any).plan_patch
      .operations[0].op,
    "carry_over_item",
  );
  assertEquals(
    (reduced.weekly_state?.weekly_adaptive_review as any)
      .pending_confirmation.kind,
    "plan_patch",
  );
  assertEquals(
    (reduced.weekly_state?.weekly_adaptive_review as any).plan_patch.applied,
    undefined,
  );
});

Deno.test("weekly local reducer keeps plan patch and locked validation on invalid confirmation", () => {
  const state = {
    ...weeklyState(),
    weekly_adaptive_review: {
      ...weeklyState().weekly_adaptive_review,
      plan_patch: {
        operations: [{ op: "carry_over_item", plan_item_id: "item-1" }],
        requires_confirmation: true,
      },
      pending_confirmation: {
        kind: "plan_patch",
        status: "pending",
      },
    },
  };
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "confirm_weekly_diagnostic",
      clear_fields: ["weekly_adaptive_review.plan_patch"],
      state_updates: {
        status: "open",
        weekly_stage: "strategy_ready",
        validation_unlock_status: "available",
        turn_count_increment: 1,
        close_after_visible: false,
      },
    }),
  );

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: state,
    output,
  });

  assertEquals(
    (reduced.weekly_state?.weekly_adaptive_review as any).plan_patch
      .operations[0].plan_item_id,
    "item-1",
  );
  assertEquals(
    (reduced.weekly_state?.weekly_flow_state as any).validation_unlock_status,
    "locked_until_weekly_complete",
  );
  assertEquals(
    reduced.state_mutation_audit.rejected_changes.some((entry) =>
      entry.field === "weekly_adaptive_review.plan_patch" &&
      entry.reason_code === "blocked_by_constraint"
    ),
    true,
  );
  assertEquals(
    reduced.state_mutation_audit.rejected_changes.some((entry) =>
      entry.field === "validation_unlock_status" &&
      entry.reason_code === "invalid_status_transition"
    ),
    true,
  );
});

Deno.test("weekly local reducer preserves completed gates when IA omits them", () => {
  const state = {
    ...weeklyState(),
    weekly_flow_state: {
      ...weeklyState().weekly_flow_state,
      weekly_gates: {
        week_experience_status: "complete",
        action_review_status: "complete",
        global_progress_status: "complete",
        felt_progress_status: "complete",
        solution_fit_status: "captured",
        synthesis_status: "missing",
        closure_status: "missing",
      },
    },
  };
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      weekly_gates: {
        week_experience_status: "missing",
        action_review_status: "missing",
        global_progress_status: "missing",
        felt_progress_status: "missing",
        solution_fit_status: "missing",
        synthesis_status: "missing",
        closure_status: "missing",
      },
    }),
  );

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: state,
    output,
  });

  assertEquals(
    (reduced.weekly_state?.weekly_flow_state as any).weekly_gates
      .week_experience_status,
    "complete",
  );
  assertEquals(
    (reduced.weekly_state?.weekly_flow_state as any).weekly_gates
      .action_review_status,
    "complete",
  );
});

Deno.test("weekly local reducer tolerates legacy state without new runtime fields", () => {
  const legacyState = {
    skill_id: "weekly_adaptive_review_v1",
    status: "open",
    weekly_adaptive_review: {
      question: { text: "Comment tu ressors de la semaine ?" },
    },
  };
  const output = normalizeWeeklyReviewLocalDispatcherOutput(baseOutput());

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: legacyState,
    output,
  });

  assertEquals(reduced.status, "answered");
  assertEquals(
    (reduced.weekly_state?.weekly_flow_state as any).validation_unlock_status,
    "locked_until_weekly_complete",
  );
  assert(
    reduced.state_mutation_audit.server_owned_fields.includes(
      "weekly_adaptive_review.plan_patch",
    ),
  );
});

Deno.test("weekly local reducer preserves user constraints in conversation context", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "answer_weekly_question",
      weekly_intent: {
        kind: "detour_request",
        summary: "User wants a lighter week without chat mutation.",
      },
      handoff_updates: {
        status: "ready",
        requested_adjustment_summary:
          "Alleger la semaine prochaine, sans rien modifier depuis le chat.",
        revision_summary: "Garder uniquement les missions les plus utiles.",
        platform_destination: "Plan",
        scope: {
          kind: "whole_week",
          plan_id: null,
          plan_title: null,
          plan_item_ids: [],
          scope_summary: "Toute la semaine prochaine",
          needs_scope_clarification: false,
        },
      },
      visible_task: {
        kind: "qualify_solution_fit",
        instruction: "Qualifier le detour Plan sans le lancer.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(
    reduced.conversation_context?.handoff_data.requested_adjustment_summary,
    "Alleger la semaine prochaine, sans rien modifier depuis le chat.",
  );
  assertEquals(
    reduced.conversation_context?.handoff_data.executable_from_chat,
    false,
  );
  assertEquals(
    reduced.conversation_context?.handoff_data.requires_platform_confirmation,
    true,
  );
  assert(
    reduced.conversation_context?.do_not_say.includes("applique") === true,
  );
});

Deno.test("weekly local reducer lets user action status corrections override projection", () => {
  const state = {
    ...weeklyState(),
    weekly_progress_review: {
      week_start_date: "2026-06-01",
      week_end_date: "2026-06-07",
      transformations: [{
        transformation_id: "transformation-1",
        plan_id: "plan-1",
        plan_title: "Plan principal",
        actions: [{
          plan_id: "plan-1",
          plan_title: "Plan principal",
          plan_item_id: "item-rangement",
          occurrence_id: "occ-rangement",
          title: "Rangement du soir",
          family: "habit",
          deviation: "done",
          daily_evidence: { reason_text: "projection initiale done" },
        }],
      }],
    },
  };
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      action_status_updates: [{
        plan_item_id: "item-rangement",
        occurrence_id: "occ-rangement",
        title: "Rangement du soir",
        corrected_status: "partial",
        user_evidence: "je l'ai fait trois jours puis j'ai relache",
        source_turn_summary: "rangement partiel",
      }],
      visible_task: {
        kind: "weekly_synthesis",
        instruction: "Synthetiser sans embellir les statuts.",
      },
    }),
  );

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: state,
    output,
  });

  assertEquals(
    reduced.conversation_context?.item_summaries[0].status,
    "partial",
  );
  assertEquals(
    (reduced.weekly_state?.weekly_flow_state as any)
      .user_corrected_action_statuses[0].corrected_status,
    "partial",
  );
  assertEquals(
    (reduced.weekly_state?.weekly_adaptive_review as any)
      .item_decisions[0].current_week_status,
    "partial",
  );
});

Deno.test("weekly local reducer blocks solution fit before global progress gate", () => {
  const state = weeklyState();
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      weekly_gates: {
        week_experience_status: "complete",
        action_review_status: "complete",
        global_progress_status: "missing",
        felt_progress_status: "missing",
        solution_fit_status: "missing",
        synthesis_status: "missing",
        closure_status: "missing",
      },
      visible_task: {
        kind: "qualify_solution_fit",
        instruction: "Qualifier une solution trop tot.",
      },
      state_updates: {
        status: "open",
        weekly_stage: "solution_fit",
        validation_unlock_status: "locked_until_weekly_complete",
        turn_count_increment: 1,
        close_after_visible: false,
      },
    }),
  );

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: state,
    output,
  });

  assertEquals(
    reduced.reason_code,
    "weekly_review_gate_order_requires_ask_global_progress_feeling",
  );
  assertEquals(reduced.visible_task, "ask_global_progress_feeling");
  assertEquals(
    (reduced.weekly_state?.weekly_flow_state as any).stage,
    "global_progress",
  );
  assertEquals(
    reduced.blocked_effects[0]?.reason_code,
    "weekly_review_gate_order_requires_ask_global_progress_feeling",
  );
});

Deno.test("weekly local reducer preserves post child flow revision before synthesis", () => {
  const state = {
    ...weeklyState(),
    weekly_flow_state: {
      ...weeklyState().weekly_flow_state,
      child_flow: {
        status: "completed",
        flow_id: "prepare_defense_card",
        reason: "Defense card detour delivered.",
        expected_return_focus: "weekly_synthesis_and_closure",
        result_summary: "platform_handoff_delivered",
        result_details: {
          executable_from_chat: false,
          platform_destination:
            "dans l'action concernée du Plan, section Cartes de défense",
        },
      },
      weekly_gates: {
        week_experience_status: "complete",
        action_review_status: "complete",
        global_progress_status: "complete",
        felt_progress_status: "complete",
        solution_fit_status: "complete",
        synthesis_status: "missing",
        closure_status: "missing",
      },
    },
  };
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      weekly_intent: {
        kind: "weekly_confirmation",
        summary:
          "User validates the defense draft and revises the platform wording.",
      },
      handoff_updates: {
        status: "delivered",
        requested_adjustment_summary: null,
        revision_summary:
          "Dire quand je rentre fatiguée et viser la douche avant la boîte.",
        platform_destination: "Plan",
        scope: {
          kind: "specific_item",
          plan_id: "plan-1",
          plan_title: "Plan principal",
          plan_item_ids: ["item-1"],
          scope_summary: "carte defense",
          needs_scope_clarification: false,
        },
      },
      weekly_gates: {
        week_experience_status: "complete",
        action_review_status: "complete",
        global_progress_status: "complete",
        felt_progress_status: "complete",
        solution_fit_status: "complete",
        synthesis_status: "missing",
        closure_status: "missing",
      },
      visible_task: {
        kind: "weekly_synthesis",
        instruction: "Synthese trop rapide apres revision.",
      },
      state_updates: {
        status: "open",
        weekly_stage: "synthesis",
        validation_unlock_status: "locked_until_weekly_complete",
        turn_count_increment: 1,
        close_after_visible: false,
      },
    }),
  );

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: state,
    output,
  });

  assertEquals(
    reduced.reason_code,
    "weekly_review_gate_order_requires_return_from_child_flow",
  );
  assertEquals(reduced.visible_task, "return_from_child_flow");
  assertEquals(
    (reduced.weekly_state?.weekly_flow_state as any).child_flow.result_details
      .revision_summary,
    "Dire quand je rentre fatiguée et viser la douche avant la boîte.",
  );
  assertEquals(
    (reduced.conversation_context?.handoff_data as any).revision_summary,
    "Dire quand je rentre fatiguée et viser la douche avant la boîte.",
  );
  assertEquals(
    (reduced.weekly_state?.weekly_flow_state as any).child_flow.result_details
      .return_acknowledged,
    true,
  );
});

Deno.test("weekly local reducer allows synthesis after child return acknowledged", () => {
  const state = {
    ...weeklyState(),
    weekly_flow_state: {
      ...weeklyState().weekly_flow_state,
      child_flow: {
        status: "completed",
        flow_id: "prepare_defense_card",
        reason: "Defense card detour delivered.",
        expected_return_focus: "weekly_synthesis_and_closure",
        result_summary: "platform_handoff_delivered",
        result_details: {
          executable_from_chat: false,
          return_acknowledged: true,
          revision_summary:
            "Clés dans la salle de bain, douche cinq minutes, phrase rituelle.",
        },
      },
      weekly_gates: {
        week_experience_status: "complete",
        action_review_status: "complete",
        global_progress_status: "complete",
        felt_progress_status: "complete",
        solution_fit_status: "complete",
        synthesis_status: "missing",
        closure_status: "missing",
      },
    },
  };
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      weekly_intent: {
        kind: "weekly_confirmation",
        summary: "User asks to synthesize after the child flow return.",
      },
      weekly_gates: {
        week_experience_status: "complete",
        action_review_status: "complete",
        global_progress_status: "complete",
        felt_progress_status: "complete",
        solution_fit_status: "complete",
        synthesis_status: "captured",
        closure_status: "missing",
      },
      visible_task: {
        kind: "weekly_synthesis",
        instruction: "Synthese apres retour child flow.",
      },
      state_updates: {
        status: "open",
        weekly_stage: "synthesis",
        validation_unlock_status: "locked_until_weekly_complete",
        turn_count_increment: 1,
        close_after_visible: false,
      },
    }),
  );

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: state,
    output,
  });

  assertEquals(
    reduced.reason_code,
    "weekly_review_local_answer_weekly_question",
  );
  assertEquals(reduced.visible_task, "weekly_synthesis");
  assertEquals(reduced.blocked_effects, []);
});

Deno.test("weekly visible prompt excludes raw user message and recent messages", () => {
  const prompt = buildWeeklyReviewVisibleAgentUserPrompt({
    user_id: "user-weekly-visible",
    request_id: "request-weekly-visible",
    stage: "qualify_solution_fit",
    user_message: "raw weekly answer that must not be injected",
    recent_messages: [{ role: "assistant", content: "raw weekly history" }],
    conversation_context: {
      state_summary: "Weekly state summarized by reducer.",
      user_words: ["fatigue mais progression legere"],
      field_or_stage: "qualify_solution_fit",
      known_values: {},
      missing_or_weak_values: [],
      selected_candidate: {},
      handoff_data: {
        status: "none",
        requested_adjustment_summary: null,
        revision_summary: null,
        platform_destination: null,
        scope: {
          kind: "none",
          plan_id: null,
          plan_title: null,
          plan_item_ids: [],
          scope_summary: null,
          needs_scope_clarification: false,
        },
      },
      next_focus: "qualify_solution_fit",
      tone_constraints: ["court"],
      do_not_say: [],
      context_summary: "Lecture weekly depuis conversation_context.",
      evidence_used: ["weekly_review.local_dispatcher"],
      max_questions: 1,
    } as any,
  });
  const parsed = JSON.parse(prompt);

  assertEquals(Object.keys(parsed).sort(), [
    "conversation_context",
    "hard_constraints",
    "required_json_shape",
    "stage",
    "task",
  ]);
  assert(!prompt.includes("current_user_message"));
  assert(!prompt.includes("recent_messages"));
  assert(!prompt.includes("raw weekly answer"));
  assert(!prompt.includes("raw weekly history"));
});

Deno.test("weekly visible context carries strict action review and synthesis constraints", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      visible_task: {
        kind: "review_action_gaps",
        instruction: "Review action statuses before global progress.",
      },
      weekly_gates: {
        week_experience_status: "captured",
        action_review_status: "captured",
        global_progress_status: "missing",
        felt_progress_status: "missing",
        solution_fit_status: "missing",
        synthesis_status: "missing",
        closure_status: "missing",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  const prompt = buildWeeklyReviewVisibleAgentUserPrompt({
    user_id: "user-weekly-visible",
    request_id: "request-weekly-visible",
    stage: "review_action_gaps",
    conversation_context: reduced.conversation_context!,
  });
  const parsed = JSON.parse(prompt);
  assertEquals(
    parsed.conversation_context.known_values
      .action_review_before_global_progress_required,
    true,
  );
  assertEquals(
    parsed.conversation_context.known_values
      .partial_statuses_must_remain_partial,
    true,
  );
  assert(
    parsed.conversation_context.tone_constraints.includes(
      "do_not_use_gendered_adjectives_unless_conversation_context_confirms_gender",
    ),
  );
});

Deno.test("weekly local reducer blocks global exit without memo", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "exit_to_global_dispatcher",
      weekly_intent: {
        kind: "explicit_tool_request",
        summary: "User asks for a card.",
      },
      exit_memo: {
        needed: false,
        reason: "none",
        user_intent_summary: null,
        local_flow_context: {
          skill_id: "weekly_adaptive_review_v1",
          weekly_stage: null,
          week_strategy: null,
          last_weekly_question: null,
          last_visible_summary: null,
          last_handoff_summary: null,
          validation_unlock_status: null,
          committed_effects: [],
        },
        handoff_hint_for_global_dispatcher: {
          likely_intent: "prepare_attack_card",
          why: null,
          constraints: [],
        },
      },
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "Exit.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "blocked");
  assertEquals(reduced.reason_code, "weekly_review_note_information_required");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.tool_execution, "blocked");
});

Deno.test("weekly local reducer blocks local handoff without note_information", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "handoff_to_local_flow",
      target_dispatcher: "prepare_attack_card",
      weekly_intent: {
        kind: "explicit_tool_request",
        summary: "User asks for an attack card.",
      },
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "Handoff.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "blocked");
  assertEquals(reduced.reason_code, "weekly_review_note_information_required");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.target_dispatcher, "prepare_attack_card");
});

Deno.test("weekly local reducer keeps tool hypothesis in weekly until user confirms fit", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "handoff_to_local_flow",
      target_dispatcher: "prepare_attack_card",
      weekly_intent: {
        kind: "explicit_tool_request",
        summary: "Attack card may help but fit is not confirmed yet.",
      },
      detour_candidate: {
        kind: "attack_card",
        source_stage: "action_blocker",
        target_action_or_plan: "action du matin",
        fit_hypothesis: "Peut-etre un probleme de demarrage.",
        readiness: "offer",
        user_consent: false,
        scope: { action: "action du matin" },
        return_focus: "Revenir au weekly.",
      },
      note_information: noteInformation("prepare_attack_card"),
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "Legacy eager handoff.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "answered");
  assertEquals(
    reduced.reason_code,
    "weekly_review_child_handoff_requires_user_confirmed_fit",
  );
  assertEquals(reduced.visible_task, "qualify_attack_or_defense_fit");
  assertEquals(reduced.target_dispatcher, "none");
  assertEquals(reduced.tool_execution, "blocked");
});

Deno.test("weekly local reducer requires action focus before card handoff", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "handoff_to_local_flow",
      target_dispatcher: "prepare_defense_card",
      weekly_intent: {
        kind: "explicit_tool_request",
        summary: "Defense card requested without target action.",
      },
      detour_candidate: {
        kind: "defense_card",
        source_stage: "action_blocker",
        target_action_or_plan: null,
        fit_hypothesis: "Moment critique probable.",
        readiness: "user_confirmed",
        user_consent: true,
        scope: {},
        return_focus: "Revenir au weekly.",
      },
      note_information: noteInformation("prepare_defense_card"),
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "Handoff.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "answered");
  assertEquals(
    reduced.reason_code,
    "weekly_review_card_handoff_requires_action_focus",
  );
  assertEquals(reduced.visible_task, "explore_action_blocker");
});

Deno.test("weekly local reducer requires clear scope before adjust plan child flow", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "handoff_to_local_flow",
      target_dispatcher: "adjust_plan_item",
      weekly_intent: {
        kind: "detour_request",
        summary: "User wants a Plan change but scope is ambiguous.",
      },
      handoff_updates: {
        status: "requested",
        requested_adjustment_summary: "Alleger le Plan.",
        revision_summary: null,
        platform_destination: "Plan",
        scope: {
          kind: "ambiguous",
          plan_id: null,
          plan_title: null,
          plan_item_ids: [],
          scope_summary: null,
          needs_scope_clarification: true,
        },
      },
      detour_candidate: {
        kind: "adjust_plan_item",
        source_stage: "solution_fit",
        target_action_or_plan: null,
        fit_hypothesis: "Demande explicite mais perimetre flou.",
        readiness: "user_confirmed",
        user_consent: true,
        scope: { kind: "ambiguous" },
        return_focus: "Revenir au weekly.",
      },
      note_information: noteInformation("adjust_plan_item"),
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "Handoff.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "answered");
  assertEquals(
    reduced.reason_code,
    "weekly_review_adjust_plan_detour_requires_clear_scope",
  );
  assertEquals(reduced.visible_task, "qualify_solution_fit");
});

Deno.test("weekly local reducer hands off to attack card locally with note_information", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "handoff_to_local_flow",
      target_dispatcher: "prepare_attack_card",
      weekly_intent: {
        kind: "explicit_tool_request",
        summary: "User asks for an attack card.",
      },
      detour_candidate: {
        kind: "attack_card",
        source_stage: "action_blocker",
        target_action_or_plan: "action du matin",
        fit_hypothesis: "Le user veut faciliter le demarrage de l'action.",
        readiness: "user_confirmed",
        user_consent: true,
        scope: { action: "action du matin" },
        return_focus: "Revenir au weekly pour synthese.",
      },
      note_information: noteInformation("prepare_attack_card"),
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "Handoff.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "handoff_to_local_flow");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.target_dispatcher, "prepare_attack_card");
  assertEquals(
    reduced.note_information?.target_dispatcher,
    "prepare_attack_card",
  );
  assertEquals(reduced.weekly_state, null);
});

Deno.test("weekly local runtime suspends parent weekly during child flow handoff", async () => {
  const runtime = await runWeeklyReviewLocalRuntime({
    supabase: {} as any,
    userId: "user-weekly-child",
    tempMemory: { __active_skill_state: weeklyState() },
    activeSkillState: weeklyState(),
    userMessage: "Ok, allege l'action du matin pour cette semaine.",
    history: [],
    dispatcher: async () =>
      normalizeWeeklyReviewLocalDispatcherOutput(
        baseOutput({
          flow_action: "handoff_to_local_flow",
          target_dispatcher: "adjust_plan_item",
          weekly_intent: {
            kind: "detour_request",
            summary: "User asks for a Plan adjustment as weekly detour.",
          },
          human_signal_updates: {
            objective_delta: null,
            felt_progress: "frustrated",
            felt_state: "tired_but_ok",
            dominant_blocker_confirmation: "confirmed",
            user_summary: "action du matin trop fragile",
          },
          handoff_updates: {
            status: "requested",
            requested_adjustment_summary:
              "Alleger l'action du matin cette semaine.",
            revision_summary: null,
            platform_destination: "Plan",
            scope: {
              kind: "specific_item",
              plan_id: "plan-1",
              plan_title: "Plan principal",
              plan_item_ids: ["item-1"],
              scope_summary: "action du matin",
              needs_scope_clarification: false,
            },
          },
          weekly_gates: {
            week_experience_status: "complete",
            action_review_status: "complete",
            global_progress_status: "complete",
            felt_progress_status: "complete",
            solution_fit_status: "complete",
            synthesis_status: "missing",
            closure_status: "missing",
          },
          detour_candidate: {
            kind: "adjust_plan_item",
            source_stage: "solution_fit",
            target_action_or_plan: "action du matin",
            fit_hypothesis:
              "Le user demande explicitement d'alleger cette action.",
            readiness: "user_confirmed",
            user_consent: true,
            scope: {
              kind: "specific_item",
              plan_item_ids: ["item-1"],
              scope_summary: "action du matin",
            },
            return_focus: "Revenir au weekly pour synthese et cloture.",
          },
          note_information: noteInformation("adjust_plan_item"),
          visible_task: {
            kind: "exit_or_cancel",
            instruction: "Launch child flow.",
          },
        }),
      ),
  });

  assertEquals(
    runtime?.toolSkillRun.reason_code,
    "weekly_review_local_handoff_to_local_flow",
  );
  const suspended = (runtime?.nextTempMemory as any).__suspended_flow_v1;
  assertEquals(suspended.owner, "conversation_skill");
  assertEquals(suspended.target_flow, "adjust_plan_item");
  assertEquals(suspended.state_snapshot.skill_id, "weekly_adaptive_review_v1");
  assertEquals(
    suspended.state_snapshot.weekly_flow_state.child_flow.status,
    "active",
  );
  assertEquals(
    suspended.state_snapshot.weekly_flow_state.child_flow.flow_id,
    "adjust_plan_item",
  );
});

Deno.test("weekly local runtime surfaces dispatcher timeout diagnostics", async () => {
  const runtime = await runWeeklyReviewLocalRuntime({
    supabase: {} as any,
    userId: "user-weekly-timeout",
    tempMemory: { __active_skill_state: weeklyState() },
    activeSkillState: weeklyState(),
    userMessage: "Action par action, voici un bilan dense.",
    history: [],
    dispatcher: async () => {
      const error = new Error("Signal timed out.");
      (error as any).name = "TimeoutError";
      throw error;
    },
  });
  const run = runtime?.toolSkillRun as any;
  assertEquals(run?.status, "blocked");
  assertEquals(run?.reason_code, "weekly_review_local_dispatcher_failed");
  assertEquals(run?.dispatcher_failure_kind, "timeout");
  assertEquals(run?.dispatcher_error_name, "TimeoutError");
  assertEquals(
    run?.blocked_effects?.[0]?.reason_code,
    "local_dispatcher_timeout",
  );
});

Deno.test("weekly local reducer exits to global only with note_information", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "exit_to_global_dispatcher",
      target_dispatcher: "global",
      weekly_intent: {
        kind: "off_topic",
        summary: "User switches to an unrelated prioritization topic.",
      },
      note_information: noteInformation("global", "topic_change"),
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "Exit to global.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "exit");
  assertEquals(reduced.exit_to_global_dispatcher, true);
  assertEquals(reduced.target_dispatcher, "global");
  assertEquals(reduced.note_information?.target_dispatcher, "global");
});

Deno.test("weekly local reducer routes safety without global dispatcher", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "safety_preempt",
      target_dispatcher: "safety_crisis",
      risk_score: 8,
      weekly_intent: {
        kind: "safety",
        summary: "User message raises safety risk.",
      },
      note_information: noteInformation("safety_crisis", "safety"),
      visible_task: {
        kind: "safety",
        instruction: "Safety transition.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "safety");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.target_dispatcher, "safety_crisis");
  assertEquals(reduced.note_information?.target_dispatcher, "safety_crisis");
});

Deno.test("weekly local reducer does not exit when user continues weekly", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "answer_weekly_question",
      target_dispatcher: "global",
      weekly_intent: {
        kind: "weekly_answer",
        summary: "User asks to continue the weekly reading.",
      },
      exit_memo: {
        needed: true,
        reason: "topic_change",
        user_intent_summary: "memo should not force exit",
        local_flow_context: {
          skill_id: "weekly_adaptive_review_v1",
          weekly_stage: "strategy_ready",
          week_strategy: null,
          last_weekly_question: null,
          last_visible_summary: null,
          last_handoff_summary: null,
          validation_unlock_status: null,
          committed_effects: [],
        },
        handoff_hint_for_global_dispatcher: {
          likely_intent: "normal_coaching",
          why: "memo should not own routing",
          constraints: [],
        },
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "answered");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.target_dispatcher, "none");
});

Deno.test("weekly local reducer treats tool mention hypothesis as weekly continuation", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "answer_weekly_question",
      target_dispatcher: "prepare_attack_card",
      weekly_intent: {
        kind: "weekly_answer",
        summary:
          "User explores whether an attack card could help but keeps discussing the weekly blocker.",
      },
      visible_task: {
        kind: "review_action_gaps",
        instruction: "Continue weekly; do not launch child flow yet.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "answered");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.target_dispatcher, "none");
  assertEquals(reduced.weekly_state?.status, "open");
});

Deno.test("weekly local reducer exits to global for explicit stop", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "exit_to_global_dispatcher",
      target_dispatcher: "global",
      weekly_intent: {
        kind: "stop",
        summary: "User wants to stop the weekly.",
      },
      note_information: noteInformation("global", "topic_change"),
      state_updates: {
        status: "exit_to_global",
        weekly_stage: "closing",
        validation_unlock_status: "locked_until_weekly_complete",
        turn_count_increment: 1,
        close_after_visible: true,
      },
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "Exit to global.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "exit");
  assertEquals(reduced.exit_to_global_dispatcher, true);
  assertEquals(reduced.target_dispatcher, "global");
  assertEquals(reduced.visible_task, "exit_or_cancel");
  assertEquals(reduced.weekly_state, null);
  assertEquals(reduced.note_information?.target_dispatcher, "global");
});

Deno.test("weekly local completion is blocked until synthesis and closure", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "complete_weekly_no_change",
      weekly_intent: {
        kind: "weekly_confirmation",
        summary: "User confirms no change is needed.",
      },
      state_updates: {
        status: "completed",
        weekly_stage: "closing",
        validation_unlock_status: "available",
        turn_count_increment: 1,
        close_after_visible: true,
      },
      visible_task: {
        kind: "weekly_closure",
        instruction: "Close weekly.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "answered");
  assertEquals(
    reduced.reason_code,
    "weekly_review_completion_requires_synthesis",
  );
  assertEquals(reduced.visible_task, "weekly_synthesis");
  assertEquals(reduced.weekly_state?.status, "open");
  assertEquals(
    (reduced.weekly_state?.weekly_flow_state as any).validation_unlock_status,
    "locked_until_weekly_complete",
  );
});

Deno.test("weekly local closure unlocks validation and stays non executable", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "complete_weekly_no_change",
      weekly_intent: {
        kind: "weekly_confirmation",
        summary: "Weekly synthesis and closure are complete.",
      },
      weekly_gates: {
        week_experience_status: "complete",
        action_review_status: "complete",
        global_progress_status: "complete",
        felt_progress_status: "complete",
        solution_fit_status: "complete",
        synthesis_status: "complete",
        closure_status: "complete",
      },
      state_updates: {
        status: "completed",
        weekly_stage: "closure",
        validation_unlock_status: "available",
        turn_count_increment: 1,
        close_after_visible: true,
      },
      visible_task: {
        kind: "weekly_closure",
        instruction: "Close weekly.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "closed");
  assertEquals(reduced.tool_execution, "none");
  assertEquals(reduced.visible_task, "weekly_closure");
  assertEquals(reduced.weekly_state?.status, "completed");
  assertEquals(
    (reduced.weekly_state?.weekly_flow_state as any).validation_unlock_status,
    "available",
  );
  assertEquals(
    (reduced.weekly_state?.validation_unlock as any).status,
    "available",
  );
});

Deno.test("weekly local reducer closes same turn when user confirms final closure", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "confirm_weekly_diagnostic",
      weekly_intent: {
        kind: "weekly_confirmation",
        summary: "User confirms the weekly can be closed.",
      },
      weekly_gates: {
        week_experience_status: "complete",
        action_review_status: "complete",
        global_progress_status: "complete",
        felt_progress_status: "complete",
        solution_fit_status: "complete",
        synthesis_status: "complete",
        closure_status: "missing",
      },
      state_updates: {
        status: "open",
        weekly_stage: "closure",
        validation_unlock_status: "locked_until_weekly_complete",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "weekly_closure",
        instruction: "Close weekly after confirmation.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "closed");
  assertEquals(reduced.weekly_state?.status, "completed");
  assertEquals(
    (reduced.weekly_state?.weekly_flow_state as any).weekly_gates
      .closure_status,
    "complete",
  );
  assertEquals(
    (reduced.weekly_state?.validation_unlock as any).status,
    "available",
  );
});
