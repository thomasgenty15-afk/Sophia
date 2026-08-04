export const RECENT_MESSAGE_LIMITS = {
  normalReplyContext: 15,
  dispatcher: 8,
  conversationRepair: 12,
  toolFlow: 10,
  compositeRepair: 4,
  subskillHistory: 8,
  // Fenêtre de « situation » servie UNIQUEMENT au tour d'entrée d'un flow local
  // (état persisté absent). Elle donne au dispatcher/visible agent assez de
  // recul pour se situer contre tout ce qui précède, au lieu de re-clarifier
  // un contexte pourtant évident quelques messages plus haut. Les tours de
  // continuation retombent sur subskillHistory (8) — le surcoût tokens n'est
  // payé qu'une fois, à l'entrée.
  flowEntryColdContext: 20,
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

/**
 * Fenêtre conversationnelle asymétrique pour l'entrée dans un flow local.
 *
 * - À l'ENTRÉE (`is_cold_entry`), rend une fenêtre large
 *   (`flowEntryColdContext`, 20) + un bloc de cadrage `framing` qui dit au
 *   modèle que c'est le 1er tour du flow, que certains messages peuvent être
 *   anciens, qu'il doit se situer et NE PAS re-clarifier ce qui est déjà nommé,
 *   et qu'il ne répond qu'au dernier message.
 * - En CONTINUATION, rend la fenêtre roulante normale (`continuation_limit`,
 *   typiquement `subskillHistory` = 8) sans cadrage.
 *
 * Le message utilisateur courant est poussé en queue s'il n'y est pas déjà,
 * pour que la fenêtre inclue toujours le tour en cours.
 */
export function flowEntryWindow(args: {
  recent_messages: Array<{ role: string; content: string }> | undefined;
  user_message?: string | null;
  is_cold_entry: boolean;
  continuation_limit: number;
}): { messages: RecentChatMessage[]; framing: string[] } {
  const merged: Array<{ role: string; content: string }> = [
    ...(args.recent_messages ?? []),
  ];
  const current = String(args.user_message ?? "").trim();
  if (
    current &&
    String(merged[merged.length - 1]?.content ?? "").trim() !== current
  ) {
    merged.push({ role: "user", content: current });
  }
  const limit = args.is_cold_entry
    ? RECENT_MESSAGE_LIMITS.flowEntryColdContext
    : args.continuation_limit;
  const messages = trimRecentChatMessages(merged, limit);
  const framing = args.is_cold_entry
    ? [
      `CONTEXTE D'ENTREE — 1er tour de ce flow. Les ${messages.length} derniers messages ci-dessous (recent_messages) sont fournis pour te situer. Certains peuvent etre anciens (une session precedente est possible). Etudie-les pour comprendre le sujet EN COURS et NE re-clarifie jamais ce qui y est deja nomme (l'action concrete, le declencheur, le moment). Tu reponds uniquement au dernier message, pas aux anciens.`,
    ]
    : [];
  return { messages, framing };
}
