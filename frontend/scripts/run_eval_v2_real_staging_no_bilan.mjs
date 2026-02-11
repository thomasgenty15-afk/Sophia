/**
 * run_eval_v2_real_staging_no_bilan.mjs
 *
 * Thin wrapper around run_eval_v2_real_staging.mjs that forces --no-bilan.
 * This keeps "tools" runs isolated from checkup/investigation fixtures.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const target = path.join(__dirname, "run_eval_v2_real_staging.mjs");
const userArgs = process.argv.slice(2);
const hasNoBilan = userArgs.includes("--no-bilan");
const args = hasNoBilan ? userArgs : ["--no-bilan", ...userArgs];

const res = spawnSync("node", [target, ...args], {
  stdio: "inherit",
  env: process.env,
});

if (res.error) {
  console.error(res.error);
  process.exit(1);
}
process.exit(Number(res.status ?? 0));

