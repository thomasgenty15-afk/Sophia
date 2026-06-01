function normalizeVisibleText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function containsDurableSuccessClaim(reply: string): boolean {
  const text = normalizeVisibleText(reply);
  return /\b(c est fait|ca y est|j ai (bien )?(applique|cree|creee|enregistre|active|activee|note|memorise|mis en place)|c est (bien )?(cree|creee|applique|appliquee|enregistre|enregistree|active|activee|note|notee|memorise|memorisee)|a ete (cree|creee|applique|appliquee|enregistre|enregistree|active|activee|note|notee))\b/
    .test(text);
}

export function renderNonCommittedReply(
  reply: string | null | undefined,
  fallback: string,
): string {
  const text = String(reply ?? "").trim();
  if (!text) return fallback;
  return containsDurableSuccessClaim(text) ? fallback : text;
}
