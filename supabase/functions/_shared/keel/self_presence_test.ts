import { assertEquals } from "jsr:@std/assert@^1.0.0";
import { presenceStateFor } from "./household_presence.ts";
import { selfPresenceFrom } from "./self_presence.ts";

/** Ce que la grille écrit dans `practical_constraints.away_days`. */
const GRID_AWAY = { day: "tue", slots: ["lunch"], source: "self" };
/** Ce que le maître pose sur la ligne de roster. */
const ROSTER_AWAY = [
  { day: "mon", slots: ["lunch"] },
  { day: "wed", slots: ["lunch"] },
];

Deno.test("les DEUX colonnes comptent — aucune n'efface l'autre", () => {
  const away = selfPresenceFrom({ declared: [GRID_AWAY], roster: ROSTER_AWAY });
  assertEquals(presenceStateFor(away, "tue", "lunch"), "away");
  assertEquals(presenceStateFor(away, "mon", "lunch"), "away");
  assertEquals(presenceStateFor(away, "wed", "lunch"), "away");
  // Et rien n'est inventé ailleurs: la table reste le défaut.
  assertEquals(presenceStateFor(away, "tue", "dinner"), "at_table");
  assertEquals(presenceStateFor(away, "thu", "lunch"), "at_table");
});

Deno.test("une colonne illisible vaut le tableau vide, pas une panne", () => {
  const away = selfPresenceFrom({ declared: null, roster: ROSTER_AWAY });
  assertEquals(presenceStateFor(away, "mon", "lunch"), "away");
  const rien = selfPresenceFrom({ declared: undefined, roster: "nope" });
  assertEquals(presenceStateFor(rien, "mon", "lunch"), "at_table");
});

Deno.test("⟳ 2026-09-24 — un ancien jeton `eating_out` se lit comme une absence", () => {
  // La migration convertit ces lignes; tant qu'une ligne en porterait encore,
  // `parseAwayDays` ignore `kind` et la case reste hors de la table.
  const away = selfPresenceFrom({
    declared: [{ day: "tue", slots: ["lunch"], kind: "eating_out" }],
    roster: [],
  });
  assertEquals(presenceStateFor(away, "tue", "lunch"), "away");
});
