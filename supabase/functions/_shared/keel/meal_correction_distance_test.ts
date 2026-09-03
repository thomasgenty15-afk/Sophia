/**
 * LE CRITÈRE D'ADOPTION D'UNE RELANCE — `offBandDistance`.
 *
 * ⛔ CE QU'IL FERME: `offBandCount` valait 0 ou 1 par axe, comparé par un `<`
 * strict. Une seconde passe qui monte de 68 % à 84 % de la bande reste
 * `below`, le compte ne bouge pas, la relance est jetée — et elle a coûté un
 * appel de modèle. Mesuré le 2026-08-23: 7 relances levées, 7 payées, 1 adoptée.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

import { offBandDistance } from "./meal_correction.ts";
import type { Envelope } from "./meal_envelope.ts";
import type { CompositionVerdict } from "./meal_verdict.ts";

const ENV: Envelope = {
  mode: "per_kg",
  energy: { low: 2400, high: 2700 },
  proteinFloorG: 130,
  proteinPerMealG: null,
  densityCeiling: 1.8,
};

function verdict(over: Partial<CompositionVerdict> = {}): CompositionVerdict {
  return {
    resolution: { resolved: 10, total: 10, unresolvedEnergyDense: false, unweighedEnergyDense: false },
    energy: "within",
    protein: "met",
    density: "within",
    sentinels: { missing: [], uncoverable: [] },
    ...over,
  };
}

const d = (v: CompositionVerdict, kcal: number | null, prot: number | null) =>
  offBandDistance({
    verdict: v,
    envelope: ENV,
    computedKcal: kcal,
    computedProteinG: prot,
    daysCovered: 3,
  });

Deno.test("un plan dans la bande est à distance ZÉRO", () => {
  assertEquals(d(verdict(), 2500 * 3, 140 * 3), 0);
});

Deno.test("⛔ LE CAS DU LOT — un progrès QUI RESTE `below` est enfin visible", () => {
  // C'est le défaut exact: les deux verdicts disent `below`, donc le compte
  // binaire les déclare équivalents. La distance, elle, voit les 16 points.
  const avant = d(verdict({ energy: "below" }), 0.68 * 2400 * 3, 140 * 3);
  const apres = d(verdict({ energy: "below" }), 0.84 * 2400 * 3, 140 * 3);
  assert(apres < avant, `la relance doit rapprocher: ${apres} vs ${avant}`);
});

Deno.test("⚠️ LE CAS QUI REFUSE — une relance qui ÉLOIGNE n'est pas adoptée", () => {
  // ⛔ SANS CE CAS, une distance qui descendrait toujours passerait pour une
  // mesure. Le sens de l'inégalité doit être vérifié dans les deux directions.
  const avant = d(verdict({ energy: "below" }), 0.84 * 2400 * 3, 140 * 3);
  const apres = d(verdict({ energy: "below" }), 0.52 * 2400 * 3, 140 * 3);
  assert(apres > avant);
});

Deno.test("une grandeur hors bande coûte AU MOINS 1 — deux axes restent pires qu'un", () => {
  // ⚠️ SANS LE PLANCHER DE 1, un plan à 99 % de sa bande sur DEUX axes
  // paraîtrait meilleur qu'un plan à 80 % sur UN seul, et la relance
  // choisirait le plan qui rate deux choses.
  const unAxe = d(verdict({ energy: "below" }), 0.80 * 2400 * 3, 140 * 3);
  const deuxAxes = d(
    verdict({ energy: "below", protein: "under" }),
    0.99 * 2400 * 3,
    0.99 * 130 * 3,
  );
  assert(deuxAxes > unAxe, `${deuxAxes} doit dépasser ${unAxe}`);
});

Deno.test("⛔ `not_computable` VAUT ZÉRO — l'ignorance ne bat pas l'imperfection", () => {
  // Un plan illisible ne doit pas passer pour meilleur qu'un plan mesuré et
  // imparfait: sinon la relance apprendrait à rendre les plans moins lisibles.
  const illisible = d(verdict({ energy: "not_computable", protein: "not_computable" }), null, null);
  const mesureImparfait = d(verdict({ energy: "below" }), 0.9 * 2400 * 3, 140 * 3);
  assertEquals(illisible, 0);
  assert(mesureImparfait > illisible);
});

Deno.test("le plancher protéique compte son AMPLITUDE, pas seulement son échec", () => {
  const juste = d(verdict({ protein: "under" }), 2500 * 3, 0.95 * 130 * 3);
  const loin = d(verdict({ protein: "under" }), 2500 * 3, 0.40 * 130 * 3);
  assert(loin > juste);
});

Deno.test("sans nombres, la distance retombe sur le COMPTE — jamais sur zéro", () => {
  // ⚠️ Un appelant sans référentiel passe `null`: chaque axe raté vaut alors 1,
  // c'est-à-dire exactement `offBandCount`. Rendre 0 ferait passer un plan raté
  // pour un plan parfait.
  assertEquals(d(verdict({ energy: "below", protein: "under" }), null, null), 2);
});

Deno.test("densité et sentinelles comptent 1 chacune, comme avant", () => {
  assertEquals(d(verdict({ density: "above" }), 2500 * 3, 140 * 3), 1);
  assertEquals(
    d(
      verdict({ sentinels: { missing: ["legumes", "berries"] as never, uncoverable: [] } }),
      2500 * 3,
      140 * 3,
    ),
    2,
  );
});

Deno.test("une enveloppe DÉGRADÉE (plancher TCA) ne fabrique aucune amplitude", () => {
  // `per_portion` ne porte ni bande ni plancher: la distance retombe sur le
  // compte, et surtout elle n'invente pas de cible pour quelqu'un sous flag.
  const degraded: Envelope = { mode: "per_portion", proteinPortionPerMeal: true };
  assertEquals(
    offBandDistance({
      verdict: verdict({ protein: "under" }),
      envelope: degraded,
      computedKcal: 1000,
      computedProteinG: 10,
      daysCovered: 3,
    }),
    1,
  );
});
