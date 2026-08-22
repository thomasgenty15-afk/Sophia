// LES CONSTANTES ÉPINGLÉES — ce fichier ne teste AUCUN comportement, et c'est
// exprès.
//
// ⛔ CE QU'IL PROTÈGE, ET POURQUOI CE N'EST PAS UNE REDONDANCE. Un test qui
// écrit `assertEquals(calcul(x), x * MA_CONSTANTE)` **importe** la constante et
// recalcule l'attendu avec elle: changer sa valeur change les DEUX côtés de
// l'égalité, et le test reste VERT. C'est la cicatrice mesurée du dépôt
// — « un test paramétré par sa propre constante reste vert quand on change la
// constante » —, et `mouth_anchor_test.ts` la porte en entier: 35 tests, 0
// échec en 31 ms, et `COMPOSED_DISH_MEAL_SHARE` passé de 0,42 à 1,0 n'en fait
// rougir aucun.
//
// UN ÉPINGLAGE EST DONC LA SEULE ASSERTION QUI NE PEUT PAS ÊTRE COMPLICE:
// la constante d'un côté, un LITTÉRAL de l'autre. Elle ne dit pas que la valeur
// est juste — elle dit qu'on ne la change pas SANS LE SAVOIR.
//
// ⚠️ AUCUNE DE CES VALEURS N'EST DÉFENDUE ICI. Les changer est permis; ce qui
// est interdit est de les changer en silence. Une valeur qui bouge fait rougir
// UNE ligne, et cette ligne nomme le lot qui devait la déplacer.
//
// ⛔ `KEEL_MINOR_AGE` EST ÉPINGLÉE, PAS DÉFENDUE — et la différence compte:
// épingler l'âge du mineur n'affaiblit aucun plancher, ça rend son
// déplacement VISIBLE. C'est le seul rapport de ce fichier à la sécurité.
//
// La règle de dépôt qui EXIGE ces épinglages vit dans
// `constant_pinning_gate_test.ts`; ce fichier-ci en est la première fournée.

import { assertEquals } from "jsr:@std/assert@1";

import {
  DENSITY_CEILING_DEFAULT,
  DENSITY_CEILING_FAT_LOSS,
} from "./meal_envelope.ts";
import { KEEL_MINOR_AGE } from "./student_age.ts";
import { BOX_FACTOR_MAX, BOX_FACTOR_MIN } from "./household_portions.ts";
import { MAX_KG_PER_WEEK, PACE_WARN_UP_KG_PER_WEEK } from "./weight_pace.ts";
import {
  MIN_RESOLUTION_FOR_VERDICT,
  PER_PORTION_PROTEIN_G,
} from "./meal_verdict.ts";
import { FILL_REQUEST_CAP } from "./composition_fill.ts";
import {
  ANCHOR_FACTOR_MAX,
  ANCHOR_FACTOR_MIN,
  COMPOSED_DISH_KCAL,
  COMPOSED_DISH_MEAL_SHARE,
  MEAL_COMPONENT_KCAL,
  MEAL_MAX_GRAMS_PER_KG,
  SLOT_DAY_WEIGHT,
} from "./mouth_anchor.ts";

// ── LE PLAFOND DE DENSITÉ (`meal_envelope.ts`) ───────────────────────────────
// Déplacées par les lots `L38` et `L9bis`. Une densité plafond qui monte
// laisse passer une assiette plus dense, dans le sens qui nourrit trop.
Deno.test("épinglage — DENSITY_CEILING_FAT_LOSS vaut 1,3 kcal/g", () => {
  assertEquals(DENSITY_CEILING_FAT_LOSS, 1.3);
});

Deno.test("épinglage — DENSITY_CEILING_DEFAULT vaut 1,8 kcal/g", () => {
  assertEquals(DENSITY_CEILING_DEFAULT, 1.8);
});

// ── L'ÂGE DU MINEUR (`student_age.ts`) ───────────────────────────────────────
// Lue par `S3` et `S4`. ⛔ L'épingler est autorisé; la CHANGER ne l'est pas.
Deno.test("épinglage — KEEL_MINOR_AGE vaut 18 ans", () => {
  assertEquals(KEEL_MINOR_AGE, 18);
});

// ── LES BORNES DU CONTENANT (`household_portions.ts`) ────────────────────────
// Déplacées par `L6′`. Elles bornent le facteur qui remplit un bac: une borne
// haute qui monte sert davantage à quelqu'un qui n'a rien demandé.
Deno.test("épinglage — BOX_FACTOR_MIN vaut 0,70", () => {
  assertEquals(BOX_FACTOR_MIN, 0.70);
});

Deno.test("épinglage — BOX_FACTOR_MAX vaut 1,25", () => {
  assertEquals(BOX_FACTOR_MAX, 1.25);
});

// ── LE RYTHME DE POIDS (`weight_pace.ts`) ────────────────────────────────────
// La question `L37` porte sur ces deux-là. `MAX_KG_PER_WEEK` est un REFUS:
// au-delà, le rythme demandé n'est pas exécuté.
Deno.test("épinglage — PACE_WARN_UP_KG_PER_WEEK vaut 0,5 kg/semaine", () => {
  assertEquals(PACE_WARN_UP_KG_PER_WEEK, 0.5);
});

Deno.test("épinglage — MAX_KG_PER_WEEK vaut 1,0 kg/semaine", () => {
  assertEquals(MAX_KG_PER_WEEK, 1.0);
});

// ── LE VERDICT DU REPAS (`meal_verdict.ts`) ──────────────────────────────────
// Déplacées par `L9bis`. `MIN_RESOLUTION_FOR_VERDICT` décide de SE TAIRE:
// la baisser fait parler la porte sur une journée qu'elle n'a pas su lire.
Deno.test("épinglage — MIN_RESOLUTION_FOR_VERDICT vaut 0,8", () => {
  assertEquals(MIN_RESOLUTION_FOR_VERDICT, 0.8);
});

Deno.test("épinglage — PER_PORTION_PROTEIN_G vaut 20 g", () => {
  assertEquals(PER_PORTION_PROTEIN_G, 20);
});

// ── LE SAS DE COMPOSITION (`composition_fill.ts`) ────────────────────────────
// Déplacée par `L18b`. C'est un PLAFOND D'APPELS: le monter coûte de l'argent
// à chaque plan, et le silence est le même dans les deux sens.
Deno.test("épinglage — FILL_REQUEST_CAP vaut 24 demandes", () => {
  assertEquals(FILL_REQUEST_CAP, 24);
});

// ── L'ANCRAGE DE LA BOUCHE (`mouth_anchor.ts`) ───────────────────────────────
// ⛔ LE CŒUR DE LA CICATRICE. `mouth_anchor_test.ts` importe les six et
// recalcule ses attendus avec: aucune de ces six lignes n'a d'équivalent
// là-bas, et c'est la raison d'être de ce fichier.
Deno.test("épinglage — ANCHOR_FACTOR_MIN vaut 0,60", () => {
  assertEquals(ANCHOR_FACTOR_MIN, 0.60);
});

Deno.test("épinglage — ANCHOR_FACTOR_MAX vaut 3,00", () => {
  assertEquals(ANCHOR_FACTOR_MAX, 3.00);
});

Deno.test("épinglage — MEAL_MAX_GRAMS_PER_KG vaut 8 g/kg", () => {
  assertEquals(MEAL_MAX_GRAMS_PER_KG, 8);
});

Deno.test("épinglage — COMPOSED_DISH_MEAL_SHARE vaut 0,42", () => {
  assertEquals(COMPOSED_DISH_MEAL_SHARE, 0.42);
});

Deno.test("épinglage — COMPOSED_DISH_KCAL vaut 300 kcal", () => {
  assertEquals(COMPOSED_DISH_KCAL, 300);
});

// ⚠️ CES DEUX-LÀ SONT DES `Record`, PAS DES SCALAIRES. `assertEquals(X, 42)`
// ne s'y applique pas: on épingle L'OBJET ENTIER, sinon une clé AJOUTÉE
// passerait sous le radar — et une clé ajoutée à `MEAL_COMPONENT_KCAL` change
// la part du plat, donc l'assiette.
Deno.test("épinglage — MEAL_COMPONENT_KCAL, l'objet ENTIER", () => {
  assertEquals(MEAL_COMPONENT_KCAL, {
    dessert: 120,
    cheese: 120,
    bread: 80,
  });
});

Deno.test("épinglage — SLOT_DAY_WEIGHT, l'objet ENTIER", () => {
  assertEquals(SLOT_DAY_WEIGHT, {
    breakfast: 0.25,
    lunch: 0.40,
    dinner: 0.35,
  });
});
