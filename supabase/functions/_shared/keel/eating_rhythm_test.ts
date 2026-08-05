import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  DEFAULT_EATING_RHYTHM,
  dishCapFor,
  EATING_OCCASIONS,
  MEAL_SLOTS,
  occasionList,
  parseEatingRhythm,
} from "./meal_generation.ts";

// ===========================================================================
// LE RYTHME DE L'ÉLÈVE — la faim de 17h a-t-elle un endroit où exister
//
// LE DÉFAUT QUE CE FICHIER GARDE. Le moteur imposait « breakfast, lunch and
// dinner » à tout le monde, en dur, et le vocabulaire n'avait qu'un jeton
// `snack` — donc 10h et 17h étaient le même mot et le modèle choisissait. Un
// élève ne pouvait NI dire qu'il mange quatre fois, NI dire quand.
//
// Ce qui est testé n'est donc pas « la fonction rend un tableau »: c'est que
// ce que l'élève déclare ARRIVE jusqu'à la consigne, que ce qu'il ne déclare
// pas ne soit pas inventé, et que ne rien déclarer laisse le moteur exactement
// où il était.
// ===========================================================================

Deno.test("le vocabulaire porte les deux faims, et garde l'ancien jeton", () => {
  // Les deux collations sont DISTINCTES: c'est tout le chantier.
  assert((EATING_OCCASIONS as readonly string[]).includes("snack_am"));
  assert((EATING_OCCASIONS as readonly string[]).includes("snack_pm"));

  // `snack` n'est plus un moment qu'on propose...
  assertEquals((EATING_OCCASIONS as readonly string[]).includes("snack"), false);
  // ... mais reste ACCEPTÉ sur un plat. Sans ça, le parseur droppe les plats
  // des lignes déjà en base et un plan composé hier devient un plan troué.
  assert((MEAL_SLOTS as readonly string[]).includes("snack"));
});

Deno.test("un rythme déclaré est lu, dans l'ordre de la journée", () => {
  // Saisi en désordre exprès: on lit sa journée du réveil au coucher, pas dans
  // l'ordre où les cases ont été cochées.
  const rhythm = parseEatingRhythm([
    { slot: "dinner", at: "20:00" },
    { slot: "snack_pm", at: "17:00" },
    { slot: "breakfast", at: null },
  ]);
  assertEquals(rhythm.map((o) => o.slot), ["breakfast", "snack_pm", "dinner"]);
  assertEquals(rhythm.map((o) => o.at), [null, "17:00", "20:00"]);
});

Deno.test("l'heure est facultative et jamais inventée", () => {
  const rhythm = parseEatingRhythm([{ slot: "snack_pm" }]);
  assertEquals(rhythm, [{ slot: "snack_pm", at: null }]);

  // Une heure illisible n'annule pas le moment: « je grignote l'après-midi »
  // reste vrai sans l'heure. Elle n'est simplement pas retenue — la garder
  // poserait une contrainte fausse, la jeter avec le moment perdrait la faim.
  const fuzzy = parseEatingRhythm([{ slot: "snack_pm", at: "vers 17h" }]);
  assertEquals(fuzzy, [{ slot: "snack_pm", at: null }]);
  assertEquals(parseEatingRhythm([{ slot: "dinner", at: "25:00" }])[0].at, null);
});

Deno.test("ce qui n'est pas reconnu est écarté, jamais deviné", () => {
  assertEquals(parseEatingRhythm([{ slot: "brunch" }]), []);
  assertEquals(parseEatingRhythm([{ slot: "snack" }]), []);
  assertEquals(parseEatingRhythm("le matin et le soir"), []);
  assertEquals(parseEatingRhythm(null), []);
  // Un doublon ne crée pas deux fois le même moment.
  assertEquals(
    parseEatingRhythm([{ slot: "lunch", at: null }, { slot: "lunch", at: "12:30" }]),
    [{ slot: "lunch", at: "12:30" }],
  );
});

Deno.test("le plafond suit le rythme, et ne bouge pas sans lui", () => {
  // LE POINT: cinq occasions par jour ne tiennent pas dans un plafond calculé
  // pour trois. Les deux dernières tomberaient — c'est-à-dire disparaîtraient,
  // sans que rien ne le dise.
  const five = parseEatingRhythm(
    ["breakfast", "snack_am", "lunch", "snack_pm", "dinner"].map((slot) => ({ slot })),
  );
  assertEquals(dishCapFor("several_days", five), 35);
  assertEquals(dishCapFor("day", five), 5);

  // Deux repas par jour n'ouvrent pas un budget pour trois.
  const two = parseEatingRhythm([{ slot: "lunch" }, { slot: "dinner" }]);
  assertEquals(dishCapFor("several_days", two), 14);

  // SANS RYTHME, RIEN NE BOUGE. C'est ce qui rend le chantier additif: un élève
  // qui n'a rien rempli reçoit la semaine d'avant, au plat près.
  assertEquals(dishCapFor("several_days", []), dishCapFor("several_days"));
  assertEquals(dishCapFor("day", []), dishCapFor("day"));
});

Deno.test("la consigne nomme SES moments, en prose", () => {
  const rhythm = parseEatingRhythm([
    { slot: "breakfast" },
    { slot: "lunch" },
    { slot: "snack_pm", at: "17:00" },
    { slot: "dinner" },
  ]);
  const line = occasionList(rhythm);
  // La faim de 17h est NOMMÉE dans la consigne, pas laissée au modèle.
  assert(line.includes("an afternoon bite"), line);
  assert(line.includes("breakfast") && line.includes("dinner"), line);
  // Une liste lisible, pas un JSON: c'est une consigne, elle se lit.
  assert(!line.includes("["), line);

  // Le repli est le comportement d'avant, mot pour mot.
  assertEquals(occasionList([]), "breakfast, lunch and dinner");
  assertEquals(occasionList(DEFAULT_EATING_RHYTHM), "breakfast, lunch and dinner");
});
