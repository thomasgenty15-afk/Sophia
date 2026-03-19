import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { generateWithGemini } from "../_shared/gemini.ts";
import { processCoreIdentity } from "../_shared/identity-manager.ts";
import { WEEKS_CONTENT } from "../_shared/weeksContent.ts";
import {
  type MemoryProvenanceRef,
  sanitizeMemoryProvenance,
} from "./memory_provenance.ts";
import { processTopicsFromWatcher } from "./topic_memory.ts";

type ArchitectSourceKind = "module" | "round_table";
type ArchitectUpdateKind =
  | "creation"
  | "precision"
  | "correction"
  | "contradiction";

type IdentityShiftDecision = {
  shouldUpdate: boolean;
  confidence: number;
  reason: string;
};

type ArchitectIngestionResult = {
  processed: boolean;
  skipped: boolean;
  reason: string;
  topicsCreated: number;
  topicsEnriched: number;
  topicsNoop: number;
  eventsCreated: number;
  eventsUpdated: number;
  eventsNoop: number;
  globalMemoriesCreated: number;
  globalMemoriesUpdated: number;
  globalMemoriesNoop: number;
  globalMemoriesPendingCompaction: number;
  identityUpdated: boolean;
  identityReason?: string;
  provenance?: MemoryProvenanceRef | null;
};

const IDENTITY_SHIFT_MODEL =
  (Deno.env.get("SOPHIA_ARCHITECT_IDENTITY_SHIFT_MODEL") ??
    "gemini-3-flash-preview")
    .trim() || "gemini-3-flash-preview";

function compactText(value: unknown, maxLen = 800): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 1).trim()}…`;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function tokenize(value: unknown): Set<string> {
  return new Set(
    normalizeText(value)
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const v of a) if (b.has(v)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

function stripFence(text: string): string {
  return String(text ?? "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const candidates = [String(text ?? "").trim(), stripFence(text)];
  const raw = String(text ?? "");
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function extractStructuredText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map((item) => extractStructuredText(item)).filter(Boolean).join(
      "\n",
    ).trim();
  }
  if (!value || typeof value !== "object") {
    return compactText(value, 1200);
  }
  const row = value as Record<string, unknown>;
  const direct = extractStructuredText(row.content ?? row.answer ?? row.text);
  if (direct) return direct;
  return Object.entries(row)
    .filter(([key]) => key !== "id" && key !== "module_id")
    .map(([key, raw]) => {
      const text = extractStructuredText(raw);
      return text ? `${key}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function deriveWeekNumFromModuleId(moduleId: string): number | null {
  const moduleMatch = String(moduleId ?? "").match(/^a(\d+)_/);
  if (moduleMatch) return Number(moduleMatch[1]);
  const weekMatch = String(moduleId ?? "").match(/^week_(\d+)$/);
  if (weekMatch) return Number(weekMatch[1]);
  return null;
}

function findModuleQuestion(moduleId: string): {
  canonicalId: string | null;
  questionText: string | null;
} {
  const moduleKey = String(moduleId ?? "").trim();
  if (!moduleKey) return { canonicalId: null, questionText: null };
  for (const week of Object.values(WEEKS_CONTENT as Record<string, unknown>)) {
    const subQuestions = Array.isArray((week as any)?.subQuestions)
      ? (week as any).subQuestions
      : [];
    const match = subQuestions.find((sq: any) =>
      String(moduleKey) === String(sq?.id ?? "") ||
      String(moduleKey).startsWith(`${String(sq?.id ?? "")}_`)
    );
    if (!match) continue;
    const questionText = [
      compactText(match.question, 200),
      compactText(match.placeholder, 180),
    ].filter(Boolean).join(" | ");
    return {
      canonicalId: String(match.id ?? "").trim() || null,
      questionText: questionText || null,
    };
  }
  return { canonicalId: null, questionText: null };
}

export function classifyArchitectUpdateKind(
  oldText: string,
  newText: string,
): ArchitectUpdateKind {
  const previous = normalizeText(oldText);
  const current = normalizeText(newText);
  if (!previous) return "creation";
  if (!current || previous === current) return "precision";
  if (current.includes(previous) && current.length >= previous.length + 24) {
    return "precision";
  }

  const overlap = jaccard(tokenize(previous), tokenize(current));
  const negationChanged =
    /\b(ne|pas|jamais|plus|aucun|rien)\b/.test(previous) !==
      /\b(ne|pas|jamais|plus|aucun|rien)\b/.test(current);
  if (negationChanged && overlap >= 0.2) return "contradiction";
  if (overlap < 0.16) return "contradiction";
  if (overlap >= 0.58) return "precision";
  return "correction";
}

function isTrivialReformulation(oldText: string, newText: string): boolean {
  const previous = normalizeText(oldText);
  const current = normalizeText(newText);
  if (!previous || !current) return false;
  if (previous === current) return true;
  const overlap = jaccard(tokenize(previous), tokenize(current));
  return overlap >= 0.92;
}

function buildRoundTableText(record: Record<string, unknown>): string {
  const lines = [
    `Énergie: ${compactText(record.energy_level, 80)}/100`,
    `Victoires: ${compactText(record.wins_3, 600)}`,
    `Blocage principal: ${compactText(record.main_blocker, 400)}`,
    `Alignement identitaire: ${compactText(record.identity_alignment, 120)}`,
    `Intention de semaine: ${compactText(record.week_intention, 400)}`,
  ].filter((line) => !line.endsWith(": "));
  return lines.join("\n").trim();
}

function buildArchitectProvenance(params: {
  kind: ArchitectSourceKind;
  tableName: string;
  record: Record<string, unknown>;
  updateKind: ArchitectUpdateKind;
  questionText?: string | null;
  canonicalQuestionId?: string | null;
  weekNum?: number | null;
  triggerOp?: string | null;
}): MemoryProvenanceRef | null {
  return sanitizeMemoryProvenance({
    source_family: "architect",
    source_kind: params.kind,
    source_table: params.tableName,
    source_id: params.record.id ?? null,
    module_id: params.record.module_id ?? null,
    week_id: params.weekNum ? `week_${params.weekNum}` : null,
    axis_week: params.weekNum ?? null,
    question_id: params.canonicalQuestionId ?? params.record.module_id ?? null,
    question_text: params.questionText ?? null,
    update_kind: params.updateKind,
    trigger_op: params.triggerOp ?? null,
  });
}

function buildArchitectCurrentContext(params: {
  kind: ArchitectSourceKind;
  tableName: string;
  updateKind: ArchitectUpdateKind;
  moduleId: string;
  weekNum?: number | null;
  questionText?: string | null;
  oldText?: string;
  newText: string;
}): string {
  const lines = [
    "INGESTION MÉMOIRE DEPUIS MODULE ARCHITECTE",
    `source_kind=${params.kind}`,
    `source_table=${params.tableName}`,
    `module_id=${params.moduleId}`,
    `week_id=${params.weekNum ? `week_${params.weekNum}` : "unknown"}`,
    `update_kind=${params.updateKind}`,
    params.questionText ? `question=${params.questionText}` : "",
    params.oldText
      ? `ancienne_version=${compactText(params.oldText, 500)}`
      : "ancienne_version=(vide)",
    `nouvelle_version=${compactText(params.newText, 700)}`,
    "Consigne: ne retiens que les vraies nouveautés, précisions, corrections ou contradictions. Ignore les simples reformulations.",
  ].filter(Boolean);
  return lines.join("\n");
}

async function detectIdentityShiftFromArchitectChange(params: {
  supabase: SupabaseClient;
  userId: string;
  weekNum: number;
  moduleId: string;
  questionText?: string | null;
  oldText: string;
  newText: string;
  updateKind: ArchitectUpdateKind;
  memoryCounts: {
    topicsCreated: number;
    topicsEnriched: number;
    eventsCreated: number;
    eventsUpdated: number;
    globalMemoriesCreated: number;
    globalMemoriesUpdated: number;
  };
  requestId?: string;
}): Promise<IdentityShiftDecision> {
  const { data: identityRow } = await params.supabase
    .from("user_core_identity")
    .select("id, content")
    .eq("user_id", params.userId)
    .eq("week_id", `week_${params.weekNum}`)
    .maybeSingle();

  if (!identityRow) {
    return {
      shouldUpdate: false,
      confidence: 0,
      reason: "no_existing_identity_for_week",
    };
  }

  const fallbackHeuristic = (): IdentityShiftDecision => {
    const overlap = jaccard(tokenize(params.oldText), tokenize(params.newText));
    const strongPrimaryMemoryDelta =
      params.memoryCounts.globalMemoriesCreated +
        params.memoryCounts.globalMemoriesUpdated +
        params.memoryCounts.topicsCreated +
        params.memoryCounts.topicsEnriched >
      0;
    const shouldUpdate =
      strongPrimaryMemoryDelta &&
      params.updateKind === "contradiction" &&
      params.newText.length >= 120 &&
      overlap <= 0.45;
    return {
      shouldUpdate,
      confidence: shouldUpdate ? 0.62 : 0.28,
      reason: shouldUpdate
        ? "fallback_heuristic_contradiction"
        : "fallback_heuristic_no_shift",
    };
  };

  const systemPrompt = `
Tu décides si une modification d'un module Architecte doit déclencher une mise à jour de la core identity.

La core identity ne doit être mise à jour QUE si le changement modifie réellement la lecture profonde de la personne:
- valeurs
- peurs structurantes
- désirs profonds
- principes directeurs
- récit identitaire central
- pattern psychologique durable

Ne déclenche PAS si c'est surtout:
- un fait concret
- un projet précis
- un événement ponctuel
- une simple reformulation
- une précision tactique sans impact identitaire profond

Réponds en JSON strict:
{
  "should_update_core_identity": boolean,
  "confidence": number,
  "reason": "string"
}
`.trim();

  const userPrompt = JSON.stringify({
    week_id: `week_${params.weekNum}`,
    module_id: params.moduleId,
    question: params.questionText ?? null,
    update_kind: params.updateKind,
    previous_identity: String((identityRow as any)?.content ?? "").trim(),
    old_answer: compactText(params.oldText, 1000),
    new_answer: compactText(params.newText, 1000),
    primary_memory_delta: params.memoryCounts,
  });

  try {
    const raw = await generateWithGemini(
      systemPrompt,
      userPrompt,
      0.1,
      true,
      [],
      "json",
      {
        requestId: params.requestId,
        model: IDENTITY_SHIFT_MODEL,
        source: "architect-memory:identity-shift",
        userId: params.userId,
      },
    );
    const parsed = typeof raw === "string" ? extractJsonObject(raw) : null;
    if (!parsed) return fallbackHeuristic();
    return {
      shouldUpdate: Boolean(parsed.should_update_core_identity),
      confidence: Math.max(
        0,
        Math.min(1, Number(parsed.confidence ?? 0.5) || 0.5),
      ),
      reason: compactText(parsed.reason, 220) || "identity_shift_decision",
    };
  } catch {
    return fallbackHeuristic();
  }
}

export async function ingestArchitectMemorySource(params: {
  supabase: SupabaseClient;
  tableName: string;
  record: Record<string, unknown>;
  oldRecord?: Record<string, unknown> | null;
  requestId?: string;
  triggerCoreIdentity?: boolean;
}): Promise<ArchitectIngestionResult> {
  const record = params.record ?? {};
  const userId = String(record.user_id ?? "").trim();
  const moduleId = String(record.module_id ?? "").trim();
  if (!userId || !moduleId) {
    return {
      processed: false,
      skipped: true,
      reason: "missing_user_or_module",
      topicsCreated: 0,
      topicsEnriched: 0,
      topicsNoop: 0,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsNoop: 0,
      globalMemoriesCreated: 0,
      globalMemoriesUpdated: 0,
      globalMemoriesNoop: 0,
      globalMemoriesPendingCompaction: 0,
      identityUpdated: false,
      provenance: null,
    };
  }

  const tableName = String(params.tableName ?? "").trim() ||
    "user_module_state_entries";
  const kind: ArchitectSourceKind = tableName === "user_round_table_entries"
    ? "round_table"
    : "module";

  const newText = kind === "round_table"
    ? buildRoundTableText(record)
    : extractStructuredText(record.content);
  const oldText = kind === "round_table"
    ? buildRoundTableText((params.oldRecord ?? {}) as Record<string, unknown>)
    : extractStructuredText((params.oldRecord ?? {}).content);

  if (newText.length < 20) {
    return {
      processed: false,
      skipped: true,
      reason: "content_too_short",
      topicsCreated: 0,
      topicsEnriched: 0,
      topicsNoop: 0,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsNoop: 0,
      globalMemoriesCreated: 0,
      globalMemoriesUpdated: 0,
      globalMemoriesNoop: 0,
      globalMemoriesPendingCompaction: 0,
      identityUpdated: false,
      provenance: null,
    };
  }

  if (oldText && isTrivialReformulation(oldText, newText)) {
    return {
      processed: false,
      skipped: true,
      reason: "trivial_reformulation",
      topicsCreated: 0,
      topicsEnriched: 0,
      topicsNoop: 0,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsNoop: 0,
      globalMemoriesCreated: 0,
      globalMemoriesUpdated: 0,
      globalMemoriesNoop: 0,
      globalMemoriesPendingCompaction: 0,
      identityUpdated: false,
      provenance: null,
    };
  }

  const weekNum = deriveWeekNumFromModuleId(moduleId);
  const questionContext = kind === "module" ? findModuleQuestion(moduleId) : {
    canonicalId: null,
    questionText: `Table ronde ${moduleId}`,
  };
  const updateKind = classifyArchitectUpdateKind(oldText, newText);
  const provenance = buildArchitectProvenance({
    kind,
    tableName,
    record,
    updateKind,
    questionText: questionContext.questionText,
    canonicalQuestionId: questionContext.canonicalId,
    weekNum,
    triggerOp: params.oldRecord ? "update" : "insert",
  });

  const transcript = kind === "round_table"
    ? [
      "USER: Table ronde hebdomadaire Architecte",
      `USER: ${newText}`,
    ].join("\n")
    : [
      "USER: Module Architecte",
      questionContext.questionText
        ? `USER: Question du module: ${questionContext.questionText}`
        : "",
      `USER: Réponse actuelle: ${newText}`,
    ].filter(Boolean).join("\n");

  const currentContext = buildArchitectCurrentContext({
    kind,
    tableName,
    moduleId,
    weekNum,
    updateKind,
    questionText: questionContext.questionText,
    oldText,
    newText,
  });

  const result = await processTopicsFromWatcher({
    supabase: params.supabase,
    userId,
    transcript,
    currentContext,
    sourceType: "module",
    provenance: provenance ?? undefined,
    meta: {
      requestId: params.requestId,
    },
  });

  let identityUpdated = false;
  let identityReason = "not_checked";
  if (
    params.triggerCoreIdentity !== false && kind === "module" && weekNum &&
    oldText && oldText !== newText
  ) {
    const shift = await detectIdentityShiftFromArchitectChange({
      supabase: params.supabase,
      userId,
      weekNum,
      moduleId,
      questionText: questionContext.questionText,
      oldText,
      newText,
      updateKind,
      requestId: params.requestId,
      memoryCounts: {
        topicsCreated: result.topicsCreated,
        topicsEnriched: result.topicsEnriched,
        eventsCreated: result.eventsCreated,
        eventsUpdated: result.eventsUpdated,
        globalMemoriesCreated: result.globalMemoriesCreated,
        globalMemoriesUpdated: result.globalMemoriesUpdated,
      },
    });
    identityReason = shift.reason;
    if (shift.shouldUpdate) {
      const identityRes = await processCoreIdentity(
        params.supabase as any,
        userId,
        weekNum,
        "update_forge",
        { requestId: params.requestId },
      );
      identityUpdated = Boolean(identityRes.created || identityRes.updated);
      identityReason = identityUpdated
        ? `identity_shift:${shift.reason}`
        : `identity_shift_noop:${shift.reason}`;
    }
  }

  return {
    processed: true,
    skipped: false,
    reason: "ok",
    ...result,
    identityUpdated,
    identityReason,
    provenance,
  };
}
