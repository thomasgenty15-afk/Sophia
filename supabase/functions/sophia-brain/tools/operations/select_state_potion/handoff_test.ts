import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { runSelectStatePotionHandoffSkill } from "./handoff.ts";
import { loadStatePotionHandoffStateFromTempMemory } from "./state.ts";
import {
  structuredStatePotionDraftGenerator,
  structuredStatePotionSlotFiller,
} from "./test_helpers.ts";
import type {
  ClarteDispatcherOutput,
  StatePotionHandoffDraft,
} from "./contract.ts";

const fakeSupabase = {} as any;
const fakeSafetyPregate = {
  risk_band: "none",
  reason_codes: [],
  evidence: [],
} as any;
const highSafetyPregate = {
  risk_band: "high",
  reason_codes: ["test_high_risk"],
  evidence: ["test"],
} as any;
const selectPotionRouteDecision = {
  response_owner: "tool_skill",
  selected_handler: "select_state_potion",
  reason_code: "test",
  direct_effects_to_run: [],
  blocked_paths: [],
} as any;

function baseArgs(overrides: Record<string, unknown> = {}) {
  return {
    supabase: fakeSupabase,
    userId: "u1",
    userMessage:
      "Je suis tendu, je veux peut-être une potion, mais pas un suivi.",
    channel: "whatsapp" as const,
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: selectPotionRouteDecision,
    safetyPregateOutput: fakeSafetyPregate,
    sourceMessageId: "m-handoff",
    requestId: "r-handoff",
    clarificationLlmRunnerOverride: null,
    slotFillerOverride: structuredStatePotionSlotFiller({
      state_kind: "stress_pressure",
      selected_potion: "apaisement",
    }),
    draftGeneratorOverride: structuredStatePotionDraftGenerator(),
    ...overrides,
  };
}

function clarteDispatcherOutput(
  overrides: Partial<ClarteDispatcherOutput>,
): ClarteDispatcherOutput {
  const fieldState = overrides.field_state ?? {
    status: "missing",
    candidate_value: null,
    locked_value: null,
    previous_value: null,
    needs_user_confirmation: false,
    why_status: "test",
  };
  return {
    flow_action: overrides.flow_action ?? "answer_current_field",
    confidence: overrides.confidence ?? "high",
    selected_potion: "clarte",
    field_id: "plan_meaning_loss_reason",
    field_state: fieldState,
    revision: overrides.revision ?? {
      is_revision: false,
      replacement_value: null,
      replaces_previous_value: false,
    },
    visible_task: overrides.visible_task ?? {
      kind: fieldState.status === "locked"
        ? "handoff_ready"
        : fieldState.status === "proposed"
        ? "confirm_proposal"
        : "ask_deeper",
      required_data: {
        potion_name: "Potion de clarté",
        field_label:
          "Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?",
        field_value: fieldState.locked_value ?? fieldState.candidate_value,
        platform_destination: "section État / Potions",
      },
    },
    exit_memo: overrides.exit_memo ?? {
      needed: false,
      reason: "none",
      flow_summary: null,
      collected_value: fieldState.locked_value ?? fieldState.candidate_value,
      handoff_hint_for_global_dispatcher: null,
    },
    no_chat_mutation: {
      potion_session_created: false,
      recurring_reminder_created: false,
      scheduled_checkin_created: false,
      executable_confirmation_generated: false,
    },
    risk_assessment: overrides.risk_assessment ?? {
      risk_score: 0,
      risk_band: "none",
      safety_preempt: false,
      reason_codes: [],
    },
    evidence: overrides.evidence ?? ["test"],
  };
}

async function deliveredDraft(): Promise<StatePotionHandoffDraft> {
  const result = await runSelectStatePotionHandoffSkill(baseArgs());
  const draft = (result?.toolSkillRun as any)?.platform_handoff?.draft;
  if (!draft) throw new Error("missing_handoff_draft");
  return draft;
}

Deno.test("potion handoff produces full renderer content", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs());
  assert(result);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.executedTools, []);
  assertEquals((result.toolSkillRun as any).status, "handoff_delivered");
  assertEquals((result.toolSkillRun as any).no_chat_mutation, true);
  assertStringIncludes(result.content, "Ce que je comprends");
  assertStringIncludes(result.content, "Je te conseille de choisir");
  assertStringIncludes(result.content, "Pourquoi cette potion");
  assertStringIncludes(result.content, "Petit pas immédiat");
  assertStringIncludes(result.content, "À mettre dans la plateforme");
  assertStringIncludes(result.content, "Potion : Potion d'apaisement");
  assertStringIncludes(
    result.content,
    "Qu'est-ce qui te met le plus sous pression la ?",
  );
  assertStringIncludes(result.content, "Tu te sens plutot comment ?");
  assertEquals(
    result.content.includes(
      "tu pourras aussi préciser si c'est lié à ton plan ou hors plan",
    ),
    false,
  );
  assertStringIncludes(result.content, "section État / Potions");
  assertStringIncludes(
    result.content,
    "Je ne lance pas de potion depuis le chat.",
  );
  assertEquals(result.content.includes("À préserver"), false);
  assertEquals(result.content.includes("À éviter"), false);
  assertEquals(result.content.includes("Pas immédiat"), false);
  assertEquals(result.content.includes("Tu as besoin de quoi ?"), false);
  assertEquals(
    result.content.includes("Si tu veux, ajoute ce qui a allume l'alerte"),
    false,
  );
});

Deno.test("potion handoff does not expose internal evidence placeholders", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage:
      "Je veux une potion de courage pour envoyer ce message, je bloque par peur du conflit.",
    slotFillerOverride: structuredStatePotionSlotFiller({
      state_kind: "fear_avoidance",
      selected_potion: "courage",
      detail_answers: [{
        question_id: "avoidance_target",
        label: "Qu'est-ce que tu evites en ce moment ?",
        answer: "envoyer ce message",
        evidence: ["current_user_message"],
      }, {
        question_id: "blocker_kind",
        label: "Qu'est-ce qui bloque le plus ?",
        answer: "La peur du conflit",
        evidence: ["user_message_describes_fear"],
      }],
    }),
  }));

  assert(result);
  assertStringIncludes(result.content, "envoyer ce message");
  assertStringIncludes(result.content, "La peur du conflit");
  assertEquals(result.content.includes("current_user_message"), false);
  assertEquals(result.content.includes("User explicitly"), false);
  assertEquals(result.content.includes("user_message_describes"), false);
});

Deno.test("rappel handoff carries only two platform fields and does not ask plan scope in chat", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage:
      "Je sens que je décroche de mon sport, je repousse tout le temps. Je veux une potion.",
    slotFillerOverride: structuredStatePotionSlotFiller({
      state_kind: "decrochage",
      selected_potion: "rappel",
      detail_answers: [{
        question_id: "drift_target",
        label: "Par rapport a quoi tu sens que tu decroches ?",
        answer: "mon sport",
        evidence: ["mon sport"],
      }, {
        question_id: "drift_style",
        label: "Tu decroches plutot comment ?",
        answer: "repousse",
        evidence: ["repousse"],
      }],
    }),
  }));

  assert(result);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.executedTools, []);
  assertEquals((result.toolSkillRun as any).committed_effects, []);
  const inputs = (result.toolSkillRun as any).platform_handoff.draft
    .recommendation.platform_inputs;
  assertEquals(inputs.answers.map((answer: any) => answer.question_id), [
    "drift_target",
    "drift_style",
  ]);
  assertEquals(inputs.optional_free_text, null);
  assertStringIncludes(result.content, "Potion : Potion anti-décrochage");
  assertEquals(
    result.content.includes(
      "tu pourras aussi préciser si c'est lié à ton plan ou hors plan",
    ),
    false,
  );
  assertEquals(
    result.content.includes("Qu'est-ce qui t'aiderait le plus"),
    false,
  );
  assertEquals(
    result.content.includes("Si tu veux, ajoute ce que tu sens"),
    false,
  );
  assertEquals(
    result.content.includes("Ce champ reste " + "optionnel"),
    false,
  );
  assertEquals(result.content.includes("C'est lié à mon plan"), false);
  assertEquals(result.content.includes("C'est hors plan"), false);
  assertEquals(result.content.includes("choisir une action"), false);
});

Deno.test("courage handoff carries only two platform fields and leaves plan scope to platform", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage:
      "Je veux une potion de courage pour envoyer ce message, je bloque par peur du conflit.",
    slotFillerOverride: structuredStatePotionSlotFiller({
      state_kind: "fear_avoidance",
      selected_potion: "courage",
      detail_answers: [{
        question_id: "avoidance_target",
        label: "Qu'est-ce que tu evites en ce moment ?",
        answer: "envoyer ce message",
        evidence: ["envoyer ce message"],
      }, {
        question_id: "blocker_kind",
        label: "Qu'est-ce qui bloque le plus ?",
        answer: "La peur du conflit",
        evidence: ["peur du conflit"],
      }],
    }),
  }));

  assert(result);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.executedTools, []);
  const inputs = (result.toolSkillRun as any).platform_handoff.draft
    .recommendation.platform_inputs;
  assertEquals(inputs.answers.map((answer: any) => answer.question_id), [
    "avoidance_target",
    "blocker_kind",
  ]);
  assertEquals(inputs.optional_free_text, null);
  assertEquals(
    result.content.includes(
      "tu pourras aussi préciser si c'est lié à ton plan ou hors plan",
    ),
    false,
  );
  assertEquals(result.content.includes("Tu as surtout besoin de quoi"), false);
  assertEquals(result.content.includes("C'est lié à mon plan"), false);
  assertEquals(result.content.includes("C'est hors plan"), false);
  assertEquals(result.content.includes("Quelle action du plan"), false);
});

Deno.test("guerison handoff carries only two platform fields and leaves plan scope to platform", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage:
      "J'ai craque hier et je me parle hyper violemment depuis. Je veux une potion de guerison.",
    slotFillerOverride: structuredStatePotionSlotFiller({
      state_kind: "shame_guilt",
      selected_potion: "guerison",
      detail_answers: [{
        question_id: "recent_hurt",
        label: "Qu'est-ce qui t'a fait mal ou t'a fait retomber recemment ?",
        answer: "j'ai craque hier et je me parle violemment",
        evidence: ["j'ai craque hier"],
      }, {
        question_id: "dominant_feeling",
        label: "Tu ressens surtout quoi ?",
        answer: "honte",
        evidence: ["honte"],
      }],
    }),
  }));

  assert(result);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.executedTools, []);
  assertEquals((result.toolSkillRun as any).committed_effects, []);
  const inputs = (result.toolSkillRun as any).platform_handoff.draft
    .recommendation.platform_inputs;
  assertEquals(inputs.answers.map((answer: any) => answer.question_id), [
    "recent_hurt",
    "dominant_feeling",
  ]);
  assertEquals(inputs.optional_free_text, null);
  assertEquals(
    result.content.includes(
      "tu pourras aussi préciser si c'est lié à ton plan ou hors plan",
    ),
    false,
  );
  assertEquals(result.content.includes("repair_need"), false);
  assertEquals(
    result.content.includes("Tu as surtout besoin de quoi maintenant"),
    false,
  );
  assertEquals(result.content.includes("C'est lié à mon plan"), false);
  assertEquals(result.content.includes("C'est hors plan"), false);
  assertEquals(result.content.includes("Quelle action du plan"), false);
});

Deno.test("amour handoff carries only two platform fields and leaves plan scope to platform", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage:
      "Je me sens en manque d'amour autour de mon ecriture, je suis dur avec moi. Je veux une potion d'amour.",
    slotFillerOverride: structuredStatePotionSlotFiller({
      state_kind: "self_harshness",
      selected_potion: "amour",
      detail_answers: [{
        question_id: "love_lack_context",
        label:
          "Par rapport a quoi est-ce que tu te sens en manque d'amour en ce moment ?",
        answer: "mon ecriture que je juge nulle",
        evidence: ["mon ecriture"],
      }, {
        question_id: "love_state",
        label: "Tu te sens surtout comment ?",
        answer: "dur",
        evidence: ["dur avec moi"],
      }],
    }),
  }));

  assert(result);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.executedTools, []);
  assertEquals((result.toolSkillRun as any).committed_effects, []);
  const inputs = (result.toolSkillRun as any).platform_handoff.draft
    .recommendation.platform_inputs;
  assertEquals(inputs.answers.map((answer: any) => answer.question_id), [
    "love_lack_context",
    "love_state",
  ]);
  assertEquals(inputs.optional_free_text, null);
  assertStringIncludes(
    result.content,
    "Par rapport a quoi est-ce que tu te sens en manque d'amour en ce moment ?",
  );
  assertStringIncludes(result.content, "Tu te sens surtout comment ?");
  assertEquals(
    result.content.includes(
      "tu pourras aussi préciser si c'est lié à ton plan ou hors plan",
    ),
    false,
  );
  assertEquals(result.content.includes("Tu as surtout besoin de quoi"), false);
  assertEquals(result.content.includes(["love", "need"].join("_")), false);
  assertEquals(
    result.content.includes(
      "Comment est-ce " + "que tu te parles en ce moment ?",
    ),
    false,
  );
  assertEquals(
    result.content.includes(
      "Pourquoi est-ce que tu manques " + "d'amour",
    ),
    false,
  );
  assertEquals(
    result.content.includes("Ce champ reste " + "optionnel"),
    false,
  );
  assertEquals(result.content.includes("C'est lié à mon plan"), false);
  assertEquals(result.content.includes("C'est hors plan"), false);
  assertEquals(result.content.includes("Quelle action du plan"), false);
});

Deno.test("potion handoff does not duplicate platform destination in steps", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs());
  assert(result);
  assertStringIncludes(result.content, "Dans la plateforme");
  assertStringIncludes(result.content, "section État / Potions");
  assertEquals(
    (result.content.match(/section État \/ Potions/g) ?? []).length,
    1,
  );
});

Deno.test("potion handoff never creates confirmation token or calls executable potion writers", async () => {
  for (const fileName of ["executor.ts", "persistence.ts"]) {
    try {
      await Deno.stat(new URL(`./${fileName}`, import.meta.url));
      throw new Error(`legacy_select_state_potion_${fileName}_still_exists`);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }
  const runtimeText = await Deno.readTextFile(
    new URL("./handoff.ts", import.meta.url),
  );
  const pipelineText = await Deno.readTextFile(
    new URL("../../../router/operation_runtime_pipeline.ts", import.meta.url),
  );
  assertEquals(runtimeText.includes("createConfirmationToken"), false);
  assertEquals(runtimeText.includes("executeActivateStatePotion"), false);
  assertEquals(runtimeText.includes("writeStatePotionActivation"), false);
  assertEquals(runtimeText.includes("user_recurring_reminders"), false);
  assertEquals(runtimeText.includes("scheduled_checkins"), false);
  for (
    const forbidden of [
      "isExplicitSelectStatePotionRequest",
      "looksLikeOneShotReminderHandoff",
      "detectsPlatformRecommendationRequest",
      "detectsImmediateOrNoFollowupTiming",
      "detectsImmediateSupportVsPotionAmbiguity",
      "detectsRepeatHandoff",
      "detectsReviseHandoff",
      "hasExplicitStatePotionActivationApproval",
    ]
  ) {
    assertEquals(runtimeText.includes(forbidden), false, forbidden);
  }
  assertEquals(
    pipelineText.includes("maybeRunSelectStatePotionOperation"),
    false,
  );
});

Deno.test("apply_attempt does not execute and repeats platform destination", async () => {
  const draft = await deliveredDraft();
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "ok vas-y active-la",
    routeDecision: {
      ...selectPotionRouteDecision,
      reason_code: "confirmation_yes_is_handoff_apply_attempt",
    },
    turnFrame: {
      confirmation_response: { kind: "yes", confidence_band: "high" },
    } as any,
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
  }));
  assert(result);
  assertEquals(result.executedTools, []);
  assertEquals((result.toolSkillRun as any).status, "apply_attempt");
  assertStringIncludes(
    result.content,
    "Je ne peux pas le créer/lancer depuis le chat.",
  );
  assertStringIncludes(result.content, "section État / Potions");
  assertStringIncludes(result.content, "Choisis : Potion d'apaisement.");
  assertStringIncludes(result.content, "À renseigner :");
  assertEquals(result.content.includes("Pourquoi cette potion"), false);
  assertEquals(result.content.includes("Petit pas immédiat"), false);
  assertEquals((result.toolSkillRun as any).committed_effects, []);
  assertEquals((result.toolSkillRun as any).requested_effects, []);
  assertEquals((result.toolSkillRun as any).allowed_effects, []);
  assertEquals((result.toolSkillRun as any).pending_confirmation, undefined);
});

Deno.test("structured handoff_apply_attempt renders short potion redirect", async () => {
  const draft = await deliveredDraft();
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "Ok vas-y active-la.",
    routeDecision: {
      ...selectPotionRouteDecision,
      reason_code: "active_handoff_apply_attempt",
      active_flow_arbitration: {
        decision: "continue_handoff",
        active_owner: "tool_skill",
        selected_owner: "select_state_potion",
        resume_policy: "active_handoff_continue",
        reason_code: "active_handoff_apply_attempt",
        continuation_intent: "handoff_apply_attempt",
      },
    },
    turnFrame: {
      active_handoff_action: {
        type: "handoff_apply_attempt",
        confidence: "high",
        evidence: ["Ok vas-y active-la."],
        target_skill_id: "select_state_potion",
      },
    } as any,
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
  }));

  assert(result);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.executedTools, []);
  assertEquals((result.toolSkillRun as any).status, "apply_attempt");
  assertEquals((result.toolSkillRun as any).committed_effects, []);
  assertStringIncludes(
    result.content,
    "Je ne peux pas le créer/lancer depuis le chat.",
  );
  assertStringIncludes(result.content, "section État / Potions");
  assertStringIncludes(result.content, "Choisis : Potion d'apaisement.");
  assertStringIncludes(result.content, "À renseigner :");
  assertEquals(result.content.includes("c'est activé"), false);
  assertEquals(result.content.includes("j'ai lancé"), false);
  assertEquals(result.content.includes("j'ai créé"), false);
  assertEquals(result.content.includes("je t'ai programmé"), false);
  assertEquals(result.content.includes("Pourquoi cette potion"), false);
  assertEquals(result.content.includes("Petit pas immédiat"), false);
});

Deno.test("platform destination followup renders short path without full handoff", async () => {
  const draft = await deliveredDraft();
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "Et je la lance où exactement dans la plateforme ?",
    routeDecision: {
      ...selectPotionRouteDecision,
      reason_code: "active_handoff_platform_destination_followup",
      active_flow_arbitration: {
        decision: "continue_handoff",
        active_owner: "tool_skill",
        selected_owner: "select_state_potion",
        resume_policy: "active_handoff_continue",
        reason_code: "active_handoff_platform_destination_followup",
        continuation_intent: "platform_destination_followup",
      },
    },
    turnFrame: {
      active_handoff_action: {
        type: "platform_destination_followup",
        confidence: "high",
        evidence: ["Et je la lance où exactement dans la plateforme ?"],
        target_skill_id: "select_state_potion",
      },
    } as any,
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
  }));

  assert(result);
  assertEquals((result.toolSkillRun as any).status, "repeat_handoff");
  assertEquals(
    (result.toolSkillRun as any).reason_code,
    "state_potion_platform_destination_followup",
  );
  assertEquals(result.executedTools, []);
  assertStringIncludes(result.content, "section État / Potions");
  assertStringIncludes(result.content, "Choisis : Potion d'apaisement.");
  assertStringIncludes(result.content, "À renseigner :");
  assertEquals(
    result.content.includes("Je ne lance pas de potion depuis le chat."),
    false,
  );
  assertEquals(result.content.includes("Pourquoi cette potion"), false);
  assertEquals(result.content.includes("Petit pas immédiat"), false);
});

Deno.test("structured paraphrase lance maps to same apply_attempt via mocked signal", async () => {
  const draft = await deliveredDraft();
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "vas-y lance",
    turnFrame: {
      active_handoff_action: {
        type: "handoff_apply_attempt",
        confidence: "high",
        evidence: ["vas-y lance"],
        target_skill_id: "select_state_potion",
      },
    } as any,
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
  }));

  assert(result);
  assertEquals((result.toolSkillRun as any).status, "apply_attempt");
  assertEquals(result.executedTools, []);
  assertStringIncludes(result.content, "Choisis : Potion d'apaisement.");
});

Deno.test("apply_attempt during clarification still does not execute", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "ok vas-y active-la",
    routeDecision: {
      ...selectPotionRouteDecision,
      reason_code: "confirmation_yes_is_handoff_apply_attempt",
    },
    turnFrame: {
      confirmation_response: { kind: "yes", confidence_band: "high" },
    } as any,
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        mode: "platform_handoff",
        status: "clarifying",
        draft: null,
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
  }));
  assert(result);
  assertEquals((result.toolSkillRun as any).status, "apply_attempt");
  assertEquals(result.executedTools, []);
  assertStringIncludes(
    result.content,
    "Je ne peux pas le créer/lancer depuis le chat.",
  );
  assertStringIncludes(result.content, "section État / Potions");
});

Deno.test("field confirmation during detail intake is not apply_attempt", async () => {
  const activeIntakeState = {
    skill_id: "select_state_potion",
    current_sub_skill: "detail_intake",
    state: {
      status: "identified",
      kind: "confusion_overload",
      intensity: "medium",
      confidence: "high",
      evidence: ["sens global"],
    },
    explicit_potion_request: {
      status: "identified",
      potion_type: "clarte",
      evidence: ["potion de clarte"],
    },
    shortlist: { status: "missing", options: [], evidence: [] },
    selected_potion: {
      status: "identified",
      value: "clarte",
      confidence: "high",
      evidence: ["clarte"],
    },
    details: {
      status: "missing",
      required_question_ids: ["plan_meaning_loss_reason"],
      answers: [],
      fields: [{
        question_id: "plan_meaning_loss_reason",
        label:
          "Qu'est-ce qui te donne l'impression que ton plan n'a plus de sens pour toi aujourd'hui ?",
        required: true,
        status: "proposed",
        proposed_value:
          "Je ne vois plus le lien entre les actions de mon plan et mon pourquoi profond.",
        locked_value: null,
        user_evidence: ["retrouver le sens"],
        needs_user_confirmation: true,
        evidence: ["proposed_field"],
      }],
      optional_free_text: null,
      evidence: ["proposed_field"],
    },
    context: {},
    missing_slots: ["potion_detail:plan_meaning_loss_reason"],
    confidence: "high",
    generated_user_message:
      "Est-ce que cette phrase te va: je ne vois plus le lien entre les actions de mon plan et mon pourquoi profond ?",
  };
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage:
      "Oui, mets ça : je ne vois plus le lien entre les actions de mon plan et mon pourquoi profond.",
    routeDecision: {
      ...selectPotionRouteDecision,
      reason_code: "active_handoff_apply_attempt",
    },
    turnFrame: {
      active_handoff_action: {
        type: "handoff_apply_attempt",
        confidence: "high",
        evidence: ["Oui, mets ça"],
        target_skill_id: "select_state_potion",
      },
    } as any,
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        mode: "platform_handoff",
        status: "clarifying",
        draft: null,
        phase: "detail_intake",
        operation_input: { intake_state: activeIntakeState },
        intake_state: activeIntakeState,
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
    clarteLocalDispatcherOverride: async () =>
      clarteDispatcherOutput({
        flow_action: "confirm_proposed_field",
        field_state: {
          status: "locked",
          candidate_value: null,
          locked_value:
            "Je ne vois plus le lien entre les actions de mon plan et mon pourquoi profond.",
          previous_value: null,
          needs_user_confirmation: false,
          why_status: "field confirmed",
        },
      }),
  }));

  assert(result);
  assertEquals((result.toolSkillRun as any).status === "apply_attempt", false);
  assertEquals((result.toolSkillRun as any).status, "handoff_delivered");
  assertEquals(result.executedTools, []);
  assertEquals((result.toolSkillRun as any).committed_effects, []);
  assertEquals(
    result.content.includes("Je ne peux pas le créer/lancer"),
    false,
  );
  assertStringIncludes(result.content, "Potion de clarté");
  assertStringIncludes(
    result.content,
    "Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens",
  );
  assertEquals(result.content.includes("Je ne lance pas de potion"), false);
  assertEquals(result.content.includes("retrouver dans ce plan"), false);
});

Deno.test("structured field_confirmation during detail intake continues collection", async () => {
  const activeIntakeState = {
    skill_id: "select_state_potion",
    current_sub_skill: "detail_intake",
    state: {
      status: "identified",
      kind: "shame_guilt",
      intensity: "medium",
      confidence: "high",
      evidence: ["craqué hier"],
    },
    explicit_potion_request: {
      status: "identified",
      potion_type: "guerison",
      evidence: ["potion de guérison"],
    },
    shortlist: { status: "missing", options: [], evidence: [] },
    selected_potion: {
      status: "identified",
      value: "guerison",
      confidence: "high",
      evidence: ["guerison"],
    },
    details: {
      status: "missing",
      required_question_ids: ["recent_hurt", "dominant_feeling"],
      answers: [{
        question_id: "recent_hurt",
        label: "Qu'est-ce qui t'a fait mal ou t'a fait retomber recemment ?",
        answer: "J'ai craqué hier.",
        evidence: ["craqué hier"],
      }],
      fields: [{
        question_id: "dominant_feeling",
        label: "Tu ressens surtout quoi ?",
        required: true,
        status: "proposed",
        proposed_value: "De la honte",
        locked_value: null,
        user_evidence: ["honte"],
        needs_user_confirmation: true,
        evidence: ["proposed_field"],
      }],
      optional_free_text: null,
      evidence: ["proposed_field"],
    },
    context: {},
    missing_slots: ["potion_detail:dominant_feeling"],
    confidence: "high",
    generated_user_message:
      "Tu confirmes que le sentiment dominant est la honte ?",
  };
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "Oui, c'est la honte surtout.",
    routeDecision: {
      ...selectPotionRouteDecision,
      reason_code: "active_handoff_field_confirmation",
      active_flow_arbitration: {
        decision: "continue_handoff",
        active_owner: "tool_skill",
        selected_owner: "select_state_potion",
        resume_policy: "active_handoff_continue",
        reason_code: "active_handoff_field_confirmation",
        continuation_intent: "field_confirmation",
      },
    },
    turnFrame: {
      active_handoff_action: {
        type: "field_confirmation",
        confidence: "high",
        evidence: ["Oui, c'est la honte surtout."],
        target_skill_id: "select_state_potion",
      },
    } as any,
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        mode: "platform_handoff",
        status: "clarifying",
        draft: null,
        phase: "detail_intake",
        operation_input: { intake_state: activeIntakeState },
        intake_state: activeIntakeState,
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
    slotFillerOverride: async () => ({
      current_sub_skill: "draft_generation",
      state_patch: {
        details: {
          status: "identified",
          required_question_ids: ["recent_hurt", "dominant_feeling"],
          fields: [{
            question_id: "dominant_feeling",
            label: "Tu ressens surtout quoi ?",
            required: true,
            status: "locked",
            proposed_value: null,
            locked_value: "De la honte",
            user_evidence: ["Oui, c'est la honte surtout."],
            needs_user_confirmation: false,
            evidence: ["field_confirmed"],
          }],
          answers: [{
            question_id: "recent_hurt",
            label:
              "Qu'est-ce qui t'a fait mal ou t'a fait retomber recemment ?",
            answer: "J'ai craqué hier.",
            evidence: ["craqué hier"],
          }, {
            question_id: "dominant_feeling",
            label: "Tu ressens surtout quoi ?",
            answer: "De la honte",
            evidence: ["field_confirmed"],
          }],
          optional_free_text: null,
          evidence: ["field_confirmed"],
        },
        missing_slots: [],
        generated_user_message: null,
        confidence: "high",
      },
      missing_slots: [],
      confidence: "high",
      generated_user_message: null,
      evidence: ["field_confirmed"],
    }),
  }));

  assert(result);
  assertEquals((result.toolSkillRun as any).status, "handoff_delivered");
  assertEquals(result.executedTools, []);
  assertStringIncludes(result.content, "Potion : Potion de guérison");
  assertEquals(
    result.content.includes("Je ne peux pas le créer/lancer"),
    false,
  );
});

Deno.test("repeat_handoff repeats previous recommendation", async () => {
  const draft = await deliveredDraft();
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "redis-moi laquelle choisir",
    routeDecision: {
      ...selectPotionRouteDecision,
      reason_code: "active_handoff_repeat_handoff",
    },
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
  }));
  assert(result);
  assertEquals((result.toolSkillRun as any).status, "repeat_handoff");
  assertStringIncludes(result.content, draft.recommendation.potion_label);
  assertEquals(result.executedTools, []);
});

Deno.test("repeat_handoff during clarification repeats platform destination", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "redis-moi où je dois la lancer",
    routeDecision: {
      ...selectPotionRouteDecision,
      reason_code: "active_handoff_repeat_handoff",
    },
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        mode: "platform_handoff",
        status: "clarifying",
        draft: null,
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
  }));
  assert(result);
  assertEquals((result.toolSkillRun as any).status, "repeat_handoff");
  assertEquals(result.executedTools, []);
  assertStringIncludes(result.content, "section État / Potions");
  assertStringIncludes(
    result.content,
    "Je ne lance pas de potion depuis le chat.",
  );
});

Deno.test("clarification wording avoids generic success claim guard", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "Je choisis apaisement court, et toujours sans suivi.",
    slotFillerOverride: structuredStatePotionSlotFiller({
      state_kind: "stress_pressure",
      selected_potion: "apaisement",
      omit_detail_answers: true,
      generated_user_message:
        "C'est bon pour l'apaisement. Qu'est-ce qui te met le plus sous pression en ce moment ?",
    }),
  }));
  assert(result);
  assertEquals((result.toolSkillRun as any).status, "clarifying");
  assertEquals(result.executedTools, []);
  assertEquals(result.content.toLowerCase().includes("c'est bon"), false);
  assertStringIncludes(result.content, "pression");
});

Deno.test("selected potion does not bypass missing detail slots from raw wording", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage:
      "Plutôt clarté. Donne-moi la recommandation plateforme, courte, et sans suivi.",
    slotFillerOverride: structuredStatePotionSlotFiller({
      state_kind: "confusion_overload",
      selected_potion: "clarte",
      omit_detail_answers: true,
      generated_user_message:
        "Tu veux finir cette potion quand, et qu'est-ce qui est mélangé ?",
    }),
  }));
  assert(result);
  assertEquals((result.toolSkillRun as any).status, "clarifying");
  assertEquals(
    (result.toolSkillRun as any).selected_handler,
    "select_state_potion.clarte",
  );
  assertEquals(
    loadStatePotionHandoffStateFromTempMemory(result.nextTempMemory)
      ?.active_subskill_id,
    "select_state_potion.clarte",
  );
  assertEquals(result.executedTools, []);
  assertStringIncludes(result.content, "plan");
  assertStringIncludes(result.content, "pourquoi");
  assertEquals(result.content.includes("À préserver"), false);
  assertEquals(result.content.includes("À éviter"), false);
  assertEquals(result.content.includes("Ce que je comprends"), false);
  assertEquals(result.content.includes("Je te conseille"), false);
});

Deno.test("recent platform recommendation plus immediate timing does not force handoff by regex", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "Tout de suite, juste me débloquer.",
    history: [
      {
        role: "user",
        content:
          "Plutôt clarté. Donne-moi la recommandation plateforme, courte, et sans suivi.",
      },
      {
        role: "assistant",
        content:
          "Tu voudrais placer ce soutien à quel moment, pour que ça aide vraiment ?",
      },
    ],
    slotFillerOverride: structuredStatePotionSlotFiller({
      state_kind: "confusion_overload",
      selected_potion: "clarte",
      omit_detail_answers: true,
      generated_user_message:
        "Tu voudrais placer ce soutien à quel moment, pour que ça aide vraiment ?",
    }),
  }));
  assert(result);
  assertEquals((result.toolSkillRun as any).status, "clarifying");
  assertEquals(
    (result.toolSkillRun as any).selected_handler,
    "select_state_potion.clarte",
  );
  assertEquals(result.executedTools, []);
  assertEquals(result.content.includes("À préserver"), false);
  assertEquals(result.content.includes("À éviter"), false);
  assertStringIncludes(result.content, "plan");
  assertEquals(result.content.includes("Ce que je comprends"), false);
});

Deno.test("potion or phrase ambiguity is not locally routed by handoff regex", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    routeDecision: null,
    userMessage:
      "Je me sens nulle. Est-ce qu'une potion d'amour aiderait, ou tu me donnes juste une phrase douce ?",
  }));
  assertEquals(result, null);
});

Deno.test("potion versus being spoken to softly waits for upstream clarification", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    routeDecision: null,
    userMessage:
      "Je me sens vraiment nulle et j'ai la boule au ventre. J'ai pensé à une potion, mais je ne sais pas si j'ai surtout besoin qu'on me parle doucement. Pas de suivi.",
  }));
  assertEquals(result, null);
});

Deno.test("no_potion with just phrase returns no protocol or micro action", async () => {
  const draft = await deliveredDraft();
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "non, pas de potion, juste une phrase douce sans protocole",
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
  }));
  assert(result);
  assertEquals((result.toolSkillRun as any).status, "cancelled");
  assertStringIncludes(result.content, "Phrase de soutien");
  assertEquals(result.content.toLowerCase().includes("micro-action"), false);
  assertEquals(result.content.toLowerCase().includes("protocole"), false);
  assertEquals(result.executedTools, []);
});

Deno.test("no_potion with self-judgment phrase only respects no protocol", async () => {
  const draft = await deliveredDraft();
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage:
      "Non, pas de potion pour l'instant. Parle-moi doucement, juste une phrase qui m'aide à ne pas me juger, sans protocole.",
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
  }));
  assert(result);
  assertEquals((result.toolSkillRun as any).status, "cancelled");
  assertStringIncludes(result.content, "Phrase de soutien");
  assertStringIncludes(result.content, "verdict");
  assertEquals(result.content.toLowerCase().includes("micro-action"), false);
  assertEquals(result.content.toLowerCase().includes("protocole"), false);
  assertEquals(result.executedTools, []);
});

Deno.test("revise_handoff regenerates recommendation", async () => {
  const draft = await deliveredDraft();
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "plutôt un reset rapide",
    routeDecision: {
      ...selectPotionRouteDecision,
      reason_code: "same_operation_signal_continues_active_handoff",
    },
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
    slotFillerOverride: structuredStatePotionSlotFiller({
      state_kind: "stress_pressure",
      selected_potion: "apaisement",
    }),
  }));
  assert(result);
  assertEquals((result.toolSkillRun as any).status, "handoff_delivered");
  assertStringIncludes(result.content, "Potion d'apaisement");
  assertEquals(result.executedTools, []);
});

Deno.test("revise_handoff updates platform input value", async () => {
  const initial = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage:
      "Je veux une potion de clarté parce que je ne vois plus le lien entre mes actions et mon pourquoi profond.",
    slotFillerOverride: structuredStatePotionSlotFiller({
      state_kind: "confusion_overload",
      selected_potion: "clarte",
      detail_answers: [{
        question_id: "plan_meaning_loss_reason",
        label:
          "Qu'est-ce qui te donne l'impression que ton plan n'a plus de sens pour toi aujourd'hui ?",
        answer:
          "Je ne vois plus le lien entre mes actions et mon pourquoi profond.",
        evidence: ["current_user_message"],
      }],
    }),
  }));
  const draft = (initial?.toolSkillRun as any)?.platform_handoff?.draft;
  assert(draft);
  const activeState = loadStatePotionHandoffStateFromTempMemory(
    initial?.nextTempMemory,
  );
  assert(activeState);

  const revisedValue =
    "Je fais les actions, mais je ne sens plus pourquoi elles comptent pour moi aujourd'hui.";
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: `Formule-le plutot comme ca : ${revisedValue}`,
    routeDecision: {
      ...selectPotionRouteDecision,
      reason_code: "active_handoff_revise_handoff",
      active_flow_arbitration: {
        decision: "continue_handoff",
        active_owner: "tool_skill",
        selected_owner: "select_state_potion",
        resume_policy: "active_handoff_continue",
        reason_code: "active_handoff_revise_handoff",
        continuation_intent: "revise_handoff",
      },
    },
    turnFrame: {
      active_handoff_action: {
        type: "revise_handoff",
        confidence: "high",
        evidence: ["Formule-le plutot comme ca"],
        target_skill_id: "select_state_potion",
      },
    } as any,
    tempMemory: {
      __active_tool_skill_intake: activeState,
    },
    clarteLocalDispatcherOverride: async () =>
      clarteDispatcherOutput({
        flow_action: "revise_current_field",
        field_state: {
          status: "locked",
          candidate_value: null,
          locked_value: revisedValue,
          previous_value:
            "Je ne vois plus le lien entre mes actions et mon pourquoi profond.",
          needs_user_confirmation: false,
          why_status: "revision request",
        },
        revision: {
          is_revision: true,
          replacement_value: revisedValue,
          replaces_previous_value: true,
        },
        visible_task: {
          kind: "revision_done",
          required_data: {
            potion_name: "Potion de clarté",
            field_label:
              "Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?",
            field_value: revisedValue,
            platform_destination: "section État / Potions",
          },
        },
      }),
  }));

  assert(result);
  assertEquals((result.toolSkillRun as any).status, "handoff_delivered");
  assertEquals(
    (result.toolSkillRun as any).selected_handler,
    "select_state_potion.clarte",
  );
  assertStringIncludes(result.content, revisedValue);
  const platformInputs = (result.toolSkillRun as any).platform_handoff.draft
    .recommendation.platform_inputs;
  assertEquals(platformInputs.answers[0].value, revisedValue);
  const nextState = loadStatePotionHandoffStateFromTempMemory(
    result.nextTempMemory,
  );
  assertEquals(nextState?.active_subskill_id, "select_state_potion.clarte");
  assertEquals(nextState?.clarte_state?.field_state.locked_value, revisedValue);
  assertEquals(result.executedTools, []);
});

Deno.test("no_potion cancels handoff cleanly", async () => {
  const draft = await deliveredDraft();
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "non, pas de potion, donne-moi juste une phrase pour me poser",
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
  }));
  assert(result);
  assertEquals((result.toolSkillRun as any).status, "cancelled");
  assertEquals(
    loadStatePotionHandoffStateFromTempMemory(result.nextTempMemory),
    null,
  );
  assertEquals(result.executedTools, []);
});

Deno.test("no_followup is respected in recommendation wording", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "Je suis tendu, je veux une potion mais sans suivi.",
  }));
  assert(result);
  assertStringIncludes(result.content, "À mettre dans la plateforme");
  assertEquals(result.content.includes("programmer un suivi"), false);
  assertEquals(result.content.includes("À préserver"), false);
  assertEquals(result.content.includes("À éviter"), false);
  assertEquals(result.executedTools, []);
});

Deno.test("active potion handoff captures launch and repeat continuations", async () => {
  const draft = await deliveredDraft();
  const repeat = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "où je la lance ?",
    routeDecision: {
      ...selectPotionRouteDecision,
      reason_code: "active_handoff_repeat_handoff",
    },
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
  }));
  assertEquals((repeat?.toolSkillRun as any).status, "repeat_handoff");

  const apply = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "active-la",
    routeDecision: {
      ...selectPotionRouteDecision,
      reason_code: "confirmation_yes_is_handoff_apply_attempt",
    },
    turnFrame: {
      confirmation_response: { kind: "yes", confidence_band: "high" },
    } as any,
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
  }));
  assertEquals((apply?.toolSkillRun as any).status, "apply_attempt");
  assertEquals(apply?.executedTools, []);
});

Deno.test("explicit one-shot reminder exits potion handoff without creating follow-up", async () => {
  const draft = await deliveredDraft();
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    userMessage: "mets-moi un rappel demain à 9h",
    routeDecision: {
      ...selectPotionRouteDecision,
      response_owner: "normal_reply",
      selected_handler: undefined,
      reason_code: "create_one_shot_reminder_interrupts_active_handoff",
      direct_effects_to_run: ["create_one_shot_reminder"],
    },
    tempMemory: {
      __active_tool_skill_intake: {
        skill_id: "select_state_potion",
        mode: "platform_handoff",
        status: "handoff_delivered",
        draft,
        turn_count: 1,
        max_turns: 6,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        no_chat_mutation: true,
      },
    },
  }));
  assertEquals(result, null);
});

Deno.test("safety preempts potion handoff", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs({
    safetyPregateOutput: highSafetyPregate,
  }));
  assert(result);
  assertEquals((result.toolSkillRun as any).status, "blocked");
  assertEquals(result.executedTools, []);
});

Deno.test("potion handoff wording has no execution claims", async () => {
  const result = await runSelectStatePotionHandoffSkill(baseArgs());
  assert(result);
  const forbidden = [
    "c'est activé",
    "j'ai lancé",
    "j'ai programmé",
    "je te relance",
    "dis oui et je l'active",
  ];
  const normalized = result.content.toLowerCase();
  for (const phrase of forbidden) {
    assertEquals(normalized.includes(phrase), false, phrase);
  }
  assertStringIncludes(normalized, "section état / potions");
  assertStringIncludes(normalized, "je te conseille");
  assertEquals(normalized.includes("à préserver"), false);
  assertEquals(normalized.includes("à éviter"), false);
  assertEquals(normalized.includes("pas immediat :"), false);
});
