/**
 * FF-013 — lire au lieu de redemander.
 *
 * Deux moitiés, et l'ORDRE entre elles est le sujet de la fiche: on charge la
 * matière, et alors seulement on interdit de la demander. Une interdiction
 * seule est un correctif prompt-only, et ce dépôt a mesuré qu'ils régressent.
 *
 * Chaque garde est vérifiée dans les DEUX directions — ce qui doit être là, et
 * ce qui ne doit jamais l'être.
 */
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { type CitablePulse, pulseContextBlock } from "./daily_pulse.ts";
import {
  loadLatestPulse,
  PULSE_CITABLE_LOOKBACK_DAYS,
} from "./daily_pulse_io.ts";

const USER = "33333333-3333-4333-8333-333333333333";

function tap(over: Partial<CitablePulse> = {}): CitablePulse {
  return {
    localDate: "2026-08-07",
    level: "hard",
    axis: "hunger",
    daysAgo: 1,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// LA MATIÈRE — la moitié qui fait le travail
// ---------------------------------------------------------------------------

Deno.test("le tap est CITÉ, avec son niveau et son axe", () => {
  const block = pulseContextBlock(tap(), false);
  assertStringIncludes(block, "Rough");
  assertStringIncludes(block, "hunger");
});

Deno.test("R3 — CE QUI EST CITÉ EST DATÉ, sans exception", () => {
  // « Tu as tapé Rough » sans date laisse croire que c'est d'aujourd'hui, et
  // l'agent aurait l'air de savoir ce qu'il ne sait pas.
  for (const daysAgo of [0, 1, 2, 5, 7]) {
    const block = pulseContextBlock(tap({ daysAgo, localDate: "2026-08-03" }), false);
    assertStringIncludes(block, "2026-08-03");
  }
  // Hier soir est nommé « hier soir » ET porte quand même sa date.
  const yesterday = pulseContextBlock(tap({ daysAgo: 1 }), false);
  assertStringIncludes(yesterday, "yesterday evening");
  assertStringIncludes(yesterday, "2026-08-07");
});

Deno.test("un tap SANS axe se cite quand même — le niveau est un fait", () => {
  const block = pulseContextBlock(tap({ level: "good", axis: null }), false);
  assertStringIncludes(block, "Good");
  // Aucun axe inventé.
  assert(!/energy|hunger|sleep.*gave way/.test(block.split("HARD RULE")[0]));
});

// ---------------------------------------------------------------------------
// L'INTERDICTION — la moitié qui ferme la porte de sortie
// ---------------------------------------------------------------------------

Deno.test("R1 — l'interdiction de DEMANDER est là, avec ou sans matière", () => {
  for (const pulse of [tap(), null]) {
    const block = pulseContextBlock(pulse, false);
    assertStringIncludes(block, "NEVER ask");
    assertStringIncludes(block, "energy");
    assertStringIncludes(block, "sleep");
    assertStringIncludes(block, "appetite");
  }
});

Deno.test("FF-012 — l'interdiction de RÉCLAMER UN REPAS vit dans ce bloc", () => {
  // Elle est ici et pas dans le prompt du compagnon: celui-ci est PARTAGÉ avec
  // la branche legacy grand public, qui n'a pas de repas — et son corps FR
  // était à treize caractères de son plafond de 13 000.
  for (const pulse of [tap(), null]) {
    const block = pulseContextBlock(pulse, false);
    assertStringIncludes(block, "NEVER ask what they ate");
    assertStringIncludes(block, "never collect");
  }
});

Deno.test("R4 — aucune moyenne, aucune tendance, aucune série", () => {
  const block = pulseContextBlock(tap(), false);
  assertStringIncludes(block, "Never average");
  assertStringIncludes(block, "trend");
  assertStringIncludes(block, "streak");
});

Deno.test("R5 — UN SILENCE N'EST JAMAIS UNE BONNE JOURNÉE", () => {
  const block = pulseContextBlock(null, false);
  assertStringIncludes(block, "ABSENCE OF DATA");
  assertStringIncludes(block, "never imply the day went well");
});

Deno.test("sans tap, le bloc NE DIT PAS que l'élève n'a rien tapé à l'agent", () => {
  // Le silence n'est pas un sujet (FF-013 §7). Un bloc qui décrit son propre
  // état interne finit par le faire ressortir dans la bouche de l'agent — la
  // leçon de `NO_COACH_METHOD_BLOCK`, dont le titre sortait mot pour mot.
  const block = pulseContextBlock(null, false);
  assertStringIncludes(block, "never mention that they have not tapped");
});

Deno.test("R6 — ce qui est dit spontanément est du CONTEXTE, pas une saisie", () => {
  const block = pulseContextBlock(tap(), false);
  assertStringIncludes(block, "records nothing");
});

Deno.test("l'élève qui contredit son tap a raison MAINTENANT", () => {
  const block = pulseContextBlock(tap(), false);
  assertStringIncludes(block, "believe what they are telling you");
  assertStringIncludes(block, "Do not correct the record");
});

Deno.test("les six axes du dimanche ne sont annoncés QUE s'ils sont là", () => {
  assertStringIncludes(pulseContextBlock(tap(), true), "1-to-5 ratings");
  assert(!pulseContextBlock(tap(), false).includes("1-to-5 ratings"));
});

// ---------------------------------------------------------------------------
// R7 — LA MATIÈRE ENTRE BORNÉE
// ---------------------------------------------------------------------------

Deno.test("R7 — le bloc reste court: le prompt tronque par la queue", () => {
  // Une semaine de taps pousserait le bloc doctrine dehors. On en cite UN.
  //
  // La borne est passée de 1 400 à 1 700 avec FF-012: l'interdiction de
  // solliciter un repas a rejoint ce bloc plutôt que le prompt PARTAGÉ du
  // compagnon, dont le corps FR était à treize caractères de son plafond. Le
  // pin reste un pin — il refuse toujours qu'on empile ici.
  const block = pulseContextBlock(tap(), true);
  assert(
    block.length < 1700,
    `le bloc fait ${block.length} caractères — il doit rester sous 1 700`,
  );
  // Un seul tap cité, jamais une liste.
  assertEquals(block.split("Their last evening check-in").length - 1, 1);
});

// ---------------------------------------------------------------------------
// LE CHARGEUR
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function stubDb(rows: Row[], opts: { fail?: boolean } = {}) {
  const filters: Array<[string, string, unknown]> = [];
  // deno-lint-ignore no-explicit-any
  const api: any = {
    select: () => api,
    order: () => api,
    limit: () => api,
    eq(c: string, v: unknown) {
      filters.push(["eq", c, v]);
      return api;
    },
    gte(c: string, v: unknown) {
      filters.push(["gte", c, v]);
      return api;
    },
    lte(c: string, v: unknown) {
      filters.push(["lte", c, v]);
      return api;
    },
    // deno-lint-ignore no-explicit-any
    then(resolve: (v: any) => unknown) {
      if (opts.fail) {
        return Promise.resolve({ data: null, error: { message: "boom" } }).then(resolve);
      }
      const kept = rows.filter((row) =>
        filters.every(([op, column, value]) => {
          const actual = String(row[column] ?? "");
          if (op === "eq") return actual === String(value ?? "");
          if (op === "gte") return actual >= String(value ?? "");
          if (op === "lte") return actual <= String(value ?? "");
          return true;
        })
      ).sort((a, b) =>
        String(b.local_date ?? "").localeCompare(String(a.local_date ?? ""))
      );
      return Promise.resolve({ data: kept, error: null }).then(resolve);
    },
  };
  return { from: () => api, filters };
}

Deno.test("le chargeur rend le tap le PLUS RÉCENT, daté", async () => {
  const db = stubDb([
    { user_id: USER, local_date: "2026-08-03", overall: "good", axis: null },
    { user_id: USER, local_date: "2026-08-07", overall: "hard", axis: "hunger" },
  ]);
  const found = await loadLatestPulse(db, { userId: USER, localDate: "2026-08-08" });
  assertEquals(found?.localDate, "2026-08-07");
  assertEquals(found?.level, "hard");
  assertEquals(found?.axis, "hunger");
  assertEquals(found?.daysAgo, 1);
});

Deno.test("la fenêtre est BORNÉE — un tap trop vieux n'est pas cité", async () => {
  assertEquals(PULSE_CITABLE_LOOKBACK_DAYS, 7);
  const db = stubDb([
    { user_id: USER, local_date: "2026-07-20", overall: "hard", axis: "sleep" },
  ]);
  assertEquals(
    await loadLatestPulse(db, { userId: USER, localDate: "2026-08-08" }),
    null,
  );
});

Deno.test("UNE PANNE REND null, jamais une journée calme", async () => {
  const db = stubDb([], { fail: true });
  assertEquals(
    await loadLatestPulse(db, { userId: USER, localDate: "2026-08-08" }),
    null,
  );
});

Deno.test("un niveau hors vocabulaire n'est pas cité — jamais coercé", async () => {
  const db = stubDb([
    { user_id: USER, local_date: "2026-08-07", overall: "excellent", axis: null },
  ]);
  assertEquals(
    await loadLatestPulse(db, { userId: USER, localDate: "2026-08-08" }),
    null,
  );
});

Deno.test("sans date locale, on ne va rien chercher", async () => {
  const db = stubDb([
    { user_id: USER, local_date: "2026-08-07", overall: "hard", axis: null },
  ]);
  assertEquals(await loadLatestPulse(db, { userId: USER, localDate: "" }), null);
});
