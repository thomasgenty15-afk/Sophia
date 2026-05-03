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
  /\b(peur|honte|angoisse|triste|colere|nul|nulle|incapable|mal|deteste|j'en peux plus|vide|humilie)\b/i;
const DIAGNOSTIC_RE =
  /\b(le user est|tu es|il est|elle est)\b.{0,40}\b(depressif|depressive|narcissique|bipolaire|trouble|malade|incapable|toxique)\b/i;
const SENSITIVE_RE =
  /\b(cannabis|alcool|drogue|suicide|me tuer|trauma|honte|rupture|famille|pere|mere|sexe|argent|dette|psy|therapie|humilie)\b/i;

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
  const issues: ValidationIssue[] = [];
  const content = String(item.content_text ?? "").trim();
  if (!content) {
    issues.push(issue("empty_content", "content_text is required", index));
  }
  if (!MEMORY_ITEM_KINDS.includes(item.kind)) {
    issues.push(issue("invalid_kind", `invalid kind: ${item.kind}`, index));
  }
  if (
    !Array.isArray(item.source_message_ids) ||
    item.source_message_ids.length === 0
  ) {
    issues.push(issue("no_source", "source_message_ids is required", index));
  }
  for (const id of item.source_message_ids ?? []) {
    if (!sourceMessageIds.has(id)) {
      issues.push(
        issue("source_not_found", `unknown source_message_id: ${id}`, index),
      );
    }
  }
  for (const key of item.domain_keys ?? []) {
    if (!DOMAIN_KEYS_V1.has(key)) {
      issues.push(
        issue("invalid_domain_key", `invalid domain_key: ${key}`, index),
      );
    }
  }
  if (item.kind === "event" && (!item.event_start_at || !item.time_precision)) {
    issues.push(
      issue(
        "event_missing_date",
        "event requires event_start_at and time_precision",
        index,
      ),
    );
  }
  if (item.kind === "fact" && SUBJECTIVE_RE.test(content)) {
    issues.push(
      issue("statement_as_fact", "subjective content cannot be fact", index),
    );
  }
  if (DIAGNOSTIC_RE.test(content)) {
    issues.push(
      issue("diagnostic_attempt", "diagnostic language is forbidden", index),
    );
  }
  if (Number(item.confidence ?? 0) < 0.55) {
    issues.push(issue("low_confidence", "confidence must be >= 0.55", index));
  }
  if (!SENSITIVITY_LEVELS.includes(item.sensitivity_level)) {
    issues.push(
      issue("missing_sensitive_tag", "invalid sensitivity_level", index),
    );
  }
  if (SENSITIVE_RE.test(content) && item.sensitivity_level === "normal") {
    issues.push(
      issue(
        "missing_sensitive_tag",
        "sensitive content must not be tagged normal",
        index,
      ),
    );
  }
  for (const cat of item.sensitivity_categories ?? []) {
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
      normalized_summary: item.normalized_summary || content.slice(0, 220),
      domain_keys: item.domain_keys ?? [],
      confidence: Math.max(0.55, Math.min(1, Number(item.confidence))),
      importance_score: Math.max(
        0,
        Math.min(1, Number(item.importance_score ?? 0)),
      ),
      sensitivity_categories: item.sensitivity_categories ?? [],
      requires_user_initiated: Boolean(item.requires_user_initiated),
      source_message_ids: item.source_message_ids,
      entity_mentions: item.entity_mentions ?? [],
      metadata: item.metadata ?? {},
      canonical_key: generateCanonicalKey(item),
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
