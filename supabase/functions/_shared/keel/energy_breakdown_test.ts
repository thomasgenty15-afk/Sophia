import { assert, assertEquals } from "jsr:@std/assert@1";

import { energyBreakdownFor } from "./energy_breakdown.ts";
import { maintenanceRange } from "./energy_target.ts";

// ===========================================================================
// LE DÉTAIL DU CALCUL — 2026-09-21
//
// Ce que ce fichier garde: le détail DÉCRIT le nombre affiché, il ne le
// recalcule pas. Deux propriétés, et ce sont les seules qui comptent:
//
//   ① SUR LE RACCOURCI, l'entretien du détail est CELUI de `maintenanceRange`,
//      au kcal près — c'est l'assertion croisée ci-dessous, et elle tombe si
//      l'une des deux copies dérive de l'autre;
//   ② L'ARITHMÉTIQUE TOMBE JUSTE À L'ÉCRAN: entretien + écart = la fourchette
//      rendue. Sans ça, un détail « transparent » produit un doute au lieu de
//      le lever.
// ===========================================================================

Deno.test("rien à expliquer quand il n'y a pas de fourchette", () => {
  assertEquals(
    energyBreakdownFor({
      low: null,
      high: null,
      fromBodyEquation: false,
      weightKg: 72,
      activityLevel: "trains_some",
      bodyMaintenanceKcal: null,
      dailyDeltaKcal: 0,
      direction: null,
    }),
    null,
  );
});

Deno.test("① le raccourci: l'entretien du détail EST celui de `maintenanceRange`", () => {
  // ⛔ L'ASSERTION CROISÉE. Ce module refait la multiplication (il importe la
  // même table de constantes); ce cas prouve que les deux tombent sur le même
  // nombre. Changer `ACTIVITY_KCAL_PER_KG` d'un côté fait rougir ici.
  const weightKg = 72;
  const ref = maintenanceRange({
    weightKg,
    weightWeekStart: null,
    activityLevel: "trains_some",
  });
  const got = energyBreakdownFor({
    low: ref.range!.low,
    high: ref.range!.high,
    fromBodyEquation: false,
    weightKg,
    activityLevel: "trains_some",
    bodyMaintenanceKcal: null,
    dailyDeltaKcal: 0,
    direction: null,
  })!;
  assertEquals(got.chain, "weight_per_kg");
  assertEquals(got.maintenanceLow, ref.range!.low);
  assertEquals(got.maintenanceHigh, ref.range!.high);
  assertEquals(got.perKgLow, 30);
  assertEquals(got.perKgHigh, 33);
});

Deno.test("② l'arithmétique tombe juste: entretien + écart = la fourchette", () => {
  // Une prise de 0,5 kg/semaine ≈ 550 kcal/j. La fourchette rendue est donc
  // l'entretien décalé d'autant, et le détail doit le DIRE avec le même
  // nombre — sinon l'écran montre « +536 » sous un décalage de 550.
  const weightKg = 72;
  const ref = maintenanceRange({
    weightKg,
    weightWeekStart: null,
    activityLevel: "on_feet",
  });
  const shift = 550;
  const got = energyBreakdownFor({
    low: ref.range!.low + shift,
    high: ref.range!.high + shift,
    fromBodyEquation: false,
    weightKg,
    activityLevel: "on_feet",
    bodyMaintenanceKcal: null,
    dailyDeltaKcal: 536,
    direction: "up",
  })!;
  assertEquals(got.dailyDeltaKcal, shift);
  assertEquals(got.maintenanceLow! + got.dailyDeltaKcal, got.low);
  assertEquals(got.maintenanceHigh! + got.dailyDeltaKcal, got.high);
});

Deno.test("l'écart est SIGNÉ par la direction, jamais par l'écran", () => {
  const base = {
    low: 1900,
    high: 2200,
    fromBodyEquation: true,
    weightKg: 72,
    activityLevel: "on_feet" as const,
    bodyMaintenanceKcal: 2550,
    dailyDeltaKcal: 500,
  };
  assertEquals(energyBreakdownFor({ ...base, direction: "down" })!.dailyDeltaKcal, -500);
  assertEquals(energyBreakdownFor({ ...base, direction: "up" })!.dailyDeltaKcal, 500);
  // ⛔ SANS DIRECTION, AUCUN ÉCART — même si le rythme en porte un. C'est le
  // cas d'un maintien, et poser −500 dessous serait inventer un déficit.
  assertEquals(energyBreakdownFor({ ...base, direction: null })!.dailyDeltaKcal, 0);
});

Deno.test("un écart sous le pas de 50 disparaît, comme dans `directedRange`", () => {
  const got = energyBreakdownFor({
    low: 2500,
    high: 2800,
    fromBodyEquation: true,
    weightKg: 72,
    activityLevel: null,
    bodyMaintenanceKcal: 2650,
    dailyDeltaKcal: 20,
    direction: "down",
  })!;
  assertEquals(got.dailyDeltaKcal, 0);
});

Deno.test("l'équation du corps rend un POINT, et aucun kcal/kg", () => {
  const got = energyBreakdownFor({
    low: 3204,
    high: 3348,
    fromBodyEquation: true,
    weightKg: 72,
    activityLevel: "trains_some",
    bodyMaintenanceKcal: 2726,
    dailyDeltaKcal: 550,
    direction: "up",
  })!;
  assertEquals(got.chain, "body_equation");
  assertEquals(got.maintenanceLow, 2726);
  assertEquals(got.maintenanceHigh, 2726);
  // ⛔ PAS DE kcal/kg SUR CETTE CHAÎNE: l'activité y entre par un facteur de
  // l'équation, pas par une multiplication au poids. En rendre un ferait lire
  // une arithmétique qui n'a pas eu lieu.
  assertEquals(got.perKgLow, null);
  assertEquals(got.perKgHigh, null);
  // ⚠️ MAIS LE CRAN EST RENDU: le taire ferait croire que l'activité ne compte
  // pas dans ce cas.
  assertEquals(got.activityLevel, "trains_some");
});

Deno.test("⛔ aucun champ ne permet de construire un RESTE", () => {
  // La règle de `energy_target.ts`: « il te reste 680 kcal » est la phrase
  // d'un tracker. Ce module ne rend que des étapes de CALCUL — aucune
  // consommation n'y entre, donc aucune soustraction n'en sort. Ce cas est une
  // ceinture de FORME: il liste les clés, et un champ ajouté le fait rougir.
  const got = energyBreakdownFor({
    low: 1900,
    high: 2200,
    fromBodyEquation: true,
    weightKg: 72,
    activityLevel: null,
    bodyMaintenanceKcal: 2400,
    dailyDeltaKcal: 500,
    direction: "down",
  })!;
  assertEquals(Object.keys(got).sort(), [
    "activityLevel",
    "chain",
    "dailyDeltaKcal",
    "high",
    "low",
    "maintenanceHigh",
    "maintenanceLow",
    "perKgHigh",
    "perKgLow",
    "weightKg",
  ]);
  assert(!Object.keys(got).some((k) => /eaten|consumed|remaining|reste/i.test(k)));
});
