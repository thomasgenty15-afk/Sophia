export type MemoryProvenanceRef = Record<string, unknown>;

const MAX_PROVENANCE_REFS = 8;

function compactString(value: unknown, maxLen = 240): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 1).trim()}…`;
}

function sanitizePrimitive(value: unknown): string | number | boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = compactString(value, 240);
  return text || null;
}

export function sanitizeMemoryProvenance(
  value: unknown,
): MemoryProvenanceRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const normalized: MemoryProvenanceRef = {};
  for (const [key, raw] of Object.entries(row)) {
    const safeKey = compactString(key, 60);
    if (!safeKey) continue;
    const safeValue = sanitizePrimitive(raw);
    if (safeValue === null) continue;
    normalized[safeKey] = safeValue;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function provenanceRefKey(value: unknown): string {
  const sanitized = sanitizeMemoryProvenance(value);
  if (!sanitized) return "";
  const picked = [
    sanitized.source_kind,
    sanitized.source_table,
    sanitized.source_id,
    sanitized.module_id,
    sanitized.week_id,
    sanitized.update_kind,
    sanitized.trigger_op,
  ].map((item) => compactString(item, 120)).filter(Boolean);
  return picked.join("|");
}

export function readMemoryProvenanceRefs(value: unknown): MemoryProvenanceRef[] {
  if (!Array.isArray(value)) return [];
  const refs: MemoryProvenanceRef[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const sanitized = sanitizeMemoryProvenance(item);
    if (!sanitized) continue;
    const key = provenanceRefKey(sanitized) || JSON.stringify(sanitized);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    refs.push(sanitized);
  }
  return refs.slice(-MAX_PROVENANCE_REFS);
}

export function mergeMemoryProvenanceRefs(
  existing: unknown,
  incoming?: unknown,
): MemoryProvenanceRef[] {
  const refs = readMemoryProvenanceRefs(existing);
  const next = sanitizeMemoryProvenance(incoming);
  if (!next) return refs;
  const key = provenanceRefKey(next) || JSON.stringify(next);
  const deduped = refs.filter((ref) =>
    (provenanceRefKey(ref) || JSON.stringify(ref)) !== key
  );
  return [...deduped, next].slice(-MAX_PROVENANCE_REFS);
}
