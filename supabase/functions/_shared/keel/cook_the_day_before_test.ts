import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@^1.0.0";

import {
  buildMealPrompt,
  emptySlotsIn,
  MEAL_PROMPT_VERSION,
} from "./meal_generation.ts";
import {
  cookDayBeforeAvailable,
  MAX_WINDOW_DAYS,
  withCookDayBefore,
} from "./meal_plan_window.ts";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * « JE CUISINE LA VEILLE DU PREMIER JOUR » — 2026-09-01.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un plan « lundi→vendredi, je cuisine dimanche » **EST** un plan
 * « dimanche→vendredi » dont le dimanche ne porte aucun repas. C'est la sortie
 * du §3.3 de la synthèse du chantier, et elle ne demande aucune migration: la
 * fenêtre recule d'un jour, et ce jour-là est une journée de CUISINE.
 *
 * ── CE QUE CE LOT DOIT TENIR, ET QUI N'EST PAS ÉVIDENT ────────────────────
 * La veille est DANS la fenêtre et HORS des jours à remplir. Les deux à la
 * fois, et c'est tout le piège:
 *
 *   · DANS — c'est `daysToFill` qui situe les casseroles les unes par rapport
 *     aux autres. En retirer la veille placerait le lot du rang 0 hors fenêtre,
 *     donc `not_evaluated`, dont le seuil est ZÉRO;
 *   · HORS — le modèle ne doit pas y écrire de repas, le plafond de plats ne
 *     doit pas compter ce jour-là, et les cases de ce jour ne sont pas des
 *     trous. Un jour vide VOULU rendu comme un trou subi est un fait faux.
 */

const PROMPT_BASE = {
  firstDayCookable: true,
  hasFreezer: true,
  oneCookingSession: false,
  cookOnlyDay: null as string | null,
  soloBoxes: false,
  contentLocale: "en-US",
  budgetAmount: null,
  dietBlock: "",
  doctrineBlock: "== MARC'S METHOD ==",
  coachNoteBlock: null,
  fixedIntakes: [],
  dayProperties: [],
  merge: null,
  protocolBlock: "",
  beliefKeys: [],
  goal: "health" as const,
  situation: null,
  context: null,
  mode: "to_shop" as const,
  scope: "several_days" as const,
  slot: null,
  servings: 1,
  pantry: [],
  safetyConstraints: null,
  safetyConstraintTable: null,
  body: null,
  focusAxis: null,
  // Un plan qui part du dimanche: `sun` est la veille, `mon`…`fri` se mangent.
  daysToFill: ["sun", "mon", "tue", "wed", "thu", "fri"],
  cookDays: [],
  cookingTimeMin: 60,
  kitchenEquipment: ["oven", "stovetop", "freezer"] as const,
};

// ---------------------------------------------------------------------------
// 1. LA FENÊTRE — reculée, ou refusée avec son motif
// ---------------------------------------------------------------------------

Deno.test("la fenêtre recule d'un jour, et la durée grandit d'autant", () => {
  // ⚠️ ON N'AMPUTE JAMAIS LA FIN. Garder la durée retirerait un jour de repas
  // demandé — c'est-à-dire répondre « tu mangeras un jour de moins » à
  // « je cuisine la veille ».
  assertEquals(
    withCookDayBefore({ startsOn: "2026-09-07", durationDays: 5 }, {
      asked: true,
      today: "2026-09-01",
    }),
    {
      startsOn: "2026-09-06",
      durationDays: 6,
      cookOnlyDay: "sun",
      refused: null,
    },
  );
});

Deno.test("rien demandé ⇒ la fenêtre ne bouge pas d'un jour", () => {
  const same = withCookDayBefore({ startsOn: "2026-09-07", durationDays: 5 }, {
    asked: false,
    today: "2026-09-01",
  });
  assertEquals(same.startsOn, "2026-09-07");
  assertEquals(same.durationDays, 5);
  assertEquals(same.cookOnlyDay, null);
  assertEquals(same.refused, null);
});

Deno.test("le plan commence AUJOURD'HUI ⇒ refusé, la veille est hier", () => {
  const out = withCookDayBefore({ startsOn: "2026-09-01", durationDays: 3 }, {
    asked: true,
    today: "2026-09-01",
  });
  assertEquals(out.refused, "in_the_past");
  // ⛔ ET LA FENÊTRE DEMANDÉE EST SERVIE TELLE QUELLE: un refus de préférence
  // ne doit pas empêcher de composer.
  assertEquals(out.startsOn, "2026-09-01");
  assertEquals(out.durationDays, 3);
  assertEquals(out.cookOnlyDay, null);
});

Deno.test("la veille a le droit d'être AUJOURD'HUI — c'est l'usage courant", () => {
  // On compose le dimanche soir pour la semaine qui commence lundi. Interdire
  // ce cas viderait l'option de l'essentiel de son sens.
  const out = withCookDayBefore({ startsOn: "2026-09-02", durationDays: 3 }, {
    asked: true,
    today: "2026-09-01",
  });
  assertEquals(out.refused, null);
  assertEquals(out.startsOn, "2026-09-01");
});

Deno.test("la fenêtre est déjà au plafond ⇒ refusé, et le motif le dit", () => {
  const out = withCookDayBefore(
    { startsOn: "2026-09-07", durationDays: MAX_WINDOW_DAYS },
    { asked: true, today: "2026-09-01" },
  );
  assertEquals(out.refused, "no_room");
  assertEquals(out.durationDays, MAX_WINDOW_DAYS);
  // ⚠️ SIX JOURS PASSENT, SEPT NON — la borne est épinglée par un littéral,
  // sinon le test se re-paramètre tout seul avec la constante qu'il vérifie.
  assertEquals(
    withCookDayBefore({ startsOn: "2026-09-07", durationDays: 6 }, {
      asked: true,
      today: "2026-09-01",
    }).refused,
    null,
  );
});

Deno.test("`asked` est REQUIS — un appelant qui l'oublie JETTE", () => {
  assertThrows(
    () =>
      withCookDayBefore({ startsOn: "2026-09-07", durationDays: 3 }, {
        today: "2026-09-01",
      } as never),
    Error,
    "asked",
  );
});

Deno.test("le miroir de l'écran rend le MÊME verdict que le moteur", () => {
  // Une case cochable qui serait refusée ensuite promettrait un geste que le
  // moteur ne fera pas. C'est la même fonction, appelée.
  for (
    const w of [
      { startsOn: "2026-09-01", durationDays: 3 },
      { startsOn: "2026-09-02", durationDays: 3 },
      { startsOn: "2026-09-07", durationDays: 7 },
      { startsOn: "2026-09-07", durationDays: 6 },
    ]
  ) {
    assertEquals(
      cookDayBeforeAvailable(w, "2026-09-01"),
      withCookDayBefore(w, { asked: true, today: "2026-09-01" }).refused === null,
      JSON.stringify(w),
    );
  }
});

// ---------------------------------------------------------------------------
// 2. LA CONSIGNE — le jour est nommé, et il sort de la commande
// ---------------------------------------------------------------------------

Deno.test("sans veille, le message ne parle PAS d'un jour de cuisine seul", () => {
  const off = buildMealPrompt({ ...PROMPT_BASE }).userMessage;
  assert(!off.includes("COOKING day only"));
  assertStringIncludes(off, "days to fill, in this order: sun, mon, tue, wed, thu, fri");
});

Deno.test("avec veille, le jour est NOMMÉ et retiré des jours à remplir", () => {
  const on = buildMealPrompt({ ...PROMPT_BASE, cookOnlyDay: "sun" }).userMessage;
  // ⛔ IL SORT DE LA COMMANDE…
  assertStringIncludes(on, "days to fill, in this order: mon, tue, wed, thu, fri");
  // …ET IL EST DIT, parce qu'une absence ne s'obéit pas: le modèle connaît le
  // jour par la date de départ, et l'a déjà rempli quand rien ne l'interdisait.
  assertStringIncludes(on, "the stretch opens on sun, and that day is a COOKING day only");
  assertStringIncludes(on, "Write no dish on sun");
});

Deno.test("la veille EST un jour de cuisine pour la session unique", () => {
  // Sans cette liaison, un plan « je cuisine la veille » n'aurait AUCUN jour de
  // cuisine connu: la session serait posée « au plus tôt » par le modèle,
  // c'est-à-dire n'importe où.
  const on = buildMealPrompt({
    ...PROMPT_BASE,
    cookOnlyDay: "sun",
    oneCookingSession: true,
  }).userMessage;
  assertStringIncludes(on, "done in ONE session, on sun");
});

// ---------------------------------------------------------------------------
// 3. LES CASES VIDES — un jour sans repas n'est pas un trou
// ---------------------------------------------------------------------------

Deno.test("⛔ LE JOUR DE CUISINE NE COMPTE AUCUNE CASE VIDE", () => {
  const args = {
    days: ["sun", "mon"],
    rhythm: [
      { slot: "breakfast" as const, size: null },
      { slot: "dinner" as const, size: null },
    ],
    dishes: [] as { day?: string | null; slot?: string | null }[],
    awayDays: [],
    fixedIntakes: [],
  };
  // Sans la veille: quatre cases, deux par jour.
  assertEquals(emptySlotsIn({ ...args, cookOnlyDay: null }).length, 4);
  // Avec: le dimanche sort entièrement du compte, il n'en reste que deux.
  const withCookDay = emptySlotsIn({ ...args, cookOnlyDay: "sun" });
  assertEquals(withCookDay.length, 2);
  assert(withCookDay.every((c) => c.day === "mon"));
});

Deno.test("la version de prompt a bougé avec ce lot", () => {
  assertEquals(MEAL_PROMPT_VERSION, "meal.en.v24_raw_keeping_reaches_the_model");
});

// ---------------------------------------------------------------------------
// 4. LA SOURCE — les deux lanes reculent la fenêtre, et au bon endroit
// ---------------------------------------------------------------------------

const LANES: readonly [string, string][] = [
  ["solo", "../../generate-meal-v1/index.ts"],
  ["foyer", "../../generate-household-meal-v1/index.ts"],
];

for (const [name, rel] of LANES) {
  Deno.test(`la lane ${name} LIT \`cook_the_day_before\` et RECULE la fenêtre`, async () => {
    const src = await Deno.readTextFile(new URL(rel, import.meta.url));
    assertStringIncludes(
      src,
      "const askedCookTheDayBefore = body.cook_the_day_before === true;",
    );
    assertStringIncludes(src, "const cookAhead = withCookDayBefore({ startsOn, durationDays }, {");
    assertStringIncludes(src, "cook_the_day_before_refused:");
  });

  Deno.test(`la lane ${name} recule AVANT de calculer \`daysToFill\``, async () => {
    // ⛔ L'ORDRE EST LA MOITIÉ DU LOT. `daysToFill`, le chevauchement de plans,
    // la coupure de 18 h et le prompt lisent tous la fenêtre SERVIE. Une
    // fenêtre corrigée après coup laisserait la moitié du moteur sur
    // l'ancienne — et c'est le genre de défaut qui ne casse aucun test.
    const src = await Deno.readTextFile(new URL(rel, import.meta.url));
    const shift = src.indexOf("const cookAhead = withCookDayBefore(");
    // ⚠️ LA PREMIÈRE OCCURRENCE, et pas une déclaration nommée: les deux lanes
    // n'écrivent pas `daysToFill` pareil (`const daysToFill: string[] =` d'un
    // côté, `const daysToFill =` de l'autre). C'est l'APPEL qu'on cherche.
    const fill = src.indexOf("windowDayOrder(startsOn, durationDays)");
    const resolve = src.indexOf("resolveRequestedWindow(windowRequest, todayDate)");
    assert(resolve >= 0 && shift > resolve, `${name}: le recul précède la résolution`);
    assert(fill >= 0 && shift < fill, `${name}: le recul suit \`daysToFill\``);
  });

  Deno.test(`la lane ${name}: l'explication lit la MÊME veille que la consigne`, async () => {
    // ══════════════════════════════════════════════════════════════════════
    // DÉFAUT MESURÉ SUR LE RUN RÉEL `af04fd89-…` (2026-09-01).
    // ══════════════════════════════════════════════════════════════════════
    //
    // La consigne nommait « ONE session, on wed »; l'explication écrivait
    // « tout est cuisiné en une seule session », SANS jour — parce que sa liste
    // de jours de cuisine était calculée sans la veille. Deux calculs du même
    // fait, et c'est l'explication qui avait tort: la troisième fois que ce
    // dépôt paie cette forme après `usableCookDays` et `addedCookDays`.
    const src = await Deno.readTextFile(new URL(rel, import.meta.url));
    const at = src.indexOf("const rationaleCookDays = [");
    assert(at >= 0, `${name}: pas de liste d'explication`);
    const head = src.slice(at, at + 900);
    assertStringIncludes(head, "cookOnlyDay === null ? [] : [cookOnlyDay]");
  });

  Deno.test(`la lane ${name} passe \`cookOnlyDay\` au prompt ET au parseur`, async () => {
    const src = await Deno.readTextFile(new URL(rel, import.meta.url));
    // Deux sites: `buildMealPrompt` et `parseArgs`. Un seul câblé laisserait
    // soit un plat écrit sur le jour de cuisine, soit une journée entière
    // comptée comme un trou.
    const hits = src.match(/^\s+cookOnlyDay,$/gm) ?? [];
    assert(hits.length >= 2, `${name}: ${hits.length} site(s) câblé(s)`);
  });
}
