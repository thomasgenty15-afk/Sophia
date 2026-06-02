import type {
  ClarificationRequest,
  ClarificationToolOutput,
  ClarificationToolStatus,
} from "./contract.ts";
import type { ClarificationState } from "./state.ts";
import { fallbackClarificationQuestion } from "./renderer.ts";
import { buildClarificationPromptResources } from "./resources.ts";

export type ClarificationLlmRunner = (input: {
  system_prompt: string;
  user_prompt: string;
  json_mode: true;
  model_name: string;
}) => Promise<unknown>;

const DEFAULT_MODEL_NAME = "gpt-4.1-mini";
const VALID_STATUSES: ClarificationToolStatus[] = [
  "ask",
  "resolved",
  "still_ambiguous",
  "cancelled",
  "topic_change",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function compactText(value: unknown, maxChars: number): string | null {
  if (value == null) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > maxChars ? text.slice(0, maxChars).trimEnd() : text;
}

function parseLlmJson(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeConfidence(
  value: unknown,
): ClarificationToolOutput["confidence"] {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : "low";
}

function normalizeStatus(value: unknown): ClarificationToolStatus {
  return VALID_STATUSES.includes(value as ClarificationToolStatus)
    ? value as ClarificationToolStatus
    : "still_ambiguous";
}

function firstVisibleQuestion(text: string | null): string | null {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const firstQuestionMark = normalized.indexOf("?");
  if (firstQuestionMark >= 0) {
    const first = normalized.slice(0, firstQuestionMark + 1).trim();
    return first.length <= 220 ? first : `${first.slice(0, 219).trimEnd()}?`;
  }
  const capped = normalized.length <= 219
    ? normalized
    : normalized.slice(0, 219).trim();
  return `${capped}?`;
}

function enforceTutoiement(text: string | null): string | null {
  if (!text) return null;
  return text
    .replace(/\b[Ss]ouhaitez-vous\b/g, "Tu veux")
    .replace(/\b[Pp]référez-vous\b/g, "Tu préfères")
    .replace(/\b[Pp]referez-vous\b/g, "Tu préfères")
    .replace(/\b[Vv]oulez-vous\b/g, "Tu veux")
    .replace(/\b[Aa]imeriez-vous\b/g, "Tu veux")
    .replace(/\b[Ee]st-ce que vous souhaitez\b/g, "Est-ce que tu souhaites")
    .replace(/\b[Ee]st-ce que vous préférez\b/g, "Est-ce que tu préfères")
    .replace(/\b[Ee]st-ce que vous preferez\b/g, "Est-ce que tu préfères")
    .replace(/\b[Ee]st-ce que vous voulez\b/g, "Est-ce que tu veux")
    .replace(/\b[Vv]ous souhaitez\b/g, "tu souhaites")
    .replace(/\b[Vv]ous préférez\b/g, "tu préfères")
    .replace(/\b[Vv]ous preferez\b/g, "tu préfères")
    .replace(/\b[Vv]ous voulez\b/g, "tu veux")
    .replace(/\b[Vv]ous pouvez\b/g, "tu peux")
    .replace(/\b[Vv]otre\b/g, (match) => match[0] === "V" ? "Ton" : "ton")
    .replace(/\b[Vv]os\b/g, (match) => match[0] === "V" ? "Tes" : "tes")
    .replace(/\b[Vv]ous\b/g, (match) => match[0] === "V" ? "Tu" : "tu")
    .replace(/\s+/g, " ")
    .trim();
}

function requestHasCandidate(
  request: ClarificationRequest,
  id: string,
): boolean {
  return request.candidates.some((candidate) =>
    candidate.id === id || candidate.operation_type === id
  );
}

function requestHasTemporalHint(request: ClarificationRequest): boolean {
  return /\b(demain|ce soir|ce matin|cet apres[-\s]?midi|cette nuit|matin|soir|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i
    .test(
      request.user_message.normalize("NFD").replace(/\p{Diacritic}/gu, ""),
    );
}

function normalizeAttackCardQuestion(
  question: string | null,
  request: ClarificationRequest,
): string | null {
  if (!question || !requestHasCandidate(request, "prepare_attack_card")) {
    return question;
  }
  let normalized = question
    .replace(/\ben créer une\b/gi, "en préparer une")
    .replace(/\bcréer une carte d'attaque\b/gi, "préparer une carte d'attaque");
  if (!requestHasTemporalHint(request)) return normalized;
  normalized = normalized
    .replace(
      /\ben préparer une pour (demain|ce soir|ce matin|cet après-midi|cette nuit|le matin|le soir|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/gi,
      "en préparer une pour ton action",
    )
    .replace(
      /\bpréparer une carte d'attaque pour (demain|ce soir|ce matin|cet après-midi|cette nuit|le matin|le soir|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/gi,
      "préparer une carte d'attaque pour ton action",
    );
  return normalized;
}

function normalizeVisibleQuestion(
  question: string | null,
  request: ClarificationRequest,
): string | null {
  return normalizeAttackCardQuestion(enforceTutoiement(question), request);
}

function outputFallback(
  request: ClarificationRequest,
  status: "ask" | "still_ambiguous" = "ask",
): ClarificationToolOutput {
  return {
    status,
    selected_candidate_id: null,
    confidence: "low",
    question: fallbackClarificationQuestion(request.candidates),
    reasoning_summary: "clarification_tool_fallback",
    handoff_notes: {
      missing_decision: request.ambiguity_kind,
      recommended_next_step: "ask_user",
    },
  };
}

function normalizeHandoffNotes(
  value: unknown,
): ClarificationToolOutput["handoff_notes"] | undefined {
  if (!isRecord(value)) return undefined;
  const knownSlots = isRecord(value.known_slots)
    ? value.known_slots
    : undefined;
  return {
    known_slots: knownSlots,
    missing_decision: compactText(value.missing_decision, 240),
    recommended_next_step: compactText(value.recommended_next_step, 240),
  };
}

function normalizeOutput(
  raw: unknown,
  request: ClarificationRequest,
  previousState?: ClarificationState | null,
): ClarificationToolOutput {
  const record = parseLlmJson(raw);
  if (!record) return outputFallback(request);

  const validCandidateIds = new Set(
    request.candidates.map((candidate) => candidate.id),
  );
  let status = normalizeStatus(record.status);
  const confidence = normalizeConfidence(record.confidence);
  let selectedCandidateId = compactText(record.selected_candidate_id, 160);
  if (selectedCandidateId && !validCandidateIds.has(selectedCandidateId)) {
    selectedCandidateId = null;
  }

  const maxTurnsReached = previousState
    ? Number(previousState.turn_count ?? 0) >=
      Number(previousState.max_turns ?? 2)
    : false;

  if (status === "resolved" && (!selectedCandidateId || confidence === "low")) {
    status = maxTurnsReached ? "still_ambiguous" : "ask";
    if (confidence === "low") selectedCandidateId = null;
  }
  if (confidence === "low" && status === "resolved") {
    status = maxTurnsReached ? "still_ambiguous" : "ask";
    selectedCandidateId = null;
  }

  let question = firstVisibleQuestion(compactText(record.question, 320));
  if (status === "ask" || status === "still_ambiguous") {
    question = question ?? fallbackClarificationQuestion(request.candidates);
    question = normalizeVisibleQuestion(question, request);
  }
  if (status === "cancelled" || status === "topic_change") {
    selectedCandidateId = null;
    question = null;
  }

  return {
    status,
    selected_candidate_id: selectedCandidateId,
    confidence,
    question,
    user_goal_summary: compactText(record.user_goal_summary, 360),
    reasoning_summary: compactText(record.reasoning_summary, 360),
    handoff_notes: normalizeHandoffNotes(record.handoff_notes),
  };
}

function buildSystemPrompt(): string {
  return [
    "Tu es un outil de clarification, pas un coach complet.",
    "Tu tutoies toujours l'utilisateur dans la question visible.",
    "Tu n'utilises jamais 'vous', 'votre', 'vos', 'souhaitez-vous' ou 'préférez-vous' pour t'adresser à lui.",
    "Tu dois choisir entre candidats ou poser une question discriminante.",
    "Tu ne dois jamais inventer un candidat absent.",
    "Tu ne dois jamais déclencher d'action.",
    "Tu ne dois jamais dire que quelque chose a été créé ou modifié.",
    "Tu ne dois pas utiliser de termes internes dans la question.",
    "Si l'ambiguïté est réelle, pose une seule question.",
    "Si l'utilisateur change de sujet, retourne topic_change.",
    "Si l'utilisateur refuse ou annule, retourne cancelled.",
    "Retourne uniquement un objet JSON conforme au contrat demandé.",
  ].join("\n");
}

function publicRequestForPrompt(
  request: ClarificationRequest,
  previousState?: ClarificationState | null,
  requestId?: string | null,
): Record<string, unknown> {
  return {
    request_id: requestId ?? null,
    clarification_id: request.clarification_id,
    owner: request.owner,
    ambiguity_kind: request.ambiguity_kind,
    user_message: request.user_message,
    recent_messages: request.recent_messages.slice(-8),
    active_flow_state: request.active_flow_state,
    known_context: request.known_context ?? {},
    previous_state: previousState
      ? {
        clarification_id: previousState.clarification_id,
        owner: previousState.owner,
        ambiguity_kind: previousState.ambiguity_kind,
        known_context: previousState.known_context ?? {},
        turn_count: previousState.turn_count,
        max_turns: previousState.max_turns,
      }
      : null,
    candidates: request.candidates,
    clarification_resources: buildClarificationPromptResources(request),
    constraints: {
      no_chat_mutation: true,
      max_questions: 1,
      avoid_internal_terms: true,
    },
    output_contract: {
      status: "ask | resolved | still_ambiguous | cancelled | topic_change",
      selected_candidate_id:
        "null or one of the exact candidate ids; required when status=resolved",
      confidence: "low | medium | high",
      question:
        "one short natural user-facing question; required for ask/still_ambiguous",
      user_goal_summary: "optional short summary",
      reasoning_summary: "optional short internal validation summary",
      handoff_notes:
        "optional known_slots, missing_decision, recommended_next_step",
    },
  };
}

export async function runClarificationTool(input: {
  request: ClarificationRequest;
  previous_state?: ClarificationState | null;
  llm_runner: ClarificationLlmRunner;
  model_name?: string;
  request_id?: string | null;
}): Promise<ClarificationToolOutput> {
  const modelName = input.model_name || DEFAULT_MODEL_NAME;
  const request = {
    ...input.request,
    recent_messages: input.request.recent_messages.slice(-8),
    constraints: {
      no_chat_mutation: true,
      max_questions: 1,
      avoid_internal_terms: true,
    },
  } satisfies ClarificationRequest;

  try {
    const raw = await input.llm_runner({
      system_prompt: buildSystemPrompt(),
      user_prompt: JSON.stringify(
        publicRequestForPrompt(request, input.previous_state, input.request_id),
      ),
      json_mode: true,
      model_name: modelName,
    });
    return normalizeOutput(raw, request, input.previous_state ?? null);
  } catch {
    return outputFallback(request);
  }
}
