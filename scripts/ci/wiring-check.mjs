#!/usr/bin/env node
// KEEL — wiring check.
//
// WHY THIS EXISTS
// The night that built KEEL produced 2395 green tests and shipped THIRTEEN
// modules that nothing ever called: the adherence evaluator, the weekly-review
// writer, the contract_change_requests reader, the crisis-resource resolver,
// the medical-constraint validator, the response-language block…
//
// The cause is structural, not sloppiness: a unit test is green *precisely
// when the module is isolated*. Tests prove branches; they never prove edges.
// And the edge — the caller — belongs to somebody else's ticket, often a later
// wave. So nobody owns it, and nothing fails when it is missing.
//
// This script owns the edges. For every KEEL production module it asserts that
// at least one PRODUCTION caller exists: another production module, an edge
// function, a cron job, or a frontend route. Tests, comments and type-only
// imports do not count — those are exactly what made the thirteen invisible.
//
// Usage:  node scripts/ci/wiring-check.mjs
// Exit 1 on any unwired module.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// ---------------------------------------------------------------------------
// What we watch
// ---------------------------------------------------------------------------

const WATCHED = [
  { dir: "supabase/functions/_shared/keel", label: "shared/keel" },
  { dir: "supabase/functions/sophia-brain/context", label: "brain/context", only: /^keel_/ },
];

// Edge functions whose entrypoint must be reachable by something.
const KEEL_EDGE_FUNCTIONS = [
  "plan-import-v1",
  "plan-publish-v1",
  "plan-template-v1",
  "coach-signup-v1",
  "coach-invite-student-v1",
  "provision-day-v1",
  "evaluate-adherence-v1",
  "meal-photo-upload-v1",
  "analyze-meal-photo-v1",
  "keel-week-rollover-v1",
  // W10 — the monthly seat reconciliation. Listed here because a billing job
  // nothing calls is the most expensive shape of the "thirteen unwired modules"
  // failure: it is silent, and the silence looks like "no seats to bill".
  "stripe-reconcile-seats",
  // W8 — the card runtime. Its arming sweep is the only thing that puts a card
  // in front of a student BEFORE the meal; unwired, the cards exist and never
  // arrive, which looks exactly like "the students do not use cards".
  "keel-cards-v1",
  // Q6 — the meal scaffolding. The coach composes the week; the student reads
  // it under RLS without ever calling this function. Listed here because the
  // whole feature is one coach screen: unwired, the tables fill up and the
  // grid nobody can reach looks exactly like "coaches do not plan meals".
  "keel-meal-plan-v1",
];

// A module may be exempt only with a reason that survives review.
// An exemption is a promise that the edge is coming, not a place to hide.
const EXEMPT = new Map([
  ["relations.ts", "CONTRACT non-input #1: read by render/safety only, never the evaluator. Its absence from the evaluator IS the invariant."],
  ["tokens.ts", "Vocabulary module: imported everywhere, no single owner edge."],
  ["labels.en.ts", "i18n resource, consumed by render surfaces."],
  // NOT a hiding place — a dated debt, visible on every CI run.
  // day_targets.ts is the KEEL slot-aware loader written in W4.3 to replace the
  // legacy `alreadyLoggedItemIds` filter (logging breakfast made dinner vanish
  // from every follow-up). It is unwired: process-checkins and
  // schedule-checkins-v2 still import `_shared/action_occurrences.ts`,
  // so the defect is LIVE for KEEL students today.
  // Owner: W7 (evening review). Remove this line when the evening review reads
  // day_targets — the check must go red if W7 ships without it.
  ["day_targets.ts", "W7-PENDING: written in W4.3, still unwired; the legacy loader it replaces is the one in use."],
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isTest = (f) => /_test\.ts$|\.test\.tsx?$|\.int\.test\.ts$/.test(f);

function walk(dir, acc = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return acc;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, acc);
    else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) acc.push(rel);
  }
  return acc;
}

/** Every production source file we may look inside for a caller. */
function productionSources() {
  const out = [];
  for (const base of ["supabase/functions", "frontend/src"]) {
    for (const f of walk(base)) {
      if (isTest(f)) continue;
      if (f.includes("/node_modules/")) continue;
      out.push(f);
    }
  }
  return out;
}

/**
 * Strip comments and type-only imports before looking for a caller.
 * This is the whole point: a mention inside a comment, or an
 * `import type { X }`, is exactly the kind of false green that let thirteen
 * modules ship unwired.
 */
function productionCode(file) {
  let src = fs.readFileSync(path.join(ROOT, file), "utf8");
  src = src.replace(/\/\*[\s\S]*?\*\//g, "");
  src = src.replace(/^\s*\/\/.*$/gm, "");
  src = src.replace(/^\s*import\s+type\s[\s\S]*?from\s+["'][^"']+["'];?/gm, "");
  return src;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const violations = [];
const sources = productionSources();
const codeCache = new Map();
const codeOf = (f) => {
  if (!codeCache.has(f)) codeCache.set(f, productionCode(f));
  return codeCache.get(f);
};

// 1. Every watched module has a production importer.
let checkedModules = 0;
for (const { dir, label, only } of WATCHED) {
  for (const file of walk(dir)) {
    const base = path.basename(file);
    if (isTest(file)) continue;
    if (only && !only.test(base)) continue;
    if (EXEMPT.has(base)) continue;
    checkedModules++;

    const moduleName = base.replace(/\.tsx?$/, "");
    const importers = sources.filter((s) => {
      if (s === file) return false;
      const code = codeOf(s);
      return new RegExp(`from\\s+["'][^"']*${moduleName}\\.ts["']`).test(code);
    });

    if (importers.length === 0) {
      violations.push({
        kind: "unwired-module",
        subject: `${label}/${base}`,
        detail:
          "no production importer (tests, comments and `import type` excluded). " +
          "Either wire it, or add it to EXEMPT with a reason.",
      });
    }
  }
}

// 2. Every KEEL edge function is reachable: declared in config.toml, and
//    called by a cron migration, another function, or the frontend.
const configToml = fs.existsSync(path.join(ROOT, "supabase/config.toml"))
  ? fs.readFileSync(path.join(ROOT, "supabase/config.toml"), "utf8")
  : "";
const migrations = walk("supabase/migrations").length
  ? []
  : [];
const migrationSql = fs
  .readdirSync(path.join(ROOT, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"))
  .join("\n");

for (const fn of KEEL_EDGE_FUNCTIONS) {
  const entry = path.join("supabase/functions", fn, "index.ts");
  if (!fs.existsSync(path.join(ROOT, entry))) {
    violations.push({ kind: "missing-entrypoint", subject: fn, detail: "no index.ts" });
    continue;
  }
  if (!configToml.includes(`[functions.${fn}]`)) {
    violations.push({
      kind: "undeclared-function",
      subject: fn,
      detail:
        "absent from supabase/config.toml. A per-function config.toml inside the " +
        "folder is NOT read by the CLI — this is how coach-invite-student-v1 " +
        "shipped 401-ing behind the gateway.",
    });
  }
  const calledByCron = migrationSql.includes(`/${fn}`) || migrationSql.includes(`'${fn}'`);
  // Callers rarely write the full path: the frontend builds
  // `${FUNCTIONS_BASE}/plan-import-v1`, and edge code uses
  // `functions.invoke("name")`. So look for the name as a path segment or a
  // quoted string — anywhere outside the function's own folder.
  const nameRefs = [
    new RegExp(`/${fn}(?![\\w-])`),
    new RegExp(`["'\`]${fn}["'\`]`),
  ];
  const calledByCode = sources.some((s) => {
    if (s.startsWith(`supabase/functions/${fn}/`)) return false;
    const code = codeOf(s);
    return nameRefs.some((re) => re.test(code));
  });
  if (!calledByCron && !calledByCode) {
    violations.push({
      kind: "unreachable-function",
      subject: fn,
      detail:
        "no cron job and no caller (frontend or another function) invokes it. " +
        "This is the defect that made the adherence evaluator never run.",
    });
  }
}

// 3. The KEEL direct effects must appear in the runtime lane, not only in
//    their own folder — the exact shape of the W4 "inert loop" defect.
const runTs = fs.existsSync(path.join(ROOT, "supabase/functions/sophia-brain/router/run.ts"))
  ? codeOf("supabase/functions/sophia-brain/router/run.ts")
  : "";
for (const effect of ["log_protocol_event", "declare_deviation"]) {
  if (runTs && !runTs.includes(effect)) {
    violations.push({
      kind: "unwired-effect",
      subject: effect,
      detail: "declared as a DirectEffectType but absent from router/run.ts — the effect can never execute.",
    });
  }
}

// 4. A PLAN HAS ONE SHAPE. Every screen that renders a plan's lines must read
//    its sections from `frontend/src/keel/api/planStructure.ts`.
//
//    THE DEFECT. The same eighteen lines were laid out three different ways:
//    the import review had the coach's four food headings, the template editor
//    had one flat `lines.map()`, the student's day had occasions. None of the
//    three was buggy — that is why it survived — and a coach who signed a plan
//    under four headings reopened it as a flat column of eighteen rows.
//
//    Sharing a PREDICATE was not enough: all three already called `planPartOf`
//    and then each built its own layout on top of it. So the rule is about the
//    MODULE, not the predicate: a screen that shows a list of commitments and
//    does not import `planStructure` is, by construction, building a fourth
//    structure — whatever it looks like today.
const PLAN_STRUCTURE_MODULE = "frontend/src/keel/api/planStructure.ts";

// The screens that render a plan's lines. This list is manual on purpose: a new
// screen is a decision, and registering it is the moment to ask which structure
// it shows. The two nets below are what catch the screen nobody registered.
const PLAN_SCREENS = [
  "frontend/src/keel/pages/PlanImportPage.tsx",
  "frontend/src/keel/pages/TemplatesPage.tsx",
  "frontend/src/keel/pages/TodayPage.tsx",
];

const importsPlanStructure = (code) => /from\s+["'][^"']*\/planStructure(\.ts)?["']/.test(code);

if (!fs.existsSync(path.join(ROOT, PLAN_STRUCTURE_MODULE))) {
  violations.push({
    kind: "missing-structure-module",
    subject: PLAN_STRUCTURE_MODULE,
    detail: "the one module that owns the shape of a plan is gone; every screen is free to invent its own again.",
  });
} else {
  for (const screen of PLAN_SCREENS) {
    if (!fs.existsSync(path.join(ROOT, screen))) {
      violations.push({
        kind: "unknown-plan-screen",
        subject: screen,
        detail: "registered as a screen that renders a plan, but the file does not exist. Update PLAN_SCREENS.",
      });
      continue;
    }
    if (!importsPlanStructure(codeOf(screen))) {
      violations.push({
        kind: "unshared-plan-structure",
        subject: screen,
        detail:
          "renders a list of commitments without importing api/planStructure.ts. " +
          "Sections built here are a second shape for the same plan — the defect " +
          "that gave one document three different layouts.",
      });
    }
  }

  // NET 1 — the coach's food headings are a vocabulary, and it belongs to one
  // module. A file writing `every_day` / `cutting` / `supplements` as bare
  // literals is re-deriving the sections, whatever it calls the variable.
  // (`when.every_day` and `food_section.every_day` are i18n KEYS, not bare
  // literals, and do not match.)
  const FOOD_SECTION_LITERAL = /["'](every_day|every_week|cutting|supplements)["']/;
  // NET 2 — a screen nobody registered: it RENDERS a collection of plan lines
  // and never asks the shared module what the sections are. The leading `{` is
  // what makes it a render rather than a payload: `commitments: commitments.map(...)`
  // building a request body is not a second layout of anything.
  const PLAN_LINES_RENDER = /\{\s*[\w.]*\b(\w*[lL]ines|\w*[cC]ommitments|\w*[dD]rafts)\s*\.\s*map\(/;

  // An exemption is a promise that the surface was LOOKED AT, not a place to
  // hide. Each one names why the plan's sections do not apply to it.
  const PLAN_STRUCTURE_EXEMPT = new Map([
    [
      "frontend/src/keel/components/WeekView.tsx",
      "The week GRID: its axis is the calendar (one row per line, one column per " +
      "day), not the plan's headings. It shows adherence over seven days, and " +
      "sectioning the rows would break the matrix. If it ever grows headings " +
      "above those rows, they must come from planStructure.ts.",
    ],
  ]);

  for (const file of walk("frontend/src/keel")) {
    if (isTest(file)) continue;
    if (file === PLAN_STRUCTURE_MODULE) continue;
    if (PLAN_STRUCTURE_EXEMPT.has(file)) continue;
    // Already checked by name above; reporting it twice says nothing new.
    if (PLAN_SCREENS.includes(file)) continue;
    const code = codeOf(file);
    if (importsPlanStructure(code)) continue;
    const reason = FOOD_SECTION_LITERAL.test(code)
      ? "names the coach's food headings itself"
      : PLAN_LINES_RENDER.test(code)
      ? "renders a list of plan lines"
      : null;
    if (reason === null) continue;
    violations.push({
      kind: "unshared-plan-structure",
      subject: file,
      detail:
        `${reason} without importing api/planStructure.ts. Read the sections ` +
        "from it, or — if this file genuinely shows no plan — stop naming its " +
        "vocabulary. A fourth structure is how the first three happened.",
    });
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (violations.length === 0) {
  console.log(
    `wiring-check OK (${checkedModules} modules, ${KEEL_EDGE_FUNCTIONS.length} functions, ` +
      `2 effects, ${PLAN_SCREENS.length} plan screens on one structure)`,
  );
  process.exit(0);
}

console.error(`wiring-check FAILED — ${violations.length} unwired item(s):\n`);
for (const v of violations) {
  console.error(`  [${v.kind}] ${v.subject}`);
  console.error(`      ${v.detail}\n`);
}
console.error(
  "A module nobody calls is not a feature. Wire it, delete it, or exempt it with a reason.",
);
process.exit(1);
