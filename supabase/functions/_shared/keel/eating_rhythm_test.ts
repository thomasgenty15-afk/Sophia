import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  buildMealPrompt,
  DEFAULT_EATING_RHYTHM,
  dishCapFor,
  EATING_OCCASIONS,
  MEAL_SLOTS,
  occasionList,
  parseEatingRhythm,
  parseGeneratedMeal,
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

Deno.test("la chaîne nue est un moment, pas un déchet", () => {
  // LE DÉFAUT QUE CE TEST GARDE, ET IL ÉTAIT INVISIBLE PARCE QUE LE REPLI
  // RESSEMBLE À UNE RÉPONSE.
  //
  // Deux formes cohabitent dans la colonne: `{slot, at}` qu'écrit la carte, et
  // la chaîne nue que posent les jsonb écrits à la main. Le parseur ne lisait
  // que la première et JETAIT la seconde en silence; l'appelant retombait
  // alors sur `DEFAULT_EATING_RHYTHM` — petit-déjeuner, déjeuner, dîner. Donc:
  //
  //   · la fixture d'un élève déclaré SANS petit-déjeuner recevait un
  //     petit-déjeuner, ce qui est exactement le symptôme rapporté en vrai;
  //   · et la flotte QA était VERTE, parce que la fixture nominale déclare
  //     `["breakfast","lunch","dinner"]` — ce que le repli rend aussi. Trois
  //     rythmes distincts en fixture, un seul jamais exercé.
  //
  // La migration qui a créé la clé a renoncé au CHECK de forme en écrivant que
  // « le lecteur sait déjà réparer ». C'est ce test qui rend la phrase vraie.
  assertEquals(parseEatingRhythm(["lunch", "dinner"]), [
    { slot: "lunch", at: null },
    { slot: "dinner", at: null },
  ]);

  // L'ORDRE DE LA JOURNÉE VAUT AUSSI POUR ELLE.
  assertEquals(
    parseEatingRhythm(["dinner", "breakfast", "snack_pm"]).map((o) => o.slot),
    ["breakfast", "snack_pm", "dinner"],
  );

  // Les deux formes dans le même tableau: une chaîne nue ne porte pas d'heure,
  // et ne doit donc pas effacer celle qu'une entrée objet a déjà posée.
  assertEquals(
    parseEatingRhythm([{ slot: "lunch", at: "12:30" }, "lunch", "dinner"]),
    [{ slot: "lunch", at: "12:30" }, { slot: "dinner", at: null }],
  );

  // Écarter reste la règle: la tolérance porte sur la FORME, pas sur le
  // vocabulaire.
  assertEquals(parseEatingRhythm(["brunch", "snack", ""]), []);

  // ET LE REPLI NE SE DÉCLENCHE PLUS SUR UN RYTHME QUI EXISTE. C'est la ligne
  // qui compte: c'est elle qui faisait servir un petit-déjeuner à quelqu'un
  // qui n'en prend pas.
  const declared = parseEatingRhythm(["lunch", "dinner"]);
  assertEquals(declared.length > 0, true);
  assertEquals(
    (declared.length > 0 ? declared : DEFAULT_EATING_RHYTHM).map((o) => o.slot),
    ["lunch", "dinner"],
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

  // ET LE REPLI EST LE RYTHME PAR DÉFAUT, PAS UN NOMBRE ÉCRIT À CÔTÉ.
  // Le repli était une paire de constantes (4 et 21) posées près d'un défaut
  // qui compte trois moments. Elles ont divergé le 2026-08-05: `day` est passé
  // à 4 pendant que `DEFAULT_EATING_RHYTHM` restait à 3, et le prompt s'est mis
  // à demander trois plats tout en en acceptant quatre.
  assertEquals(dishCapFor("day"), DEFAULT_EATING_RHYTHM.length);
  assertEquals(dishCapFor("several_days"), DEFAULT_EATING_RHYTHM.length * 7);
});

Deno.test("le plafond du PROMPT et celui du PARSEUR ne peuvent pas diverger", () => {
  // LE DÉFAUT QUE CE TEST GARDE, et que le test ci-dessus ne voyait pas.
  // `dishCapFor` suivait déjà le rythme — mais `parseGeneratedMeal` ne le
  // RECEVAIT pas. Un élève à cinq repas obtenait donc une consigne pour cinq
  // plats et un parseur qui en gardait trois: les deux derniers tombaient APRÈS
  // génération, sans que rien ne le dise. Une garde prouvée sur la fonction et
  // jamais sur le câblage.
  const five = parseEatingRhythm(
    ["breakfast", "snack_am", "lunch", "snack_pm", "dinner"].map((slot) => ({ slot })),
  );

  const { userMessage } = buildMealPrompt({
    doctrineBlock: "== METHOD ==",
    coachNoteBlock: null,
    protocolBlock: "",
    beliefKeys: [],
    goal: "health",
    situation: null,
    context: null,
    mode: "to_shop",
    scope: "day",
    slot: null,
    servings: 1,
    pantry: [],
    todayToken: "mon",
    eatingRhythm: five,
  });

  // Ce que la consigne DEMANDE, et ce que le parseur ACCEPTE: le même nombre,
  // lu par la même fonction avec la même entrée.
  assert(userMessage.includes("5"));
  assertEquals(dishCapFor("day", five), 5);

  const meal = parseGeneratedMeal(
    {
      dishes: Array.from({ length: 5 }, (_, i) => ({
        title: `dish ${i + 1}`,
        slot: "lunch",
        day: "mon",
        ingredients: [{ term: "rice", quantity: "100 g" }],
        method: ["cook it"],
      })),
      shopping_list: [],
    },
    {
      doctrine: null,
      safetyConstraints: [],
      mode: "to_shop",
      scope: "day",
      pantry: [],
      beliefKeys: [],
      eatingRhythm: five,
      daysToFill: ["mon"],
      cookingTimeMin: null,
    },
  );
  assertEquals(meal.dishes.length, 5);
  assert(!meal.issues.some((i) => i.includes("cap")));
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
