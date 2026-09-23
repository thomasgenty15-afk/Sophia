/**
 * `draftNoteMembersOf` — le rôle tel que le lecteur de note le reçoit.
 *
 * ⟳ 2026-09-23 — `writes` VIENT DE `role = 'owner'`, ET DE RIEN D'AUTRE.
 * Mesuré sur des notes hors corpus: sans ce champ, « pour moi » s'appliquait à
 * toute la table (6/6). Ce test épingle la JOINTURE: la ligne `owner` du
 * roster est la seule à `true`; un roster sans `owner` (compte qui mange
 * seul, ou rôle illisible) ne rend AUCUN `true` — jamais un repli sur la
 * première ligne.
 */
import { assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import { draftNoteMembersOf } from "./draft_note_members_io.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const WIFE = "22222222-2222-4222-8222-222222222222";
const KID = "33333333-3333-4333-8333-333333333333";

function fakeAdmin(rows: Record<string, unknown>[]): SupabaseClient {
  return {
    rpc: async (name: string, _args: Record<string, unknown>) => {
      if (name === "keel_household_roster_for") return { data: rows, error: null };
      if (name === "keel_household_of") return { data: "hh-1", error: null };
      if (name === "keel_household_bodies_for") {
        return {
          data: [{ member_id: OWNER, gender: "male" }, { member_id: WIFE, gender: "female" }],
          error: null,
        };
      }
      return { data: null, error: { message: `rpc inconnue: ${name}` } };
    },
  } as unknown as SupabaseClient;
}

Deno.test("membres — `writes` est vrai sur la ligne `owner`, et sur elle seule", async () => {
  const members = await draftNoteMembersOf(
    fakeAdmin([
      { member_id: OWNER, first_name: "Thomas", age_state: "adult", role: "owner" },
      { member_id: WIFE, first_name: "Christèle", age_state: "adult", role: "member" },
      { member_id: KID, first_name: "Léa", age_state: "minor", role: "member" },
    ]),
    "user-1",
    "test",
  );
  assertEquals(members.map((m) => [m.label, m.writes]), [["Thomas", true], ["Christèle", false], ["Léa", false]]);
  // Le reste du rôle est intact: âge et sexe continuent d'arriver.
  assertEquals(members.map((m) => [m.ageState, m.sex]), [["adult", "male"], ["adult", "female"], ["minor", null]]);
});

Deno.test("membres — sans ligne `owner`, PERSONNE n'écrit: aucun repli sur la première ligne", async () => {
  const members = await draftNoteMembersOf(
    fakeAdmin([
      { member_id: WIFE, first_name: "Christèle", age_state: "adult", role: "member" },
      { member_id: KID, first_name: "Léa", age_state: "minor", role: null },
    ]),
    "user-1",
    "test",
  );
  assertEquals(members.map((m) => m.writes), [false, false]);
});

Deno.test("membres — un rôle en majuscules ou avec des espaces reste `owner`", async () => {
  const members = await draftNoteMembersOf(
    fakeAdmin([{ member_id: OWNER, first_name: "Thomas", age_state: "adult", role: " owner " }]),
    "user-1",
    "test",
  );
  // `trim()` oui, casse non: la colonne est un enum textuel en minuscules.
  assertEquals(members[0].writes, true);
});
