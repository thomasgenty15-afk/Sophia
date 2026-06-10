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
  return String(value ?? "").trim().toLowerCase().split(" ").filter(Boolean)
    .join("-");
}

export function extractReminderClause(message: string): string {
  void message;
  return "";
}

export function extractQuotedReminderInstruction(message: string): string {
  void message;
  return "";
}

export function detectsReminderAnaphora(message: string): boolean {
  void message;
  return false;
}

export function isDegenerateReminderInstruction(
  instruction: string | null | undefined,
): boolean {
  return !String(instruction ?? "").trim();
}

export function extractReminderInstruction(message: string): string {
  void message;
  return "";
}

export async function loadLastReminderInstructionForUser(
  supabase: unknown,
  userId: string,
): Promise<string | null> {
  void supabase;
  void userId;
  return null;
}
