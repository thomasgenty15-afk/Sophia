import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import DishCard from "./DishCard";
import { type GeneratedDish } from "../api/mealGeneration";

// ===========================================================================
// LOT 2 (2026-08-17) — LE COMMENTAIRE DE PRÉPARATION, SUR LA VALEUR RENDUE
//
// ⚠️ POURQUOI CE FICHIER N'EST PAS UN TEST DE SOURCE. Les gardes du LOT 2
// assèrent des littéraux de `DishCard.tsx` — la position du bandeau, l'absence
// des trois durées de session. Elles sont utiles et elles restent, mais aucune
// ne peut répondre à la seule question qui compte ici: « QU'EST-CE QUE LE
// LECTEUR LIT, ET COMBIEN DE FOIS ». C'est le piège mesuré sur le LOT 1: un
// test qui assère le littéral `shoppingList={draft.shoppingList}` reste VERT
// quand cette valeur est un `[]` en dur, et la carte reste vide. On rend donc
// la carte pour de vrai, et on lit ce qui en sort.
//
// `react-dom/server` et PAS un DOM: ce dépôt n'a ni jsdom ni testing-library
// (`vitest.config.ts` → `environment: "node"`), et en ajouter pour cinq
// assertions serait un changement d'outillage qui déborde de très loin ce lot.
// `renderToStaticMarkup` suffit — la question est le CONTENU, pas l'interaction.
//
// ⚠️ `.ts` ET `createElement`, PAS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts`. Un fichier `.tsx` ne serait JAMAIS COLLECTÉ — un test
// vert qui ne tourne pas est pire que pas de test. Mesuré: « No test files
// found ».
// ===========================================================================

const METHOD = "Take Friday's chicken out, reheat a portion and add the salad.";

function dish(over: Partial<GeneratedDish> = {}): GeneratedDish {
  return {
    title: "Chicken and rice bowls",
    slot: "dinner",
    day: "wed",
    why: "It uses the chicken already roasted on Friday.",
    method: METHOD,
    ingredients: [],
    uses: [],
    // ⚠️ `boxes: []` EST OBLIGATOIRE, ET LE `as GeneratedDish` PLUS BAS EST CE
    // QUI L'A CACHÉ: le cast fait taire tsc sur un champ manquant, et
    // `boxLinesForDish` lève alors un `TypeError` au montage — écran blanc.
    // Cette fixture ne met AUCUN contenant, exprès; mais elle doit le DIRE.
    boxes: [],
    same_day: { kind: "reheat_only", minutes: 8 },
    ...over,
  } as GeneratedDish;
}

/**
 * ⚠️ LES ENTITÉS SONT DÉCODÉES, ET C'EST NÉCESSAIRE, PAS COSMÉTIQUE.
 * `renderToStaticMarkup` échappe l'apostrophe en `&#x27;` — donc une méthode
 * réaliste (« Take Friday's chicken out ») ne se retrouve JAMAIS telle quelle
 * dans le HTML. Sans ce décodage, le test échouerait sur l'échappement en
 * faisant croire à une méthode absente. Mesuré le 2026-08-17.
 */
function decode(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function markup(over: Partial<GeneratedDish> = {}): string {
  return decode(renderToStaticMarkup(createElement(DishCard, { dish: dish(over) })));
}

/** Le texte lisible, balises retirées — ce que l'œil reçoit. */
function textOf(over: Partial<GeneratedDish> = {}): string {
  return markup(over).replace(/<[^>]*>/g, "");
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("le commentaire de préparation du jour J, tel qu'il se lit", () => {
  it("⛔ le TEXTE de la méthode est rendu, et EXACTEMENT UNE FOIS", () => {
    const html = textOf();
    // ⛔ LE CŒUR DE P2: « avant chaque plat, il y a toujours un commentaire de
    // préparation » — et le commentaire est ce qui DIT QUOI FAIRE (« reprends
    // le poulet de vendredi »), pas seulement l'étiquette du geste.
    expect(html, "le texte du geste du jour n'est pas rendu").toContain(METHOD);
    // ⛔ ET UNE SEULE FOIS: monté dans le bandeau, `method` ne doit plus
    // réapparaître sous les ingrédients. Relire la même phrase deux fois sur
    // une carte est du bruit, pas de l'insistance.
    expect(
      occurrences(html, METHOD),
      "la méthode est rendue DEUX fois sur la même carte",
    ).toBe(1);
  });

  it("⛔ le texte se lit AVANT les ingrédients, dans l'ordre du document", () => {
    const html = textOf({
      ingredients: [{ term: "cooked rice", quantity: "200 g", in_pantry: false }],
    } as Partial<GeneratedDish>);
    const method = html.indexOf(METHOD);
    const ingredient = html.indexOf("cooked rice");
    expect(method).toBeGreaterThan(-1);
    expect(ingredient).toBeGreaterThan(-1);
    expect(
      method,
      "le geste du jour est repassé SOUS les ingrédients: le lecteur doit " +
        "redescendre le chercher devant sa casserole",
    ).toBeLessThan(ingredient);
  });

  it("le libellé du jeton et la durée accompagnent le texte, sans second en-tête", () => {
    const html = textOf();
    expect(html).toContain("Just reheat");
    expect(html).toContain("8 min");
    // ⚠️ LE JETON REMPLACE le couple « How » / « Before serving », il ne s'y
    // ajoute pas: deux en-têtes pour une seule phrase.
    expect(html, "deux en-têtes pour une seule phrase").not.toContain("How:");
    expect(html, "deux en-têtes pour une seule phrase")
      .not.toContain("Before serving:");
  });

  it("⚠️ LE CAS QUI PASSE — sans `same_day`, la méthode garde sa place d'avant", () => {
    // 157 plans en base ont été écrits avant ce champ, dont 5 encore vivants.
    // Le silence du bandeau ne doit pas leur coûter la seule phrase qui leur
    // dit quoi faire: `method` se rend alors comme avant, sous son libellé.
    const html = textOf({ same_day: null });
    expect(html, "un plan ancien a perdu sa méthode").toContain(METHOD);
    expect(occurrences(html, METHOD)).toBe(1);
    // Le libellé historique est de retour, puisque le jeton ne peut plus le
    // remplacer.
    expect(html).toContain("How:");
    // Et aucun bandeau n'est inventé: `null` n'est pas « rien à préparer ».
    expect(html).not.toContain("Just reheat");
    expect(html).not.toContain("Nothing to prepare");
  });

  it("⚠️ LE CAS QUI PASSE — une méthode vide ne laisse aucun paragraphe vide", () => {
    // « Rien ne s'affiche sans texte », la règle du 14/08. Le bandeau reste (le
    // jeton est une information à lui seul), le paragraphe non.
    expect(textOf({ method: "" })).toContain("Just reheat");
    expect(markup({ method: "" }), "un paragraphe vide sous le libellé")
      .not.toMatch(/<p[^>]*>\s*<\/p>/);
  });

  it("⛔ break-words est posé sur le texte du modèle (contrainte 320 px)", () => {
    // Le texte vient du modèle et n'a aucune longueur garantie. Sans
    // `break-words`, un mot long pousse la carte au-delà de 320 px.
    const html = markup();
    const bloc = html.slice(html.indexOf("Just reheat"));
    expect(bloc.slice(0, bloc.indexOf(METHOD)), "le paragraphe du geste n'a pas break-words")
      .toContain("break-words");
  });
});
