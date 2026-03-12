import { describe, expect, it } from "vitest";
import {
  QUOTE_LIMITS,
  buildQuotePayload,
  mapQuoteRowToItem,
  normalizeQuoteTags,
  sortQuotesByRecency,
  validateQuoteForm,
} from "./quotesUtils";

describe("architect quotes utils", () => {
  it("normalizes tags by trimming and removing duplicates case-insensitively", () => {
    expect(normalizeQuoteTags(" Leadership, focus,leadership,  deep work  , , Focus ")).toEqual([
      "Leadership",
      "focus",
      "deep work",
    ]);
  });

  it("builds a payload compatible with DB constraints", () => {
    expect(buildQuotePayload({
      text: "  Entre le stimulus et la réponse...  ",
      author: "  Viktor Frankl ",
      context: "   Découvert dans un livre  ",
      tagsInput: " liberté, mindset, liberté ",
    })).toEqual({
      quote_text: "Entre le stimulus et la réponse...",
      author: "Viktor Frankl",
      source_context: "Découvert dans un livre",
      tags: ["liberté", "mindset"],
    });
  });

  it("rejects values outside the supported limits", () => {
    expect(validateQuoteForm({
      text: "x".repeat(QUOTE_LIMITS.text + 1),
      author: "",
      context: "",
      tagsInput: "",
    })).toContain(String(QUOTE_LIMITS.text));

    expect(validateQuoteForm({
      text: "ok",
      author: "",
      context: "",
      tagsInput: new Array(QUOTE_LIMITS.tags + 1).fill("tag").map((tag, index) => `${tag}-${index}`).join(","),
    })).toContain(String(QUOTE_LIMITS.tags));
  });

  it("maps DB rows and sorts by the latest update first", () => {
    const older = mapQuoteRowToItem({
      id: "1",
      quote_text: "A",
      author: null,
      source_context: null,
      tags: null,
      created_at: "2026-03-12T10:00:00.000Z",
      updated_at: "2026-03-12T10:00:00.000Z",
    });
    const newer = mapQuoteRowToItem({
      id: "2",
      quote_text: "B",
      author: "Auteur",
      source_context: "Livre",
      tags: ["Mindset"],
      created_at: "2026-03-12T11:00:00.000Z",
      updated_at: "2026-03-12T12:00:00.000Z",
    });

    expect(sortQuotesByRecency([older, newer]).map((quote) => quote.id)).toEqual(["2", "1"]);
  });
});
