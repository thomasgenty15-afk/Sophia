// UNE EXCLUSION QU'ON INTERROGE EST UNE EXCLUSION MORTE — lot M6.
//
// Ce que ces tests existent pour empêcher, dans l'ordre où ça coûte:
//
//   1. QU'UNE RÈGLE SOIT INVENTÉE. Dire à quelqu'un « tu as demandé ça » quand
//      il ne l'a pas demandé est le pire mensonge possible ici: il porte sur
//      ses propres mots. Le silence est la bonne réponse.
//   2. QUE « LAIT » TROUVE « LAITUE ». La cicatrice chiffrée du dépôt, 12 faux
//      positifs sur 12. C'est le moteur qui la tient — encore faut-il l'appeler
//      comme il est fait pour l'être.
//   3. QUE LA NÉGATION BLANCHISSE CE QU'ON CHERCHE. Une règle d'exclusion est
//      écrite AU NÉGATIF; en mode ceinture, on serait aveugle à ce qu'on
//      cherche.
//   4. QUE LE CHAT SE METTE À LEVER LA RÈGLE. Le §2.8 tranche: il n'écrit
//      jamais, pas même en un tap.
//
// env purgé: env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
//   deno test --allow-read --allow-env --no-check \
//   supabase/functions/_shared/keel/rule_question_test.ts

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  rulesFrom,
  rulesMentioning,
  type StoredRule,
  usableFoodWord,
} from "./rule_question.ts";
import {
  allRedirectSentences,
  ruleQuestionRedirectFor,
} from "./conversation_redirect.ts";
import { ruleQuestionContextBlock } from "./rule_question.ts";

function rule(text: string, over: Partial<StoredRule> = {}): StoredRule {
  return {
    text,
    source: "questionnaire",
    at: "2026-08-18",
    quote: "« Un plat que tu ne referais pas ? » → « Poulet rôti »",
    ...over,
  };
}

const RULES: StoredRule[] = [
  rule("plus jamais de poulet le soir"),
  rule("pas de laitue dans les salades", { source: "draft_note" }),
  rule("moins de lait le matin", { source: "draft_note" }),
];

// ===========================================================================
// 1. ⛔ « LAIT » NE TROUVE PAS « LAITUE »
// ===========================================================================

Deno.test("⛔ LE PIÈGE DU MATCHER: « lait » ne se trouve pas dans « laitue »", () => {
  // La cicatrice chiffrée du dépôt. C'est `tokenPattern` qui la tient, par des
  // frontières de mot en lookaround — et c'est la raison pour laquelle ce
  // module APPELLE le moteur au lieu d'écrire sa propre recherche.
  const lait = rulesMentioning({ food: "lait", rules: RULES });
  assertEquals(lait.map((r) => r.text), ["moins de lait le matin"]);

  const laitue = rulesMentioning({ food: "laitue", rules: RULES });
  assertEquals(laitue.map((r) => r.text), ["pas de laitue dans les salades"]);
});

Deno.test("le pluriel et les séparateurs sont tolérés, comme partout", () => {
  const found = rulesMentioning({
    food: "poulet",
    rules: [rule("plus jamais de poulets rôtis")],
  });
  assertEquals(found.length, 1);
});

// ===========================================================================
// 2. ⛔ LA NÉGATION NE BLANCHIT PAS CE QU'ON CHERCHE
// ===========================================================================

Deno.test("⛔ une règle écrite AU NÉGATIF est quand même trouvée", () => {
  // C'est le cœur du lot: une exclusion s'écrit « plus jamais de X ». En mode
  // ceinture (`allowNegatedMentions` par défaut), la négation blanchirait la
  // mention et on ne trouverait JAMAIS la ligne qu'on cherche — un chercheur
  // aveugle à ce qu'il cherche.
  for (
    const text of [
      "plus jamais de poulet",
      "pas de poulet le soir",
      "no more chicken, ever",
      "I don't want chicken",
    ]
  ) {
    const word = text.includes("chicken") ? "chicken" : "poulet";
    assertEquals(
      rulesMentioning({ food: word, rules: [rule(text)] }).length,
      1,
      text,
    );
  }
});

// ===========================================================================
// 3. ⛔ RIEN N'EST INVENTÉ
// ===========================================================================

Deno.test("⛔ un aliment qu'aucune règle ne nomme rend LE SILENCE", () => {
  assertEquals(rulesMentioning({ food: "brocoli", rules: RULES }), []);
  assertEquals(
    ruleQuestionRedirectFor({ rules: [], locale: "fr-FR", isKeelStudent: true }),
    null,
    "une phrase est sortie sans qu'aucune règle n'existe",
  );
});

Deno.test("⛔ un mot d'UNE lettre est refusé — il matcherait n'importe quoi", () => {
  // `tokenPattern("a")` matche un « a » isolé dans n'importe quelle prose
  // française: la personne recevrait une règle sans rapport, présentée comme la
  // cause de son plan.
  assertEquals(usableFoodWord("a"), null);
  assertEquals(usableFoodWord(" "), null);
  assertEquals(usableFoodWord(null), null);
  assertEquals(rulesMentioning({ food: "a", rules: RULES }), []);
  // Le cas qui passe, sans quoi la garde serait indiscernable d'une garde
  // cassée.
  assertEquals(usableFoodWord("  poulet "), "poulet");
});

Deno.test("TOUTES les règles qui nomment l'aliment, pas la première", () => {
  // Quelqu'un peut avoir dit « plus de poulet le soir » au bilan ET « pas de
  // poulet du tout » sur un brouillon. N'en montrer qu'une lui ferait enlever
  // la mauvaise et croire que le produit ment quand le poulet ne revient pas.
  const found = rulesMentioning({
    food: "poulet",
    rules: [
      rule("plus jamais de poulet le soir"),
      rule("pas de poulet du tout", { source: "draft_note" }),
      rule("des pâtes le lundi"),
    ],
  });
  assertEquals(found.length, 2);
});

// ===========================================================================
// 4. LA LECTURE DES DEUX MAGASINS
// ===========================================================================

Deno.test("les DEUX magasins sont lus — structuré ET liste plate", () => {
  // N'en lire qu'un ferait répondre « tu n'as rien demandé » à quelqu'un dont
  // la règle est dans l'autre.
  const out = rulesFrom({
    retained_items: [
      {
        kind: "food.exclude",
        text: "plus jamais de poulet",
        source: "questionnaire",
        at: "2026-08-18",
        quote: "« Un plat que tu ne referais pas ? » → « Poulet »",
      },
      // ⛔ Une ligne de logistique ne fait jamais APPARAÎTRE un aliment: la
      // citer répondrait à côté.
      { kind: "logistics.set", text: "35 min", source: "written", at: "2026-08-18" },
    ],
    food_preferences: ["je ne mange pas de porc"],
  });
  assertEquals(out.length, 2);
  assertEquals(out[0].quote !== null, true, "la citation du structuré est perdue");
  // ⛔ ET ON N'INVENTE PAS DE CITATION AUX PHRASES PLATES: §7 de la
  // nomenclature — elles se lisent, elles ne se devinent pas.
  assertEquals(out[1].quote, null);
});

Deno.test("un magasin absent ou difforme ne jette pas", () => {
  assertEquals(rulesFrom(null), []);
  assertEquals(rulesFrom({}), []);
  assertEquals(rulesFrom({ retained_items: "nawak", food_preferences: 42 }), []);
});

// ===========================================================================
// 5. ⛔ LA PHRASE — elle nomme, elle cite, et elle NE LÈVE RIEN
// ===========================================================================

Deno.test("⛔ la phrase NOMME la ligne et RAPPELLE sa cause", () => {
  const found = rulesMentioning({ food: "poulet", rules: RULES });
  const fr = ruleQuestionRedirectFor({
    rules: found,
    locale: "fr-FR",
    isKeelStudent: true,
  });
  assert(fr);
  // La ligne, telle qu'elle est écrite — jamais reformulée.
  assertStringIncludes(fr, "plus jamais de poulet le soir");
  // Sa cause, dans les mots de la personne (lot M2).
  assertStringIncludes(fr, "Poulet rôti");
  // Et où elle se lève.
  assertStringIncludes(fr, "Ce que Sophia sait de toi");
});

Deno.test("⛔ ELLE NE LÈVE RIEN — le chat n'écrit jamais, pas même en un tap", () => {
  // Le §2.9 dit « propose de la lever là »; le §2.8 tranche et NOMME ce cas:
  // « s'il peut écrire une allergie en un tap, pourquoi pas un aliment évité ? ».
  const fr = ruleQuestionRedirectFor({
    rules: rulesMentioning({ food: "poulet", rules: RULES }),
    locale: "fr-FR",
    isKeelStudent: true,
  })!;
  assertStringIncludes(fr, "je ne la lève pas d'ici");
  // ⚠️ ET ELLE DIT QU'ELLE N'A RIEN ENREGISTRÉ — la garde de formulation de M1
  // relit cette phrase comme les autres (`allRedirectSentences`).
  assertStringIncludes(fr, "n'ai pas enregistré");
});

Deno.test("les deux langues, et une règle SANS citation se rend nue", () => {
  const bare = ruleQuestionRedirectFor({
    rules: [{ text: "no more pork", quote: null }],
    locale: "en-GB",
    isKeelStudent: true,
  })!;
  assertStringIncludes(bare, "no more pork");
  // Pas de « you said » quand on ne sait pas ce qu'elle a dit: on n'invente pas
  // la cause d'une phrase plate.
  assert(!bare.includes("you said"), "une cause a été inventée");

  const fr = ruleQuestionRedirectFor({
    rules: [{ text: "plus de porc", quote: null }],
    locale: "fr-FR",
    isKeelStudent: true,
  })!;
  assert(fr !== bare, "les deux langues rendent le même texte");
});

Deno.test("⛔ `isKeelStudent` est une GARDE, pas une décoration", () => {
  assertEquals(
    ruleQuestionRedirectFor({
      rules: [{ text: "plus de porc", quote: null }],
      locale: "fr-FR",
      isKeelStudent: false,
    }),
    null,
  );
});

// ===========================================================================
// 6. ⛔ LE CÂBLAGE
// ===========================================================================

Deno.test("LE CÂBLAGE — `run.ts` charge, cherche, arme et DIT", async () => {
  const src = (await Deno.readTextFile(
    new URL("../../sophia-brain/router/run.ts", import.meta.url),
  ))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");

  assert(src.includes("loadRulesFor("), "le chargeur n'est plus appelé");
  assert(src.includes("rulesMentioning("), "la recherche n'est plus appelée");
  assert(
    src.includes("keelTurn.rule_question_redirect = ruleQuestionRedirectFor("),
    "ARMEMENT DÉBRANCHÉ: la phrase ne sera jamais posée",
  );
  assert(
    src.includes("appendRedirect(out, keel.rule_question_redirect)"),
    "LA PHRASE N'EST PLUS DITE: armée et jamais rendue — « rendu » n'est pas « dit »",
  );

  // ⛔ LE CHARGEMENT RESTE PARESSEUX. Le sortir du `if` ferait lire
  // `student_goals` à CHAQUE tour de chaque élève, pour servir un cas rare.
  const at = src.indexOf("loadRulesFor(");
  const before = src.slice(Math.max(0, at - 900), at);
  assert(
    before.includes("dispatcherSignals.rule_question?.detected === true"),
    "LE CHARGEMENT N'EST PLUS GATÉ: `student_goals` est lu à chaque tour.",
  );

  // ⚠️ LE DÉNOMINATEUR, et le MOT dans la ligne: c'est la seule façon de
  // distinguer « le modèle n'émet jamais » de « il émet un mot qu'aucune règle
  // ne porte » — le second est une consigne de prompt à corriger, pas une panne.
  assert(src.includes('tag: "keel/rule_question"'), "le compteur a disparu");
  assert(src.includes("rules_found:"), "le compteur ne dit plus combien de règles");
  assert(src.includes("food: String("), "le compteur ne dit plus le mot demandé");
});

// ===========================================================================
// 7. ⛔ CE QUE LE MODÈLE SAIT AVANT DE COMPOSER
//
// Mesuré sur des tours réels, 2 armements sur 2: la phrase visible était juste
// et la réponse se contredisait quand même, parce que le modèle devinait la
// cause. Ces tests gardent la réparation.
// ===========================================================================

Deno.test("⛔ LE BLOC NOMME LES LIGNES, mot pour mot", () => {
  const found = rulesMentioning({ food: "poulet", rules: RULES });
  const block = ruleQuestionContextBlock({ rules: found, isKeelStudent: true })!;
  assert(block);
  assertStringIncludes(block, "plus jamais de poulet le soir");
});

Deno.test("⛔ IL TUE LA DEVINETTE, avec les mots exacts qu'on a mesurés", () => {
  // Une interdiction vague (« ne suppose rien ») laisse intacte la formulation
  // qu'on a vue sortir. Celle-ci la NOMME.
  const block = ruleQuestionContextBlock({
    rules: [{ text: "plus de fenouil" }],
    isKeelStudent: true,
  })!;
  assertStringIncludes(block, "pas parce qu'il serait bloque");
  // ⛔ ET IL INTERDIT LES DEUX DOUBLONS — les deux mesurés en vrai. Le premier
  // jet du bloc n'interdisait que le second, et la réponse bégayait la ligne.
  assertStringIncludes(block, "NE CITE PAS CETTE LIGNE");
  assertStringIncludes(block, "N'EXPLIQUE PAS COMMENT L'ENLEVER");
});

Deno.test("⛔ BLOC ET PHRASE NE DIVERGENT JAMAIS — mêmes portes, même liste", () => {
  // Si l'un s'arme sans l'autre, le modèle est instruit d'une règle que la
  // phrase ne nommera pas (ou l'inverse): exactement le défaut qu'on répare.
  for (
    const cas of [
      { rules: [] as { text: string; quote: string | null }[], student: true },
      { rules: [{ text: "plus de porc", quote: null }], student: false },
      { rules: [{ text: "   ", quote: null }], student: true },
      { rules: [{ text: "plus de porc", quote: null }], student: true },
    ]
  ) {
    const sentence = ruleQuestionRedirectFor({
      rules: cas.rules,
      locale: "fr-FR",
      isKeelStudent: cas.student,
    });
    const block = ruleQuestionContextBlock({
      rules: cas.rules,
      isKeelStudent: cas.student,
    });
    assertEquals(
      block === null,
      sentence === null,
      `divergence: bloc=${block === null} phrase=${sentence === null}`,
    );
  }
  // Et les DEUX rendent les DEUX lignes quand il y en a deux.
  const two = [
    { text: "plus de poulet le soir", quote: null },
    { text: "pas de poulet du tout", quote: null },
  ];
  const block = ruleQuestionContextBlock({ rules: two, isKeelStudent: true })!;
  const sentence = ruleQuestionRedirectFor({
    rules: two,
    locale: "fr-FR",
    isKeelStudent: true,
  })!;
  for (const r of two) {
    assertStringIncludes(block, r.text);
    assertStringIncludes(sentence, r.text);
  }
});

Deno.test("⛔ CE BLOC N'EST PAS UNE PHRASE VISIBLE", () => {
  // `allRedirectSentences()` garde la FORMULATION de ce qu'on dit à la
  // personne (« je garde ça » interdit). Y verser une consigne interne ferait
  // relire par cette garde un texte qui n'est jamais lu par personne, et
  // laisserait croire que le bloc est gardé.
  const block = ruleQuestionContextBlock({
    rules: [{ text: "plus de porc" }],
    isKeelStudent: true,
  })!;
  assert(
    !allRedirectSentences().includes(block),
    "la consigne interne est passée dans les phrases visibles",
  );
});

Deno.test("LE CÂBLAGE — le bloc est CONSTRUIT, INJECTÉ et COMPTÉ", async () => {
  const src = (await Deno.readTextFile(
    new URL("../../sophia-brain/router/run.ts", import.meta.url),
  ))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");

  assert(
    src.includes("ruleQuestionContext = ruleQuestionContextBlock("),
    "le bloc n'est plus construit: le modèle redevine la cause",
  );
  // ⛔ CONSTRUIT N'EST PAS INJECTÉ. Un bloc bâti et jamais mis dans
  // `injectedContext` est la panne exacte, un cran plus loin — et elle est
  // invisible: la phrase visible, elle, continue de sortir.
  const at = src.indexOf("const injectedContext = [");
  assert(at > 0, "le tableau de contexte a été renommé");
  const arr = src.slice(at, src.indexOf("];", at));
  assert(
    /\n\s*ruleQuestionContext,/.test(arr),
    "LE BLOC N'EST PLUS INJECTÉ: construit, puis jeté",
  );
  // ⚠️ ET IL EST COMPTÉ SÉPARÉMENT DE `armed`: depuis cette réparation, un tour
  // peut avoir sa phrase sans son bloc, et c'est ça la régression.
  assert(
    src.includes("told_model: ruleQuestionContext != null"),
    "le compteur ne distingue plus « armé » de « le modèle a été instruit »",
  );
});
