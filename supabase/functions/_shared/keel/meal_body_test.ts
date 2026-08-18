import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1.0.0";

import { buildMealPrompt, parseGeneratedMeal } from "./meal_generation.ts";
import { type MealBodyContext, mealBodyBlocks } from "./meal_body.ts";
import { mealBodyContextFrom } from "./student_body_io.ts";
import { assessBirthDate } from "./student_age.ts";
import type { StudentSafetyConstraint } from "./safety_constraints.ts";

/**
 * FF-030 (volet élève) — UN TEST PAR GARANTIE.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-030-le-contexte-de-composition.md`
 *
 * Sans test NOMMÉ, une garantie se désarme au passage suivant sans que rien ne
 * rougisse. Ce dépôt l'a payé sur `no_cook_days`, sur `cooks`, et sur
 * `height_cm` — une colonne, un écran, une contrainte de bornes, et aucun
 * lecteur pendant deux jours.
 */

const PROMPT_BASE = {
  firstDayCookable: true,
  contentLocale: "en-US",
  budgetAmount: null,
  doctrineBlock: "== MARC'S METHOD ==",
  coachNoteBlock: null,
  fixedIntakes: [],
  dayProperties: [],
  merge: null,
  boxMemberIds: [],
  protocolBlock: "",
  beliefKeys: [],
  goal: "health" as const,
  situation: null,
  context: null,
  mode: "to_shop" as const,
  scope: "day" as const,
  slot: null,
  servings: 1,
  pantry: [],
  safetyConstraints: null,
  body: null,
  focusAxis: null,
};

/** Un corps entièrement connu. 1,72 m, pesé et mesuré la semaine passée. */
const KNOWN_BODY: MealBodyContext = {
  heightCm: 172,
  ageBand: "30_44",
  gender: "female",
  latestWeight: { weekStart: "2026-08-03", value: 74 },
  latestWaist: { weekStart: "2026-08-03", value: 88 },
  restrictionFlag: false,
};

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
  contentLocale: "en",
};

// ---------------------------------------------------------------------------
// GARANTIE 1 — une contrainte dure ENTRE dans la consigne, en tête
// ---------------------------------------------------------------------------

Deno.test("une allergie déclarée apparaît dans la consigne, AVANT la méthode", () => {
  const { userMessage } = buildMealPrompt({
    ...PROMPT_BASE,
    safetyConstraints: [PEANUT],
  });

  assertStringIncludes(userMessage, "peanut");
  // EN TÊTE, et pas n'importe où: si le budget de prompt tronque quoi que ce
  // soit, ce n'est pas la ligne qui dit « pas d'arachide » qui doit sauter.
  // C'est une assertion d'ORDRE, la seule du fichier, et elle est le sujet.
  assert(
    userMessage.indexOf("peanut") < userMessage.indexOf("== MARC'S METHOD =="),
    userMessage,
  );
  // Et le modèle a le droit de NOMMER l'allergène pour l'éviter — sans cette
  // phrase, un modèle prudent refuse de répondre à « est-ce qu'il y a des
  // arachides dedans ? », qui est la question qu'un allergique a le droit de
  // poser. Même politique de négation que la ceinture de sortie.
  assertStringIncludes(userMessage, "You MAY name them to warn");
});

Deno.test("sans contrainte, aucun bloc de contraintes — et pas un en-tête vide", () => {
  const none = buildMealPrompt({ ...PROMPT_BASE, safetyConstraints: [] });
  const unreadable = buildMealPrompt({ ...PROMPT_BASE, safetyConstraints: null });
  assert(!none.userMessage.includes("HARD CONSTRAINTS"), none.userMessage);
  // `[]` (aucune contrainte) et `null` (lecture en panne) rendent la MÊME
  // consigne. C'est voulu: la distinction est une information d'exploitation,
  // pas quelque chose à raconter au modèle.
  assertEquals(none.userMessage, unreadable.userMessage);
});

Deno.test("le VERROU DE SORTIE mord toujours — la consigne ne l'a pas remplacé", () => {
  // FF-030 R2. Le risque de ce lot est qu'on croie avoir déplacé la garantie
  // dans le prompt. Le prompt informe; la ceinture garantit. Ce test échouerait
  // le jour où quelqu'un « nettoie » le second parce que le premier existe.
  const meal = parseGeneratedMeal({
    dishes: [{
      title: "Peanut noodles",
      slot: "dinner",
      day: "mon",
      ingredients: [{ term: "peanut", quantity: "50 g" }],
      method: "toss",
      why: "quick",
    }],
    shopping_list: [],
  }, {
    doctrine: null,
    safetyConstraints: [PEANUT],
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
  });
  assertEquals(meal.dishes.length, 0);
  assert(meal.lock.reason !== "clean", meal.lock.reason);
});

// ---------------------------------------------------------------------------
// GARANTIE 2 — le plancher TCA retire la taille et le poids, PAS l'âge
// ---------------------------------------------------------------------------

Deno.test("sous restriction_flag, ni taille ni poids ne partent — âge et sexe restent", () => {
  const { userMessage } = buildMealPrompt({
    ...PROMPT_BASE,
    body: { ...KNOWN_BODY, restrictionFlag: true },
  });

  assert(!userMessage.includes("172"), userMessage);
  assert(!userMessage.includes("74"), userMessage);
  assert(!userMessage.includes("88"), userMessage);
  assert(!userMessage.includes("WHERE THEY ARE NOW"), userMessage);

  // Ce qui NE SE VISE PAS reste. On ne restreint pas pour changer son âge.
  assertStringIncludes(userMessage, "-- WHO THEY ARE --");
  assertStringIncludes(userMessage, "30 to 44");
  assertStringIncludes(userMessage, "female");
});

Deno.test("plancher levé: la taille et les mesures arrivent, avec leur date", () => {
  const { userMessage } = buildMealPrompt({ ...PROMPT_BASE, body: KNOWN_BODY });

  assertStringIncludes(userMessage, "height: 172 cm");
  assertStringIncludes(userMessage, "weight: 74 kg, measured week of 2026-08-03");
  assertStringIncludes(userMessage, "waist: 88 cm, measured week of 2026-08-03");
  // LA DATE N'EST PAS DÉCORATIVE. Sans elle, une mesure de février se lit comme
  // celle d'aujourd'hui.
  assertStringIncludes(userMessage, "A measurement carries its date");
  // Et la consigne dit ce qu'on n'attend PAS de ces chiffres. Taille + poids +
  // âge + sexe est la signature d'entrée d'une formule de métabolisme de base,
  // et `findNumericTarget` ne mord que sur l'énergie: rien ne rattraperait
  // « à 172 cm, ton dîner… » en sortie.
  assertStringIncludes(userMessage, "no daily energy need");
  assertStringIncludes(userMessage, "no BMI");
  assertStringIncludes(userMessage, "never write them back to the student");
});

Deno.test("le plancher est DANS la fonction pure, pas chez l'appelant", () => {
  // FF-030 R5. Une garde qu'un appelant applique est une garde que le prochain
  // appelant oublie. La preuve est ici: le MÊME corps, le seul drapeau qui
  // change, et deux sorties différentes — sans qu'aucun `if` d'appelant
  // n'existe.
  const open = mealBodyBlocks(KNOWN_BODY);
  const closed = mealBodyBlocks({ ...KNOWN_BODY, restrictionFlag: true });
  assertEquals(closed.whereTheyAreNow, []);
  assert(open.whereTheyAreNow.length > 0);
  assert(!closed.whoTheyAre.some((l) => l.includes("172")), closed.whoTheyAre.join("|"));
  assert(open.whoTheyAre.some((l) => l.includes("172")), open.whoTheyAre.join("|"));
});

// ---------------------------------------------------------------------------
// GARANTIE 3 — l'axe passe, le NOMBRE cible ne passe pas
// ---------------------------------------------------------------------------

Deno.test("l'axe entre dans la consigne, en toutes lettres", () => {
  const { userMessage } = buildMealPrompt({ ...PROMPT_BASE, focusAxis: "energy" });
  assertStringIncludes(userMessage, "Day-to-day energy");
  // Le garde-fou voyage avec l'axe: un axe que le coach n'a jamais traité ne
  // donne pas le droit d'inventer un conseil dessus.
  assertStringIncludes(userMessage, "teaching something he never taught");
});

Deno.test("sans axe, aucune ligne d'axe — et pas « aucun axe choisi »", () => {
  const withAxis = buildMealPrompt({ ...PROMPT_BASE, focusAxis: "sleep" });
  const without = buildMealPrompt({ ...PROMPT_BASE, focusAxis: null });
  assertStringIncludes(withAxis.userMessage, "Sleep quality");
  assert(!without.userMessage.includes("want to see improve"), without.userMessage);
});

Deno.test("la CIBLE CHIFFRÉE n'a aucun chemin jusqu'à la consigne", () => {
  // FF-030 §3, no-go engageant. `target_weight_kg` et `target_waist_cm` sont à
  // deux colonnes de celles qu'on lit, sur la MÊME ligne `student_goals`: la
  // tentation de les ajouter « puisqu'on y est » est concrète, et un lecteur de
  // plus est une ligne de `select` de plus.
  //
  // Le test lit la SOURCE plutôt que la sortie, parce que c'est la seule façon
  // de tester une absence d'entrée: une fois la colonne dans le `select`, plus
  // rien n'empêcherait quelqu'un de la passer.
  const caller = Deno.readTextFileSync(
    new URL("../../generate-meal-v1/index.ts", import.meta.url),
  );
  assert(!caller.includes("target_weight_kg"), "target_weight_kg a été ajouté au lecteur");
  assert(!caller.includes("target_waist_cm"), "target_waist_cm a été ajouté au lecteur");

  const prompt = Deno.readTextFileSync(new URL("./meal_generation.ts", import.meta.url));
  assert(!prompt.includes("target_weight"), "une cible chiffrée est entrée dans le prompt");
});

// ---------------------------------------------------------------------------
// GARANTIE 4 — l'âge est DÉRIVÉ, en bande, jamais un nombre stocké
// ---------------------------------------------------------------------------

Deno.test("l'âge est dérivé de birth_date, et part en BANDE", () => {
  const snapshot = {
    verdict: assessBirthDate("1990-03-01", "2026-08-10"),
    timezone: "Europe/Paris",
    heightCm: 172,
    gender: "female" as const,
    activityLevel: null,
    weights: [],
    waists: [],
  };
  // 36 ans révolus le 10 août 2026. Le contexte n'en garde que la bande.
  const context = mealBodyContextFrom(snapshot, false);
  assertEquals(context.ageBand, "30_44");

  const { userMessage } = buildMealPrompt({ ...PROMPT_BASE, body: context });
  assertStringIncludes(userMessage, "30 to 44");
  // LE NOMBRE NE SORT PAS. Une bande ne peut pas ressortir telle quelle dans
  // une prose (« à 36 ans, vous… »), ce qu'un nombre exact finit par faire —
  // et `findNumericTarget` ne l'attraperait pas, il ne mord que sur l'énergie.
  assert(!userMessage.includes("36"), userMessage);
});

Deno.test("une date de naissance absente ou aberrante ne fabrique pas de bande", () => {
  for (const raw of [null, "", "pas-une-date", "2030-01-01", "1700-01-01"]) {
    const context = mealBodyContextFrom({
      verdict: assessBirthDate(raw, "2026-08-10"),
      timezone: null,
      heightCm: null,
      gender: null,
      activityLevel: null,
      weights: [],
      waists: [],
    }, false);
    assertEquals(context.ageBand, null, `bande inventée pour ${JSON.stringify(raw)}`);
  }
});

Deno.test("« le dernier poids » est bien le DERNIER, pas le premier", () => {
  // La série est rendue du plus ancien au plus récent par `loadStudentBody`, et
  // l'appelant ne devrait pas avoir à s'en souvenir. Lire le mauvais bout
  // servirait une portion dimensionnée sur une mesure de deux mois.
  const context = mealBodyContextFrom({
    verdict: assessBirthDate(null, "2026-08-10"),
    timezone: null,
    heightCm: null,
    gender: null,
    activityLevel: null,
    weights: [
      { weekStart: "2026-06-15", value: 81 },
      { weekStart: "2026-08-03", value: 74 },
    ],
    waists: [],
  }, false);
  assertEquals(context.latestWeight, { weekStart: "2026-08-03", value: 74 });
});

// ---------------------------------------------------------------------------
// LA CONDITION DE DÉSARMEMENT — R10
// ---------------------------------------------------------------------------

Deno.test("un élève dont on ne sait rien reçoit la même consigne qu'un corps absent", () => {
  // C'est le cas de TOUS les élèves qui n'ont rien rempli, et c'est ce qui rend
  // le lot additif. Par égalité de chaînes, pas par inspection: un test qui
  // vérifie « il n'y a pas de ligne de taille » laisserait passer un en-tête
  // vide, un saut de ligne de plus, ou un « not stated » ajouté plus tard.
  const absent = buildMealPrompt({ ...PROMPT_BASE, body: null });
  const empty = buildMealPrompt({
    ...PROMPT_BASE,
    body: {
      heightCm: null,
      ageBand: null,
      gender: null,
      latestWeight: null,
      latestWaist: null,
      restrictionFlag: false,
    },
  });
  assertEquals(absent.userMessage, empty.userMessage);
  assert(!absent.userMessage.includes("WHO THEY ARE"), absent.userMessage);
  assert(!absent.userMessage.includes("WHERE THEY ARE NOW"), absent.userMessage);
});

Deno.test("un corps entièrement inconnu SOUS plancher rend la même chose encore", () => {
  // La garde ne doit pas produire une consigne différente pour quelqu'un dont
  // on ne sait rien: sinon le plancher devient observable dans le prompt, et un
  // modèle qui remarque une absence la commente.
  const open = buildMealPrompt({
    ...PROMPT_BASE,
    body: {
      heightCm: null,
      ageBand: null,
      gender: null,
      latestWeight: null,
      latestWaist: null,
      restrictionFlag: false,
    },
  });
  const closed = buildMealPrompt({
    ...PROMPT_BASE,
    body: {
      heightCm: null,
      ageBand: null,
      gender: null,
      latestWeight: null,
      latestWaist: null,
      restrictionFlag: true,
    },
  });
  assertEquals(open.userMessage, closed.userMessage);
});

// ---------------------------------------------------------------------------
// LA LANE FOYER — aucun corps DANS LA CONSIGNE DE COMPOSITION (R7), et depuis
// le lot 3B un corps PAR MEMBRE dans le brief de portions
// ---------------------------------------------------------------------------

Deno.test("la lane foyer passe les contraintes dures et AUCUN corps global", () => {
  const caller = Deno.readTextFileSync(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  // Les contraintes de TOUS les membres entrent dans la consigne: c'est le
  // trou que le paramètre requis a rendu visible sur cette lane.
  assertStringIncludes(caller, "safetyConstraints: constraints");
  // Et pas de corps GLOBAL: il n'y en a pas UN pour une tablée, et prendre
  // celui du titulaire servirait ses portions à ses enfants.
  assertStringIncludes(caller, "body: null");
});

Deno.test("LOT 3B — la lane foyer charge bien un corps PAR MEMBRE", () => {
  // « Un morceau construit dont personne n'a rebranché le fil » est le mode
  // d'échec n°1 de ce dépôt: le chargeur peut exister, être testé, et n'avoir
  // aucun appelant. Le test précédent prouve une ABSENCE (`body: null`), et une
  // absence prouvée sans sa contrepartie laisserait le lot 3B passer pour livré
  // alors qu'il ne serait que compilé.
  const caller = Deno.readTextFileSync(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  assertStringIncludes(caller, "loadHouseholdMemberBodies(admin");
  // APPARIÉ SUR `member_id`. Un appariement resté sur `user_id` rendrait
  // `undefined` pour chaque bouche et le foyer composerait sans aucun corps,
  // en silence.
  assertStringIncludes(caller, "bodies.byMember.get(r.member_id)");
  // Et le coût est journalisé: le lot fait passer la lecture de corps de 1 à N
  // par génération, et un nombre qu'on ne journalise pas est un nombre que
  // personne ne verra doubler.
  assertStringIncludes(caller, "keel.household_meal.member_bodies");
});
