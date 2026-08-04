import "jsr:@supabase/functions-js/edge-runtime.d.ts";

export const ACCESS_ENDED_NOTIFICATION_KIND = "access_ended_notification";
export const ACCESS_REACTIVATION_OFFER_KIND = "access_reactivation_offer";

export type AccessEndedReason = "trial_ended" | "subscription_ended";

function normalizeSpace(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeAccessEndedReason(value: unknown): AccessEndedReason | null {
  const reason = normalizeSpace(value).toLowerCase();
  if (reason === "trial_ended" || reason === "subscription_ended") return reason;
  return null;
}

export function accessEndedPurpose(reason: AccessEndedReason): string {
  return reason === "trial_ended" ? "end_trial" : "end_subscription";
}

function greetingPrefix(firstNameRaw?: string | null): string {
  const firstName = normalizeSpace(firstNameRaw).split(/\s+/)[0] ?? "";
  return firstName ? `Coucou ${firstName},` : "Coucou,";
}

export function buildAccessEndedInitialMessage(params: {
  reason: AccessEndedReason;
  firstName?: string | null;
}): string {
  const hello = greetingPrefix(params.firstName);
  if (params.reason === "trial_ended") {
    return `${hello} ton essai s'est termine. 🥲\nSi tu as trouve l'aide que tu cherchais, je peux t'envoyer le lien pour continuer ensemble. Tu veux ? ☺️`;
  }
  return `${hello} ton abonnement Sophia s'est termine. 🥲\nSi tu veux, je peux t'envoyer le lien pour reactiver ton acces et continuer ensemble. Tu veux ? ☺️`;
}

export function buildAccessEndedPositiveReply(params: {
  reason: AccessEndedReason;
  upgradeUrl: string;
}): string {
  const upgradeUrl = normalizeSpace(params.upgradeUrl);
  if (params.reason === "trial_ended") {
    return `Avec plaisir ☺️ Voici le lien pour continuer ensemble : ${upgradeUrl}\n\nJe serai ravie de te retrouver ici quand tu veux.`;
  }
  return `Avec plaisir ☺️ Voici le lien pour reactiver ton acces : ${upgradeUrl}\n\nJe serai ravie de te retrouver ici quand tu veux.`;
}

export function buildAccessEndedNegativeReply(): string {
  return "Pas de souci 🙂 La porte reste grande ouverte. Si tu sens que le moment est revenu, je serai la pour reprendre avec toi.";
}

export function classifyAccessEndedIntent(text: unknown): "accept" | "decline" | "unknown" {
  const t = normalizeSpace(text).toLowerCase();
  if (!t) return "unknown";
  if (/^(oui|yes|go|ok)\b/.test(t)) return "accept";
  if (/\b(c['’]est parti|vas[- ]?y|avec plaisir)\b/.test(t)) return "accept";
  if (/\b(pas pour le moment|pas maintenant|plus tard|une autre fois|pas pour l'instant|non)\b/.test(t)) {
    return "decline";
  }
  return "unknown";
}
