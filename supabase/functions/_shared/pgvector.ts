// PostgREST returns pgvector columns as JSON strings ("[0.1,...]"), not
// arrays. Reading them without parsing makes every embedding look null and
// silently degrades semantic routing to lexical matching.
export function parseVectorColumn(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    return value.every((x) => typeof x === "number") ? value : null;
  }
  if (typeof value === "string" && value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) &&
          parsed.every((x) => typeof x === "number")
        ? parsed
        : null;
    } catch {
      return null;
    }
  }
  return null;
}
