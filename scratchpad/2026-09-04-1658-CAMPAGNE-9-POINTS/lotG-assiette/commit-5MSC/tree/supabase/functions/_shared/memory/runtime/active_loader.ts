import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { logMemoryObservabilityEvent } from "../../memory-observability.ts";
import { buildMemoryV2LoaderPlan } from "./dispatcher_plan_adapter.ts";
import { detectMemorySignals } from "./signal_detection.ts";
import { resolveTemporalReferences } from "./temporal_resolution.ts";
import { routeTopic, type TopicRouterTopic } from "./topic_router.ts";
import { parseVectorColumn } from "../../pgvector.ts";
import { geminiEmbed } from "../../llm.ts";
import {
  readActiveTopicStateV2,
  updateActiveTopicStateV2,
  writeActiveTopicStateV2,
} from "./active_topic_state.ts";
import { loadMemoryV2Payload, type MemoryV2Payload } from "./loader.ts";
import {
  readMemoryPayloadStateV2,
  updateMemoryPayloadStateV2,
  writeMemoryPayloadStateV2,
} from "./payload_state.ts";

export interface MemoryV2ActiveLoaderInput {
  supabase: SupabaseClient;
  userId: string;
  scope: string;
  channel?: "web" | "whatsapp" | null;
  requestId?: string | null;
  turnId?: string | null;
  userMessage: string;
  history?: any[];
  tempMemory: Record<string, unknown>;
  memoryPlan?: unknown;
  userTime?: { user_timezone?: string | null } | null;
  v1?: {
    context_load_ms?: number | null;
    retrieval_mode?: string | null;
    active_topic_id?: string | null;
    payload_item_ids?: string[];
  };
  flags?: {
    loader_enabled?: boolean;
    rollout_percent?: number;
    trace_enabled?: boolean;
  };
}

export interface MemoryV2ActiveLoaderResult {
  tempMemory: Record<string, unknown>;
  context_block: string;
  retrieval_mode: string;
  topic_decision: string;
  active_topic_id: string | null;
  payload_item_ids: string[];
  metrics: {
    load_ms: number;
    total_ms: number;
    sensitive_excluded_count: number;
    invalid_injection_count: number;
    fallback_used: boolean;
    dispatcher_memory_plan_applied: boolean;
    loader_plan_reason: string;
    loaded_scope_counts: {
      topic: number;
      event: number;
      global: number;
      action: number;
      level: number;
      entity: number;
    };
  };
}

function envFlag(name: string, fallback = false): boolean {
  try {
    const raw = String((globalThis as any)?.Deno?.env?.get?.(name) ?? "")
      .trim()
      .toLowerCase();
    if (!raw) return fallback;
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  } catch {
    return fallback;
  }
}

function envNumber(name: string, fallback: number): number {
  try {
    const raw = String((globalThis as any)?.Deno?.env?.get?.(name) ?? "")
      .trim();
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

export function memoryV2RolloutBucket(userId: string): number {
  let hash = 2166136261;
  for (const char of String(userId ?? "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 100;
}

export function isMemoryV2LoaderActiveForUser(args: {
  user_id: string;
  loader_enabled?: boolean;
  rollout_percent?: number;
}): boolean {
  if (envFlag("memory_v2_loader_disabled", false)) return false;
  if (args.loader_enabled === false) return false;
  return true;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label}_timeout_${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadTopicsForActiveLoader(
  supabase: SupabaseClient,
  userId: string,
  activeTopicId: string | null,
): Promise<
  { active: TopicRouterTopic | null; candidates: TopicRouterTopic[] }
> {
  const { data } = await (supabase as any)
    .from("user_topic_memories")
    .select(
      "id,slug,title,lifecycle_stage,search_doc,search_doc_embedding,updated_at",
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(8);
  const rows = Array.isArray(data) ? data : [];
  const topics = rows.map((row: any): TopicRouterTopic => ({
    id: String(row.id),
    slug: row.slug ?? row.topic_slug ?? null,
    title: String(row.title ?? row.slug ?? row.topic_slug ?? "topic"),
    search_doc: row.search_doc ?? null,
    lifecycle_stage: row.lifecycle_stage ?? null,
    // PostgREST returns pgvector columns as JSON strings — parse them or the
    // topic router silently degrades to lexical matching.
    embedding: parseVectorColumn(row.search_doc_embedding),
  }));
  return {
    active: topics.find((topic) => topic.id === activeTopicId) ?? topics[0] ??
      null,
    candidates: topics.filter((topic) => topic.id !== activeTopicId).slice(
      0,
      6,
    ),
  };
}

function trimLine(input: unknown, max = 240): string {
  return String(input ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizePromptText(input: unknown): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function classifyPromptMemoryItem(item: MemoryV2Payload["items"][number]): {
  label: string;
  instruction: string | null;
} {
  const text = normalizePromptText(item.content_text);
  const domainKeys = Array.isArray(item.domain_keys) ? item.domain_keys : [];
  if (item.kind === "action_observation" || item.action_link?.plan_item_id) {
    const aggregation = String(item.action_link?.aggregation_kind ?? "")
      .trim();
    if (
      aggregation === "possible_pattern" || aggregation === "streak_summary"
    ) {
      return {
        label: "ACTION_FAMILY_PATTERN",
        instruction:
          "utilise ce pattern pour l'action meme si la version actuelle a change de reps, cadence ou semaine",
      };
    }
    if (aggregation === "week_summary") {
      return {
        label: "ACTION_WEEK_SUMMARY",
        instruction:
          "utilise ce bilan de semaine comme contexte recent de l'action ciblee",
      };
    }
    return {
      label: "ACTION_OCCURRENCE",
      instruction:
        "utilise cette observation uniquement pour l'action ciblee ou sa famille d'habitude",
    };
  }
  if (item.metadata?.memory_type === "level_execution_handoff") {
    return {
      label: "LEVEL_EXECUTION_HANDOFF",
      instruction:
        "utilise ce signal comme contexte faible de transition de niveau; ne le transforme pas en score ou en certitude",
    };
  }
  if (
    /\b(ne (ressors|mentionne|parle)|ne pas mentionner|ne ressors pas|conversation neutre|sauf si|uniquement si|que si)\b/
      .test(text)
  ) {
    return {
      label: "PRIVACY_BOUNDARY",
      instruction:
        "respecte cette limite: ne mentionne pas le sujet dans un contexte neutre; si le user demande directement ce contexte autorise, reponds sobrement",
    };
  }
  if (
    /\b(evite|eviter|ne propose pas|ne pas proposer|je ne veux pas|dois eviter|a eviter)\b/
      .test(text)
  ) {
    return {
      label: "CONTRAINTE UTILISATEUR",
      instruction:
        "a citer en priorite si la question porte sur quoi proposer, eviter ou recommander",
    };
  }
  if (
    /\b(minuscule|concret|concrete|prochaine action|action suivante|flou|floue|sept minutes|observable|reduction de pression|réduction de pression|plutot qu'un challenge|plutot que.*challenge|surcharge|fatigue|fermer une boucle|boucle ouverte|recuperation|récupération|performance|deux fois par semaine|sans chercher la performance)\b/
      .test(text)
  ) {
    return {
      label: "EXECUTION_RULE",
      instruction:
        "applique cette regle operationnelle dans la reponse et reprends explicitement ses mots importants si la question demande quoi faire maintenant ou demande le bon cadre",
    };
  }
  if (/\b([a-z0-9_-]{2,40}) est (ma|mon|le|la|un|une|l')\b/.test(text)) {
    return {
      label: "IDENTITY_FACT",
      instruction:
        "si la question demande qui est cette personne ou ce nom, reponds directement avec ce fait au lieu de demander une precision",
    };
  }
  if (
    domainKeys.some((key) =>
      key === "sante.alimentation" || key === "sante.medical" ||
      key === "sante.douleur"
    ) ||
    item.sensitivity_level === "sensitive" ||
    item.sensitivity_level === "safety"
  ) {
    return {
      label: "SENSITIVE_DIRECT",
      instruction:
        "a utiliser seulement si la question le demande clairement; dans ce cas, nomme le souvenir sobrement au lieu de rester vague",
    };
  }
  if (
    String(item.kind) === "preference" ||
    /\b(prefere|preference|j aime|je veux)\b/.test(text)
  ) {
    return {
      label: "PREFERENCE",
      instruction:
        "a utiliser pour personnaliser la reponse quand la question concerne ce choix",
    };
  }
  return { label: "SOUVENIR", instruction: null };
}

// P12-G (rose-hard25 R1-B06): tokens de contrainte de STYLE explicite dans le
// content d'un item preference (match lexical borne, jamais de LLM).
const STYLE_CONSTRAINT_TOKEN =
  /\b(emojis?|smileys?|ton|tutoie(?:ment)?|vouvoie(?:ment)?|cash|directe?|style)\b/;
// Marqueur de preference: le schema n'a pas de kind="preference" (encode en
// statement/fact), on exige donc un verbe de volonte/preference explicite ou
// metadata.statement_role=preference quand il est porte.
const STYLE_PREFERENCE_MARKER =
  /\b(veu(?:t|x)|prefere|preference|aime pas|n'aime pas|deteste|demande|exige)\b/;

/**
 * P12-G (rose-hard25 R1-B06): un memory_item actif de type preference portant
 * une contrainte de STYLE explicite (« veut parler cash, sans emojis ») etait
 * charge comme simple fait de contexte noye dans le bloc memoire — 9 tours
 * sur 16 portaient des emojis malgre la preference active. La contrainte est
 * promue en DIRECTIVE DE STYLE contraignante en tete du bloc memoire.
 * Detection deterministe bornee: item fact/statement actif + marqueur de
 * preference + token de style. Pure et exportee pour etre testable.
 */
export function memoryStylePreferenceDirectiveLines(
  items: MemoryV2Payload["items"],
): string[] {
  const styleItems = items.filter((item) => {
    if (String(item.status ?? "") !== "active") return false;
    if (item.kind !== "fact" && item.kind !== "statement") return false;
    const text = normalizePromptText(item.content_text);
    const preferenceShaped =
      String(item.metadata?.statement_role ?? "") === "preference" ||
      STYLE_PREFERENCE_MARKER.test(text);
    return preferenceShaped && STYLE_CONSTRAINT_TOKEN.test(text);
  });
  if (styleItems.length === 0) return [];
  return [
    "STYLE IMPOSE PAR PREFERENCE UTILISATEUR (memoire active) — s'applique a CHAQUE reponse de ce tour, soutien et coaching compris, tant que le user ne la retire pas:",
    ...styleItems.slice(0, 2).map((item) =>
      `- « ${trimLine(item.content_text, 160)} »`
    ),
  ];
}

export function formatMemoryV2PayloadForPrompt(
  payload: MemoryV2Payload,
): string {
  const lines = [
    "=== MEMOIRE V2 ACTIVE ===",
    // P12-G: la directive de style survit en tete du bloc, jamais noyee dans
    // les souvenirs.
    ...memoryStylePreferenceDirectiveLines(payload.items),
    `mode=${payload.retrieval_mode}; topic_id=${
      payload.topic_id ?? "none"
    }; hints=${payload.hints.length ? payload.hints.join(",") : "none"}`,
    "Consignes:",
    "- PRIORITE ABSOLUE — restitution d'un fait confie: si le user demande de restituer ou verifier un fait (date, nom, chiffre, objectif) et qu'un souvenir charge ci-dessous le contient, ta reponse DOIT citer ce fait tel quel. Un souvenir charge prime sur toute reconstruction depuis la conversation.",
    "- Si le fait demande n'est PAS dans les souvenirs charges, dis-le simplement, sans supposer ni approximer.",
    "- Pour un bilan ou une demande du type 'ce que tu sais de moi', appuie-toi d'abord sur les souvenirs charges et cite leurs faits concrets, pas seulement l'ambiance de la conversation.",
    "- Utilise uniquement ces souvenirs comme contexte memoire durable V2 pour cette reponse.",
    "- Si un souvenir est liste ci-dessous, tu y as acces pour ce tour: ne reponds pas que tu n'as pas acces a l'historique.",
    "- Quand la question demande ce qu'il faut eviter, proposer ou recommander, priorise les lignes marquees CONTRAINTE UTILISATEUR avant les souvenirs generaux.",
    "- Quand une ligne EXECUTION_RULE est chargee, applique-la concretement dans la reponse, avec ses mots importants.",
    "- Pour une demande 'adaptee a moi', 'bon cadre', 'que garder en tete' ou similaire, cite les formulations specifiques des souvenirs charges plutot que de generaliser.",
    "- Les lignes ACTION_OCCURRENCE concernent l'action exacte; les lignes ACTION_FAMILY_PATTERN restent utiles si l'habitude a change de reps, cadence ou semaine.",
    "- Si le user demande ce qui l'aide, ce qui marche, son blocage ou le bon moment pour une action, reponds directement depuis les lignes ACTION_* chargees avec les details concrets, sans proposer de programmer un rappel sauf demande explicite d'horaire.",
    "- Pour une action ciblee, n'ajoute pas de conseils generiques absents des lignes ACTION_* chargees; si un detail n'est pas dans les souvenirs, ne l'invente pas.",
    "- Quand une ligne IDENTITY_FACT repond a une question 'qui est X' ou 'quel lien avec Y', reponds directement avec ce fait.",
    "- Ne deduis jamais le prenom du user depuis un souvenir du type 'X est mon/ma ...'; X est une personne tierce sauf souvenir contraire explicite.",
    "- Quand une ligne SENSITIVE_DIRECT est chargee parce que le user demande explicitement le sujet, nomme le sujet sobrement et rappelle qu'il est sensible si le souvenir le dit.",
    "- Quand une ligne PRIVACY_BOUNDARY est chargee, elle sert a eviter une divulgation hors contexte; ne l'utilise pas comme raison de refuser une demande directe autorisee.",
    "- N'invente pas de date, temporalite, duree, frequence, quantite, nom ou objectif absent des souvenirs charges ou du message courant.",
    "- Ne revele jamais les ids internes ni les details de provenance.",
    "- Si le contexte est insuffisant ou ambigu, demande une precision au user.",
  ];
  if (payload.items.length > 0) {
    lines.push("Souvenirs:");
    for (const item of payload.items) {
      const classified = classifyPromptMemoryItem(item);
      const tags = [
        classified.label,
        item.action_link?.action_family_key
          ? `family=${item.action_link.action_family_key}`
          : null,
        item.action_link?.plan_item_id
          ? `plan_item=${item.action_link.plan_item_id}`
          : null,
        item.kind,
        item.sensitivity_level ?? "normal",
        item.observed_at ? `observe=${item.observed_at}` : null,
      ].filter(Boolean).join(" | ");
      lines.push(`- [${tags}] ${trimLine(item.content_text)}`);
      if (classified.instruction) {
        lines.push(`  Priorite: ${classified.instruction}.`);
      }
    }
  }
  if (payload.entities.length > 0) {
    lines.push("Entites:");
    for (const entity of payload.entities) {
      const aliases = Array.isArray(entity.aliases) && entity.aliases.length > 0
        ? ` (${entity.aliases.map((a) => trimLine(a, 40)).join(", ")})`
        : "";
      lines.push(`- ${trimLine(entity.display_name, 80)}${aliases}`);
    }
  }
  if (payload.items.length === 0 && payload.entities.length === 0) {
    lines.push("Aucun souvenir V2 pertinent charge pour ce tour.");
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function runMemoryV2ActiveLoader(
  input: MemoryV2ActiveLoaderInput,
): Promise<MemoryV2ActiveLoaderResult | null> {
  if (
    !isMemoryV2LoaderActiveForUser({
      user_id: input.userId,
      loader_enabled: input.flags?.loader_enabled,
      rollout_percent: input.flags?.rollout_percent,
    })
  ) {
    return null;
  }

  const started = Date.now();
  const signals = detectMemorySignals(input.userMessage);
  const loaderPlan = buildMemoryV2LoaderPlan({
    memory_plan: input.memoryPlan as any,
    signals,
  });
  if (!loaderPlan.enabled) {
    const totalMs = Date.now() - started;
    await logMemoryObservabilityEvent({
      supabase: input.supabase,
      userId: input.userId,
      requestId: input.requestId,
      turnId: input.turnId,
      channel: input.channel ?? null,
      scope: input.scope,
      sourceComponent: "memory_v2_runtime_active",
      eventName: "memory.runtime.active.loaded",
      payload: {
        rollout_bucket: memoryV2RolloutBucket(input.userId),
        dispatcher_memory_plan_applied: true,
        dispatcher_memory_mode: loaderPlan.dispatcher_memory_mode,
        dispatcher_context_need: loaderPlan.dispatcher_context_need,
        loader_plan_requested_scopes: loaderPlan.requested_scopes,
        loader_plan_budget: loaderPlan.budget,
        loader_plan_domain_keys: loaderPlan.domain_keys,
        loader_plan_domain_prefixes: loaderPlan.domain_prefixes,
        loader_plan_action_targets: loaderPlan.action_targets ?? [],
        loader_plan_reason: loaderPlan.reason,
        retrieval_mode: loaderPlan.retrieval_mode,
        retrieval_hints: signals.retrieval_hints,
        topic_decision: "skipped",
        active_topic_id: null,
        topic_router_skipped: true,
        payload_item_ids: [],
        payload_item_count: 0,
        sensitive_excluded_count: 0,
        invalid_injection_count: 0,
        fallback_used: false,
        loader_ms: 0,
        total_ms: totalMs,
        v1: input.v1 ?? null,
      },
    });
    return {
      tempMemory: { ...(input.tempMemory ?? {}) },
      context_block: "",
      retrieval_mode: loaderPlan.retrieval_mode,
      topic_decision: "skipped",
      active_topic_id: null,
      payload_item_ids: [],
      metrics: {
        load_ms: 0,
        total_ms: totalMs,
        sensitive_excluded_count: 0,
        invalid_injection_count: 0,
        fallback_used: false,
        dispatcher_memory_plan_applied: true,
        loader_plan_reason: loaderPlan.reason,
        loaded_scope_counts: {
          topic: 0,
          event: 0,
          global: 0,
          action: 0,
          level: 0,
          entity: 0,
        },
      },
    };
  }
  const temporal = signals.dated_reference.detected
    ? resolveTemporalReferences(input.userMessage, {
      timezone: input.userTime?.user_timezone ?? "Europe/Paris",
    })
    : [];
  let tempMemory = { ...(input.tempMemory ?? {}) };
  const activeState = readActiveTopicStateV2(tempMemory);
  let routed: {
    active_topic_id: string | null;
    active_topic_slug?: string | null;
    confidence: number;
    shortlist: TopicRouterTopic[];
    decision: string;
    reason: string;
  } = {
    active_topic_id: activeState.active_topic_id,
    active_topic_slug: activeState.active_topic_slug,
    confidence: activeState.confidence,
    shortlist: [],
    decision: "skipped",
    reason: "dispatcher_plan_no_topic_router",
  };
  if (loaderPlan.requires_topic_router) {
    const topics = await loadTopicsForActiveLoader(
      input.supabase,
      input.userId,
      activeState.active_topic_id,
    );
    // Embedding du message pour le routage semantique. Best-effort et borne
    // dans le temps: en echec, le routeur retombe sur le lexical (repli).
    // Sans cet embedding, cosineSimilarity n'a jamais tourne au runtime et le
    // routage etait lexical-only (constat QA du 10/07: items ranges dans les
    // mauvais topics sur les questions de rappel).
    let messageEmbedding: number[] | null = null;
    try {
      messageEmbedding = await withTimeout(
        geminiEmbed(input.userMessage, input.requestId ?? undefined, {
          source: "memory-v2:runtime_topic_router",
          userId: input.userId,
          operationName: "memory.runtime_message_vectorization",
        }),
        Math.max(500, envNumber("memory_v2_message_embed_timeout_ms", 2000)),
        "memory_v2_message_embed",
      );
    } catch {
      messageEmbedding = null;
    }
    const topicRoute = await routeTopic({
      message: input.userMessage,
      retrieval_mode: loaderPlan.retrieval_mode,
      signals,
      active_topic: topics.active,
      candidate_topics: topics.candidates,
      message_embedding: messageEmbedding,
      recent_messages: (input.history ?? [])
        .slice(-5)
        .map((m) => String(m?.content ?? m ?? "")),
    });
    routed = topicRoute;
    const nextActive = updateActiveTopicStateV2(activeState, {
      active_topic_id: routed.active_topic_id,
      active_topic_slug: routed.active_topic_slug ?? null,
      confidence: routed.confidence,
      candidate_topic_ids: routed.shortlist.map((topic) => topic.id),
      last_decision: routed.decision as any,
      last_decision_reason: routed.reason,
    });
    tempMemory = writeActiveTopicStateV2(tempMemory, nextActive);
  }

  const timeoutMs = Math.max(
    250,
    envNumber("memory_v2_loader_timeout_ms", 1500),
  );
  const payload = await withTimeout(
    loadMemoryV2Payload({
      supabase: input.supabase,
      user_id: input.userId,
      retrieval_mode: loaderPlan.retrieval_mode,
      hints: signals.retrieval_hints,
      active_topic_id: routed.active_topic_id,
      message: input.userMessage,
      temporal_window: temporal[0] ?? null,
      limit: loaderPlan.budget.max_items,
      loader_plan: loaderPlan,
    }),
    timeoutMs,
    "memory_v2_loader",
  );
  const previousPayload = readMemoryPayloadStateV2(tempMemory);
  const nextPayload = updateMemoryPayloadStateV2({
    previous: previousPayload,
    turn_id: input.turnId ?? null,
    active_topic_id: routed.active_topic_id,
    injected_items: payload.items.map((item) => ({
      memory_item_id: item.id,
      reason: loaderPlan.retrieval_mode === "cross_topic_lookup"
        ? "cross_topic"
        : loaderPlan.retrieval_mode === "safety_first"
        ? "safety"
        : signals.retrieval_hints.includes("dated_reference")
        ? "dated"
        : signals.retrieval_hints.includes("action_related")
        ? "action"
        : "active_topic_core",
      sensitivity_level: item.sensitivity_level ?? "normal",
    })),
    injected_entities: payload.entities.map((entity) => ({
      entity_id: entity.id,
      reason: "topic_anchor",
    })),
  });
  tempMemory = writeMemoryPayloadStateV2(tempMemory, nextPayload);

  const contextBlock = formatMemoryV2PayloadForPrompt(payload);
  const totalMs = Date.now() - started;
  const payloadIds = payload.items.map((item) => item.id);
  await logMemoryObservabilityEvent({
    supabase: input.supabase,
    userId: input.userId,
    requestId: input.requestId,
    turnId: input.turnId,
    channel: input.channel ?? null,
    scope: input.scope,
    sourceComponent: "memory_v2_runtime_active",
    eventName: "memory.runtime.active.loaded",
    payload: {
      rollout_bucket: memoryV2RolloutBucket(input.userId),
      dispatcher_memory_plan_applied: true,
      dispatcher_memory_mode: loaderPlan.dispatcher_memory_mode,
      dispatcher_context_need: loaderPlan.dispatcher_context_need,
      loader_plan_requested_scopes: loaderPlan.requested_scopes,
      loader_plan_budget: loaderPlan.budget,
      loader_plan_domain_keys: loaderPlan.domain_keys,
      loader_plan_domain_prefixes: loaderPlan.domain_prefixes,
      loader_plan_action_targets: loaderPlan.action_targets ?? [],
      loader_plan_reason: loaderPlan.reason,
      retrieval_policy: loaderPlan.retrieval_policy,
      topic_router_skipped: !loaderPlan.requires_topic_router,
      retrieval_mode: loaderPlan.retrieval_mode,
      retrieval_hints: signals.retrieval_hints,
      topic_decision: routed.decision,
      active_topic_id: routed.active_topic_id,
      topic_confidence: routed.confidence,
      payload_item_ids: payloadIds,
      payload_item_count: payloadIds.length,
      loaded_scope_counts: payload.metrics.loaded_scope_counts,
      sensitive_excluded_count: payload.metrics.sensitive_excluded_count,
      invalid_injection_count:
        payload.metrics.invalid_injection_simulated_count,
      fallback_used: payload.metrics.fallback_used,
      cross_topic_cache_hit: payload.metrics.cross_topic_cache_hit,
      loader_ms: payload.metrics.load_ms,
      total_ms: totalMs,
      v1: input.v1 ?? null,
    },
  });

  return {
    tempMemory,
    context_block: contextBlock,
    retrieval_mode: loaderPlan.retrieval_mode,
    topic_decision: routed.decision,
    active_topic_id: routed.active_topic_id,
    payload_item_ids: payloadIds,
    metrics: {
      load_ms: payload.metrics.load_ms,
      total_ms: totalMs,
      sensitive_excluded_count: payload.metrics.sensitive_excluded_count,
      invalid_injection_count:
        payload.metrics.invalid_injection_simulated_count,
      fallback_used: payload.metrics.fallback_used,
      dispatcher_memory_plan_applied: true,
      loader_plan_reason: loaderPlan.reason,
      loaded_scope_counts: payload.metrics.loaded_scope_counts,
    },
  };
}
