import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { ClarificationCandidateSignal } from "./contract.ts";

export type ClarificationContextPackProjectionName =
  | "active_plan_items"
  | "attack_cards"
  | "defense_cards"
  | "recurring_reminders";

export type ClarificationContextPack = {
  version: "clarification_context_pack_v1";
  loaded_for_candidate_operations: string[];
  projections: Record<
    ClarificationContextPackProjectionName,
    Array<
      Record<string, unknown>
    >
  >;
  retrieval_notes: string[];
  limits: {
    max_items_per_category: number;
  };
};

export type BuildClarificationContextPackInput = {
  supabase?: SupabaseClient | null;
  userId: string;
  candidateSignals: ClarificationCandidateSignal[];
  existingKnownContext?: Record<string, unknown> | null;
  maxItemsPerCategory?: number;
};

const EMPTY_PROJECTIONS: ClarificationContextPack["projections"] = {
  active_plan_items: [],
  attack_cards: [],
  defense_cards: [],
  recurring_reminders: [],
};

function operationTypes(signals: ClarificationCandidateSignal[]): string[] {
  return [
    ...new Set(
      signals.map((signal) =>
        String(signal.operation_type ?? signal.target_dispatcher ?? "").trim()
      ).filter(Boolean),
    ),
  ];
}

function needsPlanItems(operations: Set<string>): boolean {
  return operations.has("prepare_attack_card") ||
    operations.has("prepare_defense_card") ||
    operations.has("adjust_plan_item") ||
    operations.has("create_recurring_reminder");
}

function compactText(value: unknown, max = 220): string | null {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max).trimEnd() : text;
}

function contentTitle(content: unknown): string | null {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const root = content as Record<string, unknown>;
    return compactText(
      root.title ?? root.name ?? root.target_label ?? root.risk_situation ??
        root.situation ?? root.message_instruction,
    );
  }
  return compactText(content);
}

function freshness(row: Record<string, unknown>): string {
  const raw = compactText(
    row.updated_at ?? row.generated_at ?? row.created_at,
    80,
  );
  if (!raw) return "unknown";
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return "unknown";
  const ageMs = Date.now() - timestamp;
  if (ageMs < 0) return "future";
  if (ageMs <= 36 * 60 * 60 * 1000) return "recent";
  if (ageMs <= 30 * 24 * 60 * 60 * 1000) return "current";
  return "older";
}

function compactRow(row: Record<string, unknown>, type: string) {
  const content = row.content;
  const id = compactText(row.id, 120);
  const title = compactText(row.title) ?? contentTitle(content) ??
    compactText(row.message_instruction) ?? compactText(row.description);
  return {
    type,
    id,
    title,
    status: compactText(row.status, 80),
    context_status: "db_derived",
    source: "db_context",
    freshness: freshness(row),
    confidence: "high",
    evidence: [
      id ? `${type}.id:${id}` : null,
      title ? `${type}.title:${title}` : null,
    ].filter(Boolean),
    kind: compactText(row.kind ?? row.dimension, 80),
    local_time_hhmm: compactText(row.local_time_hhmm, 40),
    scheduled_days: Array.isArray(row.scheduled_days)
      ? row.scheduled_days.slice(0, 7)
      : undefined,
    time_of_day: compactText(row.time_of_day, 80),
    updated_at: compactText(
      row.updated_at ?? row.generated_at ?? row.created_at,
      80,
    ),
  };
}

async function safeSelect(args: {
  pack: ClarificationContextPack;
  name: ClarificationContextPackProjectionName;
  query: PromiseLike<{ data: unknown; error: unknown }>;
  mapType: string;
}): Promise<void> {
  try {
    const { data, error } = await args.query;
    if (error) {
      args.pack.retrieval_notes.push(`${args.name}:error`);
      return;
    }
    args.pack.projections[args.name] = Array.isArray(data)
      ? data.flatMap((row) =>
        row && typeof row === "object"
          ? [compactRow(row as Record<string, unknown>, args.mapType)]
          : []
      ).filter((row) => row.id || row.title)
        .slice(0, args.pack.limits.max_items_per_category)
      : [];
  } catch {
    args.pack.retrieval_notes.push(`${args.name}:exception`);
  }
}

export async function buildClarificationContextPack(
  input: BuildClarificationContextPackInput,
): Promise<ClarificationContextPack> {
  const operations = operationTypes(input.candidateSignals);
  const opSet = new Set(operations);
  const pack: ClarificationContextPack = {
    version: "clarification_context_pack_v1",
    loaded_for_candidate_operations: operations,
    projections: {
      active_plan_items: [],
      attack_cards: [],
      defense_cards: [],
      recurring_reminders: [],
    },
    retrieval_notes: [],
    limits: {
      max_items_per_category: Math.max(
        1,
        Math.min(12, input.maxItemsPerCategory ?? 8),
      ),
    },
  };

  const existing = input.existingKnownContext?.clarification_context_pack;
  if (
    existing && typeof existing === "object" &&
    (existing as { version?: unknown }).version ===
      "clarification_context_pack_v1"
  ) {
    console.info("[Clarification] db_context_pack_loaded", {
      source: "existing_known_context",
      user_id: input.userId,
      operations,
    });
    return existing as ClarificationContextPack;
  }

  if (!input.supabase) {
    pack.retrieval_notes.push("supabase_unavailable");
    console.info("[Clarification] db_context_pack_loaded", {
      source: "empty_supabase_unavailable",
      user_id: input.userId,
      operations,
      retrieval_notes: pack.retrieval_notes,
    });
    return pack;
  }

  const tasks: Promise<void>[] = [];
  if (opSet.has("prepare_attack_card")) {
    tasks.push(safeSelect({
      pack,
      name: "attack_cards",
      mapType: "attack_card",
      query: input.supabase
        .from("user_attack_cards")
        .select("id,content,status,generated_at,updated_at")
        .eq("user_id", input.userId)
        .eq("status", "active")
        .order("generated_at", { ascending: false })
        .limit(pack.limits.max_items_per_category) as any,
    }));
  }
  if (opSet.has("prepare_defense_card")) {
    tasks.push(safeSelect({
      pack,
      name: "defense_cards",
      mapType: "defense_card",
      query: input.supabase
        .from("user_defense_cards")
        .select("id,content,status,generated_at,updated_at")
        .eq("user_id", input.userId)
        .eq("status", "active")
        .order("generated_at", { ascending: false })
        .limit(pack.limits.max_items_per_category) as any,
    }));
  }
  if (opSet.has("create_recurring_reminder")) {
    tasks.push(safeSelect({
      pack,
      name: "recurring_reminders",
      mapType: "recurring_reminder",
      query: input.supabase
        .from("user_recurring_reminders")
        .select(
          "id,status,message_instruction,local_time_hhmm,scheduled_days,updated_at",
        )
        .eq("user_id", input.userId)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(pack.limits.max_items_per_category) as any,
    }));
  }
  if (needsPlanItems(opSet)) {
    tasks.push(safeSelect({
      pack,
      name: "active_plan_items",
      mapType: "active_plan_item",
      query: input.supabase
        .from("user_plan_items")
        .select(
          "id,title,description,dimension,kind,status,cadence_label,scheduled_days,time_of_day,updated_at,created_at",
        )
        .eq("user_id", input.userId)
        .in("status", ["active", "stalled"])
        .order("updated_at", { ascending: false })
        .limit(pack.limits.max_items_per_category) as any,
    }));
  }

  await Promise.all(tasks);
  if (tasks.length === 0) {
    pack.retrieval_notes.push("no_db_backed_candidate_family");
  }
  console.info("[Clarification] db_context_pack_loaded", {
    source: "supabase",
    user_id: input.userId,
    operations,
    counts: Object.fromEntries(
      Object.entries(pack.projections).map(([name, rows]) => [
        name,
        rows.length,
      ]),
    ),
    retrieval_notes: pack.retrieval_notes,
  });
  return pack;
}

export const EMPTY_CLARIFICATION_CONTEXT_PACK: ClarificationContextPack = {
  version: "clarification_context_pack_v1",
  loaded_for_candidate_operations: [],
  projections: EMPTY_PROJECTIONS,
  retrieval_notes: ["empty"],
  limits: { max_items_per_category: 8 },
};
