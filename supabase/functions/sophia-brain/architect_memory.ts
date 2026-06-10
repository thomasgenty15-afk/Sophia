import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { generateWithGemini } from "../_shared/gemini.ts";
import { processCoreIdentity } from "../_shared/identity-manager.ts";
import { logMemoryObservabilityEvent } from "../_shared/memory-observability.ts";
import { WEEKS_CONTENT } from "../_shared/weeksContent.ts";
import {
  type MemoryProvenanceRef,
  sanitizeMemoryProvenance,
} from "./memory_provenance.ts";

type ArchitectSourceKind = "module";
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
  const raw = String(moduleId ?? "").trim();
  const suffix = raw.startsWith("a")
    ? raw.slice(1).split("_")[0]
    : raw.startsWith("week_")
    ? raw.slice("week_".length)
    : "";
  if (suffix && [...suffix].every((char) => char >= "0" && char <= "9")) {
    return Number(suffix);
  }
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
  void newText;
  return String(oldText ?? "").trim() ? "correction" : "creation";
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

  const neutralIdentityShiftDecision = (): IdentityShiftDecision => {
    return {
      shouldUpdate: false,
      confidence: 0,
      reason: "identity_shift_ai_unavailable",
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
    if (!parsed) return neutralIdentityShiftDecision();
    return {
      shouldUpdate: Boolean(parsed.should_update_core_identity),
      confidence: Math.max(
        0,
        Math.min(1, Number(parsed.confidence ?? 0.5) || 0.5),
      ),
      reason: compactText(parsed.reason, 220) || "identity_shift_decision",
    };
  } catch {
    return neutralIdentityShiftDecision();
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
  const emitIngestionEvent = async (
    payload: Record<string, unknown>,
  ): Promise<void> => {
    if (!userId) return;
    await logMemoryObservabilityEvent({
      supabase: params.supabase,
      userId,
      requestId: params.requestId ?? null,
      sourceComponent: "architect_memory",
      eventName: "architect_memory.ingestion_completed",
      payload,
    });
  };
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
  const kind: ArchitectSourceKind = "module";

  const newText = extractStructuredText(record.content);
  const oldText = extractStructuredText((params.oldRecord ?? {}).content);

  if (newText.length < 20) {
    const result = {
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
    await emitIngestionEvent({
      source_type: kind,
      table_name: tableName,
      module_id: moduleId,
      reason: result.reason,
      skipped: result.skipped,
      processed: result.processed,
    });
    return result;
  }

  const weekNum = deriveWeekNumFromModuleId(moduleId);
  const questionContext = findModuleQuestion(moduleId);
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

  const transcript = [
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

  void transcript;
  void currentContext;
  const result: ArchitectIngestionResult = {
    processed: false,
    skipped: true,
    reason: "memory_v2_only_module_ingestion_pending",
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
    provenance,
  };

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

  const ingestionResult = {
    processed: true,
    skipped: false,
    reason: "ok",
    ...result,
    identityUpdated,
    identityReason,
    provenance,
  };
  await emitIngestionEvent({
      source_type: kind,
      table_name: tableName,
      module_id: moduleId,
      week_num: weekNum ?? null,
      update_kind: updateKind,
      reason: ingestionResult.reason,
      skipped: ingestionResult.skipped,
      processed: ingestionResult.processed,
      counts: {
        topics_created: ingestionResult.topicsCreated,
        topics_enriched: ingestionResult.topicsEnriched,
        topics_noop: ingestionResult.topicsNoop,
        events_created: ingestionResult.eventsCreated,
        events_updated: ingestionResult.eventsUpdated,
        events_noop: ingestionResult.eventsNoop,
        global_memories_created: ingestionResult.globalMemoriesCreated,
        global_memories_updated: ingestionResult.globalMemoriesUpdated,
        global_memories_noop: ingestionResult.globalMemoriesNoop,
        global_memories_pending_compaction:
          ingestionResult.globalMemoriesPendingCompaction,
      },
      identity: {
        updated: ingestionResult.identityUpdated,
        reason: ingestionResult.identityReason ?? null,
      },
      provenance: ingestionResult.provenance ?? null,
  });
  return ingestionResult;
}
