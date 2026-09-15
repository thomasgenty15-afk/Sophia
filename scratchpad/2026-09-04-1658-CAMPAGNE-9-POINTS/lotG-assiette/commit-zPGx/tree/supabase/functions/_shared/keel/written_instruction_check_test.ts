// LE SECOND TOUR DU DOUBLE VERROU — ce que ces tests protègent.
//
// Le prompt DEMANDE au modèle de nommer ce qu'il n'a pas pu honorer d'une
// consigne écrite. Ce dépôt sait ce que vaut une demande de prompt: le verrou
// des règles de maison existe parce que le modèle a fait exactement l'inverse
// de ce que le prompt lui disait, au premier run réel. Ces tests tiennent la
// moitié vérifiable.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  checkWrittenInstructions,
  silentInstructions,
  termsOfInstruction,
} from "./written_instruction_check.ts";

const PRUNES = "Je mange des pruneaux le mardi matin";

Deno.test("une consigne SERVIE ne dit rien", () => {
  const v = checkWrittenInstructions({
    instructions: [PRUNES],
    dishes: [{
      title: "Porridge aux pruneaux",
      why: "un petit-déjeuner qui tient",
      ingredients: [{ term: "pruneaux" }, { term: "flocons d'avoine" }],
    }],
  });
  assertEquals(v[0].status, "served");
  assertEquals(silentInstructions(v), []);
});

Deno.test("une consigne ABSENTE et EXPLIQUÉE ne dit rien non plus", () => {
  // C'est le comportement qu'on demande au modèle: ne pas l'honorer est
  // permis, l'avaler ne l'est pas.
  const v = checkWrittenInstructions({
    instructions: [PRUNES],
    dishes: [{
      title: "Omelette",
      why: "pas de pruneaux cette semaine: rien d'autre du plan ne les utilise " +
        "et le paquet entier se perdrait.",
      ingredients: [{ term: "oeufs" }],
    }],
  });
  assertEquals(v[0].status, "explained");
  assertEquals(silentInstructions(v), []);
});

Deno.test("LE CAS DU LOT: absente et TUE EN SILENCE", () => {
  const v = checkWrittenInstructions({
    instructions: [PRUNES],
    dishes: [{
      title: "Omelette",
      why: "un petit-déjeuner rapide",
      ingredients: [{ term: "oeufs" }],
    }],
  });
  assertEquals(v[0].status, "silent");
  assertEquals(silentInstructions(v), [PRUNES]);
});

Deno.test("EN: le même trio, parce que `not` ne couvre pas `doesn't`", () => {
  const instruction = "I eat prunes on Tuesday mornings";
  const served = checkWrittenInstructions({
    instructions: [instruction],
    dishes: [{ title: "Prune porridge", why: "steady start", ingredients: [] }],
  });
  assertEquals(served[0].status, "served");

  const explained = checkWrittenInstructions({
    instructions: [instruction],
    dishes: [{
      title: "Omelette",
      why: "no prunes this week — nothing else in the plan uses them.",
      ingredients: [],
    }],
  });
  assertEquals(explained[0].status, "explained");

  const silent = checkWrittenInstructions({
    instructions: [instruction],
    dishes: [{ title: "Omelette", why: "a quick breakfast", ingredients: [] }],
  });
  assertEquals(silent[0].status, "silent");
});

Deno.test("« sans pruneaux » dans la MÉTHODE ne compte pas comme servi", () => {
  // La tolérance à la négation est ACTIVE sur le corps du plan. Sans elle, un
  // plat qui dit explicitement ne pas en mettre serait annoncé comme honorant
  // la consigne — le mensonge le plus coûteux que ce module puisse faire.
  const v = checkWrittenInstructions({
    instructions: [PRUNES],
    dishes: [{
      title: "Porridge",
      method: "des flocons, du lait, sans pruneaux",
      why: "un petit-déjeuner rapide",
      ingredients: [{ term: "flocons" }],
    }],
  });
  assertEquals(v[0].status, "silent");
});

Deno.test("LE PIÈGE DU MATCHER: « lait » ne se trouve pas dans « laitue »", () => {
  // 12 faux positifs sur 12 mesurés, la dernière fois qu'un matcher maison a
  // été essayé ici. C'est le test qui justifie de passer par le matcher du
  // dépôt et jamais par un `includes()`.
  const v = checkWrittenInstructions({
    instructions: ["Je bois du lait chaque matin"],
    dishes: [{
      title: "Salade de laitue",
      why: "du croquant",
      ingredients: [{ term: "laitue" }],
    }],
  });
  assertEquals(v[0].status, "silent");
});

Deno.test("une consigne sans mot cherchable S'ABSTIENT, elle n'accuse pas", () => {
  // « je ne mange jamais le matin » n'a que des mots-outils. On ne saurait pas
  // la reconnaître même dans un plan qui la respecte parfaitement: la déclarer
  // avalée serait un reproche fabriqué.
  const v = checkWrittenInstructions({
    instructions: ["Je ne mange jamais le matin"],
    dishes: [{ title: "Omelette", why: "rapide", ingredients: [] }],
  });
  assertEquals(v[0].terms, []);
  assertEquals(v[0].status, "served");
  assertEquals(silentInstructions(v), []);
});

Deno.test("les mots-outils ne sont jamais cherchés", () => {
  const terms = termsOfInstruction("Je mange des pruneaux le mardi matin");
  assert(terms.includes("pruneaux"), terms.join(","));
  assert(!terms.includes("matin"), terms.join(","));
  assert(!terms.includes("mange"), terms.join(","));
  assert(!terms.includes("des"), terms.join(","));
});

Deno.test("un plan VIDE ne rend pas tout servi", () => {
  // La direction de l'erreur compte: un plan sans plat n'honore rien, et
  // l'annoncer servi masquerait une génération ratée.
  const v = checkWrittenInstructions({
    instructions: [PRUNES],
    dishes: [],
  });
  assertEquals(v[0].status, "silent");
});

Deno.test("plusieurs consignes se jugent SÉPARÉMENT", () => {
  const v = checkWrittenInstructions({
    instructions: [PRUNES, "Je bois du kefir"],
    dishes: [{
      title: "Porridge aux pruneaux",
      why: "un petit-déjeuner qui tient",
      ingredients: [{ term: "pruneaux" }],
    }],
  });
  assertEquals(v.map((x) => x.status), ["served", "silent"]);
  assertEquals(silentInstructions(v), ["Je bois du kefir"]);
});

Deno.test("le module est PUR: même entrée, même sortie, entrée intacte", () => {
  const instructions = [PRUNES];
  const dishes = [{ title: "Omelette", why: "rapide", ingredients: [] }];
  const a = checkWrittenInstructions({ instructions, dishes });
  const b = checkWrittenInstructions({ instructions, dishes });
  assertEquals(a, b);
  assertEquals(instructions, [PRUNES]);
  assertEquals(dishes.length, 1);
});
