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

import { buildMemoryRecap, buildSafetyNotWrittenNotice, type RecapKept } from "./memory_recap.ts";

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
    kept: [{ text: "Je n'aime pas le poulet", until: "dimanche 6", kind: "next_plan" as const, who: null }],
    language: "fr",
  })!;
  assert(fr.includes("Je n'aime pas le poulet"));
  assert(fr.includes("dimanche 6"), "la date d'expiration ne se voit plus");
  // Une ligne durable n'invente pas de date.
  const durable = buildMemoryRecap({
    safety: [],
    kept: [{ text: "plus de fenouil", until: null, kind: "next_plan" as const, who: null }],
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
    kept: [] as RecapKept[],
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
  const kept = [{ text: "no fish", until: null, kind: "next_plan" as const, who: null }];
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

Deno.test("LE CÂBLAGE — la bulle « j'ai noté … » part AU MOMENT DU GESTE", async () => {
  // ⛔ SANS CE TEST, LA MOITIÉ « ON LE DIT » DE L'ARBITRAGE DU 2026-09-01 PEUT
  // DISPARAÎTRE SANS QU'AUCUN TEST NE ROUGISSE — et l'écriture d'une allergie
  // sans consentement resterait, seule, c'est-à-dire une contrainte médicale
  // posée dans le dos de quelqu'un.
  //
  // ⟳ CE TEST A CHANGÉ D'OBJET LE 2026-09-08, IL N'A PAS ÉTÉ AFFAIBLI.
  //
  // Il lisait `keel-daily-pulse-v1` et vérifiait que le message du soir
  // calculait le récap et le PASSAIT au rendu. Ce job est supprimé. Mais la
  // moitié « on le dit » ne partait déjà plus par lui: `notifyMemoryWrite`
  // l'annonce AU MOMENT DU GESTE depuis que l'en-tête de
  // `memory_clarification_io.ts` a acté que « six heures plus tard, le lien
  // n'est plus évident ». Le message du soir en était la copie tardive.
  //
  // On garde donc EXACTEMENT la même propriété — un écrit durable est annoncé —
  // sur les deux chemins qui écrivent réellement.
  const read = async (rel: string) =>
    (await Deno.readTextFile(new URL(rel, import.meta.url)))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
      .join("\n");

  // ① Le retour de fin de plan — la source qui écrit une allergie déclarée.
  const feedback = await read("../../keel-plan-feedback-v1/index.ts");
  assert(
    feedback.includes("notifyMemoryWrite("),
    "LE BILAN DE FIN DE PLAN N'ANNONCE PLUS: il écrit une préférence durable, " +
      "et parfois une allergie, sans le dire. C'est le magasin invisible que " +
      "l'arbitrage du 2026-09-01 existe pour fermer.",
  );

  // ② Le classifieur de note libre — l'autre source du modèle.
  const classify = await read("./draft_note_classify_io.ts");
  assert(
    classify.includes("notifyMemoryWrite("),
    "LE CLASSIFIEUR N'ANNONCE PLUS ce qu'il range.",
  );
  assert(
    classify.includes("notifySafetyNotWritten("),
    "LE REFUS DE SÉCURITÉ N'EST PLUS DIT: un refus muet se lit comme un " +
      "enregistrement réussi.",
  );

  // ⚠️ ET CE N'EST PAS ÉCRIT AU REGISTRE DES DEMANDES. Un énoncé qui
  // consommerait `DAILY_ASK_BUDGET` ferait taire une demande du jour — T4
  // borne les demandes, pas les comptes rendus.
  for (const [name, src] of [["bilan", feedback], ["classifieur", classify]]) {
    const at = src.indexOf("notifyMemoryWrite(");
    assert(
      !/meal_precision_questions|recordDailyAsk|DAILY_ASK/.test(
        src.slice(Math.max(0, at - 400), at + 400),
      ),
      `${name}: l'annonce est écrite au registre des demandes: c'est un ÉNONCÉ`,
    );
  }
});

Deno.test("⛔ LE RÉCAP TIENT SEUL — sans plat coché, sans rien d'autre", async () => {
  // Prévenir de l'enregistrement d'une allergie ne peut pas dépendre du fait
  // qu'il y ait eu un plat coché ce jour-là.
  //
  // ⟳ Cette propriété se vérifiait sur `renderPulseMessage`, le rendu du
  // message du soir. Elle se vérifie maintenant sur `buildMemoryRecap`, qui est
  // le rendu que `notifyMemoryWrite` envoie — c'est-à-dire là où elle vit
  // désormais.
  const { buildMemoryRecap } = await import("./memory_recap.ts");
  const out = buildMemoryRecap({
    safety: [],
    kept: [{ text: "peanut", until: null, kind: "preference", who: null }],
    language: "fr",
  });
  assert(
    String(out ?? "").includes("peanut"),
    "le récap seul ne produit aucun message",
  );
});

// ===========================================================================
// LOT D · LE RÉCAP DIT LES TROIS DESTINATIONS, ET DIT POUR QUI
//
// ── LE DÉFAUT QUE CES TESTS FERMENT ───────────────────────────────────────
// Le récap n'annonçait QUE l'encart (`retained_next_plan`) — c'est-à-dire le
// magasin PROVISOIRE, celui qui meurt au plan suivant. Les deux sources du
// modèle écrivent aussi une préférence DURABLE, qui gouverne toutes les
// semaines à venir, et une NOTE. On prévenait donc pour le provisoire et on se
// taisait sur le permanent, ce qui est l'inverse de ce qu'il faut.
//
// ⚠️ « ON RETIENT, ET ON LE DIT » est la moitié du modèle qui rend la mémoire
// acceptable. Une préférence durable écrite en silence est exactement le
// magasin invisible que ce chantier existe pour fermer.
// ===========================================================================

Deno.test("LOT D — une PRÉFÉRENCE et une NOTE ont chacune leur bloc", () => {
  const out = buildMemoryRecap({
    safety: [],
    kept: [
      { text: "pas de saumon", until: null, kind: "preference", who: "Tom" },
      { text: "danse le mardi soir", until: null, kind: "note", who: "Léa" },
      { text: "des fajitas", until: null, kind: "next_plan", who: null },
    ],
    language: "fr",
  });
  assert(out !== null);
  // Les trois intros sont là, et elles sont DIFFÉRENTES: fondre les trois sous
  // « j'ai gardé ça » laisserait la personne sans moyen de savoir où corriger.
  assert(out.includes("dans l'assiette"), "le bloc des préférences manque");
  assert(out.includes("J'ai retenu"), "le bloc des notes manque");
  assert(out.includes("de ton retour"), "le bloc de l'encart manque");
  // ⚠️ LE SUJET COLLE À LA LIGNE. Deux bouches dans le même message: une intro
  // « pour Tom » suivie d'une ligne qui parle de Léa serait un fait FAUX.
  assert(out.includes("Tom :"), "la préférence ne dit pas de qui elle parle");
  assert(out.includes("Léa :"), "la note ne dit pas de qui elle parle");
});

Deno.test("LOT D — l'ordre des blocs est celui de la carte", () => {
  // ⛔ CE N'EST PAS UNE COQUETTERIE. Le message renvoie vers l'écran, et deux
  // ordres différents pour les mêmes trois choses se lisent comme deux listes
  // différentes — la personne cherche alors ce qu'elle vient de lire.
  const out = buildMemoryRecap({
    safety: [],
    kept: [
      { text: "des fajitas", until: null, kind: "next_plan", who: null },
      { text: "j'ai retenu ceci", until: null, kind: "note", who: null },
      { text: "pas de saumon", until: null, kind: "preference", who: null },
    ],
    language: "fr",
  });
  assert(out !== null);
  const prefs = out.indexOf("dans l'assiette");
  const notes = out.indexOf("J'ai retenu");
  const next = out.indexOf("de ton retour");
  assert(prefs >= 0 && notes >= 0 && next >= 0);
  assert(prefs < notes, "les préférences ne passent plus avant les notes");
  assert(notes < next, "les notes ne passent plus avant l'encart");
});

Deno.test("LOT D — une bouche sans prénom sort SANS prénom, pas avec un uuid", () => {
  // Un identifiant dans un message du soir n'est pas une information, c'est une
  // fuite de plomberie. `who: null` est la bonne réponse quand le roster n'a
  // pas pu être lu — et le récap sort quand même.
  const out = buildMemoryRecap({
    safety: [],
    kept: [{ text: "pas de saumon", until: null, kind: "preference", who: null }],
    language: "fr",
  });
  assert(out !== null);
  assert(out.includes("pas de saumon"));
  assert(!out.includes("member:"), "un identifiant de membre a fuité");
});

Deno.test("LOT D — un bloc VIDE ne sort pas son intro", () => {
  // ⛔ SANS CE CAS, LES TROIS INTROS SORTIRAIENT TOUJOURS, et le message du soir
  // annoncerait deux listes vides sur une seule chose retenue. T4 protège ce
  // message de l'encombrement; trois titres pour une ligne est de
  // l'encombrement.
  const out = buildMemoryRecap({
    safety: [],
    kept: [{ text: "pas de saumon", until: null, kind: "preference", who: null }],
    language: "fr",
  });
  assert(out !== null);
  assert(out.includes("dans l'assiette"));
  assert(!out.includes("J'ai retenu ça"), "le bloc des notes est sorti à vide");
  assert(!out.includes("de ton retour"), "le bloc de l'encart est sorti à vide");
});

Deno.test("LOT D — les trois blocs existent aussi en anglais", () => {
  // ⚠️ LA PARITÉ EST MESURÉE, PAS SUPPOSÉE. Ce dépôt a déjà livré une doctrine
  // française qui sortait en anglais; une copie ajoutée d'un seul côté est la
  // même faute, en plus petit.
  const out = buildMemoryRecap({
    safety: [],
    kept: [
      { text: "no salmon", until: null, kind: "preference", who: "Tom" },
      { text: "dance on Tuesdays", until: null, kind: "note", who: "Lea" },
      { text: "fajitas", until: null, kind: "next_plan", who: null },
    ],
    language: "en",
  });
  assert(out !== null);
  assert(out.includes("on the plate"), "le bloc anglais des préférences manque");
  assert(out.includes("I've kept this"), "le bloc anglais des notes manque");
  assert(out.includes("from your feedback"), "le bloc anglais de l'encart manque");
  assert(out.includes("Tom :"));
});

// ===========================================================================
// LE RÉCAP DU SOIR NE DIT PLUS LA MÉMOIRE — 2026-09-04
// ===========================================================================

Deno.test("l'io du récap ne lit plus les trois magasins de mémoire", async () => {
  // ⛔ LA PROPRIÉTÉ EST UNE ABSENCE, ET ELLE SE MESURE SUR LA SOURCE. Les
  // lignes de mémoire sont dites au moment du geste (`notifyMemoryWrite`); les
  // redire le soir ferait la même annonce deux fois par jour, et la seconde
  // n'apprendrait rien à personne.
  const src = (
    await Deno.readTextFile(new URL("./memory_recap_io.ts", import.meta.url))
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  for (const store of ["retained_items", "retained_next_plan", "practical_constraints"]) {
    assertEquals(
      src.includes(store),
      false,
      `le récap du soir lit encore \`${store}\``,
    );
  }
});

Deno.test("LE CAS QUI PASSE — la SÉCURITÉ, elle, se dit toujours le soir", async () => {
  // ⚠️ SANS CETTE MOITIÉ, le test du dessus serait vert sur un récap devenu
  // muet. Et la sécurité n'est pas un oubli: l'arbitrage du 2026-09-01 a cessé
  // d'exiger un consentement synchrone pour écrire une allergie déclarée dans
  // un retour, et ce qui remplace ce consentement est « on l'écrit, on le DIT,
  // et ça se défait ». Cette annonce EST la justification de l'écriture.
  const src = await Deno.readTextFile(
    new URL("./memory_recap_io.ts", import.meta.url),
  );
  assertEquals(src.includes("student_safety_constraints"), true);
  assertEquals(src.includes("household_member_allergies"), true);
});


Deno.test("⟳ 2026-09-05 — la bulle « je n'ai pas pu enregistrer » nomme la bouche, le genre, et où réparer", () => {
  const fr = buildSafetyNotWrittenNotice({
    failed: [{ kind: "allergy", ref: "peanut", who: "Tom" }],
    language: "fr",
  });
  assert(fr !== null);
  assert(/pas pu enregistrer/.test(fr!), fr!);
  assert(/Tom/.test(fr!) && /peanut/.test(fr!), fr!);
  assert(/fiche du foyer/.test(fr!), fr!);
  const en = buildSafetyNotWrittenNotice({
    failed: [{ kind: "diet", ref: "vegetarian", who: null }],
    language: "en",
  });
  assert(en !== null && /could not save/.test(en!) && /vegetarian/.test(en!), String(en));
  // Rien à dire = pas de bulle.
  assertEquals(buildSafetyNotWrittenNotice({ failed: [], language: "fr" }), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-06 — L'ACCUSÉ DIT LE SENS (cas « Léa n'aime pas les asperges, Marc adore »)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ deux bouches, le même mot, deux sens : l'accusé dit qui veut et qui ne veut pas", () => {
  const out = buildMemoryRecap({
    safety: [],
    kept: [
      { text: "les asperges", until: null, kind: "preference", who: "Léa", sense: "food.exclude" },
      { text: "les asperges", until: null, kind: "preference", who: "Marc", sense: "food.prefer" },
    ],
    language: "fr",
  }) ?? "";
  assert(out.includes("Léa : à éviter — « les asperges »"), out);
  assert(out.includes("Marc : à servir plus souvent — « les asperges »"), out);
  const en = buildMemoryRecap({
    safety: [],
    kept: [
      { text: "asparagus", until: null, kind: "preference", who: "Léa", sense: "food.exclude" },
      { text: "asparagus", until: null, kind: "preference", who: "Marc", sense: "food.prefer" },
    ],
    language: "en",
  }) ?? "";
  assert(en.includes("Léa : to avoid — \u201casparagus\u201d"), en);
  assert(en.includes("Marc : to serve more often — \u201casparagus\u201d"), en);
});

Deno.test("sans sens (une note, un réglage) la ligne reste telle qu'avant ; un sens inconnu ne fabrique rien", () => {
  const out = buildMemoryRecap({
    safety: [],
    kept: [
      { text: "danse le mardi soir", until: null, kind: "note", who: "Léa" },
      { text: "moins de sel", until: null, kind: "preference", who: null, sense: "rhythm.set" },
    ],
    language: "fr",
  }) ?? "";
  assert(out.includes("· Léa : « danse le mardi soir »"), out);
  assert(out.includes("· « moins de sel »"), out);
  assert(!out.includes(" — «"), "un sens inconnu a fabriqué un mot:\n" + out);
});

Deno.test("CÂBLAGE — les deux producteurs d'un accusé de préférence passent le sens", async () => {
  const io = await Deno.readTextFile(new URL("./draft_note_classify_io.ts", import.meta.url));
  const fb = await Deno.readTextFile(new URL("../../keel-plan-feedback-v1/index.ts", import.meta.url));
  assert(/kind: "preference",\n\s*who: whoOf\(item\.subject\),\n\s*sense: item\.kind,/.test(io), "la classification de note n'annonce plus le sens d'une préférence");
  assert(/kind: "next_plan",\n\s*who: whoOf\(entry\.item\.subject\),\n\s*sense: entry\.item\.kind,/.test(io), "l'encart n'annonce plus le sens");
  assert(/sense: item\.kind,/.test(fb), "le retour de plan n'annonce plus le sens d'une préférence");
});
