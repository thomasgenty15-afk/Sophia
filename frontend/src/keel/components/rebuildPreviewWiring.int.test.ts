/**
 * ⟳ 2026-09-21 — « COMPOSER UN AUTRE PLAN » : CONFIRMER, PRÉVISUALISER, PUIS
 * REMPLACER.
 *
 * ⛔ LE DÉFAUT, VU À L'ÉCRAN : le bouton composait un brouillon et l'ADOPTAIT
 * dans la foulée (`generateHouseholdMeal`), sans fenêtre de confirmation et
 * sans l'aperçu « Ajuster le plan » que la carte « Prévisualiser » offre déjà.
 * Trois pièces tiennent le correctif, et ce test lit les trois dans la source
 * — parce que chacune est un câblage qu'un composant complet, testé et vert
 * peut perdre sans qu'aucun test unitaire ne rougisse.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sourceFamily } from "../../test/sourceFamily";

const BUILDER = readFileSync(new URL("./MealBuilder.tsx", import.meta.url), "utf8");
const PAGE = sourceFamily(new URL("../pages/StudentWeekPlanPage.tsx", import.meta.url));
const DIALOG = readFileSync(new URL("./plan/PlanDraftDialog.tsx", import.meta.url), "utf8");
// ⟳ 2026-09-24 — les packs sont découpés par namespace (`i18n/en/`, `i18n/fr/`):
// on lit la FAMILLE de chaque pack, pas le seul fichier d'assemblage.
const FR = sourceFamily(new URL("../i18n/fr.ts", import.meta.url));
const EN = sourceFamily(new URL("../i18n/en.ts", import.meta.url));
const API = readFileSync(new URL("../api/planDraft.ts", import.meta.url), "utf8");

describe("① remplacer se confirme avant de composer", () => {
  it("le geste ouvre la fenêtre de confirmation au lieu de partir", () => {
    const gate = BUILDER.indexOf("if (replacing) {");
    expect(gate, "la porte de confirmation a disparu").toBeGreaterThan(-1);
    expect(BUILDER.slice(gate, gate + 120)).toContain("setConfirmOpen(true);");
    // ⛔ ET ELLE VIENT APRÈS LES CHAMPS, AVANT LA COMPOSITION : confirmer un
    // budget invalide serait confirmer pour rien.
    expect(BUILDER.indexOf('setError(t("plan.cooking.budget_required"))')).toBeLessThan(gate);
    expect(gate).toBeLessThan(BUILDER.indexOf("async function launch("));
  });
  it("la fenêtre nomme le plan qui part, et ses deux boutons ont une phrase", () => {
    for (const key of [
      "meals.rebuild.confirm_title",
      "meals.rebuild.confirm_body",
      "meals.rebuild.confirm_go",
      "meals.rebuild.confirm_cancel",
      "meals.rebuild.confirm_close",
    ]) {
      expect(BUILDER, `${key} n'est pas rendue`).toContain(`t("${key}")`);
      expect(FR, `${key} manque en français`).toContain(`"${key}"`);
      expect(EN, `${key} manque en anglais`).toContain(`"${key}"`);
    }
    expect(FR).toMatch(/"meals\.rebuild\.confirm_body":\s*\n?\s*"[^"]*\{from\}[^"]*\{to\}/);
    expect(BUILDER).toContain('onClick={() => void launch(Number(budget.trim()))}');
  });
});

describe("② l'aperçu d'abord, l'adoption ensuite", () => {
  it("le composeur remet le brouillon à la page, et n'écrit plus jamais lui-même", () => {
    const preview = BUILDER.indexOf("await props.onPreviewPlan({");
    expect(preview, "le chemin de l'aperçu a disparu").toBeGreaterThan(-1);
    const block = BUILDER.slice(preview, BUILDER.indexOf("});", preview));
    expect(block).toContain('replaces: intent === "replace_current" ? target?.mealId ?? null : null');
    // ⛔ AUCUN REPLI D'ÉCRITURE DIRECTE: c'était le bouton d'hier, et un `?`
    // sur la prop l'aurait laissé revenir en silence.
    expect(BUILDER, "l'écriture directe est revenue").not.toContain("generateHouseholdMeal(");
    expect(BUILDER).toContain("onPreviewPlan: (args: PreviewPlanArgs) => Promise<void>;");
  });
  it("la page passe le câblage — un `?:` non branché serait le bouton d'hier", () => {
    const mount = PAGE.indexOf("<MealBuilder");
    const mountEnd = PAGE.indexOf("/>", mount);
    expect(PAGE.slice(mount, mountEnd)).toContain("onPreviewPlan={previewPlan}");
  });
  it("la page compose avec `replaces`, ouvre l'aperçu et retient d'où il vient", () => {
    const i = PAGE.indexOf("const previewPlan = React.useCallback(");
    const body = PAGE.slice(i, PAGE.indexOf("}, []);", i));
    expect(body).toContain('replaces: args.intent === "replace_current" ? args.replaces : null');
    expect(body).toContain("setDraftSource({ input: args.input, intent: args.intent, replaces: args.replaces })");
    // ⟳ 2026-09-21 — IL N'Y A PLUS D'ÉTAT D'OUVERTURE À POSER: la fenêtre
    // est ouverte si et seulement si un brouillon existe. Poser le
    // brouillon EST l'ouvrir, et les deux ne peuvent plus diverger.
    expect(body).toContain("setDraft(composed);");
  });
  it("l'adoption écrit avec l'intention de la source, et le composeur relit ses plans", () => {
    const adopt = PAGE.indexOf("onAdopt={async () => {");
    const block = PAGE.slice(adopt, PAGE.indexOf("/>", adopt));
    expect(block).toContain('draftSource?.intent ?? "prepare_next"');
    expect(block).toContain('draftSource?.intent === "replace_current" ? draftSource.replaces : null');
    expect(block).toContain("setPlansVersion((v) => v + 1);");
    expect(block).toContain("setDraftSource(null);");
  });
  it("reprise et cases refaites travaillent sur l'entrée de la source, pas sur la fenêtre libre", () => {
    expect(PAGE).toContain("readNote(note, (draftSource?.input ?? draftInput()).window)");
    // ⟳ 2026-09-22 — l'entrée de la source, ramenée à aujourd'hui (`windowFromToday`).
    expect(PAGE).toContain("editCells(windowFromToday(draftSource?.input ?? draftInput(), todayIso()), id, cells, {");
    expect(PAGE).toContain("composeDraft(windowFromToday(draftSource?.input ?? draftInput(), todayIso()), {");
  });
  it("le bouton qui écrit dit qu'il remplace", () => {
    expect(DIALOG).toContain("adoptLabel?: string;");
    // ⟳ 2026-09-21 — ON MESURE L'ABSENCE DE CLÉ NUE, PLUS UN COMPTE. Le pied
    // a deux états (champ ouvert, champ fermé) et rend donc le bouton à trois
    // endroits avec le fronton; un `toBe(2)` était un nombre qu'on rajuste au
    // lieu de le comprendre, et qui bougera encore. Ce qui compte est qu'AUCUN
    // de ces rendus ne retombe sur la clé nue: là où l'aperçu remplace un
    // plan, le bouton doit dire qu'il remplace.
    const bare = DIALOG.match(/(?<!adoptLabel \?\? )t\("plan\.draft\.adopt"\)/g);
    expect(bare, `clé nue rendue ${bare?.length ?? 0} fois`).toBeNull();
    expect(DIALOG.match(/adoptLabel \?\? t\("plan\.draft\.adopt"\)/g)?.length)
      .toBeGreaterThanOrEqual(2);
    expect(PAGE).toContain('t("plan.draft.adopt_replace")');
    expect(FR).toContain('"plan.draft.adopt_replace"');
    expect(EN).toContain('"plan.draft.adopt_replace"');
  });
});


// ⟳ 2026-09-21 — LA REPRISE DE CASE PORTE AUSSI LE PLAN REMPLACÉ. Mesuré : une
// note « il n'y a pas de repas mardi midi » classée en case, `edit_cells`
// appelée sans `replaces`, refusée en 600 ms par la garde de chevauchement,
// aucun tour de modèle. La personne lisait « ça n'a rien fait ».
describe("③ la reprise d'une case sur un remplacement", () => {
  it("editCells transmet `replaces` au moteur, comme composeDraft", () => {
    const fn = API.slice(API.indexOf("export async function editCells("));
    const call = fn.slice(0, fn.indexOf("return {"));
    expect(call).toContain('callGenerator(input, "draft", opts.replaces ?? null, {');
    expect(call).toContain('operation: "edit_cells"');
  });
  it("la page passe le plan remplacé du brouillon à editCells", () => {
    const handler = PAGE.slice(PAGE.indexOf("onEditCells={async (id, cells) => {"));
    const body = handler.slice(0, handler.indexOf("edit={"));
    expect(body).toContain("editCells(windowFromToday(draftSource?.input ?? draftInput(), todayIso()), id, cells, {");
    expect(body).toContain('replaces: draftSource?.intent === "replace_current"');
  });
});
