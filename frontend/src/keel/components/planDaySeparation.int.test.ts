import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import PlanDayBlock from "./plan/PlanDayBlock";
import PlanResult from "./plan/PlanResult";
import type { GeneratedDish, MemberPortionView } from "../api/mealGeneration";
import { groupByDay } from "../lib/mealBuilderModel";
import { windowDayOrder } from "../api/mealWindow";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";

// ===========================================================================
// LOT 3 (2026-08-17) — LA SÉPARATION PAR PERSONNE, SUR LA VALEUR RENDUE
//
// ⚠️ CE FICHIER MONTE LE BLOC ET LIT SON HTML. Les tests de source du dépôt
// assèrent des littéraux de JSX; ils sont utiles, et deux d'entre eux ont
// pourtant menti cette semaine: un `shoppingList={draft.shoppingList}` resté
// VERT sur un `[]` en dur (LOT 1), et une garde qui recopiait le JSX au
// caractère près et tombait sur un simple ajout de prop (LOT 2). La seule
// question qui compte ici est « QU'EST-CE QUE LE LECTEUR VOIT, ET COMBIEN DE
// FOIS » — donc on rend, et on compte.
//
// `react-dom/server` et PAS un DOM: ce dépôt n'a ni jsdom ni testing-library
// (`vitest.config.ts` → `environment: "node"`).
// ⚠️ `.ts` ET `createElement`, PAS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait JAMAIS COLLECTÉ.
// ===========================================================================

const TABLE_DISH = "Yogurt, oats and plum breakfast bowls";
/** ⚠️ LE MÊME TITRE POUR LES DEUX PLATS: si un matcher revenait, il perdrait. */
const OWN_DISH = TABLE_DISH;
const DINNER = "Chicken and rice bowls";

function dish(over: Partial<GeneratedDish> = {}): GeneratedDish {
  return {
    title: TABLE_DISH,
    slot: "breakfast",
    day: "fri",
    method: "",
    why: "",
    ingredients: [],
    uses: [],
    same_day: null,
    member_id: null,
    ...over,
  } as GeneratedDish;
}

function person(over: Partial<MemberPortionView> = {}): MemberPortionView {
  return {
    memberId: "mem-zoe",
    displayName: "Zoé",
    portionNote: null,
    shares: [],
    ...over,
  };
}

function decode(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function markup(args: {
  dishes: readonly GeneratedDish[];
  portions: readonly MemberPortionView[];
}): string {
  return decode(renderToStaticMarkup(createElement(PlanDayBlock, {
    group: { day: "fri", dishes: args.dishes },
    date: "2026-08-21",
    today: "2026-08-21",
    preparations: [],
    cookingSessions: [],
    wave: null,
    shoppingList: [],
    moments: [],
    portions: args.portions,
  })));
}

/** Le texte lisible, balises retirées — ce que l'œil reçoit. */
function textOf(args: {
  dishes: readonly GeneratedDish[];
  portions: readonly MemberPortionView[];
}): string {
  return markup(args).replace(/<[^>]*>/g, "");
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const ZOE = person();
const KID = person({ memberId: "mem-kid", displayName: "Kid" });

describe("LOT 3 · deux plats au même moment, deux blocs séparés", () => {
  const split = {
    dishes: [dish(), dish({ title: OWN_DISH, member_id: "mem-zoe" })],
    portions: [ZOE, KID],
  };

  it("⛔ les deux en-têtes sont rendus, chacun UNE fois", () => {
    const html = textOf(split);
    expect(html, "« pour la table » manque").toContain("For the table");
    expect(html, "la bouche n'est pas nommée").toContain("For Zoé");
    expect(occurrences(html, "For the table")).toBe(1);
    expect(occurrences(html, "For Zoé")).toBe(1);
  });

  it("⛔ chaque plat est rendu UNE fois — le plat commun ne se répète pas", () => {
    const html = textOf(split);
    // Deux plats entrent, deux titres sortent. Si le plat de la table était
    // recopié sous Zoé, on en compterait trois — et ce serait affirmer une
    // individualisation que le moteur n'a pas faite.
    expect(occurrences(html, TABLE_DISH)).toBe(2);
  });

  it("⛔ l'ordre est celui qu'on lit: la table, puis la bouche, chacune avec SON plat", () => {
    const html = textOf(split);
    const table = html.indexOf("For the table");
    const zoe = html.indexOf("For Zoé");
    expect(table).toBeGreaterThan(-1);
    expect(zoe).toBeGreaterThan(table);
    // Le plat de la table est ENTRE les deux en-têtes: il appartient à la
    // première voie, pas à la seconde.
    const firstDish = html.indexOf(TABLE_DISH);
    expect(firstDish).toBeGreaterThan(table);
    expect(firstDish).toBeLessThan(zoe);
  });

  it("la jointure est auditable dans le DOM, sans afficher le slug", () => {
    const html = markup(split);
    // Même geste que `data-preparation-id` sur la carte d'un plat: un slug de
    // bouche ne veut rien dire à table, mais la jointure doit se prouver.
    expect(html).toContain('data-member-id="mem-zoe"');
    expect(textOf(split), "un identifiant de bouche est lisible à l'écran")
      .not.toContain("mem-zoe");
  });

  it("⛔ break-words sur l'en-tête: le prénom vient de la ligne membre (320 px)", () => {
    const html = markup(split);
    const bloc = html.slice(0, html.indexOf("For Zoé"));
    expect(bloc.slice(bloc.lastIndexOf("<span")), "l'en-tête n'a pas break-words")
      .toContain("break-words");
  });
});

describe("LOT 3 · le cas majoritaire ne paie rien", () => {
  it("⚠️ LE CAS QUI PASSE — un seul plat commun, aucun en-tête, et le plat est là", () => {
    const html = textOf({ dishes: [dish()], portions: [ZOE, KID] });
    expect(html, "un dîner que tout le monde mange porte une étiquette")
      .not.toContain("For the table");
    expect(html).not.toContain("For Zoé");
    expect(html, "le plat a disparu du jour").toContain(TABLE_DISH);
  });

  it("⚠️ LE CAS QUI PASSE — sans aucune part connue, le jour se rend à plat", () => {
    // Le chemin individuel: `generate-meal-v1` n'écrit aucune `member_portions`.
    const html = textOf({
      dishes: [dish(), dish({ member_id: "mem-zoe" })],
      portions: [],
    });
    expect(html).not.toContain("For the table");
    expect(occurrences(html, TABLE_DISH), "un plat s'est perdu").toBe(2);
  });

  it("aucun plat n'est perdu quand une bouche n'est plus nommée", () => {
    const html = textOf({
      dishes: [dish(), dish({ member_id: "mem-parti" })],
      portions: [ZOE, KID],
    });
    expect(occurrences(html, TABLE_DISH)).toBe(2);
    // Et il n'est pas rangé sous « pour la table », ce qui serait faux: rien
    // n'est séparé du tout ici, puisqu'aucune bouche nommée n'a de plat.
    expect(html).not.toContain("For the table");
  });
});

describe("LOT 3 · les parts, sous le plat et dans le jour", () => {
  const bowls = dish({
    slot: "dinner",
    title: DINNER,
    uses: [{ preparation_id: "prep_chicken", servings: 1 }],
  });
  const zoeShare = person({
    shares: [{ preparationId: "prep_chicken", note: "2 portions of chicken" }],
  });
  const kidShare = person({
    memberId: "mem-kid",
    displayName: "Kid",
    shares: [{ preparationId: "prep_chicken", note: "1 small portion of chicken" }],
  });

  it("⛔ la part de chaque bouche se lit sous SON plat", () => {
    const html = textOf({ dishes: [bowls], portions: [zoeShare, kidShare] });
    expect(html).toContain("2 portions of chicken");
    expect(html).toContain("1 small portion of chicken");
    // Le prénom accompagne la part: une instruction sans nom ne sert personne.
    const note = html.indexOf("2 portions of chicken");
    expect(html.slice(0, note)).toContain("Zoé");
    // Et elle est SOUS le plat, pas au-dessus.
    expect(note).toBeGreaterThan(html.indexOf(DINNER));
  });

  it("⚠️ LE CAS QUI PASSE — un plat sans lot ne porte aucune ligne de part", () => {
    const html = textOf({ dishes: [dish()], portions: [zoeShare, kidShare] });
    expect(html).not.toContain("portions of chicken");
    // Et surtout: aucune phrase de repli n'est fabriquée.
    expect(html).not.toContain("Kid —");
  });

  it("⛔ à une seule bouche, la part ne se récite pas", () => {
    const html = textOf({ dishes: [bowls], portions: [zoeShare] });
    expect(html, "une part récitée à une seule bouche")
      .not.toContain("2 portions of chicken");
    expect(html, "le plat lui-même a disparu").toContain(DINNER);
  });
});

/**
 * LE CÂBLAGE — CE QUE LES TESTS DE VALEUR NE PEUVENT PAS VOIR.
 *
 * Ceux du dessus montent `PlanDayBlock` avec les parts qu'ON lui donne: ils
 * prouvent le RENDU, pas que quelqu'un lui en donne. Les quatre assertions
 * ci-dessous tiennent la chaîne — et elles portent sur des EXPRESSIONS
 * (une garde, une source de donnée), pas sur du JSX recopié au caractère près:
 * une garde qui casse au premier ajout de prop fait relire le test au lieu du
 * changement (cicatrice du LOT 2).
 *
 * ⚠️ COMMENTAIRES RETIRÉS — cicatrice `caller-audit-must-strip-comments`: les
 * en-têtes de ces fichiers parlent longuement de ce qu'ils s'interdisent.
 */
describe("LOT 3 · le câblage, de la ligne jusqu'à l'écran", () => {
  const ROOT = resolve(__dirname, "../../../..");

  function code(rel: string): string {
    return readFileSync(resolve(ROOT, rel), "utf8")
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

  /**
   * ⛔ LE DÉFAUT TROUVÉ EN ÉCRIVANT LE TEST DE CHAÎNE, ET IL EST EN AMONT.
   *
   * `groupByDay` déduplique les plats d'un jour sur `title|slot` — pour qu'un
   * plat de lot, émis une fois par jour couvert, ne s'affiche pas trois fois.
   * Deux plats de MÊME TITRE au même moment y étaient donc UN SEUL: le plat
   * dédié de Zoé, quand le modèle lui donne le même titre qu'à la table, était
   * jeté AVANT tout écran. Le foyer perdait une assiette sur la seule case où
   * deux bouches ne mangent pas la même chose.
   */
  it("⛔ deux plats de même titre, deux bouches: aucun n'est jeté en amont", () => {
    const kept = groupByDay(
      [dish(), dish({ member_id: "mem-zoe" })],
      windowDayOrder("2026-08-21", 1),
    );
    expect(kept[0].dishes, "le plat dédié est jeté par la déduplication")
      .toHaveLength(2);
    // ⚠️ LE CAS QUI PASSE — la déduplication SERT toujours: le même plat de la
    // même bouche, émis deux fois, reste une seule carte.
    const once = groupByDay(
      [dish(), dish()],
      windowDayOrder("2026-08-21", 1),
    );
    expect(once[0].dishes, "la déduplication des lots est désarmée")
      .toHaveLength(1);
  });

  /**
   * ⛔ LE MAILLON QUI MANQUAIT, ET LA MUTATION QUI NE MORDAIT PAS.
   *
   * Mesuré le 2026-08-17: remplacer `portions={props.portions}` par un `[]` en
   * dur dans `PlanResult` laissait **55 tests verts**. Les tests de valeur
   * montaient `PlanDayBlock` DIRECTEMENT — ils prouvaient le rendu du bloc, pas
   * que le rendu du plan lui donne quoi que ce soit. C'est la cicatrice du LOT
   * 1 à l'identique, un composant plus haut. Celui-ci monte le RENDU DU PLAN,
   * c'est-à-dire ce que les deux surfaces montent réellement.
   */
  it("⛔ le RENDU DU PLAN descend les parts jusqu'au jour — chaîne entière", () => {
    const html = renderToStaticMarkup(createElement(PlanResult, {
      dishes: [dish(), dish({ member_id: "mem-zoe" })],
      preparations: [],
      cookingSessions: [],
      shoppingList: [],
      portions: [ZOE, KID],
      startsOn: "2026-08-21",
      durationDays: 1,
      today: "2026-08-21",
      emptyLabel: "",
    }));
    expect(decode(html), "le rendu du plan ne descend pas ses parts au jour")
      .toContain("For Zoé");
  });

  it("⛔ `portions` est REQUISE des deux côtés — un `?` serait une garde désarmée", () => {
    const result = code("frontend/src/keel/components/plan/PlanResult.tsx");
    const block = code("frontend/src/keel/components/plan/PlanDayBlock.tsx");
    expect(result, "la prop est devenue optionnelle")
      .toMatch(/^\s*portions: readonly MemberPortionView\[\];/m);
    expect(block, "la prop est devenue optionnelle")
      .toMatch(/^\s*portions: readonly MemberPortionView\[\];/m);
    expect(block, "le bloc jour ne descend plus les parts au regroupement")
      .toContain("portions: props.portions");
  });

  it("⛔ le plan ÉCRIT prend les parts de SA ligne, et seulement chez le maître", () => {
    const src = code("frontend/src/keel/components/MealBuilder.tsx");
    // La MÊME ligne que les plats: `loadHouseholdMeal` ne rend que le plan
    // COURANT, et l'onglet « suivant » en est un autre.
    expect(src, "les parts ne viennent plus du plan rendu")
      .toContain("result?.memberPortions");
    // Et la garde du maître est ÉCRITE, pas laissée au hasard d'une requête.
    expect(src, "« la part d'un autre » n'est plus fermée au secondaire")
      .toMatch(/portions=\{[^}]*isOwner[^}]*\}/);
  });

  it("⛔ C8 — l'aperçu reçoit les mêmes parts que le plan adopté", () => {
    const src = code("frontend/src/keel/components/plan/PlanDraftDialog.tsx");
    expect(src, "l'aperçu ne peut plus nommer les bouches d'un plat dédié")
      .toContain("portions={draft.memberPortions}");
  });

  it("⛔ AUCUNE LECTURE DE TITRE sur tout le chemin de l'attribution", () => {
    const src = code("frontend/src/keel/lib/planDaySlots.ts") +
      code("frontend/src/keel/components/plan/DayPersonSplit.tsx");
    for (const matcher of [".title.includes", ".title.toLowerCase", ".title.match", "title.indexOf"]) {
      expect(src, `un matcher de titre est entré: ${matcher}`).not.toContain(matcher);
    }
    // L'attribution vient du champ du moteur, et de lui seul.
    expect(code("frontend/src/keel/lib/planDaySlots.ts")).toContain("dish.member_id");
  });
});

describe("LOT 3 · les deux langues, et le prénom qui n'en est pas", () => {
  const KEYS = ["meals.day_person.table", "meals.day_person.member"] as const;

  it("les deux libellés existent dans les DEUX packs", () => {
    for (const key of KEYS) {
      expect(en[key as keyof typeof en], `${key} manque au pack anglais`)
        .toBeTruthy();
      expect(fr[key as keyof typeof fr], `${key} manque au pack français`)
        .toBeTruthy();
    }
  });

  it("⛔ le prénom est un TROU, jamais un mot du gabarit", () => {
    // Sans `{name}`, l'en-tête dirait « Pour » et il faudrait concaténer en
    // code — ce qui imposerait l'ordre anglais à toutes les langues.
    expect(en["meals.day_person.member"]).toContain("{name}");
    expect(fr["meals.day_person.member"]).toContain("{name}");
  });

  it("les gabarits sont RÉDIGÉS, pas recopiés d'une langue à l'autre", () => {
    expect(fr["meals.day_person.table"]).not.toBe(en["meals.day_person.table"]);
    expect(fr["meals.day_person.member"]).not.toBe(en["meals.day_person.member"]);
    expect(fr["meals.day_person.table"]).toBe("Pour la table");
  });

  it("⛔ aucun motif corporel à côté d'un prénom, dans AUCUNE des deux langues", () => {
    // Une séparation par personne est une consigne de cuisine. Le jour où un
    // libellé dirait POURQUOI Zoé mange autre chose, la phrase serait lue à
    // table — et elle ne se rattraperait pas.
    const forbidden = [
      "goal",
      "objectif",
      "kcal",
      "calorie",
      "weight",
      "poids",
      "perte",
      "loss",
    ];
    for (const pack of [en, fr] as Array<Record<string, string>>) {
      for (const key of KEYS) {
        for (const word of forbidden) {
          expect(pack[key].toLowerCase(), `« ${word} » est entré dans ${key}`)
            .not.toContain(word);
        }
      }
    }
    // ⚠️ LE CAS QUI PASSE: les libellés réels traversent cette liste. Sans lui,
    // une liste qui mordrait sur tout ressemblerait à une garde qui marche.
    expect(en["meals.day_person.table"]).toBe("For the table");
  });
});
