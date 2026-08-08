/**
 * FF-021 R7 — LA QUESTION DE PRÉCISION SE TAIT SOUS PLANCHER DE RESTRICTION.
 *
 * ── CE QUE CES TESTS ÉPINGLENT, ET POURQUOI ILS EXISTENT ────────────────────
 * Mesuré 3/3 en run réel le 2026-08-08 (vrai modèle, base locale, élève
 * provisionné): plancher `rapid_weight_loss` levé, épisode clinique CLOS par le
 * plafond de six tours du reducer, puis « I had grilled chicken and rice for
 * lunch today » ⇒ `owner=normal_reply`, deux lignes `protocol_events`, et la
 * question « And what did you have with it? » inscrite au budget de demande.
 *
 * La cause n'est pas un oubli de gate: c'est que le SEUL gate était le routeur,
 * et que le routeur lit le drapeau ÉPISODIQUE (`null` après fermeture, exprès —
 * un flow clinique dont on ne sort pas est un piège) et non le drapeau BRUT.
 * La suppression, elle, ne se lève que par une revue coach.
 *
 * Le paramètre est REQUIS: l'omettre ne compile pas. C'est la moitié qui
 * survit à la prochaine lane (`optional-gate-params-are-disarmed-gates`).
 */
import { assertEquals } from "jsr:@std/assert@1";

import { armMealPrecisionQuestion } from "./keel_meal_precision_lane.ts";

/** Un client qui EXPLOSE si on le touche: le refus doit précéder toute I/O. */
// deno-lint-ignore no-explicit-any
const forbiddenDb: any = {
  from(table: string) {
    throw new Error(
      `la lane a lu '${table}' alors que le plancher de restriction est levé`,
    );
  },
};

const BASE = {
  supabase: forbiddenDb,
  userId: "u-ff021",
  responseLocale: "en-GB",
  committed: [
    {
      protocol_event_id: "evt-1",
      food_group_ref: "lean_protein",
      substance_ref: null,
      commitment_id: "c-1",
      slot_key: "lunch",
    },
  ],
  planLines: [
    {
      commitment_id: "c-1",
      polarity: "do",
      food_group_ref: "lean_protein",
      bucket: "protein",
      status: "unknown",
      grain: "day",
      slot_kind: "nominal",
    },
  ],
  slotKey: "lunch",
  safetyBand: "none" as string | null | undefined,
  futureIntent: false,
  flowAlreadyOpen: false,
  localDate: "2026-08-08",
  sourceMessageId: "msg-1",
  now: new Date("2026-08-08T12:00:00Z"),
};

Deno.test("FF-021 — plancher levé: aucune question, et pas une seule lecture", async () => {
  const result = await armMealPrecisionQuestion({
    ...BASE,
    // deno-lint-ignore no-explicit-any
    planLines: BASE.planLines as any,
    restrictionFlag: true,
  });
  assertEquals(result.armed, null);
  assertEquals(result.reason_code, "restriction_flag");
});

Deno.test("FF-021 — le refus ne dépend PAS de la bande de sécurité", async () => {
  // Les deux planchers sont indépendants: `safety_band: none` (le cas nominal
  // d'un élève qui va bien par ailleurs) ne doit pas rouvrir la lane.
  const result = await armMealPrecisionQuestion({
    ...BASE,
    // deno-lint-ignore no-explicit-any
    planLines: BASE.planLines as any,
    safetyBand: null,
    restrictionFlag: true,
  });
  assertEquals(result.reason_code, "restriction_flag");
});
