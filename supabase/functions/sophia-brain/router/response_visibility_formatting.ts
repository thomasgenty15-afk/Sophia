const INTERNAL_COMMENT_MARKERS = [
  "fil_rouge_whatsapp",
  "fil_rouge",
];

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeCommentBlock(text: string, pattern: RegExp): string {
  return text.replace(
    pattern,
    (match) => match.includes("\n") ? "\n" : "",
  );
}

export function stripHiddenHtmlComments(text: unknown): string {
  let visibleText = String(text ?? "");
  for (const marker of INTERNAL_COMMENT_MARKERS) {
    const escapedMarker = escapeRegex(marker);
    visibleText = removeCommentBlock(
      visibleText,
      new RegExp(
        `[ \\t]*\\n?[ \\t]*<!--\\s*${escapedMarker}\\s*:[\\s\\S]*?-->[ \\t]*\\n?[ \\t]*`,
        "gi",
      ),
    );
    visibleText = visibleText.replace(
      new RegExp(
        `[ \\t]*\\n?[ \\t]*${escapedMarker}\\s*:\\s*[^\\n<]+`,
        "gi",
      ),
      (match) => match.includes("\n") ? "\n" : "",
    );
  }
  visibleText = removeCommentBlock(
    visibleText,
    /[ \t]*\n?[ \t]*<!--[\s\S]*?-->[ \t]*\n?[ \t]*/g,
  );
  return visibleText.replace(/\n{3,}/g, "\n\n").trim();
}

export function stripDeprecatedProductVocabulary(text: string): string {
  return text;
}

export function ensureVisibleSophiaEmoji(text: unknown): string {
  return String(text ?? "").trim();
}
