import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { readDraftEnvelope } from "../api/planDraft";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";

// ===========================================================================
// L'EXPLICATION DU MODÈLE, CÔTÉ ÉCRAN — 2026-09-04
//
// ⛔ CE QUE CE FICHIER TIENT, ET CE QU'IL NE TIENT PAS. La GARDE est côté
// serveur (`_shared/keel/plan_explanation.ts`) et éprouvée là-bas, porte par
// porte. Ici on tient ce que l'enveloppe en fait: la lecture du payload, le
// silence sur un champ absent, et le fait que la carte existe AU-DESSUS des
// phrases déterministes — deux blocs de texte voisins dont l'ordre porte une
// décision.
//
// ⚠️ `PlanDraftDialog` NE SE MONTE PAS ICI: il tire `Modal`, `PlanResult` et
// leurs dépendances de contexte. La position se tient donc sur la SOURCE, et
// la prémisse qui rend ça suffisant est écrite dans le test: les deux cartes
// sont des frères du même parent, sans condition entre elles, donc l'ordre du
// fichier EST l'ordre du DOM. Un second cas vérifie cette prémisse au lieu de
// la supposer.
// ===========================================================================

const DIALOG = readFileSync(
  resolve(__dirname, "./plan/PlanDraftDialog.tsx"),
  "utf8",
);
const SETUP = readFileSync(resolve(__dirname, "../pages/SetupPage.tsx"), "utf8");
const WEEK = readFileSync(
  resolve(__dirname, "../pages/StudentWeekPlanPage.tsx"),
  "utf8",
);

describe("l'enveloppe lit l'explication du modèle", () => {
  it("LE CAS QUI PASSE — les lignes et le motif traversent", () => {
    const env = readDraftEnvelope({
      draft: true,
      explanation: {
        lines: ["Tu voulais des pizzas, il y en a vendredi soir.", "  "],
        refusal: null,
      },
    });
    expect(env.explanation).toEqual([
      "Tu voulais des pizzas, il y en a vendredi soir.",
    ]);
    expect(env.explanationRefusal).toBeNull();
  });

  it("un bloc REFUSÉ rend zéro ligne ET son motif", () => {
    const env = readDraftEnvelope({
      explanation: { lines: [], refusal: "energy_number" },
    });
    expect(env.explanation).toEqual([]);
    expect(env.explanationRefusal).toBe("energy_number");
  });

  // ⛔ LA CONTRE-ÉPREUVE: un plan d'avant ce lot ne porte pas la clé, et il ne
  // doit rien casser. C'est le cas MAJORITAIRE pendant des semaines.
  it("un plan d'AVANT ce lot (clé absente) rend un silence, pas une panne", () => {
    const env = readDraftEnvelope({ draft: true, rationale: { lines: ["a"] } });
    expect(env.explanation).toEqual([]);
    expect(env.explanationRefusal).toBeNull();
    expect(env.rationale).toEqual(["a"]);
  });

  it("⛔ UN TABLEAU NU N'EST PAS L'ENVELOPPE — on ne devine pas la forme", () => {
    // Le serveur rend `{lines, refusal}` comme pour les deux autres blocs.
    // Accepter aussi un tableau nu ferait deux formes tolérées, donc un jour
    // deux serveurs qui n'envoient pas la même chose.
    const env = readDraftEnvelope({ explanation: ["une ligne"] });
    expect(env.explanation).toEqual([]);
  });
});

describe("la carte est rendue, et AU-DESSUS des phrases déterministes", () => {
  it("le dialogue rend le titre du modèle et celui de l'app", () => {
    expect(DIALOG).toContain('t("plan.explanation.title")');
    expect(DIALOG).toContain('t("plan.rationale.title")');
  });

  it("⛔ L'ORDRE — les choix du modèle passent AVANT le plancher fixe", () => {
    const model = DIALOG.indexOf('t("plan.explanation.title")');
    const app = DIALOG.indexOf('t("plan.rationale.title")');
    expect(model).toBeGreaterThan(-1);
    expect(app).toBeGreaterThan(-1);
    expect(model).toBeLessThan(app);
  });

  it("LA PRÉMISSE DE L'ORDRE, vérifiée et non supposée", () => {
    // Les deux cartes sont des frères du même parent et ne dépendent d'aucune
    // condition partagée: chacune n'est gardée que par SA propre longueur.
    // Sans cette prémisse, l'ordre du fichier ne dirait rien de l'ordre du DOM.
    expect(DIALOG).toContain("{explanation.length > 0");
    expect(DIALOG).toContain("{rationale.length > 0");
  });

  it("les DEUX écrans passent le champ, et depuis l'enveloppe", () => {
    for (const [name, src] of [["SetupPage", SETUP], ["StudentWeekPlanPage", WEEK]] as const) {
      expect(src, name).toContain("explanation={draft?.envelope.explanation ?? []}");
    }
  });

  it("les deux dictionnaires portent le titre, et il nomme un auteur", () => {
    expect(fr["plan.explanation.title"]).toContain("Sophia");
    expect(en["plan.explanation.title"]).toContain("Sophia");
    // ⛔ ET IL NE SE CONFOND PAS AVEC CELUI DE L'APP: deux blocs voisins qui
    // porteraient le même titre feraient croire à un seul auteur.
    expect(fr["plan.explanation.title"]).not.toBe(fr["plan.rationale.title"]);
    expect(en["plan.explanation.title"]).not.toBe(en["plan.rationale.title"]);
  });
});
