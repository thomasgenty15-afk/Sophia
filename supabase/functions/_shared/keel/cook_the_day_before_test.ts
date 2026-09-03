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
import { HOUSEHOLD_PROMPT_VERSION } from "./household_meal_generation.ts";
import {
  cookDayBeforeAvailable,
  eatenSpan,
  firstBlockingPlan,
  MAX_LEAD_DAYS,
  MAX_WINDOW_DAYS,
  planTimingOf,
  withCookDayBefore,
} from "./meal_plan_window.ts";
import { leadDayFor, SHOPPING_CUTOFF_HOUR } from "./plan_hours.ts";

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
  // ⟳ A1 (2026-09-03) — v24 → v25. LA CONSIGNE ELLE-MÊME N'A PAS CHANGÉ D'UN
  // CARACTÈRE; c'est la POPULATION qui la reçoit qui change, et c'est très
  // exactement ce que la version mesure (règle transverse n°8): jusqu'ici
  // `cookOnlyDay` n'était posé que sur les plans dont quelqu'un avait coché une
  // case, désormais il l'est par défaut. Comparer les plans d'avant et d'après
  // sous une même version rendrait la mesure fausse.
  // ⚠️ v26 (2026-09-03, A2/P2) — LE STYLE DE CUISINE POSE LES SESSIONS.
  // Population qui voit une consigne différente: celle qui a répondu aux DEUX
  // questions de P2 (`cooking_style` + `grocery_runs`). Pour elle, `cook_days`
  // et le plafond de temps de session ne viennent plus de la colonne mais de
  // la dérivation; pour tous les autres, la consigne est celle de v25 au
  // caractère près, et un test de rationale le tient ligne à ligne.
  assertEquals(MEAL_PROMPT_VERSION, "meal.en.v26_the_cooking_style_sets_the_sessions");
});

Deno.test("A1 — l'enveloppe du FOYER ne bouge pas d'un octet", () => {
  // ⛔ UN BUMP PAR LOT, ET UN TEST POUR LA LANE QUI NE BOUGE PAS. A1 ne touche
  // ni `buildHouseholdPromptBlocks` ni aucun de ses blocs: le foyer reçoit la
  // même enveloppe qu'hier, et sa version doit donc rester à l'identique.
  // Bumper les deux « par symétrie » ferait croire à une population de foyer
  // qui a changé de consigne alors qu'elle n'a rien vu.
  // ⟳ A2 (2026-09-03) — L'ENVELOPPE BOUGE MAINTENANT, ET POUR SON PROPRE
  // MOTIF: D6.2 y pose la consigne de la gamelle (v22 → v23). Ce cas ne
  // disparaît pas pour autant — il devient la garde que l'enveloppe ne
  // bouge QUE quand un lot la touche, et il nomme lequel.
  assertEquals(HOUSEHOLD_PROMPT_VERSION, "v23_the_lunchbox_travels");
});

// ---------------------------------------------------------------------------
// 4. LA SOURCE — les deux lanes reculent la fenêtre, et au bon endroit
// ---------------------------------------------------------------------------

const LANES: readonly [string, string][] = [
  ["solo", "../../generate-meal-v1/index.ts"],
  ["foyer", "../../generate-household-meal-v1/index.ts"],
];

for (const [name, rel] of LANES) {
  Deno.test(`la lane ${name} DÉRIVE la veille et ne lit plus le corps HTTP`, async () => {
    // ⟳ A1 (2026-09-03) — CE TEST S'EST RETOURNÉ, IL NE S'EST PAS SUPPRIMÉ.
    // Il exigeait `const askedCookTheDayBefore = body.cook_the_day_before ===
    // true;`. La veille n'est plus une case: ce qu'il faut tenir maintenant,
    // c'est que la lane DÉRIVE (`leadDayFor`) et que le corps HTTP ne peut plus
    // décider.
    const src = await Deno.readTextFile(new URL(rel, import.meta.url));
    assertStringIncludes(
      src,
      "const lead = leadDayFor({ startsOn, today: todayDate, hourNow });",
    );
    assertStringIncludes(
      src,
      "const cookAhead = withCookDayBefore({ startsOn, durationDays }, {\n      asked: lead.leadDay !== null,",
    );
    assertStringIncludes(src, "const planTiming: PlanTiming = planTimingOf(lead, cookAhead);");
    assertStringIncludes(src, "cook_the_day_before_refused:");
    // ⛔ ET LE CORPS N'EST PLUS LU — MESURÉ SUR LA SOURCE SANS SES COMMENTAIRES.
    // Le retrait est raconté DANS un commentaire qui nomme le champ; un grep
    // naïf y verrait un appelant vivant et ce test resterait vert le jour où
    // quelqu'un rebranche la case. (Leçon « audit d'appelants: retirer les
    // commentaires », déjà payée par ce dépôt.)
    const code = src
      .split("\n")
      .map((line) => (line.trimStart().startsWith("//") ? "" : line))
      .join("\n");
    assert(
      !code.includes("body.cook_the_day_before"),
      `${name}: le corps HTTP décide encore de la veille`,
    );
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

// ═══════════════════════════════════════════════════════════════════════════
// 5. LA VEILLE EST DÉRIVÉE — chantier-0903/CUISINE, A1 (P1), 2026-09-03
// ═══════════════════════════════════════════════════════════════════════════
//
// Jusqu'à ce lot, « je cuisine la veille » était une CASE. La règle produit du
// 03/09: les courses et la cuisson se font la veille, AUTOMATIQUEMENT, avec la
// coupure de 18 h — et quand la veille n'est plus possible, on le DIT.
//
// ⛔ CE QUE CES TESTS DOIVENT EMPÊCHER, ET QUI EST LE PIÈGE DU LOT: qu'une
// horloge illisible se lise comme « minuit », donc comme « avant 18 h », donc
// comme une veille accordée. Le produit d'hier (pas de veille) est le seul
// repli honnête, et il porte un NOM (`clock_unreadable`).

Deno.test("A1 — la table de `leadDayFor`, ligne par ligne", () => {
  // ① deux jours ou plus: la veille est un jour plein, l'heure n'y change rien.
  for (const hourNow of [0, 9, 17, 18, 23, null]) {
    const out = leadDayFor({ startsOn: "2026-09-10", today: "2026-09-01", hourNow });
    assertEquals(out.leadDay, "2026-09-09");
    assertEquals(out.timing, "day_before");
    assertEquals(out.reason, "day_before");
  }
  // ② demain, avant la coupure: la veille, c'est CE SOIR.
  const tonight = leadDayFor({
    startsOn: "2026-09-02",
    today: "2026-09-01",
    hourNow: SHOPPING_CUTOFF_HOUR - 1,
  });
  assertEquals(tonight.leadDay, "2026-09-01");
  assertEquals(tonight.timing, "day_before");
  assertEquals(tonight.reason, "before_cutoff_today");
  // ③ demain, après la coupure: plus le temps ce soir.
  const late = leadDayFor({
    startsOn: "2026-09-02",
    today: "2026-09-01",
    hourNow: SHOPPING_CUTOFF_HOUR,
  });
  assertEquals(late.leadDay, null);
  assertEquals(late.timing, "same_morning");
  assertEquals(late.reason, "after_cutoff");
  // ④ aujourd'hui: la veille est hier, quelle que soit l'heure.
  for (const hourNow of [6, 12, 22, null]) {
    const out = leadDayFor({ startsOn: "2026-09-01", today: "2026-09-01", hourNow });
    assertEquals(out.leadDay, null);
    assertEquals(out.reason, "starts_today");
  }
  // ⑤ l'horloge illisible N'EST PAS minuit — et elle se NOMME.
  const blind = leadDayFor({ startsOn: "2026-09-02", today: "2026-09-01", hourNow: null });
  assertEquals(blind.leadDay, null);
  assertEquals(blind.timing, "same_morning");
  assertEquals(blind.reason, "clock_unreadable");
});

Deno.test("A1 — la coupure de `leadDayFor` EST `SHOPPING_CUTOFF_HOUR`", () => {
  // ⚠️ NON PARAMÉTRÉ PAR SA PROPRE CONSTANTE POUR LA BASCULE: on balaie les
  // 24 heures et on VÉRIFIE l'heure exacte où le verdict change. Muter
  // `SHOPPING_CUTOFF_HOUR` fait tomber ce test, alors qu'un `hourNow:
  // SHOPPING_CUTOFF_HOUR - 1` seul le suivrait en silence.
  const flips: number[] = [];
  let previous = leadDayFor({ startsOn: "2026-09-02", today: "2026-09-01", hourNow: 0 })
    .timing;
  for (let hourNow = 1; hourNow < 24; hourNow++) {
    const now = leadDayFor({ startsOn: "2026-09-02", today: "2026-09-01", hourNow }).timing;
    if (now !== previous) flips.push(hourNow);
    previous = now;
  }
  assertEquals(flips, [18]);
  assertEquals(SHOPPING_CUTOFF_HOUR, 18);
});

Deno.test("A1 — `leadDayFor` refuse un départ passé et une horloge absente", () => {
  assertThrows(
    () => leadDayFor({ startsOn: "2026-08-31", today: "2026-09-01", hourNow: 9 }),
    Error,
    "dans le passé",
  );
  assertThrows(
    // `hourNow` manquant ≠ `hourNow: null`. Le premier est un appelant qui a
    // oublié la question; le second est une réponse.
    () => leadDayFor({ startsOn: "2026-09-02", today: "2026-09-01" } as never),
    Error,
  );
  assertThrows(
    () => leadDayFor({ startsOn: "pas-une-date", today: "2026-09-01", hourNow: 9 }),
    Error,
    "REQUIS",
  );
});

Deno.test("A1 — `planTimingOf`: la fenêtre a le dernier mot sur le motif", () => {
  // La veille est accordée: le motif reste celui de l'horloge.
  const kept = planTimingOf(
    { leadDay: "2026-09-01", reason: "before_cutoff_today" },
    { cookOnlyDay: "tue", startsOn: "2026-09-01", refused: null },
  );
  assertEquals(kept, {
    kind: "day_before",
    reason: "before_cutoff_today",
    lead_day: "2026-09-01",
  });
  // ⛔ La veille était POSSIBLE au calendrier et la FENÊTRE l'a refusée: c'est
  // le refus qui explique, sinon la phrase dirait « le plan commence dans deux
  // jours » sur un plan de sept jours mangés qui n'a pas eu sa veille.
  const refused = planTimingOf(
    { leadDay: "2026-09-09", reason: "day_before" },
    { cookOnlyDay: null, startsOn: "2026-09-10", refused: "no_room" },
  );
  assertEquals(refused, { kind: "same_morning", reason: "no_room", lead_day: null });
  // Pas de veille au calendrier, pas de refus de fenêtre: le motif de l'horloge.
  const morning = planTimingOf(
    { leadDay: null, reason: "after_cutoff" },
    { cookOnlyDay: null, startsOn: "2026-09-02", refused: null },
  );
  assertEquals(morning, { kind: "same_morning", reason: "after_cutoff", lead_day: null });
});

Deno.test("A1 — `eatenSpan` plie la veille, et JETTE sans `leadDays`", () => {
  assertEquals(MAX_LEAD_DAYS, 1);
  assertEquals(
    eatenSpan({ startsOn: "2026-09-06", durationDays: 8, leadDays: 1 }),
    { startsOn: "2026-09-07", durationDays: 7 },
  );
  assertEquals(
    eatenSpan({ startsOn: "2026-09-07", durationDays: 7, leadDays: 0 }),
    { startsOn: "2026-09-07", durationDays: 7 },
  );
  // ⛔ LE `select` OUBLIÉ. `leadDays` absent est le défaut que ce lot ferme:
  // il compterait la veille comme un jour mangé et refuserait le plan N+1.
  for (const bad of [undefined, null, 2, -1, 0.5, "1"]) {
    assertThrows(
      () => eatenSpan({ startsOn: "2026-09-06", durationDays: 8, leadDays: bad as never }),
      Error,
      "leadDays est REQUIS",
    );
  }
});

Deno.test("A1 — la veille du plan N+1 A LE DROIT d'être le dernier jour de N", () => {
  // ══════════════════════════════════════════════════════════════════════
  // LE CAS DE LA VIE RÉELLE: on dîne encore le plan de la semaine, et on fait
  // dimanche soir les courses de lundi. Physiquement juste, refusé par la base
  // avant ce lot — et refusé ICI, avant même le modèle.
  // ══════════════════════════════════════════════════════════════════════
  const planN = {
    id: "N",
    startsOn: "2026-09-01",
    durationDays: 7, // mangé: 01/09 → 07/09
    leadDays: 0,
  };
  // Plan N+1: veille le 07/09 (dernier jour mangé de N), mangé 08/09 → 14/09.
  const nextWindow = { startsOn: "2026-09-08", durationDays: 7 };
  assertEquals(
    firstBlockingPlan({ live: [planN], window: nextWindow, replacesId: null }),
    null,
  );
  // ⛔ ET LA GARDE MORD ENCORE quand le chevauchement porte sur un jour MANGÉ.
  // Une fenêtre qui commence AVANT N et se termine dedans est une TRONCATURE
  // légitime (D15); ce qui est refusé, c'est la fenêtre que N commence à ou
  // après — le refus ① de la RPC.
  const blocked = firstBlockingPlan({
    live: [planN],
    window: { startsOn: "2026-09-01", durationDays: 3 },
    replacesId: null,
  });
  assert(blocked !== null, "un jour MANGÉ partagé doit rester refusé");
  assertEquals(blocked.plan.id, "N");
  assertEquals(blocked.verdict, "starts_at_or_after");
  // ⛔ ET LE MÊME REFUS TIENT QUAND C'EST LA VEILLE DE N QUI DÉCALE SON DÉBUT:
  // N commence le 31/08 mais ne MANGE qu'à partir du 01/09, donc une fenêtre
  // qui démarre le 01/09 tombe sur son premier jour mangé — refusée.
  const leadShifted = { id: "N", startsOn: "2026-08-31", durationDays: 8, leadDays: 1 };
  const stillBlocked = firstBlockingPlan({
    live: [leadShifted],
    window: { startsOn: "2026-09-01", durationDays: 3 },
    replacesId: null,
  });
  assert(stillBlocked !== null, "le premier jour MANGÉ de N reste à N");
  assertEquals(stillBlocked.verdict, "starts_at_or_after");
  // Et le symétrique: un plan N qui porte DÉJÀ une veille ne bloque pas sur elle.
  assertEquals(
    firstBlockingPlan({
      live: [leadShifted],
      // La fenêtre mangée de `withLead` est 01/09 → 07/09; celle-ci commence
      // le 31/08, c'est-à-dire sur SA VEILLE, et rien ne s'y mange chez lui.
      window: { startsOn: "2026-08-31", durationDays: 1 },
      replacesId: null,
    }),
    null,
  );
});
