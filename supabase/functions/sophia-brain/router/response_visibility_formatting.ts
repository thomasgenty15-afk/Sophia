export function stripHiddenHtmlComments(text: unknown): string {
  return String(text ?? "")
    .replace(/(?:\r?\n)?<!--[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripDeprecatedProductVocabulary(text: string): string {
  return text
    .replace(/\bNorth Star\b/gi, "objectif principal")
    .replace(/\b[EÉ]toile Polaire\b/g, "objectif principal")
    .replace(/\bétoile polaire\b/gi, "objectif principal")
    .replace(/\bboussole\b/gi, "repere");
}

const VISIBLE_EMOJI_REGEX = /\p{Extended_Pictographic}/u;

export function ensureVisibleSophiaEmoji(text: unknown): string {
  const content = String(text ?? "").trim();
  if (!content || VISIBLE_EMOJI_REGEX.test(content)) return content;
  return `${content} 🙂`;
}
