import type {
  MemoryItemKind,
  RetrievalHint,
  RetrievalMode,
  SensitivityLevel,
} from "../types.v1.ts";
import { DOMAIN_KEYS_V1 } from "../domain_keys.ts";
import type {
  MemoryV2LoaderPlan,
  MemoryV2LoaderScope,
} from "./dispatcher_plan_adapter.ts";
import { geminiGenerate } from "../../llm.ts";

declare const Deno: any;

export interface MemoryV2Item {
  id: string;
  user_id?: string;
  kind: MemoryItemKind;
  content_text: string;
  status: string;
  importance_score?: number | null;
  observed_at?: string | null;
  domain_keys?: string[] | null;
  sensitivity_level?: SensitivityLevel | null;
  topic_ids?: string[];
  search_doc?: string | null;
}

export interface MemoryV2Entity {
  id: string;
  user_id?: string;
  display_name: string;
  aliases?: string[] | null;
  status: string;
}

export interface MemoryV2Payload {
  retrieval_mode: RetrievalMode;
  hints: RetrievalHint[];
  topic_id: string | null;
  items: MemoryV2Item[];
  entities: MemoryV2Entity[];
  modules: Record<string, unknown>;
  metrics: {
    load_ms: number;
    sensitive_excluded_count: number;
    invalid_injection_simulated_count: number;
    fallback_used: boolean;
    cross_topic_cache_hit: boolean;
  };
}

export interface LoadMemoryV2PayloadInput {
  supabase: unknown;
  user_id: string;
  retrieval_mode: RetrievalMode;
  hints?: RetrievalHint[];
  active_topic_id?: string | null;
  message?: string;
  temporal_window?: {
    resolved_start_at: string;
    resolved_end_at: string;
  } | null;
  limit?: number;
  loader_plan?: MemoryV2LoaderPlan | null;
}

export function assertOnlyActiveMemoryItems(items: MemoryV2Item[]): void {
  const invalid = items.filter((item) => item.status !== "active");
  if (invalid.length > 0) {
    throw new Error(
      `memory_v2_loader_invalid_item_status:${
        invalid.map((i) => `${i.id}:${i.status}`).join(",")
      }`,
    );
  }
}

export function applySensitivityFilter(args: {
  items: MemoryV2Item[];
  retrieval_mode: RetrievalMode;
  active_topic_id?: string | null;
  requested_sensitive?: boolean;
}): { items: MemoryV2Item[]; excluded_count: number } {
  const out: MemoryV2Item[] = [];
  let excluded = 0;
  for (const item of args.items) {
    const level = item.sensitivity_level ?? "normal";
    const inActiveTopic = Boolean(
      args.active_topic_id && item.topic_ids?.includes(args.active_topic_id),
    );
    const allowed = level === "normal" ||
      (level === "sensitive" &&
        (inActiveTopic || args.requested_sensitive ||
          args.retrieval_mode === "safety_first")) ||
      (level === "safety" && args.retrieval_mode === "safety_first");
    if (allowed) out.push(item);
    else excluded++;
  }
  return { items: out, excluded_count: excluded };
}

function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const DOMAIN_KEYWORDS: Array<[string, RegExp]> = [
  [
    "psychologie.estime_de_soi",
    /\b(estime|valeur|nul|nulle|incapable|honte|confiance en moi)\b/,
  ],
  [
    "psychologie.discipline",
    /\b(discipline|tenir|constance|routine|regularite|rigueur)\b/,
  ],
  [
    "psychologie.controle_impulsions",
    /\b(impulsion|craque|pulsion|controle|resister|compulsif)\b/,
  ],
  [
    "psychologie.identite",
    /\b(identite|qui je suis|personne que je veux devenir|image de moi)\b/,
  ],
  [
    "psychologie.peur_echec",
    /\b(echec|rater|peur de rater|peur d'echouer|echouer)\b/,
  ],
  [
    "psychologie.emotions",
    /\b(psychologie|emotion|peur|colere|triste|angoisse|panique|anxiete|stress)\b/,
  ],
  [
    "psychologie.motivation",
    /\b(motivation|envie|elan|demotive|pourquoi je bloque|drive)\b/,
  ],
  [
    "relations.famille",
    /\b(famille|familial|familiale|familiales|pere|mere|frere|soeur|parents|maman|papa)\b/,
  ],
  [
    "relations.couple",
    /\b(rupture|couple|ex|relation amoureuse|amour|copine|copain)\b/,
  ],
  ["relations.amitie", /\b(ami|amie|amis|amities|pote|amis proches)\b/],
  [
    "relations.appartenance_sociale",
    /\b(appartenance|seul|solitude|groupe|social|integre|rejet)\b/,
  ],
  [
    "relations.conflit",
    /\b(conflit|dispute|humilie|reproche|tension|embrouille)\b/,
  ],
  [
    "relations.limites",
    /\b(limite|dire non|frontiere|respect|envahi|poser mes limites)\b/,
  ],
  ["addictions.cannabis", /\b(cannabis|joint|weed|beuh|fumer)\b/],
  ["addictions.alcool", /\b(alcool|boire|cuite|verre|bourre)\b/],
  [
    "addictions.ecrans",
    /\b(ecran|telephone|scroll|reseaux|tiktok|youtube|instagram)\b/,
  ],
  ["addictions.tabac", /\b(tabac|cigarette|clope|nicotine|vape)\b/],
  ["addictions.autre", /\b(addiction|craving|rechute|dependance|compulsion)\b/],
  ["sante.energie", /\b(energie|fatigue|epuise|forme|vitalite)\b/],
  ["sante.sommeil", /\b(dormir|dors|sommeil|insomnie|nuit|reveil)\b/],
  [
    "sante.alimentation",
    /\b(alimentation|manger|repas|sucre|nutrition|grignote)\b/,
  ],
  [
    "sante.activite_physique",
    /\b(sport|marche|courir|entrainement|muscu|activite physique)\b/,
  ],
  ["sante.douleur", /\b(douleur|mal au|migraine|dos|blessure)\b/],
  [
    "sante.medical",
    /\b(medical|medecin|traitement|diagnostic|hopital|therapie)\b/,
  ],
  [
    "travail.performance",
    /\b(performance|productivite|efficace|livrer|resultat)\b/,
  ],
  [
    "travail.conflits",
    /\b(travail|manager|reunion|collegue|humilie|chef|bureau|conflit pro)\b/,
  ],
  [
    "travail.sens",
    /\b(sens au travail|metier|mission|utile|carriere qui a du sens)\b/,
  ],
  [
    "travail.charge",
    /\b(charge|burnout|deadline|pression|deborde|surcharge)\b/,
  ],
  [
    "travail.carriere",
    /\b(carriere|poste|promotion|entretien|reconversion|job)\b/,
  ],
  [
    "habitudes.execution",
    /\b(execution|routine|habitude|fait|rate|manque|marche|passer a l'action)\b/,
  ],
  [
    "habitudes.environnement",
    /\b(environnement|cadre|bureau|appartement|setup|declencheur)\b/,
  ],
  [
    "habitudes.planification",
    /\b(planification|planning|agenda|organiser|prioriser|planifier)\b/,
  ],
  [
    "habitudes.procrastination",
    /\b(procrastin\w*|repousse|evite|retarde|remets a plus tard)\b/,
  ],
  [
    "habitudes.reprise_apres_echec",
    /\b(reprendre|rechute|apres echec|repartir|remonter|reset)\b/,
  ],
  [
    "objectifs.identite",
    /\b(objectif identite|devenir quelqu'un|type de personne|identite d'objectif)\b/,
  ],
  [
    "objectifs.long_terme",
    /\b(long terme|vision|north star|etoile polaire|objectif global)\b/,
  ],
  [
    "objectifs.court_terme",
    /\b(court terme|cette semaine|aujourd'hui|demain|prochaine etape)\b/,
  ],
  [
    "objectifs.transformation",
    /\b(transformation|changer ma vie|processus|objectif principal|probleme principal)\b/,
  ],
];

export function mapTextToDomainKeys(text: string): string[] {
  const normalized = normalize(text);
  const keys = DOMAIN_KEYWORDS
    .filter(([key, re]) => DOMAIN_KEYS_V1.has(key) && re.test(normalized))
    .map(([key]) => key);
  return [...new Set(keys)];
}

function envString(name: string, fallback = ""): string {
  try {
    const raw = String(Deno?.env?.get?.(name) ?? "").trim();
    return raw || fallback;
  } catch {
    return fallback;
  }
}

function parseDomainKeyJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    const values = Array.isArray(parsed?.domain_keys) ? parsed.domain_keys : [];
    return [
      ...new Set<string>(
        values
          .map((value: unknown) => String(value ?? "").trim())
          .filter((value: string) => DOMAIN_KEYS_V1.has(value)),
      ),
    ];
  } catch {
    return [];
  }
}

async function mapTextToDomainKeysWithFallback(
  text: string,
): Promise<string[]> {
  const regex = mapTextToDomainKeys(text);
  if (
    regex.length > 0 || normalize(text).split(/\W+/).filter(Boolean).length < 4
  ) {
    return regex;
  }
  try {
    const model = envString(
      "MEMORY_V2_DOMAIN_MAPPER_MODEL",
      "gemini-2.5-flash",
    );
    const out = await geminiGenerate({
      model,
      jsonMode: true,
      temperature: 0,
      systemPrompt:
        'Mappe la demande utilisateur vers les domain_keys V2. Retourne uniquement JSON: {"domain_keys":[...],"confidence":0-1}. N\'utilise que les cles connues.',
      userMessage: JSON.stringify({
        text,
        allowed_domain_keys: [...DOMAIN_KEYS_V1],
      }),
    });
    return typeof out === "string" ? parseDomainKeyJson(out) : [];
  } catch {
    return [];
  }
}

const CROSS_TOPIC_CACHE_TTL_MS = 60_000;
const CROSS_TOPIC_CACHE_MAX = 1000;
const crossTopicCache = new Map<
  string,
  { expires_at: number; items: MemoryV2Item[] }
>();

function crossTopicCacheKey(args: {
  user_id: string;
  domain_keys: string[];
  retrieval_mode: string;
}): string {
  return JSON.stringify({
    user_id: args.user_id,
    domain_keys: [...args.domain_keys].sort(),
    retrieval_mode: args.retrieval_mode,
  });
}

function readCrossTopicCache(key: string): MemoryV2Item[] | null {
  const found = crossTopicCache.get(key);
  if (!found) return null;
  if (found.expires_at < Date.now()) {
    crossTopicCache.delete(key);
    return null;
  }
  crossTopicCache.delete(key);
  crossTopicCache.set(key, found);
  return found.items;
}

function writeCrossTopicCache(key: string, items: MemoryV2Item[]): void {
  crossTopicCache.set(key, {
    expires_at: Date.now() + CROSS_TOPIC_CACHE_TTL_MS,
    items,
  });
  while (crossTopicCache.size > CROSS_TOPIC_CACHE_MAX) {
    const oldest = crossTopicCache.keys().next().value;
    if (!oldest) break;
    crossTopicCache.delete(oldest);
  }
}

function expandGlobalKeysToDomainKeys(keys: string[]): string[] {
  const out: string[] = [];
  for (const raw of keys) {
    const key = String(raw ?? "").trim();
    if (!key) continue;
    if (DOMAIN_KEYS_V1.has(key)) out.push(key);
    for (const domainKey of DOMAIN_KEYS_V1) {
      if (domainKey.startsWith(`${key}.`)) out.push(domainKey);
    }
  }
  return [...new Set(out)];
}

function overlapScore(a: string[] = [], b: string[] = []): number {
  if (!a.length || !b.length) return 0;
  const set = new Set(a);
  let overlap = 0;
  for (const value of b) if (set.has(value)) overlap++;
  return overlap / Math.max(a.length, b.length);
}

function semanticScore(message: string, item: MemoryV2Item): number {
  const left = new Set(
    normalize(message).split(/\W+/).filter((t) => t.length > 2),
  );
  const right = new Set(
    normalize(`${item.content_text} ${item.search_doc ?? ""}`).split(/\W+/)
      .filter((t) => t.length > 2),
  );
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap++;
  return overlap / (left.size + right.size - overlap);
}

export function mergeAndRerankCrossTopicItems(args: {
  message: string;
  domain_keys: string[];
  semantic_items: MemoryV2Item[];
  domain_items: MemoryV2Item[];
  topic_boost_ids?: string[];
  limit?: number;
}): MemoryV2Item[] {
  const byId = new Map<string, MemoryV2Item>();
  for (const item of [...args.domain_items, ...args.semantic_items]) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  const topicBoost = new Set(args.topic_boost_ids ?? []);
  return [...byId.values()]
    .map((item) => ({
      item,
      score: overlapScore(args.domain_keys, item.domain_keys ?? []) * 0.45 +
        semanticScore(args.message, item) * 0.4 +
        (topicBoost.size && item.topic_ids?.some((id) => topicBoost.has(id))
          ? 0.15
          : 0) +
        Math.min(0.1, Number(item.importance_score ?? 0) / 100),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, args.limit ?? 8))
    .map((entry) => entry.item);
}

async function runQuery<T>(query: unknown): Promise<T[]> {
  if (!query || typeof (query as any).then !== "function") return [];
  const { data, error } = await query as { data?: T[]; error?: unknown };
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function loadTopicItems(
  supabase: any,
  userId: string,
  topicId: string,
  limit: number,
): Promise<MemoryV2Item[]> {
  const rows = await runQuery<any>(
    supabase
      .from("memory_item_topics")
      .select("memory_items(*)")
      .eq("topic_id", topicId)
      .limit(limit),
  );
  return rows
    .map((row) => row.memory_items)
    .filter(Boolean)
    .filter((item) => String(item.user_id ?? "") === userId)
    .map((item) => ({ ...item, topic_ids: [topicId] }));
}

async function loadTopicEntities(
  supabase: any,
  userId: string,
  topicId: string,
  limit: number,
): Promise<MemoryV2Entity[]> {
  const rows = await runQuery<any>(
    supabase
      .from("memory_item_topics")
      .select("memory_item_entities(user_entities(*))")
      .eq("topic_id", topicId)
      .limit(limit * 3),
  );
  const byId = new Map<string, MemoryV2Entity>();
  for (const row of rows) {
    const links = Array.isArray(row.memory_item_entities)
      ? row.memory_item_entities
      : [];
    for (const link of links) {
      const entity = link.user_entities;
      if (
        entity?.id && entity.user_id === userId && entity.status === "active"
      ) {
        byId.set(entity.id, entity);
      }
    }
  }
  return [...byId.values()].slice(0, limit);
}

export async function loadMemoryV2Payload(
  input: LoadMemoryV2PayloadInput,
): Promise<MemoryV2Payload> {
  const started = Date.now();
  const supabase = input.supabase as any;
  const plan = input.loader_plan ?? null;
  const limit = Math.max(
    0,
    Math.min(12, input.limit ?? plan?.budget.max_items ?? 8),
  );
  const defaultScopes: MemoryV2LoaderScope[] = input.retrieval_mode ===
      "cross_topic_lookup"
    ? ["global"]
    : input.retrieval_mode === "safety_first"
    ? ["topic", "event"]
    : ["topic"];
  if (input.hints?.includes("dated_reference")) defaultScopes.push("event");
  if (input.hints?.includes("action_related")) defaultScopes.push("action");
  const scopes = new Set<MemoryV2LoaderScope>(
    plan ? plan.requested_scopes : defaultScopes,
  );
  let items: MemoryV2Item[] = [];
  let entities: MemoryV2Entity[] = [];
  let fallbackUsed = false;
  let crossTopicCacheHit = false;

  if (plan && !plan.enabled) {
    return {
      retrieval_mode: input.retrieval_mode,
      hints: input.hints ?? [],
      topic_id: input.active_topic_id ?? null,
      items: [],
      entities: [],
      modules: { loader_plan: { reason: plan.reason } },
      metrics: {
        load_ms: Date.now() - started,
        sensitive_excluded_count: 0,
        invalid_injection_simulated_count: 0,
        fallback_used: false,
        cross_topic_cache_hit: false,
      },
    };
  }

  if (
    scopes.has("topic") && input.retrieval_mode === "topic_continuation" &&
    input.active_topic_id
  ) {
    items = await loadTopicItems(
      supabase,
      input.user_id,
      input.active_topic_id,
      Math.min(limit, plan?.budget.topic_items ?? limit),
    );
    if (scopes.has("entity") || scopes.has("topic")) {
      entities = await loadTopicEntities(
        supabase,
        input.user_id,
        input.active_topic_id,
        plan?.budget.max_entities ?? 5,
      );
    }
  }

  if (scopes.has("global") || input.retrieval_mode === "cross_topic_lookup") {
    const domainKeys = [
      ...await mapTextToDomainKeysWithFallback(input.message ?? ""),
      ...expandGlobalKeysToDomainKeys(plan?.global_keys ?? []),
    ];
    const cacheKey = crossTopicCacheKey({
      user_id: input.user_id,
      domain_keys: domainKeys,
      retrieval_mode: input.retrieval_mode,
    });
    const cached = readCrossTopicCache(cacheKey);
    if (cached) {
      crossTopicCacheHit = true;
      items = [...items, ...cached];
    } else {
      const domainItems = domainKeys.length
        ? await runQuery<MemoryV2Item>(
          supabase
            .from("memory_items")
            .select("*")
            .eq("user_id", input.user_id)
            .eq("status", "active")
            .overlaps("domain_keys", domainKeys)
            .limit(Math.min(limit, plan?.budget.global_items ?? limit)),
        )
        : [];
      fallbackUsed = domainItems.length === 0;
      const semanticItems = await runQuery<MemoryV2Item>(
        supabase
          .from("memory_items")
          .select("*")
          .eq("user_id", input.user_id)
          .eq("status", "active")
          .limit(Math.min(limit, plan?.budget.global_items ?? limit)),
      );
      const merged = mergeAndRerankCrossTopicItems({
        message: input.message ?? "",
        domain_keys: domainKeys,
        domain_items: domainItems,
        semantic_items: semanticItems,
        limit: Math.min(limit, plan?.budget.global_items ?? limit),
      });
      writeCrossTopicCache(cacheKey, merged);
      items = [...items, ...merged];
    }
  }

  if (input.retrieval_mode === "safety_first") {
    items = [
      ...items,
      ...await runQuery<MemoryV2Item>(
        supabase
          .from("memory_items")
          .select("*")
          .eq("user_id", input.user_id)
          .eq("status", "active")
          .in("sensitivity_level", ["safety", "sensitive"])
          .limit(
            Math.min(limit || 4, plan?.budget.topic_items ?? (limit || 4)),
          ),
      ),
    ];
  }

  if (scopes.has("event") && input.temporal_window) {
    const dated = await runQuery<MemoryV2Item>(
      supabase
        .from("memory_items")
        .select("*")
        .eq("user_id", input.user_id)
        .eq("status", "active")
        .eq("kind", "event")
        .gte("observed_at", input.temporal_window.resolved_start_at)
        .lt("observed_at", input.temporal_window.resolved_end_at)
        .limit(Math.min(4, plan?.budget.event_items ?? 4)),
    );
    items = [...items, ...dated];
  } else if (scopes.has("event")) {
    const events = await runQuery<MemoryV2Item>(
      supabase
        .from("memory_items")
        .select("*")
        .eq("user_id", input.user_id)
        .eq("status", "active")
        .eq("kind", "event")
        .limit(Math.min(3, plan?.budget.event_items ?? 3)),
    );
    items = [...items, ...events];
  }
  if (scopes.has("action")) {
    const actionItems = await runQuery<MemoryV2Item>(
      supabase
        .from("memory_items")
        .select("*")
        .eq("user_id", input.user_id)
        .eq("status", "active")
        .eq("kind", "action_observation")
        .limit(Math.min(4, plan?.budget.action_items ?? 4)),
    );
    items = [...items, ...actionItems];
  }

  const deduped = [...new Map(items.map((item) => [item.id, item])).values()];
  assertOnlyActiveMemoryItems(deduped);
  const filtered = applySensitivityFilter({
    items: deduped,
    retrieval_mode: input.retrieval_mode,
    active_topic_id: input.active_topic_id,
    requested_sensitive: input.retrieval_mode === "safety_first",
  });
  return {
    retrieval_mode: input.retrieval_mode,
    hints: input.hints ?? [],
    topic_id: input.active_topic_id ?? null,
    items: filtered.items.slice(0, limit),
    entities: entities.slice(0, plan?.budget.max_entities ?? 5),
    modules: plan
      ? {
        loader_plan: {
          reason: plan.reason,
          requested_scopes: plan.requested_scopes,
          dispatcher_memory_plan_applied: plan.dispatcher_memory_plan_applied,
        },
      }
      : {},
    metrics: {
      load_ms: Date.now() - started,
      sensitive_excluded_count: filtered.excluded_count,
      invalid_injection_simulated_count: 0,
      fallback_used: fallbackUsed,
      cross_topic_cache_hit: crossTopicCacheHit,
    },
  };
}

export function payloadJaccard(leftIds: string[], rightIds: string[]): number {
  const left = new Set(leftIds.filter(Boolean));
  const right = new Set(rightIds.filter(Boolean));
  if (left.size === 0 && right.size === 0) return 1;
  let intersection = 0;
  for (const id of left) if (right.has(id)) intersection++;
  const union = new Set([...left, ...right]).size;
  return union > 0 ? intersection / union : 0;
}
