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

  it("⛔ le régime passe par une VÉRIFICATION, pas par un cast sec", () => {
    // `MouthFormDraft.diet` est un `string`; `SelfDraft` porte le vocabulaire
    // fermé. Un `as` direct désarmerait le typecheck sur exactement le jeton
    // qui décide si la ligne part en base — cicatrice
    // `as-cast-on-foreign-type-disarms-typecheck`.
    expect(body).toContain("DIET_ANSWERS");
  });
});
