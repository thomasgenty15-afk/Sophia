export const RECENT_MESSAGE_LIMITS = {
  normalReplyContext: 15,
  dispatcher: 8,
  conversationRepair: 12,
  toolFlow: 10,
  compositeRepair: 4,
  subskillHistory: 8,
} as const;

export type RecentChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export function recentChatMessagesFromHistory(
  history: unknown,
  limit: number,
): RecentChatMessage[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter((message: any) =>
      (message?.role === "user" || message?.role === "assistant") &&
      typeof message?.content === "string" && message.content.trim()
    )
    .map((message: any) => ({
      role: message.role as "user" | "assistant",
      content: String(message.content),
    }))
    .slice(-Math.max(0, Math.floor(limit)));
}

export function trimRecentChatMessages(
  messages: unknown,
  limit: number,
): RecentChatMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages.flatMap((message) => {
    const role = String((message as any)?.role ?? "");
    const content = String((message as any)?.content ?? "").trim();
    if ((role === "user" || role === "assistant") && content) {
      return [{ role: role as "user" | "assistant", content }];
    }
    return [];
  }).slice(-Math.max(0, Math.floor(limit)));
}
