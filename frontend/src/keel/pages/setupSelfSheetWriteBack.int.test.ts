import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SELF_SHEET_FIELDS } from "../lib/mouthForm";

// ===========================================================================
// LE BROUILLON DU TITULAIRE REMONTE TOUT CE QUE SA FENÊTRE ÉDITE
//
// ── LE DÉFAUT MESURÉ (2026-08-19) ─────────────────────────────────────────
// « Comment elle mange, quand je sélectionne il n'y a rien qui bouge. »
//
// Le champ du RÉGIME venait d'être ouvert au titulaire (il était réservé aux
// bouches sans compte). Sa REMONTÉE, elle, n'avait pas suivi: `selfMouthDraft`
// est DÉRIVÉ de `self` à chaque rendu, donc un champ absent de la remontée est
// recalculé à l'ancienne au rendu suivant — le `select` revient tout seul sur
// son option d'avant, et le geste a l'air refusé alors qu'il n'a même pas été
// retenu dans le brouillon.
//
// ⚠️ ET CE N'ÉTAIT PAS UN DÉFAUT D'ENREGISTREMENT AUTOMATIQUE. La fenêtre
// n'écrit JAMAIS en base — elle édite le brouillon, et c'est « Continuer » qui
// écrit (`saveSelf` → `saveOwnDiet`). Un champ qui ne remonte pas ne peut donc
// pas non plus être enregistré: le défaut se voyait à l'écran, et se serait vu
// en base.
//
// ⚠️ CE FICHIER LIT LA SOURCE, ET C'EST ASSUMÉ. `setSelfMouthDraft` est une
// fermeture dans un composant de 4 000 lignes qui ne se monte pas sous
// `renderToStaticMarkup` (session, routeur, deux appels modèle). Ce qui doit
// être prouvé est qu'AUCUN champ de la liste ne manque à l'appel — une
// propriété de la source, pas du rendu. La liste, elle, est nommée dans
// `lib/mouthForm.ts` pour que les deux côtés ne puissent pas diverger en
// silence.
//
// ⚠️ ON RETIRE LES COMMENTAIRES AVANT DE CHERCHER. `SetupPage.tsx` PARLE
// longuement de ces champs, et un grep naïf compterait ces morts-là comme des
// vivants — cicatrice `caller-audit-must-strip-comments`.
// ===========================================================================

/** La source de `setSelfMouthDraft`, privée de ses commentaires. */
function writeBackBody(): string {
  const src = readFileSync(
    new URL("./SetupPage.tsx", import.meta.url),
    "utf8",
  );
  const start = src.indexOf("const setSelfMouthDraft");
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf("const isLast =", start);
  expect(end).toBeGreaterThan(start);
  return src
    .slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

describe("la fenêtre du titulaire ne perd aucun de ses champs", () => {
  const body = writeBackBody();

  // ⛔ UN CAS PAR CHAMP, PAS UNE ASSERTION GLOBALE: un `expect` unique dirait
  // « il en manque un » sans dire lequel, et c'est le nom du champ manquant qui
  // fait la réparation.
  for (const field of SELF_SHEET_FIELDS) {
    it(`remonte \`${field}\``, () => {
      expect(body).toMatch(new RegExp(`\\b${field}\\s*:`));
    });
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⛔ ET LA LISTE ELLE-MÊME EST-ELLE COMPLÈTE ?
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⚠️ LES CAS CI-DESSUS NE PEUVENT PAS RÉPONDRE, ET C'EST UN DÉFAUT QUI A ÉTÉ
   * MESURÉ LE 2026-09-01. Ils ITÈRENT `SELF_SHEET_FIELDS`: retirer un champ de
   * la liste retire son cas, et la suite reste verte pendant que le champ cesse
   * de remonter. Vérifié en retirant `extras` — 0 rouge, sur 1 839 tests.
   * C'est la cicatrice `test-parameterized-by-its-own-constant`, et la seule
   * sortie est de comparer la liste à quelque chose qu'elle ne fabrique pas.
   *
   * Ce quelque chose est la fenêtre: TOUT champ qu'elle écrit par `set({…})`
   * doit être dans la liste, sinon le brouillon le recalcule à l'ancienne au
   * rendu suivant et le contrôle a l'air mort.
   *
   * ⛔ L'INCLUSION EST DANS UN SEUL SENS, ET C'EST VOULU. La liste porte AUSSI
   * `takesDessert / takesCheese / takesBread` et `appetite`, qu'aucun `set({…})`
   * ne nomme: les trois premiers ne sont plus édités nulle part depuis le
   * retrait de « ce qu'il y a d'autre dans l'assiette » (2026-09-01), mais ils
   * sont encore RELUS et RÉÉCRITS en base — les faire tomber de la remontée les
   * effacerait à la première fermeture de fenêtre. `appetite`, lui, passe par
   * `onChange={(patch) => set(patch)}`, un patch dont aucune clé n'est
   * littérale. Exiger l'égalité ferait rougir sur des champs sains.
   */
  it("⛔ LA LISTE COUVRE TOUT CE QUE LA FENÊTRE ÉCRIT", () => {
    const dialog = readFileSync(
      new URL("../components/MouthFormDialog.tsx", import.meta.url),
      "utf8",
    );
    const start = dialog.indexOf("export function MouthPreferencesFields(");
    expect(start).toBeGreaterThan(-1);
    const end = dialog.indexOf("\n}\n", start);
    expect(end).toBeGreaterThan(start);
    // ⚠️ COMMENTAIRES RETIRÉS, comme au-dessus: ce fichier PARLE de `set({…})`
    // dans ses notes, et un grep naïf compterait ces morts-là comme vivants.
    const window_ = dialog
      .slice(start, end)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    const edited = [
      ...window_.matchAll(
        /set\(\{\s*(?:\.\.\.[A-Za-z.]+,\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*:/g,
      ),
    ].map((m) => m[1]);
    // LA PRÉMISSE, ARMÉE: si l'extraction ne trouvait plus rien, l'inclusion
    // serait vraie et ne prouverait rien.
    expect(edited.length, "aucun `set({…})` trouvé: mesure sans objet")
      .toBeGreaterThan(4);
    const listed = new Set<string>(SELF_SHEET_FIELDS);
    expect(
      [...new Set(edited)].filter((k) => !listed.has(k)).sort(),
      "ces champs sont écrits par la fenêtre et ne remontent PAS",
    ).toEqual([]);
  });

  it("⛔ le régime passe par une VÉRIFICATION, pas par un cast sec", () => {
    // `MouthFormDraft.diet` est un `string`; `SelfDraft` porte le vocabulaire
    // fermé. Un `as` direct désarmerait le typecheck sur exactement le jeton
    // qui décide si la ligne part en base — cicatrice
    // `as-cast-on-foreign-type-disarms-typecheck`.
    expect(body).toContain("DIET_ANSWERS");
  });
});
