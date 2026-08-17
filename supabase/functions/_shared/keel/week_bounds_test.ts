import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import { daysUntilSunday } from "./local_date.ts";
import {
  buildMealPrompt,
  dishCapFor,
  MAX_FRIDGE_DAYS,
  parseEatingRhythm,
  parseGeneratedMeal,
} from "./meal_generation.ts";

// ===========================================================================
// LA SEMAINE S'ARRÊTE DIMANCHE
//
// LE DÉFAUT, RAPPORTÉ SUR UN PLAN RÉEL. Généré un JEUDI, le plan proposait à
// manger jusqu'au MERCREDI suivant: `daysFrom(today, 7)` remplissait sept jours
// GLISSANTS. L'écran s'appelle « My week's plan », l'élève lit une semaine, et
// il repartait avec des courses pour dix jours dont trois qu'il ne ferait
// jamais — et un dimanche de plats posés sur une semaine déjà commencée.
//
// LE PLAFOND EST LA MOITIÉ DU CORRECTIF, et la moins visible. Annoncer « au
// plus 28 plats » à un modèle qui n'a que quatre jours à remplir, c'est
// l'inviter à déborder poliment pour occuper le budget. Les deux bornes — les
// jours ET le plafond — doivent venir du même comptage.
// ===========================================================================

Deno.test("la fenêtre va d'aujourd'hui à dimanche, jamais au-delà", () => {
  // Le cas rapporté: un jeudi, il reste quatre jours.
  assertEquals(daysUntilSunday("thu"), ["thu", "fri", "sat", "sun"]);
  // Un lundi, la semaine entière.
  assertEquals(daysUntilSunday("mon"), [
    "mon", "tue", "wed", "thu", "fri", "sat", "sun",
  ]);
  // Aucune fenêtre ne repasse par lundi: c'est toute la correction.
  for (const start of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const) {
    const days = daysUntilSunday(start);
    assertEquals(days[days.length - 1], "sun", start);
    assertEquals(new Set(days).size, days.length, `${start} répète un jour`);
  }
});

Deno.test("le dimanche rend UN jour, et ne file pas sur la semaine suivante", () => {
  // Étendre en douce ferait qu'un « plan de la semaine » voudrait dire deux
  // choses selon le jour où on clique. L'élève qui veut la semaine suivante la
  // génère le lundi.
  assertEquals(daysUntilSunday("sun"), ["sun"]);
});

Deno.test("le plafond suit le nombre de jours RÉELLEMENT demandés", () => {
  const four = parseEatingRhythm(
    ["breakfast", "lunch", "dinner"].map((slot) => ({ slot })),
  );
  // Jeudi: 3 moments × 4 jours, et pas × 7.
  assertEquals(dishCapFor("several_days", four, 4), 12);
  // Lundi: la semaine pleine.
  assertEquals(dishCapFor("several_days", four, 7), 21);
  // Un plafond ne descend jamais à zéro, même si l'appelant compte mal.
  assertEquals(dishCapFor("several_days", four, 0), 3);
});

Deno.test("le prompt annonce le plafond de la fenêtre, pas celui de sept jours", () => {
  const days = daysUntilSunday("thu");
  const { userMessage } = buildMealPrompt({
    safetyConstraints: null,
    body: null,
    focusAxis: null,
    doctrineBlock: "== METHOD ==",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    protocolBlock: "",
    beliefKeys: [],
    goal: "health",
    situation: null,
    context: null,
    mode: "to_shop",
    scope: "several_days",
    slot: null,
    servings: 1,
    pantry: [],
    todayToken: "thu",
    daysToFill: days,
  });
  // Les jours sont nommés, et il y en a quatre.
  assert(userMessage.includes("thu, fri, sat, sun"), userMessage);
  // Le plafond annoncé est celui de CES jours: 3 moments × 4 jours.
  assert(userMessage.includes("12 dishes"), userMessage);
  // Et surtout pas celui d'une semaine pleine, qui est ce qui faisait déborder.
  assert(!userMessage.includes("21 dishes"), userMessage);
});

Deno.test("un jour de cuisine hors fenêtre ne survit pas à la consigne", () => {
  // MESURÉ SUR UN PLAN RÉEL. L'élève déclare cuisiner dimanche et mercredi;
  // plan généré un jeudi; le modèle a posé une session le MERCREDI — un jour
  // déjà passé. Ses jours de cuisine décrivent sa semaine type, la fenêtre est
  // ce qu'il en reste, et seule l'intersection est exécutable.
  const { userMessage } = buildMealPrompt({
    safetyConstraints: null,
    body: null,
    focusAxis: null,
    doctrineBlock: "== METHOD ==",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    protocolBlock: "",
    beliefKeys: [],
    goal: "health",
    situation: null,
    context: null,
    mode: "to_shop",
    scope: "several_days",
    slot: null,
    servings: 1,
    pantry: [],
    todayToken: "thu",
    daysToFill: daysUntilSunday("thu"),
    cookDays: ["sun", "wed"],
  });
  // Mercredi est écarté: il n'est plus dans la semaine.
  assert(!userMessage.includes("wed"), userMessage);
  // Et dimanche seul ne devient PAS la permission unique — ce serait l'impasse
  // que le test suivant décrit: rien cuisiné dimanche ne nourrit jeudi.
  assert(!userMessage.includes("they can only cook on: sun"), userMessage);
});

Deno.test("aucun jour de cuisine dans la fenêtre: on ne reste pas sans session", () => {
  // Quelqu'un qui ne cuisine que le lundi, un vendredi, doit quand même manger.
  // Mieux vaut une session posée un jour non déclaré — qu'il déplacera — qu'un
  // plan sans aucun jour de cuisine.
  const { userMessage } = buildMealPrompt({
    safetyConstraints: null,
    body: null,
    focusAxis: null,
    doctrineBlock: "== METHOD ==",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    protocolBlock: "",
    beliefKeys: [],
    goal: "health",
    situation: null,
    context: null,
    mode: "to_shop",
    scope: "several_days",
    slot: null,
    servings: 1,
    pantry: [],
    todayToken: "fri",
    daysToFill: daysUntilSunday("fri"),
    cookDays: ["mon"],
  });
  assert(userMessage.includes("none of those days"), userMessage);
  assert(!userMessage.includes("can only cook on: mon"), userMessage);
});

Deno.test("un lot mangé AVANT d'être cuisiné est signalé", () => {
  // LE DÉFAUT, MESURÉ SUR UN VRAI PLAN. Fenêtre jeudi→dimanche, un seul jour de
  // cuisine encore disponible (dimanche), et le modèle a fait puiser le
  // déjeuner de JEUDI dans un lot cuisiné le DIMANCHE. L'élève le découvre à
  // midi, devant un frigo vide.
  //
  // ON SIGNALE, ON NE RÉÉCRIT PAS: déplacer la session inventerait un jour de
  // cuisine que l'élève n'a pas déclaré, et retirer le plat lui prendrait un
  // repas. Le prompt porte la règle; ceci vérifie qu'on VOIT quand elle casse,
  // parce qu'une consigne de prompt n'est pas une garantie.
  const meal = parseGeneratedMeal(
    {
      preparations: [{
        id: "prep_chicken",
        title: "Roast chicken",
        servings_made: 4,
        ingredients: [{ term: "chicken", quantity: "1 kg" }],
        method: "roast it",
      }],
      cooking_sessions: [{
        day: "sun",
        preparation_ids: ["prep_chicken"],
        run_through: "roast, then portion",
      }],
      dishes: [{
        title: "Chicken salad",
        slot: "lunch",
        day: "thu",
        ingredients: [{ term: "leaves", quantity: "1 handful" }],
        method: "assemble",
        uses: [{ preparation_id: "prep_chicken", servings: 1 }],
      }],
      shopping_list: [],
    },
    {
      doctrine: null,
      safetyConstraints: [],
      mode: "to_shop",
      scope: "several_days",
      pantry: [],
      beliefKeys: [],
      eatingRhythm: [],
      daysToFill: ["thu", "fri", "sat", "sun"],
      awayDays: [],
      cookingTimeMin: null,
      composition: null,
      fixedIntakes: [],
      dayProperties: [],
      merge: null,
    },
  );
  assert(
      boxMemberIds: [],
    meal.issues.some((i) => i.includes("after the meal")),
    JSON.stringify(meal.issues),
  );
});

Deno.test("cuisiner AVANT de manger ne déclenche rien", () => {
  const meal = parseGeneratedMeal(
    {
      preparations: [{
        id: "prep_chicken",
        title: "Roast chicken",
        servings_made: 4,
        ingredients: [{ term: "chicken", quantity: "1 kg" }],
        method: "roast it",
      }],
      cooking_sessions: [{
        day: "thu",
        preparation_ids: ["prep_chicken"],
        run_through: "roast, then portion",
      }],
      dishes: [{
        title: "Chicken salad",
        slot: "lunch",
        day: "sun",
        ingredients: [{ term: "leaves", quantity: "1 handful" }],
        method: "assemble",
        uses: [{ preparation_id: "prep_chicken", servings: 1 }],
      }],
      shopping_list: [],
    },
    {
      doctrine: null,
      safetyConstraints: [],
      mode: "to_shop",
      scope: "several_days",
      pantry: [],
      beliefKeys: [],
      eatingRhythm: [],
      daysToFill: ["thu", "fri", "sat", "sun"],
      awayDays: [],
      cookingTimeMin: null,
      composition: null,
      fixedIntakes: [],
      dayProperties: [],
      merge: null,
    },
  );
  assertEquals(meal.issues.filter((i) => i.includes("after the meal")), []);
      boxMemberIds: [],
});

// ===========================================================================
// CE QU'UN PLAN NE DOIT PAS DEMANDER: attendre six jours, ou tenir en une
// heure ce qui en prend deux.
//
// Les deux contraintes étaient ANNONCÉES au modèle et vérifiées par personne.
// Mesuré le 2026-08-06 sur des plans réels: 30 minutes déclarées contre 55
// produites, et des légumes rôtis cuisinés jeudi encore mangés le mercredi
// suivant. Un prompt n'est pas une garantie — ce fichier est la garantie.
// ===========================================================================

/** Un plan minimal: une préparation, une session, un plat qui y puise. */
function planWith(args: {
  cookDay: string;
  eatDay: string;
  sessionMinutes?: number;
  declaredMinutes?: number | null;
}) {
  return parseGeneratedMeal(
    {
      preparations: [{
        id: "prep_veg",
        title: "Roasted summer vegetables",
        servings_made: 4,
        ingredients: [{ term: "courgette", quantity: "2" }],
        method: "roast them",
      }],
      cooking_sessions: [{
        day: args.cookDay,
        preparation_ids: ["prep_veg"],
        run_through: "roast, then portion",
        total_minutes: args.sessionMinutes ?? 30,
      }],
      dishes: [{
        title: "Veg bowl",
        slot: "lunch",
        day: args.eatDay,
        ingredients: [{ term: "leaves", quantity: "1 handful" }],
        method: "assemble",
        uses: [{ preparation_id: "prep_veg", servings: 1 }],
      }],
      shopping_list: [],
    },
    {
      doctrine: null,
      safetyConstraints: [],
      mode: "to_shop",
      scope: "several_days",
      pantry: [],
      beliefKeys: [],
      eatingRhythm: [],
      daysToFill: ["thu", "fri", "sat", "sun", "mon", "tue", "wed"],
      awayDays: [],
      cookingTimeMin: args.declaredMinutes ?? null,
      composition: null,
      fixedIntakes: [],
      dayProperties: [],
      merge: null,
    },
  );
}
      boxMemberIds: [],

Deno.test("un lot gardé plus de trois jours est signalé", () => {
  // LE CAS MESURÉ, mot pour mot: légumes rôtis cuisinés jeudi, encore mangés le
  // mercredi suivant. Six jours.
  const meal = planWith({ cookDay: "thu", eatDay: "wed" });
  assert(
    meal.issues.some((i) => i.includes("days in the fridge")),
    JSON.stringify(meal.issues),
  );
});

Deno.test("trois jours passent, quatre non — la borne est celle qu'on annonce", () => {
  assertEquals(MAX_FRIDGE_DAYS, 3);
  // thu -> sun = J+3: à la limite, et ça passe.
  const ok = planWith({ cookDay: "thu", eatDay: "sun" });
  assertEquals(ok.issues.filter((i) => i.includes("fridge")), []);
  // thu -> mon = J+4: dehors.
  const late = planWith({ cookDay: "thu", eatDay: "mon" });
  assert(late.issues.some((i) => i.includes("fridge")), JSON.stringify(late.issues));
});

Deno.test("une session qui déborde le temps déclaré est signalée", () => {
  // MESURÉ: « about 30 minutes » annoncé au modèle, session de 55 rendue.
  const meal = planWith({
    cookDay: "thu",
    eatDay: "fri",
    sessionMinutes: 55,
    declaredMinutes: 30,
  });
  assert(
    meal.issues.some((i) => i.includes("they said they have about 30")),
    JSON.stringify(meal.issues),
  );
});

Deno.test("dix minutes de marge, parce qu'une estimation de cuisine n'est pas au chrono", () => {
  // 65 contre 60: dans le bruit. Signaler ça ferait du bruit que personne ne
  // lit, ce qui finit par cacher les vrais dépassements.
  const near = planWith({
    cookDay: "thu",
    eatDay: "fri",
    sessionMinutes: 65,
    declaredMinutes: 60,
  });
  assertEquals(near.issues.filter((i) => i.includes("they said")), []);
});

Deno.test("sans temps déclaré, aucun plafond n'est inventé", () => {
  // L'élève qui n'a rien rempli ne doit pas recevoir un reproche fondé sur un
  // nombre que personne n'a donné.
  const meal = planWith({
    cookDay: "thu",
    eatDay: "fri",
    sessionMinutes: 180,
    declaredMinutes: null,
  });
  assertEquals(meal.issues.filter((i) => i.includes("they said")), []);
});

Deno.test("un jour de cuisine qui arrive APRÈS les repas ouvre le premier jour", () => {
  // MESURÉ, et c'est ma propre correction de la veille qui l'a créé: jours
  // déclarés `sun, wed`, fenêtre jeudi→dimanche. L'intersection ne laisse que
  // DIMANCHE — le dernier jour — et le modèle a fait manger jeudi, vendredi et
  // samedi sur un lot cuisiné le dimanche. Quatre `issues` sur un vrai plan.
  //
  // Une contrainte qui rend le plan inexécutable n'est plus une contrainte.
  const { userMessage } = buildMealPrompt({
    safetyConstraints: null,
    body: null,
    focusAxis: null,
    doctrineBlock: "== METHOD ==",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    protocolBlock: "",
    beliefKeys: [],
    goal: "health",
    situation: null,
    context: null,
    mode: "to_shop",
    scope: "several_days",
    slot: null,
    servings: 1,
    pantry: [],
    todayToken: "thu",
    daysToFill: daysUntilSunday("thu"),
    cookDays: ["sun", "wed"],
  });
  // Le premier jour est ouvert...
  assert(userMessage.includes("Cook on thu as well"), userMessage);
  // ... et DIT comme un ajout, pour que le modèle ne le prenne pas pour une
  // déclaration de l'élève.
  assert(userMessage.includes("a day they did not ask for"), userMessage);
  // ... et surtout pas présenté comme la seule permission, qui est ce qui
  // produisait l'impasse.
  assert(!userMessage.includes("can only cook on: sun"), userMessage);
});

Deno.test("un jour de cuisine assez tôt n'ouvre rien du tout", () => {
  // Vendredi déclaré, fenêtre jeudi→dimanche: vendredi ne nourrit pas jeudi,
  // mais jeudi est le premier jour et il se cuisine frais. Rien à ajouter —
  // ouvrir un jour ici piétinerait une contrainte parfaitement tenable.
  const { userMessage } = buildMealPrompt({
    safetyConstraints: null,
    body: null,
    focusAxis: null,
    doctrineBlock: "== METHOD ==",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    protocolBlock: "",
    beliefKeys: [],
    goal: "health",
    situation: null,
    context: null,
    mode: "to_shop",
    scope: "several_days",
    slot: null,
    servings: 1,
    pantry: [],
    todayToken: "thu",
    daysToFill: daysUntilSunday("thu"),
    cookDays: ["thu", "sat"],
  });
  assert(userMessage.includes("they can only cook on: thu, sat"), userMessage);
  assert(!userMessage.includes("a day they did not ask for"), userMessage);
});
