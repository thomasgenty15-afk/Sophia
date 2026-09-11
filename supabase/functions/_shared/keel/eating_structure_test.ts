/**
 * LE BANC DE FF-060 — chaque cas est une ligne du tableau de la fiche.
 *
 * `docs/fonctionnalites/composition-des-repas/FF-060-les-plages-suivent-le-besoin.md`
 *
 * ⚠️ LES CIBLES SONT ÉCRITES EN LITTÉRAL, jamais recalculées. Un banc qui
 * appellerait `mouthTargetKcal` pour se donner ses propres entrées mesurerait
 * l'accord de deux modules avec eux-mêmes; celui-ci épingle les nombres que la
 * fiche publie, et rougit si l'un d'eux bouge.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  eatingStructureFor,
  MAX_DAY_SLOTS,
  MEAL_KCAL_PER_G_COMPOSED,
  mealMaxKcalFor,
  shakeDecisionFor,
  shakeHabitTextFor,
  SHAKE_STATES,
  SLOT_DAY_ORDER,
  SLOT_OPENING_ORDER,
  STRUCTURE_REASONS,
} from "./eating_structure.ts";

const THREE = ["breakfast", "lunch", "dinner"] as const;

function derive(
  targetKcal: number | null,
  weightKg: number | null,
  declared: readonly string[] = THREE,
  blocked: readonly string[] = [],
) {
  return eatingStructureFor({
    targetKcal,
    weightKg,
    declaredSlots: declared,
    blockedSlots: blocked,
  });
}

// ─── LE TABLEAU DE LA FICHE, LIGNE À LIGNE ──────────────────────────────────

Deno.test("75 kg sédentaire à 2 422 tient sur trois assiettes", () => {
  const s = derive(2422, 75);
  assertEquals(s.requiredCount, 3);
  assertEquals(s.opened, []);
  assertEquals(s.reason, "derived");
});

Deno.test("75 kg DEBOUT AVEC DU SPORT ne tient plus — 3 056 ouvre un moment", () => {
  const s = derive(3056, 75);
  assertEquals(s.requiredCount, 4);
  assertEquals(s.opened, ["snack_pm"]);
  assertEquals(s.slots, ["breakfast", "lunch", "snack_pm", "dinner"]);
});

Deno.test("⛔ 110 kg QUI SE MAINTIENT: le sport seul le fait basculer de 3 à 4", () => {
  // C'est la ligne qui prouve que le verrou suit le BESOIN, pas l'objectif.
  const sansSport = derive(3395, 110);
  assertEquals(sansSport.requiredCount, 3);
  assertEquals(sansSport.opened, []);

  const avecSport = derive(3765, 110);
  assertEquals(avecSport.requiredCount, 4);
  assertEquals(avecSport.opened, ["snack_pm"]);

  // ET IL NE REÇOIT AUCUN SHAKER: il ne prend pas de poids.
  assertEquals(
    shakeDecisionFor({
      direction: null,
      requiredCount: avecSport.requiredCount,
      hasFixedIntake: false,
    }),
    "not_applicable",
  );
});

Deno.test("84 kg en prise à 4 226 demande cinq moments, et le shaker", () => {
  const s = derive(4226, 84);
  assertEquals(s.requiredCount, 5);
  assertEquals(s.opened, ["snack_pm", "snack_am"]);
  assertEquals(s.slots, [
    "breakfast",
    "snack_am",
    "lunch",
    "snack_pm",
    "dinner",
  ]);
  assertEquals(
    shakeDecisionFor({ direction: "up", requiredCount: 5, hasFixedIntake: false }),
    "compose",
  );
});

// ─── LE SHAKER: LES TROIS CONDITIONS, CHACUNE ISOLÉE ────────────────────────

Deno.test("⛔ UN SHAKER DÉJÀ DÉCLARÉ N'EST JAMAIS RECOMPOSÉ PAR-DESSUS", () => {
  assertEquals(
    shakeDecisionFor({ direction: "up", requiredCount: 5, hasFixedIntake: true }),
    "declared",
  );
});

Deno.test("qui PERD du poids ne reçoit pas de shaker, même à cinq moments", () => {
  for (const direction of ["down", null] as const) {
    assertEquals(
      shakeDecisionFor({ direction, requiredCount: 5, hasFixedIntake: false }),
      "not_applicable",
      `direction ${direction}`,
    );
  }
});

Deno.test("sous quatre moments, les assiettes suffisent — pas de shaker", () => {
  assertEquals(
    shakeDecisionFor({ direction: "up", requiredCount: 3, hasFixedIntake: false }),
    "not_applicable",
  );
});

Deno.test("un compte indérivable ne compose rien", () => {
  assertEquals(
    shakeDecisionFor({ direction: "up", requiredCount: null, hasFixedIntake: false }),
    "not_applicable",
  );
});

// ─── CE QUE LA PERSONNE A NOMMÉ ABSENT GAGNE TOUJOURS ───────────────────────

Deno.test("⛔ UN MOMENT NOMMÉ ABSENT N'EST JAMAIS ROUVERT — on prend le suivant", () => {
  const s = derive(3056, 75, ["lunch", "dinner"], ["breakfast"]);
  assertEquals(s.requiredCount, 4);
  assert(!s.opened.includes("breakfast"), "le petit-déjeuner nommé absent est rouvert");
  assertEquals(s.opened, ["snack_pm", "snack_am"]);
});

Deno.test("tout bloqué et le compte non atteint: `capped`, jamais du silence", () => {
  const s = derive(4226, 84, ["lunch", "dinner"], [
    "breakfast",
    "snack_am",
    "snack_pm",
    "before_bed",
  ]);
  assertEquals(s.reason, "capped");
  assertEquals(s.opened, []);
  assertEquals(s.slots, ["lunch", "dinner"]);
  // Le compte RESTE dit: on sait de combien on manque.
  assertEquals(s.requiredCount, 5);
});

// ─── LES PORTES FERMÉES PAR `mouthTargetKcal`, EN AMONT ─────────────────────

Deno.test("aucune cible ⇒ aucune dérivation, et les moments déclarés intacts", () => {
  const s = derive(null, 84, ["lunch"]);
  assertEquals(s.reason, "no_target");
  assertEquals(s.requiredCount, null);
  assertEquals(s.opened, []);
  assertEquals(s.slots, ["lunch"]);
});

Deno.test("aucun corps ⇒ `no_body`, et surtout pas un compte deviné", () => {
  const s = derive(3000, null);
  assertEquals(s.reason, "no_body");
  assertEquals(s.requiredCount, null);
  assertEquals(s.opened, []);
});

Deno.test("un poids à zéro n'est pas un poids", () => {
  assertEquals(derive(3000, 0).reason, "no_body");
});

// ─── BORNES ET FORMES ───────────────────────────────────────────────────────

Deno.test("le compte ne dépasse jamais six moments", () => {
  const s = derive(99_000, 60);
  assertEquals(s.requiredCount, MAX_DAY_SLOTS);
  assertEquals(s.slots.length, MAX_DAY_SLOTS);
  assertEquals(s.reason, "derived");
});

Deno.test("qui déclare déjà plus que le requis ne se voit rien ajouter", () => {
  const s = derive(2422, 75, [...SLOT_DAY_ORDER]);
  assertEquals(s.opened, []);
  assertEquals(s.slots.length, 6);
});

Deno.test("les moments sortent TOUJOURS dans l'ordre de la journée", () => {
  const s = derive(4226, 84, ["dinner", "breakfast", "lunch"]);
  assertEquals(s.slots, [
    "breakfast",
    "snack_am",
    "lunch",
    "snack_pm",
    "dinner",
  ]);
});

Deno.test("un jeton hors vocabulaire est gardé, pas jeté en silence", () => {
  const s = derive(2422, 75, ["breakfast", "lunch", "dinner", "snack"]);
  assert(s.slots.includes("snack"), "le jeton legacy a disparu");
});

Deno.test("⛔ ON N'OUVRE JAMAIS LE JETON LEGACY `snack`", () => {
  assert(!SLOT_OPENING_ORDER.includes("snack"));
  const s = derive(4226, 84);
  assert(!s.opened.includes("snack"));
});

// ─── LA CONSTANTE, ET LA FORME QUI LA RENDRAIT COMPLICE ─────────────────────

Deno.test("un repas de 75 kg porte 810 kcal", () => {
  // ⚠️ LE NOMBRE EST ÉCRIT, PAS RECALCULÉ. `8 * 75 * MEAL_KCAL_PER_G_COMPOSED`
  // resterait vert quelle que soit la constante: le banc mesurerait alors sa
  // propre arithmétique.
  assertEquals(mealMaxKcalFor(75), 810);
  assertEquals(mealMaxKcalFor(84), 907.2);
});

Deno.test("la densité est celle qui a été MESURÉE, et elle est épinglée ici", () => {
  assertEquals(MEAL_KCAL_PER_G_COMPOSED, 1.35);
  // Mutation: à 1,8 (le plafond de verdict), Theo tomberait à quatre moments.
  const aQuatre = Math.ceil(4226 / (8 * 84 * 1.8));
  assertEquals(aQuatre, 4);
  assertEquals(derive(4226, 84).requiredCount, 5);
});

// ─── VOCABULAIRES FERMÉS ────────────────────────────────────────────────────

Deno.test("les deux vocabulaires sont clos", () => {
  assertEquals([...STRUCTURE_REASONS], [
    "derived",
    "capped",
    "no_target",
    "no_body",
  ]);
  assertEquals([...SHAKE_STATES], ["compose", "declared", "not_applicable"]);
});

Deno.test("l'ordre d'ouverture et l'ordre du jour portent les MÊMES six moments", () => {
  assertEquals([...SLOT_OPENING_ORDER].sort(), [...SLOT_DAY_ORDER].sort());
});

// ═══════════════════════════════════════════════════════════════════════════
// CÂBLAGE — la dérivation est BRANCHÉE, et au bon endroit
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ CES TESTS LISENT LA SOURCE DU GÉNÉRATEUR. C'est le seul moyen d'attraper
// un débranchement: une fonction pure parfaitement testée que plus personne
// n'appelle reste verte pour toujours — « un paramètre de garde optionnel est
// une garde désarmée », et une garde non appelée l'est encore plus.

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

async function householdSource(): Promise<string> {
  return stripComments(
    await Deno.readTextFile(
      new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
    ),
  );
}

Deno.test("CÂBLAGE — la lane foyer DÉRIVE les moments, et n'en AJOUTE AUCUN", async () => {
  // ⟳ 2026-09-07 — CE CAS DISAIT L'INVERSE (« et écrit le résultat »). Décision
  // produit: « il n'y a aucun repas qui est ajouté par le générateur de plan,
  // c'est pas son travail ». La dérivation reste appelée — elle informe et se
  // compte —, mais elle ne réécrit plus les moments d'une bouche.
  const src = await householdSource();
  assert(
    src.includes("eatingStructureFor({"),
    "la dérivation n'est plus appelée: la fiche et la trace perdraient leur " +
      "« il faudrait N moments »",
  );
  assert(
    !src.includes("m.eatingSlots = structure.slots"),
    "le générateur réécrit les moments d'une bouche avec ceux qu'il a ouverts: " +
      "un « milieu de matinée » que personne n'a déclaré réapparaît dans le plan",
  );
  // ET LE SHAKER SUIT: posé sur une collation DÉCLARÉE, jamais sur un moment
  // ouvert — sinon il rouvrirait un moment par la bande.
  assert(
    !src.includes("(structure?.opened ?? []).find("),
    "le shaker se pose encore sur un moment ouvert par la dérivation",
  );
});

Deno.test("⛔ CÂBLAGE — la dérivation passe AVANT l'union, et après le corps", async () => {
  const src = await householdSource();
  const pace = src.indexOf("const paceByMember = new Map");
  const derive = src.indexOf("eatingStructureFor({");
  const union = src.indexOf("const eatingRhythm = ((): EatingOccasionSlot[]");
  const prompt = src.indexOf("buildMealPrompt(");

  assert(pace > 0 && derive > 0 && union > 0 && prompt > 0, "un repère a disparu");
  // Le cran de rythme AVANT: sans lui, `mouthTargetKcal` retombe sur le rythme
  // par défaut et ouvre un moment de moins que ce que le plan servira.
  assert(pace < derive, "le cran de rythme est lu APRÈS la dérivation");
  // L'union APRÈS: ce qu'on ouvre doit entrer dans la grille du plan.
  assert(derive < union, "la dérivation passe après l'union: rien n'est composé");
  // Et tout cela avant que le brief ne soit écrit.
  assert(union < prompt, "l'union passe après le prompt");
});

Deno.test("⛔ CÂBLAGE — la trace de structure ne porte ni kcal ni identifiant", async () => {
  const src = await householdSource();
  const i = src.indexOf('tag: "keel.household_meal.structure"');
  assert(i > 0, "la trace de la dérivation a disparu");
  const block = src.slice(i - 400, i + 300);
  for (const interdit of ["kcal", "target", "memberId", "member_id"]) {
    assert(
      !block.includes(interdit),
      `la trace porte \`${interdit}\`: un chiffre sur la personne sort du moteur`,
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LE SHAKER COMPOSÉ — sa phrase traverse les ceintures, ou elle n'existe pas
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("le cas nominal: du lait, des flocons, une banane, une purée", () => {
  const t = shakeHabitTextFor({ excludedGroups: [], tableAllergens: [] });
  assertEquals(
    t,
    "a drinkable shake, one tall glass, no plate: milk or skyr, oats, a banana, a nut or seed butter",
  );
});

Deno.test("⛔ UNE BOUCHE VÉGANE NE REÇOIT PAS DE LAIT DE VACHE", () => {
  // C'est l'enfant végane et le ragoût, transposé au shaker.
  const t = shakeHabitTextFor({
    excludedGroups: ["dairy_yogurt", "dairy_cheese"],
    tableAllergens: [],
  });
  assert(!t.includes("milk or skyr"), `du laitier a traversé: ${t}`);
  assert(t.includes("soy"), `aucun substitut nommé: ${t}`);
});

Deno.test("⛔ UNE TABLE ALLERGIQUE AUX FRUITS À COQUE N'A PAS DE PURÉE DE NOIX", () => {
  const t = shakeHabitTextFor({ excludedGroups: [], tableAllergens: ["tree_nut"] });
  assert(!t.includes("nut butter"), `une purée de noix a traversé: ${t}`);
  assert(t.includes("seed butter"), `aucune matière grasse de repli: ${t}`);
});

Deno.test("l'arachide ferme la même porte que le fruit à coque", () => {
  const t = shakeHabitTextFor({ excludedGroups: [], tableAllergens: ["peanut"] });
  assert(!t.includes("nut butter"), t);
});

Deno.test("noix ET sésame: on n'invente pas une matière grasse", () => {
  // ⚠️ La phrase RÉTRÉCIT plutôt que d'aller chercher un aliment que personne
  // n'a validé. Un shaker sans purée reste buvable; c'est le calcul d'après qui
  // le dimensionne.
  const t = shakeHabitTextFor({
    excludedGroups: [],
    tableAllergens: ["tree_nut", "sesame"],
  });
  assert(!t.includes("butter"), t);
  assert(t.includes("a banana"), t);
});

Deno.test("végane ET allergie au soja: il reste le lait d'avoine", () => {
  const t = shakeHabitTextFor({
    excludedGroups: ["dairy_yogurt", "dairy_cheese"],
    tableAllergens: ["soy"],
  });
  assert(t.includes("oat milk"), t);
  assert(!t.includes("soy"), t);
});

Deno.test("le gluten remplace les flocons, il ne les retire pas", () => {
  const t = shakeHabitTextFor({ excludedGroups: [], tableAllergens: ["gluten"] });
  assert(!t.includes("oats"), t);
  assert(t.includes("rice flakes"), t);
});

Deno.test("⛔ AUCUN NOMBRE, AUCUN MOT DE CORPS, DANS TOUTES LES COMBINAISONS", () => {
  // `FORBIDDEN_PORTION_TERMS` mord sur la prose servie; et la contrainte du
  // propriétaire est que le prompt dit QUOI, jamais COMBIEN.
  const jetons = ["dairy_yogurt", "dairy_cheese"];
  const allergenes = ["tree_nut", "peanut", "sesame", "soy", "gluten", "dairy"];
  const interdits = [
    /\d/, /kcal/i, /calorie/i, /gram/i, /\bg\b/, /weight/i, /poids/i,
    /dense/i, /\bgain\b/i, /bulk/i, /mass\b/i, /protein/i,
  ];
  for (let i = 0; i < 1 << jetons.length; i++) {
    for (let j = 0; j < 1 << allergenes.length; j++) {
      const t = shakeHabitTextFor({
        excludedGroups: jetons.filter((_, k) => i & (1 << k)),
        tableAllergens: allergenes.filter((_, k) => j & (1 << k)),
      });
      for (const motif of interdits) {
        assert(!motif.test(t), `« ${t} » contient ${motif}`);
      }
      assert(t.startsWith("a drinkable shake"), t);
    }
  }
});
