import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildDailyActionReviewActionIntelligence,
  buildDailyActionReviewInstruction,
  buildInitialDailyActionReviewState,
  dailyActionReviewFocusTargets,
  dailyActionReviewOpeningHasForbiddenCoaching,
  type DailyActionReviewTarget,
  runDailyActionReviewFollowupSkill,
  runDailyActionReviewSkill,
} from "./daily_action_review.ts";
import {
  dailyReviewEffectsFullyCommitted,
  executeDailyReviewEffectPlan,
} from "./daily_action_review/executor.ts";
import {
  dailyReviewFinalMessageRequiresCommit,
  renderDailyReviewCommitFailureMessage,
} from "./daily_action_review/renderer.ts";
import type { DailyReviewEffectPlan } from "./daily_action_review/contract.ts";

function target(
  id: string,
  planId: string,
  title: string,
  dimension: "habits" | "missions" | "clarifications",
): DailyActionReviewTarget {
  return {
    occurrence_id: id,
    cycle_id: "cycle",
    transformation_id: "transformation",
    plan_id: planId,
    plan_item_id: `item-${id}`,
    title,
    dimension,
    kind: dimension === "habits"
      ? "habit"
      : dimension === "missions"
      ? "task"
      : "clarification",
    tracking_type: "boolean",
    planned_day: "mon",
    original_planned_day: null,
    week_start_date: "2026-05-11",
  };
}

Deno.test("daily action review initial state groups four actions by same plan", () => {
  const targets = [
    target("a1", "plan-a", "Session focus", "habits"),
    target("b1", "plan-b", "Marche rapide", "habits"),
    target("a2", "plan-a", "Parking a idees", "missions"),
    target("b2", "plan-b", "Clarifier le blocage", "clarifications"),
  ];

  const state = buildInitialDailyActionReviewState(targets);

  assertEquals(state.current_focus_occurrence_ids, ["a1", "a2"]);
  assertEquals(state.remaining_occurrence_ids, ["b1", "b2"]);
  assertEquals(state.asked_occurrence_ids_history, [["a1", "a2"]]);
  assertEquals(
    dailyActionReviewFocusTargets(targets, state).map((item) =>
      item.occurrence_id
    ),
    ["a1", "a2"],
  );
});

Deno.test("daily action review selector handles one action, two actions, plans and type priority", () => {
  const one = [target("a1", "plan-a", "Session focus", "habits")];
  assertEquals(
    buildInitialDailyActionReviewState(one).current_focus_occurrence_ids,
    [
      "a1",
    ],
  );

  const two = [
    target("m1", "plan-a", "Mission", "missions"),
    target("h1", "plan-b", "Habitude", "habits"),
  ];
  assertEquals(
    buildInitialDailyActionReviewState(two).current_focus_occurrence_ids,
    [
      "h1",
      "m1",
    ],
  );

  const many = [
    target("c1", "plan-a", "Clarifier", "clarifications"),
    target("m1", "plan-b", "Mission", "missions"),
    target("h1", "plan-c", "Habitude", "habits"),
  ];
  assertEquals(
    buildInitialDailyActionReviewState(many).current_focus_occurrence_ids,
    [
      "h1",
      "m1",
    ],
  );
});

Deno.test("opening mentions only focus targets and forbids solution/tool language", () => {
  const targets = [
    target("a1", "plan-a", "Session focus", "habits"),
    target("a2", "plan-a", "Parking a idees", "missions"),
    target("b1", "plan-b", "Marche rapide", "habits"),
  ];
  const state = buildInitialDailyActionReviewState(targets);
  const focusTargets = dailyActionReviewFocusTargets(targets, state);
  const instruction = buildDailyActionReviewInstruction(focusTargets);

  assertStringIncludes(instruction, "Session focus");
  assertStringIncludes(instruction, "Parking a idees");
  assertEquals(instruction.includes("Marche rapide"), false);
  assertStringIncludes(instruction, "une seule question principale");
  assertStringIncludes(instruction, "Ne propose pas de solution");
  assertEquals(
    dailyActionReviewOpeningHasForbiddenCoaching(
      "Je te propose une potion pour ajuster le plan.",
    ),
    true,
  );
});

Deno.test("daily action review carries bounded action intelligence in skill state", async () => {
  const targets = [
    target("a1", "plan-a", "Session focus", "habits"),
  ];
  const intelligence = buildDailyActionReviewActionIntelligence({
    targets,
    memoryItems: [
      {
        id: "mem-recent",
        kind: "action_observation",
        content_text: "Session focus a ete ratee hier pour fatigue.",
        status: "active",
        sensitivity_level: "normal",
        action_link: {
          plan_item_id: "item-a1",
          aggregation_kind: "single_occurrence",
        },
      },
      {
        id: "mem-pattern",
        kind: "action_observation",
        content_text: "Le demarrage de Session focus bloque souvent.",
        status: "active",
        sensitivity_level: "normal",
        action_link: {
          plan_item_id: "item-a1",
          aggregation_kind: "possible_pattern",
        },
      },
      {
        id: "mem-sensitive",
        kind: "action_observation",
        content_text: "Detail sensible a ne pas injecter.",
        status: "active",
        sensitivity_level: "sensitive",
        action_link: {
          plan_item_id: "item-a1",
          aggregation_kind: "single_occurrence",
        },
      },
    ],
  });
  const previousState = buildInitialDailyActionReviewState(targets, {
    actionIntelligenceByOccurrenceId: intelligence,
  });
  let capturedUserPrompt = "";

  const result = await runDailyActionReviewSkill({
    text: "Oui je l'ai faite.",
    targets,
    previousState,
    llmRunner: async ({ userPrompt }) => {
      capturedUserPrompt = userPrompt;
      return {
        status: "complete",
        current_focus_occurrence_ids: [],
        remaining_occurrence_ids: [],
        asked_occurrence_ids_history: [["a1"]],
        items: {
          a1: {
            outcome: "completed",
            reason_category: "none",
            reason_text: null,
            still_relevant: "unknown",
            evidence_text: "Oui je l'ai faite.",
            matched_user_text: "Oui je l'ai faite.",
            confidence: "high",
            missing_slots: [],
          },
        },
        next_question: null,
        next_question_targets: [],
        generated_user_message: "Note, session focus faite.",
        should_apply_effects: true,
        stop_reason: "all_required_slots_filled",
      };
    },
  });

  assertEquals(
    result.state.action_intelligence_by_occurrence_id.a1
      .recent_observations.length,
    1,
  );
  assertEquals(
    result.state.action_intelligence_by_occurrence_id.a1
      .recurring_patterns.length,
    1,
  );
  assertEquals(capturedUserPrompt.includes("Detail sensible"), false);
  assertEquals(
    capturedUserPrompt.includes("action_intelligence_by_occurrence_id"),
    true,
  );
});

Deno.test("daily action review skill accepts AI-filled JSON without regex classification", async () => {
  const targets = [
    target("a1", "plan-a", "Session focus", "habits"),
    target("a2", "plan-a", "Parking a idees", "missions"),
  ];
  const previousState = buildInitialDailyActionReviewState(targets);

  const result = await runDailyActionReviewSkill({
    text:
      "J'ai fait la session focus. Pour le parking, je l'ai commence mais je me suis bloque sur la structure.",
    targets,
    previousState,
    llmRunner: async () => ({
      status: "complete",
      current_focus_occurrence_ids: ["a1", "a2"],
      remaining_occurrence_ids: [],
      asked_occurrence_ids_history: [["a1", "a2"]],
      items: {
        a1: {
          outcome: "completed",
          reason_category: "none",
          reason_text: null,
          still_relevant: "unknown",
          evidence_text: "J'ai fait la session focus",
          matched_user_text: "J'ai fait la session focus",
          confidence: "high",
          missing_slots: [],
        },
        a2: {
          outcome: "partial",
          reason_category: "too_hard",
          reason_text: "je me suis bloque sur la structure",
          still_relevant: true,
          evidence_text: "je l'ai commence",
          matched_user_text:
            "Pour le parking, je l'ai commence mais je me suis bloque sur la structure.",
          confidence: "high",
          missing_slots: [],
        },
      },
      next_question: null,
      next_question_targets: [],
      generated_user_message:
        "C'est note pour le daily : session focus faite, parking a idees commence avec un blocage sur la structure.",
      should_apply_effects: true,
      stop_reason: "all_required_slots_filled",
    }),
  });

  assertEquals(result.shouldApplyEffects, true);
  assertEquals(result.missingOccurrenceIds, []);
  assertEquals(result.state.items.a1.outcome, "completed");
  assertEquals(result.state.items.a2.outcome, "partial");
  assertEquals(result.state.items.a2.reason_category, "too_hard");
});

Deno.test("daily action review skill continues with next same-plan group", async () => {
  const targets = [
    target("a1", "plan-a", "Session focus", "habits"),
    target("a2", "plan-a", "Parking a idees", "missions"),
    target("b1", "plan-b", "Marche rapide", "habits"),
    target("b2", "plan-b", "Clarifier le blocage", "clarifications"),
  ];
  const previousState = buildInitialDailyActionReviewState(targets);

  const result = await runDailyActionReviewSkill({
    text: "J'ai fait la focus, et le parking est commence.",
    targets,
    previousState,
    llmRunner: async () => ({
      status: "collecting",
      current_focus_occurrence_ids: ["b1", "b2"],
      remaining_occurrence_ids: [],
      asked_occurrence_ids_history: [["a1", "a2"], ["b1", "b2"]],
      items: {
        a1: {
          outcome: "completed",
          reason_category: "none",
          reason_text: null,
          still_relevant: "unknown",
          evidence_text: "J'ai fait la focus",
          matched_user_text: "J'ai fait la focus",
          confidence: "high",
          missing_slots: [],
        },
        a2: {
          outcome: "partial",
          reason_category: "unclear",
          reason_text: "le parking est commence",
          still_relevant: true,
          evidence_text: "le parking est commence",
          matched_user_text: "le parking est commence",
          confidence: "medium",
          missing_slots: [],
        },
        b1: {
          outcome: null,
          reason_category: null,
          reason_text: null,
          still_relevant: "unknown",
          evidence_text: null,
          matched_user_text: null,
          confidence: "low",
          missing_slots: ["outcome"],
        },
        b2: {
          outcome: null,
          reason_category: null,
          reason_text: null,
          still_relevant: "unknown",
          evidence_text: null,
          matched_user_text: null,
          confidence: "low",
          missing_slots: ["outcome"],
        },
      },
      next_question:
        "Et cote plan B, pour Marche rapide et Clarifier le blocage, ca a donne quoi ?",
      next_question_targets: ["b1", "b2"],
      generated_user_message:
        "Et cote plan B, pour Marche rapide et Clarifier le blocage, ca a donne quoi ?",
      should_apply_effects: false,
      stop_reason: null,
    }),
  });

  assertEquals(result.shouldApplyEffects, false);
  assertEquals(result.nextQuestion?.includes("plan B"), true);
  assertEquals(result.state.current_focus_occurrence_ids, ["b1", "b2"]);
  assertEquals(result.state.next_question_targets, ["b1", "b2"]);
});

Deno.test("daily action review skill blocks missed action until report confirmation", async () => {
  const targets = [
    target("a1", "plan-a", "Partager un point positif", "habits"),
    target("a2", "plan-a", "Convenir d'un signal de pause", "missions"),
  ];
  const previousState = buildInitialDailyActionReviewState(targets);

  const result = await runDailyActionReviewSkill({
    text:
      "J'ai partage le point positif. Le signal de pause, non, j'ai eu peur de relancer une tension.",
    targets,
    previousState,
    llmRunner: async () => ({
      status: "complete",
      current_focus_occurrence_ids: [],
      remaining_occurrence_ids: [],
      asked_occurrence_ids_history: [["a1", "a2"]],
      items: {
        a1: {
          outcome: "completed",
          reason_category: "none",
          reason_text: null,
          still_relevant: "unknown",
          evidence_text: "J'ai partage le point positif",
          matched_user_text: "J'ai partage le point positif",
          confidence: "high",
          missing_slots: [],
        },
        a2: {
          outcome: "missed",
          reason_category: "emotional",
          reason_text: "j'ai eu peur de relancer une tension",
          still_relevant: "unknown",
          evidence_text:
            "Le signal de pause, non, j'ai eu peur de relancer une tension.",
          matched_user_text:
            "Le signal de pause, non, j'ai eu peur de relancer une tension.",
          confidence: "high",
          missing_slots: [],
        },
      },
      next_question:
        "Tu veux qu'on reporte Convenir d'un signal de pause a demain ?",
      next_question_targets: ["a2"],
      generated_user_message:
        "Tu veux qu'on reporte Convenir d'un signal de pause a demain ?",
      should_apply_effects: true,
      stop_reason: "all_required_slots_filled",
    }),
  });

  assertEquals(result.shouldApplyEffects, false);
  assertEquals(result.missingOccurrenceIds, ["a2"]);
  assertEquals(result.state.status, "needs_clarification");
  assertEquals(result.state.stop_reason, null);
  assertEquals(result.state.items.a2.missing_slots, ["still_relevant"]);
});

Deno.test("daily action review skill accepts report confirmation for one missed action", async () => {
  const targets = [
    target("a1", "plan-a", "Session focus", "habits"),
    target("a2", "plan-a", "Bloquer les creneaux", "missions"),
  ];
  const previousState = buildInitialDailyActionReviewState(targets);
  previousState.items.a1.outcome = "completed";
  previousState.items.a1.reason_category = "none";
  previousState.items.a1.evidence_text = "Session focus faite.";
  previousState.items.a1.confidence = "high";
  previousState.items.a1.missing_slots = [];
  previousState.items.a2.outcome = "missed";
  previousState.items.a2.reason_category = "fatigue";
  previousState.items.a2.reason_text = "trop sature";
  previousState.items.a2.evidence_text = "Bloquer les creneaux non fait.";
  previousState.items.a2.confidence = "high";
  previousState.items.a2.missing_slots = ["still_relevant"];
  previousState.next_question =
    'Tu veux qu\'on reporte "Bloquer les creneaux" à demain ?';
  previousState.next_question_targets = ["a2"];
  previousState.current_focus_occurrence_ids = ["a2"];
  previousState.should_apply_effects = false;

  const result = await runDailyActionReviewSkill({
    text: "Oui, reporte-le à demain.",
    targets,
    previousState,
    llmRunner: async () => ({
      status: "complete",
      current_focus_occurrence_ids: [],
      remaining_occurrence_ids: [],
      asked_occurrence_ids_history: [["a1", "a2"]],
      items: {
        a1: {
          outcome: "completed",
          reason_category: "none",
          reason_text: null,
          still_relevant: "unknown",
          evidence_text: null,
          matched_user_text: null,
          confidence: "high",
          missing_slots: [],
        },
        a2: {
          outcome: "missed",
          reason_category: "fatigue",
          reason_text: "trop sature",
          still_relevant: true,
          evidence_text: null,
          matched_user_text: "Oui, reporte-le à demain.",
          confidence: "high",
          missing_slots: [],
        },
      },
      next_question: null,
      next_question_targets: [],
      generated_user_message:
        "C'est note : session focus faite, Bloquer les creneaux non faite et reportee a demain.",
      should_apply_effects: true,
      stop_reason: "all_required_slots_filled",
    }),
  });

  assertEquals(result.shouldApplyEffects, true);
  assertEquals(result.missingOccurrenceIds, []);
  assertEquals(result.stillRelevantByOccurrenceId.a2, true);
  assertEquals(result.state.items.a2.missing_slots, []);
  assertEquals(
    result.generatedUserMessage?.includes("Bloquer les creneaux"),
    true,
  );
});

Deno.test("completed single action applies explicit effect plan", async () => {
  const targets = [target("a1", "plan-a", "Session focus", "habits")];
  const previousState = buildInitialDailyActionReviewState(targets);

  const result = await runDailyActionReviewSkill({
    text: "Oui, session focus faite.",
    targets,
    previousState,
    llmRunner: async () => ({
      status: "complete",
      intent: "answer_review",
      current_focus_occurrence_ids: ["a1"],
      remaining_occurrence_ids: [],
      asked_occurrence_ids_history: [["a1"]],
      items: {
        a1: {
          outcome: "completed",
          reason_category: "none",
          reason_text: null,
          still_relevant: "unknown",
          evidence_text: "Oui, session focus faite.",
          matched_user_text: "Oui, session focus faite.",
          confidence: "high",
          missing_slots: [],
        },
      },
      next_question: null,
      next_question_targets: [],
      generated_user_message: "Session focus est prise en compte.",
      should_apply_effects: true,
      stop_reason: "all_required_slots_filled",
    }),
  });

  assertEquals(result.shouldApplyEffects, true);
  assertEquals(result.state.effect_plan.allowed, true);
  assertEquals(result.state.effect_plan.effects, [{
    type: "log_daily_action_review",
    occurrence_id: "a1",
    plan_item_id: "item-a1",
    outcome: "completed",
    reason_category: "none",
    reason_text: null,
    still_relevant: null,
    source: "daily_action_review_v1",
  }]);
});

Deno.test("daily review executor ignores disallowed effect plan", async () => {
  let writeCalled = false;
  const result = await executeDailyReviewEffectPlan({
    effect_plan: { allowed: false, effects: [] },
    writeEffect: async () => {
      writeCalled = true;
      return { entry_id: "entry-1" };
    },
  });

  assertEquals(writeCalled, false);
  assertEquals(result.committed_effects, []);
  assertEquals(result.failed_effects, []);
});

Deno.test("daily review executor returns committed effect after successful write", async () => {
  const effect_plan: DailyReviewEffectPlan = {
    allowed: true,
    effects: [{
      type: "log_daily_action_review",
      occurrence_id: "occ-1",
      plan_item_id: "item-1",
      outcome: "completed",
      reason_category: "none",
      reason_text: null,
      still_relevant: null,
      source: "daily_action_review_v1",
    }],
  };

  const result = await executeDailyReviewEffectPlan({
    effect_plan,
    writeEffect: async () => ({ entry_id: "entry-1" }),
  });

  assertEquals(result.failed_effects, []);
  assertEquals(result.committed_effects, [{
    type: "log_daily_action_review",
    occurrence_id: "occ-1",
    plan_item_id: "item-1",
    entry_id: "entry-1",
    outcome: "completed",
    reason_category: "none",
    source: "daily_action_review_v1",
    commit_status: "inserted",
  }]);
  assertEquals(dailyReviewEffectsFullyCommitted({ effect_plan, result }), true);
});

Deno.test("daily review executor records writer failure without committed effect", async () => {
  const effect_plan: DailyReviewEffectPlan = {
    allowed: true,
    effects: [{
      type: "log_daily_action_review",
      occurrence_id: "occ-1",
      plan_item_id: "item-1",
      outcome: "missed",
      reason_category: "fatigue",
      reason_text: "fatigue",
      still_relevant: true,
      source: "daily_action_review_v1",
    }],
  };

  const result = await executeDailyReviewEffectPlan({
    effect_plan,
    writeEffect: async () => {
      throw new Error("insert_failed");
    },
  });

  assertEquals(result.committed_effects, []);
  assertEquals(result.failed_effects, [{
    type: "log_daily_action_review",
    occurrence_id: "occ-1",
    plan_item_id: "item-1",
    error: "insert_failed",
  }]);
  assertEquals(
    renderDailyReviewCommitFailureMessage(result).includes("noté"),
    true,
  );
  assertEquals(
    dailyReviewEffectsFullyCommitted({ effect_plan, result }),
    false,
  );
});

Deno.test("daily review partial success does not claim all done", async () => {
  const effect_plan: DailyReviewEffectPlan = {
    allowed: true,
    effects: [
      {
        type: "log_daily_action_review",
        occurrence_id: "occ-1",
        plan_item_id: "item-1",
        outcome: "completed",
        reason_category: "none",
        reason_text: null,
        still_relevant: null,
        source: "daily_action_review_v1",
      },
      {
        type: "log_daily_action_review",
        occurrence_id: "occ-2",
        plan_item_id: "item-2",
        outcome: "partial",
        reason_category: "too_hard",
        reason_text: "trop dur",
        still_relevant: null,
        source: "daily_action_review_v1",
      },
    ],
  };

  const result = await executeDailyReviewEffectPlan({
    effect_plan,
    writeEffect: async (effect) => {
      if (effect.occurrence_id === "occ-2") throw new Error("insert_failed");
      return { entry_id: "entry-1" };
    },
  });

  assertEquals(result.committed_effects.length, 1);
  assertEquals(result.failed_effects.length, 1);
  assertEquals(
    dailyReviewEffectsFullyCommitted({ effect_plan, result }),
    false,
  );
  const message = dailyReviewFinalMessageRequiresCommit({
    message: "C'est noté, tout est enregistré.",
    effect_plan,
    result,
  });
  assertEquals(message?.includes("pas tout"), true);
});

Deno.test("daily review existing entry is explicit idempotent commit", async () => {
  const effect_plan: DailyReviewEffectPlan = {
    allowed: true,
    effects: [{
      type: "log_daily_action_review",
      occurrence_id: "occ-1",
      plan_item_id: "item-1",
      outcome: "completed",
      reason_category: "none",
      reason_text: null,
      still_relevant: null,
      source: "daily_action_review_v1",
    }],
  };
  let insertCalls = 0;
  const result = await executeDailyReviewEffectPlan({
    effect_plan,
    writeEffect: async () => {
      insertCalls += 1;
      return { entry_id: "existing-entry", commit_status: "already_existing" };
    },
  });

  assertEquals(insertCalls, 1);
  assertEquals(result.committed_effects[0].entry_id, "existing-entry");
  assertEquals(result.committed_effects[0].commit_status, "already_existing");
  assertEquals(dailyReviewEffectsFullyCommitted({ effect_plan, result }), true);
});

Deno.test("daily review final done language requires committed effect", () => {
  const message = dailyReviewFinalMessageRequiresCommit({
    message: "C'est noté pour Session focus.",
    effect_plan: { allowed: true, effects: [] },
    result: { committed_effects: [], failed_effects: [] },
  });

  assertEquals(message?.includes("C'est noté"), false);
  assertEquals(message?.includes("ne le marque pas comme noté"), true);
});

Deno.test("partial without reason requires clarification and no effect", async () => {
  const targets = [target("a1", "plan-a", "Parking a idees", "missions")];
  const previousState = buildInitialDailyActionReviewState(targets);

  const result = await runDailyActionReviewSkill({
    text: "Je l'ai commence.",
    targets,
    previousState,
    llmRunner: async () => ({
      status: "complete",
      intent: "answer_review",
      current_focus_occurrence_ids: ["a1"],
      remaining_occurrence_ids: [],
      asked_occurrence_ids_history: [["a1"]],
      items: {
        a1: {
          outcome: "partial",
          reason_category: "unclear",
          reason_text: null,
          still_relevant: "unknown",
          evidence_text: "Je l'ai commence.",
          matched_user_text: "Je l'ai commence.",
          confidence: "high",
          missing_slots: [],
        },
      },
      next_question: "Qu'est-ce qui a bloque pour Parking a idees ?",
      next_question_targets: ["a1"],
      generated_user_message: "Qu'est-ce qui a bloque pour Parking a idees ?",
      should_apply_effects: true,
      stop_reason: "all_required_slots_filled",
    }),
  });

  assertEquals(result.shouldApplyEffects, false);
  assertEquals(result.state.status, "needs_clarification");
  assertEquals(result.state.effect_plan.allowed, false);
  assertEquals(result.state.items.a1.missing_slots, ["reason"]);
});

Deno.test("ambiguous answer across two targets keeps which_action missing", async () => {
  const targets = [
    target("a1", "plan-a", "Session focus", "habits"),
    target("a2", "plan-a", "Parking a idees", "missions"),
  ];
  const previousState = buildInitialDailyActionReviewState(targets);

  const result = await runDailyActionReviewSkill({
    text: "Je l'ai fait.",
    targets,
    previousState,
    llmRunner: async () => ({
      status: "needs_clarification",
      intent: "unclear",
      current_focus_occurrence_ids: ["a1", "a2"],
      remaining_occurrence_ids: [],
      asked_occurrence_ids_history: [["a1", "a2"]],
      items: {
        a1: {
          outcome: null,
          reason_category: null,
          reason_text: null,
          still_relevant: "unknown",
          evidence_text: null,
          matched_user_text: null,
          confidence: "low",
          missing_slots: ["which_action"],
        },
        a2: {
          outcome: null,
          reason_category: null,
          reason_text: null,
          still_relevant: "unknown",
          evidence_text: null,
          matched_user_text: null,
          confidence: "low",
          missing_slots: ["which_action"],
        },
      },
      next_question: "Tu parles de Session focus ou de Parking a idees ?",
      next_question_targets: ["a1", "a2"],
      generated_user_message:
        "Tu parles de Session focus ou de Parking a idees ?",
      should_apply_effects: false,
      stop_reason: null,
    }),
  });

  assertEquals(result.shouldApplyEffects, false);
  assertEquals(result.state.effect_plan.allowed, false);
  assertEquals(result.state.items.a1.missing_slots, [
    "which_action",
    "outcome",
  ]);
});

Deno.test("correction updates existing item without duplicate effect", async () => {
  const targets = [target("a1", "plan-a", "Session focus", "habits")];
  const previousState = buildInitialDailyActionReviewState(targets);
  previousState.items.a1.outcome = "completed";
  previousState.items.a1.reason_category = "none";
  previousState.items.a1.evidence_text = "Je l'ai faite.";
  previousState.items.a1.confidence = "high";
  previousState.items.a1.missing_slots = [];

  const result = await runDailyActionReviewSkill({
    text: "Non en fait je ne l'ai pas faite, trop fatigue.",
    targets,
    previousState,
    llmRunner: async () => ({
      status: "complete",
      intent: "correction",
      current_focus_occurrence_ids: ["a1"],
      remaining_occurrence_ids: [],
      asked_occurrence_ids_history: [["a1"]],
      items: {
        a1: {
          outcome: "missed",
          reason_category: "fatigue",
          reason_text: "trop fatigue",
          still_relevant: false,
          evidence_text: "Non en fait je ne l'ai pas faite, trop fatigue.",
          matched_user_text: "Non en fait je ne l'ai pas faite, trop fatigue.",
          confidence: "high",
          missing_slots: [],
        },
      },
      next_question: null,
      next_question_targets: [],
      generated_user_message: "Correction prise en compte pour Session focus.",
      should_apply_effects: true,
      stop_reason: "all_required_slots_filled",
    }),
  });

  assertEquals(result.state.intent, "correction");
  assertEquals(result.state.items.a1.outcome, "missed");
  assertEquals(result.state.effect_plan.effects.length, 1);
});

Deno.test("recap followup does not write", async () => {
  const result = await runDailyActionReviewFollowupSkill({
    text: "Tu peux me refaire le recap ?",
    dailyContext: {
      actions: [{ title: "Session focus", outcome: "completed" }],
    },
    llmRunner: async () => ({
      should_handle: true,
      intent: "recap",
      confidence: "high",
      evidence: ["demande de recap"],
      generated_user_message: "Oui : Session focus a ete prise en compte.",
    }),
  });

  assertEquals(result.shouldHandle, true);
  assertEquals(result.intent, "recap");
});

Deno.test("user stopped and safety stop daily without effect", async () => {
  const targets = [target("a1", "plan-a", "Session focus", "habits")];
  const previousState = buildInitialDailyActionReviewState(targets);

  for (
    const scenario of [
      {
        text: "Pas maintenant.",
        intent: "user_stopped",
        stop_reason: "user_stopped",
      },
      {
        text: "Je suis en crise, je vais me faire du mal.",
        intent: "safety",
        stop_reason: "safety",
      },
      {
        text: "Sinon, tu peux m'expliquer une potion ?",
        intent: "off_topic",
        stop_reason: "user_stopped",
      },
    ]
  ) {
    const result = await runDailyActionReviewSkill({
      text: scenario.text,
      targets,
      previousState,
      llmRunner: async () => ({
        status: "stopped",
        intent: scenario.intent,
        current_focus_occurrence_ids: ["a1"],
        remaining_occurrence_ids: ["a1"],
        asked_occurrence_ids_history: [["a1"]],
        items: {},
        next_question: null,
        next_question_targets: [],
        generated_user_message: "D'accord, on laisse le bilan ici.",
        should_apply_effects: true,
        stop_reason: scenario.stop_reason,
      }),
    });

    assertEquals(result.state.status, "stopped");
    assertEquals(result.state.intent, scenario.intent);
    assertEquals(result.shouldApplyEffects, false);
    assertEquals(result.state.effect_plan.allowed, false);
  }
});

Deno.test("noted language requires committable effect plan", async () => {
  const targets = [target("a1", "plan-a", "Session focus", "habits")];
  const previousState = buildInitialDailyActionReviewState(targets);
  let calls = 0;

  const result = await runDailyActionReviewSkill({
    text: "Oui.",
    targets,
    previousState,
    llmRunner: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          status: "complete",
          intent: "answer_review",
          current_focus_occurrence_ids: ["a1"],
          remaining_occurrence_ids: [],
          asked_occurrence_ids_history: [["a1"]],
          items: {
            a1: {
              outcome: "completed",
              reason_category: "none",
              reason_text: null,
              still_relevant: "unknown",
              evidence_text: null,
              matched_user_text: "Oui.",
              confidence: "high",
              missing_slots: [],
            },
          },
          next_question: null,
          next_question_targets: [],
          generated_user_message: "C'est note pour Session focus.",
          should_apply_effects: true,
          stop_reason: "all_required_slots_filled",
        };
      }
      return {
        status: "needs_clarification",
        intent: "clarify_outcome",
        current_focus_occurrence_ids: ["a1"],
        remaining_occurrence_ids: ["a1"],
        asked_occurrence_ids_history: [["a1"]],
        items: {
          a1: {
            outcome: null,
            reason_category: null,
            reason_text: null,
            still_relevant: "unknown",
            evidence_text: null,
            matched_user_text: null,
            confidence: "low",
            missing_slots: ["outcome"],
          },
        },
        next_question: "Tu veux dire que Session focus est faite ?",
        next_question_targets: ["a1"],
        generated_user_message: "Tu veux dire que Session focus est faite ?",
        should_apply_effects: false,
        stop_reason: null,
      };
    },
  });

  assertEquals(calls, 2);
  assertEquals(result.shouldApplyEffects, false);
  assertEquals(result.generatedUserMessage?.includes("note"), false);
});

Deno.test("daily action review followup skill answers continuation questions from DB context", async () => {
  let capturedPrompt = "";
  const result = await runDailyActionReviewFollowupSkill({
    text:
      "Ok, et du coup pour demain, tu as créé quoi exactement pour finir le sas ?",
    dailyContext: {
      actions: [{
        title: "Préparer ton sas de décompression du soir",
        outcome: "partial",
        human_label: "partiellement fait",
        reason_text: "Interrompu par Slack après 10 minutes",
        daily_decision: "mission_partial_split_continuation_created",
        continuation: {
          title:
            "Terminer Préparer ton sas de décompression du soir (2e partie)",
          planned_day: "sun",
          planned_day_label: "dimanche",
          defense_cards_duplicated: 1,
          attack_cards_duplicated: 1,
        },
      }],
    },
    llmRunner: async ({ userPrompt }) => {
      capturedPrompt = userPrompt;
      return {
        should_handle: true,
        intent: "continuation",
        confidence: "high",
        evidence: ["demande ce qui a été créé pour demain"],
        generated_user_message:
          "Oui : j'ai créé « Terminer Préparer ton sas de décompression du soir (2e partie) » pour dimanche.",
      };
    },
  });

  assertEquals(result.shouldHandle, true);
  assertEquals(result.intent, "continuation");
  assertEquals(
    result.generatedUserMessage?.includes("Terminer Préparer ton sas"),
    true,
  );
  assertEquals(capturedPrompt.includes("daily_context"), true);
});

Deno.test("daily action review followup skill ignores unrelated product-help questions", async () => {
  const result = await runDailyActionReviewFollowupSkill({
    text: "C'est quoi une potion dans Sophia ?",
    dailyContext: {
      actions: [{
        title: "Session focus",
        outcome: "completed",
        human_label: "fait",
      }],
    },
    llmRunner: async () => ({
      should_handle: false,
      intent: "other",
      confidence: "high",
      evidence: ["question produit sans lien avec le daily"],
      generated_user_message: null,
    }),
  });

  assertEquals(result.shouldHandle, false);
  assertEquals(result.generatedUserMessage, null);
});
