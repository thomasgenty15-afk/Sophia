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
    const verdict = acceptComposedRecap(text, f);
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
    const v = acceptComposedRecap(text, f);
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
    const v = acceptComposedRecap(text, f);
    assertEquals(v.ok, true, `${text} -> ${v.ok ? "" : `${v.reason}:${v.detail}`}`);
  }
});

Deno.test("a number that was not given is a number that was invented", () => {
  const f = facts({ tickedCount: 2, plannedCount: 4, photoCount: 1 });
  // 3 is in no fact: not the ticks, not the plan, not the photos.
  const v = acceptComposedRecap("3 of the 4 dishes went down today.", f);
  assertEquals(v.ok, false);
  if (!v.ok) assertEquals(v.reason, "invented_number");

  // A streak is the classic confabulation, and it is refused for the same
  // reason: no fact carries it.
  const s = acceptComposedRecap("Yoghurt and chicken ticked — 6 days running now.", f);
  assertEquals(s.ok, false);
  if (!s.ok) assertEquals(s.reason, "invented_number");
});

Deno.test("...AND ITS DISARMING CONDITION: the given numbers pass, and pronouns are not counts", () => {
  const f = facts({ tickedCount: 2, plannedCount: 4, photoCount: 1 });
  assertEquals(allowedNumbers(f), new Set([2, 4, 1]));

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
    const v = acceptComposedRecap(text, f);
    assertEquals(v.ok, true, `${text} -> ${v.ok ? "" : `${v.reason}:${v.detail}`}`);
  }
});

Deno.test("the belt is stateless between texts (global regex lastIndex)", () => {
  // A global regex keeps `lastIndex` between calls. Without the reset, the
  // second text judged would be scanned from the middle of the first — a belt
  // that passes everything after its first bite.
  const f = facts();
  const bad = "3 of the 9 dishes went down.";
  assertEquals(acceptComposedRecap(bad, f).ok, false);
  assertEquals(acceptComposedRecap(bad, f).ok, false);
  assertEquals(acceptComposedRecap(bad, f).ok, false);
});

Deno.test("the recap asks NOTHING", () => {
  const f = facts();
  // On the days the question is not due there is no button to answer with; on
  // the days it is, this would be a second question. Either way it is wrong.
  const v = acceptComposedRecap("Yoghurt and chicken ticked off. How did that feel?", f);
  assertEquals(v.ok, false);
  if (!v.ok) assertEquals(v.reason, "asks_a_question");
});

Deno.test("length, sentence count and prompt artefacts are refused", () => {
  const f = facts();
  const long = acceptComposedRecap("x".repeat(RECAP_MAX_CHARS + 1), f);
  assertEquals(long.ok, false);
  if (!long.ok) assertEquals(long.reason, "too_long");

  const chatty = acceptComposedRecap("Yoghurt in. Chicken in. Plan half done.", f);
  assertEquals(chatty.ok, false);
  if (!chatty.ok) assertEquals(chatty.reason, "too_many_sentences");

  const md = acceptComposedRecap("**Yoghurt** and chicken ticked off.", f);
  assertEquals(md.ok, false);
  if (!md.ok) assertEquals(md.reason, "prompt_artefact");

  const empty = acceptComposedRecap("   ", f);
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
  const prompt = buildRecapSystemPrompt({ doctrineBlock: "DOCTRINE HERE", facts: facts() });
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
  assert(allowedNumbers(mixed).has(2), "le numérateur du ratio doit être autorisé");
  assert(allowedNumbers(mixed).has(5), "le total des coches reste autorisé");
  assert(allowedNumbers(mixed).has(3), "le dénominateur reste autorisé");
});
