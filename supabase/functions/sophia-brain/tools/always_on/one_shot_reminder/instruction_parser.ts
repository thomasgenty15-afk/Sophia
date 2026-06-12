export function compactText(value: unknown, maxLen = 240): string {
  const text = String(value ?? "").trim();
  return text.length > maxLen ? text.slice(0, maxLen).trimEnd() : text;
}

export function safeTrim(value: unknown): string {
  return String(value ?? "").trim();
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function slugify(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
    .replace(/_+$/g, "");
}

export function extractReminderClause(message: string): string {
  return cleanupInstructionCandidate(message);
}

export function extractQuotedReminderInstruction(message: string): string {
  const text = String(message ?? "");
  const marker =
    /(?:texte\s+exact|instruction|note|message)\s*:?\s*["'“”‘’]([^"'“”‘’]+)["'“”‘’]/i;
  const markerMatch = text.match(marker);
  if (markerMatch?.[1]) return cleanupInstructionCandidate(markerMatch[1]);
  const genericMatch = text.match(/["“”]([^"“”]{3,})["“”]/);
  return genericMatch?.[1] ? cleanupInstructionCandidate(genericMatch[1]) : "";
}

export function detectsReminderAnaphora(message: string): boolean {
  const text = normalizeLite(message);
  return /\b(meme|memes?|pareil|comme\s+(?:tout\s+a\s+l\s+heure|avant)|ce\s+rappel)\b/
    .test(
      text,
    ) && (
      /\b(rappel|note|texte|meme)\b/.test(text) ||
      /\b(comme|pareil)\b/.test(text)
    );
}

export function isDegenerateReminderInstruction(
  instruction: string | null | undefined,
): boolean {
  const text = normalizeLite(instruction);
  if (!text) return true;
  if (
    [
      "rappel",
      "ce rappel",
      "le rappel",
      "un rappel",
      "ce que tu as prevu",
      "ce que j ai prevu",
      "meme texte",
      "le meme texte",
      "tu peux le programmer",
      "programme le",
      "rappel neutre",
    ].includes(text)
  ) return true;
  if (/^heure\s+de\s+\w+(?:\s+tu\s+peux\s+le\s+programmer)?$/.test(text)) {
    return true;
  }
  if (/^(?:aujourd hui|demain|a|ou|h|\d|\s)+$/.test(text)) return true;
  return /^(?:a\s+)?\d{1,2}\s*h?\s*(?:\d{2})?(?:\s+ou\s+\d{1,2}\s*h?\s*(?:\d{2})?)*$/
    .test(
      text,
    );
}

export function extractReminderInstruction(message: string): string {
  const text = String(message ?? "").trim();
  if (!text) return "";

  const exactText = text.match(
    /(?:texte\s+exact(?:\s+du\s+rappel)?|texte|instruction|message)\s*:?\s*(.+)$/i,
  );
  if (exactText?.[1]) return cleanupInstructionCandidate(exactText[1]);

  const quoted = extractQuotedReminderInstruction(text);
  if (quoted) return quoted;

  const colonAfterClock = text.match(
    /\b\d{1,2}\s*(?:h|:)\s*\d{0,2}\s*:\s*(.+?)(?:\.\s*Celui\s+de|\s*,?\s+et\s+garde\s+celui\s+de|$)/i,
  );
  if (colonAfterClock?.[1]) {
    return cleanupInstructionCandidate(colonAfterClock[1]);
  }

  const purposePatterns = [
    /\bme\s+dire\s+de\s+(.+)$/i,
    /\bdire\s+de\s+(.+)$/i,
    /\bde\s+mani[eè]re\s+[aà]\s+ce\s+que\s+je\s+(.+)$/i,
    /\bqu['’]?\s*il\s+faut\s+que\s+je\s+(.+)$/i,
    /\bdans\s+(?:\d{1,3}|un|une)\s+(?:minutes?|quart|heure)[^,.!?;:]*?\s+d['’]\s*(.+)$/i,
    /\bdans\s+(?:\d{1,3}|un|une)\s+(?:minutes?|quart|heure)[^,.!?;:]*?\s+de\s+(.+)$/i,
    /\b(?:\d{1,2}\s*(?:h|:)\s*\d{0,2})\s+(?:de|pour)\s+(.+)$/i,
    /\b(?:pour|afin\s+de)\s+(.+)$/i,
    /\b(?:rappelle(?:s)?(?:-moi)?|programme(?:-moi)?|mets(?:-moi)?|met(?:s)?|dis(?:-moi)?)\b(?!.*\bd['’]?\s*heure\b).*?\bde\s+(.+)$/i,
  ];
  for (const pattern of purposePatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const cleaned = cleanupInstructionCandidate(match[1]);
      if (cleaned) return cleaned;
    }
  }

  const colonAfterTime = text.match(
    /(?:\d{1,2}\s*(?:h|:)\s*\d{0,2}|heure|minutes?)\s*(?:[:\-]\s+)(.+)$/i,
  );
  if (colonAfterTime?.[1]) {
    return cleanupInstructionCandidate(colonAfterTime[1]);
  }

  const afterTime = text.match(
    /(?:aujourd'hui|demain|apres-demain|après-demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?[^.!?\n]{0,80}?\b(?:a|à|vers)?\s*\d{1,2}\s*(?:h|:)\s*\d{0,2}\b\s*(.+)$/i,
  );
  if (afterTime?.[1]) return cleanupInstructionCandidate(afterTime[1]);

  return "";
}

export async function loadLastReminderInstructionForUser(
  supabase: unknown,
  userId: string,
): Promise<string | null> {
  const client = supabase as {
    from: (table: string) => {
      select: (cols: string) => unknown;
    };
  };
  try {
    const result = await (client.from("scheduled_checkins") as any)
      .select("message_payload,created_at")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(10);
    const rows = Array.isArray(result?.data) ? result.data : [];
    for (const row of rows) {
      const payload = row?.message_payload ?? {};
      const raw = payload.reminder_instruction ?? payload.instruction ?? "";
      const cleaned = cleanupInstructionCandidate(raw);
      if (cleaned && !isDegenerateReminderInstruction(cleaned)) return cleaned;
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeLite(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function cleanupInstructionCandidate(value: unknown): string {
  let text = String(value ?? "").trim();
  text = text.replace(
    /^Rappel ponctuel demandé explicitement par l'utilisateur\.\s*Rappelle-lui\s+de\s+/i,
    "",
  );
  text = text.replace(
    /^.*?(?:texte\s+exact(?:\s+du\s+rappel)?|texte|instruction|message)\s*:?\s*/i,
    "",
  );
  text = text.replace(/^rappelle(?:-|\s)?(?:moi|lui)?\s+(?:de\s+)?/i, "");
  text = text.replace(/^me\s+dire\s+de\s+/i, "");
  text = text.replace(/^que\s+je\s+/i, "");
  text = text.replace(/^je\s+/, "");
  text = text.replace(/^il\s+faut\s+que\s+je\s+/i, "");
  text = text.replace(/^d['’]/i, "");
  text = text.replace(/^de\s+/i, "");
  text = text.replace(/^pour\s+/i, "");
  text = text.replace(/^me\s+faire\s+un\s+rappel\s+/i, "");
  text = text.replace(/^:\s*/, "");
  text = text.replace(/\s+/g, " ").trim();

  const cutPatterns = [
    /\s*,?\s+et\s+l[àa]\s+tout\s+de\s+suite\b/i,
    /\s*,?\s+puis\s+juste\s+apr[eè]s\b/i,
    /\s*,?\s+et\s+retiens\s+aussi\b/i,
    /\s*,?\s+mais\s+si\b/i,
    /\.\s*Celui\s+de\b/i,
    /\s*,?\s+et\s+garde\s+celui\s+de\b/i,
  ];
  for (const pattern of cutPatterns) {
    const match = text.search(pattern);
    if (match >= 0) text = text.slice(0, match).trim();
  }
  text = text
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/^mani[eè]re\s+[aà]\s+ce\s+que\s+je\s+/i, "")
    .replace(/^qu['’]?\s*il\s+faut\s+que\s+je\s+/i, "")
    .replace(/^me\s+dire\s+de\s+/i, "")
    .replace(/\bfasse\b/i, "faire")
    .replace(/\bme\s+bouge\b/i, "me bouger")
    .replace(
      /\s+(?:stp|s[’']?il\s+te\s+plait|s[’']?il\s+te\s+plaît)\s*[.?!]*\s*$/i,
      "",
    )
    .replace(/\s*[:;]-?\)+$/g, "")
    .replace(/[.?!。]+$/g, "")
    .trim();
  return text;
}
