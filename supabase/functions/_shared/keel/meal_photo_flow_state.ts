// LA PERSISTANCE DU FLOW PHOTO, entre le tour qui l'ouvre et celui qui l'amende.
//
// POURQUOI UNE CLÉ DÉDIÉE, ET PAS `active_flow_state.ts`
// ------------------------------------------------------
// Le registre des flows locaux (`sophia-brain/router/active_flow_state.ts`)
// suppose qu'un flow SAUTE le dispatcher global et prend la main sur le tour.
// Ce n'est pas ce qu'on veut ici: quand l'élève corrige son assiette, le tour
// doit continuer normalement — Sophia répond, la mémoire tourne, la safety
// s'applique. La seule chose qui change, c'est que la correction AMENDE le fait
// au lieu d'en écrire un second.
//
// C'est exactement la forme de `disordered_eating_guard`: un reducer pur, un
// état sur une clé de `temp_memory` dédiée, hors registre. Le commentaire de
// `run.ts` autour de `KEEL_DISORDERED_EATING_STATE_KEY` explique le même choix.
//
// DEUX ÉCRIVAINS, UN SEUL FORMAT
// ------------------------------
// `meal-photo-upload-v1` OUVRE le flow (il vient de poster l'accusé), et
// `sophia-brain` le lit, le réduit et le referme. Les deux vivent dans des
// fonctions edge différentes, d'où ce module partagé: deux lectures de la même
// clé écrites à deux endroits finissent par diverger.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import type { MealPhotoFlowState } from "./meal_photo_flow.ts";

export const KEEL_MEAL_PHOTO_FLOW_STATE_KEY = "__keel_meal_photo_flow_state";

export interface KeelMealPhotoFlowState {
  flow: MealPhotoFlowState;
  /**
   * Ce que l'analyse a annoncé voir. C'est la CIBLE d'une correction: sans
   * cette liste, le classifieur ne peut pas distinguer « non, c'était du
   * poulet » (correction de la lecture) de « ce soir je mange du poulet »
   * (une intention future, qui n'amende rien).
   */
  detected_foods: string[];
  updated_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Relit l'état, ou `null` s'il est absent ou déformé. Ne jette jamais. */
export function readMealPhotoFlowState(
  tempMemory: unknown,
): KeelMealPhotoFlowState | null {
  if (!isRecord(tempMemory)) return null;
  const raw = tempMemory[KEEL_MEAL_PHOTO_FLOW_STATE_KEY];
  if (!isRecord(raw)) return null;
  const flow = raw.flow;
  if (!isRecord(flow)) return null;
  const eventId = String(flow.eventId ?? "");
  const openedAt = String(flow.openedAt ?? "");
  // Un état sans ligne à amender ni horloge d'ouverture n'est pas un état: le
  // reducer calculerait un timeout sur `NaN` et resterait ouvert pour toujours.
  if (!eventId || !openedAt) return null;
  const state = String(flow.state ?? "");
  if (state !== "awaiting_clarification" && state !== "awaiting_correction") {
    // `closed` est écrit puis effacé; le relire comme ouvert rouvrirait un flow
    // que le tour précédent a explicitement fermé.
    return null;
  }
  const turns = Number(flow.turns);
  return {
    flow: {
      state,
      eventId,
      openedAt,
      turns: Number.isFinite(turns) ? turns : 0,
      question: typeof flow.question === "string" ? flow.question : null,
    },
    detected_foods: Array.isArray(raw.detected_foods)
      ? raw.detected_foods.map((f) => String(f)).filter((f) => f !== "")
      : [],
    updated_at: String(raw.updated_at ?? ""),
  };
}

/**
 * Écrit l'état, ou l'EFFACE quand `flow` est `null` ou fermé.
 *
 * L'effacement est aussi important que l'écriture: un flow qui survit à sa
 * fermeture capture les tours suivants et transforme chaque phrase de l'élève
 * en amendement d'une photo qu'il a oubliée.
 */
export function applyMealPhotoFlowState(args: {
  tempMemory: Record<string, unknown>;
  flow: MealPhotoFlowState | null;
  detectedFoods?: readonly string[];
  now: Date;
}): Record<string, unknown> {
  const next = { ...args.tempMemory };
  if (!args.flow || args.flow.state === "closed") {
    delete next[KEEL_MEAL_PHOTO_FLOW_STATE_KEY];
    return next;
  }
  next[KEEL_MEAL_PHOTO_FLOW_STATE_KEY] = {
    flow: args.flow,
    detected_foods: [...(args.detectedFoods ?? [])].map((f) => String(f)),
    updated_at: args.now.toISOString(),
  } satisfies KeelMealPhotoFlowState;
  return next;
}

/**
 * Ouvre le flow depuis une fonction edge qui n'est pas `sophia-brain`.
 *
 * `meal-photo-upload-v1` vient de poster l'accusé; c'est LE moment où le flow
 * s'ouvre, et il n'a pas d'autre accès à `user_chat_states`. La lecture avant
 * écriture n'est pas un check-then-act dangereux ici: le pire cas est d'écraser
 * un flow photo précédent, ce que le reducer ferait de toute façon sur
 * `new_photo` — la photo suivante ferme la précédente.
 *
 * Best-effort par contrat: un échec ici ne doit JAMAIS défaire une photo déjà
 * enregistrée et déjà analysée. On rend `false` et l'appelant continue.
 */
export async function openMealPhotoFlowState(
  db: SupabaseClient,
  args: {
    userId: string;
    scope: string;
    flow: MealPhotoFlowState;
    detectedFoods: readonly string[];
    now: Date;
  },
): Promise<boolean> {
  try {
    const current = await db
      .from("user_chat_states")
      .select("temp_memory")
      .eq("user_id", args.userId)
      .eq("scope", args.scope)
      .maybeSingle();
    if (current.error) return false;
    const tempMemory = isRecord(current.data?.temp_memory)
      ? current.data!.temp_memory as Record<string, unknown>
      : {};
    const next = applyMealPhotoFlowState({
      tempMemory,
      flow: args.flow,
      detectedFoods: args.detectedFoods,
      now: args.now,
    });
    const written = await db
      .from("user_chat_states")
      .upsert(
        {
          user_id: args.userId,
          scope: args.scope,
          temp_memory: next,
          updated_at: args.now.toISOString(),
        } as never,
        { onConflict: "user_id,scope" },
      );
    return !written.error;
  } catch {
    return false;
  }
}
