import { assertEquals, assertRejects } from "jsr:@std/assert@1";

import {
  type FollowingDb,
  resolveStudentFollowing,
} from "./following_io.ts";

/**
 * Un faux qui enregistre CE QUI A ÉTÉ DEMANDÉ, pas seulement ce qui est rendu.
 * L'ordre des lectures est une propriété du module (la surface la plus probable
 * d'abord, les deux autres jamais lues quand la première répond), et un faux qui
 * ne le voit pas laisserait passer trois requêtes là où une suffit.
 */
function fakeDb(
  rows: Record<string, unknown[]>,
  opts: { failOn?: string } = {},
): { db: FollowingDb; tables: string[]; filters: string[] } {
  const tables: string[] = [];
  const filters: string[] = [];
  const db = {
    from(table: string) {
      tables.push(table);
      const result = opts.failOn === table
        ? { data: null, error: { message: `read failed on ${table}` } }
        : { data: rows[table] ?? [], error: null };
      // CHAÎNABLE, comme le vrai client: chaque filtre rend l'objet filtrable.
      // Un faux qui rend un `tail` après le premier filtre ne peut pas voir un
      // second — et c'est exactement ce qui manquait quand `retired_at is null`
      // est venu s'ajouter.
      const filtered = {
        eq(column: string, value: string) {
          filters.push(`${table}.${column}=${value}`);
          return filtered;
        },
        gte(column: string, value: string) {
          filters.push(`${table}.${column}>=${value}`);
          return filtered;
        },
        is(column: string, _value: null) {
          filters.push(`${table}.${column} is null`);
          return filtered;
        },
        limit: (_n: number) => Promise.resolve(result),
      };
      return { select: (_c: string) => ({ eq: () => filtered }) };
    },
  } as unknown as FollowingDb;
  return { db, tables, filters };
}

const WEEK = "2026-08-03";

Deno.test("un repas composé cette semaine suffit — c'est la surface vivante du 1:N", async () => {
  const { db, tables } = fakeDb({ student_generated_meals: [{ id: "m1" }] });
  assertEquals(await resolveStudentFollowing(db, "u1", WEEK), {
    following: true,
    source: "generated_meals",
  });
  // Les deux autres lectures ne partent pas: elles ne servent qu'en repli.
  assertEquals(tables, ["student_generated_meals"]);
});

Deno.test("la fenêtre COUVRE la semaine, elle n'est pas datée de l'écriture", async () => {
  // C'ÉTAIT `created_at >= lundi`, et le défaut se voyait: un plan composé le
  // DIMANCHE pour la semaine qui commence lundi ne comptait pas. L'élève suivait
  // pourtant un plan, et le tap du soir lui était retenu en silence — le mode
  // d'échec que l'en-tête de ce module raconte.
  const { db, filters } = fakeDb({ student_generated_meals: [{ id: "m1" }] });
  await resolveStudentFollowing(db, "u1", WEEK);
  assertEquals(filters, [
    "student_generated_meals.retired_at is null",
    `student_generated_meals.ends_on>=${WEEK}`,
  ]);
});

// GARDÉE, PAS REMPLACÉE. Élargir une garde ne doit retirer l'accès à personne:
// une semaine adoptée existante continue de compter.
Deno.test("une semaine adoptée compte encore", async () => {
  const { db, tables } = fakeDb({ student_week_plans: [{ id: "w1" }] });
  assertEquals(await resolveStudentFollowing(db, "u1", WEEK), {
    following: true,
    source: "adopted_week_plan",
  });
  // L'ORDRE EST UNE PROPRIÉTÉ DU MODULE, pas un détail: `household_members`
  // s'intercale APRÈS la surface vivante du 1:N et AVANT les deux replis, pour
  // que le compte maître — qui répond sur la première — ne le paie jamais.
  assertEquals(tables, [
    "student_generated_meals",
    "household_members",
    "student_week_plans",
  ]);
});

// Le chemin 1:1 est gardé exprès (CLAUDE.md): un élève à qui un coach a publié
// un plan suit quelque chose, même sans avoir composé un repas.
Deno.test("un plan 1:1 publié compte encore", async () => {
  const { db, tables } = fakeDb({ plan_versions: [{ id: "p1" }] });
  assertEquals(await resolveStudentFollowing(db, "u1", WEEK), {
    following: true,
    source: "published_plan_version",
  });
  assertEquals(tables, [
    "student_generated_meals",
    "household_members",
    "student_week_plans",
    "plan_versions",
  ]);
});

// « Rien à suivre, rien à demander. » La garde ne disparaît pas: c'est elle qui
// empêche d'envoyer « comment s'est passée ta journée ? » à quelqu'un qui ne
// suit rien.
Deno.test("aucune des trois surfaces: la garde mord", async () => {
  const { db } = fakeDb({});
  assertEquals(await resolveStudentFollowing(db, "u1", WEEK), {
    following: false,
    source: "none",
  });
});

// LA DISTINCTION QUI COÛTE LE PLUS CHER SI ON LA RATE. Rendre `following:false`
// sur une lecture cassée retirerait silencieusement le tap du soir à toute une
// cohorte le jour d'une panne — exactement le défaut qu'on vient de réparer,
// avec une autre cause.
Deno.test("une lecture cassée lève, elle ne se déguise pas en 'ne suit rien'", async () => {
  const { db } = fakeDb({}, { failOn: "student_generated_meals" });
  await assertRejects(() => resolveStudentFollowing(db, "u1", WEEK));
});

// ───────────────────────────────────────────────────────────────────────────
// LE FOYER — la surface qui reproduisait le défaut d'origine sur du neuf
// ───────────────────────────────────────────────────────────────────────────

/**
 * Un faux qui sait rendre DEUX résultats différents pour la même table.
 *
 * `student_generated_meals` est lue deux fois — une fois par `user_id`, une
 * fois par `household_id` — et c'est tout le sujet: un membre non-maître n'a
 * AUCUNE ligne à son nom. Un faux qui rendrait la même chose aux deux appels
 * ne saurait pas distinguer « il compose lui-même » de « son foyer compose
 * pour lui », c'est-à-dire ne testerait pas la chose.
 */
function fakeHouseholdDb(opts: {
  ownMeals: boolean;
  householdId: string | null;
  householdMeals: boolean;
}): { db: FollowingDb; tables: string[] } {
  const tables: string[] = [];
  let mealReads = 0;
  const db = {
    from(table: string) {
      tables.push(table);
      const rows = (): unknown[] => {
        if (table === "student_generated_meals") {
          mealReads += 1;
          if (mealReads === 1) return opts.ownMeals ? [{ id: "m" }] : [];
          return opts.householdMeals ? [{ id: "hm" }] : [];
        }
        if (table === "household_members") {
          return opts.householdId ? [{ household_id: opts.householdId }] : [];
        }
        return [];
      };
      const filtered = {
        eq: () => filtered,
        gte: () => filtered,
        is: () => filtered,
        limit: () => Promise.resolve({ data: rows(), error: null }),
      };
      return { select: (_c: string) => ({ eq: () => filtered, limit: () => Promise.resolve({ data: rows(), error: null }) }) };
    },
  } as unknown as FollowingDb;
  return { db, tables };
}

Deno.test("LE DÉFAUT D'ORIGINE, REPRODUIT SUR DU NEUF: un membre non-maître suit", async () => {
  // Une composition de foyer appartient au `user_id` du COMPTE MAÎTRE. Les
  // autres membres n'ont donc aucune ligne à leur nom — et sans cette source
  // ils seraient tous écartés du tap du soir, en silence, exactement comme
  // l'était toute la cohorte 1:N avant ce module.
  const { db } = fakeHouseholdDb({
    ownMeals: false,
    householdId: "hh-1",
    householdMeals: true,
  });
  assertEquals(await resolveStudentFollowing(db, "u-membre", WEEK), {
    following: true,
    source: "household_meals",
  });
});

Deno.test("le compte maître répond sur SA ligne et ne lit jamais le foyer", async () => {
  // La lecture du foyer est un repli. Le compte maître a sa propre
  // composition: la faire payer à lui aussi serait un aller-retour de plus sur
  // le chemin majoritaire, pour rien.
  const { db, tables } = fakeHouseholdDb({
    ownMeals: true,
    householdId: "hh-1",
    householdMeals: true,
  });
  assertEquals((await resolveStudentFollowing(db, "u-maitre", WEEK)).source, "generated_meals");
  assertEquals(tables, ["student_generated_meals"]);
});

Deno.test("un foyer SANS composition vivante ne fait suivre personne", async () => {
  // La garde ne disparaît pas parce qu'on a rejoint un foyer. « Rien à suivre,
  // rien à demander » vaut aussi pour un foyer qui n'a rien composé.
  const { db } = fakeHouseholdDb({
    ownMeals: false,
    householdId: "hh-1",
    householdMeals: false,
  });
  assertEquals((await resolveStudentFollowing(db, "u-membre", WEEK)).following, false);
});

Deno.test("sans foyer, la lecture des compositions de foyer ne part pas", async () => {
  const { db, tables } = fakeHouseholdDb({
    ownMeals: false,
    householdId: null,
    householdMeals: true,
  });
  assertEquals((await resolveStudentFollowing(db, "u-seul", WEEK)).following, false);
  // `student_generated_meals` n'est lue qu'UNE fois: sans foyer, il n'y a pas
  // de second prédicat à essayer.
  assertEquals(
    tables.filter((t) => t === "student_generated_meals").length,
    1,
  );
});
