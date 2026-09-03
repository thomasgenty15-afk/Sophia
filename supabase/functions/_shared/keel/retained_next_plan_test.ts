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
  parseIsoInstant,
  partitionForNextPlanStore,
  readNextPlanEntries,
  type ValidatedPlan,
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
//   1. LA RÈGLE DE VIE, DES DEUX CÔTÉS (lot A, 2026-09-03): un plan validé
//      APRÈS l'écriture ferme la ligne; un plan validé AVANT ne la ferme pas;
//      sans plan validé, elle vit — le calendrier ne ferme plus rien. Une
//      garde sans cas passant est une garde cassée qui ressemble à une garde
//      qui marche;
//   2. un `durable` posé dans le magasin provisoire qui remonterait quand même
//      — il se verrait imprimer une date d'expiration qu'il n'a pas;
//   3. une ancre lue depuis le JOUR DE LA FRAPPE plutôt que depuis la semaine
//      visée: l'envie écrite le dimanche mourrait le lendemain matin;
//   4. une expiration STOCKÉE plutôt que calculée — prouvée par le fait que la
//      même donnée rend deux verdicts opposés selon les plans validés, sans
//      écriture;
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
// 1. LA RÈGLE DE VIE — la validation du plan suivant, PAS le calendrier
//    (lot A, 2026-09-03, nomenclature §2.5)
// ===========================================================================

/** L'enveloppe telle que le producteur l'écrit depuis le lot A. */
function entry(
  item: RetainedItem,
  over: { anchor?: string; writtenAt?: string | null } = {},
): NextPlanEntry {
  return {
    item,
    anchor: over.anchor ?? "2026-08-17",
    // Mercredi 2026-08-19 à 10:00 UTC — l'instant de la note. EN DUR.
    writtenAt: over.writtenAt === undefined ? "2026-08-19T10:00:00.000Z" : over.writtenAt,
  };
}
const validated = (at: string): ValidatedPlan => ({ validatedAt: at });

Deno.test("vie: SANS plan validé, la ligne VIT — quel que soit le jour", () => {
  assertEquals(isNextPlanItemAlive(entry(craving()), []), true);
});

Deno.test("vie: un plan validé AVANT l'écriture ne la tue pas", () => {
  assertEquals(isNextPlanItemAlive(entry(craving()), [validated("2026-08-19T09:59:59.000Z")]), true);
  // Un plan validé la semaine d'avant non plus.
  assertEquals(isNextPlanItemAlive(entry(craving()), [validated("2026-08-10T12:00:00.000Z")]), true);
});

Deno.test("vie: un plan validé APRÈS l'écriture la TUE — à la seconde près", () => {
  assertEquals(isNextPlanItemAlive(entry(craving()), [validated("2026-08-19T10:00:01.000Z")]), false);
  // La MÊME seconde ne tue pas: « postérieur » est strict.
  assertEquals(isNextPlanItemAlive(entry(craving()), [validated("2026-08-19T10:00:00.000Z")]), true);
  // Et un plan validé des semaines plus tard tue aussi: pas de borne haute.
  assertEquals(isNextPlanItemAlive(entry(craving()), [validated("2026-09-30T08:00:00.000Z")]), false);
});

Deno.test("vie: UN SEUL plan postérieur suffit, parmi d'autres antérieurs", () => {
  const plans = [
    validated("2026-08-01T00:00:00Z"),
    validated("2026-08-19T18:00:00Z"),
    validated("2026-08-12T00:00:00Z"),
  ];
  assertEquals(isNextPlanItemAlive(entry(craving()), plans), false);
});

Deno.test("vie: une entrée d'AVANT le lot (sans instant) meurt sur le JOUR, strictement", () => {
  // `item.at` = 2026-08-19. Le même jour la garde (prudent); le lendemain la tue.
  const legacy = entry(craving(), { writtenAt: null });
  assertEquals(isNextPlanItemAlive(legacy, [validated("2026-08-19T23:59:59Z")]), true);
  assertEquals(isNextPlanItemAlive(legacy, [validated("2026-08-20T00:00:01Z")]), false);
  assertEquals(isNextPlanItemAlive(legacy, []), true);
});

Deno.test("vie: la même donnée rend deux verdicts opposés selon les plans validés, SANS écriture", () => {
  // C'est la preuve, en une assertion, qu'aucun second état n'est nécessaire.
  const e = entry(craving());
  assertEquals(isNextPlanItemAlive(e, []), true);
  assertEquals(isNextPlanItemAlive(e, [validated("2026-08-19T12:00:00Z")]), false);
  assertEquals(e.item.text, "des fajitas");
});

// ===========================================================================
// 2. L'ANCRE RESTE — pour l'affichage, plus pour la mort
// ===========================================================================

Deno.test("ancre: elle est nommée par des DATES, et c'est ce que l'écran affiche", () => {
  const life = nextPlanLifeOf("2026-08-17");
  assert(life);
  assertEquals(life.anchor, "2026-08-17");
  assertEquals(life.lastDay, "2026-08-23");
  assertEquals(life.expiredFrom, "2026-08-24");
});

Deno.test("ancre: un jour de semaine est RECALÉ sur son lundi, et le recalage est idempotent", () => {
  assertEquals(nextPlanLifeOf("2026-08-19")?.anchor, "2026-08-17");
  assertEquals(nextPlanLifeOf("2026-08-17")?.anchor, "2026-08-17");
  assertEquals(nextPlanLifeOf("2026-08-24")?.anchor, "2026-08-24");
  assertEquals(nextPlanLifeOf("2026-02-30"), null);
});

Deno.test("ancre: le lundi suivant ne tue PLUS la ligne — c'est le point du lot A", () => {
  // Avant: morte dès le 2026-08-24. Maintenant: vivante tant que rien n'est
  // validé — un plan de deux jours régénéré trois fois gardait l'envie à
  // chaque fois, et un plan validé le samedi pour la semaine suivante la
  // perdait le lundi.
  assertEquals(isNextPlanItemAlive(entry(craving(), { anchor: "2026-08-17" }), []), true);
});

// ===========================================================================
// 3. LE REFUS DU `durable` SUR LE CANAL PROVISOIRE
// ===========================================================================

Deno.test("scope: un `durable` posé ici ne remonte JAMAIS, même sans plan validé", () => {
  assertEquals(isNextPlanItemAlive(entry(durableExclusion()), []), false);
});

Deno.test("scope: la MÊME famille en `next_plan` remonte — la garde a un cas passant", () => {
  assertEquals(isNextPlanItemAlive(entry(draftExclusion()), []), true);
});

Deno.test("scope: `next_plan` n'est PAS réservé au craving", () => {
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
  assertEquals(isNextPlanItemAlive(entry(method), []), true);
  assertEquals(isNextPlanItemAlive(entry(method), [validated("2026-08-20T00:00:00Z")]), false);
});

// ===========================================================================
// 4. LES REFUS DE FORME — jamais un repli
// ===========================================================================

Deno.test("refus: un `validated_at` illisible ne TUE pas — on ne ferme pas une envie sur une date qu'on n'a pas lue", () => {
  assertEquals(
    isNextPlanItemAlive(entry(craving()), [validated(""), validated("pas une date")]),
    true,
  );
});

Deno.test("refus: un `written_at` illisible retombe sur la règle du JOUR", () => {
  const e = entry(craving(), { writtenAt: "hier" });
  assertEquals(isNextPlanItemAlive(e, [validated("2026-08-19T23:00:00Z")]), true);
  assertEquals(isNextPlanItemAlive(e, [validated("2026-08-20T01:00:00Z")]), false);
});

Deno.test("refus: `parseIsoInstant` normalise en UTC, et rend null sur tout le reste", () => {
  assertEquals(parseIsoInstant("2026-08-19T10:00:00Z"), "2026-08-19T10:00:00.000Z");
  assertEquals(parseIsoInstant("2026-08-19T12:00:00+02:00"), "2026-08-19T10:00:00.000Z");
  for (const bad of ["", "   ", "hier", null, undefined, 42]) {
    assertEquals(parseIsoInstant(bad), null, String(bad));
  }
});

// ===========================================================================
// 5. L'ENVELOPPE PORTE SON INSTANT — et le relit
// ===========================================================================

Deno.test("enveloppe: `written_at` fait l'aller-retour, et son absence reste une absence", () => {
  const stored = withNextPlanEntries(null, [
    entry(craving()),
    entry(craving({ text: "d'avant le lot" }), { writtenAt: null }),
  ]);
  const rows = stored.retained_next_plan as Record<string, unknown>[];
  assertEquals(rows[0].written_at, "2026-08-19T10:00:00.000Z");
  assertEquals(Object.hasOwn(rows[1], "written_at"), false);
  const readout = readNextPlanEntries(stored);
  assertEquals(readout.entries[0].writtenAt, "2026-08-19T10:00:00.000Z");
  assertEquals(readout.entries[1].writtenAt, null);
});

Deno.test("enveloppe: un `written_at` illisible en base rend `null`, la ligne RESTE", () => {
  const readout = readNextPlanEntries({
    retained_next_plan: [
      { item: retainedItemToJson(craving()), anchor: "2026-08-17", written_at: "hier" },
    ],
  });
  assertEquals(readout.entries.length, 1);
  assertEquals(readout.entries[0].writtenAt, null);
  assertEquals(readout.refused.total, 0);
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
    { item: craving(), anchor: "2026-08-17", writtenAt: null },
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
    { item: craving(), anchor: "2026-08-17", writtenAt: null },
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
    { item: craving(), anchor: "2026-08-19", writtenAt: null }, // mercredi
    { item: craving(), anchor: "2026-08-17", writtenAt: null }, // lundi
  ]);
  assertEquals(split.provisional.length, 1);
  assertEquals(split.misfiled.length, 1);
  const stored = withNextPlanEntries(null, [
    { item: craving(), anchor: "2026-08-19", writtenAt: null },
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
    { item: durableExclusion(), anchor: "2026-08-17", writtenAt: null },
    { item: craving(), anchor: "2026-08-17", writtenAt: null },
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
 * Un client minimal qui rejoue exactement les DEUX chaînes appelées:
 *   from("student_goals").select(..).eq("user_id", ..).maybeSingle()
 *   from("student_generated_meals").select("validated_at").eq("user_id", ..)
 *     .not("validated_at", "is", null)
 * Aucune tolérance: une table inattendue fait échouer le test au lieu de
 * rendre un tableau vide qui ressemblerait à « rien en base ».
 */
function fakeAdmin(opts: {
  constraints?: Row | null;
  noRow?: boolean;
  error?: string;
  validated?: string[];
  plansError?: string;
}) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(table);
      if (table === "student_goals") {
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
      }
      if (table === "student_generated_meals") {
        return {
          select: () => ({
            eq: () => ({
              not: () =>
                Promise.resolve(
                  opts.plansError
                    ? { data: null, error: { message: opts.plansError } }
                    : {
                      data: (opts.validated ?? []).map((v) => ({ validated_at: v })),
                      error: null,
                    },
                ),
            }),
          }),
        };
      }
      throw new Error(`table inattendue: ${table}`);
    },
  };
  return { client, calls };
}

function storedCraving(
  text: string,
  anchor: string,
  writtenAt: string | null = "2026-08-19T10:00:00Z",
): Row {
  return {
    item: retainedItemToJson(craving({ text })),
    anchor,
    ...(writtenAt ? { written_at: writtenAt } : {}),
  };
}

Deno.test("lecture: sans plan validé, TOUT remonte — la semaine passée aussi (le calendrier ne ferme plus)", async () => {
  const { client } = fakeAdmin({
    constraints: {
      retained_next_plan: [
        storedCraving("des fajitas", "2026-08-17"),
        storedCraving("du curry, la semaine passée", "2026-08-10"),
      ],
    },
  });
  const items = await nextPlanItemsFor({ admin: client, userId: "u-1", today: "2026-08-19" });
  assertEquals(items.map((i) => i.text), ["des fajitas", "du curry, la semaine passée"]);
});

Deno.test("lecture: un plan validé APRÈS l'écriture ferme la ligne; validé AVANT, non", async () => {
  const before = fakeAdmin({
    constraints: { retained_next_plan: [storedCraving("des fajitas", "2026-08-17")] },
    validated: ["2026-08-19T09:00:00+00:00"],
  });
  assertEquals(
    (await nextPlanItemsFor({ admin: before.client, userId: "u-1", today: "2026-08-19" })).length,
    1,
  );
  const after = fakeAdmin({
    constraints: { retained_next_plan: [storedCraving("des fajitas", "2026-08-17")] },
    validated: ["2026-08-19T09:00:00+00:00", "2026-08-19T11:00:00+00:00"],
  });
  assertEquals(
    (await nextPlanItemsFor({ admin: after.client, userId: "u-1", today: "2026-08-19" })).length,
    0,
  );
});

Deno.test("lecture: une entrée d'AVANT le lot meurt sur le JOUR du plan validé, strictement", async () => {
  const sameDay = fakeAdmin({
    constraints: { retained_next_plan: [storedCraving("des fajitas", "2026-08-17", null)] },
    validated: ["2026-08-19T22:00:00+00:00"],
  });
  assertEquals(
    (await nextPlanItemsFor({ admin: sameDay.client, userId: "u-1", today: "2026-08-19" })).length,
    1,
  );
  const nextDay = fakeAdmin({
    constraints: { retained_next_plan: [storedCraving("des fajitas", "2026-08-17", null)] },
    validated: ["2026-08-20T07:00:00+00:00"],
  });
  assertEquals(
    (await nextPlanItemsFor({ admin: nextDay.client, userId: "u-1", today: "2026-08-21" })).length,
    0,
  );
});

Deno.test("lecture: la SEMAINE PROCHAINE est déjà visible, avec son ancre (§6)", async () => {
  const { client } = fakeAdmin({
    constraints: { retained_next_plan: [storedCraving("des fajitas", "2026-08-24")] },
  });
  const dated: DatedNextPlanItem[] = await nextPlanItemsWithLifeFor({
    admin: client,
    userId: "u-1",
    today: "2026-08-23",
  });
  assertEquals(dated.length, 1);
  assertEquals(dated[0].life.anchor, "2026-08-24");
  assertEquals(dated[0].life.lastDay, "2026-08-30");
});

Deno.test("lecture: UNE PERSONNE SEULE est servie comme tout le monde — deux tables, aucun foyer", async () => {
  const { client, calls } = fakeAdmin({
    constraints: { retained_next_plan: [storedCraving("des fajitas", "2026-08-17")] },
  });
  const items = await nextPlanItemsFor({ admin: client, userId: "u-solo", today: "2026-08-19" });
  assertEquals(items.map((i) => i.text), ["des fajitas"]);
  assertEquals(calls, ["student_goals", "student_generated_meals"]);
});

Deno.test("lecture: aucune ligne `student_goals` rend `[]` — et ne lit pas les plans", async () => {
  const { client, calls } = fakeAdmin({ noRow: true });
  assertEquals(await nextPlanItemsFor({ admin: client, userId: "u-1", today: "2026-08-19" }), []);
  assertEquals(calls, ["student_goals"]);
});

Deno.test("lecture: un magasin VIDE ne lit pas les plans non plus", async () => {
  const { client, calls } = fakeAdmin({ constraints: {} });
  assertEquals(await nextPlanItemsFor({ admin: client, userId: "u-1", today: "2026-08-19" }), []);
  assertEquals(calls, ["student_goals"]);
});

Deno.test("lecture: une panne sur les objectifs rend `[]` — un dîner ne dépend pas d'une envie", async () => {
  const { client } = fakeAdmin({ error: "boom" });
  assertEquals(await nextPlanItemsFor({ admin: client, userId: "u-1", today: "2026-08-19" }), []);
});

Deno.test("lecture: une panne sur les PLANS rend `[]` — on ne sert pas une envie sur une lecture ratée", async () => {
  // Servir quand même reviendrait à décider « aucun plan validé » sur une
  // erreur, c'est-à-dire ressusciter des lignes qu'une validation a fermées.
  const { client } = fakeAdmin({
    constraints: { retained_next_plan: [storedCraving("des fajitas", "2026-08-17")] },
    plansError: "boom",
  });
  assertEquals(await nextPlanItemsFor({ admin: client, userId: "u-1", today: "2026-08-19" }), []);
});

Deno.test("lecture: un `today` illisible ne touche PAS la base", async () => {
  const { client, calls } = fakeAdmin({ constraints: {} });
  assertEquals(await nextPlanItemsFor({ admin: client, userId: "u-1", today: "19/08/2026" }), []);
  assertEquals(calls, []);
});

Deno.test("lecture: une entrée sans ancre lisible ne sert rien", async () => {
  const { client } = fakeAdmin({
    constraints: {
      retained_next_plan: [{ item: retainedItemToJson(craving()), anchor: "pas une date" }],
    },
  });
  assertEquals(await nextPlanItemsFor({ admin: client, userId: "u-1", today: "2026-08-19" }), []);
});
