import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { generateWithGemini, getGlobalAiModel } from "./gemini.ts";
import {
  POTION_SUPPORT_SOURCE,
  type PotionSupportBoundaryTarget,
  type PotionSupportContextV1,
  type PotionSupportEvidence,
  type PotionSupportEvidenceProvenance,
  type PotionSupportEvidenceRef,
  type PotionSupportGroundedItem,
  type PotionSupportLedger,
  type PotionSupportMessageCursor,
  type PotionSupportUserBoundary,
  readPotionSupportContext,
} from "./potion-support-context.ts";
import {
  type PotionSupportFocusContinuity,
  type PotionSupportFocusFreshness,
  type PotionSupportFocusKind,
  type PotionSupportVisibleTask,
  renderPotionSupportOpening,
} from "./potion-support-visible-agent.ts";

export const POTION_SUPPORT_QUIET_WINDOW_MS = 2 * 60 * 60 * 1000;
const MESSAGE_BATCH_LIMIT = 240;
const ROLLING_EVIDENCE_LIMIT = 80;

type ChatRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  scope: string;
  created_at: string;
};

export type PotionSupportSelectedEvidence = {
  text: string;
  evidence_refs: PotionSupportEvidenceRef[];
  provenance: Exclude<
    PotionSupportEvidenceProvenance,
    "assistant_context_only"
  >;
};

export type PotionSupportFocusDecision = PotionSupportSelectedEvidence & {
  kind: PotionSupportFocusKind;
  freshness: PotionSupportFocusFreshness;
  continuity: PotionSupportFocusContinuity;
  why: string | null;
};

export type PotionSupportPreparationDecision =
  | "send"
  | "skip_no_grounding"
  | "skip_resolved"
  | "skip_user_boundary";

export type PotionSupportPreparation = {
  decision: PotionSupportPreparationDecision;
  boundary_target: PotionSupportBoundaryTarget | null;
  cumulative_ledger_after: PotionSupportLedger;
  context_after: PotionSupportContextV1;
  focus_decision: PotionSupportFocusDecision | null;
  progress_facts: PotionSupportSelectedEvidence[];
  visible_task: PotionSupportVisibleTask | null;
  opening_evidence_refs: PotionSupportEvidenceRef[];
  anchor_fact: PotionSupportSelectedEvidence | null;
  question_candidate: PotionSupportSelectedEvidence | null;
  opening_text: string | null;
  read_cutoff: string;
  integrated_message_ids: string[];
};

type ModelGroundedItem = {
  text?: unknown;
  evidence_ids?: unknown;
  target?: unknown;
};

type ModelPreparation = {
  advisory_summary?: unknown;
  grounded_facts?: unknown;
  open_threads?: unknown;
  user_boundaries?: unknown;
  progress_facts?: unknown;
  resolution_candidates?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, max = 700): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function parseIsoMs(value: unknown): number | null {
  const ms = new Date(String(value ?? "")).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function isPotionSupportPayload(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  return cleanText(payload.source) === POTION_SUPPORT_SOURCE &&
    Boolean(cleanText(payload.source_potion_session_id));
}

export function evaluatePotionSupportQuietGate(input: {
  nowMs: number;
  lastExchangeAt: string | null;
  quietWindowMs?: number;
}): { allowed: boolean; nextAllowedAt: string | null } {
  const lastMs = parseIsoMs(input.lastExchangeAt);
  if (lastMs === null) return { allowed: true, nextAllowedAt: null };
  const quietWindowMs = input.quietWindowMs ?? POTION_SUPPORT_QUIET_WINDOW_MS;
  const nextMs = lastMs + quietWindowMs;
  return {
    allowed: input.nowMs >= nextMs,
    nextAllowedAt: input.nowMs >= nextMs
      ? null
      : new Date(nextMs).toISOString(),
  };
}

export async function loadLatestConversationExchangeAt(input: {
  admin: SupabaseClient;
  userId: string;
}): Promise<string | null> {
  const { data, error } = await input.admin
    .from("chat_messages")
    .select("created_at")
    .eq("user_id", input.userId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return cleanText((data as Record<string, unknown> | null)?.created_at) ||
    null;
}

function evidenceKey(ref: PotionSupportEvidenceRef): string {
  return `${ref.source_type}:${ref.source_id}:${ref.source_field ?? ""}`;
}

type EligiblePotionSupportProvenance = Exclude<
  PotionSupportEvidenceProvenance,
  "assistant_context_only"
>;

function evidenceWithProvenance(
  evidence: PotionSupportEvidence,
  provenance: PotionSupportEvidenceProvenance,
): PotionSupportEvidence {
  return { ...evidence, provenance };
}

function carriedEvidenceProvenance(
  evidence: PotionSupportEvidence,
): PotionSupportEvidenceProvenance {
  if (
    evidence.source.source_type === "chat_message" &&
    evidence.source.source_field === "assistant"
  ) return "assistant_context_only";
  if (evidence.source.source_type === "chat_message") {
    return "carried_user_evidence";
  }
  return "activation_baseline";
}

function exactMessageEvidence(row: ChatRow): PotionSupportEvidence {
  const ref: PotionSupportEvidenceRef = {
    source_type: "chat_message",
    source_id: row.id,
    source_field: row.role,
  };
  return {
    evidence_id: `chat_message:${row.id}`,
    text: cleanText(row.content, 900),
    source: ref,
    observed_at: row.created_at,
    provenance: row.role === "user"
      ? "current_user_segment"
      : "assistant_context_only",
  };
}

export function advancePotionSupportCursor(input: {
  previous: PotionSupportMessageCursor;
  messages: ChatRow[];
}): PotionSupportMessageCursor {
  if (input.messages.length === 0) return input.previous;
  const lastCreatedAt = input.messages[input.messages.length - 1]?.created_at;
  if (!lastCreatedAt) return input.previous;
  return {
    created_at: lastCreatedAt,
    ids_at_boundary: input.messages
      .filter((message) => message.created_at === lastCreatedAt)
      .map((message) => message.id),
  };
}

export async function loadPotionSupportMessagesSinceCursor(input: {
  admin: SupabaseClient;
  userId: string;
  cursor: PotionSupportMessageCursor;
  cutoffIso: string;
}): Promise<ChatRow[]> {
  const { data, error } = await input.admin
    .from("chat_messages")
    .select("id,role,content,scope,created_at")
    .eq("user_id", input.userId)
    .in("role", ["user", "assistant"])
    .gte("created_at", input.cursor.created_at)
    .lte("created_at", input.cutoffIso)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(MESSAGE_BATCH_LIMIT);
  if (error) throw error;
  const boundary = new Set(input.cursor.ids_at_boundary ?? []);
  return ((data ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
    const id = cleanText(row.id);
    const role = cleanText(row.role);
    const content = cleanText(row.content, 4_000);
    const createdAt = cleanText(row.created_at);
    if (!id || !content || !createdAt) return [];
    if (createdAt === input.cursor.created_at && boundary.has(id)) return [];
    if (role !== "user" && role !== "assistant") return [];
    return [{
      id,
      role,
      content,
      scope: cleanText(row.scope) || "unknown",
      created_at: createdAt,
    } as ChatRow];
  });
}

function refsForIds(
  value: unknown,
  evidenceById: Map<string, PotionSupportEvidence>,
): PotionSupportEvidenceRef[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const refs: PotionSupportEvidenceRef[] = [];
  for (const rawId of value) {
    const evidence = evidenceById.get(cleanText(rawId));
    if (!evidence) return null;
    refs.push(evidence.source);
  }
  return refs.filter((ref, index, all) =>
    all.findIndex((candidate) =>
      evidenceKey(candidate) === evidenceKey(ref)
    ) ===
      index
  );
}

function evidenceForRefs(
  refs: PotionSupportEvidenceRef[],
  evidenceById: Map<string, PotionSupportEvidence>,
): PotionSupportEvidence[] {
  const byRef = new Map(
    [...evidenceById.values()].map((item) => [
      evidenceKey(item.source),
      item,
    ] as const),
  );
  return refs.flatMap((ref) => {
    const evidence = byRef.get(evidenceKey(ref));
    return evidence ? [evidence] : [];
  });
}

function provenanceForRefs(
  refs: PotionSupportEvidenceRef[],
  evidenceById: Map<string, PotionSupportEvidence>,
): EligiblePotionSupportProvenance | null {
  const evidence = evidenceForRefs(refs, evidenceById);
  if (evidence.length !== refs.length) return null;
  if (evidence.some((item) => item.provenance === "current_user_segment")) {
    return "current_user_segment";
  }
  if (evidence.some((item) => item.provenance === "carried_user_evidence")) {
    return "carried_user_evidence";
  }
  if (evidence.every((item) => item.provenance === "activation_baseline")) {
    return "activation_baseline";
  }
  return null;
}

function parseGroundedItem(
  raw: unknown,
  evidenceById: Map<string, PotionSupportEvidence>,
): PotionSupportGroundedItem | null {
  if (!isRecord(raw)) return null;
  const text = cleanText(raw.text, 500);
  const refs = refsForIds(raw.evidence_ids, evidenceById);
  if (!text || !refs?.length) return null;
  // Assistant messages are useful continuity context, but never durable proof
  // of the user's state, progress, intent or boundary.
  if (
    !refs.every((ref) =>
      ref.source_type !== "chat_message" || ref.source_field === "user"
    )
  ) return null;
  const provenance = provenanceForRefs(refs, evidenceById);
  if (!provenance) return null;
  const observed = refs.flatMap((ref) =>
    [...evidenceById.values()]
      .filter((item) => evidenceKey(item.source) === evidenceKey(ref))
      .map((item) => item.observed_at)
      .filter((value): value is string => Boolean(value))
  ).sort().at(-1) ?? null;
  return {
    text,
    evidence_refs: refs,
    last_observed_at: observed,
    provenance,
  };
}

function parseBoundaryTarget(value: unknown): PotionSupportBoundaryTarget {
  const target = cleanText(value);
  return target === "potion_campaign" ||
      target === "conversation_session" ||
      target === "other_feature"
    ? target
    : "unknown";
}

function parseUserBoundaries(
  raw: unknown,
  evidenceById: Map<string, PotionSupportEvidence>,
  max: number,
): PotionSupportUserBoundary[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, max).flatMap((item) => {
    const parsed = parseGroundedItem(item, evidenceById);
    if (!parsed) return [];
    const target = isRecord(item)
      ? parseBoundaryTarget((item as ModelGroundedItem).target)
      : "unknown";
    return [{ ...parsed, target }];
  });
}

function freshCampaignBoundary(input: {
  boundaries: PotionSupportUserBoundary[];
  messages: ChatRow[];
}): PotionSupportUserBoundary | null {
  const freshUserMessageIds = new Set(
    input.messages.filter((message) => message.role === "user").map((message) =>
      message.id
    ),
  );
  return input.boundaries.find((boundary) =>
    boundary.target === "potion_campaign" &&
    boundary.evidence_refs.some((ref) =>
      ref.source_type === "chat_message" &&
      ref.source_field === "user" &&
      freshUserMessageIds.has(ref.source_id)
    )
  ) ?? null;
}

function parseGroundedItems(
  raw: unknown,
  evidenceById: Map<string, PotionSupportEvidence>,
  max: number,
): PotionSupportGroundedItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, max).flatMap((item) => {
    const parsed = parseGroundedItem(item, evidenceById);
    return parsed ? [parsed] : [];
  });
}

function parseSelectedEvidence(
  raw: unknown,
  evidenceById: Map<string, PotionSupportEvidence>,
): PotionSupportSelectedEvidence | null {
  if (!isRecord(raw)) return null;
  const text = cleanText(raw.text, 360);
  const refs = refsForIds(raw.evidence_ids, evidenceById);
  if (!text || !refs?.length) return null;
  // Assistant text may guide continuity, but it is never proof of the user's
  // state. At least one user-authored or durable structured source is required.
  const hasEligibleSource = refs.every((ref) =>
    ref.source_type !== "chat_message" || ref.source_field === "user"
  );
  const provenance = provenanceForRefs(refs, evidenceById);
  return hasEligibleSource && provenance
    ? { text, evidence_refs: refs, provenance }
    : null;
}

function parseSelectedEvidenceItems(
  raw: unknown,
  evidenceById: Map<string, PotionSupportEvidence>,
  max: number,
): PotionSupportSelectedEvidence[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, max).flatMap((item) => {
    const parsed = parseSelectedEvidence(item, evidenceById);
    return parsed ? [parsed] : [];
  });
}

function itemReferencesFreshUserMessage(
  item: PotionSupportSelectedEvidence | PotionSupportGroundedItem,
  freshUserMessageIds: Set<string>,
): boolean {
  return item.evidence_refs.some((ref) =>
    ref.source_type === "chat_message" && ref.source_field === "user" &&
    freshUserMessageIds.has(ref.source_id)
  );
}

function selectedFromGrounded(
  item: PotionSupportGroundedItem,
): PotionSupportSelectedEvidence | null {
  if (!item.provenance) return null;
  return {
    text: item.text,
    evidence_refs: item.evidence_refs,
    provenance: item.provenance,
  };
}

function normalizeCarriedLedgerItems(
  items: PotionSupportGroundedItem[],
  evidenceById: Map<string, PotionSupportEvidence>,
): PotionSupportGroundedItem[] {
  return items.flatMap((item) => {
    const provenance = provenanceForRefs(item.evidence_refs, evidenceById);
    if (!provenance) return [];
    return [{ ...item, provenance }];
  });
}

function uniqueGroundedItems(
  items: PotionSupportGroundedItem[],
): PotionSupportGroundedItem[] {
  return items.filter((item, index, all) =>
    all.findIndex((candidate) =>
      candidate.text.toLowerCase() === item.text.toLowerCase() ||
      sharesEvidence(candidate, item)
    ) === index
  );
}

function baselineCandidates(
  evidence: PotionSupportEvidence[],
): PotionSupportSelectedEvidence[] {
  const preferred = evidence.filter((item) =>
    item.source.source_type === "potion_answer" ||
    item.source.source_type === "potion_free_text"
  );
  return [...preferred, ...evidence.filter((item) => !preferred.includes(item))]
    .flatMap((item) =>
      item.source.source_type === "chat_message" &&
          item.source.source_field !== "user"
        ? []
        : [{
          text: item.text,
          evidence_refs: [item.source],
          provenance: "activation_baseline" as const,
        }]
    );
}

function selectFocus(input: {
  freshOpenThreads: PotionSupportGroundedItem[];
  progressFacts: PotionSupportSelectedEvidence[];
  carriedOpenThreads: PotionSupportGroundedItem[];
  baseline: PotionSupportSelectedEvidence[];
  hadPreviousOpenThread: boolean;
  isLaterDay: boolean;
}): PotionSupportFocusDecision | null {
  const freshThread = input.freshOpenThreads[0];
  if (freshThread) {
    const selected = selectedFromGrounded(freshThread);
    if (selected) {
      return {
        ...selected,
        kind: "unresolved_thread",
        freshness: "fresh",
        continuity: input.hadPreviousOpenThread || input.isLaterDay
          ? "evolved_thread"
          : "new_thread",
        why: "Fil utilisateur frais encore ouvert.",
      };
    }
  }
  const freshProgress = input.progressFacts.find((item) =>
    item.provenance === "current_user_segment"
  );
  if (freshProgress) {
    return {
      ...freshProgress,
      kind: "progress",
      freshness: "fresh",
      continuity: input.hadPreviousOpenThread || input.isLaterDay
        ? "evolved_thread"
        : "new_thread",
      why: "Progres utilisateur frais sans fil frais concurrent.",
    };
  }
  const carriedThread = input.carriedOpenThreads[0];
  if (carriedThread) {
    const selected = selectedFromGrounded(carriedThread);
    if (selected) {
      return {
        ...selected,
        kind: "unresolved_thread",
        freshness: "carried",
        continuity: "same_thread",
        why: "Fil utilisateur porte et toujours ouvert.",
      };
    }
  }
  const baseline = input.baseline[0];
  return baseline
    ? {
      ...baseline,
      kind: "baseline",
      freshness: "carried",
      continuity: "same_thread",
      why: "Baseline d'activation la plus specifique disponible.",
    }
    : null;
}

function sharesEvidence(
  left: PotionSupportSelectedEvidence | PotionSupportGroundedItem,
  right: PotionSupportSelectedEvidence | PotionSupportGroundedItem,
): boolean {
  const leftKeys = new Set(left.evidence_refs.map(evidenceKey));
  return right.evidence_refs.some((ref) => leftKeys.has(evidenceKey(ref)));
}

function uniqueRefs(
  refs: PotionSupportEvidenceRef[],
): PotionSupportEvidenceRef[] {
  return refs.filter((ref, index, all) =>
    all.findIndex((candidate) =>
      evidenceKey(candidate) === evidenceKey(ref)
    ) ===
      index
  );
}

function parseModelJson(raw: unknown): ModelPreparation | null {
  if (isRecord(raw)) return raw as ModelPreparation;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(
      raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim(),
    );
    return isRecord(parsed) ? parsed as ModelPreparation : null;
  } catch {
    return null;
  }
}

function modelPrompt(input: {
  context: PotionSupportContextV1;
  evidence: PotionSupportEvidence[];
  messages: ChatRow[];
  dayIndex: number;
}): string {
  const evidence = input.evidence.map((item) => ({
    evidence_id: item.evidence_id,
    text: item.text,
    source: item.source,
    observed_at: item.observed_at,
    provenance: item.provenance,
    eligible_visible_anchor: item.source.source_type !== "chat_message" ||
      item.source.source_field === "user",
  }));
  return JSON.stringify({
    task: "prepare_potion_support_opening",
    day_index: input.dayIndex,
    objective_advisory_only: input.context.objective,
    previous_ledger_advisory_only: input.context.cumulative_ledger,
    previous_openings: input.context.opening_history.slice(-6),
    evidence,
    new_messages: input.messages.map((message) => ({
      id: message.id,
      role: message.role,
      scope: message.scope,
      content: message.content,
      created_at: message.created_at,
    })),
  });
}

const SYSTEM_PROMPT = [
  "Tu es le reducer sémantique d'une ouverture proactive de soutien émotionnel de Sophia.",
  "Tu extrais des unités sourcées; le serveur sélectionne ensuite le prochain focus. Tu ne rédiges jamais le message visible.",
  "Le résumé et l'objectif sont ADVISORY: ils aident à choisir un angle mais ne constituent jamais une preuve surfacable.",
  "Tout focus ou progrès transmis au rédacteur doit reposer sur des evidence_id fournis.",
  "Les messages assistant servent seulement à éviter les répétitions; ils ne prouvent jamais l'état du user.",
  "N'invente aucune évolution, émotion actuelle, événement, intention ou résultat.",
  "Extrais tous les fils utilisateur encore ouverts et tous les progrès utiles; n'en choisis pas un toi-meme.",
  "Un ancien angle ne peut être présenté comme évolué que si une preuve user fraîche montre réellement cette évolution.",
  "progress_facts contient uniquement des progrès utiles sous forme {text,evidence_ids}.",
  "resolution_candidates contient uniquement une resolution COMPLETE et explicite du sujet, sous forme {text,evidence_ids}. Cite le message user frais de resolution et, pour fermer un fil porte, la preuve historique de ce fil. Une amelioration partielle n'est jamais une resolution.",
  "Une boundary doit toujours être ciblée: target=potion_campaign seulement si le user demande explicitement d'arrêter les futurs messages/check-ins de CETTE potion; target=conversation_session s'il clôt seulement l'échange courant; target=other_feature s'il refuse une carte, un rappel, un plan, une création ou un autre dispositif; sinon target=unknown.",
  "Un refus de carte/création/conseil, 'pas aujourd'hui', 'je m'arrête là pour ce soir' ou 'je voulais juste te tenir au courant' n'annule jamais la campagne potion.",
  "N'utilise que des ids présents et eligible_visible_anchor=true.",
  "advisory_summary peut résumer l'évolution mais ne sera jamais affiché verbatim.",
  "grounded_facts/open_threads sont des listes de {text,evidence_ids}. user_boundaries est une liste de {text,evidence_ids,target}; omets ce qui n'est pas sourcé.",
  "Réponds uniquement en JSON avec: advisory_summary, grounded_facts, open_threads, user_boundaries, progress_facts, resolution_candidates.",
].join("\n");

export async function preparePotionSupportOpening(input: {
  admin: SupabaseClient;
  userId: string;
  sessionId: string;
  dayIndex: number;
  nowIso?: string;
  requestId?: string;
  llmRunner?: (systemPrompt: string, userPrompt: string) => Promise<unknown>;
  visibleAgentRunner?: (
    systemPrompt: string,
    userPrompt: string,
  ) => Promise<unknown>;
}): Promise<PotionSupportPreparation> {
  const cutoffIso = input.nowIso ?? new Date().toISOString();
  const { data: session, error } = await input.admin
    .from("user_potion_sessions")
    .select("id,metadata")
    .eq("id", input.sessionId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (error) throw error;
  const context = readPotionSupportContext(
    (session as Record<string, unknown> | null)?.metadata,
  );
  if (!context) throw new Error("potion_support_context_missing");

  const messages = await loadPotionSupportMessagesSinceCursor({
    admin: input.admin,
    userId: input.userId,
    cursor: context.message_cursor,
    cutoffIso,
  });
  const baselineEvidence = context.baseline_evidence.map((item) =>
    evidenceWithProvenance(item, "activation_baseline")
  );
  const carriedEvidence = (context.rolling_evidence ?? []).map((item) =>
    evidenceWithProvenance(item, carriedEvidenceProvenance(item))
  );
  const messageEvidence = messages.map(exactMessageEvidence);
  const rollingEvidenceForPass = [
    ...carriedEvidence,
    ...messageEvidence,
  ].filter((item, index, all) =>
    all.findIndex((candidate) => candidate.evidence_id === item.evidence_id) ===
      index
  ).slice(-ROLLING_EVIDENCE_LIMIT);
  const rollingEvidenceForPersistence = rollingEvidenceForPass.map((item) =>
    evidenceWithProvenance(item, carriedEvidenceProvenance(item))
  );
  const allEvidence = [...baselineEvidence, ...rollingEvidenceForPass];
  const evidenceById = new Map(
    allEvidence.map((item) => [item.evidence_id, item] as const),
  );

  const raw = input.llmRunner
    ? await input.llmRunner(
      SYSTEM_PROMPT,
      modelPrompt({
        context,
        evidence: allEvidence,
        messages,
        dayIndex: input.dayIndex,
      }),
    )
    : await generateWithGemini(
      SYSTEM_PROMPT,
      modelPrompt({
        context,
        evidence: allEvidence,
        messages,
        dayIndex: input.dayIndex,
      }),
      0.25,
      true,
      [],
      "auto",
      {
        requestId: input.requestId,
        userId: input.userId,
        source: "potion-support-opening-v1",
        model: getGlobalAiModel("gemini-2.5-flash"),
        maxRetries: 1,
        httpTimeoutMs: 20_000,
      },
    );
  const parsed = parseModelJson(raw);
  const progressFacts = parseSelectedEvidenceItems(
    parsed?.progress_facts,
    evidenceById,
    4,
  );
  const userBoundaries = parseUserBoundaries(
    parsed?.user_boundaries,
    evidenceById,
    8,
  );
  const groundedFacts = parseGroundedItems(
    parsed?.grounded_facts,
    evidenceById,
    20,
  );
  const extractedOpenThreads = parseGroundedItems(
    parsed?.open_threads,
    evidenceById,
    12,
  );
  const resolutionCandidates = parseSelectedEvidenceItems(
    parsed?.resolution_candidates,
    evidenceById,
    4,
  ).filter((candidate) =>
    candidate.provenance === "current_user_segment"
  );
  const campaignBoundary = freshCampaignBoundary({
    boundaries: userBoundaries,
    messages,
  });
  const freshUserMessageIds = new Set(
    messages.filter((message) => message.role === "user").map((message) =>
      message.id
    ),
  );
  const freshOpenThreads = extractedOpenThreads.filter((thread) =>
    itemReferencesFreshUserMessage(thread, freshUserMessageIds)
  );
  const previousOpenThreads = normalizeCarriedLedgerItems(
    context.cumulative_ledger.open_threads ?? [],
    evidenceById,
  );
  const resolvedPreviousThreads = new Set(
    previousOpenThreads.filter((thread) =>
      resolutionCandidates.some((resolution) =>
        sharesEvidence(thread, resolution)
      )
    ).map((thread) => thread.text.toLowerCase()),
  );
  const carriedOpenThreads = previousOpenThreads.filter((thread) =>
    !resolvedPreviousThreads.has(thread.text.toLowerCase())
  );
  const openThreads = uniqueGroundedItems([
    ...freshOpenThreads,
    ...extractedOpenThreads.filter((thread) =>
      !itemReferencesFreshUserMessage(thread, freshUserMessageIds)
    ),
    ...carriedOpenThreads,
  ]);
  const focus = selectFocus({
    freshOpenThreads,
    progressFacts,
    carriedOpenThreads: openThreads.filter((thread) =>
      !itemReferencesFreshUserMessage(thread, freshUserMessageIds)
    ),
    baseline: baselineCandidates(baselineEvidence),
    hadPreviousOpenThread: previousOpenThreads.length > 0,
    isLaterDay: input.dayIndex > 1,
  });
  const validResolution = resolutionCandidates.length > 0 &&
    openThreads.length === 0;
  let decision: PotionSupportPreparationDecision = campaignBoundary
    ? "skip_user_boundary"
    : validResolution
    ? "skip_resolved"
    : focus
    ? "send"
    : "skip_no_grounding";

  const ledgerAfter: PotionSupportLedger = {
    grounded_facts: uniqueGroundedItems([
      ...normalizeCarriedLedgerItems(
        context.cumulative_ledger.grounded_facts ?? [],
        evidenceById,
      ),
      ...groundedFacts,
    ]),
    open_threads: openThreads,
    user_boundaries: [
      ...(context.cumulative_ledger.user_boundaries ?? []),
      ...userBoundaries,
    ].slice(-12),
    advisory_summary: cleanText(parsed?.advisory_summary, 1_200) || null,
  };
  const nextCursor = advancePotionSupportCursor({
    previous: context.message_cursor,
    messages,
  });
  const contextAfter: PotionSupportContextV1 = {
    ...context,
    rolling_evidence: rollingEvidenceForPersistence,
    cumulative_ledger: ledgerAfter,
    message_cursor: nextCursor,
  };

  let visibleTask: PotionSupportVisibleTask | null = null;
  let openingText: string | null = null;
  let question: PotionSupportSelectedEvidence | null = null;
  const openingEvidenceRefs = focus
    ? uniqueRefs([
      ...focus.evidence_refs,
      ...progressFacts.flatMap((fact) => fact.evidence_refs),
    ])
    : [];
  if (decision === "send" && focus) {
    visibleTask = {
      kind: "potion_support_opening",
      day_index: input.dayIndex,
      focus: {
        kind: focus.kind,
        text: focus.text,
        freshness: focus.freshness,
        continuity: focus.continuity,
      },
      progress_facts: progressFacts.map((fact) => ({ text: fact.text })),
      continuity: {
        previous_openings: context.opening_history
          .slice(-3)
          .flatMap((item) => item.opening_text ? [item.opening_text] : []),
      },
    };
    const visible = await renderPotionSupportOpening({
      task: visibleTask,
      userId: input.userId,
      requestId: input.requestId,
      runner: input.visibleAgentRunner,
    });
    if (!visible) {
      decision = "skip_no_grounding";
      visibleTask = null;
    } else {
      openingText = visible.opening_text;
      question = visible.question_text
        ? {
          text: visible.question_text,
          evidence_refs: openingEvidenceRefs,
          provenance: focus.provenance,
        }
        : null;
    }
  }
  return {
    decision,
    boundary_target: campaignBoundary?.target ??
      userBoundaries.at(-1)?.target ?? null,
    cumulative_ledger_after: ledgerAfter,
    context_after: contextAfter,
    focus_decision: focus,
    progress_facts: progressFacts,
    visible_task: visibleTask,
    opening_evidence_refs: decision === "send" ? openingEvidenceRefs : [],
    anchor_fact: focus,
    question_candidate: question,
    opening_text: openingText,
    read_cutoff: cutoffIso,
    integrated_message_ids: messages.map((message) => message.id),
  };
}

export async function persistPotionSupportContext(input: {
  admin: SupabaseClient;
  userId: string;
  sessionId: string;
  context: PotionSupportContextV1;
  nowIso: string;
}) {
  const { data: fresh, error: loadError } = await input.admin
    .from("user_potion_sessions")
    .select("metadata")
    .eq("id", input.sessionId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (loadError) throw loadError;
  const currentMetadata = isRecord(
      (fresh as Record<string, unknown> | null)?.metadata,
    )
    ? (fresh as Record<string, unknown>).metadata as Record<string, unknown>
    : {};
  const { error } = await input.admin
    .from("user_potion_sessions")
    .update({
      metadata: {
        ...currentMetadata,
        potion_support_v1: input.context,
      },
      last_updated_at: input.nowIso,
    })
    .eq("id", input.sessionId)
    .eq("user_id", input.userId);
  if (error) throw error;
}
