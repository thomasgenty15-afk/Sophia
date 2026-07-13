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
  maybeCancelOneShotReminder,
  maybeCreateOneShotReminder,
  maybeCreateOneShotReminderFromStructuredEffect,
} from "./executor.ts";
import { readPendingOneShotReminderRows } from "./persistence.ts";
import {
  extractTargetHHMMFromMessage,
  hasExplicitFutureDayHint,
  localHHMMForScheduledFor,
  parseOneShotReminderRequest,
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
      intent: "replace";
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

export function pendingOneShotReminderClarificationForDispatcher(
  tempMemory: unknown,
): {
  effect_type: "create_one_shot_reminder";
  intent: "replace";
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
    intent: "replace",
    reason_code: String(runtime.reason_code ?? "needs_clarify"),
    clarify_question: String(runtime.clarify_question ?? ""),
    known_slots:
      runtime.known_slots && typeof runtime.known_slots === "object"
        ? runtime.known_slots as Record<string, unknown>
        : null,
  };
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

function compileStructuredCreatePayload(args: {
  turnFrame?: TurnFrame | null;
  message: string;
}): {
  scheduledFor: string | null;
  localLabel: string | null;
  instruction: string | null;
  rawText: string;
  parseSource: "payload_utc_time" | "payload";
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
 * One-shot reminder route runtime.
 * Execute only explicit one-shot reminder direct effects; status/product-help
 * blockers live in route_guards.ts.
 */
export async function maybeRunOneShotReminderDirectEffect(args: {
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
  createReminder?: typeof maybeCreateOneShotReminder;
  cancelReminder?: typeof maybeCancelOneShotReminder;
}): Promise<OneShotReminderDirectEffectResult> {
  const createEffect = createEffectFromTurnFrame(args.turnFrame);
  const now = args.now && Number.isFinite(args.now.getTime())
    ? args.now
    : new Date();
  let compiledPayload = compileStructuredCreatePayload({
    turnFrame: args.turnFrame,
    message: args.message,
  });
  const hasExplicitCreateDirectEffect =
    createEffect?.explicitness === "explicit" &&
    createEffect.confidence_band !== "low";
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
  const completeMissingPayloadTime = async (): Promise<void> => {
    if (compiledPayload.scheduledFor) return;
    try {
      const tctxFill = await getUserTimeContext({
        supabase: args.supabase,
        userId: args.userId,
        now,
      });
      // UNIQUEMENT les champs structurés émis par le dispatcher (payload
      // raw_text / when_hint) — jamais le message brut du user (frontière
      // G1/C3: le payload structuré est canonique, le router ne re-lit pas
      // le message). Payload absent → pas de complétion → clarify inchangé.
      const payloadRawText = canonicalRawTextFromTurnFrame(args.turnFrame) ??
        "";
      const whenHint = payloadText(createEffect, "when_hint") ?? "";
      const parseText = [payloadRawText, whenHint]
        .filter(Boolean)
        .join(" ");
      const parsed = parseText.trim()
        ? parseOneShotReminderRequest({
          message: parseText,
          timezone: tctxFill.user_timezone,
          nowIso: tctxFill.now_utc,
        })
        : null;
      if (parsed?.scheduledFor) {
        compiledPayload = {
          ...compiledPayload,
          scheduledFor: parsed.scheduledFor,
          localLabel: compiledPayload.localLabel ??
            formatOneShotLocalLabel(
              parsed.scheduledFor,
              tctxFill.user_timezone,
            ),
          instruction: compiledPayload.instruction ??
            parsed.reminderInstruction,
        };
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
    payloadText(createEffect, "intent") !== "cancel"
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
      const fullText = [payloadRawText, whenHint].filter(Boolean).join(" ");
      let parseText = whenHint.trim() || payloadRawText;
      if (
        whenHint.trim() && hasExplicitFutureDayHint(fullText) &&
        !hasExplicitFutureDayHint(whenHint)
      ) {
        const dayToken = /apr[eè]s[- ]demain/i.test(fullText)
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
      const llmMs = new Date(compiledPayload.scheduledFor).getTime();
      const parsedMs = parsed?.scheduledFor
        ? new Date(parsed.scheduledFor).getTime()
        : Number.NaN;
      const explicitFutureDay = hasExplicitFutureDayHint(fullText);
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
            scheduledFor: String(parsed?.scheduledFor),
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
          };
        }
      } else if (
        Number.isFinite(parsedMs) && Number.isFinite(llmMs) &&
        llmMs > now.getTime() + 30_000 &&
        parsedMs > now.getTime() + 30_000 &&
        Math.abs(parsedMs - llmMs) > 60_000
      ) {
        // Couche 3: deux résolutions futures qui divergent (heure relative,
        // dérive d'arithmétique) → le déterministe gagne.
        compiledPayload = {
          ...compiledPayload,
          scheduledFor: String(parsed?.scheduledFor),
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
    try {
      const rows = await readPendingOneShotReminderRows({
        supabase: args.supabase,
        userId: args.userId,
      });
      pendingCount = rows.length;
    } catch (_error) {
      pendingCount = null;
    }
    if (pendingCount === 0) {
      await completeMissingPayloadTime();
      if (!compiledPayload.scheduledFor || !compiledPayload.instruction) {
        return {
          ...baseDirectEffectResult({
            detected: true,
            intent: "create",
            status: "needs_clarify",
            reason_code: "reschedule_no_target",
            reply: !compiledPayload.scheduledFor
              ? "Il n'y a aucun rappel en attente à déplacer. Donne-moi l'heure exacte et je te le (re)pose direct."
              : "Il n'y a aucun rappel en attente à déplacer. Dis-moi ce que je dois te rappeler et je te le (re)pose direct.",
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
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "create",
          status: "blocked",
          reason_code: "reschedule_not_supported",
          reply:
            "Je ne peux pas déplacer un rappel existant tel quel. Deux options : dis-moi « annule-le et remets-le à [heure] » et je le fais d'ici, ou modifie-le dans Dashboard > Initiatives (section rappels). Rien n'a été changé pour l'instant.",
        }),
        requested_effects: [{ type: effectType, reason_code: "reschedule" }],
        blocked_effects: [{
          type: effectType,
          reason_code: "reschedule_not_supported",
        }],
      };
    }
  }
  // R-1 (paul-triflow R1-B01, alex-multiflow B1 — BF-STATUS-01): question de
  // verification / liste / recap sur les rappels ponctuels. Le dispatcher
  // ORIENTE (intent='status'), le runtime LIT la verite DB, l'outcome DECRIT,
  // le composeur CONFIRME. Zero write. Sans cette lane, une question de
  // statut atteignait le composeur sans aucune projection et il niait des
  // rappels pourtant committes et pending.
  if (payloadText(createEffect, "intent") === "status") {
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
      const summary = lines.length === 0
        ? "Aucun rappel ponctuel en attente en ce moment."
        : `Rappel(s) ponctuel(s) en attente (${lines.length}) : ${
          lines.join(" ; ")
        }.`;
      const reply = lines.length === 0
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
    if (!compiledPayload.instruction) {
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
        const targetRow = targetHHMM
          ? pendings.find((row) =>
            localHHMMForScheduledFor(
              String(row?.scheduled_for ?? ""),
              timezone,
            ) === targetHHMM
          )
          : pendings.length === 1
          ? pendings[0]
          : null;
        const inheritedInstruction = String(
          (targetRow?.message_payload as Record<string, unknown> | undefined)
            ?.reminder_instruction ?? "",
        ).trim();
        if (inheritedInstruction) {
          compiledPayload = {
            ...compiledPayload,
            instruction: inheritedInstruction,
          };
        }
      } catch (_error) {
        // best-effort: le clarify replace_payload_incomplete reste le filet.
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
    {
      const newMs = new Date(compiledPayload.scheduledFor).getTime();
      if (Number.isFinite(newMs) && newMs <= now.getTime() + 30_000) {
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
    const cancelRunner = args.cancelReminder ?? maybeCancelOneShotReminder;
    const cancelOutcome = await cancelRunner({
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
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "replace",
          status: "needs_clarify",
          reason_code: "replace_target_ambiguous",
          reply:
            `Tu as ${cancelOutcome.pending_count} rappels en attente — lequel je remplace ? Donne-moi son heure actuelle.`,
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
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "cancel",
          status: "success",
          reason_code: "cancelled",
          reply: label
            ? `C'est annulé : le rappel de ${label} ne partira pas.`
            : "C'est annulé : ce rappel ne partira pas.",
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
  const missingPayloadSlots: OneShotReminderDirectEffectResult["missing_slots"] =
    [];
  if (!compiledPayload.scheduledFor || !compiledPayload.localLabel) {
    missingPayloadSlots.push("scheduled_for");
  }
  if (!compiledPayload.instruction) {
    missingPayloadSlots.push("reminder_instruction");
  }
  if (missingPayloadSlots.length > 0) {
    const reasonCode = !compiledPayload.scheduledFor
      ? "missing_time"
      : "missing_instruction";
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: "create",
        status: "needs_clarify",
        reason_code: reasonCode,
        reply: !compiledPayload.scheduledFor
          ? "Il me manque le moment exact pour programmer ce rappel."
          : "Il me manque ce qu'il faut rappeler.",
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
          : outcome.reason === "same_instruction_pending"
          ? "Tu as déjà un rappel en attente avec exactement ce contenu, à une autre heure. Tu veux le DÉPLACER à la nouvelle heure (dis « annule-le et remets-le à [heure] »), ou en AJOUTER un deuxième en plus ? Je n'ai rien changé pour l'instant."
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
  };
}
