/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA CEINTURE SUR LES BOÎTES DU MOTEUR — un cas qui mord, un cas qui passe
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⟳ 2026-09-23 — audit des dosages, lot 4 a. Sur les quatre plans v4 audités,
 * `exclusion_belt.checked` valait 0 et le tofu était servi 13 matins sur 20 à
 * Christèle, qui l'avait refusé au petit-déjeuner. Ces cas épinglent les deux
 * moitiés de la garde : elle MORD sur la boîte que le moteur sert, et elle
 * LAISSE PASSER l'autre mangeur, l'autre moment, l'autre plat. Une garde qui
 * ne mord jamais et une garde qui mord partout se ressemblent quand on n'en
 * teste qu'une.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  ENGINE_BOX_HELD_CAUSES,
  type EngineBeltDish,
  type EngineBeltPreparation,
  judgeDishEaters,
  judgeSideTerm,
} from "./engine_box_belt.ts";
import type { DietaryRegime } from "./dietary_regime.ts";
import { exclusionTermsFor } from "./food_exclusion_belt.ts";
import type { ForbiddenTerm } from "./forbidden_matcher.ts";
import type { RetainedItem } from "./retained_item.ts";
import type { FoodGroupRef } from "./tokens.ts";

const THOMAS = "m_thomas";
const CHRISTELE = "m_christele";
const FABRICE = "m_fabrice";
const ROSTER = [THOMAS, CHRISTELE, FABRICE];

/** Une exclusion enregistrée, avec son moment (`null` = toute la journée). */
function exclusion(text: string, subject: string, occasion: string | null): RetainedItem {
  return {
    kind: "food.exclude", scope: "durable", subject, text, value: null,
    source: "draft_note", at: "2026-09-21", item: "", confidence: null,
    quote: text, occasion,
  } as unknown as RetainedItem;
}

const TOFU_POT: EngineBeltPreparation = {
  id: "P1",
  title: "Tofu mariné au four",
  method: "Couper, mariner, cuire 25 minutes.",
  ingredients: [
    { term: "tofu ferme", group: "tofu_tempeh" },
    { term: "sauce soja", group: "sauce_dressing" },
  ],
};
const CHICKEN_POT: EngineBeltPreparation = {
  id: "P2",
  title: "Poulet rôti",
  method: "Rôtir 40 minutes.",
  ingredients: [{ term: "cuisses de poulet", group: "poultry" }],
};
const RICE_POT: EngineBeltPreparation = {
  id: "P3",
  title: "Riz basmati",
  method: "Cuire à l'eau.",
  ingredients: [{ term: "riz basmati", group: "refined_grain" }],
};

function dish(over: Partial<EngineBeltDish>): EngineBeltDish {
  return { title: "Bol", slot: "breakfast", ingredients: [], uses: [], ...over };
}

/** Les exclusions du matin de Christèle, comme `exclusionTermsFor` les rend. */
const TOFU_MORNING = exclusionTermsFor({
  items: [exclusion("tofu", CHRISTELE, "breakfast")],
  subject: CHRISTELE,
});

function judge(args: {
  dishes: readonly EngineBeltDish[];
  fed: readonly (readonly string[] | null)[];
  exclusions?: Readonly<Record<string, readonly ForbiddenTerm[]>>;
  regimes?: Readonly<Record<string, DietaryRegime>>;
  household?: readonly ForbiddenTerm[];
}) {
  return judgeDishEaters({
    dishes: args.dishes,
    preparations: [TOFU_POT, CHICKEN_POT, RICE_POT],
    fedByDish: args.fed.map((f) => (f === null ? null : new Set(f))),
    memberIds: ROSTER,
    exclusionsOf: (m) => args.exclusions?.[m] ?? [],
    regimeOf: (m) => args.regimes?.[m] ?? null,
    householdTerms: args.household ?? [],
  });
}

Deno.test("⛔ MORD — tofu refusé le matin, la boîte du moteur cite le pot de tofu : Christèle est retenue, Thomas mange", () => {
  const out = judge({
    // ⚠️ LE TOFU N'EST PAS DANS LE PLAT, IL EST DANS LA CASSEROLE CITÉE. C'est la
    // forme exacte des petits-déjeuners mesurés : « une portion du tofu de
    // mercredi », le bloc de tofu vit dans la préparation.
    dishes: [dish({ title: "Bol tofu et flocons", ingredients: [{ term: "flocons d'avoine", group: "whole_grain" }], uses: [{ preparationId: "P1" }] })],
    fed: [[THOMAS, CHRISTELE]],
    exclusions: { [CHRISTELE]: TOFU_MORNING },
  });
  assertEquals(out.heldOffByDish, [[CHRISTELE]]);
  assertEquals(out.held.length, 1);
  assertEquals(out.held[0].memberId, CHRISTELE);
  assertEquals(out.held[0].cause, "exclusion");
  assertEquals(out.held[0].preparationId, "P1");
  assertEquals(out.held[0].because, "tofu");
  // ⛔ LES COMPTEURS PAR PERSONNE, ZÉROS ÉCRITS.
  assertEquals(out.byMember[CHRISTELE], {
    eaten: 1,
    exclusion: { checked: 1, refused: 1 },
    regime: { checked: 0, refused: 0 },
  });
  assertEquals(out.byMember[THOMAS], {
    eaten: 1,
    exclusion: { checked: 0, refused: 0 },
    regime: { checked: 0, refused: 0 },
  });
  // Fabrice n'est nourri par aucun plat : sa ligne existe quand même.
  assertEquals(out.byMember[FABRICE], {
    eaten: 0,
    exclusion: { checked: 0, refused: 0 },
    regime: { checked: 0, refused: 0 },
  });
  assertEquals(out.counters.held_off, 1);
  assertEquals(out.counters.exclusion_checked, 1);
  assertEquals(out.counters.exclusion_refused, 1);
  assertEquals(out.counters.pairs, 2);
  assertEquals(out.counters.emptied, 0);
  assertEquals(out.issues.length, 1);
});

Deno.test("PASSE — le même pot de tofu au dîner : la règle du matin ne juge pas le soir", () => {
  const out = judge({
    dishes: [dish({ title: "Tofu, riz, brocoli", slot: "dinner", uses: [{ preparationId: "P1" }, { preparationId: "P3" }] })],
    fed: [[THOMAS, CHRISTELE]],
    exclusions: { [CHRISTELE]: TOFU_MORNING },
  });
  assertEquals(out.heldOffByDish, [[]]);
  assertEquals(out.held, []);
  // ⚠️ LU QUAND MÊME : « checked » dit que la boîte a été regardée, pas qu'elle a mordu.
  assertEquals(out.byMember[CHRISTELE].exclusion, { checked: 1, refused: 0 });
});

Deno.test("PASSE — un petit-déjeuner sans tofu, même Christèle, même matin", () => {
  const out = judge({
    dishes: [dish({ title: "Flocons et fruits", ingredients: [{ term: "flocons d'avoine", group: "whole_grain" }, { term: "pomme", group: "other_fruit" }] })],
    fed: [[THOMAS, CHRISTELE, FABRICE]],
    exclusions: { [CHRISTELE]: TOFU_MORNING },
  });
  assertEquals(out.heldOffByDish, [[]]);
  assertEquals(out.byMember[CHRISTELE].exclusion, { checked: 1, refused: 0 });
});

Deno.test("⛔ MORD — végétarien et préparation au poulet : Fabrice est retenu, les autres mangent", () => {
  const out = judge({
    dishes: [dish({ title: "Riz et poulet", slot: "lunch", uses: [{ preparationId: "P2" }, { preparationId: "P3" }] })],
    fed: [[THOMAS, CHRISTELE, FABRICE]],
    regimes: { [FABRICE]: "vegetarian" },
  });
  assertEquals(out.heldOffByDish, [[FABRICE]]);
  assertEquals(out.held.length, 1);
  assertEquals(out.held[0].cause, "regime");
  assertEquals(out.held[0].because, "vegetarian");
  assertEquals(out.held[0].preparationId, "P2");
  assertEquals(out.byMember[FABRICE].regime, { checked: 1, refused: 1 });
  assertEquals(out.byMember[THOMAS].regime, { checked: 0, refused: 0 });
  assertEquals(out.counters.regime_checked, 1);
  assertEquals(out.counters.regime_refused, 1);
});

Deno.test("PASSE — végétarien, la boîte ne cite que le riz et le tofu", () => {
  const out = judge({
    dishes: [dish({ title: "Riz et tofu", slot: "lunch", uses: [{ preparationId: "P1" }, { preparationId: "P3" }] })],
    fed: [[FABRICE]],
    regimes: { [FABRICE]: "vegetarian" },
  });
  assertEquals(out.heldOffByDish, [[]]);
  assertEquals(out.byMember[FABRICE].regime, { checked: 1, refused: 0 });
});

Deno.test("⛔ LA PROSE DU PLAT N'EST PAS LUE : une méthode qui nomme la variante des autres ne retire personne", () => {
  // Le plat dédié de Fabrice dit, dans son titre, ce qu'il remplace. Sa boîte
  // ne porte que du tofu et du riz : le retirer lui coûterait son repas.
  const out = judge({
    dishes: [dish({
      title: "Riz au tofu (au lieu du poulet)",
      slot: "lunch",
      ingredients: [{ term: "brocoli", group: "cruciferous_veg" }],
      uses: [{ preparationId: "P1" }, { preparationId: "P3" }],
    })],
    fed: [[FABRICE]],
    regimes: { [FABRICE]: "vegetarian" },
  });
  assertEquals(out.heldOffByDish, [[]]);
});

Deno.test("les deux causes à la fois : une seule retenue, le régime gagne, les deux refus sont comptés", () => {
  const out = judge({
    dishes: [dish({ title: "Bol poulet tofu", uses: [{ preparationId: "P1" }, { preparationId: "P2" }] })],
    fed: [[CHRISTELE]],
    exclusions: { [CHRISTELE]: TOFU_MORNING },
    regimes: { [CHRISTELE]: "vegetarian" },
  });
  assertEquals(out.heldOffByDish, [[CHRISTELE]]);
  assertEquals(out.held.length, 1);
  assertEquals(out.held[0].cause, "regime");
  assertEquals(out.byMember[CHRISTELE].regime, { checked: 1, refused: 1 });
  assertEquals(out.byMember[CHRISTELE].exclusion, { checked: 1, refused: 1 });
  // ⛔ LE PLAT N'A PLUS PERSONNE : dit, pas deviné en aval.
  assertEquals(out.counters.emptied, 1);
  assertEquals(out.counters.held_off, 1);
});

Deno.test("les termes de la TABLE jugent chaque mangeur", () => {
  const household = exclusionTermsFor({
    items: [exclusion("poulet", "household", null)],
    subject: "household",
  });
  assert(household.length > 0, "le jeu de termes de la table est vide : le test ne prouverait rien");
  const out = judge({
    dishes: [dish({ title: "Riz et poulet", slot: "dinner", uses: [{ preparationId: "P2" }] })],
    fed: [[THOMAS, FABRICE]],
    household,
  });
  assertEquals(out.heldOffByDish, [[FABRICE, THOMAS]]);
  assertEquals(out.counters.exclusion_checked, 2);
  assertEquals(out.counters.emptied, 1);
});

Deno.test("un plat non placé n'est pas jugé, et un mangeur hors liste est compté", () => {
  const out = judge({
    dishes: [dish({ uses: [{ preparationId: "P1" }] }), dish({ uses: [{ preparationId: "P1" }] })],
    fed: [null, ["m_inconnu"]],
    exclusions: { m_inconnu: exclusionTermsFor({ items: [exclusion("tofu", "m_inconnu", null)], subject: "m_inconnu" }) },
  });
  assertEquals(out.counters.dishes, 2);
  assertEquals(out.counters.placed, 1);
  assertEquals(out.counters.off_roster, 1);
  assertEquals(out.heldOffByDish, [[], ["m_inconnu"]]);
});

Deno.test("le vocabulaire des causes est fermé", () => {
  assertEquals([...ENGINE_BOX_HELD_CAUSES], ["regime", "exclusion"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// LE JUGE D'UN À-CÔTÉ
// ═══════════════════════════════════════════════════════════════════════════

const GROUPS: Readonly<Record<string, FoodGroupRef>> = {
  cheddar: "dairy_cheese",
  apple: "other_fruit",
  plain_yogurt: "dairy_yogurt",
};

function sideJudge(slot: "lunch" | "dinner" | null, over: {
  exclusions?: Readonly<Record<string, readonly ForbiddenTerm[]>>;
  regimes?: Readonly<Record<string, DietaryRegime>>;
} = {}) {
  return judgeSideTerm({
    exclusionsOf: (m) => over.exclusions?.[m] ?? [],
    regimeOf: (m) => over.regimes?.[m] ?? null,
    householdTerms: [],
    groupOfRef: (ref) => GROUPS[ref] ?? null,
    slot,
  });
}

Deno.test("À-CÔTÉ — « pas de fromage le soir » : refusé au dîner, servi au déjeuner", () => {
  const exclusions = {
    [FABRICE]: exclusionTermsFor({ items: [exclusion("fromage", FABRICE, "dinner")], subject: FABRICE }),
  };
  const soir = sideJudge("dinner", { exclusions });
  const midi = sideJudge("lunch", { exclusions });
  const lesDeux = sideJudge(null, { exclusions });
  const fromage = { memberId: FABRICE, term: "fromage de chèvre", ref: null };
  assertEquals(soir(fromage), { ok: false, reason: "excluded" });
  assertEquals(midi(fromage), { ok: true });
  // ⚠️ `null` juge les deux moments à la fois : plus strict, jamais plus large.
  assertEquals(lesDeux(fromage), { ok: false, reason: "excluded" });
  // Et l'autre mangeur n'est pas concerné.
  assertEquals(soir({ ...fromage, memberId: THOMAS }), { ok: true });
});

Deno.test("À-CÔTÉ — une règle du MATIN ne juge jamais un à-côté, même avec `slot: null`", () => {
  const exclusions = {
    [CHRISTELE]: exclusionTermsFor({ items: [exclusion("yaourt", CHRISTELE, "breakfast")], subject: CHRISTELE }),
  };
  const yaourt = { memberId: CHRISTELE, term: "yaourt nature", ref: "plain_yogurt" };
  assertEquals(sideJudge(null, { exclusions })(yaourt), { ok: true });
  assertEquals(sideJudge("lunch", { exclusions })(yaourt), { ok: true });
  // …et la même règle, écrite pour toute la journée, mord.
  const partout = {
    [CHRISTELE]: exclusionTermsFor({ items: [exclusion("yaourt", CHRISTELE, null)], subject: CHRISTELE }),
  };
  assertEquals(sideJudge("lunch", { exclusions: partout })(yaourt), { ok: false, reason: "excluded" });
});

Deno.test("À-CÔTÉ — végane et cheddar : refusé par le régime ; la pomme passe", () => {
  const judgeVegan = sideJudge("lunch", { regimes: { [FABRICE]: "vegan" } });
  assertEquals(
    judgeVegan({ memberId: FABRICE, term: "cheddar", ref: "cheddar" }),
    { ok: false, reason: "regime" },
  );
  assertEquals(judgeVegan({ memberId: FABRICE, term: "pomme", ref: "apple" }), { ok: true });
});

Deno.test("À-CÔTÉ — un mot vide ne juge rien", () => {
  assertEquals(sideJudge("lunch")({ memberId: FABRICE, term: "  ", ref: null }), { ok: true });
});
