#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "../../../..");
const CONFIG_PATH = path.join(
  FRONTEND_ROOT,
  "eval",
  "config",
  "eval_fixed_users_real_staging.json",
);

const SLOT = 1;
const EMAIL = "user-delete-tool-staging@sophia-test.local";
const PASSWORD = "SophiaDeleteTool!001";
const FULL_NAME = "user_delete_tool_staging";

function mustEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing env var ${name}`);
  return String(v).trim();
}

async function main() {
  const url = mustEnv("SOPHIA_SUPABASE_URL");
  const serviceRoleKey = mustEnv("SOPHIA_SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const users = Array.isArray(config?.users) ? config.users : [];
  const idx = users.findIndex((u) => Number(u?.slot) === SLOT);
  const slotUser = idx >= 0 ? users[idx] : null;
  if (!slotUser) throw new Error(`Slot ${SLOT} not found in ${CONFIG_PATH}`);

  let userId = "";
  const listed = await admin.auth.admin.listUsers({ perPage: 1000, page: 1 });
  if (listed.error) throw listed.error;
  const found = (listed.data?.users ?? []).find((u) =>
    String(u.email ?? "").toLowerCase() === EMAIL.toLowerCase()
  );
  if (found?.id) {
    userId = found.id;
    const upd = await admin.auth.admin.updateUserById(userId, { password: PASSWORD });
    if (upd.error) throw upd.error;
    console.log(`[Provision] Existing user -> ${userId}`);
  } else {
    const created = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: FULL_NAME },
    });
    if (created.error) throw created.error;
    userId = String(created.data?.user?.id ?? "");
    if (!userId) throw new Error("User creation returned empty id");
    console.log(`[Provision] Created user -> ${userId}`);
  }

  await admin.from("profiles").update({
    full_name: FULL_NAME,
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  }).eq("id", userId);

  slotUser.email = EMAIL;
  slotUser.password = PASSWORD;
  slotUser.full_name = FULL_NAME;
  slotUser.user_id = userId;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
  console.log(`[Provision] Updated config: ${CONFIG_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

