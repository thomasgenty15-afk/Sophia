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
  it("le dialogue rend le titre du modèle", () => {
    expect(DIALOG).toContain('t("plan.explanation.title")');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-09 — DEUX TESTS D'ORDRE SONT PARTIS, PARCE QU'IL N'Y A PLUS
  // DEUX CARTES.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Ils tenaient « les choix du modèle passent AVANT le plancher fixe » et sa
  // prémisse (deux frères, chacun gardé par sa propre longueur). La carte du
  // plancher — « Pourquoi ces jours-là », `plan.rationale.*` — a été retirée:
  // décision produit. Un ordre entre une carte et rien n'est pas un ordre.
  it("⛔ ET LA CARTE DU PLANCHER N'EST PLUS RENDUE — elle ne revient pas par accident", () => {
    // ⚠️ CE TEST N'EST PAS UNE FORMALITÉ. Les deux cartes se ressemblaient à
    // l'écran et disaient des choses opposées (la prose du MODÈLE contre les
    // phrases DÉTERMINISTES de l'app); la remonter sans intention rouvrirait
    // très exactement la confusion qui l'a fait retirer.
    expect(DIALOG).not.toContain('t("plan.rationale.title")');
    expect(DIALOG).not.toContain("{rationale.length > 0");
    // ⛔ MAIS LE CHAMP DU SERVEUR RESTE LU. L'enveloppe est le miroir de ce que
    // la fonction rend; lui retirer `rationale` ferait mentir le contrat, et
    // c'est l'unique raison pour laquelle le champ survit à sa surface.
    const env = readDraftEnvelope({ draft: true, rationale: { lines: ["a"] } });
    expect(env.rationale).toEqual(["a"]);
  });

  it("LA CARTE DU MODÈLE, ELLE, EST GARDÉE PAR SA PROPRE LONGUEUR", () => {
    expect(DIALOG).toContain("{explanation.length > 0");
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
    // ⟳ 2026-09-09 — la comparaison portait sur `plan.rationale.title`, dont
    // la carte a été retirée. Ce qui reste vrai et utile: le titre nomme son
    // auteur, vérifié juste au-dessus.
  });
});
