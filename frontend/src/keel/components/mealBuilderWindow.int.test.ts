import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { addDays, assertIsoDate, daysBetween, isIsoDate } from "../api/dates";

// ===========================================================================
// LA FENÊTRE DU PLAN, ET LA DEMI-DATE QUI EMPORTAIT LA PAGE
//
// Mesuré le 2026-08-18 par l'agent d'injection foyer: vider le champ de fin
// une fraction de seconde faisait tomber TOUT `MealBuilder` par l'ErrorBoundary
// —
//     [keel/dates] expected a yyyy-mm-dd local date, got ""
//
// La chaîne: `onChange` écrivait `e.target.value` brut dans l'état, l'état
// nourrissait `addDays`/`daysBetween` DANS LE CORPS DU RENDU, et ces deux-là
// appellent `assertIsoDate`, qui jette. Un throw pendant le rendu n'est pas
// rattrapable par le champ: il remonte à la frontière d'erreur. Conséquence
// vécue: la fenêtre du plan était inéditable au clavier, et rien à l'écran ne
// disait pourquoi.
//
// ⚠️ CE QU'ON NE CORRIGE PAS: la garde. `assertIsoDate` doit continuer à jeter
// (R7 — une date malformée est un throw, jamais un jour décalé en silence).
// C'est l'APPELANT qui cesse de lui donner des demi-dates.
//
// ── CE QUE CE FICHIER PEUT PROUVER, ET CE QU'IL NE PEUT PAS ────────────────
// Ce dépôt n'a ni jsdom ni testing-library (`vitest.config.ts` →
// `environment: "node"`), donc **aucun test ici ne peut rejouer une frappe**.
// Le défaut naissait d'une interaction; on ne peut pas la simuler.
//
// D'où deux niveaux, et le second est le plus faible des deux:
//   1. le CONTRAT de `dates.ts` — poser la question sans déclencher la
//      sanction est désormais possible, et la sanction est intacte. Vrai test.
//   2. le CÂBLAGE, lu dans la source. Un test de source ment plus facilement
//      qu'un test de valeur — ce dépôt en a déjà vu deux mentir cette semaine.
//      Celui-ci est gardé quand même parce qu'il vise une FORME DE RÉGRESSION
//      précise et nommée (rebrancher le setter du calcul sur la frappe), et
//      parce que l'alternative honnête serait de ne rien garder du tout.
// ===========================================================================

const SOURCE = readFileSync(
  resolve(__dirname, "./MealBuilder.tsx"),
  "utf8",
);

describe("le contrat de dates.ts", () => {
  it("la sanction est INTACTE: une demi-date jette toujours", () => {
    // Si ce test tombe, la « correction » a consisté à désarmer la garde —
    // c'est-à-dire à échanger une page blanche contre un jour décalé en
    // silence, ce qui est strictement pire.
    for (const half of ["", "2026", "2026-08", "2026-8-1", "demain"]) {
      expect(() => assertIsoDate(half), half).toThrow(/keel\/dates/);
    }
  });

  it("mais on peut désormais POSER la question sans la déclencher", () => {
    expect(isIsoDate("2026-08-18")).toBe(true);
    for (const half of ["", "2026", "2026-08", "2026-8-1", "demain"]) {
      expect(isIsoDate(half), half).toBe(false);
    }
  });

  it("et c'est bien ce que le calcul refusait — la preuve du coût", () => {
    // Les deux fonctions que le rendu appelle sur l'état de la fenêtre.
    expect(() => addDays("", 6)).toThrow(/keel\/dates/);
    expect(() => daysBetween("2026-08-18", "")).toThrow(/keel\/dates/);
  });
});

describe("le câblage des deux champs de date", () => {
  // La forme de régression, nommée: rebrancher le setter qui nourrit le
  // calcul directement sur la valeur du champ.
  const RAW_BINDINGS = [
    /onChange=\{\(e\) => setWindowStart\(e\.target\.value\)\}/,
    /onChange=\{\(e\) => setWindowEnd\(e\.target\.value\)\}/,
  ];

  it("aucun champ n'écrit sa frappe DIRECTEMENT dans l'état du calcul", () => {
    for (const raw of RAW_BINDINGS) {
      expect(SOURCE, String(raw)).not.toMatch(raw);
    }
  });

  it("les deux champs affichent le BROUILLON, pas l'état du calcul", () => {
    expect(SOURCE).toMatch(/value=\{startDraft\}/);
    expect(SOURCE).toMatch(/value=\{endDraft\}/);
    // Et l'ancienne forme a bien disparu des deux `value`.
    expect(SOURCE).not.toMatch(/value=\{windowStart\}\s*\n\s*onChange/);
    expect(SOURCE).not.toMatch(/value=\{windowEnd\}\s*\n\s*onChange/);
  });

  it("et l'état du calcul n'est franchi QUE derrière la garde", () => {
    // Deux champs, donc deux portes. Moins de deux = un champ est resté ouvert.
    const gated = SOURCE.match(
      /if \(isIsoDate\(next\)\) setWindow(Start|End)\(next\);/g,
    );
    expect(gated?.length ?? 0).toBe(2);
  });
});
