import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function mustEnv(name) {
  const v = process.env[name];
  if (!v || String(v).trim().length === 0) {
    throw new Error(`Missing env ${name}. Tip: export it or run via mega-test env (see README.md).`);
  }
  return String(v).trim();
}

function parseArgs(argv) {
  const out = {
    key: null,
    reset: true,
    grantAdmin: false,
    printCredentials: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--key" || a === "--archetype") out.key = argv[++i] ?? null;
    else if (a === "--no-reset") out.reset = false;
    else if (a === "--reset") out.reset = true;
    else if (a === "--grant-admin") out.grantAdmin = true;
    else if (a === "--no-print") out.printCredentials = false;
  }

  return out;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function archetypesDir() {
  // frontend/eval/archetypes
  return path.join(__dirname, "..", "eval", "archetypes");
}

function loadArchetype(key) {
  const dir = archetypesDir();
  const file = path.join(dir, `${key}.json`);
  if (!fs.existsSync(file)) {
    const available = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    throw new Error(`Unknown archetype key "${key}". Available: ${available.join(", ")}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function findUserIdByEmail(admin, email) {
  const { data, error } = await admin.from("profiles").select("id,email").eq("email", email).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function deleteAuthUserIfExists(admin, email) {
  const userId = await findUserIdByEmail(admin, email);
  if (!userId) return null;
  try {
    await admin.auth.admin.deleteUser(userId);
  } catch {
    // best effort
  }
  return userId;
}

async function createAuthUser(admin, { email, password, user_metadata }) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: user_metadata ?? {},
  });
  if (error) throw error;
  const userId = data?.user?.id;
  if (!userId) throw new Error("Missing user id from admin.createUser");
  return userId;
}

async function upsertChatState(admin, userId, chatState) {
  if (!chatState) return;
  const payload = {
    user_id: userId,
    scope: chatState.scope ?? "web",
    current_mode: chatState.current_mode ?? "companion",
    risk_level: typeof chatState.risk_level === "number" ? chatState.risk_level : 0,
    investigation_state: chatState.investigation_state ?? null,
    short_term_context: chatState.short_term_context ?? "",
    unprocessed_msg_count: typeof chatState.unprocessed_msg_count === "number" ? chatState.unprocessed_msg_count : 0,
    last_processed_at: chatState.last_processed_at ?? new Date().toISOString(),
  };
  const { error } = await admin.from("user_chat_states").upsert(payload, { onConflict: "user_id,scope" });
  if (error) throw error;
}

async function seedGoalPlanAndActions(admin, userId, planSeed) {
  if (!planSeed) return { planId: null, submissionId: null, actionIdsByTitle: new Map() };

  const submissionId = planSeed.submission_id ?? crypto.randomUUID();

  // Goal
  const { data: goalRow, error: goalErr } = await admin
    .from("user_goals")
    .insert({
      user_id: userId,
      submission_id: submissionId,
      status: planSeed.goal?.status ?? "active",
      axis_id: planSeed.goal?.axis_id ?? "axis_fixture",
      axis_title: planSeed.goal?.axis_title ?? "Fixture Axis",
      theme_id: planSeed.goal?.theme_id ?? "theme_fixture",
      priority_order: planSeed.goal?.priority_order ?? 1,
      role: planSeed.goal?.role ?? null,
      reasoning: planSeed.goal?.reasoning ?? null,
      sophia_knowledge: planSeed.goal?.sophia_knowledge ?? null,
    })
    .select("id")
    .single();
  if (goalErr) throw goalErr;

  // Plan
  const defaultContent = { phases: [{ id: "phase_1", title: "Phase 1", status: "active", actions: [] }] };
  const planContent = planSeed.content ?? defaultContent;
  const { data: planRow, error: planErr } = await admin
    .from("user_plans")
    .insert({
      user_id: userId,
      goal_id: goalRow.id,
      submission_id: submissionId,
      status: planSeed.status ?? "active",
      current_phase: planSeed.current_phase ?? 1,
      title: planSeed.title ?? "Fixture plan",
      deep_why: planSeed.deep_why ?? null,
      inputs_why: planSeed.inputs_why ?? null,
      inputs_context: planSeed.inputs_context ?? null,
      inputs_blockers: planSeed.inputs_blockers ?? null,
      content: planContent,
    })
    .select("id,submission_id")
    .single();
  if (planErr) throw planErr;

  const actionIdsByTitle = new Map();
  const actions = Array.isArray(planSeed.actions) ? planSeed.actions : [];
  for (const a of actions) {
    const { data: actionRow, error: actionErr } = await admin
      .from("user_actions")
      .insert({
        user_id: userId,
        plan_id: planRow.id,
        submission_id: planRow.submission_id,
        type: a.type ?? "habit",
        title: a.title ?? null,
        description: a.description ?? "",
        target_reps: typeof a.target_reps === "number" ? a.target_reps : 1,
        current_reps: typeof a.current_reps === "number" ? a.current_reps : 0,
        status: a.status ?? "active",
        tracking_type: a.tracking_type ?? "boolean",
        time_of_day: a.time_of_day ?? "any_time",
        last_performed_at: a.last_performed_at ?? null,
      })
      .select("id,title")
      .single();
    if (actionErr) throw actionErr;
    const titleKey = String(actionRow?.title ?? a.title ?? "").trim();
    if (titleKey) actionIdsByTitle.set(titleKey, actionRow.id);
  }

  return { planId: planRow.id, submissionId: planRow.submission_id, actionIdsByTitle };
}

async function seedActionEntries(admin, userId, entries, actionIdsByTitle) {
  if (!Array.isArray(entries) || entries.length === 0) return;
  for (const e of entries) {
    let actionId = e.action_id ?? null;
    if (!actionId && e.action_title) {
      actionId = actionIdsByTitle.get(String(e.action_title).trim()) ?? null;
    }
    if (!actionId) throw new Error(`seed_action_entries missing action_id (and couldn't resolve action_title="${e.action_title ?? ""}")`);
    const { error } = await admin.from("user_action_entries").insert({
      user_id: userId,
      action_id: actionId,
      status: e.status,
      value: typeof e.value === "number" ? e.value : null,
      note: e.note ?? null,
      performed_at: e.performed_at ?? new Date().toISOString(),
    });
    if (error) throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.key) {
    throw new Error('Missing --key <archetype>. Example: npm run fixtures:provision -- --key onboarding_whatsapp_optin_yes');
  }

  const url = mustEnv("VITE_SUPABASE_URL");
  const anonKey = mustEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const archetype = loadArchetype(args.key);
  const email = String(archetype?.auth?.email ?? `fixture+${args.key}@example.com`).trim().toLowerCase();
  const password = String(archetype?.auth?.password ?? "TestPassword!123").trim();
  const fullName = String(archetype?.profile?.full_name ?? archetype?.label ?? `Fixture ${args.key}`).trim();
  const phoneNumber = archetype?.profile?.phone_number ?? null;

  if (args.reset) {
    await deleteAuthUserIfExists(admin, email);
  }

  // Create (or reuse) user
  let userId = await findUserIdByEmail(admin, email);
  if (!userId) {
    userId = await createAuthUser(admin, {
      email,
      password,
      user_metadata: { full_name: fullName, phone: phoneNumber ?? undefined },
    });
  }

  // Profile updates (best-effort if some columns don't exist in older DBs)
  const profilePatch = {
    full_name: fullName,
    onboarding_completed: Boolean(archetype?.profile?.onboarding_completed),
    phone_number: phoneNumber,
    email,
    phone_invalid: Boolean(archetype?.profile?.phone_invalid ?? false),
    phone_verified_at: archetype?.profile?.phone_verified_at ?? (archetype?.profile?.whatsapp_opted_in ? new Date().toISOString() : null),
    whatsapp_opted_in: Boolean(archetype?.profile?.whatsapp_opted_in ?? false),
    whatsapp_bilan_opted_in: Boolean(archetype?.profile?.whatsapp_bilan_opted_in ?? false),
    whatsapp_optin_sent_at: archetype?.profile?.whatsapp_optin_sent_at ?? null,
    whatsapp_last_inbound_at: archetype?.profile?.whatsapp_last_inbound_at ?? null,
    whatsapp_last_outbound_at: archetype?.profile?.whatsapp_last_outbound_at ?? null,
    whatsapp_state: archetype?.profile?.whatsapp_state ?? null,
    whatsapp_state_updated_at: archetype?.profile?.whatsapp_state_updated_at ?? null,
    whatsapp_opted_out_at: archetype?.profile?.whatsapp_opted_out_at ?? null,
    whatsapp_optout_reason: archetype?.profile?.whatsapp_optout_reason ?? null,
    whatsapp_optout_confirmed_at: archetype?.profile?.whatsapp_optout_confirmed_at ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error: profErr } = await admin.from("profiles").update(profilePatch).eq("id", userId);
  if (profErr) throw profErr;

  // user_answers seed (optional)
  if (archetype?.user_answers?.content) {
    const payload = {
      user_id: userId,
      questionnaire_type: archetype?.user_answers?.questionnaire_type ?? "onboarding",
      submission_id: archetype?.user_answers?.submission_id ?? crypto.randomUUID(),
      content: archetype.user_answers.content,
      status: archetype?.user_answers?.status ?? "completed",
      sorting_attempts: archetype?.user_answers?.sorting_attempts ?? 1,
    };
    const { error: ansErr } = await admin.from("user_answers").insert(payload);
    if (ansErr) throw ansErr;
  }

  // Seed plan/actions + optional action entries
  const { actionIdsByTitle } = await seedGoalPlanAndActions(admin, userId, archetype?.plan);
  await seedActionEntries(admin, userId, archetype?.seed_action_entries ?? [], actionIdsByTitle);

  // Chat state (optional)
  let chatState = archetype?.chat_state ?? null;
  if (chatState?.seed_investigation_state === true) {
    // Build a simple investigator state from active actions (good enough for isolated checkup tests).
    const { data: actions, error: actErr } = await admin
      .from("user_actions")
      .select("id,title,description,tracking_type,target_reps")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(10);
    if (actErr) throw actErr;
    const pending = (actions ?? []).map((a) => ({
      id: a.id,
      type: "action",
      title: a.title,
      description: a.description,
      tracking_type: a.tracking_type,
      target: a.target_reps,
    }));
    chatState = {
      ...chatState,
      current_mode: "investigator",
      investigation_state: {
        status: "checking",
        pending_items: pending,
        current_item_index: 0,
        temp_memory: { opening_done: false },
      },
    };
  }
  await upsertChatState(admin, userId, chatState);

  // Optional: allow login in prelaunch mode (internal admins gate)
  const shouldGrantAdmin = Boolean(archetype?.grant_internal_admin) || args.grantAdmin;
  if (shouldGrantAdmin) {
    const { error: admErr } = await admin.from("internal_admins").upsert({ user_id: userId });
    if (admErr) throw admErr;
  }

  if (args.printCredentials) {
    console.log("\n=== Fixture user provisioned ===");
    console.log(`archetype: ${args.key}`);
    console.log(`user_id:   ${userId}`);
    console.log(`email:     ${email}`);
    console.log(`password:  ${password}`);
    console.log(`url:       ${url}`);
    console.log(`admin:     ${shouldGrantAdmin ? "YES" : "NO"}`);
  }

  // Sanity: sign-in works (JWT needed for chatting)
  const authed = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signIn, error: signErr } = await authed.auth.signInWithPassword({ email, password });
  if (signErr) throw signErr;
  if (!signIn.session) throw new Error("Missing session after sign-in");
  console.log("auth: OK (sign-in successful)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


