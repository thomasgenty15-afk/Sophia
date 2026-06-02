type StatusEffectHistoryEntry = {
  status:
    | "requested"
    | "allowed"
    | "committed"
    | "failed"
    | "blocked"
    | "proposed"
    | "delivered"
    | "cancelled"
    | "superseded"
    | "asked"
    | "resolved"
    | "topic_change";
};

export function buildRecentEffectHistoryRecapLines(
  history: StatusEffectHistoryEntry[],
): string[] {
  const lines: string[] = [];
  if (history.some((entry) => entry.status === "failed")) {
    lines.push(
      "- Tentatives récentes : je vois au moins une action échouée ; je ne la compte pas comme faite.",
    );
  }
  if (history.some((entry) => entry.status === "blocked")) {
    lines.push(
      "- Actions bloquées : je vois au moins une action bloquée ; je ne la compte pas comme faite.",
    );
  }
  return lines;
}
