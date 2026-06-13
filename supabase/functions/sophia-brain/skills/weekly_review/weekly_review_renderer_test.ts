import {
  cleanWeeklyVisibleResponse,
  renderWeeklyResponseWithEffects,
} from "./renderer.ts";
import { assert, assertEquals } from "jsr:@std/assert@1";

Deno.test("renderer_does_not_strip_internal_labels_deterministically", () => {
  const rendered = cleanWeeklyVisibleResponse(
    "bridge_week item_decision operation level_review",
  );
  assertEquals(
    rendered,
    "bridge_week item_decision operation level_review",
  );
});

Deno.test("renderer_does_not_translate_strategy_labels", () => {
  assertEquals(cleanWeeklyVisibleResponse("bridge_week"), "bridge_week");
});

Deno.test("renderer_is_passive_and_does_not_construct_visible_corrections", () => {
  assertEquals(
    renderWeeklyResponseWithEffects({
      responseContent: "C'est appliqué.",
    }),
    "C'est appliqué.",
  );
});

Deno.test("renderer_does_not_remove_tool_suggestions_deterministically", () => {
  const rendered = cleanWeeklyVisibleResponse(
    "Je te programme ce rappel mercredi prochain à 18h pile.",
  );
  assert(rendered.includes("Je te programme"));
});
