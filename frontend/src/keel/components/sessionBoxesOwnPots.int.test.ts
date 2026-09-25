import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { BoxTable } from "./plan/BoxTable";
import type {
  GeneratedDish,
  MealPreparation,
  MemberPortionView,
} from "../api/mealGeneration";
import { boxLinesForDish, boxLinesForSession } from "../lib/mealBoxes";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";

// ════════════════════════════════════════════════════════════════════════════
// UNE SESSION NE MET EN BOÎTE QUE CE QU'ELLE CUISINE — 2026-09-23.
//
// ── LE DÉFAUT, LU SUR LE PLAN ADOPTÉ `404d64b5` (du 23 au 28 septembre) ──────
// Le couscous est cuit mercredi, une fois, pour le dîner du jeudi (poulet) et
// pour le dîner du vendredi (saumon). Le saumon est cuit vendredi. Le « Boxing »
// de la session de MERCREDI listait les trois boîtes du vendredi soir EN
// ENTIER : « Saumon, brocoli et carotte 278 g » à peser deux jours avant que le
// saumon soit acheté et cuit. Le propriétaire : « il y a une demande de boxing
// d'aliment alors que c'est pas cuisiné ».
//
// ── POURQUOI ─────────────────────────────────────────────────────────────────
// `boxLinesForSession` choisissait les REPAS par casserole (« au moins une de
// ses casseroles ») puis recopiait TOUTES les parts de marmite de leurs boîtes.
// Son propre en-tête disait pourtant « ses contenants se remplissent en deux
// fois », et depuis le 2026-09-16 le filtre écrivait « ce qu'une session met en
// boîte, c'est ce qu'elle produit » — mais il ne retirait que les items FRAIS
// (`preparation_id: null`), jamais les parts d'une casserole d'une AUTRE
// session. Tant qu'un repas tirait sur une seule casserole, rien ne se voyait ;
// le féculent dans sa propre casserole (lot C) l'a rendu courant.
//
// ── LA RÈGLE ─────────────────────────────────────────────────────────────────
// Dans une session, une boîte ne tient que les parts des casseroles de CETTE
// session. Ce qui la complète ailleurs est NOMMÉ, avec son jour de cuisson. La
// règle est locale : elle ne dépend d'aucun ordre entre sessions, et ne peut
// donc pas se tromper sur une fenêtre qui chevauche deux semaines.
//
// Chiffres en dur, relevés sur le plan `404d64b5`.
// ════════════════════════════════════════════════════════════════════════════

const THOMAS: MemberPortionView = {
  memberId: "mem-thomas",
  displayName: "Thomas",
  portionNote: null,
  eatingSlots: null,
  shares: [],
};
const CHRISTELE: MemberPortionView = { ...THOMAS, memberId: "mem-christele", displayName: "Christèle" };
const FABRICE: MemberPortionView = { ...THOMAS, memberId: "mem-fabrice", displayName: "Fabrice" };
const ROSTER = [THOMAS, CHRISTELE, FABRICE];

function prep(id: string, title: string, cookOn: string): MealPreparation {
  return {
    id,
    title,
    servings_made: 2,
    ingredients: [],
    method: "",
    active_minutes: null,
    total_minutes: null,
    cook_on: cookOn,
  };
}

const CHICKEN = prep("prep_chicken_main", "Poulet aux poivrons et champignons", "wed");
const COUSCOUS = prep("prep_couscous", "Couscous complet", "wed");
const BREAD = prep("prep_toasted_bread", "Pain complet grillé", "wed");
const SALMON = prep("prep_salmon_main", "Saumon, brocoli et carotte", "fri");
const PREPARATIONS = [CHICKEN, COUSCOUS, BREAD, SALMON];

/** Les trois sessions du plan, dans l'ordre du tableau `cooking_sessions`. */
const WED_POTS = ["prep_chicken_main", "prep_couscous"];
const WED_BREAD = ["prep_toasted_bread"];
const FRI_POTS = ["prep_salmon_main"];
const SESSIONS = [WED_POTS, WED_BREAD, FRI_POTS];

type Part = [prepId: string, term: string, grams: number];

function meal(
  day: string,
  slot: string,
  name: string,
  uses: { id: string; kept: "fridge" | "freezer" }[],
  boxes: Record<string, Part[]>,
): GeneratedDish {
  return {
    title: name,
    name,
    slot,
    day,
    method: "",
    why: "",
    ingredients: [],
    uses: uses.map((u) => ({ preparation_id: u.id, servings: 1, kept: u.kept })),
    boxes: Object.entries(boxes).map(([memberId, parts]) => ({
      id: `box_${day}_${slot}_${memberId}`,
      member_ids: [memberId],
      items: parts.map(([id, term, grams]) => ({ preparation_id: id, term, grams, ml: null })),
      legacy_total_grams: null,
    })),
    same_day: null,
    member_id: null,
    side_courses: [],
  } as GeneratedDish;
}

const C = (g: number): Part => ["prep_chicken_main", "Poulet aux poivrons et champignons", g];
const K = (g: number): Part => ["prep_couscous", "Couscous complet", g];
const B = (g: number): Part => ["prep_toasted_bread", "Pain complet grillé", g];
const S = (g: number): Part => ["prep_salmon_main", "Saumon, brocoli et carotte", g];

function plan(salmonKept: "fridge" | "freezer" = "fridge"): GeneratedDish[] {
  return [
    meal("thu", "dinner", "Poulet aux céréales", [
      { id: "prep_chicken_main", kept: "fridge" },
      { id: "prep_couscous", kept: "fridge" },
    ], {
      "mem-thomas": [C(213), K(484)],
      "mem-christele": [C(203), K(289)],
      "mem-fabrice": [C(188), K(268)],
    }),
    meal("fri", "lunch", "Poulet sur tartine", [
      { id: "prep_chicken_main", kept: "fridge" },
      { id: "prep_toasted_bread", kept: "fridge" },
    ], {
      "mem-thomas": [C(179), B(274)],
      "mem-christele": [C(179), B(196)],
      "mem-fabrice": [C(250), B(136)],
    }),
    meal("fri", "dinner", "Saumon au couscous", [
      { id: "prep_salmon_main", kept: salmonKept },
      { id: "prep_couscous", kept: "fridge" },
    ], {
      "mem-thomas": [S(278), K(398)],
      "mem-christele": [S(264), K(207)],
      "mem-fabrice": [S(321), K(104)],
    }),
  ];
}

function linesOf(pots: readonly string[], dishes = plan()) {
  return boxLinesForSession(pots, dishes, ROSTER, PREPARATIONS);
}

function line(pots: readonly string[], boxId: string, dishes = plan()) {
  const found = linesOf(pots, dishes).find((l) => l.id === boxId);
  if (!found) throw new Error(`no line ${boxId}`);
  return found;
}

const grams = (l: { items: readonly { term: string; grams: number }[] }) =>
  l.items.map((it) => [it.term, it.grams]);

describe("MORD — la session de mercredi ne met aucun saumon en boîte", () => {
  it("aucune ligne de la session ne pèse le saumon cuit vendredi", () => {
    const terms = linesOf(WED_POTS).flatMap((l) => l.items.map((it) => it.term));
    expect(terms).not.toContain("Saumon, brocoli et carotte");
  });

  it("la boîte de Thomas du vendredi soir reçoit mercredi son couscous, 398 g, et rien d'autre", () => {
    const l = line(WED_POTS, "box_fri_dinner_mem-thomas");
    expect(grams(l)).toEqual([["Couscous complet", 398]]);
    expect(l.total).toBe(398);
    expect(l.partial).toBe(true);
    expect(l.fromOtherSessions).toEqual([{ term: "Saumon, brocoli et carotte", dayLabel: "Friday" }]);
  });

  it("les trois boîtes du vendredi soir, mercredi : 398, 207 et 104 g de couscous", () => {
    const wed = linesOf(WED_POTS).filter((l) => l.id.startsWith("box_fri_dinner_"));
    expect(wed.map((l) => l.total)).toEqual([398, 207, 104]);
  });
});

describe("la session de vendredi ajoute le saumon, et dit d'où vient le couscous", () => {
  it("Thomas : 278 g de saumon, le couscous nommé avec son jour", () => {
    const l = line(FRI_POTS, "box_fri_dinner_mem-thomas");
    expect(grams(l)).toEqual([["Saumon, brocoli et carotte", 278]]);
    expect(l.fromOtherSessions).toEqual([{ term: "Couscous complet", dayLabel: "Wednesday" }]);
  });

  it("aucune boîte du jeudi ni du vendredi midi : la session ne cuit rien pour eux", () => {
    expect(linesOf(FRI_POTS).map((l) => l.id)).toEqual([
      "box_fri_dinner_mem-thomas",
      "box_fri_dinner_mem-christele",
      "box_fri_dinner_mem-fabrice",
    ]);
  });
});

describe("deux sessions le même jour : chacune pèse sa casserole", () => {
  it("le vendredi midi : le poulet à la grande session, le pain à celle du pain", () => {
    expect(grams(line(WED_POTS, "box_fri_lunch_mem-thomas"))).toEqual([
      ["Poulet aux poivrons et champignons", 179],
    ]);
    expect(grams(line(WED_BREAD, "box_fri_lunch_mem-thomas"))).toEqual([["Pain complet grillé", 274]]);
    expect(line(WED_BREAD, "box_fri_lunch_mem-thomas").fromOtherSessions).toEqual([
      { term: "Poulet aux poivrons et champignons", dayLabel: "Wednesday" },
    ]);
  });
});

describe("⛔ INVARIANTS — sur tout le plan", () => {
  const titleOf = new Map(PREPARATIONS.map((p) => [p.id, p.title] as const));

  it("chaque gramme mis en boîte à une session sort d'une casserole de CETTE session", () => {
    for (const pots of SESSIONS) {
      const own = new Set(pots.map((id) => titleOf.get(id)));
      for (const l of linesOf(pots)) {
        for (const it of l.items) expect(own.has(it.term)).toBe(true);
      }
    }
  });

  it("chaque part de chaque boîte est pesée UNE fois, toutes sessions confondues", () => {
    for (const dish of plan()) {
      for (const card of boxLinesForDish(dish, ROSTER)) {
        const weighed = SESSIONS.flatMap((pots) => linesOf(pots))
          .filter((l) => l.id === card.id)
          .reduce((sum, l) => sum + l.total, 0);
        expect(weighed).toBe(card.total);
      }
    }
  });
});

describe("PASSE À CÔTÉ — un repas dont toutes les casseroles sont de la session reste entier", () => {
  it("le jeudi soir, mercredi : poulet 213 g et couscous 484 g, rien de partiel", () => {
    const l = line(WED_POTS, "box_thu_dinner_mem-thomas");
    expect(grams(l)).toEqual([
      ["Poulet aux poivrons et champignons", 213],
      ["Couscous complet", 484],
    ]);
    expect(l.partial).toBe(false);
    expect(l.fromOtherSessions).toEqual([]);
  });
});

describe("le congélateur se décide sur ce que la session met dans la boîte", () => {
  it("saumon congelé, couscous au frais : mercredi « au frais », vendredi « à congeler »", () => {
    const dishes = plan("freezer");
    expect(line(WED_POTS, "box_fri_dinner_mem-thomas", dishes).frozen).toBe(false);
    expect(line(FRI_POTS, "box_fri_dinner_mem-thomas", dishes).frozen).toBe(true);
  });
});

describe("à l'écran", () => {
  function text(pots: readonly string[]): string {
    const html = renderToStaticMarkup(createElement(BoxTable, { lines: linesOf(pots), context: "session" }));
    return html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
  }

  it("mercredi, la boîte du vendredi soir dit ce qui s'y ajoute et quand", () => {
    const t = text(WED_POTS);
    expect(t).toContain("with Saumon, brocoli et carotte, cooked on Friday");
    expect(t).not.toContain("278");
  });

  it("les deux langues portent la mention", () => {
    expect(fr["meals.boxes.with_other_session"]).toBe("· avec {what}, cuisiné {day}");
    expect(en["meals.boxes.with_other_session"]).toBe("· with {what}, cooked on {day}");
    expect(fr["meals.boxes.with_other_session_undated"]).toBe("· avec {what}, d’une autre session");
    expect(en["meals.boxes.with_other_session_undated"]).toBe("· with {what}, from another session");
  });
});

describe("câblage — les deux écrans de session passent les préparations du plan", () => {
  // Sans elles, le jour de cuisson d'une part venue d'ailleurs est inconnu, et
  // la mention perd son jour.
  function code(rel: string): string {
    return readFileSync(resolve(process.cwd(), rel), "utf8")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  it.each([
    ["src/keel/components/CookingSessions.tsx", /boxLinesForSession\(\s*session\.preparation_ids,\s*dishes,\s*portions,\s*preparations,?\s*\)/],
    ["src/keel/components/plan/PlanDayBlock.tsx", /boxLinesForSession\(\s*session\.preparation_ids,\s*props\.allDishes,\s*props\.portions,\s*props\.preparations,?\s*\)/],
  ])("%s", (rel, call) => {
    expect(code(rel)).toMatch(call);
  });
});
