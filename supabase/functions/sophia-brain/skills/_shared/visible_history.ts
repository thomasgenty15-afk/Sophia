import {
  RECENT_MESSAGE_LIMITS,
  type RecentChatMessage,
  trimRecentChatMessages,
} from "../../context/recent_messages_policy.ts";

/**
 * Historique conversationnel canonique des visible agents de skills.
 *
 * Les deux roles sont indispensables: sans ses propres messages, un visible
 * agent ne peut pas tenir un engagement conversationnel qu'il vient de
 * proposer ("on regarde ca en une phrase" -> le user accepte -> l'agent
 * re-pitch au lieu de livrer, cf. run rose-global15-r1 T11).
 * Limite: RECENT_MESSAGE_LIMITS.subskillHistory (8), comme les autres
 * sous-contextes de skills.
 */
export function visibleRecentMessages(args: {
  recent_messages: Array<{ role: string; content: string }> | undefined;
  user_message?: string | null;
}): RecentChatMessage[] {
  const messages: Array<{ role: string; content: string }> = [
    ...(args.recent_messages ?? []),
  ];
  const current = String(args.user_message ?? "").trim();
  if (
    current &&
    String(messages[messages.length - 1]?.content ?? "").trim() !== current
  ) {
    messages.push({ role: "user", content: current });
  }
  return trimRecentChatMessages(
    messages,
    RECENT_MESSAGE_LIMITS.subskillHistory,
  );
}
