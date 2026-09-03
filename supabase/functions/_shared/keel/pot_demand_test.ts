// LOT 3 — CE QUE LA CASSEROLE A REFUSÉ. Ce que ces tests protègent:
//
//   * LES DEUX PLAFONDS CONFONDUS — « le facteur a été raboté » et « la
//     casserole ne suivait pas » se réparent à deux endroits opposés (une borne
//     de plausibilité, une liste de courses). Un compteur qui les fondrait
//     enverrait au mauvais;
//   * LA SOMME QUI S'ANNULE — un manque et un dépassement dans le même total
//     rendent une table qui paraît parfaite alors que la moitié a faim;
//   * `raw` AU LIEU DE `factor` dans le levier amont — utiliser le facteur déjà
//     raboté rendrait toujours 1, et le module ne dirait plus rien.

import { assert, assertEquals } from "jsr:@std/assert@1";

import type { AnchorFactor } from "./mouth_anchor.ts";
import type { MouthDayEnergy } from "./mouth_energy.ts";
import { neededPotFactor, UNMET_CAUSES, unmetDemand } from "./pot_demand.ts";

const KEY = "m_iku thu";

function anchor(over: Partial<AnchorFactor> = {}): AnchorFactor {
  return {
    factor: 1.2,
    raw: 1.2,
    reason: "anchored",
    targetKcal: 2400,
    deliveredKcal: 2000,
    structureState: "not_asked",
    extrasFloored: false,
    ...over,
  };
}

function day(over: Partial<MouthDayEnergy> = {}): MouthDayEnergy {
  return {
    memberId: "m_iku",
    day: "thu",
    kcal: 2000,
    basis: "plan_quantities",
    complete: true,
    dishesCounted: 3,
    dishesTotal: 3,
    unattributedDishes: 0,
    subject: "the_day",
    gaps: [],
    ...over,
  } as MouthDayEnergy;
}

// ---------------------------------------------------------------------------
// ① LA DEMANDE NON SATISFAITE
// ---------------------------------------------------------------------------

Deno.test("quand la casserole suit et que rien n'est raboté, rien n'est refusé", () => {
  const got = unmetDemand(new Map([[KEY, anchor()]]), [day()], new Map());
  assertEquals(got[0].cause, "none");
  assertEquals(got[0].servedKcal, 2400);
  assertEquals(got[0].unmetKcal, 0);
});

Deno.test("le rabot de FACTEUR et le plafond de CASSEROLE sont distingués", () => {
  // Les deux se réparent à deux endroits opposés: une borne de plausibilité
  // d'un côté, une liste de courses de l'autre.
  const clamped = unmetDemand(
    new Map([[KEY, anchor({ factor: 1.6, raw: 2.4 })]]),
    [day()],
    new Map(),
  );
  assertEquals(clamped[0].cause, "factor_clamped");

  const pot = unmetDemand(new Map([[KEY, anchor()]]), [day()], new Map([[KEY, 0.8]]));
  assertEquals(pot[0].cause, "pot_ceiling");

  const both = unmetDemand(
    new Map([[KEY, anchor({ factor: 1.6, raw: 2.4 })]]),
    [day()],
    new Map([[KEY, 0.8]]),
  );
  // ⛔ LE CAS QUI DIT QUE L'AVAL SEUL NE SUFFIRA JAMAIS.
  assertEquals(both[0].cause, "both");
});

Deno.test("le manque est CHIFFRÉ, et il tient compte du rabot de casserole", () => {
  // 2000 livrés x 1,2 de facteur x 0,5 de rabot = 1200 servis pour 2400 voulus.
  const got = unmetDemand(new Map([[KEY, anchor()]]), [day()], new Map([[KEY, 0.5]]));
  assertEquals(got[0].wantedKcal, 2400);
  assertEquals(got[0].servedKcal, 1200);
  assertEquals(got[0].unmetKcal, 1200);
});

Deno.test("un DÉPASSEMENT n'est pas un manque négatif — il ne s'annule avec rien", () => {
  // Une table où une bouche manque de 500 et l'autre déborde de 500 paraîtrait
  // parfaite si le manque était signé. `unmetKcal` reste >= 0, et le
  // dépassement se lit sur `servedKcal` face à `wantedKcal`.
  const got = unmetDemand(
    new Map([[KEY, anchor({ factor: 2, raw: 2, targetKcal: 2000 })]]),
    [day()],
    new Map(),
  );
  assertEquals(got[0].unmetKcal, 0);
  assert(got[0].servedKcal! > got[0].wantedKcal!);
});

Deno.test("une bouche non ancrée est NOMMÉE, jamais comptée comme satisfaite", () => {
  const got = unmetDemand(
    new Map([[KEY, anchor({ raw: null, reason: "day_incomplete", targetKcal: 2400 })]]),
    [day()],
    new Map(),
  );
  assertEquals(got[0].cause, "not_anchored");
  assertEquals(got[0].unmetKcal, null);
  // On dit quand même ce qu'on savait: la cible existait.
  assertEquals(got[0].wantedKcal, 2400);
});

Deno.test("tout motif rendu appartient au vocabulaire fermé", () => {
  const rows = [
    ...unmetDemand(new Map([[KEY, anchor()]]), [day()], new Map()),
    ...unmetDemand(new Map(), [day()], new Map()),
    ...unmetDemand(new Map([[KEY, anchor({ factor: 1.6, raw: 2.4 })]]), [day()], new Map([[KEY, 0.8]])),
  ];
  for (const r of rows) assert(UNMET_CAUSES.includes(r.cause), r.cause);
});

// ---------------------------------------------------------------------------
// ② LE LEVIER AMONT — calculé, jamais appliqué
// ---------------------------------------------------------------------------

Deno.test("une casserole qui suffit rend un facteur de 1", () => {
  const got = neededPotFactor(
    [{ shares: [{ key: KEY, grams: 400 }], uses: [{ preparationId: "p", servings: 1 }] }],
    new Map([[KEY, anchor({ factor: 1, raw: 1 })]]),
  );
  assertEquals(got.get("p"), 1);
});

Deno.test("le levier lit `raw`, PAS `factor` — sinon il rendrait toujours 1", () => {
  // ⛔ LE DÉFAUT QUE CE TEST GARDE. La question posée est « de combien la
  // casserole devrait grossir pour que le rabot ne soit plus nécessaire ».
  // Lire le facteur DÉJÀ raboté répondrait « elle suffit », toujours.
  const got = neededPotFactor(
    [{ shares: [{ key: KEY, grams: 400 }], uses: [{ preparationId: "p", servings: 1 }] }],
    new Map([[KEY, anchor({ factor: 1.6, raw: 2.4 })]]),
  );
  assertEquals(got.get("p"), 2.4);
});

Deno.test("un repas qui tire de DEUX casseroles répartit sa demande au prorata", () => {
  const got = neededPotFactor(
    [{
      shares: [{ key: KEY, grams: 300 }],
      uses: [
        { preparationId: "a", servings: 3 },
        { preparationId: "b", servings: 1 },
      ],
    }],
    new Map([[KEY, anchor({ factor: 1.5, raw: 1.5 })]]),
  );
  // Le facteur est le même des deux côtés — c'est le RAPPORT qui compte, et il
  // ne dépend pas du partage. Ce que le prorata garantit, c'est qu'aucune des
  // deux ne reçoive la demande entière.
  assertEquals(got.get("a"), 1.5);
  assertEquals(got.get("b"), 1.5);
});

Deno.test("deux bouches aux facteurs opposés sur la même casserole se compensent", () => {
  // 200 g a 1,5 et 200 g a 0,5 => 400 g voulus pour 400 g tirés: la casserole
  // suffit, même si les DEUX parts changent. C'est le cas que le chantier a
  // mesuré (612/344 pour 900 g) et il ne doit pas commander de courses.
  const got = neededPotFactor(
    [{
      shares: [{ key: "a thu", grams: 200 }, { key: "b thu", grams: 200 }],
      uses: [{ preparationId: "p", servings: 1 }],
    }],
    new Map([
      ["a thu", anchor({ factor: 1.5, raw: 1.5 })],
      ["b thu", anchor({ factor: 0.5, raw: 0.5 })],
    ]),
  );
  assertEquals(got.get("p"), 1);
});

Deno.test("une bouche sans ancrage ne fait pas grossir la casserole", () => {
  const got = neededPotFactor(
    [{ shares: [{ key: "inconnu", grams: 400 }], uses: [{ preparationId: "p", servings: 1 }] }],
    new Map(),
  );
  assertEquals(got.get("p"), 1);
});

Deno.test("le module est PUR: même entrée, même sortie, entrée intacte", () => {
  const meals = [{
    shares: [{ key: KEY, grams: 400 }],
    uses: [{ preparationId: "p", servings: 1 }],
  }];
  const anchors = new Map([[KEY, anchor({ factor: 1.6, raw: 2.4 })]]);
  const before = JSON.stringify(meals);
  const a = neededPotFactor(meals, anchors);
  const b = neededPotFactor(meals, anchors);
  assertEquals(JSON.stringify([...a]), JSON.stringify([...b]));
  assertEquals(JSON.stringify(meals), before);
});
