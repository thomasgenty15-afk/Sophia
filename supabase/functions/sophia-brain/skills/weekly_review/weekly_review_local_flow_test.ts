import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  normalizeWeeklyReviewLocalDispatcherOutput,
  oneShotDirectEffectFromWeeklyReviewLocalDispatcherOutput,
  reduceWeeklyReviewLocalDispatcherOutput,
  runWeeklyReviewLocalRuntime,
  weeklyReviewLocalDispatcherSystemPromptForTest,
} from "./local_flow.ts";
import {
  buildWeeklyReviewVisibleAgentUserPrompt,
  weeklyReviewVisibleSystemPromptForTest,
} from "./visible_agent.ts";
import {
  ACTIVE_WEEKLY_REVIEW_VISIBLE_TASK_KINDS,
  weeklyReviewVisibleAgentSpec,
} from "./visible_agents.ts";
import { ACTIVE_CONVERSATION_SKILL_KEY } from "../_shared/active_skill_state.ts";

function removedCoachingTarget(): string {
  return ["coaching", "recommendation"].join("_");
}

function weeklyState() {
  return {
    status: "open",
    weekly_progress_review: {
      transformations: [{
        plan_id: "plan-1",
        plan_title: "Plan semaine",
        actions: [{
          plan_id: "plan-1",
          plan_title: "Plan semaine",
          plan_item_id: "item-1",
          occurrence_id: "occ-1",
          title: "Marcher 10 min",
          status: "missed",
        }],
      }],
    },
    weekly_adaptive_review: {
      week_strategy: { decision: "advance", reason: "stable" },
    },
    weekly_flow_state: {
      stage: "action_review",
      validation_unlock_status: "locked_until_weekly_complete",
      weekly_gates: {
        week_experience_status: "captured",
        action_review_status: "captured",
        global_progress_status: "missing",
        felt_progress_status: "missing",
        solution_fit_status: "missing",
        synthesis_status: "missing",
        closure_status: "missing",
      },
      child_flow: { status: "none" },
      detour_candidate: { kind: "none" },
      weekly_planning_context: {
        mode: "next_week_configured",
        current_week: { start_date: "2026-06-15", end_date: "2026-06-21" },
        transformation_objective: {
          title: "Objectif test",
          user_summary: "Avancer sans surcharge",
          success_definition: "Garder une traction stable",
          main_constraint: "soirs tardifs",
        },
        plan_rationale: "Consolider avant d'augmenter.",
        next_week: {
          available: true,
          week_order: 2,
          title: "Semaine suivante",
          focus: "stabiliser",
          action_focus: ["soir"],
          progression_note: "adapter les soirs tardifs",
          success_signal: "routine faite sans pression",
          reps_summary: "3 soirs",
        },
        next_level: null,
        adjustment_destination: {
          mode: "adjust_plan_platform",
          label: "Ajuster mon plan",
          instruction: "Le plan ne se modifie pas par chat weekly.",
          chat_mutation_allowed: false,
        },
      },
      turn_count: 1,
      max_turns: 6,
    },
  };
}

Deno.test("weekly review prompt keeps removed local flows out of dispatcher targets", () => {
  const prompt = weeklyReviewLocalDispatcherSystemPromptForTest();

  assertStringIncludes(prompt, "exit_to_global_dispatcher");
  assertStringIncludes(prompt, "Sortie sparse obligatoire");
  assertEquals(
    prompt.includes(["handoff", "to", "local", "flow"].join("_")),
    false,
  );
  assertEquals(prompt.includes(["prepare", "attack", "card"].join("_")), false);
  assertEquals(prompt.includes(["adjust", "plan", "item"].join("_")), false);
  assertEquals(prompt.includes("safety_preempt"), false);
  assertEquals(prompt.includes("safety_crisis"), false);
  assertEquals(prompt.includes(removedCoachingTarget()), false);
  assertEquals(prompt.includes(["handoff", "to", "child", "flow"].join("_")), false);
  assertEquals(prompt.includes(["return", "from", "child", "flow"].join("_")), false);
  assertEquals(prompt.includes('risk_score":0'), false);
  assertEquals(prompt.includes('note_information":null'), false);
  assertEquals(prompt.includes('needed":false'), false);
  assertEquals(prompt.includes('turn_count_increment":1'), false);
  assertEquals(prompt.includes("Retourne exactement ce JSON"), false);
  assertStringIncludes(
    prompt,
    "Ne choisis pas answer_weekly_question, weekly_recap, explain_reasoning, exit_or_cancel",
  );
  assertStringIncludes(
    prompt,
    "rappel ponctuel one-shot avec payload_hint complet tout en continuant le bilan weekly",
  );
  assertStringIncludes(
    prompt,
    "target_dispatcher: none pour toute continuation weekly, rappel ponctuel one-shot traite par lane directe",
  );
  assertEquals(
    prompt.includes("rappel ponctuel non pris en charge par la lane directe"),
    false,
  );
});

Deno.test("weekly visible prompt forbids reminder claims without commit", () => {
  const prompt = weeklyReviewVisibleSystemPromptForTest("weekly_synthesis") ??
    "";

  assertStringIncludes(
    prompt,
    "Sans has_committed_one_shot_reminder=true",
  );
  assertStringIncludes(
    prompt,
    "ne dis jamais que le rappel est prevu, demande, note, bien formule, enregistre ou programme",
  );
});

Deno.test("weekly review has six active visible agent families", () => {
  const expectedFamilies = [
    "weekly_collection",
    "weekly_action_review",
    "weekly_forgotten_progress",
    "weekly_solution_bridge",
    "weekly_adjust_recommendation",
    "weekly_synthesis_closure",
  ].sort();
  const actualFamilies = [
    ...new Set(
      ACTIVE_WEEKLY_REVIEW_VISIBLE_TASK_KINDS.map((kind) =>
        weeklyReviewVisibleAgentSpec(kind)?.family
      ),
    ),
  ].sort();

  assertEquals(
    JSON.stringify(actualFamilies),
    JSON.stringify(expectedFamilies),
  );
  for (const kind of ACTIVE_WEEKLY_REVIEW_VISIBLE_TASK_KINDS) {
    assertEquals(Boolean(weeklyReviewVisibleAgentSpec(kind)), true);
  }
});

Deno.test("weekly review does not expose meta or exit visible specs", () => {
  for (
    const kind of [
      "answer_weekly_question",
      "weekly_recap",
      "explain_reasoning",
      "exit_or_cancel",
      "safety",
      "safety_transition",
      "stop_or_cancel",
      "stop_close",
      "inline_tool_return",
      "offer_child_detour",
      "qualify_attack_or_defense_fit",
    ] as const
  ) {
    assertEquals(weeklyReviewVisibleAgentSpec(kind), null);
  }
});

function visibleContext() {
  return {
    state_summary: "weekly active",
    week_window: { start_date: null, end_date: null },
    field_or_stage: "weekly_synthesis",
    known_values: {
      action_review_before_global_progress_required: true,
    },
    missing_or_weak_values: [],
    weekly_strategy: {
      strategy_label_human: null,
      reason_human: null,
      confidence: "medium",
    },
    weekly_planning_context: {
      mode: "next_week_configured",
      current_week: { start_date: "2026-06-15", end_date: "2026-06-21" },
      transformation_objective: {
        title: "Objectif test",
        user_summary: "Avancer sans surcharge",
        success_definition: "Garder une traction stable",
        main_constraint: "soirs tardifs",
      },
      plan_rationale: "Consolider avant d'augmenter.",
      next_week: {
        available: true,
        week_order: 2,
        title: "Semaine 2",
        focus: "stabiliser",
        action_focus: ["soir"],
        progression_note: "plus court",
        success_signal: "fait sans pression",
        reps_summary: "3 soirs",
      },
      next_level: null,
      adjustment_destination: {
        mode: "adjust_plan_platform",
        label: "Ajuster mon plan",
        instruction: "Le plan ne se modifie pas par chat weekly.",
        chat_mutation_allowed: false,
      },
    },
    adjust_recommendation: {
      status: "none",
      confidence: 0,
      mode: null,
      what_to_adjust: [],
      why: [],
      evidence: [],
      target_scope: null,
      destination_instruction: null,
      safe_to_surface: false,
      surfaced_in_weekly: false,
      updated_at: null,
    },
    plan_contexts: [],
    item_summaries: [],
    handoff_data: {},
    forgotten_progress: {},
    inline_result: {},
    weekly_gates: {
      week_experience_status: "complete",
      action_review_status: "complete",
      global_progress_status: "complete",
      felt_progress_status: "complete",
      solution_fit_status: "captured",
      synthesis_status: "captured",
      closure_status: "missing",
    },
    detour_candidate: { kind: "none" },
    current_action_focus: null,
    known_action_gaps: [],
    global_objective_signal: {},
    felt_progress_signal: {},
    child_flow_return_summary: null,
    next_required_weekly_step: "weekly_closure",
    tone_constraints: ["compact"],
    do_not_say: ["dire que le Plan a ete modifie"],
    context_summary: null,
    evidence_used: ["progression partielle"],
  };
}

Deno.test("weekly visible receives mandatory runtime context pack", () => {
  const prompt = buildWeeklyReviewVisibleAgentUserPrompt({
    user_id: "user-weekly-visible",
    stage: "weekly_synthesis",
    recent_messages: [
      { role: "assistant", content: "Ancienne question" },
      { role: "user", content: "J'ai avance un peu." },
      { role: "user", content: "Mais c'etait partiel." },
    ],
    conversation_context: visibleContext() as any,
  });
  const parsed = JSON.parse(prompt);

  assertStringIncludes(
    parsed.visible_runtime_context.style_rules,
    "tutoiement",
  );
  assertEquals(
    parsed.visible_runtime_context.recent_user_messages.map((
      message: { content: string },
    ) => message.content),
    ["J'ai avance un peu.", "Mais c'etait partiel."],
  );
  assertEquals(parsed.visible_task.kind, "weekly_synthesis");
  assertEquals(parsed.hard_constraints.no_chat_plan_mutation, true);
  // W4.4 — la destination du weekly est unique et pointe vers le coach. Le
  // label de la fixture (« Ajuster mon plan », surface supprimee en W2) est
  // ECRASE avant d'atteindre le prompt: le desarmement doit survivre a un etat
  // de flow persiste avant ce lot.
  assertEquals(
    parsed.hard_constraints.adjustment_destination.mode,
    "coach_review",
  );
  assertEquals(
    parsed.hard_constraints.adjustment_destination.label,
    "Ton coach",
  );
  assertEquals(
    parsed.hard_constraints.forbidden_patch_wording.includes(
      "ce qui bougerait",
    ),
    true,
  );
  assertEquals(
    parsed.visible_runtime_context.direct_effect_confirmation_context,
    null,
  );
  assertEquals(parsed.note_information, undefined);
});

Deno.test("weekly visible receives adjustment destination and closure claim guard", () => {
  const context = visibleContext() as any;
  context.weekly_planning_context.mode = "next_level_required";
  context.weekly_planning_context.next_week = null;
  context.weekly_planning_context.next_level = {
    available: false,
    level_order: 0,
    title: null,
    intention: null,
    preview_summary: null,
    validation_input_destination: "Validation du niveau",
  };
  context.weekly_planning_context.adjustment_destination = {
    mode: "level_validation",
    label: "Validation du niveau",
    instruction:
      "Le plan ne se modifie pas par chat weekly. Sans semaine suivante configuree, le user doit valider le niveau et renseigner ces inputs dans le bilan du niveau suivant.",
    chat_mutation_allowed: false,
  };
  context.adjust_recommendation = {
    status: "surfaced",
    confidence: 0.98,
    mode: "next_level_required",
    what_to_adjust: ["alleger les actions les soirs tardifs"],
    why: ["l'energie tombe en fin de journee"],
    evidence: ["retours tardifs", "actions reportees"],
    target_scope: "next_level_inputs",
    destination_instruction:
      "Validation du niveau : renseigner cet input de maniere concrete, sans modifier le plan depuis le chat.",
    safe_to_surface: true,
    // Premiere surface au stage synthesis: la destination doit se propager.
    surfaced_in_weekly: false,
    updated_at: "2026-06-24T00:00:00.000Z",
  };
  context.weekly_gates.closure_status = "missing";

  const prompt = buildWeeklyReviewVisibleAgentUserPrompt({
    user_id: "user-weekly-visible-destination",
    stage: "weekly_synthesis",
    conversation_context: context,
  });
  const parsed = JSON.parse(prompt);

  // W4.4 — GARDE-FOU INVERSE: la fixture ci-dessus construit volontairement
  // l'ancienne destination morte (`level_validation` / « Validation du
  // niveau »), telle qu'elle peut encore exister dans un flow persiste. Le
  // prompt ne doit plus JAMAIS la porter, quel que soit le mode.
  const coachMessage =
    "Je fais remonter ce point a ton coach avec le bilan: c'est lui qui decide de ce qui bouge dans le plan.";
  assertEquals(
    parsed.hard_constraints.adjust_recommendation_destination_user_message,
    coachMessage,
  );
  assertEquals(
    parsed.visible_task.conversation_context.weekly_planning_context
      .adjustment_destination.instruction,
    coachMessage,
  );
  assertEquals(
    parsed.visible_task.conversation_context.weekly_planning_context
      .adjustment_destination.mode,
    "coach_review",
  );
  assertEquals(
    parsed.visible_task.conversation_context.adjust_recommendation
      .destination_instruction,
    coachMessage,
  );
  assertEquals(prompt.includes("Validation du niveau"), false);
  assertEquals(prompt.includes("Ajuster mon plan"), false);
  assertEquals(parsed.hard_constraints.can_surface_adjust_recommendation, true);
  assertEquals(parsed.hard_constraints.weekly_closure_claim_allowed, false);
});

Deno.test("weekly visible context does not expose raw destination instruction without safe recommendation", () => {
  const context = visibleContext() as any;
  context.weekly_planning_context.mode = "next_level_required";
  context.weekly_planning_context.adjustment_destination = {
    mode: "level_validation",
    label: "Validation du niveau",
    instruction:
      "Le plan ne se modifie pas par chat weekly. Sans semaine suivante configuree, le user doit valider le niveau et renseigner ces inputs dans le bilan du niveau suivant.",
    chat_mutation_allowed: false,
  };
  context.handoff_data.adjustment_destination =
    context.weekly_planning_context.adjustment_destination;
  context.adjust_recommendation = {
    status: "candidate",
    confidence: 0.98,
    mode: null,
    what_to_adjust: ["stabiliser la version courte les soirs tardifs"],
    why: [],
    evidence: ["retour tardif mardi", "routine normale saute jeudi"],
    target_scope: "next_week_plan",
    destination_instruction: "Ajuster mon plan",
    safe_to_surface: false,
    surfaced_in_weekly: false,
    updated_at: null,
  };

  const parsed = JSON.parse(buildWeeklyReviewVisibleAgentUserPrompt({
    user_id: "user-weekly-visible-no-raw-destination",
    stage: "weekly_synthesis",
    conversation_context: context,
  }));
  const serialized = JSON.stringify(parsed);

  assertEquals(
    parsed.hard_constraints.can_surface_adjust_recommendation,
    false,
  );
  assertEquals(
    parsed.visible_task.conversation_context.adjust_recommendation
      .destination_instruction,
    null,
  );
  assertEquals(
    parsed.visible_task.conversation_context.adjust_recommendation.confidence,
    0,
  );
  assertEquals(
    parsed.visible_task.conversation_context.adjust_recommendation
      .what_to_adjust,
    [],
  );
  assertEquals(
    parsed.visible_task.conversation_context.adjust_recommendation.evidence,
    [],
  );
  assertEquals(
    parsed.visible_task.conversation_context.known_values.adjust_recommendation
      .what_to_adjust,
    [],
  );
  assertEquals(serialized.includes("le user doit"), false);
  assertEquals(serialized.includes("Sans semaine suivante configuree"), false);
  assertEquals(serialized.includes("stabiliser la version courte"), false);
  assertEquals(serialized.includes("retour tardif mardi"), false);
  // W4.4 — la destination reste exposee, mais c'est le coach: « Validation du
  // niveau » est une surface supprimee et ne doit plus apparaitre nulle part
  // dans le payload, meme via un etat de flow persiste.
  assertEquals(serialized.includes("Validation du niveau"), false);
  assertEquals(serialized.includes("coach_review"), true);
});

Deno.test("weekly adjust visible does not receive incomplete recommendation payload", () => {
  const context = visibleContext() as any;
  context.weekly_planning_context.mode = "next_week_configured";
  context.adjust_recommendation = {
    status: "candidate",
    confidence: 0.98,
    mode: "next_week_configured",
    what_to_adjust: ["alleger la fin de journee"],
    why: [],
    evidence: ["mardi retour tardif", "jeudi action sautee"],
    target_scope: "next_week_plan",
    destination_instruction: "Ajuster mon plan",
    safe_to_surface: false,
    surfaced_in_weekly: false,
    updated_at: "2026-06-29T10:00:00.000Z",
  };

  const parsed = JSON.parse(buildWeeklyReviewVisibleAgentUserPrompt({
    user_id: "user-weekly-adjust-incomplete-payload",
    stage: "weekly_adjust_recommendation",
    conversation_context: context,
  }));
  const serialized = JSON.stringify(parsed);

  assertEquals(parsed.hard_constraints.can_surface_adjust_recommendation, false);
  assertEquals(
    parsed.visible_task.conversation_context.adjust_recommendation.status,
    "candidate",
  );
  assertEquals(
    parsed.visible_task.conversation_context.adjust_recommendation
      .what_to_adjust,
    [],
  );
  assertEquals(
    parsed.visible_task.conversation_context.adjust_recommendation.evidence,
    [],
  );
  assertEquals(serialized.includes("alleger la fin de journee"), false);
  assertEquals(serialized.includes("mardi retour tardif"), false);
});

Deno.test("weekly visible receives direct effect confirmation context", () => {
  const committedEffect = {
    type: "create_one_shot_reminder",
    reminder_id: "reminder-1",
    local_label: "demain",
    reminder_instruction: "continuer le weekly",
  };
  const prompt = buildWeeklyReviewVisibleAgentUserPrompt({
    user_id: "user-weekly-visible-reminder",
    stage: "weekly_synthesis",
    recent_messages: [
      { role: "user", content: "Rappelle-moi ca demain, et on continue." },
    ],
    conversation_context: visibleContext() as any,
    direct_effect_confirmation_context: {
      // W2.D-2 — `effects_outcome`, `blocked_one_shot_reminder`, `track_progress` and
      // `blocked_track_progress` became required on DirectEffectConfirmationContext
      // (router/direct_effect_local_context.ts:38-70) after this case was written. This case
      // only checks that the committed one-shot reminder reaches the visible agent prompt, so
      // the four new channels carry their empty/neutral value.
      effects_outcome: [],
      blocked_one_shot_reminder: null,
      track_progress: null,
      blocked_track_progress: null,
      has_committed_one_shot_reminder: true,
      has_requested_one_shot_reminder: true,
      one_shot_reminder: {
        committed: true,
        local_label: "demain",
        reminder_instruction: "continuer le weekly",
      },
      confirmation_text: null,
      committed_effects: [],
      requested_effects: [],
      blocked_effects: [],
      do_not_recreate: true,
      do_not_reroute: true,
      do_not_redemand: true,
      do_not_confirm_without_commit: true,
      remaining_user_need_must_continue: true,
    },
  });
  const parsed = JSON.parse(prompt);

  assertEquals(
    parsed.visible_runtime_context.direct_effect_confirmation_context
      .has_committed_one_shot_reminder,
    true,
  );
  assertEquals(parsed.hard_constraints.one_shot_reminder, {
    committed: true,
    local_label: "demain",
    reminder_instruction: "continuer le weekly",
  });
});

Deno.test("weekly synthesis visible prompt forbids fake success and routing", () => {
  const prompt = weeklyReviewVisibleSystemPromptForTest("weekly_synthesis") ??
    "";

  assertStringIncludes(prompt, "Famille visible: weekly_synthesis_closure.");
  assertStringIncludes(prompt, "VISIBLE_CONVERSATION_FLOW_RULES");
  assertStringIncludes(
    prompt,
    "une action partielle reste partielle",
  );
  assertStringIncludes(prompt, "Tu ne routes pas");
  assertStringIncludes(prompt, "tu n'appelles aucun outil");
  assertStringIncludes(
    prompt,
    "Ne dis jamais que le weekly est cloture",
  );
  assertStringIncludes(
    prompt,
    "hard_constraints.weekly_closure_claim_allowed",
  );
  assertStringIncludes(
    prompt,
    "hard_constraints.can_surface_adjust_recommendation n'est pas true",
  );
});

Deno.test("weekly closure prompt is short after synthesis already rendered", () => {
  const prompt = weeklyReviewVisibleSystemPromptForTest("weekly_closure") ?? "";

  assertStringIncludes(
    prompt,
    "hard_constraints.synthesis_already_rendered=true",
  );
  assertStringIncludes(prompt, "1 ou 2 phrases maximum");
  assertStringIncludes(prompt, "pas de liste action par action");
  assertStringIncludes(
    prompt,
    "hard_constraints.repeat_adjust_recommendation_forbidden=true",
  );
  assertStringIncludes(
    prompt,
    "ne reformule jamais la recommandation d'ajustement deja donnee",
  );
});

Deno.test("weekly closure visible receives synthesis rendered flag", () => {
  const context = visibleContext() as any;
  context.known_values.synthesis_already_rendered = true;
  context.known_values.synthesis_visible_status = "rendered";
  context.weekly_gates.closure_status = "complete";

  const parsed = JSON.parse(buildWeeklyReviewVisibleAgentUserPrompt({
    user_id: "user-weekly-closure-after-synthesis",
    stage: "weekly_closure",
    conversation_context: context,
  }));

  assertEquals(parsed.hard_constraints.synthesis_already_rendered, true);
  assertEquals(parsed.hard_constraints.weekly_closure_claim_allowed, true);
});

Deno.test("weekly closure forbids repeating already surfaced adjust recommendation", () => {
  const context = visibleContext() as any;
  context.known_values.synthesis_already_rendered = true;
  context.known_values.synthesis_visible_status = "rendered";
  context.weekly_gates.closure_status = "complete";
  context.adjust_recommendation = {
    status: "surfaced",
    confidence: 0.97,
    mode: "next_level_required",
    what_to_adjust: ["prevoir une mini-version les soirs tardifs"],
    why: ["la version normale devient trop lourde"],
    evidence: [
      "retours tardifs trop lourds",
      "mini-version confirmee comme levier",
    ],
    target_scope: "next_level_inputs",
    destination_instruction: "Validation du niveau",
    safe_to_surface: true,
    surfaced_in_weekly: true,
    updated_at: "2026-06-25T10:25:12.261Z",
  };

  const parsed = JSON.parse(buildWeeklyReviewVisibleAgentUserPrompt({
    user_id: "user-weekly-closure-after-adjust",
    stage: "weekly_closure",
    conversation_context: context,
  }));

  assertEquals(parsed.hard_constraints.synthesis_already_rendered, true);
  assertEquals(
    parsed.hard_constraints.adjust_recommendation_already_surfaced,
    true,
  );
  assertEquals(
    parsed.hard_constraints.repeat_adjust_recommendation_forbidden,
    true,
  );
  assertEquals(
    parsed.hard_constraints.can_surface_adjust_recommendation,
    false,
  );
  assertEquals(
    parsed.visible_task.conversation_context.adjust_recommendation
      .destination_instruction,
    null,
  );
});

Deno.test("weekly adjust recommendation visible prompt is non-mutant and destination aware", () => {
  const prompt = weeklyReviewVisibleSystemPromptForTest(
    "weekly_adjust_recommendation",
  ) ?? "";

  assertStringIncludes(
    prompt,
    "Famille visible: weekly_adjust_recommendation.",
  );
  assertStringIncludes(prompt, "safe_to_surface=true");
  // W4.4 — GARDE-FOU INVERSE. Ce test EPINGLAIT les deux surfaces supprimees
  // en W2: il prouvait que le weekly renvoyait chaque dimanche vers un ecran
  // d'ajustement de plan et vers une validation de niveau qui n'existent plus.
  // Il prouve desormais leur ABSENCE, et la presence de la sortie KEEL.
  assertEquals(prompt.includes("Ajuster mon plan"), false);
  assertEquals(prompt.includes("Validation du niveau"), false);
  assertStringIncludes(prompt, "coach_review");
  assertStringIncludes(
    prompt,
    "hard_constraints.adjust_recommendation_destination_user_message",
  );
  assertStringIncludes(
    prompt,
    "Formulation attendue seulement si hard_constraints.can_surface_adjust_recommendation=true",
  );
  assertStringIncludes(
    prompt,
    "Ne rends pas le niveau de confiance au user",
  );
  assertStringIncludes(
    prompt,
    "La confiance reste une trace interne",
  );
  assertStringIncludes(prompt, "Je ne modifie pas le plan ici");
  assertStringIncludes(prompt, "ce qui bougerait / ce qui resterait");
});

Deno.test("weekly visible prompt forbids re-rendering an already surfaced recommendation outside closure", () => {
  const prompt = weeklyReviewVisibleSystemPromptForTest(
    "weekly_adjust_recommendation",
  ) ?? "";

  assertStringIncludes(
    prompt,
    "hard_constraints.adjust_recommendation_already_surfaced=true",
  );
  assertStringIncludes(
    prompt,
    "ne re-deroule pas la recommandation complete ni un recap action par action deja rendu",
  );
  assertStringIncludes(
    prompt,
    "reponds au point nouveau du message user en une ou deux phrases",
  );
  assertStringIncludes(
    prompt,
    "Si le user pousse pour appliquer directement le changement depuis le chat",
  );
  assertStringIncludes(
    prompt,
    "sans re-derouler la recommandation ni refaire le bilan action par action",
  );
  // Anti-faux-positif: le user garde le droit de demander une repetition explicite.
  assertStringIncludes(
    prompt,
    "ne demande pas explicitement de repeter la recommandation",
  );
});

Deno.test("weekly dispatcher parses chat_plan_mutation_request", () => {
  const withFlag = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "answer_weekly_question",
    confidence: "high",
    chat_plan_mutation_request: true,
    weekly_intent: { kind: "weekly_answer", summary: "Le user veut appliquer directement." },
    visible_task: { kind: "weekly_adjust_recommendation", instruction: "Refuser sobrement." },
  });
  assertEquals(withFlag.chat_plan_mutation_request, true);

  const withoutFlag = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "answer_weekly_question",
    confidence: "high",
    weekly_intent: { kind: "weekly_answer", summary: "Le user demande quoi ajuster." },
    visible_task: { kind: "weekly_adjust_recommendation", instruction: "Repondre." },
  });
  assertEquals(withoutFlag.chat_plan_mutation_request, false);
});

Deno.test("weekly visible refuses chat plan mutation request without re-surfacing", () => {
  const prompt = weeklyReviewVisibleSystemPromptForTest(
    "weekly_adjust_recommendation",
  ) ?? "";
  assertStringIncludes(
    prompt,
    "hard_constraints.chat_plan_mutation_refusal_required=true",
  );
  assertStringIncludes(
    prompt,
    "Ne re-deroule ni la recommandation d'ajustement, ni la synthese, ni un recap action par action",
  );

  const context = visibleContext() as any;
  // Recommandation par ailleurs surfacable (safe, confiante): sans le flag elle
  // pourrait se rendre; avec le flag elle doit etre bloquee.
  context.adjust_recommendation = {
    status: "ready",
    confidence: 0.97,
    mode: "next_level_required",
    what_to_adjust: ["reduire a une version tres courte"],
    why: ["l'energie chute des jeudi"],
    evidence: ["avance ressentie", "mission preparee mais jamais envoyee"],
    target_scope: "next_level_inputs",
    destination_instruction: "Validation du niveau",
    safe_to_surface: true,
    surfaced_in_weekly: false,
  };
  context.known_values = {
    ...(context.known_values ?? {}),
    chat_plan_mutation_request: true,
  };

  const parsed = JSON.parse(buildWeeklyReviewVisibleAgentUserPrompt({
    user_id: "user-weekly-chat-mutation-push",
    stage: "weekly_adjust_recommendation",
    conversation_context: context,
  }));

  assertEquals(
    parsed.hard_constraints.chat_plan_mutation_refusal_required,
    true,
  );
  // Le refus force can_surface a false meme si la reco etait surfacable.
  assertEquals(
    parsed.hard_constraints.can_surface_adjust_recommendation,
    false,
  );
  // W4.4 — la destination reste disponible pour le renvoi, mais elle pointe
  // desormais vers le COACH: "Ajuster mon plan" est une surface supprimee.
  assertStringIncludes(
    parsed.hard_constraints.adjust_recommendation_destination_user_message,
    "ton coach",
  );
  assertEquals(
    parsed.hard_constraints
      .adjust_recommendation_destination_user_message.includes(
        "Ajuster mon plan",
      ),
    false,
  );
});

Deno.test("weekly synthesis does not re-surface an already surfaced recommendation", () => {
  const context = visibleContext() as any;
  context.field_or_stage = "weekly_synthesis";
  context.adjust_recommendation = {
    status: "surfaced",
    confidence: 0.96,
    mode: "next_level_required",
    what_to_adjust: ["reduire a une version tres courte"],
    why: ["l'energie chute des jeudi"],
    evidence: [
      "avance ressentie mais energie qui s'effondre",
      "mission preparee mais jamais envoyee",
    ],
    target_scope: "next_level_inputs",
    destination_instruction: "Validation du niveau",
    safe_to_surface: true,
    surfaced_in_weekly: true,
    updated_at: "2026-07-03T02:13:15.811Z",
  };

  const parsed = JSON.parse(buildWeeklyReviewVisibleAgentUserPrompt({
    user_id: "user-weekly-synthesis-already-surfaced",
    stage: "weekly_synthesis",
    conversation_context: context,
  }));

  // Deja surfacee -> pas de re-surface au stage synthesis, et repetition interdite.
  assertEquals(
    parsed.hard_constraints.adjust_recommendation_already_surfaced,
    true,
  );
  assertEquals(
    parsed.hard_constraints.can_surface_adjust_recommendation,
    false,
  );
  assertEquals(
    parsed.hard_constraints.repeat_adjust_recommendation_forbidden,
    true,
  );
});

Deno.test("weekly synthesis first surface still renders when not yet surfaced", () => {
  const context = visibleContext() as any;
  context.field_or_stage = "weekly_synthesis";
  context.adjust_recommendation = {
    status: "ready",
    confidence: 0.96,
    mode: "next_level_required",
    what_to_adjust: ["reduire a une version tres courte"],
    why: ["l'energie chute des jeudi"],
    evidence: [
      "avance ressentie mais energie qui s'effondre",
      "mission preparee mais jamais envoyee",
    ],
    target_scope: "next_level_inputs",
    destination_instruction: "Validation du niveau",
    safe_to_surface: true,
    surfaced_in_weekly: false,
    updated_at: "2026-07-03T02:13:15.811Z",
  };

  const parsed = JSON.parse(buildWeeklyReviewVisibleAgentUserPrompt({
    user_id: "user-weekly-synthesis-first-surface",
    stage: "weekly_synthesis",
    conversation_context: context,
  }));

  // Premiere surface au stage synthesis: doit rester surfacable.
  assertEquals(
    parsed.hard_constraints.adjust_recommendation_already_surfaced,
    false,
  );
  assertEquals(
    parsed.hard_constraints.can_surface_adjust_recommendation,
    true,
  );
  assertEquals(
    parsed.hard_constraints.repeat_adjust_recommendation_forbidden,
    false,
  );
});

Deno.test("weekly adjust recommendation user prompt flags already surfaced recommendation", () => {
  const context = visibleContext() as any;
  context.adjust_recommendation = {
    status: "surfaced",
    confidence: 0.97,
    mode: "next_level_required",
    what_to_adjust: ["prevoir une mini-version les soirs tardifs"],
    why: ["la version normale devient trop lourde"],
    evidence: [
      "retours tardifs trop lourds",
      "mini-version confirmee comme levier",
    ],
    target_scope: "next_level_inputs",
    destination_instruction: "Validation du niveau",
    safe_to_surface: true,
    surfaced_in_weekly: true,
    updated_at: "2026-06-25T10:25:12.261Z",
  };

  const parsed = JSON.parse(buildWeeklyReviewVisibleAgentUserPrompt({
    user_id: "user-weekly-adjust-already-surfaced",
    stage: "weekly_adjust_recommendation",
    conversation_context: context,
  }));

  assertEquals(
    parsed.hard_constraints.adjust_recommendation_already_surfaced,
    true,
  );
  // Hors closure, la recommandation reste surfacable si le user la redemande explicitement.
  assertEquals(
    parsed.hard_constraints.can_surface_adjust_recommendation,
    true,
  );
  assertEquals(
    parsed.hard_constraints.repeat_adjust_recommendation_forbidden,
    false,
  );
});

Deno.test("weekly adjust recommendation below 0.95 is not safe to surface", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "answer_weekly_question",
    confidence: "high",
    weekly_intent: {
      kind: "weekly_answer",
      summary: "Le user demande quoi ajuster.",
    },
    adjust_recommendation: {
      status: "ready",
      confidence: 0.94,
      what_to_adjust: ["alleger le soir"],
      why: ["les soirs tardifs bloquent"],
      evidence: ["lundi manque", "jeudi manque"],
      target_scope: "next_week_plan",
      safe_to_surface: true,
    },
    visible_task: {
      kind: "weekly_adjust_recommendation",
      instruction: "Repondre sur l'ajustement.",
    },
    evidence: ["demande prochaine semaine"],
  });

  assertEquals(output.adjust_recommendation.status, "candidate");
  assertEquals(output.adjust_recommendation.safe_to_surface, false);
});

Deno.test("weekly reducer stores safe adjust recommendation without mutating plan", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "answer_weekly_question",
    confidence: "high",
    weekly_intent: {
      kind: "weekly_answer",
      summary: "Le user demande quoi envisager ensuite.",
    },
    adjust_recommendation: {
      status: "ready",
      confidence: 0.95,
      what_to_adjust: ["reduire la routine du soir les jours tardifs"],
      why: ["les soirs tardifs expliquent les deux echecs"],
      evidence: ["mardi action ratee apres retour tard", "vendredi meme cause"],
      target_scope: "next_week_plan",
      safe_to_surface: true,
    },
    visible_task: {
      kind: "weekly_adjust_recommendation",
      instruction: "Orienter vers la plateforme sans patch.",
    },
    evidence: ["demande prochaine semaine"],
  });
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  const flow = reduced.weekly_state?.weekly_flow_state as any;

  assertEquals(flow.adjust_recommendation.safe_to_surface, true);
  assertEquals(flow.adjust_recommendation.confidence, 0.95);
  assertEquals(flow.adjust_recommendation.target_scope, "next_week_plan");
  assertEquals(flow.weekly_gates.solution_fit_status, "captured");
  assertEquals(
    Boolean((reduced.weekly_state?.weekly_adaptive_review as any)?.plan_patch),
    false,
  );
  assertEquals(
    Boolean(
      (reduced.weekly_state?.weekly_adaptive_review as any)
        ?.pending_confirmation,
    ),
    false,
  );
});

Deno.test("weekly reducer does not promote unsafe adjust recommendation to visible adjust agent", () => {
  const state = weeklyState() as any;
  state.weekly_flow_state.weekly_gates = {
    week_experience_status: "captured",
    action_review_status: "captured",
    global_progress_status: "captured",
    felt_progress_status: "captured",
    solution_fit_status: "missing",
    synthesis_status: "missing",
    closure_status: "missing",
  };
  const output = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "answer_weekly_question",
    confidence: "high",
    weekly_intent: {
      kind: "weekly_answer",
      summary: "Le user demande quoi envisager pour la suite.",
    },
    adjust_recommendation: {
      status: "ready",
      confidence: 0.98,
      what_to_adjust: ["stabiliser la version courte"],
      why: [],
      evidence: ["retour tardif mardi", "routine saute jeudi"],
      target_scope: "next_week_plan",
      safe_to_surface: false,
    },
    visible_task: {
      kind: "weekly_adjust_recommendation",
      instruction: "Repondre sans modifier le plan.",
    },
    evidence: ["quoi faire ensuite"],
  });

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: state,
    output,
  });
  const flow = reduced.weekly_state?.weekly_flow_state as any;

  assertEquals(reduced.visible_task, "weekly_synthesis");
  assertEquals(flow.weekly_gates.solution_fit_status, "missing");
  assertEquals(flow.adjust_recommendation.status, "candidate");
  assertEquals(flow.adjust_recommendation.safe_to_surface, false);
});

Deno.test("weekly reducer forces weekly_closure visible task when completion closes gates", () => {
  const state = weeklyState() as any;
  state.weekly_flow_state.weekly_gates = {
    week_experience_status: "complete",
    action_review_status: "complete",
    global_progress_status: "complete",
    felt_progress_status: "complete",
    solution_fit_status: "complete",
    synthesis_status: "complete",
    closure_status: "missing",
  };
  const output = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "complete_weekly_no_change",
    confidence: "high",
    weekly_intent: {
      kind: "weekly_confirmation",
      summary: "Le user demande de cloturer le weekly.",
    },
    weekly_gates: {
      synthesis_status: "complete",
      closure_status: "complete",
    },
    state_updates: {
      status: "completed",
      weekly_stage: "synthesis",
      validation_unlock_status: "available",
      close_after_visible: true,
    },
    visible_task: {
      kind: "weekly_synthesis",
      instruction: "Synthese finale.",
    },
    evidence: ["cloture explicite"],
  });

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: state,
    output,
  });

  assertEquals(reduced.status, "closed");
  assertEquals(reduced.visible_task, "weekly_closure");
  assertEquals(
    reduced.conversation_context?.weekly_gates.closure_status,
    "complete",
  );
});

Deno.test("weekly reducer completes closure when synthesis was already rendered", () => {
  const state = weeklyState() as any;
  state.weekly_flow_state.synthesis_visible_status = "rendered";
  state.weekly_flow_state.weekly_gates = {
    week_experience_status: "complete",
    action_review_status: "complete",
    global_progress_status: "complete",
    felt_progress_status: "complete",
    solution_fit_status: "captured",
    synthesis_status: "captured",
    closure_status: "missing",
  };
  state.weekly_flow_state.adjust_recommendation = {
    status: "surfaced",
    confidence: 0.98,
    mode: "next_level_required",
    what_to_adjust: [
      "stabiliser une version courte du rituel de fin de journee",
    ],
    why: ["la version complete est trop lourde les soirs tardifs"],
    evidence: ["retour tardif", "version courte confirmee"],
    target_scope: "next_level_inputs",
    destination_instruction: "Validation du niveau",
    safe_to_surface: true,
    surfaced_in_weekly: true,
    updated_at: "2026-06-25T14:14:26.599Z",
  };
  const output = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "complete_weekly_no_change",
    confidence: "high",
    weekly_intent: {
      kind: "weekly_confirmation",
      summary: "Le user demande seulement de terminer le point weekly.",
    },
    weekly_gates: {
      synthesis_status: "captured",
      closure_status: "complete",
    },
    state_updates: {
      status: "completed",
      weekly_stage: "synthesis",
      validation_unlock_status: "available",
      close_after_visible: true,
    },
    visible_task: {
      kind: "weekly_synthesis",
      instruction: "Mauvais stage propose par le dispatcher.",
    },
    evidence: ["terminer le point weekly"],
  });

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: state,
    output,
  });
  const flow = reduced.weekly_state?.weekly_flow_state as any;

  assertEquals(reduced.status, "closed");
  assertEquals(
    reduced.reason_code,
    "weekly_review_local_complete_weekly_no_change",
  );
  assertEquals(reduced.visible_task, "weekly_closure");
  assertEquals(reduced.weekly_state?.status, "completed");
  assertEquals(flow.weekly_gates.synthesis_status, "complete");
  assertEquals(flow.weekly_gates.closure_status, "complete");
  assertEquals(flow.validation_unlock_status, "available");
  assertEquals(
    (reduced.weekly_state?.validation_unlock as any)?.status,
    "available",
  );
});

Deno.test("weekly reducer completes visible closure after rendered synthesis even when action clarifies signal", () => {
  const state = weeklyState() as any;
  state.weekly_flow_state.synthesis_visible_status = "rendered";
  state.weekly_flow_state.weekly_gates = {
    week_experience_status: "complete",
    action_review_status: "complete",
    global_progress_status: "complete",
    felt_progress_status: "complete",
    solution_fit_status: "captured",
    synthesis_status: "captured",
    closure_status: "missing",
  };
  state.weekly_flow_state.adjust_recommendation = {
    status: "surfaced",
    confidence: 0.96,
    mode: "next_level_required",
    what_to_adjust: [
      "valider un niveau plus simple pour les soirs tardifs",
    ],
    why: ["les retours tardifs coupent la version normale"],
    evidence: ["retour tardif", "version normale sautee"],
    target_scope: "next_level_inputs",
    destination_instruction: "Validation du niveau",
    safe_to_surface: true,
    surfaced_in_weekly: true,
    updated_at: "2026-06-25T14:14:26.599Z",
  };
  const output = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "clarify_human_signal",
    confidence: "high",
    weekly_intent: {
      kind: "weekly_confirmation",
      summary: "Le user demande de cloturer sans repeter le bilan.",
    },
    weekly_gates: {
      synthesis_status: "captured",
      closure_status: "captured",
    },
    state_updates: {
      status: "open",
      weekly_stage: "closure",
      validation_unlock_status: "locked_until_weekly_complete",
    },
    visible_task: {
      kind: "weekly_closure",
      instruction: "Cloture courte sans repetition.",
    },
    evidence: ["cloturer", "sans repeter"],
  });

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: state,
    output,
  });
  const flow = reduced.weekly_state?.weekly_flow_state as any;

  assertEquals(reduced.status, "closed");
  assertEquals(reduced.reason_code, "weekly_review_local_clarify_human_signal");
  assertEquals(reduced.visible_task, "weekly_closure");
  assertEquals(reduced.weekly_state?.status, "completed");
  assertEquals(flow.weekly_gates.synthesis_status, "complete");
  assertEquals(flow.weekly_gates.closure_status, "complete");
  assertEquals(flow.validation_unlock_status, "available");
  assertEquals(
    (reduced.weekly_state?.validation_unlock as any)?.status,
    "available",
  );
});

Deno.test("weekly reducer still blocks completion when synthesis was not rendered", () => {
  const state = weeklyState() as any;
  state.weekly_flow_state.synthesis_visible_status = "not_rendered";
  state.weekly_flow_state.weekly_gates = {
    week_experience_status: "complete",
    action_review_status: "complete",
    global_progress_status: "complete",
    felt_progress_status: "complete",
    solution_fit_status: "captured",
    synthesis_status: "captured",
    closure_status: "missing",
  };
  const output = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "complete_weekly_no_change",
    confidence: "high",
    weekly_intent: {
      kind: "weekly_confirmation",
      summary: "Le user demande de terminer avant synthese visible.",
    },
    weekly_gates: {
      synthesis_status: "captured",
      closure_status: "complete",
    },
    state_updates: {
      status: "completed",
      weekly_stage: "synthesis",
      validation_unlock_status: "available",
      close_after_visible: true,
    },
    visible_task: {
      kind: "weekly_synthesis",
      instruction: "Synthese requise.",
    },
    evidence: ["terminer"],
  });

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: state,
    output,
  });
  const flow = reduced.weekly_state?.weekly_flow_state as any;

  assertEquals(reduced.status, "answered");
  assertEquals(
    reduced.reason_code,
    "weekly_review_completion_requires_synthesis",
  );
  assertEquals(reduced.visible_task, "weekly_synthesis");
  assertEquals(reduced.weekly_state?.status, "open");
  assertEquals(flow.weekly_gates.synthesis_status, "captured");
  assertEquals(flow.validation_unlock_status, "locked_until_weekly_complete");
});

Deno.test("weekly reducer routes safe new adjust recommendation to visible adjust agent", () => {
  const state = weeklyState() as any;
  state.weekly_flow_state.synthesis_visible_status = "rendered";
  state.weekly_flow_state.weekly_gates = {
    week_experience_status: "complete",
    action_review_status: "complete",
    global_progress_status: "complete",
    felt_progress_status: "complete",
    solution_fit_status: "captured",
    synthesis_status: "captured",
    closure_status: "missing",
  };
  const output = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "explain_weekly_reasoning",
    confidence: "high",
    weekly_intent: {
      kind: "weekly_answer",
      summary: "Le user demande la phrase utile a reprendre.",
    },
    adjust_recommendation: {
      status: "ready",
      confidence: 0.98,
      mode: "next_level_required",
      what_to_adjust: [
        "stabiliser une version courte du rituel de fin de journee",
      ],
      why: ["la version complete est trop lourde les soirs tardifs"],
      evidence: ["retour tardif", "version courte confirmee"],
      target_scope: "next_level_inputs",
      destination_instruction: "Validation du niveau",
      safe_to_surface: true,
    },
    weekly_gates: { synthesis_status: "captured" },
    state_updates: { status: "open", weekly_stage: "synthesis" },
    visible_task: {
      kind: "weekly_synthesis",
      instruction: "Mauvais stage propose par le dispatcher.",
    },
    evidence: ["quoi noter pour la suite"],
  });

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: state,
    output,
  });
  const flow = reduced.weekly_state?.weekly_flow_state as any;

  assertEquals(reduced.status, "answered");
  assertEquals(reduced.visible_task, "weekly_adjust_recommendation");
  assertEquals(flow.adjust_recommendation.status, "surfaced");
  assertEquals(flow.adjust_recommendation.surfaced_in_weekly, true);
  assertEquals(
    reduced.conversation_context?.adjust_recommendation.safe_to_surface,
    true,
  );
});

Deno.test("weekly reducer surfaces safe adjust recommendation before premature closure", () => {
  const state = weeklyState() as any;
  state.weekly_flow_state.synthesis_visible_status = "rendered";
  state.weekly_flow_state.weekly_gates = {
    week_experience_status: "complete",
    action_review_status: "complete",
    global_progress_status: "complete",
    felt_progress_status: "complete",
    solution_fit_status: "captured",
    synthesis_status: "captured",
    closure_status: "missing",
  };
  const output = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "complete_flow",
    confidence: "high",
    weekly_intent: {
      kind: "weekly_answer",
      summary:
        "Le user demande quelle intention renseigner dans la validation du niveau.",
    },
    adjust_recommendation: {
      status: "ready",
      confidence: 0.96,
      mode: "next_level_required",
      what_to_adjust: [
        "stabiliser un rythme simple en fin de journee",
      ],
      why: ["les soirs charges cassent la version normale"],
      evidence: ["progres fragile", "soirs tardifs"],
      target_scope: "next_level_inputs",
      destination_instruction: "Validation du niveau",
      safe_to_surface: true,
    },
    weekly_gates: {
      synthesis_status: "complete",
      closure_status: "complete",
    },
    state_updates: {
      status: "completed",
      weekly_stage: "closure",
      validation_unlock_status: "available",
      close_after_visible: true,
    },
    visible_task: {
      kind: "weekly_closure",
      instruction: "Mauvais stage propose par le dispatcher.",
    },
    evidence: ["quoi renseigner", "validation du niveau"],
  });

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: state,
    output,
  });
  const flow = reduced.weekly_state?.weekly_flow_state as any;

  assertEquals(reduced.status, "answered");
  assertEquals(reduced.visible_task, "weekly_adjust_recommendation");
  assertEquals(reduced.weekly_state?.status, "open");
  assertEquals(flow.stage, "synthesis");
  assertEquals(flow.weekly_gates.closure_status, "missing");
  assertEquals(flow.validation_unlock_status, "locked_until_weekly_complete");
  assertEquals(flow.adjust_recommendation.status, "surfaced");
  assertEquals(flow.adjust_recommendation.surfaced_in_weekly, true);
  assertEquals(
    (reduced.weekly_state?.validation_unlock as any)?.status,
    undefined,
  );
});

Deno.test("weekly reducer blocks plan-adjustment exit without promoting to adjust agent", () => {
  const state = weeklyState() as any;
  state.weekly_flow_state.weekly_gates = {
    week_experience_status: "complete",
    action_review_status: "complete",
    global_progress_status: "complete",
    felt_progress_status: "complete",
    solution_fit_status: "captured",
    synthesis_status: "missing",
    closure_status: "missing",
  };
  const output = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "exit_to_global_dispatcher",
    confidence: "high",
    target_dispatcher: "global",
    weekly_intent: {
      kind: "explicit_tool_request",
      summary:
        "Le user demande quoi faire la semaine prochaine et si le plan peut etre ajuste ici.",
    },
    note_information: {
      source_flow_id: "weekly_adaptive_review_v1",
      handoff_reason: "topic_change",
      target_dispatcher: "global",
      handoff_context_for_next_dispatcher:
        "Demande liee au weekly: quoi faire semaine prochaine et ajustement du plan.",
      structured_context: {
        user_message_summary:
          "quoi faire semaine prochaine / ajuster le plan ici",
        active_flow_summary: "weekly actif avant synthese et cloture",
        recommended_next_focus: "global",
      },
      confidence: "high",
    },
    state_updates: { status: "exit_to_global", weekly_stage: "solution_fit" },
    visible_task: { kind: "exit_or_cancel", instruction: "Sortir." },
    evidence: ["semaine prochaine", "ajuster le plan"],
  });

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: state,
    output,
  });

  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.status, "answered");
  assertEquals(
    reduced.reason_code,
    "weekly_review_exit_blocked_until_synthesis_closure",
  );
  assertEquals(reduced.visible_task, "weekly_synthesis");
  assertEquals(reduced.target_dispatcher, "none");
  assertEquals(reduced.weekly_state?.status, "open");
  assertEquals(
    (reduced.weekly_state?.weekly_flow_state as any).stage,
    "synthesis",
  );
});

Deno.test("weekly synthesis can surface stored adjust recommendation", () => {
  const state = weeklyState() as any;
  state.weekly_flow_state.weekly_gates = {
    week_experience_status: "complete",
    action_review_status: "complete",
    global_progress_status: "complete",
    felt_progress_status: "complete",
    solution_fit_status: "captured",
    synthesis_status: "captured",
    closure_status: "missing",
  };
  state.weekly_flow_state.adjust_recommendation = {
    status: "ready",
    confidence: 0.97,
    mode: "next_week_configured",
    what_to_adjust: ["alleger la routine du soir"],
    why: ["la fatigue tardive est repetee"],
    evidence: ["lundi fatigue", "jeudi fatigue"],
    target_scope: "next_week_plan",
    destination_instruction: "Aller dans Ajuster mon plan.",
    safe_to_surface: true,
    surfaced_in_weekly: false,
    updated_at: "2026-06-20T00:00:00.000Z",
  };
  const output = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "recap_weekly",
    confidence: "high",
    weekly_intent: {
      kind: "weekly_recap",
      summary: "Synthese weekly.",
    },
    weekly_gates: { synthesis_status: "complete" },
    state_updates: { status: "open", weekly_stage: "synthesis" },
    visible_task: {
      kind: "weekly_synthesis",
      instruction: "Synthese avec recommandation.",
    },
    evidence: ["synthese"],
  });
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: state,
    output,
  });
  const flow = reduced.weekly_state?.weekly_flow_state as any;

  assertEquals(flow.adjust_recommendation.status, "surfaced");
  assertEquals(flow.adjust_recommendation.surfaced_in_weekly, true);
  assertEquals(flow.synthesis_visible_status, "rendered");
  assertEquals(
    reduced.conversation_context?.known_values.synthesis_visible_status,
    "rendered",
  );
  assertEquals(
    reduced.conversation_context?.adjust_recommendation.surfaced_in_weekly,
    true,
  );
});

Deno.test("weekly review normalizes removed local handoff to global exit", () => {
  const removedHandoff = ["handoff", "to", "local", "flow"].join("_");
  const removedTarget = ["prepare", "attack", "card"].join("_");
  const output = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: removedHandoff,
    confidence: "high",
    risk_score: 0,
    target_dispatcher: removedTarget,
    weekly_intent: {
      kind: "off_topic",
      summary: "User asks for a removed local flow.",
    },
    note_information: {
      source_flow_id: "weekly_adaptive_review_v1",
      handoff_reason: "bridge",
      target_dispatcher: removedTarget,
      handoff_context_for_next_dispatcher:
        "Weekly exits because user asked for a removed local flow.",
      structured_context: {
        recommended_next_focus: removedTarget,
      },
      confidence: "high",
    },
    exit_memo: {
      needed: true,
      reason: "normal_coaching",
      user_intent_summary: "User asks for a removed local flow.",
      local_flow_context: {
        skill_id: "weekly_adaptive_review_v1",
        weekly_stage: "strategy_ready",
        week_strategy: null,
        last_weekly_question: null,
        last_visible_summary: null,
        last_handoff_summary: null,
        validation_unlock_status: "locked_until_weekly_complete",
        committed_effects: [],
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "normal_coaching",
        why: "Removed local flow.",
      },
    },
    evidence: ["prepare une carte"],
  });

  assertEquals(output.flow_action, "exit_to_global_dispatcher");
  assertEquals(output.target_dispatcher, "global");
  assertEquals(output.note_information?.target_dispatcher, "global");
});

Deno.test("weekly review normalizes safety preempt to global dispatcher exit", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "safety_preempt",
    confidence: "high",
    risk_score: 9,
    target_dispatcher: "safety_crisis",
    weekly_intent: {
      kind: "safety",
      summary: "User expresses a safety risk during weekly.",
    },
    note_information: {
      source_flow_id: "weekly_adaptive_review_v1",
      handoff_reason: "safety",
      target_dispatcher: "safety_crisis",
      handoff_context_for_next_dispatcher:
        "Weekly detected safety risk; global dispatcher must re-route safety.",
      structured_context: {
        recommended_next_focus: "safety_crisis",
        active_flow_summary: "weekly active",
      },
      confidence: "high",
    },
    exit_memo: {
      needed: true,
      reason: "safety",
      user_intent_summary: "User expresses a safety risk during weekly.",
      local_flow_context: {
        skill_id: "weekly_adaptive_review_v1",
        weekly_stage: "action_review",
        week_strategy: null,
        last_weekly_question: null,
        last_visible_summary: null,
        last_handoff_summary: null,
        validation_unlock_status: "locked_until_weekly_complete",
        committed_effects: [],
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "unknown",
        why: "Safety must be handled by global safety routing.",
      },
    },
    evidence: ["safety risk"],
  });

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });

  assertEquals(output.flow_action, "exit_to_global_dispatcher");
  assertEquals(output.target_dispatcher, "global");
  assertEquals(output.note_information?.target_dispatcher, "global");
  assertEquals(output.note_information?.handoff_reason, "safety");
  assertEquals(reduced.status, "exit");
  assertEquals(
    reduced.reason_code,
    "weekly_review_safety_exit_to_global_dispatcher",
  );
  assertEquals(reduced.exit_to_global_dispatcher, true);
  assertEquals(reduced.target_dispatcher, "global");
});

Deno.test("weekly review rejects coaching target to global on safety", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "exit_to_global_dispatcher",
    confidence: "high",
    risk_score: 8,
    target_dispatcher: removedCoachingTarget(),
    weekly_intent: {
      kind: "safety",
      summary: "User expresses a safety risk while asking what to use.",
    },
    note_information: {
      source_flow_id: "weekly_adaptive_review_v1",
      handoff_reason: "safety",
      target_dispatcher: removedCoachingTarget(),
      handoff_context_for_next_dispatcher:
        "Safety signal must go through global dispatcher first.",
      structured_context: {
        recommended_next_focus: removedCoachingTarget(),
      },
      confidence: "high",
    },
    exit_memo: {
      needed: true,
      reason: "safety",
      user_intent_summary: "User expresses a safety risk.",
      local_flow_context: {
        skill_id: "weekly_adaptive_review_v1",
        weekly_stage: "action_review",
        week_strategy: null,
        last_weekly_question: null,
        last_visible_summary: null,
        last_handoff_summary: null,
        validation_unlock_status: "locked_until_weekly_complete",
        committed_effects: [],
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "normal_coaching",
        why: "Safety overrides recommendation bridge.",
      },
    },
    evidence: ["risk signal"],
  });

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });

  assertEquals(output.target_dispatcher, "global");
  assertEquals(output.note_information?.target_dispatcher, "global");
  assertEquals(output.note_information?.handoff_reason, "safety");
  assertEquals(reduced.status, "exit");
  assertEquals(reduced.target_dispatcher, "global");
  assertEquals(
    reduced.reason_code,
    "weekly_review_safety_exit_to_global_dispatcher",
  );
});

Deno.test("weekly review no longer targets coaching recommendation", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "exit_to_global_dispatcher",
    confidence: "high",
    risk_score: 0,
    target_dispatcher: removedCoachingTarget(),
    weekly_intent: {
      kind: "off_topic",
      summary: "User asks which Sophia lever to use.",
    },
    note_information: {
      source_flow_id: "weekly_adaptive_review_v1",
      handoff_reason: "topic_change",
      target_dispatcher: removedCoachingTarget(),
      handoff_context_for_next_dispatcher:
        "Weekly exits because user asks which Sophia feature to use.",
      structured_context: {
        recommended_next_focus: removedCoachingTarget(),
      },
      confidence: "high",
    },
    exit_memo: {
      needed: true,
      reason: "normal_coaching",
      user_intent_summary: "User asks which Sophia lever to use.",
      local_flow_context: {
        skill_id: "weekly_adaptive_review_v1",
        weekly_stage: "strategy_ready",
        week_strategy: null,
        last_weekly_question: null,
        last_visible_summary: null,
        last_handoff_summary: null,
        validation_unlock_status: "locked_until_weekly_complete",
        committed_effects: [],
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "normal_coaching",
        why: "Feature choice related to blocker.",
      },
    },
    evidence: ["feature choice"],
  });

  assertEquals(output.flow_action, "exit_to_global_dispatcher");
  assertEquals(output.target_dispatcher, "global");
  assertEquals(output.child_flow, null);
  assertEquals(
    output.note_information?.target_dispatcher,
    "global",
  );
  assertEquals(
    output.note_information?.structured_context.bridge_kind,
    undefined,
  );

  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "exit");
  assertEquals(reduced.weekly_state, null);
});

Deno.test("weekly review exits global when raw coaching note is missing", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "exit_to_global_dispatcher",
    confidence: "high",
    risk_score: 0,
    target_dispatcher: removedCoachingTarget(),
    weekly_intent: {
      kind: "off_topic",
      summary: "User does not know which Sophia lever to use.",
    },
    exit_memo: {
      needed: true,
      reason: "normal_coaching",
      user_intent_summary: "User does not know which Sophia lever to use.",
      local_flow_context: {
        skill_id: "weekly_adaptive_review_v1",
        weekly_stage: "action_review",
        week_strategy: null,
        last_weekly_question: null,
        last_visible_summary: "bilan weekly en cours",
        last_handoff_summary: null,
        validation_unlock_status: "locked_until_weekly_complete",
        committed_effects: [],
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "normal_coaching",
        why: "Feature choice related to blocker.",
      },
    },
    evidence: ["je sais pas quel levier utiliser"],
  });

  assertEquals(output.flow_action, "exit_to_global_dispatcher");
  assertEquals(output.target_dispatcher, "global");
  assertEquals(output.child_flow, null);
  assertEquals(
    output.note_information?.structured_context.bridge_kind,
    undefined,
  );
  assertEquals(output.note_information, null);
});

Deno.test("weekly review forgotten progress correction is not coaching bridge", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "forgotten_progress_correction",
    confidence: "high",
    risk_score: 0,
    target_dispatcher: "none",
    weekly_intent: {
      kind: "forgotten_progress",
      summary: "User reports forgotten Thursday progress for the review.",
    },
    forgotten_progress: {
      status: "candidate",
      target_hint: "Marcher 10 min",
      outcome_hint: "partial",
      evidence: "jeudi",
    },
    action_status_updates: [{
      plan_item_id: "item-1",
      occurrence_id: "occ-1",
      title: "Marcher 10 min",
      corrected_status: "partial",
      user_evidence:
        "j'ai oublie de faire l'action jeudi mais je veux te le dire pour le bilan",
      source_turn_summary: "progression oubliee jeudi",
    }],
    state_updates: {
      status: "open",
      weekly_stage: "action_review",
      validation_unlock_status: "locked_until_weekly_complete",
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: "forgotten_progress_ack",
      instruction: "",
      conversation_context: {},
    },
    exit_memo: { needed: false, reason: "none" },
    evidence: ["progression retrospective"],
  });

  assertEquals(output.target_dispatcher, "none");
  assertEquals(output.note_information, null);
});

Deno.test("weekly review product question exits global, not product child flow", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "exit_to_global_dispatcher",
    confidence: "high",
    risk_score: 0,
    target_dispatcher: "global",
    weekly_intent: {
      kind: "explicit_tool_request",
      summary: "User asks what a defense card is.",
    },
    note_information: {
      source_flow_id: "weekly_adaptive_review_v1",
      handoff_reason: "explicit_user_request",
      target_dispatcher: "global",
      handoff_context_for_next_dispatcher: "Product question from weekly.",
      structured_context: { recommended_next_focus: "product_help" },
      confidence: "high",
    },
    exit_memo: {
      needed: true,
      reason: "product_help",
      user_intent_summary: "User asks what a defense card is.",
      local_flow_context: {
        skill_id: "weekly_adaptive_review_v1",
        weekly_stage: "action_review",
        week_strategy: null,
        last_weekly_question: null,
        last_visible_summary: null,
        last_handoff_summary: null,
        validation_unlock_status: "locked_until_weekly_complete",
        committed_effects: [],
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "product_help",
        why: "Product question.",
      },
    },
    evidence: ["product question"],
  });
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });

  assertEquals(output.note_information?.target_dispatcher, "global");
  assertEquals(reduced.weekly_state, null);
  assertEquals(reduced.target_dispatcher, "global");
});

Deno.test("weekly review exit does not call visible agent", async () => {
  let visibleCalled = false;
  const activeWeeklyState = {
    skill_id: "weekly_adaptive_review_v1",
    ...weeklyState(),
  };
  const runtime = await runWeeklyReviewLocalRuntime({
    supabase: {} as any,
    userId: "user-weekly-exit",
    tempMemory: {
      [ACTIVE_CONVERSATION_SKILL_KEY]: activeWeeklyState,
      __active_skill_state: activeWeeklyState,
      active_skill_state: activeWeeklyState,
    },
    activeSkillState: activeWeeklyState,
    userMessage: "C'est quoi une carte de defense ?",
    history: [],
    dispatcher: async () =>
      normalizeWeeklyReviewLocalDispatcherOutput({
        flow_action: "exit_to_global_dispatcher",
        confidence: "high",
        risk_score: 0,
        target_dispatcher: "global",
        weekly_intent: {
          kind: "explicit_tool_request",
          summary: "User asks a product question.",
        },
        note_information: {
          source_flow_id: "weekly_adaptive_review_v1",
          handoff_reason: "explicit_user_request",
          target_dispatcher: "global",
          handoff_context_for_next_dispatcher: "Product question from weekly.",
          structured_context: { recommended_next_focus: "product_help" },
          confidence: "high",
        },
        exit_memo: {
          needed: true,
          reason: "product_help",
          user_intent_summary: "User asks a product question.",
          local_flow_context: {
            skill_id: "weekly_adaptive_review_v1",
            weekly_stage: "action_review",
            week_strategy: null,
            last_weekly_question: null,
            last_visible_summary: null,
            last_handoff_summary: null,
            validation_unlock_status: "locked_until_weekly_complete",
            committed_effects: [],
          },
          handoff_hint_for_global_dispatcher: {
            likely_intent: "product_help",
            why: "Product question.",
          },
        },
        evidence: ["product question"],
      }),
    visibleAgent: async () => {
      visibleCalled = true;
      return "visible should not run";
    },
  });

  assertEquals(visibleCalled, false);
  assertEquals(runtime?.content, "");
  assertEquals(runtime?.toolSkillRun.status, "exit_to_global");
  assertEquals(runtime?.toolSkillRun.target_dispatcher, "global");
  assertEquals(
    (runtime?.nextTempMemory as any)[ACTIVE_CONVERSATION_SKILL_KEY],
    undefined,
  );
  assertEquals(
    (runtime?.nextTempMemory as any).__active_skill_state,
    undefined,
  );
  assertEquals((runtime?.nextTempMemory as any).active_skill_state, undefined);
});

Deno.test("weekly local dispatcher exposes one-shot reminder direct effect request", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput({
    flow_action: "confirm_weekly_diagnostic",
    confidence: "high",
    weekly_intent: {
      kind: "weekly_confirmation",
      summary: "User continues weekly and asks for a one-shot reminder.",
    },
    direct_effect_request: {
      requested: true,
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {
        raw_text: "rappelle-moi demain a 18h de relire cette version allegee",
        when_hint: "demain a 18h",
        UTC_time: "2026-06-25T16:00:00.000Z",
        local_label: "demain a 18h",
        instruction_hint: "relire cette version allegee",
      },
      reason: "explicit one-shot reminder during weekly",
    },
    weekly_gates: {
      global_progress_status: "captured",
      felt_progress_status: "captured",
    },
    visible_task: {
      kind: "qualify_solution_fit",
      instruction: "Continuer le weekly sur le besoin restant.",
    },
    evidence: ["rappelle-moi demain a 18h"],
  });

  assertEquals(output.direct_effect_request.requested, true);
  assertEquals(
    oneShotDirectEffectFromWeeklyReviewLocalDispatcherOutput(output)
      ?.payload_hint,
    {
      raw_text: "rappelle-moi demain a 18h de relire cette version allegee",
      when_hint: "demain a 18h",
      UTC_time: "2026-06-25T16:00:00.000Z",
      local_label: "demain a 18h",
      instruction_hint: "relire cette version allegee",
    },
  );
  assertEquals(
    oneShotDirectEffectFromWeeklyReviewLocalDispatcherOutput(output, {
      turnFrame: {
        direct_effects: [{
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            raw_text:
              "rappelle-moi demain a 18h de relire cette version allegee",
            when_hint: "demain a 18h",
            instruction_hint: "relire cette version allegee",
          },
        }],
      },
    }),
    null,
  );
});

Deno.test("weekly runtime forwards committed one-shot reminder context and continues flow", async () => {
  const activeWeeklyState = {
    skill_id: "weekly_adaptive_review_v1",
    ...weeklyState(),
  };
  let visibleInput: any = null;
  const committedEffect = {
    type: "create_one_shot_reminder",
    reminder_id: "reminder-weekly-1",
    local_label: "demain",
    reminder_instruction: "continuer le weekly",
  };
  const runtime = await runWeeklyReviewLocalRuntime({
    supabase: {} as any,
    userId: "user-weekly-reminder",
    tempMemory: { __active_skill_state: activeWeeklyState },
    activeSkillState: activeWeeklyState,
    userMessage: "Ok, rappelle-moi demain et on continue le weekly.",
    history: [
      { role: "user", content: "Ok, rappelle-moi demain et on continue." },
    ],
    turnFrame: {
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        instruction: "continuer le weekly",
      }],
      direct_effect_lane: {
        committed_effects: [committedEffect],
        requested_effects: [],
        blocked_effects: [],
        visible_confirmation_hint: "Je te le rappellerai demain.",
      },
    },
    dispatcher: async () =>
      normalizeWeeklyReviewLocalDispatcherOutput({
        flow_action: "confirm_weekly_diagnostic",
        confidence: "high",
        weekly_intent: {
          kind: "weekly_confirmation",
          summary: "User veut continuer le weekly apres le rappel.",
        },
        human_signal_updates: {
          objective_delta: "slight_progress",
          felt_progress: "neutral",
          felt_state: "stable",
        },
        weekly_gates: {
          global_progress_status: "captured",
          felt_progress_status: "captured",
        },
        state_updates: {
          status: "open",
          weekly_stage: "solution_fit",
        },
        visible_task: {
          kind: "qualify_solution_fit",
          instruction: "Continuer le weekly sans recreer le rappel.",
        },
        evidence: ["rappel ponctuel deja pris en charge", "continue weekly"],
      }),
    visibleAgent: async (input) => {
      visibleInput = input;
      return "Je te le rappellerai demain. On continue le point weekly.";
    },
  });

  assertEquals(runtime?.content.includes("On continue le point weekly."), true);
  assertEquals(
    visibleInput?.direct_effect_confirmation_context
      ?.has_committed_one_shot_reminder,
    true,
  );
  const toolSkillRun = runtime?.toolSkillRun as any;
  assertEquals(
    toolSkillRun?.direct_effect_confirmation_context
      ?.has_committed_one_shot_reminder,
    true,
  );
  assertEquals(
    toolSkillRun?.direct_effect_confirmation_context?.one_shot_reminder,
    {
      committed: true,
      local_label: "demain",
      reminder_instruction: "continuer le weekly",
    },
  );
  assertEquals(
    toolSkillRun?.direct_effect_confirmation_context?.committed_effects,
    [],
  );
  assertEquals(toolSkillRun?.target_dispatcher, "none");
});

Deno.test("weekly runtime injects next-level planning context when no next week is configured", async () => {
  const activeWeeklyState = {
    skill_id: "weekly_adaptive_review_v1",
    ...weeklyState(),
  } as any;
  delete activeWeeklyState.weekly_flow_state.weekly_planning_context;
  let dispatcherPlanningMode: string | null = null;
  let visiblePlanningMode: string | null = null;
  const runtime = await runWeeklyReviewLocalRuntime({
    supabase: {} as any,
    userId: "user-weekly-next-level",
    tempMemory: { __active_skill_state: activeWeeklyState },
    activeSkillState: activeWeeklyState,
    userMessage: "Ok, et pour la suite je fais quoi ?",
    v2Runtime: {
      cycle: null,
      transformation: { title: "Transformation test" },
      plan: {
        content: {
          version: 3,
          title: "Plan test",
          user_summary: "Stabiliser sans surcharge",
          progression_logic: "Monter de niveau apres consolidation.",
          strategy: {
            success_definition: "Une routine stable",
            main_constraint: "fatigue tardive",
          },
          current_level_runtime: {
            level_order: 1,
            title: "Niveau 1",
            rationale: "Construire la base.",
            why_this_now: "Le socle manque.",
            how_this_phase_works: "Calibrage progressif.",
            weeks: [{
              week_order: 1,
              title: "Semaine courante",
              status: "current",
            }],
          },
          plan_blueprint: {
            levels: [{
              level_order: 2,
              title: "Niveau 2",
              intention: "Augmenter legerement",
              preview_summary: "Suite apres validation",
            }],
          },
        },
      },
      progress_markers: [],
      plan_item_counts: {} as any,
    } as any,
    dispatcher: async (input) => {
      dispatcherPlanningMode = (input.weekly_state.weekly_flow_state as any)
        .weekly_planning_context.mode;
      return normalizeWeeklyReviewLocalDispatcherOutput({
        flow_action: "answer_weekly_question",
        confidence: "high",
        weekly_intent: {
          kind: "weekly_answer",
          summary: "Le user demande la suite.",
        },
        weekly_gates: {
          global_progress_status: "captured",
          felt_progress_status: "captured",
        },
        state_updates: { status: "open", weekly_stage: "synthesis" },
        visible_task: {
          kind: "weekly_synthesis",
          instruction: "Synthese avec contexte prochain niveau.",
        },
        evidence: ["demande suite"],
      });
    },
    visibleAgent: async (input) => {
      visiblePlanningMode = input.conversation_context.weekly_planning_context
        .mode;
      return "Synthese avec prochain niveau.";
    },
  });

  assertEquals(runtime?.content, "Synthese avec prochain niveau.");
  assertEquals(dispatcherPlanningMode, "next_level_required");
  assertEquals(visiblePlanningMode, "next_level_required");
});
