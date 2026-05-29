import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createEffectLedger } from "./effect_ledger.ts";
import { runFinalResponsePipeline } from "./final_response_pipeline.ts";

function deps(overrides: Record<string, unknown> = {}) {
  return {
    directSafetyCrisisReplyOverride: () => null,
    directConversationSkillReplyOverride: () => null,
    oneShotReminderManagementReply: () => null,
    enforceRecommendationToolVisibleReply: ({ responseContent }: any) => responseContent,
    stripHiddenHtmlComments: (text: unknown) => String(text).replace(/<!--[\s\S]*?-->/g, "").trim(),
    stripDeprecatedProductVocabulary: (text: string) => text,
    weeklyAdaptiveReviewStateForTurn: () => null,
    cleanWeeklyVisibleResponse: (text: string) => text.replace("Respiration de pause", "pause"),
    applyMemoryV2ResponseGroundingGuardrail: ({ responseContent }: any) => responseContent,
    applyNonDurableMemoryPromiseGuard: ({ responseContent }: any) => responseContent,
    applyWeeklyForgottenProgressAckGuard: ({ responseContent }: any) => responseContent,
    applyWeeklyRepeatedClarificationGuard: ({ responseContent }: any) => responseContent,
    applyWeeklyConcreteOrganizationGuard: ({ responseContent }: any) => responseContent,
    applyWeeklyConclusionGuard: ({ responseContent }: any) => responseContent,
    applyCompactStartGuard: ({ responseContent }: any) => responseContent,
    applyIncompleteRecapGuard: ({ responseContent }: any) => responseContent,
    applyUnexecutedEffectClaimGuard: ({ responseContent }: any) => responseContent,
    applyCoachResponseStylePreferences: ({ responseContent }: any) => responseContent,
    userRequestsShortStyle: () => false,
    normalizeRouteText: (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
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
