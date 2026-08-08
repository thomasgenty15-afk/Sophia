import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  countDailyAsks,
  DAILY_ASK_BUDGET,
  DAILY_ASK_KINDS,
  DAILY_ASK_LEDGER_TABLE,
  hasEverAsked,
  recordDailyAsk,
} from "./daily_ask_budget.ts";
import {
  countMealPrecisionQuestionsToday,
  recordMealPrecisionQuestion,
} from "./meal_precision_cap.ts";

// ---------------------------------------------------------------------------
// Un faux client, réduit à ce que le module appelle réellement
// ---------------------------------------------------------------------------

type Recorded = { table: string; payload: Record<string, unknown> };

function fakeDb(opts: {
  count?: number;
  countError?: string;
  countThrows?: boolean;
  insertError?: { code?: string; message: string };
  insertThrows?: boolean;
  recorded?: Recorded[];
  filters?: Array<[string, unknown]>;
  // deno-lint-ignore no-explicit-any
}): any {
  return {
    from(table: string) {
      const chain = {
        select(_cols: string, _opts?: unknown) {
          return chain;
        },
        eq(col: string, value: unknown) {
          opts.filters?.push([col, value]);
          return chain;
        },
        insert(payload: Record<string, unknown>) {
          opts.recorded?.push({ table, payload });
          return {
            select() {
              return {
                single() {
                  if (opts.insertThrows) throw new Error("boom");
                  return Promise.resolve({
                    error: opts.insertError ?? null,
                    data: opts.insertError ? null : { id: "row-1" },
                  });
                },
              };
            },
          };
        },
        then(
          resolve: (v: unknown) => unknown,
          reject: (e: unknown) => unknown,
        ) {
          if (opts.countThrows) return Promise.reject(new Error("reset")).then(resolve, reject);
          return Promise.resolve({
            count: opts.count ?? 0,
            error: opts.countError ? { message: opts.countError } : null,
          }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

// ---------------------------------------------------------------------------
// Le contrat de la table et des genres
// ---------------------------------------------------------------------------

Deno.test("le plafond est UN, et la table est celle du repas déclaré", () => {
  assertEquals(DAILY_ASK_BUDGET, 1);
  // Le nom physique est historique — et ça DOIT rester vrai: le jour où
  // quelqu'un crée une seconde table, ce test tombe et la question se pose.
  assertEquals(DAILY_ASK_LEDGER_TABLE, "meal_precision_questions");
});

Deno.test("les quatre genres sont là, et la liste est fermée", () => {
  // Miroir EXACT du CHECK `meal_precision_questions_ask_kind_check`
  // (migration 20260808190100). Un genre ajouté ici sans l'être en base est
  // refusé à l'écriture au runtime; ce test le dit avant.
  assertEquals([...DAILY_ASK_KINDS], [
    "meal_precision_question",
    "photo_invitation",
    "daily_recommendation",
    "practice_question",
  ]);
});

// ---------------------------------------------------------------------------
// La lecture
// ---------------------------------------------------------------------------

Deno.test("le compte du jour est rendu tel quel", async () => {
  const result = await countDailyAsks(fakeDb({ count: 0 }), {
    userId: "u-1",
    localDate: "2026-08-08",
  });
  assertEquals(result, { count: 0, reason: "counted" });
});

Deno.test("une lecture en échec FERME le budget, elle ne l'ouvre pas", async () => {
  const result = await countDailyAsks(fakeDb({ countError: "permission denied" }), {
    userId: "u-1",
    localDate: "2026-08-08",
  });
  assertEquals(result.count, DAILY_ASK_BUDGET);
  assertEquals(result.reason, "read_failed");
});

Deno.test("une exception de transport ferme aussi", async () => {
  const result = await countDailyAsks(fakeDb({ countThrows: true }), {
    userId: "u-1",
    localDate: "2026-08-08",
  });
  assertEquals(result.count, DAILY_ASK_BUDGET);
  assertEquals(result.reason, "read_failed");
});

Deno.test("sans journée locale, il n'y a pas de plafond calculable: on ferme", async () => {
  for (const localDate of [null, undefined, "", "   "]) {
    const result = await countDailyAsks(fakeDb({ count: 0 }), {
      userId: "u-1",
      localDate,
    });
    assertEquals(result.reason, "missing_local_date", String(localDate));
    assertEquals(result.count, DAILY_ASK_BUDGET, String(localDate));
  }
});

Deno.test("le compte ignore le GENRE: une invitation ferme une question", async () => {
  const filters: Array<[string, unknown]> = [];
  await countDailyAsks(fakeDb({ count: 1, filters }), {
    userId: "u-1",
    localDate: "2026-08-08",
  });
  // Deux filtres et deux seulement: l'élève et le jour. Un filtre sur
  // `ask_kind` ici rendrait le compteur POUR CHAQUE surface — soit trois
  // demandes par jour, obtenues en respectant trois fois la règle.
  assertEquals(filters.map(([c]) => c), ["user_id", "local_date"]);
});

// ---------------------------------------------------------------------------
// Le « déjà dit une fois par personne »
// ---------------------------------------------------------------------------

Deno.test("`hasEverAsked` interroge le genre, sans aucune date", async () => {
  const filters: Array<[string, unknown]> = [];
  const result = await hasEverAsked(fakeDb({ count: 2, filters }), {
    userId: "u-1",
    kind: "photo_invitation",
  });
  assertEquals(result, { ever: true, reason: "counted" });
  assertEquals(filters, [["user_id", "u-1"], ["ask_kind", "photo_invitation"]]);
});

Deno.test("jamais invitée: `ever` est faux, et la ligne d'éducation peut partir", async () => {
  const result = await hasEverAsked(fakeDb({ count: 0 }), {
    userId: "u-1",
    kind: "photo_invitation",
  });
  assertEquals(result.ever, false);
});

Deno.test("une lecture en échec rend `ever: true` — le silence, jamais le sermon", async () => {
  const result = await hasEverAsked(fakeDb({ countError: "down" }), {
    userId: "u-1",
    kind: "photo_invitation",
  });
  assertEquals(result, { ever: true, reason: "read_failed" });
});

// ---------------------------------------------------------------------------
// L'écriture
// ---------------------------------------------------------------------------

Deno.test("la demande est inscrite avec son genre, son canal et son texte", async () => {
  const recorded: Recorded[] = [];
  const result = await recordDailyAsk(fakeDb({ recorded }), {
    userId: "u-1",
    localDate: "2026-08-08",
    kind: "photo_invitation",
    source: "chat",
    axis: null,
    text: "Si tu as une photo, envoie-la — ça aide le suivi.",
    protocolEventId: "evt-1",
    askedForMessageId: "msg-1",
  });
  assertEquals(result, { ok: true, alreadyRecorded: false });
  assertEquals(recorded.length, 1);
  assertEquals(recorded[0].table, DAILY_ASK_LEDGER_TABLE);
  assertEquals(recorded[0].payload.ask_kind, "photo_invitation");
  assertEquals(recorded[0].payload.axis, null);
  assertEquals(recorded[0].payload.source, "chat");
  assertEquals(
    recorded[0].payload.question,
    "Si tu as une photo, envoie-la — ça aide le suivi.",
  );
});

Deno.test("un rejeu du même message ne consomme pas une seconde place", async () => {
  const result = await recordDailyAsk(
    fakeDb({ insertError: { code: "23505", message: "duplicate" } }),
    {
      userId: "u-1",
      localDate: "2026-08-08",
      kind: "photo_invitation",
      source: "chat",
      axis: null,
      text: "x",
      protocolEventId: null,
      askedForMessageId: "msg-1",
    },
  );
  assertEquals(result, { ok: true, alreadyRecorded: true });
});

Deno.test("une écriture réellement en échec est dite, jamais avalée", async () => {
  const result = await recordDailyAsk(
    fakeDb({ insertError: { code: "42501", message: "permission denied" } }),
    {
      userId: "u-1",
      localDate: "2026-08-08",
      kind: "daily_recommendation",
      source: "chat",
      axis: null,
      text: "x",
      protocolEventId: null,
      askedForMessageId: "msg-1",
    },
  );
  assertEquals(result.ok, false);
  assert(String(result.reason).includes("permission denied"));
});

Deno.test("une exception à l'écriture ne jette pas dans le tour", async () => {
  const result = await recordDailyAsk(fakeDb({ insertThrows: true }), {
    userId: "u-1",
    localDate: "2026-08-08",
    kind: "photo_invitation",
    source: "chat",
    axis: null,
    text: "x",
    protocolEventId: null,
    askedForMessageId: "msg-1",
  });
  assertEquals(result.ok, false);
});

// ---------------------------------------------------------------------------
// L'ADAPTATEUR de la question de précision — il doit écrire dans LE MÊME ledger
// ---------------------------------------------------------------------------

Deno.test("la question de précision passe par le compteur commun", async () => {
  const recorded: Recorded[] = [];
  await recordMealPrecisionQuestion(fakeDb({ recorded }), {
    userId: "u-1",
    localDate: "2026-08-08",
    source: "text",
    axis: "composition",
    question: "What was in it?",
    protocolEventId: "evt-1",
    askedForMessageId: "msg-9",
  });
  assertEquals(recorded[0].table, DAILY_ASK_LEDGER_TABLE);
  assertEquals(recorded[0].payload.ask_kind, "meal_precision_question");
  assertEquals(recorded[0].payload.axis, "composition");
});

Deno.test("et son compte est celui de TOUTES les surfaces", async () => {
  const filters: Array<[string, unknown]> = [];
  const result = await countMealPrecisionQuestionsToday(
    fakeDb({ count: 1, filters }),
    { userId: "u-1", localDate: "2026-08-08" },
  );
  assertEquals(result.count, 1);
  assertEquals(filters.map(([c]) => c), ["user_id", "local_date"]);
});
