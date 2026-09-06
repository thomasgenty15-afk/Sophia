// LA CEINTURE DES `food.exclude`.
//
//   1. QUE « LAIT » TROUVE « LAITUE ». La cicatrice chiffrée du dépôt, 12 faux
//      positifs sur 12. C'est le moteur qui la tient — encore faut-il l'appeler.
//   2. QUE LA NÉGATION D'UN PLAT SOIT IGNORÉE. Un plat « poêlée SANS poisson »
//      qui mordrait ferait retirer une bouche d'un plat fait pour elle.
//   3. QUE L'EXCLUSION D'UNE BOUCHE S'APPLIQUE À LA TABLE. C'est le défaut
//      d'AVANT l'attribution: une phrase sur un enfant retirait le poisson à
//      tout le monde.
//   4. QUE LES PRÉPARATIONS SOIENT OUBLIÉES. En cuisine par lots, la protéine
//      n'est PAS dans le plat.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  dishBitesExclusion,
  exclusionRetryInstruction,
  exclusionTermsFor,
} from "./food_exclusion_belt.ts";
import type { RetainedItem } from "./retained_item.ts";

const TOM = "member:7b17ae2c-dd85-4d27-b8f2-4c52dbfc0828";

function item(text: string, subject: string): RetainedItem {
  return {
    kind: "food.exclude", scope: "next_plan", subject, text, value: null,
    source: "draft_note", at: "2026-09-01", item: "", confidence: null,
    quote: text,
  } as unknown as RetainedItem;
}
function dish(over: Record<string, unknown> = {}) {
  return {
    title: "Saumon, aubergine et haricots verts",
    method: "Cuire le saumon au four.",
    ingredients: [{ term: "saumon" }, { term: "aubergine" }],
    ...over,
  };
}
function bite(terms: ReturnType<typeof exclusionTermsFor>, over = {}, uses: any[] = [], preps = new Map()) {
  return dishBitesExclusion({ dish: dish(over) as never, uses, preparationById: preps, terms, surface: "ingredients" });
}

// ===========================================================================
// 1. LE CAS QUI PASSE, ET LE CAS QUI NE MORD PAS
// ===========================================================================

Deno.test("une exclusion de bouche MORD son plat", () => {
  const terms = exclusionTermsFor({ items: [item("Mon fils n'aime pas le saumon", TOM)], subject: TOM });
  const out = bite(terms);
  assertEquals(out.matched !== null, true, "l'exclusion ne mord pas: elle reste inerte");
  assertEquals(out.because, "Mon fils n'aime pas le saumon", "la raison ne se dit plus");
});

Deno.test("un plat sans le mot ne mord pas", () => {
  const terms = exclusionTermsFor({ items: [item("plus de poulet", TOM)], subject: TOM });
  assertEquals(bite(terms).matched, null);
});

// ===========================================================================
// 2. ⛔ LES DEUX PIÈGES DU MATCHER
// ===========================================================================

Deno.test("⛔ « lait » NE TROUVE PAS « laitue »", () => {
  const terms = exclusionTermsFor({ items: [item("plus de lait", TOM)], subject: TOM });
  const out = bite(terms, { title: "Salade de laitue et tomates", method: "", ingredients: [{ term: "laitue" }] });
  assertEquals(out.matched, null, "« lait » a mordu dans « laitue »");
  // Et le cas qui passe: le vrai lait mord.
  const real = bite(terms, { title: "Riz au lait", method: "", ingredients: [{ term: "lait" }] });
  assertEquals(real.matched !== null, true);
});

Deno.test("⛔ MODE CEINTURE — « sans poisson » dans un plat NE MORD PAS", () => {
  // C'est l'inverse de `rule_question.ts`, qui lit des RÈGLES écrites au
  // négatif. Ici on lit un PLAT, où une négation veut dire ce qu'elle dit.
  const terms = exclusionTermsFor({ items: [item("plus de poisson", TOM)], subject: TOM });
  const out = bite(terms, {
    title: "Poêlée de légumes", method: "Poêlée sans poisson.", ingredients: [{ term: "courgette" }],
  });
  assertEquals(out.matched, null, "une négation du plat a mordu");
});

// ===========================================================================
// 3. ⛔ LE SUJET DÉCIDE — c'est le défaut d'avant l'attribution
// ===========================================================================

Deno.test("⛔ L'EXCLUSION D'UNE BOUCHE NE SORT PAS POUR LE FOYER", () => {
  const items = [item("Mon fils n'aime pas le saumon", TOM)];
  assertEquals(exclusionTermsFor({ items, subject: "household" }).length, 0,
    "l'exclusion d'un enfant a été appliquée à la table entière");
  assert(exclusionTermsFor({ items, subject: TOM }).length > 0);
});

Deno.test("⛔ L'EXTRACTEUR REND DU BRUIT, et c'est la SURFACE qui protège", () => {
  // Mesuré: `termsOfInstruction("Mon fils n'aime pas le poisson")` rend
  // ["fil", "poisson"] — le `fil` vient de « fils », dont le pluriel est
  // déposé. Le bruit est inhérent à l'extracteur; ce qui empêche un faux
  // retrait, c'est de ne lire que les `term` DÉCLARÉS.
  const terms = exclusionTermsFor({ items: [item("Mon fils n'aime pas le poisson", TOM)], subject: TOM });
  assert(terms.some((t) => t.token === "fil"), "le bruit a disparu: ce test ne mesure plus rien");

  // Un plat dont la PROSE contient le bruit ne mord pas en surface `ingredients`…
  const proseOnly = {
    dish: { title: "Filet de dinde au fil du marché", method: "", ingredients: [{ term: "dinde" }] },
    uses: [], preparationById: new Map(), terms,
  };
  assertEquals(dishBitesExclusion({ ...proseOnly, surface: "ingredients" } as never).matched, null);
  // …et le vrai aliment mord toujours.
  assertEquals(
    dishBitesExclusion({
      dish: { title: "Assiette", method: "", ingredients: [{ term: "poisson blanc" }] },
      uses: [], preparationById: new Map(), terms, surface: "ingredients",
    } as never).matched !== null,
    true,
  );
});

Deno.test("un sujet vide ou une liste vide ne rendent rien", () => {
  assertEquals(exclusionTermsFor({ items: [], subject: TOM }).length, 0);
  assertEquals(exclusionTermsFor({ items: [item("plus de riz", TOM)], subject: "" }).length, 0);
});

// ===========================================================================
// 4. ⛔ LES PRÉPARATIONS SONT PLIÉES
// ===========================================================================

Deno.test("⛔ LA PROTÉINE EST DANS LA PRÉPARATION, et elle mord quand même", () => {
  const terms = exclusionTermsFor({ items: [item("plus de poulet", TOM)], subject: TOM });
  const preps = new Map([["p1", {
    id: "p1", title: "Poulet rôti du dimanche", method: "Rôtir.", ingredients: [{ term: "cuisses de poulet" }],
  }]]);
  const out = dishBitesExclusion({
    dish: { title: "Assiette du mardi", method: "Réchauffer.", ingredients: [{ term: "riz" }] },
    uses: [{ preparationId: "p1" }],
    preparationById: preps as never,
    terms,
    surface: "ingredients",
  });
  assertEquals(out.matched !== null, true, "la préparation n'est pas pliée: la protéine échappe");
  assertEquals(out.preparationIds, ["p1"]);
});

// ===========================================================================
// 5. LA RELANCE
// ===========================================================================

Deno.test("⛔ LA RELANCE NOMME LE PLAT, ET INTERDIT DE RACCOURCIR LE PLAN", () => {
  const out = exclusionRetryInstruction([
    { dish: "Poulet fajita", matched: "poulet", because: "Je n'aime pas le poulet" },
  ])!;
  assert(out.includes("Poulet fajita"), "le plat n'est pas nommé: tout le plan serait recomposé");
  assert(out.includes("Je n'aime pas le poulet"));
  assert(/do NOT shorten the plan/i.test(out));
  // ⚠️ ET ELLE NE DIT PAS QUE C'EST MÉDICAL: sinon la personne reçoit un plan
  // qui s'excuse pour un goût.
  assert(!/allerg|medical rule/i.test(out.replace(/not a medical rule/i, "")));
  assertEquals(exclusionRetryInstruction([]), null);
});

// ===========================================================================
// ⑥ ⛔ LE CÂBLAGE — sans lui, la ceinture peut disparaître en silence
// ===========================================================================

Deno.test("LA LANE FOYER passe les exclusions PAR BOUCHE au parseur", async () => {
  const src = (await Deno.readTextFile(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  ))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
  // ⚠️ RECALÉ LE 2026-09-01: la carte a été HISSÉE en `memberExclusionTerms`,
  // parce que DEUX lecteurs en ont besoin (le parseur, et la relance pour les
  // plats non ventilés). Ce test cherchait le littéral à son ancienne place et
  // serait devenu rouge pour une raison qui n'est pas la sienne.
  assert(
    /boxMemberExclusions: memberExclusionTerms/.test(src),
    "la lane foyer ne passe plus les exclusions par bouche au parseur: une " +
      "exclusion attribuée redevient INERTE, et le plan sert quand même le poisson",
  );
  assert(
    /const memberExclusionTerms = members\.map\(/.test(src),
    "les termes ne sont plus tirés PAR BOUCHE",
  );
  assert(
    /subject: memberSubject\(m\.memberId\)/.test(src),
    "le sujet n'est plus celui de la bouche: l'exclusion d'un enfant " +
      "s'appliquerait à la table entière",
  );
});

Deno.test("⛔ LE PARSEUR RETIRE LA BOUCHE, jamais le plat ni le plan", async () => {
  const src = await Deno.readTextFile(
    new URL("./meal_generation.ts", import.meta.url),
  );
  assert(
    /surface: "ingredients"/.test(src),
    "le parseur lit la PROSE pour décider un retrait: un mot de bruit " +
      "(« fils » → `fil`) coûterait le repas de quelqu'un",
  );
  assert(
    /exclusionBelt\.refused\+\+/.test(src),
    "le retrait n'est plus compté: une ceinture muette est indiscernable " +
      "d'une ceinture absente",
  );
  // ⛔ ET IL NE JETTE PAS LE PLAT. `continue` retire la bouche de la boîte;
  // un `return` ou un `throw` ici rendrait `422 empty_meal` au foyer entier.
  const at = src.indexOf("exclusionBelt.refused++");
  // ⟳ 2026-09-04: 1 200 et non 700 — le `push` du retrait dit désormais PAR OÙ
  // la morsure est passée (`via`, `preparationId`, `matched`), et le
  // `continue` a reculé d'autant. Le geste n'a pas changé.
  const after = src.slice(at, at + 1200);
  assert(/continue;/.test(after), "le retrait est devenu un refus du plat");
  assert(!/throw |empty_meal/.test(after), "une morsure fait tomber le plan");
});

Deno.test("⛔ LA LANE FOYER RELANCE, et une morsure survivante est DITE", async () => {
  const src = await Deno.readTextFile(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  assert(
    /exclusion_retry/.test(src),
    "la relance a disparu: une exclusion du FOYER n'a personne à retirer, " +
      "donc sans relance elle redevient une consigne de prompt",
  );
  // ⛔ LA RELANCE NE DOIT PAS RACCOURCIR LE PLAN. « Réparer » l'exclusion en
  // retirant des journées ferait payer son goût en semaine vide.
  //
  // ⚠️ SCOPÉ AU BLOC DE L'EXCLUSION, ET C'EST UNE CORRECTION. La MÊME
  // expression existe dans la relance d'ancre protéique, vingt lignes plus
  // haut: un test qui cherchait dans tout le fichier restait VERT quand on
  // retirait la garde d'ici — il mesurait l'autre bloc. Mesuré par mutation.
  const retryAt = src.indexOf("exclusion_retry");
  assert(retryAt > 0, "le bloc de relance a disparu");
  const retryBlock = src.slice(retryAt, retryAt + 1400);
  assert(
    /retried\.dishes\.length >= meal\.dishes\.length/.test(retryBlock),
    "la relance d'exclusion peut raccourcir le plan",
  );
  assert(
    /after\.length < bitesBefore\.length/.test(retryBlock),
    "la relance est acceptée sans avoir RÉDUIT les morsures",
  );
  assert(
    /still contains/.test(src),
    "une morsure qui SURVIT à la relance n'est plus dite: le plan la sert " +
      "en silence, ce que ce lot existe pour empêcher",
  );
  assert(
    /tag: "keel\.household_meal\.exclusion_belt"/.test(src),
    "le compteur a disparu",
  );
  assert(
    /terms: householdExclusionTerms\.length/.test(src),
    "le DÉNOMINATEUR a disparu: « aucune violation » et « aucune exclusion " +
      "déclarée » rendraient le même zéro",
  );
});

// ===========================================================================
// ⑦ ⛔ CATÉGORIE → ESPÈCES, ET JAMAIS L'INVERSE
// ===========================================================================

Deno.test("⛔ « poisson » MORD sur « saumon » — la catégorie déplie", () => {
  // Mesuré le 2026-09-01: l'exclusion ne mordait pas, et le plan servait du
  // saumon à quelqu'un qui avait écrit « poisson ».
  const terms = exclusionTermsFor({
    items: [item("Mon fils n'aime pas le poisson", TOM)],
    subject: TOM,
  });
  const out = dishBitesExclusion({
    dish: { title: "Assiette", method: "", ingredients: [{ term: "saumon" }] },
    uses: [], preparationById: new Map(), terms, surface: "ingredients",
  } as never);
  assertEquals(out.matched !== null, true, "la catégorie ne déplie plus ses espèces");
  // ⚠️ ET LA RAISON RESTE LA PHRASE DE LA PERSONNE, pas le mot déplié: c'est
  // ce qu'on lui montrera.
  assertEquals(out.because, "Mon fils n'aime pas le poisson");
});

Deno.test("⛔ « saumon » NE DÉPLIE RIEN — on n'écrit pas une règle plus large", () => {
  // C'est l'objection qui a façonné ce lot: déduire « il n'aime pas le
  // poisson » de « il n'aime pas le saumon » écrirait une règle sur des
  // aliments que la personne n'a JAMAIS nommés.
  const terms = exclusionTermsFor({
    items: [item("Mon fils n'aime pas le saumon", TOM)],
    subject: TOM,
  });
  const tokens = terms.map((t) => t.token);
  assert(tokens.includes("saumon"), "le mot qu'elle a écrit a disparu");
  for (const other of ["thon", "cabillaud", "crevette", "poisson"]) {
    assert(
      !tokens.includes(other),
      `« ${other} » a été ajouté: on a élargi sa phrase à un aliment qu'elle ` +
        "n'a jamais nommé",
    );
  }
  // Et le thon passe: elle n'a rien dit contre.
  const out = dishBitesExclusion({
    dish: { title: "Assiette", method: "", ingredients: [{ term: "thon" }] },
    uses: [], preparationById: new Map(), terms, surface: "ingredients",
  } as never);
  assertEquals(out.matched, null);
});

Deno.test("⛔ LA TABLE EST CELLE DES RÉGIMES, pas une seconde liste", async () => {
  // Deux listes de « ce qu'est un poisson » divergeraient, et c'est celle
  // qu'on regarde le moins qui garderait l'ancienne.
  const src = await Deno.readTextFile(
    new URL("./food_exclusion_belt.ts", import.meta.url),
  );
  assert(
    /from "\.\/dietary_regime\.ts"/.test(src),
    "la ceinture a sa propre table de formes: elle divergera de celle des régimes",
  );
  const regime = await Deno.readTextFile(
    new URL("./dietary_regime.ts", import.meta.url),
  );
  // ⛔ ET AUCUNE ESPÈCE N'EST UNE CLÉ. `saumon` dans `CATEGORY_HEADS` rouvrirait
  // exactement la généralisation qu'on refuse.
  const heads = regime.slice(
    regime.indexOf("const CATEGORY_HEADS"),
    regime.indexOf("export function categoryFormsOf"),
  );
  for (const species of ["saumon", "salmon", "thon", "tuna", "poulet", "chicken", "boeuf"]) {
    assert(
      !new RegExp(`"${species}"`).test(heads),
      `« ${species} » est devenu une CLÉ de catégorie: une espèce déplierait ` +
        "sa famille, ce que ce lot refuse",
    );
  }
});

Deno.test("⛔ UN PLAT QUE PERSONNE NE SE VOIT ATTRIBUER passe la ligne de CHACUN", async () => {
  // Mesuré le 2026-09-01: « Saumon, courgettes » n'avait AUCUNE boîte, donc la
  // ceinture par bouche n'avait aucune appartenance à retirer — et le saumon
  // partait chez l'enfant qui a écrit « pas de poisson ». On ne peut pas
  // exclure quelqu'un d'un plat qui n'est pas découpé: il faut le RÉÉCRIRE.
  const src = await Deno.readTextFile(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  assert(
    /const unallocatedTerms = \[/.test(src),
    "l'union des lignes de la table a disparu: un plat non ventilé redevient " +
      "servi à tous sans que personne ne le vérifie",
  );
  assert(
    /const allocated = \(d\.boxes \?\? \[\]\)\.some\(/.test(src),
    "la ventilation ne décide plus quel jeu de mots s'applique",
  );
  // ⛔ ET SEULEMENT POUR LES PLATS NON VENTILÉS. Appliquer l'union à un plat
  // découpé retirerait un aliment à toute la table pour la ligne d'UNE bouche
  // — exactement ce que l'axe 3 de la nomenclature interdit.
  assert(
    /allocated \? householdExclusionTerms : unallocatedTerms/.test(src),
    "l'union s'applique aussi aux plats VENTILÉS: la règle d'une bouche " +
      "retirerait un aliment à toute la table",
  );
});


Deno.test("⟳ 2026-09-06 — CE QUE LA TABLE ÉVITE EST LA LIGNE DE CHAQUE BOUCHE (ceinture par bouche)", async () => {
  // Mesuré (FB1r, FB4, FB4r — 4 tirs sur 4): « on n'aime pas le saumon »
  // n'atteignait la ceinture par bouche pour PERSONNE (`mouths: 0`), seule une
  // relance modèle la tenait, refusée à chaque fois, et le saumon partait chez
  // tout le monde. Les termes de la table rejoignent ceux de chaque bouche.
  const src = (await Deno.readTextFile(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  )).replace(/\/\*[\s\S]*?\*\//g, "");
  const at = src.indexOf("const memberExclusionTerms = members.map(");
  assert(at > 0);
  const block = src.slice(at, at + 500);
  assert(/\.\.\.householdExclusionTerms,/.test(block), "les termes de la table ne rejoignent plus ceux de chaque bouche: une exclusion de table redevient une consigne de prompt");
  assert(src.indexOf("const householdExclusionTerms = exclusionTermsFor(") < at, "les termes de la table sont calculés APRÈS ceux des bouches");
});
