// LA LANE DE CORRECTION PHOTO — ce qu'elle absorbe, et ce qu'elle laisse passer.
//
// Le test qui porte la doctrine: « une correction amende et DÉSARME
// log_protocol_event ». Les autres sont ses conditions de désarmement — les cas
// où la lane doit se taire, parce qu'une lane qui absorbe trop est pire que le
// défaut qu'elle corrige: elle fait disparaître de vrais repas.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  applyMealPrecisionFlowState,
  KEEL_MEAL_PRECISION_FLOW_STATE_KEY,
  readMealPrecisionFlowState,
} from "../../_shared/keel/meal_precision_flow_state.ts";
import { openMealPrecisionFlow } from "../../_shared/keel/meal_precision_flow.ts";
import type { MealPrecisionIntent } from "../../_shared/keel/meal_precision_flow.ts";
import { runMealPrecisionLane } from "./keel_meal_precision_lane.ts";

const OPENED_AT = new Date("2026-08-04T12:00:00.000Z");
const NOW = new Date("2026-08-04T12:05:00.000Z");
const USER = "student-1";
const EVENT = "evt-1";

function memoryWithOpenFlow(question: string | null = "Was this cooked in oil?") {
  return applyMealPrecisionFlowState({
    tempMemory: { some_other_key: 1 },
    flow: openMealPrecisionFlow({
      source: "photo",
      eventIds: [EVENT],
      componentKeys: ["food_group:red_meat"],
      question,
      now: OPENED_AT,
    }),
    detectedFoods: ["pork", "rice"],
    now: OPENED_AT,
  });
}

const classifyAs = (intent: MealPrecisionIntent) =>
  // deno-lint-ignore no-explicit-any
  ((_: unknown) => Promise.resolve({ intent, confidence: 0.95 })) as any;

/** Un faux client: on n'exerce que le chemin `protocol_events` de la lane. */
function fakeDb(opts: { row?: Record<string, unknown> | null; failUpdate?: boolean }) {
  const updates: Array<Record<string, unknown>> = [];
  const row = opts.row === undefined
    ? { id: EVENT, user_id: USER, recognized: { commitment_id: "c1" }, food_group_ref: "red_meat" }
    : opts.row;
  // deno-lint-ignore no-explicit-any
  const db: any = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: row, error: null }),
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        updates.push(patch);
        return {
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: () =>
                  opts.failUpdate
                    ? Promise.resolve({ data: null, error: { message: "boom" } })
                    : Promise.resolve({
                      data: {
                        id: EVENT,
                        recognized: patch.recognized,
                        food_group_ref: "food_group_ref" in patch
                          ? patch.food_group_ref
                          : "red_meat",
                      },
                      error: null,
                    }),
              }),
            }),
          }),
        };
      },
    }),
  };
  return { db, updates };
}

Deno.test("lane: une correction amende ET désarme log_protocol_event", async () => {
  // LE test. Sans le désarmement, le doublon revient par la porte que la lane
  // vient de fermer.
  const { db, updates } = fakeDb({});
  const out = await runMealPrecisionLane({
    supabase: db,
    userId: USER,
    userMessage: "non c'était du poulet",
    hasMedia: false,
    tempMemory: memoryWithOpenFlow(),
    safetyBand: "none",
    now: NOW,
    classify: classifyAs("corrects_declaration"),
  });

  assertEquals(out.suppressLogProtocolEvent, true);
  assertEquals(out.amended?.eventIds, [EVENT]);
  assertEquals(out.amended?.amendment, "correction");
  // Le crédit machine tombe: l'élève vient de dire que la lecture est fausse.
  assertEquals(out.amended?.clearedCreditEventIds, [EVENT]);
  assertEquals(updates[0].food_group_ref, null);
  const amendments =
    (updates[0].recognized as Record<string, unknown>).amendments as unknown[];
  assertEquals(amendments.length, 1);
});

Deno.test("lane: sans flow ouvert, elle ne touche à rien", async () => {
  const { db, updates } = fakeDb({});
  const memory = { some_other_key: 1 };
  const out = await runMealPrecisionLane({
    supabase: db,
    userId: USER,
    userMessage: "j'ai mangé une pomme",
    hasMedia: false,
    tempMemory: memory,
    safetyBand: "none",
    now: NOW,
    classify: classifyAs("corrects_declaration"),
  });
  assertEquals(out.suppressLogProtocolEvent, false);
  assertEquals(out.amended, null);
  assertEquals(out.reason, "no_open_flow");
  assertEquals(updates.length, 0, "aucune écriture sans flow");
  assertEquals(out.tempMemory.some_other_key, 1, "le reste de temp_memory survit");
});

Deno.test("lane: un autre sujet ferme le flow et laisse le tour écrire", async () => {
  // L'escape hatch. Un élève qui change de sujet doit pouvoir enregistrer un
  // VRAI nouveau repas dans le même tour.
  const { db, updates } = fakeDb({});
  const out = await runMealPrecisionLane({
    supabase: db,
    userId: USER,
    userMessage: "sinon ce soir je fais du poisson",
    hasMedia: false,
    tempMemory: memoryWithOpenFlow(),
    safetyBand: "none",
    now: NOW,
    classify: classifyAs("unrelated"),
  });
  assertEquals(out.suppressLogProtocolEvent, false);
  assertEquals(updates.length, 0);
  assertEquals(readMealPrecisionFlowState(out.tempMemory), null, "le flow est fermé");
});

Deno.test("lane: un tour de crise ferme le flow, sans rien amender", async () => {
  const { db, updates } = fakeDb({});
  const out = await runMealPrecisionLane({
    supabase: db,
    userId: USER,
    userMessage: "oui à l'huile",
    hasMedia: false,
    tempMemory: memoryWithOpenFlow(),
    safetyBand: "high",
    now: NOW,
    classify: classifyAs("answers_question"),
  });
  assertEquals(out.amended, null);
  assertEquals(out.suppressLogProtocolEvent, false);
  assertEquals(updates.length, 0, "on n'écrit rien pendant une crise");
  assertEquals(readMealPrecisionFlowState(out.tempMemory), null);
});

Deno.test("lane: l'incertitude laisse le tour à son chemin normal", async () => {
  // La condition de désarmement la plus importante: un classifieur qui doute
  // ne doit jamais supprimer l'enregistrement d'un vrai repas.
  const { db, updates } = fakeDb({});
  const out = await runMealPrecisionLane({
    supabase: db,
    userId: USER,
    userMessage: "hmm",
    hasMedia: false,
    tempMemory: memoryWithOpenFlow(),
    safetyBand: "none",
    now: NOW,
    classify: classifyAs("unknown"),
  });
  assertEquals(out.suppressLogProtocolEvent, false);
  assertEquals(updates.length, 0);
  assert(out.reason.startsWith("stay:"), out.reason);
  // Le flow reste ouvert: le tour suivant peut encore corriger.
  assert(readMealPrecisionFlowState(out.tempMemory) !== null);
});

Deno.test("lane: passé 30 minutes, ce n'est plus la même photo", async () => {
  const { db, updates } = fakeDb({});
  const out = await runMealPrecisionLane({
    supabase: db,
    userId: USER,
    userMessage: "c'était du poulet en fait",
    hasMedia: false,
    tempMemory: memoryWithOpenFlow(),
    safetyBand: "none",
    now: new Date("2026-08-04T12:31:00.000Z"),
    classify: classifyAs("corrects_declaration"),
  });
  assertEquals(out.reason, "exit:timeout");
  assertEquals(out.suppressLogProtocolEvent, false);
  assertEquals(updates.length, 0);
});

Deno.test("lane: un amendement qui échoue ne fait pas perdre la parole de l'élève", async () => {
  // Mieux vaut un second fait — visible, corrigeable — qu'une parole perdue
  // parce qu'un UPDATE a échoué en silence. Donc: pas de suppression.
  const { db } = fakeDb({ failUpdate: true });
  const out = await runMealPrecisionLane({
    supabase: db,
    userId: USER,
    userMessage: "non c'était du poulet",
    hasMedia: false,
    tempMemory: memoryWithOpenFlow(),
    safetyBand: "none",
    now: NOW,
    classify: classifyAs("corrects_declaration"),
  });
  assertEquals(out.amended, null);
  assertEquals(out.suppressLogProtocolEvent, false);
  assert(out.reason.startsWith("amend_failed:"), out.reason);
});

Deno.test("lane: une ligne disparue (purge RGPD) n'absorbe pas le tour", async () => {
  const { db } = fakeDb({ row: null });
  const out = await runMealPrecisionLane({
    supabase: db,
    userId: USER,
    userMessage: "non c'était du poulet",
    hasMedia: false,
    tempMemory: memoryWithOpenFlow(),
    safetyBand: "none",
    now: NOW,
    classify: classifyAs("corrects_declaration"),
  });
  assertEquals(out.suppressLogProtocolEvent, false);
  assertEquals(readMealPrecisionFlowState(out.tempMemory), null);
});

Deno.test("état: un flow fermé ou déformé n'est jamais relu comme ouvert", () => {
  // Un flow qui survit à sa fermeture capture les tours suivants et transforme
  // chaque phrase en amendement d'une photo oubliée.
  assertEquals(readMealPrecisionFlowState(null), null);
  assertEquals(readMealPrecisionFlowState({}), null);
  assertEquals(
    readMealPrecisionFlowState({
      [KEEL_MEAL_PRECISION_FLOW_STATE_KEY]: { flow: { state: "closed", eventId: "e", openedAt: "x" } },
    }),
    null,
  );
  // Sans horloge d'ouverture, le timeout se calculerait sur NaN et le flow
  // resterait ouvert pour toujours.
  assertEquals(
    readMealPrecisionFlowState({
      [KEEL_MEAL_PRECISION_FLOW_STATE_KEY]: {
        flow: { state: "awaiting_correction", eventId: "e", openedAt: "" },
      },
    }),
    null,
  );
});
