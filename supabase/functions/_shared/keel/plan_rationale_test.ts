import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  explainPlanChoices,
  type PlanRationaleFacts,
} from "./plan_rationale.ts";
import {
  cookingAskedToday,
  proposedWindowStart,
  rhythmClockFrom,
  SHOPPING_CUTOFF_HOUR,
  SLOT_PASSED_HOUR,
  slotsPassedToday,
} from "./plan_hours.ts";
import { localHourInZone, localMinuteInZone } from "./local_date.ts";
import { addedCookDays, buildMealPrompt } from "./meal_generation.ts";

// ---------------------------------------------------------------------------
// LE CAS NOMINAL — celui qui PASSE
// ---------------------------------------------------------------------------
//
// ⚠️ Cicatrice du dépôt: « une garde a besoin d'un cas qui passe, sinon elle
// bloque tout en ressemblant à une garde qui marche ». Ce jeu de faits est
// celui d'un plan ORDINAIRE, et il doit produire du texte.

function nominalFacts(): PlanRationaleFacts {
  return {
    declaredCookDays: ["sun", "wed"],
    addedCookDays: [],
    window: { startsOn: "2026-08-13", durationDays: 5 },
    requestedWindow: null,
    today: { localDate: "2026-08-13", dayToken: "thu" },
    localMinuteOfDay: 9 * 60,
    slotsDroppedToday: [],
    awayInWindow: [],
    budgetAmount: null,
    mouthsServed: null,
    handTakenBy: [],
    mergedIn: [],
  };
}

Deno.test("un plan ORDINAIRE produit quand même une phrase — c'est la demande", () => {
  const out = explainPlanChoices({ facts: nominalFacts(), locale: "fr" });
  assertEquals(out.refusal, null);
  assert(out.lines.length > 0, "rien à dire sur un plan qui va bien = lot débranché");
  assert(
    out.lines[0].includes("aujourd'hui"),
    `la fenêtre du jour doit se dire: ${JSON.stringify(out.lines)}`,
  );
});

Deno.test("idempotence — deux appels identiques rendent la même chose", () => {
  const a = explainPlanChoices({ facts: nominalFacts(), locale: "fr" });
  const b = explainPlanChoices({ facts: nominalFacts(), locale: "fr" });
  assertEquals(a, b);
});

Deno.test("les deux langues sortent, et ne se recopient pas", () => {
  const fr = explainPlanChoices({ facts: nominalFacts(), locale: "fr" });
  const en = explainPlanChoices({ facts: nominalFacts(), locale: "en" });
  assert(fr.lines.length > 0 && en.lines.length > 0);
  assertEquals(fr.lines.length, en.lines.length);
  assert(fr.lines[0] !== en.lines[0], "le français ne doit pas être l'anglais");
});

// ---------------------------------------------------------------------------
// LE CAS QUI A DÉCLENCHÉ CE LOT
// ---------------------------------------------------------------------------

Deno.test("le jour de cuisine AJOUTÉ se dit, avec sa raison et sans reproche", () => {
  // Le run réel: déclarés `sun, wed`, plan généré un JEUDI, sessions
  // `thu, sun, wed`. Le jeudi était voulu; personne ne l'a dit.
  const out = explainPlanChoices({
    facts: { ...nominalFacts(), addedCookDays: ["thu"] },
    locale: "fr",
  });
  assertEquals(out.refusal, null);
  const said = out.lines.join(" ");
  assert(said.includes("jeudi"), "le jour ajouté doit être nommé");
  assert(said.includes("dimanche") && said.includes("mercredi"), "les jours déclarés aussi");
  assert(
    said.includes("pas demandé"),
    "il faut DIRE que c'est un jour non demandé, sinon la session ressemble à un bug",
  );
});

Deno.test("sans jour AJOUTÉ, aucune phrase d'ajout — une prémisse, une phrase", () => {
  const out = explainPlanChoices({ facts: nominalFacts(), locale: "fr" });
  assert(
    !out.lines.join(" ").includes("pas demandé"),
    "`addedCookDays: []` ne produit RIEN, pas « aucun jour ajouté »",
  );
});

Deno.test("aucun jour déclaré ET un ajout: la phrase ne cite pas de jours déclarés", () => {
  const out = explainPlanChoices({
    facts: { ...nominalFacts(), declaredCookDays: [], addedCookDays: ["thu"] },
    locale: "en",
  });
  const said = out.lines.join(" ");
  assert(said.includes("Thursday"));
  assert(said.includes("did not ask for"));
  assert(!said.includes("You cook on"), "il n'a rien déclaré: ne pas l'inventer");
});

// ---------------------------------------------------------------------------
// LES CRÉNEAUX TOMBÉS PAR L'HEURE — et ce n'est PAS une absence
// ---------------------------------------------------------------------------

Deno.test("un créneau tombé par l'heure ne s'attribue pas à l'élève", () => {
  const out = explainPlanChoices({
    facts: {
      ...nominalFacts(),
      localMinuteOfDay: 20 * 60,
      slotsDroppedToday: ["breakfast", "lunch"],
    },
    locale: "fr",
  });
  const said = out.lines.join(" ");
  assert(said.includes("petit-déjeuner") && said.includes("déjeuner"));
  assert(said.includes("déjà entamée"));
  assert(
    !said.includes("hors de la maison"),
    "une heure passée n'est pas une absence déclarée",
  );
});

Deno.test("un seul créneau tombé prend la forme au singulier", () => {
  const out = explainPlanChoices({
    facts: { ...nominalFacts(), slotsDroppedToday: ["dinner"] },
    locale: "en",
  });
  assert(out.lines.some((l) => l.includes("dinner is off the plan")));
});

// ---------------------------------------------------------------------------
// LE RESTE DES FAITS
// ---------------------------------------------------------------------------

Deno.test("la fenêtre RACCOURCIE se dit, et seulement si on sait qu'elle l'a été", () => {
  const muet = explainPlanChoices({ facts: nominalFacts(), locale: "fr" });
  assert(!muet.lines.join(" ").includes("demandé 7"));

  const dit = explainPlanChoices({
    facts: {
      ...nominalFacts(),
      requestedWindow: { startsOn: "2026-08-13", durationDays: 7 },
    },
    locale: "fr",
  });
  assert(dit.lines.some((l) => l.includes("7") && l.includes("5")));
});

Deno.test("une fenêtre qui ne démarre pas aujourd'hui porte SON jour et SA date", () => {
  const out = explainPlanChoices({
    facts: { ...nominalFacts(), window: { startsOn: "2026-08-17", durationDays: 3 } },
    locale: "fr",
  });
  // 2026-08-17 est un lundi.
  assert(out.lines[0].includes("lundi"), out.lines[0]);
  assert(out.lines[0].includes("2026-08-17"), "la date brute lève l'ambiguïté à +2 semaines");
});

Deno.test("le budget se dit AVEC ce qui a cédé, dans l'ordre", () => {
  const out = explainPlanChoices({
    facts: { ...nominalFacts(), budgetAmount: 90 },
    locale: "fr",
  });
  const said = out.lines.join(" ");
  assert(said.includes("90"));
  const proteines = said.indexOf("protéines");
  const saison = said.indexOf("hors saison");
  const variete = said.indexOf("variété");
  assert(proteines > 0 && proteines < saison && saison < variete, said);
  assert(said.includes("jamais les portions"));
});

Deno.test("`budgetAmount: null` ne produit AUCUNE ligne de budget", () => {
  const out = explainPlanChoices({ facts: nominalFacts(), locale: "fr" });
  assert(!out.lines.join(" ").includes("budget"));
});

Deno.test("`mouthsServed: 1` ne dit rien — `null` et `1` diffèrent, et aucun ne se dit", () => {
  for (const mouths of [null, 1]) {
    const out = explainPlanChoices({
      facts: { ...nominalFacts(), mouthsServed: mouths },
      locale: "fr",
    });
    assert(!out.lines.join(" ").includes("bouches"), `mouthsServed=${mouths}`);
  }
  const four = explainPlanChoices({
    facts: { ...nominalFacts(), mouthsServed: 4 },
    locale: "fr",
  });
  assert(four.lines.some((l) => l.includes("4") && l.includes("bouches")));
});

Deno.test("les absences se COMPTENT, elles ne se réénumèrent pas", () => {
  const out = explainPlanChoices({
    facts: {
      ...nominalFacts(),
      awayInWindow: [
        { day: "thu", slot: "lunch" },
        { day: "fri", slot: "lunch" },
        { day: "sat", slot: "dinner" },
      ],
    },
    locale: "fr",
  });
  const away = out.lines.find((l) => l.includes("hors de la maison"));
  assert(away && away.includes("3"), String(away));
  assert(!away.includes("jeudi"), "la grille dit déjà quels jours; ne pas l'écrire deux fois");
});

Deno.test("la main prise et la fusion se disent, au bon nombre", () => {
  const un = explainPlanChoices({
    facts: { ...nominalFacts(), handTakenBy: ["Zoé"], mergedIn: ["Tom"] },
    locale: "fr",
  });
  assert(un.lines.some((l) => l.includes("Zoé") && l.includes("compose de son côté")));
  assert(un.lines.some((l) => l.includes("Tom") && l.includes("cuisine aussi")));

  const deux = explainPlanChoices({
    facts: { ...nominalFacts(), handTakenBy: ["Zoé", "Marc"] },
    locale: "fr",
  });
  assert(deux.lines.some((l) => l.includes("composent de leur côté")));
});

// ---------------------------------------------------------------------------
// LES PORTES
// ---------------------------------------------------------------------------

Deno.test("un champ MANQUANT jette — `undefined` ne dit rien", () => {
  const amputé = { ...nominalFacts() } as Record<string, unknown>;
  delete amputé.mouthsServed;
  const err = assertThrows(
    () =>
      explainPlanChoices({
        facts: amputé as unknown as PlanRationaleFacts,
        locale: "fr",
      }),
    Error,
  );
  assert(String(err.message).includes("mouthsServed"), err.message);
});

Deno.test("`null` explicite NE jette PAS — c'est une valeur, pas un oubli", () => {
  const out = explainPlanChoices({
    facts: { ...nominalFacts(), budgetAmount: null, requestedWindow: null, mouthsServed: null },
    locale: "fr",
  });
  assertEquals(out.refusal, null);
});

Deno.test("une locale inconnue jette", () => {
  assertThrows(
    () =>
      explainPlanChoices({
        facts: nominalFacts(),
        locale: "de" as unknown as "fr",
      }),
    Error,
    "locale inconnue",
  );
});

Deno.test("une fenêtre illisible rend `nothing_to_explain`, jamais un silence anonyme", () => {
  const out = explainPlanChoices({
    facts: {
      ...nominalFacts(),
      declaredCookDays: [],
      window: { startsOn: "", durationDays: 0 },
    },
    locale: "fr",
  });
  assertEquals(out.lines, []);
  assertEquals(out.refusal, "nothing_to_explain");
});

Deno.test("AUCUN gabarit ne culpabilise — la porte 4 ne doit jamais mordre", () => {
  // Tous les faits allumés en même temps: le pire assemblage possible.
  const tout: PlanRationaleFacts = {
    declaredCookDays: ["sun", "wed"],
    addedCookDays: ["thu"],
    window: { startsOn: "2026-08-13", durationDays: 4 },
    requestedWindow: { startsOn: "2026-08-13", durationDays: 7 },
    today: { localDate: "2026-08-13", dayToken: "thu" },
    localMinuteOfDay: 20 * 60 + 30,
    slotsDroppedToday: ["breakfast", "lunch"],
    awayInWindow: [{ day: "fri", slot: "lunch" }],
    budgetAmount: 120,
    mouthsServed: 4,
    handTakenBy: ["Zoé"],
    mergedIn: ["Tom"],
  };
  for (const locale of ["fr", "en"] as const) {
    const out = explainPlanChoices({ facts: tout, locale });
    assertEquals(out.refusal, null, `${locale}: ${JSON.stringify(out)}`);
    assert(out.lines.length >= 8, `${locale}: ${out.lines.length} lignes`);
  }
});

// ---------------------------------------------------------------------------
// LES TROIS RÈGLES D'HEURE
// ---------------------------------------------------------------------------

Deno.test("la fenêtre PROPOSÉE démarre demain passé la coupure courses", () => {
  const matin = proposedWindowStart({ todayLocalDate: "2026-08-13", hourNow: 9 });
  assertEquals(matin, { startsOn: "2026-08-13", shifted: null });

  const soir = proposedWindowStart({ todayLocalDate: "2026-08-13", hourNow: 20 });
  assertEquals(soir, { startsOn: "2026-08-14", shifted: "shopping_cutoff" });

  // La coupure elle-même mord (>=), et elle se lit dans la constante.
  const pile = proposedWindowStart({
    todayLocalDate: "2026-08-13",
    hourNow: SHOPPING_CUTOFF_HOUR,
  });
  assertEquals(pile.shifted, "shopping_cutoff");
});

Deno.test("`hourNow: null` ne déplace RIEN — le produit d'hier, jamais un raccourci deviné", () => {
  assertEquals(
    proposedWindowStart({ todayLocalDate: "2026-08-13", hourNow: null }),
    { startsOn: "2026-08-13", shifted: null },
  );
  assertEquals(
    slotsPassedToday({ hourNow: null, rhythm: [{ slot: "breakfast" }], declaredHours: [] }),
    [],
  );
  assertEquals(cookingAskedToday({ hourNow: null }), true);
});

Deno.test("`hourNow` manquant JETTE — un paramètre de garde optionnel est une garde désarmée", () => {
  for (const call of [
    () =>
      proposedWindowStart(
        { todayLocalDate: "2026-08-13" } as unknown as {
          todayLocalDate: string;
          hourNow: number | null;
        },
      ),
    () =>
      slotsPassedToday(
        { rhythm: [], declaredHours: [] } as unknown as {
          hourNow: number | null;
          rhythm: [];
          declaredHours: [];
        },
      ),
    () => cookingAskedToday({} as unknown as { hourNow: number | null }),
  ]) {
    const err = assertThrows(call, Error);
    assert(String(err.message).includes("hourNow"), err.message);
  }
});

Deno.test("les créneaux passés du jour tombent, et eux seuls", () => {
  const rhythm = [{ slot: "breakfast" }, { slot: "lunch" }, { slot: "dinner" }] as const;
  assertEquals(slotsPassedToday({ hourNow: 8, rhythm, declaredHours: [] }), []);
  assertEquals(slotsPassedToday({ hourNow: 11, rhythm, declaredHours: [] }), ["breakfast"]);
  assertEquals(slotsPassedToday({ hourNow: 20, rhythm, declaredHours: [] }), [
    "breakfast",
    "lunch",
  ]);
  assertEquals(slotsPassedToday({ hourNow: 22, rhythm, declaredHours: [] }), [
    "breakfast",
    "lunch",
    "dinner",
  ]);
});

Deno.test("un moment HORS du rythme déclaré ne tombe pas — il n'existait pas", () => {
  assertEquals(
    slotsPassedToday({ hourNow: 23, rhythm: [{ slot: "dinner" }], declaredHours: [] }),
    ["dinner"],
  );
});

Deno.test("les moments sans heure de référence ne tombent JAMAIS par l'horloge", () => {
  assertEquals(SLOT_PASSED_HOUR.snack_am, null);
  assertEquals(SLOT_PASSED_HOUR.snack_pm, null);
  assertEquals(SLOT_PASSED_HOUR.before_bed, null);
  assertEquals(
    slotsPassedToday({
      hourNow: 23,
      rhythm: [{ slot: "snack_pm" }, { slot: "before_bed" }],
      declaredHours: [],
    }),
    [],
  );
});

Deno.test("l'heure DÉCLARÉE l'emporte sur le repli", () => {
  const rhythm = [{ slot: "dinner" }] as const;
  // Quelqu'un qui dîne à 22 h n'a pas dîné à 21 h 30.
  assertEquals(
    slotsPassedToday({
      hourNow: 21,
      rhythm,
      declaredHours: [{ slot: "dinner", hour: 22 }],
    }),
    [],
  );
  assertEquals(
    slotsPassedToday({
      hourNow: 22,
      rhythm,
      declaredHours: [{ slot: "dinner", hour: 22 }],
    }),
    ["dinner"],
  );
});

Deno.test("`rhythmClockFrom` lit `at`, et n'invente rien d'un `at` illisible", () => {
  assertEquals(
    rhythmClockFrom([
      { slot: "breakfast", at: "07:30" },
      { slot: "lunch", at: "midi" },
      { slot: "dinner" },
      { slot: "inconnu", at: "20:00" },
    ]),
    [
      { slot: "breakfast", hour: 7 },
      { slot: "lunch", hour: null },
      { slot: "dinner", hour: null },
    ],
  );
  assertEquals(rhythmClockFrom(null), []);
  assertEquals(rhythmClockFrom("breakfast"), []);
});

Deno.test("la cuisine du jour ne se demande plus passé la coupure courses", () => {
  assertEquals(cookingAskedToday({ hourNow: 9 }), true);
  assertEquals(cookingAskedToday({ hourNow: SHOPPING_CUTOFF_HOUR - 1 }), true);
  assertEquals(cookingAskedToday({ hourNow: SHOPPING_CUTOFF_HOUR }), false);
  assertEquals(cookingAskedToday({ hourNow: 23 }), false);
});

// ---------------------------------------------------------------------------
// L'HORLOGE LOCALE
// ---------------------------------------------------------------------------

Deno.test("`localMinuteInZone` lit l'heure du fuseau, pas celle du serveur", () => {
  const at = new Date("2026-08-13T18:30:00Z");
  assertEquals(localMinuteInZone("UTC", at), 18 * 60 + 30);
  assertEquals(localMinuteInZone("Europe/Paris", at), 20 * 60 + 30); // UTC+2 en août
  // UTC+5:30 => minuit tout juste passé, donc 0 et surtout PAS 1440.
  assertEquals(localMinuteInZone("Asia/Kolkata", at), 0);
});

Deno.test("`localHourInZone` DÉRIVE de la minute — une seule horloge", () => {
  const at = new Date("2026-08-13T18:30:00Z");
  assertEquals(localHourInZone("Europe/Paris", at), 20);
  assertEquals(
    localHourInZone("Europe/Paris", at),
    Math.floor(localMinuteInZone("Europe/Paris", at) / 60),
  );
});

Deno.test("un fuseau vide ou inconnu JETTE — jamais de repli sur UTC", () => {
  const at = new Date("2026-08-13T18:30:00Z");
  assertThrows(() => localMinuteInZone("", at), Error, "empty timezone");
  assertThrows(() => localMinuteInZone("Mars/Olympus", at), Error, "unknown timezone");
  assertThrows(() => localHourInZone("   ", at), Error);
});

// ---------------------------------------------------------------------------
// LA CONSIGNE — ce qui change, et ce qui NE DOIT PAS changer
// ---------------------------------------------------------------------------
//
// ⚠️ « Une règle de prompt régresse en réel »: ces tests ne remplacent pas un
// run. Ils tiennent la seule chose qu'un test pur PEUT tenir — que la consigne
// est BYTE-IDENTIQUE à celle d'hier tant que l'heure ne mord pas, et qu'elle
// nomme un autre jour quand elle mord.

const PROMPT_ARGS = {
  firstDayCookable: true,
  contentLocale: "en-US",
  budgetAmount: null,
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
  body: null,
  focusAxis: null,
  // LE CAS FONDATEUR: déclaré `sun, wed`, fenêtre jeudi→dimanche.
  cookDays: ["sun", "wed"],
  daysToFill: ["thu", "fri", "sat", "sun"],
  todayToken: "thu",
  today: "2026-08-13",
};

Deno.test("PROMPT — sans changement d'heure, la consigne est byte-identique", () => {
  // `firstDayCookable: true` est ce que rendait le code d'hier pour TOUT LE
  // MONDE. Cette égalité est la garantie que le lot est additif.
  const a = buildMealPrompt({ ...PROMPT_ARGS }).userMessage;
  const b = buildMealPrompt({ ...PROMPT_ARGS, firstDayCookable: true }).userMessage;
  assertEquals(a, b);
  // Et la phrase historique, mot pour mot, avec le PREMIER jour de la fenêtre.
  // `wed` n'est pas dans la fenêtre: la consigne ne cite que les jours
  // UTILISABLES — c'est le comportement d'hier, et il ne bouge pas.
  assert(
    a.includes(
      "they usually cook on sun -- all of which fall after thu, so " +
        "nothing cooked then can feed the days before it. Cook on thu as " +
        "well, and say so: it is a day they did not ask for. " +
        "Everything before their usual day is cooked fresh, not from a batch.",
    ),
    a.slice(a.indexOf("they usually cook"), a.indexOf("they usually cook") + 300),
  );
});

Deno.test("PROMPT — passé la coupure courses, la session vise le jour SUIVANT", () => {
  const tard = buildMealPrompt({ ...PROMPT_ARGS, firstDayCookable: false }).userMessage;
  assert(
    tard.includes("Cook on fri as well"),
    "à 21 h, « cuisine aujourd'hui » demande des courses dans un magasin fermé",
  );
  assert(!tard.includes("Cook on thu as well"));
});

Deno.test("PROMPT — l'explication nomme EXACTEMENT le jour que la consigne demande", () => {
  for (const cookable of [true, false]) {
    const message = buildMealPrompt({ ...PROMPT_ARGS, firstDayCookable: cookable })
      .userMessage;
    const added = addedCookDays({
      declared: PROMPT_ARGS.cookDays,
      window: PROMPT_ARGS.daysToFill,
      firstDayCookable: cookable,
    });
    assertEquals(added.length, 1);
    assert(
      message.includes(`Cook on ${added[0]} as well`),
      `firstDayCookable=${cookable}: la consigne et l'explication doivent nommer le même jour`,
    );
  }
});

Deno.test("`addedCookDays` — le cas nominal ne produit AUCUN ajout", () => {
  assertEquals(
    addedCookDays({
      declared: ["thu", "sun"],
      window: ["thu", "fri", "sat", "sun"],
      firstDayCookable: true,
    }),
    [],
  );
  // Aucun jour déclaré: rien à ajouter, la consigne ordinaire est vraie.
  assertEquals(
    addedCookDays({ declared: [], window: ["thu", "fri"], firstDayCookable: true }),
    [],
  );
  // Aucun jour déclaré DANS la fenêtre: c'est l'autre branche de la consigne.
  assertEquals(
    addedCookDays({ declared: ["mon"], window: ["thu", "fri"], firstDayCookable: true }),
    [],
  );
});

Deno.test("`addedCookDays` — plus de jour suivant ⇒ plus rien à ajouter", () => {
  // Fenêtre d'un seul jour, et il est déjà trop tard pour lui.
  assertEquals(
    addedCookDays({ declared: ["sun"], window: ["sun"], firstDayCookable: false }),
    [],
  );
});

Deno.test("`addedCookDays` — `firstDayCookable` manquant JETTE", () => {
  const err = assertThrows(
    () =>
      addedCookDays(
        { declared: ["sun"], window: ["thu", "sun"] } as unknown as {
          declared: string[];
          window: string[];
          firstDayCookable: boolean;
        },
      ),
    Error,
  );
  assert(String(err.message).includes("firstDayCookable"), err.message);
});
