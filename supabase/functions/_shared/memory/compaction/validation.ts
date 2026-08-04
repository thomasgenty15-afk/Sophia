import { normalizeSensitivityLevel } from "./sensitivity.ts";
import type {
  TopicCompactionMemoryItem,
  TopicCompactionOutput,
  TopicCompactionValidationIssue,
  TopicCompactionValidationResult,
} from "./types.ts";

function normalize(input: string): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(input: string): Set<string> {
  return new Set(normalize(input).split(/\s+/).filter((t) => t.length > 2));
}

function overlapScore(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap++;
  return overlap / Math.max(left.size, right.size);
}

function sentences(input: string): string[] {
  return String(input ?? "")
    .split(/[.!?]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((v) => String(v ?? "").trim()).filter(Boolean)
    : [];
}

export function parseTopicCompactionOutput(raw: string): TopicCompactionOutput {
  let parsed: any;
  try {
    parsed = JSON.parse(String(raw ?? "").replace(/```json|```/g, "").trim());
  } catch {
    throw new Error("memory_v2_compaction_invalid_json");
  }
  return {
    search_doc: String(parsed?.search_doc ?? "").trim(),
    claims: Array.isArray(parsed?.claims)
      ? parsed.claims.map((claim: any) => ({
        claim: String(claim?.claim ?? "").trim(),
        supporting_item_ids: asStringArray(claim?.supporting_item_ids),
        sensitivity_level: normalizeSensitivityLevel(claim?.sensitivity_level),
      })).filter((claim: any) => claim.claim)
      : [],
    supporting_item_ids: asStringArray(parsed?.supporting_item_ids),
    sensitivity_max: normalizeSensitivityLevel(parsed?.sensitivity_max),
    warnings: asStringArray(parsed?.warnings),
  };
}

export function validateTopicCompactionOutput(args: {
  output: TopicCompactionOutput;
  items: TopicCompactionMemoryItem[];
  expected_sensitivity_max: string;
}): TopicCompactionValidationResult {
  const issues: TopicCompactionValidationIssue[] = [];
  const activeItems = args.items.filter((item) => item.status === "active");
  const activeById = new Map(activeItems.map((item) => [item.id, item]));

  if (!args.output.search_doc.trim()) {
    issues.push({
      code: "empty_output",
      message: "Compaction output must include search_doc.",
    });
  }

  for (const claim of args.output.claims) {
    if (claim.supporting_item_ids.length === 0) {
      issues.push({
        code: "missing_claim_support",
        message: `Claim has no supporting ids: ${claim.claim.slice(0, 80)}`,
      });
    }
    for (const id of claim.supporting_item_ids) {
      if (!activeById.has(id)) {
        issues.push({
          code: "invalid_supporting_item_id",
          message: `Claim references inactive or unknown item: ${id}`,
          item_id: id,
        });
      }
    }
  }

  for (const id of args.output.supporting_item_ids) {
    if (!activeById.has(id)) {
      issues.push({
        code: "invalid_supporting_item_id",
        message: `Output references inactive or unknown item: ${id}`,
        item_id: id,
      });
    }
  }

  if (
    normalizeSensitivityLevel(args.output.sensitivity_max) !==
      normalizeSensitivityLevel(args.expected_sensitivity_max)
  ) {
    issues.push({
      code: "invalid_sensitivity_max",
      message:
        `Expected sensitivity_max=${args.expected_sensitivity_max}, got ${args.output.sensitivity_max}.`,
    });
  }

  const allClaimText = args.output.claims.map((claim) => claim.claim).join(
    " ",
  );
  for (const sentence of sentences(args.output.search_doc)) {
    const normalizedSentence = normalize(sentence);
    if (!/^le user\b/.test(normalizedSentence)) continue;
    if (overlapScore(sentence, allClaimText) < 0.22) {
      issues.push({
        code: "unsupported_synthesis_claim",
        message: `Search doc sentence is not covered by claims: ${
          sentence.slice(0, 120)
        }`,
      });
    }
  }

  const surfaces = args.output.search_doc;
  for (const item of activeItems) {
    if (
      item.sensitivity_level !== "sensitive" &&
      item.sensitivity_level !== "safety"
    ) continue;
    const text = normalize(item.normalized_summary || item.content_text);
    if (text.length < 24) continue;
    if (normalize(surfaces).includes(text)) {
      issues.push({
        code: "sensitive_literal_quote",
        message: `Sensitive item is quoted literally: ${item.id}`,
        item_id: item.id,
      });
    }
  }

  const unsupportedClaimCount =
    issues.filter((issue) =>
      issue.code === "unsupported_synthesis_claim" ||
      issue.code === "invalid_supporting_item_id" ||
      issue.code === "missing_claim_support"
    ).length;
  return {
    ok: issues.length === 0,
    issues,
    unsupported_claim_count: unsupportedClaimCount,
  };
}
