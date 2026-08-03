/**
 * PIVOT NUTRITION §3.2 — le FLOW LOCAL `meal_photo`.
 *
 * Une machine à états courte, avec ses conditions d'entrée ET de sortie
 * explicites, son max-tours, son timeout, et — obligatoire — son ESCAPE HATCH.
 *
 * ── L'ESCAPE HATCH N'EST PAS UN CAS LIMITE ───────────────────────────────
 * §3.3bis, "mixed-initiative": les deux parties peuvent prendre l'initiative,
 * et celle de l'élève gagne TOUJOURS. « Un flow qui retient un utilisateur
 * contre son intention est un bug de conception, pas un cas limite. » Ce dépôt
 * a déjà payé exactement ça (`blocked_exit_before_plan_ready`,
 * `safety-crisis-flow-no-exit-on-denial`: trois tours de piège malgré un déni).
 *
 * Donc la sortie est vérifiée AVANT toute logique de flow, et elle est
 * inconditionnelle. Il n'existe aucun état de ce flow d'où l'on ne peut pas
 * sortir en changeant de sujet.
 *
 * ── LE CAS QUI JUSTIFIE LE FLOW (§7.4, J1 soir) ──────────────────────────
 * « Photo + "avec de l'huile du coup ?" → Mise à jour de l'entrée, pas de
 * double log. »
 *
 * Sans flow, ce message est un tour indépendant: le dispatcher y voit une
 * information alimentaire et écrit un SECOND `protocol_events`. L'élève a
 * mangé une fois et le protocole en compte deux — et la couverture, qui est la
 * métrique la plus prédictive (PHOTO_QUANTIFICATION §5), devient fausse à la
 * hausse. Le flow existe pour que la réponse à une question qu'on vient de
 * poser reste attachée au fait qu'on vient d'écrire.
 *
 * PURE MODULE: no I/O, no clock (le caller passe `now`), no randomness.
 */

// ---------------------------------------------------------------------------
// L'état
// ---------------------------------------------------------------------------

/**
 * R1: tokens ASCII. R6: chaque valeur a une branche nommée dans `reduce`.
 *
 *   awaiting_clarification — une photo a été analysée, une question a été
 *                            posée, et sa réponse changerait la conclusion.
 *   awaiting_correction    — l'accusé est parti sans question; l'élève peut
 *                            encore corriger ("non c'était du poulet").
 *   closed                 — le flow ne tourne plus.
 */
export const MEAL_PHOTO_STATES = [
  "awaiting_clarification",
  "awaiting_correction",
  "closed",
] as const;
export type MealPhotoState = (typeof MEAL_PHOTO_STATES)[number];

export const MEAL_PHOTO_EXIT_REASONS = [
  "answered",
  "corrected",
  "topic_changed",
  "max_turns",
  "timeout",
  "new_photo",
  "safety",
] as const;
export type MealPhotoExitReason = (typeof MEAL_PHOTO_EXIT_REASONS)[number];

export interface MealPhotoFlowState {
  state: MealPhotoState;
  /** La ligne `protocol_events` que ce flow peut encore amender. */
  eventId: string;
  /** Tours entrants consommés depuis l'ouverture. */
  turns: number;
  openedAt: string;
  /** La question posée, si une l'a été. */
  question: string | null;
}

/**
 * Deux tours, pas plus.
 *
 * Le flow sert à rattacher UNE réponse à UNE question. Au-delà, l'élève parle
 * d'autre chose et le dispatcher global fait un meilleur travail que nous —
 * insister est précisément l'interrogatoire que §3.3bis interdit.
 */
export const MEAL_PHOTO_MAX_TURNS = 2;

/**
 * Au-delà, la réponse ne porte plus sur cette photo.
 *
 * 30 minutes et pas 24 h: « avec de l'huile du coup ? » deux heures plus tard
 * est un nouveau sujet, et amender un fait vieux de deux heures sur la foi
 * d'un message ambigu écrase une donnée réelle par une supposition.
 */
export const MEAL_PHOTO_TIMEOUT_MINUTES = 30;

// ---------------------------------------------------------------------------
// L'entrée du tour
// ---------------------------------------------------------------------------

/**
 * Ce que le dispatcher LOCAL a compris du message entrant.
 *
 * C'est un CLASSIFIEUR, jamais une regex (§3.1: « jamais de regex pour
 * interpréter un humain »). Ce module ne regarde pas le texte: il reçoit une
 * intention déjà classée et décide de la transition. C'est ce qui le rend
 * testable exhaustivement — et ce qui garantit qu'aucune regex de sens ne peut
 * s'y glisser plus tard.
 */
export const MEAL_PHOTO_INTENTS = [
  /** Répond à la question posée ("oui à l'huile d'olive"). */
  "answers_question",
  /** Corrige l'analyse ("c'était du poulet, pas du porc"). */
  "corrects_analysis",
  /** Parle d'autre chose. */
  "unrelated",
  /** Envoie une nouvelle photo. */
  "new_photo",
  /** Le classifieur n'a pas tranché. */
  "unknown",
] as const;
export type MealPhotoIntent = (typeof MEAL_PHOTO_INTENTS)[number];

export interface MealPhotoTurnInput {
  flow: MealPhotoFlowState;
  intent: MealPhotoIntent;
  /** Bande de safety du tour. Tout sauf `none` ferme le flow. */
  safetyBand?: "none" | "low" | "medium" | "high" | "critical" | null;
  now: Date;
}

export type MealPhotoDecision =
  | {
    kind: "amend_event";
    eventId: string;
    /** Ce que l'amendement porte: une réponse, ou une correction. */
    amendment: "answer" | "correction";
    nextFlow: MealPhotoFlowState;
  }
  | { kind: "exit"; reason: MealPhotoExitReason; nextFlow: MealPhotoFlowState }
  | { kind: "stay"; nextFlow: MealPhotoFlowState };

function closed(flow: MealPhotoFlowState): MealPhotoFlowState {
  return { ...flow, state: "closed" };
}

function minutesSince(openedAt: string, now: Date): number {
  const opened = new Date(openedAt).getTime();
  if (!Number.isFinite(opened)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - opened) / 60_000;
}

/**
 * La transition. L'ORDRE DES GARDES EST LE CONTRAT.
 *
 *   1. safety      — un tour de crise ferme le flow. On ne demande pas à
 *                    quelqu'un en détresse s'il a mis de l'huile.
 *   2. escape      — l'initiative de l'élève gagne, inconditionnellement, et
 *                    AVANT tout le reste (voir l'en-tête).
 *   3. new_photo   — la photo suivante ouvre son propre flow; l'ancien se
 *                    ferme au lieu de capturer la nouvelle.
 *   4. timeout     — au-delà de la fenêtre, ce n'est plus la même photo.
 *   5. max_turns   — deux tours et on rend la main.
 *   6. le métier   — répondre / corriger.
 */
export function reduceMealPhotoFlow(input: MealPhotoTurnInput): MealPhotoDecision {
  const { flow, intent, now } = input;

  if (flow.state === "closed") {
    return { kind: "exit", reason: "topic_changed", nextFlow: flow };
  }

  const band = input.safetyBand ?? "none";
  if (band !== "none") {
    return { kind: "exit", reason: "safety", nextFlow: closed(flow) };
  }

  // L'ESCAPE HATCH. Avant le timeout, avant le max-tours, avant tout: si
  // l'élève parle d'autre chose, il sort. Aucun état n'y échappe.
  if (intent === "unrelated") {
    return { kind: "exit", reason: "topic_changed", nextFlow: closed(flow) };
  }

  if (intent === "new_photo") {
    return { kind: "exit", reason: "new_photo", nextFlow: closed(flow) };
  }

  if (minutesSince(flow.openedAt, now) > MEAL_PHOTO_TIMEOUT_MINUTES) {
    return { kind: "exit", reason: "timeout", nextFlow: closed(flow) };
  }

  const turns = flow.turns + 1;
  if (turns > MEAL_PHOTO_MAX_TURNS) {
    return { kind: "exit", reason: "max_turns", nextFlow: closed(flow) };
  }

  if (intent === "answers_question") {
    // LE CAS §7.4 J1 soir: on AMENDE la ligne, on n'en crée pas une seconde.
    return {
      kind: "amend_event",
      eventId: flow.eventId,
      amendment: "answer",
      nextFlow: closed({ ...flow, turns }),
    };
  }

  if (intent === "corrects_analysis") {
    return {
      kind: "amend_event",
      eventId: flow.eventId,
      amendment: "correction",
      nextFlow: closed({ ...flow, turns }),
    };
  }

  // `unknown`: le classifieur n'a pas tranché. On NE DEVINE PAS (§3.3bis:
  // deviner est interdit). On reste un tour de plus, ce qui laisse le
  // dispatcher global répondre normalement pendant que le flow attend — et le
  // max-tours ferme de toute façon au tour suivant.
  return { kind: "stay", nextFlow: { ...flow, turns } };
}

/** L'état initial, posé quand une photo vient d'être analysée et écrite. */
export function openMealPhotoFlow(args: {
  eventId: string;
  question: string | null;
  now: Date;
}): MealPhotoFlowState {
  return {
    // Une question posée attend une réponse; sans question, on reste
    // seulement ouvert à une correction. Les deux states existent parce que
    // le renderer ne doit pas relancer une question qu'il n'a pas posée.
    state: args.question ? "awaiting_clarification" : "awaiting_correction",
    eventId: args.eventId,
    turns: 0,
    openedAt: args.now.toISOString(),
    question: args.question,
  };
}
