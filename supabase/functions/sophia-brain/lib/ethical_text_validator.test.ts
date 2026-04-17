import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { buildEthicalValidationSystemPrompt, shouldValidateOnUpdate } from "./ethical_text_validator.ts";

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

Deno.test("buildEthicalValidationSystemPrompt softens rendez_vous validation on light doubt", () => {
  const prompt = buildEthicalValidationSystemPrompt("rendez_vous");
  assertStringIncludes(prompt, "En cas de doute léger ou ambigu, autorise.");
  assertStringIncludes(prompt, "Ne bloque PAS pour de simples maladresses de style");
});

Deno.test("buildEthicalValidationSystemPrompt keeps strict doubt blocking for non rendez_vous entities", () => {
  const prompt = buildEthicalValidationSystemPrompt("action");
  assertStringIncludes(prompt, "Si doute éthique: bloque.");
});
