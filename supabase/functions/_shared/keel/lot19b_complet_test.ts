// ============================================================================
// LOT L19b — `complet` N'EST PAS UN MODIFICATEUR DE PRÉPARATION.
//
// ── CE QUE CE FICHIER PROTÈGE ──────────────────────────────────────────────
// `PREPARATION_MODIFIERS` est une liste FERMÉE, et son test d'admission est
// écrit dans l'en-tête du module: « la réduction change-t-elle l'aliment ?
// Si oui, elle n'entre pas. »
//
// `complet` / `complete` / `complets` / `completes` y étaient entrés par
// SYMÉTRIE avec l'anglais `whole`. La symétrie est fausse, et c'est une
// propriété de la langue: en anglais le mot du complet est SOUDÉ au nom
// (`wholemeal bread`), en français c'est un adjectif SÉPARÉ — donc le raffiné
// EST littéralement le complet moins ce mot. Retirer `complet` ne réduit pas
// une forme: il change `whole_grain` en `refined_grain`, en silence.
//
// Mesuré le 2026-08-22 sur les 182 plans réels: `pain complet grillé`
// (7 occurrences) atteignait `white_bread`.
//
// ── ⛔ CE TEST EST ROUGE À `HEAD`, ET C'EST ÉCRIT EXPRÈS ────────────────────
// Le correctif vit dans `food_composition.ts`, un fichier `M` porteur de
// +370 lignes d'UNE AUTRE SESSION au moment du lot: il ne pouvait pas être
// commité sans emporter le travail de quelqu'un d'autre (mur §⑨ n° 15 du plan
// `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`). Le correctif est donc
// VIVANT dans l'arbre de travail — c'est lui que `functions serve` exécute et
// c'est sur lui que la mesure a été faite — mais il n'est pas à `HEAD`.
//
// ⇒ MESURÉ le 2026-08-22 contre le module de `HEAD`: **3 cas passent, 3
// échouent** — les trois qui portent le correctif — et chacun le DIT dans son
// message. Le type-check, lui, passe des deux côtés (voir la constante
// ci-dessous): un rouge de type aurait emporté le banc de tous les autres lots.
// C'est le comportement voulu: un test qui passerait quand même serait un test
// qui ne tient rien. Le jour où `food_composition.ts` est commité avec ses
// quatre lignes en moins, ce fichier devient vert et le reste.
// ============================================================================

import { assertEquals } from "jsr:@std/assert@1";

import {
  buildCompositionIndex,
  type CompositionRef,
  resolveIngredient,
} from "./food_composition.ts";

const POURQUOI_ROUGE =
  " ⛔ Si ce cas échoue depuis un clone: le correctif L19b (retrait de " +
  "`complet`/`complete`/`complets`/`completes` de PREPARATION_MODIFIERS, " +
  "food_composition.ts) n'est pas à HEAD. Voir l'en-tête de ce fichier.";

// ⛔ DEUX CHAMPS DE `CompositionRef` N'EXISTENT PAS À `HEAD`. Mesuré le
// 2026-08-22: le type de `HEAD` porte 17 champs, celui de l'arbre de travail
// en porte 19 — `source` et `condimentGrams` arrivent avec les +370 lignes non
// commitées du sas (lot 18), qui vivent dans le MÊME fichier.
//
// Un littéral qui les nomme n'existe pas à `HEAD` (TS2353); un littéral qui les
// omet ne compile pas dans l'arbre (TS2322). Et `deno test` type-vérifie tout
// le répertoire d'un coup: une erreur de type ici rendrait ROUGE le banc de
// TOUS les autres lots, pas seulement celui-ci.
//
// L'ÉTALEMENT est la seule forme qui tient les deux mondes: TypeScript ne fait
// pas de contrôle de propriété excédentaire sur les propriétés étalées. Les
// champs sont fournis quand le type les réclame, et simplement ignorés quand il
// ne les connaît pas encore.
// ⚠️ À SUPPRIMER le jour où `food_composition.ts` est commité: ça ne sert qu'à
// traverser le mur, pas à décrire un aliment.
const CHAMPS_QUE_HEAD_NE_CONNAIT_PAS_ENCORE = {
  source: "manual",
  condimentGrams: null,
} as const;

function ref(slug: string, over: Partial<CompositionRef> = {}): CompositionRef {
  return {
    ...CHAMPS_QUE_HEAD_NE_CONNAIT_PAS_ENCORE,
    slug,
    foodGroupRef: "refined_grain",
    label: slug,
    energyKcal: 270,
    proteinG: null,
    carbsG: null,
    fatG: null,
    fiberG: null,
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: false,
    folateSource: false,
    yieldClass: "neutral",
    yieldFactor: null,
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    ...over,
  };
}

// Un décor MINIMAL et FERMÉ: le complet, le raffiné, et l'alias français du
// complet. C'est exactement la configuration où la réduction décide seule.
const REFS: CompositionRef[] = [
  ref("wholemeal_bread", { foodGroupRef: "whole_grain", energyKcal: 262, unitGrams: 40 }),
  ref("white_bread", { foodGroupRef: "refined_grain", energyKcal: 278, unitGrams: 35 }),
  ref("brown_rice", { foodGroupRef: "whole_grain", energyKcal: 350 }),
  ref("white_rice", { foodGroupRef: "refined_grain", energyKcal: 352 }),
  ref("wholewheat_pasta", { foodGroupRef: "whole_grain", energyKcal: 353 }),
  ref("white_pasta", { foodGroupRef: "refined_grain", energyKcal: 336 }),
  ref("tortilla_wholemeal", { foodGroupRef: "whole_grain", energyKcal: 300 }),
  ref("tortilla_wrap", { foodGroupRef: "refined_grain", energyKcal: 305 }),
];
const ALIASES = [
  { alias: "pain complet", slug: "wholemeal_bread" },
  { alias: "pain", slug: "white_bread" },
  { alias: "riz complet", slug: "brown_rice" },
  { alias: "riz", slug: "white_rice" },
  { alias: "pates completes", slug: "wholewheat_pasta" },
  { alias: "pates", slug: "white_pasta" },
  { alias: "tortilla complete", slug: "tortilla_wholemeal" },
  { alias: "tortilla", slug: "tortilla_wrap" },
];
const index = buildCompositionIndex(REFS, ALIASES);

Deno.test("L19b — `pain complet grillé` atteint le COMPLET, pas le blanc", () => {
  // `grillé` EST un modificateur légitime (il ne change pas l'aliment): la
  // forme réduite doit être `pain complet`, et s'arrêter là.
  const got = resolveIngredient(index, "pain complet grillé");
  assertEquals(
    got?.slug,
    "wholemeal_bread",
    "« pain complet grillé » doit atteindre le pain COMPLET." + POURQUOI_ROUGE,
  );
  assertEquals(got?.foodGroupRef, "whole_grain");
});

Deno.test("L19b — `riz complet cuit` ne retombe pas sur le riz blanc", () => {
  // Second porteur, autre aliment, même mécanique: sans le retrait, la chaîne
  // « modificateur `cuit` puis modificateur `complet` » rend `riz`.
  const got = resolveIngredient(index, "riz complet cuit");
  assertEquals(
    got?.slug,
    "brown_rice",
    "« riz complet cuit » doit atteindre le riz COMPLET." + POURQUOI_ROUGE,
  );
});

Deno.test("L19b — les QUATRE graphies sont armées, pas seulement `complet`", () => {
  // ⛔ MESURÉ SUR LE BANC DE MUTATION: avec seulement les deux cas ci-dessus,
  // remettre `completes` SEUL dans la liste ne faisait rougir RIEN. Un mot de
  // la liste qu'aucun cas ne touche est un mot qu'on peut réintroduire sans
  // que le dépôt le dise — c'est-à-dire une garde à trois quarts armée, qui
  // ressemble à une garde armée. Une graphie, un cas.
  //
  // `complete` (féminin singulier)
  assertEquals(
    resolveIngredient(index, "tortilla complète grillée")?.slug,
    "tortilla_wholemeal",
    "graphie `complete`." + POURQUOI_ROUGE,
  );
  // `completes` (féminin pluriel)
  assertEquals(
    resolveIngredient(index, "pâtes complètes cuites")?.slug,
    "wholewheat_pasta",
    "graphie `completes`." + POURQUOI_ROUGE,
  );
  // `complets` (masculin pluriel) — la réduction du pluriel français ramène
  // « pains complets » sur « pain complet », mais SEULEMENT si `complets` ne
  // s'est pas fait manger avant par le retrait des modificateurs.
  assertEquals(
    resolveIngredient(index, "pains complets")?.slug,
    "wholemeal_bread",
    "graphie `complets`." + POURQUOI_ROUGE,
  );
});

Deno.test("L19b — l'abstention est le prix ASSUMÉ du retrait", () => {
  // ⚠️ CE CAS EST LA CONTREPARTIE, et il doit rester vert dans les deux
  // mondes: une forme en `complet` que la table n'énumère pas ne résout plus
  // RIEN. Le module s'abstient plutôt que de rendre le RAFFINÉ — c'est son
  // arbitrage fondateur, et c'est ce que la migration d'alias vient combler,
  // nom par nom.
  assertEquals(resolveIngredient(index, "pain de mie complet"), null);
});

Deno.test("L19b — les modificateurs LÉGITIMES sont intacts", () => {
  // La liste reste une liste: on n'a pas désarmé la réduction elle-même.
  assertEquals(resolveIngredient(index, "pain grillé")?.slug, "white_bread");
  assertEquals(resolveIngredient(index, "riz cuit")?.slug, "white_rice");
});

Deno.test("L19b — un alias ne peut pas battre un slug (le défaut des 19 morts)", () => {
  // ⛔ LA RÈGLE QUI REND 19 ALIAS MORTS, épinglée ici pour qu'un jour où
  // quelqu'un inverse l'ordre de consultation « pour que les alias curés
  // gagnent », le dépôt le dise. `resolveIngredient` interroge `bySlug` AVANT
  // `byAlias`, forme par forme: un alias dont le texte est lui-même un slug ne
  // se déclenche JAMAIS.
  //
  // C'est pour ça que la migration `20260822113000_lot19b_les_alias_verifies`
  // les RETIRE au lieu de les corriger — et c'est pour ça que `prune` et
  // `pate` sont irréparables par un alias.
  const piege = buildCompositionIndex(REFS, [
    { alias: "white_bread", slug: "wholemeal_bread" }, // jamais lu
    { alias: "white bread", slug: "wholemeal_bread" }, // jamais lu non plus
  ]);
  assertEquals(resolveIngredient(piege, "white bread")?.slug, "white_bread");
});
