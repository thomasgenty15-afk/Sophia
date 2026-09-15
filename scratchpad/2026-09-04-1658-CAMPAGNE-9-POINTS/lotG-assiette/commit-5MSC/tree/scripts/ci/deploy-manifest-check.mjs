#!/usr/bin/env node
// KEEL — deploy manifest check.
//
// WHY THIS EXISTS
// `wiring-check.mjs` owns the edges INSIDE the repo (does anybody call this
// module?). This script owns the edge between the repo and the DEPLOYED
// environment — the three seams that have already burned this project:
//
//   1. A function exists on disk and nobody knows whether it ships.
//      `review-plan-v1` is 999 lines, calls Gemini, and has zero callers. A
//      blanket `supabase functions deploy` puts an unauthenticated LLM cost
//      surface online. A deploy list that lives in somebody's head is not a
//      deploy list.
//
//   2. A function ships without its `config.toml` entry.
//      `coach-invite-student-v1` was deployed with the gateway default
//      (verify_jwt = true) while it authenticates IN-FUNCTION. Kong rejected
//      the coach's ES256 token before the function ever ran: a 401 nobody
//      could explain, in a browser, on the invitation flow. The per-function
//      `supabase/functions/<name>/config.toml` is NOT read by the CLI —
//      `supabase/config.toml` is the only place the setting takes effect.
//
//   3. A cron posts a body the function does not parse.
//      `keel-evaluate-adherence` fires `{"mode":"due"}` at
//      `evaluate-adherence-v1`, whose handler has zero occurrences of `mode`
//      and answers `400 user_id is required`. The job row exists, the schedule
//      is right, `cron.job_run_details` says `succeeded` (pg_net returns a
//      request id, not a status), and every student is swept `missed`. The
//      verification that "the chain is scheduled in the DB" is true and
//      useless: a scheduled job that 400s is indistinguishable from a working
//      one unless somebody reads the body contract.
//
// All three are statically decidable. None of them is caught by a unit test,
// because all three live outside the module.
//
// Usage:  node scripts/ci/deploy-manifest-check.mjs
// Exit 1 on any violation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FUNCTIONS_DIR = path.join(ROOT, "supabase/functions");
const MIGRATIONS_DIR = path.join(ROOT, "supabase/migrations");
const DEPLOY_DOC = path.join(ROOT, "docs/keel/DEPLOY.md");
const CONFIG_TOML = path.join(ROOT, "supabase/config.toml");

const violations = [];
const fail = (kind, subject, detail) => violations.push({ kind, subject, detail });

// ---------------------------------------------------------------------------
// 0. What is on disk
// ---------------------------------------------------------------------------

function deployableFunctions() {
  if (!fs.existsSync(FUNCTIONS_DIR)) return [];
  return fs
    .readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "_shared" && e.name !== "node_modules")
    .map((e) => e.name)
    .filter((name) => fs.existsSync(path.join(FUNCTIONS_DIR, name, "index.ts")))
    .sort();
}

const onDisk = deployableFunctions();
const onDiskSet = new Set(onDisk);

// ---------------------------------------------------------------------------
// 1. The manifest in DEPLOY.md
//
// Three fenced blocks, machine-read. A fence is used rather than a table so
// that the list cannot drift into prose:
//   ```keel-deploy            -> ships
//   ```keel-do-not-deploy     -> deliberately withheld, one reason per line
//   ```keel-auth-in-function  -> must carry verify_jwt = false in config.toml
// ---------------------------------------------------------------------------

function fencedBlock(markdown, info) {
  const re = new RegExp("```" + info + "\\r?\\n([\\s\\S]*?)```", "m");
  const m = markdown.match(re);
  return m ? m[1] : null;
}

// An entry is "name", optionally followed by "PENDING:<owner>" and a reason.
// PENDING is the repo's existing convention (see the `day_targets.ts`
// exemption in wiring-check.mjs): a debt that stays VISIBLE on every CI run
// instead of a silence. It is printed on success, never hidden.
function entriesIn(block) {
  if (block === null) return null;
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const name = line.split(/[\s#]/)[0].trim();
      const pending = line.match(/PENDING:([^\s]+)/);
      return { name, pending: pending ? pending[1] : null, owner: pending ? pending[1] : null, line };
    })
    .filter((e) => e.name);
}

function namesIn(block) {
  const entries = entriesIn(block);
  return entries === null ? null : entries.map((e) => e.name);
}

let deployList = [];
let withheldList = [];
let authInFunctionList = [];
let authInFunctionEntries = [];
// Known cron-body mismatches, each with an owner. Same convention as the
// `day_targets.ts` exemption in wiring-check.mjs: a DATED, VISIBLE debt beats
// both a hidden pass and a red that somebody disables. Format of an entry:
//   <jobname>:<key>  PENDING:<owner>  reason
let cronPendingEntries = [];

if (!fs.existsSync(DEPLOY_DOC)) {
  fail(
    "missing-doc",
    "docs/keel/DEPLOY.md",
    "The deploy manifest is the document. Without it there is no list to check against.",
  );
} else {
  const doc = fs.readFileSync(DEPLOY_DOC, "utf8");
  for (const [info, sink] of [
    ["keel-deploy", (v) => (deployList = v)],
    ["keel-do-not-deploy", (v) => (withheldList = v)],
    ["keel-auth-in-function", (v) => {
      authInFunctionEntries = v;
      authInFunctionList = v.map((e) => e.name);
    }],
    ["keel-cron-contract-pending", (v) => (cronPendingEntries = v)],
  ]) {
    const block = fencedBlock(doc, info);
    const parsed = info.startsWith("keel-auth") || info.endsWith("-pending")
      ? entriesIn(block)
      : namesIn(block);
    if (parsed === null) {
      fail("missing-block", info, `docs/keel/DEPLOY.md has no \`\`\`${info} block.`);
    } else {
      sink(parsed);
    }
  }
}

const declared = new Map();
for (const [list, label] of [[deployList, "deploy"], [withheldList, "do-not-deploy"]]) {
  for (const name of list) {
    if (declared.has(name)) {
      fail("duplicate-entry", name, `Listed twice (${declared.get(name)} and ${label}).`);
      continue;
    }
    declared.set(name, label);
    if (!onDiskSet.has(name)) {
      fail(
        "phantom-entry",
        name,
        `Listed in DEPLOY.md (${label}) but supabase/functions/${name}/index.ts does not exist.`,
      );
    }
  }
}

for (const name of onDisk) {
  if (!declared.has(name)) {
    fail(
      "undeclared-function",
      name,
      "On disk but absent from DEPLOY.md. Say whether it ships or state why it must not — " +
        "an undeclared function is deployed by accident or withheld by accident.",
    );
  }
}

// ---------------------------------------------------------------------------
// 2. config.toml integrity
// ---------------------------------------------------------------------------

let configToml = "";
if (!fs.existsSync(CONFIG_TOML)) {
  fail("missing-config", "supabase/config.toml", "Cannot verify gateway settings.");
} else {
  configToml = fs.readFileSync(CONFIG_TOML, "utf8");
}

// [functions.<name>] sections and whether the section sets verify_jwt = false.
const sections = new Map();
{
  const lines = configToml.split("\n");
  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    const header = line.match(/^\[functions\.([A-Za-z0-9._-]+)\]$/);
    if (header) {
      current = header[1];
      if (!sections.has(current)) sections.set(current, false);
      continue;
    }
    if (line.startsWith("[")) {
      current = null;
      continue;
    }
    if (current && /^verify_jwt\s*=\s*false\b/.test(line)) sections.set(current, true);
  }
}

for (const name of sections.keys()) {
  if (!onDiskSet.has(name)) {
    fail(
      "stale-config-section",
      name,
      `supabase/config.toml declares [functions.${name}] but no such function exists on disk.`,
    );
  }
}

const pendingGates = [];

for (const entry of authInFunctionEntries) {
  const name = entry.name;
  if (!onDiskSet.has(name)) {
    fail("phantom-entry", name, "Listed as auth-in-function but not on disk.");
    continue;
  }
  if (declared.get(name) === "do-not-deploy") {
    fail(
      "withheld-but-configured",
      name,
      "Listed as auth-in-function while marked do-not-deploy. Pick one.",
    );
    continue;
  }
  if (sections.get(name) === true) {
    if (entry.pending) {
      fail(
        "stale-pending",
        name,
        `Marked PENDING:${entry.pending} but [functions.${name}] verify_jwt = false is already ` +
          "in supabase/config.toml. Remove the marker — a pending flag nobody clears is noise.",
      );
    }
    continue;
  }
  const detail =
    "Authenticates in-function (auth.getUser / x-internal-secret / provider signature) but " +
    `supabase/config.toml has no [functions.${name}] verify_jwt = false. The gateway rejects ` +
    "the caller before the function runs — a 401 that looks like an auth bug and is a config " +
    "bug. A per-function supabase/functions/<name>/config.toml is NOT read by the CLI.";
  if (entry.pending) {
    pendingGates.push({ name, owner: entry.pending, detail });
  } else {
    fail("missing-verify-jwt-false", name, detail);
  }
}

// ---------------------------------------------------------------------------
// 3. Cron body <-> function contract  (KEEL migrations only)
//
// Scoped to `*_keel_*.sql` on purpose: those files are the live authority for
// the KEEL jobs, and pre-KEEL migration history contains scheduling calls that
// later migrations unschedule through dynamic loops no parser can follow. A
// guard that cries wrong is a guard that gets disabled.
// ---------------------------------------------------------------------------

const CALL_RE =
  /(?:pg_temp\.)?(?:keel_)?schedule_internal_edge_job\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*(?:,\s*'([\s\S]*?)'\s*::\s*jsonb\s*)?\)/g;

let scheduledJobs = 0;

if (fs.existsSync(MIGRATIONS_DIR)) {
  const keelMigrations = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && f.includes("_keel_"))
    .sort();

  for (const file of keelMigrations) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    for (const m of sql.matchAll(CALL_RE)) {
      const [, jobName, schedule, fnName, bodyRaw] = m;
      scheduledJobs++;

      if (!onDiskSet.has(fnName)) {
        fail(
          "cron-target-missing",
          `${jobName} -> ${fnName}`,
          `${file} schedules a job against a function that does not exist on disk. ` +
            "pg_net does not surface the 404: cron.job_run_details will read `succeeded`.",
        );
        continue;
      }

      if (declared.get(fnName) === "do-not-deploy") {
        fail(
          "cron-target-withheld",
          `${jobName} -> ${fnName}`,
          `${file} schedules a job against a function DEPLOY.md withholds. ` +
            "The cron will 404 in production, silently.",
        );
      }

      if (!bodyRaw) continue;
      let body;
      try {
        body = JSON.parse(bodyRaw);
      } catch {
        fail(
          "cron-body-unparseable",
          `${jobName} -> ${fnName}`,
          `${file}: body is not valid JSON: ${bodyRaw}`,
        );
        continue;
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) continue;

      const source = functionSource(fnName);
      for (const key of Object.keys(body)) {
        if (source.includes(`"${key}"`) || source.includes(`'${key}'`) || source.includes(`.${key}`)) {
          continue;
        }
        const subject = `${jobName} -> ${fnName} { ${key} }`;
        const detail =
          `${file} posts \`${JSON.stringify(body)}\`, but "${key}" appears nowhere in ` +
          `supabase/functions/${fnName}/. The function cannot branch on a field it never ` +
          "reads: the job runs on schedule, gets a 4xx, and pg_net records `succeeded`. " +
          "This is the exact shape of the defect that swept every compliant student to `missed`.";
        const pending = cronPendingEntries.find((e) => e.name === `${jobName}:${key}`);
        if (pending) {
          pending.consumed = true;
          pendingGates.push({ name: subject, owner: pending.owner ?? "unowned", detail });
        } else {
          fail("cron-body-ignored", subject, detail);
        }
      }
    }
  }
}

// A pending marker that no longer describes a real mismatch is noise. It must
// be removed the day the function learns to read its key — otherwise the next
// occurrence hides behind it.
for (const entry of cronPendingEntries) {
  if (!entry.consumed) {
    fail(
      "stale-cron-pending",
      entry.name,
      "Declared in ```keel-cron-contract-pending but no such mismatch exists any more. " +
        "Delete the line: the defect is fixed, and a stale exemption is where the next one hides.",
    );
  }
}

function functionSource(name) {
  const dir = path.join(FUNCTIONS_DIR, name);
  let out = "";
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/_test\.ts$|\.test\.tsx?$/.test(e.name)) {
        out += fs.readFileSync(p, "utf8");
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

// Pending gates are printed whether the run is green or red. They are the
// human's pre-flight list, not a silence.
for (const g of pendingGates) {
  console.warn(`deploy-manifest-check PENDING [${g.owner}] ${g.name}`);
  console.warn(`      ${g.detail}\n`);
}

if (violations.length === 0) {
  console.log(
    `deploy-manifest-check OK (${onDisk.length} functions: ${deployList.length} deploy, ` +
      `${withheldList.length} withheld · ${authInFunctionList.length} auth-in-function, ` +
      `${pendingGates.length} pending · ${scheduledJobs} KEEL cron job(s))`,
  );
  process.exit(0);
}

console.error(`deploy-manifest-check FAILED — ${violations.length} violation(s):\n`);
for (const v of violations) {
  console.error(`  [${v.kind}] ${v.subject}`);
  console.error(`      ${v.detail}\n`);
}
console.error(
  "A deploy list that lives in somebody's head is not a deploy list, and a scheduled job\n" +
    "that 4xx's looks exactly like a working one. Fix the seam or declare it in DEPLOY.md.",
);
process.exit(1);
