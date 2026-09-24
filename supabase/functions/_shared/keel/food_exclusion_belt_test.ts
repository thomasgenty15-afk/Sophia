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
  memberServedExclusionBites,
  servedExclusionBites,
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
  return dishBitesExclusion({ dish: dish(over) as never, uses, preparationById: preps, terms, surface: "ingredients" , slot: null });
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
  assertEquals(dishBitesExclusion({ ...proseOnly, surface: "ingredients" , slot: null } as never).matched, null);
  // …et le vrai aliment mord toujours.
  assertEquals(
    dishBitesExclusion({
      dish: { title: "Assiette", method: "", ingredients: [{ term: "poisson blanc" }] },
      uses: [], preparationById: new Map(), terms, surface: "ingredients", slot: null } as never).matched !== null,
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
    surface: "ingredients", slot: null });
  assertEquals(out.matched !== null, true, "la préparation n'est pas pliée: la protéine échappe");
  assertEquals(out.preparationIds, ["p1"]);
});

// ===========================================================================
// 5. LA RELANCE
// ===========================================================================

Deno.test("⛔ LA RELANCE NOMME LE PLAT, ET INTERDIT DE LE SUPPRIMER", () => {
  const out = exclusionRetryInstruction([
    { dish: "Poulet fajita", matched: "poulet", because: "Je n'aime pas le poulet" },
  ])!;
  assert(out.includes("Poulet fajita"), "le plat n'est pas nommé: tout le plan serait recomposé");
  assert(out.includes("Je n'aime pas le poulet"));
  // ⟳ 2026-09-13 · LOT 1 — « do NOT shorten the plan » A ÉTÉ RETIRÉ: il suppose
  // qu'on rend un PLAN, et ce texte part dans une instruction qui demande un
  // PATCH. Ce qui reste porte sur le plat nommé: on ne le supprime pas.
  assert(!/shorten the plan/i.test(out), out);
  assert(/do NOT drop the dish/i.test(out), out);
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

Deno.test("⛔ LA LANE FOYER CONSTATE, et une morsure survivante est DITE", async () => {
  const src = await Deno.readTextFile(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · FERMETURE LOT 1 — CE TEST ÉPINGLAIT UNE RELANCE LOCALE
  // ══════════════════════════════════════════════════════════════════════
  //
  // Il exigeait que le site d'exclusion APPELLE le modèle, et que sa réponse
  // ne raccourcisse pas le plan. Les deux exigences ont été remplacées par une
  // plus forte: le site ne rappelle plus le modèle du tout, son constat rejoint
  // la décision commune, et le PATCH qui en revient ne peut structurellement pas
  // raccourcir le plan — il ne porte que les unités autorisées, et une unité
  // omise reste celle du meilleur plan (`plan_repair_patch.ts`).
  //
  // ⛔ CE QUI NE CHANGE PAS, ET C'EST LE CŒUR DU LOT: une exclusion du FOYER
  // n'a personne à retirer d'un contenant. Sans un chemin de réparation, elle
  // redevient une consigne de prompt. Le chemin existe toujours — il est
  // ailleurs.
  assert(
    /exclusionRetryInstruction\(morsures\)/.test(src),
    "le constat d'exclusion ne compose plus sa consigne: une exclusion du " +
      "FOYER redeviendrait une consigne de prompt",
  );
  assert(
    /cause: "table_exclusion_served"/.test(src),
    "le constat ne porte plus la cause de la garde: le périmètre de " +
      "réparation ne saurait plus contaminer les portions du lot en cause",
  );
  // ⛔ ET IL N'APPELLE PLUS LE MODÈLE DEPUIS CE SITE. C'est la propriété que le
  // lot 1 ajoute: un seul compteur, deux appels pour la requête entière.
  assert(
    !/tag: "keel\.household_meal\.exclusion_retry_rejected"/.test(src),
    "la relance locale d'exclusion est revenue: elle consommerait le budget " +
      "avant que tous les défauts soient connus",
  );
  assert(
    /still contains/.test(src),
    "une morsure qui SURVIT n'est plus dite: le plan la sert " +
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
    uses: [], preparationById: new Map(), terms, surface: "ingredients", slot: null } as never);
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
    uses: [], preparationById: new Map(), terms, surface: "ingredients", slot: null } as never);
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
  // ⟳ 2026-09-24 — LA RÈGLE A DÉMÉNAGÉ dans `servedExclusionBites`
  // (ce module), appelée par `bitesOf` ET par l'ajustement par exclusion.
  // On vérifie donc les DEUX bouts : la règle ici, le câblage là-bas.
  const belt = await Deno.readTextFile(new URL("./food_exclusion_belt.ts", import.meta.url));
  assert(
    /const allocated = \(d\.boxes \?\? \[\]\)\.some\(/.test(belt),
    "la ventilation ne décide plus quel jeu de mots s'applique",
  );
  // ⛔ ET SEULEMENT POUR LES PLATS NON VENTILÉS. Appliquer l'union à un plat
  // découpé retirerait un aliment à toute la table pour la ligne d'UNE bouche
  // — exactement ce que l'axe 3 de la nomenclature interdit.
  assert(
    /allocated \? args\.householdTerms : args\.unallocatedTerms/.test(belt),
    "l'union s'applique aussi aux plats VENTILÉS: la règle d'une bouche " +
      "retirerait un aliment à toute la table",
  );
  assert(
    /servedExclusionBites\(\{\s*meal: m as never,\s*householdTerms: householdExclusionTerms,\s*unallocatedTerms,/.test(src),
    "`bitesOf` ne passe plus la table ET l'union à la règle commune",
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


// ===========================================================================
// ⟳ 2026-09-06 — UNE PHRASE = UNE RÈGLE, ET TOUS SES MOTS DOIVENT Y ÊTRE
// ===========================================================================

Deno.test("⛔ « rougaille saucisse » ne mord PAS « lentilles aux saucisses » ni « rougaille de tomates »", () => {
  // Mesuré (banc « un retour et les calories »): la phrase rendait deux
  // règles indépendantes, et chacune mordait seule. La personne a nommé UN
  // plat ; ses deux mots doivent être là.
  // ⚠️ LE TEXTE RETENU EST LA CHOSE, pas la phrase: le classifieur range
  // « rougaille saucisse », et c'est cette forme nue qui exige tous ses mots.
  const terms = exclusionTermsFor({
    items: [item("rougaille saucisse", "household")],
    subject: "household",
  });
  assertEquals(terms.map((t) => t.word).sort(), ["rougaille", "saucisse"]);
  assert(terms.every((t) => t.phrase), "une phrase nue n'est pas reconnue comme telle");
  const bites = (title: string, ingredients: string[]) =>
    dishBitesExclusion({
      dish: { title, method: "", ingredients: ingredients.map((term) => ({ term })) },
      uses: [], preparationById: new Map(), terms, surface: "all", slot: null } as never).matched !== null;
  assertEquals(bites("Lentilles aux saucisses", ["lentilles", "saucisses"]), false);
  assertEquals(bites("Rougaille de tomates", ["tomates"]), false);
  assertEquals(bites("Rougaille saucisse", ["saucisses", "tomates"]), true);
  // Les deux mots peuvent être répartis entre le titre et les ingrédients.
  assertEquals(bites("Rougaille créole", ["saucisse fumée", "oignon"]), true);
});

Deno.test("une catégorie dépliée reste UN mot: n'importe quelle espèce suffit", () => {
  // « poisson » → saumon, thon… sont des alternatives du MÊME mot, pas des
  // mots à trouver tous.
  const terms = exclusionTermsFor({
    items: [item("poisson", TOM)],
    subject: TOM,
  });
  assert(new Set(terms.map((t) => t.word)).size === 1);
  assert(terms.length > 1, "la catégorie ne déplie plus ses espèces");
  assert(terms.every((t) => t.phrase));
  const out = dishBitesExclusion({
    dish: { title: "Assiette", method: "", ingredients: [{ term: "thon" }] },
    uses: [], preparationById: new Map(), terms, surface: "ingredients", slot: null } as never);
  assert(out.matched !== null);
});

Deno.test("un terme SANS `word` (appelant ancien) vaut son jeton — rien ne change pour une règle à un mot", () => {
  const out = dishBitesExclusion({
    dish: { title: "Poulet rôti", method: "", ingredients: [{ term: "poulet" }] },
    uses: [], preparationById: new Map(),
    terms: [{ ruleId: "pas de poulet", token: "poulet" }], surface: "ingredients", slot: null } as never);
  assertEquals(out.matched !== null, true);
  assertEquals(out.because, "pas de poulet");
});


Deno.test("une PHRASE DE PERSONNE garde la règle d'avant: chaque mot mord seul (le bruit ne la rend pas inerte)", () => {
  // « Mon fils n'aime pas le poisson » extrait « fil » et « poisson »; exiger
  // les deux rendrait la règle muette. Un marqueur de phrase (mon, pas, aime)
  // suffit à garder la règle d'avant.
  const terms = exclusionTermsFor({ items: [item("Mon fils n'aime pas le poisson", TOM)], subject: TOM });
  assert(terms.every((t) => !t.phrase));
  const out = dishBitesExclusion({
    dish: { title: "Assiette", method: "", ingredients: [{ term: "saumon" }] },
    uses: [], preparationById: new Map(), terms, surface: "ingredients", slot: null } as never);
  assert(out.matched !== null);
  // Et « yaourt de soja » reste une phrase nue: « yaourt nature » ne mord pas.
  const soy = exclusionTermsFor({ items: [item("yaourt de soja", TOM)], subject: TOM });
  assert(soy.every((t) => t.phrase));
  const plain = dishBitesExclusion({
    dish: { title: "Yaourt nature et fruits", method: "", ingredients: [{ term: "yaourt nature" }] },
    uses: [], preparationById: new Map(), terms: soy, surface: "all", slot: null } as never);
  assertEquals(plain.matched, null);
  const both = dishBitesExclusion({
    dish: { title: "Bol", method: "", ingredients: [{ term: "yaourt de soja" }] },
    uses: [], preparationById: new Map(), terms: soy, surface: "all", slot: null } as never);
  assert(both.matched !== null);
});

// ===========================================================================
// 6. ⟳ 2026-09-21 — LE MOMENT: une règle du matin ne juge pas un dîner
// ===========================================================================
//
// ── LE DÉFAUT QUE CES CAS FERMENT, MESURÉ SUR UN FOYER RÉEL ────────────────
// « Je veux pas de choses genre tofu, poissons au petit déjeuné » n'avait aucun
// moyen de dire SON MOMENT: il restait dans le texte. Deux conséquences, et la
// seconde est la plus chère:
//   · la règle devenait une PHRASE NUE (`isBarePhrase` rend `true` — ni pronom,
//     ni négation, ni verbe de goût), donc elle n'a mordu QUE si tous ses mots
//     étaient dans le plat. Un petit-déjeuner au tofu n'en porte qu'un;
//   · et si elle avait mordu, elle aurait mordu PARTOUT — le tofu du soir aussi,
//     que personne n'a refusé.

function itemAt(text: string, subject: string, occasion: string | null): RetainedItem {
  return {
    kind: "food.exclude", scope: "durable", subject, text, value: null,
    source: "draft_note", at: "2026-09-01", item: "", confidence: null,
    quote: text, occasion,
  } as unknown as RetainedItem;
}

Deno.test("⛔ LE MOMENT: une exclusion du matin ne mord PAS un plat du soir", () => {
  const terms = exclusionTermsFor({
    items: [itemAt("tofu", TOM, "breakfast")],
    subject: TOM,
  });
  const tofuDish = { title: "Tofu grillé", method: "poêle", ingredients: [{ term: "tofu" }] };
  const soir = dishBitesExclusion({
    dish: tofuDish,
    uses: [],
    preparationById: new Map(),
    terms,
    surface: "ingredients",
    slot: "dinner",
  });
  assertEquals(soir.matched, null, "la règle du matin a retiré un dîner à quelqu'un");

  const matin = dishBitesExclusion({
    dish: tofuDish,
    uses: [],
    preparationById: new Map(),
    terms,
    surface: "ingredients",
    slot: "breakfast",
  });
  assert(matin.matched !== null, "la règle du matin ne mord pas le matin: elle est inerte");
  // ⚠️ LES DEUX MOITIÉS. Une garde qui ne mord jamais et une garde qui mord
  // partout se ressemblent quand on n'en teste qu'une.
});

Deno.test("une exclusion SANS moment mord à tous les moments", () => {
  const terms = exclusionTermsFor({ items: [itemAt("tofu", TOM, null)], subject: TOM });
  const tofuDish = { title: "Tofu grillé", method: "poêle", ingredients: [{ term: "tofu" }] };
  for (const slot of ["breakfast", "lunch", "dinner"]) {
    const out = dishBitesExclusion({
      dish: tofuDish,
      uses: [],
      preparationById: new Map(),
      terms,
      surface: "ingredients",
      slot,
    });
    assert(out.matched !== null, `une règle de toute la journée ne mord pas à ${slot}`);
  }
});

Deno.test("⛔ `slot: null` juge TOUT — c'est le repli des appelants sans créneau", () => {
  // La relance et la garde finale jugent parfois un plan sans lire le créneau:
  // elles passent `null`, et toutes les règles s'appliquent. C'est le
  // comportement d'avant ce lot, nommé plutôt que subi.
  const terms = exclusionTermsFor({
    items: [itemAt("tofu", TOM, "breakfast")],
    subject: TOM,
  });
  const out = dishBitesExclusion({
    dish: { title: "Tofu grillé", method: "poêle", ingredients: [{ term: "tofu" }] },
    uses: [],
    preparationById: new Map(),
    terms,
    surface: "ingredients",
    slot: null,
  });
  assert(out.matched !== null);
});

Deno.test("⛔ DEUX MOMENTS = DEUX RÈGLES, et leurs mots ne se mélangent pas", () => {
  // Le même texte à deux moments partage son `ruleId` si le moment n'y entre
  // pas — et alors les mots trouvés au dîner satisfont la règle du matin.
  // C'est le mode d'échec silencieux de la règle « tous ses mots » des phrases
  // nues, appliqué au créneau.
  const terms = exclusionTermsFor({
    items: [
      itemAt("pain complet", TOM, "breakfast"),
      itemAt("pain complet", TOM, "dinner"),
    ],
    subject: TOM,
  });
  const ruleIds = new Set(terms.map((t) => t.ruleId));
  assertEquals(ruleIds.size, 2, "les deux moments partagent une seule règle");
});

Deno.test("⛔ CE QU'ON MONTRE EST LE TEXTE DE LA PERSONNE, jamais la clé de règle", () => {
  // `ruleId` porte désormais `texte@moment`. C'est un identifiant; le montrer
  // ferait lire à la personne une phrase qu'elle n'a pas écrite.
  const terms = exclusionTermsFor({
    items: [itemAt("tofu", TOM, "breakfast")],
    subject: TOM,
  });
  const out = dishBitesExclusion({
    dish: { title: "Tofu grillé", method: "poêle", ingredients: [{ term: "tofu" }] },
    uses: [],
    preparationById: new Map(),
    terms,
    surface: "ingredients",
    slot: "breakfast",
  });
  assertEquals(out.because, "tofu");
  assert(!String(out.because).includes("@"), "la clé de règle a fuité vers la personne");
});

// ===========================================================================
// 7. ⟳ 2026-09-22 — « MOINS » NE RETIRE RIEN
// ===========================================================================
//
// ── LE DÉFAUT, MESURÉ SUR LE SEUL COMPTE RÉEL ─────────────────────────────
// « Pas AUTANT de petit suisse le matin » était rangée en `food.exclude`, et
// cette ceinture en tirait des mots à interdire : l'aliment était retiré de
// toutes les boîtes, pour toujours. La personne avait demandé MOINS, et ne
// pouvait s'en apercevoir qu'en remarquant une absence.

function itemForced(text: string, subject: string, force: string | null): RetainedItem {
  return {
    kind: "food.exclude", scope: "durable", subject, text, value: null,
    source: "draft_note", at: "2026-09-01", item: "", confidence: null,
    quote: text, occasion: null, force,
  } as unknown as RetainedItem;
}

Deno.test("⛔ « moins » NE PRODUIT AUCUN MOT À INTERDIRE", () => {
  const terms = exclusionTermsFor({
    items: [itemForced("petit suisse", TOM, "less")],
    subject: TOM,
  });
  assertEquals(terms, [], "« moins » arme encore la ceinture: elle retire ce qu'on voulait réduire");
});

Deno.test("⛔ ET « jamais » EN PRODUIT TOUJOURS — les deux moitiés", () => {
  // Une garde qui rendrait tout inerte désarmerait la ceinture entière, et
  // ressemblerait trait pour trait à une garde qui marche.
  const terms = exclusionTermsFor({
    items: [itemForced("coriandre", TOM, "never")],
    subject: TOM,
  });
  assert(terms.length > 0, "« jamais » ne mord plus: la ceinture est morte");
  const out = dishBitesExclusion({
    dish: { title: "Salade", method: "cru", ingredients: [{ term: "coriandre" }] },
    uses: [],
    preparationById: new Map(),
    terms,
    surface: "ingredients",
    slot: null,
  });
  assert(out.matched !== null);
});

Deno.test("⛔ UNE LIGNE SANS FORCE MORD — toute la base d'avant ce lot", () => {
  // ⛔ LE REPLI VA VERS LA RÈGLE FORTE. Les lignes écrites avant le 2026-09-22
  // n'ont pas la clé; les lire en « moins » aurait désarmé chaque exclusion
  // déjà en base, en silence, le jour du déploiement.
  const terms = exclusionTermsFor({
    items: [itemForced("saumon", TOM, null)],
    subject: TOM,
  });
  assert(terms.length > 0, "une exclusion d'avant ce lot ne mord plus");
  assertEquals(bite(terms).matched !== null, true);
});

Deno.test("⛔ UNE LIGNE « moins » ET UNE LIGNE « jamais » COEXISTENT SANS SE MANGER", () => {
  // Le dédoublonnage porte sur (mot, texte, moment) — pas sur la force. Deux
  // règles de forces différentes sur des aliments différents doivent rester
  // deux règles, et seule la forte doit armer.
  const terms = exclusionTermsFor({
    items: [
      itemForced("petit suisse", TOM, "less"),
      itemForced("saumon", TOM, "never"),
    ],
    subject: TOM,
  });
  assertEquals(terms.map((t) => t.because), ["saumon"]);
});

// ⟳ 2026-09-24 — LA QUESTION « CE PLAN SERT-IL UN ALIMENT EXCLU ? », UNE FOIS.
// La ceinture de composition (`bitesOf`) et l'ajustement par exclusion
// (`exclusionEditCells`) l'appellent tous les deux.
Deno.test("servedExclusionBites — casserole commune lue, table vs tous selon la ventilation, cas propre vide", () => {
  const house = exclusionTermsFor({ items: [{ ...item("tofu", "household"), force: "never" } as RetainedItem], subject: "household" });
  const tomOnly = exclusionTermsFor({ items: [{ ...item("saumon", TOM), force: "never" } as RetainedItem], subject: TOM });
  assert(house.length > 0 && tomOnly.length > 0);
  const d = (title: string, day: string, slot: string, extra: Record<string, unknown> = {}) => ({
    title, method: "Cuire.", ingredients: [{ term: title.split(",")[0].toLowerCase() }],
    uses: [], boxes: [], day, slot, ...extra,
  });
  const meal = {
    dishes: [
      // L'aliment dans le plat lui-même.
      d("Tofu, riz", "sat", "lunch"),
      // L'aliment seulement dans la casserole citée : le plat mord quand même.
      d("Pâtes, légumes", "sun", "dinner", { uses: [{ preparationId: "prep_tofu" }] }),
      // Plat ventilé par bouche : seuls les mots de la TABLE valent.
      d("Saumon, riz", "mon", "lunch", { boxes: [{ memberIds: ["x"] }] }),
      // Plat servi à tous : les mots de CHACUN valent.
      d("Saumon, pâtes", "tue", "lunch"),
      d("Poulet, riz", "wed", "lunch"),
    ],
    preparations: [{ id: "prep_tofu", title: "Tofu rôti", method: "Rôtir.", ingredients: [{ term: "tofu" }] }],
  };
  const bites = servedExclusionBites({ meal, householdTerms: house, unallocatedTerms: [...house, ...tomOnly] });
  assertEquals(bites.map((b) => `${b.day}/${b.slot}`), ["sat/lunch", "sun/dinner", "tue/lunch"]);
  // Le cas qui passe : aucun mot, aucune morsure.
  assertEquals(servedExclusionBites({ meal, householdTerms: [], unallocatedTerms: [] }), []);
});

// ⟳ 2026-09-24 — CE QU'UNE PERSONNE NE MANGE PLUS, SUR LES PLATS QU'ELLE MANGE.
// Banc du 2026-09-24, test 11 : « Christèle n'aime pas le saumon » rendait
// « rien à changer » avec du saumon dans sa boîte du dimanche midi.
Deno.test("memberServedExclusionBites — sa boîte ou son plat mordent ; le plat d'un autre, jamais", () => {
  const CHR = "479cd74a";
  const TOMID = "23582c87";
  const own = exclusionTermsFor({ items: [{ ...item("saumon", "member:" + CHR), force: "never" } as RetainedItem], subject: "member:" + CHR });
  assert(own.length > 0);
  const d = (title: string, day: string, slot: string, extra: Record<string, unknown> = {}) => ({
    title, method: "Cuire.", ingredients: [{ term: title.split(",")[0].toLowerCase() }],
    uses: [], boxes: [], day, slot, ...extra,
  });
  const meal = {
    dishes: [
      // Plat partagé, elle a une boîte : il mord.
      d("Saumon, semoule", "sun", "lunch", { boxes: [{ memberIds: [TOMID] }, { memberIds: [CHR] }] }),
      // Plat partagé SANS elle : c'est l'assiette d'un autre, rien.
      d("Saumon, riz", "sat", "dinner", { boxes: [{ memberIds: [TOMID] }] }),
      // Son plat dédié : il mord.
      d("Saumon, pâtes", "mon", "dinner", { memberId: CHR }),
      // Chez elle, mais sans l'aliment : le cas qui passe.
      d("Poulet, riz", "tue", "lunch", { boxes: [{ memberIds: [CHR] }] }),
    ],
    preparations: [],
  };
  const bites = memberServedExclusionBites({ meal, members: [{ memberId: CHR, terms: own }, { memberId: TOMID, terms: [] }] });
  assertEquals(bites.map((b) => `${b.day}/${b.slot}:${b.memberId}`), ["sun/lunch:" + CHR, "mon/dinner:" + CHR]);
});
