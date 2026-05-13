export function buildLastAssistantInfo(
  history: any[],
): { lastAssistantMessage: string; lastAssistantAgent: string | null } {
  const lastAssistantMessage =
    history.filter((m: any) => m.role === "assistant").pop()?.content || "";
  const lastAssistantAgentRaw =
    history.filter((m: any) => m.role === "assistant").pop()?.agent_used ||
    null;
  const normalizeAgentUsed = (raw: unknown): string | null => {
    const s = String(raw ?? "").trim();
    if (!s) return null;
    const m = s.match(/\b(sentry|architect|companion|librarian)\b/i);
    return m ? m[1]!.toLowerCase() : s.toLowerCase();
  };
  const lastAssistantAgent = normalizeAgentUsed(lastAssistantAgentRaw);
  return { lastAssistantMessage, lastAssistantAgent };
}
