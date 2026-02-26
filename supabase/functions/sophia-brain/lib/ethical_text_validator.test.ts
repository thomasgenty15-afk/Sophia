import { assertEquals } from "jsr:@std/assert";
import { shouldValidateOnUpdate } from "./ethical_text_validator.ts";

Deno.test("shouldValidateOnUpdate returns false when text fields are unchanged", () => {
  const previous = { title: "Respirer", description: "5 minutes" };
  const next = { title: "  respirer ", description: "5   minutes" };
  assertEquals(shouldValidateOnUpdate(previous, next, ["title", "description"]), false);
});

Deno.test("shouldValidateOnUpdate returns true when one text field changes", () => {
  const previous = { title: "Respirer", description: "5 minutes" };
  const next = { title: "Respirer", description: "10 minutes" };
  assertEquals(shouldValidateOnUpdate(previous, next, ["title", "description"]), true);
});

