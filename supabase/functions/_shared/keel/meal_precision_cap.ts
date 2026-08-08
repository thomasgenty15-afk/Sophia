// LE PLAFOND, CÔTÉ QUESTION DE PRÉCISION — un ADAPTATEUR, plus un compteur.
//
// ── CE QUI A CHANGÉ, ET POURQUOI ────────────────────────────────────────────
// Ce module était le seul accès à `meal_precision_questions`, et sa raison
// d'être était déjà la bonne: « deux lectures du même compteur écrites à deux
// endroits finiraient par diverger ». Le périmètre, lui, était trop étroit — le
// compteur ne connaissait qu'un genre de demande alors que la règle transverse
// T4 dit « une seule demande par jour, TOUTES SURFACES CONFONDUES ».
//
// Le compteur vit donc maintenant dans `daily_ask_budget.ts`, qui ne connaît
// aucune fiche. Ce fichier reste, et il ne fait plus qu'une chose: donner à la
// question de précision son vocabulaire (`source`, `axis`) au-dessus du geste
// commun. Ses deux fonctions gardent leur nom et leur signature — les réécrire
// chez les trois appelants n'aurait rien prouvé de plus et aurait touché
// `analyze-meal-photo-v1` sans raison.
//
// ⚠️ CE QUE CE FICHIER NE DOIT PLUS FAIRE: parler à Postgres. Le jour où il
// recommence, il y a deux compteurs, et le second est invisible.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import {
  countDailyAsks,
  DAILY_ASK_BUDGET,
  DAILY_ASK_LEDGER_TABLE,
  recordDailyAsk,
} from "./daily_ask_budget.ts";
import type { MealPrecisionAxis } from "./meal_precision.ts";

/** @deprecated Cite `DAILY_ASK_LEDGER_TABLE`: la table n'est plus à cette fiche. */
export const MEAL_PRECISION_QUESTIONS_TABLE = DAILY_ASK_LEDGER_TABLE;

export type MealPrecisionSource = "text" | "photo";

export interface MealPrecisionCountResult {
  /** Le nombre de demandes déjà parties ce jour local, TOUS GENRES confondus. */
  count: number;
  /** Toujours nommé. `read_failed` dit que le compte est un fail-closed. */
  reason: "counted" | "read_failed" | "missing_local_date";
}

/**
 * Combien de demandes cet élève a-t-il déjà reçues aujourd'hui ?
 *
 * ⚠️ LE COMPTE N'EST PLUS CELUI DES SEULES QUESTIONS DE PRÉCISION. Une
 * invitation à la photo (FF-025) ou une recommandation (FF-028) partie ce matin
 * ferme la question de cet après-midi, et c'est très exactement l'intention:
 * sans ça, l'élève reçoit une demande par surface et personne n'a enfreint sa
 * propre règle.
 */
export async function countMealPrecisionQuestionsToday(
  db: SupabaseClient,
  args: { userId: string; localDate: string | null | undefined },
): Promise<MealPrecisionCountResult> {
  return await countDailyAsks(db, args);
}

export interface MealPrecisionRecordResult {
  ok: boolean;
  /** true quand la ligne existait déjà (rejeu du même message). */
  alreadyRecorded: boolean;
  reason?: string;
}

/** Inscrit la question posée. Idempotent PAR LE SCHÉMA (voir `recordDailyAsk`). */
export async function recordMealPrecisionQuestion(
  db: SupabaseClient,
  args: {
    userId: string;
    localDate: string;
    source: MealPrecisionSource;
    axis: MealPrecisionAxis;
    question: string;
    protocolEventId: string | null;
    askedForMessageId: string;
  },
): Promise<MealPrecisionRecordResult> {
  return await recordDailyAsk(db, {
    userId: args.userId,
    localDate: args.localDate,
    kind: "meal_precision_question",
    source: args.source,
    axis: args.axis,
    text: args.question,
    protocolEventId: args.protocolEventId,
    askedForMessageId: args.askedForMessageId,
  });
}

/**
 * @deprecated Le plafond n'appartient plus à cette fiche: c'est
 * `DAILY_ASK_BUDGET`. Réexporté pour ne pas casser un import existant.
 */
export const MEAL_PRECISION_CAP = DAILY_ASK_BUDGET;
