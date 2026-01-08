import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { getRequestId, jsonResponse, parseJsonBody, serverError } from "../_shared/http.ts";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { processMessage } from "../sophia-brain/router.ts";
import { getDashboardContext } from "../sophia-brain/state-manager.ts";

import { BodySchema, type RunEvalsBody } from "./schemas.ts";
import { buildMechanicalIssues } from "./lib/mechanical.ts";
import { buildRunPlanTemplate, fetchPlanSnapshot, type RunPlanTemplate, seedActivePlan } from "./lib/plan.ts";
import { fetchProfileSnapshot } from "./lib/profile.ts";
import { invokeWhatsAppWebhook, seedOptInPromptForWhatsApp, waPayloadForSingleMessage } from "./lib/whatsapp.ts";
import {
  backoffMs,
  denoEnv,
  isBilanCompletedFromChatState,
  isMegaEnabled,
  looksAffirmative,
  looksLikeCheckupIntent,
  makeNonce,
  sleep,
} from "./lib/utils.ts";

const EVAL_MODEL = "gemini-2.5-flash";
const DEFAULT_JUDGE_MODEL = "gemini-3-pro-preview";

export function serveRunEvals() {
  console.log("run-evals: Function initialized");

  const serve = ((globalThis as any)?.Deno?.serve ?? null) as any;
  serve(async (req: Request) => {
    const requestId = getRequestId(req);
    try {
      if (req.method === "OPTIONS") return handleCorsOptions(req);
      const corsErr = enforceCors(req);
      if (corsErr) return corsErr;
      if (req.method !== "POST") return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });

      const parsed = await parseJsonBody(req, BodySchema, requestId);
      if (!parsed.ok) return parsed.response;
      const body: RunEvalsBody = parsed.data as any;

      const authHeader = req.headers.get("Authorization") ?? "";
      const url = (denoEnv("SUPABASE_URL") ?? "").trim();
      const anonKey = (denoEnv("SUPABASE_ANON_KEY") ?? "").trim();
      const serviceKey = (denoEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
      if (!url || !anonKey || !serviceKey) return serverError(req, requestId, "Server misconfigured");

      // Debug (non-sensitive): log JWT alg for env keys (helps diagnose misconfigured local secrets).
      // ALSO: hard-guard. If keys are ES256 (common local flake after restart), auth.admin.* will fail with bad_jwt.
      // Return a structured retryable error so the runner can wait/restart and resume (instead of restarting from scratch).
      const decodeAlg = (jwt: string) => {
        const t = (jwt ?? "").trim();
        const p0 = t.split(".")[0] ?? "";
        if (!p0) return "missing";
        const header = JSON.parse(
          new TextDecoder().decode(
            Uint8Array.from(
              atob(p0.replace(/-/g, "+").replace(/_/g, "/")),
              (c) => c.charCodeAt(0),
            ),
          ),
        );
        return String(header?.alg ?? "unknown");
      };
      let serviceAlg = "parse_failed";
      let anonAlg = "parse_failed";
      try {
        serviceAlg = decodeAlg(serviceKey);
        anonAlg = decodeAlg(anonKey);
        console.log(`[run-evals] request_id=${requestId} service_role_alg=${serviceAlg} anon_alg=${anonAlg}`);
      } catch {
        console.log(`[run-evals] request_id=${requestId} key_alg=parse_failed`);
      }
      if (serviceAlg !== "HS256" || anonAlg !== "HS256") {
        return jsonResponse(
          req,
          {
            error: "Edge runtime env keys look unhealthy (expected HS256). Retry after local restart.",
            code: "BAD_JWT_ENV",
            request_id: requestId,
            details: { service_role_alg: serviceAlg, anon_alg: anonAlg },
          },
          { status: 503 },
        );
      }

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
      const evalModel = body.limits.model ?? EVAL_MODEL;
      const judgeModel =
        (denoEnv("GEMINI_JUDGE_MODEL") ?? "").trim() || DEFAULT_JUDGE_MODEL;
      const results: any[] = [];
      let stoppedReason: string | null = null;
      let totalEstimatedCostUsd = 0;
      let totalTokens = 0;
      let totalPromptTokens = 0;
      let totalOutputTokens = 0;

      // Build a single shared plan template for the whole run, reused across scenarios.
      // IMPORTANT: build lazily so if we are resuming an interrupted run we do NOT regenerate a plan.
      // (User expectation: retry must continue where it left off, never restart from scratch.)
      let runPlanTemplate: RunPlanTemplate | null = null;
      let runPlanTemplateFingerprint: string | null = null;
      const getRunPlanTemplate = async () => {
        if (!runPlanTemplate) {
          runPlanTemplate = await buildRunPlanTemplate({ url, anonKey, authHeader, requestId });
          runPlanTemplateFingerprint = runPlanTemplate.templateFingerprint;
        }
        return runPlanTemplate;
      };

      for (const s of selected) {
        // IMPORTANT: deterministic per-scenario request id.
        // - Improves log correlation across internal calls (sophia-brain, simulate-user, eval-judge).
        // - Prevents "duplicate tests" when a client retries run-evals (WORKER_LIMIT / worker cancellation).
        // - Still unique per scenario within a run because s.id is unique.
        const scenarioRequestId = `${requestId}:${s.dataset_key}:${s.id}`;
        // --- Resume / idempotency (critical) ---
        // If this request is retried (worker cancelled / hot-reload / transient infra), we MUST continue
        // from where it left off (same test user + same chat history), never restart from scratch.
        let existingRunId: string | null = null;
        let testUserId: string | null = null;
        let resumeFromDb = false;
        try {
          const { data: existing } = await admin
            .from("conversation_eval_runs")
            .select("id,status,config,state_before")
            // request_id is stored in config (jsonb) for this table.
            .eq("config->>request_id", scenarioRequestId)
            .maybeSingle();
          existingRunId = existing?.id ?? null;
          testUserId = (existing as any)?.config?.test_user_id ?? null;
          resumeFromDb = Boolean(existingRunId && testUserId && String(existing?.status ?? "") !== "completed");
        } catch {
          // Non-blocking: if this lookup fails, we fall back to fresh run behavior.
          existingRunId = null;
          testUserId = null;
          resumeFromDb = false;
        }

        try {
          const bilanCount = Number(body.limits.bilan_actions_count ?? 0) || 0;
          const scenarioChannel = String((s as any)?.channel ?? "web").trim().toLowerCase();
          const isWhatsApp = scenarioChannel === "whatsapp";
          const scope = isWhatsApp ? "whatsapp" : "web";
          const includeVitalsInBilan =
            (Array.isArray((s as any)?.tags) && (s as any).tags.includes("bilan.vitals")) ||
            Boolean((s as any)?.assertions?.include_vitals_in_bilan);

          if (!resumeFromDb || !testUserId) {
            // Fresh run: create ephemeral auth user (FKs require auth.users) + seed a plan/state.
            const nonce = makeNonce();
            const email = `run-evals+${nonce}@example.com`;
            const password = `T${nonce}!123456`;
            const { data: created, error: createErr } = await (admin as any).auth.admin.createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: { full_name: "Eval Runner" },
            });
            if (createErr) throw createErr;
            testUserId = created.user?.id ?? null;
            if (!testUserId) throw new Error("Missing test user id");

            // Default behavior: always seed a plan (back-compat).
            // WhatsApp onboarding scenarios may opt out to test "no plan" flows.
            const scenarioSeedPlanRaw = (s as any)?.seed_plan ?? (s as any)?.setup?.seed_plan;
            const scenarioSeedPlan = typeof scenarioSeedPlanRaw === "boolean" ? scenarioSeedPlanRaw : true;

            if (scenarioSeedPlan) {
              await seedActivePlan(
                admin as any,
                testUserId,
                { url, anonKey, authHeader, requestId: scenarioRequestId },
                {
                  bilanActionsCount: bilanCount,
                  // Only build a plan template if we actually need to seed a bilan plan.
                  planTemplate: bilanCount > 0 ? await getRunPlanTemplate() : undefined,
                  includeVitalsInBilan,
                },
              );
            } else {
              // Ensure onboarding completed (some flows assume it).
              await (admin as any).from("profiles").update({ onboarding_completed: true }).eq("id", testUserId);
            }

            if (isWhatsApp) {
              const setup = (s as any)?.setup ?? {};
              const phone = String(setup?.phone_number ?? `+1555${nonce}`).trim();
              const phoneVerified = Boolean(setup?.phone_verified);
              const trialEnd = String(
                setup?.trial_end ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              );

              await (admin as any).from("profiles").update({
                email,
                phone_number: phone,
                phone_invalid: Boolean(setup?.phone_invalid ?? false),
                phone_verified_at: phoneVerified ? new Date().toISOString() : null,
                trial_end: trialEnd,
                whatsapp_opted_in: Boolean(setup?.whatsapp_opted_in ?? false),
                whatsapp_opted_out_at: setup?.whatsapp_opted_out_at ?? null,
                whatsapp_optout_reason: setup?.whatsapp_optout_reason ?? null,
                whatsapp_optout_confirmed_at: setup?.whatsapp_optout_confirmed_at ?? null,
                whatsapp_state: setup?.whatsapp_state ?? null,
                whatsapp_state_updated_at: setup?.whatsapp_state ? new Date().toISOString() : null,
              }).eq("id", testUserId);

              if (Boolean(setup?.seed_optin_prompt)) {
                await seedOptInPromptForWhatsApp(admin as any, testUserId);
              }
            }
          }

          // Always load the current state + context from DB (works for both fresh + resumed).
          const { data: stBefore } = await admin.from("user_chat_states").select("*").eq("user_id", testUserId).eq("scope", scope).maybeSingle();
          // Print investigation_state before conversation transcript (much easier to debug bilan flows).
          if ((stBefore as any)?.investigation_state) {
            console.log(`[Eval] state_before.investigation_state: ${JSON.stringify((stBefore as any).investigation_state)}`);
          }
          const dashboardContext = await getDashboardContext(admin as any, testUserId);
          const planSnapshot = await fetchPlanSnapshot(admin as any, testUserId);
          const profileBefore = await fetchProfileSnapshot(admin as any, testUserId);

          // Create or update the eval run row early so retries can resume mid-run.
          // (eval-judge remains the source of truth for issues/suggestions at the end.)
          if (!existingRunId) {
            const { data: inserted, error: insErr } = await admin
              .from("conversation_eval_runs")
              .insert({
                dataset_key: s.dataset_key,
                scenario_key: s.id,
                status: "running",
                created_by: callerId,
                config: {
                  request_id: scenarioRequestId,
                  eval_runner: true,
                  resumed: false,
                  test_user_id: testUserId,
                  channel: scenarioChannel,
                },
                transcript: [],
                state_before: isWhatsApp ? { profile: profileBefore, chat_state: stBefore ?? null } : (stBefore ?? null),
                state_after: null,
              })
              .select("id")
              .single();
            if (insErr) throw insErr;
            existingRunId = inserted.id as string;
          } else {
            // Ensure the row remains linked to the test user id (in case it was created before we stored it).
            await admin
              .from("conversation_eval_runs")
              .update({
                status: "running",
                created_by: callerId,
                config: {
                  request_id: scenarioRequestId,
                  eval_runner: true,
                  resumed: resumeFromDb,
                  test_user_id: testUserId,
                  channel: scenarioChannel,
                },
                state_before: isWhatsApp ? { profile: profileBefore, chat_state: stBefore ?? null } : ((stBefore as any) ?? null),
              })
              .eq("id", existingRunId);
          }

          // Load history from DB if resuming; otherwise start empty and rely on processMessage.
          const history: any[] = [];
          if (resumeFromDb) {
            const { data: msgsExisting } = await admin
              .from("chat_messages")
              .select("role,content,created_at,agent_used")
              .eq("user_id", testUserId)
              .eq("scope", scope)
              .order("created_at", { ascending: true })
              .limit(400);
            for (const m of (msgsExisting ?? [])) {
              history.push({ role: m.role, content: m.content, agent_used: (m as any).agent_used ?? null });
            }
          }
          // UI control is the single source of truth for turn count.
          // (Scenario JSON used to carry max_turns, but it's intentionally ignored to avoid ambiguity.)
          const maxTurns = Number(body.limits.max_turns_per_scenario);

          // Always real AI in eval runner.
          const meta = { requestId: scenarioRequestId, forceRealAi: true, model: evalModel, channel: "web" as const, scope: "web" };

          // BILAN kickoff:
          // When bilan_actions_count > 0, we start the conversation as if the user just accepted the checkup ("oui").
          // This guarantees investigator opens with the first item immediately and matches expected product behavior.
          const firstStepUser = Array.isArray((s as any).steps) && (s as any).steps.length > 0 ? String((s as any).steps[0]?.user ?? "") : "";
          const shouldKickoff =
            bilanCount > 0 &&
            // If the scenario already starts with "bilan"/an affirmative, don't double-trigger.
            !(looksAffirmative(firstStepUser) || looksLikeCheckupIntent(firstStepUser));

          if (shouldKickoff && history.length === 0) {
            const kickoffMsg = "Oui";
            const kickoffResp = await processMessage(admin as any, testUserId, kickoffMsg, history, meta);
            history.push({ role: "user", content: kickoffMsg });
            history.push({ role: "assistant", content: kickoffResp.content, agent_used: kickoffResp.mode });
          }

          const testDeferral = Boolean(body.limits.test_post_checkup_deferral);
          const sophiaTestOpts = testDeferral
            ? {
              // Eval-only: encourage explicit deferral phrases so the parking-lot can be tested.
              contextOverride:
                "MODE TEST PARKING LOT: Si l'utilisateur digresse pendant le bilan (stress/bruit/orga), réponds brièvement ET dis explicitement " +
                "\"on pourra en reparler après / à la fin\" avant de revenir au bilan. Fais-le au moins 2 fois sur le bilan si possible.",
            }
            : undefined;

          if (isWhatsApp) {
            const setup = (s as any)?.setup ?? {};
            const waSteps = Array.isArray((s as any)?.wa_steps) ? (s as any).wa_steps : [];
            const defaultFrom = String(setup?.from ?? setup?.phone_number ?? profileBefore?.phone_number ?? "").trim();

            const digitsOnly = (raw: string) => String(raw ?? "").trim().replace(/[()\s-]/g, "").replace(/^\+/, "");

            for (let idx = 0; idx < waSteps.length; idx++) {
              const step = waSteps[idx] ?? {};
              const from = digitsOnly(String(step.from ?? defaultFrom));
              const waMessageId = `wamid_${scenarioRequestId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 28)}_${idx}`;
              const kind = String(step.kind ?? step.type ?? "text").trim().toLowerCase();

              const payload = waPayloadForSingleMessage(
                kind === "interactive"
                  ? {
                    from,
                    wa_message_id: waMessageId,
                    type: "interactive",
                    interactive_id: String(step.interactive_id ?? ""),
                    interactive_title: String(step.interactive_title ?? step.interactive_id ?? ""),
                    profile_name: String(step.profile_name ?? "Eval Runner"),
                  }
                  : {
                    from,
                    wa_message_id: waMessageId,
                    type: "text",
                    text: String(step.text ?? ""),
                    profile_name: String(step.profile_name ?? "Eval Runner"),
                  },
              );

              const wh = await invokeWhatsAppWebhook({ url, requestId: scenarioRequestId, payload });
              if (!wh.ok) {
                throw new Error(`whatsapp-webhook failed (status=${wh.status}): ${JSON.stringify(wh.body)}`);
              }
            }
          } else if (Array.isArray((s as any).steps) && (s as any).steps.length > 0) {
            // Best-effort resume: assume each user message corresponds to one step (except kickoff "Oui" when present).
            const alreadyUserMsgs = history.filter((m) => m.role === "user").length;
            const kickoffOffset =
              shouldKickoff && history.length > 0 && String(history[0]?.content ?? "").trim().toLowerCase() === "oui" ? 1 : 0;
            const startStepIdx = Math.max(0, alreadyUserMsgs - kickoffOffset);
            for (const step of (s as any).steps.slice(startStepIdx, maxTurns)) {
              const resp = await processMessage(admin as any, testUserId, step.user, history, meta, sophiaTestOpts);
              history.push({ role: "user", content: step.user });
              history.push({ role: "assistant", content: resp.content, agent_used: resp.mode });

              // For BILAN runs:
              // - If test_post_checkup_deferral is OFF: stop immediately once the investigation is complete (normal bilan test).
              // - If test_post_checkup_deferral is ON: stop ONLY when investigation_state becomes null (meaning post-checkup is also done).
              if (bilanCount > 0) {
                const { data: stMid } = await admin
                  .from("user_chat_states")
                  .select("investigation_state")
                  .eq("user_id", testUserId)
                  .eq("scope", "web")
                  .maybeSingle();

                if (testDeferral) {
                  // Wait until post-checkup parking lot is done.
                  // Router uses a special marker state in eval mode (`post_checkup_done`) so we can assert behavior.
                  const st = (stMid as any)?.investigation_state ?? null;
                  if (!st || st?.status === "post_checkup_done") break;
                } else {
                  // Stop as soon as the main list is done (legacy behavior).
                  if (isBilanCompletedFromChatState(stMid)) break;
                }
              }
            }

            // If steps are exhausted but we're still in post-checkup testing, continue with simulated-user turns
            // so we can actually clear the parking-lot.
            if (bilanCount > 0 && testDeferral) {
              let extraTurn = 0;
              while (extraTurn < Math.max(0, maxTurns - (((s as any).steps?.length ?? 0) as number))) {
                const { data: stMid } = await admin
                  .from("user_chat_states")
                  .select("investigation_state")
                  .eq("user_id", testUserId)
                  .eq("scope", "web")
                  .maybeSingle();
                const st = (stMid as any)?.investigation_state ?? null;
                if (!st || st?.status === "post_checkup_done") break;

                // Ask simulate-user for the next message (force it to progress the parking lot).
                const simResp = await fetch(`${url}/functions/v1/simulate-user`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": authHeader,
                    "apikey": anonKey,
                    "x-request-id": scenarioRequestId,
                  },
                  body: JSON.stringify({
                    persona: (s as any).persona ?? { label: "default", age_range: "25-50", style: "naturel" },
                    objectives: (s as any).objectives ?? [],
                    difficulty: (body.limits.user_difficulty ?? "mid"),
                    model: evalModel,
                    force_real_ai: true,
                    context: [
                      "=== CONSIGNE TEST PARKING LOT ===",
                      "Si Sophia te propose de reprendre un sujet après bilan, réponds 'Oui'.",
                      "Quand elle te demande 'c'est bon pour ce point ?', réponds 'C'est bon, on passe au suivant.'",
                    ].join("\n"),
                    transcript: history.map((m) => ({ role: m.role, content: m.content, agent_used: m.agent_used ?? null })),
                    turn_index: extraTurn,
                    max_turns: maxTurns,
                  }),
                });
                const simJson = await simResp.json().catch(() => ({}));
                const userMsg = String(simJson?.next_message ?? "Oui");

                const resp2 = await processMessage(admin as any, testUserId, userMsg, history, meta, sophiaTestOpts);
                history.push({ role: "user", content: userMsg });
                history.push({ role: "assistant", content: resp2.content, agent_used: resp2.mode });
                extraTurn += 1;
                await sleep(250);
              }
            }
          } else {
            // Simulated mode:
            // - STUB: deterministic messages (MEGA_TEST_MODE)
            // - REAL AI: call simulate-user each turn (force_real_ai) so the user-agent is also real
            // Resume: continue turn_index from existing transcript length so simulate-user stays consistent-ish.
            let turn = history.filter((m) => m.role === "user").length;
            let done = false;
            while (!done && turn < maxTurns) {
              let userMsg = "";
              let nextDone = false;

              if (true) {
                const MAX_SIM_RETRIES = 6;
                let simJson: any = null;
                let simStatus = 0;
                for (let attempt = 1; attempt <= MAX_SIM_RETRIES; attempt++) {
                  const simResp = await fetch(`${url}/functions/v1/simulate-user`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": authHeader,
                      "apikey": anonKey,
                      "x-request-id": scenarioRequestId,
                    },
                    body: JSON.stringify({
                      persona: (s as any).persona ?? { label: "default", age_range: "25-50", style: "naturel" },
                      objectives: (s as any).objectives ?? [],
                      suggested_replies: (s as any).suggested_replies ?? undefined,
                      difficulty: (body.limits.user_difficulty ?? "mid"),
                      model: evalModel,
                      context: [
                        "=== CONTEXTE PLAN (référence) ===",
                        dashboardContext || "(vide)",
                        "",
                        "=== ÉTAT CHAT (référence) ===",
                        JSON.stringify(stBefore ?? null, null, 2),
                        "",
                        "=== CONSIGNE DE TEST SPÉCIFIQUE (EVAL RUNNER) ===",
                        body.limits.test_post_checkup_deferral
                          ? "IMPORTANT : TU DOIS TESTER LE 'PARKING LOT'. Pendant le bilan, trouve un moment pour dire 'on en reparle après' ou 'on verra ça à la fin' à propos d'un sujet (ex: ton organisation ou ton stress). Le but est de vérifier que Sophia le note et t'en reparle après le bilan."
                          : "",
                      ].join("\n"),
                      transcript: history.map((m) => ({ role: m.role, content: m.content, agent_used: m.agent_used ?? null })),
                      turn_index: turn,
                      max_turns: maxTurns,
                      force_real_ai: true,
                    }),
                  });
                  simStatus = simResp.status;
                  simJson = await simResp.json().catch(() => ({}));

                  const msg = String(simJson?.error ?? "");
                  const is429 = simStatus === 429 || msg.toLowerCase().includes("resource exhausted") || msg.includes("429");
                  const isOk = simResp.ok && !simJson?.error && String(simJson?.next_message ?? "").trim().length > 0;

                  if (isOk) break;
                  if (!is429) {
                    throw new Error(simJson?.error || `simulate-user failed (${simStatus})`);
                  }
                  if (attempt >= MAX_SIM_RETRIES) {
                    throw new Error(simJson?.error || `simulate-user failed (${simStatus})`);
                  }
                  await sleep(backoffMs(attempt));
                }

                userMsg = String(simJson?.next_message ?? "");
                nextDone = Boolean(simJson?.done);
              }

              const resp = await processMessage(admin as any, testUserId, userMsg, history, meta, sophiaTestOpts);
              history.push({ role: "user", content: userMsg });
              history.push({ role: "assistant", content: resp.content, agent_used: resp.mode });

              // IMPORTANT:
              // simulate-user may decide "done" early, but for bilan tests we must keep going until
              // investigation_state is cleared (or post_checkup_done in special test mode).
              done = nextDone;

              // For BILAN runs (Simulated):
              // - If test_post_checkup_deferral is OFF: stop immediately once the investigation is complete (normal bilan test).
              // - If test_post_checkup_deferral is ON: stop ONLY when investigation_state becomes null (meaning post-checkup is also done).
              if (bilanCount > 0) {
                const { data: stMid } = await admin
                  .from("user_chat_states")
                  .select("investigation_state")
                  .eq("user_id", testUserId)
                  .eq("scope", "web")
                  .maybeSingle();

                if (testDeferral) {
                  // Wait until investigation_state is FULLY cleared.
                  // Also ignore simulate-user's early "done" while the session is still active.
                  done = isBilanCompletedFromChatState(stMid);
                } else {
                  // Stop as soon as the main list is done.
                  if (isBilanCompletedFromChatState(stMid)) {
                    done = true;
                  }
                }
              }
              turn += 1;

              // Throttle between turns to avoid 429 bursts (simulate-user + sophia-brain + judge).
              await sleep(350);
            }
          }

          const { data: msgs } = await admin
            .from("chat_messages")
            .select("role,content,created_at,agent_used")
            .eq("user_id", testUserId)
            .eq("scope", scope)
            .order("created_at", { ascending: true })
            .limit(200);

          const transcript = (msgs ?? []).map((m: any) => ({
            role: m.role,
            content: m.content,
            created_at: m.created_at,
            agent_used: m.role === "assistant" ? m.agent_used : null,
          }));

          const { data: stAfter } = await admin.from("user_chat_states").select("*").eq("user_id", testUserId).eq("scope", scope).maybeSingle();
          const profileAfter = await fetchProfileSnapshot(admin as any, testUserId);
          const mechanicalIssues = buildMechanicalIssues({ scenario: s, profileAfter, transcript });

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
              // Ensure eval-judge updates the SAME row (no duplicates).
              eval_run_id: existingRunId,
              dataset_key: s.dataset_key,
              scenario_key: s.id,
              tags: (s as any).tags ?? [],
              // By default, avoid the LLM judge to keep the eval run within edge runtime limits.
              // (Rule-based judge is enough for most regressions; enable explicitly when needed.)
              force_real_ai: Boolean(body.limits.judge_force_real_ai),
              model: judgeModel,
              transcript,
              state_before: isWhatsApp ? { profile: profileBefore, chat_state: stBefore ?? null } : (stBefore ?? null),
              state_after: isWhatsApp ? { profile: profileAfter, chat_state: stAfter ?? null } : (stAfter ?? null),
              config: {
                description: (s as any).description ?? null,
                tags: (s as any).tags ?? [],
                scenario_target: (s as any)?.scenario_target ?? null,
                channel: scenarioChannel,
                limits: {
                  bilan_actions_count: Number(body.limits.bilan_actions_count ?? 0) || 0,
                  test_post_checkup_deferral: Boolean(body.limits.test_post_checkup_deferral),
                  user_difficulty: body.limits.user_difficulty ?? "mid",
                  model: judgeModel,
                },
                plan_snapshot: {
                  template_fingerprint: runPlanTemplateFingerprint ?? null,
                  dashboard_context: dashboardContext || "",
                  ...planSnapshot,
                },
              },
              system_snapshot: {
                focus: (s as any)?.scenario_target ?? null,
                notes:
                  "Judge context: during active checkup, router hard-guard keeps investigator stable unless explicit stop/safety. In post-bilan parking-lot (test_post_checkup_deferral), routing to companion/architect to handle deferred topics is expected.",
              },
              // eval-judge schema: assertions is optional but NOT nullable.
              assertions: (s as any)?.assertions ?? undefined,
            }),
          });
          const judgeJson = await judgeResp.json().catch(() => ({}));
          if (!judgeResp.ok || judgeJson?.error) {
            throw new Error(judgeJson?.error || `eval-judge failed (${judgeResp.status})`);
          }

          // Merge deterministic mechanical checks into the eval run row (in addition to the judge).
          if (Array.isArray(mechanicalIssues) && mechanicalIssues.length > 0 && existingRunId) {
            try {
              const { data: row } = await admin
                .from("conversation_eval_runs")
                .select("issues,metrics")
                .eq("id", existingRunId)
                .maybeSingle();
              const prev = Array.isArray((row as any)?.issues) ? (row as any).issues : [];
              const merged = [...prev, ...mechanicalIssues];
              const prevMetrics = (row as any)?.metrics && typeof (row as any).metrics === "object" ? (row as any).metrics : {};
              await admin
                .from("conversation_eval_runs")
                .update({
                  issues: merged,
                  metrics: { ...prevMetrics, mechanical_issues_count: mechanicalIssues.length },
                })
                .eq("id", existingRunId);
              // Also reflect it in the in-memory judgeJson so run-evals returns consistent counts.
              judgeJson.issues = merged;
            } catch {
              // best-effort; don't fail the whole run
            }
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

          const turnsExecuted = Array.isArray(transcript) ? transcript.filter((m: any) => m?.role === "user").length : 0;
          const bilanCompleted = bilanCount > 0 ? isBilanCompletedFromChatState(stAfter) : false;

          results.push({
            dataset_key: s.dataset_key,
            scenario_key: s.id,
            eval_run_id: judgeJson.eval_run_id,
            plan_template_fingerprint: runPlanTemplateFingerprint ?? null,
            turns_executed: turnsExecuted,
            bilan_completed: bilanCompleted,
            plan_snapshot_actions_count: Array.isArray((planSnapshot as any)?.actions) ? (planSnapshot as any).actions.length : 0,
            bilan_pending_items_count: Array.isArray((stBefore as any)?.investigation_state?.pending_items)
              ? (stBefore as any).investigation_state.pending_items.length
              : 0,
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
          // Cleanup auth user ONLY after successful completion, otherwise keep for resume.
          try {
            if (testUserId) await (admin as any).auth.admin.deleteUser(testUserId);
          } catch {
            // ignore
          }
        } catch (e) {
          // Mark run row as errored but keep test user intact so a retry can resume.
          try {
            if (existingRunId) {
              await admin
                .from("conversation_eval_runs")
                .update({ status: "failed", error: String((e as any)?.message ?? e ?? "error") })
                .eq("id", existingRunId);
            }
          } catch {
            // ignore
          }
          throw e;
        }
      }

      const bilanActionsCount = Number(body.limits.bilan_actions_count ?? 0) || 0;
      const testDeferral = Boolean(body.limits.test_post_checkup_deferral);
      return jsonResponse(req, {
        success: true,
        request_id: requestId,
        mega_test_mode: isMegaEnabled(),
        use_real_ai: true,
        requested_scenarios: (body.scenarios ?? []).length,
        selected_scenarios: selected.length,
        limits_applied: {
          max_scenarios: body.limits.max_scenarios,
          max_turns_per_scenario: body.limits.max_turns_per_scenario,
          bilan_actions_count: bilanActionsCount,
          test_post_checkup_deferral: testDeferral,
          stop_on_first_failure: body.limits.stop_on_first_failure,
          budget_usd: body.limits.budget_usd,
          model: body.limits.model ?? EVAL_MODEL,
        },
        ran: results.length,
        stopped_reason: stoppedReason,
        plan_template_fingerprint: runPlanTemplateFingerprint ?? null,
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
}


