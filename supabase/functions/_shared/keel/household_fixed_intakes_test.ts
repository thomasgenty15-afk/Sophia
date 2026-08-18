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
