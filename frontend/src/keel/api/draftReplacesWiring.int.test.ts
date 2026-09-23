/**
 * ⟳ 2026-09-21 — « COMPOSER UN AUTRE PLAN » REMPLACE VRAIMENT.
 *
 * ⛔ LE DÉFAUT, VU À L'ÉCRAN : le geste compose d'abord un brouillon (lot 7),
 * et le brouillon partait sans `replaces` ; la garde de chevauchement du
 * serveur mordait sur le plan même qu'on voulait remplacer, et l'écran
 * rendait « Ces jours-là tombent dans un plan que tu as déjà… ou remplace-le »
 * — une phrase qui nommait un geste impossible.
 *
 * Trois lignes tiennent le correctif, et ce test lit les trois dans la source :
 *   1. `generateHouseholdMeal` passe `replaces` à `composeDraft` quand
 *      l'intention est `replace_current` ;
 *   2. `composeDraft` le transmet au générateur ;
 *   3. `callGenerator` ne l'efface plus pour `draft`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const HOUSEHOLD = readFileSync(new URL("./household.ts", import.meta.url), "utf8");
const PLAN_DRAFT = readFileSync(new URL("./planDraft.ts", import.meta.url), "utf8");

describe("un brouillon nomme le plan qu'il remplacerait", () => {
  it("① generateHouseholdMeal passe `replaces` au brouillon quand il remplace", () => {
    const i = HOUSEHOLD.indexOf("const draft = await composeDraft(input, {");
    expect(i, "l'appel du brouillon est introuvable").toBeGreaterThan(-1);
    const call = HOUSEHOLD.slice(i, HOUSEHOLD.indexOf("});", i));
    expect(call).toContain('replaces: intent === "replace_current" ? args.replaces ?? null : null');
  });
  it("② composeDraft transmet `opts.replaces` au générateur", () => {
    const i = PLAN_DRAFT.indexOf("export async function composeDraft(");
    const body = PLAN_DRAFT.slice(i, PLAN_DRAFT.indexOf("\n}\n", i));
    expect(body).toContain("opts.replaces ?? null");
  });
  it("③ callGenerator ne vide plus `replaces` pour `draft`", () => {
    expect(PLAN_DRAFT).not.toContain('const replacing = intent === "draft" ? null : replaces;');
    expect(PLAN_DRAFT).toContain("const replacing = replaces;");
  });
});
