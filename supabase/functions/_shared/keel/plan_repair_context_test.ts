/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE PÉRIMÈTRE ET LA PROJECTION — CE QU'UNE RÉPARATION A LE DROIT DE TOUCHER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUE CES CAS ÉPINGLENT, ET LA MESURE EST SUR LES ARCHIVES RÉELLES.
 * `scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/campagne-tir1-c6-*.json`
 * porte le premier jet ET le message de réparation qui a suivi. Le message ne
 * contient **aucun** des neuf titres de plats, et la réponse en conserve
 * **0/9** — plus 2/5 identifiants de préparation. Le décor ci-dessous est ce
 * plan-là, à l'identique.
 *
 * ⟳ 2026-09-12 · FERMETURE LOT 1 — LES TROIS CAS QUE LA REVUE A REPRODUITS
 * AVEC LES FONCTIONS DE PRODUCTION, ET QUI RENDAIENT UN PÉRIMÈTRE VIDE:
 * le déficit d'une JOURNÉE, les DEUX plats dédiés d'un même créneau, la
 * PORTION ATTENDUE ET ABSENTE. Les trois ont ici leur cas, et chacun garde à
 * côté de lui le cas qui doit continuer d'être REFUSÉ.
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  PLAN_PROJECTION_SOFT_CHARS,
  planProjection,
  repairScopeOf,
  unitAddress,
} from "./plan_repair_context.ts";
import type { RepairPlanShape } from "./plan_repair_context.ts";
import { buildRepairSessions, buildRepairUnits } from "./plan_repair_unit.ts";
import type { RepairExpectedCell, RepairUnitDish } from "./plan_repair_unit.ts";
import { planRepairMessage } from "./plan_defect_pass.ts";
import type { RepairDefect } from "./plan_repair_loop.ts";

/**
 * ⟳ 2026-09-13 · LOT 2 — LA TABLE DES SESSIONS, VIDE PAR DÉFAUT.
 *
 * ⛔ Elle est REQUISE, pas facultative : un appelant qui l'oublie rendrait un
 * périmètre sans session pour un défaut de session, c'est-à-dire un appel
 * annoncé comme réparable avec rien à réparer. Les cas qui testent les
 * déroulés en construisent une vraie.
 */
const AUCUNE_SESSION = buildRepairSessions({ sessions: [] });

// ═══════════════════════════════════════════════════════════════════════════
// LE DÉCOR — LE PREMIER JET DU TIR 1, À L'IDENTIQUE
// ═══════════════════════════════════════════════════════════════════════════

/** Un plat qui satisfait À LA FOIS la forme du plan et celle des unités. */
type Plat = RepairPlanShape["dishes"][number] & RepairUnitDish;

function plat(
  day: string,
  slot: string,
  title: string,
  uses: readonly string[],
  ingredients: readonly [string, string][] = [["tomate", "100 g"]],
  o: { memberId?: string | null; eaters?: readonly string[] } = {},
): Plat {
  return {
    day,
    slot,
    title,
    memberId: o.memberId ?? null,
    boxes: (o.eaters ?? ["zoe"]).map((m, i) => ({
      id: `${slot}_${day}_${i}`,
      memberIds: [m],
    })),
    uses: uses.map((preparationId) => ({ preparationId })),
    ingredients: ingredients.map(([term, quantity]) => ({
      term,
      quantity,
      ref: null,
    })),
  };
}

const TIR1_DISHES: readonly Plat[] = [
  plat("sat", "breakfast", "Frittata aux œufs, champignons, pain complet et pêche", [
    "prep_frittata",
  ]),
  plat("sat", "lunch", "Pita complète au thon, pois chiches, tomate et feta", []),
  plat("sat", "dinner", "Saumon, pommes de terre, tomate et laitue", [
    "prep_salmon",
    "prep_potatoes",
  ]),
  plat(
    "sun",
    "breakfast",
    "Frittata aux œufs, champignons, pain croustillant, tomate et fruits rouges",
    ["prep_frittata"],
  ),
  plat("sun", "lunch", "Saumon, pommes de terre, tomate, yaourt, citron et feta", [
    "prep_salmon",
    "prep_potatoes",
  ]),
  plat("sun", "dinner", "Dinde, couscous, tomate et poivron", [
    "prep_turkey",
    "prep_couscous",
  ]),
  plat("mon", "breakfast", "Thon, pain complet et tomate", [], [
    ["thon", "120 g"],
    ["pain complet", "80 g"],
  ]),
  plat("mon", "lunch", "Dinde, couscous, carotte, yaourt, citron et feta", [
    "prep_turkey",
    "prep_couscous",
  ]),
  plat("mon", "dinner", "Dinde, couscous, chou rouge, tomate et feta", [
    "prep_turkey",
    "prep_couscous",
  ]),
];

const TIR1: RepairPlanShape = {
  dishes: TIR1_DISHES,
  cooking_sessions: [],
  preparations: [
    {
      id: "prep_frittata",
      title: "Frittata aux œufs et champignons",
      servingsMade: 2,
      ingredients: [
        { term: "œufs", quantity: "6", ref: "whole_eggs" },
        { term: "champignons de Paris", quantity: "200 g", ref: "mushrooms" },
      ],
    },
    {
      id: "prep_salmon",
      title: "Saumon rôti",
      servingsMade: 2,
      ingredients: [{ term: "saumon", quantity: "300 g", ref: "salmon" }],
    },
    {
      id: "prep_potatoes",
      title: "Pommes de terre rôties",
      servingsMade: 2,
      ingredients: [{ term: "pommes de terre", quantity: "500 g", ref: "potato" }],
    },
    {
      id: "prep_turkey",
      title: "Dinde rôtie à l'huile d'olive",
      servingsMade: 3,
      ingredients: [{ term: "dinde", quantity: "450 g", ref: "turkey_breast" }],
    },
    {
      id: "prep_couscous",
      title: "Couscous complet",
      servingsMade: 3,
      ingredients: [{ term: "couscous complet", quantity: "270 g", ref: "couscous" }],
    },
  ],
};

const DATES: Readonly<Record<string, string>> = {
  sat: "2026-09-12",
  sun: "2026-09-13",
  mon: "2026-09-14",
};

const GRILLE: readonly RepairExpectedCell[] = TIR1_DISHES.map((d) => ({
  memberId: "zoe",
  dayToken: String(d.day),
  slot: String(d.slot),
  date: DATES[String(d.day)],
}));

const INDEX = buildRepairUnits({ dishes: TIR1_DISHES, expected: GRILLE });

/** Le jeton de l'unité d'une case, pour écrire les attentes sans les deviner. */
function u(day: string, slot: string, ownerId: string | null = null): string {
  const trouve = INDEX.units.find((x) =>
    x.dayToken === day && x.slot === slot && x.ownerId === ownerId
  );
  assert(trouve !== undefined, `unité introuvable: ${day}/${slot}`);
  return trouve.unitId;
}

function defaut(o: Partial<RepairDefect> & { kind: RepairDefect["kind"] }): RepairDefect {
  return {
    cause: null,
    date: null,
    preparationId: null,
    // ⟳ 2026-09-13 · LOT 2 — `sessionIndex` est REQUIS et nullable.
    sessionIndex: null,
    source: "gate",
    day: null,
    slot: null,
    dish: null,
    memberId: null,
    detail: "",
    repairable: true,
    magnitude: null,
    measure: null,
    ...o,
  };
}

/** Le défaut réel du tir 1: `mon/breakfast`, −19 % contre 614 kcal visées. */
const DEFAUT_TIR1 = defaut({
  kind: "sizing",
  cause: "cell_energy_off",
  day: "mon",
  slot: "breakfast",
  memberId: "zoe",
  detail:
    "the breakfast dish carries 497 kcal in one serving and it must carry 614 kcal, within 10%.",
  magnitude: 117,
  measure: {
    of: "energy",
    servedKcal: 497,
    targetKcal: 614,
    deltaPct: -19,
    tolerancePct: 10,
  },
});

function message(defects: readonly RepairDefect[], index = INDEX, plan = TIR1) {
  const scope = repairScopeOf({ plan, index, sessions: AUCUNE_SESSION, defects });
  return {
    scope,
    composed: planRepairMessage({
      catalogLines: [],
      defects,
      days: [],
      plan,
      index,
      sessions: AUCUNE_SESSION,
      scope,
      // ⚠️ `null` = PAS DE TABLE DE NUTRITION. Ces cas-ci n'en ont pas, et
      // c'est une réponse: le bloc des contrats d'un lot commun ne s'écrit
      // alors pas du tout, plutôt qu'en points d'interrogation.
      nutrition: null,
      baseVersion: "req#r0",
      afterVerdict: null,
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LE PLAN EST DANS LA REQUÊTE — LES TITRES ET LES IDENTIFIANTS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("① les NEUF titres et les CINQ identifiants sont dans la chaîne envoyée", () => {
  const { composed } = message([DEFAUT_TIR1]);
  assert(composed !== null, "il y a quelque chose à demander");
  // ⛔ LA MORSURE. Le message archivé du tir 1 n'en contenait AUCUN.
  for (const d of TIR1.dishes) {
    assert(composed.text.includes(d.title), `titre absent: ${d.title}`);
  }
  // ⛔ ET LES CASSEROLES, par leur identifiant stable — 2/5 conservés dans les
  // archives, parce que le modèle ne les relisait nulle part.
  for (const p of TIR1.preparations) {
    assert(
      composed.text.includes(p.id),
      `identifiant de préparation absent: ${p.id}`,
    );
  }
  // ⛔ ET L'UNITÉ DU DÉFAUT EST NOMMÉE PAR SON JETON.
  assert(composed.text.includes(u("mon", "breakfast")), composed.text);
  assert(composed.text.includes("mon/breakfast"), composed.text);
});

Deno.test("① bis — LE CAS QUI PASSE: sans défaut réparable, aucune demande", () => {
  // ⛔ UNE GARDE ÉPROUVÉE SEULEMENT SUR CE QU'ELLE REFUSE EST INDISCERNABLE
  // D'UNE GARDE CASSÉE. Un plan propre ne doit pas produire de message.
  const { composed } = message([defaut({ kind: "preference", repairable: false })]);
  assertEquals(composed, null);
});

Deno.test("① ter — le message UTILISATEUR porte le périmètre, jamais un second schéma", () => {
  // ⟳ 2026-09-13 · LOT 2 — CE TEST A CHANGÉ DE FORME, ET C'EST LE LOT.
  //
  // ⛔ LA CONTRADICTION FERMÉE AU LOT PRÉCÉDENT: l'ancienne queue disait
  // « Return the full plan JSON » à un modèle qui ne voyait qu'une projection.
  //
  // ⛔ CELLE QUE CE LOT FERME EST PLUS HAUT: le message SYSTÈME portait encore
  // `MEAL_SYSTEM_PROMPT` et son `OUTPUT JSON SCHEMA` de plan complet. Le
  // schéma du patch vit donc maintenant dans le système, et lui SEUL; le
  // message utilisateur ne porte plus que ce qui change d'un appel à l'autre —
  // la version à citer, les identifiants autorisés, le plan projeté.
  const { composed } = message([DEFAUT_TIR1]);
  assert(composed !== null);
  assert(!composed.text.includes("Return the full plan JSON"), composed.text);
  assert(composed.text.includes('"base_version":"req#r0"'), composed.text);
  assert(composed.text.includes("unit_ids"), composed.text);
  // ⛔ LE SCHÉMA N'EST PAS ICI — il est dans le message système, une seule fois.
  assert(
    !composed.text.includes('{"repair":{"base_version":"<the version'),
    "le schéma est écrit deux fois: c'est la contradiction qu'on ferme",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LA PROJECTION — ELLE SACRIFIE DE L'IDENTITÉ, JAMAIS DU CONTENU
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("② la projection tient sous son plafond souple sans rien amputer", () => {
  const scope = repairScopeOf({ plan: TIR1, index: INDEX, sessions: AUCUNE_SESSION, defects: [DEFAUT_TIR1] });
  const entiere = planProjection({
    plan: TIR1,
    index: INDEX,
    sessions: AUCUNE_SESSION,
    scope,
    nutrition: null,
    defects: [],
  });
  assert(entiere.counters.chars <= PLAN_PROJECTION_SOFT_CHARS);
  assertEquals(entiere.counters.identity_lines_dropped, 0);
  assertEquals(entiere.counters.units_listed, 9);
  assertEquals(entiere.tooLarge, false);
});

Deno.test("② bis — à plafond serré, l'IDENTITÉ tombe et le CONTENU reste", () => {
  const scope = repairScopeOf({ plan: TIR1, index: INDEX, sessions: AUCUNE_SESSION, defects: [DEFAUT_TIR1] });
  const serree = planProjection({
    plan: TIR1,
    index: INDEX,
    sessions: AUCUNE_SESSION,
    scope,
    nutrition: null,
    defects: [],
    softMaxChars: 300,
  });
  assert(serree.counters.identity_lines_dropped > 0);
  assert(serree.text.includes("not listed here"), serree.text);
  // ⛔ LE CONTENU DE L'UNITÉ VISÉE N'EST JAMAIS COUPÉ. C'est l'exigence
  // littérale du plan: « ne pas tronquer les ingrédients/contraintes d'une
  // unité sélectionnée pour tenir sous le plafond ».
  assert(serree.text.includes("holds: 120 g thon"), serree.text);
  assertEquals(serree.tooLarge, false);
});

Deno.test("② ter — si l'obligatoire déborde le plafond DUR, on le dit et on ne part pas", () => {
  const scope = repairScopeOf({ plan: TIR1, index: INDEX, sessions: AUCUNE_SESSION, defects: [DEFAUT_TIR1] });
  const trop = planProjection({
    plan: TIR1,
    index: INDEX,
    sessions: AUCUNE_SESSION,
    scope,
    nutrition: null,
    defects: [],
    softMaxChars: 100,
    hardMaxChars: 50,
  });
  assertEquals(trop.tooLarge, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LE PÉRIMÈTRE — UNE EXCLUSION NE DÉTRUIT PAS LES HUIT AUTRES PLATS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("③ une exclusion sur UN plat désigne UNE unité, pas les neuf", () => {
  // ⛔ LE DÉFAUT MESURÉ (revue § 7): « le verrou médical rend les six plats
  // indisponibles pour une injection sur UN plat : ce n'est pas une réparation
  // locale conservant les cinq plats sains. »
  const { scope } = message([
    defaut({
      kind: "safety",
      cause: "member_exclusion_served",
      day: "sat",
      slot: "lunch",
      memberId: "zoe",
      detail: "peanut is served to somebody who must not eat it",
    }),
  ]);
  assertEquals(scope.unitIds, [u("sat", "lunch")]);
  assertEquals(scope.frozenUnitIds.length, 8, "les huit autres restent gelées");
  // ⚠️ `sat/lunch` NE TIRE AUCUNE CASSEROLE: rien d'autre n'entre au périmètre.
  assertEquals(scope.preparationIds, []);
  assertEquals(scope.dependentUnitIds, []);
});

Deno.test("③ bis — un défaut SANS adresse n'élargit PAS le périmètre, il se compte", () => {
  // ⛔ LA FAÇON HABITUELLE DONT CES PORTES MEURENT: un défaut global qui, faute
  // d'adresse, se voit accorder « tout le plan ».
  const { scope } = message([
    defaut({
      kind: "sizing",
      detail: "2 preparation(s) do not hold what the plates draw from them",
    }),
  ]);
  assertEquals(scope.unitIds, []);
  assertEquals(scope.counts.unresolved, 1);
  assertEquals(scope.unresolved[0].why, "no_address");
  assertEquals(scope.frozenUnitIds.length, 9);
});

Deno.test("③ ter — une adresse qui ne désigne aucune unité est `no_unit`, pas le plan entier", () => {
  const { scope } = message([
    defaut({ kind: "sizing", day: "fri", slot: "dinner", memberId: "zoe" }),
  ]);
  assertEquals(scope.unitIds, []);
  assertEquals(scope.unresolved[0].why, "no_unit");
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LE DÉFICIT D'UNE JOURNÉE — LE DÉFAUT ① DE LA REVUE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("④ un plancher protéique de JOURNÉE ouvre les repas de cette journée", () => {
  // ⛔ REPRODUIT AVEC LA FONCTION DE PRODUCTION LE 2026-09-12: `protein_floor_short`
  // porte une DATE et aucun créneau ⇒ `cells: []`, toutes les cases gelées,
  // `defectsWithoutCell: 1`. Un appel modèle partait avec rien à réparer.
  const { scope, composed } = message([
    defaut({
      kind: "protein",
      cause: "protein_floor_short",
      day: "2026-09-14",
      date: "2026-09-14",
      slot: null,
      memberId: "zoe",
      detail: "the plates served on 2026-09-14 carry 74 g of protein, floor is 96 g",
      magnitude: 22,
      measure: { of: "protein", servedG: 74, floorG: 96 },
    }),
  ]);
  // ⛔ LES TROIS REPAS DU LUNDI, ET EUX SEULS.
  assertEquals(scope.unitIds.length, 3);
  assertEquals(
    new Set(scope.unitIds),
    new Set([u("mon", "breakfast"), u("mon", "lunch"), u("mon", "dinner")]),
  );
  assertEquals(scope.counts.unresolved, 0);
  assertEquals(scope.frozenUnitIds.length, 6, "samedi et dimanche ne bougent pas");
  assert(composed !== null);
  assert(!composed.tooLarge);
});

Deno.test("④ bis — un déficit journalier N'OUVRE PAS la journée d'une AUTRE bouche", () => {
  // ⛔ LA CONTRE-ÉPREUVE. « Un défaut journalier ouvre toutes les unités
  // couvertes nécessaires, mais ne donne aucun droit sur les autres
  // jours/personnes. »
  const { scope } = message([
    defaut({
      kind: "protein",
      cause: "protein_floor_short",
      day: "2026-09-14",
      date: "2026-09-14",
      memberId: "paul",
    }),
  ]);
  assertEquals(scope.unitIds, [], "Paul ne mange dans aucune de ces unités");
  assertEquals(scope.unresolved[0].why, "no_unit");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ DEUX PLATS DÉDIÉS AU MÊME CRÉNEAU — LE DÉFAUT ② DE LA REVUE
// ═══════════════════════════════════════════════════════════════════════════

const DUO_DISHES: readonly Plat[] = [
  plat("sun", "dinner", "Poisson de Zoé", ["prep_fish"], [["cabillaud", "150 g"]], {
    memberId: "zoe",
    eaters: ["zoe"],
  }),
  plat("sun", "dinner", "Poulet de Paul", ["prep_fish"], [["poulet", "180 g"]], {
    memberId: "paul",
    eaters: ["paul"],
  }),
];
const DUO: RepairPlanShape = {
  dishes: DUO_DISHES,
  cooking_sessions: [],
  preparations: [{
    id: "prep_fish",
    title: "Légumes rôtis",
    servingsMade: 2,
    ingredients: [{ term: "courgette", quantity: "300 g", ref: "zucchini" }],
  }],
};
const DUO_INDEX = buildRepairUnits({
  dishes: DUO_DISHES,
  expected: [
    { memberId: "zoe", dayToken: "sun", slot: "dinner", date: "2026-09-13" },
    { memberId: "paul", dayToken: "sun", slot: "dinner", date: "2026-09-13" },
  ],
});

Deno.test("⑤ réparer le plat dédié de l'un ne met PAS l'autre dans le périmètre", () => {
  const zoe = DUO_INDEX.units.find((x) => x.ownerId === "zoe")!;
  const paul = DUO_INDEX.units.find((x) => x.ownerId === "paul")!;
  const scope = repairScopeOf({
    plan: DUO,
    index: DUO_INDEX,
    sessions: AUCUNE_SESSION,
    defects: [
      defaut({
        kind: "sizing",
        cause: "cell_energy_off",
        day: "sun",
        slot: "dinner",
        memberId: "zoe",
      }),
    ],
  });
  assertEquals(scope.unitIds, [zoe.unitId]);
  assert(!scope.unitIds.includes(paul.unitId), "le plat de Paul reste gelé");
  // ⛔ ET LA CASSEROLE PARTAGÉE AMÈNE PAUL EN DÉPENDANCE, PAS EN MODIFIABLE.
  assertEquals(scope.preparationIds, ["prep_fish"]);
  assertEquals(scope.dependentUnitIds, [paul.unitId]);
  assertEquals(scope.sharedPreparations.length, 1);
  assertEquals(unitAddress(zoe), "sun/dinner (zoe)");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LA PORTION ATTENDUE ET ABSENTE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑥ une bouche non nourrie ouvre son unité RÉSERVÉE, sans créneau nouveau", () => {
  const plan = {
    dishes: DUO_DISHES.slice(0, 1),
    preparations: DUO.preparations,
    cooking_sessions: [],
  };
  const index = buildRepairUnits({
    dishes: DUO_DISHES.slice(0, 1),
    expected: [
      { memberId: "zoe", dayToken: "sun", slot: "dinner", date: "2026-09-13" },
      { memberId: "paul", dayToken: "sun", slot: "dinner", date: "2026-09-13" },
    ],
  });
  const scope = repairScopeOf({
    plan,
    index,
    sessions: AUCUNE_SESSION,
    defects: [
      defaut({
        kind: "missing_meal",
        cause: "mouth_unfed",
        day: "sun",
        slot: "dinner",
        memberId: "paul",
        detail: "paul is served nothing at dinner",
      }),
    ],
  });
  assertEquals(scope.createUnitIds.length, 1);
  assertEquals(scope.unitIds, scope.createUnitIds);
  assertEquals(index.byId.get(scope.createUnitIds[0])?.ownerId, "paul");
  // ⛔ ET AUCUN CRÉNEAU NOUVEAU: l'unité réservée vit dans la grille attendue.
  assertEquals(index.units.length, 2);
  const composed = planRepairMessage({
    catalogLines: [],
    defects: [defaut({
      kind: "missing_meal",
      cause: "mouth_unfed",
      day: "sun",
      slot: "dinner",
      memberId: "paul",
    })],
    days: [],
    plan,
    index,
    sessions: AUCUNE_SESSION,
    scope,
    nutrition: null,
    baseVersion: "req#r0",
    afterVerdict: null,
  });
  assert(composed !== null);
  assert(composed.projection.text.includes("Do not declare a new preparation"));
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ LA PRÉPARATION PARTAGÉE — TOUTES LES BOUCHES DÉPENDANTES ENTRENT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑦ une casserole partagée amène ses unités dépendantes, et le DIT", () => {
  // `prep_turkey` et `prep_couscous` nourrissent sun/dinner, mon/lunch et
  // mon/dinner. Réparer mon/lunch touche donc deux assiettes qui vont bien.
  const { scope, composed } = message([
    defaut({
      kind: "sizing",
      cause: "cell_bounds_off",
      day: "mon",
      slot: "lunch",
      memberId: "zoe",
      detail: "its calories are already right; the plate weighs 700 g cooked",
    }),
  ]);
  assertEquals(scope.unitIds, [u("mon", "lunch")]);
  assertEquals(scope.preparationIds, ["prep_couscous", "prep_turkey"]);
  // ⛔ LES DEUX AUTRES UNITÉS SONT DÉPENDANTES, PAS MODIFIABLES.
  assertEquals(
    new Set(scope.dependentUnitIds),
    new Set([u("sun", "dinner"), u("mon", "dinner")]),
  );
  assertEquals(scope.sharedPreparations.length, 2);
  assert(composed !== null);
  // ⛔ LA PHRASE D'ISOLEMENT: on propose une SECONDE casserole plutôt que de
  // casser deux assiettes saines — et depuis la fermeture du lot 1, la
  // proposition est TENUE par `applyRepairPatch`.
  assert(composed.text.includes("SHARED:"), composed.text);
  assert(composed.text.includes("declare a NEW preparation"), composed.text);
  // ⛔ ⟳ 2026-09-13 · §2.1 — ET ON DIT QU'IL N'Y A NULLE PART OÙ LA CUIRE.
  // Ce plan-ci ne porte AUCUNE session : proposer une casserole neuve sans le
  // dire ferait dépenser un appel pour une candidate que `final_plan_gate`
  // refuse d'avance (`preparation_without_session`, que rien ne répare).
  assert(
    composed.text.includes("This plan has no cooking session"),
    composed.text,
  );
});

Deno.test("⑦ ter — ⟳ §2.1 : la consigne NOMME les jours où une casserole neuve peut cuire", () => {
  // ⛔ LE DÉFAUT FERMÉ : le schéma de patch exige « a "cook_on" that an
  // existing cooking session covers » et RIEN dans le message ne disait quels
  // jours ces sessions couvrent — la liste des déroulés n'est projetée que
  // lorsqu'un déroulé est lui-même en défaut. Le modèle devait deviner, et une
  // casserole posée le mauvais jour fait tomber la candidate entière.
  const planAvecSessions: RepairPlanShape = {
    ...TIR1,
    cooking_sessions: [
      { day: "sun", preparationIds: ["prep_turkey"], runThrough: "La dinde au four." },
      { day: "wed", preparationIds: ["prep_couscous"], runThrough: "Le couscous." },
    ],
  };
  const sessions = buildRepairSessions({
    sessions: planAvecSessions.cooking_sessions,
  });
  const defects = [
    defaut({
      kind: "sizing",
      cause: "cell_bounds_off",
      day: "mon",
      slot: "lunch",
      memberId: "zoe",
      detail: "its calories are already right; the plate weighs 700 g cooked",
    }),
  ];
  const scope = repairScopeOf({
    plan: planAvecSessions,
    index: INDEX,
    sessions,
    defects,
  });
  const composed = planRepairMessage({
    catalogLines: [],
    defects,
    days: [],
    plan: planAvecSessions,
    index: INDEX,
    sessions,
    scope,
    nutrition: null,
    baseVersion: "req#r0",
    afterVerdict: null,
  });
  assert(composed !== null);
  assert(
    composed.text.includes(`must be one of sun, wed`),
    composed.text,
  );
});

Deno.test("⑦ bis — une préparation NOMMÉE par un défaut entre seule au périmètre", () => {
  const { scope } = message([
    defaut({
      kind: "sizing",
      cause: "cell_energy_unmeasurable",
      preparationId: "prep_salmon",
      repairable: true,
      detail: "this preparation carries a weight with no id",
    }),
  ]);
  assertEquals(scope.preparationIds, ["prep_salmon"]);
  // ⚠️ SES CONSOMMATEURS ENTRENT EN VALIDATION, PAS EN MODIFICATION: changer le
  // lot change leur assiette, mais leur recette n'est pas en cause.
  assertEquals(scope.unitIds, []);
  assertEquals(
    new Set(scope.dependentUnitIds),
    new Set([u("sat", "dinner"), u("sun", "lunch")]),
  );
});

Deno.test("⑦ ter — une VIOLATION dans une préparation contamine ses portions", () => {
  // ⛔ LA DIFFÉRENCE AVEC LE CAS PRÉCÉDENT, ET ELLE EST DE SÉCURITÉ. Un lot qui
  // porte un allergène rend dangereuses les assiettes qui y puisent: les geler
  // ferait servir l'allergène dans une assiette qu'on n'a pas le droit de
  // toucher.
  const { scope } = message([
    defaut({
      kind: "safety",
      cause: "member_exclusion_served",
      preparationId: "prep_salmon",
      memberId: "zoe",
      detail: "salmon is served to somebody who must not eat it",
    }),
  ]);
  assert(scope.preparationIds.includes("prep_salmon"));
  assertEquals(
    new Set(scope.unitIds),
    new Set([u("sat", "dinner"), u("sun", "lunch")]),
  );
  // ⚠️ ET LES CASSEROLES DE CES UNITÉS SUIVENT: `prep_potatoes` est dans les
  // deux mêmes assiettes, et la recomposer peut être la seule sortie une fois
  // le saumon retiré.
  assertEquals(scope.preparationIds, ["prep_potatoes", "prep_salmon"]);
  // ⛔ MAIS PAS UNE DE PLUS: la frittata et la dinde ne sont pas en cause.
  assertEquals(scope.frozenUnitIds.length, 7);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ L'ENTRÉE DE DERNIER RECOURS — LE COMPLÉMENT A SON PROPRE PÉRIMÈTRE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑧ un complément réclamé ouvre SON unité, pas la portion manquante", () => {
  // ⛔ LES DEUX FAMILLES NE SE MÉLANGENT PAS. Une bouche non nourrie et une
  // bouche BLOQUÉE peuvent porter la même adresse (même créneau, même
  // personne) : les confondre ferait réparer « personne n'a rien à ce repas »
  // par un plat de plus, et inversement.
  const index = buildRepairUnits({
    dishes: DUO_DISHES.slice(0, 1),
    expected: [
      { memberId: "zoe", dayToken: "sun", slot: "dinner", date: "2026-09-13" },
      { memberId: "paul", dayToken: "sun", slot: "dinner", date: "2026-09-13" },
    ],
    complements: [
      { memberId: "zoe", dayToken: "sun", slot: "dinner", date: "2026-09-13" },
    ],
  });
  const plan = {
    dishes: DUO_DISHES.slice(0, 1),
    preparations: DUO.preparations,
    cooking_sessions: [],
  };
  const scopeComplement = repairScopeOf({
    plan,
    index,
    sessions: AUCUNE_SESSION,
    defects: [
      defaut({
        kind: "sizing",
        cause: "dedicated_complement_needed",
        day: "sun",
        slot: "dinner",
        memberId: "zoe",
        detail: "this plate cannot be reworked for zoe",
      }),
    ],
  });
  assertEquals(scopeComplement.createUnitIds.length, 1);
  assertEquals(
    index.byId.get(scopeComplement.createUnitIds[0])?.isComplement,
    true,
  );
  // ⛔ ET LA PORTION MANQUANTE DE PAUL OUVRE L'AUTRE, pas celle-ci.
  const scopeManquante = repairScopeOf({
    plan,
    index,
    sessions: AUCUNE_SESSION,
    defects: [
      defaut({
        kind: "missing_meal",
        cause: "mouth_unfed",
        day: "sun",
        slot: "dinner",
        memberId: "paul",
        detail: "paul is served nothing at dinner",
      }),
    ],
  });
  assertEquals(scopeManquante.createUnitIds.length, 1);
  assertEquals(
    index.byId.get(scopeManquante.createUnitIds[0])?.isComplement,
    false,
  );
  assertEquals(
    index.byId.get(scopeManquante.createUnitIds[0])?.ownerId,
    "paul",
  );
});

Deno.test("⑧ bis — la consigne dit qu'un complément S'AJOUTE, il ne remplace pas", () => {
  const index = buildRepairUnits({
    dishes: DUO_DISHES,
    expected: [
      { memberId: "zoe", dayToken: "sun", slot: "dinner", date: "2026-09-13" },
      { memberId: "paul", dayToken: "sun", slot: "dinner", date: "2026-09-13" },
    ],
    complements: [
      { memberId: "zoe", dayToken: "sun", slot: "dinner", date: "2026-09-13" },
    ],
  });
  const scope = repairScopeOf({
    plan: DUO,
    index,
    sessions: AUCUNE_SESSION,
    defects: [
      defaut({
        kind: "sizing",
        cause: "dedicated_complement_needed",
        day: "sun",
        slot: "dinner",
        memberId: "zoe",
      }),
    ],
  });
  const projection = planProjection({
    plan: DUO,
    index,
    sessions: AUCUNE_SESSION,
    scope,
    nutrition: null,
    defects: [],
  });
  // ⛔ « NE CHANGE PAS LE PLAT PARTAGÉ » EST ÉCRIT. Sans cette phrase, le modèle
  // refait le plat commun — qui est déjà juste pour les autres, et qui ne peut
  // PAS être retravaillé pour celui-là : c'est la raison même du complément.
  assert(projection.text.includes("THESE PEOPLE ARE STUCK"), projection.text);
  assert(projection.text.includes("Do NOT change the shared dish"), projection.text);
  assert(projection.text.includes("on top of what is already served"), projection.text);
  assertEquals(projection.counters.units_to_create, 0, "un complément n'est pas un repas manquant");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ L'ÉCART D'UNE JOURNÉE, SANS GROS ÉCART D'UN SEUL REPAS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑨ un `day_energy_off` route comme un défaut de JOURNÉE, pas de case", () => {
  // ⛔ LE CAS QUE LA TABLE DU CHANTIER EXIGE: « écart énergétique journalier
  // sans gros écart d'un repas ⇒ même routage journalier ». `day_energy_off`
  // porte une DATE et aucun créneau — exactement la forme qui rendait
  // `cells: []` avant la fermeture du lot 1.
  const { scope, composed } = message([
    defaut({
      kind: "sizing",
      cause: "day_energy_off",
      day: "2026-09-13",
      date: "2026-09-13",
      slot: null,
      memberId: "zoe",
      detail: "2 455 kcal served on 2026-09-13 for 2 916 covered",
      magnitude: 461,
      measure: {
        of: "energy",
        servedKcal: 2455,
        targetKcal: 2916,
        deltaPct: -16,
        tolerancePct: 5,
      },
    }),
  ]);
  // ⛔ LES TROIS REPAS DU DIMANCHE, ET EUX SEULS.
  assertEquals(
    new Set(scope.unitIds),
    new Set([u("sun", "breakfast"), u("sun", "lunch"), u("sun", "dinner")]),
  );
  assertEquals(scope.counts.unresolved, 0);
  assertEquals(scope.frozenUnitIds.length, 6, "samedi et lundi ne bougent pas");
  assert(composed !== null);
  // ⛔ ET LA CONSIGNE NE DEMANDE PAS DE CHANGER LA CIBLE. Elle dit l'écart et
  // les bornes; un modèle à qui on laisse déplacer la cible ferme tous les
  // défauts d'un coup, et le plan ne nourrit plus personne.
  assert(!composed.text.includes("change the target"), composed.text);
  assert(composed.text.includes("2 916") || composed.text.includes("2916"), composed.text);
});

Deno.test("⑨ bis — le MÊME défaut sur une bouche absente n'ouvre rien", () => {
  const { scope } = message([
    defaut({
      kind: "sizing",
      cause: "day_energy_off",
      day: "2026-09-13",
      date: "2026-09-13",
      memberId: "paul",
    }),
  ]);
  assertEquals(scope.unitIds, []);
  assertEquals(scope.unresolved[0].why, "no_unit");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑩ ⟳ 2026-09-13 · LOT 2 — LE DÉROULÉ D'UNE SESSION SE PROJETTE, ET S'ADRESSE
// ═══════════════════════════════════════════════════════════════════════════

const SESSIONS_TIR1 = buildRepairSessions({
  sessions: [
    {
      day: "sat",
      preparationIds: ["prep_frittata", "prep_salmon"],
      runThrough: "Frittata au four, saumon à côté, puis en boîtes.",
    },
    {
      day: "sun",
      preparationIds: ["prep_couscous", "prep_turkey"],
      runThrough: "Couscous gonflé pendant que la dinde rôtit.",
    },
  ],
});

Deno.test("⑩ une session en défaut est projetée avec son texte d'aujourd'hui", () => {
  // ⛔ SANS LE TEXTE, LA CONSIGNE EST INAPPLICABLE. On demande au modèle de
  // RÉÉCRIRE une phrase : ne pas la lui montrer lui ferait en inventer une
  // autre, qui ne décrirait plus les recettes conservées.
  const scope = repairScopeOf({
    plan: TIR1,
    index: INDEX,
    sessions: SESSIONS_TIR1,
    defects: [
      defaut({
        kind: "safety",
        cause: "member_exclusion_served",
        sessionIndex: 1,
        detail: "the run-through names a food somebody must not eat",
      }),
    ],
  });
  assertEquals(scope.sessionIds, ["S2"]);
  const projection = planProjection({
    plan: TIR1,
    index: INDEX,
    sessions: SESSIONS_TIR1,
    scope,
    nutrition: null,
    defects: [],
  });
  assert(projection.text.includes("THE COOKING RUN-THROUGH TO REWRITE"));
  assert(projection.text.includes("S2 (sun)"), projection.text);
  assert(
    projection.text.includes("Couscous gonflé pendant que la dinde rôtit."),
    projection.text,
  );
  // ⛔ ET CELLE QUI N'EST PAS EN DÉFAUT N'EST PAS PROJETÉE: elle n'est pas à
  // réécrire, et la montrer inviterait à la toucher.
  assert(!projection.text.includes("Frittata au four, saumon à côté"));
  assertEquals(projection.counters.sessions_projected, 1);
});

Deno.test("⑩ bis — un index de session INCONNU se compte, il n'élargit rien", () => {
  const scope = repairScopeOf({
    plan: TIR1,
    index: INDEX,
    sessions: SESSIONS_TIR1,
    defects: [
      defaut({ kind: "safety", cause: "member_exclusion_served", sessionIndex: 7 }),
    ],
  });
  assertEquals(scope.sessionIds, []);
  assertEquals(scope.unitIds, []);
  assertEquals(scope.unresolved.length, 1);
  assertEquals(scope.unresolved[0].why, "no_session");
});

Deno.test("⑩ ter — LE CAS QUI PASSE: un plan sans session ne projette rien", () => {
  // ⛔ UNE GARDE ÉPROUVÉE SEULEMENT SUR CE QU'ELLE OUVRE EST INDISCERNABLE
  // D'UNE GARDE QUI OUVRE TOUT.
  const scope = repairScopeOf({
    plan: TIR1,
    index: INDEX,
    sessions: AUCUNE_SESSION,
    defects: [DEFAUT_TIR1],
  });
  assertEquals(scope.sessionIds, []);
  const projection = planProjection({
    plan: TIR1,
    index: INDEX,
    sessions: AUCUNE_SESSION,
    scope,
    nutrition: null,
    defects: [],
  });
  assert(!projection.text.includes("THE COOKING RUN-THROUGH TO REWRITE"));
  assertEquals(projection.counters.sessions_projected, 0);
});
