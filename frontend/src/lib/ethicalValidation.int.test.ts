import { describe, expect, it } from "vitest";
import { shouldValidateOnUpdate } from "./ethicalValidation";

describe("integration: shouldValidateOnUpdate()", () => {
  it("skips validation when normalized text is identical", () => {
    const previous = { title: "Boire de l'eau", description: "Le matin" };
    const next = { title: "  boire de l'eau ", description: "le   matin" };
    expect(shouldValidateOnUpdate(previous, next, ["title", "description"])).toBe(false);
  });

  it("validates when text changes", () => {
    const previous = { title: "Boire de l'eau", description: "Le matin" };
    const next = { title: "Boire de l'eau", description: "Le soir" };
    expect(shouldValidateOnUpdate(previous, next, ["title", "description"])).toBe(true);
  });
});

