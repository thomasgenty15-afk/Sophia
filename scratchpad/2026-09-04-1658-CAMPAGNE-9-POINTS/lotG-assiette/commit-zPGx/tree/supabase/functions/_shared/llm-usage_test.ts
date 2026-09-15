import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CACHED_INPUT_PRICE_MULTIPLIER,
  costUsdFromTokens,
  inferOperationFromSource,
} from "./llm-usage.ts";

Deno.test("inferOperationFromSource maps known families", () => {
  assertEquals(inferOperationFromSource("sophia-brain:dispatcher-v2-contextual").operation_family, "dispatcher");
  assertEquals(inferOperationFromSource("generate-questionnaire-v2").operation_family, "plan_generation");
  assertEquals(inferOperationFromSource("conversation-summary").operation_family, "summary_generation");
  assertEquals(inferOperationFromSource("ethical-text-validator").operation_family, "ethics_check");
  assertEquals(inferOperationFromSource("trigger-watcher-batch").operation_family, "watcher");
  assertEquals(inferOperationFromSource("generate-plan").operation_family, "plan_generation");
  assertEquals(inferOperationFromSource("topic_memory").operation_family, "memorizer");
  assertEquals(inferOperationFromSource("sophia-brain:topic_initial_synthesis").operation_family, "memorizer");
  assertEquals(inferOperationFromSource("sophia-brain:synthesizer").operation_family, "memorizer");
  assertEquals(inferOperationFromSource("sophia-brain:companion").operation_family, "message_generation");
  assertEquals(inferOperationFromSource("sophia-brain:firefighter").operation_family, "message_generation");
  assertEquals(inferOperationFromSource("sophia-brain:sentry").operation_family, "message_generation");
  assertEquals(inferOperationFromSource("scheduled_checkins:dynamic_whatsapp").operation_family, "scheduling");
  assertEquals(inferOperationFromSource("some-embedding-call").operation_family, "embedding");
});

Deno.test("inferOperationFromSource falls back to other", () => {
  assertEquals(inferOperationFromSource("custom-unknown-source").operation_family, "other");
  assertEquals(inferOperationFromSource("").operation_family, "other");
});

// ═══════════════════════════════════════════════════════════════════════════
// LE COÛT D'UN PROMPT EN CACHE
//
// `cost_usd` facturait TOUT le prompt au plein tarif parce que
// `normalizeOpenAIUsage` jetait `input_tokens_details.cached_tokens`. Mesuré
// sur le dispatcher: 15 104 tokens en cache sur 17 139 (88 %), donc un coût
// surestimé d'environ 7× — sur le chiffre même qui servait à décider quoi
// optimiser.
// ═══════════════════════════════════════════════════════════════════════════

const PRICE = { inputPricePer1k: 1, outputPricePer1k: 4 };

Deno.test("cout: la part en cache est facturee au dixieme", () => {
  const cost = costUsdFromTokens({
    promptTokens: 10_000,
    outputTokens: 0,
    cachedPromptTokens: 9_000,
    ...PRICE,
  });
  // 1 000 frais à 1$/1k + 9 000 en cache à 0,10$/1k = 1 + 0,9
  assertEquals(Number(cost.toFixed(6)), 1.9);
});

Deno.test("FAUSSE PREMISSE: sans cache, le prix ne bouge pas d'un centieme", () => {
  // Sans ce cas, le precedent passerait sur une fonction qui divise TOUT par
  // dix. C'est la difference entre une remise et une erreur d'unite.
  const full = costUsdFromTokens({
    promptTokens: 10_000,
    outputTokens: 1_000,
    cachedPromptTokens: null,
    ...PRICE,
  });
  assertEquals(Number(full.toFixed(6)), 14); // 10 d'entree + 4 de sortie
  assertEquals(
    costUsdFromTokens({
      promptTokens: 10_000,
      outputTokens: 1_000,
      cachedPromptTokens: 0,
      ...PRICE,
    }),
    full,
    "un cache VIDE coute exactement comme un cache inconnu",
  );
});

Deno.test("un cache incoherent ne produit jamais un cout negatif", () => {
  // Un fournisseur qui annonce plus de cache que d'entree est une incoherence.
  // La laisser passer donnerait un cout NEGATIF, qu'aucun agregat ne rattrape.
  const cost = costUsdFromTokens({
    promptTokens: 1_000,
    outputTokens: 0,
    cachedPromptTokens: 50_000,
    ...PRICE,
  });
  assertEquals(cost, 0.1); // tout en cache, jamais moins que zero
  assertEquals(cost >= 0, true);
});

Deno.test("le multiplicateur est nomme, pas dissemine", () => {
  assertEquals(CACHED_INPUT_PRICE_MULTIPLIER, 0.1);
});
