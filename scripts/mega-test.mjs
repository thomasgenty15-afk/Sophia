import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function parseDotEnv(text) {
  const out = {};
  const lines = String(text ?? "").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip simple quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

function loadEnvFileIfPresent(relPath) {
  try {
    const p = path.join(ROOT, relPath);
    if (!hasFile(p)) return;
    const text = fs.readFileSync(p, "utf8");
    const parsed = parseDotEnv(text);
    // Only fill missing keys to avoid surprising overrides.
    for (const [k, v] of Object.entries(parsed)) {
      if (!process.env[k] && typeof v === "string" && v.length > 0) process.env[k] = v;
    }
  } catch {
    // ignore
  }
}

function die(msg) {
  console.error(`\nMEGA TEST ERROR: ${msg}\n`);
  process.exit(1);
}

function hasFile(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    ...opts,
  });
  if (res.status !== 0) {
    die(`Command failed (${res.status}): ${cmd} ${args.join(" ")}`);
  }
}

function runOptional(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    ...opts,
  });
  return res.status === 0;
}

function runCapture(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
  if (res.status !== 0) {
    const stderr = (res.stderr || "").trim();
    die(`Command failed (${res.status}): ${cmd} ${args.join(" ")}\n${stderr}`);
  }
  return (res.stdout || "").toString();
}

function commandExists(cmd) {
  const res = spawnSync("sh", ["-lc", `command -v ${cmd} >/dev/null 2>&1`], { stdio: "ignore" });
  return res.status === 0;
}

function getLocalSupabaseCli() {
  // Prefer local binary (avoids npx + network).
  const bin = path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
  if (hasFile(bin)) return { cmd: bin, argsPrefix: [] };
  return { cmd: "npx", argsPrefix: ["supabase"] };
}

function inferSupabaseProjectRef() {
  // Supabase CLI derives container names from the folder name, typically replacing non-alnum with "_".
  // Example: "Sophia 2" -> "Sophia_2"
  const base = path.basename(ROOT);
  const ref = base.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return ref.length > 0 ? ref : "project";
}

function tryCleanupEdgeRuntimeContainer() {
  // If supabase start fails with a name conflict, the common culprit is a leftover edge runtime container.
  // We best-effort remove it and let supabase recreate it.
  try {
    const ref = inferSupabaseProjectRef();
    const name = `supabase_edge_runtime_${ref}`;
    runOptional("docker", ["rm", "-f", name], { cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

function setEdgeSecrets(pairs) {
  const supabase = getLocalSupabaseCli();
  const args = [...supabase.argsPrefix, "secrets", "set", ...pairs];
  run(supabase.cmd, args, { cwd: ROOT });
}

function tryGetEdgeRuntimeSecretKey() {
  // Best-effort: read INTERNAL_FUNCTION_SECRET (preferred) or SECRET_KEY from the local Edge Runtime container.
  // We never print it; we only pass it down to tests via env var.
  try {
    const names = runCapture("docker", ["ps", "--format", "{{.Names}}"], { cwd: ROOT })
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const edge = names.find((n) => /^supabase_edge_runtime_/.test(n));
    if (!edge) return null;
    const internal = runCapture("docker", ["exec", "-i", edge, "sh", "-lc", 'printf %s "$INTERNAL_FUNCTION_SECRET"'], { cwd: ROOT }).trim();
    if (internal.length > 0) return internal;
    const key = runCapture("docker", ["exec", "-i", edge, "sh", "-lc", 'printf %s "$SECRET_KEY"'], { cwd: ROOT }).trim();
    return key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

function tryGetVaultInternalSecret() {
  // Fallback: read INTERNAL_FUNCTION_SECRET directly from Vault (local DB container).
  // This avoids relying on edge runtime env injection, which varies by Supabase CLI version.
  try {
    const names = runCapture("docker", ["ps", "--format", "{{.Names}}"], { cwd: ROOT })
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const db = names.find((n) => /^supabase_db_/.test(n));
    if (!db) return null;
    const sql = "select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1;";
    const out = runCapture("docker", ["exec", "-i", db, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", sql], { cwd: ROOT }).trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

function tryGetEdgeEnvVar(name) {
  try {
    const names = runCapture("docker", ["ps", "--format", "{{.Names}}"], { cwd: ROOT })
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const edge = names.find((n) => /^supabase_edge_runtime_/.test(n));
    if (!edge) return null;
    const out = runCapture("docker", ["exec", "-i", edge, "sh", "-lc", `printf %s "$${name}"`], { cwd: ROOT }).trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

function parseStatusText(out) {
  const apiUrl =
    out.match(/Project URL\s*[\|│]\s*(https?:\/\/\S+)/i)?.[1] ??
    out.match(/Project URL:\s*(\S+)/i)?.[1] ??
    out.match(/API URL:\s*(\S+)/i)?.[1] ??
    out.match(/API URL\s+(\S+)/i)?.[1];
  const dbUrl = out.match(/DB URL:\s*(\S+)/i)?.[1] ?? out.match(/DB URL\s+(\S+)/i)?.[1];
  // Supabase CLI output changed over time:
  // - Old: "anon key:" / "service_role key:"
  // - New: table "Publishable" / "Secret"
  const anonKey =
    out.match(/anon key:\s*(\S+)/i)?.[1] ??
    out.match(/Publishable\s*[\|│]\s*(\S+)/i)?.[1];
  const serviceRoleKey =
    out.match(/service_role key:\s*(\S+)/i)?.[1] ??
    out.match(/service role key:\s*(\S+)/i)?.[1] ??
    out.match(/Secret\s*[\|│]\s*(\S+)/i)?.[1];

  if (!apiUrl || !anonKey || !serviceRoleKey) {
    die(
      [
        "Could not parse `supabase status` output (need API URL / anon key / service_role key).",
        "Output was:\n" + out,
        "Tip: update Supabase CLI or run `supabase status` manually to see the expected format.",
      ].join("\n\n"),
    );
  }

  return { apiUrl, dbUrl, anonKey, serviceRoleKey };
}

function getLocalSupabaseEnv() {
  const supabase = getLocalSupabaseCli();
  const out = runCapture(supabase.cmd, [...supabase.argsPrefix, "status"], { cwd: ROOT });
  return parseStatusText(out);
}

const argv = process.argv.slice(2);
const FULL = argv.includes("--full");
const USE_REAL_AI = argv.includes("--ai") || argv.includes("--with-ai");
const NO_START = argv.includes("--no-start");
const NO_RESET = argv.includes("--no-reset");
const SKIP_DENO = argv.includes("--skip-deno");
const SKIP_FRONTEND = argv.includes("--skip-frontend");
const SKIP_SECRET_SYNC = argv.includes("--skip-secret-sync");
const RUN_E2E = argv.includes("--e2e");

console.log("\n=== Sophia mega test ===");
console.log(`mode: ${FULL ? "FULL" : "SMOKE"}`);
console.log(`ai: ${USE_REAL_AI ? "REAL" : "STUB"}`);

// Best-effort: load local env files (commonly used for Supabase + Stripe secrets).
// This makes `npm run test:mega` pick up user's configured local secrets without requiring manual exports.
loadEnvFileIfPresent("supabase/.env");
loadEnvFileIfPresent("supabase/.env.local");

// WhatsApp: tests need deterministic secrets for webhook signature + GET handshake.
// These are safe dummy values for local/offline test execution.
const waAppSecret = process.env.WHATSAPP_APP_SECRET || "MEGA_TEST_WHATSAPP_APP_SECRET";
const waVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "MEGA_TEST_WHATSAPP_VERIFY_TOKEN";

// Stripe: provide safe dummy secrets/IDs for local/offline test execution.
// - Edge functions require these env vars to exist.
// - Network calls to Stripe are stubbed when MEGA_TEST_MODE=1 (see supabase/functions/_shared/stripe.ts).
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "sk_test_MEGA_TEST";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "whsec_MEGA_TEST";
const appBaseUrl = (process.env.APP_BASE_URL || "http://127.0.0.1:4173").replace(/\/+$/, "");
const stripePriceIds = {
  STRIPE_PRICE_ID_SYSTEM_MONTHLY: process.env.STRIPE_PRICE_ID_SYSTEM_MONTHLY || "price_test_system_monthly",
  STRIPE_PRICE_ID_SYSTEM_YEARLY: process.env.STRIPE_PRICE_ID_SYSTEM_YEARLY || "price_test_system_yearly",
  STRIPE_PRICE_ID_ALLIANCE_MONTHLY: process.env.STRIPE_PRICE_ID_ALLIANCE_MONTHLY || "price_test_alliance_monthly",
  STRIPE_PRICE_ID_ALLIANCE_YEARLY: process.env.STRIPE_PRICE_ID_ALLIANCE_YEARLY || "price_test_alliance_yearly",
  STRIPE_PRICE_ID_ARCHITECTE_MONTHLY: process.env.STRIPE_PRICE_ID_ARCHITECTE_MONTHLY || "price_test_architecte_monthly",
  STRIPE_PRICE_ID_ARCHITECTE_YEARLY: process.env.STRIPE_PRICE_ID_ARCHITECTE_YEARLY || "price_test_architecte_yearly",
};

// Secrets/env needed by local edge runtime are injected via `supabase/config.toml` [edge_runtime.secrets] env(...)
// so they must exist in the environment when we (re)start Supabase.
const vaultInternalSecret = tryGetVaultInternalSecret() ?? "Sophia on fire";
const geminiKey = process.env.GEMINI_API_KEY || tryGetEdgeEnvVar("GEMINI_API_KEY") || "";
if (USE_REAL_AI && !geminiKey) {
  die(
    [
      "GEMINI_API_KEY is required for --ai runs but was not found.",
      "Export it in your shell then rerun:",
      "  export GEMINI_API_KEY=...; npm run test:mega -- --full --no-reset --ai",
    ].join("\n"),
  );
}

const supabaseEnvForStart = {
  ...process.env,
  INTERNAL_FUNCTION_SECRET: vaultInternalSecret,
  SECRET_KEY: vaultInternalSecret,
  MEGA_TEST_MODE: USE_REAL_AI ? "0" : "1",
  ...(geminiKey ? { GEMINI_API_KEY: geminiKey } : {}),
  WHATSAPP_APP_SECRET: waAppSecret,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: waVerifyToken,
  STRIPE_SECRET_KEY: stripeSecretKey,
  STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
  APP_BASE_URL: appBaseUrl,
  ...stripePriceIds,
};

if (!NO_START) {
  console.log("\n[1/5] Starting Supabase local...");
  // Always restart to ensure edge runtime picks up env-injected secrets (MEGA_TEST_MODE, INTERNAL_FUNCTION_SECRET, GEMINI_API_KEY).
  runOptional("npm", ["run", "db:stop"], { cwd: ROOT, env: supabaseEnvForStart });
  // Pre-clean (best-effort) to avoid "container name already in use" conflicts.
  tryCleanupEdgeRuntimeContainer();
  if (!runOptional("npm", ["run", "db:start"], { cwd: ROOT, env: supabaseEnvForStart })) {
    console.log("\n[1/5] Supabase start failed; attempting edge runtime container cleanup + retry...");
    tryCleanupEdgeRuntimeContainer();
    run("npm", ["run", "db:start"], { cwd: ROOT, env: supabaseEnvForStart });
  }
}

if (!NO_RESET) {
  console.log("\n[2/5] Resetting DB (migrations + seed)...");
  run("npm", ["run", "db:reset"], { cwd: ROOT });
}

console.log("\n[3/6] Reading local Supabase URL/keys...");
const { apiUrl, anonKey, serviceRoleKey } = getLocalSupabaseEnv();
console.log(`- API: ${apiUrl}`);

// Ensure deterministic test behavior for Edge Functions by default (no Gemini/network).
// Use `--ai` to run real Gemini calls (requires GEMINI_API_KEY configured in Edge secrets/env).
console.log(
  `\n[3a/6] Setting MEGA_TEST_MODE=${USE_REAL_AI ? "0" : "1"} in Edge Runtime secrets (${USE_REAL_AI ? "real AI" : "deterministic stub"})...`,
);
setEdgeSecrets([`MEGA_TEST_MODE=${USE_REAL_AI ? "0" : "1"}`]);

// Stripe: ensure required env vars exist in Edge Runtime even when running with --no-start (no container restart).
// We set safe dummy values by default (see earlier constants), so checkout/portal/webhook tests can run offline.
console.log("\n[3a/6] Setting Stripe env in Edge Runtime secrets (for offline billing tests)...");
setEdgeSecrets([
  `STRIPE_SECRET_KEY=${stripeSecretKey}`,
  `STRIPE_WEBHOOK_SECRET=${stripeWebhookSecret}`,
  `APP_BASE_URL=${appBaseUrl}`,
  ...Object.entries(stripePriceIds).map(([k, v]) => `${k}=${v}`),
]);

if (FULL && !SKIP_SECRET_SYNC) {
  console.log("\n[3b/6] Syncing Vault.INTERNAL_FUNCTION_SECRET <-> Edge SECRET_KEY (for triggers/cron)...");
  run("bash", ["./scripts/local_sync_internal_secret.sh"], { cwd: ROOT });
}

// Internal functions auth: pass SECRET_KEY to tests so they can call ensureInternalRequest endpoints.
const internalSecret = tryGetEdgeRuntimeSecretKey() ?? tryGetVaultInternalSecret();
if (internalSecret) {
  console.log("\n[3c/6] Internal auth: Edge Runtime SECRET_KEY detected (will be used for internal functions tests).");
} else {
  console.log("\n[3c/6] Internal auth: could not read Edge Runtime SECRET_KEY (internal functions tests may be skipped).");
}

if (!SKIP_DENO) {
  console.log("\n[4/6] Running Deno unit tests (supabase/functions/_shared/*_test.ts)...");
  if (!commandExists("deno")) {
    die(
      [
        "Deno is not installed (command `deno` not found).",
        "Install it (macOS): `brew install deno`",
        "Or re-run skipping Deno tests: `npm run test:mega -- --full --no-reset --skip-deno`",
      ].join("\n"),
    );
  }
  // Avoid creating/updating deno.lock (Deno v2 lockfile breaks local Supabase edge runtime).
  const denoEnv = {
    ...process.env,
    SUPABASE_URL: apiUrl,
    VITE_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    // Keep Deno tests deterministic and offline even in --ai runs.
    MEGA_TEST_MODE: "1",
    MEGA_TEST_FULL: FULL ? "1" : "0",
    ...(internalSecret ? { MEGA_INTERNAL_SECRET: internalSecret } : {}),
    WHATSAPP_APP_SECRET: waAppSecret,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: waVerifyToken,
    STRIPE_SECRET_KEY: stripeSecretKey,
    STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
    APP_BASE_URL: appBaseUrl,
    ...stripePriceIds,
  };
  run("deno", ["test", "-A", "--no-lock"], { cwd: path.join(ROOT, "supabase", "functions"), env: denoEnv });
}

if (!SKIP_FRONTEND) {
  console.log("\n[5/6] Running Vitest integration tests (frontend/src/**/*.int.test.ts)...");
  const env = {
    ...process.env,
    VITE_SUPABASE_URL: apiUrl,
    VITE_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    MEGA_TEST_FULL: FULL ? "1" : "0",
    MEGA_TEST_MODE: USE_REAL_AI ? "0" : "1",
    ...(internalSecret ? { MEGA_INTERNAL_SECRET: internalSecret } : {}),
    WHATSAPP_APP_SECRET: waAppSecret,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: waVerifyToken,
    STRIPE_SECRET_KEY: stripeSecretKey,
    STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
    APP_BASE_URL: appBaseUrl,
    ...stripePriceIds,
  };
  run("npm", ["run", "test:int"], { cwd: path.join(ROOT, "frontend"), env });
}

if (RUN_E2E) {
  console.log("\n[6/6] Running Playwright E2E tests (frontend/e2e)...");
  const env = {
    ...process.env,
    VITE_SUPABASE_URL: apiUrl,
    VITE_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    // E2E tests can take longer (dev server + real browser).
    E2E_HOST: "127.0.0.1",
    E2E_PORT: process.env.E2E_PORT || "4173",
  };
  run("npm", ["run", "test:e2e"], { cwd: path.join(ROOT, "frontend"), env });
}

console.log("\nOK: mega test suite passed.\n");





