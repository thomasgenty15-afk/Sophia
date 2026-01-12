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

  // Some model outputs include the literal characters "\n" instead of real newlines.
  const raw = (text ?? "").toString().replace(/\\n/g, "\n");

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



