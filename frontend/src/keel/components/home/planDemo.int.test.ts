import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { en } from "../../i18n/en";
import { fr } from "../../i18n/fr";
import { setChosenUiLocaleForTest } from "../../i18n/runtime";
import { boxLidLabel } from "../../lib/mealBoxes";
import PlanDemo, { PlanDemoBody } from "./PlanDemo";
import {
  type DemoDish,
  boxLinesForDish,
  boxLinesForSession,
  DEMO_DAYS,
  DEMO_DISHES,
  DEMO_GROCERIES,
  DEMO_PREPS,
  DEMO_SESSIONS,
  DEMO_SILENCES,
  DEMO_WAVES,
  demoGrid,
  relatedTo,
} from "./planDemoData";

// LA DÉMONSTRATION DU PLAN SUR `/` — CE QU'ELLE A LE DROIT DE MONTRER.
//
// Le brief du 2026-09-08 exige un planning « fidèle à la plateforme »: les
// vrais libellés, les vrais liens courses → cuisine → repas, et un exemple
// qui ne prétend rien d'autre. Ces tests gardent les trois, PLUS la taille:
// la première version a été jugée « vraiment énorme », et une fixture qui
// regrossit doit rougir ici avant d'être vue. Ils lisent la VALEUR RENDUE
// (`renderToStaticMarkup`, aucun portail dans ce composant), pas la source.

function atPath(pathname: string): void {
  Object.defineProperty(globalThis, "location", {
    value: { pathname, search: "", href: `http://localhost${pathname}` },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "location");
  setChosenUiLocaleForTest("en");
});

function decode(html: string): string {
  return html
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
}

/**
 * ⚠️ ON REND LE CORPS, PAS LA CARTE. `PlanDemo` est PLIÉ par défaut depuis le
 * 2026-09-08, et `renderToStaticMarkup` ne rend que l'état initial: lu par la
 * carte, tout ce qui suit verdirait sur un panneau vide. Le pliage lui-même a
 * sa garde, plus bas.
 */
function renderFr(goal: "fat_loss" | "muscle_gain" = "fat_loss"): string {
  atPath("/");
  return decode(renderToStaticMarkup(createElement(PlanDemoBody, { goal })));
}

describe("la fixture reste minimale — une personne, deux jours", () => {
  it("deux jours, une session, au plus trois plats et huit articles", () => {
    expect(DEMO_DAYS).toHaveLength(2);
    expect(DEMO_SESSIONS).toHaveLength(1);
    expect(DEMO_DISHES.length).toBeLessThanOrEqual(3);
    expect(DEMO_GROCERIES.length).toBeLessThanOrEqual(8);
    expect(DEMO_WAVES).toHaveLength(1);
  });
});

describe("la fixture tient ses liens", () => {
  const prepIds = new Set(DEMO_PREPS.map((p) => p.id));
  const order = (day: string) => DEMO_DAYS.indexOf(day as (typeof DEMO_DAYS)[number]);

  it("chaque préparation est cuisinée dans EXACTEMENT une session, le jour qu'elle dit", () => {
    for (const prep of DEMO_PREPS) {
      const sessions = DEMO_SESSIONS.filter((s) => s.prepIds.includes(prep.id));
      expect(sessions, prep.id).toHaveLength(1);
      expect(sessions[0].day, prep.id).toBe(prep.cookOn);
    }
  });

  it("chaque plat prélève sur des préparations qui existent et sont cuisinées AVANT lui", () => {
    for (const dish of DEMO_DISHES) {
      for (const id of dish.prepIds) {
        expect(prepIds.has(id), `${dish.id} → ${id}`).toBe(true);
        const prep = DEMO_PREPS.find((p) => p.id === id)!;
        expect(order(prep.cookOn), `${dish.id} mangé avant ${id}`).toBeLessThanOrEqual(order(dish.day));
      }
    }
  });

  it("chaque préparation nourrit au moins un repas, et ses portions sont ses repas", () => {
    for (const prep of DEMO_PREPS) {
      const served = DEMO_DISHES.filter((d) => d.prepIds.includes(prep.id)).length;
      expect(served, prep.id).toBeGreaterThan(0);
      expect(prep.servings, prep.id).toBe(served);
    }
  });

  it("chaque article de courses sert une casserole ou un plat, et il est acheté AVANT", () => {
    for (const g of DEMO_GROCERIES) {
      expect(g.prepIds.length + g.dishIds.length, g.id).toBeGreaterThan(0);
      const wave = DEMO_WAVES.find((w) => w.itemIds.includes(g.id));
      expect(wave, `${g.id} n'est dans aucune vague`).toBeDefined();
      for (const id of g.prepIds) {
        const prep = DEMO_PREPS.find((p) => p.id === id)!;
        expect(order(wave!.buyOn), `${g.id} acheté après ${id}`).toBeLessThanOrEqual(order(prep.cookOn));
      }
    }
    const seen = new Set<string>();
    for (const w of DEMO_WAVES) {
      for (const id of w.itemIds) {
        expect(DEMO_GROCERIES.some((g) => g.id === id), id).toBe(true);
        expect(seen.has(id), `${id} acheté deux fois`).toBe(false);
        seen.add(id);
      }
    }
  });

  it("deux assiettes RIGOUREUSEMENT identiques portent le MÊME titre", () => {
    // ⛔ CE QUE CETTE GARDE ATTRAPE. La fixture servait deux noms — « Poulet
    // rôti au paprika » le dimanche, « Bowl de poulet » le lundi — pour un
    // contenu identique au gramme et à la calorie près. En plus d'être
    // illisible, un second nom laisse croire que la préparation DEVIENT un
    // autre plat le lendemain: la promesse « les préparations de la veille
    // trouvent une nouvelle assiette » que le brief du 2026-09-08 retire.
    //
    // ⚠️ CE QU'ELLE NE DIT PAS, ET C'EST LA MOITIÉ QUI COMPTE: « même fournée
    // ⇒ même nom » serait FAUX. Une casserole de riz nourrit très légitimement
    // « riz au tofu » et « riz au poulet »; et deux plats peuvent même sortir
    // des MÊMES casseroles sous deux noms justes si les proportions diffèrent
    // (une assiette chaude, un bol froid plus léger). Ce qui force un nom
    // commun n'est donc pas la casserole partagée, c'est l'assiette IDENTIQUE:
    // mêmes préparations, mêmes composants, mêmes grammes aux deux objectifs,
    // mêmes kcal. Une garde plus large interdirait au produit ce qu'il fait
    // de mieux.
    const signature = (dish: DemoDish) =>
      JSON.stringify({
        preps: [...dish.prepIds].sort(),
        box: dish.boxItems.map((it) => [it.termKey, it.grams.fat_loss, it.grams.muscle_gain]),
        kcal: dish.kcal,
      });
    for (const a of DEMO_DISHES) {
      for (const b of DEMO_DISHES) {
        if (a.id >= b.id || signature(a) !== signature(b)) continue;
        expect(a.titleKey, `${a.id} et ${b.id} servent la même assiette`)
          .toBe(b.titleKey);
      }
    }
  });

  it("aucun moment vide — le seul état qui serait un défaut", () => {
    atPath("/");
    for (const row of demoGrid()) {
      for (const cell of row.cells) expect(cell.kind).not.toBe("empty");
    }
    expect(DEMO_SILENCES.every((s) => s.kind === "eating_out")).toBe(true);
  });
});

describe("les contenants sont ceux du produit", () => {
  it("le couvercle est construit par `boxLidLabel`, la fonction du produit", () => {
    atPath("/");
    for (const dish of DEMO_DISHES) {
      for (const line of boxLinesForDish(dish, "fat_loss")) {
        const [eater, meal, title] = line.lid.split(" — ");
        expect(line.lid).toBe(boxLidLabel(eater, meal, title));
        expect(line.total).toBe(line.items.reduce((n, it) => n + it.grams, 0));
      }
    }
  });

  it("prendre du muscle donne un contenant plus lourd que perdre du poids", () => {
    atPath("/");
    const heavier = boxLinesForSession(DEMO_SESSIONS[0], "muscle_gain");
    const lighter = boxLinesForSession(DEMO_SESSIONS[0], "fat_loss");
    expect(heavier.length).toBeGreaterThan(0);
    for (let i = 0; i < heavier.length; i++) {
      expect(heavier[i].total).toBeGreaterThan(lighter[i].total);
      expect(heavier[i].kcal!).toBeGreaterThan(lighter[i].kcal!);
    }
  });
});

describe("la chaîne courses → cuisine → repas", () => {
  it("un article allume ses casseroles et les plats qu'elles nourrissent", () => {
    const related = relatedTo({ kind: "grocery", id: "chicken_thighs" });
    expect(related.has("prep:chicken")).toBe(true);
    expect(related.has("dish:mon_lunch")).toBe(true);
    expect(related.has("dish:omelette")).toBe(false);
  });

  it("un plat remonte jusqu'aux articles de ses casseroles", () => {
    const related = relatedTo({ kind: "dish", id: "mon_lunch" });
    expect(related.has("prep:bulgur")).toBe(true);
    expect(related.has("grocery:lemons")).toBe(true);
    expect(related.has("grocery:eggs")).toBe(false);
  });
});

describe("le rendu français reprend les libellés du produit, dans l'ordre vécu", () => {
  it("les courses, la session, le Boxing et les plats portent les mots de `meals.*`", () => {
    const html = renderFr();
    for (const key of [
      "meals.grid.eating_out",
      "meals.result.day_session",
      "meals.boxes.title",
      "meals.boxes.ready_not_raw",
      "meals.boxes.title_dish",
      "meals.energy.basis",
      "meals.shopping.wave_now",
      "meals.same_day.reheat_only",
      "meals.same_day.cook_fresh",
    ] as const) {
      expect(html, key).toContain(fr[key]);
    }
    expect(html).toContain(fr["meals.result.day_groceries_many"].replace("{n}", String(DEMO_GROCERIES.length)));
    expect(html).toContain(fr["meals.sessions.session_time"].replace("{n}", String(DEMO_SESSIONS[0].totalMinutes)));
    // Pas de grille de la semaine, pas de rail: réduit le 2026-09-08.
    expect(html).not.toContain(fr["meals.grid.title"]);
    expect(html).not.toContain(fr["meals.result.day_rail"]);
  });

  it("le dimanche se lit courses, PUIS session, PUIS repas", () => {
    const html = renderFr();
    const groceries = html.indexOf(fr["meals.result.day_groceries_many"].replace("{n}", String(DEMO_GROCERIES.length)));
    const session = html.indexOf(fr["meals.result.day_session"]);
    const meal = html.indexOf(fr["home.demo.dish.chicken_bowl"], session);
    expect(groceries).toBeGreaterThan(0);
    expect(session).toBeGreaterThan(groceries);
    expect(meal).toBeGreaterThan(session);
  });

  it("aucune clé nue n'affleure, dans aucune des deux langues", () => {
    for (const [locale, html] of [["fr", renderFr()], ["en", (() => {
      atPath("/en");
      return renderToStaticMarkup(createElement(PlanDemo, { goal: "fat_loss" }));
    })()]] as const) {
      expect(html, locale).not.toMatch(/\bhome\.[a-z_.]+\b/);
      expect(html, locale).not.toMatch(/\bmeals\.[a-z_.]+\b/);
    }
  });
});

describe("la carte est pliée, et elle dit ce qu'elle contient", () => {
  it("plie l'exemple mais garde son badge, son contenu annoncé et son bouton", () => {
    atPath("/");
    const html = decode(renderToStaticMarkup(createElement(PlanDemo, { goal: "fat_loss" })));
    // Ce qui décide du clic reste lisible.
    expect(html).toContain(fr["home.plan.badge"]);
    expect(html).toContain(fr["home.plan.window"]);
    expect(html).toContain(fr["home.plan.open"]);
    expect(html).toContain('aria-expanded="false"');
    // Et rien du corps n'est rendu tant qu'on n'a pas ouvert.
    expect(html).not.toContain(fr["meals.result.day_session"]);
    expect(html).not.toContain(fr["home.plan.example_note"]);
  });
});

describe("le pack anglais porte les mêmes clés de démonstration", () => {
  it("chaque clé `home.demo.*` française a sa jumelle anglaise", () => {
    for (const key of Object.keys(fr).filter((k) => k.startsWith("home.demo."))) {
      expect((en as Record<string, string>)[key], key).toBeTruthy();
    }
  });
});
