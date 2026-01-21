import { backoffMs, clampInt, pickManyUnique, pickOne, sha256Hex, sleep, isUuidLike } from "./utils.ts";
import { PLAN_BANK } from "../plan_bank_index.ts";

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
      (resp.status >= 500 &&
        (lower.includes("resource exhausted") || lower.includes("overloaded") || lower.includes("unavailable") ||
          lower.includes("temporarily") || lower.includes("503") || msg.includes("429")));
    if (resp.ok && json && !json?.error) return json;
    if (!isRetryable || attempt >= MAX_RETRIES) {
      throw new Error(json?.error || `generate-plan failed (${resp.status})`);
    }
    await sleep(backoffMs(attempt));
  }
  throw new Error("generate-plan failed (retries exhausted)");
}

export type RunPlanTemplate = {
  fake: ReturnType<typeof buildFakeQuestionnairePayload>;
  planContentRaw: any;
  templateFingerprint: string;
  bank?: {
    id: string;
    theme_key: string;
    theme_id?: string | null;
    theme_title?: string | null;
    axis_id?: string | null;
    axis_title?: string | null;
    selected_problem_ids?: string[] | null;
  } | null;
};

export async function buildRunPlanTemplate(params: {
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
  return { fake, planContentRaw, templateFingerprint, bank: null };
}

export async function buildRunPlanTemplateFromBank(params: {
  requestId: string;
  themeKey?: string | null;
  required?: boolean;
}): Promise<RunPlanTemplate> {
  const themeKey = String(params.themeKey ?? "").trim() || null;
  const candidates = (PLAN_BANK ?? []).filter((j: any) => {
    const meta = (j?.meta && typeof j.meta === "object") ? j.meta : {};
    const tk = String(meta?.theme_key ?? j?.theme_key ?? "").trim();
    if (themeKey && tk !== themeKey) return false;
    return Boolean((j as any)?.plan_json);
  });

  if (candidates.length === 0) {
    const msg =
      `[run-evals] PLAN_BANK_EMPTY: No pre-generated plans found in plan_bank` +
      (themeKey ? ` for theme_key=${themeKey}` : "") +
      `. Generate them first (real Gemini), then rerun evals.`;
    if (params.required) throw new Error(msg);
    throw new Error(msg);
  }

  const picked = pickOne(candidates);
  const planContentRaw = picked.plan_json;
  const templateFingerprint =
    String(picked?.meta?.fingerprint ?? "").trim() ||
    (await sha256Hex(JSON.stringify(planContentRaw))).slice(0, 16);

  const fake = picked.fake ?? {
    inputs: {},
    currentAxis: {},
    answers: {},
    userProfile: {},
  };

  return {
    fake,
    planContentRaw,
    templateFingerprint,
    bank: {
      id: String(picked?.meta?.id ?? "plan_bank"),
      theme_key: String(picked?.meta?.theme_key ?? ""),
      theme_id: picked?.meta?.theme_id ?? null,
      theme_title: picked?.meta?.theme_title ?? null,
      axis_id: picked?.meta?.axis_id ?? null,
      axis_title: picked?.meta?.axis_title ?? null,
      selected_problem_ids: Array.isArray(picked?.meta?.selected_problem_ids) ? picked.meta.selected_problem_ids : null,
    },
  };
}

export async function seedActivePlan(
  admin: any,
  userId: string,
  env: { url: string; anonKey: string; authHeader: string; requestId: string },
  opts?: {
    // Back-compat: bilan uses this to request N active items to verify.
    bilanActionsCount?: number;
    // WhatsApp/onboarding can request an activation count independent of bilan.
    activeActionsCount?: number;
    planTemplate?: RunPlanTemplate;
    includeVitalsInBilan?: boolean;
    // Tool evals: seed explicit actions that must exist before the conversation starts (e.g. update_action tests).
    preseedActions?: Array<{
      title: string;
      description?: string;
      tips?: string;
      type?: "habit" | "mission";
      tracking_type?: "boolean" | "counter";
      target_reps?: number;
      time_of_day?: string;
      scheduled_days?: string[] | null;
      // Optional: seed as pending (so tools like activate_plan_action can be tested deterministically).
      status?: "active" | "pending";
    }>;
    // Investigator/tool evals: seed action history (ex: missed streak) to trigger flows like breakdown.
    preseedActionEntries?: Array<{
      title: string;
      status: "completed" | "missed" | "partial";
      // Number of consecutive days ending yesterday to seed.
      days: number;
      // Optional note to attach to each entry.
      note?: string;
    }>;
  },
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

  const activeCount = clampInt(
    (opts?.activeActionsCount ?? opts?.bilanActionsCount ?? 0),
    0,
    20,
    0,
  );
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

  // Optional: inject explicit preseed actions into phase 1 and user_actions.
  // This is used by tool tests that must update an existing action rather than create it.
  const preseed = Array.isArray(opts?.preseedActions) ? opts!.preseedActions! : [];
  if (preseed.length > 0) {
    const phases = ((planContent as any)?.phases ?? []) as any[];
    const phase1 = phases.find((p: any) => Number(p?.id) === 1) ?? phases[0];
    if (phase1 && typeof phase1 === "object") {
      if (!Array.isArray((phase1 as any).actions)) (phase1 as any).actions = [];
      for (const a of preseed) {
        const id = crypto.randomUUID();
        const tRaw = String(a?.type ?? "habit").toLowerCase();
        const planType = tRaw === "mission" ? "mission" : "habitude";
        const trackingType = String(a?.tracking_type ?? "boolean") === "counter" ? "counter" : "boolean";
        const timeOfDay = String(a?.time_of_day ?? "any_time");
        const targetReps = planType === "habitude" ? clampInt(a?.target_reps ?? 3, 1, 7, 3) : 1;
        const status = (String((a as any)?.status ?? "active").toLowerCase() === "pending") ? "pending" : "active";
        const scheduled =
          Array.isArray(a?.scheduled_days)
            ? a!.scheduled_days
            : (Array.isArray((a as any)?.scheduledDays) ? (a as any).scheduledDays : undefined);
        (phase1 as any).actions.unshift({
          id,
          type: planType,
          title: String(a?.title ?? "Action"),
          description: String(a?.description ?? ""),
          tips: String(a?.tips ?? ""),
          status,
          questType: "main",
          targetReps,
          time_of_day: timeOfDay,
          tracking_type: trackingType,
          isCompleted: false,
          // Plan JSON uses camelCase; we also keep a snake_case mirror for legacy/defensive reads.
          ...(scheduled ? { scheduledDays: scheduled, scheduled_days: scheduled } : {}),
        });
      }
      // Ensure phase 1 itself is active.
      (phase1 as any).status = "active";
    }
  }
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

  // Mirror preseed actions in user_actions so tools can find/update them through DB access.
  // IMPORTANT: If activeCount > 0, we will insert the "itemsToCheck" into user_actions later (bilan seeding),
  // and preseed actions are part of the plan's active items. Mirroring here would duplicate PKs.
  if (preseed.length > 0 && activeCount === 0) {
    const phases = ((planContent as any)?.phases ?? []) as any[];
    const phase1 = phases.find((p: any) => Number(p?.id) === 1) ?? phases[0];
    const phase1Actions = Array.isArray(phase1?.actions) ? phase1.actions : [];
    // IMPORTANT: only mirror ACTIVE preseed actions into user_actions.
    // Pending preseed actions are meant to exist in plan JSON only, so tools like activate_plan_action can insert them.
    const seeded = phase1Actions.filter((x: any) => (
      String((x as any)?.status ?? "").toLowerCase() === "active" &&
      preseed.some((p: any) => String(p?.title ?? "") === String(x?.title ?? ""))
    ));
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const rows = seeded.map((x: any) => {
      const rawType = String(x?.type ?? "").toLowerCase();
      const t = rawType === "habitude" ? "habit" : "mission";
      const trackingType = String(x?.tracking_type ?? "boolean") === "counter" ? "counter" : "boolean";
      const timeOfDay = String(x?.time_of_day ?? "any_time");
      const targetReps = t === "habit" ? clampInt(x?.targetReps ?? 3, 1, 7, 3) : 1;
      const scheduledDays =
        Array.isArray((x as any)?.scheduledDays)
          ? ((x as any).scheduledDays as string[])
          : (Array.isArray((x as any)?.scheduled_days) ? ((x as any).scheduled_days as string[]) : null);
      return {
        id: String(x?.id ?? crypto.randomUUID()),
        user_id: userId,
        plan_id: planRow.id,
        submission_id: planRow.submission_id,
        type: t,
        title: String(x?.title ?? "Action"),
        description: String(x?.description ?? ""),
        target_reps: targetReps,
        current_reps: 0,
        status: "active",
        tracking_type: trackingType,
        time_of_day: timeOfDay,
        ...(scheduledDays ? { scheduled_days: scheduledDays } : {}),
        last_performed_at: twoDaysAgo,
      };
    });
    if (rows.length > 0) {
      const { error } = await admin.from("user_actions").insert(rows);
      if (error) throw error;
    }
  }

  // Optional: seed action entries (history) for specific actions by title.
  const preseedEntries = Array.isArray(opts?.preseedActionEntries) ? opts!.preseedActionEntries! : [];
  if (preseedEntries.length > 0) {
    try {
      const { data: actions } = await admin
        .from("user_actions")
        .select("id,title")
        .eq("user_id", userId)
        .in("status", ["active", "pending"])
        .limit(80);
      const byTitle = new Map<string, { id: string; title: string }>();
      for (const a of (actions ?? []) as any[]) {
        const t = String(a?.title ?? "").trim();
        if (t) byTitle.set(t.toLowerCase(), { id: String(a?.id), title: t });
      }
      const rows: any[] = [];
      for (const spec of preseedEntries) {
        const t = String(spec?.title ?? "").trim();
        if (!t) continue;
        const found = byTitle.get(t.toLowerCase());
        if (!found?.id) continue;
        const days = clampInt(Number(spec?.days ?? 0), 0, 30, 0);
        const status = String(spec?.status ?? "missed");
        if (!days) continue;
        // Seed consecutive days ending yesterday (local-ish, but good enough for tests).
        for (let i = days; i >= 1; i--) {
          const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
          // Use midday UTC to avoid DST edge cases; day is derived by split("T")[0].
          d.setUTCHours(12, 0, 0, 0);
          rows.push({
            user_id: userId,
            action_id: found.id,
            action_title: found.title,
            status,
            value: null,
            note: spec?.note ?? null,
            performed_at: d.toISOString(),
            embedding: null,
          });
        }
      }
      if (rows.length > 0) {
        const { error } = await admin.from("user_action_entries").insert(rows);
        if (error) throw error;
      }
    } catch (e) {
      console.error("[seedActivePlan] preseedActionEntries failed (non-fatal):", e);
    }
  }

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
        const targetReps = t === "habit" ? clampInt(a?.targetReps ?? 1, 1, 7, 1) : 1;
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
        const targetReps = clampInt(a?.targetReps ?? 1, 1, 7, 1);
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
      const { data: ins2, error: fillErr } = await admin.from("user_actions").insert(fillerRows).select(
        "id,title,description,tracking_type,target_reps",
      );
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

export async function fetchPlanSnapshot(admin: any, userId: string): Promise<any> {
  const { data: planRow } = await admin
    .from("user_plans")
    .select(
      "id,created_at,status,title,deep_why,inputs_why,inputs_context,inputs_blockers,content,submission_id,goal_id,current_phase,progress_percentage",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [{ data: actions }, { data: frameworks }] = await Promise.all([
    admin
      .from("user_actions")
      .select("id,title,description,status,tracking_type,time_of_day,target_reps,current_reps,last_performed_at,scheduled_days,created_at")
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
    scheduled_days: null,
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


