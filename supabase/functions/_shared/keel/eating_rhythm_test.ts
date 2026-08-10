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
// élève ne pouvait NI dire qu'il mange quatre fois, NI dire lesquels comptent.
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
    { slot: "dinner", size: "large" },
    { slot: "snack_pm", size: "small" },
    { slot: "breakfast", size: null },
  ]);
  assertEquals(rhythm.map((o) => o.slot), ["breakfast", "snack_pm", "dinner"]);
  assertEquals(rhythm.map((o) => o.size), [null, "small", "large"]);
});

Deno.test("la taille est facultative et jamais inventée", () => {
  const rhythm = parseEatingRhythm([{ slot: "snack_pm" }]);
  assertEquals(rhythm, [{ slot: "snack_pm", size: null }]);

  // Une taille illisible n'annule pas le moment: « je grignote l'après-midi »
  // reste vrai sans elle. Elle n'est simplement pas retenue — la garder
  // poserait une contrainte fausse, la jeter avec le moment perdrait la faim.
  // Et surtout: PAS de repli sur « medium ». Écrire une taille que l'élève n'a
  // pas dite poserait exactement la contrainte inventée qu'on refuse.
  assertEquals(parseEatingRhythm([{ slot: "snack_pm", size: "huge" }]), [
    { slot: "snack_pm", size: null },
  ]);
  assertEquals(parseEatingRhythm([{ slot: "dinner", size: "" }])[0].size, null);
});

Deno.test("l'ancienne clé `at` est ignorée, et le moment survit", () => {
  // LE DÉFAUT QUE CE TEST GARDE. `eating_rhythm` a porté une HEURE jusqu'au
  // 2026-08-07; des lignes en base en ont encore. Elle ne servait qu'à une
  // parenthèse de prose dans la consigne, et elle a été remplacée par la
  // TAILLE, qui décide de quelque chose.
  //
  // Ce qui compte ici est que le remplacement ne fasse pas DISPARAÎTRE le
  // moment: un parseur qui rejetterait l'entrée entière parce qu'elle porte une
  // clé qu'il ne connaît plus rendrait `[]` sur ces lignes-là, donc le repli
  // petit-déjeuner/déjeuner/dîner — exactement le bug qu'on vient de corriger,
  // repris par l'autre bout.
  assertEquals(
    parseEatingRhythm([{ slot: "lunch", at: "12:30" }, { slot: "dinner", at: "20:00" }]),
    [{ slot: "lunch", size: null }, { slot: "dinner", size: null }],
  );

  // Et l'heure n'est PAS traduite en taille: « 20:00 » ne dit pas si le dîner
  // est gros. Deviner ici serait poser une contrainte que personne n'a dite.
  assertEquals(parseEatingRhythm([{ slot: "dinner", at: "20:00" }])[0].size, null);
});

Deno.test("ce qui n'est pas reconnu est écarté, jamais deviné", () => {
  assertEquals(parseEatingRhythm([{ slot: "brunch" }]), []);
  assertEquals(parseEatingRhythm([{ slot: "snack" }]), []);
  assertEquals(parseEatingRhythm("le matin et le soir"), []);
  assertEquals(parseEatingRhythm(null), []);
  // Un doublon ne crée pas deux fois le même moment.
  assertEquals(
    parseEatingRhythm([{ slot: "lunch", size: null }, { slot: "lunch", size: "large" }]),
    [{ slot: "lunch", size: "large" }],
  );
});

Deno.test("la chaîne nue est un moment, pas un déchet", () => {
  // LE DÉFAUT QUE CE TEST GARDE, ET IL ÉTAIT INVISIBLE PARCE QUE LE REPLI
  // RESSEMBLE À UNE RÉPONSE.
  //
  // Deux formes cohabitent dans la colonne: `{slot, size}` qu'écrit la carte, et
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
    { slot: "lunch", size: null },
    { slot: "dinner", size: null },
  ]);

  // L'ORDRE DE LA JOURNÉE VAUT AUSSI POUR ELLE.
  assertEquals(
    parseEatingRhythm(["dinner", "breakfast", "snack_pm"]).map((o) => o.slot),
    ["breakfast", "snack_pm", "dinner"],
  );

  // Les deux formes dans le même tableau: une chaîne nue ne porte pas de
  // taille, et ne doit donc pas effacer celle qu'une entrée objet a déjà posée.
  assertEquals(
    parseEatingRhythm([{ slot: "lunch", size: "large" }, "lunch", "dinner"]),
    [{ slot: "lunch", size: "large" }, { slot: "dinner", size: null }],
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
    safetyConstraints: null,
    body: null,
    focusAxis: null,
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
      awayDays: [],
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
    { slot: "snack_pm", size: "small" },
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

Deno.test("la TAILLE d'un moment arrive jusqu'à la consigne", () => {
  // LE DÉFAUT QUE CE TEST GARDE, ET IL AURAIT ÉTÉ INVISIBLE.
  //
  // La taille a remplacé l'heure le 2026-08-07 parce qu'elle DÉCIDE de quelque
  // chose. Mais rien ne le vérifiait: `occasionList` (testé juste au-dessus) ne
  // porte que les noms, et la taille passe par `rhythmLines`, qui est privée.
  // On pouvait donc demander la taille à l'élève, l'écrire en base, l'afficher
  // cochée — et ne jamais l'envoyer au modèle. Une question posée pour rien,
  // verte de bout en bout.
  const rhythm = parseEatingRhythm([
    { slot: "breakfast", size: "small" },
    { slot: "lunch" },
    { slot: "dinner", size: "large" },
  ]);
  const { userMessage } = buildMealPrompt({
    safetyConstraints: null,
    body: null,
    focusAxis: null,
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
    eatingRhythm: rhythm,
  });

  assert(userMessage.includes("(small for them)"), userMessage);
  assert(userMessage.includes("(large for them)"), userMessage);

  // ET LE MOMENT SANS TAILLE PART NU. Écrire « medium » sur le déjeuner
  // poserait une contrainte que l'élève n'a pas exprimée — et le modèle la
  // respecterait, ce qui est bien le problème.
  assert(!userMessage.includes("(medium for them)"), userMessage);
});
