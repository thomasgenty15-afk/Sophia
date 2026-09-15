export interface RedactionMemoryItem {
  id: string;
  user_id: string;
  status: string;
  content_text?: string | null;
  normalized_summary?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RedactionTopic {
  id: string;
  search_doc?: string | null;
  pending_changes_count?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface RedactedTopic extends RedactionTopic {
  search_doc: string;
  search_doc_embedding: null;
  pending_changes_count: number;
  metadata: Record<string, unknown>;
}

function normalize(input: string): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function extractRedactionTerms(item: RedactionMemoryItem): string[] {
  const text = [item.content_text, item.normalized_summary].filter(Boolean)
    .join(" ");
  const words = normalize(text).split(/[^\p{Letter}\p{Number}]+/u)
    .filter((w) => w.length >= 5);
  const sensitive = words.filter((w) =>
    /honte|rechute|cannabis|suicide|trauma|tania|soeur|pere/.test(w)
  );
  return [...new Set([...sensitive, ...words.slice(0, 6)])].slice(0, 12);
}

export function redactTextByTerms(
  text: string | null | undefined,
  terms: string[],
): string {
  let out = String(text ?? "");
  for (const term of terms) {
    if (!term) continue;
    out = out.replace(
      new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
      "",
    );
  }
  return out.replace(/\s+/g, " ").trim();
}

export function redactTopicSurface(
  topic: RedactionTopic,
  item: RedactionMemoryItem,
  nowIso = new Date().toISOString(),
): RedactedTopic {
  const terms = extractRedactionTerms(item);
  return {
    ...topic,
    search_doc: redactTextByTerms(topic.search_doc, terms),
    search_doc_embedding: null,
    pending_changes_count: Number(topic.pending_changes_count ?? 0) + 1,
    metadata: {
      ...(topic.metadata ?? {}),
      memory_v2_redaction_pending: true,
      memory_v2_redaction_at: nowIso,
      memory_v2_redacted_item_ids: [
        ...new Set([
          ...(
            Array.isArray(topic.metadata?.memory_v2_redacted_item_ids)
              ? topic.metadata?.memory_v2_redacted_item_ids.map(String)
              : []
          ),
          item.id,
        ]),
      ],
    },
  };
}

export function buildDeletedItemRedactionPatch(
  nowIso = new Date().toISOString(),
): Record<string, unknown> {
  return {
    content_text: "",
    normalized_summary: "",
    structured_data: {},
    embedding: null,
    canonical_key: null,
    source_hash: null,
    metadata: { redacted_at: nowIso, redaction_job_completed_at: nowIso },
  };
}
