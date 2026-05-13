import { DOMAIN_KEYS_V1 } from "../domain_keys.ts";
import {
  ENTITY_TYPES,
  MEMORY_ITEM_KINDS,
  SENSITIVITY_CATEGORIES,
  SENSITIVITY_LEVELS,
} from "../types.v1.ts";
import type {
  ExtractedEntity,
  ExtractedMemoryItem,
  ExtractionPayload,
  RejectedObservation,
  ValidatedMemoryItem,
  ValidationIssue,
  ValidationResult,
} from "./types.ts";
import { normalizeText } from "./utils.ts";

const SUBJECTIVE_RE =
  /\b(peur|honte|angoisse|triste|colere|nul|nulle|incapable|mal|deteste|j en peux plus|vide|humilie|humiliation|faiblesse|doute)\b/i;
const SUBJECTIVE_FACT_RE =
  /\b(se sent|sentiment|ressent|eprouve|a peur|j ai peur|craint|impression|dort mal|dors mal|sommeil degrade|active des doutes|provoque\b.{0,30}\bsentiment|met\b.{0,30}\bpression)\b/i;
const DIAGNOSTIC_RE =
  /\b(le user est|tu es|il est|elle est)\b.{0,40}\b(depressif|depressive|narcissique|bipolaire|trouble|malade|incapable|toxique)\b/i;
const SENSITIVE_RE =
  /\b(cannabis|alcool|drogue|suicide|me tuer|trauma|honte|rupture|famille|pere|mere|sexe|argent|dette|budget|depense|depenses|facture|euro|euros|psy|therapie|humilie)\b/i;
const SENSITIVE_CATEGORIES_REQUIRING_TAG = new Set([
  "addiction",
  "mental_health",
  "family",
  "relationship",
  "work",
  "financial",
  "health",
  "sexuality",
  "self_harm",
  "shame",
  "trauma",
  "other_sensitive",
]);

function issue(
  code: ValidationIssue["code"],
  message: string,
  itemIndex?: number,
): ValidationIssue {
  return { code, message, item_index: itemIndex };
}

export function generateCanonicalKey(
  item: Pick<
    ExtractedMemoryItem,
    | "kind"
    | "domain_keys"
    | "normalized_summary"
    | "content_text"
    | "canonical_key_hint"
    | "entity_mentions"
  >,
): string {
  const hint = normalizeText(item.canonical_key_hint ?? "");
  if (hint && /^[a-z]+[a-z_]*\.[a-z0-9_.-]+$/.test(hint)) return hint;
  const domain = item.domain_keys?.[0] ?? "general.unknown";
  const summary = normalizeText(item.normalized_summary || item.content_text)
    .split(" ")
    .filter((t) => t.length > 2)
    .slice(0, 8)
    .join("_");
  const entities = (item.entity_mentions ?? []).map(normalizeText).filter(
    Boolean,
  )
    .slice(0, 3).join("_");
  return [domain, item.kind, entities, summary].filter(Boolean).join(".");
}

export function validateExtractedItem(
  item: ExtractedMemoryItem,
  sourceMessageIds: Set<string>,
  index = 0,
): { accepted?: ValidatedMemoryItem; issues: ValidationIssue[] } {
  const contentForDemotion = normalizeText(item.content_text ?? "");
  let normalizedItem: ExtractedMemoryItem = item.kind === "fact" &&
      SUBJECTIVE_FACT_RE.test(contentForDemotion)
    ? {
      ...item,
      kind: "statement",
      metadata: {
        ...(item.metadata ?? {}),
        demoted_from_kind: "fact",
        demotion_reason: "subjective_fact_language",
      },
    }
    : item;
  const issues: ValidationIssue[] = [];
  const content = String(normalizedItem.content_text ?? "").trim();
  const ruleContent = normalizeText(content);
  const shouldBeSensitive = SENSITIVE_RE.test(ruleContent) ||
    (normalizedItem.sensitivity_categories ?? []).some((category) =>
      SENSITIVE_CATEGORIES_REQUIRING_TAG.has(String(category))
    );
  if (shouldBeSensitive && normalizedItem.sensitivity_level === "normal") {
    normalizedItem = {
      ...normalizedItem,
      sensitivity_level: "sensitive",
      metadata: {
        ...(normalizedItem.metadata ?? {}),
        sensitivity_promoted_from: "normal",
        sensitivity_promotion_reason: "sensitive_content_or_category",
      },
    };
  }
  if (!content) {
    issues.push(issue("empty_content", "content_text is required", index));
  }
  if (!MEMORY_ITEM_KINDS.includes(normalizedItem.kind)) {
    issues.push(
      issue("invalid_kind", `invalid kind: ${normalizedItem.kind}`, index),
    );
  }
  if (
    !Array.isArray(normalizedItem.source_message_ids) ||
    normalizedItem.source_message_ids.length === 0
  ) {
    issues.push(issue("no_source", "source_message_ids is required", index));
  }
  for (const id of normalizedItem.source_message_ids ?? []) {
    if (!sourceMessageIds.has(id)) {
      issues.push(
        issue("source_not_found", `unknown source_message_id: ${id}`, index),
      );
    }
  }
  for (const key of normalizedItem.domain_keys ?? []) {
    if (!DOMAIN_KEYS_V1.has(key)) {
      issues.push(
        issue("invalid_domain_key", `invalid domain_key: ${key}`, index),
      );
    }
  }
  if (
    normalizedItem.kind === "event" &&
    (!normalizedItem.event_start_at || !normalizedItem.time_precision)
  ) {
    issues.push(
      issue(
        "event_missing_date",
        "event requires event_start_at and time_precision",
        index,
      ),
    );
  }
  if (
    normalizedItem.kind === "fact" &&
    SUBJECTIVE_RE.test(ruleContent)
  ) {
    issues.push(
      issue("statement_as_fact", "subjective content cannot be fact", index),
    );
  }
  if (DIAGNOSTIC_RE.test(ruleContent)) {
    issues.push(
      issue("diagnostic_attempt", "diagnostic language is forbidden", index),
    );
  }
  if (Number(normalizedItem.confidence ?? 0) < 0.55) {
    issues.push(issue("low_confidence", "confidence must be >= 0.55", index));
  }
  if (!SENSITIVITY_LEVELS.includes(normalizedItem.sensitivity_level)) {
    issues.push(
      issue("missing_sensitive_tag", "invalid sensitivity_level", index),
    );
  }
  for (const cat of normalizedItem.sensitivity_categories ?? []) {
    if (!SENSITIVITY_CATEGORIES.includes(cat)) {
      issues.push(
        issue(
          "missing_sensitive_tag",
          `invalid sensitivity category: ${cat}`,
          index,
        ),
      );
    }
  }
  if (content.length > 900) {
    issues.push(issue("other", "item content is too broad", index));
  }
  if (issues.length > 0) return { issues };
  return {
    accepted: {
      ...item,
      ...normalizedItem,
      normalized_summary: normalizedItem.normalized_summary ||
        content.slice(0, 220),
      domain_keys: normalizedItem.domain_keys ?? [],
      confidence: Math.max(0.55, Math.min(1, Number(normalizedItem.confidence))),
      importance_score: Math.max(
        0,
        Math.min(1, Number(normalizedItem.importance_score ?? 0)),
      ),
      sensitivity_categories: normalizedItem.sensitivity_categories ?? [],
      requires_user_initiated: Boolean(normalizedItem.requires_user_initiated),
      source_message_ids: normalizedItem.source_message_ids,
      entity_mentions: normalizedItem.entity_mentions ?? [],
      metadata: normalizedItem.metadata ?? {},
      canonical_key: generateCanonicalKey(normalizedItem),
    },
    issues: [],
  };
}

export function validateExtractedEntity(
  entity: ExtractedEntity,
  index = 0,
): { accepted?: ExtractedEntity; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  if (!String(entity.display_name ?? "").trim()) {
    issues.push({
      code: "empty_content",
      message: "display_name is required",
      entity_index: index,
    });
  }
  if (!ENTITY_TYPES.includes(entity.entity_type)) {
    issues.push({
      code: "invalid_kind",
      message: `invalid entity_type: ${entity.entity_type}`,
      entity_index: index,
    });
  }
  if (Number(entity.confidence ?? 0) < 0.55) {
    issues.push({
      code: "low_confidence",
      message: "entity confidence must be >= 0.55",
      entity_index: index,
    });
  }
  if (issues.length > 0) return { issues };
  return {
    accepted: {
      ...entity,
      display_name: String(entity.display_name).trim(),
      aliases: entity.aliases ?? [],
      confidence: Math.max(0.55, Math.min(1, Number(entity.confidence))),
      metadata: entity.metadata ?? {},
    },
    issues: [],
  };
}

export function validateExtractionPayload(
  payload: ExtractionPayload,
  sourceMessages: Array<{ id: string; user_id?: string }>,
): ValidationResult {
  const sourceIds = new Set(sourceMessages.map((m) => m.id));
  const acceptedItems: ValidatedMemoryItem[] = [];
  const rejectedItems: ValidationResult["rejected_items"] = [];
  let statementAsFact = 0;

  payload.memory_items.forEach((item, index) => {
    const result = validateExtractedItem(item, sourceIds, index);
    if (result.accepted) acceptedItems.push(result.accepted);
    else rejectedItems.push({ item, issues: result.issues });
    if (result.issues.some((i) => i.code === "statement_as_fact")) {
      statementAsFact++;
    }
  });

  const acceptedEntities: ExtractedEntity[] = [];
  const rejectedEntities: ValidationResult["rejected_entities"] = [];
  payload.entities.forEach((entity, index) => {
    const result = validateExtractedEntity(entity, index);
    if (result.accepted) acceptedEntities.push(result.accepted);
    else rejectedEntities.push({ entity, issues: result.issues });
  });

  const rejectedObservations: RejectedObservation[] = [
    ...payload.rejected_observations,
    ...rejectedItems.map((row) => ({
      reason: row.issues[0]?.code as RejectedObservation["reason"] ?? "other",
      text: row.item.content_text,
      source_message_ids: row.item.source_message_ids,
      metadata: { issues: row.issues },
    })),
  ];

  return {
    accepted_items: acceptedItems,
    rejected_items: rejectedItems,
    accepted_entities: acceptedEntities,
    rejected_entities: rejectedEntities,
    rejected_observations: rejectedObservations,
    statement_as_fact_violation_count: statementAsFact,
  };
}
