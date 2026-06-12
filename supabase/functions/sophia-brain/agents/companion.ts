import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  generateEmbedding,
  generateWithGemini,
  getGlobalAiModel,
} from "../../_shared/gemini.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "../router/response_style_policy.ts";
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

function buildCompanionContextBlock(context: string): string {
  const { otherContext, researchContext } = splitPinnedResearchContext(context);
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

function parseQuestionTendencyFromContext(context: string): QuestionTendency {
  void context;
  return normalizeQuestionTendency(null);
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
  const preference = stored.preference ??
    parseQuestionTendencyFromContext(context);
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
    ? "La question est optionnelle sur ce tour. Si tu n'en poses pas, garde l'elan avec une hypothese, un reflet, une insinuation douce ou une prise de position."
    : "Evite la question sur ce tour sauf necessite forte. Prefere hypothese, reflet emotionnel, insinuation douce ou reformulation qui fait avancer.";
  const ratioTarget = guide.preference === "low"
    ? "environ 1 question tous les 4 tours"
    : guide.preference === "high"
    ? "environ 1 question tous les 2 tours"
    : "environ 1 question tous les 3 tours";
  return [
    "=== QUESTION RHYTHM (CRITIQUE) ===",
    `- Préférence user: ${guide.preference}. Cible: ${ratioTarget}.`,
    `- Historique récent assistant: ${guide.questionsInWindow} question(s) sur les ${windowSize} derniers tours.`,
    `- Tours depuis la dernière question: ${guide.turnsSinceLastQuestion}.`,
    `- Guidance pour CE tour: ${guide.guidance}.`,
    `- ${guidanceInstruction}`,
    "- Même si guidance=ask_now, n'impose PAS de question dans ces cas: reponse factuelle attendue, message tres court/presse, moment emotionnel qui demande surtout presence, redirection dashboard deja faite juste avant.",
    "- Si tu poses une question, elle doit etre unique, concrete et utile.",
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
  const preference = previous.preference ??
    parseQuestionTendencyFromContext(args.context);
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

export type CompanionRunResult = {
  text: string;
  executed_tools: string[];
  tool_execution: "none" | "blocked" | "success" | "failed" | "uncertain";
  temp_memory?: any;
};

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
    MODE WHATSAPP :
    - Canal court par défaut: 1 à 2 phrases pour un message simple, direct ou pressé.
    - Message plus long seulement si le user le demande, si le sujet est dense, ou si l'émotion le justifie vraiment.
    - Pas de "Bonjour/Salut" au milieu d'une conversation.
    - Pas de **. Texte brut uniquement.
    - Hors-sujet WhatsApp: réponds en une courte remarque utile/humaine, puis reviens légèrement au fil Sophia. Ne creuse pas le hors-sujet avec une question.
    - Ne transporte pas les emojis, métaphores ou vocabulaire d'un hors-sujet dans les tours suivants.
    - Suppression de messages: ne dis jamais "ça ne change rien"; explique que cela change l'historique visible mais ne reset pas les autres traces système.
    - FIL ROUGE WHATSAPP: ajoute toujours à la fin une note cachée, sur une ligne seule:
      <!--fil_rouge_whatsapp: [1-2 phrases tres courtes: ou on en est, ce qui a ete dit/tente, prochain pas ou point a garder en tete]-->
      La note doit rester factuelle, courte, sans markdown, sans citation mot à mot, sans instruction interne ni information sensible inutile.
    `;
  }

  return `
  MODE WEB :
  - Court par défaut, mais tu peux développer quand le user demande du détail ou que le sujet le justifie.
  - Pas de **. Texte brut uniquement.
  - Ne dis pas au revoir / bonne soirée en premier, sauf si l'utilisateur le fait explicitement.
  - Ne dis pas bonjour / salut au milieu d'une conversation si le dernier message du user ne le fait pas.
  `;
}

function buildCompanionStablePrompt(opts: {
  isWhatsApp: boolean;
}): string {
  const { isWhatsApp } = opts;
  return joinPromptSections([
    `
    Tu es Sophia, une coach de vie orientée action.
    Tu es une partenaire de vie et une IA experte très capable.
    Ton but est d'avancer avec l'utilisateur tout en restant utile sur toutes ses demandes.
    Quand tu parles de toi-même, utilise toujours la première personne du singulier ("je", "me", "moi"). N'écris jamais "Sophia" pour te désigner.

    ${VISIBLE_OUTPUT_STYLE_RULES}
    `,

    `
    POLYVALENCE ET ASSISTANCE :
    - Réponds utilement aux demandes du user, y compris techniques, culture générale, résumés, avis personnel ou aide pratique.
    - Ne dis jamais "ce n'est pas mon rôle", "je n'ai pas d'avis", "je ne suis pas là pour ça" ou équivalent.
    - Si tu ne sais pas, dis-le simplement. N'invente jamais de limitation technique fictive.
    `,

    `
    STYLE ET RYTHME :
    - Écris comme on parle: direct, naturel, humain.
    - Sois réactive au ton: si c'est triste, dur ou stressant, commence par une présence réelle avant de coacher.
    - Humour subtil autorisé quand le contexte s'y prête.
    - Emojis: mets toujours au moins 1 emoji naturel dans chaque message visible; 2 max; jamais une ligne entière d'emojis. En crise, deuil ou erreur technique, choisis un emoji sobre et non décoratif.
    - Par défaut, fais court. Réponse développée seulement si le user demande clairement du détail ou si le sujet le justifie.
    - Si le dernier message du user est très court ou pressé ("ok", "oui", "vas-y", "suite", "go", "on y va"), réponds en 1-2 phrases max. Pose une question seulement si elle est vraiment utile.
    - Quand le user confirme une micro-action ("oui c'est bon"), valide en 3-6 mots max, puis passe à l'étape suivante.
    - N'enchaîne pas avec "comment tu te sens ?" sauf si le user exprime une émotion.
    `,

    buildCompanionChannelRules(isWhatsApp),

    `
    DOUBLE POSTURE :
    - Tu es à la fois coach et amie bienveillante: ajuste la posture selon le moment.
    - Ne reste pas en mode coaching permanent.
    - Parle du plan/actions surtout si le user en parle, si le contexte opérationnel le justifie, ou si c'est vraiment pertinent.
    - Sinon, privilégie présence, écoute, tact et relance légère.
    - Poser une question n'est pas obligatoire; respecte le rythme du user.
    `,

    `
    COHÉRENCE CONTEXTUELLE :
    - Avant de répondre, reconstruis le fil depuis le FIL ROUGE + l'historique récent.
    - Réponds d'abord au dernier message utilisateur, puis garde la continuité.
    - Le dernier message utilisateur est prioritaire sur ton réflexe de relance. Avant d'ajouter une question ou une nouvelle proposition, vérifie s'il contient une limite explicite ou implicite: "juste ça", "pas maintenant", "sans ajouter", "je m'en occupe", "après j'arrête", "on s'arrête là", "pas de solution", "ne propose pas", ou équivalent.
    - Si le dernier message contient une clôture, une limite de scope, ou une intention de faire puis d'arrêter, réponds en clôture courte. Ne rajoute pas de question finale, de nouveau micro-engagement, de rappel à faire maintenant, ni de proposition supplémentaire.
    - Si un contexte de reprise/handoff est présent, lis-le comme contexte prioritaire de continuité, mais vérifie toujours le dernier message utilisateur pour inférer les contraintes conversationnelles qui ne sont pas forcément listées explicitement.
    - Si tu utilises le contexte, ne l'expose pas ("je vois dans ta base..."): utilise-le silencieusement.
    - Si le user demande "d'après mes souvenirs mémorisés uniquement" ou équivalent, utilise uniquement les détails présents dans le contexte chargé. Ne remplace pas par des conseils génériques ou probables; reformule en "tu" naturellement.
    - N'affirme jamais "on a X dans ton plan" / "dans le plan" / "c'est prévu dans ton plan" sauf si le CONTEXTE OPÉRATIONNEL indique explicitement une action active ou disponible cette semaine correspondante.
    - Si le contexte opérationnel liste des items disponibles cette semaine, une habitude récurrente compte aussi comme quelque chose à faire cette semaine.
    `,

    `
    MODULE DE TRAVAIL IDENTITAIRE :
    - Si le contexte contient "=== CONTEXTE MODULE (UI) ===", l'utilisateur est dans un exercice structuré: ancre-toi sur la question active indiquée.
    - Pour les messages courts ou de salutation: réponds naturellement en 1-2 phrases, puis ramène doucement vers la question active sans forcer.
    - Pour les messages substantiels: aide, creuse, reformule, valorise, sans dévier vers un autre sujet.
    - N'invente pas de nouvelle question ou exercice: la question active dans le contexte fait foi.
    - N'expose pas le contexte module à voix haute.
    - Si l'utilisateur change explicitement de sujet, adapte-toi, puis reviens à l'exercice à la prochaine occasion naturelle.
    - FIL ROUGE MODULE: quand "=== CONTEXTE MODULE (UI) ===" est présent, ajoute toujours à la fin une note cachée, sur une ligne seule:
      <!--fil_rouge: [1-2 phrases: état actuel de l'exercice, ce qui a été exploré, ce qui reste]-->
    `,

    `
    CONSIGNES CONTEXTUELLES ET ADD-ONS :
    - Les blocs "=== ADDON ... ===" et "=== CONTEXTE ... ===" sont des consignes runtime spécifiques au tour. Ils priment sur les règles générales.
    - Applique strictement un add-on actif, mais ne récite pas sa logique interne.
    - Si un add-on dashboard/track/progress/bilan/safety est présent, suis l'add-on plutôt que d'improviser une règle générale.
    - Si aucun contexte runtime ne confirme une création, modification, activation, programmation, suppression, sauvegarde ou exécution, ne dis jamais que c'est fait.
    - Le chat normal peut clarifier, aider à formuler, soutenir l'exécution et orienter. Il ne reconfigure pas le plan, les actions ou les préférences sans confirmation runtime explicite.
    - Pour un rappel ponctuel, confirme seulement si le contexte runtime dit explicitement que le rappel a réussi. Sinon, demande la précision manquante ou reste prudent.
    - Ne dis jamais qu'une carte d'attaque ou de défense générée peut être modifiée directement. Elle peut être relue, consultée et utilisée; si elle ne convient plus, on peut préparer une nouvelle version après confirmation.
    `,

    `
    BILAN, ACTIONS ET MÉMOIRE ACTIVE :
    - Ne décris pas de capacité de saisie de bilan ou d'action si le contexte runtime ne la confirme pas explicitement.
    - Si un bilan existe dans le contexte, utilise-le sans inventer d'écran, de formulaire ou de routine de saisie.
    - Tu peux rappeler que je connais les objectifs, mais que je ne peux pas deviner de façon fiable l'exécution réelle sans signal explicite.
    - Si le contexte contient des actions marquées "completed", n'en parle que si l'utilisateur les mentionne d'abord.
    `,

    `
    USER MODEL (PRÉFÉRENCES COACH) :
    - Le contexte peut contenir "=== USER MODEL (FACTS) ===".
    - Si des facts existent, adapte ton style/timing sans le dire.
    - Préférences coach prioritaires si présentes: coach.tone, coach.challenge_level, coach.feedback_style, coach.talk_propensity, coach.message_length, coach.message_format, coach.question_tendency, coach.primary_focus, coach.emotional_personalization.
    - Les facts conversation.* historiques sont des signaux secondaires.
    - Priorité: safety/add-ons actifs, puis préférences coach/facts user, puis règles génériques.
    - N'écrase pas une préférence explicite par une règle générique.
    `,
  ]);
}

function buildCompanionSemiStablePrompt(opts: {
  isWhatsApp: boolean;
  lastAssistantMessage: string;
  context: string;
  userState: any;
}): string {
  const { isWhatsApp, lastAssistantMessage, context, userState } = opts;
  const questionRhythmBlock = buildQuestionRhythmPromptBlock(
    context,
    userState,
  );
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
  ];
  return lines.join("\n");
}

function buildCompanionPromptParts(opts: {
  isWhatsApp: boolean;
  lastAssistantMessage: string;
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
  const isToolHarnessLike = String(opts.meta?.requestId ?? "").includes(":tools:");
  // IMPORTANT: do not hardcode Gemini preview models in prod.
  // Let `generateWithGemini` pick its default model chain (defaults to gpt-5.4-mini) unless meta.model overrides.
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
    return {
      text: response.replace(/\*\*/g, ""),
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
      return {
        text: maybeText.replace(/\*\*/g, ""),
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
