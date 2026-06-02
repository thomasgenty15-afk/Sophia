import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createEffectLedger } from "./effect_ledger.ts";
import { runFinalResponsePipeline } from "./final_response_pipeline.ts";

function deps(overrides: Record<string, unknown> = {}) {
  return {
    directSafetyCrisisReplyOverride: () => null,
    directConversationSkillReplyOverride: () => null,
    oneShotReminderManagementReply: () => null,
    enforceRecommendationToolVisibleReply: ({ responseContent }: any) =>
      responseContent,
    stripHiddenHtmlComments: (text: unknown) =>
      String(text).replace(/<!--[\s\S]*?-->/g, "").trim(),
    stripDeprecatedProductVocabulary: (text: string) => text,
    weeklyAdaptiveReviewStateForTurn: () => null,
    cleanWeeklyVisibleResponse: (text: string) =>
      text.replace("Respiration de pause", "pause"),
    applyMemoryV2ResponseGroundingGuardrail: ({ responseContent }: any) =>
      responseContent,
    applyNonDurableMemoryPromiseGuard: ({ responseContent }: any) =>
      responseContent,
    applyWeeklyForgottenProgressAckGuard: ({ responseContent }: any) =>
      responseContent,
    applyWeeklyRepeatedClarificationGuard: ({ responseContent }: any) =>
      responseContent,
    applyWeeklyConcreteOrganizationGuard: ({ responseContent }: any) =>
      responseContent,
    applyWeeklyConclusionGuard: ({ responseContent }: any) => responseContent,
    applyCompactStartGuard: ({ responseContent }: any) => responseContent,
    applyIncompleteRecapGuard: ({ responseContent }: any) => responseContent,
    applyUnexecutedEffectClaimGuard: ({ responseContent }: any) =>
      responseContent,
    applyCoachResponseStylePreferences: ({ responseContent }: any) =>
      responseContent,
    userRequestsShortStyle: () => false,
    normalizeRouteText: (text: string) =>
      text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
    ensureVisibleSophiaEmoji: (text: unknown) => `${String(text)} 🙂`,
    ...overrides,
  } as any;
}

Deno.test("final_response_pipeline rewrites done claim without committed effect", () => {
  const result = runFinalResponsePipeline({
    baseResponseContent: "C'est fait, le rappel est programmé.",
    userMessage: "programme un rappel",
    routeDecision: null,
    skillOutput: null,
    recommendation: null,
    effectLedger: createEffectLedger("turn_final_1"),
    activeSkillState: null,
    tempMemory: {},
    history: [],
    memoryV2ActiveContextBlock: "",
    stylePreferences: { noEmoji: true },
    deps: deps({ ensureVisibleSophiaEmoji: (text: unknown) => String(text) }),
  });
  assert(result.guardEvents.length > 0);
  assert(!/C'est fait, le rappel est programmé/.test(result.responseContent));
});

Deno.test("final_response_pipeline respects no emoji short style", () => {
  const result = runFinalResponsePipeline({
    baseResponseContent: "Réponse courte.",
    userMessage: "réponds court sans emoji",
    routeDecision: null,
    skillOutput: null,
    recommendation: null,
    effectLedger: createEffectLedger("turn_final_2"),
    activeSkillState: null,
    tempMemory: {},
    history: [],
    memoryV2ActiveContextBlock: "",
    stylePreferences: { noEmoji: true },
    deps: deps({ userRequestsShortStyle: () => true }),
  });
  assertEquals(result.responseContent, "Réponse courte.");
});

Deno.test("final_response_pipeline keeps safety replies sober and opaque", () => {
  const result = runFinalResponsePipeline({
    baseResponseContent: "base",
    userMessage: "je ne me sens pas en sécurité",
    routeDecision: {
      route_version: "v1",
      response_owner: "safety",
      selected_handler: "safety_crisis",
      reason_code: "safety_override",
      direct_effects_to_run: [],
      blocked_paths: [],
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    } as any,
    skillOutput: {
      skill_id: "safety_crisis",
      status: "continue",
      response_intent: "ground_safety",
      reply:
        "Tu as fait les bons gestes immediats. Reste avec cette personne au telephone encore un moment.",
      recommendation_need: { needed: false, type: "none" },
      operation_suggestions: [],
      memory_trace: {
        memory_used_for_response: false,
        memory_item_ids_used: [],
        correction_detected: false,
        correction_target_item_ids: [],
      },
    } as any,
    recommendation: null,
    effectLedger: createEffectLedger("turn_final_safety"),
    activeSkillState: null,
    tempMemory: {},
    history: [],
    memoryV2ActiveContextBlock: "",
    stylePreferences: {},
    deps: deps({
      directSafetyCrisisReplyOverride: ({ skillOutput }: any) =>
        String(skillOutput?.reply ?? "").trim() || null,
    }),
  });
  assertEquals(
    result.responseContent,
    "Tu as fait les bons gestes immediats. Reste avec cette personne au telephone encore un moment.",
  );
  assertEquals(
    /mode securite|mode sécurité|🙂/i.test(result.responseContent),
    false,
  );
});

Deno.test("final_response_pipeline does not enforce recommendation on product_help", () => {
  let enforced = false;
  runFinalResponsePipeline({
    baseResponseContent: "Aide produit.",
    userMessage: "où trouver le rappel ?",
    routeDecision: {
      route_version: "v1",
      response_owner: "product_help",
      selected_handler: "product_help",
      reason_code: "product_help",
      direct_effects_to_run: [],
      blocked_paths: [],
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    } as any,
    skillOutput: null,
    recommendation: { id: "rec_1" },
    effectLedger: createEffectLedger("turn_final_3"),
    activeSkillState: null,
    tempMemory: {},
    history: [],
    memoryV2ActiveContextBlock: "",
    stylePreferences: { noEmoji: true },
    deps: deps({
      enforceRecommendationToolVisibleReply: (input: any) => {
        enforced = true;
        return input.responseContent;
      },
      ensureVisibleSophiaEmoji: (text: unknown) => String(text),
    }),
  });
  assertEquals(enforced, false);
});

Deno.test("final_response_pipeline preserves orientation_clarification question", () => {
  let oneShotCalled = false;
  let enforced = false;
  let unexecutedGuardCalled = false;
  const result = runFinalResponsePipeline({
    baseResponseContent:
      "Tu veux plutôt un rappel ponctuel, ou un rappel récurrent ?",
    userMessage:
      "Je veux que Sophia me relance demain matin, enfin peut-être tous les matins.",
    routeDecision: {
      route_version: "v1",
      response_owner: "orientation_clarification",
      selected_handler: "orientation_clarification",
      reason_code: "clarification_required",
      direct_effects_to_run: [],
      blocked_paths: [],
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    } as any,
    skillOutput: null,
    recommendation: { id: "rec_1" },
    effectLedger: createEffectLedger("turn_final_4"),
    activeSkillState: null,
    tempMemory: {},
    history: [],
    memoryV2ActiveContextBlock: "",
    stylePreferences: { noEmoji: true },
    deps: deps({
      oneShotReminderManagementReply: () => {
        oneShotCalled = true;
        return "Je n'ai pas réussi à le faire.";
      },
      enforceRecommendationToolVisibleReply: (input: any) => {
        enforced = true;
        return input.responseContent;
      },
      applyUnexecutedEffectClaimGuard: ({ responseContent }: any) => {
        unexecutedGuardCalled = true;
        return responseContent;
      },
      ensureVisibleSophiaEmoji: (text: unknown) => String(text),
    }),
  });

  assertEquals(
    result.responseContent,
    "Tu veux plutôt un rappel ponctuel, ou un rappel récurrent ?",
  );
  assertEquals(oneShotCalled, false);
  assertEquals(enforced, false);
  assertEquals(unexecutedGuardCalled, false);
});

Deno.test("final_response_pipeline allows honest platform handoff wording without commit", () => {
  const result = runFinalResponsePipeline({
    baseResponseContent:
      "Je te conseille de le faire dans la section Plan. Je ne le modifie pas depuis le chat.",
    userMessage: "allège mon plan",
    routeDecision: null,
    skillOutput: null,
    recommendation: null,
    effectLedger: createEffectLedger("turn_final_handoff_allowed"),
    activeSkillState: null,
    tempMemory: {},
    history: [],
    memoryV2ActiveContextBlock: "",
    stylePreferences: { noEmoji: true },
    deps: deps({ ensureVisibleSophiaEmoji: (text: unknown) => String(text) }),
  });

  assertEquals(result.guardEvents, []);
  assertEquals(
    result.responseContent,
    "Je te conseille de le faire dans la section Plan. Je ne le modifie pas depuis le chat.",
  );
});

Deno.test("final_response_pipeline blocks plan done language without commit", () => {
  const result = runFinalResponsePipeline({
    baseResponseContent: "J'ai modifié ton plan.",
    userMessage: "allège mon plan",
    routeDecision: null,
    skillOutput: null,
    recommendation: null,
    effectLedger: createEffectLedger("turn_final_handoff_done"),
    activeSkillState: null,
    tempMemory: {},
    history: [],
    memoryV2ActiveContextBlock: "",
    stylePreferences: { noEmoji: true },
    deps: deps({ ensureVisibleSophiaEmoji: (text: unknown) => String(text) }),
  });

  assertEquals(result.guardEvents, ["uncommitted_plan_adjust_claim"]);
  assertEquals(result.responseContent, "Je ne l'ai pas modifié.");
});

Deno.test("final_response_pipeline blocks state potion activation claim without commit", () => {
  const result = runFinalResponsePipeline({
    baseResponseContent:
      'Yes, activée "Clarté" ✅🧭\n\nMaintenant, écris une phrase.',
    userMessage: "Ok vas-y active-la.",
    routeDecision: null,
    skillOutput: null,
    recommendation: null,
    effectLedger: createEffectLedger("turn_final_potion_activation_claim"),
    activeSkillState: null,
    tempMemory: {},
    history: [],
    memoryV2ActiveContextBlock: "",
    stylePreferences: { noEmoji: true },
    deps: deps({ ensureVisibleSophiaEmoji: (text: unknown) => String(text) }),
  });

  assertEquals(result.guardEvents, [
    "uncommitted_state_potion_activate_claim",
  ]);
  assertEquals(
    result.responseContent,
    "Je ne l'active pas depuis le chat. Reprends cette recommandation dans la section État / Potions.",
  );
});

Deno.test("final_response_pipeline blocks recurring creation done language without commit", () => {
  const result = runFinalResponsePipeline({
    baseResponseContent: "C'est créé, le rappel récurrent est en place.",
    userMessage: "crée un rappel récurrent",
    routeDecision: null,
    skillOutput: null,
    recommendation: null,
    effectLedger: createEffectLedger("turn_final_recurring_done"),
    activeSkillState: null,
    tempMemory: {},
    history: [],
    memoryV2ActiveContextBlock: "",
    stylePreferences: { noEmoji: true },
    deps: deps({ ensureVisibleSophiaEmoji: (text: unknown) => String(text) }),
  });

  assert(result.guardEvents.length > 0);
  assert(!/C'est créé/.test(result.responseContent));
});

Deno.test("final_response_pipeline allows recurring platform redirect", () => {
  const result = runFinalResponsePipeline({
    baseResponseContent:
      "Tu peux le créer dans la plateforme. Je ne le programme pas depuis le chat.",
    userMessage: "crée un rappel récurrent",
    routeDecision: null,
    skillOutput: null,
    recommendation: null,
    effectLedger: createEffectLedger("turn_final_recurring_redirect"),
    activeSkillState: null,
    tempMemory: {},
    history: [],
    memoryV2ActiveContextBlock: "",
    stylePreferences: { noEmoji: true },
    deps: deps({ ensureVisibleSophiaEmoji: (text: unknown) => String(text) }),
  });

  assertEquals(result.guardEvents, []);
  assertEquals(
    result.responseContent,
    "Tu peux le créer dans la plateforme. Je ne le programme pas depuis le chat.",
  );
});
