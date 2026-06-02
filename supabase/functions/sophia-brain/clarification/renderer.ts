import type {
  ClarificationCandidate,
  ClarificationToolOutput,
} from "./contract.ts";

function compactLabel(label: string): string {
  return String(label ?? "").replace(/\s+/g, " ").trim();
}

export function fallbackClarificationQuestion(
  candidates: ClarificationCandidate[] = [],
): string {
  const labels = candidates.map((candidate) => compactLabel(candidate.label))
    .filter(Boolean);
  if (labels.length >= 2) {
    return `Tu veux plutôt ${labels[0]}, ou ${labels[1]} ?`;
  }
  if (labels.length === 1) {
    return `Tu veux préciser ce que tu veux faire avec ${labels[0]} ?`;
  }
  return "Tu peux préciser ce que tu veux dire ?";
}

export function renderClarificationQuestion(
  output: ClarificationToolOutput,
): string {
  if (
    (output.status === "ask" || output.status === "still_ambiguous") &&
    typeof output.question === "string" &&
    output.question.trim()
  ) {
    return output.question.trim();
  }
  return "";
}
