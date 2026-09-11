/**
 * LOT 4 · UN COULOIR VIDE DÉPLACE DE L'ÉNERGIE, IL N'EN PERD PAS.
 *
 * Les cas de la famille « Allocation » du chantier qui portent sur la
 * redistribution: faisable, impossible, cases gelées, repas dehors, léger.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  type RedistributableSlot,
  redistributeDayBudget,
} from "./portion_sizing.ts";

function moment(
  over: Partial<RedistributableSlot> & { slot: string },
): RedistributableSlot {
  return {
    targetKcal: 500,
    maxGrams: 700,
    locked: false,
    light: false,
    ...over,
  };
}

/** La somme, au centième — c'est le contrat, pas une élégance. */
function somme(m: ReadonlyMap<string, number>): number {
  return Math.round([...m.values()].reduce((a, b) => a + b, 0) * 100) / 100;
}

Deno.test("une journée qui tient déjà ne bouge PAS", () => {
  const r = redistributeDayBudget([
    moment({ slot: "lunch", targetKcal: 800 }),
    moment({ slot: "dinner", targetKcal: 700 }),
  ]);
  assert(r.ok);
  assertEquals(r.moved, 0);
  assertEquals(somme(r.bySlot), 1500);
});

Deno.test("un moment qui DÉBORDE donne à celui qui a de la place", () => {
  // Un dîner de 2 000 kcal dans une assiette de 700 g demanderait 285 kcal/100 g
  // — au-dessus du plafond de demande (250). Sa capacité est 700 × 2,5 = 1 750.
  const r = redistributeDayBudget([
    moment({ slot: "lunch", targetKcal: 400, maxGrams: 900 }),
    moment({ slot: "dinner", targetKcal: 2000, maxGrams: 700 }),
  ]);
  assert(r.ok);
  // ⛔ LA SOMME EST CONSERVÉE. Une redistribution qui perd 40 kcal creuse un
  // déficit que personne n'a demandé.
  assertEquals(somme(r.bySlot), 2400);
  assert(
    r.bySlot.get("dinner")! <= 1750 + 0.01,
    "le dîner dépasse encore sa capacité",
  );
  assert(r.bySlot.get("lunch")! > 400, "le déjeuner n'a rien reçu");
  assertEquals(r.moved, 2);
});

Deno.test("UN APPORT FIXE NE BOUGE PAS — le shaker est déjà avalé", () => {
  const r = redistributeDayBudget([
    moment({ slot: "breakfast", targetKcal: 300, locked: true }),
    moment({ slot: "lunch", targetKcal: 400, maxGrams: 900 }),
    moment({ slot: "dinner", targetKcal: 2000, maxGrams: 700 }),
  ]);
  assert(r.ok);
  assertEquals(r.bySlot.get("breakfast"), 300);
  // ⚠️ ET IL NE COMPTE NI COMME DONNEUR NI COMME RECEVEUR: le total déplacé
  // est celui des seuls moments mobiles.
  assertEquals(somme(r.bySlot), 2700);
});

Deno.test("UN MOMENT LÉGER NE DÉPASSE PAS SON BUDGET DE DÉPART", () => {
  // ⛔ « Léger » est une décision de la personne, pas une variable
  // d'ajustement. Le rendre moins léger pour équilibrer la journée
  // renverserait ce qu'elle a demandé.
  // ⚠️ IL FAUT UN TROISIÈME MOMENT POUR QUE LE TEST DISE QUELQUE CHOSE. À deux,
  // un dîner léger bloqué à 300 et un déjeuner qui déborde rendent une journée
  // simplement infaisable — ce que le cas `no_room_in_day` mesure déjà. Ici on
  // veut voir le plafond du léger MORDRE pendant que la journée, elle, tient.
  const r = redistributeDayBudget([
    moment({ slot: "breakfast", targetKcal: 200, maxGrams: 2000 }),
    moment({ slot: "lunch", targetKcal: 2000, maxGrams: 700 }),
    moment({ slot: "dinner", targetKcal: 300, light: true, maxGrams: 700 }),
  ]);
  assert(r.ok);
  assertEquals(
    r.bySlot.get("dinner"),
    300,
    "le dîner léger a été remonté pour équilibrer la journée",
  );
  // Ce que le déjeuner ne peut pas porter (700 g × 2,5 = 1 750) part au
  // petit-déjeuner, pas au dîner léger.
  assertEquals(r.bySlot.get("lunch"), 1750);
  assertEquals(r.bySlot.get("breakfast"), 450);
  assertEquals(somme(r.bySlot), 2500);
});

Deno.test("AUCUNE PLACE DANS LA JOURNÉE: on rend le conflit, on ne rabote pas", () => {
  // Deux petites assiettes et une journée énorme: aucune allocation ne tient.
  // ⛔ LA SORTIE EST UN REFUS NOMMÉ, pas une cible baissée en silence.
  const r = redistributeDayBudget([
    moment({ slot: "lunch", targetKcal: 2000, maxGrams: 300 }),
    moment({ slot: "dinner", targetKcal: 2000, maxGrams: 300 }),
  ]);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "no_room_in_day");
});

Deno.test("TOUT EST GELÉ: rien à déplacer, et c'est nommé", () => {
  const r = redistributeDayBudget([
    moment({ slot: "lunch", targetKcal: 900, locked: true }),
    moment({ slot: "dinner", targetKcal: 900, locked: true }),
  ]);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "nothing_movable");
});

Deno.test("UN SEUL MOMENT MOBILE saturé rend un refus, pas une perte", () => {
  // Le déjeuner est gelé, le dîner déborde et n'a personne à qui donner.
  const r = redistributeDayBudget([
    moment({ slot: "lunch", targetKcal: 600, locked: true }),
    moment({ slot: "dinner", targetKcal: 3000, maxGrams: 700 }),
  ]);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, "no_room_in_day");
});

Deno.test("TROIS MOMENTS, DEUX SATURENT: la cascade tient la somme", () => {
  const r = redistributeDayBudget([
    moment({ slot: "breakfast", targetKcal: 1200, maxGrams: 200 }),
    moment({ slot: "lunch", targetKcal: 1200, maxGrams: 200 }),
    moment({ slot: "dinner", targetKcal: 600, maxGrams: 2000 }),
  ]);
  assert(r.ok);
  assertEquals(somme(r.bySlot), 3000);
  assert(
    r.bySlot.get("breakfast")! <= 500 + 0.01,
    "le petit-déjeuner dépasse 200 g × 2,5",
  );
  assert(
    r.bySlot.get("lunch")! <= 500 + 0.01,
    "le déjeuner dépasse 200 g × 2,5",
  );
  // Le dîner absorbe ce que les deux autres ne peuvent pas porter.
  assert(r.bySlot.get("dinner")! > 600, "le dîner n'a rien absorbé");
});

// ═══════════════════════════════════════════════════════════════════════════
// LOT 4 · LE RENDU NE RÉPÈTE PAS LE PLANCHER DU BLOC
// ═══════════════════════════════════════════════════════════════════════════

import { densityFragment } from "./household_portions.ts";
import type { SlotDensity } from "./portion_sizing.ts";

function couloir(over: Partial<SlotDensity> & { slot: string }): SlotDensity {
  return {
    // ⟳ 2026-09-11 · LOT B — LES JOURS DE CETTE LIGNE. `[]` = « elle ne dit pas
    // ses jours », le cas d'un décor de test: le rédacteur n'ajoute alors
    // aucune date, exactement comme avant ce lot.
    days: [],
    kcalPer100G: 100,
    minPer100G: 100,
    maxPer100G: 135,
    preferredPer100G: 110,
    neededMinPer100G: 100,
    incompatible: null,
    redundantMin: false,
    occurrences: 1,
    light: false,
    // ⟳ 2026-09-11 — LE TÉMOIN `100 × E / Gpréf` (arbitrage A15). Ce décor
    // n'en a pas besoin: `null` dit « pas de témoin », et le rédacteur ne
    // nomme alors qu'un seul nombre — ce qui est le cas nominal d'avant.
    targetAnchoredPer100G: null,
    ...over,
  };
}

Deno.test("une borne basse REDONDANTE se rend en plafond seul", () => {
  // ⛔ LA MOITIÉ QUI SAUVE LE LOT 4. Le filtre `min > floor` a été retiré pour
  // ne plus perdre le PLAFOND; si le rendu répétait « au moins 100 » sur tous
  // les moments récupérés, on aurait échangé une perte d'information contre un
  // brief que le modèle cesse de lire.
  const rendu = densityFragment([couloir({ slot: "snack_pm", redundantMin: true })]);
  assert(rendu.includes("up to 135"), rendu);
  assert(!rendu.includes("100 to 135"), `le plancher du bloc est répété: ${rendu}`);
  // ⚠️ ET LA VISÉE RESTE. « Au plus 135 » sans visée fait partir le modèle vers
  // le bas — l'erreur miroir, mesurée au tir SPLICE3 (un bouillon à 57,8).
  assert(rendu.includes("aim 110"), rendu);
});

Deno.test("une borne basse QUI MORD garde la bande entière", () => {
  const rendu = densityFragment([
    couloir({ slot: "lunch", minPer100G: 186, maxPer100G: 240, preferredPer100G: 205 }),
  ]);
  assert(rendu.includes("186 to 240"), rendu);
  assert(!rendu.includes("up to"), rendu);
});

Deno.test("l'unité n'est écrite qu'UNE fois, même sur un plafond seul", () => {
  // ⛔ LA GARDE DE FORME DU DÉPÔT: un test lit le prompt entier et refuse tout
  // `kcal` qui ne soit pas suivi de `per 100 g`. Le premier fragment porte
  // l'unité, les suivants non — y compris quand le premier est un plafond.
  const rendu = densityFragment([
    couloir({ slot: "snack_pm", redundantMin: true }),
    couloir({ slot: "lunch", minPer100G: 186, maxPer100G: 240 }),
  ]);
  assertEquals(rendu.split("kcal per 100 g").length - 1, 1, rendu);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-11 · LOT B — DEUX BANDES POUR UN MÊME MOMENT SE DATENT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT B — deux couloirs d'un même moment sortent DATÉS, un seul ne l'est pas", () => {
  // ── LE CAS QUI MORD ──────────────────────────────────────────────────
  // Le chantier: « ne pas fusionner tous les dîners par leur valeur maximale;
  // une consigne commune n'est possible que si les contrats sont effectivement
  // compatibles et LES CASES CONCERNÉES RESTENT IDENTIFIABLES ». Deux lignes
  // « at dinner » sans date se lisent comme une contradiction.
  const deux = densityFragment([
    couloir({
      slot: "dinner",
      days: ["fri"],
      minPer100G: 186,
      maxPer100G: 250,
      preferredPer100G: 205,
    }),
    couloir({
      slot: "dinner",
      days: ["sat", "sun"],
      minPer100G: 101,
      maxPer100G: 135,
      preferredPer100G: 111,
    }),
  ]);
  assert(deux.includes("at dinner on fri"), deux);
  assert(deux.includes("at dinner on sat/sun"), deux);

  // ── LE CAS QUI PASSE ─────────────────────────────────────────────────
  // ⛔ UN MOMENT QUI NE PORTE QU'UNE BANDE N'A RIEN À DATER, et c'est ce qui
  // garde la phrase archivée du 2026-09-11 reproductible au caractère.
  const un = densityFragment([
    couloir({ slot: "dinner", days: ["fri", "sat", "sun"], minPer100G: 123 }),
  ]);
  assert(!un.includes(" on "), `un seul couloir ne se date pas: ${un}`);
  assert(un.includes("at dinner"), un);
});
