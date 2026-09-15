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
import {
  actionFamilyAliases,
  buildActionFamilyKey,
  normalizeActionText,
} from "../action_family.ts";

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
  requires_user_initiated?: boolean | null;
  topic_ids?: string[];
  search_doc?: string | null;
  metadata?: Record<string, unknown> | null;
  action_link?: {
    plan_item_id?: string | null;
    action_family_key?: string | null;
    aggregation_kind?: string | null;
    observation_window_start?: string | null;
    observation_window_end?: string | null;
    confidence?: number | null;
    metadata?: Record<string, unknown> | null;
  } | null;
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
    loaded_scope_counts: {
      topic: number;
      event: number;
      global: number;
      action: number;
      level: number;
      entity: number;
    };
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
    const userInitiatedOnly = Boolean(item.requires_user_initiated);
    const inActiveTopic = Boolean(
      args.active_topic_id && item.topic_ids?.includes(args.active_topic_id),
    );
    const userInitiatedAllowed = !userInitiatedOnly ||
      args.requested_sensitive || args.retrieval_mode === "safety_first";
    const sensitivityAllowed = level === "normal" ||
      (level === "sensitive" &&
        (inActiveTopic || args.requested_sensitive ||
          args.retrieval_mode === "safety_first")) ||
      (level === "safety" &&
        (args.requested_sensitive || args.retrieval_mode === "safety_first"));
    const allowed = userInitiatedAllowed && sensitivityAllowed;
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
  [
    "addictions.cannabis",
    /\b(cannabis|joint|weed|beuh|fumer|envie de couper|couper la pression|pression le soir)\b/,
  ],
  [
    "addictions.alcool",
    /\b(alcool|boire|cuite|verre|bourre|whisky|apero|aperitif|anesthesier|pression le soir)\b/,
  ],
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
    /\b(alimentation|manger|repas|plat|ingredient|sucre|nutrition|grignote|allergie|allergique|intolerance|sesame|tahini|gomasio)\b/,
  ],
  [
    "sante.activite_physique",
    /\b(sport|marche|courir|course|sortie course|entrainement|muscu|activite physique|natation|nager|nage)\b/,
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
    /\b(long terme|vision|objectif global)\b/,
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

function envNumber(name: string, fallback: number): number {
  try {
    const raw = String(Deno?.env?.get?.(name) ?? "").trim();
    if (!raw) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

async function withSoftTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
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
  userId?: string | null,
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
    const out = await withSoftTimeout(
      geminiGenerate({
        model,
        jsonMode: true,
        temperature: 0,
        requestId: crypto.randomUUID(),
        userId: userId ?? undefined,
        source: "memory-v2:domain_mapper",
        operationFamily: "memorizer",
        operationName: "memory_v2.domain_mapper",
        systemPrompt:
          'Mappe la demande utilisateur vers les domain_keys V2. Retourne uniquement JSON: {"domain_keys":[...],"confidence":0-1}. N\'utilise que les cles connues.',
        userMessage: JSON.stringify({
          text,
          allowed_domain_keys: [...DOMAIN_KEYS_V1],
        }),
      }),
      Math.max(50, envNumber("MEMORY_V2_DOMAIN_MAPPER_TIMEOUT_MS", 350)),
    );
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
  message?: string;
}): string {
  return JSON.stringify({
    version: 2,
    user_id: args.user_id,
    domain_keys: [...args.domain_keys].sort(),
    retrieval_mode: args.retrieval_mode,
    query: normalize(args.message ?? "").slice(0, 160),
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

function expandDomainTargetsToDomainKeys(keys: string[]): string[] {
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

function isSensitiveDomainKey(key: string): boolean {
  return key === "sante.alimentation" || key === "sante.medical" ||
    key === "sante.douleur" || key.startsWith("addictions.");
}

function messageRequestsSensitiveMemory(message: string): boolean {
  return /\b(allerg\w*|ingredient\w*|restaurant\w*|repas|manger|eviter|evite|intoleran\w*|sante|medical|traitement|diagnostic|douleur|addiction|cannabis|consommation|alcool|whisky|apero|aperitif|anesthesier|envie de couper|couper la pression|pression le soir)\b/
    .test(normalize(message));
}

function messageRequestsKnownMemory(message: string): boolean {
  return /\b(tu peux me rappeler|rappelle moi|rappelle-moi|ce que tu as retenu|qu'est-ce que tu sais|qu'est ce que tu sais|qui est|quel est le lien|d'apres ce que je t'ai deja dit|d'après ce que je t'ai déjà dit)\b/
    .test(normalize(message));
}

function messageAsksToSuppressSensitiveMemory(message: string): boolean {
  return /\b(sans sortir|sans mentionner|ne ressors pas|ne pas ressortir|conversation neutre|sujets sensibles inutiles|sujet sensible inutile)\b/
    .test(normalize(message));
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

const SCORE_STOPWORDS = new Set([
  "avec",
  "dans",
  "donc",
  "elle",
  "entre",
  "est",
  "etre",
  "faire",
  "faut",
  "garde",
  "lien",
  "pour",
  "quoi",
  "quand",
  "quel",
  "quelle",
  "qui",
  "sais",
  "sont",
  "sur",
  "tenir",
  "tete",
  "voir",
]);

function lexicalAnchorScore(message: string, item: MemoryV2Item): number {
  const normalizedMessage = normalize(message);
  const messageTokens = normalizedMessage.split(/\W+/)
    .filter((token) => token.length >= 4 && !SCORE_STOPWORDS.has(token));
  const expandedTokens = new Set(messageTokens);
  if (/\bnatation|session\b/.test(normalizedMessage)) {
    for (
      const token of ["nager", "nage", "recuperation", "performance", "semaine"]
    ) {
      expandedTokens.add(token);
    }
  }
  if (
    /\bprochaine action|adaptee|adaptée|bloque|fatigue\b/.test(
      normalizedMessage,
    )
  ) {
    for (
      const token of [
        "sept",
        "observable",
        "concrete",
        "boucle",
        "micro-livraison",
      ]
    ) {
      expandedTokens.add(token);
    }
  }
  if (/\bplat|repas|eviter|evite|ingredient\b/.test(normalizedMessage)) {
    for (const token of ["allergie", "sesame", "tahini", "gomasio"]) {
      expandedTokens.add(token);
    }
  }
  if (
    /\banesthesier|pression le soir|apero|alcool|whisky\b/.test(
      normalizedMessage,
    )
  ) {
    for (const token of ["whisky", "alcool", "sensible"]) {
      expandedTokens.add(token);
    }
  }
  if (!expandedTokens.size) return 0;
  const text = normalize(`${item.content_text} ${item.search_doc ?? ""}`);
  let hits = 0;
  for (const token of expandedTokens) {
    if (text.includes(token)) hits++;
  }
  return Math.min(0.75, hits * 0.22);
}

function directAvoidanceScore(message: string, item: MemoryV2Item): number {
  const msg = normalize(message);
  if (
    !/\b(ingredient\w*|restaurant\w*|repas|plat|manger|eviter|evite)\b/.test(
      msg,
    )
  ) {
    return 0;
  }
  const text = normalize(item.content_text);
  return /\b(evite|eviter|allerg\w*|sesame|tahini|gomasio|noisette\w*|amande\w*|snack\w*|ingredient\w*)\b/
      .test(text)
    ? 0.4
    : 0;
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
        lexicalAnchorScore(args.message, item) +
        directAvoidanceScore(args.message, item) +
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

interface ActiveActionSignal {
  plan_item_id: string;
  title: string;
  kind?: string | null;
  dimension?: string | null;
  action_family_key: string;
  aliases: string[];
  target_reps?: number | null;
  current_reps?: number | null;
  cadence_label?: string | null;
  scheduled_days?: string[] | null;
  time_of_day?: string | null;
  start_after_item_id?: string | null;
}

function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function loadActiveActionSignals(
  _supabase: any,
  _userId: string,
): Promise<ActiveActionSignal[]> {
  // RETRAIT RÉSIDUS (2026-08-08): user_plan_items est supprimée (plan V2,
  // 0 utilisateur grand public). Tableau vide, même motif que la phase 1.
  return [];
}

function selectActionSignalsForMessage(args: {
  signals: ActiveActionSignal[];
  message: string;
  action_targets?: string[];
}): ActiveActionSignal[] {
  const targets = new Set(
    (args.action_targets ?? []).map((target) => normalizeActionText(target))
      .filter(Boolean),
  );
  const message = normalizeActionText(args.message);
  const scored = args.signals.map((signal) => {
    const signalTokens = [
      signal.plan_item_id,
      signal.action_family_key,
      signal.title,
      ...signal.aliases,
    ].map(normalizeActionText).filter(Boolean);
    let score = 0;
    if (targets.has(normalizeActionText(signal.plan_item_id))) score += 1.2;
    if (targets.has(normalizeActionText(signal.action_family_key))) {
      score += 1.0;
    }
    for (const token of signalTokens) {
      if (targets.has(token)) score += 0.8;
      if (token && message.includes(token)) score += 0.55;
    }
    return { signal, score };
  }).sort((a, b) => b.score - a.score);
  const strong = scored.filter((entry) => entry.score >= 0.55).slice(0, 3)
    .map((entry) => entry.signal);
  return strong.length > 0 ? strong : [];
}

function actionRowsToMemoryItems(rows: any[]): MemoryV2Item[] {
  return rows
    .map((row) => {
      const item = row.memory_items ?? null;
      if (!item) return null;
      const metadata = row.metadata && typeof row.metadata === "object"
        ? row.metadata as Record<string, unknown>
        : {};
      return {
        ...item,
        action_link: {
          plan_item_id: row.plan_item_id ?? null,
          action_family_key: metadata.action_family_key
            ? String(metadata.action_family_key)
            : null,
          aggregation_kind: row.aggregation_kind ?? null,
          observation_window_start: row.observation_window_start ?? null,
          observation_window_end: row.observation_window_end ?? null,
          confidence: row.confidence ?? null,
          metadata,
        },
      } as MemoryV2Item;
    })
    .filter(Boolean) as MemoryV2Item[];
}

async function loadActionLinkedItems(args: {
  supabase: any;
  user_id: string;
  target_signals: ActiveActionSignal[];
  limit: number;
}): Promise<MemoryV2Item[]> {
  const limit = Math.max(1, args.limit);
  const planItemIds = [
    ...new Set(args.target_signals.map((signal) => signal.plan_item_id)),
  ];
  const familyKeys = [
    ...new Set(args.target_signals.map((signal) => signal.action_family_key)),
  ].filter(Boolean);
  const rows: MemoryV2Item[] = [];
  if (planItemIds.length > 0) {
    rows.push(...actionRowsToMemoryItems(
      await runQuery<any>(
        args.supabase
          .from("memory_item_actions")
          .select(
            "plan_item_id,aggregation_kind,confidence,observation_window_start,observation_window_end,metadata,memory_items!inner(*)",
          )
          .eq("user_id", args.user_id)
          .eq("memory_items.status", "active")
          .in("plan_item_id", planItemIds)
          .limit(Math.min(30, limit * 5)),
      ),
    ));
  }
  for (const familyKey of familyKeys) {
    rows.push(...actionRowsToMemoryItems(
      await runQuery<any>(
        args.supabase
          .from("memory_item_actions")
          .select(
            "plan_item_id,aggregation_kind,confidence,observation_window_start,observation_window_end,metadata,memory_items!inner(*)",
          )
          .eq("user_id", args.user_id)
          .eq("memory_items.status", "active")
          .contains("metadata", { action_family_key: familyKey })
          .limit(Math.min(30, limit * 5)),
      ),
    ));
  }
  const targetIds = new Set(planItemIds);
  const targetFamilies = new Set(familyKeys);
  return [...new Map(rows.map((item) => [item.id, item])).values()]
    .sort((left, right) => {
      const leftExact =
        targetIds.has(String(left.action_link?.plan_item_id ?? "")) ? 1 : 0;
      const rightExact =
        targetIds.has(String(right.action_link?.plan_item_id ?? "")) ? 1 : 0;
      if (leftExact !== rightExact) return rightExact - leftExact;
      const leftFamily = targetFamilies.has(
          String(left.action_link?.action_family_key ?? ""),
        )
        ? 1
        : 0;
      const rightFamily = targetFamilies.has(
          String(right.action_link?.action_family_key ?? ""),
        )
        ? 1
        : 0;
      if (leftFamily !== rightFamily) return rightFamily - leftFamily;
      return String(right.observed_at ?? "").localeCompare(
        String(left.observed_at ?? ""),
      );
    })
    .slice(0, limit);
}

function memoryItemMetadata(item: MemoryV2Item): Record<string, unknown> {
  return item && typeof (item as any).metadata === "object"
    ? (item as any).metadata as Record<string, unknown>
    : {};
}

async function loadLevelHandoffItems(args: {
  supabase: any;
  user_id: string;
  level_targets?: string[];
  limit: number;
}): Promise<MemoryV2Item[]> {
  let rows = await runQuery<MemoryV2Item>(
    args.supabase
      .from("memory_items")
      .select("*")
      .eq("user_id", args.user_id)
      .eq("status", "active")
      .contains("metadata", { memory_type: "level_execution_handoff" })
      .limit(Math.max(1, Math.min(4, args.limit))),
  );
  if (rows.length === 0) {
    rows = await runQuery<MemoryV2Item>(
      args.supabase
        .from("memory_items")
        .select("*")
        .eq("user_id", args.user_id)
        .eq("status", "active")
        .filter("metadata->>memory_type", "eq", "level_execution_handoff")
        .limit(Math.max(1, Math.min(4, args.limit))),
    );
  }
  const targets = new Set(
    (args.level_targets ?? []).map((target) => normalizeActionText(target))
      .filter((target) =>
        target &&
        !["transition", "current_level", "previous_level", "global"].includes(
          target,
        ) &&
        !["current level", "previous level"].includes(
          target,
        )
      ),
  );
  return rows
    .filter((item) => {
      if (targets.size === 0) return true;
      const metadata = memoryItemMetadata(item);
      const keys = [
        metadata.level_id,
        metadata.transformation_id,
        metadata.previous_level_id,
        metadata.previous_transformation_id,
        metadata.next_level_id,
        metadata.next_transformation_id,
        item.content_text,
      ].map(normalizeActionText).filter(Boolean);
      return keys.some((key) =>
        targets.has(key) || [...targets].some((target) => key.includes(target))
      );
    })
    .slice(0, Math.max(1, args.limit));
}

// Classement deterministe des items d'un topic sous le budget: la requete
// brute n'a AUCUN ordre (constat QA 10/07: l'objectif 10km, item le plus
// saillant du topic course, tombait hors des 3 premieres lignes arbitraires
// de Postgres). Composite importance + recence: l'importance porte les faits
// structurants (objectifs, contraintes), la recence empeche un vieux fait
// important d'affamer les updates fraiches.
export function rankTopicItemsForBudget(
  items: MemoryV2Item[],
  limit: number,
  nowMs = Date.now(),
): MemoryV2Item[] {
  const scored = items.map((item) => {
    const importance = Math.max(
      0,
      Math.min(1, Number(item.importance_score ?? 0)),
    );
    const observed = Date.parse(
      String(
        (item as { observed_at?: string | null }).observed_at ??
          (item as { created_at?: string | null }).created_at ?? "",
      ),
    );
    const ageDays = Number.isFinite(observed)
      ? Math.max(0, (nowMs - observed) / 86_400_000)
      : 365;
    const recency = 1 / (1 + ageDays / 14);
    return { item, score: importance * 0.6 + recency * 0.4 };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit))
    .map((entry) => entry.item);
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
      .limit(Math.min(60, Math.max(1, limit) * 5)),
  );
  const items = rows
    .map((row) => row.memory_items)
    .filter(Boolean)
    .filter((item) => String(item.user_id ?? "") === userId)
    // P2-5a (paul-untested R1-B05): seul chemin sans filtre de statut — un
    // item `candidate` résiduel remonté par la jointure topic faisait jeter
    // `assertOnlyActiveMemoryItems` et cassait le recall ENTIER du tour,
    // fleet-wide tant qu'un candidate existait. L'assert reste en ceinture.
    .filter((item) => String(item.status ?? "") === "active")
    .map((item) => ({ ...item, topic_ids: [topicId] }));
  return rankTopicItemsForBudget(items, limit);
}

async function loadTopicEntities(
  supabase: any,
  userId: string,
  topicId: string,
  limit: number,
): Promise<MemoryV2Entity[]> {
  const topicLinks = await runQuery<any>(
    supabase
      .from("memory_item_topics")
      .select("memory_item_id")
      .eq("topic_id", topicId)
      .limit(limit * 3),
  );
  const itemIds = [
    ...new Set(
      topicLinks
        .map((row) => String(row.memory_item_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (itemIds.length === 0) return [];

  const rows = await runQuery<any>(
    supabase
      .from("memory_item_entities")
      .select("user_entities(*)")
      .eq("user_id", userId)
      .in("memory_item_id", itemIds)
      .limit(limit * 3),
  );
  const byId = new Map<string, MemoryV2Entity>();
  for (const row of rows) {
    const entity = row.user_entities;
    if (
      entity?.id && entity.user_id === userId && entity.status === "active"
    ) {
      byId.set(entity.id, entity);
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
  const actionTargetPlanIds = new Set<string>();
  const actionTargetFamilyKeys = new Set<string>();
  const loadedScopeCounts = {
    topic: 0,
    event: 0,
    global: 0,
    action: 0,
    level: 0,
    entity: 0,
  };
  let fallbackUsed = false;
  let crossTopicCacheHit = false;
  let effectiveDomainKeys: string[] = [];
  let directSensitiveRequest = false;

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
        loaded_scope_counts: loadedScopeCounts,
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
    const topicItems = await loadTopicItems(
      supabase,
      input.user_id,
      input.active_topic_id,
      Math.min(limit, plan?.budget.topic_items ?? limit),
    );
    loadedScopeCounts.topic += topicItems.length;
    items = [...items, ...topicItems];
    if (scopes.has("entity") || scopes.has("topic")) {
      entities = await loadTopicEntities(
        supabase,
        input.user_id,
        input.active_topic_id,
        plan?.budget.max_entities ?? 5,
      );
      loadedScopeCounts.entity += entities.length;
    }
  }

  if (scopes.has("global") || input.retrieval_mode === "cross_topic_lookup") {
    const domainKeys = [
      ...await mapTextToDomainKeysWithFallback(input.message ?? "", input.user_id),
      ...expandDomainTargetsToDomainKeys([
        ...(plan?.domain_keys ?? []),
        ...(plan?.domain_prefixes ?? []),
        ...(plan?.global_keys ?? []),
      ]),
    ];
    const suppressSensitiveTargets =
      messageAsksToSuppressSensitiveMemory(input.message ?? "") &&
      !messageRequestsSensitiveMemory(input.message ?? "");
    effectiveDomainKeys = [...new Set(domainKeys)].filter((key) =>
      !(suppressSensitiveTargets && isSensitiveDomainKey(key))
    );
    directSensitiveRequest =
      messageRequestsSensitiveMemory(input.message ?? "") &&
      effectiveDomainKeys.some(isSensitiveDomainKey);
    const baseGlobalLimit = Math.min(limit, plan?.budget.global_items ?? limit);
    const globalRerankLimit = Math.max(
      Math.min(12, Math.max(limit, baseGlobalLimit * 4)),
      directSensitiveRequest ? Math.min(limit, 4) : 0,
    );
    const cacheKey = crossTopicCacheKey({
      user_id: input.user_id,
      domain_keys: effectiveDomainKeys,
      retrieval_mode: input.retrieval_mode,
      message: input.message ?? "",
    });
    const cached = readCrossTopicCache(cacheKey);
    if (cached) {
      crossTopicCacheHit = true;
      loadedScopeCounts.global += cached.length;
      items = [...items, ...cached];
    } else {
      const domainItems = domainKeys.length
        ? await runQuery<MemoryV2Item>(
          supabase
            .from("memory_items")
            .select("*")
            .eq("user_id", input.user_id)
            .eq("status", "active")
            .overlaps("domain_keys", effectiveDomainKeys)
            .limit(Math.min(50, Math.max(12, limit * 6))),
        )
        : [];
      fallbackUsed = domainItems.length === 0;
      const semanticItems = await runQuery<MemoryV2Item>(
        supabase
          .from("memory_items")
          .select("*")
          .eq("user_id", input.user_id)
          .eq("status", "active")
          .limit(Math.min(50, Math.max(12, limit * 6))),
      );
      const semanticPool =
        directSensitiveRequest && effectiveDomainKeys.length > 0
          ? semanticItems.filter((item) =>
            (item.domain_keys ?? []).some((key) =>
              effectiveDomainKeys.includes(key)
            )
          )
          : semanticItems;
      const merged = mergeAndRerankCrossTopicItems({
        message: input.message ?? "",
        domain_keys: effectiveDomainKeys,
        domain_items: domainItems,
        semantic_items: semanticPool,
        limit: globalRerankLimit,
      });
      writeCrossTopicCache(cacheKey, merged);
      loadedScopeCounts.global += merged.length;
      items = [...items, ...merged];
    }
  }

  if (input.retrieval_mode === "safety_first") {
    const safetyItems = await runQuery<MemoryV2Item>(
      supabase
        .from("memory_items")
        .select("*")
        .eq("user_id", input.user_id)
        .eq("status", "active")
        .in("sensitivity_level", ["safety", "sensitive"])
        .limit(
          Math.min(limit || 4, plan?.budget.topic_items ?? (limit || 4)),
        ),
    );
    loadedScopeCounts.topic += safetyItems.length;
    items = [...items, ...safetyItems];
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
    loadedScopeCounts.event += dated.length;
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
    loadedScopeCounts.event += events.length;
    items = [...items, ...events];
  }
  if (scopes.has("action")) {
    const actionLimit = Math.min(
      limit,
      Math.max(4, plan?.budget.action_items ?? 4),
    );
    const activeSignals = await loadActiveActionSignals(
      supabase,
      input.user_id,
    );
    const targetSignals = selectActionSignalsForMessage({
      signals: activeSignals,
      message: input.message ?? "",
      action_targets: plan?.action_targets ?? [],
    });
    for (const signal of targetSignals) {
      actionTargetPlanIds.add(signal.plan_item_id);
      actionTargetFamilyKeys.add(signal.action_family_key);
    }
    const linkedActionItems = targetSignals.length > 0
      ? await loadActionLinkedItems({
        supabase,
        user_id: input.user_id,
        target_signals: targetSignals,
        limit: Math.max(1, actionLimit),
      })
      : [];
    const actionItems = linkedActionItems.length > 0
      ? linkedActionItems
      : targetSignals.length === 0 && activeSignals.length > 0
      ? []
      : await runQuery<MemoryV2Item>(
        supabase
          .from("memory_items")
          .select("*")
          .eq("user_id", input.user_id)
          .eq("status", "active")
          .eq("kind", "action_observation")
          .limit(Math.max(1, actionLimit)),
      );
    loadedScopeCounts.action += actionItems.length;
    items = [...items, ...actionItems];
  }
  if (scopes.has("level")) {
    const levelItems = await loadLevelHandoffItems({
      supabase,
      user_id: input.user_id,
      level_targets: plan?.level_targets ?? [],
      limit: Math.max(1, plan?.budget.level_items ?? 1),
    });
    loadedScopeCounts.level += levelItems.length;
    items = [...items, ...levelItems];
  }

  const deduped = [...new Map(items.map((item) => [item.id, item])).values()];
  assertOnlyActiveMemoryItems(deduped);
  const requestedSensitive = input.retrieval_mode === "safety_first" ||
    directSensitiveRequest ||
    (scopes.has("action") && actionTargetPlanIds.size > 0) ||
    (messageRequestsKnownMemory(input.message ?? "") &&
      input.retrieval_mode === "cross_topic_lookup");
  const filtered = applySensitivityFilter({
    items: deduped,
    retrieval_mode: input.retrieval_mode,
    active_topic_id: input.active_topic_id,
    requested_sensitive: requestedSensitive,
  });
  const actionFilteredItems =
    scopes.has("action") && actionTargetPlanIds.size > 0
      ? filtered.items.filter((item) => {
        const link = item.action_link;
        if (!link) return item.kind !== "action_observation";
        return actionTargetPlanIds.has(String(link.plan_item_id ?? "")) ||
          actionTargetFamilyKeys.has(String(link.action_family_key ?? ""));
      })
      : filtered.items;
  const finalItems = scopes.has("action")
    ? [...actionFilteredItems].sort((left, right) => {
      const score = (item: MemoryV2Item) => {
        const link = item.action_link;
        if (!link) return 0;
        let value = 25;
        if (actionTargetPlanIds.has(String(link.plan_item_id ?? ""))) {
          value += 100;
        }
        if (
          actionTargetFamilyKeys.has(String(link.action_family_key ?? ""))
        ) {
          value += 80;
        }
        if (item.kind === "action_observation") value += 10;
        return value;
      };
      const delta = score(right) - score(left);
      if (delta !== 0) return delta;
      return String(right.observed_at ?? "").localeCompare(
        String(left.observed_at ?? ""),
      );
    })
    : filtered.items;
  return {
    retrieval_mode: input.retrieval_mode,
    hints: input.hints ?? [],
    topic_id: input.active_topic_id ?? null,
    items: finalItems.slice(0, limit),
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
      loaded_scope_counts: loadedScopeCounts,
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
