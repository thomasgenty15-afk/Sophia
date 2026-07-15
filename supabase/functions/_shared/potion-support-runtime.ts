import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { generateWithGemini, getGlobalAiModel } from "./gemini.ts";
import {
  POTION_SUPPORT_SOURCE,
  type PotionSupportContextV1,
  type PotionSupportEvidence,
  type PotionSupportEvidenceRef,
  type PotionSupportGroundedItem,
  type PotionSupportLedger,
  type PotionSupportMessageCursor,
  readPotionSupportContext,
} from "./potion-support-context.ts";

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
};

export type PotionSupportPreparationDecision =
  | "send"
  | "skip_no_grounding"
  | "skip_resolved"
  | "skip_user_boundary";

export type PotionSupportPreparation = {
  decision: PotionSupportPreparationDecision;
  cumulative_ledger_after: PotionSupportLedger;
  context_after: PotionSupportContextV1;
  anchor_fact: PotionSupportSelectedEvidence | null;
  question_candidate: PotionSupportSelectedEvidence | null;
  opening_text: string | null;
  read_cutoff: string;
  integrated_message_ids: string[];
};

type ModelGroundedItem = {
  text?: unknown;
  evidence_ids?: unknown;
};

type ModelPreparation = {
  decision?: unknown;
  advisory_summary?: unknown;
  grounded_facts?: unknown;
  open_threads?: unknown;
  user_boundaries?: unknown;
  anchor_fact?: unknown;
  question_candidate?: unknown;
  opening_text?: unknown;
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

function parseGroundedItem(
  raw: unknown,
  evidenceById: Map<string, PotionSupportEvidence>,
): PotionSupportGroundedItem | null {
  if (!isRecord(raw)) return null;
  const text = cleanText(raw.text, 500);
  const refs = refsForIds(raw.evidence_ids, evidenceById);
  if (!text || !refs?.length) return null;
  const observed = refs.flatMap((ref) =>
    [...evidenceById.values()]
      .filter((item) => evidenceKey(item.source) === evidenceKey(ref))
      .map((item) => item.observed_at)
      .filter((value): value is string => Boolean(value))
  ).sort().at(-1) ?? null;
  return { text, evidence_refs: refs, last_observed_at: observed };
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
  return hasEligibleSource ? { text, evidence_refs: refs } : null;
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
  "Tu prépares une ouverture proactive de soutien émotionnel de Sophia.",
  "Tu n'écris pas une potion, une fiche, un conseil produit ou un diagnostic.",
  "Le résumé et l'objectif sont ADVISORY: ils aident à choisir un angle mais ne constituent jamais une preuve surfacable.",
  "Toute affirmation visible et toute question contextualisée doivent reposer sur des evidence_id fournis.",
  "Les messages assistant servent seulement à éviter les répétitions; ils ne prouvent jamais l'état du user.",
  "N'invente aucune évolution, émotion actuelle, événement, intention ou résultat.",
  "Si rien de précis et utile n'est solidement ancré, decision=skip_no_grounding.",
  "Si l'échange montre explicitement que le sujet est résolu, decision=skip_resolved.",
  "Si le user demande explicitement de l'espace ou l'arrêt de ces sollicitations, decision=skip_user_boundary.",
  "Sinon decision=send. opening_text fait 1 à 3 phrases, proportionnelles, avec au maximum une question réellement utile.",
  "anchor_fact et question_candidate contiennent {text,evidence_ids}. N'utilise que des ids présents et eligible_visible_anchor=true.",
  "advisory_summary peut résumer l'évolution mais ne sera jamais affiché verbatim.",
  "grounded_facts/open_threads/user_boundaries sont des listes de {text,evidence_ids}; omets ce qui n'est pas sourcé.",
  "Réponds uniquement en JSON avec: decision, advisory_summary, grounded_facts, open_threads, user_boundaries, anchor_fact, question_candidate, opening_text.",
].join("\n");

export async function preparePotionSupportOpening(input: {
  admin: SupabaseClient;
  userId: string;
  sessionId: string;
  dayIndex: number;
  nowIso?: string;
  requestId?: string;
  llmRunner?: (systemPrompt: string, userPrompt: string) => Promise<unknown>;
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
  const messageEvidence = messages.map(exactMessageEvidence);
  const rollingEvidence = [
    ...(context.rolling_evidence ?? []),
    ...messageEvidence,
  ].filter((item, index, all) =>
    all.findIndex((candidate) => candidate.evidence_id === item.evidence_id) ===
      index
  ).slice(-ROLLING_EVIDENCE_LIMIT);
  const allEvidence = [...context.baseline_evidence, ...rollingEvidence];
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
  const decisionRaw = cleanText(parsed?.decision);
  const allowedDecisions = new Set<PotionSupportPreparationDecision>([
    "send",
    "skip_no_grounding",
    "skip_resolved",
    "skip_user_boundary",
  ]);
  let decision =
    allowedDecisions.has(decisionRaw as PotionSupportPreparationDecision)
      ? decisionRaw as PotionSupportPreparationDecision
      : "skip_no_grounding";
  const anchor = parseSelectedEvidence(parsed?.anchor_fact, evidenceById);
  const question = parseSelectedEvidence(
    parsed?.question_candidate,
    evidenceById,
  );
  let openingText = cleanText(parsed?.opening_text, 520) || null;
  if (decision === "send" && (!anchor || !openingText)) {
    decision = "skip_no_grounding";
    openingText = null;
  }
  if (decision !== "send") openingText = null;

  const ledgerAfter: PotionSupportLedger = {
    grounded_facts: parseGroundedItems(
      parsed?.grounded_facts,
      evidenceById,
      20,
    ),
    open_threads: parseGroundedItems(parsed?.open_threads, evidenceById, 12),
    user_boundaries: parseGroundedItems(
      parsed?.user_boundaries,
      evidenceById,
      8,
    ),
    advisory_summary: cleanText(parsed?.advisory_summary, 1_200) || null,
  };
  const nextCursor = advancePotionSupportCursor({
    previous: context.message_cursor,
    messages,
  });
  const contextAfter: PotionSupportContextV1 = {
    ...context,
    rolling_evidence: rollingEvidence,
    cumulative_ledger: ledgerAfter,
    message_cursor: nextCursor,
  };
  return {
    decision,
    cumulative_ledger_after: ledgerAfter,
    context_after: contextAfter,
    anchor_fact: anchor,
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
