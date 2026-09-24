import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import PlanRequestFields, { type PlanRequestFieldsProps } from "./PlanRequestFields";
import type { PracticalConstraints } from "../api/practicalConstraints";
import { en as EN } from "../i18n/en";

// ===========================================================================
// ⟳ 2026-09-24 — PAS DE PLAN SANS « AVEC QUOI TU CUISINES »
//
// Demandé: « bloquer la génération de plan si "avec quoi tu cuisines" n'a pas
// été renseigné ». Chaque écran retient son geste (`canGenerate` à l'étape 3,
// `build` sur `/app/plan`); le formulaire commun dit POURQUOI, dans le bloc
// où on répond.
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: le glob de `vitest.config.ts`
// est `src/**/*.int.test.ts`.
// ===========================================================================

function render(practicalConstraints: PracticalConstraints | null): string {
  const props: PlanRequestFieldsProps = {
    idPrefix: "meals",
    disabled: false,
    windowStart: "2026-09-28",
    windowEnd: "2026-09-30",
    onWindowStart: () => {},
    onWindowEnd: () => {},
    days: {
      tokens: ["mon", "tue", "wed"],
      dates: ["2026-09-28", "2026-09-29", "2026-09-30"],
    },
    practicalConstraints,
    hasGoal: true,
    onEquipmentSaved: () => {},
    presence: [],
    cookingStyle: null,
    onCookingStyle: () => {},
    oneCookingSession: false,
    onOneCookingSession: () => {},
    groceryRuns: null,
    onGroceryRuns: () => {},
    budget: "",
    onBudget: () => {},
    budgetVerdict: { kind: "unbounded" },
    showEnvy: false,
    envy: "",
    onEnvy: () => {},
  };
  return renderToStaticMarkup(createElement(PlanRequestFields, props));
}

/** Le `<details>` du bloc, balise ouvrante seulement. */
function detailsTag(markup: string): string {
  const at = markup.indexOf('id="meals-equipment"');
  expect(at, "le bloc a perdu son id — le refus de `/app/plan` n'y mène plus").toBeGreaterThan(-1);
  const start = markup.lastIndexOf("<details", at);
  return markup.slice(start, markup.indexOf(">", at) + 1);
}

describe("le bloc « Avec quoi tu cuisines » retient la génération", () => {
  it("rien de coché: le bloc s'ouvre et dit ce qui manque", () => {
    const markup = render({});
    expect(detailsTag(markup)).toContain("open");
    expect(markup).toContain(EN["plan.request.equipment_required"]);
  });

  it("une cuisine déclarée: replié, et pas un mot de refus (le cas qui passe)", () => {
    const markup = render({ kitchen_equipment: ["oven", "stovetop"] });
    expect(detailsTag(markup)).not.toContain("open");
    expect(markup).not.toContain(EN["plan.request.equipment_required"]);
  });

  it("⚠️ pas encore lu n'est pas « rien de coché »: aucun refus avant la lecture", () => {
    const markup = render(null);
    expect(markup).not.toContain(EN["plan.request.equipment_required"]);
  });
});

describe("`/app/plan` refuse le clic sans cuisine déclarée", () => {
  it("la garde est dans `build`, AVANT la confirmation de remplacement", () => {
    // ⚠️ SOURCE, COMMENTAIRES RETIRÉS: `MealBuilder` ne se monte pas sous
    // `renderToStaticMarkup` (session, routeur). Ce qui est vérifié est
    // l'ordre: une garde placée après `setConfirmOpen(true)` laisserait partir
    // un remplacement sans cuisine, par le bouton de la fenêtre.
    const src = readFileSync(new URL("./MealBuilder.tsx", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    const build = src.indexOf("async function build(");
    const guard = src.indexOf("readKitchenEquipment(planConstraints) === null", build);
    const confirm = src.indexOf("setConfirmOpen(true)", build);
    expect(build).toBeGreaterThan(-1);
    expect(guard, "la garde a disparu de `build`").toBeGreaterThan(build);
    expect(guard, "la garde vient après la confirmation").toBeLessThan(confirm);
    expect(src.slice(guard, confirm)).toContain('getElementById("meals-equipment")');
  });
});
