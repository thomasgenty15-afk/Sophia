import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import PlanGrid from "./plan/PlanGrid";
import { buildPlanGrid } from "../lib/planGridModel";
import type {
  EatingOccasionSlot,
  GeneratedDish,
} from "../api/mealGeneration";
import { en } from "../i18n/en";

// ===========================================================================
// D3b (2026-08-18) — LA GRILLE NE PARLE PLUS AU NOM DE TOUT LE MONDE.
//
// ⛔ DÉFAUT ② — LE PLAT DÉDIÉ. `buildPlanGrid` prenait LE PREMIER plat du
// moment (`find`) et le montrait seul. Un dîner où Zoé mange autre chose se
// lisait « tout le monde mange la même chose »: la seule case où le foyer se
// divise était exactement celle où la grille l'affirmait uni. Pire, un moment
// SANS plat de table affichait l'assiette d'UNE bouche au nom de la table.
//
// ⛔ DÉFAUT ③ — DEUX PLATS DE TABLE AU MÊME DÎNER. Mesuré sur un plan RÉEL
// (`scratchpad/backup_dishes_6620682c.json`, 24 plats): « Prawn and tomato
// rice bowls » ET « Tomato lentil soup with bread » sur `fri/dinner`, tous
// deux sans `member_id`. Rien ne le relevait. On COMPTE et on NOMME — on ne
// rejette rien, c'est la posture de tout le chantier.
//
// ⚠️ ON REND ET ON LIT. Un test sur le seul modèle resterait vert le jour où
// `PlanGrid` cesse de rendre les compteurs — c'est-à-dire la forme exacte du
// défaut d'à côté: un champ calculé que personne n'affiche.
//
// ⚠️ `.ts` ET `createElement`, PAS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait JAMAIS COLLECTÉ.
// ===========================================================================

function dish(over: Partial<GeneratedDish> = {}): GeneratedDish {
  return {
    title: "Chicken and rice",
    slot: "dinner",
    day: "mon",
    method: "",
    why: "",
    ingredients: [],
    uses: [],
    same_day: null,
    member_id: null,
    ...over,
  } as GeneratedDish;
}

const RHYTHM: EatingOccasionSlot[] = [
  { slot: "breakfast", size: null },
  { slot: "lunch", size: null },
  { slot: "dinner", size: null },
];

/** La case du DÎNER de lundi — celle que toutes ces fixtures remplissent. */
function dinnerCell(dishes: GeneratedDish[]) {
  const g = buildPlanGrid({
    days: ["mon", "tue"],
    rhythm: RHYTHM,
    groups: [{ day: "mon", dishes }],
    awayDays: [],
    fixedIntakes: [],
    dayProperties: [],
  });
  const cell = g.rows[2].cells[0];
  if (cell.kind !== "dish") throw new Error(`case ${cell.kind}, pas un plat`);
  return cell;
}

function gridOf(dishes: GeneratedDish[], rhythm: EatingOccasionSlot[] = RHYTHM) {
  return buildPlanGrid({
    days: ["mon", "tue"],
    rhythm,
    groups: [{ day: "mon", dishes }],
    awayDays: [],
    fixedIntakes: [],
    dayProperties: [],
  });
}

function decode(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Le RENDU de la grille, texte seul — ce que l'élève lit vraiment. */
function textOf(dishes: GeneratedDish[]): string {
  return decode(renderToStaticMarkup(createElement(PlanGrid, {
    grid: gridOf(dishes),
    dates: ["2026-08-17", "2026-08-18"],
    today: "2026-08-17",
  }))).replace(/<[^>]*>/g, " ");
}

/** Le RENDU brut, balises comprises — pour les classes CSS. */
function markupOf(dishes: GeneratedDish[]): string {
  return renderToStaticMarkup(createElement(PlanGrid, {
    grid: gridOf(dishes),
    dates: ["2026-08-17", "2026-08-18"],
    today: "2026-08-17",
  }));
}

describe("D3b · ② le plat dédié, dans le modèle", () => {
  it("⛔ LE DÉFAUT — la bouche qui mange à part est COMPTÉE", () => {
    const cell = dinnerCell([
      dish(),
      dish({ title: "Yogurt and fruit", member_id: "m_zoe" }),
    ]);
    // Le plat de la TABLE garde le titre: c'est ce que mange le foyer.
    expect(cell.title).toBe("Chicken and rice");
    expect(cell.ownMouths, "la bouche à part a disparu de la case").toBe(1);
    expect(cell.titleIsOwn).toBe(false);
  });

  it("deux bouches à part se comptent toutes les deux", () => {
    const cell = dinnerCell([
      dish(),
      dish({ title: "Yogurt and fruit", member_id: "m_zoe" }),
      dish({ title: "Pasta, plain", member_id: "m_kid" }),
    ]);
    expect(cell.ownMouths).toBe(2);
  });

  it("⛔ L'ORDRE DU PLAN NE DÉCIDE PAS DU TITRE — la table gagne", () => {
    // ⚠️ FIXTURE DURCIE APRÈS UNE MUTATION QUI NE MORDAIT PAS. Tant que le
    // plat de la table était écrit EN PREMIER, `atSlot[0]` et
    // `table[0] ?? own[0]` rendaient le même titre: la règle avait l'air
    // tenue et ne l'était pas. Un moteur qui émet l'assiette de Zoé d'abord
    // faisait alors passer SON plat pour le dîner de toute la table.
    const cell = dinnerCell([
      dish({ title: "Yogurt and fruit", member_id: "m_zoe" }),
      dish({ title: "Chicken and rice" }),
    ]);
    expect(cell.title, "le premier plat écrit a volé la case").toBe(
      "Chicken and rice",
    );
    expect(cell.titleIsOwn).toBe(false);
    expect(cell.ownMouths).toBe(1);
  });

  it("⛔ AUCUN PLAT DE TABLE — le titre affiché est celui d'UNE bouche", () => {
    const cell = dinnerCell([
      dish({ title: "Yogurt and fruit", member_id: "m_zoe" }),
    ]);
    expect(cell.title).toBe("Yogurt and fruit");
    expect(cell.titleIsOwn, "l'assiette de Zoé passe pour celle de la table")
      .toBe(true);
    expect(cell.ownMouths).toBe(1);
  });

  it("⚠️ LE CAS QUI PASSE — un dîner ordinaire ne compte rien", () => {
    const cell = dinnerCell([dish()]);
    expect(cell.ownMouths).toBe(0);
    expect(cell.titleIsOwn).toBe(false);
    expect(cell.extraTableDishes).toBe(0);
  });

  it("`member_id` ABSENT vaut « plat de la table », jamais « dédié »", () => {
    // La lecture défensive du champ lui-même: ces plans-là étaient déjà pour
    // tout le monde avant que la clé existe.
    const naked = { ...dish() } as Record<string, unknown>;
    delete naked.member_id;
    const cell = dinnerCell([naked as unknown as GeneratedDish]);
    expect(cell.ownMouths).toBe(0);
    expect(cell.titleIsOwn).toBe(false);
  });
});

describe("D3b · ③ deux plats de table au même moment", () => {
  // LES DEUX TITRES DU PLAN RÉEL, tels quels.
  const PRAWN = "Prawn and tomato rice bowls";
  const SOUP = "Tomato lentil soup with bread";

  it("⛔ LE DÉFAUT MESURÉ — la collision est comptée et NOMMÉE", () => {
    const g = gridOf([
      dish({ title: PRAWN, slot: "dinner" }),
      dish({ title: SOUP, slot: "dinner" }),
    ]);
    expect(g.issues).toEqual([{
      kind: "two_table_dishes",
      day: "mon",
      slot: "dinner",
      titles: [PRAWN, SOUP],
    }]);
  });

  it("⚠️ RIEN N'EST REJETÉ — la case garde son titre, et dit qu'il y en a", () => {
    const cell = dinnerCell([
      dish({ title: PRAWN }),
      dish({ title: SOUP }),
    ]);
    expect(cell.title).toBe(PRAWN);
    expect(cell.extraTableDishes).toBe(1);
  });

  it("⚠️ COMPTÉ MÊME SUR UN MOMENT SANS LIGNE DE RYTHME", () => {
    // L'élève ne déclare pas de collation: aucune case ne peut porter la
    // collision, et c'est exactement le silence que ce compteur rompt.
    const g = gridOf([
      dish({ title: PRAWN, slot: "snack_pm" }),
      dish({ title: SOUP, slot: "snack_pm" }),
    ]);
    expect(g.rows.map((r) => r.slot)).not.toContain("snack_pm");
    expect(g.issues.length, "la collision hors rythme est invisible").toBe(1);
    expect(g.issues[0].slot).toBe("snack_pm");
  });

  it("⚠️ UN PLAT DÉDIÉ N'EST PAS UNE COLLISION — c'est le cas nominal", () => {
    // La moitié qui retient: si tout couple de plats du même moment criait,
    // le compteur hurlerait sur chaque foyer où quelqu'un mange à part.
    const g = gridOf([
      dish(),
      dish({ title: "Yogurt and fruit", member_id: "m_zoe" }),
    ]);
    expect(g.issues).toEqual([]);
  });

  it("⚠️ DEUX MOMENTS DIFFÉRENTS NE SE MÉLANGENT PAS", () => {
    const g = gridOf([
      dish({ title: PRAWN, slot: "dinner" }),
      dish({ title: SOUP, slot: "lunch" }),
    ]);
    expect(g.issues).toEqual([]);
  });

  it("un plan SAIN ne relève rien", () => {
    expect(gridOf([dish()]).issues).toEqual([]);
  });

  it("le groupe SANS jour ne fabrique pas de collision", () => {
    // « deux plats le même jour » n'a pas de sens pour des plats qui n'en
    // nomment aucun: leur portée est la fenêtre entière.
    const g = buildPlanGrid({
      days: ["mon"],
      rhythm: RHYTHM,
      groups: [{
        day: null,
        dishes: [dish({ day: null, title: PRAWN }), dish({ day: null, title: SOUP })],
      }],
      awayDays: [],
      fixedIntakes: [],
      dayProperties: [],
    });
    expect(g.issues).toEqual([]);
  });
});

describe("D3b · l'écran: ce que la case AFFICHE", () => {
  it("⛔ LE DÉFAUT ② SE VOIT — le badge « à part » est rendu", () => {
    const html = textOf([
      dish(),
      dish({ title: "Yogurt and fruit", member_id: "m_zoe" }),
    ]);
    expect(html).toContain(en["meals.grid.own_one"]);
    // Le plat de la table reste le titre de la case.
    expect(html).toContain("Chicken and rice");
  });

  it("le compte se dit au pluriel quand deux bouches mangent à part", () => {
    const html = textOf([
      dish(),
      dish({ title: "Yogurt and fruit", member_id: "m_zoe" }),
      dish({ title: "Pasta, plain", member_id: "m_kid" }),
    ]);
    expect(html).toContain(en["meals.grid.own_many"].replace("{n}", "2"));
    expect(html, "le singulier et le pluriel sortent ensemble")
      .not.toContain(en["meals.grid.own_one"]);
  });

  it("⛔ « RIEN POUR LA TABLE » remplace le compte, et ne s'ajoute pas", () => {
    const html = textOf([
      dish({ title: "Yogurt and fruit", member_id: "m_zoe" }),
    ]);
    expect(html).toContain(en["meals.grid.own_only"]);
    // Un seul badge: deux lignes doubleraient la hauteur d'une case étroite.
    expect(html).not.toContain(en["meals.grid.own_one"]);
  });

  it("⛔ LE DÉFAUT ③ SE VOIT — le plat de table en trop est rendu", () => {
    const html = textOf([
      dish({ title: "Prawn and tomato rice bowls" }),
      dish({ title: "Tomato lentil soup with bread" }),
    ]);
    expect(html).toContain(en["meals.grid.extra_one"]);
  });

  it("⚠️ `issues` A UN LECTEUR — le survol NOMME les plats en collision", () => {
    // Sans ce chemin, `grid.issues` serait un champ calculé que personne
    // n'affiche: l'écran ne dirait que le NOMBRE, jamais lesquels.
    const markup = markupOf([
      dish({ title: "Prawn and tomato rice bowls" }),
      dish({ title: "Tomato lentil soup with bread" }),
    ]);
    expect(markup).toContain(
      'title="Prawn and tomato rice bowls · Tomato lentil soup with bread"',
    );
  });

  it("⚠️ LE SURVOL NOMME TOUS LES PLATS, pas les deux premiers", () => {
    const markup = markupOf([
      dish({ title: "A" }),
      dish({ title: "B" }),
      dish({ title: "C" }),
    ]);
    expect(markup).toContain('title="A · B · C"');
  });

  it("deux plats en trop se disent au pluriel", () => {
    const html = textOf([
      dish({ title: "A" }),
      dish({ title: "B" }),
      dish({ title: "C" }),
    ]);
    expect(html).toContain(en["meals.grid.extra_many"].replace("{n}", "2"));
  });

  it("⚠️ LE CAS QUI PASSE — une semaine ordinaire ne porte AUCUN badge", () => {
    const html = textOf([dish()]);
    for (
      const key of [
        "meals.grid.own_one",
        "meals.grid.own_many",
        "meals.grid.own_only",
        "meals.grid.extra_one",
        "meals.grid.extra_many",
      ] as const
    ) {
      expect(html, `${key} s'affiche sur un plan sain`)
        .not.toContain(en[key].replace("{n}", "2"));
    }
    // …et le plat, lui, est bien là.
    expect(html).toContain("Chicken and rice");
  });
});

describe("D3b · la troncature du titre n'est plus inerte", () => {
  it("⛔ `line-clamp-2 block` NE REVIENT PAS — `block` bat `-webkit-box`", () => {
    // Le piège documenté: `line-clamp-2` pose `display:-webkit-box`, et
    // `block` le REMPLACE. La paire est inerte, la troncature ne s'applique
    // jamais, et ça ne se voit qu'avec un titre assez long pour déborder — la
    // grille devient alors aussi haute que la liste qu'elle résume.
    const markup = markupOf([
      dish({ title: "Peanut butter toast and fruit with yoghurt on the side" }),
    ]);
    expect(markup, "la paire inerte est revenue")
      .not.toContain("line-clamp-2 block");
    expect(markup).toContain('class="line-clamp-2"');
  });
});
