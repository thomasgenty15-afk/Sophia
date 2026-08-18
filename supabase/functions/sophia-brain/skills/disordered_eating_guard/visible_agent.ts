/**
 * `disordered_eating_guard` — visible agent.
 *
 * The model writes the sentence; it does not decide the content. Two floors
 * sit around it:
 *
 *   BEFORE — the prompt carries only `conversation_context` (no plan, no
 *            scores, no evidence numbers). What is not in the context cannot
 *            be leaked, however the turn is phrased.
 *   AFTER  — `validateVisibleMessage` runs deterministically on the output and
 *            REJECTS any message containing a figure or a metric word. The
 *            helpline number is the only numeric string allowed through, and
 *            it is allowed by subtraction against the resolved resources, not
 *            by an allowlist someone has to remember to update.
 *
 * On rejection or failure the skill emits a deterministic message instead. A
 * clinical turn is never silent, and it is never a raw model output either.
 */

import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
// W9/R3 — la langue de la reponse VISIBLE est RECUE (`input.response_locale`),
// resolue une seule fois par le proprietaire du tour. Ce module appelait
// `resolveResponseLocale({})`: une chaine de priorite sans aucune entree, donc
// une langue decidee par son repli. Le bloc RESPONSE_LANGUAGE part en DERNIERE
// instruction du prompt (la position est le mecanisme: la recence gagne).
import {
  appendResponseLanguageBlock,
  type LocalePackKey,
  localePackKey,
} from "../../../_shared/keel/locale.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "../../router/response_style_policy.ts";
import {
  FORBIDDEN_METRIC_TERMS,
  type DisorderedEatingVisibleTask,
  type DisorderedEatingVisibleTaskKind,
} from "./contract.ts";
import { allowedNumbersForTask } from "./reducer.ts";

export type DisorderedEatingVisibleAgentInput = {
  user_id: string;
  /** W9/R3 — résolue par le runtime, descendue par le skill. Jamais devinée. */
  response_locale: string;
  request_id?: string | null;
  visible_task: DisorderedEatingVisibleTask;
};

export type DisorderedEatingVisibleAgent = (
  input: DisorderedEatingVisibleAgentInput,
) => Promise<string | null>;

export type DisorderedEatingVisibleAgentResult = {
  ok: boolean;
  message: string | null;
  visible_agent_ok: boolean;
  failure_reason: string | null;
};

let visibleAgentForTest: DisorderedEatingVisibleAgent | null = null;

export function setDisorderedEatingVisibleAgentForTest(
  agent: DisorderedEatingVisibleAgent | null,
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

// ---------------------------------------------------------------------------
// Deterministic validator — THE invariant of this skill
// ---------------------------------------------------------------------------

export function validateVisibleMessage(
  message: string,
  task: DisorderedEatingVisibleTask,
): { ok: boolean; reason: string | null } {
  const context = task.conversation_context;

  if ((message.split("?").length - 1) > context.max_questions) {
    return { ok: false, reason: "too_many_questions" };
  }

  // Numbers: subtract the legitimately resolved contacts, then assert that not
  // one digit is left. Spelled-out small numbers are handled by the metric-term
  // list below ("two hundred calories" trips on "calories").
  let residue = message;
  for (const allowed of allowedNumbersForTask(task)) {
    residue = residue.split(allowed).join(" ");
  }
  if (/\d/.test(residue)) {
    return { ok: false, reason: "numeric_value_in_clinical_reply" };
  }

  const folded = message
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  for (const term of FORBIDDEN_METRIC_TERMS) {
    if (new RegExp(`\\b${term}\\b`).test(folded)) {
      return { ok: false, reason: `forbidden_metric_term:${term}` };
    }
  }

  // The clinical/crisis separation, enforced and not merely documented: this
  // flow never emits a suicide line. If the turn also carries suicidal signal,
  // the router hands it to safety_crisis, which owns those numbers.
  if (/\b(988|3114|116\s?123|suicide (hot)?line|suicide prevention)\b/.test(folded)) {
    return { ok: false, reason: "suicide_crisis_line_in_clinical_flow" };
  }

  // A resource task that shipped without its resource is a broken referral.
  // The registry always answers, so a referral task that shipped without a
  // contact is always a broken referral.
  if (task.kind === "clinical_resources" || task.kind === "medical_escalation") {
    const hasAny = context.clinical_resources.resolution.resources.some((r) =>
      message.includes(r.contact)
    );
    if (!hasAny) return { ok: false, reason: "resource_task_without_resource" };
  }
  return { ok: true, reason: null };
}

// ---------------------------------------------------------------------------
// Deterministic messages (fallback AND the reference wording)
//
// ── L4 · CE TEXTE ÉTAIT ANGLAIS, SUR LA LANE OÙ ÇA COÛTE LE PLUS CHER ──────
//
// C'est le repli ANTI-SILENCE: il part chaque fois que le modèle est refusé par
// le validateur, ou qu'il ne répond pas. Autrement dit, quand la pile est en
// panne, 100 % des tours cliniques passent par ici. Il n'existait qu'en anglais
// — une personne francophone dans le flux de garde alimentaire lisait donc de
// l'anglais au moment précis où le produit avait décidé de se taire sur les
// chiffres pour la protéger. Même cicatrice que « accusé photo hors cerveau:
// deux textes EN en dur », sur un chemin bien plus sensible.
//
// ── `responseLocale` EST REQUIS, ET POSITIONNEL ────────────────────────────
// Pas de défaut, pas d'optionnel. Un appelant qui l'oublie ne compile pas —
// c'est la seule forme de garde que ce dépôt accepte depuis « un paramètre de
// garde optionnel est une garde désarmée ».
//
// ── L'ÉCHAPPATOIRE, NOMMÉE ────────────────────────────────────────────────
// `localePackKey` JETTE pour une langue non livrée (R7), et c'est la bonne
// règle partout ailleurs. PAS ICI: une exception dans ce repli rendrait un tour
// clinique MUET, ce qui est pire qu'un tour anglais. On retombe donc sur `en`,
// et on le JOURNALISE — un repli silencieux est celui qu'on ne répare jamais.
// ---------------------------------------------------------------------------

type DisorderedEatingPack = {
  /** L'en-tête de la liste de ressources. */
  resourcesHeader: string;
  coach: string;
  messages: Record<DisorderedEatingVisibleTaskKind, (parts: {
    coach: string;
    resources: string;
  }) => string>;
};

const DISORDERED_EATING_PACKS: Record<LocalePackKey, DisorderedEatingPack> = {
  en: {
    resourcesHeader: "People who do this all day, and who are not me:",
    coach:
      "Your coach is the person to talk to next, and I can flag it to them right now.",
    messages: {
      open_without_numbers: ({ coach }) =>
        "I've paused the check-ins and the progress figures on your side for now. " +
        "Not as a penalty, and not because you did anything wrong — I just don't " +
        `think they're helping you at the moment. ${coach} How are things going for you?`,
      numbers_refusal: ({ coach }) =>
        "I'm not going to give you that one. Those figures are paused for you " +
        `right now, and going back over them isn't something I'll do here. ${coach}`,
      clinical_resources: ({ coach, resources }) => `${coach}${resources}`,
      medical_escalation: ({ coach, resources }) =>
        "What you're describing needs to be looked at by a doctor today — please " +
        "contact your GP or your local emergency service now, before anything else. " +
        `${coach}${resources}`,
      respect_decline_hold: () =>
        "Understood, I'll leave it. I'm here if you want to come back to it.",
      holding: () => "I'm here.",
      close: () =>
        "Of course. One thing before we move on: the progress figures and the " +
        "check-in reminders stay paused on your side until your coach has looked " +
        "at this with you.",
    },
  },
  fr: {
    resourcesHeader: "Des gens dont c'est le métier, et qui ne sont pas moi :",
    coach:
      "Ton coach est la personne à qui en parler ensuite, et je peux le lui signaler tout de suite.",
    messages: {
      open_without_numbers: ({ coach }) =>
        "J'ai mis en pause les points de suivi et les chiffres de progression de " +
        "ton côté, pour l'instant. Ce n'est pas une sanction, et tu n'as rien fait " +
        `de mal — je ne crois simplement pas qu'ils t'aident en ce moment. ${coach} ` +
        "Comment ça va, toi ?",
      numbers_refusal: ({ coach }) =>
        "Je ne vais pas te donner celui-là. Ces chiffres sont en pause pour toi en " +
        `ce moment, et y revenir n'est pas quelque chose que je ferai ici. ${coach}`,
      clinical_resources: ({ coach, resources }) => `${coach}${resources}`,
      medical_escalation: ({ coach, resources }) =>
        "Ce que tu décris doit être examiné par un médecin aujourd'hui — contacte " +
        "ton médecin traitant ou les urgences de ta région maintenant, avant toute " +
        `autre chose. ${coach}${resources}`,
      respect_decline_hold: () =>
        "D'accord, je laisse ça. Je suis là si tu veux y revenir.",
      holding: () => "Je suis là.",
      close: () =>
        "Bien sûr. Une chose avant qu'on passe à autre chose : les chiffres de " +
        "progression et les rappels de point restent en pause de ton côté jusqu'à " +
        "ce que ton coach en ait parlé avec toi.",
    },
  },
};

/** Le pack du repli. R7 par délégation, SAUF que l'anti-silence gagne. */
export function disorderedEatingPackKey(responseLocale: string): LocalePackKey {
  try {
    return localePackKey(responseLocale);
  } catch {
    console.warn(JSON.stringify({
      tag: "disordered_eating_guard.deterministic_message_locale_fallback",
      requested_locale: responseLocale,
      used: "en",
      effect:
        "un tour clinique en anglais plutôt qu'un tour clinique muet — livrer " +
        "le pack de cette langue est la vraie réparation",
    }));
    return "en";
  }
}

export function disorderedEatingDeterministicMessage(
  kind: DisorderedEatingVisibleTaskKind,
  resourceLines: string[],
  /** REQUIS. La langue du tour, telle que le runtime l'a résolue. */
  responseLocale: string,
): string {
  const pack = DISORDERED_EATING_PACKS[disorderedEatingPackKey(responseLocale)];
  const resources = resourceLines.length > 0
    ? `\n\n${pack.resourcesHeader}\n${resourceLines.map((l) => `- ${l}`).join("\n")}`
    : "";
  return pack.messages[kind]({ coach: pack.coach, resources });
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const STAGE_PROMPTS: Record<DisorderedEatingVisibleTaskKind, string> = {
  open_without_numbers: [
    "Stage open_without_numbers.",
    "Open the conversation. Say plainly that the progress figures and the check-in reminders are paused on their side, that it is not a penalty, and that they have not done anything wrong.",
    "Do NOT explain what triggered it, do not describe the rule, do not name a threshold. Do not diagnose anything.",
    "Offer the human coach. Then ask ONE open, non-clinical question about how they are doing.",
  ].join("\n"),
  numbers_refusal: [
    "Stage numbers_refusal.",
    "The student asked for a figure. Decline it once, warmly and without negotiating, and WITHOUT restating what they asked for.",
    "Never say the figure, never approximate it, never say it 'used to be' anything.",
    "Offer the human coach. Do not lecture.",
  ].join("\n"),
  clinical_resources: [
    "Stage clinical_resources.",
    "Hand over the eating-disorder resources listed in conversation_context.clinical_resources.lines, verbatim, and offer the human coach.",
    "If the list is empty, say honestly that you do not have a verified line for their country and route them to their coach. Never invent a number.",
    "No advice, no plan, no encouragement about eating. Just the handover.",
  ].join("\n"),
  medical_escalation: [
    "Stage medical_escalation.",
    "The student reported acute physical symptoms. Same-day medical care comes FIRST in the message: their doctor or local emergency service, today.",
    "Then the coach, then the resources from conversation_context. Nothing else in the message at all.",
  ].join("\n"),
  respect_decline_hold: [
    "Stage respect_decline_hold.",
    "The student said no. Accept it in ONE sentence. Ask NOTHING. Do not re-offer, do not rephrase the offer, do not add a 'but'.",
    "Leave the door open in the plainest possible way.",
  ].join("\n"),
  holding: [
    "Stage holding.",
    "Stay present with what they said. No agenda, no task, no question, no advice.",
  ].join("\n"),
  close: [
    "Stage close.",
    "The student wants to move on. Agree immediately and without friction.",
    "State ONCE, plainly, that the progress figures and check-in reminders stay paused until their coach has looked at it with them. Then stop.",
  ].join("\n"),
};

function visibleSystemPrompt(input: DisorderedEatingVisibleAgentInput): string {
  const context = input.visible_task.conversation_context;
  return [
    "You are writing ONE message inside a clinical guard flow for a student showing signs of restrictive or compensatory eating.",
    STAGE_PROMPTS[input.visible_task.kind],
    "",
    "ABSOLUTE RULES (a message breaking any of them is discarded by a deterministic validator and replaced):",
    "- NEVER write a number of any kind, except a helpline contact taken verbatim from conversation_context.",
    "- NEVER mention calories, macros, grams, kilos, pounds, body mass, adherence, compliance, coverage, percentages, scores or streaks — not even to say they are paused as a quantity.",
    "- NEVER comment on the student's body, appearance, discipline or willpower. Never praise restraint.",
    "- NEVER propose a plan, a meal, a reminder, a card, a product or any next action inside the app.",
    "- NEVER give a suicide hotline here. This is not that flow.",
    "- NEVER diagnose. You are not naming a condition.",
    `- At most ${context.max_questions} question(s) in the whole message.`,
    "",
    "Tone: plain, warm, short, factual. No dramatization, no reassurance about how they look, no motivational language.",
    "Use conversation_context ONLY. If a fact is not there, you do not have it.",
    VISIBLE_OUTPUT_STYLE_RULES,
    "Maximum 110 words.",
    'Return strictly one JSON object: {"message":"..."}.',
  ].join("\n");
}

export function visibleSystemPromptForDisorderedEatingTest(
  input: DisorderedEatingVisibleAgentInput,
): string {
  return visibleSystemPrompt(input);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runDisorderedEatingVisibleAgent(
  input: DisorderedEatingVisibleAgentInput,
): Promise<DisorderedEatingVisibleAgentResult> {
  const task = input.visible_task;
  if (visibleAgentForTest) {
    const message = cleanMessage(await visibleAgentForTest(input));
    if (!message) {
      return {
        ok: false,
        message: null,
        visible_agent_ok: false,
        failure_reason: "test_visible_agent_empty",
      };
    }
    const validation = validateVisibleMessage(message, task);
    return {
      ok: validation.ok,
      message: validation.ok ? message : null,
      visible_agent_ok: validation.ok,
      failure_reason: validation.reason,
    };
  }

  const userPrompt = JSON.stringify({
    task: "write_disordered_eating_guard_visible_message",
    stage: task.kind,
    visible_task: task,
    hard_constraints: {
      numbers: "blocked",
      adherence_reference: "blocked",
      plan_work: "blocked",
      product_reference: "blocked",
      suicide_crisis_line: "blocked",
      max_questions: task.conversation_context.max_questions,
    },
  });

  try {
    console.info("disordered_eating_guard.visible_prompt_called", {
      "visible_task.kind": task.kind,
      phase: task.conversation_context.phase,
      resources_country:
        task.conversation_context.clinical_resources.resolution.country,
      resources_fallback_used:
        task.conversation_context.clinical_resources.resolution.fallbackUsed,
      no_tooling: true,
    });
    const raw = await generateWithGemini(
      appendResponseLanguageBlock(
        visibleSystemPrompt(input),
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
        source: `disordered_eating_guard.visible.${task.kind}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    const message = parseVisibleMessage(raw);
    if (!message) {
      return {
        ok: false,
        message: null,
        visible_agent_ok: false,
        failure_reason: "empty_visible_message",
      };
    }
    const validation = validateVisibleMessage(message, task);
    if (!validation.ok) {
      console.warn("disordered_eating_guard.visible_message_rejected", {
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
  } catch (error) {
    console.warn("[DisorderedEatingGuard] visible agent failed", error);
    return {
      ok: false,
      message: null,
      visible_agent_ok: false,
      failure_reason: error instanceof Error ? error.message : String(error),
    };
  }
}
