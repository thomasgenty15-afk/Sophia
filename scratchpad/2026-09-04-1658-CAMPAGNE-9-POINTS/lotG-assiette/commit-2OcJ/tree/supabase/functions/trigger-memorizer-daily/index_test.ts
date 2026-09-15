import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  loadProcessedMessageIds,
  PROCESSED_IDS_CHUNK_SIZE,
  readableErrorMessage,
} from "./index.ts";

// Fake supabase admin qui enregistre la taille de chaque chunk passe a .in()
// et repond comme PostgREST (echec simule au-dela d'une limite d'URI).
function makeFakeAdmin(args: {
  processed_ids: string[];
  max_in_size?: number;
  chunk_sizes: number[];
}) {
  const processedSet = new Set(args.processed_ids);
  return {
    from(table: string) {
      assertEquals(table, "memory_message_processing");
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: (_column: string, ids: string[]) => {
          args.chunk_sizes.push(ids.length);
          if (args.max_in_size != null && ids.length > args.max_in_size) {
            return Promise.resolve({
              data: null,
              error: { message: "URI too long", code: "414" },
            });
          }
          return Promise.resolve({
            data: ids
              .filter((id) => processedSet.has(id))
              .map((id) => ({ message_id: id })),
            error: null,
          });
        },
      };
      return builder;
    },
  };
}

Deno.test("loadProcessedMessageIds chunks large id lists and unions results", async () => {
  const total = 519; // > volume Rose (219) qui echouait en nominal
  const ids = Array.from({ length: total }, (_, i) => `msg-${i}`);
  const processed = ids.filter((_, i) => i % 3 === 0);
  const chunkSizes: number[] = [];
  const admin = makeFakeAdmin({
    processed_ids: processed,
    max_in_size: PROCESSED_IDS_CHUNK_SIZE, // simule la limite d'URI PostgREST
    chunk_sizes: chunkSizes,
  });

  const result = await loadProcessedMessageIds({
    admin,
    user_id: "user-1",
    message_ids: ids,
  });

  assertEquals(result.size, processed.length);
  for (const id of processed) assert(result.has(id));
  // Aucun chunk ne depasse la borne, aucun id perdu entre les chunks.
  assertEquals(chunkSizes.length, Math.ceil(total / PROCESSED_IDS_CHUNK_SIZE));
  for (const size of chunkSizes) assert(size <= PROCESSED_IDS_CHUNK_SIZE);
  assertEquals(chunkSizes.reduce((a, b) => a + b, 0), total);
});

Deno.test("loadProcessedMessageIds surfaces the real PostgREST error", async () => {
  const ids = Array.from({ length: 10 }, (_, i) => `msg-${i}`);
  const admin = makeFakeAdmin({
    processed_ids: [],
    max_in_size: 5,
    chunk_sizes: [],
  });
  let thrown: unknown = null;
  try {
    // chunk_size force au-dela de la limite simulee → l'erreur reelle remonte
    await loadProcessedMessageIds({
      admin,
      user_id: "user-1",
      message_ids: ids,
      chunk_size: 10,
    });
  } catch (error) {
    thrown = error;
  }
  assert(thrown !== null);
  assertEquals(readableErrorMessage(thrown), "URI too long [414]");
});

Deno.test("loadProcessedMessageIds handles empty input without querying", async () => {
  const chunkSizes: number[] = [];
  const admin = makeFakeAdmin({ processed_ids: [], chunk_sizes: chunkSizes });
  const result = await loadProcessedMessageIds({
    admin,
    user_id: "user-1",
    message_ids: [],
  });
  assertEquals(result.size, 0);
  assertEquals(chunkSizes.length, 0);
});

Deno.test("readableErrorMessage never yields [object Object]", () => {
  assertEquals(readableErrorMessage(new Error("boom")), "boom");
  assertEquals(readableErrorMessage("plain"), "plain");
  assertEquals(
    readableErrorMessage({
      message: "URI too long",
      details: "request line too large",
      code: "414",
    }),
    "URI too long (request line too large) [414]",
  );
  assertEquals(readableErrorMessage({ foo: 1 }), '{"foo":1}');
  assertEquals(readableErrorMessage(null), "null");
  for (
    const value of [
      new Error("boom"),
      { message: "x" },
      { foo: 1 },
      null,
      undefined,
    ]
  ) {
    assert(!readableErrorMessage(value).includes("[object Object]"));
  }
});

// Fake admin pour recoverOrphanExtractionRuns: runs en memoire + chaines
// PostgREST select/delete/update minimales.
function makeOrphanFakeAdmin(state: {
  runs: Array<
    { id: string; status: string; created_at: string; metadata?: unknown }
  >;
  processing: Array<{ extraction_run_id: string; message_id: string }>;
}) {
  return {
    from(table: string) {
      if (table === "memory_extraction_runs") {
        return {
          select: () => ({
            eq: (_c1: string, _v1: string) => ({
              eq: (_c2: string, status: string) => ({
                lt: (_c3: string, cutoff: string) =>
                  Promise.resolve({
                    data: state.runs.filter((run) =>
                      run.status === status && run.created_at < cutoff
                    ),
                    error: null,
                  }),
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (_c1: string, id: string) => ({
              eq: (_c2: string, status: string) => {
                const run = state.runs.find((candidate) =>
                  candidate.id === id && candidate.status === status
                );
                if (run) Object.assign(run, patch);
                return Promise.resolve({ error: null });
              },
            }),
          }),
        };
      }
      // memory_message_processing
      return {
        delete: () => ({
          eq: (_c1: string, _v1: string) => ({
            eq: (_c2: string, runId: string) => ({
              select: () => {
                const released = state.processing.filter((row) =>
                  row.extraction_run_id === runId
                );
                state.processing = state.processing.filter((row) =>
                  row.extraction_run_id !== runId
                );
                return Promise.resolve({ data: released, error: null });
              },
            }),
          }),
        }),
      };
    },
  };
}

Deno.test("recoverOrphanExtractionRuns releases messages of stale running runs only", async () => {
  const now = new Date("2026-07-06T12:00:00.000Z");
  const state = {
    runs: [
      // Orphelin: running depuis 2h (> TTL 30 min) — le cas nina-r2/paul-r4.
      {
        id: "run-orphan",
        status: "running",
        created_at: "2026-07-06T10:00:00.000Z",
        metadata: {},
      },
      // Run running FRAIS (5 min): un batch legitime en cours, intouchable.
      {
        id: "run-fresh",
        status: "running",
        created_at: "2026-07-06T11:55:00.000Z",
        metadata: {},
      },
      // Run termine: intouchable.
      {
        id: "run-done",
        status: "completed",
        created_at: "2026-07-06T09:00:00.000Z",
        metadata: {},
      },
    ],
    processing: [
      { extraction_run_id: "run-orphan", message_id: "m1" },
      { extraction_run_id: "run-orphan", message_id: "m2" },
      { extraction_run_id: "run-fresh", message_id: "m3" },
      { extraction_run_id: "run-done", message_id: "m4" },
    ],
  };
  const { recoverOrphanExtractionRuns } = await import("./index.ts");
  const result = await recoverOrphanExtractionRuns({
    admin: makeOrphanFakeAdmin(state),
    user_id: "u",
    now,
  });

  assertEquals(result.recovered_run_ids, ["run-orphan"]);
  assertEquals(result.released_message_count, 2);
  // Les messages de l'orphelin sont liberes (re-eligibles), les autres restent.
  assertEquals(
    state.processing.map((row) => row.message_id).sort(),
    ["m3", "m4"],
  );
  // L'orphelin est finalise `failed` avec trace de reprise; le frais reste running.
  const orphan = state.runs.find((run) => run.id === "run-orphan");
  assertEquals(orphan?.status, "failed");
  assertEquals((orphan as any)?.error_message, "orphan_running_recovered");
  assertEquals(
    state.runs.find((run) => run.id === "run-fresh")?.status,
    "running",
  );
});
