import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type CoachResponseStylePreferences = {
  noEmoji: boolean;
  maxLines: number | null;
  avoidFinalQuestion: boolean;
};

function normalizePolicyText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function userRequestsShortStyle(message: string): boolean {
  const text = normalizePolicyText(message);
  return /\b(court|courte|bref|breve|bri[eè]vement|3 lignes|trois lignes|sans emoji|zero emoji|pas d emoji|sans question|pas de question)\b/
    .test(text);
}

export async function loadCoachResponseStylePreferences(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<CoachResponseStylePreferences> {
  void args;
  return {
    noEmoji: false,
    maxLines: null,
    avoidFinalQuestion: false,
  };
}

/**
 * Runtime policy.
 * Applique les contraintes de rendu explicites du tour et les preferences de
 * style chargees, sans decider d'une intention metier.
 */
export function applyCoachResponseStylePreferences(args: {
  userMessage: string;
  responseContent: string;
  preferences: CoachResponseStylePreferences;
}): string {
  const explicitShort = userRequestsShortStyle(args.userMessage);
  const explicitNoEmoji =
    /\b(sans emoji|zero emoji|0 emoji|pas d emoji|pas d emojis)\b/
      .test(normalizePolicyText(args.userMessage));
  const explicitNoQuestion =
    /\b(sans question|pas de question|pas de question finale|sans question finale)\b/
      .test(normalizePolicyText(args.userMessage));
  const explicitMaxLines = /\b(3 lignes|trois lignes)\b/.test(
    normalizePolicyText(args.userMessage),
  );
  const shouldApply = explicitShort || explicitNoEmoji || explicitNoQuestion ||
    explicitMaxLines;
  if (!shouldApply) return args.responseContent;

  let response = String(args.responseContent ?? "").trim();
  if (args.preferences.noEmoji || explicitNoEmoji) {
    response = response
      .replace(/\s*\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?/gu, "")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
  }
  if (args.preferences.avoidFinalQuestion || explicitNoQuestion) {
    const parts = response.split(/\n+/);
    const last = parts[parts.length - 1]?.trim() ?? "";
    if (/\?\s*$/.test(last)) {
      parts.pop();
      response = parts.join("\n").trim();
    }
  }
  const maxLines = explicitMaxLines ? 3 : args.preferences.maxLines;
  if (maxLines && maxLines > 0) {
    const lines = response.split(/\n+/).map((line) => line.trim()).filter(
      Boolean,
    );
    response = lines.slice(0, maxLines).join("\n").trim();
  }
  return response || args.responseContent;
}
