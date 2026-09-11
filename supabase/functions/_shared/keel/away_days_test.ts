import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  buildMealPrompt,
  isAway,
  parseAwayDays,
  parseEatingRhythm,
  parseGeneratedMeal,
} from "./meal_generation.ts";

// ===========================================================================
// « JE NE MANGE PAS ICI » — le moment que le plan doit sauter
//
// LE TROU QUE CE FICHIER GARDE. Le moteur savait quels jours remplir
// (`daysToFill`) et quels moments existent dans une journée (`eating_rhythm`),
// mais rien ne pouvait dire « mardi midi, je suis à la cantine ». L'élève
// recevait donc un déjeuner qu'il ne mangerait pas, et surtout: il l'ACHETAIT.
//
// Ce qui est testé n'est pas « la fonction rend un tableau ». C'est que la
// contrainte MORD AUX DEUX BOUTS — dans la consigne et au parseur. Une règle
// qui n'existe que dans le prompt n'est pas une garantie: un modèle de
// composition complète ce qu'on lui donne, c'est son métier.
// ===========================================================================

Deno.test("une absence se lit, et l'ordre du jour est celui de la semaine", () => {
  const away = parseAwayDays([
    { day: "fri", slots: ["lunch"] },
    { day: "tue", slots: ["lunch", "breakfast"] },
  ]);
  assertEquals(away.map((a) => a.day), ["tue", "fri"]);
  // Les moments d'une journée sortent aussi dans l'ordre du réveil au coucher.
  assertEquals(away[0].slots, ["breakfast", "lunch"]);
});

Deno.test("`slots` vide vaut la journée entière, et absorbe le reste", () => {
  assertEquals(parseAwayDays([{ day: "sat" }]), [{ day: "sat", slots: [] }]);
  assertEquals(parseAwayDays([{ day: "sat", slots: [] }]), [{ day: "sat", slots: [] }]);

  // Une journée entière l'emporte sur un moment nommé le même jour, quel que
  // soit l'ordre: « je ne suis pas là samedi » et « samedi midi » ne se
  // contredisent pas, le premier contient le second.
  assertEquals(
    parseAwayDays([{ day: "sat", slots: ["lunch"] }, { day: "sat" }]),
    [{ day: "sat", slots: [] }],
  );
  assertEquals(
    parseAwayDays([{ day: "sat" }, { day: "sat", slots: ["lunch"] }]),
    [{ day: "sat", slots: [] }],
  );
});

Deno.test("ce qui n'est pas reconnu tombe SEUL, jamais avec le reste", () => {
  // LE POINT, et il n'est pas cosmétique: une absence illisible qui ferait
  // tomber les absences lisibles ferait composer un repas que l'élève a dit ne
  // pas prendre. Écarter l'entrée, garder les autres.
  assertEquals(
    parseAwayDays([{ day: "caturday", slots: ["lunch"] }, { day: "tue", slots: ["lunch"] }]),
    [{ day: "tue", slots: ["lunch"] }],
  );
  // Un créneau inconnu ne fait pas tomber le jour: les autres créneaux tiennent.
  assertEquals(
    parseAwayDays([{ day: "tue", slots: ["brunch", "dinner"] }]),
    [{ day: "tue", slots: ["dinner"] }],
  );
  // Un jour dont TOUS les créneaux sont illisibles n'est pas une journée
  // entière — ce serait transformer une faute de frappe en absence complète.
  assertEquals(parseAwayDays([{ day: "tue", slots: ["brunch"] }]), []);
  assertEquals(parseAwayDays(null), []);
  assertEquals(parseAwayDays("mardi midi"), []);
});

Deno.test("`isAway` distingue le moment, le jour entier, et le plat sans créneau", () => {
  const partial = parseAwayDays([{ day: "tue", slots: ["lunch"] }]);
  assert(isAway(partial, "tue", "lunch"));
  assertEquals(isAway(partial, "tue", "dinner"), false);
  assertEquals(isAway(partial, "wed", "lunch"), false);
  // Un plat qui ne nomme aucun créneau n'est PAS écarté par une absence
  // partielle: on ne sait pas si c'est le déjeuner, et deviner supprimerait un
  // repas que l'élève attend.
  assertEquals(isAway(partial, "tue", null), false);

  const whole = parseAwayDays([{ day: "sat" }]);
  assert(isAway(whole, "sat", "lunch"));
  assert(isAway(whole, "sat", "dinner"));
  // Journée entière: même le plat sans créneau tombe, c'est bien un repas de
  // ce jour-là.
  assert(isAway(whole, "sat", null));

  // Sans jour nommé, rien n'est écarté: un plat « n'importe quel jour » ne
  // peut pas être rattaché à une absence.
  assertEquals(isAway(whole, null, "lunch"), false);
});

Deno.test("l'absence arrive jusqu'à la consigne, en négatif explicite", () => {
  const { userMessage } = buildMealPrompt({ budgetFloor: null, contentLocale: "en-US", firstDayCookable: true, hasFreezer: false, oneCookingSession: false,
    cookOnlyDay: null,
    soloBoxes: false,
    groceryCadence: null,
    standardRecipe: false,
    budgetAmount: null,
    safetyConstraints: null,
    safetyConstraintTable: null,
    body: null,
    focusAxis: null,
    dietBlock: "",
    doctrineBlock: "== METHOD ==",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    protocolBlock: "",
    beliefKeys: [],
    goal: "maintenance",
    situation: null,
    context: null,
    mode: "to_shop",
    scope: "several_days",
    slot: null,
    servings: 1,
    pantry: [],
    todayToken: "mon",
    daysToFill: ["mon", "tue", "wed"],
    eatingRhythm: parseEatingRhythm(["breakfast", "lunch", "dinner"]),
    awayDays: parseAwayDays([{ day: "tue", slots: ["lunch"] }, { day: "wed" }]),
  });

  // EN MOTS, PAS EN JETONS: « tue » dans une phrase anglaise se lit aussi bien
  // comme un verbe, et le modèle lit de l'anglais.
  assert(userMessage.includes("Tuesday: lunch"), userMessage);
  assert(userMessage.includes("Wednesday: the whole day"), userMessage);
  // Et c'est dit en NÉGATIF: une liste de ce qu'il RESTE se fait compléter.
  assert(userMessage.includes("NOT eating here"), userMessage);
});

Deno.test("le parseur REJETTE un plat posé sur un moment écarté", () => {
  // LA GARANTIE, et c'est celle qui compte. La consigne l'interdit déjà; ce
  // test répond à « et si le modèle le fait quand même ».
  const parsed = parseGeneratedMeal({
    dishes: [
      { title: "Monday lunch", slot: "lunch", day: "mon", ingredients: [], method: "x", why: "y" },
      { title: "Canteen lunch", slot: "lunch", day: "tue", ingredients: [], method: "x", why: "y" },
      { title: "Tuesday dinner", slot: "dinner", day: "tue", ingredients: [], method: "x", why: "y" },
      { title: "Saturday dinner", slot: "dinner", day: "sat", ingredients: [], method: "x", why: "y" },
    ],
    shopping_list: [],
  }, {
    doctrine: null,
    safetyConstraints: null,
    mode: "to_shop",
    scope: "several_days",
    pantry: [],
    beliefKeys: [],
    eatingRhythm: parseEatingRhythm(["breakfast", "lunch", "dinner"]),
    daysToFill: ["mon", "tue", "sat"],
    awayDays: parseAwayDays([{ day: "tue", slots: ["lunch"] }, { day: "sat" }]),
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
  standardRecipe: false,
  boxMemberDiets: [],
  boxMemberExclusions: [],
  });

  const kept = parsed.dishes.map((d) => d.title);
  assertEquals(kept, ["Monday lunch", "Tuesday dinner"]);
  // Le rejet LAISSE UNE TRACE. Un plat qui disparaît sans rien dire est un
  // plat dont on ne saura jamais qu'il a été proposé.
  assert(parsed.issues.some((i) => i.includes("away")), parsed.issues.join(" | "));
});

Deno.test("un plat écarté ne consomme PAS une place du plafond", () => {
  // LE DÉFAUT QUE CE TEST GARDE, et il est d'ordre d'exécution. La garde du
  // plafond tombait AVANT que le jour et le créneau soient résolus: des plats
  // interdits placés en tête de liste mangeaient donc les places, et des plats
  // parfaitement valides tombaient à la fin — un jour vide, sans raison
  // affichée.
  const rhythm = parseEatingRhythm(["lunch"]);
  const away = parseAwayDays([{ day: "mon", slots: ["lunch"] }]);
  const forbidden = Array.from({ length: 6 }, (_, i) => ({
    title: `Forbidden ${i}`,
    slot: "lunch",
    day: "mon",
    ingredients: [],
    method: "x",
    why: "y",
  }));
  const parsed = parseGeneratedMeal({
    dishes: [
      ...forbidden,
      { title: "Tuesday lunch", slot: "lunch", day: "tue", ingredients: [], method: "x", why: "y" },
    ],
    shopping_list: [],
  }, {
    doctrine: null,
    safetyConstraints: null,
    mode: "to_shop",
    scope: "day",
    pantry: [],
    beliefKeys: [],
    eatingRhythm: rhythm,
    daysToFill: ["mon", "tue"],
    awayDays: away,
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
  standardRecipe: false,
  boxMemberDiets: [],
  boxMemberExclusions: [],
  });

  // `scope: "day"` avec un rythme d'UN moment donne un plafond de 1. Les six
  // plats interdits ne doivent pas l'avoir épuisé.
  assertEquals(parsed.dishes.map((d) => d.title), ["Tuesday lunch"]);
});

Deno.test("sans absence, rien ne change — le chantier est additif", () => {
  const dishes = [
    { title: "A", slot: "lunch", day: "mon", ingredients: [], method: "x", why: "y" },
    { title: "B", slot: "dinner", day: "mon", ingredients: [], method: "x", why: "y" },
  ];
  const args = {
    doctrine: null,
    safetyConstraints: null,
    safetyConstraintTable: null,
    mode: "to_shop" as const,
    scope: "several_days" as const,
    pantry: [],
    beliefKeys: [],
    eatingRhythm: parseEatingRhythm(["lunch", "dinner"]),
    daysToFill: ["mon"],
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
  standardRecipe: false,
  boxMemberDiets: [],
  boxMemberExclusions: [],
  };
  const withNone = parseGeneratedMeal({ dishes, shopping_list: [] }, {
    ...args,
    awayDays: [],
  });
  assertEquals(withNone.dishes.map((d) => d.title), ["A", "B"]);

  // Et la consigne ne porte AUCUNE ligne d'absence quand il n'y en a pas.
  const { userMessage } = buildMealPrompt({ budgetFloor: null, contentLocale: "en-US", firstDayCookable: true, hasFreezer: false, oneCookingSession: false,
    cookOnlyDay: null,
    soloBoxes: false,
    groceryCadence: null,
    standardRecipe: false,
    budgetAmount: null,
    safetyConstraints: null,
    safetyConstraintTable: null,
    body: null,
    focusAxis: null,
    dietBlock: "",
    doctrineBlock: "== METHOD ==",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    protocolBlock: "",
    beliefKeys: [],
    goal: "maintenance",
    situation: null,
    context: null,
    mode: "to_shop",
    scope: "several_days",
    slot: null,
    servings: 1,
    pantry: [],
    todayToken: "mon",
    daysToFill: ["mon"],
    eatingRhythm: parseEatingRhythm(["lunch", "dinner"]),
    awayDays: [],
  });
  assertEquals(userMessage.includes("NOT eating here"), false);
});
