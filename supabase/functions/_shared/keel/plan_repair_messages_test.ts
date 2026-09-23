/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 2 §2.5 — LES DEUX MESSAGES D'UNE RÉPARATION, À 1, 2 ET 4 BOUCHES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUE CE FICHIER ÉPROUVE, ET QUE LES AUTRES N'ÉPROUVENT PAS. Le prompt
 * système est testé seul (`plan_repair_prompt_test.ts`), le message utilisateur
 * est testé seul (`plan_repair_context_test.ts`), et le site d'appel est épinglé
 * en source (`plan_repair_prompt_wiring_test.ts`). Aucun des trois ne dit ce que
 * le modèle reçoit RÉELLEMENT : les deux messages, côte à côte.
 *
 * ⛔ ET C'EST LÀ QUE VIVAIT LE DÉFAUT (revue du 2026-09-12, P1 §3) : chacun des
 * deux était cohérent avec lui-même, et ils se contredisaient.
 *
 * ⚠️ CE FICHIER NE LIT AUCUN FICHIER SOURCE. Il compose, il concatène, il
 * compte — « tester les messages capturés au transport et le comportement des
 * fonctions, pas seulement la présence de noms de fonctions ».
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

import { planRepairMessage } from "./plan_defect_pass.ts";
import { repairSystemPrompt } from "./plan_repair_prompt.ts";
import { repairScopeOf } from "./plan_repair_context.ts";
import type { RepairPlanShape } from "./plan_repair_context.ts";
import { buildRepairSessions, buildRepairUnits } from "./plan_repair_unit.ts";
import type { RepairExpectedCell, RepairUnitDish } from "./plan_repair_unit.ts";
import type { RepairDefect } from "./plan_repair_loop.ts";
import type { RepairHouseholdContext } from "./side_courses_types.ts";

/**
 * ⟳ 2026-09-23 — LE FOYER TEL QUE LE PREMIER JET L'A REÇU (audit, lot 4 d).
 * Des textes écrits EN DUR : ce fichier éprouve ce que la réparation porte, pas
 * ce que le générateur rédige.
 */
const RECETTE =
  "THE TEMPLATE: one serving is the ordinary plate of the person in the MIDDLE\n" +
  "of the table, never the biggest eater's; the app scales it for everyone.";
const FOYER: RepairHouseholdContext = {
  cards: "== WHO EATS ==\n  · Christèle — fat loss, 3 meals a day.",
  notes: "  · Christèle: no tofu, no fish at breakfast; no eggs.",
  standardRecipe: RECETTE,
  sideCourses: "Side courses: Thomas cheese + dessert; Christèle dessert.",
};
const SANS_FOYER: RepairHouseholdContext = {
  cards: "",
  notes: "",
  standardRecipe: "",
  sideCourses: "",
};

/**
 * ⚠️ LE TYPE EST ÉCRIT, PAS INTERSECTÉ. `RepairPlanShape["dishes"][number] &
 * RepairUnitDish` demande à `uses` d'être À LA FOIS les deux formes du tableau,
 * et TypeScript refuse un littéral qui satisfait les deux séparément. On
 * déclare donc la forme commune une fois, et chaque appelant reçoit la sienne.
 */
type Plat = {
  readonly day: string;
  readonly slot: string;
  readonly title: string;
  readonly memberId: string | null;
  readonly ingredients: readonly {
    readonly term: string;
    readonly ref: string;
    readonly amount: number;
    readonly unit: string;
    readonly state: string;
  }[];
  readonly uses: readonly {
    readonly preparationId: string;
    readonly servings: number;
  }[];
  readonly boxes: readonly {
    readonly id: string;
    readonly memberIds: readonly string[];
  }[];
};

/** Une table de N bouches : un plat de maison par créneau, une casserole commune. */
function foyer(bouches: readonly string[]) {
  const jours = ["sat", "sun"];
  const moments = ["breakfast", "lunch", "dinner"];
  const dishes: Plat[] = [];
  for (const day of jours) {
    for (const slot of moments) {
      const plat: Plat = {
        day,
        slot,
        title: `Assiette ${day}/${slot}`,
        memberId: null,
        ingredients: [
          { term: "riz complet", ref: "brown_rice", amount: 80, unit: "g", state: "raw" },
        ],
        uses: [{ preparationId: "prep_commun", servings: bouches.length }],
        boxes: [{ id: `box_${day}_${slot}`, memberIds: [...bouches] }],
      };
      dishes.push(plat);
    }
  }
  const plan: RepairPlanShape = {
    dishes: dishes as RepairPlanShape["dishes"],
    preparations: [{
      id: "prep_commun",
      title: "Poulet rôti",
      servingsMade: bouches.length * 2,
      ingredients: [
        { term: "cuisses de poulet", ref: "chicken_thigh", amount: 900, unit: "g", state: "raw" },
      ],
    }],
    cooking_sessions: [{
      day: "sat",
      preparationIds: ["prep_commun"],
      runThrough: "Four à 200, le poulet 40 minutes, puis en boîtes.",
    }],
  };
  const expected: RepairExpectedCell[] = [];
  for (const memberId of bouches) {
    for (const day of jours) {
      for (const slot of moments) {
        expected.push({ memberId, date: `2026-09-${day === "sat" ? "12" : "13"}`, dayToken: day, slot });
      }
    }
  }
  const index = buildRepairUnits({
    dishes: dishes as unknown as readonly RepairUnitDish[],
    expected,
  });
  const sessions = buildRepairSessions({ sessions: plan.cooking_sessions });
  return { plan, index, sessions, bouches };
}

function defaut(o: Partial<RepairDefect> & { kind: RepairDefect["kind"] }): RepairDefect {
  return {
    cause: null,
    date: null,
    preparationId: null,
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

/** Les DEUX messages, comme le handler les compose. */
function messages(n: number) {
  const bouches = ["m_a", "m_b", "m_c", "m_d"].slice(0, n);
  const { plan, index, sessions } = foyer(bouches);
  const scope = repairScopeOf({
    plan,
    index,
    sessions,
    defects: [
      defaut({
        kind: "sizing",
        cause: "cell_bounds_off",
        day: "sat",
        slot: "dinner",
        memberId: bouches[0],
        detail: "the dinner plate weighs 780 g cooked, and it must be 250 to 700 g.",
        measure: { of: "mass", grams: 780, minG: 250, maxG: 700 },
        magnitude: 80,
      }),
      defaut({
        kind: "safety",
        cause: "member_exclusion_served",
        sessionIndex: 0,
        detail: "⛔ This plan names a food that somebody at this table must not eat.",
      }),
    ],
  });
  const user = planRepairMessage({
    catalogLines: [],
    defects: [
      defaut({
        kind: "sizing",
        cause: "cell_bounds_off",
        day: "sat",
        slot: "dinner",
        memberId: bouches[0],
        detail: "the dinner plate weighs 780 g cooked, and it must be 250 to 700 g.",
        measure: { of: "mass", grams: 780, minG: 250, maxG: 700 },
        magnitude: 80,
      }),
      defaut({
        kind: "safety",
        cause: "member_exclusion_served",
        sessionIndex: 0,
        detail: "⛔ This plan names a food that somebody at this table must not eat.",
      }),
    ],
    days: [],
    plan,
    index,
    sessions,
    scope,
    nutrition: null,
    baseVersion: "req#r0",
    afterVerdict: null,
    household: FOYER,
  });
  assert(user !== null, `aucun message composé à ${n} bouche(s)`);
  const system = repairSystemPrompt({
    safetyBlock: `- ${bouches[0]}: peanut — allergy, severity=medical`,
    houseRuleBlock: null,
  });
  return { system: system.text, user: user.text, scope, index, sessions };
}

for (const n of [1, 2, 4]) {
  Deno.test(`N=${n} — les deux messages ne portent QU'UN schéma de sortie`, () => {
    const { system, user } = messages(n);
    const ensemble = `${system}\n${user}`;
    // ⛔ UN SEUL SCHÉMA, ET C'EST LE PATCH. Le compte porte sur les DEUX
    // messages : c'est leur somme que le modèle lit.
    assertEquals(ensemble.split('{"repair":{').length - 1, 1);
    // ⛔ ET AUCUN SCHÉMA DE PLAN COMPLET NULLE PART.
    for (const interdit of [
      "== OUTPUT JSON SCHEMA ==",
      '"cooking_sessions": [',
      '"shopping_list": [',
      "Return the full plan JSON",
    ]) {
      assert(!ensemble.includes(interdit), `schéma de plan présent : ${interdit}`);
    }
  });

  Deno.test(`N=${n} — aucun ordre de couvrir toute la période`, () => {
    const { system, user } = messages(n);
    const ensemble = `${system}\n${user}`;
    for (const interdit of [
      "COVER THE WHOLE STRETCH",
      "cover EVERY day of the stretch",
      "THE STRETCH STARTS TODAY",
    ]) {
      assert(!ensemble.includes(interdit), `ordre contradictoire : ${interdit}`);
    }
    // ⚠️ ET LA CONSIGNE INVERSE EST ÉCRITE, pas seulement l'absence de l'autre.
    assert(system.includes("YOU DO NOT COVER THE WEEK"));
  });

  Deno.test(`N=${n} — les identités du périmètre voyagent, et elles seules`, () => {
    const { user, scope, index } = messages(n);
    // ⛔ CHAQUE UNITÉ AUTORISÉE EST NOMMÉE DANS LE MESSAGE.
    assert(scope.unitIds.length > 0, "le périmètre est vide");
    for (const id of scope.unitIds) {
      assert(user.includes(id), `${id} est autorisé et n'est pas nommé`);
    }
    // ⛔ ET LA SESSION EN DÉFAUT AUSSI, avec son texte d'aujourd'hui.
    assertEquals(scope.sessionIds, ["S1"]);
    assert(user.includes("THE COOKING RUN-THROUGH TO REWRITE"));
    assert(user.includes("Four à 200, le poulet 40 minutes"));
    // ⛔ AUCUNE UNITÉ GELÉE N'EST DÉCLARÉE MODIFIABLE. Le bloc d'autorisation
    // ne cite que le périmètre ; les autres n'apparaissent que dans la partie
    // « untouched », qui dit de ne pas y toucher.
    const bloc = user.slice(user.indexOf("WHAT THIS ANSWER MAY TOUCH"));
    const gelees = index.units
      .map((u) => u.unitId)
      .filter((id) => !scope.unitIds.includes(id));
    for (const id of gelees) {
      assert(!bloc.includes(id), `${id} est gelée et se retrouve autorisée`);
    }
  });

  Deno.test(`N=${n} — les limites dures de chaque personne sont dans le système`, () => {
    const { system } = messages(n);
    assert(system.includes("severity=medical"), "la contrainte médicale a disparu");
    // ⛔ ET LES CONVENTIONS QUI RENDENT UNE RECETTE MESURABLE AUSSI.
    assert(system.includes('"state":  "raw" or "cooked"'));
    assert(system.includes("== NEVER PUT A NUMBER ON NUTRITION =="));
  });
}

Deno.test("⚠️ LE CAS QUI PASSE — sans défaut réparable, aucun message n'est composé", () => {
  // ⛔ UNE GARDE ÉPROUVÉE SEULEMENT SUR CE QU'ELLE PRODUIT EST INDISCERNABLE
  // D'UNE GARDE QUI PRODUIT TOUJOURS.
  const { plan, index, sessions } = foyer(["m_a", "m_b"]);
  const scope = repairScopeOf({ plan, index, sessions, defects: [] });
  assertEquals(scope.unitIds, []);
  assertEquals(scope.sessionIds, []);
  const rien = planRepairMessage({
    catalogLines: [],
    defects: [defaut({ kind: "preference", repairable: false })],
    days: [],
    plan,
    index,
    sessions,
    scope,
    nutrition: null,
    baseVersion: "req#r0",
    afterVerdict: null,
    household: FOYER,
  });
  assertEquals(rien, null);
});

Deno.test("⛔ le périmètre GRANDIT avec la table, et le message avec lui", () => {
  // ⚠️ LE DÉNOMINATEUR. Sans lui, « les trois tailles passent » pourrait vouloir
  // dire que les trois composent le MÊME message — c'est-à-dire que la taille
  // du foyer n'atteint pas la consigne.
  const un = messages(1);
  const quatre = messages(4);
  assertEquals(un.index.counts.expected_cells, 6);
  assertEquals(quatre.index.counts.expected_cells, 24);
  assert(
    quatre.user.length > un.user.length,
    "le message de quatre bouches n'est pas plus riche que celui d'une",
  );
  // ⛔ ET LES QUATRE BOUCHES SONT NOMMÉES DANS LA PROJECTION.
  for (const id of ["m_a", "m_b", "m_c", "m_d"]) {
    assert(quatre.user.includes(id), `${id} n'est pas dans la projection`);
  }
});

Deno.test("⟳ 2026-09-19 — le catalogue d'aliments voyage avec la réparation, après le plan et avant le contrat", () => {
  // Mesuré sur le plan adopté du 2026-09-19 : sans catalogue, la réparation a
  // écrit `hummus` et `smoked_salmon` — inconnus de la table — et deux termes
  // sans ref ; un seul ingrédient non résolu rend le plat non mesurable, donc
  // sans boîte. Le premier jet reçoit ces lignes ; la réparation aussi, désormais.
  const bouches = ["m_a", "m_b"];
  const { plan, index, sessions } = foyer(bouches);
  const defects = [
    defaut({
      kind: "sizing",
      cause: "cell_bounds_off",
      day: "sat",
      slot: "dinner",
      memberId: bouches[0],
      detail: "the dinner plate weighs 780 g cooked, and it must be 250 to 700 g.",
      measure: { of: "mass", grams: 780, minG: 250, maxG: 700 },
      magnitude: 80,
    }),
  ];
  const scope = repairScopeOf({ plan, index, sessions, defects });
  const base = { defects, days: [], plan, index, sessions, scope, nutrition: null, baseVersion: "req#r0", afterVerdict: null, household: SANS_FOYER };
  const avec = planRepairMessage({
    ...base,
    catalogLines: ["== THE FOOD IDS THIS KITCHEN WEIGHS WITH ==", "  apple · 52 · 0.3 · unit=150"],
  });
  assert(avec !== null);
  const planAt = avec.text.indexOf("== THE PLAN AS THE APP READS IT RIGHT NOW ==");
  const cat = avec.text.indexOf("== THE FOOD IDS THIS KITCHEN WEIGHS WITH ==");
  const contrat = avec.text.indexOf("base_version");
  assert(planAt > 0 && cat > planAt, "le catalogue doit suivre le plan");
  assert(contrat > cat, "le catalogue doit précéder le contrat de patch");
  assert(avec.text.includes("apple · 52 · 0.3 · unit=150"));
  // ── LE CAS QUI PASSE : sans catalogue, rien n'est ajouté, pas même un vide ──
  const sans = planRepairMessage({ ...base, catalogLines: [] });
  assert(sans !== null);
  assert(!sans.text.includes("THE FOOD IDS"));
  assertEquals(sans.text.replace(/\n{3,}/g, "\n\n"), sans.text, "aucune ligne vide de trop");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-23 — LA RÉPARATION CONNAÎT LE FOYER (audit des dosages, lot 4 d)
// ═══════════════════════════════════════════════════════════════════════════
//
// Mesuré : sur cc012345 la réparation finale a réécrit 12 boîtes (sardines et
// 3 tranches de pain, tofu au déjeuner, 200 g de yaourt pour tout le monde) ;
// sur e0325544 elle a resservi des œufs à Christèle. Elle ne recevait ni les
// fiches, ni les notes, ni la recette de référence.

/** Le message utilisateur d'une réparation de grammage à deux bouches. */
function reparation(household: RepairHouseholdContext) {
  const bouches = ["m_a", "m_b"];
  const { plan, index, sessions } = foyer(bouches);
  const defects = [
    defaut({
      kind: "sizing",
      cause: "cell_bounds_off",
      day: "sat",
      slot: "dinner",
      memberId: bouches[0],
      detail: "the dinner plate weighs 780 g cooked, and it must be 250 to 550 g.",
      measure: { of: "mass", grams: 780, minG: 250, maxG: 550 },
      magnitude: 80,
    }),
  ];
  const scope = repairScopeOf({ plan, index, sessions, defects });
  const out = planRepairMessage({
    defects,
    days: [],
    plan,
    index,
    sessions,
    scope,
    nutrition: null,
    baseVersion: "req#r0",
    afterVerdict: null,
    catalogLines: [],
    household,
  });
  assert(out !== null);
  return out;
}

Deno.test("⛔ la réparation contient la RECETTE DE RÉFÉRENCE, les fiches, les notes et les à-côtés", () => {
  const out = reparation(FOYER);
  assert(out.text.includes(RECETTE), "la recette de référence n'est pas dans la réparation");
  assert(out.text.includes("Christèle — fat loss, 3 meals a day."), "les fiches manquent");
  assert(out.text.includes("no tofu, no fish at breakfast; no eggs."), "les notes manquent");
  assert(out.text.includes("Side courses: Thomas cheese + dessert; Christèle dessert."), "les à-côtés manquent");
  assertEquals([...out.household.kept], ["cards", "notes", "standardRecipe", "sideCourses"]);
  assertEquals([...out.household.dropped], []);
  assertEquals(out.contextIncomplete, false);
  // ⚠️ ENTRE CE QUI NE VA PAS ET LE PLAN : le modèle lit le défaut, pour qui
  // il le corrige, puis le plan.
  const defaut_ = out.text.indexOf("THESE DISHES DO NOT WORK AS WRITTEN:");
  const foyerAt = out.text.indexOf("== THE HOUSEHOLD THIS PLAN FEEDS");
  const planAt = out.text.indexOf("== THE PLAN AS THE APP READS IT RIGHT NOW ==");
  assert(defaut_ >= 0 && foyerAt > defaut_ && planAt > foyerAt, "le foyer n'est pas entre les défauts et le plan");
  // ⛔ ET L'ÉCHAPPATOIRE EST NOMMÉE.
  assert(out.text.includes("What a note asks to avoid"), out.text);
});

Deno.test("PASSE — un foyer vide n'imprime rien, pas même un titre", () => {
  const out = reparation(SANS_FOYER);
  assert(!out.text.includes("== THE HOUSEHOLD THIS PLAN FEEDS"), "un titre au-dessus de rien");
  assertEquals(out.household.chars, 0);
  assertEquals([...out.household.empty], ["notes", "cards", "standardRecipe", "sideCourses"]);
  assertEquals(out.contextIncomplete, false);
});

Deno.test("⛔ PLAFOND — un bloc qui ne tient pas est laissé dehors EN ENTIER et nommé ; des notes perdues arrêtent l'appel", () => {
  // Des à-côtés démesurés : ils tombent, le reste passe, l'appel peut partir.
  const gros = "x".repeat(8_000);
  const cotes = reparation({ ...FOYER, sideCourses: gros });
  assertEquals([...cotes.household.dropped], ["sideCourses"]);
  assert(!cotes.text.includes("xxxxxxxxxx"), "un bloc coupé au milieu est passé");
  assert(cotes.text.includes(RECETTE));
  assertEquals(cotes.contextIncomplete, false);
  // Des notes démesurées : elles tombent, et on NE PART PAS.
  const notes = reparation({ ...FOYER, notes: gros });
  assertEquals([...notes.household.dropped], ["notes"]);
  assertEquals(notes.contextIncomplete, true);
});

Deno.test("le système de réparation dit que le plat n'est pas tout le repas", () => {
  const { system } = messages(2);
  assert(system.includes("== THE DISH IS NOT THE WHOLE MEAL =="), "la règle des à-côtés manque");
  assert(system.includes("Never add a dessert, a bread, a cheese course or"), system);
  // ⚠️ AVANT LES LIMITES DURES ET AVANT LE SCHÉMA.
  assert(system.indexOf("THE DISH IS NOT THE WHOLE MEAL") < system.indexOf("severity=medical"));
  assert(system.indexOf("THE DISH IS NOT THE WHOLE MEAL") < system.indexOf('{"repair":{'));
});
