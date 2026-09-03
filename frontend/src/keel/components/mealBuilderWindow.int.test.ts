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

// ⚠️ LE MÊME DÉFAUT VIVAIT DANS L'ENTONNOIR, ET IL Y EST RESTÉ SEPT JOURS DE
// PLUS. `MealBuilder` a été réparé le 2026-08-18; `SetupPage` porte les MÊMES
// deux champs, avec le MÊME câblage brut, et personne n'était allé voir. C'est
// pourtant lui qui compose le PREMIER plan d'un compte — donc l'écran où la
// page blanche coûte le plus cher.
//
// Les deux sources sont relues par le même bloc plus bas: un correctif porté à
// un seul des deux écrans est précisément ce que ce fichier existe pour
// attraper.
const SETUP_SOURCE = readFileSync(
  resolve(__dirname, "../pages/SetupPage.tsx"),
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

// ===========================================================================
// L'ENTONNOIR PORTE LES MÊMES DEUX CHAMPS — 2026-09-01
// ===========================================================================

describe("le câblage des deux champs de date de l'entonnoir", () => {
  // La forme de régression, nommée: `RequestStep` reçoit ses setters en props,
  // donc elle ne s'écrit pas comme celle de `MealBuilder` — et c'est exactement
  // pour ça qu'elle avait survécu au correctif d'à côté.
  const RAW_BINDINGS = [
    /onChange=\{\(e\) => onWindowStart\(e\.target\.value\)\}/,
    /onChange=\{\(e\) => onWindowEnd\(e\.target\.value\)\}/,
  ];

  it("aucun champ n'écrit sa frappe DIRECTEMENT dans l'état du calcul", () => {
    for (const raw of RAW_BINDINGS) {
      expect(SETUP_SOURCE, String(raw)).not.toMatch(raw);
    }
  });

  it("les deux champs affichent le BROUILLON", () => {
    expect(SETUP_SOURCE).toMatch(/value=\{startDraft\}/);
    expect(SETUP_SOURCE).toMatch(/value=\{endDraft\}/);
  });

  it("l'état du calcul n'est franchi QUE derrière `isIsoDate`", () => {
    expect(SETUP_SOURCE).toMatch(/if \(!isIsoDate\(typed\)\)/);
    expect(SETUP_SOURCE).toMatch(/if \(isIsoDate\(typed\)\) onWindowEnd\(typed\);/);
  });
});

describe("les deux bornes du départ, sur les DEUX écrans", () => {
  // ⛔ CE BLOC LIT LES DEUX SOURCES ENSEMBLE, ET C'EST LE POINT. `MealBuilder`
  // portait `min`/`max` depuis le 2026-08-12; l'entonnoir n'avait NI L'UN NI
  // L'AUTRE, et proposait donc un départ dans le passé — que le serveur refuse
  // en 400, sous un motif qui parle des JOURS. Un refus qu'on peut rendre
  // inexprimable ne doit pas exister.
  for (
    const [name, source] of [
      ["MealBuilder", SOURCE],
      ["SetupPage", SETUP_SOURCE],
    ] as const
  ) {
    it(`${name}: le départ ne peut être ni dans le passé, ni au-delà de dimanche`, () => {
      expect(source, `${name}: min`).toMatch(/min=\{browserLocalDate\(\)\}/);
      expect(source, `${name}: max`).toMatch(
        /max=\{lastNameableStart\(browserLocalDate\(\)\)\}/,
      );
    });
  }

  it("SetupPage ramène au jour même par `catchUpWindowStart`, pas par une seconde règle", () => {
    // ⚠️ LA RÈGLE VIT DANS `useMealTicks`, elle est testée là-bas, et elle ne
    // corrige QUE le passé. La recopier ici ferait deux idées de « ramener au
    // jour même », et c'est celle qu'on relit le moins qui garderait l'ancienne.
    expect(SETUP_SOURCE).toMatch(
      /catchUpWindowStart\(typed, browserLocalDate\(\)\)/,
    );
    // Et le champ MONTRE le déplacement: sans cette ligne, l'écran afficherait
    // le 29 au-dessus d'un plan qui part du 31.
    expect(SETUP_SOURCE).toMatch(/setStartDraft\(clamped\);/);
  });
});
