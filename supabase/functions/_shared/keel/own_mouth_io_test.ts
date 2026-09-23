/**
 * `loadOwnMouthBody` — ⟳ 2026-09-23 — le réglage des à-côtés d'une personne seule.
 *
 * ⛔ CE TEST ÉPINGLE LA JOINTURE, pas le parseur (épinglé dans
 * household_habits_test.ts): le réglage vient de la ligne d'habitudes DU
 * TITULAIRE, par le même parseur que la lane du foyer, dans la même lecture
 * que le « léger ». La ligne d'une autre bouche n'est jamais lue; une lecture
 * d'habitudes en panne rend `{}` (le défaut de l'objectif) sans emporter
 * l'appétit.
 */
import { assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import { loadOwnMouthBody } from "./own_mouth_io.ts";

const USER = "user-1";
const MINE = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function fakeAdmin(opts: {
  habits: Record<string, unknown>[] | "error";
}): SupabaseClient {
  return {
    rpc: async (name: string, _args: Record<string, unknown>) => {
      if (name === "keel_household_roster_for") {
        return {
          data: [
            { member_id: OTHER, user_id: "user-2" },
            { member_id: MINE, user_id: USER },
          ],
          error: null,
        };
      }
      if (name === "keel_household_bodies_for") {
        return {
          data: [{ member_id: MINE, appetite: "large", appetite_asked: true }],
          error: null,
        };
      }
      if (name === "keel_household_habits_for") {
        if (opts.habits === "error") return { data: null, error: { message: "boom" } };
        return { data: opts.habits, error: null };
      }
      return { data: null, error: { message: `rpc inconnue: ${name}` } };
    },
  } as unknown as SupabaseClient;
}

Deno.test("à-côtés d'une personne seule — lus sur SA ligne d'habitudes, moment par moment", async () => {
  const body = await loadOwnMouthBody(
    fakeAdmin({
      habits: [
        // La ligne d'une autre bouche vient EN PREMIER: elle ne doit jamais être lue.
        {
          member_id: OTHER,
          slots: [{ slot: "lunch", kind: "household_dish", usual: "", side_courses: { bread: true } }],
        },
        {
          member_id: MINE,
          slots: [
            { slot: "breakfast", kind: "own_usual", usual: "porridge", side_courses: { dessert: true } },
            { slot: "lunch", kind: "household_dish", usual: "", side_courses: { cheese: true } },
            {
              slot: "dinner",
              kind: "household_dish",
              usual: "",
              light: true,
              side_courses: { dessert: false, starter: false },
            },
          ],
        },
      ],
    }),
    USER,
    "hh-1",
    "test",
  );
  assertEquals(body.source, "read");
  assertEquals(body.memberId, MINE);
  assertEquals(body.sideCourses, {
    lunch: { cheese: true },
    dinner: { starter: false, dessert: false },
  });
  // Même lecture que le « léger »: les deux arrivent ensemble.
  assertEquals(body.lightSlots, ["dinner"]);
  assertEquals(body.appetite, "large");
});

Deno.test("à-côtés d'une personne seule — lecture d'habitudes en panne: `{}`, l'appétit survit", async () => {
  const body = await loadOwnMouthBody(fakeAdmin({ habits: "error" }), USER, "hh-1", "test");
  assertEquals(body.source, "read");
  assertEquals(body.sideCourses, {});
  assertEquals(body.lightSlots, []);
  assertEquals(body.appetite, "large");
  assertEquals(body.asked, true);
});

Deno.test("à-côtés d'une personne seule — sans foyer, `{}`: le défaut de l'objectif, jamais un refus", async () => {
  const body = await loadOwnMouthBody(fakeAdmin({ habits: [] }), USER, null, "test");
  assertEquals(body.source, "no_household");
  assertEquals(body.sideCourses, {});
});
