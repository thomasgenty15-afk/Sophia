import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  generateWithGemini,
  getGlobalAiModel,
} from "../_shared/gemini.ts";
import { normalizeScope } from "./state-manager.ts";

declare const Deno: any;

type ScopeMemoryRow = {
  user_id: string;
  scope: string;
  summary_text: string;
  pending_message_count: number;
  last_compaction_at: string | null;
  last_compacted_message_at: string | null;
  updated_at: string;
};

type ChatMessageRow = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type ScopeMemoryPromptContext = {
  summaryBlock: string | null;
  recentTurnsBlock: string | null;
  pendingMessageCount: number;
  recentMessageCount: number;
};

function safeEnvInt(name: string, fallback: number): number {
  try {
    const raw = String((globalThis as any)?.Deno?.env?.get?.(name) ?? "").trim();
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
  } catch {
    return fallback;
  }
}

function safeEnvString(name: string, fallback: string): string {
  try {
    const raw = String((globalThis as any)?.Deno?.env?.get?.(name) ?? "").trim();
    return raw || fallback;
  } catch {
    return fallback;
  }
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function getErrorCode(error: unknown): string {
  return String((error as { code?: unknown } | null)?.code ?? "").trim();
}

function getErrorMessage(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message ?? "").trim();
}

function isScopeMemoryUnavailableError(error: unknown): boolean {
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();
  return code === "42P01" ||
    code === "PGRST205" ||
    code === "42501" ||
    message.includes("conversation_scope_memories") ||
    message.includes("schema cache") ||
    message.includes("row-level security");
}

export function isScopeMemoryEligible(scopeRaw: unknown): boolean {
  const scope = normalizeScope(scopeRaw, "web");
  return scope === "whatsapp" ||
    scope.startsWith("module:") ||
    scope.startsWith("story:") ||
    scope.startsWith("reflection:");
}

export function getScopeMemoryThreshold(): number {
  return clampInt(safeEnvInt("SOPHIA_SCOPE_MEMORY_THRESHOLD", 15), 3, 50);
}

export function getScopeMemoryRecentMin(): number {
  const threshold = getScopeMemoryThreshold();
  return clampInt(
    safeEnvInt("SOPHIA_SCOPE_MEMORY_RECENT_MIN", 5),
    1,
    Math.max(1, threshold - 1),
  );
}

export function computeScopeMemoryRecentMessageCount(
  pendingMessageCount: number,
): number {
  const threshold = getScopeMemoryThreshold();
  const recentMin = getScopeMemoryRecentMin();
  const pending = Math.max(0, Math.floor(Number(pendingMessageCount) || 0));
  return clampInt(
    Math.max(recentMin, pending),
    recentMin,
    Math.max(recentMin, threshold - 1),
  );
}

function truncateMessageContent(content: string): string {
  return String(content ?? "").trim().replace(/\s+/g, " ").slice(0, 480);
}

function buildTranscript(rows: ChatMessageRow[]): string {
  return rows.map((row) =>
    `[${row.created_at}] ${String(row.role).toUpperCase()}: ${
      truncateMessageContent(row.content)
    }`
  ).join("\n");
}

function buildSummaryBlock(summaryText: string): string | null {
  const text = String(summaryText ?? "").trim();
  if (!text) return null;
  return [
    "=== MEMOIRE LONGUE COMPRESSEE DU SCOPE ===",
    "Utilise ce bloc pour la coherence factuelle. Ne le cite pas mot a mot a l'utilisateur.",
    text,
    "",
  ].join("\n");
}

function buildRecentTurnsBlock(rows: ChatMessageRow[]): string | null {
  if (!rows.length) return null;
  return `=== VERBATIM RECENT DU SCOPE (${rows.length} DERNIERS MESSAGES) ===\n${
    buildTranscript(rows)
  }\n\n`;
}

async function readScopeMemoryRow(
  supabase: SupabaseClient,
  userId: string,
  scope: string,
): Promise<ScopeMemoryRow | null> {
  const { data, error } = await supabase
    .from("conversation_scope_memories")
    .select(
      "user_id,scope,summary_text,pending_message_count,last_compaction_at,last_compacted_message_at,updated_at",
    )
    .eq("user_id", userId)
    .eq("scope", scope)
    .maybeSingle();

  if (error) throw error;
  return (data as ScopeMemoryRow | null) ?? null;
}

async function readRecentScopeMessages(args: {
  supabase: SupabaseClient;
  userId: string;
  scope: string;
  limit: number;
}): Promise<ChatMessageRow[]> {
  const safeLimit = clampInt(args.limit, 1, 49);
  const { data, error } = await args.supabase
    .from("chat_messages")
    .select("role,content,created_at")
    .eq("user_id", args.userId)
    .eq("scope", args.scope)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return ((data ?? []) as ChatMessageRow[]).slice().reverse();
}

export async function loadScopeMemoryPromptContext(args: {
  supabase: SupabaseClient;
  userId: string;
  scopeRaw: unknown;
}): Promise<ScopeMemoryPromptContext | null> {
  const scope = normalizeScope(args.scopeRaw, "web");
  if (!isScopeMemoryEligible(scope)) return null;
  try {
    const row = await readScopeMemoryRow(args.supabase, args.userId, scope);
    const pendingMessageCount = Math.max(
      0,
      Math.floor(Number(row?.pending_message_count ?? 0) || 0),
    );
    const recentMessageCount = computeScopeMemoryRecentMessageCount(
      pendingMessageCount,
    );
    const recentRows = await readRecentScopeMessages({
      supabase: args.supabase,
      userId: args.userId,
      scope,
      limit: recentMessageCount,
    });

    const summaryBlock = buildSummaryBlock(String(row?.summary_text ?? ""));
    const recentTurnsBlock = buildRecentTurnsBlock(recentRows);

    if (!summaryBlock && !recentTurnsBlock) return null;
    return {
      summaryBlock,
      recentTurnsBlock,
      pendingMessageCount,
      recentMessageCount: recentRows.length,
    };
  } catch (error) {
    if (isScopeMemoryUnavailableError(error)) {
      console.warn("[ScopeMemory] prompt_context_unavailable", {
        user_id: args.userId,
        scope,
        code: getErrorCode(error) || null,
        message: getErrorMessage(error) || String(error),
      });
      return null;
    }
    throw error;
  }
}

export async function maybeCompactScopeMemory(args: {
  supabase: SupabaseClient;
  userId: string;
  scopeRaw: unknown;
  requestId?: string | null;
  model?: string | null;
  forceRealAi?: boolean;
}): Promise<{
  compacted: boolean;
  reason: string;
  pendingMessageCount: number;
  durationMs: number;
}> {
  const startedAt = Date.now();
  const scope = normalizeScope(args.scopeRaw, "web");
  if (!isScopeMemoryEligible(scope)) {
    return {
      compacted: false,
      reason: "scope_not_eligible",
      pendingMessageCount: 0,
      durationMs: Date.now() - startedAt,
    };
  }
  try {
    const threshold = getScopeMemoryThreshold();

    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await readScopeMemoryRow(args.supabase, args.userId, scope);
      const pendingMessageCount = Math.max(
        0,
        Math.floor(Number(row?.pending_message_count ?? 0) || 0),
      );
      if (pendingMessageCount < threshold) {
        return {
          compacted: false,
          reason: "below_threshold",
          pendingMessageCount,
          durationMs: Date.now() - startedAt,
        };
      }

      const rows = await readRecentScopeMessages({
        supabase: args.supabase,
        userId: args.userId,
        scope,
        limit: pendingMessageCount,
      });
      if (!rows.length) {
        return {
          compacted: false,
          reason: "no_messages",
          pendingMessageCount,
          durationMs: Date.now() - startedAt,
        };
      }

      const previousSummary = String(row?.summary_text ?? "").trim();
      const transcript = buildTranscript(rows);
      const latestMessageAt = String(rows[rows.length - 1]?.created_at ?? "")
        .trim();

      const systemPrompt = `
Tu maintiens la memoire longue compressee d'une conversation isolee par scope.

Regles obligatoires :
- Ecris en francais.
- Fusionne l'ancien resume avec les nouveaux messages.
- Garde uniquement les faits utiles, themes, decisions, blocages, avancement.
- N'invente rien. Ne simule aucun dialogue.
- Pas de markdown. Pas de listes.
- Fais 2 a 8 phrases courtes.
- Longueur cible : 800 a 1200 caracteres maximum.
- Le texte doit rester stable et reutilisable comme contexte LLM.

Format de sortie JSON strict :
{
  "summary_text": "..."
}
    `.trim();

      const userPrompt = `
SCOPE:
${scope}

RESUME PRECEDENT:
${previousSummary || "(vide)"}

NOUVEAUX MESSAGES A FUSIONNER:
${transcript}
    `.trim();

      let nextSummary = "";
      try {
        const raw = await generateWithGemini(
          systemPrompt,
          userPrompt,
          0.15,
          true,
          [],
          "json",
          {
            requestId: args.requestId ?? undefined,
            model: String(
              args.model ??
                safeEnvString(
                  "SOPHIA_SCOPE_MEMORY_MODEL",
                  getGlobalAiModel("gemini-2.5-flash"),
                ),
            ).trim(),
            source: "sophia-brain:scope_memory",
            forceRealAi: args.forceRealAi,
            userId: args.userId,
          },
        );
        const parsed = JSON.parse(String(raw ?? "{}"));
        nextSummary = String(parsed?.summary_text ?? "").trim().slice(0, 1400);
      } catch (error) {
        console.warn("[ScopeMemory] compaction_generation_failed", {
          request_id: args.requestId ?? null,
          user_id: args.userId,
          scope,
          pending_message_count: pendingMessageCount,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          compacted: false,
          reason: "generation_failed",
          pendingMessageCount,
          durationMs: Date.now() - startedAt,
        };
      }

      if (!nextSummary) {
        return {
          compacted: false,
          reason: "empty_summary",
          pendingMessageCount,
          durationMs: Date.now() - startedAt,
        };
      }

      const { count, error } = await args.supabase
        .from("conversation_scope_memories")
        .update(
          {
            summary_text: nextSummary,
            pending_message_count: 0,
            last_compaction_at: new Date().toISOString(),
            last_compacted_message_at: latestMessageAt || null,
            updated_at: new Date().toISOString(),
          },
          { count: "exact" },
        )
        .eq("user_id", args.userId)
        .eq("scope", scope)
        .eq("pending_message_count", pendingMessageCount);

      if (error) throw error;
      if ((count ?? 0) > 0) {
        console.log(JSON.stringify({
          tag: "scope_memory_compacted",
          request_id: args.requestId ?? null,
          user_id: args.userId,
          scope,
          pending_message_count: pendingMessageCount,
          duration_ms: Date.now() - startedAt,
        }));
        return {
          compacted: true,
          reason: "updated",
          pendingMessageCount: 0,
          durationMs: Date.now() - startedAt,
        };
      }
    }
  } catch (error) {
    if (isScopeMemoryUnavailableError(error)) {
      console.warn("[ScopeMemory] compaction_unavailable", {
        request_id: args.requestId ?? null,
        user_id: args.userId,
        scope,
        code: getErrorCode(error) || null,
        message: getErrorMessage(error) || String(error),
      });
      return {
        compacted: false,
        reason: "scope_memory_unavailable",
        pendingMessageCount: 0,
        durationMs: Date.now() - startedAt,
      };
    }
    throw error;
  }

  return {
    compacted: false,
    reason: "optimistic_lock_failed",
    pendingMessageCount: 0,
    durationMs: Date.now() - startedAt,
  };
}
