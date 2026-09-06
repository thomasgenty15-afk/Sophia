// KEEL — LES CONTOURNEMENTS DE LA GARDE ALLERGIQUE, ÉCRITS UNE FOIS POUR TOUTES.
//
// Ce fichier vient d'un audit externe (2026-09-05) qui a rendu douze phrases
// adversariales au vrai `parseGeneratedMeal` et à ses contraintes issues de
// `householdAllergyConstraints`. SIX étaient acceptées, dont deux observées sur
// un plan réellement servi. Les suites d'alors étaient vertes: 5 562 tests
// backend, 553 tests frontend, et pas une ligne ne tenait ces phrases.
//
// Deux causes, deux corrections (2026-09-06), toutes deux dans
// `forbidden_matcher.ts`:
//
//   1. LA LIGATURE. `œuf` n'est pas `oeuf` pour NFD. Le catalogue ne connaît
//      que la forme ASCII, donc « des œufs » passait. Un plan réel (A06-r2) a
//      servi une préparation aux `œufs` à Tom, allergique médical, avec le
//      groupe `eggs` déclaré sur l'ingrédient.
//   2. « SANS » PRIS À L'ENVERS. La règle blanchissait un terme suivi de
//      « sans », c'est-à-dire l'inverse de ce que la langue fait. « lait sans
//      lactose » était conservé pour une contrainte `milk` — or un lait
//      délactosé porte toujours la protéine qui déclenche l'allergie.
//
// ⚠️ CE FICHIER A BESOIN DE SES CAS QUI PASSENT autant que de ses cas qui
// mordent. Une garde qui refuse tout ressemble à une garde qui marche: les
// quatre cas verts en bas (« pain sans gluten », « milk-free », « boisson de
// riz », « evite les oeufs ») sont ce qui distingue un correctif d'un mur.
//
// N'ajoute JAMAIS une forme ici sans l'ajouter au catalogue ou à la
// normalisation: ce fichier constate, il ne répare pas.

import { assertEquals } from "jsr:@std/assert@1";

import {
  findForbiddenMatches,
  type ForbiddenTerm,
  normalizeForMatch,
} from "./forbidden_matcher.ts";

const MILK: ForbiddenTerm[] = [
  { ruleId: "milk", token: "lait" },
  { ruleId: "milk", token: "milk" },
];
const EGG: ForbiddenTerm[] = [{ ruleId: "egg", token: "oeuf" }];
const GLUTEN: ForbiddenTerm[] = [{ ruleId: "gluten", token: "gluten" }];
const PEANUT: ForbiddenTerm[] = [{ ruleId: "peanut", token: "cacahuete" }];

function bites(text: string, terms: ForbiddenTerm[]): boolean {
  return findForbiddenMatches(text, terms).length > 0;
}

// ── CE QUI DOIT MORDRE ─────────────────────────────────────────────────────

Deno.test("ADVERSARIAL ① la ligature « œ » est la même lettre que « oe »", () => {
  assertEquals(bites("des œufs au plat", EGG), true);
  assertEquals(bites("Œufs brouillés et pain", EGG), true);
  // Le contrôle: la forme ASCII n'a jamais cessé de mordre.
  assertEquals(bites("des oeufs au plat", EGG), true);
});

Deno.test("ADVERSARIAL ② « lait sans lactose » reste du lait", () => {
  assertEquals(bites("lait sans lactose", MILK), true);
  assertEquals(bites("lait sans lactose de vache", MILK), true);
  // Le contrôle: le lait nu mordait déjà.
  assertEquals(bites("lait de vache", MILK), true);
});

Deno.test("ADVERSARIAL ③ la normalisation déplie les trois ligatures", () => {
  assertEquals(normalizeForMatch("Œufs"), "oeufs");
  assertEquals(normalizeForMatch("ex æquo"), "ex aequo");
  assertEquals(normalizeForMatch("Weißbrot"), "weissbrot");
  // Et ne casse pas ce qu'elle faisait déjà.
  assertEquals(normalizeForMatch("PROTÉINE"), "proteine");
});

// ── CE QUI DOIT PASSER, ET SANS QUOI LE CORRECTIF EST UN MUR ───────────────

Deno.test("ADVERSARIAL ④ « sans X » ne mord pas X — la direction légitime", () => {
  assertEquals(bites("pain sans gluten", GLUTEN), false);
  assertEquals(bites("Prends un plat sans cacahuète.", PEANUT), false);
});

Deno.test("ADVERSARIAL ⑤ « X-free » ne mord pas X — la forme anglaise", () => {
  assertEquals(bites("a milk-free sauce", MILK), false);
  assertEquals(bites("Look for a peanut-free label.", PEANUT), false);
});

Deno.test("ADVERSARIAL ⑥ l'éviction et l'allergie nommée ne sont pas des mentions", () => {
  assertEquals(bites("evite les oeufs", EGG), false);
  assertEquals(bites("she has a milk allergy", MILK), false);
});

Deno.test("ADVERSARIAL ⑦ un substitut nommé autrement n'est pas l'allergène", () => {
  assertEquals(bites("boisson de riz", MILK), false);
  assertEquals(bites("boisson d'avoine", MILK), false);
});

// ── LA LECTURE ABSOLUE: aucune exception ne survit à `allowNegatedMentions` ──

Deno.test("ADVERSARIAL ⑧ en mode audit, toute mention compte", () => {
  const opts = { allowNegatedMentions: false } as const;
  assertEquals(findForbiddenMatches("pain sans gluten", GLUTEN, opts).length, 1);
  assertEquals(findForbiddenMatches("a milk-free sauce", MILK, opts).length, 1);
  assertEquals(findForbiddenMatches("des œufs", EGG, opts).length, 1);
});
