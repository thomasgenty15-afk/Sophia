// ══════════════════════════════════════════════════════════════════════════
// LA COUVERTURE EFFECTIVE D'UNE FENÊTRE — ce que ces tests protègent
// ══════════════════════════════════════════════════════════════════════════
//
// Dans l'ordre de ce qui coûte le plus cher quand ça casse:
//
//   * LE JOUR VIDE QUI PÈSE UNE JOURNÉE — c'est le défaut mesuré. Un plan
//     lancé à 20 h ne compose pas les moments passés; compter ce jour-là dilue
//     l'énergie servie et rend `within` sur un plan qui déborde de 34 %;
//   * LE JOUR ILLISIBLE QUI PÈSE ZÉRO — l'erreur inverse, et elle FAIT RABOTER
//     une assiette. Des plats sans moment nommé ne doivent pas retirer une
//     journée du dénominateur pendant qu'ils en ajoutent l'énergie;
//   * LE DÉNOMINATEUR QUI S'EFFONDRE — une fenêtre sans un seul plat lisible
//     doit rendre la fenêtre, pas zéro;
//   * LA RÈGLE PAR JOUR RECOPIÉE — ce module APPELLE `dayCoverageOf`. Un test
//     compare les deux sur le même cas: s'ils divergent, quelqu'un a écrit le
//     jumeau que l'en-tête du module interdit.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import { windowCoverageOf } from "./window_coverage.ts";
import { dayCoverageOf } from "./mouth_anchor.ts";

const THREE = ["thu", "fri", "sat"];
const RHYTHM = ["breakfast", "lunch", "dinner"];

const round = (n: number) => Number(n.toFixed(6));

Deno.test("windowCoverageOf — la fenêtre pleine vaut sa durée, au bit près", () => {
  const c = windowCoverageOf({
    windowDays: THREE,
    declaredSlots: RHYTHM,
    composed: THREE.flatMap((day) =>
      RHYTHM.map((slot) => ({ day, slot }))
    ),
  });
  // ⛔ LA NON-RÉGRESSION EST LE PREMIER TEST. Un plan qui compose tout ce que la
  // personne déclare doit rendre EXACTEMENT la fenêtre: sinon ce lot déplace le
  // verdict de toute la population nominale, pas seulement des plans troués.
  assertEquals(c.days, 3);
  assertEquals(c.windowDays, 3);
  assertEquals(c.fallback, false);
  assertEquals(c.byDay.map((d) => d.reason), ["fed", "fed", "fed"]);
});

Deno.test("windowCoverageOf — le jour déjà entamé ne pèse que ce qu'il porte", () => {
  // Le cas mesuré: fenêtre de 3 jours, le premier ne porte qu'un dîner.
  const c = windowCoverageOf({
    windowDays: THREE,
    declaredSlots: RHYTHM,
    composed: [
      { day: "thu", slot: "dinner" },
      ...["fri", "sat"].flatMap((day) => RHYTHM.map((slot) => ({ day, slot }))),
    ],
  });
  // 0,35 / (0,25 + 0,40 + 0,35) = 0,35 exactement — la part d'un dîner.
  assertEquals(round(c.byDay[0].share), 0.35);
  assertEquals(round(c.days), 2.35);
  assertEquals(c.fallback, false);
});

Deno.test("windowCoverageOf — un jour SANS AUCUN PLAT pèse zéro, et il est nommé", () => {
  // ⛔ LE CŒUR DU LOT. `dayCoverageOf` rendrait `1` sur ce jour-là (son repli
  // `covered <= 0`); la fenêtre, elle, SAIT que rien n'y est servi.
  const c = windowCoverageOf({
    windowDays: THREE,
    declaredSlots: RHYTHM,
    composed: ["fri", "sat"].flatMap((day) =>
      RHYTHM.map((slot) => ({ day, slot }))
    ),
  });
  assertEquals(c.days, 2);
  assertEquals(c.byDay[0], { day: "thu", share: 0, reason: "not_fed", slots: [] });
  // Et la preuve que le repli de `dayCoverageOf` dit bien l'inverse: c'est
  // pourquoi il n'est PAS appelé sur un jour vide.
  assertEquals(dayCoverageOf(RHYTHM, []), 1);
});

Deno.test("windowCoverageOf — des plats sans moment nommé pèsent une journée PLEINE", () => {
  // ⚠️ L'ERREUR INVERSE, ET ELLE FAIT RABOTER. Ces plats portent de l'énergie:
  // leur retirer leur journée gonflerait le kcal/jour et ferait rendre `above`
  // sur un plan qui ne déborde pas.
  const c = windowCoverageOf({
    windowDays: THREE,
    declaredSlots: RHYTHM,
    composed: [
      { day: "thu", slot: null },
      { day: "thu", slot: "" },
      ...["fri", "sat"].flatMap((day) => RHYTHM.map((slot) => ({ day, slot }))),
    ],
  });
  assertEquals(c.days, 3);
  assertEquals(c.byDay[0].reason, "unreadable");
  assertEquals(c.byDay[0].share, 1);
});

Deno.test("windowCoverageOf — une fenêtre sans un seul plat rend la fenêtre, jamais zéro", () => {
  const c = windowCoverageOf({
    windowDays: THREE,
    declaredSlots: RHYTHM,
    composed: [],
  });
  assertEquals(c.days, 3);
  assertEquals(c.fallback, true);
});

Deno.test("windowCoverageOf — un plat sans jour sur plusieurs jours désarme le lot", () => {
  // Le parseur jette déjà ces plats-là. S'il en passait un, il porterait de
  // l'énergie sans porter de couverture: on rend la fenêtre entière.
  const c = windowCoverageOf({
    windowDays: THREE,
    declaredSlots: RHYTHM,
    composed: [
      { day: null, slot: "dinner" },
      { day: "fri", slot: "lunch" },
    ],
  });
  assertEquals(c.days, 3);
  assertEquals(c.fallback, true);
});

Deno.test("windowCoverageOf — sur UN jour, un plat sans jour est situé sans ambiguïté", () => {
  // `parseGeneratedMeal` garde ces plats-là quand la fenêtre n'a qu'un jour;
  // les ignorer ici rendrait `not_fed` sur une journée pourtant composée.
  const c = windowCoverageOf({
    windowDays: ["thu"],
    declaredSlots: RHYTHM,
    composed: [
      { day: null, slot: "lunch" },
      { day: null, slot: "dinner" },
    ],
  });
  assertEquals(round(c.days), round(dayCoverageOf(RHYTHM, ["lunch", "dinner"])));
  assertEquals(c.fallback, false);
});

Deno.test("windowCoverageOf — un jour composé HORS fenêtre n'ajoute pas de journée", () => {
  const c = windowCoverageOf({
    windowDays: THREE,
    declaredSlots: RHYTHM,
    composed: [
      ...THREE.flatMap((day) => RHYTHM.map((slot) => ({ day, slot }))),
      { day: "mon", slot: "dinner" },
      { day: "tue", slot: "lunch" },
    ],
  });
  assertEquals(c.days, 3);
  assertEquals(c.byDay.length, 3);
});

Deno.test("windowCoverageOf — la part par jour EST celle de `dayCoverageOf`, pas une copie", () => {
  // ⛔ LE TEST DU JUMEAU. Si quelqu'un réécrit la règle par jour dans ce
  // module, les deux nombres divergent ici.
  const cases: Array<{ declared: string[]; composed: string[] }> = [
    { declared: ["lunch", "dinner"], composed: ["dinner"] },
    { declared: ["breakfast", "lunch", "dinner"], composed: ["breakfast"] },
    { declared: ["lunch", "snack_pm"], composed: ["lunch"] },
    { declared: [], composed: ["breakfast", "lunch", "dinner", "snack_pm"] },
    { declared: ["dinner"], composed: ["dinner", "breakfast"] },
  ];
  for (const c of cases) {
    const w = windowCoverageOf({
      windowDays: ["thu"],
      declaredSlots: c.declared,
      composed: c.composed.map((slot) => ({ day: "thu", slot })),
    });
    assertEquals(round(w.days), round(dayCoverageOf(c.declared, c.composed)));
  }
});

Deno.test("windowCoverageOf — le même moment deux fois ne compte qu'une fois", () => {
  // Deux plats au même dîner, c'est un dîner. `dayCoverageOf` dédoublonne déjà;
  // ce test tient le bucket de CE module, qui pourrait dédoublonner de travers.
  const c = windowCoverageOf({
    windowDays: ["thu"],
    declaredSlots: RHYTHM,
    composed: [
      { day: "thu", slot: "dinner" },
      { day: "thu", slot: "DINNER" },
      { day: "thu", slot: " dinner " },
    ],
  });
  assertEquals(c.byDay[0].slots, ["dinner"]);
  assertEquals(round(c.days), 0.35);
});

Deno.test("windowCoverageOf — une fenêtre vide JETTE, elle n'invente pas un jour", () => {
  assertThrows(
    () =>
      windowCoverageOf({
        windowDays: [],
        declaredSlots: RHYTHM,
        composed: [{ day: "thu", slot: "dinner" }],
      }),
    Error,
    "windowDays est REQUIS",
  );
});

Deno.test("windowCoverageOf — la couverture ne dépasse JAMAIS la fenêtre", () => {
  // Une propriété, pas un exemple: `dayCoverageOf` plafonne chaque jour à 1, et
  // ce module n'itère que les jours de la fenêtre. Le dénominateur ne peut donc
  // pas monter au-dessus de la span — ce qui ferait, lui, sous-nourrir.
  for (const composedSlots of [
    ["breakfast", "lunch", "dinner", "snack_am", "snack_pm", "before_bed", "snack"],
    ["dinner"],
    ["snack"],
  ]) {
    const c = windowCoverageOf({
      windowDays: THREE,
      declaredSlots: ["lunch"],
      composed: THREE.flatMap((day) =>
        composedSlots.map((slot) => ({ day, slot }))
      ),
    });
    assert(c.days <= 3, `${composedSlots.join("+")} → ${c.days}`);
    assert(c.days > 0);
  }
});
