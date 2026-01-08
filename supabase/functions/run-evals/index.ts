/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z, getRequestId, jsonResponse, parseJsonBody, serverError } from "../_shared/http.ts";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { processMessage } from "../sophia-brain/router.ts";
import { getDashboardContext } from "../sophia-brain/state-manager.ts";

const EVAL_MODEL = "gemini-2.5-flash";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number) {
  const base = 900;
  const max = 20_000;
  const exp = Math.min(max, base * Math.pow(2, attempt - 1));
  const jitter = Math.floor(Math.random() * 400);
  return Math.min(max, exp + jitter);
}

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function randIntExclusive(max: number): number {
  const m = Math.max(1, Math.floor(max));
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return Number(buf[0] % m);
}

function pickOne<T>(arr: T[]): T {
  return arr[randIntExclusive(arr.length)];
}

function pickManyUnique<T>(arr: T[], count: number): T[] {
  const n = Math.max(0, Math.min(arr.length, Math.floor(count)));
  const copy = arr.slice();
  // Fisher–Yates shuffle (crypto-backed randomness via randIntExclusive)
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randIntExclusive(i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy.slice(0, n);
}

function looksAffirmative(text: string): boolean {
  const t = (text ?? "").toString().trim().toLowerCase();
  if (!t) return false;
  return /\b(oui|ouais|ok|okay|d'accord|dac|vas[- ]?y|go|let'?s go|carr[ée]|yep|yes)\b/i.test(t);
}

function looksLikeCheckupIntent(text: string): boolean {
  const t = (text ?? "").toString();
  return /\b(check(?:up)?|bilan)\b/i.test(t);
}

function isBilanCompletedFromChatState(chatState: any): boolean {
  const inv = (chatState as any)?.investigation_state;
  // Investigator marks completion by returning newState=null, which we persist as investigation_state=null.
  if (!inv) return true;
  const status = String(inv?.status ?? "").toLowerCase().trim();
  // Special eval-only: post-checkup finished marker.
  if (status === "post_checkup_done") return true;
  if (["done", "completed", "finished", "stopped", "cancelled", "canceled"].includes(status)) return true;
  const pending = Array.isArray(inv?.pending_items) ? inv.pending_items : null;
  const idx = Number(inv?.current_item_index ?? 0) || 0;
  if (pending && idx >= pending.length) return true;
  if (pending && pending.length === 0) return true;
  return false;
}

const AXIS_BANK = [
  {
    id: "sleep",
    title: "Sommeil",
    theme: "Énergie",
    problems: ["Difficulté d'endormissement", "Réveils nocturnes", "Scroll tard le soir", "Ruminations"],
  },
  {
    id: "stress",
    title: "Gestion du stress",
    theme: "Émotions",
    problems: ["Anxiété", "Irritabilité", "Charge mentale", "Rumination"],
  },
  {
    id: "focus",
    title: "Focus & Discipline",
    theme: "Productivité",
    problems: ["Procrastination", "Distractions", "Manque de clarté", "Désorganisation"],
  },
  {
    id: "health",
    title: "Santé & Mouvement",
    theme: "Vitalité",
    problems: ["Sédentarité", "Manque d'activité", "Manque d'énergie", "Douleurs / raideurs"],
  },
] as const;

function buildFakeQuestionnairePayload() {
  const axis = pickOne([...AXIS_BANK]);
  const pacing = pickOne(["fast", "balanced", "slow"]);
  const chosenProblems = pickManyUnique([...axis.problems], 2);

  const inputs = {
    why: `Je veux améliorer ${axis.title.toLowerCase()} pour retrouver de l'énergie et être plus stable au quotidien.`,
    blockers: pickOne([
      "Je manque de constance, je décroche quand je suis fatigué.",
      "Je suis souvent débordé, j'oublie et je remets à plus tard.",
      "Je me sens vite submergé et je perds le fil.",
    ]),
    context: pickOne([
      "Rythme de vie chargé, beaucoup de sollicitations, peu de temps pour moi.",
      "Je bosse sur écran, je finis tard et je dors mal.",
      "J'ai des journées irrégulières, je suis fatigué et je compense avec le téléphone.",
    ]),
    pacing,
  };

  // Minimal but realistic-ish "answers" blob; generate-plan mainly uses it as context string.
  const answers = {
    meta: {
      source: "run-evals",
      questionnaire_type: "onboarding",
      axis_id: axis.id,
      created_at: new Date().toISOString(),
    },
    axis: {
      id: axis.id,
      title: axis.title,
      theme: axis.theme,
      problems: chosenProblems,
    },
    lifestyle: {
      sleep_quality: pickOne(["mauvaise", "moyenne", "bonne"]),
      stress_level: pickOne(["élevé", "moyen", "faible"]),
      activity_level: pickOne(["faible", "moyen", "élevé"]),
    },
  };

  const currentAxis = {
    id: axis.id,
    title: axis.title,
    theme: axis.theme,
    problems: chosenProblems,
  };

  const userProfile = {
    birth_date: pickOne(["1992-03-11", "1988-09-22", "1996-01-05"]),
    gender: pickOne(["male", "female", "other"]),
  };

  return { inputs, currentAxis, answers, userProfile };
}

function isUuidLike(v: unknown): boolean {
  const s = String(v ?? "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function normalizePlanActionIdsToUuid(plan: any) {
  if (!plan || typeof plan !== "object") return plan;
  const phases = (plan as any).phases;
  if (!Array.isArray(phases)) return plan;
  for (const p of phases) {
    const actions = p?.actions;
    if (!Array.isArray(actions)) continue;
    for (const a of actions) {
      if (!isUuidLike(a?.id)) a.id = crypto.randomUUID();
    }
  }
  return plan;
}

function reassignAllPlanActionIds(plan: any) {
  if (!plan || typeof plan !== "object") return plan;
  const phases = (plan as any).phases;
  if (!Array.isArray(phases)) return plan;
  for (const p of phases) {
    const actions = p?.actions;
    if (!Array.isArray(actions)) continue;
    for (const a of actions) {
      if (a && typeof a === "object") (a as any).id = crypto.randomUUID();
    }
  }
  return plan;
}

function applyActivationToPlan(plan: any, activeCount: number) {
  if (!plan || typeof plan !== "object") return plan;
  const phases = (plan as any).phases;
  if (!Array.isArray(phases)) return plan;

  let cursor = 0;
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    if (p && typeof p === "object") {
      (p as any).status = i === 0 ? "active" : "locked";
    }
    const actions = p?.actions;
    if (!Array.isArray(actions)) continue;
    for (const a of actions) {
      if (!a || typeof a !== "object") continue;
      (a as any).isCompleted = false;
      (a as any).status = cursor < activeCount ? "active" : "pending";
      cursor += 1;
    }
  }
  return plan;
}

async function callGeneratePlan(params: {
  url: string;
  anonKey: string;
  authHeader: string;
  requestId: string;
  payload: any;
}) {
  const { url, anonKey, authHeader, requestId, payload } = params;
  const MAX_RETRIES = 6;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const resp = await fetch(`${url}/functions/v1/generate-plan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
        "apikey": anonKey,
        "x-request-id": requestId,
      },
      body: JSON.stringify(payload),
    });
    const json = await resp.json().catch(() => ({}));
    const msg = String(json?.error ?? "");
    const lower = msg.toLowerCase();
    // generate-plan can surface upstream Gemini overloads as 500 with a 503 message.
    const isRetryable =
      resp.status === 429 ||
      resp.status === 503 ||
      (resp.status >= 500 && (lower.includes("resource exhausted") || lower.includes("overloaded") || lower.includes("unavailable") ||
        lower.includes("temporarily") || lower.includes("503") || msg.includes("429")));
    if (resp.ok && json && !json?.error) return json;
    if (!isRetryable || attempt >= MAX_RETRIES) {
      throw new Error(json?.error || `generate-plan failed (${resp.status})`);
    }
    await sleep(backoffMs(attempt));
  }
  throw new Error("generate-plan failed (retries exhausted)");
}

type RunPlanTemplate = {
  fake: ReturnType<typeof buildFakeQuestionnairePayload>;
  planContentRaw: any;
  templateFingerprint: string;
};

async function buildRunPlanTemplate(params: {
  url: string;
  anonKey: string;
  authHeader: string;
  requestId: string;
}): Promise<RunPlanTemplate> {
  const fake = buildFakeQuestionnairePayload();
  const planContentRaw = await callGeneratePlan({
    url: params.url,
    anonKey: params.anonKey,
    authHeader: params.authHeader,
    requestId: params.requestId,
    payload: {
      force_real_generation: true,
      mode: "standard",
      inputs: fake.inputs,
      currentAxis: fake.currentAxis,
      answers: fake.answers,
      userProfile: fake.userProfile,
    },
  });
  const templateFingerprint = (await sha256Hex(JSON.stringify(planContentRaw))).slice(0, 16);
  return { fake, planContentRaw, templateFingerprint };
}

async function seedActivePlan(
  admin: any,
  userId: string,
  env: { url: string; anonKey: string; authHeader: string; requestId: string },
  opts?: { bilanActionsCount?: number; planTemplate?: RunPlanTemplate; includeVitalsInBilan?: boolean },
) {
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

  const activeCount = clampInt(opts?.bilanActionsCount ?? 0, 0, 20, 0);
  const fake = opts?.planTemplate?.fake ?? buildFakeQuestionnairePayload();

  // Reuse a single "plan template" per run (when provided), so plan content doesn't vary per scenario.
  // IMPORTANT: IDs must be unique per seeded user, otherwise user_actions PKs collide across scenarios.
  const baseRaw = opts?.planTemplate?.planContentRaw ?? await callGeneratePlan({
    url: env.url,
    anonKey: env.anonKey,
    authHeader: env.authHeader,
    requestId: env.requestId,
    payload: {
      force_real_generation: true,
      mode: "standard",
      inputs: fake.inputs,
      currentAxis: fake.currentAxis,
      answers: fake.answers,
      userProfile: fake.userProfile,
    },
  });
  const rawClone = structuredClone(baseRaw);
  const planContent = applyActivationToPlan(reassignAllPlanActionIds(normalizePlanActionIdsToUuid(rawClone)), activeCount);
  const { data: planRow, error: planErr } = await admin
    .from("user_plans")
    .insert({
      user_id: userId,
      goal_id: goalRow.id,
      submission_id: submissionId,
      status: "active",
      current_phase: 1,
      title: String((planContent as any)?.grimoireTitle ?? "Eval plan"),
      deep_why: String((planContent as any)?.deepWhy ?? (fake.inputs as any)?.why ?? "Plan généré pour tests (eval run)."),
      context_problem: String((planContent as any)?.context_problem ?? ""),
      content: planContent,
    })
    .select("id,submission_id")
    .single();
  if (planErr) throw planErr;

  // Optional: seed tracking tables only if requested (bilan/investigator tests).
  const insertedActions: any[] = [];
  const pendingItems: any[] = [];
  const pendingVitalItems: any[] = [];
  if (activeCount > 0) {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const phases = ((planContent as any)?.phases ?? []) as any[];
    const activeItems: any[] = [];
    for (const p of phases) {
      const actions = (p?.actions ?? []) as any[];
      for (const a of actions) {
        const st = String(a?.status ?? "").toLowerCase();
        if (st === "active") activeItems.push(a);
      }
    }
    const itemsToCheck = activeItems.slice(0, activeCount);

    // 1) Habits / missions -> user_actions (id must be uuid)
    const actionRows = itemsToCheck
      .filter((a) => String(a?.type ?? "").toLowerCase() !== "framework")
      .map((a) => {
        const rawType = String(a?.type ?? "").toLowerCase();
        const t = rawType === "habitude" ? "habit" : "mission";
        const trackingType = String(a?.tracking_type ?? "boolean") === "counter" ? "counter" : "boolean";
        const timeOfDay = String(a?.time_of_day ?? "any_time");
        const targetReps = t === "habit" ? clampInt(a?.targetReps ?? 1, 1, 14, 1) : 1;
        return {
          id: String(a?.id ?? crypto.randomUUID()),
          user_id: userId,
          plan_id: planRow.id,
          submission_id: planRow.submission_id,
          type: t,
          title: String(a?.title ?? "Action"),
          description: String(a?.description ?? ""),
          target_reps: targetReps,
          current_reps: 0,
          status: "active",
          tracking_type: trackingType,
          time_of_day: timeOfDay,
          last_performed_at: twoDaysAgo,
        };
      });
    if (actionRows.length > 0) {
      const { data: ins, error: actionErr } = await admin
        .from("user_actions")
        .insert(actionRows)
        .select("id,title,description,tracking_type,target_reps");
      if (actionErr) throw actionErr;
      insertedActions.push(...(ins ?? []));
      for (const a of actionRows) {
        pendingItems.push({
          id: a.id,
          type: "action",
          title: a.title,
          description: a.description,
          tracking_type: a.tracking_type,
          target: a.target_reps,
        });
      }
    }

    // 2) Frameworks -> user_framework_tracking (row id must be uuid; action_id is text)
    const frameworkRows = itemsToCheck
      .filter((a) => String(a?.type ?? "").toLowerCase() === "framework")
      .map((a) => {
        const trackingType = String(a?.tracking_type ?? "boolean") === "counter" ? "counter" : "boolean";
        const fwType = String(a?.frameworkDetails?.type ?? "recurring");
        const targetReps = clampInt(a?.targetReps ?? 1, 1, 14, 1);
        const rowId = crypto.randomUUID();
        return {
          id: rowId,
          user_id: userId,
          plan_id: planRow.id,
          submission_id: planRow.submission_id,
          action_id: String(a?.id ?? `fw_${Date.now()}`),
          title: String(a?.title ?? "Framework"),
          type: fwType,
          target_reps: targetReps,
          current_reps: 0,
          status: "active",
          tracking_type: trackingType,
          last_performed_at: twoDaysAgo,
          _pending_item: { id: rowId, type: "framework", title: String(a?.title ?? "Framework"), tracking_type: trackingType },
        };
      });
    if (frameworkRows.length > 0) {
      const { error: fwErr } = await admin.from("user_framework_tracking").insert(
        frameworkRows.map(({ _pending_item, ...rest }) => rest),
      );
      if (fwErr) throw fwErr;
      for (const r of frameworkRows) pendingItems.push((r as any)._pending_item);
    }

    // Ensure we ALWAYS have exactly N items to verify in bilan (no surprises like "0 actions").
    // If plan content is weirdly missing actives, we fill with synthetic missions.
    if (pendingItems.length < activeCount) {
      const missing = activeCount - pendingItems.length;
      const fillerRows = Array.from({ length: missing }).map((_, idx) => {
        const id = crypto.randomUUID();
        return {
          id,
          user_id: userId,
          plan_id: planRow.id,
          submission_id: planRow.submission_id,
          type: "mission",
          title: `Action (bilan) #${idx + 1}`,
          description: "Action créée pour compléter un bilan de test.",
          target_reps: 1,
          current_reps: 0,
          status: "active",
          tracking_type: "boolean",
          time_of_day: "any_time",
          last_performed_at: twoDaysAgo,
        };
      });
      const { data: ins2, error: fillErr } = await admin.from("user_actions").insert(fillerRows).select("id,title,description,tracking_type,target_reps");
      if (fillErr) throw fillErr;
      insertedActions.push(...(ins2 ?? []));
      for (const a of fillerRows) {
        pendingItems.push({
          id: a.id,
          type: "action",
          title: a.title,
          description: a.description,
          tracking_type: a.tracking_type,
          target: a.target_reps,
        });
      }
    }

    // 3) Vital signal -> user_vital_signs
    // If includeVitalsInBilan is set, we FORCE a deterministic vital so the bilan must include it.
    if (opts?.includeVitalsInBilan) {
      const vitalId = crypto.randomUUID();
      const label = "Sommeil";
      const unit = "h";
      const { error: vErr } = await admin.from("user_vital_signs").insert({
        id: vitalId,
        user_id: userId,
        plan_id: planRow.id,
        submission_id: planRow.submission_id,
        label,
        unit,
        current_value: "",
        target_value: "",
        status: "active",
        tracking_type: "counter",
        last_checked_at: twoDaysAgo,
      });
      if (vErr) throw vErr;
      pendingVitalItems.push({
        id: vitalId,
        type: "vital",
        title: label,
        tracking_type: "counter",
        unit,
      });
    } else {
      // Default behavior: seed from generated plan if present (realistic), and INCLUDE in pending_items.
      const vital = (planContent as any)?.vitalSignal;
      if (vital && typeof vital === "object") {
        const vitalId = crypto.randomUUID();
        const label = String(vital?.name ?? vital?.title ?? "Signe Vital");
        const trackingType = String(vital?.tracking_type ?? "counter") === "boolean" ? "boolean" : "counter";
        const unit = String(vital?.unit ?? "");
        const { error: vErr } = await admin.from("user_vital_signs").insert({
          id: vitalId,
          user_id: userId,
          plan_id: planRow.id,
          submission_id: planRow.submission_id,
          label,
          unit,
          current_value: String(vital?.startValue ?? ""),
          target_value: String(vital?.targetValue ?? ""),
          status: "active",
          tracking_type: trackingType,
          last_checked_at: twoDaysAgo,
        });
        if (vErr) throw vErr;
        
        pendingVitalItems.push({
          id: vitalId,
          type: "vital",
          title: label,
          tracking_type: trackingType,
          unit,
        });
      }
    }

    // Pre-generate an investigation_state matching the seeded items so investigator can be tested in isolation.
    await admin.from("user_chat_states").upsert({
      user_id: userId,
      scope: "web",
      current_mode: "investigator",
      risk_level: 0,
      investigation_state: {
        status: "checking",
        // Put vitals first (matches production sort), then requested actions/frameworks count.
        pending_items: [...pendingVitalItems, ...pendingItems.slice(0, activeCount)],
        current_item_index: 0,
        temp_memory: { opening_done: false },
      },
    }, { onConflict: "user_id,scope" });
  }

  return { planRow, insertedActions: insertedActions ?? [] };
}

async function fetchPlanSnapshot(admin: any, userId: string): Promise<any> {
  const { data: planRow } = await admin
    .from("user_plans")
    .select("id,created_at,status,title,deep_why,inputs_why,inputs_context,inputs_blockers,content,submission_id,goal_id,current_phase,progress_percentage")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [{ data: actions }, { data: frameworks }] = await Promise.all([
    admin
      .from("user_actions")
      .select("id,title,description,status,tracking_type,time_of_day,target_reps,current_reps,last_performed_at,created_at")
      .eq("user_id", userId)
      .in("status", ["active", "pending"])
      .order("created_at", { ascending: true })
      .limit(50),
    admin
      .from("user_framework_tracking")
      .select("id,title,status,tracking_type,type,target_reps,current_reps,last_performed_at,created_at")
      .eq("user_id", userId)
      .in("status", ["active", "pending"])
      .order("created_at", { ascending: true })
      .limit(50),
  ]);

  const mappedFrameworks = (frameworks ?? []).map((f: any) => ({
    id: f.id,
    title: f.title,
    description: "",
    status: f.status,
    tracking_type: f.tracking_type,
    time_of_day: null,
    target_reps: f.target_reps ?? null,
    current_reps: f.current_reps ?? null,
    last_performed_at: f.last_performed_at ?? null,
    created_at: f.created_at ?? null,
    _kind: "framework",
    framework_type: f.type ?? null,
  }));

  return {
    plan: planRow ?? null,
    actions: [...(actions ?? []), ...mappedFrameworks],
    frameworks: frameworks ?? [],
  };
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
    suggested_replies: z.array(z.string().min(1)).max(10).optional(),
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
      // When running bilan/investigator scenarios, seed a plan with N active actions,
      // and optionally generate an investigation_state matching them.
      bilan_actions_count: z.number().int().min(0).max(20).default(0),
      // NEW: Enable testing of post-checkup deferrals.
      // If true: the user simulator will be instructed to say "on en reparle après" or similar
      // during the bilan, and the runner will NOT stop at the end of the bilan, but wait for the parking lot to clear.
      test_post_checkup_deferral: z.boolean().default(false),
      user_difficulty: z.enum(["easy", "mid", "hard"]).default("mid"),
      stop_on_first_failure: z.boolean().default(false),
      // cost control is currently an estimate; default is safe.
      budget_usd: z.number().min(0).default(0),
      // Always real AI: conversation + user simulation + judge.
      use_real_ai: z.boolean().default(true),
      model: z.string().optional(),
    })
    .default({
      max_scenarios: 10,
      max_turns_per_scenario: 8,
      bilan_actions_count: 0,
      user_difficulty: "mid",
      stop_on_first_failure: false,
      budget_usd: 0,
      use_real_ai: true,
    }),
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
    const body: z.infer<typeof BodySchema> = parsed.data as any;

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
    const evalModel = body.limits.model ?? EVAL_MODEL;
    const results: any[] = [];
    let stoppedReason: string | null = null;
    let totalEstimatedCostUsd = 0;
    let totalTokens = 0;
    let totalPromptTokens = 0;
    let totalOutputTokens = 0;

    // Build a single shared plan template for the whole run, reused across scenarios.
    // This prevents "plan per scenario" drift and reduces cost/time (one generate-plan call per run).
    const runPlanTemplate = await buildRunPlanTemplate({ url, anonKey, authHeader, requestId });

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
        await seedActivePlan(
          admin as any,
          testUserId,
          { url, anonKey, authHeader, requestId: scenarioRequestId },
          {
            bilanActionsCount: Number(body.limits.bilan_actions_count ?? 0) || 0,
            planTemplate: runPlanTemplate,
            includeVitalsInBilan:
              (Array.isArray((s as any)?.tags) && (s as any).tags.includes("bilan.vitals")) ||
              Boolean((s as any)?.assertions?.include_vitals_in_bilan),
          },
        );

        const { data: stBefore } = await admin.from("user_chat_states").select("*").eq("user_id", testUserId).eq("scope", "web").maybeSingle();
        // Print investigation_state before conversation transcript (much easier to debug bilan flows).
        if ((stBefore as any)?.investigation_state) {
          console.log(`[Eval] state_before.investigation_state: ${JSON.stringify((stBefore as any).investigation_state)}`);
        }
        const dashboardContext = await getDashboardContext(admin as any, testUserId);
        const planSnapshot = await fetchPlanSnapshot(admin as any, testUserId);

        const history: any[] = [];
        // UI control is the single source of truth for turn count.
        // (Scenario JSON used to carry max_turns, but it's intentionally ignored to avoid ambiguity.)
        const maxTurns = Number(body.limits.max_turns_per_scenario);

        // Always real AI in eval runner.
        const meta = { requestId: scenarioRequestId, forceRealAi: true, model: evalModel, channel: "web" as const, scope: "web" };

        // BILAN kickoff:
        // When bilan_actions_count > 0, we start the conversation as if the user just accepted the checkup ("oui").
        // This guarantees investigator opens with the first item immediately and matches expected product behavior.
        const bilanCount = Number(body.limits.bilan_actions_count ?? 0) || 0;
        const firstStepUser = Array.isArray(s.steps) && s.steps.length > 0 ? String(s.steps[0]?.user ?? "") : "";
        const shouldKickoff =
          bilanCount > 0 &&
          // If the scenario already starts with "bilan"/an affirmative, don't double-trigger.
          !(looksAffirmative(firstStepUser) || looksLikeCheckupIntent(firstStepUser));

        if (shouldKickoff) {
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

        if (Array.isArray(s.steps) && s.steps.length > 0) {
          for (const step of s.steps.slice(0, maxTurns)) {
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
                // Wait until investigation_state is FULLY cleared (meaning parking lot is empty).
                if (!stMid?.investigation_state) break;
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
            while (extraTurn < Math.max(0, maxTurns - (s.steps?.length ?? 0))) {
              const { data: stMid } = await admin
                .from("user_chat_states")
                .select("investigation_state")
                .eq("user_id", testUserId)
                .eq("scope", "web")
                .maybeSingle();
              if (!stMid?.investigation_state) break;

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
                  persona: s.persona ?? { label: "default", age_range: "25-50", style: "naturel" },
                  objectives: s.objectives ?? [],
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
          let turn = 0;
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
                    persona: s.persona ?? { label: "default", age_range: "25-50", style: "naturel" },
                    objectives: s.objectives ?? [],
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
                        : ""
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
          .eq("scope", "web")
          .order("created_at", { ascending: true })
          .limit(200);

        const transcript = (msgs ?? []).map((m: any) => ({
          role: m.role,
          content: m.content,
          created_at: m.created_at,
          agent_used: m.role === "assistant" ? m.agent_used : null,
        }));

        const { data: stAfter } = await admin.from("user_chat_states").select("*").eq("user_id", testUserId).eq("scope", "web").maybeSingle();

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
            force_real_ai: true,
            model: evalModel,
            transcript,
            state_before: stBefore ?? null,
            state_after: stAfter ?? null,
            config: {
              description: s.description ?? null,
              tags: s.tags ?? [],
              scenario_target: (s as any)?.scenario_target ?? null,
              limits: {
                bilan_actions_count: Number(body.limits.bilan_actions_count ?? 0) || 0,
                user_difficulty: body.limits.user_difficulty ?? "mid",
                model: evalModel,
              },
              plan_snapshot: {
                template_fingerprint: runPlanTemplate.templateFingerprint,
                dashboard_context: dashboardContext || "",
                ...planSnapshot,
              },
            },
            system_snapshot: {
              focus: (s as any)?.scenario_target ?? null,
              notes:
                "Judge context: routing lock during checkup is enforced in code (router hard guard). Do not invent modules not present in snapshot.",
            },
            // eval-judge schema: assertions is optional but NOT nullable.
            assertions: (s as any)?.assertions ?? undefined,
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

        const turnsExecuted = Array.isArray(transcript) ? transcript.filter((m: any) => m?.role === "user").length : 0;
        const bilanCompleted = bilanCount > 0 ? isBilanCompletedFromChatState(stAfter) : false;

        results.push({
          dataset_key: s.dataset_key,
          scenario_key: s.id,
          eval_run_id: judgeJson.eval_run_id,
          plan_template_fingerprint: runPlanTemplate.templateFingerprint,
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
      } finally {
        // Cleanup auth user (best effort)
        try {
          await (admin as any).auth.admin.deleteUser(testUserId);
        } catch {
          // ignore
        }
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
      plan_template_fingerprint: runPlanTemplate.templateFingerprint,
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


