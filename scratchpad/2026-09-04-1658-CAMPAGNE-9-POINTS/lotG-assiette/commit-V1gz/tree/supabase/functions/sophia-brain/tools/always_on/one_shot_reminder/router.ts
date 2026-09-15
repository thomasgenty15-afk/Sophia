import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type {
  OneShotReminderCommittedEffect,
  OneShotReminderDirectEffectResult,
  OneShotReminderDirectEffectTool,
  OneShotReminderIntent,
  OneShotReminderToolOutcome,
} from "./contract.ts";
import { buildOneShotReminderIntake } from "./intake.ts";
import {
  daypartWindowFromReference,
  extractQuotedReminderInstruction,
  extractReminderInstruction,
  hasAdditiveReminderMarker,
  isDegenerateReminderInstruction,
  isReminderEntityReference,
  isReminderInstructionInvarianceAnaphora,
} from "./instruction_parser.ts";
import {
  maybeCancelOneShotReminder,
  maybeCreateOneShotReminder,
  maybeCreateOneShotReminderFromStructuredEffect,
} from "./executor.ts";
import {
  readPendingOneShotReminderRows,
  readRecentOneShotReminderRows,
} from "./persistence.ts";
import {
  extractTargetHHMMFromMessage,
  hasAnyExplicitDayToken,
  hasExplicitFutureDayHint,
  localHHMMForScheduledFor,
  parseOneShotReminderRequest,
  parseScheduledForFromMessage,
  resolveMeridiemClarifyAnswer,
  resolvePastTimeClarifyAnswer,
} from "./time_parser.ts";
import { getUserTimeContext } from "../../../../_shared/user_time_context.ts";
export {
  buildMinuteByMinuteSequenceAddonForOneShotReminder
    as buildMinuteByMinuteSequenceAddon,
  localTextAddonForOneShotReminder as localTextAddonForOneShotReminder,
  oneShotReminderManagementReply,
} from "./renderer.ts";

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

/**
 * P12-D4 (nina-p10reval R1-B03a): jour nommé ATTACHÉ à la référence d'entité
 * (« celui de vendredi », « le rappel de jeudi ») — par opposition au jour de
 * DESTINATION (« décale-le à vendredi », qui reste un replace). Retourne le
 * token de jour ancré sur l'entité, ou null.
 */
function entityAnchoredDayToken(text: string): string | null {
  const normalized = String(text ?? "").normalize("NFD")
    .replace(/\p{Diacritic}/gu, "").replace(/[’']/g, " ").toLowerCase();
  const match = normalized.match(
    /\b(?:celui|celle|le rappel|mon rappel|ce rappel)\s+(?:de|du|d)\s*(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|apres[- ]demain)\b/,
  );
  return match ? match[1] : null;
}

/** Jour civil local (fr, minuscule) d'un ISO — pour matcher un jour nommé. */
function localWeekdayName(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone,
      weekday: "long",
    }).format(new Date(iso)).toLowerCase();
  } catch (_error) {
    return "";
  }
}

/**
 * P12-D7 (alex-untested24 R1-B06/B07, principe P5-E): tokens de CONTENU du
 * message — les verbes de commande et le vocabulaire de la mécanique rappel
 * sont exclus pour que « mets le rappel des courses à 16h » ne matche que par
 * « courses ». Sert à résoudre une cible UNIQUE par évidence nommée, jamais à
 * deviner entre plusieurs candidats positifs.
 */
const ROUTER_COMMAND_STOPWORDS = new Set([
  "rappel", "rappels", "rappelle", "rappelles", "annule", "annuler",
  "remets", "remet", "remettre", "decale", "decaler", "repousse", "avance",
  "replanifie", "reprogramme", "supprime", "mets", "mettre", "celui",
  "celle", "heure", "heures", "lieu", "demain", "matin", "soir", "midi",
  "nuit", "plutot", "maintenant", "nouvelle", "nouveau", "aujourd", "manque",
  "peux", "veux", "vais", "faut", "cette", "stp", "merci", "lundi", "mardi",
  "mercredi", "jeudi", "vendredi", "samedi", "dimanche", "garde", "gardes",
  "conserve", "rajoute", "rajoutes", "ajoute", "ajouter",
]);

function reminderContentTokensFromMessage(text: string): string[] {
  return [...oneShotInstructionTokens(text)]
    .filter((token) => !ROUTER_COMMAND_STOPWORDS.has(token));
}

/** Score de recouvrement contenu-message ↔ instruction d'un pending
 * (tolérance morphologique, mêmes règles que instructionTokensOverlap). */
function messageContentOverlapScore(
  message: string,
  rowInstruction: string,
): number {
  const contentTokens = reminderContentTokensFromMessage(message);
  if (contentTokens.length === 0) return 0;
  const rowTokens = [...oneShotInstructionTokens(rowInstruction)];
  const morphMatch = (x: string, y: string) => {
    if (x === y) return true;
    const shared = Math.min(x.length, y.length);
    if (shared < 5) return false;
    return x.slice(0, 5) === y.slice(0, 5);
  };
  return contentTokens.filter((token) =>
    rowTokens.some((rowToken) => morphMatch(token, rowToken))
  ).length;
}

/**
 * P12-D4/D8a: résolution civile d'un jour nommé + HH:MM (prochaine
 * occurrence, timezone user) via une date absolue française — la seule forme
 * sûre du parseur (le fallback naïf ancrait un jour de semaine nu sur
 * aujourd'hui, leçon P9-C).
 */
function composeNamedDayWithHHMM(args: {
  dayToken: string;
  hhmm: string;
  timezone: string;
  nowUtcIso: string;
}): string | null {
  const weekdayFmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: args.timezone,
    weekday: "long",
  });
  const civilFmt = new Intl.DateTimeFormat("fr-CA", {
    timeZone: args.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const monthNames = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  const nowMs = new Date(args.nowUtcIso).getTime();
  if (!Number.isFinite(nowMs)) return null;
  for (let dayOffset = 1; dayOffset <= 14; dayOffset += 1) {
    const candidate = new Date(nowMs + dayOffset * 86_400_000);
    const matchesToken = args.dayToken === "demain"
      ? dayOffset === 1
      : args.dayToken.startsWith("apres")
      ? dayOffset === 2
      : weekdayFmt.format(candidate).toLowerCase() === args.dayToken;
    if (!matchesToken) continue;
    const civil = civilFmt.format(candidate);
    const [yearStr, monthStr, dayStr] = civil.split("-");
    const composed = `rappelle-moi le ${Number(dayStr)} ${
      monthNames[Number(monthStr) - 1]
    } ${yearStr} à ${args.hhmm.replace(":", "h")} de t'en occuper`;
    return parseOneShotReminderRequest({
      message: composed,
      timezone: args.timezone,
      nowIso: args.nowUtcIso,
    })?.scheduledFor ??
      parseScheduledForFromMessage({
        message: composed,
        timezone: args.timezone,
        nowIso: args.nowUtcIso,
      });
  }
  return null;
}

// P5-F (nina-global20 B01, alex-untested20 R1-B02): détection déterministe
// d'une demande de BROUILLON / validation préalable — « montre-le-moi
// d'abord », « le crée pas tout de suite », « je valide avant ». Un create
// sous ces marqueurs ne committe JAMAIS : brouillon rendu + slots persistés,
// le commit attend la confirmation explicite du tour suivant.
export function oneShotReminderDraftRequested(message: string): boolean {
  const text = ` ${
    String(message ?? "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .toLowerCase()
      .trim()
  } `;
  const markers: RegExp[] = [
    / brouillon /,
    / montre (le |la )?(moi )?(d abord|avant)/,
    / montre moi (le |la )?(d abord|avant)/,
    / avant de (le|la) (poser|creer|poster|valider)/,
    / (le|la) cree pas (tout de suite|encore|direct)/,
    / ne (le|la) cree pas /,
    / je (veux|voudrais) valider /,
    / je valide avant /,
    / attends? ma validation /,
    / sans (le|la) creer /,
  ];
  return markers.some((marker) => marker.test(text));
}

// P5-B (rose-hard17 T14-T15): détection déterministe d'une QUESTION DE
// VERIFICATION sur un rappel (« t'es sûre que… est annulé ? », « vérifie »,
// « toujours programmé ? »). Le dispatcher classe parfois ces tours en
// intent=cancel — exécuter ce cancel a détruit le mauvais rappel (repli
// pending-unique) puis affirmé le contraire. Une vérification = LECTURE de
// projection DB, zéro write, quel que soit l'intent émis.
export function isOneShotReminderVerificationQuestion(
  message: string,
): boolean {
  const text = String(message ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .toLowerCase();
  const markers: RegExp[] = [
    // « t'es sûre / tu es sûr que … »
    /\b(t|tu)\s*es\s+sur[es]?\b/,
    // « vérifie / tu peux vérifier »
    /\bverifi(e|er|es|ez)\b/,
    // « est-ce que … est (bien) annulé / programmé / enregistré / prévu »
    /\best[- ]ce\s+qu\S*\b.*\b(annul|programm|enregistr|prevu|actif|encore)/,
    // « … toujours programmé / prévu / actif ? »
    /\btoujours\s+(programm|prevu|actif|en\s+place|la)\b.*\?/,
    // « c'est bien annulé / enregistré / posé ? »
    /\b(bien|vraiment)\s+(annul|enregistr|programm|pos[ee]|note)\S*\b.*\?/,
    // « … est encore actif / prévu ? »
    /\bencore\s+(actif|prevu|programm)/,
  ];
  return markers.some((marker) => marker.test(text));
}

export function classifyOneShotReminderDirectIntent(
  message: string,
  directEffectsToRun: string[] = [],
): {
  detected: boolean;
  intent: OneShotReminderIntent | "ignore" | "product_help" | "status_question";
  time_expression: string | null;
  constraints: Array<{ kind: string; evidence: string[] }>;
  reason_code: string;
} {
  const intake = buildOneShotReminderIntake({
    message,
    directEffectsToRun,
  });
  return {
    detected: intake.detected,
    intent: intake.intent,
    time_expression: intake.time_expression,
    constraints: intake.constraints,
    reason_code: intake.reason_code === "create_intent"
      ? "create_intent"
      : intake.reason_code === "cancel_intent"
      ? "cancel_intent"
      : intake.reason_code,
  };
}

function baseDirectEffectResult(args: {
  detected: boolean;
  intent: OneShotReminderIntent;
  status: OneShotReminderDirectEffectResult["status"];
  reason_code: string;
  reply?: string | null;
}): OneShotReminderDirectEffectResult {
  return {
    detected: args.detected,
    intent: args.intent,
    status: args.status,
    reply: args.reply ?? null,
    requested_effects: [],
    allowed_effects: [],
    attempted_effects: [],
    executed_tools: [],
    committed_effects: [],
    blocked_effects: [],
    constraints: [],
    scheduled_for: null,
    local_label: null,
    reminder_instruction: null,
    target_reminder_ids: [],
    missing_slots: [],
    debug: { reason_code: args.reason_code },
  };
}

/**
 * Resultat canonique « demande recurrente, rien cree en ponctuel » — source
 * unique partagee entre le router du tool et l'intake du runtime (alex-r1
 * B02): la classification de cadence se consomme AVANT l'armement, sans
 * dependre du gate aval pour masquer une mauvaise selection.
 */
export function recurringNotSupportedDirectEffectResult(
  effectType: OneShotReminderDirectEffectTool = "create_one_shot_reminder",
): OneShotReminderDirectEffectResult {
  return {
    ...baseDirectEffectResult({
      detected: true,
      intent: "create",
      status: "blocked",
      reason_code: "recurring_not_supported",
      reply:
        "Un rappel récurrent se règle dans les Initiatives — je n'ai rien créé en ponctuel.",
    }),
    requested_effects: [{ type: effectType, reason_code: "create" }],
    blocked_effects: [{
      type: effectType,
      reason_code: "recurring_not_supported",
    }],
  };
}

/**
 * P3-A (alex-safety-escalation R1-B01): résultat canonique « effet différé
 * pendant une crise safety » — la lane ne s'exécute JAMAIS sur un tour de
 * crise (active_safety_crisis / idéation), l'exception V5-1 ne valant que
 * pour la détresse medium non-crise. Le tour porte un outcome blocked avec
 * différé honnête au lieu d'un commit ou d'un silence.
 */
export function safetyCrisisDeferredDirectEffectResult(
  effectType: OneShotReminderDirectEffectTool = "create_one_shot_reminder",
): OneShotReminderDirectEffectResult {
  return {
    ...baseDirectEffectResult({
      detected: true,
      intent: "create",
      status: "blocked",
      reason_code: "safety_crisis_deferred",
      reply:
        "Je le garde pour après — là, tout de suite, on reste sur toi. Je te le remets sur la table quand ça ira mieux.",
    }),
    requested_effects: [{ type: effectType, reason_code: "create" }],
    blocked_effects: [{
      type: effectType,
      reason_code: "safety_crisis_deferred",
    }],
  };
}

function uniqueToolsFromCommitted(
  committedEffects: OneShotReminderCommittedEffect[],
): OneShotReminderDirectEffectTool[] {
  return committedEffects
    .map((effect) => effect.type)
    .filter((tool, index, all) => all.indexOf(tool) === index);
}

function requestedEffect(
  type: OneShotReminderDirectEffectTool,
  reasonCode: string,
) {
  return { type, reason_code: reasonCode };
}

function committedCreateEffects(
  outcome: OneShotReminderToolOutcome,
): OneShotReminderCommittedEffect[] {
  if (!outcome.detected || outcome.status !== "success") return [];
  const id = String(outcome.inserted_checkin_id ?? "").trim();
  if (!id) return [];
  return [{
    type: "create_one_shot_reminder",
    id,
    scheduled_for: outcome.scheduled_for,
    local_label: outcome.scheduled_for_local_label,
    reminder_instruction: outcome.reminder_instruction,
  }];
}

function safetyFollowupForTurnFrame(
  turnFrame?: TurnFrame | null,
): string | null {
  const riskBand = String(turnFrame?.safety?.risk_band ?? "").toLowerCase();
  if (!["medium", "high", "critical"].includes(riskBand)) return null;
  return "D'ici là, reste avec ton soutien humain si tu l'as, et garde ce qui peut te blesser hors de portée.";
}

function hasActiveSafetyContext(turnFrame?: TurnFrame | null): boolean {
  return safetyFollowupForTurnFrame(turnFrame) !== null;
}

function createReminderSuccessReply(args: {
  localLabel: string;
  reminderInstruction?: string | null;
  turnFrame?: TurnFrame | null;
}): string {
  const instruction = String(args.reminderInstruction ?? "").trim();
  const base = hasActiveSafetyContext(args.turnFrame)
    ? `C'est programmé pour ${args.localLabel}: je te ferai le rappel demandé.`
    : instruction
    ? `C'est programmé pour ${args.localLabel}: je te ferai un rappel pour ${instruction}.`
    : `C'est programmé pour ${args.localLabel}.`;
  return [
    base,
    safetyFollowupForTurnFrame(args.turnFrame),
  ].filter(Boolean).join(" ");
}

function createEffectFromTurnFrame(
  turnFrame?: TurnFrame | null,
): TurnFrame["direct_effects"][number] | undefined {
  return (turnFrame?.direct_effects ?? []).find((candidate) =>
    candidate.effect_type === "create_one_shot_reminder"
  );
}

function payloadText(
  effect: TurnFrame["direct_effects"][number] | undefined,
  key: string,
): string | undefined {
  const hint = effect?.payload_hint &&
      typeof effect.payload_hint === "object" &&
      !Array.isArray(effect.payload_hint)
    ? (effect.payload_hint as Record<string, unknown>)[key]
    : undefined;
  const text = typeof hint === "string" ? hint.trim() : "";
  return text || undefined;
}

function canonicalInstructionHintFromTurnFrame(
  turnFrame?: TurnFrame | null,
): string | undefined {
  return payloadText(createEffectFromTurnFrame(turnFrame), "instruction_hint");
}

function canonicalRawTextFromTurnFrame(
  turnFrame?: TurnFrame | null,
): string | undefined {
  return payloadText(createEffectFromTurnFrame(turnFrame), "raw_text");
}

function canonicalUtcTimeFromTurnFrame(
  turnFrame?: TurnFrame | null,
): string | undefined {
  return payloadText(createEffectFromTurnFrame(turnFrame), "UTC_time");
}

function canonicalWhenHintFromTurnFrame(
  turnFrame?: TurnFrame | null,
): string | undefined {
  return payloadText(createEffectFromTurnFrame(turnFrame), "when_hint");
}

function canonicalLocalLabelFromTurnFrame(
  turnFrame?: TurnFrame | null,
): string | undefined {
  return payloadText(createEffectFromTurnFrame(turnFrame), "local_label");
}

function isValidIsoDate(value: string | undefined): value is string {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime());
}

/** Label local lisible pour la lane status (fr, timezone user). */
function formatOneShotLocalLabel(
  scheduledForIso: string,
  timezone: string,
): string {
  const date = new Date(scheduledForIso);
  if (!Number.isFinite(date.getTime())) return "moment inconnu";
  try {
    const day = new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone,
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(date);
    const time = new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
    return `${day} à ${time}`;
  } catch (_error) {
    return scheduledForIso;
  }
}

function looksTemporalLabel(value: string | undefined): value is string {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return false;
  return /\d/.test(text) ||
    /\b(dans|demain|aujourd|apres|après|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|matin|midi|soir|minute|heure)\b/
      .test(text);
}

/** Tokens significatifs d'une instruction de rappel (match déterministe). */
function oneShotInstructionTokens(text: string): Set<string> {
  return new Set(
    String(text ?? "")
      .normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .toLowerCase().split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4),
  );
}

function instructionTokensOverlap(a: string, b: string): boolean {
  const tokensA = [...oneShotInstructionTokens(a)];
  if (tokensA.length === 0) return false;
  const tokensB = [...oneShotInstructionTokens(b)];
  // P7-F (paul-p6reval R1-B04): tolérance MORPHOLOGIQUE française — « la
  // marche » doit matcher « marcher » (préfixe commun ≥ 5, même règle actée
  // que la couverture de titre track P5-E). Le match exact seul faisait
  // rater une cible nommée pourtant unique → reschedule bloqué à tort.
  const morphMatch = (x: string, y: string) => {
    if (x === y) return true;
    const shared = Math.min(x.length, y.length);
    if (shared < 5) return false;
    return x.slice(0, 5) === y.slice(0, 5);
  };
  return tokensB.some((tokenB) =>
    tokensA.some((tokenA) => morphMatch(tokenA, tokenB))
  );
}

/**
 * P9-A (rose-p8reval T6): une instruction est ANCRÉE dans le message courant
 * quand la majorité de ses tokens significatifs y figurent (tolérance
 * morphologique). Discriminant pollution vs contenu réel: un instruction_hint
 * hérité d'un tour précédent (pollution P6-V 2e forme) n'apparaît pas dans le
 * message; le contenu que l'utilisateur redonne verbatim (« … pour checker
 * mon envie avant de sortir ») y est. Sert de condition de désarmement à la
 * coercition reschedule: clitique + contenu ancré + zéro recouvrement des
 * pendings = l'anaphore vise la SPEC du message (create additif), jamais
 * « le seul pending qui traîne ».
 */
function instructionRootedInText(instruction: string, text: string): boolean {
  const tokens = [...oneShotInstructionTokens(instruction)];
  if (tokens.length === 0) return false;
  const textTokens = [...oneShotInstructionTokens(text)];
  const morphMatch = (x: string, y: string) => {
    if (x === y) return true;
    const shared = Math.min(x.length, y.length);
    if (shared < 5) return false;
    return x.slice(0, 5) === y.slice(0, 5);
  };
  const hits = tokens.filter((token) =>
    textTokens.some((textToken) => morphMatch(token, textToken))
  ).length;
  return hits >= Math.max(1, Math.ceil(tokens.length * 0.6));
}

/**
 * P10-A (nina-hard24 R1-B01): marqueur nocturne ou méridiem EXPLICITE — une
 * heure passée aujourd'hui accompagnée d'un tel marqueur désigne la
 * PROCHAINE occurrence (« cette nuit à 2h du matin » dit à 22h = demain
 * 02:00), jamais un refus past_time. Le marqueur rend le bump non ambigu —
 * l'heure NUE passée reste couverte par la décision V2-A (clarify).
 */
function hasNocturnalOrMeridiemForwardMarker(text: string): boolean {
  const normalized = String(text ?? "").normalize("NFD")
    .replace(/\p{Diacritic}/gu, "").toLowerCase();
  return /\b(cette nuit|la nuit (qui (vient|arrive)|prochaine)|au petit matin|du mat(in)?\b|du soir\b|dans \d+\s?h(eures?)?\b)/
    .test(normalized);
}

/**
 * Discriminant grammatical du déplacement de rappel (P6-V/P8-V), partagé par
 * la coercition create-nu→reschedule et le verrou anti-dégradation.
 * P9-C (alex-hard24 R1-B01): la forme SANS trait d'union (« decale le a
 * jeudi », frappe familière) est admise UNIQUEMENT devant une préposition ou
 * une ancre temporelle — jamais devant un nom (« mets le rappel des pâtes » =
 * article + NP, pas un clitique: la dégradation P4-C reste).
 */
function hasRescheduleCliticAnaphor(text: string): boolean {
  const normalized = String(text ?? "").normalize("NFD")
    .replace(/\p{Diacritic}/gu, "").toLowerCase();
  return (
    /\b(mets|remets|remet|decale|repousse|replanifie|reprogramme|avance)-(le|la)\b/
      .test(normalized) ||
    /\b(mets|remets|remet|decale|repousse|replanifie|reprogramme|avance)\s+(le|la)\s+(a|au|pour|plutot|sur|vers|demain|apres[- ]demain|ce|cette|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/
      .test(normalized)
  );
}

/**
 * P4-D (eva-global19 R1-B03): heure NUE 1-9 sans marqueur matin/soir dans
 * l'expression USER (« à huit heures », « à 8h ») — ambigüe entre 08:00 et
 * 20:00. Retourne l'heure détectée, null si non ambiguë.
 */
function bareAmbiguousHour(
  hint: string,
  opts?: { includeDigits?: boolean },
): number | null {
  const text = String(hint ?? "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (!text.trim()) return null;
  if (/\b(matin|soir|apres[- ]midi|midi|nuit|am|pm)\b/.test(text)) return null;
  // CEINTURE dure: heures en TOUTES LETTRES seulement (« à huit heures »,
  // le verbatim eva T3) — la forme chiffrée « demain à 9h » est massivement
  // employée pour le matin dans les flux légitimes: son ambiguïté relève du
  // JUGEMENT contextuel du dispatcher (règle prompt: UTC_time laissé vide),
  // que le chemin missing_time (includeDigits) transforme en question de
  // créneau. Des minutes explicites (« 9h10 ») spécifient le moment.
  const words: Record<string, number> = {
    une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5,
    six: 6, sept: 7, huit: 8, neuf: 9,
  };
  const word = text.match(
    /(?:\ba|\bvers|\bpour)\s+(une|deux|trois|quatre|cinq|six|sept|huit|neuf)\s+heures?(?!\s+\w)/,
  );
  // P6-H (nina-untested21 R1-B03, décision actée 13/07): « 7 heures »
  // (chiffre + mot ENTIER « heures ») rejoint la forme en toutes lettres —
  // cohérence « 7 heures » ≡ « sept heures ». La forme ABRÉGÉE « 7h » reste
  // au jugement contextuel du dispatcher (arbitrage P4: la bloquer en dur
  // régressait 9 tests + nina T10).
  const digitFullWord = text.match(
    /(?:\ba|\bvers|\bpour)\s+(\d{1,2})\s+heures?(?!\s+\w)/,
  );
  // P7-F (paul-p6reval R1-B05a): « demain 8h » (heure abrégée SANS
  // préposition, ancrée par un jour) laissait le chemin missing_time poser
  // la question générique « il me manque l'heure » au lieu de la question de
  // créneau — l'ancre de jour rejoint les prépositions, includeDigits only
  // (le dispatcher a déjà jugé l'ambiguïté en laissant UTC_time vide).
  const digit = opts?.includeDigits
    ? text.match(
      /(?:\ba|\bvers|\bpour|\bdemain|\bapres[- ]?demain|\baujourd\s?hui)\s+(\d{1,2})\s*h(?:eures?)?(?![\d:h])/,
    )
    : null;
  const hour = word
    ? words[word[1]]
    : digitFullWord
    ? Number(digitFullWord[1])
    : digit
    ? Number(digit[1])
    : null;
  return hour !== null && hour >= 1 && hour <= 9 ? hour : null;
}

/**
 * P12-A (eva-hard25 R1-B02, alex-untested24 R1-B01): les jetons de date du
 * CONTENU du rappel sont INERTES pour l'ancrage temporel — « sortir les
 * poubelles avant le passage de DEMAIN » promouvait J+1 via la couche P3-B
 * alors que le créneau demandé (« ce soir à 21h ») était correct. Le scope
 * temporel = le texte MOINS le segment d'instruction (match insensible aux
 * diacritiques). Introuvable ⇒ texte inchangé (fail-open, comportement
 * historique).
 */
function temporalScopeText(
  text: string,
  instruction: string | null | undefined,
): string {
  const normalize = (value: string) =>
    String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  const normalizedText = normalize(text);
  const normalizedInstruction = normalize(String(instruction ?? "")).trim();
  if (!normalizedInstruction) return normalizedText;
  const index = normalizedText.indexOf(normalizedInstruction);
  if (index < 0) return normalizedText;
  return `${normalizedText.slice(0, index)} ${
    normalizedText.slice(index + normalizedInstruction.length)
  }`.trim();
}

function compileStructuredCreatePayload(args: {
  turnFrame?: TurnFrame | null;
  message: string;
}): {
  scheduledFor: string | null;
  localLabel: string | null;
  instruction: string | null;
  rawText: string;
  // P12-A: « local_parser » quand une couche P3-B a RÉPARÉ le temps — le
  // parse_source de l'outcome dit la vraie source (alex-untested24 R1-B01:
  // « payload_utc_time » mensonger sur une valeur réécrite par le parseur).
  parseSource: "payload_utc_time" | "payload" | "local_parser";
} {
  const whenHint = canonicalWhenHintFromTurnFrame(args.turnFrame);
  const utcTime = canonicalUtcTimeFromTurnFrame(args.turnFrame);
  const scheduledFor = isValidIsoDate(utcTime) ? utcTime : null;
  const instruction = canonicalInstructionHintFromTurnFrame(args.turnFrame) ??
    null;
  const rawText = canonicalRawTextFromTurnFrame(args.turnFrame) ??
    args.message;
  const localLabelHint = canonicalLocalLabelFromTurnFrame(args.turnFrame);
  const localLabel = looksTemporalLabel(localLabelHint)
    ? localLabelHint
    : looksTemporalLabel(whenHint)
    ? whenHint
    : null;
  return {
    scheduledFor,
    localLabel,
    instruction,
    rawText,
    parseSource: isValidIsoDate(utcTime) ? "payload_utc_time" : "payload",
  };
}

/**
 * P8-A (rose-p7verify R1 T13/T14, BF-LEDGER-02): agrégation des résultats
 * per-effet d'une co-demande de N rappels. Le rendu est ASSERVI au ledger —
 * chaque commit est nommé (label + instruction), et un volet NON committé est
 * annoncé manquant explicitement (default-deny symétrique), jamais « c'est
 * pris pour les deux » avec un seul commit. La comptabilité reste totale:
 * chaque effet du frame produit ses requested/committed/blocked, le surplus
 * au-delà de la borne est soldé blocked fan_out_bounded.
 */
export function mergeMultiCreateDirectEffectResults(args: {
  results: OneShotReminderDirectEffectResult[];
  overflow?: number;
}): OneShotReminderDirectEffectResult {
  // P12-A (nina-p10reval R1-B02) — INVARIANT: deux entrées committed ne
  // partagent JAMAIS un id. Quand l'exécuteur a résolu deux siblings sur la
  // MÊME ligne DB (idempotence/upsert sur instant identique), le second
  // n'est PAS un commit: il est rétrogradé en blocked
  // fan_out_duplicate_commit et son volet est annoncé manquant
  // nominativement (le rendu P8-A/P10-B fait le reste) — fin du « c'est
  // pris pour les deux » avec une seule ligne.
  const seenCommittedIds = new Set<string>();
  const results = args.results.map((result) => {
    const kept: typeof result.committed_effects = [];
    const demoted: typeof result.committed_effects = [];
    for (const effect of result.committed_effects) {
      const id = effect.type === "create_one_shot_reminder"
        ? String((effect as { id?: unknown }).id ?? "").trim()
        : "";
      if (id && seenCommittedIds.has(id)) {
        demoted.push(effect);
        continue;
      }
      if (id) seenCommittedIds.add(id);
      kept.push(effect);
    }
    if (demoted.length === 0) return result;
    const demotedLabel = String(
      (demoted[0] as { local_label?: unknown }).local_label ?? "",
    ).trim();
    return {
      ...result,
      committed_effects: kept,
      blocked_effects: [
        ...result.blocked_effects,
        ...demoted.map((effect) => ({
          type: effect.type,
          reason_code: "fan_out_duplicate_commit",
        })),
      ],
      status: kept.length > 0 ? result.status : "blocked" as const,
      reply: kept.length > 0 ? result.reply : `celui${
        demotedLabel ? ` de ${demotedLabel}` : "-là"
      } n'a PAS été posé séparément (il retombait sur le même rappel que l'autre volet). Redonne-moi son jour et son heure exacts si tu veux bien les deux.`,
    };
  });
  const overflow = Math.max(0, args.overflow ?? 0);
  const committed = results.flatMap((result) => result.committed_effects);
  const requested = [
    ...results.flatMap((result) => result.requested_effects),
    ...Array.from({ length: overflow }, () => ({
      type: "create_one_shot_reminder" as const,
      reason_code: "create",
    })),
  ];
  const blocked = [
    ...results.flatMap((result) => result.blocked_effects),
    ...Array.from({ length: overflow }, () => ({
      type: "create_one_shot_reminder" as const,
      reason_code: "fan_out_bounded",
    })),
  ];
  const allowed = results.flatMap((result) => result.allowed_effects);
  const attempted = [
    ...new Set(results.flatMap((result) => result.attempted_effects)),
  ];
  const executedTools = [
    ...new Set(results.flatMap((result) => result.executed_tools)),
  ];
  const constraints = [
    ...new Set(results.flatMap((result) => result.constraints)),
  ];
  const missingSlots = [
    ...new Set(results.flatMap((result) => result.missing_slots)),
  ];
  const pendingClarification = results
    .map((result) => result.pending_clarification)
    .find(Boolean) ?? null;
  const clarifyCount = results.filter(
    (result) => result.status === "needs_clarify",
  ).length;
  const status: OneShotReminderDirectEffectResult["status"] =
    committed.length > 0
      ? "success"
      : clarifyCount > 0
      ? "needs_clarify"
      : results.some((result) => result.status === "blocked")
      ? "blocked"
      : results.some((result) => result.status === "failed")
      ? "failed"
      : results[0]?.status ?? "ignored";
  const committedLines = committed
    .filter((effect) => effect.type === "create_one_shot_reminder")
    .map((effect) => {
      const instruction = String(effect.reminder_instruction ?? "").trim();
      const label = String(
        effect.local_label ?? effect.scheduled_for ?? "",
      ).trim();
      return instruction ? `${label} — « ${instruction} »` : label;
    })
    .filter(Boolean);
  // P10-B (nina-hard24 R1-B02, rose-p8reval T4): la reply d'un volet non
  // committé est NOMINATIVE — elle cite l'objet/créneau de SON item (« pour
  // celui de 2h du mat' : ... ») au lieu d'un « je ne peux pas te le
  // confirmer ici » vague sans récupération. Les slots viennent du
  // pending_clarification du sibling (source structurée, jamais le texte).
  const nonCommitReplies = results
    .filter((result) =>
      result.committed_effects.filter((effect) =>
        effect.type === "create_one_shot_reminder"
      ).length === 0 && result.reply
    )
    .map((result) => {
      const reply = String(result.reply);
      const slots = result.pending_clarification?.known_slots as
        | Record<string, unknown>
        | null
        | undefined;
      const itemName = String(
        slots?.instruction_hint ?? slots?.when_hint ?? "",
      ).trim();
      return itemName && !reply.toLowerCase().includes(itemName.toLowerCase())
        ? `Pour celui de « ${itemName} » : ${reply}`
        : reply;
    });
  const replyParts: string[] = [];
  if (committedLines.length > 1) {
    replyParts.push(
      `C'est fait, tes ${committedLines.length} rappels sont posés : ${
        committedLines.join(" ; ")
      }.`,
    );
  } else if (committedLines.length === 1) {
    replyParts.push(`C'est fait pour ${committedLines[0]}.`);
  }
  if (nonCommitReplies.length > 0) {
    replyParts.push(
      committedLines.length > 0
        ? `Par contre, l'autre rappel n'est PAS posé pour l'instant — ${
          nonCommitReplies[0]
        }`
        : clarifyCount > 1
        ? `Pour tes ${results.length} rappels, il me manque encore le créneau exact de chacun — donne-les-moi et je les pose d'un coup. ${
          nonCommitReplies[0]
        }`
        : nonCommitReplies[0],
    );
  }
  const firstCommittedResult = results.find((result) =>
    result.committed_effects.some((effect) =>
      effect.type === "create_one_shot_reminder"
    )
  );
  return {
    detected: true,
    intent: "create",
    status,
    reply: replyParts.join(" ") || null,
    requested_effects: requested,
    allowed_effects: allowed,
    attempted_effects: attempted,
    executed_tools: executedTools,
    committed_effects: committed,
    blocked_effects: blocked,
    constraints,
    scheduled_for: firstCommittedResult?.scheduled_for ?? null,
    local_label: firstCommittedResult?.local_label ?? null,
    reminder_instruction: firstCommittedResult?.reminder_instruction ?? null,
    target_reminder_ids: results.flatMap((result) =>
      result.target_reminder_ids
    ),
    missing_slots: missingSlots,
    pending_clarification: pendingClarification,
    debug: { reason_code: "multi_create" },
  };
}

/**
 * One-shot reminder route runtime.
 * Execute only explicit one-shot reminder direct effects; status/product-help
 * blockers live in route_guards.ts.
 * P12-D2d: le résultat visible passe par la purge des placeholders de
 * template avant de sortir de la lane (invariant: aucun « [heure] » rendu).
 */
export async function maybeRunOneShotReminderDirectEffect(
  args: Parameters<typeof runOneShotReminderDirectEffectInner>[0],
): Promise<OneShotReminderDirectEffectResult> {
  return sanitizeOneShotReminderVisibleResult(
    await runOneShotReminderDirectEffectInner(args),
  );
}

async function runOneShotReminderDirectEffectInner(args: {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  sourceMessageId?: string | null;
  requestId?: string;
  now?: Date;
  userTimezone?: string | null;
  locale?: string | null;
  turnFrame?: TurnFrame | null;
  noMutationRequested?: boolean;
  contextMessages?: string[];
  /** P5-D: temp_memory du tour — lu pour le carry-over des slots d'un
   * clarify CREATE en attente (jamais muté ici). */
  tempMemory?: unknown;
  createReminder?: typeof maybeCreateOneShotReminder;
  cancelReminder?: typeof maybeCancelOneShotReminder;
}): Promise<OneShotReminderDirectEffectResult> {
  // P8-A (rose-p7verify R1 T13/T14, BF-LEDGER-02): CO-DEMANDE DE N RAPPELS —
  // quand le frame porte N effets create NOMINAUX distincts (contrat planner
  // + sanitizer par signature de payload), la lane s'exécute une fois PAR
  // effet (frame réduit: cet effet en tête, message = SA clause exacte) et le
  // résultat agrégé porte N requested / N committed distincts — la parité
  // P7-B redevient vérifiable par créneau. Sans ça, le premier effet
  // absorbait la co-demande: 1 committé, l'accusé énumérait les 2 créneaux
  // depuis le texte user et le récap confabulait le manquant. Nominal create
  // UNIQUEMENT (jamais cancel/replace/status/reschedule — ces intents restent
  // mono-effet), borné à 3 (doctrine P4). Les gates anti-doublon de
  // l'executor exemptent déjà les écritures du même source_message_id: des
  // creates frères du même tour ne se bloquent pas entre eux.
  {
    const nominalCreateEffects = (args.turnFrame?.direct_effects ?? []).filter(
      (effect) =>
        effect.effect_type === "create_one_shot_reminder" &&
        String(payloadText(effect, "intent") ?? "create") === "create" &&
        String(payloadText(effect, "cardinality") ?? "once") !== "recurring",
    );
    if (nominalCreateEffects.length >= 2) {
      const otherEffects = (args.turnFrame?.direct_effects ?? []).filter(
        (effect) => effect.effect_type !== "create_one_shot_reminder",
      );
      // P12-V (probe P12-1 passe 1): sur « jeudi et vendredi à 18h »,
      // l'émission distribue parfois les JOURS sans l'heure commune
      // (when_hint « jeudi » nu, UTC_time vide) → chaque volet dégénérait en
      // clarify missing_time alors que le message porte UNE SEULE heure.
      // Distribution déterministe bornée : exactement une heure distincte
      // dans le message ET le volet sans heure ni UTC_time. Deux heures
      // distinctes dans le message ⇒ jamais de devinette (chaque volet garde
      // la sienne ou clarifie).
      const soleMessageHour = (() => {
        // Condition de désarmement (test P8-A « samedi, heure à voir »): si
        // UN sibling porte déjà une heure dans son when_hint, l'heure unique
        // du message lui APPARTIENT — la greffer aux autres serait une
        // devinette (l'utilisateur a explicitement laissé l'autre créneau
        // ouvert). Distribution seulement quand l'heure est orpheline de
        // TOUS les volets.
        const anySiblingCarriesHour = nominalCreateEffects.some((effect) =>
          /\d/.test(String(payloadText(effect, "when_hint") ?? ""))
        );
        if (anySiblingCarriesHour) return null;
        const normalizedMessage = args.message.normalize("NFD")
          .replace(/\p{Diacritic}/gu, "").toLowerCase();
        const hours = [
          ...new Set(
            [...normalizedMessage.matchAll(/\b(\d{1,2})\s?h\s?(\d{2})?\b/g)]
              .map((m) => `${m[1]}h${m[2] ?? ""}`),
          ),
        ];
        return hours.length === 1 ? hours[0] : null;
      })();
      let boundedTimezone = "Europe/Paris";
      let boundedNowIso = (args.now && Number.isFinite(args.now.getTime())
        ? args.now
        : new Date()).toISOString();
      if (soleMessageHour) {
        try {
          const tctxDistribute = await getUserTimeContext({
            supabase: args.supabase,
            userId: args.userId,
            now: args.now && Number.isFinite(args.now.getTime())
              ? args.now
              : new Date(),
          });
          boundedTimezone = tctxDistribute.user_timezone || "Europe/Paris";
          boundedNowIso = tctxDistribute.now_utc;
        } catch (_error) {
          // best-effort: la distribution parse en tz par défaut.
        }
      }
      const bounded = nominalCreateEffects.slice(0, 3).map((effect) => {
        if (!soleMessageHour) return effect;
        const hint = String(payloadText(effect, "when_hint") ?? "");
        const utc = String(payloadText(effect, "UTC_time") ?? "");
        if (!hint.trim() || /\d/.test(hint) || isValidIsoDate(utc)) {
          return effect;
        }
        const distributedWhen = `${hint} à ${soleMessageHour}`;
        // L'UTC se résout ICI (le message du sibling ne porte pas d'acte de
        // rappel: la complétion bornée du create nu ne s'armerait pas).
        const distributedScheduledFor = parseScheduledForFromMessage({
          message: distributedWhen,
          timezone: boundedTimezone,
          nowIso: boundedNowIso,
        });
        if (!distributedScheduledFor) return effect;
        return {
          ...effect,
          payload_hint: {
            ...((effect.payload_hint ?? {}) as Record<string, unknown>),
            when_hint: distributedWhen,
            UTC_time: distributedScheduledFor,
            local_label: formatOneShotLocalLabel(
              distributedScheduledFor,
              boundedTimezone,
            ),
            raw_text: `${
              String(payloadText(effect, "raw_text") ?? "")
            } à ${soleMessageHour}`.trim(),
          },
        };
      });
      const siblingResults: OneShotReminderDirectEffectResult[] = [];
      for (const effect of bounded) {
        siblingResults.push(
          await maybeRunOneShotReminderDirectEffect({
            ...args,
            message: payloadText(effect, "raw_text") ?? args.message,
            turnFrame: {
              ...(args.turnFrame as TurnFrame),
              direct_effects: [effect, ...otherEffects],
            },
          }),
        );
      }
      return mergeMultiCreateDirectEffectResults({
        results: siblingResults,
        overflow: nominalCreateEffects.length - bounded.length,
      });
    }
    // P12-B (nina-p10reval R1-B01): des jours calendaires NOMMÉS dénombrables
    // SANS marqueur d'habitude (« jeudi et vendredi à 18h ») ne sont PAS un
    // récurrent — c'est un fan-out once×N. Quand le dispatcher les classe
    // cardinality=recurring, la ceinture requalifie en N effets once (un par
    // jour, UTC résolu PAR item par le parseur) et délègue au chemin P8-A.
    // Conditions de désarmement: marqueur d'habitude (« tous les », « chaque »,
    // quotidien/hebdo) ⇒ blocage recurring honnête inchangé ; heure ambiguë
    // (1-9 nue) ou instruction absente ⇒ pas de requalification (jamais une
    // devinette committée). Les jours se lisent dans le SCOPE temporel
    // (l'instruction est inerte, P12-A).
    if (nominalCreateEffects.length === 0) {
      const recurringCreateEffects = (args.turnFrame?.direct_effects ?? [])
        .filter((effect) =>
          effect.effect_type === "create_one_shot_reminder" &&
          String(payloadText(effect, "intent") ?? "create") === "create" &&
          String(payloadText(effect, "cardinality") ?? "once") === "recurring"
        );
      const recurringEffect = recurringCreateEffects.length === 1
        ? recurringCreateEffects[0]
        : null;
      const recurringInstruction = recurringEffect
        ? String(payloadText(recurringEffect, "instruction_hint") ?? "").trim()
        : "";
      if (recurringEffect && recurringInstruction) {
        const combinedText = [
          payloadText(recurringEffect, "when_hint") ?? "",
          payloadText(recurringEffect, "raw_text") ?? "",
          args.message,
        ].filter(Boolean).join(" ");
        const scopedText = temporalScopeText(
          combinedText,
          recurringInstruction,
        );
        const hasHabitMarker =
          /\b(tous|toutes|chaque|quotidien(ne)?s?|hebdomadaires?|par jour|par semaine|a chaque fois)\b/
            .test(scopedText);
        const namedDayTokens = [
          ...new Set(
            [...scopedText.matchAll(
              /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|apres[- ]demain|demain)\b/g,
            )].map((match) => match[1]),
          ),
        ];
        const hourMatch = scopedText.match(/\b(\d{1,2})\s*h\s*(\d{2})?\b/);
        const hour = hourMatch ? Number(hourMatch[1]) : null;
        const hourUnambiguous = hour !== null &&
          (hour >= 10 || Boolean(hourMatch?.[2]) ||
            /\b(matin|midi|soir)\b/.test(scopedText));
        if (
          !hasHabitMarker && namedDayTokens.length >= 2 &&
          namedDayTokens.length <= 3 && hourUnambiguous
        ) {
          const hourLabel = `${hour}h${hourMatch?.[2] ?? ""}`;
          const nowForFanOut = args.now &&
              Number.isFinite(args.now.getTime())
            ? args.now
            : new Date();
          try {
            const tctxFanOut = await getUserTimeContext({
              supabase: args.supabase,
              userId: args.userId,
              now: nowForFanOut,
            });
            const timezoneFanOut = tctxFanOut.user_timezone || "Europe/Paris";
            const siblingEffects = namedDayTokens.map((dayToken) => {
              const whenClause = `${dayToken} à ${hourLabel}`;
              const scheduledFor = parseScheduledForFromMessage({
                message: whenClause,
                timezone: timezoneFanOut,
                nowIso: tctxFanOut.now_utc,
              });
              return scheduledFor
                ? {
                  ...recurringEffect,
                  payload_hint: {
                    ...((recurringEffect.payload_hint ?? {}) as Record<
                      string,
                      unknown
                    >),
                    intent: "create",
                    cardinality: "once",
                    when_hint: whenClause,
                    raw_text: `${recurringInstruction} ${whenClause}`,
                    UTC_time: scheduledFor,
                    local_label: formatOneShotLocalLabel(
                      scheduledFor,
                      timezoneFanOut,
                    ),
                    instruction_hint: recurringInstruction,
                  },
                }
                : null;
            });
            if (siblingEffects.every(Boolean)) {
              const otherEffects = (args.turnFrame?.direct_effects ?? [])
                .filter((effect) =>
                  effect.effect_type !== "create_one_shot_reminder"
                );
              const siblingResults: OneShotReminderDirectEffectResult[] = [];
              for (const effect of siblingEffects) {
                siblingResults.push(
                  await maybeRunOneShotReminderDirectEffect({
                    ...args,
                    message: payloadText(effect!, "raw_text") ?? args.message,
                    turnFrame: {
                      ...(args.turnFrame as TurnFrame),
                      direct_effects: [effect!, ...otherEffects],
                    },
                  }),
                );
              }
              return mergeMultiCreateDirectEffectResults({
                results: siblingResults,
              });
            }
          } catch (_error) {
            // best-effort: le blocage recurring honnête reste le filet.
          }
        }
      }
    }
  }
  let createEffect = createEffectFromTurnFrame(args.turnFrame);
  const now = args.now && Number.isFinite(args.now.getTime())
    ? args.now
    : new Date();
  let compiledPayload = compileStructuredCreatePayload({
    turnFrame: args.turnFrame,
    message: args.message,
  });
  // P12-V (harness S2 T5): sur un tour de PURE CONFIRMATION (« Oui c'est
  // bien ça, vas-y ») après une opération déjà exécutée, le dispatcher
  // ré-émet parfois l'effet du tour précédent (raw_text agrégé) — le replace
  // se RE-jouait avec une ancre recalculée (23h aujourd'hui déplacé à demain
  // 23h, en silence). Règle 45 rendue structurelle: l'effet se rapporte au
  // MESSAGE COURANT — une affirmation nue (zéro chiffre, zéro jeton de
  // jour, zéro acte de rappel) ne porte aucune demande NOUVELLE. Conditions
  // de désarmement: un clarify one-shot ARMÉ (le « vas-y » est la réponse —
  // fusion D1) ou un différé safety en attente (re-serve P8-E) consomment
  // légitimement l'affirmation.
  {
    const normalizedAffirmation = String(args.message ?? "")
      .normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .replace(/[’']/g, " ").toLowerCase()
      .replace(/[.,!?;:\-]/g, " ").replace(/\s+/g, " ").trim();
    const affirmationLexicon = new Set([
      "oui", "ouais", "yes", "ok", "okay", "d", "accord", "ca", "marche",
      "parfait", "nickel", "super", "top", "c", "est", "bien", "exactement",
      "vas", "y", "vasy", "go", "fais", "le", "confirme", "je", "allez",
      "merci", "stp", "s", "il", "te", "plait", "carrement", "voila", "genial",
    ]);
    const affirmationTokens = normalizedAffirmation.split(" ").filter(Boolean);
    const isBareAffirmation = affirmationTokens.length > 0 &&
      affirmationTokens.length <= 8 &&
      !/\d/.test(normalizedAffirmation) &&
      affirmationTokens.every((token) => affirmationLexicon.has(token));
    const clarifyArmed = Boolean(
      pendingCreateClarificationKnownSlots(args.tempMemory) ||
        pendingOneShotReminderClarificationState(args.tempMemory),
    );
    const deferredArmed = ((args.tempMemory as
      | Record<string, unknown>
      | null
      | undefined)?.[SAFETY_DEFERRED_REMINDER_RUNTIME_KEY] as
        | Record<string, unknown>
        | undefined)?.mode === "deferred";
    if (
      createEffect && isBareAffirmation && !clarifyArmed && !deferredArmed
    ) {
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "create",
          status: "blocked",
          reason_code: "confirmation_reemission_noop",
          reply:
            "Rien de nouveau à changer — c'est déjà en place comme convenu.",
        }),
        requested_effects: [{
          type: "create_one_shot_reminder",
          reason_code: "create",
        }],
        blocked_effects: [{
          type: "create_one_shot_reminder",
          reason_code: "confirmation_reemission_noop",
        }],
      };
    }
  }
  // P12-D (état partagé des fixes D1-D8): clarify one-shot en attente (tous
  // intents), marqueur additif du tour, et flag allow-duplicate transmis à
  // l'exécuteur (D2c/D3/D4).
  const pendingClarifyState = pendingOneShotReminderClarificationState(
    args.tempMemory,
  );
  const additiveMarker = hasAdditiveReminderMarker(
    `${args.message} ${canonicalRawTextFromTurnFrame(args.turnFrame) ?? ""}`,
  );
  let allowDuplicateForTurn = additiveMarker;
  // P12-D2a (alex-untested24 R1-B03c): rétractation sous clarify actif ⇒
  // pending PURGÉ (le résultat ne porte AUCUN pending_clarification: le
  // pipeline P2-3d supprime la clé), zéro question résiduelle, zéro write.
  if (pendingClarifyState && isBareClarifyRetraction(args.message)) {
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: pendingClarifyState.intent === "replace"
          ? "replace"
          : "create",
        status: "blocked",
        reason_code: "clarify_dismissed",
        reply: pendingClarifyState.intent === "replace"
          ? "Ok, on laisse tomber — je n'ai rien changé, tes rappels existants restent tels quels."
          : "Ok, on laisse tomber — je n'ai rien créé.",
      }),
      requested_effects: [{
        type: "create_one_shot_reminder",
        reason_code: pendingClarifyState.intent === "replace"
          ? "replace"
          : "create",
      }],
      blocked_effects: [{
        type: "create_one_shot_reminder",
        reason_code: "clarify_dismissed",
      }],
    };
  }
  // P12-D2b (alex-untested24 R1-B04, régression P4-B): une NOUVELLE demande
  // composite explicite (« annule X et remets-le à Yh ») sous clarify actif
  // DÉSARME le pending et se lit À NEUF — le chemin P4-B cancel→replace
  // s'applique comme hors-clarify. Condition de désarmement de la fusion D1:
  // c'est elle (une réponse partielle sans verbes composites reste fusionnée).
  const pendingDisarmedByComposite = Boolean(pendingClarifyState) &&
    /\b(annule|supprime|enleve|retire|vire)\b[^.!?]{0,80}\b(remets|remet|recree|reprogramme|replanifie|repose|mets)\b/
      .test(
        String(args.message ?? "").normalize("NFD")
          .replace(/\p{Diacritic}/gu, "").toLowerCase(),
      );
  // P6-V (probe P6-4 passe 2): sur le tour d'EXPOSITION du rappel différé de
  // crise, le dispatcher émet parfois un create alors que le user n'a RIEN
  // demandé (« on peut passer à autre chose, merci ») — l'offre devenait un
  // commit non sollicité, puis un DOUBLON quand le user re-demandait
  // vraiment. Sans mention de rappel ni acceptation dans le message, l'effet
  // se dégrade en OFFRE honnête (zéro write).
  {
    const deferredRuntime = (args.tempMemory as
      | Record<string, unknown>
      | null
      | undefined)?.[SAFETY_DEFERRED_REMINDER_RUNTIME_KEY] as
        | Record<string, unknown>
        | undefined;
    const nominalCreateIntent =
      String(payloadText(createEffect, "intent") ?? "create") === "create";
    if (
      deferredRuntime?.mode === "deferred" && createEffect &&
      nominalCreateIntent
    ) {
      const normalizedForDeferred = args.message.normalize("NFD")
        .replace(/\p{Diacritic}/gu, "").toLowerCase();
      const asksOrAccepts =
        /\b(rappel|rappelle|remets|reposes?|pose|note[- ]moi|programme|oui|ok|vas ?y|volontiers|carrement|d accord|c est bon)\b/
          .test(normalizedForDeferred);
      if (!asksOrAccepts) {
        return {
          ...baseDirectEffectResult({
            detected: true,
            intent: "create",
            status: "blocked",
            reason_code: "safety_deferred_offer_only",
            reply:
              "Au fait, j'ai toujours ton rappel de côté — tu veux que je le pose maintenant ?",
          }),
          requested_effects: [{
            type: "create_one_shot_reminder",
            reason_code: "create",
          }],
          blocked_effects: [{
            type: "create_one_shot_reminder",
            reason_code: "safety_deferred_offer_only",
          }],
        };
      }
      // P8-E (probe P8-5 passe 2): le tour de RE-SERVE arrive souvent avec
      // une émission INCOMPLÈTE (« vas-y remets-le » — le dispatcher ré-émet
      // sans les champs temporels) → le create dégénérait en clarify
      // missing_time et la promesse restait orpheline. Les slots du DIFFÉRÉ
      // sont la source de vérité de sa promesse: ils complètent le payload
      // MANQUANT (jamais ils n'écrasent une valeur fournie ce tour). Le
      // commit solde le différé (P4-C).
      const deferredSlots = (deferredRuntime.known_slots ?? {}) as Record<
        string,
        unknown
      >;
      const deferredUtc = String(deferredSlots.UTC_time ?? "").trim();
      const deferredRaw = String(deferredSlots.raw_text ?? "").trim();
      // Le chemin run.ts de crise (backstop déterministe) ne stocke que
      // raw_text/when_hint — l'instruction et l'heure de la promesse se
      // ré-extraient DÉTERMINISTIQUEMENT du raw_text d'origine (probe P8-5
      // passe 9: « il me manque le contenu » en boucle sur le re-serve).
      let deferredInstruction = String(deferredSlots.instruction_hint ?? "")
        .trim();
      if (!deferredInstruction && deferredRaw) {
        const extracted = extractReminderInstruction(deferredRaw);
        if (
          extracted && !isDegenerateReminderInstruction(extracted) &&
          !isReminderInstructionInvarianceAnaphora(extracted)
        ) {
          deferredInstruction = extracted;
        }
      }
      let deferredScheduledFor = isValidIsoDate(deferredUtc)
        ? deferredUtc
        : null;
      let deferredLabel = String(deferredSlots.local_label ?? "").trim() ||
        null;
      try {
        const tctxDeferred = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        if (!deferredScheduledFor) {
          // Le backstop stocke le MESSAGE ENTIER du tour de crise comme
          // raw_text — il porte souvent DEUX expressions temporelles
          // (« ce soir ça va pas... demain à 9h ») et le parseur gagne la
          // mauvaise (leçon P3-B, re-observée probe P8-5 passe 10). Le
          // when_hint ISOLÉ prime; le segment de raw_text après le verbe de
          // rappel sert de repli.
          const deferredWhen = String(deferredSlots.when_hint ?? "").trim();
          const rawReminderIdx = deferredRaw
            .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
            .search(/\b(remets|rappelle|rappel|previens|pose|mets)\b/);
          const rawSegment = rawReminderIdx >= 0
            ? deferredRaw.slice(rawReminderIdx)
            : deferredRaw;
          for (const candidate of [deferredWhen, rawSegment]) {
            if (!candidate) continue;
            const parsedDeferred = parseOneShotReminderRequest({
              message: candidate,
              timezone: tctxDeferred.user_timezone || "Europe/Paris",
              nowIso: tctxDeferred.now_utc,
            });
            if (parsedDeferred?.scheduledFor) {
              deferredScheduledFor = parsedDeferred.scheduledFor;
              break;
            }
          }
        }
        // Le backstop de crise ne stocke pas de local_label — il se
        // recalcule depuis la valeur résolue (jamais un slot bloquant).
        if (!deferredLabel && deferredScheduledFor) {
          deferredLabel = formatOneShotLocalLabel(
            deferredScheduledFor,
            tctxDeferred.user_timezone || "Europe/Paris",
          );
        }
      } catch (_error) {
        // best-effort: le clarify existant reste le filet.
      }
      compiledPayload = {
        ...compiledPayload,
        scheduledFor: compiledPayload.scheduledFor ?? deferredScheduledFor,
        localLabel: compiledPayload.localLabel ?? deferredLabel,
        instruction: compiledPayload.instruction ??
          (deferredInstruction || null),
      };
    }
  }
  // P5-D (eva-p4verify R1-B02): tour-réponse à un clarify de CRÉNEAU — les
  // slots déjà fournis au tour initial SURVIVENT. L'instruction du pending
  // prime tant que le message courant ne porte pas sa propre clause
  // d'instruction (« le soir. pas le matin » n'est pas un texte de rappel).
  const pendingCreateSlots = pendingCreateClarificationKnownSlots(
    args.tempMemory,
  );
  // P7-C (paul-p6reval R1-B01): résolution du clarify de MÉRIDIEM — quand
  // elle réussit, elle est CANONIQUE pour ce tour (le dispatcher ré-émet le
  // texte d'origine, son when_hint « demain à 7 heures » re-résoudrait 07:00
  // via la couche P3-B et écraserait la fusion → gate plus bas).
  let meridiemFusionApplied = false;
  if (pendingCreateSlots && !pendingDisarmedByComposite) {
    const storedInstruction = String(
      pendingCreateSlots.instruction_hint ?? "",
    ).trim();
    if (
      storedInstruction &&
      (!compiledPayload.instruction ||
        !extractReminderInstruction(args.message))
    ) {
      compiledPayload = { ...compiledPayload, instruction: storedInstruction };
    }
    // P7-C: le clarify méridiem persistait déjà ses slots (P6-H) mais le
    // tour-réponse (« du soir, 19h ») ne fusionnait jamais le créneau avec
    // l'heure-base — le rappel n'était PLUS CRÉABLE (cul-de-sac, 2 réponses
    // explicites → re-clarify). Fusion déterministe, fail-closed (réponse
    // qui ne lève pas l'ambiguïté → clarify inchangé).
    if (
      pendingCreateClarificationReason(args.tempMemory) ===
        "hour_meridiem_ambiguous"
    ) {
      try {
        const tctxMeridiem = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        const fused = resolveMeridiemClarifyAnswer({
          answerMessage: args.message,
          baseWhenHint: [
            pendingCreateSlots.when_hint,
            pendingCreateSlots.raw_text,
          ].filter(Boolean).join(" "),
          timezone: tctxMeridiem.user_timezone,
          nowIso: tctxMeridiem.now_utc,
        });
        if (fused) {
          compiledPayload = {
            ...compiledPayload,
            scheduledFor: fused.scheduledFor,
            localLabel: formatOneShotLocalLabel(
              fused.scheduledFor,
              tctxMeridiem.user_timezone,
            ),
          };
          meridiemFusionApplied = true;
        }
      } catch (_error) {
        // best-effort: le clarify méridiem existant reste le filet.
      }
    }
    // P10-A (nina-hard24 R1-B01, T5): fusion du tour-réponse à un clarify
    // PAST_TIME — l'indice de jour forward de la réponse (« la nuit qui
    // vient », « demain ») se combine avec l'heure déjà stockée, au lieu de
    // retomber sur missing_time (cul-de-sac auto-contradictoire). Ne prime
    // que si le tour n'apporte pas déjà un créneau FUTUR propre.
    if (
      pendingCreateClarificationReason(args.tempMemory) === "past_time" &&
      (!compiledPayload.scheduledFor ||
        new Date(compiledPayload.scheduledFor).getTime() <=
          now.getTime() + 30_000)
    ) {
      try {
        const tctxPast = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        const fusedPast = resolvePastTimeClarifyAnswer({
          answerMessage: args.message,
          baseWhenHint: [
            pendingCreateSlots.when_hint,
            pendingCreateSlots.raw_text,
          ].filter(Boolean).join(" "),
          timezone: tctxPast.user_timezone,
          nowIso: tctxPast.now_utc,
        });
        if (fusedPast) {
          compiledPayload = {
            ...compiledPayload,
            scheduledFor: fusedPast.scheduledFor,
            localLabel: formatOneShotLocalLabel(
              fusedPast.scheduledFor,
              tctxPast.user_timezone,
            ),
          };
          // Fusion canonique du tour: la couche P3-B ne doit pas la
          // ré-écraser depuis le when_hint ré-émis (même gate que P7-C).
          meridiemFusionApplied = true;
        }
      } catch (_error) {
        // best-effort: le clarify past_time existant reste le filet.
      }
    }
    // P12-D1 (alex-untested24 R1-B03): fusion GÉNÉRALISÉE du tour-réponse —
    // avant ce fix, seuls hour_meridiem_ambiguous (P7-C) et past_time (P10-A)
    // fusionnaient; tous les autres reason_codes re-classaient la réponse
    // comme énoncé neuf (T8 re-clarify, T9 blocked missing_time avec
    // when_hint="à 20h30" AU FRAME). Règle: slots du pending + slots du tour
    // (le tour PRIME), exécution TENTÉE avant tout re-clarify. Le parseur ne
    // consomme que le when_hint ISOLÉ du tour (« à 20h30… plus à 19h » ⇒
    // 20:30), jamais le raw_text multi-jetons.
    // Conditions de désarmement (doctrine P9): hour_meridiem_ambiguous garde
    // sa résolution dédiée fail-closed (compléter ici committerait l'heure
    // ambiguë) ; une heure encore ambiguë dans la réponse (1-9 nue) reste au
    // clarify ; rétractation (D2a) et composite explicite (D2b) sont déjà
    // sortis de ce chemin.
    const generalizedFusionReason = pendingCreateClarificationReason(
      args.tempMemory,
    );
    if (
      !compiledPayload.scheduledFor &&
      generalizedFusionReason !== "hour_meridiem_ambiguous"
    ) {
      try {
        const tctxGeneral = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        const timezoneGeneral = tctxGeneral.user_timezone || "Europe/Paris";
        const turnWhenHint = String(
          canonicalWhenHintFromTurnFrame(args.turnFrame) ?? "",
        ).trim();
        if (
          turnWhenHint &&
          bareAmbiguousHour(turnWhenHint, { includeDigits: true }) === null
        ) {
          const parsedTurn = parseOneShotReminderRequest({
            message: turnWhenHint,
            timezone: timezoneGeneral,
            nowIso: tctxGeneral.now_utc,
          })?.scheduledFor ??
            parseScheduledForFromMessage({
              message: turnWhenHint,
              timezone: timezoneGeneral,
              nowIso: tctxGeneral.now_utc,
            });
          if (
            parsedTurn &&
            new Date(parsedTurn).getTime() > now.getTime() + 30_000
          ) {
            compiledPayload = {
              ...compiledPayload,
              scheduledFor: parsedTurn,
              localLabel: formatOneShotLocalLabel(
                parsedTurn,
                timezoneGeneral,
              ),
            };
          }
        }
        // Repli: l'heure déjà RÉSOLUE au tour initial (UTC_time des slots) —
        // jamais un slot past_time (le gate past_time de l'exécuteur reste).
        if (!compiledPayload.scheduledFor) {
          const storedUtc = String(pendingCreateSlots.UTC_time ?? "").trim();
          if (
            isValidIsoDate(storedUtc) &&
            new Date(storedUtc).getTime() > now.getTime() + 30_000
          ) {
            compiledPayload = {
              ...compiledPayload,
              scheduledFor: storedUtc,
              localLabel: String(pendingCreateSlots.local_label ?? "")
                .trim() ||
                formatOneShotLocalLabel(storedUtc, timezoneGeneral),
            };
          }
        }
      } catch (_error) {
        // best-effort: le clarify existant reste le filet.
      }
    }
    // P12-D2c (nina-p10reval R1-B04): la réponse-option au gate
    // same_instruction_pending est CONSOMMÉE — l'option AJOUTER devient un
    // create assumé du doublon (allow_duplicate), l'option DÉPLACER se lit
    // comme un replace de la cible au même contenu (l'unique pending qui
    // porte cette instruction). Condition de désarmement: une réponse qui ne
    // choisit aucune option ⇒ re-clarify inchangé (fail-closed).
    if (generalizedFusionReason === "same_instruction_pending") {
      const answerNormalized = String(args.message ?? "").normalize("NFD")
        .replace(/\p{Diacritic}/gu, "").replace(/[’']/g, " ").toLowerCase();
      const addAnswer =
        /\b(ajoute|ajouter|rajoute|rajouter|deuxieme|second|les deux|en plus|garde les deux)\b/
          .test(answerNormalized);
      const moveAnswer = !addAnswer &&
        /\b(deplace|deplacer|remets|remet|decale|repousse|change)\b/
          .test(answerNormalized);
      if (addAnswer) {
        allowDuplicateForTurn = true;
      } else if (moveAnswer) {
        try {
          const storedInstruction = String(
            pendingCreateSlots.instruction_hint ?? "",
          ).trim();
          const pendingsForMove = await readPendingOneShotReminderRows({
            supabase: args.supabase,
            userId: args.userId,
          });
          const tctxMove = await getUserTimeContext({
            supabase: args.supabase,
            userId: args.userId,
            now,
          });
          const sameContentRows = storedInstruction
            ? pendingsForMove.filter((row) =>
              instructionTokensOverlap(
                storedInstruction,
                String(
                  (row?.message_payload as
                    | Record<string, unknown>
                    | undefined)?.reminder_instruction ?? "",
                ),
              )
            )
            : [];
          if (sameContentRows.length === 1) {
            const targetHHMMMove = localHHMMForScheduledFor(
              String(sameContentRows[0]?.scheduled_for ?? ""),
              tctxMove.user_timezone || "Europe/Paris",
            );
            if (targetHHMMMove) {
              createEffect = {
                ...createEffect!,
                payload_hint: {
                  ...((createEffect!.payload_hint ?? {}) as Record<
                    string,
                    unknown
                  >),
                  intent: "replace",
                  replace_target_label: targetHHMMMove,
                },
              };
            }
          }
        } catch (_error) {
          // best-effort: le clarify same_instruction re-posé reste le filet.
        }
      }
    }
  }
  const hasExplicitCreateDirectEffect =
    createEffect?.explicitness === "explicit" &&
    createEffect.confidence_band !== "low";
  // P12-D1/D5 (alex-untested24 R1-B02/B03): tour-réponse à un clarify
  // REPLACE (cible ambiguë / payload incomplet) — la réponse FUSIONNE avec
  // les slots du pending (le tour prime) et l'exécution est tentée: l'intent
  // est coercé en replace, la cible se résout par la réponse (contenu nommé
  // d'abord, puis heure qui matche un pending existant ≠ nouvelle heure).
  // Conditions de désarmement (doctrine P9): composite explicite (D2b) et
  // rétractation (D2a) sont déjà sortis ; un message qui porte sa PROPRE
  // demande complète de rappel (acte + objet propre sans rapport avec le
  // pending) se lit à neuf — jamais coercé en replace.
  if (
    pendingClarifyState?.intent === "replace" &&
    !pendingDisarmedByComposite &&
    hasExplicitCreateDirectEffect &&
    ["create", "reschedule", "replace"].includes(
      String(payloadText(createEffect, "intent") ?? "create"),
    )
  ) {
    const slots = pendingClarifyState.known_slots;
    const freshInstruction = extractReminderInstruction(args.message);
    const pendingInstructionHint = String(slots.instruction_hint ?? "").trim();
    const freshUnrelatedRequest = Boolean(
      /\b(rappelle[- ]?moi|mets[- ]?moi un rappel|nouveau rappel)\b/.test(
        String(args.message ?? "").normalize("NFD")
          .replace(/\p{Diacritic}/gu, "").replace(/[’']/g, " ")
          .toLowerCase(),
      ) &&
        freshInstruction &&
        !isDegenerateReminderInstruction(freshInstruction) &&
        !isReminderInstructionInvarianceAnaphora(freshInstruction) &&
        (!pendingInstructionHint ||
          !instructionTokensOverlap(pendingInstructionHint, freshInstruction)),
    );
    if (!freshUnrelatedRequest) {
      try {
        const tctxReplaceFusion = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        const timezoneReplaceFusion = tctxReplaceFusion.user_timezone ||
          "Europe/Paris";
        // Heure du NOUVEAU rappel: le tour prime, les slots complètent.
        if (!compiledPayload.scheduledFor) {
          const storedUtc = String(slots.UTC_time ?? "").trim();
          if (
            isValidIsoDate(storedUtc) &&
            new Date(storedUtc).getTime() > now.getTime() + 30_000
          ) {
            compiledPayload = {
              ...compiledPayload,
              scheduledFor: storedUtc,
              localLabel: String(slots.local_label ?? "").trim() ||
                formatOneShotLocalLabel(storedUtc, timezoneReplaceFusion),
            };
          }
        }
        if (!compiledPayload.instruction && pendingInstructionHint) {
          compiledPayload = {
            ...compiledPayload,
            instruction: pendingInstructionHint,
          };
        }
        // Cible: slot stocké, sinon résolution par la RÉPONSE.
        let targetLabel =
          String(slots.replace_target_label ?? "").trim() ||
          payloadText(createEffect, "replace_target_label") ||
          null;
        if (!targetLabel) {
          const pendingsForAnswer = await readPendingOneShotReminderRows({
            supabase: args.supabase,
            userId: args.userId,
          });
          // 1. Contenu nommé dans la réponse (« celui des étirements »).
          const contentMatches = pendingsForAnswer
            .map((row) => ({
              row,
              score: messageContentOverlapScore(
                args.message,
                String(
                  (row?.message_payload as
                    | Record<string, unknown>
                    | undefined)?.reminder_instruction ?? "",
                ),
              ),
            }))
            .filter((entry) => entry.score > 0);
          let targetRow = contentMatches.length === 1
            ? contentMatches[0].row
            : null;
          // 2. Heure de DÉSIGNATION: elle doit matcher un pending existant
          // et différer de la nouvelle heure (sinon c'est la nouvelle heure
          // ré-énoncée).
          if (!targetRow) {
            const answerHHMM = extractTargetHHMMFromMessage(args.message);
            const newHHMM = compiledPayload.scheduledFor
              ? localHHMMForScheduledFor(
                compiledPayload.scheduledFor,
                timezoneReplaceFusion,
              )
              : null;
            if (answerHHMM && answerHHMM !== newHHMM) {
              targetRow = pendingsForAnswer.find((row) =>
                localHHMMForScheduledFor(
                  String(row?.scheduled_for ?? ""),
                  timezoneReplaceFusion,
                ) === answerHHMM
              ) ?? null;
            }
          }
          if (targetRow) {
            targetLabel = localHHMMForScheduledFor(
              String(targetRow.scheduled_for ?? ""),
              timezoneReplaceFusion,
            );
          }
        }
        createEffect = {
          ...createEffect!,
          payload_hint: {
            ...((createEffect!.payload_hint ?? {}) as Record<string, unknown>),
            intent: "replace",
            ...(targetLabel ? { replace_target_label: targetLabel } : {}),
          },
        };
      } catch (_error) {
        // best-effort: le clarify replace re-posé reste le filet.
      }
    }
  }
  // P4-B (alex-global19 R1-B02): « annule X et remets-en un à Yh » émis en
  // UN SEUL effect intent="cancel" avec le when_hint de l'ANCIEN horaire —
  // seul le cancel partait et l'utilisateur restait sans aucun rappel.
  // Reclassification déterministe: un cancel dont le raw_text porte un
  // verbe de re-création suivi d'un horaire PARSEABLE différent de la cible
  // du cancel est un REPLACE. Le segment APRÈS le verbe isole le NOUVEL
  // horaire (leçon P3-B: ne jamais parser un texte à deux heures en entier).
  // P12-D2b (alex-untested24 R1-B04): sous clarify actif, le composite
  // explicite arrive souvent ré-émis en intent=create (avec le when_hint de
  // l'ANCIEN horaire) — la même reclassification s'applique: le pending est
  // désarmé, la phrase se lit à neuf comme un replace.
  if (
    hasExplicitCreateDirectEffect &&
    (payloadText(createEffect, "intent") === "cancel" ||
      (pendingDisarmedByComposite &&
        String(payloadText(createEffect, "intent") ?? "create") === "create"))
  ) {
    // P12-D2b: sur le composite ré-énoncé sous clarify, le MESSAGE user est
    // la source de vérité (le raw_text ré-émis peut agréger le tour initial).
    const rawText = pendingDisarmedByComposite &&
        String(args.message ?? "").trim()
      ? args.message
      : canonicalRawTextFromTurnFrame(args.turnFrame) ?? args.message;
    // P12-V (harness S2 T4): « annule ce rappel, et METS-M'EN un nouveau à
    // 23h » — la forme « mets-m'en / mets-moi un nouveau » manquait à la
    // liste de re-création: le composite retombait sur le gate
    // same_instruction au lieu du replace explicite (le consentement au
    // cancel est DANS le message). Bornée au contexte cancel/composite de
    // cette branche — « mets-moi un rappel » nu reste un create.
    const recreateMatch = rawText.match(
      /\b(remets|remet|recr[ée]e|reprogramme|replanifie|repose|mets[-\s]?m['’]en|mets[-\s]?moi)\b/i,
    );
    if (recreateMatch && typeof recreateMatch.index === "number") {
      const segment = rawText.slice(recreateMatch.index);
      try {
        const tctxReclass = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        const timezone = tctxReclass.user_timezone || "Europe/Paris";
        const parsedSegment = parseOneShotReminderRequest({
          message: segment,
          timezone,
          nowIso: tctxReclass.now_utc,
        });
        // P12-D2b: le segment elliptique (« remets-le à 20h30 ») ne porte
        // pas d'instruction — parseOneShotReminderRequest y est muet par
        // construction; le fallback scheduled_for-seul rend la
        // reclassification opérante (même leçon que P12-A sur les hints).
        const segmentScheduledFor = parsedSegment?.scheduledFor ??
          parseScheduledForFromMessage({
            message: segment,
            timezone,
            nowIso: tctxReclass.now_utc,
          });
        const newHHMM = segmentScheduledFor
          ? localHHMMForScheduledFor(segmentScheduledFor, timezone)
          : null;
        const cancelTargetHHMM = extractTargetHHMMFromMessage(
          [
            payloadText(createEffect, "replace_target_label") ?? "",
            payloadText(createEffect, "when_hint") ?? "",
            rawText.slice(0, recreateMatch.index),
          ].filter(Boolean).join(" "),
        );
        if (newHHMM && newHHMM !== cancelTargetHHMM) {
          createEffect = {
            ...createEffect!,
            payload_hint: {
              ...((createEffect!.payload_hint ?? {}) as Record<
                string,
                unknown
              >),
              intent: "replace",
              replace_target_label:
                payloadText(createEffect, "replace_target_label") ??
                  payloadText(createEffect, "when_hint") ??
                  rawText.slice(0, recreateMatch.index),
              when_hint: segment,
            },
          };
          compiledPayload = {
            ...compiledPayload,
            scheduledFor: String(segmentScheduledFor),
            localLabel: formatOneShotLocalLabel(
              String(segmentScheduledFor),
              timezone,
            ),
            instruction: compiledPayload.instruction ??
              parsedSegment?.reminderInstruction ?? null,
          };
        }
      } catch (_error) {
        // best-effort: le chemin cancel historique reste le fallback.
      }
    }
  }
  // Complétion structurelle (harness S2 T4): le dispatcher émet parfois un
  // create/replace explicite avec un moment exploitable dans les champs
  // structurés (raw_text/when_hint: « un nouveau à 23h ») mais UTC_time vide.
  // On résout l'heure avec le parseur déterministe existant (ancré horloge
  // client, timezone profil) au lieu de déclarer le payload incomplet — le
  // trou faisait dégénérer un replace en clarify puis en create nu (doublon).
  // Une expression ambiguë (« vers la fin de soirée ») reste irrésolue → même
  // clarify qu'avant, aucune devinette.
  // Complétion réservée aux intents à cible explicite (replace) ou sans
  // risque de doublon (reschedule dégradé quand ZÉRO pending): sur un create
  // NU, l'absence d'UTC_time sert de barriere aux sur-emissions du dispatcher
  // (ex. reschedule emis en create nu avec instruction anaphorique « ce qu'il
  // désigne ») — la completer recree le doublon d'eva-g16 B01 (run12 S2 T3).
  // Un texte de replace porte souvent DEUX heures (« annule celui de 19h et
  // remets-le demain à 20h ») et le parseur y gagne la MAUVAISE (leçon P3-B,
  // vérifié: 19h sort du texte entier). Le segment après le verbe de
  // re-création isole le NOUVEL horaire — même isolation que la
  // reclassification cancel→replace ci-dessus.
  const isolateRecreateSegment = (text: string): string => {
    const match = text.match(
      /\b(remets|remet|mets|recr[ée]e|reprogramme|replanifie|repose|repousse|d[ée]cale)\b/i,
    );
    return match && typeof match.index === "number"
      ? text.slice(match.index)
      : text;
  };
  const completeMissingPayloadTime = async (): Promise<void> => {
    if (compiledPayload.scheduledFor) return;
    try {
      const tctxFill = await getUserTimeContext({
        supabase: args.supabase,
        userId: args.userId,
        now,
      });
      // Champs structurés émis par le dispatcher (payload raw_text /
      // when_hint) d'abord (frontière G1/C3: le payload structuré est
      // canonique). P6-V (probe P6-1 passe 4): quand l'émission perd TOUS les
      // champs temporels sur un REPLACE, le message user reste la seule
      // source du créneau explicite (« remets-le demain à 20h ») — le
      // fallback message est borné à ce cas (intent replace déjà émis par le
      // dispatcher, jamais un create nu: l'anti-doublon d'eva-g16 B01 tient).
      const payloadRawText = canonicalRawTextFromTurnFrame(args.turnFrame) ??
        "";
      const whenHint = payloadText(createEffect, "when_hint") ?? "";
      const candidates = [
        [payloadRawText, whenHint].filter(Boolean).join(" "),
        args.message,
      ].map((text) => isolateRecreateSegment(text).trim()).filter(Boolean);
      // L'heure de la CIBLE du replace ne peut jamais devenir l'heure du
      // nouveau rappel via complétion: si le parseur la retrouve quand même
      // (segment sans verbe, texte à deux heures), on rejette → clarify.
      const targetHHMM = extractTargetHHMMFromMessage(
        payloadText(createEffect, "replace_target_label") ?? "",
      );
      for (const parseText of candidates) {
        const parsed = parseOneShotReminderRequest({
          message: parseText,
          timezone: tctxFill.user_timezone,
          nowIso: tctxFill.now_utc,
        });
        const scheduledForFill = parsed?.scheduledFor ??
          parseScheduledForFromMessage({
            message: parseText,
            timezone: tctxFill.user_timezone,
            nowIso: tctxFill.now_utc,
          });
        if (!scheduledForFill) continue;
        if (
          targetHHMM &&
          localHHMMForScheduledFor(scheduledForFill, tctxFill.user_timezone) ===
            targetHHMM
        ) {
          continue;
        }
        const parsedInstruction = String(parsed?.reminderInstruction ?? "")
          .trim();
        compiledPayload = {
          ...compiledPayload,
          scheduledFor: scheduledForFill,
          localLabel: compiledPayload.localLabel ??
            formatOneShotLocalLabel(
              scheduledForFill,
              tctxFill.user_timezone,
            ),
          // Une instruction anaphorique (« même chose ») ou dégénérée reste
          // vide ici: l'héritage P3-F/P6-A du replace la résout depuis le
          // pending ciblé, jamais depuis la clause temporelle.
          instruction: compiledPayload.instruction ??
            (parsedInstruction &&
                !isDegenerateReminderInstruction(parsedInstruction) &&
                !isReminderInstructionInvarianceAnaphora(parsedInstruction)
              ? parsedInstruction
              : null),
        };
        return;
      }
    } catch (_error) {
      // best-effort: le chemin clarify existant reste le fallback.
    }
  };
  if (
    hasExplicitCreateDirectEffect &&
    payloadText(createEffect, "intent") === "replace"
  ) {
    await completeMissingPayloadTime();
  }
  // P8-D (nina-hard23 R1-B01): une ANAPHORE DE STYLE (« pareil qu'avant »,
  // « comme d'hab », « même style ») co-présente avec une heure ABSOLUE
  // explicite faisait perdre le créneau — le dispatcher laissait UTC_time
  // vide (l'anaphore lue comme référence à l'heure d'un rappel antérieur) et
  // le create nu dégénérait en clarify missing_time alors que « à 21h » était
  // dans le message. Complétion BORNÉE du create nu, trois verrous cumulés:
  // (1) instruction propre déjà présente (jamais une anaphore/clause
  // dégénérée — le doublon d'eva-g16 B01 portait une instruction
  // anaphorique), (2) AUCUN marqueur de reschedule/replace dans le texte
  // (la barrière anti-sur-émission du create nu tient), (3) heure absolue
  // NON ambiguë (la ceinture méridiem garde les heures nues 1-9; « matin/
  // midi/soir » ou minutes explicites lèvent l'ambiguïté). Invariant: une
  // heure absolue explicite présente ⇒ jamais missing_time.
  if (
    hasExplicitCreateDirectEffect &&
    !compiledPayload.scheduledFor &&
    String(payloadText(createEffect, "intent") ?? "create") === "create" &&
    compiledPayload.instruction &&
    !isDegenerateReminderInstruction(compiledPayload.instruction) &&
    !isReminderInstructionInvarianceAnaphora(compiledPayload.instruction)
  ) {
    const timeSourceText = [
      canonicalRawTextFromTurnFrame(args.turnFrame) ?? "",
      payloadText(createEffect, "when_hint") ?? "",
      args.message,
    ].join(" ");
    const normalizedTimeSource = timeSourceText
      .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const hasRescheduleMarker =
      /\b(remets|remet|decale|repousse|replanifie|reprogramme)\b|\bau lieu de\b|\b(mets|passe)[- ](le|la)\b|\bplutot\b/
        .test(normalizedTimeSource);
    const hasUnambiguousExplicitHour =
      bareAmbiguousHour(timeSourceText, { includeDigits: true }) === null &&
      /\b\d{1,2}\s*h(?:\d{2})?\b|\b(matin|midi|soir)\b/.test(
        normalizedTimeSource,
      );
    // Verrou (0) — harness r5g-s4 T2 (régression attrapée en validation P8):
    // la barrière UTC_time-vide protège AUSSI contre les sur-émissions sur
    // INTENTION FUTURE sans demande (« que je puisse tester demain vers
    // 18h ») — la complétion ne s'applique que si le MESSAGE user porte un
    // ACTE DE RAPPEL explicite (le cas nina: « mets-moi un RAPPEL à 21h,
    // pareil qu'avant »). Sans acte, le clarify/zéro-write reste la réponse.
    const hasExplicitReminderAct =
      /\b(rappels?|rappelles?|rappeler|previens|prevenir|notifications?|notifs?|alarmes?|alertes?)\b/
        .test(
          String(args.message ?? "")
            .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase(),
        );
    if (
      hasExplicitReminderAct && !hasRescheduleMarker &&
      hasUnambiguousExplicitHour
    ) {
      await completeMissingPayloadTime();
    }
  }
  // P3-B (paul-untested16 T12, rose-hard15 T11 — généralise RMR-B01): le
  // temps du payload est DÉTERMINISTE. L'UTC_time LLM dérive (« demain à
  // 19h » à 02h49 → aujourd'hui, les deux dates étant futures donc jamais
  // rattrapées par past_time) ; la résolution du parseur, ancrée sur
  // l'horloge client + timezone profil, PRIME dès qu'elle diverge. Couches:
  // 1. « demain »-famille explicite + parseur résout → parseur, point.
  // 2. « demain »-famille explicite + parseur muet (« demain matin » sans
  //    heure) → l'HEURE du LLM est gardée, le JOUR est forcé à J+1 local.
  // 3. Sans jour explicite: parseur et LLM tous deux FUTURS et divergents →
  //    parseur ; parseur futur mais LLM passé → on garde le passé (clarify
  //    past_time, décision V2-A: le bump d'une heure nue passée est ambigu).
  if (
    hasExplicitCreateDirectEffect && compiledPayload.scheduledFor &&
    payloadText(createEffect, "intent") !== "cancel" &&
    // P7-C: la fusion méridiem est canonique pour le tour — le when_hint
    // ré-émis (« demain à 7 heures ») re-résoudrait 07:00 et l'écraserait.
    !meridiemFusionApplied
  ) {
    try {
      const tctxTime = await getUserTimeContext({
        supabase: args.supabase,
        userId: args.userId,
        now,
      });
      const timezone = tctxTime.user_timezone || "Europe/Paris";
      const payloadRawText = canonicalRawTextFromTurnFrame(args.turnFrame) ??
        "";
      const whenHint = payloadText(createEffect, "when_hint") ?? "";
      // Le when_hint ISOLE l'expression temporelle pertinente — parser le
      // raw_text complet d'un replace (« annule celui de 14h et recrée-le à
      // 15h ») fait gagner la MAUVAISE heure au parseur (probe P3-6). Le
      // hint de jour (« demain ») peut vivre dans raw_text seul: on le
      // préfixe alors au when_hint pour que le parseur résolve le bon jour.
      // P6-V (probe P6-1 passe 4): when_hint VIDE sur un replace/reschedule →
      // même trap deux-heures sur le raw_text entier — le segment après le
      // verbe de re-création isole le nouvel horaire.
      const fullText = [payloadRawText, whenHint].filter(Boolean).join(" ");
      // P12-A: les détections de JOUR (demain-famille, marqueur nocturne)
      // lisent le scope temporel — jamais les jetons de date du contenu.
      const temporalScope = temporalScopeText(
        fullText,
        canonicalInstructionHintFromTurnFrame(args.turnFrame) ??
          compiledPayload.instruction,
      );
      const effectIntent = String(payloadText(createEffect, "intent") ?? "");
      let parseText = whenHint.trim() ||
        (effectIntent === "replace" || effectIntent === "reschedule"
          ? isolateRecreateSegment(payloadRawText)
          : payloadRawText);
      if (
        whenHint.trim() && hasExplicitFutureDayHint(temporalScope) &&
        !hasExplicitFutureDayHint(whenHint)
      ) {
        const dayToken = /apr[eè]s[- ]demain/i.test(temporalScope)
          ? "après-demain"
          : "demain";
        parseText = `${dayToken} ${whenHint}`;
      }
      const parsed = parseText.trim()
        ? parseOneShotReminderRequest({
          message: parseText,
          timezone,
          nowIso: tctxTime.now_utc,
        })
        : null;
      // P12-A (nina-p10reval R1-B02): un when_hint isolé ne porte pas
      // d'instruction — parseOneShotReminderRequest y était MUET par
      // construction et aucune couche ne réparait l'UTC LLM faux d'un item
      // de fan-out. Le fallback scheduled_for-seul rend les couches
      // opérantes sur les hints isolés.
      const parsedScheduledFor = parsed?.scheduledFor ??
        (parseText.trim()
          ? parseScheduledForFromMessage({
            message: parseText,
            timezone,
            nowIso: tctxTime.now_utc,
          })
          : null);
      const llmMs = new Date(compiledPayload.scheduledFor).getTime();
      const parsedMs = parsedScheduledFor
        ? new Date(parsedScheduledFor).getTime()
        : Number.NaN;
      const explicitFutureDay = hasExplicitFutureDayHint(temporalScope);
      const localDayUtc = (iso: string) =>
        Date.parse(
          `${
            new Intl.DateTimeFormat("en-CA", {
              timeZone: timezone,
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date(iso))
          }T00:00:00Z`,
        );
      if (explicitFutureDay && Number.isFinite(parsedMs)) {
        // Couche 1: le parseur possède la famille « demain ».
        if (Math.abs(parsedMs - llmMs) > 60_000) {
          compiledPayload = {
            ...compiledPayload,
            scheduledFor: String(parsedScheduledFor),
            parseSource: "local_parser",
          };
        }
      } else if (explicitFutureDay && Number.isFinite(llmMs)) {
        // Couche 2: « demain » explicite mais parseur muet — le JOUR du LLM
        // ne peut pas être ≤ aujourd'hui: décale en jours civils locaux
        // jusqu'à J+1 (heure locale préservée).
        const tomorrowDayUtc = localDayUtc(tctxTime.now_utc) + 86_400_000;
        let repairedMs = llmMs;
        while (localDayUtc(new Date(repairedMs).toISOString()) < tomorrowDayUtc) {
          repairedMs += 86_400_000;
        }
        if (repairedMs !== llmMs) {
          compiledPayload = {
            ...compiledPayload,
            scheduledFor: new Date(repairedMs).toISOString(),
            parseSource: "local_parser",
          };
        }
      } else if (
        Number.isFinite(parsedMs) && Number.isFinite(llmMs) &&
        llmMs > now.getTime() + 30_000 &&
        parsedMs > now.getTime() + 30_000 &&
        Math.abs(parsedMs - llmMs) > 60_000 &&
        // P12-A: la couche 3 exige que le parseur POSSÈDE son ancre — un jour
        // explicite dans le texte parsé (jour nommé, demain, ce soir…), un
        // relatif (« dans 2h »), ou une simple dérive d'HORAIRE (même jour
        // civil des deux côtés). Sans possession, un when_hint nu (« à
        // 18h ») résolu aujourd'hui n'écrase pas un jour LLM légitimement
        // ancré ailleurs dans le message.
        (hasAnyExplicitDayToken(parseText) ||
          /\bdans\s+(une?|\d{1,3})\s*(h(eures?)?|minutes?|quart)\b/.test(
            parseText.normalize("NFD").replace(/\p{Diacritic}/gu, "")
              .toLowerCase(),
          ) ||
          localDayUtc(new Date(parsedMs).toISOString()) ===
            localDayUtc(new Date(llmMs).toISOString()))
      ) {
        // Couche 3: deux résolutions futures qui divergent (heure relative,
        // dérive d'arithmétique, jour nommé mal résolu par le LLM) → le
        // déterministe gagne.
        compiledPayload = {
          ...compiledPayload,
          scheduledFor: String(parsedScheduledFor),
          parseSource: "local_parser",
        };
      } else if (
        Number.isFinite(parsedMs) && Number.isFinite(llmMs) &&
        llmMs <= now.getTime() + 30_000 &&
        parsedMs > now.getTime() + 30_000 &&
        hasNocturnalOrMeridiemForwardMarker(temporalScope)
      ) {
        // Couche 4 — P10-A (nina-hard24 R1-B01, T4/T5): EXCEPTION bornée à
        // la décision V2-A (« LLM passé → on garde le passé »). Cette
        // décision visait l'heure NUE ambiguë ; « cette nuit à 2h du
        // matin » dit à 22h porte un marqueur nocturne/méridiem EXPLICITE:
        // la prochaine occurrence (le glissement du parseur au lendemain)
        // n'est pas un bump ambigu, c'est le sens demandé. Sans cette
        // couche, un rappel bénin parfaitement spécifié était non-créable
        // en langage naturel (past_time → cul-de-sac → seule la date de
        // calendrier absolue passait). L'heure nue passée SANS marqueur
        // garde le clarify past_time (anti-FP V2-A intact).
        compiledPayload = {
          ...compiledPayload,
          scheduledFor: String(parsedScheduledFor),
          parseSource: "local_parser",
        };
      }
    } catch (_error) {
      // best-effort: le clarify past_time existant reste le filet.
    }
  }
  const effectType: OneShotReminderDirectEffectTool =
    "create_one_shot_reminder";
  if (!hasExplicitCreateDirectEffect) {
    return baseDirectEffectResult({
      detected: false,
      intent: "off_topic",
      status: "ignored",
      reason_code: "missing_explicit_direct_effect",
    });
  }
  if (args.noMutationRequested) {
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: "create",
        status: "blocked",
        reason_code: "no_mutation_requested",
      }),
      requested_effects: [{ type: effectType, reason_code: "create" }],
      blocked_effects: [{
        type: effectType,
        reason_code: "no_mutation_requested",
      }],
    };
  }
  // P8-V (harness r5g-s2 T3, validation P8): le dispatcher émet parfois le
  // « mets-LE plutôt à 23h » en create NU (intent vide) malgré la RÈGLE DU
  // PRONOM du contrat — le create committait un DOUBLON (l'ancien pending
  // restait, « c'est décalé » mensonger). Le discriminant grammatical P6-V
  // (impératif + clitique à TRAIT D'UNION) est déterministe et désigne
  // toujours un rappel EXISTANT: le create nu est coercé en reschedule — le
  // chemin P6-H reprend la main (replace atomique sur cible unique, blocage
  // honnête sinon, dégradation P0-4 à zéro pending). Le re-serve d'un
  // différé de crise est exempté (son « remets-le » vise le différé, pas un
  // pending à déplacer).
  if (
    String(payloadText(createEffect, "intent") ?? "create") === "create" &&
    ((args.tempMemory as Record<string, unknown> | null | undefined)
        ?.[SAFETY_DEFERRED_REMINDER_RUNTIME_KEY] as
          | Record<string, unknown>
          | undefined)?.mode !== "deferred" &&
    // Un clarify CREATE en vol exempte aussi (probe P8-5 passe 9): le
    // « remets-le » du tour-réponse vise le create en cours de clarification,
    // jamais un AUTRE pending à déplacer — coercer ici re-ciblait le mauvais
    // rappel (le kiné) via P6-H.
    !pendingCreateClarificationKnownSlots(args.tempMemory) &&
    hasRescheduleCliticAnaphor(
      `${args.message} ${canonicalRawTextFromTurnFrame(args.turnFrame) ?? ""}`,
    )
  ) {
    createEffect = {
      ...createEffect!,
      payload_hint: {
        ...((createEffect!.payload_hint ?? {}) as Record<string, unknown>),
        intent: "reschedule",
      },
    };
  }
  // Intention reschedule (eva-r5 B01): un decalage de rappel existant n'est
  // pas supporte en chat (decision V1). Comme pour cardinality=recurring, le
  // dispatcher emet l'intent et on bloque ICI pour que le tour porte un
  // outcome honnete — un tour "sans effet" laissait le composeur improviser
  // un faux "c'est note : 21h30" sans aucun outcome a suivre.
  if (payloadText(createEffect, "intent") === "reschedule") {
    // P0-4 (nina R1-B02): « remets-le à 21h30 » alors qu'AUCUN rappel
    // ponctuel n'est en attente = il n'y a rien à déplacer — l'intention
    // réelle est de (re)poser le rappel. Payload complet → on dégrade en
    // create (fallthrough vers le chemin nominal) ; incomplet → clarify
    // honnête SANS proposer le replace (consigne inexécutable sans cible).
    // Lecture indisponible → comportement historique (blocage honnête).
    let pendingCount: number | null = null;
    let pendingRows: Awaited<
      ReturnType<typeof readPendingOneShotReminderRows>
    > | null = null;
    try {
      pendingRows = await readPendingOneShotReminderRows({
        supabase: args.supabase,
        userId: args.userId,
      });
      pendingCount = pendingRows.length;
    } catch (_error) {
      pendingCount = null;
    }
    // P4-C (paul-p3verify R1-B03): « remets-moi le rappel des pâtes » alors
    // que les pendings existants ne correspondent PAS à cette instruction
    // (seul le kiné est en attente) — il n'y a rien à déplacer pour CE
    // rappel, l'intention réelle est de le (re)poser: même dégradation en
    // create que le cas zéro-pending. Match déterministe par recouvrement
    // de tokens d'instruction (jamais le texte du message).
    // P6-V (harness r5g-s2 T3): un instruction_hint qui ÉCHO la commande de
    // déplacement (verbe de déplacement + horaire, ex. « en fait mets-le
    // plutôt à 23h, 22h30 c'est trop tôt ») n'est PAS un contenu de rappel:
    // le prendre pour l'objet faisait rater le recouvrement de tokens →
    // dégradation en create → DOUBLON avec la commande committée en durable.
    // Écho ⇒ instruction absente: le ciblage P6-H (pending unique) prend la
    // main et le contenu s'hérite du rappel déplacé. « remets-moi le rappel
    // des pâtes » (P4-C) reste une dégradation: objet réel, pas d'horaire.
    const rawRequestedInstruction = compiledPayload.instruction ?? "";
    const looksLikeRescheduleCommandEcho = (() => {
      const normalized = rawRequestedInstruction.normalize("NFD")
        .replace(/\p{Diacritic}/gu, "").toLowerCase();
      return /\b(mets|remets|remet|d[ée]?cale|decale|repousse|replanifie|reprogramme|recree|avance)\b/
        .test(normalized) &&
        /\b\d{1,2}\s?h(?:\d{2})?\b/.test(normalized);
    })();
    // P10-E (alex-hard24 R1-B02): une RÉFÉRENCE D'ENTITÉ (« celui du midi »)
    // n'est pas un contenu — traitée comme instruction vide (l'héritage
    // P3-F prendra le texte de la cible), son créneau nominal sert à
    // résoudre la cible parmi plusieurs pendings.
    // P12-V (probe P12-5 passe 6): la référence de créneau vit parfois dans
    // le MESSAGE (« décale celui du soir à 21h ») pendant que l'émission
    // INVENTE une instruction discriminante (« faire mes étirements »,
    // absente du message) — le faux discriminant résolvait une cible AU
    // HASARD parmi les candidats du créneau. Quand le message porte la
    // référence nominale et que l'instruction émise n'y est PAS ancrée,
    // l'instruction ne cible pas : le créneau nominal (D5) prend la main
    // (1 candidat = cible, ≥2 = clarify nominative). Condition de
    // désarmement : instruction ancrée dans le message = émission fidèle ⇒
    // ciblage par contenu inchangé.
    const messageDaypartReference = `${args.message}`.normalize("NFD")
      .replace(/\p{Diacritic}/gu, "").toLowerCase()
      .match(
        /\b(celui|celle) (du (matin|midi|soir)|de la nuit|de l apres[- ]midi)\b/,
      )?.[0] ?? null;
    const emittedInstructionUnrootedOnDaypartMessage = Boolean(
      messageDaypartReference && rawRequestedInstruction &&
        !isReminderEntityReference(rawRequestedInstruction) &&
        !instructionRootedInText(
          rawRequestedInstruction,
          `${args.message} ${canonicalRawTextFromTurnFrame(args.turnFrame) ?? ""}`,
        ),
    );
    const rescheduleEntityReference = isReminderEntityReference(
      rawRequestedInstruction,
    )
      ? rawRequestedInstruction
      : emittedInstructionUnrootedOnDaypartMessage
      ? messageDaypartReference
      : null;
    const requestedInstruction =
      looksLikeRescheduleCommandEcho || rescheduleEntityReference
        ? ""
        : rawRequestedInstruction;
    // P6-V (harness r5g-s2 T3, 2e forme): l'émission pollue parfois
    // instruction_hint avec un contenu SANS RAPPORT (sujet du tour
    // précédent) — le non-recouvrement dégradait alors en create → doublon.
    // Le discriminant grammatical est déterministe: l'impératif + clitique
    // à TRAIT D'UNION (« mets-le », « décale-le », « remets-la ») désigne
    // toujours UN RAPPEL EXISTANT — jamais une re-création. « remets-moi le
    // rappel des pâtes » (NP, pas de clitique) reste la dégradation P4-C.
    const rescheduleCliticAnaphor = hasRescheduleCliticAnaphor(
      `${args.message} ${canonicalRawTextFromTurnFrame(args.turnFrame) ?? ""}`,
    );
    const anyPendingMatchesInstruction = pendingRows?.some((row) =>
      instructionTokensOverlap(
        requestedInstruction,
        String(
          (row?.message_payload as Record<string, unknown> | undefined)
            ?.reminder_instruction ?? "",
        ),
      )
    ) ?? true;
    // P9-A (rose-p8reval T6) — CONDITION D'ANTÉCÉDENT RÉSOLUBLE: le clitique
    // ne protège la voie P6-H que si l'anaphore PEUT viser un pending. Quand
    // l'utilisateur redonne dans le message même un contenu complet qui ne
    // recouvre AUCUN pending (« reprends celui-là… le 16 à 20h pour checker
    // mon envie » alors que seul « préparer le sas » est en attente),
    // l'antécédent du pronom est la SPEC qu'il vient d'énoncer — pas « le
    // seul pending qui traîne ». Coercer quand même le replace annulait un
    // rappel sain, héritait son texte et affirmait le contraire (3 dégâts
    // silencieux). Le contenu ancré dans le message désarme la ceinture: la
    // demande redevient un create additif (payload complet) ou un clarify.
    // La pollution P6-V 2e forme (instruction héritée d'un tour précédent,
    // absente du message) reste couverte: non ancrée ⇒ ciblage P6-H inchangé.
    const instructionRootedInMessage = instructionRootedInText(
      requestedInstruction,
      `${args.message} ${canonicalRawTextFromTurnFrame(args.turnFrame) ?? ""}`,
    );
    // P12-D4 (nina-p10reval R1-B03a): condition P9-A étendue d'une dimension
    // JOUR — « il manque celui de VENDREDI, remets-le » avec pendings
    // jeudi-seulement: l'antécédent nommé (vendredi) n'existe pas en pending,
    // l'anaphore ne peut PAS viser un pending d'un autre jour → dégradation
    // en create, jamais un replace du jeudi lexicalement proche.
    // Condition de désarmement: le jour nommé est celui de DESTINATION
    // (« décale-le À vendredi », non capturé par l'ancre d'entité) ou un
    // pending existe bien ce jour-là ⇒ ciblage historique inchangé; lecture
    // timezone indisponible ⇒ fail-open historique.
    const rescheduleEntityDayToken = entityAnchoredDayToken(
      `${args.message} ${canonicalRawTextFromTurnFrame(args.turnFrame) ?? ""}`,
    );
    let entityDayHasPendingMatch = true;
    if (rescheduleEntityDayToken && (pendingRows ?? []).length > 0) {
      try {
        const tctxEntityDay = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        const timezoneEntityDay = tctxEntityDay.user_timezone ||
          "Europe/Paris";
        const civilOf = (iso: string) => {
          try {
            return new Intl.DateTimeFormat("fr-CA", {
              timeZone: timezoneEntityDay,
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date(iso));
          } catch (_error) {
            return "";
          }
        };
        const dayTokenMatchesIso = (iso: string): boolean => {
          if (!iso) return false;
          if (
            rescheduleEntityDayToken === "demain" ||
            rescheduleEntityDayToken.startsWith("apres")
          ) {
            const offset = rescheduleEntityDayToken === "demain" ? 1 : 2;
            return civilOf(iso) ===
              civilOf(
                new Date(
                  new Date(tctxEntityDay.now_utc).getTime() +
                    offset * 86_400_000,
                ).toISOString(),
              );
          }
          return localWeekdayName(iso, timezoneEntityDay) ===
            rescheduleEntityDayToken;
        };
        entityDayHasPendingMatch = (pendingRows ?? []).some((row) =>
          dayTokenMatchesIso(String(row?.scheduled_for ?? ""))
        );
      } catch (_error) {
        entityDayHasPendingMatch = true;
      }
    }
    const entityDayMismatch = Boolean(rescheduleEntityDayToken) &&
      !entityDayHasPendingMatch;
    // P12-D3 (nina-p10reval R1-B03b): marqueur additif explicite (« rajoute
    // jeudi et tu gardes vendredi ») ⇒ le chemin reschedule/replace perd le
    // droit de CANCEL — dégradation en create (doublon assumé), jamais un
    // replace silencieux de la cible protégée.
    const nothingToRescheduleForThisReminder = additiveMarker ||
      entityDayMismatch ||
      pendingCount === 0 ||
      (pendingCount !== null &&
        oneShotInstructionTokens(requestedInstruction).size > 0 &&
        !anyPendingMatchesInstruction &&
        // Clitique anaphorique ⇒ le user déplace UN RAPPEL EXISTANT: jamais
        // de dégradation en create (le doublon), le ciblage P6-H tranche
        // (pending unique → replace atomique, sinon blocage honnête) — SAUF
        // antécédent non résoluble avec contenu ancré (P9-A ci-dessus).
        (!rescheduleCliticAnaphor || instructionRootedInMessage));
    if (nothingToRescheduleForThisReminder) {
      await completeMissingPayloadTime();
      // P12-D3/D4: le doublon d'instruction est ASSUMÉ sur ces dégradations
      // (l'objet existe déjà un autre jour et doit RESTER) — sans ça le gate
      // same_instruction_pending re-bloquait le create légitime.
      if (additiveMarker || entityDayMismatch) allowDuplicateForTurn = true;
      // P10-E/P12-D4/D8a: une référence d'entité (« celui des poubelles »)
      // ou une anaphore d'invariance n'est JAMAIS un contenu durable — sur
      // la dégradation en create elle vaut instruction ABSENTE, l'héritage
      // (sibling D4, cancelled D8a) ou le clarify prennent la suite.
      if (
        compiledPayload.instruction &&
        (isReminderEntityReference(compiledPayload.instruction) ||
          isReminderInstructionInvarianceAnaphora(compiledPayload.instruction))
      ) {
        compiledPayload = { ...compiledPayload, instruction: null };
      }
      // P12-D4 (nina R1-B03a): unique pending du même objet sur un AUTRE
      // jour ⇒ create PUR du jour nommé — instruction héritée du sibling,
      // heure héritée si le message n'en donne pas (la série « jeudi et
      // vendredi à 18h » partage son heure).
      if (entityDayMismatch && (pendingRows ?? []).length === 1) {
        const sibling = (pendingRows ?? [])[0];
        const siblingInstruction = String(
          (sibling?.message_payload as Record<string, unknown> | undefined)
            ?.reminder_instruction ?? "",
        ).trim();
        if (!compiledPayload.instruction && siblingInstruction) {
          compiledPayload = {
            ...compiledPayload,
            instruction: siblingInstruction,
          };
        }
        const messageHasExplicitHour = /\b\d{1,2}\s*h(?:\d{2})?\b/.test(
          String(args.message ?? "").normalize("NFD")
            .replace(/\p{Diacritic}/gu, "").toLowerCase(),
        );
        if (!compiledPayload.scheduledFor && !messageHasExplicitHour) {
          try {
            const tctxSibling = await getUserTimeContext({
              supabase: args.supabase,
              userId: args.userId,
              now,
            });
            const timezoneSibling = tctxSibling.user_timezone ||
              "Europe/Paris";
            const siblingHHMM = localHHMMForScheduledFor(
              String(sibling?.scheduled_for ?? ""),
              timezoneSibling,
            );
            const composed = siblingHHMM
              ? composeNamedDayWithHHMM({
                dayToken: rescheduleEntityDayToken!,
                hhmm: siblingHHMM,
                timezone: timezoneSibling,
                nowUtcIso: tctxSibling.now_utc,
              })
              : null;
            if (composed) {
              compiledPayload = {
                ...compiledPayload,
                scheduledFor: composed,
                localLabel: formatOneShotLocalLabel(
                  composed,
                  timezoneSibling,
                ),
              };
            }
          } catch (_error) {
            // best-effort: le clarify honnête reste le filet.
          }
        }
      }
      // P12-D8a (paul-p9reval R1-B03): héritage d'instruction étendu aux
      // CANCELLED récents (fenêtre 24h) — « remets-moi celui des poubelles »
      // après un cancel hérite le texte de la ligne annulée quand l'entité
      // nommée est UNIQUE parmi les annulés; ≥2 candidats distincts ⇒
      // clarify nominatif; aucun ⇒ comportement P0-4 inchangé. L'issue reste
      // NON destructive (create pur, invariant P9-A: aucun pending touché).
      if (!compiledPayload.instruction) {
        try {
          const sinceIso = new Date(now.getTime() - 24 * 3_600_000)
            .toISOString();
          const recentRows = await readRecentOneShotReminderRows({
            supabase: args.supabase,
            userId: args.userId,
            sinceIso,
          });
          const cancelledScored = (recentRows as Array<
            Record<string, unknown>
          >)
            .filter((row) => String(row?.status ?? "") === "cancelled")
            .map((row) => ({
              row,
              instruction: String(
                (row?.message_payload as Record<string, unknown> | undefined)
                  ?.reminder_instruction ?? "",
              ).trim(),
            }))
            .filter((entry) =>
              entry.instruction &&
              messageContentOverlapScore(
                `${args.message} ${rawRequestedInstruction}`,
                entry.instruction,
              ) > 0
            );
          const distinctInstructions = [
            ...new Set(
              cancelledScored.map((entry) =>
                entry.instruction.normalize("NFD")
                  .replace(/\p{Diacritic}/gu, "").toLowerCase()
              ),
            ),
          ];
          if (cancelledScored.length > 0 && distinctInstructions.length === 1) {
            compiledPayload = {
              ...compiledPayload,
              instruction: cancelledScored[0].instruction,
            };
          } else if (distinctInstructions.length >= 2) {
            const tctxCancelled = await getUserTimeContext({
              supabase: args.supabase,
              userId: args.userId,
              now,
            });
            const timezoneCancelled = tctxCancelled.user_timezone ||
              "Europe/Paris";
            const candidateLines = cancelledScored.map((entry) =>
              `« ${entry.instruction} » (${
                formatOneShotLocalLabel(
                  String(entry.row?.scheduled_for ?? ""),
                  timezoneCancelled,
                )
              })`
            );
            const cancelledClarifyReply =
              `Tu as eu plusieurs rappels annulés qui pourraient correspondre : ${
                candidateLines.join(" ; ")
              }. Lequel je te remets ?`;
            return {
              ...baseDirectEffectResult({
                detected: true,
                intent: "create",
                status: "needs_clarify",
                reason_code: "cancelled_antecedent_ambiguous",
                reply: cancelledClarifyReply,
              }),
              requested_effects: [{
                type: effectType,
                reason_code: "reschedule",
              }],
              blocked_effects: [{
                type: effectType,
                reason_code: "cancelled_antecedent_ambiguous",
              }],
              missing_slots: ["reminder_instruction"],
              pending_clarification: {
                intent: "create",
                reason_code: "cancelled_antecedent_ambiguous",
                clarify_question: cancelledClarifyReply,
                known_slots: {
                  UTC_time: compiledPayload.scheduledFor ?? null,
                  local_label: compiledPayload.localLabel ?? null,
                  instruction_hint: null,
                  raw_text: compiledPayload.rawText ?? args.message,
                  when_hint:
                    canonicalWhenHintFromTurnFrame(args.turnFrame) ?? null,
                },
              },
            };
          }
        } catch (_error) {
          // Lecture best-effort: le clarify P0-4 historique reste le filet.
        }
      }
      if (!compiledPayload.scheduledFor || !compiledPayload.instruction) {
        // P9-A: le préambule dit la vérité de l'inventaire — « aucun rappel
        // en attente » seulement quand c'est le cas; des pendings SANS
        // RAPPORT existants ⇒ « aucun rappel qui corresponde » (jamais nier
        // l'inventaire, jamais y toucher). P12-D3: sur un ajout explicite,
        // le préambule dit l'ajout (rien d'existant n'est en cause).
        const noTargetPreamble = additiveMarker
          ? "C'est bien un ajout — je ne touche à aucun rappel existant."
          : (pendingCount ?? 0) > 0
          ? "Je ne vois pas de rappel en attente qui corresponde à celui-là — je n'ai touché à rien."
          : "Il n'y a aucun rappel en attente à déplacer.";
        return {
          ...baseDirectEffectResult({
            detected: true,
            intent: "create",
            status: "needs_clarify",
            reason_code: "reschedule_no_target",
            reply: !compiledPayload.scheduledFor
              ? `${noTargetPreamble} Donne-moi l'heure exacte et je te le (re)pose direct.`
              : `${noTargetPreamble} Dis-moi ce que je dois te rappeler et je te le (re)pose direct.`,
          }),
          requested_effects: [{ type: effectType, reason_code: "reschedule" }],
          blocked_effects: [{
            type: effectType,
            reason_code: "reschedule_no_target",
          }],
          missing_slots: !compiledPayload.scheduledFor
            ? ["scheduled_for"]
            : ["reminder_instruction"],
        };
      }
      // Payload complet: dégrade en create — le chemin nominal prend la suite.
    } else {
      // P6-H (nina-untested21 R1-B04, DÉCISION ACTÉE 13/07 — renverse V1
      // « pas d'édition en place »): un reschedule à HAUTE CONFIANCE (cible
      // UNIQUE résoluble + nouvelle heure parseable) s'exécute comme la
      // séquence atomique cancel+create du REPLACE, avec toutes ses gardes
      // (correspondance, tout-ou-rien, héritage d'instruction P3-F/P6-A).
      // Ambigu (plusieurs pendings sans correspondance) ou heure manquante →
      // blocage honnête historique, workaround guidé inchangé.
      await completeMissingPayloadTime();
      const matchingRows = (pendingRows ?? []).filter((row) =>
        instructionTokensOverlap(
          requestedInstruction,
          String(
            (row?.message_payload as Record<string, unknown> | undefined)
              ?.reminder_instruction ?? "",
          ),
        )
      );
      // P9-A (défense en profondeur): le repli « pending unique » exige un
      // antécédent résoluble — un contenu ancré dans le message qui ne
      // recouvre pas ce pending désigne un AUTRE rappel: cible nulle ⇒
      // blocage honnête en aval, jamais un replace destructif du pending
      // non lié.
      const uniquePendingIsResolvableAntecedent = !(
        oneShotInstructionTokens(requestedInstruction).size > 0 &&
        instructionRootedInMessage &&
        !anyPendingMatchesInstruction
      );
      // P12-D7 (alex-untested24 R1-B06, principe P5-E): cible par ÉVIDENCE
      // NOMMÉE — quand l'instruction émise est vide (écho de commande,
      // référence d'entité), le contenu nommé dans le MESSAGE résout la
      // cible: un recouvrement UNIQUE = cible, sans exiger son heure
      // actuelle. Condition de désarmement: ≥2 candidats positifs = vraie
      // ambiguïté (clarify nominatif), jamais une devinette.
      const messageContentMatches = matchingRows.length === 1
        ? []
        : (pendingRows ?? [])
          .map((row) => ({
            row,
            score: messageContentOverlapScore(
              args.message,
              String(
                (row?.message_payload as Record<string, unknown> | undefined)
                  ?.reminder_instruction ?? "",
              ),
            ),
          }))
          .filter((entry) => entry.score > 0);
      // P10-E: cible par CRÉNEAU NOMINAL — « celui du midi » avec plusieurs
      // pendings résout l'unique pending de la fenêtre (11-15h) ; 0 ou ≥2
      // candidats = pas de cible (jamais un choix au hasard).
      // P12-D5 (alex-untested24 R1-B02/B10): les candidats de la fenêtre sont
      // CAPTURÉS — ≥2 ⇒ clarify nominative qui les énumère; fenêtre VIDE ⇒
      // constat honnête + inventaire réel, JAMAIS le repli « pending unique »
      // hors fenêtre (la supposition observée).
      let daypartRescheduleTarget:
        | Awaited<ReturnType<typeof readPendingOneShotReminderRows>>[number]
        | null = null;
      let daypartCandidates:
        | Awaited<ReturnType<typeof readPendingOneShotReminderRows>>
        | null = null;
      const rescheduleDaypart = rescheduleEntityReference
        ? daypartWindowFromReference(rescheduleEntityReference)
        : null;
      if (rescheduleDaypart && (pendingRows ?? []).length > 0) {
        try {
          const tctxDaypart = await getUserTimeContext({
            supabase: args.supabase,
            userId: args.userId,
            now,
          });
          const timezoneDaypart = tctxDaypart.user_timezone || "Europe/Paris";
          const inWindow = (pendingRows ?? []).filter((row) => {
            const hhmm = localHHMMForScheduledFor(
              String(row?.scheduled_for ?? ""),
              timezoneDaypart,
            );
            const hour = Number(String(hhmm ?? "").split(":")[0]);
            return Number.isFinite(hour) &&
              hour >= rescheduleDaypart.startHour &&
              hour < rescheduleDaypart.endHour;
          });
          daypartCandidates = inWindow;
          if (inWindow.length === 1) daypartRescheduleTarget = inWindow[0];
        } catch (_error) {
          // best-effort: sans résolution, le blocage honnête reste.
          daypartCandidates = null;
        }
      }
      const uniqueRescheduleTarget = matchingRows.length === 1
        ? matchingRows[0]
        : daypartRescheduleTarget
        ? daypartRescheduleTarget
        : messageContentMatches.length === 1
        ? messageContentMatches[0].row
        : (pendingRows ?? []).length === 1 &&
            uniquePendingIsResolvableAntecedent &&
            daypartCandidates === null
        ? (pendingRows ?? [])[0]
        : null;
      // P12-D5: fenêtre nominale calculée mais cible non unique — la lane
      // répond NOMINATIVEMENT (créneau + objet de chaque candidat, jamais
      // « donne-moi l'intitulé exact » ni du vocabulaire système) et arme un
      // pending replace pour que la réponse (contenu ou heure) résolve la
      // cible via la fusion D1.
      if (!uniqueRescheduleTarget && daypartCandidates !== null) {
        try {
          const tctxNominative = await getUserTimeContext({
            supabase: args.supabase,
            userId: args.userId,
            now,
          });
          const timezoneNominative = tctxNominative.user_timezone ||
            "Europe/Paris";
          const nominativeLine = (
            row: Awaited<
              ReturnType<typeof readPendingOneShotReminderRows>
            >[number],
          ) => {
            const rowInstruction = String(
              (row?.message_payload as Record<string, unknown> | undefined)
                ?.reminder_instruction ?? "",
            ).trim() || "rappel ponctuel";
            const rowHHMM = localHHMMForScheduledFor(
              String(row?.scheduled_for ?? ""),
              timezoneNominative,
            );
            return `« ${rowInstruction} » à ${rowHHMM ?? "?"}`;
          };
          const nominativeReply = daypartCandidates.length >= 2
            ? `Tu as ${daypartCandidates.length} rappels sur ce créneau : ${
              daypartCandidates.map(nominativeLine).join(", ")
            } — lequel je déplace ? Rien n'a été changé pour l'instant.`
            : `Je ne vois aucun rappel en attente sur ce créneau. Voilà ce que tu as : ${
              (pendingRows ?? []).map(nominativeLine).join(" ; ") || "aucun"
            }. Dis-moi lequel tu vises — rien n'a été changé.`;
          const nominativeReason = daypartCandidates.length >= 2
            ? "replace_target_ambiguous"
            : "reschedule_no_target";
          return {
            ...baseDirectEffectResult({
              detected: true,
              intent: "create",
              status: "needs_clarify",
              reason_code: nominativeReason,
              reply: nominativeReply,
            }),
            requested_effects: [{
              type: effectType,
              reason_code: "reschedule",
            }],
            blocked_effects: [{
              type: effectType,
              reason_code: nominativeReason,
            }],
            pending_clarification: {
              intent: "replace",
              reason_code: "replace_target_ambiguous",
              clarify_question: nominativeReply,
              known_slots: {
                UTC_time: compiledPayload.scheduledFor ?? null,
                local_label: compiledPayload.localLabel ?? null,
                instruction_hint: null,
                replace_target_label: null,
              },
            },
          };
        } catch (_error) {
          // best-effort: le blocage honnête historique reste le filet.
        }
      }
      // P9-C (alex-hard24 R1-B01): « décale-le à jeudi, même heure » — le
      // créneau du nouveau rappel se compose du JOUR NOMMÉ du message et de
      // l'HEURE HÉRITÉE de la cible (invariance d'heure demandée
      // explicitement). Exception EXPLICITE au verrou P6-V « l'heure de la
      // cible ne complète jamais le nouveau »: ce verrou vise les textes à
      // deux heures où la mauvaise gagne; ici l'utilisateur demande
      // littéralement la même heure. Sans cette composition, le reschedule
      // vers un jour nommé restait sans scheduled_for → create nu → bloqué
      // duplicate → « bien décalé à jeudi » confabulé.
      // La composition PRIME sur un scheduledFor déjà rempli par la
      // complétion (probe P9-2 passe 3: « le rappel de 22h » remplissait
      // 22h AUJOURD'HUI — l'heure de la cible sans le jour nommé → replace
      // au même instant + « samedi » brodé) — SAUF si le message porte une
      // heure chiffrée étrangère à celle de la cible (là, l'heure explicite
      // du user gagne, « même heure » est une référence lâche).
      if (uniqueRescheduleTarget) {
        try {
          const combinedRescheduleText =
            `${args.message} ${canonicalRawTextFromTurnFrame(args.turnFrame) ?? ""}`
              .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
          const sameHourInvariance = /\b(a la )?meme heure\b/.test(
            combinedRescheduleText,
          );
          // Le jour se lit dans la CLAUSE de déplacement (when_hint, puis le
          // segment après le verbe) — jamais le premier mot-jour du message
          // (« finalement DEMAIN c'est mort… décale-le à JEUDI » doit lire
          // jeudi, pas demain).
          const whenHintDaySource = String(
            payloadText(createEffect, "when_hint") ?? "",
          ).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
          const afterVerbDaySource = combinedRescheduleText
            .split(
              /\b(?:mets|remets|remet|decale|repousse|replanifie|reprogramme|avance)\b/,
            ).slice(1).join(" ");
          const dayRegex =
            /\b(apres[- ]demain|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/;
          const namedDayToken = whenHintDaySource.match(dayRegex)?.[1] ??
            afterVerbDaySource.match(dayRegex)?.[1] ?? null;
          if (sameHourInvariance && namedDayToken) {
            const tctxSameHour = await getUserTimeContext({
              supabase: args.supabase,
              userId: args.userId,
              now,
            });
            const inheritedHHMM = localHHMMForScheduledFor(
              String(uniqueRescheduleTarget.scheduled_for ?? ""),
              tctxSameHour.user_timezone || "Europe/Paris",
            );
            // Heures chiffrées du message étrangères à celle de la cible:
            // s'il y en a, l'utilisateur a donné une heure explicite — la
            // composition ne l'écrase pas.
            const foreignExplicitHours = [
              ...combinedRescheduleText.matchAll(
                /\b(\d{1,2})\s?h\s?(\d{2})?\b/g,
              ),
            ].map((m) =>
              `${m[1].padStart(2, "0")}:${(m[2] ?? "00").padEnd(2, "0")}`
            ).filter((hhmm) => hhmm !== inheritedHHMM);
            const compositionEligible = !compiledPayload.scheduledFor ||
              foreignExplicitHours.length === 0;
            if (inheritedHHMM && compositionEligible) {
              // Résolution civile du jour nommé (prochaine occurrence en tz
              // user) — le parseur ne résout pas un jour de semaine nu; on
              // lui compose une DATE ABSOLUE française, sa forme sûre (le
              // fallback naïf ancrait « jeudi à 22h » sur AUJOURD'HUI).
              const timezoneSameHour = tctxSameHour.user_timezone ||
                "Europe/Paris";
              const weekdayFmt = new Intl.DateTimeFormat("fr-FR", {
                timeZone: timezoneSameHour,
                weekday: "long",
              });
              const civilFmt = new Intl.DateTimeFormat("fr-CA", {
                timeZone: timezoneSameHour,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              });
              const monthNames = [
                "janvier", "février", "mars", "avril", "mai", "juin",
                "juillet", "août", "septembre", "octobre", "novembre",
                "décembre",
              ];
              let composedAbsolute: string | null = null;
              const nowMsSameHour = new Date(tctxSameHour.now_utc).getTime();
              for (let dayOffset = 1; dayOffset <= 14; dayOffset += 1) {
                const candidate = new Date(
                  nowMsSameHour + dayOffset * 86_400_000,
                );
                const matchesToken = namedDayToken === "demain"
                  ? dayOffset === 1
                  : namedDayToken.startsWith("apres")
                  ? dayOffset === 2
                  : weekdayFmt.format(candidate).toLowerCase() ===
                    namedDayToken;
                if (!matchesToken) continue;
                const civil = civilFmt.format(candidate);
                const [yearStr, monthStr, dayStr] = civil.split("-");
                composedAbsolute = `rappelle-moi le ${Number(dayStr)} ${
                  monthNames[Number(monthStr) - 1]
                } ${yearStr} à ${
                  inheritedHHMM.replace(":", "h")
                } de t'en occuper`;
                break;
              }
              const parsedSameHour = composedAbsolute
                ? (parseOneShotReminderRequest({
                  message: composedAbsolute,
                  timezone: timezoneSameHour,
                  nowIso: tctxSameHour.now_utc,
                })?.scheduledFor ??
                  parseScheduledForFromMessage({
                    message: composedAbsolute,
                    timezone: timezoneSameHour,
                    nowIso: tctxSameHour.now_utc,
                  }))
                : null;
              if (parsedSameHour) {
                compiledPayload = {
                  ...compiledPayload,
                  scheduledFor: parsedSameHour,
                  localLabel: formatOneShotLocalLabel(
                    parsedSameHour,
                    tctxSameHour.user_timezone,
                  ),
                };
              }
            }
          }
        } catch (_error) {
          // best-effort: blocage honnête historique si la composition échoue.
        }
      }
      // P12-A (alex-untested24 R1-B05): décalage RELATIF « avance/recule/
      // décale d'une heure » — le delta s'applique à l'heure de la CIBLE,
      // jamais à maintenant (le when_hint « dans une heure » émis par le
      // dispatcher re-résolvait now+1h, direction inversée en prime: rappel
      // de 17h « avancé » à 10h46). « avance » = plus tôt ; « recule/
      // repousse/décale de » = plus tard. Cette composition PRIME sur un
      // scheduledFor de complétion (la source du now+1h). Un résultat passé
      // n'est pas committable → scheduledFor annulé (clarify honnête).
      if (uniqueRescheduleTarget) {
        try {
          const combinedDeltaText =
            `${args.message} ${canonicalRawTextFromTurnFrame(args.turnFrame) ?? ""}`
              .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
          const deltaMatch = combinedDeltaText.match(
            /\b(avance|recule|repousse|decale)\b[^.!?]{0,60}?\bd(?:e\s+|['’]\s?)(une|deux|trois|\d{1,3})\s+(demi-?\s?heures?|heures?|minutes?)\b/,
          );
          if (deltaMatch) {
            const numberWords: Record<string, number> = {
              une: 1,
              deux: 2,
              trois: 3,
            };
            const amount = numberWords[deltaMatch[2]] ??
              Number(deltaMatch[2]);
            const unit = deltaMatch[3];
            const deltaMinutes = /demi/.test(unit)
              ? 30
              : /minute/.test(unit)
              ? amount
              : amount * 60;
            const direction = deltaMatch[1] === "avance" ? -1 : 1;
            const targetMs = new Date(
              String(uniqueRescheduleTarget.scheduled_for ?? ""),
            ).getTime();
            if (
              Number.isFinite(targetMs) && Number.isFinite(deltaMinutes) &&
              deltaMinutes > 0
            ) {
              const shiftedMs = targetMs + direction * deltaMinutes * 60_000;
              if (shiftedMs > now.getTime() + 30_000) {
                const tctxDelta = await getUserTimeContext({
                  supabase: args.supabase,
                  userId: args.userId,
                  now,
                });
                const shiftedIso = new Date(shiftedMs).toISOString();
                compiledPayload = {
                  ...compiledPayload,
                  scheduledFor: shiftedIso,
                  localLabel: formatOneShotLocalLabel(
                    shiftedIso,
                    tctxDelta.user_timezone || "Europe/Paris",
                  ),
                  parseSource: "local_parser",
                };
              } else {
                compiledPayload = { ...compiledPayload, scheduledFor: null };
              }
            }
          }
        } catch (_error) {
          // best-effort: blocage honnête historique si le calcul échoue.
        }
      }
      if (uniqueRescheduleTarget && compiledPayload.scheduledFor) {
        try {
          const tctxReschedule = await getUserTimeContext({
            supabase: args.supabase,
            userId: args.userId,
            now,
          });
          const targetHHMM = localHHMMForScheduledFor(
            String(uniqueRescheduleTarget.scheduled_for ?? ""),
            tctxReschedule.user_timezone || "Europe/Paris",
          );
          createEffect = {
            ...createEffect!,
            payload_hint: {
              ...((createEffect!.payload_hint ?? {}) as Record<
                string,
                unknown
              >),
              intent: "replace",
              replace_target_label: targetHHMM,
            },
          };
          // P6-V (harness r5g-s2 T3) — INVARIANCE DE CONTENU: un reschedule
          // déplace l'HEURE, jamais le texte (sémantique P6-H actée). Le
          // contenu du nouveau rappel s'hérite TOUJOURS du pending déplacé
          // (P3-F, résolu par replace_target_label) — jamais l'écho de
          // commande ni un libellé recalculé.
          compiledPayload = { ...compiledPayload, instruction: null };
        } catch (_error) {
          // Lecture timezone indisponible: blocage honnête historique.
        }
      }
      if (payloadText(createEffect, "intent") !== "replace") {
        // P12-D6 (alex-untested24 R1-B06): le blocage honnête reste pour une
        // cible NON résoluble — mais sa reply ne dicte plus la formule
        // circulaire « annule-le et remets-le à [heure] » (guidance V1
        // résiduelle qui tournait en rond): elle demande la CIBLE avec
        // l'inventaire nominatif, et un pending replace s'arme pour que la
        // réponse (contenu ou heure) exécute le déplacement via la fusion
        // D1/D5. Condition de désarmement: cible résoluble + heure
        // haute-confiance n'atteignent plus ce blocage (replace atomique
        // P6-H exécuté en amont sur tous les chemins d'admission).
        let inventoryLines: string[] = [];
        try {
          const tctxInventory = await getUserTimeContext({
            supabase: args.supabase,
            userId: args.userId,
            now,
          });
          const timezoneInventory = tctxInventory.user_timezone ||
            "Europe/Paris";
          inventoryLines = (pendingRows ?? []).map((row) => {
            const rowInstruction = String(
              (row?.message_payload as Record<string, unknown> | undefined)
                ?.reminder_instruction ?? "",
            ).trim() || "rappel ponctuel";
            return `« ${rowInstruction} » à ${
              localHHMMForScheduledFor(
                String(row?.scheduled_for ?? ""),
                timezoneInventory,
              ) ?? "?"
            }`;
          });
        } catch (_error) {
          // Lecture best-effort: sans inventaire, la question reste honnête.
        }
        const missingNewTime = !compiledPayload.scheduledFor;
        const blockedReply = inventoryLines.length > 0
          ? `Je ne suis pas sûre du rappel à déplacer. En attente : ${
            inventoryLines.join(" ; ")
          }. Dis-moi lequel (son contenu ou son heure)${
            missingNewTime ? " et la nouvelle heure" : ""
          } — rien n'a été changé pour l'instant.`
          : "Je ne peux pas déplacer ce rappel tel quel — dis-moi quel rappel tu vises et la nouvelle heure. Rien n'a été changé pour l'instant.";
        return {
          ...baseDirectEffectResult({
            detected: true,
            intent: "create",
            status: "blocked",
            reason_code: "reschedule_not_supported",
            reply: blockedReply,
          }),
          requested_effects: [{ type: effectType, reason_code: "reschedule" }],
          blocked_effects: [{
            type: effectType,
            reason_code: "reschedule_not_supported",
          }],
          pending_clarification: {
            intent: "replace",
            reason_code: "replace_target_ambiguous",
            clarify_question: blockedReply,
            known_slots: {
              UTC_time: compiledPayload.scheduledFor ?? null,
              local_label: compiledPayload.localLabel ?? null,
              instruction_hint: null,
              replace_target_label: null,
            },
          },
        };
      }
    }
  }
  // R-1 (paul-triflow R1-B01, alex-multiflow B1 — BF-STATUS-01): question de
  // verification / liste / recap sur les rappels ponctuels. Le dispatcher
  // ORIENTE (intent='status'), le runtime LIT la verite DB, l'outcome DECRIT,
  // le composeur CONFIRME. Zero write. Sans cette lane, une question de
  // statut atteignait le composeur sans aucune projection et il niait des
  // rappels pourtant committes et pending.
  // P5-B (rose-hard17 T14-T15): une question de vérification émise en
  // intent=cancel par le dispatcher entre AUSSI dans cette lane de lecture —
  // jamais dans l'exécution du cancel (qui a détruit le rappel de la sœur via
  // le repli pending-unique, puis affirmé qu'il restait actif).
  const verificationQuestionOverridesCancel =
    payloadText(createEffect, "intent") === "cancel" &&
    isOneShotReminderVerificationQuestion(args.message);
  if (
    payloadText(createEffect, "intent") === "status" ||
    verificationQuestionOverridesCancel
  ) {
    try {
      const pendingRows = await readPendingOneShotReminderRows({
        supabase: args.supabase,
        userId: args.userId,
        limit: 12,
      });
      // Timezone: la verite profil (comme la lane cancel) — args.userTimezone
      // peut porter un fallback UTC selon le canal, ce qui ferait rendre des
      // heures UTC a l'utilisateur (round2 S1: « 05:30 » au lieu de 07:30).
      const tctx = await getUserTimeContext({
        supabase: args.supabase,
        userId: args.userId,
        now,
      });
      const timezone = tctx.user_timezone?.trim() ||
        args.userTimezone?.trim() || "Europe/Paris";
      const lines = pendingRows.map((row) => {
        const payload = (row.message_payload ?? {}) as Record<string, unknown>;
        const instruction =
          String(payload.reminder_instruction ?? "").trim() ||
          "rappel ponctuel";
        return `${
          formatOneShotLocalLabel(String(row.scheduled_for ?? ""), timezone)
        } — ${instruction}`;
      });
      // P5-B: la vérité inclut les rappels RÉCENTS non-pending (48h) — une
      // vérification « t'es sûre que X est annulé ? » se répond depuis le
      // statut réel de X (cancelled/delivered), pas seulement la liste des
      // pending (qui faisait affirmer « actif » un rappel annulé, rose T15).
      let recentLines: string[] = [];
      try {
        const sinceIso = new Date(
          (now ?? new Date()).getTime() - 48 * 3_600_000,
        ).toISOString();
        const recentRows = await readRecentOneShotReminderRows({
          supabase: args.supabase,
          userId: args.userId,
          sinceIso,
        });
        recentLines = (recentRows as any[])
          .filter((row) => String(row?.status ?? "") !== "pending")
          .slice(0, 8)
          .map((row) => {
            const payload = (row?.message_payload ?? {}) as Record<
              string,
              unknown
            >;
            const instruction =
              String(payload.reminder_instruction ?? "").trim() ||
              "rappel ponctuel";
            const statusLabel = String(row?.status ?? "") === "cancelled"
              ? "annulé"
              : "déjà envoyé";
            return `${
              formatOneShotLocalLabel(
                String(row?.scheduled_for ?? ""),
                timezone,
              )
            } — ${instruction} (${statusLabel})`;
          });
      } catch (_error) {
        // Lecture best-effort: la projection pending reste la base.
      }
      const summary = (lines.length === 0
        ? "Aucun rappel ponctuel en attente en ce moment."
        : `Rappel(s) ponctuel(s) en attente (${lines.length}) : ${
          lines.join(" ; ")
        }.`) + (recentLines.length > 0
          ? ` Récents non-actifs : ${recentLines.join(" ; ")}.`
          : "");
      const reply = verificationQuestionOverridesCancel
        // Vérification: réponse neutre et factuelle (pas de « Oui — c'est
        // bien enregistré » quand la question porte sur une annulation).
        ? `Voilà l'état réel : en attente — ${
          lines.length > 0 ? lines.join(" ; ") : "aucun"
        }${
          recentLines.length > 0
            ? ` ; récents non-actifs — ${recentLines.join(" ; ")}`
            : ""
        }. Rien n'a été modifié.`
        : lines.length === 0
        ? "Tu n'as aucun rappel ponctuel en attente pour le moment."
        : lines.length === 1
        ? `Oui — c'est bien enregistré : ${lines[0]}.`
        : `Oui — tu as ${lines.length} rappels ponctuels en attente : ${
          lines.join(" ; ")
        }.`;
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "status",
          status: "success",
          reason_code: "status_report",
          reply,
        }),
        executed_tools: ["read_one_shot_reminder_status"],
        requested_effects: [{
          type: "one_shot_reminder_status",
          reason_code: "status",
        }],
        allowed_effects: [{
          type: "one_shot_reminder_status",
          reason_code: "status",
        }],
        committed_effects: [{
          type: "one_shot_reminder_status",
          // La verite lisible par le composeur voyage dans target_title
          // (outcomeTargetFromEffect) — donnees, pas regles.
          target_title: summary,
          pending_count: lines.length,
          pending_labels: lines,
        }],
      };
    } catch (_error) {
      // Lecture indisponible: on ne NIE JAMAIS sur une projection absente —
      // le composeur dit qu'il ne peut pas verifier la, jamais « aucun ».
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "status",
          status: "failed",
          reason_code: "status_read_failed",
          reply:
            "Je n'arrive pas à vérifier tes rappels là tout de suite — le plus sûr est de regarder dans l'app. (Ça ne veut pas dire qu'il n'y en a pas.)",
        }),
        requested_effects: [{
          type: "one_shot_reminder_status",
          reason_code: "status",
        }],
        blocked_effects: [{
          type: "one_shot_reminder_status",
          reason_code: "status_read_failed",
        }],
      };
    }
  }
  // Replace explicite (eva-g16 B01) : « annule-le et remets-le a 23h » est la
  // composition de deux operations chat SUPPORTEES (cancel + create),
  // executee en un tour. Distinct du reschedule implicite (« mets-le plutot a
  // 23h »), qui reste bloque-honnete (arbitrage V1: pas d'edition en place).
  // Regle de securite anti-doublon: le create ne part QUE si le cancel a
  // reussi, ou s'il n'y avait rien a annuler. Cible du cancel = payload
  // replace_target_label (heure locale de l'ANCIEN rappel) sinon le pending
  // unique; plusieurs pendings sans cible → clarify, zero write.
  let replaceCancelCommitted:
    | OneShotReminderCommittedEffect[]
    | null = null;
  let replaceCancelledLabel: string | null = null;
  // P12-D3/D4: le replace a perdu le droit de CANCEL ce tour (marqueur
  // additif explicite, ou entité à jour nommé sans pending ce jour-là) —
  // create assumé, rendu « c'est un ajout » au lieu de « rien trouvé ».
  let replaceCancelForbidden = false;
  // Garde structurelle anti-variance (round6 S2): un intent='cancel' qui
  // porte un payload de creation COMPLET (UTC_time + local_label +
  // instruction) est contradictoire — le contrat dit qu'un cancel pur ne
  // remplit jamais ces champs. Deux lectures possibles (replace mal etiquete,
  // ou cancel sur-rempli): on ne DEVINE pas, on clarifie — zero write, et le
  // tour suivant re-arme l'effet complet (3g). Executer un replace ici
  // creerait un rappel fantome si c'etait un cancel sur-rempli (cf. test F4).
  // Coherence d'heure entre deux champs DISPATCHER (payload-quality, comme
  // looksTemporalLabel): un vrai « nouveau rappel » a un local_label dont
  // l'heure se retrouve dans when_hint; un cancel pur sur-rempli garde un
  // local_label residuel incoherent avec sa cible — il reste un cancel.
  const newTimeIsCoherent = (() => {
    const label = String(compiledPayload.localLabel ?? "");
    const hint = String(canonicalWhenHintFromTurnFrame(args.turnFrame) ?? "")
      .toLowerCase();
    const hourMatch = label.match(/(\d{1,2})/);
    if (!hourMatch || !hint) return false;
    const hour = String(Number(hourMatch[1]));
    return new RegExp(`(^|\\D)0?${hour}\\s*(h|:|heure)`).test(hint);
  })();
  const cancelCarriesFullCreatePayload =
    payloadText(createEffect, "intent") === "cancel" &&
    newTimeIsCoherent &&
    Boolean(
      compiledPayload.scheduledFor && compiledPayload.localLabel &&
        compiledPayload.instruction,
    );
  if (cancelCarriesFullCreatePayload) {
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: "cancel",
        status: "needs_clarify",
        reason_code: "cancel_or_replace_ambiguous",
        reply:
          `Je veux être sûre de bien faire : tu veux annuler le rappel existant ET en poser un nouveau (${compiledPayload.localLabel} — ${compiledPayload.instruction}) ? Dis-moi oui et je fais les deux, ou précise si tu veux seulement annuler.`,
      }),
      requested_effects: [{ type: effectType, reason_code: "cancel" }],
      blocked_effects: [{
        type: effectType,
        reason_code: "cancel_or_replace_ambiguous",
      }],
    };
  }
  if (payloadText(createEffect, "intent") === "replace") {
    // P3-F (nina-global18 T12): HÉRITAGE D'INSTRUCTION — « annule X et
    // recrée-le à H, même texte » arrivait avec une instruction absente ou
    // une expression de référence (« le rappel de l'eau »). AVANT toute
    // mutation (l'atomicité l'exige), l'instruction manquante s'hérite du
    // pending ciblé (même résolution d'ancre que l'héritage de jour P2-3a).
    // P6-A (nina-untested21 R1-B01): une ANAPHORE D'INVARIANCE (« même
    // chose », « pareil », « idem ») compte comme instruction ABSENTE — la
    // prendre littéralement délivrait un rappel « à propos de: même chose ».
    // P10-E (alex-hard24 R1-B02, nina-hard24 R1-B03): une RÉFÉRENCE D'ENTITÉ
    // (« celui du midi », « le rappel des en-cas ») vaut instruction ABSENTE
    // — jamais un contenu durable. Elle porte en revanche un éventuel
    // CRÉNEAU NOMINAL qui aide à résoudre la cible.
    const instructionIsEntityReference = isReminderEntityReference(
      compiledPayload.instruction,
    );
    // P12-D7 (alex-untested24 R1-B07): candidats de MÊME contenu quand ≥2 —
    // portés hors du try pour rendre la clarify nominative (avec les HEURES).
    let replaceSameContentCandidates:
      | Array<{ instruction: string; hhmm: string | null }>
      | null = null;
    if (
      !compiledPayload.instruction ||
      isReminderInstructionInvarianceAnaphora(compiledPayload.instruction) ||
      instructionIsEntityReference
    ) {
      try {
        const tctxInherit = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        const timezone = tctxInherit.user_timezone || "Europe/Paris";
        const pendings = await readPendingOneShotReminderRows({
          supabase: args.supabase,
          userId: args.userId,
        });
        const targetHHMM = extractTargetHHMMFromMessage(
          payloadText(createEffect, "replace_target_label") ?? "",
        );
        // P10-E: résolution par créneau nominal — « celui du midi » avec
        // plusieurs pendings cible l'UNIQUE pending de la fenêtre 11-15h
        // (jamais un choix au hasard: 0 ou ≥2 candidats = pas de cible).
        const daypart = instructionIsEntityReference
          ? daypartWindowFromReference(compiledPayload.instruction)
          : null;
        const daypartRows = daypart
          ? pendings.filter((row) => {
            const hhmm = localHHMMForScheduledFor(
              String(row?.scheduled_for ?? ""),
              timezone,
            );
            const hour = Number(String(hhmm ?? "").split(":")[0]);
            return Number.isFinite(hour) && hour >= daypart.startHour &&
              hour < daypart.endHour;
          })
          : [];
        // P12-D7 (alex-untested24 R1-B07, principe P5-E): cible par ÉVIDENCE
        // NOMMÉE — le contenu discriminant (référence d'entité « le rappel
        // des courses » ou message) résout la cible SANS exiger son heure
        // actuelle: un unique pending recouvert = cible. Condition de
        // désarmement: ≥2 pendings de même contenu ⇒ clarify nominative avec
        // leurs heures (jamais une consigne circulaire), jamais un choix.
        const contentSource = `${compiledPayload.instruction ?? ""} ${
          args.message
        }`;
        const contentMatches = pendings
          .map((row) => ({
            row,
            score: messageContentOverlapScore(
              contentSource,
              String(
                (row?.message_payload as Record<string, unknown> | undefined)
                  ?.reminder_instruction ?? "",
              ),
            ),
          }))
          .filter((entry) => entry.score > 0);
        const targetRow = targetHHMM
          ? pendings.find((row) =>
            localHHMMForScheduledFor(
              String(row?.scheduled_for ?? ""),
              timezone,
            ) === targetHHMM
          )
          : daypartRows.length === 1
          ? daypartRows[0]
          : contentMatches.length === 1
          ? contentMatches[0].row
          : pendings.length === 1
          ? pendings[0]
          : null;
        if (!targetRow && contentMatches.length >= 2) {
          replaceSameContentCandidates = contentMatches.map((entry) => ({
            instruction: String(
              (entry.row?.message_payload as
                | Record<string, unknown>
                | undefined)?.reminder_instruction ?? "",
            ).trim() || "rappel ponctuel",
            hhmm: localHHMMForScheduledFor(
              String(entry.row?.scheduled_for ?? ""),
              timezone,
            ),
          }));
        }
        // P12-D4 (nina-p10reval R1-B03a): l'entité porte un JOUR NOMMÉ qui
        // ne matche PAS le jour de la cible résolue ⇒ l'instruction s'hérite
        // (même série) mais le CANCEL est interdit — create pur, le pending
        // de l'autre jour reste intact. Condition de désarmement: jour de la
        // cible = jour nommé ⇒ replace historique.
        const replaceEntityDay = entityAnchoredDayToken(
          `${compiledPayload.instruction ?? ""} ${args.message}`,
        );
        let entityDayProtects = false;
        if (replaceEntityDay && targetRow) {
          const civilOf = (iso: string) => {
            try {
              return new Intl.DateTimeFormat("fr-CA", {
                timeZone: timezone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(new Date(iso));
            } catch (_error) {
              return "";
            }
          };
          const targetIso = String(targetRow?.scheduled_for ?? "");
          const dayMatches =
            replaceEntityDay === "demain" ||
              replaceEntityDay.startsWith("apres")
              ? civilOf(targetIso) === civilOf(
                new Date(
                  new Date(tctxInherit.now_utc).getTime() +
                    (replaceEntityDay === "demain" ? 1 : 2) * 86_400_000,
                ).toISOString(),
              )
              : localWeekdayName(targetIso, timezone) === replaceEntityDay;
          if (!dayMatches) {
            entityDayProtects = true;
            replaceCancelForbidden = true;
            allowDuplicateForTurn = true;
          }
        }
        const inheritedInstruction = String(
          (targetRow?.message_payload as Record<string, unknown> | undefined)
            ?.reminder_instruction ?? "",
        ).trim();
        if (inheritedInstruction) {
          compiledPayload = {
            ...compiledPayload,
            instruction: inheritedInstruction,
          };
          // P10-E: la cible résolue par créneau nominal devient l'ancre du
          // cancel du replace (sans elle, le cancel ne sait pas qui viser
          // et l'original survivrait à côté du nouveau — le doublon d'alex).
          // P12-D4: jamais d'ancre quand le jour nommé protège la cible.
          if (!targetHHMM && targetRow && !entityDayProtects) {
            const resolvedHHMM = localHHMMForScheduledFor(
              String(targetRow?.scheduled_for ?? ""),
              timezone,
            );
            if (resolvedHHMM) {
              createEffect = {
                ...createEffect!,
                payload_hint: {
                  ...((createEffect!.payload_hint ?? {}) as Record<
                    string,
                    unknown
                  >),
                  replace_target_label: resolvedHHMM,
                },
              };
            }
          }
        } else if (
          isReminderInstructionInvarianceAnaphora(
            compiledPayload.instruction,
          ) || instructionIsEntityReference
        ) {
          // P6-A/P10-E: anaphore ou référence sans cible résoluble →
          // l'instruction tombe, le clarify demande le contenu — on ne
          // committe JAMAIS « même chose »/« celui du midi » littéral.
          compiledPayload = { ...compiledPayload, instruction: null };
        }
      } catch (_error) {
        // best-effort: le clarify replace_payload_incomplete reste le filet.
      }
    }
    // P12-D7 (alex-untested24 R1-B07): deux pendings de MÊME contenu ⇒
    // clarify nominative avec les HEURES des candidats — jamais la consigne
    // circulaire « donne-moi son heure actuelle » sans les heures.
    if (replaceSameContentCandidates) {
      const candidateLine = replaceSameContentCandidates
        .map((entry) => `celui de ${entry.hhmm ?? "?"}`)
        .join(" ou ");
      const sameContentReply = `Tu as ${replaceSameContentCandidates.length} rappels « ${
        replaceSameContentCandidates[0].instruction
      } » en attente : ${candidateLine} — lequel je remplace ? Rien n'a été changé.`;
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "replace",
          status: "needs_clarify",
          reason_code: "replace_target_ambiguous",
          reply: sameContentReply,
        }),
        requested_effects: [{ type: effectType, reason_code: "replace" }],
        blocked_effects: [{
          type: effectType,
          reason_code: "replace_target_ambiguous",
        }],
        pending_clarification: {
          intent: "replace",
          reason_code: "replace_target_ambiguous",
          clarify_question: sameContentReply,
          known_slots: {
            UTC_time: compiledPayload.scheduledFor ?? null,
            local_label: compiledPayload.localLabel ?? null,
            instruction_hint: compiledPayload.instruction ?? null,
            replace_target_label: null,
          },
        },
      };
    }
    // P12-D8a (paul-p9reval R1-B03): héritage étendu aux CANCELLED récents —
    // un replace émis après un cancel (« remets-moi celui des poubelles »)
    // hérite l'instruction de la ligne annulée quand l'entité est unique;
    // AUCUNE ancre de cancel n'est posée (issue non destructive, P9-A).
    if (!compiledPayload.instruction) {
      try {
        const sinceIso = new Date(now.getTime() - 24 * 3_600_000)
          .toISOString();
        const recentRows = await readRecentOneShotReminderRows({
          supabase: args.supabase,
          userId: args.userId,
          sinceIso,
        });
        const cancelledMatches = (recentRows as Array<Record<string, unknown>>)
          .filter((row) => String(row?.status ?? "") === "cancelled")
          .map((row) =>
            String(
              (row?.message_payload as Record<string, unknown> | undefined)
                ?.reminder_instruction ?? "",
            ).trim()
          )
          .filter((instruction) =>
            instruction &&
            messageContentOverlapScore(args.message, instruction) > 0
          );
        const distinct = [
          ...new Set(
            cancelledMatches.map((instruction) =>
              instruction.normalize("NFD").replace(/\p{Diacritic}/gu, "")
                .toLowerCase()
            ),
          ),
        ];
        if (cancelledMatches.length > 0 && distinct.length === 1) {
          compiledPayload = {
            ...compiledPayload,
            instruction: cancelledMatches[0],
          };
        }
      } catch (_error) {
        // Lecture best-effort: le clarify replace_payload_incomplete reste.
      }
    }
    // TOUT-OU-RIEN (round12 S2): le payload du NOUVEAU rappel se valide AVANT
    // d'annuler l'ancien — un cancel suivi d'un create impossible laisserait
    // l'utilisateur sans aucun rappel (demi-replace, pire que rien).
    if (
      !compiledPayload.scheduledFor || !compiledPayload.localLabel ||
      !compiledPayload.instruction
    ) {
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "replace",
          status: "needs_clarify",
          reason_code: "replace_payload_incomplete",
          reply: !compiledPayload.scheduledFor
            ? "Pour remplacer ce rappel il me manque l'heure exacte du nouveau — rien n'a été annulé pour l'instant."
            : "Pour remplacer ce rappel il me manque ce qu'il doit rappeler — rien n'a été annulé pour l'instant.",
        }),
        requested_effects: [{ type: effectType, reason_code: "replace" }],
        blocked_effects: [{
          type: effectType,
          reason_code: "replace_payload_incomplete",
        }],
        missing_slots: !compiledPayload.scheduledFor
          ? ["scheduled_for"]
          : ["reminder_instruction"],
        pending_clarification: {
          intent: "replace",
          reason_code: "replace_payload_incomplete",
          clarify_question: !compiledPayload.scheduledFor
            ? "Pour remplacer ce rappel il me manque l'heure exacte du nouveau."
            : "Pour remplacer ce rappel il me manque ce qu'il doit rappeler.",
          known_slots: {
            UTC_time: compiledPayload.scheduledFor ?? null,
            local_label: compiledPayload.localLabel ?? null,
            instruction_hint: compiledPayload.instruction ?? null,
            replace_target_label:
              payloadText(createEffect, "replace_target_label") ?? null,
          },
        },
      };
    }
    // P2-3a (alex-untested R1-B02): admission TEMPORELLE avant toute
    // mutation — le tout-ou-rien validait la COMPLÉTUDE du payload, pas son
    // ADMISSIBILITÉ : « annule celui de 21h50 et remets-en un à 21h15 » à
    // 23h17 résolvait 21h15 au jour courant (passé) → cancel committé PUIS
    // create bloqué past_time = user sans plus aucun rappel (demi-replace).
    // Une heure nue dans un replace hérite du JOUR du rappel remplacé
    // (l'ancre naturelle) ; toujours passée après réparation → clarify,
    // RIEN n'est annulé.
    // P4-B (alex-global19 R1-B02, volet ancre): l'héritage de jour vaut PAR
    // DÉFAUT dès que la nouvelle heure ne porte AUCUN marqueur de jour —
    // « remets-en un à 21h » sur un rappel de demain vise demain, pas
    // aujourd'hui, même quand 21h n'est pas encore passé.
    {
      const newMs = new Date(compiledPayload.scheduledFor).getTime();
      // Le marqueur de jour se cherche dans l'expression USER (when_hint) —
      // jamais dans un label recalculé (il porte toujours un nom de mois).
      const whenHintForDay = payloadText(createEffect, "when_hint") ?? "";
      const newTimeDayText = whenHintForDay.trim() ||
        (compiledPayload.localLabel ?? "");
      if (
        Number.isFinite(newMs) &&
        (newMs <= now.getTime() + 30_000 ||
          !hasAnyExplicitDayToken(newTimeDayText))
      ) {
        try {
          const tctxAnchor = await getUserTimeContext({
            supabase: args.supabase,
            userId: args.userId,
            now,
          });
          const timezone = tctxAnchor.user_timezone || "Europe/Paris";
          const pendings = await readPendingOneShotReminderRows({
            supabase: args.supabase,
            userId: args.userId,
          });
          const targetHHMM = extractTargetHHMMFromMessage(
            payloadText(createEffect, "replace_target_label") ?? "",
          );
          const anchorRow = targetHHMM
            ? pendings.find((row) =>
              localHHMMForScheduledFor(
                String(row?.scheduled_for ?? ""),
                timezone,
              ) === targetHHMM
            )
            : pendings.length === 1
            ? pendings[0]
            : null;
          const anchorIso = String(anchorRow?.scheduled_for ?? "");
          if (anchorIso) {
            const localDayUtcMs = (iso: string) => {
              const day = new Intl.DateTimeFormat("en-CA", {
                timeZone: timezone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(new Date(iso));
              return Date.parse(`${day}T00:00:00Z`);
            };
            // Décalage en jours civils LOCAUX (préserve l'heure locale du
            // nouveau, hors bascule DST — re-vérifié futur ci-dessous).
            const dayDeltaMs = localDayUtcMs(anchorIso) -
              localDayUtcMs(String(compiledPayload.scheduledFor));
            if (dayDeltaMs > 0) {
              const repaired = new Date(newMs + dayDeltaMs).toISOString();
              if (new Date(repaired).getTime() > now.getTime() + 30_000) {
                compiledPayload = {
                  ...compiledPayload,
                  scheduledFor: repaired,
                  // Le label suit le jour hérité — un label resté sur le
                  // jour pré-décalage mentirait au rendu (leçon eva B02).
                  localLabel: formatOneShotLocalLabel(repaired, timezone),
                };
              }
            }
          }
        } catch (_error) {
          // best-effort: le clarify ci-dessous reste le filet.
        }
        if (
          new Date(String(compiledPayload.scheduledFor)).getTime() <=
            now.getTime() + 30_000
        ) {
          return {
            ...baseDirectEffectResult({
              detected: true,
              intent: "replace",
              status: "needs_clarify",
              reason_code: "replace_past_time",
              reply:
                "L'heure demandée pour le nouveau rappel est déjà passée aujourd'hui — du coup rien n'a été annulé ni créé. Tu le veux pour quel jour ?",
            }),
            requested_effects: [{ type: effectType, reason_code: "replace" }],
            blocked_effects: [{
              type: effectType,
              reason_code: "replace_past_time",
            }],
            missing_slots: ["scheduled_for"],
            pending_clarification: {
              intent: "replace",
              reason_code: "replace_past_time",
              clarify_question:
                "L'heure demandée est déjà passée aujourd'hui — tu veux le nouveau rappel pour quel jour ?",
              known_slots: {
                UTC_time: null,
                local_label: compiledPayload.localLabel ?? null,
                instruction_hint: compiledPayload.instruction ?? null,
                replace_target_label:
                  payloadText(createEffect, "replace_target_label") ?? null,
              },
            },
          };
        }
      }
    }
    // P4-C (paul-p3verify R1-B03, probes P4-5 ×2): le CANCEL du replace ne
    // part que vers une cible qui CORRESPOND. Deux dérives observées:
    // (a) « remets-moi le rappel des pâtes » sans heure cible → le repli
    // « pending unique » annulait le kiné ; (b) le dispatcher met l'heure du
    // NOUVEAU rappel dans replace_target_label (18h) → aucun pending à cette
    // heure → même repli, même kiné annulé. Règle: une heure qui matche
    // RÉELLEMENT un pending autorise le cancel (ciblage explicite) ; sinon
    // le repli unique exige le recouvrement d'instruction — à défaut, zéro
    // cancel, le create part seul (chemin « rien à remplacer »).
    let replaceTargetsUnrelatedReminder = false;
    if (compiledPayload.instruction) {
      try {
        const pendingsForMatch = await readPendingOneShotReminderRows({
          supabase: args.supabase,
          userId: args.userId,
        });
        const tctxGuard = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        const guardTimezone = tctxGuard.user_timezone || "Europe/Paris";
        const targetHHMM = extractTargetHHMMFromMessage(
          payloadText(createEffect, "replace_target_label") ?? "",
        );
        const rowByHour = targetHHMM
          ? pendingsForMatch.find((row) =>
            localHHMMForScheduledFor(
              String(row?.scheduled_for ?? ""),
              guardTimezone,
            ) === targetHHMM
          )
          : null;
        const fallbackRow = !rowByHour && pendingsForMatch.length === 1
          ? pendingsForMatch[0]
          : null;
        if (
          !rowByHour && fallbackRow &&
          oneShotInstructionTokens(compiledPayload.instruction).size > 0 &&
          !instructionTokensOverlap(
            compiledPayload.instruction,
            String(
              (fallbackRow?.message_payload as
                | Record<string, unknown>
                | undefined)?.reminder_instruction ?? "",
            ),
          )
        ) {
          replaceTargetsUnrelatedReminder = true;
        }
      } catch (_error) {
        // best-effort: le chemin cancel historique reste le fallback.
      }
    }
    // P12-D3 (nina-p10reval R1-B03b): marqueur additif explicite (« rajoute…
    // et tu gardes celui de vendredi ») ⇒ le chemin replace perd le droit de
    // CANCEL — la contrainte « garde Y » protège l'existant, le create part
    // seul (doublon assumé). Condition de désarmement: pas de marqueur ⇒
    // replace historique (« décale X à jeudi » cancel+create normalement).
    if (additiveMarker) {
      replaceCancelForbidden = true;
      allowDuplicateForTurn = true;
    }
    const cancelRunner = args.cancelReminder ?? maybeCancelOneShotReminder;
    const cancelOutcome = replaceTargetsUnrelatedReminder ||
        replaceCancelForbidden
      ? { detected: true, status: "no_reminder" as const, user_message: "" }
      : await cancelRunner({
        supabase: args.supabase,
        userId: args.userId,
        message: payloadText(createEffect, "replace_target_label") ?? "",
        requestId: args.requestId,
        now,
      });
    if (cancelOutcome.detected && cancelOutcome.status === "cancelled") {
      replaceCancelledLabel = cancelOutcome.cancelled_local_labels[0] ?? null;
      // Garde anti-faux-replace: si l'heure du « nouveau » est identique a
      // celle qui vient d'etre annulee, c'etait un cancel pur (payload
      // sur-rempli) — on n'y recree RIEN, l'annulation est le resultat.
      if (compiledPayload.scheduledFor && replaceCancelledLabel) {
        try {
          const tctxReplace = await getUserTimeContext({
            supabase: args.supabase,
            userId: args.userId,
            now,
          });
          const newLocalHHMM = new Intl.DateTimeFormat("fr-FR", {
            timeZone: tctxReplace.user_timezone || "Europe/Paris",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(compiledPayload.scheduledFor));
          if (newLocalHHMM === replaceCancelledLabel) {
            return {
              ...baseDirectEffectResult({
                detected: true,
                intent: "cancel",
                status: "success",
                reason_code: "cancelled",
                reply:
                  `C'est annulé : le rappel de ${replaceCancelledLabel} ne partira pas.`,
              }),
              executed_tools: ["cancel_one_shot_reminder"],
              requested_effects: [{
                type: "cancel_one_shot_reminder",
                reason_code: "cancel",
              }],
              allowed_effects: [{
                type: "cancel_one_shot_reminder",
                reason_code: "cancel",
              }],
              committed_effects: [{
                type: "cancel_one_shot_reminder",
                ids: cancelOutcome.cancelled_ids ?? [],
                local_label: replaceCancelledLabel ?? undefined,
              }],
            };
          }
        } catch (_error) {
          // comparaison best-effort: en cas d'echec on suit le chemin replace
        }
      }
      replaceCancelCommitted = [{
        type: "cancel_one_shot_reminder",
        ids: cancelOutcome.cancelled_ids ?? [],
        local_label: replaceCancelledLabel ?? undefined,
      }];
    } else if (
      cancelOutcome.detected && cancelOutcome.status === "ambiguous_target"
    ) {
      // P12-D5/D7 (nina-p10reval R1-B06): clarify NOMINATIVE — chaque
      // candidat cité (objet + heure), jamais « donne-moi son heure
      // actuelle » sec ni « l'intitulé exact ».
      let ambiguousInventory = "";
      try {
        const tctxAmbiguous = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        const timezoneAmbiguous = tctxAmbiguous.user_timezone ||
          "Europe/Paris";
        const ambiguousRows = await readPendingOneShotReminderRows({
          supabase: args.supabase,
          userId: args.userId,
        });
        ambiguousInventory = ambiguousRows.map((row) =>
          `« ${
            String(
              (row?.message_payload as Record<string, unknown> | undefined)
                ?.reminder_instruction ?? "",
            ).trim() || "rappel ponctuel"
          } » à ${
            localHHMMForScheduledFor(
              String(row?.scheduled_for ?? ""),
              timezoneAmbiguous,
            ) ?? "?"
          }`
        ).join(" ; ");
      } catch (_error) {
        // Lecture best-effort: la question reste posée sans inventaire.
      }
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "replace",
          status: "needs_clarify",
          reason_code: "replace_target_ambiguous",
          reply: ambiguousInventory
            ? `Tu as ${cancelOutcome.pending_count} rappels en attente : ${ambiguousInventory} — lequel je remplace ?`
            : `Tu as ${cancelOutcome.pending_count} rappels en attente — lequel je remplace ? Dis-moi son contenu ou son heure.`,
        }),
        requested_effects: [{ type: effectType, reason_code: "replace" }],
        blocked_effects: [{
          type: effectType,
          reason_code: "replace_target_ambiguous",
        }],
        pending_clarification: {
          intent: "replace",
          reason_code: "replace_target_ambiguous",
          clarify_question:
            "Lequel de tes rappels en attente je remplace ? Donne-moi son heure actuelle.",
          known_slots: {
            UTC_time: compiledPayload.scheduledFor ?? null,
            local_label: compiledPayload.localLabel ?? null,
            instruction_hint: compiledPayload.instruction ?? null,
            replace_target_label: null,
          },
        },
      };
    } else if (
      cancelOutcome.detected && cancelOutcome.status === "no_reminder"
    ) {
      // Rien a remplacer: le nouveau rappel se cree quand meme (l'intention
      // du user est le NOUVEAU), le rendu le dira honnetement.
      replaceCancelCommitted = [];
    } else {
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "replace",
          status: "failed",
          reason_code: "replace_cancel_failed",
          reply:
            "Je n'ai pas réussi à annuler l'ancien rappel, donc je n'ai rien recréé pour éviter un doublon. Réessaie, ou gère-le dans l'app.",
        }),
        requested_effects: [{ type: effectType, reason_code: "replace" }],
        blocked_effects: [{
          type: effectType,
          reason_code: "replace_cancel_failed",
        }],
      };
    }
  }
  // Intention cancel (F4, paul-broadflow15 T14): une demande d'annulation ne
  // touche JAMAIS le chemin create — garde structurelle meme si le LLM se
  // trompe ailleurs. Le payload porte intent="cancel" (contrat dispatcher);
  // l'executor cible le pending par heure locale, et l'ambiguite clarifie au
  // lieu de deviner.
  if (
    payloadText(createEffect, "intent") === "cancel" &&
    !cancelCarriesFullCreatePayload
  ) {
    const cancelRunner = args.cancelReminder ?? maybeCancelOneShotReminder;
    const cancelOutcome = await cancelRunner({
      supabase: args.supabase,
      userId: args.userId,
      message: args.message,
      requestId: args.requestId,
      now,
    });
    if (cancelOutcome.detected && cancelOutcome.status === "cancelled") {
      const label = cancelOutcome.cancelled_local_labels[0] ?? "";
      // P9-B (alex-hard24 R1-B03): un cancel de MASSE rend l'inventaire
      // complet — les N annulés énumérés + le restant relu en DB (recap
      // post-opération dérivé de l'inventaire réel, jamais de « je n'annule
      // pas le reste » sur une demande de masse exécutée).
      const isMassCancel = cancelOutcome.mass_scope === true ||
        (cancelOutcome.cancelled_ids ?? []).length > 1;
      let massReply: string | null = null;
      if (isMassCancel) {
        const cancelledList = cancelOutcome.cancelled_local_labels
          .filter(Boolean).join(" ; ");
        let remainingLine = "";
        try {
          const remainingRows = await readPendingOneShotReminderRows({
            supabase: args.supabase,
            userId: args.userId,
          });
          remainingLine = remainingRows.length === 0
            ? " Il ne te reste aucun rappel ponctuel en attente."
            : ` Il te reste ${remainingRows.length} rappel(s) en attente.`;
        } catch (_error) {
          // Lecture best-effort: sans projection, pas de ligne de restant.
        }
        massReply = `C'est annulé pour tes ${cancelOutcome.cancelled_count} rappels${
          cancelledList ? ` (${cancelledList})` : ""
        } : aucun ne partira.${remainingLine}`;
      }
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "cancel",
          status: "success",
          reason_code: "cancelled",
          reply: massReply ?? (label
            ? `C'est annulé : le rappel de ${label} ne partira pas.`
            : "C'est annulé : ce rappel ne partira pas."),
        }),
        executed_tools: ["cancel_one_shot_reminder"],
        // P12-C (paul-p9reval R1-B01): cardinalité du ledger = cardinalité
        // DB — une entrée requested/committed PAR rappel annulé (extension
        // du contrat P7-B « N commits ⇒ N annoncés » au cancel de masse).
        // L'entrée agrégée unique privait le composeur de la liste et le
        // rendu sortait un pluriel vague.
        requested_effects: (cancelOutcome.cancelled_ids ?? [label || "x"])
          .map(() => ({
            type: "cancel_one_shot_reminder" as const,
            reason_code: "cancel",
          })),
        allowed_effects: (cancelOutcome.cancelled_ids ?? [label || "x"])
          .map(() => ({
            type: "cancel_one_shot_reminder" as const,
            reason_code: "cancel",
          })),
        committed_effects: (cancelOutcome.cancelled_ids ?? []).length > 0
          ? (cancelOutcome.cancelled_ids ?? []).map((cancelledId, index) => ({
            type: "cancel_one_shot_reminder" as const,
            id: cancelledId,
            ids: [cancelledId],
            local_label: cancelOutcome.cancelled_local_labels?.[index] ??
              (index === 0 ? label || undefined : undefined),
          }))
          : [{
            type: "cancel_one_shot_reminder" as const,
            ids: [],
            local_label: label || undefined,
          }],
      };
    }
    if (cancelOutcome.detected && cancelOutcome.status === "ambiguous_target") {
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "cancel",
          status: "needs_clarify",
          reason_code: "cancel_target_ambiguous",
          reply:
            `Tu as ${cancelOutcome.pending_count} rappels en attente — tu veux annuler lequel ? Donne-moi son heure.`,
        }),
        requested_effects: [{
          type: "cancel_one_shot_reminder",
          reason_code: "cancel",
        }],
        blocked_effects: [{
          type: "cancel_one_shot_reminder",
          reason_code: "cancel_target_ambiguous",
        }],
      };
    }
    if (cancelOutcome.detected && cancelOutcome.status === "no_reminder") {
      // eva-r6 B03: la reponse distingue « jamais existe » de « deja
      // envoye/annule » — nier l'existence d'un rappel reel (fire il y a
      // 5 min) etait un faux statut.
      const absence = cancelOutcome.absence_reason ?? "never_existed";
      const label = String(cancelOutcome.non_pending_local_label ?? "").trim();
      const reasonCode = absence === "already_delivered"
        ? "cancel_already_delivered"
        : absence === "already_cancelled"
        ? "cancel_already_cancelled"
        : "no_pending_reminder";
      const reply = absence === "already_delivered"
        ? `Ton rappel${
          label ? ` de ${label}` : ""
        } a déjà été envoyé — il n'est plus en attente, donc rien à annuler.`
        : absence === "already_cancelled"
        ? `Ce rappel${label ? ` de ${label}` : ""} était déjà annulé.`
        : "Je ne trouve aucun rappel en attente qui corresponde — rien à annuler.";
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "cancel",
          status: "blocked",
          reason_code: reasonCode,
          reply,
        }),
        requested_effects: [{
          type: "cancel_one_shot_reminder",
          reason_code: "cancel",
        }],
        blocked_effects: [{
          type: "cancel_one_shot_reminder",
          reason_code: reasonCode,
        }],
      };
    }
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: "cancel",
        status: "failed",
        reason_code: "cancel_failed",
        reply: "Je n'ai pas réussi à annuler ce rappel.",
      }),
      requested_effects: [{
        type: "cancel_one_shot_reminder",
        reason_code: "cancel",
      }],
      blocked_effects: [{
        type: "cancel_one_shot_reminder",
        reason_code: "cancel_failed",
      }],
    };
  }
  // Ceinture structurelle cardinalite: la doctrine interdit d'emettre un
  // one-shot pour une demande recurrente, mais quand le LLM desobeit le
  // payload porte cardinality="recurring" et on bloque ici au lieu de creer
  // un faux ponctuel (multiflow T13: recurrent committe silencieusement).
  if (payloadText(createEffect, "cardinality") === "recurring") {
    return recurringNotSupportedDirectEffectResult(effectType);
  }
  // P8-B (eva-hard23 T6/T7, probes P8-3 passes 1-2): ARTEFACT COACHING ≠
  // RAPPEL — la doctrine dispatcher n'a PAS tenu en live (2 passes sur 2: un
  // create armé en substitut d'une demande de potion, « prépare-moi une
  // potion pour 22h » lu comme un acte de rappel). Gate déterministe: un
  // create NU dont le payload mentionne un artefact coaching (potion/carte)
  // alors que le MESSAGE user ne porte AUCUN acte de rappel → blocked
  // honnête, zéro write. Anti-FP: « rappelle-moi de faire ma potion » porte
  // l'acte → passe; un tour-réponse à un clarify (pending) est exempté (le
  // user complète un rappel déjà légitime).
  if (
    replaceCancelCommitted === null &&
    String(payloadText(createEffect, "intent") ?? "create") === "create" &&
    !pendingCreateSlots &&
    // Le re-serve d'un différé de crise a son propre consentement
    // (asksOrAccepts plus haut) — jamais re-gaté ici.
    ((args.tempMemory as Record<string, unknown> | null | undefined)
        ?.[SAFETY_DEFERRED_REMINDER_RUNTIME_KEY] as
          | Record<string, unknown>
          | undefined)?.mode !== "deferred"
  ) {
    const messageNormalized = String(args.message ?? "")
      .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    // P8-B (probe P8-3 passe 4): le chemin LOCAL (direct_effect_request du
    // flow coaching) émet un payload qui ne nomme pas toujours l'artefact —
    // le MESSAGE USER, lui, le nomme toujours dans les cas observés. La
    // détection lit payload ET message; l'acte de rappel dans le message
    // reste le seul désarmeur.
    const artifactSource = [
      compiledPayload.instruction ?? "",
      compiledPayload.rawText ?? "",
      messageNormalized,
    ].join(" ").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const mentionsCoachingArtifact = /\b(potions?|cartes?)\b/.test(
      artifactSource,
    );
    const hasReminderAct =
      /\b(rappels?|rappelles?|rappeler|previens|prevenir|notifications?|notifs?|alarmes?|alertes?|sonne(rie)?|programme[sr]?|planifie)\b/
        .test(messageNormalized);
    if (mentionsCoachingArtifact && !hasReminderAct) {
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "create",
          status: "blocked",
          reason_code: "coaching_artifact_not_reminder",
          reply:
            "Je n'ai pas posé de rappel — une potion, ça se prépare ici en conversation et ça s'active dans l'app (Dashboard > Ressources), rien ne se « garde » depuis le chat. Si tu veux en plus un rappel à heure fixe, dis-le-moi explicitement.",
        }),
        requested_effects: [{ type: effectType, reason_code: "create" }],
        blocked_effects: [{
          type: effectType,
          reason_code: "coaching_artifact_not_reminder",
        }],
      };
    }
  }
  // P4-D (eva-global19 R1-B03): CEINTURE heure nue ambiguë — « à huit
  // heures » / « à 8h » sans marqueur matin/soir se committait à 08:00 sur
  // une action du soir (mauvaise branche, corrigée par le user au tour
  // suivant). La règle prompt (UTC_time vide) ne tient pas toujours: le
  // runtime clarifie le créneau AVANT tout write. Ne s'applique qu'au
  // create NU (jamais au replace: l'ancre du rappel remplacé fait foi).
  if (replaceCancelCommitted === null) {
    // La détection lit le MESSAGE USER verbatim — le dispatcher normalise
    // parfois « huit heures » en « 08:00 » jusque dans raw_text (probe P4-8
    // passe 4), ce qui efface l'ambiguïté que la ceinture doit attraper.
    // L'ambiguïté vit dans les mots du user, pas dans leur normalisation.
    // P5-D (eva-p4verify R1-B01): le fallback raw_text ne s'applique QUE si
    // le message user est indisponible — sur le TOUR-RÉPONSE au clarify
    // (« le soir, 20h »), le raw_text agrège encore « huit heures » du tour
    // initial et re-bloquait un créneau pourtant résolu (message
    // auto-contradictoire + zéro write).
    const ambiguousHour = String(args.message ?? "").trim()
      ? bareAmbiguousHour(args.message)
      : bareAmbiguousHour(canonicalRawTextFromTurnFrame(args.turnFrame) ?? "");
    if (ambiguousHour !== null) {
      const clarifyReply =
        `Juste pour être sûre du créneau : ${ambiguousHour}h du matin, ou ${
          ambiguousHour + 12
        }h ? Je programme dès que tu me dis.`;
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "create",
          status: "needs_clarify",
          reason_code: "hour_meridiem_ambiguous",
          reply: clarifyReply,
        }),
        requested_effects: [{ type: effectType, reason_code: "create" }],
        blocked_effects: [{
          type: effectType,
          reason_code: "hour_meridiem_ambiguous",
        }],
        missing_slots: ["scheduled_for"],
        // P5-D: les slots déjà fournis (instruction, texte d'origine) se
        // persistent pour que le tour-réponse complète CE create — sans ça,
        // le commit reprenait la phrase de désambiguïsation comme texte du
        // rappel (« le soir. pas le matin »).
        pending_clarification: {
          intent: "create",
          reason_code: "hour_meridiem_ambiguous",
          clarify_question: clarifyReply,
          known_slots: {
            instruction_hint: compiledPayload.instruction ?? null,
            raw_text: compiledPayload.rawText ?? args.message,
            when_hint: canonicalWhenHintFromTurnFrame(args.turnFrame) ?? null,
          },
        },
      };
    }
  }
  // P6-A (paul-hard21 R1-B04, aval): récupération HAUTE PRÉCISION du libellé
  // depuis les messages user récents quand le tour courant ne porte que le
  // créneau — uniquement les formes sans ambiguïté (guillemets, « texte
  // exact: … »), jamais les patterns lâches (une instruction périmée
  // committée en durable serait pire que le clarify). Le fix AMONT est la
  // doctrine d'émission du brouillon (le dispatcher émet, la lane persiste).
  if (!compiledPayload.instruction && (args.contextMessages ?? []).length > 0) {
    for (const contextMessage of args.contextMessages ?? []) {
      const quoted = extractQuotedReminderInstruction(String(contextMessage));
      if (quoted && !isDegenerateReminderInstruction(quoted)) {
        compiledPayload = { ...compiledPayload, instruction: quoted };
        break;
      }
    }
  }
  const missingPayloadSlots: OneShotReminderDirectEffectResult["missing_slots"] =
    [];
  if (!compiledPayload.scheduledFor || !compiledPayload.localLabel) {
    missingPayloadSlots.push("scheduled_for");
  }
  // P8-B (eva-hard23 T7, probe P8-3 passe 1): sur un create NU, une
  // instruction DÉGÉNÉRÉE ou anaphorique (« la retrouver » — clitique + verbe
  // sans objet propre) ne se committe JAMAIS telle quelle: le référent vit
  // dans la conversation (ici une potion jamais créée), l'écrire fabrique un
  // texte durable vide de sens et un artefact substitué. Clarify de l'objet.
  // Le REPLACE reste exempté: son héritage P3-F/P6-A résout l'instruction
  // depuis le pending ciblé, jamais depuis la clause.
  const nominalCreateInstructionDegenerate = replaceCancelCommitted === null &&
    Boolean(compiledPayload.instruction) &&
    (isDegenerateReminderInstruction(compiledPayload.instruction) ||
      isReminderInstructionInvarianceAnaphora(
        compiledPayload.instruction ?? "",
      ));
  if (!compiledPayload.instruction || nominalCreateInstructionDegenerate) {
    missingPayloadSlots.push("reminder_instruction");
  }
  if (missingPayloadSlots.length > 0) {
    const reasonCode = !compiledPayload.scheduledFor
      ? "missing_time"
      : "missing_instruction";
    // P4-D (eva-global19 R1-B03): heure nue ambiguë avec UTC_time laissé
    // vide par le dispatcher (contrat) — la question porte le CRENEAU au
    // lieu d'un vague « moment exact ». Formes chiffrées incluses ici: le
    // dispatcher a DÉJÀ jugé l'ambiguïté en laissant UTC_time vide.
    const ambiguousHour = bareAmbiguousHour(
      canonicalRawTextFromTurnFrame(args.turnFrame) ??
        canonicalWhenHintFromTurnFrame(args.turnFrame) ?? "",
      { includeDigits: true },
    );
    const missingReply = !compiledPayload.scheduledFor
      ? (ambiguousHour !== null
        ? `Juste pour être sûre du créneau : ${ambiguousHour}h du matin, ou ${
          ambiguousHour + 12
        }h ? Je programme dès que tu me dis.`
        : "Il me manque le moment exact pour programmer ce rappel.")
      : "Il me manque ce qu'il faut rappeler.";
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: "create",
        status: "needs_clarify",
        reason_code: reasonCode,
        reply: missingReply,
      }),
      requested_effects: [{ type: effectType, reason_code: "create" }],
      blocked_effects: [{
        type: effectType,
        reason_code: reasonCode,
      }],
      constraints: !compiledPayload.scheduledFor
        ? ["requires_explicit_time"]
        : ["requires_instruction"],
      missing_slots: missingPayloadSlots,
      // P5-D: même carry-over que la ceinture — un create incomplet garde
      // ses slots déjà fournis pour le tour-réponse. P8-B: une instruction
      // dégénérée ne se persiste PAS dans les slots (le tour-réponse ne doit
      // jamais hériter l'anaphore comme texte du rappel).
      pending_clarification: {
        intent: "create",
        reason_code: reasonCode,
        clarify_question: missingReply,
        known_slots: {
          instruction_hint: nominalCreateInstructionDegenerate
            ? null
            : compiledPayload.instruction ?? null,
          raw_text: compiledPayload.rawText ?? args.message,
          when_hint: canonicalWhenHintFromTurnFrame(args.turnFrame) ?? null,
        },
      },
    };
  }
  const scheduledFor = compiledPayload.scheduledFor;
  const reminderInstruction = compiledPayload.instruction;
  if (!scheduledFor || !reminderInstruction) {
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: "create",
        status: "needs_clarify",
        reason_code: "missing_payload",
      }),
      requested_effects: [{ type: effectType, reason_code: "create" }],
      blocked_effects: [{ type: effectType, reason_code: "missing_payload" }],
    };
  }
  // P5-F (nina-global20 B01, alex-untested20 R1-B02): demande de BROUILLON /
  // validation préalable explicite (« montre-le-moi d'abord », « le crée pas
  // tout de suite, je valide avant ») — garde d'admission déterministe,
  // jamais un prompt : le brouillon complet est rendu, ZÉRO ligne pending, et
  // les slots persistent (mécanique pending-create P5-D) pour que « ok
  // crée-le » au tour suivant committe tel quel.
  if (oneShotReminderDraftRequested(args.message)) {
    const draftLabel = compiledPayload.localLabel ?? scheduledFor;
    const draftReply =
      `Voilà le brouillon — ${draftLabel} : « ${reminderInstruction} ». Je ne l'ai PAS encore créé ; tu valides, ou tu veux changer quelque chose ?`;
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: "create",
        status: "needs_clarify",
        reason_code: "draft_pending_confirmation",
        reply: draftReply,
      }),
      requested_effects: [{ type: effectType, reason_code: "create" }],
      blocked_effects: [{
        type: effectType,
        reason_code: "draft_pending_confirmation",
      }],
      pending_clarification: {
        intent: "create",
        reason_code: "draft_pending_confirmation",
        clarify_question: draftReply,
        known_slots: {
          instruction_hint: reminderInstruction,
          UTC_time: scheduledFor,
          local_label: compiledPayload.localLabel ?? null,
          raw_text: compiledPayload.rawText ?? args.message,
        },
      },
    };
  }
  const outcome = await maybeCreateOneShotReminderFromStructuredEffect({
    effect: {
      type: "create_one_shot_reminder",
      scheduled_for: scheduledFor,
      local_label: compiledPayload.localLabel ?? undefined,
      reminder_instruction: reminderInstruction,
      request_text: compiledPayload.rawText,
      reason_code: compiledPayload.parseSource,
    },
    supabase: args.supabase,
    userId: args.userId,
    sourceMessageId: args.sourceMessageId ?? args.requestId ?? null,
    requestId: args.requestId,
    now,
    timezone: args.userTimezone,
    locale: args.locale,
    // P12-D2c/D3/D4: doublon d'instruction assumé (réponse AJOUTER consommée,
    // marqueur additif, ou create pur d'un jour nommé sans pending).
    allowDuplicateInstruction: allowDuplicateForTurn,
  });
  if (!outcome.detected) {
    return baseDirectEffectResult({
      detected: false,
      intent: "create",
      status: "ignored",
      reason_code: "create_not_detected",
    });
  }
  if (outcome.status === "success") {
    const committedEffects = committedCreateEffects(outcome);
    if (committedEffects.length === 0) {
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "create",
          status: "failed",
          reason_code: "missing_create_commit",
          reply: "Je n'ai pas réussi à programmer ce rappel.",
        }),
        requested_effects: [{
          type: effectType,
          scheduled_for: outcome.scheduled_for,
          local_label: outcome.scheduled_for_local_label,
          reminder_instruction: outcome.reminder_instruction,
          reason_code: outcome.parse_source ?? "created",
        }],
        allowed_effects: [{
          type: effectType,
          scheduled_for: outcome.scheduled_for,
          local_label: outcome.scheduled_for_local_label,
          reminder_instruction: outcome.reminder_instruction,
          reason_code: outcome.parse_source ?? "created",
        }],
        attempted_effects: [effectType],
        blocked_effects: [{
          type: effectType,
          reason_code: "missing_create_commit",
        }],
      };
    }
    const createReply = createReminderSuccessReply({
      localLabel: outcome.scheduled_for_local_label,
      reminderInstruction: outcome.reminder_instruction,
      turnFrame: args.turnFrame ?? null,
    });
    // Volet replace: le rendu porte les DEUX operations (annule + recree) —
    // outcome total, jamais « c'est decale » sans trace de l'annulation.
    const replaceReply = replaceCancelCommitted === null
      ? createReply
      : replaceCancelCommitted.length > 0
      ? `C'est fait : l'ancien rappel${
        replaceCancelledLabel ? ` de ${replaceCancelledLabel}` : ""
      } est annulé, et le nouveau est posé. ${createReply}`
      // P12-D3/D4: sur un ajout explicite (ou une entité d'un autre jour),
      // le rendu dit l'AJOUT — « rien trouvé à annuler » mentirait sur
      // l'intention (rien ne devait être annulé).
      : replaceCancelForbidden
      ? `C'est un ajout — je n'ai touché à aucun rappel existant. ${createReply}`
      : `Je n'ai trouvé aucun ancien rappel en attente à annuler — j'ai posé le nouveau. ${createReply}`;
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: replaceCancelCommitted === null ? "create" : "replace",
        status: "success",
        reason_code: outcome.parse_source ?? "created",
        reply: replaceReply,
      }),
      requested_effects: [{
        type: effectType,
        scheduled_for: outcome.scheduled_for,
        local_label: outcome.scheduled_for_local_label,
        reminder_instruction: outcome.reminder_instruction,
        reason_code: outcome.parse_source ?? "created",
      }],
      allowed_effects: [{
        type: effectType,
        scheduled_for: outcome.scheduled_for,
        local_label: outcome.scheduled_for_local_label,
        reminder_instruction: outcome.reminder_instruction,
        reason_code: outcome.parse_source ?? "created",
      }],
      attempted_effects: [effectType],
      executed_tools: replaceCancelCommitted &&
          replaceCancelCommitted.length > 0
        ? [
          ...uniqueToolsFromCommitted(committedEffects),
          "cancel_one_shot_reminder",
        ]
        : uniqueToolsFromCommitted(committedEffects),
      committed_effects: [
        ...(replaceCancelCommitted ?? []),
        ...committedEffects,
      ],
      scheduled_for: outcome.scheduled_for,
      local_label: outcome.scheduled_for_local_label,
      reminder_instruction: outcome.reminder_instruction,
    };
  }
  return {
    ...baseDirectEffectResult({
      detected: true,
      intent: "create",
      status: outcome.status === "needs_clarify" ? "needs_clarify" : "failed",
      reason_code: outcome.status === "needs_clarify"
        ? outcome.reason
        : outcome.status,
      reply: outcome.status === "needs_clarify"
        ? (outcome.reason === "duplicate_pending"
          ? "Bonne nouvelle : ce rappel existe déjà et il est bien en attente pour ce moment — je n'en ai pas ajouté un deuxième."
          // P12-D2c (nina-p10reval R1-B04): les deux options sont EXÉCUTABLES
          // au tour suivant (déplacer ⇒ replace de la cible au même contenu,
          // ajouter ⇒ create assumé du doublon) — plus de formule dictée avec
          // placeholder « [heure] » qui fuyait au rendu.
          : outcome.reason === "same_instruction_pending"
          ? "Tu as déjà un rappel en attente avec exactement ce contenu, à une autre heure. Tu veux que je le DÉPLACE à la nouvelle heure, ou que j'en AJOUTE un deuxième en plus ? Dis-moi « déplace-le » ou « ajoute-le » — je n'ai rien changé pour l'instant."
          : outcome.reason === "past_time"
          ? "Cette heure est déjà passée aujourd'hui, je n'ai rien programmé — tu veux un autre horaire, ou demain ?"
          : "Il me manque le moment exact pour programmer ce rappel.")
        : "Je n'ai pas réussi à programmer ce rappel.",
    }),
    requested_effects: [{ type: effectType, reason_code: "create" }],
    attempted_effects: outcome.status === "failed" ? [effectType] : [],
    blocked_effects: outcome.status === "needs_clarify"
      ? [{ type: effectType, reason_code: outcome.reason }]
      : [],
    missing_slots:
      outcome.status === "needs_clarify" &&
        outcome.reason !== "duplicate_pending" &&
        outcome.reason !== "past_time"
        ? ["scheduled_for"]
        : [],
    // P6-A (nina-untested21 R1-B02): le clarify PAST_TIME était le seul
    // clarify de create qui ne persistait PAS ses slots — l'objet du rappel
    // (« me peser ») était perdu et le tour-réponse (« alors demain 20h »)
    // committait le qualificatif résiduel (« avant ma garde ») comme
    // instruction durable. Même mécanique que missing_time (P5-D).
    ...(outcome.status === "needs_clarify" && outcome.reason === "past_time"
      ? {
        pending_clarification: {
          intent: "create" as const,
          reason_code: "past_time",
          clarify_question:
            "Cette heure est déjà passée aujourd'hui — tu veux un autre horaire, ou demain ?",
          known_slots: {
            instruction_hint: compiledPayload.instruction ?? null,
            raw_text: compiledPayload.rawText ?? args.message,
            when_hint: canonicalWhenHintFromTurnFrame(args.turnFrame) ?? null,
          },
        },
      }
      : {}),
    // P12-D2c (nina-p10reval R1-B04): le gate same_instruction_pending arme
    // SON pending — sans lui, la réponse-option (« en ajouter un deuxième »)
    // repassait par l'intake comme énoncé neuf et re-déclenchait le même
    // blocage verbatim (cul-de-sac T11/T12). Les slots portent l'heure et le
    // contenu du NOUVEAU rappel pour que l'option choisie s'exécute telle
    // quelle au tour suivant.
    ...(outcome.status === "needs_clarify" &&
        outcome.reason === "same_instruction_pending"
      ? {
        pending_clarification: {
          intent: "create" as const,
          reason_code: "same_instruction_pending",
          clarify_question:
            "Tu veux que je DÉPLACE le rappel existant à la nouvelle heure, ou que j'en AJOUTE un deuxième en plus ?",
          known_slots: {
            instruction_hint: compiledPayload.instruction ?? null,
            UTC_time: compiledPayload.scheduledFor ?? null,
            local_label: compiledPayload.localLabel ?? null,
            raw_text: compiledPayload.rawText ?? args.message,
            when_hint: canonicalWhenHintFromTurnFrame(args.turnFrame) ?? null,
          },
        },
      }
      : {}),
  };
}
