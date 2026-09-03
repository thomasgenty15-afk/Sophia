/**
 * A8.0 (2026-09-03) — UN PROFIL RÉCLAMÉ MANGE LE PLAN DE SON FOYER.
 *
 * ══ LE DÉFAUT QUE CES ÉPREUVES FERMENT ═══════════════════════════════════
 *
 * Un membre réclamé (FF-048: `household_members.role='member'`, `user_id`
 * posé) ne compose jamais. Le plan qu'il mange est le plan `household` de son
 * foyer, écrit sous le `user_id` du MAÎTRE. Tout lecteur qui ne filtrait que
 * `.eq("user_id", moi)` rendait donc « aucune composition » pour lui: pas de
 * bande du soir, pas de rapprochement photo. Le membre n'existait pas pour le
 * produit — et la bifurcation maître/membre (`respondsForHousehold`,
 * `masterOnly`) était armée, testée, et jamais atteinte.
 *
 * ══ CE QUE CES ÉPREUVES TIENNENT, ET POURQUOI PAS UNE ÉPINGLE TEXTUELLE ══
 *
 * `household_plan_kind_readers_test.ts` scanne la SOURCE: il tient les deux
 * sens du filtre (`household_id ⇒ plan_kind` et `plan_kind ⇒ household_id`).
 * Il ne voit pas QUEL foyer on demande, ni QUAND la seconde requête part. Ces
 * épreuves-ci exécutent les vrais lecteurs contre une base doublée qui
 * ENREGISTRE ses filtres — la seule façon de prouver H2: le foyer interrogé
 * vient de la BASE (`household_members`), jamais d'une charge de bouton.
 */
import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  dishDedicatedTo,
  dishIsForMouth,
} from "./planned_dish_match.ts";

import { loadPlannedDishContext, resolvePlanScope } from "./planned_dish_io.ts";
import { loadStripDishes } from "./evening_strip_io.ts";

const MEMBER = "11111111-1111-4111-8111-111111111111";
const MASTER = "22222222-2222-4222-8222-222222222222";
const HOUSEHOLD = "33333333-3333-4333-8333-333333333333";
const OTHER_HOUSEHOLD = "99999999-9999-4999-8999-999999999999";
const HOUSEHOLD_MEAL = "44444444-4444-4444-8444-444444444444";
const FOREIGN_MEAL = "55555555-5555-4555-8555-555555555555";
const TODAY = "2026-03-11"; // mercredi

/** Une requête telle que le lecteur l'a construite: table + filtres, dans l'ordre. */
interface SeenQuery {
  table: string;
  filters: Array<[string, string, unknown]>;
}

/**
 * Une base doublée QUI ENREGISTRE. `rows` est une fonction de (table, filtres)
 * vers les lignes: c'est ce qui permet d'éprouver qu'une requête mal scopée
 * rendrait quelque chose — et donc que le scope est bien ce qui la retient.
 */
function recordingDb(
  rows: (q: SeenQuery) => Record<string, unknown>[],
): { db: unknown; seen: SeenQuery[] } {
  const seen: SeenQuery[] = [];
  const from = (table: string) => {
    const q: SeenQuery = { table, filters: [] };
    seen.push(q);
    // deno-lint-ignore no-explicit-any
    const b: any = {};
    for (const m of ["select", "order", "limit"]) b[m] = () => b;
    for (const m of ["eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "not", "like", "ilike"]) {
      b[m] = (col: string, a?: unknown, c?: unknown) => {
        q.filters.push([m, col, m === "not" ? c : a]);
        return b;
      };
    }
    const settle = () => ({ data: rows(q), error: null });
    b.maybeSingle = () => Promise.resolve({ data: rows(q)[0] ?? null, error: null });
    b.single = b.maybeSingle;
    // deno-lint-ignore no-explicit-any
    b.then = (res: any, rej: any) => Promise.resolve(settle()).then(res, rej);
    return b;
  };
  return { db: { from }, seen };
}

function filterValue(q: SeenQuery, column: string): unknown {
  return q.filters.find(([, col]) => col === column)?.[2];
}

/**
 * Le catalogue doit être NON VIDE: `loadPlannedDishContext` rend `load_failed`
 * sur un catalogue vide, et ce repli masquerait tout ce que ces épreuves
 * mesurent (elles rendraient le même silence pour la bonne et la mauvaise
 * raison).
 */
const CATALOGUE = [{ slug: "chicken", label: "Poulet", food_group_ref: "poultry" }];

function planRow(id: string, ownerId: string, householdId: string) {
  return {
    id,
    user_id: ownerId,
    household_id: householdId,
    plan_kind: "household",
    starts_on: "2026-03-09",
    duration_days: 7,
    content_locale: "fr-FR",
    dishes: [
      { title: "Poulet du mercredi", slot: "dinner", day: "wed", method: "Cuire.", ingredients: [] },
    ],
    preparations: [],
    created_at: "2026-03-09T10:00:00Z",
  };
}

// ───────────────────────────────────────────────────────────────────────────
// `resolvePlanScope` — QUI a le droit de lire le plan d'un foyer, et duquel
// ───────────────────────────────────────────────────────────────────────────

Deno.test("un profil RÉCLAMÉ résout vers le foyer de SA ligne", async () => {
  const { db } = recordingDb((q) =>
    q.table === "household_members"
      ? [{ role: "member", household_id: HOUSEHOLD }]
      : []
  );
  assertEquals(await resolvePlanScope(db, MEMBER), {
    kind: "household_member",
    householdId: HOUSEHOLD,
  });
});

Deno.test("le MAÎTRE ne passe jamais par la branche foyer", async () => {
  // Son plan `household` est DÉJÀ sous son `user_id`: lui ouvrir la seconde
  // requête ne lui apporterait rien et lui ferait lire par un chemin non scopé
  // par le propriétaire.
  const { db } = recordingDb((q) =>
    q.table === "household_members"
      ? [{ role: "owner", household_id: HOUSEHOLD }]
      : []
  );
  assertEquals(await resolvePlanScope(db, MASTER), { kind: "own" });
});

Deno.test("une bouche SANS COMPTE, un inconnu, une ligne vide ⇒ `own`", async () => {
  const { db } = recordingDb(() => []);
  assertEquals(await resolvePlanScope(db, MEMBER), { kind: "own" });
  assertEquals(await resolvePlanScope(db, ""), { kind: "own" });
});

Deno.test("⛔ FAIL-CLOSED: une lecture d'appartenance EN PANNE rend `own`", async () => {
  // Le pire cas de ce repli est le silence d'avant ce chantier pour un membre
  // ce soir-là. Le pire cas de l'inverse serait de lire un foyer qu'on n'a pas
  // su vérifier — et ce lecteur tourne sous `service_role`, sans RLS derrière.
  const db = {
    from: () => {
      // deno-lint-ignore no-explicit-any
      const b: any = {};
      for (const m of ["select", "eq", "order", "limit", "is", "not", "lte"]) b[m] = () => b;
      b.maybeSingle = () => Promise.resolve({ data: null, error: { message: "boom" } });
      b.single = b.maybeSingle;
      // deno-lint-ignore no-explicit-any
      b.then = (res: any, rej: any) =>
        Promise.resolve({ data: null, error: { message: "boom" } }).then(res, rej);
      return b;
    },
  };
  assertEquals(await resolvePlanScope(db, MEMBER), { kind: "own" });
});

// ───────────────────────────────────────────────────────────────────────────
// `loadPlannedDishContext` — le rapprochement photo, et la bande du soir
// ───────────────────────────────────────────────────────────────────────────

Deno.test("LE CAS QUI PASSE — un membre réclamé reçoit le plat du foyer", async () => {
  const { db, seen } = recordingDb((q) => {
    if (q.table === "food_items") return CATALOGUE;
    if (q.table === "household_members") {
      return [{ role: "member", household_id: HOUSEHOLD }];
    }
    // Rien à SON nom; la ligne du foyer n'apparaît que si le foyer est nommé.
    if (filterValue(q, "user_id") === MEMBER) return [];
    if (filterValue(q, "household_id") === HOUSEHOLD) {
      return [planRow(HOUSEHOLD_MEAL, MASTER, HOUSEHOLD)];
    }
    return [];
  });

  const ctx = await loadPlannedDishContext(db, { userId: MEMBER, localDate: TODAY });
  assertEquals(ctx.reason, "loaded", "le membre doit voir le dîner de sa maison");
  assertEquals(ctx.mealId, HOUSEHOLD_MEAL);
  assertEquals(ctx.dishes.length, 1);

  // ── H2 · LE FOYER VIENT DE LA BASE, ET LES DEUX MOITIÉS SONT LÀ ──────────
  const shared = seen.filter(
    (q) => q.table === "student_generated_meals" && filterValue(q, "plan_kind") === "household",
  );
  assertEquals(shared.length, 1, "une seule requête de foyer, pas une par candidat");
  assertEquals(
    filterValue(shared[0], "household_id"),
    HOUSEHOLD,
    "le foyer interrogé est celui de sa LIGNE `household_members`, jamais un " +
      "identifiant venu d'ailleurs",
  );
});

Deno.test("⛔ H2 — un membre ne lit JAMAIS le plan d'un autre foyer", async () => {
  // La base porte le plan d'un AUTRE foyer, et rien d'autre. Un lecteur qui
  // aurait retiré le `.eq("user_id")` sans mettre `.eq("household_id")` le
  // rendrait ici. MUTATION: retirer `.eq("household_id", scope.householdId)`
  // de `planned_dish_io.ts` fait tomber cette épreuve.
  const { db } = recordingDb((q) => {
    if (q.table === "food_items") return CATALOGUE;
    if (q.table === "household_members") {
      return [{ role: "member", household_id: HOUSEHOLD }];
    }
    // Rien à SON nom. Tout le reste de la base est le plan d'un AUTRE foyer:
    // une requête non scopée le RENDRAIT, une requête scopée ne le rend pas.
    if (filterValue(q, "user_id") === MEMBER) return [];
    const asked = filterValue(q, "household_id");
    return asked === undefined || asked === OTHER_HOUSEHOLD
      ? [planRow(FOREIGN_MEAL, "x", OTHER_HOUSEHOLD)]
      : [];
  });

  const ctx = await loadPlannedDishContext(db, { userId: MEMBER, localDate: TODAY });
  assertEquals(ctx.mealId, null, "le plan d'un foyer étranger n'est pas le sien");
  assert(
    ctx.reason === "no_composition" || ctx.reason === "composition_out_of_window",
    `silence attendu, reçu ${ctx.reason}`,
  );
});

Deno.test("un plan À SON NOM passe AVANT celui du foyer (la prise de main)", async () => {
  // L3: un membre qui a pris la main porte une ligne `personal`. C'est LUI qui
  // l'a composée, elle gagne — et la requête de foyer ne doit même pas partir.
  const { db, seen } = recordingDb((q) => {
    if (q.table === "food_items") return CATALOGUE;
    if (q.table === "household_members") {
      return [{ role: "member", household_id: HOUSEHOLD }];
    }
    if (filterValue(q, "user_id") === MEMBER) {
      return [{ ...planRow("own-plan", MEMBER, HOUSEHOLD), plan_kind: "personal" }];
    }
    return [planRow(HOUSEHOLD_MEAL, MASTER, HOUSEHOLD)];
  });

  const ctx = await loadPlannedDishContext(db, { userId: MEMBER, localDate: TODAY });
  assertEquals(ctx.mealId, "own-plan");
  assertEquals(
    seen.filter((q) => filterValue(q, "plan_kind") === "household").length,
    0,
    "aucune requête de foyer quand une ligne à son nom possède le jour",
  );
});

Deno.test("un NON-membre n'ouvre jamais la requête de foyer", async () => {
  const { db, seen } = recordingDb((q) => {
    if (q.table === "food_items") return CATALOGUE;
    if (q.table === "household_members") return [];
    return [];
  });
  const ctx = await loadPlannedDishContext(db, { userId: MASTER, localDate: TODAY });
  assertEquals(ctx.reason, "no_composition");
  assertEquals(
    seen.filter((q) => filterValue(q, "plan_kind") === "household").length,
    0,
  );
});

// ───────────────────────────────────────────────────────────────────────────
// `loadPlanForTick`, par `loadStripDishes` — le chemin du TAP
// ───────────────────────────────────────────────────────────────────────────

Deno.test("le tap d'un membre relit les titres sur le plan de SON foyer", async () => {
  const { db, seen } = recordingDb((q) => {
    if (q.table === "household_members") {
      return [{ role: "member", household_id: HOUSEHOLD }];
    }
    if (filterValue(q, "user_id") === MEMBER) return [];
    if (filterValue(q, "household_id") === HOUSEHOLD) {
      return [planRow(HOUSEHOLD_MEAL, MASTER, HOUSEHOLD)];
    }
    return [];
  });

  const dishes = await loadStripDishes(db as never, {
    userId: MEMBER,
    mealId: HOUSEHOLD_MEAL,
    dishIndexes: [0],
  });
  assertEquals(dishes, [{ dishIndex: 0, title: "Poulet du mercredi" }]);

  const shared = seen.filter((q) => filterValue(q, "plan_kind") === "household");
  assertEquals(shared.length, 1);
  assertEquals(filterValue(shared[0], "household_id"), HOUSEHOLD);
  assertEquals(
    filterValue(shared[0], "id"),
    HOUSEHOLD_MEAL,
    "l'identifiant du plan reste filtré: le foyer élargit le propriétaire, " +
      "il ne rend pas la table entière",
  );
});

Deno.test("⛔ H2 AU TAP — une charge forgée citant un AUTRE foyer ne rend rien", async () => {
  // C'est le run adversarial nommé dans le mandat: `mealId` vient de la charge
  // d'un bouton, donc d'une chaîne que le client contrôle. Le foyer, lui, vient
  // de la base. Sans plat relu, `applyStripTicks` rend `stale` — rien n'est
  // écrit sous le compte de l'attaquant.
  const { db } = recordingDb((q) => {
    if (q.table === "household_members") {
      return [{ role: "member", household_id: HOUSEHOLD }];
    }
    const asked = filterValue(q, "household_id");
    if (filterValue(q, "user_id") === MEMBER) return [];
    if (asked === undefined || asked === OTHER_HOUSEHOLD) {
      return [planRow(FOREIGN_MEAL, "x", OTHER_HOUSEHOLD)];
    }
    return [];
  });

  assertEquals(
    await loadStripDishes(db as never, {
      userId: MEMBER,
      mealId: FOREIGN_MEAL,
      dishIndexes: [0],
    }),
    [],
    "aucun titre relu ⇒ le tap est `stale`, et rien ne s'écrit",
  );
});

// ---------------------------------------------------------------------------
// A8.3 — ⛔ SES PLATS SEULEMENT, ET LA RÈGLE EST CELLE DE L'ÉCRAN
//
// LE DÉFAUT QUE CES ÉPREUVES FERMENT, ET IL A ÉTÉ VU TOURNER. Run réel du
// 2026-09-03: la bande du soir de Bo, profil réclamé, portait « Compote pour
// Cy » — le plat composé pour l'enfant — AVEC SA CASE. La cocher aurait écrit
// sous SON compte un « j'ai mangé » sur le plat d'un autre: un fait daté,
// append-only, que rien dans la ligne ne signale comme faux.
//
// La règle existait, fermée côté ÉCRAN (`dishIsFor`, LOT C) et ouverte côté
// SERVEUR. Pire: le type serveur `PlannedDish` ne portait même pas
// `member_id`, donc aucun typecheck ne pouvait signaler l'absence du filtre.
// ---------------------------------------------------------------------------

const MOUTH_ME = "aaaa1111-0000-4000-8000-000000000001";
const MOUTH_KID = "aaaa1111-0000-4000-8000-000000000002";

Deno.test("A8.3 — LE CAS QUI PASSE: le plat de la table est à tout le monde", () => {
  // Un plat sans `member_id` est le plat commun. Il doit rester chez CHACUN —
  // y compris chez qui n'a pas de bouche lisible: sans ça, un défaut de
  // lecture ferait disparaître le dîner de tout le foyer.
  for (const mouth of [MOUTH_ME, MOUTH_KID, null]) {
    assertEquals(dishIsForMouth({ member_id: null }, mouth), true);
    assertEquals(dishIsForMouth({}, mouth), true);
    // ⚠️ LA CHAÎNE VIDE VAUT « PAS DÉDIÉ ». Le générateur écrit parfois `""`
    // plutôt que d'omettre la clé, et la lire comme un identifiant rendrait le
    // plat commun dédié à personne — donc invisible pour tout le monde.
    assertEquals(dishIsForMouth({ member_id: "" }, mouth), true);
    assertEquals(dishIsForMouth({ member_id: "   " }, mouth), true);
  }
  // Et sa propre part dédiée lui revient bien.
  assertEquals(dishIsForMouth({ member_id: MOUTH_ME }, MOUTH_ME), true);
});

Deno.test("A8.3 — ⛔ LE CAS QUI REFUSE: le plat dédié d'un AUTRE n'entre jamais", () => {
  // Le cas exact du run réel: la compote de Cy, dans la bande de Bo.
  assertEquals(dishIsForMouth({ member_id: MOUTH_KID }, MOUTH_ME), false);
  // ⛔ ET UNE BOUCHE INCONNUE FERME LE PLAT DÉDIÉ. `null` veut dire « on n'a
  // pas su lire quelle bouche est la sienne », pas « il n'en a pas ». Le pire
  // cas de ce sens-là est une case qui manque un soir; le pire cas de l'autre
  // est un fait de consommation fabriqué sur le plat d'un tiers.
  assertEquals(dishIsForMouth({ member_id: MOUTH_KID }, null), false);
  assertEquals(dishIsForMouth({ member_id: MOUTH_ME }, null), false);
});

Deno.test("A8.3 — `dishDedicatedTo` nomme la bouche, ou dit `null` sans deviner", () => {
  assertEquals(dishDedicatedTo({ member_id: MOUTH_KID }), MOUTH_KID);
  assertEquals(dishDedicatedTo({ member_id: null }), null);
  assertEquals(dishDedicatedTo({}), null);
  assertEquals(dishDedicatedTo({ member_id: "  " }), null);
});

Deno.test("A8.3 — le CHARGEUR filtre, et il ne se contente pas de savoir filtrer", () => {
  // ⚠️ UNE ÉPREUVE DE CÂBLAGE, ET ELLE EST NÉCESSAIRE. Les trois épreuves
  // ci-dessus tiennent la RÈGLE; elles resteraient vertes si personne ne
  // l'appelait — c'est exactement l'état dans lequel le run a trouvé le
  // produit, la règle écrite côté écran et le serveur qui ne l'appelait pas.
  const src = Deno.readTextFileSync(
    new URL("./planned_dish_io.ts", import.meta.url),
  );
  assertEquals(src.includes("dishIsForMouth"), true, "le filtre a disparu du chargeur");
  assertEquals(
    src.includes("dishes: mine.map("),
    true,
    "le contexte rend `today` et non la liste FILTRÉE: le filtre est calculé et jeté",
  );
});
