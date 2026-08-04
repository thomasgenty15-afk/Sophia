import { getRelationCardinality } from "../relation_cardinality.ts";
import type {
  EntityResolutionDecision,
  ExtractedEntity,
  KnownEntity,
} from "./types.ts";
import {
  cosineSimilarity,
  lexicalSimilarity,
  normalizeText,
  uniqueStrings,
} from "./utils.ts";

const RELATION_ALIASES: Record<string, string> = {
  "pere": "father",
  "papa": "father",
  "mon pere": "father",
  "mere": "mother",
  "maman": "mother",
  "ma mere": "mother",
  "soeur": "sister",
  "ma soeur": "sister",
  "frere": "brother",
  "mon frere": "brother",
  "ex": "ex_partner",
  "mon ex": "ex_partner",
  "manager": "manager",
  "mon manager": "manager",
};

const COMMON_NOISE = new Set([
  "boulangerie",
  "cafe",
  "lit",
  "metro",
  "telephone",
  "voiture",
  "pluie",
]);

export function normalizeEntityMention(input: string): string {
  const normalized = normalizeText(input)
    .replace(/^(mon|ma|mes|le|la|les|un|une)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized;
}

export function inferRelationToUser(entity: ExtractedEntity): string | null {
  const values = [
    entity.relation_to_user,
    entity.display_name,
    ...(entity.aliases ?? []),
  ].map((v) => normalizeText(String(v ?? "")));
  for (const value of values) {
    if (RELATION_ALIASES[value]) return RELATION_ALIASES[value];
  }
  return entity.relation_to_user ?? null;
}

function aliasesFor(entity: ExtractedEntity | KnownEntity): string[] {
  return uniqueStrings([
    entity.display_name,
    ...(entity.aliases ?? []),
  ]);
}

function hasExactAlias(entity: ExtractedEntity, known: KnownEntity): boolean {
  const extracted = new Set(aliasesFor(entity).map(normalizeText));
  return aliasesFor(known).some((alias) => extracted.has(normalizeText(alias)));
}

function isNoiseEntity(entity: ExtractedEntity, opts?: {
  mention_counts?: Record<string, number>;
  topic_counts?: Record<string, number>;
}): boolean {
  if (entity.entity_type === "person") return false;
  const relation = inferRelationToUser(entity);
  if (relation) return false;
  const key = normalizeEntityMention(entity.display_name);
  if (!COMMON_NOISE.has(key)) return false;
  const mentions = opts?.mention_counts?.[key] ?? 0;
  const topics = opts?.topic_counts?.[key] ?? 0;
  return mentions < 3 || topics < 2;
}

export function resolveEntity(
  entity: ExtractedEntity,
  knownEntities: KnownEntity[],
  opts?: {
    mention_counts?: Record<string, number>;
    topic_counts?: Record<string, number>;
    embedding?: number[] | null;
  },
): EntityResolutionDecision {
  const relation = inferRelationToUser(entity);
  const normalizedKey = normalizeEntityMention(entity.display_name);
  const aliases = uniqueStrings([
    entity.display_name,
    ...(entity.aliases ?? []),
    relation ?? "",
  ]);

  if (isNoiseEntity(entity, opts)) {
    return {
      extracted: entity,
      decision: "reject_noise",
      normalized_key: normalizedKey,
      aliases,
      reason: "common_noun_noise",
    };
  }

  const exact = knownEntities.find((known) => hasExactAlias(entity, known));
  if (exact) {
    return {
      extracted: entity,
      decision: "reuse",
      entity_id: exact.id,
      normalized_key: normalizedKey,
      aliases,
      reason: "exact_alias_match",
    };
  }

  const cardinality = relation ? getRelationCardinality(relation) : null;
  const sameRelation = knownEntities.filter((known) =>
    known.relation_to_user === relation && known.status !== "archived"
  );
  if (
    relation && cardinality === "usually_single" && sameRelation.length === 1
  ) {
    return {
      extracted: entity,
      decision: "reuse",
      entity_id: sameRelation[0].id,
      normalized_key: normalizedKey,
      aliases,
      reason: "usually_single_relation_match",
    };
  }
  if (relation && cardinality === "multiple" && sameRelation.length > 0) {
    let best = { id: "", score: 0 };
    for (const known of sameRelation) {
      const score = Math.max(
        lexicalSimilarity(aliases.join(" "), aliasesFor(known).join(" ")),
        cosineSimilarity(opts?.embedding, known.embedding) || 0,
      );
      if (score > best.score) best = { id: known.id, score };
    }
    if (best.score >= 0.85) {
      return {
        extracted: entity,
        decision: "reuse",
        entity_id: best.id,
        normalized_key: normalizedKey,
        aliases,
        reason: "multiple_relation_high_similarity",
      };
    }
    if (best.score >= 0.65) {
      return {
        extracted: entity,
        decision: "llm_judge_needed",
        normalized_key: normalizedKey,
        aliases,
        reason: "multiple_relation_grey_zone",
      };
    }
  }
  if (relation && cardinality === "time_scoped" && sameRelation.length === 1) {
    return {
      extracted: entity,
      decision: "reuse",
      entity_id: sameRelation[0].id,
      normalized_key: normalizedKey,
      aliases,
      reason: "time_scoped_current_active_match",
    };
  }

  return {
    extracted: entity,
    decision: "create_candidate",
    normalized_key: normalizedKey,
    aliases,
    reason: "no_existing_entity_match",
  };
}

export function resolveEntities(
  entities: ExtractedEntity[],
  knownEntities: KnownEntity[],
): EntityResolutionDecision[] {
  return entities.map((entity) => resolveEntity(entity, knownEntities));
}
