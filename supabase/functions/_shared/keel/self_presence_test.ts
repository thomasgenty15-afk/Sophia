import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import { presenceStateFor } from "./household_presence.ts";
import {
  cellKey,
  composedCells,
  selfMealsOutByDay,
  selfPresenceFrom,
} from "./self_presence.ts";

/** Ce que la grille écrit dans `practical_constraints.away_days`. */
const GRID_OUT = { day: "tue", slots: ["lunch"], kind: "eating_out" };
/** Ce que la porte du « déjeuner au bureau » pose sur la ligne de roster. */
const WORK_LUNCH = [
  { day: "mon", slots: ["lunch"], kind: "eating_out" },
  { day: "wed", slots: ["lunch"], kind: "eating_out" },
];

Deno.test("les DEUX colonnes comptent — aucune n'efface l'autre", () => {
  const away = selfPresenceFrom({ declared: [GRID_OUT], roster: WORK_LUNCH });
  assertEquals(presenceStateFor(away, "tue", "lunch"), "eating_out");
  assertEquals(presenceStateFor(away, "mon", "lunch"), "eating_out");
  assertEquals(presenceStateFor(away, "wed", "lunch"), "eating_out");
  // Et rien n'est inventé ailleurs: la table reste le défaut.
  assertEquals(presenceStateFor(away, "tue", "dinner"), "at_table");
  assertEquals(presenceStateFor(away, "thu", "lunch"), "at_table");
});

Deno.test("une colonne illisible vaut le tableau vide, pas une panne", () => {
  const away = selfPresenceFrom({ declared: null, roster: WORK_LUNCH });
  assertEquals(presenceStateFor(away, "mon", "lunch"), "eating_out");
  const rien = selfPresenceFrom({ declared: undefined, roster: "nope" });
  assertEquals(presenceStateFor(rien, "mon", "lunch"), "at_table");
});

Deno.test("⛔ SANS `kind`, C'EST `away` — et `away` ne dit aucun nombre", () => {
  // Les lignes écrites avant le troisième état ne portent pas de jeton. Les
  // lire « dehors » ferait apparaître un conseil chiffré sur des vacances.
  const away = selfPresenceFrom({
    declared: [{ day: "tue", slots: ["lunch"] }],
    roster: [],
  });
  assertEquals(presenceStateFor(away, "tue", "lunch"), "away");
});

Deno.test("⛔ LE SILENCE GAGNE: `away` d'une source ferme le `eating_out` de l'autre", () => {
  // La personne dit « je déjeune dehors le mardi »; une absence porte la
  // journée entière. Les deux retirent la part; on ne dit pas de nombre.
  const away = selfPresenceFrom({
    declared: [GRID_OUT],
    roster: [{ day: "tue", slots: [] }],
  });
  assertEquals(presenceStateFor(away, "tue", "lunch"), "away");
});

Deno.test("les cases composées, et seulement celles qu'on sait situer", () => {
  const set = composedCells([
    { day: "wed", slot: "breakfast" },
    { day: "wed", slot: "dinner" },
    // ⛔ ni jour ni moment ⇒ hors de l'ensemble: une clé approximative
    // supprimerait un conseil juste.
    { day: null, slot: "lunch" },
    { day: "thu", slot: null },
  ]);
  assertEquals(set.size, 2);
  assert(set.has(cellKey("wed", "breakfast")));
  assert(set.has(cellKey("wed", "dinner")));
  assert(!set.has(cellKey("wed", "lunch")));
  assert(!set.has(cellKey("thu", "lunch")));
});

Deno.test("la clé est la MÊME des deux côtés — jour ET moment", () => {
  assertEquals(cellKey("wed", "lunch"), "wed|lunch");
  assert(cellKey("wed", "lunch") !== cellKey("wed", "dinner"));
  assert(cellKey("wed", "lunch") !== cellKey("thu", "lunch"));
});

// ---------------------------------------------------------------------------
// LE COMPTE DE REPAS DEHORS — ce qui fait basculer `subject` à l'écran
// ---------------------------------------------------------------------------

const RHYTHM = [
  { slot: "breakfast" as const, size: null },
  { slot: "lunch" as const, size: null },
  { slot: "dinner" as const, size: null },
];
/** Le plan du run réel: petit-déj + dîner composés, déjeuner laissé vide. */
const PLAN = [
  { day: "wed", slot: "breakfast" },
  { day: "wed", slot: "dinner" },
];

Deno.test("un déjeuner dehors compte pour UN repas hors plan, ce jour-là", () => {
  const away = selfPresenceFrom({
    declared: [],
    roster: [{ day: "wed", slots: ["lunch"], kind: "eating_out" }],
  });
  assertEquals(
    [...selfMealsOutByDay({ away, slots: RHYTHM, dishes: PLAN })],
    [["wed", 1]],
  );
});

Deno.test("⛔ UNE CASE COMPOSÉE N'EST PAS UN REPAS DEHORS — la même ceinture que le conseil", () => {
  // Le dîner est marqué « dehors » APRÈS coup, alors que le plan l'a composé.
  const away = selfPresenceFrom({
    declared: [{ day: "wed", slots: ["lunch", "dinner"], kind: "eating_out" }],
    roster: [],
  });
  assertEquals(
    [...selfMealsOutByDay({ away, slots: RHYTHM, dishes: PLAN })],
    [["wed", 1]],
    "le dîner composé ne doit pas compter comme un repas dehors",
  );
});

Deno.test("⛔ `away` NE COMPTE PAS: le plan ne compose rien ET ne dit rien", () => {
  const away = selfPresenceFrom({
    declared: [{ day: "wed", slots: ["lunch"] }],
    roster: [],
  });
  assertEquals([...selfMealsOutByDay({ away, slots: RHYTHM, dishes: PLAN })], []);
});

Deno.test("une journée entièrement à table ne pose AUCUNE clé", () => {
  const away = selfPresenceFrom({ declared: [], roster: [] });
  assertEquals(
    [...selfMealsOutByDay({ away, slots: RHYTHM, dishes: PLAN })],
    [],
    "une table vide est une valeur PLEINE: cette personne mange tout ici",
  );
});

Deno.test("aucun jour dans le plan ⇒ aucun compte, jamais un jour inventé", () => {
  const away = selfPresenceFrom({
    declared: [{ day: "wed", slots: ["lunch"], kind: "eating_out" }],
    roster: [],
  });
  assertEquals([...selfMealsOutByDay({ away, slots: RHYTHM, dishes: [] })], []);
});
