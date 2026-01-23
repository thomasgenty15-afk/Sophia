import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { getRequestId, jsonResponse, parseJsonBody, serverError } from "../_shared/http.ts";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { processMessage } from "../sophia-brain/router.ts";
import { getDashboardContext } from "../sophia-brain/state-manager.ts";

import { BodySchema, type RunEvalsBody } from "./schemas.ts";
import { buildMechanicalIssues } from "./lib/mechanical.ts";
import { buildRunPlanTemplate, buildRunPlanTemplateFromBank, fetchPlanSnapshot, type RunPlanTemplate, seedActivePlan } from "./lib/plan.ts";
import { logEvalEvent } from "./lib/eval_trace.ts";
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

function summarizeTranscriptRoleRuns(transcript: any[]): { role_runs: number; max_run: number; examples: Array<{ role: string; count: number; at: number }> } {
  const msgs = Array.isArray(transcript) ? transcript : [];
  let roleRuns = 0;
  let maxRun = 1;
  const examples: Array<{ role: string; count: number; at: number }> = [];
  let curRole: string | null = null;
  let curCount = 0;
  let curStart = 0;
  for (let i = 0; i < msgs.length; i++) {
    const r = String((msgs[i] as any)?.role ?? "");
    if (!r) continue;
    if (curRole == null) {
      curRole = r; curCount = 1; curStart = i; continue;
    }
    if (r === curRole) {
      curCount += 1;
      continue;
    }
    if (curCount > 1) {
      roleRuns += 1;
      if (curCount > maxRun) maxRun = curCount;
      if (examples.length < 5) examples.push({ role: curRole, count: curCount, at: curStart });
    }
    curRole = r; curCount = 1; curStart = i;
  }
  if (curRole && curCount > 1) {
    roleRuns += 1;
    if (curCount > maxRun) maxRun = curCount;
    if (examples.length < 5) examples.push({ role: curRole, count: curCount, at: curStart });
  }
  return { role_runs: roleRuns, max_run: maxRun, examples };
}

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

      // Manual judging mode:
      // When enabled, we do NOT generate "issues/suggestions" automatically (no mechanical assertions, no LLM judge).
      // We only persist transcript/state/config so an external qualitative judge (human / GPT in Cursor) can analyze.
      const manualJudge = Boolean((body as any)?.limits?.manual_judge);

      // IMPORTANT: run-evals can be killed by edge-runtime wall-clock limits when running long scenarios (20 turns).
      // We therefore support "chunked" execution: if we approach a per-request budget, we return a partial response.
      // NOTE: Supabase edge runtime kills isolates at ~60s wall clock. We MUST checkpoint BEFORE that.
      const maxWallClockMsPerRequest = (() => {
        const raw = (body as any)?.limits?.max_wall_clock_ms_per_request;
        const n = Number(raw);
        // Default: 45s to checkpoint safely before ~60s isolate kill
        return Number.isFinite(n) && n >= 10_000 ? Math.floor(n) : 45_000; // 45 seconds
      })();
      const requestDeadlineMs = Date.now() + maxWallClockMsPerRequest;
      const remainingBudgetMs = () => Math.max(0, requestDeadlineMs - Date.now());

      async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
        const t = Math.max(1_000, Math.floor(ms));
        return await Promise.race([
          p,
          (async () => {
            await sleep(t);
            throw new Error(`timeout:${label}:${t}ms`);
          })(),
        ]);
      }

      const authHeader = req.headers.get("Authorization") ?? "";
      const url = (denoEnv("SUPABASE_URL") ?? "").trim();
      const envAnonKey = (denoEnv("SUPABASE_ANON_KEY") ?? "").trim();
      const envServiceKey = (denoEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
      if (!url || !envAnonKey || !envServiceKey) return serverError(req, requestId, "Server misconfigured");

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
        serviceAlg = decodeAlg(envServiceKey);
        anonAlg = decodeAlg(envAnonKey);
        console.log(`[run-evals] request_id=${requestId} service_role_alg=${serviceAlg} anon_alg=${anonAlg}`);
      } catch {
        console.log(`[run-evals] request_id=${requestId} key_alg=parse_failed`);
      }

      // --- Key normalization (HS256 <-> ES256 robustness) ---
      // We historically rely on HS256 anon/service keys for local auth. Some environments may surface ES256 keys
      // (e.g. CLI/stack mismatch). In that case, GoTrue local may reject ES256 ("signing method ES256 is invalid").
      // To "accept both", we attempt a local-only fallback: mint HS256 keys from the JWT secret and use them
      // internally for Supabase clients.
      const reqHost = (() => {
        try {
          return new URL(req.url).hostname;
        } catch {
          return "";
        }
      })();
      // Detect "local" by the actual edge function request host (safer than SUPABASE_URL, which can be overridden).
      const reqHostLower = reqHost.toLowerCase();
      // In local docker networking, internal hostnames often look like "supabase_edge_runtime_<projectId>".
      // Treat those as local too.
      const isLocal =
        reqHostLower === "127.0.0.1" ||
        reqHostLower === "localhost" ||
        reqHostLower.startsWith("supabase_");
      const jwtSecret =
        // IMPORTANT: Edge runtime may skip env names starting with SUPABASE_ in some setups.
        // Prefer GOTRUE_JWT_SECRET / JWT_SECRET.
        (denoEnv("GOTRUE_JWT_SECRET") ?? denoEnv("JWT_SECRET") ?? denoEnv("SUPABASE_JWT_SECRET") ?? "").trim() ||
        (isLocal ? "super-secret-jwt-token-with-at-least-32-characters-long" : "");

      const base64Url = (bytes: Uint8Array) => {
        const s = btoa(String.fromCharCode(...bytes));
        return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      };
      const utf8 = (s: string) => new TextEncoder().encode(s);

      const signHs256 = async (payload: Record<string, unknown>) => {
        const header = { alg: "HS256", typ: "JWT" };
        const h = base64Url(utf8(JSON.stringify(header)));
        const p = base64Url(utf8(JSON.stringify(payload)));
        const toSign = `${h}.${p}`;
        const key = await crypto.subtle.importKey("raw", utf8(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8(toSign)));
        return `${toSign}.${base64Url(sig)}`;
      };

      let anonKey = envAnonKey;
      let serviceKey = envServiceKey;
      if ((serviceAlg !== "HS256" || anonAlg !== "HS256") && jwtSecret) {
        // Mint long-lived keys (local only). We keep issuer consistent with local default.
        const now = Math.floor(Date.now() / 1000);
        const exp = now + 60 * 60 * 24 * 365 * 10;
        const iss = "supabase-demo";
        try {
          anonKey = await signHs256({ iss, role: "anon", exp });
          serviceKey = await signHs256({ iss, role: "service_role", exp });
          console.log(
            `[run-evals] request_id=${requestId} key_override=hs256_minted local=${isLocal} (env_service_alg=${serviceAlg} env_anon_alg=${anonAlg})`,
          );
        } catch {
          // Fall through to BAD_JWT_ENV below
        }
      }

      // If we still don't have HS256, return a retryable structured error.
      if (decodeAlg(serviceKey) !== "HS256" || decodeAlg(anonKey) !== "HS256") {
        return jsonResponse(
          req,
          {
            error:
              "Edge runtime env keys look unhealthy (expected HS256, or provide SUPABASE_JWT_SECRET for local fallback). Retry after local restart.",
            code: "BAD_JWT_ENV",
            request_id: requestId,
            details: { service_role_alg: serviceAlg, anon_alg: anonAlg, local: isLocal, req_host: reqHost },
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
      let runPlanTemplateBank: any | null = null;
      const getRunPlanTemplate = async () => {
        if (!runPlanTemplate) {
          const useBank = Boolean((body as any)?.limits?.use_pre_generated_plans);
          const required = Boolean((body as any)?.limits?.pre_generated_plans_required);
          const themeKey = String((body as any)?.limits?.plan_bank_theme_key ?? "").trim() || null;
          if (useBank) {
            try {
              runPlanTemplate = await buildRunPlanTemplateFromBank({
                requestId,
                themeKey,
                required,
              });
            } catch (e) {
              const msg = String((e as any)?.message ?? e ?? "");
              const isBankEmpty = msg.includes("PLAN_BANK_EMPTY");
              if (!required && isBankEmpty) {
                console.warn(`[run-evals] plan bank empty; falling back to live generate-plan (costly). request_id=${requestId}`);
                runPlanTemplate = await buildRunPlanTemplate({ url, anonKey, authHeader, requestId });
              } else {
                throw e;
              }
            }
          } else {
            runPlanTemplate = await buildRunPlanTemplate({ url, anonKey, authHeader, requestId });
          }
          runPlanTemplateFingerprint = runPlanTemplate.templateFingerprint;
          runPlanTemplateBank = (runPlanTemplate as any)?.bank ?? null;
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
          // Mechanical assertion inputs can differ from the final transcript/state.
          // In particular for WhatsApp, we want mechanical checks to run immediately after explicit `wa_steps`,
          // not after any optional simulate-user loopback turns.
          let mechanicalProfileAfterOverride: any | null = null;
          let mechanicalTranscriptOverride: any[] | null = null;
          const includeVitalsInBilan =
            (Array.isArray((s as any)?.tags) && (s as any).tags.includes("bilan.vitals")) ||
            Boolean((s as any)?.assertions?.include_vitals_in_bilan);

        if (!resumeFromDb || !testUserId) {
            // Fresh run: create ephemeral auth user (FKs require auth.users) + seed a plan/state.
            const nonce = makeNonce();
          const makeDigitsNonce = (len = 10) => {
            const n = Math.max(1, Math.min(18, Math.floor(len)));
            const buf = new Uint8Array(n);
            crypto.getRandomValues(buf);
            let s = "";
            for (let i = 0; i < n; i++) s += String(buf[i] % 10);
            return s;
          };
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
              const setup = (s as any)?.setup ?? {};
              const defaultActiveActionsCount = isWhatsApp
                ? (Number.isFinite(Number(setup?.active_actions_count)) ? Number(setup.active_actions_count) : 2)
                : undefined;
              const useBank = Boolean((body as any)?.limits?.use_pre_generated_plans);
              await seedActivePlan(
                admin as any,
                testUserId,
                { url, anonKey, authHeader, requestId: scenarioRequestId },
                {
                  bilanActionsCount: bilanCount,
                  activeActionsCount: defaultActiveActionsCount,
                  preseedActions: Array.isArray((setup as any)?.preseed_actions) ? (setup as any).preseed_actions : [],
                  preseedActionEntries: Array.isArray((setup as any)?.preseed_action_entries)
                    ? (setup as any).preseed_action_entries
                    : [],
                  // If we're using the bank, ALWAYS reuse the run template to avoid per-scenario Gemini calls.
                  // Legacy behavior only built a template for bilan.
                  planTemplate: useBank ? await getRunPlanTemplate() : (bilanCount > 0 ? await getRunPlanTemplate() : undefined),
                  includeVitalsInBilan,
                },
              );
            } else {
              // Ensure onboarding completed (some flows assume it).
              await (admin as any).from("profiles").update({ onboarding_completed: true }).eq("id", testUserId);
            }

            if (isWhatsApp) {
              const setup = (s as any)?.setup ?? {};
            const phone = String(setup?.phone_number ?? `+1555${makeDigitsNonce(10)}`).trim();
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
          const meta = {
            requestId: scenarioRequestId,
            forceRealAi: true,
            model: evalModel,
            channel: "web" as const,
            scope: "web",
            evalRunId: existingRunId,
          };
          const stepHttpTimeoutMsCap = (() => {
            const raw = (denoEnv("EVAL_STEP_HTTP_TIMEOUT_MS") ?? "").trim();
            const n = Number(raw);
            return Number.isFinite(n) && n >= 5_000 ? Math.floor(n) : 90_000;
          })();

          // Ensure values persisted to JSON/JSONB columns are actually JSON-serializable.
          // (If serialization fails, supabase-js can end up sending an empty/invalid body -> PGRST102.)
          const toJsonSafe = <T>(value: T): T => {
            const controlChars = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
            const replacer = (_k: string, v: any) => {
              if (v === undefined) return null;
              if (typeof v === "bigint") return Number(v);
              if (typeof v === "number" && !Number.isFinite(v)) return null;
              if (typeof v === "function") return null;
              if (typeof v === "symbol") return null;
              // Avoid rare PostgREST "invalid json" failures due to control chars in strings.
              if (typeof v === "string") {
                // Replace control chars AND strip any invalid UTF-8 surrogates
                let clean = v.replace(controlChars, " ");
                // Remove lone surrogates (invalid in JSON)
                clean = clean.replace(/[\uD800-\uDFFF]/g, "");
                return clean;
              }
              return v;
            };
            try {
              return JSON.parse(JSON.stringify(value, replacer));
            } catch (e) {
              console.error("[toJsonSafe] stringify failed, returning null:", e);
              return null as T;
            }
          };

          // Transcript-specific sanitization:
          // We aggressively coerce content to a plain string and strip control chars to avoid PostgREST PGRST102
          // when updating `conversation_eval_runs.transcript` (seen in practice for some model outputs/tool traces).
          const toTranscriptText = (value: unknown): string => {
            const controlChars = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
            try {
              const s = typeof value === "string" ? value : JSON.stringify(value);
              return String(s ?? "").replace(controlChars, " ");
            } catch {
              // As a last resort, make sure we never throw while building the transcript.
              return String(value ?? "").replace(controlChars, " ");
            }
          };
          const normalizeTranscriptContent = (value: unknown) =>
            toTranscriptText(value).trim().toLowerCase();
          const buildTranscript = (items: any[]) => {
            const out: any[] = [];
            for (const m of (items ?? [])) {
              const role = String(m?.role ?? "").trim();
              const content = toTranscriptText(m?.content ?? "");
              if (!role || !content.trim()) continue;
              const last = out[out.length - 1];
              const isDup =
                last &&
                last.role === role &&
                normalizeTranscriptContent(last.content) === normalizeTranscriptContent(content);
              if (isDup) continue;
              out.push({ role, content, agent_used: (m as any)?.agent_used ?? null });
            }
            return out;
          };

          const testDeferral = Boolean(body.limits.test_post_checkup_deferral);
          // IMPORTANT: only apply the parking-lot coaching override DURING an active bilan/checkup.
          // Applying it outside a checkup causes the assistant to mention "bilan" out of nowhere and derails flows.
          const deferralEligible =
            testDeferral &&
            Boolean((stBefore as any)?.investigation_state) &&
            (stBefore as any)?.investigation_state?.status !== "post_checkup";
          const sophiaRunnerOpts = {
            disableForcedRouting: true,
            ...(deferralEligible
              ? {
                // Eval-only: encourage explicit deferral phrases so the parking-lot can be tested.
                contextOverride:
                  "MODE TEST PARKING LOT: Si l'utilisateur digresse pendant le bilan (stress/bruit/orga), réponds brièvement ET dis explicitement " +
                  "\"on pourra en reparler après / à la fin\" avant de revenir au bilan. Fais-le 1 fois (max) par sujet (ne boucle pas). " +
                  "Si l'utilisateur insiste 2 fois sur le même sujet, propose explicitement: \"on met le bilan en pause 2 minutes pour en parler maintenant, ou tu préfères qu'on finisse vite le bilan puis on y revient ?\"",
              }
              : {}),
          };

          // BILAN kickoff:
          // When bilan_actions_count > 0, we start the conversation as if the user just accepted the checkup ("oui").
          // This guarantees investigator opens with the first item immediately and matches expected product behavior.
          const firstStepUser = Array.isArray((s as any).steps) && (s as any).steps.length > 0 ? String((s as any).steps[0]?.user ?? "") : "";
          const shouldKickoff =
            bilanCount > 0 &&
            // If the scenario already starts with "bilan"/an affirmative, don't double-trigger.
            !(looksAffirmative(firstStepUser) || looksLikeCheckupIntent(firstStepUser));

          const hasExplicitSteps = Array.isArray((s as any)?.steps) && (s as any).steps.length > 0;
          // Kickoff ("Oui") is only useful for fixed-step scenarios where the first user message might be a bare confirmation.
          // For simulated AI-user scenarios (no steps), kickoff can accidentally start an unrelated session/mode and derail the run.
          if (shouldKickoff && history.length === 0 && hasExplicitSteps) {
            const kickoffMsg = "Oui";
            // Prevent long LLM hangs from triggering edge worker limits; keep each step bounded.
            (meta as any).httpTimeoutMs = Math.min(stepHttpTimeoutMsCap, Math.max(10_000, remainingBudgetMs() - 5_000));
            const kickoffResp = await processMessage(admin as any, testUserId, kickoffMsg, history, meta, sophiaRunnerOpts);
            history.push({ role: "user", content: kickoffMsg });
            history.push({ role: "assistant", content: kickoffResp.content, agent_used: kickoffResp.mode });
          }


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

            // Snapshot right after wa_steps (before auto simulation) for mechanical assertions.
            try {
              const { data: waMsgs0 } = await admin
                .from("chat_messages")
                .select("role,content,created_at,agent_used")
                .eq("user_id", testUserId)
                .eq("scope", "whatsapp")
                .order("created_at", { ascending: true })
                .limit(120);
              mechanicalTranscriptOverride = (waMsgs0 ?? []).map((m: any) => ({
                role: m.role,
                content: m.content,
                created_at: m.created_at,
                agent_used: m.role === "assistant" ? (m.agent_used ?? null) : null,
              }));
              mechanicalProfileAfterOverride = await fetchProfileSnapshot(admin as any, testUserId);
            } catch {
              // Best-effort: if snapshot fails, fall back to the end-of-run state/transcript.
              mechanicalTranscriptOverride = null;
              mechanicalProfileAfterOverride = null;
            }

            // Optional: loop "assistant -> simulate-user -> next inbound" without Meta transport.
            // Enabled per scenario via `wa_auto_simulate: true`.
            const autoSim = Boolean((s as any)?.wa_auto_simulate);
            if (autoSim) {
              const forceTurns = Boolean((s as any)?.wa_force_turns);
              const simulatePlanActivationOnDone = Boolean((s as any)?.wa_simulate_plan_activation_on_done);
              let turn = waSteps.length;
              while (turn < maxTurns) {
                const { data: waMsgs, error: waErr } = await admin
                  .from("chat_messages")
                  .select("role,content,created_at,agent_used")
                  .eq("user_id", testUserId)
                  .eq("scope", "whatsapp")
                  .order("created_at", { ascending: true })
                  .limit(120);
                if (waErr) throw waErr;
                const waTranscript = (waMsgs ?? []).map((m: any) => ({
                  role: m.role,
                  content: m.content,
                  agent_used: m.role === "assistant" ? (m.agent_used ?? null) : null,
                }));

                const simResp = await fetch(`${url}/functions/v1/simulate-user`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": authHeader,
                    "apikey": anonKey,
                    "x-request-id": scenarioRequestId,
                  },
                  body: JSON.stringify({
                    persona: (s as any)?.persona ?? { label: "Utilisateur WhatsApp", age_range: "25-50", style: "naturel" },
                    objectives: (s as any)?.objectives ?? [],
                    transcript: waTranscript,
                    turn_index: turn,
                    max_turns: maxTurns,
                    difficulty: (body.limits.user_difficulty ?? "mid"),
                    force_real_ai: true,
                    context:
                      "Canal: WhatsApp. Tu réponds comme un humain sur WhatsApp (messages courts). " +
                      (forceTurns
                        ? "IMPORTANT: ne termine pas la conversation trop tôt. Même si tu penses que c'est bon, continue de répondre naturellement jusqu'à la fin du test."
                        : "Tu peux répondre 'C'est bon' si tu as finalisé le plan, ou poser une question si tu ne comprends pas."),
                  }),
                });
                const simJson = await simResp.json().catch(() => ({}));
                if (!simResp.ok || simJson?.error) throw new Error(simJson?.error || `simulate-user failed (${simResp.status})`);
                const userMsg = String(simJson?.next_message ?? "").trim();
                if (!userMsg) break;

                // Test-only: if the user says "C'est bon" during onboarding finalization, we can simulate
                // that a plan becomes active right after (to avoid endless "no plan" loops and to test the next state).
                if (simulatePlanActivationOnDone && /c['’]est\s*bon/i.test(userMsg)) {
                  const { data: activePlan } = await admin
                    .from("user_plans")
                    .select("id")
                    .eq("user_id", testUserId)
                    .eq("status", "active")
                    .limit(1)
                    .maybeSingle();
                  if (!activePlan?.id) {
                    await seedActivePlan(
                      admin as any,
                      testUserId,
                      { url, anonKey, authHeader, requestId: scenarioRequestId },
                      {
                        // We only need an active plan title/content so WhatsApp onboarding can proceed.
                        bilanActionsCount: 0,
                        activeActionsCount: 2,
                        planTemplate: await getRunPlanTemplate(),
                        includeVitalsInBilan: false,
                      },
                    );
                  }
                }

                const from = digitsOnly(defaultFrom);
                const waMessageId = `wamid_${scenarioRequestId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 28)}_sim_${turn}`;
                const payload = waPayloadForSingleMessage({
                  from,
                  wa_message_id: waMessageId,
                  type: "text",
                  text: userMsg,
                  profile_name: "Eval Runner",
                });
                const wh = await invokeWhatsAppWebhook({ url, requestId: scenarioRequestId, payload });
                if (!wh.ok) throw new Error(`whatsapp-webhook failed (status=${wh.status}): ${JSON.stringify(wh.body)}`);

                if (!forceTurns && Boolean(simJson?.done)) break;
                turn += 1;
              }
            }
          } else if (Array.isArray((s as any).steps) && (s as any).steps.length > 0) {
            // Best-effort resume: assume each user message corresponds to one step (except kickoff "Oui" when present).
            const alreadyUserMsgs = history.filter((m) => m.role === "user").length;
            const kickoffOffset =
              shouldKickoff && history.length > 0 && String(history[0]?.content ?? "").trim().toLowerCase() === "oui" ? 1 : 0;
            const startStepIdx = Math.max(0, alreadyUserMsgs - kickoffOffset);
            const stepsToRun = (s as any).steps.slice(startStepIdx, maxTurns);
            
            for (let i = 0; i < stepsToRun.length; i++) {
              const persistAndReturnPartial = async (reason: string) => {
                try {
                  if (existingRunId) {
                    await admin
                      .from("conversation_eval_runs")
                      .update({
                        status: "running",
                        transcript: buildTranscript(history),
                        metrics: {
                          ...(typeof (stBefore as any)?.metrics === "object" ? (stBefore as any).metrics : {}),
                          partial: true,
                          partial_turn: startStepIdx + i,
                          partial_at: new Date().toISOString(),
                          partial_reason: String(reason ?? "").slice(0, 80),
                        },
                      } as any)
                      .eq("id", existingRunId);
                  }
                } catch {
                  // ignore
                }
                return jsonResponse(req, {
                  success: true,
                  request_id: requestId,
                  partial: true,
                  resume: true,
                  ran: 0,
                  results: [],
                });
              };

              // Chunked execution (steps mode): avoid long silent requests that exceed curl max-time.
              if (Date.now() > requestDeadlineMs) {
                return await persistAndReturnPartial("deadline");
              }
              if (remainingBudgetMs() < 20_000) {
                return await persistAndReturnPartial("deadline_margin");
              }

              const step = stepsToRun[i];
              const burstDelay = Number((step as any)?.burst_delay_ms ?? 0) || 0;
              const burstGroup = Array.isArray((step as any)?.burst_group)
                ? (step as any).burst_group.map((x: any) => String(x ?? "")).filter((x: string) => x.trim().length > 0)
                : [];
              
              // BURST LOGIC: If this step has a burst_delay_ms, it means we send this message
              // AND the NEXT message in very quick succession (simulating a double text).
              // In this eval runner, we just process them sequentially but fast.
              // However, the Router's debounce logic needs to be triggered.
              // So we send Step N, wait minimal time, send Step N+1.
              // But `processMessage` is await-ed here. 
              // To simulate real burst for the Router to catch it, we must launch them in parallel promises?
              // The `processMessage` function inside run-evals is a direct function call to `router.ts`, 
              // it does NOT go through the HTTP edge function (so no separate isolates).
              // BUT `processMessage` inside router.ts implements the sleep.
              // So if we call `processMessage(Msg1)` it will sleep 3.5s.
              // If we want to test the debounce, we need to launch `processMessage(Msg2)` WHILE Msg1 is sleeping.
              
              // Multi-message burst group (3+):
              // step.user + burst_group[0..N-1] are sent while the first call is still within debounce wait.
              if (burstDelay > 0 && burstGroup.length > 0) {
                  const burstMsgs = [String((step as any)?.user ?? ""), ...burstGroup];
                  console.log(`[Eval] ⚡️ Simulating BURSTx${burstMsgs.length}: "${burstMsgs[0]}" then (+${burstDelay}ms) ${burstMsgs.length - 1} more messages`);

                  const promises: Promise<any>[] = [];
                  for (let k = 0; k < burstMsgs.length; k++) {
                    if (k > 0) await sleep(burstDelay);
                    (meta as any).httpTimeoutMs = Math.min(stepHttpTimeoutMsCap, Math.max(10_000, remainingBudgetMs() - 5_000));
                    promises.push(processMessage(admin as any, testUserId, burstMsgs[k], history, meta, sophiaRunnerOpts));
                  }

                  const results = await Promise.all(promises);

                  for (const um of burstMsgs) history.push({ role: "user", content: um });
                  for (const r of results) {
                    if (r && !r.aborted && r.content) history.push({ role: "assistant", content: r.content, agent_used: r.mode });
                  }

                  continue;
              }

              if (burstDelay > 0 && i + 1 < stepsToRun.length) {
                  const nextStep = stepsToRun[i + 1];
                  console.log(`[Eval] ⚡️ Simulating BURST: "${step.user}" then (+${burstDelay}ms) "${nextStep.user}"`);
                  
                  // Launch both "simultaneously"
                  (meta as any).httpTimeoutMs = Math.min(stepHttpTimeoutMsCap, Math.max(10_000, remainingBudgetMs() - 5_000));
                  const p1 = processMessage(admin as any, testUserId, step.user, history, meta, sophiaRunnerOpts);
                  await sleep(burstDelay);
                  (meta as any).httpTimeoutMs = Math.min(stepHttpTimeoutMsCap, Math.max(10_000, remainingBudgetMs() - 5_000));
                  const p2 = processMessage(admin as any, testUserId, nextStep.user, history, meta, sophiaRunnerOpts);
                  
                  // Wait for both
                  const [r1, r2] = await Promise.all([p1, p2]);
                  
                  // In a successful burst handling (Option 2), one of them should be aborted/empty/ignored, 
                  // and the other should contain the combined response.
                  // Or `processMessage` returns { aborted: true }
                  
                  // We add both user messages to history
                  history.push({ role: "user", content: step.user });
                  history.push({ role: "user", content: nextStep.user });
                  
                  // We record the responses. One might be empty/aborted.
                  if (r1 && !r1.aborted && r1.content) {
                      history.push({ role: "assistant", content: r1.content, agent_used: r1.mode });
                  }
                  if (r2 && !r2.aborted && r2.content) {
                      history.push({ role: "assistant", content: r2.content, agent_used: r2.mode });
                  }
                  
                  // Skip next step in the loop since we just processed it
                  i++; 
                  continue;
              }

              (meta as any).httpTimeoutMs = Math.min(stepHttpTimeoutMsCap, Math.max(10_000, remainingBudgetMs() - 5_000));
              const resp = await processMessage(admin as any, testUserId, step.user, history, meta, sophiaRunnerOpts);
              history.push({ role: "user", content: step.user });
              history.push({ role: "assistant", content: resp.content, agent_used: resp.mode });
              await logEvalEvent({
                supabase: admin as any,
                evalRunId: existingRunId,
                requestId: scenarioRequestId,
                source: "run-evals",
                event: "turn",
                payload: { kind: "step", user: step.user, assistant_mode: resp.mode },
              });

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
                    transcript: buildTranscript(history),
                    turn_index: extraTurn,
                    max_turns: maxTurns,
                  }),
                });
                const simJson = await simResp.json().catch(() => ({}));
                const userMsg = String(simJson?.next_message ?? "Oui");

                const resp2 = await processMessage(admin as any, testUserId, userMsg, history, meta, sophiaRunnerOpts);
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
              const persistAndReturnPartial = async (reason: string) => {
                try {
                  if (existingRunId) {
                    await admin
                      .from("conversation_eval_runs")
                      .update({
                        status: "running",
                        transcript: buildTranscript(history),
                        metrics: {
                          ...(typeof (stBefore as any)?.metrics === "object" ? (stBefore as any).metrics : {}),
                          partial: true,
                          partial_turn: turn,
                          partial_at: new Date().toISOString(),
                          partial_reason: String(reason ?? "").slice(0, 80),
                        },
                      } as any)
                      .eq("id", existingRunId);
                  }
                } catch {
                  // ignore
                }
                return jsonResponse(req, {
                  success: true,
                  request_id: requestId,
                  partial: true,
                  resume: true,
                  ran: 0,
                  results: [],
                });
              };

              // Chunked execution: return partial before we hit edge-runtime wall-clock kills.
              if (Date.now() > requestDeadlineMs) {
                return await persistAndReturnPartial("deadline");
              }
              // Safety margin: if we're close to the wall-clock budget, return partial NOW (avoid hard kills -> stuck "running").
              if (remainingBudgetMs() < 20_000) {
                return await persistAndReturnPartial("deadline_margin");
              }
              let userMsg = "";
              let nextDone = false;
              
              // Fetch current chat state for sophisticated state machines (ultimate_full_flow)
              let currentChatState: any = stBefore;
              try {
                const { data: stCurrent } = await admin
                  .from("user_chat_states")
                  .select("*")
                  .eq("user_id", testUserId)
                  .eq("scope", scope)
                  .maybeSingle();
                if (stCurrent) currentChatState = stCurrent;
              } catch {}

              const lastHistoryMsg = history.length > 0 ? history[history.length - 1] : null
              const needsAssistantCatchup = lastHistoryMsg?.role === "user" && String(lastHistoryMsg?.content ?? "").trim().length > 0

              if (needsAssistantCatchup) {
                // If the previous run ended after a user turn (e.g., timeout), do NOT generate a new user message.
                // Re-run the assistant on the pending user message to avoid consecutive user turns.
                userMsg = String(lastHistoryMsg?.content ?? "")
                nextDone = false
              } else {
                const MAX_SIM_RETRIES = 6;
                let simJson: any = null;
                let simStatus = 0;
                for (let attempt = 1; attempt <= MAX_SIM_RETRIES; attempt++) {
                  const simReq = fetch(`${url}/functions/v1/simulate-user`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": authHeader,
                      "apikey": anonKey,
                      "x-request-id": scenarioRequestId,
                    },
                    body: JSON.stringify({
                      // Propagate eval_run_id so simulate-user + gemini tracing can persist structured runtime events.
                      eval_run_id: existingRunId,
                      persona: (s as any).persona ?? { label: "default", age_range: "25-50", style: "naturel" },
                      objectives: (s as any).objectives ?? [],
                      suggested_replies: (s as any).suggested_replies ?? undefined,
                      difficulty: (body.limits.user_difficulty ?? "mid"),
                      model: evalModel,
                      // Pass chat_state for sophisticated state machines (ultimate_full_flow)
                      chat_state: currentChatState ?? null,
                      context: [
                        "=== CONTEXTE PLAN (référence) ===",
                        dashboardContext || "(vide)",
                        "",
                        "=== ÉTAT CHAT ACTUEL (référence) ===",
                        JSON.stringify(currentChatState ?? null, null, 2),
                        "",
                        "=== CONSIGNE DE TEST SPÉCIFIQUE (EVAL RUNNER) ===",
                        body.limits.test_post_checkup_deferral
                          ? "IMPORTANT : TU DOIS TESTER LE 'PARKING LOT'. Pendant le bilan, trouve un moment pour dire 'on en reparle après' ou 'on verra ça à la fin' à propos d'un sujet (ex: ton organisation ou ton stress). Le but est de vérifier que Sophia le note et t'en reparle après le bilan."
                          : "",
                      ].join("\n"),
                      transcript: buildTranscript(history),
                      turn_index: turn,
                      max_turns: maxTurns,
                      force_real_ai: true,
                    }),
                  });
                  let simResp: Response;
                  try {
                    simResp = await withTimeout(
                      simReq,
                      // Allow simulate-user enough time to perform retries + provider fallbacks.
                      // (If this is too short, increasing simulate-user LLM retries is useless.)
                      Math.min(90_000, Math.max(15_000, remainingBudgetMs() - 5_000)),
                      "simulate-user-fetch",
                    );
                  } catch (e) {
                    const msg = String((e as any)?.message ?? e);
                    if (msg.includes("timeout:simulate-user-fetch")) {
                      return await persistAndReturnPartial("timeout_simulate_user");
                    }
                    throw e;
                  }
                  simStatus = simResp.status;
                  simJson = await simResp.json().catch(() => ({}));

                  const msg = String(simJson?.error ?? "");
                  const is429 = simStatus === 429 || msg.toLowerCase().includes("resource exhausted") || msg.includes("429");
                  // simulate-user can legitimately return 503 in evals:
                  // - transient model overload/timeouts (handled internally, but still possible)
                  // - strict output guardrails failing ("invalid output after rescue")
                  // Retrying within the SAME run avoids the eval runner "restarting from scratch".
                  const is503 = simStatus === 503 || msg.includes("503");
                  const isOk = simResp.ok && !simJson?.error && String(simJson?.next_message ?? "").trim().length > 0;

                  if (isOk) break;
                  if (!is429 && !is503) {
                    const extra = simJson?.reason ? ` reason=${String(simJson.reason)}` : "";
                    throw new Error((simJson?.error ? String(simJson.error) : `simulate-user failed (${simStatus})`) + extra);
                  }
                  if (attempt >= MAX_SIM_RETRIES) {
                    const extra = simJson?.reason ? ` reason=${String(simJson.reason)}` : "";
                    throw new Error((simJson?.error ? String(simJson.error) : `simulate-user failed (${simStatus})`) + extra);
                  }
                  await sleep(backoffMs(attempt));
                }

                userMsg = String(simJson?.next_message ?? "");
                nextDone = Boolean(simJson?.done);
              }

              let resp: any;
              try {
                resp = await withTimeout(
                  processMessage(admin as any, testUserId, userMsg, history, meta, sophiaRunnerOpts),
                  Math.min(45_000, Math.max(10_000, remainingBudgetMs() - 2_000)),
                  "processMessage",
                );
              } catch (e) {
                const msg = String((e as any)?.message ?? e);
                if (msg.includes("timeout:processMessage")) {
                  return await persistAndReturnPartial("timeout_processMessage");
                }
                throw e;
              }
              // In eval runner mode, an aborted response means debounce/burst logic fired unexpectedly.
              // Treat it as an infra-level failure: the runner expects 1 assistant response per simulated turn.
              if (resp?.aborted || !String(resp?.content ?? "").trim()) {
                const why = resp?.aborted ? "processMessage_aborted" : "processMessage_empty";
                try {
                  if (existingRunId) {
                    await admin
                      .from("conversation_eval_runs")
                      .update({
                        status: "failed",
                        error: why,
                        metrics: {
                          judge_async: false,
                          judge_pending: false,
                          manual_judge: manualJudge,
                          turns_executed: history.filter((m) => m?.role === "user").length,
                          max_turns: maxTurns,
                          completed_reason: why,
                          completed_at: new Date().toISOString(),
                        },
                      } as any)
                      .eq("id", existingRunId);
                  }
                } catch {
                  // ignore
                }
                throw new Error(why);
              }
              // GUARD: Only add user message if history doesn't already end with this exact user message
              const lastMsg = history[history.length - 1];
              const lastUserMsg = history.filter((m) => m.role === "user").slice(-1)[0];
              const userMsgNorm = String(userMsg ?? "").trim().toLowerCase();
              const lastUserMsgNorm = String(lastUserMsg?.content ?? "").trim().toLowerCase();
              const isDuplicate = lastUserMsgNorm === userMsgNorm && userMsgNorm.length > 0;
              
              if (!isDuplicate) {
                // GUARD: If last message was also user, don't add another user (should not happen but defensive)
                if (lastMsg?.role !== "user") {
                  history.push({ role: "user", content: userMsg });
                } else {
                  console.warn(`[run-evals] Skipping consecutive user message: "${userMsg.slice(0, 50)}"`);
                }
              } else {
                console.warn(`[run-evals] Skipping duplicate user message: "${userMsg.slice(0, 50)}"`);
              }
              
              // GUARD: If last message was already assistant, don't add another assistant
              const lastMsgAfterUser = history[history.length - 1];
              if (lastMsgAfterUser?.role !== "assistant") {
                history.push({ role: "assistant", content: resp.content, agent_used: resp.mode });
              } else {
                console.warn(`[run-evals] Skipping consecutive assistant message: "${resp.content?.slice(0, 50)}"`);
              }
              
              await logEvalEvent({
                supabase: admin as any,
                evalRunId: existingRunId,
                requestId: scenarioRequestId,
                source: "run-evals",
                event: "turn",
                payload: { kind: "simulated", user: userMsg, assistant_mode: resp.mode },
              });

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

          // IMPORTANT: use the runner's own `history` as the canonical transcript for eval results.
          // DB `chat_messages` can contain extra messages (debounce bursts, retries, concurrent isolates),
          // which makes the exported transcript noisy or even structurally invalid for eval interpretation.
          // Use buildTranscript() to deduplicate consecutive identical messages.
          const transcript = buildTranscript(history);

          // Still fetch DB transcript as diagnostics and store a small integrity summary in metrics.
          const { data: msgs } = await admin
            .from("chat_messages")
            .select("role,content,created_at,agent_used")
            .eq("user_id", testUserId)
            .eq("scope", scope)
            .order("created_at", { ascending: true })
            .limit(400);
          const dbTranscript = (msgs ?? []).map((m: any) => ({
            role: m.role,
            content: m.content,
            created_at: m.created_at,
            agent_used: m.role === "assistant" ? m.agent_used : null,
          }));
          const runnerRoleRuns = summarizeTranscriptRoleRuns(transcript);
          const dbRoleRuns = summarizeTranscriptRoleRuns(dbTranscript);

          const turnsExecuted = Array.isArray(transcript) ? transcript.filter((m: any) => m?.role === "user").length : 0;
          const completedReason = turnsExecuted >= maxTurns ? "max_turns" : "done";

          const { data: stAfter } = await admin.from("user_chat_states").select("*").eq("user_id", testUserId).eq("scope", scope).maybeSingle();
          const profileAfter = await fetchProfileSnapshot(admin as any, testUserId);
          // Fetch user_profile_facts for mechanical assertions (preference confirmation state machine)
          let profileFactsAfter: any[] = [];
          try {
            const { data: rows } = await admin
              .from("user_profile_facts")
              .select("scope,key,value,updated_at,created_at")
              .eq("user_id", testUserId)
              .in("scope", ["global", scope])
              .order("updated_at", { ascending: false })
              .limit(100);
            profileFactsAfter = Array.isArray(rows)
              ? rows.map((r: any) => ({
                scope: String(r?.scope ?? ""),
                key: String(r?.key ?? ""),
                value: r?.value ?? null,
              }))
              : [];
          } catch {
            profileFactsAfter = [];
          }
          // Refresh plan/dashboard AFTER the conversation because WhatsApp onboarding evals may
          // simulate plan activation mid-run (e.g. when the user says "C'est bon").
          // Without this, the bundled/judge plan_snapshot can incorrectly show "no plan"
          // even though a plan was seeded during the run.
          const dashboardContextAfter = await getDashboardContext(admin as any, testUserId);
          const planSnapshotAfter = await fetchPlanSnapshot(admin as any, testUserId);
          // Pull prod verifier/judge logs for this scenario run (conversation_judge_events),
          // keyed by request_id (stable per scenario run).
          let judgeEvents: any[] = [];
          try {
            const { data: evs } = await admin
              .from("conversation_judge_events")
              .select("*")
              .eq("user_id", testUserId)
              .eq("scope", scope)
              .eq("request_id", scenarioRequestId)
              .order("created_at", { ascending: true })
              .limit(200);
            judgeEvents = Array.isArray(evs) ? evs : [];
          } catch {
            judgeEvents = [];
          }
          // Pull eval trace events (conversation_eval_events) for this run id (includes verifier_issues).
          let evalEvents: any[] = [];
          try {
            const { data: evs } = await admin
              .from("conversation_eval_events")
              .select("id,created_at,source,event,level,payload,request_id")
              .eq("eval_run_id", existingRunId)
              .order("created_at", { ascending: true })
              .limit(5000);
            evalEvents = Array.isArray(evs) ? evs : [];
          } catch {
            evalEvents = [];
          }
          // Deterministic mechanical assertions are valuable even in manual_judge mode (they gate infra/state-machine correctness).
          const mechanicalIssues = await buildMechanicalIssues({
            scenario: s,
            profileAfter: isWhatsApp && mechanicalProfileAfterOverride ? mechanicalProfileAfterOverride : profileAfter,
            profileFactsAfter,
            chatStateAfter: stAfter ?? null,
            planSnapshotAfter: planSnapshotAfter ?? planSnapshot,
            transcript: isWhatsApp && mechanicalTranscriptOverride ? mechanicalTranscriptOverride : transcript,
            judgeEvents,
            evalEvents,
          });

          // Qualitative judge (optional):
          // - In local dev, we may disable it and do manual judging (Cursor/GPT-5.2).
          // - If enabled, we persist transcript/state/config now (so the job is replayable/idempotent),
          //   then enqueue a job and return immediately (avoid edge-runtime wall-clock / WORKER_LIMIT).
          const configForRun = {
            request_id: scenarioRequestId,
            eval_runner: true,
            description: (s as any).description ?? null,
            tags: (s as any).tags ?? [],
            scenario_target: (s as any)?.scenario_target ?? null,
            channel: scenarioChannel,
            test_user_id: testUserId,
            created_by: callerId,
            assertions: (s as any)?.assertions ?? undefined,
            judge_model: judgeModel,
            limits: {
              bilan_actions_count: Number(body.limits.bilan_actions_count ?? 0) || 0,
              test_post_checkup_deferral: Boolean(body.limits.test_post_checkup_deferral),
              user_difficulty: body.limits.user_difficulty ?? "mid",
              model: judgeModel,
              judge_async: Boolean(body.limits.judge_async),
            },
            plan_snapshot: {
              template_fingerprint: runPlanTemplateFingerprint ?? null,
              template_bank: runPlanTemplateBank,
              dashboard_context: dashboardContextAfter || dashboardContext || "",
              ...(planSnapshotAfter ?? planSnapshot),
            },
            system_snapshot: {
              focus: (s as any)?.scenario_target ?? null,
              channel: scenarioChannel,
              available_modules: [
                "sentry",
                "firefighter",
                "investigator",
                "architect",
                "companion",
                "librarian",
              ],
              whatsapp_state_machine: isWhatsApp
                ? {
                    profile_whatsapp_state_before: (profileBefore as any)?.whatsapp_state ?? null,
                    profile_whatsapp_state_after: (profileAfter as any)?.whatsapp_state ?? null,
                    notes:
                      "WhatsApp onboarding uses a lightweight profile.whatsapp_state machine. In particular, when profile.whatsapp_state='awaiting_personal_fact', the webhook may send a Companion-style acknowledgement (e.g. 'Merci, je note…') and open the floor ('tu as envie qu’on parle de quoi ?') while clearing the state. This is expected and is NOT a routing violation.",
                  }
                : null,
              notes:
                "Async judge: eval-judge runs out-of-band via process-eval-judge-jobs (internal secret).",
            },
          };

          const judgeEnabled = !manualJudge && Boolean(body.limits.judge_async);

          // LLM usage accounting (best-effort): sum events by request_id prefix so manual_judge runs still have tokens/cost.
          // This includes simulate-user + sophia-brain + any tool functions that log usage.
          let usageTotals = { cost_usd: 0, prompt_tokens: 0, output_tokens: 0, total_tokens: 0 };
          const modelsUsed: Record<string, number> = {};
          try {
            const { data: usageRows } = await admin
              .from("llm_usage_events")
              .select("prompt_tokens,output_tokens,total_tokens,cost_usd,model")
              .ilike("request_id", `${scenarioRequestId}%`)
              .limit(500);
            for (const r of usageRows ?? []) {
              usageTotals.prompt_tokens += Number((r as any).prompt_tokens ?? 0) || 0;
              usageTotals.output_tokens += Number((r as any).output_tokens ?? 0) || 0;
              usageTotals.total_tokens += Number((r as any).total_tokens ?? 0) || 0;
              usageTotals.cost_usd += Number((r as any).cost_usd ?? 0) || 0;
              const m = String((r as any).model ?? "").trim();
              if (m) modelsUsed[m] = (modelsUsed[m] ?? 0) + 1;
            }
          } catch {
            // ignore
          }

          if (existingRunId) {
            const baseUpdate: any = {
              status: "completed",
              transcript,
              state_after: isWhatsApp ? { profile: profileAfter, chat_state: stAfter ?? null } : (stAfter ?? null),
              config: configForRun,
              // NOTE: mechanical issues are deterministic and should be persisted even in manual_judge mode.
              issues: (Array.isArray(mechanicalIssues) ? mechanicalIssues : []),
              suggestions: [],
              metrics: {
                judge_async: judgeEnabled,
                judge_pending: judgeEnabled,
                manual_judge: manualJudge,
                turns_executed: turnsExecuted,
                max_turns: maxTurns,
                completed_reason: completedReason,
                completed_at: new Date().toISOString(),
                transcript_role_runs: runnerRoleRuns,
                db_transcript_role_runs: dbRoleRuns,
                llm_usage: usageTotals,
                models_used: modelsUsed,
                ...(judgeEnabled ? { judge_enqueued_at: new Date().toISOString() } : {}),
              },
            };

            const attemptUpdate = async (label: string, payload: any) => {
              // Pre-sanitize and validate the payload before sending
              let safePayload: any;
              try {
                safePayload = toJsonSafe(payload);
              } catch (e) {
                console.error(`[run-evals] toJsonSafe failed for (${label}):`, e);
                return new Error("toJsonSafe failed");
              }

              // Double-check we can stringify the payload
              let bodyStr: string;
              try {
                bodyStr = JSON.stringify(safePayload);
                if (!bodyStr || bodyStr === "null" || bodyStr === "undefined") {
                  console.error(`[run-evals] JSON.stringify produced empty/null for (${label})`);
                  return new Error("empty JSON body");
                }
              } catch (e) {
                console.error(`[run-evals] JSON.stringify failed for (${label}):`, e);
                return new Error("JSON.stringify failed");
              }

              const { error } = await admin
                .from("conversation_eval_runs")
                .update(safePayload)
                .eq("id", existingRunId);
              if (error) {
                console.error(`[run-evals] conversation_eval_runs update failed (${label}):`, error);
                console.error(`[run-evals] payload keys: ${Object.keys(safePayload ?? {}).join(", ")}, bodyLen=${bodyStr.length}`);

                // Workaround: in some environments, supabase-js can end up sending an empty/invalid JSON body
                // (observed as PostgREST PGRST102). When that happens, retry once using a direct fetch with a
                // fully materialized JSON.stringify body so transcript can be persisted and shown in admin.
                const code = String((error as any)?.code ?? "");
                if (code === "PGRST102") {
                  try {
                    const runId = String(existingRunId);
                    const patchUrl = `${url.replace(/\/+$/g, "")}/rest/v1/conversation_eval_runs?id=eq.${encodeURIComponent(runId)}`;
                    const resp = await fetch(patchUrl, {
                      method: "PATCH",
                      headers: {
                        apikey: serviceKey,
                        Authorization: `Bearer ${serviceKey}`,
                        "Content-Type": "application/json",
                        Prefer: "return=minimal",
                      },
                      body: bodyStr,
                    });
                    if (resp.ok) {
                      console.log(`[run-evals] conversation_eval_runs update succeeded via raw fetch (${label})`);
                      return null;
                    } else {
                      const txt = await resp.text().catch(() => "");
                      console.error(
                        `[run-evals] conversation_eval_runs raw fetch update failed (${label}) status=${resp.status} body=${txt.slice(0, 500)}`,
                      );
                    }
                  } catch (e) {
                    console.error(`[run-evals] conversation_eval_runs raw fetch update threw (${label}):`, e);
                  }
                }
              }
              else if (label !== "full") console.log(`[run-evals] conversation_eval_runs update succeeded (${label})`);
              return error;
            };

            let updErr = await attemptUpdate("full", baseUpdate);
            if (updErr) updErr = await attemptUpdate("no_config", { ...baseUpdate, config: null });
            if (updErr) updErr = await attemptUpdate("no_state_after", { ...baseUpdate, state_after: null });
            if (updErr) updErr = await attemptUpdate("no_state_no_config", { ...baseUpdate, state_after: null, config: null });
            // Try with simplified transcript (just role + content, no metadata)
            if (updErr) {
              const simpleTranscript = (transcript ?? []).map((m: any) => ({
                role: String(m?.role ?? "user"),
                content: String(m?.content ?? "").slice(0, 4000),
              }));
              updErr = await attemptUpdate("simple_transcript", {
                status: "completed",
                transcript: simpleTranscript,
                metrics: { partial_save: true, completed_at: new Date().toISOString() },
              });
            }
            if (updErr) updErr = await attemptUpdate("no_transcript", { ...baseUpdate, transcript: [] });
            if (updErr) updErr = await attemptUpdate("minimal_status", { status: "completed" });
            if (updErr) {
              console.error("[run-evals] All update attempts failed, eval run may be incomplete in DB");
              // Don't throw - let the eval continue and return results anyway
            }

            if (judgeEnabled) {
              const { error: enqueueErr } = await admin.rpc("enqueue_conversation_eval_judge_job", {
                p_eval_run_id: existingRunId,
                p_metadata: { source: "run-evals", request_id: scenarioRequestId },
              });
              if (enqueueErr) {
                console.error("[run-evals] enqueue_conversation_eval_judge_job failed:", enqueueErr);
              }
            }
          }

          // Placeholder "judgeJson" object so the rest of the code can keep building results.
          const judgeJson: any = {
            eval_run_id: existingRunId,
            issues: (Array.isArray(mechanicalIssues) ? mechanicalIssues : []),
            suggestions: [],
            metrics: { judge_async: judgeEnabled, judge_pending: judgeEnabled, manual_judge: manualJudge },
          };

          // Merge deterministic mechanical checks into the eval run row (in addition to the judge).
          if (Array.isArray(mechanicalIssues) && mechanicalIssues.length > 0 && existingRunId) {
            try {
              const { data: row } = await admin
                .from("conversation_eval_runs")
                .select("issues,metrics")
                .eq("id", existingRunId)
                .maybeSingle();
              const prev = Array.isArray((row as any)?.issues) ? (row as any).issues : [];
              // Avoid accidental duplication if issues were already written in the main update.
              const merged = [...prev, ...mechanicalIssues].filter((x: any, idx: number, arr: any[]) => {
                const msg = String((x as any)?.message ?? "");
                const kind = String((x as any)?.kind ?? "");
                const key = `${kind}::${msg}`;
                const first = arr.findIndex((y: any) => `${String((y as any)?.kind ?? "")}::${String((y as any)?.message ?? "")}` === key);
                return first === idx;
              });
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

          const issuesCount = (Array.isArray(judgeJson.issues) ? judgeJson.issues.length : 0);
          const suggestionsCount = manualJudge ? null : (Array.isArray(judgeJson.suggestions) ? judgeJson.suggestions.length : 0);
          // Prefer unified accounting from llm_usage_events (covers simulate-user + sophia-brain), fall back to judge-only.
          const costUsd = Number(usageTotals.cost_usd ?? 0) || Number(judgeJson?.metrics?.cost_usd ?? 0) || 0;
          const pTok = Number(usageTotals.prompt_tokens ?? 0) || Number(judgeJson?.metrics?.prompt_tokens ?? 0) || 0;
          const oTok = Number(usageTotals.output_tokens ?? 0) || Number(judgeJson?.metrics?.output_tokens ?? 0) || 0;
          const tTok = Number(usageTotals.total_tokens ?? 0) || Number(judgeJson?.metrics?.total_tokens ?? 0) || 0;
          totalEstimatedCostUsd += costUsd;
          totalPromptTokens += pTok;
          totalOutputTokens += oTok;
          totalTokens += tTok;

          const bilanCompleted = bilanCount > 0 ? isBilanCompletedFromChatState(stAfter) : false;

          results.push({
            dataset_key: s.dataset_key,
            scenario_key: s.id,
            eval_run_id: judgeJson.eval_run_id,
            plan_template_fingerprint: runPlanTemplateFingerprint ?? null,
            test_user_id: testUserId,
            turns_executed: turnsExecuted,
            bilan_completed: bilanCompleted,
            plan_snapshot_actions_count: Array.isArray((planSnapshot as any)?.actions) ? (planSnapshot as any).actions.length : 0,
            bilan_pending_items_count: Array.isArray((stBefore as any)?.investigation_state?.pending_items)
              ? (stBefore as any).investigation_state.pending_items.length
              : 0,
            // In manual_judge mode: keep deterministic mechanical issues visible; suggestions remain null.
            issues_count: issuesCount,
            suggestions_count: suggestionsCount,
            // Token/cost are still valuable even in manual_judge mode (for observability).
            cost_usd: costUsd,
            prompt_tokens: pTok,
            output_tokens: oTok,
            total_tokens: tTok,
          });

          if (!manualJudge && body.limits.stop_on_first_failure && issuesCount > 0) {
            stoppedReason = `Stopped on first failure: scenario ${s.id} had ${issuesCount} issues`;
            break;
          }
          if (body.limits.budget_usd > 0 && totalEstimatedCostUsd >= body.limits.budget_usd) {
            stoppedReason = `Budget reached: ${totalEstimatedCostUsd.toFixed(4)} USD`;
            break;
          }
          // Cleanup auth user ONLY after successful completion, otherwise keep for resume.
          try {
            const keep = Boolean((body as any)?.limits?.keep_test_user) || Boolean((s as any)?.setup?.keep_test_user);
            if (!keep && testUserId) await (admin as any).auth.admin.deleteUser(testUserId);
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
        // Token/cost totals are computed from llm_usage_events (covers simulate-user + sophia-brain), even in manual_judge mode.
        total_cost_usd: totalEstimatedCostUsd,
        total_prompt_tokens: totalPromptTokens,
        total_output_tokens: totalOutputTokens,
        total_tokens: totalTokens,
        results,
      });
    } catch (error) {
      // Preserve a minimal error surface so local runners can decide whether to retry
      // (and avoid "silent restarts from scratch" on deterministic failures).
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[run-evals] request_id=${requestId}`, error);
      const lowered = msg.toLowerCase();
      const status =
        lowered.includes("worker_limit") || lowered.includes("workerl") ? 546 :
        lowered.startsWith("simulate-user failed") ? 503 :
        500;
      return jsonResponse(req, { error: msg || "Internal Server Error", request_id: requestId }, { status });
    }
  });
}


