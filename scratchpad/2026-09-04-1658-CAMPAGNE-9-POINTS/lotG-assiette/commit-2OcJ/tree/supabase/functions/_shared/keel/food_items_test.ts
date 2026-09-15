import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

import { validateDraftCommitment } from "../../plan-template-v1/commitment_rules.ts";
import { compileProtocol } from "./protocol_compiler.ts";
import type { Stance } from "./protocol_compiler.ts";
import type { FoodGroupRef } from "./tokens.ts";

import {
  type CoachFoodItem,
  defaultFrequency,
  deriveFoodRules,
  type FrequencyRule,
  frequencyDescriptor,
  frequencyFromRow,
  frequencyToRow,
} from "./food_items.ts";

/**
 * LES ALIMENTS DU COACH — tests.
 *
 * Le lot tient sur une phrase: « le coach parle en aliments, le pipeline lit
 * des groupes, et la traduction entre les deux ne fait dire à personne ce qu'il
 * n'a pas dit ».
 *
 * D'où l'ordre:
 *   1. LA DÉRIVATION, cas par cas — y compris le cas difficile (les deux sens
 *      dans le même groupe), qui est le seul endroit où on peut fabriquer une
 *      opinion.
 *   2. LE BOUT DE LA CHAÎNE — ce qui sort de la dérivation traverse le VRAI
 *      compilateur puis le VRAI validateur de `plan-template-v1`. Une
 *      dérivation qui produirait des règles refusées à l'écriture rendrait
 *      l'écran décoratif sans que rien ne devienne rouge.
 *   3. L'ALLER-RETOUR BASE, parce que la CHECK par gabarit refuse une ligne
 *      dont un trou traîne — et c'est du code applicatif qui doit l'éviter.
 */

function item(over: Partial<CoachFoodItem> & { label: string }): CoachFoodItem {
  return {
    id: `id-${over.label}`,
    food_item_ref: over.label.toLowerCase().replace(/\s+/g, "_"),
    food_group_ref: "fatty_fish" as FoodGroupRef,
    stance: "encouraged" as Stance,
    frequency: null,
    why: null,
    why_source: "coach",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1. LA DÉRIVATION
// ---------------------------------------------------------------------------

Deno.test("que du POUR dans un groupe -> le groupe est encouraged", () => {
  const { rules, conflicts } = deriveFoodRules([
    item({ label: "Salmon" }),
    item({ label: "Mackerel" }),
  ]);
  assertEquals(conflicts.length, 0);
  assertEquals(rules.length, 1);
  assertEquals(rules[0].food_group_ref, "fatty_fish");
  assertEquals(rules[0].stance, "encouraged");
});

Deno.test("que du CONTRE, sans exclusion -> discouraged", () => {
  const { rules } = deriveFoodRules([
    item({ label: "Cola", food_group_ref: "sweetened_beverage" as FoodGroupRef, stance: "discouraged" }),
    item({ label: "Juice", food_group_ref: "sweetened_beverage" as FoodGroupRef, stance: "discouraged" }),
  ]);
  assertEquals(rules[0].stance, "discouraged");
});

Deno.test("LA SÉVÉRITÉ LA PLUS FORTE GAGNE: une exclusion dans le lot -> excluded", () => {
  // Amollir en « déconseillé » parce qu'un autre aliment du groupe n'est que
  // déconseillé serait décider à la place du coach, dans le sens qui l'expose.
  const { rules } = deriveFoodRules([
    item({ label: "Cola", food_group_ref: "sweetened_beverage" as FoodGroupRef, stance: "discouraged" }),
    item({ label: "Energy drink", food_group_ref: "sweetened_beverage" as FoodGroupRef, stance: "excluded" }),
  ]);
  assertEquals(rules[0].stance, "excluded");
});

Deno.test("LE CAS DIFFICILE: les deux sens dans le même groupe -> AUCUNE règle, un conflit rendu", () => {
  // Un coach qui recommande le saumon et écarte le thon n'a pas d'opinion sur
  // « les poissons gras »: il en a deux, opposées, sur deux aliments. En
  // dériver une posture de groupe lui ferait dire ce qu'il n'a pas dit.
  const { rules, conflicts } = deriveFoodRules([
    item({ label: "Salmon", stance: "encouraged" }),
    item({ label: "Tuna", stance: "excluded" }),
  ]);
  assertEquals(rules.length, 0);
  assertEquals(conflicts.length, 1);
  assertEquals(conflicts[0].food_group_ref, "fatty_fish");
  assertEquals(conflicts[0].forLabels, ["Salmon"]);
  assertEquals(conflicts[0].againstLabels, ["Tuna"]);
});

Deno.test("un conflit dans un groupe n'empêche PAS les autres groupes de compiler", () => {
  const { rules, conflicts } = deriveFoodRules([
    item({ label: "Salmon", stance: "encouraged" }),
    item({ label: "Tuna", stance: "excluded" }),
    item({ label: "Broccoli", food_group_ref: "cruciferous_veg" as FoodGroupRef }),
  ]);
  assertEquals(conflicts.length, 1);
  assertEquals(rules.length, 1);
  assertEquals(rules[0].food_group_ref, "cruciferous_veg");
});

Deno.test("le POURQUOI ne remonte que s'il est SANS AMBIGUÏTÉ", () => {
  // Un seul aliment porte la posture: sa raison EST la raison du groupe.
  const single = deriveFoodRules([
    item({ label: "Salmon", why: "It is the oily fish people actually eat." }),
  ]);
  assertEquals(single.rules[0].rationale, "It is the oily fish people actually eat.");

  // Plusieurs: en choisir un serait arbitraire, les concaténer fabriquerait une
  // phrase que le coach n'a pas écrite.
  const many = deriveFoodRules([
    item({ label: "Salmon", why: "Because A." }),
    item({ label: "Mackerel", why: "Because B." }),
  ]);
  assertEquals(many.rules[0].rationale, null);
});

Deno.test("un pourquoi vide ou blanc ne remonte pas comme rationale", () => {
  const { rules } = deriveFoodRules([item({ label: "Salmon", why: "   " })]);
  assertEquals(rules[0].rationale, null);
});

Deno.test("aucun aliment -> aucune règle, aucun conflit", () => {
  const { rules, conflicts } = deriveFoodRules([]);
  assertEquals(rules.length, 0);
  assertEquals(conflicts.length, 0);
});

Deno.test("SORTIE DÉTERMINISTE: l'ordre d'entrée ne change pas l'ordre de sortie", () => {
  // Sans ça, l'aperçu et le diff de publication montreraient des mouvements
  // fantômes sur un brouillon que le coach n'a pas touché — l'ordre de lecture
  // en base n'est garanti par rien.
  const a = deriveFoodRules([
    item({ label: "Broccoli", food_group_ref: "cruciferous_veg" as FoodGroupRef }),
    item({ label: "Salmon" }),
    item({ label: "Oats", food_group_ref: "whole_grain" as FoodGroupRef }),
  ]);
  const b = deriveFoodRules([
    item({ label: "Oats", food_group_ref: "whole_grain" as FoodGroupRef }),
    item({ label: "Salmon" }),
    item({ label: "Broccoli", food_group_ref: "cruciferous_veg" as FoodGroupRef }),
  ]);
  assertEquals(
    a.rules.map((r) => r.food_group_ref),
    b.rules.map((r) => r.food_group_ref),
  );
  assertEquals(a.rules.map((r) => r.food_group_ref), [
    "cruciferous_veg",
    "fatty_fish",
    "whole_grain",
  ]);
});

// ---------------------------------------------------------------------------
// 2. LE BOUT DE LA CHAÎNE — le vrai compilateur, le vrai validateur
// ---------------------------------------------------------------------------

Deno.test("CONTRAT: ce que la dérivation produit passe le compilateur ET validateDraftCommitment", () => {
  const { rules } = deriveFoodRules([
    item({ label: "Salmon", stance: "encouraged" }),
    item({ label: "Broccoli", food_group_ref: "cruciferous_veg" as FoodGroupRef, stance: "encouraged" }),
    item({ label: "Cola", food_group_ref: "sweetened_beverage" as FoodGroupRef, stance: "discouraged" }),
    item({ label: "Crisps", food_group_ref: "fried_food" as FoodGroupRef, stance: "excluded" }),
  ]);

  // Garde-fou: si l'échantillon cesse de couvrir les 3 postures, le test
  // principal ne prouverait plus rien tout en restant vert.
  const stances = new Set(rules.map((r) => r.stance));
  assert(stances.has("encouraged"), "l'échantillon doit couvrir encouraged");
  assert(stances.has("discouraged"), "l'échantillon doit couvrir discouraged");
  assert(stances.has("excluded"), "l'échantillon doit couvrir excluded");

  const compiled = compileProtocol(
    {
      coachId: "coach-1",
      contentLocale: "en-GB",
      foodRules: rules,
      timingRules: [],
      terms: [],
    },
    null,
  );
  assert(compiled.length > 0, "la dérivation doit produire des engagements");

  for (const line of compiled) {
    const errors = validateDraftCommitment(line as unknown as Record<string, unknown>);
    assertEquals(
      errors,
      [],
      `ligne refusée par le validateur: ${JSON.stringify(line)} -> ${JSON.stringify(errors)}`,
    );
  }
});

Deno.test("un groupe en conflit ne produit AUCUN engagement en bout de chaîne", () => {
  // La preuve que la nuance ne remonte pas: elle doit être invisible pour
  // l'élève, pas seulement absente de `rules`.
  const { rules } = deriveFoodRules([
    item({ label: "Salmon", stance: "encouraged" }),
    item({ label: "Tuna", stance: "excluded" }),
  ]);
  const compiled = compileProtocol(
    { coachId: "c", contentLocale: "en-GB", foodRules: rules, timingRules: [], terms: [] },
    null,
  );
  assertEquals(compiled.length, 0);
});

// ---------------------------------------------------------------------------
// 3. LA FRÉQUENCE
// ---------------------------------------------------------------------------

Deno.test("la fréquence par défaut emprunte son unité à l'AXE, pas à une opinion", () => {
  // Le cas qui a motivé le lot: une huile ne se règle pas comme une carotte.
  const oil = defaultFrequency({ count_axis: "volume", typical_amount: 15 }, "discouraged");
  assertEquals(oil.template, "amount_per_period");
  assert(oil.template === "amount_per_period");
  assertEquals(oil.amount_unit, "ml");
  assertEquals(oil.amount, 15);

  const carrot = defaultFrequency({ count_axis: "portion", typical_amount: 80 }, "encouraged");
  assert(carrot.template === "amount_per_period");
  assertEquals(carrot.amount_unit, "portion");

  const egg = defaultFrequency({ count_axis: "count", typical_amount: 50 }, "encouraged");
  assert(egg.template === "amount_per_period");
  assertEquals(egg.amount_unit, "unit");
});

Deno.test("la direction par défaut suit la posture, et rien d'autre", () => {
  const up = defaultFrequency({ count_axis: "portion", typical_amount: null }, "encouraged");
  assert(up.template === "amount_per_period");
  assertEquals(up.direction, "at_least");

  for (const stance of ["discouraged", "excluded"] as const) {
    const down = defaultFrequency({ count_axis: "portion", typical_amount: null }, stance);
    assert(down.template === "amount_per_period");
    assertEquals(down.direction, "at_most");
  }
});

Deno.test("chaque gabarit rend un descripteur nommé", () => {
  const cases: readonly FrequencyRule[] = [
    { template: "amount_per_period", direction: "at_most", amount: 30, amount_unit: "ml", period: "week" },
    { template: "every_meal" },
    { template: "not_after", cutoff_local: "21:00" },
    { template: "at_slot", slot_key: "breakfast" },
  ];
  assertEquals(cases.map((c) => frequencyDescriptor(c).kind), [
    "amount",
    "every_meal",
    "not_after",
    "at_slot",
  ]);
});

// ---------------------------------------------------------------------------
// 4. L'ALLER-RETOUR BASE
// ---------------------------------------------------------------------------

Deno.test("aller-retour ligne <-> règle, sur les quatre gabarits", () => {
  const cases: readonly FrequencyRule[] = [
    { template: "amount_per_period", direction: "at_least", amount: 3, amount_unit: "portion", period: "day" },
    { template: "every_meal" },
    { template: "not_after", cutoff_local: "21:00" },
    { template: "at_slot", slot_key: "breakfast" },
  ];
  for (const rule of cases) {
    assertEquals(frequencyFromRow(frequencyToRow(rule)), rule);
  }
});

Deno.test("CHANGER DE GABARIT EFFACE LES TROUS DU PRÉCÉDENT", () => {
  // La CHECK `coach_food_items_slots_match_frequency` REFUSE une ligne dont un
  // trou traîne. C'est le bon comportement de la base — et un bug ici: passer
  // d'une règle horaire à une règle de quantité doit effacer l'heure, sinon
  // l'écriture échoue et le coach perd son geste sans comprendre pourquoi.
  const row = frequencyToRow({
    template: "amount_per_period",
    direction: "at_most",
    amount: 30,
    amount_unit: "ml",
    period: "week",
  });
  assertEquals(row.cutoff_local, null);
  assertEquals(row.slot_key, null);

  const hourly = frequencyToRow({ template: "not_after", cutoff_local: "21:00" });
  assertEquals(hourly.direction, null);
  assertEquals(hourly.amount, null);
  assertEquals(hourly.amount_unit, null);
  assertEquals(hourly.period, null);
  assertEquals(hourly.slot_key, null);
});

Deno.test("pas de règle -> toutes les colonnes de fréquence à null", () => {
  const row = frequencyToRow(null);
  for (const [key, value] of Object.entries(row)) {
    assertEquals(value, null, `${key} devrait être null`);
  }
  assertEquals(frequencyFromRow(row), null);
});
