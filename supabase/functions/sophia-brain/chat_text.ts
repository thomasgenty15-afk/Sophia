export function normalizeChatText(
  text: unknown,
  opts?: {
    /**
     * Strip accidental tool/code leakage from model outputs.
     * Keep conservative: only remove obvious code fences and tool invocations.
     */
    stripToolLeaks?: boolean;
    /** Collapse 3+ blank lines into 2 blank lines. */
    collapseBlankLines?: boolean;
  },
): string {
  const stripToolLeaks = opts?.stripToolLeaks !== false;
  const collapseBlankLines = opts?.collapseBlankLines !== false;

  // Defensive: ensure outputs are safe to serialize as UTF-8.
  // Some LLM outputs can contain invalid UTF-16 (unpaired surrogates) which may get
  // converted into U+FFFD (�) by transport/decoding and then show up in the UI.
  const sanitizeUnicode = (input: string): string => {
    const s = String(input ?? "");
    let out = "";

    const shouldInsertDot = (atIndex: number): boolean => {
      // Avoid ".." if there's already a dot right before in output
      if (out.endsWith(".")) return false;
      // Avoid ".." if the next meaningful char is already a dot
      for (let j = atIndex + 1; j < s.length; j++) {
        const c = s.charCodeAt(j);
        // Skip invalid surrogates (they'll be handled separately)
        if (c >= 0xd800 && c <= 0xdfff) continue;
        const ch = s[j];
        if (ch === ".") return false;
        break;
      }
      return true;
    };

    const appendDotIfNeeded = (atIndex: number) => {
      if (shouldInsertDot(atIndex)) out += ".";
    };

    for (let i = 0; i < s.length; i++) {
      const cu = s.charCodeAt(i);
      // High surrogate
      if (cu >= 0xd800 && cu <= 0xdbff) {
        const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
        // Valid surrogate pair
        if (next >= 0xdc00 && next <= 0xdfff) {
          out += s[i] + s[i + 1];
          i++;
          continue;
        }
        // Unpaired high surrogate -> replace with dot (no duplicate dots)
        appendDotIfNeeded(i);
        continue;
      }
      // Unpaired low surrogate -> replace with dot (no duplicate dots)
      if (cu >= 0xdc00 && cu <= 0xdfff) {
        appendDotIfNeeded(i);
        continue;
      }
      // U+FFFD replacement char (already-decoded invalid sequence) -> replace with dot
      if (cu === 0xfffd) {
        appendDotIfNeeded(i);
        continue;
      }
      out += s[i];
    }
    return out;
  };

  // Some model outputs include the literal characters "\n" instead of real newlines.
  const raw = sanitizeUnicode((text ?? "").toString()).replace(/\\n/g, "\n");

  // Always strip bold markers (UI + WhatsApp do not need them, and some agents forbid it).
  const noBold = raw.replace(/\*\*/g, "");

  if (!stripToolLeaks) {
    const out = noBold.trim();
    return collapseBlankLines ? out.replace(/\n{3,}/g, "\n\n").trim() : out;
  }

  const lines = noBold.split("\n");
  const cleaned: string[] = [];
  for (const line of lines) {
    const l = line.trim();
    if (!l) {
      cleaned.push("");
      continue;
    }
    // Drop code fences and obvious tool invocations.
    if (l.startsWith("```")) continue;
    if (/^print\s*\(/i.test(l)) continue;
    if (/default_api\./i.test(l)) continue;
    if (
      /(track_progress|create_simple_action|create_framework|log_action_execution|break_down_action)\s*\(/i
        .test(l)
    ) {
      continue;
    }
    cleaned.push(line);
  }

  const out = cleaned.join("\n").trim();
  return collapseBlankLines ? out.replace(/\n{3,}/g, "\n\n").trim() : out;
}




