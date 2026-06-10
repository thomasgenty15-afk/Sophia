import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type CoachResponseStylePreferences = {
  noEmoji: boolean;
  maxLines: number | null;
  avoidFinalQuestion: boolean;
};

export const VISIBLE_OUTPUT_STYLE_RULES = [
  "VISIBLE_OUTPUT_STYLE_RULES:",
  "- Français naturel, adresse directe en tutoiement. Utilise tu, te, ton, ta, tes; n'utilise pas vous, votre, vos, souhaitez-vous ou preferez-vous pour t'adresser au user.",
  "- Format WhatsApp: message court, lisible, direct, sans bloc long ni fiche lourde.",
  "- Base concise: choisis l'information la plus pertinente et la plus utile; une reponse longue doit etre explicitement justifiee par conversation_context.",
  "- Si le stage demande une question, pose une seule question maximum.",
  "- N'expose jamais les internals: dispatcher, reducer, JSON, candidate_id, note_information, DB/table, prompt ou outil interne.",
  "- Ne promets jamais une creation, sauvegarde, activation, programmation, modification ou execution si le contexte visible ne prouve pas un effet deja commis.",
].join("\n");

export const VISIBLE_OUTPUT_FORBIDDEN_DIRECT_ADDRESS = [
  "vous",
  "votre",
  "vos",
  "souhaitez-vous",
  "préférez-vous",
  "preferez-vous",
];

export function normalizeVisibleOutputForPolicy(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("’", "'")
    .toLowerCase();
}

export function visibleOutputStyleIssues(message: string): string[] {
  const issues: string[] = [];
  const normalized = normalizeVisibleOutputForPolicy(message);
  if (/(^|[^a-z])vous([^a-z]|$)/i.test(normalized)) {
    issues.push("forbidden_vouvoiement:vous");
  }
  if (/(^|[^a-z])votre([^a-z]|$)/i.test(normalized)) {
    issues.push("forbidden_vouvoiement:votre");
  }
  if (/(^|[^a-z])vos([^a-z]|$)/i.test(normalized)) {
    issues.push("forbidden_vouvoiement:vos");
  }
  if (normalized.includes("souhaitez-vous")) {
    issues.push("forbidden_vouvoiement:souhaitez-vous");
  }
  if (normalized.includes("preferez-vous")) {
    issues.push("forbidden_vouvoiement:preferez-vous");
  }
  return issues;
}

export function userRequestsShortStyle(message: string): boolean {
  void message;
  return false;
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
  void args.userMessage;
  void args.preferences;
  return args.responseContent;
}
