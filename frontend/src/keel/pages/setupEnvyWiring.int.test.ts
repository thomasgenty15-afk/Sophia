import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ===========================================================================
// 2026-08-20 — « CE DONT LA MAISON A ENVIE » ARRIVE JUSQU'AU PLAN.
//
// ── LE DÉFAUT ─────────────────────────────────────────────────────────────
// La doctrine de l'entonnoir décrit l'étape `request` comme « quand je peux
// cuisiner, combien de temps, combien je veux dépenser, ET CE DONT J'AI
// ENVIE ». Les trois premières y étaient; la quatrième non. Le premier plan
// d'un foyer se composait donc sans qu'on ait jamais posé la question.
//
// ⚠️ LE CANAL EXISTAIT ENTIER: `household_envy_submissions` est lue PAR
// SEMAINE par le générateur (`envyLine`), et `MealBuilder` porte déjà le même
// champ. Il ne manquait que la question, ici.
//
// ⚠️ TESTS DE SOURCE, ET C'EST LE BON OUTIL: ce qu'on protège est une CHAÎNE
// (question → écrivain → semaine → composition), pas une valeur calculée.
// ===========================================================================

const ROOT = resolve(__dirname, "../../../..");

function code(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8")
    // ⚠️ COMMENTAIRES RETIRÉS — cicatrice `caller-audit-must-strip-comments`:
    // les en-têtes de ce dépôt citent longuement ce qu'ils s'interdisent, et
    // un grep naïf compte les morts.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      if (at < 0) return line;
      if (at > 0 && line[at - 1] === ":") return line;
      return line.slice(0, at);
    })
    .join("\n");
}

describe("2026-08-20 · l'envie du foyer, de l'étape 3 jusqu'au plan", () => {
  const setup = code("frontend/src/keel/pages/SetupPage.tsx");

  it("⛔ l'étape 3 POSE la question", () => {
    expect(setup, "le champ d'envie n'est pas rendu").toContain("setup-envy");
    // La MÊME clé que `MealBuilder`, jamais un second libellé: deux textes
    // écrits séparément divergent au premier retouché.
    expect(setup).toContain("plan.envy.title");
    expect(setup).toContain("plan.envy.placeholder");
  });

  it("⛔ et elle l'ÉCRIT, avec le même écrivain que `/app/plan`", () => {
    expect(setup, "la question est posée mais rien ne l'enregistre")
      .toContain("await submitEnvy(");
    // ⚠️ SUR LA SEMAINE DU DÉPART CHOISI, pas sur aujourd'hui. Deux dates
    // libres rendent l'écart atteignable: une envie écrite sur la semaine
    // courante disparaîtrait d'un plan qui commence lundi prochain.
    expect(setup).toContain("weekStartFor(planWindow.startsOn");
  });

  it("⛔ l'écriture précède la composition — sinon le plan ignore l'envie", () => {
    // Le générateur relit la table PAR SEMAINE, côté serveur. Écrire après
    // `composeDraft` composerait le plan sans ce qu'on vient de saisir.
    const write = setup.indexOf("await submitEnvy(");
    const compose = setup.indexOf("composeDraft(draftInput(fresh, null))");
    expect(write, "l'écriture de l'envie est introuvable").toBeGreaterThan(-1);
    expect(compose, "la composition est introuvable").toBeGreaterThan(-1);
    expect(write, "l'envie est écrite APRÈS la composition").toBeLessThan(compose);
  });

  it("⚠️ une phrase vide n'écrase rien", () => {
    // Ne rien avoir envie de dire est un état normal; ça ne doit pas effacer
    // ce qui a été écrit ailleurs pour cette semaine-là. Même règle que
    // `MealBuilder`.
    expect(setup).toContain("if (envyLine) await submitEnvy(");
  });

  it("⛔ la question n'est posée QUE sur la lane foyer", () => {
    // `household_envy_submissions` est clé sur un foyer. Un solo porte son
    // envie dans `preferences`, un autre canal: poser la question ferait une
    // réponse qui ne va nulle part.
    expect(setup).toContain("askEnvy={facts.householdId !== null && facts.isOwner}");
    expect(setup).toContain("askEnvy\n");
  });
});
