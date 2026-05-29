import {
  cleanWeeklyVisibleResponse,
  renderWeeklyResponseWithEffects,
} from "./renderer.ts";
import { assert, assertEquals } from "jsr:@std/assert@1";

Deno.test("renderer_strips_internal_strategy_labels", () => {
  const rendered = cleanWeeklyVisibleResponse(
    "bridge_week plan_patch item_decision operation level_review",
  );
  assert(
    !/\bbridge_week\b|\bplan_patch\b|\bitem_decision\b|\blevel_review\b/.test(
      rendered,
    ),
  );
});

Deno.test("renderer_bridge_week_as_semaine_allegee", () => {
  assert(cleanWeeklyVisibleResponse("bridge_week").includes("semaine allegee"));
});

Deno.test("renderer_no_done_language_without_commit", () => {
  assertEquals(
    renderWeeklyResponseWithEffects({
      responseContent: "C'est appliqué.",
      committedEffects: [],
    }),
    "Rien n'est appliqué sans confirmation et effet confirmé.",
  );
});

Deno.test("renderer_no_tool_suggestion_during_opening", () => {
  const rendered = cleanWeeklyVisibleResponse(
    "Je te programme ce rappel mercredi prochain à 18h pile.",
  );
  assert(!rendered.includes("Je te programme"));
  assert(rendered.includes("après le bilan"));
});
