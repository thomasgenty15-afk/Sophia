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
 *   · l'heure DÉCLARÉE déplace la fenêtre, sinon quelqu'un qui dîne à 22 h se
 *     voit ranger son assiette de 21 h au déjeuner;
 *   · hors de toute fenêtre, on ne range RIEN — `null` est une réponse;
 *   · l'accusé le DIT, dans les deux langues, avec la porte de correction dans
 *     la même phrase (T9: toute garde est éprouvée dans les deux langues).
 */

const RHYTHM_LATE_DINNER = [
  { slot: "dinner", at: "22:00" },
];

/** Trois créneaux déclarés, et RIEN d'autre: le cas de la demande. */
const RHYTHM_THREE_MEALS = [
  { slot: "breakfast" },
  { slot: "lunch" },
  { slot: "dinner" },
];

/** Les trois moments optionnels NOMMÉS, sans heure: les nommer suffit. */
const RHYTHM_WITH_SNACKS = [
  { slot: "snack_am" },
  { slot: "snack_pm" },
  { slot: "before_bed" },
];

Deno.test("la fenêtre du repas, et le repli entre deux fenêtres", () => {
  // Fenêtres par défaut: petit-déj 5→10, déjeuner 11→15, dîner 18→23.
  assertEquals(inferSlotFromLocalHour(3, null), null, "3 h n'est le repas de personne");
  assertEquals(inferSlotFromLocalHour(5, null)?.slot, "breakfast", "5 h pile");
  // ⟳ 7 h ET 9 h RENDAIENT `null` AVANT LE 2026-09-09: le petit-déjeuner
  // n'était pas encore « écoulé ». Une photo prise à 7 h EST un petit-déjeuner.
  assertEquals(inferSlotFromLocalHour(7, null)?.slot, "breakfast");
  assertEquals(inferSlotFromLocalHour(9, null)?.slot, "breakfast");
  // ⟳ LE DÉFAUT QUE CE LOT RÉPARE. 11 h et 12 h partaient au PETIT-DÉJEUNER,
  // parce que le déjeuner n'était réputé passé qu'à 14 h.
  assertEquals(inferSlotFromLocalHour(11, null)?.slot, "lunch", "11 h: le déjeuner");
  assertEquals(inferSlotFromLocalHour(12, null)?.slot, "lunch", "midi pile");
  assertEquals(inferSlotFromLocalHour(13, null)?.slot, "lunch");
  // 10 h: la fenêtre du petit-déjeuner s'arrête à 9 h et celle de l'en-cas du
  // matin n'est PAS armée (rythme vide) — le repli rend le petit-déjeuner,
  // exactement comme avant ce lot.
  assertEquals(inferSlotFromLocalHour(10, null)?.slot, "breakfast", "10 h pile");
  assertEquals(inferSlotFromLocalHour(14, null)?.slot, "lunch", "14 h pile");
  // 15 h → 17 h: le goûter, POUR TOUT LE MONDE. Aucun repas principal ne
  // revendique ces heures, et les ranger au déjeuner de midi était faux de
  // quatre heures.
  assertEquals(inferSlotFromLocalHour(15, null)?.slot, "snack_pm", "15 h");
  assertEquals(inferSlotFromLocalHour(16, null)?.slot, "snack_pm");
  assertEquals(inferSlotFromLocalHour(17, null)?.slot, "snack_pm");
  assertEquals(inferSlotFromLocalHour(18, null)?.slot, "dinner", "18 h pile");
  assertEquals(inferSlotFromLocalHour(21, null)?.slot, "dinner");
  // 22 h et 23 h: la fenêtre d'« avant de dormir » les couvre AUSSI, mais
  // personne ne l'a nommée — le dîner, qui l'est d'office, garde l'heure.
  assertEquals(inferSlotFromLocalHour(22, null)?.slot, "dinner");
  assertEquals(inferSlotFromLocalHour(23, null)?.slot, "dinner");
  // ⛔ LA NUIT NE SE RATTRAPE PAS: `local_date` porte déjà le jour suivant, et
  // un dîner rangé là serait rangé au mauvais jour.
  assertEquals(inferSlotFromLocalHour(0, null), null, "0 h: aucun repas, aucun repli");
});

Deno.test("le goûter s'ouvre sans être déclaré — c'est la décision du 2026-09-09", () => {
  // ⛔ LA PROPRIÉTÉ QUE CE TEST TIENT, ET C'EST LA DEMANDE, MOT POUR MOT:
  // quelqu'un qui a déclaré trois créneaux et qui prend une crêpe au Nutella à
  // 16 h ouvre un créneau CE JOUR-LÀ dans le suivi. Rien ici n'écrit dans
  // `practical_constraints.eating_rhythm` — le fait est daté, la préférence ne
  // bouge pas, et le lendemain la journée n'a plus de goûter.
  for (const hour of [15, 16, 17]) {
    assertEquals(
      inferSlotFromLocalHour(hour, RHYTHM_THREE_MEALS)?.slot,
      "snack_pm",
      `${hour} h: le goûter, chez quelqu'un qui n'en a jamais déclaré`,
    );
  }

  // ── LES DEUX HEURES AMBIGUËS, ELLES, RESTENT AU REPAS PRINCIPAL ─────────
  // Un petit-déjeuner à 10 h et un dîner à 22 h sont ordinaires. Les donner
  // d'office à un en-cas casserait la coche du plat prévu chez des gens qui
  // n'ont jamais parlé d'en-cas.
  assertEquals(inferSlotFromLocalHour(10, RHYTHM_THREE_MEALS)?.slot, "breakfast");
  assertEquals(inferSlotFromLocalHour(22, RHYTHM_THREE_MEALS)?.slot, "dinner");

  // ── ET LE MOMENT NOMMÉ REPREND SON HEURE ───────────────────────────────
  assertEquals(
    inferSlotFromLocalHour(10, RHYTHM_WITH_SNACKS)?.slot,
    "snack_am",
    "10 h: l'en-cas du matin, une fois nommé",
  );
  assertEquals(
    inferSlotFromLocalHour(22, RHYTHM_WITH_SNACKS)?.slot,
    "before_bed",
    "22 h: avant de dormir, une fois nommé",
  );

  // Nommer ses en-cas ne déplace PAS les repas principaux — et surtout pas
  // 11 h, qui appartient au déjeuner seul.
  assertEquals(inferSlotFromLocalHour(11, RHYTHM_WITH_SNACKS)?.slot, "lunch");
  assertEquals(inferSlotFromLocalHour(12, RHYTHM_WITH_SNACKS)?.slot, "lunch");
  assertEquals(inferSlotFromLocalHour(19, RHYTHM_WITH_SNACKS)?.slot, "dinner");
});

Deno.test("un moment optionnel déclaré AVEC une heure emmène sa fenêtre", () => {
  const rhythm = [{ slot: "snack_pm", at: "17:00" }];
  assertEquals(
    inferSlotFromLocalHour(17, rhythm)?.slot,
    "snack_pm",
    "17 h: le goûter déclaré à 17 h",
  );
  // 15 h n'est plus dans sa fenêtre (16→18) ni dans celle du déjeuner
  // (11→14): plus aucune fenêtre ne le couvre, et le repli rend le déjeuner.
  assertEquals(
    inferSlotFromLocalHour(15, rhythm)?.slot,
    "lunch",
    "15 h: hors du goûter de 17 h",
  );
});

Deno.test("une déduction porte TOUJOURS sa marque", () => {
  const inferred = inferSlotFromLocalHour(15, null);
  assert(inferred !== null);
  assertEquals(inferred.inferred, true, "un slot déduit sans marque devient un slot déclaré");
});

Deno.test("l'heure DÉCLARÉE déplace la fenêtre", () => {
  // Le dîner déclaré à 22 h emmène sa fenêtre avec lui: elle s'ouvre à 21 h.
  assertEquals(
    inferSlotFromLocalHour(21, RHYTHM_LATE_DINNER)?.slot,
    "dinner",
    "à 21 h, le dîner de 22 h a commencé",
  );
  assertEquals(
    inferSlotFromLocalHour(22, RHYTHM_LATE_DINNER)?.slot,
    "dinner",
    "22 h pile",
  );
  // Et elle s'ouvre PLUS TARD: à 18 h, un dîner par défaut aurait mordu
  // (fenêtre 18→23). Avec 22 h déclarées, 18 h n'est plus un dîner — le repli
  // range au déjeuner.
  assertEquals(
    inferSlotFromLocalHour(18, RHYTHM_LATE_DINNER)?.slot,
    "lunch",
    "18 h n'est pas le dîner de quelqu'un qui dîne à 22 h",
  );
  assertEquals(
    inferSlotFromLocalHour(18, null)?.slot,
    "dinner",
    "sans heure déclarée, 18 h est bien le dîner",
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

const SIX_SLOTS = [
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
] as const;

function ack(
  locale: string,
  inferredSlot: (typeof SIX_SLOTS)[number] | null,
) {
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
    /move it in your tracking/i.test(en),
    `la porte de correction doit être dans la même phrase: ${en}`,
  );

  const fr = ack("fr-FR", "dinner");
  assert(fr.includes("dîner"), `le créneau doit être nommé en français: ${fr}`);
  assert(
    /déplacer dans ton suivi/i.test(fr),
    `la porte de correction doit être là aussi: ${fr}`,
  );
  assert(!/your tracking/i.test(fr), `aucun anglais résiduel: ${fr}`);
});

Deno.test("les SIX moments ont un nom qui se dit — et le français reste du français", () => {
  // ⛔ CE QUE CE TEST EXISTE POUR EMPÊCHER: « Je l'ai rangée au en-cas du
  // matin ». Le gabarit français ne porte plus la préposition — elle voyage
  // AVEC le nom, parce que « au déjeuner » et « à ton en-cas du matin » ne se
  // composent pas avec le même mot. Un pack qui l'oublierait produirait une
  // faute de langue sur les trois moments optionnels seulement, c'est-à-dire
  // sur ceux qu'on relit le moins.
  for (const slot of SIX_SLOTS) {
    const fr = ack("fr-FR", slot);
    assert(
      /rangée (au |à ton )/.test(fr),
      `${slot}: la préposition doit venir du nom: ${fr}`,
    );
    assert(!/ (au|à) (en-cas|à)/.test(fr), `${slot}: préposition doublée: ${fr}`);
    assert(!/ {2}/.test(fr), `${slot}: un nom manquant a laissé un trou: ${fr}`);

    const en = ack("en-GB", slot);
    assert(/filed it under \S/.test(en), `${slot}: nom vide en anglais: ${en}`);
  }
  // Et les deux qui n'existaient pas avant ce lot sont bien NOMMÉS, pas rendus
  // par leur jeton.
  assert(ack("fr-FR", "snack_pm").includes("au goûter"));
  assert(ack("en-GB", "snack_pm").includes("afternoon snack"));
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
