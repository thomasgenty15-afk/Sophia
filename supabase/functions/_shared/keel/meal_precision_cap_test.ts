// LE PLAFOND — le compte du jour et l'inscription de la question posée.
//
// Le test qui porte la doctrine ici: « quand on ne peut pas vérifier le
// plafond, on ne pose pas la question ». Un fail-OPEN transformerait une panne
// de lecture en huit questions dans la journée, c'est-à-dire en élève qui cesse
// de déclarer ses repas.

import { assert, assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import {
  countMealPrecisionQuestionsToday,
  recordMealPrecisionQuestion,
} from "./meal_precision_cap.ts";
import { MEAL_PRECISION_DAILY_CAP } from "./meal_precision.ts";

// ---------------------------------------------------------------------------
// Un faux client, réduit aux DEUX chaînes que le module appelle vraiment.
//
// Volontairement minimal: un double qui accepte tout ne prouve rien. Celui-ci
// enregistre les filtres reçus, ce qui permet d'assurer que le compte est bien
// borné à l'élève ET à la journée locale — le jour où quelqu'un retire un
// `.eq()`, le test tombe.
// ---------------------------------------------------------------------------

type CountReply = { count: number | null; error: { message: string } | null };
type InsertReply = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

function fakeDb(replies: {
  count?: CountReply;
  countThrows?: boolean;
  insert?: InsertReply;
  insertThrows?: boolean;
}) {
  const seen = {
    table: "" as string,
    filters: [] as Array<[string, unknown]>,
    inserted: null as Record<string, unknown> | null,
  };
  const countChain = {
    eq(column: string, value: unknown) {
      seen.filters.push([column, value]);
      return this;
    },
    then(resolve: (value: CountReply) => unknown) {
      if (replies.countThrows) throw new Error("connection reset");
      return Promise.resolve(
        replies.count ?? { count: 0, error: null },
      ).then(resolve);
    },
  };
  const insertChain = {
    select() {
      return this;
    },
    single() {
      if (replies.insertThrows) throw new Error("connection reset");
      return Promise.resolve(
        replies.insert ?? { data: { id: "q-1" }, error: null },
      );
    },
  };
  const db = {
    from(table: string) {
      seen.table = table;
      return {
        select: () => countChain,
        insert: (row: Record<string, unknown>) => {
          seen.inserted = row;
          return insertChain;
        },
      };
    },
  };
  return { db: db as unknown as SupabaseClient, seen };
}

// ---------------------------------------------------------------------------
// LE COMPTE
// ---------------------------------------------------------------------------

Deno.test("le compte est borné à l'élève ET à sa journée locale", async () => {
  const { db, seen } = fakeDb({ count: { count: 1, error: null } });
  const result = await countMealPrecisionQuestionsToday(db, {
    userId: "u-1",
    localDate: "2026-08-04",
  });
  assertEquals(result.count, 1);
  assertEquals(result.reason, "counted");
  assertEquals(seen.table, "meal_precision_questions");
  assertEquals(seen.filters, [["user_id", "u-1"], ["local_date", "2026-08-04"]]);
});

Deno.test("une lecture en échec FERME le plafond, elle ne l'ouvre pas", async () => {
  const { db } = fakeDb({
    count: { count: null, error: { message: "connection terminated" } },
  });
  const result = await countMealPrecisionQuestionsToday(db, {
    userId: "u-1",
    localDate: "2026-08-04",
  });
  assertEquals(result.count, MEAL_PRECISION_DAILY_CAP);
  assertEquals(result.reason, "read_failed");
});

Deno.test("une exception de transport FERME aussi le plafond", async () => {
  const { db } = fakeDb({ countThrows: true });
  const result = await countMealPrecisionQuestionsToday(db, {
    userId: "u-1",
    localDate: "2026-08-04",
  });
  assertEquals(result.count, MEAL_PRECISION_DAILY_CAP);
  assertEquals(result.reason, "read_failed");
});

Deno.test("sans journée locale, il n'y a pas de plafond calculable: on ferme", async () => {
  for (const localDate of [null, undefined, "", "   "]) {
    const { db } = fakeDb({ count: { count: 0, error: null } });
    const result = await countMealPrecisionQuestionsToday(db, {
      userId: "u-1",
      localDate,
    });
    assertEquals(result.count, MEAL_PRECISION_DAILY_CAP, String(localDate));
    assertEquals(result.reason, "missing_local_date");
  }
});

Deno.test("zéro question posée aujourd'hui se lit zéro, pas plafond", async () => {
  const { db } = fakeDb({ count: { count: null, error: null } });
  const result = await countMealPrecisionQuestionsToday(db, {
    userId: "u-1",
    localDate: "2026-08-04",
  });
  // `count: null` sans erreur = aucune ligne. C'est 0, pas « je ne sais pas ».
  assertEquals(result.count, 0);
  assertEquals(result.reason, "counted");
});

// ---------------------------------------------------------------------------
// L'INSCRIPTION
// ---------------------------------------------------------------------------

const RECORD = {
  userId: "u-1",
  localDate: "2026-08-04",
  source: "text" as const,
  axis: "accompaniment" as const,
  question: "And what did you have with it?",
  protocolEventId: "evt-1",
  askedForMessageId: "msg-1",
};

Deno.test("la question posée est inscrite avec son texte exact", async () => {
  const { db, seen } = fakeDb({});
  const result = await recordMealPrecisionQuestion(db, RECORD);
  assertEquals(result.ok, true);
  assertEquals(result.alreadyRecorded, false);
  assertEquals(seen.inserted?.question, "And what did you have with it?");
  assertEquals(seen.inserted?.axis, "accompaniment");
  assertEquals(seen.inserted?.local_date, "2026-08-04");
  assertEquals(seen.inserted?.asked_for_message_id, "msg-1");
});

Deno.test("un rejeu du même message ne consomme pas une seconde place", async () => {
  // 23505 = unique_violation sur (user_id, asked_for_message_id). Ce n'est PAS
  // une erreur: c'est la réponse « déjà comptée », et le tour continue.
  const { db } = fakeDb({
    insert: { data: null, error: { message: "duplicate key", code: "23505" } },
  });
  const result = await recordMealPrecisionQuestion(db, RECORD);
  assertEquals(result.ok, true);
  assertEquals(result.alreadyRecorded, true);
});

Deno.test("une écriture réellement en échec est dite, jamais avalée", async () => {
  const { db } = fakeDb({
    insert: { data: null, error: { message: "permission denied", code: "42501" } },
  });
  const result = await recordMealPrecisionQuestion(db, RECORD);
  assertEquals(result.ok, false);
  assert(result.reason?.includes("permission denied"));
});

Deno.test("une exception de transport à l'écriture ne jette pas dans le tour", async () => {
  const { db } = fakeDb({ insertThrows: true });
  const result = await recordMealPrecisionQuestion(db, RECORD);
  assertEquals(result.ok, false);
  assert(result.reason !== undefined);
});
