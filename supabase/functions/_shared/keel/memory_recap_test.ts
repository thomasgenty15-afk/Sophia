// LE RÉCAP DU SOIR — la moitié « on le DIT » de l'arbitrage du 2026-09-01.
//
//   1. QUE LA SÉCURITÉ DÉPENDE D'AUTRE CHOSE POUR SORTIR. Prévenir de
//      l'enregistrement d'une allergie ne peut pas attendre qu'il y ait eu un
//      plat coché ce soir-là.
//   2. QUE LE « DÉFAIRE » DISPARAISSE. Sans lui, l'écriture redevient une
//      contrainte médicale posée dans le dos de quelqu'un — et l'arbitrage
//      n'existe plus.
//   3. QUE LA DATE D'EXPIRATION SE PERDE. §6: une règle dont la date ne se voit
//      pas se découvre morte un lundi matin.
//   4. QU'UN `kind` INCONNU FABRIQUE UNE PHRASE. Un libellé inventé se lit
//      comme un bug, et fait douter de la ligne qui porte l'allergie.

import { assert, assertEquals } from "jsr:@std/assert@1";

import { buildMemoryRecap } from "./memory_recap.ts";

Deno.test("⛔ LA SÉCURITÉ SORT MÊME SEULE, avec son « défaire »", () => {
  const fr = buildMemoryRecap({
    safety: [{ kind: "allergy", ref: "peanut", who: null }],
    kept: [],
    language: "fr",
  });
  assert(fr, "une allergie seule ne produit aucun message: l'arbitrage tombe");
  assert(fr!.includes("une allergie"));
  assert(fr!.includes("peanut"));
  assert(/fiche santé/i.test(fr!), "le « défaire » a disparu");
});

Deno.test("une bouche nommée est NOMMÉE — pas « quelqu'un »", () => {
  const fr = buildMemoryRecap({
    safety: [{ kind: "diet", ref: "vegetarian", who: "Tom" }],
    kept: [],
    language: "fr",
  })!;
  assert(fr.includes("Tom"), "on ne dit pas DE QUI il s'agit");
  assert(fr.includes("vegetarian"));
});

Deno.test("⛔ LA DATE D'EXPIRATION EST DITE — §6", () => {
  const fr = buildMemoryRecap({
    safety: [],
    kept: [{ text: "Je n'aime pas le poulet", until: "dimanche 6" }],
    language: "fr",
  })!;
  assert(fr.includes("Je n'aime pas le poulet"));
  assert(fr.includes("dimanche 6"), "la date d'expiration ne se voit plus");
  // Une ligne durable n'invente pas de date.
  const durable = buildMemoryRecap({
    safety: [],
    kept: [{ text: "plus de fenouil", until: null }],
    language: "fr",
  })!;
  assert(!/jusqu/i.test(durable), "une date a été inventée pour une ligne durable");
});

Deno.test("⛔ UN `kind` INCONNU NE FABRIQUE PAS DE PHRASE", () => {
  const fr = buildMemoryRecap({
    safety: [{ kind: "nawak", ref: "peanut", who: null }],
    kept: [],
    language: "fr",
  })!;
  assert(fr.includes("peanut"));
  assert(!/une nawak|un nawak/.test(fr), "un libellé a été inventé");
});

Deno.test("les deux langues, et elles diffèrent", () => {
  const args = {
    safety: [{ kind: "allergy", ref: "peanut", who: null }],
    kept: [] as { text: string; until: string | null }[],
  };
  const fr = buildMemoryRecap({ ...args, language: "fr" })!;
  const en = buildMemoryRecap({ ...args, language: "en" })!;
  assert(fr !== en, "les deux langues rendent le même texte");
  assert(/health details/i.test(en), "le « défaire » anglais a disparu");
});

Deno.test("⛔ LES GUILLEMETS SUIVENT LA LANGUE", () => {
  // Ils étaient en dur en français des deux côtés: une ligne anglaise citée
  // « comme ça » se lit comme un copier-coller raté — sur le message même qui
  // annonce une allergie.
  const kept = [{ text: "no fish", until: null }];
  const fr = buildMemoryRecap({ safety: [], kept, language: "fr" })!;
  const en = buildMemoryRecap({ safety: [], kept, language: "en" })!;
  assert(fr.includes("« no fish »"), "les guillemets français ont changé");
  assert(!en.includes("«"), "le récap anglais cite avec des guillemets français");
  assert(en.includes("\u201cno fish\u201d"), "les guillemets anglais manquent");
});

Deno.test("⛔ `null` EST LE CAS NORMAL — pas de « je n'ai rien noté »", () => {
  // T4 protège ce message de l'encombrement: une ligne par soir qui ne dit
  // rien est exactement ce qu'il existe pour empêcher.
  assertEquals(buildMemoryRecap({ safety: [], kept: [], language: "fr" }), null);
  assertEquals(
    buildMemoryRecap({ safety: [{ kind: "allergy", ref: "  ", who: null }], kept: [], language: "fr" }),
    null,
    "une déclaration vide a produit une phrase",
  );
});

Deno.test("plusieurs déclarations: le « défaire » s'accorde", () => {
  const fr = buildMemoryRecap({
    safety: [
      { kind: "allergy", ref: "peanut", who: null },
      { kind: "diet", ref: "vegetarian", who: "Tom" },
    ],
    kept: [],
    language: "fr",
  })!;
  assert(/les enlever/.test(fr), "le pluriel du « défaire » ne suit pas");
});

Deno.test("⛔ AUCUN BOUTON — le retrait vit sur SON écran", () => {
  // §2.8: « s'il peut écrire une allergie en un tap, pourquoi pas un aliment
  // évité ? ». Ce module rend une CHAÎNE, et c'est ce qui l'empêche d'en
  // porter un.
  const out = buildMemoryRecap({
    safety: [{ kind: "allergy", ref: "peanut", who: null }],
    kept: [],
    language: "fr",
  });
  assertEquals(typeof out, "string");
});

Deno.test("LE CÂBLAGE — le pouls calcule le récap et le PASSE au message", async () => {
  // ⛔ SANS CE TEST, LA MOITIÉ « ON LE DIT » DE L'ARBITRAGE DU 2026-09-01 PEUT
  // DISPARAÎTRE SANS QU'AUCUN TEST NE ROUGISSE — et l'écriture d'une allergie
  // sans consentement resterait, seule, c'est-à-dire une contrainte médicale
  // posée dans le dos de quelqu'un.
  const src = (await Deno.readTextFile(
    new URL("../../keel-daily-pulse-v1/index.ts", import.meta.url),
  ))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
  assert(
    src.includes("const memory = await memoryRecapFor({"),
    "le pouls ne calcule plus le récap",
  );
  assert(
    /renderPulseMessage\(\{[\s\S]{0,200}memory,/.test(src),
    "CALCULÉ MAIS JAMAIS PASSÉ: « rendu » n'est pas « dit »",
  );
  // ⚠️ ET IL N'EST PAS ÉCRIT AU REGISTRE DES DEMANDES. Un récap qui
  // consommerait `DAILY_ASK_BUDGET` ferait taire la question du jour — T4
  // borne les demandes, pas les comptes rendus.
  const at = src.indexOf("const memory = await memoryRecapFor({");
  const around = src.slice(at, at + 400);
  assert(
    !/meal_precision_questions|recordDailyAsk|DAILY_ASK/.test(around),
    "le récap est écrit au registre des demandes: c'est un ÉNONCÉ",
  );
});

Deno.test("⛔ LE RÉCAP TIENT SEUL dans le message du soir", async () => {
  // Prévenir de l'enregistrement d'une allergie ne peut pas dépendre du fait
  // qu'il y ait eu un plat coché ce soir-là.
  const { renderPulseMessage } = await import("./daily_pulse.ts");
  const out = renderPulseMessage({
    recapBody: null,
    memory: "J'ai noté une allergie : peanut.",
    ask: false,
    strip: null,
    locale: "fr-FR",
  });
  assert(out.body.includes("peanut"), "le récap seul ne produit aucun message");
  assertEquals(out.buttons.length, 0, "le récap a fabriqué un bouton");
});
