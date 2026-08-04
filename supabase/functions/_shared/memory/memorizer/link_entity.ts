import type {
  EntityLinkDecision,
  EntityResolutionDecision,
  ValidatedMemoryItem,
} from "./types.ts";
import { normalizeText } from "./utils.ts";

export function linkMemoryItemToEntities(args: {
  item: ValidatedMemoryItem;
  resolved_entities: EntityResolutionDecision[];
}): EntityLinkDecision[] {
  const mentions = new Set(
    (args.item.entity_mentions ?? []).map(normalizeText),
  );
  const links: EntityLinkDecision[] = [];
  for (const entity of args.resolved_entities) {
    if (entity.decision !== "reuse" && entity.decision !== "create_candidate") {
      continue;
    }
    const matchedAlias = entity.aliases.find((alias) =>
      mentions.has(normalizeText(alias))
    ) ?? entity.aliases.find((alias) =>
      normalizeText(args.item.content_text).includes(normalizeText(alias))
    );
    const mentionMatched = Boolean(matchedAlias);
    if (!mentionMatched && mentions.size > 0) continue;
    const entityId = entity.entity_id ?? `candidate:${entity.normalized_key}`;
    links.push({
      item: args.item,
      entity_id: entityId,
      relation_type: mentionMatched ? "about" : "mentions",
      confidence: mentionMatched ? 0.84 : 0.62,
      mention: matchedAlias ?? entity.aliases[0] ?? entity.normalized_key,
    });
  }
  return links;
}
