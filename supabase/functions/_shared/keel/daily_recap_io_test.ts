// PIVOT NUTRITION — le fait du soir: daily_recap_io.ts.
//
// The test that carries the product decision:
//   * "an unreadable day is an EMPTY day, never a guessed one"
//     -- the worst case here is an evening with no opening: the student gets the
//        question alone, or nothing. The worst case of the alternative is a
//        false count in the bubble, and a false count is indistinguishable from
//        a true one for both the student and the coach.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  composeRecapBody,
  loadDayFacts,
  type RecapPracticeContext,
} from "./daily_recap_io.ts";

/**
 * Le contexte nominal: adulte, pas de plancher TCA, le pulse ne demande rien.
 * Chaque champ est REQUIS — c'est la garde que ce dépôt a déjà vue désarmée par
 * un paramètre optionnel qu'aucun appelant ne passait.
 */
const PRACTICE_CONTEXT: RecapPracticeContext = {
  localDate: "2026-08-11",
  isMinor: false,
  restrictionFlag: false,
  pulseAsks: false,
};

type EventRow = {
  source: string;
  student_note?: string | null;
  source_message_id?: string | null;
};

/**
 * A fake covering the three chains reached from `loadDayFacts`:
 *   protocol_events         select .eq .eq .is                  -> await
 *   food_items              select                              -> await
 *   student_generated_meals select .eq .order .limit .maybeSingle
 */
function factsDb(args: {
  events?: EventRow[];
  meal?: Record<string, unknown> | null;
  eventsError?: boolean;
}) {
  const seen: Array<[string, unknown]> = [];

  const events = () => {
    const node: Record<string, unknown> = {
      eq: (c: string, v: unknown) => {
        seen.push([c, v]);
        return node;
      },
      is: (c: string, v: unknown) => {
        seen.push([c, v]);
        return node;
      },
      then: (r: (v: unknown) => unknown) =>
        r(
          args.eventsError
            ? { data: null, error: { message: "boom" } }
            : { data: args.events ?? [], error: null },
        ),
    };
    return node;
  };

  const meals = () => {
    const node: Record<string, unknown> = {
      eq: () => node,
      order: () => node,
      limit: () => node,
      maybeSingle: () => ({
        then: (r: (v: unknown) => unknown) => r({ data: args.meal ?? null, error: null }),
      }),
    };
    return node;
  };

  const catalogue = () => ({
    then: (r: (v: unknown) => unknown) =>
      r({ data: [{ slug: "oats", label: "Oats", food_group_ref: "grain" }], error: null }),
  });

  return {
    db: {
      from: (table: string) => ({
        select: () => {
          if (table === "protocol_events") return events();
          if (table === "food_items") return catalogue();
          return meals();
        },
      }),
    },
    seen,
  };
}

const ARGS = { userId: "u1", localDate: "2026-08-10" };

const TICK = (title: string, n: number): EventRow => ({
  source: "quick_tap",
  student_note: title,
  source_message_id: `meal_tick:m1:${n}`,
});

Deno.test("ticks and photos are counted, and nothing else is", async () => {
  const { db } = factsDb({
    events: [
      TICK("Oats and berries", 0),
      TICK("Chicken bowl", 2),
      { source: "photo", student_note: null, source_message_id: null },
      { source: "photo", student_note: null, source_message_id: null },
      // A text log is neither a tick nor a photo: it is not this message's
      // ground, and inventing a third category here would put a fact in the
      // bubble that no belt was written for.
      { source: "text", student_note: "had soup", source_message_id: null },
      // A `quick_tap` that is NOT a meal tick — the source is shared with other
      // gestures, so the key prefix is what identifies a ticked dish.
      { source: "quick_tap", student_note: "x", source_message_id: "other:thing" },
    ],
  });
  const facts = await loadDayFacts(db, ARGS);
  assertEquals(facts.tickedCount, 2);
  assertEquals(facts.tickedTitles, ["Oats and berries", "Chicken bowl"]);
  assertEquals(facts.photoCount, 2);
});

Deno.test("the un-ticked rows are excluded AT THE QUERY, not after", async () => {
  // `protocol_events` is append-only: un-ticking marks the row
  // `disqualified_reason='food_not_eaten'`, it does not delete it. Forgetting
  // that filter would name a dish the student had just explicitly withdrawn —
  // the one thing that would make the evening message obviously wrong to them.
  const { db, seen } = factsDb({ events: [] });
  await loadDayFacts(db, ARGS);
  assert(seen.some(([c, v]) => c === "disqualified_reason" && v === null), "unticked filtered");
  // ...and the read is scoped to the student and to the day.
  assert(seen.some(([c, v]) => c === "user_id" && v === "u1"), "scoped by user");
  assert(seen.some(([c, v]) => c === "local_date" && v === "2026-08-10"), "scoped by day");
});

Deno.test("a tick with an empty title counts but is not cited", async () => {
  const { db } = factsDb({
    events: [TICK("Oats", 0), TICK("", 1), TICK("   ", 2)],
  });
  const facts = await loadDayFacts(db, ARGS);
  assertEquals(facts.tickedCount, 3, "three declared facts");
  assertEquals(facts.tickedTitles, ["Oats"], "one citable title");
});

Deno.test("an unreadable day is an EMPTY day, never a guessed one", async () => {
  const { db } = factsDb({ eventsError: true });
  const facts = await loadDayFacts(db, ARGS);
  assertEquals(facts.tickedCount, 0);
  assertEquals(facts.photoCount, 0);
  assertEquals(facts.plannedCount, 0);
});

Deno.test("no user or no date reads nothing at all", async () => {
  const { db, seen } = factsDb({ events: [TICK("Oats", 0)] });
  assertEquals((await loadDayFacts(db, { userId: "", localDate: "2026-08-10" })).tickedCount, 0);
  assertEquals((await loadDayFacts(db, { userId: "u1", localDate: "" })).tickedCount, 0);
  assertEquals(seen.length, 0, "no query is issued on an empty identity");
});

Deno.test("an unreadable composition costs the ratio, not the message", async () => {
  // The denominator is optional; the count is not. "2 ticked" stays true with
  // no plan behind it, so a broken composition read must not blank the evening.
  const { db } = factsDb({ events: [TICK("Oats", 0), TICK("Soup", 1)], meal: null });
  const facts = await loadDayFacts(db, ARGS);
  assertEquals(facts.tickedCount, 2);
  assertEquals(facts.plannedCount, 0);
});

Deno.test("an empty day never reaches the model", async () => {
  // The structural half of "a day with no fact has no opening": the composer
  // returns before doctrine, before the LLM, before anything that could be
  // tempted to fill the silence. A `db` that throws on any use proves it.
  const exploding = {
    from: () => {
      throw new Error("the composer must not read anything on an empty day");
    },
  };
  const out = await composeRecapBody(exploding, {
    userId: "u1",
    firstName: "Julie",
    facts: { tickedCount: 0, tickedForPlanCount: 0, tickedTitles: [], plannedCount: 4, photoCount: 0 },
    contentLocale: "en-US",
    practiceContext: PRACTICE_CONTEXT,
  });
  assertEquals(out.body, null);
  assertEquals(out.source, "fallback");
  assertEquals(out.reason, "no_ground");
});

Deno.test("no published doctrine means the deterministic count, not silence", async () => {
  // Same arbitration as the re-engagement composer: without a published method
  // there is no voice to carry, so paying a model call to reword a count buys
  // nothing and loses the determinism. The INFORMATION still goes out.
  // A permissive chain: every builder method returns the node, and awaiting it
  // (or `maybeSingle`/`single`) yields no row. The doctrine loader therefore
  // walks its real path and concludes "nothing published" — rather than
  // throwing on a method the fake forgot, which would make this test pass for
  // the wrong reason.
  const empty = { data: null, error: null };
  const node: Record<string, unknown> = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === "then") return (r: (v: unknown) => unknown) => r({ data: [], error: null });
      if (prop === "maybeSingle" || prop === "single") {
        return () => ({ then: (r: (v: unknown) => unknown) => r(empty) });
      }
      return () => node;
    },
  });
  const noDoctrine = { from: () => node };
  const out = await composeRecapBody(noDoctrine, {
    userId: "u1",
    firstName: "Julie",
    facts: { tickedCount: 2, tickedForPlanCount: 2, tickedTitles: ["Oats", "Soup"], plannedCount: 4, photoCount: 0 },
    contentLocale: "en-US",
    practiceContext: PRACTICE_CONTEXT,
  });
  assertEquals(out.source, "fallback");
  assert(out.reason.startsWith("no_doctrine:"), out.reason);
  assertEquals(out.body, "Ticked off today: Oats and Soup — 2 of the 4 on the plan.");
});
