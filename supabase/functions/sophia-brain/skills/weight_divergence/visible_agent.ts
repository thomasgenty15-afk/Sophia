/**
 * FF-056 — LE VISIBLE AGENT. Le modèle écrit la phrase; il ne décide rien.
 *
 * Deux planchers l'encadrent, et c'est le patron de `disordered_eating_guard`:
 *
 *   AVANT — le prompt ne porte que `conversation_context`. Pas de série de
 *           poids, pas de pourcentage, pas de coches, pas de nom de catégorie.
 *           Ce qui n'est pas dans le contexte ne peut pas fuir, quelle que
 *           soit la formulation du tour.
 *   APRÈS — `validateWeightDivergenceMessage` tourne déterministiquement sur la
 *           sortie et REJETTE. Un texte rejeté n'est pas corrigé: il est
 *           remplacé par le littéral gelé du même palier.
 *
 * ── LE REPLI EST BILINGUE, ET C'EST UNE CICATRICE, PAS UNE FINITION ────────
 * `safety_crisis` porte un repli déterministe MONOLINGUE FRANÇAIS (T-19,
 * 33 gabarits): un élève américain dont le modèle tombe reçoit du français.
 * Le repli est le filet de DERNIER recours — c'est le chemin qui sert quand
 * tout le reste est tombé. Ici il existe dans les deux langues d'entrée, et le
 * test l'énumère.
 *
 * ── UN TOUR DE CE FLOW N'EST JAMAIS VIDE, ET JAMAIS ACCUSATEUR ────────────
 * Les deux moitiés comptent. Vide, la personne a posé une question sur son
 * corps et reçu du silence. Accusateur, on a construit la fonctionnalité qui
 * existe pour éviter ça.
 */

import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import {
  appendResponseLanguageBlock,
  isFrenchLocale,
} from "../../../_shared/keel/locale.ts";
import {
  findForbiddenMatches,
  type ForbiddenTerm,
} from "../../../_shared/keel/forbidden_matcher.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "../../router/response_style_policy.ts";
import {
  FORBIDDEN_BLAME_TERMS,
  FORBIDDEN_ENERGY_TERMS,
  FORBIDDEN_PLAN_DELIVERY_PHRASES,
  FORBIDDEN_SUSPICION_PHRASES,
  FORBIDDEN_WEIGH_IN_LINK_PHRASES,
  type WeightDivergenceVisibleTask,
  type WeightDivergenceVisibleTaskKind,
} from "./contract.ts";

// ---------------------------------------------------------------------------
// LE VALIDATEUR — L'INVARIANT DE CETTE SKILL
// ---------------------------------------------------------------------------

/**
 * Les cinq familles, en termes du matcher DU DÉPÔT.
 *
 * ⚠️ PAS DE MATCHER MAISON. La cicatrice `never-hand-roll-a-matcher-here` a été
 * payée douze fois sur douze (« laitue » attrapé par « lait »).
 * `findForbiddenMatches` porte les frontières de mot, la normalisation des
 * diacritiques et la tolérance aux tirets — trois choses qu'un `includes`
 * n'a pas, et dont l'absence est invisible jusqu'au faux négatif.
 */
function forbiddenTerms(): ForbiddenTerm[] {
  const build = (ruleId: string, list: readonly string[]): ForbiddenTerm[] =>
    list.map((term) => ({ ruleId, token: term }));
  return [
    ...build("energy", FORBIDDEN_ENERGY_TERMS),
    ...build("suspicion", FORBIDDEN_SUSPICION_PHRASES),
    ...build("blame", FORBIDDEN_BLAME_TERMS),
    ...build("weigh_in_link", FORBIDDEN_WEIGH_IN_LINK_PHRASES),
    // La règle mère du produit: personne ne prépare le plan de l'élève.
    // Mesurée en run réel le 2026-08-11 sur le chemin nominal de ce flow.
    ...build("plan_delivery", FORBIDDEN_PLAN_DELIVERY_PHRASES),
  ];
}

const FORBIDDEN_TERMS = forbiddenTerms();

export interface VisibleValidation {
  ok: boolean;
  reason: string | null;
}

/**
 * ⚠️ `allowNegatedMentions: false` — LE MODE ABSOLU, et c'est le seul appelant
 * du dépôt à le demander.
 *
 * Ailleurs la négation blanchit à raison (« pain sans gluten » chez un
 * cœliaque). Ici elle ferait passer « je ne dis pas que tu triches », qui dit
 * « tu triches ». On cherche une INSINUATION, pas un aliment cité.
 */
export function validateWeightDivergenceMessage(
  message: string,
  task: WeightDivergenceVisibleTask,
): VisibleValidation {
  const context = task.conversation_context;

  if (!message.trim()) return { ok: false, reason: "empty_message" };

  if ((message.split("?").length - 1) > context.max_questions) {
    return { ok: false, reason: "too_many_questions" };
  }

  // AUCUN CHIFFRE, D'AUCUNE SORTE. Ce flow n'a rien de numérique à dire: la
  // durée de la fenêtre s'écrit en toutes lettres (« trois jours »), et tout le
  // reste — poids, pourcentage, écart, semaine numérotée — est soit interdit
  // par le contrat, soit une donnée que le prompt n'a jamais reçue. Interdire
  // le chiffre en bloc est plus court à tenir qu'une liste d'exceptions, et il
  // n'existe aucun cas légitime à sauver.
  if (/\d/.test(message)) {
    return { ok: false, reason: "numeric_value_in_divergence_reply" };
  }

  // ⚠️ LES APOSTROPHES DEVIENNENT DES ESPACES AVANT LE SCAN, et c'est un
  // défaut trouvé par ce test-ci et pas en production.
  //
  // `normalizeForMatch` ne retire que les diacritiques; `tokenPattern` joint
  // les mots d'une locution par `[\s\-_]*`. Une apostrophe n'est donc NI un
  // séparateur NI une lettre: « puisque tu t'es pesé » ne matchait pas le token
  // « puisque tu t es pese », et « t'es sûr » ne matchait pas « t es sur ». Les
  // deux locutions les plus chères de ce flow passaient à travers, en français
  // seulement — la forme exacte de la cicatrice
  // `guard-tested-in-one-language-only`.
  //
  // Sans danger ici, et pour une raison précise: la seule chose que le matcher
  // fait des apostrophes est de reconnaître les contractions négatives
  // anglaises (`doesn't`), et ce validateur passe `allowNegatedMentions: false`
  // — la négation ne blanchit rien. L'apostrophe typographique (U+2019) est
  // traitée au même titre que l'ASCII: un générateur en produit constamment.
  const scannable = message.replace(/['’`]/g, " ");
  const matches = findForbiddenMatches(scannable, FORBIDDEN_TERMS, {
    allowNegatedMentions: false,
  });
  if (matches.length > 0) {
    const first = matches[0];
    return { ok: false, reason: `${first.ruleId}:${first.token}` };
  }

  // UNE TÂCHE DE PROPOSITION QUI PART SANS SA PROPOSITION EST UNE PROPOSITION
  // CASSÉE. Le texte de l'action vient du littéral gelé de FF-028; s'il n'est
  // pas dans le message, le tap qui suit ne désignerait rien de ce que la
  // personne a lu.
  if (task.kind === "propose_named_spot_action") {
    if (!context.proposed_action_text) {
      return { ok: false, reason: "proposal_task_without_action_text" };
    }
  }
  return { ok: true, reason: null };
}

// ---------------------------------------------------------------------------
// LES REPLIS DÉTERMINISTES — bilingues, et énumérés par le test
// ---------------------------------------------------------------------------

type Pack = Record<WeightDivergenceVisibleTaskKind, string>;

/**
 * ⚠️ CHAQUE PHRASE CI-DESSOUS PASSE LE VALIDATEUR. Le test le prouve en
 * soumettant les vingt-deux littéraux au validateur lui-même — un repli
 * qu'on ne peut pas émettre est un repli qui n'existe pas, et ce dépôt a la
 * cicatrice (`guards-need-a-passing-case`).
 *
 * Le sujet de chaque phrase est LE PLAN (R2). Aucune ne commence par « tu ».
 */
const EN: Pack = {
  // ⚠️ PAS DE POINT D'INTERROGATION ICI. Le texte de l'action, concaténé
  // ensuite, en porte DÉJÀ un — et la tâche n'autorise qu'une seule question.
  // Le repli échouait son propre validateur sur ce détail; c'est exactement ce
  // que ce test existe pour attraper.
  propose_named_spot_action:
    "Thanks for telling me — that's the part I couldn't see.",
  acknowledge_named_spot_without_action:
    "Thanks for telling me — that's the part I couldn't see. I've noted it, and " +
    "the next week you put together will take it into account.",
  point_to_plan_fit:
    "Then it's the plan that should move, not you. When you next put a week " +
    "together, tell me what actually fits your days and I'll build around that.",
  acknowledge_life_factor:
    "That's worth knowing, and I've noted it. I won't pretend I have a lever " +
    "for it — I don't.",
  acknowledge_activity_drop:
    "Noted, thank you. That's useful context for how your weeks are built.",
  acknowledge_medical:
    "Thank you for telling me. I've noted it and I won't try to read anything " +
    "into it — that's a conversation for your doctor.",
  close_nothing_to_change:
    "That makes sense. Nothing to change then.",
  offer_observation_window:
    "That's a fair answer, and it's the most common one. Here's something " +
    "small: for the next three days, just tell me what you eat on top of what's " +
    "planned. Then I'll recalibrate the plan and it stops on its own. Want to " +
    "do that?",
  respect_decline:
    "Understood — I'll leave it there.",
  reformulate_once:
    "I'm not sure I followed. Could you say it again, in your own words?",
  close_out:
    "Alright, let's leave it there.",
};

const FR: Pack = {
  propose_named_spot_action:
    "Merci de me le dire — c'est la partie que je ne pouvais pas voir.",
  acknowledge_named_spot_without_action:
    "Merci de me le dire — c'est la partie que je ne pouvais pas voir. C'est " +
    "noté, et la prochaine semaine que tu composeras en tiendra compte.",
  point_to_plan_fit:
    "Alors c'est le plan qui doit bouger, pas toi. À ta prochaine composition, " +
    "dis-moi ce qui rentre vraiment dans tes journées et je construirai autour.",
  acknowledge_life_factor:
    "C'est bon à savoir, et c'est noté. Je ne vais pas faire semblant d'avoir " +
    "un levier là-dessus : je n'en ai pas.",
  acknowledge_activity_drop:
    "C'est noté, merci. C'est un contexte utile pour la façon dont tes semaines " +
    "sont construites.",
  acknowledge_medical:
    "Merci de me l'avoir dit. C'est noté, et je ne vais rien en déduire — ça, " +
    "c'est une conversation pour ton médecin.",
  close_nothing_to_change:
    "Ça se tient. Il n'y a rien à changer, alors.",
  offer_observation_window:
    "C'est une réponse honnête, et c'est la plus fréquente. Une proposition : " +
    "pendant trois jours, dis-moi juste ce que tu manges en plus de ce qui est " +
    "prévu. Ensuite je recale le plan, et ça s'arrête tout seul. On fait comme " +
    "ça ?",
  respect_decline:
    "Entendu — on en reste là.",
  reformulate_once:
    "Je ne suis pas sûre d'avoir suivi. Tu peux me le redire avec tes mots ?",
  close_out:
    "D'accord, on en reste là.",
};

/**
 * LE TEXTE DE REPLI, dans la langue de la réponse.
 *
 * `proposed_action_text` est CONCATÉNÉ plutôt qu'interpolé: le littéral de
 * FF-028 est déjà une phrase complète, testée et gelée, et le réécrire ici en
 * ferait la deuxième copie.
 */
export function weightDivergenceDeterministicMessage(
  kind: WeightDivergenceVisibleTaskKind,
  responseLocale: string,
  proposedActionText: string | null,
): string {
  const pack = isFrenchLocale(responseLocale) ? FR : EN;
  if (kind === "propose_named_spot_action" && proposedActionText) {
    return `${pack[kind]}\n\n${proposedActionText}`;
  }
  return pack[kind];
}

/** Exporté pour que le test énumère les DEUX packs, pas seulement l'anglais. */
export const WEIGHT_DIVERGENCE_FALLBACK_PACKS = Object.freeze({ en: EN, fr: FR });

// ---------------------------------------------------------------------------
// LE PROMPT
// ---------------------------------------------------------------------------

function visibleSystemPrompt(task: WeightDivergenceVisibleTask): string {
  const context = task.conversation_context;
  return [
    "You are writing ONE short message inside a conversation about a plan whose result is not following.",
    "",
    "THE FRAME, and it governs every sentence you write:",
    "The subject of the sentence is THE PLAN, never the person. You are not",
    "establishing what they did. You are not verifying anything. You have no",
    "evidence of any kind and you are not looking for any. They told you",
    "something; you take it at face value, entirely, and you act on it.",
    "",
    `Stage: ${task.kind}.`,
    context.next_focus,
    "",
    "ABSOLUTE RULES (a message breaking any of them is discarded by a deterministic validator and replaced by a fixed sentence):",
    ...context.do_not_say.map((rule) => `- Never write ${rule}.`),
    `- At most ${context.max_questions} question mark(s) in the whole message.`,
    "- Never restate or paraphrase what they said back at them as a summary.",
    "- Never end with an offer to talk more, a check-in, or a follow-up.",
    "",
    "Use conversation_context ONLY. If a fact is not there, you do not have it.",
    VISIBLE_OUTPUT_STYLE_RULES,
    "Maximum 70 words.",
    'Return strictly one JSON object: {"message":"..."}.',
  ].join("\n");
}

export function weightDivergenceVisiblePromptForTest(
  task: WeightDivergenceVisibleTask,
): string {
  return visibleSystemPrompt(task);
}

// ---------------------------------------------------------------------------
// LE RUNNER
// ---------------------------------------------------------------------------

export type WeightDivergenceVisibleAgent = (
  input: WeightDivergenceVisibleAgentInput,
) => Promise<string | null>;

export interface WeightDivergenceVisibleAgentInput {
  user_id: string;
  /** Résolue par le runtime, descendue par le skill. Jamais devinée. */
  response_locale: string;
  request_id?: string | null;
  visible_task: WeightDivergenceVisibleTask;
}

export interface WeightDivergenceVisibleAgentResult {
  ok: boolean;
  message: string | null;
  visible_agent_ok: boolean;
  failure_reason: string | null;
}

let visibleAgentForTest: WeightDivergenceVisibleAgent | null = null;

export function setWeightDivergenceVisibleAgentForTest(
  agent: WeightDivergenceVisibleAgent | null,
) {
  visibleAgentForTest = agent;
}

function cleanMessage(value: unknown): string | null {
  const text = String(value ?? "").replaceAll("\r\n", "\n").trim();
  return text ? text : null;
}

function parseVisibleMessage(raw: unknown): string | null {
  try {
    // deno-lint-ignore no-explicit-any
    const root = typeof raw === "string" ? JSON.parse(raw) : raw as any;
    return cleanMessage(root?.message);
  } catch {
    return cleanMessage(raw);
  }
}

export async function runWeightDivergenceVisibleAgent(
  input: WeightDivergenceVisibleAgentInput,
): Promise<WeightDivergenceVisibleAgentResult> {
  const task = input.visible_task;

  const finish = (message: string | null): WeightDivergenceVisibleAgentResult => {
    if (!message) {
      return {
        ok: false,
        message: null,
        visible_agent_ok: false,
        failure_reason: "empty_visible_message",
      };
    }
    const validation = validateWeightDivergenceMessage(message, task);
    if (!validation.ok) {
      console.warn("weight_divergence.visible_message_rejected", {
        "visible_task.kind": task.kind,
        reason: validation.reason,
      });
    }
    return {
      ok: validation.ok,
      message: validation.ok ? message : null,
      visible_agent_ok: validation.ok,
      failure_reason: validation.reason,
    };
  };

  if (visibleAgentForTest) {
    return finish(cleanMessage(await visibleAgentForTest(input)));
  }

  const userPrompt = JSON.stringify({
    task: "write_weight_divergence_visible_message",
    stage: task.kind,
    visible_task: task,
    hard_constraints: {
      numbers: "blocked",
      energy_figures: "blocked",
      doubt_or_suspicion: "blocked",
      blame: "blocked",
      weigh_in_reference: "blocked",
      exercise_prescription: "blocked",
      medical_interpretation: "blocked",
      household_or_coach_mention: "blocked",
      max_questions: task.conversation_context.max_questions,
    },
  });

  try {
    const raw = await generateWithGemini(
      appendResponseLanguageBlock(
        visibleSystemPrompt(task),
        input.response_locale,
      ),
      userPrompt,
      0.3,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel(),
        source: `weight_divergence.visible.${task.kind}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return finish(parseVisibleMessage(raw));
  } catch (error) {
    console.warn("[WeightDivergence] visible agent failed", error);
    return {
      ok: false,
      message: null,
      visible_agent_ok: false,
      failure_reason: error instanceof Error ? error.message : String(error),
    };
  }
}
