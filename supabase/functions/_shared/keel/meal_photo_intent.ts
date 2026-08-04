// LE DISPATCHER LOCAL DU FLOW PHOTO — classer, jamais deviner par regex.
//
// `meal_photo_flow.ts` est un reducer PUR: il reçoit une intention déjà classée
// et décide de la transition. Ce module est la moitié manquante — celle qui
// regarde le texte de l'élève. Elle a été laissée non écrite pendant tout le
// chantier de nuit, et c'est ce trou qui laissait le défaut ouvert:
//
//   Sophia: « je vois du porc, du riz. C'était cuit à l'huile ? »
//   Élève : « non c'était du poulet »
//   → le routeur global y voit une information alimentaire, `log_protocol_event`
//     écrit une SECONDE ligne `protocol_events`, et l'élève qui a mangé une
//     fois en a deux au compteur de son coach.
//
// POURQUOI UN CLASSIFIEUR ET PAS DES MOTS-CLÉS. « non c'était du poulet »,
// « ah pardon plutôt du poulet », « c'est pas du porc hein », « chicken
// actually » disent la même chose et ne partagent aucun mot. Le déterminisme
// est réservé à ce qui est déterministe: la présence d'un média dans le tour.
//
// LE SENS DU DOUTE. En dessous du seuil, on rend `unknown` — et `unknown` fait
// « stay » dans le reducer, c'est-à-dire le comportement d'AVANT ce module: le
// tour repart normalement. Un classifieur incertain ne doit jamais acquérir le
// pouvoir de supprimer l'enregistrement d'un vrai repas.

import { generateWithGemini } from "../gemini.ts";
import { MEAL_PHOTO_INTENTS, type MealPhotoIntent } from "./meal_photo_flow.ts";

export interface MealPhotoIntentClassification {
  intent: MealPhotoIntent;
  confidence: number;
}

/**
 * En dessous de ce seuil, l'intention devient `unknown`.
 *
 * 0.7 et non 0.8 (le seuil de `classifyArmedQuestionReply`) parce que les deux
 * erreurs ne coûtent pas la même chose ici. Là-bas, un doute fait rater un
 * opt-in. Ici, un doute rend simplement le tour à son chemin normal — celui
 * qu'il empruntait avant l'existence de ce module.
 */
const MIN_CONFIDENCE = 0.7;

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseIntent(raw: unknown): MealPhotoIntentClassification {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    const cleaned = raw.trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    try {
      obj = JSON.parse(cleaned);
    } catch {
      return { intent: "unknown", confidence: 0 };
    }
  }
  if (!obj || typeof obj !== "object") return { intent: "unknown", confidence: 0 };
  const rec = obj as Record<string, unknown>;
  const intent = cleanText(rec.intent);
  const confidence = Number(rec.confidence);
  if (!(MEAL_PHOTO_INTENTS as readonly string[]).includes(intent)) {
    return { intent: "unknown", confidence: 0 };
  }
  return {
    intent: intent as MealPhotoIntent,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
  };
}

/**
 * Classe le tour de l'élève pendant qu'un flow photo est ouvert.
 *
 * @param question la question que Sophia a posée, ou `null` quand l'accusé n'en
 *   portait pas. Sans elle, `answers_question` n'a aucun sens et le prompt le
 *   dit — un élève ne peut pas répondre à une question qu'on ne lui a pas posée.
 * @param detectedFoods ce que l'analyse a annoncé voir. C'est la CIBLE d'une
 *   correction: sans cette liste, le modèle ne peut pas distinguer « non,
 *   c'était du poulet » (correction de la lecture) de « ce soir je mange du
 *   poulet » (une intention future, qui n'amende rien).
 * @param hasMedia le tour porte-t-il une nouvelle photo. DÉTERMINISTE: c'est un
 *   fait de transport, pas une interprétation.
 */
export async function classifyMealPhotoIntent(params: {
  question: string | null;
  detectedFoods: readonly string[];
  inboundText: string;
  hasMedia?: boolean;
  requestId?: string;
  userId?: string;
  /** Injectable pour les tests: aucun appel réseau. */
  llmRunner?: (systemPrompt: string, userPrompt: string) => Promise<unknown>;
}): Promise<MealPhotoIntentClassification> {
  // Une nouvelle photo est un FAIT du tour, pas une lecture de sens. Le reducer
  // ferme alors le flow courant et laisse la nouvelle photo ouvrir le sien.
  if (params.hasMedia) return { intent: "new_photo", confidence: 1 };

  const text = cleanText(params.inboundText);
  if (!text) return { intent: "unknown", confidence: 0 };

  const systemPrompt =
    "Sophia is a nutrition companion. A student just sent a photo of a meal; " +
    "Sophia replied with what she saw" +
    (params.question ? " and asked one question." : ".") +
    " Classify what the student's NEXT message is doing. Answer with one token:\n" +
    (params.question
      ? '- "answers_question": it answers the question Sophia asked.\n'
      : '- "answers_question": never use this, Sophia asked no question.\n') +
    '- "corrects_analysis": it disputes or corrects what Sophia said she saw ' +
    "(a wrong food, a wrong preparation, a wrong portion).\n" +
    '- "unrelated": it talks about something else — another meal, a future ' +
    "intention, their day, a question of their own.\n" +
    '- "unknown": you genuinely cannot tell.\n' +
    "A correction of the PAST plate is `corrects_analysis`. A statement about a " +
    "DIFFERENT or FUTURE meal is `unrelated`, even when it names food. " +
    "The student may write in English or French; both are normal.\n" +
    'Answer ONLY as JSON: {"intent": <token>, "confidence": <0..1>}.';

  const userPrompt = JSON.stringify({
    question_posee: params.question,
    aliments_annonces: params.detectedFoods,
    reponse_eleve: text,
  });

  try {
    const raw = params.llmRunner
      ? await params.llmRunner(systemPrompt, userPrompt)
      : await generateWithGemini(systemPrompt, userPrompt, 0, true, [], "auto", {
        requestId: params.requestId,
        userId: params.userId,
        source: "keel-meal-photo-intent-classifier",
        model: "gpt-5.4-nano",
        forceInitialModel: true,
        disableFallbackChain: true,
        reasoningEffort: "none",
        httpTimeoutMs: 5_000,
        maxRetries: 1,
      });
    const parsed = parseIntent(raw);
    // `new_photo` ne peut PAS venir du modèle: c'est un fait de transport, et
    // le laisser passer permettrait à une phrase de fermer un flow en
    // prétendant porter une image.
    if (parsed.intent === "new_photo") return { intent: "unknown", confidence: 0 };
    if (parsed.intent === "answers_question" && !params.question) {
      return { intent: "unknown", confidence: 0 };
    }
    if (parsed.confidence < MIN_CONFIDENCE) {
      return { intent: "unknown", confidence: parsed.confidence };
    }
    return parsed;
  } catch (error) {
    // R7 à une frontière LLM: on dégrade vers le comportement d'avant, jamais
    // vers une action. `unknown` fait « stay », donc le tour repart normalement.
    console.warn(JSON.stringify({
      tag: "meal_photo_intent_classifier_failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    return { intent: "unknown", confidence: 0 };
  }
}
