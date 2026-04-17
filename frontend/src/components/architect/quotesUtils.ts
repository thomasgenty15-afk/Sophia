export const QUOTE_LIMITS = {
  text: 3000,
  author: 160,
  sourceContext: 240,
  tags: 12,
  tagLength: 40,
} as const;

export type ArchitectQuoteRow = {
  id: string;
  quote_text: string;
  author: string | null;
  source_context: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

export type QuoteFormValues = {
  text: string;
  author: string;
  context: string;
  tagsInput: string;
};

export type QuoteItem = {
  id: string;
  text: string;
  author: string;
  context: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export function normalizeOptionalQuoteField(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeQuoteTags(tagsInput: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const rawTag of tagsInput.split(",")) {
    const trimmedTag = rawTag.replace(/\s+/g, " ").trim();
    if (!trimmedTag) continue;

    const key = trimmedTag.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    tags.push(trimmedTag);
  }

  return tags;
}

export function validateQuoteForm(values: QuoteFormValues): string | null {
  const text = values.text.trim();
  const author = normalizeOptionalQuoteField(values.author);
  const context = normalizeOptionalQuoteField(values.context);
  const tags = normalizeQuoteTags(values.tagsInput);

  if (!text) {
    return "La citation ne peut pas être vide.";
  }

  if (text.length > QUOTE_LIMITS.text) {
    return `La citation dépasse la limite de ${QUOTE_LIMITS.text} caractères.`;
  }

  if (author && author.length > QUOTE_LIMITS.author) {
    return `L'auteur dépasse la limite de ${QUOTE_LIMITS.author} caractères.`;
  }

  if (context && context.length > QUOTE_LIMITS.sourceContext) {
    return `Le contexte dépasse la limite de ${QUOTE_LIMITS.sourceContext} caractères.`;
  }

  if (tags.length > QUOTE_LIMITS.tags) {
    return `Tu peux enregistrer au maximum ${QUOTE_LIMITS.tags} tags par citation.`;
  }

  const tooLongTag = tags.find((tag) => tag.length > QUOTE_LIMITS.tagLength);
  if (tooLongTag) {
    return `Le tag "${tooLongTag}" dépasse la limite de ${QUOTE_LIMITS.tagLength} caractères.`;
  }

  return null;
}

export function buildQuotePayload(values: QuoteFormValues) {
  return {
    quote_text: values.text.trim(),
    author: normalizeOptionalQuoteField(values.author),
    source_context: normalizeOptionalQuoteField(values.context),
    tags: normalizeQuoteTags(values.tagsInput),
  };
}

export function mapQuoteRowToItem(row: ArchitectQuoteRow): QuoteItem {
  return {
    id: row.id,
    text: String(row.quote_text ?? ""),
    author: row.author ?? "",
    context: row.source_context ?? "",
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function sortQuotesByRecency(quotes: QuoteItem[]): QuoteItem[] {
  return [...quotes].sort((a, b) => {
    const aTime = Date.parse(a.updatedAt || a.createdAt || "");
    const bTime = Date.parse(b.updatedAt || b.createdAt || "");
    return bTime - aTime;
  });
}
