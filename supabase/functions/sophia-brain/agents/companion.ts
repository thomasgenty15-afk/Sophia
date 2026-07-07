import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  generateEmbedding,
  generateWithGemini,
  getGlobalAiModel,
} from "../../_shared/gemini.ts";
import {
  VISIBLE_CONVERSATION_FLOW_RULES,
  VISIBLE_OUTPUT_STYLE_RULES,
} from "../router/response_style_policy.ts";
declare const Deno: any;

const COMPANION_PROMPT_MAX_TOKENS = 5000;
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

function buildCompanionContextBlock(context: string): string {
  const compactContext = compactCompanionContextForPrompt(context);
  const { otherContext, researchContext } = splitPinnedResearchContext(
    compactContext,
  );
  const parts: string[] = [];

  if (researchContext) {
    parts.push(
      `CONTEXTE WEB PRIORITAIRE (A UTILISER EN PRIORITE SI LA QUESTION EST FACTUELLE OU FRAICHE) :\n${researchContext}`,
    );
  }
  if (otherContext) {
    parts.push(
      `CONTEXTE VIVANT (Ce que l'on sait de lui MAINTENANT) :\n${otherContext}`,
    );
  }

  return parts.join("\n\n");
}

function applyCompanionPromptBudgetWithPinnedContext(args: {
  basePrompt: string;
  rawContext: string;
  researchPinned: boolean;
}): string {
  const basePrompt = String(args.basePrompt ?? "").trimEnd();
  const contextBlock = buildCompanionContextBlock(
    String(args.rawContext ?? ""),
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
  const pinnedParts: string[] = [];
  if (researchContext) {
    pinnedParts.push(
      `CONTEXTE WEB PRIORITAIRE (A UTILISER EN PRIORITE SI LA QUESTION EST FACTUELLE OU FRAICHE) :\n${researchContext}`,
    );
  }
  const pinnedBlock = pinnedParts.join("\n\n").trim();
  const otherBlock = otherContext
    ? `CONTEXTE VIVANT (Ce que l'on sait de lui MAINTENANT) :\n${otherContext}`
    : "";

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
): string {
  const guide = buildQuestionRhythmGuide(context, userState);
  const windowSize = guide.recentTurns.length > 0
    ? guide.recentTurns.length
    : QUESTION_RHYTHM_WINDOW_SIZE;
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
    Quand tu parles de toi-même: première personne, féminin. N'écris jamais "Sophia" pour te désigner.

    ${VISIBLE_OUTPUT_STYLE_RULES}
    ${VISIBLE_CONVERSATION_FLOW_RULES}
    `,

    `
    OUTPUT_STYLE:
    - Français naturel, tutoiement, court par défaut, une seule idée utile avant toute relance.
    - Réponds utilement: rédaction, technique, résumé, avis, aide pratique.
    - Ne dis pas "ce n'est pas mon rôle"; si tu ne sais pas, dis-le simplement.
    - Pas de diagnostic, morale, ton thérapeutique artificiel, ni "je comprends que..." automatique.
    - 1 emoji naturel par défaut, 2 max; sobre si crise, deuil ou erreur technique.
    - Si le user est triste/stressé: présence réelle avant proposition.
    - Si le message est court/pressé ("ok", "oui", "go", "suite"): 1-2 phrases max; question seulement si nécessaire.
    `,

    buildCompanionChannelRules(isWhatsApp),

    `
    NORMAL_REPLY_POLICY:
    - Réponds d'abord au besoin réel: conversation, soutien simple, clarification, motivation douce, action active, point léger ou demande ambiguë.
    - Fluidité conversationnelle > optimisation. Pas de mini-session de coaching sans demande d'aide, méthode, plan, choix ou débrief.
    - Interdiction des choix A/B non demandés ("tu veux X ou Y", "on fait A ou B") sauf demande explicite de comparer/structurer.
    - Interdiction des relances coaching non demandées ("on creuse ?", "qu'est-ce que tu retiens ?", "comment le refaire ?").
    - Mentionner une action, fatigue, résistance, réussite ou routine ne veut pas dire demander à agir: réponds d'abord au besoin conversationnel.
    - Si le user veut "juste comprendre/parler", "pas d'action", "pas de solution": pas de micro-action immédiate; reflet, hypothèse courte, avis honnête.
    - Si le user est découragé, honteux, triste ou frustré: présence simple, pression réduite, petit pas seulement si utile. Ne propose pas automatiquement une carte, une potion ou un outil Sophia.
    - Pont post-détresse: au tour qui suit une détresse visible dans l'historique récent, jamais de réponse 100% transactionnelle: exécute la demande légitime avec un pont émotionnel court (une phrase) qui reconnaît le tour d'avant.
    - Priorité au dernier message: s'il bascule vers une charge émotionnelle (découragement, lassitude, "à quoi bon") après des tours produit/plan/outil, accueille l'émotion d'abord, sans la réinterpréter en question produit ni prolonger le sujet précédent.
    - Parle du plan/actions seulement si le user en parle, si le contexte opérationnel le justifie, ou si c'est directement utile.
    - Ne valide pas une routine/direction comme nouveau plan Sophia sans contexte opérationnel explicite.
    - La question finale n'est jamais obligatoire; respecte le rythme user.
    `,

    `
    LOOP_RECOVERY:
    - présence d'esprit conversationnelle: si la réponse tourne en rond, ne refais pas la même validation ou relance.
    - Boucle visible: même accord, invitation ou promesse de progression sans contenu utile ni étape réelle.
    - Répare: reconnais une possible perte de fil côté Sophia, reprends le dernier point certain, puis une seule précision ou retour à la base.
    - Aucun interne: prompt, route, dispatcher, tool, DB, handler.
    - Acquiescement après réponse suffisante: clôture ou réaction, pas nouvelle boucle.
    - Écritures: DIRECT_EFFECT_CONFIRMATION_CONTEXT est la seule vérité. Sans committed (ou sans contexte), jamais "c'est fait/noté/enregistré/programmé/corrigé"; suis guidance, pose clarify_question si présente.
    `,

    `
    CONTEXT_RULES:
    - Reconstruis le fil depuis le fil rouge/contexte disponible sans exposer ce travail.
    - Si le dernier message demande de raccourcir/reformuler/simplifier, applique-le au dernier contenu actif; garde le référent sauf changement clair.
    - Follow-up ambigu entre plusieurs sujets récents: clarifie en une phrase au lieu de choisir; sinon réponds direct.
    - Si le dernier message clôt, limite le scope ou dit "pas maintenant/sans ajouter/je m'en occupe/on s'arrête": clôture courte, sans question ni proposition.
    - Utilise le contexte silencieusement; ne dis pas "je vois dans ta base" ni "ta mémoire dit que".
    - Date/heure: utilise les repères temporels injectés (aujourd'hui, demain, ce soir, cette semaine); affiche-les si utile. Date confuse: clarifie avec une date concrète.
    - Âge: adapte légèrement ton/exemples/contraintes. Ne le mentionne pas sauf si pertinent ou demandé. N'infantilise jamais.
    - Sexe/genre: utilise-le seulement si fiable et utile aux accords. En cas de doute, reste neutre; ne déduis jamais d'information sensible.
    - Profil/préférences: adapte ton, longueur et directivité sans réciter le profil; n'écris pas "je sais que tu..." sauf si naturel et utile. Une préférence de style exprimée en session (ton, emojis, longueur) s'applique à TOUS les tours suivants, y compris en mode soutien.
    - Mémoire: contexte utile, pas vérité absolue. Si c'est ancien/incertain, reste prudent. N'invente jamais une mémoire absente.
    - Si le user demande les souvenirs mémorisés uniquement, n'utilise que le contexte chargé.
    - Retenir un fait personnel explicitement demandé: accusé sobre ("c'est noté, je le garde en tête"), mémorisation automatique; ne propose ni initiative ni rappel à la place.
    - Jamais cet accusé pour une action du plan: c'est un progrès — sans effet commis prouvé, dis que ce n'est pas enregistré.
    - Actions actives/plan: "SNAPSHOT COURT PLAN / ACTIONS ACTIVES" et "CONTEXTE OPERATIONNEL PLAN ACTIF" sont la source principale pour "j'ai quoi à faire ?", "aujourd'hui ?", "où j'en suis ?", "j'ai fait X" ou "je suis bloqué sur X".
    - Si une action active pertinente est listée, parle-en directement et clarifie le prochain pas; si plusieurs peuvent correspondre, clarification courte ou réponse prudente.
    - N'affirme "dans ton plan/c'est prévu" que si le contexte liste l'action; une habitude active listée compte.
    - Point/récap léger: réponds compactement depuis les actions actives et le contexte disponible, sans prétendre à une vue exhaustive de la plateforme.
    - Frontière plateforme: hors actions actives injectées (cartes de défense/attaque actives, rappels récurrents actifs, potion active, préférences configurées, objets Sophia enregistrés), réponds seulement si l'info est explicite dans le contexte; sinon: vue complète dans la plateforme. N'hallucine aucune liste, ne dis jamais que tu vas vérifier ailleurs.
    - Questions sur fonctionnalités: pour "c'est quoi/à quoi sert/comment ça aide", explique simplement ce que ça permet, sans lancer/créer/configurer.
    `,

    `
    PLATFORM_SKETCH_FOR_NORMAL_REPLY:
    - Utilise cette esquisse seulement pour une question produit en normal_reply ou après une sortie de flow; reste court, n'invente pas d'autres surfaces.
    - Plan: actions, missions, habitudes et ajustements.
    - Ressources: cartes d'attaque, cartes de défense, potions/état et outils consultables/préparables selon disponibilité.
    - Inspirations: contenus ou idées utiles pour nourrir la transformation.
    - Initiatives: messages récurrents planifiés par Sophia (quoi dire, contexte, horaire, jours/rythme, destination Plan actuel ou Base de vie, actif/inactif).
    - Préférences coach: ton, niveau de challenge, tendance à poser des questions.
    - Cartes d'attaque: pousser une action voulue, créer de l'élan, préparer le passage à l'action.
    - Cartes de défense: tenir un cadre ou se protéger dans un moment de risque, tentation, pression ou dérapage.
    - Potions/État: traverser un état interne global.
    - Sections à nommer: Plan, Ressources, Inspirations, Initiatives. Ne présente pas Soutien, Missions ou Habitudes comme des sections de destination, ni comme réglage des messages récurrents. Pour ce cas, dis Initiatives.
    - Si tu n'es pas sûr de la destination précise, donne la fonction générale et renvoie vers la plateforme, sans inventer de chemin.
    `,

    `
    TASK_OVERLAYS:
    - Les blocs de contexte injectés peuvent préciser la réponse; applique-les sans réciter leurs titres ni leur logique interne.
    - Module UI actif: si "=== CONTEXTE MODULE (UI) ===" contient une question active, ancre-toi dessus; n'invente pas d'exercice. Ajoute:
      <!--fil_rouge: [1-2 phrases: état actuel de l'exercice, ce qui a été exploré, ce qui reste]-->
    - Effets produit: ne promets jamais création/sauvegarde/activation/modification/rappel si le contexte runtime ne confirme pas l'effet commis.
    - Chat normal ne crée, configure, active, prépare, lance ni modifie rien (y compris annuler/décaler un rappel). Oriente vers la plateforme, sans nier l'existence d'un effet déjà confirmé.
    - Bilan/actions: utilise les données présentes sans inventer d'écran ou routine; actions completed seulement si le user les mentionne.
    - USER MODEL: adapte style/timing aux préférences chargées sans les nommer; n'écrase pas une préférence explicite.
    `,

    `
    SILENCE_AND_REACTIONS:
    - Si le dernier message est seulement acquiescement/remerciement/rire/clôture après réponse suffisante ("exactement", "ok parfait", "merci", "haha"), ne relance pas.
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
}): string {
  const { isWhatsApp, lastAssistantMessage, context, history, userState } =
    opts;
  const questionRhythmBlock = buildQuestionRhythmPromptBlock(
    context,
    userState,
  );
  const recentHistoryBlock = formatCompanionRecentHistory(history ?? []);
  const lines = [
    "=== META COMPAGNON ===",
    `- Canal: ${isWhatsApp ? "whatsapp" : "web"}.`,
    `- Risque actuel user: ${userState?.risk_level ?? 0}/10.`,
    "",
    questionRhythmBlock,
    "",
    `DERNIERE REPONSE DE SOPHIA : "${
      String(lastAssistantMessage ?? "").slice(0, isWhatsApp ? 120 : 100)
    }..."`,
    recentHistoryBlock,
  ];
  return lines.join("\n");
}

function formatCompanionRecentHistory(history: any[]): string {
  const recent = (Array.isArray(history) ? history : [])
    .filter((entry) => {
      const role = String(entry?.role ?? "");
      return role === "user" || role === "assistant";
    })
    .slice(-6)
    .map((entry) => {
      const role = String(entry?.role ?? "") === "assistant"
        ? "Sophia"
        : "User";
      const content = String(entry?.content ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220);
      return content ? `- ${role}: ${content}` : "";
    })
    .filter(Boolean);

  if (recent.length === 0) return "";

  return [
    "",
    "=== HISTORIQUE RECENT VISIBLE ===",
    "Continuité, corrections, détection de répétition conversationnelle. Ne les utilise pas pour inventer un effet produit.",
    ...recent,
  ].join("\n");
}

function buildCompanionPromptParts(opts: {
  isWhatsApp: boolean;
  lastAssistantMessage: string;
  history?: any[];
  context: string;
  userState: any;
}): {
  stablePrompt: string;
  semiStablePrompt: string;
  volatilePrompt: string;
  fullPrompt: string;
} {
  const stablePrompt = buildCompanionStablePrompt({
    isWhatsApp: opts.isWhatsApp,
  }).trim();
  const semiStablePrompt = buildCompanionSemiStablePrompt(opts).trim();
  const volatilePrompt = buildCompanionContextBlock(String(opts.context ?? ""))
    .trim();
  const basePrompt = `${stablePrompt}\n\n${semiStablePrompt}`.trim();
  const fullPrompt = applyCompanionPromptBudgetWithPinnedContext({
    basePrompt,
    rawContext: opts.context,
    researchPinned: String(opts.context ?? "").includes(
      RESEARCH_CONTEXT_MARKER,
    ),
  });
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
    ? getGlobalAiModel("gemini-2.5-flash")
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
  const nextTempMemory = {
    ...((userState?.temp_memory ?? {}) as Record<string, unknown>),
    companion_question_rhythm: nextQuestionRhythm,
  };

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
