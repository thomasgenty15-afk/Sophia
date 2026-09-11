/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES KCAL SUR L'APERÇU QU'ON VA VALIDER — 2026-09-08
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Décision du propriétaire: le chiffre devant chaque repas et chaque boîte de
 * celui qui a un objectif doit se voir **aussi sur le brouillon**, pas seulement
 * sur le plan adopté. C'est même le moment où il sert le plus — l'aperçu est ce
 * qu'on relit AVANT d'adopter.
 *
 * ── CE QUI EMPÊCHAIT LE CHIFFRE, ET CE N'ÉTAIT PAS UNE RÈGLE ─────────────
 * `PlanDraftDialog` portait: « on ne compte pas l'énergie d'un plan qu'on n'a
 * pas adopté ». C'était une contrainte TECHNIQUE déguisée en décision:
 * `meal-energy-v1` calcule à la LECTURE, depuis une ligne en base, et un aperçu
 * n'en avait aucune. Le brouillon est maintenant rangé (`student_meal_drafts`)
 * et porte un identifiant.
 *
 * ⛔ `.ts` ET `createElement`, JAMAIS DE JSX. `vitest.config.ts` n'inclut que
 * `src/**` + `*.int.test.ts`: un `.tsx` ne serait JAMAIS COLLECTÉ, et le test
 * passerait pour vert en n'existant pas.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

import PlanResult from "./PlanResult";
import { readDraftEnvelope } from "../../api/planDraft";
import type { BoxEnergyView, DishEnergyView } from "../../api/mealEnergy";
import type { GeneratedDish } from "../../api/mealGeneration";
import { en } from "../../i18n/en";

const PATH = "/app/plan";
function markup(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: PATH, search: "", href: `http://localhost${PATH}` },
    configurable: true,
    writable: true,
  });
  return renderToStaticMarkup(node);
}

const DISHES = [
  {
    title: "Poulet, riz et brocolis",
    slot: "lunch",
    day: "mon",
    ingredients: [{ term: "poulet", quantity: "200 g" }],
    method: "",
    why: "",
    uses: [],
    boxes: [
      { id: "box_alex", member_ids: ["m-alex"], items: [], legacy_total_grams: 620 },
      { id: "box_table", member_ids: ["m-alex", "m-bea"], items: [], legacy_total_grams: 900 },
    ],
    same_day: false,
  },
] as unknown as GeneratedDish[];

const dishEnergy = (): DishEnergyView =>
  ({ kcal: 780, basis: "plan_quantities", complete: true, gaps: [] }) as DishEnergyView;
const boxEnergy = (id: string): BoxEnergyView | null =>
  id === "box_alex"
    ? ({ boxId: id, memberId: "m-alex", kcal: 612, basis: "plan_quantities" } as BoxEnergyView)
    : null;

/** Les props d'un APERÇU: semaine entière, aujourd'hui = son premier jour. */
function draftProps(over: Record<string, unknown> = {}) {
  return {
    dishes: DISHES,
    preparations: [],
    cookingSessions: [],
    shoppingList: [],
    portions: [],
    startsOn: "2026-09-14",
    durationDays: 2,
    today: "2026-09-14",
    defaultView: "week" as const,
    fixedIntakes: [],
    dayProperties: [],
    timing: null,
    emptyLabel: "",
    ...over,
  };
}

describe("l'aperçu porte ses chiffres", () => {
  it("le kcal est devant le repas, et sur la boîte à UN nom", () => {
    const html = markup(
      createElement(PlanResult, draftProps({ energy: dishEnergy, boxEnergy }) as never),
    );
    expect(html).toContain(en["meals.energy.dish"].replace("{n}", "780"));
    expect(html).toContain(en["meals.boxes.energy"].replace("{n}", "612"));
  });

  it("⛔ JAMAIS sur le bac partagé, aperçu compris", () => {
    // Ses grammes sont une quantité de bac, pas la portion de quelqu'un: un
    // kcal dessus aurait l'air personnel sans l'être. La règle du plan adopté
    // vaut mot pour mot sur l'aperçu — deux règles finiraient par diverger.
    const html = markup(
      createElement(
        PlanResult,
        draftProps({
          energy: dishEnergy,
          boxEnergy: (id: string) =>
            ({ boxId: id, memberId: "m", kcal: 999, basis: "plan_quantities" }) as BoxEnergyView,
        }) as never,
      ),
    );
    // `box_table` porte deux noms: son chiffre ne se rend pas, même connu.
    expect(html.split("999").length - 1).toBe(1);
  });

  it("⛔ RIEN quand une porte est fermée: ni chiffre, ni espace réservé", () => {
    // ⛔ QUAND UNE PORTE EST FERMÉE, IL N'Y A RIEN À CACHER. Le serveur ne rend
    // aucune donnée, l'appelant ne passe aucune fonction, et l'écran ne dit pas
    // qu'il se tait — expliquer à quelqu'un qu'on lui cache un chiffre de
    // calories, c'est encore lui parler de calories.
    const html = markup(createElement(PlanResult, draftProps() as never));
    expect(html).not.toContain("kcal");
    expect(html).not.toContain("780");
    expect(html).not.toContain("612");
  });
});

describe("la jointure — l'identifiant du brouillon, puis les trois props", () => {
  it("`readDraftEnvelope` lit `draft_id`, et son absence vaut `null`", () => {
    expect(readDraftEnvelope({ draft: true, draft_id: "d-42" }).draftId).toBe("d-42");
    expect(readDraftEnvelope({ draft: true }).draftId).toBe(null);
    // ⚠️ UNE CHAÎNE VIDE N'EST PAS UN IDENTIFIANT. Sans ce repli, l'écran
    // demanderait l'énergie de `""` et lirait « pas de plan » — un silence qui
    // ressemble à une porte fermée.
    expect(readDraftEnvelope({ draft: true, draft_id: "   " }).draftId).toBe(null);
  });

  it("⛔ le dialogue DEMANDE l'énergie du brouillon et PASSE les trois props", () => {
    // ⛔ CE TEST LIT LA SOURCE, ET C'EST ASSUMÉ. `PlanDraftDialog` tire `Modal`
    // et tout `PlanResult` derrière lui: il n'est monté par aucun test de ce
    // dépôt (`planExplanation.int.test.ts` le dit). Une décision laissée dans un
    // JSX que rien ne monte est une décision qu'aucun test ne peut atteindre —
    // alors on lit le fichier.
    const src = readFileSync(
      new URL("./PlanDraftDialog.tsx", import.meta.url),
      "utf-8",
    );
    expect(src).toContain("const energy = useMealEnergy({");
    // ⚠️ `planId: null` — un aperçu n'est pas un plan écrit; c'est son PROPRE
    // identifiant qu'on demande.
    expect(src).toMatch(/useMealEnergy\(\{\s*\n\s*planId: null,\s*\n\s*draftId,/);
    for (const prop of ["energy={energy.showing", "boxEnergy={energy.hasBoxEnergy", "dayEnergy={energy.showing"]) {
      expect(src).toContain(prop);
    }
    // ⛔ `boxEnergy` N'EST PAS GARDÉ PAR `showing`, exactement comme sur le plan
    // adopté: le chiffre d'une boîte à un nom sort aussi quand le LECTEUR est
    // fermé par défaut. Recopier ce raisonnement de travers rendrait un chiffre
    // sur l'aperçu et pas sur le plan, ou l'inverse.
    expect(src).not.toContain("boxEnergy={energy.showing");
  });

  it("⛔ les deux écrans qui montrent un aperçu passent son identifiant", () => {
    // Un seul des deux câblé, et la moitié des gens verrait les chiffres.
    for (const page of ["../../pages/StudentWeekPlanPage.tsx", "../../pages/SetupPage.tsx"]) {
      const src = readFileSync(new URL(page, import.meta.url), "utf-8");
      expect(src).toContain("draftId={draft?.envelope.draftId ?? null}");
    }
  });
});
