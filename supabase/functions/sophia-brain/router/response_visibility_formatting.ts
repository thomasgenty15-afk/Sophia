export function stripHiddenHtmlComments(text: unknown): string {
  return String(text ?? "").trim();
}

export function stripDeprecatedProductVocabulary(text: string): string {
  return text;
}

export function ensureVisibleSophiaEmoji(text: unknown): string {
  return String(text ?? "").trim();
}
