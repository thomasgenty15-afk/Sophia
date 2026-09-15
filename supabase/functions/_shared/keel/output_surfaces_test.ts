// ═══════════════════════════════════════════════════════════════════════════
// LES SURFACES DE SORTIE — CE QUE CES TESTS PROTÈGENT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE DÉFAUT FERMÉ (revue du 2026-09-12, P1 §2, reproduit dans
// `meal_generation_test.ts`): le texte concaténé du verrou se fabriquait à la
// main à deux endroits, avec deux listes de champs différentes, et aucune des
// deux ne portait `cooking_sessions[].run_through`. Une consigne de cuisine
// dangereuse sortait donc `clean`.
//
// ⛔ CE QUI EST ÉPINGLÉ ICI: le RECENSEMENT. La détection reste
// `applyKeelOutputLocks` — jamais un second matcher.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  collectOutputSurfaces,
  OUTPUT_SURFACE_KINDS,
  outputSurfaceCounts,
  outputSurfacesText,
} from "./output_surfaces.ts";
import { MEAL_TRANSLATABLE_FIELDS } from "./meal_generation.ts";

function plat(over: Record<string, unknown> = {}) {
  return {
    name: null,
    title: "Riz au poulet",
    method: "Sers le riz avec le poulet.",
    why: "Parce que.",
    day: "mon",
    slot: "dinner",
    memberId: null,
    ingredients: [{ term: "rice" }],
    uses: [{ preparationId: "prep_poulet" }],
    boxes: [],
    ...over,
  } as Parameters<typeof collectOutputSurfaces>[0]["dishes"][number];
}

const POT = {
  id: "prep_poulet",
  title: "Poulet rôti",
  method: "Fais rôtir les cuisses.",
  ingredients: [{ term: "chicken thighs" }],
};

function recense(over: Partial<Parameters<typeof collectOutputSurfaces>[0]> = {}) {
  return collectOutputSurfaces({
    dishes: [plat()],
    preparations: [POT],
    cookingSessions: [],
    portionNotes: [],
    explanationLines: [],
    shoppingTerms: [],
    ...over,
  });
}

// ---------------------------------------------------------------------------
// ① LE DÉROULÉ EST UNE SURFACE, ET IL PORTE SON ADRESSE
// ---------------------------------------------------------------------------

Deno.test("① le déroulé d'une session est recensé, avec ses casseroles", () => {
  const surfaces = recense({
    cookingSessions: [{
      day: "mon",
      preparationIds: ["prep_poulet"],
      runThrough: "Chauffe le four, puis fais rôtir.",
    }],
  });
  const sessions = surfaces.filter((s) => s.kind === "cooking_session");
  assertEquals(sessions.length, 1);
  assertEquals(sessions[0].text, "Chauffe le four, puis fais rôtir.");
  assertEquals(sessions[0].address.sessionIndex, 0);
  assertEquals(sessions[0].address.day, "mon");
  assertEquals(sessions[0].address.preparationIds, ["prep_poulet"]);
  // ⛔ PAS DE MOMENT INVENTÉ. Une session n'est pas un repas; lui écrire
  // `slot: "dinner"` pour qu'un périmètre la résolve serait une attribution
  // arbitraire, et le plan l'interdit en toutes lettres.
  assertEquals(sessions[0].address.slot, null);
});

Deno.test("① bis un déroulé VIDE n'est pas recensé — le dénominateur ne bouge pas", () => {
  const surfaces = recense({
    cookingSessions: [{ day: "mon", preparationIds: ["prep_poulet"], runThrough: "  " }],
  });
  assertEquals(surfaces.filter((s) => s.kind === "cooking_session").length, 0);
});

// ---------------------------------------------------------------------------
// ② LES CONSOMMATEURS SONT CALCULÉS, JAMAIS LE PREMIER TROUVÉ
// ---------------------------------------------------------------------------

Deno.test("② foyer de deux: une session commune nomme LES DEUX bouches", () => {
  const surfaces = recense({
    dishes: [
      plat({ memberId: null, boxes: [{ memberIds: ["m_ana", "m_bo"], items: [] }] }),
    ],
    cookingSessions: [{
      day: "mon",
      preparationIds: ["prep_poulet"],
      runThrough: "Fais rôtir le poulet pour les deux.",
    }],
  });
  const session = surfaces.find((s) => s.kind === "cooking_session");
  assert(session !== undefined);
  assertEquals(session.address.memberIds, ["m_ana", "m_bo"]);
  // ⛔ ET AUCUNE N'EST ÉLUE `memberId`: la session n'appartient à personne.
  assertEquals(session.address.memberId, null);
});

Deno.test("② bis foyer de quatre: une casserole partagée sur DEUX jours rend ses quatre consommateurs", () => {
  const surfaces = recense({
    dishes: [
      plat({
        day: "mon",
        boxes: [{ memberIds: ["m_ana", "m_bo"], items: [] }],
      }),
      plat({
        day: "tue",
        boxes: [{ memberIds: ["m_cy", "m_di"], items: [] }],
      }),
    ],
    cookingSessions: [{
      day: "mon",
      preparationIds: ["prep_poulet"],
      runThrough: "Une seule fournée pour les deux jours.",
    }],
  });
  const pot = surfaces.find((s) => s.kind === "preparation");
  assert(pot !== undefined);
  assertEquals(pot.address.memberIds, ["m_ana", "m_bo", "m_cy", "m_di"]);
  const session = surfaces.find((s) => s.kind === "cooking_session");
  assert(session !== undefined);
  assertEquals(session.address.memberIds, ["m_ana", "m_bo", "m_cy", "m_di"]);
});

Deno.test("② ter un plat DÉDIÉ garde son propriétaire, et lui seul", () => {
  const surfaces = recense({
    dishes: [plat({ memberId: "m_ana", boxes: [] })],
  });
  const d = surfaces.find((s) => s.kind === "dish");
  assert(d !== undefined);
  assertEquals(d.address.memberId, "m_ana");
  assertEquals(d.address.memberIds, ["m_ana"]);
});

// ---------------------------------------------------------------------------
// ③ LE NOM D'USAGE — LA PREMIÈRE LIGNE QU'ON LIT, ET ELLE MANQUAIT
// ---------------------------------------------------------------------------

Deno.test("③ le nom d'usage entre dans le texte contrôlé du plat", () => {
  const surfaces = recense({
    dishes: [plat({ name: "Le bol doré de Marrakech" })],
  });
  const d = surfaces.find((s) => s.kind === "dish");
  assert(d !== undefined);
  assert(
    d.text.includes("Le bol doré de Marrakech"),
    `le nom d'usage n'est pas dans le texte: ${d.text}`,
  );
});

Deno.test("③ bis un libellé de CONTENANT est sa propre surface", () => {
  const surfaces = recense({
    dishes: [plat({
      boxes: [{ memberIds: ["m_ana"], items: [{ term: "beurre de cacahuète" }] }],
    })],
  });
  const items = surfaces.filter((s) => s.kind === "box_item");
  assertEquals(items.length, 1);
  assertEquals(items[0].address.term, "beurre de cacahuète");
  assertEquals(items[0].address.memberIds, ["m_ana"]);
});

// ---------------------------------------------------------------------------
// ④ LE TEXTE DU VERROU GLOBAL DESCEND DES MÊMES SURFACES
// ---------------------------------------------------------------------------

Deno.test("④ le texte concaténé contient CHAQUE surface, et rien d'autre", () => {
  const surfaces = recense({
    cookingSessions: [{
      day: "mon",
      preparationIds: ["prep_poulet"],
      runThrough: "DEROULE",
    }],
    portionNotes: ["NOTE"],
    shoppingTerms: ["COURSE"],
  });
  const texte = outputSurfacesText(surfaces);
  for (const attendu of ["DEROULE", "NOTE", "COURSE", "Poulet rôti", "Riz au poulet"]) {
    assert(texte.includes(attendu), `${attendu} absent du texte contrôlé`);
  }
  // ⛔ LA PROPRIÉTÉ QUI FERME LE DÉFAUT: le texte global et la liste localisée
  // sont la MÊME chose. Tant qu'ils étaient deux listes, l'une pouvait oublier
  // ce que l'autre lisait — et c'est arrivé.
  assertEquals(texte.split("\n").length, surfaces.length);
});

Deno.test("④ bis les compteurs portent leur dénominateur, famille par famille", () => {
  const counts = outputSurfaceCounts(recense({
    cookingSessions: [{ day: "mon", preparationIds: [], runThrough: "x" }],
    shoppingTerms: ["riz", "poulet"],
  }));
  assertEquals(counts.dish, 1);
  assertEquals(counts.preparation, 1);
  assertEquals(counts.cooking_session, 1);
  assertEquals(counts.shopping, 2);
  assertEquals(counts.portion_note, 0);
  assertEquals(counts.box_item, 0);
  // ⚠️ TOUTES LES FAMILLES SONT PRÉSENTES, MÊME À ZÉRO. Une clé absente et un
  // zéro ne se relisent pas pareil.
  assertEquals(Object.keys(counts).sort(), [...OUTPUT_SURFACE_KINDS].sort());
});

// ---------------------------------------------------------------------------
// ⑤ LE CÂBLAGE — LA LISTE DES CHAMPS NE PEUT PLUS DIVERGER EN SILENCE
// ---------------------------------------------------------------------------

Deno.test("⑤ chaque champ de prose de `MEAL_TRANSLATABLE_FIELDS` est recensé", () => {
  // ⛔ POURQUOI CE TEST EXISTE. `MEAL_TRANSLATABLE_FIELDS` est la seule liste du
  // dépôt qui énumère « la prose que l'élève lit ». Le recensement doit la
  // couvrir, sinon un champ ajouté là-bas sortirait sans contrôle — très
  // exactement ce qui est arrivé au déroulé des sessions.
  const surfaces = recense({
    dishes: [plat({
      name: "NOM",
      title: "TITRE",
      method: "METHODE",
      why: "POURQUOI",
      ingredients: [{ term: "TERME_PLAT" }],
    })],
    preparations: [{
      id: "prep_poulet",
      title: "TITRE_POT",
      method: "METHODE_POT",
      ingredients: [{ term: "TERME_POT" }],
    }],
    cookingSessions: [{ day: "mon", preparationIds: [], runThrough: "DEROULE" }],
  });
  const texte = outputSurfacesText(surfaces);
  /** Le témoin planté dans chaque champ de prose de la liste. */
  const temoins: Record<string, string> = {
    "dishes[].name": "NOM",
    "dishes[].title": "TITRE",
    "dishes[].method": "METHODE",
    "dishes[].why": "POURQUOI",
    "dishes[].ingredients[].term": "TERME_PLAT",
    "preparations[].title": "TITRE_POT",
    "preparations[].method": "METHODE_POT",
    "preparations[].ingredients[].term": "TERME_POT",
    "cooking_sessions[].run_through": "DEROULE",
  };
  for (const champ of MEAL_TRANSLATABLE_FIELDS) {
    // ⚠️ LES QUANTITÉS SONT HORS PÉRIMÈTRE, ET C'EST DIT. « 300 g » est rendu
    // par `renderQuantity`, pas écrit par le modèle: le contrôler ferait lire
    // une sortie du moteur comme une sortie du modèle.
    if (champ.endsWith("].quantity")) continue;
    const temoin = temoins[champ] ?? null;
    assert(
      temoin !== null,
      `${champ} est traduit mais n'a pas de témoin dans ce test — ` +
        `ajoute-le au recensement AVANT d'ajouter le témoin`,
    );
    assert(texte.includes(temoin), `${champ} n'est pas recensé`);
  }
});


// ---------------------------------------------------------------------------
// ⑥ ⟳ 2026-09-13 (second passage) — LA PROSE D'EXPLICATION
// ---------------------------------------------------------------------------

Deno.test("⑥ chaque ligne d'explication est sa propre surface", () => {
  // ⛔ LE TROU FERMÉ, ET IL EST DE LA MÊME FAMILLE QUE LE DÉROULÉ DE SESSION.
  // `explanation[]` est écrite par le modèle, déclarée traduisible et RENDUE À
  // L'ÉCRAN (`PlanDraftDialog.tsx`) — et `gatePlanExplanation` ne reçoit que
  // les prénoms de la table et les libellés de règles de maison. Elle ne
  // passait par aucun verrou d'allergène.
  const surfaces = recense({
    explanationLines: [
      "La cuisson du dimanche couvre les trois dîners.",
      "Le beurre de cacahuète remplace le tahini.",
    ],
  });
  const prose = surfaces.filter((s) => s.kind === "explanation");
  assertEquals(prose.length, 2);
  assertEquals(prose[0].address.index, 0);
  assertEquals(prose[1].address.index, 1);
  assert(prose[1].text.includes("beurre de cacahuète"));
  // ⛔ ET ELLE ENTRE DANS LE TEXTE SOUMIS AU VERROU.
  assert(outputSurfacesText(surfaces).includes("beurre de cacahuète"));
});

Deno.test("⑥ bis — une explication VIDE ne bouge aucun dénominateur", () => {
  const counts = outputSurfaceCounts(recense({ explanationLines: ["", "   "] }));
  assertEquals(counts.explanation, 0);
});
