// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LA LANE DES RAPPELS PONCTUELS PASSE À CHAQUE INTENTION
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — découpage des gros fichiers, lot 5b. Types seuls, aucun code
// exécuté. Ce module n'importe jamais `router.ts`.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type {
  OneShotReminderCommittedEffect,
  OneShotReminderDirectEffectTool,
} from "./contract.ts";
import type {
  maybeCancelOneShotReminder,
  maybeCreateOneShotReminder,
} from "./executor.ts";
import type { compileStructuredCreatePayload } from "./payload_compile.ts";

/** Les arguments de la lane : la signature de `runOneShotReminderDirectEffectInner`
 * (`router.ts`), sortie telle quelle. */
export type OneShotReminderLaneArgs = {
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
};

/**
 * L'état que `runOneShotReminderDirectEffectInner` passe aux intentions.
 *
 * Les six premiers champs sont des `let` du corps de la lane, que les
 * intentions lisent et réécrivent. Une intention qui rend `null` (le tour
 * continue) recopie d'abord ses valeurs finales dans l'objet, et `router.ts`
 * les reprend avant l'étape suivante. La septième `let` du corps,
 * `meridiemFusionApplied`, n'est lue que par le code resté dans `router.ts`.
 *
 * Les autres champs sont des constantes du tour.
 */
export type OneShotReminderIntentState = {
  createEffect: TurnFrame["direct_effects"][number] | undefined;
  compiledPayload: ReturnType<typeof compileStructuredCreatePayload>;
  allowDuplicateForTurn: boolean;
  replaceCancelCommitted: OneShotReminderCommittedEffect[] | null;
  replaceCancelledLabel: string | null;
  replaceCancelForbidden: boolean;
  now: Date;
  additiveMarker: boolean;
  effectType: OneShotReminderDirectEffectTool;
  pendingCreateSlots: Record<string, unknown> | null;
  cancelCarriesFullCreatePayload: boolean;
  /** `completeMissingPayloadTime` de `router.ts`, qui lit `createEffect` et
   * réécrit `compiledPayload` DANS le corps de la lane : on lui donne les
   * valeurs courantes de l'intention, elle rend le `compiledPayload` complété. */
  completeMissingPayloadTime: (current: {
    createEffect: OneShotReminderIntentState["createEffect"];
    compiledPayload: OneShotReminderIntentState["compiledPayload"];
  }) => Promise<OneShotReminderIntentState["compiledPayload"]>;
};
