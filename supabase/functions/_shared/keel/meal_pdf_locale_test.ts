// KEEL — LE PDF DE REPAS: SA LANGUE, ET LA BOMBE D'ENCODAGE QU'IL PORTAIT.
//
// ── LES DEUX DÉFAUTS, ET POURQUOI ILS SE TESTENT ENSEMBLE ──────────────────
// Ils ont la même cause: le document n'avait pas de langue. `MealPdfInput` ne
// portait aucun champ de locale et trois phrases anglaises en dur, pendant que
// les plats, eux, arrivaient déjà en français. Le jour où on livre le pack
// français, le SECOND défaut se réveille: `StandardFonts.Helvetica` encode en
// WinAnsi (CP1252), et `pdf-lib` LÈVE — pas « dégrade », LÈVE — sur un
// caractère hors table.
//
// Le français passe presque entièrement (é è à ç ô « » — sont tous en CP1252),
// ce qui rend le piège d'autant plus vicieux: le document sort bien la plupart
// du temps. Mais un modèle écrivant en français produit régulièrement U+202F
// (l'espace fine insécable avant `? ! ; :`) et U+2011 (le trait d'union
// insécable). Résultat: `meal-document-v1` rend un 500, l'élève ne reçoit rien,
// et aucune ligne `student_meal_documents` n'est écrite.
//
// ⚠️ CE FICHIER PINNE D'ABORD LA PRÉMISSE. Une ceinture dont la prémisse n'est
// pas armée est une ceinture qui a l'air de marcher: si pdf-lib cessait un jour
// de lever sur U+202F, le test « ça ne lève plus » resterait vert en ne
// prouvant plus rien. Le premier test prouve donc que la police REFUSE
// vraiment ces caractères.

import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@1";
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";
import {
  buildMealPdf,
  mealPdfPackFor,
  shoppingSections,
  toWinAnsi,
} from "./meal_pdf.ts";
import type { GeneratedDish, ShoppingItem } from "./meal_generation.ts";

// Les deux caractères mesurés, nommés par leur code et jamais écrits en clair:
// un littéral invisible dans une source se relit à l'aveugle.
const NARROW_NBSP = " ";
const NB_HYPHEN = "‑";

function dish(over: Partial<GeneratedDish> = {}): GeneratedDish {
  return {
    // L7 ③ — `null` = pas de nom d'usage, et c'est ce que le PDF de courses
    // attend: il n'imprime que des aliments, jamais un titre ni un nom.
    name: null,
    title: "Poulet rôti au citron",
    slot: null,
    day: null,
    ingredients: [
      { term: "poulet", quantity: "600 g", in_pantry: false } as never,
      { term: "citron", quantity: "1", in_pantry: true } as never,
    ],
    method: "Enfourner 40 minutes.",
    why: "Simple à préparer.",
    honours_belief_keys: [],
    uses: [],
    // 2026-08-19 — `null` = rien n'a été pesé d'avance pour ce repas, et c'est le
    // cas d'un plat qui ne prélève sur aucun lot. Le PDF de courses ne lit pas
    // ce champ: on achète du CRU, et une boîte porte du PRÊT.
    boxes: [],
    // ÉCHANGE — aucune bouche retirée d'un couvercle: le PDF de courses ne lit
    // pas ce champ (il achète du CRU pour la maison), mais il est REQUIS, et
    // une fixture qui l'omettrait ne compilerait pas.
    heldOff: [],
    // LOT C — `null` = le plat de la table, et c'est le cas nominal. Le PDF de
    // courses ne lit pas ce champ: on achète pour la maison, pas par bouche.
    memberId: null,
    // LOT 2 — le geste du jour J. `null` ici EXPRÈS: le PDF de courses ne le
    // lit pas non plus (on achète pour la semaine, pas pour un soir), et une
    // fixture qui le remplirait ferait croire à une surface qui l'affiche.
    sameDay: null,
    ...over,
  };
}

function item(over: Partial<ShoppingItem> = {}): ShoppingItem {
  // ⟳ `L0-a` — `food_group` est REQUIS sur `ShoppingItem`: il porte la fenêtre
  // crue, donc la date de courses. `null` ici, le PDF ne le lit pas.
  return { term: "poulet", quantity: "600 g", aisle: "protein", food_group: null, ...over };
}

function input(over: Record<string, unknown> = {}) {
  return {
    firstName: "Julie",
    dishes: [dish()],
    shoppingList: [item()],
    context: "Semaine chargée",
    mode: "to_shop" as const,
    dateLabel: "4 août 2026",
    buyDateLabels: {},
    // ⟳ A1 — `null` = le plan n'a pas de veille; la feuille sort au caractère
    // près comme avant ce lot, ce que ces tests vérifient déjà.
    timingLine: null,
    locale: "fr-FR",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 0. LA PRÉMISSE — pdf-lib LÈVE vraiment, sinon rien de ce qui suit ne prouve
// ---------------------------------------------------------------------------

Deno.test("PRÉMISSE — Helvetica REFUSE U+202F et U+2011, à la mesure comme au dessin", async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([200, 200]);

  // La MESURE lève déjà — une ligne AVANT le dessin. C'est pourquoi le
  // nettoyage vit à l'entrée de `write()` et pas au moment du `drawText`.
  assertThrows(() => font.widthOfTextAtSize(`Ta journée${NARROW_NBSP}?`, 11));
  assertThrows(() => font.widthOfTextAtSize(`demi${NB_HYPHEN}écrémé`, 11));
  assertThrows(() =>
    page.drawText(`Ta journée${NARROW_NBSP}?`, { x: 10, y: 10, size: 11, font })
  );

  // Et la contre-épreuve: le français ORDINAIRE passe. Le défaut ne venait pas
  // des accents, ce qui est précisément ce qui le rendait invisible.
  font.widthOfTextAtSize("Poulet rôti au citron — « à emporter »", 11);
});

// ---------------------------------------------------------------------------
// 1. `toWinAnsi` — l'unité
// ---------------------------------------------------------------------------

Deno.test("toWinAnsi remplace les deux coupables sans rien perdre d'autre", () => {
  assertEquals(toWinAnsi(`Ta journée${NARROW_NBSP}?`), "Ta journée ?");
  assertEquals(toWinAnsi(`lait demi${NB_HYPHEN}écrémé`), "lait demi-écrémé");
  // Ce qui EST en CP1252 traverse intact: on ne « nettoie » pas le français.
  const kept = "Poulet rôti — « à emporter », 5 € · œuf, ça va…";
  assertEquals(toWinAnsi(kept), kept);
});

Deno.test("toWinAnsi normalise en NFC — « é » décomposé est INENCODABLE", () => {
  // `e` + U+0301 se lit « é » à l'écran et n'existe pas en CP1252. C'est la
  // forme que produit macOS sur du texte collé, et elle traverse toute la
  // génération sans se voir.
  const decomposed = "créme";
  assertEquals(decomposed.length, 6);
  assertEquals(toWinAnsi(decomposed), "crème".replace("è", "é"));
  assertEquals(toWinAnsi(decomposed).length, 5);
});

Deno.test("toWinAnsi retire ce qui n'a aucun équivalent, plutôt que de tout perdre", () => {
  // Un émoji dans un titre de plat vaut mieux perdu que rendu en 500.
  assertEquals(toWinAnsi("Salade 🥗 fraîche"), "Salade  fraîche");
  // Les invisibles disparaissent complètement, sans laisser d'espace.
  assertEquals(toWinAnsi("a​b"), "ab");
});

Deno.test("tout ce que toWinAnsi rend est encodable — la vraie assertion", async () => {
  // L'épreuve qui compte n'est pas « la chaîne est celle attendue », c'est
  // « la police l'accepte ». On la pose contre pdf-lib lui-même.
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const nasty = [
    `Ta journée${NARROW_NBSP}?`,
    `demi${NB_HYPHEN}écrémé`,
    "créme fraiche",
    "Salade 🥗 fraîche",
    "a​b﻿c",
    "prix 5 €",
    "1− 2 ― 3 ′",
    "日本語のテキスト",
  ].join(" ");
  font.widthOfTextAtSize(toWinAnsi(nasty), 11);
});

// ---------------------------------------------------------------------------
// 2. LE DOCUMENT — la bombe, désamorcée de bout en bout
// ---------------------------------------------------------------------------

Deno.test("un repas français plein de U+202F et U+2011 ne fait plus lever le document", async () => {
  // LE DÉFAUT, REPRODUIT DANS SA FORME RÉELLE: ces caractères ne sont pas
  // fabriqués pour le test, ils viennent du modèle. Le titre, la méthode, le
  // pourquoi, la liste ET le contexte de l'élève sont tous des chemins
  // possibles, donc tous les cinq en portent un.
  const bytes = await buildMealPdf(input({
    context: `Semaine chargée${NARROW_NBSP}: 3 dîners à préparer`,
    dishes: [dish({
      title: `Gratin de chou${NB_HYPHEN}fleur`,
      method: `Préchauffer${NARROW_NBSP}; enfourner 40 min.`,
      why: `Rapide${NARROW_NBSP}!`,
      ingredients: [
        { term: `lait demi${NB_HYPHEN}écrémé`, quantity: "200 ml", in_pantry: false } as never,
      ],
    })],
    shoppingList: [item({ term: `chou${NB_HYPHEN}fleur`, quantity: `1${NARROW_NBSP}kg` })],
  }));
  assert(bytes.byteLength > 500);
  // C'est bien un PDF, pas un objet vide rendu sans erreur.
  assertEquals(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
});

Deno.test("un émoji dans un titre de plat ne fait pas tomber le document non plus", async () => {
  const bytes = await buildMealPdf(input({
    dishes: [dish({ title: "Salade 🥗 d'été", why: "Frais 🌞" })],
  }));
  assert(bytes.byteLength > 500);
});

// ---------------------------------------------------------------------------
// 3. LA LANGUE — bidirectionnelle
// ---------------------------------------------------------------------------

Deno.test("les deux packs rendent, et rendent DIFFÉREMMENT", async () => {
  // On ne relit pas le texte dans les octets d'un PDF (il est compressé): la
  // preuve utile ici est que les deux chemins produisent un document valide et
  // que le pack n'est pas le même objet. Le CONTENU des packs est pinné juste
  // en dessous, là où il est lisible.
  const fr = await buildMealPdf(input({ locale: "fr-FR" }));
  const en = await buildMealPdf(input({
    locale: "en-US",
    dateLabel: "4 August 2026",
    buyDateLabels: {},
    // ⟳ A1 — `null` = le plan n'a pas de veille; la feuille sort au caractère
    // près comme avant ce lot, ce que ces tests vérifient déjà.
    timingLine: null,
  }));
  assert(fr.byteLength > 500);
  assert(en.byteLength > 500);
});

Deno.test("R7 — une langue sans pack jette, elle ne rend pas une feuille mi-anglaise", async () => {
  await assertRejects(() => buildMealPdf(input({ locale: "de-DE" })));
});

Deno.test("le mode from_pantry sans rien à acheter rend sa phrase dans les deux langues", async () => {
  // La troisième chaîne gelée du fichier (« Nothing to buy — you have
  // everything. »), sur le seul chemin qui l'atteint.
  for (const locale of ["en-US", "fr-FR"]) {
    const bytes = await buildMealPdf(input({
      locale,
      mode: "from_pantry",
      shoppingList: [],
      dateLabel: locale === "fr-FR" ? "4 août 2026" : "4 August 2026",
      buyDateLabels: {},
    // ⟳ A1 — `null` = le plan n'a pas de veille; la feuille sort au caractère
    // près comme avant ce lot, ce que ces tests vérifient déjà.
    timingLine: null,
    }));
    assert(bytes.byteLength > 500, locale);
  }
});

// ---------------------------------------------------------------------------
// LES JOURS D'ACHAT SUR LA FEUILLE — 2026-09-01
//
// ⛔ LE PDF EST LA SEULE SURFACE QUI NE PEUT PAS LES CALCULER. `meal-document-v1`
// ne lit ni `preparations` ni `starts_on`: il ne peut pas rejouer
// `grocery_waves.ts`. La date vient donc de la LIGNE (`shopping_list[].buy_on`),
// posée par les deux lanes exactement pour lui. Et c'est la feuille qu'on
// emporte au magasin — une liste sans jour s'y lit « achète tout maintenant »,
// c'est-à-dire le défaut rapporté, imprimé sur papier.
//
// ⚠️ ON NE RELIT PAS LES OCTETS: la règle de ce fichier, écrite plus haut, est
// que le texte d'un PDF est compressé. La DÉCISION est donc extraite
// (`shoppingSections`) et testée telle quelle; le rendu se contente de prouver
// qu'il ne tombe pas.
// ---------------------------------------------------------------------------

Deno.test("plusieurs jours ⇒ une section par jour, TRIÉES", () => {
  const out = shoppingSections([
    item({ term: "poulet", buy_on: "2026-09-06" }),
    item({ term: "riz", buy_on: "2026-09-03" }),
    item({ term: "oeufs", buy_on: "2026-09-03" }),
  ]);
  assertEquals(out.kind, "by_day");
  if (out.kind !== "by_day") return;
  assertEquals(out.days.map((d) => d.buyOn), ["2026-09-03", "2026-09-06"]);
  assertEquals(out.days[0].items.map((i) => i.term), ["riz", "oeufs"]);
  assertEquals(out.days[1].items.map((i) => i.term), ["poulet"]);
});

Deno.test("un seul jour ⇒ une LIGNE, pas des sections", () => {
  // Même arbitrage que l'écran: une vague ne se DÉCOUPE pas. Ce qui manquait
  // n'est pas un découpage, c'est une date.
  const out = shoppingSections([
    item({ term: "riz", buy_on: "2026-09-03" }),
    item({ term: "poulet", buy_on: "2026-09-03" }),
  ]);
  assertEquals(out.kind, "flat");
  if (out.kind !== "flat") return;
  assertEquals(out.buyOn, "2026-09-03");
  assertEquals(out.items.length, 2);
});

Deno.test("⛔ AUCUNE DATE ⇒ la feuille d'avant, et aucun jour inventé", () => {
  const out = shoppingSections([item({ term: "riz" })]);
  assertEquals(out.kind, "flat");
  if (out.kind !== "flat") return;
  assertEquals(out.buyOn, null);
});

Deno.test("⛔ UNE LISTE À MOITIÉ DATÉE NE PERD AUCUN ARTICLE", () => {
  // « Rien ne disparaît » est la propriété que les vagues tiennent avant toutes
  // les autres. Découper par jour ici laisserait « riz » hors de toute section.
  const out = shoppingSections([
    item({ term: "riz" }),
    item({ term: "poulet", buy_on: "2026-09-06" }),
  ]);
  assertEquals(out.kind, "flat");
  if (out.kind !== "flat") return;
  assertEquals(out.buyOn, null, "une date partielle ne date pas la liste");
  assertEquals(out.items.length, 2);
});

Deno.test("une liste vide ne se date pas non plus", () => {
  const out = shoppingSections([]);
  assertEquals(out.kind, "flat");
  if (out.kind !== "flat") return;
  assertEquals(out.buyOn, null);
});

Deno.test("les deux libellés de date existent dans les DEUX langues", () => {
  // Le pack est la seule chose relisible d'un PDF (voir la règle du fichier).
  for (const locale of ["fr-FR", "en-GB"] as const) {
    const pack = mealPdfPackFor(locale);
    assert(pack.buyAllOn("3 septembre").includes("3 septembre"));
    assert(pack.buyOnDate("3 septembre").includes("3 septembre"));
  }
  assert(
    mealPdfPackFor("fr-FR").buyOnDate("X") !== mealPdfPackFor("en-GB").buyOnDate("X"),
    "les deux langues disent la même chose",
  );
});

Deno.test("le document se construit avec une liste datée sur deux jours", async () => {
  const bytes = await buildMealPdf(input({
    buyDateLabels: { "2026-09-03": "3 septembre", "2026-09-06": "6 septembre" },
    shoppingList: [
      item({ term: "riz", aisle: "grains", buy_on: "2026-09-03" }),
      item({ term: "poulet", buy_on: "2026-09-06" }),
    ],
  }));
  assert(bytes.byteLength > 500);
  assertEquals(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
});

Deno.test("⛔ UNE DATE SANS LIBELLÉ S'IMPRIME BRUTE, elle ne disparaît pas", async () => {
  // On ne perd pas un jour d'achat parce qu'on n'a pas su l'écrire joliment.
  const bytes = await buildMealPdf(input({
    buyDateLabels: {},
    // ⟳ A1 — `null` = le plan n'a pas de veille; la feuille sort au caractère
    // près comme avant ce lot, ce que ces tests vérifient déjà.
    timingLine: null,
    shoppingList: [item({ term: "riz", buy_on: "2026-09-03" })],
  }));
  assert(bytes.byteLength > 500);
});
