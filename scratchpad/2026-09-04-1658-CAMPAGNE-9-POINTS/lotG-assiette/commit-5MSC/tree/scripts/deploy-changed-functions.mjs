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
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const FUNCTIONS_ROOT = "supabase/functions";
const MANIFEST_ROOT = "supabase/.temp/functions-deploy-manifests";
const MANIFEST_VERSION = 1;
const IGNORED_DIRS = new Set(["node_modules", ".git"]);
const IGNORED_FILES = new Set([".DS_Store"]);
const LOCAL_IMPORT_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"];
const LOCAL_IMPORT_INDEXES = ["index.ts", "index.tsx", "index.js", "index.mjs"];

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

function normalizePath(path) {
  return path.replace(/\\/g, "/");
}

function isIgnoredPath(path) {
  const parts = path.split("/");
  return parts.some((part) => IGNORED_DIRS.has(part)) || IGNORED_FILES.has(parts.at(-1));
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
  hash.update(normalizePath(file));
  hash.update("\0");
  hash.update(readFileSync(file));
  hash.update("\0");
}

function isParseableSource(file) {
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file);
}

function importSpecs(source) {
  const specs = [];
  const pattern =
    /(?:import|export)\s+(?:type\s+)?(?:[^"'()]*?\s+from\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(pattern)) {
    specs.push(match[1] ?? match[2]);
  }
  return specs.filter(Boolean);
}

function resolveLocalImport(fromFile, spec) {
  if (!spec.startsWith(".") && !spec.startsWith("/")) return null;
  const cleanSpec = spec.split(/[?#]/, 1)[0];
  const base = spec.startsWith("/")
    ? resolve(cleanSpec.slice(1))
    : resolve(dirname(fromFile), cleanSpec);

  const candidates = [
    ...LOCAL_IMPORT_EXTENSIONS.map((ext) => `${base}${ext}`),
    ...LOCAL_IMPORT_INDEXES.map((file) => join(base, file)),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const stat = statSync(candidate);
    if (stat.isFile() && !isIgnoredPath(normalizePath(candidate))) {
      return normalizePath(candidate);
    }
  }

  return null;
}

function localImportGraph(entryFile) {
  const root = normalizePath(resolve("."));
  const visited = new Set();
  const stack = [normalizePath(resolve(entryFile))];

  while (stack.length > 0) {
    const file = stack.pop();
    if (!file || visited.has(file) || isIgnoredPath(file) || !existsSync(file)) {
      continue;
    }

    const stat = statSync(file);
    if (!stat.isFile()) continue;

    visited.add(file);
    if (!isParseableSource(file)) continue;

    const source = readFileSync(file, "utf8");
    for (const spec of importSpecs(source)) {
      const resolved = resolveLocalImport(file, spec);
      if (resolved && resolved.startsWith(root) && !visited.has(resolved)) {
        stack.push(resolved);
      }
    }
  }

  return [...visited]
    .map((file) => normalizePath(file).slice(root.length + 1))
    .sort();
}

function functionConfigSection(name) {
  const configPath = "supabase/config.toml";
  if (!existsSync(configPath)) return "";

  const header = `[functions.${name}]`;
  const lines = readFileSync(configPath, "utf8").split(/\r?\n/);
  const section = [];
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      if (inSection) break;
      inSection = trimmed === header;
    }
    if (inSection) section.push(line);
  }

  return section.join("\n");
}

function hashFunction(name) {
  const hash = createHash("sha256");
  hash.update(`supabase-function-deploy-hash-v${MANIFEST_VERSION}\0`);

  const inputs = [
    "supabase/functions/import_map.json",
    "supabase/functions/deno.json",
    join(FUNCTIONS_ROOT, name, "config.toml"),
  ].filter((file) => existsSync(file));

  for (const file of inputs) {
    hashFile(hash, file);
  }

  const configSection = functionConfigSection(name);
  if (configSection) {
    hash.update("config-section\0");
    hash.update(configSection);
    hash.update("\0");
  }

  for (const file of localImportGraph(join(FUNCTIONS_ROOT, name, "index.ts"))) {
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
