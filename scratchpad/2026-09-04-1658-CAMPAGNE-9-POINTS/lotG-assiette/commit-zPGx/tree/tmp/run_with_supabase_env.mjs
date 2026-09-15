import fs from "node:fs";
import { spawnSync } from "node:child_process";

const command = process.argv[2];
const args = process.argv.slice(3);
if (!command) {
  throw new Error("usage: node tmp/run_with_supabase_env.mjs <command> [...args]");
}

const env = { ...process.env };
for (const line of fs.readFileSync("supabase/.env", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) continue;
  env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const result = spawnSync(command, args, {
  stdio: "inherit",
  env,
});

process.exit(result.status ?? 1);
