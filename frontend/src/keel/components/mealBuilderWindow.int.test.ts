import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { addDays, assertIsoDate, daysBetween, isIsoDate } from "../api/dates";
import { sourceFamily } from "../../test/sourceFamily";

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
const SETUP_SOURCE = sourceFamily(
  resolve(__dirname, "../pages/SetupPage.tsx"),
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

// ===========================================================================
// ⟳ 2026-09-23 — LES DEUX CHAMPS DE DATE NE VIVENT PLUS QU'À UN ENDROIT
//
// `MealBuilder` et l'entonnoir portaient chacun leur paire de champs — et le
// défaut du brouillon avait été réparé sur l'un sept jours avant l'autre. Les
// deux écrans montent maintenant `PlanRequestFields`: la garde se lit là, et
// chaque écran doit prouver qu'il n'a pas remonté un champ de date à côté.
// ===========================================================================
const FIELDS_SOURCE = readFileSync(
  resolve(__dirname, "./PlanRequestFields.tsx"),
  "utf8",
);
const bare = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => (line.trimStart().startsWith("//") ? "" : line))
    .join("\n");

describe("le câblage des deux champs de date", () => {
  // La forme de régression, nommée: rebrancher le setter qui nourrit le
  // calcul directement sur la valeur du champ.
  const RAW_BINDINGS = [
    /onChange=\{\(e\) => setWindowStart\(e\.target\.value\)\}/,
    /onChange=\{\(e\) => setWindowEnd\(e\.target\.value\)\}/,
    /onChange=\{\(e\) => (props\.)?onWindowStart\(e\.target\.value\)\}/,
    /onChange=\{\(e\) => (props\.)?onWindowEnd\(e\.target\.value\)\}/,
  ];

  it("aucun écran ne remonte un champ de date à côté du formulaire commun", () => {
    // La signature du champ de départ: borné au jour même. L'entonnoir a
    // d'autres champs de date (la date de naissance), d'où cette marque-là.
    expect(bare(SOURCE)).not.toContain("min={browserLocalDate()}");
    expect(bare(SETUP_SOURCE)).not.toContain("min={browserLocalDate()}");
    expect(SOURCE).toMatch(/<PlanRequestFields/);
    expect(SETUP_SOURCE).toMatch(/<PlanRequestFields/);
  });

  it("aucun champ n'écrit sa frappe DIRECTEMENT dans l'état du calcul", () => {
    for (const src of [SOURCE, SETUP_SOURCE, FIELDS_SOURCE]) {
      for (const raw of RAW_BINDINGS) {
        expect(src, String(raw)).not.toMatch(raw);
      }
    }
  });

  it("les deux champs affichent le BROUILLON, pas l'état du calcul", () => {
    expect(FIELDS_SOURCE).toMatch(/value=\{startDraft\}/);
    expect(FIELDS_SOURCE).toMatch(/value=\{endDraft\}/);
  });

  it("et l'état du calcul n'est franchi QUE derrière `isIsoDate`", () => {
    expect(FIELDS_SOURCE).toMatch(/if \(!isIsoDate\(typed\)\)/);
    expect(FIELDS_SOURCE).toMatch(/if \(isIsoDate\(typed\)\) props\.onWindowEnd\(typed\);/);
  });
});

describe("les deux bornes du départ", () => {
  it("le départ est libre, sauf le passé", () => {
    // ⟳ 2026-09-06 — LE `max` A ÉTÉ RETIRÉ, ET CE CAS TIENT SON ABSENCE.
    // Décision produit: la date de départ est libre, seul le passé reste borné.
    expect(FIELDS_SOURCE, "min").toMatch(/min=\{browserLocalDate\(\)\}/);
    expect(FIELDS_SOURCE, "un max est revenu sur le départ")
      .not.toMatch(/max=\{lastNameableStart/);
  });

  it("le départ passé est ramené au jour même par `catchUpWindowStart`, pas par une seconde règle", () => {
    // ⚠️ LA RÈGLE VIT DANS `useMealTicks`, elle est testée là-bas, et elle ne
    // corrige QUE le passé.
    expect(FIELDS_SOURCE).toMatch(
      /catchUpWindowStart\(typed, browserLocalDate\(\)\)/,
    );
    // Et le champ MONTRE le déplacement.
    expect(FIELDS_SOURCE).toMatch(/setStartDraft\(clamped\);/);
  });
});

// ===========================================================================
// ⟳ 2026-09-03 — « CHOISIR LES REPAS » EXISTE SUR LES DEUX SURFACES
//
// ── LE TROU QUE ÇA FERME ──────────────────────────────────────────────────
// `/app/plan` porte ce lien sous les dates depuis le premier jour. L'entonnoir
// ne l'avait pas: sa seule grille est per-BOUCHE (`presenceRoster`), et un
// compte SOLO n'a pas de ligne membre — pas de foyer ⇒ `ownMemberId` à `null`
// ⇒ aucune grille. La première composition d'une personne seule partait donc
// avec vingt-et-un repas à la maison, quoi qu'elle vive, et rien à l'écran ne
// permettait d'en retirer un.
//
// ⚠️ CE QUE CE BLOC GARDE, ET QUI EST PLUS QUE « le lien est là »: qu'il écrit
// LA MÊME COLONNE que `/app/plan`. La grille est la même sur les deux écrans;
// ce qui pouvait diverger sans un mot du compilateur, c'est la destination —
// `setMemberAway` rangerait la réponse dans la colonne du FOYER, où un solo
// n'a même pas de ligne, et le plan composerait sans elle.
// ===========================================================================
describe("« Choisir les repas » — le même geste sur les deux écrans", () => {
  it("les deux surfaces montent la MÊME liste « Qui mange à la maison »", () => {
    // ⟳ 2026-09-23 — le lien solo et les pastilles de l'entonnoir ont laissé la
    // place à la liste de `/app/plan` (une ligne par personne, son état,
    // « Absence » et « Modifier »), montée par le formulaire commun.
    expect(FIELDS_SOURCE).toMatch(/plan\.request\.presence_title/);
    expect(FIELDS_SOURCE).toMatch(/<MealPickerGrid/);
    expect(SOURCE).toMatch(/presence=\{presenceRows\}/);
    expect(SETUP_SOURCE).toMatch(/presence=\{presence\}/);
  });

  it("⛔ et il écrit la colonne DE LA PERSONNE, pas celle du foyer", () => {
    // `/app/plan` passe par `saveAwayDays` (`StudentWeekPlanPage`), qui fusionne
    // `away_days` dans `practical_constraints`. L'entonnoir fait exactement la
    // même chose, avec une photo FRAÎCHE de la colonne — la relire au montage
    // effacerait le régime et l'équipement écrits depuis.
    expect(SETUP_SOURCE, "l'écrivain de la grille du titulaire a disparu")
      .toMatch(/patch: \{ away_days: next \}/);
    expect(
      SETUP_SOURCE,
      "la photo de la colonne est celle du montage: elle effacera les autres clés",
    ).toMatch(/const fresh = await readFunnelFacts\(userId\);\n\s+await mergePracticalConstraints\(\{\n\s+userId,\n\s+current: fresh\.practicalConstraints,\n\s+patch: \{ away_days: next \}/);
  });

  it("⛔ LES DEUX SOURCES RESTENT SÉPARÉES (D14)", () => {
    // La ligne du titulaire écrit ce qu'il dit de LUI-MÊME
    // (`practical_constraints.away_days`); celle d'une autre bouche écrit la
    // marque du maître (`household_members.away_days`). Nourrir une ligne de
    // l'autre colonne recopierait une déclaration là où elle survivrait à sa
    // rétractation.
    expect(SETUP_SOURCE).toMatch(/selfAway=\{parseAwayMarks\(/);
    expect(SETUP_SOURCE).toMatch(/onSelfAwaySave=\{saveSelfAway\}/);
    expect(SETUP_SOURCE).toMatch(/away: selfAway,\n\s+save: onSelfAwaySave,/);
    expect(
      SETUP_SOURCE,
      "la ligne du titulaire s'est rebranchée sur la colonne du foyer",
    ).not.toMatch(/onSelfAwaySave=\{[^}]*setMemberAway/);
    // `/app/plan`: le titulaire lit et écrit par la page (`awayDays`,
    // `onAwaySaved`), les autres par `setMemberAway`.
    expect(SOURCE).toMatch(/away: props\.awayDays \?\? \[\],\n\s+save: \(next\) => saveSelf\(next\),/);
    expect(SOURCE).toMatch(/away: member\.awayHousehold,/);
  });

  it("pas de ligne sur un rythme vide — une grille sans ligne", () => {
    // Sans moment déclaré, `MealPickerGrid` n'a aucune ligne à rendre: la ligne
    // ouvrirait une fenêtre vide, ce qui se lit comme une panne.
    expect(SETUP_SOURCE).toMatch(/if \(rhythm\.length === 0\) return \[\];/);
  });
});
