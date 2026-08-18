import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  attributedIntake,
  type HouseholdIntakeMouth,
  interleaveUnderCeiling,
  loadHouseholdFixedIntakes,
} from "./household_fixed_intakes.ts";
import {
  fixedIntakePromptLines,
  MAX_FIXED_INTAKES,
  slotIsTaken,
} from "./fixed_intakes.ts";
import { buildMealPrompt } from "./meal_generation.ts";

/**
 * FF-051 AU FOYER — LE LECTEUR QUI MANQUAIT.
 *
 * Ce fichier prouve les quatre choses qui ne se prouvent QUE sur le chargeur:
 * l'attribution (à qui est ce shaker), le refus de prendre le repas de la
 * tablée, le plafond du prompt, et le coût. Un module pur ne voit aucune des
 * quatre.
 */

const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MARC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const ANA_MEMBER = "11111111-1111-4111-8111-111111111111";
const MARC_MEMBER = "22222222-2222-4222-8222-222222222222";
/** Léo a huit ans: pas d'adresse e-mail, donc pas de compte. Cas NOMINAL. */
const LEO_MEMBER = "33333333-3333-4333-8333-333333333333";

const MOUTHS: HouseholdIntakeMouth[] = [
  { memberId: ANA_MEMBER, userId: ANA, displayName: "Ana" },
  { memberId: MARC_MEMBER, userId: MARC, displayName: "Marc" },
  { memberId: LEO_MEMBER, userId: null, displayName: "Léo" },
];

/** Ce que `shakerIntakeJson` (front) écrit, à l'octet près. */
function shakerJson(over: Record<string, unknown> = {}) {
  return {
    food_ref: "declared_mon_shaker",
    label: "mon shaker",
    amount: 30,
    unit: "g",
    days: [],
    nutrition: "declared",
    serving_grams: 30,
    protein_g_per_serving: 24,
    energy_kcal_per_serving: 120,
    ...over,
  };
}

/**
 * Le décor minimal de `buildMealPrompt`, recopié de `fixed_intakes_test.ts`.
 * Il ne sert qu'à une chose ici: lire le prompt AVEC et SANS apports.
 */
const PROMPT_ARGS = {
  firstDayCookable: true,
  contentLocale: "en-US",
  budgetAmount: null,
  safetyConstraints: null,
  body: null,
  focusAxis: null,
  dietBlock: "",
  doctrineBlock: "",
  coachNoteBlock: null,
  protocolBlock: "",
  beliefKeys: [],
  goal: "maintenance",
  situation: null,
  context: null,
  mode: "to_shop" as const,
  scope: "several_days" as const,
  pantry: [],
  cookDays: [],
  todayToken: "mon",
  today: null,
  country: null,
  daysToFill: ["mon", "sat"],
  eatingRhythm: [],
  awayDays: [],
  slot: null,
  servings: 4,
  dayProperties: [],
  merge: null,
  boxMemberIds: [],
};

type Tables = Record<string, Array<Record<string, unknown>>>;

/**
 * Un PostgREST en mémoire qui applique VRAIMENT son `eq('user_id', …)`.
 *
 * C'est le filtre qui compte: un faux qui rendrait toutes les lignes ferait
 * passer un chargeur qui sert le shaker d'Ana à Marc — et le prompt dirait
 * alors que deux personnes prennent le même pot.
 */
function stubDb(tables: Tables, opts: { failOn?: string } = {}) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const rows = tables[table] ?? [];
      const selected = () =>
        rows.filter((row) =>
          filters.every(([column, value]) =>
            String(row[column] ?? "") === String(value ?? "")
          )
        );
      // deno-lint-ignore no-explicit-any
      const api: any = {
        select: () => api,
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return api;
        },
        maybeSingle: () =>
          opts.failOn === table
            ? Promise.resolve({ data: null, error: { message: `boom:${table}` } })
            : Promise.resolve({ data: selected()[0] ?? null, error: null }),
      };
      return api;
    },
  };
}

function goals(over: Partial<Tables> = {}): Tables {
  return {
    student_goals: [
      { user_id: ANA, practical_constraints: { fixed_intakes: [shakerJson()] } },
      { user_id: MARC, practical_constraints: {} },
    ],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// L'ATTRIBUTION — « they already eat these » parle d'une tablée
// ---------------------------------------------------------------------------

Deno.test("l'apport porte le PRÉNOM de sa bouche, et son foodRef ne bouge pas", async () => {
  const got = await loadHouseholdFixedIntakes(stubDb(goals()), {
    mouths: MOUTHS,
  });

  assertEquals(got.intakes.length, 1);
  // Sans le prénom, la ligne dirait que TOUTE la tablée prend ce shaker — et
  // le modèle sauterait le goûter de tout le monde.
  assertEquals(got.intakes[0].label, "Ana: mon shaker");
  // R1 — le libellé est de la PROSE, l'identifiant est le seul chemin du
  // calcul. Le préfixer serait donner à un prénom le pouvoir de déplacer une
  // résolution d'aliment.
  assertEquals(got.intakes[0].foodRef, "declared_mon_shaker");
});

Deno.test("le shaker d'Ana ne part pas chez Marc — l'eq(user_id) est appliqué", async () => {
  const got = await loadHouseholdFixedIntakes(stubDb(goals()), {
    mouths: MOUTHS,
  });
  assertEquals(got.intakes.filter((i) => i.label.startsWith("Marc")), []);
});

Deno.test("une bouche SANS COMPTE ne coûte aucune requête", async () => {
  const onlyLeo = await loadHouseholdFixedIntakes(stubDb(goals()), {
    mouths: [MOUTHS[2]],
  });
  assertEquals(onlyLeo.reads, 0);
  assertEquals(onlyLeo.intakes, []);

  // Et le décompte est un VRAI décompte: deux comptes, deux allers-retours.
  const all = await loadHouseholdFixedIntakes(stubDb(goals()), {
    mouths: MOUTHS,
  });
  assertEquals(all.reads, 2);
});

// ---------------------------------------------------------------------------
// ⚠️ LA RÈGLE QUI TIENT TOUT — UN APPORT NE PREND PAS LE REPAS DE LA TABLÉE
// ---------------------------------------------------------------------------

Deno.test("un apport REMPLAÇANT ne vide PAS la case du foyer, et c'est compté", async () => {
  const got = await loadHouseholdFixedIntakes(
    stubDb(goals({
      student_goals: [
        {
          user_id: ANA,
          practical_constraints: {
            fixed_intakes: [
              shakerJson({ slot: "breakfast", replaces_meal: true }),
            ],
          },
        },
      ],
    })),
    { mouths: [MOUTHS[0]] },
  );

  // ⚠️ LA PREUVE PASSE PAR LA FONCTION DU MOTEUR, pas par le champ: c'est
  // `slotIsTaken` qui supprime le repas, et c'est donc elle qui doit dire non.
  assertEquals(slotIsTaken(got.intakes, "mon", "breakfast"), false);
  // Le moment reste NOMMÉ: le modèle doit savoir quand ça tombe pour ne pas le
  // répéter. Il perd le pouvoir de vider la case, pas l'information.
  const intake = got.intakes[0];
  assert(intake.placement === "at_slot");
  assertEquals(intake.slot, "breakfast");
  // Rien ne se retire en silence (R4).
  assertEquals(got.demoted, 1);
});

Deno.test("un apport À CÔTÉ du repas ne compte pas comme ramené", async () => {
  // ⚠️ LA CONTREPARTIE DU TEST D'AU-DESSUS. Sans elle, un chargeur qui
  // incrémenterait `demoted` à chaque ligne resterait vert: un compteur qui
  // compte tout ne distingue plus rien.
  const got = await loadHouseholdFixedIntakes(
    stubDb(goals({
      student_goals: [
        {
          user_id: ANA,
          practical_constraints: {
            fixed_intakes: [shakerJson({ slot: "snack_pm" })],
          },
        },
      ],
    })),
    { mouths: [MOUTHS[0]] },
  );
  assertEquals(got.demoted, 0);
  assertEquals(got.intakes.length, 1);
});

Deno.test("la rétrogradation ne touche QUE le remplacement", () => {
  const taken = attributedIntake({
    foodRef: "declared_x",
    label: "mon shaker",
    amount: 30,
    unit: "g",
    days: ["mon"],
    nutrition: "declared",
    servingGrams: 30,
    proteinGPerServing: 24,
    energyKcalPerServing: 120,
    placement: "at_slot",
    slot: "breakfast",
    replacesMeal: true,
  }, "Ana");
  assert(taken.placement === "at_slot");
  assertEquals(taken.replacesMeal, false);
  assertEquals(taken.days, ["mon"]);
  assertEquals(taken.amount, 30);
  assert("nutrition" in taken && taken.nutrition === "declared");
});

// ---------------------------------------------------------------------------
// LE PLAFOND DU PROMPT — huit lignes, et chacun servi avant les secondes fois
// ---------------------------------------------------------------------------

Deno.test("le plafond est celui du PROMPT, pas la somme des plafonds", () => {
  const line = (who: string, n: number) => ({
    foodRef: `declared_${who}_${n}`,
    label: `${who}: pot ${n}`,
    amount: 30,
    unit: "g" as const,
    days: [] as string[],
    placement: "loose" as const,
  });
  const perMouth = [
    [line("ana", 1), line("ana", 2), line("ana", 3), line("ana", 4), line("ana", 5)],
    [line("marc", 1), line("marc", 2), line("marc", 3)],
    [line("zoe", 1), line("zoe", 2)],
  ];
  const got = interleaveUnderCeiling(perMouth);

  assertEquals(got.intakes.length, MAX_FIXED_INTAKES);
  assertEquals(got.dropped, 10 - MAX_FIXED_INTAKES);
  // ⚠️ CHACUN EST SERVI UNE FOIS AVANT QUE QUICONQUE LE SOIT DEUX FOIS. Dans
  // l'ordre des bouches, les cinq pots d'Ana auraient mangé le budget et le
  // shaker de Zoé — la déclaration que ce lot fait traverser — serait tombé.
  assertEquals(got.intakes.slice(0, 3).map((i) => i.foodRef), [
    "declared_ana_1",
    "declared_marc_1",
    "declared_zoe_1",
  ]);
  assert(got.intakes.some((i) => i.foodRef === "declared_zoe_2"));
});

Deno.test("NEUF bouches à un seul apport tiennent quand même sous le plafond", () => {
  // ⚠️ UNE MUTATION A EXIGÉ CE TEST. Le plafond est vérifié à DEUX endroits —
  // dans le tour de rôle et entre deux tours — et la fixture d'au-dessus (trois
  // bouches) ne prouvait que le second: elle atteint 8 pile en fin de tour.
  // Retirer la vérification INTÉRIEURE laissait tout vert, et un foyer plus
  // large que le plafond aurait servi neuf lignes là où le prompt en tient
  // huit. Le premier tour à lui seul doit s'arrêter.
  const perMouth = Array.from({ length: 9 }, (_, n) => [{
    foodRef: `declared_m${n}`,
    label: `m${n}: pot`,
    amount: 30,
    unit: "g" as const,
    days: [] as string[],
    placement: "loose" as const,
  }]);
  const got = interleaveUnderCeiling(perMouth);
  assertEquals(got.intakes.length, MAX_FIXED_INTAKES);
  assertEquals(got.dropped, 1);
});

Deno.test("sous le plafond, RIEN ne tombe", () => {
  const got = interleaveUnderCeiling([
    [{
      foodRef: "declared_a",
      label: "a",
      amount: 1,
      unit: "unit",
      days: [],
      placement: "loose",
    }],
    [],
  ]);
  assertEquals(got.intakes.length, 1);
  assertEquals(got.dropped, 0);
});

// ---------------------------------------------------------------------------
// CE QU'ON N'A PAS SU LIRE — nommé, jamais silencieux
// ---------------------------------------------------------------------------

Deno.test("une lecture en PANNE ne casse pas le dîner, et elle se dit", async () => {
  const got = await loadHouseholdFixedIntakes(
    stubDb(goals(), { failOn: "student_goals" }),
    { mouths: MOUTHS },
  );
  assertEquals(got.intakes, []);
  assertEquals(got.issues, [
    `fixed_intakes_unreadable:${ANA_MEMBER}`,
    `fixed_intakes_unreadable:${MARC_MEMBER}`,
  ]);
});

Deno.test("une entrée ILLISIBLE est comptée, et n'emporte pas les autres", async () => {
  const got = await loadHouseholdFixedIntakes(
    stubDb(goals({
      student_goals: [
        {
          user_id: ANA,
          practical_constraints: {
            fixed_intakes: [
              // Une déclaration à moitié lisible: pas de portion, donc rien ne
              // se ramène à 100 g.
              shakerJson({ serving_grams: null }),
              shakerJson({ food_ref: "declared_autre", label: "l'autre pot" }),
            ],
          },
        },
      ],
    })),
    { mouths: [MOUTHS[0]] },
  );
  assertEquals(got.discarded, 1);
  assertEquals(got.intakes.map((i) => i.label), ["Ana: l'autre pot"]);
});

// ---------------------------------------------------------------------------
// ⛔ AUCUNE CALORIE NE SORT DANS LE TEXTE
// ---------------------------------------------------------------------------

Deno.test("le prompt PORTE l'apport — la chaîne va jusqu'au générateur", async () => {
  // ⚠️ LE SEUL TEST QUI DIT QUE LA DONNÉE ARRIVE AU MODÈLE. Le chargeur peut
  // être parfait et le paramètre rester `[]` en dur — c'est très exactement
  // l'état d'avant ce lot, et il durait depuis FF-051.
  const got = await loadHouseholdFixedIntakes(stubDb(goals()), {
    mouths: MOUTHS,
  });
  const { userMessage } = buildMealPrompt({
    ...PROMPT_ARGS,
    fixedIntakes: got.intakes,
  });
  assertStringIncludes(userMessage, "WHAT THEY ALREADY HAVE");
  assertStringIncludes(userMessage, "Ana: mon shaker");
});

Deno.test("un foyer où PERSONNE n'a déclaré rend le prompt de v16, au caractère près", async () => {
  // LA POPULATION NON CONCERNÉE PAR LE BUMP `v17`. Elle se prouve sur la sortie
  // du CHARGEUR et pas sur une constante: `buildMealPrompt` n'a pas changé,
  // donc ce qui pourrait casser l'identité est un chargeur qui rendrait une
  // ligne fantôme (un apport vide, une entrée « aucun apport ») pour un foyer
  // qui n'a rien déclaré.
  const got = await loadHouseholdFixedIntakes(
    stubDb(goals({
      student_goals: [
        { user_id: ANA, practical_constraints: {} },
        { user_id: MARC, practical_constraints: { fixed_intakes: [] } },
      ],
    })),
    { mouths: MOUTHS },
  );
  assertEquals(got.intakes, []);
  assertEquals(
    buildMealPrompt({ ...PROMPT_ARGS, fixedIntakes: got.intakes }).userMessage,
    // `[]` EN DUR: la valeur exacte que les trois sites de la fonction edge
    // portaient avant ce lot.
    buildMealPrompt({ ...PROMPT_ARGS, fixedIntakes: [] }).userMessage,
  );
});

// ---------------------------------------------------------------------------
// L'APPELANT — « un morceau construit dont personne n'a rebranché le fil »
// ---------------------------------------------------------------------------

/**
 * ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT L'AUDIT. Ce fichier-ci EN PARLE en
 * français et en anglais, et la fonction edge aussi: un `grep` naïf trouverait
 * « fixedIntakes: [] » dans une phrase qui raconte l'état d'AVANT, et
 * déclarerait mort un câblage vivant — ou vivant un câblage mort.
 */
function codeOf(url: URL): string {
  return Deno.readTextFileSync(url)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\/\/.*$/, ""))
    .join("\n");
}

Deno.test("la lane foyer BRANCHE le chargeur, et ne passe plus [] en dur", () => {
  const caller = codeOf(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  assertStringIncludes(caller, "loadHouseholdFixedIntakes(admin");
  // LES TROIS SITES. La consigne, le parseur, et le constat de trous: une
  // valeur qui diverge entre les trois est la faute que le tronc nomme
  // (« la consigne le dit, le parseur le tient »).
  assertEquals(caller.match(/fixedIntakes,/g)?.length, 3);
  // ⛔ ET AUCUN `[]` RESTANT. C'est la seule assertion qui morde si quelqu'un
  // rebranche un seul des trois sites sur la valeur vide.
  assert(!/fixedIntakes:\s*\[\]/.test(caller), "un site est resté sur []");
  // Le coût et ce qu'on a retiré sont journalisés.
  assertStringIncludes(caller, "keel.household_meal.fixed_intakes");
});

Deno.test("la consigne dit la QUANTITÉ, jamais l'énergie ni la protéine", async () => {
  const got = await loadHouseholdFixedIntakes(stubDb(goals()), {
    mouths: MOUTHS,
  });
  const prose = fixedIntakePromptLines(got.intakes).join("\n");

  // Un chiffre sur un ALIMENT — même famille que « 400 g de poulet ».
  assertStringIncludes(prose, "Ana: mon shaker (30 g)");
  // Et RIEN sur la personne: ni les 120 kcal du pot, ni ses 24 g de protéine.
  // Ils servent au calcul, ils ne se lisent pas dans un plan.
  assert(!prose.includes("120"), prose);
  assert(!prose.includes("24"), prose);
  assert(!/kcal|calorie|protein/i.test(prose), prose);
});
