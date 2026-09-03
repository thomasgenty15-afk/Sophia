import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { HouseholdDishView, MemberPortionView } from "../../api/household";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ D1 (2026-09-03) — LA COCHE TOMBE-T-ELLE SUR LE BON PLAT ?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LE TROU QUE CE FICHIER FERME, ET IL A ÉTÉ MESURÉ ──────────────────────
 * A8.1 a rendu `HouseholdDishView.dishIndex` REQUIS et a câblé `bindAt` pour
 * que la position vienne du STOCKAGE et non de l'affichage. Rien ne
 * l'éprouvait: le vérificateur a remplacé l'appel à `bindAt` par une
 * redéduction de position (`indexOf` sur la liste filtrée) — c'est-à-dire le
 * mode d'échec EXACT que ce champ existe pour empêcher — et **`tsc` passait,
 * `vitest` passait en entier**. Les seules gardes étaient des `grep` au site
 * d'appel, qui prouvent qu'un nom est écrit, jamais qu'il fait quelque chose.
 *
 * ── CE QUE COÛTE CE MODE D'ÉCHEC ──────────────────────────────────────────
 * Deux formes, et les deux sont silencieuses:
 *   · `indexOf` contre le tableau du hook rend `-1` pour chaque plat d'un
 *     profil réclamé (il tient des `HouseholdDishView`, pas des
 *     `GeneratedDish`): AUCUNE case, et une carte qui a l'air de marcher;
 *   · un rang d'affichage pris pour une position écrit la coche SUR LE PLAT
 *     SUIVANT — un fait faux, daté, indémentable, et invisible parce que les
 *     deux plats existent et que les deux titres sont plausibles.
 *
 * ── COMMENT IL EST ÉPROUVÉ ────────────────────────────────────────────────
 * La liaison est REMPLACÉE par une sonde (`vi.mock`), et on regarde ce que la
 * carte lui PASSE. C'est le seul niveau où la question a un sens: le hook, lui,
 * ne peut pas savoir si l'index qu'il reçoit est le bon — c'est écrit dans son
 * en-tête, et c'est pour ça que l'épreuve porte sur l'appelant.
 *
 * La fixture est construite pour que rang d'affichage et position de stockage
 * DIVERGENT dans les deux sens: sans cette divergence, un `bindTick(i)` naïf
 * resterait vert.
 */

/** Ce que la carte a demandé à la liaison, dans l'ordre du rendu. */
type Probe = { title: string; dishIndex: number; onDate: string | null };
const asked: Probe[] = [];

vi.mock("../../lib/useMealTicks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/useMealTicks")>();
  return {
    ...actual,
    // ⚠️ `browserLocalDate` RESTE LE VRAI: c'est lui qui décide qu'un plat du
    // FUTUR n'a pas de case, et le remplacer ferait passer ce test sur une
    // fenêtre où l'app, elle, ne rendrait rien.
    useMealTicks: () => ({
      ready: true,
      error: null,
      bind: () => null,
      bindAt: (
        dish: { title?: string },
        dishIndex: number,
        onDate: string | null,
      ) => {
        asked.push({ title: String(dish?.title ?? ""), dishIndex, onDate });
        return {
          checked: false,
          busy: false,
          onToggle: () => {},
          untickPrompt: null,
        };
      },
    }),
  };
});

const { default: MyShareCard } = await import("./MyShareCard");

const ME = "mem-bo";
const OTHER = "mem-cy";

/**
 * ⚠️ LES POSITIONS SONT VOLONTAIREMENT DÉSORDONNÉES ET TROUÉES.
 *
 * Deux plats dédiés à une AUTRE bouche (positions 0 et 2) sont retirés par
 * `dishIsFor`, et le plat de LUNDI est stocké APRÈS celui de MARDI. Après
 * filtrage puis regroupement par jour, la carte affiche donc:
 *
 *     rang 0 (lundi)  ->  position STOCKÉE 3
 *     rang 1 (mardi)  ->  position STOCKÉE 1
 *
 * Un rang pris pour une position écrirait 0 et 1: la coche du lundi tomberait
 * sur le plat de quelqu'un d'autre.
 */
const DISHES: HouseholdDishView[] = [
  {
    dishIndex: 0,
    title: "Porridge for Cy",
    day: "mon",
    slot: "breakfast",
    uses: [],
    memberId: OTHER,
  },
  {
    dishIndex: 1,
    title: "Chicken and rice",
    day: "tue",
    slot: "dinner",
    uses: [],
    memberId: null,
  },
  {
    dishIndex: 2,
    title: "Pasta for Cy",
    day: "tue",
    slot: "lunch",
    uses: [],
    memberId: OTHER,
  },
  {
    dishIndex: 3,
    title: "Yogurt bowls",
    day: "mon",
    slot: "breakfast",
    uses: [],
    memberId: null,
  },
];

const MINE: MemberPortionView = {
  memberId: ME,
  displayName: "Bo",
  portionNote: "Serve a larger share of the protein.",
  shares: [],
  eatingSlots: null,
};

/**
 * Le plan commence un LUNDI, et dans le PASSÉ.
 *
 * Le passé se rattrape, le futur non (`isReportable`): un plan commencé
 * aujourd'hui ferait disparaître la case de mardi et l'épreuve ne mesurerait
 * plus rien. On recule donc de deux semaines depuis un lundi calculé, jamais
 * une date en dur — une date figée finit par tomber dans le futur d'un test.
 */
function pastMonday(): string {
  const now = new Date();
  const at = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const d = new Date(at);
  // `getUTCDay()`: 0 = dimanche. On recule jusqu'au lundi, puis de 14 jours.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 14);
  return d.toISOString().slice(0, 10);
}

function render(): string {
  return renderToStaticMarkup(createElement(MyShareCard, {
    mine: MINE,
    householdDishes: DISHES,
    dishDayOrder: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    meMemberId: ME,
    userId: "user-bo",
    householdMealId: "11111111-2222-3333-4444-555555555555",
    planStartsOn: pastMonday(),
    onApprove: async () => {},
    onRequestChange: async () => {},
    busy: false,
  }));
}

describe("D1 — la coche d'un membre tombe sur la POSITION STOCKÉE", () => {
  beforeEach(() => {
    asked.length = 0;
  });

  it("⚠️ LE CAS QUI PASSE — la carte demande 3 puis 1, jamais 0 puis 1", () => {
    render();
    // Deux plats à lui, dans l'ordre du PLAN (lundi avant mardi).
    expect(asked.map((a) => a.title)).toEqual([
      "Yogurt bowls",
      "Chicken and rice",
    ]);
    // ⛔ ET C'EST TOUT L'OBJET DU FICHIER: la position vient du stockage.
    expect(asked.map((a) => a.dishIndex)).toEqual([3, 1]);
  });

  it("⛔ le titre et la position voyagent ENSEMBLE — un décalage d'un cran est visible", () => {
    render();
    // Le couple, pas les deux listes côte à côte: c'est le couple qui est
    // faux quand un rang est pris pour une position, et deux `toEqual`
    // séparés resteraient verts sur un appariement croisé.
    expect(asked.map((a) => [a.title, a.dishIndex])).toEqual([
      ["Yogurt bowls", 3],
      ["Chicken and rice", 1],
    ]);
  });

  it("⛔ LE PLAT D'UNE AUTRE BOUCHE N'EST JAMAIS PROPOSÉ À LA COCHE", () => {
    render();
    // La garde est `dishIsFor`, et elle passe AVANT la liaison. Sans elle, la
    // carte offrirait à Bo de cocher le petit-déjeuner de Cy — un fait de
    // consommation écrit par quelqu'un d'autre (R11).
    expect(asked.some((a) => a.title.includes("Cy"))).toBe(false);
    expect(asked.some((a) => a.dishIndex === 0 || a.dishIndex === 2)).toBe(false);
  });

  it("la date vient du PLAN, jamais du jour du tap", () => {
    render();
    const monday = pastMonday();
    const tuesday = new Date(`${monday}T00:00:00Z`);
    tuesday.setUTCDate(tuesday.getUTCDate() + 1);
    // Un fait doit être daté du jour où il a eu lieu. Dater du jour du tap
    // ferait apparaître le dîner de lundi dans la journée de mercredi.
    expect(asked.map((a) => a.onDate)).toEqual([
      monday,
      tuesday.toISOString().slice(0, 10),
    ]);
  });

  it("⛔ LE CAS QUI REFUSE — sans compte, la carte ne demande AUCUNE case", () => {
    // Une garde qu'on ne sait pas faire dire « non » ne garde rien. `userId`
    // et `householdMealId` sont requis et `null` FERME: une carte sans case
    // doit être un refus explicite, pas un chargement qui n'a jamais fini.
    renderToStaticMarkup(createElement(MyShareCard, {
      mine: MINE,
      householdDishes: DISHES,
      dishDayOrder: ["mon", "tue"],
      meMemberId: ME,
      userId: null,
      householdMealId: null,
      planStartsOn: null,
      onApprove: async () => {},
      onRequestChange: async () => {},
      busy: false,
    }));
    expect(asked).toEqual([]);
  });
});
