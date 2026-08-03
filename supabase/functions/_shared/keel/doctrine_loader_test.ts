// PIVOT NUTRITION §3.3 — doctrine_loader.ts.
//
// The test that carries the failure arbitration:
//   * "a failed load degrades the answer, never its authority"
//     -- refusing to answer breaks the product for the student; answering
//        normally turns the agent back into a generic assistant that can
//        contradict the coach. Neither. A prudence block, and a reason code.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  doctrineBlockFor,
  FALLBACK_PRUDENCE_BLOCK,
  loadPublishedDoctrine,
} from "./doctrine_loader.ts";

type Outcome = { data?: unknown; error?: unknown; throws?: boolean };

/**
 * Fake matching the chain the loader uses:
 *   from(t).select(c).eq(a,b)[.eq|.not](...).limit(n).maybeSingle()
 */
function fakeDb(byTable: Record<string, Outcome>) {
  const calls: string[] = [];
  const chain = (table: string) => {
    const outcome = byTable[table] ?? { data: null };
    const node: Record<string, unknown> = {
      eq: () => node,
      not: () => node,
      order: () => node,
      limit: () => node,
      maybeSingle: () => {
        calls.push(table);
        if (outcome.throws) throw new Error("connection reset");
        return Promise.resolve({
          data: outcome.data ?? null,
          error: outcome.error ?? null,
        });
      },
    };
    return node;
  };
  return {
    db: { from: (table: string) => ({ select: () => chain(table) }) },
    calls,
  };
}

const DOCTRINE_ROW = {
  coach_id: "coach-1",
  version: 3,
  beliefs: [{ claim: "Intermittent fasting is the backbone" }],
  forbidden: [{ token: "six_small_meals", surface_forms: ["6 petits repas"] }],
  vocabulary: [],
  arbitrations: [],
  voice: { address: "tu", length: "short" },
  content_locale: "fr-FR",
  published_at: "2026-08-01T10:00:00Z",
};

Deno.test("loads the published doctrine of the student's live coach", async () => {
  const { db } = fakeDb({
    coach_clients: { data: { coach_id: "coach-1" } },
    coach_doctrines: { data: DOCTRINE_ROW },
  });
  const loaded = await loadPublishedDoctrine(db, "student-1");
  assertEquals(loaded.reason, "loaded");
  assertEquals(loaded.coachId, "coach-1");
  assertEquals(loaded.doctrine?.forbidden[0].token, "six_small_meals");
  assert(loaded.compiled?.text.includes("six_small_meals"));
  assert(loaded.compiled?.hash);
  // And the injected block IS the doctrine, not the fallback.
  assertEquals(doctrineBlockFor(loaded), loaded.compiled?.text);
});

Deno.test("a failed load degrades the answer, never its authority", () => {
  // The block must instruct the model to defer rather than to invent a method.
  // An EMPTY block would be filled with the model's general nutrition culture,
  // which is exactly the voice the product does not sell.
  assert(FALLBACK_PRUDENCE_BLOCK.includes("Do NOT give prescriptive nutrition advice"));
  assert(FALLBACK_PRUDENCE_BLOCK.includes("coach's call"));
  assert(FALLBACK_PRUDENCE_BLOCK.trim().length > 0);
});

Deno.test("every failure mode is NAMED, and all inject the prudence block", async () => {
  const cases: Array<[string, Record<string, Outcome>, string]> = [
    ["no_coach", { coach_clients: { data: null } }, "no_coach"],
    [
      "coach lookup throws",
      { coach_clients: { throws: true } },
      "load_failed",
    ],
    [
      "coach lookup errors",
      { coach_clients: { error: { message: "boom" } } },
      "load_failed",
    ],
    [
      "no published doctrine",
      { coach_clients: { data: { coach_id: "c" } }, coach_doctrines: { data: null } },
      "no_published_doctrine",
    ],
    [
      "doctrine load throws",
      { coach_clients: { data: { coach_id: "c" } }, coach_doctrines: { throws: true } },
      "load_failed",
    ],
  ];
  for (const [label, tables, expected] of cases) {
    const { db } = fakeDb(tables);
    const loaded = await loadPublishedDoctrine(db, "student-1");
    assertEquals(loaded.reason, expected, label);
    assertEquals(doctrineBlockFor(loaded), FALLBACK_PRUDENCE_BLOCK, label);
    // No half-loaded state ever escapes.
    assertEquals(loaded.compiled?.text ?? null, null, label);
  }
});

Deno.test("a published-but-EMPTY doctrine is not reported as loaded", async () => {
  // A real state: the coach clicked publish on a blank form. Reporting it as
  // 'loaded' would inject an empty block, which is the one thing the fallback
  // exists to prevent.
  const { db } = fakeDb({
    coach_clients: { data: { coach_id: "coach-1" } },
    coach_doctrines: {
      data: { ...DOCTRINE_ROW, beliefs: [], forbidden: [], voice: {} },
    },
  });
  const loaded = await loadPublishedDoctrine(db, "student-1");
  assertEquals(loaded.reason, "empty_doctrine");
  assertEquals(doctrineBlockFor(loaded), FALLBACK_PRUDENCE_BLOCK);
});

Deno.test("an empty student id never reaches the database", async () => {
  const { db, calls } = fakeDb({ coach_clients: { data: { coach_id: "c" } } });
  const loaded = await loadPublishedDoctrine(db, "   ");
  assertEquals(loaded.reason, "no_coach");
  assertEquals(calls, []);
});

Deno.test("malformed doctrine entries are dropped AND reported", async () => {
  // The issues are the coach's feedback loop: a rule that could not be
  // enforced must be visible to the person who wrote it.
  const { db } = fakeDb({
    coach_clients: { data: { coach_id: "coach-1" } },
    coach_doctrines: {
      data: {
        ...DOCTRINE_ROW,
        forbidden: [{ token: "" }, { token: "keto" }],
      },
    },
  });
  const loaded = await loadPublishedDoctrine(db, "student-1");
  assertEquals(loaded.doctrine?.forbidden.length, 1);
  assert(loaded.issues.some((i) => i.includes("unenforceable")));
});
