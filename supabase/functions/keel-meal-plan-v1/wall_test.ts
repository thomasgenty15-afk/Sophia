import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

/**
 * KEEL — THE WALL, asserted as a test rather than trusted as a habit.
 *
 * Q6 §2.4 states the doctrinal decision this whole module rests on:
 *
 *   "the scaffolding writes NO protocol_event. Otherwise it lifts the display
 *    gate on its own [...] it is irreversible once released: it is the most
 *    important doctrinal decision of the batch."
 *
 * and §3.B asks for the falsifiability test: deleting the meal layer must
 * leave the evaluator's results byte-identical. These four tests are that
 * property, expressed the only way a unit test can express it — by reading the
 * sources and asserting the edges DO NOT exist.
 *
 * If one of them goes red, the meal layer has started to score. Do not relax
 * the assertion; find the write.
 */

// `.pathname` percent-encodes the space in this repo's own path; fromFileUrl
// is the decode. A test that cannot find the file it audits is a green light
// for the wrong reason, so this detail matters here more than usual.
import { fromFileUrl } from "https://deno.land/std@0.168.0/path/mod.ts";

const ROOT = fromFileUrl(new URL("../../../", import.meta.url));

const MEAL_TABLES = ["meal_ideas", "meal_plan_entries"];

/**
 * Comments stripped, newlines preserved. The doctrine comments in these files
 * NAME `commitment_evaluations` and `protocol_events` on purpose — explaining
 * what must never be written is the documentation we want to keep. What the
 * assertions below look for is a reference in CODE.
 */
function strippedCode(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + m.slice(p1.length).replace(/./g, " "));
}

/** Every file whose name marks it as part of the grading path. */
async function evaluatorSources(): Promise<string[]> {
  const out: string[] = [];
  const roots = [
    `${ROOT}supabase/functions/_shared/keel`,
    `${ROOT}supabase/functions/evaluate-adherence-v1`,
  ];
  for (const dir of roots) {
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
      if (/_test\.ts$/.test(entry.name)) continue;
      out.push(`${dir}/${entry.name}`);
    }
  }
  return out;
}

Deno.test("no evaluator source mentions a meal table", async () => {
  const offenders: string[] = [];
  for (const file of await evaluatorSources()) {
    const src = strippedCode(await Deno.readTextFile(file));
    for (const table of MEAL_TABLES) {
      if (src.includes(table)) offenders.push(`${file} mentions ${table}`);
    }
  }
  // Deleting the meal layer must leave the evaluator byte-identical. A mention
  // anywhere in the grading path is the first step away from that.
  assertEquals(offenders, []);
});

Deno.test("this function writes to the two meal tables and to nothing else", async () => {
  const src = strippedCode(await Deno.readTextFile(new URL("./index.ts", import.meta.url)));
  const written = new Set<string>();
  // `.from("x")` followed anywhere later by a mutation is too loose; instead
  // read the literal table names this file names at all, then allowlist the
  // read-only ones explicitly.
  for (const m of src.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)/g)) written.add(m[1]);

  const READ_ONLY = new Set([
    "coaches",
    "plan_versions",
    "plan_commitments",
    "slot_vocabulary",
    "food_groups",
  ]);
  const unexpected = [...written].filter(
    (tbl) => !READ_ONLY.has(tbl) && !MEAL_TABLES.includes(tbl),
  );
  assertEquals(unexpected, []);

  // The three names that would mean the scaffolding had crossed the wall.
  for (const forbidden of ["protocol_events", "commitment_evaluations", "weekly_reviews"]) {
    assert(
      !src.includes(forbidden),
      `${forbidden} appears in keel-meal-plan-v1 — the meal layer must not reach the counter`,
    );
  }

  // And the mutation verbs must only ever be applied after a `.from` on a meal
  // table. `plan_commitments` and `plan_versions` are read here, never written.
  for (const readOnly of READ_ONLY) {
    const re = new RegExp(
      `\\.from\\(\\s*"${readOnly}"\\s*\\)[\\s\\S]{0,200}?\\.(insert|update|upsert|delete)\\(`,
    );
    assert(!re.test(src), `keel-meal-plan-v1 mutates ${readOnly}, which it may only read`);
  }
});

Deno.test("no model client is imported anywhere in this function", async () => {
  for await (const entry of Deno.readDir(new URL(".", import.meta.url))) {
    if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
    if (/_test\.ts$/.test(entry.name)) continue; // this file names the markers
    const src = await Deno.readTextFile(new URL(`./${entry.name}`, import.meta.url));
    for (const marker of ["generateWithVision", "_shared/vision", "_shared/llm", "anthropic", "openai"]) {
      assert(
        !src.includes(marker),
        `${entry.name} references ${marker} — the coach is the author of a meal, not a model`,
      );
    }
  }
});

Deno.test("the migration keeps author_kind to two values, neither of them a model", async () => {
  const raw = await Deno.readTextFile(
    `${ROOT}supabase/migrations/20260728120000_keel_meal_scaffolding.sql`,
  );
  // Same reason as strippedCode above: the migration header EXPLAINS that
  // there is no 'ai' value. Explaining the invariant is not violating it.
  const sql = raw.replace(/--[^\n]*/g, "");
  assert(
    /author_kind\s+text\s+not\s+null[\s\S]{0,120}check\s*\(\s*author_kind\s+in\s*\(\s*'coach'\s*,\s*'keel_library'\s*\)\s*\)/i
      .test(sql),
    "meal_ideas.author_kind lost its two-value CHECK",
  );
  assert(!/'ai'/.test(sql), "an 'ai' author value appeared in the meal migration");
  // No trigger in this migration may write a fact.
  assert(
    !/insert\s+into\s+public\.protocol_events/i.test(sql),
    "the meal migration writes a protocol_event",
  );
});
