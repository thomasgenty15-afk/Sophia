/**
 * provision_eval_v2_users.mjs
 *
 * One-shot provisioning of the 5 fixed eval V2 users on staging.
 * Creates auth users if they don't exist, writes their user_ids back to the config file,
 * and grants internal_admins access (needed for run-evals).
 *
 * Usage:
 *   cd frontend && \
 *   SOPHIA_SUPABASE_URL="https://iabxchanerdkczbxyjgg.supabase.co" \
 *   SOPHIA_SUPABASE_ANON_KEY="eyJ..." \
 *   SOPHIA_SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
 *   node scripts/provision_eval_v2_users.mjs
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function mustEnv(name) {
  const v = process.env[name];
  if (!v || String(v).trim().length === 0) {
    throw new Error(`Missing env var ${name}.`);
  }
  return String(v).trim();
}

const CONFIG_PATH = path.join(__dirname, "..", "eval", "config", "eval_fixed_users_staging.json");

async function main() {
  const url = mustEnv("SOPHIA_SUPABASE_URL");
  const anonKey = mustEnv("SOPHIA_SUPABASE_ANON_KEY");
  const serviceRoleKey = mustEnv("SOPHIA_SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const users = config.users;
  if (!Array.isArray(users) || users.length === 0) {
    throw new Error("No users defined in config file.");
  }

  console.log(`[Provision] Provisioning ${users.length} eval V2 users on ${url}`);

  for (const u of users) {
    const email = String(u.email).trim().toLowerCase();
    const password = String(u.password).trim();
    const fullName = String(u.full_name).trim();

    // Check if user already exists via admin API
    let userId = null;
    try {
      const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200, page: 1 });
      const found = (listed?.users ?? []).find(
        (x) => String(x.email ?? "").toLowerCase() === email,
      );
      userId = found?.id ?? null;
    } catch (e) {
      console.warn(`[Provision] listUsers failed for ${email}: ${e?.message ?? e}`);
    }

    if (!userId) {
      // Create user
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createErr) throw createErr;
      userId = created?.user?.id ?? null;
      if (!userId) throw new Error(`Failed to create user ${email}`);
      console.log(`[Provision] Created user ${email} -> ${userId}`);
    } else {
      console.log(`[Provision] User ${email} already exists -> ${userId}`);
      // Reset password to known value
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password });
      if (updErr) console.warn(`[Provision] Could not reset password for ${userId}: ${updErr.message}`);
    }

    // Set profile fields
    await admin.from("profiles").update({
      full_name: fullName,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    }).eq("id", userId);

    // Grant internal_admins
    const { error: admErr } = await admin.from("internal_admins").upsert({ user_id: userId });
    if (admErr) console.warn(`[Provision] internal_admins upsert failed for ${userId}: ${admErr.message}`);

    // Store user_id back in config object
    u.user_id = userId;
  }

  // Write updated config with user_ids
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
  console.log(`\n[Provision] Config updated: ${CONFIG_PATH}`);
  console.log("[Provision] User IDs:");
  for (const u of users) {
    console.log(`  slot=${u.slot}  ${u.email}  ->  ${u.user_id}`);
  }

  // Verify sign-in for each user
  const authed = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const u of users) {
    const { error: signErr } = await authed.auth.signInWithPassword({
      email: u.email,
      password: u.password,
    });
    if (signErr) {
      console.error(`[Provision] ⚠️  Sign-in FAILED for ${u.email}: ${signErr.message}`);
    } else {
      console.log(`[Provision] ✓ Sign-in OK for ${u.email}`);
    }
  }

  console.log("\n[Provision] Done. You can now run eval V2 scenarios with these fixed users.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

