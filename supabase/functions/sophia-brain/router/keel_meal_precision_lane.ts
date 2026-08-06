// LA LANE DE PRÉCISION — amender le fait, au lieu d'en écrire un second.
//
// LE DÉFAUT QU'ELLE FERME
// -----------------------
//   Sophia: « Recorded for 2026-08-04 (lunch): Poultry. And what did you have
//            with it? »
//   Élève : « du riz, et c'était grillé »
//
// Sans cette lane, ce second tour repart dans le routeur global,
// `log_protocol_event` y voit une information alimentaire, et écrit un repas
// COMPLET de plus. L'élève a mangé une fois, son coach en compte deux.
//
// CE QU'ELLE FAIT, ET LA NUANCE QUI COMPTE
// ----------------------------------------
// Elle ne supprime pas l'écriture: elle la RESTREINT. La réponse « du riz »
// nomme un aliment réellement mangé — c'est un fait, et le coach doit pouvoir
// le compter. Ce qui ne doit pas être réécrit, c'est ce qui EST DÉJÀ écrit:
// `componentKeys` porte les identités du repas d'origine, et la lane les fait
// interdire à l'intake. Le poulet re-mentionné ne devient pas un second poulet;
// le riz devient une ligne neuve, liée à la première.
//
// Une CORRECTION, elle, n'ajoute rien: « non c'était de la dinde » remplace une
// lecture. La lane retire alors l'effet entièrement.
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
// tourne, la safety s'applique. C'est pour ça qu'elle ne passe pas par
// `active_flow_state.ts`, dont tout le mécanisme suppose qu'un flow local SAUTE
// le dispatcher global.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { amendMealPrecisionEvents } from "../../_shared/keel/meal_precision_amend.ts";
import {
  type MealPrecisionFlowState,
  openMealPrecisionFlow,
  reduceMealPrecisionFlow,
} from "../../_shared/keel/meal_precision_flow.ts";
import {
  applyMealPrecisionFlowState,
  readMealPrecisionFlowState,
} from "../../_shared/keel/meal_precision_flow_state.ts";
import { classifyMealPrecisionIntent } from "../../_shared/keel/meal_precision_intent.ts";
import {
  assessMealPrecision,
  gateMealPrecisionQuestion,
  type MealPrecisionAxis,
  type PrecisionPlanLine,
} from "../../_shared/keel/meal_precision.ts";
import {
  countMealPrecisionQuestionsToday,
  recordMealPrecisionQuestion,
} from "../../_shared/keel/meal_precision_cap.ts";
import { protocolEventComponentKey } from "../tools/always_on/log_protocol_event/contract.ts";

export interface MealPrecisionLaneResult {
  /** `temp_memory` à reporter sur le local du tour. Toujours rendu. */
  tempMemory: Record<string, unknown>;
  /**
   * L'ÉTAT DE FLOW À RÉ-APPLIQUER APRÈS LA GÉNÉRATION, et pourquoi il ne
   * suffit pas de rendre `tempMemory`.
   *
   * Le companion reconstruit `temp_memory` depuis l'état PRÉ-routing
   * (`agents/companion.ts :: nextTempMemory`): tout ce que la lane écrit sur le
   * local du tour est effacé au moment de la persistance. Mesuré en run réel —
   * après un amendement réussi, le flow FERMÉ réapparaissait ouvert au tour
   * suivant, `turns` figé à 0. Un flow qui survit à sa fermeture capture les
   * tours suivants et transforme chaque phrase de l'élève en amendement d'un
   * repas qu'il a oublié: exactement ce que l'en-tête de
   * `meal_precision_flow_state.ts` annonce comme interdit.
   *
   *   `undefined` — la lane n'a touché à rien (aucun flow ouvert).
   *   `null`      — le flow doit être EFFACÉ.
   *   un état     — le flow doit être écrit.
   */
  flowToCommit?: MealPrecisionFlowState | null;
  /** Les aliments à conserver avec l'état, quand il y en a un. */
  detectedFoods: string[];
  /**
   * true quand le tour ne doit PLUS armer `log_protocol_event` du tout: la
   * parole de l'élève a été absorbée par un amendement qui n'ajoute aucun fait.
   */
  suppressLogProtocolEvent: boolean;
  /**
   * Les identités DÉJÀ écrites pour ce repas. L'intake doit les refuser, sinon
   * un aliment re-mentionné dans la réponse devient un second fait sous une
   * autre clé de message. Vide quand la lane n'a rien à dire.
   */
  suppressComponentKeys: string[];
  /**
   * La ligne d'origine à laquelle rattacher un composant AJOUTÉ par la réponse.
   * Rend le lien visible dans `recognized`, donc au coach et à l'évaluateur.
   */
  linkToEventId: string | null;
  amended:
    | null
    | {
      eventIds: string[];
      amendment: "answer" | "correction";
      clearedCreditEventIds: string[];
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

function idle(
  tempMemory: Record<string, unknown>,
  reason: string,
  flowToCommit?: MealPrecisionFlowState | null,
  detectedFoods: string[] = [],
): MealPrecisionLaneResult {
  return {
    tempMemory,
    flowToCommit,
    detectedFoods,
    suppressLogProtocolEvent: false,
    suppressComponentKeys: [],
    linkToEventId: null,
    amended: null,
    reason,
  };
}

/**
 * Consulte le flow de précision ouvert et, si le tour l'amende, applique
 * l'amendement.
 *
 * Rend TOUJOURS un `tempMemory` utilisable: quand aucun flow n'est ouvert,
 * c'est l'objet reçu, inchangé. L'appelant peut donc l'affecter sans condition.
 */
export async function runMealPrecisionLane(args: {
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
  classify?: typeof classifyMealPrecisionIntent;
}): Promise<MealPrecisionLaneResult> {
  const base = (args.tempMemory && typeof args.tempMemory === "object" &&
      !Array.isArray(args.tempMemory))
    ? { ...(args.tempMemory as Record<string, unknown>) }
    : {};

  const stored = readMealPrecisionFlowState(base);
  if (!stored) return idle(base, "no_open_flow");

  const classify = args.classify ?? classifyMealPrecisionIntent;
  const { intent } = await classify({
    source: stored.flow.source,
    question: stored.flow.question,
    detectedFoods: stored.detected_foods,
    inboundText: args.userMessage,
    hasMedia: args.hasMedia,
    requestId: args.requestId,
    userId: args.userId,
  });

  const decision = reduceMealPrecisionFlow({
    flow: stored.flow,
    intent,
    safetyBand: asSafetyBand(args.safetyBand),
    now: args.now,
  });

  // `stay` laisse le tour à son chemin normal — c'est le comportement d'avant
  // ce câblage, et c'est ce que produit une classification incertaine.
  if (decision.kind === "stay") {
    return idle(
      applyMealPrecisionFlowState({
        tempMemory: base,
        flow: decision.nextFlow,
        detectedFoods: stored.detected_foods,
        now: args.now,
      }),
      `stay:${intent}`,
      decision.nextFlow,
      stored.detected_foods,
    );
  }

  if (decision.kind === "exit") {
    // ── TRACÉ, parce que la sortie est le chemin le plus coûteux ────────────
    // Mesuré le 2026-08-05: sur 12 démentis, 5 ont été routés en `exit` — le
    // flow se ferme, RIEN n'est amendé, et Sophia répond quand même « Got it —
    // it was pasta, not what I said before ». Un accusé fantôme. Trois de ces
    // tours ont même écrit une SECONDE ligne `protocol_events`: l'élève a mangé
    // une fois, son coach en compte deux. Aucun de ces tours ne laissait la
    // moindre ligne de log — seul le cas amendé était journalisé, donc le
    // chemin qui casse était le seul invisible.
    console.log(JSON.stringify({
      tag: "meal_precision_flow_exit",
      user_id: args.userId,
      reason: decision.reason,
      intent,
      // Ce qu'on RENONCE à amender en sortant: c'est le coût du tour.
      abandoned_event_ids: stored.flow.eventIds,
      abandoned_tick_event_ids: stored.flow.tickEventIds ?? [],
    }));
    // Le flow se ferme (autre sujet, autre repas, nouvelle photo, timeout,
    // plafond, crise). On n'absorbe RIEN: le tour doit pouvoir écrire son
    // propre fait, et une nouvelle photo doit pouvoir ouvrir le sien.
    return idle(
      applyMealPrecisionFlowState({ tempMemory: base, flow: null, now: args.now }),
      `exit:${decision.reason}`,
      null,
    );
  }

  const result = await amendMealPrecisionEvents(args.supabase, {
    eventIds: decision.eventIds,
    // Non vide seulement sur une `correction`: le démenti du plat décoche la
    // ligne `quick_tap` qui en découlait.
    tickEventIds: decision.tickEventIds,
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
      tag: "meal_precision_amend_failed",
      user_id: args.userId,
      event_ids: decision.eventIds,
      reason: result.reason,
    }));
    return idle(
      applyMealPrecisionFlowState({ tempMemory: base, flow: null, now: args.now }),
      `amend_failed:${result.reason ?? "unknown"}`,
      null,
    );
  }

  return {
    tempMemory: applyMealPrecisionFlowState({
      tempMemory: base,
      flow: decision.nextFlow,
      detectedFoods: stored.detected_foods,
      now: args.now,
    }),
    // Le reducer ferme le flow après un amendement: `nextFlow.state === "closed"`
    // vaut EFFACEMENT, et c'est cet effacement qui doit survivre à la
    // reconstruction post-génération.
    flowToCommit: decision.nextFlow.state === "closed" ? null : decision.nextFlow,
    detectedFoods: [...stored.detected_foods],
    // Une CORRECTION n'ajoute rien: l'effet est retiré du tour. Une RÉPONSE
    // peut ajouter, mais seulement ce qui n'est pas déjà écrit.
    suppressLogProtocolEvent: !decision.allowsNewComponents,
    suppressComponentKeys: decision.allowsNewComponents
      ? [...stored.flow.componentKeys]
      : [],
    // Le lien pointe la PREMIÈRE ligne du repas: c'est l'ancre du repas pour
    // un lecteur humain. Les autres lignes sont atteignables par elle, et
    // stocker la liste entière dans chaque ligne ajoutée ferait grossir un
    // jsonb sans rien apprendre de plus.
    linkToEventId: decision.allowsNewComponents
      ? (result.amendedEventIds[0] ?? null)
      : null,
    amended: {
      eventIds: result.amendedEventIds,
      amendment: decision.amendment,
      clearedCreditEventIds: result.clearedCreditEventIds,
    },
    reason: `amended:${decision.amendment}`,
  };
}

// ===========================================================================
// L'ARMEMENT DE LA QUESTION — après l'écriture, jamais avant
// ===========================================================================

/**
 * Ce que le tour a écrit, réduit à ce dont l'évaluation a besoin.
 *
 * C'est volontairement la forme d'un `committed_effect` de
 * `log_protocol_event`: l'évaluation porte sur ce que la BASE a rendu, pas sur
 * ce que le modèle a demandé. Une question posée sur un composant refusé à
 * l'écriture parlerait d'un repas qui n'existe pas.
 */
export interface CommittedMealFact {
  protocol_event_id: string;
  food_group_ref: string | null;
  substance_ref: string | null;
  commitment_id: string | null;
  slot_key: string | null;
}

export interface ArmedMealPrecisionQuestion {
  question: string;
  axis: MealPrecisionAxis;
  flow: MealPrecisionFlowState;
  /** Nommé même quand on ne pose rien: le refus doit être lisible en trace. */
  reason_code: string;
}

export interface MealPrecisionArmResult {
  armed: ArmedMealPrecisionQuestion | null;
  reason_code: string;
}

/**
 * Décide si ce tour pose une question de précision, et l'ARME.
 *
 * L'ORDRE EST LE CONTRAT, et il est celui de l'honnêteté:
 *   1. on n'évalue QUE ce qui a été committé (des lignes relues);
 *   2. le gate refuse pour une raison NOMMÉE (crise, intention future, plafond,
 *      flow déjà ouvert, aucun axe);
 *   3. la place du plafond est CONSOMMÉE AVANT que la question ne parte. Si
 *      l'inscription échoue, la question ne part pas: mieux vaut une question
 *      perdue qu'un plafond qui ne plafonne rien — c'est la même posture que
 *      « pas d'accusé sans ligne », appliquée au compteur.
 */
export async function armMealPrecisionQuestion(args: {
  supabase: SupabaseClient;
  userId: string;
  committed: readonly CommittedMealFact[];
  planLines: readonly PrecisionPlanLine[];
  slotKey: string | null;
  safetyBand: string | null | undefined;
  futureIntent: boolean;
  flowAlreadyOpen: boolean;
  localDate: string | null;
  sourceMessageId: string;
  now: Date;
}): Promise<MealPrecisionArmResult> {
  const committed = args.committed.filter((fact) =>
    String(fact.protocol_event_id ?? "").trim() !== ""
  );

  const assessment = assessMealPrecision({
    components: committed.map((fact) => ({
      food_group_ref: fact.food_group_ref,
      substance_ref: fact.substance_ref,
      commitment_id: fact.commitment_id,
    })),
    slotKey: args.slotKey,
    planLines: args.planLines,
  });

  // Le plafond n'est lu QUE si tout le reste laisse passer: une lecture en base
  // par tour d'élève, et seulement quand elle peut changer quelque chose.
  const cheapGate = gateMealPrecisionQuestion({
    assessment,
    safetyBand: args.safetyBand,
    futureIntent: args.futureIntent,
    committedEventCount: committed.length,
    questionsAskedToday: 0,
    flowAlreadyOpen: args.flowAlreadyOpen,
  });
  if (!cheapGate.ask) return { armed: null, reason_code: cheapGate.reason_code };

  const localDate = String(args.localDate ?? "").trim();
  const count = await countMealPrecisionQuestionsToday(args.supabase, {
    userId: args.userId,
    localDate,
  });
  const gate = gateMealPrecisionQuestion({
    assessment,
    safetyBand: args.safetyBand,
    futureIntent: args.futureIntent,
    committedEventCount: committed.length,
    questionsAskedToday: count.count,
    flowAlreadyOpen: args.flowAlreadyOpen,
  });
  if (!gate.ask || gate.axis === null || gate.question === null) {
    return { armed: null, reason_code: `${gate.reason_code}:${count.reason}` };
  }

  // LA PLACE EST PRISE AVANT LA QUESTION. Un `record` qui échoue arrête tout:
  // une question posée hors compteur rend le plafond décoratif, et c'est
  // exactement l'élève à huit questions par jour qu'on cherche à éviter.
  const recorded = await recordMealPrecisionQuestion(args.supabase, {
    userId: args.userId,
    localDate,
    source: "text",
    axis: gate.axis,
    question: gate.question,
    protocolEventId: committed[0]?.protocol_event_id ?? null,
    askedForMessageId: args.sourceMessageId,
  });
  if (!recorded.ok) {
    return { armed: null, reason_code: `cap_record_failed` };
  }
  if (recorded.alreadyRecorded) {
    // Rejeu du même message: la question est déjà partie une fois. La reposer
    // ferait deux questions pour un repas, et le flow rouvert écraserait un
    // état plus avancé.
    return { armed: null, reason_code: "already_asked_for_this_message" };
  }

  return {
    armed: {
      question: gate.question,
      axis: gate.axis,
      reason_code: "ask",
      flow: openMealPrecisionFlow({
        source: "text",
        eventIds: committed.map((fact) => fact.protocol_event_id),
        // LES IDENTITÉS DU REPAS. C'est ce qui empêchera la réponse « du poulet
        // avec du riz » de réécrire le poulet: la clé est calculée par la MÊME
        // fonction que l'écriture, donc les deux ne peuvent pas diverger.
        componentKeys: committed.map((fact) =>
          protocolEventComponentKey({
            food_group_ref: fact.food_group_ref,
            substance_ref: fact.substance_ref,
            commitment_id: fact.commitment_id,
          })
        ),
        question: gate.question,
        axis: gate.axis,
        now: args.now,
      }),
    },
    reason_code: "ask",
  };
}
