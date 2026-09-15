import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";

import {
  inferSlotFromLocalHour,
  SLOT_INFERRED_KEY,
  slotWasInferred,
} from "./photo_slot_inference.ts";
import { renderMealPhotoAck } from "./meal_analysis.ts";

/**
 * FF-018 §11 — LE CRÉNEAU D'UNE PHOTO QUI N'EN DÉCLARE PAS.
 *
 * Ce que ces épreuves tiennent, et qui n'est pas l'arithmétique des heures:
 *   · une déduction ne sort JAMAIS sans sa marque (le type l'impose, un test le
 *     vérifie sur la clé qui voyage en base);
 *   · l'heure DÉCLARÉE bat le repli, sinon quelqu'un qui dîne à 22 h se voit
 *     ranger son assiette au dîner de la veille;
 *   · avant le premier créneau, on ne range RIEN — `null` est une réponse;
 *   · l'accusé le DIT, dans les deux langues, avec la porte de correction dans
 *     la même phrase (T9: toute garde est éprouvée dans les deux langues).
 */

const RHYTHM_LATE_DINNER = [
  { slot: "dinner", at: "22:00" },
];

Deno.test("le dernier créneau écoulé, et rien d'autre", () => {
  // Repli `SLOT_PASSED_HOUR`: breakfast 10, lunch 14, dinner 21.
  assertEquals(inferSlotFromLocalHour(7, null), null, "avant le petit-déjeuner");
  assertEquals(inferSlotFromLocalHour(9, null), null, "9 h: rien n'est écoulé");
  assertEquals(inferSlotFromLocalHour(10, null)?.slot, "breakfast", "10 h pile");
  assertEquals(inferSlotFromLocalHour(13, null)?.slot, "breakfast");
  assertEquals(inferSlotFromLocalHour(14, null)?.slot, "lunch", "14 h pile");
  // 16 h: le déjeuner, PAS un « goûter ». `snack_pm` n'a pas d'heure de
  // référence dans ce dépôt, et lui en inventer une ferait tomber la photo sur
  // une valeur que personne n'a choisie.
  assertEquals(inferSlotFromLocalHour(16, null)?.slot, "lunch");
  assertEquals(inferSlotFromLocalHour(21, null)?.slot, "dinner");
  assertEquals(inferSlotFromLocalHour(23, null)?.slot, "dinner");
});

Deno.test("une déduction porte TOUJOURS sa marque", () => {
  const inferred = inferSlotFromLocalHour(15, null);
  assert(inferred !== null);
  assertEquals(inferred.inferred, true, "un slot déduit sans marque devient un slot déclaré");
});

Deno.test("l'heure DÉCLARÉE bat le repli horaire", () => {
  // Quelqu'un qui a dit dîner à 22 h n'a pas dîné à 21 h 30.
  assertEquals(
    inferSlotFromLocalHour(21, RHYTHM_LATE_DINNER)?.slot,
    "lunch",
    "à 21 h, le dîner de 22 h n'est pas passé: on reste au déjeuner",
  );
  assertEquals(
    inferSlotFromLocalHour(22, RHYTHM_LATE_DINNER)?.slot,
    "dinner",
    "à 22 h il l'est",
  );
});

Deno.test("une heure impossible ne range rien", () => {
  for (const hour of [-1, 24, 3.5, Number.NaN]) {
    assertEquals(
      inferSlotFromLocalHour(hour, null),
      null,
      `heure ${hour}: aucune déduction`,
    );
  }
});

Deno.test("la marque se relit depuis `recognized`, et son absence vaut non", () => {
  assertEquals(slotWasInferred({ [SLOT_INFERRED_KEY]: true }), true);
  assertEquals(slotWasInferred({ [SLOT_INFERRED_KEY]: false }), false);
  // Une ligne d'avant ce lot, une ligne sans `recognized`, un jsonb cassé:
  // aucune ne doit se lire « déduit ». Le défaut penche du côté « déclaré par
  // l'élève », qui est ce que ces lignes portent réellement.
  assertEquals(slotWasInferred({}), false);
  assertEquals(slotWasInferred(null), false);
  assertEquals(slotWasInferred("nope"), false);
  assertEquals(slotWasInferred({ [SLOT_INFERRED_KEY]: "true" }), false);
});

// ---------------------------------------------------------------------------
// L'ACCUSÉ — T9: dans les deux langues, ou la garde n'existe pas
// ---------------------------------------------------------------------------

const EMPTY_ANALYSIS = {
  detected_foods: [
    {
      label: "roast chicken",
      label_localized: "poulet rôti",
      food_group_ref: null,
      confidence: 0.9,
    },
  ],
  food_groups_present: [],
  food_groups_absent: [],
  portion_band: "moderate",
  portion_rationale: "",
  commitment_matches: [],
  assumptions: [],
  clarifying_question: null,
  confidence_band: "medium",
  image_quality: "clear",
  subject_kind: "eaten_meal",
  disqualified_reason: null,
  issues: [],
} as unknown as Parameters<typeof renderMealPhotoAck>[0]["analysis"];

function ack(locale: string, inferredSlot: "breakfast" | "lunch" | "dinner" | null) {
  return renderMealPhotoAck({
    analysis: EMPTY_ANALYSIS,
    binding: { kind: "none" },
    commitmentTitles: {},
    hasPrescription: false,
    tickedDish: null,
    inferredSlot,
    locale,
  });
}

Deno.test("l'accusé DIT le créneau déduit, et ouvre la correction — EN et FR", () => {
  const en = ack("en-GB", "dinner");
  assert(en.includes("dinner"), `le créneau doit être nommé: ${en}`);
  assert(
    /tell me if it was another meal/i.test(en),
    `la porte de correction doit être dans la même phrase: ${en}`,
  );

  const fr = ack("fr-FR", "dinner");
  assert(fr.includes("dîner"), `le créneau doit être nommé en français: ${fr}`);
  assert(
    /dis-moi si c'était un autre repas/i.test(fr),
    `la porte de correction doit être là aussi: ${fr}`,
  );
  assert(!/tell me/i.test(fr), `aucun anglais résiduel: ${fr}`);
});

Deno.test("aucun créneau déduit ⇒ AUCUNE phrase de créneau", () => {
  // Le cas de l'écran: l'élève a dit lui-même quel repas c'était. Lui annoncer
  // un rangement qu'il a fait serait du bruit — et pire, ça lui ferait croire
  // que la machine a deviné.
  for (const locale of ["en-GB", "fr-FR"]) {
    const rendered = ack(locale, null);
    assert(
      !/filed it under|rangée au/i.test(rendered),
      `${locale}: rien ne doit être annoncé: ${rendered}`,
    );
  }
});

Deno.test("`inferredSlot` est REQUIS: l'oublier jette plutôt que de se taire", () => {
  const args = {
    analysis: EMPTY_ANALYSIS,
    binding: { kind: "none" },
    commitmentTitles: {},
    hasPrescription: false,
    tickedDish: null,
    locale: "en-GB",
  } as unknown as Parameters<typeof renderMealPhotoAck>[0];
  let threw = false;
  try {
    renderMealPhotoAck(args);
  } catch {
    threw = true;
  }
  assert(threw, "un effet écrit et tu est un effet sans accusé");
});
