import type { ExtractionPayload, MemorizerMessage } from "./types.ts";
import { resolveTemporalReferences } from "../runtime/temporal_resolution.ts";
import { normalizeText } from "./utils.ts";

function itemFor(message: MemorizerMessage, timezone = "Europe/Paris") {
  const text = message.content;
  const n = normalizeText(text);
  const temporal = resolveTemporalReferences(text, { timezone })[0] ?? null;
  const source = [message.id];
  const base = {
    confidence: 0.82,
    importance_score: 0.68,
    source_message_ids: source,
    evidence_quote: text,
    event_start_at: temporal?.resolved_start_at ?? null,
    event_end_at: temporal?.resolved_end_at ?? null,
    time_precision: temporal?.precision ?? null,
    entity_mentions: [] as string[],
    topic_hint: null as string | null,
    canonical_key_hint: null as string | null,
    metadata: {},
  };
  if (/cannabis|fumaient|arret cannabis/.test(n)) {
    return {
      ...base,
      kind: temporal ? "event" : "statement",
      content_text: text,
      normalized_summary: text,
      domain_keys: ["addictions.cannabis"],
      sensitivity_level: "sensitive",
      sensitivity_categories: ["addiction"],
      topic_hint: "arret cannabis",
    };
  }
  if (/dormi|sommeil|vide/.test(n)) {
    return {
      ...base,
      kind: temporal ? "event" : "statement",
      content_text: text,
      normalized_summary: text,
      domain_keys: [/vide/.test(n) ? "sante.energie" : "sante.sommeil"],
      sensitivity_level: "normal",
      sensitivity_categories: [],
      topic_hint: "sommeil energie",
    };
  }
  if (/marche|pas fait|decalee|decale/.test(n)) {
    return {
      ...base,
      kind: "action_observation",
      content_text: text,
      normalized_summary: text,
      domain_keys: [
        /decale/.test(n)
          ? "habitudes.reprise_apres_echec"
          : "habitudes.execution",
      ],
      sensitivity_level: "normal",
      sensitivity_categories: [],
      topic_hint: "marche soir",
      metadata: { observation_role: "single" },
    };
  }
  if (/sens nul|tout gacher|rate une action/.test(n)) {
    return {
      ...base,
      kind: "statement",
      content_text: text,
      normalized_summary: text,
      domain_keys: [
        /rate une action/.test(n)
          ? "psychologie.peur_echec"
          : "psychologie.estime_de_soi",
      ],
      sensitivity_level: "sensitive",
      sensitivity_categories: ["mental_health", "shame"],
      requires_user_initiated: /sens nul/.test(n),
    };
  }
  if (/pere|papa/.test(n)) {
    return {
      ...base,
      kind: temporal ? "event" : "statement",
      content_text: text,
      normalized_summary: text,
      domain_keys: ["relations.famille"],
      sensitivity_level: "sensitive",
      sensitivity_categories: ["family"],
      entity_mentions: [/papa/.test(n) ? "papa" : "mon pere"],
    };
  }
  return null;
}

export function heuristicExtractionFromMessages(args: {
  messages: MemorizerMessage[];
  timezone?: string | null;
}): ExtractionPayload {
  const items = args.messages
    .map((message) => itemFor(message, args.timezone ?? "Europe/Paris"))
    .filter(Boolean) as ExtractionPayload["memory_items"];
  const entities: ExtractionPayload["entities"] = [];
  if (
    args.messages.some((message) =>
      /pere|papa/i.test(normalizeText(message.content))
    )
  ) {
    entities.push({
      entity_type: "person",
      display_name: "pere",
      aliases: ["mon pere", "papa"],
      relation_to_user: "father",
      confidence: 0.82,
    });
  }
  return {
    memory_items: items,
    entities,
    corrections: [],
    rejected_observations: [],
  };
}

export function heuristicExtractionProvider(rawPayload: string): string {
  const parsed = JSON.parse(rawPayload);
  return JSON.stringify(heuristicExtractionFromMessages({
    messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    timezone: "Europe/Paris",
  }));
}
