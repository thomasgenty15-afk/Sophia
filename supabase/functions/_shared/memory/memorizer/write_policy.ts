import type {
  DryRunCandidate,
  MemorizerWriteStatus,
  WriteDecision,
} from "./types.ts";

function hasSource(candidate: DryRunCandidate): boolean {
  return Array.isArray(candidate.item.source_message_ids) &&
    candidate.item.source_message_ids.some((id) => String(id ?? "").trim());
}

function bestLinkConfidence(candidate: DryRunCandidate): number {
  return Math.max(
    candidate.topic_link?.confidence ?? 0,
    ...(candidate.entity_links ?? []).map((link) => link.confidence),
    candidate.action_link?.confidence ?? 0,
  );
}

function isHighConfidenceDurable(candidate: DryRunCandidate): boolean {
  return candidate.item.kind !== "action_observation" &&
    candidate.item.confidence >= 0.75 &&
    Number(candidate.item.importance_score ?? 0) >= 0.6;
}

// P2-5b (eva-global17 R1-B05, paul-untested R1-B06): la règle prompt « états
// produit exclus » recidive — des objets rappel persistaient (« un rappel
// était demandé pour préparer le sac à 8h », « prévoit de poser son téléphone
// à 19h15 » avec une heure JAMAIS commise, contredite par la DB). Filtre de
// PERSISTANCE déterministe : la DB des rappels est la seule vérité de ces
// états ; un recall futur d'un tel item désinformerait. Deux détecteurs :
// (a) vocabulaire de la mécanique rappel + horaire ; (b) contenu qui recouvre
// l'instruction d'un rappel réel (fourni par l'appelant) + horaire. Le fait
// de vie sous-jacent sans mécanique (« travaille à domicile le 13/07 ») passe.
const REMINDER_CONTENT_STOPWORDS = new Set([
  "pour",
  "dans",
  "avec",
  "vers",
  "demain",
  "matin",
  "soir",
  "midi",
]);

function normalizeReminderContent(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function contentTokens(text: string): Set<string> {
  return new Set(
    normalizeReminderContent(text)
      .split(/[^a-z0-9]+/)
      .filter((token) =>
        token.length >= 4 && !REMINDER_CONTENT_STOPWORDS.has(token)
      ),
  );
}

function hasClockTime(text: string): boolean {
  return /\b\d{1,2}\s*h\s*\d{0,2}\b|\b\d{1,2}:\d{2}\b/.test(
    normalizeReminderContent(text),
  );
}

export function isReminderObjectItem(args: {
  content_text: string;
  normalized_summary?: string | null;
  reminder_instructions?: string[];
}): boolean {
  const text = `${args.content_text ?? ""} ${args.normalized_summary ?? ""}`;
  const normalized = normalizeReminderContent(text);
  if (!hasClockTime(text)) return false;
  if (/\brappel/.test(normalized)) return true;
  const itemTokens = contentTokens(text);
  for (const instruction of args.reminder_instructions ?? []) {
    const instructionTokens = contentTokens(instruction);
    if (instructionTokens.size === 0) continue;
    let overlap = 0;
    for (const token of instructionTokens) {
      if (itemTokens.has(token)) overlap += 1;
    }
    if (
      overlap >= 2 ||
      (overlap >= 1 && overlap === instructionTokens.size)
    ) return true;
  }
  return false;
}

export function decideInitialWriteStatus(
  candidate: DryRunCandidate,
  opts?: { reminder_instructions?: string[] },
): WriteDecision {
  if (candidate.dedupe.decision === "reject_duplicate") {
    return { candidate, status: "reject", reason: "duplicate" };
  }
  if (
    isReminderObjectItem({
      content_text: candidate.item.content_text,
      normalized_summary: candidate.item.normalized_summary,
      reminder_instructions: opts?.reminder_instructions,
    })
  ) {
    return { candidate, status: "reject", reason: "reminder_object_state" };
  }
  if (!hasSource(candidate)) {
    return { candidate, status: "reject", reason: "missing_source" };
  }
  if (candidate.item.confidence < 0.55) {
    return { candidate, status: "reject", reason: "low_confidence" };
  }
  const linkConfidence = bestLinkConfidence(candidate);
  if (candidate.item.requires_user_initiated) {
    if (isHighConfidenceDurable(candidate)) {
      return {
        candidate,
        status: "active",
        reason: "high_confidence_user_initiated_guarded",
      };
    }
    return {
      candidate,
      status: "candidate",
      reason: "requires_user_initiated",
    };
  }
  if (candidate.item.kind === "action_observation" && !candidate.action_link) {
    return {
      candidate,
      status: "candidate",
      reason: "action_without_confirmed_plan_item",
    };
  }
  if (candidate.item.confidence >= 0.75 && linkConfidence >= 0.70) {
    return { candidate, status: "active", reason: "high_confidence_linked" };
  }
  if (linkConfidence < 0.70 && isHighConfidenceDurable(candidate)) {
    return {
      candidate,
      status: "active",
      reason: "high_confidence_unlinked",
    };
  }
  return {
    candidate,
    status: "candidate",
    reason: linkConfidence < 0.70 ? "ambiguous_link" : "grey_confidence",
  };
}

export function decideInitialWriteStatuses(
  candidates: DryRunCandidate[],
  opts?: { reminder_instructions?: string[] },
): WriteDecision[] {
  return candidates.map((candidate) =>
    decideInitialWriteStatus(candidate, opts)
  );
}

export function countWriteStatuses(
  decisions: WriteDecision[],
): Record<MemorizerWriteStatus, number> {
  return decisions.reduce((acc, decision) => {
    acc[decision.status]++;
    return acc;
  }, { active: 0, candidate: 0, reject: 0 });
}
