/**
 * KEEL — commitment_relations vocabulary (P1).
 *
 * !! CONTRACT NON-INPUT #1 (docs/keel/CONTRACT.md) !!
 * `commitment_relations` — co-ingestion / separation / cofactor / antagonist
 * relations are RENDER GUIDANCE and SAFETY ALERTS only. Authorized readers:
 * the render layer and the safety layer, EXCLUSIVELY. The evaluator must
 * never import this module — no practitioner grades "taken 90 min apart
 * instead of 120" as missed. A test asserts evaluator results are identical
 * with and without relation rows, and that the evaluator module does not
 * import this file. That is why this vocabulary lives in its own module,
 * deliberately separate from tokens.ts.
 */

export const RELATION_KIND = [
  "co_ingest",
  "separate_by_minutes",
  "requires_cofactor",
  "antagonist",
] as const;
export type RelationKind = (typeof RELATION_KIND)[number];

const RELATION_KIND_SET: ReadonlySet<string> = new Set(RELATION_KIND);

/** Fail-loud parser (R7): throws on unknown input, never a silent fallback. */
export function parseRelationKind(value: unknown): RelationKind {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (RELATION_KIND_SET.has(normalized)) return normalized as RelationKind;
  throw new Error(
    `[keel/relations] Unknown relation_kind token: ${JSON.stringify(value)}. ` +
      `Expected one of: ${RELATION_KIND.join(", ")}`,
  );
}
