import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function mustEnv(name) {
  const v = process.env[name];
  if (!v || String(v).trim().length === 0) {
    throw new Error(`Missing env ${name}. Tip: export it or run via mega-test env (see README.md).`);
  }
  return String(v).trim();
}

function makeNonce() {
  const rand = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return String(rand).replace(/[^a-zA-Z0-9]/g, "").slice(0, 14);
}

async function seedChatUser(admin, url, anonKey) {
  const nonce = makeNonce();
  const email = `eval+${nonce}@example.com`;
  const password = "TestPassword!123";
  const phone = `+1555${nonce}`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { phone, full_name: "Eval Runner" },
  });
  if (createErr) throw createErr;
  const userId = created.user?.id;
  if (!userId) throw new Error("Missing user id from admin.createUser");

  await admin.from("profiles").update({ onboarding_completed: true }).eq("id", userId);

  // Seed minimal plan + action so investigator has something to check (18h rule).
  const submissionId = crypto.randomUUID();
  const { data: goalRow, error: goalErr } = await admin
    .from("user_goals")
    .insert({
      user_id: userId,
      submission_id: submissionId,
      status: "active",
      axis_id: "axis_test",
      axis_title: "Test Axis",
      theme_id: "theme_test",
      priority_order: 1,
    })
    .select("id")
    .single();
  if (goalErr) throw goalErr;

  const actionId = crypto.randomUUID();
  const planContent = {
    grimoireTitle: "Plan de test",
    strategy: "Plan seedé pour évaluation locale (script).",
    deepWhy: "Valider les scénarios en local.",
    estimatedDuration: "1 jour",
    phases: [
      {
        id: 1,
        title: "Phase 1 : Évaluation",
        subtitle: "Seed de plan pour tests",
        status: "active",
        actions: [
          {
            id: actionId,
            type: "habitude",
            title: "Sport",
            description: "Faire du sport",
            isCompleted: false,
            status: "active",
            targetReps: 3,
            currentReps: 0,
            tracking_type: "boolean",
            time_of_day: "any_time",
            questType: "main",
          },
        ],
      },
    ],
  };
  const { data: planRow, error: planErr } = await admin
    .from("user_plans")
    .insert({
      user_id: userId,
      goal_id: goalRow.id,
      submission_id: submissionId,
      status: "active",
      current_phase: 1,
      title: "Eval plan",
      deep_why: "Plan seedé pour tests (script).",
      content: planContent,
    })
    .select("id")
    .single();
  if (planErr) throw planErr;

  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { error: actionErr } = await admin.from("user_actions").insert({
    id: actionId,
    user_id: userId,
    plan_id: planRow.id,
    submission_id: submissionId,
    type: "habit",
    title: "Sport",
    description: "Faire du sport",
    target_reps: 3,
    current_reps: 0,
    status: "active",
    tracking_type: "boolean",
    time_of_day: "any_time",
    last_performed_at: twoDaysAgo,
  });
  if (actionErr) throw actionErr;

  // Create an authed client (JWT) to call Edge Functions
  const authed = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signIn, error: signInErr } = await authed.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;
  if (!signIn.session) throw new Error("Missing session after sign-in");

  return { userId, authed, admin, email, password };
}

async function runScenario({ admin, authed, userId }, scenario) {
  const scope = "web";
  const { data: stBefore } = await admin.from("user_chat_states").select("*").eq("user_id", userId).eq("scope", scope).maybeSingle();

  const history = [];

  // Two modes:
  // - scripted: scenario.steps[] provides user messages
  // - simulated: simulate-user generates next user messages based on persona + objectives
  if (Array.isArray(scenario.steps) && scenario.steps.length > 0) {
    for (const step of scenario.steps) {
      const { data, error } = await authed.functions.invoke("sophia-brain", {
        body: { message: step.user, history: history.slice(-10), channel: "web", scope },
      });
      if (error) throw error;
      history.push({ role: "user", content: step.user });
      history.push({ role: "assistant", content: data.content, agent_used: data.mode ?? null });
    }
  } else {
    const maxTurns = Number(scenario.max_turns ?? 10);
    let done = false;
    let turn = 0;

    while (!done && turn < maxTurns) {
      // Ask the user-agent for the next user message
      const { data: sim, error: simErr } = await authed.functions.invoke("simulate-user", {
        body: {
          persona: scenario.persona ?? { label: "default", age_range: "25-50", style: "naturel" },
          objectives: scenario.objectives ?? [],
          transcript: history.map((m) => ({ role: m.role, content: m.content, agent_used: m.agent_used ?? null })),
          turn_index: turn,
          max_turns: maxTurns,
        },
      });
      if (simErr) throw simErr;
      const userMsg = sim.next_message;
      if (!userMsg) throw new Error("simulate-user returned empty next_message");

      // Send to Sophia
      const { data, error } = await authed.functions.invoke("sophia-brain", {
        body: { message: userMsg, history: history.slice(-10), channel: "web", scope },
      });
      if (error) throw error;
      history.push({ role: "user", content: userMsg });
      history.push({ role: "assistant", content: data.content, agent_used: data.mode ?? null });

      done = Boolean(sim.done);
      turn += 1;
    }
  }

  const { data: msgs, error: msgErr } = await admin
    .from("chat_messages")
    .select("role,content,created_at,agent_used")
    .eq("user_id", userId)
    .eq("scope", scope)
    .order("created_at", { ascending: true })
    .limit(200);
  if (msgErr) throw msgErr;

  const transcript = (msgs ?? []).map((m) => ({
    role: m.role,
    content: m.content,
    created_at: m.created_at,
    agent_used: m.role === "assistant" ? m.agent_used : null,
  }));

  const { data: stAfter } = await admin.from("user_chat_states").select("*").eq("user_id", userId).eq("scope", scope).maybeSingle();

  const { data: judged, error: judgeErr } = await authed.functions.invoke("eval-judge", {
    body: {
      dataset_key: scenario.dataset_key,
      scenario_key: scenario.id,
      tags: scenario.tags ?? [],
      transcript,
      state_before: stBefore ?? null,
      state_after: stAfter ?? null,
      config: { description: scenario.description ?? null },
      assertions: scenario.assertions ?? null,
    },
  });
  if (judgeErr) throw judgeErr;
  return judged;
}

function parseArgs(argv) {
  const out = { promptKey: null, sinceMinutes: null, scenarioId: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--prompt-key") out.promptKey = argv[++i] ?? null;
    else if (a === "--since-minutes") out.sinceMinutes = Number(argv[++i] ?? "0") || null;
    else if (a === "--scenario") out.scenarioId = argv[++i] ?? null;
  }
  return out;
}

function loadScenarios() {
  const dir = path.join(process.cwd(), "eval", "scenarios");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  return files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}

async function fetchRecentlyChangedPromptKeys(admin, sinceMinutes) {
  // Prompt overrides were removed (prompts are now versioned in code).
  // Keep the CLI flag for backwards compatibility, but it no longer selects scenarios by "recent prompt changes".
  return [];
}

async function main() {
  // Requires env in shell:
  // - VITE_SUPABASE_URL
  // - VITE_SUPABASE_ANON_KEY
  // - SUPABASE_SERVICE_ROLE_KEY
  const url = mustEnv("VITE_SUPABASE_URL");
  const anonKey = mustEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const seeded = await seedChatUser(admin, url, anonKey);

  // Grant internal admin to this runner user so it can call eval-judge/apply endpoints.
  await admin.from("internal_admins").upsert({ user_id: seeded.userId });

  const args = parseArgs(process.argv.slice(2));
  const allScenarios = loadScenarios();

  let selected = allScenarios;
  if (args.scenarioId) {
    selected = selected.filter((s) => s.id === args.scenarioId);
  }

  const changedKeys = await fetchRecentlyChangedPromptKeys(admin, args.sinceMinutes);
  const keyFilter = args.promptKey ? [args.promptKey] : changedKeys;
  if (keyFilter.length > 0) {
    selected = selected.filter((s) => Array.isArray(s.tags) && s.tags.some((t) => keyFilter.includes(t)));
  }

  if (selected.length === 0) {
    console.log("No scenarios selected. Tip: run without filters, or use --prompt-key sophia.dispatcher, or --since-minutes 60.");
    return;
  }

  for (const s of selected) {
    const judged = await runScenario(seeded, s);
    console.log(`\n=== ${s.dataset_key}/${s.id} ===`);
    console.log(`run_id: ${judged.eval_run_id}`);
    console.log(`issues: ${(judged.issues ?? []).length} | suggestions: ${(judged.suggestions ?? []).length}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


