import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import SameReasonPanel, { type SameReasonPanelProps } from "./SameReasonPanel";
import { readDishMatchesResponse } from "../../api/planDraft";
import { en } from "../../i18n/en";

// ===========================================================================
// ⟳ 2026-09-24 — « ÇA VAUT AUSSI POUR… »
// ===========================================================================
//
// Demandé par le propriétaire: trois matins aux œufs, la même raison tapée
// trois fois. Après la raison d'un plat, un appel rapide propose les autres
// plats à qui elle s'applique; la personne confirme.
//
// Ce que ce fichier tient:
//   ① la couche: « je regarde… » pendant l'appel, puis les plats proposés,
//      cochables, grisés quand le plafond ne les tient plus;
//   ② le transport: une réponse illisible ne propose rien;
//   ③ le branchement: la prop est REQUISE, appelée après « Valider » avec la
//      case et la raison du plat, montée sur les deux pages, et l'appel ne
//      jette jamais.
//
// ⚠️ `.ts` ET `createElement`: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts`.

function props(over: Partial<SameReasonPanelProps> = {}): SameReasonPanelProps {
  return {
    reason: "Pas d'oeufs le matin",
    status: "ready",
    suggestions: [
      { key: "œufs durs, pomme", title: "Œufs durs, pomme", where: "Fri., Sat. · Breakfast", fits: true },
      { key: "frittata", title: "Frittata", where: "Sun. · Breakfast", fits: false },
    ],
    checked: new Set(["œufs durs, pomme"]),
    capped: true,
    capText: "At most 24",
    onToggle: () => {},
    onConfirm: () => {},
    onSkip: () => {},
    ...over,
  };
}
const html = (p: SameReasonPanelProps) =>
  renderToStaticMarkup(createElement(SameReasonPanel, p)).replace(/&#x27;/g, "'");

describe("① la bulle", () => {
  it("pendant l'appel: elle le dit (et le fait lire), cite la raison, garde la place, et on peut passer", () => {
    // ⟳ 2026-09-24 — « on ne sait pas ce qui se passe pendant la recherche ».
    const out = html(props({ status: "looking", suggestions: [], checked: new Set() }));
    expect(out).toContain(en["plan.draft.same_reason_looking"]);
    expect(out).toContain('role="status"');
    expect(out).toContain("animate-spin");
    expect(out.match(/animate-pulse/g)?.length, "la place des plats à venir").toBe(2);
    expect(out).toContain(en["meals.dish.replace_reason"].replace("{reason}", "Pas d'oeufs le matin"));
    expect(out).toContain(en["plan.draft.same_reason_skip"]);
    expect(out).not.toContain('type="checkbox"');
  });

  it("prête: les plats proposés, cochés d'avance, et le compte sur le bouton", () => {
    const out = html(props());
    expect(out).toContain(en["plan.draft.same_reason_title"]);
    expect(out).toContain("Œufs durs, pomme");
    expect(out).toContain("Fri., Sat. · Breakfast");
    expect(out.match(/type="checkbox"/g)?.length).toBe(2);
    expect(out).toContain(en["plan.draft.same_reason_confirm_one"]);
  });

  it("le plafond grise ce qui n'y tient plus, et le dit", () => {
    const out = html(props());
    const frittata = out.slice(out.lastIndexOf("<input", out.indexOf("Frittata")), out.indexOf("Frittata"));
    expect(frittata).toContain("disabled");
    expect(out).toContain("At most 24");
  });

  it("rien de coché: « Barrer aussi » est éteint", () => {
    const out = html(props({ checked: new Set(), capped: false }));
    const label = en["plan.draft.same_reason_confirm_many"].replace("{count}", "0");
    const button = out.slice(out.lastIndexOf("<button", out.indexOf(label)), out.indexOf(label));
    expect(button).toContain("disabled");
  });
});

describe("② le transport", () => {
  it("lit titres et occurrences; une réponse illisible ne propose rien", () => {
    expect(readDishMatchesResponse({
      matches: [
        { title: "Frittata", occurrences: [{ day: "sat", slot: "breakfast", member_id: null }] },
        { title: "", occurrences: [{ day: "sun", slot: "breakfast" }] },
        { title: "Sans case", occurrences: [] },
      ],
    })).toEqual([{ title: "Frittata", occurrences: [{ day: "sat", slot: "breakfast", memberId: null }] }]);
    expect(readDishMatchesResponse(null)).toEqual([]);
    expect(readDishMatchesResponse({ matches: "x" })).toEqual([]);
  });
});

describe("③ le branchement", () => {
  const ROOT = resolve(__dirname, "../../../../..");
  const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
  const DIALOG = read("frontend/src/keel/components/plan/PlanDraftDialog.tsx");
  const API = read("frontend/src/keel/api/planDraft.ts");

  it("la bulle sort du bouton du plat cliqué, plus d'une couche plein cadre", () => {
    const card = read("frontend/src/keel/components/DishCard.tsx");
    expect(card).toContain("{replace.panel}");
    // ⟳ 2026-09-25 — le conteneur porte aussi `data-no-row-toggle` (la carte
    // entière ouvre la ligne, sauf « Changer ») et `cursor-auto`.
    expect(card).toContain('className="relative ml-auto flex shrink-0 cursor-auto items-center self-stretch"');
    const replace = DIALOG.slice(DIALOG.indexOf("const dishReplace = (dish: GeneratedDish)"));
    expect(replace.slice(0, 2500)).toContain("<ReplaceReasonPanel");
    expect(replace.slice(0, 2500)).toContain("<SameReasonPanel");
    const layer = DIALOG.slice(DIALOG.indexOf("layer={"), DIALOG.indexOf("layer={") + 400);
    expect(layer, "la raison est revenue en couche plein cadre").not.toMatch(/ReplaceReason|SameReason/);
  });

  it("la prop est requise, et appelée après « Valider » avec la case et la raison", () => {
    expect(DIALOG).toMatch(/\n {2}onMatchDishes: \(\n/);
    const confirm = DIALOG.slice(DIALOG.indexOf("const confirmReason = () => {"), DIALOG.indexOf("const skipSuggestions"));
    expect(confirm).toContain("onMatchDishes(draftId, { day, slot, memberId, title, reason })");
    expect(confirm.indexOf("setRejected("), "le plat d'origine se barre d'abord").toBeLessThan(
      confirm.indexOf("onMatchDishes("),
    );
  });

  it("« Barrer aussi » ne barre que ce qui est coché, avec la même raison", () => {
    const confirm = DIALOG.slice(DIALOG.indexOf("const confirmSuggestions = () => {"));
    expect(confirm.slice(0, 500)).toContain("if (checked.has(s.key) && !next.has(s.key)) next.set(s.key, { title: s.title, reason });");
  });

  it("les deux pages montent la proposition", () => {
    for (const page of ["SetupPage", "StudentWeekPlanPage"]) {
      expect(read(`frontend/src/keel/pages/${page}.tsx`), page).toContain("onMatchDishes={");
    }
  });

  it("l'appel ne jette jamais: une panne rend une liste vide", () => {
    const fn = API.slice(API.indexOf("export async function matchDishes("));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toContain("if (error) return [];");
    expect(body).toMatch(/catch \{\n\s+return \[\];/);
  });
});
