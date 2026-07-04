import { generateWithGemini } from "../../gemini.ts";
import { DOMAIN_KEYS_V1_DEFINITIONS } from "../domain_keys.ts";
import { PROMPT_VERSIONS } from "../prompts/index.ts";
import { resolveTemporalReferences } from "../runtime/temporal_resolution.ts";
import type {
  ExtractedMemoryItem,
  ExtractionPayload,
  KnownEntity,
  KnownMemoryItem,
  KnownTopic,
  MemorizerMessage,
  PlanSignal,
  TemporalHint,
} from "./types.ts";
import {
  MEMORY_EXTRACTION_MODEL_DEFAULT,
  MEMORY_EXTRACTION_PROMPT_VERSION,
} from "./types.ts";

const EXTRACTION_PROMPT_V1 = `
Tu es un extracteur de souvenirs pour Sophia.
Retourne uniquement un JSON strict avec memory_items, entities, corrections et rejected_observations.
Contraintes: source_message_ids obligatoire, pas de diagnostic, pas d'emotion subjective en fact,
kind dans la liste fermee, domain_keys dans la taxonomie fournie, event_start_at obligatoire pour les events.
Sophia est l'assistant/l'application: ne remplace jamais "l'utilisateur" par "Sophia" dans content_text ou normalized_summary, sauf si le message dit explicitement que le nom de la personne est Sophia.
Schema obligatoire pour chaque memory_items[]:
{ "kind": "fact|statement|event|action_observation", "content_text": "...", "normalized_summary": "...", "domain_keys": [], "confidence": 0.75, "importance_score": 0.5, "sensitivity_level": "normal|sensitive|safety", "sensitivity_categories": [], "requires_user_initiated": false, "source_message_ids": ["message_id"], "evidence_quote": "..." }
N'utilise jamais kind="preference" ou kind="goal" : encode les preferences/boundaries/goals en kind="statement" avec metadata.statement_role.
Pour une action ponctuelle deja realisee avec une date claire ("hier", "dimanche soir", "aujourd'hui"), utilise kind="event" plutot que action_observation.
Un motif RECURRENT ou une fenetre de vulnerabilite ("le soir vers 19h je craque", "chaque dimanche", "souvent quand je suis seule") n'est PAS un event meme s'il contient une heure: c'est un kind="statement" (fait durable sur la personne), persistable sans date. Reserve kind="event" aux occurrences uniques datees.
ETATS PRODUIT — exclusion stricte: l'etat d'un objet Sophia (rappel cree/annule/modifie, carte creee, plan ajuste, preference reglee) n'est JAMAIS un memory_item, meme si la conversation en parle: la base de donnees est la seule source de verite de ces etats, et la conversation peut decrire une action qui a ECHOUE (ex: "annule-le" suivi d'un refus — memoriser "rappel annule" serait faux). Ajoute ces observations a rejected_observations. Seul le fait personnel sous-jacent est memorisable (ex: "prefere ne pas preparer son sac le soir"), jamais l'etat de l'objet produit.
Pour sensitivity_categories, utilise uniquement: addiction, mental_health, family, relationship, work, financial, health, sexuality, self_harm, shame, trauma, other_sensitive.
Si une correction contient la nouvelle verite correcte ("X est mon ex, pas ma soeur"), cree aussi un memory_item positif pour la nouvelle verite.
Corrections: si le user dit "oublie", "corrige", "en fait", "plutot", "pas X mais Y", "remplace l'ancien souvenir", ou une formulation equivalente visant une information deja connue, ajoute une entree corrections[].
Utilise operation_type="supersede" quand le message fournit une nouvelle verite de remplacement; utilise operation_type="invalidate" quand il faut seulement retirer l'ancienne information.
Dans corrections[].target_hint, cite les termes de l'ancien souvenir faux a retrouver, pas seulement la nouvelle verite.
Pour une correction d'action ("les pompes ne marchent pas apres petit-dejeuner, plutot avant la douche"), cree aussi un memory_item kind="action_observation" pour la nouvelle verite d'action, avec les bons source_message_ids.
`.trim();

export interface ExtractionContext {
  messages: MemorizerMessage[];
  context_messages?: MemorizerMessage[];
  active_topic?: KnownTopic | null;
  known_topics?: KnownTopic[];
  known_entities?: KnownEntity[];
  injected_memory_items?: KnownMemoryItem[];
  temporal_hints?: TemporalHint[];
  plan_signals?: PlanSignal[];
  timezone?: string | null;
}

export type ExtractionLlmProvider = (args: {
  system_prompt: string;
  user_payload: string;
  model_name: string;
  prompt_version: string;
}) => Promise<string>;

export function buildExtractionPrompt(ctx: ExtractionContext): {
  system_prompt: string;
  user_payload: string;
} {
  const temporal = ctx.temporal_hints?.length
    ? ctx.temporal_hints
    : ctx.messages.flatMap((message) =>
      resolveTemporalReferences(message.content, {
        timezone: ctx.timezone ?? "Europe/Paris",
      })
    );
  return {
    system_prompt: EXTRACTION_PROMPT_V1,
    user_payload: JSON.stringify({
      prompt_version: PROMPT_VERSIONS.extraction,
      messages: ctx.messages,
      context_messages: ctx.context_messages ?? [],
      active_topic: ctx.active_topic ?? null,
      known_topics: ctx.known_topics ?? [],
      known_entities: ctx.known_entities ?? [],
      injected_memory_items: ctx.injected_memory_items ?? [],
      temporal_resolutions: temporal,
      plan_signals: ctx.plan_signals ?? [],
      domain_keys_taxonomy: DOMAIN_KEYS_V1_DEFINITIONS,
    }),
  };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function normalizeItemKind(value: unknown): ExtractedMemoryItem["kind"] {
  const raw = String(value ?? "").trim().toLowerCase();
  if (
    raw === "preference" || raw === "goal" || raw === "boundary" ||
    raw === "habit_preference"
  ) return "statement";
  return raw as ExtractedMemoryItem["kind"];
}

function coerceConfidence(value: unknown): number {
  if (typeof value === "string") {
    const raw = value.trim().toLowerCase();
    if (raw === "high") return 0.82;
    if (raw === "medium") return 0.68;
    if (raw === "low") return 0.35;
  }
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSensitivityCategory(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.startsWith("addictions.") || raw === "cannabis" || raw === "alcool" || raw === "drogue") {
    return "addiction";
  }
  if (raw.startsWith("relations.") || raw === "couple") return "relationship";
  if (raw === "famille" || raw === "relations.famille") return "family";
  if (raw.startsWith("travail.")) return "work";
  if (raw.startsWith("sante.") || raw === "medical") return "health";
  if (raw.startsWith("psychologie.") || raw === "psy") return "mental_health";
  return raw;
}

export function parseExtractionJson(raw: string): ExtractionPayload {
  let parsed: any;
  try {
    parsed = JSON.parse(String(raw ?? "").trim());
  } catch (error) {
    throw new Error(
      `memory_v2_extraction_invalid_json:${(error as Error).message}`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("memory_v2_extraction_invalid_shape");
  }
  return {
    memory_items: asArray(parsed.memory_items).map((
      item: any,
    ): ExtractedMemoryItem => ({
      kind: normalizeItemKind(item.kind),
      content_text: firstText(
        item.content_text,
        item.text,
        item.memory,
        item.preference,
        item.statement,
        item.summary,
        item.normalized_summary,
      ),
      normalized_summary: firstText(
          item.normalized_summary,
          item.summary,
          item.content_text,
          item.text,
          item.preference,
          item.statement,
        ) === ""
        ? null
        : firstText(
          item.normalized_summary,
          item.summary,
          item.content_text,
          item.text,
          item.preference,
          item.statement,
        ),
      domain_keys: asArray(item.domain_keys).map(String),
      confidence: coerceConfidence(item.confidence),
      importance_score: Number(item.importance_score ?? 0),
      sensitivity_level:
        (item.sensitivity_level ?? "normal") as ExtractedMemoryItem[
          "sensitivity_level"
        ],
      sensitivity_categories: asArray(item.sensitivity_categories).map(
        normalizeSensitivityCategory,
      ).filter(Boolean) as ExtractedMemoryItem["sensitivity_categories"],
      requires_user_initiated: Boolean(item.requires_user_initiated),
      source_message_ids: asArray(item.source_message_ids).map(String),
      evidence_quote: item.evidence_quote == null
        ? null
        : String(item.evidence_quote),
      event_start_at: item.event_start_at == null
        ? null
        : String(item.event_start_at),
      event_end_at: item.event_end_at == null
        ? null
        : String(item.event_end_at),
      time_precision: item.time_precision == null
        ? null
        : String(item.time_precision),
      entity_mentions: asArray(item.entity_mentions).map(String),
      topic_hint: item.topic_hint == null ? null : String(item.topic_hint),
      canonical_key_hint: item.canonical_key_hint == null
        ? null
        : String(item.canonical_key_hint),
      metadata: item.metadata && typeof item.metadata === "object"
        ? item.metadata
        : {},
    })),
    entities: asArray(parsed.entities).map((entity: any) => ({
      entity_type: entity.entity_type ?? "other",
      display_name: String(entity.display_name ?? ""),
      aliases: asArray(entity.aliases).map(String),
      relation_to_user: entity.relation_to_user == null
        ? null
        : String(entity.relation_to_user),
      confidence: Number(entity.confidence ?? 0),
      metadata: entity.metadata && typeof entity.metadata === "object"
        ? entity.metadata
        : {},
    })),
    corrections: asArray(parsed.corrections).map((correction: any) => ({
      operation_type: correction.operation_type,
      target_hint: String(correction.target_hint ?? ""),
      reason: correction.reason == null ? null : String(correction.reason),
      source_message_ids: asArray(correction.source_message_ids).map(String),
    })),
    rejected_observations: asArray(parsed.rejected_observations).map((
      row: any,
    ) => ({
      reason: row.reason ?? "other",
      text: String(row.text ?? ""),
      existing_memory_item_id: row.existing_memory_item_id == null
        ? null
        : String(row.existing_memory_item_id),
      source_message_ids: asArray(row.source_message_ids).map(String),
      metadata: row.metadata && typeof row.metadata === "object"
        ? row.metadata
        : {},
    })),
  };
}

function enrichEventDatesFromSources(
  payload: ExtractionPayload,
  ctx: ExtractionContext,
): ExtractionPayload {
  const messagesById = new Map(ctx.messages.map((message) => [message.id, message]));
  const contextById = new Map(
    (ctx.context_messages ?? []).map((message) => [message.id, message]),
  );
  const hintsByMessage = new Map<string, TemporalHint[]>();
  const getHints = (id: string): TemporalHint[] => {
    if (hintsByMessage.has(id)) return hintsByMessage.get(id) ?? [];
    const message = messagesById.get(id) ?? contextById.get(id);
    const hints = message
      ? resolveTemporalReferences(message.content, {
        timezone: ctx.timezone ?? "Europe/Paris",
      })
      : [];
    hintsByMessage.set(id, hints);
    return hints;
  };
  const isCompletedTemporalObservation = (item: ExtractedMemoryItem): boolean =>
    item.kind === "action_observation" &&
    /\b(a|ai|annule|annulé|reporte|reporté|marche|marché|fait|teste|testé|clarifie|clarifié)\b/i
      .test(item.content_text);
  return {
    ...payload,
    memory_items: payload.memory_items.map((item) => {
      if (
        item.kind !== "event" &&
        !isCompletedTemporalObservation(item)
      ) {
        return item;
      }
      if (
        item.kind === "event" &&
        item.event_start_at &&
        item.time_precision
      ) {
        return item;
      }
      const hint = item.source_message_ids.flatMap(getHints)
        .sort((a, b) => b.confidence - a.confidence)[0];
      if (!hint) return item;
      const kind = item.kind === "action_observation" ? "event" : item.kind;
      return {
        ...item,
        kind,
        event_start_at: item.event_start_at ?? hint.resolved_start_at,
        event_end_at: item.event_end_at ?? hint.resolved_end_at,
        time_precision: item.time_precision ?? hint.precision,
        metadata: {
          ...(item.metadata ?? {}),
          ...(item.kind === "action_observation"
            ? {
              promoted_from_kind: "action_observation",
              promotion_reason: "temporal_completed_observation",
            }
            : {}),
          temporal_resolution_raw: hint.raw,
          temporal_resolution_confidence: hint.confidence,
          temporal_resolution_timezone: hint.timezone,
        },
      };
    }),
  };
}

export async function extractMemoryCandidates(
  ctx: ExtractionContext,
  opts: {
    llm_provider?: ExtractionLlmProvider;
    model_name?: string;
    request_id?: string | null;
    user_id?: string | null;
    force_real_ai?: boolean;
  } = {},
): Promise<ExtractionPayload> {
  const modelName = opts.model_name ?? MEMORY_EXTRACTION_MODEL_DEFAULT;
  const prompt = buildExtractionPrompt(ctx);
  const raw = opts.llm_provider
    ? await opts.llm_provider({
      ...prompt,
      model_name: modelName,
      prompt_version: MEMORY_EXTRACTION_PROMPT_VERSION,
    })
    : await generateWithGemini(
      prompt.system_prompt,
      prompt.user_payload,
      0.1,
      true,
      [],
      "json",
      {
        requestId: opts.request_id ?? undefined,
        model: modelName,
        source: "memory-v2:memorizer_extraction",
        userId: opts.user_id ?? undefined,
        forceRealAi: opts.force_real_ai,
        forceInitialModel: true,
      },
    );
  const parsed = parseExtractionJson(String(raw));
  return enrichEventDatesFromSources(parsed, ctx);
}
