// LOT 2 (P2) — LE COMMENTAIRE DE PRÉPARATION DU JOUR J.
//
// Ce que ces tests protègent, dans l'ordre de ce qui coûte le plus cher quand
// ça casse:
//
//   * UN PLAT QUI TOMBE À CAUSE D'UN CHAMP INFORMATIF. `same_day` est une
//     lecture EN PLUS; un modèle qui écrit « warm_up » au lieu de
//     « reheat_only » ne doit pas coûter un dîner à quelqu'un. C'est la
//     posture `for_member_id`, et c'est la seule des quatre qui se paie en
//     repas.
//   * UN MATCHER QUI REVIENDRAIT SUR `method`. « reheat a portion » est de la
//     prose, dans une langue qu'on ne choisit pas; deviner le geste dessus se
//     tromperait sur « do not reheat » et sur la totalité des plans français.
//     Le jeton est DÉCLARÉ, validé fermé, jamais déduit.
//   * UN COMPTEUR QUI MENT. `same_day` est déclaré par le modèle: sans les
//     quatre nombres, un lot désarmé (le modèle ignore la consigne) est
//     indiscernable d'un lot qui marche.
//   * LA CONFUSION DES DEUX TEMPS. `same_day.minutes` est le temps du GESTE DU
//     JOUR; `active_minutes`/`total_minutes` sont ceux de la CUISSON et de la
//     SESSION. Annoncer 50 minutes pour « réchauffe une portion » fait sauter
//     le repas.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  MEAL_PROMPT_VERSION,
  MEAL_SYSTEM_PROMPT,
  MEAL_TOKEN_FIELDS,
  MEAL_TRANSLATABLE_FIELDS,
  mealDishesPayload,
  parseGeneratedMeal,
  SAME_DAY_KINDS,
  SAME_DAY_MAX_MINUTES,
} from "./meal_generation.ts";
import { HOUSEHOLD_PROMPT_VERSION } from "./household_meal_generation.ts";
import type { StudentSafetyConstraint } from "./safety_constraints.ts";

function parse(payload: Record<string, unknown>, over: Record<string, unknown> = {}) {
  return parseGeneratedMeal(payload, {
    doctrine: null,
    safetyConstraints: [],
    mode: "to_shop",
    scope: "day",
    pantry: [],
    beliefKeys: [],
    eatingRhythm: [],
    daysToFill: ["mon"],
    awayDays: [],
    cookingTimeMin: null,
    composition: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    boxMemberIds: [],
    weighedMemberIds: [],
  kitchenEquipment: null,
  cookOnlyDay: null,
  soloBoxes: false,
  boxMemberDiets: [],
  boxMemberExclusions: [],
    ...over,
  });
}

function dish(over: Record<string, unknown> = {}) {
  return {
    title: "Rice and onion omelette",
    slot: "dinner",
    day: null,
    ingredients: [{ term: "eggs", quantity: "3" }],
    method: "Beat the eggs, soften the onions, fold it together.",
    why: "It uses what is already in your kitchen on a night you said is short.",
    honours_belief_keys: [],
    ...over,
  };
}

const PREP = {
  id: "prep_chicken",
  title: "Roast chicken thighs",
  servings_made: 4,
  ingredients: [{ term: "chicken thighs", quantity: "1.2 kg" }],
  method: "Roast at 200C for 40 minutes.",
  active_minutes: 10,
  total_minutes: 50,
  cook_on: "mon",
};

// ---------------------------------------------------------------------------
// LES QUATRE JETONS, ET RIEN D'AUTRE
// ---------------------------------------------------------------------------

Deno.test("LOT 2 — les quatre jetons du geste du jour sont accueillis tels quels", () => {
  // Les quatre sont écrits en toutes lettres, PAS dérivés de `SAME_DAY_KINDS`:
  // une boucle sur la constante resterait verte si on lui ajoutait
  // « microwave » ou si on lui en retirait un. Le test doit tomber quand la
  // liste bouge — c'est ce qu'il existe pour dire.
  const meal = parse({
    preparations: [],
    dishes: [
      dish({ title: "A", slot: "breakfast", same_day: { kind: "none", minutes: 0 } }),
      dish({ title: "B", slot: "lunch", same_day: { kind: "assemble", minutes: 10 } }),
      dish({ title: "C", slot: "dinner", same_day: { kind: "cook_fresh", minutes: 15 } }),
    ],
    shopping_list: [],
  });
  assertEquals(meal.dishes.map((d) => d.sameDay), [
    { kind: "none", minutes: 0 },
    { kind: "assemble", minutes: 10 },
    { kind: "cook_fresh", minutes: 15 },
  ]);
  // Le quatrième a besoin d'un lot pour être cohérent — il est ici avec.
  const reheat = parse({
    preparations: [PREP],
    dishes: [
      dish({
        title: "D",
        uses: [{ preparation_id: "prep_chicken", servings: 1 }],
        same_day: { kind: "reheat_only", minutes: 8 },
      }),
    ],
    shopping_list: [],
  });
  assertEquals(reheat.dishes[0].sameDay, { kind: "reheat_only", minutes: 8 });
  assertEquals(reheat.issues.filter((i) => i.includes("same_day")), []);
  // Le compte, sur ce plan sain.
  assertEquals(reheat.same_day_counts, {
    dishes: 1,
    declared: 1,
    invalid: 0,
    minutes_missing: 0,
  });
});

Deno.test("LOT 2 — un jeton hors liste NE REJETTE PAS le plat: il est compté et nommé", () => {
  // ⛔ C'EST LA GARDE QUI SE PAIE EN REPAS. Un plat retiré parce qu'un modèle a
  // écrit « warm_up » serait un dîner perdu pour un champ informatif.
  const meal = parse({
    preparations: [],
    dishes: [dish({ same_day: { kind: "warm_up", minutes: 8 } })],
    shopping_list: [],
  });
  assertEquals(meal.dishes.length, 1, "le plat a été rejeté sur un champ informatif");
  assertEquals(meal.dishes[0].sameDay, null);
  assertEquals(meal.same_day_counts, {
    dishes: 1,
    declared: 0,
    invalid: 1,
    minutes_missing: 0,
  });
  assert(
    meal.issues.some((i) => i.includes("same_day.kind") && i.includes("warm_up")),
    `le jeton refusé n'est pas nommé: ${meal.issues.join(" | ")}`,
  );
});

Deno.test("LOT 2 — le jeton n'est JAMAIS déduit de la méthode (aucun matcher)", () => {
  // La prose dit « reheat » trois fois, et dans les deux langues. Le parseur ne
  // la lit pas: sans déclaration, il n'y a pas de geste. Si un matcher revenait
  // un jour, ce test tomberait — c'est sa seule raison d'être.
  const meal = parse({
    preparations: [PREP],
    dishes: [
      dish({
        title: "Reheat me",
        method: "Reheat a portion, reheat it gently, do not reheat twice.",
        uses: [{ preparation_id: "prep_chicken", servings: 1 }],
      }),
      dish({
        title: "Réchauffe-moi",
        slot: "lunch",
        method: "Réchauffe une portion et presse un citron.",
        uses: [{ preparation_id: "prep_chicken", servings: 1 }],
      }),
    ],
    shopping_list: [],
  });
  assertEquals(meal.dishes.map((d) => d.sameDay), [null, null]);
  // …et l'absence de clé n'est NI `declared` NI `invalid`. C'est le troisième
  // état, celui que l'écart des deux nombres rend lisible.
  assertEquals(meal.same_day_counts, {
    dishes: 2,
    declared: 0,
    invalid: 0,
    minutes_missing: 0,
  });
});

// ---------------------------------------------------------------------------
// LES MINUTES — LE TEMPS DU PLAT, PAS CELUI DE LA SESSION
// ---------------------------------------------------------------------------

Deno.test("LOT 2 — des minutes illisibles ne coûtent pas le geste, et ne valent pas zéro", () => {
  const meal = parse({
    preparations: [],
    dishes: [
      dish({ title: "A", slot: "breakfast", same_day: { kind: "cook_fresh" } }),
      dish({ title: "B", slot: "lunch", same_day: { kind: "assemble", minutes: "vite" } }),
      dish({ title: "C", slot: "dinner", same_day: { kind: "assemble", minutes: -5 } }),
    ],
    shopping_list: [],
  });
  // Le geste survit dans les trois cas…
  assertEquals(meal.dishes.map((d) => d.sameDay?.kind), [
    "cook_fresh",
    "assemble",
    "assemble",
  ]);
  // …et la durée est ABSENTE, jamais zéro. « 0 min » se lirait
  // « c'est instantané », ce qui est une affirmation que personne n'a faite.
  assertEquals(meal.dishes.map((d) => d.sameDay?.minutes), [null, null, null]);
  assertEquals(meal.same_day_counts, {
    dishes: 3,
    declared: 3,
    invalid: 0,
    minutes_missing: 3,
  });
});

Deno.test("LOT 2 — le plafond du geste du jour mord, et il est nommé", () => {
  // 999 et 120 sont des LITTÉRAUX: paramétrer ce test par
  // `SAME_DAY_MAX_MINUTES` le rendrait vert quelle que soit la valeur de la
  // constante, ce qui est exactement le test qui ne teste rien.
  const meal = parse({
    preparations: [],
    dishes: [dish({ same_day: { kind: "cook_fresh", minutes: 999 } })],
    shopping_list: [],
  });
  assertEquals(meal.dishes[0].sameDay, { kind: "cook_fresh", minutes: 120 });
  assert(
    meal.issues.some((i) => i.includes("same_day.minutes") && i.includes("capped")),
    `l'écrêtage n'est pas nommé: ${meal.issues.join(" | ")}`,
  );
  // Le plafond n'est pas un défaut: il n'est PAS compté comme minutes
  // manquantes — le nombre est arrivé, il était seulement invraisemblable.
  assertEquals(meal.same_day_counts.minutes_missing, 0);
  assertEquals(SAME_DAY_MAX_MINUTES, 120);
});

Deno.test("LOT 2 — un geste sous le plafond passe intact (le cas qui doit passer)", () => {
  // ⚠️ UNE GARDE SANS CAS PASSANT BLOQUE TOUT ET RESSEMBLE À UNE GARDE QUI
  // MARCHE. 45 minutes est une vraie cuisson du soir, et elle doit sortir à 45.
  const meal = parse({
    preparations: [],
    dishes: [dish({ same_day: { kind: "cook_fresh", minutes: 45 } })],
    shopping_list: [],
  });
  assertEquals(meal.dishes[0].sameDay, { kind: "cook_fresh", minutes: 45 });
  assertEquals(meal.issues.filter((i) => i.includes("same_day")), []);
});

// ---------------------------------------------------------------------------
// LA COHÉRENCE DOUCE — COMPTÉE, NOMMÉE, JAMAIS REJETÉE
// ---------------------------------------------------------------------------

Deno.test("LOT 2 — `reheat_only` sans rien à réchauffer est NOMMÉ, pas rejeté", () => {
  const meal = parse({
    preparations: [],
    dishes: [dish({ uses: [], same_day: { kind: "reheat_only", minutes: 8 } })],
    shopping_list: [],
  });
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.dishes[0].sameDay, { kind: "reheat_only", minutes: 8 });
  assert(
    meal.issues.some((i) => i.includes("reheat_only") && i.includes("nothing to reheat")),
    `la contradiction n'est pas nommée: ${meal.issues.join(" | ")}`,
  );
  // Elle n'est PAS comptée comme invalide: le jeton est bon, c'est le plan qui
  // se contredit — et on ne sait pas laquelle des deux moitiés a tort.
  assertEquals(meal.same_day_counts.invalid, 0);
  assertEquals(meal.same_day_counts.declared, 1);
});

Deno.test("LOT 2 — `none` sur un plat qui puise dans un lot est NOMMÉ, pas rejeté", () => {
  const meal = parse({
    preparations: [PREP],
    dishes: [
      dish({
        uses: [{ preparation_id: "prep_chicken", servings: 1 }],
        same_day: { kind: "none", minutes: 0 },
      }),
    ],
    shopping_list: [],
  });
  assertEquals(meal.dishes.length, 1);
  assert(
    meal.issues.some((i) => i.includes("same_day says none")),
    `la contradiction n'est pas nommée: ${meal.issues.join(" | ")}`,
  );
});

Deno.test("LOT 2 — `none` qui annonce une durée est NOMMÉ (mesuré en run réel)", () => {
  // ⚠️ CE CONSTAT VIENT D'UN RUN RÉEL, PAS D'UNE HYPOTHÈSE (2026-08-17, plan
  // foyer `6620682c`, 24 plats): DEUX plats portaient `{kind:"none",minutes:5}`
  // — « Apple and peanut butter » et « Hummus and carrot sticks ». L'écran
  // compose le libellé du jeton avec la durée et rend « Rien à préparer —
  // 5 min », qui se contredit dans la même ligne. Le modèle lit `none` comme
  // « rien à CUIRE »; le prompt dit « rien à FAIRE ».
  const meal = parse({
    preparations: [],
    dishes: [dish({ uses: [], same_day: { kind: "none", minutes: 5 } })],
    shopping_list: [],
  });
  // NOMMÉ, JAMAIS REJETÉ — la posture des deux constats du dessus.
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.dishes[0].sameDay, { kind: "none", minutes: 5 });
  assertEquals(meal.same_day_counts.declared, 1);
  assertEquals(meal.same_day_counts.invalid, 0);
  assert(
    meal.issues.some((i) => i.includes("nothing to prepare cannot take time")),
    `la contradiction n'est pas nommée: ${meal.issues.join(" | ")}`,
  );
});

Deno.test("LOT 2 — `none` à zéro minute ne déclenche RIEN (le cas qui passe)", () => {
  // ⛔ SANS CE TEST, LE CONSTAT DU DESSUS SERAIT UNE GARDE SANS CAS PASSANT:
  // un constat qui se déclencherait sur TOUS les `none` bloquerait la lecture
  // en ayant l'air de marcher. `none` + `0` et `none` + absence de durée sont
  // les deux formes JUSTES, et ni l'une ni l'autre ne doit être nommée.
  for (const sd of [{ kind: "none", minutes: 0 }, { kind: "none" }]) {
    const meal = parse({
      preparations: [],
      dishes: [dish({ uses: [], same_day: sd })],
      shopping_list: [],
    });
    assertEquals(meal.dishes[0].sameDay?.kind, "none");
    assert(
      !meal.issues.some((i) => i.includes("nothing to prepare cannot take time")),
      `un \`none\` juste a été nommé à tort (${JSON.stringify(sd)}): ` +
        meal.issues.join(" | "),
    );
  }
});

// ---------------------------------------------------------------------------
// LE COMPTEUR — LA MÊME POPULATION DES QUATRE CÔTÉS
// ---------------------------------------------------------------------------

Deno.test("LOT 2 — le compteur suit le plafond de plats: un plat évincé ne laisse pas de trace", () => {
  // ⚠️ LE PIÈGE QUE CE TEST FERME. `declared` se lit sur la SORTIE et
  // `invalid` sur un tableau parallèle: si ce tableau ne suivait pas le
  // `splice` du plafond, un plat évincé continuerait de peser sur `invalid`
  // pendant que `declared` l'oublierait. Deux nombres du même objet, gonflé et
  // dégonflé en sens inverses — le défaut mesuré sur `withheld`/`over_cap`.
  //
  // ⚠️ LA FIXTURE EST CONSTRUITE POUR QUE CE SOIT UN PLAT DÉJÀ GARDÉ QUI
  // TOMBE, et pas l'arrivant — sans quoi aucun `splice` n'a lieu et le test ne
  // prouverait rien (mesuré: avec quatre moments distincts, c'est le
  // QUATRIÈME qui tombe, et la ceinture reste muette). Rythme par défaut = 3
  // moments, `scope: "day"` ⇒ plafond de 3. « B » double la case du
  // petit-déjeuner, donc il est le plus jetable des gardés, et c'est LUI que
  // l'arrivée de « D » sacrifie.
  const meal = parse({
    preparations: [],
    dishes: [
      dish({ title: "A", slot: "breakfast", same_day: { kind: "assemble", minutes: 5 } }),
      dish({ title: "B", slot: "breakfast", same_day: { kind: "bogus", minutes: 10 } }),
      dish({ title: "C", slot: "lunch", same_day: { kind: "cook_fresh", minutes: 20 } }),
      dish({ title: "D", slot: "dinner", same_day: { kind: "none", minutes: 0 } }),
    ],
    shopping_list: [],
  });
  // La prémisse, armée: c'est bien « B » — le seul plat au jeton refusé — que
  // le plafond a évincé.
  assertEquals(meal.dishes.map((d) => d.title), ["A", "C", "D"]);
  assert(
    meal.issues.some((i) => i.includes("surplus dish") && i.includes('"B"')),
    `le plat sacrifié n'est pas celui qu'on croit: ${meal.issues.join(" | ")}`,
  );
  // Le compteur décrit EXACTEMENT les plats gardés, et rien d'autre: le refus
  // de « B » est parti avec « B ».
  assertEquals(meal.same_day_counts, {
    dishes: 3,
    declared: 3,
    invalid: 0,
    minutes_missing: 0,
  });
});

Deno.test("LOT 2 — le verrou de sortie vide le plan ET le compteur", () => {
  // Annoncer « 1 plat, 1 déclaré » sur un plan qui n'a plus AUCUN plat serait
  // un chiffre faux sur une ligne réelle. Même posture que `empty_slots` et
  // `protein_anchor_missing`, gardés sur `clean`.
  const PEANUT: StudentSafetyConstraint = {
    id: "c1",
    userId: "u1",
    kind: "allergy",
    allergenRef: "peanut",
    substanceRef: null,
    medicationClass: null,
    conditionRef: null,
    dietRef: null,
    severity: "medical",
    declaredBy: "student",
    notes: null,
    contentLocale: "en-GB",
  };
  const meal = parse({
    preparations: [],
    dishes: [
      dish({
        title: "Peanut noodles",
        ingredients: [{ term: "peanut butter", quantity: "2 tbsp" }],
        same_day: { kind: "assemble", minutes: 10 },
      }),
    ],
    shopping_list: [],
  }, { safetyConstraints: [PEANUT] });
  assertEquals(meal.dishes, []);
  assertEquals(meal.same_day_counts, {
    dishes: 0,
    declared: 0,
    invalid: 0,
    minutes_missing: 0,
  });
});

// ---------------------------------------------------------------------------
// LA PERSISTANCE — ÉCRITE MÊME À `null`
// ---------------------------------------------------------------------------

Deno.test("LOT 2 — `same_day` est écrit en base MÊME à `null`", () => {
  // ⚠️ LA CLÉ ABSENTE NE SE DISTINGUE PAS D'UN LOT DÉBRANCHÉ. Posture
  // `member_id`, mot pour mot: `null` DIT « le modèle n'a rien déclaré », et
  // c'est ce que le compteur rend comptable en SQL.
  const meal = parse({
    preparations: [],
    dishes: [
      dish({ title: "declared", same_day: { kind: "assemble", minutes: 10 } }),
      dish({ title: "silent", slot: "lunch" }),
    ],
    shopping_list: [],
  });
  const payload = mealDishesPayload(meal);
  assertEquals(payload.length, 2);
  assert("same_day" in payload[0], "la clé manque sur un plat qui la porte");
  assert("same_day" in payload[1], "la clé manque sur un plat SANS geste déclaré");
  assertEquals(payload[0].same_day, { kind: "assemble", minutes: 10 });
  assertEquals(payload[1].same_day, null);
});

// ---------------------------------------------------------------------------
// LE PROMPT — LA CONSIGNE, LE SCHÉMA, ET LE DÉFAUT CORRIGÉ AU PASSAGE
// ---------------------------------------------------------------------------

Deno.test("LOT 2 — la consigne du geste du jour est servie, et elle sépare les deux temps", () => {
  assert(
    MEAL_SYSTEM_PROMPT.includes("== WHAT TODAY ACTUALLY TAKES, ON EVERY DISH =="),
    "la section du geste du jour n'est plus servie",
  );
  assert(
    MEAL_SYSTEM_PROMPT.includes('"same_day"'),
    "le champ n'est plus demandé dans le schéma de sortie",
  );
  for (const kind of ["none", "reheat_only", "assemble", "cook_fresh"]) {
    assert(
      MEAL_SYSTEM_PROMPT.includes(`"${kind}"`),
      `le jeton ${kind} n'est pas nommé dans la consigne`,
    );
  }
  // LA PHRASE QUI SÉPARE LES DEUX TEMPS. Sans elle, le modèle recopie la durée
  // de la session sur le plat — et « réchauffe une portion » s'annonce à 50
  // minutes, après quoi le repas saute.
  assert(
    MEAL_SYSTEM_PROMPT.includes('"minutes" IS NOT THE TIME OF THE COOKING SESSION'),
    "la distinction entre le temps du plat et celui de la session a disparu",
  );
});

Deno.test("LOT 2 — `uses` n'est plus déclaré deux fois dans le schéma de sortie", () => {
  // DÉFAUT MESURÉ LE 2026-08-17: la clé apparaissait deux fois dans le bloc
  // `== OUTPUT JSON SCHEMA ==`, une fois avant `honours_belief_keys` et une
  // fois après. Un objet JSON à clé répétée est légal et la seconde écrase la
  // première: le modèle lisait un exemple contradictoire sur le champ qui porte
  // toute la jointure des lots.
  const schema = MEAL_SYSTEM_PROMPT.slice(
    MEAL_SYSTEM_PROMPT.indexOf("== OUTPUT JSON SCHEMA =="),
  );
  const dishBlock = schema.slice(0, schema.indexOf('"preparations"'));
  assertEquals(
    dishBlock.split('"uses":').length - 1,
    1,
    `\`uses\` est déclaré ${dishBlock.split('"uses":').length - 1} fois dans le plat`,
  );
});

Deno.test("LOT 2 — `same_day.kind` est un JETON, jamais une prose traduisible", () => {
  // Le piège de `preparation_id`, sur un autre champ: en français le modèle
  // écrirait « réchauffage », la validation tomberait, et le bandeau du jour
  // disparaîtrait dans toutes les langues sauf l'anglais.
  assert(
    MEAL_TOKEN_FIELDS.some((f) => f.startsWith("dishes[].same_day.kind")),
    "le jeton n'est plus annoncé au modèle comme non traduisible",
  );
  for (const field of MEAL_TRANSLATABLE_FIELDS) {
    assert(
      !field.includes("same_day"),
      `\`${field}\` a fait passer le geste du jour du côté traduisible`,
    );
  }
  assertEquals(SAME_DAY_KINDS.length, 4);
});

Deno.test("LOT 2 — le TRONC bumpe, l'enveloppe FOYER ne bouge pas", () => {
  // La règle est « quelle POPULATION voit une consigne différente ». Ici: tout
  // le monde — donc le tronc. L'enveloppe foyer ne gagne pas un octet, donc son
  // numéro reste, et son cache avec.
  //
  // ⚠️ CE QUE CE TEST PROTÈGE EST `MEAL_PROMPT_VERSION`, et rien d'autre. Le
  // numéro de l'enveloppe foyer est épinglé pour que le jour où ce lot-ci
  // ferait bouger les DEUX axes se voie tout de suite; il a bougé depuis, pour
  // une raison qui n'appartient pas au LOT 2 (le LOT 3C, 2026-08-17, qui déplace
  // l'ordre du plat dédié dans le message utilisateur).
  // ⚠️ LOT 4 (2026-08-17) — LES DEUX AXES ONT BOUGÉ, ET CE TEST LE VOIT, ce qui
  // est exactement son office. Le tronc passe à v11 pour la section
  // `WHAT A DISH ADDS ON THE DAY IS WEIGHED OR COUNTED` — vue par les quatre
  // populations — et l'enveloppe foyer à v14 pour le protocole des boîtes, vu
  // par les foyers d'au moins deux bouches. Deux consignes distinctes, deux
  // portées distinctes, deux numéros: ce n'est pas le cas que le paragraphe
  // ci-dessus met en garde (un même changement bumpé deux fois), c'est un lot
  // qui touche vraiment les deux populations.
  // ⚠️ LOT 4C (2026-08-17) — CETTE FOIS UN SEUL AXE BOUGE, et c'est le cas
  // nominal que ce test décrit depuis le LOT 2, pris dans l'autre sens: le
  // tronc ne gagne pas un octet (il reste v11), l'enveloppe foyer passe à v15
  // pour le gramme dans la note et « exactement une boîte par bouche ».
  // ⚠️ L7 (2026-08-18) — LES DEUX AXES BOUGENT ENSEMBLE, POUR LA SECONDE FOIS,
  // et pour deux consignes qui n'ont RIEN à voir l'une avec l'autre. Le tronc
  // passe à v12 pour le NOM d'un plat à côté de son titre — vu par les quatre
  // populations, puisqu'il vit dans `MEAL_SYSTEM_PROMPT`. L'enveloppe foyer
  // passe à v16 pour deux blocs qui ne concernent que le foyer: ce que cette
  // cuisine n'a pas, et les midis qui sortent du plan sans sortir de la
  // journée. Trois consignes, deux portées, deux numéros — ce n'est pas le cas
  // que ce test met en garde (un même changement bumpé deux fois).
  // ⚠️ v13 (2026-08-18) — QA 01-injection, LANE SOLO. Le tronc bumpe une
  // troisième fois pour la même raison que v10 et v11: des OCTETS DE CONSIGNE
  // changent dans le message utilisateur. Quatre, tous mesurés sur le run réel
  // `798c5cd6-…` avant d'être écrits — moyens de cuisson, cran d'activité,
  // aspiration, et l'en-tête du garde-manger qui doublait celui des apports
  // fixes. Les trois premiers ne concernent QUE la lane solo; le quatrième
  // traverse les deux. Un compte qui n'a répondu à aucune des trois questions
  // reçoit un message byte-identique à v12 — mais le cache doit quand même
  // distinguer les deux, sinon un compte qui vient de répondre se voit rendre
  // le prompt d'avant sa réponse.
  // ⚠️ v16 (2026-08-19) — LE GROUPE ALIMENTAIRE EST DÉCLARÉ, PLUS DEVINÉ.
  // La population qui voit une consigne différente: celle qui a un RÉGIME
  // déclaré, sur les deux lanes. Le bloc voyage avec `dietaryRegimePromptLine`
  // et PAS dans `MEAL_SYSTEM_PROMPT`, donc une composition sans régime rend un
  // message byte-identique à v15 (`dietary_regime_solo_lane_test.ts :: « v16 —
  // la demande de GROUPE n QUE dans le bloc de régime »`). Le bump vaut
  // quand même — règle de v3/v5 de l foyer: c la PRÉSENCE du bloc qui
  // distingue deux populations dans la colonne.
  // ⚠️ v20 (2026-09-01) — LA PART CONGELÉE A UNE CLÉ.
  // Population qui voit une consigne différente: TOUT LE MONDE. Le schéma
  // gagne `dishes[].uses[].kept` et le bloc de conservation gagne le
  // paragraphe qui dit par quel CHAMP se déclare la troisième sortie. Les deux
  // vivent dans le tronc. Un modèle qui n'écrit jamais le champ produit
  // exactement le plan de v19 — le non-dit vaut `"fridge"`, le strict.
  // ⚠️ v21 (2026-09-01) — LES JOURS HORS DE PORTÉE D'UN LOT SONT NOMMÉS, et la
  // session seule a le droit de déborder en le disant. Population: les fenêtres
  // qui portent une journée qu'aucun lot n'atteint. Un plan sans tension rend
  // v20 au caractère près, et un test le tient.
  // ⚠️ v25 (2026-09-03) — LA VEILLE EST DÉRIVÉE, PLUS COCHÉE (P1, A1).
  // La CONSIGNE n'a pas changé d'un caractère: `cookOnlyDay` existait déjà.
  // Ce qui change est la POPULATION qui la reçoit — jusqu'ici les seuls plans
  // qui portaient un jour de cuisine sans repas étaient ceux dont quelqu'un
  // avait coché une case; ils le portent désormais par défaut, dès que le
  // calendrier et l'heure le permettent. Comparer les plans d'avant et d'après
  // sous un même millésime rendrait la mesure fausse.
  // ⚠️ v26 (2026-09-03, A2/P2) — LE STYLE DE CUISINE POSE LES SESSIONS.
  // Population qui voit une consigne différente: celle qui a répondu aux DEUX
  // questions de P2 (`cooking_style` + `grocery_runs`). Pour elle, `cook_days`
  // et le plafond de temps de session ne viennent plus de la colonne mais de
  // la dérivation; pour tous les autres, la consigne est celle de v25 au
  // caractère près, et un test de rationale le tient ligne à ligne.
  assertEquals(MEAL_PROMPT_VERSION, "meal.en.v26_the_cooking_style_sets_the_sessions");
  // ⚠️ D1b (2026-08-18) — UN SEUL AXE BOUGE, ET C'EST L'ENVELOPPE FOYER.
  // `v17_what_each_mouth_already_has`: la lane foyer passait `fixedIntakes: []`
  // EN DUR sur ses trois sites, donc le shaker qu'une bouche déclare
  // n'atteignait jamais la consigne. Aucun bloc de l'enveloppe ne change — ce
  // qui change est un PARAMÈTRE DU TRONC que cette lane laissait vide — et le
  // tronc, lui, ne gagne pas un octet: il reste à `meal.en.v12_a_dish_has_a_name`.
  // Population concernée: les foyers où une bouche ATTABLÉE a un compte ET a
  // déclaré un apport. Ailleurs, prompt byte-identique à v16.
  // ⚠️ LOT D (2026-08-19) — v18: le champ d'envie de l'écran de composition
  // atteint enfin le tronc; aucun bloc de l'enveloppe ne bouge.
  // ⚠️ LOT C ② (2026-08-19) — v19: le `why` ne porte plus la règle de personne.
  // DEUX blocs neufs dans l'enveloppe foyer, servis uniquement quand une bouche
  // de la table porte une règle. `ruleHolders: []` ⇒ prompt byte-identique à
  // v18, tenu par égalité de chaîne dans `household_meal_generation_test.ts`.
  // Le TRONC ne bouge pas dans ce lot.
  // ⚠️ D3′-c (2026-08-23) — `v22_precedence_in_tail`, ET LE BUMP EST EN RETARD
  // D'UN JOUR. `D3′` (2026-08-22 18:51) a réécrit le bloc d'arbitrage de la lane
  // foyer — passé en QUEUE du message, rang 1 qui NOMME ses trois blocs de
  // verrou au lieu de dire « at the VERY TOP » — et n'a pas touché ce jeton. Les
  // quatre épinglages de cette valeur sont restés VERTS: ils tiennent le jeton,
  // aucun ne le reliait au TEXTE. C'est ce que `precedence_binding_test.ts`
  // ferme. Population concernée: tous les foyers. Le TRONC ne bouge pas — le
  // texte de la lane SOLO a survécu octet pour octet, mesuré sur 243 prompts
  // archivés.
  // ⚠️ v23 (2026-09-03, D6.2) — LA GAMELLE A UNE CONSIGNE. Population qui
  // voit une consigne différente: les foyers où au moins une bouche emporte
  // son déjeuner de semaine. Ailleurs, l'enveloppe est celle de v22 au
  // caractère près, et un test le tient.
  assertEquals(HOUSEHOLD_PROMPT_VERSION, "v27_the_swap_cooks_apart");
});

// ---------------------------------------------------------------------------
// LES DEUX LANES — UN SEUL MOTEUR, UNE SEULE LECTURE
// ---------------------------------------------------------------------------

Deno.test("LOT 2 — la lane FOYER lit le geste du jour par le même parseur", () => {
  // ⚠️ CE N'EST PAS UNE REDONDANCE AVEC LES TESTS AU-DESSUS. `for_member_id`
  // n'existe QUE sous fusion (le parseur exige `merge`), et un lot qui aurait
  // rangé `same_day` dans le même bloc serait muet sur la lane individuelle.
  // Les deux appels ci-dessous ne diffèrent que par `merge`.
  const asked = {
    preparations: [],
    dishes: [dish({ same_day: { kind: "assemble", minutes: 12 } })],
    shopping_list: [],
  };
  const solo = parse(asked);
  const household = parse(asked, {
    merge: {
      shape: "two_dishes_one_session",
      ownDishesShown: 1,
      dedicatedDishesAsked: 1,
      dedicatedCells: [],
      dishBearerIds: ["m1"],
    },
  });
  assertEquals(solo.dishes[0].sameDay, { kind: "assemble", minutes: 12 });
  assertEquals(household.dishes[0].sameDay, { kind: "assemble", minutes: 12 });
  assertEquals(solo.same_day_counts, household.same_day_counts);
});

// ---------------------------------------------------------------------------
// LE COMPTEUR ATTEINT LA LIGNE — SUR LES DEUX LANES
//
// ⛔ LE MODULE PUR NE PROUVE QUE LA MOITIÉ. Le parseur peut compter
// parfaitement des nombres que personne n'archive: le compteur mourrait avec la
// réponse HTTP, et « quelle part des plats porte son geste du jour ? » n'aurait
// aucune réponse trois jours plus tard. C'est le patron de `dish_owners`, testé
// exactement comme lui — par la SOURCE, parce qu'aucun test pur ne peut monter
// une fonction edge.
// ---------------------------------------------------------------------------

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

async function functionSource(name: string): Promise<string> {
  return stripComments(
    await Deno.readTextFile(new URL(`${name}/index.ts`, FUNCTIONS_DIR)),
  );
}

Deno.test("LOT 2 — ⛔ le compteur est ARCHIVÉ sur la ligne, lane INDIVIDUELLE", async () => {
  const src = await functionSource("generate-meal-v1");
  assert(
    /generated_from:\s*\{[\s\S]*?same_day: meal\.same_day_counts,/.test(src),
    "le compteur du geste du jour n'entre plus dans `generated_from`: un lot " +
      "désarmé redeviendrait indiscernable d'un lot qui marche.",
  );
});

Deno.test("LOT 2 — ⛔ le compteur est ARCHIVÉ sur la ligne, lane FOYER", async () => {
  const src = await functionSource("generate-household-meal-v1");
  assert(
    /generated_from:\s*\{[\s\S]*?same_day: meal\.same_day_counts,/.test(src),
    "le compteur du geste du jour n'entre plus dans `generated_from`.",
  );
  // ⚠️ À LA RACINE, PAS SOUS `household`. Le champ est demandé par le tronc et
  // lu par le parseur partagé: rangé sous `household` d'un côté et à la racine
  // de l'autre, aucune requête SQL ne le lirait sur les deux populations à la
  // fois — et le taux de service n'a de sens que sur toute la population.
  const atRoot = src.indexOf("same_day: meal.same_day_counts,");
  const underHousehold = src.indexOf("household: {", src.indexOf("generated_from: {"));
  assert(atRoot > 0 && underHousehold > 0 && atRoot < underHousehold,
    "le compteur a glissé sous `household`: il ne se lit plus sur les deux lanes.");
});

Deno.test("LOT 2 — l'enveloppe FOYER ne connaît pas le geste du jour", async () => {
  // La preuve d'octet du « non-bump » de `HOUSEHOLD_PROMPT_VERSION`: le champ
  // est demandé par le TRONC, donc le fichier de l'enveloppe ne doit pas en
  // porter une seule occurrence. Le jour où quelqu'un l'y écrira, la version du
  // foyer devra bouger — et ce test tombera d'abord.
  const envelope = await Deno.readTextFile(
    new URL("household_meal_generation.ts", import.meta.url),
  );
  assert(
    !stripComments(envelope).includes("same_day"),
    "l'enveloppe foyer parle du geste du jour: sa population voit désormais une " +
      "consigne différente, donc HOUSEHOLD_PROMPT_VERSION doit bumper.",
  );
});
