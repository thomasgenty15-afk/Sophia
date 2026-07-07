/**
 * Fenêtre de fraîcheur du contexte conversationnel injecté dans les prompts.
 *
 * Les limites numériques (RECENT_MESSAGE_LIMITS) bornent le volume, mais pas
 * l'âge: après une absence de plusieurs jours, les "derniers messages" datent
 * d'un autre contexte et créent des décalages de ton/sujet. On coupe donc à
 * 12h, avec un plancher de continuité: le dernier tour assistant→user reste
 * toujours injecté, même au-delà de la fenêtre, pour qu'une réponse tardive à
 * un check-in ne perde pas la question posée (anti-pattern "l'agent re-pitch
 * au lieu de livrer", cf. skills/_shared/visible_history.ts).
 */
export const MESSAGE_FRESHNESS_WINDOW_MS = 12 * 60 * 60 * 1000;

type FreshnessMessage = {
  role?: unknown;
  created_at?: unknown;
};

function parseTimestampMs(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim()) {
    return new Date(raw).getTime();
  }
  return Number.NaN;
}

/**
 * Filtre une liste de messages ordonnée chronologiquement (anciens d'abord).
 *
 * - Garde les messages plus récents que `windowMs` (défaut 12h).
 * - Garde toujours le dernier tour d'échange: du dernier message assistant
 *   (inclus) jusqu'à la fin de la liste; sans message assistant, le dernier
 *   message de la liste.
 * - Garde les messages sans `created_at` exploitable (fail-open: mieux vaut
 *   un contexte un peu vieux qu'un contexte amputé par un timestamp absent).
 */
export function filterFreshMessages<T extends FreshnessMessage>(
  messages: T[],
  opts?: { nowMs?: number; windowMs?: number },
): T[] {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const nowMs = opts?.nowMs ?? Date.now();
  const windowMs = opts?.windowMs ?? MESSAGE_FRESHNESS_WINDOW_MS;
  const cutoffMs = nowMs - windowMs;

  let floorIndex = messages.length - 1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (String(messages[i]?.role ?? "") === "assistant") {
      floorIndex = i;
      break;
    }
  }

  return messages.filter((message, index) => {
    if (index >= floorIndex) return true;
    const timestampMs = parseTimestampMs(message?.created_at);
    if (!Number.isFinite(timestampMs)) return true;
    return timestampMs >= cutoffMs;
  });
}
