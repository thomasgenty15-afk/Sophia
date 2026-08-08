// PIVOT NUTRITION — le fait du soir: daily_recap.ts.
//
// The two tests that carry the product decision:
//   * "the fact is the compliment"
//     -- praise is the same daily tax as the daily question, dressed as
//        kindness. It becomes wallpaper in four evenings, and on a mediocre day
//        it makes the whole channel non-credible with no way back.
//   * "a number that was not given is a number that was invented"
//     -- the repo already paid for a recap that confabulated its own narrative
//        (`tracking-projection-not-grounded-db`). A wrong count in the bubble is
//        indistinguishable from a right one, for the student and for the coach.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  acceptComposedRecap,
  allowedNumbers,
  buildRecapSystemPrompt,
  buildRecapUserPrompt,
  type DayFacts,
  describeDayFacts,
  EMPTY_DAY_FACTS,
  hasRecapGround,
  type PracticeInjection,
  recapGround,
  RECAP_MAX_CHARS,
  renderDeterministicRecap,
} from "./daily_recap.ts";

function facts(over: Partial<DayFacts> = {}): DayFacts {
  const base = {
    tickedCount: 2,
    tickedTitles: ["Greek yoghurt and berries", "Chicken and rice bowl"],
    plannedCount: 4,
    photoCount: 1,
    // FF-009 — le troisième compte. Explicite dans la fixture: une journée
    // décrite à moitié ferait passer `undefined` dans `allowedNumbers`, et la
    // ceinture accepterait alors n'importe quoi qui ressemble à un nombre.
    offPlanCount: 0,
    ...over,
  };
  return {
    ...base,
    // Par défaut, toutes les coches visent le plan du jour — l'hypothèse de ces
    // tests, et le cas d'un élève qui n'a qu'un plan. Un cas qui veut la
    // dissocier (coches d'un plan PRÉPARÉ comptées face au plan courant) la
    // passe explicitement.
    tickedForPlanCount: over.tickedForPlanCount ?? base.tickedCount,
  };
}

// ---------------------------------------------------------------------------
// THE GROUND — and why "what was planned" is not one
// ---------------------------------------------------------------------------

Deno.test("ticks outrank photos, and an empty day has NO ground", () => {
  assertEquals(recapGround(facts()), "ticked");
  assertEquals(
    recapGround(facts({ tickedCount: 0, tickedTitles: [], photoCount: 2 })),
    "logged",
  );
  assertEquals(
    recapGround(facts({ tickedCount: 0, tickedTitles: [], photoCount: 0 })),
    "none",
  );
  assertEquals(recapGround(EMPTY_DAY_FACTS), "none");
});

Deno.test("a day that held a plan but saw nothing done is still NO ground", () => {
  // The refused temptation, and it is a product decision rather than an
  // oversight: at 20:00 the day is over. Reciting to someone who logged nothing
  // what they were supposed to eat is not a gift, it is a passive reproach —
  // and a daily passive reproach is worse than the blunt question it replaces.
  const empty = facts({ tickedCount: 0, tickedTitles: [], photoCount: 0, plannedCount: 4 });
  assertEquals(hasRecapGround(empty), false);
  assertEquals(renderDeterministicRecap(empty), null);
});

// ---------------------------------------------------------------------------
// THE DETERMINISTIC FALLBACK — sober, and exact
// ---------------------------------------------------------------------------

Deno.test("the fallback states the count, and the ratio only when it is true", () => {
  assertEquals(
    renderDeterministicRecap(facts()),
    "Ticked off today: Greek yoghurt and berries and Chicken and rice bowl — 2 of the 4 on the plan.",
  );

  // No plan for today: the count stands alone rather than inventing a
  // denominator.
  assertEquals(
    renderDeterministicRecap(facts({ plannedCount: 0 })),
    "Ticked off today: Greek yoghurt and berries and Chicken and rice bowl.",
  );
});

Deno.test("catch-up ticks never produce '5 of the 3'", () => {
  // A tick carries the date the dish was EATEN, so catching up on yesterday can
  // push today's total above today's plan. "5 of the 3" would be a false number
  // produced by perfectly correct arithmetic — so the ratio drops out instead.
  const over = facts({
    tickedCount: 5,
    tickedTitles: ["Oats", "Soup", "Salad", "Fish", "Yoghurt"],
    plannedCount: 3,
  });
  const text = renderDeterministicRecap(over) ?? "";
  assert(!text.includes("of the 3"), text);
  assert(text.includes("and 2 more"), text);
});

Deno.test("a tick with no readable title still counts — it is a declared fact", () => {
  // Counting readable titles instead of ticks would drop "2 of the 4" to
  // "1 of the 4" on a piece of missing data: a false number born of an absence,
  // which is the worst kind.
  const partial = facts({ tickedCount: 2, tickedTitles: ["Oats"] });
  const text = renderDeterministicRecap(partial) ?? "";
  assert(text.includes("2 of the 4"), text);
  assert(text.includes("and 1 more"), text);

  // No readable title at all: we count rather than name, and stay exact.
  const mute = facts({ tickedCount: 2, tickedTitles: [] });
  assertEquals(renderDeterministicRecap(mute), "2 dishes ticked off today — 2 of the 4 on the plan.");
  assertEquals(
    renderDeterministicRecap(facts({ tickedCount: 1, tickedTitles: [], plannedCount: 0 })),
    "One dish ticked off today.",
  );
});

Deno.test("photos alone are a ground, and the fallback says only that", () => {
  const one = facts({ tickedCount: 0, tickedTitles: [], photoCount: 1 });
  assertEquals(renderDeterministicRecap(one), "One meal logged today.");
  const three = facts({ tickedCount: 0, tickedTitles: [], photoCount: 3 });
  assertEquals(renderDeterministicRecap(three), "3 meals logged today.");
});

Deno.test("the fallback never judges: no adjective survives its own belt", () => {
  // The fallback is not belt-checked at runtime (it is ours, not the model's).
  // Pinning it here is what keeps a future "warmer" edit honest.
  for (const f of [facts(), facts({ plannedCount: 0 }), facts({ tickedCount: 0, tickedTitles: [], photoCount: 2 })]) {
    const text = renderDeterministicRecap(f) ?? "";
    const verdict = acceptComposedRecap(text, f, null);
    assert(verdict.ok, `${text} -> ${verdict.ok ? "" : verdict.reason}`);
  }
});

// ---------------------------------------------------------------------------
// THE BELT — the fact is the compliment
// ---------------------------------------------------------------------------

Deno.test("praise is refused, in both languages", () => {
  const f = facts();
  const refused = [
    "Great day — Greek yoghurt and the chicken bowl both ticked off.",
    "Well done today, 2 of the 4 went down.",
    "Nice work: yoghurt and chicken bowl ticked.",
    "Yoghurt and chicken bowl ticked off. Keep it up.",
    "You're doing great — 2 of the 4 ticked.",
    "Yoghurt and the chicken bowl. Crushing it.",
    "Bravo, 2 of the 4 ticked off.",
    "Bien joué, 2 des 4 cochés.",
    "Félicitations, la journée est bouclée.",
    "Yaourt et poulet cochés. Continue comme ça.",
  ];
  for (const text of refused) {
    const v = acceptComposedRecap(text, f, null);
    assertEquals(v.ok, false, text);
    if (!v.ok) assertEquals(v.reason, "qualifies_the_day", text);
  }
});

Deno.test("...AND ITS DISARMING CONDITION: qualifying a FOOD is not qualifying the day", () => {
  // The belt bites on a verdict about the day, the work or the student. A
  // sentence about nutrition must pass — otherwise every coach whose doctrine
  // talks about food gets the deterministic fallback forever, and the composer
  // dies quietly while looking alive.
  const f = facts();
  for (
    const text of [
      "Greek yoghurt and the chicken bowl ticked off — a good source of protein in both.",
      "Yoghurt and chicken bowl ticked off, 2 of the 4 on the plan.",
      "The chicken bowl went down today, and the yoghurt too.",
    ]
  ) {
    const v = acceptComposedRecap(text, f, null);
    assertEquals(v.ok, true, `${text} -> ${v.ok ? "" : `${v.reason}:${v.detail}`}`);
  }
});

Deno.test("a number that was not given is a number that was invented", () => {
  const f = facts({ tickedCount: 2, plannedCount: 4, photoCount: 1 });
  // 3 is in no fact: not the ticks, not the plan, not the photos.
  const v = acceptComposedRecap("3 of the 4 dishes went down today.", f, null);
  assertEquals(v.ok, false);
  if (!v.ok) assertEquals(v.reason, "invented_number");

  // A streak is the classic confabulation, and it is refused for the same
  // reason: no fact carries it.
  const s = acceptComposedRecap("Yoghurt and chicken ticked — 6 days running now.", f, null);
  assertEquals(s.ok, false);
  if (!s.ok) assertEquals(s.reason, "invented_number");
});

Deno.test("...AND ITS DISARMING CONDITION: the given numbers pass, and pronouns are not counts", () => {
  const f = facts({ tickedCount: 2, plannedCount: 4, photoCount: 1 });
  // Le 0 est celui du hors-plan (FF-009): une journée sans repas hors plan en
  // porte zéro, et « zéro » est un fait de la journée comme les autres.
  assertEquals(allowedNumbers(f, null), new Set([2, 4, 1, 0]));

  for (
    const text of [
      "Yoghurt and the chicken bowl ticked off — 2 of the 4 on the plan.",
      "Two dishes down today, and 1 photo through.",
      // "one thing" is a pronoun, not a count: a number is only checked in
      // front of something we actually count. Without this, the belt would
      // refuse correct text and the fallback would quietly become nominal.
      "One thing came through today: the chicken bowl.",
    ]
  ) {
    const v = acceptComposedRecap(text, f, null);
    assertEquals(v.ok, true, `${text} -> ${v.ok ? "" : `${v.reason}:${v.detail}`}`);
  }
});

Deno.test("the belt is stateless between texts (global regex lastIndex)", () => {
  // A global regex keeps `lastIndex` between calls. Without the reset, the
  // second text judged would be scanned from the middle of the first — a belt
  // that passes everything after its first bite.
  const f = facts();
  const bad = "3 of the 9 dishes went down.";
  assertEquals(acceptComposedRecap(bad, f, null).ok, false);
  assertEquals(acceptComposedRecap(bad, f, null).ok, false);
  assertEquals(acceptComposedRecap(bad, f, null).ok, false);
});

Deno.test("the recap asks NOTHING", () => {
  const f = facts();
  // On the days the question is not due there is no button to answer with; on
  // the days it is, this would be a second question. Either way it is wrong.
  const v = acceptComposedRecap("Yoghurt and chicken ticked off. How did that feel?", f, null);
  assertEquals(v.ok, false);
  if (!v.ok) assertEquals(v.reason, "asks_a_question");
});

Deno.test("length, sentence count and prompt artefacts are refused", () => {
  const f = facts();
  const long = acceptComposedRecap("x".repeat(RECAP_MAX_CHARS + 1), f, null);
  assertEquals(long.ok, false);
  if (!long.ok) assertEquals(long.reason, "too_long");

  const chatty = acceptComposedRecap("Yoghurt in. Chicken in. Plan half done.", f, null);
  assertEquals(chatty.ok, false);
  if (!chatty.ok) assertEquals(chatty.reason, "too_many_sentences");

  const md = acceptComposedRecap("**Yoghurt** and chicken ticked off.", f, null);
  assertEquals(md.ok, false);
  if (!md.ok) assertEquals(md.reason, "prompt_artefact");

  const empty = acceptComposedRecap("   ", f, null);
  assertEquals(empty.ok, false);
  if (!empty.ok) assertEquals(empty.reason, "empty");
});

Deno.test("a wrapping quote or a role prefix is cleaned, not refused", () => {
  // Cleaning then judging, never the other way round: refusing a correct recap
  // because the model wrapped it in quotes would send everyone to the
  // deterministic fallback, and the composer would look prudent while being
  // dead.
  const f = facts();
  const v = acceptComposedRecap(
    '  Sophia: "Yoghurt and the chicken bowl ticked off today."  ',
    f,
    null,
  );
  assertEquals(v.ok, true);
  if (v.ok) assertEquals(v.text, "Yoghurt and the chicken bowl ticked off today.");
});

// ---------------------------------------------------------------------------
// THE PROMPT — the model gets the facts, and only the facts
// ---------------------------------------------------------------------------

Deno.test("the facts block carries the count as truth and the titles as a sample", () => {
  const partial = facts({ tickedCount: 4, tickedTitles: ["Oats"] });
  const described = describeDayFacts(partial);
  assert(described.includes("ticked off today: 4"), described);
  assert(described.includes('"Oats"'), described);
  // The plan's own dish titles are deliberately absent: giving the model both
  // lists invites it to confuse them, and it has no reason to name a dish the
  // student did not tick.
  assert(described.includes("Dishes the plan held for today: 4"), described);
});

Deno.test("an empty day is described as empty, never padded", () => {
  const described = describeDayFacts(EMPTY_DAY_FACTS);
  assert(described.includes("ticked nothing off the plan today"), described);
  assert(described.includes("no dish for today"), described);
  assert(described.includes("Meal photos the student sent today: 0"), described);
});

Deno.test("the system prompt states each hard rule that a belt enforces", () => {
  const prompt = buildRecapSystemPrompt({ doctrineBlock: "DOCTRINE HERE", facts: facts(), practice: null });
  // A prompt rule with no verifier is an intention, and this repo has enough
  // green disarmed gates. Each of these has a belt in `acceptComposedRecap`.
  assert(prompt.includes(String(RECAP_MAX_CHARS)));
  assert(/never state a number/i.test(prompt));
  assert(/do not praise/i.test(prompt.toLowerCase()) || /Do NOT praise/.test(prompt));
  assert(/Ask NOTHING/.test(prompt));
  // The coach's voice enters verbatim.
  assert(prompt.includes("DOCTRINE HERE"));
  // ...and the facts travel with it.
  assert(prompt.includes("Dishes from the plan the student ticked off today: 2"));
});

Deno.test("no first name means no placeholder, ever", () => {
  assert(buildRecapUserPrompt("Julie").includes("Julie"));
  const anon = buildRecapUserPrompt("");
  assert(/do not invent one/i.test(anon), anon);
  assert(!anon.includes("{{"), anon);
});

// ===========================================================================
// LE RATIO NE PEUT PAS DÉPASSER 100 % — et le nombre qu'il montre doit être
// AUTORISÉ, sinon la voix du coach disparaît sans une erreur.
//
// Depuis qu'un plan COURANT et un plan SUIVANT coexistent, les coches des deux
// portent le même préfixe `meal_tick:`. Le numérateur du ratio est donc scopé
// au plan qui fournit le dénominateur, pendant que `tickedCount` reste le total
// honnête des faits du jour.
// ===========================================================================

Deno.test("le ratio compare des choses comparables, jamais plus de 100 %", () => {
  // Cinq coches ce jour-là, dont deux seulement visent le plan d'aujourd'hui:
  // les trois autres viennent d'un plan préparé pour plus tard.
  const mixed = facts({
    tickedCount: 5,
    tickedForPlanCount: 2,
    plannedCount: 3,
    tickedTitles: ["Oats"],
  });
  // `renderDeterministicRecap` rend `null` quand il n'y a rien à dire; ici il y
  // a cinq coches, donc il y a un texte.
  const text = renderDeterministicRecap(mixed) ?? "";
  assert(text.includes("2 of the 3 on the plan"), text);
  // Et surtout PAS le total brut face au plan: « 5 des 3 » est le défaut.
  assert(!text.includes("5 of the 3"), text);
});

Deno.test("le nombre du ratio est autorisé au juge — sinon repli silencieux", () => {
  // LE PIÈGE. `allowedNumbers` valide les nombres d'un corps composé. Si
  // `tickedForPlanCount` y manquait, un corps PARFAITEMENT exact serait rejeté
  // en `invented_number`, le message replierait sur le texte déterministe, et
  // la voix du coach disparaîtrait sans une seule erreur nulle part.
  const mixed = facts({ tickedCount: 5, tickedForPlanCount: 2, plannedCount: 3 });
  assert(allowedNumbers(mixed, null).has(2), "le numérateur du ratio doit être autorisé");
  assert(allowedNumbers(mixed, null).has(5), "le total des coches reste autorisé");
  assert(allowedNumbers(mixed, null).has(3), "le dénominateur reste autorisé");
});

// ===========================================================================
// FF-001 — LA PRATIQUE DU COACH DANS LE MESSAGE DU SOIR
//
// LA CONTRE-ÉPREUVE D'ABORD, parce que c'est elle qui décide si l'ajout est
// additif ou régressif: un coach SANS pratique doit recevoir le produit
// d'avant, au caractère près. Le message final n'est pas comparable (le modèle
// échantillonne), mais TOUT ce qui le détermine de notre côté l'est — et c'est
// le seul endroit où la régression pourrait naître.
// ===========================================================================

/** L'injection type: « 4 verres d'eau », en mode rappel, pour un adulte. */
function injection(over: Partial<PracticeInjection> = {}): PracticeInjection {
  return {
    block: "── ONE DAILY PRACTICE FROM THIS COACH ──\nThe coach's own words for it: \"4 glasses of water\"",
    mode: "remind",
    numbers: [4],
    forbiddenNumbers: [],
    ...over,
  };
}

Deno.test("CONTRE-ÉPREUVE: sans pratique, le prompt est CELUI D'AVANT, octet pour octet", () => {
  // Le texte attendu est recopié en dur, pas dérivé de la fonction: un attendu
  // calculé par le code sous test ne prouve rien. C'est le prompt tel qu'il
  // était avant FF-001.
  const before = [
    "You are Sophia, the day-to-day voice of this student's coach.",
    "",
    "It is the evening. You are writing an unprompted note about the day that is ending. The student did not ask for it, and this is not a reply to anything.",
    "",
    "WHAT YOU KNOW — these facts, and nothing else exists:",
    describeDayFacts(facts()),
    "",
    "HARD RULES — a message that breaks any of these is discarded, not fixed:",
    "- One to two sentences. Never more than 220 characters.",
    "- Say what happened, using only the facts above. Never state a number, a meal, a day or a streak that is not in them.",
    "- Do NOT praise, congratulate or judge. No 'great day', no 'well done', no 'nice work', no 'keep it up', no 'proud of you'. Naming what the student did IS the message; an adjective on top of it is not.",
    "- Never mention adherence, tracking, targets, streaks or weight.",
    "- Ask NOTHING. No question of any kind, not even a rhetorical one.",
    "- Do not tell them what to do tomorrow, and do not comment on what is missing.",
    "- Plain text only. No markdown, no quotation marks around the message, no 'Sophia:' prefix.",
    "",
    "Reply with the message itself and nothing else.",
    "",
    "── THE COACH'S METHOD (their voice is the one you write in) ──",
    "DOCTRINE HERE",
  ].join("\n");
  assertEquals(
    buildRecapSystemPrompt({ doctrineBlock: "DOCTRINE HERE", facts: facts(), practice: null }),
    before,
  );
  // Et la ceinture juge à l'identique: mêmes plafonds, même interdiction de
  // question, mêmes nombres.
  assertEquals(RECAP_MAX_CHARS, 220);
  assertEquals(allowedNumbers(facts(), null), new Set([2, 4, 1, 0]));
});

Deno.test("R10: le target de la pratique rejoint les nombres autorisés", () => {
  // LE PIÈGE LE PLUS CHER DE FF-001, et il est silencieux. Sans cette ligne, un
  // corps qui cite les « 4 verres » du coach est rejeté en `invented_number`, le
  // repli déterministe devient le cas nominal, et le symptôme lu est « la voix
  // du coach a disparu » — jamais « un nombre a été refusé ».
  const f = facts();
  assert(!allowedNumbers(f, null).has(9), "prémisse: 9 n'est pas un nombre de la journée");
  assert(allowedNumbers(f, injection({ numbers: [9] })).has(9));
});

Deno.test("le plafond s'ouvre d'UNE phrase quand une pratique voyage", () => {
  const f = facts();
  const three = "Yoghurt and chicken ticked off. Two of the four on the plan. Water across the day is the one your coach keeps coming back to.";
  // Sans pratique: trois phrases sont une de trop, et le message replie.
  const alone = acceptComposedRecap(three, f, null);
  assertEquals(alone.ok, false);
  if (!alone.ok) assertEquals(alone.reason, "too_many_sentences");
  // Avec: elles tiennent. Le message porte DEUX choses, il a droit à la place
  // de la seconde.
  assertEquals(acceptComposedRecap(three, f, injection()).ok, true);
  // Quatre restent quatre de trop, dans les deux cas.
  const four = `${three} And that is that.`;
  assertEquals(acceptComposedRecap(four, f, injection()).ok, false);
});

Deno.test("R3: une question ne passe QUE si la pratique est en mode question", () => {
  const f = facts();
  const asked = "Yoghurt and chicken ticked off. Did the water go down today?";
  // Mode rappel — c'est-à-dire, entre autres, tous les soirs où le pulse pose
  // DÉJÀ la sienne. Deux questions dans une bulle est le défaut.
  assertEquals(acceptComposedRecap(asked, f, injection({ mode: "remind" })).ok, false);
  assertEquals(acceptComposedRecap(asked, f, null).ok, false);
  // Mode question: une, et une seule.
  assertEquals(acceptComposedRecap(asked, f, injection({ mode: "ask" })).ok, true);
  const twice = "Yoghurt ticked off. Did the water go down? And how about tomorrow?";
  assertEquals(acceptComposedRecap(twice, f, injection({ mode: "ask" })).ok, false);
});

Deno.test("R5: le chiffre de la pratique est REFUSÉ dans un message pour un mineur", () => {
  // La garde que `allowedNumbers` ne peut pas porter: elle ne regarde un nombre
  // que devant un nom comptable, et « glasses » n'en est pas un. Retirer 4 des
  // nombres autorisés n'interdirait donc rien du tout.
  const f = facts();
  const minor = injection({ numbers: [], forbiddenNumbers: [4] });
  const withDigit = acceptComposedRecap("Yoghurt ticked off. Water across the day — 4 glasses.", f, minor);
  assertEquals(withDigit.ok, false);
  assertEquals(withDigit.ok === false && withDigit.reason, "minor_quantity");
  // En toutes lettres, et en français: le message part dans la langue de
  // l'élève, et une garde qui ne lirait que l'anglais laisserait passer la
  // moitié de la base.
  for (const text of ["Yoghurt ticked off. Four glasses of water is the one.", "Yaourt coché. Quatre verres d'eau, c'est la règle."]) {
    assertEquals(acceptComposedRecap(text, f, minor).ok, false, text);
  }
  // Et sans le chiffre, la pratique passe: on retire la dose, pas la voix.
  assertEquals(
    acceptComposedRecap("Yoghurt ticked off. Water across the day is the one to hold.", f, minor).ok,
    true,
  );
});

Deno.test("le bloc de la pratique entre dans le prompt, et la règle de question suit", () => {
  const p = injection({ mode: "ask" });
  const prompt = buildRecapSystemPrompt({ doctrineBlock: "DOCTRINE", facts: facts(), practice: p });
  assert(prompt.includes(p.block), prompt);
  assert(prompt.includes("The ONLY question you may ask"), prompt);
  assert(!prompt.includes("- Ask NOTHING."), prompt);
  // En mode rappel, l'interdiction d'origine revient MOT POUR MOT.
  const remind = buildRecapSystemPrompt({ doctrineBlock: "DOCTRINE", facts: facts(), practice: injection() });
  assert(remind.includes("- Ask NOTHING. No question of any kind, not even a rhetorical one."), remind);
  // Le bloc reste SOUS les faits et AU-DESSUS de la doctrine: le fait ouvre, la
  // pratique suit, la voix enveloppe.
  assert(prompt.indexOf(p.block) > prompt.indexOf("WHAT YOU KNOW"), "la pratique passe après les faits");
  assert(prompt.indexOf(p.block) < prompt.indexOf("THE COACH'S METHOD"), "la pratique passe avant la doctrine");
});

// ---------------------------------------------------------------------------
// FF-029 — REVUE ADVERSARIALE: CE QUE LA CEINTURE NE VOIT PAS, ET LE STREAK
// ---------------------------------------------------------------------------

Deno.test("🔴 ADVERSARIAL: un chiffre INVENTÉ chez un mineur n'est PAS retenu", () => {
  // HYPOTHÈSE ÉCRITE AVANT LE TEST: `minor_quantity` n'interdit QUE le `target`
  // de la pratique. Un modèle qui écrirait « eight glasses » là où le coach a
  // écrit « 4 » sortirait un chiffre que RIEN ne justifie — et « glasses »
  // n'étant pas un nom comptable d'`allowedNumbers`, la seconde ceinture ne
  // regarde pas non plus.
  //
  // MESURÉ: l'hypothèse est VRAIE. Ce test PINNE le trou plutôt que de le
  // cacher — il échouera le jour où quelqu'un le referme, ce qui est le signal
  // voulu. Ce qui le rend supportable aujourd'hui: le prompt du mineur ne
  // contient AUCUN chiffre (`redactQuantities` retire le label ET le brief), et
  // le run réel sur sept soirs n'a produit aucun chiffre inventé. Ce n'est pas
  // une garde, c'est une absence d'occasion.
  const f = facts();
  const minor = injection({ numbers: [], forbiddenNumbers: [4] });
  const invented = acceptComposedRecap(
    "Yoghurt ticked off. Water across the day — eight glasses.",
    f,
    minor,
  );
  assertEquals(invented.ok, true, "trou connu: seul le target est interdit");
});

Deno.test("la série et le score ne peuvent pas entrer dans le message du soir", () => {
  // §9 de FF-029, « la gamification rampante »: le premier « 5 jours de suite »
  // réintroduit `streak_display`, qui est une surface SUPPRIMÉE. Deux ceintures
  // se relaient ici, et aucune n'est une consigne de prompt.
  const f = facts();
  const p = injection();
  for (
    const text of [
      // `invented_number`: 5 n'est aucun des faits du jour.
      "Yoghurt ticked off. That is 5 days in a row on the water.",
      // `qualifies_the_day`: le verdict, quelle que soit la formulation.
      "Yoghurt ticked off. Great job on the water this week.",
      "Yaourt coché. Bien joué, continue comme ça.",
    ]
  ) {
    assertEquals(acceptComposedRecap(text, f, p).ok, false, text);
  }
});
