/**
 * LA QUESTION ARMÉE — le concept produit qui survit à la mort des templates.
 *
 * ── CE QUI MEURT, CE QUI RESTE ───────────────────────────────────────────────
 * La couche template Meta meurt entièrement : fenêtre de 24 h, `purposes` →
 * noms de templates, locales Meta, `renderWhatsAppTemplate`, repli
 * `global_reach`, erreur 132001. Rien de tout ça n'a de sens sans Meta.
 *
 * Ce qui reste est le MÉCANISME, et il vaut cher parce qu'il a été payé en
 * production. Sophia pose une question avec des boutons ; cette question reste
 * « armée » jusqu'à réponse ; un message plus récent avec boutons la supplante ;
 * une réponse libre est interprétée CONTRE la question posée.
 *
 * ── LES DEUX RÈGLES QUI N'ONT PAS MARCHÉ, GARDÉES POUR MÉMOIRE ───────────────
 * (Recopiées de `template_context.ts` : elles ont coûté deux itérations et
 * personne ne devrait les repayer.)
 *   - « fermée dès que Sophia reparle » : elle répond à chaque entrant, donc
 *     c'était toujours vrai → la question mourait au premier mot de l'élève
 *     (« Attend » → Sophia répond → « C'est tout à fait moi » tombait sur une
 *     question morte).
 *   - « n'importe quelle question dans les 24 h » : trop lâche → une question
 *     périmée capturait un « oui » qui répondait à autre chose.
 * Le plafond de TOURS garde les rafales fonctionnelles (le public écrit en
 * plusieurs messages) tout en bornant la péremption.
 *
 * ── CE QUI CHANGE, ET C'EST UNE SIMPLIFICATION ───────────────────────────────
 * La question armée n'est plus une ligne de `whatsapp_outbound_messages` dont
 * il faut re-rendre le template pour retrouver le texte : c'est le message
 * lui-même, dans la bulle, avec ses boutons dans ses `metadata`. Le commentaire
 * d'origine de `LastTemplateContext` disait que le texte rendu « était calculé
 * puis jeté, et le classifieur devait décider sans jamais voir ce qui avait été
 * demandé ». Ce problème n'existe plus : le texte EST la ligne.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { generateWithGemini } from "../gemini.ts";
import { CHAT_SCOPE } from "./delivery.ts";

/**
 * Combien de messages entrants une question reste armée. Trois : voir les deux
 * règles ratées ci-dessus.
 */
export const ARMED_QUESTION_MAX_TURNS = 3;

/** Au-delà, une question n'est plus une question, c'est un souvenir. */
export const ARMED_QUESTION_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ArmedQuestion = {
  /** `chat_messages.id` du message qui porte la question. */
  messageId: string;
  /** LA question, telle qu'elle a été posée. Le classifieur la voit. */
  content: string;
  purpose: string | null;
  buttons: { payload: string; label: string }[];
  askedAt: string;
  /** Entrants reçus depuis, hors celui en cours. */
  inboundTurnsBefore: number;
};

export type ArmedQuestionClassification = {
  /** Le `payload` du bouton retenu, ou `unrelated` / `unknown`. */
  choice: string;
  confidence: number;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function readButtons(
  metadata: unknown,
): { payload: string; label: string }[] {
  const raw = (metadata as { buttons?: unknown } | null)?.buttons;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b) => {
      if (!b || typeof b !== "object") return null;
      const payload = cleanText((b as Record<string, unknown>).payload);
      const label = cleanText((b as Record<string, unknown>).label);
      return payload && label ? { payload, label } : null;
    })
    .filter((b): b is { payload: string; label: string } => b !== null);
}

/**
 * Décide si une question candidate est ENCORE armée. Pur : c'est la règle
 * produit, et elle doit être lisible sans base de données.
 */
export function isStillArmed(args: {
  askedAtIso: string;
  nowIso: string;
  inboundTurnsBefore: number;
  hasNewerArmedQuestion: boolean;
}): boolean {
  // Un message plus récent avec boutons gagne TOUJOURS. C'est la règle qui
  // empêche une réponse à une question remontée dans le fil de réactiver une
  // question périmée (edge case n°3).
  if (args.hasNewerArmedQuestion) return false;

  const askedAt = Date.parse(args.askedAtIso);
  const now = Date.parse(args.nowIso);
  if (!Number.isFinite(askedAt) || !Number.isFinite(now)) return false;
  // Une question posée dans le FUTUR n'est pas armée: c'est une horloge fausse.
  if (askedAt > now) return false;
  if (now - askedAt > ARMED_QUESTION_WINDOW_MS) return false;

  // Le tour en cours compte: `inboundTurnsBefore` précédents + celui-ci doivent
  // tenir sous le plafond.
  return args.inboundTurnsBefore < ARMED_QUESTION_MAX_TURNS;
}

/** Le bouton dont le LIBELLÉ correspond exactement au texte reçu. */
export function findExactButton(
  buttons: { payload: string; label: string }[],
  inboundText: unknown,
): { payload: string; label: string } | null {
  const normalize = (value: unknown) =>
    cleanText(value).toLowerCase().replace(/[!?.…,:;]+/g, " ").replace(
      /\s+/g,
      " ",
    ).trim();
  const target = normalize(inboundText);
  if (!target) return null;
  return buttons.find((b) => normalize(b.label) === target) ?? null;
}

/**
 * Charge la question armée courante, s'il y en a une.
 *
 * L'appelant doit passer `nowIso` : le temps est une entrée, pas un effet de
 * bord — c'est ce qui rend la règle rejouable.
 */
export async function resolveArmedQuestion(
  admin: SupabaseClient,
  args: { userId: string; nowIso: string; replyToMessageId?: string | null },
): Promise<ArmedQuestion | null> {
  const sinceIso = new Date(
    Date.parse(args.nowIso) - ARMED_QUESTION_WINDOW_MS,
  ).toISOString();

  // ── LA RÉPONSE EXPLICITE GAGNE ────────────────────────────────────────────
  // Quand l'élève répond À un message précis (il a tapé un bouton rendu sous
  // CE message), c'est celui-là qui compte, même s'il n'est plus le dernier.
  if (args.replyToMessageId) {
    const { data, error } = await admin
      .from("chat_messages")
      .select("id,content,created_at,metadata")
      .eq("id", args.replyToMessageId)
      .eq("user_id", args.userId)
      .eq("role", "assistant")
      .maybeSingle();
    if (error) throw error;
    const row = data as
      | { id: string; content: string; created_at: string; metadata: unknown }
      | null;
    const buttons = readButtons(row?.metadata);
    if (row && buttons.length > 0) {
      return {
        messageId: row.id,
        content: cleanText(row.content),
        purpose: cleanText((row.metadata as { purpose?: unknown })?.purpose) ||
          null,
        buttons,
        askedAt: row.created_at,
        inboundTurnsBefore: 0,
      };
    }
  }

  // ── SINON: LA PLUS RÉCENTE QUESTION ARMÉE ─────────────────────────────────
  // On ramène les derniers messages assistants et on filtre en mémoire sur la
  // présence de boutons : PostgREST ne sait pas exprimer « le tableau jsonb
  // `buttons` est non vide » de façon fiable sur toutes les versions, et une
  // requête qui a l'air de filtrer sans filtrer est pire qu'un filtre en
  // mémoire assumé.
  const { data, error } = await admin
    .from("chat_messages")
    .select("id,content,created_at,metadata")
    .eq("user_id", args.userId)
    .eq("scope", CHAT_SCOPE)
    .eq("role", "assistant")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;

  const rows = (data ?? []) as Array<
    { id: string; content: string; created_at: string; metadata: unknown }
  >;
  const armedRow = rows.find((row) => readButtons(row.metadata).length > 0);
  if (!armedRow) return null;

  // Combien d'entrants depuis ? Le tour en cours n'est PAS encore journalisé
  // quand ceci tourne sur le chemin classifieur ; il l'est quand ceci tourne
  // après la journalisation. L'appelant tranche en passant `nowIso`, et la
  // règle compte ce qu'elle voit — d'où le `<` (et non `<=`) dans
  // `isStillArmed`.
  const { count, error: countError } = await admin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.userId)
    .eq("scope", CHAT_SCOPE)
    .eq("role", "user")
    .gt("created_at", armedRow.created_at);
  if (countError) throw countError;

  const question: ArmedQuestion = {
    messageId: armedRow.id,
    content: cleanText(armedRow.content),
    purpose:
      cleanText((armedRow.metadata as { purpose?: unknown })?.purpose) || null,
    buttons: readButtons(armedRow.metadata),
    askedAt: armedRow.created_at,
    inboundTurnsBefore: count ?? 0,
  };

  return isStillArmed({
    askedAtIso: question.askedAt,
    nowIso: args.nowIso,
    inboundTurnsBefore: question.inboundTurnsBefore,
    // `armedRow` EST la plus récente par construction (tri décroissant).
    hasNewerArmedQuestion: false,
  })
    ? question
    : null;
}

function parseClassification(raw: unknown): ArmedQuestionClassification {
  if (typeof raw !== "string") return { choice: "unknown", confidence: 0 };
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    const choice = cleanText(parsed?.choice) || "unknown";
    const confidence = Number(parsed?.confidence);
    return {
      choice,
      confidence: Number.isFinite(confidence)
        ? Math.max(0, Math.min(1, confidence))
        : 0,
    };
  } catch {
    return { choice: "unknown", confidence: 0 };
  }
}

/**
 * Un refus, une réserve ou une commande destructrice ne sont JAMAIS une
 * réponse à la question posée. Ce pré-filtre existe parce qu'un classifieur
 * qui doit choisir parmi des boutons finit toujours par en choisir un.
 *
 * BILINGUE PAR OBLIGATION, PAS PAR POLITESSE : un test FR qui passait par
 * accident de grammaire a déjà laissé une garde EN complètement inerte dans ce
 * dépôt (`not` ne couvre pas `doesn't`). Les deux langues sont dans le motif,
 * et les deux sont testées.
 */
export function isObviouslyUnrelated(inboundText: string): boolean {
  const text = cleanText(inboundText);
  if (!text) return true;
  if (/^stop\b/i.test(text)) return true;
  // « oui mais pas… » / « yes but not… » : une réserve n'est pas un accord.
  //
  // LA CONTRACTION EST TRAITÉE À PART, ET C'EST TOUT L'INTÉRÊT DU TEST BILINGUE.
  // Le premier jet écrivait `\b(pas|non|not|n't|never|jamais)\b`. Dans
  // « can't », le `n` est précédé de `a` : il n'y a AUCUNE frontière de mot
  // avant `n't`, donc l'alternative ne mordait jamais. « sure but I can't »
  // passait pour un accord. C'est exactement le défaut déjà payé dans ce dépôt
  // (« `not` ne couvre pas `doesn't` »), reproduit ici et attrapé par le test
  // EN — le test FR seul serait resté vert.
  const negation = /(?:\b(?:pas|non|no|not|never|jamais|aucun|rien)\b|n['’]t\b)/i;
  const concession = /\b(?:mais|but|however|par contre)\b/i;
  if (concession.test(text) && negation.test(text)) {
    // La négation doit venir APRÈS la concession : « je ne peux pas mais
    // vas-y » est un accord, pas une réserve.
    const at = text.search(concession);
    if (negation.test(text.slice(at))) return true;
  }
  return false;
}

/**
 * Interprète une réponse libre CONTRE la question posée.
 *
 * Rend le `payload` du bouton retenu — jamais son libellé. Un libellé est de
 * l'affichage ; le payload est ce que le produit exécute. `classifyTemplateReplyChoice`
 * rendait le libellé et devait le remapper à chaque appelant, ce qui a produit
 * un « Absolument! » vs « Absolument ! » silencieusement classé `unrelated`.
 */
export async function classifyArmedQuestionReply(params: {
  question: ArmedQuestion;
  inboundText: string;
  requestId?: string;
  userId?: string;
  /** Injectable pour les tests : évite tout appel réseau. */
  llmRunner?: (systemPrompt: string, userPrompt: string) => Promise<unknown>;
}): Promise<ArmedQuestionClassification> {
  const buttons = params.question.buttons;
  if (!cleanText(params.inboundText) || buttons.length === 0) {
    return { choice: "unrelated", confidence: 0 };
  }
  if (isObviouslyUnrelated(params.inboundText)) {
    return { choice: "unrelated", confidence: 1 };
  }
  // Le libellé exact ne coûte pas un appel de modèle.
  const exact = findExactButton(buttons, params.inboundText);
  if (exact) return { choice: exact.payload, confidence: 1 };

  const systemPrompt =
    "Sophia asked the question below in an in-app chat, with reply buttons. " +
    "The user answered freely, in their own words. Say which button their answer maps to. " +
    "A clear agreement stays an agreement even if it is long, casual, misspelled or rephrased. " +
    "Answer `unrelated` only if the reply does not answer the question, " +
    "or if it carries a real reservation or a refusal. " +
    "The user may write in English or French; both are normal. " +
    'Answer ONLY as JSON: {"choice": <exact label of one button|"unrelated"|"unknown">, "confidence": <0..1>}.';
  const userPrompt = JSON.stringify({
    question_posee: params.question.content,
    boutons_possibles: buttons.map((b) => b.label),
    reponse_utilisateur: params.inboundText,
  });

  try {
    const raw = params.llmRunner
      ? await params.llmRunner(systemPrompt, userPrompt)
      : await generateWithGemini(
        systemPrompt,
        userPrompt,
        0,
        true,
        [],
        "auto",
        {
          requestId: params.requestId,
          userId: params.userId,
          source: "chat-armed-question-classifier",
          model: "gpt-5.4-nano",
          forceInitialModel: true,
          disableFallbackChain: true,
          reasoningEffort: "none",
          httpTimeoutMs: 5_000,
          maxRetries: 1,
        },
      );
    const parsed = parseClassification(raw);
    if (parsed.choice === "unknown" || parsed.choice === "unrelated") {
      return parsed;
    }
    // On mappe sur le LIBELLÉ normalisé, puis on rend le PAYLOAD. Un modèle qui
    // répond « Absolument! » au lieu de « Absolument ! » devenait
    // silencieusement `unrelated` avant cette normalisation.
    const matched = findExactButton(buttons, parsed.choice);
    if (parsed.confidence < 0.8 || !matched) {
      return { choice: "unrelated", confidence: parsed.confidence };
    }
    return { choice: matched.payload, confidence: parsed.confidence };
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "armed_question_classifier_failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    return { choice: "unknown", confidence: 0 };
  }
}
