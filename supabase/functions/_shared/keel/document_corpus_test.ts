// Le corpus d'un document du coach — découpage et ancrage (2026-08-06).
//
// Les trois tests qui portent les décisions, et qui doivent se relire seuls:
//   * "un chunk ne traverse jamais une page"
//     -- le numéro de page est TOUT ce que la citation apporte au coach. Un
//        chunk à cheval sur deux pages n'en a pas, et « c'est écrit quelque
//        part » ne se vérifie pas.
//   * "une citation coupée par un retour à la ligne de PDF reste ancrable"
//     -- un PDF coupe ses lignes à la largeur de la colonne, pas aux phrases.
//        Sans le repli des sauts simples, l'ancrage échoue sur des citations
//        parfaitement exactes, et on accuserait le modèle d'avoir inventé.
//   * "une citation absente du document ne s'ancre pas"
//     -- c'est la seule vérification automatique de la garde « pas de
//        citation, pas d'entrée ». Sans elle, la garde vérifie qu'une chaîne
//        est non vide, pas qu'elle vient du document.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  boundQuote,
  CHUNK_MAX_CHARS,
  chunkPages,
  CITATION_QUOTE_MAX_CHARS,
  citationEntryKey,
  dedupeCitations,
  type ExtractedCitation,
  foldForSearch,
  locateQuote,
  normalizePageText,
} from "./document_corpus.ts";

// ---------------------------------------------------------------------------
// Le découpage
// ---------------------------------------------------------------------------

Deno.test("chunkPages: un chunk ne traverse jamais une page", () => {
  const chunks = chunkPages(["page un, courte.", "page deux, courte aussi.", "page trois."]);
  assertEquals(chunks.length, 3);
  assertEquals(chunks.map((c) => c.pageNumber), [1, 2, 3]);
  assertEquals(chunks.map((c) => c.ordinal), [0, 1, 2]);
  // Deux pages courtes NE sont PAS fusionnées, même si ça ferait de plus
  // beaux chunks: la fusion échangerait le numéro de page contre une
  // statistique.
  assert(chunks.every((c) => !c.text.includes("page deux") || c.pageNumber === 2));
});

Deno.test("chunkPages: une page vide ne produit AUCUN chunk", () => {
  const chunks = chunkPages(["du texte", "   ", "", null, "encore du texte"]);
  assertEquals(chunks.length, 2);
  // Les numéros de page restent ceux du DOCUMENT: la page 5 est la page 5,
  // même si les pages 2 à 4 étaient des photos.
  assertEquals(chunks.map((c) => c.pageNumber), [1, 5]);
  // L'ordinal, lui, est dense: c'est un ordre de lecture, pas une pagination.
  assertEquals(chunks.map((c) => c.ordinal), [0, 1]);
});

Deno.test("chunkPages: une page longue se coupe, sous le plafond, en gardant sa page", () => {
  const paragraph = "Le coach explique sa methode avec beaucoup de details. ".repeat(60);
  const chunks = chunkPages([paragraph]);
  assert(chunks.length > 1, "une page de 3000+ caracteres doit produire plusieurs chunks");
  assert(chunks.every((c) => c.text.length <= CHUNK_MAX_CHARS));
  assert(chunks.every((c) => c.pageNumber === 1));
  assertEquals(chunks.map((c) => c.ordinal), chunks.map((_, i) => i));
});

Deno.test("chunkPages: un texte SANS aucune frontière se coupe quand même", () => {
  // Le cas qui boucle à l'infini si la recherche de frontière ne progresse
  // pas: aucune espace, aucune ponctuation. Une table des matières compactée
  // par l'extraction, ou une langue sans espaces.
  const wall = "x".repeat(CHUNK_MAX_CHARS * 3 + 17);
  const chunks = chunkPages([wall]);
  assertEquals(chunks.length, 4);
  assert(chunks.every((c) => c.text.length <= CHUNK_MAX_CHARS));
  assertEquals(chunks.map((c) => c.text).join("").length, wall.length);
});

Deno.test("normalizePageText: les sauts de ligne de mise en page sont repliés", () => {
  const raw = "I never count\ncalories. I build\nthe plate.\n\nNew paragraph here.";
  const out = normalizePageText(raw);
  assertEquals(out, "I never count calories. I build the plate.\n\nNew paragraph here.");
});

Deno.test("normalizePageText: la césure de fin de ligne est recollée", () => {
  assertEquals(normalizePageText("une bonne nutri-\ntion se construit"), "une bonne nutrition se construit");
});

// ---------------------------------------------------------------------------
// L'ancrage
// ---------------------------------------------------------------------------

Deno.test("locateQuote: une citation coupée par un retour à la ligne de PDF reste ancrable", () => {
  const chunks = chunkPages([
    "Introduction sans interet.",
    "I never count\ncalories with my athletes. I build the plate\ninstead.",
  ]);
  // Le modèle, lui, a recopié la phrase d'un seul tenant.
  const hit = locateQuote("I never count calories with my athletes.", chunks);
  assert(hit, "la citation doit s'ancrer malgre le retour a la ligne du PDF");
  assertEquals(hit.pageNumber, 2);
});

Deno.test("locateQuote: casse, accents et typographie ne cassent pas l'ancrage", () => {
  const chunks = chunkPages(["Je ne compte JAMAIS les calories — je construis l'assiette."]);
  const hit = locateQuote("je ne compte jamais les calories - je construis l'assiette", chunks);
  assert(hit, "l'ancrage compare des textes repliés, pas des octets");
  assertEquals(hit.pageNumber, 1);
});

Deno.test("locateQuote: une citation dont la FIN diverge s'ancre par son préfixe", () => {
  const chunks = chunkPages([
    "Hunger is information and never weakness, and a student who is hungry " +
    "ninety minutes after a meal was fed a meal that was built wrong.",
  ]);
  // Le cas réel: le modèle recopie juste, puis recolle une fin à lui. Les
  // douze premiers mots sont exacts, la phrase entière ne l'est pas.
  const hit = locateQuote(
    "Hunger is information and never weakness, and a student who is hungry " +
      "ninety minutes after a meal has been fed badly by me.",
    chunks,
  );
  assert(hit, "le repli sur les 12 premiers mots doit rattraper la divergence de fin");
  assertEquals(hit.pageNumber, 1);
});

Deno.test("locateQuote: une citation absente du document ne s'ancre pas", () => {
  const chunks = chunkPages(["Le document ne parle que de petit-dejeuner."]);
  assertEquals(locateQuote("Je recommande le jeune intermittent a tous mes eleves.", chunks), null);
});

Deno.test("locateQuote: un fragment court INEXACT ne déclenche pas le repli", () => {
  const chunks = chunkPages(["Le coach parle de proteines a chaque repas."]);
  // Verbatim, même court, ça s'ancre — c'est bien la phrase du document.
  assert(locateQuote("de proteines a chaque", chunks));
  // Inexact et court, non: sous six mots, le préfixe serait la citation
  // entière et le repli ne serait plus un repli mais la même recherche une
  // seconde fois. Pire, un fragment de trois mots se retrouve dans n'importe
  // quelle page — on ancrerait au hasard une citation que le modèle a inventée.
  assertEquals(locateQuote("de proteines chaque matin sans", chunks), null);
});

Deno.test("locateQuote: une citation vide ne s'ancre pas", () => {
  const chunks = chunkPages(["du texte"]);
  assertEquals(locateQuote("", chunks), null);
  assertEquals(locateQuote(null, chunks), null);
});

Deno.test("locateQuote: sans chunk (document sans couche texte), tout est null", () => {
  // ⚠️ Ce null ne veut PAS dire « le modèle a invente »: il n'y a rien a
  // chercher. C'est `text_status` qui porte la difference, pas l'ancrage.
  assertEquals(locateQuote("une phrase parfaitement reelle", []), null);
});

// ---------------------------------------------------------------------------
// Les clés et la dédup
// ---------------------------------------------------------------------------

Deno.test("citationEntryKey: la clé suit le texte, pas sa typographie", () => {
  assertEquals(
    citationEntryKey("Hunger is information, not weakness."),
    citationEntryKey("hunger is information — not weakness"),
  );
});

Deno.test("citationEntryKey: bornée à 200 caractères", () => {
  assertEquals(citationEntryKey("mot ".repeat(200)).length <= 200, true);
});

Deno.test("boundQuote: tronque au plafond de la base plutôt que de jeter", () => {
  const long = "x".repeat(CITATION_QUOTE_MAX_CHARS + 50);
  const out = boundQuote(long);
  assertEquals(out.length, CITATION_QUOTE_MAX_CHARS);
  assert(out.endsWith("..."));
  assertEquals(boundQuote("  courte  "), "courte");
});

Deno.test("dedupeCitations: la première gagne, et une citation creuse est jetée", () => {
  const input: ExtractedCitation[] = [
    { kind: "belief", entryKey: "a", quote: "premiere" },
    { kind: "belief", entryKey: "a", quote: "seconde" },
    { kind: "qa", entryKey: "a", quote: "autre section, meme cle" },
    { kind: "belief", entryKey: "", quote: "sans cle" },
    { kind: "belief", entryKey: "b", quote: "" },
  ];
  const out = dedupeCitations(input);
  assertEquals(out.length, 2);
  assertEquals(out[0].quote, "premiere");
  assertEquals(out[1].kind, "qa");
});

Deno.test("foldForSearch: les chiffres survivent au repli", () => {
  // Une citation qui porte une quantité (« 3 repas », « 90 minutes ») perd son
  // sens si les chiffres disparaissent, et deux phrases distinctes se
  // confondraient.
  assertEquals(foldForSearch("3 repas par jour"), "3 repas par jour");
});
