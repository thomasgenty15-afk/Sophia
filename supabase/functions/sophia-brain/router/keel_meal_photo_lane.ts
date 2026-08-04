// LA LANE DE CORRECTION PHOTO — amender le fait, au lieu d'en écrire un second.
//
// LE DÉFAUT QU'ELLE FERME
// -----------------------
//   Sophia: « je vois du porc et du riz. C'était cuit à l'huile ? »
//   Élève : « non c'était du poulet »
//
// Avant cette lane, ce second tour repartait dans le routeur global,
// `log_protocol_event` y voyait une information alimentaire, et écrivait une
// SECONDE ligne `protocol_events`. L'élève a mangé une fois, son coach en
// comptait deux. Le reducer qui l'empêche (`meal_photo_flow.ts`) existait,
// testé, avec ZÉRO appelant — son propre en-tête décrivait le défaut qu'il ne
// pouvait pas empêcher faute d'être branché.
//
// OÙ ELLE S'INSÈRE, ET POURQUOI LÀ
// --------------------------------
// Juste AVANT `runKeelDirectEffectLane`, au seul endroit où `tempMemory` et
// `routeDecision` sont des locaux vivants du tour. Écrire l'état depuis la lane
// elle-même serait écrasé par l'écriture de fin de tour, qui réécrit tout
// `temp_memory` à partir de ce qu'elle a lu au début — la classe de bug
// « clobber temp_memory » déjà payée une fois sur les engagements de style.
//
// CE QU'ELLE NE FAIT PAS
// ----------------------
// Elle ne prend PAS la main sur le tour. Sophia répond normalement, la mémoire
// tourne, la safety s'applique. La seule chose qui change est la destination de
// l'écriture: un amendement sur la ligne existante plutôt qu'une ligne neuve.
// C'est pour ça qu'elle ne passe pas par `active_flow_state.ts`, dont tout le
// mécanisme suppose qu'un flow local SAUTE le dispatcher global.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { amendMealPhotoEvent } from "../../_shared/keel/meal_photo_amend.ts";
import { reduceMealPhotoFlow } from "../../_shared/keel/meal_photo_flow.ts";
import {
  applyMealPhotoFlowState,
  readMealPhotoFlowState,
} from "../../_shared/keel/meal_photo_flow_state.ts";
import { classifyMealPhotoIntent } from "../../_shared/keel/meal_photo_intent.ts";

export interface MealPhotoLaneResult {
  /** `temp_memory` à reporter sur le local du tour. Toujours rendu. */
  tempMemory: Record<string, unknown>;
  /**
   * true quand la correction a été absorbée par un amendement: le tour ne doit
   * PLUS armer `log_protocol_event`, sinon le doublon revient par la porte que
   * cette lane vient de fermer.
   */
  suppressLogProtocolEvent: boolean;
  amended:
    | null
    | {
      eventId: string;
      amendment: "answer" | "correction";
      clearedCredit: boolean;
    };
  /** Motif de non-amendement, pour les traces. Jamais un silence. */
  reason: string;
}

const SAFETY_BANDS = ["none", "low", "medium", "high", "critical"] as const;
type SafetyBand = (typeof SAFETY_BANDS)[number];

function asSafetyBand(value: unknown): SafetyBand {
  const raw = String(value ?? "none").trim().toLowerCase();
  return (SAFETY_BANDS as readonly string[]).includes(raw)
    ? raw as SafetyBand
    : "none";
}

/**
 * Consulte le flow photo ouvert et, si le tour l'amende, applique l'amendement.
 *
 * Rend TOUJOURS un `tempMemory` utilisable: quand aucun flow n'est ouvert,
 * c'est l'objet reçu, inchangé. L'appelant peut donc l'affecter sans condition.
 */
export async function runMealPhotoCorrectionLane(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  /** Le tour porte-t-il une nouvelle image. Fait de transport, pas de sens. */
  hasMedia: boolean;
  tempMemory: unknown;
  safetyBand: unknown;
  now: Date;
  requestId?: string;
  /**
   * Injectable pour les tests: sans lui, la lane appelle un modèle et devient
   * intestable hors réseau. Même patron que `llmRunner` ailleurs — une garde
   * qu'on ne peut pas éprouver est une garde qu'on croit sur parole.
   */
  classify?: typeof classifyMealPhotoIntent;
}): Promise<MealPhotoLaneResult> {
  const base = (args.tempMemory && typeof args.tempMemory === "object" &&
      !Array.isArray(args.tempMemory))
    ? { ...(args.tempMemory as Record<string, unknown>) }
    : {};

  const stored = readMealPhotoFlowState(base);
  if (!stored) {
    return {
      tempMemory: base,
      suppressLogProtocolEvent: false,
      amended: null,
      reason: "no_open_flow",
    };
  }

  const classify = args.classify ?? classifyMealPhotoIntent;
  const { intent } = await classify({
    question: stored.flow.question,
    detectedFoods: stored.detected_foods,
    inboundText: args.userMessage,
    hasMedia: args.hasMedia,
    requestId: args.requestId,
    userId: args.userId,
  });

  const decision = reduceMealPhotoFlow({
    flow: stored.flow,
    intent,
    safetyBand: asSafetyBand(args.safetyBand),
    now: args.now,
  });

  // `stay` laisse le tour à son chemin normal — c'est le comportement d'avant
  // ce câblage, et c'est ce que produit une classification incertaine.
  if (decision.kind === "stay") {
    return {
      tempMemory: applyMealPhotoFlowState({
        tempMemory: base,
        flow: decision.nextFlow,
        detectedFoods: stored.detected_foods,
        now: args.now,
      }),
      suppressLogProtocolEvent: false,
      amended: null,
      reason: `stay:${intent}`,
    };
  }

  if (decision.kind === "exit") {
    // Le flow se ferme (autre sujet, nouvelle photo, timeout, plafond, crise).
    // On n'absorbe RIEN: le tour doit pouvoir écrire son propre fait, et une
    // nouvelle photo doit pouvoir ouvrir le sien.
    return {
      tempMemory: applyMealPhotoFlowState({
        tempMemory: base,
        flow: null,
        now: args.now,
      }),
      suppressLogProtocolEvent: false,
      amended: null,
      reason: `exit:${decision.reason}`,
    };
  }

  const result = await amendMealPhotoEvent(args.supabase, {
    eventId: decision.eventId,
    userId: args.userId,
    amendment: {
      kind: decision.amendment,
      studentText: args.userMessage.trim(),
      at: args.now.toISOString(),
    },
  });

  if (!result.ok) {
    // L'amendement a échoué. On ferme le flow ET on laisse le tour écrire
    // normalement: mieux vaut un second fait — visible, corrigeable — qu'une
    // parole d'élève perdue parce qu'un UPDATE a échoué en silence.
    console.warn(JSON.stringify({
      tag: "meal_photo_amend_failed",
      user_id: args.userId,
      event_id: decision.eventId,
      reason: result.reason,
    }));
    return {
      tempMemory: applyMealPhotoFlowState({
        tempMemory: base,
        flow: null,
        now: args.now,
      }),
      suppressLogProtocolEvent: false,
      amended: null,
      reason: `amend_failed:${result.reason ?? "unknown"}`,
    };
  }

  return {
    tempMemory: applyMealPhotoFlowState({
      tempMemory: base,
      flow: decision.nextFlow,
      detectedFoods: stored.detected_foods,
      now: args.now,
    }),
    suppressLogProtocolEvent: true,
    amended: {
      eventId: decision.eventId,
      amendment: decision.amendment,
      clearedCredit: result.clearedCredit,
    },
    reason: `amended:${decision.amendment}`,
  };
}
