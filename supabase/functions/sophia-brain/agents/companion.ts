import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  generateEmbedding,
  type GeminiReasoningEffort,
  generateWithGemini,
  getGlobalAiModel,
} from "../../_shared/gemini.ts";
import {
  visibleConversationFlowRules,
  visibleOutputStyleRules,
} from "../router/response_style_policy.ts";
// W9 — R3. La langue de la réponse visible est RÉSOLUE par le propriétaire du
// tour (`router/run.ts`) et reçue ici; le bloc RESPONSE_LANGUAGE part en
// DERNIÈRE instruction, après la passe de budget.
import {
  appendResponseLanguageBlock,
  isFrenchLocale,
  withPersistedConversationLocale,
} from "../../_shared/keel/locale.ts";
declare const Deno: any;

// Budget dimensionné sur le contexte réellement assemblé: prompt stable
// ~13k chars + contexte runtime ~19k (mesure du 10/07, user avec plan +
// potions + mémoire V2 active). L'ancien cap de 5000 tokens (20k chars)
// tronquait silencieusement ~2/3 du contexte par la queue — le bloc
// MEMOIRE V2 et le plan de semaine mouraient à chaque tour. La troncature
// reste le garde-fou d'urgence; l'ordre de buildContextString est l'ordre
// de survie.
const COMPANION_PROMPT_MAX_TOKENS = 8000;
const COMPANION_PROMPT_MAX_CHARS = COMPANION_PROMPT_MAX_TOKENS * 4;
const QUESTION_RHYTHM_WINDOW_SIZE = 6;
const RESEARCH_CONTEXT_MARKER = "=== RECHERCHE WEB (informations fraiches) ===";

type QuestionTendency = "low" | "normal" | "high";
type QuestionGuidance = "avoid_now" | "optional" | "ask_now";

type CompanionQuestionRhythmState = {
  preference?: QuestionTendency;
  recent_turns?: number[];
  turns_since_last_question?: number;
  last_turn_had_question?: boolean;
  last_updated_at?: string;
};

type CompanionQuestionRhythmGuide = {
  preference: QuestionTendency;
  recentTurns: number[];
  questionsInWindow: number;
  turnsSinceLastQuestion: number;
  guidance: QuestionGuidance;
};

function applyCompanionPromptBudget(prompt: string): string {
  const text = String(prompt ?? "");
  if (text.length <= COMPANION_PROMPT_MAX_CHARS) return text;
  const suffix =
    "\n\n[... CONTEXTE TRONQUE POUR RESPECTER LE BUDGET PROMPT ...]\n";
  const keep = Math.max(0, COMPANION_PROMPT_MAX_CHARS - suffix.length);
  return text.slice(0, keep).trimEnd() + suffix;
}

function simplePromptHash(input: string): string {
  let hash = 2166136261;
  const text = String(input ?? "");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function splitPinnedResearchContext(
  context: string,
): { otherContext: string; researchContext: string } {
  const text = String(context ?? "");
  const markerIndex = text.indexOf(RESEARCH_CONTEXT_MARKER);
  if (markerIndex < 0) {
    return { otherContext: text.trim(), researchContext: "" };
  }

  const otherContext = text.slice(0, markerIndex).trim();
  const researchContext = text.slice(markerIndex).trim();
  return { otherContext, researchContext };
}

function compactUserModelFactsBlock(block: string): string {
  const lines = String(block ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const coachLines = lines.filter((line) => line.startsWith("coach."));
  if (coachLines.length === 0) return block.trim();

  const explicitLines = coachLines.filter((line) =>
    line.includes("src=explicit_user")
  );
  const usefulDefaults = coachLines.filter((line) =>
    line.startsWith("coach.tone") ||
    line.startsWith("coach.message_length") ||
    line.startsWith("coach.question_tendency")
  );
  const selected = [...new Set([...explicitLines, ...usefulDefaults])].slice(
    0,
    6,
  );
  if (selected.length === 0) return "";
  return [
    "=== USER MODEL (FACTS) ===",
    "Préférences utiles, à appliquer sans les nommer:",
    ...selected,
  ].join("\n");
}

function stripEmptyContextModuleBlocks(context: string): string {
  const marker = "=== CONTEXTE MODULE (UI) ===";
  const text = String(context ?? "");
  const start = text.indexOf(marker);
  if (start < 0) return text;
  const before = text.slice(0, start);
  const rest = text.slice(start + marker.length);
  const nextIndex = rest.indexOf("\n===");
  const body = nextIndex >= 0 ? rest.slice(0, nextIndex) : rest;
  const after = nextIndex >= 0 ? rest.slice(nextIndex) : "";
  if (body.trim()) return text;
  return `${before}${after}`.replace(/\n{3,}/g, "\n\n").trim();
}

function compactCompanionContextForPrompt(context: string): string {
  let text = stripEmptyContextModuleBlocks(String(context ?? ""));
  const userFactsMarker = "=== USER MODEL (FACTS) ===";
  const userFactsStart = text.indexOf(userFactsMarker);
  if (userFactsStart >= 0) {
    const before = text.slice(0, userFactsStart);
    const fromStart = text.slice(userFactsStart);
    const nextSection = fromStart.indexOf("\n===", userFactsMarker.length);
    const userFactsBlock = nextSection >= 0
      ? fromStart.slice(0, nextSection)
      : fromStart;
    const after = nextSection >= 0 ? fromStart.slice(nextSection) : "";
    const compactFacts = compactUserModelFactsBlock(userFactsBlock);
    text = `${before}${compactFacts ? `${compactFacts}\n` : ""}${after}`;
  }
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

// Étiquettes des blocs de contexte. Les MARQUEURS (`=== ... ===`) sont
// produits ailleurs et servent de clés de découpe: ils ne sont jamais
// traduits (les renommer supprimerait silencieusement le contexte — classe
// d'échec N3 de BELT_AUDIT). Seule la prose d'enrobage, que ce module écrit
// lui-même, suit la langue de réponse.
function contextWrapperLabels(responseLocale: string): {
  research: string;
  living: string;
} {
  if (isFrenchLocale(responseLocale)) {
    return {
      research:
        "CONTEXTE WEB PRIORITAIRE (A UTILISER EN PRIORITE SI LA QUESTION EST FACTUELLE OU FRAICHE) :",
      living: "CONTEXTE VIVANT (Ce que l'on sait de lui MAINTENANT) :",
    };
  }
  return {
    research:
      "PRIORITY WEB CONTEXT (USE THIS FIRST IF THE QUESTION IS FACTUAL OR TIME-SENSITIVE):",
    living: "LIVING CONTEXT (what we know about them RIGHT NOW):",
  };
}

function buildCompanionContextBlock(
  context: string,
  responseLocale: string,
): string {
  const compactContext = compactCompanionContextForPrompt(context);
  const { otherContext, researchContext } = splitPinnedResearchContext(
    compactContext,
  );
  const labels = contextWrapperLabels(responseLocale);
  const parts: string[] = [];

  if (researchContext) {
    parts.push(`${labels.research}\n${researchContext}`);
  }
  if (otherContext) {
    parts.push(`${labels.living}\n${otherContext}`);
  }

  return parts.join("\n\n");
}

function applyCompanionPromptBudgetWithPinnedContext(args: {
  basePrompt: string;
  rawContext: string;
  researchPinned: boolean;
  responseLocale: string;
}): string {
  const basePrompt = String(args.basePrompt ?? "").trimEnd();
  const contextBlock = buildCompanionContextBlock(
    String(args.rawContext ?? ""),
    args.responseLocale,
  );
  if (!contextBlock) return applyCompanionPromptBudget(basePrompt);

  const combined = `${basePrompt}\n${contextBlock}`;
  if (!args.researchPinned) return applyCompanionPromptBudget(combined);
  if (combined.length <= COMPANION_PROMPT_MAX_CHARS) return combined;

  const suffix =
    "\n\n[... CONTEXTE TRONQUE POUR RESPECTER LE BUDGET PROMPT ...]\n";
  const remaining = COMPANION_PROMPT_MAX_CHARS - basePrompt.length - 1;
  if (remaining <= 0) return applyCompanionPromptBudget(basePrompt);

  const { otherContext, researchContext } = splitPinnedResearchContext(
    args.rawContext,
  );
  const labels = contextWrapperLabels(args.responseLocale);
  const pinnedParts: string[] = [];
  if (researchContext) {
    pinnedParts.push(`${labels.research}\n${researchContext}`);
  }
  const pinnedBlock = pinnedParts.join("\n\n").trim();
  const otherBlock = otherContext ? `${labels.living}\n${otherContext}` : "";

  if (!pinnedBlock) return applyCompanionPromptBudget(combined);

  const pinnedWithSpacing = `\n${pinnedBlock}`;
  if (
    basePrompt.length + pinnedWithSpacing.length > COMPANION_PROMPT_MAX_CHARS
  ) {
    return applyCompanionPromptBudget(`${basePrompt}${pinnedWithSpacing}`);
  }

  const availableForOther = COMPANION_PROMPT_MAX_CHARS - basePrompt.length -
    pinnedWithSpacing.length;
  if (!otherBlock || availableForOther <= suffix.length) {
    return `${basePrompt}${pinnedWithSpacing}`;
  }

  const keep = Math.max(0, availableForOther - suffix.length - 2);
  const truncatedOther = otherBlock.slice(0, keep).trimEnd();
  const otherSection = truncatedOther ? `\n\n${truncatedOther}${suffix}` : "";

  return `${basePrompt}${pinnedWithSpacing}${otherSection}`.trimEnd();
}

function normalizeQuestionTendency(value: unknown): QuestionTendency {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "low" || raw === "high" ? raw : "normal";
}

function normalizeForPreferenceParsing(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function questionTendencyValueFromText(
  value: unknown,
): QuestionTendency | null {
  const raw = normalizeForPreferenceParsing(value);
  if (
    /\blow\b/.test(raw) ||
    raw.includes("peu_de_questions") ||
    raw.includes("peu de questions") ||
    raw.includes("moins de questions") ||
    raw.includes("poser moins de questions")
  ) {
    return "low";
  }
  if (
    /\bhigh\b/.test(raw) ||
    raw.includes("tres_questionnant") ||
    raw.includes("tres questionnant") ||
    raw.includes("plus de questions") ||
    raw.includes("poser davantage de questions")
  ) {
    return "high";
  }
  if (
    /\bnormal\b/.test(raw) ||
    raw.includes("equilibre") ||
    raw.includes("equilibree") ||
    raw.includes("normale") ||
    raw.includes("niveau equilibre de questions") ||
    raw.includes("questions equilibrees")
  ) {
    return "normal";
  }
  return null;
}

function extractContextBlock(
  context: string,
  startMarker: string,
  endMarker?: string,
): string | null {
  const start = context.indexOf(startMarker);
  if (start < 0) return null;
  const fromStart = context.slice(start);
  if (!endMarker) {
    const nextSection = fromStart.indexOf("\n===", startMarker.length);
    return nextSection >= 0 ? fromStart.slice(0, nextSection) : fromStart;
  }
  const end = fromStart.indexOf(endMarker);
  return end >= 0 ? fromStart.slice(0, end + endMarker.length) : fromStart;
}

function parseQuestionTendencyFromContext(
  context: string,
): QuestionTendency | null {
  const rawContext = String(context ?? "");
  const runtimePreferenceBlock = extractContextBlock(
    rawContext,
    "=== PREFERENCES COACH UTILISATEUR",
    "=== FIN PREFERENCES COACH UTILISATEUR ===",
  );
  const runtimeQuestionLines = runtimePreferenceBlock
    ?.split("\n")
    .filter((line) => {
      const normalized = normalizeForPreferenceParsing(line);
      return normalized.includes("question") ||
        normalized.includes("interrogative");
    })
    .join("\n") ?? null;
  const runtimePreference = runtimeQuestionLines
    ? questionTendencyValueFromText(runtimeQuestionLines)
    : null;
  if (runtimePreference) return runtimePreference;

  const userFactsBlock = extractContextBlock(
    rawContext,
    "=== USER MODEL (FACTS) ===",
  );
  if (!userFactsBlock) return null;
  const questionTendencyLine = userFactsBlock
    .split("\n")
    .find((line) => line.includes("coach.question_tendency"));
  return questionTendencyValueFromText(questionTendencyLine);
}

function readQuestionRhythmState(userState: any): CompanionQuestionRhythmState {
  const raw = (userState?.temp_memory as any)?.companion_question_rhythm;
  if (!raw || typeof raw !== "object") return {};
  const recentTurns = Array.isArray(raw.recent_turns)
    ? raw.recent_turns
      .map((v: unknown) => Number(v))
      .filter((v: number) => v === 0 || v === 1)
      .slice(-QUESTION_RHYTHM_WINDOW_SIZE)
    : [];
  const turnsSinceLastQuestionRaw = Number(raw.turns_since_last_question);
  return {
    preference: normalizeQuestionTendency(raw.preference),
    recent_turns: recentTurns,
    turns_since_last_question: Number.isFinite(turnsSinceLastQuestionRaw)
      ? Math.max(0, Math.floor(turnsSinceLastQuestionRaw))
      : recentTurns.includes(1)
      ? 0
      : recentTurns.length,
    last_turn_had_question: Boolean(raw.last_turn_had_question),
    last_updated_at: typeof raw.last_updated_at === "string"
      ? raw.last_updated_at
      : undefined,
  };
}

function buildQuestionRhythmGuide(
  context: string,
  userState: any,
): CompanionQuestionRhythmGuide {
  const stored = readQuestionRhythmState(userState);
  const preference = parseQuestionTendencyFromContext(context) ??
    stored.preference ?? "normal";
  const recentTurns = Array.isArray(stored.recent_turns)
    ? stored.recent_turns.slice(-QUESTION_RHYTHM_WINDOW_SIZE)
    : [];
  const questionsInWindow = recentTurns.reduce(
    (sum, value) => sum + (value === 1 ? 1 : 0),
    0,
  );
  const turnsSinceLastQuestion =
    Number.isFinite(Number(stored.turns_since_last_question))
      ? Math.max(0, Math.floor(Number(stored.turns_since_last_question)))
      : recentTurns.includes(1)
      ? 0
      : recentTurns.length;

  const cfg = preference === "low"
    ? { optionalAfter: 2, askAfter: 4, maxQuestionsInWindow: 1 }
    : preference === "high"
    ? { optionalAfter: 1, askAfter: 2, maxQuestionsInWindow: 3 }
    : { optionalAfter: 1, askAfter: 3, maxQuestionsInWindow: 2 };

  let guidance: QuestionGuidance = "avoid_now";
  if (
    recentTurns.length >= QUESTION_RHYTHM_WINDOW_SIZE &&
    questionsInWindow >= cfg.maxQuestionsInWindow
  ) {
    guidance = "avoid_now";
  } else if (turnsSinceLastQuestion >= cfg.askAfter) {
    guidance = "ask_now";
  } else if (turnsSinceLastQuestion >= cfg.optionalAfter) {
    guidance = "optional";
  }

  return {
    preference,
    recentTurns,
    questionsInWindow,
    turnsSinceLastQuestion,
    guidance,
  };
}

function buildQuestionRhythmPromptBlock(
  context: string,
  userState: any,
  responseLocale: string,
): string {
  const guide = buildQuestionRhythmGuide(context, userState);
  const windowSize = guide.recentTurns.length > 0
    ? guide.recentTurns.length
    : QUESTION_RHYTHM_WINDOW_SIZE;
  if (!isFrenchLocale(responseLocale)) {
    const instructionEn = guide.guidance === "ask_now"
      ? "Ideally ask 1 useful question this turn, unless the student mainly expects a direct answer or reassurance."
      : guide.guidance === "optional"
      ? "Question optional. Without one, keep momentum with a hypothesis, a reflection or a stance."
      : "Avoid asking a question unless strongly needed; prefer a hypothesis, a reflection or a useful rephrasing.";
    const ratioEn = guide.preference === "low"
      ? "about 1 question every 4 turns"
      : guide.preference === "high"
      ? "about 1 question every 2 turns"
      : "about 1 question every 3 turns";
    return [
      "=== QUESTION RHYTHM (CRITICAL) ===",
      `- Student preference: ${guide.preference}. Target: ${ratioEn}.`,
      `- History: ${guide.questionsInWindow} question(s) over ${windowSize} turns; last one ${guide.turnsSinceLastQuestion} turn(s) ago.`,
      `- Guidance: ${guide.guidance}.`,
      `- ${instructionEn}`,
      "- Even on ask_now: no forced question on a factual answer, a rushed message, an emotion that calls for presence, or right after a platform redirect.",
      "- If you do ask: one question, concrete, useful.",
    ].join("\n");
  }
  const guidanceInstruction = guide.guidance === "ask_now"
    ? "Pose idealement 1 question utile sur ce tour, sauf si le user attend surtout une reponse directe ou un apaisement."
    : guide.guidance === "optional"
    ? "Question optionnelle. Sans question, garde l'elan avec hypothese, reflet ou prise de position."
    : "Evite la question sauf necessite forte; prefere hypothese, reflet ou reformulation utile.";
  const ratioTarget = guide.preference === "low"
    ? "environ 1 question tous les 4 tours"
    : guide.preference === "high"
    ? "environ 1 question tous les 2 tours"
    : "environ 1 question tous les 3 tours";
  return [
    "=== QUESTION RHYTHM (CRITIQUE) ===",
    `- Préférence user: ${guide.preference}. Cible: ${ratioTarget}.`,
    `- Historique: ${guide.questionsInWindow} question(s) sur ${windowSize} tours; dernière il y a ${guide.turnsSinceLastQuestion} tour(s).`,
    `- Guidance: ${guide.guidance}.`,
    `- ${guidanceInstruction}`,
    "- Même si ask_now: pas de question forcée en réponse factuelle, message pressé, émotion qui demande présence, ou redirection plateforme récente.",
    "- Si question: unique, concrete, utile.",
  ].join("\n");
}

function responseHasQuestion(text: string): boolean {
  const value = String(text ?? "");
  return value.includes("?") || value.includes("？");
}

function buildNextQuestionRhythmState(args: {
  userState: any;
  context: string;
  responseText: string;
}): CompanionQuestionRhythmState {
  const previous = readQuestionRhythmState(args.userState);
  const preference = parseQuestionTendencyFromContext(args.context) ??
    previous.preference ?? "normal";
  const hadQuestion = responseHasQuestion(args.responseText);
  const prevTurns = Array.isArray(previous.recent_turns)
    ? previous.recent_turns
    : [];
  const previousGap =
    Number.isFinite(Number(previous.turns_since_last_question))
      ? Math.max(0, Math.floor(Number(previous.turns_since_last_question)))
      : prevTurns.includes(1)
      ? 0
      : prevTurns.length;
  return {
    preference,
    recent_turns: [...prevTurns, hadQuestion ? 1 : 0].slice(
      -QUESTION_RHYTHM_WINDOW_SIZE,
    ),
    turns_since_last_question: hadQuestion ? 0 : previousGap + 1,
    last_turn_had_question: hadQuestion,
    last_updated_at: new Date().toISOString(),
  };
}

// R3 — les lecteurs/écrivain de `conversation_locale` ont été remontés dans
// `_shared/keel/locale.ts`, à côté du résolveur. Ce module ne décide plus de la
// langue: il la REÇOIT (`opts.responseLocale`). Tant que la décision vivait
// ici, seuls les tours possédés par le composeur committaient une locale — un
// tour pris par une skill n'en persistait aucune, et le fil dérivait.

export type CompanionModelOutput = string;

export type CompanionDelivery =
  | { mode: "text_reply" }
  | { mode: "reaction_only"; emoji: string; reason: string | null }
  | { mode: "no_response"; reason: string | null };

export type CompanionRunResult = {
  text: string;
  delivery?: CompanionDelivery;
  executed_tools: string[];
  tool_execution: "none" | "blocked" | "success" | "failed" | "uncertain";
  temp_memory?: any;
};

const ALLOWED_REACTION_EMOJIS = new Set(["✅", "🙂", "🙏", "💛", "😂"]);

export function parseCompanionDeliveryDirective(text: unknown): {
  visibleText: string;
  delivery: CompanionDelivery;
} {
  let visibleText = String(text ?? "");
  let delivery: CompanionDelivery = { mode: "text_reply" };
  const directivePattern =
    /\s*<!--\s*sophia_delivery\s*:\s*(reaction_only|no_response)([\s\S]*?)-->\s*/i;
  visibleText = visibleText.replace(
    directivePattern,
    (_match, rawMode, rawAttrs) => {
      const mode = String(rawMode ?? "").trim();
      const attrs = String(rawAttrs ?? "");
      const reason = attrs.match(/\breason\s*=\s*"([^"]{0,160})"/i)?.[1]
        ?.trim() ||
        null;
      if (mode === "reaction_only") {
        const emoji = attrs.match(/\bemoji\s*=\s*"([^"]{1,8})"/i)?.[1]
          ?.trim();
        delivery = {
          mode: "reaction_only",
          emoji: emoji && ALLOWED_REACTION_EMOJIS.has(emoji) ? emoji : "✅",
          reason,
        };
      } else if (mode === "no_response") {
        delivery = { mode: "no_response", reason };
      }
      return "\n";
    },
  );
  return {
    visibleText: visibleText.replace(/\n{3,}/g, "\n\n").trim(),
    delivery,
  };
}

function parseCompanionDeliveryForChannel(
  text: unknown,
  channel: "web" | "whatsapp" | undefined,
): {
  visibleText: string;
  delivery: CompanionDelivery;
} {
  if (channel !== "whatsapp") {
    return {
      visibleText: String(text ?? "").trim(),
      delivery: { mode: "text_reply" },
    };
  }
  return parseCompanionDeliveryDirective(text);
}

function normalizeCompanionIntentText(message: string): string {
  return String(message ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function humanizeCompanionMemoryLine(line: string): string {
  const cleaned = String(line ?? "")
    .replace(/\s+Priorite:.*$/i, "")
    .replace(/\bPattern famille [a-z0-9:_-]+\s*:\s*/i, "")
    .replace(/^Sur\s+[^,]+,\s+/i, "")
    .replace(/\bNiveau precedent\s+/i, "Au niveau précédent, ")
    .replace(/\ble user\b/gi, "tu")
    .replace(/\bquand il ouvre\b/gi, "quand tu ouvres")
    .replace(/\bet lance\b/gi, "et que tu lances")
    .replace(/\bdemarre\b/gi, "démarres")
    .replace(/\bdemarrage\b/gi, "démarrage")
    .replace(/\bdeja\b/gi, "déjà")
    .replace(/\bpret\b/gi, "prêt")
    .replace(/\bevite\b/gi, "évite")
    .replace(/\beviter\b/gi, "éviter")
    .trim();
  if (!cleaned) return "";
  const sentence = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return sentence.endsWith(".") ? sentence : `${sentence}.`;
}

function renderHumanMemoryOnlyActionRecall(
  lines: string[],
  target?: string,
): string {
  const humanLines = lines
    .map((line) => humanizeCompanionMemoryLine(line))
    .filter(Boolean)
    .slice(0, 3);
  const exactLine = humanLines.find((line) => {
    const lower = line.toLowerCase();
    return lower.includes("fichier deja pret") ||
      lower.includes("fichier déjà prêt") ||
      lower.includes("minuteur") ||
      lower.includes("12 minutes");
  });
  const familyLine = humanLines.find((line) => {
    const lower = line.toLowerCase();
    return lower.includes("cible augmente") ||
      lower.includes("sous 15 minutes") ||
      lower.includes("intimidante");
  });
  const selectedLines = [
    ...(exactLine ? [exactLine] : []),
    ...(familyLine && familyLine !== exactLine ? [familyLine] : []),
  ];
  const usefulLines = selectedLines.length > 0 ? selectedLines : humanLines;
  if (usefulLines.length === 0) {
    return "Je n'ai pas assez d'éléments propres sur cette action pour en tirer quelque chose de fiable.";
  }
  const intro = target
    ? `Oui. Pour ${target}, ce qui ressort est simple :`
    : "Oui. Ce qui ressort est simple :";
  const closing = exactLine || familyLine
    ? "Donc je garderais surtout ça : préparer le démarrage, puis lancer le minuteur directement."
    : "Donc je garderais surtout ces signaux, sans en faire une règle rigide.";
  return [
    intro,
    ...usefulLines.map((line) => `- ${line}`),
    closing,
  ].join("\n");
}

function renderMemoryOnlyActionRecallReply(args: {
  message: string;
  context: string;
}): string | null {
  void args;
  return null;
}

function joinPromptSections(sections: string[]): string {
  return sections
    .map((section) => section.trim())
    .filter(Boolean)
    .join("\n\n");
}

function buildCompanionChannelRulesEn(isWhatsApp: boolean): string {
  if (isWhatsApp) {
    return `
    CHANNEL_OVERLAY WHATSAPP:
    - Short by default: 1-2 sentences. Longer only if the student asks, if the subject is dense, or if the emotion warrants it.
    - Plain text: no **, no "hi"/"hello" in the middle of a running conversation.
    - Off-topic: one short useful, human remark, without digging in with a question.
    - Message deletion: explain that it changes the visible history but does not reset the other system traces.
    - Always end with this hidden note on a line of its own:
      <!--fil_rouge_whatsapp: [1-2 very short sentences: where we are, what was said or tried, next step or point to keep in mind]-->
    `;
  }

  return `
  CHANNEL_OVERLAY WEB:
  - Short by default; expand only if asked or warranted.
  - No **. Plain text. No hello/goodbye in the middle of a running conversation unless the student does it first.
  `;
}

function buildCompanionChannelRules(isWhatsApp: boolean): string {
  if (isWhatsApp) {
    return `
    CHANNEL_OVERLAY WHATSAPP:
    - Réponse courte par défaut: 1-2 phrases; plus long seulement si le user le demande, si le sujet est dense, ou si l'émotion le justifie.
    - Texte brut: pas de **, pas de bonjour/salut au milieu d'une conversation.
    - Hors-sujet: courte remarque utile/humaine, sans creuser avec une question.
    - Suppression de messages: explique que ça change l'historique visible mais ne reset pas les autres traces système.
    - Ajoute toujours à la fin cette note cachée sur une ligne seule:
      <!--fil_rouge_whatsapp: [1-2 phrases tres courtes: ou on en est, ce qui a ete dit/tente, prochain pas ou point a garder en tete]-->
    `;
  }

  return `
  CHANNEL_OVERLAY WEB:
  - Court par défaut; développe seulement si demandé ou justifié.
  - Pas de **. Texte brut. Pas de bonjour/salut/au revoir au milieu d'une conversation sauf si le user le fait.
  `;
}

/**
 * W9 — CLASSE B, pack ANGLAIS. Le persona est RÉÉCRIT, pas traduit.
 *
 * Le pack FR se présente comme « Sophia, partenaire conversationnelle » — une
 * amie généraliste. Ce n'est pas ce produit: KEEL est le runtime du protocole
 * que le COACH a écrit. L'IA ne rédige jamais le plan, elle l'exécute, et elle
 * n'accuse jamais réception d'un effet non committé. Traduire l'ancien persona
 * mot à mot aurait donné à un coach anglophone une amie bavarde là où il
 * attend l'exécution fidèle de sa prescription.
 *
 * Ce qui NE CHANGE PAS entre les deux packs, parce que ce sont des jetons
 * machine (R1) et non de la prose: `<!--sophia_delivery:...-->`,
 * `<!--fil_rouge...-->`, les en-têtes de section, et les noms de blocs de
 * contexte injectés (`DIRECT_EFFECT_CONFIRMATION_CONTEXT`).
 */
function buildCompanionStablePromptEn(opts: {
  isWhatsApp: boolean;
}): string {
  const { isWhatsApp } = opts;
  return joinPromptSections([
    `
    CORE_COMPANION:
    You are the conversational runtime of KEEL. A coach wrote this student's protocol; your job is to execute it faithfully, not to rewrite it.
    You are lucid, warm, direct and genuinely capable. You never write the plan, never grade it, and never invent a prescription.
    In normal_reply you answer the student's last message first. This is not coaching by default.
    Stance: a sharp, well-informed presence — not a coach hunting for the next step at every turn.
    Never refer to yourself by a product name, and never call yourself "Sophia".

    ${visibleOutputStyleRules("en-US")}
    ${visibleConversationFlowRules("en-US")}
    `,

    `
    OUTPUT_STYLE:
    - One useful idea before any follow-up.
    - Be actually useful: writing, technical help, summaries, opinions, practicalities.
    - Never say "that's not my role". If you do not know, say so plainly.
    - No diagnosis, no moralising, no artificial therapeutic tone, no automatic "I understand that...".
    - 1 emoji by default, 2 max; none in a crisis, a bereavement, or a technical failure. A style constraint accepted during the session, support turns included, holds: zero emoji for as long as it holds.
    - If the student is sad or stressed: real presence before any proposal.
    - Short or rushed message ("ok", "go"): 1-2 sentences max; a question only if necessary.
    `,

    buildCompanionChannelRulesEn(isWhatsApp),

    `
    NORMAL_REPLY_POLICY:
    - Answer the real need first: conversation, support, clarification, action, a light check-in, or an ambiguous request.
    - Conversational fluidity beats optimisation. No mini coaching session unless the student asks for help, a method, a plan, a choice or a debrief.
    - No unrequested A/B choices ("do you want X or Y") unless the student explicitly asks to compare or structure.
    - No unrequested coaching prompts ("want to dig into it?").
    - Mentioning an action, fatigue, resistance, a success or a routine is NOT a request to act: answer the conversational need first.
    - If the student wants to "just understand / just talk", or says "no action": no immediate micro-action; reflect back, offer a short hypothesis, give an honest opinion.
    - Discouraged, ashamed, sad or frustrated student: simple presence, less pressure, a small step only if useful. Do not automatically offer a tool.
    - Post-distress bridge: if your previous reply was support through a low point, never make this turn 100% transactional. Do the task with a real sentence of emotional bridge (not just an emoji) acknowledging the previous turn.
    - Last message wins: if it swings into emotional weight (discouragement, "what's the point") after product or plan turns, receive the emotion first, without reinterpreting it as a product question and without extending the previous topic.
    - Talk about the plan or the protocol only if the student brings it up, if the context calls for it, or if it is genuinely useful.
    - Never ratify a routine or a direction as a new plan. The plan is the coach's writing; you do not extend it.
    `,

    `
    LOOP_RECOVERY:
    - Conversational presence of mind: if the reply is going in circles, do not repeat the same validation or the same prompt.
    - Visible loop: the same agreement, invitation or promise repeated with no useful content and no real step.
    - Repair: acknowledge that you may have lost the thread, pick the last certain point back up, then one single clarification or a return to basics.
    - Writes: DIRECT_EFFECT_CONFIRMATION_CONTEXT is the ONLY truth. With no committed outcome (or with no context at all), never say "done / logged / saved / scheduled / fixed"; follow the guidance, and ask clarify_question if one is present.
    `,

    `
    CONTEXT_RULES:
    - Rebuild the thread from the running summary and the available context without ever exposing that work.
    - If the last message asks you to shorten, rephrase or simplify, apply it to the last active content; keep the referent unless it clearly changed.
    - Ambiguous follow-up between recent topics: clarify in one sentence instead of choosing; otherwise answer directly.
    - A last message that closes, or says "not now / I'll handle it": short closure, no question, no proposal.
    - Use the context silently; never say "I see in your data" or "your memory says".
    - Date and time: use the injected temporal markers; state them when useful. Confusing date: clarify with a concrete date.
    - Age: adjust tone and examples slightly; mention it only if relevant. Never talk down.
    - Profile and preferences: adapt tone, length and directness without reciting the profile. A style preference expressed during the session (tone, emojis, length) applies to EVERY following turn, support turns included.
    - Memory: useful context, not absolute truth. If it is old or uncertain, stay careful. Never invent a memory that is absent.
    - When asked what you remember, use only the loaded context.
    - A personal fact explicitly confided for you to keep: sober acknowledgement ("noted"), memorisation is automatic; no initiative and no reminder in its place.
    - Never use that acknowledgement for a protocol action: a committed outcome (any lane) is acknowledged POSITIVELY — never "I can't say it was logged"; with nothing committed, say plainly that it is not recorded.
    - Protocol and plan: the injected plan context is the primary source for "what do I have to do?", "where am I?", "I did X" and "I'm stuck".
    - When a relevant prescribed line is listed, speak to it directly and clarify the next step; with several candidates, ask a short clarification or answer cautiously.
    - Only claim "it is in your plan" when the context lists the line. You never add one.
    - Light check-in or recap: answer compactly from the listed lines and the context, without an exhaustive view.
    - Platform boundary: outside the injected elements, answer only when the information is explicit in the context; otherwise point to the app for the full view. Never invent a list, never say "I'll go check elsewhere", never invent a screen or a path.
    - Questions about features ("what is this / what is it for"): explain what it enables, without starting, creating or configuring anything.
    `,

    `
    TASK_OVERLAYS:
    - Apply the injected context blocks without reciting their titles or their internal logic.
    - Normal chat creates, configures, activates, prepares, starts and modifies NOTHING (cancelling or moving a reminder included). Point to the app, without denying an effect that is already confirmed.
    - Reminder status: never volunteered when the student did not ask for it this turn — especially on an emotional turn or coming out of a crisis.
    - Review and actions: use the data present without inventing a screen or a routine; something counts as completed only if the student says so.
    - USER MODEL: adapt style and timing to the loaded preferences without naming them; never override an explicit preference.
    `,

    `
    SILENCE_AND_REACTIONS:
    - Last message is a bare acknowledgement, thanks, laughter or closure after a sufficient answer ("exactly", "ok perfect", "thanks"): do not restart the conversation.
    - After a finished flow (review, exercise): on a simple courtesy or goodbye, return the courtesy in one short sentence, without re-announcing the closure or re-summarising the finished review.
    - On WhatsApp, if a reaction is enough, write only: <!--sophia_delivery:reaction_only emoji="✅" reason="short_ack"-->
    - Emojis: ✅ acknowledgement, 🙂 presence, 🙏 thanks, 💛 support, 😂 laughter.
    - No_response is rare, for an explicit closure: <!--sophia_delivery:no_response reason="user_closed"-->
    - Never a bare reaction if there is a question, new information, a correction, a preference, significant emotion, a request for action or product help, or an active context.
    `,
  ]);
}

function buildCompanionStablePrompt(opts: {
  isWhatsApp: boolean;
}): string {
  const { isWhatsApp } = opts;
  return joinPromptSections([
    `
    CORE_COMPANION:
    Tu es Sophia, partenaire conversationnelle lucide, chaleureuse, directe et très capable.
    En normal_reply, tu réponds d'abord au dernier message utilisateur. Ce n'est pas du coaching par défaut.
    Posture: amie intelligente + IA experte, pas coach qui cherche toujours un prochain pas.
    N'écris jamais "Sophia" pour te désigner.

    ${visibleOutputStyleRules("fr-FR")}
    ${visibleConversationFlowRules("fr-FR")}
    `,

    `
    OUTPUT_STYLE:
    - Une seule idée utile avant toute relance.
    - Réponds utilement: rédaction, technique, résumé, avis, pratique.
    - Ne dis pas "ce n'est pas mon rôle"; si tu ne sais pas, dis-le simplement.
    - Pas de diagnostic, morale, ton thérapeutique artificiel, ni "je comprends que..." automatique.
    - 1 emoji par défaut, 2 max; sobre si crise, deuil ou erreur technique. Une contrainte de style acceptée en session PRIME, soutien compris: zéro emoji tant qu'elle tient.
    - Si le user est triste/stressé: présence réelle avant proposition.
    - Message court/pressé ("ok", "go"): 1-2 phrases max; question seulement si nécessaire.
    `,

    buildCompanionChannelRules(isWhatsApp),

    `
    NORMAL_REPLY_POLICY:
    - Réponds d'abord au besoin réel: conversation, soutien, clarification, action, point léger ou demande ambiguë.
    - Fluidité conversationnelle > optimisation. Pas de mini-session de coaching sans demande d'aide, méthode, plan, choix ou débrief.
    - Interdiction des choix A/B non demandés ("tu veux X ou Y") sauf demande explicite de comparer/structurer.
    - Interdiction des relances coaching non demandées ("on creuse ?").
    - Mentionner une action, fatigue, résistance, réussite ou routine ne veut pas dire demander à agir: réponds d'abord au besoin conversationnel.
    - Si le user veut "juste comprendre/parler", "pas d'action": pas de micro-action immédiate; reflet, hypothèse courte, avis honnête.
    - User découragé, honteux, triste ou frustré: présence simple, pression réduite, petit pas si utile. Ne propose pas automatiquement une carte, une potion ou un outil Sophia.
    - Pont post-détresse: si ta dernière réponse était du soutien face à un creux, jamais de réponse 100% transactionnelle ce tour-ci: exécute la demande avec un pont émotionnel d'une vraie phrase (pas juste un emoji) reconnaissant le tour d'avant.
    - Priorité au dernier message: s'il bascule vers une charge émotionnelle (découragement, "à quoi bon") après des tours produit/plan/outil, accueille l'émotion d'abord, sans la réinterpréter en question produit ni prolonger le sujet précédent.
    - Parle du plan/actions seulement si le user en parle, si le contexte le justifie, ou si utile.
    - Ne valide pas une routine/direction comme nouveau plan Sophia sans contexte opérationnel explicite.
    - La question finale n'est jamais obligatoire; respecte le rythme user.
    `,

    `
    LOOP_RECOVERY:
    - présence d'esprit conversationnelle: si la réponse tourne en rond, ne refais pas la même validation ou relance.
    - Boucle visible: même accord, invitation ou promesse répétée sans contenu utile ni étape réelle.
    - Répare: reconnais une possible perte de fil côté Sophia, reprends le dernier point certain, puis une seule précision ou retour à la base.
    - Acquiescement après réponse suffisante: clôture ou réaction, pas nouvelle boucle.
    - Écritures: DIRECT_EFFECT_CONFIRMATION_CONTEXT est la seule vérité. Sans committed (ou sans contexte), jamais "c'est fait/noté/enregistré/programmé/corrigé"; suis guidance, pose clarify_question si présente.
    `,

    `
    CONTEXT_RULES:
    - Reconstruis le fil depuis le fil rouge/contexte disponible sans exposer ce travail.
    - Si le dernier message demande de raccourcir/reformuler/simplifier, applique-le au dernier contenu actif; garde le référent sauf changement clair.
    - Follow-up ambigu entre sujets récents: clarifie en une phrase au lieu de choisir; sinon réponds direct.
    - Dernier message qui clôt ou dit "pas maintenant/je m'en occupe": clôture courte, sans question ni proposition.
    - Utilise le contexte silencieusement; jamais "je vois dans ta base" ni "ta mémoire dit que".
    - Date/heure: utilise les repères temporels injectés; affiche-les si utile. Date confuse: clarifie avec une date concrète.
    - Âge: adapte légèrement ton/exemples; ne le mentionne que si pertinent. N'infantilise jamais.
    - Sexe/genre: si connu au profil, accorde SYSTÉMATIQUEMENT participes/adjectifs. En cas de doute, reste neutre; sans déduire d'info sensible.
    - Profil/préférences: adapte ton/longueur/directivité sans réciter le profil; "je sais que tu..." seulement si naturel et utile. Une préférence de style exprimée en session (ton, emojis, longueur) s'applique à TOUS les tours suivants, y compris en mode soutien.
    - Mémoire: contexte utile, pas vérité absolue. Si ancien/incertain, reste prudent. N'invente jamais une mémoire absente.
    - Souvenirs mémorisés demandés: n'utilise que le contexte chargé.
    - Fait personnel explicitement confié à retenir: accusé sobre ("c'est noté"), mémorisation automatique; ni initiative ni rappel à la place.
    - Jamais cet accusé pour une action du plan: un outcome committed (toute lane) s'accuse POSITIVEMENT — jamais "je ne peux pas dire que c'est coché"; sans committed, dis que ce n'est pas enregistré.
    - Actions actives/plan: "SNAPSHOT COURT PLAN / ACTIONS ACTIVES" et "CONTEXTE OPERATIONNEL PLAN ACTIF" sont la source principale pour "j'ai quoi à faire ?", "où j'en suis ?", "j'ai fait X" ou "je suis bloqué".
    - Action active pertinente listée: parle-en directement, clarifie le prochain pas; plusieurs candidates: clarification courte ou réponse prudente.
    - N'affirme "dans ton plan/c'est prévu" que si le contexte liste l'action; une habitude active listée compte.
    - Point/récap léger: réponds compactement depuis les actions actives et le contexte, sans vue exhaustive.
    - Frontière plateforme: hors éléments injectés (cartes de défense/attaque actives, rappels récurrents actifs, potion active, préférences, objets Sophia), réponds seulement si l'info est explicite dans le contexte; sinon: vue complète dans la plateforme. Aucune liste inventée, jamais "je vais vérifier ailleurs".
    - Questions sur fonctionnalités ("c'est quoi/à quoi sert"): explique ce que ça permet, sans lancer/créer/configurer.
    `,

    `
    PLATFORM_SKETCH_FOR_NORMAL_REPLY:
    - Esquisse pour une question produit en normal_reply ou après une sortie de flow; court, sans inventer d'autres surfaces.
    - Plan: actions, missions, habitudes et ajustements.
    - Ressources: cartes d'attaque/défense, potions/état, outils consultables ou préparables.
    - Inspirations: contenus ou idées utiles pour nourrir la transformation.
    - Initiatives: messages récurrents planifiés par Sophia (quoi dire, horaire, rythme, destination Plan actuel ou Base de vie, actif/inactif).
    - Préférences coach: ton, niveau de challenge, tendance à poser des questions.
    - Cartes d'attaque: pousser une action voulue, créer de l'élan, préparer le passage à l'action.
    - Cartes de défense: tenir un cadre ou se protéger dans un moment de risque, tentation, pression ou dérapage.
    - Potions/État: traverser un état interne global.
    - Sections à nommer: Plan, Ressources, Inspirations, Initiatives. Ne présente pas Soutien, Missions ou Habitudes comme des sections de destination, ni comme réglage des messages récurrents. Pour ce cas, dis Initiatives.
    - Destination incertaine: donne la fonction générale et renvoie vers la plateforme, sans inventer de chemin.
    `,

    `
    TASK_OVERLAYS:
    - Applique les blocs de contexte injectés sans réciter leurs titres ni leur logique interne.
    - Module UI actif: si "=== CONTEXTE MODULE (UI) ===" contient une question active, ancre-toi dessus; n'invente pas d'exercice. Ajoute:
      <!--fil_rouge: [1-2 phrases: état actuel de l'exercice, ce qui a été exploré, ce qui reste]-->
    - Chat normal ne crée, configure, active, prépare, lance ni modifie rien (y compris annuler/décaler un rappel). Oriente vers la plateforme, sans nier un effet déjà confirmé.
    - Statut de rappel: jamais énoncé spontanément si le user ne le demande pas ce tour — surtout tour émotionnel/sortie de crise.
    - Bilan/actions: utilise les données présentes sans inventer d'écran ou routine; completed seulement si le user le mentionne.
    - USER MODEL: adapte style/timing aux préférences chargées sans les nommer; n'écrase pas une préférence explicite.
    `,

    `
    SILENCE_AND_REACTIONS:
    - Dernier message = simple acquiescement/remerciement/rire/clôture après réponse suffisante ("exactement", "ok parfait", "merci"): ne relance pas.
    - Après un flow terminé (bilan, exercice): sur une simple politesse/au revoir, rends la politesse en une phrase courte, sans ré-annoncer la clôture ni re-synthétiser le bilan terminé.
    - Sur WhatsApp, si une réaction suffit, écris uniquement: <!--sophia_delivery:reaction_only emoji="✅" reason="short_ack"-->
    - Emojis: ✅ validation, 🙂 présence, 🙏 merci, 💛 soutien, 😂 rire.
    - No_response rare, clôture explicite: <!--sophia_delivery:no_response reason="user_closed"-->
    - Jamais réaction seule si question, info nouvelle, correction, préférence, émotion importante, demande d'action/aide produit, ou contexte actif.
    `,
  ]);
}

function buildCompanionSemiStablePrompt(opts: {
  isWhatsApp: boolean;
  lastAssistantMessage: string;
  history?: any[];
  context: string;
  userState: any;
  responseLocale: string;
}): string {
  const {
    isWhatsApp,
    lastAssistantMessage,
    context,
    history,
    userState,
    responseLocale,
  } = opts;
  const questionRhythmBlock = buildQuestionRhythmPromptBlock(
    context,
    userState,
    responseLocale,
  );
  const recentHistoryBlock = formatCompanionRecentHistory(
    history ?? [],
    responseLocale,
  );
  const french = isFrenchLocale(responseLocale);
  const truncated = String(lastAssistantMessage ?? "").slice(
    0,
    isWhatsApp ? 120 : 100,
  );
  const lines = french
    ? [
      "=== META COMPAGNON ===",
      `- Canal: ${isWhatsApp ? "whatsapp" : "web"}.`,
      `- Risque actuel user: ${userState?.risk_level ?? 0}/10.`,
      "",
      questionRhythmBlock,
      "",
      `DERNIERE REPONSE DE SOPHIA : "${truncated}..."`,
      recentHistoryBlock,
    ]
    : [
      "=== COMPANION META ===",
      `- Channel: ${isWhatsApp ? "whatsapp" : "web"}.`,
      `- Current student risk: ${userState?.risk_level ?? 0}/10.`,
      "",
      questionRhythmBlock,
      "",
      `YOUR LAST REPLY: "${truncated}..."`,
      recentHistoryBlock,
    ];
  return lines.join("\n");
}

function formatCompanionRecentHistory(
  history: any[],
  responseLocale: string,
): string {
  const french = isFrenchLocale(responseLocale);
  const assistantLabel = french ? "Sophia" : "Assistant";
  const userLabel = french ? "User" : "Student";
  const recent = (Array.isArray(history) ? history : [])
    .filter((entry) => {
      const role = String(entry?.role ?? "");
      return role === "user" || role === "assistant";
    })
    .slice(-6)
    .map((entry) => {
      const role = String(entry?.role ?? "") === "assistant"
        ? assistantLabel
        : userLabel;
      const content = String(entry?.content ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220);
      return content ? `- ${role}: ${content}` : "";
    })
    .filter(Boolean);

  if (recent.length === 0) return "";

  return french
    ? [
      "",
      "=== HISTORIQUE RECENT VISIBLE ===",
      "Continuité, corrections, détection de répétition conversationnelle. Ne les utilise pas pour inventer un effet produit.",
      ...recent,
    ].join("\n")
    : [
      "",
      "=== RECENT VISIBLE HISTORY ===",
      "Continuity, corrections, detection of conversational repetition. Never use it to invent a product effect.",
      ...recent,
    ].join("\n");
}

function buildCompanionPromptParts(opts: {
  isWhatsApp: boolean;
  lastAssistantMessage: string;
  history?: any[];
  context: string;
  userState: any;
  /**
   * W9/R3 — locale of the VISIBLE reply. Required: a composer that guesses its
   * own language is exactly the module `resolveResponseLocale` exists to
   * forbid. Callers resolve it once and persist it on the thread.
   */
  responseLocale: string;
}): {
  stablePrompt: string;
  semiStablePrompt: string;
  volatilePrompt: string;
  fullPrompt: string;
} {
  const responseLocale = opts.responseLocale;
  const stablePrompt = (isFrenchLocale(responseLocale)
    ? buildCompanionStablePrompt({ isWhatsApp: opts.isWhatsApp })
    : buildCompanionStablePromptEn({ isWhatsApp: opts.isWhatsApp })).trim();
  const semiStablePrompt = buildCompanionSemiStablePrompt(opts).trim();
  const volatilePrompt = buildCompanionContextBlock(
    String(opts.context ?? ""),
    responseLocale,
  ).trim();
  const basePrompt = `${stablePrompt}\n\n${semiStablePrompt}`.trim();
  const budgeted = applyCompanionPromptBudgetWithPinnedContext({
    basePrompt,
    rawContext: opts.context,
    researchPinned: String(opts.context ?? "").includes(
      RESEARCH_CONTEXT_MARKER,
    ),
    responseLocale,
  });
  // ORDRE CRITIQUE: le bloc RESPONSE_LANGUAGE s'ajoute APRÈS le budget. Ce
  // composeur tronque par la QUEUE; l'ajouter avant reviendrait à le supprimer
  // sur les prompts longs — exactement les tours à contexte riche, et sans la
  // moindre erreur pour le signaler.
  const fullPrompt = appendResponseLanguageBlock(budgeted, responseLocale);
  return {
    stablePrompt,
    semiStablePrompt,
    volatilePrompt,
    fullPrompt,
  };
}

export function buildCompanionSystemPrompt(opts: {
  isWhatsApp: boolean;
  lastAssistantMessage: string;
  history?: any[];
  context: string;
  userState: any;
  responseLocale: string;
}): string {
  return buildCompanionPromptParts(opts).fullPrompt;
}

/**
 * Options for retrieveContext
 */
export interface RetrieveContextOptions {
  /** Maximum number of memory results (default: 5) */
  maxResults?: number;
  /** Whether to include action history (default: true) */
  includeActionHistory?: boolean;
}

// RAG Helper EXPORTÉ (Utilisé par le router)
export async function retrieveContext(
  supabase: SupabaseClient,
  userId: string,
  message: string,
  opts?: RetrieveContextOptions,
): Promise<string> {
  const maxResults = opts?.maxResults ?? 5;
  const includeActionHistory = opts?.includeActionHistory ?? true;
  // For minimal mode, we limit action history too
  const actionResultsCount = maxResults <= 2 ? 1 : 3;

  let contextString = "";
  try {
    const embedding = await generateEmbedding(message, {
      source: "sophia-brain:companion",
      operationName: "embedding.companion_user_query",
    });

    // Historique des Actions (Action Entries)
    // On cherche si des actions passées (réussites ou échecs) sont pertinentes pour la discussion
    // Skip for minimal mode if explicitly disabled
    if (includeActionHistory) {
      const { data: actionEntries, error: actErr } = await supabase.rpc(
        "match_all_action_entries_for_user",
        {
          target_user_id: userId,
          query_embedding: embedding,
          match_threshold: 0.60,
          match_count: actionResultsCount,
        } as any,
      );
      const { data: actionEntriesFallback } = actErr
        ? await supabase.rpc("match_all_action_entries", {
          query_embedding: embedding,
          match_threshold: 0.60,
          match_count: actionResultsCount,
        } as any)
        : ({ data: null } as any);
      const effectiveActionEntries =
        (actErr ? actionEntriesFallback : actionEntries) as any[] | null;

      if (effectiveActionEntries && effectiveActionEntries.length > 0) {
        contextString += "=== HISTORIQUE DES ACTIONS PERTINENTES ===\n";
        contextString += effectiveActionEntries.map((e: any) => {
          const dateStr = new Date(e.performed_at).toLocaleDateString("fr-FR");
          const statusIcon = e.status === "completed" ? "✅" : "❌";
          return `[${dateStr}] ${statusIcon} ${e.action_title} : "${
            e.note || "Pas de note"
          }"`;
        }).join("\n");
        contextString += "\n\n";
      }
    }

    return contextString;
  } catch (err) {
    console.error("Error retrieving context:", err);
    return "";
  }
}

// --- OUTILS ---
export async function generateCompanionModelOutput(opts: {
  systemPrompt: string;
  message: string;
  history: any[];
  meta?: {
    requestId?: string;
    userId?: string | null;
    forceRealAi?: boolean;
    channel?: "web" | "whatsapp";
    model?: string;
    temperature?: number;
  };
}): Promise<CompanionModelOutput> {
  const isToolHarnessLike = String(opts.meta?.requestId ?? "").includes(
    ":tools:",
  );
  // IMPORTANT: do not hardcode Gemini preview models in prod.
  // Let `generateWithGemini` pick its configured default model chain unless meta.model overrides.
  const DEFAULT_MODEL = isToolHarnessLike
    ? getGlobalAiModel()
    : undefined;
  const temperature = Number.isFinite(Number(opts.meta?.temperature))
    ? Number(opts.meta?.temperature)
    : 0.7;
  const response = await generateWithGemini(
    opts.systemPrompt,
    `User: ${opts.message}`,
    temperature,
    false,
    [],
    "auto",
    {
      requestId: opts.meta?.requestId,
      userId: opts.meta?.userId ?? undefined,
      model: opts.meta?.model ?? DEFAULT_MODEL,
      source: "sophia-brain:companion",
      forceRealAi: opts.meta?.forceRealAi,
      // Forwardé pour la présence (gpt-5.4 en effort LOW): sans ça le reasoning
      // model crame son budget de sortie en raisonnement → réponse vide.
      reasoningEffort: (opts.meta as { reasoningEffort?: GeminiReasoningEffort })
        ?.reasoningEffort,
    },
  );
  return response as any;
}

export async function handleCompanionModelOutput(opts: {
  supabase: SupabaseClient;
  userId: string;
  scope: string;
  message: string;
  history: any[];
  response: CompanionModelOutput;
  meta?: {
    requestId?: string;
    userId?: string | null;
    forceRealAi?: boolean;
    channel?: "web" | "whatsapp";
    model?: string;
  };
}): Promise<CompanionRunResult> {
  const { response } = opts;

  if (typeof response === "string") {
    const parsed = parseCompanionDeliveryForChannel(
      response,
      opts.meta?.channel,
    );
    return {
      text: parsed.visibleText.replace(/\*\*/g, ""),
      delivery: parsed.delivery,
      executed_tools: [],
      tool_execution: "none",
    };
  }

  // Catch-all: never stringify arbitrary objects into chat (it becomes "[object Object]").
  // If we get an unexpected tool call, return a safe user-facing message and log.
  if (response && typeof response === "object") {
    const maybeTool = (response as any)?.tool ?? null;
    const maybeText = (response as any)?.text ??
      (response as any)?.message ??
      (response as any)?.next_message ??
      null;
    if (typeof maybeText === "string" && maybeText.trim()) {
      const parsed = parseCompanionDeliveryForChannel(
        maybeText,
        opts.meta?.channel,
      );
      return {
        text: parsed.visibleText.replace(/\*\*/g, ""),
        delivery: parsed.delivery,
        executed_tools: [],
        tool_execution: "none",
      };
    }
    if (maybeTool) {
      console.warn("[Companion] Unexpected tool call (ignored):", maybeTool);
      return {
        text: "Ok — je te suis. On continue.",
        executed_tools: [],
        tool_execution: "blocked",
      };
    }
    console.warn("[Companion] Unexpected non-string response (ignored).");
    return {
      text: "Ok — je te suis. On continue.",
      executed_tools: [],
      tool_execution: "none",
    };
  }

  return {
    text: String(response ?? ""),
    delivery: { mode: "text_reply" },
    executed_tools: [],
    tool_execution: "none",
  };
}

export async function runCompanion(
  supabase: SupabaseClient,
  userId: string,
  scope: string,
  message: string,
  history: any[],
  userState: any,
  /**
   * W9/R3 — la langue de la réponse, DÉJÀ résolue par le propriétaire du tour.
   * Requis, et positionné avant `context` (qui a un défaut) pour qu'il ne
   * puisse pas être omis: un composeur qui devine sa propre langue est le
   * module que R3 existe pour interdire.
   */
  responseLocale: string,
  context: string = "",
  meta?: {
    requestId?: string;
    userId?: string | null;
    forceRealAi?: boolean;
    channel?: "web" | "whatsapp";
    model?: string;
    blockSideEffects?: boolean;
    clientNowIso?: string | null;
  },
): Promise<CompanionRunResult> {
  const lastAssistantMessage =
    history.filter((m: any) => m.role === "assistant").pop()?.content || "";
  const isWhatsApp = (meta?.channel ?? "web") === "whatsapp";
  const oneShotReminderToolSummary: {
    executedTools: string[];
    toolExecution: CompanionRunResult["tool_execution"];
  } = {
    executedTools: [],
    toolExecution: "none",
  };
  const augmentedContext = context;
  const memoryOnlyActionReply = renderMemoryOnlyActionRecallReply({
    message,
    context: augmentedContext,
  });
  if (memoryOnlyActionReply) {
    return {
      text: memoryOnlyActionReply,
      executed_tools: [],
      tool_execution: "none",
      temp_memory: userState?.temp_memory ?? {},
    };
  }

  const promptParts = buildCompanionPromptParts({
    isWhatsApp,
    lastAssistantMessage,
    history,
    context: augmentedContext,
    userState,
    responseLocale,
  });
  try {
    console.log(JSON.stringify({
      tag: "companion_prompt_cache_ready",
      request_id: meta?.requestId ?? null,
      channel: isWhatsApp ? "whatsapp" : "web",
      stable_hash: simplePromptHash(promptParts.stablePrompt),
      semi_stable_hash: simplePromptHash(promptParts.semiStablePrompt),
      stable_chars: promptParts.stablePrompt.length,
      semi_stable_chars: promptParts.semiStablePrompt.length,
      volatile_chars: promptParts.volatilePrompt.length,
      full_chars: promptParts.fullPrompt.length,
    }));
  } catch {
    // non-blocking
  }

  const systemPrompt = promptParts.fullPrompt;
  const response = await generateCompanionModelOutput({
    systemPrompt,
    message,
    history,
    meta: { ...meta, userId },
  });
  const result = await handleCompanionModelOutput({
    supabase,
    userId,
    scope,
    message,
    history,
    response,
    meta,
  });
  const nextQuestionRhythm = buildNextQuestionRhythmState({
    userState,
    context: augmentedContext,
    responseText: result.text,
  });
  // R3 — le fil PORTE sa langue. `withPersistedConversationLocale` est
  // l'écrivain unique; le routeur l'applique AUSSI sur les chemins possédés
  // par une skill, sinon un tour non-composeur laisse le fil sans ancre.
  const nextTempMemory = withPersistedConversationLocale({
    ...((userState?.temp_memory ?? {}) as Record<string, unknown>),
    companion_question_rhythm: nextQuestionRhythm,
  }, responseLocale);

  return {
    ...result,
    executed_tools: Array.from(
      new Set([
        ...oneShotReminderToolSummary.executedTools,
        ...(result.executed_tools ?? []),
      ]),
    ),
    tool_execution: oneShotReminderToolSummary.toolExecution === "failed"
      ? "failed"
      : oneShotReminderToolSummary.toolExecution === "success"
      ? "success"
      : oneShotReminderToolSummary.toolExecution === "blocked"
      ? (result.tool_execution === "failed" ? "failed" : "blocked")
      : result.tool_execution,
    temp_memory: nextTempMemory,
  };
}
