/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT D (2026-09-11) — AJUSTER DES COMPOSANTS CULINAIRES SANS DÉFORMER LEURS
 * RECETTES.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUE CE FICHIER PROUVE, ET CE QU'IL NE PROUVE PAS. Il prouve que les
 * RAPPORTS d'une sauce, d'une farce, d'une pâte et d'une cuisson à liquide lié
 * survivent à l'ajustement, et qu'une étiquette du modèle n'élargit aucune
 * protection du référentiel. **Il ne prouve RIEN sur le goût.** Aucune de ces
 * assertions n'a mangé quoi que ce soit; `consumers_degraded = 0` veut dire
 * « aucune portion déjà conforme EN DENSITÉ rendue non conforme », et rien
 * d'autre (revue du 2026-09-11 §5).
 *
 * Chaque garde a un cas qui MORD et un cas qui PASSE À CÔTÉ: une garde qui ne
 * mord jamais ressemble trait pour trait à une garde qui marche.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  adjustProportions,
  type AdjustableIngredient,
  type AdjustableUnit,
  type ConsumerConstraint,
  type MeasureFn,
} from "./proportion_adjust.ts";
import {
  bodiesOfUnit,
  CULINARY_ROLES,
  DENSE_SEASONING_GROUPS,
  type DeclaredComponent,
  emptyStructureCounters,
  EVERY_LINE_ITS_OWN_FREE_BODY,
  FREE_ROLES,
  type StructureLine,
  STRUCTURE_LOCK_REASONS,
} from "./culinary_structure.ts";
import type { FoodGroupRef } from "./tokens.ts";

// ═══════════════════════════════════════════════════════════════════════════
// UN RÉFÉRENTIEL DE POCHE — les densités sont rondes, chaque assertion se
// recalcule à la main.
// ═══════════════════════════════════════════════════════════════════════════

const POCKET: Record<
  string,
  { kcalPerRawG: number; readyPerRawG: number; group: FoodGroupRef | null }
> = {
  "poulet": { kcalPerRawG: 1.4, readyPerRawG: 0.7, group: "poultry" },
  "riz": { kcalPerRawG: 3.5, readyPerRawG: 2.5, group: "whole_grain" },
  "courgette": { kcalPerRawG: 0.2, readyPerRawG: 1, group: "non_starchy_veg" },
  "laitue": { kcalPerRawG: 0.15, readyPerRawG: 1, group: "leafy_greens" },
  "tomate": { kcalPerRawG: 0.2, readyPerRawG: 1, group: "non_starchy_veg" },
  "tahini": { kcalPerRawG: 6, readyPerRawG: 1, group: "nuts_seeds" },
  "huile": { kcalPerRawG: 9, readyPerRawG: 1, group: "olive_oil" },
  "feta": { kcalPerRawG: 2.85, readyPerRawG: 1, group: "dairy_cheese" },
  "citron": { kcalPerRawG: 0.28, readyPerRawG: 1, group: "citrus" },
  "oeuf": { kcalPerRawG: 1.4, readyPerRawG: 1, group: "eggs" },
  "chapelure": { kcalPerRawG: 3.5, readyPerRawG: 1, group: "refined_grain" },
  "farine": { kcalPerRawG: 3.4, readyPerRawG: 1, group: "refined_grain" },
  "lait": { kcalPerRawG: 0.5, readyPerRawG: 1, group: "dairy_yogurt" },
  "bouillon": { kcalPerRawG: 0, readyPerRawG: 1, group: "water" },
  "sel": { kcalPerRawG: 0, readyPerRawG: 1, group: "sauce_dressing" },
};

const measure: MeasureFn = (ings) => {
  let kcal = 0;
  let readyG = 0;
  let any = false;
  for (const i of ings) {
    const p = POCKET[i.term];
    if (p === undefined) return { kcal: null, readyG: null };
    const g = i.grams;
    if (g === null || !(g > 0)) continue;
    kcal += g * p.kcalPerRawG;
    readyG += g * p.readyPerRawG;
    any = true;
  }
  return any ? { kcal, readyG } : { kcal: null, readyG: null };
};

function ing(
  unitId: string,
  term: string,
  grams: number | null,
  part: string | null,
): AdjustableIngredient & { part: string | null } {
  return {
    ingredientId: `${unitId}#${term}`,
    term,
    grams,
    baselineGrams: grams,
    group: POCKET[term].group,
    isCondiment: term === "sel" || term === "bouillon",
    fixed: false,
    part,
  };
}

/** Une unité dont la structure est VALIDÉE par le moteur, comme en production. */
function unit(
  unitId: string,
  ings: readonly (AdjustableIngredient & { part: string | null })[],
  declared: readonly DeclaredComponent[],
  over: Partial<AdjustableUnit> = {},
): AdjustableUnit {
  const counters = emptyStructureCounters();
  const lines: StructureLine[] = ings.map((i) => ({
    lineId: i.ingredientId,
    part: i.part,
    group: i.group,
    weighed: i.grams !== null,
  }));
  return {
    unitId,
    kind: "dish",
    ingredients: ings,
    adjustable: true,
    fixedReason: null,
    bodies: bodiesOfUnit({ unitId, lines, declared, counters }),
    ...over,
  };
}

function consumer(
  consumerId: string,
  parts: readonly { unitId: string; share: number }[],
  min: number | null,
  max: number | null,
): ConsumerConstraint {
  return { consumerId, parts, minPer100G: min, maxPer100G: max, preferredPer100G: null };
}

function gramsOf(
  out: ReturnType<typeof adjustProportions>,
  unitId: string,
  term: string,
): number {
  const u = out.units.find((x) => x.unitId === unitId)!;
  const i = u.ingredients.find((x) => x.ingredientId === `${unitId}#${term}`)!;
  return Number(i.grams);
}

/** Le rapport de deux lignes — le nombre que ce lot existe pour protéger. */
function ratioBetween(
  out: ReturnType<typeof adjustProportions>,
  unitId: string,
  a: string,
  b: string,
): number {
  return gramsOf(out, unitId, a) / gramsOf(out, unitId, b);
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LE VOCABULAIRE — fermé, et la frontière libre/dépendant est le lot
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("épinglage — neuf rôles, deux libres, quatre groupes denses", () => {
  assertEquals([...CULINARY_ROLES], [
    "main",
    "separable_side",
    "sauce",
    "seasoning",
    "stuffing",
    "batter",
    "binder",
    "bound_hydration",
    "garnish_fat",
  ]);
  assertEquals([...FREE_ROLES].sort(), ["main", "separable_side"]);
  assertEquals([...DENSE_SEASONING_GROUPS].sort(), [
    "dairy_cheese",
    "nuts_seeds",
    "olive_oil",
    "other_added_fat",
  ]);
  assertEquals(STRUCTURE_LOCK_REASONS.length, 8);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② UN CORPS SE MET À L'ÉCHELLE EN ENTIER — les rapports ne bougent pas
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LE MÊME MULTIPLICATEUR POUR TOUT LE CORPS: les rapports sont identiques après", () => {
  // Une sauce tahini seule dans son plat, et un couloir qui demande de la
  // densité. Le corps entier monte; 45/20/5 reste 45/20/5.
  // ⚠️ LE RIZ EST LÀ POUR QUE LE TEST PUISSE MORDRE. Un plat d'UN SEUL corps a
  // une densité invariante par mise à l'échelle: sans un second corps à faire
  // varier, l'ajusteur n'aurait rien à faire et le test se raconterait une
  // histoire.
  const lignes = [
    ing("u", "tahini", 45, "sauce"),
    ing("u", "citron", 20, "sauce"),
    ing("u", "huile", 5, "sauce"),
    ing("u", "laitue", 200, "base"),
    ing("u", "riz", 120, "riz"),
  ];
  const out = adjustProportions({
    units: [unit("u", lignes, [
      { id: "base", role: "main", partOf: null },
      { id: "sauce", role: "sauce", partOf: "base" },
      { id: "riz", role: "separable_side", partOf: null },
    ])],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 180, 400)],
    measure,
  });
  assert(out.moves.length > 0, "rien n'a bougé: le test ne mord pas");
  // ⛔ LES TROIS RAPPORTS DE LA SAUCE, À L'ARRONDI DE SORTIE PRÈS (1e-4).
  assertEquals(Math.round(ratioBetween(out, "u", "tahini", "citron") * 1e6) / 1e6, 2.25);
  assertEquals(Math.round(ratioBetween(out, "u", "tahini", "huile") * 1e6) / 1e6, 9);
  // ⛔ ET SON LIEN À CE QU'ELLE ASSAISONNE: la sauce est SOUDÉE à la base, donc
  // le rapport sauce/base est lui aussi constant. C'est ce qui empêche la sauce
  // de devenir le levier qui double les calories.
  assertEquals(Math.round(ratioBetween(out, "u", "tahini", "laitue") * 1e6) / 1e6, 0.225);
});

Deno.test("… le cas qui passe à côté: un couloir déjà tenu ne déplace rien", () => {
  const lignes = [
    ing("u", "tahini", 45, "sauce"),
    ing("u", "citron", 20, "sauce"),
    ing("u", "laitue", 200, "base"),
  ];
  const out = adjustProportions({
    units: [unit("u", lignes, [
      { id: "base", role: "main", partOf: null },
      { id: "sauce", role: "sauce", partOf: "base" },
    ])],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 50, 250)],
    measure,
  });
  assertEquals(out.outcome, "nothing_to_do");
  assertEquals(out.moves.length, 0);
  assertEquals(gramsOf(out, "u", "tahini"), 45);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ POULET EN SAUCE + RIZ — le riz varie, la sauce ne se déforme pas
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ POULET EN SAUCE + RIZ: le riz varie, les rapports de la sauce et son lien au poulet NON", () => {
  const lignes = [
    ing("u", "poulet", 200, "plat"),
    ing("u", "tahini", 40, "sauce"),
    ing("u", "citron", 20, "sauce"),
    ing("u", "riz", 100, "riz"),
  ];
  const declared: DeclaredComponent[] = [
    { id: "plat", role: "main", partOf: null },
    { id: "sauce", role: "sauce", partOf: "plat" },
    { id: "riz", role: "separable_side", partOf: null },
  ];
  const dense = adjustProportions({
    units: [unit("u", lignes, declared)],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 200, 400)],
    measure,
  });
  assert(dense.moves.length > 0, "rien n'a bougé: le test ne mord pas");
  // ⛔ LA SAUCE: rapport interne ET rapport au poulet, tous deux constants.
  assertEquals(Math.round(ratioBetween(dense, "u", "tahini", "citron") * 1e6) / 1e6, 2);
  assertEquals(Math.round(ratioBetween(dense, "u", "tahini", "poulet") * 1e6) / 1e6, 0.2);
  // ⚠️ ET LE RIZ A BIEN SERVI DE LEVIER — sans quoi la sauce serait constante
  // pour la seule raison que rien n'a bougé.
  assert(
    gramsOf(dense, "u", "riz") !== 100,
    "le riz n'a pas varié: l'accompagnement séparable ne sert à rien",
  );
});

Deno.test("… et le cas qui mord dans l'autre sens: sans rôle déclaré, le riz ne bouge pas non plus", () => {
  // Le MÊME décor, sans contrat. C'est le coût de la politique, mesuré ici.
  const lignes = [
    ing("u", "poulet", 200, null),
    ing("u", "tahini", 40, null),
    ing("u", "citron", 20, null),
    ing("u", "riz", 100, null),
  ];
  const out = adjustProportions({
    units: [unit("u", lignes, [])],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 200, 400)],
    measure,
  });
  assertEquals(out.moves.length, 0);
  assertEquals(out.counts.fixed_by_reason.component_locked, 4);
  assertEquals(gramsOf(out, "u", "riz"), 100);
  assertEquals(out.outcome, "not_found_within_limits");
  // ⛔ ET LE MOT RESTE « PAS TROUVÉ », JAMAIS « IMPOSSIBLE ».
  assertEquals(out.remaining[0].note.toLowerCase().includes("impossible"), false);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LES CINQ FAMILLES DU PLAN — aucun ingrédient isolé ne sert de variable
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ VINAIGRETTE, SAUCE TAHINI, FARCE À LIANT, PÂTE, LIQUIDE LIÉ: aucune ligne isolée", () => {
  const familles: {
    nom: string;
    role: string;
    lignes: readonly [string, number][];
  }[] = [
    { nom: "vinaigrette", role: "seasoning", lignes: [["huile", 30], ["citron", 10]] },
    { nom: "sauce tahini", role: "sauce", lignes: [["tahini", 45], ["citron", 20]] },
    { nom: "farce à liant", role: "binder", lignes: [["oeuf", 50], ["chapelure", 40]] },
    { nom: "pâte", role: "batter", lignes: [["farine", 120], ["lait", 200]] },
    { nom: "liquide lié", role: "bound_hydration", lignes: [["riz", 100], ["bouillon", 250]] },
  ];
  for (const f of familles) {
    const lignes = [
      ...f.lignes.map(([t, g]) => ing("u", t, g, "mix")),
      ing("u", "poulet", 200, "plat"),
    ];
    const out = adjustProportions({
      units: [unit("u", lignes, [
        { id: "plat", role: "main", partOf: null },
        { id: "mix", role: f.role, partOf: "plat" },
      ])],
      consumers: [consumer("c", [{ unitId: "u", share: 1 }], 220, 400)],
      measure,
    });
    const [a, ga] = f.lignes[0];
    const [b, gb] = f.lignes[1];
    const avant = ga / gb;
    const apres = ratioBetween(out, "u", a, b);
    assertEquals(
      Math.round(apres * 1e6) / 1e6,
      Math.round(avant * 1e6) / 1e6,
      `${f.nom}: le rapport ${a}/${b} a bougé (${avant} → ${apres})`,
    );
    // ⛔ ET SON RAPPORT AU PLAT QU'ELLE ACCOMPAGNE AUSSI.
    assertEquals(
      Math.round(ratioBetween(out, "u", a, "poulet") * 1e6) / 1e6,
      Math.round((ga / 200) * 1e6) / 1e6,
      `${f.nom}: le lien au plat a bougé`,
    );
  }
});

Deno.test("… le cas qui passe à côté: un accompagnement SÉPARABLE, lui, bouge seul", () => {
  const lignes = [
    ing("u", "poulet", 200, "plat"),
    ing("u", "riz", 100, "riz"),
  ];
  const out = adjustProportions({
    units: [unit("u", lignes, [
      { id: "plat", role: "main", partOf: null },
      { id: "riz", role: "separable_side", partOf: null },
    ])],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 200, 400)],
    measure,
  });
  assert(
    ratioBetween(out, "u", "riz", "poulet") !== 0.5,
    "le riz n'a pas bougé par rapport au poulet: rien ne distingue un accompagnement",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ UNE ÉTIQUETTE DU MODÈLE N'ÉLARGIT AUCUNE PROTECTION
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ FAUX RÔLE « ACCOMPAGNEMENT » SUR UN ASSAISONNEMENT DENSE: pas d'ouverture", () => {
  // Le modèle déclare l'huile et le tahini comme un accompagnement séparable.
  // Le RÉFÉRENTIEL dit que ces deux lignes sont des assaisonnements denses: le
  // composant est rétrogradé, et il lui faut un lien qu'il n'a pas.
  const counters = emptyStructureCounters();
  const lignes = [
    ing("u", "huile", 20, "garniture"),
    ing("u", "tahini", 30, "garniture"),
    ing("u", "laitue", 200, "plat"),
  ];
  const bodies = bodiesOfUnit({
    unitId: "u",
    lines: lignes.map((i) => ({
      lineId: i.ingredientId,
      part: i.part,
      group: i.group,
      weighed: i.grams !== null,
    })),
    declared: [
      { id: "plat", role: "main", partOf: null },
      { id: "garniture", role: "separable_side", partOf: null },
    ],
    counters,
  });
  assertEquals(counters.demoted_dense_seasoning, 1);
  // Rétrogradé ⇒ dépendant ⇒ sans lien ⇒ tout le bloc est conservateur.
  assertEquals(counters.units_conservative.link_missing, 1);
  assertEquals(bodies.length, 1);
  assertEquals(bodies[0].movable, false);

  const out = adjustProportions({
    units: [{
      unitId: "u",
      kind: "dish",
      ingredients: lignes,
      adjustable: true,
      fixedReason: null,
      bodies,
    }],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 250, 400)],
    measure,
  });
  assertEquals(out.moves.length, 0);
  assertEquals(gramsOf(out, "u", "huile"), 20);
  assertEquals(gramsOf(out, "u", "tahini"), 30);
});

Deno.test("… le cas qui passe à côté: un accompagnement qui n'est PAS dense garde son rôle", () => {
  const counters = emptyStructureCounters();
  const lignes = [
    ing("u", "riz", 100, "garniture"),
    ing("u", "laitue", 200, "plat"),
  ];
  const bodies = bodiesOfUnit({
    unitId: "u",
    lines: lignes.map((i) => ({
      lineId: i.ingredientId,
      part: i.part,
      group: i.group,
      weighed: i.grams !== null,
    })),
    declared: [
      { id: "plat", role: "main", partOf: null },
      { id: "garniture", role: "separable_side", partOf: null },
    ],
    counters,
  });
  assertEquals(counters.demoted_dense_seasoning, 0);
  assertEquals(bodies.length, 2);
  assert(bodies.every((b) => b.movable));
});

Deno.test("⛔ UN COMPOSANT PRINCIPAL PEUT CONTENIR DU FROMAGE: la garde ne mord que sur le TOUT dense", () => {
  // Un gratin: feta + courgette dans le même composant principal. Le composant
  // n'est PAS uniquement dense, donc il reste libre. Interdire le fromage dans
  // une recette n'est pas le sujet du lot — l'aliment reste autorisé.
  const counters = emptyStructureCounters();
  const lignes = [
    ing("u", "feta", 60, "gratin"),
    ing("u", "courgette", 300, "gratin"),
  ];
  const bodies = bodiesOfUnit({
    unitId: "u",
    lines: lignes.map((i) => ({
      lineId: i.ingredientId,
      part: i.part,
      group: i.group,
      weighed: i.grams !== null,
    })),
    declared: [{ id: "gratin", role: "main", partOf: null }],
    counters,
  });
  assertEquals(counters.demoted_dense_seasoning, 0);
  assertEquals(bodies[0].movable, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ UN CONTRAT MALFORMÉ EST TRAITÉ CONSERVATIVEMENT, ET C'EST NOMMÉ
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ CONTRAT ABSENT, LIGNE OUBLIÉE, COMPOSANT DOUBLÉ, LIEN INVALIDE, CYCLE: tout est figé et COMPTÉ", () => {
  const lignes = [
    ing("u", "poulet", 200, "plat"),
    ing("u", "tahini", 40, "sauce"),
  ];
  const lines: StructureLine[] = lignes.map((i) => ({
    lineId: i.ingredientId,
    part: i.part,
    group: i.group,
    weighed: true,
  }));
  const cas: { nom: string; lines: StructureLine[]; declared: DeclaredComponent[]; motif: string }[] =
    [
      { nom: "contrat absent", lines, declared: [], motif: "contract_absent" },
      {
        nom: "ligne sans composant",
        lines: [lines[0], { ...lines[1], part: null }],
        declared: [
          { id: "plat", role: "main", partOf: null },
          { id: "sauce", role: "sauce", partOf: "plat" },
        ],
        motif: "line_without_part",
      },
      {
        nom: "composant inconnu",
        lines,
        declared: [{ id: "plat", role: "main", partOf: null }],
        motif: "part_unknown",
      },
      {
        nom: "composant doublé",
        lines,
        declared: [
          { id: "plat", role: "main", partOf: null },
          { id: "plat", role: "sauce", partOf: "plat" },
          { id: "sauce", role: "sauce", partOf: "plat" },
        ],
        motif: "duplicate_component",
      },
      {
        nom: "rôle hors liste",
        lines,
        declared: [
          { id: "plat", role: "garniture_maison", partOf: null },
          { id: "sauce", role: "sauce", partOf: "plat" },
        ],
        motif: "role_unknown",
      },
      {
        nom: "lien qui ne désigne rien",
        lines,
        declared: [
          { id: "plat", role: "main", partOf: null },
          { id: "sauce", role: "sauce", partOf: "fantome" },
        ],
        motif: "link_missing",
      },
      {
        nom: "cycle",
        lines,
        declared: [
          { id: "plat", role: "sauce", partOf: "sauce" },
          { id: "sauce", role: "sauce", partOf: "plat" },
        ],
        motif: "link_cycle",
      },
      {
        nom: "composant sans ligne",
        lines,
        declared: [
          { id: "plat", role: "main", partOf: null },
          { id: "sauce", role: "sauce", partOf: "plat" },
          { id: "orphelin", role: "main", partOf: null },
        ],
        motif: "component_without_line",
      },
    ];
  for (const c of cas) {
    const counters = emptyStructureCounters();
    const bodies = bodiesOfUnit({
      unitId: "u",
      lines: c.lines,
      declared: c.declared,
      counters,
    });
    assertEquals(bodies.length, 1, `${c.nom}: un seul corps attendu`);
    assertEquals(bodies[0].movable, false, `${c.nom}: le corps devrait être figé`);
    assertEquals(bodies[0].lineIds.length, 2, `${c.nom}: toutes les lignes du bloc`);
    assertEquals(
      counters.units_conservative[c.motif as keyof typeof counters.units_conservative],
      1,
      `${c.nom}: le motif ${c.motif} n'est pas compté`,
    );
    assertEquals(counters.units_contracted, 0, `${c.nom}: le contrat a été accepté à tort`);
  }
});

Deno.test("… et le cas qui passe: un contrat bien formé est ACCEPTÉ et compté", () => {
  const counters = emptyStructureCounters();
  const bodies = bodiesOfUnit({
    unitId: "u",
    lines: [
      { lineId: "u#poulet", part: "plat", group: "poultry", weighed: true },
      { lineId: "u#tahini", part: "sauce", group: "nuts_seeds", weighed: true },
    ],
    declared: [
      { id: "plat", role: "main", partOf: null },
      { id: "sauce", role: "sauce", partOf: "plat" },
    ],
    counters,
  });
  assertEquals(counters.units_contracted, 1);
  assertEquals(counters.components_free, 1);
  assertEquals(counters.components_dependent, 1);
  assertEquals(bodies.length, 1, "la sauce est SOUDÉE au plat: un seul corps");
  assertEquals(bodies[0].movable, true);
  assertEquals(bodies[0].componentIds, ["plat", "sauce"]);
});

Deno.test("⛔ DEUX DÉPENDANTS SOUDÉS SANS AUCUN RÔLE LIBRE NE BOUGENT PAS", () => {
  // Une sauce accrochée à une farce, et rien qui porte un facteur. C'est le
  // « lien ambigu » du plan, et il est immobile.
  const counters = emptyStructureCounters();
  const bodies = bodiesOfUnit({
    unitId: "u",
    lines: [
      { lineId: "u#tahini", part: "sauce", group: "nuts_seeds", weighed: true },
      { lineId: "u#oeuf", part: "farce", group: "eggs", weighed: true },
    ],
    declared: [
      { id: "sauce", role: "sauce", partOf: "farce" },
      { id: "farce", role: "stuffing", partOf: "sauce" },
    ],
    counters,
  });
  // Le cycle est vu AVANT la soudure: c'est lui qui est nommé.
  assertEquals(bodies[0].movable, false);
  assertEquals(counters.units_conservative.link_cycle, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ UNE LIGNE QU'ON NE PEUT PAS ENTRAÎNER FIGE SON CORPS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ UNE LIGNE PESÉE ET VERROUILLÉE PAR L'APPELANT FIGE TOUT SON CORPS", () => {
  // Mettre la sauce à l'échelle en laissant sa ligne verrouillée sur place
  // changerait le RAPPORT que le corps existe pour protéger.
  const lignes = [
    ing("u", "tahini", 45, "sauce"),
    { ...ing("u", "citron", 20, "sauce"), fixed: true },
    ing("u", "laitue", 200, "plat"),
  ];
  const out = adjustProportions({
    units: [unit("u", lignes, [
      { id: "plat", role: "main", partOf: null },
      { id: "sauce", role: "sauce", partOf: "plat" },
    ])],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 250, 400)],
    measure,
  });
  assertEquals(out.moves.length, 0);
  assertEquals(gramsOf(out, "u", "tahini"), 45);
  assertEquals(gramsOf(out, "u", "laitue"), 200);
  assert(out.counts.fixed_by_reason.component_locked >= 2);
});

Deno.test("⛔ UN CONDIMENT PESÉ SUIT SON CORPS — et le RAPPORT est ce qui le prouve", () => {
  // Le sel d'une sauce qui maigrit doit maigrir avec elle, sinon la sauce
  // devient salée. Dans un corps à plusieurs lignes, plus rien n'est un levier
  // individuel: c'est le facteur commun qui décide.
  const lignes = [
    ing("u", "tahini", 45, "sauce"),
    ing("u", "sel", 2, "sauce"),
    ing("u", "laitue", 200, "plat"),
    ing("u", "riz", 120, "riz"),
  ];
  const out = adjustProportions({
    units: [unit("u", lignes, [
      { id: "plat", role: "main", partOf: null },
      { id: "sauce", role: "sauce", partOf: "plat" },
      { id: "riz", role: "separable_side", partOf: null },
    ])],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 180, 400)],
    measure,
  });
  assert(out.moves.length > 0, "rien n'a bougé: le test ne mord pas");
  assertEquals(Math.round(ratioBetween(out, "u", "tahini", "sel") * 1e6) / 1e6, 22.5);
});

Deno.test("… le cas qui passe à côté: SEUL, un condiment reste immobile", () => {
  // Hors d'un corps à plusieurs lignes, la convention produit reprend la main:
  // « une pincée n'est pas un levier », « le traitement de l'eau est fixe ».
  const lignes = [
    ing("u", "sel", 2, "sel"),
    ing("u", "laitue", 200, "plat"),
  ];
  const out = adjustProportions({
    units: [unit("u", lignes, [
      { id: "plat", role: "main", partOf: null },
      { id: "sel", role: "separable_side", partOf: null },
    ])],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 100, 400)],
    measure,
  });
  assertEquals(gramsOf(out, "u", "sel"), 2);
  assertEquals(out.counts.fixed_by_reason.condiment, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ UNE PRÉPARATION PARTAGÉE — aucun consommateur dégradé
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ PRÉPARATION PARTAGÉE: aucun consommateur dégradé, et les rapports internes tiennent", () => {
  const pot = unit(
    "pot",
    [
      ing("pot", "poulet", 400, "plat"),
      ing("pot", "tahini", 60, "sauce"),
      ing("pot", "citron", 30, "sauce"),
      ing("pot", "courgette", 500, "legumes"),
    ],
    [
      { id: "plat", role: "main", partOf: null },
      { id: "sauce", role: "sauce", partOf: "plat" },
      { id: "legumes", role: "separable_side", partOf: null },
    ],
    { kind: "preparation" },
  );
  const da = unit("da", [ing("da", "riz", 60, "riz")], [
    { id: "riz", role: "separable_side", partOf: null },
  ]);
  const db = unit("db", [ing("db", "laitue", 120, "salade")], [
    { id: "salade", role: "separable_side", partOf: null },
  ]);
  const out = adjustProportions({
    units: [pot, da, db],
    consumers: [
      consumer("a", [{ unitId: "pot", share: 0.5 }, { unitId: "da", share: 1 }], 120, 175),
      consumer("b", [{ unitId: "pot", share: 0.5 }, { unitId: "db", share: 1 }], 150, 400),
    ],
    measure,
  });
  // ⛔ LE COMPTEUR QUE LE LOT EXIGE À ZÉRO.
  assertEquals(out.counts.consumers_degraded, 0);
  // ⛔ ET LES RAPPORTS DE LA SAUCE PARTAGÉE, APRÈS DEUX AJUSTEMENTS QUI TIRENT
  // DANS DES SENS DIFFÉRENTS: 60/30 = 2, et 60/400 = 0,15 contre le poulet.
  assertEquals(Math.round(ratioBetween(out, "pot", "tahini", "citron") * 1e6) / 1e6, 2);
  assertEquals(Math.round(ratioBetween(out, "pot", "tahini", "poulet") * 1e6) / 1e6, 0.15);
  // les trois unités sont bien UNE composante
  assertEquals(out.components.length, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ UN CAS VOLONTAIREMENT IRRÉALISABLE RESTE NON CONFORME
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ IRRÉALISABLE DANS CES LIMITES: non conforme, et le composant verrouillé est INTACT", () => {
  // Un couloir hors d'atteinte, et une sauce sans structure fiable. Le test
  // ÉCHOUE si le moteur « résout » le cas en déformant le composant verrouillé.
  const lignes = [
    ing("u", "laitue", 300, "plat"),
    ing("u", "tahini", 40, null),
    ing("u", "citron", 20, null),
  ];
  const out = adjustProportions({
    units: [unit("u", lignes, [{ id: "plat", role: "main", partOf: null }])],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 600, null)],
    measure,
  });
  assertEquals(out.outcome, "not_found_within_limits");
  // ⛔ RIEN N'A BOUGÉ dans le mélange non structuré.
  assertEquals(gramsOf(out, "u", "tahini"), 40);
  assertEquals(gramsOf(out, "u", "citron"), 20);
  assertEquals(gramsOf(out, "u", "laitue"), 300);
  // ⛔ ET L'ISSUE NE DIT PAS « IMPOSSIBLE ».
  const dit = `${out.outcome} ${out.remaining[0].note} ${out.components[0].outcome}`;
  assertEquals(dit.toLowerCase().includes("impossible"), false);
});

Deno.test("… le cas qui passe à côté: le même couloir, atteignable, se ferme", () => {
  const lignes = [
    ing("u", "laitue", 300, "plat"),
    ing("u", "tahini", 40, "sauce"),
    ing("u", "citron", 20, "sauce"),
  ];
  const out = adjustProportions({
    units: [unit("u", lignes, [
      { id: "plat", role: "main", partOf: null },
      { id: "sauce", role: "sauce", partOf: "plat" },
    ])],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 70, 250)],
    measure,
  });
  assertEquals(out.counts.consumers_off_after, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑩ LE DÉSARMEMENT PORTE SON NOM
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ `EVERY_LINE_ITS_OWN_FREE_BODY` EST LA POLITIQUE D'AVANT LE LOT, et elle est nommée", () => {
  // Le même décor que le cas sans contrat plus haut. Avec le désarmement, les
  // lignes redeviennent des variables libres — c'est-à-dire l'état que la revue
  // du 2026-09-11 §5 a mesuré en train de réécrire quatre recettes.
  const lignes = [
    ing("u", "poulet", 200, null),
    ing("u", "tahini", 40, null),
    ing("u", "citron", 20, null),
    ing("u", "riz", 100, null),
  ];
  const out = adjustProportions({
    units: [{
      unitId: "u",
      kind: "dish",
      ingredients: lignes,
      adjustable: true,
      fixedReason: null,
      bodies: EVERY_LINE_ITS_OWN_FREE_BODY("u", lignes.map((i) => i.ingredientId)),
    }],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 200, 400)],
    measure,
  });
  assert(out.moves.length > 0, "le désarmement ne désarme rien");
  // ⛔ ET LE RAPPORT DE LA SAUCE A BIEN BOUGÉ: c'est ce que le lot retire.
  assert(
    Math.abs(ratioBetween(out, "u", "tahini", "citron") - 2) > 1e-6,
    "les rapports n'ont pas bougé: le désarmement ne prouve rien",
  );
});
