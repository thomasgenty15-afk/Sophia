import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { inferOperationFromSource } from "./llm-usage.ts";

Deno.test("inferOperationFromSource maps known families", () => {
  assertEquals(inferOperationFromSource("sophia-brain:dispatcher-v2-contextual").operation_family, "dispatcher");
  assertEquals(inferOperationFromSource("sort-priorities").operation_family, "sort_priorities");
  assertEquals(inferOperationFromSource("summarize-context").operation_family, "summarize_context");
  assertEquals(inferOperationFromSource("ethical-text-validator").operation_family, "ethics_check");
  assertEquals(inferOperationFromSource("trigger-watcher-batch").operation_family, "watcher");
  assertEquals(inferOperationFromSource("generate-plan").operation_family, "plan_generation");
  assertEquals(inferOperationFromSource("topic_memory").operation_family, "memorizer");
  assertEquals(inferOperationFromSource("some-embedding-call").operation_family, "embedding");
});

Deno.test("inferOperationFromSource falls back to other", () => {
  assertEquals(inferOperationFromSource("custom-unknown-source").operation_family, "other");
  assertEquals(inferOperationFromSource("").operation_family, "other");
});
