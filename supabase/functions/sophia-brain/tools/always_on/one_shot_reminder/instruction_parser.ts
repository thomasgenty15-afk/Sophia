import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

const REMINDER_REQUEST_PREFIX_REGEX =
  /\b(?:rappelle(?:-|\s)?moi|tu\s+peux\s+me\s+rappeler|peux-tu\s+me\s+rappeler|peux\s+tu\s+me\s+rappeler|tu\s+peux\s+m['’]envoyer\s+un\s+rappel|peux-tu\s+m['’]envoyer\s+un\s+rappel|peux\s+tu\s+m['’]envoyer\s+un\s+rappel|tu\s+peux\s+me\s+faire\s+un\s+rappel|peux-tu\s+me\s+faire\s+un\s+rappel|peux\s+tu\s+me\s+faire\s+un\s+rappel|tu\s+pourrais\s+me\s+faire\s+un\s+rappel|tu\s+pourrais\s+m['’]envoyer\s+un\s+rappel|est(?:-|\s)?ce\s+que\s+tu\s+peux\s+me\s+faire\s+un\s+rappel|est(?:-|\s)?ce\s+que\s+tu\s+peux\s+m['’]envoyer\s+un\s+rappel|envoie(?:-|\s)?moi\s+un\s+rappel|fais(?:-|\s)?moi\s+un\s+rappel|mets(?:-|\s)?moi\s+un\s+rappel|dis(?:-|\s)?moi|préviens(?:-|\s)?moi|previens(?:-|\s)?moi|fais(?:-|\s)?moi\s+signe|remind\s+me)\b([\s\S]*)$/i;

export function compactText(value: unknown, maxLen = 240): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= maxLen
    ? text
    : `${text.slice(0, maxLen - 1).trimEnd()}...`;
}

export function safeTrim(value: unknown): string {
  return String(value ?? "").trim();
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : "";
    const details = typeof record.details === "string" ? record.details : "";
    const code = typeof record.code === "string" ? record.code : "";
    return [code, message, details].filter(Boolean).join(" | ") ||
      JSON.stringify(record);
  }
  return String(error);
}

export function slugify(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export function extractReminderClause(message: string): string {
  const match = String(message ?? "").match(REMINDER_REQUEST_PREFIX_REGEX);
  return compactText(match?.[1] ?? "");
}

const QUOTED_REMINDER_PATTERNS: RegExp[] = [
  /(?:texte\s+exact|texte|instruction|message|contenu|exactement|exact)\s*[:=]?\s*['"’«]\s*([^'"’»]{2,200})\s*['"’»]/iu,
];

export function extractQuotedReminderInstruction(message: string): string {
  const text = compactText(message, 500);
  if (!text) return "";
  for (const pattern of QUOTED_REMINDER_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const cleaned = cleanReminderInstructionTarget(match[1]);
      if (cleaned) return cleaned;
    }
  }
  return "";
}

const ANAPHORA_REMINDER_PATTERN =
  /\b(le\s+m[êe]me(?:\s+rappel)?|la\s+m[êe]me(?:\s+chose)?|m[êe]me\s+(?:rappel|texte|note|instruction|message|contenu)|ce\s+rappel|comme\s+(?:tout\s+[àa]\s+l['’]\s*heure|avant|tu\s+as\s+fait|pr[ée]c[ée]demment)|pareil(?:\s+que\s+(?:tout\s+[àa]\s+l['’]\s*heure|avant))?)/iu;

export function detectsReminderAnaphora(message: string): boolean {
  if (!message) return false;
  return ANAPHORA_REMINDER_PATTERN.test(message);
}

function isGenericOrAnaphoricInstruction(instruction: string): boolean {
  const v = String(instruction ?? "").trim();
  if (!v) return true;
  if (v === "ce que tu as prévu") return true;
  if (ANAPHORA_REMINDER_PATTERN.test(v)) return true;
  return false;
}

export function isDegenerateReminderInstruction(
  instruction: string,
): boolean {
  const v = String(instruction ?? "").trim();
  if (!v) return true;
  if (isGenericOrAnaphoricInstruction(v)) return true;
  const stripped = v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(
      /\b(aujourd hui|aujourd'hui|demain|apres demain|apres-demain|ce soir|cet apres midi|cet apres-midi|ce matin|cette nuit)\b/g,
      " ",
    )
    .replace(/\b\d{1,2}\s*h\s*\d{0,2}\b/g, " ")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(
      /\b(a|vers|pour|le|la|les|du|de|d|et|ou|soit|plutot|maintenant|tout de suite|des maintenant)\b/g,
      " ",
    )
    .replace(
      /\b(rappel|neutre|imperatif|a faire|style|simple|court|courte)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return stripped.length === 0;
}

export async function loadLastReminderInstructionForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("scheduled_checkins")
      .select("message_payload,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) return null;
    const rows = (data ?? []) as any[];
    for (const row of rows) {
      const inst = String(
        row?.message_payload?.reminder_instruction ??
          row?.message_payload?.instruction ??
          row?.message_payload?.text ??
          "",
      )
        .replace(
          /^Rappel ponctuel demandé explicitement par l['’]utilisateur\. Rappelle-lui de\s*/i,
          "",
        )
        .replace(/\.$/, "")
        .trim();
      if (inst && !isGenericOrAnaphoricInstruction(inst)) return inst;
    }
    return null;
  } catch {
    return null;
  }
}

export function extractReminderInstruction(message: string): string {
  const full = compactText(message, 500);
  const quotedInstruction = extractQuotedReminderInstruction(full);
  if (quotedInstruction) return quotedInstruction;

  const clause = stripSideIntentContinuation(
    extractReminderClause(full) || full,
  );
  const explicitLabelTarget = clause.match(
    /\b(?:texte\s+exact|texte|instruction|message|contenu)\s*[:=]\s*([\s\S]+)$/i,
  )?.[1] ?? "";
  if (/[\p{L}\p{N}]/u.test(explicitLabelTarget)) {
    const cleanedExplicitLabel = cleanReminderInstructionTarget(
      explicitLabelTarget,
    );
    if (cleanedExplicitLabel) return cleanedExplicitLabel;
  }
  const afterColon = clause.match(/:\s*(.+)$/)?.[1] ?? "";
  if (/[\p{L}\p{N}]/u.test(afterColon)) {
    const cleanedAfterColon = cleanReminderInstructionTarget(afterColon);
    if (cleanedAfterColon) return cleanedAfterColon;
  }

  let explicitTarget = clause.match(
      /\b(?:de\s+manière\s+à\s+ce\s+que|de\s+maniere\s+à\s+ce\s+que|de\s+maniere\s+a\s+ce\s+que|de\s+façon\s+à\s+ce\s+que|de\s+facon\s+a\s+ce\s+que|pour\s+que)\s+je\s+fasse\s+(.+)$/i,
    )?.[1]
    ? `faire ${
      clause.match(
        /\b(?:de\s+manière\s+à\s+ce\s+que|de\s+maniere\s+à\s+ce\s+que|de\s+maniere\s+a\s+ce\s+que|de\s+façon\s+à\s+ce\s+que|de\s+facon\s+a\s+ce\s+que|pour\s+que)\s+je\s+fasse\s+(.+)$/i,
      )?.[1] ?? ""
    }`
    : undefined;
  explicitTarget = explicitTarget ??
    clause.match(
      /\bpour\s+me\s+(?:dire|rappeler|faire\s+penser)(?:\s+de)?\s+(.+)$/i,
    )?.[1] ??
    clause.match(/\bqu['’]?\s*il\s+faut\s+que\s+je\s+(.+)$/i)?.[1] ??
    clause.match(/\bqu\s+il\s+faut\s+que\s+je\s+(.+)$/i)?.[1] ??
    clause.match(/\bil\s+faut\s+que\s+je\s+(.+)$/i)?.[1] ??
    clause.match(/\bd['’]\s*(.+)$/i)?.[1] ??
    clause.match(/\bpour\s+(.+)$/i)?.[1] ??
    clause.match(/\bde\s+(.+)$/i)?.[1] ??
    "";

  const cleaned = cleanReminderInstructionTarget(explicitTarget);
  if (cleaned) return cleaned;
  return "ce que tu as prévu";
}

function stripSideIntentContinuation(value: string): string {
  return String(value ?? "")
    .replace(
      /\s*,?\s+et\s+(?:l[àa]\s+)?(?:tout\s+de\s+suite|maintenant|dans\s+la\s+foul[ée]e|ensuite)\b[\s\S]*$/i,
      "",
    )
    .replace(
      /\s*,?\s+(?:puis|ensuite|et)\s+(?:(?:juste\s+)?apr[eè]s\s+|dans\s+la\s+foul[ée]e\s+)?(?:j['’]?\s*(?:aimerais|voudrais)|je\s+(?:veux|souhaite|vais)|on\s+(?:peut|pourrait|va)|tu\s+(?:peux|pourrais))\b[\s\S]*$/i,
      "",
    );
}

function cleanReminderInstructionTarget(value: string): string {
  return compactText(
    stripSideIntentContinuation(value)
      .replace(/\bmanière\s+à\s+ce\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/\bmaniere\s+à\s+ce\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/\bmaniere\s+a\s+ce\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/\bfaçon\s+à\s+ce\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/\bfacon\s+a\s+ce\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/\bpour\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/\bce\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/^me\s+bouge\b/i, "me bouger")
      .replace(/\s*,?\s+mais\s+si\b[\s\S]*$/i, "")
      .replace(/\s*,?\s+mais\b[\s\S]*$/i, "")
      .replace(
        /\s*,?\s+et\s+(?:retiens|garde|enregistre)\s+(?:aussi\s+)?(?:en\s+t[eê]te\s+)?que\b[\s\S]*$/i,
        "",
      )
      .replace(
        /\s*,?\s+et\s+(?:l[àa]\s+)?(?:tout\s+de\s+suite|maintenant|dans\s+la\s+foul[ée]e|ensuite)\b[\s\S]*$/i,
        "",
      )
      .replace(
        /\s*,?\s+(?:puis|ensuite|et)\s+(?:(?:juste\s+)?apr[eè]s\s+|dans\s+la\s+foul[ée]e\s+)?(?:j['’]?\s*(?:aimerais|voudrais)|je\s+(?:veux|souhaite|vais)|on\s+(?:peut|pourrait|va)|tu\s+(?:peux|pourrais))\b[\s\S]*$/i,
        "",
      )
      .replace(
        /\s*[.,;]+\s*(?:et\s+|mais\s+|puis\s+)?(?:celui|celle|ceux|celles|l['’ ]?ancien|l['’ ]?autre|le\s+premier|le\s+second|le\s+deuxi[èe]me|les\s+autres?)\b[^.?!]*?\b(?:rest\w*|doi\w*\s+rester|garde)\b[^.?!]*?\bactif\w*\b.*$/i,
        "",
      )
      .replace(
        /\s*[.,;]+\s*(?:et\s+|mais\s+|puis\s+)?(?:garde|laisse|conserve|maintiens|maintient)\b[^.?!]*?(?:celui|celle|l['’ ]?autre|l['’ ]?ancien|le\s+premier|le\s+second|le\s+deuxi[èe]me|l['’ ]?existant|autre\s+rappel)\b[^.?!]*?\bactif\w*\b.*$/i,
        "",
      )
      .replace(
        /\s*[.,;]+\s*(?:et\s+|mais\s+|puis\s+)?ne\s+(?:touche|supprime|annule|change|modifie|enl[èe]ve)\b[^.?!]*?(?:l['’ ]?autre|l['’ ]?ancien|le\s+premier|le\s+second|celui\s+de|l['’ ]?existant)\b.*$/i,
        "",
      )
      .replace(/\b(?:stp|s['’]il te plaît|s'il te plait|please)\b/gi, " ")
      .replace(/\s*(?:[?!.]+|[:;]-?[)(DPp/]+)+\s*$/g, "")
      .replace(/\s*(?:<3|xd|xD|XD)+\s*$/g, "")
      .replace(/[?!.]+$/g, ""),
    140,
  );
}
