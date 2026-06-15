#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const FUNCTIONS_ROOT = "supabase/functions";
const SHARED_ROOT = join(FUNCTIONS_ROOT, "_shared");
const MANIFEST_ROOT = "supabase/.temp/functions-deploy-manifests";
const MANIFEST_VERSION = 1;
const IGNORED_DIRS = new Set(["node_modules", ".git"]);
const IGNORED_FILES = new Set([".DS_Store"]);

function usage() {
  return [
    "Usage: node scripts/deploy-changed-functions.mjs [options] [-- <supabase deploy args>]",
    "",
    "Deploy Supabase Edge Functions whose local source hash differs from the last successful deploy manifest.",
    "",
    "Options:",
    "  --bootstrap            Run one global `supabase functions deploy`, then mark all local functions deployed.",
    "  --mark-current         Do not deploy; record current local hashes as already deployed.",
    "  --project-ref <ref>    Supabase project ref. Defaults to SUPABASE_PROJECT_REF or supabase/.temp/project-ref.",
    "  --dry-run              Print what would happen without deploying or writing the manifest.",
    "  -h, --help             Show this help.",
    "",
    "Examples:",
    "  npm run functions:deploy:bootstrap -- -- --no-verify-jwt",
    "  npm run functions:deploy:changed:dry-run",
    "  npm run functions:deploy:changed -- -- --no-verify-jwt",
    "  npm run functions:deploy:mark-current",
  ].join("\n");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
  });

  if (result.error) throw result.error;

  if (result.status !== 0 && options.allowFailure !== true) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    const details = [stderr, stdout].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed${details ? `:\n${details}` : ""}`);
  }

  return result;
}

function parseArgs(argv) {
  const options = {
    bootstrap: false,
    markCurrent: false,
    dryRun: false,
    projectRef: process.env.SUPABASE_PROJECT_REF ?? "",
    deployArgs: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--") {
      options.deployArgs = argv.slice(i + 1);
      break;
    }

    if (arg === "--bootstrap") {
      options.bootstrap = true;
      continue;
    }

    if (arg === "--mark-current") {
      options.markCurrent = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--project-ref") {
      options.projectRef = argv[++i] ?? "";
      continue;
    }

    if (arg.startsWith("--project-ref=")) {
      options.projectRef = arg.slice("--project-ref=".length);
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      console.log(usage());
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }

  if (options.bootstrap && options.markCurrent) {
    throw new Error("Use either --bootstrap or --mark-current, not both.");
  }

  return options;
}

function readProjectRef() {
  const tempProjectRefPath = "supabase/.temp/project-ref";
  if (!existsSync(tempProjectRefPath)) return "";
  return readFileSync(tempProjectRefPath, "utf8").trim();
}

function projectRefOrDefault(projectRef) {
  return projectRef || readProjectRef();
}

function manifestPath(projectRef) {
  const key = (projectRef || "linked-project").replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(MANIFEST_ROOT, `${key}.json`);
}

function loadManifest(projectRef) {
  const path = manifestPath(projectRef);
  if (!existsSync(path)) {
    return null;
  }

  const manifest = JSON.parse(readFileSync(path, "utf8"));
  if (manifest.version !== MANIFEST_VERSION) {
    throw new Error(`Unsupported manifest version in ${path}: ${manifest.version}`);
  }

  return manifest;
}

function saveManifest(projectRef, manifest) {
  const path = manifestPath(projectRef);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

function emptyManifest(projectRef) {
  return {
    version: MANIFEST_VERSION,
    projectRef: projectRef || null,
    updatedAt: new Date().toISOString(),
    functions: {},
  };
}

function isIgnoredPath(path) {
  const parts = path.split("/");
  return parts.some((part) => IGNORED_DIRS.has(part)) || IGNORED_FILES.has(parts.at(-1));
}

function walkFiles(path) {
  if (!existsSync(path)) return [];

  const stat = statSync(path);
  if (stat.isFile()) return isIgnoredPath(path) ? [] : [path];
  if (!stat.isDirectory()) return [];

  return readdirSync(path)
    .flatMap((name) => walkFiles(join(path, name)))
    .filter((file) => !isIgnoredPath(file))
    .sort();
}

function localFunctionNames() {
  return readdirSync(FUNCTIONS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith(".") && name !== "_shared" && name !== "node_modules")
    .filter((name) => existsSync(join(FUNCTIONS_ROOT, name, "index.ts")))
    .sort();
}

function hashFile(hash, file) {
  hash.update("file\0");
  hash.update(file);
  hash.update("\0");
  hash.update(readFileSync(file));
  hash.update("\0");
}

function hashFunction(name) {
  const hash = createHash("sha256");
  hash.update(`supabase-function-deploy-hash-v${MANIFEST_VERSION}\0`);

  const inputs = [
    "supabase/config.toml",
    "supabase/functions/import_map.json",
    "supabase/functions/deno.json",
    "deno.lock",
  ].filter((file) => existsSync(file));

  for (const file of inputs) {
    hashFile(hash, file);
  }

  for (const file of walkFiles(SHARED_ROOT)) {
    hashFile(hash, file);
  }

  for (const file of walkFiles(join(FUNCTIONS_ROOT, name))) {
    hashFile(hash, file);
  }

  return hash.digest("hex");
}

function currentHashes(functionNames) {
  return Object.fromEntries(functionNames.map((name) => [name, hashFunction(name)]));
}

function deployArgs(projectRef, extraArgs, functionName = "") {
  return [
    "functions",
    "deploy",
    ...(functionName ? [functionName] : []),
    ...(projectRef ? ["--project-ref", projectRef] : []),
    ...extraArgs,
  ];
}

function printCommand(args) {
  console.log(`supabase ${args.map((part) => (/\s/.test(part) ? JSON.stringify(part) : part)).join(" ")}`);
}

function markAllCurrent(projectRef, functionNames, hashes, reason, dryRun) {
  const now = new Date().toISOString();
  const manifest = emptyManifest(projectRef);

  for (const name of functionNames) {
    manifest.functions[name] = {
      hash: hashes[name],
      deployedAt: now,
      reason,
    };
  }

  manifest.updatedAt = now;

  if (dryRun) {
    console.log(`Dry run: would mark ${functionNames.length} functions as deployed in ${manifestPath(projectRef)}.`);
    return;
  }

  saveManifest(projectRef, manifest);
  console.log(`Updated deploy manifest: ${manifestPath(projectRef)}`);
}

function changedFunctions(manifest, hashes, functionNames) {
  return functionNames
    .map((name) => {
      const previousHash = manifest?.functions?.[name]?.hash ?? "";
      const currentHash = hashes[name];
      const reason = previousHash ? "changed" : "new";
      return { name, currentHash, previousHash, reason };
    })
    .filter((entry) => entry.currentHash !== entry.previousHash);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRef = projectRefOrDefault(options.projectRef);
  const functionNames = localFunctionNames();
  const hashes = currentHashes(functionNames);
  const projectArgsNote = projectRef ? `Project ref: ${projectRef}` : "Project ref: linked Supabase project";

  console.log(projectArgsNote);
  console.log(`Local functions: ${functionNames.length}`);

  if (options.markCurrent) {
    markAllCurrent(projectRef, functionNames, hashes, "mark-current", options.dryRun);
    return;
  }

  if (options.bootstrap) {
    const args = deployArgs(projectRef, options.deployArgs);
    console.log("Bootstrap deploy: global Supabase functions deploy, then manifest update.");
    printCommand(args);

    if (!options.dryRun) {
      run("supabase", args, { stdio: "inherit" });
    }

    markAllCurrent(projectRef, functionNames, hashes, "bootstrap", options.dryRun);
    return;
  }

  const manifest = loadManifest(projectRef);
  if (!manifest && !options.dryRun) {
    throw new Error(
      [
        `No deploy manifest found at ${manifestPath(projectRef)}.`,
        "Start with `npm run functions:deploy:bootstrap -- -- <supabase deploy args>` after a global deploy,",
        "or use `npm run functions:deploy:mark-current` if the current local code is already deployed.",
      ].join(" "),
    );
  }

  const changed = changedFunctions(manifest, hashes, functionNames);

  if (changed.length === 0) {
    console.log("No changed functions to deploy.");
    return;
  }

  console.log(`Functions to deploy (${changed.length}):`);
  for (const entry of changed) {
    console.log(`- ${entry.name} (${entry.reason})`);
  }

  if (options.dryRun) {
    console.log("\nDry run commands:");
    for (const entry of changed) {
      printCommand(deployArgs(projectRef, options.deployArgs, entry.name));
    }
    return;
  }

  const nextManifest = manifest ?? emptyManifest(projectRef);
  for (const entry of changed) {
    const args = deployArgs(projectRef, options.deployArgs, entry.name);
    console.log(`\nDeploying ${entry.name}...`);
    run("supabase", args, { stdio: "inherit" });

    nextManifest.functions[entry.name] = {
      hash: entry.currentHash,
      deployedAt: new Date().toISOString(),
      reason: entry.reason,
    };
    nextManifest.updatedAt = new Date().toISOString();
    saveManifest(projectRef, nextManifest);
  }

  console.log(`\nUpdated deploy manifest: ${manifestPath(projectRef)}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
