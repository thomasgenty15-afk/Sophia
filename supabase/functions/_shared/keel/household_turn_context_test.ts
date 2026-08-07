/**
 * FF-010 — la lecture du foyer.
 *
 * ── LA MÉTRIQUE DONT LA CIBLE EST ZÉRO, ET QUI SE TESTE ────────────────────
 * §10 de la fiche: « Fuites de visibilité en `shared` — la seule métrique dont
 * la cible est zéro, et qui se TESTE, pas qui s'observe. » D'où le test
 * central de ce fichier: en mode `shared`, la portion d'un autre membre n'est
 * pas seulement absente de la réponse, elle est absente DU CONTEXTE. Le filtre
 * s'applique au chargement; ce qui n'entre pas dans le prompt ne peut pas en
 * sortir.
 */
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  householdContextBlock,
  type HouseholdTurnContext,
  loadHouseholdTurnContext,
} from "./household_turn_context.ts";

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CHILD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const HOUSE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const TODAY = "2026-08-05"; // un mercredi → jeton `wed`

type Tables = Record<string, Array<Record<string, unknown>>>;

/**
 * Un PostgREST en mémoire qui applique VRAIMENT ses filtres. Un faux qui les
 * ignorerait prouverait une chaîne qui n'existe pas.
 */
function stubDb(tables: Tables, roster: Array<Record<string, unknown>>, opts: {
  failOn?: string;
} = {}) {
  function builder(table: string) {
    const filters: Array<[string, string, unknown]> = [];
    const rows = tables[table] ?? [];
    const selected = () =>
      rows.filter((row) =>
        filters.every(([op, column, value]) => {
          const actual = row[column];
          if (op === "eq") return String(actual ?? "") === String(value ?? "");
          if (op === "is") return value === null ? actual == null : actual === value;
          if (op === "lte") return String(actual ?? "") <= String(value ?? "");
          if (op === "gte") return String(actual ?? "") >= String(value ?? "");
          return true;
        })
      );
    // deno-lint-ignore no-explicit-any
    const api: any = {
      select: () => api,
      order: () => api,
      limit: () => api,
      eq(c: string, v: unknown) {
        filters.push(["eq", c, v]);
        return api;
      },
      is(c: string, v: unknown) {
        filters.push(["is", c, v]);
        return api;
      },
      lte(c: string, v: unknown) {
        filters.push(["lte", c, v]);
        return api;
      },
      gte(c: string, v: unknown) {
        filters.push(["gte", c, v]);
        return api;
      },
      maybeSingle: () =>
        opts.failOn === table
          ? Promise.resolve({ data: null, error: { message: "boom" } })
          : Promise.resolve({ data: selected()[0] ?? null, error: null }),
      // deno-lint-ignore no-explicit-any
      then(resolve: (v: any) => unknown) {
        if (opts.failOn === table) {
          return Promise.resolve({ data: null, error: { message: "boom" } }).then(resolve);
        }
        return Promise.resolve({ data: selected(), error: null }).then(resolve);
      },
    };
    return api;
  }
  return {
    from: builder,
    rpc: (_name: string, _args: unknown) =>
      opts.failOn === "rpc"
        ? Promise.resolve({ data: null, error: { message: "boom" } })
        : Promise.resolve({ data: roster, error: null }),
  };
}

function rosterRow(userId: string, firstName: string, over: Record<string, unknown> = {}) {
  return {
    user_id: userId,
    first_name: firstName,
    is_minor: false,
    role: "member",
    restriction_consent_at: null,
    ...over,
  };
}

function tables(kind: "family" | "shared", over: Partial<Tables> = {}): Tables {
  return {
    household_members: [{ user_id: ME, household_id: HOUSE }],
    households: [{ id: HOUSE, kind }],
    student_generated_meals: [{
      id: "plan-1",
      household_id: HOUSE,
      retired_at: null,
      starts_on: "2026-08-03",
      ends_on: "2026-08-09",
      dishes: [
        { title: "Roast chicken bowl", slot: "dinner", day: "wed" },
        { title: "Lentil soup", slot: "dinner", day: "thu" },
      ],
      preparations: [{ title: "Roast chicken thighs", cookOn: "wed" }],
      member_portions: [
        { userId: ME, displayName: "Ana", portionNote: "larger protein share" },
        { userId: OTHER, displayName: "Marc", portionNote: "smaller starch share" },
      ],
    }],
    household_food_restrictions: [],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// LE CAS NOMINAL
// ---------------------------------------------------------------------------

Deno.test("le plat DU JOUR et la portion À MON NOM sont chargés", async () => {
  const db = stubDb(tables("family"), [
    rosterRow(ME, "Ana"),
    rosterRow(OTHER, "Marc"),
  ]);
  const ctx = await loadHouseholdTurnContext(db, { userId: ME, localDate: TODAY });
  assert(ctx);
  assertEquals(ctx.hasPlanToday, true);
  // LE JOUR COURANT SEULEMENT: le plat de jeudi n'entre pas.
  assertEquals(ctx.todayDishes.map((d) => d.title), ["Roast chicken bowl"]);
  const mine = ctx.portions.find((p) => p.isMe);
  assertEquals(mine?.firstName, "Ana");
  assertEquals(mine?.note, "larger protein share");
});

Deno.test("EN FAMILLE, les portions des autres sont visibles", async () => {
  const db = stubDb(tables("family"), [
    rosterRow(ME, "Ana"),
    rosterRow(OTHER, "Marc"),
  ]);
  const ctx = await loadHouseholdTurnContext(db, { userId: ME, localDate: TODAY });
  assertEquals(ctx?.portions.map((p) => p.firstName).sort(), ["Ana", "Marc"]);
});

// ---------------------------------------------------------------------------
// LA MÉTRIQUE DONT LA CIBLE EST ZÉRO
// ---------------------------------------------------------------------------

Deno.test("⚠️ EN COLOCATION, la portion d'un autre N'EST PAS DANS LE CONTEXTE", async () => {
  // Pas « l'agent ne la dit pas »: elle n'est pas là. C'est la seule garde qui
  // tienne — un prompt qui porte la donnée et une consigne de la taire est un
  // prompt qui la dira.
  const db = stubDb(tables("shared"), [
    rosterRow(ME, "Ana"),
    rosterRow(OTHER, "Marc"),
  ]);
  const ctx = await loadHouseholdTurnContext(db, { userId: ME, localDate: TODAY });
  assert(ctx);
  assertEquals(ctx.portions.map((p) => p.firstName), ["Ana"]);
  assertEquals(ctx.roster.find((r) => r.userId === OTHER)?.visibility, "presence_only");

  // Et la preuve qui compte vraiment: le TEXTE du bloc ne contient pas la
  // consigne de l'autre, où qu'on la cherche.
  const block = householdContextBlock(ctx);
  assertEquals(block.includes("smaller starch share"), false);
  // La présence, elle, reste — c'est ce que `presence_only` veut dire.
  assertStringIncludes(block, "Marc");
});

Deno.test("en colocation, le bloc DIT qu'il ne sait pas, sans faire mystère", async () => {
  const db = stubDb(tables("shared"), [
    rosterRow(ME, "Ana"),
    rosterRow(OTHER, "Marc"),
  ]);
  const ctx = await loadHouseholdTurnContext(db, { userId: ME, localDate: TODAY });
  const block = householdContextBlock(ctx!);
  assertStringIncludes(block, "not in your context at all");
  assertStringIncludes(block, "Say you do not know");
});

// ---------------------------------------------------------------------------
// LES MODES DE DÉFAILLANCE DE §7
// ---------------------------------------------------------------------------

Deno.test("SANS FOYER, aucun contexte — donc aucune mention (R8)", async () => {
  const db = stubDb({ household_members: [], households: [] }, []);
  assertEquals(
    await loadHouseholdTurnContext(db, { userId: ME, localDate: TODAY }),
    null,
  );
});

Deno.test("UN PLAN PÉRIMÉ HIER est traité comme ABSENT, pas comme celui d'hier", async () => {
  const db = stubDb(
    tables("family", {
      student_generated_meals: [{
        id: "plan-old",
        household_id: HOUSE,
        retired_at: null,
        starts_on: "2026-07-27",
        ends_on: "2026-08-04", // fini HIER
        dishes: [{ title: "Yesterday's stew", slot: "dinner", day: "tue" }],
        preparations: [],
        member_portions: [],
      }],
    }),
    [rosterRow(ME, "Ana")],
  );
  const ctx = await loadHouseholdTurnContext(db, { userId: ME, localDate: TODAY });
  assert(ctx);
  assertEquals(ctx.hasPlanToday, false);
  assertEquals(ctx.todayDishes, []);
});

Deno.test("UN PLAN RETIRÉ n'est pas lu", async () => {
  const db = stubDb(
    tables("family", {
      student_generated_meals: [{
        id: "plan-retired",
        household_id: HOUSE,
        retired_at: "2026-08-04T10:00:00Z",
        starts_on: "2026-08-03",
        ends_on: "2026-08-09",
        dishes: [{ title: "Replaced dish", slot: "dinner", day: "wed" }],
        preparations: [],
        member_portions: [],
      }],
    }),
    [rosterRow(ME, "Ana")],
  );
  const ctx = await loadHouseholdTurnContext(db, { userId: ME, localDate: TODAY });
  assertEquals(ctx?.hasPlanToday, false);
});

Deno.test("SANS PLAT COMPOSÉ, le bloc porte vers la composition — JAMAIS vers un tiers", async () => {
  // MODEL.md: « ton coach prépare ton plan » est FAUX, il n'existe aucun canal
  // 1:1 coach → élève. C'est la copie la plus souvent violée du produit.
  const db = stubDb(
    tables("family", { student_generated_meals: [] }),
    [rosterRow(ME, "Ana")],
  );
  const ctx = await loadHouseholdTurnContext(db, { userId: ME, localDate: TODAY });
  const block = householdContextBlock(ctx!);
  assertStringIncludes(block, "NOTHING IS COMPOSED FOR TODAY");
  assertStringIncludes(block, "they compose it themselves");
  assertStringIncludes(block, "NEVER say their coach is preparing");
  assertEquals(/wait for (your|their) coach/i.test(block), false);
});

Deno.test("UNE LECTURE EN PANNE rend null et journalise — jamais « rien de prévu »", async () => {
  for (const failOn of ["households", "rpc", "student_generated_meals"]) {
    const db = stubDb(tables("family"), [rosterRow(ME, "Ana")], { failOn });
    assertEquals(
      await loadHouseholdTurnContext(db, { userId: ME, localDate: TODAY }),
      null,
      `panne sur ${failOn}`,
    );
  }
});

Deno.test("sans date locale, on ne va rien chercher", async () => {
  const db = stubDb(tables("family"), [rosterRow(ME, "Ana")]);
  assertEquals(await loadHouseholdTurnContext(db, { userId: ME, localDate: "" }), null);
});

// ---------------------------------------------------------------------------
// LES RESTRICTIONS — attribuées, jamais justifiées
// ---------------------------------------------------------------------------

Deno.test("une restriction qui ME vise est ATTRIBUÉE et NON JUSTIFIÉE", async () => {
  const db = stubDb(
    tables("family", {
      household_food_restrictions: [
        { label: "Nutella", member_user_id: ME, created_by: OTHER, household_id: HOUSE },
      ],
    }),
    [rosterRow(ME, "Ana"), rosterRow(OTHER, "Marc", { role: "owner" })],
  );
  const ctx = await loadHouseholdTurnContext(db, { userId: ME, localDate: TODAY });
  assertEquals(ctx?.myRestrictions, [{ label: "Nutella", chosenBy: "Marc" }]);

  const block = householdContextBlock(ctx!);
  assertStringIncludes(block, "chosen by Marc");
  assertStringIncludes(block, "ATTRIBUTED and UNJUSTIFIED");
  assertStringIncludes(block, "Never give a health reason");
});

Deno.test("une restriction qui vise QUELQU'UN D'AUTRE n'est pas chargée", async () => {
  const db = stubDb(
    tables("family", {
      household_food_restrictions: [
        { label: "Nutella", member_user_id: OTHER, created_by: ME, household_id: HOUSE },
      ],
    }),
    [rosterRow(ME, "Ana"), rosterRow(OTHER, "Marc")],
  );
  const ctx = await loadHouseholdTurnContext(db, { userId: ME, localDate: TODAY });
  assertEquals(ctx?.myRestrictions, []);
});

// ---------------------------------------------------------------------------
// LE MINEUR
// ---------------------------------------------------------------------------

Deno.test("un mineur est un MANGEUR, jamais une cible", async () => {
  const db = stubDb(tables("family"), [
    rosterRow(ME, "Ana"),
    rosterRow(CHILD, "Léo", { is_minor: true }),
  ]);
  const ctx = await loadHouseholdTurnContext(db, { userId: ME, localDate: TODAY });
  const block = householdContextBlock(ctx!);
  assertStringIncludes(block, "is an EATER, never a target");
  assertStringIncludes(block, "No nutritional goal");
});

// ---------------------------------------------------------------------------
// LES NO-GO STRUCTURELS
// ---------------------------------------------------------------------------

Deno.test("DEUX BLOCS DE PLAN NE SE CONFONDENT PAS", async () => {
  // `keel_plan_context.ts`: « two plan blocks in one prompt is how a model gets
  // to pick the more flattering one ». Le titre de celui-ci ne dit jamais
  // « plan », et sa première phrase interdit la fusion.
  const db = stubDb(tables("family"), [rosterRow(ME, "Ana")]);
  const block = householdContextBlock(
    (await loadHouseholdTurnContext(db, { userId: ME, localDate: TODAY }))!,
  );
  assertStringIncludes(block, "WHAT THIS HOUSEHOLD IS EATING");
  assertStringIncludes(block, "This is NOT the coach's plan");
  assertStringIncludes(block, "Never merge the two");
});

Deno.test("LECTURE SEULE, et le bloc le dit", async () => {
  const db = stubDb(tables("family"), [rosterRow(ME, "Ana")]);
  const block = householdContextBlock(
    (await loadHouseholdTurnContext(db, { userId: ME, localDate: TODAY }))!,
  );
  assertStringIncludes(block, "READ-ONLY");
  assertStringIncludes(block, "Never invent a dish");
  // Aucune coche inférée d'un plat prévu.
  assertStringIncludes(block, "A dish being planned is NOT a dish being eaten");
});

Deno.test("LE BLOC EST BORNÉ — le budget tronque par la queue", async () => {
  // Un foyer de six avec sept jours de préparations dépasserait le prompt. On
  // borne au jour courant, et on pinne la taille.
  const db = stubDb(
    tables("family", {
      student_generated_meals: [{
        id: "plan-big",
        household_id: HOUSE,
        retired_at: null,
        starts_on: "2026-08-03",
        ends_on: "2026-08-09",
        dishes: Array.from({ length: 20 }, (_, i) => ({
          title: `Dish ${i}`,
          slot: "dinner",
          day: "wed",
        })),
        preparations: Array.from({ length: 20 }, (_, i) => ({
          title: `Prep ${i}`,
          cookOn: "wed",
        })),
        member_portions: Array.from({ length: 20 }, (_, i) => ({
          userId: `u-${i}`,
          displayName: `M${i}`,
          portionNote: "standard",
        })),
      }],
    }),
    Array.from({ length: 20 }, (_, i) => rosterRow(`u-${i}`, `M${i}`)).concat([
      rosterRow(ME, "Ana"),
    ]),
  );
  const ctx = await loadHouseholdTurnContext(db, { userId: ME, localDate: TODAY });
  assert(ctx);
  assertEquals(ctx.todayDishes.length, 4);
  assertEquals(ctx.preparations.length, 3);
  assert(ctx.portions.length <= 6);
  const block = householdContextBlock(ctx);
  assert(
    block.length < 2200,
    `le bloc fait ${block.length} caractères — il doit rester sous 2 200`,
  );
});
