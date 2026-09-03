import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseEatingRhythm } from "./mealGeneration";

// LES MÊMES CAS que `supabase/functions/_shared/keel/eating_rhythm_test.ts`,
// nommés pareil. C'est le seul garde-fou honnête d'une duplication assumée:
// si l'un des deux fichiers change et pas l'autre, la comparaison des deux
// listes de tests le montre en un coup d'œil.
//
// CE FICHIER N'EXISTAIT PAS, et c'est le vrai sujet. Le moteur avait ses huit
// tests; son jumeau côté écran n'en avait AUCUN. Les deux lisent la même
// colonne, et une divergence entre eux produit un écran qui affiche autre
// chose que ce avec quoi on a composé — c'est-à-dire l'élève qui voit ses
// cases cochées et reçoit un plan bâti sur autre chose.

describe("parseEatingRhythm — le jumeau de l'écran", () => {
  it("lit un rythme déclaré, dans l'ordre de la journée", () => {
    // Saisi en désordre exprès: on lit sa journée du réveil au coucher, pas
    // dans l'ordre où les cases ont été cochées.
    const rhythm = parseEatingRhythm([
      { slot: "dinner", size: "large" },
      { slot: "snack_pm", size: "small" },
      { slot: "breakfast", size: null },
    ]);
    expect(rhythm.map((o) => o.slot)).toEqual(["breakfast", "snack_pm", "dinner"]);
    expect(rhythm.map((o) => o.size)).toEqual([null, "small", "large"]);
  });

  it("garde le moment quand la taille est illisible, et n'invente rien", () => {
    expect(parseEatingRhythm([{ slot: "snack_pm" }])).toEqual([
      { slot: "snack_pm", size: null },
    ]);
    // PAS de repli sur « medium »: une taille inventée est une contrainte que
    // personne n'a exprimée, et le moteur la respecterait.
    expect(parseEatingRhythm([{ slot: "snack_pm", size: "huge" }])).toEqual([
      { slot: "snack_pm", size: null },
    ]);
    expect(parseEatingRhythm([{ slot: "dinner", size: "" }])[0].size).toBeNull();
  });

  it("ignore l'ancienne clé `at` sans perdre le moment", () => {
    // Des lignes écrites avant le 2026-08-07 portent une HEURE. Rejeter
    // l'entrée entière rendrait `[]`, donc le repli petit-déjeuner/déjeuner/
    // dîner — le bug qu'on vient de corriger, repris par l'autre bout.
    expect(parseEatingRhythm([{ slot: "lunch", at: "12:30" }])).toEqual([
      { slot: "lunch", size: null },
    ]);
  });

  it("lit la chaîne nue comme un moment, pas comme un déchet", () => {
    // LE DÉFAUT QUE CE TEST GARDE — voir l'en-tête du test serveur homonyme.
    // Deux formes cohabitent dans la colonne; ne lire que `{slot, at}` faisait
    // retomber sur le défaut petit-déjeuner/déjeuner/dîner, en silence.
    expect(parseEatingRhythm(["lunch", "dinner"])).toEqual([
      { slot: "lunch", size: null },
      { slot: "dinner", size: null },
    ]);

    expect(parseEatingRhythm(["dinner", "breakfast", "snack_pm"]).map((o) => o.slot))
      .toEqual(["breakfast", "snack_pm", "dinner"]);

    // Une chaîne nue ne porte pas de taille et n'efface pas celle d'une entrée
    // objet du même tableau.
    expect(parseEatingRhythm([{ slot: "lunch", size: "large" }, "lunch", "dinner"]))
      .toEqual([{ slot: "lunch", size: "large" }, { slot: "dinner", size: null }]);
  });

  it("écarte ce qui n'est pas reconnu, jamais ne le devine", () => {
    // La tolérance porte sur la FORME, pas sur le vocabulaire.
    expect(parseEatingRhythm(["brunch", "snack", ""])).toEqual([]);
    expect(parseEatingRhythm([{ slot: "brunch" }])).toEqual([]);
    expect(parseEatingRhythm([{ slot: "snack" }])).toEqual([]);
    expect(parseEatingRhythm("le matin et le soir")).toEqual([]);
    expect(parseEatingRhythm(null)).toEqual([]);
    // Un doublon ne crée pas deux fois le même moment.
    expect(
      parseEatingRhythm([{ slot: "lunch", size: null }, { slot: "lunch", size: "large" }]),
    ).toEqual([{ slot: "lunch", size: "large" }]);
  });
});

// ===========================================================================
// 2026-08-19 — LE RYTHME N'A QU'UN ÉCRIVAIN, ET COMPOSER N'EN EST PAS UN.
//
// ── LE DÉFAUT, MESURÉ EN BASE ─────────────────────────────────────────────
// L'utilisateur retire le goûter de l'après-midi, vérifie que le retrait
// tient, vérifie que la grille de l'étape 3 ne le montre plus, compose un
// plan — et le plan porte des créneaux d'après-midi. Relecture en base juste
// après: `eating_rhythm` vaut de nouveau `[breakfast, lunch, snack_pm,
// dinner]`. Ses mots: « il y a un bug à ce niveau-là pour sûr ».
//
// La cause: `savePlanAnswers` écrivait `eating_rhythm` depuis `answers`, et le
// bouton « composer » lui passe l'état React de l'étape 3 — un écran qui NE
// POSE PLUS la question depuis que la fiche l'a reprise. `TableStep` a été
// retiré pour qu'il n'y ait pas « deux formulaires sur les mêmes colonnes »;
// le formulaire est parti, l'écrivain était resté.
//
// ⚠️ TESTS DE SOURCE, ET C'EST LE BON OUTIL ICI. Ce qu'on protège n'est pas
// une valeur calculée mais une FRONTIÈRE D'ÉCRITURE: quelle fonction a le
// droit de toucher quelle clé. Une assertion de valeur ne verrait pas
// revenir la clé dans l'autre fonction.
// ===========================================================================

describe("2026-08-19 · la frontière d'écriture du rythme", () => {
  const ROOT = resolve(__dirname, "../../../..");

  /**
   * ⚠️ COMMENTAIRES RETIRÉS — cicatrice `caller-audit-must-strip-comments`.
   * Ce fichier-ci l'a payée en l'écrivant: la note de `saveEatingRhythm` cite
   * `cook_days` pour expliquer l'ordre de la journée, et le test a rougi sur un
   * appelant qui n'existe pas. Un grep naïf compte les morts.
   */
  function stripComments(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => {
        const at = line.indexOf("//");
        if (at < 0) return line;
        if (at > 0 && line[at - 1] === ":") return line;
        return line.slice(0, at);
      })
      .join("\n");
  }

  function bodyOf(rel: string, fn: string): string {
    const src = stripComments(readFileSync(resolve(ROOT, rel), "utf8"));
    const at = src.indexOf(`export async function ${fn}(`);
    expect(at, `${fn} est introuvable dans ${rel}`).toBeGreaterThan(-1);
    // Jusqu'à l'accolade fermante de PREMIER NIVEAU — le corps de CETTE
    // fonction, et pas le fichier entier, qui contient forcément les deux clés.
    // ⚠️ PAS « jusqu'au prochain `export` »: le commentaire d'en-tête de la
    // fonction SUIVANTE serait avalé, et il parle justement de l'autre clé.
    const rest = src.slice(at);
    const end = rest.indexOf("\n}\n");
    expect(end, `la fin de ${fn} est introuvable`).toBeGreaterThan(-1);
    return rest.slice(0, end);
  }

  it("⛔ `savePlanAnswers` ne touche PLUS `eating_rhythm`", () => {
    const body = bodyOf("frontend/src/keel/api/onboarding.ts", "savePlanAnswers");
    expect(body, "composer réécrit le rythme depuis un écran qui ne le montre pas")
      .not.toContain("eating_rhythm");
    // ⚠️ LE CAS QUI PASSE — sans lui, une fonction VIDE passerait ce test.
    // Elle garde ce que l'étape 3 demande vraiment.
    expect(body).toContain("cook_days");
    expect(body).toContain("cooking_time_min");
    expect(body).toContain("budget_amount");
  });

  it("⛔ `saveEatingRhythm` est le seul à l'écrire, et il n'écrit que ça", () => {
    const body = bodyOf("frontend/src/keel/api/onboarding.ts", "saveEatingRhythm");
    expect(body).toContain("eating_rhythm");
    // Une seconde clé ici rouvrirait la porte par l'autre côté: un geste qui
    // ne montre que les moments écraserait le budget ou les jours de cuisine.
    for (const key of ["cook_days", "cooking_time_min", "budget_amount"]) {
      expect(body, `${key} n'a rien à faire dans l'écrivain du rythme`)
        .not.toContain(key);
    }
  });

  it("⛔ l'écran n'écrit le rythme que là où il MONTRE la question", () => {
    const src = readFileSync(
      resolve(ROOT, "frontend/src/keel/pages/SetupPage.tsx"),
      "utf8",
    );
    // ⟳ 2026-09-01 — DE UN APPELANT À DEUX, ET LA GARDE SE RESSERRE PLUTÔT
    // QUE DE S'OUVRIR.
    //
    // Le compte seul disait « un », et sa raison était: « un second appelant
    // serait le second formulaire que ce lot vient de retirer ». Ce que la
    // règle protège n'est pas le NOMBRE, c'est le lien entre écrire le rythme
    // et le montrer — `savePlanAnswers` l'écrivait depuis l'écran qui compose,
    // et composer remettait un moment qu'on venait de retirer.
    //
    // Le second appelant est le bouton du SHAKER, dans la fiche qui montre les
    // moments: choisir un moment non coché l'ajoute, et cet ajout doit partir
    // avec le shaker — sinon l'apport est en base sur un moment que la
    // personne ne mange pas.
    //
    // ⛔ ON NOMME DONC LES DEUX GESTES au lieu de compter. Un troisième
    // appelant tombera ici, et il devra venir écrire pourquoi il montre la
    // question — ce qu'un `toBe(3)` ne lui aurait jamais demandé.
    const callers = ["function saveSelf(", "function saveOwnShaker("];
    expect(src.split("await saveEatingRhythm(").length - 1).toBe(callers.length);
    for (const fn of callers) {
      const at = src.indexOf(fn);
      expect(at, `${fn} est introuvable`).toBeGreaterThan(-1);
      // ⚠️ JUSQU'À LA FONCTION SUIVANTE, pas sur une fenêtre de N caractères:
      // `saveSelf` fait deux cents lignes, et une fenêtre trop courte rendrait
      // ce test vert le jour où quelqu'un déplace l'appel de dix lignes.
      const after = src.slice(at + fn.length);
      const end = after.search(/\n {2}(async )?function [a-zA-Z]/);
      const body = end > -1 ? after.slice(0, end) : after;
      expect(body, `${fn} n'écrit plus le rythme`)
        .toContain("await saveEatingRhythm(");
    }
    // Et le bouton qui compose ne l'appelle pas — il ne montre pas la question.
    const compose = src.slice(src.indexOf("function askForDraft("));
    expect(compose.slice(0, compose.indexOf("\n  }\n")))
      .not.toContain("saveEatingRhythm");
  });
});
