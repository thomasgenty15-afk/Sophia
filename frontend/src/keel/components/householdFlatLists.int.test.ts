import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import HouseholdPlanCard from "./HouseholdPlanCard";
import MyShareCard from "./plan/MyShareCard";
import type {
  HouseholdDishView,
  HouseholdMealView,
  MemberPortionView,
} from "../api/household";
import { buildPersonWeek, dishIsFor } from "../lib/planByPersonModel";
import { en } from "../i18n/en";

// ===========================================================================
// D3 (2026-08-18) — LE PLAT DÉDIÉ D'UN AUTRE N'ENTRE PAS DANS LES LISTES PLATES
//
// ⚠️ CE FICHIER MONTE LES DEUX CARTES ET LIT LEUR HTML. Un test de source
// (« le filtre est appelé ») serait resté vert le jour où le filtre est appelé
// sur la mauvaise liste — c'est exactement ce qui s'est passé ici: la règle
// EXISTAIT dans `buildPersonWeek` et personne ne l'appliquait sur ce chemin.
// La seule question qui compte est « QU'EST-CE QUE LE LECTEUR VOIT ».
//
// `react-dom/server` et PAS un DOM (`vitest.config.ts` → `environment: node`).
// ⚠️ `.ts` ET `createElement`, PAS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait JAMAIS COLLECTÉ.
// ===========================================================================

const TABLE_DISH = "Chicken and rice bowls";
/** ⚠️ LE MÊME TITRE POUR LES DEUX: si un matcher revenait, il perdrait. */
const ZOE_DISH = "Chicken and rice bowls";
/** Un titre PROPRE au plat de Zoé, pour compter sans ambiguïté. */
const ZOE_ONLY = "Greek yogurt bowls with peaches";

/**
 * ⚠️ `dishIndex` EST DANS LE SOCLE DE LA FIXTURE, ET IL NE PEUT PAS ÊTRE
 * OPTIONNEL. C'est la POSITION dans le `dishes[]` STOCKÉ, capturée AVANT tout
 * filtre; ces listes-ci sont filtrées puis regroupées, donc un rang
 * d'affichage n'est PAS une position. Le rendre optionnel pour faire taire un
 * test rouvrirait le trou qu'A8.1 a fermé — la coche d'un membre posée sur le
 * plat suivant. Les cas qui ont besoin d'une autre position la passent par
 * `over`.
 */
function dish(over: Partial<HouseholdDishView> = {}): HouseholdDishView {
  return {
    dishIndex: 0,
    title: TABLE_DISH,
    day: "mon",
    slot: "dinner",
    uses: [],
    memberId: null,
    ...over,
  };
}

function person(over: Partial<MemberPortionView> = {}): MemberPortionView {
  return {
    memberId: "mem-kid",
    displayName: "Kid",
    portionNote: null,
    // ⚠️ `null` = elle n'a rien déclaré, donc elle suit la maison — le cas
    // nominal. Un test qui veut prouver qu'une bouche est ABSENTE d'un moment
    // le dit explicitement (`eatingSlots: ["lunch", "dinner"]`).
    eatingSlots: null,
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

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function meal(dishes: readonly HouseholdDishView[]): HouseholdMealView {
  return {
    mealId: "meal-1",
    startsOn: "2026-08-17",
    durationDays: 7,
    portions: [],
    dishes: [...dishes],
    trace: {
      present: false,
      taken: [],
      partial: [],
      reclaimed: [],
      unmerged: [],
      mergeShapeHonoured: null,
    },
  };
}

/** « Ce que la maison cuisine », vue par un SECONDAIRE (`isOwner: false`). */
function houseText(args: {
  dishes: readonly HouseholdDishView[];
  meMemberId: string | null;
}): string {
  return decode(renderToStaticMarkup(createElement(HouseholdPlanCard, {
    meal: meal(args.dishes),
    members: [],
    meMemberId: args.meMemberId,
    isOwner: false,
  }))).replace(/<[^>]*>/g, "");
}

/** « Ta part », la seule surface où un secondaire lit le plan du foyer. */
function shareText(args: {
  dishes: readonly HouseholdDishView[];
  meMemberId: string | null;
}): string {
  return decode(renderToStaticMarkup(createElement(MyShareCard, {
    mine: person({ memberId: args.meMemberId ?? "mem-kid" }),
    householdDishes: args.dishes,
    dishDayOrder: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    meMemberId: args.meMemberId,
    // ⚠️ LES TROIS `null` D'A8.1, ÉCRITS ET NON OMIS. Sans compte, sans plan de
    // foyer et sans premier jour, la carte ne rend AUCUNE case — et c'est ce
    // que ce fichier mesure: la liste des plats, pas les coches. Un `?` sur ces
    // props ferait une carte sans case indistinguable d'une carte dont les
    // cases n'ont pas chargé, ce que l'en-tête de `MyShareCard` refuse.
    userId: null,
    householdMealId: null,
    planStartsOn: null,
    onApprove: async () => {},
    onRequestChange: async () => {},
    busy: false,
  }))).replace(/<[^>]*>/g, "");
}

const MIXED = [
  dish(),
  dish({ title: ZOE_ONLY, slot: "breakfast", memberId: "mem-zoe" }),
];

describe("D3 · « ce que la maison cuisine » (HouseholdPlanCard)", () => {
  it("⛔ LE DÉFAUT — le plat dédié de Zoé n'est plus dans la liste de Kid", () => {
    const html = houseText({ dishes: MIXED, meMemberId: "mem-kid" });
    expect(html, "le plat d'une autre bouche est lisible ici")
      .not.toContain(ZOE_ONLY);
    expect(html, "le plat de la table a disparu avec lui").toContain(TABLE_DISH);
  });

  it("⛔ MÊME TITRE DES DEUX CÔTÉS — l'attribution décide, jamais le texte", () => {
    // Le piège: si la règle lisait le TITRE, elle jetterait les deux ou aucun.
    const html = houseText({
      dishes: [dish(), dish({ title: ZOE_DISH, memberId: "mem-zoe" })],
      meMemberId: "mem-kid",
    });
    expect(occurrences(html, TABLE_DISH), "le plat de la table est rendu deux fois")
      .toBe(1);
  });

  it("SON plat à elle reste dans SA liste", () => {
    const html = houseText({ dishes: MIXED, meMemberId: "mem-zoe" });
    expect(html, "Zoé ne voit plus son propre plat").toContain(ZOE_ONLY);
    expect(html).toContain(TABLE_DISH);
  });

  it("⚠️ BOUCHE INCONNUE ⇒ SEULEMENT LA TABLE, jamais le plat de tout le monde", () => {
    const html = houseText({ dishes: MIXED, meMemberId: null });
    expect(html).not.toContain(ZOE_ONLY);
    expect(html).toContain(TABLE_DISH);
  });

  it("⚠️ QUE DES PLATS D'AUTRES ⇒ la phrase de vide, pas une liste vide", () => {
    const html = houseText({
      dishes: [dish({ title: ZOE_ONLY, memberId: "mem-zoe" })],
      meMemberId: "mem-kid",
    });
    expect(html).toContain(en["household.plan.no_dishes"]);
    expect(html).not.toContain(ZOE_ONLY);
  });

  it("⚠️ LE CAS QUI PASSE — une table sans aucun plat dédié ne paie rien", () => {
    const html = houseText({
      dishes: [dish(), dish({ title: "Lentil soup", day: "tue" })],
      meMemberId: "mem-kid",
    });
    expect(html).toContain(TABLE_DISH);
    expect(html).toContain("Lentil soup");
    expect(html).not.toContain(en["household.plan.no_dishes"]);
  });
});

describe("D3 · « ta part » (MyShareCard)", () => {
  it("⛔ LE DÉFAUT — le plat dédié de Zoé n'est plus dans la part de Kid", () => {
    const html = shareText({ dishes: MIXED, meMemberId: "mem-kid" });
    expect(html).not.toContain(ZOE_ONLY);
    expect(html).toContain(TABLE_DISH);
  });

  it("SON plat à elle reste dans SA part", () => {
    const html = shareText({ dishes: MIXED, meMemberId: "mem-zoe" });
    expect(html).toContain(ZOE_ONLY);
  });

  it("⚠️ QUE DES PLATS D'AUTRES ⇒ aucune section « ce que la maison cuisine »", () => {
    const html = shareText({
      dishes: [dish({ title: ZOE_ONLY, memberId: "mem-zoe" })],
      meMemberId: "mem-kid",
    });
    expect(html, "une section vide s'ouvre sous son titre")
      .not.toContain(en["plan.mine.household_dishes"]);
  });

  it("⚠️ LE CAS QUI PASSE — la section s'ouvre dès qu'un plat de table existe", () => {
    const html = shareText({ dishes: MIXED, meMemberId: "mem-kid" });
    expect(html).toContain(en["plan.mine.household_dishes"]);
  });
});

describe("D3 · UNE seule règle, pas deux", () => {
  it("⛔ `buildPersonWeek` répond exactement comme `dishIsFor`", () => {
    // La cicatrice: deux filtres écrits séparément divergent au premier
    // correctif. Muter `dishIsFor` doit casser la vue individuelle AUSSI.
    const week = buildPersonWeek({
      days: ["mon"],
      dishes: MIXED,
      person: person({ memberId: "mem-kid" }),
    });
    const titles = week.flatMap((d) => d.dishes.map((x) => x.title));
    expect(titles).toEqual(
      MIXED.filter((d) => dishIsFor(d, "mem-kid")).filter((d) => d.day === "mon")
        .map((d) => d.title),
    );
  });

  it("la règle elle-même, aux trois bornes", () => {
    expect(dishIsFor({ memberId: null }, "mem-kid")).toBe(true);
    expect(dishIsFor({ memberId: "mem-kid" }, "mem-kid")).toBe(true);
    expect(dishIsFor({ memberId: "mem-zoe" }, "mem-kid")).toBe(false);
    expect(dishIsFor({ memberId: "mem-zoe" }, null)).toBe(false);
    expect(dishIsFor({ memberId: null }, null)).toBe(true);
  });
});
