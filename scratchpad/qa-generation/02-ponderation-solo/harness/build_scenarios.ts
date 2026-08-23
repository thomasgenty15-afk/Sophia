// ===========================================================================
// AGENT 2A — harnais DÉTERMINISTE de pondération, lane `generate-meal-v1`.
// ===========================================================================
// Il n'appelle AUCUN modèle. Il appelle `buildMealPrompt` avec cinq jeux
// d'entrées figés et écrit les octets produits. C'est l'instrument qui répond
// à « qu'est-ce qui a changé dans le prompt ? » et surtout à « qu'est-ce qui
// n'a PAS changé pour les populations non visées ? » — un diff d'octets, pas
// une relecture.
//
//   deno run --allow-write --allow-read --allow-env \
//     scratchpad/qa-generation/02-ponderation-solo/harness/build_scenarios.ts <dossier>
//
// Le bloc de doctrine est repris MOT POUR MOT du run réel 1V/S1 (coach Osric
// Thelwall) : c'est une entrée opaque de `buildMealPrompt`, et la recopier
// évite de reconstruire un `LoadedDoctrine` qui divergerait du réel.
// ===========================================================================
import {
  type AwayDay,
  buildMealPrompt,
  type EatingOccasionSlot,
  MEAL_PROMPT_VERSION,
  type MealMode,
  type MealSlot,
  type MergedEater,
} from "../../../../supabase/functions/_shared/keel/meal_generation.ts";
import type { FixedIntake } from "../../../../supabase/functions/_shared/keel/fixed_intakes.ts";
import type { DayPropertyEntry } from "../../../../supabase/functions/_shared/keel/day_properties.ts";
import type { WeeklyAxis } from "../../../../supabase/functions/_shared/keel/weekly_flow.ts";
import type { StudentSafetyConstraint } from "../../../../supabase/functions/_shared/keel/safety_constraints.ts";
import type { MealBodyContext } from "../../../../supabase/functions/_shared/keel/meal_body.ts";
import { dietaryRegimePromptLine } from "../../../../supabase/functions/_shared/keel/dietary_regime.ts";
import type { KitchenTool } from "../../../../supabase/functions/_shared/keel/kitchen_equipment.ts";

const DOCTRINE = `== OSRIC THELWALL'S METHOD — YOU SPEAK AS THIS COACH'S AGENT ==

You are not a general nutrition assistant. You carry ONE coach's method. Where this block and your own knowledge disagree, this block wins. You never modify, soften or extend the coach's protocol.
SILENCE IS NOT A POSITION. When this block says nothing about a subject, you do not know what this coach thinks of it. Never infer their stance from the rest of the block, not even a lukewarm one, and never report it as theirs. Say they have not ruled on that, then answer in your own name.

-- WHAT THIS COACH BELIEVES --
- Every week starts with a plate you can name out loud, never with a number. (a plate you can picture is a plate you will actually cook)
- One loud vegetable on every plate, and it is the first thing in the basket. (the basket decides the week, willpower does not)

-- FORBIDDEN: NEVER RECOMMEND, NEVER ENDORSE --
These are this coach's red lines. You may EXPLAIN that the coach does not do these things; you may never advise the student to do them.
When you explain one, LEAD with this coach's position and only then describe the practice — "Osric Thelwall doesn't use X. It's when people ..." — never the reverse order.
- plain_salad_dinners (also phrased: salad only dinner; just a salad for dinner; cold salad dinner; light salad supper) — a plate with nothing warm on it is a plate you leave hungry at ten
  INSTEAD, this coach says: EVERY dinner carries one warm element, even in July: a broth, a roasted root, or a pan-warmed grain.
- weekend_batch_marathon (also phrased: sunday meal prep; batch cook the whole week; cook everything on sunday) — one Sunday of eight hours buys six days of grey boxes
  INSTEAD, this coach says: We cook twice in the week, on the two days they already stand in that kitchen.

-- THIS COACH'S WORDS — use them, do not translate them away --
- "a loud vegetable": a vegetable you would notice with your eyes shut

-- VOICE --
- write in English`;

const BELIEF_KEYS = ["name_the_plate_out_loud", "one_loud_vegetable"];

function c(
  n: number,
  kind: StudentSafetyConstraint["kind"],
  severity: StudentSafetyConstraint["severity"],
  refs: Partial<
    Pick<
      StudentSafetyConstraint,
      "allergenRef" | "substanceRef" | "medicationClass" | "conditionRef" | "dietRef"
    >
  >,
  notes: string | null = null,
): StudentSafetyConstraint {
  return {
    id: `2a00000${n}-0000-4000-8000-00000000000${n}`,
    userId: "2a000000-0000-4000-8000-000000000001",
    kind,
    allergenRef: refs.allergenRef ?? null,
    substanceRef: refs.substanceRef ?? null,
    medicationClass: refs.medicationClass ?? null,
    conditionRef: refs.conditionRef ?? null,
    dietRef: refs.dietRef ?? null,
    severity,
    declaredBy: "student",
    notes,
    contentLocale: "en-GB",
  };
}

// ⚠️ ── CE LITTÉRAL PORTAIT TROIS `undefined` DANS LE PROMPT DE RÉFÉRENCE ───
//
// Il finissait par `as unknown as MealBodyContext`. Le double transtypage
// n'affaiblit pas la vérification: il la SUPPRIME (cicatrice « `as` sur un
// type étranger désarme le typecheck »). Trois champs étaient donc faux, et
// muets:
//
//   ageBand: "30 to 44"   ← la PROSE, alors que le type est `AgeBand`, une clé.
//                           `mealBodyBlocks` fait `MEAL_AGE_BAND_PROSE[band]`,
//                           qui rend `undefined` → « - age band: undefined ».
//   latestWeight/Waist    ← `{ valueSi, localDate }`, alors que `DatedMeasure`
//                           est `{ value, weekStart }` → « - weight: undefined
//                           kg, measured week of undefined ».
//
// Ce sont les octets d'un instrument présenté comme la référence de l'étape ②.
// Le cast retiré, le compilateur les tient: `deno check` sur ce fichier rougit
// si quelqu'un y remet une prose.
const FULL_BODY: MealBodyContext = {
  heightCm: 168,
  ageBand: "30_44",
  gender: "female",
  // `weekStart` = LE LUNDI de la semaine du bilan (`student_body.ts:56`).
  // 2026-08-17 est bien le lundi de la semaine du `today` du harnais
  // (2026-08-19, mercredi).
  latestWeight: { weekStart: "2026-08-17", value: 61.4 },
  latestWaist: { weekStart: "2026-08-17", value: 74 },
  restrictionFlag: false,
  activityLevel: "on_feet",
};

// Le socle commun à tous les scénarios: tout ce que la question de pondération
// ne fait PAS varier. Chaque scénario n'écrit que ses écarts.
function base() {
  return {
    safetyConstraints: [] as StudentSafetyConstraint[],
    // ⚠️ `null` = UNE seule bouche. C'est ce que `generate-meal-v1:1707` passe.
    // Le paramètre est apparu dans le tronc le 2026-08-19 (lane foyer).
    safetyConstraintTable: null,
    body: null as MealBodyContext | null,
    focusAxis: null as WeeklyAxis | null,
    dietBlock: "",
    doctrineBlock: DOCTRINE,
    protocolBlock: "",
    beliefKeys: BELIEF_KEYS,
    goal: "fat_loss",
    situation: null as string | null,
    aspiration: null as string | null,
    context: null as string | null,
    preferences: null as string | null,
    // ⚠️ PAS `as const`: le scénario 1 le passe à `from_pantry`, et un socle
    // figé sur une seule valeur faisait rougir `deno check` — donc personne ne
    // le lançait, donc les trois `undefined` de `FULL_BODY` ont vécu.
    mode: "to_shop" as MealMode,
    scope: "several_days" as const,
    slot: null as MealSlot | null,
    servings: 1,
    pantry: [] as { term: string; quantity: string | null }[],
    todayToken: "wed",
    today: "2026-08-19",
    country: "GB",
    cookDays: undefined as readonly string[] | undefined,
    cookingTimeMin: null as number | null,
    recipeDifficulty: null as string | null,
    variety: null as string | null,
    // La liste FERMÉE (`kitchen_equipment.ts:69`), pas `string[]`: c'est ce
    // qui fait rougir un outil inventé au lieu de le laisser partir dans le
    // prompt de référence.
    kitchenEquipment: null as readonly KitchenTool[] | null,
    budgetAmount: null as number | null,
    foodPreferences: [] as string[],
    writtenInstructions: [] as string[],
    coachNoteBlock: null,
    daysToFill: ["thu", "fri", "sat"],
    eatingRhythm: [] as readonly EatingOccasionSlot[],
    awayDays: [] as readonly AwayDay[],
    fixedIntakes: [] as readonly FixedIntake[],
    dayProperties: [] as readonly DayPropertyEntry[],
    merge: null as MergedEater | null,
    firstDayCookable: true,
    contentLocale: "en-GB",
  };
}

// ---------------------------------------------------------------------------
// LES CINQ SCÉNARIOS
// ---------------------------------------------------------------------------
// Chaque chaîne saisie est introuvable par hasard: c'est ce qui permet de
// chercher un effet dans la sortie sans matcher maison.

const SCENARIOS: Record<string, () => ReturnType<typeof base>> = {
  // ── 1 · TOUT REMPLI ──────────────────────────────────────────────────────
  // Toutes les cases de la checklist qui ont un écran. Sert de référence: si
  // une hiérarchie existe, elle doit être lisible ici, où tout se dispute la
  // place.
  "scenario-1": () => ({
    ...base(),
    safetyConstraints: [
      c(1, "allergy", "medical", { allergenRef: "sesame" }),
      c(2, "intolerance", "strict", { substanceRef: "lactose" }),
      c(3, "dislike", "preference", { allergenRef: "beetroot" }),
      c(4, "medical", "medical", { medicationClass: "levothyroxine" }),
    ],
    body: FULL_BODY,
    dietBlock: dietaryRegimePromptLine("pescatarian"),
    mode: "from_pantry" as const,
    pantry: [
      { term: "tinned chickpeas", quantity: null },
      { term: "basmati rice", quantity: null },
      { term: "smoked paprika", quantity: null },
      { term: "natural yogurt", quantity: null },
    ],
    goal: "muscle_gain",
    situation: "I work two late shifts at the depot every week",
    aspiration: "Carry my own kayak down to the water by spring",
    context: "Thursday evening is chaotic, two late meetings",
    preferences: "smoky harissa flavours, and one proper crust",
    cookDays: ["thu", "sat"],
    cookingTimeMin: 45,
    recipeDifficulty: "keen",
    variety: "varied",
    kitchenEquipment: ["stovetop", "oven", "microwave", "freezer"],
    budgetAmount: 63,
    eatingRhythm: [
      { slot: "breakfast", size: "small" },
      { slot: "lunch", size: "large" },
      { slot: "dinner", size: "medium" },
    ],
    awayDays: [{ day: "fri", slots: ["lunch"] }],
    fixedIntakes: [{
      label: "Vanilla whey shake",
      amount: 31,
      unit: "g",
      days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      foodRef: "declared_vanilla_whey_shake",
      nutrition: "declared",
      servingGrams: 31,
      proteinGPerServing: 24,
      energyKcalPerServing: 118,
      // ⚠️ AJOUTÉ SANS CHANGER LES OCTETS PRODUITS, et c'est le point.
      // `FixedIntake` porte une union discriminée sur `placement`; l'objet
      // n'en portait aucun, ce que `buildMealPrompt(args as any)` laissait
      // passer. Au rendu (`fixed_intakes.ts:608`, `:627`) un `placement`
      // absent tombait dans la branche `else`, c'est-à-dire exactement le
      // comportement de `loose` — la ligne « WHAT THEY ALREADY HAVE » du
      // prompt de référence est identique avant et après. On ÉCRIT donc la
      // valeur dans laquelle il tombait déjà: le prompt ne bouge pas, et le
      // compilateur cesse de laisser passer un état que la base ne produit
      // jamais.
      placement: "loose",
    }],
    writtenInstructions: ["never put aubergine in my plan"],
    foodPreferences: ["they like oats at breakfast"],
  }),

  // ── 2 · MINIMUM VITAL ────────────────────────────────────────────────────
  // Un compte neuf qui n'a rempli que sa direction. La question est le
  // SILENCE: le prompt dit-il ce qu'il ne sait pas, ou laisse-t-il supposer ?
  "scenario-2": () => ({
    ...base(),
    goal: "health",
  }),

  // ── 3 · CONTRADICTIONS VOLONTAIRES ───────────────────────────────────────
  // Construites, pas espérées. Quatre collisions dans le même message:
  //   ① l'envie du moment réclame l'ALLERGÈNE médical (sesame → tahini);
  //   ② l'envie réclame aussi ce que le RÉGIME interdit (poulet, végétarien);
  //   ③ la consigne écrite réclame un INTERDIT du coach (dîner salade froide);
  //   ④ le goût confirmé réclame le DÉGOÛT déclaré (beetroot).
  "scenario-3": () => ({
    ...base(),
    safetyConstraints: [
      c(1, "allergy", "medical", { allergenRef: "sesame" }),
      c(3, "dislike", "preference", { allergenRef: "beetroot" }),
    ],
    body: FULL_BODY,
    dietBlock: dietaryRegimePromptLine("vegetarian"),
    goal: "fat_loss",
    context: "A friend is staying over on Friday and she is a big eater",
    preferences:
      "I want a proper tahini and sesame noodle bowl, and a roast chicken traybake",
    writtenInstructions: [
      "dinner should be a cold salad, nothing warm, I cannot face a hot plate at night",
    ],
    foodPreferences: ["they said beetroot is what makes a salad worth eating"],
    cookDays: ["thu"],
    cookingTimeMin: 40,
    kitchenEquipment: ["stovetop", "oven", "microwave", "freezer"],
    budgetAmount: 70,
    eatingRhythm: [
      { slot: "breakfast", size: "small" },
      { slot: "lunch", size: "medium" },
      { slot: "dinner", size: "large" },
    ],
  }),

  // ── 4 · TEMPS ET ARGENT AU PLANCHER ──────────────────────────────────────
  // Un seul jour de cuisine, 15 minutes, 18 de budget, cinq moments par jour,
  // pas de four ni de congélateur. Tout ce qui se dispute la place est une
  // contrainte de FAISABILITÉ, et l'envie demande l'inverse.
  "scenario-4": () => ({
    ...base(),
    body: FULL_BODY,
    goal: "fat_loss",
    situation: "I am on a hospital ward, twelve-hour shifts, four days a week",
    context: "Money is very tight until the end of the month",
    preferences: "slow-braised lamb shanks and a proper saffron risotto",
    cookDays: ["sat"],
    cookingTimeMin: 15,
    recipeDifficulty: "simple",
    variety: "repeat",
    kitchenEquipment: ["stovetop", "microwave"],
    budgetAmount: 18,
    eatingRhythm: [
      { slot: "breakfast", size: "small" },
      { slot: "snack_am", size: "small" },
      { slot: "lunch", size: "medium" },
      { slot: "snack_pm", size: "small" },
      { slot: "dinner", size: "large" },
    ],
  }),

  // ── 5 · BEAUCOUP D'EXCLUSIONS ────────────────────────────────────────────
  // Neuf lignes de contrainte, trois sévérités, un régime végane, et un
  // dégoût qui doit rester un dégoût. Le cas où la liste plate coûte le plus.
  "scenario-5": () => ({
    ...base(),
    safetyConstraints: [
      c(1, "allergy", "medical", { allergenRef: "peanut" }),
      c(2, "allergy", "medical", { allergenRef: "shellfish" }),
      c(3, "allergy", "strict", { allergenRef: "mustard" }),
      c(4, "intolerance", "strict", { substanceRef: "gluten" }),
      c(5, "intolerance", "preference", { substanceRef: "fructose" }),
      c(6, "dislike", "preference", { allergenRef: "coriander" }),
      c(7, "dislike", "preference", { allergenRef: "olive" }),
      c(8, "dislike", "preference", { allergenRef: "aubergine" }),
      c(9, "medical", "medical", { medicationClass: "warfarin" }),
    ],
    body: FULL_BODY,
    dietBlock: dietaryRegimePromptLine("vegan"),
    goal: "health",
    aspiration: "Walk the Ridgeway end to end in the spring",
    context: "Nothing special this week",
    preferences: "something green and crunchy",
    cookDays: ["thu", "sat"],
    cookingTimeMin: 50,
    recipeDifficulty: "keen",
    variety: "varied",
    kitchenEquipment: ["stovetop", "oven", "microwave", "freezer"],
    budgetAmount: 55,
    eatingRhythm: [
      { slot: "breakfast", size: "medium" },
      { slot: "lunch", size: "medium" },
      { slot: "dinner", size: "medium" },
    ],
  }),
};

const outDir = Deno.args[0];
if (!outDir) {
  console.error("usage: build_scenarios.ts <dossier>");
  Deno.exit(2);
}
await Deno.mkdir(outDir, { recursive: true });

const summary: Record<string, unknown> = { promptVersion: MEAL_PROMPT_VERSION };
for (const [name, make] of Object.entries(SCENARIOS)) {
  const args = make();
  const built = buildMealPrompt(args);
  await Deno.mkdir(`${outDir}/${name}`, { recursive: true });
  await Deno.writeTextFile(`${outDir}/${name}/prompt-user.txt`, built.userMessage);
  await Deno.writeTextFile(`${outDir}/${name}/prompt-system.txt`, built.systemPrompt);
  await Deno.writeTextFile(
    `${outDir}/${name}/inputs.json`,
    JSON.stringify(args, null, 2),
  );
  const sysJson = /\bjson\b/i.test(built.systemPrompt);
  const userJson = /\bjson\b/i.test(built.userMessage);
  summary[name] = {
    userChars: built.userMessage.length,
    systemChars: built.systemPrompt.length,
    jsonWordInSystem: sysJson,
    jsonWordInUser: userJson,
  };
  if (!sysJson || !userJson) {
    console.error(`⛔ ${name}: le mot « json » a disparu d'une moitié du prompt`);
  }
}
await Deno.writeTextFile(
  `${outDir}/summary.json`,
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
