import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  clearPendingCorrectionTargetV2,
  PENDING_CORRECTION_TARGET_V2_KEY,
  prepareAmbiguousCorrectionConfirmation,
  readPendingCorrectionTargetV2,
} from "./confirmation_state.ts";

Deno.test("ambiguous correction writes pending confirmation and blocks mutation", () => {
  const result = prepareAmbiguousCorrectionConfirmation({
    temp_memory: { kept: true },
    user_message: "corrige ca",
    now_iso: "2026-05-01T00:00:00.000Z",
    resolution: {
      target_item_id: null,
      confidence: 0.62,
      reason: "semantic_similarity",
      needs_confirmation: true,
      confirmation_prompt: "Tu veux que je corrige ce souvenir ?",
      candidates: [{
        item_id: "i1",
        score: 0.62,
        reason: "semantic_similarity",
      }],
    },
  });

  assertEquals(result.mutation_allowed, false);
  assertEquals(
    result.assistant_message,
    "Tu veux que je corrige ce souvenir ?",
  );
  assertEquals(result.temp_memory.kept, true);

  const pending = readPendingCorrectionTargetV2(result.temp_memory);
  assertEquals(pending?.status, "awaiting_confirmation");
  assertEquals(pending?.confidence, 0.62);
  assertEquals(pending?.candidates[0].item_id, "i1");
});

Deno.test("clear pending correction target removes temp memory key", () => {
  const next = clearPendingCorrectionTargetV2({
    [PENDING_CORRECTION_TARGET_V2_KEY]: {
      version: 2,
      status: "awaiting_confirmation",
      confirmation_prompt: "Confirmer ?",
    },
    kept: true,
  });
  assertEquals(next[PENDING_CORRECTION_TARGET_V2_KEY], undefined);
  assertEquals(next.kept, true);
});

Deno.test("clear correction target allows clear resolution to mutate", () => {
  const result = prepareAmbiguousCorrectionConfirmation({
    temp_memory: {},
    user_message: "Non, Tania c'est mon ex.",
    resolution: {
      target_item_id: "i1",
      confidence: 0.82,
      reason: "explicit_entity_match",
      needs_confirmation: false,
      candidates: [{
        item_id: "i1",
        score: 0.82,
        reason: "explicit_entity_match",
      }],
    },
  });
  assertEquals(result.mutation_allowed, true);
  assertEquals(result.assistant_message, null);
});
