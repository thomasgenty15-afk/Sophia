import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@1";
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
import {
  addedCookDays,
  buildMealPrompt,
  usableCookDays,
} from "./meal_generation.ts";

// ---------------------------------------------------------------------------
// LE CAS NOMINAL — celui qui PASSE
// ---------------------------------------------------------------------------
//
// ⚠️ Cicatrice du dépôt: « une garde a besoin d'un cas qui passe, sinon elle
// bloque tout en ressemblant à une garde qui marche ». Ce jeu de faits est
// celui d'un plan ORDINAIRE, et il doit produire du texte.

function nominalFacts(): PlanRationaleFacts {
  return {
    // ⛔ `null` = « il n'y a pas de verdict d'énergie ». Le cas nominal est
    // celui d'un plan ORDINAIRE, et un plan ordinaire ne se déclare pas léger.
    energyBelowBand: null,
    declaredCookDays: ["sun", "wed"],
    // Le cas nominal est un plan qui ATTEINT les deux jours cochés — sans quoi
    // la phrase de garde serait celle d'un écart, et « le cas qui passe » ne
    // passerait plus.
    usableCookDays: ["sun", "wed"],
    addedCookDays: [],
    window: { startsOn: "2026-08-13", durationDays: 5 },
    requestedWindow: null,
    today: { localDate: "2026-08-13", dayToken: "thu" },
    localMinuteOfDay: 9 * 60,
    slotsDroppedToday: [],
    awayInWindow: [],
    // ⛔ `[]` = « le plan est complet », et c'est le cas nominal. Un trou dans
    // le jeu de faits qui doit PASSER ferait de la phrase d'écart la phrase
    // ordinaire, et on ne saurait plus laquelle on lit.
    emptySlots: [],
    // ⛔ `[]` DEUX FOIS, ET CE SONT DEUX AFFIRMATIONS. Le cas nominal est un
    // plan qu'on peut exécuter: tout y est à portée d'un lot, et la session
    // tient dans le temps demandé. Y poser une tension ferait de la phrase
    // d'écart la phrase ordinaire, et on ne saurait plus laquelle on lit.
    daysOutOfBatchReach: [],
    // La case « tout dans une session » n'est PAS cochée au cas nominal:
    // `null` fait taire la ligne, et l'explication d'un plan ordinaire ne bouge
    // pas d'un caractère.
    oneCookingSession: null,
    // Ni la veille: le cas nominal est un plan qui commence quand il commence.
    cookDayBefore: null,
    // Cas nominal: une seule course, et rien qui ne puisse l'attendre.
    shoppingDays: [],
    shopLaterDays: [],
    sessionOverruns: [],
    budgetAmount: null,
    mouthsServed: null,
    handTakenBy: [],
    mergedIn: [],
    // G5 — `null` = « on n'a pas lu le temps de cuisine ». Le cas nominal est
    // celui d'un plan ORDINAIRE, et un plan ordinaire ne parle pas de forme de
    // cuisson: la phrase du seuil a trois prémisses, et celle-ci n'en arme
    // aucune.
    weeklyCookingMinutes: null,
    // R4 — `null` = personne n'a déclaré de régime. Le cas nominal est celui
    // d'un plan ORDINAIRE, et un plan ordinaire n'explique pas une décision qui
    // n'a pas été prise.
    sharedDishRegime: null,
    // LOT B — `null` = aucun mode de cuisson n'a été demandé. C'est le chemin de
    // TOUTE requête écrite avant ce lot, et de toute composition qui ne porte
    // pas le champ: la sortie doit y rester byte-identique.
    cookingShapeChoice: null,
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
    // ⛔ ALLUMÉ ICI EXPRÈS: c'est la phrase la plus exposée du lot — elle parle
    // de ce que le corps demande — et la porte anti-culpabilisation DOIT la
    // relire. Si un jour elle se met à sonner, c'est ce test qui le dira.
    energyBelowBand: true,
    declaredCookDays: ["sun", "wed"],
    // UN ÉCART, ici aussi: `wed` est hors de cette fenêtre-là. La porte 4 doit
    // relire les gabarits d'écart comme les autres — ce sont eux qui risquent
    // le plus de tourner au reproche.
    usableCookDays: ["sun"],
    addedCookDays: ["thu"],
    window: { startsOn: "2026-08-13", durationDays: 4 },
    requestedWindow: { startsOn: "2026-08-13", durationDays: 7 },
    today: { localDate: "2026-08-13", dayToken: "thu" },
    localMinuteOfDay: 20 * 60 + 30,
    slotsDroppedToday: ["breakfast", "lunch"],
    awayInWindow: [{ day: "fri", slot: "lunch" }],
    // ALLUMÉ AUSSI: la phrase des trous doit passer la porte 4 comme les
    // autres. Deux jours qui manquent LES MÊMES moments ⇒ la forme groupée.
    emptySlots: [
      { day: "sat", slot: "lunch" },
      { day: "sat", slot: "dinner" },
      { day: "sun", slot: "lunch" },
      { day: "sun", slot: "dinner" },
    ],
    // ALLUMÉS AUSSI: la porte 4 doit relire ces deux phrases-là comme les
    // autres. Ce sont celles qui risquent le plus de tourner au reproche —
    // l'une parle de ce que la personne n'a pas pu faire, l'autre de ce qu'elle
    // avait demandé et qui ne tiendra pas.
    daysOutOfBatchReach: ["sat", "sun"],
    // ALLUMÉE AUSSI: « tout est cuisiné dimanche » décrit un plan dont la
    // personne a demandé la forme. C'est une phrase de rang 3, donc celle qui
    // risque le MOINS de culpabiliser — raison de plus pour que la porte 4 la
    // relise, puisque personne ne pensera à la vérifier.
    //
    // ⚠️ LA FORME REFUSÉE EST UN AUTRE GABARIT, et elle ne peut pas sortir en
    // même temps (les deux issues s'excluent). Elle a son propre passage plus
    // bas.
    oneCookingSession: { day: "sun", refusedNoFreezer: false },
    // ALLUMÉE AUSSI: « le plan commence dimanche, un jour plus tôt » est un
    // fait de calendrier, donc parmi les phrases les plus faciles à tourner en
    // reproche si on la réécrit un jour. La porte 4 doit la relire.
    cookDayBefore: { day: "sun", refused: null, reason: "day_before" },
    // ALLUMÉS AUSSI: deux courses, et un jour dont le frais ne peut pas venir
    // de la première. Les deux phrases doivent passer la porte 4.
    shoppingDays: ["sun", "wed"],
    shopLaterDays: ["wed"],
    sessionOverruns: [{ day: "wed", minutes: 75, declared: 30 }],
    budgetAmount: 120,
    mouthsServed: 4,
    handTakenBy: ["Zoé"],
    mergedIn: ["Tom"],
    // 60 min < 90: le seuil mord, et la phrase de forme entre dans le lot que
    // la porte anti-culpabilisation doit relire.
    weeklyCookingMinutes: 60,
    // R4 — DEUX PORTEURS, pour que le PLURIEL de la phrase entre lui aussi dans
    // le lot que la porte anti-culpabilisation relit. « c'est ce que X et Y
    // mangent » est un gabarit distinct de son singulier, et une porte qui
    // n'aurait vu que l'un des deux ne l'aurait vérifié qu'à moitié.
    sharedDishRegime: { regime: "vegan", heldBy: ["Christèle", "Léa"] },
    // LOT B — LE PLAFOND QUI MORD, AU PLURIEL. Ce gabarit-ci est celui qui dit
    // à quelqu'un que sa part ne sort pas du plat commun: s'il existe un
    // gabarit de ce module capable de culpabiliser, c'est celui-là. Il DOIT
    // donc entrer dans le lot que la porte 4 relit, et dans ses DEUX formes —
    // le singulier est un gabarit distinct, et une porte qui n'aurait vu que
    // l'un des deux ne l'aurait vérifié qu'à moitié (le singulier est couvert
    // par le test dédié plus bas).
    cookingShapeChoice: {
      capped: true,
      unused: false,
      outsideSharedPot: ["Zoé", "Tom"],
    },
  };
  for (const locale of ["fr", "en"] as const) {
    const out = explainPlanChoices({ facts: tout, locale });
    assertEquals(out.refusal, null, `${locale}: ${JSON.stringify(out)}`);
    assert(out.lines.length >= 9, `${locale}: ${out.lines.length} lignes`);
  }
});

// ---------------------------------------------------------------------------
// LOT B — LE MODE DE CUISSON DEMANDÉ, ET CE QU'IL A DONNÉ
//
// ⛔ LA RAISON D'ÊTRE DE CE BLOC: un choix silencieusement ignoré est PIRE que
// pas de choix. Chacune des trois sorties possibles (rien à dire / le plafond a
// mordu / le choix n'a rien eu à retenir) est épinglée ici, parce que c'est la
// seule chose qui empêche le lot de se débrancher sans que rien n'échoue.
// ---------------------------------------------------------------------------

/** Un foyer de trois bouches, sinon la phrase n'a pas de sujet. */
function tableFacts(): PlanRationaleFacts {
  return { ...nominalFacts(), mouthsServed: 3 };
}

Deno.test("LOT B — aucun mode demandé ⇒ AUCUNE phrase de forme", () => {
  // Le chemin de toute requête écrite avant ce lot. Sa sortie doit être
  // byte-identique: une phrase qui apparaîtrait ici serait un lot qui parle
  // pour des gens à qui on n'a rien demandé.
  for (const locale of ["fr", "en"] as const) {
    const out = explainPlanChoices({ facts: tableFacts(), locale });
    const joined = out.lines.join(" ");
    assert(!joined.includes("un seul plat"), joined);
    assert(!joined.includes("one dish for everyone"), joined);
    assert(!joined.includes("plats séparés"), joined);
    assert(!joined.includes("separate dishes"), joined);
  }
});

Deno.test("LOT B — le plafond a mordu: la phrase sort, et elle NOMME", () => {
  const out = explainPlanChoices({
    facts: {
      ...tableFacts(),
      cookingShapeChoice: {
        capped: true,
        unused: false,
        outsideSharedPot: ["Zoé"],
      },
    },
    locale: "fr",
  });
  assertEquals(out.refusal, null);
  const joined = out.lines.join(" ");
  assert(joined.includes("un seul plat pour tout le monde"), joined);
  assert(joined.includes("Zoé"), joined);
  // ⛔ ET ELLE NE DIT PAS POURQUOI. Nommer la raison dirait l'objectif de
  // quelqu'un à toute la table, et ce module n'a jamais ce droit.
  for (const interdit of ["objectif", "goal", "kcal", "calorie", "poids"]) {
    assert(!joined.toLowerCase().includes(interdit), `${interdit} dans: ${joined}`);
  }
});

Deno.test("LOT B — le choix n'a rien eu à retenir: on le dit, sans nommer personne", () => {
  const out = explainPlanChoices({
    facts: {
      ...tableFacts(),
      // Personne ne diverge: la liste est vide, et c'est cohérent — il n'y a
      // personne à nommer.
      cookingShapeChoice: { capped: false, unused: true, outsideSharedPot: [] },
    },
    locale: "fr",
  });
  const joined = out.lines.join(" ");
  assert(joined.includes("plats séparés"), joined);
  assert(joined.includes("qu'une cuisson"), joined);
});

Deno.test("LOT B — le choix a été tenu à la lettre ⇒ RIEN. Une prémisse, une phrase", () => {
  // ⚠️ LE CAS LE PLUS FRÉQUENT, et celui qu'on oublie de tester. Une phrase
  // « ton choix a été respecté » à chaque plan apprend à ne plus lire les
  // autres.
  const out = explainPlanChoices({
    facts: {
      ...tableFacts(),
      cookingShapeChoice: { capped: false, unused: false, outsideSharedPot: [] },
    },
    locale: "fr",
  });
  const joined = out.lines.join(" ");
  assert(!joined.includes("un seul plat"), joined);
  assert(!joined.includes("plats séparés"), joined);
});

Deno.test("LOT B — une seule bouche ⇒ AUCUNE phrase de forme, même si on a demandé", () => {
  // ⛔ LA PRÉMISSE ENGLOBANTE. « Un seul plat pour tout le monde » n'a pas de
  // sujet quand on mange seul: c'est une évidence servie comme une contrainte.
  const out = explainPlanChoices({
    facts: {
      ...nominalFacts(),
      mouthsServed: 1,
      cookingShapeChoice: {
        capped: true,
        unused: false,
        outsideSharedPot: ["Zoé"],
      },
    },
    locale: "fr",
  });
  const joined = out.lines.join(" ");
  assert(!joined.includes("Zoé"), joined);
});

Deno.test("LOT B — plafond mordu mais AUCUN nom résolu ⇒ silence, jamais « la part de »", () => {
  // La direction d'erreur de tout ce module: moins précis, jamais faux. Une
  // phrase « La part de  ne sort pas du plat commun » est pire qu'un silence.
  const out = explainPlanChoices({
    facts: {
      ...tableFacts(),
      cookingShapeChoice: {
        capped: true,
        unused: false,
        outsideSharedPot: ["", "   "],
      },
    },
    locale: "fr",
  });
  const joined = out.lines.join(" ");
  assert(!joined.includes("La part de"), joined);
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
  hasFreezer: false,
  oneCookingSession: false,
  cookOnlyDay: null,
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

// ===========================================================================
// LE PLAN PLUS LÉGER QUE LE CORPS — la ligne, et les trois silences
//
// ⛔ Décision produit de l'utilisateur, 2026-08-23: « on livre, et on le dit ».
// Mesuré la veille: le verdict rendait `below` sur SEPT plans sur sept, la
// boucle de correction levait `raise_energy` sept fois, et rien de cet écart
// n'atteignait la personne.
// ===========================================================================

Deno.test("`below` DIT que le plan est plus léger, dans les deux langues", () => {
  for (const locale of ["fr", "en"] as const) {
    const out = explainPlanChoices({
      facts: { ...nominalFacts(), energyBelowBand: true },
      locale,
    });
    assertEquals(out.refusal, null);
    const ligne = out.lines.find((l) =>
      l.includes("plus léger") || l.includes("lighter")
    );
    assert(ligne !== undefined, `aucune ligne de légèreté en ${locale}`);
    // ⛔ AUCUN CHIFFRE. « pas de kcal, pas de grammes, pas de fourchette » vaut
    // ici comme partout: un nombre affiché à un élève devient un objectif.
    assert(
      !/\d/.test(ligne),
      `la ligne porte un chiffre en ${locale}: ${ligne}`,
    );
  }
});

Deno.test("⚠️ LES TROIS SILENCES — `false`, `null`, et tout ce qui n'est pas `below`", () => {
  // ⛔ SANS EUX, LA LIGNE SERAIT UNE CONSTANTE DÉGUISÉE EN MESURE.
  //
  // `false` = mesuré et dans la bande. `null` = pas mesurable (plancher TCA,
  // corps inconnu, plan illisible). Les deux se taisent, et pour des raisons
  // opposées — mais aucune des deux ne doit produire de phrase.
  for (const valeur of [false, null] as const) {
    const out = explainPlanChoices({
      facts: { ...nominalFacts(), energyBelowBand: valeur },
      locale: "fr",
    });
    assertEquals(
      out.lines.filter((l) => l.includes("plus léger")),
      [],
      `un plan à energyBelowBand=${JSON.stringify(valeur)} s'est déclaré léger`,
    );
  }
});

Deno.test("⛔ LE FAIT EST REQUIS — un `undefined` JETTE, il ne se tait pas", () => {
  // `null` est une valeur, `undefined` est un oubli. Un appelant qui ne calcule
  // pas ce verdict doit le DIRE (la lane foyer passe `null`), pas l'omettre.
  const sansLeFait = { ...nominalFacts() } as Record<string, unknown>;
  delete sansLeFait.energyBelowBand;
  assertThrows(
    () =>
      explainPlanChoices({
        facts: sansLeFait as unknown as PlanRationaleFacts,
        locale: "fr",
      }),
    Error,
    "energyBelowBand",
  );
});

Deno.test("le constat vient AVANT le budget, qui l'explique", () => {
  // ⚠️ L'ORDRE PORTE UN SENS. Le budget dit ce qui a cédé pour tenir dedans
  // (« les protéines chères d'abord »): lu APRÈS le constat, il en est la
  // raison; lu avant, il serait une excuse posée d'avance.
  const out = explainPlanChoices({
    facts: { ...nominalFacts(), energyBelowBand: true, budgetAmount: 40 },
    locale: "fr",
  });
  const iLeger = out.lines.findIndex((l) => l.includes("plus léger"));
  const iBudget = out.lines.findIndex((l) => l.includes("budget"));
  assert(iLeger >= 0 && iBudget >= 0, "les deux lignes doivent sortir");
  assert(iLeger < iBudget, "le constat doit précéder le budget");
});

// ---------------------------------------------------------------------------
// LES JOURS DE CUISINE QUE LA FENÊTRE N'ATTEINT PAS — 2026-09-01
//
// ⛔ LE DÉFAUT QUE CES TESTS TIENNENT, ET IL ÉTAIT EN PRODUCTION. Jours cochés
// `dimanche`, fenêtre lundi→vendredi: `buildMealPrompt` écrit « none of those
// days are left in this stretch », `addedCookDays` rend `[]` (il sort sur
// `usable.length === 0`), et ce module tombait donc dans `cookDeclaredKept` —
// « Tu cuisines dimanche, et c'est ce qui a été gardé », sur un plan d'où le
// dimanche venait d'être retiré. Un fait faux, déterministe, indémentable.
// ---------------------------------------------------------------------------

Deno.test("TOUS les jours cochés hors fenêtre: on le DIT, on ne prétend pas les avoir gardés", () => {
  const facts: PlanRationaleFacts = {
    ...nominalFacts(),
    declaredCookDays: ["sun"],
    // La fenêtre va du lundi au vendredi: `usableCookDays` rend `[]`.
    usableCookDays: [],
  };
  for (const [locale, kept, said] of [
    ["fr", "c'est ce qui a été gardé", "ce plan ne va pas jusque-là"],
    ["en", "that is what was kept", "does not reach that far"],
  ] as const) {
    const out = explainPlanChoices({ facts, locale });
    assertEquals(out.refusal, null);
    const text = out.lines.join(" ");
    // ⛔ LA MOITIÉ QUI COMPTE: la phrase d'avant ne doit PLUS sortir.
    assert(!text.includes(kept), `${locale}: la phrase fausse est encore là — ${text}`);
    assert(text.includes(said), `${locale}: l'écart n'est pas dit — ${text}`);
  }
});

Deno.test("écart PARTIEL: on nomme ce qui reste ET ce qui tombe", () => {
  const out = explainPlanChoices({
    facts: {
      ...nominalFacts(),
      declaredCookDays: ["sun", "wed"],
      usableCookDays: ["wed"],
    },
    locale: "fr",
  });
  const text = out.lines.join(" ");
  assert(text.includes("mercredi"), text);
  assert(text.includes("dimanche"), text);
  // Les deux jours sont nommés, mais PAS du même côté: « gardé » ne porte que
  // sur mercredi. Une phrase qui les mettrait ensemble redirait le mensonge.
  assert(text.includes("n'est pas dans cette fenêtre"), text);
});

Deno.test("MUTATION — quand rien n'est écarté, la phrase d'origine revient", () => {
  // ⚠️ SANS CE CAS, LE LOT SERAIT UNE GARDE QUI BLOQUE TOUT. Un plan ordinaire
  // — tous les jours cochés atteints — doit rendre EXACTEMENT la phrase d'avant.
  const out = explainPlanChoices({
    facts: {
      ...nominalFacts(),
      declaredCookDays: ["sun", "wed"],
      usableCookDays: ["sun", "wed"],
    },
    locale: "fr",
  });
  assert(
    out.lines.some((l) => l.includes("c'est ce qui a été gardé")),
    out.lines.join(" | "),
  );
});

Deno.test("PROMPT — la consigne et l'explication lisent la MÊME intersection", () => {
  // Le jumeau du test d'`addedCookDays` juste au-dessus, sur l'autre branche.
  //
  // ⚠️ LE DÉCOR EST CHOISI POUR QUE RIEN NE SOIT AJOUTÉ. Avec `sun, wed` sur
  // lundi→vendredi, le seul jour utilisable (mercredi) tombe APRÈS le premier
  // jour de la fenêtre: `addedCookDays` pose un lundi, et c'est SA branche qui
  // parle. Ici `mon` est déclaré, donc rien n'est ajouté — et il ne reste que
  // l'écart à nommer: le dimanche, que cette fenêtre n'atteint pas.
  const args = {
    ...PROMPT_ARGS,
    cookDays: ["mon", "sun"],
    daysToFill: ["mon", "tue", "wed", "thu", "fri"],
    todayToken: "mon",
    today: "2026-08-17",
  };
  const message = buildMealPrompt(args).userMessage;
  const usable = usableCookDays({
    declared: args.cookDays,
    window: args.daysToFill,
  });
  assertEquals(usable, ["mon"]);
  assertEquals(
    addedCookDays({
      declared: args.cookDays,
      window: args.daysToFill,
      firstDayCookable: true,
    }),
    [],
  );
  // La consigne servie au modèle nomme EXACTEMENT cette liste-là.
  assert(
    message.includes(`they can only cook on: ${usable.join(", ")}`),
    "la consigne ne nomme pas les jours que l'explication va nommer",
  );
});

Deno.test("`usableCookDays` — fenêtre inconnue ⇒ rien n'est déclaré écarté", () => {
  // ⚠️ `[]` DIRAIT « tous ont été retirés », ce que personne n'a mesuré.
  assertEquals(usableCookDays({ declared: ["sun"], window: [] }), ["sun"]);
  assertEquals(usableCookDays({ declared: [], window: ["mon"] }), []);
  assertEquals(
    usableCookDays({ declared: ["sun", "wed"], window: ["mon", "tue", "wed"] }),
    ["wed"],
  );
});

// ---------------------------------------------------------------------------
// LES CASES QUE LE PLAN NE REMPLIT PAS — 2026-09-01
//
// ⛔ LE DÉCOR EST CELUI QUI A ÉTÉ MESURÉ: sept jours, UNE session de cuisine
// le dimanche, un congélateur coché. La fenêtre du cuit (`MAX_FRIDGE_DAYS = 3`)
// jette huit plats, et mercredi→samedi n'ont plus que leur petit-déjeuner.
// `empty_slots` portait déjà le fait; personne ne le lisait.
// ---------------------------------------------------------------------------

const MESURE_1_SESSION_7_JOURS = [
  { day: "wed", slot: "lunch" },
  { day: "wed", slot: "dinner" },
  { day: "thu", slot: "lunch" },
  { day: "thu", slot: "dinner" },
  { day: "fri", slot: "lunch" },
  { day: "fri", slot: "dinner" },
  { day: "sat", slot: "lunch" },
  { day: "sat", slot: "dinner" },
] as const;

Deno.test("LE CAS MESURÉ — quatre jours sans déjeuner ni dîner, et on le DIT", () => {
  const facts: PlanRationaleFacts = {
    ...nominalFacts(),
    emptySlots: [...MESURE_1_SESSION_7_JOURS] as never,
  };

  const fr = explainPlanChoices({ facts, locale: "fr" }).lines.join(" | ");
  // Les quatre jours nommés, les deux moments nommés, UNE seule phrase — pas
  // huit lignes « mercredi midi », qui seraient la grille écrite deux fois.
  for (const day of ["mercredi", "jeudi", "vendredi", "samedi"]) {
    assert(fr.includes(day), `${day} manque — ${fr}`);
  }
  assert(fr.includes("le déjeuner"), fr);
  assert(fr.includes("le dîner"), fr);
  assert(fr.includes("n'ont pas été composés"), fr);

  const en = explainPlanChoices({ facts, locale: "en" }).lines.join(" | ");
  assert(en.includes("Saturday"), en);
  assert(en.includes("were not composed"), en);
});

Deno.test("des trous IRRÉGULIERS se comptent, ils ne se groupent pas", () => {
  // ⛔ « mercredi et jeudi n'ont pas le déjeuner et le dîner » serait FAUX ici:
  // jeudi a son déjeuner. La forme groupée ne se dit que quand chaque jour
  // manque exactement les mêmes moments.
  const out = explainPlanChoices({
    facts: {
      ...nominalFacts(),
      emptySlots: [
        { day: "wed", slot: "lunch" },
        { day: "wed", slot: "dinner" },
        { day: "thu", slot: "dinner" },
      ] as never,
    },
    locale: "fr",
  });
  const text = out.lines.join(" | ");
  assert(text.includes("3 repas n'ont pas été composés"), text);
  assert(!text.includes("le déjeuner et le dîner"), `forme groupée servie à tort — ${text}`);
});

Deno.test("MUTATION — un plan complet ne parle PAS de trous", () => {
  // Sans ce cas, la phrase sortirait sur tous les plans et on ne saurait plus
  // ce qu'elle signale.
  const out = explainPlanChoices({ facts: nominalFacts(), locale: "fr" });
  assert(
    !out.lines.some((l) => l.includes("composés")),
    out.lines.join(" | "),
  );
});

Deno.test("le trou se lit APRÈS l'absence, qui explique un vide VOULU", () => {
  const out = explainPlanChoices({
    facts: {
      ...nominalFacts(),
      awayInWindow: [{ day: "fri", slot: "lunch" }] as never,
      emptySlots: [{ day: "sat", slot: "dinner" }] as never,
    },
    locale: "fr",
  });
  const away = out.lines.findIndex((l) => l.includes("hors de la maison"));
  const gap = out.lines.findIndex((l) => l.includes("n'a pas été composé"));
  assert(away >= 0 && gap >= 0, out.lines.join(" | "));
  assert(away < gap, `l'ordre est inversé — ${out.lines.join(" | ")}`);
});

// ---------------------------------------------------------------------------
// LOT 2 — CE QU'AUCUN LOT N'ATTEINT, ET LA SESSION QUI DÉBORDE (2026-09-01)
// ---------------------------------------------------------------------------

Deno.test("les jours hors de portée portent LEUR SORTIE, pas le problème", () => {
  const out = explainPlanChoices({
    facts: {
      ...nominalFacts(),
      daysOutOfBatchReach: ["wed", "thu", "fri", "sat"],
    },
    locale: "fr",
  });
  const text = out.lines.join(" | ");
  for (const day of ["mercredi", "jeudi", "vendredi", "samedi"]) {
    assert(text.includes(day), `${day} manque — ${text}`);
  }
  // ⛔ LA MOITIÉ QUI COMPTE: la phrase dit QUOI FAIRE. « Ne peuvent pas vivre
  // d'un lot » laisserait quelqu'un devant un problème sans réponse.
  assert(text.includes("se cuisinent sur le moment"), text);
  // Et elle n'accuse personne: le fait est une propriété du frigo.
  assert(!text.includes("tu n'as pas"), text);
});

Deno.test("un seul jour hors de portée s'accorde au singulier", () => {
  // Le sujet de la phrase est la liste des JOURS: « samedi sont trop loin »
  // est ce qu'un gabarit unique produirait. Même défaut que celui attrapé sur
  // les créneaux vides, et même correction.
  const out = explainPlanChoices({
    facts: { ...nominalFacts(), daysOutOfBatchReach: ["sat"] },
    locale: "fr",
  });
  const text = out.lines.join(" | ");
  assert(text.includes("ce jour-là se cuisine"), text);
  assert(!text.includes("ces jours-là"), text);
});

Deno.test("MUTATION — un plan sans tension ne parle NI de portée NI de débordement", () => {
  const out = explainPlanChoices({ facts: nominalFacts(), locale: "fr" });
  const text = out.lines.join(" | ");
  assert(!text.includes("Aucun lot ne tient"), text);
  assert(!text.includes("prendra plutôt"), text);
});

Deno.test("la session qui déborde est dite AVANT les fourneaux, avec les deux chiffres", () => {
  // ⛔ LE CHIFFRE DÉCLARÉ EST RAPPELÉ. Sans lui, « compte 1 h 15 » se lit comme
  // une estimation venue de nulle part au lieu d'un écart avec ce qu'on a
  // soi-même demandé — et c'est l'écart qui est l'information.
  for (const [locale, needle] of [["fr", "prendra plutôt"], ["en", "will take"]] as const) {
    const out = explainPlanChoices({
      facts: {
        ...nominalFacts(),
        sessionOverruns: [{ day: "wed", minutes: 75, declared: 30 }],
      },
      locale,
    });
    const text = out.lines.join(" | ");
    assert(text.includes(needle), `${locale}: ${text}`);
    // ⚠️ LES DEUX DURÉES, ET RENDUES COMME UN HUMAIN LES DIT — jamais « 75 ».
    // `renderDuration` écrit « 1 h 15 » en français et « 1 hour 15 min » en
    // anglais; on vérifie donc les MINUTES restantes, qui sont communes aux
    // deux formes, plutôt qu'une chaîne d'une seule langue.
    assert(!text.includes("75"), `${locale}: durée brute non rendue — ${text}`);
    assert(text.includes("15"), `${locale}: la durée réelle manque — ${text}`);
    assert(text.includes("30"), `${locale}: la durée déclarée manque — ${text}`);
  }
});

Deno.test("⛔ AUCUNE LIGNE NE COMMENCE PAR UNE MINUSCULE — garde d'écran", () => {
  // ⚠️ ELLE EXISTE PARCE QUE LA FAUTE A ÉTÉ VUE À L'ÉCRAN LE 2026-09-01:
  // « mercredi, jeudi, vendredi et samedi sont trop loin… ». `renderDays` rend
  // les jours en minuscules en français, et un gabarit qui ouvre sa phrase sur
  // la liste ouvre donc sur une minuscule. La faute ne casse rien — c'est
  // exactement pourquoi elle survivrait à tous les autres tests.
  //
  // ⛔ ELLE RELIT TOUT, pas seulement les gabarits neufs: le prochain qui
  // s'écrira dans ce sens-là tombera ici.
  const tousLesFaits: PlanRationaleFacts = {
    ...nominalFacts(),
    energyBelowBand: true,
    declaredCookDays: ["sun", "wed"],
    usableCookDays: ["sun"],
    addedCookDays: ["thu"],
    requestedWindow: { startsOn: "2026-08-13", durationDays: 7 },
    slotsDroppedToday: ["breakfast", "lunch"],
    awayInWindow: [{ day: "fri", slot: "lunch" }],
    emptySlots: [{ day: "sat", slot: "dinner" }],
    daysOutOfBatchReach: ["wed", "thu", "fri", "sat"],
    sessionOverruns: [{ day: "wed", minutes: 75, declared: 30 }],
    budgetAmount: 60,
    mouthsServed: 3,
    handTakenBy: ["Nina"],
    mergedIn: ["Marc"],
    weeklyCookingMinutes: 120,
  };
  for (const locale of ["fr", "en"] as const) {
    for (const line of explainPlanChoices({ facts: tousLesFaits, locale }).lines) {
      const first = line.trimStart()[0] ?? "";
      assert(
        first !== first.toLowerCase() || !/\p{L}/u.test(first),
        `${locale}: une phrase ouvre sur une minuscule — « ${line} »`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// « TOUT DANS UNE SESSION DE CUISINE » — 2026-09-01
//
// ⛔ LA RAISON D'ÊTRE DE CE BLOC. Une demande de rang 2 qui se résout sans une
// ligne d'explication se lit comme un bug: quelqu'un coche l'option, reçoit un
// plan à trois jours de cuisine, et rien ne dit pourquoi. Et le symétrique est
// pire — une phrase qui affirme le contraire de ce que le moteur a fait, ce que
// `cookDeclaredDropped` a déjà coûté à ce module.
// ---------------------------------------------------------------------------

Deno.test("case décochée ⇒ AUCUNE phrase de session unique", () => {
  // Le chemin de tous les plans d'avant ce lot, et de la grande majorité après.
  for (const locale of ["fr", "en"] as const) {
    const joined = explainPlanChoices({ facts: nominalFacts(), locale })
      .lines.join(" ");
    assert(!joined.includes("une seule fois"), joined);
    assert(!joined.includes("in one go"), joined);
    assert(!joined.includes("congélateur"), joined);
    assert(!joined.includes("freezer"), joined);
  }
});

Deno.test("option honorée ⇒ la phrase NOMME le jour et dit où va le surplus", () => {
  for (const locale of ["fr", "en"] as const) {
    const lines = explainPlanChoices({
      facts: { ...nominalFacts(), oneCookingSession: { day: "sun", refusedNoFreezer: false } },
      locale,
    }).lines;
    const joined = lines.join(" ");
    assertStringIncludes(joined, locale === "fr" ? "dimanche" : "Sunday");
    assertStringIncludes(joined, locale === "fr" ? "congélateur" : "freezer");
  }
});

Deno.test("⛔ ELLE REMPLACE LE BLOC DES JOURS COCHÉS, elle ne s'y ajoute pas", () => {
  // « Tu cuisines dimanche ET mercredi, et c'est ce qui a été gardé » à côté de
  // « tout est cuisiné dimanche » sont deux faits dont un est FAUX.
  const lines = explainPlanChoices({
    facts: {
      ...nominalFacts(),
      declaredCookDays: ["sun", "wed"],
      usableCookDays: ["sun", "wed"],
      oneCookingSession: { day: "sun", refusedNoFreezer: false },
    },
    locale: "fr",
  }).lines;
  const joined = lines.join(" ");
  assert(!joined.includes("c'est ce qui a été gardé"), joined);
  assertStringIncludes(joined, "Tout est cuisiné dimanche");
  // MUTATION — sans l'option, la phrase d'origine revient. C'est ce qui prouve
  // que la branche remplace, et qu'elle ne masque pas.
  const sans = explainPlanChoices({
    facts: {
      ...nominalFacts(),
      declaredCookDays: ["sun", "wed"],
      usableCookDays: ["sun", "wed"],
    },
    locale: "fr",
  }).lines.join(" ");
  assertStringIncludes(sans, "c'est ce qui a été gardé");
});

Deno.test("jour inconnu ⇒ la phrase sort SANS affirmer un jour", () => {
  // Le modèle a choisi sa date; affirmer un jour qu'on n'a pas décidé serait un
  // fait faux déterministe — la famille de défaut que ce module existe pour ne
  // plus produire.
  const joined = explainPlanChoices({
    facts: {
      ...nominalFacts(),
      declaredCookDays: [],
      usableCookDays: [],
      oneCookingSession: { day: null, refusedNoFreezer: false },
    },
    locale: "fr",
  }).lines.join(" ");
  assertStringIncludes(joined, "Tout est cuisiné en une seule session");
  assert(!joined.includes("Tout est cuisiné dimanche"), joined);
});

Deno.test("option REFUSÉE ⇒ on le dit, et les jours cochés restent décrits", () => {
  // ⚠️ LE REFUS LAISSE LE BLOC EN PLACE: rien n'a été ramené à une session, donc
  // les jours cochés sont bien ceux qui ont servi. Les faire disparaître
  // retirerait une explication juste au moment où elle est la plus utile.
  for (const locale of ["fr", "en"] as const) {
    const joined = explainPlanChoices({
      facts: { ...nominalFacts(), oneCookingSession: { day: null, refusedNoFreezer: true } },
      locale,
    }).lines.join(" ");
    assertStringIncludes(joined, locale === "fr" ? "congélateur" : "freezer");
    // La phrase d'origine des jours cochés est toujours là.
    assertStringIncludes(
      joined,
      locale === "fr" ? "c'est ce qui a été gardé" : "that is what was kept",
    );
    // Et on n'annonce PAS une session unique qui n'a pas eu lieu.
    assert(!joined.includes("Tout est cuisiné"), joined);
    assert(!joined.includes("Everything is cooked"), joined);
  }
});

Deno.test("⛔ LE FAIT EST REQUIS — un `undefined` JETTE, il ne se tait pas", () => {
  const facts = nominalFacts() as unknown as Record<string, unknown>;
  delete facts.oneCookingSession;
  assertThrows(
    () => explainPlanChoices({ facts: facts as never, locale: "fr" }),
    Error,
    "oneCookingSession",
  );
});

Deno.test("les DEUX phrases de session unique passent la garde des majuscules", () => {
  // La garde d'écran plus haut ne relit qu'un jeu de faits; les deux issues de
  // l'option s'excluent, donc l'une des deux lui échappe par construction.
  for (const locale of ["fr", "en"] as const) {
    for (
      const single of [
        { day: "sun" as const, refusedNoFreezer: false },
        { day: null, refusedNoFreezer: true },
      ]
    ) {
      for (
        const line of explainPlanChoices({
          facts: { ...nominalFacts(), oneCookingSession: single },
          locale,
        }).lines
      ) {
        const first = line.trimStart()[0] ?? "";
        assert(
          first !== first.toLowerCase() || !/\p{L}/u.test(first),
          `${locale}: une phrase ouvre sur une minuscule — « ${line} »`,
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// « JE CUISINE LA VEILLE » — 2026-09-01
//
// ⛔ LE REFUS EST DU RANG 2, DONC IL PARLE. Les deux raisons sont des faits de
// calendrier que la personne ne peut pas deviner (le plan commence aujourd'hui,
// ou il fait déjà sept jours). Sans phrase, elle coche une case, reçoit un plan
// qui commence quand même le premier jour, et ne peut pas savoir si l'option
// est cassée ou si sa semaine ne s'y prêtait pas.
// ---------------------------------------------------------------------------

Deno.test("case décochée ⇒ AUCUNE phrase de veille", () => {
  for (const locale of ["fr", "en"] as const) {
    const joined = explainPlanChoices({ facts: nominalFacts(), locale })
      .lines.join(" ");
    assert(!joined.includes("un jour plus tôt"), joined);
    assert(!joined.includes("a day earlier"), joined);
  }
});

Deno.test("veille accordée ⇒ elle NOMME le jour et dit que rien ne s'y mange", () => {
  for (const locale of ["fr", "en"] as const) {
    const joined = explainPlanChoices({
      facts: { ...nominalFacts(), cookDayBefore: { day: "sun", refused: null, reason: "day_before" } },
      locale,
    }).lines.join(" ");
    assertStringIncludes(joined, locale === "fr" ? "dimanche" : "Sunday");
    // Les DEUX moitiés: le plan commence plus tôt, ET ce jour ne porte rien.
    assertStringIncludes(
      joined,
      locale === "fr" ? "un jour plus tôt" : "a day earlier",
    );
    assertStringIncludes(
      joined,
      locale === "fr" ? "rien ne s'y mange" : "nothing is eaten on it",
    );
  }
});

Deno.test("les DEUX refus sortent, et ce ne sont pas les mêmes mots", () => {
  // Ils se réparent par des gestes OPPOSÉS — décaler le début, ou raccourcir
  // la fenêtre. Une phrase commune ne dirait ni l'un ni l'autre.
  for (const locale of ["fr", "en"] as const) {
    const past = explainPlanChoices({
      facts: {
        ...nominalFacts(),
        cookDayBefore: { day: null, refused: "in_the_past", reason: "in_the_past" },
      },
      locale,
    }).lines.join(" ");
    const room = explainPlanChoices({
      facts: {
        ...nominalFacts(),
        cookDayBefore: { day: null, refused: "no_room", reason: "no_room" },
      },
      locale,
    }).lines.join(" ");
    assert(past !== room, `${locale}: les deux refus disent la même chose`);
    assertStringIncludes(past, locale === "fr" ? "hier" : "yesterday");
    assertStringIncludes(room, locale === "fr" ? "sept" : "seven");
    // ⛔ ET AUCUN DES DEUX N'ANNONCE UN JOUR QUI N'EXISTE PAS.
    assert(!past.includes("un jour plus tôt") && !past.includes("a day earlier"));
    assert(!room.includes("un jour plus tôt") && !room.includes("a day earlier"));
  }
});

Deno.test("la veille se lit AVANT la session unique", () => {
  // L'ordre est le sens: « le plan commence dimanche, un jour plus tôt »
  // explique la FENÊTRE, « tout est cuisiné dimanche » explique ce qu'on y
  // fait. Lire la seconde d'abord ferait apparaître un jour dont on n'a pas
  // encore dit d'où il sort.
  const lines = explainPlanChoices({
    facts: {
      ...nominalFacts(),
      cookDayBefore: { day: "sun", refused: null, reason: "day_before" },
      oneCookingSession: { day: "sun", refusedNoFreezer: false },
    },
    locale: "fr",
  }).lines;
  const before = lines.findIndex((l) => l.includes("un jour plus tôt"));
  const session = lines.findIndex((l) => l.includes("Tout est cuisiné"));
  assert(before >= 0 && session >= 0, JSON.stringify(lines));
  assert(before < session, JSON.stringify(lines));
});

Deno.test("⛔ LE FAIT `cookDayBefore` EST REQUIS — un `undefined` JETTE", () => {
  const facts = nominalFacts() as unknown as Record<string, unknown>;
  delete facts.cookDayBefore;
  assertThrows(
    () => explainPlanChoices({ facts: facts as never, locale: "fr" }),
    Error,
    "cookDayBefore",
  );
});

// ---------------------------------------------------------------------------
// LES COURSES — 2026-09-01
//
// ⛔ LE DÉFAUT: « ça me disait de cuisiner le poulet acheté le lundi, le
// samedi ». Le moteur SAVAIT que ce poulet s'achète le jeudi, et aucun texte du
// plan ne l'a jamais dit.
// ---------------------------------------------------------------------------

Deno.test("aucune date connue ⇒ AUCUNE phrase de courses", () => {
  // On ne devine pas un jour de magasin.
  for (const locale of ["fr", "en"] as const) {
    const joined = explainPlanChoices({ facts: nominalFacts(), locale })
      .lines.join(" ");
    assert(!joined.includes("course"), joined);
    assert(!joined.includes("shop"), joined);
  }
});

Deno.test("une seule course s'annonce comme une BONNE nouvelle", () => {
  for (const locale of ["fr", "en"] as const) {
    const joined = explainPlanChoices({
      facts: { ...nominalFacts(), shoppingDays: ["sun"] },
      locale,
    }).lines.join(" ");
    assertStringIncludes(joined, locale === "fr" ? "Une seule course" : "One shop");
    assertStringIncludes(joined, locale === "fr" ? "dimanche" : "Sunday");
    // Elle dit POURQUOI il n'y en a qu'une: tout tient.
    assertStringIncludes(joined, locale === "fr" ? "tient" : "keeps");
  }
});

Deno.test("plusieurs courses DISENT à quoi sert le déplacement de plus", () => {
  // Sans le motif, une seconde course est une corvée arbitraire — et on cesse
  // de la suivre.
  for (const locale of ["fr", "en"] as const) {
    const joined = explainPlanChoices({
      facts: { ...nominalFacts(), shoppingDays: ["sun", "wed"] },
      locale,
    }).lines.join(" ");
    assertStringIncludes(joined, "2");
    assertStringIncludes(joined, locale === "fr" ? "frais" : "fresh");
  }
});

Deno.test("LE CAS RAPPORTÉ — le jour qui réclame sa propre course est NOMMÉ", () => {
  for (const locale of ["fr", "en"] as const) {
    const joined = explainPlanChoices({
      facts: {
        ...nominalFacts(),
        shoppingDays: ["sun", "thu"],
        shopLaterDays: ["sat"],
      },
      locale,
    }).lines.join(" ");
    assertStringIncludes(joined, locale === "fr" ? "samedi" : "Saturday");
    // ⛔ ET LA PHRASE PORTE LA SORTIE, PAS UN REPROCHE: cuisiner du poulet le
    // samedi est légitime, ça s'achète au plus près.
    assertStringIncludes(
      joined,
      locale === "fr" ? "au plus près" : "bought close to that day",
    );
  }
});

Deno.test("les courses se lisent AVANT les journées hors de portée", () => {
  // L'ordre du frigo: on achète, on cuisine, on garde. Lire « aucun lot ne
  // tient jusqu'à samedi » avant de savoir quand on fait ses courses inverse
  // la chaîne.
  const lines = explainPlanChoices({
    facts: {
      ...nominalFacts(),
      shoppingDays: ["sun", "wed"],
      daysOutOfBatchReach: ["sat"],
    },
    locale: "fr",
  }).lines;
  const shop = lines.findIndex((l) => l.includes("courses"));
  const reach = lines.findIndex((l) => l.includes("Aucun lot"));
  assert(shop >= 0 && reach >= 0, JSON.stringify(lines));
  assert(shop < reach, JSON.stringify(lines));
});

Deno.test("⛔ LES DEUX FAITS SONT REQUIS — un `undefined` JETTE", () => {
  for (const key of ["shoppingDays", "shopLaterDays"] as const) {
    const facts = nominalFacts() as unknown as Record<string, unknown>;
    delete facts[key];
    assertThrows(
      () => explainPlanChoices({ facts: facts as never, locale: "fr" }),
      Error,
      key,
    );
  }
});

Deno.test("les phrases de courses passent la garde des majuscules", () => {
  for (const locale of ["fr", "en"] as const) {
    for (
      const facts of [
        { ...nominalFacts(), shoppingDays: ["sun"] },
        { ...nominalFacts(), shoppingDays: ["sun", "wed"], shopLaterDays: ["sat"] },
      ] as const
    ) {
      for (const line of explainPlanChoices({ facts, locale }).lines) {
        const first = line.trimStart()[0] ?? "";
        assert(
          first !== first.toLowerCase() || !/\p{L}/u.test(first),
          `${locale}: une phrase ouvre sur une minuscule — « ${line} »`,
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// A1 (chantier-0903/CUISINE, 2026-09-03) — LA VEILLE DÉRIVÉE PARLE, TOUJOURS
// ---------------------------------------------------------------------------
//
// La veille n'est plus une case. Deux phrases neuves, et elles ne sont pas
// interchangeables: « ce soir » dit qu'il faut se mettre en cuisine dans les
// heures qui viennent; « dès le matin » dit qu'il n'y a plus de veille du tout
// et que le premier jour se joue avant midi. Rang 2 (SYNTHESE §6): rien de
// dérivé ne part sans une ligne de `plan_rationale`.

Deno.test("A1 — la veille est CE SOIR: la phrase le dit, dans les deux langues", () => {
  for (const locale of ["fr", "en"] as const) {
    const joined = explainPlanChoices({
      facts: {
        ...nominalFacts(),
        cookDayBefore: { day: "sun", refused: null, reason: "before_cutoff_today" },
      },
      locale,
    }).lines.join(" ");
    assertStringIncludes(joined, locale === "fr" ? "ce soir" : "tonight");
    assertStringIncludes(joined, locale === "fr" ? "dimanche" : "Sunday");
    // Et elle garde les deux moitiés de l'autre phrase: le plan commence plus
    // tôt, et rien ne se mange ce jour-là.
    assertStringIncludes(joined, locale === "fr" ? "un jour plus tôt" : "a day earlier");
  }
});

Deno.test("A1 — « ce soir » et « un jour plus tôt » ne sont PAS la même phrase", () => {
  // ⛔ MUTATION-RÉSISTANT: si le rendu retombe sur `cookDayBeforeGranted` pour
  // les deux motifs, ce test tombe. C'est lui qui arme le ternaire.
  for (const locale of ["fr", "en"] as const) {
    const tonight = explainPlanChoices({
      facts: {
        ...nominalFacts(),
        cookDayBefore: { day: "sun", refused: null, reason: "before_cutoff_today" },
      },
      locale,
    }).lines.join(" ");
    const laterDay = explainPlanChoices({
      facts: {
        ...nominalFacts(),
        cookDayBefore: { day: "sun", refused: null, reason: "day_before" },
      },
      locale,
    }).lines.join(" ");
    assert(tonight !== laterDay, `${locale}: les deux veilles disent la même chose`);
    // Et la veille d'un jour à venir ne parle SURTOUT pas de ce soir.
    assert(
      !laterDay.includes("ce soir") && !laterDay.includes("tonight"),
      `${locale}: une veille future annonce une soirée`,
    );
  }
});

Deno.test("A1 — pas de veille ⇒ « dès le matin », et jamais un jour de cuisine", () => {
  for (const locale of ["fr", "en"] as const) {
    for (const reason of ["after_cutoff", "starts_today", "clock_unreadable"]) {
      const joined = explainPlanChoices({
        facts: {
          ...nominalFacts(),
          cookDayBefore: { day: null, refused: null, reason },
        },
        locale,
      }).lines.join(" ");
      assertStringIncludes(joined, locale === "fr" ? "dès le matin" : "first thing in the morning");
      // ⛔ AUCUN JOUR ANNONCÉ. « un jour plus tôt » sur un plan qui n'a pas
      // reculé enverrait chercher une journée qui n'est dans aucun plan.
      assert(
        !joined.includes("un jour plus tôt") && !joined.includes("a day earlier"),
        `${locale}/${reason}: annonce un jour de cuisine qui n'existe pas`,
      );
    }
  }
});

Deno.test("A1 — un appelant qui ne dérive RIEN reste muet", () => {
  // La fusion ne dérive pas de veille: elle passe `cookDayBefore: null` et
  // l'explication d'un plan ordinaire ne bouge pas d'un caractère.
  for (const locale of ["fr", "en"] as const) {
    const joined = explainPlanChoices({
      facts: { ...nominalFacts(), cookDayBefore: null },
      locale,
    }).lines.join(" ");
    assert(!joined.includes("dès le matin") && !joined.includes("first thing"));
    assert(!joined.includes("ce soir") && !joined.includes("tonight"));
  }
});
