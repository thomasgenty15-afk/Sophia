import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  type DatedNextPlanItem,
  isNextPlanItemAlive,
  isoMondayOf,
  NEXT_PLAN_ITEMS_KEY,
  type NextPlanEntry,
  nextPlanItemsFor,
  nextPlanItemsWithLifeFor,
  nextPlanLifeOf,
  partitionForNextPlanStore,
  readNextPlanEntries,
  withNextPlanEntries,
} from "./retained_next_plan.ts";
import {
  parseRetainedItem,
  type RetainedItem,
  retainedItemToJson,
} from "./retained_item.ts";
// LA CLÉ DU MAGASIN DURABLE (lot 1A). Importée pour PROUVER que les deux
// magasins ne partagent pas de clé: une seule clé ferait qu'écrire l'un
// effacerait l'autre, et les deux écritures réussiraient.
import { RETAINED_ITEMS_KEY } from "./food_preference_promotion.ts";
// L'implémentation d'origine du lundi ISO, que ce module RECOPIE. Un test n'est
// dans aucun cycle d'imports: il peut lire la source, et c'est là toute
// l'astuce (même patron que `retained_item_test.ts` avec `EATING_OCCASIONS`).
import { weekStartOf } from "./weekly_flow_io.ts";

// ===========================================================================
// CE QUE CE FICHIER GARDE
//
// Pas « la fonction rend un tableau ». Ce qui est testé, ce sont les façons
// dont le magasin provisoire se trahirait en production:
//
//   1. LA FRONTIÈRE D'EXPIRATION, DES DEUX CÔTÉS. La veille du basculement
//      l'item vit; le jour du basculement il est parti. Une garde sans cas
//      passant est une garde cassée qui ressemble à une garde qui marche;
//   2. un `durable` posé dans le magasin provisoire qui remonterait quand même
//      — il se verrait imprimer une date d'expiration qu'il n'a pas;
//   3. une ancre lue depuis le JOUR DE LA FRAPPE plutôt que depuis la semaine
//      visée: l'envie écrite le dimanche mourrait le lendemain matin;
//   4. une expiration STOCKÉE plutôt que calculée — prouvée par le fait que la
//      même donnée rend deux verdicts opposés selon `today`, sans écriture;
//   5. LA CLÉ DU MAGASIN, DÉCLARÉE DEUX FOIS SANS RIEN QUI LES RELIE. Bretelle
//      mesurée sur le lot 1A: renommer la constante laissait 86 tests verts
//      pendant que l'écriture partait dans une clé que plus personne ne lit.
//      Ici la constante est épinglée à son littéral ET un jsonb écrit avec le
//      littéral EN DUR est relu par la constante;
//   6. les deux magasins (`durable` / `next_plan`) qui partageraient une clé;
//   7. la recopie du lundi ISO qui divergerait de son original.
//
// ⚠️ LES DATES SONT ÉCRITES EN DUR. Cicatrice du dépôt: « un test paramétré
// par sa propre constante reste vert quand on change la constante ». Aucune
// date ci-dessous n'est calculée par le module qu'on éprouve.
//
// LE CALENDRIER DE RÉFÉRENCE, vérifié à la main:
//   lundi 2026-08-17 … dimanche 2026-08-23 … lundi 2026-08-24
// ===========================================================================

/** Une envie, telle qu'un producteur l'écrit. Passe par le parseur du socle. */
function craving(over: Record<string, unknown> = {}): RetainedItem {
  const item = parseRetainedItem({
    kind: "craving",
    scope: "next_plan",
    subject: "household",
    text: "des fajitas",
    value: null,
    source: "written",
    at: "2026-08-19",
    item: "",
    confidence: null,
    ...over,
  });
  assert(item, "la fixture d'envie doit être lisible par le socle");
  return item;
}

/** Un `food.exclude` DURABLE — la famille qui peut être l'un ou l'autre. */
function durableExclusion(): RetainedItem {
  const item = parseRetainedItem({
    kind: "food.exclude",
    scope: "durable",
    subject: "household",
    text: "les rochers coco",
    value: null,
    source: "questionnaire",
    at: "2026-08-19",
    item: "",
    confidence: null,
  });
  assert(item, "la fixture durable doit être lisible par le socle");
  return item;
}

/** Un `food.exclude` en `next_plan` — le retour sur brouillon. */
function draftExclusion(): RetainedItem {
  const item = parseRetainedItem({
    kind: "food.exclude",
    scope: "next_plan",
    subject: "household",
    text: "pas de poisson cette semaine",
    value: null,
    source: "draft_note",
    at: "2026-08-19",
    item: "",
    confidence: null,
  });
  assert(item, "la fixture de brouillon doit être lisible par le socle");
  return item;
}

// ===========================================================================
// 1. LA FRONTIÈRE — LES DEUX CÔTÉS, EN DUR
// ===========================================================================

Deno.test("frontière: le DERNIER jour de la semaine ancrée, l'item VIT", () => {
  // Ancre lundi 2026-08-17. Dernier jour vivant: dimanche 2026-08-23.
  assertEquals(
    isNextPlanItemAlive(craving(), "2026-08-17", "2026-08-23"),
    true,
  );
});

Deno.test("frontière: le jour du BASCULEMENT, l'item est PARTI", () => {
  // Lundi 2026-08-24 — le lundi suivant. C'est le premier jour sans lui.
  assertEquals(
    isNextPlanItemAlive(craving(), "2026-08-17", "2026-08-24"),
    false,
  );
});

Deno.test("frontière: elle est nommée par des DATES, pas par un booléen", () => {
  const life = nextPlanLifeOf("2026-08-17");
  assert(life);
  assertEquals(life.anchor, "2026-08-17");
  // Ce que le lot 1D affiche. Écrit en dur: si la règle change, ce test rougit.
  assertEquals(life.lastDay, "2026-08-23");
  assertEquals(life.expiredFrom, "2026-08-24");
});

Deno.test("frontière: tous les jours de la semaine ancrée sont vivants", () => {
  const days = [
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20",
    "2026-08-21",
    "2026-08-22",
    "2026-08-23",
  ];
  for (const day of days) {
    assertEquals(
      isNextPlanItemAlive(craving(), "2026-08-17", day),
      true,
      `${day} devrait être vivant`,
    );
  }
  // Et la semaine d'après, plus rien — trois jours, pas seulement le premier.
  for (const day of ["2026-08-24", "2026-08-25", "2026-09-01"]) {
    assertEquals(
      isNextPlanItemAlive(craving(), "2026-08-17", day),
      false,
      `${day} devrait être expiré`,
    );
  }
});

Deno.test("frontière: la veille de l'ancre, l'item VIT DÉJÀ (pas d'activation)", () => {
  // Ancre lundi 2026-08-24, on est le dimanche 2026-08-23. « Pour la semaine
  // prochaine » (§6) doit s'afficher LE JOUR OÙ ON L'ÉCRIT.
  assertEquals(
    isNextPlanItemAlive(craving(), "2026-08-24", "2026-08-23"),
    true,
  );
});

// ===========================================================================
// 2. L'ANCRE EST LA SEMAINE VISÉE, PAS LE JOUR DE LA FRAPPE
// ===========================================================================

Deno.test("ancre: écrite le DIMANCHE pour la semaine suivante, elle vit 7 jours", () => {
  // La personne écrit le dimanche 2026-08-23 en visant la semaine du 24.
  // `at` (le jour où elle l'a dit) est le 23; l'ancre est le 24.
  const item = craving({ at: "2026-08-23" });
  assertEquals(isNextPlanItemAlive(item, "2026-08-24", "2026-08-30"), true);
  assertEquals(isNextPlanItemAlive(item, "2026-08-24", "2026-08-31"), false);
  // Et si on avait ancré sur `at` — le défaut que ce test ferme — elle serait
  // morte dès le lundi matin:
  assertEquals(isNextPlanItemAlive(item, "2026-08-23", "2026-08-24"), false);
});

Deno.test("ancre: un jour de semaine passé en `writtenAt` est RECALÉ, pas décalé", () => {
  // Mercredi 2026-08-19 → lundi 2026-08-17. La base garantit déjà un lundi;
  // cette réparation existe pour un appelant hors RPC.
  const life = nextPlanLifeOf("2026-08-19");
  assert(life);
  assertEquals(life.anchor, "2026-08-17");
  assertEquals(life.lastDay, "2026-08-23");
});

Deno.test("ancre: le recalage est IDEMPOTENT sur un lundi", () => {
  assertEquals(nextPlanLifeOf("2026-08-17")?.anchor, "2026-08-17");
  assertEquals(nextPlanLifeOf("2026-08-24")?.anchor, "2026-08-24");
});

// ===========================================================================
// 3. LE REFUS DU `durable` SUR LE CANAL PROVISOIRE
// ===========================================================================

Deno.test("scope: un `durable` posé ici ne remonte JAMAIS, même en pleine semaine", () => {
  assertEquals(
    isNextPlanItemAlive(durableExclusion(), "2026-08-17", "2026-08-19"),
    false,
  );
});

Deno.test("scope: la MÊME famille en `next_plan` remonte — la garde a un cas passant", () => {
  assertEquals(
    isNextPlanItemAlive(draftExclusion(), "2026-08-17", "2026-08-19"),
    true,
  );
});

Deno.test("scope: `next_plan` n'est PAS réservé au craving", () => {
  // `food.*` et `method.*` en `next_plan` (retour sur brouillon) doivent vivre
  // au même titre qu'une envie. Le lot 1B rend TOUTES les familles.
  const method = parseRetainedItem({
    kind: "method.avoid",
    scope: "next_plan",
    subject: "household",
    text: "rien de frit cette semaine",
    value: null,
    source: "draft_note",
    at: "2026-08-19",
    item: "",
    confidence: null,
  });
  assert(method);
  assertEquals(isNextPlanItemAlive(method, "2026-08-17", "2026-08-23"), true);
  assertEquals(isNextPlanItemAlive(method, "2026-08-17", "2026-08-24"), false);
});

// ===========================================================================
// 4. LES REFUS DE FORME — jamais un repli
// ===========================================================================

Deno.test("refus: une ancre illisible rend `false`, pas « aujourd'hui »", () => {
  assertEquals(isNextPlanItemAlive(craving(), "", "2026-08-19"), false);
  assertEquals(isNextPlanItemAlive(craving(), "2026-8-17", "2026-08-19"), false);
  assertEquals(isNextPlanItemAlive(craving(), "pas une date", "2026-08-19"), false);
  assertEquals(nextPlanLifeOf("2026-02-30"), null);
});

Deno.test("refus: un `today` illisible rend `false`", () => {
  assertEquals(isNextPlanItemAlive(craving(), "2026-08-17", ""), false);
  assertEquals(
    isNextPlanItemAlive(craving(), "2026-08-17", "2026-08-19T14:00:00Z"),
    false,
  );
});

// ===========================================================================
// 5. L'EXPIRATION EST CALCULÉE, PAS STOCKÉE
// ===========================================================================

Deno.test("calculée: la MÊME donnée rend deux verdicts opposés selon le jour", () => {
  // C'est la preuve, en une assertion, qu'aucun second état n'est nécessaire:
  // rien n'est écrit entre les deux appels, et pourtant l'item passe de vivant
  // à parti. Un drapeau `expired` aurait demandé un écrivain entre les deux.
  const item = craving();
  assertEquals(isNextPlanItemAlive(item, "2026-08-17", "2026-08-23"), true);
  assertEquals(isNextPlanItemAlive(item, "2026-08-17", "2026-08-24"), false);
  // Et l'item lui-même n'a pas bougé d'un octet.
  assertEquals(item.scope, "next_plan");
  assertEquals(item.text, "des fajitas");
});

// ===========================================================================
// 6. LA RECOPIE DU LUNDI ISO, PROUVÉE ÉGALE À SON ORIGINAL
// ===========================================================================

Deno.test("lundi ISO: la recopie suit `weekStartOf` sur une année entière", () => {
  // 400 jours consécutifs, changements d'année et bissextile compris.
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 400; i++) {
    const day = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    assertEquals(
      isoMondayOf(day),
      weekStartOf(day),
      `divergence sur ${day}`,
    );
  }
});

Deno.test("lundi ISO: quelques ancres écrites EN DUR", () => {
  assertEquals(isoMondayOf("2026-08-23"), "2026-08-17"); // dimanche
  assertEquals(isoMondayOf("2026-08-24"), "2026-08-24"); // lundi
  assertEquals(isoMondayOf("2026-01-01"), "2025-12-29"); // à cheval sur l'année
  assertEquals(isoMondayOf("2028-02-29"), "2028-02-28"); // bissextile
  assertEquals(isoMondayOf("nope"), null);
});


// ===========================================================================
// 7. LA CLÉ DU MAGASIN — épinglée à son littéral, des DEUX côtés
// ===========================================================================

Deno.test("clé: la constante EST le littéral stocké", () => {
  // Bretelle mesurée sur le lot 1A: une clé déclarée deux fois sans rien qui
  // les relie laisse les tests verts pendant que l'écriture part ailleurs.
  assertEquals(NEXT_PLAN_ITEMS_KEY, "retained_next_plan");
});

Deno.test("clé: un jsonb écrit avec le LITTÉRAL EN DUR est relu par la constante", () => {
  // Le second côté de l'épingle. `assertEquals(CONST, "…")` seul ne prouve pas
  // que la LECTURE utilise cette clé: on écrit donc le littéral à la main.
  const stored = {
    retained_next_plan: [
      { item: retainedItemToJson(craving()), anchor: "2026-08-17" },
    ],
  };
  const { entries } = readNextPlanEntries(stored);
  assertEquals(entries.length, 1);
  assertEquals(entries[0].item.text, "des fajitas");
  assertEquals(entries[0].anchor, "2026-08-17");
});

Deno.test("clé: LE PORT D'ÉCRITURE SQL écrit la clé que ce module lit", async () => {
  // ⚠️ CE TEST A ÉTÉ ÉCRIT PARCE QUE LE DÉFAUT ÉTAIT LÀ. La première version de
  // ce module nommait la clé `next_plan_items` pendant que
  // `keel_write_retained_items` (lot 1D) écrivait déjà `retained_next_plan`.
  // Les deux côtés étaient verts, et aucun `next_plan` ne serait jamais arrivé
  // aux générateurs. Une constante et un littéral SQL que rien ne relie sont
  // deux clés, pas une.
  const dir = new URL("../../../migrations/", import.meta.url);
  const writers: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith(".sql")) continue;
    const sql = await Deno.readTextFile(new URL(entry.name, dir));
    if (sql.includes("function public.keel_write_retained_items")) {
      writers.push(sql);
    }
  }
  assert(
    writers.length > 0,
    "aucune migration ne définit keel_write_retained_items: la clé de ce " +
      "module n'est plus épinglée à son écrivain",
  );
  for (const sql of writers) {
    assert(
      sql.includes(`'${NEXT_PLAN_ITEMS_KEY}'`),
      `le port d'écriture ne nomme pas '${NEXT_PLAN_ITEMS_KEY}'`,
    );
  }
});

Deno.test("clé: les deux magasins ne partagent PAS de clé", () => {
  // `retained_items` est le magasin DURABLE (lot 1A). Une clé commune ferait
  // qu'écrire l'un effacerait l'autre — et les deux écritures réussiraient.
  // Élargies en `string`: comparer deux littéraux disjoints est une erreur de
  // typage, et la contrainte qu'on veut porte sur les VALEURS, pas les types.
  const keys: string[] = [NEXT_PLAN_ITEMS_KEY, RETAINED_ITEMS_KEY];
  assertEquals(new Set(keys).size, 2, "les deux magasins partagent une clé");
  assertEquals(RETAINED_ITEMS_KEY, "retained_items");
});

Deno.test("clé: écrire le provisoire ne touche AUCUNE autre clé", () => {
  const before = {
    food_preferences: ["une phrase plate"],
    retained_items: [{ kind: "food.exclude" }],
    cook_days: ["mon", "wed"],
  };
  const after = withNextPlanEntries(before, [
    { item: craving(), anchor: "2026-08-17" },
  ]);
  assertEquals(after.food_preferences, ["une phrase plate"]);
  assertEquals(after.retained_items, [{ kind: "food.exclude" }]);
  assertEquals(after.cook_days, ["mon", "wed"]);
  // Et l'entrée n'a pas été mutée.
  assertEquals(Object.hasOwn(before, "retained_next_plan"), false);
});

// ===========================================================================
// 8. LE MAGASIN — la forme `{item, anchor}`, et ce qu'elle refuse
// ===========================================================================

Deno.test("magasin: un aller-retour écrire → lire est une identité", () => {
  const entries: NextPlanEntry[] = [
    { item: craving(), anchor: "2026-08-17" },
  ];
  const stored = withNextPlanEntries(null, entries);
  const readout = readNextPlanEntries(stored);
  assertEquals(readout.entries.length, 1);
  assertEquals(readout.entries[0].anchor, "2026-08-17");
  assertEquals(readout.entries[0].item.text, "des fajitas");
  assertEquals(readout.refused.total, 0);
});

Deno.test("magasin: une ancre qui n'est pas un lundi est REFUSÉE à l'écriture", () => {
  // Strict à l'écriture, tolérant à la lecture. Recaler en silence un mercredi
  // effacerait la seule trace d'un producteur cassé. Même règle que le miroir
  // front du lot 1D.
  const split = partitionForNextPlanStore([
    { item: craving(), anchor: "2026-08-19" }, // mercredi
    { item: craving(), anchor: "2026-08-17" }, // lundi
  ]);
  assertEquals(split.provisional.length, 1);
  assertEquals(split.misfiled.length, 1);
  const stored = withNextPlanEntries(null, [
    { item: craving(), anchor: "2026-08-19" },
  ]);
  assertEquals(stored.retained_next_plan, []);
});

Deno.test("magasin: la LECTURE, elle, recale ce qu'elle trouve", () => {
  // On ne choisit pas ce qui est déjà en base. Un mercredi stocké par un
  // producteur d'une autre version se lit sur sa semaine, pas sur trois jours
  // de décalage.
  const readout = readNextPlanEntries({
    retained_next_plan: [
      { item: retainedItemToJson(craving()), anchor: "2026-08-19" },
    ],
  });
  assertEquals(readout.entries.length, 1);
  assertEquals(readout.entries[0].anchor, "2026-08-17");
});

Deno.test("magasin: PAS DE REPLI sur `at` quand l'ancre manque", () => {
  // C'est le refus le plus important du magasin. `at` est le jour où c'est dit
  // (le 23, un dimanche), l'ancre est la semaine visée. Replier sur `at` ferait
  // mourir dès le lundi ce qui a été écrit le dimanche pour la semaine d'après.
  const stored = {
    retained_next_plan: [
      { item: retainedItemToJson(craving({ at: "2026-08-23" })) },
    ],
  };
  const readout = readNextPlanEntries(stored);
  assertEquals(readout.entries, []);
  assertEquals(readout.refused.noAnchor, 1);
  assertEquals(readout.refused.total, 1);
});

Deno.test("magasin: un `durable` rangé ici est REFUSÉ et COMPTÉ", () => {
  const stored = {
    retained_next_plan: [
      { item: retainedItemToJson(durableExclusion()), anchor: "2026-08-17" },
      { item: retainedItemToJson(craving()), anchor: "2026-08-17" },
    ],
  };
  const readout = readNextPlanEntries(stored);
  assertEquals(readout.entries.length, 1);
  assertEquals(readout.refused.notNextPlan, 1);
  // Et l'écriture le refuse aussi, en le rendant DICIBLE.
  const split = partitionForNextPlanStore([
    { item: durableExclusion(), anchor: "2026-08-17" },
    { item: craving(), anchor: "2026-08-17" },
  ]);
  assertEquals(split.provisional.length, 1);
  assertEquals(split.misfiled.length, 1);
});

Deno.test("magasin: un item difforme tombe SEUL, son voisin reste — et il est COMPTÉ", () => {
  const stored = {
    retained_next_plan: [
      { item: { kind: "craving", scope: "durable" }, anchor: "2026-08-17" },
      "pas une enveloppe",
      { item: retainedItemToJson(craving()), anchor: "2026-08-17" },
    ],
  };
  const readout = readNextPlanEntries(stored);
  assertEquals(readout.entries.length, 1);
  assertEquals(readout.refused.malformed, 2);
});

Deno.test("magasin: un jsonb qui n'est pas une liste compte pour UNE ligne refusée", () => {
  // À zéro, un magasin corrompu serait indiscernable d'un magasin vide.
  assertEquals(readNextPlanEntries({ retained_next_plan: {} }).refused.total, 1);
  assertEquals(readNextPlanEntries({ retained_next_plan: "x" }).refused.total, 1);
  // Et l'absence de clé, elle, ne compte pour rien: c'est l'état normal.
  assertEquals(readNextPlanEntries({}).refused.total, 0);
  assertEquals(readNextPlanEntries(null).refused.total, 0);
});

// ===========================================================================
// 9. LA LECTURE — sur un faux client, sans base
// ===========================================================================

type Row = Record<string, unknown>;

/**
 * Un client minimal qui rejoue exactement la chaîne appelée par le module:
 *   from("student_goals").select(..).eq("user_id", ..).maybeSingle()
 * Aucune tolérance: un appel non prévu fait échouer le test au lieu de rendre
 * un tableau vide qui ressemblerait à « rien en base ».
 */
function fakeAdmin(opts: {
  constraints?: Row | null;
  noRow?: boolean;
  error?: string;
}) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(table);
      if (table !== "student_goals") {
        throw new Error(`table inattendue: ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve(
                opts.error
                  ? { data: null, error: { message: opts.error } }
                  : {
                    data: opts.noRow
                      ? null
                      : { practical_constraints: opts.constraints ?? {} },
                    error: null,
                  },
              ),
          }),
        }),
      };
    },
  };
  return { client, calls };
}

function storedCraving(text: string, anchor: string): Row {
  return { item: retainedItemToJson(craving({ text })), anchor };
}

Deno.test("lecture: la semaine EN COURS remonte, la PRÉCÉDENTE non", async () => {
  const { client } = fakeAdmin({
    constraints: {
      retained_next_plan: [
        storedCraving("des fajitas", "2026-08-17"),
        storedCraving("du curry, la semaine passée", "2026-08-10"),
      ],
    },
  });
  const items = await nextPlanItemsFor({
    admin: client,
    userId: "u-1",
    today: "2026-08-19",
  });
  assertEquals(items.map((i) => i.text), ["des fajitas"]);
});

Deno.test("lecture: le LUNDI SUIVANT, l'envie de la semaine passée est partie", async () => {
  const { client } = fakeAdmin({
    constraints: {
      retained_next_plan: [storedCraving("des fajitas", "2026-08-17")],
    },
  });
  // Dimanche: encore là.
  assertEquals(
    (await nextPlanItemsFor({ admin: client, userId: "u-1", today: "2026-08-23" }))
      .length,
    1,
  );
  // Lundi: plus rien. Même donnée, aucune écriture entre les deux.
  assertEquals(
    (await nextPlanItemsFor({ admin: client, userId: "u-1", today: "2026-08-24" }))
      .length,
    0,
  );
});

Deno.test("lecture: la SEMAINE PROCHAINE est déjà visible (§6)", async () => {
  const { client } = fakeAdmin({
    constraints: {
      retained_next_plan: [storedCraving("des fajitas", "2026-08-24")],
    },
  });
  const dated: DatedNextPlanItem[] = await nextPlanItemsWithLifeFor({
    admin: client,
    userId: "u-1",
    today: "2026-08-23",
  });
  assertEquals(dated.length, 1);
  // Ce que 1D imprimera. En dur.
  assertEquals(dated[0].life.lastDay, "2026-08-30");
  assertEquals(dated[0].life.expiredFrom, "2026-08-31");
});

Deno.test("lecture: UNE PERSONNE SEULE est servie comme tout le monde", async () => {
  // Le défaut qui a fait déménager le magasin: sur le canal d'envies, un solo
  // (aucun foyer) ne pouvait porter AUCUN next_plan. Ici, une seule clé —
  // `user_id` — et aucune résolution de foyer sur le chemin.
  const { client, calls } = fakeAdmin({
    constraints: {
      retained_next_plan: [storedCraving("des fajitas", "2026-08-17")],
    },
  });
  const items = await nextPlanItemsFor({
    admin: client,
    userId: "u-solo",
    today: "2026-08-19",
  });
  assertEquals(items.map((i) => i.text), ["des fajitas"]);
  // Une seule table lue, et ce n'est pas le foyer.
  assertEquals(calls, ["student_goals"]);
});

Deno.test("lecture: aucune ligne `student_goals` rend `[]` — état normal", async () => {
  const { client } = fakeAdmin({ noRow: true });
  assertEquals(
    await nextPlanItemsFor({ admin: client, userId: "u-1", today: "2026-08-19" }),
    [],
  );
});

Deno.test("lecture: une panne rend `[]` — un dîner ne dépend pas d'une envie", async () => {
  const { client } = fakeAdmin({ error: "boom" });
  assertEquals(
    await nextPlanItemsFor({ admin: client, userId: "u-1", today: "2026-08-19" }),
    [],
  );
});

Deno.test("lecture: un `today` illisible ne touche PAS la base", async () => {
  const { client, calls } = fakeAdmin({ constraints: {} });
  assertEquals(
    await nextPlanItemsFor({ admin: client, userId: "u-1", today: "19/08/2026" }),
    [],
  );
  assertEquals(calls, []);
});

Deno.test("lecture: une entrée sans ancre lisible ne sert rien", async () => {
  const { client } = fakeAdmin({
    constraints: {
      retained_next_plan: [
        { item: retainedItemToJson(craving()), anchor: "pas une date" },
      ],
    },
  });
  assertEquals(
    await nextPlanItemsFor({ admin: client, userId: "u-1", today: "2026-08-19" }),
    [],
  );
});
