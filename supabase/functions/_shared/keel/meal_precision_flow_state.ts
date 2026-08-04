// LA PERSISTANCE DU FLOW DE PRÉCISION, entre le tour qui l'ouvre et celui qui
// l'amende.
//
// POURQUOI UNE CLÉ DÉDIÉE, ET PAS `active_flow_state.ts`
// ------------------------------------------------------
// Le registre des flows locaux (`sophia-brain/router/active_flow_state.ts`)
// suppose qu'un flow SAUTE le dispatcher global et prend la main sur le tour.
// Ce n'est pas ce qu'on veut ici: quand l'élève précise son repas, le tour
// doit continuer normalement — Sophia répond, la mémoire tourne, la safety
// s'applique. La seule chose qui change, c'est que la réponse AMENDE le fait
// au lieu d'en écrire un second.
//
// C'est exactement la forme de `disordered_eating_guard`: un reducer pur, un
// état sur une clé de `temp_memory` dédiée, hors registre.
//
// DEUX ÉCRIVAINS, UN SEUL FORMAT
// ------------------------------
// `meal-photo-upload-v1` OUVRE le flow côté photo (il vient de poster
// l'accusé), `sophia-brain` l'ouvre côté texte et le referme dans les deux cas.
// Les deux vivent dans des fonctions edge différentes, d'où ce module partagé:
// deux lectures de la même clé écrites à deux endroits finissent par diverger.
//
// LA CLÉ DE `temp_memory` N'A PAS CHANGÉ malgré la généralisation, et ce n'est
// pas de la paresse. Un état photo ouvert au moment du déploiement doit rester
// lisible: le renommer orphelinerait ces flows-là, et chacun tient une
// correction d'élève qui repartirait écrire un doublon. La lecture accepte donc
// AUSSI la forme historique (`eventId` au singulier, sans `source`).

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import type {
  MealPrecisionFlowState,
  MealPrecisionSourceKind,
} from "./meal_precision_flow.ts";
import {
  MEAL_PRECISION_AXES,
  type MealPrecisionAxis,
} from "./meal_precision.ts";

export const KEEL_MEAL_PRECISION_FLOW_STATE_KEY = "__keel_meal_photo_flow_state";

export interface KeelMealPrecisionFlowState {
  flow: MealPrecisionFlowState;
  /**
   * Ce qui a été enregistré, en clair. C'est la CIBLE d'une correction: sans
   * cette liste, le classifieur ne peut pas distinguer « non, c'était du
   * poulet » (correction de ce qui est écrit) de « ce soir je mange du poulet »
   * (une intention future, qui n'amende rien).
   */
  detected_foods: string[];
  updated_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry ?? "")).filter((entry) => entry !== "")
    : [];
}

/** Relit l'état, ou `null` s'il est absent ou déformé. Ne jette jamais. */
export function readMealPrecisionFlowState(
  tempMemory: unknown,
): KeelMealPrecisionFlowState | null {
  if (!isRecord(tempMemory)) return null;
  const raw = tempMemory[KEEL_MEAL_PRECISION_FLOW_STATE_KEY];
  if (!isRecord(raw)) return null;
  const flow = raw.flow;
  if (!isRecord(flow)) return null;

  // COMPATIBILITÉ ASCENDANTE, volontaire et bornée: la forme historique portait
  // `eventId` au singulier. Un état ouvert avant le déploiement doit rester
  // amendable — sinon la correction qu'il attendait repart écrire un doublon,
  // c'est-à-dire exactement le défaut que tout ce chantier ferme.
  const eventIds = stringList(flow.eventIds);
  const legacyEventId = String(flow.eventId ?? "").trim();
  const resolvedEventIds = eventIds.length > 0
    ? eventIds
    : (legacyEventId ? [legacyEventId] : []);

  const openedAt = String(flow.openedAt ?? "");
  // Un état sans ligne à amender ni horloge d'ouverture n'est pas un état: le
  // reducer calculerait un timeout sur `NaN` et resterait ouvert pour toujours.
  if (resolvedEventIds.length === 0 || !openedAt) return null;

  const state = String(flow.state ?? "");
  if (state !== "awaiting_clarification" && state !== "awaiting_correction") {
    // `closed` est écrit puis effacé; le relire comme ouvert rouvrirait un flow
    // que le tour précédent a explicitement fermé.
    return null;
  }

  const rawSource = String(flow.source ?? "").trim();
  // Sans `source`, l'état vient de la forme historique, donc d'une photo.
  const source: MealPrecisionSourceKind = rawSource === "text" ? "text" : "photo";

  const rawAxis = String(flow.axis ?? "").trim();
  const axis: MealPrecisionAxis | null =
    (MEAL_PRECISION_AXES as readonly string[]).includes(rawAxis)
      ? rawAxis as MealPrecisionAxis
      : null;

  const turns = Number(flow.turns);
  return {
    flow: {
      state,
      source,
      eventIds: resolvedEventIds,
      componentKeys: stringList(flow.componentKeys),
      openedAt,
      turns: Number.isFinite(turns) ? turns : 0,
      question: typeof flow.question === "string" ? flow.question : null,
      axis,
    },
    detected_foods: stringList(raw.detected_foods),
    updated_at: String(raw.updated_at ?? ""),
  };
}

/**
 * Écrit l'état, ou l'EFFACE quand `flow` est `null` ou fermé.
 *
 * L'effacement est aussi important que l'écriture: un flow qui survit à sa
 * fermeture capture les tours suivants et transforme chaque phrase de l'élève
 * en amendement d'un repas qu'il a oublié.
 */
export function applyMealPrecisionFlowState(args: {
  tempMemory: Record<string, unknown>;
  flow: MealPrecisionFlowState | null;
  detectedFoods?: readonly string[];
  now: Date;
}): Record<string, unknown> {
  const next = { ...args.tempMemory };
  if (!args.flow || args.flow.state === "closed") {
    delete next[KEEL_MEAL_PRECISION_FLOW_STATE_KEY];
    return next;
  }
  next[KEEL_MEAL_PRECISION_FLOW_STATE_KEY] = {
    flow: args.flow,
    detected_foods: [...(args.detectedFoods ?? [])].map((f) => String(f)),
    updated_at: args.now.toISOString(),
  } satisfies KeelMealPrecisionFlowState;
  return next;
}

/**
 * Ouvre le flow depuis une fonction edge qui n'est pas `sophia-brain`.
 *
 * `meal-photo-upload-v1` vient de poster l'accusé; c'est LE moment où le flow
 * s'ouvre, et il n'a pas d'autre accès à `user_chat_states`. La lecture avant
 * écriture n'est pas un check-then-act dangereux ici: le pire cas est d'écraser
 * un flow précédent, ce que le reducer ferait de toute façon sur `new_photo` —
 * la photo suivante ferme la précédente.
 *
 * Best-effort par contrat: un échec ici ne doit JAMAIS défaire une photo déjà
 * enregistrée et déjà analysée. On rend `false` et l'appelant continue.
 */
export async function openMealPrecisionFlowState(
  db: SupabaseClient,
  args: {
    userId: string;
    scope: string;
    flow: MealPrecisionFlowState;
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
    const next = applyMealPrecisionFlowState({
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
