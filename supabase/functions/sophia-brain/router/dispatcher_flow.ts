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
    const lower = s.toLowerCase();
    const tokens: string[] = [];
    let current = "";
    for (const char of lower) {
      if (char >= "a" && char <= "z") {
        current += char;
      } else if (current) {
        tokens.push(current);
        current = "";
      }
    }
    if (current) tokens.push(current);
    for (const agent of ["sentry", "architect", "companion", "librarian"]) {
      if (tokens.includes(agent)) return agent;
    }
    return lower;
  };
  const lastAssistantAgent = normalizeAgentUsed(lastAssistantAgentRaw);
  return { lastAssistantMessage, lastAssistantAgent };
}
