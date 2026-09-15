import { assert, assertEquals } from "jsr:@std/assert@1";

const SQL = await Deno.readTextFile(
  new URL(
    "migrations/20260914170000_le_bail_caste_la_duree.sql",
    new URL("../../../", import.meta.url),
  ),
);

Deno.test("la publication caste integer → smallint avant l'écrivain", () => {
  assert(SQL.includes("p_duration_days => p_duration_days::smallint"));
  assertEquals(SQL.includes("p_duration_days => p_duration_days,"), false);
});
