import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  boundaryMustNot,
  boundaryOwns,
  describeMemoryBoundaryForTrace,
  findArchitectureBoundary,
} from "./architecture_boundaries.ts";

Deno.test("dispatcher_is_memory_planner_not_loader", () => {
  assert(boundaryOwns("dispatcher", "TurnFrame"));
  assert(boundaryOwns("dispatcher", "memory_plan"));
  assert(boundaryMustNot("dispatcher", "load_memory"));
  assert(boundaryMustNot("dispatcher", "write_memory"));

  const trace = describeMemoryBoundaryForTrace();
  assertEquals((trace.dispatcher as any).owns, ["TurnFrame.memory_plan"]);
});

Deno.test("dispatcher_source_does_not_load_or_write_memory", async () => {
  const dispatcherText = await Deno.readTextFile(
    new URL("../dispatcher/dispatcher.v2.ts", import.meta.url),
  );
  assertEquals(dispatcherText.includes("../context/loader.ts"), false);
  assertEquals(dispatcherText.includes("loadContextForMode"), false);
  assertEquals(dispatcherText.includes("dispatchMemoryWriteCandidates"), false);
  assertEquals(dispatcherText.includes("recordCommittedEffect"), false);
});

Deno.test("routers_choose_owner_from_turnframe", () => {
  assert(boundaryOwns("router", "RouteDecision"));
  assert(boundaryOwns("router", "owner_selection_from_TurnFrame"));
  assert(boundaryMustNot("router", "parse_user_semantics"));
  assert(boundaryMustNot("router", "write_memory"));
});

Deno.test("skills_own_domain_progression", () => {
  assert(boundaryOwns("conversation_skill", "domain_intake"));
  assert(boundaryOwns("conversation_skill", "domain_reducer"));
  assert(boundaryOwns("conversation_skill", "domain_progression"));
  assert(boundaryOwns("tool_skill", "structured_intake"));
  assert(boundaryOwns("tool_skill", "operation_reducer"));
  assert(boundaryOwns("tool_skill", "domain_progression"));
  assert(boundaryOwns("conversation_skill", "memory_write_candidates"));
  assert(boundaryMustNot("conversation_skill", "write_memory_directly"));
  assert(boundaryMustNot("tool_skill", "write_memory_directly"));
});

Deno.test("executors_write_renderers_reply", () => {
  assert(boundaryOwns("executor", "durable_write"));
  assert(boundaryOwns("executor", "committed_effect"));
  assert(boundaryMustNot("executor", "render_user_response"));
  assert(boundaryOwns("renderer", "user_visible_response"));
  assert(boundaryOwns("renderer", "committed_effects_based_reply"));
  assert(boundaryMustNot("renderer", "write_database"));
});

Deno.test("ledger_proves_committed_effects", () => {
  assert(boundaryOwns("ledger", "committed_effect_proof"));
  assert(boundaryOwns("ledger", "blocked_effect_proof"));
  assert(boundaryOwns("final_guard", "uncommitted_claim_neutralization"));
  assert(boundaryMustNot("final_guard", "allow_uncommitted_claims"));
  assert(boundaryMustNot("ledger", "turn_requested_into_committed"));
});

Deno.test("all_declared_boundaries_are_findable", () => {
  const layers = [
    "dispatcher",
    "memory_planner",
    "context_loader",
    "router",
    "conversation_skill",
    "tool_skill",
    "executor",
    "memory_runtime",
    "ledger",
    "renderer",
    "final_guard",
  ] as const;
  for (const layer of layers) {
    const boundary = findArchitectureBoundary(layer);
    assertEquals(boundary.layer, layer);
    assert(boundary.owns.length > 0);
    assert(boundary.must_not.length > 0);
  }
});
