import data from "./relation_cardinality.v1.json" with { type: "json" };
import type { RelationCardinality } from "./types.v1.ts";

export interface RelationCardinalityRegistry {
  version: number;
  cardinality: Record<string, RelationCardinality>;
}

export const RELATION_CARDINALITY_V1_DATA = data as RelationCardinalityRegistry;
export const RELATION_CARDINALITY_V1_VERSION: number =
  RELATION_CARDINALITY_V1_DATA.version;
export const RELATION_CARDINALITY_V1: Readonly<
  Record<string, RelationCardinality>
> = RELATION_CARDINALITY_V1_DATA.cardinality;

export function getRelationCardinality(
  role: string,
): RelationCardinality | null {
  return RELATION_CARDINALITY_V1[role] ?? null;
}
