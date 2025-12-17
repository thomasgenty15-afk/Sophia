/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z, getRequestId, jsonResponse, parseJsonBody, serverError } from "../_shared/http.ts";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { processMessage } from "../sophia-brain/router.ts";

function isMegaEnabled(): boolean {
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
  return megaRaw === "1" || (megaRaw === "" && isLocalSupabase);
}

function makeNonce(): string {
  const rand = (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return String(rand).replace(/[^a-zA-Z0-9]/g, "").slice(0, 14);
}

async function seedActivePlan(admin: any, userId: string) {
  const submissionId = crypto.randomUUID();

  // Ensure onboarding completed (some flows assume it).
  await admin.from("profiles").update({ onboarding_completed: true }).eq("id", userId);

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

  const planContent = { phases: [{ id: "phase_1", title: "Phase 1", status: "active", actions: [] }] };
  const { data: planRow, error: planErr } = await admin
    .from("user_plans")
    .insert({
      user_id: userId,
      goal_id: goalRow.id,
      submission_id: submissionId,
      status: "active",
      current_phase: 1,
      title: "Eval plan",
      content: planContent,
    })
    .select("id,submission_id")
    .single();
  if (planErr) throw planErr;

  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { error: actionErr } = await admin.from("user_actions").insert({
    user_id: userId,
    plan_id: planRow.id,
    submission_id: planRow.submission_id,
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
}

function stubUserMessage(objectives: any[] = [], turn: number): { msg: string; done: boolean } {
  const kind = String(objectives?.[0]?.kind ?? "generic");
  switch (kind) {
    case "trigger_checkup":
      return turn === 0 ? { msg: "Check du soir", done: false } : { msg: "Ok. Et sinon j’ai un souci de budget… mais on peut continuer.", done: true };
    case "explicit_stop_checkup":
      return turn === 0 ? { msg: "Check du soir", done: false } : { msg: "Stop, je veux parler d’autre chose.", done: true };
    case "trigger_firefighter":
      return { msg: "Je panique là, j’ai le cœur qui bat trop vite.", done: true };
    default:
      return { msg: `Test turn ${turn}: ok.`, done: turn >= 1 };
  }
}

const ScenarioSchema = z
  .object({
    dataset_key: z.string().min(1),
    id: z.string().min(1),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    steps: z.array(z.object({ user: z.string().min(1) })).optional(),
    persona: z.any().optional(),
    objectives: z.array(z.any()).optional(),
    max_turns: z.number().int().min(1).max(50).optional(),
    assertions: z.any().optional(),
  })
  .passthrough();

const BodySchema = z.object({
  scenarios: z.array(ScenarioSchema).min(1).max(50),
  limits: z
    .object({
      max_scenarios: z.number().int().min(1).max(50).default(10),
      max_turns_per_scenario: z.number().int().min(1).max(50).default(8),
      stop_on_first_failure: z.boolean().default(false),
      // cost control is currently an estimate; default is safe.
      budget_usd: z.number().min(0).default(0),
      use_real_ai: z.boolean().default(false),
    })
    .default({ max_scenarios: 10, max_turns_per_scenario: 8, stop_on_first_failure: false, budget_usd: 0, use_real_ai: false }),
});

console.log("run-evals: Function initialized");

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    if (req.method === "OPTIONS") return handleCorsOptions(req);
    const corsErr = enforceCors(req);
    if (corsErr) return corsErr;
    if (req.method !== "POST") return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });

    const parsed = await parseJsonBody(req, BodySchema, requestId);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const authHeader = req.headers.get("Authorization") ?? "";
    const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
    const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
    if (!url || !anonKey || !serviceKey) return serverError(req, requestId, "Server misconfigured");

    // Authenticate caller
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    const callerId = auth.user.id;

    // Admin gate
    const { data: adminRow } = await userClient.from("internal_admins").select("user_id").eq("user_id", callerId).maybeSingle();
    if (!adminRow) return jsonResponse(req, { error: "Forbidden", request_id: requestId }, { status: 403 });

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const selected = (body.scenarios ?? []).slice(0, body.limits.max_scenarios);
    const results: any[] = [];
    let stoppedReason: string | null = null;
    let totalEstimatedCostUsd = 0;
    let totalTokens = 0;
    let totalPromptTokens = 0;
    let totalOutputTokens = 0;

    for (const s of selected) {
      const scenarioRequestId = `${requestId}:${s.dataset_key}:${s.id}:${crypto.randomUUID()}`;
      const nonce = makeNonce();
      const email = `run-evals+${nonce}@example.com`;
      const password = `T${nonce}!123456`;

      // Create ephemeral auth user (FKs require auth.users)
      const { data: created, error: createErr } = await (admin as any).auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "Eval Runner" },
      });
      if (createErr) throw createErr;
      const testUserId = created.user?.id;
      if (!testUserId) throw new Error("Missing test user id");

      try {
        await seedActivePlan(admin as any, testUserId);

        const { data: stBefore } = await admin.from("user_chat_states").select("*").eq("user_id", testUserId).maybeSingle();

        const history: any[] = [];
        // Dashboard limit is the authoritative upper bound; scenario max_turns is informational only.
        const maxTurns = Number(body.limits.max_turns_per_scenario);

        const meta = { requestId: scenarioRequestId, forceRealAi: Boolean(body.limits.use_real_ai) };

        if (Array.isArray(s.steps) && s.steps.length > 0) {
          for (const step of s.steps.slice(0, maxTurns)) {
            const resp = await processMessage(admin as any, testUserId, step.user, history, meta);
            history.push({ role: "user", content: step.user });
            history.push({ role: "assistant", content: resp.content, agent_used: resp.mode });
          }
        } else {
          // Simulated mode:
          // - STUB: deterministic messages (MEGA_TEST_MODE)
          // - REAL AI: call simulate-user each turn (force_real_ai) so the user-agent is also real
          let turn = 0;
          let done = false;
          while (!done && turn < maxTurns) {
            let userMsg = "";
            let nextDone = false;

            if (body.limits.use_real_ai) {
              const simResp = await fetch(`${url}/functions/v1/simulate-user`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": authHeader,
                  "apikey": anonKey,
                  "x-request-id": scenarioRequestId,
                },
                body: JSON.stringify({
                  persona: s.persona ?? { label: "default", age_range: "25-50", style: "naturel" },
                  objectives: s.objectives ?? [],
                  transcript: history.map((m) => ({ role: m.role, content: m.content, agent_used: m.agent_used ?? null })),
                  turn_index: turn,
                  max_turns: maxTurns,
                  force_real_ai: true,
                }),
              });
              const simJson = await simResp.json().catch(() => ({}));
              if (!simResp.ok || simJson?.error) throw new Error(simJson?.error || `simulate-user failed (${simResp.status})`);
              userMsg = String(simJson.next_message ?? "");
              nextDone = Boolean(simJson.done);
            } else {
              const { msg, done: stubDone } = stubUserMessage(s.objectives ?? [], turn);
              userMsg = msg;
              // In stub mode, allow early completion (faster) but maxTurns remains a hard upper bound.
              nextDone = stubDone;
            }

            const resp = await processMessage(admin as any, testUserId, userMsg, history, meta);
            history.push({ role: "user", content: userMsg });
            history.push({ role: "assistant", content: resp.content, agent_used: resp.mode });
            done = nextDone;
            turn += 1;
          }
        }

        const { data: msgs } = await admin
          .from("chat_messages")
          .select("role,content,created_at,agent_used")
          .eq("user_id", testUserId)
          .order("created_at", { ascending: true })
          .limit(200);

        const transcript = (msgs ?? []).map((m: any) => ({
          role: m.role,
          content: m.content,
          created_at: m.created_at,
          agent_used: m.role === "assistant" ? m.agent_used : null,
        }));

        const { data: stAfter } = await admin.from("user_chat_states").select("*").eq("user_id", testUserId).maybeSingle();

        // Invoke eval-judge (reuse logic + DB writes). Forward caller JWT for admin gate.
        const judgeResp = await fetch(`${url}/functions/v1/eval-judge`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader,
            "apikey": anonKey,
            "x-request-id": scenarioRequestId,
          },
          body: JSON.stringify({
            dataset_key: s.dataset_key,
            scenario_key: s.id,
            tags: s.tags ?? [],
            force_real_ai: Boolean(body.limits.use_real_ai),
            transcript,
            state_before: stBefore ?? null,
            state_after: stAfter ?? null,
            config: { description: s.description ?? null, tags: s.tags ?? [] },
            assertions: s.assertions ?? null,
          }),
        });
        const judgeJson = await judgeResp.json().catch(() => ({}));
        if (!judgeResp.ok || judgeJson?.error) {
          throw new Error(judgeJson?.error || `eval-judge failed (${judgeResp.status})`);
        }

        const issuesCount = Array.isArray(judgeJson.issues) ? judgeJson.issues.length : 0;
        const suggestionsCount = Array.isArray(judgeJson.suggestions) ? judgeJson.suggestions.length : 0;
        const costUsd = Number(judgeJson?.metrics?.cost_usd ?? 0) || 0;
        const pTok = Number(judgeJson?.metrics?.prompt_tokens ?? 0) || 0;
        const oTok = Number(judgeJson?.metrics?.output_tokens ?? 0) || 0;
        const tTok = Number(judgeJson?.metrics?.total_tokens ?? 0) || 0;
        totalEstimatedCostUsd += costUsd;
        totalPromptTokens += pTok;
        totalOutputTokens += oTok;
        totalTokens += tTok;

        results.push({
          dataset_key: s.dataset_key,
          scenario_key: s.id,
          eval_run_id: judgeJson.eval_run_id,
          issues_count: issuesCount,
          suggestions_count: suggestionsCount,
          cost_usd: costUsd,
          prompt_tokens: pTok,
          output_tokens: oTok,
          total_tokens: tTok,
        });

        if (body.limits.stop_on_first_failure && issuesCount > 0) {
          stoppedReason = `Stopped on first failure: scenario ${s.id} had ${issuesCount} issues`;
          break;
        }
        if (body.limits.budget_usd > 0 && totalEstimatedCostUsd >= body.limits.budget_usd) {
          stoppedReason = `Budget reached: ${totalEstimatedCostUsd.toFixed(4)} USD`;
          break;
        }
      } finally {
        // Cleanup auth user (best effort)
        try {
          await (admin as any).auth.admin.deleteUser(testUserId);
        } catch {
          // ignore
        }
      }
    }

    return jsonResponse(req, {
      success: true,
      request_id: requestId,
      mega_test_mode: isMegaEnabled(),
      use_real_ai: Boolean(body.limits.use_real_ai),
      ran: results.length,
      stopped_reason: stoppedReason,
      total_cost_usd: totalEstimatedCostUsd,
      total_prompt_tokens: totalPromptTokens,
      total_output_tokens: totalOutputTokens,
      total_tokens: totalTokens,
      results,
    });
  } catch (error) {
    console.error(`[run-evals] request_id=${requestId}`, error);
    return serverError(req, requestId);
  }
});


