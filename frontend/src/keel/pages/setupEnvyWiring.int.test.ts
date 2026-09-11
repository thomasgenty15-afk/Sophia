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
    // ⟳ 2026-09-11 · LOT 7 — `draftInput` NE PREND PLUS DE PARAMÈTRE. Il lisait
    // les faits de l'entonnoir pour choisir une lane; il n'y en a plus qu'une.
    // La PROPRIÉTÉ gardée ici ne change pas: c'est l'ORDRE des deux gestes.
    const compose = setup.indexOf("composeDraft(draftInput())");
    expect(write, "l'écriture de l'envie est introuvable").toBeGreaterThan(-1);
    expect(compose, "la composition est introuvable").toBeGreaterThan(-1);
    expect(write, "l'envie est écrite APRÈS la composition").toBeLessThan(compose);
  });

  it("⚠️ une phrase vide n'écrase rien", () => {
    // Ne rien avoir envie de dire est un état normal; ça ne doit pas effacer
    // ce qui a été écrit ailleurs pour cette semaine-là. Même règle que
    // `MealBuilder`.
    //
    // ⟳ 2026-09-10 · LOT 7 — LA GARDE N'EST PLUS SUR UNE SEULE LIGNE, et le
    // littéral `if (envyLine) await submitEnvy(` ne la décrit donc plus. Ce qui
    // est épinglé est la PROPRIÉTÉ: l'écriture est à l'intérieur du `if`.
    const guard = setup.indexOf("if (envyLine) {");
    const write = setup.indexOf("await submitEnvy(");
    expect(guard, "la garde de la phrase vide a disparu").toBeGreaterThan(-1);
    expect(write, "l'écriture de l'envie est introuvable").toBeGreaterThan(guard);
  });

  it("⛔ ET SON REFUS NE PASSE PAS EN SILENCE", () => {
    // ⚠️ `keel_household_submit_envy` REND `{ok:false, reason}` — elle ne lève
    // PAS. Le résultat était ignoré: un `no_household` ou un `not_owner`
    // partait sans un mot, et le plan se composait ensuite SANS la phrase qu'on
    // venait d'écrire. Un champ visible dont le contenu disparaît en silence
    // est pire qu'un champ absent.
    //
    // ⚠️ ET LE MOTIF SE LIT SOUS LE BOUTON DE FIN: `guardCompose` pose
    // `composeFailure` à côté du geste. Un refus loin du geste est un bouton
    // mort — cicatrice payée trois fois sur cet écran.
    expect(setup, "le refus d'écriture de l'envie repart en silence")
      .toMatch(/if \(!wrote\.ok\) throw new Error\(refusalMessage\(wrote\.reason\)\)/);
  });

  it("⛔ la question est posée à qui peut l'écrire — c'est-à-dire au maître", () => {
    // ⟳ 2026-09-10 · LOT 7 — LE MOTIF A CHANGÉ, L'ASSERTION NON. Ce cas disait
    // « QUE sur la lane foyer: un solo porte son envie dans `preferences`, un
    // autre canal ». Il n'y a plus qu'un canal. Ce que la condition garde
    // aujourd'hui est le refus de la RPC elle-même (`not_owner`,
    // `no_household`): poser un champ à qui la base refusera est un champ qui
    // ne va nulle part, quelle que soit la raison.
    //
    // ⚠️ ET ELLE EST VRAIE D'UNE PERSONNE SEULE: l'étape 1 crée son foyer, elle
    // en est le maître, donc elle voit la question.
    expect(setup).toContain("askEnvy={facts.householdId !== null && facts.isOwner}");
    expect(setup).toContain("askEnvy\n");
  });
});
