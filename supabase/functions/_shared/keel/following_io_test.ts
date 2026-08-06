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
  assertEquals(tables, ["student_generated_meals", "student_week_plans"]);
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
