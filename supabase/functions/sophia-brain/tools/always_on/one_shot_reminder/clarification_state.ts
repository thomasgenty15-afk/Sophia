// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAT DES QUESTIONS DE CLARIFICATION D'UN RAPPEL PONCTUEL
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `router.ts` (découpage des gros fichiers,
// lot 5b). Aucune logique changée. `router.ts` ré-exporte tout ce qui est
// exporté ici : les appelants et les tests continuent d'importer depuis lui.
// Ce module n'importe jamais `router.ts`.
//
// Ce qui est ici : la question de clarification en attente et le rappel
// différé pendant une crise (lus et écrits dans `temp_memory`), la
// rétractation d'une clarification, et la purge des gabarits (« [heure] »)
// du texte visible.

import type { OneShotReminderDirectEffectResult } from "./contract.ts";

// P2-3d (rose-lifecycle R1-B03): la réponse à un clarify replace repassait
// par l'intake comme énoncé neuf → reclassée reschedule → blocage circulaire
// (« annule puis recrée » = ce que l'utilisatrice venait de faire). Le pending
// clarify est persisté ici et exposé UNE fois au dispatcher au tour suivant
// (même mécanique 3g que track_progress) pour que la réponse complète CE
// replace.
export const ONE_SHOT_REMINDER_CLARIFICATION_RUNTIME_KEY =
  "__one_shot_reminder_pending_clarification";

export function applyOneShotReminderPendingClarification(args: {
  temp_memory: Record<string, unknown>;
  pending_clarification:
    | {
      intent: "replace" | "create";
      reason_code: string;
      clarify_question: string;
      known_slots: Record<string, unknown>;
    }
    | null
    | undefined;
  source_message_id?: string | null;
}): void {
  if (args.pending_clarification) {
    (args.temp_memory as Record<string, unknown>)[
      ONE_SHOT_REMINDER_CLARIFICATION_RUNTIME_KEY
    ] = {
      mode: "needs_clarify",
      ...args.pending_clarification,
      source_message_id: args.source_message_id ?? null,
      clarification_exposed_to_dispatcher: false,
    };
    return;
  }
  // Toute exécution de la lane sans nouveau clarify SUPERSÈDE le pending —
  // un état périmé re-armerait un replace abandonné.
  if (
    (args.temp_memory as Record<string, unknown>)[
      ONE_SHOT_REMINDER_CLARIFICATION_RUNTIME_KEY
    ]
  ) {
    delete (args.temp_memory as Record<string, unknown>)[
      ONE_SHOT_REMINDER_CLARIFICATION_RUNTIME_KEY
    ];
  }
}

// P4-C (paul-p3verify R1-B03): le différé de crise promettait « je te le
// remets sur la table quand ça ira mieux » sans JAMAIS tenir la promesse —
// l'effet différé n'était stocké nulle part. Il se persiste ici (mutation
// in-place, leçon P1-2) et s'expose UNE fois au dispatcher au premier tour
// post-crise, avec les slots connus pour ré-émettre le create.
export const SAFETY_DEFERRED_REMINDER_RUNTIME_KEY =
  "__safety_deferred_reminder";

export function storeSafetyDeferredReminder(args: {
  temp_memory: Record<string, unknown>;
  known_slots: Record<string, unknown>;
}): void {
  args.temp_memory[SAFETY_DEFERRED_REMINDER_RUNTIME_KEY] = {
    mode: "deferred",
    known_slots: args.known_slots,
    exposed_to_dispatcher: false,
  };
}

export function pendingSafetyDeferredReminderForDispatcher(
  tempMemory: unknown,
): { known_slots: Record<string, unknown> } | null {
  const runtime = (tempMemory as Record<string, unknown> | null | undefined)
    ?.[SAFETY_DEFERRED_REMINDER_RUNTIME_KEY] as
      | Record<string, unknown>
      | undefined;
  if (!runtime || runtime.mode !== "deferred") return null;
  if (runtime.exposed_to_dispatcher === true) return null;
  runtime.exposed_to_dispatcher = true;
  return {
    known_slots:
      runtime.known_slots && typeof runtime.known_slots === "object"
        ? runtime.known_slots as Record<string, unknown>
        : {},
  };
}

/**
 * P8-E (paul-untested22 R1 T15): go EXPLICITE de re-serve du différé de
 * crise — « remets-le maintenant », « vas-y pose-le », « tu peux le poser ».
 * Détection délibérément étroite (verbe de pose + clitique objet ou go
 * appuyé), jamais un « oui » isolé: ce prédicat lève un verrou de crise, il
 * exige la demande la plus explicite possible.
 */
export function explicitDeferredReServeAsk(message: string): boolean {
  const text = String(message ?? "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return /\b(remets|reposes?|poses?|mets)[- ](le|la|moi le|moi la)\b/
    .test(text) ||
    /\b(tu peux|vas[- ]?y,?)\s*(le|la)?\s*(poser|remettre|mettre|reposer)\b/
      .test(text);
}

/** Le différé est soldé dès qu'un create commit (le rappel est posé). */
export function clearSafetyDeferredReminderOnCommit(args: {
  temp_memory: Record<string, unknown>;
  committed_effects: Array<{ type?: string }>;
}): void {
  if (
    args.committed_effects.some((effect) =>
      String(effect?.type ?? "") === "create_one_shot_reminder"
    ) && args.temp_memory[SAFETY_DEFERRED_REMINDER_RUNTIME_KEY]
  ) {
    delete args.temp_memory[SAFETY_DEFERRED_REMINDER_RUNTIME_KEY];
  }
}

export function pendingOneShotReminderClarificationForDispatcher(
  tempMemory: unknown,
): {
  effect_type: "create_one_shot_reminder";
  intent: "replace" | "create";
  reason_code: string;
  clarify_question: string;
  known_slots: Record<string, unknown> | null;
} | null {
  const runtime = (tempMemory as Record<string, unknown> | null | undefined)
    ?.[ONE_SHOT_REMINDER_CLARIFICATION_RUNTIME_KEY] as
      | Record<string, unknown>
      | undefined;
  if (!runtime || runtime.mode !== "needs_clarify") return null;
  if (runtime.clarification_exposed_to_dispatcher === true) return null;
  runtime.clarification_exposed_to_dispatcher = true;
  return {
    effect_type: "create_one_shot_reminder",
    // P5-D: le pending porte son intent (create = clarify de créneau).
    intent: runtime.intent === "create" ? "create" : "replace",
    reason_code: String(runtime.reason_code ?? "needs_clarify"),
    clarify_question: String(runtime.clarify_question ?? ""),
    known_slots:
      runtime.known_slots && typeof runtime.known_slots === "object"
        ? runtime.known_slots as Record<string, unknown>
        : null,
  };
}

/** P5-D: slots connus d'un clarify CREATE en attente (créneau demandé au
 * tour précédent) — lus sans consommer l'exposition dispatcher. */
export function pendingCreateClarificationKnownSlots(
  tempMemory: unknown,
): Record<string, unknown> | null {
  const runtime = (tempMemory as Record<string, unknown> | null | undefined)
    ?.[ONE_SHOT_REMINDER_CLARIFICATION_RUNTIME_KEY] as
      | Record<string, unknown>
      | undefined;
  if (!runtime || runtime.mode !== "needs_clarify") return null;
  if (runtime.intent !== "create") return null;
  return runtime.known_slots && typeof runtime.known_slots === "object"
    ? runtime.known_slots as Record<string, unknown>
    : null;
}

/** P7-C: raison du clarify CREATE en attente — la fusion méridiem ne s'arme
 * que sur `hour_meridiem_ambiguous`, jamais sur un autre clarify. */
export function pendingCreateClarificationReason(
  tempMemory: unknown,
): string | null {
  const runtime = (tempMemory as Record<string, unknown> | null | undefined)
    ?.[ONE_SHOT_REMINDER_CLARIFICATION_RUNTIME_KEY] as
      | Record<string, unknown>
      | undefined;
  if (!runtime || runtime.mode !== "needs_clarify") return null;
  if (runtime.intent !== "create") return null;
  return String(runtime.reason_code ?? "").trim() || null;
}

/** P12-D1 (alex-untested24 R1-B03): état COMPLET du clarify one-shot en
 * attente — TOUS intents (create ET replace) — lu sans consommer
 * l'exposition dispatcher. Sert à la fusion généralisée du tour-réponse et
 * aux conditions de désarmement (rétractation D2a, composite D2b). */
export function pendingOneShotReminderClarificationState(
  tempMemory: unknown,
): {
  intent: "create" | "replace";
  reason_code: string;
  clarify_question: string;
  known_slots: Record<string, unknown>;
} | null {
  const runtime = (tempMemory as Record<string, unknown> | null | undefined)
    ?.[ONE_SHOT_REMINDER_CLARIFICATION_RUNTIME_KEY] as
      | Record<string, unknown>
      | undefined;
  if (!runtime || runtime.mode !== "needs_clarify") return null;
  return {
    intent: runtime.intent === "create" ? "create" : "replace",
    reason_code: String(runtime.reason_code ?? "").trim(),
    clarify_question: String(runtime.clarify_question ?? ""),
    known_slots: runtime.known_slots && typeof runtime.known_slots === "object"
      ? runtime.known_slots as Record<string, unknown>
      : {},
  };
}

/**
 * P12-D2a (alex-untested24 R1-B03c, doctrine P9): RÉTRACTATION sous clarify
 * actif — « laisse tomber », « oublie », « c'est bon on annule » — le pending
 * doit être PURGÉ, zéro question résiduelle. Condition de désarmement (test
 * prémisse-fausse): un message qui porte une NOUVELLE spec explicite (heure
 * chiffrée, jour nommé, « rappelle-moi ») n'est PAS une rétractation, il se
 * lit à neuf.
 */
export function isBareClarifyRetraction(message: string): boolean {
  const text = String(message ?? "").normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ").toLowerCase();
  const retracts = /\b(laisse|laissez|laissons) tomber\b/.test(text) ||
    /\boublie\b(?!\s+pas\b)/.test(text) ||
    /\bc est bon[,. ]+\s*(on |tu )?(annule|laisse|oublie)\b/.test(text) ||
    /\bon annule\b/.test(text) ||
    /\b(abandonne|finalement non|non c est bon)\b/.test(text);
  if (!retracts) return false;
  const carriesNewSpec = /\b\d{1,2}\s*h(\d{2})?\b/.test(text) ||
    /\b(demain|apres[- ]demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/
      .test(text) ||
    /\brappelle[- ]?(moi|nous)\b/.test(text);
  return !carriesNewSpec;
}

/**
 * P12-D2d (nina-p10reval R1-B04 T12): AUCUN texte visible ne porte un
 * placeholder de template (« [heure] », « [objet] »…) — le backstop qui
 * recopiait une consigne runtime fuyait le gabarit brut à l'utilisateur.
 * Remplacement naturel pour les gabarits connus, strip générique sinon.
 */
export function stripTemplatePlaceholders(
  text: string | null | undefined,
): string | null {
  if (text === null || text === undefined) return text ?? null;
  return String(text)
    .replace(/\[\s*heures?\s*\]/gi, "la nouvelle heure")
    .replace(/\[\s*objets?\s*\]/gi, "l'objet du rappel")
    .replace(/\[\s*(date|jour)\s*\]/gi, "le jour")
    .replace(/\s?\[[a-zà-ÿ' _-]{2,24}\]/gi, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

function sanitizeOneShotReminderVisibleResult(
  result: OneShotReminderDirectEffectResult,
): OneShotReminderDirectEffectResult {
  const cleanReply = stripTemplatePlaceholders(result.reply);
  const pending = result.pending_clarification
    ? {
      ...result.pending_clarification,
      clarify_question: stripTemplatePlaceholders(
        result.pending_clarification.clarify_question,
      ) ?? result.pending_clarification.clarify_question,
    }
    : result.pending_clarification;
  if (cleanReply === result.reply && pending === result.pending_clarification) {
    return result;
  }
  return { ...result, reply: cleanReply, pending_clarification: pending };
}

// Exportés pour `router.ts` seulement (ils n'étaient pas exportés quand ils
// vivaient dans `router.ts`) ; `router.ts` ne les ré-exporte pas.
export {
  sanitizeOneShotReminderVisibleResult,
};
