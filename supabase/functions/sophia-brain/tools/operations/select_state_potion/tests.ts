import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { POTION_DEFINITIONS } from "../../../../_shared/v2-potions.ts";
import {
  createConfirmationToken,
  hasConsumedConfirmationTokenForTest,
  resetConsumedConfirmationTokensForTest,
} from "../../../confirmation/confirmation_token.ts";
import type { PotionType } from "../../../../_shared/v2-types.ts";
import type { PotionSessionSelectorInput } from "../_shared/operation_payload_builder.ts";
import { formatPotionBaseContextForPrompt } from "../../../../_shared/potion-base-context.ts";
import {
  buildStatePotionCatalogPrompt,
  STATE_POTION_TYPES,
} from "./catalog.ts";
import { executeActivateStatePotion } from "./executor.ts";
import {
  fillSelectStatePotionSlotsWithAi,
  runSelectStatePotionIntake,
} from "./intake.ts";
import { hasExplicitStatePotionActivationApproval } from "./draft_validation.ts";
import {
  buildPotionDetailSubskillPrompt,
  chatDetailQuestionIds,
  POTION_DETAIL_SUBSKILLS,
  SUPPORT_TIMING_QUESTION_ID,
  SUPPORT_TIMING_SLOT,
} from "./subskills/potion_detail_intake.ts";
import { buildPotionFollowUpSchedulePlannerPrompt } from "./subskills/follow_up_schedule_planner.ts";
import { normalizePotionSessionDraft } from "./generator.ts";
import { maybeRunSelectStatePotionOperation } from "./router.ts";
import { renderSelectStatePotionSkillResult } from "./renderer.ts";
import { loadSelectStatePotionFrameFromTempMemory } from "./state.ts";
import {
  buildExplicitNoPotionConcreteReply,
  detectsExplicitConcreteDeliverableRequest,
  detectsExplicitNoPotionRequest,
  detectsExplicitStatePotionExit,
  detectsPotionFollowUpRefusal,
  hardConsentGuards,
  statePotionDeclineReply,
} from "./policy.ts";
import {
  structuredStatePotionDraftGenerator,
  structuredStatePotionSlotFiller,
} from "./test_helpers.ts";

Deno.test("select_state_potion renderer blocks success language without committed effect", () => {
  const message = renderSelectStatePotionSkillResult({
    status: "blocked",
    user_intent: "activate",
    reply: "C'est fait, potion activée.",
    committed_effects: [],
  } as any);
  assertEquals(message.includes("C'est fait"), false);
  assertEquals(message.includes("activée"), false);
});

const SECRET = "s5-test-secret";

const fakeSafetyPregate = {
  risk_band: "none",
  reason_codes: [],
  evidence: [],
} as any;

const fakeSupabase = {} as any;

const selectPotionRouteDecision = {
  response_owner: "tool_skill",
  selected_handler: "select_state_potion",
  reason_code: "test",
  direct_effects_to_run: [],
  blocked_paths: [],
} as any;

Deno.test("select_state_potion catalog gives AI rich potion context and question examples", () => {
  const catalog = buildStatePotionCatalogPrompt();
  assertStringIncludes(catalog, "Catalogue canonique des potions d'etat");
  assertStringIncludes(
    catalog,
    "Le suivi par defaut est un reminder court sur 7 jours",
  );
  assertEquals(catalog.includes("options:"), false);
  assert(!/\b(vous|votre|vos)\b/i.test(catalog));
  for (const potionType of STATE_POTION_TYPES) {
    const definition = POTION_DEFINITIONS[potionType];
    assertStringIncludes(catalog, `${definition.type} - ${definition.title}`);
    assertStringIncludes(catalog, definition.short_description);
    assertStringIncludes(
      catalog,
      definition.default_follow_up_strategy.rationale ?? "",
    );
    for (const question of definition.questionnaire) {
      assertStringIncludes(catalog, question.label);
      assert(!/\b(vous|votre|vos)\b/i.test(question.label));
      assert(
        !/\b(slot|schema|operation|payload|diagnostic)\b/i.test(question.label),
      );
      assert(question.label.length <= 80);
    }
  }
  assertStringIncludes(
    POTION_DETAIL_SUBSKILLS.rappel.extraction_rules.join(" "),
    "moment a proteger",
  );
});

Deno.test("select_state_potion prompts keep internal slots out of visible wording", () => {
  const detailPrompt = buildPotionDetailSubskillPrompt("courage");
  const schedulePrompt = buildPotionFollowUpSchedulePlannerPrompt("courage");
  assertEquals(detailPrompt.includes("Options:"), false);
  assertEquals(
    detailPrompt.includes("peur du résultat, du regard"),
    false,
  );
  assertEquals(
    schedulePrompt.includes(
      "est-ce un moment precis ou une situation qui revient ?",
    ),
    false,
  );
  assertStringIncludes(
    schedulePrompt,
    "Ne formule pas en categories ponctuel/recurrent",
  );
});

Deno.test("select_state_potion rejects robotic confirmation voice", () => {
  const baseDraft = {
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    draft: {
      potion_type: "rappel",
      title: "Rappel doux",
      opening_prompt: "Respire.",
      instant_support_message: "On revient doucement.",
      potion_info_message: "Le suivi t'aide à garder le lien avec ta routine.",
      expected_duration: "short",
      why_this_potion: "Tu décroches de ta routine du soir.",
      target_binding: {
        kind: "none",
        label: null,
        related_plan_item_id: null,
        target_plan_item_id: null,
        target_action_family_key: null,
        target_generated_temp_id: null,
        recurrence_hint: null,
        date_or_window_hint: null,
        evidence: ["test"],
      },
      follow_up: {
        reminder_instruction: "Revenir à la marche du soir.",
        local_time_hhmm: "19:00",
        duration_days: 7,
        reason_for_time: "Avant la soirée.",
        schedule_plan: {
          mode: "daily_series",
          duration_days: 7,
          local_time_hhmm: "19:00",
          scheduled_days: [],
          local_dates: [],
          timing_relation: "daily",
          reason: "Soutien quotidien.",
        },
      },
    },
    confirmation_actions: ["yes", "no"],
  };
  const input = {
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    state: { kind: "decrochage", intensity: "medium", evidence: ["test"] },
    potion_type: "rappel",
    context: {},
    constraints: [],
    forbidden: [],
  } satisfies PotionSessionSelectorInput;
  const badMessages = [
    "Je peux t'envoyer un petit signe chaque soir. On essaie ça ?",
    "Je te propose d'activer cette Potion de Rappel. Ça te convient ?",
    "Je t'enverrai un petit mot à 19h. On lance ça ?",
    "Je t'envoie un appui unique à 07h45. Dis-moi si ça te va pour qu'on avance.",
    "Je me manifesterai demain à 07h45. On se cale sur ce rendez-vous unique ?",
    "Je viendrai demain à 07h45. Dis-moi si on se retrouve à cette heure-là.",
  ];
  for (const confirmation_message of badMessages) {
    let failed = false;
    try {
      normalizePotionSessionDraft(
        { ...baseDraft, confirmation_message },
        input,
      );
    } catch (error) {
      failed = error instanceof Error &&
        error.message === "potion_confirmation_template_voice";
    }
    assertEquals(failed, true, confirmation_message);
  }
});

Deno.test("select_state_potion draft approval requires explicit activation", () => {
  assertEquals(
    hasExplicitStatePotionActivationApproval(
      "Le probleme de clarte: j'ai trop de pistes ouvertes et je bloque demain matin.",
    ),
    false,
  );
  assertEquals(
    hasExplicitStatePotionActivationApproval(
      "Avant validation, je veux que le rappel reste doux.",
    ),
    false,
  );
  assertEquals(
    hasExplicitStatePotionActivationApproval(
      "Oui, active cette potion de clarte.",
    ),
    true,
  );
});

Deno.test("select_state_potion policy owns no_potion, exit, and concrete reply wording", () => {
  assertEquals(
    hardConsentGuards.detectsExplicitNoPotionRequest("sans potion"),
    true,
  );
  assertEquals(
    detectsExplicitNoPotionRequest(
      "Ça tourne en boucle. Ne me propose pas de potion et donne-moi juste une phrase de réparation.",
    ),
    true,
  );
  assertEquals(
    detectsExplicitNoPotionRequest(
      "Ne lance pas de potion: propose seulement un reset de 2 minutes pour revenir à la facture.",
    ),
    true,
  );
  assertEquals(
    detectsExplicitNoPotionRequest("Aide-moi mais sans potion stp."),
    true,
  );
  assertEquals(
    detectsExplicitNoPotionRequest("Oui, lance la potion d'apaisement."),
    false,
  );
  assertEquals(
    detectsExplicitNoPotionRequest("Pas de rappel, juste une phrase."),
    false,
  );

  assertEquals(
    detectsExplicitStatePotionExit(
      "Stop potion. Où je vois dans l'app qu'une potion ou un mode comme ça est actif ?",
    ),
    true,
  );
  assertEquals(detectsExplicitStatePotionExit("arrête la potion"), true);
  assertEquals(
    detectsExplicitStatePotionExit("Lance la potion d'apaisement"),
    false,
  );
  assertEquals(
    detectsExplicitStatePotionExit("stop, j'ai compris merci"),
    false,
  );

  const concrete =
    "Non, pas de potion. Donne-moi une phrase de réparation et une micro-action, sans question.";
  assertEquals(
    detectsExplicitConcreteDeliverableRequest(concrete),
    true,
  );
  const concreteReply = buildExplicitNoPotionConcreteReply(concrete);
  assertEquals(concreteReply.includes("Phrase de réparation"), true);
  assertEquals(concreteReply.includes("Micro-action"), true);
  assertEquals(concreteReply.includes("?"), false);

  const phraseOnlyReply = buildExplicitNoPotionConcreteReply(
    "Non, pas de potion pour l'instant. Parle-moi doucement, juste une phrase qui m'aide à ne pas me juger, sans protocole.",
  );
  assertEquals(phraseOnlyReply.includes("Phrase de réparation"), true);
  assertEquals(phraseOnlyReply.includes("verdict"), true);
  assertEquals(phraseOnlyReply.includes("Micro-action"), false);
  assertEquals(phraseOnlyReply.toLowerCase().includes("protocole"), false);

  const resetReply = buildExplicitNoPotionConcreteReply(
    "Pas de potion. Reset de 2 minutes pour revenir à la facture, sans question.",
  );
  assertEquals(resetReply.includes("Reset 2 minutes"), true);
  assertEquals(resetReply.includes("Minute 1"), true);
  assertEquals(resetReply.includes("?"), false);

  const declineReply = statePotionDeclineReply(
    "Pas de potion pour le moment. Je vais faire la pile temporaire. Ensuite j'ouvre Slack et je pars lire dix conversations.",
  );
  assertEquals(declineReply.includes("je ne lance pas de potion"), true);
  assertEquals(declineReply.includes("recherche"), true);
  assertEquals(declineReply.includes("quitte l'app"), true);
});

Deno.test("select_state_potion policy owns follow-up refusal detection", () => {
  for (
    const message of [
      "Non, ne programme rien. Je veux la phrase maintenant.",
      "surtout pas de rappel",
      "je ne veux aucun suivi",
      "sans relance stp",
      "ne me programme aucun rappel",
      "lance une potion d'apaisement courte pour maintenant seulement, pas de rituel récurrent",
      "Je confirme seulement une potion maintenant, sans rappel, sans demain, sans semaine.",
      "Oui, je suis d'accord : programme ce rappel ponctuel à 14h35, rien d'autre.",
      "pas de routine",
      "non récurrent",
      "une seule fois",
      "juste pour maintenant",
      "non pour le suivi du matin",
      "rien d'autre",
      "rien d’autre",
    ]
  ) {
    assertEquals(detectsPotionFollowUpRefusal(message), true, message);
  }

  for (
    const message of [
      "Oui. Écris la phrase maintenant.",
      "Lance vraiment l'apaisement maintenant, pas une analyse.",
      "programme-moi un rappel tous les matins",
      "Oui, programme un rappel récurrent chaque matin à 8h.",
      "Active le rituel du soir stp",
      "Je veux un suivi quotidien",
    ]
  ) {
    assertEquals(detectsPotionFollowUpRefusal(message), false, message);
  }
});

Deno.test("state potion DB base context exposes shared front and chat material", () => {
  const promptBlock = formatPotionBaseContextForPrompt({
    scope: {
      kind: "transformation",
      cycle_id: "cycle-1",
      transformation_id: "transformation-1",
      resolved_from: "explicit_transformation",
    },
    transformation: {
      title: "Retrouver une direction simple",
      user_summary: "Le user veut clarifier son cap.",
      internal_summary: "Contexte interne de transformation.",
      success_definition: "Savoir quoi prioriser cette semaine.",
      main_constraint: "Trop de dispersion.",
      deep_why_answers: [{
        question: "Pourquoi est-ce important ?",
        answer: "Je veux retrouver une relation plus calme a mon quotidien.",
      }],
      questionnaire_answers: { rythme: "matin" },
    },
    plan_strategy: {
      identity_shift: "Je deviens quelqu'un qui avance simplement.",
      core_principle: "Moins mais mieux.",
      success_definition: "Une priorite nette.",
      main_constraint: "La surcharge.",
    },
    plan_items: [{
      id: "item-1",
      title: "Choisir la priorite du jour",
      description: "Une decision simple chaque matin.",
      dimension: "missions",
      kind: "task",
      status: "active",
      tracking_type: "boolean",
      current_habit_state: null,
      support_mode: null,
      support_function: null,
      target_reps: null,
      current_reps: null,
      cadence_label: "quotidien",
      scheduled_days: ["mon", "tue"],
      time_of_day: "09:00",
    }],
    prior_potions: [{
      id: "potion-1",
      potion_type: "clarte",
      title: "Clarte douce",
      generated_at: "2026-05-18T08:00:00.000Z",
      reminder_instruction: "Reviens a une priorite simple.",
    }],
    active_potion_reminders: [{
      id: "reminder-1",
      potion_type: "clarte",
      message_instruction: "Reviens a une priorite simple.",
      local_time_hhmm: "09:00",
      scheduled_days: ["mon", "tue", "wed"],
    }],
    usage_guidance: [
      "Priorite haute: pourquoi profond, resume de transformation, succes attendu, contrainte principale et strategie du plan.",
    ],
  });
  assertStringIncludes(promptBlock, '"source": "database"');
  assertStringIncludes(promptBlock, "deep_why_answers");
  assertStringIncludes(
    promptBlock,
    "Je veux retrouver une relation plus calme",
  );
  assertStringIncludes(promptBlock, "Choisir la priorite du jour");
  assertStringIncludes(promptBlock, "prior_potions_same_type");
  assertStringIncludes(promptBlock, "active_potion_reminders");
});

Deno.test("select_state_potion has one detail subskill per potion with two canonical fields", () => {
  for (const potionType of STATE_POTION_TYPES) {
    const subskill = POTION_DETAIL_SUBSKILLS[potionType];
    assertEquals(subskill.potion_type, potionType);
    assertEquals(subskill.sub_skill, `${potionType}_intake`);
    assertEquals(subskill.required_question_ids.length, 2);
    assertEquals(chatDetailQuestionIds(potionType), [
      ...subskill.required_question_ids,
    ]);
    for (const questionId of subskill.required_question_ids) {
      assert(
        POTION_DEFINITIONS[potionType].questionnaire.some((question) =>
          question.id === questionId
        ),
      );
    }
  }
});

Deno.test("select_state_potion pipeline covers 6 potion types and default 7-day DB write contract", async () => {
  const cases = [
    ["je decroche, fais-moi une potion", "rappel"],
    ["je suis stresse, fais-moi une potion", "apaisement"],
    ["lance une potion de guerison", "guerison"],
    ["j'ai peur, lance une potion", "courage"],
    ["je suis dans le flou, fais une potion", "clarte"],
    ["je suis dur avec moi, potion", "amour"],
  ] as const satisfies ReadonlyArray<readonly [string, PotionType]>;
  for (const [message, potionType] of cases) {
    resetConsumedConfirmationTokensForTest();
    const output = await runSelectStatePotionIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message,
      trigger_message_id: `m-${potionType}`,
      safety_pregate_risk_band: "none",
      slot_filler: structuredStatePotionSlotFiller({
        state_kind: potionType === "rappel"
          ? "decrochage"
          : potionType === "apaisement"
          ? "stress_pressure"
          : potionType === "guerison"
          ? "shame_guilt"
          : potionType === "courage"
          ? "fear_avoidance"
          : potionType === "clarte"
          ? "confusion_overload"
          : "self_harshness",
        selected_potion: potionType,
      }),
      draft_generator: structuredStatePotionDraftGenerator(),
    });
    assertEquals(output.status, "pending_confirmation", message);
    assertEquals(output.draft?.draft.potion_type, potionType);
    const token = await createConfirmationToken({
      user_id: "u1",
      operation_id: String(output.pending_confirmation?.operation_id),
      operation_type: "select_state_potion",
      draft: output.draft,
      source_message_id: `yes-${potionType}`,
      pending_confirmation_id: `pending-${potionType}`,
      secret: SECRET,
    });
    let dbDraftPotionType: PotionType | null = null;
    let dbScheduledFollowups: Array<{
      local_date: string;
      local_time_hhmm: string;
      reminder_instruction: string;
    }> = [];
    const executed = await executeActivateStatePotion({
      operation_id: String(output.pending_confirmation?.operation_id),
      user_id: "u1",
      draft: output.draft!,
      token,
      safety_pregate_risk_band: "none",
      pending_confirmation_lookup: async () => ({ consumed: false }),
      token_consumption_check: async (tokenId) =>
        hasConsumedConfirmationTokenForTest(tokenId),
      write_potion_activation: async ({ draft, scheduled_followups }) => {
        dbDraftPotionType = draft.potion_type;
        dbScheduledFollowups = scheduled_followups;
        return {
          potion_session_id: `potion-${potionType}`,
          recurring_reminder_id: `rr-${potionType}`,
          scheduled_checkin_ids: scheduled_followups.map((_, i) => `sc-${i}`),
        };
      },
      secret: SECRET,
      now_iso: "2026-05-04T08:00:00.000Z",
    });
    assertEquals(executed.status, "executed");
    if (executed.status === "executed") {
      assertEquals(dbDraftPotionType, potionType);
      assertEquals(dbScheduledFollowups.length, 7);
      assertEquals(
        dbScheduledFollowups.map((followup) => followup.local_date),
        [
          "2026-05-05",
          "2026-05-06",
          "2026-05-07",
          "2026-05-08",
          "2026-05-09",
          "2026-05-10",
          "2026-05-11",
        ],
      );
      assertEquals(
        dbScheduledFollowups.every((followup) =>
          followup.local_time_hhmm === "09:00" &&
          followup.reminder_instruction === `Reminder ${potionType}`
        ),
        true,
      );
      assertEquals(executed.scheduled_checkin_ids.length, 7);
      assertEquals(
        executed.messages.instant_support_message,
        `Instant support ${potionType}`,
      );
      assertEquals(
        executed.messages.potion_info_message.includes("suivi 7 jours"),
        true,
      );
    }
  }
});

// E0 (A3-r10 T6): refus explicite de programmation -> aucun effet durable.
Deno.test("select_state_potion suppresses follow-up scheduling when consent is refused", async () => {
  resetConsumedConfirmationTokensForTest();
  const draft = await structuredStatePotionDraftGenerator()({
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    state: {
      kind: "stress_pressure",
      intensity: "medium",
      evidence: ["test"],
    },
    potion_type: "apaisement",
    context: {},
    constraints: [],
    forbidden: [],
  });
  if (!draft) throw new Error("missing_draft");
  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: "op-no-followup",
    operation_type: "select_state_potion",
    draft,
    source_message_id: "yes-no-followup",
    pending_confirmation_id: "pending-no-followup",
    secret: SECRET,
  });
  let writerScheduledFollowups:
    | Array<{
      local_date: string;
      local_time_hhmm: string;
      reminder_instruction: string;
    }>
    | null = null;
  const executed = await executeActivateStatePotion({
    operation_id: "op-no-followup",
    user_id: "u1",
    draft,
    token,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async (tokenId) =>
      hasConsumedConfirmationTokenForTest(tokenId),
    suppress_follow_up_scheduling: true,
    write_potion_activation: async ({ scheduled_followups }) => {
      writerScheduledFollowups = scheduled_followups;
      // Le writer reel saute le recurring_reminder + checkins en mode suppress.
      return {
        potion_session_id: "potion-x",
        recurring_reminder_id: "",
        scheduled_checkin_ids: [],
      };
    },
    secret: SECRET,
    now_iso: "2026-05-04T08:00:00.000Z",
  });
  assertEquals(executed.status, "executed");
  assertEquals(writerScheduledFollowups, []);
  if (executed.status === "executed") {
    assertEquals(executed.scheduled_checkin_ids.length, 0);
    assertEquals(executed.recurring_reminder_id, "");
  }
});

Deno.test("select_state_potion supports one-off action follow-up schedules", async () => {
  resetConsumedConfirmationTokensForTest();
  const draft = await structuredStatePotionDraftGenerator()({
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    state: { kind: "fear_avoidance", intensity: "medium", evidence: ["test"] },
    potion_type: "courage",
    context: { target_hint: "Appel client mardi" },
    constraints: [],
    forbidden: [],
  });
  if (!draft) throw new Error("missing_one_off_draft");
  draft.draft.target_binding = {
    kind: "one_off_action",
    label: "Appel client mardi",
    related_plan_item_id: null,
    target_plan_item_id: null,
    target_action_family_key: null,
    target_generated_temp_id: null,
    recurrence_hint: null,
    date_or_window_hint: "2026-05-05 matin",
    evidence: ["appel mardi"],
  };
  draft.draft.follow_up = {
    ...draft.draft.follow_up,
    duration_days: 1,
    schedule_plan: {
      mode: "single_before_event",
      duration_days: null,
      local_time_hhmm: "08:45",
      scheduled_days: [],
      local_dates: ["2026-05-05"],
      timing_relation: "before",
      reason: "Juste avant l'appel.",
    },
  };
  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: "op-one-off",
    operation_type: "select_state_potion",
    draft,
    source_message_id: "yes-one-off",
    pending_confirmation_id: "pending-one-off",
    secret: SECRET,
  });
  let scheduled: Array<{
    local_date: string;
    local_time_hhmm: string;
    reminder_instruction: string;
  }> = [];
  const executed = await executeActivateStatePotion({
    operation_id: "op-one-off",
    user_id: "u1",
    draft,
    token,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async (tokenId) =>
      hasConsumedConfirmationTokenForTest(tokenId),
    write_potion_activation: async ({ scheduled_followups }) => {
      scheduled = scheduled_followups;
      return {
        potion_session_id: "p-one-off",
        recurring_reminder_id: "r-one-off",
        scheduled_checkin_ids: scheduled_followups.map((_, index) =>
          `s-one-off-${index}`
        ),
      };
    },
    secret: SECRET,
    now_iso: "2026-05-04T08:00:00.000Z",
  });
  assertEquals(executed.status, "executed");
  assertEquals(scheduled, [{
    local_date: "2026-05-05",
    local_time_hhmm: "08:45",
    reminder_instruction: "Reminder courage",
  }]);
});

Deno.test("select_state_potion supports recurring action weekday schedules", async () => {
  resetConsumedConfirmationTokensForTest();
  const draft = await structuredStatePotionDraftGenerator()({
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    state: {
      kind: "confusion_overload",
      intensity: "medium",
      evidence: ["test"],
    },
    potion_type: "clarte",
    context: { target_hint: "Reunions du mardi et jeudi" },
    constraints: [],
    forbidden: [],
  });
  if (!draft) throw new Error("missing_weekday_draft");
  draft.draft.target_binding = {
    kind: "recurring_action",
    label: "Reunions du mardi et jeudi",
    related_plan_item_id: null,
    target_plan_item_id: null,
    target_action_family_key: null,
    target_generated_temp_id: null,
    recurrence_hint: "mardi et jeudi",
    date_or_window_hint: null,
    evidence: ["mardi", "jeudi"],
  };
  draft.draft.follow_up = {
    ...draft.draft.follow_up,
    duration_days: 7,
    schedule_plan: {
      mode: "specific_weekdays",
      duration_days: 7,
      local_time_hhmm: "08:30",
      scheduled_days: ["tue", "thu"],
      local_dates: [],
      timing_relation: "before",
      reason: "Avant les reunions recurrentes.",
    },
  };
  const token = await createConfirmationToken({
    user_id: "u1",
    operation_id: "op-weekdays",
    operation_type: "select_state_potion",
    draft,
    source_message_id: "yes-weekdays",
    pending_confirmation_id: "pending-weekdays",
    secret: SECRET,
  });
  let scheduled: Array<{
    local_date: string;
    local_time_hhmm: string;
    reminder_instruction: string;
  }> = [];
  const executed = await executeActivateStatePotion({
    operation_id: "op-weekdays",
    user_id: "u1",
    draft,
    token,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async (tokenId) =>
      hasConsumedConfirmationTokenForTest(tokenId),
    write_potion_activation: async ({ scheduled_followups }) => {
      scheduled = scheduled_followups;
      return {
        potion_session_id: "p-weekdays",
        recurring_reminder_id: "r-weekdays",
        scheduled_checkin_ids: scheduled_followups.map((_, index) =>
          `s-weekdays-${index}`
        ),
      };
    },
    secret: SECRET,
    now_iso: "2026-05-04T08:00:00.000Z",
  });
  assertEquals(executed.status, "executed");
  assertEquals(
    scheduled.map((followup) => followup.local_date),
    ["2026-05-05", "2026-05-07"],
  );
  assertEquals(
    scheduled.every((followup) => followup.local_time_hhmm === "08:30"),
    true,
  );
});

Deno.test("select_state_potion proposes two options before draft when potion is not explicit", async () => {
  const output = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "j'ai besoin d'une potion",
    trigger_message_id: "m-choice",
    safety_pregate_risk_band: "none",
    slot_filler: structuredStatePotionSlotFiller({
      state_kind: "stress_pressure",
      shortlist: [
        {
          potion_type: "apaisement",
          reason: "pression forte",
          fit_confidence: "high",
          evidence: ["stress"],
        },
        {
          potion_type: "clarte",
          reason: "mental charge",
          fit_confidence: "medium",
          evidence: ["flou"],
        },
      ],
      generated_user_message:
        "Je te propose apaisement si la pression domine, ou clarte si c'est surtout le flou. Tu choisis laquelle ?",
    }),
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(output.status, "ask_question");
  assertEquals(output.phase, "potion_choice");
  assertEquals(output.state_patch.intake_state?.shortlist.options.length, 2);

  const chosen = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "apaisement",
    trigger_message_id: "m-choice-2",
    safety_pregate_risk_band: "none",
    operation_input: output.state_patch.operation_input,
    slot_filler: structuredStatePotionSlotFiller({
      state_kind: "stress_pressure",
      selected_potion: "apaisement",
    }),
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(chosen.status, "pending_confirmation");
  assertEquals(chosen.draft?.draft.potion_type, "apaisement");
});

Deno.test("select_state_potion asks two chat detail fields before draft", async () => {
  const askDetails = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je veux la potion de courage",
    trigger_message_id: "m-details-1",
    safety_pregate_risk_band: "none",
    slot_filler: structuredStatePotionSlotFiller({
      state_kind: "fear_avoidance",
      selected_potion: "courage",
      omit_detail_answers: true,
      generated_user_message:
        "Pour te faire une potion de courage juste, dis-moi ce que tu evites et ce qui bloque le plus.",
    }),
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(askDetails.status, "ask_question");
  assertEquals(askDetails.phase, "detail_intake");
  assertEquals(askDetails.state_patch.missing_slots, [
    "potion_detail:avoidance_target",
    "potion_detail:blocker_kind",
  ]);
  assertEquals(
    askDetails.next_question?.question?.includes("ce que tu evites"),
    true,
  );

  const ready = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "J'evite d'envoyer le message a mon associe, surtout par peur du conflit.",
    trigger_message_id: "m-details-2",
    safety_pregate_risk_band: "none",
    operation_input: askDetails.state_patch.operation_input,
    slot_filler: structuredStatePotionSlotFiller({
      state_kind: "fear_avoidance",
      selected_potion: "courage",
      detail_answers: [
        {
          question_id: "avoidance_target",
          label: "Qu'est-ce que tu evites en ce moment ?",
          answer: "Envoyer le message a mon associe.",
          evidence: ["message associe"],
        },
        {
          question_id: "blocker_kind",
          label: "Qu'est-ce qui bloque le plus ?",
          answer: "La peur du conflit.",
          evidence: ["peur du conflit"],
        },
      ],
    }),
    draft_generator: async (input) => {
      assertEquals(input.details?.required_question_ids, [
        "avoidance_target",
        "blocker_kind",
      ]);
      assertEquals(input.details?.answers.length, 2);
      return await structuredStatePotionDraftGenerator()(input);
    },
  });
  assertEquals(ready.status, "pending_confirmation");
  assertEquals(ready.draft?.draft.potion_type, "courage");
});

Deno.test("select_state_potion action-aware potion asks timing before draft when action timing is absent", async () => {
  const askTiming = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "C'est un message a mon associe, j'ai peur que ca parte en conflit.",
    trigger_message_id: "m-timing-1",
    safety_pregate_risk_band: "none",
    operation_input: {
      state: {
        kind: "fear_avoidance",
        intensity: "medium",
        evidence: ["peur conflit"],
      },
      potion_type: "courage",
    },
    slot_filler: async () => ({
      current_sub_skill: "detail_intake",
      state_patch: {
        state: {
          status: "identified",
          kind: "fear_avoidance",
          intensity: "medium",
          confidence: "high",
          evidence: ["peur conflit"],
        },
        selected_potion: {
          status: "identified",
          value: "courage",
          confidence: "high",
          evidence: ["courage"],
        },
        details: {
          status: "identified",
          required_question_ids: ["avoidance_target", "blocker_kind"],
          answers: [{
            question_id: "avoidance_target",
            label: "Qu'est-ce que tu evites en ce moment ?",
            answer: "Envoyer le message a mon associe.",
            evidence: ["message associe"],
          }, {
            question_id: "blocker_kind",
            label: "Qu'est-ce qui bloque le plus ?",
            answer: "La peur du conflit.",
            evidence: ["conflit"],
          }],
          evidence: ["detail"],
        },
        missing_slots: [SUPPORT_TIMING_SLOT],
        generated_user_message:
          "Tu voudrais que je sois la a quel moment autour de ce message ?",
        confidence: "high",
      },
      missing_slots: [SUPPORT_TIMING_SLOT],
      confidence: "high",
      generated_user_message:
        "Tu voudrais que je sois la a quel moment autour de ce message ?",
      evidence: ["detail"],
    }),
    draft_generator: async () => {
      throw new Error("draft_generator_should_wait_for_support_timing");
    },
  });

  assertEquals(askTiming.status, "ask_question");
  assertEquals(askTiming.phase, "detail_intake");
  assertEquals(askTiming.state_patch.missing_slots, [SUPPORT_TIMING_SLOT]);
  assertEquals(
    askTiming.state_patch.intake_state?.details.required_question_ids,
    ["avoidance_target", "blocker_kind", SUPPORT_TIMING_QUESTION_ID],
  );

  const ready = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Demain matin a 08h15, juste avant de l'envoyer.",
    trigger_message_id: "m-timing-2",
    safety_pregate_risk_band: "none",
    operation_input: askTiming.state_patch.operation_input,
    slot_filler: async () => ({
      current_sub_skill: "draft_generation",
      state_patch: {
        details: {
          status: "identified",
          required_question_ids: [
            "avoidance_target",
            "blocker_kind",
            SUPPORT_TIMING_QUESTION_ID,
          ],
          answers: [{
            question_id: SUPPORT_TIMING_QUESTION_ID,
            label:
              "Quand est-ce que Sophia doit etre la autour de cette action ?",
            answer: "Demain matin a 08h15, juste avant de l'envoyer.",
            evidence: ["demain 08h15"],
          }],
          evidence: ["timing"],
        },
        missing_slots: [],
        generated_user_message: null,
        confidence: "high",
      },
      missing_slots: [],
      confidence: "high",
      generated_user_message: null,
      evidence: ["timing"],
    }),
    draft_generator: async (input) => {
      assertEquals(input.details?.required_question_ids, [
        "avoidance_target",
        "blocker_kind",
        SUPPORT_TIMING_QUESTION_ID,
      ]);
      assertEquals(
        input.details?.answers.some((answer) =>
          answer.question_id === SUPPORT_TIMING_QUESTION_ID &&
          answer.answer.includes("08h15")
        ),
        true,
      );
      return await structuredStatePotionDraftGenerator()(input);
    },
  });

  assertEquals(ready.status, "pending_confirmation");
});

Deno.test("select_state_potion does not confirm action-aware draft when support timing slot is absent", async () => {
  const output = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Surtout savoir par ou commencer pour la reunion demain matin.",
    trigger_message_id: "m-vague-timing",
    safety_pregate_risk_band: "none",
    operation_input: {
      state: {
        kind: "confusion_overload",
        intensity: "medium",
        evidence: ["tout se melange"],
      },
      potion_type: "clarte",
    },
    slot_filler: async () => ({
      current_sub_skill: "draft_generation",
      state_patch: {
        state: {
          status: "identified",
          kind: "confusion_overload",
          intensity: "medium",
          confidence: "high",
          evidence: ["tout se melange"],
        },
        selected_potion: {
          status: "identified",
          value: "clarte",
          confidence: "high",
          evidence: ["potion de clarte"],
        },
        details: {
          status: "identified",
          required_question_ids: [
            "clarity_problem",
            "clarity_need",
          ],
          answers: [{
            question_id: "clarity_problem",
            label: "Qu'est-ce qui est flou pour toi en ce moment ?",
            answer: "L'angle de la reunion demain matin.",
            evidence: ["reunion demain matin"],
          }, {
            question_id: "clarity_need",
            label: "Tu as surtout besoin de comprendre quoi ?",
            answer: "Savoir par ou commencer.",
            evidence: ["par ou commencer"],
          }],
          evidence: ["detail"],
        },
        missing_slots: [],
        generated_user_message: null,
        confidence: "high",
      },
      missing_slots: [],
      confidence: "high",
      generated_user_message: null,
      evidence: ["detail"],
    }),
    draft_generator: async (input) => {
      const draft = await structuredStatePotionDraftGenerator()(input);
      if (!draft) throw new Error("missing_structured_draft");
      const adjusted = structuredClone(draft);
      adjusted.draft.target_binding = {
        ...adjusted.draft.target_binding,
        kind: "one_off_action",
        label: "reunion demain matin",
        date_or_window_hint: "demain matin",
        evidence: ["reunion demain matin"],
      };
      adjusted.draft.follow_up = {
        ...adjusted.draft.follow_up,
        local_time_hhmm: "08:30",
        schedule_plan: {
          mode: "single_before_event",
          duration_days: null,
          local_time_hhmm: "08:30",
          scheduled_days: [],
          local_dates: ["2026-05-23"],
          timing_relation: "before",
          reason: "Horaire deduit depuis une fenetre vague.",
        },
      };
      return adjusted;
    },
  });

  assertEquals(output.status, "ask_question");
  assertEquals(output.phase, "detail_intake");
  assertEquals(output.state_patch.missing_slots, [SUPPORT_TIMING_SLOT]);
  assertEquals(
    output.state_patch.intake_state?.details.required_question_ids.includes(
      SUPPORT_TIMING_QUESTION_ID,
    ),
    true,
  );
});

Deno.test("F4: le router potion reçoit l'historique récent pour ne pas redemander un slot déjà donné (A3-r11 T4)", async () => {
  let capturedRecent:
    | Array<{ role: "user" | "assistant"; content: string }>
    | undefined;
  const recent: Array<{ role: "user" | "assistant"; content: string }> = [
    {
      role: "user",
      content: "Apaisement. Oui, lance-la maintenant, version courte.",
    },
    { role: "assistant", content: "Ok, apaisement en version courte." },
    { role: "user", content: "Objectif + première étape. Avant 18h." },
  ];
  await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Objectif + première étape. Avant 18h.",
    trigger_message_id: "m-f4",
    safety_pregate_risk_band: "none",
    recent_messages: recent,
    slot_filler: async (input) => {
      capturedRecent = input.recent_messages;
      return {
        current_sub_skill: "potion_choice",
        state_patch: {},
        missing_slots: ["potion_type"],
        confidence: "low",
        generated_user_message: "Quelle potion ?",
      } as any;
    },
  });
  // Le slot filler (router IA) DOIT recevoir l'historique récent contenant le
  // choix "Apaisement", pour pouvoir éviter de re-poser la question du type.
  assertEquals(capturedRecent, recent);
});

Deno.test("select_state_potion preserves selected potion when reminder wording appears during active flow", async () => {
  const output = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je veux seulement ce rappel-la demain a 08h15 pour ma potion de courage.",
    trigger_message_id: "m-locked-potion",
    safety_pregate_risk_band: "none",
    operation_input: {
      intake_state: {
        skill_id: "select_state_potion",
        current_sub_skill: "detail_intake",
        state: {
          status: "identified",
          kind: "fear_avoidance",
          intensity: "medium",
          confidence: "high",
          evidence: ["peur conflit"],
        },
        explicit_potion_request: {
          status: "identified",
          potion_type: "courage",
          evidence: ["potion de courage"],
        },
        shortlist: { status: "missing", options: [], evidence: [] },
        selected_potion: {
          status: "identified",
          value: "courage",
          confidence: "high",
          evidence: ["potion de courage"],
        },
        details: {
          status: "missing",
          required_question_ids: [
            "avoidance_target",
            "blocker_kind",
            SUPPORT_TIMING_QUESTION_ID,
          ],
          answers: [{
            question_id: "avoidance_target",
            label: "Qu'est-ce que tu evites en ce moment ?",
            answer: "Envoyer le message a mon associe.",
            evidence: ["message"],
          }, {
            question_id: "blocker_kind",
            label: "Qu'est-ce qui bloque le plus ?",
            answer: "La peur du conflit.",
            evidence: ["conflit"],
          }],
          evidence: ["detail"],
        },
        context: {},
        missing_slots: [SUPPORT_TIMING_SLOT],
        confidence: "high",
        generated_user_message: null,
      },
      potion_type: "courage",
      explicit_potion_type: "courage",
    },
    slot_filler: async () => ({
      current_sub_skill: "draft_generation",
      state_patch: {
        selected_potion: {
          status: "identified",
          value: "rappel",
          confidence: "medium",
          evidence: ["rappel-la"],
        },
        details: {
          status: "identified",
          required_question_ids: [
            "avoidance_target",
            "blocker_kind",
            SUPPORT_TIMING_QUESTION_ID,
          ],
          answers: [{
            question_id: "avoidance_target",
            label: "Qu'est-ce que tu evites en ce moment ?",
            answer: "Envoyer le message a mon associe.",
            evidence: ["message"],
          }, {
            question_id: "blocker_kind",
            label: "Qu'est-ce qui bloque le plus ?",
            answer: "La peur du conflit.",
            evidence: ["conflit"],
          }, {
            question_id: SUPPORT_TIMING_QUESTION_ID,
            label:
              "Quand est-ce que Sophia doit etre la autour de cette action ?",
            answer: "Demain a 08h15, une seule fois.",
            evidence: ["rappel-la demain 08h15"],
          }],
          evidence: ["timing"],
        },
        missing_slots: [],
        generated_user_message: null,
        confidence: "high",
      },
      missing_slots: [],
      confidence: "high",
      generated_user_message: null,
      evidence: ["timing"],
    }),
    draft_generator: async (input) => {
      assertEquals(input.potion_type, "courage");
      return await structuredStatePotionDraftGenerator()(input);
    },
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.potion_type, "courage");
});

Deno.test("select_state_potion detail fallback asks missing fields without technical wording", async () => {
  const askDetails = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je veux la potion de courage",
    trigger_message_id: "m-details-fallback-1",
    safety_pregate_risk_band: "none",
    slot_filler: structuredStatePotionSlotFiller({
      state_kind: "fear_avoidance",
      selected_potion: "courage",
      omit_detail_answers: true,
      generated_user_message:
        "Dis-moi ce que tu evites et ce qui bloque le plus.",
    }),
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  const fallback = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "J'evite surtout d'envoyer ce message.",
    trigger_message_id: "m-details-fallback-2",
    safety_pregate_risk_band: "none",
    operation_input: askDetails.state_patch.operation_input,
    slot_filler: async () => null,
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(fallback.status, "ask_question");
  assertEquals(fallback.phase, "detail_intake");
  assertEquals(
    String(fallback.next_question?.question ?? "").includes("Je garde l'idee"),
    false,
  );
  assertStringIncludes(
    fallback.next_question?.question ?? "",
    "passage concret",
  );
  assertEquals(
    fallback.next_question?.question?.includes(
      "Je n'ai pas pu lire correctement",
    ),
    false,
  );
  const lastResort = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je suis a cran",
    trigger_message_id: "m-details-fallback-3",
    safety_pregate_risk_band: "none",
    slot_filler: async () => null,
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(lastResort.status, "ask_question");
  assertEquals(lastResort.phase, "state_resolution");
  assertEquals(lastResort.state_patch.missing_slots, ["state", "potion_type"]);
  assertEquals(
    Boolean(lastResort.state_patch.operation_input?.intake_state),
    true,
  );
  assertEquals(
    String(lastResort.next_question?.question ?? "").includes(
      "Je n'ai pas pu lire correctement",
    ),
    false,
  );
  assertStringIncludes(
    lastResort.next_question?.question ?? "",
    "Qu'est-ce qui te pèse",
  );
});

Deno.test("select_state_potion revision keeps potion selected from previous draft", async () => {
  const output = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Avant validation, je veux que le suivi m'aide a ralentir, pas a performer.",
    trigger_message_id: "m-revision-previous-draft-1",
    safety_pregate_risk_band: "none",
    operation_input: {
      previous_draft: {
        draft: {
          potion_type: "apaisement",
          title: "Potion d'apaisement",
        },
      },
    },
    slot_filler: async (input) => {
      assertEquals(input.current_state?.selected_potion.value, "apaisement");
      return {
        current_sub_skill: "detail_intake",
        state_patch: {
          state: {
            status: "identified",
            kind: "stress_pressure",
            intensity: "high",
            confidence: "high",
            evidence: ["sous pression"],
          },
          selected_potion: {
            status: "missing",
            value: null,
            confidence: "low",
            evidence: [],
          },
          details: {
            status: "identified",
            required_question_ids: ["pressure_source", "pressure_state"],
            answers: [{
              question_id: "pressure_source",
              label: "Qu'est-ce qui te met le plus sous pression ?",
              answer: "La reunion de cet apres-midi.",
              evidence: ["reunion"],
            }, {
              question_id: "pressure_state",
              label: "Tu te sens plutot comment dans ton corps ?",
              answer: "A cran et submerge.",
              evidence: ["a cran"],
            }],
            evidence: ["revision_request"],
          },
        },
        missing_slots: [],
        confidence: "high",
      };
    },
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.potion_type, "apaisement");
});

Deno.test("select_state_potion revision reuses previous draft context instead of re-asking details", async () => {
  const previousDraft = await structuredStatePotionDraftGenerator()({
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    state: { kind: "stress_pressure", intensity: "high", evidence: ["test"] },
    potion_type: "apaisement",
    context: {},
    constraints: [],
    forbidden: [],
  });
  const output = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je veux juste que ça ne me pousse pas à performer, garde le matin.",
    trigger_message_id: "m-revision-previous-draft-context",
    safety_pregate_risk_band: "none",
    operation_input: {
      previous_draft: previousDraft,
      revision_request:
        "Je veux juste que ça ne me pousse pas à performer, garde le matin.",
    },
    slot_filler: async (input) => {
      assertEquals(input.current_state?.selected_potion.value, "apaisement");
      assertEquals(input.current_state?.details.answers.length, 2);
      return {
        current_sub_skill: "draft_generation",
        state_patch: {
          details: input.current_state?.details,
        },
        missing_slots: [],
        confidence: "high",
        generated_user_message: null,
      };
    },
    draft_generator: async (input) => {
      assertEquals(input.previous_draft?.draft.potion_type, "apaisement");
      assertEquals(input.revision_request?.includes("performer"), true);
      return await structuredStatePotionDraftGenerator()(input);
    },
  });
  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.potion_type, "apaisement");
});

Deno.test("select_state_potion does not ask to reroute after explicit potion selection", async () => {
  const output = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je suis submerge et a cran",
    trigger_message_id: "m-no-reroute-1",
    safety_pregate_risk_band: "none",
    operation_input: {
      previous_draft: {
        draft: {
          potion_type: "apaisement",
          title: "Potion d'apaisement",
        },
      },
    },
    slot_filler: async () => ({
      current_sub_skill: "detail_intake",
      state_patch: {
        state: {
          status: "identified",
          kind: "stress_pressure",
          intensity: "high",
          confidence: "high",
          evidence: ["a cran"],
        },
        selected_potion: {
          status: "missing",
          value: null,
          confidence: "low",
          evidence: [],
        },
        details: {
          status: "missing",
          required_question_ids: ["pressure_source", "pressure_state"],
          answers: [],
          evidence: [],
        },
      },
      missing_slots: ["potion_detail:pressure_source"],
      confidence: "medium",
      generated_user_message:
        "Tu préfères qu'on parte sur de l'apaisement ou de la clarté ?",
      evidence: ["structured"],
    }),
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(output.status, "ask_question");
  assertEquals(
    String(output.next_question?.question ?? "").includes("clarté"),
    false,
  );
  assertStringIncludes(output.next_question?.question ?? "", "pression");
});

Deno.test("select_state_potion default orchestrator forces router then detail subskill before draft", async () => {
  let routerCalls = 0;
  let detailCalls = 0;
  const output = await fillSelectStatePotionSlotsWithAi({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je veux une potion de courage pour envoyer ce message, je bloque surtout par peur du conflit.",
  }, {
    router: async () => {
      routerCalls += 1;
      return {
        current_sub_skill: "draft_generation",
        state_patch: {
          state: {
            status: "identified",
            kind: "fear_avoidance",
            intensity: "medium",
            confidence: "high",
            evidence: ["peur du conflit"],
          },
          selected_potion: {
            status: "identified",
            value: "courage",
            confidence: "high",
            evidence: ["potion de courage"],
          },
          details: {
            status: "identified",
            required_question_ids: ["avoidance_target", "blocker_kind"],
            answers: [{
              question_id: "avoidance_target",
              label: "Qu'est-ce que tu evites en ce moment ?",
              answer: "Cette reponse ne doit pas venir du router.",
              evidence: ["router_overreach"],
            }, {
              question_id: "blocker_kind",
              label: "Qu'est-ce qui bloque le plus ?",
              answer: "Cette reponse ne doit pas venir du router.",
              evidence: ["router_overreach"],
            }],
            evidence: ["router_overreach"],
          },
        },
        missing_slots: [],
        confidence: "high",
        generated_user_message: null,
        evidence: ["router"],
      };
    },
    detail: async (input) => {
      detailCalls += 1;
      assertEquals(input.current_state?.current_sub_skill, "detail_intake");
      assertEquals(input.current_state?.details.answers, []);
      return {
        current_sub_skill: "draft_generation",
        state_patch: {
          details: {
            status: "identified",
            required_question_ids: ["avoidance_target", "blocker_kind"],
            answers: [{
              question_id: "avoidance_target",
              label: "Qu'est-ce que tu evites en ce moment ?",
              answer: "Envoyer le message a mon associe.",
              evidence: ["message associe"],
            }, {
              question_id: "blocker_kind",
              label: "Qu'est-ce qui bloque le plus ?",
              answer: "La peur du conflit.",
              evidence: ["peur du conflit"],
            }],
            evidence: ["detail"],
          },
        },
        missing_slots: [],
        confidence: "high",
        generated_user_message: null,
        evidence: ["detail"],
      };
    },
  });
  assertEquals(routerCalls, 1);
  assertEquals(detailCalls, 1);
  assertEquals(output?.current_sub_skill, "draft_generation");
  assertEquals(output?.missing_slots, []);
  assertEquals(
    output?.state_patch.details?.answers.map((answer) => answer.answer),
    ["Envoyer le message a mon associe.", "La peur du conflit."],
  );
});

Deno.test("select_state_potion default orchestrator does not rerun router after potion is selected", async () => {
  let routerCalls = 0;
  let detailCalls = 0;
  const slotFiller = (
    input: Parameters<typeof fillSelectStatePotionSlotsWithAi>[0],
  ) =>
    fillSelectStatePotionSlotsWithAi(input, {
      router: async () => {
        routerCalls += 1;
        return {
          current_sub_skill: "detail_intake",
          state_patch: {
            state: {
              status: "identified",
              kind: "fear_avoidance",
              intensity: "medium",
              confidence: "high",
              evidence: ["peur"],
            },
            selected_potion: {
              status: "identified",
              value: "courage",
              confidence: "high",
              evidence: ["courage"],
            },
            generated_user_message:
              "Qu'est-ce que tu evites, et qu'est-ce qui bloque le plus ?",
          },
          missing_slots: [
            "potion_detail:avoidance_target",
            "potion_detail:blocker_kind",
          ],
          confidence: "high",
          generated_user_message:
            "Qu'est-ce que tu evites, et qu'est-ce qui bloque le plus ?",
          evidence: ["router"],
        };
      },
      detail: async (input) => {
        detailCalls += 1;
        if (input.message.includes("associe")) {
          return {
            current_sub_skill: "draft_generation",
            state_patch: {
              details: {
                status: "identified",
                required_question_ids: ["avoidance_target", "blocker_kind"],
                answers: [{
                  question_id: "avoidance_target",
                  label: "Qu'est-ce que tu evites en ce moment ?",
                  answer: "Envoyer le message a mon associe.",
                  evidence: ["message associe"],
                }, {
                  question_id: "blocker_kind",
                  label: "Qu'est-ce qui bloque le plus ?",
                  answer: "La peur du conflit.",
                  evidence: ["peur du conflit"],
                }],
                evidence: ["detail"],
              },
            },
            missing_slots: [],
            confidence: "high",
            generated_user_message: null,
            evidence: ["detail"],
          };
        }
        return {
          current_sub_skill: "detail_intake",
          state_patch: {
            generated_user_message:
              "Qu'est-ce que tu evites, et qu'est-ce qui bloque le plus ?",
          },
          missing_slots: [
            "potion_detail:avoidance_target",
            "potion_detail:blocker_kind",
          ],
          confidence: "high",
          generated_user_message:
            "Qu'est-ce que tu evites, et qu'est-ce qui bloque le plus ?",
          evidence: ["detail"],
        };
      },
    });

  const askDetails = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Je veux une potion de courage",
    trigger_message_id: "m-architecture-1",
    safety_pregate_risk_band: "none",
    slot_filler: slotFiller,
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(askDetails.status, "ask_question");
  assertEquals(askDetails.phase, "detail_intake");

  const ready = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "J'evite d'envoyer le message a mon associe, surtout par peur du conflit.",
    trigger_message_id: "m-architecture-2",
    safety_pregate_risk_band: "none",
    operation_input: askDetails.state_patch.operation_input,
    slot_filler: slotFiller,
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(routerCalls, 1);
  assertEquals(detailCalls, 2);
  assertEquals(ready.status, "pending_confirmation");
  assertEquals(ready.draft?.draft.potion_type, "courage");
});

Deno.test("select_state_potion blocks missing state, safety and writes without Oui", async () => {
  const ask = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "j'ai besoin d'une potion",
    trigger_message_id: "m1",
    safety_pregate_risk_band: "none",
    slot_filler: structuredStatePotionSlotFiller({
      generated_user_message:
        "C'est plutot stress, honte, peur, flou, durete envers toi, ou decrochage ?",
    }),
  });
  assertEquals(ask.status, "ask_question");
  const invalidRecommendation = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "recommendation",
    source: "recommendation_tool",
    operation_input: { potion_type: "apaisement" },
    trigger_message_id: "m2",
    safety_pregate_risk_band: "none",
  });
  assertEquals(invalidRecommendation.status, "invalid_recommendation_payload");
  const readyRecommendation = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "recommendation",
    source: "recommendation_tool",
    operation_input: {
      state: { kind: "stress_pressure", intensity: "medium" },
      potion_type: "apaisement",
      details: {
        required_question_ids: ["pressure_source", "pressure_state"],
        answers: [
          {
            question_id: "pressure_source",
            label: "Qu'est-ce qui te met le plus sous pression la ?",
            answer: "Une accumulation.",
            evidence: ["structured_recommendation"],
          },
          {
            question_id: "pressure_state",
            label: "Tu te sens plutot comment ?",
            answer: "Submerge.",
            evidence: ["structured_recommendation"],
          },
        ],
      },
    },
    trigger_message_id: "m2-ready",
    safety_pregate_risk_band: "none",
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(readyRecommendation.status, "pending_confirmation");
  const safety = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je veux me faire du mal, lance une potion",
    trigger_message_id: "m3",
    safety_pregate_risk_band: "critical",
  });
  assertEquals(safety.status, "blocked_by_safety");
  const mediumIntake = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je veux une potion de rappel",
    trigger_message_id: "m-medium-safety",
    safety_pregate_risk_band: "medium",
    slot_filler: structuredStatePotionSlotFiller({
      state_kind: "decrochage",
      selected_potion: "rappel",
    }),
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  assertEquals(mediumIntake.status, "pending_confirmation");
  const ready = await runSelectStatePotionIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "je suis stresse, fais-moi une potion",
    trigger_message_id: "m4",
    safety_pregate_risk_band: "none",
    slot_filler: structuredStatePotionSlotFiller({
      state_kind: "stress_pressure",
      selected_potion: "apaisement",
    }),
    draft_generator: structuredStatePotionDraftGenerator(),
  });
  if (ready.status !== "pending_confirmation") {
    throw new Error("expected_ready");
  }
  let writes = 0;
  const noToken = await executeActivateStatePotion({
    operation_id: String(ready.pending_confirmation?.operation_id),
    user_id: "u1",
    draft: ready.draft!,
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async () => false,
    write_potion_activation: async () => {
      writes++;
      return {
        potion_session_id: "p",
        recurring_reminder_id: "r",
        scheduled_checkin_ids: Array.from({ length: 7 }, (_, i) => `s${i}`),
      };
    },
    secret: SECRET,
  });
  assertEquals(noToken.status, "blocked");
  assertEquals(writes, 0);
});

Deno.test("select_state_potion router: no_potion constraint cancels active intake", async () => {
  const result = await maybeRunSelectStatePotionOperation({
    supabase: fakeSupabase,
    userId: "u1",
    userMessage: "stop, pas de potion",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_tool_skill_intake: {
        operation_type: "select_state_potion",
        phase: "detail_intake",
        operation_input: { potion_type: "rappel" },
        turn_count: 1,
      },
      __potion_followup_consent: "refused",
    },
    turnFrame: null,
    routeDecision: selectPotionRouteDecision,
    safetyPregateOutput: fakeSafetyPregate,
    sourceMessageId: "m-no-potion-active",
    requestId: "r-no-potion-active",
  });

  assert(result);
  assertEquals(result.toolSkillRun.status, "cancelled");
  assertEquals(result.toolSkillRun.user_intent, "forbid_potion");
  assertEquals((result.toolSkillRun as any).constraints, [{
    kind: "no_potion",
    evidence: ["stop, pas de potion"],
  }]);
  assertEquals((result.toolSkillRun as any).allowed_effects, []);
  assertEquals((result.toolSkillRun as any).blocked_effects, [{
    type: "activate_state_potion",
    reason_code: "no_potion",
  }]);
  assertEquals(
    (result.toolSkillRun as any).effect_ledger.blocked_effects,
    [{
      type: "activate_state_potion",
      reason_code: "no_potion",
    }],
  );
  const frame = loadSelectStatePotionFrameFromTempMemory(
    result.nextTempMemory,
  );
  assertEquals(frame.active, null);
  assertEquals(frame.pending, null);
  assertEquals(frame.recommendation, null);
  assertEquals(frame.followup_consent, null);
});

Deno.test("select_state_potion router: no_potion constraint blocks new start", async () => {
  const result = await maybeRunSelectStatePotionOperation({
    supabase: fakeSupabase,
    userId: "u1",
    userMessage: "donne-moi juste une phrase, sans potion",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: selectPotionRouteDecision,
    safetyPregateOutput: fakeSafetyPregate,
    sourceMessageId: "m-no-potion-start",
    requestId: "r-no-potion-start",
  });

  assert(result);
  assertEquals(result.toolSkillRun.status, "cancelled");
  assertEquals(result.toolSkillRun.user_intent, "forbid_potion");
  assertEquals(String(result.content).includes("Phrase de réparation"), true);
  assertEquals(
    (result.toolSkillRun as any).debug.reason_code,
    "select_state_potion_no_potion_constraint",
  );
  assertEquals(result.executedTools, []);
  assertEquals(
    loadSelectStatePotionFrameFromTempMemory(result.nextTempMemory)
      .followup_consent,
    null,
  );
});

Deno.test("select_state_potion router: structured one-shot interrupt exits potion router", async () => {
  const result = await maybeRunSelectStatePotionOperation({
    supabase: fakeSupabase,
    userId: "u1",
    userMessage: "programme ce rappel ponctuel à 14h35, rien de récurrent",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_tool_skill_intake: {
        operation_type: "select_state_potion",
        phase: "detail_intake",
        operation_input: { potion_type: "apaisement" },
        turn_count: 2,
      },
    },
    turnFrame: null,
    routeDecision: {
      ...selectPotionRouteDecision,
      response_owner: "normal_reply",
      selected_handler: undefined,
      reason_code: "create_one_shot_reminder_interrupts_active_handoff",
      direct_effects_to_run: ["create_one_shot_reminder"],
    },
    safetyPregateOutput: fakeSafetyPregate,
    sourceMessageId: "m-one-shot-handoff",
    requestId: "r-one-shot-handoff",
  });

  assertEquals(result, null);
});

Deno.test("select_state_potion router: followup refusal stays no-mutation on activation attempt", async () => {
  resetConsumedConfirmationTokensForTest();
  const draft = await structuredStatePotionDraftGenerator()({
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    state: {
      kind: "stress_pressure",
      intensity: "medium",
      evidence: ["pression"],
    },
    potion_type: "apaisement",
    context: {},
    constraints: [],
    forbidden: [],
  });
  if (!draft) throw new Error("missing_draft");

  const result = await maybeRunSelectStatePotionOperation({
    supabase: fakeSupabase,
    userId: "u1",
    userMessage: "oui active cette potion, juste maintenant sans suivi",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-contract-followup",
        operation_type: "select_state_potion",
        draft,
        turn_count: 1,
      },
      __potion_followup_consent: "refused",
    },
    turnFrame: null,
    routeDecision: selectPotionRouteDecision,
    safetyPregateOutput: fakeSafetyPregate,
    sourceMessageId: "m-activate-no-followup",
    requestId: "r-activate-no-followup",
    draftReviewOverride: async () => ({
      decision: "approve",
      confidence: "high",
      evidence: ["oui active cette potion"],
      generated_user_message: null,
    }),
  });

  assert(result);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.executedTools, []);
  assertEquals((result.toolSkillRun as any).status, "apply_attempt");
  assertEquals((result.toolSkillRun as any).user_intent, "activate");
  assertEquals((result.toolSkillRun as any).allowed_effects, []);
  assertEquals((result.toolSkillRun as any).committed_effects, []);
  assertEquals(
    (result.toolSkillRun as any).platform_handoff?.no_chat_mutation,
    true,
  );
  assertEquals(
    String(result.content).includes("Je ne l'active pas depuis le chat."),
    true,
  );
});

Deno.test("select_state_potion router: activation attempt stays platform handoff", async () => {
  resetConsumedConfirmationTokensForTest();
  const draft = await structuredStatePotionDraftGenerator()({
    operation_type: "select_state_potion",
    output_schema: "potion_session_draft_v1",
    state: {
      kind: "stress_pressure",
      intensity: "medium",
      evidence: ["pression"],
    },
    potion_type: "apaisement",
    context: {},
    constraints: [],
    forbidden: [],
  });
  if (!draft) throw new Error("missing_draft");

  const result = await maybeRunSelectStatePotionOperation({
    supabase: fakeSupabase,
    userId: "u1",
    userMessage: "oui active cette potion",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_id: "op-contract-blocked",
        operation_type: "select_state_potion",
        draft,
        turn_count: 1,
      },
    },
    turnFrame: null,
    routeDecision: selectPotionRouteDecision,
    safetyPregateOutput: fakeSafetyPregate,
    sourceMessageId: "m-activate-blocked",
    requestId: "r-activate-blocked",
    draftReviewOverride: async () => ({
      decision: "approve",
      confidence: "high",
      evidence: ["oui active cette potion"],
      generated_user_message: null,
    }),
  });

  assert(result);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.executedTools, []);
  assertEquals(
    String(result.content).includes("Je ne l'active pas depuis le chat."),
    true,
  );
  assertEquals((result.toolSkillRun as any).status, "apply_attempt");
  assertEquals((result.toolSkillRun as any).allowed_effects, []);
  assertEquals((result.toolSkillRun as any).committed_effects, []);
});
